import Phaser from "phaser";
import presentationJson from "../../data/presentation.json";
import { scaleTime } from "./playbackSpeed";
import { heatSound } from "./heat";
import type { EffectCue } from "./heat";

// Short, distinct, code-drawn animations (#134): one per effect kind, and the chain-end topple.
// Purely visual and driven by engine events (the Animator in animations.ts calls these); every
// duration goes through scaleTime and nothing here ever waits on the host. No rules in here.

const FONT = "Arial, Helvetica, sans-serif";
const DEPTH = 95;
const P = presentationJson as {
  topple: { stepMs: number; maxMs: number; fallMs: number; tallyPopMs: number; holdMs: number };
  effects: { travelMs: number; ms: number };
};

export interface Box { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }

const centre = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

function done(g: Phaser.GameObjects.GameObject): () => void {
  return () => g.destroy();
}

// ---- one animation per effect kind ----

// Where things are for one effect: `from` is the domino whose effect goes off, `to` what it hits
// or fills (the enemy's or party's bar or shield), `prev` the domino before it (for Mimic), and
// `enemyRow` the enemy's hand (for Lookout).
export interface EffectTargets { from: Box; to?: Point; prev?: Box; enemyRow?: Box }

export function playEffect(scene: Phaser.Scene, kind: EffectCue, t: EffectTargets, links: number, lap: number): void {
  heatSound(`effect:${kind}`, links, lap);
  const from = centre(t.from);
  switch (kind) {
    case "damage": return damage(scene, from, t.to);
    case "block": return block(scene, from, t.to);
    case "heal": return heal(scene, t.to ?? from);
    case "amplify": return amplify(scene, from);
    case "echo": return echo(scene, from);
    case "lookout": return lookout(scene, from, t.enemyRow);
    case "mimic": return mimic(scene, t.from, t.prev);
    case "reflect": return reflect(scene, t.from);
    case "spectrum": return spectrum(scene, from);
    case "charm": return charm(scene, from);
  }
}

// A red shot flies to the target and bursts into a jagged star with two slash marks.
function damage(scene: Phaser.Scene, from: Point, to?: Point): void {
  const shot = scene.add.circle(from.x, from.y, 14, 0xff3b2f).setDepth(DEPTH);
  const burst = (at: Point) => {
    const g = scene.add.graphics().setDepth(DEPTH).setPosition(at.x, at.y);
    g.fillStyle(0xff3b2f, 0.9);
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 === 0 ? 46 : 18;
      if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fillPath();
    g.lineStyle(7, 0xffffff, 1);
    g.lineBetween(-50, -34, 50, 34);
    g.lineBetween(-50, 34, 50, -34);
    scene.tweens.add({
      targets: g, scale: { from: 0.4, to: 1.3 }, alpha: { from: 1, to: 0 },
      duration: scaleTime(P.effects.ms), ease: "Cubic.easeOut", onComplete: done(g),
    });
  };
  if (!to) { shot.destroy(); return burst(from); }
  scene.tweens.add({
    targets: shot, x: to.x, y: to.y, duration: scaleTime(P.effects.travelMs), ease: "Cubic.easeIn",
    onComplete: () => { shot.destroy(); burst(to); },
  });
}

// A blue shield shape pops up where the block lands.
function block(scene: Phaser.Scene, from: Point, to?: Point): void {
  const at = to ?? from;
  const g = scene.add.graphics().setDepth(DEPTH).setPosition(at.x, at.y).setAlpha(0);
  g.fillStyle(0x4a6fa5, 0.85);
  g.lineStyle(6, 0xdbe6f5, 1);
  const shape = [[-34, -38], [34, -38], [34, 4], [0, 44], [-34, 4]];
  g.beginPath();
  shape.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
  g.fillPath();
  g.strokePath();
  scene.tweens.add({
    targets: g, alpha: { from: 1, to: 0 }, scale: { from: 0.3, to: 1.4 },
    duration: scaleTime(P.effects.ms + 150), ease: "Back.easeOut", onStart: () => g.setAlpha(1), onComplete: done(g),
  });
}

// Green plus signs drift up from the health bar.
function heal(scene: Phaser.Scene, at: Point): void {
  for (let i = 0; i < 5; i++) {
    const x = at.x + (i - 2) * 34;
    const g = scene.add.graphics().setDepth(DEPTH).setPosition(x, at.y + 10).setAlpha(0);
    g.fillStyle(0x4fe07a, 1);
    g.fillRect(-4, -15, 8, 30);
    g.fillRect(-15, -4, 30, 8);
    scene.tweens.add({
      targets: g, y: at.y - 60, alpha: { from: 1, to: 0 },
      delay: scaleTime(i * 60), duration: scaleTime(P.effects.ms + 250), ease: "Cubic.easeOut",
      onStart: () => g.setAlpha(1), onComplete: done(g),
    });
  }
}

