// The run: a state machine over plain data. Vote on a route, fight, take rewards, repeat.
// Players change it only through applyRunChoice. Every random draw uses the run's seeded RNG
// (run.rng), and every battle gets its own seed drawn from it.
// applyRunChoice never changes its input: it works on a JSON copy.

import { createBattleWithEvents, getPlayerChoices, makeStarterInstances, step } from "./battle";
import type { BattleState, Choice, PlayerChoices } from "./battle";
import { rollCharmsForPlayers, charmById, heldCharmNumber, traderPrice, COIN_PURSE } from "./charms";
import type { Content } from "./content";
import type { GameEvent } from "./events";
import { openEvent, pickEvent } from "./eventStops";
import { floorHiddenAfterTurnBack } from "./events/tollBridge";
import { stepGiant } from "./events/giant";
import type { EventOption, EventState } from "./eventStops";
import { applyPersonalChoice, personalSummary } from "./events/personal";
import type { EventPick, PersonalResult } from "./events/personal";
import { generateActMap } from "./map";
import type { ActMap } from "./map";
import { SKIP, isRewardComplete, pickedDominoes, rollOffers, submitCharmChoice, submitRewardChoice } from "./rewards";
import type { RewardState } from "./rewards";
import { nextInt, nextUint32 } from "./rng";
import { previewUpgrade } from "./upgrades";
import { settleVote } from "./vote";
import { rollStock } from "./trader";
import type { TraderState } from "./trader";
import type { ActData, BattleType, Charm, Domino, EventKind, NodeType, Rarity, Spark, UpgradeSide } from "./types";

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
  path: { floor: number; index: number }[]; // the stops the party has stood on this act, in order (a room saved by an older host has none: read it as empty)
  phase: "vote" | "battle" | "reward" | "rest" | "trader" | "event" | "act" | "over";
  votes: Record<string, number>; // player id -> voted node index on the next floor; visible to everyone
  health: number; // the party's health between battles
  maxHealth: number;
  decks: Record<string, string[]>; // player id -> domino instance ids
  dominoes: Domino[]; // definitions of every instance in the decks
  charms: Record<string, string[]>; // player id -> charm ids held; public to everyone
  coins: Record<string, number>;
  removalFee: Record<string, number>; // player id -> what their next removal at a Trader costs
  nextIndex: number; // next unused domino instance number (starter copies and generated ones share it)
  battlesFought: number; // seats rotate by this many places
  battle: BattleState | null; // present while phase is "battle"
  battleType: BattleType | null; // the type of the current battle, and of the one just won while rewards are open
  reward: RewardState | null; // present while phase is "reward"
  rest: string[] | null; // present while phase is "rest": the players who have chosen
  actStart: { heal: number; done: string[] } | null; // present while phase is "act" (the screen between acts): what the heal restored and who has pressed Continue
  trader: TraderState | null; // present while phase is "trader"
  event: EventState | null; // present while phase is "event"
  hiddenFloor: number | null; // the floor whose stops show as "?" until the party enters one (Toll Bridge: turn back)
  allRareRewards: boolean; // the battle being fought (the Toll Bridge's hard fight) offers only rares
  blessing: Spark | null; // the Spark Shrine's blessed spark; lasts until the act's boss fight is over
  eventsSeen: string[]; // event ids met this run, across acts; starts again once every enabled event has been seen
  result: "won" | "lost" | null;
  unlocks?: Record<string, string[]>; // player id -> unlock ids, fixed at run start; absent (an older save) means everything is unlocked
}

export interface RunSetup {
  players: string[]; // player ids in seat order
  seed: number;
  content: Content;
  unlocks?: Record<string, string[]>; // player id -> unlock ids; omitted (or a player left out) means everything unlocked
}

export type RunChoice =
  | { type: "vote"; node: number } // index of a node on the next floor
  | { type: "battle"; choice: Choice }
  | { type: "reward"; pick: string } // a domino id from the player's offer, or SKIP
  | { type: "charmReward"; pick: string } // a charm id from the player's charm offer, or SKIP
  | { type: "rest" }
  | { type: "upgrade"; domino: string; side: UpgradeSide; spark?: Spark } // spark: the second intake, left side only
  | { type: "trader"; action: TraderAction }
  | { type: "act" } // Continue, from the screen between acts
  | { type: "event"; option: number; pick?: EventPick }; // an index into the pending choice's options; pick: the dominoes (and spark) a personal event's option works on

