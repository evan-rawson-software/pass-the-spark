// Battle state, setup and round flow. Plain functions over plain data.
// applyChoice never changes its input: it works on a JSON copy.

import { shuffle } from "./rng";
import type { Config, DeckList, Domino, Enemy, Spark } from "./types";

// The enemy's seat id in seatOrder.
export const ENEMY_SEAT = "enemy";

export interface Content {
  dominoes: Domino[];
  enemies: Enemy[];
}

export interface PlayerSetup {
  id: string;
  deck: DeckList;
}

export interface PlayerState {
  id: string;
  deck: string[]; // domino ids, next draw first
  hand: string[];
  discard: string[];
}

export interface EnemyState {
  id: string;
  health: number;
  maxHealth: number;
  block: number;
  deck: string[];
  hand: string[]; // oldest on the left
  discard: string[];
}

export interface PartyState {
  health: number;
  maxHealth: number;
  block: number;
}

export interface ChainState {
  strength: number;
  lap: number;
  sparks: Spark[]; // the current spark: one, or a set of two
  history: Spark[]; // the spark each domino was answered with; reset every round
}

export interface BattleState {
  config: Config;
  dominoes: Domino[];
  rng: number;
  seatOrder: string[];
  round: number;
  lead: string; // this round's lead (the player who fuses)
  seat: string; // whose turn it is
  phase: "fuse" | "answer" | "over";
  chain: ChainState;
  party: PartyState;
  players: PlayerState[]; // in seat order
  enemy: EnemyState;
  result: "won" | "lost" | null;
  nextLead: string | null;
}

export type PendingChoice =
  | { type: "fuse"; player: string; dominoes: string[] }
  | {
      type: "answer";
      player: string;
      options: { domino: string; sparks: Spark[] }[];
    };

export type Choice =
  | { type: "fuse"; domino: string }
  | { type: "answer"; domino: string; spark?: Spark }; // spark needed only when ambiguous

export interface BattleSetup {
  config: Config;
  content: Content;
  players: PlayerSetup[];
  seatOrder: string[];
  startingLead?: string;
  enemyId: string;
  seed: number;
}

export function createBattle(setup: BattleSetup): BattleState {
  const { config, content, seatOrder } = setup;
  const enemyDef = content.enemies.find((e) => e.id === setup.enemyId);
  if (!enemyDef) throw new Error("unknown enemy " + setup.enemyId);
  const seats = playerSeats(seatOrder);
  const lead = setup.startingLead ?? seats[0];
  if (lead === undefined || !seats.includes(lead)) {
    throw new Error("startingLead must be a player in seatOrder");
  }

  let rng = setup.seed;
  const players: PlayerState[] = [];
  for (const id of seats) {
    const p = setup.players.find((x) => x.id === id);
    if (!p || p.deck.length === 0) throw new Error("player needs a deck: " + id);
    const s = shuffle(rng, p.deck);
    rng = s.state;
    players.push({ id, deck: s.value, hand: [], discard: [] });
  }
  const es = shuffle(rng, enemyDef.deck);
  rng = es.state;

  const state: BattleState = {
    config,
    dominoes: content.dominoes,
    rng,
    seatOrder,
    round: 0,
    lead,
    seat: lead,
    phase: "fuse",
    chain: { strength: 0, lap: 1, sparks: [], history: [] },
    party: { health: config.partyMaxHealth, maxHealth: config.partyMaxHealth, block: 0 },
    players,
    enemy: {
      id: enemyDef.id,
      health: enemyDef.maxHealth,
      maxHealth: enemyDef.maxHealth,
      block: 0,
      deck: es.value,
      hand: [],
      discard: [],
    },
    result: null,
    nextLead: null,
  };
  startRound(state);
  return state;
}

export function getPendingChoice(state: BattleState): PendingChoice | null {
  if (state.phase === "over") return null;
  const player = getPlayer(state, state.seat);
  if (state.phase === "fuse") {
    return { type: "fuse", player: player.id, dominoes: unique(player.hand) };
  }
  return { type: "answer", player: player.id, options: legalAnswers(state, player) };
}

export function applyChoice(input: BattleState, choice: Choice): BattleState {
  const state: BattleState = JSON.parse(JSON.stringify(input));
  const pending = getPendingChoice(state);
  if (!pending || pending.type !== choice.type) throw new Error("unexpected choice");
  const player = getPlayer(state, pending.player);

  if (pending.type === "fuse" && choice.type === "fuse") {
    if (!player.hand.includes(choice.domino)) throw new Error("domino not in hand");
    removeOne(player.hand, choice.domino);
    player.discard.push(choice.domino);
    const d = getDomino(state, choice.domino);
    state.chain = { strength: 0, lap: 1, sparks: d.output.slice(), history: [] };
    state.lead = player.id;
    advance(state);
  } else if (pending.type === "answer" && choice.type === "answer") {
    const option = pending.options.find((o) => o.domino === choice.domino);
    if (!option) throw new Error("illegal domino");
    let spark = choice.spark;
    if (spark === undefined) {
      if (option.sparks.length !== 1) throw new Error("spark must be named");
      spark = option.sparks[0];
    }
    if (!option.sparks.includes(spark)) throw new Error("domino does not answer that spark");
    removeOne(player.hand, choice.domino);
    player.discard.push(choice.domino);
    play(state, getDomino(state, choice.domino), spark, true);
    if (state.phase !== "over") advance(state);
  }
  return state;
}

