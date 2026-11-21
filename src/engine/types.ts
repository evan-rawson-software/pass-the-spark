// Types for the JSON formats in data/. Types only; no logic.

export type Spark = "Ember" | "Tide" | "Gale" | "Storm" | "Void" | "Rot";

// The three kinds of domino. Amplifiers and junctions have no effect of their own; caps end a branch and carry the effect.
export type DominoKind = "amplifier" | "junction" | "cap";

export type AmpOp = "add" | "mul" | "echo" | "spectrum";

// What an amplifier does to the charge passing through it.
// add: charge + value. mul: charge x value. echo: caps further along go off `value` extra times. spectrum: charge + value per different spark on the path.
export interface Amp {
  op: AmpOp;
  value: number;
}

export type CapEffectKind = "damage" | "block";

// A cap's effect goes off at base x charge.
export interface CapEffect {
  kind: CapEffectKind;
  base: number;
  ignoresBlock?: boolean; // damage only
}

export interface Domino {
  id: string;
  name: string;
  kind: DominoKind;
  intake: Spark[] | "any";
  output: Spark[]; // amplifier: exactly 1; junction: exactly 2; cap: none
  amp?: Amp; // amplifiers only
  effect?: CapEffect; // caps only
  rarity?: Rarity; // generated dominoes only
  upgraded?: UpgradeSide[]; // sides already upgraded at a rest site (run instances only)
}

export type UpgradeSide = "left" | "right";

export type Tier = "basic" | "elite" | "boss";

// One thing an enemy does in its turn. An attack makes `hits` hits (default 1) of `value` damage each.
export type IntentAction = { kind: "attack"; value: number; hits?: number } | { kind: "block"; value: number };

// What the enemy does after the cascade. Actions are carried out in order.
export interface Intent {
  id: string;
  actions: IntentAction[];
}

// How the next intent is chosen. cycle: the ids in order, repeating. weighted: a seeded draw by weight
// (intent id -> weight), never more than maxRepeat (default 2) of the same intent in a row.
export type Pattern =
  | { type: "cycle"; order: string[] }
  | { type: "weighted"; weights: Record<string, number>; maxRepeat?: number };

// Boss passives. Amounts live here, in data.
export type Passive =
  | { kind: "auditor"; damage: number; name: string; short: string; text?: string } // party damage per repeated cap spark
  | { kind: "glutton"; heal: number; name: string; short: string; text?: string } // health healed at the end of every round
  | { kind: "hoarder"; multiplier: number; name: string; short: string; text?: string } // block per domino on the board
  | { kind: "smolder"; growth: number; name: string; short: string; text?: string } // added to each attack hit per round passed
  | { kind: "longNight"; growth: number; name: string; short: string; text?: string } // added to each attack hit per cap set off
  | { kind: "warden"; sparks: Spark[]; name: string; short: string; text?: string }; // each round one of these sparks is locked against players

export interface Enemy {
  id: string;
  name: string;
  tier: Tier;
  maxHealth: number;
  intents: Intent[];
  pattern: Pattern;
  passives: Passive[];
}

export interface Config {
  partyMaxHealth: number;
  partyPlacements: number; // dominoes the whole party may place in a round; each player gets this divided by the party size, rounded down
  handExtra: number; // a player's hand size is their placements plus this
  triggerCap: number;
  openEndLimit: number; // at most this many open ends on the board at once
  // Enemy starting health, in percent of its data health, for parties of 1, 2, 3 and 4 players.
  enemyHealthPercentByPartySize: number[];
  // Each enemy attack hit, in percent of its (grown) value, for parties of 1, 2, 3 and 4 players.
  enemyAttackPercentByPartySize: number[];
}

// data/starter-deck.json is a list of domino ids; copies repeat the id.
export type DeckList = string[];

// Generated dominoes (data/domino-pools.json).
export type Rarity = "common" | "uncommon" | "rare";
export type BattleType = "fight" | "elite" | "boss";

// One amplifier a rarity can roll. unlock: the unlock id (data/progression.json) a player needs; none means always available.
export interface PoolAmp {
  names: string[]; // word after the spark in the name, e.g. "Boost" -> "Tide Boost"
  amp: Amp;
  unlock?: string;
}

// One cap a rarity can roll. The base is drawn whole from [min, max].
export interface PoolCap {
  names: string[];
  kind: CapEffectKind;
  base: [number, number];
  unlock?: string;
}

export interface RarityPool {
  kindWeights: Record<DominoKind, number>; // chance weights for the kind; a kind with weight 0 is never rolled
  intakes: (Spark[] | "any")[]; // each entry is one intake; lists hold exactly one spark
  outputs: Spark[]; // single basic sparks an amplifier or junction can output
  amplifiers: PoolAmp[];
  junctions: string[]; // name words for junctions
  caps: PoolCap[];
  ignoresBlock: number; // chance 0..1 that a damage cap ignores block (once unlocked)
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
  capPercent: number; // caps: base grows by this percent, rounded up
  boostAdd: number; // added to an add amplifier's value (Boost)
  doubleValue: number; // a mul amplifier (Double) becomes x this
  echoRepeats: number; // added to an echo amplifier's value
  spectrumAdd: number; // added to a spectrum amplifier's value
}

export interface RunData {
  restHeal: number; // party health healed by each player who rests
  upgrade: UpgradeData;
  startingCoins: number; // each player's coins at the start of the run
  actStartHealPercent: number; // at the start of acts 2 and later, the party heals this percent of its missing health
  trader: TraderData;
  charmOffers: { elite: number; boss: number }; // charms offered to each player after an elite (normal pool) or boss (rare pool) win
  acts: ActData[];
}

export interface TraderData {
  stockSize: number; // dominoes in each player's stock
  prices: Record<Rarity, number>; // coins per domino, by rarity
  removalFeeStart: number; // a player's first removal costs this
  removalFeeStep: number; // each removal raises that player's fee by this, for the rest of the run
  minDeckSize: number; // a player can't remove a domino from a deck this small
  charmStockSize: number; // normal charms in each player's stock
  charmPrice: number; // coins per charm
}

// data/charms.json: a personal passive that lasts the whole run.
export type CharmPool = "normal" | "rare";

export interface Charm {
  id: string;
  name: string;
  pool: CharmPool; // normal: elite offers and the Trader; rare: boss offers
  description: string; // one line for tooltips
  sparks?: Spark[]; // the sparks the charm reacts to (Lightning Rod)
  numbers: Record<string, number>; // this charm's own numbers (bonus, hand size, coins, percent)
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

// data/progression.json: experience amounts and the levels. Level N needs levels[N-1].experience in total and unlocks levels[N-1].unlock.
export interface ProgressionData {
  experience: { perFloor: number; perBoss: number; forWin: number };
  levels: { experience: number; unlock: string; name: string; description: string }[];
}
