import Phaser from "phaser";
import { MAX_NAME_LENGTH } from "../net/host";
import { BUILD_ID } from "../net/buildId";
import { joinRoom } from "../net/client";
import type { Client } from "../net/client";
import { createPeerTransport } from "../net/peerTransport";
import { REFUSED_BUILD } from "../net/protocol";
import type { HostMessage } from "../net/protocol";
import { getRoomToken, hasRoomToken, ROOM_CODE_LENGTH } from "../net/room";
import { debugPanel } from "./DebugPanel";
import { watchLink } from "./linkBanner";
import { relay } from "./relay";
import { loadProfile, onlineLook, saveLook } from "./profile";
import { wizardLookData as D } from "./presentation";
import { openRunScreen, startOnlineRun } from "./runSession";
import { button, drawBackground, label, saveName, savedName, textInput } from "./ui";
import { cssColour, listWizard, takenByOthers, Wardrobe } from "./wardrobe";
import { lookColour } from "./wizard";

// Joining a room (#33): code and name, then the seat list as the host changes it.
// Draws what the host sends; the host decides everything.

type Lobby = NonNullable<typeof relay.lobby>;

export class JoinScene extends Phaser.Scene {
  private client: Client | null = null;
  private lobby: Lobby | null = null;
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private started = false;
  private joinId = 0; // ignores answers from an attempt that was abandoned
  private wardrobe: Wardrobe | null = null;

  constructor() {
    super("join");
  }

  private roomCode = "";

  // With `resume`, the player is already in the room (a run just ended): show its lobby again.
  create(data: { resume?: { client: Client; roomCode: string }; notice?: string } = {}): void {
    debugPanel.setEnabled(false); // the debug panel is the host's alone
    this.client = null;
    this.lobby = null;
    this.started = false;
    this.wardrobe = null;
    this.dynamic = [];
    drawBackground(this);
    label(this, 960, 70, "Join game", 56, { bold: true, origin: 0.5 });
    this.events.once("shutdown", () => {
      this.joinId++;
      if (!this.started) this.client?.close();
    });
    if (data.resume && relay.lobby) {
      this.client = data.resume.client;
      this.roomCode = data.resume.roomCode;
      this.lobby = relay.lobby;
      const id = this.joinId;
      relay.handler = (m) => id === this.joinId && this.onMessage(m, this.roomCode);
      watchLink(this, this.client);
      this.showLobby();
      return;
    }
    const room = (new URLSearchParams(window.location.search).get("room") ?? "").toUpperCase();
    if (data.notice) this.showForm(room, data.notice);
    // Reopening the link of a room this browser was in before: go straight back to the seat.
    else if (room !== "" && savedName() !== "" && hasRoomToken(room, safeStorage())) void this.join(room, savedName());
    else this.showForm(room);
  }

  private clear(): void {
    this.dynamic.forEach((o) => o.destroy());
    this.dynamic = [];
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.dynamic.push(o);
    return o;
  }

  private showForm(code: string, message = ""): void {
    this.clear();
    this.keep(label(this, 960, 260, "Room code", 30, { origin: 0.5 }));
    const codeEl = this.keep(textInput(this, 960, 320, code, ROOM_CODE_LENGTH));
    this.keep(label(this, 960, 420, "Your name", 30, { origin: 0.5 }));
    const nameEl = this.keep(textInput(this, 960, 480, savedName(), MAX_NAME_LENGTH));
    const value = (el: Phaser.GameObjects.DOMElement) => (el.node as HTMLInputElement).value.trim();
    this.keep(button(this, 960, 640, "Join", () => {
      const room = value(codeEl).toUpperCase();
      const name = value(nameEl) || "Player";
      if (room === "") return this.showForm(room, "Enter a room code.");
      saveName(name);
      void this.join(room, name);
    }, { size: 48, origin: 0.5 }));
    this.keep(label(this, 960, 760, message, 30, { origin: 0.5, color: "#ffd0cc" }));
    this.keep(button(this, 60, 1000, "Back", () => this.scene.start("menu")));
  }

