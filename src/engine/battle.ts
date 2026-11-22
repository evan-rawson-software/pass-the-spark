// Battle state, setup and round flow for the branching cascade. Plain functions over plain data.
// Everyone builds one tree of dominoes at the same time, each from their own hand and within their own
// placements. When every player is Ready it goes off in one cascade, then the enemy carries out its intent.
// step never changes its input: it works on a JSON copy.

import { nextInt, shuffle } from "./rng";
import { validateDominoes } from "./validate";
import type { GameEvent } from "./events";
import type { BattleView, OpenEndView } from "./view";
import { capBonus, capExtraTriggers, handSizeBonus, junctionRunnerBlock, outputsOf, throughNode } from "./battleCharms";
import { passiveOf, rollIntentId } from "./enemy";
import type { CapEffect, Charm, Config, DeckList, Domino, Enemy, Intent, Passive, Pattern, Spark } from "./types";

export interface Content {
  dominoes: Domino[];
  enemies: Enemy[];
}

// An intent as it is in round `round`: the enemy's data intent with Smolder's growth for that round added.
function intentFor(enemy: Pick<EnemyState, "intents" | "passives">, id: string, round: number): Intent {
  const intent: Intent = JSON.parse(JSON.stringify(enemy.intents.find((i) => i.id === id)));
  const smolder = passiveOf(enemy, "smolder");
  if (smolder) addToAttacks(intent, smolder.growth * (round - 1));
  return intent;
}

// The intents of the `count` rounds after the current one (Spyglass shows them to its holder), exactly
// as they will be: they are already rolled, with Smolder's growth for those rounds. Long Night's growth is not
// included, since it only exists once the round's cascade is known.
export function upcomingIntents(state: Pick<BattleState, "enemy" | "round" | "config" | "players">, count: number): Intent[] {
  return state.enemy.queue.slice(1, 1 + count).map((id, i) => scaledIntent(state, intentFor(state.enemy, id, state.round + 1 + i)));
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
  placements: number; // dominoes this player may have on the board in a round: the party total divided by the party size, rounded down
  ready: boolean; // while Ready a player can't place or take back; the cascade fires when every player is Ready
}

export interface EnemyState {
  id: string;
  health: number;
  maxHealth: number;
  block: number; // gained from an intent; absorbs damage in the next cascade, then resets
  line: number; // the combo total that staggers the enemy (data)
  staggered: boolean; // the cascade reached the line this round: each attack hit is halved; clears at round end
  // Copied from the enemy's data, with the state the pattern needs.
  intents: Intent[];
  pattern: Pattern;
  passives: Passive[];
  // Intent ids already rolled: this round's first, then the upcoming rounds' (Spyglass reads these).
  queue: string[];
  rolled: number; // how many intents have been rolled so far
  lastIntent: string | null; // the last one rolled
  repeats: number; // how many in a row of that one
}

export interface PartyState {
  health: number;
  maxHealth: number;
  block: number;
}

// A domino on the board. end is the end it is attached to (null for the opener); depth counts steps from the opener.
// Nodes are stored in creation order, which is placement order, and a node is always created after the node it
// hangs from. Ids are stable: a node keeps its id when another is taken back, so ids rise in creation order
// but can have gaps. Always look a node up by id, never by position.
export interface BoardNode {
  id: number; // from board.nextNode; never reused
  domino: string;
  owner: string;
  end: number | null;
  depth: number;
}

// An output of a node. It is open when no node is attached to it.
export interface BoardEnd {
  id: number; // from board.nextEnd; never reused
  node: number;
  index: number; // which of the node's outputs
  spark: Spark;
}

export interface Board {
  nodes: BoardNode[];
  ends: BoardEnd[];
  // The ids the next node and the next end get. They only rise, so an id a take-back freed is never reused and a
  // choice built on an older view can't land on something else. Missing in older saves: max id + 1 then.
  nextNode: number;
  nextEnd: number;
}

export interface BattleState {
  config: Config;
  dominoes: Domino[];
  charmDefs: Charm[]; // the charm data the players' charm ids refer to
  rng: number;
  seatOrder: string[]; // players only; it has no effect on a round, it is the order views and sims list them in
  round: number;
  phase: "build" | "over";
  board: Board;
  intent: Intent; // what the enemy will do after this round's cascade (passive growth is added once known)
  locked: Spark | null; // the Warden's lock this round: players cannot attach to open ends of this spark
  party: PartyState;
  players: PlayerState[]; // in seat order
  enemy: EnemyState;
  result: "won" | "lost" | null;
  blessing: { spark: Spark; strength: number } | null; // set by the run (Spark Shrine): a domino attached to this spark adds `strength` charge after its own change
}

