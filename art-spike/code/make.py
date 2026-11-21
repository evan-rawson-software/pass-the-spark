"""Art spike #259, method 2: pixel data drawn in code from layered parts.

  python art-spike/code/make.py

Writes art-spike/code/*.png sheets (frames side by side) and sheets.json. The wizard is 32x48, in
layers drawn on the same frame grid: robe_<kind>, body, hat_<kind>, staff, hand. Each frame is a
pose (body bob, hand position, staff ends, gem glow), so every layer reads the same pose and hats
line up on every frame. Robes and hats use pix.ROBE, which the picker swaps for the seat colour.
"""
import math
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "tools"))
from pix import (FIRE, GEM, GOLD, HAIR, OUTLINE, ROBE, SKIN, VIOLET, WHITE, WOOD, canvas, check, line,  # noqa: E402
                 meta, outline, put, save, sheet)

W, H = 32, 48
# bob: body down by 1; hand: where the fist is; staff: bottom and top ends; glow: 0-3 at the gem.
IDLE = [dict(bob=0, hand=(22, 31), staff=((23, 46), (23, 9)), glow=0, hem=0),
        dict(bob=0, hand=(22, 31), staff=((23, 46), (23, 9)), glow=1, hem=0),
        dict(bob=1, hand=(22, 32), staff=((23, 46), (23, 9)), glow=1, hem=1),
        dict(bob=1, hand=(22, 32), staff=((23, 46), (23, 9)), glow=0, hem=1)]
CAST = [dict(bob=1, hand=(20, 31), staff=((25, 46), (19, 10)), glow=1, hem=0),   # wind up: lean back
        dict(bob=0, hand=(22, 19), staff=((23, 34), (23, 1)), glow=2, hem=1),    # raise the staff
        dict(bob=0, hand=(25, 23), staff=((19, 39), (30, 6)), glow=3, hem=0, burst=2),  # release
        dict(bob=0, hand=(25, 23), staff=((19, 39), (30, 6)), glow=2, hem=0, burst=1),
        dict(bob=1, hand=(23, 27), staff=((23, 45), (25, 8)), glow=1, hem=1),    # recover
        dict(bob=0, hand=(22, 31), staff=((23, 46), (23, 9)), glow=0, hem=0)]


def shade_robe(c, mask, light_col):
    """Fill a mask in the robe ramp, lit from the front (right): deep at the back edge."""
    ys, xs = np.nonzero(mask)
    for y in set(ys):
        row = xs[ys == y]
        x0, x1 = row.min(), row.max()
        for x in row:
            t = (x - x0) / max(1, x1 - x0)
            col = ROBE[3] if t < 0.15 else ROBE[2] if t < 0.45 else ROBE[1] if t < 0.85 else light_col
            c[y, x] = (*col, 255)


def robe(p, kind):
    c = canvas(W, H)
    b, hem = p["bob"], p["hem"]
    m = np.zeros((H, W), bool)
    top = 21 + b
    for y in range(top, 47):
        t = (y - top) / (46 - top)
        x0 = round(12 - 4 * t ** 0.8) - (hem if y >= 44 else 0)
        x1 = round(19 + 2.5 * t ** 0.9) + (hem if y >= 45 else 0)
        m[y, x0:x1 + 1] = True
    m[top - 1, 14:18] = True  # shoulders round off
    shade_robe(c, m, ROBE[0])
    for y in range(29 + b, 45):  # folds
        if m[y, 13]:
            c[y, 13] = (*ROBE[3], 255)
        if m[y, 18] and y % 5:
            c[y, 18] = (*ROBE[0], 255)
    ys, xs = np.nonzero(m)
    for x in set(xs):  # hem in the deep shade
        c[ys[xs == x].max(), x] = (*ROBE[3], 255)
    if kind == "trim":
        for x in range(W):
            col = [y for y in range(H) if m[y, x]]
            if col:
                for y in col[-3:-1]:
                    c[y, x] = (*(GOLD[1] if x % 4 else GOLD[0]), 255)
        for x in range(10, 22):  # belt
            if m[31 + b, x]:
                c[31 + b, x] = (*GOLD[2], 255)
        for (sx, sy) in [(15, 36), (11, 40), (19, 39), (16, 26)]:  # stars
            if m[sy + b, sx]:
                c[sy + b, sx] = (*GOLD[0], 255)
    # sleeve: shoulder to just short of the fist
    sx, sy = 17, 23 + b
    hx, hy = p["hand"]
    line(c, sx, sy, hx - 1 if hx > sx else hx, hy - 1, ROBE[1], 3)
    line(c, sx, sy, hx - 1 if hx > sx else hx, hy - 1, ROBE[2], 1)
    if kind == "trim":
        put(c, hx - 1, hy, GOLD[1]); put(c, hx, hy - 1, GOLD[1])
    return outline(c)


