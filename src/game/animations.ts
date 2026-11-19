import Phaser from "phaser";
import type { GameEvent } from "../engine/events";
import type { BattleView } from "../engine/view";
import type { Domino } from "../engine/types";
import { scaleTime } from "./playbackSpeed";
import { Heat, METER_FULL, METER_MAX_SCALE, heatColor } from "./heat";
import type { EffectCue } from "./heat";
import { playEffect, topple } from "./effects";
import type { Tally } from "./effects";

// Basic table animations (#25), driven only by engine events and the numbers in them.
// Every duration goes through scaleTime. The scene redraws from getView when the step is over,
// so nothing here has to be exact: it only has to look right on the way.

const FONT = "Arial, Helvetica, sans-serif";
const DW = 240; // a domino at scale 1
const DH = 120;
const GOLD = 0xffe14d;
const RED = 0xff3b2f;
const ENEMY_ROW = { x: 630, y: 40, w: 870, h: 60 }; // the enemy's hand row (CombatScene)

export const COMBO_METER_FULL = METER_FULL; // strength x lap at which the meter looks full (cosmetic only; data/presentation.json)

export interface Pos { x: number; y: number; k: number }
interface Box { x: number; y: number; w: number; h: number }
type Container = Phaser.GameObjects.Container;
type Text = Phaser.GameObjects.Text;

export interface BarRef {
  g: Phaser.GameObjects.Graphics;
  text: Text;
  x: number; y: number; w: number; h: number;
  max: number;
  color: number;
}

// What the scene drew last, so animations can find their targets. The scene calls reset() at the
// start of every redraw and fills these in as it draws.
export interface Refs {
  layer?: Container;
  hand: Map<string, Pos>; // the active hand, by domino id
  chain: { c: Container; pos: Pos }[];
  enemyHand: { c: Container; pos: Pos }[];
  handSlots: Map<string, { c: Container; pos: Pos }[]>; // every player's hand, by seat and position (draw animation, #153)
  decks: Map<string, { c: Container; text: Text; x: number; y: number }>; // each seat's deck stack, "enemy" included
  bars: Map<string, BarRef>; // "enemy" | "party"
  shields: Map<string, { text: Text; x: number; y: number }>;
  meter?: { text: Text; rect: Box; scale: number };
  charms: Map<string, { x: number; y: number }>; // "seat:charm" -> the charm icon under its name plate (#108)
}

export function newRefs(): Refs {
  return { hand: new Map(), chain: [], enemyHand: [], handSlots: new Map(), decks: new Map(), bars: new Map(), shields: new Map(), charms: new Map() };
}

export function paintBar(b: BarRef, value: number): void {
  const g = b.g;
  g.clear();
  g.fillStyle(0x0d2a20, 0.9);
  g.fillRoundedRect(b.x, b.y, b.w, b.h, b.h / 2);
  const f = Math.max(0, Math.min(1, value / b.max));
  if (f > 0) {
    g.fillStyle(b.color, 1);
    g.fillRoundedRect(b.x, b.y, Math.max(b.h, b.w * f), b.h, b.h / 2);
  }
  g.lineStyle(3, 0x0d2a20, 1);
  g.strokeRoundedRect(b.x, b.y, b.w, b.h, b.h / 2);
  b.text.setText(`${Math.round(value)} / ${b.max}`);
}

// The meter grows and turns from gold to red as strength x lap climbs.
export function comboLook(total: number): { scale: number; color: number } {
  const f = Math.min(1, total / COMBO_METER_FULL);
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * f);
  const color = (lerp((GOLD >> 16) & 255, (RED >> 16) & 255) << 16) | (lerp((GOLD >> 8) & 255, (RED >> 8) & 255) << 8) | lerp(GOLD & 255, RED & 255);
  return { scale: 1 + (METER_MAX_SCALE - 1) * f, color };
}

export function hexString(color: number): string {
  return "#" + color.toString(16).padStart(6, "0");
}

// ---- small effects ----

