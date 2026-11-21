import presentation from "../../data/presentation.json";

// Tuning for the screen's look (data/presentation.json). Each feature reads only its own part.

export const seatColourData = presentation.seatColours;
export const comfortData = presentation.comfort;
export const fxData = presentation.fx;

// "#rrggbb" to a Phaser colour number.
export function hexColour(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

export const reactionData = presentation.enemyReactions;