// Any number of buys and removes, in any order, then done. domino is an id: from your stock to buy, from your deck to remove.
export type TraderAction = { kind: "buy"; domino: string } | { kind: "buyCharm"; charm: string } | { kind: "remove"; domino: string } | { kind: "done" };

export type RunPendingChoice =
  | { type: "vote"; player: string; options: number[] }
  | { type: "battle"; player: string; pending: PlayerChoices } // one for every player while the battle is on: they build at the same time
  | { type: "reward"; player: string; offer: Domino[] }
  | { type: "charmReward"; player: string; offer: Charm[] } // owed alongside the domino pick when the player has a charm offer
  | { type: "rest"; player: string } // answered with a "rest" or an "upgrade" choice
  // Prices are what this player pays now (Haggler included): dominoPrices by domino id, charmPrice for each charm, removalFee for the next removal.
  | { type: "trader"; player: string; stock: Domino[]; charmStock: Charm[]; dominoPrices: Record<string, number>; charmPrice: number; removalFee: number }
  | { type: "event"; player: string; event: string; options: EventOption[] }
  | { type: "act"; player: string };

export type RunEvent =
  | GameEvent
  | { type: "vote"; player: string; node: number }
  // counts is the number of votes per node; drawn is true when the vote was split and the RNG
  // drew the winner (false when unanimous, or when there was only one option and no vote).
  | { type: "routeChosen"; floor: number; index: number; nodeType: RunNodeType; votes: Record<string, number>; counts: Record<number, number>; drawn: boolean }
  | { type: "battleStart"; enemy: string; nodeType: BattleType; seatOrder: string[]; partyHealth: number }
  | { type: "coins"; player: string; amount: number }
  | { type: "rest"; player: string; healed: number }
  | { type: "upgrade"; player: string; from: string; to: Domino }
  | { type: "rewardOffers" }
  | { type: "rewardChosen"; player: string; pick: string }
  | { type: "charmOffered"; player: string; charms: string[] }
  | { type: "charmTaken"; player: string; charm: string | null } // charm is null when the player skipped
  | { type: "charmBought"; player: string; charm: string; price: number }
  | { type: "traderStock" }
  | { type: "eventStart"; event: string; kind: EventKind; domino: Domino | null }
  | { type: "eventChoice"; player: string; option: number }
  // winner is the option that won. counts is the number of votes per option; drawn is true when the
  // vote was split and the RNG drew the winner. Coins are paid with "coins" events; a domino goes to
  // the player named by the option.
  // The Sleeping Giant woke: the party took this much damage and the event is over.
  | { type: "giantWake"; damage: number }
  | { type: "eventOutcome"; event: string; winner: number; option: EventOption; counts: Record<number, number>; drawn: boolean }
  // Personal events, once everyone has chosen: what each player did, in seat order.
  | { type: "eventSummary"; event: string; results: ({ player: string } & PersonalResult)[] }
  | { type: "bought"; player: string; domino: string; price: number }
  | { type: "removed"; player: string; domino: string; fee: number }
  | { type: "traderDone"; player: string }
  // heal is how much the act-start heal restored (0 in act 1); boss is the act's boss, chosen already.
  | { type: "actStart"; act: string; number: number; heal: number; boss: string }
  | { type: "runEnd"; result: "won" | "lost" };

// The act the party is in.
export function currentAct(run: RunState): ActData {
  return run.content.run.acts[run.actIndex];
}

// Names the decision the run is waiting on, so a choice made for an earlier one can be told apart
// from one made for the current decision. It changes whenever the phase or the party's position does.
export function getRunWindow(run: RunState): string {
  const at = run.position ? `${run.position.floor}.${run.position.index}` : "start";
  return `${run.actIndex}:${at}:${run.phase}`;
}

// The events that belong to the run itself, as opposed to the battle's own.
export type RunOnlyEvent = Exclude<RunEvent, GameEvent>;

const RUN_ONLY: Record<RunOnlyEvent["type"], true> = {
  vote: true,
  routeChosen: true,
  battleStart: true,
  coins: true,
  rest: true,
  upgrade: true,
  rewardOffers: true,
  rewardChosen: true,
  charmOffered: true,
  charmTaken: true,
  charmBought: true,
  traderStock: true,
  eventStart: true,
  eventChoice: true,
  eventOutcome: true,
  eventSummary: true,
  giantWake: true,
  bought: true,
  removed: true,
  traderDone: true,
  actStart: true,
  runEnd: true,
};

