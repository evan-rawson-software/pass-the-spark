"""Art spike #259, wizard round 2: code-drawn wizards at 48x64 in two styles, storybook and chibi.

  python art-spike/code2/make.py

Round 1's wizards were turned down as too low in detail and clashing with the painted background
and the rounded vector UI. This round: a bigger frame (48x64), rounded volume shading worked out
from each part's shape (a distance field lit from the upper right), and coloured outlines (each part
outlined in its own darkest shade, lighter where the light hits) instead of one near-black line.

Writes code2/<style>/wizard_<anim>_<layer>.png and check.json. Layers, drawn in this order: robe_<kind>,
body, hat_<kind>, staff, hand. Robes and hats use the 5-colour ROBE5 key ramp that the picker swaps.
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "tools"))
from pix import H, save, sheet  # noqa: E402

W, HT = 48, 64
ROBE5 = [H("#d9c2ff"), H("#a983f7"), H("#7d58d6"), H("#563a9e"), H("#2f1f5c")]  # light..deepest, swapped per seat
SKIN = [H("#ffe0c2"), H("#f4b98f"), H("#d98a6a"), H("#a85a4a"), H("#5c2e2e")]
BEARD = [H("#ffffff"), H("#eceaf2"), H("#c9c3d6"), H("#9a90ae"), H("#4d4560")]
WOOD = [H("#e0a465"), H("#b87742"), H("#8a522c"), H("#5e3620"), H("#33201a")]
GOLD = [H("#fff6c4"), H("#ffd54a"), H("#f0a830"), H("#b86e1e"), H("#5e3510")]
GEM = [H("#ffffff"), H("#bff8ff"), H("#5fd8f0"), H("#2a8fc0"), H("#173f66")]
BOOT = [H("#8a6a5a"), H("#6a4a3e"), H("#4e3430"), H("#3a2426"), H("#22161c")]
EYE, CHEEK, MOUTH = H("#2a1b2e"), H("#ff9a9a"), H("#a8404a")
PALETTE = {c for r in (ROBE5, SKIN, BEARD, WOOD, GOLD, GEM, BOOT) for c in r} | {EYE, CHEEK, MOUTH}
LIGHT = np.array([0.62, -0.62, 0.48])  # from the upper right (x right, y down, z toward the viewer)


def mask_from(draw_fn):
    im = Image.new("L", (W, HT), 0)
    draw_fn(ImageDraw.Draw(im))
    return np.asarray(im) > 0


def ell(cx, cy, rx, ry):
    return mask_from(lambda d: d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=1))


def poly(pts):
    return mask_from(lambda d: d.polygon([tuple(map(float, p)) for p in pts], fill=1))


def thick(pts, width):
    return mask_from(lambda d: d.line([tuple(map(float, p)) for p in pts], fill=1, width=int(width), joint="curve"))


def spine(pts, w0, w1):
    """A tapering tube along a polyline: circles from radius w0 down to w1."""
    m = np.zeros((HT, W), bool)
    n = len(pts) - 1
    for i in range(n):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        steps = max(2, int(math.hypot(x1 - x0, y1 - y0) * 2))
        for s in range(steps + 1):
            t = (i + s / steps) / n
            r = w0 + (w1 - w0) * t
            m |= ell(x0 + (x1 - x0) * s / steps, y0 + (y1 - y0) * s / steps, r, r)
    return m


def shade(mask, ramp, roundness=4.0, flat=0.0):
    """Rounded shading for one part: a height field from the distance to the part's edge, lit from
    LIGHT, cut into the ramp's first four shades; the edge is the outline (ramp[4]), drawn one shade
    lighter where it faces the light."""
    out = np.zeros((HT, W, 4), np.uint8)
    if not mask.any():
        return out
    dt = ndimage.distance_transform_edt(mask)
    h = 1 - (1 - np.clip(dt / roundness, 0, 1)) ** 2
    gy, gx = np.gradient(ndimage.gaussian_filter(h, 0.8))
    n = np.dstack([-gx * 3, -gy * 3, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    v = (n @ (LIGHT / np.linalg.norm(LIGHT))) * (1 - flat) + flat * 0.6
    k = np.select([v > 0.8, v > 0.6, v > 0.33], [0, 1, 2], 3)
    edge = mask & (dt <= 1)
    k = np.where(edge, np.where(v > 0.66, 2, 4), k)
    for i in range(5):
        out[mask & (k == i)] = (*ramp[i], 255)
    return out


def over(*layers):
    out = np.zeros((HT, W, 4), np.uint8)
    for l in layers:
        a = l[..., 3] > 0
        out[a] = l[a]
    return out


def paint(c, pts, col):
    for x, y in pts:
        x, y = int(round(x)), int(round(y))
        if 0 <= x < W and 0 <= y < HT:
            c[y, x] = (*col, 255)


def on(c, m, col):
    c[m & (c[..., 3] > 0)] = (*col, 255)


# ---------- poses: shared by both styles (shoulder, hand and staff ends are style-relative) ----------

def poses(sh, rest, up, fwd):
    """Idle (4) and cast (6) frames for a style whose front shoulder is sh, hand at rest, raised
    and thrust forward. Staff ends are (bottom, top)."""
    rx, ry = rest
    idle = [dict(bob=b, hand=(rx, ry + b), staff=((rx + 1, 63), (rx + 1, ry - 26 + b)), glow=g, sway=s)
            for b, g, s in [(0, 0, 0), (0, 1, 0), (1, 1, 1), (1, 0, 1)]]
    ux, uy = up
    fx, fy = fwd
    cast = [dict(bob=1, hand=(rx - 2, ry + 1), staff=((rx + 3, 63), (rx - 4, ry - 25)), glow=1, sway=0),
            dict(bob=0, hand=(ux, uy), staff=((ux + 1, uy + 18), (ux + 1, max(2, uy - 18))), glow=2, sway=1),
            dict(bob=0, hand=(fx, fy), staff=((fx - 7, fy + 17), (fx + 6, fy - 16)), glow=3, sway=0, burst=2),
            dict(bob=0, hand=(fx, fy), staff=((fx - 7, fy + 17), (fx + 6, fy - 16)), glow=2, sway=0, burst=1),
            dict(bob=1, hand=(rx + 1, ry - 4), staff=((rx + 1, 62), (rx + 3, ry - 29)), glow=1, sway=1),
            dict(bob=0, hand=(rx, ry), staff=((rx + 1, 63), (rx + 1, ry - 26)), glow=0, sway=0)]
    return idle, cast


def staff_layer(p, crook=True):
    (x0, y0), (x1, y1) = p["staff"]
    c = shade(thick([(x0, y0), (x1, y1)], 3), WOOD, roundness=1.5)
    ang = math.atan2(y1 - y0, x1 - x0)
    ux, uy = math.cos(ang), math.sin(ang)
    gx, gy = x1 + ux * 3, y1 + uy * 3
    if crook:  # a curled head holding the gem
        ring = ell(gx, gy, 4.2, 4.2) & ~ell(gx, gy, 2.2, 2.2)
        c = over(c, shade(ring, WOOD, roundness=1.5))
    c = over(c, shade(ell(gx, gy, 2.4, 2.4), GEM, roundness=2))
    paint(c, [(gx + 0.6, gy - 1)], GEM[0])
    g = p["glow"]
    rays = [(0, -6), (-5, -2), (5, -2), (0, 5), (-4, -5), (4, -5), (-4, 4), (4, 4), (-7, 0), (7, 0)]
    for i, (dx, dy) in enumerate(rays[: g * 3]):
        paint(c, [(gx + dx, gy + dy)], GEM[0] if i % 2 else GEM[1])
        if g >= 2:
            paint(c, [(gx + dx * 0.7, gy + dy * 0.7)], GEM[2])
    for i in range(p.get("burst", 0) * 5):
        a = -1.2 + i * 0.3
        r = 6 + p["burst"] * 2.5 + (i % 3)
        paint(c, [(gx + math.cos(a) * r, gy + math.sin(a) * r)], [GEM[0], GOLD[0], GEM[1]][i % 3])
    return c


def hand_layer(p, size=2.6):
    hx, hy = p["hand"]
    c = shade(ell(hx, hy, size, size * 0.85), SKIN, roundness=1.6)
    paint(c, [(hx + 1, hy - 1)], SKIN[0])
    return c


# ---------- storybook: tall, flowing, a long beard ----------

STORY = dict(sh=(27, 35), rest=(33, 43), up=(31, 24), fwd=(37, 33))


def story_robe(p, kind):
    b, s = p["bob"], p["sway"]
    body = poly([(19, 32 + b), (30, 32 + b), (33, 44), (37, 56), (38 + s, 63), (9 - s, 63), (11, 56), (15, 44)])
    body |= ell(24.5, 35 + b, 7.5, 4.5)
    c = shade(body, ROBE5, roundness=6)
    for pts in [[(20, 46), (17, 55), (15, 62)], [(29, 47), (32, 56), (33, 62)]]:  # folds
        on(c, thick(pts, 1), ROBE5[3])
    on(c, thick([(24, 44), (25, 62)], 1), ROBE5[3])
    hem = body & ~np.roll(body, -2, axis=0)
    hem[:58] = False
    if kind == "trim":
        trim = body & ~np.roll(body, -3, axis=0); trim[:56] = False
        c = over(c, shade(trim, GOLD, roundness=1.2, flat=0.4))
        c = over(c, shade(thick([(15, 44 + b), (33, 44 + b)], 2) & body, GOLD, roundness=1, flat=0.4))
        paint(c, [(28, 44 + b), (28, 45 + b)], GOLD[0])
        for x, y in [(18, 52), (30, 54), (23, 58), (34, 60), (14, 59)]:
            paint(c, [(x, y), (x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)], GOLD[1])
            paint(c, [(x, y)], GOLD[0])
    # bell sleeve from the shoulder to the wrist
    sx, sy = STORY["sh"][0], STORY["sh"][1] + b
    hx, hy = p["hand"]
    ang = math.atan2(hy - sy, hx - sx)
    wx, wy = hx - math.cos(ang) * 2.5, hy - math.sin(ang) * 2.5
    sleeve = thick([(sx, sy), (wx, wy)], 6) | ell(wx, wy + 1, 4.2, 3.6)
    sc = shade(sleeve, ROBE5, roundness=3)
    if kind == "trim":
        cuff = ell(wx, wy + 1, 4.2, 3.6) & ~ell(wx - math.cos(ang) * 2, wy + 1 - math.sin(ang) * 2, 4.2, 3.6)
        sc = over(sc, shade(cuff, GOLD, roundness=1, flat=0.4))
    return over(c, sc)


def story_body(p):
    b = p["bob"]
    boots = shade(ell(18, 62, 4.5, 2.5) | ell(30, 62, 5, 2.5), BOOT, roundness=2)
    hair = shade(ell(20, 25 + b, 4, 6.5), BEARD, roundness=3)
    head = shade(ell(25.5, 24 + b, 6.5, 7), SKIN, roundness=4)
    nose = shade(ell(31.5, 26 + b, 2, 1.8), SKIN, roundness=1.5)
    beard = shade(poly([(21, 27 + b), (32, 27 + b), (33, 33 + b), (30, 42 + b), (26, 50 + b), (24, 42 + b), (20, 33 + b)]), BEARD, roundness=4)
    c = over(boots, hair, head, beard, nose)
    paint(c, [(29, 23 + b), (29, 24 + b)], EYE)  # eye
    paint(c, [(27, 21 + b), (28, 21 + b), (29, 21 + b), (30, 21 + b), (28, 20 + b)], BEARD[0])  # brow
    paint(c, [(26, 27 + b), (27, 27 + b), (28, 28 + b), (29, 28 + b), (30, 28 + b), (31, 28 + b), (32, 29 + b)], BEARD[1])  # moustache
    paint(c, [(30, 26 + b)], CHEEK)
    return c


def story_hat(p, kind):
    b = p["bob"]
    if kind == "pointed":
        cone = spine([(24.5, 17 + b), (23, 10 + b), (19, 4 + b), (13, 2 + b), (9, 5 + b)], 7.5, 1.2)
        cone &= ~ell(24.5, 21 + b, 14, 3)
        brim = ell(24.5, 18.5 + b, 14, 3)
        c = over(shade(cone, ROBE5, roundness=4), shade(brim, ROBE5, roundness=2))
        band = cone & (np.arange(HT)[:, None] >= 14 + b) & (np.arange(HT)[:, None] <= 16 + b)
        c = over(c, shade(band, GOLD, roundness=1, flat=0.4))
        paint(c, [(26, 9 + b), (25, 10 + b), (27, 10 + b), (26, 11 + b), (26, 10 + b)], GOLD[1])  # star
        paint(c, [(26, 10 + b)], GOLD[0])
        return c
    crown = ell(24.5, 13 + b, 8.5, 7) & (np.arange(HT)[:, None] <= 18 + b)
    brim = ell(24.5, 18.5 + b, 17, 3.4)
    feather = spine([(19, 14 + b), (14, 9 + b), (9, 7 + b), (5, 8 + b)], 2.4, 0.8)
    c = over(shade(feather, BEARD, roundness=1.5), shade(brim, ROBE5, roundness=2.5), shade(crown, ROBE5, roundness=4))
    band = crown & (np.arange(HT)[:, None] >= 15 + b) & (np.arange(HT)[:, None] <= 17 + b)
    c = over(c, shade(band, GOLD, roundness=1, flat=0.4))
    return c


# ---------- chibi: a big round head, a small round body ----------

CHIBI = dict(sh=(28, 45), rest=(34, 50), up=(31, 32), fwd=(37, 41))


def chibi_robe(p, kind):
    b, s = p["bob"], p["sway"]
    body = ell(24, 54 + b * 0.5, 11.5, 10) | poly([(14, 52), (34, 52), (36 + s, 63), (12 - s, 63)])
    c = shade(body, ROBE5, roundness=6)
    on(c, thick([(19, 55), (17, 62)], 1), ROBE5[3])
    on(c, thick([(29, 56), (31, 62)], 1), ROBE5[3])
    if kind == "trim":
        trim = body & ~np.roll(body, -3, axis=0); trim[:58] = False
        c = over(c, shade(trim, GOLD, roundness=1.2, flat=0.4))
        for x, y in [(20, 53), (28, 58), (17, 59)]:
            paint(c, [(x, y), (x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)], GOLD[1])
            paint(c, [(x, y)], GOLD[0])
        c = over(c, shade(ell(24, 46 + b, 4, 2.2), GOLD, roundness=1, flat=0.4))  # collar clasp
    sx, sy = CHIBI["sh"][0], CHIBI["sh"][1] + b
    hx, hy = p["hand"]
    sleeve = thick([(sx, sy), (hx - 1, hy)], 6) | ell(sx, sy + 1, 4, 4)
    sc = shade(sleeve, ROBE5, roundness=3)
    if kind == "trim":
        sc = over(sc, shade(ell(hx - 2, hy, 2.4, 3) & sleeve, GOLD, roundness=1, flat=0.4))
    return over(c, sc)


def chibi_body(p):
    b = p["bob"]
    boots = shade(ell(18, 62, 4.5, 2.5) | ell(30, 62, 4.5, 2.5), BOOT, roundness=2)
    hair = shade(ell(17, 34 + b, 5, 8), BEARD, roundness=3)
    head = shade(ell(25, 33 + b, 10.5, 10), SKIN, roundness=6)
    beard = shade(ell(29, 42 + b, 7, 4.5) | ell(27, 45 + b, 4.5, 3.5), BEARD, roundness=3)
    c = over(boots, hair, head, beard)
    for ex in (27, 33):  # big eyes with a glint
        paint(c, [(ex, 31 + b), (ex + 1, 31 + b), (ex, 32 + b), (ex + 1, 32 + b), (ex, 33 + b), (ex + 1, 33 + b)], EYE)
        paint(c, [(ex + 1, 31 + b)], BEARD[0])
    paint(c, [(25, 36 + b), (26, 36 + b), (34, 36 + b), (35, 36 + b)], CHEEK)
    paint(c, [(30, 37 + b), (31, 37 + b)], MOUTH)
    paint(c, [(26, 28 + b), (27, 28 + b), (28, 28 + b), (32, 28 + b), (33, 28 + b), (34, 28 + b)], BEARD[1])  # brows
    return c


def chibi_hat(p, kind):
    b = p["bob"]
    if kind == "pointed":
        cone = spine([(24, 21 + b), (22, 12 + b), (18, 5 + b), (12, 2 + b), (8, 5 + b)], 10, 1.6)
        brim = ell(24, 22 + b, 15.5, 3.6)
        cone &= ~ell(24, 25 + b, 15.5, 3.6)
        c = over(shade(cone, ROBE5, roundness=5), shade(brim, ROBE5, roundness=2.5))
        band = cone & (np.arange(HT)[:, None] >= 17 + b) & (np.arange(HT)[:, None] <= 19 + b)
        c = over(c, shade(band, GOLD, roundness=1, flat=0.4))
        c = over(c, shade(ell(8, 6 + b, 2.2, 2.2), GOLD, roundness=1.5))  # a bobble on the tip
        return c
    crown = ell(24, 16 + b, 10, 8) & (np.arange(HT)[:, None] <= 21 + b)
    brim = ell(24, 22 + b, 18, 4)
    feather = spine([(17, 16 + b), (12, 10 + b), (7, 8 + b), (3, 9 + b)], 2.6, 0.9)
    c = over(shade(feather, BEARD, roundness=1.5), shade(brim, ROBE5, roundness=2.5), shade(crown, ROBE5, roundness=5))
    band = crown & (np.arange(HT)[:, None] >= 18 + b) & (np.arange(HT)[:, None] <= 20 + b)
    return over(c, shade(band, GOLD, roundness=1, flat=0.4))


STYLES = {"storybook": (STORY, story_robe, story_body, story_hat, True), "chibi": (CHIBI, chibi_robe, chibi_body, chibi_hat, False)}


def check(arr):
    a = arr[..., 3]
    cols = {tuple(px) for px in arr[a == 255][:, :3]}
    return {"half_alpha_px": int(((a > 0) & (a < 255)).sum()), "colours": len(cols), "off_palette": len(cols - PALETTE)}


if __name__ == "__main__":
    import json
    res = {}
    for style, (geo, robe, body, hat, crook) in STYLES.items():
        idle, cast = poses(geo["sh"], geo["rest"], geo["up"], geo["fwd"])
        for anim, frames in (("idle", idle), ("cast", cast)):
            parts = {"robe_plain": lambda p: robe(p, "plain"), "robe_trim": lambda p: robe(p, "trim"), "body": body,
                     "hat_pointed": lambda p: hat(p, "pointed"), "hat_brim": lambda p: hat(p, "brim"),
                     "staff": lambda p: staff_layer(p, crook), "hand": hand_layer}
            for layer, fn in parts.items():
                s = sheet([fn(p) for p in frames])
                save(s, HERE / style / f"wizard_{anim}_{layer}.png")
                res[f"{style}/{anim}_{layer}"] = check(s)
    (HERE / "check.json").write_text(json.dumps(res, indent=1))
    bad = {k: v for k, v in res.items() if v["half_alpha_px"] or v["off_palette"]}
    print(len(res), "sheets;", "problems:", bad or "none", "; palette", len(PALETTE))
