// How the sims drive a build: the seats take turns round-robin, each asked what it would do now, until
// every seat is Ready (the engine then fires the cascade). Tooling, not engine rules.

import type { BattleState, Choice } from "../src/engine/battle";
import { getView } from "../src/engine/view";
import type { BattleView } from "../src/engine/view";

// A battle bot: what `seat` does now, or null when it has to wait for another seat to place first
// (the planning bot builds in the plan's order). The RNG state is for tie-breaks; it is returned.
export type BattleBot = (view: BattleView, seat: string, rng: number) => { choice: Choice | null; rng: number };

export interface SeatChoice {
  player: string;
  choice: Choice;
  seat: number; // the index in seatOrder, to pass as `last` next time
  rng: number;
}

// Asks the seats in turn, starting after seat index `last`, and returns the first choice. Seats that are
// Ready are skipped. Throws when every seat waits (a bot bug: the table would be stuck).
export function nextSeatChoice(state: BattleState, last: number, bot: BattleBot, rng: number): SeatChoice {
  const n = state.seatOrder.length;
  for (let k = 1; k <= n; k++) {
    const seat = (last + k) % n;
    const id = state.seatOrder[seat];
    if (state.players.find((p) => p.id === id)!.ready) continue;
    const r = bot(getView(state, id), id, rng);
    rng = r.rng;
    if (r.choice !== null) return { player: id, choice: r.choice, seat, rng };
  }
  throw new Error("every seat is waiting or Ready, but the cascade has not fired");
}
