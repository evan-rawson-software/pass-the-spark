import Phaser from "phaser";
import { getOpenEnds, getPendingChoice, previewCascade, previewPlay, step } from "../engine/battle";
import type { Board, BattleState, Choice, PendingChoice } from "../engine/battle";
import { getView } from "../engine/view";
import type { BattleView, OpenEndView } from "../engine/view";
import type { Domino, Intent, Passive } from "../engine/types";
import type { GameEvent } from "../engine/events";
import type { Client } from "../net/client";
import type { Host } from "../net/host";
import type { HostMessage, PingTarget } from "../net/protocol";
import { relay } from "./relay";
import { watchLink } from "./linkBanner";
import { currentRun, openRunScreen, runSeed, setRun, startSingleRun } from "./runSession";
import { applyRunChoice } from "../engine/run";
import { artBackground, artImage } from "./art";
import { drawDomino, drawEffectIcon, drawSparkGlyph, iconOf } from "./dominoDrawing";
import type { DominoState, IconKind } from "./dominoDrawing";
import { SPARK_STYLE } from "./sparks";
import { seatColour } from "./seatColours";
import { drawBlessedGlow } from "./sparkShrineArt";
import { drawNodeIcon, NODE_STYLE } from "./nodeIcon";
import { Tooltip } from "./tooltip";
import type { TipPreview } from "./tooltip";
import { charmWithTip, charmsByIds } from "./charmUi";
import { drawPadlock, drawPassiveIcon } from "./passiveIcon";
import { battleDeckPlayers, openDeckViewer } from "./deckViewer";
import { button } from "./ui";
import { PingMarks, attachHold, pingKey } from "./ping";
import { devSettings, enemies, startBattle } from "./devBattle";
import type { GameSettings } from "./devBattle";
import { eventDelay, newLogMemory, trackEvent } from "./eventLog";
import { debugPanel } from "./DebugPanel";
import type { DebugHost } from "./DebugPanel";
import { SPEEDS, getPlaybackSpeed, onPlaybackSpeedChange, scaleTime, setPlaybackSpeed } from "./playbackSpeed";
import { Animator, animTime, newRefs, paintBar } from "./animations";
import { applyEvent, startShown } from "./shownView";
import { drawDeckStack, isDrawEvent, playDraws } from "./drawAnimation";
import type { ShownTable } from "./shownView";

// The combat table. Draws everything from getView (and getPendingChoice for
// whose turn it is and which dominoes are playable, getOpenEnds for the charge on each open end,
// previewPlay and previewCascade for the previews). No rules live here: layout only.
// Clicking (or dragging) submits only choices getPendingChoice offers, then the step's events play back
// in order (see playback below), animated by animations.ts. Tooltips come from tooltip.ts.
//
// Run mode (#50): started with { run: true }, the battle is the current run's. Choices go to
// applyRunChoice, and when the battle is over the run's phase says which screen opens next.
// Online (#49) a run's battle is the same online table as below; when it ends, the screen for the
// run's new phase (which the host's run update has already set) opens after a short pause.
//
// One scene serves both modes (#34). Single player owns the BattleState and steps it itself.
// Online, the scene never has a BattleState: it holds the latest BattleView and plays back the
// events the host sends, on the host's machine too (the host's own player gets its messages by
// the same path). Choices go to the host, which checks them; the table stays locked until its
// reply (an update, or an error) arrives. Your own hand is in front; teammates are at the sides.

// What the lobby hands over to start an online battle.
export interface OnlineData {
  host?: Host; // set on the host's machine
  client?: Client; // set on a joining player's machine
  seat: string; // this player's seat
  view: BattleView; // the first view
  names: Record<string, string>; // seat -> name
  roomCode: string;
}

type Update = Extract<HostMessage, { type: "update" }>;

type Layer = Phaser.GameObjects.Container;
interface Box { x: number; y: number; w: number; h: number } // centred on x, y

const DW = 240; // a domino at scale 1 (see dominoDrawing.ts)
const DH = 120;
const FONT = "Arial, Helvetica, sans-serif";

// Table regions (1920x1080).
const MAT = { x: 370, y: 400, w: 1180, h: 360 }; // the board (this.mat: see matFor)
const HAND = { x: 370, y: 785, w: 1180, h: 265 }; // the active hand
const LEFT_X = 30;
const RIGHT_X = 1565;
const SIDE_W = 310;
const SIDE_TOP = 330;
const SIDE_H = 450;
// The board mat. At 2 players only the left side column holds a hand (W6), so the mat runs on into the right column's room.
function matFor(players: number): typeof MAT {
  return players === 2 ? { ...MAT, w: RIGHT_X + SIDE_W - 15 - MAT.x } : MAT;
}

const GOLD = 0xffe14d;
const RED = 0xe0443e;

export class CombatScene extends Phaser.Scene {
  private state: BattleState | null = null; // single player only
  private view!: BattleView; // what the table shows when no step is being played back
  private online: OnlineData | null = null;
  private waiting = false; // online: a choice was sent and the host has not answered yet
  private queue: Update[] = []; // online: updates not played back yet
  private draining = false;
  private pauseUi: Phaser.GameObjects.GameObject[] = []; // online: "Waiting for [name]" and "Play for [name]"
  private layer?: Layer;
  private locked = false; // true while events play back: no input
  private selected: string | null = null; // a clicked hand domino, waiting for an open end
  private hoverUi?: Phaser.GameObjects.Container; // the end highlights and previews of the hovered hand domino
  private slotBoxes = new Map<number | "opener", Box>(); // where each open end (and the opener slot) is drawn, for hints and drops
  private drag: { id: string; x: number; y: number; ghost?: Phaser.GameObjects.Container } | null = null; // a hand domino pressed (and maybe being dragged)
  private dragMoved = false; // the last press turned into a drag: it is not a tap
  // During playback the table keeps showing the state from before the step; these two follow the
  // events: the seat that is highlighted, and the player whose hand is in front.
  private hlSeat: string | null = null;
  private handSeat: string | null = null;
  private settings!: GameSettings;
  private seed = 0;
  private tooltip!: Tooltip;
  private pings!: PingMarks; // online only: rings from other players' pings
  private pingBoxes = new Map<string, Phaser.GameObjects.Container>(); // pingKey -> that domino or open end
  private anim!: Animator;
  private shown: ShownTable | null = null; // the table part-way through a step; null when idle
  private epoch = 0; // bumped when the scene is created or shut down, so a stale playback stops
  private inRun = false; // single player inside a run
  private fromQuery = false; // the setup came from the dev query params

  constructor() {
    super("combat");
  }

