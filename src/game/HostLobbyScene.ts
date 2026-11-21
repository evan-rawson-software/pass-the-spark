import Phaser from "phaser";
import { createHost, MAX_SEATS, MIN_SEATS } from "../net/host";
import type { Host } from "../net/host";
import { BUILD_ID } from "../net/buildId";
import { createPeerTransport } from "../net/peerTransport";
import type { HostMessage } from "../net/protocol";
import { generateRoomCode, loadHostedRoom, saveHostedRoom } from "../net/room";
import type { SavedRoom } from "../net/room";
import { debugPanel } from "./DebugPanel";
import { content } from "./devBattle";
import { relay } from "./relay";
import { loadProfile, onlineLook, saveLook } from "./profile";
import { wizardLookData as D } from "./presentation";
import { openRunScreen, startOnlineRun } from "./runSession";
import { button, drawBackground, INPUT_STYLE, label } from "./ui";
import { cssColour, listWizard, takenByOthers, Wardrobe } from "./wardrobe";
import { lookColour } from "./wizard";

// The host's lobby (#33): room code and link, the seat list, and Start, which starts the run (#49).
// Draws what the host reports and calls the host's lobby methods; it holds no rules.

type Lobby = NonNullable<typeof relay.lobby>;

export class HostLobbyScene extends Phaser.Scene {
  private host: Host | null = null;
  private mySeat = "p1";
  private lobby: Lobby | null = null;
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private note = "";
  private started = false;
  private wardrobe: Wardrobe | null = null;
  private linkInput: Phaser.GameObjects.DOMElement | null = null;

  constructor() {
    super("hostLobby");
  }

  // With `resume`, the room is already open (a run just ended): show its lobby again.
  // With `restore` (or, opened with ?room=CODE, a room this browser saved), the page was reloaded:
  // open the same room again from the save.
  create(data: { name?: string; resume?: { host: Host; roomCode: string }; restore?: SavedRoom } = {}): void {
    const roomParam = (new URLSearchParams(window.location.search).get("room") ?? "").toUpperCase();
    const saved = data.restore ?? (!data.name && !data.resume && roomParam !== "" ? loadHostedRoom(roomParam, BUILD_ID, safeStorage()) : null);
    if (saved === "corrupt") return this.dropSave(roomParam);
    const restore = saved;
    const name = data.name ?? restore?.members.find((m) => m.token === null)?.name ?? "Host";
    this.host = null;
    this.lobby = null;
    this.mySeat = restore?.members.find((m) => m.token === null)?.seat ?? "p1";
    this.started = false;
    this.wardrobe = null;
    this.linkInput = null;
    this.note = "";
    this.dynamic = [];
    drawBackground(this);
    label(this, 960, 70, "Host online game", 56, { bold: true, origin: 0.5 });
    relay.handler = (m) => this.onMessage(m);
    if (!data.resume) relay.reset();
    if (data.resume && relay.lobby) {
      this.host = data.resume.host;
      this.roomCode = data.resume.roomCode;
      this.lobby = relay.lobby;
      button(this, 60, 1000, "Back", () => this.leave());
      debugPanel.onLobbyChange = () => this.redraw();
      this.events.once("shutdown", () => {
        debugPanel.onLobbyChange = null;
        if (!this.started) this.host?.close();
      });
      this.drawRoom();
      this.redraw();
      return;
    }
    const status = label(this, 960, 540, "Creating room...", 36, { origin: 0.5 });
    button(this, 60, 1000, "Back", () => this.leave());

    this.lobby = { type: "lobby", players: [{ seat: "p1", name, level: loadProfile().unlocks.length, look: onlineLook() }], seats: ["p1"] };
    debugPanel.onLobbyChange = () => this.redraw();
    this.events.once("shutdown", () => {
      debugPanel.onLobbyChange = null;
      if (!this.started) this.host?.close();
    });

    this.open(name, restore).then(
      (host) => {
        if (!this.scene.isActive()) return host.close();
        this.host = host;
        status.destroy();
        // Reloading this page now brings the host back to the same room.
        try {
          window.history.replaceState(null, "", `${window.location.pathname}?room=${this.roomCode}`);
        } catch {
          // not allowed here
        }
        this.drawRoom();
        this.redraw();
        if (restore) {
          try {
            host.announce(); // the lobby, or straight back into the run
          } catch {
            host.close();
            this.dropSave(restore.roomCode);
          }
        }
      },
      (e: { type?: string }) => {
        // A save that will not load throws a plain error; connection problems carry a type.
        if (restore && e?.type === undefined) return this.dropSave(restore.roomCode);
        status.setText(
          e?.type === "unavailable-id" && restore
            ? "This room is already open in another tab."
            : "Couldn't reach the connection server. Go back and try again.",
        );
      },
    );
  }

  // The saved room can't be used: forget it and carry on as a visitor to the link (join as a player).
  private dropSave(code: string): void {
    saveHostedRoom(code, null, safeStorage());
    this.scene.start("join", { notice: "Couldn't resume the saved game." });
  }

  // A new room: the code can already be taken on the broker; try a few. A restored room has
  // only its own code, and the broker may need a few seconds to let go of it after a reload.
  private async open(name: string, restore: SavedRoom | null): Promise<Host> {
    let lastError: unknown;
    for (let i = 0; i < 5; i++) {
      const roomCode = restore ? restore.roomCode : generateRoomCode();
      try {
        const host = await createHost({
          transport: createPeerTransport(),
          roomCode,
          buildId: BUILD_ID,
          hostName: name,
          content,
          unlocks: () => loadProfile().unlocks,
          look: onlineLook(),
          onLocalMessage: (m) => relay.deliver(m),
          resume: restore ?? undefined,
          onSave: (room) => saveHostedRoom(roomCode, room, safeStorage()),
        });
        this.roomCode = roomCode;
        return host;
      } catch (e) {
        lastError = e;
        if ((e as { type?: string }).type !== "unavailable-id") break;
        if (restore) await new Promise((r) => setTimeout(r, 2000));
      }
    }
    throw lastError;
  }

