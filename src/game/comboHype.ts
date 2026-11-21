import Phaser from "phaser";
import presentation from "../../data/presentation.json";
import type { GameEvent } from "../engine/events";
import type { Refs } from "./animations";
import { reducedFlashing, shakeEnabled } from "./comfort";
import { fxFallback, fxObject } from "./fx";
import { scaleTime } from "./playbackSpeed";
import { combatLayoutData, hexColour } from "./presentation";
import * as soundModule from "./sound";
import { playSound } from "./sound";

// Cascade hype (#234, H1-H9): one big combo number in the middle of the board area, fixed on screen
// whatever the camera does. Each cap's spark flies into it and it rolls up and punches; it grows
// through tiers (by its share of the enemy's health when the cascade started), catches fire when the
// damage would be lethal, and after the last cap charges up and slams into the enemy as one hit, then a
// fanfare. Visual and sound only, driven by the capFired, damage and block events and the numbers in
// them: the damage counted is what the caps deal, the block the enemy absorbs included, so every number
// shown is a sum of events. The enemy's health bar, its block and the party's block do not move until
// the slam (owed() is what the table still holds back). Every size, time, colour and word is in
// data/presentation.json (comboHype); every duration goes through scaleTime; shake and reduced flashing
// come from comfort.ts. Sounds are played by cue name; a cue with no file is skipped.

type Kind = "damage" | "block";
interface Pt { x: number; y: number }
type Obj = Phaser.GameObjects.Image;
type Container = Phaser.GameObjects.Container;
type Text = Phaser.GameObjects.Text;

interface Data {
  tiers: { thresholds: number[]; colours: string[]; words: string[] };
  layout: { yFraction: number; maxWidthFraction: number };
  number: {
    sizes: number[]; stroke: number; strokeColour: string;
    hits: { size: number; colour: string; dyFactor: number; dy: number };
    block: { sizeFactor: number; minSize: number; colour: string; gap: number; shieldColour: string; shieldEdge: string };
    halo: { colour: string; layers: number; padX: number; heightFactor: number };
    rollMs: number; punch: { scale: number; reducedScale: number; ms: number }; growMs: number;
  };
  flight: { ms: number; curve: number; size: number; trailEveryPx: number; trailMs: number; trailSize: number; arrival: { ringSize: number; ringMs: number; sparkSize: number } };
  capBurst: { size: number; ms: number };
  microFreezeMs: number[];
  gap: { startMs: number; stepMs: number; minMs: number; stepFraction: number };
  tierJump: {
    calloutSize: number; calloutDy: number; calloutMs: number; calloutFrom: number; calloutTo: number; calloutPopMs: number;
    ringSize: number[]; burstSize: number[]; fxMs: number; flashAlpha: number[]; flashMs: number;
    shakeMs: number[]; shakeIntensity: number[]; tintAlpha: number[]; tintReducedAlpha: number; tintMs: number;
  };
  lethal: {
    word: string; colour: string; size: number; dy: number; gradientTop: string; gradientBottom: string;
    flame: { size: number; rise: number; lifeMs: number; everyMs: number; perTick: number; maxAlive: number; colour: string; alpha: number; reducedEveryMs: number; reducedPerTick: number; reducedAlpha: number };
    ringSize: number; burstSize: number; flashAlpha: number; shakeMs: number; shakeIntensity: number;
  };
  slam: {
    chargeMs: number[]; swell: number; tremble: number; flightMs: number; flightEndScale: number;
    hitStopMs: number[]; flashAlpha: number[]; flashMs: number; shakeMs: number[]; shakeIntensity: number[]; gain: number[];
    burstSize: number[]; ringSize: number[]; fxMs: number;
    popup: { size: number; blockedSize: number; blockedColour: string; dy: number; ms: number };
    block: { chargeMs: number; flightMs: number };
  };
  fanfare: {
    holdMs: number[]; sparkles: number[]; killMultiplier: number; size: number; fallMs: number; spreadMs: number; coinEvery: number; colours: string[];
    shatter: { shards: number; size: number; spread: number; ms: number };
  };
  skip: { factor: number };
}
const D = presentation.comboHype as unknown as Data;

const FONT = "Arial, Helvetica, sans-serif";
const W = 1920;
const H = 1080;
const DEPTH = 130;

// What the Animator lends: where the table's parts are, and the table's own reaction to the slam.
export interface HypeHost {
  refs(): Refs;
  aim(): { x: number; y: number }; // the enemy card's portrait, in table coordinates
  impact(t: { amount: number; blocked: number; killed: boolean }): void; // the enemy takes the slam (reactions, bars)
  partyBlock(): void; // the block lands on the party's block chip
  skipping(): boolean; // the scene is fast-forwarding (a skipped cascade)
}

// A cap's spark on its way: the amounts of its damage or block events join it as they arrive.
interface Hit { kind: Kind; amount: number; events: number; triggers: number; landed: boolean; cancel?: () => void }

// A function that stops the charge cue if the sound module has one (#235 adds stopSound).
const stopCharge = (): void => (soundModule as unknown as { stopSound?: (cue: string) => void }).stopSound?.("combo:charge");

const colourOf = (tier: number): number => hexColour(D.tiers.colours[tier]);
const between = (a: number, b: number): number => Phaser.Math.FloatBetween(a, b);

