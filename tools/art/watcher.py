"""The Watcher (#309, S11, S17): a hooded cloak seen from the front, darkness under the hood and two
pale eyes in it. Flat tones in clear bands and a bold dark outline, no rounded shading.

Layers, back to front: cloak (the robe sheets), body (the darkness under the hood and the eyes),
hood (the hat sheets: every hood has the shoulder mantle), staff, glove. Cloth is drawn in
palette.KEY so the game can swap in the seat colour. Front view, centred on x = 24 (the feet point is
(24, 63)), so the game can mirror it: the staff is the only one-sided part.
"""
from palette import GEM, GOLD, KEY, CLOTH, WOOD, WATCHER
from pix import H, W, ell, hexrgb, poly, thick

R = lambda ramp: [hexrgb(c) for c in ramp]
K, GOLDC, GEMC, CLOTHC, WOODC = map(R, (KEY, GOLD, GEM, CLOTH, WOOD))
INK, VOID, EYE, EYE_GLOW, GLOVE = (hexrgb(WATCHER[k]) for k in ("outline", "void", "eye", "eye_glow", "glove"))

CX = 24  # the centre line
HOODS = [("pointed", "Pointed hood"), ("brim", "Wide hat"), ("hood", "Cowl"), ("crooked", "Bent hood"), ("turban", "Wrapped hood")]
CLOAKS = [("plain", "Plain"), ("starry", "Starry"), ("sash", "Sash"), ("mantle", "Long mantle"), ("runic", "Runic")]


def pose(bob=0, eyes="open", hand=(37, 40), staff=((37, 63), (37, 13)), glow=1, hem=0):
    return dict(bob=bob, eyes=eyes, hand=hand, staff=staff, glow=glow, hem=hem)


REST = pose()


def outlined(layer):
    """The layer with a bold one-pixel outline in INK round everything in it."""
    out = dict(layer)
    for x, y in layer:
        for q in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if q not in layer and 0 <= q[0] < W and 0 <= q[1] < H:
                out[q] = INK
    return out


def band(m, f):
    """Colours each pixel of mask m with f(x, y), an index into the key ramp (or a colour tuple)."""
    out = {}
    for x, y in m:
        c = f(x, y)
        out[(x, y)] = K[c] if isinstance(c, int) else c
    return out


# ---------- the cloak ----------

TOP, HEM = 26, 62  # the cloak's shoulders and hem line at rest
TOP_W, HEM_W = 9.5, 15.5
TEETH = [0, 1, 2, 1, 0, 2, 3, 1, 0, 1, 2, 0, 1, 3, 2, 0, 1, 2, 1, 0, 2, 1, 3, 1, 0, 1, 2, 1, 0, 2, 1, 0]  # the ragged hem, per column


def half_width(y):
    t = (y - TOP) / (HEM - TOP)
    return TOP_W + (HEM_W - TOP_W) * t ** 0.85


def cloak_mask(p):
    b = p["bob"]
    m = set()
    for y in range(TOP + b, HEM + 2):
        hw = half_width(y - b)
        for x in range(int(CX - hw), int(CX + hw) + 1):
            tooth = TEETH[(x - 8 + p["hem"]) % len(TEETH)]
            if y <= HEM + 1 - tooth:
                m.add((x, y))
    hx, hy = p["hand"]
    m |= ell(hx - 2.5, hy - 1 + b, 4, 3.5)  # the sleeve reaching for the staff
    return m


def opening(p):
    """The dark gap down the front where the cloak parts."""
    b = p["bob"]
    out = set()
    for y in range(36 + b, HEM + 2):
        hw = 0.5 + (y - 36 - b) * 0.09
        out |= {(x, y) for x in range(int(CX - hw), int(CX + hw) + 1)}
    return out


def cloak_tone(p):
    b = p["bob"]

    def f(x, y):
        hw = half_width(y - b)
        d = abs(x + 0.5 - CX) / hw
        if y >= HEM - 1 - TEETH[(x - 8 + p["hem"]) % len(TEETH)] + 1:
            return 3  # the hem's lower edge
        if d < 0.42:
            return 1  # the front panels catch the light
        if d < 0.72:
            return 2
        return 3
    return f


