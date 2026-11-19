import { ENEMY_SEAT, getPendingChoice } from "../engine/battle";
import type { BattleState } from "../engine/battle";
import { dominoes } from "./devBattle";

// Developer debug panel (#28). A plain HTML overlay, hidden until the backtick key opens it.
// The scene hooks in through DebugHost; nothing here is a game rule except the explicit
// "set hands" edit, which builds a modified BattleState directly (debug tool only).

export interface DebugHost {
  getState(): BattleState | null;
  getSeed(): number;
  // Online, on the host: the panel only looks (enemy hand, step mode, state dump). Restarting and
  // editing hands would have to go through the host, which is not part of #34.
  readOnly?: boolean;
  isLocked(): boolean; // true while events play back
  restart(seed: number): void;
  setState(state: BattleState): void;
  redraw(): void;
}

const STYLE =
  "position:fixed;top:8px;right:8px;width:340px;max-height:calc(100% - 16px);overflow:auto;z-index:1000;" +
  "background:rgba(20,10,10,0.94);color:#f3e6e6;border:2px solid #e0443e;border-radius:8px;" +
  "font:13px Arial,Helvetica,sans-serif;padding:10px;box-sizing:border-box;display:none";
const BTN = "margin:2px 4px 2px 0;padding:3px 8px;cursor:pointer";

class DebugPanel {
  showEnemyHand = false;
  stepMode = false;
  allowFewerPlayers = false; // the online lobby's Start works with fewer than 3 players
  onLobbyChange: (() => void) | null = null; // the lobby screen redraws when this changes
  private enabled = true; // off for a player who joined someone else's room
  private host: DebugHost | null = null;
  private root: HTMLDivElement | null = null;
  private release: (() => void) | null = null;
  private stepLabel = "";
  private editTarget = "";
  private editHand: string[] = [];

