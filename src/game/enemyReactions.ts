import Phaser from "phaser";
import type { Refs } from "./animations";
import { artImage } from "./art";
import { reducedFlashing, shakeEnabled } from "./comfort";
import { fxObject } from "./fx";
import { drawNodeIcon, NODE_STYLE } from "./nodeIcon";
import { scaleTime } from "./playbackSpeed";
import { hexColour, reactionData as R, spellData } from "./presentation";
import { playSound } from "./sound";

// The enemy's reactions (#190), all driven by the damage, block, passive and enemyAction events
// the Animator already plays: flinch and stagger, the ghost health bars, the cracking and
// shattering shield icon, the freeze-frame and death, the lunge at the party and its impact, the
// raised block shield, the intent pulse and the boss heals. Visual and sound only; every timing is
// in data/presentation.json (enemyReactions). The scene redraws the whole table on every event,
// so what has to outlive a redraw (the enemy's pose, the ghost values, the dead enemy) is plain
// state here, and each redraw hands the new objects back to it. Everything is scaled by playback
// speed and runs on the scene's own timers, so skipping a cascade fast-forwards it.

type Side = "party" | "enemy";
type Obj = Phaser.GameObjects.Image;

export interface ReactionHost {
  refs(): Refs;
  repaint(side: Side): void; // redraws a health bar with its current ghost
  speed(): number; // the tween time scale to go back to after a freeze
}

interface Ghost { value: number; on: boolean; call?: Phaser.Time.TimerEvent; tween?: Phaser.Tweens.Tween }

const DEPTH = 91;
const WHITE = 0xffffff;

export class EnemyReactions {
  // The enemy's pose; tweened, and applied to whichever container the last redraw made.
  private pose = { x: 0, y: 0, rot: 0, scale: 1, alpha: 1 };
  private body?: Phaser.GameObjects.Container;
  private spot = { x: 0, y: 0, size: 250 };
  private motion?: Phaser.Tweens.Tween;
  private boss = false;
  private dead = false;
  private shieldMax = 0;
  private shownBlock = 0; // the block the icon last showed
  private ghosts: Record<Side, Ghost> = { party: { value: 0, on: false }, enemy: { value: 0, on: false } };

