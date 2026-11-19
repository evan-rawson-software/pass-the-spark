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
  // Upgrade parameters. Each is optional and defaults to 0, which keeps the base behaviour.
  extraTriggers?: number; // echo only: extra pending triggers each time it triggers
  extraReveals?: number; // lookout only: extra dominoes revealed
  strengthBonus?: number; // mimic only: added to the strength the copied effect resolves at
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

// data/run.json: the ordered list of acts for a run.
export type NodeType = "fight" | "elite" | "rest" | "trader" | "event";

export interface MapRules {
  floors: number; // floors before the boss
  nodesPerFloor: { min: number; max: number };
  nextPerNode: { min: number; max: number }; // connections to the next floor
  fixedFloors: Record<string, NodeType>; // floor number -> type for every node on it
  weights: Record<NodeType, number>; // mix of the other floors
  eliteMinFloor: number;
  restMinFloor: number; // random (non-fixed) rest nodes start here
  restBannedFloors: number[];
  maxRestPerPath: number;
  maxTraderPerPath: number;
  minTradersPerAct: number;
  maxAttempts: number; // re-rolls before generation gives up
}

export interface ActData {
  id: string;
  bossPool: string[]; // enemy ids, tier "boss"
  map: MapRules;
}

export interface RunData {
  acts: ActData[];
}
