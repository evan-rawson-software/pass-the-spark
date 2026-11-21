import presentation from "../../data/presentation.json";

// Tuning for the screen's look (data/presentation.json). Each feature reads only its own part.

export const comfortData = presentation.comfort;
export const fxData = presentation.fx;
export const dominoLook = presentation.dominoLook;

// "#rrggbb" to a Phaser colour number.
export function hexColour(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

export const reactionData = presentation.enemyReactions;

export const speedControlData = presentation.speedControl;

export const setOffPreviewData = presentation.setOffPreview;

export const fuseBoardData = presentation.fuseBoard;
export const handRowData = presentation.handRow;
export const combatLayoutData = presentation.combatLayout;
export const wizardLookData = presentation.wizardLook;
export const combatData = presentation.combat;
