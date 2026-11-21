import Phaser from "phaser";
import { getOpenEnds, getPendingChoice, previewNextPlayer, previewPlay, previewSetOff, step } from "../engine/battle";
import type { BattleState, Choice, PendingChoice, SetOffPreview } from "../engine/battle";
import { getView } from "../engine/view";
import type { BattleView, OpenEndView } from "../engine/view";
import type { Domino } from "../engine/types";
import type { GameEvent } from "../engine/events";
import type { Client } from "../net/client";
import type { Host } from "../net/host";
import type { HostMessage, PingTarget } from "../net/protocol";
import { relay } from "./relay";
import { watchLink } from "./linkBanner";
import { currentRun, openRunScreen, runSeed, setRun, startSingleRun } from "./runSession";
import { applyRunChoice } from "../engine/run";
import { drawDomino } from "./dominoDrawing";
import type { DominoState } from "./dominoDrawing";
import { seatColour } from "./seatColours";
import { Tooltip } from "./tooltip";
import type { TipPreview } from "./tooltip";
import { battleDeckPlayers, openDeckViewer } from "./deckViewer";
import { button } from "./ui";
import { setSoundHushed } from "./sound";
import { PingMarks, attachHold, pingKey } from "./ping";
import { devSettings, startBattle } from "./devBattle";
import type { GameSettings } from "./devBattle";
import { eventDelay, newLogMemory, trackEvent } from "./eventLog";
import { debugPanel } from "./DebugPanel";
import type { DebugHost } from "./DebugPanel";
import { scaleTime } from "./playbackSpeed";
import { SpeedControl } from "./speedControl";
import { Animator, SKIP_SPEED, animTime, newRefs, paintBar } from "./animations";
import type { Pos } from "./animations";
import { FuseBoard, boardArea, chargesInto, liveNumber } from "./fuseBoard";
import { HandFan, handArea } from "./handFan";
import { SetOffPreviewUi } from "./setOffPreview";
import { boardGlow } from "./spectacle";
import { litGlowStrength } from "./buildup";
import { applyEvent, startShown } from "./shownView";
import { isDrawEvent, playDraws } from "./drawAnimation";
import { combatLayoutData, fuseBoardData } from "./presentation";
import type { CombatCtx } from "./combatCtx";
import { drawEnemyUnit } from "./enemyUnit";
import { TurnRail } from "./turnRail";
import { drawActions, drawBackdrop, drawColumnPanel, drawFooter, drawPartyBar } from "./combatHud";
import { columnLayout, footerSpots } from "./columnLayout";
import type { ColumnLayout } from "./columnLayout";
import { drawTally } from "./setOffTally";
import { setMenuButtonSpot } from "./menuButton";
import type { ShownTable } from "./shownView";

// The combat table. Draws everything from getView (and getPendingChoice for
// whose turn it is and which dominoes are playable, getOpenEnds for the charge on each open end,
// previewPlay and previewSetOff for the previews). No rules live here: layout only.
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
// reply (an update, or an error) arrives. Your own hand is in front; every seat, yours too, has a tab across the top.

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

const FONT = "Arial, Helvetica, sans-serif";

