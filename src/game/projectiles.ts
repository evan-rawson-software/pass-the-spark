import Phaser from "phaser";
import presentation from "../../data/presentation.json";
import type { GameEvent } from "../engine/events";
import type { BattleView } from "../engine/view";
import { reducedFlashing } from "./comfort";
import { fxFallback, fxObject } from "./fx";
import { scaleTime } from "./playbackSpeed";
import { hexColour } from "./presentation";
import { seatColour } from "./seatColours";
import { playSound } from "./sound";
import { floatText } from "./spectacle";

// Effects fly to their targets (#189): every trigger of a cap sends its own shot from the cap to
// where the effect lands (a bolt to the enemy, a shield to the party's block counter, coins to the
// owner's name plate), and each domino glows in its owner's seat colour as the charge passes.
// Visual and sound only, driven by capFired and nodeLit events and the numbers in them. Sizes,
// speeds, the on-screen limit and the colours are in data/presentation.json ("projectiles").
// Every duration goes through scaleTime.
//
// The table's numbers follow the shots: the Animator holds each damage, block and coins event
// (whenLanded) until the shot that carries it lands, so the counters change on impact. landed()
// resolves when nothing is in the air, and clear() ends every shot at once (cascade skip, leaving
// the scene).

interface Tier { minValue: number; size: number; travelMs: number; gain: number }
type Pair = [number, number];
const D = presentation.projectiles as unknown as {
  maxOnScreen: number;
  staggerMs: number;
  tiers: Tier[];
  colours: Record<Kind, string>;
  arcHeight: number;
  flight: { haloFactor: number; passAt: number; passRingSize: number; passRingAlpha: number };
  count: { size: number; colour: string; stroke: string; dyFactor: number };
  shapes: { shieldFactor: number; shieldFill: string; shieldEdge: string; coinFactor: number; coinFill: string; coinEdge: string };
  impact: { ms: number; sizeFactor: number; ringFactor: number; burstScale: Pair; ringScale: Pair; slashColour: string; softAlpha: number };
  pulse: { scale: number; ms: number };
  coinPop: { size: number; colour: string; ms: number };
  seatGlow: { sizeFactor: number; ms: number; alpha: number; capFactor: number; capMs: number; reducedAlpha: number; reducedMs: number };
  shieldCrack: { lines: number; ms: number; lineWidth: number; colour: string; minLength: number; extraLength: number; shards: number; shardSize: number; shardColour: string; shardDistance: number };
};

interface Point { x: number; y: number }
type Kind = "damage" | "block" | "coins";
const KINDS: Kind[] = ["damage", "block", "coins"];
type Cap = Extract<GameEvent, { type: "capFired" }>;
type Container = Phaser.GameObjects.Container;

// The parts of the Animator's refs this file reads. The scene redraws between events, so the
// refs are asked for again each time they are needed: positions when a shot is planned, the
// block counter's text when a shield lands.
export interface TargetRefs {
  bars: Map<string, { x: number; y: number; w: number; h: number }>;
  shields: Map<string, { text: Phaser.GameObjects.Text; x: number; y: number }>;
  plates: Map<string, Point>;
}

// What a landing does to the table: waiting events register here and run when the shot lands.
interface Slot { done: boolean; fns: (() => void)[]; absorbed: number }

// One shot: a trigger of a cap, or several folded together once the limit is reached.
interface Shot {
  kind: Kind;
  value: number;
  count: number;
  slot: Slot;
  legs: Leg[];
  delay: number;
  baseSize: number;
  box?: Container;
  label?: Phaser.GameObjects.Text;
}

// One stop on a shot's way: where it flies to, what happens when it lands.
interface Leg { to: Point; land: (s: Shot) => void; pass?: Point }

function tierOf(value: number): Tier {
  let t = D.tiers[0];
  for (const x of D.tiers) if (value >= x.minValue) t = x;
  return t;
}

const colourOf = (kind: Kind) => hexColour(D.colours[kind]);

// ---- seat glow ----

// A soft glow in a seat's colour over a domino (or, bigger and longer, a cap as it goes off).
export function seatGlow(scene: Phaser.Scene, at: Point, width: number, colour: number, cap = false): void {
  const soft = reducedFlashing();
  const g = D.seatGlow;
  const o = fxFallback(scene, "glow", at.x, at.y, width * (cap ? g.capFactor : g.sizeFactor), colour).setDepth(89);
  if (!soft) o.setBlendMode(Phaser.BlendModes.ADD);
  o.setAlpha(soft ? g.reducedAlpha : g.alpha);
  scene.tweens.add({
    targets: o, alpha: 0, scale: cap ? 1.3 : 1.1, duration: scaleTime(soft ? g.reducedMs : cap ? g.capMs : g.ms),
    ease: "Cubic.easeOut", onComplete: () => o.destroy(),
  });
}

