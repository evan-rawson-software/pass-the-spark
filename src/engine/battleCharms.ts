// Charms that change a battle. Each function reads the numbers from the charm data and returns
// nothing extra (0, or no charms) when the owner doesn't hold the charm. "Owner" is the player whose
// domino it is ("your" in a charm's wording). The functions that change a node return the ids of the
// charms that did, so the cascade can emit a `charm` event for each.

import { heldCharmNumber } from "./charms";
import type { Amp, CapEffectKind, Charm, Domino, Spark } from "./types";

// What these functions read: BattleState and BattleView both fit.
export interface CharmInput {
  charmDefs: Charm[];
  players: { id: string; charms: string[] }[];
}

function holds(state: CharmInput, owner: string, id: string): boolean {
  return state.players.some((p) => p.id === owner && p.charms.includes(id));
}

function number(state: CharmInput, owner: string, id: string, key: string): number {
  const player = state.players.find((p) => p.id === owner);
  return player ? heldCharmNumber(state.charmDefs, player.charms, id, key) : 0;
}

// The player's hand size bonus for this battle: Early Riser (+1) and Deep Pockets (+2). Neither adds placements.
export function handSizeBonus(state: CharmInput, owner: string): number {
  return number(state, owner, "early_riser", "handSize") + number(state, owner, "deep_pockets", "handSize");
}

// How many rounds of intents the player sees ahead (Spyglass), 0 without it.
export function spyglassRounds(state: CharmInput, owner: string): number {
  return number(state, owner, "spyglass", "rounds");
}

// The outputs a junction played by owner opens: Hall of Mirrors adds copies of the first output spark.
export function outputsOf(state: CharmInput, owner: string, d: Domino): Spark[] {
  const extra = d.kind === "junction" ? number(state, owner, "hall_of_mirrors", "extraEnds") : 0;
  return extra > 0 ? [...d.output, ...Array(extra).fill(d.output[0])] : d.output;
}

// What a node does to the charge passing through it. charge arrives; sparkCount is the number of
// different sparks on the path including this node's intake; opener is true for the first domino.
// Order: the amplifier's own change (with Overcharge, Resonance, Prism), then Keystone, then Spark Starter.
export interface Through {
  out: number;
  echo: number; // repeats this node adds for caps further along
  charms: string[];
}

export function throughNode(state: CharmInput, owner: string, d: Domino, charge: number, sparkCount: number, opener: boolean): Through {
  const result: Through = { out: charge, echo: 0, charms: [] };
  const use = (id: string, amount: number): number => {
    if (amount > 0) result.charms.push(id);
    return amount;
  };
  if (d.kind === "amplifier" && d.amp) {
    const amp: Amp = d.amp;
    if (amp.op === "add") {
      result.out = charge + amp.value;
    } else if (amp.op === "mul") {
      result.out = charge * (amp.value + use("overcharge", number(state, owner, "overcharge", "multiplierAdd")));
    } else if (amp.op === "echo") {
      result.echo = amp.value + use("resonance", number(state, owner, "resonance", "repeats"));
    } else {
      result.out = charge + amp.value * (sparkCount + use("prism", number(state, owner, "prism", "sparks")));
    }
    result.out += use("keystone", number(state, owner, "keystone", "charge"));
  }
  if (opener) result.out += use("spark_starter", number(state, owner, "spark_starter", "charge"));
  return result;
}

// A cap's flat bonus per trigger. intake is the spark it is set off by (the spark of the end it is on).
export function capBonus(state: CharmInput, owner: string, effect: CapEffectKind, intake: Spark): { bonus: number; charms: string[] } {
  const result = { bonus: 0, charms: [] as string[] };
  const add = (id: string, amount: number) => {
    if (amount > 0) {
      result.bonus += amount;
      result.charms.push(id);
    }
  };
  add(intake.toLowerCase() + "_lens", number(state, owner, intake.toLowerCase() + "_lens", "bonus"));
  if (effect === "block") add("bulwark", number(state, owner, "bulwark", "bonus"));
  return result;
}

// Extra triggers a cap gets from charms: Lightning Rod (set off by its sparks) and First Echo (the
// owner's first cap to go off this cascade). They add up; the trigger cap is applied by the caller.
export function capExtraTriggers(state: CharmInput, owner: string, intake: Spark, firstOfOwner: boolean): { extra: number; charms: string[] } {
  const result = { extra: 0, charms: [] as string[] };
  const rod = state.charmDefs.find((c) => c.id === "lightning_rod");
  if (rod?.sparks?.includes(intake) && holds(state, owner, "lightning_rod")) {
    result.extra += number(state, owner, "lightning_rod", "extraTriggers");
    result.charms.push("lightning_rod");
  }
  if (firstOfOwner && holds(state, owner, "first_echo")) {
    result.extra += number(state, owner, "first_echo", "extraTriggers");
    result.charms.push("first_echo");
  }
  return result;
}

// Junction Runner: the party block when the owner's junction lights up.
export function junctionRunnerBlock(state: CharmInput, owner: string): number {
  return number(state, owner, "junction_runner", "block");
}
