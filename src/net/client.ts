// A client: joins a room, sends choices, and keeps the latest view and events it was sent.
// If the connection drops it reconnects by itself with the same token and gets its seat back.

import type { Choice } from "../engine/battle";
import type { RunChoice } from "../engine/run";
import type { GameEvent } from "../engine/events";
import type { BattleView } from "../engine/view";
import type { Look } from "./look";
import type { ClientMessage, HostMessage, PingTarget } from "./protocol";
import { hostPeerId } from "./room";
import type { Connection, Transport } from "./transport";

// Waits between reconnect attempts (the last one repeats), and how long to keep trying before
// deciding the host is gone for good.
export const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000];
export const RECONNECT_GIVE_UP_MS = 120_000;

export type LinkStatus = "ok" | "reconnecting" | "gone";

export interface ClientOptions {
  transport: Transport;
  roomCode: string;
  buildId: string;
  name: string;
  token: string;
  unlocks: () => string[]; // this player's unlocks now (from the profile), read at every hello
  look?: () => Look; // this player's saved look, read at every hello (the host fixes it if it must)
  onMessage?: (message: HostMessage) => void;
  // The link to the host: lost ("reconnecting"), back ("ok", once the host has welcomed us), or given up ("gone").
  onLink?: (status: LinkStatus) => void;
}

export interface Client {
  seat: string | null;
  view: BattleView | null;
  lastEvents: GameEvent[];
  sendChoice(choice: Choice): void;
  sendRunChoice(choice: RunChoice, window: string): void;
  sendPing(target: PingTarget): void;
  sendLook(look: Look): void; // in the lobby: the host ignores it when the colour is taken
  close(): void;
}

export async function joinRoom(options: ClientOptions): Promise<Client> {
  let connection: Connection;
  let closed = false;
  let refused = false; // the host said no: do not keep knocking
  let giveUp: ReturnType<typeof setTimeout> | null = null;
  let gone = false; // given up reconnecting
  const client: Client = {
    seat: null,
    view: null,
    lastEvents: [],
    sendChoice(choice) {
      if (connection.status !== "open") return; // the host will say where things stand once we are back
      const message: ClientMessage = { type: "choice", choice };
      connection.send(message);
    },
    sendRunChoice(choice, window) {
      if (connection.status !== "open") return;
      const message: ClientMessage = { type: "runChoice", choice, window };
      connection.send(message);
    },
    sendPing(target) {
      if (connection.status !== "open") return;
      const message: ClientMessage = { type: "ping", target };
      connection.send(message);
    },
    sendLook(look) {
      if (connection.status !== "open") return;
      const message: ClientMessage = { type: "look", look };
      connection.send(message);
    },
    close() {
      closed = true;
      if (giveUp !== null) clearTimeout(giveUp);
      connection.close();
      options.transport.close();
    },
  };

  function attach(c: Connection): void {
    connection = c;
    c.onReceive((raw) => {
      if (c !== connection) return;
      const message = raw as HostMessage;
      if (message.type === "welcome") {
        client.seat = message.seat;
        if (giveUp !== null) clearTimeout(giveUp);
        giveUp = null;
        options.onLink?.("ok");
      } else if (message.type === "refused") refused = true;
      else if (message.type === "update") {
        client.view = message.view;
        client.lastEvents = message.events;
      }
      options.onMessage?.(message);
      // The profile has just been given its experience: tell the host what is unlocked for the next run.
      if (message.type === "experience") c.send({ type: "unlocks", unlocks: options.unlocks() } satisfies ClientMessage);
    });
    c.onStatus((status) => {
      if (status === "closed" && c === connection && !closed) void reconnect();
    });
    const hello: ClientMessage = { type: "hello", buildId: options.buildId, name: options.name, token: options.token, unlocks: options.unlocks(), look: options.look?.() as Look };
    c.send(hello);
  }

  async function reconnect(): Promise<void> {
    // Give the host a moment to tell us why it hung up (a refusal arrives before the close).
    await new Promise((r) => setTimeout(r, 0));
    if (refused || closed) return;
    options.onLink?.("reconnecting");
    // An attempt can hang, so the deadline is its own timer, not a check between attempts.
    if (giveUp === null) {
      giveUp = setTimeout(() => {
        gone = true;
        options.onLink?.("gone");
      }, RECONNECT_GIVE_UP_MS);
    }
    for (let i = 0; !closed && !refused && !gone; i++) {
      await new Promise((r) => setTimeout(r, RECONNECT_DELAYS_MS[Math.min(i, RECONNECT_DELAYS_MS.length - 1)]));
      if (closed || refused || gone) return;
      try {
        const c = await options.transport.connect(hostPeerId(options.roomCode));
        if (gone || closed) return c.close();
        attach(c);
        return; // the host's welcome sets the link back to "ok"
      } catch {
        // try again
      }
    }
  }

  attach(await options.transport.connect(hostPeerId(options.roomCode)));
  return client;
}
