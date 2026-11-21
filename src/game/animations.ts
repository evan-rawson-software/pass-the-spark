import Phaser from "phaser";
import type { GameEvent } from "../engine/events";
import type { BattleView } from "../engine/view";
import { scaleTime } from "./playbackSpeed";
import { reducedFlashing } from "./comfort";
import { Buildup } from "./buildup";
import { playSound, setSoundHushed } from "./sound";
import { ComboHype } from "./comboHype";
import { EnemyReactions } from "./enemyReactions";
import { dominoLook, hexColour, reactionData } from "./presentation";
import { drawDomino } from "./dominoDrawing";
import { amplify, boardGlow, centre, charm, echo, floatText, flow, heatColor, heatTier, lightning, P, shake, split, spectrum, sputter } from "./spectacle";
import { seatGlow } from "./projectiles";
import { seatColour } from "./seatColours";
import type { FuseBoard } from "./fuseBoard";

// The cascade playback, driven only by engine events and the numbers in them (#186, #187): charge
// flows outward step by step, amplifiers flare, junctions split the glow, caps go off with their
// own animation and stacking numbers, fizzled ends sputter, then a tally of the whole cascade and
// the enemy's intent. Heat (spectacle.ts, data/presentation.json) grows with the cascade's size
// and its biggest caps. Every duration goes through scaleTime. The scene redraws from getView when
// the step is over, so nothing here has to be exact: it only has to look right on the way.

// The fast-forward factor while a skipped cascade finishes whatever was already playing.
export const SKIP_SPEED = 1000;

const DW = 240; // a domino at scale 1
const DH = 120;

// A domino or end as drawn: its centre and scale. w and h are its real size at scale 1 (a cap is narrower than the old cell, a junction taller).
export interface Pos { x: number; y: number; k: number; w?: number; h?: number }
interface Box { x: number; y: number; w: number; h: number }
type Container = Phaser.GameObjects.Container;
type Text = Phaser.GameObjects.Text;

export interface BarRef {
  g: Phaser.GameObjects.Graphics;
  text: Text;
  x: number; y: number; w: number; h: number;
  max: number;
  color: number;
  value?: number; // what it last showed (set by paintBar)
}

// What the scene drew last, so animations can find their targets. The scene calls newRefs() at the
// start of every redraw and fills these in as it draws.
export interface Refs {
  layer?: Container;
  hand: Map<string, Pos>; // the active hand, by domino id
  nodes: Map<number, { c: Container; pos: Pos }>; // board nodes, by node id
  slots: Map<number, Pos>; // open ends, by end id
  board?: FuseBoard; // the fuse board as drawn: fuses burn along it, its bounds frame the camera
  handSlots: Map<string, { c: Container; pos: Pos }[]>; // every player's hand, by seat and position (draw animation, #153)
  decks: Map<string, { c: Container; text: Text; x: number; y: number }>; // each seat's deck count in its tab: the text to update and where its draws fly in from (your own: the left edge of the hand row)
  bars: Map<string, BarRef>; // "enemy" | "party"
  shields: Map<string, { text: Text; x: number; y: number; s: number }>; // the icon's centre and size
  intent?: Box; // the enemy's intent card
  charms: Map<string, { x: number; y: number }>; // "seat:charm" -> the charm icon under its name plate (#108)
}

export function newRefs(): Refs {
  return { hand: new Map(), nodes: new Map(), slots: new Map(), handSlots: new Map(), decks: new Map(), bars: new Map(), shields: new Map(), charms: new Map() };
}

// `ghost` is the lighter bar that drains after a hit (enemyReactions.ts): drawn behind the real one.
export function paintBar(b: BarRef, value: number, ghost?: number): void {
  b.value = value;
  const g = b.g;
  g.clear();
  g.fillStyle(0x0d2a20, 0.9);
  g.fillRoundedRect(b.x, b.y, b.w, b.h, b.h / 2);
  const f = Math.max(0, Math.min(1, value / b.max));
  if (ghost !== undefined && ghost > value) {
    g.fillStyle(hexColour(reactionData.ghost.colour), reactionData.ghost.alpha);
    g.fillRoundedRect(b.x, b.y, Math.max(b.h, b.w * Math.min(1, ghost / b.max)), b.h, b.h / 2);
  }
  if (f > 0) {
    g.fillStyle(b.color, 1);
    g.fillRoundedRect(b.x, b.y, Math.max(b.h, b.w * f), b.h, b.h / 2);
  }
  g.lineStyle(3, 0x0d2a20, 1);
  g.strokeRoundedRect(b.x, b.y, b.w, b.h, b.h / 2);
  b.text.setText(`${Math.round(value)} / ${b.max}`);
}

