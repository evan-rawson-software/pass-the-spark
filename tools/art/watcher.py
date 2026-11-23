"""The Watcher (#309, S11, S17): a hooded cloak seen from the front, darkness under the hood and two
pale eyes in it. Flat tones in clear bands and a bold dark outline, no rounded shading.

Layers, back to front: body (boots, the darkness under the hood and the eyes), cloak (the robe sheets:
the outer cloak, the inner robe and belt showing where it parts, and both sleeves), hood (the hat
sheets: every hood has the shoulder mantle), staff, glove. Cloth is drawn in palette.KEY so the game
can swap in the seat colour; most of it sits in the middle and dark shades, with the light ones only
on edges that face up. Front view, centred on x = 24 (the feet point is (24, 63)). The game may mirror
it, so the light comes from above, not from a side.
"""
from palette import BOOT, CLOTH, GEM, GOLD, KEY, WATCHER, WOOD
from pix import H, W, ell, hexrgb, poly, thick

R = lambda ramp: [hexrgb(c) for c in ramp]
K, GOLDC, GEMC, CLOTHC, WOODC, BOOTC = map(R, (KEY, GOLD, GEM, CLOTH, WOOD, BOOT))
INK, VOID, EYE, EYE_GLOW, GLOVE, GLOVE_LIT = (hexrgb(WATCHER[k]) for k in ("outline", "void", "eye", "eye_glow", "glove", "glove_lit"))
TRIM = [GOLDC[2], GOLDC[3]]  # the brass edging on the hood and mantle: lit, shadow

CX = 24  # the centre line
HOODS = [("pointed", "Pointed hood"), ("brim", "Wide hat"), ("hood", "Cowl"), ("crooked", "Bent hood"), ("turban", "Wrapped hood")]
CLOAKS = [("plain", "Plain"), ("starry", "Starry"), ("sash", "Sash"), ("mantle", "Long mantle"), ("runic", "Runic")]


def pose(bob=0, eyes="open", hand=(37, 40), free=(14, 44), staff=((37, 63), (37, 13)), glow=1, hem=0):
    """hand: the glove on the staff. free: the other glove, at its sleeve's cuff."""
    return dict(bob=bob, eyes=eyes, hand=hand, free=free, staff=staff, glow=glow, hem=hem)


REST = pose()


def outlined(layer, skip=()):
    """The layer with a bold one-pixel outline in INK round everything in it."""
    out = dict(layer)
    for x, y in layer:
        for q in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if q not in layer and q not in skip and 0 <= q[0] < W and 0 <= q[1] < H:
                out[q] = INK
    return out


def band(m, f):
    """Colours each pixel of mask m with f(x, y): an index into the key ramp, or a colour."""
    out = {}
    for x, y in m:
        c = f(x, y)
        out[(x, y)] = K[c] if isinstance(c, int) else c
    return out


# ---------- the body: boots, and the darkness under the hood ----------

FACE = (24, 17)  # the hood opening's centre at rest


def body_layer(p):
    b = p["bob"]
    c = {}
    for bx in (19, 27):  # boot toes, showing through the ragged hem
        for q in [(bx, 61), (bx + 1, 61), (bx - 1, 62), (bx, 62), (bx + 1, 62), (bx + 2, 62)]:
            c[q] = BOOTC[2] if q[1] == 61 else BOOTC[3]
    fx, fy = FACE[0], FACE[1] + b
    c.update({q: VOID for q in ell(fx - 0.5, fy + 0.5, 4.5, 5.5)})
    ey = fy + 1
    left, right = [(fx - 3, ey), (fx - 2, ey)], [(fx + 1, ey), (fx + 2, ey)]
    if p["eyes"] == "open":  # slanted: the outer corners a pixel higher, glowing
        for q in left + right:
            c[q] = EYE
        for q in [(fx - 2, ey + 1), (fx + 1, ey + 1), (fx - 3, ey - 1), (fx + 2, ey - 1)]:
            c[q] = EYE_GLOW
    elif p["eyes"] == "narrow":
        for q in left + right:
            c[q] = EYE_GLOW
    elif p["eyes"] == "wide":
        for q in left + right + [(x, y - 1) for x, y in left + right]:
            c[q] = EYE
    # "shut": nothing but darkness
    return outlined(c)


