"""The arcane circle (#263): the floor of the board, seen tilted, in 5 tiers that grow with the combo
(#234), each in 3 variants, and the lethal beam.

Every tier is drawn as layers on the same frame (base lines, glow, and from tier 3 particles), so the
game can fade one tier into the next. Variant v of every tier shares one design (its inner figure,
its glyphs and its rings), so a battle picks a variant and the tiers grow within it. Every layer
loops in FRAMES frames: rings turn by exactly one dash, glyph lights chase round by exactly one wave,
and particles rise through one cycle.

The busy detail sits at the rim; the middle, under the domino tree, stays dim and plain.
"""
import math
import random

from palette import ARCANE, GOLD, WHITE
from pix import hexrgb, halo, line, paint

FW, FH = 400, 220  # the frame
CX, CY = 200, 122  # the circle's centre in the frame
RX, RY = 170, 84  # its rim; the outer runes and the blaze reach about 1.12 of it
FRAMES = 8
MS = [160, 140, 110, 90, 70]  # each frame's time at tiers 0-4
BEAM = dict(w=72, h=200, ms=70)  # the beam frame; its bottom centre sits on the circle's centre

A = [hexrgb(c) for c in ARCANE]
G = [hexrgb(c) for c in GOLD]
WH = hexrgb(WHITE)

# Three glyph sets, 8 glyphs of 5x5 each, one per variant.
GLYPHS = [
    ["11100 10000 11111 00001 00111", "00100 10101 01110 10101 00100", "10101 10101 01110 00100 00100", "00100 01010 10001 01010 00100",
     "11011 00100 01110 00100 11011", "10000 11000 10100 10010 11111", "01010 11111 01010 11111 01010", "00100 00100 11111 01110 10001"],
    ["11111 00100 00100 00100 01110", "10001 01010 00100 01010 10001", "00100 01110 10101 00100 00100", "11100 00100 00111 00100 11100",
     "01110 10001 10101 10001 01110", "10001 10001 11111 00100 00100", "00111 00100 11100 00100 00111", "10100 10100 11111 00101 00101"],
    ["00100 01010 01010 10001 11111", "11111 10001 10101 10001 11111", "01000 01100 01110 01100 01000", "10001 11011 10101 10001 10001",
     "00100 11111 00100 01010 10001", "10010 10100 11000 10100 10010", "01110 00100 11111 00100 01110", "10101 01110 11111 01110 10101"],
]
FIGURES = [(6, 2), (5, 2), (8, 3)]  # inner star figure per variant: points, step ({6/2} is the hexagram)
RINGS = [[(0.84, 36, 1), (0.77, 28, -1)], [(0.84, 30, 1), (0.77, 40, -1), (0.71, 24, 1)], [(0.82, 32, -1), (0.75, 32, 1)]]  # (size, dashes, turn)
GLYPH_COUNT = 32  # round the rim band; lights chase in waves of 8, one glyph a frame


def P(a, s):
    """The point at angle a on the circle of size s (1 is the rim), in the tilted view."""
    return CX + math.cos(a) * RX * s, CY + math.sin(a) * RY * s


def ring(c, s, col, gaps=(), dashes=0, dash=0.45, turn=0.0):
    """An ellipse of size s, with gaps (angle ranges), or as dashes turned by turn (a share of one dash)."""
    n = int(2 * math.pi * RX * s * 1.6)
    for i in range(n):
        a = 2 * math.pi * i / n
        if any(g0 <= a < g1 for g0, g1 in gaps):
            continue
        if dashes and ((a / (2 * math.pi) * dashes - turn) % 1) > dash:
            continue
        paint(c, [P(a, s)], col)


def figure(c, v, col):
    n, step = FIGURES[v]
    pts = [P(-math.pi / 2 + i * 2 * math.pi / n, 0.6) for i in range(n)]
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + step) % n]
        line(c, x0, y0, x1, y1, col)


def glyph(c, v, i, x, y, col):
    for gy, row in enumerate(GLYPHS[v][i % 8].split()):
        paint(c, [(x - 2 + gx, y - 2 + gy) for gx, ch in enumerate(row) if ch == "1"], col)


def glyph_band(c, v, s, col_of):
    """GLYPH_COUNT glyphs round the band at size s; col_of(i) gives glyph i's colour (None: skip it)."""
    for i in range(GLYPH_COUNT):
        col = col_of(i)
        if col:
            x, y = P(i * 2 * math.pi / GLYPH_COUNT, s)
            glyph(c, v, i + v * 3, round(x), round(y), col)


