// Seeded RNG: mulberry32. The state is a plain uint32 number stored in the
// battle state. Every function returns the value plus the new state.

export interface Rolled<T> {
  value: T;
  state: number;
}

// mulberry32 step. All arithmetic is kept to 32 bits explicitly.
export function nextUint32(state: number): Rolled<number> {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), a | 1) >>> 0;
  t = (t ^ (t + (Math.imul(t ^ (t >>> 7), t | 61) >>> 0))) >>> 0;
  const value = (t ^ (t >>> 14)) >>> 0;
  return { value, state: a };
}

// Float in [0, 1).
export function nextFloat(state: number): Rolled<number> {
  const r = nextUint32(state);
  return { value: r.value / 4294967296, state: r.state };
}

// Integer in [0, n). No rejection sampling.
export function nextInt(state: number, n: number): Rolled<number> {
  const r = nextFloat(state);
  return { value: Math.floor(r.value * n), state: r.state };
}

// Fisher-Yates. Returns a new array; the input is not changed.
export function shuffle<T>(state: number, items: readonly T[]): Rolled<T[]> {
  const out = items.slice();
  let s = state;
  for (let i = out.length - 1; i >= 1; i--) {
    const r = nextInt(s, i + 1);
    s = r.state;
    const j = r.value;
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return { value: out, state: s };
}
