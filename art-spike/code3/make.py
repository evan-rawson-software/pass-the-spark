"""Wizard art (#261) step 1: three styles between the spike's storybook (t=0) and chibi (t=1).

  python art-spike/code3/make.py

One parametric wizard: t blends storybook's proportions into chibi's (head size, body height, beard
length, hat size, eyes). Shading, coloured outlines and layers come from code2. The light is mostly
from above, so a mirrored wizard on the other side of the circle doesn't look lit from the wrong side.
Writes code3/<style>/wizard_<anim>_<layer>.png.
"""
import importlib.util
import json
import math
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
_spec = importlib.util.spec_from_file_location("code2", HERE.parent / "code2" / "make.py")
c2 = importlib.util.module_from_spec(_spec)
sys.modules["code2"] = c2
_spec.loader.exec_module(c2)
c2.LIGHT = np.array([0.3, -0.85, 0.55])  # mostly from above, a little from the front: fine when mirrored
from code2 import (BEARD, BOOT, CHEEK, EYE, GOLD, HT, PALETTE, ROBE5, SKIN, ell, hand_layer, on, over, paint,  # noqa: E402
                   poly, poses, save, shade, sheet, spine, staff_layer, thick)


def lerp(a, b, t):
    if isinstance(a, tuple):
        return tuple(lerp(x, y, t) for x, y in zip(a, b))
    return a + (b - a) * t


def geometry(t):
    return dict(head=lerp((25.5, 24), (25, 33), t), head_r=lerp((6.5, 7), (10.5, 10), t),
                hair=lerp((20, 25, 4, 6.5), (17, 34, 5, 8), t),
                top=lerp(32, 44, t), top_w=lerp(5.5, 9, t), hem_w=lerp(14.5, 12, t),
                belly=lerp((24, 52, 8, 7), (24, 54, 11.5, 10), t),
                beard_len=lerp(23, 9, t), beard_w=lerp(1.0, 1.15, t),
                brim_y=lerp(18.5, 22, t), brim_r=lerp((14, 3), (15.5, 3.6), t), cone_r=lerp(7.5, 10, t), cone_h=lerp(16.5, 20, t),
                sh=lerp((27, 35), (28, 45), t), rest=lerp((35, 43), (36, 50), t), up=lerp((31, 24), (31, 32), t),
                fwd=lerp((37, 33), (37, 41), t), t=t)


def robe_layer(g, p, kind):
    b, s = p["bob"], p["sway"]
    top = g["top"] + b
    mid = (top + 63) / 2
    body = poly([(24.5 - g["top_w"], top), (24.5 + g["top_w"], top), (24.5 + g["hem_w"] * 0.75, mid),
                 (24.5 + g["hem_w"] + s, 63), (24.5 - g["hem_w"] - s, 63), (24.5 - g["hem_w"] * 0.75, mid)])
    bx, by, brx, bry = g["belly"]
    body |= ell(bx, by + b * 0.5, brx, bry) | ell(24.5, top + 3, g["top_w"] + 2, 4)
    c = shade(body, ROBE5, roundness=6)
    for pts in [[(20, mid), (17, 58), (15, 62)], [(29, mid + 1), (32, 58), (33, 62)]]:
        on(c, thick(pts, 1), ROBE5[3])
    if kind == "trim":
        trim = body & ~np.roll(body, -3, axis=0)
        trim[:56] = False
        c = over(c, shade(trim, GOLD, roundness=1.2, flat=0.4))
        belt = int(round(lerp(44, 52, g["t"]))) + b
        c = over(c, shade(thick([(10, belt), (39, belt)], 2) & body, GOLD, roundness=1, flat=0.4))
        for x, y in [(18, mid + 6), (30, mid + 8), (23, 60), (34, 60), (14, 59)]:
            paint(c, [(x, y), (x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)], GOLD[1])
            paint(c, [(x, y)], GOLD[0])
    sx, sy = g["sh"][0], g["sh"][1] + b
    hx, hy = p["hand"]
    ang = math.atan2(hy - sy, hx - sx)
    wx, wy = hx - math.cos(ang) * 2.5, hy - math.sin(ang) * 2.5
    bell = ell(wx, wy + 1, 4, 3.4)
    sc = shade(thick([(sx, sy), (wx, wy)], 6) | bell, ROBE5, roundness=3)
    if kind == "trim":
        cuff = bell & ~ell(wx - math.cos(ang) * 2, wy + 1 - math.sin(ang) * 2, 4, 3.4)
        sc = over(sc, shade(cuff, GOLD, roundness=1, flat=0.4))
    return over(c, sc)


