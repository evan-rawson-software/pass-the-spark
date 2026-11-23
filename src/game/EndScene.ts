import Phaser from "phaser";
import type { Client } from "../net/client";
import type { Host } from "../net/host";
import { rememberSettings } from "./devBattle";
import type { GameSettings } from "./devBattle";
import { watchLink } from "./linkBanner";
import { relay } from "./relay";
import { fontRole } from "./fonts";

// Placeholder end screen (#27). Shows the result handed over by the combat
// table and offers the two ways on. Replaced in milestone 4.
// Online (#34): everyone sees the result. The host's "Play again" sends everyone back to the
// lobby with the same seats; the others wait for it.

export interface EndData {
  won: boolean;
  rounds: number;
  seed?: number; // single player
  settings?: GameSettings; // single player
  online?: { host?: Host; client?: Client; roomCode: string; names: Record<string, string> };
}


export class EndScene extends Phaser.Scene {
  constructor() {
    super("end");
  }

  create(data: EndData): void {
    const g = this.add.graphics();
    g.fillStyle(0x1e5a42, 1);
    g.fillRect(0, 0, 1920, 1080);

    this.line(260, data.won ? "Victory" : "Defeat", 120, data.won ? "#ffe14d" : "#ff9a94");
    this.line(420, `Rounds played: ${data.rounds}`, 48);
    if (data.online) return this.createOnline(data.online);
    const settings = data.settings!;
    rememberSettings(settings);
    this.line(500, `Seed: ${data.seed}`, 48);
    this.button(760, 700, "Play again", () =>
      this.scene.start("combat", { settings, seed: Date.now() }),
    );
    this.button(1160, 700, "Back to start", () => this.scene.start("menu"));
  }

  private createOnline(online: NonNullable<EndData["online"]>): void {
    const { host, client, roomCode } = online;
    watchLink(this, client);
    const toLobby = () => {
      if (host) this.scene.start("hostLobby", { name: online.names["p1"] ?? "Host", resume: { host, roomCode } });
      else if (client) this.scene.start("join", { resume: { client, roomCode } });
    };
    const leave = () => {
      host?.close();
      client?.close();
      this.scene.start("menu");
    };
    if (host) {
      this.button(760, 700, "Play again", () => host.backToLobby()); // the lobby message below takes us there
      this.button(1160, 700, "Back to start", leave);
    } else {
      this.line(640, "Waiting for the host to play again...", 40, "#9fd1b8");
      this.button(960, 780, "Leave", leave);
    }
    relay.handler = (m) => {
      if (m.type === "lobby") toLobby();
    };
    // The host may have been quicker than this screen: let the player read the result first.
    if (client && relay.lobby) this.button(960, 880, "Back to lobby", toLobby);
  }

  private line(y: number, s: string, size: number, color = "#ffffff"): void {
    this.add.text(960, y, s, { ...fontRole(size), color }).setOrigin(0.5);
  }

  private button(x: number, y: number, s: string, onClick: () => void): void {
    this.add
      .text(x, y, s, { ...fontRole(44), color: "#ffffff" })
      .setOrigin(0.5)
      .setPadding(30, 16)
      .setBackgroundColor("#0d2a20")
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", onClick);
  }
}
