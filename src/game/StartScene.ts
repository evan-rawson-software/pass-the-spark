import Phaser from "phaser";
import { lastSettings, rememberSettings } from "./devBattle";
import { openRunScreen, startSingleRun } from "./runSession";

// Single-player setup (#50): seats and a seed, then a run starts.

const FONT = "Arial, Helvetica, sans-serif";
const INPUT_STYLE =
  "width:300px;height:44px;font:28px Arial,Helvetica,sans-serif;padding:0 12px;box-sizing:border-box;border-radius:8px;border:2px solid #2f7a5b;background:#f4ecd8;color:#222";

export class StartScene extends Phaser.Scene {
  private count = 3;
  private seedInput!: Phaser.GameObjects.DOMElement;
  private countButtons: Phaser.GameObjects.Text[] = [];

  constructor() {
    super("start");
  }

  create(): void {
    this.countButtons = [];
    const g = this.add.graphics();
    g.fillStyle(0x1e5a42, 1);
    g.fillRect(0, 0, 1920, 1080);

    this.text(960, 90, "Pass the Spark", 80, true).setOrigin(0.5);

    // Players
    this.text(300, 220, "Players", 36, true);
    [3, 4].forEach((n, i) => {
      this.countButtons.push(this.button(560 + i * 120, 220, String(n), () => this.setCount(n)));
    });
    // Seed
    this.text(300, 320, "Seed", 36, true);
    this.seedInput = this.add.dom(660, 325, "input", INPUT_STYLE);
    const seed = this.seedInput.node as HTMLInputElement;
    seed.type = "text";
    seed.value = String(Math.floor(Math.random() * 1_000_000_000)); // screen code, not engine randomness

    this.button(960, 520, "Start run", () => this.start(), 56);
    this.button(60, 1000, "Back", () => this.scene.start("menu"));

    this.setCount(lastSettings?.names.length === 4 ? 4 : 3);
  }

  private text(x: number, y: number, s: string, size: number, bold = false): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color: "#ffffff", fontStyle: bold ? "bold" : "normal" })
      .setOrigin(0, 0.5);
  }

  private button(x: number, y: number, s: string, onClick: () => void, size = 30): Phaser.GameObjects.Text {
    const t = this.text(x, y, s, size, true)
      .setOrigin(0, 0.5)
      .setPadding(20, 10)
      .setBackgroundColor("#0d2a20")
      .setInteractive({ useHandCursor: true });
    t.on("pointerdown", onClick);
    if (size === 56) t.setX(x - t.width / 2);
    return t;
  }

  private setCount(n: number): void {
    this.count = n;
    this.countButtons.forEach((b, i) => b.setBackgroundColor(i + 3 === n ? "#b8860b" : "#0d2a20"));
  }

  private start(): void {
    const names = Array.from({ length: this.count }, (_, i) => `Player ${i + 1}`);
    const typed = Number((this.seedInput.node as HTMLInputElement).value.trim());
    const hasSeed = (this.seedInput.node as HTMLInputElement).value.trim() !== "" && Number.isInteger(typed);
    const settings = { names, enemyId: lastSettings?.enemyId ?? "ogre" };
    rememberSettings(settings);
    startSingleRun(names, hasSeed ? typed : Date.now());
    openRunScreen(this);
  }
}
