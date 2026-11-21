// Map generation for one act. Deterministic from the RNG state. The rules
// (floor counts, weights, limits) all come from the act's data in data/run.json.

import { nextFloat, nextInt, shuffle } from "./rng";
import type { Rolled } from "./rng";
import type { ActData, MapRules, NodeType } from "./types";

export interface MapNode {
  floor: number; // 1-based; the boss sits on the floor after the last one
  index: number; // position within its floor
  type: NodeType;
  next: number[]; // indices of connected nodes on the next floor (empty on the last floor: they all lead to the boss)
}

export interface ActMap {
  actId: string;
  floors: MapNode[][]; // floors[0] is floor 1
  bossId: string; // enemy id, chosen at generation
}

const NODE_TYPES: NodeType[] = ["fight", "elite", "rest", "trader", "event"];

function pickInRange(state: number, range: { min: number; max: number }): Rolled<number> {
  const r = nextInt(state, range.max - range.min + 1);
  return { value: range.min + r.value, state: r.state };
}

// Nodes on each floor, and which nodes of the next floor each connects to.
// Returns null when the layout can't give every node an incoming path.
function rollLayout(state: number, rules: MapRules): Rolled<number[][][] | null> {
  let s = state;
  const widths: number[] = [];
  for (let f = 0; f < rules.floors; f++) {
    const r = pickInRange(s, rules.nodesPerFloor);
    s = r.state;
    widths.push(r.value);
  }
  const next: number[][][] = []; // next[f][i] = targets on floor f+1
  for (let f = 0; f < rules.floors; f++) {
    const floorNext: number[][] = [];
    for (let i = 0; i < widths[f]; i++) floorNext.push([]);
    if (f + 1 < rules.floors) {
      const nextWidth = widths[f + 1];
      for (let i = 0; i < widths[f]; i++) {
        const c = pickInRange(s, rules.nextPerNode);
        s = c.state;
        const order = shuffle(s, Array.from({ length: nextWidth }, (_, k) => k));
        s = order.state;
        floorNext[i] = order.value.slice(0, Math.min(c.value, nextWidth));
      }
      // Every node on the next floor needs a way in.
      for (let j = 0; j < nextWidth; j++) {
        if (floorNext.some((targets) => targets.includes(j))) continue;
        const open: number[] = [];
        floorNext.forEach((targets, i) => {
          if (targets.length < rules.nextPerNode.max) open.push(i);
        });
        if (open.length === 0) return { value: null, state: s };
        const pick = nextInt(s, open.length);
        s = pick.state;
        floorNext[open[pick.value]].push(j);
      }
      floorNext.forEach((targets) => targets.sort((a, b) => a - b));
    }
    next.push(floorNext);
  }
  return { value: next, state: s };
}

function pickType(state: number, floor: number, rules: MapRules): Rolled<NodeType> {
  const fixed = rules.fixedFloors[String(floor)];
  if (fixed !== undefined) return { value: fixed, state };
  const allowed = NODE_TYPES.filter((type) => {
    if (rules.weights[type] <= 0) return false;
    if (type === "elite") return floor >= rules.eliteMinFloor;
    if (type === "rest") return floor >= rules.restMinFloor && !rules.restBannedFloors.includes(floor);
    return true;
  });
  let total = 0;
  for (const type of allowed) total += rules.weights[type];
  const r = nextFloat(state);
  let roll = r.value * total;
  for (const type of allowed) {
    roll -= rules.weights[type];
    if (roll < 0) return { value: type, state: r.state };
  }
  return { value: allowed[allowed.length - 1], state: r.state };
}

// The most nodes of one type on any single path from floor 1 to the boss.
function maxOnAnyPath(floors: MapNode[][], type: NodeType): number {
  let best: number[] = floors[0].map((node) => (node.type === type ? 1 : 0));
  for (let f = 0; f + 1 < floors.length; f++) {
    const following = floors[f + 1].map(() => 0);
    floors[f].forEach((node, i) => {
      for (const j of node.next) following[j] = Math.max(following[j], best[i]);
    });
    best = following.map((count, j) => count + (floors[f + 1][j].type === type ? 1 : 0));
  }
  return Math.max(...best);
}

function fitsRules(floors: MapNode[][], rules: MapRules): boolean {
  if (maxOnAnyPath(floors, "rest") > rules.maxRestPerPath) return false;
  if (maxOnAnyPath(floors, "trader") > rules.maxTraderPerPath) return false;
  let traders = 0;
  for (const floor of floors) for (const node of floor) if (node.type === "trader") traders++;
  return traders >= rules.minTradersPerAct;
}

// If a roll breaks a rule, the whole map is rolled again from the same stream.
export function generateActMap(act: ActData, state: number): Rolled<ActMap> {
  const rules = act.map;
  let s = state;
  for (let attempt = 0; attempt < rules.maxAttempts; attempt++) {
    const layout = rollLayout(s, rules);
    s = layout.state;
    if (layout.value === null) continue;
    const floors: MapNode[][] = [];
    for (let f = 0; f < rules.floors; f++) {
      const row: MapNode[] = [];
      for (let i = 0; i < layout.value[f].length; i++) {
        const t = pickType(s, f + 1, rules);
        s = t.state;
        row.push({ floor: f + 1, index: i, type: t.value, next: layout.value[f][i] });
      }
      floors.push(row);
    }
    if (!fitsRules(floors, rules)) continue;
    const boss = nextInt(s, act.bossPool.length);
    return { value: { actId: act.id, floors, bossId: act.bossPool[boss.value] }, state: boss.state };
  }
  throw new Error(`data/run.json: ${act.id}: no map fit the rules in ${rules.maxAttempts} attempts`);
}