function tweenDone(scene: Phaser.Scene, config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.add({ ...config, onComplete: () => resolve() });
  });
}

function counter(scene: Phaser.Scene, from: number, to: number, ms: number, onValue: (v: number) => void): void {
  if (from === to) return;
  scene.tweens.addCounter({
    from, to, duration: scaleTime(ms), ease: "Cubic.easeOut",
    onUpdate: (t) => onValue(t.getValue() ?? to),
  });
}

function floatText(scene: Phaser.Scene, x: number, y: number, text: string, color: string, size = 44, ms = 1000): void {
  const t = scene.add
    .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: "bold", color, stroke: "#101010", strokeThickness: 6 })
    .setOrigin(0.5)
    .setDepth(100);
  scene.tweens.add({
    targets: t, y: y - 70, alpha: 0, duration: scaleTime(ms), ease: "Cubic.easeOut",
    onComplete: () => t.destroy(),
  });
}

function flash(scene: Phaser.Scene, b: Box, color = 0xffffff): void {
  const g = scene.add.graphics().setDepth(90);
  g.fillStyle(color, 0.5);
  g.fillRoundedRect(b.x, b.y, b.w, b.h, 14);
  g.lineStyle(5, color, 1);
  g.strokeRoundedRect(b.x, b.y, b.w, b.h, 14);
  scene.tweens.add({ targets: g, alpha: 0, duration: scaleTime(300), onComplete: () => g.destroy() });
}

// A ring that grows and fades around a point.
function ring(scene: Phaser.Scene, x: number, y: number, color: number, delay = 0): void {
  const g = scene.add.graphics().setDepth(95).setPosition(x, y).setAlpha(0);
  g.lineStyle(8, color, 1);
  g.strokeCircle(0, 0, 60);
  scene.tweens.add({
    targets: g, scale: { from: 0.5, to: 2.4 }, alpha: { from: 1, to: 0 },
    delay: scaleTime(delay), duration: scaleTime(450), ease: "Cubic.easeOut",
    onStart: () => g.setAlpha(1),
    onComplete: () => g.destroy(),
  });
}

function boxOf(p: Pos): Box {
  return { x: p.x - (DW * p.k) / 2, y: p.y - (DH * p.k) / 2, w: DW * p.k, h: DH * p.k };
}

// ---- the animator ----

export interface Snapshot {
  party: { health: number; block: number };
  enemy: { health: number; block: number };
  total: number;
}

export function snapshot(view: BattleView): Snapshot {
  return {
    party: { health: view.party.health, block: view.party.block },
    enemy: { health: view.enemy.health, block: view.enemy.block },
    total: view.chain.strength * view.chain.lap,
  };
}

// How long (ms at 1x) the table should wait for an event's animation.
export function animTime(ev: GameEvent, dominoes: Domino[]): number {
  switch (ev.type) {
    case "opener":
    case "play":
      return 350;
    case "trigger": return flourishOf(ev, dominoes) ? 600 : 250;
    case "damage": case "block": case "heal": return ev.amount > 0 || ev.blocked > 0 ? 350 : 0;
    case "glutton": return 350;
    case "hoarder": case "smolder": return 350;
    case "amplify": return 250;
    case "reveal": return 350;
    case "lapUp": return 450;
    case "blockReset": return 300;
    default: return 0;
  }
}

function flourishOf(ev: Extract<GameEvent, { type: "trigger" }>, dominoes: Domino[]): "echo" | "mimic" | "reflect" | null {
  const kind = dominoes.find((d) => d.id === ev.domino)?.effect.kind;
  if (kind === "mimic") return "mimic";
  if (kind === "reflect") return "reflect";
  if (ev.index > 0) return "echo";
  return null;
}

export class Animator {
  refs: Refs = newRefs();
  private anchor: Box | null = null; // where the domino whose effect is going off sits

  // What each domino of the open chain did, from the engine's damage and block events, for the
  // topple's tally (#134). One entry per opener or play, in chain order.
  private tally: Tally[] = [];
  private chainOpen = false;

