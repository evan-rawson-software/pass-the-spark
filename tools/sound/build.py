"""Render the sound recipes to .ogg.

  python tools/sound/build.py                 every cue's "pick" recipe -> public/audio/sfx/<cue>.ogg
  python tools/sound/build.py --cue combo:hit just that cue
  python tools/sound/build.py --candidates DIR  every variant of every cue -> DIR/<cue>_<variant>.ogg
                                                plus DIR/candidates.json (for the picker)
  python tools/sound/build.py --check         how the scale cues hold up at their highest step

A cue name's ":" becomes "-" in file names (combo:hit -> combo-hit.ogg).
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import recipes  # noqa: E402
from sfx import SR, finish, loudness, render  # noqa: E402

ROOT = HERE.parent.parent
OUT = ROOT / "public" / "audio" / "sfx"


def fname(cue):
    return cue.replace(":", "-")


def ogg_crc(data):
    """The Ogg page checksum: CRC-32, polynomial 0x04C11DB7, not reflected, starting at 0."""
    crc = 0
    for byte in data:
        crc ^= byte << 24
        for _ in range(8):
            crc = ((crc << 1) ^ 0x04C11DB7) if crc & 0x80000000 else crc << 1
            crc &= 0xFFFFFFFF
    return crc


def fixed_serial(path, serial=1):
    """libogg gives every stream a random serial number; set a fixed one (and redo each page's
    checksum) so the same recipe always writes the same bytes."""
    b = bytearray(path.read_bytes())
    i = 0
    while i < len(b):
        assert b[i:i + 4] == b"OggS", path
        n = b[i + 26]
        size = 27 + n + sum(b[i + 27: i + 27 + n])
        b[i + 14: i + 18] = serial.to_bytes(4, "little")
        b[i + 22: i + 26] = bytes(4)
        b[i + 22: i + 26] = ogg_crc(b[i: i + size]).to_bytes(4, "little")
        i += size
    path.write_bytes(bytes(b))


def write(x, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, finish(x).astype(np.float32), SR, format="OGG", subtype="VORBIS")
    fixed_serial(path)
    y, _ = sf.read(path)
    return round(len(y) / SR, 2), round(loudness(y), 1), round(20 * np.log10(np.abs(y).max()), 1)


def build(cues):
    for cue in cues:
        x, _ = recipes.RECIPES[cue]["pick"]()
        secs, lufs, peak = write(x, OUT / f"{fname(cue)}.ogg")
        print(f"{cue:22} {secs:5.2f}s {lufs:6.1f} LUFS  peak {peak:5.1f} dB")


def candidates(out):
    group_of = {c: g for g, cs in recipes.GROUPS.items() for c in cs}
    meta = []
    for cue, variants in recipes.RECIPES.items():
        for v, fn in variants.items():
            x, how = fn()
            f = f"{fname(cue)}_{v}.ogg"
            secs, lufs, peak = write(x, out / f)
            meta.append(dict(cue=cue, variant=v, group=group_of.get(cue, "Other"), file=f, seconds=secs, lufs=lufs, how=how))
            print(f"{f:32} {secs:5.2f}s {lufs:6.1f} LUFS  peak {peak:5.1f} dB")
    (out / "candidates.json").write_text(json.dumps(meta, indent=1))


def check(files):
    """Each scale cue at its top step: length, brightness and the click at the end."""
    data = json.loads((ROOT / "data" / "sound.json").read_text())
    for path, cue in files:
        c = data["cues"].get(cue, {})
        if "scale" not in c:
            continue
        scale = data["scales"][c["scale"]]
        top = c.get("maxStep", len(scale) - 1)
        semis = scale[top % len(scale)] + 12 * (top // len(scale)) + c.get("baseCents", 0) / 100
        x, _ = sf.read(path)
        y = signal.resample(x, int(len(x) / 2 ** (semis / 12)))
        spec = np.abs(np.fft.rfft(y))
        cen = (spec * np.fft.rfftfreq(len(y), 1 / SR)).sum() / spec.sum()
        body = np.sum(np.abs(y) > 0.05 * np.abs(y).max()) / SR
        print(f"{path.name:32} +{semis:4.1f} st: {len(y) / SR * 1000:5.0f} ms long, {body * 1000:4.0f} ms above -26 dB, centroid {cen / 1000:4.1f} kHz")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cue", action="append")
    ap.add_argument("--candidates")
    ap.add_argument("--check", nargs="?", const=str(OUT))
    a = ap.parse_args()
    try:
        if a.candidates:
            candidates(Path(a.candidates))
        elif a.check:
            d = Path(a.check)
            files = [(p, p.stem.split("_")[0].replace("-", ":", 1)) for p in sorted(d.glob("*.ogg"))]
            check(files)
        else:
            build(a.cue or [c for c, v in recipes.RECIPES.items() if "pick" in v])
    finally:
        render.close()


if __name__ == "__main__":
    main()