// Three orange chevrons rise from the domino: the chain just got stronger.
function amplify(scene: Phaser.Scene, at: Point): void {
  for (let i = 0; i < 3; i++) {
    const g = scene.add.graphics().setDepth(DEPTH).setPosition(at.x + (i - 1) * 40, at.y + 20).setAlpha(0);
    g.lineStyle(10, 0xf08a00, 1);
    g.beginPath();
    g.moveTo(-18, 8);
    g.lineTo(0, -10);
    g.lineTo(18, 8);
    g.strokePath();
    scene.tweens.add({
      targets: g, y: at.y - 80, alpha: { from: 1, to: 0 },
      delay: scaleTime(i * 90), duration: scaleTime(P.effects.ms + 150), ease: "Cubic.easeOut",
      onStart: () => g.setAlpha(1), onComplete: done(g),
    });
  }
}

// Echo: rings that close in on the domino, as if the sound is gathering to come back.
function echo(scene: Phaser.Scene, at: Point): void {
  for (let i = 0; i < 3; i++) {
    const g = scene.add.graphics().setDepth(DEPTH).setPosition(at.x, at.y).setAlpha(0);
    g.lineStyle(6, 0x4fd8ff, 1);
    g.strokeCircle(0, 0, 90);
    scene.tweens.add({
      targets: g, scale: { from: 1.6, to: 0.3 }, alpha: { from: 0.9, to: 0 },
      delay: scaleTime(i * 110), duration: scaleTime(P.effects.ms), ease: "Cubic.easeIn",
      onStart: () => g.setAlpha(0.9), onComplete: done(g),
    });
  }
}

// Lookout: an eye opens over the domino and a pale beam sweeps across the enemy's hand.
function lookout(scene: Phaser.Scene, at: Point, row?: Box): void {
  const eye = scene.add.graphics().setDepth(DEPTH).setPosition(at.x, at.y);
  eye.lineStyle(7, 0xffffff, 1);
  eye.fillStyle(0x3b5b92, 1);
  eye.beginPath();
  for (let i = 0; i <= 12; i++) {
    const x = -50 + (100 * i) / 12;
    const y = -26 * (1 - Math.pow(x / 50, 2));
    if (i === 0) eye.moveTo(x, y);
    else eye.lineTo(x, y);
  }
  for (let i = 12; i >= 0; i--) {
    const x = -50 + (100 * i) / 12;
    eye.lineTo(x, 26 * (1 - Math.pow(x / 50, 2)));
  }
  eye.closePath();
  eye.fillPath();
  eye.strokePath();
  eye.fillStyle(0xffffff, 1);
  eye.fillCircle(0, 0, 12);
  scene.tweens.add({
    targets: eye, scaleY: { from: 0.1, to: 1 }, alpha: { from: 1, to: 0 },
    duration: scaleTime(P.effects.ms + 150), ease: "Cubic.easeOut", onComplete: done(eye),
  });
  if (!row) return;
  const beam = scene.add.rectangle(row.x, row.y + row.h / 2, 26, row.h + 20, 0xdff3ff, 0.55).setDepth(DEPTH);
  scene.tweens.add({
    targets: beam, x: row.x + row.w, alpha: 0,
    duration: scaleTime(P.effects.ms + 150), ease: "Sine.easeInOut", onComplete: done(beam),
  });
}

// Mimic: a purple ghost of the previous domino slides into this one.
function mimic(scene: Phaser.Scene, to: Box, prev?: Box): void {
  const src = prev ?? to;
  const ghost = scene.add.rectangle(src.x + src.w / 2, src.y + src.h / 2, src.w, src.h, 0xc77dff, 0.55).setDepth(DEPTH);
  ghost.setStrokeStyle(5, 0xe9ccff, 1);
  const c = centre(to);
  scene.tweens.add({
    targets: ghost, x: c.x, y: c.y, alpha: 0,
    duration: scaleTime(P.effects.ms + 100), ease: "Cubic.easeInOut", onComplete: done(ghost),
  });
}

// Reflect: a bright slanted glint sweeps across the domino, like light off a mirror.
function reflect(scene: Phaser.Scene, to: Box): void {
  const bar = scene.add.rectangle(to.x - 20, to.y + to.h / 2, 22, to.h + 30, 0xffd9a8, 0.85).setDepth(DEPTH).setAngle(20);
  scene.tweens.add({
    targets: bar, x: to.x + to.w + 20, alpha: 0.2,
    duration: scaleTime(P.effects.ms), ease: "Sine.easeInOut", onComplete: done(bar),
  });
}

