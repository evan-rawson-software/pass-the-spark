// Plays one whole run with the bot over the engine's public run functions. Run choices other than
// battles follow the sim rules in docs/decisions.md ("Simulation"); every random pick uses the
// seeded RNG, so the same seed and player count always give the same run. Tooling, not engine rules.

import { getView } from "../src/engine/view";
import { applyRunChoice, createRun, getPendingRunChoices } from "../src/engine/run";
import type { RunChoice, RunPendingChoice, RunState } from "../src/engine/run";
import { nextInt } from "../src/engine/rng";
import { getUpgradeOptions } from "../src/engine/upgrades";
import { personalUnavailable } from "../src/engine/events/personal";
import type { EventPick } from "../src/engine/events/personal";
import { dominoUnavailable, repaintChoices } from "../src/engine/events/deckEvents";
import { upgradeChoices, wellSparks, wellStage } from "../src/engine/events/wishingWell";
import { loadContent } from "../src/engine/content";
import { botChoice } from "./bot";
import type { Domino, Rarity, Spark } from "../src/engine/types";

export const content = loadContent();
const RARITY_RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2 };
const TRADER_BUYS = 3;

export interface RunStats {
  players: number;
  result: "won" | "lost" | null; // null: stopped at the step cap
  capped: boolean;
  steps: number;
  actIndex: number; // the act the run ended in (0-based)
  floor: number; // the floor it ended on (the boss is the floor after the last one)
  stop: string; // the stop type it ended at: fight, elite, boss, event, ...
  actsCleared: number; // bosses beaten
  bossHealth: (number | null)[]; // party health entering each act's boss (null: never got there)
  charmsHeld: string[]; // every charm any player held at some point
}

// Seeded random picks; the state is also handed to the bot for its tie-breaks.
class Picker {
  constructor(public state: number) {}
  int(n: number): number {
    const r = nextInt(this.state, n);
    this.state = r.state;
    return r.value;
  }
  one<T>(items: T[]): T {
    return items[this.int(items.length)];
  }
}

function rarityOf(d: Domino): number {
  return RARITY_RANK[d.rarity ?? "common"];
}

function rarest(offer: Domino[], pick: Picker): Domino {
  const top = Math.max(...offer.map(rarityOf));
  return pick.one(offer.filter((d) => rarityOf(d) === top));
}

// A personal event: Skip, or one step of an action with a legal pick.
function personalChoice(run: RunState, player: string, pick: Picker): RunChoice {
  const options = run.event!.options;
  const legal = options.map((_, i) => i).filter((i) => personalUnavailable(run, player, i) === null);
  const option = pick.one(legal);
  const o = options[option];
  if (o.type !== "action") return { type: "event", option };
  const deck = run.decks[player];
  const dominoPick = (ok: (id: string) => boolean): string => pick.one(deck.filter(ok));
  let eventPick: EventPick;
  if (o.action === "flip" || o.action === "copy") {
    eventPick = { dominoes: [dominoPick((id) => dominoUnavailable(run, player, o.action, id) === null)] };
  } else if (o.action === "repaint") {
    const id = dominoPick((d) => repaintChoices(run, player, d).length > 0);
    const c = pick.one(repaintChoices(run, player, id));
    eventPick = { dominoes: [id], half: c.half, slot: c.slot, spark: c.spark };
  } else if (o.action === "weld") {
    const kindOf = (id: string) => run.dominoes.find((d) => d.id === id)!.kind;
    const pairs = deck.filter((id) => kindOf(id) !== "cap" && deck.some((x) => x !== id && kindOf(x) === kindOf(id)));
    const first = pick.one(pairs);
    eventPick = { dominoes: [first, pick.one(deck.filter((id) => id !== first && kindOf(id) === kindOf(first)))] };
  } else {
    // The Wishing Well: each stage is another choice of the same option.
    const stage = wellStage(run, player);
    const well = run.event!.wells?.[player];
    if (stage === "turn") return { type: "event", option };
    if (stage === "spark") eventPick = { dominoes: [], spark: pick.one(wellSparks(run, well!.domino)) };
    else if (stage === "remove") eventPick = { dominoes: [pick.one(deck)] };
    else if (stage === "upgrade") {
      const id = dominoPick((d) => upgradeChoices(run, player, d).length > 0);
      const u = pick.one(upgradeChoices(run, player, id));
      eventPick = { dominoes: [id], side: u.side, spark: u.spark };
    } else eventPick = { dominoes: [], offer: pick.one(well!.offers!).id };
  }
  return { type: "event", option, pick: eventPick };
}