export class ComboHype {
  on = false; // a cascade is being counted (set off until its slam starts)
  private begun = false; // the cascade's colours and tint stay up until the next round
  private start = { health: 0, block: 0 };
  private sum = { damage: 0, health: 0, blocked: 0, block: 0 }; // every event so far
  private shown = { damage: 0, block: 0 }; // what the number shows (what the landed sparks added up to)
  private hits = { damage: 0, block: 0 };
  private caps = 0;
  private tier = 0;
  private top = 0;
  private fire = false;
  private quick = false; // skipped: no flights, no incremental effects
  private open: Record<Kind, Hit | null> = { damage: null, block: null };
  private flights = new Set<Hit>();
  private waiters: (() => void)[] = [];
  private owing = { enemyHealth: 0, enemyBlock: 0, partyBlock: 0 };

  private root: Container; // screen-fixed: re-placed every frame against the camera's zoom
  private tint: Phaser.GameObjects.Rectangle;
  private group?: Container; // the number's whole look; scaled to fit and swelled for the charge
  private dmgBox?: Container;
  private dmgText?: Text;
  private hitsText?: Text;
  private blockBox?: Container;
  private blockText?: Text;
  private haloParts: Phaser.GameObjects.Graphics[] = [];
  private fit = 1;
  private swell = 1;
  private tremble = 0;
  private roll = { damage: { v: 0 }, block: { v: 0 } };
  private fireTimer?: Phaser.Time.TimerEvent;
  private flames = new Set<Phaser.GameObjects.GameObject>();
  private temp = new Set<Phaser.GameObjects.GameObject>(); // effects still on screen, for clear()
  private token = 0; // bumped by clear(): late callbacks do nothing
  private tweenTargets: object[] = [];
  private onUpdate = () => this.sync();

