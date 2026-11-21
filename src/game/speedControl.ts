import Phaser from "phaser";
import { SPEEDS, getPlaybackSpeed, onPlaybackSpeedChange, setPlaybackSpeed } from "./playbackSpeed";
import { speedControlData as D } from "./presentation";

// The combat playback speed control (#220): one small button showing the speed, which opens a list
// of speeds above it. It lives outside the scene's redrawn layer so the list stays open across
// redraws, and it follows the setting itself (the menu can change it). No rules here.

const FONT = "Arial, Helvetica, sans-serif";
const GOLD = 0xffe14d;

export class SpeedControl {
  private box: Phaser.GameObjects.Container;
  private open = false;
  private hit = false; // a click landed on the button or the list
  private stop: () => void;

  constructor(private scene: Phaser.Scene) {
    this.box = scene.add.container(0, 0).setDepth(D.depth);
    this.stop = onPlaybackSpeedChange(() => this.draw());
    // A click anywhere that is not this control closes the list; so does Escape.
    scene.input.on("pointerdown", this.onPointer, this);
    scene.input.keyboard?.on("keydown-ESC", this.close, this);
    scene.events.once("shutdown", () => this.destroy());
    this.draw();
  }

  // The scene-level event comes after the zones' own handlers (which redraw, destroying the zone),
  // so the zones raise a flag instead of being looked up in the click's list.
  isOpen(): boolean {
    return this.open;
  }

  private onPointer(): void {
    if (this.hit) this.hit = false;
    else this.close();
  }

  private close(): void {
    if (!this.open) return;
    this.open = false;
    this.draw();
  }

  private destroy(): void {
    this.stop();
    this.scene.input.off("pointerdown", this.onPointer, this);
    this.scene.input.keyboard?.off("keydown-ESC", this.close, this);
    this.box.destroy(true);
  }

  private draw(): void {
    const s = this.scene;
    this.box.removeAll(true);
    const cur = getPlaybackSpeed();
    const left = D.right - D.buttonW;
    const top = D.y - D.buttonH / 2;
    const text = (x: number, y: number, t: string, color: string) =>
      s.add.text(x, y, t, { fontFamily: FONT, fontSize: `${D.fontSize}px`, color, fontStyle: "bold" }).setOrigin(0.5);

    // Zones are the interactive objects: a click on them is not "click on empty table" (the skip).
    const g = s.add.graphics();
    g.fillStyle(0x0d2a20, 0.95);
    g.fillRoundedRect(left, top, D.buttonW, D.buttonH, D.buttonH / 2);
    g.lineStyle(2, GOLD, this.open ? 1 : 0.5);
    g.strokeRoundedRect(left, top, D.buttonW, D.buttonH, D.buttonH / 2);
    this.box.add([g, text(left + D.buttonW / 2, D.y, `▶ ${cur}×`, "#ffffff")]);
    const hint = s.add.text(left + D.buttonW / 2, top - 6, "Playback speed", { fontFamily: FONT, fontSize: "18px", color: "#cfe9dc", backgroundColor: "#101010", padding: { x: 8, y: 4 } }).setOrigin(0.5, 1).setVisible(false);
    const z = s.add.zone(left + D.buttonW / 2, D.y, D.buttonW, D.buttonH).setInteractive({ useHandCursor: true });
    z.on("pointerover", () => !this.open && hint.setVisible(true));
    z.on("pointerout", () => hint.setVisible(false));
    z.on("pointerdown", () => {
      this.hit = true;
      this.open = !this.open;
      this.draw();
    });
    this.box.add([z, hint]);
    if (!this.open) return;

    // The list opens upward from the button; if it would leave the screen it opens downward instead.
    const h = SPEEDS.length * D.itemH;
    const up = top - D.gap - h;
    const listTop = up >= 0 ? up : top + D.buttonH + D.gap;
    const lg = s.add.graphics();
    lg.fillStyle(0x0d2a20, 0.98);
    lg.fillRoundedRect(left, listTop, D.buttonW, h, 14);
    lg.lineStyle(2, GOLD, 0.8);
    lg.strokeRoundedRect(left, listTop, D.buttonW, h, 14);
    this.box.add(lg);
    // Fastest at the top, so the list reads in the order it grows away from the button.
    [...SPEEDS].reverse().forEach((v, i) => {
      const cy = listTop + i * D.itemH + D.itemH / 2;
      const on = v === cur;
      if (on) {
        const hl = s.add.graphics();
        hl.fillStyle(GOLD, 1);
        hl.fillRoundedRect(left + 4, cy - D.itemH / 2 + 3, D.buttonW - 8, D.itemH - 6, 10);
        this.box.add(hl);
      }
      this.box.add(text(left + D.buttonW / 2, cy, `${on ? "✓ " : ""}${v}×`, on ? "#2a2200" : "#ffffff"));
      const iz = s.add.zone(left + D.buttonW / 2, cy, D.buttonW, D.itemH).setInteractive({ useHandCursor: true });
      iz.on("pointerdown", () => {
        this.hit = true;
        this.open = false;
        setPlaybackSpeed(v); // draws the control again through the change listener
      });
      this.box.add(iz);
    });
  }
}
