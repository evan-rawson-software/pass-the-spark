import Phaser from "phaser";
import { createBattle, getPlayerChoices, previewPlay, step } from "../engine/battle";
import type { BattleState } from "../engine/battle";
import { loadContent } from "../engine/content";
import { getView } from "../engine/view";
import { FuseBoard, boardArea, chargesInto, liveNumber } from "./fuseBoard";
import { HandRow } from "./handRow";
import { seatColour } from "./seatColours";
import { fuseBoardData } from "./presentation";

const content = loadContent();
const FONT = "Arial, Helvetica, sans-serif";

// Dev preview of the fuse board and the hand row (#253), with real engine states and views.
// Open with ?scene=board. Options: tree=sample|big|one|empty, hand=<n dominoes, default 10>,
// aw=<board area width, default 1490>, guides=0 (hide the layout guides), burn=1 (burn the fuses along, slowly). Hover a hand domino to
// light its legal ends and show its live numbers; click it to keep it picked and move over an end to aim.
export class BoardPreviewScene extends Phaser.Scene {
  constructor() {
    super("boardPreview");
  }

  create(): void {
    const q = new URLSearchParams(window.location.search);
    const tree = q.get("tree") ?? "sample";
    const state = this.build(tree, Number(q.get("hand") ?? 10));
    const me = "Ana";
    const view = getView(state, me);
    const pending = getPlayerChoices(view, me);

    this.add.rectangle(960, 540, 1920, 1080, 0x16402f);
    const layer = this.add.container(0, 0);
    if (q.get("guides") !== "0") this.guides(layer);

    const board = new FuseBoard(this, layer);
    const area = { ...boardArea(), w: Number(q.get("aw") ?? boardArea().w) };
    const ownerColour = (o: string) => seatColour(view.seatOrder, o);
    board.draw({
      board: view.board,
      dominoes: view.dominoes,
      area,
      ownerColour,
      openEnds: view.openEnds,
      fuseCharges: chargesInto(view, me),
      locked: view.locked,
      blessed: null,
      hot: 0xfff2a0,
    });

    const hand = view.players.find((p) => p.id === me)!.hand;
    const playable = new Set((pending?.plays ?? []).map((p) => p.domino));
    let picked: string | null = null; // the key of a clicked hand domino
    let over: string | null = null;
    let aim: number | "opener" | null = null;
    const refresh = () => {
      const key = over ?? picked;
      handRow.hover(key);
      board.clearLive();
      board.clearHighlight();
      const item = handRow.items.find((i) => i.key === key);
      const option = item && pending?.plays.find((p) => p.domino === item.id);
      if (!item || !option) return;
      const d = view.dominoes.find((x) => x.id === item.id)!;
      const targets: (number | "opener")[] = pending!.opener ? ["opener"] : option.ends;
      board.highlightLegal(pending!.opener ? [] : option.ends, pending!.opener);
      for (const t of targets) {
        const p = previewPlay(view, me, item.id, t === "opener" ? undefined : t);
        if (!p) continue;
        const reaching = t === "opener" ? fuseBoardData.openerCharge : view.openEnds.find((o) => o.end === t)?.charge ?? 0;
        board.showLive(t, liveNumber(d, p, reaching), aim === null || aim === t);
      }
    };
    const handRow: HandRow = new HandRow(this, layer, {
      onHover: (key) => { over = key; refresh(); },
      onDown: (key) => { picked = picked === key ? null : key; refresh(); },
    });
    const handInput = { dominoes: view.dominoes, playable, owner: ownerColour(me) };
    handRow.draw({ hand, ...handInput });

    // With a domino picked, moving over an end aims at it.
    for (const t of [...view.openEnds.map((o) => o.end), "opener" as const]) {
      const hit = board.hit(t);
      if (!hit) continue;
      hit.setInteractive();
      hit.on("pointerover", () => { aim = t; if (picked) refresh(); });
      hit.on("pointerout", () => { aim = null; if (picked) refresh(); });
    }

    if (q.get("burn") === "1") {
      this.time.delayedCall(300, () => {
        for (const e of view.board.ends) {
          if (!view.board.nodes.some((n) => n.end === e.id)) continue;
          this.time.delayedCall(view.board.nodes.find((n) => n.id === e.node)!.depth * 700, () => board.burn(e.id, 0xfff2a0, 1400));
        }
      });
    }
    // For the console and the screenshot script: draw a hand with more dominoes, animating the new ones in.
    const drawHand = (more: string[]) => handRow.draw({ hand: [...hand, ...more], ...handInput, previous: handRow.positions() });
    (window as unknown as { preview: unknown }).preview = { board, handRow, refresh, drawHand };
  }

