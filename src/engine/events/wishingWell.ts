// The Wishing Well (personal): a player turns over a random domino from their own deck (the run's
// RNG, host only); its output spark decides the prize, which data/events.json keys by spark. With two
// outputs the player picks which one counts. The prize may need one more pick (a domino to remove or
// upgrade, a rare to take), so each player has a small state in event.wells until they finish.
// Every step is an ordinary personal choice: option 1 (turn over) with no pick, then option 1 again
// with the pick the stage asks for. Skip (option 0) ends it at any stage with no prize.
// Prize kinds: "coins" (numbers.coinPrize), "remove" (free removal), "upgrade" (a free upgrade, or
// numbers.fallbackCoins when nothing can be upgraded; a removal pays them too when the deck is at its minimum size), "rare" (an offer of rares, pick one).

import type { RunState } from "../run";
import { rollOffers } from "../rewards";
import { nextInt } from "../rng";
import { getUpgradeOptions, previewUpgrade } from "../upgrades";
import type { Domino, EventData, Spark, UpgradeSide } from "../types";
import type { EventPick, PersonalHandler, PersonalResult } from "./personal";

export type PrizeKind = "coins" | "remove" | "upgrade" | "rare";
export const PRIZE_KINDS: PrizeKind[] = ["coins", "remove", "upgrade", "rare"];

// One player's progress; open to everyone.
export interface WellState {
  domino: Domino; // the domino turned over (a copy)
  spark: Spark | null; // the output spark that counts; null until chosen (only when it has two outputs)
  offers: Domino[] | null; // the rare offer, for a rare prize
}

// What the player has to do next, for the screen.
export type WellStage = "turn" | "spark" | "remove" | "upgrade" | "rare";

function data(run: RunState): EventData {
  const d = run.content.events.find((e) => e.id === "wishing_well");
  if (!d) throw new Error("no wishing_well in data/events.json");
  return d;
}

export function prizeFor(run: RunState, spark: Spark): PrizeKind {
  return (data(run).prizes as Record<string, string>)[spark] as PrizeKind;
}

export function wellStage(run: RunState, player: string): WellStage {
  const well = run.event?.wells?.[player];
  if (!well) return "turn";
  if (well.spark === null) return "spark";
  return prizeFor(run, well.spark) as WellStage;
}

// The ways one domino of the player's deck can be upgraded (none when it can't).
export function upgradeChoices(run: RunState, player: string, id: string): { side: UpgradeSide; spark?: Spark }[] {
  const o = getUpgradeOptions(run, player, id);
  return [...o.left.map((spark) => ({ side: "left" as const, spark })), ...(o.right ? [{ side: "right" as const }] : [])];
}

function canRemove(run: RunState, player: string): boolean {
  return run.decks[player].length > run.content.run.trader.minDeckSize;
}

function find(run: RunState, id: string): Domino {
  return run.dominoes.find((d) => d.id === id) as Domino;
}

function done(well: WellState, prize: PrizeKind | "none", coins: number, before: Domino[], after: Domino | null): PersonalResult {
  return { action: "wish", cost: 0, before, after, wish: { turned: well.domino, spark: well.spark, prize, coins } };
}

// The spark that counts is known: pay a prize that needs nothing more, or wait for the pick.
function settle(run: RunState, player: string, well: WellState, spark: Spark): PersonalResult | null {
  const numbers = data(run).numbers;
  well.spark = spark;
  const kind = prizeFor(run, spark);
  if (kind === "coins") {
    run.coins[player] += numbers.coinPrize;
    return done(well, "coins", numbers.coinPrize, [], null);
  }
  const fallback = () => {
    run.coins[player] += numbers.fallbackCoins;
    return done(well, "coins", numbers.fallbackCoins, [], null);
  };
  if (kind === "remove") return canRemove(run, player) ? null : fallback(); // deck already at the minimum
  if (kind === "upgrade") return run.decks[player].some((id) => upgradeChoices(run, player, id).length > 0) ? null : fallback();
  const roll = rollOffers(run.rng, [player], run.content.run.acts[run.actIndex].rewardOdds.fight, run.content.pools, run.nextIndex, true, run.unlocks);
  run.rng = roll.state;
  run.nextIndex = roll.nextIndex;
  well.offers = roll.reward.offers[player];
  return null;
}

function apply(run: RunState, player: string, _action: unknown, _cost: number, pick: EventPick | undefined): PersonalResult | null {
  const event = run.event!;
  const well = event.wells?.[player];
  if (!well) {
    if (pick !== undefined) throw new Error("turning a domino over takes no pick");
    const deck = run.decks[player];
    const r = nextInt(run.rng, deck.length);
    run.rng = r.state;
    const turned: WellState = { domino: JSON.parse(JSON.stringify(find(run, deck[r.value]))), spark: null, offers: null };
    (event.wells ??= {})[player] = turned;
    return turned.domino.output.length === 1 ? settle(run, player, turned, turned.domino.output[0]) : null;
  }
  if (!pick) throw new Error("this step needs a pick");
  if (well.spark === null) {
    if (pick.spark === undefined || !well.domino.output.includes(pick.spark)) throw new Error(`pick one of the domino's outputs: ${well.domino.output.join(", ")}`);
    return settle(run, player, well, pick.spark);
  }
  const kind = prizeFor(run, well.spark);
  if (kind === "remove") {
    const id = pick.dominoes?.[0];
    if (pick.dominoes?.length !== 1 || !run.decks[player].includes(id)) throw new Error("pick one domino from your deck");
    if (!canRemove(run, player)) throw new Error("your deck can't get any smaller");
    const removed = find(run, id);
    run.decks[player].splice(run.decks[player].indexOf(id), 1);
    return done(well, "remove", 0, [removed], null);
  }
  if (kind === "upgrade") {
    const id = pick.dominoes?.[0];
    if (pick.dominoes?.length !== 1 || pick.side === undefined) throw new Error("pick one domino and a side");
    const { before, after } = previewUpgrade(run, player, id, pick.side, pick.spark);
    run.decks[player][run.decks[player].indexOf(before.id)] = after.id;
    run.dominoes[run.dominoes.findIndex((d) => d.id === before.id)] = after;
    return done(well, "upgrade", 0, [before], after);
  }
  if (kind === "rare") {
    const taken = well.offers?.find((d) => d.id === pick.offer);
    if (!taken) throw new Error("pick one of the offered dominoes");
    run.decks[player].push(taken.id);
    run.dominoes.push(taken);
    return done(well, "rare", 0, [], taken);
  }
  throw new Error("nothing more to pick");
}

export const wishingWellHandler: PersonalHandler = {
  actions: () => [{ action: "wish", cost: 0 }],
  unavailable: () => null,
  apply,
  // Skipping after turning a domino over keeps what was turned, so the summary can show it.
  skipped(run, player) {
    const well = run.event?.wells?.[player];
    const result: PersonalResult = { action: "skip", cost: 0, before: [], after: null };
    if (well) result.wish = { turned: well.domino, spark: well.spark, prize: "none", coins: 0 };
    return result;
  },
};
