import Phaser from "phaser";
import art from "../../data/wizard-art.json";
import { reducedFlashing } from "./comfort";
import { scaleTime } from "./playbackSpeed";
import { battleWizardsData } from "./presentation";
import { seededPick } from "./seededPick";

// The arcane circle (#264, A9): the floor of the board area, under the domino tree. At rest it shows
// tier 0, looping. During a cascade it follows the combo tier (comboHype.ts): a new tier fades in over
// the last, and on lethal the beam shows on top of tier 4. After the cascade it settles to tier 0.
// Every tier uses one variant (a row of the sheets), picked per cascade by the scene (seededPick).
// Reduced flashing: tiers 3 and 4 and the beam are dimmer and their frames last longer, so nothing
// flickers. Places and times are in data/presentation.json (battleWizards.circle); the sheets are
// described in data/wizard-art.json (circle). Frames are named "<variant>:<frame>" on each sheet's texture.

const C = art.circle;
const D = battleWizardsData.circle;
const SCALE = art.scale;
const BEAM = C.beam;

const textureId = (sheet: string): string => "art/" + sheet.replace(/\.[^./]+$/, "");

interface Layer {
  tier: number; // -1 for the beam
  image: Phaser.GameObjects.Image;
  ms: number[];
}

export class ArcaneCircle {
  private layers: Layer[] = [];
  private tierAlpha: number[] = C.tiers.map((t) => (t.tier === 0 ? 1 : 0));
  private beamAlpha = 0;
  private variant = 0;
  private tier = 0;
  private beam = false;
  private elapsed = 0;
  private fade?: Phaser.Tweens.Tween;
  private onUpdate = (_time: number, delta: number) => {
    this.elapsed += delta;
    this.apply();
  };

  constructor(private scene: Phaser.Scene) {
    // The sheet's centre on the table's circle spot.
    const left = D.x - C.centre[0] * SCALE;
    const top = D.y - C.centre[1] * SCALE;
    for (const t of C.tiers) {
      for (const l of t.layers) this.add(textureId(l.sheet), C.frame, C.frames, left, top, 0, 0, t.tier, t.ms);
    }
    this.add(textureId(BEAM.sheet), BEAM.frame, BEAM.frames, D.x, D.y, BEAM.anchor[0], BEAM.anchor[1], -1, BEAM.ms);
    this.apply();
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate));
  }

  // One sheet as an image on its first frame: `frames` columns by one row per variant. A sheet that did
  // not load (no art) is left out, and the circle just does not show.
  private add(id: string, size: { w: number; h: number }, frames: number, x: number, y: number, ax: number, ay: number, tier: number, ms: number[]): void {
    if (!this.scene.textures.exists(id)) return;
    const tex = this.scene.textures.get(id);
    if (!tex.has("0:0")) {
      const rows = Math.round(tex.getSourceImage().height / size.h);
      for (let v = 0; v < rows; v++) for (let f = 0; f < frames; f++) tex.add(`${v}:${f}`, 0, f * size.w, v * size.h, size.w, size.h);
      tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    const image = this.scene.add.image(x, y, id, "0:0").setOrigin(ax / size.w, ay / size.h).setScale(SCALE).setAlpha(0);
    this.layers.push({ tier, image, ms });
  }

  // The variant every tier shows from now on, picked from values every screen shares (Z2).
  pick(...parts: (string | number)[]): void {
    this.variant = seededPick(C.variants, ...parts);
    this.apply();
  }

  // The circle's tier: it fades into it.
  setTier(tier: number): void {
    this.tier = tier;
    this.fadeTo(D.fadeMs);
  }

  // Lethal: the beam shows on top of tier 4.
  showBeam(): void {
    this.beam = true;
    this.fadeTo(D.beamFadeMs);
  }

  // Back to tier 0, and the beam away (`now`: at once, for a new round or a skipped cascade).
  rest(now = false): void {
    this.tier = 0;
    this.beam = false;
    if (!now) return this.fadeTo(D.restMs);
    this.fade?.stop();
    this.tierAlpha = C.tiers.map((t) => (t.tier === 0 ? 1 : 0));
    this.beamAlpha = 0;
    this.apply();
  }

  private fadeTo(ms: number): void {
    this.fade?.stop();
    const from = [...this.tierAlpha];
    const beamFrom = this.beamAlpha;
    this.fade = this.scene.tweens.addCounter({
      from: 0, to: 1, duration: scaleTime(ms),
      onUpdate: (t) => {
        const f = t.getValue() ?? 1;
        from.forEach((a, i) => (this.tierAlpha[i] = a + ((i === this.tier ? 1 : 0) - a) * f));
        this.beamAlpha = beamFrom + ((this.beam ? 1 : 0) - beamFrom) * f;
      },
    });
  }

  // The layers' alphas (dimmer in the top tiers with reduced flashing) and frames.
  private apply(): void {
    const R = D.reduced;
    const soft = reducedFlashing();
    for (const l of this.layers) {
      const a = l.tier < 0 ? this.beamAlpha : this.tierAlpha[l.tier];
      const visible = a > 0.001;
      l.image.setVisible(visible);
      if (!visible) continue;
      const calm = soft && (l.tier < 0 || l.tier >= R.minTier);
      l.image.setAlpha(calm ? a * R.alpha : a);
      l.image.setFrame(`${this.variant}:${frameAt(l.ms, this.elapsed, calm ? R.minFrameMs : 0)}`);
    }
  }
}

// The frame a looping animation shows `t` ms in; each frame lasts at least `min` ms.
function frameAt(ms: number[], t: number, min: number): number {
  const lengths = ms.map((m) => Math.max(m, min));
  let left = t % lengths.reduce((s, v) => s + v, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (left < lengths[i]) return i;
    left -= lengths[i];
  }
  return lengths.length - 1;
}
