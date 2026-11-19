// Battle state, setup and round flow. Plain functions over plain data.
// applyChoice never changes its input: it works on a JSON copy.

import { shuffle } from "./rng";
import { validateDominoes } from "./validate";
import type { GameEvent } from "./events";
import type { Config, DeckList, Domino, Effect, Enemy, Passive, Spark } from "./types";

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
  passives: Passive[];
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
  last: ResolvedEffect | null; // the last domino played this chain, opener included
  played: { seat: string; domino: string }[]; // every domino laid in this chain in order, opener first, for the screen
}

export interface BattleState {
  config: Config;
  dominoes: Domino[];
  rng: number;
  seatOrder: string[];
  round: number;
  lead: string; // this round's lead (the player who plays the opener)
  seat: string; // whose turn it is
  phase: "opener" | "answer" | "over";
  chain: ChainState;
  party: PartyState;
  players: PlayerState[]; // in seat order
  enemy: EnemyState;
  result: "won" | "lost" | null;
  nextLead: string | null;
}

export type PendingChoice =
  | { type: "opener"; player: string; dominoes: string[] }
  | {
      type: "answer";
      player: string;
      options: { domino: string; sparks: Spark[] }[];
    };

export type Choice =
  | { type: "opener"; domino: string }
  | { type: "answer"; domino: string; spark?: Spark }; // spark needed only when ambiguous

export interface BattleSetup {
  config: Config;
  content: Content;
  players: PlayerSetup[];
  seatOrder: string[];
  startingLead?: string;
  enemyId: string;
  seed: number;
  // Run-unique domino definitions (instances, generated or upgraded dominoes) used by the decks,
  // in addition to content.dominoes. Their ids must not clash with any other domino id.
  extraDominoes?: Domino[];
  // The party's current health, for a battle inside a run. Defaults to max health.
  partyHealth?: number;
}

export interface StepResult {
  state: BattleState;
  events: GameEvent[];
}

// The battle as it stands after its automatic opening (round 1 draws).
export function createBattle(setup: BattleSetup): BattleState {
  return createBattleWithEvents(setup).state;
}

// Same as createBattle, plus the events of the opening.
export function createBattleWithEvents(setup: BattleSetup): StepResult {
  const { config, content, seatOrder } = setup;
  const enemyDef = content.enemies.find((e) => e.id === setup.enemyId);
  if (!enemyDef) throw new Error("unknown enemy " + setup.enemyId);
  const seats = playerSeats(seatOrder);
  const lead = setup.startingLead ?? seats[0];
  if (lead === undefined || !seats.includes(lead)) {
    throw new Error("startingLead must be a player in seatOrder");
  }

  const extra = validateDominoes(setup.extraDominoes ?? [], "extraDominoes");
  for (const d of extra) {
    if (content.dominoes.some((x) => x.id === d.id)) throw new Error("extra domino id already exists: " + d.id);
  }
  const partyHealth = setup.partyHealth ?? config.partyMaxHealth;
  if (!(partyHealth > 0 && partyHealth <= config.partyMaxHealth)) throw new Error("partyHealth must be above 0 and at most max health");

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
    dominoes: [...content.dominoes, ...extra],
    rng,
    seatOrder,
    round: 0,
    lead,
    seat: lead,
    phase: "opener",
    chain: newChain([]),
    party: { health: partyHealth, maxHealth: config.partyMaxHealth, block: 0 },
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
      passives: enemyDef.passives,
      faceUp: [],
    },
    result: null,
    nextLead: null,
  };
  const events: GameEvent[] = [];
  startRound(state, events);
  return { state, events };
}

// The starter deck as run instances: one new definition per card, with ids like "jab#1", numbered
// from startIndex. Give each player a different startIndex so ids are unique across the run.
// deck lists the instance ids (pass it as the player's deck); dominoes goes in extraDominoes.
export function makeStarterInstances(
  starterDeck: DeckList,
  dominoes: Domino[],
  startIndex: number,
): { deck: string[]; dominoes: Domino[] } {
  const instances: Domino[] = [];
  starterDeck.forEach((baseId, i) => {
    const base = dominoes.find((d) => d.id === baseId);
    if (!base) throw new Error("unknown domino " + baseId);
    const copy: Domino = JSON.parse(JSON.stringify(base));
    copy.id = `${baseId}#${startIndex + i}`;
    instances.push(copy);
  });
  return { deck: instances.map((d) => d.id), dominoes: instances };
}

