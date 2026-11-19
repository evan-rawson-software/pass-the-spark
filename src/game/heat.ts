import Phaser from "phaser";
import presentationJson from "../../data/presentation.json";
import { scaleTime } from "./playbackSpeed";

// The heat ladder (#133): chain spectacle that grows with the chain. Everything here is drawn on
// this player's own screen from events the table already plays back (animations.ts calls the
// on* methods below, one per event). Links and lap come from the events and the shown view, never
// recomputed; tiers and numbers come from data/presentation.json. Nothing waits on the host and
// every duration goes through scaleTime, so playback speed shortens it all, slow motion included.
// Hook points: #134 (topple, per-effect animations) adds to onChainEnd; #137 (sound) fills in heatSound.

const FONT = "Arial, Helvetica, sans-serif";
const DW = 240; // a domino at scale 1
const DH = 120;
const MAT = { x: 370, y: 400, w: 1180, h: 360 }; // the chain mat (same as CombatScene)

export type TierId = "clack" | "trails" | "sweep" | "shake" | "lightning";
interface Tier { id: TierId; minLinks: number; minLap: number; color: string }
const P = presentationJson as {
  tiers: Tier[];
  meter: { full: number; maxScale: number };
  dimAlpha: number; sweepMs: number; trailMs: number; lightningMs: number;
  shake: { ms: number; intensity: number; perLap: number };
  stackedNumbers: { step: number; growth: number; ms: number };
  slowMotion: { timeScale: number; holdMs: number };
};

export const METER_FULL = P.meter.full;
export const METER_MAX_SCALE = P.meter.maxScale;

// One call per tier event, for sound (#137). `links` rises along the chain: pitch the tick by it.
// #134 adds "topple" (once per domino as it falls, `links` counting up the fall) and "toppleTally"
// (the total settles), and one cue per effect kind: "effect:damage", "effect:block", and so on.
export type EffectCue = "damage" | "block" | "heal" | "amplify" | "echo" | "lookout" | "mimic" | "reflect" | "spectrum" | "charm";
export type HeatCue = "clack" | "tick" | "trail" | "sweep" | "shake" | "slowMotion" | "lightning" | "topple" | "toppleTally" | `effect:${EffectCue}`;
export function heatSound(_cue: HeatCue, _links: number, _lap: number): void {
  // #137 plays the sound here.
}

// The tiers that are on at this strength (links) and lap, lowest first.
export function activeTiers(links: number, lap: number): TierId[] {
  return P.tiers.filter((t) => links >= t.minLinks && lap >= t.minLap).map((t) => t.id);
}

export function heatColor(links: number, lap: number): number {
  const on = P.tiers.filter((t) => links >= t.minLinks && lap >= t.minLap);
  return on.length > 0 ? Number(on[on.length - 1].color) : 0xffffff;
}

export interface Box { x: number; y: number; w: number; h: number }

export class Heat {
  private dimTarget = 0;
  private numbers: Phaser.GameObjects.Text[] = []; // stacked damage numbers still on screen

  // `dim` is the room-dimming rectangle the scene put between the table and the chain layer.
  constructor(private scene: Phaser.Scene, private dim: Phaser.GameObjects.Rectangle) {
    scene.tweens.timeScale = 1; // a restarted scene never inherits slow motion
  }

  // The scene calls this for each chain domino it draws: glowing dominoes (links 4+). It follows
  // the shown view, so it is right after any redraw and ends with the chain.
  decorate(c: Phaser.GameObjects.Container, links: number, lap: number): void {
    if (!activeTiers(links, lap).includes("trails")) return;
    const g = this.scene.add.graphics();
    const color = heatColor(links, lap);
    for (let i = 4; i >= 1; i--) {
      g.lineStyle(i * 7, color, 0.1 + 0.02 * Math.min(links, 10));
      g.strokeRoundedRect(-DW / 2 - i * 2, -DH / 2 - i * 2, DW + i * 4, DH + i * 4, 14 + i * 2);
    }
    c.addAt(g, 0);
  }

  // The scene calls this on every chain draw: the room stays dim from lap 2 until the chain ends.
  syncRoom(links: number, lap: number): void {
    const target = activeTiers(links, lap).includes("sweep") ? P.dimAlpha : 0;
    if (target === this.dimTarget) return;
    this.dimTarget = target;
    this.scene.tweens.add({ targets: this.dim, alpha: target, duration: scaleTime(500), ease: "Cubic.easeOut" });
  }

  // A domino was played, at this strength and lap. prev/next are the chain boxes (no prev for the
  // first answer, or when the earlier domino has scrolled off the table).
  onPlay(links: number, lap: number, prev: Box | undefined, next: Box | undefined): void {
    if (!next) return;
    const on = activeTiers(links, lap);
    const color = heatColor(links, lap);
    const nx = next.x + next.w / 2;
    const ny = next.y + next.h / 2;
    const landing = scaleTime(300); // the domino has landed
    if (on.includes("clack")) {
      this.scene.time.delayedCall(landing, () => this.clack(nx, ny, color, next.w, links));
      heatSound("clack", links, lap);
      heatSound("tick", links, lap);
    }
    if (on.includes("trails") && prev) {
      this.trail(prev, next, color);
      heatSound("trail", links, lap);
    }
    if (on.includes("lightning") && prev) {
      this.scene.time.delayedCall(landing, () => this.lightning(prev, next));
      heatSound("lightning", links, lap);
    }
    if (on.includes("shake")) {
      const amount = P.shake.intensity + P.shake.perLap * (lap - 1);
      this.scene.time.delayedCall(landing, () => this.scene.cameras.main.shake(scaleTime(P.shake.ms), amount));
      heatSound("shake", links, lap);
    }
  }

