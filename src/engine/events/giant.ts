// The Sleeping Giant (push your luck, in turn). Plain functions over the event's own state and the
// seeded RNG; the run applies the coins and the damage this returns.

import { nextFloat } from "../rng";
import type { EventData } from "../types";

// The grab. Option indices into the event's options: 0 is Grab, 1 is Stop.
export const GRAB = 0;
export const STOP = 1;

export interface GiantState {
  turn: string; // whose decision it is
  wakePercent: number; // the chance the next grab wakes the Giant, shown before every decision
  grabbed: Record<string, number>; // coins each player has grabbed so far
  stopped: string[]; // players who are out
  woke: boolean;
}

// Starts at the first seat and goes round in seat order (the run's player order).
export function openGiant(data: EventData, players: string[], firstSeat: string): GiantState {
  const grabbed: Record<string, number> = {};
  for (const id of players) grabbed[id] = 0;
  return { turn: firstSeat, wakePercent: data.numbers.wakeStartPercent, grabbed, stopped: [], woke: false };
}

export interface GiantStep {
  giant: GiantState;
  state: number; // the RNG after the step
  coins: number; // coins the player gets now
  woke: boolean; // the Giant woke: the party takes damage and the event ends
  ended: boolean; // the event is over (woke, or everyone has stopped)
}

// One decision from the player whose turn it is. Works on a copy of the state.
export function stepGiant(giant: GiantState, data: EventData, players: string[], player: string, option: number, rng: number): GiantStep {
  if (player !== giant.turn) throw new Error(`it is not ${player}'s turn`);
  const next: GiantState = JSON.parse(JSON.stringify(giant));
  let state = rng;
  let coins = 0;
  if (option === STOP) {
    next.stopped.push(player);
  } else {
    const r = nextFloat(state);
    state = r.state;
    if (r.value * 100 < giant.wakePercent) {
      next.woke = true;
    } else {
      coins = data.numbers.grabCoins;
      next.grabbed[player] += coins;
      next.wakePercent = Math.min(100, giant.wakePercent + data.numbers.wakeStepPercent);
    }
  }
  const ended = next.woke || next.stopped.length === players.length;
  if (!ended) {
    let i = players.indexOf(player);
    do i = (i + 1) % players.length;
    while (next.stopped.includes(players[i]));
    next.turn = players[i];
  }
  return { giant: next, state, coins, woke: next.woke, ended };
}
