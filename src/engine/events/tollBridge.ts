// The Toll Bridge (#88): a party vote between paying a toll, a hard fight and turning back.
// The run (run.ts) applies the winning option; the rules specific to this event live here.

import type { EventState } from "../eventStops";
import type { EventData } from "../types";

// The options, in order. Pay is only offered when every player can afford it.
export function openTollBridge(data: EventData, coins: Record<string, number>, players: string[]): EventState {
  const amount = data.numbers.payCoins;
  const options: EventState["options"] = [];
  if (players.every((id) => (coins[id] ?? 0) >= amount)) options.push({ type: "toll", action: "pay", amount });
  options.push({ type: "toll", action: "fight" }, { type: "toll", action: "turnBack" });
  return { id: data.id, kind: data.kind, domino: null, options, choices: {} };
}

// The floor whose stops are hidden after turning back at the given floor: the next one. The boss is
// shown from the start, so turning back on the last floor hides nothing.
export function floorHiddenAfterTurnBack(floor: number, floorCount: number): number | null {
  return floor + 1 <= floorCount ? floor + 1 : null;
}
