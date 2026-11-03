"""Score for the Formica FX-6 console film.

The music is the Dynastes RB-1 film's bed, regenerated at this film's length rather than looped: the same chords
(Fmaj9, Dm9, Bbmaj7, C6sus), the same 90 bpm, motif, voices and levels, so there is no seam. On top, accents on this
film's own timeline:

- footfalls for the walk in and the scurry out, from the same gait integral the legs walk on (plan.js),
- a click on each operator action, a whoosh under each camera move,
- for each assembly: a servo as it opens and a rising pop for every component as it separates (the eye's eleven
  layers get eleven), a lock click as it closes,
- a riser into the full teardown, the impact, scattering parts, locking clicks as it rebuilds, a chime as it leaves.

    python run_sfx.py ant/score.py

Every time comes from ant-film/timeline.json; the speed profile and gait constants mirror plan.js and kin.js.
"""

import math
import os

from sfx.score_kit import airy, bed, chords, hz, motor, thud
from sfx.synth import chime, click, impact, pop, riser, whoosh

TIMELINE = "../ant-film/timeline.json"
OUT = os.path.join(os.environ.get("TEARDOWN_OUT", "teardown-out"), "ant-score.wav")
TARGET_LUFS = -14.0
SEED = 17

# the RB-1 bed, unchanged
CHORDS = chords("Fmaj9:F2 C3 E3 G3 A3/F1", "Dm9:D2 A2 C3 E3 F3/D1", "Bbmaj7:Bb1 F2 A2 D3/Bb0", "C6sus:C2 F2 G2 A2 D3/C1")
MOTIF = [(0.5, hz("C5")), (1.5, hz("A4")), (2.5, hz("G4"))]

# kin.js / plan.js
V_MAX, STRIDE, DUTY, EXIT_V = 0.14, 0.12, 0.55, 0.62
SECTIONS = {"antenna": 6, "eye": 11, "jaw": 8, "thorax": 7, "abdomen": 9, "legs": 9}


def smoother(x):
    u = min(1.0, max(0.0, x))
    return u * u * u * (u * (u * 6 - 15) + 10)


def ramp(ev, t):
    return smoother((t - ev["t"]) / ev["duration"])


def touchdowns(E, dur):
    speed = lambda t: V_MAX * (1 - ramp(E["stop"], t)) + EXIT_V * ramp(E["walkout"], t)
    dt = 1 / 480
    ph, t, out, prev = 0.0, 0.0, [], 0
    while t < dur:
        v = speed(t)
        ph += v * DUTY / STRIDE * dt
        k = math.floor(ph * 2)
        if k != prev and v > V_MAX * 0.3:
            out.append((t, k % 2, v))
        prev = k
        t += dt
    return out


def score(mix, tl):
    dur = tl["duration"]
    O, E = tl["ops"], tl["events"]

    left, right, low, drums = bed(dur, 90, CHORDS, MOTIF, motif_voice="epiano", kicks=(0, 2.5), snares=(), hats=8, swing=0.0, keys_vel=0.7, keys_lp=3400)
    mix.put_stereo(0, left, right, 0.12)
    mix.put(0, low, 0.13)
    mix.put(0, drums, 0.045)

    for t, side, v in touchdowns(E, dur):
        g = 0.035 if v < 0.3 else 0.028
        mix.put(t, thud(170, 0.016, 0.12), g, -0.25 if side == 0 else 0.25)
        mix.put(t + 0.004, click(1300, 0.016), g * 0.3, -0.2 if side == 0 else 0.2)

    for t in O.values():
        mix.put(t, click(2400, 0.025), 0.06)
        mix.put(t + 0.1, whoosh(1.3, 380, 1700, peak=0.4), 0.028)

    # each assembly: the servo, one pop per component rising in pitch, the lock as it closes
    for s, n in SECTIONS.items():
        op, cl = E[s + "Open"], E[s + "Close"]
        mix.put(op["t"], motor(op["duration"] + 0.1, f0=200, grit_hz=1800, wobble=19), 0.016, 0.1)
        for i in range(n):
            tt = op["t"] + op["duration"] * (0.12 + 0.75 * i / max(1, n - 1))
            mix.put(tt, pop(700 + 70 * i, 1100 + 90 * i, 0.12), 0.022, -0.5 + i / max(1, n - 1))
        mix.put(cl["t"], whoosh(cl["duration"] + 0.1, 1800, 500, peak=0.7), 0.022)
        mix.put(cl["t"] + cl["duration"], click(1700, 0.03), 0.045)
        mix.put(cl["t"] + cl["duration"], thud(120, 0.025, 0.18), 0.03)

    # the full teardown
    burst, rb = E["burst"], E["rebuild"]
    mix.put(burst["t"] - 1.1, riser(1.1, 300, 4200), 0.035)
    mix.put(burst["t"], impact(1.2), 0.12)
    mix.put(burst["t"], whoosh(1.0, 2000, 300, peak=0.2), 0.04)
    for k in range(12):
        tt = burst["t"] + 0.1 + k * 0.08 + (k % 3) * 0.02
        mix.put(tt, pop(900 + 110 * k, 1400 + 130 * k, 0.12), 0.016, -0.6 + 0.11 * k)
    mix.put(rb["t"], whoosh(rb["duration"], 2400, 450, peak=0.75), 0.04)
    for k in range(7):
        mix.put(rb["t"] + 0.35 + k * 0.09, click(1500 + 160 * k, 0.03), 0.045, -0.4 + 0.13 * k)

    # the scurry out, and the chime as the stage empties
    mix.put(E["walkout"]["t"], airy(1.6, 500, 1800, 0.6), 0.022)
    mix.put(dur - 1.1, chime([hz("F4"), hz("A4"), hz("C5"), hz("E5")], 1.6, 0.6), 0.05)
