// Map generation for one act. Deterministic from the RNG state. The rules
// (floor counts, weights, limits) all come from the act's data in data/run.json.

import { nextFloat, nextInt } from "./rng";
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

// One layer of roads between a floor of `width` stops and a floor of `nextWidth` stops, built as a
// walk from the first stop pair to the last: each step moves to the next stop on one floor, the
// other, or both. The roads walked are the layer, so they cannot cross, every stop on both
// floors has a road, and no stop has more than `maxOut` roads out.
function rollRoads(state: number, width: number, nextWidth: number, maxOut: number): Rolled<number[][]> {
  let s = state;
  const roads: number[][] = [];
  for (let i = 0; i < width; i++) roads.push([]);
  // Can the walk still reach the last pair from stop i -> j, having used `out` roads out of i?
  const canFinish = (i: number, j: number, out: number): boolean => {
    if (i === width - 1 && j === nextWidth - 1) return true;
    if (i + 1 < width && canFinish(i + 1, j, 1)) return true;
    if (j + 1 < nextWidth && out < maxOut && canFinish(i, j + 1, out + 1)) return true;
    return i + 1 < width && j + 1 < nextWidth && canFinish(i + 1, j + 1, 1);
  };
  let i = 0;
  let j = 0;
  roads[0].push(0);
  while (i < width - 1 || j < nextWidth - 1) {
    const out = roads[i].length;
    const steps: number[][] = [];
    if (i + 1 < width && canFinish(i + 1, j, 1)) steps.push([1, 0]);
    if (j + 1 < nextWidth && out < maxOut && canFinish(i, j + 1, out + 1)) steps.push([0, 1]);
    if (i + 1 < width && j + 1 < nextWidth && canFinish(i + 1, j + 1, 1)) steps.push([1, 1]);
    const pick = nextInt(s, steps.length);
    s = pick.state;
    i += steps[pick.value][0];
    j += steps[pick.value][1];
    roads[i].push(j);
  }
  return { value: roads, state: s };
}

// Nodes on each floor, and which nodes of the next floor each connects to.
function rollLayout(state: number, rules: MapRules): Rolled<number[][][]> {
  let s = state;
  const widths: number[] = [];
  for (let f = 0; f < rules.floors; f++) {
    const r = pickInRange(s, rules.nodesPerFloor);
    s = r.state;
    widths.push(r.value);
  }
  const next: number[][][] = []; // next[f][i] = targets on floor f+1
  for (let f = 0; f < rules.floors; f++) {
    if (f + 1 < rules.floors) {
      const roads = rollRoads(s, widths[f], widths[f + 1], rules.nextPerNode.max);
      s = roads.state;
      next.push(roads.value);
    } else {
      next.push(Array.from({ length: widths[f] }, () => []));
    }
  }
  return { value: next, state: s };
}

// Every stop on a later floor that can be reached from this one by following roads.
export function reachableStops(map: ActMap, floor: number, index: number): MapNode[] {
  let here = new Set<number>([index]);
  const found: MapNode[] = [];
  for (let f = floor; f < map.floors.length; f++) {
    const there = new Set<number>();
    for (const i of here) for (const j of map.floors[f - 1][i].next) there.add(j);
    for (const j of [...there].sort((a, b) => a - b)) found.push(map.floors[f][j]);
    here = there;
  }
  return found;
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
    const floors: MapNode[][] = [];
    for (let f = 0; f < rules.floors; f++) {
      const row: MapNode[] = [];
      for (let i = 0; i < layout.value[f].length; i++) {
        const t = pickType(s, f + 1, rules);
        s = t.state;
        row.push({
          floor: f + 1,
          index: i,
          type: t.value,
          next: layout.value[f][i],
        });
      }
      floors.push(row);
    }
    if (!fitsRules(floors, rules)) continue;
    const boss = nextInt(s, act.bossPool.length);
    return {
      value: { actId: act.id, floors, bossId: act.bossPool[boss.value] },
      state: boss.state,
    };
  }
  throw new Error(`data/run.json: ${act.id}: no map fit the rules in ${rules.maxAttempts} attempts`);
}
