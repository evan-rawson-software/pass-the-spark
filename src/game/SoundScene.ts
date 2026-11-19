import Phaser from "phaser";
import { SOUND_FILES, getSoundSettings, setSoundOut, setSoundSettings, soundKey } from "./sound";

// Always on top of every screen (it starts with the game and never stops): loads the sound files
// and draws the sound button in the top-right corner, which opens the volume panel (#137).

const FONT = "Arial, Helvetica, sans-serif";
const BASE = `${import.meta.env.BASE_URL}audio/`;
const PX = 1500; // the panel
const PY = 70;
const PW = 380;
const BAR_X = PX + 150;
const BAR_W = 200;

export class SoundScene extends Phaser.Scene {
  private panel!: Phaser.GameObjects.Container;
  private icon!: Phaser.GameObjects.Text;
  private bars: Phaser.GameObjects.Graphics[] = [];
  private muteLabel!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "sound", active: true });
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
    this.icon = this.add
      .text(1860, 36, "", { fontFamily: FONT, fontSize: "26px", color: "#ffffff", backgroundColor: "#0d2a20", padding: { x: 10, y: 6 } })
      .setOrigin(0.5)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });
    this.icon.on("pointerdown", () => this.panel.setVisible(!this.panel.visible));

    this.panel = this.add.container(0, 0).setDepth(1000).setVisible(false);
    const bg = this.add.graphics();
    bg.fillStyle(0x0d2a20, 0.96);
    bg.fillRoundedRect(PX, PY, PW, 190, 14);
    this.panel.add(bg);
    this.slider("Master", PY + 35, "master");
    this.slider("Effects", PY + 85, "effects");
    this.muteLabel = this.add
      .text(PX + PW / 2, PY + 150, "", { fontFamily: FONT, fontSize: "24px", fontStyle: "bold", color: "#ffffff", backgroundColor: "#1e5a42", padding: { x: 18, y: 6 } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.muteLabel.on("pointerdown", () => {
      setSoundSettings({ muted: !getSoundSettings().muted });
      this.draw();
    });
    this.panel.add(this.muteLabel);
    this.draw();
  }

  private slider(name: string, y: number, field: "master" | "effects"): void {
    this.panel.add(this.add.text(PX + 20, y, name, { fontFamily: FONT, fontSize: "24px", color: "#ffffff" }).setOrigin(0, 0.5));
    const g = this.add.graphics();
    this.bars.push(g);
    this.panel.add(g);
    const zone = this.add.zone(BAR_X + BAR_W / 2, y, BAR_W + 24, 40).setInteractive({ useHandCursor: true });
    const set = (p: Phaser.Input.Pointer): void => {
      setSoundSettings({ [field]: Math.min(1, Math.max(0, (p.x - BAR_X) / BAR_W)) });
      this.draw();
    };
    zone.on("pointerdown", set);
    zone.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (p.isDown) set(p);
    });
    this.panel.add(zone);
  }

  private draw(): void {
    const s = getSoundSettings();
    this.icon.setText(s.muted ? "Sound: off" : "Sound");
    this.muteLabel.setText(s.muted ? "Unmute" : "Mute");
    [s.master, s.effects].forEach((v, i) => {
      const y = PY + 35 + i * 50;
      const g = this.bars[i];
      g.clear();
      g.fillStyle(0x2f7a5b, 1);
      g.fillRoundedRect(BAR_X, y - 6, BAR_W, 12, 6);
      g.fillStyle(s.muted ? 0x777777 : 0xffd36b, 1);
      g.fillRoundedRect(BAR_X, y - 6, BAR_W * v, 12, 6);
      g.fillCircle(BAR_X + BAR_W * v, y, 11);
    });
  }
}
