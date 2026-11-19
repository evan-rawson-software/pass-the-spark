// The run: a state machine over plain data. Vote on a route, fight, take rewards, repeat.
// Players change it only through applyRunChoice. Every random draw uses the run's seeded RNG
// (run.rng), and every battle gets its own seed drawn from it.
// applyRunChoice never changes its input: it works on a JSON copy.

import { ENEMY_SEAT, createBattleWithEvents, getPendingChoice, makeStarterInstances, step } from "./battle";
import type { BattleState, Choice, PendingChoice } from "./battle";
import type { Content } from "./content";
import type { GameEvent } from "./events";
import { generateActMap } from "./map";
import type { ActMap } from "./map";
import { isRewardComplete, pickedDominoes, rollOffers, submitRewardChoice } from "./rewards";
import type { RewardState } from "./rewards";
import { nextInt, nextUint32 } from "./rng";
import type { BattleType, Domino, NodeType } from "./types";

export type RunNodeType = NodeType | "boss";

// A stop on the map. floor is 1-based; the boss sits on the floor after the last one, at index 0.
export interface RunPosition {
  floor: number;
  index: number;
  type: RunNodeType;
}

export interface RunState {
  content: Content; // everything the run reads from data, copied in so the run is self-contained
  rng: number;
  players: string[]; // the starting seat order; the seats rotate from it
  actIndex: number;
  map: ActMap;
  position: RunPosition | null; // null before the first vote of an act
  phase: "vote" | "battle" | "reward" | "over";
  votes: Record<string, number>; // player id -> voted node index on the next floor; visible to everyone
  health: number; // the party's health between battles
  maxHealth: number;
  decks: Record<string, string[]>; // player id -> domino instance ids
  dominoes: Domino[]; // definitions of every instance in the decks
  coins: Record<string, number>;
  nextIndex: number; // next unused domino instance number (starter copies and generated ones share it)
  battlesFought: number; // seats rotate by this many places
  lead: string; // who leads the next battle (carried over from the last battle's nextLead)
  battle: BattleState | null; // present while phase is "battle"
  battleType: BattleType | null; // the type of the current battle, and of the one just won while rewards are open
  reward: RewardState | null; // present while phase is "reward"
  result: "won" | "lost" | null;
}

export interface RunSetup {
  players: string[]; // player ids in seat order; the first one leads the first battle
  seed: number;
  content: Content;
}

export type RunChoice =
  | { type: "vote"; node: number } // index of a node on the next floor
  | { type: "battle"; choice: Choice }
  | { type: "reward"; pick: string }; // a domino id from the player's offer, or SKIP

export type RunPendingChoice =
  | { type: "vote"; player: string; options: number[] }
  | { type: "battle"; player: string; pending: PendingChoice }
  | { type: "reward"; player: string; offer: Domino[] };

export type RunEvent =
  | GameEvent
  | { type: "vote"; player: string; node: number }
  // tied lists the nodes that tied for the most votes (empty when there was no vote to settle,
  // or one node won outright); the RNG picked among them.
  | { type: "routeChosen"; floor: number; index: number; nodeType: RunNodeType; votes: Record<string, number>; tied: number[] }
  | { type: "battleStart"; enemy: string; nodeType: BattleType; seatOrder: string[]; lead: string; partyHealth: number }
  | { type: "coins"; player: string; amount: number }
  | { type: "rewardOffers" }
  | { type: "rewardChosen"; player: string; pick: string }
  | { type: "actStart"; act: string }
  | { type: "runEnd"; result: "won" | "lost" };

export interface RunStepResult {
  run: RunState;
  events: RunEvent[];
}

export function createRun(setup: RunSetup): RunState {
  return createRunWithEvents(setup).run;
}

