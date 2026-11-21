import Phaser from "phaser";
import type { Refs } from "./animations";
import type { DominoState } from "./dominoDrawing";
import type { PingTarget } from "../net/protocol";
import type { Tooltip } from "./tooltip";

// What the combat layout files (enemyUnit.ts, seatTabs.ts, combatHud.ts) need from the scene: drawing
// helpers that put things in the scene's redrawn layer and register them with the animator. The scene
// supplies it; these files hold layout only, no rules.

export type Layer = Phaser.GameObjects.Container;

export interface CombatCtx {
  scene: Phaser.Scene;
  tooltip: Tooltip;
  refs: () => Refs;
  label(layer: Layer, x: number, y: number, text: string, size: number, color?: string, originX?: number, bold?: boolean): Phaser.GameObjects.Text;
  gfx(layer: Layer): Phaser.GameObjects.Graphics;
  bar(layer: Layer, key: string, x: number, y: number, w: number, h: number, value: number, max: number, color: number, fontSize?: number): void;
  shield(layer: Layer, key: string, x: number, y: number, s: number, amount: number): void;
  drawBody(layer: Layer, id: string, tier: string, spot: { x: number; y: number; size: number }): void;
  // A domino drawn at scale k with its pings; `tip` false leaves off the text tooltip.
  domino(layer: Layer, id: string, k: number, state: DominoState, x: number, y: number, onClick?: () => void, ping?: PingTarget, owner?: string, tip?: boolean): Phaser.GameObjects.Container;
  slots(seat: string): { c: Phaser.GameObjects.Container; pos: { x: number; y: number; k: number } }[];
  nameOf(seat: string, forPlate?: boolean, max?: number): string;
  isAway(seat: string): boolean;
  // Marks where a seat's deck is, so its draw animation flies from there: `text` shows the count.
  deckSpot(layer: Layer, seat: string, x: number, y: number, text: Phaser.GameObjects.Text): void;
  openDeck(seat: string): void;
}

// A text object's size, shrunk so it is at most `maxW` wide.
export function fitText(t: Phaser.GameObjects.Text, maxW: number): void {
  if (t.width > maxW) t.setFontSize(Math.max(8, Math.floor((parseInt(String(t.style.fontSize), 10) * maxW) / t.width)));
}
