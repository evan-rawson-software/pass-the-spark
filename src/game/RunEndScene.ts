import Phaser from "phaser";
import { experienceBreakdown } from "../engine/progression";
import { watchLink } from "./linkBanner";
import { relay } from "./relay";
import { awardSingleRun, currentRun, leaveOnlineRun, onlineRun, runSeed, seatName } from "./runSession";
import type { OnlineRun } from "./runSession";
import { drawPartyHud } from "./partyHud";
import { lastAward, loadProfile } from "./profile";
import { drawXpBar } from "./xpBar";
import { button, drawBackground, FONT, label } from "./ui";

// The end of a run (#50): victory or defeat, the floor reached, the seed, and the way back.
// The experience it earned (#132) is listed, the bar fills, and each new unlock gets a card; online
// every player sees their own. Online (#49) everyone sees the result. The host's "Play again" sends everyone back to the lobby
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
    label(this, 960, 190, won ? "Victory" : "Defeat", 120, { bold: true, origin: 0.5, color: won ? "#ffe14d" : "#ff9a94" });
    const floor = run.position?.floor ?? 0;
    const where = floor > run.map.floors.length ? "the boss" : `floor ${floor}`;
    label(this, 960, 300, `Reached act ${run.actIndex + 1} of ${run.content.run.acts.length}, ${where}`, 48, { origin: 0.5 });
    const online = onlineRun();
    if (online) return this.createOnline(online);
    awardSingleRun();
    this.showAward();
    label(this, 1800, 1040, `Seed: ${runSeed()}`, 26, { origin: 1 });
    button(this, 960, 1020, "Back to start", () => this.scene.start("menu"), { size: 44, origin: 0.5 });
  }

  private createOnline(online: OnlineRun): void {
    const { host, client, roomCode } = online;
    watchLink(this, client);
    if (lastAward) this.showAward(); // else it arrives in a moment, below
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
      button(this, 760, 1020, "Play again", () => host.backToLobby(), { size: 44, origin: 0.5 }); // the lobby message below takes us there
      button(this, 1160, 1020, "Back to start", leave, { size: 44, origin: 0.5 });
    } else {
      label(this, 960, 960, "Waiting for the host to play again...", 40, { origin: 0.5, color: "#9fd1b8" });
      button(this, 960, 1030, "Leave", leave, { size: 44, origin: 0.5 });
    }
    const handler = (m: { type: string }) => {
      if (m.type === "lobby") toLobby();
      else if (m.type === "experience") this.showAward(); // the profile has been given it (relay)
    };
    relay.handler = handler;
    this.events.once("shutdown", () => {
      if (relay.handler === handler) relay.handler = null;
    });
    // The host may have been quicker than this screen: let the player read the result first.
    if (client && relay.lobby) button(this, 1500, 1030, "Back to lobby", toLobby, { size: 44, origin: 0.5 });
  }

  private shownAward = false;

  // The experience breakdown, the bar filling to the profile's new total, and a card per new unlock.
  private showAward(): void {
    if (this.shownAward || !lastAward) return;
    this.shownAward = true;
    const run = currentRun();
    const b = experienceBreakdown(run);
    const lines = [`${b.floors} floors cleared   +${b.floorXp}`, `${b.bosses} bosses beaten   +${b.bossXp}`];
    if (b.winXp > 0) lines.push(`Victory bonus   +${b.winXp}`);
    lines.push(`Experience earned   +${lastAward.gained}`);
    lines.forEach((line, i) => label(this, 960, 380 + i * 44, line, i === lines.length - 1 ? 40 : 34, { origin: 0.5, bold: i === lines.length - 1, color: i === lines.length - 1 ? "#ffe14d" : "#ffffff" }));
    const end = loadProfile().experience;
    const start = Math.max(0, end - lastAward.gained);
    const bar = drawXpBar(this, 960, 600, 800, start);
    const unlocks = lastAward.newUnlocks.map((id) => run.content.progression.levels.find((l) => l.unlock === id)).filter((l) => l !== undefined);
    bar.animate(start, end, () => {
      unlocks.forEach((u, i) => {
        const x = 960 + (i - (unlocks.length - 1) / 2) * 580;
        const g = this.add.graphics();
        g.fillStyle(0x0d2a20, 1).fillRoundedRect(x - 280, 770, 560, 185, 14);
        g.lineStyle(4, 0xffe14d, 1).strokeRoundedRect(x - 280, 770, 560, 185, 14);
        label(this, x, 800, "New unlock", 26, { origin: 0.5, color: "#ffe14d" });
        label(this, x, 842, u.name, 40, { origin: 0.5, bold: true });
        this.add.text(x, 895, u.description, { fontFamily: FONT, fontSize: "24px", color: "#ffffff", align: "center", wordWrap: { width: 520 } }).setOrigin(0.5, 0.5);
      });
    });
  }
}
