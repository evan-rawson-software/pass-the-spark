import { outputsOf } from "../engine/battleCharms";
import type { GameEvent } from "../engine/events";
import type { BattleView } from "../engine/view";

// The table as it looks part-way through a step's events. It starts as the view from before the
// step and each event nudges it using only the numbers the event carries (and, for a played domino's
// new open ends, the engine's own outputsOf). No rules: the scene redraws from getView once the
// step is done, so anything missed here is corrected then.

export interface ShownTable {
  view: BattleView;
  lit: Set<number>; // board nodes the cascade has lit so far
  fizzled: Set<number>; // open ends the cascade has left dim
}

export function startShown(view: BattleView): ShownTable {
  return { view, lit: new Set(), fizzled: new Set() };
}

// How many dominoes are left in a seat's deck. applyEvent keeps it (and the discard piles) in step
// with the engine as the events play.
export function deckCount(v: BattleView, seat: string): number {
  return v.players.find((p) => p.id === seat)?.deck.length ?? 0;
}

export function applyEvent(s: ShownTable, ev: GameEvent): void {
  const v = s.view;
  const side = (x: "party" | "enemy") => (x === "party" ? v.party : v.enemy);
  switch (ev.type) {
    case "roundStart":
      // The finished board goes to its owners' discard piles.
      for (const node of v.board.nodes) v.players.find((p) => p.id === node.owner)?.discard.push(node.domino);
      v.round = ev.round;
      v.board = { nodes: [], ends: [] };
      v.locked = null;
      v.enemy.staggered = false;
      for (const p of v.players) p.ready = false;
      s.lit.clear();
      s.fizzled.clear();
      break;
    case "intent":
      v.intent = ev.intent;
      break;
    case "draw": {
      const p = v.players.find((q) => q.id === ev.player);
      p?.hand.push(...ev.dominoes);
      p?.deck.splice(0, ev.count);
      break;
    }
    case "reshuffle": {
      // Only the counts matter on screen: the discard pile becomes the deck.
      const p = v.players.find((q) => q.id === ev.player);
      if (p) {
        p.deck = p.deck.concat(p.discard);
        p.discard = [];
      }
      break;
    }
    case "play": {
      const player = v.players.find((p) => p.id === ev.player);
      const d = v.dominoes.find((x) => x.id === ev.domino);
      if (player) removeOne(player.hand, ev.domino);
      if (d) {
        v.board.nodes.push({ id: ev.node, domino: ev.domino, owner: ev.player, end: ev.end, depth: ev.depth });
        outputsOf(v, ev.player, d).forEach((spark, index) => v.board.ends.push({ id: v.board.ends.length, node: ev.node, index, spark }));
      }
      break;
    }
    case "takeBack": {
      const player = v.players.find((p) => p.id === ev.player);
      player?.hand.push(ev.domino);
      removeNode(v, ev.node);
      break;
    }
    case "ready": {
      const player = v.players.find((p) => p.id === ev.player);
      if (player) player.ready = ev.ready;
      break;
    }
    case "lineReached":
      v.enemy.staggered = true;
      break;
    case "nodeLit":
      s.lit.add(ev.node);
      break;
    case "fizzle":
      s.fizzled.add(ev.end);
      break;
    case "damage": {
      const t = side(ev.side);
      t.health = Math.max(0, t.health - ev.amount);
      t.block = Math.max(0, t.block - ev.blocked);
      break;
    }
    case "block":
      side(ev.side).block += ev.amount;
      break;
    case "passive":
      if (ev.passive === "warden") v.locked = ev.spark ?? null;
      else if (ev.passive === "glutton") v.enemy.health += ev.amount ?? 0;
      else if (ev.passive === "longNight") for (const a of v.intent.actions) if (a.kind === "attack") a.value += ev.amount ?? 0;
      break;
    case "blockReset":
      side(ev.side).block = 0;
      break;
    default:
      break;
  }
}

// A take-back: the node leaves the board with its (open) outputs, and the nodes and ends after it close up.
// The same bookkeeping as the engine's own, so the shown board matches the one the host sends next.
export function removeNode(v: Pick<BattleView, "board">, id: number): void {
  const nodes = v.board.nodes.filter((n) => n.id !== id);
  const ends = v.board.ends.filter((e) => e.node !== id);
  const endIndex = new Map(ends.map((e, i) => [e.id, i]));
  nodes.forEach((n, i) => {
    n.id = i;
    n.end = n.end === null ? null : (endIndex.get(n.end) as number);
  });
  ends.forEach((e, i) => {
    e.id = i;
    if (e.node > id) e.node -= 1;
  });
  v.board = { nodes, ends };
}

function removeOne(list: string[], id: string): void {
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
}
