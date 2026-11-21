// The co-op bot: a yardstick, not a strong player. It scores every legal choice (a play on each
// end, pass, set off) from what a seat can see: getPendingChoice for legality, previewPlay and
// the view's openEnds for what a play does, previewCascade for what setting off would do. It never
// reads hidden state. Tooling only, not engine rules. Ties are broken with the caller's seeded RNG
// state, which is passed in and returned.
//
// Score of a choice (higher is better):
//   cap:        the damage/block/coins it adds (its total), plus the charge it catches, so a
//               strongly charged end is worth capping before it fizzles
//   amplifier:  the charge it adds to its path, plus a little for the charge it carries on
//   junction:   a small bonus for a new branch, plus the charge it adds on both branches
//   pass:       a small cost (it gives the turn away)
//   set off:    lethal now wins; otherwise minus the charge on ends that would fizzle

import { getPendingChoice, previewCascade, previewPlay } from "../src/engine/battle";
import type { Choice } from "../src/engine/battle";
import { nextInt } from "../src/engine/rng";
import type { BattleView } from "../src/engine/view";

const CAP_CHARGE_WEIGHT = 1; // per point of charge a cap catches
const CHARGE_WEIGHT = 2; // per point of charge an amplifier or junction adds, per branch
const CARRY_WEIGHT = 0.1; // per point of charge an amplifier or junction passes on
const BRANCH_BONUS = 3; // a junction's new branch
const PASS_COST = 0.5;
const FIZZLE_WEIGHT = 1; // per point of charge on an end set off would leave uncapped
const LETHAL = 1000;

// The choice `seat` makes in this view, and the new tie-break RNG state. The seat must be the
// one the battle is waiting on.
export function botChoice(view: BattleView, seat: string, rng: number): { choice: Choice; rng: number } {
  const pending = getPendingChoice(view);
  if (pending === null || pending.player !== seat) throw new Error("not this seat's turn");

  const scored: { choice: Choice; score: number }[] = [{ choice: { type: "pass" }, score: -PASS_COST }];

  if (pending.canSetOff) {
    const cascade = previewCascade(view);
    const lethal = cascade.damage >= view.enemy.health;
    const fizzling = view.openEnds.reduce((sum, e) => sum + e.charge, 0);
    scored.push({ choice: { type: "setOff" }, score: lethal ? LETHAL : -FIZZLE_WEIGHT * fizzling });
  }

  for (const option of pending.plays) {
    for (const end of pending.opener ? [undefined] : option.ends) {
      const pv = previewPlay(view, seat, option.domino, end);
      if (!pv) continue;
      const open = end === undefined ? undefined : view.openEnds.find((e) => e.end === end);
      const before = open ? open.charge : 1;
      let score: number;
      const kind = view.dominoes.find((d) => d.id === option.domino)?.kind;
      if (kind === "cap") {
        score = pv.total + CAP_CHARGE_WEIGHT * pv.charge; // a cap
      } else {
        const isJunction = kind === "junction";
        const fed = isJunction ? 2 : 1; // paths the charge feeds
        score = CHARGE_WEIGHT * (pv.charge - before) * fed + CARRY_WEIGHT * pv.charge * fed + (isJunction ? BRANCH_BONUS : 0);
      }
      scored.push({ choice: { type: "play", domino: option.domino, end }, score });
    }
  }

  let best = [scored[0]];
  for (const s of scored.slice(1)) {
    if (s.score > best[0].score) best = [s];
    else if (s.score === best[0].score) best.push(s);
  }
  if (best.length === 1) return { choice: best[0].choice, rng };
  const r = nextInt(rng, best.length);
  return { choice: best[r.value].choice, rng: r.state };
}