  // Started by the start or end screen with { settings, seed }. With no data
  // (page opened with dev query params) the setup comes from the query.
  create(data: { settings?: GameSettings; seed?: number; devQuery?: boolean; online?: OnlineData; run?: boolean }): void {
    const query = new URLSearchParams(window.location.search);
    const dev = devSettings(query);
    const stopSpeed = onPlaybackSpeedChange(() => this.redraw()); // the menu can change the speed: keep the quick control in step
    this.events.once("shutdown", stopSpeed);
    this.epoch++;
    this.online = data.online ?? null;
    this.inRun = data.run === true;
    this.state = null;
    this.waiting = false;
    this.queue = [];
    this.draining = false;
    this.fromQuery = !this.online && !this.inRun && (!data.settings || data.devQuery === true);
    this.settings = data.settings ?? dev.settings;
    this.seed = this.inRun ? runSeed() : data.seed ?? dev.seed;
    this.layer = undefined;
    this.shown = null;
    this.drawTable();
    this.anim = new Animator(this);
    this.locked = false;
    this.selected = null;
    this.drag = null;
    this.dragMoved = false;
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onDragMove(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onDragEnd(p));
    this.hlSeat = null;
    this.handSeat = null;
    this.tooltip = new Tooltip(this);
    this.tooltip.avoid = { x: HAND.x + HAND.w - 340, y: HAND.y - 30, w: 340, h: 60 }; // Pass and Set off
    this.pings = new PingMarks(this);
    if (this.online) {
      this.setView(this.online.view);
      const handler = (m: HostMessage) => this.onMessage(m);
      relay.handler = handler;
      watchLink(this, this.online.client);
      this.pauseUi = [];
      this.drawPause();
      this.events.once("shutdown", () => {
        if (relay.handler === handler) relay.handler = null;
      });
    } else if (this.inRun) {
      this.setState(currentRun().battle!);
    } else {
      this.setState(startBattle(this.settings, this.seed, this.fromQuery ? query : undefined));
    }
    void this.introDraw();
    // The debug panel is for single player and the host; a joined client has none.
    const online = this.online;
    const host: DebugHost | null =
      online && !online.host
        ? null
        : {
            getState: () => this.state ?? online?.host?.getState() ?? null,
            getSeed: () => this.seed,
            readOnly: online !== null,
            isLocked: () => this.locked,
            restart: (seed) => {
              // In a run, a new seed starts a new run with the same names.
              if (this.inRun) {
                startSingleRun(currentRun().players, seed);
                openRunScreen(this);
              } else this.scene.restart({ settings: this.settings, seed, devQuery: this.fromQuery });
            },
            setState: (state) => {
              // In a run, charms given in the panel stay for the rest of the run.
              if (this.inRun) setRun({ ...currentRun(), battle: state, charms: Object.fromEntries(state.players.map((p) => [p.id, p.charms])) });
              this.setState(state);
            },
            redraw: () => this.redraw(),
          };
    if (host) debugPanel.attach(host);
    this.events.once("shutdown", () => {
      this.epoch++;
      if (host) debugPanel.detach(host);
    });
  }

  // A fresh battle opens with the round 1 draw already done (no events come with it), so show it
  // from the view: every hand starts empty and fills from its deck stack.
  private async introDraw(): Promise<void> {
    const view = this.view;
    if (view.round !== 1 || view.result || view.board.nodes.length > 0 || view.players.some((p) => p.discard.length > 0)) return;
    const empty = JSON.parse(JSON.stringify(view)) as BattleView;
    const events: GameEvent[] = [];
    for (const p of empty.players) {
      events.push({ type: "draw", player: p.id, count: p.hand.length, dominoes: p.hand });
      p.deck = p.hand.concat(p.deck);
      p.hand = [];
    }
    const epoch = this.epoch;
    // The intro holds the same lock as a playback (draining), so an update that arrives meanwhile
    // waits in the queue and is played right after.
    this.draining = true;
    this.locked = true;
    this.shown = startShown(empty);
    this.redraw();
    await playDraws(this, () => this.anim.refs, view.dominoes, events, this.shown, () => this.redraw());
    if (epoch !== this.epoch) return;
    this.locked = false;
    this.shown = null;
    this.draining = false;
    this.redraw();
    void this.drain();
  }

  // Single player: the one entry point for new state.
  setState(state: BattleState): void {
    this.state = state;
    this.setView(getView(state, state.seat)); // the seat on turn: Spyglass and the open ends follow it
  }

  // The one entry point for a new view (single player: from setState; online: from the host).
  private setView(view: BattleView): void {
    this.view = view;
    this.redraw();
    debugPanel.stateChanged();
    if (view.result) {
      // Leave the final table up for a moment, then show the end screen.
      const online = this.online;
      if (this.inRun) {
        this.time.delayedCall(1500, () => openRunScreen(this));
        return;
      }
      this.time.delayedCall(1500, () =>
        this.scene.start("end", {
          won: view.result === "won",
          rounds: view.round,
          seed: this.seed,
          settings: this.settings,
          online: online ? { host: online.host, client: online.client, roomCode: online.roomCode, names: online.names } : undefined,
        }),
      );
    }
  }

  // A seat's display name. Online it is the player's name; single player the seat id is the name.
  private nameOf(seat: string, forPlate = true, max = 12): string {
    const name = this.online?.names[seat] ?? seat;
    return forPlate && name.length > max ? name.slice(0, max - 1) + "…" : name;
  }

  // ---- online: messages from the host ----

  private onMessage(m: HostMessage): void {
    if (m.type === "update") {
      this.waiting = false;
      this.queue.push(m);
      void this.drain();
    } else if (m.type === "runUpdate") {
      // runSession already has the new run. If the battle ended while this table was not told (we were
      // away), move on; otherwise the last update is still playing and the table moves on after it.
      if (this.inRun && m.view.phase !== "battle" && !this.draining && !this.locked) openRunScreen(this);
    } else if (m.type === "ping") {
      this.pings.show(m.seat, m.name, m.target);
    } else if (m.type === "error") {
      // The host rejected the choice: say so briefly and unlock.
      this.waiting = false;
      this.showError(m.message);
      if (!this.locked) this.redraw();
    } else if (m.type === "paused" || m.type === "presence" || m.type === "playing-for") {
      // relay has kept it; show it.
      this.drawPause();
      if (!this.locked) this.redraw();
    }
    // "lobby" is kept in relay.lobby and acted on by the end screen.
  }

  // Online: the seat this machine's player is acting as right now. Normally their own; the host
  // also acts as an away player's seat once it has taken over for them (and only on that seat's turn).
  private mySeat(): string {
    const pending = getPendingChoice(this.view);
    if (relay.playingFor !== null && pending?.player === relay.playingFor) return relay.playingFor;
    return this.online!.seat;
  }

  private isAway(seat: string): boolean {
    return relay.roster?.players.find((p) => p.seat === seat)?.away === true;
  }

  // A seat's name for its plate on the table, marked when the player is away.
  private plateName(seat: string, max = 12): string {
    return this.nameOf(seat, true, max) + (this.online && this.isAway(seat) ? " (away)" : "");
  }

  // The pause across the top: everyone sees who the game is waiting for; the host may get a button.
  private drawPause(): void {
    this.pauseUi.forEach((o) => o.destroy());
    this.pauseUi = [];
    const paused = relay.paused;
    if (!this.online || !paused || paused.waitingFor === null) return;
    const style = { fontFamily: FONT, fontSize: "30px", color: "#ffd0cc", fontStyle: "bold", backgroundColor: "#0d2a20", padding: { x: 24, y: 10 } };
    this.pauseUi.push(this.add.text(900, 268, `Waiting for ${paused.waitingFor} to reconnect...`, style).setOrigin(0.5).setDepth(900));
    const seat = paused.playFor;
    const host = this.online.host;
    if (host && seat) {
      const name = relay.roster?.players.find((p) => p.seat === seat)?.name ?? seat;
      this.pauseUi.push(button(this, 1400, 268, `Play for ${name}`, () => host.playFor(seat), { size: 30, origin: 0.5 }).setDepth(900));
    }
  }

  // Hold on a domino: the host checks it and sends the ring to everyone (this player included).
  private sendPing(target: PingTarget): void {
    const online = this.online;
    if (!online) return;
    if (online.host) online.host.submitLocalPing(target);
    else online.client?.sendPing(target);
  }

