import Phaser from "phaser";
import { watchLink } from "./linkBanner";
import { relay } from "./relay";
import { awardSingleRun, currentRun, leaveOnlineRun, onlineRun, runSeed, seatName } from "./runSession";
import type { OnlineRun } from "./runSession";
import { drawPartyHud } from "./partyHud";
import { button, drawBackground, label } from "./ui";

// The end of a run (#50): victory or defeat, the floor reached, the seed, and the way back.
// Online (#49) everyone sees the result. The host's "Play again" sends everyone back to the lobby
// with the same seats; the others wait for it.

export class RunEndScene extends Phaser.Scene {
  constructor() {
    super("runEnd");
  }

  create(): void {
    const run = currentRun();
    const won = run.result === "won";
    drawBackground(this);
    drawPartyHud(this, run);
    label(this, 960, 260, won ? "Victory" : "Defeat", 120, { bold: true, origin: 0.5, color: won ? "#ffe14d" : "#ff9a94" });
    const floor = run.position?.floor ?? 0;
    const where = floor > run.map.floors.length ? "the boss" : `floor ${floor}`;
    label(this, 960, 420, `Reached act ${run.actIndex + 1} of ${run.content.run.acts.length}, ${where}`, 48, { origin: 0.5 });
    const online = onlineRun();
    if (online) return this.createOnline(online);
    awardSingleRun();
    label(this, 960, 500, `Seed: ${runSeed()}`, 48, { origin: 0.5 });
    button(this, 960, 700, "Back to start", () => this.scene.start("menu"), { size: 44, origin: 0.5 });
  }

  private createOnline(online: OnlineRun): void {
    const { host, client, roomCode } = online;
    watchLink(this, client);
    const toLobby = () => {
      leaveOnlineRun();
      if (host) this.scene.start("hostLobby", { name: seatName(online.seat), resume: { host, roomCode } });
      else if (client) this.scene.start("join", { resume: { client, roomCode } });
    };
    const leave = () => {
      host?.close();
      client?.close();
      leaveOnlineRun();
      this.scene.start("menu");
    };
    if (host) {
      button(this, 760, 700, "Play again", () => host.backToLobby(), { size: 44, origin: 0.5 }); // the lobby message below takes us there
      button(this, 1160, 700, "Back to start", leave, { size: 44, origin: 0.5 });
    } else {
      label(this, 960, 640, "Waiting for the host to play again...", 40, { origin: 0.5, color: "#9fd1b8" });
      button(this, 960, 780, "Leave", leave, { size: 44, origin: 0.5 });
    }
    const handler = (m: { type: string }) => {
      if (m.type === "lobby") toLobby();
    };
    relay.handler = handler;
    this.events.once("shutdown", () => {
      if (relay.handler === handler) relay.handler = null;
    });
    // The host may have been quicker than this screen: let the player read the result first.
    if (client && relay.lobby) button(this, 960, 880, "Back to lobby", toLobby, { size: 44, origin: 0.5 });
  }
}
