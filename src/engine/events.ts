// Events: an ordered, plain-data record of what happened during a step, for the screen to animate.
// Raw events (from step / createBattleWithEvents) are the full truth. Use getEventsView
// to filter them for one player.

import type { Effect, Spark } from "./types";
import type { Side } from "./battle";

export type GameEvent =
  | { type: "roundStart"; round: number; lead: string }
  | { type: "draw"; seat: string; count: number; dominoes?: string[] } // dominoes: players only
  | { type: "enemyDiscard"; domino: string }
  | { type: "fuse"; player: string; domino: string; sparks: Spark[] }
  | { type: "pass"; from: string; to: string; sparks: Spark[] }
  | { type: "lapUp"; lap: number }
  | { type: "play"; seat: string; domino: string; answeredSpark: Spark; strength: number; lap: number }
  | { type: "enemyNoReaction"; sparks: Spark[] }
  // effect is the resolved effect (a Mimic or Reflect shows what it copied); side is whose effect it is.
  // value is the number for damage, block, heal and amplify, otherwise 0.
  | { type: "trigger"; seat: string; domino: string | null; index: number; effect: Effect; side: Side; value: number }
  // side is the side that is hit (damage) or gains (block, heal). amount is what reached
  // health (damage), was added (block) or was actually healed (heal). blocked is what block absorbed.
  | { type: "damage"; side: Side; amount: number; blocked: number }
  | { type: "block"; side: Side; amount: number; blocked: number }
  | { type: "heal"; side: Side; amount: number; blocked: number }
  | { type: "amplify"; amount: number; strength: number }
  | { type: "echoPending"; count: number }
  | { type: "reveal"; positions: number[] } // positions in the enemy's hand
  | { type: "auditor"; damage: number }
  | { type: "glutton"; heal: number } // the amount actually healed
  // revealed: whether the players already knew this domino (a Lookout revealed it).
  | { type: "leftover"; domino: string | null; position: number; revealed: boolean }
  | { type: "blockReset" }
  | { type: "chainEnd"; reason: "cannotAnswer" }
  | { type: "battleEnd"; result: "won" | "lost" };

// The events as one player may see them. Player hands are open, so nothing is hidden from
// players. Enemy draws never list dominoes. An enemy leftover that was not revealed goes off
// without naming its domino, and neither do the trigger events it causes.
// Returns a copy; the input is not changed.
export function getEventsView(events: GameEvent[], playerId: string): GameEvent[] {
  if (playerId === "") throw new Error("playerId needed");
  const out: GameEvent[] = [];
  let hiddenLeftover = false;
  for (const e of JSON.parse(JSON.stringify(events)) as GameEvent[]) {
    if (e.type === "leftover") {
      hiddenLeftover = !e.revealed;
      if (hiddenLeftover) e.domino = null;
    } else if (e.type === "trigger" && hiddenLeftover) {
      e.domino = null;
    } else if (e.type === "blockReset" || e.type === "battleEnd") {
      hiddenLeftover = false;
    }
    out.push(e);
  }
  return out;
}