function eventChoice(run: RunState, p: Extract<RunPendingChoice, { type: "event" }>, pick: Picker): RunChoice {
  if (run.event!.kind === "personal") return personalChoice(run, p.player, pick);
  // A party vote (or a Giant grab): any option, except a toll someone in the party can't pay.
  const legal = p.options.map((_, i) => i).filter((i) => {
    const o = p.options[i];
    return !(o.type === "toll" && o.action === "pay" && run.players.some((id) => run.coins[id] < o.amount));
  });
  return { type: "event", option: pick.one(legal) };
}

// Rest below half health, otherwise upgrade a random upgradable domino (rest when there is none).
function restChoice(run: RunState, player: string, pick: Picker): RunChoice {
  if (run.health * 2 < run.maxHealth) return { type: "rest" };
  const ways: { domino: string; side: "left" | "right"; spark?: Spark }[] = [];
  for (const id of run.decks[player]) {
    const o = getUpgradeOptions(run, player, id);
    for (const spark of o.left) ways.push({ domino: id, side: "left", spark });
    if (o.right) ways.push({ domino: id, side: "right" });
  }
  if (ways.length === 0) return { type: "rest" };
  const domino = pick.one([...new Set(ways.map((w) => w.domino))]);
  const w = pick.one(ways.filter((x) => x.domino === domino));
  return { type: "upgrade", domino, side: w.side, spark: w.spark };
}

// Buys random affordable items until nothing is affordable or 3 are bought; never removes.
function traderChoice(run: RunState, p: Extract<RunPendingChoice, { type: "trader" }>, bought: Record<string, number>, pick: Picker): RunChoice {
  const coins = run.coins[p.player];
  const items: RunChoice[] = [];
  if ((bought[p.player] ?? 0) < TRADER_BUYS) {
    for (const d of p.stock) if (p.dominoPrices[d.id] <= coins) items.push({ type: "trader", action: { kind: "buy", domino: d.id } });
    if (p.charmPrice <= coins) for (const c of p.charmStock) items.push({ type: "trader", action: { kind: "buyCharm", charm: c.id } });
  }
  if (items.length === 0) return { type: "trader", action: { kind: "done" } };
  bought[p.player] = (bought[p.player] ?? 0) + 1;
  return pick.one(items);
}

function choose(run: RunState, p: RunPendingChoice, pick: Picker, bought: Record<string, number>): RunChoice {
  switch (p.type) {
    case "vote":
      return { type: "vote", node: pick.one(p.options) };
    case "battle": {
      const b = botChoice(getView(run.battle!, p.player), p.player, pick.state);
      pick.state = b.rng;
      return { type: "battle", choice: b.choice };
    }
    case "reward":
      return { type: "reward", pick: rarest(p.offer, pick).id };
    case "charmReward": {
      const rare = p.offer.filter((c) => c.pool === "rare");
      return { type: "charmReward", pick: pick.one(rare.length > 0 ? rare : p.offer).id };
    }
    case "rest":
      return restChoice(run, p.player, pick);
    case "trader":
      return traderChoice(run, p, bought, pick);
    case "event":
      return eventChoice(run, p, pick);
    case "act":
      return { type: "act" };
  }
}

export function playRun(playerCount: number, seed: number, maxSteps: number): RunStats {
  const players = Array.from({ length: playerCount }, (_, i) => "p" + (i + 1));
  let run = createRun({ players, seed, content });
  const pick = new Picker((seed ^ 0x9e3779b9) >>> 0);
  let bought: Record<string, number> = {};
  const bossHealth: (number | null)[] = content.run.acts.map(() => null);
  const held = new Set<string>();
  let steps = 0;
  let lastPhase = "";
  while (run.phase !== "over" && steps < maxSteps) {
    const pending = getPendingRunChoices(run);
    if (pending.length === 0) throw new Error(`run stalled (seed ${seed}, ${playerCount} players, phase ${run.phase})`);
    const stop = `${run.actIndex}:${run.position?.floor}:${run.phase}`;
    if (stop !== lastPhase) {
      lastPhase = stop;
      bought = {}; // a new stop starts the Trader purchase count again
    }
    run = applyRunChoice(run, pending[0].player, choose(run, pending[0], pick, bought)).run;
    steps += 1;
    if (run.phase === "battle" && run.position?.type === "boss" && bossHealth[run.actIndex] === null) bossHealth[run.actIndex] = run.health;
    for (const id of players) for (const c of run.charms[id]) held.add(c);
  }
  return {
    players: playerCount,
    result: run.result,
    capped: run.phase !== "over",
    steps,
    actIndex: run.actIndex,
    floor: run.position?.floor ?? 0,
    stop: run.position?.type ?? "start",
    actsCleared: run.result === "won" ? content.run.acts.length : run.actIndex,
    bossHealth,
    charmsHeld: [...held],
  };
}
