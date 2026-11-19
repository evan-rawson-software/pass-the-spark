import Phaser from "phaser";
import { createHost, MAX_SEATS, MIN_SEATS } from "../net/host";
import type { Host } from "../net/host";
import { BUILD_ID } from "../net/buildId";
import { createPeerTransport } from "../net/peerTransport";
import type { HostMessage } from "../net/protocol";
import { generateRoomCode } from "../net/room";
import { debugPanel } from "./DebugPanel";
import { content, enemies } from "./devBattle";
import { relay } from "./relay";
import { button, drawBackground, INPUT_STYLE, label } from "./ui";

// The host's lobby (#33): room code and link, the seat list, the enemy, and Start.
// Draws what the host reports and calls the host's lobby methods; it holds no rules.

type Lobby = NonNullable<typeof relay.lobby>;

export class HostLobbyScene extends Phaser.Scene {
  private host: Host | null = null;
  private mySeat = "p1";
  private lobby: Lobby | null = null;
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private note = "";
  private started = false;

  constructor() {
    super("hostLobby");
  }

  // With `resume`, the room is already open (a battle just ended): show its lobby again.
  create(data: { name: string; resume?: { host: Host; roomCode: string } }): void {
    this.host = null;
    this.lobby = null;
    this.mySeat = "p1";
    this.started = false;
    this.note = "";
    this.dynamic = [];
    drawBackground(this);
    label(this, 960, 70, "Host online game", 56, { bold: true, origin: 0.5 });
    relay.handler = (m) => this.onMessage(m);
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

    const defaultEnemy = enemies.some((e) => e.id === "ogre") ? "ogre" : enemies[0].id;
    this.lobby = { type: "lobby", players: [{ seat: "p1", name: data.name }], seats: ["p1"], enemyId: defaultEnemy };
    debugPanel.onLobbyChange = () => this.redraw();
    this.events.once("shutdown", () => {
      debugPanel.onLobbyChange = null;
      if (!this.started) this.host?.close();
    });

    this.open(data.name, defaultEnemy).then(
      (host) => {
        if (!this.scene.isActive()) return host.close();
        this.host = host;
        status.destroy();
        this.drawRoom();
        this.redraw();
      },
      () => status.setText("Couldn't reach the connection server. Go back and try again."),
    );
  }

  // The room code can already be taken on the broker; try a few.
  private async open(name: string, enemyId: string): Promise<Host> {
    let lastError: unknown;
    for (let i = 0; i < 5; i++) {
      const roomCode = generateRoomCode();
      try {
        const host = await createHost({
          transport: createPeerTransport(),
          roomCode,
          buildId: BUILD_ID,
          hostName: name,
          config: content.config,
          content,
          starterDeck: content.starterDeck,
          enemyId,
          onLocalMessage: (m) => relay.deliver(m),
        });
        this.roomCode = roomCode;
        return host;
      } catch (e) {
        lastError = e;
        if ((e as { type?: string }).type !== "unavailable-id") break;
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
    } else if (m.type === "update") {
      // The battle started: hand over to the battle screen.
      this.started = true;
      relay.lobby = null;
      const names: Record<string, string> = {};
      this.lobby?.players.forEach((p) => (names[p.seat] = p.name));
      this.scene.start("combat", { online: { host: this.host, seat: this.mySeat, view: m.view, names, roomCode: this.roomCode } });
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
    label(this, 1150, 250, "Enemy", 34, { bold: true });
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

    lobby.players.forEach((p, i) => {
      const y = 340 + i * 90;
      const you = p.seat === this.mySeat;
      keep(label(this, 100, y, `${i + 1}.  ${p.name}${you ? "  (you, host)" : ""}`, 36));
      keep(button(this, 620, y, "Up", () => host.moveSeat(p.seat, -1), { size: 26, disabled: i === 0 }));
      keep(button(this, 720, y, "Down", () => host.moveSeat(p.seat, 1), { size: 26, disabled: i === lobby.players.length - 1 }));
      if (!you) keep(button(this, 850, y, "Kick", () => host.kick(p.seat), { size: 26 }));
    });
    for (let i = lobby.players.length; i < MAX_SEATS; i++) {
      keep(label(this, 100, 340 + i * 90, `${i + 1}.  (empty)`, 36, { color: "#9fd1b8" }));
    }

    enemies.forEach((e, i) => {
      keep(button(this, 1150, 340 + i * 62, `${e.name}  (${e.tier})`, () => host.setEnemy(e.id), { size: 26, selected: e.id === lobby.enemyId }));
    });

    const count = lobby.players.length;
    const canStart = count >= MIN_SEATS || debugPanel.allowFewerPlayers;
    keep(button(this, 960, 900, "Start", () => this.start(), { size: 56, origin: 0.5, disabled: !canStart }));
    const hint = canStart ? this.note : `Waiting for players (${count} of ${MIN_SEATS} to ${MAX_SEATS})`;
    keep(label(this, 960, 980, hint, 28, { origin: 0.5, color: "#ffd0cc" }));
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
