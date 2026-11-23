import Phaser from "phaser";
import presentation from "../../data/presentation.json";
import { enemyStartingHealth } from "../engine/battle";
import { reachableStops } from "../engine/map";
import { applyRunChoice } from "../engine/run";
import type { RunEvent, RunNodeType, RunState } from "../engine/run";
import { content } from "./devBattle";
import { scaleTime } from "./playbackSpeed";
import { playRunEventSounds } from "./sound";
import { playVoteRoll } from "./voteRoll";
import { drawPartyCharms } from "./charmUi";
import { openDeckViewer, runDeckPlayers } from "./deckViewer";
import { drawMapStrip } from "./mapStrip";
import { setMenuButtonSpot } from "./menuButton";
import { drawBackdrop } from "./combatHud";
import { drawPlate } from "./kit";
import { currentRun, isOnlineRun, myPending, openRunScreen, seatNames, setRun, submitRunChoice, watchRun } from "./runSession";
import { bossTip } from "./bossInfo";
import { drawNodeIcon, NODE_STYLE } from "./nodeIcon";
import { Tooltip } from "./tooltip";
import { seatColour } from "./seatColours";
import { label } from "./ui";
import { fontRole } from "./fonts";
import wizardArt from "../../data/wizard-art.json";
import enemyArt from "../../data/enemy-art.json";
import { hexColour } from "./presentation";

// The map screen (#51, #306, #307). The whole act on a scroll lying on the tavern table, floors left to right and the
// boss standing at the right end. Roads are dotted trails; the road the party took is solid and the roads
// it can take now are gold. Stops that can be picked now are larger, gold and pulse; stops the
// party can no longer reach are faded (the engine's reachableStops says which); visited stops carry
// a tick. Which stops are pickable, the tally and the weighted draw come from the run engine; this
// screen only draws them and sends the vote.
// In single player the screen asks once, sends that pick as every seat's vote and opens the chosen
// stop straight away. Online (#49) every player votes at once on their own screen; each vote is a flag
// in the voter's colour on the stop, shown as the host reports it, and when the last one is in everyone sees the winner (and
// the draw odds).

const M = presentation.map;
const INK = hexColour(M.ink);
const GOLD = hexColour(M.gold);
const ART_PX = 24; // the stop icons are 24 art pixels across (#300)
const U = presentation.kit.unit; // the grid the scroll, the flags and the kit are drawn on

const LEGEND: RunNodeType[] = ["fight", "elite", "rest", "trader", "event"];

// The engine's record of the stops the party has stood on this act (an older saved room has none).
function visitedStop(run: RunState, floor: number, index: number): boolean {
  return (run.path ?? []).some((s) => s.floor === floor && s.index === index);
}

const key = (floor: number, index: number): string => `${floor}:${index}`;

interface Geometry {
  step: number; // between neighbouring floors
  gapY: number; // between stops of a floor
  fit: number; // sizes shrink with this when floors are packed tighter than they are today
  floors: number;
  rows: number[]; // stops per floor
}

function geometry(run: RunState): Geometry {
  const rows = run.map.floors.map((row) => row.length);
  const floors = rows.length;
  const step = (M.bossX - M.firstX) / floors;
  const widest = Math.max(1, ...rows);
  return { step, gapY: Math.min(M.maxGapY, M.spanY / Math.max(1, widest - 1)), fit: Math.min(1, step / (2 * M.pickR + 20)), floors, rows };
}

function colX(g: Geometry, floor: number): number {
  return floor > g.floors ? M.bossX : M.firstX + (floor - 1) * g.step;
}

function nodeY(g: Geometry, floor: number, index: number): number {
  if (floor > g.floors) return M.centreY;
  return M.centreY + (index - (g.rows[floor - 1] - 1) / 2) * g.gapY;
}

// A flag in whole grid pixels: a pole standing on (x, baseY) with a pennant at its top in `colour`, outlined in ink.
function drawFlag(g: Phaser.GameObjects.Graphics, x: number, baseY: number, colour: number): void {
  const F = M.flag;
  const top = baseY - F.poleRows * U;
  g.fillStyle(hexColour(F.outline), 1);
  g.fillRect(x, top, U, F.poleRows * U);
  g.fillRect(x + U, top, F.pennantW * U, F.pennantH * U);
  g.fillStyle(colour, 1);
  g.fillRect(x + 2 * U, top + U, (F.pennantW - 2) * U, (F.pennantH - 2) * U);
}