  private roomCode = "";

  private onMessage(m: HostMessage): void {
    if (m.type === "welcome") this.mySeat = m.seat;
    else if (m.type === "lobby") {
      this.lobby = m;
      this.redraw();
    } else if (m.type === "runUpdate") {
      // The run started (or this page was reloaded in the middle of one): hand over to its screens.
      // A battle opens when its first view arrives, just after this.
      this.started = true;
      relay.lobby = null;
      startOnlineRun({ host: this.host ?? undefined, seat: this.mySeat, roomCode: this.roomCode }, m.view);
      if (m.view.phase !== "battle") openRunScreen(this);
    } else if (m.type === "update") {
      if (this.started) openRunScreen(this);
    }
  }

  private leave(): void {
    this.host?.close();
    this.scene.start("menu");
  }

  // The parts that do not change while the room is open.
  private drawRoom(): void {
    const link = `${window.location.origin}${window.location.pathname}?room=${this.roomCode}`;
    label(this, 100, 160, "Room code", 30);
    label(this, 380, 160, this.roomCode, 64, { bold: true });
    const el = this.add.dom(1100, 160, "input", INPUT_STYLE + ";width:760px;font-size:22px");
    this.linkInput = el;
    const input = el.node as HTMLInputElement;
    input.readOnly = true;
    input.value = link;
    input.addEventListener("focus", () => input.select());
    const copied = label(this, 1560, 220, "", 24, { color: "#9fd1b8" });
    button(this, 1500, 160, "Copy link", () => {
      input.select();
      const done = () => copied.setText("Copied");
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => document.execCommand("copy") && done());
      else if (document.execCommand("copy")) done();
    }, { size: 26 });
    label(this, 100, 250, "Seats (the first seat leads)", 34, { bold: true });
  }

  private redraw(): void {
    const lobby = this.lobby;
    if (!lobby || !this.host || this.started) return;
    this.dynamic.forEach((o) => o.destroy());
    this.dynamic = [];
    const host = this.host;
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.dynamic.push(o);
      return o;
    };

    const L = D.lobbyList;
    lobby.players.forEach((p, i) => {
      const y = L.hostTop + i * L.pitch;
      const you = p.seat === this.mySeat;
      keep(label(this, 100, y, `${i + 1}.`, 36));
      keep(listWizard(this, 170, y + 40, p.look, L.wizardScale, i));
      keep(label(this, L.textX, y, `${p.name}  (level ${p.level})${you ? "  (you, host)" : ""}${p.away ? "  (away)" : ""}`, 36, { color: cssColour(lookColour(p.look)) }));
      keep(button(this, 760, y, "Up", () => host.moveSeat(p.seat, -1), { size: 26, disabled: i === 0 }));
      keep(button(this, 860, y, "Down", () => host.moveSeat(p.seat, 1), { size: 26, disabled: i === lobby.players.length - 1 }));
      if (you) keep(button(this, L.editX, y, "Edit", () => this.openWardrobe(), { size: 26 }));
      else keep(button(this, L.editX, y, "Kick", () => host.kick(p.seat), { size: 26 }));
    });
    for (let i = lobby.players.length; i < MAX_SEATS; i++) {
      keep(label(this, 100, L.hostTop + i * L.pitch, `${i + 1}.  (empty)`, 36, { color: "#9fd1b8" }));
    }
    this.syncWardrobe();

    const count = lobby.players.length;
    const canStart = count >= MIN_SEATS || debugPanel.allowFewerPlayers;
    keep(button(this, 960, 900, "Start", () => this.start(), { size: 56, origin: 0.5, disabled: !canStart }));
    const hint = canStart ? this.note : `Waiting for players (${count} of ${MIN_SEATS} to ${MAX_SEATS})`;
    keep(label(this, 960, 980, hint, 28, { origin: 0.5, color: "#ffd0cc" }));
  }

  private me(): Lobby["players"][number] | undefined {
    return this.lobby?.players.find((p) => p.seat === this.mySeat);
  }

  // Your wardrobe: a pick goes to the host (which may ignore it when the colour is taken; its lobby message then shows the truth).
  private openWardrobe(): void {
    const me = this.me();
    if (!me || this.wardrobe) return;
    this.linkInput?.setVisible(false); // a DOM element draws above the canvas, so it would show through the panel
    this.wardrobe = new Wardrobe(this, {
      look: me.look,
      taken: takenByOthers(this.lobby!.players, this.mySeat),
      onChange: (look) => {
        saveLook(look);
        this.host?.setLook(look);
      },
      onClose: () => {
        this.wardrobe?.destroy();
        this.wardrobe = null;
        this.linkInput?.setVisible(true);
      },
    });
  }

  private syncWardrobe(): void {
    const me = this.me();
    if (this.wardrobe && me) this.wardrobe.sync(me.look, takenByOthers(this.lobby!.players, this.mySeat));
  }

  private start(): void {
    try {
      this.host?.start(Date.now(), debugPanel.allowFewerPlayers);
    } catch (e) {
      this.note = e instanceof Error ? e.message : "Couldn't start";
      this.redraw();
    }
  }
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
