import Phaser from "phaser";
import { getUpgradeOptions, previewUpgrade } from "../engine/upgrades";
import type { Domino, Spark, UpgradeSide } from "../engine/types";
import { currentRun, isOnlineRun, myPending, submitRunChoice, watchRun } from "./runSession";
import { drawPartyHud, drawRunHeader, drawWaitingFor } from "./partyHud";
import { drawDomino, drawSparkGlyph, dominoPixelSize } from "./dominoDrawing";
import { SPARK_ORDER } from "./sparks";
import { Tooltip } from "./tooltip";
import { button, drawBackground, label } from "./ui";

// The rest site and upgrade screen (#53). Each seat chooses Rest or Upgrade; in single player one
// person answers for each seat in turn. Upgrade opens the upgrade screen inside this scene: pick a
// domino from the deck (one column per intake spark), pick its left or right side, pick the added
// spark for a left upgrade, compare before and after, then Confirm. Which dominoes and sides can be
// upgraded, the spark choices and the upgraded domino all come from src/engine/upgrades.ts.

// The party's health when the first seat started choosing, to show what has been healed so far.
// (-1: not known, because this page was opened after the first seat had chosen.)
let healthAtStart = -1;

const LARGE = dominoPixelSize("large");
const SMALL = dominoPixelSize("small"); // the cell any kind fits

export class RestScene extends Phaser.Scene {
  private mode: "choose" | "upgrade" = "choose";
  private picked: string | null = null; // domino instance id
  private side: UpgradeSide | null = null;
  private spark: Spark | null = null;
  private tooltip!: Tooltip;

  constructor() {
    super("rest");
  }

  create(): void {
    this.mode = "choose";
    this.picked = null;
    this.side = null;
    this.spark = null;
    this.tooltip = new Tooltip(this);
    const run = currentRun();
    if (!run.rest || run.rest.length === 0) healthAtStart = run.health;
    this.render();
    // Online the others' choices arrive while this player is mid-upgrade: redraw, keeping the selection.
    watchRun(this, "rest", { redraw: () => this.render() });
  }

  private render(): void {
    this.tooltip.hide();
    this.children.removeAll(true);
    const run = currentRun();
    const pending = myPending(run);
    const online = isOnlineRun();
    drawBackground(this, "rest");
    drawPartyHud(this, run);
    const upgrade = this.mode === "upgrade" && pending !== null;
    drawRunHeader(this, upgrade ? "Upgrade" : "Rest site", online ? null : (pending?.player ?? null), upgrade ? "Pick a domino, then a side." : "Rest to heal the party, or upgrade a domino.");
    if (pending?.type !== "rest") {
      // Online, this player has chosen: wait for the others.
      if (online) {
        if (healthAtStart >= 0) label(this, 960, 440, `Party healed so far: +${run.health - healthAtStart}`, 32, { origin: 0.5, color: "#9fd1b8" });
        drawWaitingFor(this, run, 960, 520, 0.5);
      }
      return;
    }
    if (upgrade) this.renderUpgrade(pending.player);
    else this.renderChoose(pending.player);
  }

  private renderChoose(player: string): void {
    const run = currentRun();
    button(this, 960, 440, `Rest (heal ${run.content.run.restHeal})`, () => submitRunChoice(this, player, { type: "rest" }), { size: 48, origin: 0.5 });
    button(this, 960, 600, "Upgrade a domino", () => { this.mode = "upgrade"; this.render(); }, { size: 48, origin: 0.5 });
    if (healthAtStart >= 0) label(this, 960, 800, `Party healed so far: +${run.health - healthAtStart}`, 32, { origin: 0.5, color: "#9fd1b8" });
    label(this, 960, 850, `${run.rest?.length ?? 0} of ${run.players.length} have chosen`, 28, { origin: 0.5, color: "#9fd1b8" });
  }

  private renderUpgrade(player: string): void {
    const run = currentRun();
    button(this, 60, 1030, "Back", () => { this.mode = "choose"; this.render(); }, { size: 28 });

    // The deck, one column per intake spark (a dual intake sits under its first spark).
    const dominoes = run.decks[player].map((id) => run.dominoes.find((d) => d.id === id) as Domino);
    const columns: Record<string, Domino[]> = {};
    for (const d of dominoes) {
      const key = d.intake === "any" ? "any" : d.intake[0];
      (columns[key] ??= []).push(d);
    }
    const keys = [...SPARK_ORDER, "any"].filter((k) => columns[k]);
    keys.forEach((key, col) => {
      const x = 130 + col * 150;
      label(this, x, 262, key === "any" ? "Any" : key, 26, { bold: true, origin: 0.5, color: "#ffe14d" });
      columns[key].forEach((d, row) => this.deckDomino(player, d, x, 330 + row * 78));
    });

    const picked = dominoes.find((d) => d.id === this.picked);
    if (!picked) {
      label(this, 1545, 500, "Pick a domino from your deck", 30, { origin: 0.5, color: "#9fd1b8" });
      return;
    }
    this.renderPicked(player, picked);
  }

