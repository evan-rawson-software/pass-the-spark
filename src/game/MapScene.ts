import Phaser from "phaser";
import { applyRunChoice } from "../engine/run";
import type { RunEvent, RunNodeType, RunState } from "../engine/run";
import { content } from "./devBattle";
import { scaleTime } from "./playbackSpeed";
import { playVoteRoll } from "./voteRoll";
import { drawPartyHud, drawRunHeader, drawWaitingFor } from "./partyHud";
import { currentRun, isOnlineRun, myPending, openRunScreen, seatName, setRun, submitRunChoice, watchRun } from "./runSession";
import { bossTip, passiveText } from "./bossInfo";
import { artImage } from "./art";
import { Tooltip } from "./tooltip";
import { deckViewerState } from "./deckViewer";
import { drawBackground, FONT, label, PLAYER_COLORS } from "./ui";

// The map screen (#51). It draws the act the engine generated: floors bottom to top, the
// connections, a code-drawn icon per stop type and the boss at the top. The party's position is
// marked, and the stops the engine says can be voted for are lit. In single player the screen asks once,
// sends that pick as every seat's vote and opens the chosen stop straight away. Which stops are lit, the tally and the weighted draw all come from
// the run engine; this screen only draws them and sends the vote.
// Online (#49) every player votes at once on their own screen; the votes appear on the map as the
// host reports them, and when the last one is in everyone sees the winner (and the draw odds).

const CENTER_X = 1020;
const NODE_GAP = 250;
const FLOOR_STEP = 190; // the act is laid out on a canvas taller than the screen and scrolls (#149)
const WORLD_PAD = 130; // canvas above the boss and below floor 1
const BOSS_Y = WORLD_PAD;
const NODE_R = 44;
// The part of the screen the map scrolls in: right of the side panel, under the heading, party
// display and charms, above the bottom status line. Everything else stays put.
const VIEW = { x: 470, y: 185, w: 1430, h: 835 };
const BAR_X = 1906;
const DRAG_SLOP = 8; // pixels a press may move and still count as a click
const WHEEL_STEP = 0.8;
const GOLD = 0xffe14d;
const HIDDEN_COLOR = 0x5a6670; // a stop whose type isn't known yet

const NODE_STYLE: Record<RunNodeType, { color: number; name: string }> = {
  fight: { color: 0x8a3b35, name: "Fight" },
  elite: { color: 0x6b2f8f, name: "Elite" },
  rest: { color: 0xc4741f, name: "Rest" },
  trader: { color: 0x2f7a8f, name: "Trader" },
  event: { color: 0x4a5a9a, name: "Event" },
  boss: { color: 0x8f1f2f, name: "Boss" },
};
const LEGEND: RunNodeType[] = ["fight", "elite", "rest", "trader", "event"];

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function nodeX(width: number, index: number): number {
  return CENTER_X + (index - (width - 1) / 2) * NODE_GAP;
}

// World y of a floor: floor 1 at the bottom of the canvas, the boss at the top.
function floorY(floor: number, floors: number): number {
  return BOSS_Y + (floors - floor + 1) * FLOOR_STEP;
}

