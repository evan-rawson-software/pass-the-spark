"""The wizards (#261): body, hands, staff, 5 robes and 5 hats, as layer sheets on one frame grid.

Every frame is a pose (below): how the body bobs and leans, where the front hand and the staff are,
how bright the gem glows. Every layer reads the same pose, so any hat sits on any robe on every
frame. Robes and hats are drawn in palette.KEY, which the game swaps for the seat colour.

STYLE holds the proportions (the designer picked style A, "tall", as a placeholder in #261): a
restyle is a change to these numbers and a re-run, not a redraw.
"""
import math

from palette import BEARD, BOOT, CLOTH, GEM, GOLD, KEY, SKIN, WOOD, ACCENTS
from pix import H, W, ell, hexrgb, over, paint, poly, recolour, rows, shade, spine, thick

R = lambda ramp: [hexrgb(c) for c in ramp]
KEYC, SKINC, BEARDC, WOODC, GOLDC, GEMC, BOOTC, CLOTHC = map(R, (KEY, SKIN, BEARD, WOOD, GOLD, GEM, BOOT, CLOTH))
EYE, CHEEK = hexrgb(ACCENTS["eye"]), hexrgb(ACCENTS["cheek"])

STYLE = dict(head=(25.4, 26.7), head_r=(7.7, 7.9), hair=(19.1, 27.7, 4.3, 7.0), robe_top=35.6, robe_top_w=6.6,
             hem_w=13.8, belly=(24, 52.6, 9.0, 7.9), beard_len=18.8, beard_w=1.05, belt_y=46,
             shoulder=(27, 38), hat_base=-7.2, brim_r=(14.4, 3.2), cone_r=8.2, cone_h=17.5)
CX = 24.5  # the body's centre line; the feet point is (24, 63)

HATS = [("pointed", "Pointed"), ("brim", "Wide brim"), ("hood", "Hood"), ("crooked", "Crooked"), ("turban", "Turban")]
ROBES = [("plain", "Plain"), ("starry", "Starry"), ("sash", "Sash"), ("mantle", "Mantle"), ("runic", "Runic")]


# ---------- poses ----------

def pose(hand, staff, bob=0, lean=0, glow=0, burst=0, burst_dir=-0.5, sway=0, eyes="open"):
    return dict(hand=hand, staff=staff, bob=bob, lean=lean, glow=glow, burst=burst, burst_dir=burst_dir, sway=sway, eyes=eyes)


RX, RY = 35, 45  # the front hand at rest
REST = ((RX + 1, 63), (RX + 1, RY - 26))
WIND = pose((RX - 2, RY + 1), ((RX + 3, 63), (RX - 4, RY - 25)), bob=1, glow=1)

