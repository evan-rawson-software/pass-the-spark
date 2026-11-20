// Events: an ordered, plain-data record of what happened during a step, for the screen to animate.
// Raw events (from step / createBattleWithEvents) are the full truth. Use getEventsView
// to filter them for one player.

import type { CapEffectKind, Intent, Spark } from "./types";

export type GameEvent =
  | { type: "roundStart"; round: number; lead: string }
  | { type: "intent"; intent: Intent } // what the enemy will do after this round's cascade
  | { type: "draw"; player: string; count: number; dominoes: string[] }
  | { type: "reshuffle"; player: string } // the player's discard pile became their deck, mid-draw
  // node and end index the board; end is null for the opener. charge is the charge after an amplifier or junction,
  // or the charge reaching a cap.
  | { type: "play"; player: string; domino: string; node: number; end: number | null; depth: number; charge: number }
  | { type: "pass"; player: string }
  // The chain goes off: by a player's choice, because every end is capped, or because everyone passed in a row.
  | { type: "setOff"; reason: "player" | "capped" | "passes"; player?: string }
  | { type: "cascadeStep"; depth: number }
  | { type: "nodeLit"; node: number; domino: string; owner: string; charge: number }
  // A cap goes off: value per trigger, then one damage, block or coins event for each trigger.
  | { type: "capFired"; node: number; domino: string; owner: string; effect: CapEffectKind; value: number; triggers: number }
  // side is the side that is hit. amount reached its health; blocked is what block absorbed.
  | { type: "damage"; side: "party" | "enemy"; amount: number; blocked: number }
  | { type: "block"; side: "party" | "enemy"; amount: number }
  | { type: "coinsGained"; player: string; amount: number }
  | { type: "fizzle"; end: number; spark: Spark; charge: number } // an open end the cascade left uncapped
  | { type: "enemyAction"; intent: Intent } // followed by the enemy's block and damage events
  // A boss passive acted. amount: auditor = damage dealt to the party (a damage event follows), glutton = health healed,
  // hoarder = block gained (a block event follows), smolder and longNight = added to each attack hit. warden: spark is locked.
  | { type: "passive"; passive: "auditor" | "glutton" | "hoarder" | "smolder" | "longNight" | "warden"; amount?: number; spark?: Spark }
  | { type: "blockReset"; side: "party" | "enemy" }
  | { type: "battleEnd"; result: "won" | "lost" };

// The events as one player may see them. Everything is open information (hands, intents), so the
// raw events already show nothing hidden. Returns a copy.
export function getEventsView(events: GameEvent[], playerId: string): GameEvent[] {
  if (playerId === "") throw new Error("playerId needed");
  return JSON.parse(JSON.stringify(events)) as GameEvent[];
}
