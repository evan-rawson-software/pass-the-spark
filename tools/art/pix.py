"""Pixel tools for the code-drawn art (#261): shapes, rounded shading with coloured outlines, layers.

Plain Python and Pillow only. A mask is a set of (x, y) pixels; a layer is a dict {(x, y): (r, g, b)}
of opaque pixels; a frame is drawn by stacking layers. Shading works out a height field from each
part's distance to its own edge, lights it from LIGHT and cuts it into the part's 5-shade ramp; the
edge is the outline, in the ramp's darkest shade, one step lighter where it faces the light.
"""
import math

from PIL import Image, ImageDraw

W, H = 48, 64  # the wizard frame
AREA = [W, H]  # the frame size being drawn: shapes, paint and sheets use it; area() changes it


def area(w, h):
    AREA[:] = [w, h]
LIGHT = (0.3, -0.85, 0.55)  # mostly from above, a little from the front: still right when mirrored


def hexrgb(s):
    return tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))


def rgbhex(c):
    return "#%02x%02x%02x" % c


# ---------- masks ----------

def _mask(draw):
    im = Image.new("L", tuple(AREA), 0)
    draw(ImageDraw.Draw(im))
    box = im.getbbox()
    if not box:
        return set()
    px = im.load()
    return {(x, y) for y in range(box[1], box[3]) for x in range(box[0], box[2]) if px[x, y]}


def ell(cx, cy, rx, ry):
    return _mask(lambda d: d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=1))


def poly(pts):
    return _mask(lambda d: d.polygon([(float(x), float(y)) for x, y in pts], fill=1))


def thick(pts, width):
    return _mask(lambda d: d.line([(float(x), float(y)) for x, y in pts], fill=1, width=int(width), joint="curve"))


def spine(pts, r0, r1):
    """A tube along a polyline, tapering from radius r0 to r1."""
    m = set()
    n = len(pts) - 1
    for i in range(n):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        steps = max(2, int(math.hypot(x1 - x0, y1 - y0) * 2))
        for s in range(steps + 1):
            r = r0 + (r1 - r0) * (i + s / steps) / n
            m |= ell(x0 + (x1 - x0) * s / steps, y0 + (y1 - y0) * s / steps, r, r)
    return m


def rows(m, y0, y1):
    return {(x, y) for x, y in m if y0 <= y <= y1}


def shift(m, dx, dy):
    return {(x + dx, y + dy) for x, y in m}


# ---------- shading ----------

def _distance(m):
    """Chamfer distance (about Euclidean) from each pixel of m to the nearest pixel outside it."""
    big = 1e9
    d = {p: big for p in m}
    for p in m:
        x, y = p
        if any(q not in m for q in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))):
            d[p] = 1.0
    order = sorted(m, key=lambda p: (p[1], p[0]))
    for seq, nb in ((order, ((-1, 0), (0, -1), (-1, -1), (1, -1))), (order[::-1], ((1, 0), (0, 1), (1, 1), (-1, 1)))):
        for (x, y) in seq:
            best = d[(x, y)]
            for dx, dy in nb:
                q = (x + dx, y + dy)
                if q in d:
                    best = min(best, d[q] + (1.414 if dx and dy else 1.0))
            d[(x, y)] = best
    return d


def shade(m, ramp, roundness=4.0, flat=0.0):
    """A layer: m shaded in ramp (5 colours, light to darkest)."""
    if not m:
        return {}
    dist = _distance(m)
    h = {p: 1 - (1 - min(dist[p] / roundness, 1.0)) ** 2 for p in m}
    get = lambda x, y: h.get((x, y), 0.0)
    smooth = {(x, y): (4 * get(x, y) + 2 * (get(x - 1, y) + get(x + 1, y) + get(x, y - 1) + get(x, y + 1))
                       + get(x - 1, y - 1) + get(x + 1, y - 1) + get(x - 1, y + 1) + get(x + 1, y + 1)) / 16 for (x, y) in m}
    sget = lambda x, y: smooth.get((x, y), 0.0)
    ll = math.sqrt(sum(v * v for v in LIGHT))
    lx, ly, lz = (v / ll for v in LIGHT)
    out = {}
    for (x, y) in m:
        gx = (sget(x + 1, y) - sget(x - 1, y)) / 2
        gy = (sget(x, y + 1) - sget(x, y - 1)) / 2
        nx, ny, nz = -gx * 3, -gy * 3, 1.0
        nl = math.sqrt(nx * nx + ny * ny + nz * nz)
        v = (nx * lx + ny * ly + nz * lz) / nl * (1 - flat) + flat * 0.6
        if dist[(x, y)] <= 1:
            k = 2 if v > 0.66 else 4
        else:
            k = 0 if v > 0.8 else 1 if v > 0.6 else 2 if v > 0.33 else 3
        out[(x, y)] = ramp[k]
    return out


def over(*layers):
    out = {}
    for l in layers:
        out.update(l)
    return out


def paint(layer, pts, col):
    for x, y in pts:
        p = (int(round(x)), int(round(y)))
        if 0 <= p[0] < AREA[0] and 0 <= p[1] < AREA[1]:
            layer[p] = col


def line(layer, x0, y0, x1, y1, col):
    n = max(1, int(round(max(abs(x1 - x0), abs(y1 - y0)))))
    paint(layer, [(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n) for i in range(n + 1)], col)


def outline(layer, col):
    """The layer with a one-pixel outline in col round everything in it."""
    out = dict(layer)
    for x, y in layer:
        for q in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if q not in layer:
                out[q] = col
    return clip(out)


def halo(layer, col, parity=0, of=None):
    """A dithered glow next to the pixels of of (default: the layer): every other free neighbour, in col."""
    out = dict(layer)
    for x, y in (of if of is not None else layer):
        for q in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if q not in layer and (q[0] + q[1]) % 2 == parity:
                out[q] = col
    return clip(out)


def recolour(layer, m, col):
    """Recolour the pixels of layer that fall inside m."""
    for p in m:
        if p in layer:
            layer[p] = col


def clip(layer):
    return {p: c for p, c in layer.items() if 0 <= p[0] < AREA[0] and 0 <= p[1] < AREA[1]}


# ---------- sheets ----------

def sheet(rows_of_frames, cols):
    """A sheet: one row per animation, one column per frame, each frame the size of AREA."""
    W, H = AREA
    im = Image.new("RGBA", (cols * W, len(rows_of_frames) * H), (0, 0, 0, 0))
    px = im.load()
    for r, frames in enumerate(rows_of_frames):
        for c, layer in enumerate(frames):
            for (x, y), col in clip(layer).items():
                px[c * W + x, r * H + y] = (*col, 255)
    return im
