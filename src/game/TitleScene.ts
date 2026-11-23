import Phaser from "phaser";
import { artBackground } from "./art";
import { fontRole } from "./fonts";

export class TitleScene extends Phaser.Scene {
  constructor() {
    super("title");
  }

  create(): void {
    artBackground(this, "title");
    this.add
      .text(960, 540, "Pass the Spark", { ...fontRole(96), color: "#ffffff" })
      .setOrigin(0.5);
  }
}
