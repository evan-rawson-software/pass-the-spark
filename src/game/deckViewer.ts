import Phaser from "phaser";
import type { RunState } from "../engine/run";
import type { BattleView } from "../engine/view";
import type { Domino } from "../engine/types";
import { drawDomino, drawSparkGlyph, drawAnySymbol } from "./dominoDrawing";
import { SPARK_ORDER, SPARK_STYLE } from "./sparks";
import { Tooltip } from "./tooltip";
import { actingSeat, currentRun, myPending, sceneFor, seatName } from "./runSession";
import { FONT, button, drawBackground } from "./ui";

// The deck viewer (#55): a read-only overlay that shows any player's dominoes grouped by intake
// spark. Self-contained: a screen opens it with openDeckViewer(scene, players) and it draws on
// top of that scene until it is closed. No rules here; grouping is only presentation.

export type DeckZone = "draw" | "hand" | "discard";

interface DeckCard {
  domino: Domino;
  zone?: DeckZone; // set only in combat
}

export interface DeckViewPlayer {
  id: string;
  name: string;
  cards: DeckCard[];
}

// Outside battle: every instance in the player's deck (the run keeps deck, hand and discard together).
export function runDeckPlayers(run: RunState): DeckViewPlayer[] {
  return run.players.map((id) => ({
    id,
    name: seatName(id),
    cards: run.decks[id].map((inst) => ({ domino: run.dominoes.find((d) => d.id === inst) ?? missing(inst) })),
  }));
}

// In combat: the same dominoes, each tagged with where it is. The draw pile is listed with the rest
// and sorted like them, so its order is not given away.
export function battleDeckPlayers(view: BattleView, name: (id: string) => string = (id) => id): DeckViewPlayer[] {
  const find = (inst: string) => view.dominoes.find((d) => d.id === inst) ?? missing(inst);
  return view.players.map((p) => ({
    id: p.id,
    name: name(p.id),
    cards: [
      ...p.deck.map((i) => ({ domino: find(i), zone: "draw" as const })),
      ...p.hand.map((i) => ({ domino: find(i), zone: "hand" as const })),
      ...p.discard.map((i) => ({ domino: find(i), zone: "discard" as const })),
    ],
  }));
}

function missing(id: string): Domino {
  return { id, name: id, intake: "any", output: [], effect: { kind: "echo" } };
}

// ---- grouping (presentation only) ----

interface Group {
  intake: Domino["intake"];
  cards: DeckCard[];
}

function sortedIntake(d: Domino): Domino["intake"] {
  return d.intake === "any" ? "any" : d.intake.slice().sort((a, b) => SPARK_ORDER.indexOf(a) - SPARK_ORDER.indexOf(b));
}

// Single sparks in spark order, then dual intakes, then "any" last.
function groupByIntake(cards: DeckCard[]): Group[] {
  const groups = new Map<string, Group>();
  for (const c of cards) {
    const intake = sortedIntake(c.domino);
    const key = intake === "any" ? "any" : intake.join("+");
    if (!groups.has(key)) groups.set(key, { intake, cards: [] });
    groups.get(key)!.cards.push(c);
  }
  const rank = (g: Group) =>
    g.intake === "any" ? 1000 : g.intake.length * 100 + SPARK_ORDER.indexOf(g.intake[0]) * 10 + SPARK_ORDER.indexOf(g.intake[g.intake.length - 1]);
  const out = [...groups.values()].sort((a, b) => rank(a) - rank(b));
  for (const g of out) {
    g.cards.sort(
      (a, b) =>
        a.domino.name.localeCompare(b.domino.name) ||
        (a.domino.upgraded?.length ?? 0) - (b.domino.upgraded?.length ?? 0) ||
        a.domino.id.localeCompare(b.domino.id),
    );
  }
  return out;
}

// ---- the overlay ----

const PANEL = { x: 110, y: 70, w: 1700, h: 940 };
const VIEW_TOP = 270;
const VIEW_BOTTOM = PANEL.y + PANEL.h - 20;
const K = 0.7; // domino scale
const DW = 240 * K;
const DH = 120 * K;
const GAP = 16;
const ROW_H = DH + 24 + 14;
const HEAD_H = 56;
const LEFT = PANEL.x + 40;
const PER_ROW = Math.floor((PANEL.w - 80 + GAP) / (DW + GAP));
const ZONE_LABEL: Record<DeckZone, string> = { draw: "draw pile", hand: "hand", discard: "discard" };

// Picking mode (for events that ask a player to pick dominoes from their own deck): pass one player,
// and the viewer lets them pick `count` dominoes (one, or two in the order they click) and confirm.
// Which dominoes can be picked and the before-and-after preview come from the caller, who gets them
// from the engine; the viewer only shows them.
export interface DeckPick {
  count: 1 | 2;
  prompt: string;
  canPick?: (domino: Domino) => boolean; // default: any
  preview?: (picked: string[]) => { before: Domino; after: Domino } | null; // asked once `count` are picked
  onConfirm: (picked: string[]) => void; // instance ids, in pick order
}

