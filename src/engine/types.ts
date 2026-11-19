// Types for the JSON formats in data/. Types only; no logic.

export type Spark = "Ember" | "Tide" | "Gale" | "Storm" | "Void" | "Rot";

export type EffectKind =
  | "damage"
  | "block"
  | "heal"
  | "amplify"
  | "echo"
  | "mimic"
  | "reflect"
  | "lookout";

export interface Effect {
  kind: EffectKind;
  base?: number; // damage, block, heal, amplify only
  spectrum?: boolean;
  ignoresBlock?: boolean;
}

export interface Domino {
  id: string;
  name: string;
  intake: Spark[] | "any";
  output: Spark[]; // one or more
  effect: Effect;
}

export type Tier = "basic" | "elite" | "boss";

export type AuditorDamage =
  | { rule: "strength" } // equal to current strength
  | { rule: "flat"; amount: number };

// Parameters are optional overrides of the defaults in Config.
export type Passive =
  | { kind: "auditor"; damage?: AuditorDamage }
  | { kind: "glutton"; heal?: number };

export interface Enemy {
  id: string;
  name: string;
  tier: Tier;
  maxHealth: number;
  drawPerRound: number;
  handLimit: number;
  deck: string[]; // domino ids
  passives: Passive[];
}

export interface Config {
  partyMaxHealth: number;
  playerDrawPerRound: number;
  playerHandLimit: number;
  triggerCap: number;
  enemyReactionsScaleWithLap: boolean;
  auditorDamage: AuditorDamage;
  gluttonHeal: number;
}

// data/starter-deck.json is a list of domino ids; copies repeat the id.
export type DeckList = string[];