export function getPendingChoice(state: BattleState): PendingChoice | null {
  if (state.phase === "over") return null;
  const player = getPlayer(state, state.seat);
  if (state.phase === "opener") {
    return { type: "opener", player: player.id, dominoes: unique(player.hand) };
  }
  return { type: "answer", player: player.id, options: legalAnswers(state, player) };
}

export function applyChoice(input: BattleState, choice: Choice): BattleState {
  return step(input, choice).state;
}

// Apply a choice. Returns the new state and the events in the order they happened.
export function step(input: BattleState, choice: Choice): StepResult {
  const events: GameEvent[] = [];
  const state: BattleState = JSON.parse(JSON.stringify(input));
  const pending = getPendingChoice(state);
  if (!pending || pending.type !== choice.type) throw new Error("unexpected choice");
  const player = getPlayer(state, pending.player);

  if (pending.type === "opener" && choice.type === "opener") {
    if (!player.hand.includes(choice.domino)) throw new Error("domino not in hand");
    removeOne(player.hand, choice.domino);
    player.discard.push(choice.domino);
    const d = getDomino(state, choice.domino);
    state.chain = newChain(d.output);
    state.chain.played.push({ seat: player.id, domino: d.id });
    events.push({ type: "opener", player: player.id, domino: d.id, sparks: d.output.slice() });
    // The opener's effect never triggers, but a Mimic after it can copy it.
    if (d.effect.kind !== "mimic" && d.effect.kind !== "reflect") state.chain.last = { effect: d.effect, side: "party" };
    state.lead = player.id;
    advance(state, events);
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
    play(state, getDomino(state, choice.domino), spark, true, events);
    if (state.phase !== "over") advance(state, events);
  }
  return { state, events };
}

// What one way of playing a domino would do. For the opener, triggers is 0 and effect is null (its
// effect never triggers). effect is what actually happens (a Mimic or Reflect shows what it
// copies), null when there is nothing to copy. strength is the chain strength it is answered at,
// before the Spectrum bonus. value is per trigger (damage, block, heal, amplify; otherwise 0).
export interface PlayPreview {
  opener: boolean;
  spark: Spark | null; // the spark it would answer; null for the opener
  strength: number;
  lap: number;
  effect: ResolvedEffect | null;
  triggers: number; // 1 plus pending Echo, at most the trigger cap
  value: number;
  spectrumBonus: number; // 0 unless the effect has spectrum
  lookoutReveals: number; // hidden enemy dominoes it would reveal in total
  auditorDamage: number; // damage the Auditor would add to the party, 0 if it would not fire
}

// What playing this domino right now would do: one preview per spark it could answer (a single
// one for the opener), or none if it is not a playable domino of the player whose turn it is.
// It runs the real resolution on a copy, so the two cannot drift, and never changes the state.
export function previewPlay(input: BattleState, playerId: string, dominoId: string): PlayPreview[] {
  const pending = getPendingChoice(input);
  if (!pending || pending.player !== playerId) return [];
  if (pending.type === "opener") {
    if (!pending.dominoes.includes(dominoId)) return [];
    return [{ opener: true, spark: null, strength: 0, lap: input.chain.lap, effect: null, triggers: 0, value: 0, spectrumBonus: 0, lookoutReveals: 0, auditorDamage: 0 }];
  }
  const option = pending.options.find((o) => o.domino === dominoId);
  if (!option) return [];
  return option.sparks.map((spark): PlayPreview => {
    const state: BattleState = JSON.parse(JSON.stringify(input));
    const events: GameEvent[] = [];
    play(state, getDomino(state, dominoId), spark, true, events);
    let strength = 0;
    let first: { effect: Effect; side: Side; value: number } | null = null;
    let triggers = 0;
    let reveals = 0;
    let auditorDamage = 0;
    for (const e of events) {
      if (e.type === "play") strength = e.strength;
      else if (e.type === "trigger") {
        first = first ?? e;
        triggers += 1;
      } else if (e.type === "reveal") reveals += e.positions.length;
      else if (e.type === "auditor") auditorDamage = e.damage;
    }
    return {
      opener: false,
      spark,
      strength,
      lap: state.chain.lap,
      effect: first === null ? null : { effect: first.effect, side: first.side },
      triggers,
      value: first === null ? 0 : first.value,
      spectrumBonus: first !== null && first.effect.spectrum ? spectrumBonus(state.chain.history) : 0,
      lookoutReveals: reveals,
      auditorDamage,
    };
  });
}

