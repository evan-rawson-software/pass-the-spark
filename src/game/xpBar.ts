import Phaser from "phaser";
import { levelProgress } from "../engine/progression";
import { content } from "./devBattle";
import { label } from "./ui";

// The level and experience bar (#132), drawn from the engine's levelProgress. Used on the start
// screen (still) and the run end screen (the bar fills from one total to another).

const data = content.progression;
const HEIGHT = 26;

export interface XpBar {
  setExperience(experience: number): void;
  // Fills the bar from one total to another, rolling over levels; done runs when it has finished.
  animate(from: number, to: number, done?: () => void): void;
}

// A bar centred on x. Shows "Level N", the experience, and the unlock the next level gives.
export function drawXpBar(scene: Phaser.Scene, x: number, y: number, width: number, experience: number): XpBar {
  const g = scene.add.graphics();
  const levelText = label(scene, x, y, "", 44, { bold: true, origin: 0.5 });
  const nextText = label(scene, x, y + 78, "", 28, { origin: 0.5, color: "#9fd1b8" });
  const left = x - width / 2;
  const top = y + 34;
  const setExperience = (xp: number) => {
    const p = levelProgress(data, xp);
    const fraction = p.to === null ? 1 : (xp - p.from) / (p.to - p.from);
    g.clear();
    g.fillStyle(0x0d2a20, 1).fillRoundedRect(left, top, width, HEIGHT, 8);
    g.fillStyle(0xffe14d, 1).fillRoundedRect(left, top, Math.max(0, width * fraction), HEIGHT, 8);
    levelText.setText(`Level ${p.level}`);
    nextText.setText(p.to === null || p.next === null ? "Everything is unlocked" : `${Math.floor(xp)} / ${p.to}   Next: ${p.next.name}`);
  };
  setExperience(experience);
  return {
    setExperience,
    animate(from, to, done) {
      const t = { xp: from };
      scene.tweens.add({
        targets: t,
        xp: to,
        duration: Math.min(3000, 800 + (to - from) * 6),
        ease: "Sine.easeInOut",
        onUpdate: () => setExperience(t.xp),
        onComplete: () => {
          setExperience(to);
          done?.();
        },
      });
    },
  };
}
