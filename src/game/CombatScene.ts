import Phaser from "phaser";
import { ENEMY_SEAT, getPendingChoice, previewPlay, step } from "../engine/battle";
import type { BattleState, Choice, PendingChoice } from "../engine/battle";
import { getView } from "../engine/view";
import type { BattleView } from "../engine/view";
import type { Domino, Passive, Spark } from "../engine/types";
import type { GameEvent } from "../engine/events";
import type { Client } from "../net/client";
import type { Host } from "../net/host";
import type { HostMessage } from "../net/protocol";
import { relay } from "./relay";
import { watchLink } from "./linkBanner";
import { currentRun, openRunScreen, runSeed, setRun, startSingleRun } from "./runSession";
import { applyRunChoice } from "../engine/run";
import { drawDomino, drawSparkGlyph } from "./dominoDrawing";
import { drawBlessedGlow } from "./sparkShrineArt";
import type { DominoState } from "./dominoDrawing";
import { Tooltip } from "./tooltip";
import { battleDeckPlayers, openDeckViewer } from "./deckViewer";
import { button } from "./ui";
import { devSettings, dominoes, enemies, startBattle } from "./devBattle";
import type { GameSettings } from "./devBattle";
import { describeEvent, eventDelay, newLogMemory } from "./eventLog";
import type { LogContext } from "./eventLog";
import { debugPanel } from "./DebugPanel";
import type { DebugHost } from "./DebugPanel";
import { SPEEDS, getPlaybackSpeed, scaleTime, setPlaybackSpeed } from "./playbackSpeed";
import { Animator, COMBO_METER_FULL, animTime, comboLook, hexString, newRefs, paintBar } from "./animations";
import { applyEvent, startShown } from "./shownView";
import type { ShownTable } from "./shownView";

// The combat table. Draws everything from getView (and getPendingChoice for
// whose turn it is and which dominoes are playable). No rules live here.
// Clicking submits only choices getPendingChoice offers, then the step's events play back in
// order (see playback below), animated by animations.ts. Tooltips come from tooltip.ts.
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

const DW = 240; // a domino at scale 1 (see dominoDrawing.ts)
const DH = 120;
const FONT = "Arial, Helvetica, sans-serif";

