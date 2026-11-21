import { loadComfort, saveComfort } from "./profile";
import { comfortData } from "./presentation";

// Comfort settings (F7): screen shake and reduced flashing. Kept in the profile (profile.ts), so
// they are per player online and one set per machine in single player. Effects call shakeEnabled()
// and reducedFlashing() before they shake the camera or flash the screen. A profile without them
// gets the defaults in data/presentation.json.

const defaults = () => ({ shake: comfortData.shakeDefault, reducedFlashing: comfortData.reducedFlashingDefault });

export function shakeEnabled(): boolean {
  return loadComfort(defaults()).shake;
}

export function reducedFlashing(): boolean {
  return loadComfort(defaults()).reducedFlashing;
}

export function setComfort(values: { shake?: boolean; reducedFlashing?: boolean }): void {
  saveComfort({ ...loadComfort(defaults()), ...values });
}
