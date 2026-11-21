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
// Every duration goes through scaleTime, and landed() lets the Animator hold the next step until
// everything in the air has landed.

interface Tier { minValue: number; size: number; travelMs: number; gain: number }
const D = presentation.projectiles as unknown as {
  maxOnScreen: number;
  staggerMs: number;
  tiers: Tier[];
  colours: Record<"damage" | "block" | "coins", string>;
  impactMs: number;
  arcHeight: number;
  pulse: { scale: number; ms: number };
  seatGlow: { sizeFactor: number; ms: number; alpha: number; capFactor: number; capMs: number; reducedAlpha: number; reducedMs: number };
  shieldCrack: { lines: number; shards: number; ms: number };
};

interface Point { x: number; y: number }
type Kind = "damage" | "block" | "coins";
type Cap = Extract<GameEvent, { type: "capFired" }>;

// The parts of the Animator's refs this file reads (it asks again at landing: the scene redraws
// between events, so earlier references go stale).
export interface TargetRefs {
  bars: Map<string, { x: number; y: number; w: number; h: number }>;
  shields: Map<string, { text: Phaser.GameObjects.Text; x: number; y: number }>;
  plates: Map<string, Point>;
}

// One stop on a shot's way: where it flies to, what happens when it lands.
interface Leg { to: Point; land: () => void; pass?: Point }

function tierOf(value: number): Tier {
  let t = D.tiers[0];
  for (const x of D.tiers) if (value >= x.minValue) t = x;
  return t;
}

