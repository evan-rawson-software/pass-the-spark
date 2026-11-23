import { shrinkToRole } from "./fonts";
import Phaser from "phaser";
import type { Refs } from "./animations";
import type { DominoState } from "./dominoDrawing";
import type { PingTarget } from "../net/protocol";
import type { Tooltip } from "./tooltip";
import type { BarKind } from "./kit";
import type { Stand } from "./enemyUnit";

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
  // A kit health or block bar (w in grid pixels), registered under `key` so the animations can repaint it.
  bar(layer: Layer, key: string, x: number, y: number, w: number, kind: BarKind, value: number, max: number): void;
  shield(layer: Layer, key: string, x: number, y: number, s: number, amount: number): void;
  drawBody(layer: Layer, id: string, tier: string, stand: Stand): void;
  // A domino drawn at scale k with its pings; `tip` false leaves off the text tooltip.
  domino(layer: Layer, id: string, k: number, state: DominoState, x: number, y: number, onClick?: () => void, ping?: PingTarget, owner?: string, tip?: boolean): Phaser.GameObjects.Container;
  slots(seat: string): { c: Phaser.GameObjects.Container; pos: { x: number; y: number; k: number } }[];
  nameOf(seat: string, forPlate?: boolean, max?: number): string;
  isAway(seat: string): boolean;
  // Marks where a seat's deck is, so its draw animation flies from there: `text` shows the count.
  deckSpot(layer: Layer, seat: string, x: number, y: number, text: Phaser.GameObjects.Text): void;
  openDeck(seat: string): void;
  // The cascade reached the line and the slam has not yet staggered the enemy: the intent card still shows the full attack.
  staggerHeld(): boolean;
}

// A text object's size, shrunk so it is at most `maxW` wide.
export function fitText(t: Phaser.GameObjects.Text, maxW: number): void {
  shrinkToRole(t, maxW);
}