// ---- internals (all mutate the working copy) ----

function playerSeats(seatOrder: string[]): string[] {
  return seatOrder.filter((s) => s !== ENEMY_SEAT);
}

function getPlayer(state: BattleState, id: string): PlayerState {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error("no such player " + id);
  return p;
}

function getDomino(state: BattleState, id: string): Domino {
  const d = state.dominoes.find((x) => x.id === id);
  if (!d) throw new Error("unknown domino " + id);
  return d;
}

function unique(ids: string[]): string[] {
  return ids.filter((id, i) => ids.indexOf(id) === i);
}

function removeOne(list: string[], id: string): void {
  list.splice(list.indexOf(id), 1);
}

// The sparks of the current set that this domino answers.
function answeredSparks(d: Domino, sparks: Spark[]): Spark[] {
  return sparks.filter((s) => d.intake === "any" || d.intake.includes(s));
}

function legalAnswers(state: BattleState, player: PlayerState) {
  const options: { domino: string; sparks: Spark[] }[] = [];
  for (const id of unique(player.hand)) {
    const sparks = answeredSparks(getDomino(state, id), state.chain.sparks);
    if (sparks.length > 0) options.push({ domino: id, sparks });
  }
  return options;
}

// Everyone draws, then the first player (from the lead, in seat order) with a
// domino fuses. If nobody has one, the round ends at once.
function startRound(state: BattleState): void {
  state.round += 1;
  state.chain = { strength: 0, lap: 1, sparks: [], history: [] };
  for (const p of state.players) {
    for (let i = 0; i < state.config.playerDrawPerRound; i++) {
      if (p.hand.length >= state.config.playerHandLimit) break;
      if (p.deck.length === 0) {
        const s = shuffle(state.rng, p.discard);
        state.rng = s.state;
        p.deck = s.value;
        p.discard = [];
      }
      if (p.deck.length === 0) break;
      p.hand.push(p.deck.shift() as string);
    }
  }
  const seats = playerSeats(state.seatOrder);
  const start = seats.indexOf(state.lead);
  for (let i = 0; i < seats.length; i++) {
    const p = getPlayer(state, seats[(start + i) % seats.length]);
    if (p.hand.length > 0) {
      state.lead = p.id;
      state.seat = p.id;
      state.phase = "fuse";
      return;
    }
  }
  endRound(state);
}

// Pass the spark on until a player must choose, or the chain ends.
function advance(state: BattleState): void {
  for (;;) {
    const i = state.seatOrder.indexOf(state.seat);
    state.seat = state.seatOrder[(i + 1) % state.seatOrder.length];
    if (state.seat === state.lead) state.chain.lap += 1;
    if (state.seat === ENEMY_SEAT) {
      react(state);
      if (state.phase === "over") return;
      continue;
    }
    if (legalAnswers(state, getPlayer(state, state.seat)).length === 0) {
      endRound(state);
      return;
    }
    state.phase = "answer";
    return;
  }
}

// The enemy plays its leftmost matching domino, or the spark passes unchanged.
function react(state: BattleState): void {
  const enemy = state.enemy;
  for (let i = 0; i < enemy.hand.length; i++) {
    const d = getDomino(state, enemy.hand[i]);
    const sparks = answeredSparks(d, state.chain.sparks);
    if (sparks.length > 0) {
      enemy.hand.splice(i, 1);
      enemy.discard.push(d.id);
      play(state, d, sparks[0], false);
      return;
    }
  }
}

// An answer: strength +1, effect resolves, spark history and current spark update.
function play(state: BattleState, d: Domino, answered: Spark, byPlayer: boolean): void {
  const chain = state.chain;
  chain.strength += 1;
  chain.history.push(answered);
  chain.sparks = d.output.slice();
  let value = (d.effect.base ?? 0) * chain.strength;
  if (byPlayer || state.config.enemyReactionsScaleWithLap) value *= chain.lap;
  resolve(state, d, value, byPlayer);
}

function resolve(state: BattleState, d: Domino, value: number, byPlayer: boolean): void {
  const { party, enemy } = state;
  const target = byPlayer ? enemy : party;
  const own = byPlayer ? party : enemy;
  if (d.effect.kind === "damage") {
    let dmg = value;
    if (!d.effect.ignoresBlock) {
      const soaked = Math.min(target.block, dmg);
      target.block -= soaked;
      dmg -= soaked;
    }
    target.health -= dmg;
  } else if (d.effect.kind === "block") {
    own.block += value;
  } else if (d.effect.kind === "heal") {
    own.health = Math.min(own.maxHealth, own.health + value);
  }
  if (enemy.health <= 0) endBattle(state, "won");
  else if (party.health <= 0) endBattle(state, "lost");
}

function nextPlayerAfterLead(state: BattleState): string {
  const seats = playerSeats(state.seatOrder);
  return seats[(seats.indexOf(state.lead) + 1) % seats.length];
}

function endBattle(state: BattleState, result: "won" | "lost"): void {
  state.phase = "over";
  state.result = result;
  state.nextLead = nextPlayerAfterLead(state);
}

function endRound(state: BattleState): void {
  // Enemy leftovers go off here, before block resets (#6).
  state.party.block = 0;
  state.enemy.block = 0;
  state.lead = nextPlayerAfterLead(state);
  startRound(state);
}