  private async join(code: string, name: string): Promise<void> {
    const id = ++this.joinId;
    relay.reset();
    this.clear();
    this.keep(label(this, 960, 540, "Joining...", 40, { origin: 0.5 }));
    try {
      const client = await joinRoom({
        transport: createPeerTransport(),
        roomCode: code,
        buildId: BUILD_ID,
        name,
        token: getRoomToken(code, safeStorage()),
        unlocks: () => loadProfile().unlocks,
        look: onlineLook, // the saved look; the host fixes it when its colour is taken (and it is kept as saved)
        onMessage: (m) => relay.deliver(m),
        onLink: (status) => relay.setLink(status),
      });
      relay.handler = (m) => id === this.joinId && this.onMessage(m, code);
      this.roomCode = code;
      if (id !== this.joinId) return client.close();
      this.client = client;
      watchLink(this, client);
      // Reloading this page now brings the player back to the same room.
      try {
        window.history.replaceState(null, "", `${window.location.pathname}?room=${code}`);
      } catch {
        // not allowed here
      }
    } catch (e) {
      if (id !== this.joinId) return;
      const missing = (e as { type?: string }).type === "peer-unavailable";
      this.showForm(code, missing ? "No room with that code." : "Couldn't connect. Try again.");
    }
  }

  private onMessage(m: HostMessage, code: string): void {
    if (m.type === "refused") {
      // This screen shows the reason itself; the link banner is for refusals after the game started.
      relay.refused = null;
      relay.onLink?.(relay.link);
      this.client?.close();
      this.client = null;
      if (m.reason === REFUSED_BUILD) this.showRefresh(m.reason);
      else this.showForm(code, m.reason);
    } else if (m.type === "lobby") {
      this.lobby = m;
      this.showLobby();
    } else if (m.type === "runUpdate") {
      // The run started (or this page was reloaded in the middle of one): hand over to its screens.
      // A battle opens when its first view arrives, just after this.
      this.started = true;
      relay.lobby = null;
      startOnlineRun({ client: this.client ?? undefined, seat: this.client?.seat ?? "", roomCode: this.roomCode }, m.view);
      if (m.view.phase !== "battle") openRunScreen(this);
    } else if (m.type === "update") {
      if (this.started) openRunScreen(this);
    }
  }

  private showRefresh(reason: string): void {
    this.clear();
    this.keep(label(this, 960, 440, reason, 44, { origin: 0.5 }));
    this.keep(button(this, 960, 620, "Refresh", () => window.location.reload(), { size: 48, origin: 0.5 }));
  }

  private me(): Lobby["players"][number] | undefined {
    return this.lobby?.players.find((p) => p.seat === this.client?.seat);
  }

  // Your wardrobe: a pick goes to the host (which may ignore it when the colour is taken; its lobby message then shows the truth).
  private openWardrobe(): void {
    const me = this.me();
    if (!me || this.wardrobe) return;
    this.wardrobe = new Wardrobe(this, {
      look: me.look,
      taken: takenByOthers(this.lobby!.players, me.seat),
      onChange: (look) => {
        saveLook(look);
        this.client?.sendLook(look);
      },
      onClose: () => {
        this.wardrobe?.destroy();
        this.wardrobe = null;
      },
    });
  }

  private syncWardrobe(): void {
    const me = this.me();
    if (this.wardrobe && me) this.wardrobe.sync(me.look, takenByOthers(this.lobby!.players, me.seat));
  }

  private showLobby(): void {
    const lobby = this.lobby;
    if (!lobby) return;
    this.clear();
    this.keep(label(this, 100, 200, "Seats (the first seat leads)", 34, { bold: true }));
    const L = D.lobbyList;
    lobby.players.forEach((p, i) => {
      const you = p.seat === this.client?.seat;
      const y = L.joinTop + i * L.pitch;
      this.keep(label(this, 100, y, `${i + 1}.`, 36));
      this.keep(listWizard(this, 170, y + 40, p.look, L.wizardScale, i));
      this.keep(label(this, L.textX, y, `${p.name}  (level ${p.level})${you ? "  (you)" : ""}${p.away ? "  (away)" : ""}`, 36, { color: cssColour(lookColour(p.look)) }));
      if (you) this.keep(button(this, L.editX, y, "Edit", () => this.openWardrobe(), { size: 26 }));
    });
    this.syncWardrobe();
    this.keep(label(this, 960, 900, "Waiting for the host to start...", 36, { origin: 0.5, color: "#9fd1b8" }));
    this.keep(button(this, 60, 1000, "Leave", () => this.scene.start("menu")));
  }
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
