import Phaser from "phaser";
import presentationJson from "../../data/presentation.json";
import { artImage } from "./art";
import { scaleTime } from "./playbackSpeed";
import { playSound } from "./sound";

// The drawing half of the cascade spectacle (#187): heat tiers, charge flowing along the branches,
// the per-effect animations, shake, lightning, slow motion and the tally. Purely visual and driven
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
  stack: { step: number; growth: number; ms: number };
  shake: { minCap: number; ms: number; intensity: number; perTier: number };
  lightning: { minCap: number; ms: number; bolts: number };
  slowMotion: { minCap: number; timeScale: number; holdMs: number };
  effects: { travelMs: number; ms: number };
  tally: { countMs: number; holdMs: number; popMs: number };
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
  const n = 1 + Math.min(Math.max(tier, 0), 3);
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

// A number that piles up above earlier ones from the same cascade and grows with the heat.
export function stackedNumber(scene: Phaser.Scene, pile: Phaser.GameObjects.Text[], x: number, y: number, text: string, color: string, tier: number): void {
  const live = pile.filter((t) => t.active);
  pile.length = 0;
  pile.push(...live);
  const n = live.length;
  const size = Math.round(44 * (1 + P.stack.growth * Math.max(tier, 0) * 2));
  const t = scene.add
    .text(x, y - n * P.stack.step, text, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: "bold", color, stroke: "#101010", strokeThickness: 6 })
    .setOrigin(0.5)
    .setDepth(100 + n);
  pile.push(t);
  scene.tweens.add({ targets: t, y: t.y - 70, alpha: 0, duration: scaleTime(P.stack.ms), ease: "Cubic.easeIn", onComplete: done(t) });
}

// ---- per-effect animations (reused from M8, redrawn for the cascade) ----

export type EffectKind = "damage" | "block" | "coins" | "amplify" | "echo" | "spectrum" | "charm";

// A red shot flies to the target and bursts into a jagged star with a slash.
export function damage(scene: Phaser.Scene, from: Point, to?: Point): void {
  const shot = dot(scene, from, 14, 0xff3b2f);
  const burst = (at: Point) => {
    const g = scene.add.graphics().setDepth(DEPTH).setPosition(at.x, at.y);
    g.fillStyle(0xff3b2f, 0.9);
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 === 0 ? 46 : 18;
      if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fillPath();
    const slash = artImage(scene, "fx/slash", at.x, at.y, 130, 130);
    if (slash) slash.setTint(0xffffff).setDepth(DEPTH + 1);
    else {
      g.lineStyle(7, 0xffffff, 1);
      g.lineBetween(-50, -34, 50, 34);
      g.lineBetween(-50, 34, 50, -34);
    }
    const targets = slash ? [g, slash] : [g];
    scene.tweens.add({ targets, scale: { from: 0.4, to: 1.3 }, alpha: { from: 1, to: 0 }, duration: scaleTime(P.effects.ms), ease: "Cubic.easeOut", onComplete: () => targets.forEach((o) => o.destroy()) });
  };
  if (!to) { shot.destroy(); return burst(from); }
  scene.tweens.add({ targets: shot, x: to.x, y: to.y, duration: scaleTime(P.effects.travelMs), ease: "Cubic.easeIn", onComplete: () => { shot.destroy(); burst(to); } });
}

// A blue shield shape pops up where the block lands.
export function block(scene: Phaser.Scene, from: Point, to?: Point): void {
  const at = to ?? from;
  const g = scene.add.graphics().setDepth(DEPTH).setPosition(at.x, at.y).setAlpha(0);
  g.fillStyle(0x4a6fa5, 0.85);
  g.lineStyle(6, 0xdbe6f5, 1);
  g.beginPath();
  [[-34, -38], [34, -38], [34, 4], [0, 44], [-34, 4]].forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
  g.fillPath();
  g.strokePath();
  scene.tweens.add({
    targets: g, alpha: { from: 1, to: 0 }, scale: { from: 0.3, to: 1.4 }, duration: scaleTime(P.effects.ms + 150), ease: "Back.easeOut",
    onStart: () => g.setAlpha(1), onComplete: done(g),
  });
}

// Gold discs pop up from the cap.
export function coins(scene: Phaser.Scene, at: Point): void {
  for (let i = 0; i < 5; i++) {
    const c = scene.add.circle(at.x + (i - 2) * 22, at.y + 10, 11, 0xffd23f).setStrokeStyle(3, 0x9a6a00).setDepth(DEPTH).setAlpha(0);
    scene.tweens.add({
      targets: c, y: at.y - 70 - (i % 2) * 20, alpha: { from: 1, to: 0 }, delay: scaleTime(i * 50), duration: scaleTime(P.effects.ms + 200), ease: "Cubic.easeOut",
      onStart: () => c.setAlpha(1), onComplete: done(c),
    });
  }
}

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
  ring(scene, at, 0xffffff, 40, 2.2, P.effects.ms - 100);
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
  scene.cameras.main.shake(scaleTime(P.shake.ms), P.shake.intensity + P.shake.perTier * Math.max(tier, 0));
}

// Jagged bolts from one node to others. (Phaser's own random: looks only.)
export function lightning(scene: Phaser.Scene, a: Point, targets: Point[]): void {
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

export interface Tally { damage: number; block: number; coins: number }

// After the last step: the cascade's total damage, block and coins count up in a pill over the
// board, then settle. Resolves when the short hold is over. Sums are of the events' own numbers.
export async function showTally(scene: Phaser.Scene, tally: Tally, color: number, at: Point): Promise<void> {
  const rows: [string, number, string][] = [];
  if (tally.damage > 0) rows.push(["damage", tally.damage, "#ff6a5f"]);
  if (tally.block > 0) rows.push(["block", tally.block, "#9cc4ff"]);
  if (tally.coins > 0) rows.push(["coins", tally.coins, "#ffd23f"]);
  if (rows.length === 0) return;
  const w = 120 + rows.length * 250;
  const pill = scene.add.graphics().setDepth(120).setPosition(at.x, at.y);
  pill.fillStyle(0x101010, 0.75);
  pill.fillRoundedRect(-w / 2, -50, w, 100, 24);
  pill.lineStyle(5, color, 1);
  pill.strokeRoundedRect(-w / 2, -50, w, 100, 24);
  const texts = rows.map(([label, , fill], i) =>
    scene.add
      .text(at.x - w / 2 + 60 + 125 + i * 250, at.y, `0 ${label}`, { fontFamily: FONT, fontSize: "44px", fontStyle: "bold", color: fill, stroke: "#101010", strokeThickness: 6 })
      .setOrigin(0.5)
      .setDepth(121),
  );
  await new Promise<void>((resolve) => {
    scene.tweens.addCounter({
      from: 0, to: 1, duration: scaleTime(P.tally.countMs), ease: "Cubic.easeOut",
      onUpdate: (t) => rows.forEach(([label, total], i) => texts[i].setText(`${Math.round(total * (t.getValue() ?? 1))} ${label}`)),
      onComplete: () => resolve(),
    });
  });
  playSound("tally");
  for (const t of texts) {
    t.setScale(1.25);
    scene.tweens.add({ targets: t, scale: 1, duration: scaleTime(P.tally.popMs), ease: "Back.easeOut" });
  }
  await new Promise<void>((resolve) => scene.time.delayedCall(scaleTime(P.tally.holdMs), resolve));
  scene.tweens.add({ targets: [pill, ...texts], alpha: 0, duration: scaleTime(250), onComplete: () => { pill.destroy(); texts.forEach((t) => t.destroy()); } });
}

export { centre };