  heat: Heat; // the heat ladder (#133); the scene's chain drawing also calls heat.decorate and heat.syncRoom

  constructor(private scene: Phaser.Scene, public dominoes: Domino[], dim: Phaser.GameObjects.Rectangle) {
    this.heat = new Heat(scene, dim);
  }

  // Plays an event's animation. `apply` updates the shown table and redraws it; it is called once,
  // after any "before" animation (the chain clearing) and before the "after" ones.
  async run(ev: GameEvent, shown: BattleView, apply: () => void): Promise<void> {
    const scene = this.scene;
    const before = snapshot(shown);
    let refs = this.refs; // the scene replaces these on every redraw, so read them again after apply()
    let from: Pos | undefined;
    if (ev.type === "opener" || ev.type === "play") {
      // From the player's hand, or the enemy's row (its first slot: which one it was stays hidden).
      from = ev.type === "play" && ev.seat === "enemy" ? undefined : refs.hand.get(ev.domino);
      if (!from) from = refs.enemyHand[0]?.pos;
    }
    if (ev.type === "chainEnd") {
      // The chain topples back along the line, last to first, tallying what it did (#134).
      const cs = refs.chain.filter((e) => e.c.active);
      const hidden = Math.max(0, this.tally.length - refs.chain.length); // dominoes scrolled off the table
      const extra = this.tally.slice(0, hidden).reduce((t, n) => ({ damage: t.damage + n.damage, block: t.block + n.block }), { damage: 0, block: 0 });
      await topple(
        scene, cs.map((e) => ({ c: e.c, w: DW * e.pos.k })), this.tally.slice(hidden), extra,
        heatColor(shown.chain.strength, shown.chain.lap), { x: 960, y: 580 }, shown.chain.lap,
      );
      this.chainOpen = false;
    }
    this.countChain(ev);
    apply();
    refs = this.refs;
    const after = snapshot(shown);

    switch (ev.type) {
      case "opener":
      case "play": {
        const last = refs.chain[refs.chain.length - 1];
        if (last && from) {
          this.anchor = boxOf(last.pos);
          last.c.setPosition(from.x, from.y).setScale(from.k);
          refs.layer?.bringToTop(last.c);
          scene.tweens.add({ targets: last.c, x: last.pos.x, y: last.pos.y, scale: last.pos.k, duration: scaleTime(350), ease: "Cubic.easeOut" });
        }
        // Heat ladder: links (strength) and lap come straight from the event.
        if (ev.type === "play") {
          const prev = refs.chain[refs.chain.length - 2];
          this.heat.onPlay(ev.strength, ev.lap, prev && boxOf(prev.pos), last && boxOf(last.pos));
        }
        break;
      }
      case "leftover": {
        const slot = refs.enemyHand[ev.position];
        if (slot) this.anchor = boxOf(slot.pos);
        break;
      }
      case "trigger": {
        if (this.anchor) {
          flash(scene, this.anchor);
          const f = flourishOf(ev, this.dominoes);
          const cx = this.anchor.x + this.anchor.w / 2;
          const cy = this.anchor.y + this.anchor.h / 2;
          const links = shown.chain.strength;
          const lap = shown.chain.lap;
          const prev = refs.chain[refs.chain.length - 2];
          const effectAt = (kind: EffectCue, to?: { x: number; y: number }) =>
            playEffect(scene, kind, { from: this.anchor!, to, prev: prev && boxOf(prev.pos), enemyRow: ENEMY_ROW }, links, lap);
          // The domino's own flourish first: Mimic and Reflect show themselves, then what they copied.
          if (f === "echo") floatText(scene, cx, cy - 20, `ECHO ×${ev.index + 1}`, "#7fe6ff", 40, 900);
          else if (f === "mimic") {
            effectAt("mimic");
            floatText(scene, cx, cy - 20, "MIMIC", "#d9a6ff", 40, 900);
          } else if (f === "reflect") {
            effectAt("reflect");
            floatText(scene, cx, cy - 20, "REFLECT", "#ffb066", 40, 900);
          }
          // Then the effect that went off. Damage flies to the side it hits; block and heal land on their own side.
          const kind = ev.effect.kind;
          if (kind === "damage") {
            const bar = refs.bars.get(ev.side === "party" ? "enemy" : "party");
            effectAt("damage", bar && { x: bar.x + bar.w / 2, y: bar.y + bar.h / 2 });
          } else if (kind === "block") {
            const sh = refs.shields.get(ev.side);
            effectAt("block", sh && { x: sh.x + 30, y: sh.y });
          } else if (kind === "heal") {
            const bar = refs.bars.get(ev.side);
            effectAt("heal", bar && { x: bar.x + bar.w / 2, y: bar.y + bar.h / 2 });
          } else if (kind === "amplify" || kind === "echo" || kind === "lookout") {
            effectAt(kind);
          }
          if (ev.effect.spectrum && (kind === "damage" || kind === "block" || kind === "heal")) effectAt("spectrum");
        }
        break;
      }
      case "charm": {
        // The charm icon flashes (#108); screen-only, the engine already counted the effect.
        const at = refs.charms.get(`${ev.player}:${ev.charm}`);
        if (at) {
          flash(scene, { x: at.x - 16, y: at.y - 16, w: 32, h: 32 }, 0xffe14d);
          playEffect(scene, "charm", { from: { x: at.x - 16, y: at.y - 16, w: 32, h: 32 } }, shown.chain.strength, shown.chain.lap);
        }
        break;
      }
      case "damage": {
        const key = ev.side;
        const sh = refs.shields.get(key);
        const bar = refs.bars.get(key);
        if (ev.amount > 0 && bar) {
          const at = bar.x + bar.w / 2;
          if (!this.heat.damageNumber(shown.chain.strength, shown.chain.lap, at, bar.y - 10, `-${ev.amount}`, "#ff6a5f")) {
            floatText(scene, at, bar.y - 10, `-${ev.amount}`, "#ff6a5f");
          }
        }
        if (ev.blocked > 0 && sh) floatText(scene, sh.x + 30, sh.y - 10, `${ev.blocked} blocked`, "#9cc4ff", 32);
        this.tweenHealth(key, before, after);
        break;
      }
      case "block": {
        const sh = refs.shields.get(ev.side);
        if (ev.amount > 0 && sh) floatText(scene, sh.x + 30, sh.y - 10, `+${ev.amount}`, "#9cc4ff");
        this.tweenHealth(ev.side, before, after);
        break;
      }
      case "heal":
      case "glutton": {
        const side = ev.type === "glutton" ? "enemy" : ev.side;
        const amount = ev.type === "glutton" ? ev.heal : ev.amount;
        const bar = refs.bars.get(side);
        if (amount > 0 && bar) floatText(scene, bar.x + bar.w / 2, bar.y - 10, `+${amount}`, "#7dff9e");
        if (ev.type === "glutton" && amount > 0 && bar) floatText(scene, bar.x + bar.w / 2, bar.y + 70, "Glutton", "#7dff9e", 30, 1000);
        this.tweenHealth(side, before, after);
        break;
      }
      // Short labels for what the old log line used to say (#155).
      case "enemyNoReaction":
        floatText(scene, 960, 215, "No reaction", "#ffd9a0", 40, 900);
        break;
      case "smolder":
        floatText(scene, 960, 215, `Leftovers at strength ${ev.strength}`, "#ffb066", 34, 900);
        break;
      case "auditor": {
        const bar = refs.bars.get("party");
        if (bar) floatText(scene, bar.x + bar.w / 2, bar.y + 70, `Auditor: -${ev.damage}`, "#ff9a94", 34, 1000);
        break;
      }
      case "hoarder": {
        const sh = refs.shields.get("enemy");
        if (sh) floatText(scene, sh.x + 60, sh.y - 50, "Hoarder", "#9cc4ff", 30, 1000);
        break;
      }
      case "sparkLocked":
        floatText(scene, 960, 470, `Warden locks ${ev.spark}`, "#ff8a8a", 40, 1100);
        break;
      case "chainEnd":
        floatText(scene, 960, 470, "Chain broken", "#ffd9a0", 56, 1100);
        break;
      case "blockReset":
        this.tweenHealth("party", before, after);
        this.tweenHealth("enemy", before, after);
        break;
      case "reveal":
        for (const p of ev.positions) {
          const slot = refs.enemyHand[p];
          if (!slot) continue;
          slot.c.setScale(0, slot.pos.k);
          scene.tweens.add({ targets: slot.c, scaleX: slot.pos.k, duration: scaleTime(300), ease: "Back.easeOut" });
        }
        break;
      default:
        break;
    }
    this.meter(ev, before.total, after.total);
    if (ev.type === "lapUp") this.heat.onLapUp(ev.lap);
    if (ev.type === "chainEnd") this.heat.onChainEnd();
    // Lap 3+: slow motion after each play. Local to this screen; scaled by playback speed.
    if (ev.type === "play") await this.heat.slowMotion(ev.strength, ev.lap);
  }