// Splits a step's events into the battle's events and the run's own, keeping the order within each.
export function splitRunEvents(events: RunEvent[]): { battle: GameEvent[]; run: RunOnlyEvent[] } {
  const battle: GameEvent[] = [];
  const run: RunOnlyEvent[] = [];
  for (const e of events) {
    if (e.type in RUN_ONLY) run.push(e as RunOnlyEvent);
    else battle.push(e as GameEvent);
  }
  return { battle, run };
}

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
  if (new Set(players).size !== players.length) throw new Error("player ids must be unique");
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
    path: [],
    phase: "vote",
    votes: {},
    health: content.config.partyMaxHealth,
    maxHealth: content.config.partyMaxHealth,
    decks: {},
    dominoes: [],
    charms: {},
    coins: {},
    removalFee: {},
    nextIndex: 1,
    battlesFought: 0,
    battle: null,
    battleType: null,
    reward: null,
    rest: null,
    actStart: null,
    trader: null,
    event: null,
    hiddenFloor: null,
    allRareRewards: false,
    blessing: null,
    eventsSeen: [],
    result: null,
  };
  if (setup.unlocks) run.unlocks = JSON.parse(JSON.stringify(setup.unlocks));
  for (const id of players) {
    const starter = makeStarterInstances(content.starterDeck, content.dominoes, run.nextIndex);
    run.nextIndex += starter.deck.length;
    run.decks[id] = starter.deck;
    run.dominoes.push(...starter.dominoes);
    run.charms[id] = [];
    run.coins[id] = content.run.startingCoins;
    run.removalFee[id] = content.run.trader.removalFeeStart;
  }
  events.push({ type: "actStart", act: act.id, number: 1, heal: 0, boss: map.value.bossId });
  goToVote(run, events);
  return { run, events };
}

// What each player still owes. Empty once the run is over. Votes and reward picks are owed by
// everyone who hasn't made them yet; a battle owes every player, who build at the same time.
export function getPendingRunChoices(run: RunState): RunPendingChoice[] {
  if (run.phase === "vote") {
    const options = voteOptions(run);
    return run.players.filter((id) => run.votes[id] === undefined).map((id) => ({ type: "vote", player: id, options }));
  }
  if (run.phase === "reward" && run.reward) {
    const reward = run.reward;
    const owed: RunPendingChoice[] = [];
    for (const id of run.players) {
      if (reward.choices[id] === undefined) owed.push({ type: "reward", player: id, offer: reward.offers[id] });
      if (reward.charmOffers[id] && reward.charmChoices[id] === undefined) {
        owed.push({ type: "charmReward", player: id, offer: reward.charmOffers[id].map((c) => charmById(run.content.charms, c)) });
      }
    }
    return owed;
  }
  if (run.phase === "rest" && run.rest) {
    const done = run.rest;
    return run.players.filter((id) => !done.includes(id)).map((id) => ({ type: "rest", player: id }));
  }
  if (run.phase === "trader" && run.trader) {
    const trader = run.trader;
    return run.players.filter((id) => !trader.done[id]).map((id): RunPendingChoice => ({
      type: "trader",
      player: id,
      stock: trader.stock[id],
      charmStock: trader.charmStock[id].map((c) => charmById(run.content.charms, c)),
      ...getTraderPrices(run, id),
    }));
  }
  if (run.phase === "event" && run.event) {
    const event = run.event;
    if (event.giant) return [{ type: "event", player: event.giant.turn, event: event.id, options: event.options }]; // only the player whose turn it is
    return run.players.filter((id) => event.choices[id] === undefined).map((id) => ({ type: "event", player: id, event: event.id, options: event.options }));
  }
  if (run.phase === "act" && run.actStart) {
    const done = run.actStart.done;
    return run.players.filter((id) => !done.includes(id)).map((id) => ({ type: "act", player: id }));
  }
  if (run.phase === "battle" && run.battle) {
    return run.players.map((id): RunPendingChoice => ({ type: "battle", player: id, pending: getPlayerChoices(run.battle as BattleState, id) as PlayerChoices }));
  }
  return [];
}

