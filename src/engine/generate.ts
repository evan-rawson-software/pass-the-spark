// Generated dominoes: built at runtime from the rarity pools in data/domino-pools.json.
// Plain functions over the seeded RNG; the state is passed in and the new state is returned.

import { nextFloat, nextInt } from "./rng";
import type { Rolled } from "./rng";
import type { Domino, Effect, PoolEffect, Pools, Rarity, RarityPool, Spark } from "./types";

const RARITIES: Rarity[] = ["common", "uncommon", "rare"];

function pick<T>(state: number, items: readonly T[]): Rolled<T> {
  const r = nextInt(state, items.length);
  return { value: items[r.value], state: r.state };
}

// Draws a rarity from the given weights.
export function rollRarityFromOdds(state: number, odds: Record<Rarity, number>): Rolled<Rarity> {
  let total = 0;
  for (const rarity of RARITIES) total += odds[rarity];
  const r = nextFloat(state);
  let roll = r.value * total;
  for (const rarity of RARITIES) {
    if (roll < odds[rarity]) return { value: rarity, state: r.state };
    roll -= odds[rarity];
  }
  return { value: "rare", state: r.state }; // not reached: validation requires some weight
}

// The pool a player may draw from: entries they have not unlocked are left out (order kept).
// Returns null when nothing is left to draw (no intake or no effect). unlocks is a list of
// unlock ids (data/progression.json); null means everything is unlocked and the pool is used as is.
export function unlockedPool(pool: RarityPool, unlocks: readonly string[] | null, advancedSparks: readonly Spark[]): RarityPool | null {
  if (unlocks === null) return pool;
  const has = (id: string) => unlocks.includes(id);
  const advanced = has("advancedSparks");
  const intakes = pool.intakes.filter((i) => (i === "any" ? has("anyIntake") : advanced || i.every((x) => !advancedSparks.includes(x))));
  const effects: PoolEffect[] = [];
  for (const e of pool.effects) {
    if ((e.kind === "lookout" || e.kind === "echo" || e.kind === "mimic") && !has(e.kind)) continue;
    const outputs = has("twoSpark") ? e.outputs : e.outputs.filter((o) => o.length === 1);
    if (outputs.length === 0) continue;
    const traits = e.traits?.filter((t) => has(t));
    effects.push({ ...e, outputs, traits });
  }
  if (intakes.length === 0 || effects.length === 0) return null;
  return { ...pool, intakes, effects, advancedOutputShare: advanced ? pool.advancedOutputShare : 0 };
}

// One domino. index makes the id run-unique ("gen#7"); the caller keeps the counter.
// The intake side and the effect + output side are drawn separately.
// unlocks limits what can be drawn; a rarity with nothing unlocked is rolled one rarity lower.
export function generateDomino(state: number, rarity: Rarity, pools: Pools, index: number, unlocks: readonly string[] | null = null): Rolled<Domino> {
  let pool = unlockedPool(pools.rarities[rarity], unlocks, pools.sparkGroups.advanced);
  while (pool === null) {
    rarity = RARITIES[RARITIES.indexOf(rarity) - 1]; // common always has damage and block
    pool = unlockedPool(pools.rarities[rarity], unlocks, pools.sparkGroups.advanced);
  }
  let s = state;

  const intakeRoll = pick(s, pool.intakes);
  s = intakeRoll.state;
  const intake = intakeRoll.value === "any" ? "any" : intakeRoll.value.slice();

  const effectRoll = pick(s, pool.effects);
  s = effectRoll.state;
  const entry = effectRoll.value;

  const effect: Effect = { kind: entry.kind };
  if (entry.base) {
    const r = nextInt(s, entry.base[1] - entry.base[0] + 1);
    s = r.state;
    effect.base = entry.base[0] + r.value;
  }
  for (const trait of entry.traits ?? []) {
    const r = nextFloat(s);
    s = r.state;
    if (r.value < pool.traits[trait]) effect[trait] = true;
  }

  const outputRoll = pick(s, entry.outputs);
  s = outputRoll.state;
  const output: Spark[] = outputRoll.value.slice();
  if (pool.advancedOutputShare > 0) {
    for (let i = 0; i < output.length; i++) {
      const swap = nextFloat(s);
      s = swap.state;
      if (swap.value < pool.advancedOutputShare) {
        const advanced = pick(s, pools.sparkGroups.advanced);
        s = advanced.state;
        output[i] = advanced.value;
      }
    }
  }

  const wordRoll = pick(s, entry.names);
  s = wordRoll.state;

  const domino: Domino = {
    id: `gen#${index}`,
    name: `${output[0]} ${wordRoll.value}`,
    intake,
    output,
    effect,
    rarity,
  };
  return { value: domino, state: s };
}
