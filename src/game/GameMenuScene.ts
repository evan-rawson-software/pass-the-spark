import Phaser from "phaser";
import { reducedFlashing, setComfort, shakeEnabled } from "./comfort";
import { debugPanel } from "./DebugPanel";
import { deckViewerState } from "./deckViewer";
import { SPEEDS, getPlaybackSpeed, setPlaybackSpeed } from "./playbackSpeed";
import { menuButtonSpot, onMenuButtonMove } from "./menuButton";
import { resetProfile } from "./profile";
import { leaveRun, onlineRun } from "./runSession";
import { SOUND_FILES, getSoundSettings, setSoundOut, setSoundSettings, soundKey } from "./sound";

// The game menu (#170, replacing the Sound button of #137). Always on top of every screen (it starts
// with the game and never stops): loads the sound files, draws the menu button in the top-right
// corner and the panel it opens (also opened and closed with Escape). Opening it pauses nothing:
// the screens underneath keep running and keep taking clicks outside the panel.

const FONT = "Arial, Helvetica, sans-serif";
const BASE = `${import.meta.env.BASE_URL}audio/`;
const BTN = { size: 52 }; // the button's size; where it sits is in menuButton.ts (the top-right corner unless a screen moves it)
const PX = 1440; // the panel
const PY = 72;
const PW = 440;
const BAR_X = PX + 150;
const BAR_W = 250;
const GOLD = 0xffd36b;

type Confirm = "leave" | "reset" | null;

export class GameMenuScene extends Phaser.Scene {
  private button!: Phaser.GameObjects.Graphics;
  private hit!: Phaser.GameObjects.Zone;
  private panel: Phaser.GameObjects.Container | null = null;
  private confirm: Confirm = null;

  constructor() {
    super({ key: "gameMenu", active: true });
  }

  preload(): void {
    // A file that fails to load just leaves that cue silent.
    for (const f of SOUND_FILES) this.load.audio(soundKey(f), BASE + f);
  }