def lit(i, f, waves=4):
    """How lit glyph i is in frame f, 0-2: waves of light chasing round the band, one glyph a frame."""
    k = (i - f) % (GLYPH_COUNT // waves)
    return 2 if k == 0 else 1 if k in (1, 7) else 0


def base(t, v, f):
    """The lines: always there at this tier, steady."""
    c = {}
    gaps = [(0.4 + v * 0.7 + k * 1.6, 0.4 + v * 0.7 + k * 1.6 + 0.3) for k in range(4)]
    rim = [A[3], A[2], A[2], G[2], G[1]][t]
    ring(c, 1.0, rim)
    ring(c, 0.9, [A[4], A[3], A[3], A[2], G[2]][t], gaps=gaps if t == 0 else ())
    ring(c, 0.18, A[4] if t < 3 else A[3])
    if t == 0:
        for i in range([6, 5, 8][v]):
            paint(c, [P(-math.pi / 2 + i * 2 * math.pi / [6, 5, 8][v], 0.6)], A[3])
        return c
    figure(c, v, A[4] if t < 3 else A[3])
    if t >= 2:
        ring(c, 0.6, A[4])
    if t >= 3:
        ring(c, 1.12, A[3] if t == 3 else G[2])
    glyph_band(c, v, 0.95, lambda i: A[3] if t < 4 else G[2])
    return c


def glow(t, v, f):
    """What lights up and moves: a dithered glow round the lines, lit glyphs, turning rings, outer runes."""
    c = {}
    lines = base(t, v, f)
    if t == 0:  # a slow, faint breath along the rim
        if f in (2, 3, 4, 5):
            c = beside(lines, {}, A[4], f % 2, [p for p in lines if lines[p] == A[3]])
        return c
    glyph_band(c, v, 0.95, lambda i: [None, A[1], WH][lit(i, f)] if t < 4 else [G[0], WH, WH][lit(i, f)])
    if t >= 2:
        for s, n, turn in RINGS[v]:
            ring(c, s, G[1] if t >= 3 else A[1], dashes=n, turn=turn * f / FRAMES)
    if t >= 3:  # the outer runes pulse together
        on = [A[2], A[1], A[0], WH, A[0], A[1], A[2], A[3]][f] if t == 3 else [G[1], G[0], WH, WH, WH, G[0], G[1], G[2]][f]
        glyph_band(c, v, 1.06, lambda i: on if i % 2 == 0 else None)
    halo_col = [None, A[4], A[3], A[3], G[2]][t]
    c = beside(lines, c, halo_col, f % 2, list(c) + [p for p in lines if lines[p] in (A[2], G[2], G[1])])
    if t == 4:  # a second, wider glow: the blaze
        c = beside(lines, c, G[3], (f + 1) % 2, list(c))
    return c


def beside(lines, c, col, parity, of):
    """c with a dithered glow in col next to the pixels of, never on top of the base lines."""
    out = halo({**lines, **c}, col, parity=parity, of=of)
    return {p: v for p, v in out.items() if p in c or p not in lines}


def particles(t, v, f):
    """Sparks rising off the rim, each through one cycle of the loop (tiers 3 and 4)."""
    rng = random.Random(300 + 10 * t + v)
    c = {}
    for _ in range(60 if t == 3 else 140):
        a = rng.uniform(0, 2 * math.pi)
        x, y = P(a, rng.uniform(0.92, 1.1))
        height = rng.uniform(14, 34 if t == 3 else 52)
        life = (rng.random() + f / FRAMES) % 1
        cols = [WH, A[0], A[1], A[2]] if t == 3 else [WH, G[0], G[1], G[2]]
        col = cols[min(3, int(life * 4))]
        px, py = x + math.sin(life * 6 + a) * 1.5, y - life * height
        paint(c, [(px, py)], col)
        if t == 4 and life < 0.5:
            paint(c, [(px, py + 1)], cols[min(3, int(life * 4) + 1)])
    return c


TIERS = [["base", "glow"], ["base", "glow"], ["base", "glow"], ["base", "glow", "particles"], ["base", "glow", "particles"]]
LAYERS = {"base": base, "glow": glow, "particles": particles}


def beam(f):
    """The lethal beam: a pillar of light up from the circle's centre, pulsing in width."""
    w, h = BEAM["w"], BEAM["h"]
    cx = w // 2
    c = {}
    pulse = [0, 1, 2, 2, 1, 0, -1, -1][f]
    for y in range(h):
        widen = max(0, (y - (h - 24)) / 24) * 10  # it flares where it meets the floor
        r = 9 + pulse + widen
        for x in range(w):
            e = abs(x + 0.5 - cx - 0.5)
            if e < r * 0.3:
                col = WH
            elif e < r * 0.6:
                col = G[0]
            elif e < r * 0.85:
                col = G[1] if (y // 3 + f) % 4 else G[0]
            elif e < r * 1.05 and (x + y + f) % 2 == 0:
                col = G[2]
            elif e < r * 1.35 and (x + y) % 4 == f % 4:
                col = A[2]
            else:
                continue
            c[(x, y)] = col
    rng = random.Random(700)
    for _ in range(30):  # motes streaming up the beam
        x = cx + rng.uniform(-14, 14)
        life = (rng.random() + f / FRAMES) % 1
        paint(c, [(x, (1 - life) * h)], WH if abs(x - cx) > 8 else A[0])
    return c