ANIMATIONS = {
    "idle": dict(loop=True, ms=[240, 240, 240, 240], frames=[
        pose((RX, RY), REST), pose((RX, RY), REST, glow=1),
        pose((RX, RY + 1), REST, bob=1, glow=1, sway=1), pose((RX, RY + 1), REST, bob=1, sway=1)]),
    "hurt": dict(loop=False, ms=[90, 150, 220], frames=[
        pose((RX - 2, RY + 1), ((RX + 3, 63), (RX - 3, RY - 24)), bob=1, lean=-2, sway=-1, eyes="shut"),
        pose((RX - 1, RY + 1), ((RX + 2, 63), (RX - 2, RY - 25)), bob=1, lean=-1, eyes="shut"),
        pose((RX, RY), REST)]),
    "victory": dict(loop=True, ms=[170, 170, 170, 170], frames=[
        pose((37, 29), ((38, 47), (38, 12)), glow=2, eyes="happy"),
        pose((37, 27), ((38, 45), (38, 10)), glow=3, burst=1, burst_dir=-1.57, eyes="happy"),
        pose((37, 28), ((38, 46), (38, 11)), bob=1, glow=3, burst=2, burst_dir=-1.57, eyes="happy"),
        pose((37, 29), ((38, 47), (38, 12)), bob=1, glow=2, eyes="happy")]),
    "casts": [
        dict(id="thrust", loop=False, release=2, ms=[110, 110, 90, 150, 120, 120], frames=[
            WIND,
            pose((31, 26), ((32, 44), (32, 8)), glow=2, sway=1),
            pose((37, 35), ((30, 52), (42, 20)), glow=3, burst=2),
            pose((37, 35), ((30, 52), (42, 20)), glow=2, burst=1),
            pose((RX + 1, RY - 4), ((RX + 1, 62), (RX + 3, RY - 29)), bob=1, glow=1, sway=1),
            pose((RX, RY), REST)]),
        dict(id="overhead", loop=False, release=3, ms=[110, 120, 120, 90, 150, 120], frames=[
            pose((RX - 1, RY), ((RX + 2, 63), (RX - 2, RY - 26)), bob=1, glow=1),
            pose((30, 25), ((31, 43), (31, 7)), glow=2),
            pose((29, 24), ((30, 42), (30, 6)), lean=-1, glow=3),
            pose((37, 38), ((28, 49), (42, 27)), glow=3, burst=2, burst_dir=-0.2),
            pose((37, 38), ((28, 49), (42, 27)), bob=1, glow=2, burst=1, burst_dir=-0.2),
            pose((RX, RY), REST)]),
        dict(id="sweep", loop=False, release=2, ms=[120, 100, 90, 150, 120, 120], frames=[
            pose((RX - 3, RY + 3), ((RX + 6, 60), (RX - 8, RY - 20)), bob=1, lean=-1, glow=1),
            pose((RX, RY - 4), ((RX - 4, 60), (RX + 2, RY - 30)), glow=2, sway=1),
            pose((37, 32), ((31, 50), (42, 16)), glow=3, burst=2, burst_dir=-0.8),
            pose((37, 32), ((31, 50), (42, 16)), glow=2, burst=1, burst_dir=-0.8),
            pose((RX + 1, RY - 3), ((RX + 1, 62), (RX + 3, RY - 29)), glow=1),
            pose((RX, RY), REST)]),
        dict(id="plant", loop=False, release=2, ms=[120, 110, 90, 150, 120, 120], frames=[
            pose((RX, RY - 6), ((RX + 1, 57), (RX + 1, RY - 32)), glow=1),
            pose((RX, RY - 9), ((RX + 1, 54), (RX + 1, RY - 35)), lean=-1, glow=2),
            pose((RX, RY), REST, bob=1, glow=3, burst=2, burst_dir=-1.57),
            pose((RX, RY), REST, bob=1, glow=2, burst=1, burst_dir=-1.57),
            pose((RX, RY), REST, glow=1, sway=1),
            pose((RX, RY), REST)]),
    ],
}


def all_frames():
    """(row, animation, frames) for every row of the sheets, in order."""
    out = [("idle", ANIMATIONS["idle"]), ("hurt", ANIMATIONS["hurt"]), ("victory", ANIMATIONS["victory"])]
    out += [("cast_" + c["id"], c) for c in ANIMATIONS["casts"]]
    return out


# ---------- the head: where it is in a pose ----------

def head_at(p):
    hx, hy = STYLE["head"]
    return hx + p["lean"], hy + p["bob"]


# ---------- body ----------