// ---- internals (all mutate the working copy) ----

function newChain(sparks: Spark[]): ChainState {
  return { strength: 0, lap: 1, sparks: sparks.slice(), history: [], echo: 0, last: null, played: [] };
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
// domino as the opener. If nobody has one, the round ends at once.
function startRound(state: BattleState, events: GameEvent[]): void {
  state.round += 1;
  state.chain = newChain([]);
  // The lead is known only after the draws (an empty-handed lead is skipped), so it is filled in below.
  const roundStart: GameEvent = { type: "roundStart", round: state.round, lead: state.lead };
  events.push(roundStart);
  for (const seat of state.seatOrder) {
    if (seat === ENEMY_SEAT) {
      const e = state.enemy;
      draw(state, e, e.drawPerRound, e.handLimit, events, seat, e);
    } else {
      const { playerDrawPerRound, playerHandLimit } = state.config;
      draw(state, getPlayer(state, seat), playerDrawPerRound, playerHandLimit, events, seat);
    }
  }
  const seats = playerSeats(state.seatOrder);
  const start = seats.indexOf(state.lead);
  for (let i = 0; i < seats.length; i++) {
    const p = getPlayer(state, seats[(start + i) % seats.length]);
    if (p.hand.length > 0) {
      state.lead = p.id;
      roundStart.lead = p.id;
      state.seat = p.id;
      state.phase = "opener";
      return;
    }
  }
  endRound(state, events);
}

// Draw up to `count` dominoes. At the hand limit a player stops; the enemy
// (which passes `enemy`) first discards its oldest domino to make room.
// An empty deck is reshuffled from the discard pile, which clears the enemy's face-up list.
function draw(
  state: BattleState,
  p: { deck: string[]; hand: string[]; discard: string[] },
  count: number,
  limit: number,
  events: GameEvent[],
  seat: string,
  enemy?: EnemyState,
): void {
  // The draw event is written when a run of draws ends, so it sits in order around enemy discards.
  let drawn: string[] = [];
  const flush = () => {
    if (drawn.length === 0) return;
    events.push(enemy ? { type: "draw", seat, count: drawn.length } : { type: "draw", seat, count: drawn.length, dominoes: drawn });
    drawn = [];
  };
  for (let i = 0; i < count; i++) {
    if (p.hand.length >= limit) {
      if (!enemy) break;
      const old = removeEnemyDomino(enemy, 0);
      p.discard.push(old);
      enemy.faceUp.push(old);
      flush();
      events.push({ type: "enemyDiscard", domino: old });
    }
    if (p.deck.length === 0) {
      const s = shuffle(state.rng, p.discard);
      state.rng = s.state;
      p.deck = s.value;
      p.discard = [];
      if (enemy) enemy.faceUp = [];
    }
    if (p.deck.length === 0) break;
    const id = p.deck.shift() as string;
    drawn.push(id);
    if (enemy) addEnemyDomino(enemy, id);
    else p.hand.push(id);
  }
  flush();
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
function lookout(state: BattleState, count: number, events: GameEvent[]): void {
  const enemy = state.enemy;
  const positions: number[] = [];
  for (let i = 0; i < enemy.hand.length && count > 0; i++) {
    if (!enemy.revealed[i]) {
      enemy.revealed[i] = true;
      positions.push(i);
      count -= 1;
    }
  }
  if (positions.length > 0) events.push({ type: "reveal", positions });
}

// Pass the spark on until a player must choose, or the chain ends.
function advance(state: BattleState, events: GameEvent[]): void {
  for (;;) {
    const i = state.seatOrder.indexOf(state.seat);
    const from = state.seat;
    state.seat = state.seatOrder[(i + 1) % state.seatOrder.length];
    events.push({ type: "pass", from, to: state.seat, sparks: state.chain.sparks.slice() });
    if (state.seat === state.lead) {
      state.chain.lap += 1;
      events.push({ type: "lapUp", lap: state.chain.lap });
      glutton(state, events);
    }
    if (state.seat === ENEMY_SEAT) {
      react(state, events);
      if (state.phase === "over") return;
      continue;
    }
    if (legalAnswers(state, getPlayer(state, state.seat)).length === 0) {
      events.push({ type: "chainEnd", reason: "cannotAnswer" });
      endRound(state, events);
      return;
    }
    state.phase = "answer";
    return;
  }
}

// The enemy plays its leftmost matching domino, or the spark passes unchanged.
function react(state: BattleState, events: GameEvent[]): void {
  const enemy = state.enemy;
  for (let i = 0; i < enemy.hand.length; i++) {
    const d = getDomino(state, enemy.hand[i]);
    const sparks = answeredSparks(d, state.chain.sparks);
    if (sparks.length > 0) {
      removeEnemyDomino(enemy, i);
      enemy.discard.push(d.id);
      enemy.faceUp.push(d.id);
      play(state, d, sparks[0], false, events);
      return;
    }
  }
  events.push({ type: "enemyNoReaction", sparks: state.chain.sparks.slice() });
}

// An answer: strength +1, spark history and current spark update, effect triggers.
function play(state: BattleState, d: Domino, answered: Spark, byPlayer: boolean, events: GameEvent[]): void {
  const chain = state.chain;
  // The Auditor: a player answers the same spark as the previous history entry.
  const repeated = byPlayer && chain.history[chain.history.length - 1] === answered;
  chain.strength += 1;
  chain.history.push(answered);
  chain.sparks = d.output.slice();
  const seat = byPlayer ? state.seat : ENEMY_SEAT;
  chain.played.push({ seat, domino: d.id });
  events.push({ type: "play", seat, domino: d.id, answeredSpark: answered, strength: chain.strength, lap: chain.lap });
  const scaleLap = byPlayer || state.config.enemyReactionsScaleWithLap;
  playEffect(state, d, seat, byPlayer ? "party" : "enemy", scaleLap, events);
  if (repeated && state.phase !== "over") auditor(state, events);
}

// Auditor passive: the party takes damage (block absorbs it). Strength is never reduced.
function auditor(state: BattleState, events: GameEvent[]): void {
  const passive = state.enemy.passives.find((p) => p.kind === "auditor");
  if (!passive || passive.kind !== "auditor") return;
  const rule = passive.damage ?? state.config.auditorDamage;
  const amount = rule.rule === "strength" ? state.chain.strength : rule.amount;
  events.push({ type: "auditor", damage: amount });
  resolve(state, { kind: "damage" }, amount, "enemy", events);
}

// Glutton passive: heals a flat amount when lap goes up, capped at max health.
function glutton(state: BattleState, events: GameEvent[]): void {
  const passive = state.enemy.passives.find((p) => p.kind === "glutton");
  if (!passive || passive.kind !== "glutton") return;
  const enemy = state.enemy;
  const before = enemy.health;
  enemy.health = Math.min(enemy.maxHealth, enemy.health + (passive.heal ?? state.config.gluttonHeal));
  events.push({ type: "glutton", heal: enemy.health - before });
}

// Resolve a played domino's effect (a Mimic becomes the effect it copies), record it
// as the chain's last effect, and trigger it once plus any pending Echo triggers.
function playEffect(state: BattleState, d: Domino, seat: string, side: Side, scaleLap: boolean, events: GameEvent[]): void {
  const chain = state.chain;
  const effect = d.effect;
  let resolved: ResolvedEffect | null = { effect, side };
  if (effect.kind === "mimic") {
    resolved = chain.last === null ? null : { effect: chain.last.effect, side: "party" };
  } else if (effect.kind === "reflect") {
    // Mimic in reverse: the copied effect is turned against the party (an enemy effect is unchanged).
    resolved = chain.last === null ? null : { effect: chain.last.effect, side: "enemy" };
  }
  if (resolved === null) return;
  chain.last = resolved;
  const triggers = Math.min(1 + chain.echo, state.config.triggerCap);
  chain.echo = 0;
  // An upgraded Mimic resolves what it copied at extra strength; chain strength is unaffected.
  const bonus = effect.kind === "mimic" ? (effect.strengthBonus ?? 0) : 0;
  for (let i = 0; i < triggers; i++) {
    trigger(state, resolved.effect, resolved.side, scaleLap, events, seat, d.id, i, bonus);
    if (state.phase === "over") return;
  }
}

// One trigger of an effect at the chain's current strength and lap.
function trigger(
  state: BattleState,
  effect: Effect,
  side: Side,
  scaleLap: boolean,
  events: GameEvent[],
  seat: string,
  dominoId: string,
  index: number,
  strengthBonus = 0,
): void {
  const chain = state.chain;
  const strengthNow = chain.strength + strengthBonus;
  if (effect.kind === "amplify") {
    const amount = effect.base ?? 0;
    events.push({ type: "trigger", seat, domino: dominoId, index, effect, side, value: amount });
    chain.strength += amount;
    events.push({ type: "amplify", amount, strength: chain.strength });
  } else if (effect.kind === "echo") {
    events.push({ type: "trigger", seat, domino: dominoId, index, effect, side, value: 0 });
    chain.echo += 1 + (effect.extraTriggers ?? 0);
    events.push({ type: "echoPending", count: chain.echo });
  } else if (effect.kind === "lookout") {
    events.push({ type: "trigger", seat, domino: dominoId, index, effect, side, value: 0 });
    if (side === "party") lookout(state, Math.ceil(strengthNow / 2) + (effect.extraReveals ?? 0), events);
  } else {
    let strength = strengthNow;
    if (effect.spectrum) strength += spectrumBonus(chain.history);
    let value = (effect.base ?? 0) * strength;
    if (scaleLap) value *= chain.lap;
    events.push({ type: "trigger", seat, domino: dominoId, index, effect, side, value });
    resolve(state, effect, value, side, events);
  }
}

// Spectrum: the number of different sparks in the history.
function spectrumBonus(history: Spark[]): number {
  return history.filter((x, i) => history.indexOf(x) === i).length;
}

function resolve(state: BattleState, effect: Effect, value: number, side: Side, events: GameEvent[]): void {
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
    events.push({ type: "damage", side: side === "party" ? "enemy" : "party", amount: dmg, blocked: value - dmg });
  } else if (effect.kind === "block") {
    own.block += value;
    events.push({ type: "block", side, amount: value, blocked: 0 });
  } else if (effect.kind === "heal") {
    const before = own.health;
    own.health = Math.min(own.maxHealth, own.health + value);
    events.push({ type: "heal", side, amount: own.health - before, blocked: 0 });
  }
  if (enemy.health <= 0) endBattle(state, "won", events);
  else if (party.health <= 0) endBattle(state, "lost", events);
}

function nextPlayerAfterLead(state: BattleState): string {
  const seats = playerSeats(state.seatOrder);
  return seats[(seats.indexOf(state.lead) + 1) % seats.length];
}

function endBattle(state: BattleState, result: "won" | "lost", events: GameEvent[]): void {
  events.push({ type: "battleEnd", result });
  state.phase = "over";
  state.result = result;
  state.nextLead = nextPlayerAfterLead(state);
}

function endRound(state: BattleState, events: GameEvent[]): void {
  // Leftovers go off at strength 1, left to right, and stay in hand.
  const hand = state.enemy.hand.slice();
  for (let i = 0; i < hand.length; i++) {
    const id = hand[i];
    const d = getDomino(state, id);
    if (!state.enemy.revealed[i]) {
      state.enemy.revealed[i] = true;
      events.push({ type: "reveal", positions: [i] });
    }
    events.push({ type: "leftover", domino: id, position: i });
    // A leftover Reflect repeats the chain's last domino (the opener if nothing followed it).
    const effect = d.effect.kind === "reflect" ? state.chain.last?.effect : d.effect;
    if (effect === undefined) continue;
    let value = effect.base ?? 0;
    if (state.config.enemyReactionsScaleWithLap) value *= state.chain.lap;
    events.push({ type: "trigger", seat: ENEMY_SEAT, domino: id, index: 0, effect, side: "enemy", value });
    resolve(state, effect, value, "enemy", events);
    if (state.phase === "over") return;
  }
  state.party.block = 0;
  state.enemy.block = 0;
  events.push({ type: "blockReset" });
  state.lead = nextPlayerAfterLead(state);
  startRound(state, events);
}
