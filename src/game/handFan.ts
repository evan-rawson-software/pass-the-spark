import Phaser from "phaser";
import type { Domino } from "../engine/types";
import { drawDomino, dominoPixelSize } from "./dominoDrawing";
import type { DominoState } from "./dominoDrawing";
import { scaleTime } from "./playbackSpeed";
import { dominoLook, handFanData as D, hexColour } from "./presentation";
import { SPARK_ORDER } from "./sparks";

// Your hand (#229, taking over #218's screen part): sorted amplifiers, then junctions, then caps (by
// intake spark within each kind), fanned in a slight arc at the bottom centre between your deck pile
// on the left and your discard pile on the right. Layout and drawing only: which dominoes can be
// played always comes from the engine. Sizes, angles and timings are in data/presentation.json
// ("handFan"); every duration goes through scaleTime.

const FONT = "Arial, Helvetica, sans-serif";
const U = dominoLook.unit;
const KIND_ORDER = { amplifier: 0, junction: 1, cap: 2 };
type Layer = Phaser.GameObjects.Container;

export interface Pt { x: number; y: number }

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

export interface FanSlot { x: number; y: number; k: number; angle: number }
export interface FanArea { x: number; w: number; y: number } // y: the middle domino's centre

// The default area, from data: between the piles, clear of Pass and Set off.
export function handArea(): FanArea {
  return { ...D.area };
}

// The fan: centred in the area, each domino turned a little more toward the ends and the ends sitting
// lower. A big hand overlaps more, then shrinks (never below minScale) so the sockets and numbers stay visible.
export function fanSlots(count: number, area: FanArea): FanSlot[] {
  const full = dominoLook.extent.amplifier.w * U;
  let k = D.scale;
  let step = full * k * D.stepFactor;
  if (count > 1) {
    const room = (area.w - full * k) / (count - 1);
    if (room < step) step = room;
    if (step < full * k * D.minStepFactor) {
      // Shrink until the overlap is the most the data allows: area.w = full*k*(1 + (count-1)*minStepFactor)
      k = Math.max(D.minScale, Math.min(k, area.w / (full * (1 + (count - 1) * D.minStepFactor))));
      step = Math.min(full * k * D.stepFactor, (area.w - full * k) / (count - 1));
    }
  } else step = 0;
  const spread = Math.min(D.maxSpread, D.degPerDomino * (count - 1));
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => {
    const t = count > 1 ? (i - mid) / mid : 0; // -1 .. 1
    return {
      x: area.x + area.w / 2 + (i - mid) * step,
      y: area.y + D.arc * t * t,
      k,
      angle: count > 1 ? -spread / 2 + (spread * i) / (count - 1) : 0,
    };
  });
}

export interface HandInput {
  hand: string[]; // the engine's hand, domino ids
  dominoes: Domino[];
  playable: Set<string> | null; // ids the engine says can be played now: they glow, the rest dim. null: none dimmed (not your turn)
  owner?: number; // the owner stripe's colour (your seat colour)
  deck: number; // cards left in your deck
  discard: number; // cards in your discard pile
  area?: FanArea; // defaults to handArea()
  previous?: Map<string, FanSlot>; // positions() of the last draw: dominoes slide from there, new ones come from the deck
}

export interface HandItem { key: string; id: string; index: number; kind: Domino["kind"]; holder: Layer; slot: FanSlot }

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

export class HandFan {
  private scene: Phaser.Scene;
  private fan: Layer; // the gap placeholder first, then the dominoes left to right (a hovered one on top)
  private gapG: Phaser.GameObjects.Graphics;
  private cb: HandCallbacks;
  private list: HandItem[] = [];
  private area: FanArea = D.area;
  private hovered: string | null = null;
  private dragged: string | null = null;
  private picked: string | null = null;
  deckPile: Layer | null = null;
  deckText: Phaser.GameObjects.Text | null = null;
  discardPile: Layer | null = null;

  constructor(scene: Phaser.Scene, layer: Layer, cb: HandCallbacks = {}) {
    this.scene = scene;
    this.cb = cb;
    this.fan = scene.add.container(0, 0);
    this.gapG = scene.add.graphics();
    this.fan.add(this.gapG);
    layer.add(this.fan);
  }

  get items(): readonly HandItem[] { return this.list; }

  // Draws (or redraws) the hand and the piles. With input.previous, dominoes that were there slide to
  // their new place and new draws come in from the deck pile.
  draw(input: HandInput): void {
    this.clear();
    const area = input.area ?? handArea();
    this.area = area;
    const order = sortedHand(input.hand, input.dominoes);
    const slots = fanSlots(order.length, area);
    const prev = input.previous;
    const deckAt = this.deckPoint();
    let entering = 0;
    order.forEach((o, i) => {
      const d = input.dominoes.find((x) => x.id === o.id)!;
      const state: DominoState = input.playable === null ? "normal" : input.playable.has(o.id) ? "playable" : "notPlayable";
      const holder = holderFor(this.scene, d, state, input.owner);
      const slot = slots[i];
      this.fan.add(holder);
      const old = prev?.get(o.key);
      if (!prev || prev.size === 0) {
        holder.setPosition(slot.x, slot.y).setScale(slot.k).setAngle(slot.angle);
      } else if (old) {
        holder.setPosition(old.x, old.y).setScale(old.k).setAngle(old.angle);
        this.scene.tweens.add({ targets: holder, x: slot.x, y: slot.y, scale: slot.k, angle: slot.angle, duration: scaleTime(D.enter.slideMs), ease: "Cubic.easeOut" });
      } else {
        // A new draw: from the deck pile into its sorted place.
        holder.setPosition(deckAt.x, deckAt.y).setScale(D.piles.scale).setAngle(0).setAlpha(0);
        this.scene.tweens.add({ targets: holder, x: slot.x, y: slot.y, scale: slot.k, angle: slot.angle, alpha: 1, delay: scaleTime(D.enter.staggerMs) * entering, duration: scaleTime(D.enter.enterMs), ease: "Cubic.easeOut" });
        entering++;
      }
      holder.setInteractive({ useHandCursor: true });
      holder.on("pointerover", () => this.cb.onHover?.(o.key));
      holder.on("pointerout", () => this.cb.onHover?.(null));
      holder.on("pointerdown", (p: Phaser.Input.Pointer) => this.cb.onDown?.(o.key, p));
      this.list.push({ key: o.key, id: o.id, index: o.index, kind: d.kind, holder, slot });
    });
    this.drawPiles(input);
  }

