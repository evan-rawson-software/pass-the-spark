import Phaser from "phaser";
import { currentRun, nextPending, submitRunChoice } from "./runSession";
import { drawPartyHud, drawRunHeader } from "./partyHud";
import { button, drawBackground, label } from "./ui";

// PLACEHOLDER for the map screen (#51), which replaces this whole file.
// What it does: asks each seat in turn (single player) to pick the next stop from a plain list
// of buttons, sends it to the run as a "vote" choice, and shows the votes so far as text. The
// run settles the votes and says what comes next; this screen draws no map.

export class MapScene extends Phaser.Scene {
  constructor() {
    super("map");
  }

  create(): void {
    const run = currentRun();
    const pending = nextPending(run);
    drawBackground(this);
    drawPartyHud(this, run);
    const floor = (run.position?.floor ?? 0) + 1;
    const boss = floor > run.map.floors.length;
    drawRunHeader(this, boss ? "Route: the boss" : `Route: floor ${floor}`, pending?.player ?? null, "Vote for the next stop.");
    if (pending?.type !== "vote") return;
    const player = pending.player;

    pending.options.forEach((index, i) => {
      const type = boss ? "boss" : run.map.floors[floor - 1][index].type;
      button(this, 960, 380 + i * 110, `${type}  (stop ${index + 1})`, () => submitRunChoice(this, player, { type: "vote", node: index }), { size: 44, origin: 0.5 });
    });
    const votes = Object.entries(run.votes).map(([id, node]) => `${id}: stop ${node + 1}`);
    label(this, 960, 900, votes.length > 0 ? `Votes so far: ${votes.join(", ")}` : "No votes yet", 28, { origin: 0.5, color: "#9fd1b8" });
  }
}
