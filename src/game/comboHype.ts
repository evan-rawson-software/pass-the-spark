import Phaser from "phaser";
import presentation from "../../data/presentation.json";
import type { GameEvent } from "../engine/events";
import type { Spark } from "../engine/types";
import type { Refs } from "./animations";
import { reducedFlashing, shakeEnabled } from "./comfort";
import { fxFallback, fxObject } from "./fx";
import { scaleTime } from "./playbackSpeed";
import { combatLayoutData, hexColour } from "./presentation";
import { playSound, stopSound } from "./sound";
import type { Spells } from "./spells";

// Cascade hype (#234, H1-H9; #276): one big combo number in the middle of the board area, fixed on screen
// whatever the camera does. Every hit's spark (a cap's, or a smaller one from an amplifier or junction)
// flies into it and it rolls up and punches; it grows through tiers (by its share of the enemy's line,
// B12), a meter under it fills towards the line, and on reaching the line it catches fire and the enemy is
// staggered. A lethal total gets its own bigger moment on top. After the last hit it charges up and slams
// into the enemy as one hit, the stagger reels the enemy, then a fanfare. Visual and sound only, driven by the capFired, damage and block events and the numbers in
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
  smallHit: { sparkFactor: number; arrivalFactor: number; punchFactor: number };
  line: {
    scale: number; widthFraction: number; h: number; dy: number; r: number; trackColour: string; trackAlpha: number; edgeColour: string; edgeWidth: number;
    markerColour: string; markerW: number; markerOver: number; crossedColour: string; labelText: string; labelSize: number; labelDy: number; labelColour: string;
    fillMs: number; buildAlpha: number; fadeMs: number; holdMs: number; ringSize: number; burstSize: number; fxMs: number;
  };
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
  skip: { factor: number; sparkleFactor: number };
  look: {
    hitsBump: number; arrivalShake: { tier0: number; tierFactor: number; ms: number }; blockPlaceholderDx: number;
    popup: { startScale: number; popMs: number; lineGap: number }; fadeOutMs: number; ring: { startScale: number; reducedAlpha: number };
    puff: { startScale: number; endScale: number }; capBurstGrow: number; trailEndScale: number; haloAlpha2: number;
    tremble: { base: number; perTier: number }; numberFadeFraction: { halo: number; hits: number }; chipDx: number;
    fanfareSpawn: { top: number; spread: number; sizeMin: number; sizeMax: number; fallMin: number; fallMax: number };
    flame: { topFraction: number; shrink: number }; block: { shieldWidth: number; textX: number; dyFactor: number };
  };
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
  impact(t: { amount: number; blocked: number; killed: boolean; startHealth: number }): void; // the enemy takes the slam (reactions, bars)
  partyBlock(): void; // the block lands on the party's block chip
  skipping(): boolean; // the scene is fast-forwarding (a skipped cascade)
  spells: Spells; // damage spells, wards and the final spell (#265)
  flinch(): void; // a spell landed: the enemy flinches a little
  stagger(): void; // the slam is in: the enemy reels, and its intent card shows the halved attack
  circle: { tier(tier: number): void; beam(): void; rest(now: boolean): void }; // the arcane circle follows the combo's tier (#264)
}

// A cap's spark on its way: the amounts of its damage or block events join it as they arrive.
// small: an amplifier's or junction's hit. crosses: the hit that took the combo total to the line (its landing is the crossing).
interface Hit { kind: Kind; amount: number; triggers: number; landed: boolean; counted: boolean; small?: boolean; crosses?: boolean; cancel?: () => void }

const colourOf = (tier: number): number => hexColour(D.tiers.colours[tier]);
const between = (a: number, b: number): number => Phaser.Math.FloatBetween(a, b);