def body_layer(p):
    hx, hy = head_at(p)
    rx, ry = STYLE["head_r"]
    ax, ay, arx, ary = STYLE["hair"]
    boots = shade(ell(18, 62, 4.5, 2.5) | ell(30, 62, 4.8, 2.5), BOOTC, roundness=2)
    hair = shade(ell(ax + p["lean"], ay + p["bob"], arx, ary), BEARDC, roundness=3)
    head = shade(ell(hx, hy, rx, ry), SKINC, roundness=4.6)
    nose = shade(ell(hx + rx - 0.5, hy + 2, 1.7, 1.5), SKINC, roundness=1.5)
    L, w = STYLE["beard_len"], STYLE["beard_w"]
    y0 = hy + ry * 0.35
    beard = poly([(hx - 4.5 * w, y0), (hx + 6.5 * w, y0), (hx + 7.5 * w, y0 + 5), (hx + 5 * w, y0 + L * 0.65),
                  (hx + 1, y0 + L), (hx - 1.5 * w, y0 + L * 0.6), (hx - 5 * w, y0 + 4)]) | ell(hx + 2, y0 + 3, 6.5 * w, 4)
    c = over(boots, hair, head, nose, shade(beard, BEARDC, roundness=3.7))
    ex, ey = int(round(hx + rx * 0.55)), int(round(hy - ry * 0.12))
    brow = [(ex - 2, ey - 2), (ex - 1, ey - 2), (ex, ey - 2), (ex + 1, ey - 2), (ex - 1, ey - 3)]
    if p["eyes"] == "shut":
        paint(c, [(ex - 1, ey + 1), (ex, ey + 1)], EYE)
        brow = [(ex - 2, ey - 1), (ex - 1, ey - 2), (ex, ey - 2), (ex + 1, ey - 1)]
    elif p["eyes"] == "happy":
        paint(c, [(ex - 1, ey + 1), (ex, ey), (ex + 1, ey + 1)], EYE)
    else:
        paint(c, [(ex, ey), (ex, ey + 1)], EYE)
    paint(c, brow, BEARDC[0])
    paint(c, [(ex + 1, ey + 3)], CHEEK)
    return c


def hands_layer(p):
    hx, hy = p["hand"]
    c = shade(ell(hx, hy, 2.6, 2.2), SKINC, roundness=1.6)
    paint(c, [(hx + 1, hy - 1)], SKINC[0])
    return c


# ---------- staff, with its tip point ----------

def staff_tip(p):
    (x0, y0), (x1, y1) = p["staff"]
    a = math.atan2(y1 - y0, x1 - x0)
    return x1 + math.cos(a) * 3, y1 + math.sin(a) * 3


def staff_layer(p):
    (x0, y0), (x1, y1) = p["staff"]
    gx, gy = staff_tip(p)
    c = shade(thick([(x0, y0), (x1, y1)], 3), WOODC, roundness=1.5)
    c = over(c, shade(ell(gx, gy, 4.2, 4.2) - ell(gx, gy, 2.2, 2.2), WOODC, roundness=1.5))  # the curled head
    c = over(c, shade(ell(gx, gy, 2.4, 2.4), GEMC, roundness=2))
    paint(c, [(gx + 0.6, gy - 1)], GEMC[0])
    rays = [(0, -6), (-5, -2), (5, -2), (0, 5), (-4, -5), (4, -5), (-4, 4), (4, 4), (-7, 0), (7, 0)]
    for i, (dx, dy) in enumerate(rays[: p["glow"] * 3]):
        paint(c, [(gx + dx, gy + dy)], GEMC[0] if i % 2 else GEMC[1])
        if p["glow"] >= 2:
            paint(c, [(gx + dx * 0.7, gy + dy * 0.7)], GEMC[2])
    for i in range(p["burst"] * 5):
        a = p["burst_dir"] - 0.7 + i * 0.3
        r = 6 + p["burst"] * 2.5 + (i % 3)
        paint(c, [(gx + math.cos(a) * r, gy + math.sin(a) * r)], [GEMC[0], GOLDC[0], GEMC[1]][i % 3])
    return c


# ---------- robes ----------

def robe_shape(p):
    s = STYLE
    top = s["robe_top"] + p["bob"]
    mid = (top + 63) / 2
    lean = p["lean"]
    sw = p["sway"]
    body = poly([(CX - s["robe_top_w"] + lean, top), (CX + s["robe_top_w"] + lean, top), (CX + s["hem_w"] * 0.75 + lean / 2, mid),
                 (CX + s["hem_w"] + sw, 63), (CX - s["hem_w"] - sw, 63), (CX - s["hem_w"] * 0.75 + lean / 2, mid)])
    bx, by, brx, bry = s["belly"]
    body |= ell(bx + lean / 2, by + p["bob"] * 0.5, brx, bry) | ell(CX + lean, top + 3, s["robe_top_w"] + 2, 4)
    return body, top, mid


