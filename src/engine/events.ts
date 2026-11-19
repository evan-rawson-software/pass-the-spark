// Events: an ordered, plain-data record of what happened during a step, for the screen to animate.
// Raw events (from step / createBattleWithEvents) are the full truth. Use getEventsView
// to filter them for one player.

import type { Effect, Spark } from "./types";
import type { Side } from "./battle";

export type GameEvent =
  | { type: "roundStart"; round: number; lead: string }
  | { type: "draw"; seat: string; count: number; dominoes?: string[] } // dominoes: players only
  | { type: "enemyDiscard"; domino: string }
  | { type: "opener"; player: string; domino: string; sparks: Spark[] }
  | { type: "pass"; from: string; to: string; sparks: Spark[] }
  | { type: "lapUp"; lap: number }
  | { type: "play"; seat: string; domino: string; answeredSpark: Spark; strength: number; lap: number }
  | { type: "enemyNoReaction"; sparks: Spark[] }
  // effect is the resolved effect (a Mimic or Reflect shows what it copied); side is whose effect it is.
  // value is the number for damage, block, heal and amplify, otherwise 0.
  | { type: "trigger"; seat: string; domino: string; index: number; effect: Effect; side: Side; value: number }
  // side is the side that is hit (damage) or gains (block, heal). amount is what reached
  // health (damage), was added (block) or was actually healed (heal). blocked is what block absorbed.
  | { type: "damage"; side: Side; amount: number; blocked: number }
  | { type: "block"; side: Side; amount: number; blocked: number }
  | { type: "heal"; side: Side; amount: number; blocked: number }
  | { type: "amplify"; amount: number; strength: number }
  // A charm's extra trigger or bonus; the screen can flash its icon.
  | { type: "charm"; player: string; charm: string }
  | { type: "echoPending"; count: number }
  | { type: "reveal"; positions: number[] } // positions in the enemy's hand
  | { type: "auditor"; damage: number }
  | { type: "glutton"; heal: number } // the amount actually healed
  // A reveal event precedes this when the domino was not already revealed.
  | { type: "leftover"; domino: string; position: number }
  | { type: "blockReset" }
  | { type: "chainEnd"; reason: "cannotAnswer" }
  | { type: "battleEnd"; result: "won" | "lost" };

// The events as one player may see them. Player hands are open and enemy draws never list
// dominoes, so the raw events already show nothing hidden: an enemy domino is named only when
// it is played, discarded or leftover (going off at round end reveals it). Returns a copy.
export function getEventsView(events: GameEvent[], playerId: string): GameEvent[] {
  if (playerId === "") throw new Error("playerId needed");
  return JSON.parse(JSON.stringify(events)) as GameEvent[];
}
