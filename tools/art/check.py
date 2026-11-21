"""Checks every code-drawn sheet against the pixel rules: each pixel fully opaque or fully clear, and
each colour from palette.PALETTE. Also checks the seat colours (palette.seat_problems).

  python tools/art/check.py        exits 1 and lists the problems if anything fails
"""
import sys
from pathlib import Path

from PIL import Image

from palette import PALETTE, seat_problems

ROOT = Path(__file__).resolve().parents[2]
FOLDERS = ["public/art/wizards", "public/art/circle", "public/art/spells"]


def problems():
    out = []
    for folder in FOLDERS:
        for path in sorted((ROOT / folder).glob("*.png")):
            im = Image.open(path).convert("RGBA")
            half, off = 0, set()
            for r, g, b, a in im.getdata():
                if 0 < a < 255:
                    half += 1
                elif a == 255 and (r, g, b) not in PALETTE:
                    off.add((r, g, b))
            name = path.relative_to(ROOT).as_posix()
            if half:
                out.append(f"{name}: {half} half-transparent pixels")
            if off:
                out.append(f"{name}: {len(off)} colours off the palette, e.g. " + ", ".join("#%02x%02x%02x" % c for c in sorted(off)[:3]))
    return out + seat_problems()


if __name__ == "__main__":
    found = problems()
    for p in found:
        print("FAIL", p)
    print("art check:", "failed" if found else "passed")
    sys.exit(1 if found else 0)