  private showError(message: string): void {
    const t = this.add
      .text(HAND.x + HAND.w / 2, HAND.y - 14, `The host says: ${message}`, { fontFamily: FONT, fontSize: "26px", color: "#ff9a94", stroke: "#101010", strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(600);
    this.time.delayedCall(3000, () => t.destroy());
  }

  // Plays the received updates one after another, each at this player's playback speed.
  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    const epoch = this.epoch;
    while (this.queue.length > 0) {
      const update = this.queue.shift()!;
      const finished = await this.playback(update.events);
      if (!finished || epoch !== this.epoch) return;
      this.setView(update.view);
    }
    this.draining = false;
  }

  // ---- the one redraw ----

  private redraw(): void {
    this.tooltip.hide();
    this.clearHover();
    this.layer?.destroy(true);
    const layer = this.add.container(0, 0);
    this.layer = layer;
    const now = this.view;
    const view = this.shown?.view ?? now;
    this.anim.refs = newRefs();
    this.anim.refs.layer = layer;
    this.pingBoxes = new Map();
    let pending = this.locked || this.waiting ? null : getPendingChoice(now);
    // Online, only the player whose turn it is gets anything to click.
    if (this.online && pending !== null && pending.player !== this.mySeat()) pending = null;
    if (this.selected !== null && !pending?.plays.some((o) => o.domino === this.selected)) this.selected = null;
    // Single player: the front hand follows whoever's turn it is. Online: it is always your own.
    const active = this.online ? this.mySeat() : (this.handSeat ?? now.seat);
    const turn = this.hlSeat ?? now.seat;

    this.drawMat(layer, view);
    this.drawEnemy(layer, view);
    this.drawHud(layer, view, turn);
    this.drawParty(layer, view);
    this.drawTotals(layer, view);
    this.drawBoard(layer, view, active, pending);
    this.drawActiveHand(layer, view, active, pending, turn);
    if (this.selected !== null) this.showHints(layer, this.selected);
    this.drawSpeedControl(layer);
    let others = view.players.filter((p) => p.id !== active);
    if (this.online) {
      // Teammates in seat order, starting with the one after you.
      const i = view.players.findIndex((p) => p.id === active);
      others = [...view.players.slice(i + 1), ...view.players.slice(0, i)];
    }
    others.forEach((p, i) => {
      // Left column takes the 1st and 3rd teammate, the right column the 2nd.
      const left = i !== 1;
      const sharing = left && others.length > 2;
      const h = sharing ? SIDE_H / 2 : SIDE_H;
      const y = SIDE_TOP + (sharing && i === 2 ? SIDE_H / 2 : 0);
      this.drawTeammate(layer, view, p.id, left ? LEFT_X : RIGHT_X, y, h);
    });
    this.pings.place(this.pingBoxes);
  }

  // A player's hand slots as drawn, for the draw animation.
  private slotsOf(seat: string): { c: Phaser.GameObjects.Container; pos: { x: number; y: number; k: number } }[] {
    const slots = this.anim.refs.handSlots;
    if (!slots.has(seat)) slots.set(seat, []);
    return slots.get(seat)!;
  }

  // ---- table (drawn once) ----

  private drawTable(): void {
    // With a background image (added first, so behind everything) the frame, felt and pool of light
    // give way to it.
    const hasArt = artBackground(this, "combat");
    const g = this.add.graphics();
    if (!hasArt) {
      g.fillStyle(0x2e2016, 1);
      g.fillRect(0, 0, 1920, 1080);
      g.fillStyle(0x4a3322, 1);
      g.fillRoundedRect(8, 8, 1904, 1064, 150);
      g.fillStyle(0x1e5a42, 1);
      g.fillRoundedRect(28, 28, 1864, 1024, 130);
      g.lineStyle(4, 0x2f7a5b, 1);
      g.strokeRoundedRect(44, 44, 1832, 992, 116);
      // A soft pool of light and the board mat: felt markings, not boxes.
      g.fillStyle(0x246b4f, 0.55);
      g.fillEllipse(960, 560, 1500, 700);
    }
  }

  // The board mat, drawn with the table's contents so it follows the party size.
  private drawMat(layer: Layer, view: BattleView): void {
    const m = matFor(view.players.length);
    const g = this.gfx(layer);
    g.fillStyle(0x174c38, 0.6);
    g.fillRoundedRect(m.x, m.y, m.w, m.h, 60);
    g.lineStyle(3, 0x2f7a5b, 0.7);
    g.strokeRoundedRect(m.x, m.y, m.w, m.h, 60);
  }

  // ---- small helpers ----

  private label(layer: Layer, x: number, y: number, text: string, size: number, color = "#ffffff", originX = 0, bold = false): Phaser.GameObjects.Text {
    const t = this.add
      .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? "bold" : "normal" })
      .setOrigin(originX, 0.5);
    layer.add(t);
    return t;
  }

  private gfx(layer: Layer): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    layer.add(g);
    return g;
  }

  // A code-drawn effect icon centred on x, y, `s` times its natural size (about 52 units across).
  private icon(layer: Layer, kind: IconKind, x: number, y: number, s: number): void {
    const g = this.add.graphics().setPosition(x, y).setScale(s);
    drawEffectIcon(g, kind);
    layer.add(g);
  }

  private dominoOf(id: string): Domino {
    return this.view.dominoes.find((q) => q.id === id) ?? this.view.dominoes[0];
  }

  private domino(layer: Layer, id: string, k: number, state: DominoState, x: number, y: number, onClick?: () => void, ping?: PingTarget): Phaser.GameObjects.Container {
    const d = this.dominoOf(id);
    const c = drawDomino(this, d, "large", state);
    c.setScale(k);
    c.setPosition(x, y);
    layer.add(c);
    // Every face-up domino has a tooltip. Only a playable domino in the active hand gets the
    // engine's "if played now" numbers, worked out from the view (online players have nothing else).
    this.tooltip.attach(c, d, state === "playable" ? () => this.tipPreviews(d.id) : undefined);
    if (this.online && ping) {
      // Online, a visible domino can be pinged by holding on it. A tap (the normal click) then
      // fires on release instead of on press, so a hold never also plays the domino.
      this.pingBoxes.set(pingKey(ping), c);
      if (!c.input) c.setInteractive();
      attachHold(this, c, () => this.sendPing(ping), onClick);
      if (onClick) c.input!.cursor = "pointer";
    } else if (onClick) {
      c.setInteractive({ useHandCursor: true });
      c.on("pointerdown", onClick);
    }
    return c;
  }

  // What playing a hand domino would do on each end it fits, for its tooltip. All numbers come from
  // previewPlay, with the player whose turn it is (their charms count).
  private tipPreviews(id: string): TipPreview[] {
    const pending = getPendingChoice(this.view);
    const option = pending?.plays.find((o) => o.domino === id);
    if (!pending || !option) return [];
    const targets: (number | undefined)[] = pending.opener ? [undefined] : option.ends;
    const out: TipPreview[] = [];
    for (const end of targets) {
      const preview = previewPlay(this.view, pending.player, id, end);
      if (preview) out.push({ where: end === undefined ? "Opener" : `${this.view.board.ends[end].spark} end`, preview });
    }
    return out;
  }

  private bar(layer: Layer, key: string, x: number, y: number, w: number, h: number, value: number, max: number, color: number): void {
    const g = this.gfx(layer);
    const text = this.label(layer, x + w / 2, y + h / 2, "", Math.round(h * 0.6), "#ffffff", 0.5, true);
    const ref = { g, text, x, y, w, h, max, color };
    this.anim.refs.bars.set(key, ref);
    paintBar(ref, value);
  }

  private shield(layer: Layer, key: string, x: number, y: number, s: number, amount: number): void {
    const g = this.gfx(layer);
    g.fillStyle(0x4a6fa5, 1);
    g.lineStyle(3, 0x1c2b44, 1);
    const pts = [[-1, -1], [1, -1], [1, 0.1], [0, 1.1], [-1, 0.1]].map(([a, b]) => new Phaser.Math.Vector2(x + a * s * 0.5, y + b * s * 0.5));
    g.fillPoints(pts, true);
    g.strokePoints(pts, true);
    const text = this.label(layer, x + s * 0.5 + 8, y, String(amount), Math.round(s * 0.7), "#dbe6f5", 0, true);
    this.anim.refs.shields.set(key, { text, x, y });
  }

  // A seat's name plate; the seat on turn glows.
  // A seat id as `deckSeat` makes the plate open that player's deck (#171).
  private plate(layer: Layer, cx: number, cy: number, text: string, onTurn: boolean, fontSize = 26, deckSeat?: string, colour?: number): void {
    const t = this.label(layer, cx, cy, text, fontSize, onTurn ? "#2a2200" : "#ffffff", 0.5, true);
    const w = t.width + 36;
    const h = fontSize + 18;
    const g = this.add.graphics();
    if (onTurn) {
      for (let i = 4; i >= 1; i--) {
        g.lineStyle(i * 5, colour ?? GOLD, 0.14);
        g.strokeRoundedRect(cx - w / 2 - i * 2, cy - h / 2 - i * 2, w + i * 4, h + i * 4, h / 2 + i * 2);
      }
    }
    g.fillStyle(onTurn ? GOLD : 0x0d2a20, 0.95);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);
    if (colour !== undefined) {
      // The seat's colour rims the plate (thicker on the seat on turn).
      g.lineStyle(onTurn ? 5 : 3, colour, 1);
      g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);
    }
    layer.add(g);
    layer.bringToTop(t);
    if (deckSeat !== undefined) this.deckZone(layer, cx, cy, w, h, deckSeat);
  }

  // A click area that opens the deck viewer on one player's tab. The viewer shows everyone's deck.
  private deckZone(layer: Layer, cx: number, cy: number, w: number, h: number, seat: string): void {
    const z = this.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true });
    z.on("pointerdown", () => openDeckViewer(this, battleDeckPlayers(this.view, (id) => this.nameOf(id, false)), seat));
    layer.add(z);
  }

  // A seat's charm icons in a row centred under its name plate (#108, #155); nothing when it holds none.
  // The icons register with the animator so the charm flash plays on them.
  private plateCharms(layer: Layer, seat: string, ids: string[], cx: number, y: number, size: number, centred = true): void {
    const charms = charmsByIds(ids);
    const step = Math.min(size + 6, (SIDE_W - size) / Math.max(1, charms.length - 1));
    const x0 = centred ? cx - ((charms.length - 1) * step) / 2 : cx;
    charms.forEach((ch, i) => {
      const c = charmWithTip(this, this.tooltip, ch, size, x0 + i * step, y);
      layer.add(c);
      this.anim.refs.charms.set(`${seat}:${ch.id}`, { x: x0 + i * step, y });
    });
  }

  // ---- enemy (top) ----

  private drawEnemy(layer: Layer, view: BattleView): void {
    const e = view.enemy;
    const def = enemies.find((x) => x.id === e.id);
    // The portrait, if there is one, fills the free space on the right of the panel.
    artImage(this, `enemies/${e.id}`, 1410, 165, 250, 250, layer);
    // The tier is an icon (the map's stop icons) beside the name; long names shrink to leave it room.
    const ICON = 48;
    const title = this.label(layer, 60 + ICON + 12, 62, def?.name ?? e.id, 48, "#ffffff", 0, true);
    if (title.width > 450 - ICON - 12) title.setFontSize(Math.floor((48 * (450 - ICON - 12)) / title.width)); // stays clear of the intent card
    if (def) {
      const stop = def.tier === "basic" ? "fight" : def.tier;
      const g = this.gfx(layer);
      g.fillStyle(NODE_STYLE[stop].color, 1);
      g.fillCircle(60 + ICON / 2, 62, ICON / 2);
      g.lineStyle(2, 0xf4ecd8, 1);
      g.strokeCircle(60 + ICON / 2, 62, ICON / 2);
      drawNodeIcon(g, stop, 60 + ICON / 2, 62, ICON / 2);
      const hit = this.add.circle(60 + ICON / 2, 62, ICON / 2, 0, 0);
      layer.add(hit);
      this.tooltip.attachLines(hit, [{ text: def.tier === "basic" ? "Normal enemy" : NODE_STYLE[stop].name, style: "title" }]);
    }
    this.bar(layer, "enemy", 60, 112, 400, 40, e.health, e.maxHealth, RED);
    this.shield(layer, "enemy", 80, 208, 40, e.block);
    e.passives.forEach((p, i) => this.drawPassive(layer, p, 230 + i * 130, 245));
    e.passives.forEach((p) => {
      // Wrapped to stay left of the intent card.
      if (p.text) this.label(layer, 60, 284, p.text, 18, "#ffe14d", 0, false).setOrigin(0, 0).setWordWrapWidth(440);
    });
    this.drawIntent(layer, view);
  }

  // The enemy's intent, Slay the Spire style: an icon and a number for each action (a sword for an
  // attack, ×N for several hits, a shield for block). Spyglass holders also see the next rounds, smaller.
  private drawIntent(layer: Layer, view: BattleView): void {
    const card = { x: 540, y: 40, w: 720, h: 200 };
    const g = this.gfx(layer);
    g.fillStyle(0x0d2a20, 0.8);
    g.fillRoundedRect(card.x, card.y, card.w, card.h, 40);
    g.lineStyle(4, RED, 0.9);
    g.strokeRoundedRect(card.x, card.y, card.w, card.h, 40);
    this.label(layer, card.x + 36, card.y + 30, "INTENT", 22, "#ff9a94", 0, true);
    this.anim.refs.intent = { x: card.x, y: card.y, w: card.w, h: card.h };
    const widthOf = (intent: Intent, s: number) => intent.actions.length * 230 * s;
    this.intentItems(layer, view.intent, card.x + (card.w - widthOf(view.intent, 1)) / 2, card.y + 115, 1);
    if (view.upcomingIntents.length > 0) {
      let x = card.x;
      this.label(layer, x - 10, 282, "Later", 20, "#9fd1b8", 1, true);
      for (const intent of view.upcomingIntents) {
        this.intentItems(layer, intent, x + 20, 282, 0.5);
        x += widthOf(intent, 0.5) + 40;
      }
    }
  }

  // One intent's actions laid out from x, centred on y, at `s` times full size.
  private intentItems(layer: Layer, intent: Intent, x: number, y: number, s: number): void {
    intent.actions.forEach((a, i) => {
      const cx = x + i * 230 * s;
      this.icon(layer, a.kind === "attack" ? "damage" : "block", cx + 50 * s, y, 1.6 * s);
      const num = this.label(layer, cx + 110 * s, y, String(a.value), Math.round(76 * s), "#ffffff", 0, true);
      if (a.kind === "attack" && (a.hits ?? 1) > 1) this.label(layer, num.x + num.width + 6 * s, y + 10 * s, `×${a.hits}`, Math.round(48 * s), "#ffd9a0", 0, true);
    });
  }

  private drawPassive(layer: Layer, p: Passive, x: number, y: number): void {
    drawPassiveIcon(this, this.gfx(layer), p, x, y);
    this.label(layer, x - 44, y, p.name, 24, "#ffe14d", 1, true);
  }

  // ---- HUD (band under the enemy) ----

  private drawHud(layer: Layer, view: BattleView, turn: string): void {
    const y = 350;
    this.label(layer, this.mat.x + 10, y, `Round ${view.round}`, 36, "#ffffff", 0, true);
    if (view.result) {
      this.label(layer, this.mat.x + 10, y + 36, view.result === "won" ? "Battle won" : "Battle lost", 22, "#ffe14d", 0, true);
    }

    // Turn order around the table, lead marked.
    const n = view.seatOrder.length;
    const step = 150;
    const x0 = 900 - ((n - 1) * step) / 2;
    const g = this.gfx(layer);
    view.seatOrder.forEach((seat, i) => {
      const x = x0 + i * step;
      this.plate(layer, x, y - 6, this.nameOf(seat, true, 9), seat === turn && view.phase !== "over", 24, undefined, seatColour(view.seatOrder, seat));
      if (seat === view.lead) this.label(layer, x, y + 28, "LEAD", 16, "#ffe14d", 0.5, true);
      if (i < n - 1) {
        g.fillStyle(0x9fd1b8, 1);
        g.fillTriangle(x + step / 2 - 6, y - 14, x + step / 2 - 6, y + 2, x + step / 2 + 6, y - 6);
      }
    });

    // The Warden's locked spark and the Spark Shrine's blessing.
    const sg = this.gfx(layer);
    let ly = y - 6;
    if (view.locked) {
      drawSparkGlyph(sg, view.locked, 1342, ly, 12);
      drawPadlock(this, sg, 1346, ly + 2, 0.6);
      this.label(layer, 1372, ly, `${view.locked} locked`, 20, "#ff8a8a", 0, true);
      ly += 48;
    }
    if (view.blessing) {
      drawBlessedGlow(sg, view.blessing.spark, 1342, ly, 12);
      drawSparkGlyph(sg, view.blessing.spark, 1342, ly, 12);
      this.label(layer, 1372, ly, `Blessed ${view.blessing.spark}: +${view.blessing.strength}`, 20, "#ffe14d", 0, true);
    }
  }

  // ---- party health (top right) and the running total ----

  private drawParty(layer: Layer, view: BattleView): void {
    const p = view.party;
    this.label(layer, RIGHT_X, 48, "Party", 24, "#9fd1b8", 0, true);
    this.bar(layer, "party", RIGHT_X, 68, 190, 34, p.health, p.maxHealth, 0x3fae68);
    this.shield(layer, "party", RIGHT_X + 212, 85, 34, p.block);
  }

  // What setting the chain off now would do, from the engine's previewCascade: damage (after the
  // enemy's block), block for the party, and coins. Always visible.
  private drawTotals(layer: Layer, view: BattleView): void {
    const total = view.phase === "over" ? { damage: 0, block: 0, coins: {} as Record<string, number> } : previewCascade(this.view);
    const coins = Object.values(total.coins).reduce((a, b) => a + b, 0);
    const x = RIGHT_X;
    const g = this.gfx(layer);
    g.fillStyle(0x174c38, 0.6);
    g.fillRoundedRect(x, 135, SIDE_W, 170, 40);
    g.lineStyle(3, 0x2f7a5b, 0.7);
    g.strokeRoundedRect(x, 135, SIDE_W, 170, 40);
    this.label(layer, x + SIDE_W / 2, 164, "IF SET OFF NOW", 21, "#9fd1b8", 0.5, true);
    const cells: [IconKind, number][] = [["damage", total.damage], ["block", total.block], ["coins", coins]];
    cells.forEach(([kind, value], i) => {
      const cx = x + 52 + i * 103;
      this.icon(layer, kind, cx, 212, 0.9);
      this.label(layer, cx, 266, String(value), 44, value > 0 ? "#ffffff" : "#5f8f7a", 0.5, true);
    });
  }

  // ---- the board (middle) ----

  private drawBoard(layer: Layer, view: BattleView, active: string, pending: PendingChoice | null): void {
    const board = view.board;
    this.slotBoxes.clear();
    const selected = this.selected !== null ? pending?.plays.find((o) => o.domino === this.selected) : undefined;
    const legal = new Set<number>(selected?.ends ?? []);

    if (board.nodes.length === 0) {
      // The opener goes in the middle-left slot.
      const k = 0.8;
      const w = DW * k;
      const h = DH * k;
      const x = this.mat.x + 50 + w / 2;
      const y = this.mat.y + this.mat.h / 2;
      const g = this.gfx(layer);
      const live = selected !== undefined;
      if (live) this.glow(g, x - w / 2, y - h / 2, w, h, GOLD, 14);
      g.fillStyle(GOLD, 0.12);
      g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 14);
      g.lineStyle(4, GOLD, 1);
      g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 14);
      this.label(layer, x, y, "OPENER", 34, "#ffe14d", 0.5, true);
      this.slotBoxes.set("opener", { x, y, w, h });
      const z = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });
      z.on("pointerdown", () => this.onSlotClick("opener"));
      layer.add(z);
      return;
    }

    const lay = layoutBoard(board);
    // Largest scale at which the whole tree fits the mat (it shrinks as the tree grows).
    const GAP = 50;
    const VGAP = 24;
    const availW = this.mat.w - 80;
    const availH = this.mat.h - 40;
    const k = Math.max(0.2, Math.min(0.8, availW / (lay.cols * DW + (lay.cols - 1) * GAP), availH / (lay.rows * DH + (lay.rows - 1) * VGAP)));
    const colW = (DW + GAP) * k;
    const rowH = (DH + VGAP) * k;
    const left = this.mat.x + 40;
    const top = this.mat.y + (this.mat.h - ((lay.rows - 1) * rowH + DH * k)) / 2 + (DH * k) / 2;
    const s = Math.max(34, DH * k); // an open end's slot is a square this big
    const nodeAt = (id: number) => {
      const p = lay.nodes.get(id)!;
      return { x: left + p.col * colW + (DW * k) / 2, y: top + p.row * rowH };
    };
    const slotAt = (id: number) => {
      const p = lay.ends.get(id)!;
      return { x: left + p.col * colW + s / 2, y: top + p.row * rowH };
    };
    const lit = this.shown?.lit ?? new Set<number>();
    const fizzled = this.shown?.fizzled ?? new Set<number>();

    // Paths: from each output to whatever hangs on it (a domino or an open slot), in the spark's colour.
    const g = this.gfx(layer);
    for (const e of board.ends) {
      const from = nodeAt(e.node);
      const child = board.nodes.find((n) => n.end === e.id);
      const to = child ? nodeAt(child.id) : lay.ends.has(e.id) ? slotAt(e.id) : null;
      if (!to) continue;
      const x0 = from.x + (DW * k) / 2;
      const x1 = to.x - (child ? (DW * k) / 2 : s / 2);
      const xm = (x0 + x1) / 2;
      g.lineStyle(Math.max(3, 9 * k), SPARK_STYLE[e.spark].color, fizzled.has(e.id) ? 0.3 : 0.9);
      g.beginPath();
      g.moveTo(x0, from.y);
      g.lineTo(xm, from.y);
      g.lineTo(xm, to.y);
      g.lineTo(x1, to.y);
      g.strokePath();
    }

    // The dominoes, a lit one glowing gold.
    for (const n of board.nodes) {
      const { x, y } = nodeAt(n.id);
      if (lit.has(n.id)) this.glow(g, x - (DW * k) / 2, y - (DH * k) / 2, DW * k, DH * k, GOLD, 14 * k);
      const c = this.domino(layer, n.domino, k, "normal", x, y, undefined, { zone: "chain", index: n.id });
      this.anim.refs.nodes.set(n.id, { c, pos: { x, y, k } });
      if (k >= 0.45) this.label(layer, x, y + (DH * k) / 2 + 11, this.nameOf(n.owner, true, 10), 15, "#cfe9dc", 0.5, true);
    }

    // The open ends: a glowing slot in the spark's colour with the charge reaching it. The charge and
    // the triggers a cap placed there would get come from getOpenEnds, for the player acting.
    const opens: OpenEndView[] = getOpenEnds(view, active);
    for (const o of opens) {
      if (!lay.ends.has(o.end)) continue;
      const { x, y } = slotAt(o.end);
      const color = SPARK_STYLE[o.spark].color;
      const dim = fizzled.has(o.end);
      const isLegal = legal.has(o.end);
      const sg = this.gfx(layer);
      if (dim) sg.setAlpha(0.35);
      if (isLegal) this.glow(sg, x - s / 2 - 4, y - s / 2 - 4, s + 8, s + 8, GOLD, 14);
      if (!dim) this.glow(sg, x - s / 2, y - s / 2, s, s, color, 12);
      sg.fillStyle(0x0d2a20, 0.85);
      sg.fillRoundedRect(x - s / 2, y - s / 2, s, s, 12);
      sg.lineStyle(isLegal ? 6 : 4, isLegal ? GOLD : color, 1);
      sg.strokeRoundedRect(x - s / 2, y - s / 2, s, s, 12);
      if (o.spark === view.blessing?.spark) drawBlessedGlow(sg, o.spark, x, y, s * 0.28);
      drawSparkGlyph(sg, o.spark, x, y, s * 0.26);
      if (o.spark === view.locked) drawPadlock(this, sg, x + s * 0.22, y + s * 0.2, Math.max(0.5, s / 90));
      if (!dim) {
        // The charge, a small number in a badge at the corner; ×N when a cap here would go off several times.
        const r = Math.max(12, s * 0.2);
        sg.fillStyle(0xffe14d, 1);
        sg.fillCircle(x + s / 2 - 4, y - s / 2 + 4, r);
        sg.lineStyle(2, 0x2a2200, 1);
        sg.strokeCircle(x + s / 2 - 4, y - s / 2 + 4, r);
        this.label(layer, x + s / 2 - 4, y - s / 2 + 4, String(o.charge), Math.round(r * 1.3), "#2a2200", 0.5, true);
        if (o.triggers > 1) this.label(layer, x, y + s / 2 + 12, `fires ×${o.triggers}`, 15, "#ffe14d", 0.5, true);
      }
      this.anim.refs.slots.set(o.end, { x, y, k });
      this.slotBoxes.set(o.end, { x, y, w: s, h: s });
      // Click (with a domino picked) or drop onto it; online, hold to ping it.
      const hit = this.add.container(x, y).setSize(s, s);
      layer.add(hit);
      if (this.online) {
        this.pingBoxes.set(pingKey({ zone: "end", index: o.end }), hit);
        hit.setInteractive();
        attachHold(this, hit, () => this.sendPing({ zone: "end", index: o.end }), isLegal ? () => this.onSlotClick(o.end) : undefined);
        if (isLegal) hit.input!.cursor = "pointer";
      } else if (isLegal) {
        hit.setInteractive({ useHandCursor: true });
        hit.on("pointerdown", () => this.onSlotClick(o.end));
      }
    }
  }

  // A soft glow round a rounded rectangle.
  private glow(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, r: number): void {
    for (let i = 4; i >= 1; i--) {
      g.lineStyle(i * 6, color, 0.12);
      g.strokeRoundedRect(x - i * 2, y - i * 2, w + i * 4, h + i * 4, r + i * 2);
    }
  }

  // The ends a hand domino fits, each with the engine's preview of playing it there: the charge it
  // passes on, or what the cap would do. Shown while the domino is hovered, picked or dragged.
  private showHints(layer: Layer, id: string): void {
    const pending = getPendingChoice(this.view);
    const option = pending?.plays.find((o) => o.domino === id);
    if (!pending || !option) return;
    const d = this.dominoOf(id);
    const kind = iconOf(d);
    const targets: (number | "opener")[] = pending.opener ? ["opener"] : option.ends;
    for (const t of targets) {
      const box = this.slotBoxes.get(t);
      // The acting player's own charms: previewPlay with their id, never another seat's view.openEnds.
      const p = previewPlay(this.view, pending.player, id, t === "opener" ? undefined : t);
      if (!box || !p) continue;
      const g = this.gfx(layer);
      this.glow(g, box.x - box.w / 2 - 4, box.y - box.h / 2 - 4, box.w + 8, box.h + 8, GOLD, 14);
      g.lineStyle(5, GOLD, 1);
      g.strokeRoundedRect(box.x - box.w / 2 - 4, box.y - box.h / 2 - 4, box.w + 8, box.h + 8, 14);
      const text = d.kind === "cap" ? (p.triggers > 1 ? `${p.value}×${p.triggers}` : String(p.value)) : `→ ${p.charge}`;
      // To the right of the slot, where nothing else is drawn.
      const t1 = this.label(layer, box.x + box.w / 2 + 12 + 56, box.y, text, 30, "#ffffff", 0.5, true);
      const w = t1.width + 76;
      const lx = box.x + box.w / 2 + 12 + w / 2;
      t1.setX(lx + 16);
      const bg = this.gfx(layer);
      bg.fillStyle(0x0d2a20, 0.95);
      bg.fillRoundedRect(lx - w / 2, box.y - 24, w, 48, 24);
      bg.lineStyle(3, GOLD, 1);
      bg.strokeRoundedRect(lx - w / 2, box.y - 24, w, 48, 24);
      if (kind) this.icon(layer, kind, lx - w / 2 + 28, box.y, 0.5);
      layer.bringToTop(t1);
    }
  }

  private clearHover(): void {
    this.hoverUi?.destroy(true);
    this.hoverUi = undefined;
  }

  // ---- hands ----

  private drawActiveHand(layer: Layer, view: BattleView, active: string, pending: PendingChoice | null, turn: string): void {
    const playable = new Set<string>(pending === null ? [] : pending.plays.map((o) => o.domino));
    const p = view.players.find((x) => x.id === active);
    if (!p) return;
    // Online, the hand is only lit up (and clickable) while it is your seat's turn.
    const onTurn = view.phase !== "over" && (!this.online || turn === active);
    const g = this.gfx(layer);
    if (onTurn) {
      for (let i = 5; i >= 1; i--) {
        g.lineStyle(i * 5, GOLD, 0.1);
        g.strokeRoundedRect(HAND.x - i * 2, HAND.y - i * 2, HAND.w + i * 4, HAND.h + i * 4, 50 + i * 2);
      }
    }
    const you = this.online ? (p.id === this.online.seat ? " (you)" : " (playing for)") : "";
    // The plate sits on the hand's top edge so its charm row fits between it and the dominoes. The row
    // starts at the plate's left edge, leaving the area left of the hand free.
    this.plate(layer, HAND.x + 110, HAND.y - 2, this.nameOf(p.id, true, 9) + you, onTurn, 28, p.id, seatColour(view.seatOrder, p.id));
    this.plateCharms(layer, p.id, p.charms, HAND.x + 70, HAND.y + 32, 20, false);
    let hint = pending === null ? "" : pending.opener ? "Play an opener" : this.selected !== null ? "Pick an open end" : "Play, pass or set off";
    if (this.online && view.phase !== "over" && !this.locked) {
      if (this.waiting) hint = "Waiting for the host";
      else if (pending === null) hint = `Waiting for ${this.nameOf(turn, true, 14)}`;
    }
    this.label(layer, HAND.x + 240, HAND.y - 2, `${hint}${hint ? "   ·   " : ""}Discard ${p.discard.length}`, 22, "#cfe9dc", 0);
    // Pass and Set off, on the right of the header row. Set off needs a cap on the board.
    this.actionButton(layer, HAND.x + HAND.w - 330, HAND.y - 2, 130, "Pass", pending !== null, () => this.submit({ type: "pass" }));
    this.actionButton(layer, HAND.x + HAND.w - 170, HAND.y - 2, 150, "Set off", pending?.canSetOff === true, () => this.submit({ type: "setOff" }));
    // The deck pile, face down to the left of the hand (#171); clicking it opens this player's deck.
    drawDeckStack(this, layer, this.anim.refs, p.id, this.view.dominoes[0], HAND.x - 75, HAND.y + 110, p.deck.length);
    this.deckZone(layer, HAND.x - 75, HAND.y + 100, 110, 80, p.id);
    if (p.hand.length === 0) {
      this.label(layer, HAND.x + HAND.w / 2, HAND.y + 130, "No dominoes in hand", 28, "#7fb59b", 0.5);
      return;
    }
    const k = 0.8;
    const step = DW * k + 4;
    const perRow = Math.floor(HAND.w / step);
    const rows = Math.ceil(p.hand.length / perRow);
    for (let r = 0; r < rows; r++) {
      const inRow = p.hand.slice(r * perRow, (r + 1) * perRow);
      const x0 = HAND.x + (HAND.w - inRow.length * step) / 2 + step / 2;
      inRow.forEach((id, i) => {
        const state: DominoState = !onTurn ? "normal" : playable.has(id) ? "playable" : "notPlayable";
        const hx = x0 + i * step;
        const hy = HAND.y + 100 + r * (DH * k + 12);
        const c = this.domino(layer, id, k, state, hx, hy, state === "playable" ? () => this.onHandTap(id) : undefined, { zone: "hand", seat: p.id, index: r * perRow + i });
        if (state === "playable") this.handInput(layer, c, id);
        if (id === this.selected) {
          const sel = this.gfx(layer);
          sel.lineStyle(6, 0xffffff, 1);
          sel.strokeRoundedRect(hx - (DW * k) / 2 - 4, hy - (DH * k) / 2 - 18, DW * k + 8, DH * k + 8, 12);
        }
        if (!this.anim.refs.hand.has(id)) this.anim.refs.hand.set(id, { x: hx, y: hy, k });
        this.slotsOf(p.id)[r * perRow + i] = { c, pos: { x: hx, y: hy, k } };
      });
    }
  }

  // A pill button in the hand's header row; dimmed and dead when it is not available.
  private actionButton(layer: Layer, x: number, y: number, w: number, text: string, enabled: boolean, onClick: () => void): void {
    const g = this.gfx(layer);
    g.fillStyle(enabled ? GOLD : 0x0d2a20, enabled ? 0.95 : 0.7);
    g.fillRoundedRect(x, y - 22, w, 44, 22);
    this.label(layer, x + w / 2, y, text, 26, enabled ? "#2a2200" : "#5f8f7a", 0.5, true);
    if (!enabled) return;
    const z = this.add.zone(x + w / 2, y, w, 44).setInteractive({ useHandCursor: true });
    z.on("pointerdown", onClick);
    layer.add(z);
  }

  // Hover on a playable hand domino shows where it fits and what it would do there; pressing it can
  // turn into a drag (see onDragMove).
  private handInput(layer: Layer, c: Phaser.GameObjects.Container, id: string): void {
    c.on("pointerover", () => {
      if (this.selected === id || this.drag?.ghost) return;
      this.clearHover();
      this.hoverUi = this.add.container(0, 0).setDepth(500);
      this.showHints(this.hoverUi, id);
    });
    c.on("pointerout", () => this.clearHover());
    c.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.drag = { id, x: pointer.worldX, y: pointer.worldY };
    });
  }

  // ---- input ----

  // A tap on a playable hand domino picks it (or puts it back); then the open end is clicked.
  private onHandTap(id: string): void {
    if (this.locked || this.waiting || this.dragMoved) return;
    const pending = getPendingChoice(this.view);
    if (pending === null) return;
    if (this.online && pending.player !== this.mySeat()) return; // not your turn
    if (!pending.plays.some((o) => o.domino === id)) return;
    this.selected = this.selected === id ? null : id;
    this.redraw();
  }

  // A click on an open end (or the opener slot) with a domino picked. Only plays the engine offered.
  private onSlotClick(target: number | "opener"): void {
    if (this.locked || this.waiting || this.selected === null) return;
    this.play(this.selected, target);
  }

  private play(id: string, target: number | "opener"): void {
    const pending = getPendingChoice(this.view);
    const option = pending?.plays.find((o) => o.domino === id);
    if (!pending || !option) return;
    if (this.online && pending.player !== this.mySeat()) return;
    if (target === "opener") {
      if (pending.opener) this.submit({ type: "play", domino: id });
    } else if (option.ends.includes(target)) {
      this.submit({ type: "play", domino: id, end: target });
    }
  }

  // A pressed hand domino that moves far enough becomes a ghost domino following the pointer.
  private onDragMove(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    if (!drag || !pointer.isDown) return;
    if (!drag.ghost) {
      if (Math.hypot(pointer.worldX - drag.x, pointer.worldY - drag.y) < 16) return;
      this.dragMoved = true;
      this.clearHover();
      this.tooltip.hide();
      drag.ghost = drawDomino(this, this.dominoOf(drag.id), "large", "normal").setScale(0.55).setDepth(800).setAlpha(0.9);
      if (this.selected !== drag.id) {
        this.selected = drag.id;
        this.redraw();
      }
    }
    drag.ghost.setPosition(pointer.worldX, pointer.worldY);
  }

  // Dropping on an open end (or the opener slot) plays there; anywhere else puts the domino back.
  private onDragEnd(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag?.ghost) return;
    drag.ghost.destroy();
    this.time.delayedCall(0, () => (this.dragMoved = false)); // after the release has also reached the domino (it is not a tap)
    const near = 24;
    for (const [target, b] of this.slotBoxes) {
      if (Math.abs(pointer.worldX - b.x) <= b.w / 2 + near && Math.abs(pointer.worldY - b.y) <= b.h / 2 + near) {
        if (!this.locked && !this.waiting) this.play(drag.id, target);
        return;
      }
    }
  }

  private drawSpeedControl(layer: Layer): void {
    const x = RIGHT_X;
    const y = 960;
    this.label(layer, x + SIDE_W / 2, y - 36, "Playback speed", 20, "#9fd1b8", 0.5, true);
    SPEEDS.forEach((v, i) => {
      const bx = x + i * 76;
      const on = v === getPlaybackSpeed();
      const g = this.gfx(layer);
      g.fillStyle(on ? GOLD : 0x0d2a20, 0.95);
      g.fillRoundedRect(bx, y - 18, 68, 36, 18);
      this.label(layer, bx + 34, y, `${v}×`, 22, on ? "#2a2200" : "#ffffff", 0.5, true);
      const z = this.add.zone(bx + 34, y, 68, 36).setInteractive({ useHandCursor: true });
      z.on("pointerdown", () => {
        setPlaybackSpeed(v);
        this.redraw();
      });
      layer.add(z);
    });
  }

  // ---- submitting and playback ----

  private submit(choice: Choice): void {
    if (this.locked || this.waiting) return;
    this.selected = null;
    const online = this.online;
    if (online) {
      // Send the choice to the host and lock the table until it answers (an update or an error).
      this.waiting = true;
      this.redraw();
      if (online.host) online.host.submitLocal(choice);
      else online.client?.sendChoice(choice);
      return;
    }
    const result = step(this.state!, choice);
    // In a run the run engine takes the choice too, and decides what comes after the battle.
    // (step above only supplies the events and the final table to draw.)
    const run = this.inRun ? applyRunChoice(currentRun(), getPendingChoice(this.view)!.player, { type: "battle", choice }).run : null;
    void this.playback(result.events).then((finished) => {
      if (!finished) return;
      if (run) setRun(run);
      this.setState(result.state);
    });
  }

  // Plays the step's events in order. The table follows them (shownView.ts nudges a copy of the
  // pre-step view with each event's numbers, animations.ts animates it) while the highlighted
  // seat follows too. The caller then redraws from the new state or view, so the
  // final table is exactly what the engine says. Input is locked until then.
  // Returns false if the scene was left meanwhile.
  private async playback(events: GameEvent[]): Promise<boolean> {
    this.locked = true;
    this.shown = startShown(JSON.parse(JSON.stringify(this.view)) as BattleView);
    this.redraw();
    debugPanel.stateChanged();
    const mem = newLogMemory();
    const epoch = this.epoch;
    for (let n = 0; n < events.length; n++) {
      const ev = events[n];
      if (isDrawEvent(ev)) {
        // Everything drawn at round start plays at once; the table is redrawn from the end of it.
        let end = n;
        while (end + 1 < events.length && isDrawEvent(events[end + 1])) end++;
        const batch = events.slice(n, end + 1);
        for (const e of batch) trackEvent(e, mem);
        await playDraws(this, () => this.anim.refs, this.view.dominoes, batch, this.shown!, () => this.redraw());
        n = end;
        if (debugPanel.stepMode) await debugPanel.waitForStep(ev.type);
        if (epoch !== this.epoch) return false;
        continue;
      }
      let hl: string | null = this.hlSeat;
      let hand: string | null = this.handSeat;
      switch (ev.type) {
        case "roundStart": hl = ev.lead; hand = ev.lead; break;
        case "play": case "pass": hl = ev.player; hand = ev.player; break;
        default: break;
      }
      trackEvent(ev, mem);
      if (hl !== this.hlSeat || hand !== this.handSeat) {
        this.hlSeat = hl;
        this.handSeat = hand;
        this.redraw();
      }
      const shown = this.shown;
      const wait = Math.max(animTime(ev), eventDelay(ev, mem));
      await this.anim.run(ev, shown.view, () => {
        applyEvent(shown, ev);
        this.redraw();
      });
      // Step mode: the event and its animation have started; wait for the next click instead of the timer.
      if (debugPanel.stepMode) await debugPanel.waitForStep(ev.type);
      else if (wait > 0) await new Promise<void>((resolve) => this.time.delayedCall(scaleTime(wait), resolve));
      if (epoch !== this.epoch) return false; // the scene was restarted or left meanwhile
    }
    this.locked = false;
    this.hlSeat = null;
    this.handSeat = null;
    this.shown = null;
    return true;
  }

  private get mat(): typeof MAT {
    return matFor(this.view.players.length);
  }

  private get turnSeat(): string {
    return this.hlSeat ?? this.view.seat;
  }

  private drawTeammate(layer: Layer, view: BattleView, id: string, x: number, y: number, h: number): void {
    const p = view.players.find((q) => q.id === id);
    if (!p) return;
    this.plate(layer, x + SIDE_W / 2, y + 22, this.plateName(p.id), view.phase !== "over" && this.turnSeat === p.id, 26, p.id, seatColour(view.seatOrder, p.id));
    // A row of charm icons under the plate pushes the discard line, the deck pile and the hand down.
    const extra = p.charms.length > 0 ? 28 : 0;
    this.plateCharms(layer, p.id, p.charms, x + SIDE_W / 2, y + 58, 22);
    this.label(layer, x + SIDE_W / 2 + 40, y + 62 + extra, `Discard ${p.discard.length}`, 20, "#cfe9dc", 0.5);
    drawDeckStack(this, layer, this.anim.refs, id, this.view.dominoes[0], x + 50, y + 66 + extra, p.deck.length);
    const top = y + 90 + extra;
    const avail = h - 100 - extra;
    // Largest scale at which the whole hand fits.
    let k = 0.33;
    for (const s of [0.5, 0.4, 0.33]) {
      const per = Math.floor(SIDE_W / (DW * s + 6));
      const rows = Math.floor(avail / (DH * s + 6));
      k = s;
      if (per * rows >= p.hand.length) break;
    }
    const stepX = DW * k + 6;
    const per = Math.floor(SIDE_W / stepX);
    p.hand.forEach((did, i) => {
      const row = Math.floor(i / per);
      const inRow = Math.min(per, p.hand.length - row * per);
      const x0 = x + (SIDE_W - inRow * stepX) / 2 + stepX / 2;
      const c = this.domino(layer, did, k, "normal", x0 + (i % per) * stepX, top + (DH * k) / 2 + row * (DH * k + 6), undefined, { zone: "hand", seat: id, index: i });
      this.slotsOf(id)[i] = { c, pos: { x: x0 + (i % per) * stepX, y: top + (DH * k) / 2 + row * (DH * k + 6), k } };
    });
    if (p.hand.length === 0) this.label(layer, x + SIDE_W / 2, top + 20, "No dominoes", 20, "#7fb59b", 0.5);
  }
}