export class MapScene extends Phaser.Scene {
  private run!: RunState;
  private voteLayer!: Phaser.GameObjects.Container;
  private resolving = false;
  private geo!: Geometry;

  constructor() {
    super("map");
  }

  create(): void {
    this.resolving = false;
    setMenuButtonSpot(M.strip.menu); // the menu button sits in the bottom strip while this screen is up
    this.events.once("shutdown", () => setMenuButtonSpot(null));
    this.build();
  }

  // Draws the screen. Online it runs again, in place, whenever the host reports a new vote or status:
  // a scene restart is only carried out at the next frame, which could wipe the winner display
  // that a later update has just started.
  private build(): void {
    const run = currentRun();
    this.run = run;
    this.geo = geometry(run);
    const pending = myPending(run);
    drawBackdrop(this);
    this.drawScroll();
    // The party's charms stay along the top until the cards issue moves them into the strip.
    drawPartyCharms(this, run.players, seatNames(), run.charms, (seat) => openDeckViewer(this, runDeckPlayers(run), seat));
    const online = isOnlineRun();
    label(this, M.titleX, M.titleY, `Act ${run.actIndex + 1} of ${run.content.run.acts.length}`, M.text.title, { color: M.ink });
    label(this, M.titleX, M.promptY, online ? "Vote for the next stop" : "Choose the next stop", M.text.prompt, { color: M.inkDim });

    const options = pending?.type === "vote" ? pending.options : [];
    const reach = this.reachable(run);
    this.drawRoads(run, options, reach);
    this.drawStops(run, options, reach, pending?.type === "vote" ? pending.player : null);
    this.drawBoss(run);
    this.drawLegend();
    drawMapStrip(this, run);
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

  // The scroll lying on the table, at x3 like the rest of the pixel art. With no picture, a flat sheet on its drawable part.
  private drawScroll(): void {
    const S = M.scroll;
    const key = `art/${S.art}`;
    if (this.textures.exists(key)) {
      this.add.image(S.x, S.y, key).setOrigin(0, 0).setScale(U);
      return;
    }
    const [ax, ay, aw, ah] = wizardArt.scroll.mapArea;
    const p = M.paper;
    const sheet = this.add.graphics();
    sheet.fillStyle(hexColour(p.fill), 1);
    sheet.fillRect(S.x + ax * U, S.y + ay * U, aw * U, ah * U);
    sheet.lineStyle(p.edgeW, hexColour(p.edge), 1);
    sheet.strokeRect(S.x + ax * U, S.y + ay * U, aw * U, ah * U);
  }

  // The stops the party can still reach, from the engine. At the start of an act every floor 1 stop
  // is reachable (and what they lead to).
  private reachable(run: RunState): Set<string> {
    const set = new Set<string>();
    const pos = run.position;
    if (pos === null) {
      run.map.floors[0].forEach((n) => {
        set.add(key(1, n.index));
        for (const s of reachableStops(run.map, 1, n.index)) set.add(key(s.floor, s.index));
      });
    } else if (pos.floor <= run.map.floors.length) {
      for (const s of reachableStops(run.map, pos.floor, pos.index)) set.add(key(s.floor, s.index));
    }
    return set;
  }

  // A stop the party has passed without visiting, or can no longer reach, is faded.
  private isFaded(run: RunState, reach: Set<string>, floor: number, index: number): boolean {
    const pos = run.position;
    if (floor > run.map.floors.length) return false; // the boss
    if (pos !== null && floor <= pos.floor) return !visitedStop(run, floor, index);
    return !reach.has(key(floor, index));
  }

  private dots(g: Phaser.GameObjects.Graphics, pts: Phaser.Math.Vector2[], size: number, colour: number, alpha: number): void {
    g.fillStyle(colour, alpha);
    let carried = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = Phaser.Math.Distance.BetweenPoints(pts[i - 1], pts[i]);
      let at = M.dotGap - carried;
      while (at <= seg) {
        const t = at / seg;
        g.fillRect(Math.round(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t - size / 2), Math.round(pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t - size / 2), size, size);
        at += M.dotGap;
      }
      carried = seg - (at - M.dotGap);
    }
  }

