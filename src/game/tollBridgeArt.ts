import type Phaser from "phaser";

// The Toll Bridge's placeholder illustration (#88), drawn in code: a plank bridge over a gorge
// with a troll at the far end.

export function drawTollBridge(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  g.fillStyle(0x7fa8c9, 1);
  g.fillRect(x, y, w, h);
  // Cliffs either side, a river below.
  g.fillStyle(0x6b6a60, 1);
  g.fillRect(x, y + h * 0.55, w * 0.25, h * 0.45);
  g.fillRect(x + w * 0.75, y + h * 0.55, w * 0.25, h * 0.45);
  g.fillStyle(0x2f6fa8, 1);
  g.fillRect(x + w * 0.25, y + h * 0.85, w * 0.5, h * 0.15);
  // The bridge: planks and rails.
  const deck = y + h * 0.55;
  g.fillStyle(0x8a6234, 1);
  g.fillRect(x + w * 0.2, deck, w * 0.6, 22);
  g.lineStyle(3, 0x4a3318, 1);
  for (let px = x + w * 0.2; px < x + w * 0.8; px += 40) g.lineBetween(px, deck, px, deck + 22);
  g.lineStyle(8, 0x4a3318, 1);
  g.lineBetween(x + w * 0.2, deck - 60, x + w * 0.8, deck - 60);
  for (let px = x + w * 0.2; px <= x + w * 0.8; px += w * 0.15) g.lineBetween(px, deck - 60, px, deck);
  // The troll at the far end, with a club.
  const tx = x + w * 0.78;
  g.fillStyle(0x5c8a3c, 1);
  g.fillRoundedRect(tx - 45, deck - 170, 90, 150, 24);
  g.fillCircle(tx, deck - 190, 38);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(tx - 14, deck - 198, 8);
  g.fillCircle(tx + 14, deck - 198, 8);
  g.fillStyle(0x222222, 1);
  g.fillCircle(tx - 14, deck - 198, 3);
  g.fillCircle(tx + 14, deck - 198, 3);
  g.lineStyle(14, 0x6a4a28, 1);
  g.lineBetween(tx - 45, deck - 120, tx - 110, deck - 200);
  g.fillStyle(0x6a4a28, 1);
  g.fillCircle(tx - 112, deck - 204, 22);
}
