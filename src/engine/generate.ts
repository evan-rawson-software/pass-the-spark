// Generated dominoes: built at runtime from the rarity pools in data/domino-pools.json.
// Plain functions over the seeded RNG; the state is passed in and the new state is returned.

import { nextFloat, nextInt } from "./rng";
import type { Rolled } from "./rng";
import type { BattleType, Domino, Effect, Pools, Rarity, Spark } from "./types";

const RARITIES: Rarity[] = ["common", "uncommon", "rare"];

function pick<T>(state: number, items: readonly T[]): Rolled<T> {
  const r = nextInt(state, items.length);
  return { value: items[r.value], state: r.state };
}

// Draws a rarity using the weights for this battle type.
export function rollRarity(state: number, battleType: BattleType, pools: Pools): Rolled<Rarity> {
  return rollRarityFromOdds(state, pools.rarityOdds[battleType]);
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

// One domino. index makes the id run-unique ("gen#7"); the caller keeps the counter.
// The intake side and the effect + output side are drawn separately.
export function generateDomino(state: number, rarity: Rarity, pools: Pools, index: number): Rolled<Domino> {
  const pool = pools.rarities[rarity];
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
