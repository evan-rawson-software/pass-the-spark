import Phaser from "phaser";
import type { RunNodeType } from "../engine/run";

// The stop icons (fight, elite, rest, trader, event, boss), shared by the map and the combat screen.

export const NODE_STYLE: Record<RunNodeType, { color: number; name: string }> = {
  fight: { color: 0x8a3b35, name: "Fight" },
  elite: { color: 0x6b2f8f, name: "Elite" },
  rest: { color: 0xc4741f, name: "Rest" },
  trader: { color: 0x2f7a8f, name: "Trader" },
  event: { color: 0x4a5a9a, name: "Event" },
  boss: { color: 0x8f1f2f, name: "Boss" },
};
// A simple icon for each stop type, drawn with shapes, centred on (x, y).
export function drawNodeIcon(g: Phaser.GameObjects.Graphics, type: RunNodeType, x: number, y: number, r: number): void {
  const white = 0xf4ecd8;
  g.fillStyle(white, 1);
  g.lineStyle(Math.max(2, r * 0.14), white, 1);
  if (type === "fight") {
    // Two crossed swords.
    g.lineBetween(x - r * 0.6, y - r * 0.6, x + r * 0.6, y + r * 0.6);
    g.lineBetween(x + r * 0.6, y - r * 0.6, x - r * 0.6, y + r * 0.6);
    g.lineBetween(x - r * 0.7, y - r * 0.2, x - r * 0.2, y - r * 0.7);
    g.lineBetween(x + r * 0.7, y - r * 0.2, x + r * 0.2, y - r * 0.7);
  } else if (type === "elite") {
    // A skull.
    g.fillCircle(x, y - r * 0.12, r * 0.55);
    g.fillRect(x - r * 0.3, y + r * 0.2, r * 0.6, r * 0.4);
    g.fillStyle(0x3a1250, 1);
    g.fillCircle(x - r * 0.22, y - r * 0.12, r * 0.15);
    g.fillCircle(x + r * 0.22, y - r * 0.12, r * 0.15);
  } else if (type === "rest") {
    // A flame over two logs.
    g.fillStyle(0xffd84d, 1);
    g.fillTriangle(x - r * 0.4, y + r * 0.2, x + r * 0.4, y + r * 0.2, x, y - r * 0.65);
    g.fillStyle(0xff7a2d, 1);
    g.fillTriangle(x - r * 0.22, y + r * 0.2, x + r * 0.22, y + r * 0.2, x, y - r * 0.25);
    g.lineStyle(Math.max(2, r * 0.16), white, 1);
    g.lineBetween(x - r * 0.6, y + r * 0.5, x + r * 0.6, y + r * 0.3);
    g.lineBetween(x - r * 0.6, y + r * 0.3, x + r * 0.6, y + r * 0.5);
  } else if (type === "trader") {
    // A coin with a bar through it.
    g.fillStyle(0xffd84d, 1);
    g.fillCircle(x, y, r * 0.6);
    g.lineStyle(Math.max(2, r * 0.12), 0x8a6a10, 1);
    g.strokeCircle(x, y, r * 0.6);
    g.lineBetween(x, y - r * 0.35, x, y + r * 0.35);
    g.lineBetween(x - r * 0.2, y - r * 0.15, x + r * 0.2, y - r * 0.15);
    g.lineBetween(x - r * 0.2, y + r * 0.15, x + r * 0.2, y + r * 0.15);
  } else if (type === "event") {
    // A question mark.
    g.lineStyle(Math.max(3, r * 0.2), white, 1);
    g.beginPath();
    g.arc(x, y - r * 0.2, r * 0.32, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(450), false);
    g.lineTo(x, y + r * 0.2);
    g.strokePath();
    g.fillCircle(x, y + r * 0.5, r * 0.1);
  } else {
    // A crown.
    g.fillStyle(0xffd84d, 1);
    g.fillRect(x - r * 0.6, y + r * 0.1, r * 1.2, r * 0.4);
    g.fillTriangle(x - r * 0.6, y + r * 0.1, x - r * 0.6, y - r * 0.5, x - r * 0.2, y + r * 0.1);
    g.fillTriangle(x - r * 0.3, y + r * 0.1, x, y - r * 0.65, x + r * 0.3, y + r * 0.1);
    g.fillTriangle(x + r * 0.6, y + r * 0.1, x + r * 0.6, y - r * 0.5, x + r * 0.2, y + r * 0.1);
  }
}
