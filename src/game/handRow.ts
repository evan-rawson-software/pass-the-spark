import Phaser from "phaser";
import type { Domino } from "../engine/types";
import { drawDomino, dominoPixelSize } from "./dominoDrawing";
import type { DominoState } from "./dominoDrawing";
import { scaleTime } from "./playbackSpeed";
import { dominoLook, handRowData as D, hexColour } from "./presentation";
import { SPARK_ORDER } from "./sparks";

// Your hand (#253, replacing #229's fan): sorted amplifiers, then junctions, then caps (by intake
// spark within each kind), as a straight row along the bottom with no overlap (see rowSlots). Layout
// and drawing only: which dominoes can be played always comes from the engine. Sizes and timings are
// in data/presentation.json ("handRow"); every duration goes through scaleTime.

const U = dominoLook.unit;
const KIND_ORDER = { amplifier: 0, junction: 1, cap: 2 };
type Layer = Phaser.GameObjects.Container;

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

function intakeRank(d: Domino): number {
  if (d.intake === "any") return SPARK_ORDER.length;
  return Math.min(...d.intake.map((s) => SPARK_ORDER.indexOf(s)));
}

// A hand in display order. index is the domino's place in the engine's hand (pings name it); key is
// stable for this domino across redraws (its id and which copy it is), so a draw can tell new from old.
export interface SortedDomino { id: string; index: number; key: string }
export function sortedHand(hand: string[], dominoes: Domino[]): SortedDomino[] {
  const of = (id: string) => {
    const d = dominoes.find((x) => x.id === id);
    if (!d) throw new Error("no such domino " + id);
    return d;
  };
  const seen = new Map<string, number>();
  return hand
    .map((id, index) => {
      const n = seen.get(id) ?? 0;
      seen.set(id, n + 1);
      return { id, index, key: `${id}#${n}` };
    })
    .sort((a, b) => {
      const da = of(a.id), db = of(b.id);
      return KIND_ORDER[da.kind] - KIND_ORDER[db.kind] || intakeRank(da) - intakeRank(db) || a.index - b.index;
    });
}

export interface HandSlot { x: number; y: number; k: number } // the domino's outline is centred on (x, y) at scale k
export interface RowParams { scale: number; minScale: number; gap: number; rowGap: number }

// A hand as a straight row in the area (#253): every domino at the same scale, `gap` px between real
// outlines (`sizes` are the outlines at scale 1, in hand order), centred in the area. At `scale` if it
// fits; else shrunk evenly, never below `minScale`; if that is still too wide, two rows (the top one
// first), split by width as evenly as possible, at the size that fits both rows. Pure layout.
export function rowSlots(sizes: { w: number; h: number }[], area: Rect, P: RowParams): HandSlot[] {
  const n = sizes.length;
  if (n === 0) return [];
  const width = (a: number, b: number) => sizes.slice(a, b).reduce((sum, z) => sum + z.w, 0);
  const tall = (a: number, b: number) => Math.max(...sizes.slice(a, b).map((z) => z.h));
  const fitW = (a: number, b: number) => (area.w - (b - a - 1) * P.gap) / width(a, b);
  let split = n;
  let k = Math.min(P.scale, fitW(0, n), area.h / tall(0, n));
  if (n > 1 && k < P.minScale) {
    let best = Infinity;
    for (let s = 1; s < n; s++) {
      const wider = Math.max(width(0, s), width(s, n));
      if (wider < best) {
        best = wider;
        split = s;
      }
    }
    k = Math.min(P.scale, fitW(0, split), fitW(split, n), (area.h - P.rowGap) / (tall(0, split) + tall(split, n)));
  }
  const rows = split < n ? [[0, split], [split, n]] : [[0, n]];
  const block = rows.reduce((sum, [a, b]) => sum + tall(a, b) * k, 0) + (rows.length - 1) * P.rowGap;
  let top = area.y + (area.h - block) / 2;
  const out: HandSlot[] = [];
  for (const [a, b] of rows) {
    const h = tall(a, b) * k;
    let x = area.x + (area.w - (width(a, b) * k + (b - a - 1) * P.gap)) / 2;
    for (let i = a; i < b; i++) {
      out.push({ x: x + (sizes[i].w * k) / 2, y: top + h / 2, k });
      x += sizes[i].w * k + P.gap;
    }
    top += h + P.rowGap;
  }
  return out;
}

// The default area, from data: right of the left column, left of the Pass button, under the board.
export function handArea(): Rect {
  return { ...D.area };
}