def sleeve_shape(p):
    sx, sy = STYLE["shoulder"]
    sx, sy = sx + p["lean"], sy + p["bob"]
    hx, hy = p["hand"]
    a = math.atan2(hy - sy, hx - sx)
    wx, wy = hx - math.cos(a) * 2.5, hy - math.sin(a) * 2.5
    bell = ell(wx, wy + 1, 4, 3.4)
    cuff = bell - ell(wx - math.cos(a) * 2, wy + 1 - math.sin(a) * 2, 4, 3.4)
    return thick([(sx, sy), (wx, wy)], 6) | bell, cuff, (sx, sy)


def star(c, x, y):
    paint(c, [(x, y - 1), (x - 1, y), (x + 1, y), (x, y + 1)], GOLDC[1])
    paint(c, [(x, y)], GOLDC[0])


def robe_layer(p, kind):
    body, top, mid = robe_shape(p)
    c = shade(body, KEYC, roundness=6)
    for pts in [[(20, mid), (17, 58), (15, 62)], [(29, mid + 1), (32, 58), (33, 62)]]:  # folds
        recolour(c, thick(pts, 1), KEYC[3])
    hem = {(x, y) for x, y in body if (x, y + 3) not in body and y >= 56}
    belt = rows(thick([(8, STYLE["belt_y"] + p["bob"]), (41, STYLE["belt_y"] + p["bob"])], 2), 0, H) & body
    sleeve, cuff, (sx, sy) = sleeve_shape(p)
    sc = shade(sleeve, KEYC, roundness=3)
    if kind == "starry":  # gold hem, belt and stars
        c = over(c, shade(hem, GOLDC, roundness=1.2, flat=0.4), shade(belt, GOLDC, roundness=1, flat=0.4))
        for x, y in [(18, int(mid) + 6), (30, int(mid) + 8), (23, 60), (34, 59), (14, 58)]:
            star(c, x, y)
        sc = over(sc, shade(cuff, GOLDC, roundness=1, flat=0.4))
    elif kind == "sash":  # a cream sash from the shoulder to the hip, and a buckle
        sash = thick([(sx - 1, top + 1), (CX - 6, STYLE["belt_y"] + 6 + p["bob"])], 4) & body
        c = over(c, shade(sash, CLOTHC, roundness=1.5, flat=0.3), shade(belt, CLOTHC, roundness=1, flat=0.3))
        paint(c, [(28, STYLE["belt_y"] + p["bob"]), (29, STYLE["belt_y"] + p["bob"]), (28, STYLE["belt_y"] + 1 + p["bob"]),
                  (29, STYLE["belt_y"] + 1 + p["bob"])], GOLDC[1])
    elif kind == "mantle":  # a short cape over the shoulders with a gold clasp
        mantle = ell(CX + p["lean"], top + 4, STYLE["robe_top_w"] + 5, 7.5) & {(x, y) for x in range(W) for y in range(int(top) - 2, int(top) + 11)}
        c = over(c, shade(mantle, KEYC, roundness=3))
        c = over(c, shade(ell(CX + 4 + p["lean"], top + 2, 1.6, 1.6), GOLDC, roundness=1))
    elif kind == "runic":  # a dark hem band with gold runes, and dark cuffs
        band = {(x, y) for x, y in body if (x, y + 5) not in body and y >= 54}
        c = over(c, shade(band, [KEYC[3], KEYC[3], KEYC[4], KEYC[4], KEYC[4]], roundness=1, flat=0.5))
        for i, x in enumerate(range(12, 38, 4)):
            glyph = [[(0, 0), (1, 1), (0, 2)], [(0, 0), (0, 1), (0, 2), (1, 1)], [(1, 0), (0, 1), (1, 2)]][i % 3]
            paint(c, [(x + dx, 58 + dy) for dx, dy in glyph if (x + dx, 58 + dy) in band], GOLDC[1])
        sc = over(sc, shade(cuff, [KEYC[3], KEYC[3], KEYC[4], KEYC[4], KEYC[4]], roundness=1, flat=0.5))
    return over(c, sc)


# ---------- hats: all sit on the head, so they follow its bob and lean ----------

