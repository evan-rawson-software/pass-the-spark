import Phaser from "phaser";
import presentationJson from "../../data/presentation.json";
import { artImage } from "./art";
import { reducedFlashing, shakeEnabled } from "./comfort";
import { scaleTime } from "./playbackSpeed";
import { playSound } from "./sound";

// The drawing half of the cascade spectacle (#187): heat tiers, charge flowing along the branches,
// the per-effect animations, shake, lightning and slow motion. Purely visual and driven
// by engine events (the Animator in animations.ts calls these). Every duration goes through
// scaleTime and nothing waits on the host. Numbers come from events and data/presentation.json;
// no rules in here. The fx textures (white with alpha) are tinted through the art helper, with a
// code-drawn fallback when there is no art.

const FONT = "Arial, Helvetica, sans-serif";
const DEPTH = 95;
export const GOLD = 0xffe14d;

interface Tier { minNodes: number; minCap: number; color: string }
export const P = presentationJson as unknown as {
  tiers: Tier[];
  build: { fullNodes: number };
  step: { pulseMs: number };
  amp: { fullChange: number };
  shake: { minCap: number; ms: number; intensity: number; perTier: number };
  lightning: { minCap: number; ms: number; bolts: number };
  slowMotion: { minCap: number; timeScale: number; holdMs: number };
  effects: { travelMs: number; ms: number };
};

export interface Point { x: number; y: number }
export interface Box { x: number; y: number; w: number; h: number }
const centre = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const done = (g: Phaser.GameObjects.GameObject) => () => g.destroy();

// ---- heat ----

// The highest tier on for this many lit (or built) dominoes and this big a cap or charge; -1 for none.
export function heatTier(nodes: number, biggest: number): number {
  let tier = -1;
  P.tiers.forEach((t, i) => {
    if (nodes >= t.minNodes || biggest >= t.minCap) tier = i;
  });
  return tier;
}

export function heatColor(tier: number): number {
  return tier < 0 ? GOLD : Number(P.tiers[tier].color);
}

// How brightly the built tree glows (0..1) and in what colour, from how many dominoes are on the
// board and the biggest charge on an open end (both from the view).
export function boardGlow(nodes: number, biggestCharge: number): { color: number; strength: number } {
  return { color: heatColor(heatTier(nodes, biggestCharge)), strength: Math.min(1, nodes / P.build.fullNodes) };
}

// ---- building blocks ----

type Sprite = Phaser.GameObjects.Image | Phaser.GameObjects.Arc;

// A glowing dot: the spark texture tinted to `color` (alpha kept), or a plain circle.
function dot(scene: Phaser.Scene, at: Point, size: number, color: number): Sprite {
  const img = artImage(scene, "fx/spark", at.x, at.y, size * 3, size * 3);
  if (img) return img.setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH);
  return scene.add.circle(at.x, at.y, size, color).setDepth(DEPTH);
}

function along(pts: Point[], lens: number[], total: number, t: number): Point {
  let d = t * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const f = lens[i] === 0 ? 1 : Math.min(1, d / lens[i]);
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f };
    }
    d -= lens[i];
  }
  return pts[pts.length - 1];
}

// Charge flowing along a path: a bright spark with a few more trailing it as the heat grows.
export function flow(scene: Phaser.Scene, pts: Point[], color: number, size: number, tier: number): void {
  if (pts.length < 2) return;
  const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  const total = lens.reduce((a, b) => a + b, 0);
  const n = reducedFlashing() ? 1 : 1 + Math.min(Math.max(tier, 0), 3);
  for (let i = 0; i < n; i++) {
    const s = dot(scene, pts[0], size * (1 - i * 0.18), color).setAlpha(0);
    scene.tweens.addCounter({
      from: 0, to: 1, delay: scaleTime(i * 45), duration: scaleTime(P.step.pulseMs), ease: "Sine.easeInOut",
      onStart: () => s.setAlpha(1),
      onUpdate: (t) => {
        const p = along(pts, lens, total, t.getValue() ?? 1);
        s.setPosition(p.x, p.y);
      },
      onComplete: () => scene.tweens.add({ targets: s, alpha: 0, scale: 1.8, duration: scaleTime(160), onComplete: done(s) }),
    });
  }
}

// A ring that spreads from a point.
function ring(scene: Phaser.Scene, at: Point, color: number, r: number, to: number, ms: number): void {
  const g = scene.add.graphics().setDepth(DEPTH).setPosition(at.x, at.y);
  g.lineStyle(6, color, 1);
  g.strokeCircle(0, 0, r);
  scene.tweens.add({ targets: g, scale: { from: 0.4, to }, alpha: { from: 1, to: 0 }, duration: scaleTime(ms), ease: "Cubic.easeOut", onComplete: done(g) });
}

export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, color: string, size = 44, ms = 1000): void {
  const t = scene.add
    .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: "bold", color, stroke: "#101010", strokeThickness: 6 })
    .setOrigin(0.5)
    .setDepth(100);
  scene.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: scaleTime(ms), ease: "Cubic.easeOut", onComplete: done(t) });
}

// ---- per-effect animations (reused from M8, redrawn for the cascade) ----

export type EffectKind = "amplify" | "echo" | "spectrum" | "charm";

