import Phaser from "phaser";
import { getOpenEnds, getPlayerChoices, previewBuild, previewPlay, previewSetOff, step } from "../engine/battle";
import type { BattleState, Choice, PlayerChoices, SetOffPreview } from "../engine/battle";
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
import { FuseBoard, boardArea, capTotals, chargesInto, liveNumber } from "./fuseBoard";
import { HandRow, handArea } from "./handRow";
import { SetOffPreviewUi } from "./setOffPreview";
import { boardGlow } from "./spectacle";
import { litGlowStrength } from "./buildup";
import { applyEvent, startShown } from "./shownView";
import { isDrawEvent, playDraws } from "./drawAnimation";
import { combatData, combatLayoutData, fuseBoardData, handRowData, hexColour } from "./presentation";
import type { CombatCtx } from "./combatCtx";
import { drawEnemyUnit } from "./enemyUnit";
import { SeatTabs } from "./seatTabs";
import { drawActions, drawBackdrop, drawColumnPanel, drawFooter, drawPartyBar } from "./combatHud";
import { columnLayout, footerSpots } from "./columnLayout";
import type { ColumnLayout } from "./columnLayout";
import { drawTally } from "./setOffTally";
import { setMenuButtonSpot } from "./menuButton";
import type { ShownTable } from "./shownView";

// The combat table. Draws everything from getView (and getPlayerChoices for which dominoes can be
// placed or taken back, getOpenEnds for the charge on each open end, previewPlay and previewSetOff for
// the previews). No rules live here: layout only.
// Everyone builds at the same time (0.2): your hand is always live while you have placements and are
// not Ready. Clicking (or dragging) submits only choices getPlayerChoices offers, then the step's events
// play back in order (see playback below), animated by animations.ts. Tooltips come from tooltip.ts.
//
// Run mode (#50): started with { run: true }, the battle is the current run's. Choices go to
// applyRunChoice, and when the battle is over the run's phase says which screen opens next.
// Online (#49) a run's battle is the same online table as below; when it ends, the screen for the
// run's new phase (which the host's run update has already set) opens after a short pause.
//
// One scene serves both modes (#34). Single player owns the BattleState and steps it itself.
// Online, the scene never has a BattleState: it holds the latest BattleView and plays back the
// events the host sends, on the host's machine too (the host's own player gets its messages by
// the same path). Choices go to the host, which checks them; your hand stays locked until its
// reply (an update, or an error) arrives. Teammates' placements arrive as updates and play back as they
// come. Your own hand is in front; every seat, yours too, has a tab across the top. Single player: a click
// on a tab brings that seat's hand to the front, and one Fire button makes every seat Ready.

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
// The board's area (boardArea) and the hand's place (handArea) are rectangles in data, not placed from other parts here.
const ACTIONS = combatLayoutData.actions;
const TAKE_BACK = combatLayoutData.takeBack;
const NOTE = combatLayoutData.note;