# ---------- the cloak, the inner robe and the sleeves ----------

TOP, HEM = 24, 62  # the cloak's shoulders and hem at rest
TOP_W, HEM_W = 9.5, 14.5
SWEEP = 4  # how far the hem sweeps out on the left, away from the staff
TEETH = [0, 2, 1, 0, 3, 1, 0, 1, 2, 0, 1, 3, 1, 0, 2, 1, 0, 1, 3, 2, 0, 1, 0, 2, 1, 3, 0, 1, 2, 0, 1, 2]  # the ragged hem


def edges(y):
    """The cloak's left and right edge on row y (at rest)."""
    t = max(0.0, (y - TOP) / (HEM - TOP))
    hw = TOP_W + (HEM_W - TOP_W) * t ** 0.8
    sweep = SWEEP * max(0.0, (t - 0.55) / 0.45) ** 1.5
    return CX - hw - sweep, CX + hw


def tooth(x, p):
    return TEETH[(x + p["hem"]) % len(TEETH)]


def cloak_mask(p):
    b = p["bob"]
    m = set()
    for y in range(TOP + b, HEM + 2):
        l, r = edges(y - b)
        for x in range(round(l), round(r) + 1):
            if y <= HEM + 1 - tooth(x, p):
                m.add((x, y))
    return m


def opening_half(y):
    """Half the width of the front opening where the inner robe shows, on row y at rest (0: closed)."""
    return 0 if y < 32 else 1 + (y - 32) * 0.17


def cloak_tone(p):
    b = p["bob"]

    def f(x, y):
        l, r = edges(y - b)
        u = (x + 0.5 - l) / (r - l)  # 0 at the left edge, 1 at the right
        if y >= HEM - tooth(x, p):
            return 4  # the hem turns under
        if y < TOP + b + 3:
            return 1 if 0.25 < u < 0.75 else 2  # the shoulders face up
        if u < 0.16 or u > 0.86:
            return 3  # the sides turn away
        return 2
    return f


CREASES = [(-9, 40), (-4, 44), (5, 44), (10, 40)]  # folds: offset from the centre at the hem, the row they start


def inner_robe(p, kind):
    """The inner robe where the cloak parts, its belt and buckle. Returns the mask and its colours."""
    b = p["bob"]
    m, c = set(), {}
    for y in range(32 + b, HEM + 1):
        h = opening_half(y - b)
        for x in range(round(CX - 0.5 - h), round(CX - 0.5 + h) + 1):
            if y <= HEM - 1 - tooth(x, p) // 2:
                m.add((x, y))
    for x, y in m:
        h = opening_half(y - b)
        c[(x, y)] = K[4] if abs(x - (CX - 0.5)) >= h - 1 else K[3]  # the cloak's edges shade it
    for x, y in m:  # the belt and its buckle
        if 40 + b <= y <= 41 + b:
            c[(x, y)] = WOODC[3] if y == 41 + b else WOODC[2]
    for q in [(CX - 1, 40 + b), (CX, 40 + b), (CX - 1, 41 + b), (CX, 41 + b)]:
        c[q] = GOLDC[1] if q[1] == 40 + b else GOLDC[2]
    if kind == "runic":  # brass runes down the inner robe
        for i, y in enumerate(range(44, HEM - 2, 4)):
            glyph = [[(0, 0), (0, 1), (0, 2), (1, 1)], [(0, 0), (1, 1), (0, 2)], [(1, 0), (0, 1), (1, 1), (1, 2)]][i % 3]
            for dx, dy in glyph:
                q = (CX - 1 + dx, y + dy + b)
                if q in m:
                    c[q] = GOLDC[2]
    return m, c


