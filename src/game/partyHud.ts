import Phaser from "phaser";
import { getPendingRunChoices } from "../engine/run";
import type { RunState } from "../engine/run";
import { openDeckViewer, runDeckPlayers } from "./deckViewer";
import { actingSeat, isOnlineRun, onlineRun, seatName, seatNames } from "./runSession";
import { relay } from "./relay";
import { artImage } from "./art";
import { drawBlessedGlow } from "./sparkShrineArt";
import { drawSparkGlyph } from "./dominoDrawing";
import { drawPartyCharms } from "./charmUi";
import { button, label } from "./ui";
import { fontRole, tabularDigits } from "./fonts";

// Shared HUD for the run screens (#50): the party's health, top right, and a header that says
// what the screen is and whose choice it is. The combat table draws the same bar itself
// (animated) at the same place.

// `ink` (the map screen, on paper) replaces the light text colours.
export function drawPartyHud(scene: Phaser.Scene, run: RunState, ink?: string): void {
  const x = 1565;
  label(scene, x, 48, "Party", 24, { bold: true, color: ink ?? "#9fd1b8" });
  const g = scene.add.graphics();
  g.fillStyle(0x0d2a20, 1);
  g.fillRoundedRect(x, 68, 190, 34, 17);
  const f = run.maxHealth > 0 ? Math.max(0, Math.min(1, run.health / run.maxHealth)) : 0;
  if (f > 0) {
    g.fillStyle(0x3fae68, 1);
    g.fillRoundedRect(x, 68, Math.max(17, 190 * f), 34, 17);
  }
  artImage(scene, "ui/health", x - 18, 85, 30, 30);
  tabularDigits(scene.add.text(x + 95, 85, `${run.health} / ${run.maxHealth}`, { ...fontRole(20), color: "#ffffff" })).setOrigin(0.5);
  // The Spark Shrine's blessing, until the act's boss fight is over.
  if (run.blessing) {
    const bg = scene.add.graphics();
    drawBlessedGlow(bg, run.blessing, x + 20, 132, 14);
    drawSparkGlyph(bg, run.blessing, x + 20, 132, 14);
    label(scene, x + 52, 120, `Blessed ${run.blessing}`, 22, { bold: true, color: ink ?? "#ffe14d" });
  }
  const acting = actingSeat(run);
  if (acting !== null && acting !== onlineRun()?.seat) label(scene, x, 175, `Playing for ${seatName(acting)}`, 24, { bold: true, color: ink ?? "#ffe14d" });
  // Everyone's charms, by their names (#108); clicking a name opens the deck viewer.
  drawPartyCharms(scene, run.players, seatNames(), run.charms, (seat) => openDeckViewer(scene, runDeckPlayers(run), seat), ink); // a name opens that player's deck (#171)
  drawPause(scene);
}

// Online: across the bottom, who the run is waiting on while they are away, and for the host a
// button to play for them once the wait has been long enough.
function drawPause(scene: Phaser.Scene): void {
  const paused = relay.paused;
  const online = onlineRun();
  if (!online || !paused || paused.waitingFor === null) return;
  const style = { ...fontRole(30), color: "#ffd0cc", backgroundColor: "#0d2a20", padding: { x: 24, y: 10 } };
  scene.add.text(online.host && paused.playFor ? 700 : 960, 1048, `Waiting for ${paused.waitingFor} to reconnect...`, style).setOrigin(0.5).setDepth(900);
  const seat = paused.playFor;
  const host = online.host;
  if (host && seat) {
    button(scene, 1360, 1048, `Play for ${seatName(seat)}`, () => host.playFor(seat), { size: 30, origin: 0.5 }).setDepth(900);
  }
}

// Title on the left, and in single player a line naming the seat that has to choose.
// Online everyone chooses at once, so there is only the hint.
export function drawRunHeader(scene: Phaser.Scene, title: string, player: string | null, hint: string): void {
  label(scene, 60, 70, title, 56, { bold: true });
  if (player !== null) {
    label(scene, 60, 150, `${seatName(player)}'s choice`, 44, { bold: true, color: "#ffe14d" });
    label(scene, 60, 200, hint, 26, { color: "#cfe9dc" });
  } else if (isOnlineRun()) {
    label(scene, 60, 140, hint, 26, { color: "#cfe9dc" });
  }
}

// Online: a line naming the players the run is still waiting on, for a player who has made their choices.
export function drawWaitingFor(scene: Phaser.Scene, run: RunState, x: number, y: number, origin = 0): void {
  const names = [...new Set(getPendingRunChoices(run).map((p) => seatName(p.player)))];
  if (names.length > 0) label(scene, x, y, `Waiting for ${names.join(", ")}`, 30, { color: "#ffe14d", origin });
}
