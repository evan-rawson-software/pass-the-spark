// The co-op bot: picks a battle choice from what a seat can see (its view), using the engine's
// legality (getPendingChoice) and previews (previewPlay). Tooling only, not engine rules.
// Ties are broken with the caller's seeded RNG state, which is passed in and returned.
// Placeholder for the cascade rules: #183 rewrites it.

import { getPendingChoice, previewPlay } from "../src/engine/battle";
import type { Choice } from "../src/engine/battle";
import { nextInt } from "../src/engine/rng";
import type { BattleView } from "../src/engine/view";

// The choice `seat` makes in this view, and the new tie-break RNG state. The seat must be the
// one the battle is waiting on. Plays the legal play with the best preview (caps by total, then
// the charge it passes on); with no play it sets off if it can, else passes.
export function botChoice(view: BattleView, seat: string, rng: number): { choice: Choice; rng: number } {
  const pending = getPendingChoice(view);
  if (pending === null || pending.player !== seat) throw new Error("not this seat's turn");

  const scored: { choice: Choice; key: number[] }[] = [];
  for (const option of pending.plays) {
    for (const end of pending.opener ? [undefined] : option.ends) {
      const pv = previewPlay(view, seat, option.domino, end);
      if (pv) scored.push({ choice: { type: "play", domino: option.domino, end }, key: [pv.total, pv.charge] });
    }
  }
  if (scored.length === 0) return { choice: { type: pending.canSetOff ? "setOff" : "pass" }, rng };
  let best = [scored[0]];
  for (const s of scored.slice(1)) {
    const cmp = s.key[0] - best[0].key[0] || s.key[1] - best[0].key[1];
    if (cmp > 0) best = [s];
    else if (cmp === 0) best.push(s);
  }
  if (best.length === 1) return { choice: best[0].choice, rng };
  const r = nextInt(rng, best.length);
  return { choice: best[r.value].choice, rng: r.state };
}
