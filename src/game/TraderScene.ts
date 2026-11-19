import Phaser from "phaser";
import { applyRunChoice, getTraderPrices } from "../engine/run";
import type { RunState, TraderAction } from "../engine/run";
import type { Domino } from "../engine/types";
import { submitRunChoice, currentRun, isOnlineRun, myPending, seatName, watchRun } from "./runSession";
import { drawPartyHud, drawRunHeader, drawWaitingFor } from "./partyHud";
import { drawDomino } from "./dominoDrawing";
import { charmWithTip, charmsByIds } from "./charmUi";
import { artBackground, artImage } from "./art";
import { Tooltip } from "./tooltip";
import { button, label } from "./ui";

// The Trader screen (#54). Single player: the first seat that isn't done shops; each seat has its own
// stock, coins and removal fee. No rules here: the run engine decides what can be bought or removed
// (a button is enabled only if the engine accepts the action on a copy of the run), and the prices,
// the fee and the stock all come from the run state and its data.

// The engine's reason an action isn't allowed, or null when it is.
function refusal(run: RunState, player: string, action: TraderAction): string | null {
  try {
    applyRunChoice(run, player, { type: "trader", action });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

const DECK_ROWS = 4; // deck rows shown at once; the rest are reached by scrolling
const ROW = 72;

type Add = <T extends Phaser.GameObjects.GameObject>(o: T) => T;

export class TraderScene extends Phaser.Scene {
  private tooltip!: Tooltip;
  private root!: Phaser.GameObjects.Container;
  private viewing: string | null = null; // a teammate whose stock is being looked at
  private removing = false; // the deck is open to pick a domino to remove
  private selected: string | null = null; // the deck domino picked for removal
  private scroll = 0; // first deck row shown (the mouse wheel moves it)
  private deckRows = 0; // rows in the whole deck list

  constructor() {
    super("trader");
  }

  create(): void {
    this.viewing = null;
    this.removing = false;
    this.selected = null;
    this.scroll = 0;
    this.tooltip = new Tooltip(this);
    this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => this.scrollDeck(dy > 0 ? 1 : -1));
    this.render();
    // Online the others' shopping arrives while this player is looking at a stock or the deck: redraw, keeping that.
    watchRun(this, "trader", { redraw: () => this.render() });
  }

  private render(): void {
    this.tooltip.hide();
    this.root?.destroy(true);
    const run = currentRun();
    const pending = myPending(run);
    this.root = this.add.container(0, 0);
    const add: Add = (o) => {
      this.root.add(o);
      return o;
    };
    const bg = this.add.graphics();
    bg.fillStyle(0x1e5a42, 1);
    bg.fillRect(0, 0, 1920, 1080);
    add(bg);
    artBackground(this, "trader", this.root);
    if (pending?.type !== "trader") {
      // Online, this player is done: wait for the others.
      if (isOnlineRun()) {
        const first = this.children.list.length;
        drawPartyHud(this, run);
        drawRunHeader(this, "Trader", null, "You are done shopping.");
        drawWaitingFor(this, run, 960, 520, 0.5);
        for (const o of this.children.list.slice(first)) this.root.add(o);
      }
      return;
    }
    const player = pending.player;
    const data = run.content.run.trader;
    const fee = pending.removalFee;
    const shown = this.viewing ?? player;
    const mine = shown === player;
    const stock = run.trader?.stock[shown] ?? [];
    const prices = getTraderPrices(run, shown);

    // The shared HUD and header draw straight onto the scene; move them into the root so a redraw clears them.
    const before = this.children.list.length;
    drawPartyHud(this, run);
    drawRunHeader(this, "Trader", isOnlineRun() ? null : player, "Buy dominoes or remove one, then press Done.");
    for (const o of this.children.list.slice(before)) this.root.add(o);
    artImage(this, "ui/coin", 490, 96, 40, 40, this.root);
    add(label(this, 520, 70, `Coins: ${run.coins[player]}`, 44, { bold: true, color: "#ffe14d" }));

    // Stock
    add(label(this, 60, 262, mine ? "Your stock" : `${seatName(shown)}'s stock (view only)`, 30, { bold: true, color: "#9fd1b8" }));
    stock.forEach((d, i) => {
      const x = 180 + i * 280;
      const price = prices.dominoPrices[d.id]; // the engine's price for the shown player (Haggler included)
      const why = mine ? refusal(run, player, { kind: "buy", domino: d.id }) : "not yours";
      const c = add(drawDomino(this, d, "large", why ? "notPlayable" : "normal").setPosition(x, 370));
      this.tooltip.attach(c, d);
      add(label(this, x, 450, `${price} coins · ${d.rarity ?? "?"}`, 26, { origin: 0.5, color: why ? "#9fd1b8" : "#ffffff" }));
      if (mine) add(button(this, x, 500, "Buy", () => submitRunChoice(this, player, { type: "trader", action: { kind: "buy", domino: d.id } }), { size: 30, origin: 0.5, disabled: why !== null }));
    });
    if (stock.length === 0) add(label(this, 60, 370, "Sold out.", 32, { color: "#cfe9dc" }));

    // The charm row of the stock (#108); the price is the engine's for the shown player (Haggler included).
    const charmStock = charmsByIds(run.trader?.charmStock[shown] ?? []);
    add(label(this, 60, 560, "Charms", 30, { bold: true, color: "#9fd1b8" }));
    charmStock.forEach((ch, i) => {
      const x = 240 + i * 440;
      const why = mine ? refusal(run, player, { kind: "buyCharm", charm: ch.id }) : "not yours";
      const icon = add(charmWithTip(this, this.tooltip, ch, 56, x, 620));
      if (why) icon.setAlpha(0.5);
      add(label(this, x + 44, 604, ch.name, 26, { bold: true }));
      add(label(this, x + 44, 636, `${prices.charmPrice} coins`, 22, { color: why ? "#9fd1b8" : "#ffffff" }));
      if (mine) add(button(this, x + 300, 620, "Buy", () => submitRunChoice(this, player, { type: "trader", action: { kind: "buyCharm", charm: ch.id } }), { size: 30, origin: 0.5, disabled: why !== null }));
    });
    if (charmStock.length === 0) add(label(this, 240, 620, "No charms left.", 28, { color: "#cfe9dc" }));

    if (mine) {
      const deck = run.decks[player];
      const removeWhy = refusal(run, player, { kind: "remove", domino: deck[0] });
      add(label(this, 60, 700, `Remove a domino: fee ${fee} coins, rising by ${data.removalFeeStep} after each removal`, 28, { color: "#cfe9dc" }));
      add(button(this, 1500, 700, this.removing ? "Close deck" : "Open deck", () => { this.removing = !this.removing; this.selected = null; this.scroll = 0; this.render(); }, { size: 28 }));
      if (removeWhy) add(label(this, 60, 745, `Can't remove now: ${removeWhy}`, 24, { color: "#ff9d7a" }));
      if (this.removing) this.drawDeck(run, player, deck, removeWhy, fee, add);
    } else {
      add(button(this, 60, 700, "Back to your stock", () => { this.viewing = null; this.render(); }, { size: 30 }));
    }

    // Teammates
    add(label(this, 1565, 170, "Teammates", 28, { bold: true, color: "#9fd1b8" }));
    run.players.filter((id) => id !== player).forEach((id, i) => {
      const y = 225 + i * 90;
      const done = run.trader?.done[id] ?? false;
      add(label(this, 1565, y, seatName(id), 28, { bold: true }));
      add(label(this, 1565, y + 34, `${run.coins[id]} coins · ${done ? "done" : "shopping"}`, 24, { color: done ? "#9fd1b8" : "#ffffff" }));
      add(button(this, 1790, y + 8, "Stock", () => { this.viewing = id; this.removing = false; this.selected = null; this.scroll = 0; this.render(); }, { size: 22, selected: this.viewing === id }));
    });

    add(button(this, 1860, 1030, "Done", () => submitRunChoice(this, player, { type: "trader", action: { kind: "done" } }), { size: 44, origin: 1 }));
  }

  private scrollDeck(by: number): void {
    if (!this.removing) return;
    const next = Math.max(0, Math.min(Math.max(0, this.deckRows - DECK_ROWS), this.scroll + by));
    if (next === this.scroll) return;
    this.scroll = next;
    this.render();
  }

  // The deck, grouped by intake spark; click one to pick it, then confirm.
  private drawDeck(run: RunState, player: string, deck: string[], removeWhy: string | null, fee: number, add: Add): void {
    const byId = new Map<string, Domino>(run.dominoes.map((d) => [d.id, d]));
    const groups = new Map<string, Domino[]>();
    for (const id of deck) {
      const d = byId.get(id) as Domino;
      const key = d.intake === "any" ? "any spark" : d.intake.join(" / ");
      groups.set(key, [...(groups.get(key) ?? []), d]);
    }
    // Rows of up to 10 dominoes; a group with more than 10 wraps onto further rows.
    const rows: { key: string | null; items: Domino[] }[] = [];
    for (const [key, items] of groups) {
      for (let i = 0; i < items.length; i += 10) rows.push({ key: i === 0 ? key : null, items: items.slice(i, i + 10) });
    }
    this.deckRows = rows.length;
    this.scroll = Math.min(this.scroll, Math.max(0, rows.length - DECK_ROWS));
    rows.slice(this.scroll, this.scroll + DECK_ROWS).forEach((row, r) => {
      const y = 780 + r * ROW;
      if (row.key) add(label(this, 60, y, row.key, 24, { bold: true, color: "#9fd1b8" }));
      row.items.forEach((d, i) => {
        const c = add(drawDomino(this, d, "small", this.selected === d.id ? "playable" : "normal").setPosition(380 + i * 135, y));
        this.tooltip.attach(c, d);
        if (!removeWhy) c.on("pointerdown", () => { this.selected = d.id; this.render(); });
      });
    });
    if (rows.length > DECK_ROWS) {
      const last = this.scroll + DECK_ROWS;
      add(label(this, 1780, 790, `Rows ${this.scroll + 1}-${Math.min(last, rows.length)} of ${rows.length}`, 22, { origin: 0.5, color: "#9fd1b8" }));
      add(button(this, 1780, 840, "Up", () => this.scrollDeck(-1), { size: 26, origin: 0.5, disabled: this.scroll === 0 }));
      add(button(this, 1780, 900, "Down", () => this.scrollDeck(1), { size: 26, origin: 0.5, disabled: last >= rows.length }));
    }
    const pick = this.selected;
    add(button(this, 60, 1050, pick ? `Remove ${byId.get(pick)?.name} for ${fee} coins` : "Pick a domino to remove", () => {
      if (pick) submitRunChoice(this, player, { type: "trader", action: { kind: "remove", domino: pick } });
    }, { size: 30, disabled: !pick || removeWhy !== null }));
  }
}
