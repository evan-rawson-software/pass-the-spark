// Events: an ordered, plain-data record of what happened during a step, for the screen to animate.
// Raw events (from step / createBattleWithEvents) are the full truth. Use getEventsView
// to filter them for one player.

import type { CapEffectKind, Intent, Spark } from "./types";

export type GameEvent =
  | { type: "roundStart"; round: number }
  | { type: "intent"; intent: Intent } // what the enemy will do after this round's cascade
  | { type: "draw"; player: string; count: number; dominoes: string[] }
  | { type: "reshuffle"; player: string } // the player's discard pile became their deck, mid-draw
  // node and end index the board; end is null for the opener. A play uses one of the owner's placements. charge is the charge after an amplifier or junction,
  // or the charge reaching a cap.
  | { type: "play"; player: string; domino: string; node: number; end: number | null; depth: number; charge: number }
  // A player took one of their own nodes back: the domino is in their hand again and the placement is refunded.
  // node is the node's index before it left the board (the later nodes close up by one).
  | { type: "takeBack"; player: string; domino: string; node: number }
  // A player set Ready on or off (while Ready they can't place or take back).
  | { type: "ready"; player: string; ready: boolean }
  // The chain goes off, because the last player became Ready.
  | { type: "setOff"; reason: "ready" }
  | { type: "cascadeStep"; depth: number }
  // hit is what the domino hits for as it lights: an amplifier or junction its outgoing charge, a damage cap its value per
  // trigger (before enemy block), a block cap 0. A `damage` event follows for each hit.
  | { type: "nodeLit"; node: number; domino: string; owner: string; charge: number; hit: number }
  // A cap goes off: value per trigger, then one damage or block event for each trigger.
  | { type: "capFired"; node: number; domino: string; owner: string; effect: CapEffectKind; value: number; triggers: number }
  // side is the side that is hit. amount reached its health; blocked is what block absorbed. Every enemy hit of the cascade
  // (amplifier, junction and cap) is one of these: amount + blocked is the hit value.
  | { type: "damage"; side: "party" | "enemy"; amount: number; blocked: number }
  | { type: "block"; side: "party" | "enemy"; amount: number }
  | { type: "charm"; player: string; charm: string } // a charm changed the node just lit (or, for Hall of Mirrors, the junction just played); the screen can flash its icon
  | { type: "fizzle"; end: number; spark: Spark; charge: number } // an open end the cascade left uncapped
  // The combo total (every hit so far, before block) first reached the enemy's line: it is staggered for this round.
  | { type: "lineReached"; total: number; line: number }
  // intent is what the enemy carries out (attack hits halved when staggered); fullIntent is the same before halving.
  // Followed by the enemy's block and damage events.
  | { type: "enemyAction"; intent: Intent; fullIntent: Intent; staggered: boolean }
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