  // Every road, dotted; the one taken, solid; the ones the party can take from where it stands, gold.
  // All roads between two floors bend the same way, so roads that do not cross in the data do not
  // cross on screen.
  private drawRoads(run: RunState, options: number[], reach: Set<string>): void {
    const g = this.add.graphics();
    const geo = this.geo;
    const pos = run.position;
    run.map.floors.forEach((row, f) => {
      const floor = f + 1;
      for (const node of row) {
        const x0 = colX(geo, floor);
        const y0 = nodeY(geo, floor, node.index);
        const targets = floor < geo.floors ? node.next : [0];
        for (const j of targets) {
          const x1 = colX(geo, floor + 1);
          const y1 = nodeY(geo, floor + 1, j);
          const curve = new Phaser.Curves.CubicBezier(new Phaser.Math.Vector2(x0, y0), new Phaser.Math.Vector2(x0 + (x1 - x0) / 2, y0), new Phaser.Math.Vector2(x0 + (x1 - x0) / 2, y1), new Phaser.Math.Vector2(x1, y1));
          const pts = curve.getPoints(24);
          const taken = visitedStop(run, floor, node.index) && visitedStop(run, floor + 1, j);
          const gold = pos !== null && pos.floor === floor && pos.index === node.index && options.includes(j);
          const faded = this.isFaded(run, reach, floor, node.index) || this.isFaded(run, reach, floor + 1, j);
          if (gold) this.dots(g, pts, M.goldDotSize, GOLD, 1);
          else if (taken) {
            g.lineStyle(M.takenWidth, INK, 1);
            g.strokePoints(pts);
          } else this.dots(g, pts, M.dotSize, INK, faded ? M.fadedRoadAlpha : M.dotAlpha);
        }
      }
    });
  }

