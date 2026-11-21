"""combo:hit at +12 and +33 semitones (step 14): length, tail click, brightness, overlap headroom at a 45 ms gap."""
import sys
from pathlib import Path
import numpy as np, soundfile as sf
from scipy import signal
for f in sorted(Path(sys.argv[1]).glob("*/combo-hit_*.ogg")):
    x, sr = sf.read(f)
    row = [f"{f.parent.name}/{f.stem}"]
    for semis in (0, 12, 33):
        r = 2 ** (semis / 12)
        y = signal.resample(x, int(len(x) / r))
        spec = np.abs(np.fft.rfft(y)); fr = np.fft.rfftfreq(len(y), 1 / sr)
        cen = (spec * fr).sum() / spec.sum()
        tail = 20 * np.log10(np.abs(y[-32:]).max() / np.abs(y).max() + 1e-9)
        row.append(f"+{semis}: {len(y)/sr*1000:4.0f}ms cen {cen/1000:4.1f}k tail {tail:4.0f}dB")
    # 8 hits up the scale, 120 ms apart (the demo's fastest gap is ~170 ms; the game's minimum is 45 ms)
    out = np.zeros(int(sr * 1.5))
    for i, s in enumerate([0, 2, 4, 7, 9, 12, 14, 16]):
        y = signal.resample(x, int(len(x) / 2 ** (s / 12)))
        o = int(i * 0.12 * sr); out[o:o + len(y)] += y[: len(out) - o]
    row.append(f"run peak {20*np.log10(np.abs(out).max()):+.1f}dB")
    print(" | ".join(row))