  private drawPiles(input: HandInput): void {
    const P = D.piles;
    const back = input.dominoes[0];
    const pile = (x: number, count: number, label: string): { c: Layer; text: Phaser.GameObjects.Text } => {
      const c = this.scene.add.container(x, P.y);
      const layers = count === 0 ? 1 : Math.min(P.layers, count);
      for (let i = 0; i < layers; i++) {
        const d = drawDomino(this.scene, back, "large", "hidden").setScale(P.scale).setPosition(i * P.dx, i * P.dy);
        if (count === 0) d.setAlpha(P.emptyAlpha);
        c.add(d);
      }
      const text = this.scene.add
        .text((layers - 1) * P.dx, (layers - 1) * P.dy, String(count), { fontFamily: FONT, fontSize: `${P.textSize}px`, color: "#ffffff", fontStyle: "bold", stroke: "#0d2a20", strokeThickness: 6 })
        .setOrigin(0.5);
      const name = this.scene.add.text(0, dominoPixelSize("large").h * P.scale * 0.5 + P.labelSize, label, { fontFamily: FONT, fontSize: `${P.labelSize}px`, color: P.labelColour }).setOrigin(0.5);
      c.add([text, name]);
      const size = dominoPixelSize("large");
      c.setSize(size.w * P.scale, size.h * P.scale + P.labelSize * 2);
      return { c, text };
    };
    const deck = pile(P.deckX, input.deck, "Deck");
    this.deckPile = deck.c;
    this.deckText = deck.text;
    this.discardPile = pile(P.discardX, input.discard, "Discard").c;
    this.fan.parentContainer?.add([this.deckPile, this.discardPile]);
  }

  // Where new draws come from, and where the discard pile is (for animations).
  deckPoint(): Pt { return { x: D.piles.deckX, y: D.piles.y }; }
  discardPoint(): Pt { return { x: D.piles.discardX, y: D.piles.y }; }

  // Each domino's resting place by key: pass it to the next draw() as `previous`.
  positions(): Map<string, FanSlot> {
    const out = new Map<string, FanSlot>();
    this.list.forEach((it) => out.set(it.key, it.slot));
    return out;
  }

  private item(key: string | null): HandItem | undefined {
    return key === null ? undefined : this.list.find((i) => i.key === key);
  }

  // The hovered domino straightens, grows and lifts; the one before it settles back (unless it is picked).
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

  private lift(it: HandItem): void {
    this.fan.bringToTop(it.holder);
    this.scene.tweens.killTweensOf(it.holder);
    this.scene.tweens.add({ targets: it.holder, x: it.slot.x, y: it.slot.y - D.lift, scale: D.hoverScale, angle: 0, duration: scaleTime(D.tweenMs), ease: "Quad.easeOut" });
  }

  private settle(it: HandItem): void {
    this.scene.tweens.killTweensOf(it.holder);
    const i = this.list.indexOf(it);
    this.fan.moveTo(it.holder, i + 1); // back to its place in the stack (the gap placeholder is first)
    this.scene.tweens.add({ targets: it.holder, x: it.slot.x, y: it.slot.y, scale: it.slot.k, angle: it.slot.angle, duration: scaleTime(D.tweenMs), ease: "Quad.easeOut" });
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
    it.holder.setAlpha(D.gap.holderAlpha);
    const size = dominoPixelSize("large", it.kind);
    const w = size.w * it.slot.k, h = size.h * it.slot.k;
    const G = D.gap;
    const cos = Math.cos((it.slot.angle * Math.PI) / 180), sin = Math.sin((it.slot.angle * Math.PI) / 180);
    const rot = (x: number, y: number) => ({ x: it.slot.x + x * cos - y * sin, y: it.slot.y + x * sin + y * cos });
    this.gapG.lineStyle(G.width, hexColour(G.colour), G.alpha);
    const corners = [rot(-w / 2, -h / 2), rot(w / 2, -h / 2), rot(w / 2, h / 2), rot(-w / 2, h / 2)];
    for (let c = 0; c < 4; c++) {
      const a = corners[c], b = corners[(c + 1) % 4];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      for (let d = 0; d < len; d += G.dash + G.space) {
        const t0 = d / len, t1 = Math.min(len, d + G.dash) / len;
        this.gapG.lineBetween(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0, a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
      }
    }
  }

  // After a drag that did not play: the domino returns to its place in the fan.
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
      it.holder.setAlpha(it.key === this.dragged ? D.gap.holderAlpha : 1);
      if (lifted) it.holder.setPosition(it.slot.x, it.slot.y - D.lift).setScale(D.hoverScale).setAngle(0);
      else it.holder.setPosition(it.slot.x, it.slot.y).setScale(it.slot.k).setAngle(it.slot.angle);
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
    this.deckPile?.destroy();
    this.discardPile?.destroy();
    this.deckPile = this.discardPile = null;
    this.deckText = null;
  }

  destroy(): void {
    this.clear();
    this.fan.destroy();
  }
}
