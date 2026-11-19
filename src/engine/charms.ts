// Charms outside combat: who can be offered what, and the run-side charms (Coin Purse, Haggler).
// Plain functions over plain data. Held charms live in run.charms (player id -> charm ids).

import type { Charm, CharmPool } from "./types";
import { nextInt } from "./rng";

export const COIN_PURSE = "coin_purse";
export const HAGGLER = "haggler";

export interface CharmRoll {
  ids: string[]; // different charms from the pool, none of them owned
  state: number; // RNG state after rolling
}

// Up to `count` different charms of a pool the player doesn't own (fewer when not enough are left).
export function rollCharms(state: number, charms: Charm[], pool: CharmPool, owned: string[], count: number): CharmRoll {
  const left = charms.filter((c) => c.pool === pool && !owned.includes(c.id)).map((c) => c.id);
  const ids: string[] = [];
  let s = state;
  while (ids.length < count && left.length > 0) {
    const r = nextInt(s, left.length);
    s = r.state;
    ids.push(left.splice(r.value, 1)[0]);
  }
  return { ids, state: s };
}

// One roll per player, in player order. Players with nothing left to be offered get no entry.
export function rollCharmsForPlayers(state: number, charms: Charm[], pool: CharmPool, held: Record<string, string[]>, players: string[], count: number): { offers: Record<string, string[]>; state: number } {
  const offers: Record<string, string[]> = {};
  let s = state;
  for (const id of players) {
    const roll = rollCharms(s, charms, pool, held[id], count);
    s = roll.state;
    if (roll.ids.length > 0) offers[id] = roll.ids;
  }
  return { offers, state: s };
}

export function charmById(charms: Charm[], id: string): Charm {
  const charm = charms.find((c) => c.id === id);
  if (!charm) throw new Error("unknown charm " + id);
  return charm;
}

// The number a held charm gives its owner, or 0 when they don't hold it.
export function heldCharmNumber(charms: Charm[], held: string[], id: string, key: string): number {
  return held.includes(id) ? charmById(charms, id).numbers[key] : 0;
}

// What a Trader item (domino, charm or removal) costs this player right now: Haggler takes a percentage off, rounded down.
export function traderPrice(charms: Charm[], held: string[], base: number): number {
  const percent = heldCharmNumber(charms, held, HAGGLER, "discountPercent");
  return Math.floor((base * (100 - percent)) / 100);
}
