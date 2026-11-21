"""The spells (#263): a damage spell per spark (a flight loop drawn flying right, and an impact), the
ward that block caps raise, and the final spell the circle fires at the slam.

Damage spells are drawn in their spark's ramp (palette.SPARK_RAMPS) and each has its own shape, so it
reads as its spark when small: a round fireball, a long water lance, a crescent wind blade, a jagged
bolt, a dark orb with a bright rim, a dripping glob. The ward and the final spell are drawn in
palette.KEY: the game recolours the ward per spark, and scales and tints the final spell by tier.

Each frame is a dict layer; random detail comes from seeded random.Random, so every run is the same.
"""
import math
import random

from palette import KEY, SPARK_RAMPS
from pix import area, ell, hexrgb, line, outline, over, paint, shade

SPELL = dict(w=40, h=40, head=(27, 20))  # every damage spell's frame; head is the flight's leading point
WARD = dict(w=48, h=64)  # the same frame as the wizards
FINAL = dict(w=96, h=64, head=(64, 32))

# id, spark, name; frame times for the flight loop and the impact
DAMAGE = [("fireball", "Ember", "Fireball"), ("water_lance", "Tide", "Water lance"), ("wind_blade", "Gale", "Wind blade"),
          ("lightning_bolt", "Storm", "Lightning bolt"), ("shadow_orb", "Void", "Shadow orb"), ("acid_glob", "Rot", "Acid glob")]
FLIGHT_MS = [80, 80, 80, 80]
IMPACT_MS = [60, 80, 90, 110]
WARD_MS = [60, 60, 70, 80, 140, 140]
FINAL_FLIGHT_MS = [70, 70, 70, 70]
FINAL_IMPACT_MS = [60, 70, 80, 90, 110, 130]

KEYC = [hexrgb(c) for c in KEY]


def disc(c, cx, cy, r, ramp, rng=None, jitter=0.0, sx=1.0, keep=1):
    """A filled disc in bands of ramp from the core out; its edge broken up by jitter. Existing pixels
    are kept unless the new one is in the first keep bands (the hotter core)."""
    for y in range(int(cy - r - 2), int(cy + r + 3)):
        for x in range(int(cx - r * sx - 2), int(cx + r * sx + 3)):
            d = math.hypot((x - cx) / sx, y - cy) + (rng.uniform(-jitter, jitter) if rng else 0)
            if d < r:
                k = min(len(ramp) - 1, int(d / r * len(ramp)))
                if (x, y) not in c or k < keep:
                    paint(c, [(x, y)], ramp[k])


def band(c, cx, cy, r0, r1, ramp, rng, jitter=0.8, gaps=0.0):
    """A ring between r0 and r1, banded from the inside out, with random gaps."""
    for y in range(int(cy - r1 - 2), int(cy + r1 + 3)):
        for x in range(int(cx - r1 - 2), int(cx + r1 + 3)):
            d = math.hypot(x - cx, y - cy) + rng.uniform(-jitter, jitter)
            if r0 <= d < r1 and rng.random() >= gaps:
                paint(c, [(x, y)], ramp[min(len(ramp) - 1, int((d - r0) / (r1 - r0) * len(ramp)))])


def bolt(c, pts, core, edge):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            line(c, x0 + dx, y0 + dy, x1 + dx, y1 + dy, edge)
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        line(c, x0, y0, x1, y1, core)


def sparks(c, cx, cy, n, r, cols, rng):
    for i in range(n):
        a = rng.uniform(0, 2 * math.pi)
        d = r + rng.uniform(0, 3)
        paint(c, [(cx + math.cos(a) * d, cy + math.sin(a) * d)], cols[i % len(cols)])


# ---------- the six damage spells: flight(f, R) and impact(f, R), R the spark's ramp ----------

def fireball_flight(f, R):
    rng = random.Random(10 + f)
    c = {}
    for i in range(7):  # tongues of flame trailing left, flickering
        t = i / 6
        disc(c, 26 - t * 19 + rng.uniform(-1, 1), 20 + math.sin(f * 1.6 + i * 1.3) * (1 + 2.5 * t), 4.6 * (1 - t) + 1.3, R[1:4], rng, 0.3)
    disc(c, 27, 20, 6.5, R[:4], rng, 0.2)
    c = outline(c, R[4])
    sparks(c, 10, 20, 3, 6, [R[1], R[2]], rng)
    return c


