// Enemy intent choice and passive lookup. Plain functions over plain data.

import { nextFloat } from "./rng";
import type { Intent, Passive, Pattern } from "./types";

// The part of the enemy's battle state that rolling an intent needs and changes.
export interface IntentSource {
  intents: Intent[];
  pattern: Pattern;
  queue: string[]; // intent ids already rolled, this round's first
  rolled: number; // how many intents have been rolled so far
  lastIntent: string | null; // the last one rolled
  repeats: number; // how many in a row of that one
}

export function passiveOf<K extends Passive["kind"]>(enemy: { passives: Passive[] }, kind: K): Extract<Passive, { kind: K }> | undefined {
  return enemy.passives.find((p) => p.kind === kind) as Extract<Passive, { kind: K }> | undefined;
}

// Rolls the next intent and adds its id to the end of the queue. Returns the new RNG state.
// A cycle follows its order; a weighted pattern draws by weight with the battle RNG, leaving out the
// last intent rolled once it has come up maxRepeat times in a row (default 2). Because the queue holds the
// rolled ids, the intents of the coming rounds are known exactly.
export function rollIntentId(enemy: IntentSource, rng: number): number {
  const pattern = enemy.pattern;
  let id: string;
  if (pattern.type === "cycle") {
    id = pattern.order[enemy.rolled % pattern.order.length];
  } else {
    const maxRepeat = pattern.maxRepeat ?? 2;
    let ids = Object.keys(pattern.weights);
    if (enemy.lastIntent !== null && enemy.repeats >= maxRepeat) ids = ids.filter((x) => x !== enemy.lastIntent);
    const total = ids.reduce((sum, x) => sum + pattern.weights[x], 0);
    const roll = nextFloat(rng);
    rng = roll.state;
    let pick = roll.value * total;
    id = ids[ids.length - 1];
    for (const x of ids) {
      pick -= pattern.weights[x];
      if (pick < 0) {
        id = x;
        break;
      }
    }
  }
  enemy.repeats = id === enemy.lastIntent ? enemy.repeats + 1 : 1;
  enemy.lastIntent = id;
  enemy.rolled += 1;
  enemy.queue.push(id);
  return rng;
}