def body(p):
    c = canvas(W, H)
    b = p["bob"]
    for x in range(11, 14):  # back boot
        for y in range(45, 48):
            put(c, x, y, WOOD[1])
    for x in range(17, 21):  # front boot
        for y in range(45, 48):
            put(c, x, y, WOOD[0] if y == 45 else WOOD[1])
    for y in range(12, 20):  # head
        for x in range(14, 20):
            put(c, x, y + b, SKIN[0] if x > 15 else SKIN[1])
    put(c, 20, 16 + b, SKIN[0]); put(c, 20, 17 + b, SKIN[1])  # nose
    put(c, 18, 15 + b, OUTLINE)  # eye
    put(c, 17, 14 + b, HAIR[0]); put(c, 18, 14 + b, HAIR[0])  # brow
    for y in range(12, 19):  # hair at the back of the head
        for x in range(13, 15 + (1 if y > 15 else 0)):
            put(c, x, y + b, HAIR[1] if x == 13 else HAIR[0])
    for y in range(17, 29):  # beard, tapering to a point
        w = max(1, round(3.5 - (y - 17) * 0.28))
        cx = 17.5 + (y - 17) * 0.12
        for x in range(round(cx - w), round(cx + w) + 1):
            put(c, x, y + b, HAIR[1] if x < cx - 1 else HAIR[0])
    put(c, 18, 18 + b, SKIN[2]); put(c, 19, 18 + b, SKIN[2])  # mouth
    return outline(c)


