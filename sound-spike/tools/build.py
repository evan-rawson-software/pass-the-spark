"""Sound spike (#244): build every candidate, log each processing step, match loudness, write .ogg.

Usage: python build.py OUT_DIR   (OUT_DIR = <repo>/sound-spike)
Writes OUT_DIR/<method>/<cue>_<n>.ogg and OUT_DIR/candidates.json (notes, licences, loudness).
"""
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
HERE = Path(__file__).parent
DL = HERE / "dl"
KENNEY = HERE.parent / "kenney"
TOOLS = HERE / "tools"
REPO = Path("C:/Projects/pass-the-spark")
TARGET_LUFS = -14.0  # loudest 400 ms window (momentary max), so short hits and long fanfares compare fairly
PEAK = 10 ** (-1.5 / 20)

OGA = "OpenGameArt, CC0"
LIC = {
    "100-cc0-sfx": ("100 CC0 SFX by rubberduck", "https://opengameart.org/content/100-cc0-sfx", OGA),
    "50-cc0-retro-synth-sfx": ("50 CC0 retro / synth SFX by rubberduck", "https://opengameart.org/content/50-cc0-retro-synth-sfx", OGA),
    "level-up-power-up-coin-get-13-sounds": ("Level up, power up, Coin get by wobbleboxx", "https://opengameart.org/content/level-up-power-up-coin-get-13-sounds", OGA),
    "synthesized-explosion": ("Synthesized explosion by qubodup", "https://opengameart.org/content/synthesized-explosion", OGA),
    "muffled-distant-explosion": ("Muffled Distant Explosion by NenadSimic", "https://opengameart.org/content/muffled-distant-explosion", OGA),
    "point-bell": ("Point bell by haeldb", "https://opengameart.org/content/point-bell", "OpenGameArt, CC0 (dual CC0 / OGA-BY 3.0; used under CC0)"),
    "8bit-fanfare-jingle-the-lick": ("8bit fanfare jingle \"The Lick\" by haley-halcyon", "https://opengameart.org/content/8bit-fanfare-jingle-the-lick", OGA),
    "classic-fanfare-lick": ("Classic fanfare lick by fvcalderan", "https://opengameart.org/content/classic-fanfare-lick", OGA),
    "victory-6": ("Victory by musheran", "https://opengameart.org/content/victory-6", OGA),
    "win-sound-effect": ("Win sound effect by Listener", "https://opengameart.org/content/win-sound-effect", OGA),
    "hyper-ultra-fanfare": ("Hyper-Ultra-Fanfare by zane-little-music", "https://opengameart.org/content/hyper-ultra-fanfare", OGA),
    "impact-sounds": ("Kenney Impact Sounds", "https://kenney.nl/assets/impact-sounds", "Kenney, CC0"),
    "casino-audio": ("Kenney Casino Audio", "https://kenney.nl/assets/casino-audio", "Kenney, CC0"),
}

# ---------- DSP helpers ----------

def load(path):
    x, sr = sf.read(path, always_2d=True)
    x = x.mean(1)
    if sr != SR:
        g = np.gcd(sr, SR)
        x = signal.resample_poly(x, SR // g, sr // g)
    return x.astype(np.float64)


def lib(rel):
    """Load a library clip; returns (audio, source line for the report)."""
    p = (DL / rel) if (DL / rel).exists() else (KENNEY / rel)
    pack = Path(rel).parts[0]
    name, url, lic = LIC[pack]
    return load(p), f"`{Path(rel).name}` from [{name}]({url}) ({lic})"


def trim_silence(x, db=-50):
    thr = 10 ** (db / 20) * np.abs(x).max()
    idx = np.nonzero(np.abs(x) > thr)[0]
    return x[idx[0]: idx[-1] + 1] if len(idx) else x


def cut(x, start=0.0, length=None, fade_out=0.05, fade_in=0.002):
    a = int(start * SR)
    b = len(x) if length is None else min(len(x), a + int(length * SR))
    y = x[a:b].copy()
    fi, fo = int(fade_in * SR), int(fade_out * SR)
    if fi:
        y[:fi] *= np.linspace(0, 1, fi)
    if fo:
        y[-fo:] *= np.linspace(1, 0, fo) ** 2
    return y


def db(x, d):
    return x * 10 ** (d / 20)


def mix(*parts):
    """parts: (audio, offset_seconds, gain_db)."""
    n = max(int(o * SR) + len(a) for a, o, _ in parts)
    out = np.zeros(n)
    for a, o, g in parts:
        i = int(o * SR)
        out[i: i + len(a)] += db(a, g)
    return out


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, "highpass", fs=SR, output="sos"), x)


