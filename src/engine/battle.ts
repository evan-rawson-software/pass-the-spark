// Battle state, setup and round flow. Plain functions over plain data.
// applyChoice never changes its input: it works on a JSON copy.

import { shuffle } from "./rng";
import type { Config, DeckList, Domino, Effect, Enemy, Spark } from "./types";

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
  revealed: boolean[]; // revealed[i] is true when hand[i] is revealed to the players
  discard: string[];
  drawPerRound: number;
  handLimit: number;
  faceUp: string[]; // played or discarded since the last reshuffle, for the UI
}

export interface PartyState {
  health: number;
  maxHealth: number;
  block: number;
}

// Whose effect it is: damage hits the other side, heal and block go to this one.
export type Side = "party" | "enemy";

// The effect a domino actually had (a Mimic stores what it copied).
export interface ResolvedEffect {
  effect: Effect;
  side: Side;
}

export interface ChainState {
  strength: number;
  lap: number;
  sparks: Spark[]; // the current spark: one, or a set of two
  history: Spark[]; // the spark each domino was answered with; reset every round
  echo: number; // pending extra triggers for the next domino played
  last: ResolvedEffect | null; // the last domino played this chain, fuse included
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
    chain: newChain([]),
    party: { health: config.partyMaxHealth, maxHealth: config.partyMaxHealth, block: 0 },
    players,
    enemy: {
      id: enemyDef.id,
      health: enemyDef.maxHealth,
      maxHealth: enemyDef.maxHealth,
      block: 0,
      deck: es.value,
      hand: [],
      revealed: [],
      discard: [],
      drawPerRound: enemyDef.drawPerRound,
      handLimit: enemyDef.handLimit,
      faceUp: [],
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
    state.chain = newChain(d.output);
    // The fuse's effect never triggers, but a Mimic after it can copy it.
    if (d.effect.kind !== "mimic") state.chain.last = { effect: d.effect, side: "party" };
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

function newChain(sparks: Spark[]): ChainState {
  return { strength: 0, lap: 1, sparks: sparks.slice(), history: [], echo: 0, last: null };
}

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
  state.chain = newChain([]);
  for (const seat of state.seatOrder) {
    if (seat === ENEMY_SEAT) {
      const e = state.enemy;
      draw(state, e, e.drawPerRound, e.handLimit, e);
    } else {
      const { playerDrawPerRound, playerHandLimit } = state.config;
      draw(state, getPlayer(state, seat), playerDrawPerRound, playerHandLimit);
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

// Draw up to `count` dominoes. At the hand limit a player stops; the enemy
// (which passes `enemy`) first discards its oldest domino to make room.
// An empty deck is reshuffled from the discard pile, which clears the enemy's face-up list.
function draw(
  state: BattleState,
  p: { deck: string[]; hand: string[]; discard: string[] },
  count: number,
  limit: number,
  enemy?: EnemyState,
): void {
  for (let i = 0; i < count; i++) {
    if (p.hand.length >= limit) {
      if (!enemy) break;
      const old = removeEnemyDomino(enemy, 0);
      p.discard.push(old);
      enemy.faceUp.push(old);
    }
    if (p.deck.length === 0) {
      const s = shuffle(state.rng, p.discard);
      state.rng = s.state;
      p.deck = s.value;
      p.discard = [];
      if (enemy) enemy.faceUp = [];
    }
    if (p.deck.length === 0) break;
    if (enemy) addEnemyDomino(enemy, p.deck.shift() as string);
    else p.hand.push(p.deck.shift() as string);
  }
}

// Every change to the enemy's hand goes through these two, so `revealed` stays in step.
function addEnemyDomino(enemy: EnemyState, id: string): void {
  enemy.hand.push(id);
  enemy.revealed.push(false);
}

function removeEnemyDomino(enemy: EnemyState, index: number): string {
  enemy.revealed.splice(index, 1);
  return enemy.hand.splice(index, 1)[0];
}

// Reveal the leftmost `count` hidden enemy dominoes.
function lookout(state: BattleState, count: number): void {
  const enemy = state.enemy;
  for (let i = 0; i < enemy.hand.length && count > 0; i++) {
    if (!enemy.revealed[i]) {
      enemy.revealed[i] = true;
      count -= 1;
    }
  }
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
      removeEnemyDomino(enemy, i);
      enemy.discard.push(d.id);
      enemy.faceUp.push(d.id);
      play(state, d, sparks[0], false);
      return;
    }
  }
}

// An answer: strength +1, spark history and current spark update, effect triggers.
function play(state: BattleState, d: Domino, answered: Spark, byPlayer: boolean): void {
  const chain = state.chain;
  chain.strength += 1;
  chain.history.push(answered);
  chain.sparks = d.output.slice();
  const scaleLap = byPlayer || state.config.enemyReactionsScaleWithLap;
  playEffect(state, d.effect, byPlayer ? "party" : "enemy", scaleLap);
}

// Resolve a played domino's effect (a Mimic becomes the effect it copies), record it
// as the chain's last effect, and trigger it once plus any pending Echo triggers.
function playEffect(state: BattleState, effect: Effect, side: Side, scaleLap: boolean): void {
  const chain = state.chain;
  let resolved: ResolvedEffect | null = { effect, side };
  if (effect.kind === "mimic") {
    resolved = chain.last === null ? null : { effect: chain.last.effect, side: "party" };
  }
  if (resolved === null) return;
  chain.last = resolved;
  const triggers = Math.min(1 + chain.echo, state.config.triggerCap);
  chain.echo = 0;
  for (let i = 0; i < triggers; i++) {
    trigger(state, resolved.effect, resolved.side, scaleLap);
    if (state.phase === "over") return;
  }
}

// One trigger of an effect at the chain's current strength and lap.
function trigger(state: BattleState, effect: Effect, side: Side, scaleLap: boolean): void {
  const chain = state.chain;
  if (effect.kind === "amplify") {
    chain.strength += effect.base ?? 0;
  } else if (effect.kind === "echo") {
    chain.echo += 1;
  } else if (effect.kind === "lookout") {
    if (side === "party") lookout(state, Math.ceil(chain.strength / 2));
  } else {
    let strength = chain.strength;
    if (effect.spectrum) {
      strength += chain.history.filter((x, i) => chain.history.indexOf(x) === i).length;
    }
    let value = (effect.base ?? 0) * strength;
    if (scaleLap) value *= chain.lap;
    resolve(state, effect, value, side);
  }
}

function resolve(state: BattleState, effect: Effect, value: number, side: Side): void {
  const { party, enemy } = state;
  const own = side === "party" ? party : enemy;
  const target = side === "party" ? enemy : party;
  if (effect.kind === "damage") {
    let dmg = value;
    if (!effect.ignoresBlock) {
      const soaked = Math.min(target.block, dmg);
      target.block -= soaked;
      dmg -= soaked;
    }
    target.health -= dmg;
  } else if (effect.kind === "block") {
    own.block += value;
  } else if (effect.kind === "heal") {
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
  // Leftovers go off at strength 1, left to right, and stay in hand.
  for (const id of state.enemy.hand.slice()) {
    const d = getDomino(state, id);
    let value = d.effect.base ?? 0;
    if (state.config.enemyReactionsScaleWithLap) value *= state.chain.lap;
    resolve(state, d.effect, value, "enemy");
    if (state.phase === "over") return;
  }
  state.party.block = 0;
  state.enemy.block = 0;
  state.lead = nextPlayerAfterLead(state);
  startRound(state);
}
