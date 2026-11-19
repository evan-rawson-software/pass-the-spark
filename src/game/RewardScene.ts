import Phaser from "phaser";
import { SKIP } from "../engine/rewards";
import { currentRun, nextPending, submitRunChoice } from "./runSession";
import { drawPartyHud, drawRunHeader } from "./partyHud";
import { button, drawBackground } from "./ui";

// PLACEHOLDER for the victory and domino choice screen (#52), which replaces this whole file.
// What it does: asks each seat in turn (single player) to take one of its three offered
// dominoes, or skip, from a plain list of buttons (name and rarity only, no domino drawing),
// and sends the pick to the run as a "reward" choice.

export class RewardScene extends Phaser.Scene {
  constructor() {
    super("reward");
  }

  create(): void {
    const run = currentRun();
    const pending = nextPending(run);
    drawBackground(this);
    drawPartyHud(this, run);
    drawRunHeader(this, "Victory", pending?.player ?? null, "Pick one domino for your deck, or skip.");
    if (pending?.type !== "reward") return;
    const player = pending.player;
    pending.offer.forEach((d, i) => {
      button(this, 960, 360 + i * 110, `${d.name}  (${d.rarity ?? "?"})`, () => submitRunChoice(this, player, { type: "reward", pick: d.id }), { size: 40, origin: 0.5 });
    });
    button(this, 960, 360 + pending.offer.length * 110, "Skip", () => submitRunChoice(this, player, { type: "reward", pick: SKIP }), { size: 40, origin: 0.5 });
  }
}