export interface HandInput {
  hand: string[]; // the engine's hand, domino ids
  dominoes: Domino[];
  playable: Set<string> | null; // ids the engine says can be played now: they glow, the rest dim. null: none dimmed (not your turn)
  owner?: number; // the owner stripe's colour (your seat colour)
  area?: Rect; // defaults to handArea()
  previous?: Map<string, HandSlot>; // positions() of the last draw: dominoes slide from there, new ones come in from the left edge of the area
}

export interface HandItem { key: string; id: string; index: number; kind: Domino["kind"]; holder: Layer; slot: HandSlot }

export interface HandCallbacks {
  onHover?(key: string | null): void;
  onDown?(key: string, pointer: Phaser.Input.Pointer): void;
}

// A hand domino's holder: origin at the middle of its own silhouette, sized to it (the hit area).
function holderFor(scene: Phaser.Scene, d: Domino, state: DominoState, owner: number | undefined): Layer {
  const c = scene.add.container(0, 0);
  const inner = drawDomino(scene, d, "large", state, { owner });
  inner.setPosition(((dominoLook.extent.amplifier.w - dominoLook.extent[d.kind].w) / 2) * U, 0);
  c.add(inner);
  const size = dominoPixelSize("large", d.kind);
  c.setSize(size.w, size.h);
  return c;
}

export class HandRow {
  private scene: Phaser.Scene;
  private row: Layer; // the gap placeholder first, then the dominoes left to right (a hovered one on top)
  private gapG: Phaser.GameObjects.Graphics;
  private cb: HandCallbacks;
  private list: HandItem[] = [];
  private area: Rect = handArea();
  private hovered: string | null = null;
  private dragged: string | null = null;
  private picked: string | null = null;

  constructor(scene: Phaser.Scene, layer: Layer, cb: HandCallbacks = {}) {
    this.scene = scene;
    this.cb = cb;
    this.row = scene.add.container(0, 0);
    this.gapG = scene.add.graphics();
    this.row.add(this.gapG);
    layer.add(this.row);
  }

  get items(): readonly HandItem[] { return this.list; }

  // Draws (or redraws) the hand. With input.previous, dominoes that were there slide to their new
  // place and new draws come in from the left edge of the area.
  draw(input: HandInput): void {
    this.clear();
    const area = input.area ?? handArea();
    this.area = area;
    const order = sortedHand(input.hand, input.dominoes);
    const ds = order.map((o) => input.dominoes.find((x) => x.id === o.id)!);
    const slots = rowSlots(ds.map((d) => dominoPixelSize("large", d.kind)), area, D);
    const prev = input.previous;
    let entering = 0;
    order.forEach((o, i) => {
      const d = ds[i];
      const state: DominoState = input.playable === null ? "normal" : input.playable.has(o.id) ? "playable" : "notPlayable";
      const holder = holderFor(this.scene, d, state, input.owner);
      const slot = slots[i];
      this.row.add(holder);
      const old = prev?.get(o.key);
      if (!prev || prev.size === 0) {
        holder.setPosition(slot.x, slot.y).setScale(slot.k);
      } else if (old) {
        holder.setPosition(old.x, old.y).setScale(old.k);
        this.scene.tweens.add({ targets: holder, x: slot.x, y: slot.y, scale: slot.k, duration: scaleTime(D.enter.slideMs), ease: "Cubic.easeOut" });
      } else {
        // A new draw: in from the left edge of the area into its sorted place.
        holder.setPosition(area.x, area.y + area.h / 2).setScale(slot.k).setAlpha(0);
        this.scene.tweens.add({ targets: holder, x: slot.x, y: slot.y, alpha: 1, delay: scaleTime(D.enter.staggerMs) * entering, duration: scaleTime(D.enter.enterMs), ease: "Cubic.easeOut" });
        entering++;
      }
      holder.setInteractive({ useHandCursor: true });
      holder.on("pointerover", () => this.cb.onHover?.(o.key));
      holder.on("pointerout", () => this.cb.onHover?.(null));
      holder.on("pointerdown", (p: Phaser.Input.Pointer) => this.cb.onDown?.(o.key, p));
      this.list.push({ key: o.key, id: o.id, index: o.index, kind: d.kind, holder, slot });
    });
  }

  // Where new draws come in from: the left edge of the row's area (for animations).
  entryPoint(): Pt { return { x: this.area.x, y: this.area.y + this.area.h / 2 }; }

  // Each domino's resting place by key: pass it to the next draw() as `previous`.
  positions(): Map<string, HandSlot> {
    const out = new Map<string, HandSlot>();
    this.list.forEach((it) => out.set(it.key, it.slot));
    return out;
  }

