// The messages. Plain JSON, each with a `type`.

import type { Choice } from "../engine/battle";
import type { GameEvent } from "../engine/events";
import type { BattleView } from "../engine/view";

// client -> host
export type ClientMessage =
  | { type: "hello"; buildId: string; name: string; token: string }
  | { type: "choice"; choice: Choice };

// host -> client
export type HostMessage =
  | { type: "welcome"; seat: string; token: string }
  | { type: "refused"; reason: string }
  | { type: "lobby"; players: { seat: string; name: string }[]; seats: string[]; enemyId: string }
  | { type: "update"; view: BattleView; events: GameEvent[] }
  | { type: "paused"; waitingFor: string }
  | { type: "error"; message: string };