  constructor(private scene: Phaser.Scene, private host: ReactionHost) {}

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.scene.time.delayedCall(scaleTime(ms), resolve));
  }

  // ---- the enemy's body ----

  // Draws the portrait (or a code-drawn stand-in) centred on `spot` in the table's layer, in the pose it
  // is in now. Every effect on the enemy aims at the spot of the latest draw (the card in the column).
  drawBody(layer: Phaser.GameObjects.Container, id: string, tier: string, spot: { x: number; y: number; size: number }): void {
    this.boss = tier === "boss";
    this.body = undefined;
    this.spot = spot;
    if (this.dead) return;
    const B = spot;
    const c = this.scene.add.container(B.x, B.y);
    layer.add(c);
    if (!artImage(this.scene, `enemies/${id}`, 0, 0, B.size, B.size, c)) {
      const stop = tier === "basic" ? "fight" : (tier as "elite" | "boss");
      const g = this.scene.add.graphics();
      c.add(g);
      g.fillStyle(NODE_STYLE[stop].color, 0.35);
      g.fillCircle(0, 0, B.size * 0.42);
      g.lineStyle(4, NODE_STYLE[stop].color, 0.8);
      g.strokeCircle(0, 0, B.size * 0.42);
      drawNodeIcon(g, stop, 0, 0, B.size * 0.3);
    }
    this.body = c;
    this.apply();
  }

  private apply(): void {
    const c = this.body;
    if (!c?.active) return;
    const p = this.pose;
    c.setPosition(this.spot.x + p.x, this.spot.y + p.y).setRotation(p.rot).setScale(p.scale).setAlpha(p.alpha);
  }

  private centre(): { x: number; y: number } {
    return { x: this.spot.x + this.pose.x, y: this.spot.y + this.pose.y };
  }

  // Where the enemy is on the table now (its card's portrait), for the combo number's slam (#234).
  where(): { x: number; y: number } {
    return this.centre();
  }

  private rest(): void {
    Object.assign(this.pose, { x: 0, y: 0, rot: 0, scale: 1 });
    this.apply();
  }

  private move(to: Partial<typeof this.pose>, ms: number, extra: Partial<Phaser.Types.Tweens.TweenBuilderConfig> = {}): Phaser.Tweens.Tween {
    this.motion?.stop();
    this.motion = this.scene.tweens.add({ targets: this.pose, ...to, duration: scaleTime(ms), onUpdate: () => this.apply(), ...extra });
    return this.motion;
  }

  // A soft flash over the enemy.
  private glow(colour: number, alpha: number, size: number, ms: number, grow = 1.3): void {
    const c = this.centre();
    const soft = reducedFlashing();
    const o = fxObject(this.scene, "glow", c.x, c.y, size, colour) as Obj;
    o.setDepth(DEPTH).setAlpha(soft ? alpha * 0.4 : alpha);
    this.scene.tweens.add({ targets: o, alpha: 0, scale: grow, duration: scaleTime(soft ? ms * 1.6 : ms), onComplete: () => o.destroy() });
  }

  // ---- the enemy is hit ----

  // The enemy lost health: it flinches, or staggers on a big hit.
  hit(amount: number): void {
    const stagger = amount >= R.stagger.staggerMin;
    const k = stagger ? R.stagger : R.flinch;
    const wobble = stagger && shakeEnabled();
    playSound(stagger ? "enemyBigHit" : "enemyHit");
    this.move(
      { x: k.dx, y: k.dy, rot: wobble ? R.stagger.rotation : 0 },
      k.ms,
      { yoyo: true, repeat: wobble ? R.stagger.wobbles : 0, ease: "Quad.easeOut", onComplete: () => this.rest() },
    );
    this.glow(hexColour(stagger ? R.stagger.flashColour : R.flinch.flashColour), stagger ? 0.7 : R.flinch.flashAlpha, this.spot.size * 1.2, k.ms * 2.5);
  }

  // A spell lands (#265): a small flinch, no sound (the combo number's own ping plays) and no flash.
  flinch(): void {
    if (this.dead) return;
    const k = R.flinch;
    const f = spellData.flinchFactor;
    this.move({ x: k.dx * f, y: k.dy * f, rot: 0 }, k.ms, { yoyo: true, ease: "Quad.easeOut", onComplete: () => this.rest() });
  }

  // The stagger (#276): after the slam the enemy reels, a wobble and a cool tint, with its own cue.
  reel(): void {
    const k = R.reel;
    const wobble = shakeEnabled();
    playSound("enemy:stagger");
    this.move(
      { x: k.dx, y: k.dy, rot: wobble ? k.rotation : 0 },
      k.ms,
      { yoyo: true, repeat: wobble ? k.wobbles : 0, ease: "Quad.easeOut", onComplete: () => this.rest() },
    );
    this.glow(hexColour(k.tint), k.tintAlpha, this.spot.size * 1.3, k.tintMs);
  }

  // ---- ghost bars ----

  ghostOf(side: Side): number | undefined {
    const g = this.ghosts[side];
    return g.on ? g.value : undefined;
  }

  // A bar lost health: a lighter ghost stays where it was, then drains down to the real value
  // after a short delay. Hits in a row restart the delay and share the one drain.
  // `startsIn` is how long until the real bar starts to drop, so the delay counts from then.
  ghostHit(side: Side, from: number, to: number, startsIn = 0): void {
    if (to >= from) return;
    const g = this.ghosts[side];
    if (!g.on) {
      g.on = true;
      g.value = from;
    }
    g.tween?.stop();
    g.call?.remove(false);
    g.call = this.scene.time.delayedCall(scaleTime(startsIn + R.ghost.delayMs), () => this.drain(side));
    this.host.repaint(side);
  }

  private drain(side: Side): void {
    const g = this.ghosts[side];
    const bar = this.host.refs().bars.get(side);
    const target = bar?.value ?? 0;
    if (g.value <= target) {
      g.on = false;
      this.host.repaint(side);
      return;
    }
    const ms = Math.min(R.ghost.maxMs, Math.max(R.ghost.minMs, (g.value - target) * R.ghost.perPointMs));
    g.tween = this.scene.tweens.addCounter({
      from: g.value, to: target, duration: scaleTime(ms), ease: "Quad.easeInOut",
      onUpdate: (t) => { g.value = t.getValue() ?? target; this.host.repaint(side); },
      onComplete: () => { g.on = false; this.host.repaint(side); },
    });
  }

  // ---- the enemy's block ----

  // The block icon, cracked by how much of its block is worn down. Called as the icon is drawn.
  drawCracks(layer: Phaser.GameObjects.Container, x: number, y: number, s: number, block: number): void {
    // A fresh or topped-up shield starts uncracked (a skipped cascade never runs the block reset).
    if (block > this.shownBlock) this.shieldMax = block;
    this.shownBlock = block;
    this.shieldMax = Math.max(this.shieldMax, block);
    if (block <= 0) return;
    const worn = 1 - block / this.shieldMax;
    const n = R.shield.cracks.filter((c) => worn >= c).length;
    if (n === 0) return;
    const cracks = [
      [[0, -0.5], [-0.12, -0.2], [0.08, 0.05], [0, 0.5]],
      [[0.3, -0.5], [0.12, -0.25], [0.32, 0.0]],
      [[-0.3, -0.5], [-0.14, -0.2], [-0.34, 0.1]],
    ];
    const g = this.scene.add.graphics();
    layer.add(g);
    g.lineStyle(Math.max(2, s * 0.07), 0x0d1830, 1);
    for (const line of cracks.slice(0, n)) {
      g.beginPath();
      line.forEach(([a, b], i) => (i === 0 ? g.moveTo(x + a * s, y + b * s) : g.lineTo(x + a * s, y + b * s)));
      g.strokePath();
    }
  }

  // Block absorbed part of a hit: the icon cracks (the redraw shows it); if it ran out, it shatters.
  shieldHit(blockBefore: number, blockAfter: number): void {
    const sh = this.host.refs().shields.get("enemy");
    if (blockAfter > 0 || blockBefore <= 0 || !sh) {
      playSound("enemyShield");
      return;
    }
    this.shieldMax = 0;
    playSound("blockBreak");
    for (let i = 0; i < R.shield.shatterShards; i++) this.shard(sh.x, sh.y, R.shield.shatterSize, 0x9cc4ff, R.shield.shatterSpread, R.shield.shatterMs);
  }

  resetShield(): void {
    this.shieldMax = 0;
  }

  // A shard flying out from (x, y), falling a little, and gone.
  private shard(x: number, y: number, size: number, colour: number, spread: number, ms: number): void {
    const s = fxObject(this.scene, "shard", x, y, size * Phaser.Math.FloatBetween(0.6, 1), colour) as Obj;
    s.setDepth(DEPTH + 1).setRotation(Phaser.Math.FloatBetween(0, 6.28));
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const d = spread * Phaser.Math.FloatBetween(0.5, 1);
    this.scene.tweens.add({
      targets: s, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d + spread * 0.4, rotation: s.rotation + Phaser.Math.FloatBetween(-4, 4), alpha: 0,
      duration: scaleTime(ms * Phaser.Math.FloatBetween(0.6, 1)), ease: "Cubic.easeOut", onComplete: () => s.destroy(),
    });
  }

  // ---- killing blow ----

  // The freeze-frame on the killing blow: everything on the table holds for a moment.
  async freeze(): Promise<void> {
    const c = this.centre();
    const o = fxObject(this.scene, "glow", c.x, c.y, this.spot.size * 1.4, WHITE) as Obj;
    o.setDepth(DEPTH).setAlpha(reducedFlashing() ? 0.2 : 0.6);
    this.scene.tweens.timeScale = 0;
    await this.wait(this.boss ? R.freeze.bossMs : R.freeze.ms);
    this.scene.tweens.timeScale = this.host.speed();
    o.destroy();
  }

  // The enemy shatters; a boss does it longer and bigger. Plays once, when the battle ends won.
  async die(): Promise<void> {
    if (this.dead) return;
    const D = this.boss ? R.death.boss : R.death.normal;
    const colour = hexColour(D.colour);
    const c = this.centre();
    playSound(this.boss ? "bossDeath" : "enemyDeath");
    this.glow(colour, 0.8, D.ringSize, D.ms * 0.6, 1.4);
    const ring = fxObject(this.scene, "ring", c.x, c.y, D.ringSize, colour) as Obj;
    ring.setDepth(DEPTH).setScale(0.3);
    this.scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: scaleTime(D.ms * 0.7), ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
    for (let i = 0; i < D.shards; i++) this.shard(c.x + Phaser.Math.Between(-60, 60), c.y + Phaser.Math.Between(-60, 60), D.shardSize, colour, D.spread, D.ms);
    if (shakeEnabled()) this.scene.cameras.main.shake(scaleTime(D.ms * 0.6), D.shakeIntensity);
    this.move({ alpha: 0, scale: 1.15 }, D.ms * 0.45, { ease: "Quad.easeIn" });
    await this.wait(D.ms);
    this.dead = true;
    this.body?.destroy();
    this.body = undefined;
  }

  // ---- the enemy acts ----

  // Its intent card pulses once, just before it acts.
  async pulseIntent(box: { x: number; y: number; w: number; h: number }): Promise<void> {
    const soft = reducedFlashing();
    const c = this.scene.add.container(box.x + box.w / 2, box.y + box.h / 2).setDepth(DEPTH);
    const g = this.scene.add.graphics();
    g.lineStyle(6, 0xff9a94, soft ? 0.5 : 1);
    g.strokeRoundedRect(-box.w / 2, -box.h / 2, box.w, box.h, 40);
    c.add(g);
    this.scene.tweens.add({ targets: c, scale: R.intent.scale, alpha: 0, duration: scaleTime(R.intent.pulseMs), ease: "Cubic.easeOut", onComplete: () => c.destroy() });
    await this.wait(R.intent.holdMs);
  }

  // One lunge at the party; resolves at the moment of impact, and the enemy settles back after.
  lunge(): Promise<void> {
    playSound("lunge");
    return new Promise((resolve) => {
      this.move({ x: 0, y: R.lunge.dy, scale: R.lunge.scale, rot: 0 }, R.lunge.ms, {
        ease: "Cubic.easeIn",
        onComplete: () => {
          this.move({ x: 0, y: 0, scale: 1 }, R.lunge.returnMs, { ease: "Quad.easeOut" });
          resolve();
        },
      });
    });
  }

  // The party takes a hit: its side shakes, its health bar flashes, a red wash crosses the table's lower half.
  partyHit(amount: number): void {
    playSound("impact");
    const I = R.impact;
    const soft = reducedFlashing();
    if (amount > 0 && shakeEnabled()) this.scene.cameras.main.shake(scaleTime(I.shakeMs), I.shakeIntensity);
    if (amount <= 0) return;
    const alpha = soft ? I.flashAlpha * 0.4 : I.flashAlpha;
    const wash = this.scene.add.graphics().setDepth(DEPTH - 1);
    wash.fillStyle(0xe0443e, alpha);
    wash.fillRect(0, 640, 1920, 440);
    const bar = this.host.refs().bars.get("party");
    if (bar) {
      wash.fillStyle(0xffffff, soft ? 0.2 : 0.6);
      wash.fillRoundedRect(bar.x, bar.y, bar.w, bar.h, bar.h / 2);
    }
    this.scene.tweens.add({ targets: wash, alpha: 0, duration: scaleTime(soft ? I.flashMs * 2 : I.flashMs), onComplete: () => wash.destroy() });
  }

  // A shield rises in front of the enemy when it blocks, holds a moment, then fades.
  raiseShield(): void {
    playSound("enemyShield");
    const c = this.centre();
    const s = R.raise.size;
    const g = this.scene.add.graphics().setDepth(DEPTH);
    const pts = [[-1, -1], [1, -1], [1, 0.1], [0, 1.1], [-1, 0.1]].map(([a, b]) => new Phaser.Math.Vector2(a * s * 0.5, b * s * 0.5));
    g.fillStyle(0x4a6fa5, 0.85);
    g.fillPoints(pts, true);
    g.lineStyle(6, 0xdbe6f5, 1);
    g.strokePoints(pts, true);
    const holder = this.scene.add.container(c.x, c.y + R.raise.rise).setDepth(DEPTH).setScale(0.6).setAlpha(0);
    holder.add(g);
    this.scene.tweens.add({
      targets: holder, y: c.y, scale: 1, alpha: 1, duration: scaleTime(R.raise.ms), ease: "Back.easeOut",
      onComplete: () => this.scene.tweens.add({ targets: holder, alpha: 0, delay: scaleTime(R.raise.holdMs), duration: scaleTime(R.raise.ms), onComplete: () => holder.destroy() }),
    });
  }

  // The Glutton heals: a green pulse over it.
  heal(): void {
    playSound("heal");
    this.glow(hexColour(R.heal.colour), 0.8, R.heal.size, R.heal.ms, 1.5);
  }
}
