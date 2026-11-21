"""One recipe per sound cue (data/sound.json), in the layered jsfxr style picked in the sound spike (#244).

RECIPES maps a cue to its variants. The "pick" variant is the one that ships; a picker round adds
"A" and "B" candidates next to it (build.py --candidates) until the designer picks one. A recipe
returns (audio, how it was made). Tuned cues have their root on a C, so the game's scale pitching keeps
them in C major pentatonic. Every clip is loudness-matched by build.py afterwards, so the gains
here only balance the layers inside one sound.
"""
from sfx import (C4, C5, C6, G4, NOISE, SAW, SINE, SQ, NOTE, P, comp, echoes, lead, lp, mix, reverb,
                 shelf, softclip, sparkles, step, sustain, voice)

RECIPES = {}


def recipe(cue, variant):
    def deco(fn):
        RECIPES.setdefault(cue, {})[variant] = fn
        return fn
    return deco


def click(decay=0.06, hpf=0.35, seed=1, base=0.9):
    return voice(NOISE, p_base_freq=base, p_env_sustain=0.01, p_env_decay=decay, p_hpf_freq=hpf, seed=seed)


# ======================================================================================
# The four spike picks (sound-spike branch, befd7fc), unchanged.
# ======================================================================================

def hit_recipe(f=C6 * 1.5, decay=0.22, thump=260):
    tone = voice(SQ, f, p_arp_mod=-0.2236, p_arp_speed=0.77, p_duty=0.2, p_env_sustain=0.03, p_env_punch=0.7, p_env_decay=decay)
    body = voice(SINE, thump, p_freq_ramp=-0.35, p_env_sustain=0.03, p_env_decay=0.3)
    return comp(mix((tone, 0, 0), (body, 0, -4), (click(), 0, -10)), -16, 4)


@recipe("combo:hit", "pick")
def _():
    return hit_recipe(), "Spike pick combo-hit_2: a narrow square that snaps down a fifth onto C6, a sine thump and a noise click, compressed"


def tier_recipe(notes, start=6, gap=0.055, hold=0.55, vib=0.12, whoosh_db=-8, wet=0.22, room=0.9, wave=SQ, top_oct_db=None):
    parts = []
    for i in range(notes):
        last = i == notes - 1
        f = NOTE(step(i * 2 + start), G4)
        parts.append((voice(wave, f, p_duty=0.3, p_env_sustain=0.05, p_env_punch=0.3, p_env_decay=hold if last else 0.16,
                            p_vib_strength=vib if last else 0, p_vib_speed=0.55), i * gap, 0))
        if top_oct_db is not None:
            parts.append((voice(SAW, f * 2, p_env_sustain=0.05, p_env_decay=hold if last else 0.12, p_lpf_freq=0.7), i * gap, top_oct_db))
    whoosh = voice(NOISE, p_base_freq=0.4, p_freq_ramp=0.12, p_env_attack=0.35, p_env_sustain=0.05, p_env_decay=0.3,
                   p_hpf_freq=0.1, p_hpf_ramp=0.18)
    parts.append((whoosh, 0, whoosh_db))
    return reverb(mix(*parts), room, wet)


@recipe("combo:tier3", "pick")
def _():
    return tier_recipe(7), "Spike pick combo-tier3_1: seven square notes up the pentatonic scale 55 ms apart, the last held with vibrato, over a rising noise whoosh, reverb"


def slam_recipe(drop=90, floor=30, room=2.0, wet=0.3, extra=()):
    snap = voice(NOISE, p_base_freq=0.85, p_env_sustain=0.01, p_env_decay=0.12, p_hpf_freq=0.2)
    bomb = voice(NOISE, p_base_freq=0.15, p_freq_ramp=-0.12, p_env_sustain=0.3, p_env_punch=0.4, p_env_decay=0.8,
                 p_pha_offset=0.25, p_pha_ramp=-0.1, p_lpf_freq=0.6, p_lpf_ramp=-0.08)
    sub = voice(SINE, drop, p_freq_limit=P(floor), p_freq_ramp=-0.2, p_env_sustain=0.35, p_env_decay=0.8)
    return reverb(comp(mix((snap, 0, -2), (bomb, 0, 0), (sub, 0, -1), *extra), -20, 4), room, wet)


