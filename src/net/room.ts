// Room codes and the host's peer id. Not part of the engine, so Math.random and crypto are fine here.

// No 0/O, 1/I/L.
export const ROOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 5;

function randomInt(max: number): number {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c && c.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] % max;
  return Math.floor(Math.random() * max);
}

function randomString(length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) s += ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)];
  return s;
}

export function generateRoomCode(): string {
  return randomString(ROOM_CODE_LENGTH);
}

export function hostPeerId(code: string): string {
  return "pass-the-spark-" + code;
}

interface TokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// A random id the client generates once per room and keeps, so it can get its seat back.
// Pass localStorage as storage; without storage the token lasts only as long as the page.
export function getRoomToken(code: string, storage?: TokenStorage): string {
  const key = "pass-the-spark-token-" + code;
  try {
    const saved = storage?.getItem(key);
    if (saved) return saved;
  } catch {
    // storage unavailable
  }
  const token = randomString(16);
  try {
    storage?.setItem(key, token);
  } catch {
    // storage unavailable
  }
  return token;
}
