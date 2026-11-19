import Phaser from "phaser";
import type { Spark } from "../engine/types";
import { drawSparkGlyph } from "./dominoDrawing";
import { SPARK_STYLE } from "./sparks";

// Drawing for the Spark Shrine (#89): the event's illustration, and the glow that marks the blessed
// spark on the combat and run screens. No rules here; the blessing comes from the engine.

// A mossy stone shrine with one glowing bowl per basic spark.
export function drawSparkShrine(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  const ground = y + h * 0.75;
  g.fillStyle(0x24365a, 1);
  g.fillRect(x, y, w, ground - y);
  g.fillStyle(0xf4ecd8, 1);
  for (const [fx, fy] of [[0.15, 0.1], [0.4, 0.2], [0.7, 0.08], [0.88, 0.25], [0.55, 0.05]]) g.fillCircle(x + w * fx, y + h * fy, 4);
  g.fillStyle(0x3c7a4c, 1);
  g.fillRect(x, ground, w, y + h - ground);
  // The stone arch.
  g.fillStyle(0x8f9a94, 1);
  g.fillRect(x + w * 0.12, ground - 330, 50, 330);
  g.fillRect(x + w * 0.88 - 50, ground - 330, 50, 330);
  g.fillRect(x + w * 0.1, ground - 380, w * 0.8, 56);
  g.fillStyle(0x4f8a5a, 1);
  g.fillRect(x + w * 0.1, ground - 380, w * 0.8, 14);
  // The altar and the three bowls.
  g.fillStyle(0x6f7a74, 1);
  g.fillRect(x + w * 0.18, ground - 110, w * 0.64, 110);
  const sparks: Spark[] = ["Ember", "Tide", "Gale"];
  sparks.forEach((spark, i) => {
    const bx = x + w * (0.3 + 0.2 * i);
    const by = ground - 130;
    g.fillStyle(0x4a524e, 1);
    g.fillRoundedRect(bx - 50, by - 6, 100, 40, { tl: 0, tr: 0, bl: 40, br: 40 });
    drawBlessedGlow(g, spark, bx, by - 50, 26);
    drawSparkGlyph(g, spark, bx, by - 50, 26);
  });
}

// A soft halo behind a spark glyph at (x, y) with radius r, to mark the blessed spark.
export function drawBlessedGlow(g: Phaser.GameObjects.Graphics, spark: Spark, x: number, y: number, r: number): void {
  g.fillStyle(SPARK_STYLE[spark].color, 0.25);
  g.fillCircle(x, y, r + 16);
  g.lineStyle(4, 0xffe14d, 0.9);
  g.strokeCircle(x, y, r + 9);
}