def sleeve(p, shoulder, cuff):
    """A wide sleeve from the shoulder to a bell-shaped cuff, its mouth dark. Returns its colours."""
    (sx, sy), (cx, cy) = shoulder, cuff
    b = p["bob"]
    arm = thick([(sx, sy + b), (cx, cy - 3)], 5) | poly([(cx - 3, cy - 4), (cx + 3, cy - 4), (cx + 4.5, cy + 2), (cx - 4.5, cy + 2)])
    mouth = {(x, y) for x, y in arm if y >= cy + 1 and abs(x - cx) <= 3}
    c = band(arm, lambda x, y: 4 if (x, y) in mouth else (3 if y > cy - 5 or (x, y + 2) not in arm else 2))
    for x, y in arm:  # the sleeve's top edge catches the light
        if (x, y - 1) not in arm and (x, y) not in mouth:
            c[(x, y)] = K[1]
    return c


def cloak_layer(p, kind):
    b = p["bob"]
    m = cloak_mask(p)
    c = band(m, cloak_tone(p))
    for dx, start in CREASES:  # folds run down to the hem's teeth, a lit edge beside each dark crease
        for y in range(start + b, HEM + 1):
            t = (y - start - b) / (HEM - start)
            x = round(CX - 0.5 + dx * (0.55 + 0.45 * t)) - (round(SWEEP * t * t) if dx < 0 else 0)
            if (x, y) in c and y < HEM - tooth(x, p):
                c[(x, y)] = K[4]
                if (x - 1, y) in c and t > 0.15:
                    c[(x - 1, y)] = K[1] if c[(x - 1, y)] == K[2] else K[2]
    robe, rc = inner_robe(p, kind)
    c.update(rc)
    for x, y in robe:  # the cloak's front edges, either side of the opening
        for q in ((x - 1, y), (x + 1, y)):
            if q in m and q not in robe:
                c[q] = GOLDC[2] if kind == "starry" else K[1]
    if kind == "starry":
        for x, y in [(17, 46), (30, 49), (14, 56), (32, 57), (20, 58), (11, 60), (34, 52), (27, 54)]:
            star(c, m, x, y + b)
        for x, y in m:
            if (x, y + 2) not in m and (x, y) not in robe:
                c[(x, y)] = GOLDC[2] if (x, y + 1) in m else GOLDC[3]
    elif kind == "sash":  # a wide cloth sash instead of the belt, knotted, with a hanging tail
        for x, y in m:
            if 39 + b <= y <= 42 + b:
                c[(x, y)] = CLOTHC[1] if y == 39 + b else (CLOTHC[2] if y < 42 + b else CLOTHC[3])
        knot = {(x, y) for x in range(CX + 2, CX + 5) for y in range(39 + b, 43 + b)}
        tail = {(x, y) for y in range(43 + b, 52 + b) for x in (CX + 2 + (y - 43 - b) // 4, CX + 3 + (y - 43 - b) // 4)}
        c.update({q: CLOTHC[1] if q[0] == CX + 2 else CLOTHC[2] for q in knot})
        c.update({q: CLOTHC[2] if q[0] == min(x for x, y in tail if y == q[1]) else CLOTHC[3] for q in tail})
        c.update({(x, y + 1): INK for x, y in tail if (x, y + 1) not in tail})
        c.update({(x, y): INK for x, y in m if y in (38 + b, 43 + b) and (x, y) not in tail})
    c = outlined(c)
    # sleeves go over the cloak: the staff arm reaches for the glove, the other hangs at the side
    hx, hy = p["hand"]
    fx, fy = p["free"]
    for s in (sleeve(p, (31, 27), (hx - 1, hy - 2 + b)), sleeve(p, (17, 27), (fx + 1, fy - 3 + b))):
        c.update(outlined(s))
    if kind == "mantle":  # a second, longer cowl under the hood's, over the sleeves, dipping to a point at the front
        cape = set()
        for y in range(TOP + b, 44 + b):
            hw = min(15, 10 + (y - TOP - b) * 1.0)
            for x in range(round(CX - 0.5 - hw), round(CX - 0.5 + hw) + 1):
                if y <= b + 42.5 - 0.42 * abs(x + 0.5 - CX):
                    cape.add((x, y))
        cc = band(cape, lambda x, y: 2 if abs(x + 0.5 - CX) < 9 else 3)
        for side in (-1, 1):
            cc.update({q: K[4] for q in thick([(CX - 0.5 + side * 11, 34 + b), (CX - 0.5 + side * 3, 39 + b)], 1) & cape})
        cc.update({q: K[4] for q in cape if (q[0], q[1] + 1) not in cape})
        c.update(outlined(cc))
    return c


def star(c, m, x, y):
    for q in [(x, y - 1), (x - 1, y), (x + 1, y), (x, y + 1)]:
        if q in m:
            c[q] = GOLDC[2]
    if (x, y) in m:
        c[(x, y)] = GOLDC[0]


# ---------- hoods: each has the shoulder mantle, edged in brass ----------

def mantle_mask(p):
    """A short cowl over the shoulders, wider than the cloak under it, dipping to a point at the front."""
    b = p["bob"]
    m = set()
    for y in range(21 + b, 36 + b):
        hw = min(13, 6.5 + (y - 21 - b) * 1.3)
        for x in range(round(CX - 0.5 - hw), round(CX - 0.5 + hw) + 1):
            if y <= b + 33.5 - 0.38 * abs(x + 0.5 - CX):
                m.add((x, y))
    return m


def drape(p):
    """The mantle's fold lines: from each shoulder down toward the front point."""
    b = p["bob"]
    out = set()
    for side in (-1, 1):
        out |= thick([(CX - 0.5 + side * 9, 25 + b), (CX - 0.5 + side * 4, 29 + b), (CX - 0.5 + side * 1.5, 32 + b)], 1)
    return out


def hood_shell(p, kind):
    fx, fy = FACE[0], FACE[1] + p["bob"]
    if kind == "hood":  # a round cowl
        return ell(fx - 0.5, fy - 0.5, 8.5, 8.5)
    shell = ell(fx - 0.5, fy + 0.5, 7, 7.5)
    if kind in ("pointed", "brim", "turban"):  # straight sides up to a point
        shell |= poly([(fx - 7.5, fy + 1), (fx - 2, fy - 13), (fx + 1, fy - 13), (fx + 6.5, fy + 1)])
    elif kind == "crooked":  # the point curls over to one side
        shell |= poly([(fx - 7.5, fy + 1), (fx - 3, fy - 9), (fx + 3, fy - 13), (fx + 8, fy - 12), (fx + 10, fy - 9),
                       (fx + 7, fy - 9), (fx + 4, fy - 8), (fx + 6.5, fy + 1)])
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
                return 4
            d = abs(x + 0.5 - CX)
            if y < 24 + p["bob"] or (x, y - 1) not in shell:
                return 1  # the shoulders face up
            return 2 if d < 9 else 3
        if (x, y - 1) not in shell and y < fy - 3:
            return 1  # the crown's top edge
        d = abs(x + 0.5 - fx)
        return 2 if d < 5 else 3
    c = band(shell, f)
    for x, y in shell:  # brass along the hood's rim and the mantle's lower edge
        if any(q in hole for q in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))):
            c[(x, y)] = TRIM[0] if y < fy + 2 else TRIM[1]
        elif (x, y) in mantle and (x, y + 1) not in shell:
            c[(x, y)] = TRIM[1]
            if (x, y - 1) in mantle and (x, y - 1) not in folds:
                c[(x, y - 1)] = TRIM[0]
    for x, y in hole:  # the inside of the hood, in deep shadow before the darkness
        if y < fy + 3 and any(q not in hole for q in ((x - 1, y), (x + 1, y), (x, y - 1))):
            c[(x, y)] = K[4]
    if kind == "brim":
        crown = poly([(fx - 5, fy - 6), (fx + 4, fy - 6), (fx + 2, fy - 14), (fx, fy - 17), (fx - 3, fy - 12)])
        brim = ell(fx - 0.5, fy - 5.5, 12, 2.2)
        c.update(band(crown, lambda x, y: 2 if x < fx else 3))
        c.update({q: K[2] if q[1] < fy - 5 else K[3] for q in brim})
        c.update({q: TRIM[0] for q in crown if fy - 8 <= q[1] <= fy - 7})
    elif kind == "turban":
        wrap = {(x, y) for x, y in hood_shell(p, kind) if fy - 7 <= y <= fy - 4}
        c.update({q: CLOTHC[2] if (q[0] - q[1]) % 4 else CLOTHC[3] for q in wrap})
        c.update({q: GOLDC[1] for q in ell(fx - 0.5, fy - 5.5, 1.4, 1.4)})
        c[(fx, fy - 6)] = GEMC[1]
    return outlined(c)