export interface PlayOption {
  domino: string;
  ends: number[]; // open ends it can attach to; empty for the opener
}

// What one player can do right now. Every player acts at the same time, so there is one of these per player.
export interface PlayerChoices {
  player: string;
  opener: boolean; // the board is empty: a placement is an amplifier or junction without an end
  placementsLeft: number; // placements this player has not used this round (a take-back gives one back)
  ready: boolean;
  plays: PlayOption[]; // empty while Ready or with no placements left
  takeBacks: number[]; // this player's nodes with nothing attached to their outputs; empty while Ready
  canToggleReady: boolean; // Ready can be set to the other value (setting it to the value it has is an error)
}

// Every choice names its player. The engine throws on an illegal one.
export type Choice =
  | { type: "play"; player: string; domino: string; end?: number } // end is omitted for the opener
  | { type: "takeBack"; player: string; node: number } // one of the player's own nodes
  | { type: "ready"; player: string; ready: boolean };

export interface BattleSetup {
  config: Config;
  content: Content;
  players: PlayerSetup[];
  seatOrder: string[];
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

  const extra = validateDominoes(setup.extraDominoes ?? [], "extraDominoes");
  for (const d of extra) {
    if (content.dominoes.some((x) => x.id === d.id)) throw new Error("extra domino id already exists: " + d.id);
  }
  const partyHealth = setup.partyHealth ?? config.partyMaxHealth;
  if (!(partyHealth > 0 && partyHealth <= config.partyMaxHealth)) throw new Error("partyHealth must be above 0 and at most max health");

  const enemyHealth = enemyStartingHealth(config, enemyDef, seatOrder.length);
  const placements = Math.floor(config.partyPlacements / seatOrder.length);

  let rng = setup.seed;
  const players: PlayerState[] = [];
  for (const id of seatOrder) {
    const p = setup.players.find((x) => x.id === id);
    if (!p || p.deck.length === 0) throw new Error("player needs a deck: " + id);
    const s = shuffle(rng, p.deck);
    rng = s.state;
    players.push({ id, deck: s.value, hand: [], discard: [], charms: (p.charms ?? []).slice(), placements, ready: false });
  }

