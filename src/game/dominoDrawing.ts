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
  | "hidden" // face-down enemy domino
  | "revealed" // face-up enemy domino with a marker
  | "playedFaceUp"; // face-up played enemy domino (deck area)

export const DOMINO_STATES: DominoState[] = [
  "normal",
  "playable",
  "notPlayable",
  "hidden",
  "revealed",
  "playedFaceUp",
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

// Effect icons, centred on (0, cy), roughly 52 units across.
function drawEffectIcon(g: Phaser.GameObjects.Graphics, kind: string, cy: number): void {
  // Effect icons are always drawn in code, never from generated art.
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
  } else if (kind === "heal") {
    polygon(g, [
      p(-7, -26), p(7, -26), p(7, -7), p(26, -7), p(26, 7), p(7, 7),
      p(7, 26), p(-7, 26), p(-7, 7), p(-26, 7), p(-26, -7), p(-7, -7),
    ], 0x2e9e4f);
  } else if (kind === "amplify") {
    polygon(g, [p(0, -28), p(24, -2), p(10, -2), p(10, 26), p(-10, 26), p(-10, -2), p(-24, -2)], 0xf08a00);
  } else if (kind === "echo") {
    g.fillStyle(0x1aa6b7, 1);
    g.fillCircle(0, cy, 6);
    for (const r of [15, 26]) {
      g.lineStyle(9, DARK, 1);
      g.strokeCircle(0, cy, r);
      g.lineStyle(5, 0x1aa6b7, 1);
      g.strokeCircle(0, cy, r);
    }
  } else if (kind === "mimic") {
    g.lineStyle(3, DARK, 1);
    g.fillStyle(0xe8a8d4, 1);
    g.fillRect(-26, cy - 26, 32, 32);
    g.strokeRect(-26, cy - 26, 32, 32);
    g.fillStyle(0xc2409a, 1);
    g.fillRect(-6, cy - 6, 32, 32);
    g.strokeRect(-6, cy - 6, 32, 32);
  } else if (kind === "reflect") {
    polygon(g, [p(-26, -18), p(6, -18), p(6, -28), p(26, -12), p(6, 4), p(6, -6), p(-26, -6)], 0x5b6b8c);
    polygon(g, [p(26, 18), p(-6, 18), p(-6, 28), p(-26, 12), p(-6, -4), p(-6, 6), p(26, 6)], 0x5b6b8c);
  } else if (kind === "lookout") {
    const top: Pt[] = [];
    const bottom: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const x = -28 + (56 * i) / 12;
      const h = 17 * (1 - Math.pow(x / 28, 2));
      top.push(p(x, -h));
      bottom.unshift(p(x, h));
    }
    polygon(g, [...top, ...bottom], 0xffffff);
    g.fillStyle(0x3b5b92, 1);
    g.fillCircle(0, cy, 10);
    g.fillStyle(DARK, 1);
    g.fillCircle(0, cy, 5);
  }
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
  drawHalf(g, domino.output, 80);

  const e = domino.effect;
  drawEffectIcon(g, e.kind, -4);
  let text: Phaser.GameObjects.Text | null = null;
  if (e.base !== undefined) {
    const t = scene.add
      .text(0, 36, String(e.base), { fontSize: "34px", fontStyle: "bold", color: "#222222", stroke: "#ffffff", strokeThickness: 4 })
      .setOrigin(0.5);
    c.add(t);
    text = t;
  }
  // Flag chips in the top band of the middle column (y -56 to -34).
  if (e.ignoresBlock && artOn(g, "ui/ignores_block", -20, -45, 30)) {
    // art shown
  } else if (e.ignoresBlock) {
    g.fillStyle(DARK, 1);
    g.fillRoundedRect(-38, -56, 36, 22, 6);
    polygon(g, [{ x: -29, y: -52 }, { x: -11, y: -52 }, { x: -11, y: -45 }, { x: -20, y: -37 }, { x: -29, y: -45 }], 0x8fb4ea, 0xffffff);
    line(g, [{ x: -33, y: -37 }, { x: -7, y: -53 }], 5, 0xff3b3b);
  }
  if (e.spectrum && artOn(g, "ui/spectrum", 21, -45, 30)) {
    // art shown
  } else if (e.spectrum) {
    g.fillStyle(DARK, 1);
    g.fillRoundedRect(2, -56, 38, 22, 6);
    [0xff6a13, 0x2f80ed, 0x4cc46a].forEach((color, i) => {
      g.fillStyle(color, 1);
      g.lineStyle(1.5, 0xffffff, 1);
      g.fillCircle(10 + i * 11, -45, 5.5);
      g.strokeCircle(10 + i * 11, -45, 5.5);
    });
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

// Small round badge in the top-left corner of a face-up enemy domino.
function drawBadge(g: Phaser.GameObjects.Graphics, kind: "revealed" | "played"): void {
  const x = -W / 2 + 6;
  const y = -H / 2 + 6;
  g.fillStyle(kind === "revealed" ? 0xffd23f : 0x9aa3b2, 1);
  g.lineStyle(3, DARK, 1);
  g.fillCircle(x, y, 20);
  g.strokeCircle(x, y, 20);
  if (kind === "revealed") {
    // Gold diamond on navy, echoing the card back: "was hidden, now shown".
    g.fillStyle(0x2c3e6b, 1);
    g.fillCircle(x, y, 17);
    polygon(g, [{ x, y: y - 12 }, { x: x + 9, y }, { x, y: y + 12 }, { x: x - 9, y }], 0xffd23f, 0xffffff);
  } else {
    line(g, [{ x: x - 9, y }, { x: x - 2, y: y + 8 }, { x: x + 10, y: y - 8 }], 5, 0xffffff);
  }
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
  const enemy = state === "revealed" || state === "playedFaceUp";
  const tile = state === "hidden" ? "hidden" : enemy ? "enemy" : (domino.rarity ?? "starter");
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
    if (state === "revealed") {
      over.lineStyle(5, 0xffd23f, 1);
      over.strokeRoundedRect(-W / 2, -H / 2, W, H, 14);
      drawBadge(over, "revealed");
    } else if (state === "playedFaceUp") {
      over.fillStyle(0x4a5568, 0.22);
      over.fillRoundedRect(-W / 2, -H / 2, W, H, 14);
      drawBadge(over, "played");
    } else if (state === "notPlayable") {
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

// "Doesn't scale with lap": a small round symbol (a lap arrow crossed out) in the top-right corner.
// The caller decides when to add it (the engine's ignoresLap says). Uses the generated ui/no_lap
// image when there is one, else the code drawing. Added to the container, above the tile and marks.
export function addNoLapSymbol(scene: Phaser.Scene, c: Phaser.GameObjects.Container): void {
  const x = W / 2 - 4;
  const y = -H / 2 + 4;
  if (artImage(scene, "ui/no_lap", x, y, 40, 40, c) !== null) return;
  const g = scene.add.graphics();
  g.fillStyle(0x1e2a44, 1);
  g.lineStyle(3, 0xffffff, 1);
  g.fillCircle(x, y, 18);
  g.strokeCircle(x, y, 18);
  g.lineStyle(4, 0xffe14d, 1);
  g.beginPath();
  g.arc(x, y, 9, 0.5, Math.PI * 1.75);
  g.strokePath();
  polygon(g, [{ x: x + 9, y: y - 9 }, { x: x + 15, y: y - 1 }, { x: x + 4, y: y - 2 }], 0xffe14d, 0xffe14d);
  line(g, [{ x: x - 13, y: y + 13 }, { x: x + 13, y: y - 13 }], 4, 0xff3b3b);
  c.add(g);
}
