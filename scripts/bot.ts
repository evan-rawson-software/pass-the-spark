// The co-op bot: a yardstick, not a strong player. Each time it is asked it scores every legal placement
// of its seat (a domino on each end) from what a seat can see: getPlayerChoices for legality, previewPlay
// and the view's openEnds for what a play does, previewCascade for the block already on the board, and the
// view's intent and party block for how much block is worth. It places its best-scoring play while it has
// placements and a play scores above 0, then sets Ready. It never takes back and never reads hidden state.
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

import { getPlayerChoices, previewCascade, previewPlay } from "../src/engine/battle";
import type { Choice } from "../src/engine/battle";
import { nextInt } from "../src/engine/rng";
import { loadContent } from "../src/engine/content";
import type { BattleView } from "../src/engine/view";
import type { CapEffectKind } from "../src/engine/types";

// What a cap we expect to land is worth per point of charge: the starter Strike's damage, read from
// the data (found by name among the starter deck's dominoes, not by position). The Strikes
// are averaged if they ever differ.
const { dominoes, starterDeck } = loadContent();
const strikes = starterDeck.map((id) => dominoes.find((d) => d.id === id)!).filter((d) => d.kind === "cap" && d.name.endsWith(" Strike"));
if (strikes.length === 0) throw new Error("no Strike in the starter deck");
const BASE_CAP_VALUE = strikes.reduce((sum, d) => sum + d.effect!.base, 0) / strikes.length;
const EXPECTED_CAPS = 2; // at most this many caps in hand count toward the value of building charge
const CHARGED_END_BONUS = 1; // per point of charge above 1 on an end a cap goes on
const SURPLUS_BLOCK_WEIGHT = 0.25; // block beyond what the intent will deal
const CARRY_WEIGHT = 0.1; // per point of charge an amplifier or junction passes on

// What the enemy's intent will deal to the party, before block.
function incomingAttack(view: BattleView): number {
  let total = 0;
  for (const a of view.intent.actions) if (a.kind === "attack") total += a.value * (a.hits ?? 1);
  return total;
}

// The choice `seat` makes in this view, and the new tie-break RNG state: its best play, or Ready when it
// has no placements left or nothing scores above 0.
export function botChoice(view: BattleView, seat: string, rng: number): { choice: Choice; rng: number } {
  const pending = getPlayerChoices(view, seat);
  if (pending === null) throw new Error("the battle is over");

  const cascade = previewCascade(view);
  // Block the party can still use: what the intent deals, less block already in place or already on the board.
  const blockNeeded = Math.max(0, incomingAttack(view) - view.party.block - cascade.block);
  const hand = view.players.find((p) => p.id === seat)!.hand;
  const capsInHand = hand.filter((id) => view.dominoes.find((d) => d.id === id)?.kind === "cap").length;
  const expected = Math.min(capsInHand, EXPECTED_CAPS); // caps we can still put on the paths we build

  const scored: { choice: Choice; score: number }[] = [];
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
      } else {
        const paths = domino.kind === "junction" ? 2 : 1;
        // An amplifier is worth its extra charge on a path we can still cap; a junction opens a new path to cap.
        const built = BASE_CAP_VALUE * (pv.charge - before) * paths * expected;
        const branch = domino.kind === "junction" && capsInHand > 1 ? BASE_CAP_VALUE * pv.charge : 0;
        score = built + branch + CARRY_WEIGHT * pv.charge * paths;
      }
      if (score > 0) scored.push({ choice: { type: "play", player: seat, domino: option.domino, end }, score });
    }
  }
  if (scored.length === 0) return { choice: { type: "ready", player: seat, ready: true }, rng };

  let best = [scored[0]];
  for (const s of scored.slice(1)) {
    if (s.score > best[0].score) best = [s];
    else if (s.score === best[0].score) best.push(s);
  }
  if (best.length === 1) return { choice: best[0].choice, rng };
  const r = nextInt(rng, best.length);
  return { choice: best[r.value].choice, rng: r.state };
}