@recipe("combo:slam", "pick")
def _():
    return slam_recipe(), "Spike pick combo-slam_3: a noise bomb with a flanger sweep and closing low-pass, a sine drop 90 to 30 Hz, a bright snap, compressed, long reverb"


def fanfare_recipe(stabs=3, hold=1.4, octave_db=-9, sparks=18, spark_len=1.6, seed=2, run=0, wet=0.28, room=1.8, vib=0.1):
    parts = []
    t = 0.0
    for i in range(run):  # an optional pentatonic run-up into the stabs
        parts.append((lead(NOTE(step(i), G4), 0.07), t, -4))
        t += 0.045
    for k in range(stabs):
        parts += [(lead(NOTE(s - 5), 0.11, wave=SAW), t, -3) for s in (0, 4, 7)]
        t += 0.16
    t += 0.02 if stabs else 0
    parts += [(lead(NOTE(s), hold, wave=SAW, vib=vib), t, -3) for s in (0, 4, 7)]
    if octave_db is not None:
        parts += [(lead(NOTE(s + 12), hold, wave=SQ, vib=vib), t, octave_db) for s in (0, 4, 7)]
    parts += sparkles(t + 0.1, spark_len, sparks, seed)
    return reverb(comp(shelf(mix(*parts), 4000, 2), -18, 3), room, wet)


@recipe("combo:fanfareLethal", "pick")
def _():
    return fanfare_recipe(), "Spike pick combo-fanfareLethal_2: three saw G-chord stabs, a held C major chord with an octave square layer and vibrato, 18 sparkles, high shelf, compressed, reverb"


# ======================================================================================
# Placing
# ======================================================================================

@recipe("clack", "pick")
def _():
    body = voice(SINE, 196, p_freq_ramp=-0.25, p_env_sustain=0.02, p_env_decay=0.28)
    x = mix((click(0.08, 0.25, seed=4, base=0.7), 0, 0), (click(0.1, 0.15, seed=5, base=0.5), 0.028, -3), (body, 0, -2))
    return comp(x, -16, 3), "Two noise clicks 28 ms apart (the domino tapping down) over a falling sine body, compressed"


@recipe("hum", "pick")
def _():
    a = voice(SINE, C4, p_env_attack=sustain(0.06), p_env_sustain=sustain(0.15), p_env_decay=sustain(0.35), p_vib_strength=0.05, p_vib_speed=0.4)
    b = voice(SQ, C4, p_duty=0.5, p_env_attack=sustain(0.06), p_env_sustain=sustain(0.15), p_env_decay=sustain(0.3), p_lpf_freq=0.3)
    return reverb(mix((a, 0, 0), (b, 0, -8), (voice(SINE, C5, p_env_sustain=sustain(0.1), p_env_decay=sustain(0.3)), 0, -12)), 0.8, 0.2), \
        "A soft sine swell on C4 with a low-passed square under it and a quiet octave, slight vibrato, reverb"


# ======================================================================================
# The cascade
# ======================================================================================

@recipe("tick", "pick")
def _():
    t = voice(SQ, C5, p_duty=0.35, p_env_sustain=0.03, p_env_punch=0.5, p_env_decay=0.4)
    return reverb(mix((t, 0, 0), (click(0.03, seed=6), 0, -12)), 0.4, 0.15), "A tiny square blip on C5 with punch and a faint click, short room"


