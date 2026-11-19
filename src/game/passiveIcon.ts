import Phaser from "phaser";
import type { Passive } from "../engine/types";
import { artImage } from "./art";

const GOLD = 0xffe14d;

// A padlock centred on x, y (about 30 wide at scale 1).
export function drawPadlock(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, x: number, y: number, scale: number): void {
  if (artImage(scene, "ui/locked", x, y + 2 * scale, 34 * scale, 34 * scale, g.parentContainer)) return;
  g.lineStyle(5 * scale, 0xd8d8d8, 1);
  g.strokeEllipse(x, y - 9 * scale, 16 * scale, 20 * scale);
  g.fillStyle(0xe0b341, 1);
  g.fillRoundedRect(x - 14 * scale, y - 4 * scale, 28 * scale, 22 * scale, 4 * scale);
  g.fillStyle(0x2a2a2a, 1);
  g.fillCircle(x, y + 5 * scale, 3 * scale);
  g.fillRect(x - 1.5 * scale, y + 6 * scale, 3 * scale, 7 * scale);
}

// A boss passive's round icon, shared by the combat screen and the map. Radius 34 * k.
export function drawPassiveIcon(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, p: Passive, cx: number, cy: number, k = 1): void {
  g.fillStyle(0x0d2a20, 0.9);
  g.fillCircle(cx, cy, 34 * k);
  g.lineStyle(4 * k, GOLD, 1);
  g.strokeCircle(cx, cy, 34 * k);
  const X = (v: number) => cx + v * k;
  const Y = (v: number) => cy + v * k;
  if (p.kind === "auditor") {
    // A ledger page with ruled lines.
    g.fillStyle(0xf4ecd8, 1);
    g.fillRoundedRect(X(-16), Y(-22), 32 * k, 44 * k, 4 * k);
    g.lineStyle(3 * k, 0x2a2a2a, 1);
    for (let i = 0; i < 4; i++) g.lineBetween(X(-10), Y(-12 + i * 9), X(10), Y(-12 + i * 9));
  } else if (p.kind === "longNight") {
    // A crescent moon.
    g.fillStyle(0xf4ecd8, 1);
    g.fillCircle(X(-2), cy, 20 * k);
    g.fillStyle(0x0d2a20, 1);
    g.fillCircle(X(8), Y(-5), 17 * k);
  } else if (p.kind === "hoarder") {
    // A shield-shaped chest.
    g.fillStyle(0x8a6a3a, 1);
    g.fillRoundedRect(X(-20), Y(-14), 40 * k, 30 * k, 4 * k);
    g.fillStyle(0xffe14d, 1);
    g.fillRect(X(-4), Y(-4), 8 * k, 10 * k);
  } else if (p.kind === "smolder") {
    // A flame.
    g.fillStyle(0xff7a2b, 1);
    g.fillTriangle(X(-16), Y(20), X(16), Y(20), cx, Y(-24));
    g.fillStyle(0xffe14d, 1);
    g.fillTriangle(X(-8), Y(20), X(8), Y(20), cx, Y(-6));
  } else if (p.kind === "warden") {
    drawPadlock(scene, g, cx, cy, 1.1 * k);
  } else {
    // A mouth with teeth.
    g.fillStyle(0x7a1f2b, 1);
    g.fillEllipse(cx, Y(2), 46 * k, 30 * k);
    g.fillStyle(0xffffff, 1);
    for (let i = 0; i < 4; i++) g.fillTriangle(X(-18 + i * 9), Y(-8), X(-10 + i * 9), Y(-8), X(-14 + i * 9), Y(2));
  }
}