export class CombatScene extends Phaser.Scene {
  private state: BattleState | null = null; // single player only
  private view!: BattleView; // what the table shows when no step is being played back
  private online: OnlineData | null = null;
  private waiting = false; // online: a choice was sent and the host has not answered yet
  private queue: Update[] = []; // online: updates not played back yet
  private draining = false;
  private layer?: Layer;
  private locked = false; // true while events play back: no input
  private selected: string | null = null; // a clicked hand domino, waiting for an open end
  private board?: FuseBoard; // the fuse board as drawn (fuseBoard.ts)
  private handRow?: HandRow; // your hand as drawn (handRow.ts)
  private hoverKey: string | null = null; // the hand domino under the pointer (a hand key), playable or not
  private handPlayable = new Set<string>(); // the engine's playable ids in the hand as drawn
  private openCharge = new Map<number, number>(); // the charge reaching each open end, for the player acting
  private intoKey = "";
  private intoCache = new Map<number, number>();
  private capsKey = "";
  private capsCache = new Map<number, number>();
  private slotBoxes = new Map<number | "opener", Box>(); // where each open end (and the opener slot) is drawn, for hints and drops
  // A hand domino (or, with node, one of your dominoes on the board) pressed, and maybe being dragged.
  private drag: { id: string; x: number; y: number; node?: number; ghost?: Phaser.GameObjects.Container } | null = null;
  private dragStarting = false; // the redraw that starts a board drag must not cancel it
  private dropHint?: Phaser.GameObjects.Graphics; // the hand row lit while a board domino is dragged over it
  private front = ""; // the seat whose hand is in front (single player: any seat, by its tab; online: yours)
  private note?: Phaser.GameObjects.Text; // a refusal by your hand
  private dragMoved = false; // the last press turned into a drag: it is not a tap
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
  private tabs!: SeatTabs; // the seat tabs (seatTabs.ts)
  private col!: ColumnLayout; // where the left column's parts are this redraw (the tally draws into it)
  private ctx!: CombatCtx; // what enemyUnit.ts, seatTabs.ts and combatHud.ts draw with
  private hoverId: string | null = null; // the playable hand domino under the pointer (its legal ends light up)
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
    this.handRow = undefined;
    this.hoverKey = null;
    this.hoverId = null;
    this.shown = null;
    this.hoverPlay = null;
    this.previewUi?.clear();
    this.previewUi = new SetOffPreviewUi(this);
    this.drawTable();
    this.ctx = this.makeCtx();
    this.tabs = new SeatTabs(this.ctx);
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
    this.tooltip = new Tooltip(this);
    this.tooltip.avoid = { x: ACTIONS.ready.x, y: ACTIONS.ready.y - 20, w: ACTIONS.ready.w, h: ACTIONS.ready.h + 20 }; // Ready
    setMenuButtonSpot(footerSpots().menu); // the menu button sits in the column's footer while this screen is up
    this.pings = new PingMarks(this);
    this.front = this.online?.seat ?? "";
    this.note = undefined;
    this.dropHint = undefined;
    if (this.online) {
      this.setView(this.online.view);
      const handler = (m: HostMessage) => this.onMessage(m);
      relay.handler = handler;
      watchLink(this, this.online.client);
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
    if (!state.players.some((p) => p.id === this.front)) this.front = state.seatOrder[0];
    this.setView(getView(state, this.front)); // the seat whose hand is in front: Spyglass and the open ends follow it
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
      // The host refused the choice (only this player is told): say so by the hand, and the domino stays in it.
      this.waiting = false;
      this.showNote(m.message);
      if (!this.locked) this.redraw();
    } else if (m.type === "presence" || m.type === "playing-for") {
      // relay has kept it; the tabs show who is away, and the host may now play from a seat it has taken over.
      if (!this.locked) this.redraw();
    }
    // "lobby" is kept in relay.lobby and acted on by the end screen.
  }

  // A click on this seat's tab may bring its hand to the front: any seat in single player; online your own,
  // and (the host only) a seat that is away and that the host has taken over, once the wait has run out.
  private pickable(seat: string): boolean {
    const online = this.online;
    if (!online) return true;
    return seat === online.seat || (online.host !== undefined && seat === relay.playingFor);
  }

  // The seat whose hand is in front, and who the choices on this screen are for.
  private frontSeat(): string {
    return this.pickable(this.front) ? this.front : this.online!.seat;
  }

  private isAway(seat: string): boolean {
    return relay.roster?.players.find((p) => p.seat === seat)?.away === true;
  }

  // Hold on a domino: the host checks it and sends the ring to everyone (this player included).
  private sendPing(target: PingTarget): void {
    const online = this.online;
    if (!online) return;
    if (online.host) online.host.submitLocalPing(target);
    else online.client?.sendPing(target);
  }

  // A refusal, shown by your hand for a moment: the host's own words, or what data says they mean.
  private showNote(message: string): void {
    const text = message.replace(/^choice rejected: /, "");
    const known = (NOTE.texts as Record<string, string>)[text];
    this.note?.destroy();
    const a = handArea();
    const t = this.add
      .text(a.x + a.w / 2, a.y + NOTE.dy, known ?? text, { fontFamily: FONT, fontSize: `${NOTE.size}px`, color: NOTE.colour, stroke: "#101010", strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(600);
    this.note = t;
    this.time.delayedCall(NOTE.ms, () => t.destroy());
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
    this.handRow?.destroy();
    this.layer?.destroy(true);
    const layer = this.add.container(0, 0);
    this.layer = layer;
    const now = this.view;
    const view = this.shown?.view ?? now;
    this.anim.refs = newRefs();
    this.anim.refs.layer = layer;
    this.pingBoxes = new Map();
    if (this.drag?.node !== undefined && !this.dragStarting) this.endDrag(); // the board changed under a dragged board domino: its node number may be stale
    const front = this.frontSeat();
    const pending = this.locked || this.waiting ? null : getPlayerChoices(now, front);
    if (this.selected !== null && !pending?.plays.some((o) => o.domino === this.selected)) this.selected = null;

    const ctx = this.ctx;
    const col = columnLayout(view);
    this.col = col;
    drawColumnPanel(ctx, layer);
    this.tabs.draw(layer, view, {
      front,
      you: this.online ? this.online.seat : front,
      pickable: (seat) => this.pickable(seat),
      onPick: (seat) => this.pickSeat(seat),
      isAway: (seat) => this.online !== null && this.isAway(seat),
      nameOf: (seat) => this.nameOf(seat, true, 8),
    });
    drawEnemyUnit(ctx, layer, view, col);
    this.anim.hype.showLine(view.enemy.line); // the line meter under the cascade number, empty until the set-off
    drawPartyBar(ctx, layer, view, col);
    drawFooter(ctx, layer, view.round);
    this.drawBoard(layer, view, front, pending);
    this.drawActiveHand(layer, view, front, pending);
    this.drawActionButtons(layer, view, front);
    this.pings.place(this.pingBoxes);
    this.previewLayer = this.add.container(0, 0);
    layer.add(this.previewLayer);
    this.refreshPreview();
  }

  // Single player (and the host, for a seat it has taken over): a click on a tab brings that seat's hand to the front.
  private pickSeat(seat: string): void {
    if (this.locked || this.waiting || this.view.phase === "over" || !this.pickable(seat) || seat === this.frontSeat()) return;
    this.front = seat;
    this.selected = null;
    if (this.state) this.setView(getView(this.state, seat));
    else this.redraw();
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

  // What playing a hand domino would do on each end it fits, for its tooltip: that domino's own value there, never
  // a total. All numbers come from previewPlay, for the seat whose hand is in front (their charms count).
  private tipPreviews(id: string): TipPreview[] {
    const front = this.frontSeat();
    const pending = getPlayerChoices(this.view, front);
    const option = pending?.plays.find((o) => o.domino === id);
    if (!pending || !option) return [];
    const targets: (number | undefined)[] = pending.opener ? [undefined] : option.ends;
    const out: TipPreview[] = [];
    for (const end of targets) {
      const preview = previewPlay(this.view, front, id, end);
      if (preview) out.push({ where: end === undefined ? "Opener" : `${this.view.board.ends.find((e) => e.id === end)!.spark} end`, preview });
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
      staggerHeld: () => this.anim.hype.staggerHeld(),
      deckSpot: (l, seat, x, y, text) => {
        const c = this.add.container(x, y);
        l.add(c);
        this.anim.refs.decks.set(seat, { c, text, x, y });
      },
      openDeck: (seat) => openDeckViewer(this, battleDeckPlayers(this.view, (id) => this.nameOf(id, false)), seat),
    };
  }

  // ---- set-off preview (#222) ----

  // The preview on the party's bar and shield, and the block tile, from the engine's previewBuild on the current
  // board, or on the board after the hovered play (it never depends on a lethal hit or the line). With
  // combat.showDamageTotal the old tally also reads previewSetOff. Hidden while a step plays back; the real bars take over.
  private refreshPreview(): void {
    this.refreshLive();
    const into = this.previewLayer;
    if (!into?.active) return;
    const view = this.view;
    const tally = (p: SetOffPreview | null, b: { block: number; partyDamage: number } | null): void => drawTally(this, into, view, p, b, this.col, (o, low, high, ms) => this.previewUi.pulse(o, low, high, ms));
    if (this.locked || this.waiting || this.shown || view.phase === "over") {
      this.previewUi.draw(into, view, null, this.anim.refs);
      tally(null, null);
      return;
    }
    const hover = this.hoverPlay;
    const b = (hover ? previewBuild(view, hover) : null) ?? previewBuild(view);
    const p = combatData.showDamageTotal ? (hover ? previewSetOff(view, hover) : null) ?? previewSetOff(view) : null;
    this.previewUi.draw(into, view, b, this.anim.refs);
    tally(p, b);
  }

  // A hand domino hovered, picked or dragged over a legal end: preview the board with it there.
  // Returns whether the hovered play changed (and so the preview was refreshed).
  private setHoverPlay(id: string | null, end?: number): boolean {
    const front = this.frontSeat();
    const pending = id === null || this.locked || this.waiting ? null : getPlayerChoices(this.view, front);
    const next = id !== null && pending ? { player: front, domino: id, end } : null;
    if (JSON.stringify(next) === JSON.stringify(this.hoverPlay)) return false;
    this.hoverPlay = next;
    this.refreshPreview();
    return true;
  }

  // ---- the board (middle) ----

  // The fuse board (fuseBoard.ts): small dominoes joined by fuses, in the area from data. Every domino
  // shows its own number (the charge on its fuse, a cap's value on the cap), never a total. Your own
  // dominoes that can be taken back show a control on hover (or drag them to your hand). The combo
  // number (comboHype.ts) sits over the middle of it during a cascade.
  private drawBoard(layer: Layer, view: BattleView, active: string, pending: PlayerChoices | null): void {
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
      capTotals: this.capsFor(view),
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
      if (pending?.takeBacks.includes(n.id)) this.takeBackControl(layer, c, n.id, b);
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

  // What each placed cap goes off for, remembered like chargesFor.
  private capsFor(view: BattleView): Map<number, number> {
    const key = JSON.stringify([view.board.nodes.map((n) => [n.domino, n.owner, n.end]), view.players.map((p) => p.charms), view.blessing]);
    if (this.capsKey !== key) {
      this.capsCache = capTotals(view);
      this.capsKey = key;
    }
    return this.capsCache;
  }

  // A small take-back control at the corner of one of your dominoes that nothing hangs from (the engine says
  // which: takeBacks): it shows while the pointer is on the domino or the control. A press on the domino and a
  // drag to your hand takes it back too (see onDragMove).
  private takeBackControl(layer: Layer, tile: Phaser.GameObjects.Container, node: number, b: { x: number; y: number }): void {
    const T = TAKE_BACK;
    const btn = this.add.container(b.x + T.dx, b.y + T.dy).setVisible(false);
    const g = this.add.graphics();
    g.fillStyle(hexColour(T.fill), 1);
    g.fillCircle(0, 0, T.size / 2);
    g.lineStyle(T.strokeWidth, hexColour(T.stroke), 1);
    g.strokeCircle(0, 0, T.size / 2);
    const t = this.add.text(0, -1, T.text, { fontFamily: FONT, fontSize: `${T.textSize}px`, color: T.colour, fontStyle: "bold" }).setOrigin(0.5);
    btn.add([g, t]);
    btn.setSize(T.size, T.size).setInteractive({ useHandCursor: true });
    layer.add(btn);
    let timer: Phaser.Time.TimerEvent | null = null;
    const show = () => {
      timer?.remove();
      timer = null;
      if (this.drag?.ghost) return;
      btn.setVisible(true);
    };
    const hide = () => {
      timer?.remove();
      timer = this.time.delayedCall(T.hideMs, () => btn.setVisible(false));
    };
    tile.on("pointerover", show);
    tile.on("pointerout", hide);
    btn.on("pointerover", show);
    btn.on("pointerout", hide);
    btn.on("pointerdown", () => this.submit({ type: "takeBack", player: this.frontSeat(), node }));
    // Pressing the domino itself may start a drag to the hand.
    tile.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.locked || this.waiting || this.drag) return;
      this.drag = { id: this.view.board.nodes.find((n) => n.id === node)!.domino, x: pointer.worldX, y: pointer.worldY, node };
    });
  }

  // A soft glow round a rounded rectangle.
  private glow(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, r: number, strength = 1): void {
    for (let i = 4; i >= 1; i--) {
      g.lineStyle(i * 6, color, Math.min(1, 0.12 * strength));
      g.strokeRoundedRect(x - i * 2, y - i * 2, w + i * 4, h + i * 4, r + i * 2);
    }
  }

  // What a hovered, picked or dragged hand domino shows: it lifts in the row, its legal ends light up
  // and each shows the engine's preview of playing it there (previewPlay): that domino's own value, never
  // a total: a cap's value in green over its working (red when below its base), or the charge an amplifier
  // or junction passes on. With an end aimed at (a drag over it, a hover on it) that end is the one lit; the
  // others stay, dimmer. Part of refreshPreview, so the party's preview follows the same hover.
  private refreshLive(): void {
    const board = this.board;
    const handRow = this.handRow;
    if (!board || !handRow) return;
    board.clearLive();
    board.clearHighlight();
    handRow.pick(this.selected === null ? null : handRow.items.find((i) => i.id === this.selected)?.key ?? null);
    handRow.hover(this.drag?.ghost ? null : this.hoverKey);
    const view = this.view;
    const front = this.frontSeat();
    const pending = this.locked || this.waiting || this.shown ? null : getPlayerChoices(view, front);
    const id = this.hoverPlay?.domino ?? this.hoverId ?? this.selected;
    const option = pending && id !== null ? pending.plays.find((o) => o.domino === id) : undefined;
    if (!pending || id === null || !option) return;
    const d = this.dominoOf(id);
    const aimed = this.hoverPlay?.domino === id ? this.hoverPlay.end : undefined;
    board.highlightLegal(option.ends, pending.opener);
    const targets: (number | "opener")[] = pending.opener ? ["opener"] : option.ends;
    for (const t of targets) {
      // The acting seat's own charms: previewPlay with its id, never another seat's view.openEnds.
      const p = previewPlay(view, front, id, t === "opener" ? undefined : t);
      if (!p) continue;
      const reaching = t === "opener" ? fuseBoardData.openerCharge : this.openCharge.get(t) ?? 0;
      board.showLive(t, liveNumber(d, p, reaching), aimed === undefined || aimed === t);
    }
  }

  // ---- hands ----

  // Your hand (a straight row, handRow.ts) along the bottom, placed from data. Your deck and discard open from your seat tab.
  // It is always live while you have placements and are not Ready; while Ready (or with none left) it is dimmed
  // and can't be dragged. Single player: the seat in front, framed in its colour.
  private drawActiveHand(layer: Layer, view: BattleView, active: string, pending: PlayerChoices | null): void {
    const p = view.players.find((x) => x.id === active);
    if (!p) return;
    const playable = new Set<string>(pending === null ? [] : pending.plays.map((o) => o.domino));
    this.handPlayable = playable;
    const live = view.phase !== "over" && pending !== null;
    const handRow = new HandRow(this, layer, { onHover: (key) => this.onHandHover(key), onDown: (key, pointer) => this.onHandDown(key, pointer) });
    this.handRow = handRow;
    handRow.draw({ hand: p.hand, dominoes: view.dominoes, playable: live ? playable : null, owner: seatColour(view.seatOrder, p.id) });
    const refs = this.anim.refs;
    // New draws come in from the left edge of the row's area (the animator flies them from your deck's spot).
    const entry = handRow.entryPoint();
    const stack = refs.decks.get(p.id);
    if (stack) { stack.x = entry.x; stack.y = entry.y; }
    if (p.hand.length === 0) {
      const a = handArea();
      this.label(layer, a.x + a.w / 2, a.y + a.h / 2, "No dominoes in hand", 28, "#7fb59b", 0.5);
    }
    if (p.id !== this.online?.seat && view.seatOrder.length > 1) this.handFrame(layer, view, p.id);
    const slots = this.slotsOf(p.id);
    for (const it of handRow.items) {
      const pos = { x: it.slot.x, y: it.slot.y, k: it.slot.k };
      slots[it.index] = { c: it.holder, pos };
      if (!refs.hand.has(it.id)) refs.hand.set(it.id, pos);
      const d = this.dominoOf(it.id);
      const can = live && playable.has(it.id);
      this.tooltip.attach(it.holder, d, can ? () => this.tipPreviews(d.id) : undefined);
      if (this.online) {
        const ping: PingTarget = { zone: "hand", seat: p.id, index: it.index };
        this.pingBoxes.set(pingKey(ping), it.holder);
        attachHold(this, it.holder, () => this.sendPing(ping), can ? () => this.onHandTap(it.id) : undefined);
      }
    }
    if (this.drag?.ghost && this.drag.node === undefined) handRow.setDragged(handRow.items.find((i) => i.id === this.drag!.id)?.key ?? null);
  }

  // A seat's hand that is not your own seat's (single player; the host playing for an away seat): framed in
  // its colour, with whose hand it is.
  private handFrame(layer: Layer, view: BattleView, seat: string): void {
    const F = combatLayoutData.handFrame;
    const a = handArea();
    const g = this.gfx(layer);
    g.lineStyle(F.width, seatColour(view.seatOrder, seat), 1);
    g.strokeRoundedRect(a.x - F.pad, a.y - F.padTop, a.w + 2 * F.pad, Math.min(a.h + F.padTop + F.pad, 1076 - (a.y - F.padTop)), 18); // the playable dominoes of the top row stand a little above it
    this.label(layer, a.x - F.pad + 14, a.y + F.label.dy, `${this.online ? "Playing for " : ""}${this.nameOf(seat, true, 14)}${this.online ? "" : "'s hand"}`, F.label.size, "#f3ead6", 0, true);
  }

  // The action bottom right (L7): Ready (Fire in single player), with how many seats are Ready online.
  private drawActionButtons(layer: Layer, view: BattleView, front: string): void {
    const me = view.players.find((p) => p.id === front);
    drawActions(this.ctx, layer, {
      fire: !this.online,
      ready: this.online !== null && me?.ready === true,
      enabled: view.phase !== "over" && !this.locked && !this.waiting && !this.drag?.ghost,
      count: this.online ? { ready: view.players.filter((p) => p.ready).length, total: view.players.length } : null,
      onPress: () => this.pressReady(),
    });
  }

  // Online: toggle your Ready (the host's Ready for the seat in front, when it plays for an away seat). Single player:
  // Fire sets every seat Ready, the last one firing the cascade.
  private pressReady(): void {
    if (this.drag?.ghost) return;
    const view = this.view;
    if (!this.online) {
      this.submit(...view.players.filter((p) => !p.ready).map((p): Choice => ({ type: "ready", player: p.id, ready: true })));
      return;
    }
    const front = this.frontSeat();
    this.submit({ type: "ready", player: front, ready: view.players.find((p) => p.id === front)?.ready !== true });
  }

  // The pointer on a hand domino: it lifts (hand row), and, if playable, the hover updates the live numbers
  // and the party's preview together. A domino with one place to go previews that play.
  private onHandHover(key: string | null): void {
    if (this.drag?.ghost) return;
    this.hoverKey = key;
    const item = key === null ? undefined : this.handRow?.items.find((i) => i.key === key);
    const id = item && this.handPlayable.has(item.id) && this.selected !== item.id ? item.id : null;
    this.hoverId = id;
    let changed = false;
    if (id !== null) {
      const pending = getPlayerChoices(this.view, this.frontSeat());
      const ends = pending?.plays.find((o) => o.domino === id)?.ends ?? [];
      changed = this.setHoverPlay(pending?.opener || ends.length === 1 ? id : null, ends[0]);
    } else changed = this.setHoverPlay(null);
    if (!changed) this.refreshPreview();
  }

  // A press on a hand domino: a tap picks it (offline; online the tap fires on release, see
  // drawActiveHand) and the press may turn into a drag (see onDragMove).
  private onHandDown(key: string, pointer: Phaser.Input.Pointer): void {
    const item = this.handRow?.items.find((i) => i.key === key);
    if (!item || !this.handPlayable.has(item.id)) return;
    if (!this.online) this.onHandTap(item.id);
    this.drag = { id: item.id, x: pointer.worldX, y: pointer.worldY };
  }

  // ---- input ----

  // A tap on a playable hand domino picks it (or puts it back); then the open end is clicked.
  private onHandTap(id: string): void {
    if (this.locked || this.waiting || this.dragMoved) return;
    const pending = getPlayerChoices(this.view, this.frontSeat());
    if (pending === null || !pending.plays.some((o) => o.domino === id)) return;
    this.selected = this.selected === id ? null : id;
    this.redraw();
  }

  // A click on an open end (or the opener slot) with a domino picked. Only plays the engine offered.
  private onSlotClick(target: number | "opener"): void {
    if (this.locked || this.waiting || this.selected === null) return;
    this.play(this.selected, target);
  }

  private play(id: string, target: number | "opener"): void {
    const front = this.frontSeat();
    const pending = getPlayerChoices(this.view, front);
    const option = pending?.plays.find((o) => o.domino === id);
    if (!pending || !option) return;
    if (target === "opener") {
      if (pending.opener) this.submit({ type: "play", player: front, domino: id });
    } else if (option.ends.includes(target)) {
      this.submit({ type: "play", player: front, domino: id, end: target });
    }
  }

  // A pressed hand domino (or board domino of yours) that moves far enough becomes a ghost domino following
  // the pointer. A board domino can only be dropped on your hand row (a take-back).
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
      if (drag.node === undefined) {
        this.selected = drag.id;
        this.redraw(); // the Ready button goes dim while a domino is dragged
        this.handRow?.setDragged(this.handRow.items.find((i) => i.id === drag.id)?.key ?? null);
      } else {
        this.dropHint = this.add.graphics().setDepth(790);
        this.dragStarting = true;
        this.redraw(); // the Ready button goes dim
        this.dragStarting = false;
      }
    }
    drag.ghost.setPosition(pointer.worldX, pointer.worldY);
    if (drag.node !== undefined) {
      const over = this.overHand(pointer);
      const a = handArea();
      const pad = TAKE_BACK.dragHandPad;
      this.dropHint?.clear();
      if (over) {
        this.dropHint?.lineStyle(handRowData.drag.width, hexColour(handRowData.drag.colour), 1);
        this.dropHint?.strokeRoundedRect(a.x - pad / 2, a.y - pad / 2, a.w + pad, a.h + pad, 18);
      }
      return;
    }
    // Over a legal end: preview the board with the domino there.
    const over = this.slotAt(pointer);
    const legal = getPlayerChoices(this.view, this.frontSeat())?.plays.find((o) => o.domino === drag.id)?.ends;
    this.setHoverPlay(over !== undefined && over !== "opener" && legal?.includes(over) ? drag.id : null, over === "opener" ? undefined : over);
  }

  // The pointer is over your hand row (with some room round it).
  private overHand(pointer: Phaser.Input.Pointer): boolean {
    const a = handArea();
    const pad = TAKE_BACK.dragHandPad;
    return pointer.worldX >= a.x - pad && pointer.worldX <= a.x + a.w + pad && pointer.worldY >= a.y - pad && pointer.worldY <= a.y + a.h + pad;
  }

  // The open end (or the opener slot) under the pointer, with a little room round it.
  private slotAt(pointer: Phaser.Input.Pointer): number | "opener" | undefined {
    const near = 24;
    for (const [target, b] of this.slotBoxes) {
      if (Math.abs(pointer.worldX - b.x) <= b.w / 2 + near && Math.abs(pointer.worldY - b.y) <= b.h / 2 + near) return target;
    }
    return undefined;
  }

  // Dropping a hand domino on an open end (or the opener slot) plays there; anywhere else puts it back. Dropping a
  // board domino on your hand row takes it back.
  private onDragEnd(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    if (!drag?.ghost) {
      this.drag = null;
      return;
    }
    const node = drag.node;
    const hand = node !== undefined && this.overHand(pointer);
    this.endDrag();
    this.time.delayedCall(0, () => (this.dragMoved = false)); // after the release has also reached the domino (it is not a tap)
    if (this.locked || this.waiting) return;
    if (node !== undefined) {
      if (hand) this.submit({ type: "takeBack", player: this.frontSeat(), node });
    } else {
      const target = this.slotAt(pointer);
      if (target !== undefined) this.play(drag.id, target);
    }
    if (!this.waiting && !this.locked) this.redraw(); // the Ready button comes back; a refused or unplayed domino is back in the row
  }

  // The drag is over (or cancelled): the ghost goes and the hand row is lit no more.
  private endDrag(): void {
    this.drag?.ghost?.destroy();
    this.drag = null;
    this.dropHint?.destroy();
    this.dropHint = undefined;
    this.handRow?.setDragged(null);
    this.setHoverPlay(null);
  }

  // ---- submitting and playback ----

  // One choice, or (single player's Fire) several in a row: their events play back as one step.
  private submit(...choices: Choice[]): void {
    if (this.locked || this.waiting || choices.length === 0) return;
    this.selected = null;
    const online = this.online;
    if (online) {
      // Send the choice to the host and lock your hand until it answers (an update or an error).
      this.waiting = true;
      this.redraw();
      if (online.host) online.host.submitLocal(choices[0]);
      else online.client?.sendChoice(choices[0]);
      return;
    }
    let state = this.state!;
    let run = this.inRun ? currentRun() : null;
    const events: GameEvent[] = [];
    try {
      for (const choice of choices) {
        const result = step(state, choice);
        state = result.state;
        events.push(...result.events);
        // In a run the run engine takes the choice too, and decides what comes after the battle.
        // (step above only supplies the events and the final table to draw.)
        if (run) run = applyRunChoice(run, choice.player, { type: "battle", choice }).run;
      }
    } catch (e) {
      this.showNote(e instanceof Error ? e.message : "that can't be done now");
      return;
    }
    const final = state;
    void this.playback(events).then((finished) => {
      if (!finished) return;
      if (run) setRun(run);
      this.setState(final);
    });
  }

  // Plays the step's events in order. The table follows them (shownView.ts nudges a copy of the
  // pre-step view with each event's numbers, animations.ts animates it). The caller then redraws from the new state or view, so the
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
    this.anim.buildup.clear(); // the camera goes back at once
    this.board?.stopBurns(); // every fuse burnt all the way
    this.handRow?.snap();
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
      trackEvent(ev, mem);
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
    this.shown = null;
    return true;
  }
}