export class ComboHype {
  on = false; // a cascade is being counted (set off until its slam starts)
  private begun = false; // the cascade's colours and tint stay up until the next round
  private start = { health: 0, block: 0, line: 1 };
  private sum = { damage: 0, health: 0, blocked: 0, block: 0 }; // every event so far
  private shown = { damage: 0, block: 0 }; // what the number shows (what the landed sparks added up to)
  private hits = { damage: 0, block: 0 };
  private beats = 0; // hits so far (every one counts towards the pacing)
  private crossed = false; // the number has reached the line (it is on fire)
  private lethal = false; // the number has reached lethal
  private justCrossed = false; // the last hit to land took it over the line
  private staggerPending = false; // the cascade reached the line and the slam has not yet staggered the enemy
  private line = 0; // the enemy's line, for the meter (0: none shown)
  private meter?: Container; // the line meter, screen-fixed under the number
  private meterGfx?: Phaser.GameObjects.Graphics;
  private meterLabel?: Text;
  private meterRoll = { v: 0 };
  private healthLeft = 0; // the enemy's health the damage so far has not yet taken
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

  // The party's block has landed on its chip.
  settleParty(): void {
    this.owing.partyBlock = 0;
  }

  // The colour lit dominoes and fuses glow in: the tier the cascade has reached.
  litColour(): number | undefined {
    return this.begun ? colourOf(this.top) : undefined;
  }

  // The cascade reached the line and the slam has not yet staggered the enemy: the intent card still shows the full attack.
  staggerHeld(): boolean {
    return this.staggerPending;
  }

  // The wait after an event during the cascade: the pause after each hit shrinks as it goes on.
  pace(ev: GameEvent, wait: number): number {
    if (!this.on) return wait;
    const g = D.gap;
    const gap = Math.max(g.minMs, g.startMs - g.stepMs * this.beats);
    if (ev.type === "cascadeStep") return gap * g.stepFraction;
    if ((ev.type === "damage" && ev.side === "enemy") || (ev.type === "block" && ev.side === "party")) {
      const hit = this.open[ev.type === "damage" ? "damage" : "block"];
      return gap / Math.max(1, hit?.triggers ?? 1);
    }
    return wait;
  }

  // ---- the cascade ----

  // The cascade is set off: remember what the enemy had, and start counting from nothing.
  begin(enemy: { health: number; block: number; line: number }): void {
    this.clear();
    this.on = true;
    this.showLine(enemy.line);
    this.begun = true;
    this.start = { health: Math.max(1, enemy.health), block: enemy.block, line: Math.max(1, enemy.line) };
    this.healthLeft = enemy.health;
  }

  // A cap fired (worldAt: where it is on the table): it bursts, and its spark flies into the number.
  // Returns a function for a short freeze on the hit, to run after anything else the cap does (none when
  // `noFreeze`: the cap already holds the table in slow motion).
  // A damage cap casts its `spark`'s spell at the enemy; its number joins the combo as the spell lands.
  cap(ev: Extract<GameEvent, { type: "capFired" }>, worldAt: Pt, noFreeze: boolean, spark?: Spark): (() => Promise<void>) | undefined {
    if (!this.on) return undefined;
    this.beats++;
    const kind: Kind = ev.effect;
    const hit: Hit = { kind, amount: 0, triggers: ev.triggers, landed: false, counted: false };
    this.open[kind] = hit;
    if (this.quick) {
      hit.landed = true;
      return undefined;
    }
    this.capBurst(worldAt);
    if (kind === "damage" && spark) this.cast(hit, spark, worldAt);
    else this.fly(hit, this.toScreen(worldAt));
    const ms = D.microFreezeMs[this.tier] ?? 0;
    if (kind === "damage" && !noFreeze && ms > 0 && shakeEnabled()) return () => this.freeze(ms);
    return undefined;
  }

  // An amplifier or junction lit and hits for ev.hit: a smaller spark flies from it into the number.
  smallHit(ev: Extract<GameEvent, { type: "nodeLit" }>, worldAt: Pt): void {
    if (!this.on || ev.hit <= 0) return;
    this.beats++;
    const hit: Hit = { kind: "damage", amount: 0, triggers: 1, landed: false, counted: false, small: true };
    this.open.damage = hit;
    if (this.quick) {
      hit.landed = true;
      return;
    }
    this.fly(hit, this.toScreen(worldAt));
  }