def fireball_impact(f, R):
    rng = random.Random(20 + f)
    c = {}
    if f == 0:
        disc(c, 20, 20, 9, R[:4], rng, 0.8)
    else:
        r0, r1 = [(0, 0), (6, 13), (11, 17), (15, 19)][f]
        band(c, 20, 20, r0, r1, R[f - 1:4] if f < 3 else R[2:4], rng, gaps=0.15 * (f - 1))
        if f == 1:
            disc(c, 20, 20, 5, R[:3], rng, 0.5)
    c = outline(c, R[4]) if f < 3 else c
    sparks(c, 20, 20, 6 + f * 3, 8 + f * 3.5, [R[0], R[1], R[2], R[3]][f:] or [R[3]], rng)
    return c


def lance_flight(f, R):
    c = {}
    for x in range(3, 39):
        hh = min(3.6, (38 - x) * 0.6) if x >= 30 else 3.6 * ((x - 3) / 27) ** 0.8
        cy = 20 + math.sin(x * 0.4 - f * math.pi / 2) * (30 - x) / 27 * 1.6 if x < 30 else 20
        for y in range(int(cy - hh - 1), int(cy + hh + 2)):
            dy = (y - cy) / max(hh, 0.5)
            if abs(dy) <= 1:
                paint(c, [(x, y)], R[0] if abs(dy) < 0.3 else R[1] if abs(dy) < 0.65 or dy < 0 else R[2])
    for x in range(8, 34):  # a current spiralling round it
        y = 20 + math.sin(x * 0.7 - f * math.pi / 2) * 3.2
        if math.cos(x * 0.7 - f * math.pi / 2) > 0:
            paint(c, [(x, y)], R[0])
    c = outline(c, R[3])
    for i in range(4):  # droplets falling behind
        t = (i / 4 + f / 16) % 1
        paint(c, [(10 - t * 9 + i, 22 + t * 8 + i % 2)], R[1 + i % 2])
    return c


def lance_impact(f, R):
    rng = random.Random(30 + f)
    c = {}
    if f == 0:
        disc(c, 20, 20, 7, R[:3], rng, 0.6)
        c = outline(c, R[3])
    else:
        band(c, 20, 21, 3 + 4 * f, 5 + 4 * f, [R[1], R[2]] if f < 3 else [R[2]], rng, gaps=0.2 * f)
        if f == 1:
            disc(c, 20, 21, 4, R[:2], rng, 0.4)
    for i in range(10):  # droplets thrown out and falling
        a = -math.pi * (0.1 + 0.8 * i / 9) + rng.uniform(-0.15, 0.15)
        d = [5, 9, 13, 15][f] + rng.uniform(0, 2)
        x, y = 20 + math.cos(a) * d, 20 + math.sin(a) * d * 0.9 + f * f * 0.8
        paint(c, [(x, y)], R[0] if f < 2 else R[1])
        if f < 3:
            paint(c, [(x, y + 1)], R[2])
    return c


