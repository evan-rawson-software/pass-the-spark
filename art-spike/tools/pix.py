"""Shared bits for the art spike (#259): the palette every method is reduced to, outlines and sheets.

The robe ramp (ROBE) is the key colours the picker swaps for a seat colour at run time. Every
method draws or is reduced to it, so one swap recolours robes and hats from any method.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

H = lambda s: tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))

# 23 colours for the whole set.
OUTLINE = H("#1b1424")
SKIN = [H("#f4c9a0"), H("#d9906b"), H("#9c5a44")]
HAIR = [H("#f3efe6"), H("#bdb4c2")]
WOOD = [H("#b5793f"), H("#7d4e2a")]
GOLD = [H("#fff3b0"), H("#ffd54a"), H("#d9962f")]
ROBE = [H("#c7a4ff"), H("#9a6ef0"), H("#6a45c0"), H("#43297e")]  # light, base, dark, deep: swapped per seat
GEM = [H("#e6feff"), H("#5fd8f0")]
FIRE = [H("#ff8a2a"), H("#e0442e"), H("#8a1f2a")]  # with GOLD[0], GOLD[1] for the hot core
VIOLET = [H("#8b6cff"), H("#3b2c66")]
WHITE = H("#fffbf0")
PALETTE = [OUTLINE, *SKIN, *HAIR, *WOOD, *GOLD, *ROBE, *GEM, *FIRE, *VIOLET, WHITE]
assert len(set(PALETTE)) == len(PALETTE) == 23, len(set(PALETTE))


def canvas(w, h):
    return np.zeros((h, w, 4), np.uint8)


def put(c, x, y, col):
    x, y = int(round(x)), int(round(y))
    if 0 <= y < c.shape[0] and 0 <= x < c.shape[1]:
        c[y, x] = (*col, 255)


def line(c, x0, y0, x1, y1, col, width=1):
    """Bresenham line; width 2 or 3 thickens it downward/rightward."""
    x0, y0, x1, y1 = map(lambda v: int(round(v)), (x0, y0, x1, y1))
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    while True:
        for i in range(width):
            for j in range(width):
                put(c, x0 + i, y0 + j, col)
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy; x0 += sx
        if e2 <= dx:
            err += dx; y0 += sy


def outline(c, col=OUTLINE):
    """A 1-px outline around the opaque pixels (4-neighbour), drawn outside them."""
    a = c[..., 3] > 0
    n = np.zeros_like(a)
    n[1:] |= a[:-1]; n[:-1] |= a[1:]; n[:, 1:] |= a[:, :-1]; n[:, :-1] |= a[:, 1:]
    o = c.copy()
    o[n & ~a] = (*col, 255)
    return o


def sheet(frames):
    return np.concatenate(frames, axis=1)


def save(arr, path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr, "RGBA").save(path)


def quantize(rgb, alpha, palette=PALETTE):
    """Each opaque pixel to the nearest palette colour (in a rough perceptual space)."""
    p = np.array(palette, float)
    w = np.array([0.30, 0.59, 0.11]) ** 0.5
    d = (((rgb[..., None, :].astype(float) - p[None, None]) * w) ** 2).sum(-1)
    out = np.zeros((*rgb.shape[:2], 4), np.uint8)
    out[..., :3] = p[d.argmin(-1)].astype(np.uint8)
    out[..., 3] = np.where(alpha, 255, 0)
    return out


def check(arr):
    """Pixel rules: every pixel fully opaque or fully clear, and every colour from the palette."""
    a = arr[..., 3]
    half = int(((a > 0) & (a < 255)).sum())
    cols = {tuple(px) for px in arr[a == 255][:, :3]}
    off = [c for c in cols if c not in PALETTE]
    return {"half_alpha_px": half, "colours": len(cols), "off_palette": len(off)}


def meta(path, data):
    Path(path).write_text(json.dumps(data, indent=1))