  // The lap went up: a light sweep across the table (the dimmed room follows from syncRoom).
  onLapUp(lap: number): void {
    if (!activeTiers(1, lap).includes("sweep")) return;
    const g = this.scene.add.graphics().setDepth(80);
    g.fillStyle(0xffffff, 0.3);
    g.fillTriangle(0, 0, 70, 0, 10, MAT.h + 120);
    g.fillTriangle(0, 0, 10, MAT.h + 120, -60, MAT.h + 120);
    g.fillStyle(0xffffff, 0.15);
    g.fillTriangle(80, 0, 180, 0, 120, MAT.h + 120);
    g.fillTriangle(80, 0, 120, MAT.h + 120, 20, MAT.h + 120);
    g.setPosition(MAT.x - 200, MAT.y - 60);
    this.scene.tweens.add({
      targets: g, x: MAT.x + MAT.w + 200, duration: scaleTime(P.sweepMs), ease: "Sine.easeInOut",
      onComplete: () => g.destroy(),
    });
    heatSound("sweep", 0, lap);
  }

  // A damage number. Returns false when the heat is too low to stack and the caller draws its
  // ordinary floating number. At links 7+ the numbers pile up and grow.
  damageNumber(links: number, lap: number, x: number, y: number, text: string, color: string): boolean {
    if (!activeTiers(links, lap).includes("shake")) return false;
    this.numbers = this.numbers.filter((t) => t.active);
    const n = this.numbers.length;
    const size = Math.round(44 * (1 + P.stackedNumbers.growth * Math.min(links, 20)));
    const t = this.scene.add
      .text(x, y - n * P.stackedNumbers.step, text, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: "bold", color, stroke: "#101010", strokeThickness: 6 })
      .setOrigin(0.5)
      .setDepth(100 + n);
    this.numbers.push(t);
    this.scene.tweens.add({
      targets: t, y: t.y - 70, alpha: 0, duration: scaleTime(P.stackedNumbers.ms), ease: "Cubic.easeIn",
      onComplete: () => t.destroy(),
    });
    return true;
  }

  // Lap 3+: a brief slow motion after each play. The tweens slow down and the table holds a moment
  // longer. The hold is scaled by playback speed (short at 4x) and is local to this screen.
  async slowMotion(links: number, lap: number): Promise<void> {
    if (!activeTiers(links, lap).includes("lightning")) return;
    this.scene.tweens.timeScale = P.slowMotion.timeScale;
    heatSound("slowMotion", links, lap);
    await new Promise<void>((resolve) => this.scene.time.delayedCall(scaleTime(P.slowMotion.holdMs), resolve));
    this.scene.tweens.timeScale = 1;
  }

  // The chain ended: slow motion is over (the room and glow reset as the shown chain empties).
  onChainEnd(): void {
    this.scene.tweens.timeScale = 1;
  }

  // ---- the effects themselves ----

  // A burst of dashes where the domino landed; bigger as the chain grows.
  private clack(x: number, y: number, color: number, w: number, links: number): void {
    const g = this.scene.add.graphics().setDepth(95).setPosition(x, y);
    g.lineStyle(5, color, 1);
    const n = 6 + Math.min(links, 10);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.lineBetween(Math.cos(a) * (w * 0.5 + 6), Math.sin(a) * (w * 0.25 + 6), Math.cos(a) * (w * 0.5 + 22), Math.sin(a) * (w * 0.25 + 22));
    }
    this.scene.tweens.add({
      targets: g, scale: { from: 0.9, to: 1.25 }, alpha: { from: 1, to: 0 },
      duration: scaleTime(300), ease: "Cubic.easeOut", onComplete: () => g.destroy(),
    });
  }

  // Sparks that run from the previous domino to the new one.
  private trail(prev: Box, next: Box, color: number): void {
    const ax = prev.x + prev.w / 2;
    const ay = prev.y + prev.h / 2;
    for (let i = 0; i < 8; i++) {
      const dot = this.scene.add.circle(ax, ay, 9 - i * 0.7, color, 1).setDepth(96).setAlpha(0);
      this.scene.tweens.add({
        targets: dot, x: next.x + next.w / 2, y: next.y + next.h / 2,
        delay: scaleTime(i * 25), duration: scaleTime(P.trailMs), ease: "Cubic.easeIn",
        onStart: () => dot.setAlpha(1),
        onComplete: () => {
          this.scene.tweens.add({ targets: dot, alpha: 0, duration: scaleTime(150), onComplete: () => dot.destroy() });
        },
      });
    }
  }

  // A jagged bolt from the previous domino to the new one. (Phaser's own random: looks only.)
  private lightning(prev: Box, next: Box): void {
    const ax = prev.x + prev.w / 2;
    const ay = prev.y + prev.h / 2;
    const bx = next.x + next.w / 2;
    const by = next.y + next.h / 2;
    const pts = [{ x: ax, y: ay }];
    const parts = 7;
    for (let i = 1; i < parts; i++) {
      const t = i / parts;
      pts.push({ x: ax + (bx - ax) * t + Phaser.Math.Between(-22, 22), y: ay + (by - ay) * t + Phaser.Math.Between(-22, 22) });
    }
    pts.push({ x: bx, y: by });
    const g = this.scene.add.graphics().setDepth(97);
    for (const [width, color] of [[12, 0x4aa8ff], [4, 0xffffff]] as const) {
      g.lineStyle(width, color, 1);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (const q of pts.slice(1)) g.lineTo(q.x, q.y);
      g.strokePath();
    }
    this.scene.tweens.add({ targets: g, alpha: 0, duration: scaleTime(P.lightningMs), ease: "Cubic.easeIn", onComplete: () => g.destroy() });
  }
}
