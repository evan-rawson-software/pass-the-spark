import Phaser from "phaser";
import presentation from "../../data/presentation.json";
import { reducedFlashing } from "./comfort";
import { fxFallback } from "./fx";
import { scaleTime } from "./playbackSpeed";

// The seat glow (#189): a soft glow in a seat's colour over a domino as the charge passes it, bigger and
// longer when a cap goes off. Visual only; sizes, times and alphas are in data/presentation.json
// ("projectiles"). The caps' effects themselves now fly into the combo number (comboHype.ts, #234).

const D = presentation.projectiles as unknown as {
  seatGlow: { sizeFactor: number; ms: number; alpha: number; capFactor: number; capMs: number; reducedAlpha: number; reducedMs: number };
};
interface Point { x: number; y: number }

// A soft glow in a seat's colour over a domino (or, bigger and longer, a cap as it goes off).
export function seatGlow(scene: Phaser.Scene, at: Point, width: number, colour: number, cap = false): void {
  const soft = reducedFlashing();
  const g = D.seatGlow;
  const o = fxFallback(scene, "glow", at.x, at.y, width * (cap ? g.capFactor : g.sizeFactor), colour).setDepth(89);
  if (!soft) o.setBlendMode(Phaser.BlendModes.ADD);
  o.setAlpha(soft ? g.reducedAlpha : g.alpha);
  scene.tweens.add({
    targets: o, alpha: 0, scale: cap ? 1.3 : 1.1, duration: scaleTime(soft ? g.reducedMs : cap ? g.capMs : g.ms),
    ease: "Cubic.easeOut", onComplete: () => o.destroy(),
  });
}

