import Phaser from "phaser";
import { currentRun, nextPending, submitRunChoice } from "./runSession";
import { drawPartyHud, drawRunHeader } from "./partyHud";
import { button, drawBackground } from "./ui";

// PLACEHOLDER for the Trader screen (#54), which replaces this whole file.
// What it does: asks each seat in turn (single player) for a single "Leave" button, which sends
// a trader "done" choice. Nothing can be bought or removed yet.

export class TraderScene extends Phaser.Scene {
  constructor() {
    super("trader");
  }

  create(): void {
    const run = currentRun();
    const pending = nextPending(run);
    drawBackground(this);
    drawPartyHud(this, run);
    drawRunHeader(this, "Trader", pending?.player ?? null, "Nothing for sale yet.");
    if (pending?.type !== "trader") return;
    const player = pending.player;
    button(this, 960, 500, "Leave", () => submitRunChoice(this, player, { type: "trader", action: { kind: "done" } }), { size: 48, origin: 0.5 });
  }
}