@recipe("junction", "pick")
def _():
    a = voice(SQ, C4, p_duty=0.3, p_env_sustain=0.04, p_env_punch=0.4, p_env_decay=0.4, p_arp_mod=0.42, p_arp_speed=0.65)
    b = voice(SQ, NOTE(7, C4), p_duty=0.3, p_env_sustain=0.04, p_env_punch=0.4, p_env_decay=0.4, p_arp_mod=0.42, p_arp_speed=0.65)
    return reverb(mix((a, 0, 0), (b, 0.02, -3), (click(0.04, seed=8), 0, -10)), 0.5, 0.18), \
        "Two square notes a fifth apart (C4 and G4), each jumping up an octave, 20 ms apart: the glow splitting"


@recipe("effect:damage", "pick")
def _():
    z = voice(SQ, C5 * 2, p_freq_ramp=-0.25, p_duty=0.3, p_env_sustain=0.04, p_env_punch=0.6, p_env_decay=0.3)
    body = voice(SQ, C4, p_duty=0.5, p_env_sustain=0.04, p_env_decay=0.42, p_lpf_freq=0.5)
    return comp(mix((z, 0, -2), (body, 0, 0), (click(0.07, seed=10), 0, -8)), -16, 4), \
        "A square zap falling from C6 over a filtered square body on C4 and a noise crack, compressed"


@recipe("effect:block", "pick")
def _():
    a = voice(SINE, C5, p_env_sustain=0.02, p_env_punch=0.5, p_env_decay=0.4)
    b = voice(SINE, C5 * 2.76, p_env_sustain=0.01, p_env_decay=0.22)
    k = voice(SQ, C4, p_duty=0.5, p_env_sustain=0.01, p_env_decay=0.12, p_lpf_freq=0.4)
    return reverb(mix((a, 0, 0), (b, 0, -8), (k, 0, -6), (click(0.03, seed=12), 0, -12)), 0.6, 0.2), \
        "A metallic 'ting': a sine on C5 with an inharmonic overtone, over a dull square knock on C4, reverb"


@recipe("effect:amplify", "pick")
def _():
    up = voice(SQ, C4, p_freq_ramp=0.25, p_repeat_speed=0.55, p_duty=0.4, p_env_sustain=sustain(0.12), p_env_decay=0.3)
    return reverb(mix((up, 0, 0), (click(0.04, seed=14), 0, -12)), 0.6, 0.2), "A short square power-up staircase rising from C4, reverb"


@recipe("effect:echo", "pick")
def _():
    p = voice(SINE, C5, p_env_sustain=0.01, p_env_decay=0.25)
    return reverb(echoes(mix((p, 0, 0), (voice(SINE, C5 * 1.5, p_env_sustain=0.01, p_env_decay=0.2), 0, -8)), 0.12, 2, 5), 0.8, 0.25), \
        "A sine ping on C5 with a soft fifth, two repeats 120 ms apart, reverb"


@recipe("effect:spectrum", "pick")
def _():
    parts = [(voice(SQ, NOTE(s, C5), p_duty=0.25, p_env_sustain=0.01, p_env_decay=0.2 if i < 4 else 0.35), i * 0.03, -i * 0.5)
             for i, s in enumerate([0, 4, 7, 12, 16])]
    return reverb(mix(*parts), 0.8, 0.25), "A fast five-note glissando up a C chord from C5, 30 ms apart, reverb"


@recipe("effect:charm", "pick")
def _():
    a = voice(SINE, C5, p_env_sustain=0.02, p_env_decay=0.45)
    b = voice(SINE, NOTE(7, C5), p_env_sustain=0.02, p_env_decay=0.4)
    return reverb(mix((a, 0, 0), (b, 0.05, -3), *sparkles(0.05, 0.3, 4, 22, quiet=10)), 1.0, 0.3), \
        "A two-note bell (C5 then G5) in sines with a few sparkles, roomy reverb"