// ---- small effects ----

function counter(scene: Phaser.Scene, from: number, to: number, ms: number, delay: number, onValue: (v: number) => void): void {
  if (from === to) return;
  scene.tweens.addCounter({
    from, to, delay: scaleTime(delay), duration: scaleTime(ms), ease: "Cubic.easeOut",
    onUpdate: (t) => onValue(t.getValue() ?? to),
  });
}

function flash(scene: Phaser.Scene, b: Box, color = 0xffffff): void {
  // Reduced flashing: a faint, slow fade instead of a bright blink.
  const soft = reducedFlashing();
  const g = scene.add.graphics().setDepth(90);
  g.fillStyle(color, soft ? 0.18 : 0.5);
  g.fillRoundedRect(b.x, b.y, b.w, b.h, 14);
  g.lineStyle(5, color, soft ? 0.5 : 1);
  g.strokeRoundedRect(b.x, b.y, b.w, b.h, 14);
  scene.tweens.add({ targets: g, alpha: 0, duration: scaleTime(soft ? 700 : 300), onComplete: () => g.destroy() });
}

function boxOf(p: Pos): Box {
  const w = (p.w ?? DW) * p.k;
  const h = (p.h ?? DH) * p.k;
  return { x: p.x - w / 2, y: p.y - h / 2, w, h };
}