// Spectrum: orange, blue and green rings, one after the other.
function spectrum(scene: Phaser.Scene, at: Point): void {
  [0xff6a13, 0x2f80ed, 0x4cc46a].forEach((color, i) => {
    const g = scene.add.graphics().setDepth(DEPTH).setPosition(at.x, at.y).setAlpha(0);
    g.lineStyle(8, color, 1);
    g.strokeCircle(0, 0, 60);
    scene.tweens.add({
      targets: g, scale: { from: 0.5, to: 2 }, alpha: { from: 1, to: 0 },
      delay: scaleTime(i * 110), duration: scaleTime(P.effects.ms), ease: "Cubic.easeOut",
      onStart: () => g.setAlpha(1), onComplete: done(g),
    });
  });
}

// A charm triggers: a ring and a little burst of stars around its icon.
function charm(scene: Phaser.Scene, at: Point): void {
  const g = scene.add.graphics().setDepth(DEPTH).setPosition(at.x, at.y);
  g.lineStyle(4, 0xffe14d, 1);
  g.strokeCircle(0, 0, 26);
  g.fillStyle(0xfff6b0, 1);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.fillTriangle(Math.cos(a) * 34, Math.sin(a) * 34 - 7, Math.cos(a) * 34 - 5, Math.sin(a) * 34 + 5, Math.cos(a) * 34 + 5, Math.sin(a) * 34 + 5);
  }
  scene.tweens.add({
    targets: g, scale: { from: 0.6, to: 1.8 }, alpha: { from: 1, to: 0 },
    duration: scaleTime(P.effects.ms + 100), ease: "Cubic.easeOut", onComplete: done(g),
  });
}

// ---- the chain-end topple ----

export interface ToppleLink { c: Phaser.GameObjects.Container; w: number }
export interface Tally { damage: number; block: number }

// The chain's dominoes fall back along the line, last to first, while the chain's damage and block
// count up from `tally` (one entry per domino, from the engine's damage and block events; `extra`
// is what dominoes that have scrolled off the table did). Resolves when the fall and a short hold
// on the total are over.
export async function topple(
  scene: Phaser.Scene, links: ToppleLink[], tally: Tally[], extra: Tally, color: number, at: Point, lap: number,
): Promise<void> {
  if (links.length === 0) return;
  const step = Math.min(P.topple.stepMs, P.topple.maxMs / links.length);
  const total: Tally = { damage: 0, block: 0 };
  const pill = scene.add.graphics().setDepth(120).setPosition(at.x, at.y).setAlpha(0);
  pill.fillStyle(0x101010, 0.7);
  pill.fillRoundedRect(-170, -62, 340, 124, 24);
  pill.lineStyle(5, color, 1);
  pill.strokeRoundedRect(-170, -62, 340, 124, 24);
  const text = (y: number, fill: string) =>
    scene.add
      .text(at.x, at.y + y, "", { fontFamily: FONT, fontSize: "46px", fontStyle: "bold", color: fill, stroke: "#101010", strokeThickness: 6 })
      .setOrigin(0.5)
      .setDepth(121);
  const dmgText = text(-26, "#ff6a5f");
  const blkText = text(26, "#9cc4ff");
  const paint = () => {
    dmgText.setText(`${total.damage} damage`).setVisible(total.damage > 0);
    blkText.setText(`${total.block} block`).setVisible(total.block > 0);
    pill.setAlpha(total.damage > 0 || total.block > 0 ? 1 : 0);
    for (const t of [dmgText, blkText]) {
      t.setScale(1.25);
      scene.tweens.add({ targets: t, scale: 1, duration: scaleTime(P.topple.tallyPopMs), ease: "Back.easeOut" });
    }
  };
  paint();
  pill.setAlpha(0);
  const last = links.length - 1;
  await Promise.all(
    links.map(
      (l, i) =>
        new Promise<void>((resolve) => {
          const k = last - i; // the last domino falls first
          const t = tally[i] ?? { damage: 0, block: 0 };
          scene.tweens.add({
            targets: l.c, rotation: -1.3, x: l.c.x - l.w * 0.35, y: l.c.y + 10, scaleY: l.c.scaleY * 0.8, alpha: 0.1,
            delay: scaleTime(k * step), duration: scaleTime(P.topple.fallMs), ease: "Cubic.easeIn",
            onStart: () => {
              heatSound("topple", k + 1, lap);
              if (i === 0) {
                total.damage += extra.damage;
                total.block += extra.block;
              }
              total.damage += t.damage;
              total.block += t.block;
              if (t.damage > 0 || t.block > 0 || i === 0) paint();
            },
            onComplete: () => resolve(),
          });
        }),
    ),
  );
  heatSound("toppleTally", links.length, lap);
  await new Promise<void>((resolve) => scene.time.delayedCall(scaleTime(P.topple.holdMs), resolve));
  scene.tweens.add({
    targets: [pill, dmgText, blkText], alpha: 0, duration: scaleTime(250),
    onComplete: () => { pill.destroy(); dmgText.destroy(); blkText.destroy(); },
  });
}