@recipe("fizzle", "pick")
def _():
    sp = voice(NOISE, p_base_freq=0.6, p_freq_ramp=-0.1, p_repeat_speed=0.6, p_env_sustain=0.2, p_env_decay=0.35, p_lpf_freq=0.5, seed=24)
    dn = voice(SQ, NOTE(4, C4), p_freq_ramp=-0.2, p_duty=0.5, p_env_sustain=0.05, p_env_decay=0.25, p_lpf_freq=0.4)
    return mix((sp, 0, 0), (dn, 0, -4)), "A sputtering noise burst over a filtered square sinking from E4: 'pfft'"


@recipe("lightning", "pick")
def _():
    crack = voice(NOISE, p_base_freq=0.9, p_env_sustain=0.02, p_env_punch=0.8, p_env_decay=0.3, p_hpf_freq=0.2, seed=26)
    zap = voice(SAW, 1800, p_freq_ramp=-0.35, p_env_sustain=0.05, p_env_decay=0.25)
    return reverb(comp(mix((crack, 0, 0), (zap, 0, -4)), -16, 4), 1.0, 0.22), "A bright noise crack with a saw zap diving down under it, compressed, reverb"


@recipe("shake", "pick")
def _():
    rum = voice(NOISE, p_base_freq=0.08, p_env_sustain=0.2, p_env_punch=0.5, p_env_decay=0.45, p_lpf_freq=0.3, seed=28)
    sub = voice(SINE, 70, p_freq_ramp=-0.1, p_env_sustain=0.15, p_env_decay=0.4)
    return comp(mix((rum, 0, 0), (sub, 0, -2)), -18, 4), "A low-passed noise rumble with a 70 Hz sine sub, compressed"


@recipe("slowMotion", "pick")
def _():
    sw = voice(NOISE, p_base_freq=0.5, p_freq_ramp=-0.1, p_env_attack=sustain(0.25), p_env_sustain=sustain(0.1), p_env_decay=sustain(0.25),
               p_lpf_freq=0.6, p_lpf_ramp=-0.1, seed=30)
    tone = voice(SQ, C4, p_freq_ramp=-0.1, p_duty=0.5, p_env_attack=sustain(0.25), p_env_sustain=sustain(0.1), p_env_decay=sustain(0.3), p_lpf_freq=0.3)
    return reverb(mix((sw, 0, 0), (tone, 0, -6)), 1.2, 0.28), "A noise swell that rises then sinks under a closing filter, with a sagging square, reverb"


@recipe("whoosh", "pick")
def _():
    w = voice(NOISE, p_base_freq=0.4, p_env_attack=sustain(0.12), p_env_sustain=sustain(0.05), p_env_decay=sustain(0.2),
              p_hpf_freq=0.05, p_hpf_ramp=0.2, p_lpf_freq=0.5, p_lpf_ramp=0.15, seed=31)
    return reverb(w, 0.6, 0.15), "A noise whoosh whose band sweeps up (high-pass and low-pass both opening)"


@recipe("combo:block", "pick")
def _():
    a = voice(SINE, C5, p_env_sustain=0.03, p_env_punch=0.6, p_env_decay=0.4)
    b = voice(SINE, C5 * 2.76, p_env_sustain=0.01, p_env_decay=0.2)
    body = voice(SINE, 260, p_freq_ramp=-0.35, p_env_sustain=0.03, p_env_decay=0.3)
    return comp(mix((a, 0, 0), (b, 0, -9), (body, 0, -4), (click(), 0, -12)), -16, 4), \
        "The hit's recipe on sines: a metallic ting on C5 (inharmonic overtone), the same thump and click, compressed"


@recipe("combo:tier1", "pick")
def _():
    return tier_recipe(4, start=4, gap=0.06), "The tier 3 recipe with 4 notes from a lower start, 60 ms apart"


@recipe("combo:tier2", "pick")
def _():
    return tier_recipe(5, start=5, gap=0.06), "The tier 3 recipe with 5 notes from a lower start, 60 ms apart"