// A simple icon for each stop type, drawn with shapes, centred on (x, y).
// With art (map/<type>) the image goes on top of the stop's disc, in g's container if it has one.
function drawNodeIcon(g: Phaser.GameObjects.Graphics, type: RunNodeType, x: number, y: number, r: number, hidden = false): void {
  if (artImage(g.scene, `map/${hidden ? "hidden" : type}`, x, y, r * 2, r * 2, g.parentContainer)) return;
  const white = 0xf4ecd8;
  g.fillStyle(white, 1);
  g.lineStyle(Math.max(2, r * 0.14), white, 1);
  if (type === "fight") {
    // Two crossed swords.
    g.lineBetween(x - r * 0.6, y - r * 0.6, x + r * 0.6, y + r * 0.6);
    g.lineBetween(x + r * 0.6, y - r * 0.6, x - r * 0.6, y + r * 0.6);
    g.lineBetween(x - r * 0.7, y - r * 0.2, x - r * 0.2, y - r * 0.7);
    g.lineBetween(x + r * 0.7, y - r * 0.2, x + r * 0.2, y - r * 0.7);
  } else if (type === "elite") {
    // A skull.
    g.fillCircle(x, y - r * 0.12, r * 0.55);
    g.fillRect(x - r * 0.3, y + r * 0.2, r * 0.6, r * 0.4);
    g.fillStyle(0x3a1250, 1);
    g.fillCircle(x - r * 0.22, y - r * 0.12, r * 0.15);
    g.fillCircle(x + r * 0.22, y - r * 0.12, r * 0.15);
  } else if (type === "rest") {
    // A flame over two logs.
    g.fillStyle(0xffd84d, 1);
    g.fillTriangle(x - r * 0.4, y + r * 0.2, x + r * 0.4, y + r * 0.2, x, y - r * 0.65);
    g.fillStyle(0xff7a2d, 1);
    g.fillTriangle(x - r * 0.22, y + r * 0.2, x + r * 0.22, y + r * 0.2, x, y - r * 0.25);
    g.lineStyle(Math.max(2, r * 0.16), white, 1);
    g.lineBetween(x - r * 0.6, y + r * 0.5, x + r * 0.6, y + r * 0.3);
    g.lineBetween(x - r * 0.6, y + r * 0.3, x + r * 0.6, y + r * 0.5);
  } else if (type === "trader") {
    // A coin with a bar through it.
    g.fillStyle(0xffd84d, 1);
    g.fillCircle(x, y, r * 0.6);
    g.lineStyle(Math.max(2, r * 0.12), 0x8a6a10, 1);
    g.strokeCircle(x, y, r * 0.6);
    g.lineBetween(x, y - r * 0.35, x, y + r * 0.35);
    g.lineBetween(x - r * 0.2, y - r * 0.15, x + r * 0.2, y - r * 0.15);
    g.lineBetween(x - r * 0.2, y + r * 0.15, x + r * 0.2, y + r * 0.15);
  } else if (type === "event") {
    // A question mark.
    g.lineStyle(Math.max(3, r * 0.2), white, 1);
    g.beginPath();
    g.arc(x, y - r * 0.2, r * 0.32, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(450), false);
    g.lineTo(x, y + r * 0.2);
    g.strokePath();
    g.fillCircle(x, y + r * 0.5, r * 0.1);
  } else {
    // A crown.
    g.fillStyle(0xffd84d, 1);
    g.fillRect(x - r * 0.6, y + r * 0.1, r * 1.2, r * 0.4);
    g.fillTriangle(x - r * 0.6, y + r * 0.1, x - r * 0.6, y - r * 0.5, x - r * 0.2, y + r * 0.1);
    g.fillTriangle(x - r * 0.3, y + r * 0.1, x, y - r * 0.65, x + r * 0.3, y + r * 0.1);
    g.fillTriangle(x + r * 0.6, y + r * 0.1, x + r * 0.6, y - r * 0.5, x + r * 0.2, y + r * 0.1);
  }
}

export class MapScene extends Phaser.Scene {
  private run!: RunState;
  private voteLayer!: Phaser.GameObjects.Container;
  private resolving = false;
  private world!: Phaser.GameObjects.Container; // the scrolling map
  private mapCam!: Phaser.Cameras.Scene2D.Camera;
  private bgCam!: Phaser.Cameras.Scene2D.Camera;
  private bar!: Phaser.GameObjects.Graphics;
  private scrollY = 0;
  private press: { y: number; scroll: number } | null = null;
  private dragged = false;

  constructor() {
    super("map");
  }

