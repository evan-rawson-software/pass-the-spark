import Phaser from "phaser";
import type { EventState } from "../engine/eventStops";
import type { EventData } from "../engine/types";
import type { RunState } from "../engine/run";
import { seatColour } from "./seatColours";
import { button, label } from "./ui";
import { coinLine } from "./coinIcon";
import { seatName } from "./runSession";

// The Sleeping Giant's drawing and push-your-luck panel (#92), called from the event screen. It only
// draws what the engine reports (the wake chance, whose turn, coins grabbed, who has stopped) and
// calls back with the option the player picked: 0 is Grab, 1 is Stop.

const GOLD = "#ffe14d";

// A giant lying across a hill, a heap of gold at his side. Awake: eyes open and the sky turns red.
export function drawGiant(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, awake: boolean): void {
  const ground = y + h * 0.72;
  g.fillStyle(awake ? 0xb5483b : 0x7f9fd9, 1);
  g.fillRect(x, y, w, ground - y);
  g.fillStyle(0x4f7a46, 1);
  g.fillRect(x, ground, w, y + h - ground);
  g.fillStyle(0x3d6638, 1);
  g.fillEllipse(x + w * 0.5, ground, w * 1.2, 120);
  // The body, lying down, and the head.
  g.fillStyle(0x8a6a4a, 1);
  g.fillRoundedRect(x + w * 0.28, ground - 150, w * 0.5, 130, 60);
  g.fillStyle(0xe0b48a, 1);
  g.fillCircle(x + w * 0.24, ground - 120, 70);
  g.fillStyle(0xd2a074, 1);
  g.fillCircle(x + w * 0.24, ground - 100, 28); // nose
  if (awake) {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x + w * 0.2, ground - 140, 14);
    g.fillCircle(x + w * 0.28, ground - 140, 14);
    g.fillStyle(0x000000, 1);
    g.fillCircle(x + w * 0.2, ground - 140, 6);
    g.fillCircle(x + w * 0.28, ground - 140, 6);
  } else {
    g.lineStyle(5, 0x3a2a1a, 1);
    g.lineBetween(x + w * 0.18, ground - 140, x + w * 0.22, ground - 140);
    g.lineBetween(x + w * 0.26, ground - 140, x + w * 0.3, ground - 140);
  }
  // The gold.
  g.fillStyle(0xf5c542, 1);
  for (let i = 0; i < 9; i++) g.fillCircle(x + w * 0.8 + (i % 3) * 36 - 36, ground + 10 - Math.floor(i / 3) * 26, 22);
  g.lineStyle(3, 0xb8860b, 1);
  for (let i = 0; i < 9; i++) g.strokeCircle(x + w * 0.8 + (i % 3) * 36 - 36, ground + 10 - Math.floor(i / 3) * 26, 22);
}

// Meter, turn, buttons and the players' rows, from `left` and `top`.
export function drawGiantPanel(
  scene: Phaser.Scene,
  run: RunState,
  event: EventState,
  data: EventData,
  left: number,
  top: number,
  canAct: boolean,
  me: string | null, // online: this screen's seat
  onPick: (option: number) => void,
): void {
  const giant = event.giant!;
  const barW = 700;
  label(scene, left, top, `Wake chance: ${giant.wakePercent}%`, 40, { bold: true, color: giant.wakePercent >= 50 ? "#ff9d7a" : GOLD });
  const g = scene.add.graphics();
  g.fillStyle(0x0d2a20, 1);
  g.fillRoundedRect(left, top + 60, barW, 36, 18);
  g.fillStyle(0xd9503b, 1);
  g.fillRoundedRect(left, top + 60, Math.max(18, (barW * giant.wakePercent) / 100), 36, 18);
  coinLine(scene, left, top + 112, ["Each grab: ", data.numbers.grabCoins, `, and the chance rises ${data.numbers.wakeStepPercent} points.`], 24, { color: "#cfe9dc" });
  label(scene, left, top + 138, `If he wakes: ${data.numbers.wakeDamage} damage to the party.`, 24, { color: "#cfe9dc" });

  const turnName = seatName(giant.turn);
  label(scene, left, top + 170, me === null ? `${turnName}'s turn` : giant.turn === me ? "Your turn" : `${turnName}'s turn`, 40, { bold: true, color: GOLD });
  button(scene, left, top + 230, "Grab", () => onPick(0), { size: 36, disabled: !canAct });
  button(scene, left + 200, top + 230, "Stop", () => onPick(1), { size: 36, disabled: !canAct });

  run.players.forEach((id, i) => {
    const y = top + 340 + i * 56;
    const out = giant.stopped.includes(id);
    scene.add.circle(left + 16, y, 16, seatColour(run.players, id)).setStrokeStyle(3, 0x0d2a20);
    label(scene, left + 16, y, String(i + 1), 20, { bold: true, color: "#0d2a20", origin: 0.5 });
    const turn = id === giant.turn;
    label(scene, left + 50, y, `${seatName(id)}${turn ? "  <" : ""}`, 28, { bold: turn, color: out ? "#7a8f84" : "#ffffff" });
    coinLine(scene, left + 380, y, [giant.grabbed[id], " grabbed"], 26, { color: GOLD });
    if (out) label(scene, left + 640, y, "stopped", 26, { color: "#9fb8aa" });
  });
}