@recipe("combo:tier4", "pick")
def _():
    return tier_recipe(9, top_oct_db=-8, whoosh_db=-5, room=1.1, wet=0.26), \
        "The tier 3 recipe with 9 notes, an octave saw layer, a louder whoosh and a bigger room"


@recipe("combo:lethal", "pick")
def _():
    fire = voice(NOISE, p_base_freq=0.2, p_freq_ramp=0.1, p_env_attack=sustain(0.15), p_env_sustain=sustain(0.3), p_env_decay=sustain(0.4),
                 p_lpf_freq=0.3, p_lpf_ramp=0.12, seed=33)
    a = voice(SAW, 110, p_freq_ramp=0.18, p_env_attack=sustain(0.1), p_env_sustain=sustain(0.35), p_env_decay=sustain(0.4))
    b = voice(SAW, 165, p_freq_ramp=0.18, p_env_attack=sustain(0.1), p_env_sustain=sustain(0.35), p_env_decay=sustain(0.4))
    return reverb(softclip(mix((fire, 0, 0), (a, 0, -4), (b, 0, -6)), 4), 1.2, 0.25), \
        "Catching fire: a noise roar opening up under two rising saws a fifth apart, saturated, reverb"


@recipe("combo:charge", "pick")
def _():
    s = voice(SQ, C4, p_freq_ramp=0.08, p_repeat_speed=0.0, p_vib_strength=0.3, p_vib_speed=0.6, p_duty=0.4,
              p_env_attack=sustain(2.0), p_env_sustain=sustain(0.3), p_env_decay=sustain(0.1), p_lpf_freq=0.6)
    n = voice(NOISE, p_base_freq=0.5, p_env_attack=sustain(2.0), p_env_sustain=sustain(0.3), p_env_decay=sustain(0.1), p_hpf_freq=0.3, seed=37)
    return mix((s, 0, 0), (n, 0, -10)), "A 2.4 s riser: a square climbing from C4 with fast vibrato (a charging whine) over a faint hiss"


# ======================================================================================
# The finale
# ======================================================================================

@recipe("combo:slamLethal", "pick")
def _():
    crunch = voice(SQ, 220, p_freq_ramp=-0.4, p_env_sustain=0.06, p_env_punch=0.7, p_env_decay=0.3, p_duty=0.6)
    return softclip(slam_recipe(drop=80, floor=25, room=2.6, wet=0.34, extra=((crunch, 0, -5),)), 3), \
        "The slam recipe, bigger: the sub drops 80 to 25 Hz, a square crunch on top, a 2.6 s room, more saturation"


# Fanfares 0-4: the lethal fanfare, smaller, opening with a pentatonic run (3 + 2 x tier notes).
for t, kw in [(0, dict(stabs=0, hold=0.6, octave_db=None, sparks=3, spark_len=0.5, room=1.2, wet=0.22)),
              (1, dict(stabs=0, hold=0.8, octave_db=None, sparks=6, spark_len=0.7, room=1.3, wet=0.24)),
              (2, dict(stabs=1, hold=1.0, octave_db=-12, sparks=9, spark_len=1.0, room=1.5, wet=0.25)),
              (3, dict(stabs=2, hold=1.1, octave_db=-11, sparks=12, spark_len=1.2, room=1.6, wet=0.26)),
              (4, dict(stabs=2, hold=1.25, octave_db=-10, sparks=15, spark_len=1.4, room=1.7, wet=0.27))]:
    @recipe(f"combo:fanfare{t}", "pick")
    def _(kw=kw, t=t):
        return fanfare_recipe(run=3 + 2 * t, **kw), \
            f"The lethal fanfare recipe, smaller: a {3 + 2 * t}-note pentatonic run, {kw['stabs']} stab(s), a {kw['hold']} s chord, {kw['sparks']} sparkles"


