import type { GameEvent } from "../engine/events";

// Says how long to pause on each engine event. Timing only: no rules.

// What has to be remembered between events to time them.
export interface LogMemory {
  enemyActing: boolean; // the enemy's play or a round-end leftover is being shown
}

export function newLogMemory(): LogMemory {
  return { enemyActing: false };
}

const ENEMY = "enemy";

// Follows the events so eventDelay knows when the enemy is acting.
export function trackEvent(ev: GameEvent, mem: LogMemory): void {
  switch (ev.type) {
    case "roundStart":
    case "opener":
      mem.enemyActing = false;
      break;
    case "pass":
      if (ev.from !== ENEMY) mem.enemyActing = false;
      break;
    case "play":
      mem.enemyActing = ev.seat === ENEMY;
      break;
    case "leftover":
      mem.enemyActing = true;
      break;
    default:
      break;
  }
}

// How long to pause after an event, in milliseconds at 1x. Player-driven events do not pause.
export function eventDelay(ev: GameEvent, mem: LogMemory): number {
  switch (ev.type) {
    case "roundStart": return 800;
    case "draw": return 300;
    case "enemyDiscard": return 300;
    case "pass": return 250;
    case "lapUp": return 300;
    case "play": return ev.seat === ENEMY ? 700 : 0;
    case "enemyNoReaction": return 600;
    case "leftover": return 600;
    case "chainEnd": return 900;
    case "blockReset": return 300;
    case "battleEnd": return 900;
    case "reveal": return 250;
    case "trigger": return mem.enemyActing && ev.effect.kind !== "damage" && ev.effect.kind !== "block" && ev.effect.kind !== "heal" ? 400 : 0;
    case "damage":
    case "block":
    case "heal":
    case "amplify":
      return mem.enemyActing ? 450 : 0;
    case "auditor":
    case "hoarder":
    case "smolder":
    case "glutton":
      return 450;
    default: return 0;
  }
}
