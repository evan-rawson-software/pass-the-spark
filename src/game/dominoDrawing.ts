import Phaser from "phaser";
import type { Domino, DominoKind, Spark } from "../engine/types";
import { artImage } from "./art";
import { dominoLook, hexColour } from "./presentation";
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
const L = dominoLook;
const U = L.unit;
const DARK = 0x2a2a2a;
const OUTLINE = hexColour(L.colours.outline);
const W = L.extent.amplifier.w * U; // the common cell width: every kind's socket sits on its left edge
const H = L.extent.amplifier.h * U; // the hidden back, and the bar height of every kind
const RAISE = L.raise;

// A domino's size on screen. With a kind, that kind's exact size (a junction is taller, a cap
// narrower); without one, the cell any kind fits in, for laying out a row or grid.
export function dominoPixelSize(size: DominoSize, kind?: DominoKind): { w: number; h: number } {
  const s = SIZE_SCALE[size];
  if (kind) return { w: L.extent[kind].w * U * s, h: L.extent[kind].h * U * s };
  return { w: W * s, h: L.extent.junction.h * U * s };
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

// What an icon can show: the three cap effects, the four amplifiers and the junction.
export type IconKind = "damage" | "block" | "add" | "mul" | "echo" | "spectrum" | "junction";

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


// The number in the middle: an amplifier's amount (+1, ×2, an echo's repeat count) or a cap's base.
// A Spectrum shows its icon only, since its value depends on the path.
export function iconNumber(d: Domino): string {
  if (d.kind === "cap") return d.effect ? String(d.effect.base) : "";
  if (d.kind === "amplifier" && d.amp && d.amp.op !== "spectrum") return (d.amp.op === "mul" ? "×" : "+") + d.amp.value;
  return "";
}

// ---- Silhouettes. Points are in mockup units, converted to pixels by toPx.

function arc(cx: number, cy: number, r: number, a0: number, a1: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = a0 + ((a1 - a0) * i) / 10;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

const HALF_PI = Math.PI / 2;
// The socket notch, bottom to top through the inside of the face.
const NOTCH = (): Pt[] => arc(0, 50, 22, HALF_PI, -HALF_PI);

function outline(kind: DominoKind): Pt[] {
  if (kind === "amplifier") {
    return [{ x: 0, y: 0 }, { x: 175, y: 0 }, { x: 216, y: 50 }, { x: 175, y: 100 }, { x: 0, y: 100 }, ...NOTCH()];
  }
  if (kind === "junction") {
    return [
      { x: 0, y: 0 }, { x: 105, y: 0 }, { x: 130, y: -18 }, { x: 214, y: -18 }, { x: 214, y: 40 }, { x: 150, y: 40 },
      { x: 150, y: 60 }, { x: 214, y: 60 }, { x: 214, y: 118 }, { x: 130, y: 118 }, { x: 105, y: 100 }, { x: 0, y: 100 },
      ...NOTCH(),
    ];
  }
  return [{ x: 0, y: 0 }, { x: 120, y: 0 }, ...arc(120, 50, 50, -HALF_PI, HALF_PI), { x: 0, y: 100 }, ...NOTCH()];
}

// Mockup units to pixels in the body container: socket edge at the cell's left, bar centred on y 0.
function toPx(p: Pt): Pt {
  return { x: -W / 2 + p.x * U, y: (p.y - 50) * U };
}

function pathOf(kind: DominoKind): Pt[] {
  return outline(kind).map(toPx);
}

function fillPath(g: Phaser.GameObjects.Graphics, pts: Pt[]): void {
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.fillPath();
}

function strokePathOf(g: Phaser.GameObjects.Graphics, pts: Pt[], width: number, color: number, alpha = 1): void {
  g.lineStyle(width, color, alpha);
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.strokePath();
}

function faceColour(d: Domino): number {
  if (d.kind === "amplifier") return hexColour(L.colours.amplifier);
  if (d.kind === "junction") return hexColour(L.colours.junction);
  // Damage is red and block is blue; any other cap (a coins cap, until #221 removes it) gets the neutral tint.
  const kind = d.effect?.kind;
  return hexColour(kind === "damage" || kind === "block" ? L.colours.cap[kind] : L.colours.cap.other);
}

// The intake: the notch ringed in its spark's colour, with the glyph inside. Two sparks split the
// ring and show both glyphs; "any" shows the any symbol.
function drawSocket(g: Phaser.GameObjects.Graphics, sparks: Spark[] | "any"): void {
  const k = L.socket;
  const c = toPx({ x: k.x, y: k.y });
  const origin = toPx({ x: 0, y: 50 });
  const ringR = 22 * U;
  const ring = (a0: number, a1: number, colour: number) => {
    const pts = arc(origin.x, origin.y, ringR, a0, a1);
    g.lineStyle(k.ring * U, colour, 1);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.strokePath();
  };
  if (sparks === "any") {
    ring(HALF_PI, -HALF_PI, hexColour(L.colours.anyRing));
    drawAnySymbol(g, c.x, c.y, k.glyph * U);
  } else if (sparks.length === 1) {
    ring(HALF_PI, -HALF_PI, SPARK_STYLE[sparks[0]].color);
    drawSparkGlyph(g, sparks[0], c.x, c.y, k.glyph * U);
  } else {
    ring(0, -HALF_PI, SPARK_STYLE[sparks[0]].color);
    ring(HALF_PI, 0, SPARK_STYLE[sparks[1]].color);
    drawSparkGlyph(g, sparks[0], c.x + k.dualDx * U, c.y - k.dualDy * U, k.dualGlyph * U);
    drawSparkGlyph(g, sparks[1], c.x + k.dualDx * U, c.y + k.dualDy * U, k.dualGlyph * U);
  }
}

function star(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -HALF_PI + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
  }
  polygon(g, pts, hexColour(L.colours.star), OUTLINE);
}

function gem(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, rarity: "common" | "uncommon" | "rare"): void {
  const colour = hexColour(L.colours.rarity[rarity]);
  if (rarity === "rare") {
    for (let i = 3; i >= 1; i--) {
      g.fillStyle(colour, 0.14);
      g.fillCircle(x, y, r + i * 4);
    }
  }
  polygon(g, [{ x, y: y - r }, { x: x + r, y }, { x, y: y + r }, { x: x - r, y }], colour, OUTLINE);
  g.fillStyle(0xffffff, 0.7);
  g.fillTriangle(x, y - r * 0.6, x + r * 0.45, y - r * 0.1, x - r * 0.1, y - r * 0.1);
}

// The ignores-block sigil: a dark disc ringed in gold, with a crossed-out shield (or the art).
function sigil(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
  const k = L.sigil;
  g.fillStyle(hexColour(L.colours.sigilFill), 1);
  g.fillCircle(x, y, r);
  g.lineStyle(k.ring, hexColour(L.colours.sigilRing), 1);
  g.strokeCircle(x, y, r);
  if (artOn(g, "ui/ignores_block", x, y, r * 1.5)) return;
  const q = r / 15;
  polygon(g, [
    { x: x - 7 * q, y: y - 8 * q }, { x: x + 7 * q, y: y - 8 * q }, { x: x + 7 * q, y: y },
    { x, y: y + 9 * q }, { x: x - 7 * q, y: y },
  ], 0x8fb4ea, 0xffffff);
  line(g, [{ x: x - 10 * q, y: y + 8 * q }, { x: x + 10 * q, y: y - 9 * q }], 3.5 * q, 0xff3b3b);
}

function icon(scene: Phaser.Scene, body: Phaser.GameObjects.Container, kind: IconKind, at: { x: number; y: number }, scale: number): void {
  const p = toPx(at);
  const ig = scene.add.graphics().setPosition(p.x, p.y).setScale(scale * U);
  body.add(ig);
  drawEffectIcon(ig, kind);
}

function numberText(scene: Phaser.Scene, body: Phaser.GameObjects.Container, text: string, at: { x: number; y: number; size: number }): void {
  const p = toPx(at);
  const t = scene.add
    .text(p.x, p.y, text, { fontFamily: "Arial, Helvetica, sans-serif", fontSize: `${Math.round(at.size * U)}px`, fontStyle: "bold", color: L.colours.text })
    .setOrigin(0.5);
  body.add(t);
}

// Draws the face: everything inside the silhouette. `detail` shows the stripe, gem and star.
function drawFace(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, body: Phaser.GameObjects.Container, d: Domino, owner: number | undefined, detail: boolean): void {
  const pts = pathOf(d.kind);
  g.fillStyle(faceColour(d), 1);
  fillPath(g, pts);
  if (d.kind === "junction") {
    g.lineStyle(L.junctionSplit.width * U, hexColour(L.colours.junctionSplit), 1);
    for (const [a, b] of L.junctionSplit.lines) {
      const p = toPx({ x: a[0], y: a[1] });
      const q = toPx({ x: b[0], y: b[1] });
      g.lineBetween(p.x, p.y, q.x, q.y);
    }
  }
  strokePathOf(g, pts, L.strokeWidth * U, OUTLINE);

  if (owner !== undefined && detail) {
    const k = L.stripe;
    const barLen = d.kind === "amplifier" ? 175 : d.kind === "junction" ? 105 : 120;
    const p = toPx({ x: k.x, y: k.y });
    const w = (barLen - k.trim) * U;
    g.fillStyle(owner, 1);
    g.fillRoundedRect(p.x, p.y, w, k.h * U, (k.h * U) / 2);
    g.lineStyle(k.outline, OUTLINE, 1);
    g.strokeRoundedRect(p.x, p.y, w, k.h * U, (k.h * U) / 2);
  }

  drawSocket(g, d.intake);
  const outs = d.kind === "amplifier" ? L.outputs.amplifier : d.kind === "junction" ? L.outputs.junction : [];
  outs.forEach((o, i) => {
    const p = toPx(o);
    drawSparkGlyph(g, d.output[i] ?? d.output[0], p.x, p.y, L.outputs.glyph * U);
  });

  const kind = iconOf(d);
  const n = L.number;
  if (d.kind === "amplifier" && kind) {
    if (d.amp?.op === "spectrum") {
      icon(scene, body, kind, n.spectrumIcon, n.spectrumIcon.scale);
    } else {
      icon(scene, body, kind, n.amplifierIcon, n.iconScale);
      numberText(scene, body, iconNumber(d), n.amplifier);
    }
  } else if (d.kind === "cap" && kind) {
    icon(scene, body, kind, n.capIcon, n.capIcon.scale);
    numberText(scene, body, iconNumber(d), n.cap);
  }

  if (d.kind === "cap" && d.effect?.ignoresBlock) {
    const p = toPx(L.sigil);
    sigil(g, p.x, p.y, L.sigil.r * U);
  }
  if (detail && d.upgraded && d.upgraded.length > 0) {
    const p = toPx(L.star);
    star(g, p.x, p.y, L.star.r * U);
  }
  if (detail && d.rarity) {
    const p = toPx(L.gem[d.kind]);
    gem(g, p.x, p.y, L.gem.r * U, d.rarity);
  }
}

// The face-down back: a plain rectangle, a pile and not a domino.
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

export interface DominoOptions {
  owner?: number; // the owner stripe's colour (a seat colour); none draws no stripe
  scale?: number; // the scale the caller will show it at, if not its size's: small shows hide the stripe, gem and star
}

// Builds a domino centred on (0, 0) of the returned container: its socket edge on the left of the
// cell, the bar centred vertically. The caller positions it. `domino` is ignored for "hidden".
export function drawDomino(scene: Phaser.Scene, domino: Domino, size: DominoSize, state: DominoState, opts: DominoOptions = {}): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  c.setScale(SIZE_SCALE[size]);
  const hidden = state === "hidden";
  c.setSize(W, hidden ? H : L.extent[domino.kind].h * U);

  const raised = state === "playable";
  const pts = hidden ? [] : pathOf(domino.kind);
  const shadow = scene.add.graphics();
  shadow.fillStyle(0x000000, raised ? L.shadow.raisedAlpha : L.shadow.alpha);
  if (hidden) shadow.fillRoundedRect(-W / 2 + L.shadow.dx, -H / 2 + L.shadow.dy, W, H, 14);
  else fillPath(shadow.setPosition(L.shadow.dx, L.shadow.dy), pts);
  c.add(shadow);

  const body = scene.add.container(0, raised ? -RAISE : 0);
  c.add(body);
  if (hidden) {
    const artShown = artImage(scene, "tiles/hidden", 0, 0, W, H, body) !== null;
    const g = scene.add.graphics();
    body.add(g);
    if (!artShown) drawBack(g);
    return c;
  }

  const g = scene.add.graphics();
  body.add(g);
  if (raised) strokePathOf(g, pts, L.playable.glowWidth, hexColour(L.colours.glow), L.playable.glowAlpha);
  const detail = (opts.scale ?? SIZE_SCALE[size]) >= L.minDetailScale;
  drawFace(scene, g, body, domino, opts.owner, detail);

  // State marks go on their own layer, above any art and the number.
  const over = scene.add.graphics();
  body.add(over);
  if (state === "notPlayable") {
    over.fillStyle(0x10131c, L.dimAlpha);
    fillPath(over, pts);
  } else if (raised) {
    strokePathOf(over, pts, L.playable.outlineWidth, 0xffe14d);
  }
  return c;
}
