import Phaser from "phaser";
import art from "../../data/wizard-art.json";
import { randomLook } from "../net/look";
import type { Look } from "../net/look";
import { wizardLookData as D } from "./presentation";
import { button } from "./ui";
import { colourNumber, Wizard } from "./wizard";
import { fontRole, snap } from "./fonts";

// The wardrobe (#262): one panel for choosing a look, used by the online lobby and the single player
// start screen. A big preview of your wizard idling, 8 colour swatches (a colour someone else has is
// faded, shows their name and can't be picked: Z6), 5 hats and 5 robes each on a small wizard, and
// Randomize. It draws what it is given and reports each pick through onChange; the screen that
// opens it decides what to do with the pick (send it to the host, or keep it).

export interface WardrobeOptions {
  look: Look; // the look to show to begin with
  taken: Record<string, string>; // colour id -> name of the other player who has it
  onChange(look: Look): void; // called at once with every pick
  onClose(): void; // Done was pressed
}

// "#rrggbb" for a text colour.
export function cssColour(n: number): string {
  return "#" + n.toString(16).padStart(6, "0");
}

// The colours the other seats have, with their names, for a lobby list.
export function takenByOthers(players: { seat: string; name: string; look: Look }[], mySeat: string): Record<string, string> {
  return Object.fromEntries(players.filter((p) => p.seat !== mySeat).map((p) => [p.look.colour, p.name]));
}

export class Wardrobe {
  private root: Phaser.GameObjects.Container;
  private look: Look;
  private taken: Record<string, string>;

  constructor(private scene: Phaser.Scene, private options: WardrobeOptions) {
    this.look = options.look;
    this.taken = options.taken;
    this.root = scene.add.container(960, 540).setDepth(1000);
    this.draw();
  }

  // Shows the truth again (the host's lobby changed, or it ignored a pick).
  sync(look: Look, taken: Record<string, string>): void {
    if (JSON.stringify([look, taken]) === JSON.stringify([this.look, this.taken])) return;
    this.look = look;
    this.taken = taken;
    this.draw();
  }

  destroy(): void {
    this.root.destroy();
  }

  private pick(look: Look): void {
    this.look = look;
    this.draw();
    this.options.onChange(look);
  }

  private draw(): void {
    const root = this.root;
    root.removeAll(true);
    const look = this.look;
    // A backdrop that dims the screen and keeps clicks from reaching it, then the panel.
    const backdrop = this.scene.add.rectangle(0, 0, 1920, 1080, 0x000000, D.wardrobe.dim).setInteractive();
    const panel = this.scene.add.rectangle(0, 0, D.wardrobe.w, D.wardrobe.h, 0x14382b).setStrokeStyle(4, 0x2f7a5b);
    root.add([backdrop, panel]);
    const text = (x: number, y: number, s: string, size: number, color = "#ffffff", bold = false, origin = 0) =>
      root.add(snap(this.scene.add.text(x, y, s, { ...fontRole(size), color }).setOrigin(origin, 0.5)));

    text(D.wardrobe.title.x, D.wardrobe.title.y, "Your wizard", D.wardrobe.title.size, "#ffffff", true);

    // The big preview, idling.
    root.add(new Wizard(this.scene, D.preview.x, D.preview.y, look, { scale: D.preview.scale, anims: ["idle"] }));

    // Colours.
    const sw = D.swatches;
    text(sw.left - sw.size / 2, sw.labelY, "Colour", 30, "#9fd1b8", true);
    art.colours.forEach((c, i) => {
      const x = sw.left + i * sw.pitch;
      const owner = this.taken[c.id];
      const circle = this.scene.add.circle(x, sw.y, sw.size / 2, colourNumber(c.id)).setAlpha(owner ? 0.25 : 1);
      if (c.id === look.colour) circle.setStrokeStyle(6, 0xffffff);
      else circle.setStrokeStyle(3, 0x0d2a20);
      if (!owner) circle.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.pick({ ...look, colour: c.id }));
      root.add(circle);
      if (owner) {
        const name = owner.length > sw.nameLetters ? owner.slice(0, sw.nameLetters - 1) + "…" : owner;
        text(x, sw.y + sw.nameY, name, 18, "#cfe9dc", false, 0.5);
      }
    });

    // Hats and robes, each shown on a small wizard wearing it (and the rest of the current look).
    const t = D.tiles;
    const tiles = (rowY: number, title: string, items: { id: string; name: string }[], mine: string, make: (id: string) => Look) => {
      text(t.left - t.w / 2, rowY + t.labelOffsetY, title, 30, "#9fd1b8", true);
      items.forEach((item, i) => {
        const x = t.left + i * t.pitch;
        const on = item.id === mine;
        const box = this.scene.add.rectangle(x, rowY, t.w, t.h, on ? 0x2a6b4f : 0x0d2a20).setStrokeStyle(on ? 5 : 2, on ? 0xffd54a : 0x2f7a5b);
        box.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.pick(make(item.id)));
        root.add(box);
        root.add(new Wizard(this.scene, x, rowY + 38, make(item.id), { scale: t.scale, anims: ["idle"] }).play("idle", undefined, i * 240));
        text(x, rowY + t.h / 2 - 12, item.name, 18, "#ffffff", false, 0.5);
      });
    };
    tiles(t.hatY, "Hat", art.hats, look.hat, (id) => ({ ...look, hat: id }));
    tiles(t.robeY, "Robe", art.robes, look.robe, (id) => ({ ...look, robe: id }));

    const b = D.wardrobe.buttons;
    root.add(button(this.scene, b.randomX, b.y, "Randomize", () => this.pick(randomLook(Object.keys(this.taken))), { size: b.size, origin: 0.5 }));
    root.add(button(this.scene, b.doneX, b.y, "Done", () => this.options.onClose(), { size: b.size, origin: 0.5 }));
  }
}

// A wizard for a list row: idle only, a little out of step with the others.
export function listWizard(scene: Phaser.Scene, x: number, y: number, look: Look, scale: number, row: number): Wizard {
  return new Wizard(scene, x, y, look, { scale, anims: ["idle"] }).play("idle", undefined, row * 240);
}
