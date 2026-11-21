import Phaser from "phaser";
import type { GameEvent } from "../engine/events";
import type { Domino } from "../engine/types";
import { drawDomino } from "./dominoDrawing";
import { applyEvent, deckCount } from "./shownView";
import type { ShownTable } from "./shownView";
import type { Pos, Refs } from "./animations";
import { scaleTime } from "./playbackSpeed";

// Drawing at round start (#153), played from the draw and reshuffle events. Dominoes slide from each
// seat's deck stack into its hand, all seats at once, a short stagger apart, and flip face up as they
// land. Every time goes through scaleTime.

const FONT = "Arial, Helvetica, sans-serif";
const STACK_K = 0.3; // a deck stack's dominoes, at the scale of a large domino
const FLY = 250; // one domino sliding in
const GAP = 70; // between dominoes of one seat
const FLIP = 120;
const SHUFFLE = 260;

type Slot = { c: Phaser.GameObjects.Container; pos: Pos };

export function isDrawEvent(ev: GameEvent): boolean {
  return ev.type === "draw" || ev.type === "reshuffle";
}

// A small face-down stack with the number of dominoes left. Registers itself in refs.decks.
export function drawDeckStack(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, refs: Refs, seat: string, back: Domino, x: number, y: number, count: number): void {
  const c = scene.add.container(x, y);
  const layers = count === 0 ? 1 : Math.min(3, count);
  for (let i = 0; i < layers; i++) {
    const d = drawDomino(scene, back, "large", "hidden").setScale(STACK_K).setPosition(i * 2, -i * 4);
    if (count === 0) d.setAlpha(0.3);
    c.add(d);
  }
  const text = scene.add
    .text(layers * 2 - 2, -(layers - 1) * 4, String(count), { fontFamily: FONT, fontSize: "26px", color: "#ffffff", fontStyle: "bold", stroke: "#0d2a20", strokeThickness: 6 })
    .setOrigin(0.5);
  c.add(text);
  layer.add(c);
  refs.decks.set(seat, { c, text, x, y });
}

type Item = { kind: "shuffle"; count: number } | { kind: "draw"; count: number };

// Applies the events to `shown` (so counts and hands follow them), redraws once, then animates the
// whole batch. Resolves when the animation is done.
export async function playDraws(
  scene: Phaser.Scene,
  getRefs: () => Refs,
  dominoes: Domino[],
  evs: GameEvent[],
  shown: ShownTable,
  redraw: () => void,
): Promise<void> {
  const before = getRefs();
  const oldPos = new Map<string, Pos[]>();
  before.handSlots.forEach((slots, seat) => oldPos.set(seat, slots.map((s) => s.pos)));

  const start = new Map<string, number>(); // each seat's deck count before its first event
  const items = new Map<string, Item[]>();
  for (const ev of evs) {
    if (ev.type !== "draw" && ev.type !== "reshuffle") continue;
    const seat = ev.player;
    const n = deckCount(shown.view, seat);
    if (!start.has(seat)) start.set(seat, n);
    applyEvent(shown, ev);
    const list = items.get(seat) ?? [];
    items.set(seat, list);
    if (ev.type === "draw") for (let j = 0; j < ev.count; j++) list.push({ kind: "draw", count: n - 1 - j });
    else list.push({ kind: "shuffle", count: deckCount(shown.view, seat) });
  }
  redraw();
  const refs = getRefs();
  let total = 0;

  items.forEach((list, seat) => {
    const slots: Slot[] = refs.handSlots.get(seat) ?? [];
    const old = oldPos.get(seat) ?? [];
    const stack = refs.decks.get(seat);
    const keep = Math.max(0, slots.length - list.filter((i) => i.kind === "draw").length);
    if (stack) stack.text.setText(String(start.get(seat)));

    // Dominoes that stay re-space smoothly.
    for (let i = 0; i < keep; i++) {
      const o = old[i];
      const { c, pos } = slots[i];
      if (!o || (o.x === pos.x && o.y === pos.y && o.k === pos.k)) continue;
      c.setPosition(o.x, o.y).setScale(o.k);
      scene.tweens.add({ targets: c, x: pos.x, y: pos.y, scale: pos.k, duration: scaleTime(FLY), ease: "Cubic.easeOut" });
    }

    const from = stack ?? { x: slots[0]?.pos.x ?? 0, y: (slots[0]?.pos.y ?? 0) - 60 };
    let t = 0;
    let slot = keep;
    for (const item of list) {
      const at = scaleTime(t);
      if (item.kind === "shuffle") {
        if (stack) {
          scene.tweens.add({ targets: stack.c, angle: { from: -10, to: 10 }, delay: at, duration: scaleTime(SHUFFLE / 4), yoyo: true, repeat: 1, onComplete: () => stack.c.setAngle(0) });
          scene.time.delayedCall(at, () => stack.text.active && stack.text.setText(String(item.count)));
        }
        t += SHUFFLE;
      } else {
        const target = slots[slot++];
        if (target) flyIn(scene, refs, target, from, at, dominoes[0]);
        if (stack) scene.time.delayedCall(at, () => stack.text.active && stack.text.setText(String(item.count)));
        t += GAP;
      }
    }
    total = Math.max(total, t + FLY + FLIP);
  });

  await new Promise<void>((resolve) => scene.time.delayedCall(scaleTime(total), resolve));
}

// One drawn domino: from the stack to its slot, landing face up with a flip.
function flyIn(scene: Phaser.Scene, refs: Refs, target: Slot, from: { x: number; y: number }, delay: number, back: Domino): void {
  const { c, pos } = target;
  c.setAlpha(0);
  const flying = drawDomino(scene, back, "large", "hidden").setPosition(from.x, from.y).setScale(STACK_K).setAlpha(0);
  refs.layer?.add(flying);
  c.setScale(0, pos.k);
  scene.tweens.add({
    targets: flying, x: pos.x, y: pos.y, scale: pos.k, delay, duration: scaleTime(FLY), ease: "Cubic.easeOut",
    onStart: () => flying.setAlpha(1),
    onComplete: () => {
      flying.destroy();
      if (!c.active) return;
      c.setAlpha(1);
      scene.tweens.add({ targets: c, scaleX: pos.k, duration: scaleTime(FLIP), ease: "Cubic.easeOut" });
    },
  });
}