const CAP_COLOR = { damage: "#ff6a5f", block: "#9cc4ff" };
const CAP_SOUND = { damage: "effect:damage", block: "effect:block" };
// Events that belong to the step already under way: what is still flying keeps flying. Any other
// event waits for it to land first.
const IN_STEP: GameEvent["type"][] = ["nodeLit", "capFired", "damage", "block", "charm", "fizzle", "passive", "lineReached"];

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
  // The cascade being played, all from events: the nodes lit so far, the charge each was lit with,
  // the biggest cap so far (value per trigger) and the heat tier those make.
  private lit: number[] = [];
  private charges = new Map<number, number>();
  private biggest = 0;
  private tier = -1;
  private inCascade = false;
  private lastShown?: BattleView; // the table as the last event left it, for the slam
  redraw: () => void = () => {}; // the scene's redraw from the shown table (set by the scene)
  skipping = false; // the player skipped the cascade: slow motion is off and the fast-forward stays on
  buildup: Buildup; // pitch, glow and camera (#191)
  hype: ComboHype; // the combo number, tiers, slam and fanfare (#234)
  reactions: EnemyReactions; // the enemy's hit, death and attack reactions (#190)
  // Scene time until which an animation is still in flight. A death waits for it (settle), so it
  // never lands before the hit that caused it. Animations that must be waited for call hold().
  private busyUntil = 0;
  private pending = new Set<Promise<void>>(); // events held for a landing, still animating (a freeze, a lunge)

  constructor(private scene: Phaser.Scene) {
    this.reactions = new EnemyReactions(scene, {
      refs: () => this.refs,
      speed: () => (this.skipping ? SKIP_SPEED : 1),
      repaint: (side) => {
        const b = this.refs.bars.get(side);
        if (b && b.g.active) paintBar(b, b.value ?? b.max, this.reactions.ghostOf(side));
      },
    });
    scene.tweens.timeScale = 1; // a restarted scene never inherits slow motion or a skip
    scene.time.timeScale = 1;
    this.buildup = new Buildup(scene);
    this.hype = new ComboHype(scene, {
      refs: () => this.refs,
      aim: () => this.reactions.where(),
      skipping: () => this.skipping,
      impact: (t) => this.slamImpact(t),
      partyBlock: () => this.landBlock(),
    });
  }

  // What the table still holds back until the slam, added to the shown value (comboHype.ts).
  owed(side: "party" | "enemy", kind: "health" | "block"): number {
    return this.hype.owed(side, kind);
  }

  // The wait after an event, in ms at 1x: the pause after each cap shrinks as the cascade goes on.
  pace(ev: GameEvent, wait: number): number {
    return this.hype.pace(ev, wait);
  }

  hold(ms: number): void {
    this.busyUntil = Math.max(this.busyUntil, this.scene.time.now + scaleTime(ms));
  }

  // Waits for the shots in the air to land, then for the animations of the events they carried
  // (a killing blow's freeze, the lunge), so the order is: land, react, then whatever comes next.
  private async landedAll(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  // Waits for the shots, their reactions and anything held.
  private async settle(): Promise<void> {
    await this.landedAll();
    const left = this.busyUntil - this.scene.time.now;
    if (left > 0) await new Promise<void>((resolve) => this.scene.time.delayedCall(left, resolve));
  }

  // The colour lit dominoes glow in: it follows the heat of the cascade being played.
  litColor(): number {
    return this.hype.litColour() ?? heatColor(this.tier);
  }

  private resetHeat(): void {
    this.lit = [];
    this.charges.clear();
    this.biggest = 0;
    this.tier = -1;
  }

  // Plays an event's animation. `apply` updates the shown table and redraws it; it is called once,
  // before the animation starts, so the new node or lit state is there to animate. Resolves when
  // the animation wants the table held (the tally, slow motion); most events resolve at once.
  async run(ev: GameEvent, shown: BattleView, apply: () => void): Promise<void> {
    // The battle ends only once everything still in flight has landed: the enemy then dies (once),
    // or the party's last hit finishes before the defeat.
    if (ev.type === "battleEnd") {
      // The camera goes back at once, so the slam and the death play at normal zoom.
      this.buildup.clear();
      await this.settle();
    } else if (!IN_STEP.includes(ev.type)) {
      // Whatever is still animating lands before the next step starts.
      await this.landedAll();
    }
    // The cascade is over when the enemy's block resets (or the battle ends): the number slams in.
    if (this.inCascade && (ev.type === "blockReset" || ev.type === "battleEnd")) {
      this.inCascade = false;
      this.buildup.finish();
      await this.hype.finish(ev.type === "battleEnd" && ev.result === "won", false);
    }
    if (ev.type === "battleEnd" && ev.result === "won") await this.reactions.die();
    this.hype.event(ev); // counted before the redraw, so the table holds the change back until the slam
    await this.play(ev, shown, apply);
  }

  // A skipped cascade: the events still to come are only counted; at its end a short slam and the fanfare
  // play at the final numbers, at normal speed.
  async skipEvent(ev: GameEvent, shown: BattleView): Promise<void> {
    this.lastShown = shown;
    if (ev.type === "setOff" && !this.hype.on) {
      this.inCascade = true;
      this.hype.begin({ health: shown.enemy.health, block: shown.enemy.block });
      this.hype.skip();
    }
    if (!this.inCascade) return;
    if (ev.type === "blockReset" || ev.type === "battleEnd") {
      this.inCascade = false;
      const scene = this.scene;
      scene.tweens.timeScale = 1;
      scene.time.timeScale = 1;
      setSoundHushed(false);
      await this.hype.finish(ev.type === "battleEnd" && ev.result === "won", true);
      setSoundHushed(true);
      scene.tweens.timeScale = SKIP_SPEED;
      scene.time.timeScale = SKIP_SPEED;
    } else this.hype.event(ev);
  }

  // The shots in the air have landed.
  landed(): Promise<void> {
    return this.landedAll();
  }

  // The cascade was skipped, or the scene is going: every shot ends now. Events held for a landing
  // run (flush) unless the scene is going away.
  clearShots(flush = true): void {
    if (flush) this.hype.skip();
    else this.hype.clear();
  }

  private async play(ev: GameEvent, shown: BattleView, apply: () => void): Promise<void> {
    const scene = this.scene;
    this.lastShown = shown;
    const before = snapshot(shown);
    const from = ev.type === "play" ? this.refs.hand.get(ev.domino) : undefined; // read before the redraw replaces it
    const gone = ev.type === "takeBack" ? this.refs.nodes.get(ev.node)?.pos : undefined;
    apply();
    const refs = this.refs; // replaced by the redraw in apply()
    const after = snapshot(shown);
    let slow = false;
    let hold: Promise<void> | undefined; // an animation the table waits for before the next event
    let microFreeze: (() => Promise<void>) | undefined; // the short freeze on a hit (comboHype.ts)

    switch (ev.type) {
      case "roundStart":
        this.buildup.clear();
        this.hype.clear();
        this.resetHeat();
        floatText(scene, 960, 470, `Round ${ev.round}`, "#ffffff", 56, 1000);
        break;
      case "play": {
        playSound("clack");
        // The building hum rises with the tree (the node id is how many are on the board, less one).
        playSound("hum", ev.node + 1);
        const node = refs.nodes.get(ev.node);
        if (node && from) {
          node.c.setPosition(from.x, from.y).setScale(from.k);
          node.c.parentContainer?.bringToTop(node.c);
          scene.tweens.add({ targets: node.c, x: node.pos.x, y: node.pos.y, scale: node.pos.k, duration: scaleTime(350), ease: "Cubic.easeOut" });
        }
        break;
      }
      case "takeBack": {
        // The domino slides off the board to its owner's hand (or, for a teammate, their tab).
        playSound("clack");
        const d = shown.dominoes.find((x) => x.id === ev.domino);
        const to = refs.decks.get(ev.player);
        if (gone && d && to) {
          const ghost = scene.add.container(gone.x, gone.y).setScale(gone.k).setDepth(700);
          const inner = drawDomino(scene, d, "large", "normal", { scale: gone.k, owner: seatColour(shown.seatOrder, ev.player) });
          inner.setPosition(((dominoLook.extent.amplifier.w - dominoLook.extent[d.kind].w) / 2) * dominoLook.unit, 0);
          ghost.add(inner);
          scene.tweens.add({ targets: ghost, x: to.x, y: to.y, scale: gone.k * 0.4, alpha: 0.2, duration: scaleTime(350), ease: "Cubic.easeIn", onComplete: () => ghost.destroy() });
        }
        break;
      }
      case "setOff": {
        floatText(scene, 960, 470, "Everyone is ready", "#ffe14d", 48, 1000);
        this.resetHeat();
        this.inCascade = true;
        this.hype.begin(after.enemy);
        this.buildup.begin(refs, shown.board.nodes.length);
        // The whole tree swells with the charge it holds before it goes.
        const glow = boardGlow(shown.board.nodes.length, 0);
        refs.nodes.forEach((n) => flash(scene, boxOf(n.pos), glow.color));
        break;
      }
      case "nodeLit":
        this.nodeLit(ev, shown);
        break;
      case "capFired": {
        this.biggest = Math.max(this.biggest, ev.value);
        this.tier = heatTier(this.lit.length, this.biggest);
        const node = refs.nodes.get(ev.node);
        playSound(CAP_SOUND[ev.effect], this.buildup.step());
        if (node) {
          const at = centre(boxOf(node.pos));
          this.buildup.cap(ev.value, at);
          microFreeze = this.hype.cap(ev, at, ev.value >= P.slowMotion.minCap);
          seatGlow(scene, at, boxOf(node.pos).w, seatColour(shown.seatOrder, ev.owner), true);
          const text = ev.triggers > 1 ? `${ev.value}×${ev.triggers}` : String(ev.value);
          floatText(scene, at.x, at.y, text, CAP_COLOR[ev.effect], Math.max(30, Math.round(60 * node.pos.k + 18 + this.tier * 6)), 1000);
          if (ev.value >= P.lightning.minCap && !reducedFlashing()) {
            const ends = this.lit
              .filter((id) => id !== ev.node)
              .slice(-P.lightning.bolts)
              .map((id) => refs.nodes.get(id))
              .filter((n): n is NonNullable<typeof n> => n !== undefined)
              .map((n) => centre(boxOf(n.pos)));
            lightning(scene, at, ends);
            playSound("lightning");
          }
        }
        if (ev.value >= P.shake.minCap) {
          shake(scene, this.tier);
          playSound("shake");
        }
        slow = ev.value >= P.slowMotion.minCap && !reducedFlashing() && !this.skipping;
        break;
      }
      case "fizzle": {
        playSound("fizzle");
        const at = refs.slots.get(ev.end);
        if (at) {
          sputter(scene, at);
          floatText(scene, at.x, at.y - 20, "fizzle", "#9aa3b2", 26, 800);
        }
        break;
      }
      case "charm": {
        playSound("effect:charm", 1 + this.tier * 3);
        // The charm icon bursts (#108); screen-only, the engine already counted the effect.
        const at = refs.charms.get(`${ev.player}:${ev.charm}`);
        if (at) charm(scene, at);
        break;
      }
      case "enemyAction":
        this.buildup.finish();
        if (refs.intent) {
          flash(scene, refs.intent, 0xff3b2f);
          hold = this.reactions.pulseIntent(refs.intent);
        }
        break;
      case "damage": {
        const key = ev.side;
        // The enemy's health, block and reactions wait for the slam (comboHype.ts) while the cascade counts.
        if (ev.side === "enemy" && this.hype.on) break;
        const sh = refs.shields.get(key);
        const bar = refs.bars.get(key);
        if (ev.amount > 0 && bar) floatText(scene, bar.x + bar.w / 2, bar.y - 10, `-${ev.amount}`, "#ff6a5f");
        if (ev.blocked > 0 && sh) floatText(scene, sh.x + 30, sh.y - 10, `${ev.blocked} blocked`, "#9cc4ff", 32);
        if (ev.side === "enemy") {
          if (ev.amount > 0) this.reactions.hit(ev.amount);
          if (ev.blocked > 0) this.reactions.shieldHit(before.enemy.block, after.enemy.block);
          if (before.enemy.health > 0 && after.enemy.health <= 0) hold = this.reactions.freeze();
          this.tweenHealth(key, before, after);
        } else {
          // The enemy lunges; on impact the block counter goes first, then the health drains. Until
          // then the party's numbers stay as they were (the redraw already showed the new ones).
          const bar = refs.bars.get("party");
          if (bar) paintBar(bar, before.party.health);
          sh?.text.setText(String(before.party.block + this.hype.owed("party", "block")));
          hold = this.reactions.lunge().then(() => {
            this.reactions.partyHit(ev.amount);
            const lag = ev.blocked > 0 ? reactionData.impact.blockFirstMs : 0;
            this.tweenHealth(key, before, after, lag);
            this.reactions.ghostHit(key, before[key].health, after[key].health, lag);
          });
        }
        if (ev.side === "enemy") this.reactions.ghostHit(key, before[key].health, after[key].health);
        break;
      }
      case "block": {
        // The party's block from the caps lands on its chip at the slam.
        if (ev.side === "party" && this.hype.on) break;
        if (ev.side === "enemy" && ev.amount > 0) this.reactions.raiseShield();
        const sh = refs.shields.get(ev.side);
        if (ev.amount > 0 && sh) floatText(scene, sh.x + 30, sh.y - 10, `+${ev.amount}`, "#9cc4ff");
        this.tweenHealth(ev.side, before, after);
        break;
      }
      case "passive": {
        const bar = refs.bars.get(ev.passive === "auditor" ? "party" : "enemy");
        if (ev.passive === "warden") floatText(scene, 960, 470, `Warden locks ${ev.spark}`, "#ff8a8a", 40, 1100);
        else if (bar) {
          const text = ev.passive === "auditor" ? `Auditor: -${ev.amount}` : ev.passive === "glutton" ? `Glutton +${ev.amount}` : ev.passive === "hoarder" ? "Hoarder" : ev.passive === "longNight" ? `Long Night +${ev.amount}` : `Smolder +${ev.amount}`;
          floatText(scene, bar.x + bar.w / 2, bar.y + 70, text, "#ffb066", 32, 1000);
        }
        if (ev.passive === "glutton") {
          this.reactions.heal();
          this.tweenHealth("enemy", before, after);
        }
        break;
      }
      case "blockReset":
        if (ev.side === "enemy") this.reactions.resetShield();
        this.tweenHealth("party", before, after);
        this.tweenHealth("enemy", before, after);
        break;
      default:
        break;
    }
    if (slow) await this.slowMotion();
    if (microFreeze) await microFreeze();
    if (hold) await hold;
  }

  // A domino lights: it flashes in the heat colour with its charge, an amplifier flares (bigger for
  // a bigger change), a junction splits the glow, and charge flows out along each branch at once.
  private nodeLit(ev: Extract<GameEvent, { type: "nodeLit" }>, shown: BattleView): void {
    const scene = this.scene;
    const refs = this.refs;
    this.lit.push(ev.node);
    this.tier = heatTier(this.lit.length, this.biggest);
    const color = this.litColor();
    const links = this.buildup.step(); // the pitch climbs with each cascade step, up to a cap in data
    playSound("tick", links);
    const node = refs.nodes.get(ev.node);
    if (!node) return;
    const box = boxOf(node.pos);
    const at = centre(box);
    flash(scene, box, color);
    seatGlow(scene, at, box.w, seatColour(shown.seatOrder, ev.owner));
    floatText(scene, at.x, box.y - 8, String(ev.charge), "#ffe14d", Math.max(22, Math.round(40 * node.pos.k + 14)), 700);

    // What it did to the charge: compare with the charge its parent was lit with.
    const board = shown.board;
    const me = board.nodes.find((n) => n.id === ev.node);
    const parent = me && me.end !== null ? board.ends.find((e) => e.id === me.end)?.node : undefined;
    const was = parent !== undefined ? this.charges.get(parent) : undefined;
    this.charges.set(ev.node, ev.charge);
    const d = shown.dominoes.find((x) => x.id === ev.domino);
    const pitch = links;
    if (d?.kind === "amplifier" && d.amp && was !== undefined) {
      const size = 0.6 + Math.min(1, Math.max(0, ev.charge - was) / P.amp.fullChange);
      if (d.amp.op === "echo") { echo(scene, at); playSound("effect:echo", pitch); }
      else if (d.amp.op === "spectrum") { spectrum(scene, at, size); playSound("effect:spectrum", pitch); }
      else { amplify(scene, at, size); playSound("effect:amplify", pitch); }
    }
    if (d?.kind === "junction") {
      split(scene, at, color);
      playSound("junction", pitch);
    }

    // Charge flows out along each branch's fuse, all at once, and the fuse burns behind it.
    for (const e of board.ends.filter((x) => x.node === ev.node)) {
      const fuse = refs.board?.fuseRefs().get(e.id);
      if (!fuse) continue;
      refs.board?.burn(e.id, color, scaleTime(P.step.pulseMs));
      flow(scene, fuse.pts, color, 10 + 8 * node.pos.k, this.tier);
    }
  }

  // The biggest caps hold the table for a moment in slow motion (the tweens slow; the hold is
  // scaled by playback speed and local to this screen).
  private async slowMotion(): Promise<void> {
    this.scene.tweens.timeScale = P.slowMotion.timeScale;
    playSound("slowMotion");
    await new Promise<void>((resolve) => this.scene.time.delayedCall(scaleTime(P.slowMotion.holdMs), resolve));
    this.scene.tweens.timeScale = this.skipping ? SKIP_SPEED : 1;
  }

  // The slam lands on the enemy (comboHype.ts): its block cracks first, then its health drops once by the
  // whole amount, with the ghost drain; the hit sounds and reactions play once, here, with the total.
  private slamImpact(t: { amount: number; blocked: number; killed: boolean; startHealth: number }): void {
    const shown = this.lastShown;
    if (!shown) return;
    const after = snapshot(shown);
    const before: Snapshot = { party: after.party, enemy: { health: t.killed ? t.startHealth : after.enemy.health + t.amount, block: after.enemy.block + t.blocked } };
    this.redraw(); // the table now shows the real numbers (and the cracked shield)
    const bar = this.refs.bars.get("enemy");
    if (bar) paintBar(bar, before.enemy.health);
    this.refs.shields.get("enemy")?.text.setText(String(before.enemy.block));
    const lag = t.blocked > 0 && t.amount > 0 ? reactionData.impact.blockFirstMs : 0;
    if (t.blocked > 0) this.reactions.shieldHit(before.enemy.block, after.enemy.block);
    if (t.amount > 0) {
      const hit = () => this.reactions.hit(t.amount);
      if (lag > 0) this.scene.time.delayedCall(scaleTime(lag), hit);
      else hit();
    }
    this.tweenHealth("enemy", before, after, lag);
    this.reactions.ghostHit("enemy", before.enemy.health, after.enemy.health, lag);
  }

  // The block from the caps lands on the party's block chip.
  private landBlock(): void {
    const shown = this.lastShown;
    if (!shown) return;
    const owed = this.hype.owed("party", "block");
    const after = snapshot(shown);
    const before: Snapshot = { party: { health: after.party.health, block: after.party.block - owed }, enemy: after.enemy };
    this.hype.settleParty();
    this.redraw();
    this.refs.shields.get("party")?.text.setText(String(before.party.block));
    this.tweenHealth("party", before, after);
    const text = this.refs.shields.get("party")?.text;
    if (text?.active) this.scene.tweens.add({ targets: text, scale: 1.4, duration: scaleTime(110), yoyo: true, ease: "Quad.easeOut" });
  }

  private tweenHealth(side: "party" | "enemy", before: Snapshot, after: Snapshot, healthDelay = 0): void {
    this.hold(400 + healthDelay);
    const bar = this.refs.bars.get(side);
    if (bar) counter(this.scene, before[side].health, after[side].health, 400, healthDelay, (v) => {
      const cur = this.refs.bars.get(side);
      if (cur && cur.g.active) paintBar(cur, v + this.hype.owed(side, "health"), this.reactions.ghostOf(side));
    });
    const sh = this.refs.shields.get(side);
    if (sh) counter(this.scene, before[side].block, after[side].block, 400, 0, (v) => {
      const cur = this.refs.shields.get(side);
      if (cur && cur.text.active) cur.text.setText(String(Math.round(v) + this.hype.owed(side, "block")));
    });
  }
}
