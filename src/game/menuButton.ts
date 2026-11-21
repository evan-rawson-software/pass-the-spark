// Where the game menu's button (GameMenuScene) sits. Every screen keeps the default, the top-right
// corner; the combat screen moves it into the left column's footer while it is open (#231).

const DEFAULT = { x: 1884, y: 36 };
let spot = { ...DEFAULT };
const listeners = new Set<() => void>();

export function menuButtonSpot(): { x: number; y: number } {
  return spot;
}

// null puts it back in the corner.
export function setMenuButtonSpot(at: { x: number; y: number } | null): void {
  spot = at ? { ...at } : { ...DEFAULT };
  listeners.forEach((f) => f());
}

// Calls `f` when the button moves; returns the way to stop.
export function onMenuButtonMove(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