// ---- the shots ----

export class Projectiles {
  private gen = 0; // bumped by clear(): shots from an earlier generation just stop
  private open: Record<Kind, Shot[]> = { damage: [], block: [], coins: [] }; // not yet landed, oldest first
  private queue: Record<Kind, Slot[]> = { damage: [], block: [], coins: [] }; // one per trigger whose event has not arrived
  private openSlots = new Set<Slot>();
  private flights = new Set<Promise<void>>();
  private cancels = new Set<() => void>(); // stagger timers and flights that clear() ends
  private unapplied = 0; // enemy block the shots in the air will absorb, not yet taken off the shown table

  constructor(private scene: Phaser.Scene, private refs: () => TargetRefs) {}

  // Resolves when every shot in the air has landed.
  async landed(): Promise<void> {
    while (this.flights.size > 0) await Promise.all([...this.flights]);
  }

  // Runs fn when the shot carrying the next damage, block or coins event lands (at once if there
  // is none, or it already has).
  whenLanded(kind: Kind, fn: () => void): void {
    const slot = this.queue[kind].shift();
    if (!slot || slot.done) fn();
    else slot.fns.push(fn);
  }

  // A new step: nothing is in the air, so triggers that never got an event (the cap that
  // ended the battle) are forgotten.
  reset(): void {
    for (const k of KINDS) this.queue[k] = [];
    this.unapplied = 0;
  }

  // Ends everything now: stagger timers stop, shots vanish, and events still waiting for a landing
  // run (flush) so the shown table is whole. With flush off (the scene is going away) they do not.
  clear(flush = true): void {
    this.gen++;
    for (const cancel of [...this.cancels]) cancel();
    this.cancels.clear();
    for (const k of KINDS) {
      for (const s of this.open[k]) s.box?.destroy();
      this.open[k] = [];
      this.queue[k] = [];
    }
    const slots = [...this.openSlots];
    this.openSlots.clear();
    this.unapplied = 0;
    this.flights.clear();
    for (const slot of slots) {
      slot.done = true;
      const fns = slot.fns.splice(0);
      if (flush) fns.forEach((f) => f());
    }
  }

  // A cap goes off: one shot per trigger, slightly staggered. Once maxOnScreen shots of its kind
  // are in the air, further triggers fold into the newest of them (bigger, with a higher count).
  // `at` is the cap's centre on screen.
  cap(ev: Cap, shown: BattleView, at: Point): void {
    const refs = this.refs();
    const kind = ev.effect;
    const seat = seatColour(shown.seatOrder, ev.owner);
    // Enemy block as the shots come: what is left decides who hits the shield and who the bar.
    let left = Math.max(0, shown.enemy.block - this.unapplied);
    const startBlock = Math.max(1, left);
    const ignores = kind === "damage" && shown.dominoes.find((d) => d.id === ev.domino)?.effect?.ignoresBlock === true;
    let spawned = 0;
    for (let i = 0; i < ev.triggers; i++) {
      const absorbed = kind === "damage" && !ignores ? Math.min(left, ev.value) : 0;
      const before = left;
      left -= absorbed;
      this.unapplied += absorbed;
      const into = this.open[kind].length >= D.maxOnScreen ? this.open[kind][this.open[kind].length - 1] : undefined;
      const shot = into ?? this.newShot(ev, at, refs, before, startBlock, ignores, spawned++, seat);
      if (into) this.fold(into, ev.value);
      shot.slot.absorbed += absorbed;
      this.queue[kind].push(shot.slot);
    }
  }

  private newShot(ev: Cap, at: Point, refs: TargetRefs, left: number, startBlock: number, ignores: boolean, n: number, seat: number): Shot {
    const kind = ev.effect;
    const slot: Slot = { done: false, fns: [], absorbed: 0 };
    this.openSlots.add(slot);
    const shot: Shot = { kind, value: ev.value, count: 1, slot, legs: this.legs(kind, ev, at, refs, left, startBlock, ignores), delay: n * D.staggerMs, baseSize: tierOf(ev.value).size };
    this.open[kind].push(shot);
    const gen = this.gen;
    const flight = this.fly(shot, at, seat, gen).finally(() => this.flights.delete(flight));
    this.flights.add(flight);
    return shot;
  }

  // Another trigger joins a shot: its count and size grow.
  private fold(s: Shot, value: number): void {
    s.count++;
    s.value += value;
    if (s.box) {
      s.box.setScale(tierOf(s.value).size / s.baseSize);
      s.label?.setText(`×${s.count}`).setVisible(true);
    }
  }

