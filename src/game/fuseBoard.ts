import Phaser from "phaser";
import type { Board, PlayPreview } from "../engine/battle";
import { getOpenEnds, previewPlay, removeFromBoard } from "../engine/battle";
import type { BattleView } from "../engine/view";
import type { Domino, DominoKind, Spark } from "../engine/types";
import { drawDomino, drawSparkGlyph, dominoPixelSize } from "./dominoDrawing";
import { drawPadlock } from "./passiveIcon";
import { drawBlessedGlow } from "./sparkShrineArt";
import { reducedFlashing } from "./comfort";
import { scaleTime } from "./playbackSpeed";
import { battleWizardsData, dominoLook, fuseBoardData as D, hexColour } from "./presentation";
import { SPARK_STYLE } from "./sparks";

// The fuse board (#229, taking over #218's screen part): small dominoes joined by fuses, a charge
// badge on each fuse and a dashed ghost ring on each open end. Layout and drawing only: every number
// (charges, previews, which ends are legal) is given by the caller from the engine, and nothing here
// works out a rule. Sizes are in data/presentation.json ("fuseBoard").
//
// The tree is laid out at the board scale (opener on the left, growing right, fanning at junctions)
// and only shrinks, as a whole, when it outgrows its area.

const FONT = "Arial, Helvetica, sans-serif";
const L = dominoLook;
const U = L.unit;

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
type Layer = Phaser.GameObjects.Container;

// A domino's own silhouette size at scale 1 (a junction is taller, a cap narrower).
const sizeOf = (kind: DominoKind) => dominoPixelSize("large", kind);

// The tree's area, from data: the inner box of the arcane circle (battleWizards.circle.inner), so the tree
// stays inside the circle and clear of the wizards on its rim (#264). CombatScene reads it from here.
export function boardArea(): Rect {
  return { ...battleWizardsData.circle.inner };
}

// ---- layout (pure geometry, in nominal px at the board scale) ----

export interface TreeTile { id: number; kind: DominoKind; cx: number; cy: number; w: number; h: number; socket: Pt }
export interface TreeRing { end: number; cx: number; cy: number }
export interface TreeFuse {
  end: number;
  child: number | null; // the node it feeds; null for an open end
  from: Pt; // the output (nose or prong tip) it leaves
  to: Pt; // the socket (or the ghost ring's edge) it reaches
  pts: Pt[]; // the curve, sampled
  badge: Pt | null; // where the charge badge sits (null for an open end: its ring carries the charge)
}
export interface TreeLayout {
  tiles: Map<number, TreeTile>;
  rings: Map<number, TreeRing>;
  fuses: TreeFuse[];
  x0: number; y0: number; x1: number; y1: number; // bounds
}

interface Cells {
  nodes: Map<number, number>; // node id -> row
  ends: Map<number, number>; // open end id -> row
  rows: number;
}

// Which row each domino and open end sits on. A branch gets its own rows, a junction sits between its
// branches (all three of a Hall of Mirrors junction), a straight run stays on one row. Rows may be
// fractional. No rules: the tree is whatever the board holds.
function rowsOf(board: Board): Cells {
  const child = new Map<number, number>(); // end id -> the node attached to it
  for (const n of board.nodes) if (n.end !== null) child.set(n.end, n.id);
  const outs = (node: number) => board.ends.filter((e) => e.node === node);
  const span = (node: number): number =>
    Math.max(1, outs(node).reduce((total, e) => total + (child.has(e.id) ? span(child.get(e.id)!) : 1), 0));
  const lay: Cells = { nodes: new Map(), ends: new Map(), rows: 1 };
  const place = (node: number, top: number): number => {
    const rows: number[] = [];
    let cursor = top;
    for (const e of outs(node)) {
      const c = child.get(e.id);
      if (c === undefined) {
        lay.ends.set(e.id, cursor);
        rows.push(cursor);
        cursor += 1;
      } else {
        rows.push(place(c, cursor));
        cursor += span(c);
      }
    }
    const row = rows.length > 0 ? (rows[0] + rows[rows.length - 1]) / 2 : top;
    lay.nodes.set(node, row);
    return row;
  };
  if (board.nodes.length > 0) {
    place(0, 0);
    lay.rows = span(0);
  }
  return lay;
}

