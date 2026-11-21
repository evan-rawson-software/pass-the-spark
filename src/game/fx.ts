import Phaser from "phaser";
import { artImage } from "./art";
import { fxData } from "./presentation";

// Effect textures (F8). fx/spark, fx/slash, fx/bolt and fx/shard are white with brightness as alpha:
// tinting multiplies a colour into the RGB and keeps the alpha. fx/glow and fx/ring have no art and
// are always drawn in code. Every id also has a code-drawn fallback, since art can be missing.

export type FxId = "spark" | "slash" | "bolt" | "shard" | "glow" | "ring";
const CODE_ONLY: FxId[] = ["glow", "ring"];

const P = (x: number, y: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(x, y);

// The tinted art image, fitted to size x size at (x, y), or null when there is no art for the id.
export function fxImage(scene: Phaser.Scene, id: FxId, x: number, y: number, size: number, tint: number, parent?: Phaser.GameObjects.Container | null): Phaser.GameObjects.Image | null {
  if (CODE_ONLY.includes(id)) return null;
  const img = artImage(scene, `fx/${id}`, x, y, size, size, parent);
  return img ? img.setTint(tint) : null;
}

// The code-drawn version of an effect, centred on (x, y) and about size across.
export function fxFallback(scene: Phaser.Scene, id: FxId, x: number, y: number, size: number, tint: number, parent?: Phaser.GameObjects.Container | null): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y });
  const r = size / 2;
  const a = fxData.fallbackAlpha;
  if (id === "glow") {
    // A soft radial gradient: stacked discs, faint at the edge and strongest in the middle.
    const n = fxData.glow.steps;
    for (let i = 0; i < n; i++) {
      g.fillStyle(tint, fxData.glow.peakAlpha / n);
      g.fillCircle(0, 0, r * (1 - i / n));
    }
  } else if (id === "ring") {
    g.lineStyle(Math.max(1, size * fxData.ring.lineWidthFraction), tint, fxData.ring.alpha);
    g.strokeCircle(0, 0, r);
  } else if (id === "spark") {
    // An 8-pointed star.
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 16; i++) {
      const ang = (i * Math.PI) / 8 - Math.PI / 2;
      const d = i % 2 === 0 ? r : r * 0.3;
      pts.push(P(Math.cos(ang) * d, Math.sin(ang) * d));
    }
    g.fillStyle(tint, a);
    g.fillPoints(pts, true);
  } else if (id === "slash") {
    // A curved blade streak, trailing off to the upper right.
    const top: Phaser.Math.Vector2[] = [];
    const bottom: Phaser.Math.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const px = -r + 2 * r * t;
      const py = r * 0.8 - 1.6 * r * t + r * 0.5 * Math.sin(t * Math.PI);
      const w = r * 0.22 * Math.sin(t * Math.PI);
      top.push(P(px, py - w));
      bottom.unshift(P(px, py + w));
    }
    g.fillStyle(tint, a);
    g.fillPoints([...top, ...bottom], true);
  } else if (id === "bolt") {
    // A short jagged bolt running left to right.
    g.lineStyle(Math.max(2, size * 0.08), tint, a);
    g.beginPath();
    g.moveTo(-r, 0);
    for (const [px, py] of [[-0.5, -0.3], [-0.2, 0.2], [0.2, -0.25], [0.5, 0.15], [1, 0]]) g.lineTo(px * r, py * r);
    g.strokePath();
  } else {
    // A faceted crystal chunk.
    const pts = [[0, -1], [0.7, -0.3], [0.5, 0.8], [-0.4, 0.9], [-0.8, 0]].map(([px, py]) => P(px * r, py * r));
    g.fillStyle(tint, a);
    g.fillPoints(pts, true);
    g.lineStyle(2, 0xffffff, 0.5);
    g.lineBetween(0, -r, -0.4 * r, 0.9 * r);
    g.lineBetween(0.7 * r, -0.3 * r, -0.8 * r, 0);
  }
  parent?.add(g);
  return g;
}

// For effects code: the tinted art when there is some, otherwise the code-drawn version.
export function fxObject(scene: Phaser.Scene, id: FxId, x: number, y: number, size: number, tint: number, parent?: Phaser.GameObjects.Container | null): Phaser.GameObjects.GameObject {
  return fxImage(scene, id, x, y, size, tint, parent) ?? fxFallback(scene, id, x, y, size, tint, parent);
}
