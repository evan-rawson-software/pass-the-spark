// Battle state, setup and round flow for the branching cascade. Plain functions over plain data.
// The party builds a tree of dominoes, sets it off in one cascade, then the enemy carries out its intent.
// step never changes its input: it works on a JSON copy.

import { nextInt, shuffle } from "./rng";
import { validateDominoes } from "./validate";
import type { GameEvent } from "./events";
import type { BattleView, OpenEndView } from "./view";
import { extraDraws, handLimitOf } from "./battleCharms";
import { chooseIntentId, passiveOf } from "./enemy";
import type { CapEffect, Charm, Config, DeckList, Domino, Enemy, Intent, Passive, Pattern, Spark } from "./types";

export interface Content {
  dominoes: Domino[];
  enemies: Enemy[];
}

export interface PlayerSetup {
  id: string;
  deck: DeckList;
  charms?: string[]; // charm ids the player holds (from the run); none by default
}

export interface PlayerState {
  id: string;
  deck: string[]; // domino ids, next draw first
  hand: string[];
  discard: string[];
  charms: string[]; // charm ids the player holds for this battle (definitions are in BattleState.charmDefs)
  coins: number; // coins earned in this battle by this player's coin caps; the run adds them to the player's total
}

export interface EnemyState {
  id: string;
  health: number;
  maxHealth: number;
  block: number; // gained from an intent; absorbs damage in the next cascade, then resets
  // Copied from the enemy's data, with the state the pattern needs.
  intents: Intent[];
  pattern: Pattern;
  passives: Passive[];
  lastIntent: string | null;
  repeats: number;
}

export interface PartyState {
  health: number;
  maxHealth: number;
  block: number;
}

// A domino on the board. end is the end it is attached to (null for the opener); depth counts steps from the opener.
// Nodes are stored in creation order, and a node is always created after the node it hangs from.
export interface BoardNode {
  id: number; // index in board.nodes
  domino: string;
  owner: string;
  end: number | null;
  depth: number;
}

// An output of a node. It is open when no node is attached to it.
export interface BoardEnd {
  id: number; // index in board.ends
  node: number;
  index: number; // which of the node's outputs
  spark: Spark;
}

export interface Board {
  nodes: BoardNode[];
  ends: BoardEnd[];
}

export interface BattleState {
  config: Config;
  dominoes: Domino[];
  charmDefs: Charm[]; // the charm data the players' charm ids refer to
  rng: number;
  seatOrder: string[]; // players only
  round: number;
  lead: string; // this round's lead (the first to take a turn)
  seat: string; // whose turn it is
  phase: "build" | "over";
  board: Board;
  passes: number; // players who have passed in a row
  intent: Intent; // what the enemy will do after this round's cascade (passive growth is added once known)
  locked: Spark | null; // the Warden's lock this round: players cannot attach to open ends of this spark
  party: PartyState;
  players: PlayerState[]; // in seat order
  enemy: EnemyState;
  result: "won" | "lost" | null;
  nextLead: string | null;
  blessing: { spark: Spark; strength: number } | null; // set by the run; not used by the cascade rules until #185
}

export interface PlayOption {
  domino: string;
  ends: number[]; // open ends it can attach to; empty for the opener
}

// What the player to move can do. Passing is always allowed.
export interface PendingChoice {
  player: string;
  opener: boolean; // the board is empty: play an amplifier or junction without an end
  plays: PlayOption[];
  canSetOff: boolean; // at least one cap is on the board
}

export type Choice =
  | { type: "play"; domino: string; end?: number } // end is omitted for the opener
  | { type: "pass" }
  | { type: "setOff" };

export interface BattleSetup {
  config: Config;
  content: Content;
  players: PlayerSetup[];
  seatOrder: string[];
  startingLead?: string;
  enemyId: string;
  seed: number;
  // Charm data, needed when any player holds charms. Defaults to none.
  charms?: Charm[];
  // Run-unique domino definitions (instances, generated or upgraded dominoes) used by the decks,
  // in addition to content.dominoes. Their ids must not clash with any other domino id.
  extraDominoes?: Domino[];
  // The party's current health, for a battle inside a run. Defaults to max health.
  partyHealth?: number;
  // The party's blessed spark, for a battle inside a run. Defaults to none.
  blessing?: { spark: Spark; strength: number } | null;
}

export interface StepResult {
  state: BattleState;
  events: GameEvent[];
}