// Where output `index` of `count` leaves a tile, from the tile's middle at scale 1. A junction's
// outputs sit at its prong tips; a third (Hall of Mirrors) fans evenly between them.
function outputOffset(kind: DominoKind, index: number, count: number): Pt {
  const w = L.extent[kind].w;
  if (kind === "junction") {
    const [a, b] = L.outputs.junction;
    const t = count <= 1 ? 0.5 : index / (count - 1);
    // The ones between the two prongs come out of the gap between them, at its inner end.
    const x = t > 0 && t < 1 ? D.junctionGapX : a.x;
    return { x: (x - w / 2) * U, y: (a.y + (b.y - a.y) * t - 50) * U };
  }
  const o = L.outputs.amplifier[0];
  return { x: (o.x - w / 2) * U, y: (o.y - 50) * U };
}

function socketOffset(kind: DominoKind): Pt {
  return { x: (-L.extent[kind].w / 2 + L.socket.x) * U, y: 0 };
}

function curve(a: Pt, b: Pt): Pt[] {
  const dx = (b.x - a.x) * D.fuse.bend;
  const c1 = { x: a.x + dx, y: a.y };
  const c2 = { x: b.x - dx, y: b.y };
  const pts: Pt[] = [];
  const n = 20;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push({
      x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
    });
  }
  return pts;
}

function overlap(a: Rect, b: Rect, pad: number): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

