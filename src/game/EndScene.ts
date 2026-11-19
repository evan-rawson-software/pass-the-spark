import Phaser from "phaser";
import { rememberSettings } from "./devBattle";
import type { GameSettings } from "./devBattle";

// Placeholder end screen (#27). Shows the result handed over by the combat
// table and offers the two ways on. Replaced in milestone 4.

export interface EndData {
  won: boolean;
  rounds: number;
  seed: number;
  settings: GameSettings;
}

const FONT = "Arial, Helvetica, sans-serif";

export class EndScene extends Phaser.Scene {
  constructor() {
    super("end");
  }

  create(data: EndData): void {
    rememberSettings(data.settings);
    const g = this.add.graphics();
    g.fillStyle(0x1e5a42, 1);
    g.fillRect(0, 0, 1920, 1080);

    this.line(260, data.won ? "Victory" : "Defeat", 120, data.won ? "#ffe14d" : "#ff9a94");
    this.line(420, `Rounds played: ${data.rounds}`, 48);
    this.line(500, `Seed: ${data.seed}`, 48);
    this.button(760, 700, "Play again", () =>
      this.scene.start("combat", { settings: data.settings, seed: Date.now() }),
    );
    this.button(1160, 700, "Back to start", () => this.scene.start("menu"));
  }

  private line(y: number, s: string, size: number, color = "#ffffff"): void {
    this.add.text(960, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: "bold" }).setOrigin(0.5);
  }

  private button(x: number, y: number, s: string, onClick: () => void): void {
    this.add
      .text(x, y, s, { fontFamily: FONT, fontSize: "44px", color: "#ffffff", fontStyle: "bold" })
      .setOrigin(0.5)
      .setPadding(30, 16)
      .setBackgroundColor("#0d2a20")
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", onClick);
  }
}