// An enemy's starting health: its data health scaled by the party size (percent per size, rounded up).
export function enemyStartingHealth(config: Config, enemy: Enemy, partySize: number): number {
  const percent = config.enemyHealthPercentByPartySize[Math.min(Math.max(partySize, 1), 4) - 1];
  return Math.ceil((enemy.maxHealth * percent) / 100);
}

// The battle as it stands after its automatic opening (round 1 intent and draws).
export function createBattle(setup: BattleSetup): BattleState {
  return createBattleWithEvents(setup).state;
}

// Same as createBattle, plus the events of the opening.
export function createBattleWithEvents(setup: BattleSetup): StepResult {
  const { config, content, seatOrder } = setup;
  const enemyDef = content.enemies.find((e) => e.id === setup.enemyId);
  if (!enemyDef) throw new Error("unknown enemy " + setup.enemyId);
  const lead = setup.startingLead ?? seatOrder[0];
  if (lead === undefined || !seatOrder.includes(lead)) {
    throw new Error("startingLead must be a player in seatOrder");
  }

  const extra = validateDominoes(setup.extraDominoes ?? [], "extraDominoes");
  for (const d of extra) {
    if (content.dominoes.some((x) => x.id === d.id)) throw new Error("extra domino id already exists: " + d.id);
  }
  const partyHealth = setup.partyHealth ?? config.partyMaxHealth;
  if (!(partyHealth > 0 && partyHealth <= config.partyMaxHealth)) throw new Error("partyHealth must be above 0 and at most max health");

  const enemyHealth = enemyStartingHealth(config, enemyDef, seatOrder.length);

  let rng = setup.seed;
  const players: PlayerState[] = [];
  for (const id of seatOrder) {
    const p = setup.players.find((x) => x.id === id);
    if (!p || p.deck.length === 0) throw new Error("player needs a deck: " + id);
    const s = shuffle(rng, p.deck);
    rng = s.state;
    players.push({ id, deck: s.value, hand: [], discard: [], charms: (p.charms ?? []).slice(), coins: 0 });
  }

  const state: BattleState = {
    config,
    dominoes: [...content.dominoes, ...extra],
    charmDefs: setup.charms ?? [],
    rng,
    seatOrder,
    round: 0,
    lead,
    seat: lead,
    phase: "build",
    board: { nodes: [], ends: [] },
    passes: 0,
    intent: { id: "", actions: [] },
    locked: null,
    party: { health: partyHealth, maxHealth: config.partyMaxHealth, block: 0 },
    players,
    enemy: {
      id: enemyDef.id,
      health: enemyHealth,
      maxHealth: enemyHealth,
      block: 0,
      intents: JSON.parse(JSON.stringify(enemyDef.intents)),
      pattern: JSON.parse(JSON.stringify(enemyDef.pattern)),
      passives: JSON.parse(JSON.stringify(enemyDef.passives)),
      lastIntent: null,
      repeats: 0,
    },
    result: null,
    nextLead: null,
    blessing: setup.blessing ?? null,
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

// ---- legality ----

// What the read-only functions need. A BattleState or a player's BattleView both fit, so a client
// can work out what it may play from the view it was sent.
export type PendingInput = Pick<BattleState, "phase" | "seat" | "players" | "dominoes" | "board" | "config" | "locked">;

export function getPendingChoice(state: PendingInput): PendingChoice | null {
  if (state.phase === "over") return null;
  const player = getPlayer(state, state.seat);
  const opener = state.board.nodes.length === 0;
  const plays: PlayOption[] = [];
  for (const id of unique(player.hand)) {
    const d = getDomino(state, id);
    if (opener) {
      if (d.kind !== "cap") plays.push({ domino: id, ends: [] });
    } else {
      const ends = legalEnds(state, d);
      if (ends.length > 0) plays.push({ domino: id, ends });
    }
  }
  return { player: player.id, opener, plays, canSetOff: capCount(state) > 0 };
}

export function applyChoice(input: BattleState, choice: Choice): BattleState {
  return step(input, choice).state;
}

// Apply a choice. Returns the new state and the events in the order they happened.
export function step(input: BattleState, choice: Choice): StepResult {
  const events: GameEvent[] = [];
  const state: BattleState = JSON.parse(JSON.stringify(input));
  const pending = getPendingChoice(state);
  if (!pending) throw new Error("the battle is over");
  const player = getPlayer(state, pending.player);

  if (choice.type === "play") {
    const option = pending.plays.find((o) => o.domino === choice.domino);
    if (!option) throw new Error("illegal domino");
    if (pending.opener ? choice.end !== undefined : choice.end === undefined || !option.ends.includes(choice.end)) {
      throw new Error("illegal end");
    }
    removeOne(player.hand, choice.domino);
    addNode(state, player.id, getDomino(state, choice.domino), choice.end ?? null, events);
    state.passes = 0;
    if (openEnds(state).length === 0) setOff(state, "capped", events);
    else nextSeat(state);
  } else if (choice.type === "pass") {
    events.push({ type: "pass", player: player.id });
    state.passes += 1;
    if (state.passes >= state.seatOrder.length) setOff(state, "passes", events);
    else nextSeat(state);
  } else if (choice.type === "setOff") {
    if (!pending.canSetOff) throw new Error("no cap on the board");
    events.push({ type: "setOff", reason: "player", player: player.id });
    endCascadePhase(state, events);
  } else {
    throw new Error("unknown choice");
  }
  return { state, events };
}

// ---- charge and previews ----

// What flows through one node, worked out from the board alone.
interface NodeFlow {
  charge: number; // charge arriving (a cap's effect goes off at this)
  out: number; // charge after the node's own amplifier
  echo: number; // extra triggers added by Echo amplifiers on the path, this node included
  sparks: Spark[]; // the different sparks the path was attached to, the opener not counting, this node included
}

// A cap's value per trigger: ceil(base x charge). Flat bonuses (charms, #184) are added on top.
function capValue(effect: CapEffect, charge: number): number {
  return Math.ceil(effect.base * charge);
}

function capTriggers(config: Config, echo: number): number {
  return Math.min(1 + echo, config.triggerCap);
}

// Nodes are in creation order and a parent is always created first, so one pass is enough.
function computeFlows(state: Pick<BattleState, "board" | "dominoes">): NodeFlow[] {
  const { nodes, ends } = state.board;
  const flows: NodeFlow[] = [];
  for (const node of nodes) {
    const d = getDomino(state, node.domino);
    let charge = 1;
    let echo = 0;
    let sparks: Spark[] = [];
    if (node.end !== null) {
      const end = ends[node.end];
      const parent = flows[end.node];
      charge = parent.out;
      echo = parent.echo;
      sparks = parent.sparks.includes(end.spark) ? parent.sparks : [...parent.sparks, end.spark];
    }
    let out = charge;
    if (d.kind === "amplifier" && d.amp) {
      if (d.amp.op === "add") out = charge + d.amp.value;
      else if (d.amp.op === "mul") out = charge * d.amp.value;
      else if (d.amp.op === "echo") echo += d.amp.value;
      else out = charge + d.amp.value * sparks.length;
    }
    flows.push({ charge, out, echo, sparks });
  }
  return flows;
}

function openEnds(state: Pick<BattleState, "board">): BoardEnd[] {
  return state.board.ends.filter((e) => !state.board.nodes.some((n) => n.end === e.id));
}

// The open ends with the charge reaching each and the triggers a cap placed there would get.
export function getOpenEnds(state: Pick<BattleState, "board" | "dominoes" | "config">): OpenEndView[] {
  const flows = computeFlows(state);
  return openEnds(state).map((e) => ({
    end: e.id,
    node: e.node,
    index: e.index,
    spark: e.spark,
    charge: flows[e.node].out,
    triggers: capTriggers(state.config, flows[e.node].echo),
  }));
}

// What playing a domino on an end would do: the charge it passes on (amplifier, junction; for a
// junction, to each of its branches) or the value of its effect (cap).
export interface PlayPreview {
  charge: number; // amplifier or junction: the charge after it; cap: the charge reaching it
  value: number; // cap: its effect per trigger; otherwise 0
  triggers: number; // cap: how many times it goes off; otherwise 0
  total: number; // value x triggers
}

// Preview of a play by the given player: the domino must be in their hand. end is omitted for the
// opener. Returns null when the domino cannot be played there. Works on a state or a view; never changes it.
export function previewPlay(input: PendingInput, playerId: string, dominoId: string, end?: number): PlayPreview | null {
  const player = input.players.find((p) => p.id === playerId);
  if (!player || !player.hand.includes(dominoId)) return null;
  const d = getDomino(input, dominoId);
  const opener = input.board.nodes.length === 0;
  if (opener ? end !== undefined || d.kind === "cap" : end === undefined || !legalEnds(input, d).includes(end)) return null;
  const board: Board = JSON.parse(JSON.stringify(input.board));
  addToBoard(board, playerId, d, end ?? null);
  const flow = computeFlows({ board, dominoes: input.dominoes }).pop() as NodeFlow;
  if (d.kind !== "cap" || !d.effect) return { charge: flow.out, value: 0, triggers: 0, total: 0 };
  const value = capValue(d.effect, flow.charge);
  const triggers = capTriggers(input.config, flow.echo);
  return { charge: flow.charge, value, triggers, total: value * triggers };
}

// What setting off now would do, in total.
export interface CascadePreview {
  damage: number; // reaching the enemy's health, after its block
  block: number; // gained by the party
  coins: Record<string, number>; // per player, from their coin caps
}

export function previewCascade(input: BattleState | BattleView): CascadePreview {
  const state = { ...JSON.parse(JSON.stringify(input)), rng: 0 } as BattleState;
  const events: GameEvent[] = [];
  fireCascade(state, events);
  const result: CascadePreview = { damage: 0, block: 0, coins: {} };
  for (const e of events) {
    if (e.type === "damage" && e.side === "enemy") result.damage += e.amount;
    else if (e.type === "block" && e.side === "party") result.block += e.amount;
    else if (e.type === "coinsGained") result.coins[e.player] = (result.coins[e.player] ?? 0) + e.amount;
  }
  return result;
}

// ---- internals (all mutate the working copy) ----

function legalEnds(state: PendingInput, d: Domino): number[] {
  const open = openEnds(state);
  // A junction replaces one open end with two.
  if (d.kind === "junction" && open.length + 1 > state.config.openEndLimit) return [];
  return open.filter((e) => e.spark !== state.locked && (d.intake === "any" || d.intake.includes(e.spark))).map((e) => e.id);
}

function capCount(state: Pick<BattleState, "board" | "dominoes">): number {
  return state.board.nodes.filter((n) => getDomino(state, n.domino).kind === "cap").length;
}

function addToBoard(board: Board, owner: string, d: Domino, end: number | null): void {
  const node: BoardNode = {
    id: board.nodes.length,
    domino: d.id,
    owner,
    end,
    depth: end === null ? 0 : board.nodes[board.ends[end].node].depth + 1,
  };
  board.nodes.push(node);
  d.output.forEach((spark, index) => board.ends.push({ id: board.ends.length, node: node.id, index, spark }));
}

function addNode(state: BattleState, owner: string, d: Domino, end: number | null, events: GameEvent[]): void {
  addToBoard(state.board, owner, d, end);
  const node = state.board.nodes[state.board.nodes.length - 1];
  const flow = computeFlows(state).pop() as NodeFlow;
  events.push({
    type: "play",
    player: owner,
    domino: d.id,
    node: node.id,
    end,
    depth: node.depth,
    charge: d.kind === "cap" ? flow.charge : flow.out,
  });
}

function nextSeat(state: BattleState): void {
  state.seat = state.seatOrder[(state.seatOrder.indexOf(state.seat) + 1) % state.seatOrder.length];
}

// The board is complete: every end capped, or a full round of passes.
function setOff(state: BattleState, reason: "capped" | "passes", events: GameEvent[]): void {
  events.push({ type: "setOff", reason });
  endCascadePhase(state, events);
}

// The cascade, then the enemy's action, then the round end.
function endCascadePhase(state: BattleState, events: GameEvent[]): void {
  const capsFired = fireCascade(state, events);
  if (isOver(state)) return;
  longNightGrowth(state, capsFired, events);
  // Enemy block from its last intent has had its cascade (even a round where nothing fired).
  state.enemy.block = 0;
  events.push({ type: "blockReset", side: "enemy" });
  enemyAct(state, events);
  if (isOver(state)) return;
  endRound(state, events);
}

// Steps by depth from the opener; within a step, nodes in creation order. Open ends fizzle at the end.
// With no cap on the board nothing fires. Stops the moment the enemy is at 0 health.
// Returns how many different caps went off (a cap that goes off several times counts once).
function fireCascade(state: BattleState, events: GameEvent[]): number {
  if (capCount(state) === 0) return 0;
  const hoarder = passiveOf(state.enemy, "hoarder");
  if (hoarder && state.board.nodes.length > 0) {
    const amount = state.board.nodes.length * hoarder.multiplier;
    state.enemy.block += amount;
    events.push({ type: "passive", passive: "hoarder", amount });
    events.push({ type: "block", side: "enemy", amount });
  }
  let capsFired = 0;
  let lastSpark: Spark | null = null; // the intake spark of the cap trigger just before (Auditor)
  const flows = computeFlows(state);
  const { nodes } = state.board;
  const lastDepth = Math.max(...nodes.map((n) => n.depth));
  for (let depth = 0; depth <= lastDepth; depth++) {
    events.push({ type: "cascadeStep", depth });
    for (const node of nodes) {
      if (node.depth !== depth) continue;
      const d = getDomino(state, node.domino);
      const flow = flows[node.id];
      events.push({ type: "nodeLit", node: node.id, domino: d.id, owner: node.owner, charge: d.kind === "cap" ? flow.charge : flow.out });
      if (d.kind === "cap" && d.effect) {
        capsFired += 1;
        const spark = state.board.ends[node.end as number].spark;
        const triggers = capTriggers(state.config, flow.echo);
        const firstRepeats = lastSpark === spark;
        lastSpark = spark;
        fireCap(state, node, d.effect, capValue(d.effect, flow.charge), triggers, firstRepeats, events);
        if (isOver(state)) return capsFired;
      }
    }
  }
  for (const e of openEnds(state)) events.push({ type: "fizzle", end: e.id, spark: e.spark, charge: flows[e.node].out });
  return capsFired;
}

// Each trigger counts as a cap going off for the Auditor: the first repeats the spark of the cap before
// it only if firstRepeats, and every extra (Echo) trigger repeats the cap's own spark.
function fireCap(state: BattleState, node: BoardNode, effect: CapEffect, value: number, triggers: number, firstRepeats: boolean, events: GameEvent[]): void {
  events.push({ type: "capFired", node: node.id, domino: node.domino, owner: node.owner, effect: effect.kind, value, triggers });
  for (let i = 0; i < triggers; i++) {
    if (i > 0 || firstRepeats) {
      auditorStrike(state, events);
      if (isOver(state)) return;
    }
    if (effect.kind === "damage") {
      const blocked = effect.ignoresBlock ? 0 : Math.min(state.enemy.block, value);
      state.enemy.block -= blocked;
      state.enemy.health -= value - blocked;
      events.push({ type: "damage", side: "enemy", amount: value - blocked, blocked });
      if (state.enemy.health <= 0) {
        endBattle(state, "won", events);
        return;
      }
    } else if (effect.kind === "block") {
      state.party.block += value;
      events.push({ type: "block", side: "party", amount: value });
    } else {
      const owner = getPlayer(state, node.owner);
      owner.coins += value;
      events.push({ type: "coinsGained", player: owner.id, amount: value });
    }
  }
}

// Auditor: the party takes damage (block absorbs it).
function auditorStrike(state: BattleState, events: GameEvent[]): void {
  const auditor = passiveOf(state.enemy, "auditor");
  if (!auditor) return;
  events.push({ type: "passive", passive: "auditor", amount: auditor.damage });
  hitParty(state, auditor.damage, events);
}

// Long Night: this round's attack grows for each cap set off.
function longNightGrowth(state: BattleState, capsFired: number, events: GameEvent[]): void {
  const longNight = passiveOf(state.enemy, "longNight");
  if (!longNight || capsFired === 0) return;
  const amount = longNight.growth * capsFired;
  addToAttacks(state.intent, amount);
  events.push({ type: "passive", passive: "longNight", amount });
}

function addToAttacks(intent: Intent, amount: number): void {
  for (const action of intent.actions) if (action.kind === "attack") action.value += amount;
}

function hitParty(state: BattleState, hit: number, events: GameEvent[]): void {
  const { party } = state;
  const blocked = Math.min(party.block, hit);
  party.block -= blocked;
  party.health -= hit - blocked;
  events.push({ type: "damage", side: "party", amount: hit - blocked, blocked });
  if (party.health <= 0) endBattle(state, "lost", events);
}

function enemyAct(state: BattleState, events: GameEvent[]): void {
  const { intent, enemy } = state;
  events.push({ type: "enemyAction", intent: JSON.parse(JSON.stringify(intent)) });
  for (const action of intent.actions) {
    if (action.kind === "block") {
      enemy.block += action.value;
      events.push({ type: "block", side: "enemy", amount: action.value });
      continue;
    }
    for (let i = 0; i < (action.hits ?? 1); i++) {
      hitParty(state, action.value, events);
      if (isOver(state)) return;
    }
  }
}

function endBattle(state: BattleState, result: "won" | "lost", events: GameEvent[]): void {
  events.push({ type: "battleEnd", result });
  state.phase = "over";
  state.result = result;
  state.nextLead = nextPlayerAfterLead(state);
}

function nextPlayerAfterLead(state: BattleState): string {
  return state.seatOrder[(state.seatOrder.indexOf(state.lead) + 1) % state.seatOrder.length];
}

// Party block resets, the board goes to its owners' discard piles, the lead moves on one seat.
function endRound(state: BattleState, events: GameEvent[]): void {
  state.party.block = 0;
  events.push({ type: "blockReset", side: "party" });
  for (const node of state.board.nodes) getPlayer(state, node.owner).discard.push(node.domino);
  const glutton = passiveOf(state.enemy, "glutton");
  if (glutton) {
    const amount = Math.min(glutton.heal, state.enemy.maxHealth - state.enemy.health);
    state.enemy.health += amount;
    if (amount > 0) events.push({ type: "passive", passive: "glutton", amount });
  }
  state.lead = nextPlayerAfterLead(state);
  startRound(state, events);
}

// The intent is chosen and shown, then everyone draws, then the lead takes the first turn.
function startRound(state: BattleState, events: GameEvent[]): void {
  state.round += 1;
  state.board = { nodes: [], ends: [] };
  state.passes = 0;
  state.seat = state.lead;
  startPassives(state, events);
  events.push({ type: "roundStart", round: state.round, lead: state.lead });
  events.push({ type: "intent", intent: JSON.parse(JSON.stringify(state.intent)) });
  for (const p of state.players) {
    draw(state, p, (state.round === 1 ? state.config.playerFirstDraw : state.config.playerDrawPerRound) + extraDraws(state, p.id), handLimitOf(state, p.id), events);
  }
}

// The enemy's intent for the round, then the passives that act at round start (Smolder, Warden).
function startPassives(state: BattleState, events: GameEvent[]): void {
  const { enemy } = state;
  const chosen = chooseIntentId(enemy, state.round, state.rng);
  state.rng = chosen.rng;
  enemy.repeats = chosen.id === enemy.lastIntent ? enemy.repeats + 1 : 1;
  enemy.lastIntent = chosen.id;
  state.intent = JSON.parse(JSON.stringify(enemy.intents.find((i) => i.id === chosen.id)));
  const smolder = passiveOf(enemy, "smolder");
  if (smolder && state.round > 1) {
    const amount = smolder.growth * (state.round - 1);
    addToAttacks(state.intent, amount);
    events.push({ type: "passive", passive: "smolder", amount });
  }
  const warden = passiveOf(enemy, "warden");
  if (warden) {
    const pick = nextInt(state.rng, warden.sparks.length);
    state.rng = pick.state;
    state.locked = warden.sparks[pick.value];
    events.push({ type: "passive", passive: "warden", spark: state.locked });
  }
}

// Draw up to `count` dominoes, stopping at the hand limit. An empty deck is reshuffled from the discard pile.
function draw(state: BattleState, p: PlayerState, count: number, limit: number, events: GameEvent[]): void {
  let drawn: string[] = [];
  const flush = () => {
    if (drawn.length > 0) events.push({ type: "draw", player: p.id, count: drawn.length, dominoes: drawn });
    drawn = [];
  };
  for (let i = 0; i < count; i++) {
    if (p.hand.length >= limit) break;
    if (p.deck.length === 0) {
      if (p.discard.length > 0) {
        flush();
        events.push({ type: "reshuffle", player: p.id });
      }
      const s = shuffle(state.rng, p.discard);
      state.rng = s.state;
      p.deck = s.value;
      p.discard = [];
    }
    if (p.deck.length === 0) break;
    const id = p.deck.shift() as string;
    drawn.push(id);
    p.hand.push(id);
  }
  flush();
}

function getPlayer(state: Pick<BattleState, "players">, id: string): PlayerState {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error("no such player " + id);
  return p;
}

function getDomino(state: Pick<BattleState, "dominoes">, id: string): Domino {
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

// A function, so TypeScript doesn't keep an earlier "not over" narrowing after a call changed the state.
function isOver(state: BattleState): boolean {
  return state.phase === "over";
}
