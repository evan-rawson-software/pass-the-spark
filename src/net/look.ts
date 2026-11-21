import art from "../../data/wizard-art.json";

// A wizard's look (#262): a colour, a hat and a robe, each an id from data/wizard-art.json. It is
// cosmetic and never reaches the rules engine (Z1). Online it travels in the lobby and presence
// messages; the host checks every one. Randomness here is not the engine's, so Math.random is fine.

export interface Look {
  colour: string;
  hat: string;
  robe: string;
}

export const COLOUR_IDS: string[] = art.colours.map((c) => c.id);
const HAT_IDS: string[] = art.hats.map((h) => h.id);
const ROBE_IDS: string[] = art.robes.map((r) => r.id);

// True when all three ids exist in the data.
export function isLook(raw: unknown): raw is Look {
  if (!raw || typeof raw !== "object") return false;
  const l = raw as Partial<Look>;
  return COLOUR_IDS.includes(l.colour as string) && HAT_IDS.includes(l.hat as string) && ROBE_IDS.includes(l.robe as string);
}

// The colours nobody in `taken` has, in palette order.
export function freeColours(taken: string[]): string[] {
  return COLOUR_IDS.filter((id) => !taken.includes(id));
}

function pick<T>(list: T[], random: () => number): T {
  return list[Math.floor(random() * list.length)];
}

// A random look in a colour that is free.
export function randomLook(taken: string[], random: () => number = Math.random): Look {
  const free = freeColours(taken);
  return { colour: pick(free.length > 0 ? free : COLOUR_IDS, random), hat: pick(HAT_IDS, random), robe: pick(ROBE_IDS, random) };
}

// Makes `raw` a valid look whose colour is free: an unknown id becomes a random valid one, and a
// taken colour becomes the first free colour in palette order (Z6). A valid free look is kept as is.
export function fixLook(raw: unknown, taken: string[], random: () => number = Math.random): Look {
  const r = raw && typeof raw === "object" ? (raw as Partial<Look>) : {};
  const free = freeColours(taken);
  const colour = COLOUR_IDS.includes(r.colour as string)
    ? free.includes(r.colour as string) ? (r.colour as string) : (free[0] ?? COLOUR_IDS[0])
    : pick(free.length > 0 ? free : COLOUR_IDS, random);
  return {
    colour,
    hat: HAT_IDS.includes(r.hat as string) ? (r.hat as string) : pick(HAT_IDS, random),
    robe: ROBE_IDS.includes(r.robe as string) ? (r.robe as string) : pick(ROBE_IDS, random),
  };
}