  // Adds what an event did to the open chain's per-domino tally (the engine's own numbers).
  private countChain(ev: GameEvent): void {
    if (ev.type === "roundStart") {
      this.tally = [];
      this.chainOpen = false;
    } else if (ev.type === "opener") {
      this.tally = [{ damage: 0, block: 0 }];
      this.chainOpen = true;
    } else if (ev.type === "play") {
      this.tally.push({ damage: 0, block: 0 });
    } else if (this.chainOpen && this.tally.length > 0) {
      const t = this.tally[this.tally.length - 1];
      if (ev.type === "damage" && ev.side === "enemy") t.damage += ev.amount;
      else if (ev.type === "block" && ev.side === "party") t.block += ev.amount;
    }
  }

  private tweenHealth(side: "party" | "enemy", before: Snapshot, after: Snapshot): void {
    const bar = this.refs.bars.get(side);
    if (bar) counter(this.scene, before[side].health, after[side].health, 400, (v) => {
      const cur = this.refs.bars.get(side);
      if (cur && cur.g.active) paintBar(cur, v);
    });
    const sh = this.refs.shields.get(side);
    if (sh) counter(this.scene, before[side].block, after[side].block, 400, (v) => {
      const cur = this.refs.shields.get(side);
      if (cur && cur.text.active) cur.text.setText(String(Math.round(v)));
    });
  }