  create(): void {
    setSoundOut({
      play: (key, config) => this.sound.play(key, config),
      has: (key) => this.cache.audio.exists(key),
    });
    this.button = this.add.graphics().setDepth(1000);
    this.hit = this.add
      .zone(menuButtonSpot().x, menuButtonSpot().y, BTN.size, BTN.size)
      .setInteractive({ useHandCursor: true })
      .setDepth(1000)
      .on("pointerdown", () => this.toggle());
    this.drawButton();
    const stop = onMenuButtonMove(() => {
      this.hit.setPosition(menuButtonSpot().x, menuButtonSpot().y);
      this.drawButton();
    });
    // Escape: the capture phase sees it before the deck viewer's own Escape handler closes the viewer.
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "Escape" || deckViewerState.open) return;
      if (el !== null && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      this.toggle();
    };
    window.addEventListener("keydown", onKey, true);
    this.events.once("shutdown", () => {
      window.removeEventListener("keydown", onKey, true);
      stop();
    });
  }

  private toggle(): void {
    this.confirm = null;
    if (this.panel) this.close();
    else this.open();
    this.drawButton();
  }

  private close(): void {
    this.panel?.destroy(true);
    this.panel = null;
  }

  private open(): void {
    this.close();
    const panel = this.add.container(0, 0).setDepth(1000);
    this.panel = panel;
    const items: Phaser.GameObjects.GameObject[] = [];
    let y = PY + 20;
    const text = (x: number, ty: number, s: string, size: number, color = "#ffffff", bold = false, originX = 0): void => {
      items.push(this.add.text(x, ty, s, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? "bold" : "normal" }).setOrigin(originX, 0.5));
    };
    const button = (cx: number, cy: number, s: string, onClick: () => void, opts: { fill?: string; width?: number } = {}): void => {
      const t = this.add
        .text(cx, cy, s, { fontFamily: FONT, fontSize: "24px", fontStyle: "bold", color: "#ffffff", backgroundColor: opts.fill ?? "#1e5a42", padding: { x: 16, y: 6 }, align: "center", ...(opts.width ? { fixedWidth: opts.width } : {}) })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      t.on("pointerdown", onClick);
      items.push(t);
    };
    const heading = (s: string): void => {
      text(PX + 20, y, s, 22, "#9fd1b8", true);
      y += 36;
    };

    if (this.confirm) {
      const reset = this.confirm === "reset";
      text(PX + PW / 2, y + 10, reset ? "Erase all experience and unlocks?" : "Leave to the title screen?", 26, "#ffffff", true, 0.5);
      y += 60;
      if (!reset) {
        const t = this.add.text(PX + 24, y, this.leaveWarning(), { fontFamily: FONT, fontSize: "22px", color: "#ffd0cc", wordWrap: { width: PW - 48 } });
        items.push(t);
        y += t.height + 24;
      }
      button(PX + 110, y, reset ? "Yes, reset" : "Yes, leave", () => this.doConfirm(), { fill: "#8a2f2a", width: 180 });
      button(PX + PW - 110, y, "Cancel", () => {
        this.confirm = null;
        this.open();
      }, { width: 180 });
      y += 40;
    } else {
      text(PX + 20, y + 4, "Menu", 30, "#ffffff", true);
      button(PX + PW - 80, y + 4, "Resume", () => this.toggle());
      y += 56;

      heading("Sound");
      this.slider(items, "Master", y, "master");
      y += 46;
      this.slider(items, "Effects", y, "effects");
      y += 46;
      const muted = getSoundSettings().muted;
      button(PX + PW / 2, y, muted ? "Unmute" : "Mute", () => {
        setSoundSettings({ muted: !muted });
        this.open();
      });
      y += 56;

      heading("Playback speed");
      SPEEDS.forEach((v, i) => {
        button(PX + 62 + i * 105, y, `${v}×`, () => {
          setPlaybackSpeed(v);
          this.open();
        }, { fill: v === getPlaybackSpeed() ? "#b8860b" : "#0d2a20", width: 90 });
      });
      y += 56;

      heading("Comfort");
      const toggle = (label: string, on: boolean, set: (v: boolean) => void): void => {
        text(PX + 20, y, label, 24);
        button(PX + PW - 80, y, on ? "On" : "Off", () => {
          set(!on);
          this.open();
        }, { fill: on ? "#1e5a42" : "#0d2a20", width: 90 });
        y += 46;
      };
      toggle("Screen shake", shakeEnabled(), (v) => setComfort({ shake: v }));
      toggle("Reduced flashing", reducedFlashing(), (v) => setComfort({ reducedFlashing: v }));
      y += 10;

      if (debugPanel.available) {
        button(PX + PW / 2, y, "Debug panel (`)", () => debugPanel.toggle(), { fill: "#0d2a20" });
        y += 50;
      }
      const m = this.scene.manager;
      const start = m.isActive("menu") || m.isActive("start");
      if (start) button(PX + PW / 2, y, "Reset progress", () => this.ask("reset"), { fill: "#0d2a20" });
      else {
        const lobby = m.isActive("hostLobby") || m.isActive("join");
        button(PX + PW / 2, y, lobby ? "Leave the room" : "Leave game", () => this.ask("leave"), { fill: "#0d2a20" });
      }
      y += 40;
    }
    const h = y - PY + 20;
    const bg = this.add.graphics();
    bg.fillStyle(0x0d2a20, 1);
    bg.fillRoundedRect(PX, PY, PW, h, 14);
    bg.lineStyle(3, 0x2f7a5b, 1);
    bg.strokeRoundedRect(PX, PY, PW, h, 14);
    // Clicks on the panel stop here; clicks outside it still reach the screen below.
    const block = this.add.zone(PX, PY, PW, h).setOrigin(0).setInteractive();
    // Behind the panel, a full-screen blocker: while the menu is open the local player's clicks do not
    // reach the screen below (nothing pauses for anyone else). A click on it closes the menu.
    const blocker = this.add.zone(0, 0, 1920, 1080).setOrigin(0).setInteractive();
    blocker.on("pointerdown", () => this.toggle());
    panel.add([blocker, bg, block, ...items]);
  }

  private slider(items: Phaser.GameObjects.GameObject[], name: string, y: number, field: "master" | "effects"): void {
    items.push(this.add.text(PX + 20, y, name, { fontFamily: FONT, fontSize: "24px", color: "#ffffff" }).setOrigin(0, 0.5));
    const g = this.add.graphics();
    const draw = (): void => {
      const s = getSoundSettings();
      g.clear();
      g.fillStyle(0x2f7a5b, 1);
      g.fillRoundedRect(BAR_X, y - 6, BAR_W, 12, 6);
      g.fillStyle(s.muted ? 0x777777 : GOLD, 1);
      g.fillRoundedRect(BAR_X, y - 6, BAR_W * s[field], 12, 6);
      g.fillCircle(BAR_X + BAR_W * s[field], y, 11);
    };
    draw();
    items.push(g);
    const zone = this.add.zone(BAR_X + BAR_W / 2, y, BAR_W + 24, 40).setInteractive({ useHandCursor: true });
    const set = (p: Phaser.Input.Pointer): void => {
      setSoundSettings({ [field]: Math.min(1, Math.max(0, (p.x - BAR_X) / BAR_W)) });
      draw();
    };
    zone.on("pointerdown", set);
    zone.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (p.isDown) set(p);
    });
    items.push(zone);
  }

  private ask(which: Confirm): void {
    this.confirm = which;
    this.open();
  }

  // What leaving does, in plain words. Lobbies close their own room when they shut down (see
  // HostLobbyScene and JoinScene); a run's host or client is closed by leaveRun.
  private leaveWarning(): string {
    const online = onlineRun();
    const host = online ? online.host !== undefined : this.scene.manager.isActive("hostLobby");
    const player = online ? online.host === undefined : this.scene.manager.isActive("join");
    if (host) return "You are the host: leaving ends the game for everyone.";
    if (player) return "You leave the room. Open the room link again to rejoin your seat.";
    return "A single player run is not saved: leaving loses it.";
  }

  private doConfirm(): void {
    const which = this.confirm;
    this.confirm = null;
    this.close();
    this.drawButton();
    if (which === "reset") {
      resetProfile();
      const m = this.scene.manager;
      if (m.isActive("menu")) m.getScene("menu").scene.restart(); // the start screen draws its experience bar again
    } else if (which === "leave") {
      leaveRun();
      deckViewerState.open = false; // an overlay left open would block Escape and the map
      deckViewerState.onClose = null;
      this.scene.manager.getScenes(true).find((s) => s !== this)?.scene.start("menu");
    }
  }

  private drawButton(): void {
    const g = this.button;
    const { x, y } = menuButtonSpot();
    const size = BTN.size;
    g.clear();
    g.fillStyle(0x0d2a20, 0.95);
    g.fillRoundedRect(x - size / 2, y - size / 2, size, size, 10);
    g.lineStyle(3, this.panel ? GOLD : 0x2f7a5b, 1);
    g.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 10);
    g.fillStyle(0xffffff, 1);
    for (const dy of [-10, 0, 10]) g.fillRoundedRect(x - 15, y + dy - 2.5, 30, 5, 2.5);
  }
}
