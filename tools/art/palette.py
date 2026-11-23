"""The palette for all code-drawn pixel art, and the 8 seat colours (#261).

  python tools/art/palette.py      prints how distinct and readable the seat colours are

Sheets are drawn in KEY, five neutral greys, wherever a part takes the wearer's colour (robes,
hats). The game swaps KEY[i] for a seat colour's ramp[i]; ramp[2], the middle shade, is the seat
colour the interface uses. Every other part has a fixed ramp. PALETTE is every colour a sheet may use.
"""
import math

from pix import hexrgb

KEY = ["#ececec", "#c4c4c4", "#9a9a9a", "#6e6e6e", "#424242"]  # light to darkest

# Fixed ramps, light to darkest; the darkest is the part's outline.
SKIN = ["#ffe0c2", "#f4b98f", "#d98a6a", "#a85a4a", "#5c2e2e"]
BEARD = ["#ffffff", "#eceaf2", "#c9c3d6", "#9a90ae", "#4d4560"]
WOOD = ["#e0a465", "#b87742", "#8a522c", "#5e3620", "#33201a"]
GOLD = ["#fff6c4", "#ffd54a", "#f0a830", "#b86e1e", "#5e3510"]
GEM = ["#ffffff", "#bff8ff", "#5fd8f0", "#2a8fc0", "#173f66"]
BOOT = ["#8a6a5a", "#6a4a3e", "#4e3430", "#3a2426", "#22161c"]
CLOTH = ["#fffaf0", "#f2e6cf", "#d9c6a5", "#a8916f", "#5a4a3a"]  # cream: sashes and patches
ACCENTS = {"eye": "#2a1b2e", "cheek": "#ff9a9a"}
PARCHMENT = ["#f4e2b8", "#e6cc98", "#cfae74", "#9c7448", "#4a2e1e"]  # the map's scroll
ARCANE = ["#f1e6ff", "#c3a4ff", "#8f68e8", "#5a3d9e", "#352460"]  # the circle at rest; GOLD and white as it blazes
WHITE = "#ffffff"

# The 8 seat colours: id, name, ramp (light to darkest; the middle one is the seat colour).
# Shadows lean toward violet and highlights toward warm white, so every colour sits in the same light.
SEATS = [
    ("crimson", "Crimson", ["#ffc8cd", "#ff8492", "#f2475e", "#a81f48", "#55102e"]),
    ("cyan", "Cyan", ["#d0f8ff", "#7ae8fb", "#22d3ee", "#1883b0", "#143c66"]),
    ("pink", "Pink", ["#ffe0f6", "#ffaee9", "#ff7ad9", "#c2479f", "#5e2058"]),
    ("silver", "Silver", ["#ffffff", "#f3f1f8", "#d8d3e4", "#9d95b4", "#4e4766"]),
    ("lime", "Lime", ["#f0ffc4", "#d6f584", "#b6e64a", "#6f9e2c", "#2f4f22"]),
    ("lilac", "Lilac", ["#efe8ff", "#d4c8ff", "#b49dff", "#7861cc", "#372a72"]),
    ("mint", "Mint", ["#dcfff2", "#aaf7de", "#6eefc0", "#2ea886", "#14524e"]),
    ("peach", "Peach", ["#fff0e4", "#ffd2b6", "#ffb187", "#cf7456", "#6e3438"]),
]

# What the seat colours must stay clear of: the six spark colours (src/game/sparks.ts), the gold
# turn highlight, and the dark panels they sit on.
SPARKS = {"Ember": "#ff6a13", "Tide": "#2f80ed", "Gale": "#4cc46a", "Storm": "#f2c200", "Void": "#7b3fc4", "Rot": "#8a6d3b"}
GOLD_HIGHLIGHT = "#ffd54a"
PANEL = "#1b1524"
# A ramp per spark for the spells and the wards, light to darkest; the middle one is the spark's colour.
SPARK_RAMPS = {
    "Ember": ["#fff1c2", "#ffb04a", "#ff6a13", "#c23a12", "#5e1810"],
    "Tide": ["#d6f0ff", "#7ec0ff", "#2f80ed", "#1d4fa8", "#142a5e"],
    "Gale": ["#e4ffd6", "#9eeaa0", "#4cc46a", "#2a8450", "#16443a"],
    "Storm": ["#fffbe0", "#ffe866", "#f2c200", "#b07f00", "#5a3c00"],
    "Void": ["#ecdcff", "#b98af2", "#7b3fc4", "#4b2384", "#241040"],
    "Rot": ["#e2e09a", "#b8a45e", "#8a6d3b", "#5a4426", "#2c2014"],
}
assert all(SPARK_RAMPS[k][2] == v for k, v in SPARKS.items())
MIN_DELTA_E = 20  # CIE76 distance between any two seat colours, or a seat colour and a spark or the gold
MIN_CONTRAST = 4.5  # the middle shade against the panel, as text

PALETTE = ({hexrgb(c) for ramp in (KEY, SKIN, BEARD, WOOD, GOLD, GEM, BOOT, CLOTH, ARCANE, PARCHMENT, *SPARK_RAMPS.values()) for c in ramp}
           | {hexrgb(c) for c in (*ACCENTS.values(), WHITE)})


def _lab(c):
    def lin(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(v) for v in hexrgb(c))
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    return 116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))


def delta_e(a, b):
    return math.dist(_lab(a), _lab(b))


def contrast(a, b):
    def lum(c):
        def lin(v):
            v /= 255
            return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
        r, g, bl = (lin(v) for v in hexrgb(c))
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl
    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def seat_problems():
    """Every pair that is too close, and every seat colour too dark to read on the panels."""
    bad = []
    mids = [(n, r[2]) for _, n, r in SEATS]
    for i, (n, c) in enumerate(mids):
        for m, d in mids[i + 1:]:
            if delta_e(c, d) < MIN_DELTA_E:
                bad.append(f"{n} and {m}: dE {delta_e(c, d):.0f}")
        for m, d in list(SPARKS.items()) + [("gold highlight", GOLD_HIGHLIGHT)]:
            if delta_e(c, d) < MIN_DELTA_E:
                bad.append(f"{n} and {m}: dE {delta_e(c, d):.0f}")
        if contrast(c, PANEL) < MIN_CONTRAST:
            bad.append(f"{n} on the panel: contrast {contrast(c, PANEL):.1f}")
    return bad


if __name__ == "__main__":
    others = list(SPARKS.items()) + [("gold", GOLD_HIGHLIGHT)]
    for _, n, r in SEATS:
        c = r[2]
        near_seat = min((delta_e(c, s[2][2]), s[1]) for s in SEATS if s[1] != n)
        near_other = min((delta_e(c, d), m) for m, d in others)
        print(f"{n:8} {c}  contrast {contrast(c, PANEL):4.1f}  nearest seat {near_seat[1]:8} dE {near_seat[0]:4.0f}"
              f"  nearest spark/gold {near_other[1]:6} dE {near_other[0]:4.0f}")
    print("problems:", seat_problems() or "none")
