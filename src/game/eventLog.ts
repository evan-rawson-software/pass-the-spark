import type { GameEvent } from "../engine/events";

// Turns engine events into the on-table log line and says how long to pause on each one.
// Wording and timing only: no rules. A broken chain is described as bad luck on the draw.

export interface LogContext {
  name(seat: string): string; // a seat's display name ("enemy" becomes the enemy's name)
  domino(id: string): string; // a domino's display name
  enemyName: string;
}

// What the log has to remember between events.
export interface LogMemory {
  domino: string; // the domino whose effect is going off
  passedTo: string; // who the spark was last passed to
  sparks: string[]; // the spark(s) of that pass
  enemyActing: boolean; // the enemy's play or a round-end leftover is being shown
}

export function newLogMemory(): LogMemory {
  return { domino: "", passedTo: "", sparks: [], enemyActing: false };
}

const ENEMY = "enemy";

function sparkText(sparks: string[]): string {
  return sparks.length === 0 ? "no spark" : sparks.join(" + ");
}

// The log line for an event, or null to leave the line as it is. Updates the memory.
export function describeEvent(ev: GameEvent, ctx: LogContext, mem: LogMemory): string | null {
  const who = (s: string) => ctx.name(s);
  const target = (side: "party" | "enemy") => (side === "party" ? "the party" : ctx.enemyName);
  switch (ev.type) {
    case "roundStart":
      mem.enemyActing = false;
      return `Round ${ev.round}: ${who(ev.lead)} leads`;
    case "draw":
      return `${who(ev.seat)} draws ${ev.count}`;
    case "enemyDiscard":
      return `${ctx.enemyName} discards ${ctx.domino(ev.domino)} to make room`;
    case "opener":
      mem.enemyActing = false;
      return `${who(ev.player)} plays the opener ${ctx.domino(ev.domino)}: ${sparkText(ev.sparks)}`;
    case "pass":
      mem.passedTo = ev.to;
      mem.sparks = ev.sparks;
      if (ev.from !== ENEMY) mem.enemyActing = false;
      return `${sparkText(ev.sparks)} passes from ${who(ev.from)} to ${who(ev.to)}`;
    case "lapUp":
      return `Lap ${ev.lap}`;
    case "play":
      mem.domino = ev.domino;
      mem.enemyActing = ev.seat === ENEMY;
      return ev.seat === ENEMY
        ? `${ctx.enemyName} reacts with ${ctx.domino(ev.domino)}`
        : `${who(ev.seat)} answers ${ev.answeredSpark} with ${ctx.domino(ev.domino)} (strength ${ev.strength})`;
    case "enemyNoReaction":
      return `${ctx.enemyName} has no reaction; the spark moves on`;
    case "trigger":
      mem.domino = ev.domino;
      if (ev.effect.kind === "echo") return `${ctx.domino(ev.domino)}: the next domino triggers again`;
      if (ev.effect.kind === "lookout") return `${ctx.domino(ev.domino)}: a look at ${ctx.enemyName}'s hand`;
      return null;
    case "damage":
      return `${ctx.domino(mem.domino)}: ${ev.amount} damage to ${target(ev.side)}${ev.blocked > 0 ? ` (${ev.blocked} blocked)` : ""}`;
    case "block":
      return `${ctx.domino(mem.domino)}: ${ev.amount} block for ${target(ev.side)}`;
    case "heal":
      return `${ctx.domino(mem.domino)}: ${target(ev.side)} heals ${ev.amount}`;
    case "amplify":
      return `${ctx.domino(mem.domino)}: strength +${ev.amount} (now ${ev.strength})`;
    case "reveal":
      return `${ev.positions.length === 1 ? "A domino" : `${ev.positions.length} dominoes`} in ${ctx.enemyName}'s hand revealed`;
    case "auditor":
      return `The Auditor charges the party ${ev.damage} for repeating a spark`;
    case "sparkLocked":
      return `The Warden locks ${ev.spark}: players can't answer it this round`;
    case "hoarder":
      return `The Hoarder gains ${ev.block} block as the lap goes up`;
    case "smolder":
      return `The Smolder's leftovers go off at strength ${ev.strength}`;
    case "glutton":
      return `The Glutton heals ${ev.heal} as the lap goes up`;
    case "leftover":
      mem.enemyActing = true;
      mem.domino = ev.domino;
      return `Round ends: ${ctx.enemyName}'s leftover ${ctx.domino(ev.domino)} goes off`;
    case "blockReset":
      return "Block wears off";
    case "chainEnd":
      return `${who(mem.passedTo)} has nothing for ${sparkText(mem.sparks)}. The chain breaks: bad luck on the draw`;
    case "battleEnd":
      return ev.result === "won" ? "The party wins the battle!" : "The party falls";
    default:
      return null; // echoPending
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
