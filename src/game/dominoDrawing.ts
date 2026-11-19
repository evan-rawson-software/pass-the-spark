import Phaser from "phaser";
import type { Domino, Spark } from "../engine/types";
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

// One spark: its colour and shape from SPARK_STYLE, with a dark outline.
export function drawSparkGlyph(g: Phaser.GameObjects.Graphics, spark: Spark, x: number, y: number, r: number): void {
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
  const p = (x: number, y: number): Pt => ({ x, y: cy + y });
  if (kind === "damage") {
    const pts: Pt[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const k = i % 2 === 0 ? 28 : 14;
      pts.push(p(Math.cos(a) * k, Math.sin(a) * k));
    }
    polygon(g, pts, 0xd62828);
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

function drawFace(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, c: Phaser.GameObjects.Container, domino: Domino): void {
  g.fillStyle(0xf4ecd8, 1);
  g.fillRoundedRect(-W / 2, -H / 2, W, H, 14);
  g.fillStyle(0xe3d6b3, 1);
  g.fillRect(-W / 2 + 6, -H / 2 + 6, 74, H - 12);
  g.fillRect(W / 2 - 80, -H / 2 + 6, 74, H - 12);
  g.lineStyle(3, DARK, 1);
  g.lineBetween(-40, -H / 2 + 4, -40, H / 2 - 4);
  g.lineBetween(40, -H / 2 + 4, 40, H / 2 - 4);
  g.strokeRoundedRect(-W / 2, -H / 2, W, H, 14);

  drawHalf(g, domino.intake, -80);
  drawHalf(g, domino.output, 80);

  const e = domino.effect;
  drawEffectIcon(g, e.kind, -8);
  if (e.base !== undefined) {
    const t = scene.add
      .text(0, 36, String(e.base), { fontSize: "34px", fontStyle: "bold", color: "#222222", stroke: "#ffffff", strokeThickness: 4 })
      .setOrigin(0.5);
    c.add(t);
  }
  if (e.spectrum) {
    [0, 1, 2].forEach((i) => {
      g.fillStyle([0xff6a13, 0x2f80ed, 0x4cc46a][i], 1);
      g.lineStyle(1.5, DARK, 1);
      g.fillCircle(8 + i * 12, -48, 5);
      g.strokeCircle(8 + i * 12, -48, 5);
    });
  }
  if (e.ignoresBlock) {
    polygon(g, [{ x: -32, y: -55 }, { x: -16, y: -55 }, { x: -16, y: -47 }, { x: -24, y: -39 }, { x: -32, y: -47 }], 0x4a6fa5);
    line(g, [{ x: -36, y: -37 }, { x: -12, y: -57 }], 4, 0xd62828);
  }
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
    const top: Pt[] = [];
    const bottom: Pt[] = [];
    for (let i = 0; i <= 10; i++) {
      const px = -13 + (26 * i) / 10;
      const h = 8 * (1 - Math.pow(px / 13, 2));
      top.push({ x: x + px, y: y - h });
      bottom.unshift({ x: x + px, y: y + h });
    }
    polygon(g, [...top, ...bottom], 0xffffff);
    g.fillStyle(DARK, 1);
    g.fillCircle(x, y, 4.5);
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
  const g = scene.add.graphics();
  body.add(g);

  if (raised) {
    for (let i = 4; i >= 1; i--) {
      g.lineStyle(i * 5, 0xfff176, 0.12);
      g.strokeRoundedRect(-W / 2 - i * 2, -H / 2 - i * 2, W + i * 4, H + i * 4, 14 + i * 2);
    }
  }

  if (state === "hidden") {
    drawBack(g);
  } else {
    drawFace(scene, g, body, domino);
    if (state === "revealed") {
      g.lineStyle(5, 0xffd23f, 1);
      g.strokeRoundedRect(-W / 2, -H / 2, W, H, 14);
      drawBadge(g, "revealed");
    } else if (state === "playedFaceUp") {
      g.fillStyle(0x4a5568, 0.22);
      g.fillRoundedRect(-W / 2, -H / 2, W, H, 14);
      drawBadge(g, "played");
    } else if (state === "notPlayable") {
      g.fillStyle(0x10131c, 0.55);
      g.fillRoundedRect(-W / 2, -H / 2, W, H, 14);
    } else if (raised) {
      g.lineStyle(5, 0xffe14d, 1);
      g.strokeRoundedRect(-W / 2, -H / 2, W, H, 14);
    }
  }
  return c;
}
