"""Converts the paintings in tools/art/sources/ onto the wizards' pixel grid (T5, T6): the 22 enemies,
the six backgrounds and the small icons. Run by build.py (npm run art). Deterministic: the same
sources always give the same files.

Enemies: cut out (alpha cut-off), shrunk so each tier's tallest painting is TIER_HEIGHT art pixels
(so enemies keep their painted sizes within a tier), cut to ENEMY_COLOURS colours with no dithering,
every pixel fully opaque or fully clear, then a one-pixel dark outline that never fills a one-pixel
gap. Each faces left. data/enemy-art.json gets each sprite's size, feet point and head point.
"""
import json
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "tools" / "art" / "sources"
ART = ROOT / "public" / "art"

OUTLINE = (24, 16, 28)
TIER_HEIGHT = {"basic": 130, "elite": 140, "boss": 150}
ENEMY_COLOURS = 28
BACKGROUND = (640, 360)
BACKGROUND_COLOURS = 40
ICON_COLOURS = 16
ICON_SIZE = {"map": 24, "ui": 14, "charms": 14}

# Per enemy: flip (the painting faces right; enemies face left, toward the party) and cut (alpha
# cut-off, 0-255; lower keeps thin and soft parts). Enemies painted facing the viewer stay as they are.
ENEMIES = {
    "ogre": {}, "goblin": {}, "slime": {}, "wisp": {}, "bandit": {}, "golem": {}, "harpy": {},
    "wraith": {}, "colossus": {}, "stormling": {"flip": True},
    "brute": {}, "warden": {"flip": True}, "ravager": {"flip": True}, "sentinel": {}, "tyrant": {}, "warlord": {},
    "auditor": {"flip": True}, "glutton": {}, "hoarder": {}, "smolder": {}, "long_night": {}, "warden_of_locks": {},
}


def quantize(im, colours):
    """Cuts an RGBA image's opaque pixels to `colours` colours, no dithering. Clear pixels stay clear."""
    rgb = im.convert("RGB")
    alpha = im.getchannel("A")
    opaque = [p for p, a in zip(rgb.getdata(), alpha.getdata()) if a]
    sample = Image.new("RGB", (len(opaque), 1))
    sample.putdata(opaque)
    pal = sample.quantize(colours, method=Image.Quantize.MEDIANCUT, kmeans=4, dither=Image.Dither.NONE)
    out = rgb.quantize(palette=pal, dither=Image.Dither.NONE).convert("RGBA")
    out.putalpha(alpha)
    return out


def cut_alpha(im, cut):
    a = im.getchannel("A").point(lambda v: 255 if v >= cut else 0)
    im = im.copy()
    im.putalpha(a)
    return im


def drop_strays(im):
    """Clears opaque pixels with no opaque neighbour (specks left by the cut-off)."""
    w, h = im.size
    px = im.load()
    solid = lambda x, y: 0 <= x < w and 0 <= y < h and px[x, y][3] == 255
    near = [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)]
    for x, y in [(x, y) for y in range(h) for x in range(w) if solid(x, y)]:
        if not any(solid(x + dx, y + dy) for dx, dy in near):
            px[x, y] = (0, 0, 0, 0)
    return im


def outline(im):
    """Adds a one-pixel dark outline around the opaque pixels, leaving one-pixel gaps open."""
    w, h = im.size
    px = im.load()
    solid = lambda x, y: 0 <= x < w and 0 <= y < h and px[x, y][3] == 255
    add = []
    for y in range(h):
        for x in range(w):
            if solid(x, y):
                continue
            l, r, u, d = solid(x - 1, y), solid(x + 1, y), solid(x, y - 1), solid(x, y + 1)
            if (l and r) or (u and d):
                continue  # a one-pixel gap between two parts: keep it open
            if l or r or u or d:
                add.append((x, y))
    for x, y in add:
        px[x, y] = OUTLINE + (255,)
    return im


BLOCK = 4  # paintings are cut to colours at BLOCK times the final size, then each BLOCK x BLOCK square becomes one pixel


def block_down(im, cut):
    """Shrinks an already-quantized RGBA image by BLOCK. A square is opaque when at least `cut`/255 of it
    is; it takes its most common opaque colour (ties go to the earlier pixel), so flat areas stay flat."""
    w, h = im.width // BLOCK, im.height // BLOCK
    src = im.load()
    out = Image.new("RGBA", (w, h))
    dst = out.load()
    need = BLOCK * BLOCK * cut / 255
    for y in range(h):
        for x in range(w):
            count = {}
            for dy in range(BLOCK):
                for dx in range(BLOCK):
                    p = src[x * BLOCK + dx, y * BLOCK + dy]
                    if p[3] >= 128:
                        count[p] = count.get(p, 0) + 1
            if sum(count.values()) >= need:
                dst[x, y] = max(count, key=count.get)[:3] + (255,)
    return out


