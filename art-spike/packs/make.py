"""Art spike #259, method 3: a pack asset made to fit. The CC0 "Teleport circle" sheet by gfroad
(https://opengameart.org/content/teleport-circle-sprite-sheet) is smooth line art drawn flat from
above, in 4x4 frames of 256x256. Squash a frame to the tilted 300x150 view, threshold the lines onto
the pixel grid, and recolour them to the palette.

  python art-spike/packs/make.py teleportCircle.png
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "tools"))
from pix import GOLD, VIOLET, WHITE, check, meta, save  # noqa: E402


def frame(sheet, i):
    x, y = (i % 4) * 256, (i // 4) * 256
    return sheet.crop((x, y, x + 256, y + 256))


def tilt(fr, cut=0.3):
    """Ink (dark, opaque) becomes coverage; squash to 300x150; keep pixels covered past cut."""
    a = np.asarray(fr.convert("RGBA")).astype(float) / 255
    ink = a[..., 3] * (1 - a[..., :3].mean(-1) * 0.85)
    im = Image.fromarray((ink * 255).astype(np.uint8), "L").resize((300, 150), Image.BOX)
    return np.asarray(im) / 255


def paint(cov, levels):
    out = np.zeros((150, 300, 4), np.uint8)
    for cut, col in levels:
        out[cov >= cut] = (*col, 255)
    return out


if __name__ == "__main__":
    sheet = Image.open(sys.argv[1])
    res = {}
    quiet = paint(tilt(frame(sheet, 0)), [(0.18, VIOLET[1]), (0.75, VIOLET[0])])
    blaze = paint(tilt(frame(sheet, 0)), [(0.12, VIOLET[0]), (0.22, GOLD[2]), (0.35, GOLD[1]), (0.55, WHITE)])
    for name, img in [("circle_quiet", quiet), ("circle_blaze", blaze)]:
        save(img, HERE / f"{name}.png")
        res[name] = check(img)
    meta(HERE / "check.json", res)
    print(res)
