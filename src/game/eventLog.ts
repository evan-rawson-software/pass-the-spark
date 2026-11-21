import type { GameEvent } from "../engine/events";

// Says how long to pause on each engine event. Timing only: no rules.

// What has to be remembered between events to time them.
export interface LogMemory {
  enemyActing: boolean; // the enemy's intent is being carried out
}

export function newLogMemory(): LogMemory {
  return { enemyActing: false };
}

// Follows the events so eventDelay knows when the enemy is acting.
export function trackEvent(ev: GameEvent, mem: LogMemory): void {
  if (ev.type === "enemyAction") mem.enemyActing = true;
  else if (ev.type === "roundStart" || ev.type === "setOff") mem.enemyActing = false;
}

// How long to pause after an event, in milliseconds at 1x. A player's own play and the caps going
// off within one cascade step do not pause: a step's nodes light up together.
export function eventDelay(ev: GameEvent, mem: LogMemory): number {
  switch (ev.type) {
    case "roundStart": return 800;
    case "setOff": return 500;
    case "cascadeStep": return 450;
    case "fizzle": return 150;
    case "enemyAction": return 600;
    case "blockReset": return 300;
    case "battleEnd": return 900;
    case "passive": return 450;
    case "damage":
    case "block":
      return mem.enemyActing ? 450 : 120;
    default: return 0;
  }
}