  private legs(kind: Kind, ev: Cap, at: Point, refs: TargetRefs, left: number, startBlock: number, ignores: boolean): Leg[] {
    if (kind === "damage") {
      const bar = refs.bars.get("enemy");
      const sh = refs.shields.get("enemy");
      const barAt = bar ? { x: bar.x + bar.w / 2, y: bar.y + bar.h / 2 } : at;
      const onBar: Leg = { to: barAt, land: (s) => this.hit(barAt, tierOf(s.value), "damage") };
      if (!sh || ignores || left <= 0) return [{ ...onBar, pass: sh && ignores && left > 0 ? { x: sh.x, y: sh.y } : undefined }];
      const shAt = { x: sh.x, y: sh.y };
      const absorbed = Math.min(left, ev.value);
      const remaining = left - absorbed;
      const legs: Leg[] = [{ to: shAt, land: (s) => this.shieldHit(shAt, tierOf(s.value), 1 - remaining / startBlock, remaining === 0) }];
      if (ev.value > absorbed) legs.push(onBar);
      return legs;
    }
    if (kind === "block") {
      const sh = refs.shields.get("party");
      const to = sh ? { x: sh.x + 30, y: sh.y } : at;
      return [{ to, land: (s) => { this.hit(to, tierOf(s.value), "block"); this.pulse("party"); } }];
    }
    const to = refs.plates.get(ev.owner) ?? { x: at.x, y: at.y - 120 };
    return [{ to, land: (s) => { this.hit(to, tierOf(s.value), "coins"); floatText(this.scene, to.x, to.y - 20, `+${s.value}`, D.coinPop.colour, D.coinPop.size, D.coinPop.ms); } }];
  }

