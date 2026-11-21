import Phaser from "phaser";
import type { GameEvent } from "../engine/events";
import type { BattleView } from "../engine/view";
import { scaleTime } from "./playbackSpeed";
import { playSound } from "./sound";

// The basic cascade playback (#186), driven only by engine events and the numbers in them: nodes
// light step by step, caps pop their numbers, fizzled ends dim, then the enemy's intent plays out
// against party block. Every duration goes through scaleTime. The scene redraws from getView when
// the step is over, so nothing here has to be exact: it only has to look right on the way.
// The full spectacle is #187.

const FONT = "Arial, Helvetica, sans-serif";
const DW = 240; // a domino at scale 1
const DH = 120;

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

// What the scene drew last, so animations can find their targets. The scene calls newRefs() at the
// start of every redraw and fills these in as it draws.
export interface Refs {
  layer?: Container;
  hand: Map<string, Pos>; // the active hand, by domino id
  nodes: Map<number, { c: Container; pos: Pos }>; // board nodes, by node id
  slots: Map<number, Pos>; // open ends, by end id
  handSlots: Map<string, { c: Container; pos: Pos }[]>; // every player's hand, by seat and position (draw animation, #153)
  decks: Map<string, { c: Container; text: Text; x: number; y: number }>; // each seat's deck stack
  bars: Map<string, BarRef>; // "enemy" | "party"
  shields: Map<string, { text: Text; x: number; y: number }>;
  intent?: Box; // the enemy's intent card
  charms: Map<string, { x: number; y: number }>; // "seat:charm" -> the charm icon under its name plate (#108)
}

export function newRefs(): Refs {
  return { hand: new Map(), nodes: new Map(), slots: new Map(), handSlots: new Map(), decks: new Map(), bars: new Map(), shields: new Map(), charms: new Map() };
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

// ---- small effects ----

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

function boxOf(p: Pos): Box {
  return { x: p.x - (DW * p.k) / 2, y: p.y - (DH * p.k) / 2, w: DW * p.k, h: DH * p.k };
}

const CAP_COLOR = { damage: "#ff6a5f", block: "#9cc4ff", coins: "#ffd23f" };

// ---- the animator ----

export interface Snapshot {
  party: { health: number; block: number };
  enemy: { health: number; block: number };
}

export function snapshot(view: BattleView): Snapshot {
  return {
    party: { health: view.party.health, block: view.party.block },
    enemy: { health: view.enemy.health, block: view.enemy.block },
  };
}

// How long (ms at 1x) the table should wait for an event's animation.
export function animTime(ev: GameEvent): number {
  return ev.type === "play" ? 350 : 0;
}

export class Animator {
  refs: Refs = newRefs();
  private step = 0; // the cascade step being played, so the tick rises along the chain

  constructor(private scene: Phaser.Scene) {}

  // Plays an event's animation. `apply` updates the shown table and redraws it; it is called once,
  // before the animation starts, so the new node or lit state is there to animate.
  async run(ev: GameEvent, shown: BattleView, apply: () => void): Promise<void> {
    const scene = this.scene;
    const before = snapshot(shown);
    const from = ev.type === "play" ? this.refs.hand.get(ev.domino) : undefined; // read before the redraw replaces it
    apply();
    const refs = this.refs; // replaced by the redraw in apply()
    const after = snapshot(shown);

    switch (ev.type) {
      case "roundStart":
        floatText(scene, 960, 470, `Round ${ev.round}`, "#ffffff", 56, 1000);
        break;
      case "play": {
        playSound("clack");
        const node = refs.nodes.get(ev.node);
        if (node && from) {
          node.c.setPosition(from.x, from.y).setScale(from.k);
          refs.layer?.bringToTop(node.c);
          scene.tweens.add({ targets: node.c, x: node.pos.x, y: node.pos.y, scale: node.pos.k, duration: scaleTime(350), ease: "Cubic.easeOut" });
        }
        break;
      }
      case "pass":
        floatText(scene, 960, 470, `${ev.player} passes`, "#ffd9a0", 44, 900);
        break;
      case "setOff": {
        const why = ev.reason === "player" ? `${ev.player} sets it off` : ev.reason === "capped" ? "Every end is capped" : "Everyone passed";
        floatText(scene, 960, 470, why, "#ffe14d", 48, 1000);
        break;
      }
      case "cascadeStep":
        this.step = ev.depth + 1;
        break;
      case "nodeLit": {
        playSound("tick", this.step);
        const node = refs.nodes.get(ev.node);
        if (node) {
          flash(scene, boxOf(node.pos), 0xffe14d);
          floatText(scene, node.pos.x, node.pos.y - (DH * node.pos.k) / 2 - 8, String(ev.charge), "#ffe14d", Math.max(22, Math.round(40 * node.pos.k + 14)), 700);
        }
        break;
      }
      case "capFired": {
        playSound(ev.effect === "coins" ? "coins" : `effect:${ev.effect}`);
        const node = refs.nodes.get(ev.node);
        if (node) {
          const text = ev.triggers > 1 ? `${ev.value}×${ev.triggers}` : String(ev.value);
          floatText(scene, node.pos.x, node.pos.y, text, CAP_COLOR[ev.effect], Math.max(30, Math.round(60 * node.pos.k + 18)), 1000);
        }
        break;
      }
      case "fizzle": {
        playSound("slowMotion");
        const at = refs.slots.get(ev.end);
        if (at) floatText(scene, at.x, at.y, "fizzle", "#9aa3b2", 26, 800);
        break;
      }
      case "charm": {
        playSound("effect:charm");
        // The charm icon flashes (#108); screen-only, the engine already counted the effect.
        const at = refs.charms.get(`${ev.player}:${ev.charm}`);
        if (at) flash(scene, { x: at.x - 16, y: at.y - 16, w: 32, h: 32 }, 0xffe14d);
        break;
      }
      case "enemyAction":
        if (refs.intent) flash(scene, refs.intent, 0xff3b2f);
        break;
      case "damage": {
        const key = ev.side;
        const sh = refs.shields.get(key);
        const bar = refs.bars.get(key);
        if (ev.amount > 0 && bar) floatText(scene, bar.x + bar.w / 2, bar.y - 10, `-${ev.amount}`, "#ff6a5f");
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
      case "coinsGained":
        floatText(scene, 960, 600, `${ev.player}: +${ev.amount} coins`, "#ffd23f", 40, 1000);
        break;
      case "passive": {
        const bar = refs.bars.get(ev.passive === "auditor" ? "party" : "enemy");
        if (ev.passive === "warden") floatText(scene, 960, 470, `Warden locks ${ev.spark}`, "#ff8a8a", 40, 1100);
        else if (bar) {
          const text = ev.passive === "auditor" ? `Auditor: -${ev.amount}` : ev.passive === "glutton" ? `Glutton +${ev.amount}` : ev.passive === "hoarder" ? "Hoarder" : ev.passive === "longNight" ? `Long Night +${ev.amount}` : `Smolder +${ev.amount}`;
          floatText(scene, bar.x + bar.w / 2, bar.y + 70, text, "#ffb066", 32, 1000);
        }
        if (ev.passive === "glutton") this.tweenHealth("enemy", before, after);
        break;
      }
      case "blockReset":
        this.tweenHealth("party", before, after);
        this.tweenHealth("enemy", before, after);
        break;
      default:
        break;
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
}
