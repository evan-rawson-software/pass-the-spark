// The rolling animation for a drawn vote. Presentation only: the engine already decided the winner
// (and the vote counts) and this only highlights the voted options one after another, ending on it.
// Each vote is one slot, so an option with more votes comes up more often. Delays follow the playback speed.
import Phaser from "phaser";
import { scaleTime } from "./playbackSpeed";
import { playSound } from "./sound";

export interface RollSpot {
  option: number;
  x: number; // centre of the highlight
  y: number;
  w: number;
  h: number;
}

const STEPS = 14;

export function playVoteRoll(scene: Phaser.Scene, spots: RollSpot[], counts: Record<number, number>, winner: number, onDone: () => void): void {
  const slots: number[] = [];
  for (const spot of spots) for (let i = 0; i < (counts[spot.option] ?? 0); i++) slots.push(spot.option);
  const last = slots.indexOf(winner);
  if (last < 0 || spots.length === 0) return onDone();
  const start = (((last - STEPS) % slots.length) + slots.length) % slots.length;
  const ring = scene.add.graphics().setDepth(50);
  const show = (step: number): void => {
    playSound("voteRoll");
    const spot = spots.find((s) => s.option === slots[(start + step) % slots.length]);
    ring.clear();
    if (spot) {
      ring.lineStyle(8, 0xffd36b, 1);
      ring.strokeRoundedRect(spot.x - spot.w / 2, spot.y - spot.h / 2, spot.w, spot.h, 12);
    }
    if (step === STEPS) {
      scene.time.delayedCall(scaleTime(500), () => {
        ring.destroy();
        onDone();
      });
    } else {
      scene.time.delayedCall(scaleTime(70 + step * 18), () => show(step + 1));
    }
  };
  show(0);
}
