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
  rarity?: Rarity; // generated dominoes only
  upgraded?: UpgradeSide[]; // sides already upgraded at a rest site (run instances only)
}

export type UpgradeSide = "left" | "right";

export type Tier = "basic" | "elite" | "boss";

export type AuditorDamage =
  | { rule: "strength" } // equal to current strength
  | { rule: "flat"; amount: number };

// Parameters are optional overrides of the defaults in Config.
export type Passive =
  | { kind: "auditor"; damage?: AuditorDamage }
  | { kind: "glutton"; heal?: number }
  | { kind: "longNight" } // its reactions and leftovers scale with lap
  | { kind: "warden"; sparks: Spark[] }; // each round one of these sparks is locked against players

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

// Generated dominoes (data/domino-pools.json).
export type Rarity = "common" | "uncommon" | "rare";
export type BattleType = "fight" | "elite" | "boss";
export type Trait = "spectrum" | "ignoresBlock";

// One possible right side. Value is drawn whole from [min, max]; the output list is drawn from outputs.
export interface PoolEffect {
  kind: EffectKind;
  names: string[]; // word after the spark in the name, e.g. "Strike" -> "Tide Strike"
  base?: [number, number]; // damage, block, amplify only
  traits?: Trait[]; // traits this effect may roll
  outputs: Spark[][];
}

export interface RarityPool {
  intakes: (Spark[] | "any")[]; // each entry is one intake; lists hold exactly one spark
  effects: PoolEffect[];
  traits: { spectrum: number; ignoresBlock: number }; // chance 0..1 per trait
  // Chance 0..1 that each output spark is swapped for a random advanced spark. Uncommon only; 0 elsewhere.
  advancedOutputShare: number;
}

export interface Pools {
  offerSize: number;
  sparkGroups: { basic: Spark[]; advanced: Spark[] }; // Rot is in neither and is never generated
  rarities: Record<Rarity, RarityPool>;
}

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

// One act of the run. Everything that differs between acts lives here.
export interface ActData {
  id: string;
  bossPool: string[]; // enemy ids, tier "boss"; one is picked when the act's map is generated
  normalPool: string[]; // enemy ids, tier "basic": the act's normal fights draw from these
  elitePool: string[]; // enemy ids, tier "elite": elite stops (and the Toll Bridge's hard fight) draw from these
  battleCoins: Record<BattleType, number>; // every player earns this for winning a battle of that type in this act
  rewardOdds: Record<BattleType, Record<Rarity, number>>; // weights for each rarity of a reward domino, by battle type
  traderOdds: Record<Rarity, number>; // weights for each Trader stock domino's rarity
  map: MapRules;
}

// How much a right-side upgrade adds. All amounts are whole numbers, 1 or more.
export interface UpgradeData {
  numberedPercent: number; // damage, block and heal: base grows by this percent, rounded up
  amplify: number; // added to Amplify's base
  echoTriggers: number; // added to Echo's extraTriggers
  lookoutReveals: number; // added to Lookout's extraReveals
  mimicStrength: number; // added to Mimic's strengthBonus
}

export interface RunData {
  restHeal: number; // party health healed by each player who rests
  upgrade: UpgradeData;
  startingCoins: number; // each player's coins at the start of the run
  actStartHealPercent: number; // at the start of acts 2 and later, the party heals this percent of its missing health
  trader: TraderData;
  acts: ActData[];
}

export interface TraderData {
  stockSize: number; // dominoes in each player's stock
  prices: Record<Rarity, number>; // coins per domino, by rarity
  removalFeeStart: number; // a player's first removal costs this
  removalFeeStep: number; // each removal raises that player's fee by this, for the rest of the run
  minDeckSize: number; // a player can't remove a domino from a deck this small
}

// data/events.json: the question-mark stops.
export type EventKind = "vote" | "personal" | "push";

export interface EventData {
  id: string;
  name: string;
  kind: EventKind;
  weight: number; // chance weight when the next event is picked
  enabled: boolean; // false: the event is in data but not playable yet, so the pool skips it
  text: string; // placeholder story text, 1-2 sentences
  prizes?: Record<string, string>; // events with prizes keyed by spark (the Wishing Well): spark -> prize kind
  numbers: Record<string, number>; // this event's own numbers (coin amounts, chances, damage)
}
