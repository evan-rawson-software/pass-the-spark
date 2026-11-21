// Generated dominoes: built at runtime from the rarity pools in data/domino-pools.json.
// Plain functions over the seeded RNG; the state is passed in and the new state is returned.

import { nextFloat, nextInt } from "./rng";
import type { Rolled } from "./rng";
import type { Domino, DominoKind, Pools, Rarity, RarityPool, Spark } from "./types";

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

const KINDS: DominoKind[] = ["amplifier", "junction", "cap"];

// The pool a player may draw from: entries they have not unlocked are left out (order kept), and a
// kind with nothing left gets no weight. Returns null when nothing is left to draw (no intake, or no
// kind). unlocks is a list of unlock ids (data/progression.json); null means everything is unlocked
// and the pool is used as is.
export function unlockedPool(pool: RarityPool, unlocks: readonly string[] | null, advancedSparks: readonly Spark[]): RarityPool | null {
  if (unlocks === null) return pool;
  const has = (id: string) => unlocks.includes(id);
  const advanced = has("advancedSparks");
  const intakes = pool.intakes.filter((i) => (i === "any" ? has("anyIntake") : advanced || i.every((x) => !advancedSparks.includes(x))));
  const amplifiers = pool.amplifiers.filter((a) => a.unlock === undefined || has(a.unlock));
  const caps = pool.caps.filter((c) => c.unlock === undefined || has(c.unlock));
  const kindWeights = { ...pool.kindWeights };
  if (amplifiers.length === 0) kindWeights.amplifier = 0;
  if (caps.length === 0) kindWeights.cap = 0;
  if (pool.junctions.length === 0) kindWeights.junction = 0;
  if (intakes.length === 0 || KINDS.every((k) => kindWeights[k] <= 0)) return null;
  return {
    ...pool,
    kindWeights,
    intakes,
    amplifiers,
    caps,
    ignoresBlock: has("ignoresBlock") ? pool.ignoresBlock : 0,
    advancedOutputShare: advanced ? pool.advancedOutputShare : 0,
  };
}

function rollKind(state: number, weights: Record<DominoKind, number>): Rolled<DominoKind> {
  let total = 0;
  for (const k of KINDS) total += weights[k];
  const r = nextFloat(state);
  let roll = r.value * total;
  for (const k of KINDS) {
    if (weights[k] > 0 && roll < weights[k]) return { value: k, state: r.state };
    roll -= weights[k];
  }
  return { value: KINDS.filter((k) => weights[k] > 0)[0], state: r.state }; // not reached: rounding only
}

// One domino. index makes the id run-unique ("gen#7"); the caller keeps the counter.
// Drawn in this order: the kind, the intake, the outputs (an amplifier has 1, a junction 2 different ones),
// then the amplifier or cap from the rarity's list, and its name word.
// unlocks limits what can be drawn; a rarity with nothing unlocked is rolled one rarity lower.
export function generateDomino(state: number, rarity: Rarity, pools: Pools, index: number, unlocks: readonly string[] | null = null): Rolled<Domino> {
  let pool = unlockedPool(pools.rarities[rarity], unlocks, pools.sparkGroups.advanced);
  while (pool === null) {
    rarity = RARITIES[RARITIES.indexOf(rarity) - 1]; // common always has something to draw
    pool = unlockedPool(pools.rarities[rarity], unlocks, pools.sparkGroups.advanced);
  }
  let s = state;

  const kindRoll = rollKind(s, pool.kindWeights);
  s = kindRoll.state;
  const kind = kindRoll.value;

  const intakeRoll = pick(s, pool.intakes);
  s = intakeRoll.state;
  const intake = intakeRoll.value === "any" ? "any" : intakeRoll.value.slice();

  const output: Spark[] = [];
  const outputCount = kind === "amplifier" ? 1 : kind === "junction" ? 2 : 0;
  const left = pool.outputs.slice();
  for (let i = 0; i < outputCount; i++) {
    const r = pick(s, left);
    s = r.state;
    left.splice(left.indexOf(r.value), 1); // a junction's two outputs differ
    let spark = r.value;
    if (pool.advancedOutputShare > 0) {
      const swap = nextFloat(s);
      s = swap.state;
      if (swap.value < pool.advancedOutputShare) {
        const advanced = pick(s, pools.sparkGroups.advanced.filter((x) => !output.includes(x))); // a junction's outputs differ
        s = advanced.state;
        spark = advanced.value;
      }
    }
    output.push(spark);
  }

  const domino: Domino = { id: `gen#${index}`, name: "", kind, intake, output, rarity };
  let names: string[];
  if (kind === "amplifier") {
    const r = pick(s, pool.amplifiers);
    s = r.state;
    domino.amp = { ...r.value.amp };
    names = r.value.names;
  } else if (kind === "junction") {
    names = pool.junctions;
  } else {
    const r = pick(s, pool.caps);
    s = r.state;
    const base = nextInt(s, r.value.base[1] - r.value.base[0] + 1);
    s = base.state;
    domino.effect = { kind: r.value.kind, base: r.value.base[0] + base.value };
    if (r.value.kind === "damage" && pool.ignoresBlock > 0) {
      const t = nextFloat(s);
      s = t.state;
      if (t.value < pool.ignoresBlock) domino.effect.ignoresBlock = true;
    }
    names = r.value.names;
  }
  const wordRoll = pick(s, names);
  s = wordRoll.state;
  domino.name = `${intake === "any" ? "Any" : intake[0]} ${wordRoll.value}`;
  return { value: domino, state: s };
}
