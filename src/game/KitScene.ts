import Phaser from "phaser";
import { drawBar, drawPips, drawPlate, drawTick, kitButton } from "./kit";
import type { BarKind } from "./kit";
import { fontRole, roleStyle } from "./fonts";
import type { Role } from "./fonts";
import { tabularDigits } from "./fonts";
import { drawBackground } from "./ui";
import presentation from "../../data/presentation.json";

// Debug page: every text role and every kit part in each state. Open with ?scene=kit.
export class KitScene extends Phaser.Scene {
  constructor() {
    super("kit");
  }

  create(): void {
    drawBackground(this);
    const note = (x: number, y: number, s: string): void => {
      this.add.text(x, y, s, { ...fontRole(24), color: "#9fd1b8" });
    };

    note(60, 30, "Text roles. Screen pixels per font pixel: label 3, text 2, title 3, huge 6. Sample: 0123456789 Spark \u2026 \u00d7");
    const roles = Object.keys(presentation.text.roles) as Role[];
    let y = 70;
    for (const r of roles) {
      const t = this.add.text(60, y, `${r}: ${r === "huge" ? "Spark 0123" : "The quick wizard passes the spark 0123456789"}`, { ...roleStyle(r), color: "#ffffff" });
      y += t.height + 8;
    }
    // Counting numbers: the digits keep their place as they change.
    const count = tabularDigits(this.add.text(1500, 70, "111", { ...roleStyle("huge"), color: "#ffe14d" }));
    let n = 0;
    this.time.addEvent({ delay: 400, loop: true, callback: () => count.setText(String((n = (n * 7 + 111) % 1000))) });
    note(1500, 200, "counting number (tabular digits)");
    // A tabular Text that is destroyed must leave later Texts alone: this plain "111" is always as wide as it should be.
    tabularDigits(this.add.text(0, 0, "111", { ...roleStyle("title") })).destroy();
    const plain = this.add.text(1500, 235, "111", { ...roleStyle("title"), color: "#ffffff" });
    note(1580, 245, `plain "111": ${Math.round(plain.width)} wide, no leak`);
    // A bar changed in place, hit by hit.
    const live = drawBar(this, 1500, 300, 60, { kind: "line", value: 0, max: 100, number: "0 / 100" });
    let hit = 0;
    this.time.addEvent({ delay: 500, loop: true, callback: () => live.setBar({ value: (hit = (hit + 15) % 115), pale: Math.min(100, hit + 25), number: `${hit} / 100` }) });

    const top = Math.round(y + 30);
    note(60, top, "Plates: plain, with an edge colour");
    const g = this.add.graphics();
    drawPlate(g, 60, top + 40, 50, 20);
    drawPlate(g, 300, top + 40, 50, 20, "#ffe14d");
    drawPlate(g, 540, top + 40, 50, 20, "#d6453d");

    note(60, top + 160, "Bars: health, block, line; full, partial, empty; pale part; number");
    const kinds: BarKind[] = ["health", "block", "line"];
    kinds.forEach((kind, i) => {
      const by = top + 200 + i * 66;
      drawBar(this, 60, by, 60, { kind, value: 100, max: 100, number: "100 / 100" });
      drawBar(this, 480, by, 60, { kind, value: 60, max: 100, number: "60 / 100" });
      drawBar(this, 900, by, 60, { kind, value: 0, max: 100 });
      drawBar(this, 1320, by, 60, { kind, value: 60, max: 100, pale: 30, number: "60" });
    });
    note(1320, top + 400, "pale: about to lose");
    drawBar(this, 1320, top + 440, 60, { kind: "health", value: 40, max: 100, pale: 70, number: "40" });
    note(1320, top + 500, "pale: about to gain");

    const row = top + 600;
    note(60, row - 40, "Buttons: raised, pressed (hold the pointer on the first), disabled");
    const clicks = this.add.text(260, row + 90, "clicks: 0", { ...fontRole(24), color: "#9fd1b8" }).setOrigin(0.5, 0);
    let n2 = 0;
    kitButton(this, 260, row + 40, "Fire", () => clicks.setText(`clicks: ${++n2}`));
    const pressed = kitButton(this, 560, row + 40, "Pressed", () => undefined);
    pressed.setButtonState("pressed");
    kitButton(this, 860, row + 40, "Disabled", () => undefined, { disabled: true });

    note(1100, row - 40, "Pips (3 left, 2 spent) and Ready tick");
    const p = this.add.graphics();
    drawPips(p, 1100, row + 20, 3, 2);
    drawPips(p, 1100, row + 80, 0, 4);
    drawTick(p, 1500, row + 20);
  }
}