# ---------- the staff and the gloves ----------

def staff_tip(p):
    """The orb's centre, where a spell's glow sits."""
    (_, _), (x1, y1) = p["staff"]
    return x1 - 1, y1 - 5


def staff_layer(p):
    (x0, y0), (x1, y1) = p["staff"]
    c = {}
    for y in range(min(y0, y1), max(y0, y1) + 1):
        t = (y - y1) / max(1, y0 - y1)
        x = round(x1 + (x0 - x1) * t)
        c[(x, y)] = WOODC[1] if (y - y1) % 9 == 4 else WOODC[2]  # knots
        c[(x + 1, y)] = WOODC[3]
    gx, gy = staff_tip(p)
    hook = [(x1 + 1, y1), (x1 + 2, y1 - 1), (x1 + 2, y1 - 2), (x1 + 2, y1 - 3), (x1 + 2, y1 - 4), (x1 + 2, y1 - 5),
            (x1 + 2, y1 - 6), (x1 + 1, y1 - 7), (x1 + 1, y1 - 8), (x1, y1 - 9), (x1 - 1, y1 - 9), (x1 - 2, y1 - 9),
            (x1 - 3, y1 - 8), (x1 - 4, y1 - 7)]  # the top curls round over the orb
    c.update({q: WOODC[2] if q[1] < y1 - 6 else WOODC[3] for q in hook})
    orb = ell(gx + 0.5, gy + 0.5, 2.1, 2.1)
    c.update({q: GEMC[1] if q[0] <= gx and q[1] <= gy else (GEMC[2] if q[1] <= gy + 1 else GEMC[3]) for q in orb})
    c[(gx, gy)] = GEMC[0]
    out = outlined(c)
    for dx, dy in [(-4, -3), (3, -5), (-3, 2), (1, -7)][: p["glow"] * 2]:  # motes round the orb
        out.setdefault((gx + dx, gy + dy), GEMC[1])
    return out


def glove(x, y):
    """A gloved fist, three pixels across, its knuckles lit."""
    c = {(x + dx, y + dy): GLOVE for dx in range(-1, 2) for dy in range(-1, 2) if (dx, dy) != (1, 1)}
    c[(x - 1, y - 1)] = c[(x, y - 1)] = GLOVE_LIT
    return c


def glove_layer(p):
    hx, hy = p["hand"]
    fx, fy = p["free"]
    b = p["bob"]
    return outlined({**glove(hx, hy + b), **glove(fx + 1, fy + b)})


def frame(p, hood, cloak):
    """One finished frame: every layer stacked, back to front."""
    out = {}
    for layer in (body_layer(p), cloak_layer(p, cloak), hood_layer(p, hood), staff_layer(p), glove_layer(p)):
        out.update(layer)
    return out
