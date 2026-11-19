import Phaser from "phaser";
import { loadContent } from "../engine/content";
import { DOMINO_STATES, drawAnySymbol, drawDomino, drawSparkGlyph } from "./dominoDrawing";
import type { DominoState } from "./dominoDrawing";
import { SPARK_ORDER, SPARK_STYLE } from "./sparks";

const dominoes = loadContent().dominoes;

// Debug page: every domino in data/ in every visual state and both sizes.
// Open with ?scene=dominoes. Scroll with the mouse wheel or the up/down keys.
export class DominoTestScene extends Phaser.Scene {
  private keys?: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super("dominoTest");
  }

  create(): void {
    const label = (x: number, y: number, text: string, size = "24px") =>
      this.add.text(x, y, text, { fontSize: size, color: "#ffffff" }).setOrigin(0, 0.5);

    label(40, 40, "Domino drawing test page (scroll for more)", "36px");

    // Legend: every spark shape and the "any" symbol.
    const g = this.add.graphics();
    SPARK_ORDER.forEach((spark, i) => {
      const x = 60 + i * 270;
      drawSparkGlyph(g, spark, x, 120, 30);
      label(x + 45, 120, `${spark} (${SPARK_STYLE[spark].shape})`, "20px");
    });
    drawAnySymbol(g, 60 + 6 * 270, 120, 30);
    label(60 + 6 * 270 + 45, 120, "any", "20px");

    // Face-down backs, once per size (the back doesn't depend on the domino).
    label(40, 220, "Hidden:");
    drawDomino(this, dominoes[0], "large", "hidden").setPosition(320, 220);
    drawDomino(this, dominoes[0], "small", "hidden").setPosition(520, 220);

    const states = DOMINO_STATES.filter((s) => s !== "hidden");
    const top = 400;
    const rowH = 240;
    dominoes.forEach((d, i) => {
      const y = top + i * rowH;
      label(40, y - 20, d.name, "26px");
      label(40, y + 14, d.id, "18px").setColor("#9fc7b3");
      states.forEach((state: DominoState, j) => {
        const x = 400 + j * 300;
        drawDomino(this, d, "large", state).setPosition(x, y);
        drawDomino(this, d, "small", state).setPosition(x, y + 100);
        if (i === 0) label(x - 100, y - 90, state, "20px").setColor("#ffe14d");
      });
    });

    this.cameras.main.setBounds(0, 0, 1920, top + dominoes.length * rowH);
    this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.cameras.main.scrollY += dy;
    });
    this.keys = this.input.keyboard?.createCursorKeys();
  }

  update(): void {
    if (this.keys?.down.isDown) this.cameras.main.scrollY += 20;
    if (this.keys?.up.isDown) this.cameras.main.scrollY -= 20;
  }
}
