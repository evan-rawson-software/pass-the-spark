import Phaser from "phaser";
import type { Domino, Spark } from "../engine/types";
import { artImage } from "./art";
import { SPARK_ORDER, SPARK_STYLE } from "./sparks";

// All domino drawing lives here. Placeholder art: sprites will replace this
// module. No rules: the caller says which visual state to show.

export type DominoSize = "large" | "small";
export type DominoState =
  | "normal"
  | "playable" // raised and glowing
  | "notPlayable" // dimmed
  | "hidden"; // face-down (deck stacks)

export const DOMINO_STATES: DominoState[] = [
  "normal",
  "playable",
  "notPlayable",
  "hidden",
];

const SIZE_SCALE: Record<DominoSize, number> = { large: 1, small: 0.5 };
const W = 240; // large-size units; small is the same drawing at half scale
const H = 120;
const RAISE = 14;
const DARK = 0x2a2a2a;

export function dominoPixelSize(size: DominoSize): { w: number; h: number } {
  const s = SIZE_SCALE[size];
  return { w: W * s, h: H * s };
}

type Pt = { x: number; y: number };

function polygon(g: Phaser.GameObjects.Graphics, pts: Pt[], fill: number, outline = DARK): void {
  g.fillStyle(fill, 1);
  g.lineStyle(3, outline, 1);
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.fillPath();
  g.strokePath();
}

function line(g: Phaser.GameObjects.Graphics, pts: Pt[], width: number, color: number): void {
  g.lineStyle(width, color, 1);
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.strokePath();
}

