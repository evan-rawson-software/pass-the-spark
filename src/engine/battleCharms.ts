// Charms that change numbers in a battle. Each function reads the numbers from the charm data and
// returns 0 when the player doesn't hold the charm. "Owner" is the player whose domino it is; the
// enemy (or no owner, null) never gets any.

import { heldCharmNumber } from "./charms";
import type { Charm, Spark } from "./types";

// What these functions read: BattleState and BattleView both fit.
export interface CharmInput {
  charmDefs: Charm[];
  players: { id: string; charms: string[] }[];
}

function number(state: CharmInput, owner: string | null, id: string, key: string): number {
  const player = state.players.find((p) => p.id === owner);
  return player ? heldCharmNumber(state.charmDefs, player.charms, id, key) : 0;
}

// Ember, Tide and Gale Lens: the flat bonus for a domino set off by this spark (damage, block, heal).
// spark is null for the opener (Spark Starter), which no lens applies to.
export function lensBonus(state: CharmInput, owner: string | null, spark: Spark | null): number {
  return spark === null ? 0 : number(state, owner, spark.toLowerCase() + "_lens", "bonus");
}

export function holdsCharm(state: CharmInput, owner: string, id: string): boolean {
  return state.players.some((p) => p.id === owner && p.charms.includes(id));
}

export function sparkStarterStrength(state: CharmInput, owner: string): number {
  return number(state, owner, "spark_starter", "strength");
}

export function lapRunnerBlock(state: CharmInput, owner: string): number {
  return number(state, owner, "lap_runner", "block");
}

// Triggers First Echo gives the first domino of the round (2 means one extra); 0 without the charm.
export function firstEchoTriggers(state: CharmInput, owner: string): number {
  return number(state, owner, "first_echo", "triggers");
}

// Lightning Rod: the total triggers for a domino set off by one of the charm's sparks (data), else 0.
export function lightningRodTriggers(state: CharmInput, owner: string, answered: Spark | null): number {
  if (answered === null || !holdsCharm(state, owner, "lightning_rod")) return 0;
  const charm = state.charmDefs.find((c) => c.id === "lightning_rod");
  return charm?.sparks?.includes(answered) ? number(state, owner, "lightning_rod", "triggers") : 0;
}

export function blockBonus(state: CharmInput, owner: string | null): number {
  return number(state, owner, "bulwark", "bonus");
}

export function extraDraws(state: CharmInput, owner: string): number {
  return number(state, owner, "early_riser", "draws");
}

export function extraReveals(state: CharmInput, owner: string | null): number {
  return number(state, owner, "spyglass", "reveals");
}

export function extraEchoTriggers(state: CharmInput, owner: string | null): number {
  return number(state, owner, "resonance", "triggers");
}

export function mirrorStrength(state: CharmInput, owner: string | null): number {
  return number(state, owner, "hall_of_mirrors", "strength");
}

// Keystone: answers add this much strength instead of 1, so the extra on top of 1 (0 without it).
export function answerStrengthBonus(state: CharmInput, owner: string | null): number {
  const strength = number(state, owner, "keystone", "strength");
  return strength > 0 ? strength - 1 : 0;
}

export function extraLap(state: CharmInput, owner: string | null): number {
  return number(state, owner, "overcharge", "laps");
}

export function extraSpectrum(state: CharmInput, owner: string | null): number {
  return number(state, owner, "prism", "sparks");
}

// The player's hand limit for this battle (Deep Pockets).
export function handLimitOf(state: CharmInput & { config: { playerHandLimit: number } }, owner: string): number {
  return state.config.playerHandLimit + number(state, owner, "deep_pockets", "handLimit");
}