  private item(key: string | null): HandItem | undefined {
    return key === null ? undefined : this.list.find((i) => i.key === key);
  }

  // The hovered domino grows and lifts; the one before it settles back (unless it is picked).
  hover(key: string | null): void {
    if (key === this.hovered) return;
    const was = this.item(this.hovered);
    this.hovered = key;
    if (was && was.key !== this.dragged && was.key !== this.picked) this.settle(was);
    const now = this.item(key);
    if (now && now.key !== this.dragged) this.lift(now);
  }

  // The picked domino stays lifted until it is put back (null), whatever the pointer does.
  pick(key: string | null): void {
    const was = this.item(this.picked);
    this.picked = key;
    if (was && was.key !== key && was.key !== this.hovered && was.key !== this.dragged) this.settle(was);
    const now = this.item(key);
    if (now && now.key !== this.dragged) this.lift(now);
  }

  // It grows to hoverScale and lifts, drawn over its neighbours, which stay put. It never lifts above
  // the top of the area (the board's bottom edge), so in a two-row hand the top row grows downward
  // instead of covering the board's open ends.
  private lift(it: HandItem): void {
    this.row.bringToTop(it.holder);
    this.scene.tweens.killTweensOf(it.holder);
    this.scene.tweens.add({ targets: it.holder, x: it.slot.x, y: this.liftedY(it), scale: Math.max(D.hoverScale, it.slot.k), duration: scaleTime(D.tweenMs), ease: "Quad.easeOut" });
  }

  private liftedY(it: HandItem): number {
    const halfH = (dominoPixelSize("large", it.kind).h * Math.max(D.hoverScale, it.slot.k)) / 2;
    return Math.max(it.slot.y - D.lift, this.area.y + halfH);
  }

  private settle(it: HandItem): void {
    this.scene.tweens.killTweensOf(it.holder);
    const i = this.list.indexOf(it);
    this.row.moveTo(it.holder, i + 1); // back to its place in the stack (the gap placeholder is first)
    this.scene.tweens.add({ targets: it.holder, x: it.slot.x, y: it.slot.y, scale: it.slot.k, duration: scaleTime(D.tweenMs), ease: "Quad.easeOut" });
  }

  // A dragged domino leaves a faint dashed gap where it was. null puts it back (the domino itself is
  // the scene's to move while dragging; settleDragged() brings it home).
  setDragged(key: string | null): void {
    const was = this.item(this.dragged);
    if (was) was.holder.setAlpha(1);
    this.dragged = key;
    this.gapG.clear();
    const it = this.item(key);
    if (!it) return;
    it.holder.setAlpha(D.drag.holderAlpha);
    const size = dominoPixelSize("large", it.kind);
    const w = size.w * it.slot.k, h = size.h * it.slot.k;
    const G = D.drag;
    this.gapG.lineStyle(G.width, hexColour(G.colour), G.alpha);
    const x0 = it.slot.x - w / 2, y0 = it.slot.y - h / 2;
    const corners = [{ x: x0, y: y0 }, { x: x0 + w, y: y0 }, { x: x0 + w, y: y0 + h }, { x: x0, y: y0 + h }];
    for (let c = 0; c < 4; c++) {
      const a = corners[c], b = corners[(c + 1) % 4];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      for (let d = 0; d < len; d += G.dash + G.space) {
        const t0 = d / len, t1 = Math.min(len, d + G.dash) / len;
        this.gapG.lineBetween(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0, a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
      }
    }
  }

  // After a drag that did not play: the domino returns to its place in the row.
  settleDragged(key: string): void {
    const it = this.item(key);
    this.setDragged(null);
    if (it) this.settle(it);
  }

  // The skip: every tween done at once, each domino in its place.
  snap(): void {
    for (const it of this.list) {
      this.scene.tweens.killTweensOf(it.holder);
      const lifted = it.key === this.hovered || it.key === this.picked;
      it.holder.setAlpha(it.key === this.dragged ? D.drag.holderAlpha : 1);
      if (lifted) it.holder.setPosition(it.slot.x, this.liftedY(it)).setScale(Math.max(D.hoverScale, it.slot.k));
      else it.holder.setPosition(it.slot.x, it.slot.y).setScale(it.slot.k);
    }
  }

  clear(): void {
    for (const it of this.list) {
      this.scene.tweens.killTweensOf(it.holder);
      it.holder.destroy();
    }
    this.list = [];
    this.hovered = null;
    this.picked = null;
    this.dragged = null;
    this.gapG.clear();
  }

  destroy(): void {
    this.clear();
    this.row.destroy();
  }
}
