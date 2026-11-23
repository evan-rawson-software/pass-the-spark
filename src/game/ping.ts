import Phaser from "phaser";
import type { PingTarget } from "../net/protocol";
import { fontRole } from "./fonts";

// Pings (#136): hold on a visible domino to point at it for the whole party. Not game state: the
// host checks and relays the message, and the ring below is drawn on every screen from it.

export const HOLD_MS = 500;
export const PING_SHOW_MS = 3000;

// Which drawn domino a target names; the combat screen files its dominoes under the same keys.
export function pingKey(t: PingTarget): string {
  return t.zone === "hand" ? `hand:${t.seat}:${t.index}` : `${t.zone}:${t.index}`;
}

// Makes a domino react to a hold (ping) and to a tap (the normal click, if it has one). A tap
// fires when the button comes up, so a hold can be told apart from it and never also plays.
export function attachHold(scene: Phaser.Scene, c: Phaser.GameObjects.Container, onHold: () => void, onTap?: () => void): void {
  let timer: Phaser.Time.TimerEvent | null = null;
  let down = false;
  let held = false;
  const cancel = () => {
    timer?.remove();
    timer = null;
    down = false;
  };
  c.on("pointerdown", () => {
    cancel();
    down = true;
    held = false;
    timer = scene.time.delayedCall(HOLD_MS, () => {
      timer = null;
      held = true;
      onHold();
    });
  });
  c.on("pointerup", () => {
    const tap = down && !held;
    cancel();
    if (tap) onTap?.();
  });
  c.on("pointerout", cancel);
  c.on("destroy", cancel);
}

interface Mark {
  name: string;
  target: PingTarget;
}

// The rings on the table: one per pinger, each gone after a few seconds. They live outside the
// table's redraw layer, so a redraw only has to call place() again with the new positions.
export class PingMarks {
  private marks = new Map<string, Mark>(); // by seat: a new ping replaces the old
  private layer: Phaser.GameObjects.Container;
  private boxes = new Map<string, Phaser.GameObjects.Container>();

  constructor(private scene: Phaser.Scene) {
    this.layer = scene.add.container(0, 0).setDepth(950);
  }

  show(seat: string, name: string, target: PingTarget): void {
    const mark: Mark = { name, target };
    this.marks.set(seat, mark);
    this.paint();
    this.scene.time.delayedCall(PING_SHOW_MS, () => {
      if (this.marks.get(seat) !== mark) return; // replaced by a newer ping
      this.marks.delete(seat);
      this.paint();
    });
  }

  // After a redraw: the dominoes' new positions.
  place(boxes: Map<string, Phaser.GameObjects.Container>): void {
    this.boxes = boxes;
    this.paint();
  }

  private paint(): void {
    this.layer.removeAll(true);
    for (const mark of this.marks.values()) {
      const c = this.boxes.get(pingKey(mark.target));
      if (!c?.scene) continue;
      const w = c.width * c.scaleX + 16;
      const h = c.height * c.scaleY + 16;
      const g = this.scene.add.graphics();
      g.lineStyle(14, 0xffe14d, 0.3);
      g.strokeRoundedRect(c.x - w / 2 - 4, c.y - h / 2 - 4, w + 8, h + 8, 16);
      g.lineStyle(6, 0xffe14d, 1);
      g.strokeRoundedRect(c.x - w / 2, c.y - h / 2, w, h, 12);
      const label = this.scene.add
        .text(c.x, Math.max(16, c.y - h / 2 - 14), mark.name, {
          ...fontRole(24), color: "#2a2200", backgroundColor: "#ffe14d", padding: { x: 8, y: 2 },
        })
        .setOrigin(0.5);
      this.layer.add([g, label]);
    }
  }
}
