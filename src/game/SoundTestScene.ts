import { fontRole } from "./fonts";
import Phaser from "phaser";
import { SOUND_CUES, playSound, stopSound } from "./sound";

// Dev page: audition every sound cue. Open with ?scene=sounds. Click once first so the browser lets audio play.
// The sequence buttons play a cue after cue with timers, like a cascade would.
export class SoundTestScene extends Phaser.Scene {
  constructor() {
    super("soundTest");
  }

  create(): void {
    this.add.text(40, 30, "Sound audition page (click a cue)", { ...fontRole(36), color: "#ffffff" });
    const btn = (x: number, y: number, label: string, fn: () => void, w = 340): void => {
      const t = this.add
        .text(x, y, label, { ...fontRole(22), color: "#ffffff", backgroundColor: "#2f6d52", padding: { x: 10, y: 6 }, fixedWidth: w })
        .setInteractive({ useHandCursor: true });
      t.on("pointerdown", fn);
    };

    // Sequences first.
    const seq = (steps: Array<() => void>, gapMs: number): void => {
      steps.forEach((fn, i) => this.time.delayedCall(i * gapMs, fn));
    };
    btn(40, 100, "15-step climb: combo:hit", () => seq(Array.from({ length: 15 }, (_, i) => () => playSound("combo:hit", i + 1)), 110), 440);
    btn(500, 100, "15-step climb: combo:block", () => seq(Array.from({ length: 15 }, (_, i) => () => playSound("combo:block", i + 1)), 110), 440);
    btn(960, 100, "coin shower (12)", () => seq(Array.from({ length: 12 }, () => () => playSound("combo:coin")), 70), 440);
    btn(1420, 100, "charge, stop after 1s", () => { playSound("combo:charge"); this.time.delayedCall(1000, () => stopSound("combo:charge")); }, 440);
    btn(40, 160, "tier stingers 1-4", () => seq([1, 2, 3, 4].map((t) => () => playSound(`combo:tier${t}`)), 1200), 440);
    btn(500, 160, "slam by tier (gain .4 .6 .8 1)", () => seq([0.4, 0.6, 0.8, 1].map((g) => () => playSound("combo:slam", 1, g)), 1500), 440);
    btn(960, 160, "fanfares 0-4 + lethal", () => seq(["0", "1", "2", "3", "4", "Lethal"].map((t) => () => playSound(`combo:fanfare${t}`)), 3000), 440);

    // One button per cue.
    SOUND_CUES.forEach((cue, i) => {
      const x = 40 + (i % 5) * 370;
      const y = 250 + Math.floor(i / 5) * 56;
      btn(x, y, cue, () => playSound(cue, 1 + Math.floor(Math.random() * 5)), 350);
    });
  }
}
