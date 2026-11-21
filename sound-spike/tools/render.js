// Render jsfxr synth definitions to raw float32 mono at 44.1 kHz.
// Usage: node render.js defs.json outdir   (defs: {name: {param: value, ...}})
const fs = require('fs'), path = require('path');
const { Params, SoundEffect } = require('jsfxr');
const [defsFile, outDir] = process.argv.slice(2);
const defs = JSON.parse(fs.readFileSync(defsFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
for (const [name, over] of Object.entries(defs)) {
  const p = new Params();
  Object.assign(p, over, { sample_rate: 44100, sample_size: 16 });
  const buf = new SoundEffect(p).getRawBuffer().normalized;
  fs.writeFileSync(path.join(outDir, name + '.f32'), Buffer.from(new Float32Array(buf).buffer));
}
