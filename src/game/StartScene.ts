import Phaser from "phaser";
import { enemies, lastSettings, rememberSettings } from "./devBattle";

// Placeholder start screen (#27). Collects setup only; replaced in milestone 4.

const FONT = "Arial, Helvetica, sans-serif";
const INPUT_STYLE =
  "width:300px;height:44px;font:28px Arial,Helvetica,sans-serif;padding:0 12px;box-sizing:border-box;border-radius:8px;border:2px solid #2f7a5b;background:#f4ecd8;color:#222";

export class StartScene extends Phaser.Scene {
  private count = 3;
  private enemyId = "ogre";
  private nameInputs: Phaser.GameObjects.DOMElement[] = [];
  private seedInput!: Phaser.GameObjects.DOMElement;
  private countButtons: Phaser.GameObjects.Text[] = [];
  private enemyButtons: { id: string; text: Phaser.GameObjects.Text }[] = [];

  constructor() {
    super("start");
  }

  create(): void {
    this.nameInputs = [];
    this.countButtons = [];
    this.enemyButtons = [];
    const g = this.add.graphics();
    g.fillStyle(0x1e5a42, 1);
    g.fillRect(0, 0, 1920, 1080);

    this.text(960, 90, "Pass the Spark", 80, true).setOrigin(0.5);

    // Players
    this.text(300, 220, "Players", 36, true);
    [3, 4].forEach((n, i) => {
      this.countButtons.push(this.button(560 + i * 120, 220, String(n), () => this.setCount(n)));
    });
    for (let i = 0; i < 4; i++) {
      const el = this.add.dom(450, 300 + i * 70, "input", INPUT_STYLE);
      const input = el.node as HTMLInputElement;
      input.type = "text";
      input.maxLength = 16;
      input.value = lastSettings?.names[i] ?? `Player ${i + 1}`;
      this.nameInputs.push(el);
    }

    // Enemy
    this.text(900, 220, "Enemy", 36, true);
    enemies.forEach((e, i) => {
      const t = this.button(900, 300 + i * 70, `${e.name}  (${e.tier})`, () => this.setEnemy(e.id));
      this.enemyButtons.push({ id: e.id, text: t });
    });

    // Seed
    this.text(300, 640, "Seed", 36, true);
    this.seedInput = this.add.dom(660, 645, "input", INPUT_STYLE);
    const seed = this.seedInput.node as HTMLInputElement;
    seed.type = "text";
    seed.placeholder = "random";
    this.text(830, 645, "leave empty for a random seed", 24).setOrigin(0, 0.5).setColor("#9fd1b8");

    this.button(960, 840, "Start", () => this.start(), 56);
    this.button(60, 1000, "Back", () => this.scene.start("menu"));

    this.setCount(lastSettings?.names.length === 4 ? 4 : 3);
    this.setEnemy(lastSettings?.enemyId ?? "ogre");
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
    this.nameInputs.forEach((el, i) => el.setVisible(i < n));
  }

  private setEnemy(id: string): void {
    this.enemyId = id;
    this.enemyButtons.forEach((b) => b.text.setBackgroundColor(b.id === id ? "#b8860b" : "#0d2a20"));
  }

  private start(): void {
    // Names: empty falls back to the default; duplicates (and "enemy") get a number.
    const names: string[] = [];
    for (let i = 0; i < this.count; i++) {
      const base = (this.nameInputs[i].node as HTMLInputElement).value.trim() || `Player ${i + 1}`;
      let name = base;
      for (let k = 2; names.includes(name) || name.toLowerCase() === "enemy"; k++) name = `${base} ${k}`;
      names.push(name);
    }
    const typed = Number((this.seedInput.node as HTMLInputElement).value.trim());
    const hasSeed = (this.seedInput.node as HTMLInputElement).value.trim() !== "" && Number.isInteger(typed);
    const settings = { names, enemyId: this.enemyId };
    rememberSettings(settings);
    this.scene.start("combat", { settings, seed: hasSeed ? typed : Date.now() });
  }
}
