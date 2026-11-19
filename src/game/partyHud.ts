import Phaser from "phaser";
import type { RunState } from "../engine/run";
import { FONT, label } from "./ui";

// Shared HUD for the run screens (#50): the party's health, top right, and a header that says
// what the screen is and whose choice it is. The combat table draws the same bar itself
// (animated) at the same place.

export function drawPartyHud(scene: Phaser.Scene, run: RunState): void {
  const x = 1565;
  label(scene, x, 48, "Party", 24, { bold: true, color: "#9fd1b8" });
  const g = scene.add.graphics();
  g.fillStyle(0x0d2a20, 1);
  g.fillRoundedRect(x, 68, 190, 34, 17);
  const f = run.maxHealth > 0 ? Math.max(0, Math.min(1, run.health / run.maxHealth)) : 0;
  if (f > 0) {
    g.fillStyle(0x3fae68, 1);
    g.fillRoundedRect(x, 68, Math.max(17, 190 * f), 34, 17);
  }
  scene.add
    .text(x + 95, 85, `${run.health} / ${run.maxHealth}`, { fontFamily: FONT, fontSize: "20px", color: "#ffffff", fontStyle: "bold" })
    .setOrigin(0.5);
}

// Title on the left, and in single player a line naming the seat that has to choose.
export function drawRunHeader(scene: Phaser.Scene, title: string, player: string | null, hint: string): void {
  label(scene, 60, 70, title, 56, { bold: true });
  if (player !== null) {
    label(scene, 60, 150, `${player}'s choice`, 44, { bold: true, color: "#ffe14d" });
    label(scene, 60, 200, hint, 26, { color: "#cfe9dc" });
  }
}