CREASES = [(-6, 0.9), (6, 0.9), (-11, 1.1), (11, 1.1)]  # folds: offset from the centre at the hem


def cloak_layer(p, kind):
    b = p["bob"]
    m = cloak_mask(p)
    c = band(m, cloak_tone(p))
    for dx, _ in CREASES:  # folds run from under the mantle to the hem's teeth
        start = 42 if abs(dx) < 8 else 48
        for y in range(start + b, HEM + 1):
            t = (y - 40 - b) / (HEM - 40)
            x = round(CX + dx * (0.45 + 0.55 * t))
            if (x, y) in c and c[(x, y)] != VOID:
                c[(x, y)] = K[3] if y < start + b + 4 else K[4]
    for q in opening(p):
        if q in m:
            c[q] = VOID
    if kind == "starry":
        for x, y in [(19, 45), (29, 48), (16, 55), (31, 57), (21, 59), (13, 60), (34, 52)]:
            star(c, x, y + b)
        trim(c, m, p, GOLDC[1], GOLDC[2])
    elif kind == "sash":  # a cloth belt with a knot and a hanging tail
        belt = {(x, y) for x, y in m if 43 + b <= y <= 44 + b}
        c.update({q: CLOTHC[1] if q[1] == 43 + b else CLOTHC[2] for q in belt})
        c.update({(x, y): CLOTHC[3] for x, y in belt if abs(x + 0.5 - CX) > half_width(y - b) - 3})  # it wraps round the sides
        c.update({(x, y): INK for x, y in m if y in (42 + b, 45 + b) and (x, y) not in opening(p)})
        knot = {(CX + 2, 42 + b), (CX + 3, 42 + b), (CX + 1, 43 + b), (CX + 2, 43 + b), (CX + 3, 43 + b), (CX + 4, 43 + b),
                (CX + 1, 44 + b), (CX + 2, 44 + b), (CX + 3, 44 + b), (CX + 4, 44 + b), (CX + 2, 45 + b), (CX + 3, 45 + b)}
        tail = {(x, y) for y in range(46 + b, 53 + b) for x in (CX + 2 + (y - 46 - b) // 4, CX + 3 + (y - 46 - b) // 4)}
        c.update({q: CLOTHC[1] if q[0] <= CX + 2 else CLOTHC[2] for q in knot})
        c.update({q: CLOTHC[2] if q[0] == min(x for x, y in tail if y == q[1]) else CLOTHC[3] for q in tail})
        c.update({(x, y + 1): INK for x, y in tail if (x, y + 1) not in tail})
    elif kind == "mantle":  # a second, longer cowl under the hood's, dipping to a point at the front
        cape = set()
        for y in range(28 + b, 48 + b):
            hw = min(14.5, 10 + (y - 28 - b) * 1.0)
            for x in range(int(CX - hw), int(CX + hw) + 1):
                if y <= b + 45.5 - 0.42 * abs(x + 0.5 - CX):
                    cape.add((x, y))
        c.update(band(cape, lambda x, y: 1 if abs(x + 0.5 - CX) < 6 else (2 if abs(x + 0.5 - CX) < 11 else 3)))
        for side in (-1, 1):
            c.update({q: K[3] for q in thick([(CX - 0.5 + side * 10, 36 + b), (CX - 0.5 + side * 2, 42 + b)], 1) & cape})
        c.update({q: K[3] for q in cape if (q[0], q[1] + 1) not in cape})
        c.update({(x, y + 1): INK for x, y in cape if (x, y + 1) not in cape})
    elif kind == "runic":
        trim(c, m, p, K[4], K[4], depth=4)
        for i, x in enumerate(range(11, 38, 4)):
            glyph = [[(0, 0), (1, 1), (0, 2)], [(0, 0), (0, 1), (0, 2), (1, 1)], [(1, 0), (0, 1), (1, 2)]][i % 3]
            for dx, dy in glyph:
                q = (x + dx, 57 + dy)
                if q in c and c[q] == K[4]:
                    c[q] = GOLDC[1]
    return outlined(c)


def trim(c, m, p, col, low, depth=2):
    for x, y in m:
        if (x, y + depth) not in m and c.get((x, y)) != VOID:
            c[(x, y)] = col if (x, y + 1) in m else low


def star(c, x, y):
    for q in [(x, y - 1), (x - 1, y), (x + 1, y), (x, y + 1)]:
        if q in c and c[q] != VOID:
            c[q] = GOLDC[2]
    if (x, y) in c:
        c[(x, y)] = GOLDC[0]


# ---------- the darkness under the hood, and the eyes ----------

FACE = (24, 19)  # the hood opening's centre at rest


def body_layer(p):
    fx, fy = FACE[0], FACE[1] + p["bob"]
    c = {q: VOID for q in ell(fx - 0.5, fy + 0.5, 5, 6)}
    ey = fy + 1
    left, right = [(fx - 3, ey), (fx - 2, ey)], [(fx + 1, ey), (fx + 2, ey)]
    if p["eyes"] == "open":  # slanted: the outer corners a pixel higher, glowing
        for q in left + right:
            c[q] = EYE
        for q in [(fx - 4, ey - 1), (fx + 3, ey - 1), (fx - 2, ey + 1), (fx + 1, ey + 1)]:
            c[q] = EYE_GLOW
    elif p["eyes"] == "narrow":
        for q in left + right:
            c[q] = EYE_GLOW
    elif p["eyes"] == "wide":
        for q in left + right + [(x, y - 1) for x, y in left + right]:
            c[q] = EYE
    # "shut": nothing but darkness
    return c


# ---------- hoods: each has the shoulder mantle ----------

def mantle_mask(p):
    """A short cowl-like cape over the shoulders, wider than the cloak under it, dipping to a point at the front."""
    b = p["bob"]
    m = set()
    for y in range(23 + b, 40 + b):
        hw = min(13.5, 7 + (y - 23 - b) * 1.0)
        for x in range(int(CX - hw), int(CX + hw) + 1):
            d = abs(x + 0.5 - CX)
            if y <= b + 36.5 - 0.42 * d:
                m.add((x, y))
    return m


def drape(p):
    """The cowl's fold lines: from each shoulder down toward the front point."""
    b = p["bob"]
    out = set()
    for side in (-1, 1):
        out |= thick([(CX - 0.5 + side * 9, 27 + b), (CX - 0.5 + side * 4, 31 + b), (CX - 0.5 + side * 1.5, 34 + b)], 1)
    return out


def hood_shell(p, kind):
    fx, fy = FACE[0], FACE[1] + p["bob"]
    if kind == "hood":  # a round cowl
        return ell(fx - 0.5, fy - 0.5, 9, 9)
    shell = ell(fx - 0.5, fy + 0.5, 7.5, 8)
    if kind in ("pointed", "brim", "turban"):  # straight sides up to a point
        shell |= poly([(fx - 8, fy + 1), (fx - 2, fy - 14), (fx + 1, fy - 14), (fx + 7, fy + 1)])
    elif kind == "crooked":  # the point bends over to one side
        shell |= poly([(fx - 8, fy + 1), (fx - 3, fy - 10), (fx + 4, fy - 14), (fx + 9, fy - 11), (fx + 4, fy - 8), (fx + 7, fy + 1)])
    return shell


def hood_layer(p, kind):
    fx, fy = FACE[0], FACE[1] + p["bob"]
    hole = ell(fx - 0.5, fy + 1, 4.5, 5.5) | {(x, y) for x in range(fx - 4, fx + 4) for y in range(fy + 3, fy + 7)}
    shell = (hood_shell(p, kind) | mantle_mask(p)) - hole
    mantle = mantle_mask(p) - hood_shell(p, kind)

    folds = drape(p)

    def f(x, y):
        if (x, y) in mantle:
            if (x, y) in folds:
                return 3
            d = abs(x + 0.5 - CX)
            if y < 30 + p["bob"]:
                return 1
            return 1 if d < 6 else (2 if d < 11 else 3)
        near = lambda r: any((x + dx, y + dy) in hole for dx in range(-r, r + 1) for dy in range(0, r + 1))
        if near(1):
            return 0  # the hood's lip, folded back, catches the light
        if near(2):
            return 1
        if y < fy - 5:
            return 1 if abs(x + 0.5 - fx) < 4 else 2
        return 2 if abs(x + 0.5 - fx) < 7 else 3
    c = band(shell, f)
    for q in mantle:  # the mantle's lower edge turns under, in shadow
        if (q[0], q[1] + 1) not in shell:
            c[q] = K[3]
    for x, y in hole:  # the inside of the hood, in deep shadow before the darkness
        if y < fy + 3 and any(q not in hole for q in ((x - 1, y), (x + 1, y), (x, y - 1))):
            c[(x, y)] = K[4]
    if kind == "brim":
        crown = poly([(fx - 5, fy - 7), (fx + 4, fy - 7), (fx + 2, fy - 16), (fx - 1, fy - 19), (fx - 3, fy - 14)])
        brim = ell(fx - 0.5, fy - 6.5, 13, 2.4)
        c.update(band(crown, lambda x, y: 1 if x < fx else 2))
        c.update({q: K[2] for q in brim})
        c.update({q: K[3] for q in brim if q[1] >= fy - 7})
        c.update({q: GOLDC[1] for q in crown if fy - 10 <= q[1] <= fy - 9})
    elif kind == "turban":
        wrap = {(x, y) for x, y in hood_shell(p, kind) if fy - 8 <= y <= fy - 4}
        c.update({q: CLOTHC[1] if (q[0] - q[1]) % 4 else CLOTHC[3] for q in wrap})
        c.update({q: GOLDC[1] for q in ell(fx - 0.5, fy - 6, 1.6, 1.6)})
        c[(fx, fy - 6)] = GEMC[1]
    return outlined(c)


# ---------- the staff and the glove ----------

def staff_tip(p):
    (_, _), (x1, y1) = p["staff"]
    return x1, y1 - 4


def staff_layer(p):
    (x0, y0), (x1, y1) = p["staff"]
    c = {}
    for y in range(min(y0, y1), max(y0, y1) + 1):
        t = (y - y1) / max(1, y0 - y1)
        x = round(x1 + (x0 - x1) * t)
        c[(x, y)] = WOODC[2]
        c[(x + 1, y)] = WOODC[3]
    gx, gy = staff_tip(p)
    # prongs curling up either side of the crystal
    prongs = [(gx - 2, gy + 3), (gx - 3, gy + 2), (gx - 3, gy + 1), (gx - 3, gy), (gx - 2, gy - 1),
              (gx + 3, gy + 3), (gx + 4, gy + 2), (gx + 4, gy + 1), (gx + 4, gy), (gx + 3, gy - 1),
              (gx - 1, gy + 3), (gx, gy + 3), (gx + 1, gy + 3), (gx + 2, gy + 3), (gx, gy + 4), (gx + 1, gy + 4)]
    c.update({q: WOODC[2] if q[0] <= gx else WOODC[3] for q in prongs})
    crystal = {(gx, gy - 3), (gx + 1, gy - 3), (gx - 1, gy - 2), (gx, gy - 2), (gx + 1, gy - 2), (gx + 2, gy - 2),
               (gx - 1, gy - 1), (gx, gy - 1), (gx + 1, gy - 1), (gx + 2, gy - 1), (gx - 1, gy), (gx, gy), (gx + 1, gy),
               (gx + 2, gy), (gx, gy + 1), (gx + 1, gy + 1), (gx, gy + 2), (gx + 1, gy + 2)}
    c.update({q: GEMC[1] if q[0] <= gx and q[1] < gy else (GEMC[2] if q[1] < gy + 1 else GEMC[3]) for q in crystal})
    c[(gx, gy - 2)] = GEMC[0]
    out = outlined(c)
    if p["glow"]:
        for dx, dy in [(0, -5), (-3, -3), (4, -3), (0, 4)][: p["glow"] * 2]:
            out.setdefault((gx + dx, gy + dy), GEMC[1])
    return out


def glove_layer(p):
    hx, hy = p["hand"]
    hy += p["bob"]
    m = {(x, y) for x in range(hx - 1, hx + 2) for y in range(hy - 1, hy + 2)}
    c = {q: GLOVE for q in m}
    c[(hx - 1, hy - 1)] = hexrgb(WATCHER["glove_lit"])
    return outlined(c)


def frame(p, hood, cloak):
    """One finished frame: every layer stacked, back to front."""
    out = {}
    for layer in (cloak_layer(p, cloak), body_layer(p), hood_layer(p, hood), staff_layer(p), glove_layer(p)):
        out.update(layer)
    return out