  // One shot: waits its turn, flies each leg in turn, lands, goes.
  private async fly(s: Shot, from: Point, seat: number, gen: number): Promise<void> {
    const scene = this.scene;
    if (s.delay > 0) await this.wait(s.delay);
    if (gen !== this.gen) return;
    const tier = tierOf(s.value);
    const c = scene.add.container(from.x, from.y).setDepth(96);
    s.box = c;
    s.baseSize = tier.size;
    const glow = fxFallback(scene, "glow", 0, 0, tier.size * D.flight.haloFactor, seat, c);
    if (!reducedFlashing()) glow.setBlendMode(Phaser.BlendModes.ADD);
    if (s.kind === "damage") fxObject(scene, "bolt", 0, 0, tier.size, colourOf("damage"), c);
    else if (s.kind === "block") shieldShape(scene, c, tier.size * D.shapes.shieldFactor);
    else coinShape(scene, c, tier.size * D.shapes.coinFactor);
    s.label = scene.add.text(0, tier.size * D.count.dyFactor, `×${s.count}`, { fontFamily: "Arial, Helvetica, sans-serif", fontSize: `${D.count.size}px`, fontStyle: "bold", color: D.count.colour, stroke: D.count.stroke, strokeThickness: 5 }).setOrigin(0.5).setVisible(s.count > 1);
    c.add(s.label);
    playSound(`launch:${s.kind}`);
    let pos = from;
    for (let i = 0; i < s.legs.length; i++) {
      const leg = s.legs[i];
      await this.travel(c, pos, leg.to, tier.travelMs, s.kind === "coins" ? D.arcHeight : 0, s.kind === "damage", leg.pass);
      if (gen !== this.gen) return;
      leg.land(s);
      pos = leg.to;
    }
    c.destroy();
    this.open[s.kind] = this.open[s.kind].filter((x) => x !== s);
    this.openSlots.delete(s.slot);
    s.slot.done = true;
    s.slot.fns.splice(0).forEach((f) => f()); // the table changes on impact
    this.unapplied = Math.max(0, this.unapplied - s.slot.absorbed);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = this.scene.time.delayedCall(scaleTime(ms), () => { this.cancels.delete(cancel); resolve(); });
      const cancel = () => { timer.remove(false); resolve(); };
      this.cancels.add(cancel);
    });
  }

  private travel(c: Container, a: Point, b: Point, ms: number, arc: number, aim: boolean, pass?: Point): Promise<void> {
    if (aim) c.setRotation(Math.atan2(b.y - a.y, b.x - a.x));
    let passed = false;
    return new Promise((resolve) => {
      const tween = this.scene.tweens.addCounter({
        from: 0, to: 1, duration: scaleTime(ms), ease: arc > 0 ? "Sine.easeInOut" : "Cubic.easeIn",
        onUpdate: (t) => {
          const k = t.getValue() ?? 1;
          c.setPosition(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k - arc * Math.sin(k * Math.PI));
          if (pass && !passed && k > D.flight.passAt) {
            passed = true;
            this.ring(pass, 0xffffff, D.flight.passRingSize, D.flight.passRingAlpha); // passes through the enemy's block untouched
          }
        },
        onComplete: () => { this.cancels.delete(cancel); resolve(); },
      });
      const cancel = () => { tween.stop(); resolve(); };
      this.cancels.add(cancel);
    });
  }

  // ---- landings ----

  // An impact burst at the target, bigger for a bigger shot, louder too.
  private hit(at: Point, tier: Tier, kind: Kind, sound = `impact:${kind}`): void {
    const im = D.impact;
    const colour = colourOf(kind);
    const size = tier.size * im.sizeFactor;
    const soft = reducedFlashing();
    const parts: Phaser.GameObjects.GameObject[] = [];
    if (kind === "damage") parts.push(fxObject(this.scene, "slash", at.x, at.y, size, hexColour(im.slashColour)));
    if (!soft) parts.push(fxObject(this.scene, "spark", at.x, at.y, size, colour));
    for (const p of parts) (p as Phaser.GameObjects.Image).setDepth(97);
    if (parts.length > 0) {
      this.scene.tweens.add({ targets: parts, scale: { from: im.burstScale[0], to: im.burstScale[1] }, alpha: { from: 1, to: 0 }, duration: scaleTime(im.ms), ease: "Cubic.easeOut", onComplete: () => parts.forEach((p) => p.destroy()) });
    }
    this.ring(at, colour, size * im.ringFactor, soft ? im.softAlpha : 1);
    playSound(sound, 1, tier.gain);
  }

  private ring(at: Point, colour: number, size: number, alpha: number): void {
    const r = fxFallback(this.scene, "ring", at.x, at.y, size, colour).setDepth(97).setAlpha(alpha);
    this.scene.tweens.add({ targets: r, scale: { from: D.impact.ringScale[0], to: D.impact.ringScale[1] }, alpha: 0, duration: scaleTime(D.impact.ms), ease: "Cubic.easeOut", onComplete: () => r.destroy() });
  }

  // The block counter swells as each shield lands.
  private pulse(side: string): void {
    const text = this.refs().shields.get(side)?.text;
    if (!text || !text.active) return;
    this.scene.tweens.add({ targets: text, scale: D.pulse.scale, duration: scaleTime(D.pulse.ms / 2), yoyo: true, ease: "Quad.easeOut" });
  }

  // The enemy's shield takes the hit and cracks more as its block runs out; at zero it shatters.
  private shieldHit(at: Point, tier: Tier, worn: number, broken: boolean): void {
    const sc = D.shieldCrack;
    const g = this.scene.add.graphics().setDepth(97).setPosition(at.x, at.y);
    g.lineStyle(sc.lineWidth, hexColour(sc.colour), 1);
    const lines = Math.max(1, Math.ceil(sc.lines * Math.min(1, worn)));
    for (let i = 0; i < lines; i++) {
      const a = (i / sc.lines) * Math.PI * 2 + 0.4;
      const len = sc.minLength + (i % 2) * sc.extraLength;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * len * 0.5 + 4, Math.sin(a) * len * 0.5 - 3);
      g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      g.strokePath();
    }
    this.scene.tweens.add({ targets: g, alpha: 0, duration: scaleTime(sc.ms), ease: "Cubic.easeIn", onComplete: () => g.destroy() });
    this.hit(at, tier, "block", "impact:shield"); // one impact sound: the shield's
    if (!broken) return;
    for (let i = 0; i < sc.shards; i++) {
      const a = (i / sc.shards) * Math.PI * 2;
      const s = fxObject(this.scene, "shard", at.x, at.y, sc.shardSize, hexColour(sc.shardColour)) as Phaser.GameObjects.Image;
      s.setDepth(97);
      this.scene.tweens.add({
        targets: s, x: at.x + Math.cos(a) * sc.shardDistance, y: at.y + Math.sin(a) * sc.shardDistance + 30, angle: 180, alpha: 0, duration: scaleTime(sc.ms),
        ease: "Cubic.easeOut", onComplete: () => s.destroy(),
      });
    }
  }
}

// ---- shapes ----

function shieldShape(scene: Phaser.Scene, parent: Container, r: number): void {
  const g = scene.add.graphics();
  g.fillStyle(hexColour(D.shapes.shieldFill), 0.95);
  g.lineStyle(4, hexColour(D.shapes.shieldEdge), 1);
  const pts = [[-1, -1], [1, -1], [1, 0.1], [0, 1.1], [-1, 0.1]].map(([x, y]) => new Phaser.Math.Vector2(x * r, y * r));
  g.fillPoints(pts, true);
  g.strokePoints(pts, true);
  parent.add(g);
}

function coinShape(scene: Phaser.Scene, parent: Container, r: number): void {
  const edge = hexColour(D.shapes.coinEdge);
  parent.add(scene.add.circle(0, 0, r, hexColour(D.shapes.coinFill)).setStrokeStyle(4, edge));
  parent.add(scene.add.circle(0, 0, r * 0.55).setStrokeStyle(3, edge));
}
