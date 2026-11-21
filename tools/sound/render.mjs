// Renders jsfxr synth definitions for build.py. Reads one JSON object per line on stdin (jsfxr
// parameters, plus an optional "seed"), and writes back a 4-byte little-endian sample count followed
// by the mono float32 samples at 44.1 kHz. jsfxr's noise uses Math.random, so each request seeds it:
// the same parameters always render the same samples.
import { createInterface } from "node:readline";
import { jsfxr } from "jsfxr";

const { Params, SoundEffect } = jsfxr;

// mulberry32: a small seeded random-number generator.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  if (!line.trim()) continue;
  const { seed = 1, ...over } = JSON.parse(line);
  Math.random = seeded(seed);
  const p = new Params();
  Object.assign(p, over, { sample_rate: 44100, sample_size: 16 });
  const samples = Float32Array.from(new SoundEffect(p).getRawBuffer().normalized);
  const head = Buffer.alloc(4);
  head.writeUInt32LE(samples.length);
  process.stdout.write(head);
  process.stdout.write(Buffer.from(samples.buffer));
}