// Table regions (1920x1080), from data/presentation.json (combatLayout).
// The board's area (boardArea) and the hand's place (handArea and the pile positions) are rectangles in data, not placed from other parts here.
const ACTIONS = combatLayoutData.actions;

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
  private board?: FuseBoard; // the fuse board as drawn (fuseBoard.ts)
  private fan?: HandFan; // your hand as drawn (handFan.ts)
  private hoverKey: string | null = null; // the hand domino under the pointer (a fan key), playable or not
  private handPlayable = new Set<string>(); // the engine's playable ids in the hand as drawn
  private openCharge = new Map<number, number>(); // the charge reaching each open end, for the player acting
  private intoKey = "";
  private intoCache = new Map<number, number>();
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
  private previewUi!: SetOffPreviewUi;
  private previewLayer?: Phaser.GameObjects.Container; // the set-off preview, part of the current layer
  private hoverPlay: { player: string; domino: string; end?: number } | null = null; // the play whose result the preview shows
  private shown: ShownTable | null = null; // the table part-way through a step; null when idle
  private inCascade = false; // a cascade is playing on this screen: a click or Space may skip it
  private skipping = false; // this player skipped it: the rest of the step is applied at once
  private speed!: SpeedControl;
  private rail!: TurnRail; // the seat tabs (turnRail.ts)
  private col!: ColumnLayout; // where the left column's parts are this redraw (the tally draws into it)
  private ctx!: CombatCtx; // what enemyUnit.ts, turnRail.ts and combatHud.ts draw with
  private hoverId: string | null = null; // the playable hand domino under the pointer (for the next player's highlight)
  private skipHint?: Phaser.GameObjects.Text;
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
    this.board = undefined;
    this.fan = undefined;
    this.hoverKey = null;
    this.hoverId = null;
    this.shown = null;
    this.hoverPlay = null;
    this.previewUi?.clear();
    this.previewUi = new SetOffPreviewUi(this);
    this.drawTable();
    this.ctx = this.makeCtx();
    this.rail = new TurnRail(this.ctx);
    this.anim = new Animator(this);
    this.anim.buildup.frame = () => boardArea(); // the camera frames the tree to the board's area (data)
    this.anim.redraw = () => this.redraw(); // the slam redraws the table with the real numbers
    this.locked = false;
    this.selected = null;
    this.drag = null;
    this.dragMoved = false;
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onDragMove(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onDragEnd(p));
    // A click on empty table or Space skips the cascade being played, on this screen only.
    this.input.on("pointerdown", (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0 && !this.speed.isOpen()) this.skipCascade(); // a click that only closes the speed list is not a skip
    });
    this.speed = new SpeedControl(this, footerSpots().speed); // made after the skip handler, so that one sees the list still open; follows the menu setting itself
    this.input.keyboard?.on("keydown-SPACE", () => this.skipCascade());
    this.inCascade = false;
    this.skipping = false;
    this.skipHint = this.add.text(combatLayoutData.skipHint.x, combatLayoutData.skipHint.y, "Click to skip", { fontFamily: FONT, fontSize: "24px", color: "#cfe9dc", stroke: "#101010", strokeThickness: 4 }).setOrigin(0.5).setDepth(700).setVisible(false);
    setSoundHushed(false);
    this.hlSeat = null;
    this.handSeat = null;
    this.tooltip = new Tooltip(this);
    this.tooltip.avoid = { x: ACTIONS.pass.x, y: ACTIONS.pass.y - 20, w: ACTIONS.pass.w, h: ACTIONS.setOff.y + ACTIONS.setOff.h - ACTIONS.pass.y + 20 }; // Pass and Set off
    setMenuButtonSpot(footerSpots().menu); // the menu button sits in the column's footer while this screen is up
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
      setMenuButtonSpot(null);
      this.anim.clearShots(false);
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

  // The pause across the top: everyone sees who the game is waiting for; the host may get a button.
  private drawPause(): void {
    this.pauseUi.forEach((o) => o.destroy());
    this.pauseUi = [];
    const paused = relay.paused;
    if (!this.online || !paused || paused.waitingFor === null) return;
    const style = { fontFamily: FONT, fontSize: "30px", color: "#ffd0cc", fontStyle: "bold", backgroundColor: "#0d2a20", padding: { x: 24, y: 10 } };
    this.pauseUi.push(this.add.text(combatLayoutData.pause.x, combatLayoutData.pause.y, `Waiting for ${paused.waitingFor} to reconnect...`, style).setOrigin(0.5).setDepth(900));
    const seat = paused.playFor;
    const host = this.online.host;
    if (host && seat) {
      const name = relay.roster?.players.find((p) => p.seat === seat)?.name ?? seat;
      this.pauseUi.push(button(this, combatLayoutData.pause.buttonX, combatLayoutData.pause.y, `Play for ${name}`, () => host.playFor(seat), { size: 30, origin: 0.5 }).setDepth(900));
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
      .text(handArea().x + handArea().w / 2, handArea().y - 70, `The host says: ${message}`, { fontFamily: FONT, fontSize: "26px", color: "#ff9a94", stroke: "#101010", strokeThickness: 5 })
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
    this.hoverPlay = null;
    this.board?.destroy(); // stops any burn still running before its graphics go
    this.fan?.destroy();
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

    const ctx = this.ctx;
    const col = columnLayout(view);
    this.col = col;
    drawColumnPanel(ctx, layer);
    this.rail.draw(layer, view, active, turn);
    drawEnemyUnit(ctx, layer, view, col);
    drawPartyBar(ctx, layer, view, col);
    drawFooter(ctx, layer, view.round);
    this.drawBoard(layer, view, active, pending);
    this.drawActiveHand(layer, view, active, pending, turn);
    this.drawActionButtons(layer, view, pending);
    if (this.online && this.waiting && view.phase !== "over") {
      // The host has not answered the choice just sent (the line over the buttons used to say so).
      const W = combatLayoutData.waiting;
      this.label(layer, W.x, W.y, W.text, W.size, W.colour, 0.5, true);
    }
    this.pings.place(this.pingBoxes);
    this.previewLayer = this.add.container(0, 0);
    layer.add(this.previewLayer);
    this.refreshPreview();
  }

  // A player's hand slots as drawn, for the draw animation.
  private slotsOf(seat: string): { c: Phaser.GameObjects.Container; pos: Pos }[] {
    const slots = this.anim.refs.handSlots;
    if (!slots.has(seat)) slots.set(seat, []);
    return slots.get(seat)!;
  }

  // ---- table (drawn once) ----

  private drawTable(): void {
    // With a background image (added first, so behind everything) the frame, felt and pool of light
    // give way to it.
    const hasArt = this.blurredBackground();
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
    drawBackdrop(this); // dims the table and darkens the edges: the middle is the brightest (L4)
  }

  // The table picture, blurred once into a small canvas and stretched over the screen, so the lit board
  // and the column stand out. (A live blur filter was far too slow; the canvas filter is skipped where
  // the browser lacks it, and the small size alone still softens the picture.) False when there is no
  // picture, and the caller keeps its code-drawn table.
  private blurredBackground(): boolean {
    const B = combatLayoutData.background.blur;
    const key = "art/backgrounds/combat";
    if (!this.textures.exists(key)) return false;
    const tex = this.textures.exists("combat-bg-blur") ? null : this.textures.createCanvas("combat-bg-blur", Math.round(1920 * B.scale), Math.round(1080 * B.scale));
    if (tex) {
      const src = this.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
      const c = tex.context;
      const f = Math.max(tex.width / src.width, tex.height / src.height); // cover the canvas
      const w = src.width * f;
      const h = src.height * f;
      try {
        c.filter = `blur(${B.px}px)`;
      } catch {
        // no canvas filter here
      }
      c.drawImage(src, (tex.width - w) / 2, (tex.height - h) / 2, w, h);
      tex.refresh();
    }
    this.add.image(960, 540, "combat-bg-blur").setDisplaySize(1920, 1080);
    return true;
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

  private dominoOf(id: string): Domino {
    return this.view.dominoes.find((q) => q.id === id) ?? this.view.dominoes[0];
  }

  private domino(layer: Layer, id: string, k: number, state: DominoState, x: number, y: number, onClick?: () => void, ping?: PingTarget, owner?: string, tip = true): Phaser.GameObjects.Container {
    const d = this.dominoOf(id);
    const c = drawDomino(this, d, "large", state, { scale: k, owner: owner === undefined ? undefined : seatColour(this.view.seatOrder, owner) });
    c.setScale(k);
    c.setPosition(x, y);
    layer.add(c);
    // Every face-up domino has a tooltip. Only a playable domino in the active hand gets the
    // engine's "if played now" numbers, worked out from the view (online players have nothing else).
    if (tip) this.tooltip.attach(c, d, state === "playable" ? () => this.tipPreviews(d.id) : undefined);
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

  private bar(layer: Layer, key: string, x: number, y: number, w: number, h: number, value: number, max: number, color: number, fontSize?: number): void {
    const g = this.gfx(layer);
    const text = this.label(layer, x + w / 2, y + h / 2, "", fontSize ?? Math.round(h * 0.6), "#ffffff", 0.5, true);
    const ref = { g, text, x, y, w, h, max, color };
    this.anim.refs.bars.set(key, ref);
    paintBar(ref, value + this.anim.owed(key as "party" | "enemy", "health"), this.anim.reactions.ghostOf(key as "party" | "enemy")); // what the cascade still holds back counts until the slam
  }

  private shield(layer: Layer, key: string, x: number, y: number, s: number, amount: number): void {
    const g = this.gfx(layer);
    g.fillStyle(0x4a6fa5, 1);
    g.lineStyle(3, 0x1c2b44, 1);
    const pts = [[-1, -1], [1, -1], [1, 0.1], [0, 1.1], [-1, 0.1]].map(([a, b]) => new Phaser.Math.Vector2(x + a * s * 0.5, y + b * s * 0.5));
    g.fillPoints(pts, true);
    g.strokePoints(pts, true);
    const shownAmount = amount + this.anim.owed(key as "party" | "enemy", "block");
    const text = this.label(layer, x + s * 0.5 + 8, y, String(shownAmount), Math.round(s * 0.7), "#dbe6f5", 0, true);
    this.anim.refs.shields.set(key, { text, x, y, s });
    if (key === "enemy") this.anim.reactions.drawCracks(layer, x, y, s, shownAmount);
  }

  // A click area that opens the deck viewer on one player's tab. The viewer shows everyone's deck (#171).
  private deckZone(layer: Layer, cx: number, cy: number, w: number, h: number, seat: string): void {
    const z = this.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true });
    z.on("pointerdown", () => openDeckViewer(this, battleDeckPlayers(this.view, (id) => this.nameOf(id, false)), seat));
    layer.add(z);
  }

  // What the layout files draw with: this scene's helpers, registered with the animator.
  private makeCtx(): CombatCtx {
    const scene = this;
    return {
      scene: this,
      get tooltip() {
        return scene.tooltip; // made after this context
      },
      refs: () => this.anim.refs,
      label: (...a) => this.label(...a),
      gfx: (l) => this.gfx(l),
      bar: (...a) => this.bar(...a),
      shield: (...a) => this.shield(...a),
      drawBody: (l, id, tier, spot) => this.anim.reactions.drawBody(l, id, tier, spot),
      domino: (...a) => this.domino(...a),
      slots: (seat) => this.slotsOf(seat),
      nameOf: (seat, forPlate, max) => this.nameOf(seat, forPlate, max),
      isAway: (seat) => this.online !== null && this.isAway(seat),
      deckSpot: (l, seat, x, y, text) => {
        const c = this.add.container(x, y);
        l.add(c);
        this.anim.refs.decks.set(seat, { c, text, x, y });
      },
      openDeck: (seat) => openDeckViewer(this, battleDeckPlayers(this.view, (id) => this.nameOf(id, false)), seat),
    };
  }

  // ---- set-off preview (#222) ----

  // The preview over the health bars, from the engine's previewSetOff on the current board, or on the
  // board after the hovered play. Hidden while a step plays back; the real bars take over.
  private refreshPreview(): void {
    this.refreshNext();
    this.refreshLive();
    const into = this.previewLayer;
    if (!into?.active) return;
    const view = this.view;
    const tally = (p: SetOffPreview | null): void => drawTally(this, into, view, p, this.col, (o, low, high, ms) => this.previewUi.pulse(o, low, high, ms));
    if (this.locked || this.waiting || this.shown || view.phase === "over") {
      this.previewUi.draw(into, view, null, false, this.anim.refs);
      tally(null);
      return;
    }
    const pending = getPendingChoice(view);
    const hover = this.hoverPlay;
    const p = (hover ? previewSetOff(view, hover) : null) ?? previewSetOff(view);
    const mine = !!pending && (!this.online || pending.player === this.mySeat());
    this.previewUi.draw(into, view, p, !!p?.lethal && (hover !== null || (mine && pending!.canSetOff)), this.anim.refs);
    tally(p);
  }

  // The NEXT seat's highlight in the rail (#228): while a hand domino is hovered, picked or dragged,
  // previewNextPlayer says what that seat could play after it (after a play on the hovered end, or
  // after any of your legal plays with it). Nothing is shown while a step plays or it is not your turn.
  private refreshNext(): void {
    const view = this.view;
    const pending = this.locked || this.waiting || this.shown ? null : getPendingChoice(view);
    const id = this.hoverPlay?.domino ?? this.hoverId ?? this.selected;
    if (!pending || id === null || (this.online && pending.player !== this.mySeat())) {
      this.rail.setNext(null);
      return;
    }
    const end = this.hoverPlay?.domino === id ? this.hoverPlay.end : undefined;
    this.rail.setNext(previewNextPlayer(view, pending.player, id, end), this.dominoOf(id).name);
  }

  // A hand domino hovered, picked or dragged over a legal end: preview the board with it there.
  // Returns whether the hovered play changed (and so the preview was refreshed).
  private setHoverPlay(id: string | null, end?: number): boolean {
    const pending = id === null ? null : getPendingChoice(this.view);
    const next = id !== null && pending && (!this.online || pending.player === this.mySeat()) ? { player: pending.player, domino: id, end } : null;
    if (JSON.stringify(next) === JSON.stringify(this.hoverPlay)) return false;
    this.hoverPlay = next;
    this.refreshPreview();
    return true;
  }

  // ---- the board (middle) ----

  // The fuse board (fuseBoard.ts): small dominoes joined by fuses, in the area from data. The top strip
  // of the area is kept free for the cascade counter and callouts (#191).
  private drawBoard(layer: Layer, view: BattleView, active: string, pending: PendingChoice | null): void {
    this.slotBoxes.clear();
    const selected = this.selected !== null ? pending?.plays.find((o) => o.domino === this.selected) : undefined;
    const legal = new Set<number>(selected?.ends ?? []);
    const A = boardArea();
    const area = { x: A.x, y: A.y, w: A.w, h: A.h };
    const lit = this.shown?.lit ?? new Set<number>();
    const fizzled = this.shown?.fizzled ?? new Set<number>();
    // The charge on the open ends, from the engine (getOpenEnds), for the player acting.
    const opens: OpenEndView[] = getOpenEnds(view, active);
    this.openCharge = new Map(opens.map((o) => [o.end, o.charge]));
    // The built tree glows brighter, and hotter in colour, as dominoes and charge pile up.
    const build = boardGlow(view.board.nodes.length, Math.max(0, ...opens.map((o) => o.charge)));
    const hot = this.anim.litColor();
    const glowG = this.gfx(layer); // under the board: the glow round each domino
    const board = new FuseBoard(this, layer);
    this.board = board;
    board.draw({
      board: view.board,
      dominoes: view.dominoes,
      area,
      ownerColour: (owner) => seatColour(view.seatOrder, owner),
      openEnds: opens,
      fuseCharges: this.chargesFor(view, active),
      locked: view.locked,
      blessed: view.blessing?.spark ?? null,
      lit,
      fizzled,
      glow: build.strength > 0 ? { colour: build.color, alpha: 0.14 * build.strength } : undefined,
      hot,
    });
    const refs = this.anim.refs;
    refs.board = board;
    board.nodeRefs().forEach((n, id) => refs.nodes.set(id, n));
    board.slotRefs().forEach((p, id) => refs.slots.set(id, p));
    for (const n of view.board.nodes) {
      const b = board.nodeBox(n.id)!;
      const k = board.scale();
      if (build.strength > 0) this.glow(glowG, b.x, b.y, b.w, b.h, build.color, 14 * k, build.strength * 2.5);
      if (lit.has(n.id)) this.glow(glowG, b.x, b.y, b.w, b.h, hot, 14 * k, litGlowStrength(lit.size, view.board.nodes.length));
      // Hovering a board domino shows it full size (the tooltip); online, hold to ping it.
      const c = refs.nodes.get(n.id)!.c;
      this.tooltip.attach(c, this.dominoOf(n.domino));
      if (this.online) {
        const ping: PingTarget = { zone: "chain", index: n.id };
        this.pingBoxes.set(pingKey(ping), c);
        attachHold(this, c, () => this.sendPing(ping));
      }
    }

    // The opener slot (an empty board), and the open ends: click (with a domino picked) or drop onto
    // them; online, hold to ping. Aiming a picked domino at an end previews that play.
    const aim = (hit: Phaser.GameObjects.Container, end?: number) => {
      if (this.selected === null) return;
      const id = this.selected;
      hit.on("pointerover", () => this.setHoverPlay(id, end));
      hit.on("pointerout", () => this.setHoverPlay(null));
    };
    if (view.board.nodes.length === 0) {
      const hit = board.hit("opener");
      if (hit) {
        this.slotBoxes.set("opener", { x: hit.x, y: hit.y, w: hit.width, h: hit.height });
        hit.setInteractive({ useHandCursor: true });
        hit.on("pointerdown", () => this.onSlotClick("opener"));
        aim(hit);
      }
      return;
    }
    for (const o of opens) {
      const hit = board.hit(o.end);
      if (!hit) continue;
      const isLegal = legal.has(o.end) && o.spark !== view.locked;
      this.slotBoxes.set(o.end, { x: hit.x, y: hit.y, w: hit.width, h: hit.height });
      if (this.online) {
        this.pingBoxes.set(pingKey({ zone: "end", index: o.end }), hit);
        hit.setInteractive();
        attachHold(this, hit, () => this.sendPing({ zone: "end", index: o.end }), isLegal ? () => this.onSlotClick(o.end) : undefined);
        if (isLegal) hit.input!.cursor = "pointer";
      } else if (isLegal) {
        hit.setInteractive({ useHandCursor: true });
        hit.on("pointerdown", () => this.onSlotClick(o.end));
      }
      if (isLegal) aim(hit, o.end);
    }
  }

  // The charge flowing through each fuse into a placed domino, from the engine (fuseBoard.chargesInto),
  // remembered while the board and charms are the same.
  private chargesFor(view: BattleView, player: string): Map<number, number> {
    const key = JSON.stringify([view.board.nodes.map((n) => [n.domino, n.owner, n.end]), view.players.map((p) => p.charms), view.blessing, player]);
    if (this.intoKey !== key) {
      this.intoCache = chargesInto(view, player);
      this.intoKey = key;
    }
    return this.intoCache;
  }

  // A soft glow round a rounded rectangle.
  private glow(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, r: number, strength = 1): void {
    for (let i = 4; i >= 1; i--) {
      g.lineStyle(i * 6, color, Math.min(1, 0.12 * strength));
      g.strokeRoundedRect(x - i * 2, y - i * 2, w + i * 4, h + i * 4, r + i * 2);
    }
  }

  // What a hovered, picked or dragged hand domino shows: it lifts in the fan, its legal ends light up
  // and each shows the engine's preview of playing it there (previewPlay): a cap's value in green over
  // its sum (red when below its base), or the charge an amplifier or junction passes on. With an end
  // aimed at (a drag over it, a hover on it) that end is the one lit; the others stay, dimmer. Part of
  // refreshPreview, so the bar previews and the rail's NEXT highlight follow the same hover.
  private refreshLive(): void {
    const board = this.board;
    const fan = this.fan;
    if (!board || !fan) return;
    board.clearLive();
    board.clearHighlight();
    fan.pick(this.selected === null ? null : fan.items.find((i) => i.id === this.selected)?.key ?? null);
    fan.hover(this.drag?.ghost ? null : this.hoverKey);
    const view = this.view;
    const pending = this.locked || this.waiting || this.shown ? null : getPendingChoice(view);
    const id = this.hoverPlay?.domino ?? this.hoverId ?? this.selected;
    const option = pending && id !== null ? pending.plays.find((o) => o.domino === id) : undefined;
    if (!pending || id === null || !option || (this.online && pending.player !== this.mySeat())) return;
    const d = this.dominoOf(id);
    const aimed = this.hoverPlay?.domino === id ? this.hoverPlay.end : undefined;
    board.highlightLegal(option.ends, pending.opener);
    const targets: (number | "opener")[] = pending.opener ? ["opener"] : option.ends;
    for (const t of targets) {
      // The acting player's own charms: previewPlay with their id, never another seat's view.openEnds.
      const p = previewPlay(view, pending.player, id, t === "opener" ? undefined : t);
      if (!p) continue;
      const reaching = t === "opener" ? fuseBoardData.openerCharge : this.openCharge.get(t) ?? 0;
      board.showLive(t, liveNumber(d, p, reaching), aimed === undefined || aimed === t);
    }
  }

  // ---- hands ----

  // Your hand (fanned, handFan.ts) between your deck pile and your discard pile, all placed from data.
  private drawActiveHand(layer: Layer, view: BattleView, active: string, pending: PendingChoice | null, turn: string): void {
    const p = view.players.find((x) => x.id === active);
    if (!p) return;
    // Online, the hand is only lit up (and clickable) while it is your seat's turn.
    const onTurn = view.phase !== "over" && (!this.online || turn === active);
    const playable = new Set<string>(pending === null ? [] : pending.plays.map((o) => o.domino));
    this.handPlayable = playable;
    const fan = new HandFan(this, layer, { onHover: (key) => this.onHandHover(key), onDown: (key, pointer) => this.onHandDown(key, pointer) });
    this.fan = fan;
    fan.draw({ hand: p.hand, dominoes: view.dominoes, playable: onTurn ? playable : null, owner: seatColour(view.seatOrder, p.id), deck: p.deck.length, discard: p.discard.length });
    const refs = this.anim.refs;
    // The piles open this player's deck (#171); the animator draws new dominoes from the deck pile.
    const deck = fan.deckPoint();
    const discard = fan.discardPoint();
    this.deckZone(layer, deck.x, deck.y, fan.deckRect().w, fan.deckRect().h, p.id);
    this.deckZone(layer, discard.x, discard.y, fan.discardRect().w, fan.discardRect().h, p.id);
    if (fan.deckPile && fan.deckText) refs.decks.set(p.id, { c: fan.deckPile, text: fan.deckText, x: deck.x, y: deck.y });
    if (p.hand.length === 0) {
      const a = handArea();
      this.label(layer, a.x + a.w / 2, a.y + a.h / 2, "No dominoes in hand", 28, "#7fb59b", 0.5);
    }
    const slots = this.slotsOf(p.id);
    for (const it of fan.items) {
      const pos = { x: it.slot.x, y: it.slot.y, k: it.slot.k, angle: it.slot.angle };
      slots[it.index] = { c: it.holder, pos };
      if (!refs.hand.has(it.id)) refs.hand.set(it.id, pos);
      const d = this.dominoOf(it.id);
      const can = onTurn && playable.has(it.id);
      this.tooltip.attach(it.holder, d, can ? () => this.tipPreviews(d.id) : undefined);
      if (this.online) {
        const ping: PingTarget = { zone: "hand", seat: p.id, index: it.index };
        this.pingBoxes.set(pingKey(ping), it.holder);
        attachHold(this, it.holder, () => this.sendPing(ping), can ? () => this.onHandTap(it.id) : undefined);
      }
    }
    if (this.drag?.ghost) fan.setDragged(fan.items.find((i) => i.id === this.drag!.id)?.key ?? null);
  }

  // The actions bottom right (L7): Set off and Pass. Whose turn it is shows on the seat tabs.
  private drawActionButtons(layer: Layer, view: BattleView, pending: PendingChoice | null): void {
    drawActions(this.ctx, layer, {
      mine: pending !== null && view.phase !== "over",
      canSetOff: pending?.canSetOff === true,
      onPass: () => this.submit({ type: "pass" }),
      onSetOff: () => this.submit({ type: "setOff" }),
    });
  }

  // The pointer on a hand domino: it lifts (fan), and, if playable, the hover updates the live numbers,
  // the bar previews and the rail's NEXT highlight together. A domino with one place to go previews
  // that play.
  private onHandHover(key: string | null): void {
    if (this.drag?.ghost) return;
    this.hoverKey = key;
    const item = key === null ? undefined : this.fan?.items.find((i) => i.key === key);
    const id = item && this.handPlayable.has(item.id) && this.selected !== item.id ? item.id : null;
    this.hoverId = id;
    let changed = false;
    if (id !== null) {
      const pending = getPendingChoice(this.view);
      const ends = pending?.plays.find((o) => o.domino === id)?.ends ?? [];
      changed = this.setHoverPlay(pending?.opener || ends.length === 1 ? id : null, ends[0]);
    } else changed = this.setHoverPlay(null);
    if (!changed) this.refreshPreview();
  }

  // A press on a hand domino: a tap picks it (offline; online the tap fires on release, see
  // drawActiveHand) and the press may turn into a drag (see onDragMove).
  private onHandDown(key: string, pointer: Phaser.Input.Pointer): void {
    const item = this.fan?.items.find((i) => i.key === key);
    if (!item || !this.handPlayable.has(item.id)) return;
    if (!this.online) this.onHandTap(item.id);
    this.drag = { id: item.id, x: pointer.worldX, y: pointer.worldY };
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
      this.hoverKey = null;
      this.hoverId = null;
      this.tooltip.hide();
      drag.ghost = drawDomino(this, this.dominoOf(drag.id), "large", "normal").setScale(0.55).setDepth(800).setAlpha(0.9);
      if (this.selected !== drag.id) {
        this.selected = drag.id;
        this.redraw();
      }
      this.fan?.setDragged(this.fan.items.find((i) => i.id === drag.id)?.key ?? null);
    }
    drag.ghost.setPosition(pointer.worldX, pointer.worldY);
    // Over a legal end: preview the board with the domino there.
    const over = this.slotAt(pointer);
    const legal = getPendingChoice(this.view)?.plays.find((o) => o.domino === drag.id)?.ends;
    this.setHoverPlay(over !== undefined && over !== "opener" && legal?.includes(over) ? drag.id : null, over === "opener" ? undefined : over);
  }

  // The open end (or the opener slot) under the pointer, with a little room round it.
  private slotAt(pointer: Phaser.Input.Pointer): number | "opener" | undefined {
    const near = 24;
    for (const [target, b] of this.slotBoxes) {
      if (Math.abs(pointer.worldX - b.x) <= b.w / 2 + near && Math.abs(pointer.worldY - b.y) <= b.h / 2 + near) return target;
    }
    return undefined;
  }

  // Dropping on an open end (or the opener slot) plays there; anywhere else puts the domino back.
  private onDragEnd(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag?.ghost) return;
    drag.ghost.destroy();
    this.time.delayedCall(0, () => (this.dragMoved = false)); // after the release has also reached the domino (it is not a tap)
    const target = this.slotAt(pointer);
    this.fan?.setDragged(null);
    this.setHoverPlay(null);
    if (target !== undefined && !this.locked && !this.waiting) this.play(drag.id, target);
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
  // Jumps to the end of the cascade being played. Only this screen changes: what is still on the
  // way plays out at once (the animators and timers run very fast, silently) and the rest of the
  // step's events are applied to the shown table without animation. The step then ends as always,
  // with a redraw from the host's own view, so the table is exactly the host's state and the
  // victory, defeat and reward flow runs as usual.
  private skipCascade(): void {
    if (!this.inCascade || this.skipping || debugPanel.stepMode) return;
    this.skipping = true;
    this.anim.skipping = true;
    this.skipHint?.setVisible(false);
    setSoundHushed(true);
    this.anim.clearShots(); // every shot in the air ends before the fast-forward starts
    this.tweens.timeScale = SKIP_SPEED;
    this.time.timeScale = SKIP_SPEED;
    this.anim.buildup.clear(); // the camera goes back at once and the counter goes
    this.board?.stopBurns(); // every fuse burnt all the way
    this.fan?.snap();
  }

  private endSkip(): void {
    this.inCascade = false;
    this.skipping = false;
    this.anim.skipping = false;
    this.skipHint?.setVisible(false);
    setSoundHushed(false);
    this.anim.buildup.clear();
    this.tweens.timeScale = 1;
    this.time.timeScale = 1;
  }

  private async playback(events: GameEvent[]): Promise<boolean> {
    this.locked = true;
    this.shown = startShown(JSON.parse(JSON.stringify(this.view)) as BattleView);
    this.redraw();
    debugPanel.stateChanged();
    const mem = newLogMemory();
    const epoch = this.epoch;
    for (let n = 0; n < events.length; n++) {
      const ev = events[n];
      if (this.skipping) {
        await this.anim.skipEvent(ev, this.shown!.view); // counts the event; the cascade's end plays a short slam
        if (epoch !== this.epoch) return false;
        applyEvent(this.shown!, ev);
        continue;
      }
      if (ev.type === "setOff") {
        this.inCascade = true;
        this.skipHint?.setVisible(!debugPanel.stepMode);
      }
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
      const wait = this.anim.pace(ev, Math.max(animTime(ev), eventDelay(ev, mem)));
      await this.anim.run(ev, shown.view, () => {
        applyEvent(shown, ev);
        this.redraw();
      });
      // Step mode: the event and its animation have started; wait for the next click instead of the timer.
      if (debugPanel.stepMode) await debugPanel.waitForStep(ev.type);
      else if (wait > 0) await new Promise<void>((resolve) => this.time.delayedCall(scaleTime(wait), resolve));
      if (epoch !== this.epoch) return false; // the scene was restarted or left meanwhile
    }
    await this.anim.landed();
    if (epoch !== this.epoch) return false;
    this.endSkip();
    this.locked = false;
    this.hlSeat = null;
    this.handSeat = null;
    this.shown = null;
    return true;
  }
}
