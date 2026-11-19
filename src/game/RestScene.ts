import Phaser from "phaser";
import { currentRun, nextPending, submitRunChoice } from "./runSession";
import { drawPartyHud, drawRunHeader } from "./partyHud";
import { button, drawBackground } from "./ui";

// PLACEHOLDER for the rest site and upgrade screens (#53), which replace this whole file.
// What it does: asks each seat in turn (single player) for a single "Rest" button, which sends a
// "rest" choice (the run heals the party). There is no upgrade option yet.

export class RestScene extends Phaser.Scene {
  constructor() {
    super("rest");
  }

  create(): void {
    const run = currentRun();
    const pending = nextPending(run);
    drawBackground(this);
    drawPartyHud(this, run);
    drawRunHeader(this, "Rest site", pending?.player ?? null, "Rest to heal the party.");
    if (pending?.type !== "rest") return;
    const player = pending.player;
    button(this, 960, 500, "Rest", () => submitRunChoice(this, player, { type: "rest" }), { size: 48, origin: 0.5 });
  }
}
