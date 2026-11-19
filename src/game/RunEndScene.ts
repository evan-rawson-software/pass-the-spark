import Phaser from "phaser";
import { currentRun, runSeed } from "./runSession";
import { drawPartyHud } from "./partyHud";
import { button, drawBackground, label } from "./ui";

// The end of a run (#50): victory or defeat, the floor reached, the seed, and the way back.

export class RunEndScene extends Phaser.Scene {
  constructor() {
    super("runEnd");
  }

  create(): void {
    const run = currentRun();
    const won = run.result === "won";
    drawBackground(this);
    drawPartyHud(this, run);
    label(this, 960, 260, won ? "Victory" : "Defeat", 120, { bold: true, origin: 0.5, color: won ? "#ffe14d" : "#ff9a94" });
    label(this, 960, 420, `Floor reached: ${run.position?.floor ?? 0}`, 48, { origin: 0.5 });
    label(this, 960, 500, `Seed: ${runSeed()}`, 48, { origin: 0.5 });
    button(this, 960, 700, "Back to start", () => this.scene.start("menu"), { size: 44, origin: 0.5 });
  }
}