// Same as createRun, plus the events of the opening (normally none: the first vote waits).
export function createRunWithEvents(setup: RunSetup): RunStepResult {
  const { players, seed } = setup;
  if (players.length === 0) throw new Error("a run needs players");
  if (new Set(players).size !== players.length || players.includes(ENEMY_SEAT)) throw new Error("player ids must be unique and not 'enemy'");
  const content: Content = JSON.parse(JSON.stringify(setup.content));
  const act = content.run.acts[0];
  const events: RunEvent[] = [];

  const map = generateActMap(act, seed >>> 0);
  const run: RunState = {
    content,
    rng: map.state,
    players: players.slice(),
    actIndex: 0,
    map: map.value,
    position: null,
    phase: "vote",
    votes: {},
    health: content.config.partyMaxHealth,
    maxHealth: content.config.partyMaxHealth,
    decks: {},
    dominoes: [],
    coins: {},
    nextIndex: 1,
    battlesFought: 0,
    lead: players[0],
    battle: null,
    battleType: null,
    reward: null,
    result: null,
  };
  for (const id of players) {
    const starter = makeStarterInstances(content.starterDeck, content.dominoes, run.nextIndex);
    run.nextIndex += starter.deck.length;
    run.decks[id] = starter.deck;
    run.dominoes.push(...starter.dominoes);
    run.coins[id] = content.run.startingCoins;
  }
  events.push({ type: "actStart", act: act.id });
  goToVote(run, events);
  return { run, events };
}

// What each player still owes. Empty once the run is over. Votes and reward picks are owed by
// everyone who hasn't made them yet; a battle owes only the player whose turn it is.
export function getPendingRunChoices(run: RunState): RunPendingChoice[] {
  if (run.phase === "vote") {
    const options = voteOptions(run);
    return run.players.filter((id) => run.votes[id] === undefined).map((id) => ({ type: "vote", player: id, options }));
  }
  if (run.phase === "reward" && run.reward) {
    const reward = run.reward;
    return run.players.filter((id) => reward.choices[id] === undefined).map((id) => ({ type: "reward", player: id, offer: reward.offers[id] }));
  }
  if (run.phase === "battle" && run.battle) {
    const pending = getPendingChoice(run.battle);
    if (pending) return [{ type: "battle", player: pending.player, pending }];
  }
  return [];
}

// Apply one player's choice. Throws when the choice isn't one the player owes.
export function applyRunChoice(input: RunState, playerId: string, choice: RunChoice): RunStepResult {
  const run: RunState = JSON.parse(JSON.stringify(input));
  const events: RunEvent[] = [];
  const owed = getPendingRunChoices(run).find((p) => p.player === playerId && p.type === choice.type);
  if (!owed) throw new Error(`player ${playerId} has no ${choice.type} to make`);

  if (choice.type === "vote" && owed.type === "vote") {
    if (!owed.options.includes(choice.node)) throw new Error(`node ${choice.node} is not connected to the current node`);
    run.votes[playerId] = choice.node;
    events.push({ type: "vote", player: playerId, node: choice.node });
    if (run.players.every((id) => run.votes[id] !== undefined)) settleVotes(run, events);
  } else if (choice.type === "battle" && run.battle) {
    const result = step(run.battle, choice.choice);
    run.battle = result.state;
    events.push(...result.events);
    if (result.state.phase === "over") finishBattle(run, events);
  } else if (choice.type === "reward" && run.reward) {
    run.reward = submitRewardChoice(run.reward, playerId, choice.pick);
    events.push({ type: "rewardChosen", player: playerId, pick: choice.pick });
    if (isRewardComplete(run.reward)) finishRewards(run, events);
  }
  return { run, events };
}

// ---- internals (all mutate the working copy) ----

// The nodes (indices on the next floor) the party can vote for.
function voteOptions(run: RunState): number[] {
  const floors = run.map.floors;
  if (run.position === null) return floors[0].map((_, i) => i);
  const here = floors[run.position.floor - 1]?.[run.position.index];
  if (here === undefined) return []; // standing on the boss
  return here.next.length > 0 ? here.next : [0]; // the last floor leads to the boss
}

// Opens a vote. A single option needs no vote, so the party moves on at once.
function goToVote(run: RunState, events: RunEvent[]): void {
  run.phase = "vote";
  run.votes = {};
  const options = voteOptions(run);
  if (options.length === 1) chooseNode(run, options[0], [], events);
}

// Most votes wins; a tie is broken by the run RNG.
function settleVotes(run: RunState, events: RunEvent[]): void {
  const counts: Record<number, number> = {};
  for (const id of run.players) counts[run.votes[id]] = (counts[run.votes[id]] ?? 0) + 1;
  const best = Math.max(...Object.values(counts));
  const leaders = Object.keys(counts).map(Number).filter((n) => counts[n] === best).sort((a, b) => a - b);
  let node = leaders[0];
  if (leaders.length > 1) {
    const r = nextInt(run.rng, leaders.length);
    run.rng = r.state;
    node = leaders[r.value];
  }
  chooseNode(run, node, leaders.length > 1 ? leaders : [], events);
}