function wedge(cx: number, cy: number, r: number, a0: number, a1: number): Pt[] {
  const pts: Pt[] = [{ x: cx, y: cy }];
  for (let i = 0; i <= 6; i++) {
    const a = a0 + ((a1 - a0) * i) / 6;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

// Generated art for `key`, centred on (x, y) in the same container as `g` (or the scene, if it has
// none). False means there is none, and the caller draws the code version.
function artOn(g: Phaser.GameObjects.Graphics, key: string, x: number, y: number, size: number): boolean {
  return artImage(g.scene, key, x, y, size, size, g.parentContainer) !== null;
}

// One spark: its colour and shape from SPARK_STYLE, with a dark outline.
export function drawSparkGlyph(g: Phaser.GameObjects.Graphics, spark: Spark, x: number, y: number, r: number): void {
  if (artOn(g, `sparks/${spark}`, x, y, r * 2.4)) return;
  const { color, shape } = SPARK_STYLE[spark];
  if (shape === "circle") {
    g.fillStyle(color, 1);
    g.fillCircle(x, y, r);
    g.lineStyle(3, DARK, 1);
    g.strokeCircle(x, y, r);
  } else if (shape === "ring") {
    g.lineStyle(r * 0.5 + 6, DARK, 1);
    g.strokeCircle(x, y, r * 0.75);
    g.lineStyle(r * 0.5, color, 1);
    g.strokeCircle(x, y, r * 0.75);
  } else if (shape === "triangle") {
    polygon(g, [
      { x, y: y - r * 1.1 },
      { x: x + r * 1.05, y: y + r * 0.8 },
      { x: x - r * 1.05, y: y + r * 0.8 },
    ], color);
  } else if (shape === "diamond") {
    polygon(g, [
      { x, y: y - r * 1.2 },
      { x: x + r * 0.9, y },
      { x, y: y + r * 1.2 },
      { x: x - r * 0.9, y },
    ], color);
  } else if (shape === "wave") {
    const pts: Pt[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push({ x: x - r + t * 2 * r, y: y + Math.sin(t * Math.PI * 2) * r * 0.55 });
    }
    line(g, pts, r * 0.55 + 6, DARK);
    line(g, pts, r * 0.55, color);
  } else {
    // blot: lumpy splat with a drip
    const radii = [1, 0.62, 0.95, 0.7, 1.05, 0.6, 0.9, 0.72, 1, 0.65];
    const pts = radii.map((k, i) => {
      const a = (i / radii.length) * Math.PI * 2;
      return { x: x + Math.cos(a) * r * k, y: y + Math.sin(a) * r * k };
    });
    polygon(g, pts, color);
    g.fillStyle(color, 1);
    g.lineStyle(2, DARK, 1);
    g.fillCircle(x + r * 0.95, y - r * 0.85, r * 0.2);
    g.strokeCircle(x + r * 0.95, y - r * 0.85, r * 0.2);
  }
}

// The "any" intake: a disc cut into the six spark colours.
export function drawAnySymbol(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
  SPARK_ORDER.forEach((spark, i) => {
    const a0 = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / 6) * Math.PI * 2 - Math.PI / 2;
    polygon(g, wedge(x, y, r, a0, a1), SPARK_STYLE[spark].color, 0xffffff);
  });
  g.lineStyle(3, DARK, 1);
  g.strokeCircle(x, y, r);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(x, y, r * 0.3);
  g.strokeCircle(x, y, r * 0.3);
}

function drawHalf(g: Phaser.GameObjects.Graphics, sparks: Spark[] | "any", cx: number): void {
  if (sparks === "any") {
    drawAnySymbol(g, cx, 0, 26);
  } else if (sparks.length === 1) {
    drawSparkGlyph(g, sparks[0], cx, 0, 24);
  } else {
    drawSparkGlyph(g, sparks[0], cx, -27, 16);
    drawSparkGlyph(g, sparks[1], cx, 27, 16);
  }
}

// What an icon can show: the three cap effects, the four amplifiers and the junction.
export type IconKind = "damage" | "block" | "coins" | "add" | "mul" | "echo" | "spectrum" | "junction";

// The icon a domino's middle column shows, from its data.
export function iconOf(d: Domino): IconKind | null {
  if (d.kind === "junction") return "junction";
  if (d.kind === "cap") return d.effect?.kind ?? null;
  return d.amp ? d.amp.op : null;
}

// Effect icons, code-drawn (never from generated art), centred on (0, cy), roughly 52 units across.
// Drawn on any Graphics: callers that want one elsewhere give the Graphics a position and scale.
export function drawEffectIcon(g: Phaser.GameObjects.Graphics, kind: IconKind, cy = 0): void {
  const p = (x: number, y: number): Pt => ({ x, y: cy + y });
  if (kind === "damage") {
    // A red sword, point up, in the same style as the shield.
    polygon(g, [p(-4, -28), p(4, -28), p(6, 6), p(-6, 6)], 0xd62828);
    polygon(g, [p(-18, 6), p(18, 6), p(18, 12), p(-18, 12)], 0x8f1a1a);
    polygon(g, [p(-4, 12), p(4, 12), p(4, 24), p(-4, 24)], 0x8f1a1a);
    line(g, [p(0, -22), p(0, 2)], 3, 0xf6c9c9);
  } else if (kind === "block") {
    polygon(g, [p(-22, -24), p(22, -24), p(22, 2), p(0, 28), p(-22, 2)], 0x4a6fa5);
    line(g, [p(0, -18), p(0, 18)], 4, 0xdbe6f5);
  } else if (kind === "coins") {
    g.fillStyle(0xffd23f, 1);
    g.lineStyle(3, 0xb8860b, 1);
    g.fillCircle(0, cy, 24);
    g.strokeCircle(0, cy, 24);
    g.lineStyle(3, 0xe0a800, 1);
    g.strokeCircle(0, cy, 15);
    g.fillStyle(0xfff3a8, 0.9);
    g.fillCircle(-8, cy - 8, 4);
  } else if (kind === "add") {
    polygon(g, [p(0, -28), p(24, -2), p(10, -2), p(10, 26), p(-10, 26), p(-10, -2), p(-24, -2)], 0xf08a00);
  } else if (kind === "mul") {
    line(g, [p(-18, -18), p(18, 18)], 12, DARK);
    line(g, [p(-18, 18), p(18, -18)], 12, DARK);
    line(g, [p(-18, -18), p(18, 18)], 7, 0xa855f7);
    line(g, [p(-18, 18), p(18, -18)], 7, 0xa855f7);
  } else if (kind === "echo") {
    g.fillStyle(0x1aa6b7, 1);
    g.fillCircle(0, cy, 6);
    for (const r of [15, 26]) {
      g.lineStyle(9, DARK, 1);
      g.strokeCircle(0, cy, r);
      g.lineStyle(5, 0x1aa6b7, 1);
      g.strokeCircle(0, cy, r);
    }
  } else if (kind === "spectrum") {
    [0xff6a13, 0x2f80ed, 0x4cc46a].forEach((color, i) => {
      g.fillStyle(color, 1);
      g.lineStyle(2, 0xffffff, 1);
      const x = (i - 1) * 20;
      const y = cy + (i === 1 ? -10 : 8);
      g.fillCircle(x, y, 13);
      g.strokeCircle(x, y, 13);
    });
  } else {
    // junction: one path in, two out
    line(g, [p(-26, 0), p(-4, 0)], 9, DARK);
    line(g, [p(-4, 0), p(8, -16), p(26, -16)], 9, DARK);
    line(g, [p(-4, 0), p(8, 16), p(26, 16)], 9, DARK);
    line(g, [p(-26, 0), p(-4, 0)], 5, 0xf4ecd8);
    line(g, [p(-4, 0), p(8, -16), p(26, -16)], 5, 0xf4ecd8);
    line(g, [p(-4, 0), p(8, 16), p(26, 16)], 5, 0xf4ecd8);
  }
}

// The number printed under the icon: an amplifier's amount (+1, ×2) or a cap's base.
export function iconNumber(d: Domino): string {
  if (d.kind === "cap") return d.effect ? String(d.effect.base) : "";
  if (d.kind === "amplifier" && d.amp) return (d.amp.op === "mul" ? "×" : "+") + d.amp.value;
  return "";
}

// Draws the face; returns the number text, if any, so the caller can keep it above overlays.
function drawFace(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, c: Phaser.GameObjects.Container, domino: Domino, tileArt: boolean): Phaser.GameObjects.Text | null {
  if (!tileArt) {
    g.fillStyle(0xf4ecd8, 1);
    g.fillRoundedRect(-W / 2, -H / 2, W, H, 14);
    g.fillStyle(0xe3d6b3, 1);
    g.fillRect(-W / 2 + 6, -H / 2 + 6, 74, H - 12);
    g.fillRect(W / 2 - 80, -H / 2 + 6, 74, H - 12);
    g.lineStyle(3, DARK, 1);
    g.lineBetween(-40, -H / 2 + 4, -40, H / 2 - 4);
    g.lineBetween(40, -H / 2 + 4, 40, H / 2 - 4);
    g.strokeRoundedRect(-W / 2, -H / 2, W, H, 14);
  }

  drawHalf(g, domino.intake, -80);
  if (domino.kind === "cap") {
    // A cap closes its branch: no outputs, just a solid end.
    g.fillStyle(0x6b727c, 1);
    g.fillRoundedRect(W / 2 - 80, -H / 2 + 6, 74, H - 12, 8);
    g.fillStyle(DARK, 1);
    g.fillRect(W / 2 - 18, -H / 2 + 6, 12, H - 12);
  } else {
    drawHalf(g, domino.output, 80);
  }

  const kind = iconOf(domino);
  if (kind) drawEffectIcon(g, kind, -4);
  let text: Phaser.GameObjects.Text | null = null;
  const number = iconNumber(domino);
  if (number) {
    const t = scene.add
      .text(0, 36, number, { fontSize: "34px", fontStyle: "bold", color: "#222222", stroke: "#ffffff", strokeThickness: 4 })
      .setOrigin(0.5);
    c.add(t);
    text = t;
  }
  // The ignores-block chip sits in the top band of the middle column (y -56 to -34).
  const e = domino.effect;
  if (e?.ignoresBlock && artOn(g, "ui/ignores_block", -20, -45, 30)) {
    // art shown
  } else if (e?.ignoresBlock) {
    g.fillStyle(DARK, 1);
    g.fillRoundedRect(-38, -56, 36, 22, 6);
    polygon(g, [{ x: -29, y: -52 }, { x: -11, y: -52 }, { x: -11, y: -45 }, { x: -20, y: -37 }, { x: -29, y: -45 }], 0x8fb4ea, 0xffffff);
    line(g, [{ x: -33, y: -37 }, { x: -7, y: -53 }], 5, 0xff3b3b);
  }
  return text;
}

function drawBack(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x2c3e6b, 1);
  g.fillRoundedRect(-W / 2, -H / 2, W, H, 14);
  g.lineStyle(2, 0x4d6199, 1);
  for (let x = -W / 2 + 40; x < W / 2 - 8; x += 20) {
    g.lineBetween(x, -H / 2 + 8, x - 30, H / 2 - 8);
  }
  g.fillStyle(0x2c3e6b, 1);
  g.fillCircle(0, 0, 30);
  g.lineStyle(4, 0xd9b44a, 1);
  g.strokeCircle(0, 0, 30);
  polygon(g, [{ x: 0, y: -18 }, { x: 13, y: 0 }, { x: 0, y: 18 }, { x: -13, y: 0 }], 0xd9b44a, 0x2c3e6b);
  g.lineStyle(3, DARK, 1);
  g.strokeRoundedRect(-W / 2, -H / 2, W, H, 14);
}

