// The planning bot: it plans the whole tree the way a table of people does, then plays its own share
// of it. Tooling, not engine rules. It works from a BattleView only (open hands, the board, the
// intent, block, enemy health); it never reads a deck or the RNG.
//
// planTree(view, rng) is the search. It does not care who places in which order: it only asks "which
// tree, built from the board as it stands and the dominoes in everyone's hands, is best?". Each player's
// placements are the engine's own (getPlayerChoices counts them from the board). How the table builds
// the plan in a round lives in createPlannerBot below, the adapter.
//
// The search is a beam search. Start from the board as it stands. At every step add one domino, from
// any player's hand, to every open end the engine says it can go on (getPlayerChoices, so the
// placements, the open-end limit, the Warden's lock and the Spark Shrine are the engine's own). Keep the best
// BEAM_WIDTH partial trees and stop when no tree can grow or MAX_PLACEMENTS is reached. The best
// tree seen at any size wins.
//
// A tree is scored by the engine's own preview of setting it off (previewSetOff on a view whose board
// is the hypothetical tree): lethal first, then damage to the enemy minus the damage the party would
// still take from the intent (block only counts up to what the intent deals, since the preview
// already applies it). Every hit counts through the preview's damage, and reaching the enemy's line
// counts through the halved attack in the damage the party still takes. To rank partial trees the beam adds an optimistic estimate for the open ends:
// each end, highest charge first, is given the best cap still in a hand.
//
// Ties are broken by the caller's RNG state: every tree gets a tie key hashed from that state and its
// own shape, so equal trees are ordered the same way on every re-plan within a battle.

import { getOpenEnds, getPlayerChoices, previewSetOff } from "../src/engine/battle";
import type { Choice } from "../src/engine/battle";
import { outputsOf } from "../src/engine/battleCharms";
import { nextUint32 } from "../src/engine/rng";
import type { BattleView } from "../src/engine/view";
import type { Domino } from "../src/engine/types";

export const BEAM_WIDTH = 3; // partial trees kept at each size
export const MAX_PLACEMENTS = 14; // the most dominoes a plan adds to the board
const LETHAL = 1_000_000;

// One domino to add. The end it goes on is either an open end of the board as it stands (end) or an
// output of an earlier placement in the same plan (parent, output). The opener has neither.
export interface Placement {
  domino: string;
  owner: string;
  end?: number;
  parent?: number;
  output?: number;
}

interface Tree {
  view: BattleView; // the board with the tree on it, and the hands with its dominoes taken out
  plan: Placement[];
  key: string; // the tree's shape, to drop the same tree reached in a different order
  exact: number; // what the tree would do if set off now
  rank: number; // exact plus the estimate for the open ends
  tie: number;
}

function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

// The shape of a board: each node with its owner and what hangs from each output.
function shape(view: BattleView): string {
  const { nodes, ends } = view.board;
  const below = new Map<number, number>(); // end id -> node attached to it
  for (const n of nodes) if (n.end !== null) below.set(n.end, n.id);
  const text = (id: number): string => {
    const n = nodes.find((x) => x.id === id)!;
    const kids = ends.filter((e) => e.node === id).map((e) => (below.has(e.id) ? text(below.get(e.id)!) : "-"));
    return `${n.domino}@${n.owner}(${kids.join(",")})`;
  };
  return nodes.length === 0 ? "" : text(nodes[0].id); // the opener is the first node
}

// The view after `owner` plays `domino` on `end`. Only the board and that hand change. The board
// bookkeeping mirrors the engine's own (a node, then one end per output, outputs as the engine's
// outputsOf says so Hall of Mirrors counts).
function extend(view: BattleView, owner: string, domino: Domino, end: number | null): BattleView {
  const { nodes, ends, nextNode, nextEnd } = view.board;
  const parent = end === null ? null : nodes.find((n) => n.id === ends.find((e) => e.id === end)!.node)!;
  const node = { id: nextNode, domino: domino.id, owner, end, depth: parent === null ? 0 : parent.depth + 1 };
  const outputs = outputsOf(view, owner, domino).map((spark, index) => ({ id: nextEnd + index, node: node.id, index, spark }));
  const players = view.players.map((p) => {
    if (p.id !== owner) return p;
    const hand = p.hand.slice();
    hand.splice(hand.indexOf(domino.id), 1);
    return { ...p, hand };
  });
  return { ...view, board: { nodes: [...nodes, node], ends: [...ends, ...outputs], nextNode: nextNode + 1, nextEnd: nextEnd + outputs.length }, players };
}