// The tree at the board scale, opener on the left growing right. Positions are centres in px; the
// caller shifts and scales the whole thing into its area.
export function layoutTree(board: Board, dominoes: Domino[]): TreeLayout {
  const s = D.scale;
  const cells = rowsOf(board);
  const R = D.ringRadius;
  const out: TreeLayout = { tiles: new Map(), rings: new Map(), fuses: [], x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const grow = (x0: number, y0: number, x1: number, y1: number) => {
    out.x0 = Math.min(out.x0, x0); out.y0 = Math.min(out.y0, y0);
    out.x1 = Math.max(out.x1, x1); out.y1 = Math.max(out.y1, y1);
  };
  const kindOf = (id: string): DominoKind => {
    const d = dominoes.find((x) => x.id === id);
    if (!d) throw new Error("no such domino " + id);
    return d.kind;
  };
  const left = new Map<number, number>(); // each tile's left edge
  for (const n of board.nodes) {
    const kind = kindOf(n.domino);
    const w = sizeOf(kind).w * s;
    const h = sizeOf(kind).h * s;
    let x = 0;
    if (n.end !== null) {
      const p = out.tiles.get(board.ends.find((e) => e.id === n.end)!.node)!;
      x = left.get(p.id)! + p.w + D.gap;
    }
    left.set(n.id, x);
    const so = socketOffset(kind);
    const cx = x + w / 2;
    const cy = cells.nodes.get(n.id)! * D.rowPitch;
    out.tiles.set(n.id, { id: n.id, kind, cx, cy, w, h, socket: { x: cx + so.x * s, y: cy } });
    grow(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
  }
  const attached = new Map<number, number>();
  for (const n of board.nodes) if (n.end !== null) attached.set(n.end, n.id);
  const count = new Map<number, number>();
  for (const e of board.ends) count.set(e.node, (count.get(e.node) ?? 0) + 1);
  const lockOut = Math.max(R, D.ring.badgeDx + D.ring.badgeR);
  const upOut = Math.max(R, -D.ring.badgeDy + D.ring.badgeR);
  for (const e of board.ends) {
    const parent = out.tiles.get(e.node);
    if (!parent) continue;
    const o = outputOffset(parent.kind, e.index, count.get(e.node) ?? 1);
    const from = { x: parent.cx + o.x * s, y: parent.cy + o.y * s };
    const childId = attached.get(e.id);
    let to: Pt;
    if (childId !== undefined) {
      to = out.tiles.get(childId)!.socket;
    } else {
      const cx = left.get(e.node)! + parent.w + D.gap + R;
      const cy = cells.ends.get(e.id)! * D.rowPitch;
      out.rings.set(e.id, { end: e.id, cx, cy });
      grow(cx - R, cy - upOut, cx + lockOut, cy + R);
      to = { x: cx - R, y: cy };
    }
    out.fuses.push({ end: e.id, child: childId ?? null, from, to, pts: curve(from, to), badge: null });
  }

  // Badges: on the fuse's midpoint, nudged along it until clear of every tile, ring and earlier badge.
  const solids: Rect[] = [];
  out.tiles.forEach((t) => solids.push({ x: t.cx - t.w / 2, y: t.cy - t.h / 2, w: t.w, h: t.h }));
  out.rings.forEach((r) => solids.push({ x: r.cx - R, y: r.cy - upOut, w: R + lockOut, h: upOut + R }));
  const B = D.badge;
  const boxAt = (p: Pt): Rect => ({ x: p.x - B.w / 2, y: p.y - B.h / 2, w: B.w, h: B.h });
  for (const f of out.fuses) {
    if (f.child === null) continue;
    let best: Pt = f.pts[Math.round(f.pts.length / 2)];
    let bestHits = Infinity;
    for (const t of B.nudge) {
      const p = f.pts[Math.round(t * (f.pts.length - 1))];
      const hits = solids.filter((r) => overlap(boxAt(p), r, B.clearance)).length;
      if (hits < bestHits) {
        best = p;
        bestHits = hits;
        if (hits === 0) break;
      }
    }
    f.badge = best;
    solids.push(boxAt(best));
  }
  return out;
}

// The scale factor at which the tree fits the box: 1 (the board scale), or smaller, never below minScale.
export function fitScale(lay: TreeLayout, boxW: number, boxH: number): number {
  const f = Math.min(1, boxW / (lay.x1 - lay.x0), boxH / (lay.y1 - lay.y0));
  return Math.max(D.minScale / D.scale, f);
}

// ---- engine numbers the board shows (no rules: calls the engine and formats) ----

// The charge flowing through the fuse into each placed domino, by the end it hangs on: getOpenEnds
// on the board as it was just before that domino was played, for the player acting.
export function chargesInto(view: BattleView, player: string): Map<number, number> {
  const out = new Map<number, number>();
  for (const n of view.board.nodes) {
    if (n.end === null) continue;
    const before = { ...view, board: { ...view.board, nodes: view.board.nodes.filter((x) => x.id < n.id), ends: view.board.ends.filter((e) => e.node < n.id) } };
    const o = getOpenEnds(before, player).find((x) => x.end === n.end);
    if (o) out.set(n.end, o.charge);
  }
  return out;
}

// What each placed cap goes off for (its value times its triggers), by node id: previewPlay on the board
// without that cap (a cap is always a leaf), with the cap back in its owner's hand.
export function capTotals(view: BattleView): Map<number, number> {
  const out = new Map<number, number>();
  for (const n of view.board.nodes) {
    const d = view.dominoes.find((q) => q.id === n.domino);
    if (!d || d.kind !== "cap" || n.end === null) continue;
    const without: Board = JSON.parse(JSON.stringify(view.board));
    removeFromBoard(without, n.id);
    const players = view.players.map((p) => (p.id === n.owner ? { ...p, hand: [...p.hand, d.id] } : p));
    const p = previewPlay({ ...view, board: without, players }, n.owner, d.id, n.end);
    if (p) out.set(n.id, p.total);
  }
  return out;
}

// A live number: green (or red when lower than its base) with the sum under it.
export interface LiveNumber { main: string; sub: string | null; good: boolean }

// What previewPlay says, as a live number. Caps: the value over its sum (`12` over `3 × 4`), red if
// the value fell below the cap's base. Amplifiers and junctions: the charge they pass on, red if it
// is lower than the charge reaching the end (`reaching`).
export function liveNumber(d: Domino, p: PlayPreview, reaching: number): LiveNumber {
  if (d.kind === "cap" && d.effect) {
    return { main: String(p.total), sub: `${d.effect.base} × ${p.charge}${p.triggers > 1 ? ` × ${p.triggers}` : ""}`, good: p.value >= d.effect.base };
  }
  return { main: String(p.charge), sub: null, good: p.charge >= reaching };
}

// ---- fuses ----

export interface FuseRef {
  pts: Pt[]; // the curve, in table coordinates
  paint(progress: number, hot?: number): void; // 0 unburnt .. 1 burnt all the way, in the heat colour
  setDim(dim: boolean): void; // a fizzled end's fuse
}

function strokeLine(g: Phaser.GameObjects.Graphics, pts: Pt[], width: number, colour: number, alpha: number): void {
  g.lineStyle(width, colour, alpha);
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.strokePath();
  // Round caps (the path has butt ends).
  g.fillStyle(colour, alpha);
  g.fillCircle(pts[0].x, pts[0].y, width / 2);
  g.fillCircle(pts[pts.length - 1].x, pts[pts.length - 1].y, width / 2);
}

// The first `t` (0..1) of a polyline by length.
function head(pts: Pt[], t: number): Pt[] {
  if (t >= 1) return pts;
  const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  let left = lens.reduce((a, b) => a + b, 0) * Math.max(0, t);
  const out = [pts[0]];
  for (let i = 0; i < lens.length; i++) {
    if (left >= lens[i]) {
      out.push(pts[i + 1]);
      left -= lens[i];
    } else {
      const f = lens[i] > 0 ? left / lens[i] : 0;
      out.push({ x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f });
      break;
    }
  }
  return out;
}

// A fuse: a dark under-stroke with the spark's colour on top; the cascade's burn travels along it.
function drawFuse(scene: Phaser.Scene, layer: Layer, pts: Pt[], f: number, colour: number, o: { dim: boolean; glow?: { colour: number; alpha: number }; burnt: boolean; hot: number }): FuseRef {
  const g = scene.add.graphics();
  layer.add(g);
  let dim = o.dim;
  const paint = (progress: number, hot = o.hot) => {
    if (!g.active) return; // the table was redrawn while a burn was running
    g.clear();
    if (o.glow && !dim) strokeLine(g, pts, D.fuse.under * f * 2.4, o.glow.colour, o.glow.alpha);
    strokeLine(g, pts, D.fuse.under * f, hexColour(D.fuse.underColour), 1);
    strokeLine(g, pts, D.fuse.width * f, colour, dim ? D.fuse.dimAlpha : 1);
    if (progress > 0 && !dim) strokeLine(g, head(pts, progress), D.fuse.burnWidth * f, hot, D.fuse.burnAlpha);
  };
  let burn = o.burnt ? 1 : 0;
  paint(burn);
  return {
    pts,
    paint: (progress, hot) => { burn = progress; paint(progress, hot); },
    setDim: (d) => { dim = d; paint(burn); },
  };
}

// ---- pieces ----

function badge(scene: Phaser.Scene, layer: Layer, x: number, y: number, f: number, text: string): void {
  const b = D.badge;
  const w = b.w * f, h = b.h * f;
  const g = scene.add.graphics();
  g.fillStyle(hexColour(b.fill), 1);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
  g.lineStyle(b.strokeWidth * Math.max(f, 0.6), hexColour(b.stroke), 1);
  g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
  const t = scene.add.text(x, y, text, { fontFamily: FONT, fontSize: `${Math.max(b.minSize, Math.round(b.size * f))}px`, fontStyle: "bold", color: b.text }).setOrigin(0.5);
  layer.add([g, t]);
}

// A cap's own number: a pill in its effect's colour.
function capNumber(scene: Phaser.Scene, layer: Layer, x: number, y: number, f: number, text: string, fill: string): void {
  const b = D.capNumber;
  const t = scene.add.text(x, y, text, { fontFamily: FONT, fontSize: `${Math.max(b.minSize, Math.round(b.size * f))}px`, fontStyle: "bold", color: b.text }).setOrigin(0.5);
  const w = Math.max(b.w * f, t.width + 12 * f), h = b.h * f;
  const g = scene.add.graphics();
  g.fillStyle(hexColour(fill), 1);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
  g.lineStyle(b.strokeWidth * Math.max(f, 0.6), hexColour(b.stroke), 1);
  g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
  layer.add([g, t]);
}

// A board domino: a holder (scaled to k) whose origin is the middle of the domino's own silhouette and
// whose size is that silhouette, so it is the right size for a hit area and a glow.
function tile(scene: Phaser.Scene, layer: Layer, d: Domino, k: number, x: number, y: number, owner?: number): Layer {
  const holder = scene.add.container(x, y);
  // The board keeps its owner stripe (and star and gem) down to a smaller size than #217's usual cut-off.
  const detail = owner !== undefined && k >= D.detailScale ? Math.max(k, L.minDetailScale) : k;
  const inner = drawDomino(scene, d, "large", "normal", { scale: detail, owner });
  inner.setPosition(((L.extent.amplifier.w - L.extent[d.kind].w) / 2) * U, 0);
  holder.add(inner);
  const size = sizeOf(d.kind);
  holder.setSize(size.w, size.h);
  holder.setScale(k);
  layer.add(holder);
  return holder;
}

interface RingRef { c: Layer; fx: Phaser.GameObjects.Graphics; x: number; y: number; r: number; colour: number; locked: boolean; pulse?: Phaser.Tweens.Tween }

// ---- the board ----

export interface FuseBoardInput {
  board: Board;
  dominoes: Domino[];
  area: Rect; // the tree must fit in here (tile and ring edges, badges included)
  ownerColour(owner: string): number; // a seat's colour, for the owner stripe
  openEnds: { end: number; spark: Spark; charge: number }[]; // the engine's open ends (getView's openEnds)
  fuseCharges: Map<number, number>; // the charge through each fuse into a placed domino, by end id (chargesInto)
  capTotals?: Map<number, number>; // what each placed cap goes off for, by node id (capTotals): its own number
  locked: Spark | null; // the Warden's lock: those ends show a padlock and never light up
  blessed?: Spark | null; // the Spark Shrine's blessed spark
  lit?: Set<number>; // nodes the cascade has lit so far: their fuses are drawn burnt
  fizzled?: Set<number>; // ends that fizzled
  glow?: { colour: number; alpha: number }; // the build-up glow along the fuses
  hot: number; // the cascade's heat colour
}

export interface NodeRef { c: Layer; pos: { x: number; y: number; k: number; w: number; h: number } } // w, h: the domino's silhouette at scale 1
export interface Pos { x: number; y: number; k: number }

export class FuseBoard {
  private scene: Phaser.Scene;
  private root: Layer;
  private liveLayer: Layer;
  private k = D.scale;
  private f = 1;
  private lay: TreeLayout | null = null;
  private input: FuseBoardInput | null = null;
  private X = (x: number) => x;
  private Y = (y: number) => y;
  private tiles = new Map<number, NodeRef>();
  private rings = new Map<number, RingRef>();
  private fuses = new Map<number, FuseRef>();
  private hits = new Map<number | "opener", Layer>();
  private opener: { x: number; y: number; g: Phaser.GameObjects.Graphics } | null = null;
  private box: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private burns: { tw: Phaser.Tweens.Tween; fuse: FuseRef; hot: number }[] = [];

  constructor(scene: Phaser.Scene, layer: Layer) {
    this.scene = scene;
    this.root = scene.add.container(0, 0);
    this.liveLayer = scene.add.container(0, 0);
    layer.add([this.root, this.liveLayer]);
  }

  // Draws (or redraws) the whole board; clears the highlight and the live numbers.
  draw(input: FuseBoardInput): void {
    this.clear();
    this.input = input;
    const { board, area } = input;
    if (board.nodes.length === 0) {
      this.drawOpener(area);
      return;
    }
    const lay = layoutTree(board, input.dominoes);
    this.lay = lay;
    const f = fitScale(lay, area.w - D.padLeft, area.h);
    const k = D.scale * f;
    this.f = f;
    this.k = k;
    const ox = area.x + D.padLeft; // room for the opener's socket ring
    const oy = area.y + (area.h - (lay.y1 - lay.y0) * f) / 2;
    this.X = (x) => ox + (x - lay.x0) * f;
    this.Y = (y) => oy + (y - lay.y0) * f;
    this.box = { x: ox, y: oy, w: (lay.x1 - lay.x0) * f, h: (lay.y1 - lay.y0) * f };
    const lit = input.lit ?? new Set<number>();
    const fizzled = input.fizzled ?? new Set<number>();
    const endOf = (id: number) => board.ends.find((e) => e.id === id)!;
    const sparkOf = (end: number) => endOf(end).spark;

    // Fuses first, under the dominoes: from each output to whatever hangs on it.
    for (const fz of lay.fuses) {
      const e = endOf(fz.end);
      const pts = fz.pts.map((p) => ({ x: this.X(p.x), y: this.Y(p.y) }));
      this.fuses.set(e.id, drawFuse(this.scene, this.root, pts, f, SPARK_STYLE[sparkOf(e.id)].color, { dim: fizzled.has(e.id), glow: input.glow, burnt: lit.has(e.node), hot: input.hot }));
    }
    // The dominoes.
    for (const n of board.nodes) {
      const t = lay.tiles.get(n.id)!;
      const x = this.X(t.cx), y = this.Y(t.cy);
      const d = input.dominoes.find((q) => q.id === n.domino)!;
      const c = tile(this.scene, this.root, d, k, x, y, input.ownerColour(n.owner));
      const size = sizeOf(t.kind);
      this.tiles.set(n.id, { c, pos: { x, y, k, w: size.w, h: size.h } });
    }
    // Each cap's own number, straddling its top edge.
    input.capTotals?.forEach((total, id) => {
      const t = this.tiles.get(id);
      if (!t) return;
      const d = input.dominoes.find((q) => q.id === board.nodes.find((x) => x.id === id)!.domino)!;
      const w = t.pos.w * k, h = t.pos.h * k;
      capNumber(this.scene, this.root, t.pos.x + w / 2 - D.capNumber.dx * f, t.pos.y - h / 2, f, String(total), d.effect?.kind === "block" ? L.colours.cap.block : L.colours.cap.damage);
    });
    // The charge badges, above the dominoes (they never overlap one: see layoutTree).
    for (const fz of lay.fuses) {
      const charge = input.fuseCharges.get(fz.end);
      if (fz.badge && charge !== undefined && !fizzled.has(fz.end)) badge(this.scene, this.root, this.X(fz.badge.x), this.Y(fz.badge.y), f, String(charge));
    }
    // The open ends: dashed ghost rings with their charge.
    for (const o of input.openEnds) {
      const r = lay.rings.get(o.end);
      if (!r) continue;
      this.drawRing(o.end, this.X(r.cx), this.Y(r.cy), o.spark, o.charge, fizzled.has(o.end), input);
    }
  }

  private drawRing(end: number, x: number, y: number, spark: Spark, charge: number, dim: boolean, input: FuseBoardInput): void {
    const R = D.ringRadius * this.f;
    const c = this.scene.add.container(0, 0);
    this.root.add(c);
    if (dim) c.setAlpha(0.35);
    const fx = this.scene.add.graphics();
    const glyph = this.scene.add.graphics();
    c.add([fx, glyph]);
    drawSparkGlyph(glyph, spark, x, y, R * 0.45);
    if (!dim) {
      const br = Math.max(11, D.ring.badgeR * this.f);
      const bx = x + D.ring.badgeDx * this.f, by = y + D.ring.badgeDy * this.f;
      const g = this.scene.add.graphics();
      g.fillStyle(hexColour(D.ring.badgeFill), 1);
      g.fillCircle(bx, by, br);
      g.lineStyle(2, hexColour(D.badge.stroke), 1);
      g.strokeCircle(bx, by, br);
      const t = this.scene.add.text(bx, by, String(charge), { fontFamily: FONT, fontSize: `${Math.round(br * 1.25)}px`, fontStyle: "bold", color: D.ring.badgeText }).setOrigin(0.5);
      c.add([g, t]);
    }
    const locked = input.locked === spark;
    if (locked) {
      const lg = this.scene.add.graphics();
      c.add(lg);
      drawPadlock(this.scene, lg, x + D.lock.dx * this.f, y + D.lock.dy * this.f, Math.max(0.4, D.lock.scale * this.f));
    }
    if (input.blessed === spark) {
      const bg = this.scene.add.graphics();
      c.add(bg);
      drawBlessedGlow(bg, spark, x, y, R * 0.6);
    }
    const ref: RingRef = { c, fx, x, y, r: R, colour: SPARK_STYLE[spark].color, locked };
    this.rings.set(end, ref);
    this.paintRing(ref, false);
    // The hit area: a zone the scene attaches clicks and hovers to.
    const s = Math.max(D.ring.minHit, R * 2 + 8);
    const hit = this.scene.add.container(x, y).setSize(s, s);
    this.root.add(hit);
    this.hits.set(end, hit);
  }

  // The ring's backing and dashes, repainted when it lights up or goes out.
  private paintRing(ref: RingRef, legal: boolean): void {
    const { fx, x, y, r } = ref;
    fx.clear();
    fx.fillStyle(hexColour(D.ring.backing), 0.85);
    fx.fillCircle(x, y, r);
    if (legal) {
      fx.fillStyle(hexColour(D.ring.legalColour), D.ring.fillAlpha);
      fx.fillCircle(x, y, r);
      for (let i = 3; i >= 1; i--) {
        fx.lineStyle(i * 5, hexColour(D.ring.legalColour), 0.18);
        fx.strokeCircle(x, y, r + i * 2);
      }
    }
    fx.lineStyle((legal ? D.ring.legalWidth : D.ring.width) * Math.max(this.f, 0.7), legal ? hexColour(D.ring.legalColour) : ref.colour, 1);
    const dash = (D.ring.dash * this.f) / r;
    const gap = (D.ring.gap * this.f) / r;
    const n = Math.max(6, Math.round((Math.PI * 2) / (dash + gap)));
    const step = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      fx.beginPath();
      fx.arc(x, y, r, i * step, i * step + step * (dash / (dash + gap)));
      fx.strokePath();
    }
  }

  // The empty board: a dashed slot for the opener, on the left of the area.
  private drawOpener(area: Rect): void {
    const O = D.opener;
    const x = area.x + D.padLeft + O.w / 2;
    const y = area.y + area.h / 2;
    this.box = { x: area.x + D.padLeft, y: y - O.h / 2, w: O.w, h: O.h };
    const g = this.scene.add.graphics();
    this.root.add(g);
    this.opener = { x, y, g };
    this.paintOpener(false);
    const t = this.scene.add.text(x, y, "OPENER", { fontFamily: FONT, fontSize: `${O.textSize}px`, fontStyle: "bold", color: O.colour }).setOrigin(0.5).setAlpha(0.8);
    this.root.add(t);
    const hit = this.scene.add.container(x, y).setSize(O.w, O.h);
    this.root.add(hit);
    this.hits.set("opener", hit);
  }

  private paintOpener(legal: boolean): void {
    if (!this.opener) return;
    const O = D.opener;
    const { x, y, g } = this.opener;
    g.clear();
    const col = hexColour(O.colour);
    g.fillStyle(col, legal ? D.ring.fillAlpha * 2 : D.ring.fillAlpha * 0.6);
    g.fillRoundedRect(x - O.w / 2, y - O.h / 2, O.w, O.h, 18);
    g.lineStyle(legal ? D.ring.legalWidth : D.ring.width, col, legal ? 1 : 0.7);
    const dash = D.ring.dash, gap = D.ring.gap;
    const edges: [number, number, number, number][] = [
      [x - O.w / 2 + 18, y - O.h / 2, x + O.w / 2 - 18, y - O.h / 2],
      [x - O.w / 2 + 18, y + O.h / 2, x + O.w / 2 - 18, y + O.h / 2],
      [x - O.w / 2, y - O.h / 2 + 18, x - O.w / 2, y + O.h / 2 - 18],
      [x + O.w / 2, y - O.h / 2 + 18, x + O.w / 2, y + O.h / 2 - 18],
    ];
    for (const [x0, y0, x1, y1] of edges) {
      const len = Math.hypot(x1 - x0, y1 - y0);
      for (let d = 0; d < len; d += dash + gap) {
        const a = d / len, b = Math.min(len, d + dash) / len;
        g.lineBetween(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b);
      }
    }
  }

  clear(): void {
    this.stopBurns();
    this.clearLive();
    this.rings.forEach((r) => r.pulse?.stop());
    this.root.removeAll(true);
    this.tiles.clear();
    this.rings.clear();
    this.fuses.clear();
    this.hits.clear();
    this.opener = null;
    this.lay = null;
    this.input = null;
  }

  destroy(): void {
    this.clear();
    this.root.destroy();
    this.liveLayer.destroy();
  }

  // ---- anchors (screen coordinates), for glow, projectiles, seat glow and the camera ----

  scale(): number { return this.k; }
  bounds(): Rect { return { ...this.box }; } // the tree (or the opener slot) as drawn
  nodeIds(): number[] { return [...this.tiles.keys()]; }
  nodeCentre(id: number): Pt | null {
    const t = this.tiles.get(id);
    return t ? { x: t.pos.x, y: t.pos.y } : null;
  }
  nodeBox(id: number): Rect | null {
    const t = this.tiles.get(id);
    return t ? { x: t.pos.x - (t.pos.w * t.pos.k) / 2, y: t.pos.y - (t.pos.h * t.pos.k) / 2, w: t.pos.w * t.pos.k, h: t.pos.h * t.pos.k } : null;
  }
  // The intake notch of a placed domino (where its fuse arrives).
  socketPoint(id: number): Pt | null {
    const t = this.lay?.tiles.get(id);
    return t ? { x: this.X(t.socket.x), y: this.Y(t.socket.y) } : null;
  }
  // Where an output leaves its domino (the nose, or a junction's prong tip): shots and the fuse start here.
  outputPoint(end: number): Pt | null {
    const f = this.lay?.fuses.find((x) => x.end === end);
    return f ? { x: this.X(f.from.x), y: this.Y(f.from.y) } : null;
  }
  // The open end's ring centre (or the opener slot's centre, for "opener").
  endPoint(end: number | "opener"): Pt | null {
    if (end === "opener") return this.opener ? { x: this.opener.x, y: this.opener.y } : null;
    const r = this.rings.get(end);
    return r ? { x: r.x, y: r.y } : null;
  }
  // Where a placed domino's fuse badge sits.
  badgePoint(end: number): Pt | null {
    const b = this.lay?.fuses.find((x) => x.end === end)?.badge;
    return b ? { x: this.X(b.x), y: this.Y(b.y) } : null;
  }
  // The board dominoes and open ends in the shapes animations.ts keeps (nodes, slots, fuses).
  nodeRefs(): Map<number, NodeRef> { return this.tiles; }
  slotRefs(): Map<number, Pos> {
    const out = new Map<number, Pos>();
    this.rings.forEach((r, end) => out.set(end, { x: r.x, y: r.y, k: this.k }));
    return out;
  }
  fuseRefs(): Map<number, FuseRef> { return this.fuses; }
  // Hit areas: a zone on each open end (and "opener") for the scene to attach clicks and hovers to; a
  // board domino's own holder (nodeRefs) is sized to its silhouette.
  hit(end: number | "opener"): Layer | undefined { return this.hits.get(end); }

  // ---- the cascade ----

  // The burn travels along the fuse of `end` over `ms` (already scaled to the playback speed; the
  // default is the data's burnMs through scaleTime). Without an end drawn, nothing happens.
  burn(end: number, hot: number, ms = scaleTime(D.fuse.burnMs)): void {
    const fuse = this.fuses.get(end);
    if (!fuse) return;
    fuse.paint(0, hot);
    const tw = this.scene.tweens.addCounter({
      from: 0, to: 1, duration: ms, ease: "Sine.easeInOut",
      onUpdate: (t) => fuse.paint(t.getValue() ?? 1, hot),
      onComplete: () => fuse.paint(1, hot),
    });
    this.burns.push({ tw, fuse, hot });
  }

  // Burn every fuse out of a node at once (a junction's branches).
  burnFrom(node: number, hot: number, ms?: number): void {
    this.input?.board.ends.filter((e) => e.node === node).forEach((e) => this.burn(e.id, hot, ms));
  }

  // An open end that fizzled: its ring and fuse dim.
  fizzle(end: number): void {
    this.rings.get(end)?.c.setAlpha(0.35);
    this.fuses.get(end)?.setDim(true);
  }

  // The skip: finish every burn at once (each fuse burnt all the way) and leave nothing running.
  stopBurns(): void {
    this.burns.forEach(({ tw, fuse, hot }) => { tw.stop(); fuse.paint(1, hot); });
    this.burns = [];
  }

  // ---- hover, drag and the live numbers ----

  // Lights the open ends a hand domino can go on (the engine's legal ends), or the opener slot. A
  // locked end never lights up, whatever is passed.
  highlightLegal(ends: Iterable<number>, opener = false): void {
    const legal = new Set(ends);
    this.rings.forEach((ref, end) => {
      ref.pulse?.stop();
      ref.pulse = undefined;
      const lit = legal.has(end) && !ref.locked;
      this.paintRing(ref, lit);
      if (lit && !reducedFlashing()) {
        ref.pulse = this.scene.tweens.add({ targets: ref.fx, alpha: D.ring.pulseAlpha, duration: scaleTime(D.ring.pulseMs), yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      } else ref.fx.setAlpha(1);
    });
    this.paintOpener(opener);
  }

  clearHighlight(): void {
    this.highlightLegal([]);
  }

  // A live number beside an end (or the opener): the cap's value in green over its sum, or the
  // charge an amplifier or junction would pass on; red if lower than the base. `aimed` false dims
  // it (an end the domino is not being dragged over). Shown only on a legal end: the caller passes
  // numbers from previewPlay, which is null for an illegal end.
  showLive(end: number | "opener", live: LiveNumber, aimed = true): void {
    const at = end === "opener" ? (this.opener ? { x: this.opener.x, y: this.opener.y, hw: D.opener.w / 2 } : null) : this.rings.has(end) ? { x: this.rings.get(end)!.x, y: this.rings.get(end)!.y, hw: this.rings.get(end)!.r } : null;
    if (!at) return;
    if (end !== "opener" && this.rings.get(end)?.locked) return;
    const K = D.live;
    const big = this.scene.add.text(0, 0, live.main, { fontFamily: FONT, fontSize: `${K.mainSize}px`, fontStyle: "bold", color: live.good ? K.good : K.bad }).setOrigin(0.5);
    const small = live.sub === null ? null : this.scene.add.text(0, 0, live.sub, { fontFamily: FONT, fontSize: `${K.subSize}px`, color: K.subColour }).setOrigin(0.5);
    const w = Math.max(big.width, small?.width ?? 0) + K.padX * 2;
    const h = big.height + (small ? small.height - 4 : 0) + K.padY * 2;
    let x = at.x + at.hw + K.gap;
    const area = this.input?.area;
    if (area && x + w > area.x + area.w) x = area.x + area.w - w; // keep it on the board's area
    const g = this.scene.add.graphics();
    g.fillStyle(hexColour(K.fill), 0.97);
    g.fillRoundedRect(x, at.y - h / 2, w, h, Math.min(h / 2, 22));
    g.lineStyle(K.strokeWidth, hexColour(K.stroke), 1);
    g.strokeRoundedRect(x, at.y - h / 2, w, h, Math.min(h / 2, 22));
    big.setPosition(x + w / 2, at.y - h / 2 + K.padY + big.height / 2);
    small?.setPosition(x + w / 2, at.y + h / 2 - K.padY - small.height / 2);
    const box = this.scene.add.container(0, 0, small ? [g, big, small] : [g, big]).setAlpha(aimed ? 1 : K.dimAlpha);
    this.liveLayer.add(box);
  }

  clearLive(): void {
    this.liveLayer.removeAll(true);
  }
}
