// Charms that change a battle. Only the draw charms (Deep Pockets, Early Riser) are live; #184 reworks the rest
// for the cascade rules. Each function reads the numbers from the charm data and
// returns 0 when the player doesn't hold the charm. "Owner" is the player whose domino it is; the
// enemy (or no owner, null) never gets any.

import { heldCharmNumber } from "./charms";
import type { Charm } from "./types";

// What these functions read: BattleState and BattleView both fit.
export interface CharmInput {
  charmDefs: Charm[];
  players: { id: string; charms: string[] }[];
}

function number(state: CharmInput, owner: string | null, id: string, key: string): number {
  const player = state.players.find((p) => p.id === owner);
  return player ? heldCharmNumber(state.charmDefs, player.charms, id, key) : 0;
}

export function extraDraws(state: CharmInput, owner: string): number {
  return number(state, owner, "early_riser", "draws");
}

// The player's hand limit for this battle (Deep Pockets).
export function handLimitOf(state: CharmInput & { config: { playerHandLimit: number } }, owner: string): number {
  return state.config.playerHandLimit + number(state, owner, "deep_pockets", "handLimit");
}
