import Phaser from "phaser";
import { fixLook } from "../net/look";
import type { Look } from "../net/look";
import { lastSettings, rememberSettings } from "./devBattle";
import { loadSeatLooks, saveSeatLooks } from "./profile";
import { wizardLookData as D } from "./presentation";
import { openRunScreen, startSingleRun } from "./runSession";
import { cssColour, listWizard, Wardrobe } from "./wardrobe";
import { lookColour } from "./wizard";
import { fontRole, snap } from "./fonts";
import { INPUT_STYLE } from "./ui";

// Single-player setup (#50): seats and a seed, then a run starts. Each seat shows its wizard with an
// Edit button that opens the wardrobe (Z10); the looks are remembered per seat on this device (A5).

const MAX_SEATS = 4;

export class StartScene extends Phaser.Scene {
  private count = 3;
  private seedInput!: Phaser.GameObjects.DOMElement;
  private countButtons: Phaser.GameObjects.Text[] = [];
  private looks: Look[] = []; // one per seat, all of MAX_SEATS, kept for when more seats are shown
  private seats: Phaser.GameObjects.GameObject[] = [];
  private wardrobe: Wardrobe | null = null;

  constructor() {
    super("start");
  }

  create(): void {
    this.countButtons = [];
    this.seats = [];
    this.wardrobe = null;
    const g = this.add.graphics();
    g.fillStyle(0x1e5a42, 1);
    g.fillRect(0, 0, 1920, 1080);

    this.text(960, 90, "Pass the Spark", 80, true).setOrigin(0.5);

    // Players
    this.text(300, 220, "Players", 36, true);
    [2, 3, 4].forEach((n, i) => {
      this.countButtons.push(this.button(560 + i * 120, 220, String(n), () => this.setCount(n)));
    });
    // Seed
    this.text(300, 300, "Seed", 36, true);
    this.seedInput = this.add.dom(660, 305, "input", INPUT_STYLE);
    const seed = this.seedInput.node as HTMLInputElement;
    seed.type = "text";
    seed.value = String(Math.floor(Math.random() * 1_000_000_000)); // screen code, not engine randomness

    this.button(960, 940, "Start run", () => this.start(), 56);
    this.button(60, 1000, "Back", () => this.scene.start("menu"));

    // The saved looks, each kept if it is valid; a seat with none gets a random one in a colour no earlier seat has.
    const saved = loadSeatLooks();
    this.looks = [];
    for (let i = 0; i < MAX_SEATS; i++) this.looks.push(fixLook(saved[i], this.looks.map((l) => l.colour)));
    const last = lastSettings?.names.length;
    this.setCount(last === 2 || last === 4 ? last : 3);
  }

  private text(x: number, y: number, s: string, size: number, bold = false): Phaser.GameObjects.Text {
    return snap(this.add.text(x, y, s, { ...fontRole(size), color: "#ffffff" }).setOrigin(0, 0.5));
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
    this.countButtons.forEach((b, i) => b.setBackgroundColor(i + 2 === n ? "#b8860b" : "#0d2a20"));
    // The seats now shown must not share a colour (seats 3 and 4 may have been kept from before).
    const before = JSON.stringify(this.looks);
    for (let i = 0; i < n; i++) this.looks[i] = fixLook(this.looks[i], this.looks.slice(0, i).map((l) => l.colour));
    if (JSON.stringify(this.looks) !== before) saveSeatLooks(this.looks);
    else if (loadSeatLooks().length === 0) saveSeatLooks(this.looks); // the first visit: the random looks stay
    this.drawSeats();
  }

  private drawSeats(): void {
    this.seats.forEach((o) => o.destroy());
    this.seats = [];
    const S = D.startSeats;
    for (let i = 0; i < this.count; i++) {
      const x = 960 + (i - (this.count - 1) / 2) * S.pitch;
      const look = this.looks[i];
      const card = this.add.rectangle(x, S.top + S.h / 2, S.w, S.h, 0x14382b).setStrokeStyle(4, lookColour(look));
      const title = this.add
        .text(x, S.top + 40, `Player ${i + 1}`, { ...fontRole(36), color: cssColour(lookColour(look)) })
        .setOrigin(0.5);
      const wizard = listWizard(this, x, S.top + 320, look, S.wizardScale, i);
      const edit = this.button(x, S.top + S.editY, "Edit", () => this.edit(i), 32);
      edit.setX(x - edit.width / 2);
      this.seats.push(card, title, wizard, edit);
    }
  }

  // The wardrobe for one seat. It offers the colours of the other shown seats as taken.
  private edit(seat: number): void {
    const taken = () => Object.fromEntries(this.looks.slice(0, this.count).map((l, i) => [l.colour, `Player ${i + 1}`]).filter((_, i) => i !== seat));
    this.seedInput.setVisible(false); // a DOM element draws above the canvas, so it would show through the panel
    this.wardrobe = new Wardrobe(this, {
      look: this.looks[seat],
      taken: taken(),
      onChange: (look) => {
        this.looks[seat] = look;
        saveSeatLooks(this.looks);
        this.drawSeats();
      },
      onClose: () => {
        this.wardrobe?.destroy();
        this.wardrobe = null;
        this.seedInput.setVisible(true);
      },
    });
  }

  private start(): void {
    const names = Array.from({ length: this.count }, (_, i) => `Player ${i + 1}`);
    const typed = Number((this.seedInput.node as HTMLInputElement).value.trim());
    const hasSeed = (this.seedInput.node as HTMLInputElement).value.trim() !== "" && Number.isInteger(typed);
    const settings = { names, enemyId: lastSettings?.enemyId ?? "ogre" };
    rememberSettings(settings);
    startSingleRun(names, hasSeed ? typed : Date.now(), this.looks.slice(0, this.count));
    openRunScreen(this);
  }
}
