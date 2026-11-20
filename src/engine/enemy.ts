// Enemy intent choice and passive lookup. Plain functions over plain data.

import { nextFloat } from "./rng";
import type { Intent, Passive, Pattern } from "./types";

// The part of the enemy's battle state that intent choice needs.
export interface IntentSource {
  intents: Intent[];
  pattern: Pattern;
  lastIntent: string | null; // id of the previous round's intent
  repeats: number; // how many rounds in a row that intent has been chosen
}

export function passiveOf<K extends Passive["kind"]>(enemy: { passives: Passive[] }, kind: K): Extract<Passive, { kind: K }> | undefined {
  return enemy.passives.find((p) => p.kind === kind) as Extract<Passive, { kind: K }> | undefined;
}

// The intent id for the round that is starting. A cycle follows the round number; a weighted
// pattern draws by weight with the battle RNG, leaving out the last intent once it has been
// chosen maxRepeat times in a row (default 2).
export function chooseIntentId(enemy: IntentSource, round: number, rng: number): { id: string; rng: number } {
  const pattern = enemy.pattern;
  if (pattern.type === "cycle") return { id: pattern.order[(round - 1) % pattern.order.length], rng };
  const maxRepeat = pattern.maxRepeat ?? 2;
  let ids = Object.keys(pattern.weights);
  if (enemy.lastIntent !== null && enemy.repeats >= maxRepeat) ids = ids.filter((id) => id !== enemy.lastIntent);
  const total = ids.reduce((sum, id) => sum + pattern.weights[id], 0);
  const roll = nextFloat(rng);
  let pick = roll.value * total;
  for (const id of ids) {
    pick -= pattern.weights[id];
    if (pick < 0) return { id, rng: roll.state };
  }
  return { id: ids[ids.length - 1], rng: roll.state };
}