const wait = (scene: Phaser.Scene, ms: number) => new Promise<void>((resolve) => scene.time.delayedCall(scaleTime(ms), resolve));

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
  private flights = new Set<Promise<void>>();
  private live = 0; // shots scheduled or in the air

  constructor(private scene: Phaser.Scene, private refs: () => TargetRefs) {}

  // Resolves when every shot in the air has landed.
  async landed(): Promise<void> {
    while (this.flights.size > 0) await Promise.all([...this.flights]);
  }

  // A cap goes off: one shot per trigger, slightly staggered. Past the on-screen limit the
  // remaining triggers merge into one bigger shot. `at` is the cap's centre on screen.
  cap(ev: Cap, shown: BattleView, at: Point): void {
    const refs = this.refs();
    const colour = seatColour(shown.seatOrder, ev.owner);
    const room = Math.max(1, D.maxOnScreen - this.live);
    const singles = ev.triggers <= room ? ev.triggers : room - 1;
    const shots: { count: number; value: number }[] = [];
    for (let i = 0; i < singles; i++) shots.push({ count: 1, value: ev.value });
    if (singles < ev.triggers) shots.push({ count: ev.triggers - singles, value: ev.value * (ev.triggers - singles) });

    // Enemy block as the shots come: what is left decides who hits the shield and who the bar.
    let left = shown.enemy.block;
    const startBlock = left;
    const ignores = ev.effect === "damage" && shown.dominoes.find((d) => d.id === ev.domino)?.effect?.ignoresBlock === true;
    shots.forEach((s, i) => {
      const legs = this.legs(ev.effect, ev, s.value, at, refs, left, startBlock, ignores);
      if (ev.effect === "damage" && !ignores) left = Math.max(0, left - s.value);
      this.live++;
      const flight = this.shot(ev.effect, s.value, s.count, at, legs, colour, i * D.staggerMs).finally(() => {
        this.live--;
        this.flights.delete(flight);
      });
      this.flights.add(flight);
    });
  }

  private legs(kind: Kind, ev: Cap, value: number, at: Point, refs: TargetRefs, left: number, startBlock: number, ignores: boolean): Leg[] {
    const tier = tierOf(value);
    if (kind === "damage") {
      const bar = refs.bars.get("enemy");
      const sh = refs.shields.get("enemy");
      const barAt = bar ? { x: bar.x + bar.w / 2, y: bar.y + bar.h / 2 } : at;
      const onBar: Leg = { to: barAt, land: () => this.hit(barAt, tier, "damage") };
      if (!sh || ignores || left <= 0) return [{ ...onBar, pass: sh && ignores && left > 0 ? { x: sh.x, y: sh.y } : undefined }];
      const shAt = { x: sh.x, y: sh.y };
      const absorbed = Math.min(left, value);
      const remaining = left - absorbed;
      const legs: Leg[] = [{ to: shAt, land: () => this.shieldHit(shAt, tier, 1 - remaining / startBlock, remaining === 0) }];
      if (value > absorbed) legs.push(onBar);
      return legs;
    }
    if (kind === "block") {
      const sh = refs.shields.get("party");
      const to = sh ? { x: sh.x + 30, y: sh.y } : at;
      return [{ to, land: () => { this.hit(to, tier, "block"); this.pulse("party"); } }];
    }
    const plate = refs.plates.get(ev.owner);
    const to = plate ?? { x: at.x, y: at.y - 120 };
    return [{ to, land: () => { this.hit(to, tier, "coins"); floatText(this.scene, to.x, to.y - 20, `+${value}`, "#ffd23f", 36, 900); } }];
  }

  // One shot: waits its turn, flies each leg in turn, lands, goes.
  private async shot(kind: Kind, value: number, count: number, from: Point, legs: Leg[], seat: number, delayMs: number): Promise<void> {
    const scene = this.scene;
    if (delayMs > 0) await wait(scene, delayMs);
    const tier = tierOf(value);
    const colour = hexColour(D.colours[kind]);
    const c = scene.add.container(from.x, from.y).setDepth(96);
    const glow = fxFallback(scene, "glow", 0, 0, tier.size * 2, seat, c);
    if (!reducedFlashing()) glow.setBlendMode(Phaser.BlendModes.ADD);
    if (kind === "damage") fxObject(scene, "bolt", 0, 0, tier.size, colour, c);
    else if (kind === "block") shieldShape(scene, c, tier.size * 0.5);
    else coinShape(scene, c, tier.size * 0.3);
    if (count > 1) c.add(scene.add.text(0, tier.size * 0.55, `×${count}`, { fontFamily: "Arial, Helvetica, sans-serif", fontSize: "26px", fontStyle: "bold", color: "#ffffff", stroke: "#101010", strokeThickness: 5 }).setOrigin(0.5));
    playSound(`launch:${kind}`);
    let pos = from;
    for (const leg of legs) {
      await this.travel(c, pos, leg.to, tier.travelMs, kind === "coins" ? D.arcHeight : 0, kind === "damage", leg.pass);
      leg.land();
      pos = leg.to;
    }
    c.destroy();
  }

  private travel(c: Phaser.GameObjects.Container, a: Point, b: Point, ms: number, arc: number, aim: boolean, pass?: Point): Promise<void> {
    if (aim) c.setRotation(Math.atan2(b.y - a.y, b.x - a.x));
    let passed = false;
    return new Promise((resolve) => {
      this.scene.tweens.addCounter({
        from: 0, to: 1, duration: scaleTime(ms), ease: arc > 0 ? "Sine.easeInOut" : "Cubic.easeIn",
        onUpdate: (t) => {
          const k = t.getValue() ?? 1;
          c.setPosition(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k - arc * Math.sin(k * Math.PI));
          if (pass && !passed && k > 0.6) {
            passed = true;
            this.ring(pass, 0xffffff, 60, 0.6); // passes through the enemy's block untouched
          }
        },
        onComplete: () => resolve(),
      });
    });
  }

  // ---- landings ----

  // An impact burst at the target, bigger for a bigger shot, louder too.
  private hit(at: Point, tier: Tier, kind: Kind): void {
    const colour = hexColour(D.colours[kind]);
    const size = tier.size * 1.5;
    const soft = reducedFlashing();
    const parts: Phaser.GameObjects.GameObject[] = [];
    if (kind === "damage") parts.push(fxObject(this.scene, "slash", at.x, at.y, size, 0xffffff));
    if (!soft) parts.push(fxObject(this.scene, "spark", at.x, at.y, size, colour));
    for (const p of parts) (p as Phaser.GameObjects.Image).setDepth(97);
    if (parts.length > 0) {
      this.scene.tweens.add({ targets: parts, scale: { from: 0.4, to: 1.3 }, alpha: { from: 1, to: 0 }, duration: scaleTime(D.impactMs), ease: "Cubic.easeOut", onComplete: () => parts.forEach((p) => p.destroy()) });
    }
    this.ring(at, colour, size * 0.7, soft ? 0.5 : 1);
    playSound(`impact:${kind}`, 1, tier.gain);
  }

  private ring(at: Point, colour: number, size: number, alpha: number): void {
    const r = fxFallback(this.scene, "ring", at.x, at.y, size, colour).setDepth(97).setAlpha(alpha);
    this.scene.tweens.add({ targets: r, scale: { from: 0.5, to: 1.8 }, alpha: 0, duration: scaleTime(D.impactMs), ease: "Cubic.easeOut", onComplete: () => r.destroy() });
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
    g.lineStyle(3, 0xffffff, 1);
    const lines = Math.max(1, Math.ceil(sc.lines * Math.min(1, worn)));
    for (let i = 0; i < lines; i++) {
      const a = (i / sc.lines) * Math.PI * 2 + 0.4;
      const len = 26 + (i % 2) * 14;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * len * 0.5 + 4, Math.sin(a) * len * 0.5 - 3);
      g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      g.strokePath();
    }
    this.scene.tweens.add({ targets: g, alpha: 0, duration: scaleTime(sc.ms), ease: "Cubic.easeIn", onComplete: () => g.destroy() });
    this.hit(at, tier, "block");
    playSound("impact:shield", 1, tier.gain);
    if (!broken) return;
    for (let i = 0; i < sc.shards; i++) {
      const a = (i / sc.shards) * Math.PI * 2;
      const s = fxObject(this.scene, "shard", at.x, at.y, 26, 0x9cc4ff) as Phaser.GameObjects.Image;
      s.setDepth(97);
      this.scene.tweens.add({
        targets: s, x: at.x + Math.cos(a) * 80, y: at.y + Math.sin(a) * 80 + 30, angle: 180, alpha: 0, duration: scaleTime(sc.ms),
        ease: "Cubic.easeOut", onComplete: () => s.destroy(),
      });
    }
  }
}

// ---- shapes ----

function shieldShape(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, r: number): void {
  const g = scene.add.graphics();
  g.fillStyle(0x4a6fa5, 0.95);
  g.lineStyle(4, 0xdbe6f5, 1);
  const pts = [[-1, -1], [1, -1], [1, 0.1], [0, 1.1], [-1, 0.1]].map(([x, y]) => new Phaser.Math.Vector2(x * r, y * r));
  g.fillPoints(pts, true);
  g.strokePoints(pts, true);
  parent.add(g);
}

function coinShape(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, r: number): void {
  parent.add(scene.add.circle(0, 0, r, 0xffd23f).setStrokeStyle(4, 0x9a6a00));
  parent.add(scene.add.circle(0, 0, r * 0.55).setStrokeStyle(3, 0x9a6a00));
}
