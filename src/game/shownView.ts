import { ENEMY_SEAT } from "../engine/battle";
import type { BattleState } from "../engine/battle";
import type { GameEvent } from "../engine/events";
import type { BattleView } from "../engine/view";

// The table as it looks part-way through a step's events. It starts as the view from before the
// step and each event nudges it using only the numbers the event carries. No rules: the scene
// redraws from getView once the step is done, so anything missed here is corrected then.

export interface ShownTable {
  view: BattleView;
  enemyIds: string[]; // the enemy's hand by position (used to place a flip; never shown while hidden)
}

export function startShown(view: BattleView, before: BattleState): ShownTable {
  return { view, enemyIds: before.enemy.hand.slice() };
}

export function applyEvent(s: ShownTable, ev: GameEvent): void {
  const v = s.view;
  const side = (x: "party" | "enemy") => (x === "party" ? v.party : v.enemy);
  switch (ev.type) {
    case "roundStart":
      v.round = ev.round;
      v.chain = { ...v.chain, strength: 0, lap: 1, sparks: [], played: [] };
      break;
    case "draw":
      if (ev.seat === ENEMY_SEAT) {
        for (let i = 0; i < ev.count; i++) {
          v.enemy.hand.push({ revealed: false });
          s.enemyIds.push("");
        }
      } else {
        v.players.find((p) => p.id === ev.seat)?.hand.push(...(ev.dominoes ?? []));
      }
      break;
    case "enemyDiscard":
      v.enemy.hand.shift();
      s.enemyIds.shift();
      break;
    case "opener": {
      const hand = v.players.find((p) => p.id === ev.player)?.hand;
      if (hand) removeOne(hand, ev.domino);
      v.chain.played.push({ seat: ev.player, domino: ev.domino });
      v.chain.sparks = ev.sparks.slice();
      break;
    }
    case "pass":
      v.chain.sparks = ev.sparks.slice();
      break;
    case "lapUp":
      v.chain.lap = ev.lap;
      break;
    case "play":
      v.chain.strength = ev.strength;
      v.chain.lap = ev.lap;
      v.chain.played.push({ seat: ev.seat, domino: ev.domino });
      if (ev.seat === ENEMY_SEAT) {
        const i = s.enemyIds.indexOf(ev.domino);
        if (i >= 0) {
          v.enemy.hand.splice(i, 1);
          s.enemyIds.splice(i, 1);
        }
      } else {
        const hand = v.players.find((p) => p.id === ev.seat)?.hand;
        if (hand) removeOne(hand, ev.domino);
      }
      break;
    case "amplify":
      v.chain.strength = ev.strength;
      break;
    case "reveal":
      for (const p of ev.positions) {
        if (s.enemyIds[p]) v.enemy.hand[p] = { revealed: true, domino: s.enemyIds[p] };
      }
      break;
    case "damage": {
      const t = side(ev.side);
      t.health = Math.max(0, t.health - ev.amount);
      t.block = Math.max(0, t.block - ev.blocked);
      break;
    }
    case "block":
      side(ev.side).block += ev.amount;
      break;
    case "heal":
      side(ev.side).health += ev.amount;
      break;
    case "glutton":
      v.enemy.health += ev.heal;
      break;
    case "blockReset":
      v.party.block = 0;
      v.enemy.block = 0;
      break;
    case "chainEnd":
      v.chain = { ...v.chain, strength: 0, lap: 1, sparks: [], played: [] };
      break;
    default:
      break;
  }
}

function removeOne(list: string[], id: string): void {
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
}