  create(): void {
    this.resolving = false;
    this.press = null;
    this.dragged = false;
    // The map is drawn by its own camera, which shows only the map area and scrolls.
    this.bgCam = this.cameras.add(0, 0, 1920, 1080);
    this.mapCam = this.cameras.add(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    // Whitelist: the map camera draws only what put() moves into the scrolling world. Everything
    // else added to the scene, now or later (overlays, tooltips, banners), is hidden from it.
    // Draw order: background, then the map, then everything else (so overlays such as the deck
    // viewer cover the map). The background has its own camera for that.
    const cams = this.cameras.cameras;
    cams.splice(cams.indexOf(this.cameras.main), 1);
    cams.push(this.cameras.main);
    this.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, (obj: Phaser.GameObjects.GameObject) => {
      this.mapCam.ignore(obj);
      this.bgCam.ignore(obj);
    });
    this.scrollY = this.openingScroll(currentRun());
    this.input.on("wheel", (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.inView(p)) this.scrollTo(this.scrollY + dy * WHEEL_STEP);
    });
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.dragged = false;
      this.press = this.inView(p) ? { y: p.y, scroll: this.scrollY } : null;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.press === null || !p.isDown) return;
      if (Math.abs(p.y - this.press.y) > DRAG_SLOP) this.dragged = true;
      if (this.dragged) this.scrollTo(this.press.scroll - (p.y - this.press.y));
    });
    this.input.on("pointerup", () => (this.press = null));
    this.input.on("pointerupoutside", () => (this.press = null));
    this.build();
  }

  private inView(p: Phaser.Input.Pointer): boolean {
    return !deckViewerState.open && p.x >= VIEW.x && p.x <= VIEW.x + VIEW.w && p.y >= VIEW.y && p.y <= VIEW.y + VIEW.h;
  }

  private worldHeight(run: RunState): number {
    return floorY(1, run.map.floors.length) + WORLD_PAD;
  }

  // Where the map opens: the party's stop (or the start of the act) at the bottom of the view, so the
  // stops it can vote for are in view above it.
  private openingScroll(run: RunState): number {
    const n = run.map.floors.length;
    const bottom = floorY(Math.max(1, run.position?.floor ?? 1), n) + 110;
    return Math.max(0, Math.min(this.worldHeight(run) - VIEW.h, bottom - VIEW.h));
  }

  private scrollTo(y: number): void {
    this.scrollY = Math.max(0, Math.min(this.worldHeight(this.run) - VIEW.h, y));
    this.mapCam.setScroll(VIEW.x, this.scrollY);
    this.drawScrollBar();
  }

  // A slim bar right of the map area showing where the view is on the whole canvas.
  private drawScrollBar(): void {
    const total = this.worldHeight(this.run);
    this.bar.clear();
    this.bar.fillStyle(0x0d2a20, 0.8);
    this.bar.fillRoundedRect(BAR_X, VIEW.y, 8, VIEW.h, 4);
    this.bar.fillStyle(0x9fd1b8, 1);
    this.bar.fillRoundedRect(BAR_X, VIEW.y + (this.scrollY / total) * VIEW.h, 8, (VIEW.h / total) * VIEW.h, 4);
  }

  // Moves map objects into the scrolling world: only the map camera draws them.
  private put(objects: Phaser.GameObjects.GameObject[]): void {
    this.world.add(objects);
    const show = (o: Phaser.GameObjects.GameObject): void => {
      this.cameras.main.ignore(o);
      o.cameraFilter &= ~this.mapCam.id;
      if (o instanceof Phaser.GameObjects.Container) o.list.forEach(show); // art inside a stop's holder
    };
    objects.forEach(show);
  }

  // Draws the screen. Online it runs again, in place, whenever the host reports a new vote or status:
  // a scene restart is only carried out at the next frame, which could wipe the winner display
  // that a later update has just started.
  private build(): void {
    const run = currentRun();
    this.run = run;
    const pending = myPending(run);
    drawBackground(this, "map");
    for (const o of this.children.list) {
      o.cameraFilter &= ~this.bgCam.id; // the background is drawn by the background camera only
      this.cameras.main.ignore(o);
    }
    this.world = this.add.container(0, 0);
    this.world.cameraFilter &= ~this.mapCam.id;
    drawPartyHud(this, run);
    const next = (run.position?.floor ?? 0) + 1;
    const toBoss = next > run.map.floors.length;
    const online = isOnlineRun();
    drawRunHeader(this, `Act ${run.actIndex + 1} of ${run.content.run.acts.length}`, null, "Vote for the next stop.");
    if (!online) label(this, 60, 140, "Choose the next stop.", 26, { color: "#cfe9dc" });
    if (online && pending === null) drawWaitingFor(this, run, 60, 200);

    const options = pending?.type === "vote" ? pending.options : [];
    const mapStart = this.children.list.length;
    this.drawEdges(run, options);
    this.drawNodes(run, options, pending?.type === "vote" ? pending.player : null);
    this.put(this.children.list.slice(mapStart));
    this.drawBoss(run, toBoss);
    this.drawSidePanel(run);
    this.voteLayer = this.add.container(0, 0);
    this.put([this.voteLayer]);
    this.drawVotes(run.votes);
    this.bar = this.add.graphics();
    this.drawScrollBar();
    this.mapCam.setScroll(VIEW.x, this.scrollY);
    // A run update with the winner in it: show it, then go on (the votes before it just redraw the map).
    watchRun(this, "map", {
      redraw: () => {
        this.tweens.killAll();
        this.children.removeAll(true);
        this.build();
      },
      onUpdate: (events) => {
        const chosen = events.find((e) => e.type === "routeChosen");
        if (chosen === undefined || chosen.type !== "routeChosen") return false;
        this.showWinner(chosen);
        return true;
      },
      busy: () => this.resolving,
    });
  }

  // Every connection, dim; the ones the party can take from where it stands, bright and thick.
  private drawEdges(run: RunState, options: number[]): void {
    const floors = run.map.floors;
    const dim = this.add.graphics();
    dim.lineStyle(3, 0x6fb08f, 0.45);
    floors.forEach((row, f) => {
      row.forEach((node) => {
        const x = nodeX(row.length, node.index);
        const y = floorY(f + 1, floors.length);
        const targets = f + 1 < floors.length ? node.next.map((j) => ({ x: nodeX(floors[f + 1].length, j), y: floorY(f + 2, floors.length) })) : [{ x: CENTER_X, y: BOSS_Y }];
        for (const t of targets) dim.lineBetween(x, y, t.x, t.y);
      });
    });
    const lit = this.add.graphics();
    lit.lineStyle(7, GOLD, 0.9);
    const pos = run.position;
    if (pos === null) return;
    const from = { x: pos.floor > floors.length ? CENTER_X : nodeX(floors[pos.floor - 1].length, pos.index), y: pos.floor > floors.length ? BOSS_Y : floorY(pos.floor, floors.length) };
    for (const j of options) {
      const to = pos.floor >= floors.length ? { x: CENTER_X, y: BOSS_Y } : { x: nodeX(floors[pos.floor].length, j), y: floorY(pos.floor + 1, floors.length) };
      lit.lineBetween(from.x, from.y, to.x, to.y);
    }
  }

  private drawNodes(run: RunState, options: number[], voter: string | null): void {
    const floors = run.map.floors;
    const doneFloor = run.position?.floor ?? 0;
    floors.forEach((row, f) => {
      const floor = f + 1;
      label(this, 560, floorY(floor, floors.length), String(floor), 26, { origin: 0.5, color: "#9fd1b8" });
      row.forEach((node) => {
        const x = nodeX(row.length, node.index);
        const y = floorY(floor, floors.length);
        const here = run.position?.floor === floor && run.position.index === node.index;
        const isLit = floor === doneFloor + 1 && options.includes(node.index);
        const g = this.add.graphics();
        const holder = this.add.container(0, 0, [g]); // the stop's art, if any, joins its disc here
        if (isLit) {
          g.lineStyle(8, GOLD, 1);
          g.strokeCircle(x, y, NODE_R + 8);
        }
        // After a turn back at the Toll Bridge the floor's stops are unknown: all draw as "?".
        const shown: RunNodeType = run.hiddenFloor === floor ? "event" : node.type;
        g.fillStyle(run.hiddenFloor === floor ? HIDDEN_COLOR : NODE_STYLE[shown].color, 1);
        g.fillCircle(x, y, NODE_R);
        g.lineStyle(3, 0xf4ecd8, 1);
        g.strokeCircle(x, y, NODE_R);
        drawNodeIcon(g, shown, x, y, NODE_R, run.hiddenFloor === floor);
        if (here) this.drawPartyMarker(x, y);
        // Stops that are neither next nor the current one fade back.
        if (!isLit && !here) holder.setAlpha(floor <= doneFloor ? 0.35 : 0.65);
        if (isLit && voter !== null) {
          const hit = this.add.circle(x, y, NODE_R + 8, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
          // A click that moved the map (a drag) is not a vote.
          hit.on("pointerup", (p: Phaser.Input.Pointer) => {
            if (this.press !== null && !this.dragged && this.inView(p)) this.castVote(voter, node.index);
          });
          this.tweens.add({ targets: holder, alpha: 0.7, duration: 600, yoyo: true, repeat: -1 });
        }
      });
    });
  }

  // A flag over the stop the party stands on.
  private drawPartyMarker(x: number, y: number): void {
    const g = this.add.graphics();
    g.lineStyle(5, 0x7dffb0, 1);
    g.strokeCircle(x, y, NODE_R + 8);
    g.fillStyle(0x7dffb0, 1);
    g.fillTriangle(x - 14, y - NODE_R - 14, x + 14, y - NODE_R - 14, x, y - NODE_R + 2);
    label(this, x + NODE_R + 14, y, "You are here", 20, { bold: true, color: "#7dffb0" });
  }

  // The boss sits at the top from the start, with its name and passive.
  private drawBoss(run: RunState, lit: boolean): void {
    const bossStart = this.children.list.length;
    const boss = content.enemies.find((e) => e.id === run.map.bossId);
    const g = this.add.graphics();
    const r = NODE_R + 12;
    if (lit) {
      g.lineStyle(8, GOLD, 1);
      g.strokeCircle(CENTER_X, BOSS_Y, r + 8);
    }
    g.fillStyle(NODE_STYLE.boss.color, 1);
    g.fillCircle(CENTER_X, BOSS_Y, r);
    g.lineStyle(4, 0xf4ecd8, 1);
    g.strokeCircle(CENTER_X, BOSS_Y, r);
    drawNodeIcon(g, "boss", CENTER_X, BOSS_Y, r);
    if (run.position?.floor === run.map.floors.length + 1) this.drawPartyMarker(CENTER_X, BOSS_Y);
    // Left of the boss, right-aligned: the party's charm strip runs along the top to its right.
    const name = label(this, CENTER_X - r - 20, 24, boss?.name ?? run.map.bossId, 30, { bold: true, origin: 1 });
    const passives = label(this, CENTER_X - r - 20, 46, passiveText(boss), 18, { color: "#ffe14d", origin: 1 }).setOrigin(1, 0).setAlign("right").setWordWrapWidth(520);
    const tip = new Tooltip(this);
    const lines = bossTip(boss);
    const hit = this.add.circle(CENTER_X, BOSS_Y, r, 0, 0);
    // The boss itself scrolls with the map; its name and passive stay in the heading.
    const marker = this.children.list.slice(bossStart).filter((o) => o !== name && o !== passives);
    this.put(marker);
    for (const target of [name, passives, hit]) {
      target.setDepth(10); // above the vote targets, so the whole boss hovers
      tip.attachLines(target, lines);
    }
  }

  // Coins per player (with their marker colour), what each marker means, and a legend of stop types.
  private drawSidePanel(run: RunState): void {
    label(this, 60, 340, "Players", 28, { bold: true, color: "#9fd1b8" });
    const g = this.add.graphics();
    run.players.forEach((id, i) => {
      const y = 390 + i * 56;
      g.fillStyle(PLAYER_COLORS[i % PLAYER_COLORS.length], 1);
      g.fillCircle(80, y, 14);
      g.lineStyle(2, 0x0d2a20, 1);
      g.strokeCircle(80, y, 14);
      label(this, 110, y, seatName(id), 28);
      label(this, 400, y, `${run.coins[id] ?? 0} coins`, 26, { color: "#ffe14d", origin: 1 });
      if (isOnlineRun() && run.phase === "vote") label(this, 110, y + 24, run.votes[id] === undefined ? "voting" : "voted", 18, { color: run.votes[id] === undefined ? "#cfe9dc" : "#8fe3a8" });
    });
    label(this, 60, 610, "Stops", 28, { bold: true, color: "#9fd1b8" });
    LEGEND.forEach((type, i) => {
      const y = 660 + i * 50;
      g.fillStyle(NODE_STYLE[type].color, 1);
      g.fillCircle(80, y, 20);
      g.lineStyle(2, 0xf4ecd8, 1);
      g.strokeCircle(80, y, 20);
      drawNodeIcon(g, type, 80, y, 20);
      label(this, 115, y, NODE_STYLE[type].name, 26);
    });
  }

  // One marker per vote on the stop it was cast for, in the player's colour with their seat number.
  private drawVotes(votes: Record<string, number>): void {
    this.voteLayer.removeAll(true);
    const floor = (this.run.position?.floor ?? 0) + 1;
    const row = this.run.map.floors[floor - 1];
    const byNode: Record<number, string[]> = {};
    for (const id of this.run.players) {
      const node = votes[id];
      if (node !== undefined) (byNode[node] ??= []).push(id);
    }
    for (const [node, ids] of Object.entries(byNode)) {
      const x = row ? nodeX(row.length, Number(node)) : CENTER_X;
      const y = row ? floorY(floor, this.run.map.floors.length) : BOSS_Y;
      ids.forEach((id, k) => {
        const mx = x + (k - (ids.length - 1) / 2) * 34;
        const color = PLAYER_COLORS[this.run.players.indexOf(id) % PLAYER_COLORS.length];
        const dot = this.add.circle(mx, y + NODE_R + 26, 15, color).setStrokeStyle(3, 0x0d2a20);
        const text = this.add.text(mx, y + NODE_R + 26, String(this.run.players.indexOf(id) + 1), { fontFamily: FONT, fontSize: "18px", color: "#0d2a20", fontStyle: "bold" }).setOrigin(0.5);
        this.voteLayer.add([dot, text]);
        this.cameras.main.ignore([dot, text]);
        for (const o of [dot, text]) o.cameraFilter &= ~this.mapCam.id;
      });
    }
  }

  // Online: sends the vote; the host settles it and the winner is shown when its update arrives.
  // Single player: sends the pick as every seat's vote and opens the chosen stop straight away.
  private castVote(player: string, node: number): void {
    if (this.resolving) return;
    // Online the host settles the vote; the screen follows when its update arrives.
    if (isOnlineRun()) return submitRunChoice(this, player, { type: "vote", node });
    // Single player: one pick, submitted as the same vote for every seat.
    let result = applyRunChoice(this.run, player, { type: "vote", node });
    for (const seat of this.run.players) {
      if (seat === player) continue;
      const more = applyRunChoice(result.run, seat, { type: "vote", node });
      result = { run: more.run, events: [...result.events, ...more.events] };
    }
    // Single player: no vote display, the chosen stop opens straight away.
    setRun(result.run);
    openRunScreen(this);
  }

  // The vote is settled: show the winner (and the tie message) for a moment, then go on to the next screen.
  private showWinner(chosen: Extract<RunEvent, { type: "routeChosen" }>): void {
    this.resolving = true;
    this.drawVotes(chosen.votes);
    const row = this.run.map.floors[chosen.floor - 1];
    const x = row ? nodeX(row.length, chosen.index) : CENTER_X;
    const y = row ? floorY(chosen.floor, this.run.map.floors.length) : BOSS_Y;
    const reveal = (): void => {
      const ring = this.add.graphics();
      ring.lineStyle(10, 0x7dffb0, 1);
      ring.strokeCircle(x, y, NODE_R + 14);
      this.put([ring]);
      const nodeName = NODE_STYLE[chosen.nodeType].name;
      label(this, 60, 245, `Winner: ${nodeName}`, 30, { bold: true, color: "#7dffb0" });
      if (chosen.drawn) {
        const total = Object.values(chosen.counts).reduce((a, b) => a + b, 0);
        const odds = Math.round((100 * (chosen.counts[chosen.index] ?? 0)) / total);
        label(this, 60, 285, `Drawn: ${nodeName}, ${odds}%`, 30, { bold: true, color: "#ff9d7a" });
      }
      this.time.delayedCall(scaleTime(1800), () => {
        openRunScreen(this);
      });
    };
    if (!chosen.drawn || !row) return reveal();
    // A drawn vote rolls over the voted stops first, then lands on the winner.
    const spots = Object.keys(chosen.counts).map((k) => ({ option: Number(k), x: nodeX(row.length, Number(k)), y, w: 2 * NODE_R + 28, h: 2 * NODE_R + 28 }));
    playVoteRoll(this, spots, chosen.counts, chosen.index, reveal, (ring) => this.put([ring]));
  }
}