  // An event of the cascade: its numbers are counted (and the table holds the change back) before the
  // table redraws with it. Only the enemy's damage and the party's block count.
  event(ev: GameEvent): void {
    if (!this.on) return;
    if (ev.type === "damage" && ev.side === "enemy") {
      if (ev.amount + ev.blocked === 0) return; // a hit of 0 (an amplifier passing on nothing) is no hit
      this.sum.damage += ev.amount + ev.blocked;
      this.sum.health += ev.amount;
      this.sum.blocked += ev.blocked;
      const real = Math.min(ev.amount, this.healthLeft); // overkill never shows as health the enemy did not have
      this.healthLeft -= real;
      this.owing.enemyHealth += real;
      this.owing.enemyBlock += ev.blocked;
      this.count("damage", ev.amount + ev.blocked);
    } else if (ev.type === "block" && ev.side === "party") {
      this.sum.block += ev.amount;
      this.owing.partyBlock += ev.amount;
      this.count("block", ev.amount);
    } else if (ev.type === "lineReached") {
      // It follows the damage event of the hit that crossed: the number reaches the line when that hit's spark lands.
      this.staggerPending = true;
      const hit = this.open.damage;
      if (hit && !hit.landed) hit.crosses = true;
      else this.reachLine();
    }
  }

  // The amount joins the cap's spark, or counts at once when there is no spark (it already landed, or
  // there never was one: the Junction Runner's block).
  private count(kind: Kind, amount: number): void {
    const hit = this.open[kind];
    if (hit && !hit.landed) hit.amount += amount;
    else {
      // One hit per cap, however many times it triggers (a skipped cascade counts the same way).
      this.add(kind, amount, hit?.counted ? 0 : 1, hit?.small);
      if (hit) hit.counted = true;
    }
  }