def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, "lowpass", fs=SR, output="sos"), x)


def shelf(x, f, gain_db, kind="high"):
    """RBJ shelving EQ."""
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f / SR
    cs, sn = np.cos(w), np.sin(w)
    al = sn / 2 * np.sqrt(2)
    s = 1 if kind == "high" else -1
    b0 = A * ((A + 1) + s * (A - 1) * cs + 2 * np.sqrt(A) * al)
    b1 = -2 * s * A * ((A - 1) + s * (A + 1) * cs)
    b2 = A * ((A + 1) + s * (A - 1) * cs - 2 * np.sqrt(A) * al)
    a0 = (A + 1) - s * (A - 1) * cs + 2 * np.sqrt(A) * al
    a1 = 2 * s * ((A - 1) - s * (A + 1) * cs)
    a2 = (A + 1) - s * (A - 1) * cs - 2 * np.sqrt(A) * al
    return signal.lfilter([b0 / a0, b1 / a0, b2 / a0], [1, a1 / a0, a2 / a0], x)


def comp(x, thresh_db=-18, ratio=4, attack=0.003, release=0.12):
    """Feed-forward peak compressor with makeup gain back to the original peak."""
    env = np.abs(x)
    a, r = np.exp(-1 / (attack * SR)), np.exp(-1 / (release * SR))
    e = np.zeros_like(env)
    prev = 0.0
    for i, v in enumerate(env):
        c = a if v > prev else r
        prev = c * prev + (1 - c) * v
        e[i] = prev
    lvl = 20 * np.log10(e + 1e-9)
    over = np.maximum(0, lvl - thresh_db)
    y = x * 10 ** (-over * (1 - 1 / ratio) / 20)
    return y * (np.abs(x).max() / (np.abs(y).max() + 1e-12))


def reverb(x, seconds=1.2, wet=0.25, predelay=0.012, seed=1):
    """Convolve with a decaying stereo-less noise tail (a simple room)."""
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    ir = rng.standard_normal(n) * np.exp(-6.9 * np.arange(n) / n)
    ir = lp(ir, 7000)
    ir /= np.sqrt((ir ** 2).sum())
    tail = signal.fftconvolve(x, ir)
    out = np.zeros(len(x) + n + int(predelay * SR))
    out[: len(x)] += x
    p = int(predelay * SR)
    out[p: p + len(tail)] += wet * tail * (np.abs(x).max() / (np.abs(tail).max() + 1e-12))
    return trim_silence(out, -60)


def softclip(x, drive_db=0):
    g = 10 ** (drive_db / 20)
    return np.tanh(x * g) / np.tanh(g)


def kweight(x):
    # ITU-R BS.1770 pre-filter (high shelf) and RLB high-pass, designed for SR
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    K = np.tan(np.pi * f0 / SR)
    Vh = 10 ** (G / 20)
    Vb = Vh ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    b = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0]
    a = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    y = signal.lfilter(b, a, x)
    f0, Q = 38.13547087602444, 0.5003270373238773
    K = np.tan(np.pi * f0 / SR)
    a0 = 1 + K / Q + K * K
    return signal.lfilter([1, -2, 1], [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0], y)


def loudness(x):
    """Max momentary loudness (400 ms window, 100 ms hop), LUFS-style."""
    y = kweight(x) ** 2
    w = int(0.4 * SR)
    if len(y) <= w:
        return -0.691 + 10 * np.log10(y.mean() * len(y) / w + 1e-12)
    c = np.concatenate([[0], np.cumsum(y)])
    starts = np.arange(0, len(y) - w + 1, int(0.1 * SR))
    ms = (c[starts + w] - c[starts]) / w
    return -0.691 + 10 * np.log10(ms.max() + 1e-12)