// Builds a domino centred on (0, 0) of the returned container. The caller
// positions it. `domino` is ignored for the "hidden" state.
export function drawDomino(scene: Phaser.Scene, domino: Domino, size: DominoSize, state: DominoState): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  c.setScale(SIZE_SCALE[size]);
  c.setSize(W, H);

  const shadow = scene.add.graphics();
  const raised = state === "playable";
  shadow.fillStyle(0x000000, raised ? 0.35 : 0.25);
  shadow.fillRoundedRect(-W / 2 + 4, -H / 2 + 8, W, H, 14);
  c.add(shadow);

  const body = scene.add.container(0, raised ? -RAISE : 0);
  c.add(body);
  // The tile image, if any, is the lowest thing on the face: the graphics layer (and the fallback
  // drawings on it) and the glyph images all sit above it.
  const tile = state === "hidden" ? "hidden" : (domino.rarity ?? "starter");
  const tileArt = artImage(scene, `tiles/${tile}`, 0, 0, W, H, body) !== null;
  const g = scene.add.graphics();
  body.add(g);

  if (raised) {
    for (let i = 4; i >= 1; i--) {
      g.lineStyle(i * 5, 0xfff176, 0.12);
      g.strokeRoundedRect(-W / 2 - i * 2, -H / 2 - i * 2, W + i * 4, H + i * 4, 14 + i * 2);
    }
  }

  // State marks go on their own layer, above any art, with the number text kept above them.
  if (state === "hidden") {
    if (!tileArt) drawBack(g);
  } else {
    const text = drawFace(scene, g, body, domino, tileArt);
    const over = scene.add.graphics();
    body.add(over);
    if (state === "notPlayable") {
      over.fillStyle(0x10131c, 0.55);
      over.fillRoundedRect(-W / 2, -H / 2, W, H, 14);
    } else if (raised) {
      over.lineStyle(5, 0xffe14d, 1);
      over.strokeRoundedRect(-W / 2, -H / 2, W, H, 14);
    }
    if (text) body.bringToTop(text);
  }
  return c;
}
