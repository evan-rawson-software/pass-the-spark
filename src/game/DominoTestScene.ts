import Phaser from "phaser";
import { loadContent } from "../engine/content";
import { DOMINO_STATES, drawAnySymbol, drawDomino, drawSparkGlyph } from "./dominoDrawing";
import type { DominoState } from "./dominoDrawing";
import type { Domino } from "../engine/types";
import { paletteColour } from "./wizard";
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

    // Variants of one amplifier, junction and cap: owner stripe, rarity gems, upgrade star, a dual
    // and an "any" intake, and the ignores-block sigil. Each at both sizes.
    const base = (kind: Domino["kind"]) => dominoes.find((d) => d.kind === kind) as Domino;
    const amp = base("amplifier");
    const junction = base("junction");
    const cap = dominoes.find((d) => d.kind === "cap" && d.effect?.kind === "damage") ?? base("cap");
    const spark = (i: number) => SPARK_ORDER[i % SPARK_ORDER.length];
    const variants: { name: string; d: Domino; owner?: boolean }[] = [];
    for (const [kind, d] of [["amplifier", amp], ["junction", junction], ["cap", cap]] as const) {
      variants.push({ name: `${kind}, owner stripe`, d, owner: true });
      variants.push({ name: `${kind}, common`, d: { ...d, rarity: "common" } });
      variants.push({ name: `${kind}, uncommon, star`, d: { ...d, rarity: "uncommon", upgraded: ["left"] } });
      variants.push({ name: `${kind}, rare, any`, d: { ...d, rarity: "rare", upgraded: ["left", "right"], intake: "any" }, owner: true });
      variants.push({ name: `${kind}, dual intake`, d: { ...d, intake: [spark(0), spark(1)] } });
      variants.push({ name: `${kind}, same outputs`, d: { ...d, output: d.output.map(() => spark(2)) } });
    }
    variants.push({ name: "cap, ignores block", d: { ...cap, effect: { ...(cap.effect ?? { kind: "damage", base: 4 }), ignoresBlock: true }, rarity: "rare" }, owner: true });
    const seat = paletteColour(0);
    const vTop = top + dominoes.length * rowH + 80;
    label(40, vTop - 60, "Variants (both sizes)", "30px").setColor("#ffe14d");
    variants.forEach((v, i) => {
      const x = 200 + (i % 6) * 300;
      const y = vTop + Math.floor(i / 6) * 330;
      label(x - 130, y - 100, v.name, "18px").setColor("#9fc7b3");
      drawDomino(this, v.d, "large", "normal", v.owner ? { owner: seat } : {}).setPosition(x, y);
      drawDomino(this, v.d, "small", "normal", v.owner ? { owner: seat } : {}).setPosition(x, y + 120);
    });

    this.cameras.main.setBounds(0, 0, 1920, vTop + Math.ceil(variants.length / 6) * 330);
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