  constructor(private scene: Phaser.Scene, private host: HypeHost) {
    // The tint sits just above the table's background and below the redrawn layer (made later).
    this.tint = scene.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 1).setAlpha(0).setScrollFactor(0).setDepth(0);
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(DEPTH);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate);
      this.token++;
    });
  }

  // ---- what the table asks ----

  // What the table still holds back until the slam: added to the shown value of the enemy's health and
  // block and the party's block when they are drawn.
  owed(side: "party" | "enemy", kind: "health" | "block"): number {
    if (side === "enemy") return kind === "health" ? this.owing.enemyHealth : this.owing.enemyBlock;
    return kind === "block" ? this.owing.partyBlock : 0;
  }

  // The colour lit dominoes and fuses glow in: the tier the cascade has reached.
  litColour(): number | undefined {
    return this.begun ? colourOf(this.top) : undefined;
  }

  // The wait after an event during the cascade: the pause after each cap shrinks as it goes on.
  pace(ev: GameEvent, wait: number): number {
    if (!this.on) return wait;
    const g = D.gap;
    const gap = Math.max(g.minMs, g.startMs - g.stepMs * this.caps);
    if (ev.type === "cascadeStep") return gap * g.stepFraction;
    if ((ev.type === "damage" && ev.side === "enemy") || (ev.type === "block" && ev.side === "party")) {
      const hit = this.open[ev.type === "damage" ? "damage" : "block"];
      return gap / Math.max(1, hit?.triggers ?? 1);
    }
    return wait;
  }

  // ---- the cascade ----

  // The cascade is set off: remember what the enemy had, and start counting from nothing.
  begin(enemy: { health: number; block: number }): void {
    this.clear();
    this.on = true;
    this.begun = true;
    this.start = { health: Math.max(1, enemy.health), block: enemy.block };
  }

  // A cap fired (worldAt: where it is on the table): it bursts, and its spark flies into the number.
  // Returns a function for a short freeze on the hit, to run after anything else the cap does (none when
  // `noFreeze`: the cap already holds the table in slow motion).
  cap(ev: Extract<GameEvent, { type: "capFired" }>, worldAt: Pt, noFreeze: boolean): (() => Promise<void>) | undefined {
    if (!this.on) return undefined;
    this.caps++;
    const kind: Kind = ev.effect;
    const hit: Hit = { kind, amount: 0, events: 0, triggers: ev.triggers, landed: false };
    this.open[kind] = hit;
    if (this.quick) {
      hit.landed = true;
      return undefined;
    }
    this.capBurst(worldAt);
    this.fly(hit, this.toScreen(worldAt));
    const ms = D.microFreezeMs[this.tier] ?? 0;
    if (kind === "damage" && !noFreeze && ms > 0 && shakeEnabled()) return () => this.freeze(ms);
    return undefined;
  }

  // An event of the cascade: its numbers are counted (and the table holds the change back) before the
  // table redraws with it. Only the enemy's damage and the party's block count.
  event(ev: GameEvent): void {
    if (!this.on) return;
    if (ev.type === "damage" && ev.side === "enemy") {
      this.sum.damage += ev.amount + ev.blocked;
      this.sum.health += ev.amount;
      this.sum.blocked += ev.blocked;
      this.owing.enemyHealth += ev.amount;
      this.owing.enemyBlock += ev.blocked;
      this.count("damage", ev.amount + ev.blocked);
    } else if (ev.type === "block" && ev.side === "party") {
      this.sum.block += ev.amount;
      this.owing.partyBlock += ev.amount;
      this.count("block", ev.amount);
    }
  }

  // The amount joins the cap's spark, or counts at once when there is no spark (it already landed, or
  // there never was one: the Junction Runner's block).
  private count(kind: Kind, amount: number): void {
    const hit = this.open[kind];
    if (hit && !hit.landed) {
      hit.amount += amount;
      hit.events++;
    } else this.add(kind, amount, 1);
  }

  // Everything in the air has landed.
  async landed(): Promise<void> {
    while (this.flights.size > 0) await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  // The player skipped: sparks in the air land now, and from here the numbers jump (no flights, no
  // build-up effects); the slam then plays short.
  skip(): void {
    this.quick = true;
    for (const hit of [...this.flights]) hit.cancel?.();
  }

  // Everything away at once (a new round, the scene going).
  clear(): void {
    this.token++;
    this.on = false;
    this.begun = false;
    this.quick = false;
    this.sum = { damage: 0, health: 0, blocked: 0, block: 0 };
    this.shown = { damage: 0, block: 0 };
    this.hits = { damage: 0, block: 0 };
    this.roll.damage.v = 0;
    this.roll.block.v = 0;
    this.caps = 0;
    this.tier = 0;
    this.top = 0;
    this.fire = false;
    this.open = { damage: null, block: null };
    for (const hit of [...this.flights]) hit.cancel?.();
    this.flights.clear();
    this.owing = { enemyHealth: 0, enemyBlock: 0, partyBlock: 0 };
    this.fireTimer?.remove(false);
    this.fireTimer = undefined;
    this.flames.clear();
    this.temp.forEach((o) => o.destroy());
    this.temp.clear();
    this.group?.destroy();
    this.group = this.dmgBox = this.blockBox = undefined;
    this.dmgText = this.hitsText = this.blockText = undefined;
    this.haloParts = [];
    this.swell = 1;
    this.tremble = 0;
    this.tweenTargets.forEach((t) => this.scene.tweens.killTweensOf(t));
    this.tweenTargets = [];
    this.scene.tweens.killTweensOf(this.tint);
    this.tint.setAlpha(0);
    this.wake();
  }

  private wake(): void {
    if (this.flights.size > 0) return;
    this.waiters.splice(0).forEach((r) => r());
  }

  // ---- screen-fixed placement ----

  private sync(): void {
    const cam = this.scene.cameras.main;
    const z = cam?.zoom || 1;
    this.root.setPosition(W / 2 - W / 2 / z, H / 2 - H / 2 / z).setScale(1 / z);
    this.tint.setScale(1 / z);
    if (this.group?.active) {
      const c = this.centre();
      const t = this.tremble;
      this.group.setPosition(c.x + (t ? between(-t, t) : 0), c.y + (t ? between(-t, t) : 0)).setScale(this.fit * this.swell);
    }
  }

  // Where the number sits: the middle of the board area, a little above its centre.
  private centre(): Pt {
    const A = combatLayoutData.board;
    return { x: A.x + A.w / 2, y: A.y + A.h * D.layout.yFraction };
  }

  // A point on the table, as it appears on screen now (the camera may be zoomed out on a big board).
  private toScreen(p: Pt): Pt {
    const cam = this.scene.cameras.main;
    const z = cam.zoom || 1;
    return { x: W / 2 + (p.x - (cam.scrollX + W / 2)) * z, y: H / 2 + (p.y - (cam.scrollY + H / 2)) * z };
  }

  // The number's box on screen (fixed: the root cancels the camera).
  private numberAt(kind: Kind): Pt {
    const box = kind === "damage" ? this.dmgBox : this.blockBox;
    const g = this.group;
    if (!box || !g) return this.centre();
    const s = g.scaleX;
    return { x: g.x + box.x * s, y: g.y + box.y * s };
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.scene.time.delayedCall(scaleTime(ms), resolve));
  }

  // A short hold of everything on the table (hit-stop).
  private async freeze(ms: number): Promise<void> {
    if (ms <= 0) return;
    const prev = this.scene.tweens.timeScale;
    this.scene.tweens.timeScale = 0;
    await this.wait(ms);
    this.scene.tweens.timeScale = this.host.skipping() && !this.slamming ? 1000 : prev;
  }
  private slamming = false; // the short slam of a skipped cascade runs at normal speed

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.temp.add(o);
    o.once(Phaser.GameObjects.Events.DESTROY, () => this.temp.delete(o));
    return o;
  }

  // ---- the number ----

  // The pieces of the number, made the first time they are needed.
  private ensure(kind: Kind): void {
    if (!this.group) {
      const c = this.centre();
      this.group = this.scene.add.container(c.x, c.y);
      this.root.add(this.group);
      const g = D.number.halo;
      for (let i = 0; i < g.layers; i++) {
        const halo = fxFallback(this.scene, "glow", 0, 0, 100, hexColour(g.colour), this.group);
        this.haloParts.push(halo);
      }
    }
    const N = D.number;
    if (kind === "damage" && !this.dmgBox) {
      this.dmgText = this.scene.add.text(0, 0, "0", this.style(N.sizes[this.tier], D.tiers.colours[this.tier])).setOrigin(0.5);
      this.dmgBox = this.scene.add.container(0, 0, [this.dmgText]);
      this.hitsText = this.scene.add.text(0, 0, "", this.style(N.hits.size, N.hits.colour, 8)).setOrigin(0.5);
      this.group.add([this.dmgBox, this.hitsText]);
      if (this.fire) this.dress();
    } else if (kind === "block" && !this.blockBox) {
      this.blockText = this.scene.add.text(0, 0, "0", this.style(this.blockSize(), N.block.colour)).setOrigin(0, 0.5);
      const shield = this.scene.add.graphics();
      this.blockBox = this.scene.add.container(0, 0, [shield, this.blockText]);
      this.group.add(this.blockBox);
    }
    this.layout();
  }

  private style(size: number, colour: string, stroke = D.number.stroke): Phaser.Types.GameObjects.Text.TextStyle {
    return { fontFamily: FONT, fontSize: `${size}px`, fontStyle: "bold", color: colour, stroke: D.number.strokeColour, strokeThickness: stroke };
  }

  private blockSize(): number {
    return Math.max(D.number.block.minSize, Math.round(D.number.sizes[this.tier] * D.number.block.sizeFactor));
  }

  // Places the parts: the damage number in the middle (or left, with block beside it), the hit count
  // under it, a halo behind, all shrunk to fit the board area when it is wide.
  private layout(): void {
    const g = this.group;
    if (!g?.active) return;
    const size = D.number.sizes[this.tier];
    const dw = this.dmgText && this.dmgText.active ? this.dmgText.width : 0;
    let bw = 0;
    if (this.blockBox && this.blockText?.active) {
      const s = this.blockSize();
      bw = s * 0.85 + this.blockText.width;
      this.blockText.setX(s * 0.55);
      this.drawShield(this.blockBox.first as Phaser.GameObjects.Graphics, s);
    }
    const gap = dw > 0 && bw > 0 ? D.number.block.gap : 0;
    const total = dw + gap + bw;
    const A = combatLayoutData.board;
    this.fit = Math.min(1, (A.w * D.layout.maxWidthFraction) / Math.max(1, total));
    if (this.dmgBox) this.dmgBox.setX(-total / 2 + dw / 2);
    if (this.blockBox) this.blockBox.setX(total / 2 - bw + 0).setY(dw > 0 ? size * 0.08 : 0);
    if (this.hitsText?.active && this.dmgBox) this.hitsText.setPosition(this.dmgBox.x, size * D.number.hits.dyFactor + D.number.hits.dy);
    const hh = size * D.number.halo.heightFactor;
    this.haloParts.forEach((h, i) => h.setScale((total + D.number.halo.padX) / 100, hh / 100).setAlpha(i === 0 ? 1 : 0.7));
  }

  private drawShield(g: Phaser.GameObjects.Graphics, s: number): void {
    g.clear();
    const pts = [[-1, -1], [1, -1], [1, 0.1], [0, 1.1], [-1, 0.1]].map(([a, b]) => new Phaser.Math.Vector2(s * 0.3 + a * s * 0.32, b * s * 0.32 - s * 0.04));
    g.fillStyle(hexColour(D.number.block.shieldColour), 1);
    g.lineStyle(Math.max(2, s * 0.06), hexColour(D.number.block.shieldEdge), 1);
    g.fillPoints(pts, true);
    g.strokePoints(pts, true);
  }

  // Counts an amount into the number (a spark landed, or an event with no spark): it rolls up, punches,
  // the hit count bumps, and a new tier or the lethal fire follows.
  private add(kind: Kind, amount: number, events: number): void {
    if (amount <= 0 && events <= 0) return;
    this.shown[kind] += amount;
    this.hits[kind] += events;
    this.ensure(kind);
    if (kind === "damage") {
      const before = this.tier;
      let to = 0;
      D.tiers.thresholds.forEach((t, i) => {
        if (this.shown.damage >= t * this.start.health) to = i + 1;
      });
      if (to > this.tier) {
        this.tier = to;
        this.top = Math.max(this.top, to);
      }
      this.setNumber("damage", before !== this.tier);
      if (!this.quick) {
        playSound("combo:hit", this.hits.damage);
        if (this.tier > before) this.tierJump(this.tier);
      }
      if (!this.fire && this.shown.damage >= this.start.health + this.start.block) this.ignite();
    } else {
      this.setNumber("block", false);
      if (!this.quick) playSound("combo:block", this.hits.block);
    }
    if (!this.quick) this.arrival(kind);
  }

  // Shows the shown totals: rolls the digits up, sets the tier's size and colour.
  private setNumber(kind: Kind, tierChanged: boolean): void {
    const text = kind === "damage" ? this.dmgText : this.blockText;
    const box = kind === "damage" ? this.dmgBox : this.blockBox;
    if (!text || !box) return;
    const roll = this.roll[kind];
    const to = this.shown[kind];
    this.scene.tweens.killTweensOf(roll);
    this.tweenTargets.push(roll);
    const show = (v: number): void => {
      if (!text.active) return;
      text.setText(kind === "block" ? `+${Math.round(v)}` : String(Math.round(v)));
      this.layout();
    };
    if (tierChanged) {
      const was = text.style.fontSize;
      text.setFontSize(D.number.sizes[this.tier]);
      if (this.hitsText?.active) this.hitsText.setText(this.hitsLabel());
      if (!this.fire) text.setColor(D.tiers.colours[this.tier]);
      if (this.blockText?.active) this.blockText.setFontSize(this.blockSize());
      if (!this.quick) {
        const k = (parseFloat(String(was)) || D.number.sizes[0]) / D.number.sizes[this.tier];
        box.setScale(k);
        this.tweenTargets.push(box);
        this.scene.tweens.add({ targets: box, scale: 1, duration: scaleTime(D.number.growMs), ease: "Back.easeOut" });
      }
    }
    if (kind === "damage" && this.hitsText?.active) this.hitsText.setText(this.hitsLabel());
    if (this.quick) {
      roll.v = to;
      show(to);
      return;
    }
    this.scene.tweens.add({ targets: roll, v: to, duration: scaleTime(D.number.rollMs), ease: "Cubic.easeOut", onUpdate: () => show(roll.v), onComplete: () => show(to) });
  }

  private hitsLabel(): string {
    return `${this.hits.damage} ${this.hits.damage === 1 ? "HIT" : "HITS"}`;
  }

  // A spark arrived: the number punches bigger and settles, a small burst and a shake.
  private arrival(kind: Kind): void {
    const box = kind === "damage" ? this.dmgBox : this.blockBox;
    if (!box) return;
    const P = D.number.punch;
    const k = reducedFlashing() ? P.reducedScale : P.scale;
    this.scene.tweens.killTweensOf(box);
    box.setScale(k);
    this.tweenTargets.push(box);
    this.scene.tweens.add({ targets: box, scale: 1, duration: scaleTime(P.ms), ease: "Back.easeOut" });
    if (kind === "damage" && this.hitsText?.active) {
      this.scene.tweens.killTweensOf(this.hitsText);
      this.hitsText.setScale(1.3);
      this.tweenTargets.push(this.hitsText);
      this.scene.tweens.add({ targets: this.hitsText, scale: 1, duration: scaleTime(P.ms), ease: "Back.easeOut" });
    }
    const at = this.numberAt(kind);
    const A = D.flight.arrival;
    const colour = kind === "damage" ? colourOf(this.tier) : hexColour(D.number.block.colour);
    this.ring(at, colour, A.ringSize, A.ringMs);
    if (!reducedFlashing()) this.puff("spark", at, A.sparkSize, colour, A.ringMs);
    this.shakeBy(this.tier === 0 ? 0.002 : D.tierJump.shakeIntensity[this.tier] * 0.4, 120);
  }

  // ---- tiers ----

  private tierJump(tier: number): void {
    const J = D.tierJump;
    const colour = colourOf(tier);
    const at = this.centre();
    playSound(`combo:tier${tier}`);
    this.callout(D.tiers.words[tier], D.tiers.colours[tier], J.calloutSize, J.calloutDy + D.number.sizes[tier] * 0.62);
    this.ring(at, colour, J.ringSize[tier], J.fxMs);
    this.puff("burst", at, J.burstSize[tier], colour, J.fxMs);
    this.flash(colour, J.flashAlpha[tier], J.flashMs);
    this.shakeBy(J.shakeIntensity[tier], J.shakeMs[tier]);
    // The background tint takes the tier's colour and stays until the cascade ends.
    this.scene.tweens.killTweensOf(this.tint);
    this.tint.setFillStyle(colour, 1);
    this.tweenTargets.push(this.tint);
    this.scene.tweens.add({ targets: this.tint, alpha: reducedFlashing() ? J.tintReducedAlpha : J.tintAlpha[tier], duration: scaleTime(J.tintMs) });
  }

  // A word that pops in above the number and fades.
  private callout(word: string, colour: string, size: number, dy: number): void {
    const g = this.group;
    if (!g?.active || !word) return;
    const J = D.tierJump;
    const t = this.scene.add.text(0, -dy, word, this.style(size, colour, 10)).setOrigin(0.5);
    g.add(t);
    this.track(t);
    const soft = reducedFlashing();
    t.setScale(soft ? 1 : J.calloutFrom).setAlpha(0);
    this.scene.tweens.add({ targets: t, alpha: 1, duration: scaleTime(J.calloutPopMs * 0.5) });
    if (!soft) this.scene.tweens.add({ targets: t, scale: J.calloutTo, duration: scaleTime(J.calloutPopMs), ease: "Back.easeOut" });
    this.scene.tweens.add({ targets: t, alpha: 0, delay: scaleTime(J.calloutMs * 0.6), duration: scaleTime(J.calloutMs * 0.4), onComplete: () => t.destroy() });
  }

  // ---- lethal fire ----

  // The damage so far would take the enemy to 0: the number catches fire.
  private ignite(): void {
    if (this.fire) return;
    this.fire = true;
    const F = D.lethal;
    const at = this.centre();
    this.dress();
    if (!this.quick) {
      playSound("combo:lethal");
      this.callout(F.word, F.colour, F.size, F.dy + D.number.sizes[this.tier] * 0.62 + D.tierJump.calloutSize * 0.8);
      this.ring(at, hexColour(F.colour), F.ringSize, D.tierJump.fxMs);
      this.puff("burst", at, F.burstSize, hexColour(F.colour), D.tierJump.fxMs);
      this.flash(hexColour(F.colour), F.flashAlpha, D.tierJump.flashMs);
      this.shakeBy(F.shakeIntensity, F.shakeMs);
    }
    const soft = reducedFlashing();
    this.fireTimer = this.scene.time.addEvent({
      delay: scaleTime(soft ? F.flame.reducedEveryMs : F.flame.everyMs), loop: true,
      callback: () => {
        if (this.scene.tweens.timeScale === 0) return;
        for (let i = 0; i < (soft ? F.flame.reducedPerTick : F.flame.perTick); i++) this.flame();
      },
    });
  }

  // The flame gradient on the number's letters.
  private dress(): void {
    const t = this.dmgText;
    if (!t?.active) return;
    const top = hexColour(D.lethal.gradientTop);
    const bottom = hexColour(D.lethal.gradientBottom);
    t.setColor("#ffffff").setTint(top, top, bottom, bottom);
  }

  // One flame leaves the number's top edge and rises, mirrored at random and of varied size.
  private flame(): void {
    const g = this.group;
    const t = this.dmgText;
    if (!g?.active || !t?.active || this.flames.size >= D.lethal.flame.maxAlive) return;
    const F = D.lethal.flame;
    const size = F.size * between(0.6, 1.1) * (D.number.sizes[this.tier] / D.number.sizes[0]) ** 0.5;
    const x = (this.dmgBox?.x ?? 0) + between(-t.width / 2, t.width / 2);
    const y = -t.height * 0.42;
    const o = fxObject(this.scene, "flame", x, y, size, hexColour(F.colour), g) as Obj;
    o.setScale(o.scaleX * (Math.random() < 0.5 ? -1 : 1), o.scaleY);
    if (!reducedFlashing()) o.setBlendMode(Phaser.BlendModes.ADD);
    g.moveTo(o, 1); // behind the number, over the halo
    o.setAlpha(reducedFlashing() ? F.reducedAlpha : F.alpha);
    this.flames.add(o);
    this.scene.tweens.add({
      targets: o, y: y - F.rise * between(0.7, 1), alpha: 0, scaleY: o.scaleY * 0.5, scaleX: o.scaleX * 0.5,
      duration: scaleTime(F.lifeMs * between(0.7, 1)), ease: "Cubic.easeOut",
      onComplete: () => { this.flames.delete(o); o.destroy(); },
    });
  }

  private stopFire(): void {
    this.fireTimer?.remove(false);
    this.fireTimer = undefined;
  }

  // ---- sparks flying into the number ----

  // A cap's spark flies on a curve, with a trail in the tier's colour, into its number.
  private fly(hit: Hit, from: Pt): void {
    const F = D.flight;
    const scene = this.scene;
    const token = this.token;
    this.flights.add(hit);
    const c = scene.add.container(from.x, from.y);
    this.root.add(c);
    this.track(c);
    const colour = hit.kind === "damage" ? colourOf(this.tier) : hexColour(D.number.block.colour);
    const glow = fxFallback(scene, "glow", 0, 0, F.size * 2.4, colour, c);
    if (!reducedFlashing()) glow.setBlendMode(Phaser.BlendModes.ADD);
    fxObject(scene, "spark", 0, 0, F.size, colour, c);
    // The number may not exist yet: its place is where it will be.
    const target = (): Pt => (hit.kind === "damage" ? (this.dmgBox ? this.numberAt("damage") : this.centre()) : this.blockBox ? this.numberAt("block") : this.blockPlace());
    const a = from;
    const curve = F.curve * (Math.random() < 0.5 ? -1 : 1);
    let lastTrail = { x: from.x, y: from.y };
    const finish = (): void => {
      tween.stop();
      c.destroy();
      this.flights.delete(hit);
      if (token !== this.token) return;
      hit.landed = true;
      this.add(hit.kind, hit.amount, hit.events);
      this.wake();
    };
    hit.cancel = finish;
    const tween = scene.tweens.addCounter({
      from: 0, to: 1, duration: scaleTime(F.ms), ease: "Sine.easeIn",
      onUpdate: (t) => {
        const k = t.getValue() ?? 1;
        const b = target();
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const cx = mx - ((b.y - a.y) / len) * curve;
        const cy = my + ((b.x - a.x) / len) * curve;
        const x = (1 - k) * (1 - k) * a.x + 2 * (1 - k) * k * cx + k * k * b.x;
        const y = (1 - k) * (1 - k) * a.y + 2 * (1 - k) * k * cy + k * k * b.y;
        c.setPosition(x, y);
        if (Math.hypot(x - lastTrail.x, y - lastTrail.y) >= F.trailEveryPx) {
          lastTrail = { x, y };
          this.trail({ x, y }, colour);
        }
      },
      onComplete: finish,
    });
  }

  // Where the block number will appear when there is none yet: beside the damage number.
  private blockPlace(): Pt {
    const c = this.centre();
    return { x: c.x + (this.dmgBox ? 200 : 0), y: c.y };
  }

  private trail(at: Pt, colour: number): void {
    const o = fxFallback(this.scene, "glow", at.x, at.y, D.flight.trailSize, colour, this.root);
    this.track(o);
    if (!reducedFlashing()) o.setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: o, alpha: 0, scale: 0.3, duration: scaleTime(D.flight.trailMs), onComplete: () => o.destroy() });
  }

  // ---- small effects ----

  // A burst of sparks where a cap fires (on the table, so it moves with the camera).
  private capBurst(at: Pt): void {
    const B = D.capBurst;
    const colour = colourOf(this.tier);
    const o = fxObject(this.scene, "spark", at.x, at.y, B.size, colour) as Obj;
    o.setDepth(98);
    if (!reducedFlashing()) o.setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: o, scale: o.scaleX * 1.8, alpha: 0, duration: scaleTime(B.ms), ease: "Cubic.easeOut", onComplete: () => o.destroy() });
  }

  private ring(at: Pt, colour: number, size: number, ms: number): void {
    const r = fxFallback(this.scene, "ring", at.x, at.y, size, colour, this.root);
    this.track(r);
    r.setScale(0.3).setAlpha(reducedFlashing() ? 0.5 : 1);
    this.scene.tweens.add({ targets: r, scale: 1, alpha: 0, duration: scaleTime(ms), ease: "Cubic.easeOut", onComplete: () => r.destroy() });
  }

  // An art (or code-drawn) burst or spark that swells and fades.
  private puff(id: "spark" | "burst", at: Pt, size: number, colour: number, ms: number): void {
    const o = fxObject(this.scene, id, at.x, at.y, size, colour, this.root) as Obj;
    this.track(o);
    if (!reducedFlashing()) o.setBlendMode(Phaser.BlendModes.ADD);
    o.setScale(o.scaleX * 0.4, o.scaleY * 0.4);
    this.scene.tweens.add({ targets: o, scaleX: o.scaleX * 2.6, scaleY: o.scaleY * 2.6, alpha: 0, duration: scaleTime(ms), ease: "Cubic.easeOut", onComplete: () => o.destroy() });
  }

  private flash(colour: number, alpha: number, ms: number): void {
    if (reducedFlashing() || alpha <= 0) return;
    const f = this.scene.add.rectangle(W / 2, H / 2, W, H, colour, alpha);
    this.root.add(f);
    this.root.sendToBack(f);
    this.track(f);
    this.scene.tweens.add({ targets: f, alpha: 0, duration: scaleTime(ms), onComplete: () => f.destroy() });
  }

  private shakeBy(intensity: number, ms: number): void {
    if (!shakeEnabled() || intensity <= 0 || this.quick) return;
    this.scene.cameras.main.shake(scaleTime(ms), intensity);
  }

  // ---- the slam ----

  // The cascade is over: the number charges up, flies into the enemy as one hit (the block to the
  // party's chip), the enemy takes it, and the fanfare plays. `killed`: the battle was won by it.
  // `quick`: a skipped cascade, a short version at the final numbers.
  async finish(killed: boolean, quick: boolean): Promise<void> {
    if (!this.on) return;
    this.on = false;
    const token = this.token;
    if (quick) this.skip();
    await this.landed();
    if (token !== this.token) return;
    const s = this.sum;
    if (s.damage === 0 && s.block === 0) {
      this.fadeAway();
      return;
    }
    const q = quick ? D.skip.factor : 1;
    if (quick) {
      this.slamming = true;
      // The numbers jump to their final values, with the final tier's look.
      this.shown = { damage: s.damage, block: s.block };
      if (s.damage > 0) {
        this.ensure("damage");
        this.setNumber("damage", true);
      }
      if (s.block > 0) {
        this.ensure("block");
        this.setNumber("block", false);
      }
    }
    const tier = this.top;
    const S = D.slam;
    if (s.damage === 0) {
      // Only block: no slam, the block number swells and flies to the party.
      await this.charge(S.block.chargeMs * q, 1);
      await this.fly2(null, S.block.flightMs * q);
      this.host.partyBlock();
      this.fadeAway();
      this.slamming = false;
      return;
    }
    if (killed && !this.fire) this.ignite();
    // Charge: swells and trembles; the cue stops when the slam starts.
    playSound("combo:charge", 1, 1);
    await this.charge(S.chargeMs[tier] * q, tier);
    stopCharge();
    if (token !== this.token) return;
    // Flight: the damage into the enemy, the block (if any) to the party's chip.
    this.stopFire();
    const aim = (): Pt => this.toScreen(this.host.aim());
    const blockFlight = s.block > 0 ? this.fly2("block", S.flightMs * q).then(() => this.host.partyBlock()) : Promise.resolve();
    await this.fly2("damage", S.flightMs * q, aim);
    if (token !== this.token) return;
    // Impact: a white flash, a burst, the boom and shake, a short freeze, then the enemy takes it.
    const hit = aim();
    const lethalSound = killed ? "combo:slamLethal" : "combo:slam";
    playSound(lethalSound, 1, S.gain[tier]);
    this.flash(0xffffff, S.flashAlpha[tier], S.flashMs);
    this.ring(hit, colourOf(tier), S.ringSize[tier], S.fxMs);
    this.puff("burst", hit, S.burstSize[tier], killed ? hexColour(D.lethal.colour) : colourOf(tier), S.fxMs);
    this.shakeBy(S.shakeIntensity[tier] * (killed ? 1.3 : 1), S.shakeMs[tier]);
    this.popup(hit, s.health, s.blocked, tier);
    await this.freeze(S.hitStopMs[tier] * q);
    this.owing.enemyHealth = 0;
    this.owing.enemyBlock = 0;
    this.host.impact({ amount: s.health, blocked: s.blocked, killed });
    void blockFlight;
    // Fanfare.
    await this.fanfare(tier, killed, hit, q);
    this.fadeAway();
    this.slamming = false;
  }

  // The number swells and trembles for ms.
  private async charge(ms: number, tier: number): Promise<void> {
    const S = D.slam;
    this.swell = 1;
    const o = { v: 1 };
    this.tweenTargets.push(o);
    this.scene.tweens.add({ targets: o, v: S.swell, duration: scaleTime(ms), ease: "Quad.easeIn", onUpdate: () => (this.swell = o.v) });
    this.tremble = shakeEnabled() && !this.quick ? S.tremble * (0.5 + tier * 0.25) : 0;
    await this.wait(ms);
    this.tremble = 0;
  }

  // The damage (or block) number flies away from where it is: to `to` (the enemy), or to the party's
  // block chip when `kind` is block or null. Resolves when it arrives.
  private fly2(kind: Kind | null, ms: number, to?: () => Pt): Promise<void> {
    const box = kind === "damage" ? this.dmgBox : this.blockBox;
    const g = this.group;
    if (!box || !g?.active) return Promise.resolve();
    const chip = this.host.refs().shields.get("party");
    const dest = to ?? ((): Pt => {
      const p = chip ? this.toScreen({ x: chip.x + 40, y: chip.y }) : this.centre();
      return p;
    });
    const from = this.numberAt(kind === "damage" ? "damage" : "block");
    const S = D.slam;
    // The rest of the look (halo, hit count, flames) fades as the number leaves.
    this.haloParts.forEach((h) => this.scene.tweens.add({ targets: h, alpha: 0, duration: scaleTime(ms * 0.8) }));
    if (kind === "damage") if (this.hitsText) this.scene.tweens.add({ targets: this.hitsText, alpha: 0, duration: scaleTime(ms * 0.5) });
    const gs = g.scaleX;
    return new Promise((resolve) => {
      this.tweenTargets.push(box);
      this.scene.tweens.addCounter({
        from: 0, to: 1, duration: scaleTime(ms), ease: "Cubic.easeIn",
        onUpdate: (t) => {
          const k = t.getValue() ?? 1;
          const b = dest();
          const x = from.x + (b.x - from.x) * k;
          const y = from.y + (b.y - from.y) * k;
          box.setPosition((x - g.x) / gs, (y - g.y) / gs).setScale(1 + (S.flightEndScale - 1) * k);
        },
        onComplete: () => {
          box.setVisible(false);
          resolve();
        },
      });
    });
  }

  // The big damage popup on the enemy: what its health lost, with what its block took beside it.
  private popup(at: Pt, health: number, blocked: number, tier: number): void {
    const P = D.slam.popup;
    const lines: { text: string; size: number; colour: string }[] = [];
    if (health > 0) lines.push({ text: `-${health}`, size: P.size, colour: D.tiers.colours[Math.max(1, tier)] });
    if (blocked > 0) lines.push({ text: `${blocked} blocked`, size: P.blockedSize, colour: P.blockedColour });
    lines.forEach((l, i) => {
      const t = this.scene.add.text(at.x, at.y + i * (P.size * 0.7), l.text, this.style(l.size, l.colour, 8)).setOrigin(0.5);
      this.root.add(t);
      this.track(t);
      t.setScale(0.5);
      this.scene.tweens.add({ targets: t, scale: 1, duration: scaleTime(160), ease: "Back.easeOut" });
      this.scene.tweens.add({ targets: t, y: t.y - P.dy, alpha: 0, delay: scaleTime(P.ms * 0.4), duration: scaleTime(P.ms * 0.6), onComplete: () => t.destroy() });
    });
  }

  // ---- the fanfare ----

  // A shower of gold sparkles over the board, with coin sounds for some. On a kill the enemy shatters.
  private async fanfare(tier: number, killed: boolean, at: Pt, q: number): Promise<void> {
    const F = D.fanfare;
    playSound(killed ? "combo:fanfareLethal" : `combo:fanfare${tier}`);
    const A = combatLayoutData.board;
    const n = Math.round(F.sparkles[tier] * (killed ? F.killMultiplier : 1) * (q < 1 ? 0.5 : 1));
    for (let i = 0; i < n; i++) {
      const delay = Math.random() * F.spreadMs;
      const x = A.x + Math.random() * A.w;
      const y0 = A.y - 30 + Math.random() * 80;
      const colour = hexColour(F.colours[i % F.colours.length]);
      const size = F.size * between(0.5, 1.2);
      this.scene.time.delayedCall(scaleTime(delay), () => {
        const o = fxObject(this.scene, "sparkle", x, y0, size, colour, this.root) as Obj;
        this.track(o);
        if (!reducedFlashing()) o.setBlendMode(Phaser.BlendModes.ADD);
        o.setRotation(between(-0.5, 0.5));
        if (i % F.coinEvery === 0) playSound("combo:coin", 1 + Phaser.Math.Between(0, 7));
        this.scene.tweens.add({ targets: o, y: y0 + A.h * between(0.45, 0.95), rotation: o.rotation + between(-2, 2), duration: scaleTime(F.fallMs * between(0.7, 1)), ease: "Quad.easeIn" });
        this.scene.tweens.add({ targets: o, alpha: { from: 1, to: 0 }, scale: { from: o.scaleX, to: o.scaleX * 0.4 }, delay: scaleTime(F.fallMs * 0.5), duration: scaleTime(F.fallMs * 0.5), onComplete: () => o.destroy() });
      });
    }
    if (killed) this.shatter(at);
    await this.wait(F.holdMs[tier] * q);
  }

  // The enemy bursts into pieces (then #190's death plays).
  private shatter(at: Pt): void {
    const S = D.fanfare.shatter;
    const colour = hexColour(D.lethal.colour);
    for (let i = 0; i < S.shards; i++) {
      const o = fxObject(this.scene, "shard", at.x, at.y, S.size * between(0.5, 1), i % 2 === 0 ? 0xffffff : colour, this.root) as Obj;
      this.track(o);
      o.setRotation(between(0, 6.28));
      const a = between(0, Math.PI * 2);
      const d = S.spread * between(0.5, 1);
      this.scene.tweens.add({
        targets: o, x: at.x + Math.cos(a) * d, y: at.y + Math.sin(a) * d + S.spread * 0.3, rotation: o.rotation + between(-5, 5), alpha: 0,
        duration: scaleTime(S.ms * between(0.6, 1)), ease: "Cubic.easeOut", onComplete: () => o.destroy(),
      });
    }
  }

  // The number and the tint are done: they fade out.
  private fadeAway(): void {
    const g = this.group;
    this.stopFire();
    if (g?.active) {
      this.tweenTargets.push(g);
      this.scene.tweens.add({ targets: g, alpha: 0, duration: scaleTime(300) });
    }
    this.scene.tweens.killTweensOf(this.tint);
    this.scene.tweens.add({ targets: this.tint, alpha: 0, duration: scaleTime(D.tierJump.tintMs) });
  }
}