  const state: BattleState = {
    config,
    dominoes: [...content.dominoes, ...extra],
    charmDefs: setup.charms ?? [],
    rng,
    seatOrder,
    round: 0,
    phase: "build",
    board: { nodes: [], ends: [], nextNode: 0, nextEnd: 0 },
    intent: { id: "", actions: [] },
    locked: null,
    party: { health: partyHealth, maxHealth: config.partyMaxHealth, block: 0 },
    players,
    enemy: {
      id: enemyDef.id,
      health: enemyHealth,
      maxHealth: enemyHealth,
      block: 0,
      line: enemyDef.line,
      staggered: false,
      intents: JSON.parse(JSON.stringify(enemyDef.intents)),
      pattern: JSON.parse(JSON.stringify(enemyDef.pattern)),
      passives: JSON.parse(JSON.stringify(enemyDef.passives)),
      queue: [],
      rolled: 0,
      lastIntent: null,
      repeats: 0,
    },
    result: null,
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
// can work out what it may do from the view it was sent.
export type PendingInput = Pick<BattleState, "phase" | "players" | "dominoes" | "board" | "config" | "charmDefs" | "locked" | "blessing">;

// The placements a player has not used this round: their share, less the nodes of theirs on the board.
export function placementsLeft(state: Pick<BattleState, "players" | "board">, playerId: string): number {
  return getPlayer(state, playerId).placements - state.board.nodes.filter((n) => n.owner === playerId).length;
}

// What one player can do now; null when the battle is over. The same rules step enforces.
export function getPlayerChoices(state: PendingInput, playerId: string): PlayerChoices | null {
  if (state.phase === "over") return null;
  const player = getPlayer(state, playerId);
  const opener = state.board.nodes.length === 0;
  const left = placementsLeft(state, playerId);
  const plays: PlayOption[] = [];
  if (!player.ready && left > 0) {
    for (const id of unique(player.hand)) {
      const d = getDomino(state, id);
      if (opener) {
        if (d.kind !== "cap") plays.push({ domino: id, ends: [] });
      } else {
        const ends = legalEnds(state, d, player.id);
        if (ends.length > 0) plays.push({ domino: id, ends });
      }
    }
  }
  const takeBacks = player.ready ? [] : state.board.nodes.filter((n) => n.owner === playerId && isLeaf(state.board, n.id)).map((n) => n.id);
  return { player: playerId, opener, placementsLeft: left, ready: player.ready, plays, takeBacks, canToggleReady: true };
}

export function applyChoice(input: BattleState, choice: Choice): BattleState {
  return step(input, choice).state;
}

// Apply a choice. Returns the new state and the events in the order they happened.
export function step(input: BattleState, choice: Choice): StepResult {
  const events: GameEvent[] = [];
  const state: BattleState = JSON.parse(JSON.stringify(input));
  if (state.phase === "over") throw new Error("the battle is over");
  const player = getPlayer(state, choice.player);

  if (choice.type === "ready") {
    if (typeof choice.ready !== "boolean") throw new Error("ready must be true or false");
    if (player.ready === choice.ready) throw new Error(choice.ready ? "already Ready" : "not Ready");
    player.ready = choice.ready;
    events.push({ type: "ready", player: player.id, ready: player.ready });
    if (state.players.every((p) => p.ready)) setOff(state, events);
    return { state, events };
  }

  if (player.ready) throw new Error("a Ready player can't place or take back");
  const legal = getPlayerChoices(state, player.id) as PlayerChoices;
  if (choice.type === "play") {
    if (legal.placementsLeft <= 0) throw new Error("no placements left");
    const option = legal.plays.find((o) => o.domino === choice.domino);
    if (!option) throw new Error("illegal domino");
    if (legal.opener ? choice.end !== undefined : choice.end === undefined || !option.ends.includes(choice.end)) {
      throw new Error("illegal end");
    }
    removeOne(player.hand, choice.domino);
    addNode(state, player.id, getDomino(state, choice.domino), choice.end ?? null, events);
  } else if (choice.type === "takeBack") {
    if (!legal.takeBacks.includes(choice.node)) throw new Error("can't take that node back");
    const node = getNode(state.board, choice.node);
    player.hand.push(node.domino);
    removeFromBoard(state.board, node.id);
    events.push({ type: "takeBack", player: player.id, domino: node.domino, node: node.id });
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
  intake: Spark | null; // the spark of the end the node is attached to (null for the opener)
  bonus: number; // caps: flat bonus per trigger from charms
  extra: number; // caps: extra triggers from charms
  charms: string[]; // the charms of the node's owner that changed this node, for `charm` events
}

// A cap's value per trigger: ceil(base x charge), plus the flat bonus from charms.
function capValue(effect: CapEffect, charge: number, bonus: number): number {
  return Math.ceil(effect.base * charge) + bonus;
}

function capTriggers(config: Config, flow: NodeFlow): number {
  return Math.min(1 + flow.echo + flow.extra, config.triggerCap);
}

// Nodes are in creation order and a parent is always created first, so one pass is enough.
// Charms of each node's owner are included; caps then get their charm bonuses in cascade order.
function computeFlows(state: Pick<BattleState, "board" | "dominoes" | "players" | "charmDefs" | "blessing">): Map<number, NodeFlow> {
  const { nodes } = state.board;
  const flows = new Map<number, NodeFlow>(); // by node id, in creation order
  for (const node of nodes) {
    const d = getDomino(state, node.domino);
    let charge = 1;
    let echo = 0;
    let sparks: Spark[] = [];
    if (node.end !== null) {
      const end = getEnd(state.board, node.end);
      const parent = flows.get(end.node) as NodeFlow;
      charge = parent.out;
      echo = parent.echo;
      sparks = parent.sparks.includes(end.spark) ? parent.sparks : [...parent.sparks, end.spark];
    }
    const through = throughNode(state, node.owner, d, charge, sparks.length, node.end === null);
    const intake = node.end === null ? null : getEnd(state.board, node.end).spark;
    // Spark Shrine: a domino attached to the blessed spark adds charge after its own change (and after charms). A cap goes off at the boosted charge.
    if (intake !== null && state.blessing && intake === state.blessing.spark) {
      if (d.kind === "cap") charge += state.blessing.strength;
      else through.out += state.blessing.strength;
    }
    flows.set(node.id, { charge, out: through.out, echo: echo + through.echo, sparks, intake, bonus: 0, extra: 0, charms: through.charms });
  }
  const firstDone: string[] = [];
  for (const node of cascadeOrder(nodes)) {
    const d = getDomino(state, node.domino);
    if (d.kind !== "cap" || !d.effect) continue;
    const flow = flows.get(node.id) as NodeFlow;
    const bonus = capBonus(state, node.owner, d.effect.kind, flow.intake as Spark);
    const triggers = capExtraTriggers(state, node.owner, flow.intake as Spark, !firstDone.includes(node.owner));
    firstDone.push(node.owner);
    flow.bonus = bonus.bonus;
    flow.extra = triggers.extra;
    flow.charms = [...bonus.charms, ...triggers.charms];
  }
  return flows;
}

// The order the cascade goes off in: by depth from the opener, then in creation order (ids rise in creation order).
function cascadeOrder(nodes: BoardNode[]): BoardNode[] {
  return nodes.slice().sort((a, b) => a.depth - b.depth || a.id - b.id);
}

// A cap that is never played, used to ask what a cap placed on an open end would get.
const PROBE: Domino = { id: "#probe", name: "", kind: "cap", intake: "any", output: [], effect: { kind: "block", base: 0 } };

function getNode(board: Board, id: number): BoardNode {
  return board.nodes.find((n) => n.id === id) as BoardNode;
}

function getEnd(board: Board, id: number): BoardEnd {
  return board.ends.find((e) => e.id === id) as BoardEnd;
}

function openEnds(state: Pick<BattleState, "board">): BoardEnd[] {
  return state.board.ends.filter((e) => !state.board.nodes.some((n) => n.end === e.id));
}

// The open ends with the charge reaching each and the triggers a cap placed there by `player` would get.
export function getOpenEnds(state: Pick<BattleState, "board" | "dominoes" | "config" | "players" | "charmDefs" | "blessing">, player: string): OpenEndView[] {
  return openEnds(state).map((e) => {
    const board: Board = JSON.parse(JSON.stringify(state.board));
    const probe = addToBoard(board, player, PROBE, e.id, []);
    const flow = computeFlows({ ...state, board, dominoes: [...state.dominoes, PROBE] }).get(probe.id) as NodeFlow;
    return { end: e.id, node: e.node, index: e.index, spark: e.spark, charge: flow.charge, triggers: capTriggers(state.config, flow) };
  });
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
  if (opener ? end !== undefined || d.kind === "cap" : end === undefined || !legalEnds(input, d, playerId).includes(end)) return null;
  const board: Board = JSON.parse(JSON.stringify(input.board));
  const node = addToBoard(board, playerId, d, end ?? null, outputsOf(input, playerId, d));
  const flow = computeFlows({ board, dominoes: input.dominoes, players: input.players, charmDefs: input.charmDefs, blessing: input.blessing }).get(node.id) as NodeFlow;
  if (d.kind !== "cap" || !d.effect) return { charge: flow.out, value: 0, triggers: 0, total: 0 };
  const value = capValue(d.effect, flow.charge, flow.bonus);
  const triggers = capTriggers(input.config, flow);
  return { charge: flow.charge, value, triggers, total: value * triggers };
}

// What setting off now would do, in total.
export interface CascadePreview {
  damage: number; // reaching the enemy's health, after its block
  block: number; // gained by the party
  comboTotal: number; // every hit of the cascade, before enemy block
  lineReached: boolean; // the combo total reaches the enemy's line
}

export function previewCascade(input: BattleState | BattleView): CascadePreview {
  const state = { ...JSON.parse(JSON.stringify(input)), rng: 0 } as BattleState;
  const events: GameEvent[] = [];
  const tally = fireCascade(state, events);
  const result: CascadePreview = { damage: 0, block: 0, comboTotal: tally.combo, lineReached: state.enemy.staggered };
  for (const e of events) {
    if (e.type === "damage" && e.side === "enemy") result.damage += e.amount;
    else if (e.type === "block" && e.side === "party") result.block += e.amount;
  }
  return result;
}

// What setting the chain off now would do to both sides, worked out by running the real cascade and
// the real enemy action on a copy (the intent queue and the RNG are not touched). With `play`, the same
// for the board after that play (a hover). Coins are not part of it.
export interface SetOffPreview {
  canSetOff: boolean; // the board is not empty (an empty board fires nothing and only the party side matters)
  damage: number; // reaching the enemy's health, after its block
  comboTotal: number; // every hit of the cascade, before enemy block
  lineReached: boolean; // the combo total reaches the enemy's line: the enemy's attack is halved in partyDamage
  enemyBlockUsed: number; // the enemy's block worn down by the cascade
  enemyBlock: number; // its block after the cascade (the Hoarder's gain included)
  enemyHealth: number;
  lethal: boolean; // the enemy dies in the cascade; nothing after that goes off
  partyBlockGain: number; // block the party gains in the cascade
  partyBlock: number; // the party's block once the cascade is done, before the intent
  partyDamage: number; // health the party loses to the Auditor and the intent, after block
  partyHealth: number;
}

// A working copy of a state or view for a preview, with the board after `play` if given (null when that play is illegal).
function previewCopy(input: BattleState | BattleView, play?: { player: string; domino: string; end?: number }): BattleState | null {
  const copy = JSON.parse(JSON.stringify(input));
  const state = { ...copy, rng: 0, intent: "baseIntent" in copy ? copy.baseIntent : copy.intent } as BattleState;
  if (play) {
    const player = state.players.find((p) => p.id === play.player);
    if (!player || !player.hand.includes(play.domino)) return null;
    const d = getDomino(state, play.domino);
    const opener = state.board.nodes.length === 0;
    if (opener ? play.end !== undefined || d.kind === "cap" : play.end === undefined || !legalEnds(state, d, play.player).includes(play.end)) return null;
    addToBoard(state.board, play.player, d, play.end ?? null, outputsOf(state, play.player, d));
  }
  return state;
}

// What the build shows the party without giving away whether the board is lethal or reaches the line (B8): the
// block the whole board would give, and the health the party would lose to the intent's full, unhalved attack
// after that block. It runs the real cascade and enemy action on a copy where the enemy cannot die and has no
// line to reach, so neither a kill (which stops the cascade and the enemy) nor the stagger changes the numbers.
export function previewBuild(input: BattleState | BattleView, play?: { player: string; domino: string; end?: number }): { block: number; partyDamage: number } | null {
  const state = previewCopy(input, play);
  if (state === null) return null;
  const realHealth = state.party.health;
  const out = 1e9;
  state.enemy.health = out;
  state.enemy.maxHealth = out;
  state.enemy.line = Infinity;
  state.party.health = out;
  const events: GameEvent[] = [];
  const tally = fireCascade(state, events);
  const block = events.reduce((sum, e) => sum + (e.type === "block" && e.side === "party" ? e.amount : 0), 0);
  longNightGrowth(state, tally.caps, events);
  state.enemy.block = 0;
  enemyAct(state, events);
  return { block, partyDamage: Math.min(realHealth, out - state.party.health) };
}

export function previewSetOff(input: BattleState | BattleView, play?: { player: string; domino: string; end?: number }): SetOffPreview | null {
  const state = previewCopy(input, play);
  if (state === null) return null;
  const events: GameEvent[] = [];
  const before = { enemyHealth: state.enemy.health, partyHealth: state.party.health };
  const tally = fireCascade(state, events);
  const enemyBlockUsed = events.reduce((sum, e) => sum + (e.type === "damage" && e.side === "enemy" ? e.blocked : 0), 0);
  const result: SetOffPreview = {
    canSetOff: state.board.nodes.length > 0,
    damage: before.enemyHealth - Math.max(state.enemy.health, 0),
    comboTotal: tally.combo,
    lineReached: state.enemy.staggered,
    enemyBlockUsed,
    enemyBlock: state.enemy.block,
    enemyHealth: Math.max(state.enemy.health, 0),
    lethal: state.result === "won",
    partyBlockGain: events.reduce((sum, e) => sum + (e.type === "block" && e.side === "party" ? e.amount : 0), 0),
    partyBlock: state.party.block,
    partyDamage: 0,
    partyHealth: state.party.health,
  };
  if (!isOver(state)) {
    longNightGrowth(state, tally.caps, events);
    state.enemy.block = 0;
    enemyAct(state, events);
  }
  result.partyHealth = Math.max(state.party.health, 0);
  result.partyDamage = before.partyHealth - result.partyHealth;
  return result;
}

// ---- internals (all mutate the working copy) ----

function legalEnds(state: PendingInput, d: Domino, owner: string): number[] {
  const open = openEnds(state);
  // A junction replaces one open end with its outputs (two, or three with Hall of Mirrors).
  if (d.kind === "junction" && open.length - 1 + outputsOf(state, owner, d).length > state.config.openEndLimit) return [];
  return open.filter((e) => e.spark !== state.locked && (d.intake === "any" || d.intake.includes(e.spark))).map((e) => e.id);
}

function addToBoard(board: Board, owner: string, d: Domino, end: number | null, outputs: Spark[]): BoardNode {
  board.nextNode ??= Math.max(-1, ...board.nodes.map((n) => n.id)) + 1;
  board.nextEnd ??= Math.max(-1, ...board.ends.map((e) => e.id)) + 1;
  const node: BoardNode = {
    id: board.nextNode++,
    domino: d.id,
    owner,
    end,
    depth: end === null ? 0 : getNode(board, getEnd(board, end).node).depth + 1,
  };
  board.nodes.push(node);
  outputs.forEach((spark, index) => board.ends.push({ id: board.nextEnd++, node: node.id, index, spark }));
  return node;
}

// A node nothing hangs from: none of its outputs has a node attached.
function isLeaf(board: Board, nodeId: number): boolean {
  const mine = board.ends.filter((e) => e.node === nodeId).map((e) => e.id);
  return !board.nodes.some((n) => n.end !== null && mine.includes(n.end));
}

// Takes a leaf node off the board with its (open) outputs. Nothing else changes or is renumbered: the end it hung
// from keeps its id and is open again, and the counters are not rewound.
export function removeFromBoard(board: Board, nodeId: number): void {
  board.nodes = board.nodes.filter((n) => n.id !== nodeId);
  board.ends = board.ends.filter((e) => e.node !== nodeId);
}

function addNode(state: BattleState, owner: string, d: Domino, end: number | null, events: GameEvent[]): void {
  const outputs = outputsOf(state, owner, d);
  const node = addToBoard(state.board, owner, d, end, outputs);
  const flow = computeFlows(state).get(node.id) as NodeFlow;
  events.push({
    type: "play",
    player: owner,
    domino: d.id,
    node: node.id,
    end,
    depth: node.depth,
    charge: d.kind === "cap" ? flow.charge : flow.out,
  });
  if (outputs.length > d.output.length) events.push({ type: "charm", player: owner, charm: "hall_of_mirrors" });
}

// Every player is Ready (an empty board is fine: nothing goes off).
// The cascade, then the enemy's action, then the round end.
function setOff(state: BattleState, events: GameEvent[]): void {
  events.push({ type: "setOff", reason: "ready" });
  const tally = fireCascade(state, events);
  if (isOver(state)) return;
  longNightGrowth(state, tally.caps, events);
  // Enemy block from its last intent has had its cascade (even a round where nothing fired).
  state.enemy.block = 0;
  events.push({ type: "blockReset", side: "enemy" });
  enemyAct(state, events);
  if (isOver(state)) return;
  endRound(state, events);
}

// What a cascade added up to: how many different caps went off (a cap that goes off several times counts
// once) and the combo total, the sum of every hit before enemy block.
interface Tally {
  caps: number;
  combo: number;
}

// Steps by depth from the opener; within a step, nodes in creation order. Every domino hits as it lights:
// an amplifier or junction for the charge it passes on, a damage cap for its value per trigger; a block
// cap gives block instead. Open ends fizzle at the end. An empty board fires nothing; a board with no cap still hits.
// Stops the moment the enemy is at 0 health.
function fireCascade(state: BattleState, events: GameEvent[]): Tally {
  const tally: Tally = { caps: 0, combo: 0 };
  if (state.board.nodes.length === 0) return tally;
  const hoarder = passiveOf(state.enemy, "hoarder");
  if (hoarder) {
    const amount = state.board.nodes.length * hoarder.multiplier;
    state.enemy.block += amount;
    events.push({ type: "passive", passive: "hoarder", amount });
    events.push({ type: "block", side: "enemy", amount });
  }
  let lastSpark: Spark | null = null; // the intake spark of the cap trigger just before (Auditor)
  const flows = computeFlows(state);
  const { nodes } = state.board;
  const lastDepth = Math.max(...nodes.map((n) => n.depth));
  for (let depth = 0; depth <= lastDepth; depth++) {
    events.push({ type: "cascadeStep", depth });
    for (const node of cascadeOrder(nodes)) {
      if (node.depth !== depth) continue;
      const d = getDomino(state, node.domino);
      const flow = flows.get(node.id) as NodeFlow;
      const capValueNow = d.kind === "cap" && d.effect ? capValue(d.effect, flow.charge, flow.bonus) : 0;
      const hit = d.kind !== "cap" ? flow.out : d.effect?.kind === "damage" ? capValueNow : 0;
      events.push({ type: "nodeLit", node: node.id, domino: d.id, owner: node.owner, charge: d.kind === "cap" ? flow.charge : flow.out, hit });
      for (const charm of flow.charms) events.push({ type: "charm", player: node.owner, charm });
      if (d.kind === "junction") {
        const block = junctionRunnerBlock(state, node.owner);
        if (block > 0) {
          state.party.block += block;
          events.push({ type: "charm", player: node.owner, charm: "junction_runner" });
          events.push({ type: "block", side: "party", amount: block });
        }
      }
      if (d.kind !== "cap") {
        hitEnemy(state, hit, false, tally, events);
        if (isOver(state)) return tally;
      } else if (d.effect) {
        tally.caps += 1;
        const spark = getEnd(state.board, node.end as number).spark;
        const firstRepeats = lastSpark === spark;
        lastSpark = spark;
        fireCap(state, node, d.effect, capValueNow, capTriggers(state.config, flow), firstRepeats, tally, events);
        if (isOver(state)) return tally;
      }
    }
  }
  for (const e of openEnds(state)) events.push({ type: "fizzle", end: e.id, spark: e.spark, charge: (flows.get(e.node) as NodeFlow).out });
  return tally;
}

// One hit on the enemy: block absorbs it (unless it ignores block), the combo total grows by the whole hit,
// and the first hit that takes the total to the line staggers the enemy for the round. Ends the battle at 0 health.
function hitEnemy(state: BattleState, value: number, ignoresBlock: boolean, tally: Tally, events: GameEvent[]): void {
  const { enemy } = state;
  const blocked = ignoresBlock ? 0 : Math.min(enemy.block, value);
  enemy.block -= blocked;
  enemy.health -= value - blocked;
  events.push({ type: "damage", side: "enemy", amount: value - blocked, blocked });
  tally.combo += value;
  if (!enemy.staggered && tally.combo >= enemy.line) {
    enemy.staggered = true;
    events.push({ type: "lineReached", total: tally.combo, line: enemy.line });
  }
  if (enemy.health <= 0) endBattle(state, "won", events);
}

// Each trigger counts as a cap going off for the Auditor: the first repeats the spark of the cap before
// it only if firstRepeats, and every extra (Echo) trigger repeats the cap's own spark.
function fireCap(state: BattleState, node: BoardNode, effect: CapEffect, value: number, triggers: number, firstRepeats: boolean, tally: Tally, events: GameEvent[]): void {
  events.push({ type: "capFired", node: node.id, domino: node.domino, owner: node.owner, effect: effect.kind, value, triggers });
  for (let i = 0; i < triggers; i++) {
    if (i > 0 || firstRepeats) {
      auditorStrike(state, events);
      if (isOver(state)) return;
    }
    if (effect.kind === "damage") {
      hitEnemy(state, value, effect.ignoresBlock === true, tally, events);
      if (isOver(state)) return;
    } else if (effect.kind === "block") {
      state.party.block += value;
      events.push({ type: "block", side: "party", amount: value });
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
  const before = scaledIntent(state, state.intent);
  addToAttacks(state.intent, longNight.growth * capsFired);
  // The event carries the growth as the party sees it (scaled), so a shown intent can add it on.
  const after = scaledIntent(state, state.intent);
  const i = after.actions.findIndex((a) => a.kind === "attack");
  const amount = i < 0 ? 0 : after.actions[i].value - before.actions[i].value;
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

// Each attack hit halved, rounded down (the stagger). Block actions stay as they are. Returns a copy.
export function halvedIntent(intent: Intent): Intent {
  const copy: Intent = JSON.parse(JSON.stringify(intent));
  for (const a of copy.actions) if (a.kind === "attack") a.value = Math.floor(a.value / 2);
  return copy;
}

// The enemy carries out its intent. A staggered enemy's attack hits are halved last, after growth and the party-size percent.
function enemyAct(state: BattleState, events: GameEvent[]): void {
  const { intent, enemy } = state;
  const full = scaledIntent(state, intent);
  const shown = enemy.staggered ? halvedIntent(full) : full;
  events.push({ type: "enemyAction", intent: shown, fullIntent: full, staggered: enemy.staggered });
  for (const action of shown.actions) {
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
}

// Party block resets, the board goes to its owners' discard piles.
function endRound(state: BattleState, events: GameEvent[]): void {
  state.enemy.staggered = false;
  state.party.block = 0;
  events.push({ type: "blockReset", side: "party" });
  for (const node of state.board.nodes) getPlayer(state, node.owner).discard.push(node.domino);
  const glutton = passiveOf(state.enemy, "glutton");
  if (glutton) {
    const amount = Math.min(glutton.heal, state.enemy.maxHealth - state.enemy.health);
    state.enemy.health += amount;
    if (amount > 0) events.push({ type: "passive", passive: "glutton", amount });
  }
  startRound(state, events);
}

// An intent as the party meets it: each attack hit scaled by the party size's attack percent, rounded
// up, after growth. state.intent itself stays unscaled so growth adds to the data value.
export function scaledIntent(state: Pick<BattleState, "config" | "players">, intent: Intent): Intent {
  const percent = state.config.enemyAttackPercentByPartySize[Math.min(Math.max(state.players.length, 1), 4) - 1];
  const copy: Intent = JSON.parse(JSON.stringify(intent));
  for (const a of copy.actions) if (a.kind === "attack") a.value = Math.ceil((a.value * percent) / 100);
  return copy;
}

// The intent is chosen and shown, then everyone draws up to their hand size (round 1 too). Placements
// are counted from the board, so the empty board gives every player theirs back; every Ready clears.
function startRound(state: BattleState, events: GameEvent[]): void {
  state.round += 1;
  // The counters run on for the whole battle, so an id from an earlier round never matches anything on the new board.
  state.board = { nodes: [], ends: [], nextNode: state.board.nextNode, nextEnd: state.board.nextEnd };
  startPassives(state, events);
  events.push({ type: "roundStart", round: state.round });
  events.push({ type: "intent", intent: scaledIntent(state, state.intent) });
  for (const p of state.players) {
    p.ready = false;
    draw(state, p, p.placements + state.config.handExtra + handSizeBonus(state, p.id), events);
  }
}

// The enemy's intent for the round, then the passives that act at round start (Smolder, Warden).
function startPassives(state: BattleState, events: GameEvent[]): void {
  const { enemy } = state;
  // Keep the queue as long as the largest Spyglass look-ahead in the charm data, plus this round's intent.
  if (state.round > 1) enemy.queue.shift();
  while (enemy.queue.length < lookAhead(state) + 1) state.rng = rollIntentId(enemy, state.rng);
  state.intent = intentFor(enemy, enemy.queue[0], state.round);
  const smolder = passiveOf(enemy, "smolder");
  if (smolder && state.round > 1) events.push({ type: "passive", passive: "smolder", amount: smolder.growth * (state.round - 1) });
  const warden = passiveOf(enemy, "warden");
  if (warden) {
    const pick = nextInt(state.rng, warden.sparks.length);
    state.rng = pick.state;
    state.locked = warden.sparks[pick.value];
    events.push({ type: "passive", passive: "warden", spark: state.locked });
  }
}

// The most rounds ahead any Spyglass in the battle's charm data shows.
function lookAhead(state: Pick<BattleState, "charmDefs">): number {
  return Math.max(0, ...state.charmDefs.filter((c) => c.id === "spyglass").map((c) => c.numbers.rounds));
}

// Draw until the hand is `size` (it can end short when the deck and discard pile run out). An empty deck is reshuffled from the discard pile.
function draw(state: BattleState, p: PlayerState, size: number, events: GameEvent[]): void {
  let drawn: string[] = [];
  const flush = () => {
    if (drawn.length > 0) events.push({ type: "draw", player: p.id, count: drawn.length, dominoes: drawn });
    drawn = [];
  };
  while (p.hand.length < size) {
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
