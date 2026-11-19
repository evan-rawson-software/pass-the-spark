import Phaser from "phaser";
import type { Client } from "../net/client";
import type { Host } from "../net/host";
import type { BattleView } from "../engine/view";
import { getPendingChoice } from "../engine/battle";
import { button, drawBackground, label } from "./ui";

// The hand-off point to the online battle (#34). For now it only shows that the battle
// started and what this player was sent; the real battle screen replaces it.

export interface OnlineBattleData {
  host?: Host; // set on the host's machine
  client?: Client; // set on a joining player's machine
  seat: string; // this player's seat
  view: BattleView;
  names: Record<string, string>; // seat -> name
}

export class OnlineBattleScene extends Phaser.Scene {
  constructor() {
    super("onlineBattle");
  }

  create(data: OnlineBattleData): void {
    drawBackground(this);
    label(this, 960, 160, "The battle has started", 72, { bold: true, origin: 0.5 });
    label(this, 960, 260, "(The online battle screen comes with #34.)", 30, { origin: 0.5, color: "#9fd1b8" });

    const v = data.view;
    const lines = [
      `You are seat ${data.seat} (${data.names[data.seat] ?? "?"})`,
      `Round ${v.round}, enemy: ${v.enemy.id}`,
      `Seat order: ${v.seatOrder.map((s) => data.names[s] ?? s).join(", ")}`,
    ];
    const pending = getPendingChoice(v);
    if (pending) lines.push(`Waiting for ${data.names[pending.player] ?? pending.player} to play`);
    lines.forEach((s, i) => label(this, 960, 380 + i * 70, s, 36, { origin: 0.5 }));

    button(this, 960, 800, "Leave", () => {
      data.host?.close();
      data.client?.close();
      this.scene.start("menu");
    }, { size: 40, origin: 0.5 });
  }
}