@recipe("combo:coin", "pick")
def _():
    c = voice(SQ, C6, p_duty=0.5, p_env_sustain=0.03, p_env_punch=0.4, p_env_decay=0.3, p_arp_mod=0.35, p_arp_speed=0.55)
    return reverb(c, 0.4, 0.12), "A classic square coin blip on C6 that jumps up a fourth, short room"


# ======================================================================================
# Enemy reactions
# ======================================================================================

@recipe("enemyHit", "pick")
def _():
    p = voice(NOISE, p_base_freq=0.35, p_env_sustain=0.02, p_env_punch=0.7, p_env_decay=0.28, p_lpf_freq=0.6, seed=40)
    d = voice(SQ, 220, p_freq_ramp=-0.35, p_duty=0.5, p_env_sustain=0.03, p_env_decay=0.32, p_lpf_freq=0.5)
    return comp(mix((p, 0, 0), (d, 0, -3)), -16, 4), "A noise punch with a square dropping from A3: a 'thwack', compressed"


@recipe("enemyBigHit", "pick")
def _():
    b = voice(NOISE, p_base_freq=0.2, p_env_sustain=0.08, p_env_punch=0.7, p_env_decay=0.4, p_lpf_freq=0.55, seed=42)
    sub = voice(SINE, 100, p_freq_limit=P(40), p_freq_ramp=-0.25, p_env_sustain=0.1, p_env_decay=0.4)
    cr = voice(SQ, 220, p_freq_ramp=-0.4, p_env_sustain=0.04, p_env_punch=0.7, p_env_decay=0.25, p_duty=0.6)
    return reverb(comp(softclip(mix((b, 0, 0), (sub, 0, 0), (cr, 0, -5)), 4), -18, 4), 0.8, 0.18), \
        "A noise boom, a sine sub falling to 40 Hz and a square crunch, saturated, compressed, room"


@recipe("enemyShield", "pick")
def _():
    a = voice(SINE, G4, p_env_sustain=0.02, p_env_punch=0.5, p_env_decay=0.45)
    b = voice(SINE, G4 * 2.76, p_env_sustain=0.01, p_env_decay=0.25)
    k = voice(NOISE, p_base_freq=0.5, p_env_sustain=0.01, p_env_decay=0.1, p_lpf_freq=0.5, seed=45)
    return reverb(mix((a, 0, 0), (b, 0, -6), (k, 0, -4)), 0.8, 0.22), "A low metallic clank: a sine on G4 with an inharmonic overtone and a dull knock, reverb"


@recipe("blockBreak", "pick")
def _():
    cr = voice(NOISE, p_base_freq=0.6, p_env_sustain=0.03, p_env_punch=0.8, p_env_decay=0.25, seed=48)
    t = voice(SINE, C6 * 2, p_freq_ramp=-0.2, p_env_sustain=0.02, p_env_decay=0.35)
    t2 = voice(SINE, C6 * 2.76, p_freq_ramp=-0.25, p_env_sustain=0.01, p_env_decay=0.3)
    return reverb(comp(mix((cr, 0, 0), (t, 0, -4), (t2, 0.01, -6)), -16, 4), 0.9, 0.24), "A noise crunch with two metallic sines sliding down, compressed, reverb"


@recipe("enemyDeath", "pick")
def _():
    ex = voice(NOISE, p_base_freq=0.12, p_freq_ramp=-0.1, p_env_sustain=0.15, p_env_punch=0.6, p_env_decay=0.55, seed=50)
    arp = [(voice(SQ, NOTE(s, C5), p_duty=0.5, p_env_sustain=0.02, p_env_decay=0.18), 0.08 + i * 0.07, -6) for i, s in enumerate([12, 7, 4, 0, -5])]
    return reverb(mix((ex, 0, 0), *arp), 1.2, 0.25), "An 8-bit explosion with a square arpeggio falling down the scale from C6, reverb"