function chooseNode(run: RunState, index: number, tied: number[], events: RunEvent[]): void {
  const floor = (run.position?.floor ?? 0) + 1;
  const type: RunNodeType = floor > run.map.floors.length ? "boss" : run.map.floors[floor - 1][index].type;
  run.position = { floor, index, type };
  events.push({ type: "routeChosen", floor, index, nodeType: type, votes: { ...run.votes }, tied });
  run.votes = {};
  enterNode(run, events);
}

function enterNode(run: RunState, events: RunEvent[]): void {
  const type = run.position?.type;
  if (type === "fight" || type === "elite" || type === "boss") {
    startBattle(run, type, events);
  } else {
    // Rest sites (#47), Traders (#48) and events plug in here. Until they exist there is
    // nothing for anyone to choose, so the party goes straight on to the next vote.
    goToVote(run, events);
  }
}

function startBattle(run: RunState, type: BattleType, events: RunEvent[]): void {
  const { config, dominoes, enemies } = run.content;
  let enemyId = run.map.bossId;
  if (type !== "boss") {
    const pool = enemies.filter((e) => e.tier === (type === "fight" ? "basic" : "elite"));
    if (pool.length === 0) throw new Error(`no ${type} enemies in data/enemies.json`);
    const r = nextInt(run.rng, pool.length);
    run.rng = r.state;
    enemyId = pool[r.value].id;
  }
  const seed = nextUint32(run.rng);
  run.rng = seed.state;

  // Seats rotate one place per battle; the enemy stays last. The lead is a player, not a seat,
  // so rotating the seats doesn't change who leads.
  const shift = run.battlesFought % run.players.length;
  const seats = run.players.slice(shift).concat(run.players.slice(0, shift));
  const seatOrder = [...seats, ENEMY_SEAT];
  const result = createBattleWithEvents({
    config,
    content: { dominoes, enemies },
    players: run.players.map((id) => ({ id, deck: run.decks[id] })),
    seatOrder,
    startingLead: run.lead,
    enemyId,
    seed: seed.value,
    extraDominoes: run.dominoes,
    partyHealth: run.health,
  });
  run.battle = result.state;
  run.battleType = type;
  run.phase = "battle";
  events.push({ type: "battleStart", enemy: enemyId, nodeType: type, seatOrder, lead: run.lead, partyHealth: run.health });
  events.push(...result.events);
}

function finishBattle(run: RunState, events: RunEvent[]): void {
  const battle = run.battle as BattleState;
  const type = run.battleType as BattleType;
  run.battle = null;
  run.battlesFought++;
  run.health = Math.max(0, battle.party.health);
  if (battle.result === "lost" || run.health <= 0) {
    endRun(run, "lost", events);
    return;
  }
  run.lead = battle.nextLead as string;
  const amount = run.content.run.battleCoins[type];
  for (const id of run.players) {
    run.coins[id] += amount;
    events.push({ type: "coins", player: id, amount });
  }
  if (type === "boss" && run.actIndex + 1 >= run.content.run.acts.length) {
    endRun(run, "won", events);
    return;
  }
  const roll = rollOffers(run.rng, run.players, type, run.content.pools, run.nextIndex);
  run.rng = roll.state;
  run.nextIndex = roll.nextIndex;
  run.reward = roll.reward;
  run.phase = "reward";
  events.push({ type: "rewardOffers" });
}

function finishRewards(run: RunState, events: RunEvent[]): void {
  const picked = pickedDominoes(run.reward as RewardState);
  for (const id of run.players) {
    const domino = picked[id];
    if (!domino) continue;
    run.decks[id].push(domino.id);
    run.dominoes.push(domino);
  }
  run.reward = null;
  if (run.battleType === "boss") {
    // A boss that isn't the last of the run opens the next act.
    run.actIndex++;
    const act = run.content.run.acts[run.actIndex];
    const map = generateActMap(act, run.rng);
    run.rng = map.state;
    run.map = map.value;
    run.position = null;
    events.push({ type: "actStart", act: act.id });
  }
  run.battleType = null;
  goToVote(run, events);
}

function endRun(run: RunState, result: "won" | "lost", events: RunEvent[]): void {
  run.phase = "over";
  run.battleType = null;
  run.result = result;
  events.push({ type: "runEnd", result });
}