def tiers():
    return {e["id"]: e["tier"] for e in json.loads((ROOT / "data" / "enemies.json").read_text())}


def convert_enemy(enemy_id, tier, opts):
    src = Image.open(SRC / "enemies" / f"{enemy_id}.png").convert("RGBA")
    scale = TIER_HEIGHT[tier] / src.height * 768 / 645  # the tallest painted subject is 645 of 768
    w, h = round(src.width * scale) * BLOCK, round(src.height * scale) * BLOCK
    big = cut_alpha(src.resize((w, h), Image.Resampling.LANCZOS), 128)
    small = drop_strays(block_down(quantize(big, ENEMY_COLOURS), opts.get("cut", 128)))
    small = small.crop(small.getchannel("A").getbbox())
    if opts.get("flip"):
        small = small.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    canvas = Image.new("RGBA", (small.width + 2, small.height + 2))
    canvas.paste(small, (1, 1))
    return outline(canvas)


def feet_and_head(im):
    """Feet: the bottom row, centred on what touches the ground (the bottom POINT_ROWS rows). Head: the top
    row, centred the same way on the top POINT_ROWS rows."""
    w, h = im.size
    a = im.getchannel("A").load()
    rows = [y for y in range(h) if any(a[x, y] for x in range(w))]
    top, bottom = rows[0], rows[-1]

    def mid(y0, y1):
        xs = [x for y in range(y0, y1 + 1) for x in range(w) if a[x, y]]
        return (min(xs) + max(xs)) // 2
    return [mid(bottom - POINT_ROWS + 1, bottom), bottom], [mid(top, top + POINT_ROWS - 1), top]


POINT_ROWS = 6


def convert_enemies():
    files, data = [], {}
    for enemy_id, tier in sorted(tiers().items()):
        im = convert_enemy(enemy_id, tier, ENEMIES[enemy_id])
        path = f"enemies/{enemy_id}.png"
        im.save(ART / path, optimize=False)
        feet, head = feet_and_head(im)
        files.append(path)
        data[enemy_id] = {"sheet": path, "w": im.width, "h": im.height, "feet": feet, "head": head}
    return files, data


# Crop boxes on the 1920x1080 paintings, before shrinking to BACKGROUND. The combat crop lets the
# table top fill most of the picture.
BACKGROUND_CROP = {"combat": (293, 330, 1627, 1080)}


def convert_backgrounds():
    files = []
    for src in sorted((SRC / "backgrounds").glob("*.jpg")):
        im = Image.open(src).convert("RGB")
        im = im.crop(BACKGROUND_CROP.get(src.stem, (0, 0) + im.size))
        im = im.resize(BACKGROUND, Image.Resampling.LANCZOS)
        im = im.quantize(BACKGROUND_COLOURS, method=Image.Quantize.MEDIANCUT, kmeans=4, dither=Image.Dither.NONE).convert("RGB")
        path = f"backgrounds/{src.stem}.png"
        im.save(ART / path, optimize=False)
        files.append(path)
    return files


def convert_icons():
    files = []
    for folder, size in ICON_SIZE.items():
        (ART / folder).mkdir(parents=True, exist_ok=True)
        for src in sorted((SRC / folder).glob("*.png")):
            im = Image.open(src).convert("RGBA")
            im = im.crop(cut_alpha(im, 128).getchannel("A").getbbox())
            f = (size - 2) / max(im.size)  # room for the outline
            im = im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.Resampling.LANCZOS)
            im = quantize(cut_alpha(im, 128), ICON_COLOURS)
            canvas = Image.new("RGBA", (size, size))
            canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2))
            path = f"{folder}/{src.name}"
            outline(canvas).save(ART / path, optimize=False)
            files.append(path)
    return files


def convert_all():
    """Writes every converted file and data/enemy-art.json. Returns the paths for the manifest."""
    for folder in ["enemies", "backgrounds"]:
        (ART / folder).mkdir(parents=True, exist_ok=True)
    files, enemies = convert_enemies()
    data = {
        "_comment": "Generated by tools/art/build.py (npm run art) from the paintings in tools/art/sources/. Don't edit by hand. "
                    "Each enemy sprite faces left, shown at the wizards' scale. Points are art pixels in the sprite: feet is where "
                    "it stands on the table, head the top of its head (its action bubble goes by it).",
        "enemies": enemies,
    }
    (ROOT / "data" / "enemy-art.json").write_text(json.dumps(data, indent=2) + "\n", newline="\n")
    return files + convert_backgrounds() + convert_icons()