@recipe("bossDeath", "pick")
def _():
    booms = [(voice(NOISE, p_base_freq=0.12 - 0.02 * i, p_freq_ramp=-0.1, p_env_sustain=0.15, p_env_punch=0.6, p_env_decay=0.6, seed=51 + i), 0.35 * i, -2 * i)
             for i in range(3)]
    sweep = voice(SAW, 500, p_freq_ramp=-0.08, p_env_sustain=sustain(0.8), p_env_decay=sustain(0.6), p_lpf_freq=0.5)
    sub = voice(SINE, 60, p_freq_ramp=-0.05, p_env_sustain=sustain(0.6), p_env_decay=sustain(0.8))
    return reverb(comp(softclip(mix(*booms, (sweep, 0, -6), (sub, 0, -2)), 3), -20, 4), 2.4, 0.32), \
        "Three explosions 350 ms apart, each lower, over a long saw dive and a sub, saturated, compressed, 2.4 s room"


@recipe("lunge", "pick")
def _():
    w = voice(NOISE, p_base_freq=0.5, p_env_attack=sustain(0.06), p_env_sustain=sustain(0.04), p_env_decay=sustain(0.12),
              p_hpf_freq=0.1, p_hpf_ramp=0.25, seed=56)
    s = voice(SAW, 150, p_freq_ramp=0.3, p_env_attack=sustain(0.06), p_env_sustain=sustain(0.04), p_env_decay=sustain(0.1), p_lpf_freq=0.5)
    return mix((w, 0, 0), (s, 0, -8)), "A fast rising noise whoosh with a growling saw sweeping up under it"


@recipe("impact", "pick")
def _():
    th = voice(NOISE, p_base_freq=0.15, p_env_sustain=0.03, p_env_punch=0.8, p_env_decay=0.3, p_lpf_freq=0.5, seed=58)
    cr = voice(SQ, 165, p_freq_ramp=-0.35, p_duty=0.6, p_env_sustain=0.03, p_env_punch=0.6, p_env_decay=0.25)
    return comp(softclip(mix((th, 0, 0), (cr, 0, -4)), 4), -18, 4), "A heavy noise thud with a low square crunch, saturated, compressed"


@recipe("heal", "pick")
def _():
    notes = [(voice(SINE, NOTE(s), p_env_attack=0.05, p_env_sustain=0.05, p_env_decay=0.4), i * 0.08, -1) for i, s in enumerate([0, 4, 7, 12])]
    return reverb(mix(*notes), 1.2, 0.3), "A soft sine arpeggio rising C5, E5, G5, C6, reverb"


# ======================================================================================
# Menus and the run (round 2, #252)
# ======================================================================================

@recipe("click", "A")
def _():
    t = voice(SINE, NOTE(7), p_freq_ramp=-0.1, p_env_sustain=0.01, p_env_decay=sustain(0.05))
    return mix((t, 0, 0), (click(0.04, 0.4, 61), 0, -14)), "A soft sine tock on G5 that dips slightly, with a faint click on top"


@recipe("click", "B")
def _():
    t = voice(SQ, C5, p_duty=0.5, p_env_sustain=0.005, p_env_decay=sustain(0.035), p_lpf_freq=0.35)
    return mix((t, 0, 0), (click(0.03, 0.5, 62), 0, -12)), "A muffled square tick on C5 (low-passed, like a wooden key), with a faint click"


@recipe("voteRoll", "A")
def _():
    t = voice(SINE, C6, p_env_sustain=0.01, p_env_decay=sustain(0.045))
    return reverb(t, 0.25, 0.08), "A short sine pip on C6, a touch of room"


@recipe("voteRoll", "B")
def _():
    t = voice(SQ, NOTE(4, C6), p_duty=0.25, p_env_sustain=0.005, p_env_decay=sustain(0.03), p_lpf_freq=0.45)
    return mix((t, 0, 0), (click(0.02, 0.6, 63), 0, -16)), "A tiny low-passed square blip on E6, like a roulette tick"