// ---- board layout (geometry only) ----

interface BoardLayout {
  nodes: Map<number, { col: number; row: number }>;
  ends: Map<number, { col: number; row: number }>; // the open ends
  cols: number;
  rows: number;
}

// Where each domino and open end sits in a grid: the opener in column 0, each step one column
// right, branches fanning into their own rows (a junction sits between its branches, a straight run
// stays on one row). Rows may be fractional. No rules: the tree is whatever the board holds.
function layoutBoard(board: Board): BoardLayout {
  const child = new Map<number, number>(); // end id -> the node attached to it
  for (const n of board.nodes) if (n.end !== null) child.set(n.end, n.id);
  const outs = (node: number) => board.ends.filter((e) => e.node === node);
  const span = (node: number): number =>
    Math.max(1, outs(node).reduce((total, e) => total + (child.has(e.id) ? span(child.get(e.id)!) : 1), 0));
  const lay: BoardLayout = { nodes: new Map(), ends: new Map(), cols: 1, rows: 1 };
  const place = (node: number, col: number, top: number): number => {
    lay.cols = Math.max(lay.cols, col + 1);
    const rows: number[] = [];
    let cursor = top;
    for (const e of outs(node)) {
      const c = child.get(e.id);
      if (c === undefined) {
        lay.ends.set(e.id, { col: col + 1, row: cursor });
        lay.cols = Math.max(lay.cols, col + 2);
        rows.push(cursor);
        cursor += 1;
      } else {
        rows.push(place(c, col + 1, cursor));
        cursor += span(c);
      }
    }
    const row = rows.length > 0 ? (rows[0] + rows[rows.length - 1]) / 2 : top;
    lay.nodes.set(node, { col, row });
    return row;
  };
  place(0, 0, 0);
  lay.rows = span(0);
  return lay;
}
