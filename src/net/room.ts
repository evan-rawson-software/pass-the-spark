import type { RunState } from "../engine/run";
import type { Look } from "./look";

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

// Whether this browser already has a token for the room, meaning it has been in it before.
export function hasRoomToken(code: string, storage?: TokenStorage): boolean {
  try {
    return !!storage?.getItem("pass-the-spark-token-" + code);
  } catch {
    return false;
  }
}

// What the host keeps in localStorage so it can resume after a reload: the seats and the run
// (which holds the battle in progress, if any). The run is null while the room is in the lobby.
export interface SavedRoom {
  roomCode: string;
  buildId: string;
  members: { seat: string; name: string; token: string | null; look?: Look }[]; // in seat order; the host's own seat has no token; look is missing in older saves
  run: RunState | null;
}

const hostedKey = (code: string) => "pass-the-spark-hosted-" + code;

// Pass null to forget the room. Storage can be unavailable or full.
export function saveHostedRoom(code: string, room: SavedRoom | null, storage?: TokenStorage & { removeItem(key: string): void }): void {
  try {
    if (room === null) storage?.removeItem(hostedKey(code));
    else storage?.setItem(hostedKey(code), JSON.stringify(room));
  } catch {
    // storage unavailable
  }
}

// The room this browser hosted with that code, if it is saved and made by this build.
// A save from another build is ignored (null). A save that cannot be read is "corrupt".
export function loadHostedRoom(code: string, buildId: string, storage?: TokenStorage): SavedRoom | "corrupt" | null {
  let raw: string | null | undefined;
  try {
    raw = storage?.getItem(hostedKey(code));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const room = JSON.parse(raw) as SavedRoom;
    if (room.buildId !== buildId) return null;
    if (room.roomCode !== code || !Array.isArray(room.members) || room.members.length === 0) return "corrupt";
    if (room.run !== null && typeof room.run !== "object") return "corrupt";
    return room;
  } catch {
    return "corrupt";
  }
}