// An estimate of what the open ends can still earn from the caps left in hands: the highest-charge
// end gets the best cap, and so on. Damage counts in full; block only up to the damage still coming.
function openEndWorth(view: BattleView, stillTaken: number): number {
  const open = getOpenEnds(view, view.players[0].id).sort((a, b) => b.charge * b.triggers - a.charge * a.triggers);
  if (open.length === 0) return 0;
  const caps: Domino[] = [];
  for (const p of view.players) for (const id of p.hand) caps.push(view.dominoes.find((d) => d.id === id)!);
  const left = caps.filter((d) => d.kind === "cap" && d.effect);
  let block = stillTaken;
  let total = 0;
  for (const e of open) {
    let best = 0;
    let pick = -1;
    left.forEach((d, i) => {
      const raw = d.effect!.base * e.charge * e.triggers;
      const worth = d.effect!.kind === "damage" ? raw : Math.min(raw, block);
      if (worth > best) {
        best = worth;
        pick = i;
      }
    });
    if (pick < 0) continue;
    if (left[pick].effect!.kind === "block") block -= best;
    total += best;
    left.splice(pick, 1);
  }
  return total;
}

// The preview copies the whole view every time it runs, so the search works on a trimmed one: only the
// domino and charm definitions in play, and no draw or discard piles (a planner has no use for them).
function slim(view: BattleView): BattleView {
  const inPlay = new Set<string>([...view.board.nodes.map((n) => n.domino), ...view.players.flatMap((p) => p.hand)]);
  const held = new Set(view.players.flatMap((p) => p.charms));
  return {
    ...view,
    dominoes: view.dominoes.filter((d) => inPlay.has(d.id)),
    charmDefs: view.charmDefs.filter((c) => held.has(c.id)),
    players: view.players.map((p) => ({ ...p, deck: [], discard: [] })),
    openEnds: [],
    upcomingIntents: [],
  };
}

// The best tree of dominoes to add to this board, as placements in building order. Empty when
// adding nothing is best.
export function planTree(full: BattleView, rng: number): Placement[] {
  const view = slim(full);
  const baseEnd = view.board.nextEnd; // ids from here on are the plan's own
  const baseNode = view.board.nextNode;
  const dominoOf = new Map(view.dominoes.map((d) => [d.id, d]));
  const tieOf = (key: string) => nextUint32(((fnv(key) ^ rng) >>> 0) || 1).value;

  const evaluate = (v: BattleView, plan: Placement[]): Tree => {
    const key = shape(v);
    const p = previewSetOff(v)!;
    const exact = p.lethal ? LETHAL + p.damage : p.damage - p.partyDamage;
    return { view: v, plan, key, exact, rank: p.lethal ? exact : exact + openEndWorth(v, p.partyDamage), tie: tieOf(key) };
  };
  const better = (a: Tree, b: Tree, field: "exact" | "rank") => a[field] > b[field] || (a[field] === b[field] && a.tie < b.tie);

  const root = evaluate(view, []);
  let best = root;
  let beam = [root];
  for (let size = 0; size < MAX_PLACEMENTS && beam.length > 0; size++) {
    const children = new Map<string, Tree>();
    for (const tree of beam) {
      // Every way to add one domino. Players who hold the same charms are interchangeable to the
      // preview, so a domino on an end is tried once, from the one of them holding the most copies
      // (the tie-key picks between equals).
      const ways = new Map<string, { owner: string; end: number | null; copies: number }>();
      for (const player of tree.view.players) {
        const pending = getPlayerChoices(tree.view, player.id);
        if (!pending) continue;
        const charms = player.charms.slice().sort().join();
        for (const option of pending.plays) {
          const copies = player.hand.filter((id) => id === option.domino).length;
          for (const end of pending.opener ? [null] : option.ends) {
            const way = `${option.domino}|${end}|${charms}`;
            const held = ways.get(way);
            if (!held || copies > held.copies || (copies === held.copies && tieOf(player.id + way) < tieOf(held.owner + way))) ways.set(way, { owner: player.id, end, copies });
          }
        }
      }
      for (const [way, { owner, end }] of ways) {
        const domino = dominoOf.get(way.split("|")[0])!;
        const v = extend(tree.view, owner, domino, end);
        const key = shape(v);
        if (children.has(key)) continue;
        const placement: Placement = { domino: domino.id, owner };
        if (end !== null && end < baseEnd) placement.end = end;
        else if (end !== null) {
          // An output of a node this plan added: node ids run from baseNode in plan order.
          const hung = tree.view.board.ends.find((e) => e.id === end)!;
          placement.parent = hung.node - baseNode;
          placement.output = hung.index;
        }
        children.set(key, evaluate(v, [...tree.plan, placement]));
      }
    }
    if (children.size === 0) break;
    const next = [...children.values()];
    for (const t of next) if (better(t, best, "exact")) best = t;
    next.sort((a, b) => (better(a, b, "rank") ? -1 : 1));
    beam = next.slice(0, BEAM_WIDTH);
  }
  return best.plan;
}