def body_layer(g, p):
    b, t = p["bob"], g["t"]
    hx, hy = g["head"]
    hy += b
    rx, ry = g["head_r"]
    ax, ay, arx, ary = g["hair"]
    parts = [shade(ell(18, 62, 4.5, 2.5) | ell(30, 62, 4.8, 2.5), BOOT, roundness=2),
             shade(ell(ax, ay + b, arx, ary), BEARD, roundness=3),
             shade(ell(hx, hy, rx, ry), SKIN, roundness=lerp(4, 6, t))]
    if t < 0.6:  # a nose that shrinks away toward chibi
        parts.append(shade(ell(hx + rx - 0.5, hy + 2, 2 - t, 1.8 - t), SKIN, roundness=1.5))
    L, w = g["beard_len"], g["beard_w"]  # long and pointed at t=0, a short puff at t=1
    y0 = hy + ry * 0.35
    beard = poly([(hx - 4.5 * w, y0), (hx + 6.5 * w, y0), (hx + 7.5 * w, y0 + 5), (hx + 5 * w, y0 + L * 0.65),
                  (hx + 1, y0 + L), (hx - 1.5 * w, y0 + L * 0.6), (hx - 5 * w, y0 + 4)])
    beard |= ell(hx + 2, y0 + 3, 6.5 * w, 4)
    parts.append(shade(beard, BEARD, roundness=lerp(4, 3, t)))
    c = over(*parts)
    ey = int(round(hy - ry * 0.12))
    if t < 0.4:  # one small eye in profile
        ex = int(round(hx + rx * 0.55))
        paint(c, [(ex, ey), (ex, ey + 1)], EYE)
        paint(c, [(ex - 2, ey - 2), (ex - 1, ey - 2), (ex, ey - 2), (ex + 1, ey - 2), (ex - 1, ey - 3)], BEARD[0])
    else:  # two eyes in three-quarter view, bigger toward chibi
        big = t >= 0.6
        for ex in (int(round(hx + rx * 0.2)), int(round(hx + rx * 0.72))):
            pts = [(ex, ey), (ex, ey + 1)] + ([(ex + 1, ey), (ex + 1, ey + 1), (ex, ey + 2), (ex + 1, ey + 2)] if big else [])
            paint(c, pts, EYE)
            if big:
                paint(c, [(ex + 1, ey)], BEARD[0])
            paint(c, [(ex - 1, ey - 2), (ex, ey - 2), (ex + 1, ey - 2)], BEARD[1])
        paint(c, [(int(hx - rx * 0.05), ey + 3), (int(hx + rx * 0.95), ey + 3)], CHEEK)
    return c


def hat_layer(g, p, kind):
    b = p["bob"]
    by = g["brim_y"] + b
    brx, bry = g["brim_r"]
    rows = np.arange(HT)[:, None]
    if kind == "pointed":
        k = g["cone_h"] / 16.5
        base = (24.5, by - 1.5)
        pts = [base] + [(base[0] + dx * k, base[1] + dy * k) for dx, dy in [(-1.5, -7), (-5.5, -13), (-11.5, -15.5), (-15.5, -12.5)]]
        cone = spine(pts, g["cone_r"], 1.3) & (rows <= by)
        c = over(shade(cone, ROBE5, roundness=4 + g["t"]), shade(ell(24.5, by, brx, bry), ROBE5, roundness=2.5))
        c = over(c, shade(cone & (rows >= by - 4) & (rows <= by - 2), GOLD, roundness=1, flat=0.4))
        sx, sy = int(round(26 - 2 * g["t"])), int(round(by - 9 * k))
        paint(c, [(sx, sy - 1), (sx - 1, sy), (sx + 1, sy), (sx, sy + 1), (sx, sy)], GOLD[1])
        paint(c, [(sx, sy)], GOLD[0])
        return c
    crown = ell(24.5, by - 5.5, lerp(8.5, 10, g["t"]), lerp(7, 8, g["t"])) & (rows <= by)
    brim = ell(24.5, by, brx + 3, bry + 0.4)
    feather = spine([(19, by - 4), (14, by - 9), (9, by - 11), (5, by - 10)], 2.4, 0.8)
    c = over(shade(feather, BEARD, roundness=1.5), shade(brim, ROBE5, roundness=2.5), shade(crown, ROBE5, roundness=4))
    return over(c, shade(crown & (rows >= by - 3) & (rows <= by - 1), GOLD, roundness=1, flat=0.4))


STYLES = {"tall": 0.3, "balanced": 0.5, "cosy": 0.72}


def check(arr):
    a = arr[..., 3]
    cols = {tuple(px) for px in arr[a == 255][:, :3]}
    return {"half_alpha_px": int(((a > 0) & (a < 255)).sum()), "colours": len(cols), "off_palette": len(cols - PALETTE)}


if __name__ == "__main__":
    res = {}
    for style, t in STYLES.items():
        g = geometry(t)
        rnd = lambda v: tuple(int(round(x)) for x in v)
        idle, cast = poses(rnd(g["sh"]), rnd(g["rest"]), rnd(g["up"]), rnd(g["fwd"]))
        for anim, frames in (("idle", idle), ("cast", cast)):
            parts = {"robe_plain": lambda p: robe_layer(g, p, "plain"), "robe_trim": lambda p: robe_layer(g, p, "trim"),
                     "body": lambda p: body_layer(g, p), "hat_pointed": lambda p: hat_layer(g, p, "pointed"),
                     "hat_brim": lambda p: hat_layer(g, p, "brim"), "staff": lambda p: staff_layer(p, True), "hand": hand_layer}
            for layer, fn in parts.items():
                s = sheet([fn(p) for p in frames])
                save(s, HERE / style / f"wizard_{anim}_{layer}.png")
                res[f"{style}/{anim}_{layer}"] = check(s)
    (HERE / "check.json").write_text(json.dumps(res, indent=1))
    bad = {k: v for k, v in res.items() if v["half_alpha_px"] or v["off_palette"]}
    print(len(res), "sheets; problems:", bad or "none")
