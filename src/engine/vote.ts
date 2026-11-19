// Settling a party vote: a unanimous vote wins; otherwise the result is drawn at random from the
// votes cast, weighted by count (3 votes for A and 1 for B gives A a 75% chance). Uses the run RNG.
import { nextInt } from "./rng";

export interface VoteResult {
  winner: number;
  counts: Record<number, number>; // option -> number of votes
  drawn: boolean; // false when the vote was unanimous
  state: number; // the RNG state after the draw
}

// votes: one voted option per player.
export function settleVote(state: number, votes: number[]): VoteResult {
  const counts: Record<number, number> = {};
  for (const v of votes) counts[v] = (counts[v] ?? 0) + 1;
  const options = Object.keys(counts).map(Number).sort((a, b) => a - b);
  if (options.length === 1) return { winner: options[0], counts, drawn: false, state };
  const r = nextInt(state, votes.length);
  let pick = r.value;
  for (const option of options) {
    if (pick < counts[option]) return { winner: option, counts, drawn: true, state: r.state };
    pick -= counts[option];
  }
  throw new Error("unreachable: the draw is below the number of votes");
}
