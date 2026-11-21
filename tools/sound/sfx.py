"""Building blocks for the sound recipes: jsfxr voices, layering, effects and loudness matching.

Everything works on mono float arrays at SR. A recipe renders jsfxr voices with `voice`, places them
with `mix`, processes the result (eq, compression, saturation, reverb), and build.py runs `finish` on it.
"""
import json
import subprocess
from pathlib import Path

import numpy as np
from scipy import signal

SR = 48000
TARGET_LUFS = -14.0  # loudest 400 ms window, so short hits and long fanfares match (R5)
PEAK = 10 ** (-1.5 / 20)
HERE = Path(__file__).parent

SQ, SAW, SINE, NOISE = 0, 1, 2, 3  # jsfxr wave types

# The game's key: C major pentatonic. NOTE(semitones, base) is a frequency; step(i) is the i-th note
# of the scale in semitones (it repeats an octave up), as data/sound.json's majorPentatonic.
PENTA = [0, 2, 4, 7, 9]
C4, C5, C6, G4 = 261.63, 523.25, 1046.5, 392.0


def NOTE(semis, base=C5):
    return base * 2 ** (semis / 12)


def step(i):
    return PENTA[i % 5] + 12 * (i // 5)


def P(f):
    """jsfxr p_base_freq for a frequency in Hz (measured: f = 3528 * (p^2 + 0.001))."""
    return float(np.sqrt(max(f / 3528 - 0.001, 0)))


def sustain(seconds):
    """jsfxr envelope parameter for a stage length in seconds (length = p^2 * 100000 samples)."""
    return float(np.sqrt(seconds * 44100 / 100000))


# ---------- jsfxr ----------

class Renderer:
    """One node process running render.mjs; renders are cached by their parameters."""

    def __init__(self):
        self.proc = None
        self.cache = {}

    def __call__(self, params):
        key = json.dumps(params, sort_keys=True)
        if key not in self.cache:
            if self.proc is None:
                self.proc = subprocess.Popen(["node", str(HERE / "render.mjs")], stdin=subprocess.PIPE,
                                             stdout=subprocess.PIPE, cwd=HERE)
            self.proc.stdin.write((key + "\n").encode())
            self.proc.stdin.flush()
            n = int.from_bytes(self.proc.stdout.read(4), "little")
            a = np.frombuffer(self.proc.stdout.read(4 * n), dtype=np.float32).astype(np.float64)
            g = np.gcd(44100, SR)
            self.cache[key] = signal.resample_poly(a, SR // g, 44100 // g)
        return self.cache[key]

    def close(self):
        if self.proc:
            self.proc.stdin.close()
            self.proc.wait()


render = Renderer()


def voice(wave, f=None, **p):
    """A jsfxr voice. f: frequency in Hz (sets p_base_freq). Other keywords are jsfxr parameters;
    seed picks the noise. Missing parameters keep jsfxr's defaults."""
    params = {"wave_type": wave, "sound_vol": 0.5, **p}
    if f is not None:
        params["p_base_freq"] = P(f)
    return render(params)


def lead(f, length, wave=SQ, vib=0.0):
    """A held note of about `length` seconds with a short decay (the fanfare chords)."""
    return voice(wave, f, p_duty=0.25, p_env_attack=0.0, p_env_sustain=float(np.sqrt(length / 2.27) * 0.95),
                 p_env_punch=0.25, p_env_decay=0.25, p_vib_strength=vib, p_vib_speed=0.5,
                 p_lpf_freq=0.8 if wave == SAW else 1)


def spark():
    return voice(SQ, 1975.5, p_env_sustain=0.03, p_env_decay=0.2, p_arp_mod=0.35, p_arp_speed=0.55, p_duty=0.5)


def spark2():
    return voice(SINE, 3136, p_env_sustain=0.02, p_env_decay=0.25)


def sparkles(start, length, count, seed, quiet=10):
    """Coin sparkles scattered over a span, each -quiet to -quiet-6 dB."""
    rng = np.random.default_rng(seed)
    return [(spark() if i % 2 else spark2(), start + rng.uniform(0, length), -quiet - rng.uniform(0, 6)) for i in range(count)]


# ---------- layering and effects ----------

def db(x, d):
    return x * 10 ** (d / 20)


def mix(*parts):
    """parts: (audio, offset seconds, gain dB)."""
    n = max(int(o * SR) + len(a) for a, o, _ in parts)
    out = np.zeros(n)
    for a, o, g in parts:
        i = int(o * SR)
        out[i: i + len(a)] += db(a, g)
    return out


def trim_silence(x, below_db=-50):
    thr = 10 ** (below_db / 20) * np.abs(x).max()
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
    """Feed-forward peak compressor, with makeup gain back to the original peak."""
    env = np.abs(x)
    a, r = np.exp(-1 / (attack * SR)), np.exp(-1 / (release * SR))
    e = np.zeros_like(env)
    prev = 0.0
    for i, v in enumerate(env):
        c = a if v > prev else r
        prev = c * prev + (1 - c) * v
        e[i] = prev
    over = np.maximum(0, 20 * np.log10(e + 1e-9) - thresh_db)
    y = x * 10 ** (-over * (1 - 1 / ratio) / 20)
    return y * (np.abs(x).max() / (np.abs(y).max() + 1e-12))


def softclip(x, drive_db=0):
    g = 10 ** (drive_db / 20)
    return np.tanh(x * g) / np.tanh(g)


def reverb(x, seconds=1.2, wet=0.25, predelay=0.012, seed=1):
    """Convolve with a decaying noise tail (a simple room)."""
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


def echoes(x, delay, count, decay_db):
    """Discrete repeats, each decay_db quieter."""
    return mix(*[(x, i * delay, -decay_db * i) for i in range(count + 1)])


# ---------- loudness ----------

def kweight(x):
    """ITU-R BS.1770 K-weighting: the high-shelf pre-filter and the RLB high-pass, designed for SR."""
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
    """Max momentary loudness (400 ms window, 100 ms hop), in LUFS."""
    y = kweight(x) ** 2
    w = int(0.4 * SR)
    if len(y) <= w:
        return -0.691 + 10 * np.log10(y.mean() * len(y) / w + 1e-12)
    c = np.concatenate([[0], np.cumsum(y)])
    starts = np.arange(0, len(y) - w + 1, int(0.1 * SR))
    return -0.691 + 10 * np.log10(((c[starts + w] - c[starts]) / w).max() + 1e-12)


def finish(x):
    """Remove DC, trim silence with short fades, match to TARGET_LUFS, soft-limit peaks to PEAK."""
    x = hp(x - x.mean(), 20)
    x = cut(trim_silence(x, -60), fade_out=0.01, fade_in=0.001)
    for _ in range(4):
        x = db(x, TARGET_LUFS - loudness(x))
        if np.abs(x).max() > PEAK:
            x = PEAK * np.tanh(x / PEAK)
    return x
