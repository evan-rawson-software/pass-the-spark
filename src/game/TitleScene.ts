import Phaser from "phaser";
import { artBackground } from "./art";

export class TitleScene extends Phaser.Scene {
  constructor() {
    super("title");
  }

  create(): void {
    artBackground(this, "title");
    this.add
      .text(960, 540, "Pass the Spark", { fontSize: "96px", color: "#ffffff" })
      .setOrigin(0.5);
  }
}
