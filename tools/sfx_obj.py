"""Round 8 sounds: the level objectives and hazards.

    cd tools && python sfx_obj.py        (re-uses the helpers in sfx.py; run with the bpy venv's python)

boom0/boom1   an explosion (gas tank, artillery shell): a saturated low thump, a broadband blast, debris, rumble
incoming      an artillery shell's whistle coming down (1.5 s, falling pitch)
power         breakers thrown: a heavy relay clunk, a zap, a rising mains hum
zap           a short electrical crackle (a breaker charging)
engine        a diesel bulldozer idling under load (seamless loop)
squelch       a wet, pulsing nest being shot
burst         a nest tearing open
"""
import numpy as np
from sfx import SR, t, env_exp, bp, lp, hp, pad, mixl, sat, reverb, write, burst, modes, at


def boom(v):
    r = np.random.RandomState(800 + v)
    d = 3.2
    thump_f = 38 + 60 * np.exp(-t(1.2) / 0.08)
    thump = np.sin(2 * np.pi * np.cumsum(thump_f) / SR) * env_exp(1.2, 0.35, 0.002)
    blast = lp(r.randn(int(1.4 * SR)), 2200) * env_exp(1.4, 0.18, 0.001)
    crack = hp(r.randn(int(0.05 * SR)), 1500) * env_exp(0.05, 0.01, 0.0002)
    debris = np.zeros(int(d * SR))
    for k in range(40):
        when = 0.08 + r.rand() ** 2 * 1.6
        ln = 0.03 + r.rand() * 0.05
        click = bp(r.randn(int(ln * SR)), 600 + r.rand() * 2500, 4000 + r.rand() * 3000) * env_exp(ln, ln / 5) * (0.5 - when * 0.2)
        debris = at(debris, click, when)
    rum = lp(r.randn(int(d * SR)), 120) * env_exp(d, 0.9, 0.05) * 1.2
    x = mixl(sat(thump * 2.2, 2) * 1.0, sat(blast * 3, 2) * 0.8, crack * 0.6, debris * 0.35, rum)
    x = reverb(x, rt=2.2, wet=0.32, bright=1800, seed=v)
    return x[: int(d * SR)] * np.minimum(1, np.linspace(25, 0, int(d * SR)))


def incoming():
    d = 1.5
    tt = t(d)
    f = 1700 * np.exp(-tt / 1.6) + 380
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = np.sin(ph) * (0.25 + 0.75 * (tt / d)) * np.minimum(1, (d - tt) * 30)
    air = bp(np.random.RandomState(5).randn(len(tt)), 800, 3000) * 0.12 * (tt / d)
    return reverb(mixl(tone * 0.6, air), rt=1.0, wet=0.25, bright=4000, seed=9)


def power():
    r = np.random.RandomState(31)
    d = 2.6
    clunk = modes([(140, 0.08, 1.0), (310, 0.05, 0.6), (920, 0.03, 0.4)], 0.4, seed=3)
    clunk = mixl(clunk, burst(0.06, 200, 3000, 0.012, seed=4) * 0.8)
    zap = hp(r.randn(int(0.35 * SR)), 2000) * env_exp(0.35, 0.06) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 45 * t(0.35))))
    tt = t(d)
    hum_amp = np.clip((tt - 0.15) / 1.2, 0, 1) * np.minimum(1, (d - tt) * 3)
    hum = (np.sin(2 * np.pi * 60 * tt) * 0.6 + np.sin(2 * np.pi * 120 * tt) * 0.5 + np.sin(2 * np.pi * 180 * tt) * 0.25) * hum_amp
    hum = sat(hum * 1.6, 1.5) * (1 + 0.08 * np.sin(2 * np.pi * 3 * tt))
    x = mixl(clunk * 1.0, at(np.zeros(int(d * SR)), zap * 0.5, 0.05), hum * 0.4)
    return reverb(x, rt=0.9, wet=0.2, bright=3000, seed=31)


def zap():
    r = np.random.RandomState(77)
    d = 0.4
    x = hp(r.randn(int(d * SR)), 1800) * env_exp(d, 0.08)
    gate = (np.sin(2 * np.pi * 52 * t(d)) > -0.2).astype(float)
    return reverb(x * gate * 0.8, rt=0.4, wet=0.15, seed=77)


def engine(d=4.0):
    r = np.random.RandomState(12)
    tt = t(d)
    fire_hz = 24.0                      # an exact number of pulses in the loop
    pulses = np.zeros(len(tt))
    n = int(d * fire_hz)
    for k in range(n):
        ln = 0.035
        p = lp(r.randn(int(ln * SR)), 400) * env_exp(ln, 0.012, 0.001) * (0.8 + 0.4 * r.rand())
        pulses = at(pulses, p, k / fire_hz)
    pulses = pulses[: len(tt)]
    rumble = lp(r.randn(len(tt)), 90) * 0.8
    clatter = bp(r.randn(len(tt)), 1200, 3500) * 0.06 * (1 + np.sin(2 * np.pi * fire_hz / 2 * tt))
    whine = np.sin(2 * np.pi * 410 * tt + 0.3 * np.sin(2 * np.pi * 0.5 * tt)) * 0.03
    x = mixl(sat(pulses * 3, 2) * 1.0, rumble, clatter, whine)
    # seamless: crossfade the tail into the head
    k = int(0.3 * SR)
    x[:k] = x[:k] * np.linspace(0, 1, k) + x[-k:] * np.linspace(1, 0, k)
    return x[: len(tt) - k]


def squelch(v):
    r = np.random.RandomState(900 + v)
    d = 0.5
    wet = bp(r.randn(int(d * SR)), 200, 1400) * env_exp(d, 0.09, 0.004)
    gl = np.sin(2 * np.pi * np.cumsum(180 + 120 * np.sin(2 * np.pi * 9 * t(d))) / SR) * env_exp(d, 0.12) * 0.4
    return reverb(mixl(wet, gl), rt=0.5, wet=0.15, seed=v)


def burst_nest():
    r = np.random.RandomState(55)
    d = 1.8
    tear = bp(r.randn(int(0.6 * SR)), 150, 2500) * env_exp(0.6, 0.15, 0.003)
    thump = np.sin(2 * np.pi * np.cumsum(60 + 80 * np.exp(-t(0.8) / 0.1)) / SR) * env_exp(0.8, 0.2)
    splats = np.zeros(int(d * SR))
    for k in range(18):
        when = 0.15 + r.rand() * 1.0
        ln = 0.06 + r.rand() * 0.08
        splats = at(splats, bp(r.randn(int(ln * SR)), 300, 1800) * env_exp(ln, ln / 4) * 0.4, when)
    howl = np.sin(2 * np.pi * np.cumsum(220 * np.exp(-t(1.2) / 0.6) + 80) / SR) * env_exp(1.2, 0.4, 0.05) * 0.25
    x = mixl(sat(tear * 2, 1.5), thump, splats, howl)
    return reverb(x, rt=1.4, wet=0.3, bright=2000, seed=55)


if __name__ == '__main__':
    write('boom0', boom(0), peak=0.95)
    write('boom1', boom(1), peak=0.95)
    write('incoming', incoming(), peak=0.7)
    write('power', power(), peak=0.85)
    write('zap', zap(), peak=0.6)
    write('engine', engine(), peak=0.8)
    write('squelch0', squelch(0), peak=0.7)
    write('squelch1', squelch(1), peak=0.7)
    write('burst', burst_nest(), peak=0.9)
