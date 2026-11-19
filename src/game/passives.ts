// Display names for enemy passives (the passive kind ids are camelCase).
import type { Passive } from "../engine/types";

const NAMES: Record<Passive["kind"], string> = {
  auditor: "Auditor",
  glutton: "Glutton",
  longNight: "Long Night",
  warden: "Warden",
};

export function passiveName(p: Passive): string {
  return NAMES[p.kind];
}