  // Scripted plays on a real battle: Ana holds Hall of Mirrors, the Warden has locked Gale.
  private build(tree: string, handSize: number): BattleState {
    const names = ["Ana", "Ben"];
    let state = createBattle({
      config: content.config,
      content: { dominoes: content.dominoes, enemies: content.enemies },
      charms: content.charms,
      players: [{ id: "Ana", deck: content.starterDeck, charms: ["hall_of_mirrors"] }, { id: "Ben", deck: content.starterDeck }],
      seatOrder: names,
      enemyId: "warden",
      seed: 1,
    });
    state.locked = null; // the Warden locks a spark from the start; set below once the tree is built
    // Plays the domino for that seat, on output `index` of board node `node` (no end: the opener).
    const play = (seat: string, domino: string, at?: [number, number]) => {
      const hand = state.players.find((p) => p.id === seat)!.hand;
      if (!hand.includes(domino)) hand.push(domino);
      const end = at ? state.board.ends.find((e) => e.node === at[0] && e.index === at[1])!.id : undefined;
      try {
        state = step(state, { type: "play", player: seat, domino, end }).state;
      } catch (e) {
        throw new Error(`${seat} cannot play ${domino} at ${at}: ${(e as Error).message}`);
      }
    };
    if (tree === "sample") {
      play("Ana", "boost_ember");
      play("Ana", "junction_ember", [0, 0]);
      play("Ben", "boost_tide", [1, 0]);
      play("Ana", "strike_tide", [2, 0]);
      play("Ben", "guard_gale", [1, 1]);
      play("Ana", "boost_tide", [1, 2]);
      play("Ben", "junction_tide", [5, 0]);
    } else if (tree === "big") {
      // A long chain with a Hall of Mirrors junction at its root (the board allows 4 open ends at once).
      play("Ana", "boost_ember");
      play("Ana", "junction_ember", [0, 0]);
      play("Ben", "guard_gale", [1, 1]);
      play("Ben", "boost_tide", [1, 0]);
      play("Ana", "boost_tide", [3, 0]);
      play("Ben", "boost_tide", [4, 0]);
      play("Ana", "boost_tide", [5, 0]);
      play("Ben", "boost_tide", [6, 0]);
      play("Ana", "boost_tide", [7, 0]);
      play("Ben", "junction_tide", [8, 0]);
      play("Ana", "strike_tide", [1, 2]);
    } else if (tree === "one") {
      play("Ana", "boost_ember");
    }
    state.locked = tree === "empty" || tree === "one" ? null : "Gale";
    // Your hand: a mix, in no particular order.
    const all = ["strike_tide", "boost_gale_ember", "guard_tide", "junction_tide", "strike_gale", "boost_ember", "strike_ember", "junction_ember", "boost_tide", "guard_gale", "boost_ember_tide", "junction_gale"];
    state.players[0].hand = all.slice(0, Math.max(0, handSize));
    state.players[0].deck = state.players[0].deck.slice(0, 7);
    if (state.players[0].discard.length === 0) state.players[0].discard = ["strike_ember", "guard_gale"];
    return state;
  }

  // The rest of the combat screen's layout, as outlines: the seat tabs, the bars and the actions, so the board
  // and hand can be judged against them. (#228 builds the real ones.)
  private guides(layer: Phaser.GameObjects.Container): void {
    const g = this.add.graphics();
    layer.add(g);
    g.lineStyle(2, 0xb8c4b4, 0.35);
    const box = (x: number, y: number, w: number, h: number, label: string, fill = 0x000000) => {
      g.fillStyle(fill, 0.25);
      g.fillRoundedRect(x, y, w, h, 16);
      g.strokeRoundedRect(x, y, w, h, 16);
      layer.add(this.add.text(x + w / 2, y + h / 2, label, { fontFamily: FONT, fontSize: "20px", color: "#b8c4b4" }).setOrigin(0.5).setAlpha(0.7));
    };
    box(24, 24, 330, 1032, "left column");
    box(830, 318, 600, 34, "enemy bar");
    box(830, 806, 600, 34, "party bar");
    box(1610, 942, 300, 96, "Ready", 0xffd54a);
    g.lineStyle(2, 0xb8c4b4, 0.25);
    const a = boardArea();
    g.strokeRect(a.x, a.y, a.w, a.h);
    layer.add(this.add.text(404, 376, "board area", { fontFamily: FONT, fontSize: "16px", color: "#b8c4b4" }).setAlpha(0.6));
  }
}
