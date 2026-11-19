// Event stops (the "?" nodes): which event comes up, and the working state of the one in progress.
// Plain functions over the seeded RNG. The run applies the choices and settles the event.

import { openTollBridge } from "./events/tollBridge";
import { openGiant } from "./events/giant";
import type { GiantState } from "./events/giant";
import { generateDomino } from "./generate";
import { nextFloat } from "./rng";
import { openSparkShrine } from "./events/sparkShrine";
import type { Domino, EventData, EventKind, Pools, Spark } from "./types";

// One thing a party vote can pick. A vote is stored as an index into the event's options.
export type EventOption =
  | { type: "player"; player: string } // that player takes the event's domino
  | { type: "coins"; amount: number } // every player takes this many coins
  | { type: "toll"; action: "pay"; amount: number } // the Toll Bridge: every player pays this
  | { type: "toll"; action: "fight" | "turnBack" }
  | { type: "bless"; spark: Spark } // the Spark Shrine: the party is blessed with this spark
  | { type: "skip" } // the party moves on
  | { type: "grab" } // the Sleeping Giant: take a grab
  | { type: "stop" }; // the Sleeping Giant: stop, and be out

// The event the party is standing at.
export interface EventState {
  id: string;
  kind: EventKind;
  domino: Domino | null; // the Lost Courier's rare domino, shown to everyone
  options: EventOption[]; // what a party vote chooses between
  choices: Record<string, number>; // player id -> chosen option index; visible to everyone
  giant?: GiantState; // the Sleeping Giant's turn, chance and coins; open to everyone
}

export interface PickedEvent {
  id: string;
  seen: string[]; // the seen list with the picked event added
  state: number;
}

// Picks an enabled event by weight, from those not yet seen this run. Once every enabled event has
// been seen, the seen list starts again (and the pick comes from all of them).
export function pickEvent(state: number, events: EventData[], seen: string[]): PickedEvent {
  const enabled = events.filter((e) => e.enabled);
  if (enabled.length === 0) throw new Error("no event is enabled in data/events.json");
  let pool = enabled.filter((e) => !seen.includes(e.id));
  let list = seen;
  if (pool.length === 0) {
    pool = enabled;
    list = [];
  }
  let total = 0;
  for (const e of pool) total += e.weight;
  const r = nextFloat(state);
  let roll = r.value * total;
  let picked = pool[pool.length - 1];
  for (const e of pool) {
    if (roll < e.weight) {
      picked = e;
      break;
    }
    roll -= e.weight;
  }
  return { id: picked.id, seen: [...list, picked.id], state: r.state };
}

export interface OpenedEvent {
  event: EventState;
  state: number;
  nextIndex: number; // next unused generated-domino index
}

// Sets up the picked event. Playable so far: the Lost Courier, the Toll Bridge, the Spark Shrine and the Sleeping Giant.
export function openEvent(state: number, data: EventData, players: string[], pools: Pools, startIndex: number, lead: string, coins: Record<string, number>): OpenedEvent {
  if (data.id === "toll_bridge") return { event: openTollBridge(data, coins, players), state, nextIndex: startIndex };
  if (data.id === "spark_shrine") return { event: openSparkShrine(data, pools), state, nextIndex: startIndex };
  if (data.id === "sleeping_giant") {
    const options: EventOption[] = [{ type: "grab" }, { type: "stop" }];
    return { event: { id: data.id, kind: data.kind, domino: null, options, choices: {}, giant: openGiant(data, players, lead) }, state, nextIndex: startIndex };
  }
  if (data.id !== "lost_courier") throw new Error(`event ${data.id} is not playable yet`);
  const domino = generateDomino(state, "rare", pools, startIndex);
  const options: EventOption[] = [...players.map((player): EventOption => ({ type: "player", player })), { type: "coins", amount: data.numbers.coinsEach }];
  return {
    event: { id: data.id, kind: data.kind, domino: domino.value, options, choices: {} },
    state: domino.state,
    nextIndex: startIndex + 1,
  };
}
