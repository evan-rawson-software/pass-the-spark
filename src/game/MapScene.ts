import Phaser from "phaser";
import { applyRunChoice } from "../engine/run";
import type { RunEvent, RunNodeType, RunState } from "../engine/run";
import { content } from "./devBattle";
import { scaleTime } from "./playbackSpeed";
import { drawPartyHud, drawRunHeader, drawWaitingFor } from "./partyHud";
import { currentRun, isOnlineRun, myPending, openRunScreen, seatName, setRun, submitRunChoice, watchRun } from "./runSession";
import { bossTip, passiveText } from "./bossInfo";
import { Tooltip } from "./tooltip";
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
const BOSS_Y = 128;
const FLOOR_Y0 = 980; // floor 1
const FLOOR_STEP = 85;
const NODE_R = 30;
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

function floorY(floor: number): number {
  return FLOOR_Y0 - (floor - 1) * FLOOR_STEP;
}

// A simple icon for each stop type, drawn with shapes, centred on (x, y).
function drawNodeIcon(g: Phaser.GameObjects.Graphics, type: RunNodeType, x: number, y: number, r: number): void {
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

  constructor() {
    super("map");
  }

  create(): void {
    this.resolving = false;
    this.build();
  }

  // Draws the screen. Online it runs again, in place, whenever the host reports a new vote or status:
  // a scene restart is only carried out at the next frame, which could wipe the winner display
  // that a later update has just started.
  private build(): void {
    const run = currentRun();
    this.run = run;
    const pending = myPending(run);
    drawBackground(this);
    drawPartyHud(this, run);
    const next = (run.position?.floor ?? 0) + 1;
    const toBoss = next > run.map.floors.length;
    const online = isOnlineRun();
    drawRunHeader(this, `Act ${run.actIndex + 1} of ${run.content.run.acts.length}`, null, "Vote for the next stop.");
    if (!online) label(this, 60, 140, "Choose the next stop.", 26, { color: "#cfe9dc" });
    if (online && pending === null) drawWaitingFor(this, run, 60, 200);

    const options = pending?.type === "vote" ? pending.options : [];
    this.drawEdges(run, options);
    this.drawNodes(run, options, pending?.type === "vote" ? pending.player : null);
    this.drawBoss(run, toBoss);
    this.drawSidePanel(run);
    this.voteLayer = this.add.container(0, 0);
    this.drawVotes(run.votes);
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
        const y = floorY(f + 1);
        const targets = f + 1 < floors.length ? node.next.map((j) => ({ x: nodeX(floors[f + 1].length, j), y: floorY(f + 2) })) : [{ x: CENTER_X, y: BOSS_Y }];
        for (const t of targets) dim.lineBetween(x, y, t.x, t.y);
      });
    });
    const lit = this.add.graphics();
    lit.lineStyle(7, GOLD, 0.9);
    const pos = run.position;
    if (pos === null) return;
    const from = { x: pos.floor > floors.length ? CENTER_X : nodeX(floors[pos.floor - 1].length, pos.index), y: pos.floor > floors.length ? BOSS_Y : floorY(pos.floor) };
    for (const j of options) {
      const to = pos.floor >= floors.length ? { x: CENTER_X, y: BOSS_Y } : { x: nodeX(floors[pos.floor].length, j), y: floorY(pos.floor + 1) };
      lit.lineBetween(from.x, from.y, to.x, to.y);
    }
  }

  private drawNodes(run: RunState, options: number[], voter: string | null): void {
    const floors = run.map.floors;
    const doneFloor = run.position?.floor ?? 0;
    floors.forEach((row, f) => {
      const floor = f + 1;
      label(this, 560, floorY(floor), String(floor), 26, { origin: 0.5, color: "#9fd1b8" });
      row.forEach((node) => {
        const x = nodeX(row.length, node.index);
        const y = floorY(floor);
        const here = run.position?.floor === floor && run.position.index === node.index;
        const isLit = floor === doneFloor + 1 && options.includes(node.index);
        const g = this.add.graphics();
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
        drawNodeIcon(g, shown, x, y, NODE_R);
        if (here) this.drawPartyMarker(x, y);
        // Stops that are neither next nor the current one fade back.
        if (!isLit && !here) g.setAlpha(floor <= doneFloor ? 0.35 : 0.65);
        if (isLit && voter !== null) {
          const hit = this.add.circle(x, y, NODE_R + 8, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
          hit.on("pointerdown", () => this.castVote(voter, node.index));
          this.tweens.add({ targets: g, alpha: 0.7, duration: 600, yoyo: true, repeat: -1 });
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
    g.fillTriangle(x - 12, y - NODE_R - 12, x + 12, y - NODE_R - 12, x, y - NODE_R + 2);
    label(this, x + NODE_R + 14, y, "You are here", 20, { bold: true, color: "#7dffb0" });
  }

  // The boss sits at the top from the start, with its name and passive.
  private drawBoss(run: RunState, lit: boolean): void {
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
    // Above the boss, where no connection runs.
    const name = label(this, CENTER_X, 20, boss?.name ?? run.map.bossId, 30, { bold: true, origin: 0.5 });
    const passives = label(this, CENTER_X, 58, passiveText(boss), 18, { color: "#ffe14d", origin: 0.5 }).setAlign("center").setWordWrapWidth(900);
    const tip = new Tooltip(this);
    const lines = bossTip(boss);
    const hit = this.add.circle(CENTER_X, BOSS_Y, r, 0, 0);
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
      const y = row ? floorY(floor) : BOSS_Y;
      ids.forEach((id, k) => {
        const mx = x + (k - (ids.length - 1) / 2) * 34;
        const color = PLAYER_COLORS[this.run.players.indexOf(id) % PLAYER_COLORS.length];
        const dot = this.add.circle(mx, y + NODE_R + 26, 15, color).setStrokeStyle(3, 0x0d2a20);
        const text = this.add.text(mx, y + NODE_R + 26, String(this.run.players.indexOf(id) + 1), { fontFamily: FONT, fontSize: "18px", color: "#0d2a20", fontStyle: "bold" }).setOrigin(0.5);
        this.voteLayer.add([dot, text]);
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
    const y = row ? floorY(chosen.floor) : BOSS_Y;
    const ring = this.add.graphics();
    ring.lineStyle(10, 0x7dffb0, 1);
    ring.strokeCircle(x, y, NODE_R + 14);
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
  }
}