def coin(f, decay=0.3):
    return voice(SQ, f, p_duty=0.5, p_env_sustain=0.03, p_env_punch=0.4, p_env_decay=decay, p_arp_mod=0.35, p_arp_speed=0.55)


@recipe("coins", "A")
def _():
    return reverb(mix((coin(C6), 0, 0), (coin(NOTE(7, C6)), 0.07, -2), *sparkles(0.1, 0.3, 3, 64, 14)), 0.5, 0.14),         "Two combo:coin blips, C6 then G6, with a few sparkles, short room"


@recipe("coins", "B")
def _():
    notes = [(coin(NOTE(s, C6), 0.22), i * 0.045, -i) for i, s in enumerate([0, 4, 7, 12])]
    return reverb(mix(*notes), 0.6, 0.16), "Four combo:coin blips running up C6, E6, G6, C7, short room"


@recipe("buy", "A")
def _():
    chord = [(voice(SINE, NOTE(s), p_env_attack=0.02, p_env_sustain=sustain(0.12), p_env_decay=sustain(0.35)), 0.04, -6) for s in (0, 4, 7)]
    return reverb(mix((coin(NOTE(7, C6)), 0, 0), *chord), 0.8, 0.2), "A coin blip on G6 over a soft sine C major chord, reverb"


@recipe("buy", "B")
def _():
    a = voice(SINE, NOTE(7), p_env_sustain=0.03, p_env_punch=0.3, p_env_decay=0.35)
    b = voice(SINE, C6, p_env_sustain=0.05, p_env_punch=0.3, p_env_decay=0.45)
    return reverb(mix((a, 0, 0), (b, 0.09, 0), *sparkles(0.12, 0.35, 4, 65, 12)), 0.9, 0.22),         "A two-note sine chime rising G5 to C6, with a few sparkles, reverb"


@recipe("rest", "A")
def _():
    chord = [(voice(SINE, NOTE(s, C4), p_env_attack=sustain(0.15), p_env_sustain=sustain(0.5), p_env_decay=sustain(0.8),
                    p_vib_strength=0.05, p_vib_speed=0.3), 0, -2) for s in (0, 4, 7, 12)]
    return reverb(lp(mix(*chord), 3000), 1.8, 0.3), "A warm sine chord, C4 E4 G4 C5, swelling in slowly with a gentle vibrato, low-passed, long reverb"


@recipe("rest", "B")
def _():
    notes = [(voice(SINE, NOTE(s, C4), p_env_attack=0.05, p_env_sustain=sustain(0.2), p_env_decay=sustain(0.9)), i * 0.14, -1 - i)
             for i, s in enumerate([0, 7, 12, 16])]
    return reverb(lp(mix(*notes), 3000), 2.0, 0.32), "A slow sine arpeggio, C4 G4 C5 E5, each note ringing on, low-passed, long reverb"


# How the picker groups the cues.
GROUPS = {
    "Placing": ["clack", "hum"],
    "The cascade": ["tick", "junction", "effect:damage", "effect:block", "effect:amplify", "effect:echo", "effect:spectrum",
                    "effect:charm", "fizzle", "lightning", "shake", "slowMotion", "whoosh", "combo:hit", "combo:block",
                    "combo:tier1", "combo:tier2", "combo:tier3", "combo:tier4", "combo:lethal"],
    "Enemy reactions": ["lunge", "impact", "enemyHit", "enemyBigHit", "enemyShield", "blockBreak", "heal", "enemyDeath", "bossDeath"],
    "The finale": ["combo:charge", "combo:slam", "combo:slamLethal", "combo:fanfare0", "combo:fanfare1", "combo:fanfare2",
                   "combo:fanfare3", "combo:fanfare4", "combo:fanfareLethal", "combo:coin"],
    "Menus and the run": ["click", "voteRoll", "coins", "buy", "rest"],
}