  private deckDomino(player: string, d: Domino, x: number, y: number): void {
    const run = currentRun();
    const options = getUpgradeOptions(run, player, d.id);
    const canUpgrade = options.left.length > 0 || options.right;
    const c = drawDomino(this, d, "small", canUpgrade ? "normal" : "notPlayable").setPosition(x, y);
    this.tooltip.attach(c, d);
    if (canUpgrade) {
      c.on("pointerdown", () => {
        this.picked = d.id;
        this.side = null;
        this.spark = null;
        this.render();
      });
      c.input!.cursor = "pointer";
    }
    if (d.id === this.picked) {
      const g = this.add.graphics();
      g.lineStyle(5, 0xffe14d, 1);
      const own = dominoPixelSize("small", d.kind);
      g.strokeRoundedRect(x - SMALL.w / 2 - 4, y - own.h / 2 - 4, own.w + 8, own.h + 8, 10);
    }
  }

  private renderPicked(player: string, picked: Domino): void {
    const run = currentRun();
    const options = getUpgradeOptions(run, player, picked.id);
    const cx = 1545;
    const top = 330;
    drawDomino(this, picked, "large", "normal").setPosition(cx, top);

    // The left side is the intake (the left third of the tile); the right side is the effect and
    // output (the other two thirds). A side that is picked is outlined, a closed one is dimmed.
    const reason = label(this, cx, top + 100, " ", 24, { origin: 0.5, color: "#ffb4a2" });
    // The sides split the domino's own width (a cap is narrower), from its socket edge at the cell's left.
    const own = dominoPixelSize("large", picked.kind);
    const edge = cx - LARGE.w / 2;
    const sides: { side: UpgradeSide; open: boolean; why: string; x: number; w: number }[] = [
      { side: "left", open: options.left.length > 0, why: options.leftReason ?? "", x: edge + own.w / 6, w: own.w / 3 },
      { side: "right", open: options.right, why: options.rightReason ?? "", x: edge + own.w / 3 + own.w / 3, w: (own.w * 2) / 3 },
    ];
    for (const s of sides) {
      const zone = this.add.rectangle(s.x, top, s.w, own.h, 0x000000, s.open ? 0 : 0.6).setInteractive({ useHandCursor: s.open });
      if (s.open) {
        zone.on("pointerdown", () => {
          this.side = s.side;
          this.spark = null;
          this.render();
        });
      } else {
        zone.on("pointerover", () => reason.setText(`${s.side === "left" ? "Left" : "Right"} side: ${s.why}`));
        zone.on("pointerout", () => reason.setText(" "));
      }
      if (this.side === s.side) {
        const g = this.add.graphics();
        g.lineStyle(6, 0xffe14d, 1);
        g.strokeRect(s.x - s.w / 2, top - own.h / 2, s.w, own.h);
      }
    }
    label(this, sides[0].x, top - 90, "Left", 24, { origin: 0.5, color: "#cfe9dc" });
    label(this, sides[1].x, top - 90, "Right", 24, { origin: 0.5, color: "#cfe9dc" });

    if (this.side === null) return;
    if (this.side === "left") {
      label(this, cx, 480, "Add a second intake spark", 28, { origin: 0.5, color: "#ffffff" });
      options.left.forEach((s, i) => {
        const x = cx - ((options.left.length - 1) * 150) / 2 + i * 150;
        const g = this.add.graphics();
        drawSparkGlyph(g, s, x - 50, 530, 14);
        button(this, x - 25, 530, s, () => { this.spark = s; this.render(); }, { size: 26, selected: this.spark === s });
      });
      if (this.spark === null) return;
    }

    const { before, after } = previewUpgrade(run, player, picked.id, this.side, this.spark ?? undefined);
    label(this, cx, 620, "Before and after", 28, { origin: 0.5, color: "#ffffff" });
    const before1 = drawDomino(this, before, "large", "normal").setPosition(cx - 160, 720);
    const after1 = drawDomino(this, after, "large", "normal").setPosition(cx + 160, 720);
    this.tooltip.attach(before1, before);
    this.tooltip.attach(after1, after);
    label(this, cx, 720, ">", 44, { bold: true, origin: 0.5, color: "#ffe14d" });
    button(this, cx, 900, "Confirm", () => {
      submitRunChoice(this, player, { type: "upgrade", domino: picked.id, side: this.side as UpgradeSide, spark: this.spark ?? undefined });
    }, { size: 44, origin: 0.5 });
  }
}