def blade_flight(f, R):
    c = {}
    tilt = [0, 0.12, 0, -0.12][f]
    for y in range(6, 35):
        for x in range(10, 38):
            xs = x - (y - 20) * tilt
            d_out = math.hypot((xs - 24) * 1.5, y - 20)
            d_in = math.hypot((xs - 20) * 1.5, y - 20)
            if d_out < 13.5 and d_in >= 13.5:
                depth = d_in - 13.5
                paint(c, [(x, y)], R[0] if depth > 3.6 else R[1] if depth > 1.8 else R[2])
    c = outline(c, R[4])
    for i, (y, x0, n) in enumerate([(14, 4, 9), (20, 1, 12), (26, 4, 9), (17, 8, 5), (23, 7, 6)]):  # speed lines
        n = n - (f + i) % 3 * 2
        for k in range(n):
            if k < n - 3 or (k + f) % 2 == 0:
                paint(c, [(x0 + k + (f * 2 + i) % 3, y)], R[1] if k > n // 2 else R[2])
    return c


def blade_impact(f, R):
    rng = random.Random(40 + f)
    c = {}
    n = [8, 12, 13, 13][f]
    for sgn in (1, -1):  # an X of two slashes, cut apart, then breaking up
        for k in range(-n, n + 1):
            x, y = 20 + k * 0.9, 20 + sgn * k * 0.7
            if f == 3 and (k + sgn) % 3:
                continue
            for dy in (0, 1) if abs(k) < n - 3 and f < 3 else (0,):
                paint(c, [(x, y + dy)], R[0] if f < 2 and abs(k) < n - 4 else R[1])
            if f == 2:
                paint(c, [(x, y + 3)], R[2])
    if f < 3:
        c = outline(c, R[3])
    for i in range(4 + 2 * f):  # leaves and gusts curling away
        a = rng.uniform(0, 2 * math.pi)
        d = 6 + f * 4
        x, y = 20 + math.cos(a) * d, 20 + math.sin(a) * d
        paint(c, [(x, y), (x + 1, y - 1)], R[1] if i % 2 else R[2])
    return c


def bolt_flight(f, R):
    rng = random.Random(50 + f)
    c = {}
    pts = [(3, 20)] + [(x, 20 + rng.uniform(-5, 5)) for x in range(8, 33, 5)] + [(35, 20)]
    branch = pts[2 + f % 3]
    bolt(c, [branch, (branch[0] + 4, branch[1] + rng.choice([-5, 5])), (branch[0] + 6, branch[1] + rng.choice([-7, 7]))], R[1], R[2])
    bolt(c, pts, R[0], R[1])
    disc(c, 35, 20, 3.6, R[:3], keep=3)
    c = outline(c, R[3])
    return c


def bolt_impact(f, R):
    rng = random.Random(60 + f)
    c = {}
    if f == 0:
        disc(c, 20, 20, 10, R[:3], rng, 0.8)
    if f in (1, 2):
        for i in range(7):  # jagged rays out from the hit
            a = i * 2 * math.pi / 7 + f * 0.25
            pts, d = [(20, 20)], 0
            while d < (13 if f == 1 else 15):
                d += 4
                pts.append((20 + math.cos(a) * d + rng.uniform(-1.5, 1.5), 20 + math.sin(a) * d + rng.uniform(-1.5, 1.5)))
            bolt(c, pts, R[0] if f == 1 else R[1], R[1] if f == 1 else R[2])
        disc(c, 20, 20, 4 if f == 1 else 2.5, R[:2], keep=2)
    c = outline(c, R[3]) if f < 3 else c
    sparks(c, 20, 20, 5 + 3 * f, 6 + 4 * f, [R[0], R[1]] if f < 3 else [R[2], R[3]], rng)
    return c


def orb_flight(f, R):
    c = {}
    motes = [(24 + math.cos(f * math.pi / 2 + i * 2 * math.pi / 3) * 11, 20 + math.sin(f * math.pi / 2 + i * 2 * math.pi / 3) * 4,
              math.sin(f * math.pi / 2 + i * 2 * math.pi / 3)) for i in range(3)]
    for i in range(5):  # wisps trailing left
        t = (i + f / 4) / 5
        disc(c, 18 - t * 15, 20 + math.sin(i * 2.1 + f * 1.57) * 2, 4.2 * (1 - t) + 1, [R[3], R[3], R[4]])
    for x, y, z in motes:
        if z < 0:  # behind the orb
            paint(c, [(x, y), (x + 1, y)], R[2])
    orb = {}
    disc(orb, 24, 20, 7.5, [R[4], R[4], R[4], R[3], R[1]])
    paint(orb, [(27, 15), (28, 16), (28, 15), (26, 14)], R[0])
    c = outline(over(c, orb), R[4])
    for x, y, z in motes:
        if z >= 0:
            paint(c, [(x, y), (x + 1, y), (x, y - 1)], R[0])
    return c


def orb_impact(f, R):
    rng = random.Random(70 + f)
    c = {}
    if f == 0:
        disc(c, 20, 20, 11, [R[4], R[4], R[4], R[3], R[1]])
    elif f == 1:  # it collapses inward
        band(c, 20, 20, 4, 7, [R[1], R[2], R[3]], rng, 0.4)
        disc(c, 20, 20, 4, [R[4]])
    elif f == 2:  # a bright pop and a dark ring flung out
        disc(c, 20, 20, 3.5, R[:2])
        band(c, 20, 20, 12, 14, [R[2], R[3]], rng, gaps=0.3)
    c = outline(c, R[4]) if f < 2 else c
    for i in range(6 + 2 * f):
        a = rng.uniform(0, 2 * math.pi)
        d = [13, 9, 10, 16][f] + rng.uniform(-1, 2)
        paint(c, [(20 + math.cos(a) * d, 20 + math.sin(a) * d)], [R[1], R[0], R[1], R[3]][f])
    return c


def glob_flight(f, R):
    wob = [0, 1, 0, -1][f]
    c = {}
    for i in range(4):  # goo trailing behind
        t = (i + 1) / 4
        disc(c, 24 - t * 16, 20 + math.sin(i * 1.7 + f * 1.57) * 1.5, 3.4 * (1 - t) + 1.2, [R[2], R[3]])
    disc(c, 25, 20 - wob * 0.5, 7 + wob * 0.4, [R[1], R[2], R[2], R[3]], sx=1.15 - wob * 0.05)
    disc(c, 23, 17, 3, [R[0], R[1]], keep=2)  # the wet shine
    c = outline(c, R[4])
    for x, y in [(28, 21), (24, 23)][: 1 + f % 2]:  # bubbles inside
        paint(c, [(x, y - 1), (x - 1, y), (x + 1, y), (x, y + 1)], R[1])
    for i, x in enumerate((21, 25, 29)):  # drips hanging off the underside, stretching and letting go
        n = (f + i * 2) % 4
        bottom = 27 + (1 if x == 25 else 0)
        paint(c, [(x, bottom + k) for k in range(min(n, 3))], R[2])
        if n == 3:
            paint(c, [(x, bottom + 5)], R[1])
    return c


def glob_impact(f, R):
    rng = random.Random(90 + f)
    sx, r, cy = [(1.4, 7, 21), (2.2, 6.5, 23), (2.6, 5, 25), (2.8, 4, 26)][f]
    m = ell(20, cy, r * sx, r)
    if f >= 1:  # it lands flat
        m = {(x, y) for x, y in m if y >= cy - r * (0.9 - 0.2 * f)}
    c = shade(m, R, roundness=2.5)
    for i in range(6 if f < 3 else 3):  # splashes flung up, then bubbles
        a = -math.pi * rng.uniform(0.1, 0.9)
        d = [8, 12, 14, 0][f] + rng.uniform(0, 2)
        if f < 3:
            x, y = 20 + math.cos(a) * d * 1.3, cy - 4 + math.sin(a) * d * 0.8 + f * f
            paint(c, [(x, y), (x, y + 1)], R[1])
        else:
            x, y = rng.randint(13, 27), cy - rng.randint(2, 5)
            paint(c, [(x, y - 1), (x - 1, y), (x + 1, y), (x, y + 1)], R[0])
    if f == 2:
        for x, y in [(16, cy - 2), (23, cy - 3), (26, cy - 1)]:
            paint(c, [(x, y - 1), (x - 1, y), (x + 1, y), (x, y + 1)], R[1])
    return c


DRAW = {"fireball": (fireball_flight, fireball_impact), "water_lance": (lance_flight, lance_impact),
        "wind_blade": (blade_flight, blade_impact), "lightning_bolt": (bolt_flight, bolt_impact),
        "shadow_orb": (orb_flight, orb_impact), "acid_glob": (glob_flight, glob_impact)}


def damage_frames(spell_id, spark):
    """[flight frames, impact frames] for one damage spell."""
    area(SPELL["w"], SPELL["h"])
    R = [hexrgb(c) for c in SPARK_RAMPS[spark]]
    fly, hit = DRAW[spell_id]
    return [[fly(f, R) for f in range(len(FLIGHT_MS))], [hit(f, R) for f in range(len(IMPACT_MS))]]


# ---------- the ward, in KEY ----------

def ward(f):
    """A curved barrier rising from the ground in front of the wizard, then shimmering."""
    area(WARD["w"], WARD["h"])
    K = KEYC
    top = [52, 36, 18, 8, 8, 8][f]
    c = {}
    cx, cy, rx, ry = 34, 35, 6.5, 27
    for y in range(max(top, 8), 63):
        for x in range(24, 44):
            d = math.hypot((x - cx) / rx, (y - cy) / ry)
            if d > 1:
                continue
            front = x >= cx
            if d > 0.82:
                col = K[1] if front else K[2]
            elif (x + 2 * y) % 6 == 0 or (x - 2 * y) % 6 == 0:  # the lattice
                col = K[2] if front else K[3]
            else:
                continue
            c[(x, y)] = col
    if f < 3:  # the rising edge, bright, with sparks above it
        for x in range(24, 44):
            if (x, top) in c or (x, top + 1) in c:
                c[(x, top)] = K[0]
        for i in range(5):
            paint(c, [(27 + i * 3.5, top - 2 - (i * 3 + f) % 4)], K[0] if i % 2 else K[1])
    else:  # a band of light running down it
        sy = [0, 0, 0, 12, 30, 48][f]
        for (x, y) in list(c):
            if sy <= y < sy + 4:
                c[(x, y)] = K[0]
    for x in range(26, 43):  # where it meets the ground
        paint(c, [(x, 62)], K[2] if 29 <= x <= 39 else K[3])
    return c


# ---------- the final spell, in KEY ----------

def final_flight(f):
    area(FINAL["w"], FINAL["h"])
    rng = random.Random(120 + f)
    K = KEYC
    c = {}
    for i in range(10):  # a long tail of light
        t = i / 9
        disc(c, 58 - t * 52, 32 + math.sin(f * 1.57 + i * 0.9) * 3 * t, 11 * (1 - t) + 2, K[1:4], rng, 0.3)
    disc(c, 64, 32, 14, K[:4], rng, 0.2, keep=2)
    c = outline(c, K[4])
    for i in range(14):  # sparkles spiralling round it
        a = f * math.pi / 2 + i * 2 * math.pi / 14
        d = 17 + (i % 3) * 2
        x, y = 62 + math.cos(a) * d, 32 + math.sin(a) * d * 0.8
        paint(c, [(x, y)], K[0] if i % 2 else K[1])
        if i % 3 == 0:
            paint(c, [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)], K[2])
    return c