// What each item costs this player right now (Haggler included): dominoes by id, a charm, the next removal.
export interface TraderPrices {
  dominoPrices: Record<string, number>;
  charmPrice: number;
  removalFee: number;
}

export function getTraderPrices(run: RunState, playerId: string): TraderPrices {
  const data = run.content.run.trader;
  const price = (base: number) => traderPrice(run.content.charms, run.charms[playerId], base);
  const dominoPrices: Record<string, number> = {};
  for (const d of run.trader?.stock[playerId] ?? []) dominoPrices[d.id] = price(data.prices[d.rarity as Rarity]);
  return { dominoPrices, charmPrice: price(data.charmPrice), removalFee: price(run.removalFee[playerId]) };
}

// The seat that starts this battle's rotation: the Sleeping Giant's first turn goes to it.
export function startingSeat(run: Pick<RunState, "players" | "battlesFought">): string {
  return run.players[run.battlesFought % run.players.length];
}

// Apply one player's choice. Throws when the choice isn't one the player owes.
export function applyRunChoice(input: RunState, playerId: string, choice: RunChoice): RunStepResult {
  const run: RunState = JSON.parse(JSON.stringify(input));
  const events: RunEvent[] = [];
  const owed = getPendingRunChoices(run).find((p) => p.player === playerId && (p.type === choice.type || (p.type === "rest" && choice.type === "upgrade")));
  if (!owed) throw new Error(`player ${playerId} has no ${choice.type} to make`);

  if (choice.type === "vote" && owed.type === "vote") {
    if (!owed.options.includes(choice.node)) throw new Error(`node ${choice.node} is not connected to the current node`);
    run.votes[playerId] = choice.node;
    events.push({ type: "vote", player: playerId, node: choice.node });
    if (run.players.every((id) => run.votes[id] !== undefined)) settleVotes(run, events);
  } else if (choice.type === "battle" && run.battle) {
    if (choice.choice.player !== playerId) throw new Error(`a battle choice must be the player's own (${playerId})`);
    const result = step(run.battle, choice.choice);
    run.battle = result.state;
    events.push(...result.events);
    if (result.state.phase === "over") finishBattle(run, events);
  } else if (owed.type === "rest" && run.rest) {
    if (choice.type === "rest") {
      const healed = Math.min(run.content.run.restHeal, run.maxHealth - run.health);
      run.health += healed;
      events.push({ type: "rest", player: playerId, healed });
    } else if (choice.type === "upgrade") {
      const { before, after } = previewUpgrade(run, playerId, choice.domino, choice.side, choice.spark);
      run.decks[playerId][run.decks[playerId].indexOf(before.id)] = after.id;
      run.dominoes[run.dominoes.findIndex((d) => d.id === before.id)] = after;
      events.push({ type: "upgrade", player: playerId, from: before.id, to: after });
    }
    run.rest.push(playerId);
    if (run.rest.length === run.players.length) {
      run.rest = null;
      goToVote(run, events);
    }
  } else if (choice.type === "act" && run.actStart) {
    run.actStart.done.push(playerId);
    if (run.actStart.done.length === run.players.length) {
      run.actStart = null;
      goToVote(run, events);
    }
  } else if (choice.type === "reward" && run.reward) {
    run.reward = submitRewardChoice(run.reward, playerId, choice.pick);
    events.push({ type: "rewardChosen", player: playerId, pick: choice.pick });
    if (isRewardComplete(run.reward)) finishRewards(run, events);
  } else if (choice.type === "charmReward" && run.reward) {
    run.reward = submitCharmChoice(run.reward, playerId, choice.pick);
    if (choice.pick !== SKIP) run.charms[playerId].push(choice.pick);
    events.push({ type: "charmTaken", player: playerId, charm: choice.pick === SKIP ? null : choice.pick });
    if (isRewardComplete(run.reward)) finishRewards(run, events);
  } else if (choice.type === "event" && owed.type === "event" && run.event?.kind === "personal") {
    if (applyPersonalChoice(run, playerId, choice.option, choice.pick, events)) {
      events.push(personalSummary(run));
      run.event = null;
      goToVote(run, events);
    }
  } else if (choice.type === "event" && owed.type === "event" && run.event) {
    if (!Number.isInteger(choice.option) || choice.option < 0 || choice.option >= owed.options.length) throw new Error(`option ${choice.option} is not offered`);
    events.push({ type: "eventChoice", player: playerId, option: choice.option });
    if (run.event.giant) applyGiant(run, playerId, choice.option, events);
    else run.event.choices[playerId] = choice.option;
    if (run.event && !run.event.giant && run.players.every((id) => run.event?.choices[id] !== undefined)) settleEvent(run, events);
  } else if (choice.type === "trader" && run.trader) {
    applyTraderAction(run, playerId, choice.action, events);
    if (run.players.every((id) => run.trader?.done[id])) {
      run.trader = null;
      goToVote(run, events);
    }
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
  if (options.length === 1) chooseNode(run, options[0], {}, false, events);
}

// A unanimous vote wins; otherwise the winner is drawn from the votes, weighted by count.
function settleVotes(run: RunState, events: RunEvent[]): void {
  const result = settleVote(run.rng, run.players.map((id) => run.votes[id]));
  run.rng = result.state;
  chooseNode(run, result.winner, result.counts, result.drawn, events);
}

function chooseNode(run: RunState, index: number, counts: Record<number, number>, drawn: boolean, events: RunEvent[]): void {
  const floor = (run.position?.floor ?? 0) + 1;
  const type: RunNodeType = floor > run.map.floors.length ? "boss" : run.map.floors[floor - 1][index].type;
  run.position = { floor, index, type };
  run.path = [...(run.path ?? []), { floor, index }];
  run.hiddenFloor = null; // entering a stop of the hidden floor reveals it
  events.push({ type: "routeChosen", floor, index, nodeType: type, votes: { ...run.votes }, counts, drawn });
  run.votes = {};
  enterNode(run, events);
}

function enterNode(run: RunState, events: RunEvent[]): void {
  const type = run.position?.type;
  if (type === "fight" || type === "elite" || type === "boss") {
    startBattle(run, type, events);
  } else if (type === "rest") {
    run.phase = "rest";
    run.rest = [];
  } else if (type === "trader") {
    const roll = rollStock(run.rng, run.players, run.content.run.trader, run.content.pools, run.nextIndex, currentAct(run).traderOdds, run.unlocks);
    run.nextIndex = roll.nextIndex;
    run.trader = roll.trader;
    const charmRoll = rollCharmsForPlayers(roll.state, run.content.charms, "normal", run.charms, run.players, run.content.run.trader.charmStockSize);
    run.rng = charmRoll.state;
    for (const id of run.players) run.trader.charmStock[id] = charmRoll.offers[id] ?? [];
    run.phase = "trader";
    events.push({ type: "traderStock" });
  } else {
    enterEvent(run, events);
  }
}

// Picks the stop's event (weighted, none twice until all have been seen) and opens it.
function enterEvent(run: RunState, events: RunEvent[]): void {
  const picked = pickEvent(run.rng, run.content.events, run.eventsSeen);
  run.eventsSeen = picked.seen;
  const data = run.content.events.find((e) => e.id === picked.id)!;
  const opened = openEvent(picked.state, data, run.players, run.content.pools, run.nextIndex, startingSeat(run), run.coins, run.unlocks);
  run.rng = opened.state;
  run.nextIndex = opened.nextIndex;
  run.event = opened.event;
  run.phase = "event";
  events.push({ type: "eventStart", event: data.id, kind: data.kind, domino: opened.event.domino });
}

// One grab or stop at the Sleeping Giant. Grabs pay coins; a waking grab damages the party and ends the
// event (and the run if health reaches 0); the event also ends when everyone has stopped.
function applyGiant(run: RunState, playerId: string, option: number, events: RunEvent[]): void {
  const event = run.event as EventState;
  const data = run.content.events.find((e) => e.id === event.id)!;
  const step = stepGiant(event.giant!, data, run.players, playerId, option, run.rng);
  run.rng = step.state;
  event.giant = step.giant;
  if (step.coins > 0) {
    run.coins[playerId] += step.coins;
    events.push({ type: "coins", player: playerId, amount: step.coins });
  }
  if (!step.ended) return;
  run.event = null;
  if (step.woke) {
    const damage = data.numbers.wakeDamage;
    run.health = Math.max(0, run.health - damage);
    events.push({ type: "giantWake", damage });
    if (run.health <= 0) return endRun(run, "lost", events);
  }
  goToVote(run, events);
}

// Everyone has chosen. Settles the vote, applies the winning option and moves on to the next route vote.
function settleEvent(run: RunState, events: RunEvent[]): void {
  const event = run.event as EventState;
  const result = settleVote(run.rng, run.players.map((id) => event.choices[id]));
  run.rng = result.state;
  const option = event.options[result.winner];
  events.push({ type: "eventOutcome", event: event.id, winner: result.winner, option, counts: result.counts, drawn: result.drawn });
  if (option.type === "toll") {
    run.event = null;
    if (option.action === "fight") {
      run.allRareRewards = true;
      startBattle(run, "elite", events);
      return;
    }
    if (option.action === "pay") {
      for (const id of run.players) {
        if (run.coins[id] < option.amount) throw new Error(`${id} can't pay the toll`);
        run.coins[id] -= option.amount;
        events.push({ type: "coins", player: id, amount: -option.amount });
      }
    } else if (run.position) {
      run.hiddenFloor = floorHiddenAfterTurnBack(run.position.floor, run.map.floors.length);
    }
    goToVote(run, events);
    return;
  }
  if (option.type === "bless") {
    run.blessing = option.spark; // replaces any earlier blessing
  } else if (option.type === "skip") {
    // nothing happens
  } else if (option.type === "player") {
    const domino = event.domino as Domino;
    run.decks[option.player].push(domino.id);
    run.dominoes.push(domino);
  } else if (option.type === "coins") {
    for (const id of run.players) {
      run.coins[id] += option.amount;
      events.push({ type: "coins", player: id, amount: option.amount });
    }
  }
  run.event = null;
  goToVote(run, events);
}

// Validates and applies one buy, remove or done. Throws on anything illegal (the caller works on a copy).
function applyTraderAction(run: RunState, playerId: string, action: TraderAction, events: RunEvent[]): void {
  const trader = run.trader as TraderState;
  const data = run.content.run.trader;
  if (action.kind === "done") {
    trader.done[playerId] = true;
    events.push({ type: "traderDone", player: playerId });
  } else if (action.kind === "buy") {
    const item = trader.stock[playerId].find((d) => d.id === action.domino);
    if (!item) throw new Error(`domino ${action.domino} is not in ${playerId}'s stock`);
    const price = traderPrice(run.content.charms, run.charms[playerId], data.prices[item.rarity as Rarity]);
    if (run.coins[playerId] < price) throw new Error(`${playerId} has ${run.coins[playerId]} coins, ${item.id} costs ${price}`);
    run.coins[playerId] -= price;
    trader.stock[playerId] = trader.stock[playerId].filter((d) => d.id !== item.id);
    run.decks[playerId].push(item.id);
    run.dominoes.push(item);
    events.push({ type: "bought", player: playerId, domino: item.id, price });
  } else if (action.kind === "buyCharm") {
    if (!trader.charmStock[playerId].includes(action.charm)) throw new Error(`charm ${action.charm} is not in ${playerId}'s stock`);
    const price = traderPrice(run.content.charms, run.charms[playerId], data.charmPrice);
    if (run.coins[playerId] < price) throw new Error(`${playerId} has ${run.coins[playerId]} coins, ${action.charm} costs ${price}`);
    run.coins[playerId] -= price;
    trader.charmStock[playerId] = trader.charmStock[playerId].filter((c) => c !== action.charm);
    run.charms[playerId].push(action.charm);
    events.push({ type: "charmBought", player: playerId, charm: action.charm, price });
  } else {
    const deck = run.decks[playerId];
    if (!deck.includes(action.domino)) throw new Error(`domino ${action.domino} is not in ${playerId}'s deck`);
    if (deck.length <= data.minDeckSize) throw new Error(`a deck can't go below ${data.minDeckSize} dominoes`);
    const fee = traderPrice(run.content.charms, run.charms[playerId], run.removalFee[playerId]);
    if (run.coins[playerId] < fee) throw new Error(`${playerId} has ${run.coins[playerId]} coins, removal costs ${fee}`);
    run.coins[playerId] -= fee;
    run.removalFee[playerId] += data.removalFeeStep;
    deck.splice(deck.indexOf(action.domino), 1);
    events.push({ type: "removed", player: playerId, domino: action.domino, fee });
  }
}

function blessedStrength(run: RunState): number {
  const shrine = run.content.events.find((e) => e.id === "spark_shrine");
  if (!shrine) throw new Error("no spark_shrine in data/events.json");
  return shrine.numbers.blessedCharge;
}

function startBattle(run: RunState, type: BattleType, events: RunEvent[]): void {
  const { config, dominoes, enemies } = run.content;
  let enemyId = run.map.bossId;
  if (type !== "boss") {
    const act = currentAct(run);
    const pool = type === "fight" ? act.normalPool : act.elitePool; // this act's enemies only
    const r = nextInt(run.rng, pool.length);
    run.rng = r.state;
    enemyId = pool[r.value];
  }
  const seed = nextUint32(run.rng);
  run.rng = seed.state;

  // Seats rotate one place per battle. A battle's seat order has no effect on its rounds; the first seat is
  // only who the Sleeping Giant's turns start with (startingSeat).
  const shift = run.battlesFought % run.players.length;
  const seats = run.players.slice(shift).concat(run.players.slice(0, shift));
  const seatOrder = seats;
  const result = createBattleWithEvents({
    config,
    content: { dominoes, enemies },
    charms: run.content.charms,
    players: run.players.map((id) => ({ id, deck: run.decks[id], charms: run.charms[id] })),
    seatOrder,
    enemyId,
    seed: seed.value,
    extraDominoes: run.dominoes,
    partyHealth: run.health,
    blessing: run.blessing ? { spark: run.blessing, strength: blessedStrength(run) } : null,
  });
  run.battle = result.state;
  run.battleType = type;
  run.phase = "battle";
  events.push({ type: "battleStart", enemy: enemyId, nodeType: type, seatOrder, partyHealth: run.health });
  events.push(...result.events);
}

function finishBattle(run: RunState, events: RunEvent[]): void {
  const battle = run.battle as BattleState;
  const type = run.battleType as BattleType;
  run.battle = null;
  run.battlesFought++;
  if (type === "boss") run.blessing = null; // the blessing ends with the act's boss fight
  run.health = Math.max(0, battle.party.health);
  if (battle.result === "lost" || run.health <= 0) {
    endRun(run, "lost", events);
    return;
  }
  const earned: Record<string, number> = {};
  const base = currentAct(run).battleCoins[type];
  for (const id of run.players) {
    const amount = base + heldCharmNumber(run.content.charms, run.charms[id], COIN_PURSE, "coins");
    earned[id] = amount;
    run.coins[id] += amount;
    events.push({ type: "coins", player: id, amount });
  }
  if (type === "boss" && run.actIndex + 1 >= run.content.run.acts.length) {
    endRun(run, "won", events);
    return;
  }
  const roll = rollOffers(run.rng, run.players, currentAct(run).rewardOdds[type], run.content.pools, run.nextIndex, run.allRareRewards, run.unlocks);
  run.rng = roll.state;
  run.nextIndex = roll.nextIndex;
  run.reward = roll.reward;
  run.reward.coinsEarned = earned;
  offerCharms(run, type);
  run.phase = "reward";
  events.push({ type: "rewardOffers" });
  for (const id of run.players) {
    if (run.reward.charmOffers[id]) events.push({ type: "charmOffered", player: id, charms: run.reward.charmOffers[id] });
  }
}

// An elite win offers each player normal charms, a boss win rare ones (never one they own); fights offer none.
function offerCharms(run: RunState, type: BattleType): void {
  if (type === "fight" || !run.reward) return;
  const pool = type === "elite" ? "normal" : "rare";
  const roll = rollCharmsForPlayers(run.rng, run.content.charms, pool, run.charms, run.players, run.content.run.charmOffers[type]);
  run.rng = roll.state;
  run.reward.charmOffers = roll.offers;
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
  run.allRareRewards = false;
  if (run.battleType === "boss") {
    // A boss that isn't the last of the run opens the next act.
    run.actIndex++;
    const act = currentAct(run);
    const map = generateActMap(act, run.rng);
    run.rng = map.state;
    run.map = map.value;
    run.position = null;
    run.path = [];
    // The party heals once, before the first vote of the new act.
    const heal = Math.ceil(((run.maxHealth - run.health) * run.content.run.actStartHealPercent) / 100);
    run.health += heal;
    events.push({ type: "actStart", act: act.id, number: run.actIndex + 1, heal, boss: map.value.bossId });
    // A short screen shows the heal and the next boss; Continue (from everyone) opens the map.
    run.battleType = null;
    run.phase = "act";
    run.actStart = { heal, done: [] };
    return;
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