// Table regions (1920x1080).
const MAT = { x: 370, y: 400, w: 1180, h: 360 }; // the chain
const HAND = { x: 370, y: 785, w: 1180, h: 265 }; // the active hand
const LEFT_X = 30;
const RIGHT_X = 1565;
const SIDE_W = 310;
const SIDE_TOP = 330;
const SIDE_H = 450;

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
  private logText?: Phaser.GameObjects.Text;
  private locked = false; // true while events play back: no input
  private sparkPrompt: string | null = null; // a clicked domino that answers both sparks of the set
  // During playback the table keeps showing the state from before the step; these two follow the
  // events: the seat that is highlighted, and the player whose hand is in front.
  private hlSeat: string | null = null;
  private handSeat: string | null = null;
  private settings!: GameSettings;
  private seed = 0;
  private tooltip!: Tooltip;
  private tipPlayer = ""; // whose playable dominoes get an "if played now" preview
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
    this.anim = new Animator(this, dominoes);
    this.drawTable();
    this.locked = false;
    this.sparkPrompt = null;
    this.hlSeat = null;
    this.handSeat = null;
    this.logText = this.add
      .text(LEFT_X + SIDE_W / 2, 925, this.online ? "" : "Play an opener: click a domino in your hand.", {
        fontFamily: FONT, fontSize: "26px", color: "#ffffff", align: "center", wordWrap: { width: SIDE_W - 20 },
      })
      .setOrigin(0.5);
    this.tooltip = new Tooltip(this);
    // The deck viewer (#55), read-only; the draw pile is not shown in order.
    button(this, RIGHT_X + 190, 48, "Decks", () => openDeckViewer(this, battleDeckPlayers(this.view, (id) => this.nameOf(id, false)), this.view.players.find((q) => q.id === this.tipPlayer)?.id), { size: 22, origin: 1 }).setDepth(500);
    if (this.online) {
      this.logText.setText(`Round ${data.online!.view.round}: ${this.nameOf(data.online!.view.lead, false)} leads`);
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
              if (this.inRun) setRun({ ...currentRun(), battle: state });
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

  // Single player: the one entry point for new state.
  setState(state: BattleState): void {
    this.state = state;
    this.setView(getView(state, state.players[0].id));
  }

  // The one entry point for a new view (single player: from setState; online: from the host).
  private setView(view: BattleView): void {
    this.view = view;
    this.anim.dominoes = view.dominoes; // run dominoes (instances, generated) are not in data/dominoes.json
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
    if (seat === ENEMY_SEAT) return "Enemy";
    const name = this.online?.names[seat] ?? seat;
    return forPlate && name.length > max ? name.slice(0, max - 1) + "…" : name;
  }

  // The true enemy hand, for the debug "show enemy hand" only: single player, or the host.
  private trueEnemyHand(): string[] | null {
    return (this.state ?? this.online?.host?.getState())?.enemy.hand ?? null;
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

  private showError(message: string): void {
    const text = this.logText;
    if (!text) return;
    const shown = `The host says: ${message}`;
    text.setText(shown).setColor("#ff9a94");
    this.time.delayedCall(3000, () => {
      if (text.text !== shown) return;
      text.setColor("#ffffff").setText("");
    });
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
    this.layer?.destroy(true);
    const layer = this.add.container(0, 0);
    this.layer = layer;
    const now = this.view;
    const view = this.shown?.view ?? now;
    this.anim.refs = newRefs();
    this.anim.refs.layer = layer;
    let pending = this.locked || this.waiting ? null : getPendingChoice(now);
    // Online, only the player whose turn it is gets anything to click.
    if (this.online && pending !== null && pending.player !== this.mySeat()) pending = null;
    // Single player: the front hand follows whoever's turn it is. Online: it is always your own.
    const active = this.online ? this.mySeat() : (this.handSeat ?? (now.seat === ENEMY_SEAT ? now.lead : now.seat));
    const turn = this.hlSeat ?? now.seat;
    this.tipPlayer = pending === null ? "" : pending.player;

    this.drawEnemy(layer, view, turn);
    this.drawHud(layer, view, turn);
    this.drawParty(layer, view);
    this.drawChain(layer, view);
    this.drawActiveHand(layer, view, active, pending, turn);
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
  }

  // ---- table (drawn once) ----

  private drawTable(): void {
    const g = this.add.graphics();
    g.fillStyle(0x2e2016, 1);
    g.fillRect(0, 0, 1920, 1080);
    g.fillStyle(0x4a3322, 1);
    g.fillRoundedRect(8, 8, 1904, 1064, 150);
    g.fillStyle(0x1e5a42, 1);
    g.fillRoundedRect(28, 28, 1864, 1024, 130);
    g.lineStyle(4, 0x2f7a5b, 1);
    g.strokeRoundedRect(44, 44, 1832, 992, 116);
    // A soft pool of light and the chain mat: felt markings, not boxes.
    g.fillStyle(0x246b4f, 0.55);
    g.fillEllipse(960, 560, 1500, 700);
    g.fillStyle(0x174c38, 0.6);
    g.fillRoundedRect(MAT.x, MAT.y, MAT.w, MAT.h, 60);
    g.lineStyle(3, 0x2f7a5b, 0.7);
    g.strokeRoundedRect(MAT.x, MAT.y, MAT.w, MAT.h, 60);
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

  private domino(layer: Layer, id: string | null, k: number, state: DominoState, x: number, y: number, onClick?: () => void): Phaser.GameObjects.Container {
    const d: Domino = this.view.dominoes.find((q) => q.id === id) ?? this.view.dominoes[0];
    const c = drawDomino(this, d, "large", state);
    c.setScale(k);
    c.setPosition(x, y);
    layer.add(c);
    // Every face-up domino has a tooltip; hidden enemy dominoes have none. Only a playable
    // domino in the active hand gets the engine's "if played now" numbers, worked out from the
    // view (online players have nothing else).
    if (state !== "hidden") {
      const preview = state === "playable" ? () => previewPlay(this.view, this.tipPlayer, d.id) : undefined;
      this.tooltip.attach(c, d, preview);
    }
    if (onClick) {
      c.setInteractive({ useHandCursor: true });
      c.on("pointerdown", onClick);
    }
    return c;
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
  private plate(layer: Layer, cx: number, cy: number, text: string, onTurn: boolean, fontSize = 26): void {
    const t = this.label(layer, cx, cy, text, fontSize, onTurn ? "#2a2200" : "#ffffff", 0.5, true);
    const w = t.width + 36;
    const h = fontSize + 18;
    const g = this.add.graphics();
    if (onTurn) {
      for (let i = 4; i >= 1; i--) {
        g.lineStyle(i * 5, GOLD, 0.14);
        g.strokeRoundedRect(cx - w / 2 - i * 2, cy - h / 2 - i * 2, w + i * 4, h + i * 4, h / 2 + i * 2);
      }
    }
    g.fillStyle(onTurn ? GOLD : 0x0d2a20, 0.95);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);
    layer.add(g);
    layer.bringToTop(t);
  }

  // ---- enemy (top) ----

  private drawEnemy(layer: Layer, view: BattleView, turn: string): void {
    const e = view.enemy;
    const def = enemies.find((x) => x.id === e.id);
    const onTurn = turn === ENEMY_SEAT;
    if (onTurn) {
      const g = this.gfx(layer);
      for (let i = 5; i >= 1; i--) {
        g.lineStyle(i * 5, GOLD, 0.12);
        g.strokeRoundedRect(60 - i * 2, 30 - i * 2, 1480 + i * 4, 270 + i * 4, 60 + i * 2);
      }
    }
    this.label(layer, 60, 62, def?.name ?? e.id, 48, onTurn ? "#ffe14d" : "#ffffff", 0, true);
    if (def) this.label(layer, 60, 108, def.tier.toUpperCase(), 20, "#9fd1b8", 0, true);
    this.bar(layer, "enemy", 60, 135, 400, 40, e.health, e.maxHealth, RED);
    this.shield(layer, "enemy", 80, 208, 40, e.block);
    e.passives.forEach((p, i) => this.drawPassive(layer, p, 230 + i * 130, 245));
    e.passives.forEach((p) => {
      if (p.text) this.label(layer, 60, 290, p.text, 18, "#ffe14d", 0, false);
    });

    // The enemy's hand, oldest on the left.
    const rowX = 600;
    const trueHand = this.trueEnemyHand(); // null for a joined client, which never has it
    const debug = debugPanel.showEnemyHand && trueHand !== null;
    this.label(layer, rowX - 20, 70, "Hand", 22, "#9fd1b8", 1);
    e.hand.forEach((slot, i) => {
      const x = rowX + 60 + i * 130; // 7 slots (the largest handLimit) end at x 1500, left of the party bar
      const c = slot.revealed
        ? this.domino(layer, slot.domino, 0.5, "revealed", x, 70)
        : debug
          ? this.domino(layer, this.shown?.enemyIds[i] || trueHand![i], 0.5, "revealed", x, 70) // debug only: the true domino, with a red mark
          : this.domino(layer, null, 0.5, "hidden", x, 70);
      if (!slot.revealed && debug) this.label(layer, x, 112, "DEBUG", 14, "#ff6b64", 0.5, true);
      this.anim.refs.enemyHand.push({ c, pos: { x, y: 70, k: 0.5 } });
    });
    if (debug) this.label(layer, rowX - 20, 100, "(debug view)", 16, "#ff6b64", 1, true);
    // Its whole deck, and what it has played since the last reshuffle.
    const y = this.smallRow(layer, "Deck", e.deckList, "normal", rowX, 158);
    this.smallRow(layer, "Played", e.faceUp, "playedFaceUp", rowX, y + 8);
  }

  // Small dominoes in rows that wrap. Returns the y for the row below.
  private smallRow(layer: Layer, name: string, ids: string[], state: DominoState, x: number, y: number): number {
    this.label(layer, x - 20, y, name, 22, "#9fd1b8", 1);
    if (ids.length === 0) {
      this.label(layer, x + 10, y, "none yet", 18, "#7fb59b", 0);
      return y + 34;
    }
    const perRow = 8;
    ids.forEach((id, i) => {
      this.domino(layer, id, 0.4, state, x + 50 + (i % perRow) * 104, y + Math.floor(i / perRow) * 54);
    });
    return y + Math.floor((ids.length - 1) / perRow) * 54 + 54;
  }

  private drawPassive(layer: Layer, p: Passive, x: number, y: number): void {
    const g = this.gfx(layer);
    g.fillStyle(0x0d2a20, 0.9);
    g.fillCircle(x, y, 34);
    g.lineStyle(4, GOLD, 1);
    g.strokeCircle(x, y, 34);
    if (p.kind === "auditor") {
      // A ledger page with ruled lines.
      g.fillStyle(0xf4ecd8, 1);
      g.fillRoundedRect(x - 16, y - 22, 32, 44, 4);
      g.lineStyle(3, 0x2a2a2a, 1);
      for (let i = 0; i < 4; i++) g.lineBetween(x - 10, y - 12 + i * 9, x + 10, y - 12 + i * 9);
    } else if (p.kind === "longNight") {
      // A crescent moon.
      g.fillStyle(0xf4ecd8, 1);
      g.fillCircle(x - 2, y, 20);
      g.fillStyle(0x0d2a20, 1);
      g.fillCircle(x + 8, y - 5, 17);
    } else if (p.kind === "hoarder") {
      // A shield-shaped chest.
      g.fillStyle(0x8a6a3a, 1);
      g.fillRoundedRect(x - 20, y - 14, 40, 30, 4);
      g.fillStyle(0xffe14d, 1);
      g.fillRect(x - 4, y - 4, 8, 10);
    } else if (p.kind === "smolder") {
      // A flame.
      g.fillStyle(0xff7a2b, 1);
      g.fillTriangle(x - 16, y + 20, x + 16, y + 20, x, y - 24);
      g.fillStyle(0xffe14d, 1);
      g.fillTriangle(x - 8, y + 20, x + 8, y + 20, x, y - 6);
    } else if (p.kind === "warden") {
      this.drawPadlock(g, x, y, 1.1);
    } else {
      // A mouth with teeth.
      g.fillStyle(0x7a1f2b, 1);
      g.fillEllipse(x, y + 2, 46, 30);
      g.fillStyle(0xffffff, 1);
      for (let i = 0; i < 4; i++) {
        g.fillTriangle(x - 18 + i * 9, y - 8, x - 10 + i * 9, y - 8, x - 14 + i * 9, y + 2);
      }
    }
    const name = p.kind.charAt(0).toUpperCase() + p.kind.slice(1).replace(/([A-Z])/g, " $1");
    this.label(layer, x - 44, y, name, 24, "#ffe14d", 1, true);
  }

  // A padlock centred on x, y (about 30 wide at scale 1).
  private drawPadlock(g: Phaser.GameObjects.Graphics, x: number, y: number, scale: number): void {
    g.lineStyle(5 * scale, 0xd8d8d8, 1);
    g.strokeEllipse(x, y - 9 * scale, 16 * scale, 20 * scale);
    g.fillStyle(0xe0b341, 1);
    g.fillRoundedRect(x - 14 * scale, y - 4 * scale, 28 * scale, 22 * scale, 4 * scale);
    g.fillStyle(0x2a2a2a, 1);
    g.fillCircle(x, y + 5 * scale, 3 * scale);
    g.fillRect(x - 1.5 * scale, y + 6 * scale, 3 * scale, 7 * scale);
  }

  // ---- HUD (band under the enemy) ----

  private drawHud(layer: Layer, view: BattleView, turn: string): void {
    const y = 350;
    this.label(layer, MAT.x + 10, y, `Round ${view.round}`, 36, "#ffffff", 0, true);
    if (view.result) {
      this.label(layer, MAT.x + 10, y + 36, view.result === "won" ? "Battle won" : "Battle lost", 22, "#ffe14d", 0, true);
    }

    // Turn order around the table, enemy included, lead marked.
    const n = view.seatOrder.length;
    const step = 150;
    const x0 = 900 - ((n - 1) * step) / 2;
    const g = this.gfx(layer);
    view.seatOrder.forEach((seat, i) => {
      const x = x0 + i * step;
      this.plate(layer, x, y - 6, this.nameOf(seat, true, 9), seat === turn && view.phase !== "over", 24);
      if (seat === view.lead) this.label(layer, x, y + 28, "LEAD", 16, "#ffe14d", 0.5, true);
      if (i < n - 1) {
        g.fillStyle(0x9fd1b8, 1);
        g.fillTriangle(x + step / 2 - 6, y - 14, x + step / 2 - 6, y + 2, x + step / 2 + 6, y - 6);
      }
    });

    // The spark(s) the next domino must answer.
    this.label(layer, 1330, y - 6, "Spark", 22, "#9fd1b8", 0);
    const sg = this.gfx(layer);
    if (view.chain.sparks.length === 0) this.label(layer, 1405, y - 6, "none", 22, "#ffffff", 0);
    view.chain.sparks.forEach((s, i) => {
      if (s === view.blessing?.spark) drawBlessedGlow(sg, s, 1430 + i * 56, y - 6, 22);
      drawSparkGlyph(sg, s, 1430 + i * 56, y - 6, 22);
      if (s === view.locked) this.drawPadlock(sg, 1430 + i * 56 + 10, y + 6, 0.7);
    });
    // The Warden's locked spark: players can't answer it this round.
    if (view.locked) {
      const ly = view.blessing ? y + 76 : y + 40;
      drawSparkGlyph(sg, view.locked, 1342, ly, 12);
      this.drawPadlock(sg, 1346, ly + 2, 0.6);
      this.label(layer, 1372, ly, `${view.locked} locked`, 20, "#ff8a8a", 0, true);
    }
    // The Spark Shrine's blessing, for the whole act's boss fight.
    if (view.blessing) {
      drawBlessedGlow(sg, view.blessing.spark, 1342, y + 40, 12);
      drawSparkGlyph(sg, view.blessing.spark, 1342, y + 40, 12);
      this.label(layer, 1372, y + 40, `Blessed ${view.blessing.spark}: +${view.blessing.strength}`, 20, "#ffe14d", 0, true);
    }
  }

  // ---- party health (top right) and combo meter ----

  private drawParty(layer: Layer, view: BattleView): void {
    const p = view.party;
    this.label(layer, RIGHT_X, 48, "Party", 24, "#9fd1b8", 0, true);
    this.bar(layer, "party", RIGHT_X, 68, 190, 34, p.health, p.maxHealth, 0x3fae68);
    this.shield(layer, "party", RIGHT_X + 212, 85, 34, p.block);

    // Combo meter: strength x lap.
    const { strength, lap } = view.chain;
    const total = strength * lap;
    const x = RIGHT_X;
    const g = this.gfx(layer);
    g.fillStyle(0x174c38, 0.6);
    g.fillRoundedRect(x, 135, SIDE_W, 170, 40);
    g.lineStyle(3, 0x2f7a5b, 0.7);
    g.strokeRoundedRect(x, 135, SIDE_W, 170, 40);
    this.label(layer, x + SIDE_W / 2, 160, `STRENGTH ${strength}  ×  LAP ${lap}`, 21, "#9fd1b8", 0.5, true);
    const look = comboLook(total);
    const num = this.label(layer, x + SIDE_W / 2, 220, String(total), 84, total > 0 ? hexString(look.color) : "#5f8f7a", 0.5, true);
    num.setScale(look.scale);
    this.anim.refs.meter = { text: num, rect: { x, y: 135, w: SIDE_W, h: 170 }, scale: look.scale };
    const f = Math.min(1, total / COMBO_METER_FULL);
    g.fillStyle(0x0d2a20, 1);
    g.fillRoundedRect(x + 24, 272, SIDE_W - 48, 18, 9);
    if (f > 0) {
      g.fillStyle(look.color, 1);
      g.fillRoundedRect(x + 24, 272, Math.max(18, (SIDE_W - 48) * f), 18, 9);
    }
  }

  // ---- the chain (middle) ----

  private drawChain(layer: Layer, view: BattleView): void {
    const played = view.chain.played;
    const hasSlot = view.phase !== "over";
    const innerW = MAT.w - 100;
    const innerH = MAT.h - 40;
    // Largest scale at which every domino (plus the empty slot) fits.
    const scales = [0.75, 0.6, 0.5, 0.4, 0.32, 0.26];
    let k = scales[scales.length - 1];
    let perRow = 1;
    let rows = 1;
    for (const s of scales) {
      perRow = Math.floor(innerW / (DW * s));
      rows = Math.floor(innerH / (DH * s + (s >= 0.5 ? 24 : 8)));
      k = s;
      if (perRow * rows >= played.length + (hasSlot ? 1 : 0)) break;
    }
    // If it still does not fit, show the latest dominoes and say how many are off the table.
    const capacity = perRow * rows - (hasSlot ? 1 : 0);
    const hidden = Math.max(0, played.length - capacity);
    const shown = played.slice(hidden);
    const rowH = DH * k + (k >= 0.5 ? 24 : 8);
    const w = DW * k;
    const x0 = MAT.x + (MAT.w - perRow * w) / 2;
    const slots = shown.length + (hasSlot ? 1 : 0);
    const usedRows = Math.ceil(slots / perRow);
    const y0 = MAT.y + (MAT.h - usedRows * rowH) / 2 + rowH / 2 - (k >= 0.5 ? 6 : 0);
    const g = this.gfx(layer);
    const pos = (i: number) => ({ x: x0 + (i % perRow) * w + w / 2, y: y0 + Math.floor(i / perRow) * rowH });

    shown.forEach((p, i) => {
      const { x, y } = pos(i);
      const enemy = p.seat === ENEMY_SEAT;
      if (enemy) {
        g.fillStyle(RED, 0.7);
        g.fillRoundedRect(x - w / 2 - 5, y - (DH * k) / 2 - 5, w + 10, DH * k + 10, 14 * k + 5);
      }
      const c = this.domino(layer, p.domino, k, enemy ? "playedFaceUp" : "normal", x, y);
      this.anim.refs.chain.push({ c, pos: { x, y, k } });
      if (k >= 0.5) {
        const tag = this.nameOf(p.seat, true, 10) + (i + hidden === 0 ? " (opener)" : "");
        this.label(layer, x, y + (DH * k) / 2 + 13, tag, 16, enemy ? "#ff9a94" : "#cfe9dc", 0.5, true);
      }
      // Row breaks: a small arrow at the row's end and one at the next row's start.
      if (i % perRow === perRow - 1 && i < slots - 1) {
        const next = pos(i + 1);
        g.fillStyle(0x9fd1b8, 1);
        g.fillTriangle(x + w / 2 + 6, y - 9, x + w / 2 + 6, y + 9, x + w / 2 + 20, y);
        g.fillTriangle(next.x - w / 2 - 20, next.y - 9, next.x - w / 2 - 20, next.y + 9, next.x - w / 2 - 6, next.y);
      }
    });
    if (hidden > 0) this.label(layer, MAT.x + MAT.w / 2, MAT.y + 18, `+ ${hidden} earlier`, 18, "#9fd1b8", 0.5);

    // The empty slot where the next domino goes.
    if (hasSlot) {
      const { x, y } = pos(shown.length);
      const sh = DH * k;
      for (let i = 4; i >= 1; i--) {
        g.lineStyle(i * 6, GOLD, 0.12);
        g.strokeRoundedRect(x - w / 2 - i * 2, y - sh / 2 - i * 2, w + i * 4, sh + i * 4, 14 * k + i * 2);
      }
      g.fillStyle(GOLD, 0.12);
      g.fillRoundedRect(x - w / 2, y - sh / 2, w, sh, 14 * k);
      g.lineStyle(4, GOLD, 1);
      g.strokeRoundedRect(x - w / 2, y - sh / 2, w, sh, 14 * k);
      // The spark(s) it must answer sit in the intake half.
      const sparks = view.chain.sparks;
      if (sparks.length === 0) this.label(layer, x, y, "OPENER", Math.round(40 * k + 6), "#ffe14d", 0.5, true);
      sparks.forEach((s, i) => {
        const gy = sparks.length === 1 ? y : y + (i === 0 ? -1 : 1) * 27 * k;
        drawSparkGlyph(g, s, x - 80 * k, gy, (sparks.length === 1 ? 24 : 16) * k);
      });
    }
  }

  // ---- hands ----

  private drawActiveHand(layer: Layer, view: BattleView, active: string, pending: PendingChoice | null, turn: string): void {
    const playable = new Set<string>(
      pending === null ? [] : pending.type === "opener" ? pending.dominoes : pending.options.map((o) => o.domino),
    );
    const pendingType = pending?.type ?? null;
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
    this.plate(layer, HAND.x + 110, HAND.y + 4, this.nameOf(p.id, true, 9) + you, onTurn, 28);
    let hint = pendingType === "opener" ? "Play an opener" : pendingType === "answer" ? "Answer the spark" : "";
    if (this.online && view.phase !== "over" && !this.locked) {
      if (this.waiting) hint = "Waiting for the host";
      else if (pending === null) hint = `Waiting for ${this.nameOf(turn, true, 14)}`;
    }
    const prompt = pending?.type === "answer" && this.sparkPrompt ? pending.options.find((o) => o.domino === this.sparkPrompt) : undefined;
    if (prompt) {
      this.drawSparkPrompt(layer, prompt.domino, prompt.sparks);
    } else {
      this.label(layer, HAND.x + 240, HAND.y + 4, `${hint}${hint ? "   ·   " : ""}Deck ${p.deck.length}   Discard ${p.discard.length}`, 22, "#cfe9dc", 0);
    }
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
        const click = state === "playable" ? () => this.onHandClick(id) : undefined;
        const hx = x0 + i * step;
        const hy = HAND.y + 100 + r * (DH * k + 12);
        this.domino(layer, id, k, state, hx, hy, click);
        if (!this.anim.refs.hand.has(id)) this.anim.refs.hand.set(id, { x: hx, y: hy, k });
      });
    }
  }

  // ---- input ----

  // A click on a playable domino. Playable means the engine offered it in getPendingChoice.
  private onHandClick(id: string): void {
    if (this.locked || this.waiting) return;
    const pending = getPendingChoice(this.view);
    if (pending === null) return;
    if (this.online && pending.player !== this.mySeat()) return; // not your turn
    if (pending.type === "opener") {
      if (pending.dominoes.includes(id)) this.submit({ type: "opener", domino: id });
      return;
    }
    const option = pending.options.find((o) => o.domino === id);
    if (!option) return;
    if (option.sparks.length > 1) {
      // The engine says this domino answers both sparks of the set: ask which one.
      this.sparkPrompt = id;
      this.redraw();
    } else {
      this.submit({ type: "answer", domino: id, spark: option.sparks[0] });
    }
  }

  // The inline question in the hand's header row: one button per spark the engine listed.
  private drawSparkPrompt(layer: Layer, id: string, sparks: Spark[]): void {
    const y = HAND.y + 4;
    const name = dominoes.find((d) => d.id === id)?.name ?? id;
    const t = this.label(layer, HAND.x + 240, y, `Which spark does ${name} answer?`, 22, "#ffe14d", 0, true);
    let x = HAND.x + 240 + t.width + 24;
    const button = (w: number, onClick: () => void): Phaser.GameObjects.Graphics => {
      const g = this.gfx(layer);
      g.fillStyle(0x0d2a20, 0.95);
      g.fillRoundedRect(x, y - 20, w, 40, 20);
      g.lineStyle(3, GOLD, 1);
      g.strokeRoundedRect(x, y - 20, w, 40, 20);
      const z = this.add.zone(x + w / 2, y, w, 40).setInteractive({ useHandCursor: true });
      z.on("pointerdown", onClick);
      layer.add(z);
      return g;
    };
    for (const s of sparks) {
      const g = button(150, () => this.submit({ type: "answer", domino: id, spark: s }));
      drawSparkGlyph(g, s, x + 26, y, 14);
      this.label(layer, x + 50, y, s, 22, "#ffffff", 0, true);
      x += 162;
    }
    button(100, () => {
      this.sparkPrompt = null;
      this.redraw();
    });
    this.label(layer, x + 50, y, "Cancel", 20, "#cfe9dc", 0.5);
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
    this.sparkPrompt = null;
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
  // pre-step view with each event's numbers, animations.ts animates it) while the log line and
  // the highlighted seat follow too. The caller then redraws from the new state or view, so the
  // final table is exactly what the engine says. Input is locked until then.
  // Returns false if the scene was left meanwhile.
  private async playback(events: GameEvent[]): Promise<boolean> {
    this.locked = true;
    const before = this.view;
    // The enemy's hand by position; online the hidden ones are not known, only the revealed.
    const enemyIds = this.state ? this.state.enemy.hand.slice() : before.enemy.hand.map((slot) => (slot.revealed ? slot.domino : ""));
    this.shown = startShown(JSON.parse(JSON.stringify(before)) as BattleView, enemyIds);
    this.redraw();
    debugPanel.stateChanged();
    const enemyName = enemies.find((e) => e.id === before.enemy.id)?.name ?? before.enemy.id;
    const ctx: LogContext = {
      enemyName,
      name: (seat) => (seat === ENEMY_SEAT ? enemyName : this.nameOf(seat, false)),
      domino: (id) => before.dominoes.find((d) => d.id === id)?.name ?? id,
    };
    const mem = newLogMemory();
    const epoch = this.epoch;
    const isPlayer = (seat: string) => seat !== ENEMY_SEAT;
    for (const ev of events) {
      let hl: string | null = this.hlSeat;
      let hand: string | null = this.handSeat;
      switch (ev.type) {
        case "roundStart": hl = ev.lead; hand = ev.lead; break;
        case "draw": hl = ev.seat; break;
        case "opener": hl = ev.player; hand = ev.player; break;
        case "pass": hl = ev.to; if (isPlayer(ev.to)) hand = ev.to; break;
        case "play": hl = ev.seat; if (isPlayer(ev.seat)) hand = ev.seat; break;
        case "enemyDiscard": case "enemyNoReaction": case "leftover": hl = ENEMY_SEAT; break;
      }
      const text = describeEvent(ev, ctx, mem);
      if (text !== null) this.logText?.setText(text);
      if (hl !== this.hlSeat || hand !== this.handSeat) {
        this.hlSeat = hl;
        this.handSeat = hand;
        this.redraw();
      }
      const shown = this.shown;
      const delay = eventDelay(ev, mem);
      const wait = ev.type === "chainEnd" ? delay : Math.max(animTime(ev, before.dominoes), delay);
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

  private get turnSeat(): string {
    return this.hlSeat ?? this.view.seat;
  }

  private drawTeammate(layer: Layer, view: BattleView, id: string, x: number, y: number, h: number): void {
    const p = view.players.find((q) => q.id === id);
    if (!p) return;
    this.plate(layer, x + SIDE_W / 2, y + 22, this.plateName(p.id), this.online !== null && view.phase !== "over" && this.turnSeat === p.id, 26);
    this.label(layer, x + SIDE_W / 2, y + 62, `Deck ${p.deck.length}   Discard ${p.discard.length}`, 20, "#cfe9dc", 0.5);
    const top = y + 90;
    const avail = h - 100;
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
      this.domino(layer, did, k, "normal", x0 + (i % per) * stepX, top + (DH * k) / 2 + row * (DH * k + 6));
    });
    if (p.hand.length === 0) this.label(layer, x + SIDE_W / 2, top + 20, "No dominoes", 20, "#7fb59b", 0.5);
  }
}