// ---- the adapter: one seat's part of the plan, in the plan's order ----

// Where a placement goes now, as an end id on the board as it stands: its own open end, or the end
// of a placement already on the board (matched[i] is the board node placement i became). null when
// it hangs from a placement that is not on the board yet.
function endNow(view: BattleView, p: Placement, matched: Map<number, number>): number | null {
  if (p.end !== undefined) return p.end;
  if (p.parent === undefined) return null; // the opener
  const node = matched.get(p.parent);
  if (node === undefined) return null;
  return view.board.ends.find((e) => e.node === node && e.index === p.output)!.id;
}

// What a plan was made from, so a later turn can tell whether it still stands: the round, health,
// block, intent and charms, the board up to where the plan started, and every hand with the
// dominoes already played from the plan put back.
function basis(view: BattleView, rng: number, baseNode: number, matched: Map<number, number>, plan: Placement[]): string {
  const hands = view.players.map((p) => ({ id: p.id, charms: p.charms, hand: p.hand.slice() }));
  for (const [i, node] of matched) hands.find((h) => h.id === plan[i].owner)!.hand.push(view.board.nodes.find((n) => n.id === node)!.domino);
  for (const h of hands) h.hand.sort();
  const { round, intent, locked, blessing, party } = view;
  return JSON.stringify([rng, round, intent, locked, blessing, party, view.enemy.health, view.enemy.block, view.board.nodes.filter((n) => n.id < baseNode), hands]);
}

// The bot's memory for one battle (or one run): the plan it made, and what it was made from. Reusing
// the plan while the board only grows the way the plan said keeps the search to about once a round.
interface Memory {
  plan: Placement[];
  baseNode: number; // the board's next node id when the plan was made
  basis: string;
}

// Which placements of the remembered plan are on the board now, or null when the board holds anything
// else or the plan was made from something other than what the table sees now.
function matchPlan(view: BattleView, rng: number, memory: Memory): Map<number, number> | null {
  const matched = new Map<number, number>();
  for (const node of view.board.nodes.filter((n) => n.id >= memory.baseNode)) {
    const i = memory.plan.findIndex((p, k) => {
      if (matched.has(k) || p.domino !== node.domino || p.owner !== node.owner) return false;
      const opener = p.parent === undefined && p.end === undefined; // only the opener has no end
      return endNow(view, p, matched) === node.end && (node.end !== null || opener);
    });
    if (i < 0) return null;
    matched.set(i, node.id);
  }
  return basis(view, rng, memory.baseNode, matched, memory.plan) === memory.basis ? matched : null;
}

// Makes the bot for one battle or run. botChoice(view, seat, rng) re-plans (or reuses the plan the
// board has followed so far) and places the seat's next domino of the plan. The plan is built in its own
// order (that order is always legal, whatever the open-end limit or the lock), so a seat whose next domino
// comes after another seat's waits (choice null) and is asked again after the others have placed. A seat
// with none left sets Ready. The RNG state is returned unchanged: the tie keys are hashed from it, so
// every seat sees the same tie-breaks while the board is the same.
export function createPlannerBot(): (view: BattleView, seat: string, rng: number) => { choice: Choice | null; rng: number } {
  let memory: Memory | null = null;
  return (view, seat, rng) => {
    const pending = getPlayerChoices(view, seat);
    if (pending === null) throw new Error("the battle is over");
    let matched = memory ? matchPlan(view, rng, memory) : null;
    if (!memory || !matched) {
      const plan = planTree(view, rng);
      matched = new Map();
      memory = { plan, baseNode: view.board.nextNode, basis: basis(view, rng, view.board.nextNode, matched, plan) };
    }
    const ready: Choice = { type: "ready", player: seat, ready: true };
    const next = memory.plan.findIndex((_, i) => !matched.has(i));
    if (next < 0 || !memory.plan.some((p, i) => !matched.has(i) && p.owner === seat)) return { choice: ready, rng };
    const p = memory.plan[next];
    if (p.owner !== seat) return { choice: null, rng }; // not this seat's turn to build yet
    const end = endNow(view, p, matched);
    if (pending.opener) {
      if (p.parent === undefined && p.end === undefined && pending.plays.some((o) => o.domino === p.domino)) return { choice: { type: "play", player: seat, domino: p.domino }, rng };
    } else if (end !== null && pending.plays.some((o) => o.domino === p.domino && o.ends.includes(end))) {
      return { choice: { type: "play", player: seat, domino: p.domino, end }, rng };
    }
    return { choice: ready, rng }; // the plan no longer fits (not expected): stop building
  };
}