def hat(p, kind):
    c = canvas(W, H)
    b = p["bob"]
    if kind == "pointed":
        for x in range(9, 24):  # brim
            put(c, x, 12 + b, ROBE[2] if x < 13 else ROBE[1])
        for x in range(10, 23):
            put(c, x, 11 + b, GOLD[1] if 12 <= x <= 20 else ROBE[1])  # band
        for i, y in enumerate(range(10, -1, -1)):  # cone, bending back
            w = 4.2 * (1 - i / 11) ** 0.9
            cx = 16 - 6 * (i / 10) ** 1.8
            x0, x1 = round(cx - w), round(cx + w)
            for x in range(x0, x1 + 1):
                t = (x - x0) / max(1, x1 - x0)
                put(c, x, y + b, ROBE[3] if t < 0.2 else ROBE[2] if t < 0.5 else ROBE[1] if t < 0.9 else ROBE[0])
        put(c, 17, 7 + b, GOLD[0])  # a star on the cone
    else:  # a wide-brimmed round hat with a feather
        for x in range(7, 26):
            put(c, x, 12 + b, ROBE[2] if x < 11 else ROBE[1] if x < 23 else ROBE[0])
        for x in range(8, 25):
            put(c, x, 13 + b, ROBE[3])
        for y in range(6, 12):
            r = [5, 6, 6, 6, 6, 6][y - 6]
            for x in range(16 - r, 16 + r + 1):
                put(c, x, y + b, ROBE[3] if x < 13 else ROBE[2] if x < 16 else ROBE[1] if x < 20 else ROBE[0])
        for x in range(10, 23):
            put(c, x, 11 + b, GOLD[2] if x < 13 else GOLD[1])
        for i in range(7):  # feather sweeping back
            put(c, 11 - i, 10 - i // 2 + b, WHITE if i % 3 else HAIR[1])
            put(c, 11 - i, 9 - i // 2 + b, HAIR[0])
    return outline(c)


def staff(p):
    c = canvas(W, H)
    (x0, y0), (x1, y1) = p["staff"]
    line(c, x0, y0, x1, y1, WOOD[1])
    n = max(abs(x1 - x0), abs(y1 - y0))
    for i in range(0, n, 3):  # light grain on the lit side
        put(c, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, WOOD[0])
    for dx, dy in [(0, -1), (-1, 0), (1, 0), (0, 1), (0, 0)]:  # gem
        put(c, x1 + dx, y1 - 1 + dy, GEM[1])
    put(c, x1, y1 - 1, GEM[0]); put(c, x1 + 1, y1 - 2, WHITE)
    c = outline(c)
    g = p["glow"]
    rays = [(0, -3), (-3, -1), (3, -1), (0, 2), (-2, -3), (2, -3), (-2, 1), (2, 1)]
    for dx, dy in rays[: g * 2 + (1 if g else 0)]:
        if c[min(max(y1 + dy, 0), H - 1), min(max(x1 + dx, 0), W - 1), 3] == 0:
            put(c, x1 + dx, y1 + dy, GEM[0] if g >= 2 else GEM[1])
    for i in range(p.get("burst", 0) * 4):  # release sparks flying forward
        a = -0.9 + i * 0.35
        r = 3 + p["burst"] * 1.5 + (i % 2)
        put(c, x1 + math.cos(a) * r, y1 - 1 + math.sin(a) * r, WHITE if i % 2 else GEM[0])
    return c


def hand(p):
    c = canvas(W, H)
    hx, hy = p["hand"]
    for dx, dy in [(0, 0), (1, 0), (0, 1), (1, 1), (0, -1)]:
        put(c, hx + dx, hy + dy, SKIN[0] if dy < 1 else SKIN[1])
    return outline(c)


def wizard(frames, name, out):
    parts = {"robe_plain": lambda p: robe(p, "plain"), "robe_trim": lambda p: robe(p, "trim"), "body": body,
             "hat_pointed": lambda p: hat(p, "pointed"), "hat_brim": lambda p: hat(p, "brim"), "staff": staff, "hand": hand}
    for layer, fn in parts.items():
        s = sheet([fn(p) for p in frames])
        save(s, out / f"wizard_{name}_{layer}.png")
        out_check[f"wizard_{name}_{layer}"] = check(s)


def blob(c, cx, cy, r, ramp, jitter, rng):
    """A filled flame blob: rings of colour from the hot core outward, edge broken up by noise."""
    for y in range(c.shape[0]):
        for x in range(c.shape[1]):
            d = math.hypot((x - cx) * 0.9, y - cy) + rng.uniform(-jitter, jitter)
            if d < r:
                k = min(len(ramp) - 1, int(d / r * len(ramp)))
                if c[y, x, 3] == 0 or k < 1:
                    c[y, x] = (*ramp[k], 255)


def fireball():
    ramp = [WHITE, GOLD[0], GOLD[1], FIRE[0], FIRE[1]]
    frames = []
    for f in range(4):
        rng = np.random.default_rng(10 + f)
        c = canvas(24, 16)
        for i in range(7):  # tongues trailing left, flickering per frame
            t = i / 6
            x = 14 - t * 12 + rng.uniform(-1, 1)
            y = 8 + math.sin(f * 1.6 + i * 1.3) * (1 + 2 * t)
            blob(c, x, y, 3.5 * (1 - t) + 1.2, ramp[2:], 0.6, rng)
        blob(c, 16, 8, 5, ramp, 0.4, rng)
        frames.append(outline(c, FIRE[2]))
    return sheet(frames)


def impact():
    ramp = [WHITE, GOLD[0], GOLD[1], FIRE[0], FIRE[1]]
    frames = []
    for f in range(4):
        rng = np.random.default_rng(20 + f)
        c = canvas(32, 32)
        if f == 0:
            blob(c, 16, 16, 7, ramp, 0.8, rng)
        elif f in (1, 2):
            r0, r1 = (5, 11) if f == 1 else (9, 14)
            for y in range(32):
                for x in range(32):
                    d = math.hypot(x - 16, y - 16) + rng.uniform(-0.8, 0.8)
                    if r0 <= d < r1:
                        k = int((d - r0) / (r1 - r0) * 3) + (1 if f == 2 else 0)
                        c[y, x] = (*ramp[min(k + 1, 4)], 255)
            if f == 1:
                blob(c, 16, 16, 4, ramp[:3], 0.5, rng)
        for i in range(6 + f * 2):  # sparks and embers flying out
            a = rng.uniform(0, 2 * math.pi)
            r = 6 + f * 3.5 + rng.uniform(0, 3)
            put(c, 16 + math.cos(a) * r, 16 + math.sin(a) * r, [GOLD[0], FIRE[0], FIRE[1], FIRE[2]][min(f, 3)])
        frames.append(outline(c, FIRE[2]) if f < 3 else c)
    return sheet(frames)


GLYPHS = ["01110 10001 11111 10001 10001", "11110 00010 00100 01000 11110", "10101 10101 01110 00100 00100",
          "00100 01010 10001 01010 00100", "11011 00100 01110 00100 11011", "10000 11000 10100 10010 11111",
          "01010 11111 01010 11111 01010", "00100 00100 11111 01110 10001"]


def ellipse(c, cx, cy, rx, ry, col, step=0.002, gaps=None):
    t = 0.0
    while t < 2 * math.pi:
        if not gaps or not any(a <= t < b for a, b in gaps):
            put(c, cx + rx * math.cos(t), cy + ry * math.sin(t), col)
        t += step


def halo(c, col):
    """A dithered one-pixel glow next to the lines (no blended pixels)."""
    a = c[..., 3] > 0
    n = np.zeros_like(a)
    n[1:] |= a[:-1]; n[:-1] |= a[1:]; n[:, 1:] |= a[:, :-1]; n[:, :-1] |= a[:, 1:]
    yy, xx = np.mgrid[: c.shape[0], : c.shape[1]]
    c[n & ~a & ((xx + yy) % 2 == 0)] = (*col, 255)


def circle(tier):
    Wc, Hc, cx, cy = 300, 150, 150, 75
    c = canvas(Wc, Hc)
    P = lambda u, v, s=1.0: (cx + u * 145 * s, cy + v * 70 * s)  # flat circle space (-1..1) to the tilted view
    if tier == "quiet":
        ellipse(c, cx, cy, 145, 70, VIOLET[0])
        ellipse(c, cx, cy, 128, 62, VIOLET[1], gaps=[(0.3, 0.7), (2.0, 2.3), (3.6, 4.1), (5.2, 5.5)])
        for i in range(6):
            a = i * math.pi / 3 + 0.3
            put(c, *P(math.cos(a), math.sin(a), 0.6), VIOLET[1])
        halo(c, VIOLET[1])
        return c
    ellipse(c, cx, cy, 145, 70, GOLD[1])
    ellipse(c, cx, cy, 143, 69, WHITE)
    ellipse(c, cx, cy, 120, 58, GOLD[2])
    ellipse(c, cx, cy, 88, 42, VIOLET[0])
    ellipse(c, cx, cy, 40, 19, GOLD[0])
    for k in range(2):  # hexagram: two triangles
        pts = [P(math.cos(a), math.sin(a), 0.61) for a in [k * math.pi / 3 - math.pi / 2 + j * 2 * math.pi / 3 for j in range(3)]]
        for j in range(3):
            line(c, *pts[j], *pts[(j + 1) % 3], GOLD[1])
    for i in range(24):  # runes round the rim band
        a = i * 2 * math.pi / 24
        x, y = P(math.cos(a), math.sin(a), 0.905)
        g = GLYPHS[i % len(GLYPHS)].split()
        for gy, row in enumerate(g):
            for gx, ch in enumerate(row):
                if ch == "1":
                    put(c, x - 2 + gx, y - 2 + gy, GOLD[0] if i % 3 else WHITE)
    halo(c, VIOLET[1])
    rng = np.random.default_rng(5)
    for x in range(cx - 9, cx + 10):  # the beam rising from the centre, dithered at its edges
        edge = abs(x - cx)
        for y in range(0, cy):
            if edge < 4 or (edge < 7 and (x + y) % 2 == 0) or (edge < 10 and (x + y) % 4 == 0):
                c[y, x] = (*(WHITE if edge < 2 else GOLD[0] if edge < 5 else GOLD[1]), 255)
    for _ in range(70):  # particles rising off the rim
        a = rng.uniform(0, 2 * math.pi)
        x, y = P(math.cos(a), math.sin(a), rng.uniform(0.7, 1.0))
        put(c, x, y - rng.uniform(4, 30), [WHITE, GOLD[0], GOLD[1], VIOLET[0]][rng.integers(4)])
    return c


if __name__ == "__main__":
    out_check = {}
    wizard(IDLE, "idle", HERE)
    wizard(CAST, "cast", HERE)
    for name, s in [("fireball_fly", fireball()), ("fireball_impact", impact()), ("circle_quiet", circle("quiet")),
                    ("circle_blaze", circle("blaze"))]:
        save(s, HERE / f"{name}.png")
        out_check[name] = check(s)
    meta(HERE / "check.json", out_check)
    for k, v in out_check.items():
        print(f"{k:28} {v}")