def hat_layer(p, kind):
    hx, hy = head_at(p)
    by = hy + STYLE["hat_base"]  # the brim line
    brx, bry = STYLE["brim_r"]
    above = lambda m, y: {(x, yy) for x, yy in m if yy <= y}
    if kind == "pointed":
        k = STYLE["cone_h"] / 16.5
        base = (hx - 0.9, by - 1.5)
        pts = [base] + [(base[0] + dx * k, base[1] + dy * k) for dx, dy in [(-1.5, -7), (-5.5, -13), (-11.5, -15.5), (-15.5, -12.5)]]
        cone = above(spine(pts, STYLE["cone_r"], 1.3), by)
        c = over(shade(cone, KEYC, roundness=4.3), shade(ell(hx - 0.9, by, brx, bry), KEYC, roundness=2.5))
        c = over(c, shade(rows(cone, by - 4, by - 2), GOLDC, roundness=1, flat=0.4))
        star(c, int(round(hx + 0.5)), int(round(by - 9 * k)))
        return c
    if kind == "brim":
        crown = above(ell(hx - 0.9, by - 5.5, 8.9, 7.3), by)
        feather = spine([(hx - 6, by - 4), (hx - 11, by - 9), (hx - 16, by - 11), (hx - 20, by - 10)], 2.4, 0.8)
        c = over(shade(feather, BEARDC, roundness=1.5), shade(ell(hx - 0.9, by, brx + 3, bry + 0.4), KEYC, roundness=2.5),
                 shade(crown, KEYC, roundness=4))
        return over(c, shade(rows(crown, by - 3, by - 1), GOLDC, roundness=1, flat=0.4))
    if kind == "hood":
        rx, ry = STYLE["head_r"]
        hood = ell(hx - 1.5, hy - 1.5, rx + 2.2, ry + 1.8) | poly([(hx - rx - 2, hy), (hx - 3, hy + 4), (hx - 6, hy + 12), (hx - rx - 4, hy + 12)])
        hood -= ell(hx + 3.2, hy + 1.2, rx - 1.2, ry - 1.4)  # the opening for the face
        hood -= {(x, y) for x, y in hood if x > hx + 1 and y > hy + 2}
        c = shade(hood, KEYC, roundness=3.5)
        return over(c, shade(ell(hx + 3, hy + 9.5, 1.5, 1.5) - ell(hx + 3, hy + 9.5, 0.6, 0.6), GOLDC, roundness=1))
    if kind == "crooked":
        base = (hx - 0.9, by - 1.5)
        pts = [base, (base[0] - 1, by - 9), (base[0] - 2, by - 15), (base[0] - 7, by - 18), (base[0] - 12, by - 15), (base[0] - 14, by - 10)]
        cone = above(spine(pts, STYLE["cone_r"] - 0.5, 1.5), by)
        c = over(shade(cone, KEYC, roundness=4), shade(ell(hx - 0.9, by, brx - 1.5, bry), KEYC, roundness=2.5))
        patch = {(x, y) for x in range(int(hx) - 5, int(hx)) for y in range(int(by) - 9, int(by) - 5)} & cone
        c = over(c, {p: CLOTHC[1] for p in patch})
        paint(c, [(int(hx) - 6, int(by) - 8), (int(hx) - 6, int(by) - 6), (int(hx), int(by) - 8), (int(hx), int(by) - 6)], CLOTHC[4])  # stitches
        return c
    # turban: a wrapped dome with a gem brooch at the front
    dome = ell(hx - 0.5, by - 1.5, 9.2, 6.6) & {(x, y) for x in range(W) for y in range(H) if y <= by + 2.5}
    c = shade(dome, KEYC, roundness=3.5)
    for i in range(-3, 4):  # the wraps
        recolour(c, thick([(hx - 7 + i * 3, by + 2), (hx - 3 + i * 3, by - 7)], 1), KEYC[3])
    c = over(c, shade(ell(hx + 6, by - 1.5, 2, 2.3), GOLDC, roundness=1), shade(ell(hx + 6, by - 1.5, 1.2, 1.4), GEMC, roundness=1))
    plume = spine([(hx + 4, by - 6), (hx + 2, by - 11), (hx - 1, by - 13)], 1.6, 0.7)
    return over(shade(plume, BEARDC, roundness=1.2), c)
