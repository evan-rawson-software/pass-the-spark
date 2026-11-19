// A client: joins a room, sends choices, and keeps the latest view and events it was sent.

import type { Choice } from "../engine/battle";
import type { GameEvent } from "../engine/events";
import type { BattleView } from "../engine/view";
import type { ClientMessage, HostMessage } from "./protocol";
import { hostPeerId } from "./room";
import type { Transport } from "./transport";

export interface ClientOptions {
  transport: Transport;
  roomCode: string;
  buildId: string;
  name: string;
  token: string;
  onMessage?: (message: HostMessage) => void;
}

export interface Client {
  seat: string | null;
  view: BattleView | null;
  lastEvents: GameEvent[];
  sendChoice(choice: Choice): void;
  close(): void;
}

export async function joinRoom(options: ClientOptions): Promise<Client> {
  const connection = await options.transport.connect(hostPeerId(options.roomCode));
  const client: Client = {
    seat: null,
    view: null,
    lastEvents: [],
    sendChoice(choice) {
      const message: ClientMessage = { type: "choice", choice };
      connection.send(message);
    },
    close() {
      connection.close();
      options.transport.close();
    },
  };
  connection.onReceive((raw) => {
    const message = raw as HostMessage;
    if (message.type === "welcome") client.seat = message.seat;
    else if (message.type === "update") {
      client.view = message.view;
      client.lastEvents = message.events;
    }
    options.onMessage?.(message);
  });
  const hello: ClientMessage = { type: "hello", buildId: options.buildId, name: options.name, token: options.token };
  connection.send(hello);
  return client;
}