  private drawStops(run: RunState, options: number[], reach: Set<string>, voter: string | null): void {
    const geo = this.geo;
    const doneFloor = run.position?.floor ?? 0;
    for (let floor = 1; floor <= geo.floors; floor++) {
      label(this, colX(geo, floor), M.floorNumberY, String(floor), M.text.small, { origin: 0.5, color: M.inkDim });
    }
    run.map.floors.forEach((row, f) => {
      const floor = f + 1;
      for (const node of row) {
        const x = colX(geo, floor);
        const y = nodeY(geo, floor, node.index);
        const here = run.position?.floor === floor && run.position.index === node.index;
        const visited = visitedStop(run, floor, node.index);
        const pick = floor === doneFloor + 1 && options.includes(node.index);
        const hidden = run.hiddenFloor === floor;
        const r = (pick ? M.pickR : M.stopR) * geo.fit;
        // After a turn back at the Toll Bridge the floor's stops are unknown: all draw as "?".
        const shown: RunNodeType = hidden ? "event" : node.type;
        const g = this.add.graphics();
        const holder = this.add.container(x, y, [g]); // the stop's art joins its disc here
        g.fillStyle(hexColour(pick ? M.goldFill : M.discFill), 1);
        g.fillCircle(0, 0, r);
        g.lineStyle(pick ? M.pickEdgeW : M.discEdgeW, pick ? GOLD : INK, 1);
        g.strokeCircle(0, 0, r);
        drawNodeIcon(g, shown, 0, 0, (ART_PX * (pick ? M.pickIconScale : M.iconScale) * geo.fit) / 2, hidden);
        if (this.isFaded(run, reach, floor, node.index)) holder.setAlpha(M.fadedAlpha);
        if (visited) this.drawTick(x + r * M.tick.offset, y - r * M.tick.offset);
        if (here) this.drawHere(x, y - r);
        if (pick) {
          this.tweens.add({ targets: holder, scale: M.pulse.scale, duration: M.pulse.ms, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
          if (voter !== null) {
            const hit = this.add.circle(x, y, r + M.hit.pad, hexColour(M.hit.colour), M.hit.alpha).setInteractive({ useHandCursor: true });
            hit.on("pointerup", () => this.castVote(voter, node.index));
          }
        }
      }
    });
  }

  // A small tick in a green badge on a visited stop.
  private drawTick(x: number, y: number): void {
    const s = M.tick.size;
    const g = this.add.graphics();
    g.fillStyle(hexColour(M.goodInk), 1);
    g.fillCircle(x, y, s);
    g.lineStyle(3, hexColour(M.discFill), 1);
    g.beginPath();
    g.moveTo(x - s * 0.5, y);
    g.lineTo(x - s * 0.1, y + s * 0.45);
    g.lineTo(x + s * 0.55, y - s * 0.4);
    g.strokePath();
  }

  // The "You are here" mark: an arrow and the words, above the stop the party is on.
  private drawHere(x: number, top: number): void {
    const g = this.add.graphics();
    g.fillStyle(INK, 1);
    g.fillTriangle(x - 10, top - 18, x + 10, top - 18, x, top - 4);
    label(this, x, top - M.hereRise - 12, "You are here", M.text.small, { origin: 0.5, color: M.ink });
  }

  // The boss stands at the end of the road from the start, as its sprite with its name on a plate and its rule under
  // it. The road ends at a gate disc with the boss icon, in front of it; "You are here" goes on it when the party stands there.
  private drawBoss(run: RunState): void {
    const geo = this.geo;
    const B = M.boss;
    const boss = content.enemies.find((e) => e.id === run.map.bossId);
    const tip = new Tooltip(this);
    const lines = bossTip(boss, boss ? enemyStartingHealth(content.config, boss, run.players.length) : 0);
    const targets: Phaser.GameObjects.GameObject[] = [];

    // The sprite stands on the scroll with a soft shadow, facing the party.
    const art = (enemyArt.enemies as Record<string, { w: number; h: number }>)[run.map.bossId];
    const key = `art/enemies/${run.map.bossId}`;
    if (art && this.textures.exists(key)) {
      const sh = this.add.graphics();
      for (let i = 0; i < B.shadow.layers; i++) {
        sh.fillStyle(hexColour(B.shadow.colour), B.shadow.alpha / B.shadow.layers);
        sh.fillEllipse(B.x, B.feetY, art.w * B.scale * B.shadow.w * (1 - i / (B.shadow.layers + 1)), B.shadow.h * (1 - i / (B.shadow.layers + 1)));
      }
      targets.push(this.add.image(B.x, B.feetY, key).setOrigin(0.5, 1).setScale(B.scale).setInteractive());
    }

    // Its name on a kit plate.
    const name = label(this, B.x, 0, boss?.name ?? run.map.bossId, B.plateSize, { origin: 0.5, color: B.plateColour });
    const plateW = Math.ceil(name.width / U) + 2 * B.platePadX;
    const plateY = B.feetY + B.plateGap;
    const plate = this.add.graphics();
    drawPlate(plate, B.x - (plateW * U) / 2, plateY, plateW, B.plateHeight);
    this.children.moveBelow(plate, name);
    name.setY(Math.round(plateY + (B.plateHeight * U) / 2));
    const rule = (boss?.passives ?? []).map((p) => `${p.name}: ${p.text ?? ""}`).join("\n") || "No passive";
    const text = this.add
      .text(B.x, plateY + B.plateHeight * U + M.bossRuleGap, rule, { ...fontRole(M.text.small), color: M.inkDim, wordWrap: { width: M.bossRuleWrap }, align: "center" })
      .setOrigin(0.5, 0);
    targets.push(name, text);

    // The gate disc at the road's end.
    const r = M.bossR * geo.fit;
    const g = this.add.graphics();
    this.add.container(M.bossX, M.centreY, [g]);
    g.fillStyle(hexColour(M.discFill), 1);
    g.fillCircle(0, 0, r);
    g.lineStyle(M.pickEdgeW, INK, 1);
    g.strokeCircle(0, 0, r);
    drawNodeIcon(g, "boss", 0, 0, (ART_PX * M.bossIconScale * geo.fit) / 2);
    if (run.position?.floor === geo.floors + 1) this.drawHere(M.bossX, M.centreY - r);
    targets.push(this.add.circle(M.bossX, M.centreY, r + M.hit.pad, hexColour(M.hit.colour), M.hit.alpha));
    for (const target of targets) tip.attachLines(target, lines);
  }

  // One line along the bottom of the scroll: what each stop type is.
  private drawLegend(): void {
    const half = M.legendIcon / 2;
    let x = M.titleX;
    LEGEND.forEach((type) => {
      const holder = this.add.container(x + half, M.legendY, [this.add.graphics()]);
      const lg = holder.list[0] as Phaser.GameObjects.Graphics;
      lg.fillStyle(hexColour(M.discFill), 1);
      lg.fillCircle(0, 0, half + 4);
      lg.lineStyle(2, INK, 1);
      lg.strokeCircle(0, 0, half + 4);
      drawNodeIcon(lg, type, 0, 0, half);
      const t = label(this, x + M.legendIcon + 14, M.legendY, NODE_STYLE[type].name, M.text.small, { color: M.ink });
      x += M.legendIcon + 14 + t.width + M.legendGap;
    });
  }

  // One flag per vote on the stop it was cast for, in the voter's colour, planted on the top of the stop; several
  // stand side by side. They stay up while the winner is shown and the tie rolls.
  private drawVotes(votes: Record<string, number>): void {
    this.voteLayer.removeAll(true);
    const floor = (this.run.position?.floor ?? 0) + 1;
    const row = this.run.map.floors[floor - 1];
    const byNode: Record<number, string[]> = {};
    for (const id of this.run.players) {
      const node = votes[id];
      if (node !== undefined) (byNode[node] ??= []).push(id);
    }
    const g = this.add.graphics();
    this.voteLayer.add(g);
    const F = M.flag;
    for (const [node, ids] of Object.entries(byNode)) {
      const x = colX(this.geo, floor);
      const y = row ? nodeY(this.geo, floor, Number(node)) : M.centreY;
      const top = y - (row ? M.pickR : M.bossR) * this.geo.fit; // the stop's top edge
      const width = ((ids.length - 1) * F.pitch + F.pennantW + 1) * U;
      ids.forEach((id, k) => drawFlag(g, Math.round((x - width / 2) / U) * U + k * F.pitch * U, Math.round((top + F.sink * U) / U) * U, seatColour(this.run.players, id)));
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
    playRunEventSounds(result.events);
    setRun(result.run);
    openRunScreen(this);
  }

  // The vote is settled: show the winner (and the tie message) for a moment, then go on to the next screen.
  private showWinner(chosen: Extract<RunEvent, { type: "routeChosen" }>): void {
    this.resolving = true;
    this.drawVotes(chosen.votes);
    const row = this.run.map.floors[chosen.floor - 1];
    const x = colX(this.geo, chosen.floor);
    const y = row ? nodeY(this.geo, chosen.floor, chosen.index) : M.centreY;
    const reveal = (): void => {
      const ring = this.add.graphics();
      ring.lineStyle(10, hexColour(M.winnerRing), 1);
      ring.strokeCircle(x, y, (M.pickR + 14) * this.geo.fit);
      const nodeName = NODE_STYLE[chosen.nodeType].name;
      label(this, M.winnerX, M.winnerY, `Winner: ${nodeName}`, M.text.prompt, { color: M.goodInk });
      if (chosen.drawn) {
        const total = Object.values(chosen.counts).reduce((a, b) => a + b, 0);
        const odds = Math.round((100 * (chosen.counts[chosen.index] ?? 0)) / total);
        label(this, M.drawnX, M.drawnY, `Drawn: ${nodeName}, ${odds}%`, M.text.prompt, { color: M.drawnInk });
      }
      this.time.delayedCall(scaleTime(1800), () => {
        openRunScreen(this);
      });
    };
    if (!chosen.drawn || !row) return reveal();
    // A drawn vote rolls over the voted stops first, then lands on the winner.
    const size = (M.pickR * 2 + 28) * this.geo.fit;
    const spots = Object.keys(chosen.counts).map((k) => ({ option: Number(k), x, y: nodeY(this.geo, chosen.floor, Number(k)), w: size, h: size }));
    playVoteRoll(this, spots, chosen.counts, chosen.index, reveal);
  }
}
