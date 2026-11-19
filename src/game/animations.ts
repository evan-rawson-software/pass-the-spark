import Phaser from "phaser";
import type { GameEvent } from "../engine/events";
import type { BattleView } from "../engine/view";
import type { Domino } from "../engine/types";
import { scaleTime } from "./playbackSpeed";
import { Heat, METER_FULL, METER_MAX_SCALE } from "./heat";

// Basic table animations (#25), driven only by engine events and the numbers in them.
// Every duration goes through scaleTime. The scene redraws from getView when the step is over,
// so nothing here has to be exact: it only has to look right on the way.

const FONT = "Arial, Helvetica, sans-serif";
const DW = 240; // a domino at scale 1
const DH = 120;
const GOLD = 0xffe14d;
const RED = 0xff3b2f;

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
  bars: Map<string, BarRef>; // "enemy" | "party"
  shields: Map<string, { text: Text; x: number; y: number }>;
  meter?: { text: Text; rect: Box; scale: number };
  charms: Map<string, { x: number; y: number }>; // "seat:charm" -> the charm icon in the combat list (#108)
}

export function newRefs(): Refs {
  return { hand: new Map(), chain: [], enemyHand: [], bars: new Map(), shields: new Map(), charms: new Map() };
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
      const cs = refs.chain.filter((e) => e.c.active);
      await Promise.all(
        cs.map((e, i) =>
          tweenDone(scene, {
            targets: e.c, alpha: 0, y: e.pos.y - 40, scale: e.pos.k * 0.6,
            delay: scaleTime(Math.min(i * 25, 200)), duration: scaleTime(300), ease: "Cubic.easeIn",
          }),
        ),
      );
    }
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
          if (f === "echo") {
            ring(scene, cx, cy, 0x4fd8ff);
            ring(scene, cx, cy, 0x4fd8ff, 150);
            floatText(scene, cx, cy - 20, `ECHO ×${ev.index + 1}`, "#7fe6ff", 40, 900);
          } else if (f === "mimic") {
            ring(scene, cx, cy, 0xc77dff);
            ring(scene, cx, cy, 0xc77dff, 150);
            floatText(scene, cx, cy - 20, "MIMIC", "#d9a6ff", 40, 900);
          } else if (f === "reflect") {
            ring(scene, cx, cy, 0xff8a1f);
            ring(scene, cx, cy, 0xff8a1f, 150);
            floatText(scene, cx, cy - 20, "REFLECT", "#ffb066", 40, 900);
          }
        }
        break;
      }
      case "charm": {
        // The charm icon flashes (#108); screen-only, the engine already counted the effect.
        const at = refs.charms.get(`${ev.player}:${ev.charm}`);
        if (at) {
          ring(scene, at.x, at.y, 0xffe14d);
          flash(scene, { x: at.x - 16, y: at.y - 16, w: 32, h: 32 }, 0xffe14d);
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
        this.tweenHealth(side, before, after);
        break;
      }
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
