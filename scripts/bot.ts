// The co-op bot: a yardstick, not a strong player. It scores every legal choice (a play on each
// end, pass) from what a seat can see: getPendingChoice for legality, previewPlay and
// the view's openEnds for what a play does, previewCascade for what the cascade would do, and the
// view's intent and party block for how much block is worth. It never reads hidden state.
// Tooling only, not engine rules. Ties are broken with the caller's seeded RNG state, which is
// passed in and returned.
//
// Scores are in "points of damage". Higher is better.
//   amplifier:  the extra charge it adds to its path, times a base cap value we still expect to land
//               (we expect a cap to land if we hold one, so the charge is not wasted)
//   junction:   a new path to cap, valued like a cap landing at the charge it carries
//   cap:        damage is worth its value; block is worth its value up to what the intent will still
//               deal after block already in place (surplus block is worth little).
//               Capping a strongly charged end earns a bonus per point of charge above 1, on top of its value
//               The cap on the last open end sets the chain off, so it is scored like the cascade
//   pass:       a small cost (it gives the turn away). With a cap on the board, passing is how the bot
//               asks for the cascade: lethal wins; otherwise what the cascade is worth, minus a fizzle
//               penalty for the charge on every end it would leave uncapped

import { getPendingChoice, previewCascade, previewPlay, previewSetOff } from "../src/engine/battle";
import type { Choice } from "../src/engine/battle";
import { nextInt } from "../src/engine/rng";
import type { BattleView } from "../src/engine/view";
import type { CapEffectKind } from "../src/engine/types";

const BASE_CAP_VALUE = 3; // what a cap we expect to land is worth per point of charge
const EXPECTED_CAPS = 2; // at most this many caps in hand count toward the value of building charge
const CHARGED_END_BONUS = 1; // per point of charge above 1 on an end a cap goes on
const SURPLUS_BLOCK_WEIGHT = 0.25; // block beyond what the intent will deal
const CARRY_WEIGHT = 0.1; // per point of charge an amplifier or junction passes on
const PASS_COST = 0.5;
const FIZZLE_WEIGHT = 0.5; // per point of charge on an end the cascade would leave uncapped, times the base cap value
const SET_OFF_SHARE = 0.5; // how much of the cascade's worth ending the round counts for
const LETHAL = 1000;

// What the enemy's intent will deal to the party, before block.
function incomingAttack(view: BattleView): number {
  let total = 0;
  for (const a of view.intent.actions) if (a.kind === "attack") total += a.value * (a.hits ?? 1);
  return total;
}

// The choice `seat` makes in this view, and the new tie-break RNG state. The seat must be the
// one the battle is waiting on.
export function botChoice(view: BattleView, seat: string, rng: number): { choice: Choice; rng: number } {
  const pending = getPendingChoice(view);
  if (pending === null || pending.player !== seat) throw new Error("not this seat's turn");

  const cascade = previewCascade(view);
  // Block the party can still use: what the intent deals, less block already in place or already on the board.
  const blockNeeded = Math.max(0, incomingAttack(view) - view.party.block - cascade.block);
  const worth = cascade.damage + Math.min(cascade.block, Math.max(0, incomingAttack(view) - view.party.block));
  const hand = view.players.find((p) => p.id === seat)!.hand;
  const capsInHand = hand.filter((id) => view.dominoes.find((d) => d.id === id)?.kind === "cap").length;
  const expected = Math.min(capsInHand, EXPECTED_CAPS); // caps we can still put on the paths we build

  let passScore = -PASS_COST;
  if (previewSetOff(view)?.canSetOff) {
    const lethal = cascade.damage >= view.enemy.health;
    const fizzled = view.openEnds.reduce((sum, e) => sum + e.charge, 0);
    passScore = lethal ? LETHAL : SET_OFF_SHARE * worth - FIZZLE_WEIGHT * BASE_CAP_VALUE * fizzled;
  }
  const scored: { choice: Choice; score: number }[] = [{ choice: { type: "pass" }, score: passScore }];

  for (const option of pending.plays) {
    const domino = view.dominoes.find((d) => d.id === option.domino)!;
    for (const end of pending.opener ? [undefined] : option.ends) {
      const pv = previewPlay(view, seat, option.domino, end);
      if (!pv) continue;
      const before = end === undefined ? 1 : view.openEnds.find((e) => e.end === end)!.charge;
      let score: number;
      if (domino.kind === "cap") {
        const kind: CapEffectKind = domino.effect!.kind;
        let value = pv.total;
        if (kind === "block") value = Math.min(pv.total, blockNeeded) + SURPLUS_BLOCK_WEIGHT * Math.max(0, pv.total - blockNeeded);
        score = value + CHARGED_END_BONUS * (pv.charge - 1);
        if (view.openEnds.length === 1) {
          // The last open end: this cap sets the chain off, so it counts like the cascade (lethal wins).
          const lethal = kind === "damage" && cascade.damage + pv.total >= view.enemy.health;
          score = lethal ? LETHAL : SET_OFF_SHARE * (worth + score);
        }
      } else {
        const paths = domino.kind === "junction" ? 2 : 1;
        // An amplifier is worth its extra charge on a path we can still cap; a junction opens a new path to cap.
        const built = BASE_CAP_VALUE * (pv.charge - before) * paths * expected;
        const branch = domino.kind === "junction" && capsInHand > 1 ? BASE_CAP_VALUE * pv.charge : 0;
        score = built + branch + CARRY_WEIGHT * pv.charge * paths;
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