// Orange chevrons rise from an amplifier: the charge just got stronger. `size` grows with the change.
export function amplify(scene: Phaser.Scene, at: Point, size: number): void {
  for (let i = 0; i < 3; i++) {
    const g = scene.add.graphics().setDepth(DEPTH).setPosition(at.x + (i - 1) * 40 * size, at.y + 20).setScale(size).setAlpha(0);
    g.lineStyle(10, 0xf08a00, 1);
    g.beginPath();
    g.moveTo(-18, 8);
    g.lineTo(0, -10);
    g.lineTo(18, 8);
    g.strokePath();
    scene.tweens.add({
      targets: g, y: at.y - 80 * size, alpha: { from: 1, to: 0 }, delay: scaleTime(i * 90), duration: scaleTime(P.effects.ms + 150), ease: "Cubic.easeOut",
      onStart: () => g.setAlpha(1), onComplete: done(g),
    });
  }
}

// Echo: rings that close in on the domino, as if the sound is gathering to come back.
export function echo(scene: Phaser.Scene, at: Point): void {
  for (let i = 0; i < 3; i++) {
    const g = scene.add.graphics().setDepth(DEPTH).setPosition(at.x, at.y).setAlpha(0);
    g.lineStyle(6, 0x4fd8ff, 1);
    g.strokeCircle(0, 0, 90);
    scene.tweens.add({
      targets: g, scale: { from: 1.6, to: 0.3 }, alpha: { from: 0.9, to: 0 }, delay: scaleTime(i * 110), duration: scaleTime(P.effects.ms), ease: "Cubic.easeIn",
      onStart: () => g.setAlpha(0.9), onComplete: done(g),
    });
  }
}

// Spectrum: orange, blue and green rings, one after the other.
export function spectrum(scene: Phaser.Scene, at: Point, size: number): void {
  [0xff6a13, 0x2f80ed, 0x4cc46a].forEach((color, i) => {
    const g = scene.add.graphics().setDepth(DEPTH).setPosition(at.x, at.y).setAlpha(0);
    g.lineStyle(8, color, 1);
    g.strokeCircle(0, 0, 60);
    scene.tweens.add({
      targets: g, scale: { from: 0.5, to: 2 * size }, alpha: { from: 1, to: 0 }, delay: scaleTime(i * 110), duration: scaleTime(P.effects.ms), ease: "Cubic.easeOut",
      onStart: () => g.setAlpha(1), onComplete: done(g),
    });
  });
}

// A charm triggers: a ring and a little burst of stars around its icon.
export function charm(scene: Phaser.Scene, at: Point): void {
  const g = scene.add.graphics().setDepth(DEPTH).setPosition(at.x, at.y);
  g.lineStyle(4, GOLD, 1);
  g.strokeCircle(0, 0, 26);
  g.fillStyle(0xfff6b0, 1);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.fillTriangle(Math.cos(a) * 34, Math.sin(a) * 34 - 7, Math.cos(a) * 34 - 5, Math.sin(a) * 34 + 5, Math.cos(a) * 34 + 5, Math.sin(a) * 34 + 5);
  }
  scene.tweens.add({ targets: g, scale: { from: 0.6, to: 1.8 }, alpha: { from: 1, to: 0 }, duration: scaleTime(P.effects.ms + 100), ease: "Cubic.easeOut", onComplete: done(g) });
}

// A junction splits the glow: a ring spreads from it as the two branches' flows leave.
export function split(scene: Phaser.Scene, at: Point, color: number): void {
  ring(scene, at, color, 70, 1.8, P.effects.ms);
  if (!reducedFlashing()) ring(scene, at, 0xffffff, 40, 2.2, P.effects.ms - 100);
}

// An open end the cascade leaves uncapped: a few sparks flicker and drop.
export function sputter(scene: Phaser.Scene, at: Point): void {
  for (let i = 0; i < 6; i++) {
    const d = dot(scene, { x: at.x + (i - 2.5) * 9, y: at.y }, 5, 0x9aa3b2);
    scene.tweens.add({
      targets: d, y: at.y + 24 + (i % 3) * 8, alpha: { from: 1, to: 0 }, delay: scaleTime(i * 40), duration: scaleTime(450), ease: "Cubic.easeIn",
      onComplete: done(d),
    });
  }
}

// ---- big moments ----

export function shake(scene: Phaser.Scene, tier: number): void {
  if (!shakeEnabled()) return;
  scene.cameras.main.shake(scaleTime(P.shake.ms), P.shake.intensity + P.shake.perTier * Math.max(tier, 0));
}

// Jagged bolts from one node to others. (Phaser's own random: looks only.)
export function lightning(scene: Phaser.Scene, a: Point, targets: Point[]): void {
  if (reducedFlashing()) return; // bright flickering bolts: skipped with reduced flashing
  for (const b of targets) {
    const pts = [a];
    for (let i = 1; i < 7; i++) {
      const t = i / 7;
      pts.push({ x: a.x + (b.x - a.x) * t + Phaser.Math.Between(-22, 22), y: a.y + (b.y - a.y) * t + Phaser.Math.Between(-22, 22) });
    }
    pts.push(b);
    const g = scene.add.graphics().setDepth(DEPTH + 2);
    for (const [width, color] of [[12, 0x4aa8ff], [4, 0xffffff]] as const) {
      g.lineStyle(width, color, 1);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (const q of pts.slice(1)) g.lineTo(q.x, q.y);
      g.strokePath();
    }
    scene.tweens.add({ targets: g, alpha: 0, duration: scaleTime(P.lightning.ms), ease: "Cubic.easeIn", onComplete: done(g) });
  }
}

export { centre };