  // Everything in the air has landed.
  async landed(): Promise<void> {
    while (this.flights.size > 0) await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  // The player skipped: sparks in the air land now, and from here the numbers jump (no flights, no
  // build-up effects); the slam then plays short.
  skip(): void {
    this.host.circle.rest(true); // a skipped cascade leaves the circle at rest
    this.quick = true;
    for (const hit of [...this.flights]) hit.cancel?.();
    this.host.spells.clear();
  }

  // Everything away at once (a new round, the scene going).
  clear(): void {
    this.host.circle.rest(true);
    this.host.spells.clear();
    this.token++;
    this.on = false;
    this.begun = false;
    this.quick = false;
    this.sum = { damage: 0, health: 0, blocked: 0, block: 0 };
    this.shown = { damage: 0, block: 0 };
    this.hits = { damage: 0, block: 0 };
    this.roll.damage.v = 0;
    this.roll.block.v = 0;
    this.beats = 0;
    this.tier = 0;
    this.top = 0;
    this.fire = false;
    this.crossed = false;
    this.lethal = false;
    this.justCrossed = false;
    this.staggerPending = false;
    this.resetMeter();
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
      bw = s * D.look.block.shieldWidth + this.blockText.width;
      this.blockText.setX(s * D.look.block.textX);
      this.drawShield(this.blockBox.first as Phaser.GameObjects.Graphics, s);
    }
    const gap = dw > 0 && bw > 0 ? D.number.block.gap : 0;
    const total = dw + gap + bw;
    const A = combatLayoutData.board;
    this.fit = Math.min(1, (A.w * D.layout.maxWidthFraction) / Math.max(1, total));
    if (this.dmgBox) this.dmgBox.setX(-total / 2 + dw / 2);
    if (this.blockBox) this.blockBox.setX(total / 2 - bw + 0).setY(dw > 0 ? size * D.look.block.dyFactor : 0);
    if (this.hitsText?.active && this.dmgBox) this.hitsText.setPosition(this.dmgBox.x, size * D.number.hits.dyFactor + D.number.hits.dy);
    const hh = size * D.number.halo.heightFactor;
    this.haloParts.forEach((h, i) => h.setScale((total + D.number.halo.padX) / 100, hh / 100).setAlpha(i === 0 ? 1 : D.look.haloAlpha2));
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
  // the hit count bumps, and a new tier, the meter and the lethal fire follow. `small`: an amplifier's or
  // junction's hit (a quieter ping and a smaller punch). `crosses`: this hit takes the total to the line.
  private add(kind: Kind, amount: number, events: number, small = false, crosses = false): void {
    if (amount <= 0 && events <= 0) return;
    this.justCrossed = false;
    this.shown[kind] += amount;
    this.hits[kind] += events;
    this.ensure(kind);
    if (kind === "damage") {
      const before = this.tier;
      let to = 0;
      D.tiers.thresholds.forEach((t, i) => {
        if (this.shown.damage >= t * this.start.line) to = i + 1;
      });
      if (to > this.tier) {
        this.tier = to;
        this.top = Math.max(this.top, to);
      }
      this.setNumber("damage", before !== this.tier);
      if (!this.quick) {
        if (this.tier > before) this.host.circle.tier(this.tier);
        playSound(small ? "combo:hitSmall" : "combo:hit", this.hits.damage);
        if (this.tier > before && !crosses) this.tierJump(this.tier, false); // a hit that reaches the line goes straight to STAGGERED!
      }
      this.meterTo();
      if (!this.lethal && this.shown.damage >= this.start.health + this.start.block) this.lethalMoment();
    } else {
      this.setNumber("block", false);
      if (!this.quick) playSound("combo:block", this.hits.block);
    }
    if (!this.quick) this.arrival(kind, small);
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
  private arrival(kind: Kind, small: boolean): void {
    const box = kind === "damage" ? this.dmgBox : this.blockBox;
    if (!box) return;
    const P = D.number.punch;
    const S = D.smallHit;
    const full = reducedFlashing() ? P.reducedScale : P.scale;
    const k = small ? 1 + (full - 1) * S.punchFactor : full;
    this.scene.tweens.killTweensOf(box);
    box.setScale(k);
    this.tweenTargets.push(box);
    this.scene.tweens.add({ targets: box, scale: 1, duration: scaleTime(P.ms), ease: "Back.easeOut" });
    if (kind === "damage" && this.hitsText?.active) {
      this.scene.tweens.killTweensOf(this.hitsText);
      this.hitsText.setScale(small ? 1 + (D.look.hitsBump - 1) * S.punchFactor : D.look.hitsBump);
      this.tweenTargets.push(this.hitsText);
      this.scene.tweens.add({ targets: this.hitsText, scale: 1, duration: scaleTime(P.ms), ease: "Back.easeOut" });
    }
    const at = this.numberAt(kind);
    const A = D.flight.arrival;
    const colour = kind === "damage" ? colourOf(this.tier) : hexColour(D.number.block.colour);
    const sz = small ? S.arrivalFactor : 1;
    this.ring(at, colour, A.ringSize * sz, A.ringMs);
    if (!reducedFlashing()) this.puff("spark", at, A.sparkSize * sz, colour, A.ringMs);
    if (!small) this.shakeBy(this.tier === 0 ? D.look.arrivalShake.tier0 : D.tierJump.shakeIntensity[this.tier] * D.look.arrivalShake.tierFactor, D.look.arrivalShake.ms);
  }

  // ---- tiers ----

  // `quiet`: lethal came with it, and lethal has the moment to itself.
  private tierJump(tier: number, quiet: boolean): void {
    if (quiet) return;
    const J = D.tierJump;
    const colour = colourOf(tier);
    const at = this.centre();
    playSound(tier === 4 ? "combo:line" : `combo:tier${tier}`);
    this.callout(D.tiers.words[tier], D.tiers.colours[tier], J.calloutSize, J.calloutDy + D.number.sizes[tier] * 0.5);
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

  // ---- the line and lethal ----

  // The combo total reached the line: the number catches fire and its tier is the last (STAGGERED!), with a
  // burst on the meter's marker. Nothing is played for a skipped cascade; the slam shows the result.
  private reachLine(): void {
    if (this.crossed) return;
    this.crossed = true;
    const before = this.tier;
    this.tier = 4;
    this.top = 4;
    this.ensure("damage");
    this.setNumber("damage", before !== 4);
    this.ignite();
    this.meterTo();
    if (this.quick) return;
    this.host.circle.tier(4);
    this.justCrossed = true;
    this.tierJump(4, this.lethal);
    if (!this.lethal) this.markerBurst();
  }

  // The damage so far would take the enemy to 0: its own bigger moment on top of the fire.
  private lethalMoment(): void {
    if (this.lethal) return;
    this.lethal = true;
    const F = D.lethal;
    const at = this.centre();
    this.ignite();
    if (this.quick) return;
    this.host.circle.beam();
    playSound("combo:lethal");
    this.callout(F.word, F.colour, F.size, -(F.dy + D.number.sizes[this.tier] * D.number.hits.dyFactor + D.number.hits.size)); // below the hit count, so the words never reach the seat tabs
    this.ring(at, hexColour(F.colour), F.ringSize, D.tierJump.fxMs);
    this.puff("burst", at, F.burstSize, hexColour(F.colour), D.tierJump.fxMs);
    this.flash(hexColour(F.colour), F.flashAlpha, D.tierJump.flashMs);
    this.shakeBy(F.shakeIntensity, F.shakeMs);
  }

  // The number catches fire: a flame gradient on its letters and flames rising from it, until the slam.
  private ignite(): void {
    if (this.fire) return;
    this.fire = true;
    const F = D.lethal;
    this.dress();
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
    const y = -t.height * D.look.flame.topFraction;
    const o = fxObject(this.scene, "flame", x, y, size, hexColour(F.colour), g) as Obj;
    o.setScale(o.scaleX * (Math.random() < 0.5 ? -1 : 1), o.scaleY);
    if (!reducedFlashing()) o.setBlendMode(Phaser.BlendModes.ADD);
    g.moveTo(o, 1); // behind the number, over the halo
    o.setAlpha(reducedFlashing() ? F.reducedAlpha : F.alpha);
    this.flames.add(o);
    this.scene.tweens.add({
      targets: o, y: y - F.rise * between(0.7, 1), alpha: 0, scaleY: o.scaleY * D.look.flame.shrink, scaleX: o.scaleX * D.look.flame.shrink,
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
    const sz = hit.small ? D.smallHit.sparkFactor : 1;
    const glow = fxFallback(scene, "glow", 0, 0, F.size * 2.4 * sz, colour, c);
    if (!reducedFlashing()) glow.setBlendMode(Phaser.BlendModes.ADD);
    fxObject(scene, "spark", 0, 0, F.size * sz, colour, c);
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
      hit.counted = true;
      this.add(hit.kind, hit.amount, 1, hit.small, hit.crosses);
      if (hit.crosses) this.reachLine();
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
          this.trail({ x, y }, colour, sz);
        }
      },
      onComplete: finish,
    });
  }

  // A damage spell flies from its cap to the enemy card; landing is what counts its number into the
  // combo (as a spark's landing did), with the enemy's small flinch.
  private cast(hit: Hit, spark: Spark, from: Pt): void {
    const token = this.token;
    this.flights.add(hit);
    let stop = (): void => {};
    const finish = (): void => {
      stop();
      this.flights.delete(hit);
      if (token !== this.token) return;
      hit.landed = true;
      hit.counted = true;
      this.add(hit.kind, hit.amount, 1, false, hit.crosses);
      if (!this.quick) this.host.flinch();
      if (hit.crosses) this.reachLine();
      this.wake();
    };
    hit.cancel = finish;
    stop = this.host.spells.fly(spark, from, () => this.host.aim(), this.beats, finish);
  }

  // Where the block number will appear when there is none yet: beside the damage number.
  private blockPlace(): Pt {
    const c = this.centre();
    return { x: c.x + (this.dmgBox ? D.look.blockPlaceholderDx : 0), y: c.y };
  }

  private trail(at: Pt, colour: number, sz: number): void {
    const o = fxFallback(this.scene, "glow", at.x, at.y, D.flight.trailSize * sz, colour, this.root);
    this.track(o);
    if (!reducedFlashing()) o.setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: o, alpha: 0, scale: D.look.trailEndScale, duration: scaleTime(D.flight.trailMs), onComplete: () => o.destroy() });
  }

  // ---- small effects ----

  // A burst of sparks where a cap fires (on the table, so it moves with the camera).
  private capBurst(at: Pt): void {
    const B = D.capBurst;
    const colour = colourOf(this.tier);
    const o = fxObject(this.scene, "spark", at.x, at.y, B.size, colour) as Obj;
    o.setDepth(98);
    if (!reducedFlashing()) o.setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: o, scale: o.scaleX * D.look.capBurstGrow, alpha: 0, duration: scaleTime(B.ms), ease: "Cubic.easeOut", onComplete: () => o.destroy() });
  }

  private ring(at: Pt, colour: number, size: number, ms: number): void {
    const r = fxFallback(this.scene, "ring", at.x, at.y, size, colour, this.root);
    this.track(r);
    r.setScale(D.look.ring.startScale).setAlpha(reducedFlashing() ? D.look.ring.reducedAlpha : 1);
    this.scene.tweens.add({ targets: r, scale: 1, alpha: 0, duration: scaleTime(ms), ease: "Cubic.easeOut", onComplete: () => r.destroy() });
  }

  // An art (or code-drawn) burst or spark that swells and fades.
  private puff(id: "spark" | "burst", at: Pt, size: number, colour: number, ms: number): void {
    const o = fxObject(this.scene, id, at.x, at.y, size, colour, this.root) as Obj;
    this.track(o);
    if (!reducedFlashing()) o.setBlendMode(Phaser.BlendModes.ADD);
    o.setScale(o.scaleX * D.look.puff.startScale, o.scaleY * D.look.puff.startScale);
    this.scene.tweens.add({ targets: o, scaleX: o.scaleX * D.look.puff.endScale, scaleY: o.scaleY * D.look.puff.endScale, alpha: 0, duration: scaleTime(ms), ease: "Cubic.easeOut", onComplete: () => o.destroy() });
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
    await this.slam(killed, quick);
    this.host.circle.rest(false); // the circle settles back to tier 0
    this.host.spells.endWards(false);
  }

  private async slam(killed: boolean, quick: boolean): Promise<void> {
    this.on = false;
    const token = this.token;
    if (quick) this.skip();
    await this.landed();
    if (token !== this.token) return;
    // The line reached on the last hit still plays out (the fire and the callout) before the slam.
    if (this.justCrossed && !quick) await this.wait(D.line.holdMs);
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
      this.meterTo();
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
    if (killed && !this.lethal) this.lethalMoment();
    // Charge: swells and trembles; the cue stops when the slam starts.
    playSound("combo:charge", 1, 1);
    await this.charge(S.chargeMs[tier] * q, tier);
    stopSound("combo:charge");
    if (token !== this.token) return;
    // Flight: the damage into the enemy, the block (if any) to the party's chip.
    this.stopFire();
    const aim = (): Pt => this.toScreen(this.host.aim());
    const finalSpell = this.host.spells.finalFlight(tier, killed, () => this.host.aim(), S.flightMs * q);
    const blockFlight = s.block > 0 ? this.fly2("block", S.flightMs * q).then(() => this.host.partyBlock()) : Promise.resolve();
    await Promise.all([this.fly2("damage", S.flightMs * q, aim), finalSpell]);
    if (token !== this.token) return;
    // Impact: a white flash, a burst, the boom and shake, a short freeze, then the enemy takes it.
    const hit = aim();
    this.host.spells.finalImpact(tier, killed, this.host.aim());
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
    this.host.impact({ amount: s.health, blocked: s.blocked, killed, startHealth: this.start.health });
    void blockFlight;
    // The stagger: the enemy reels and its intent card shows the halved attack. A lethal cascade has none.
    if (this.staggerPending && !killed) {
      this.staggerPending = false;
      this.host.stagger();
    }
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
    this.tremble = shakeEnabled() && !this.quick ? S.tremble * (D.look.tremble.base + tier * D.look.tremble.perTier) : 0;
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
      const p = chip ? this.toScreen({ x: chip.x + D.look.chipDx, y: chip.y }) : this.centre();
      return p;
    });
    const from = this.numberAt(kind === "damage" ? "damage" : "block");
    const S = D.slam;
    // The rest of the look (halo, hit count, flames) fades as the number leaves.
    this.haloParts.forEach((h) => this.scene.tweens.add({ targets: h, alpha: 0, duration: scaleTime(ms * D.look.numberFadeFraction.halo) }));
    if (kind === "damage") if (this.hitsText) this.scene.tweens.add({ targets: this.hitsText, alpha: 0, duration: scaleTime(ms * D.look.numberFadeFraction.hits) });
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
      const t = this.scene.add.text(at.x, at.y + i * (P.size * D.look.popup.lineGap), l.text, this.style(l.size, l.colour, 8)).setOrigin(0.5);
      this.root.add(t);
      this.track(t);
      t.setScale(D.look.popup.startScale);
      this.scene.tweens.add({ targets: t, scale: 1, duration: scaleTime(D.look.popup.popMs), ease: "Back.easeOut" });
      this.scene.tweens.add({ targets: t, y: t.y - P.dy, alpha: 0, delay: scaleTime(P.ms * 0.4), duration: scaleTime(P.ms * 0.6), onComplete: () => t.destroy() });
    });
  }

  // ---- the fanfare ----

  // A shower of gold sparkles over the board, with coin sounds for some. On a kill the enemy shatters.
  private async fanfare(tier: number, killed: boolean, at: Pt, q: number): Promise<void> {
    const F = D.fanfare;
    const L = D.look.fanfareSpawn;
    playSound(killed ? "combo:fanfareLethal" : `combo:fanfare${tier}`);
    const A = combatLayoutData.board;
    const n = Math.round(F.sparkles[tier] * (killed ? F.killMultiplier : 1) * (q < 1 ? D.skip.sparkleFactor : 1));
    for (let i = 0; i < n; i++) {
      const delay = Math.random() * F.spreadMs;
      const x = A.x + Math.random() * A.w;
      const y0 = A.y + L.top + Math.random() * L.spread;
      const colour = hexColour(F.colours[i % F.colours.length]);
      const size = F.size * between(L.sizeMin, L.sizeMax);
      this.scene.time.delayedCall(scaleTime(delay), () => {
        const o = fxObject(this.scene, "sparkle", x, y0, size, colour, this.root) as Obj;
        this.track(o);
        if (!reducedFlashing()) o.setBlendMode(Phaser.BlendModes.ADD);
        o.setRotation(between(-0.5, 0.5));
        if (i % F.coinEvery === 0) playSound("combo:coin", 1 + Phaser.Math.Between(0, 7));
        this.scene.tweens.add({ targets: o, y: y0 + A.h * between(L.fallMin, L.fallMax), rotation: o.rotation + between(-2, 2), duration: scaleTime(F.fallMs * between(0.7, 1)), ease: "Quad.easeIn" });
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
      this.scene.tweens.add({ targets: g, alpha: 0, duration: scaleTime(D.look.fadeOutMs) });
    }
    if (this.meter?.active) {
      this.tweenTargets.push(this.meter);
      this.scene.tweens.add({ targets: this.meter, alpha: 0, duration: scaleTime(D.line.fadeMs) });
    }
    this.scene.tweens.killTweensOf(this.tint);
    this.scene.tweens.add({ targets: this.tint, alpha: 0, duration: scaleTime(D.tierJump.tintMs) });
  }

  // ---- the line meter ----

  // The screen calls this on every redraw: until the cascade is set off the meter shows empty with the
  // enemy's line, so the target is always visible (the damage total stays hidden, B8).
  showLine(line: number): void {
    this.line = Number.isFinite(line) ? line : 0;
    if (this.begun) return;
    if (this.line > 0 && !this.meter?.active) this.makeMeter();
    this.resetMeter();
  }

  private makeMeter(): void {
    const c = this.centre();
    this.meter = this.scene.add.container(c.x, c.y + D.line.dy);
    this.root.add(this.meter);
    this.meterGfx = this.scene.add.graphics();
    this.meterLabel = this.scene.add.text(0, 0, "", this.style(D.line.labelSize, D.line.labelColour, 6)).setOrigin(0.5, 0);
    this.meter.add([this.meterGfx, this.meterLabel]);
  }

  // Empty again, with the line (a new round, or a new cascade starting).
  private resetMeter(): void {
    this.scene.tweens.killTweensOf(this.meterRoll);
    this.meterRoll.v = 0;
    if (!this.meter?.active) return;
    this.scene.tweens.killTweensOf(this.meter);
    this.meter.setAlpha(this.begun ? 1 : D.line.buildAlpha);
    this.drawMeter();
  }

  // The meter follows the number's total.
  private meterTo(): void {
    if (!this.meter?.active) return;
    const to = this.shown.damage;
    this.scene.tweens.killTweensOf(this.meterRoll);
    if (this.quick) {
      this.meterRoll.v = to;
      this.drawMeter();
      return;
    }
    this.tweenTargets.push(this.meterRoll);
    this.scene.tweens.add({ targets: this.meterRoll, v: to, duration: scaleTime(D.line.fillMs), ease: "Cubic.easeOut", onUpdate: () => this.drawMeter(), onComplete: () => this.drawMeter() });
  }

  // Where the line's marker is on screen.
  private markerAt(): Pt {
    const L = D.line;
    const w = combatLayoutData.board.w * L.widthFraction;
    return { x: this.centre().x - w / 2 + w / L.scale, y: this.centre().y + L.dy };
  }

  // The track, the fill (which stops at the end: the scale runs to `scale` times the line), the marker and its label.
  private drawMeter(): void {
    const L = D.line;
    const g = this.meterGfx;
    const label = this.meterLabel;
    if (!this.meter?.active || !g?.active || !label?.active) return;
    this.meter.setVisible(this.line > 0);
    if (this.line <= 0) return;
    const w = combatLayoutData.board.w * L.widthFraction;
    const h = L.h;
    const frac = Math.min(1, this.meterRoll.v / (this.line * L.scale));
    g.clear();
    g.fillStyle(hexColour(L.trackColour), L.trackAlpha);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, L.r);
    if (frac > 0) {
      g.fillStyle(this.crossed ? hexColour(L.crossedColour) : colourOf(this.tier), 1);
      g.fillRoundedRect(-w / 2, -h / 2, Math.max(h, w * frac), h, L.r);
    }
    g.lineStyle(L.edgeWidth, hexColour(L.edgeColour), 0.9);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, L.r);
    const mx = -w / 2 + w / L.scale;
    g.fillStyle(hexColour(this.crossed ? L.crossedColour : L.markerColour), 1);
    g.fillRect(mx - L.markerW / 2, -h / 2 - L.markerOver, L.markerW, h + 2 * L.markerOver);
    label.setText(`${L.labelText} ${this.line}`).setPosition(mx, h / 2 + L.markerOver + 4).setColor(this.crossed ? L.markerColour : L.labelColour);
  }

  // A burst on the marker when the line is reached.
  private markerBurst(): void {
    const L = D.line;
    const at = this.markerAt();
    const colour = hexColour(L.markerColour);
    this.ring(at, colour, L.ringSize, L.fxMs);
    this.puff("burst", at, L.burstSize, colour, L.fxMs);
  }
}