// Whether a viewer is open, so an online screen can hold its redraws until it is closed.
export const deckViewerState = { open: false, onClose: null as (() => void) | null };

export function openDeckViewer(scene: Phaser.Scene, players: DeckViewPlayer[], startId?: string, onClose?: () => void, pick?: DeckPick): void {
  if (players.length === 0) return;
  deckViewerState.open = true;
  const root = scene.add.container(0, 0).setDepth(900);
  const tooltip = new Tooltip(scene);
  let current = Math.max(0, players.findIndex((p) => p.id === startId));
  let scroll = 0; // pixels
  let picked: string[] = []; // picking mode: instance ids in pick order
  let body: Phaser.GameObjects.Container | undefined;
  let chrome: Phaser.GameObjects.Container | undefined;

  // Full-screen dim; it swallows clicks so nothing underneath reacts.
  const dim = scene.add.rectangle(960, 540, 1920, 1080, 0x000000, 0.7).setInteractive();
  const panel = scene.add.graphics();
  panel.fillStyle(0x1e5a42, 1);
  panel.fillRoundedRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 24);
  panel.lineStyle(4, 0x2f7a5b, 1);
  panel.strokeRoundedRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 24);
  root.add([dim, panel]);

  const groups = () => groupByIntake(players[current].cards);
  const maxScroll = () => Math.max(0, groups().reduce((h, g) => h + HEAD_H + Math.ceil(g.cards.length / PER_ROW) * ROW_H, 0) - (VIEW_BOTTOM - VIEW_TOP));

  const close = () => {
    tooltip.hide();
    scene.input.off("wheel", onWheel);
    scene.input.keyboard?.off("keydown-ESC", close);
    root.destroy(true);
    deckViewerState.open = false;
    const later = deckViewerState.onClose;
    deckViewerState.onClose = null;
    onClose?.();
    later?.();
  };
  const onWheel = (_p: unknown, _o: unknown, _dx: number, dy: number) => {
    scroll = Math.max(0, Math.min(maxScroll(), scroll + dy));
    drawBody();
  };
  scene.input.on("wheel", onWheel);
  scene.input.keyboard?.on("keydown-ESC", close);

  function confirm(): void {
    if (!pick || picked.length !== pick.count) return;
    const ids = picked;
    close();
    pick.onConfirm(ids);
  }

  function togglePick(card: DeckCard): void {
    if (!pick) return;
    const id = card.domino.id;
    if (picked.includes(id)) picked = picked.filter((p) => p !== id);
    else if (picked.length < pick.count) picked = [...picked, id];
    else if (pick.count === 1) picked = [id];
    else return;
    drawChrome();
    drawBody();
  }

  function drawChrome(): void {
    chrome?.destroy(true);
    const c = scene.add.container(0, 0);
    chrome = c;
    root.add(c);
    c.add(scene.add.text(LEFT, PANEL.y + 40, "Decks", { fontFamily: FONT, fontSize: "48px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0, 0.5));
    c.add(button(scene, PANEL.x + PANEL.w - 40, PANEL.y + 40, "Close", close, { size: 30, origin: 1 }));
    let x = LEFT;
    players.forEach((p, i) => {
      const b = button(
        scene,
        x,
        PANEL.y + 120,
        p.name,
        () => {
          current = i;
          scroll = 0;
          drawChrome();
          drawBody();
        },
        { size: 30, selected: i === current },
      );
      c.add(b);
      x += b.width + 16;
    });
    const cards = players[current].cards;
    let summary = `${cards.length} dominoes`;
    if (cards.some((k) => k.zone)) {
      const n = (z: DeckZone) => cards.filter((k) => k.zone === z).length;
      summary += `   |   draw pile ${n("draw")}   hand ${n("hand")}   discard ${n("discard")}`;
    }
    if (pick) {
      c.add(scene.add.text(LEFT, PANEL.y + 185, pick.prompt, { fontFamily: FONT, fontSize: "28px", color: "#ffe14d", fontStyle: "bold" }).setOrigin(0, 0.5));
      c.add(button(scene, PANEL.x + PANEL.w - 40, PANEL.y + 120, "Confirm", confirm, { size: 30, origin: 1, disabled: picked.length !== pick.count }));
      const shown = picked.length === pick.count ? pick.preview?.(picked) : null;
      if (shown) {
        const before = drawDomino(scene, shown.before, "large", "normal").setScale(0.45).setPosition(PANEL.x + PANEL.w - 560, PANEL.y + 190);
        const after = drawDomino(scene, shown.after, "large", "normal").setScale(0.45).setPosition(PANEL.x + PANEL.w - 220, PANEL.y + 190);
        tooltip.attach(before, shown.before);
        tooltip.attach(after, shown.after);
        c.add([before, after, scene.add.text(PANEL.x + PANEL.w - 390, PANEL.y + 190, ">", { fontFamily: FONT, fontSize: "36px", color: "#ffe14d", fontStyle: "bold" }).setOrigin(0.5)]);
      }
      return;
    }
    c.add(scene.add.text(LEFT, PANEL.y + 185, summary, { fontFamily: FONT, fontSize: "28px", color: "#cfe9dc" }).setOrigin(0, 0.5));
  }

  // Only whole rows inside the viewport are drawn, so nothing hidden stays hoverable.
  function drawBody(): void {
    tooltip.hide();
    body?.destroy(true);
    const b = scene.add.container(0, 0);
    body = b;
    root.add(b);
    let y = VIEW_TOP - scroll;
    for (const g of groups()) {
      if (y >= VIEW_TOP && y + HEAD_H <= VIEW_BOTTOM) {
        const gfx = scene.add.graphics();
        b.add(gfx);
        let tx = LEFT;
        if (g.intake === "any") {
          drawAnySymbol(gfx, LEFT + 18, y + 24, 18);
          tx += 50;
        } else {
          g.intake.forEach((s, i) => drawSparkGlyph(gfx, s, LEFT + 18 + i * 44, y + 24, 18));
          tx += g.intake.length * 44 + 6;
        }
        const name = g.intake === "any" ? "Any spark" : g.intake.join(" or ");
        const color = g.intake === "any" ? "#ffffff" : "#" + SPARK_STYLE[g.intake[0]].color.toString(16).padStart(6, "0");
        b.add(
          scene.add
            .text(tx, y + 24, `${name}  (${g.cards.length})`, { fontFamily: FONT, fontSize: "32px", color, fontStyle: "bold", stroke: "#0d2a20", strokeThickness: 4 })
            .setOrigin(0, 0.5),
        );
      }
      y += HEAD_H;
      g.cards.forEach((card, i) => {
        const top = y + Math.floor(i / PER_ROW) * ROW_H;
        if (top < VIEW_TOP || top + ROW_H - 10 > VIEW_BOTTOM) return;
        const cx = LEFT + DW / 2 + (i % PER_ROW) * (DW + GAP);
        const pickable = !pick || (pick.canPick?.(card.domino) ?? true);
        const d = drawDomino(scene, card.domino, "large", pickable ? "normal" : "notPlayable");
        addUpgradeMarks(scene, d, card.domino);
        d.setScale(K).setPosition(cx, top + DH / 2);
        b.add(d);
        tooltip.attach(d, card.domino);
        if (pick && pickable) {
          d.on("pointerdown", () => togglePick(card));
          d.input!.cursor = "pointer";
        }
        const order = picked.indexOf(card.domino.id);
        if (order >= 0) {
          const g = scene.add.graphics();
          g.lineStyle(6, 0xffe14d, 1);
          g.strokeRoundedRect(cx - DW / 2 - 4, top - 4, DW + 8, DH + 8, 10);
          b.add(g);
          if (pick?.count === 2) {
            b.add(scene.add.circle(cx - DW / 2 + 4, top + 4, 17, 0xffe14d).setStrokeStyle(3, 0x2a2a2a));
            b.add(scene.add.text(cx - DW / 2 + 4, top + 4, String(order + 1), { fontFamily: FONT, fontSize: "24px", color: "#2a2a2a", fontStyle: "bold" }).setOrigin(0.5));
          }
        }
        if (card.zone) {
          b.add(scene.add.text(cx, top + DH + 10, ZONE_LABEL[card.zone], { fontFamily: FONT, fontSize: "20px", color: "#9fd1b8" }).setOrigin(0.5, 0));
        }
      });
      y += Math.ceil(g.cards.length / PER_ROW) * ROW_H;
    }
    if (maxScroll() > 0) {
      b.add(
        scene.add
          .text(PANEL.x + PANEL.w - 40, PANEL.y + 185, scroll < maxScroll() ? "scroll for more" : "end of deck", { fontFamily: FONT, fontSize: "22px", color: "#9fd1b8" })
          .setOrigin(1, 0.5),
      );
    }
  }

  drawChrome();
  drawBody();
}

// A gold "+" badge on each upgraded half of the domino.
function addUpgradeMarks(scene: Phaser.Scene, c: Phaser.GameObjects.Container, d: Domino): void {
  for (const side of d.upgraded ?? []) {
    const x = side === "left" ? -112 : 112;
    const g = scene.add.graphics();
    g.fillStyle(0xffd23f, 1);
    g.lineStyle(3, 0x2a2a2a, 1);
    g.fillCircle(x, -52, 15);
    g.strokeCircle(x, -52, 15);
    g.lineStyle(5, 0x2a2a2a, 1);
    g.lineBetween(x - 8, -52, x + 8, -52);
    g.lineBetween(x, -60, x, -44);
    c.add(g);
  }
}

// The same viewer as a scene of its own: started with { back: "<scene key>" }, it shows the run's
// decks over a plain background and returns to that scene when closed.
export class DeckScene extends Phaser.Scene {
  constructor() {
    super("deck");
  }

  create(data: { back?: string }): void {
    const run = currentRun();
    drawBackground(this);
    openDeckViewer(this, runDeckPlayers(run), myPending(run)?.player, () =>
      this.scene.start(data.back ?? sceneFor(currentRun()), { run: true, localSeat: actingSeat(currentRun()) ?? undefined }),
    );
  }
}