  private meter(ev: GameEvent, from: number, to: number): void {
    const m = this.refs.meter;
    if (!m || from === to) return;
    const scene = this.scene;
    if (to > from) {
      // Pop: start big and settle at the size the new value calls for.
      m.text.setScale(m.scale * 1.5);
      scene.tweens.add({ targets: m.text, scale: m.scale, duration: scaleTime(280), ease: "Back.easeOut" });
    } else {
      // Reset: shrink from the old size.
      m.text.setScale(comboLook(from).scale);
      scene.tweens.add({ targets: m.text, scale: m.scale, duration: scaleTime(300), ease: "Cubic.easeIn" });
    }
    if (ev.type === "lapUp") {
      const { x, y, w, h } = m.rect;
      const g = scene.add.graphics().setDepth(95).setPosition(x + w / 2, y + h / 2);
      g.lineStyle(8, GOLD, 1);
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, 40);
      scene.tweens.add({
        targets: g, scale: { from: 1, to: 1.25 }, alpha: { from: 1, to: 0 },
        duration: scaleTime(450), ease: "Cubic.easeOut", onComplete: () => g.destroy(),
      });
      floatText(scene, x + w / 2, y + h - 10, `LAP ${this.lapOf(ev)}`, "#ffe14d", 36, 900);
    }
  }

  private lapOf(ev: GameEvent): number {
    return ev.type === "lapUp" ? ev.lap : 0;
  }
}
