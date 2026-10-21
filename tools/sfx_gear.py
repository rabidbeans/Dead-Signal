"""Sounds for the gear round (2026-10-21): suppressed shots, throwables, the crate.

    cd tools && python sfx_gear.py        (run with the bpy venv's python: scipy/numpy there)

sup0..2   a suppressed shot: the action's clack and a muffled 'thup', almost no tail
throw     a throw's whoosh
glass     a bottle shattering on the street
ignite    petrol catching: a deep 'fwoomp' and the roar settling
beep      a pipe bomb's timer beep (short, square-ish, a little filtered)
crate     a weapon crate: two latches snapping, the lid creaking up
"""
import numpy as np
from sfx import SR, t, env_exp, bp, lp, hp, pad, mixl, sat, reverb, write, burst, modes, at, rasp


def sup(v):
    r = np.random.RandomState(900 + v)
    p = 1 + (r.rand() - 0.5) * 0.1
    d = 0.5
    thup = bp(r.randn(int(0.09 * SR)), 260 * p, 1300 * p) * env_exp(0.09, 0.018, 0.0008)
    tt = t(0.1)
    f = 80 + 120 * np.exp(-tt / 0.012)
    punch = np.sin(2 * np.pi * np.cumsum(f * p) / SR) * env_exp(0.1, 0.025, 0.001)
    clack = modes([(2600 * p, 0.012, 1), (4100 * p, 0.009, 0.7), (6400 * p, 0.006, 0.5)], 0.06, seed=v)
    hiss = hp(r.randn(int(0.12 * SR)), 3500) * env_exp(0.12, 0.03, 0.001) * 0.25
    x = mixl(sat(thup * 2.5, 2) * 0.9, punch * 0.7, at(np.zeros(1), clack * 0.35, 0.012), hiss)
    x = reverb(pad(x, int(d * SR)), rt=0.5, wet=0.12, bright=2500, seed=v)
    return x[: int(d * SR)] * np.minimum(1, np.linspace(20, 0, int(d * SR)))


def whoosh():
    r = np.random.RandomState(11)
    d = 0.45
    tt = t(d)
    env = np.sin(np.pi * np.clip(tt / d, 0, 1)) ** 2
    x = bp(r.randn(len(tt)), 400, 2600) * env
    x *= 0.7 + 0.3 * np.sin(2 * np.pi * (8 + 30 * tt / d) * tt)
    return x


def glass():
    r = np.random.RandomState(21)
    d = 1.4
    x = np.zeros(int(d * SR))
    crash = hp(r.randn(int(0.25 * SR)), 2500) * env_exp(0.25, 0.05, 0.0003)
    x = at(x, sat(crash * 3, 2) * 0.8, 0)
    for k in range(60):
        when = r.rand() ** 1.8 * 0.9
        f = 3000 + r.rand() * 6000
        tink = modes([(f, 0.03 + r.rand() * 0.06, 1), (f * 1.47, 0.02, 0.5), (f * 2.3, 0.015, 0.3)], 0.15, seed=k)
        x = at(x, tink * (0.5 - when * 0.4) * (0.4 + r.rand() * 0.6), when)
    thud = bp(r.randn(int(0.08 * SR)), 150, 900) * env_exp(0.08, 0.02, 0.001)
    x = mixl(x, thud * 0.6)
    return reverb(x, rt=0.9, wet=0.2, bright=6000, seed=21)[: int(d * SR)]


def ignite():
    r = np.random.RandomState(31)
    d = 2.4
    tt = t(d)
    f = 45 + 70 * np.exp(-tt / 0.15)
    whomp = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, 0.35, 0.03)
    roar = lp(r.randn(len(tt)), 900) * (np.clip(tt / 0.15, 0, 1) * (0.55 + 0.45 * np.exp(-tt / 0.6)))
    crackle = np.zeros(len(tt))
    for k in range(120):
        when = r.rand() * (d - 0.05)
        c = hp(r.randn(int(0.006 * SR)), 2000) * env_exp(0.006, 0.0015, 0.0001)
        crackle = at(crackle, c * (0.2 + r.rand() * 0.5), when)[: len(tt)]
    x = mixl(sat(whomp * 1.8, 2) * 0.9, roar * 0.8, crackle * 0.6)
    x *= np.minimum(1, (d - tt) * 3)
    return reverb(x, rt=1.2, wet=0.2, bright=2500, seed=31)[: int(d * SR)]


def beep():
    d = 0.12
    tt = t(d)
    x = np.sign(np.sin(2 * np.pi * 2350 * tt)) * 0.5 + np.sin(2 * np.pi * 2350 * tt) * 0.5
    x = lp(x, 6000) * np.minimum(1, tt / 0.003) * np.minimum(1, (d - tt) / 0.01)
    return x


def crate():
    r = np.random.RandomState(41)
    d = 1.8
    x = np.zeros(int(d * SR))
    for k, when in enumerate((0.0, 0.18)):
        latch = mixl(modes([(1800 + k * 200, 0.02, 1), (3100, 0.012, 0.6), (5200, 0.008, 0.4)], 0.08, seed=k), burst(0.03, 1500, 7000, 0.006, seed=k) * 0.8)
        x = at(x, latch * 0.8, when)
    creak = rasp(0.9, 300, 1400, 5, rise=True, ridges=37) * 0.5
    x = at(x, creak, 0.45)
    thunk = mixl(modes([(120, 0.12, 1), (260, 0.08, 0.5)], 0.3, seed=9), bp(r.randn(int(0.1 * SR)), 100, 800) * env_exp(0.1, 0.03) * 0.6)
    x = at(x, thunk * 0.9, 1.35)
    return reverb(x, rt=0.8, wet=0.18, bright=3000, seed=41)[: int(d * SR)]


if __name__ == '__main__':
    for v in range(3):
        write(f'sup{v}', sup(v), peak=0.75)
    write('throw', whoosh(), peak=0.6)
    write('glass', glass(), peak=0.8)
    write('ignite', ignite(), peak=0.85)
    write('beep', beep(), peak=0.45)
    write('crate', crate(), peak=0.8)