def final_impact(f):
    area(FINAL["w"], FINAL["h"])
    rng = random.Random(140 + f)
    K = KEYC
    c = {}
    if f == 0:
        disc(c, 48, 32, 20, K[:4], rng, 1.0)
    elif f < 4:
        r0, r1 = [(0, 0), (12, 24), (20, 29), (26, 31)][f]
        band(c, 48, 32, r0, r1, K[f - 1:4], rng, gaps=0.1 * (f - 1))
        if f == 1:
            disc(c, 48, 32, 10, K[:3], rng, 0.6)
        for i in range(12):  # rays
            a = i * 2 * math.pi / 12 + f * 0.13
            line(c, 48 + math.cos(a) * r0 * 0.5, 32 + math.sin(a) * r0 * 0.5, 48 + math.cos(a) * (r1 + 4), 32 + math.sin(a) * (r1 + 4),
                 K[0] if f < 3 else K[1])
    else:
        band(c, 48, 32, 28 + f, 30 + f, [K[2]] if f == 4 else [K[3]], rng, gaps=0.5 if f == 4 else 0.75)
    c = outline(c, K[4]) if f < 3 else c
    sparks(c, 48, 32, 10 + 4 * f, 14 + 4 * f, [K[0], K[1], K[2]] if f < 4 else [K[2], K[3]], rng)
    return c
