"""Art spike #259, method 1: clean SDXL + pixel-art-xl drafts onto the true pixel grid and palette.

  python art-spike/ai/cleanup.py RAW_DIR

RAW_DIR holds the drafts (raw/spike in the local artwork folder; prompts and seeds are in
prompts.jsonl next to this file). Each draft: remove the flat background (flood fill from the
border), crop, shrink to the target size with box averaging, reduce every pixel to pix.PALETTE,
and add the outline. The picker's seat swap works because the robe purples land on pix.ROBE.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "tools"))
from pix import GOLD, OUTLINE, ROBE, VIOLET, WHITE, check, meta, outline, quantize, save, sheet  # noqa: E402


def cutout(path, tol=28, drop_grey=True, everywhere=False):
    """RGB + foreground mask: the background is whatever flood-fills from the border within tol of
    the border colour; flat low-saturation greys touching it (ground shadows) go too."""
    a = np.asarray(Image.open(path).convert("RGB")).astype(int)
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, 0)
    near = np.abs(a - bg).max(-1) < tol
    if drop_grey:
        sat = a.max(-1) - a.min(-1)
        near |= (sat < 14) & (a.mean(-1) > 120)
    lab, _ = ndimage.label(near)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgmask = near if everywhere else np.isin(lab, list(edge))  # everywhere: also the background seen through rings
    fg = ~bgmask
    fg = ndimage.binary_opening(fg, iterations=2)
    return a.astype(np.uint8), fg


def bbox(mask):
    ys, xs = np.nonzero(mask)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def shrink(rgb, fg, box, size, keep_aspect=True):
    """Crop to box and shrink so it fits size (w, h), bottom-centred; returns a palette RGBA image."""
    x0, y0, x1, y1 = box
    w, h = size
    s = min(w / (x1 - x0), h / (y1 - y0)) if keep_aspect else None
    tw, th = (round((x1 - x0) * s), round((y1 - y0) * s)) if keep_aspect else (w, h)
    rgba = np.dstack([rgb, (fg * 255).astype(np.uint8)])[y0:y1, x0:x1]
    im = Image.fromarray(rgba, "RGBA")
    # premultiplied box average, so the cut-out edge doesn't bleed the background colour in
    pre = im.convert("RGBa").resize((tw, th), Image.BOX).convert("RGBA")
    arr = np.asarray(pre)
    q = quantize(arr[..., :3], arr[..., 3] >= 128)
    out = np.zeros((h, w, 4), np.uint8)
    ox, oy = (w - tw) // 2, h - th
    out[oy:oy + th, ox:ox + tw] = q
    return out


def fit_wizard(path, box=None):
    rgb, fg = cutout(path)
    box = box or bbox(fg)
    q = shrink(rgb, fg, box, (30, 46))
    full = np.zeros((48, 32, 4), np.uint8)
    full[1:47, 1:31] = q
    return outline(full), box


def tier_down(c):
    """The quiet circle from the blazing one by a palette swap: golds and whites go dim violet,
    violets go to the darkest violet, and anything else is dropped."""
    out = np.zeros_like(c)
    rgb = c[..., :3]
    for src, dst in [(GOLD[0], VIOLET[0]), (GOLD[1], VIOLET[1]), (GOLD[2], VIOLET[1]), (WHITE, VIOLET[0]),
                     (VIOLET[0], VIOLET[1]), (ROBE[0], VIOLET[1]), (ROBE[1], VIOLET[1])]:
        m = (rgb == src).all(-1) & (c[..., 3] > 0)
        out[m] = (*dst, 255)
    return out


if __name__ == "__main__":
    raw = Path(sys.argv[1])
    res = {}
    # Wizard: the base draft and a same-seed draft with a trimmed robe; same pose, so one crop box.
    base, box = fit_wizard(raw / "wiztiny_21.png")
    trim, _ = fit_wizard(raw / "wiz_trim_21.png", box)
    neck = 20  # rows above this are hat, head and beard top (from the base); below is the robe
    top = base.copy(); top[neck:] = 0
    robe_plain = base.copy(); robe_plain[:neck] = 0
    robe_trim = trim.copy(); robe_trim[:neck] = 0
    waist = 30
    idle = {"top": [], "robe_plain": [], "robe_trim": []}
    for f, bob in enumerate([0, 0, 1, 1]):  # idle made by moving parts: everything above the waist bobs 1 px
        for k, img in [("top", top), ("robe_plain", robe_plain), ("robe_trim", robe_trim)]:
            fr = img.copy()
            if bob:
                fr[1:waist + 1] = img[0:waist]
                fr[0] = 0
            idle[k].append(fr)
    for k, frames in idle.items():
        s = sheet(frames)
        save(s, HERE / f"wizard_idle_{k}.png")
        res[f"wizard_idle_{k}"] = check(s)
    # Cast: the best img2img and txt2img attempts. Not a usable animation: each is a different wizard.
    tries = [fit_wizard(raw / f)[0] for f in ("wiz_cast_21.png", "wiz_cast_22.png", "i2i_raise65_7.png", "i2i_point65_7.png")]
    save(sheet(tries), HERE / "wizard_cast_attempts.png")
    res["wizard_cast_attempts"] = check(sheet(tries))
    # Fireball and impact: one frame each (the model gives no consistent loop).
    rgb, fg = cutout(raw / "fireball2_81.png", tol=40)
    fb = outline(shrink(rgb, fg, bbox(fg), (22, 14)), (138, 31, 42))
    fbc = np.zeros((16, 24, 4), np.uint8); fbc[1:15, 1:23] = fb[:, :] if fb.shape == (14, 22, 4) else fb[:14, :22]
    save(fbc, HERE / "fireball_fly.png"); res["fireball_fly"] = check(fbc)
    rgb, fg = cutout(raw / "impact_41.png", tol=40)
    im = np.zeros((32, 32, 4), np.uint8); im[1:31, 1:31] = shrink(rgb, fg, bbox(fg), (30, 30))
    save(im, HERE / "fireball_impact.png"); res["fireball_impact"] = check(im)
    # Circle: the best draft, shrunk to 300x150; the quiet tier is a palette swap of it.
    rgb, fg = cutout(raw / "circle2_71.png", tol=60, drop_grey=False, everywhere=True)
    blaze = shrink(rgb, fg, (0, 0, rgb.shape[1], rgb.shape[0]), (300, 150), keep_aspect=False)
    save(blaze, HERE / "circle_blaze.png"); res["circle_blaze"] = check(blaze)
    quiet = tier_down(blaze)
    save(quiet, HERE / "circle_quiet.png"); res["circle_quiet"] = check(quiet)
    meta(HERE / "check.json", res)
    for k, v in res.items():
        print(f"{k:24} {v}")
