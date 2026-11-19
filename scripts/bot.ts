// The co-op bot: picks a battle choice from what a seat can see (its view), using the engine's
// legality (getPendingChoice) and previews (previewPlay). Tooling only, not engine rules.
// Ties are broken with the caller's seeded RNG state, which is passed in and returned.

import { ENEMY_SEAT, getPendingChoice, previewPlay } from "../src/engine/battle";
import type { Choice } from "../src/engine/battle";
import { nextInt } from "../src/engine/rng";
import type { BattleView } from "../src/engine/view";
import type { Spark } from "../src/engine/types";

// Could `seat` answer a spark set if it held `hand`? The engine's legality decides (intakes,
// "any", the Warden's locked spark).
function canAnswer(view: BattleView, seat: string, hand: string[], sparks: Spark[]): boolean {
  const probe = {
    ...view,
    seat,
    phase: "answer" as const,
    chain: { ...view.chain, sparks },
    players: view.players.map((p) => (p.id === seat ? { ...p, hand } : p)),
  };
  const pending = getPendingChoice(probe);
  return pending !== null && pending.type === "answer" && pending.options.length > 0;
}

// The player who would get the spark after `seat`. The enemy is skipped: its reaction hits the
// party, so it is treated as not answering and the player after it is the one that counts.
function nextPlayer(view: BattleView, seat: string): string {
  const order = view.seatOrder;
  let i = order.indexOf(seat);
  do i = (i + 1) % order.length;
  while (order[i] === ENEMY_SEAT);
  return order[i];
}

function outputOf(view: BattleView, domino: string): Spark[] {
  const d = view.dominoes.find((x) => x.id === domino);
  if (!d) throw new Error("unknown domino " + domino);
  return d.output;
}

function removeOne(list: string[], id: string): string[] {
  const copy = list.slice();
  copy.splice(copy.indexOf(id), 1);
  return copy;
}

// The items with the best (lexicographically highest) key.
function bestOf<T extends { key: number[] }>(items: T[]): T[] {
  let best: T[] = [];
  for (const it of items) {
    const cmp = best.length === 0 ? 1 : compare(it.key, best[0].key);
    if (cmp > 0) best = [it];
    else if (cmp === 0) best.push(it);
  }
  return best;
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function pickOne<T>(items: T[], rng: number): { value: T; rng: number } {
  if (items.length === 1) return { value: items[0], rng };
  const r = nextInt(rng, items.length);
  return { value: items[r.value], rng: r.state };
}

// The choice `seat` makes in this view, and the new tie-break RNG state. The seat must be the
// one the battle is waiting on.
export function botChoice(view: BattleView, seat: string, rng: number): { choice: Choice; rng: number } {
  const pending = getPendingChoice(view);
  if (pending === null || pending.player !== seat) throw new Error("not this seat's turn");
  const me = view.players.find((p) => p.id === seat);
  if (!me) throw new Error("no such player " + seat);

  if (pending.type === "opener") {
    // The domino whose output the most teammates can answer, then the highest base value.
    const mates = view.players.filter((p) => p.id !== seat);
    const scored = pending.dominoes.map((id) => {
      const out = outputOf(view, id);
      const answerers = mates.filter((m) => canAnswer(view, m.id, m.hand, out)).length;
      const base = view.dominoes.find((d) => d.id === id)?.effect.base ?? 0;
      return { id, key: [answerers, base] };
    });
    const r = pickOne(bestOf(scored), rng);
    return { choice: { type: "opener", domino: r.value.id }, rng: r.rng };
  }

  // An answer: (domino, spark) pairs, scored by whether the next player can answer the output,
  // then by the preview's value.
  const scored: { id: string; spark: Spark; key: number[] }[] = [];
  const next = nextPlayer(view, seat);
  for (const option of pending.options) {
    const out = outputOf(view, option.domino);
    const hand = next === seat ? removeOne(me.hand, option.domino) : view.players.find((p) => p.id === next)!.hand;
    const passes = canAnswer(view, next, hand, out) ? 1 : 0;
    const previews = previewPlay(view, seat, option.domino);
    for (const spark of option.sparks) {
      const pv = previews.find((p) => p.spark === spark);
      scored.push({ id: option.domino, spark, key: [passes, pv ? pv.value : 0] });
    }
  }
  const r = pickOne(bestOf(scored), rng);
  return { choice: { type: "answer", domino: r.value.id, spark: r.value.spark }, rng: r.rng };
}
