// The Trader. Each player gets their own stock of generated dominoes, rolled once on arrival.
// Plain data; the run applies buy, remove and done choices and moves on when everyone is done.

import { generateDomino, rollRarityFromOdds } from "./generate";
import type { Domino, Pools, TraderData } from "./types";

export interface TraderState {
  stock: Record<string, Domino[]>; // player id -> dominoes still for sale (a bought one leaves the stock)
  done: Record<string, boolean>; // player id -> pressed done
}

export interface TraderRoll {
  trader: TraderState;
  state: number; // RNG state after rolling
  nextIndex: number; // next unused generated-domino index
}

export function rollStock(state: number, playerIds: string[], data: TraderData, pools: Pools, startIndex: number): TraderRoll {
  const stock: Record<string, Domino[]> = {};
  const done: Record<string, boolean> = {};
  let s = state;
  let index = startIndex;
  for (const playerId of playerIds) {
    const items: Domino[] = [];
    for (let i = 0; i < data.stockSize; i++) {
      const rarity = rollRarityFromOdds(s, data.rarityOdds);
      s = rarity.state;
      const domino = generateDomino(s, rarity.value, pools, index);
      s = domino.state;
      index++;
      items.push(domino.value);
    }
    stock[playerId] = items;
    done[playerId] = false;
  }
  return { trader: { stock, done }, state: s, nextIndex: index };
}
