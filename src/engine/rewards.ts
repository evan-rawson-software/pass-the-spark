// Post-battle reward offers. Each player gets their own offer and picks one domino or skips.
// Plain data; the run (a later issue) decides when to roll offers and adds the picks to decks.

import { generateDomino, rollRarityFromOdds } from "./generate";
import { unlocksOf } from "./progression";
import type { Domino, Pools, Rarity } from "./types";

export const SKIP = "skip";

export interface RewardState {
  offers: Record<string, Domino[]>; // player id -> offered dominoes
  choices: Record<string, string>; // player id -> picked domino id, or SKIP; absent while undecided
  charmOffers: Record<string, string[]>; // player id -> offered charm ids; no entry when the player is offered no charm
  coinsEarned: Record<string, number>; // player id -> coins the battle just paid them (Coin Purse included)
  charmChoices: Record<string, string>; // player id -> picked charm id, or SKIP; absent while undecided
}

export interface RewardRoll {
  reward: RewardState;
  state: number; // RNG state after rolling
  nextIndex: number; // next unused generated-domino index
}

export function rollOffers(
  state: number,
  playerIds: string[],
  odds: Record<Rarity, number>, // the act's rarity weights for this battle type
  pools: Pools,
  startIndex: number,
  allRare = false, // every offered domino is rare (the Toll Bridge's hard fight)
  unlocks: Record<string, string[]> | undefined = undefined, // player id -> unlock ids; none: everything unlocked
): RewardRoll {
  const offers: Record<string, Domino[]> = {};
  let s = state;
  let index = startIndex;
  for (const playerId of playerIds) {
    const offer: Domino[] = [];
    for (let i = 0; i < pools.offerSize; i++) {
      const rarity = allRare ? { value: "rare" as const, state: s } : rollRarityFromOdds(s, odds);
      s = rarity.state;
      const domino = generateDomino(s, rarity.value, pools, index, unlocksOf(unlocks, playerId));
      s = domino.state;
      index++;
      offer.push(domino.value);
    }
    offers[playerId] = offer;
  }
  return { reward: { offers, choices: {}, charmOffers: {}, charmChoices: {}, coinsEarned: {} }, state: s, nextIndex: index };
}

// choice is a domino id from the player's offer, or SKIP. Returns a new state; a choice is final.
export function submitRewardChoice(reward: RewardState, playerId: string, choice: string): RewardState {
  const offer = reward.offers[playerId];
  if (!offer) throw new Error("no offer for player " + playerId);
  if (reward.choices[playerId] !== undefined) throw new Error("player " + playerId + " already chose");
  if (choice !== SKIP && !offer.some((d) => d.id === choice)) throw new Error("domino " + choice + " is not in the offer");
  return { ...reward, choices: { ...reward.choices, [playerId]: choice } };
}

// The run moves on once everyone has picked or skipped.
export function isRewardComplete(reward: RewardState): boolean {
  return Object.keys(reward.offers).every((id) => reward.choices[id] !== undefined) && Object.keys(reward.charmOffers).every((id) => reward.charmChoices[id] !== undefined);
}

// The dominoes players picked, to add to their decks (and to the battle's extraDominoes).
export function pickedDominoes(reward: RewardState): Record<string, Domino> {
  const out: Record<string, Domino> = {};
  for (const id of Object.keys(reward.offers)) {
    const choice = reward.choices[id];
    const domino = reward.offers[id].find((d) => d.id === choice);
    if (domino) out[id] = domino;
  }
  return out;
}

// choice is a charm id from the player's charm offer, or SKIP. A choice is final.
export function submitCharmChoice(reward: RewardState, playerId: string, choice: string): RewardState {
  const offer = reward.charmOffers[playerId];
  if (!offer) throw new Error("no charm offer for player " + playerId);
  if (reward.charmChoices[playerId] !== undefined) throw new Error("player " + playerId + " already chose a charm");
  if (choice !== SKIP && !offer.includes(choice)) throw new Error("charm " + choice + " is not in the offer");
  return { ...reward, charmChoices: { ...reward.charmChoices, [playerId]: choice } };
}
