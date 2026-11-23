"""The parchment scroll the map is drawn on (#300, M2): a sheet of paper with a rolled end on the
left and right and a slightly ragged top and bottom edge. Plain paper only: the game draws the map
on top, inside AREA. Deterministic: the ragged edge and the stains come from a fixed seed.
"""
import math
import random

from PIL import Image

from palette import PARCHMENT
from pix import hexrgb

AREA = (570, 235)  # the map area the paper must hold, in art pixels
MARGIN = (8, 14)  # paper around the map area, left/right and top/bottom
ROLL_W = 26  # each rolled end's width
ROLL_OVER = 7  # how far a roll stands above and below the paper
RAG = 4  # the ragged edge's depth
SEED = 300

C = [hexrgb(c) for c in PARCHMENT]  # light to darkest; the darkest is the outline


def size():
    return AREA[0] + 2 * MARGIN[0] + 2 * ROLL_W, AREA[1] + 2 * MARGIN[1] + 2 * ROLL_OVER


def map_area():
    """The map area's top-left corner and size in the scroll image."""
    return [ROLL_W + MARGIN[0], ROLL_OVER + MARGIN[1], AREA[0], AREA[1]]


def ragged(n, rng):
    """A depth (0..RAG) per column, wandering in runs so the edge reads as torn, not noisy, with a few nicks."""
    out, d = [], 1
    while len(out) < n:
        d = max(0, min(RAG - 1, d + rng.choice([-1, 0, 0, 1])))
        run = rng.randint(4, 14)
        out += [d] * run
        if rng.random() < 0.15:
            out += [min(RAG, d + 1), RAG][: rng.randint(1, 2)]  # a small tear
    return out[:n]


def noise(w, h, cell, rng):
    """Smooth value noise in 0..1, from a coarse random grid blended between corners."""
    gw, gh = w // cell + 2, h // cell + 2
    grid = [[rng.random() for _ in range(gw)] for _ in range(gh)]
    ease = lambda t: t * t * (3 - 2 * t)

    def at(x, y):
        gx, gy = x / cell, y / cell
        i, j = int(gx), int(gy)
        u, v = ease(gx - i), ease(gy - j)
        a = grid[j][i] * (1 - u) + grid[j][i + 1] * u
        b = grid[j + 1][i] * (1 - u) + grid[j + 1][i + 1] * u
        return a * (1 - v) + b * v
    return at


def draw():
    w, h = size()
    rng = random.Random(SEED)
    im = Image.new("RGBA", (w, h))
    px = im.load()
    x0, x1 = ROLL_W - 6, w - ROLL_W + 6  # the paper runs into the rolls
    y0, y1 = ROLL_OVER, h - ROLL_OVER - 1
    top, bottom = ragged(x1 - x0, rng), ragged(x1 - x0, rng)
    big, small = noise(w, h, 46, rng), noise(w, h, 11, rng)
    for i, x in enumerate(range(x0, x1)):
        t, b = y0 + top[i], y1 - bottom[i]
        for y in range(t, b + 1):
            edge = min(y - t, b - y)
            curl = min(x - x0, x1 - 1 - x)  # distance from where the paper curls into a roll
            age = 0.75 * big(x, y) + 0.25 * small(x, y) + max(0, 10 - edge) / 10 * 0.35  # faint stains, wear toward the edge
            if edge == 0:
                c = 4
            elif curl < 3:
                c = 3  # the paper's curve into the roll, in shadow
            elif curl < 8 or edge == 1 or (edge < 6 and age > 0.9):
                c = 2  # worn along the torn edge, and the darkest stains
            elif curl < 16 or age > 0.74:
                c = 1
            else:
                c = 0
            px[x, y] = C[c] + (255,)
    for left in (0, w - ROLL_W):
        roll(px, left, h)
    return im


# Bands across a roll, left to right: lit from above-left, a bright highlight, falling into shadow.
ROLL_BANDS = [3, 2, 1, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3]


def roll(px, left, h):
    """A rolled end: a cylinder in vertical bands with a dark outline, and the curl seen at top and bottom."""
    for i in range(ROLL_W):
        band = ROLL_BANDS[i * len(ROLL_BANDS) // ROLL_W]
        for y in range(3, h - 3):
            px[left + i, y] = C[4 if i in (0, ROLL_W - 1) else band] + (255,)
    cx, ry = (ROLL_W - 1) / 2, 3.6
    for top in (True, False):
        cy = 3.6 if top else h - 4.6
        for i in range(ROLL_W):
            for dy in range(-5, 6):
                y = round(cy + dy)
                r = math.hypot((i - cx) / (ROLL_W / 2), (y - cy) / ry)
                if r > 1.0:
                    continue
                if r > 0.82:
                    c = 4  # the rim
                else:
                    ring = int(r * 5) % 2  # the paper's spiral, seen end-on
                    c = 2 if ring else 1
                    if r < 0.2:
                        c = 4  # the hollow middle
                px[left + i, y] = C[c] + (255,)