  // The panel is for the host and for single player. A joined client switches it off.
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on && this.root) this.root.style.display = "none";
  }

  // Called once at startup.
  install(): void {
    window.addEventListener("keydown", (e) => this.onKey(e));
  }

  attach(host: DebugHost): void {
    this.host = host;
    this.editTarget = "";
    this.render();
  }

  detach(host: DebugHost): void {
    if (this.host !== host) return;
    this.host = null;
    this.releaseStep();
    this.render();
  }

  // The scene calls this when its state changes and when playback starts or ends: reload the
  // hand editor from the current state and redraw the panel.
  stateChanged(): void {
    const state = this.host?.getState();
    if (state && this.editTarget) this.editHand = this.handOf(state, this.editTarget);
    this.render();
  }

  get open(): boolean {
    return this.root !== null && this.root.style.display !== "none";
  }

  private onKey(e: KeyboardEvent): void {
    const el = e.target as HTMLElement | null;
    const typing = el !== null && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
    if (e.key === "`") {
      if (typing || !this.enabled) return;
      e.preventDefault();
      this.toggle();
    } else if (e.key === " " && this.stepMode && this.release && !typing) {
      e.preventDefault();
      this.releaseStep();
    }
  }

  private toggle(): void {
    if (!this.root) {
      this.root = document.createElement("div");
      this.root.style.cssText = STYLE;
      document.body.appendChild(this.root);
    }
    const show = this.root.style.display === "none";
    this.root.style.display = show ? "block" : "none";
    if (show) this.stateChanged();
  }

  // ---- step mode (playback hook) ----

  // Playback calls this after showing each event while step mode is on. Resolves on the
  // next key press or button click (or when step mode is turned off or the scene goes away).
  waitForStep(label: string): Promise<void> {
    this.stepLabel = label;
    const wait = new Promise<void>((resolve) => {
      this.release = resolve;
    });
    this.render();
    return wait;
  }

  releaseStep(): void {
    const r = this.release;
    this.release = null;
    this.stepLabel = "";
    r?.();
    this.render();
  }

  // ---- UI ----

  private render(): void {
    if (!this.root || !this.open) return;
    const root = this.root;
    // Keep the typed seed and the dump box across re-renders.
    const seedBox = root.querySelector<HTMLInputElement>("#dbg-seed");
    const typedSeed = seedBox?.value;
    const dump = root.querySelector<HTMLTextAreaElement>("#dbg-dump")?.value ?? "";
    root.innerHTML = "";
    const host = this.host;
    const add = <K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, text = ""): HTMLElementTagNameMap[K] => {
      const el = document.createElement(tag);
      if (text) el.textContent = text;
      parent.appendChild(el);
      return el;
    };
    const button = (parent: HTMLElement, text: string, onClick: () => void): HTMLButtonElement => {
      const b = add(parent, "button", text);
      b.style.cssText = BTN;
      b.addEventListener("click", onClick);
      return b;
    };
    const section = (title: string): HTMLDivElement => {
      const d = add(root, "div");
      d.style.cssText = "border-top:1px solid #6a3a3a;margin-top:8px;padding-top:6px";
      const h = add(d, "div", title);
      h.style.cssText = "font-weight:bold;margin-bottom:4px";
      return d;
    };

    const head = add(root, "div", "DEBUG PANEL (debug only, ` to close)");
    head.style.cssText = "font-weight:bold;color:#ff8a84";
    if (!host) {
      add(root, "div", "No battle running.").style.marginTop = "6px";
      const l = section("Online lobby");
      const lLabel = add(l, "label");
      const lBox = add(lLabel, "input");
      lBox.type = "checkbox";
      lBox.checked = this.allowFewerPlayers;
      lBox.addEventListener("change", () => {
        this.allowFewerPlayers = lBox.checked;
        this.onLobbyChange?.();
      });
      add(lLabel, "span", " Host can start with fewer than 3 players");
      return;
    }
    const state = host.getState();
    if (!state) {
      add(root, "div", "No battle running.").style.marginTop = "6px";
      return;
    }

    // Seed
    const s = section("Seed");
    s.style.display = host.readOnly ? "none" : "block";
    add(s, "div", `Current seed: ${host.getSeed()}`);
    const input = add(s, "input");
    input.id = "dbg-seed";
    input.type = "text";
    input.value = typedSeed ?? String(host.getSeed());
    input.style.cssText = "width:120px;margin-right:4px";
    const msg = add(s, "div");
    msg.style.color = "#ff8a84";
    button(s, "Restart with seed", () => {
      const n = Number(input.value.trim());
      if (input.value.trim() === "" || !Number.isFinite(n)) {
        msg.textContent = "Seed must be a number.";
        return;
      }
      host.restart(n);
    });

    // Enemy hand
    const e = section("Enemy hand");
    const eLabel = add(e, "label");
    const eBox = add(eLabel, "input");
    eBox.type = "checkbox";
    eBox.checked = this.showEnemyHand;
    eBox.addEventListener("change", () => {
      this.showEnemyHand = eBox.checked;
      host.redraw();
    });
    add(eLabel, "span", " Show enemy hand (DEBUG, reveals hidden dominoes)");

    // Step mode
    const st = section("Step mode");
    const sLabel = add(st, "label");
    const sBox = add(sLabel, "input");
    sBox.type = "checkbox";
    sBox.checked = this.stepMode;
    sBox.addEventListener("change", () => {
      this.stepMode = sBox.checked;
      if (!this.stepMode) this.releaseStep();
      else this.render();
    });
    add(sLabel, "span", " Pause playback, one event per step");
    const next = button(st, "Next event (Space)", () => this.releaseStep());
    next.disabled = this.release === null;
    if (this.stepMode) add(st, "div", this.release ? `Showing: ${this.stepLabel}` : "Waiting for an event...");

    // Set hands
    const h = section("Set hands");
    h.style.display = host.readOnly ? "none" : "block";
    if (host.readOnly) {
      // nothing: editing is single player only
    } else if (host.isLocked()) {
      add(h, "div", "Only between choices (playback is running).");
    } else {
      this.renderSetHands(h, state, host, add, button);
    }

    // State dump
    const d = section("State dump");
    const out = add(d, "div");
    const ta = add(d, "textarea");
    ta.id = "dbg-dump";
    ta.value = dump;
    ta.readOnly = true;
    ta.style.cssText = "width:100%;height:" + (dump ? "100px" : "0") + ";display:" + (dump ? "block" : "none");
    button(d, "Copy BattleState JSON", () => {
      const json = JSON.stringify(host.getState(), null, 2);
      const fallback = (why: string) => {
        ta.value = json;
        ta.style.display = "block";
        ta.style.height = "100px";
        ta.select();
        out.textContent = `Could not copy (${why}). JSON is in the box below: select all and copy.`;
      };
      try {
        void navigator.clipboard.writeText(json).then(
          () => {
            out.textContent = `Copied ${json.length} characters.`;
          },
          (err: unknown) => fallback(String(err)),
        );
      } catch (err) {
        fallback(String(err));
      }
    });
  }

  private renderSetHands(
    parent: HTMLElement,
    state: BattleState,
    host: DebugHost,
    add: <K extends keyof HTMLElementTagNameMap>(p: HTMLElement, tag: K, text?: string) => HTMLElementTagNameMap[K],
    button: (p: HTMLElement, text: string, onClick: () => void) => HTMLButtonElement,
  ): void {
    const seats = [...state.players.map((p) => p.id), ENEMY_SEAT];
    if (!seats.includes(this.editTarget)) {
      this.editTarget = seats[0];
      this.editHand = this.handOf(state, this.editTarget);
    }
    const sel = add(parent, "select");
    for (const id of seats) {
      const o = add(sel, "option", id === ENEMY_SEAT ? "Enemy" : id);
      o.value = id;
    }
    sel.value = this.editTarget;
    sel.addEventListener("change", () => {
      this.editTarget = sel.value;
      this.editHand = this.handOf(host.getState() ?? state, this.editTarget);
      this.render();
    });
    const limit = this.limitOf(state, this.editTarget);
    add(parent, "div", `Hand (${this.editHand.length} / ${limit}). Click a domino to remove it:`).style.margin = "4px 0 2px";
    const chips = add(parent, "div");
    chips.id = "dbg-chips";
    if (this.editHand.length === 0) add(chips, "span", "(empty)");
    this.editHand.forEach((id, i) => {
      button(chips, name(id), () => {
        this.editHand.splice(i, 1);
        this.render();
      });
    });
    const pick = add(parent, "select");
    for (const d of dominoes) {
      const o = add(pick, "option", d.name);
      o.value = d.id;
    }
    button(parent, "Add", () => {
      if (this.editHand.length >= limit) {
        err.textContent = `Hand limit is ${limit}.`;
        return;
      }
      this.editHand.push(pick.value);
      this.render();
    });
    const err = add(parent, "div");
    err.style.color = "#ff8a84";
    button(parent, "Apply hand", () => {
      const result = this.withHand(host.getState() ?? state, this.editTarget, this.editHand);
      if (typeof result === "string") {
        err.textContent = result;
        return;
      }
      host.setState(result);
      this.render();
    });
  }

  private handOf(state: BattleState, seat: string): string[] {
    return (seat === ENEMY_SEAT ? state.enemy.hand : (state.players.find((p) => p.id === seat)?.hand ?? [])).slice();
  }

  private limitOf(state: BattleState, seat: string): number {
    return seat === ENEMY_SEAT ? state.enemy.handLimit : state.config.playerHandLimit;
  }

  // The debug edit: a copy of the state with one hand replaced. Returns an error text if the
  // result would leave the battle without a playable turn.
  private withHand(input: BattleState, seat: string, hand: string[]): BattleState | string {
    const state: BattleState = JSON.parse(JSON.stringify(input));
    if (seat === ENEMY_SEAT) {
      const old = state.enemy;
      // Keep revealed the same length as hand; a slot stays revealed only if it is unchanged.
      state.enemy.revealed = hand.map((id, i) => old.hand[i] === id && old.revealed[i] === true);
      state.enemy.hand = hand.slice();
    } else {
      const p = state.players.find((q) => q.id === seat);
      if (!p) return "No such player.";
      p.hand = hand.slice();
    }
    const pending = getPendingChoice(state);
    if (pending && pending.type === "opener" && pending.dominoes.length === 0) return "The lead would have no opener.";
    if (pending && pending.type === "answer" && pending.options.length === 0) return "The player on turn would have no answer.";
    return state;
  }
}

function name(id: string): string {
  return dominoes.find((d) => d.id === id)?.name ?? id;
}

export const debugPanel = new DebugPanel();