def finish(x):
    """Remove DC, short fades, match loudness, then a soft peak limit at -1 dBFS."""
    x = hp(x - x.mean(), 20)
    x = cut(trim_silence(x, -60), fade_out=0.01, fade_in=0.001)
    for _ in range(4):
        x = db(x, TARGET_LUFS - loudness(x))
        if np.abs(x).max() > PEAK:
            x = PEAK * np.tanh(x / PEAK)
    return x


# ---------- jsfxr ----------

def P(f):
    """jsfxr p_base_freq for a frequency in Hz (measured: f = 3528 * (p^2 + 0.001))."""
    return float(np.sqrt(max(f / 3528 - 0.001, 0)))


NOTE = lambda semis, base=523.25: base * 2 ** (semis / 12)
PENTA = [0, 2, 4, 7, 9]
step = lambda i: PENTA[i % 5] + 12 * (i // 5)

JS = {}  # name -> params; rendered in one node call


def js(name, **p):
    JS[name] = p
    return name


def render_js():
    out = HERE / "js_raw"
    (HERE / "js_defs.json").write_text(json.dumps(JS))
    subprocess.run(["node", str(TOOLS / "render.js"), str(HERE / "js_defs.json"), str(out)], check=True)
    res = {}
    for n in JS:
        a = np.frombuffer((out / f"{n}.f32").read_bytes(), dtype=np.float32).astype(np.float64)
        g = np.gcd(44100, SR)
        res[n] = signal.resample_poly(a, SR // g, 44100 // g)
    return res


# ---------- candidates ----------
# Each entry: method, cue, n, a function returning (audio, steps[], sources[])

CANDS = []


def cand(method, cue, n):
    def deco(fn):
        CANDS.append((method, cue, n, fn))
        return fn
    return deco


# jsfxr definitions (designed by hand, not random), registered up front
SQ, SAW, SINE, NOISE = 0, 1, 2, 3
js("hit1_tone", wave_type=SQ, p_base_freq=P(1046.5), p_duty=0.35, p_env_attack=0, p_env_sustain=0.04,
   p_env_punch=0.55, p_env_decay=0.42, p_arp_mod=0.42, p_arp_speed=0.62, sound_vol=0.5)
js("hit1_click", wave_type=NOISE, p_base_freq=0.75, p_env_sustain=0.01, p_env_decay=0.09, p_hpf_freq=0.25, sound_vol=0.5)
js("hit2_tone", wave_type=SQ, p_base_freq=P(1046.5 * 1.5), p_arp_mod=-0.2236, p_arp_speed=0.77, p_duty=0.2,
   p_env_sustain=0.03, p_env_punch=0.7, p_env_decay=0.22, sound_vol=0.5)
js("hit2_thump", wave_type=SINE, p_base_freq=P(260), p_freq_ramp=-0.35, p_env_sustain=0.03, p_env_decay=0.3, sound_vol=0.5)
js("hit2_click", wave_type=NOISE, p_base_freq=0.9, p_env_sustain=0.01, p_env_decay=0.06, p_hpf_freq=0.35, sound_vol=0.5)
js("hit3_a", wave_type=SAW, p_base_freq=P(1046.5), p_env_sustain=0.02, p_env_punch=0.4, p_env_decay=0.3,
   p_lpf_freq=0.6, p_lpf_ramp=-0.15, sound_vol=0.5)
js("hit3_b", wave_type=SINE, p_base_freq=P(2093), p_env_sustain=0.01, p_env_decay=0.36, sound_vol=0.5)
for i in range(7):
    s = step(i * 2 + 6)
    js(f"t3a_{i}", wave_type=SQ, p_base_freq=P(NOTE(s, 392)), p_duty=0.3, p_env_sustain=0.05,
       p_env_punch=0.3, p_env_decay=0.16 if i < 6 else 0.55, p_vib_strength=0 if i < 6 else 0.12, p_vib_speed=0.55, sound_vol=0.5)
js("t3a_whoosh", wave_type=NOISE, p_base_freq=0.4, p_freq_ramp=0.12, p_env_attack=0.35, p_env_sustain=0.05, p_env_decay=0.3,
   p_hpf_freq=0.1, p_hpf_ramp=0.18, sound_vol=0.5)
js("t3b_up", wave_type=SQ, p_base_freq=P(330), p_freq_ramp=0.22, p_repeat_speed=0.62, p_duty=0.4, p_duty_ramp=-0.2,
   p_env_sustain=0.42, p_env_punch=0.2, p_env_decay=0.35, sound_vol=0.5)
js("t3b_oct", wave_type=SAW, p_base_freq=P(660), p_freq_ramp=0.22, p_repeat_speed=0.62, p_env_sustain=0.42,
   p_env_decay=0.35, p_lpf_freq=0.55, sound_vol=0.5)
js("t3b_hit", wave_type=NOISE, p_base_freq=0.55, p_env_sustain=0.02, p_env_punch=0.6, p_env_decay=0.4, p_lpf_freq=0.7, sound_vol=0.5)
for i, s in enumerate([0, 4, 7, 12, 16, 19, 24]):
    js(f"t3c_{i}", wave_type=SAW, p_base_freq=P(NOTE(s, 261.63)), p_env_sustain=0.06, p_env_punch=0.2,
       p_env_decay=0.2 if i < 6 else 0.6, p_pha_offset=0.08, p_pha_ramp=0.05, p_lpf_freq=0.75, sound_vol=0.5)
js("slam1_boom", wave_type=NOISE, p_base_freq=0.12, p_freq_ramp=-0.18, p_env_sustain=0.28, p_env_punch=0.65, p_env_decay=0.62, sound_vol=0.5)
js("slam1_sub", wave_type=SINE, p_base_freq=P(140), p_freq_limit=P(34), p_freq_ramp=-0.3, p_env_sustain=0.18, p_env_punch=0.3, p_env_decay=0.7, sound_vol=0.5)
js("slam1_crunch", wave_type=SQ, p_base_freq=P(220), p_freq_ramp=-0.4, p_env_sustain=0.06, p_env_punch=0.7, p_env_decay=0.25, p_duty=0.6, sound_vol=0.5)
js("slam2_low", wave_type=NOISE, p_base_freq=0.06, p_freq_ramp=-0.1, p_env_sustain=0.35, p_env_punch=0.5, p_env_decay=0.75,
   p_lpf_freq=0.35, p_lpf_ramp=-0.1, sound_vol=0.5)
js("slam2_mid", wave_type=NOISE, p_base_freq=0.22, p_freq_ramp=-0.25, p_env_sustain=0.12, p_env_punch=0.8, p_env_decay=0.4, sound_vol=0.5)
js("slam2_saw", wave_type=SAW, p_base_freq=P(110), p_freq_limit=P(30), p_freq_ramp=-0.25, p_env_sustain=0.2, p_env_decay=0.6, p_lpf_freq=0.4, sound_vol=0.5)
js("slam3_bomb", wave_type=NOISE, p_base_freq=0.15, p_freq_ramp=-0.12, p_repeat_speed=0.0, p_env_sustain=0.3, p_env_punch=0.4,
   p_env_decay=0.8, p_pha_offset=0.25, p_pha_ramp=-0.1, p_lpf_freq=0.6, p_lpf_ramp=-0.08, sound_vol=0.5)
js("slam3_drop", wave_type=SINE, p_base_freq=P(90), p_freq_limit=P(30), p_freq_ramp=-0.2, p_env_sustain=0.35, p_env_decay=0.8, sound_vol=0.5)
js("slam3_snap", wave_type=NOISE, p_base_freq=0.85, p_env_sustain=0.01, p_env_decay=0.12, p_hpf_freq=0.2, sound_vol=0.5)
# fanfare building blocks: a lead note at any pitch and a sparkle
def lead(name, f, length, wave=SQ, vib=0.0):
    return js(name, wave_type=wave, p_base_freq=P(f), p_duty=0.25, p_env_attack=0.0, p_env_sustain=np.sqrt(length / 2.27) * 0.95,
              p_env_punch=0.25, p_env_decay=0.25, p_vib_strength=vib, p_vib_speed=0.5, p_lpf_freq=0.8 if wave == SAW else 1, sound_vol=0.5)
js("spark", wave_type=SQ, p_base_freq=P(1975.5), p_env_sustain=0.03, p_env_decay=0.2, p_arp_mod=0.35, p_arp_speed=0.55, p_duty=0.5, sound_vol=0.5)
js("spark2", wave_type=SINE, p_base_freq=P(3136), p_env_sustain=0.02, p_env_decay=0.25, sound_vol=0.5)
F1_RUN = [step(i) for i in range(10)]
for i, s in enumerate(F1_RUN):
    lead(f"f1_run{i}", NOTE(s, 392), 0.07)
for j, s in enumerate([0, 4, 7, 12]):
    lead(f"f1_ch{j}", NOTE(s, 523.25), 1.3, wave=SQ if j % 2 else SAW, vib=0.08)
    lead(f"f1_chd{j}", NOTE(s, 523.25) * 1.006, 1.3, wave=SAW, vib=0.08)
for j, s in enumerate([0, 4, 7]):
    lead(f"f2_g{j}", NOTE(s - 5, 523.25), 0.11, wave=SAW)
    lead(f"f2_c{j}", NOTE(s, 523.25), 1.4, wave=SAW, vib=0.1)
    lead(f"f2_cs{j}", NOTE(s + 12, 523.25), 1.4, wave=SQ, vib=0.1)
F3_ROLLS = [[0, 4, 7], [5, 9, 12], [7, 11, 14], [12, 16, 19, 24]]
for r, roll in enumerate(F3_ROLLS):
    for k, s in enumerate(roll):
        lead(f"f3_{r}_{k}", NOTE(s, 392), 0.22 if r < 3 else 1.3, wave=SQ if k % 2 else SAW, vib=0.0 if r < 3 else 0.09)


def sparkles(J, start, length, count, seed):
    rng = np.random.default_rng(seed)
    return [(J["spark" if i % 2 else "spark2"], start + rng.uniform(0, length), -10 - rng.uniform(0, 6)) for i in range(count)]


def build_jsfxr(J):
    @cand("jsfxr", "combo-hit", 1)
    def _():
        x = mix((J["hit1_tone"], 0, 0), (J["hit1_click"], 0, -9))
        return x, ["jsfxr square 'coin' blip at C6 with punch and an upward arpeggio jump",
                   "layered with a short high-passed jsfxr noise click (-9 dB)"], []

    @cand("jsfxr", "combo-hit", 2)
    def _():
        x = mix((J["hit2_tone"], 0, 0), (J["hit2_thump"], 0, -4), (J["hit2_click"], 0, -10))
        x = comp(x, -16, 4)
        return x, ["jsfxr narrow square that snaps down a fifth onto C6", "layered with a sine thump (260 Hz falling, -4 dB) and a noise click (-10 dB)",
                   "compressed (4:1 at -16 dB)"], []

    @cand("jsfxr", "combo-hit", 3)
    def _():
        x = mix((J["hit3_a"], 0, 0), (J["hit3_b"], 0, -3), (J["hit1_click"], 0, -12))
        x = reverb(x, 0.5, 0.18)
        return x, ["jsfxr saw at C6 with a closing low-pass, plus a sine an octave up (-3 dB) for a bell-like top",
                   "a noise click (-12 dB)", "short room reverb (0.5 s, 18 % wet)"], []

    @cand("jsfxr", "combo-tier3", 1)
    def _():
        parts = [(J[f"t3a_{i}"], i * 0.055, 0) for i in range(7)] + [(J["t3a_whoosh"], 0, -8)]
        x = reverb(mix(*parts), 0.9, 0.22)
        return x, ["seven jsfxr square notes running up the pentatonic scale 55 ms apart, the last held with vibrato",
                   "a rising jsfxr noise whoosh under it (-8 dB)", "room reverb (0.9 s, 22 % wet)"], []

    @cand("jsfxr", "combo-tier3", 2)
    def _():
        x = mix((J["t3b_up"], 0, 0), (J["t3b_oct"], 0, -6), (J["t3b_hit"], 0.42, -6))
        x = comp(reverb(x, 0.8, 0.2), -18, 3)
        return x, ["jsfxr 'power-up' staircase (square, rising slide with repeat)", "doubled an octave up with a filtered saw (-6 dB)",
                   "a noise crash on the top step (-6 dB)", "reverb (0.8 s, 20 %), compressed 3:1"], []

    @cand("jsfxr", "combo-tier3", 3)
    def _():
        parts = [(J[f"t3c_{i}"], i * 0.06, 0) for i in range(7)]
        x = reverb(shelf(mix(*parts), 3000, 3), 1.1, 0.28)
        return x, ["seven jsfxr saw notes arpeggiating a C major chord up two octaves, 60 ms apart, with jsfxr's flanger",
                   "high shelf +3 dB at 3 kHz", "reverb (1.1 s, 28 % wet)"], []

    @cand("jsfxr", "combo-slam", 1)
    def _():
        x = mix((J["slam1_boom"], 0, 0), (J["slam1_sub"], 0, 0), (J["slam1_crunch"], 0, -6))
        x = reverb(comp(softclip(x, 6), -20, 5), 1.4, 0.2)
        return x, ["jsfxr noise explosion with punch", "a sine sub dropping 140 → 34 Hz", "a square crunch (-6 dB)",
                   "soft-clip saturation (+6 dB drive), compressed 5:1", "reverb (1.4 s, 20 %)"], []

    @cand("jsfxr", "combo-slam", 2)
    def _():
        x = mix((J["slam2_low"], 0, 0), (J["slam2_mid"], 0, -3), (J["slam2_saw"], 0, -2))
        x = shelf(comp(softclip(x, 4), -18, 4), 120, 4, "low")
        return x, ["two jsfxr noise explosions stacked (low and filtered, plus a short mid crack at -3 dB)",
                   "a filtered saw dropping 110 → 30 Hz (-2 dB)", "soft-clip (+4 dB), compressed 4:1", "low shelf +4 dB at 120 Hz"], []

    @cand("jsfxr", "combo-slam", 3)
    def _():
        x = mix((J["slam3_snap"], 0, -2), (J["slam3_bomb"], 0, 0), (J["slam3_drop"], 0, -1))
        x = reverb(comp(x, -20, 4), 2.0, 0.3)
        return x, ["jsfxr 'bomb': noise explosion with a sweeping flanger and closing low-pass", "a sine drop 90 → 30 Hz (-1 dB)",
                   "a bright noise snap on the front (-2 dB)", "compressed 4:1", "long reverb (2 s, 30 %) for size"], []

    @cand("jsfxr", "combo-fanfareLethal", 1)
    def _():
        run = [(J[f"f1_run{i}"], i * 0.045, -2) for i in range(10)]
        t = 10 * 0.045
        chord = [(J[f"f1_ch{j}"], t, -4) for j in range(4)] + [(J[f"f1_chd{j}"], t, -7) for j in range(4)]
        x = mix(*run, *chord, *sparkles(J, t + 0.1, 1.5, 14, 1))
        x = reverb(comp(x, -18, 3), 1.6, 0.25)
        return x, ["a fast jsfxr square run up the pentatonic scale (10 notes, 45 ms apart)",
                   "then a held C major chord: four jsfxr saw/square notes plus a slightly detuned saw copy of each for width, with vibrato",
                   "14 jsfxr coin sparkles scattered over the chord (-10 to -16 dB)", "compressed 3:1", "reverb (1.6 s, 25 %)"], []

    @cand("jsfxr", "combo-fanfareLethal", 2)
    def _():
        stab = lambda t, g: [(J[f"f2_g{j}"], t, g) for j in range(3)]
        x = mix(*stab(0, -3), *stab(0.16, -3), *stab(0.32, -3),
                *[(J[f"f2_c{j}"], 0.5, -3) for j in range(3)], *[(J[f"f2_cs{j}"], 0.5, -9) for j in range(3)],
                *sparkles(J, 0.6, 1.6, 18, 2))
        x = reverb(comp(shelf(x, 4000, 2), -18, 3), 1.8, 0.28)
        return x, ["three short jsfxr saw chord stabs (G major), then a held C major chord with an octave-up square layer (-9 dB) and vibrato",
                   "18 jsfxr sparkles over the hold", "high shelf +2 dB at 4 kHz, compressed 3:1", "reverb (1.8 s, 28 %)"], []

    @cand("jsfxr", "combo-fanfareLethal", 3)
    def _():
        parts = []
        for r, roll in enumerate(F3_ROLLS):
            for k in range(len(roll)):
                parts.append((J[f"f3_{r}_{k}"], r * 0.24 + k * 0.03, -3))
        x = mix(*parts, *sparkles(J, 0.75, 1.5, 16, 3))
        x = reverb(comp(x, -18, 3), 1.6, 0.25)
        return x, ["four rolled jsfxr chords climbing I–IV–V–I (C, F, G, high C), 240 ms apart; the last one held with vibrato",
                   "16 jsfxr sparkles over the last chord", "compressed 3:1", "reverb (1.6 s, 25 %)"], []


def build_library():
    @cand("library", "combo-hit", 1)
    def _():
        a, s = lib("100-cc0-sfx/hit_01.ogg")
        x = shelf(cut(trim_silence(a), 0, 0.25, 0.08), 3000, 3)
        return x, ["trimmed to 250 ms with a fade", "high shelf +3 dB at 3 kHz for brightness"], [s]

    @cand("library", "combo-hit", 2)
    def _():
        a, s1 = lib("50-cc0-retro-synth-sfx/retro_coin_02.ogg")
        b, s2 = lib("impact-sounds/Audio/impactGeneric_light_000.ogg")
        x = mix((cut(trim_silence(a), 0, 0.3, 0.08), 0, 0), (trim_silence(b), 0, -6))
        return x, ["retro coin blip trimmed to 300 ms", "layered with a Kenney light impact for the punch (-6 dB)"], [s1, s2]

    @cand("library", "combo-hit", 3)
    def _():
        a, s1 = lib("point-bell/point_bell.wav")
        b, s2 = lib("impact-sounds/Audio/impactPunch_medium_000.ogg")
        x = mix((cut(trim_silence(a), 0, 0.4, 0.15), 0, 0), (hp(trim_silence(b), 200), 0, -8))
        x = comp(x, -16, 4)
        return x, ["point bell trimmed to 400 ms", "a Kenney punch, high-passed at 200 Hz, under it (-8 dB)", "compressed 4:1"], [s1, s2]

    @cand("library", "combo-tier3", 1)
    def _():
        a, s = lib("50-cc0-retro-synth-sfx/power_up_04.ogg")
        x = reverb(trim_silence(a), 0.8, 0.2)
        return x, ["used as is", "reverb (0.8 s, 20 %) for size"], [s]

    @cand("library", "combo-tier3", 2)
    def _():
        a, s = lib("level-up-power-up-coin-get-13-sounds/Rise06.aif")
        x = cut(trim_silence(a), 0, 1.4, 0.4)
        return x, ["trimmed to 1.4 s with a 400 ms fade"], [s]

    @cand("library", "combo-tier3", 3)
    def _():
        a, s1 = lib("50-cc0-retro-synth-sfx/power_up_01.ogg")
        b, s2 = lib("100-cc0-sfx/bell_02.ogg")
        x = reverb(mix((trim_silence(a), 0, 0), (trim_silence(b), 0.35, -4)), 1.0, 0.22)
        return x, ["retro power-up", "a bell hit on the top at 350 ms (-4 dB)", "reverb (1 s, 22 %)"], [s1, s2]

    @cand("library", "combo-slam", 1)
    def _():
        a, s1 = lib("synthesized-explosion/synthetic_explosion_1.flac")
        b, s2 = lib("impact-sounds/Audio/impactPunch_heavy_002.ogg")
        x = comp(mix((trim_silence(a), 0, 0), (trim_silence(b), 0, -3)), -20, 4)
        return x, ["synthesized explosion", "a Kenney heavy punch on the front for the hit (-3 dB)", "compressed 4:1"], [s1, s2]

    @cand("library", "combo-slam", 2)
    def _():
        a, s1 = lib("muffled-distant-explosion/muffled.wav")
        b, s2 = lib("impact-sounds/Audio/impactMining_004.ogg")
        c, s3 = lib("100-cc0-sfx/slam_03.ogg")
        x = mix((cut(trim_silence(a), 0, 2.2, 0.8), 0, 0), (trim_silence(b), 0, -4), (trim_silence(c), 0, -6))
        x = shelf(comp(x, -20, 4), 100, 3, "low")
        return x, ["muffled explosion trimmed to 2.2 s", "a Kenney mining impact (-4 dB) and a door slam (-6 dB) on the front",
                   "compressed 4:1, low shelf +3 dB at 100 Hz"], [s1, s2, s3]

    @cand("library", "combo-slam", 3)
    def _():
        a, s1 = lib("50-cc0-retro-synth-sfx/retro_explosion_05.ogg")
        b, s2 = lib("100-cc0-sfx/gong_01.ogg")
        c, s3 = lib("impact-sounds/Audio/impactPunch_heavy_000.ogg")
        x = comp(mix((trim_silence(c), 0, -2), (trim_silence(a), 0, 0), (lp(trim_silence(b), 2500), 0.01, -6)), -20, 4)
        return x, ["retro explosion", "a gong, low-passed at 2.5 kHz, for a ringing tail (-6 dB)", "a Kenney heavy punch on the front (-2 dB)",
                   "compressed 4:1"], [s1, s2, s3]

    @cand("library", "combo-fanfareLethal", 1)
    def _():
        a, s = lib("8bit-fanfare-jingle-the-lick/life.wav")
        return trim_silence(a), ["used as is (3.1 s)"], [s]

    @cand("library", "combo-fanfareLethal", 2)
    def _():
        a, s = lib("classic-fanfare-lick/fanfare_3.ogg")
        return trim_silence(a, -40), ["leading silence trimmed"], [s]

    @cand("library", "combo-fanfareLethal", 3)
    def _():
        a, s1 = lib("victory-6/win-176035.mp3")
        b, s2 = lib("100-cc0-sfx/bell_03.ogg")
        x = reverb(mix((trim_silence(a), 0, 0), (trim_silence(b), 0.5, -6)), 1.2, 0.2)
        return x, ["victory jingle", "a bright bell shimmer from 0.5 s (-6 dB), for sparkle", "reverb (1.2 s, 20 %)"], [s1, s2]


def build_baseline():
    for cue, f in [("combo-hit", "hit_chip"), ("combo-tier3", "tier3_chip"), ("combo-slam", "slam_boom"),
                   ("combo-fanfareLethal", "fanfareLethal_bells")]:
        def fn(f=f):
            return load(REPO / "public/audio/generated" / f"{f}.ogg"), ["the clip the game uses today, loudness-matched only"], [f"`public/audio/generated/{f}.ogg` (generated for the game)"]
        CANDS.append(("current", cue, 1, fn))


def main(out):
    out = Path(out)
    t0 = time.time()
    build_jsfxr(render_js())
    build_library()
    build_baseline()
    meta = []
    for method, cue, n, fn in CANDS:
        x, steps, srcs = fn()
        x = finish(x)
        p = out / method / f"{cue}_{n}.ogg"
        p.parent.mkdir(parents=True, exist_ok=True)
        sf.write(p, x.astype(np.float32), SR, format="OGG", subtype="VORBIS")
        y, _ = sf.read(p)
        meta.append(dict(method=method, cue=cue, n=n, file=f"{method}/{cue}_{n}.ogg", seconds=round(len(x) / SR, 2),
                         lufs=round(loudness(y), 1), peak_db=round(20 * np.log10(np.abs(y).max()), 1),
                         steps=steps + ["DC removed, silence trimmed, matched to -14 LUFS (max momentary), peaks limited to -1.5 dBFS"],
                         sources=srcs))
        print(f"{p.relative_to(out)}  {meta[-1]['seconds']}s  {meta[-1]['lufs']} LUFS  peak {meta[-1]['peak_db']} dB")
    (out / "candidates.json").write_text(json.dumps(meta, indent=1))
    print(f"{len(meta)} files in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main(sys.argv[1])
