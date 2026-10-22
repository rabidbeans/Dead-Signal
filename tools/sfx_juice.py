"""Sounds for the juice round (2026-10-22): hit markers, head pops, streaks, the supply drop, pickups, the mutants.

    cd tools && /home/user/tools/bpyenv/bin/python sfx_juice.py

hitmark    a dry little tick when a bullet lands
killmark   a heavier double tick and a thunk when it kills
headpop    a wet pop and a spatter
streak     a kill-streak stinger: a low hit and a metallic ring rising
flare      a road flare struck and hissing
chute      a parachute crate thumping down on the asphalt
coins      picking up a bundle of cash: paper and a couple of coins
mutant     a mutant's snarl: distorted, pitched up and down
"""
import numpy as np
from sfx import SR, t, env_exp, bp, lp, hp, pad, mixl, sat, reverb, write, burst, modes, at, rasp


def hitmark():
    x = modes([(3200, 0.012, 1), (5200, 0.008, 0.6), (7600, 0.005, 0.4)], 0.05, seed=3)
    n = hp(np.random.RandomState(1).randn(int(0.02 * SR)), 4000) * env_exp(0.02, 0.003, 0.0002) * 0.4
    return mixl(x, n)


def killmark():
    a = modes([(2400, 0.014, 1), (3900, 0.01, 0.7), (6100, 0.007, 0.4)], 0.06, seed=4)
    b = modes([(1800, 0.02, 1), (2900, 0.014, 0.6)], 0.07, seed=5)
    tt = t(0.14)
    f = 70 + 160 * np.exp(-tt / 0.02)
    thunk = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(0.14, 0.04, 0.001)
    x = np.zeros(int(0.2 * SR))
    x = at(x, a, 0)
    x = at(x, b * 0.8, 0.045)
    x = at(x, thunk * 0.8, 0)
    return x


def headpop():
    r = np.random.RandomState(7)
    d = 0.7
    x = np.zeros(int(d * SR))
    tt = t(0.12)
    f = 90 + 300 * np.exp(-tt / 0.012)
    pop = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(0.12, 0.03, 0.0005)
    wet = bp(r.randn(int(0.25 * SR)), 300, 2400) * env_exp(0.25, 0.06, 0.001)
    x = at(x, sat(pop * 2, 2) * 0.9, 0)
    x = at(x, sat(wet * 2.5, 2) * 0.8, 0.005)
    # the spatter landing
    for k in range(18):
        when = 0.12 + r.rand() ** 1.5 * 0.45
        drop = bp(r.randn(int(0.03 * SR)), 900 + r.rand() * 2000, 4000 + r.rand() * 2000) * env_exp(0.03, 0.006, 0.0005)
        x = at(x, drop * (0.3 + r.rand() * 0.3), when)
    return reverb(x, rt=0.6, wet=0.15, bright=3000, seed=7)[: int(d * SR)]


def streak():
    r = np.random.RandomState(8)
    d = 1.6
    tt = t(d)
    hit = np.sin(2 * np.pi * np.cumsum(45 + 80 * np.exp(-tt / 0.05)) / SR) * env_exp(d, 0.25, 0.002)
    ring = sum(np.sin(2 * np.pi * f * (1 + 0.06 * tt) * tt + i) * a for i, (f, a) in enumerate(((622, 1), (933, 0.6), (1244, 0.4), (1866, 0.2))))
    ring *= np.minimum(1, tt / 0.03) * np.exp(-tt / 0.5)
    noise = bp(r.randn(len(tt)), 2000, 6000) * env_exp(d, 0.08, 0.001) * 0.4
    x = mixl(sat(hit * 1.6, 2) * 0.9, ring * 0.35, noise)
    return reverb(x, rt=1.4, wet=0.3, bright=3500, seed=8)[: int(d * SR)]


def flare():
    r = np.random.RandomState(9)
    d = 3.0
    tt = t(d)
    strike = hp(r.randn(int(0.15 * SR)), 2500) * env_exp(0.15, 0.04, 0.001)
    hiss = bp(r.randn(len(tt)), 1500, 7000) * np.minimum(1, tt / 0.15) * (0.8 + 0.2 * np.sin(2 * np.pi * 11 * tt))
    hiss *= np.exp(-np.maximum(0, tt - 2.2) / 0.4)
    pops = np.zeros(len(tt))
    for k in range(25):
        when = 0.2 + r.rand() * 2.4
        pops = at(pops, bp(r.randn(int(0.01 * SR)), 2000, 8000) * env_exp(0.01, 0.002, 0.0002) * 0.6, when)
    return mixl(sat(strike * 2, 2), hiss * 0.5, pops)


def chute():
    r = np.random.RandomState(10)
    d = 1.4
    x = np.zeros(int(d * SR))
    tt = t(0.3)
    f = 45 + 90 * np.exp(-tt / 0.04)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(0.3, 0.09, 0.001)
    crack = bp(r.randn(int(0.12 * SR)), 300, 3000) * env_exp(0.12, 0.03, 0.0005)
    rattle = modes([(420, 0.12, 1), (760, 0.08, 0.6), (1300, 0.05, 0.4), (2200, 0.03, 0.3)], 0.4, seed=10)
    x = at(x, sat(boom * 2, 2), 0)
    x = at(x, sat(crack * 2, 2) * 0.7, 0)
    x = at(x, rattle * 0.5, 0.01)
    x = at(x, rattle * 0.25, 0.18)
    return reverb(x, rt=1.0, wet=0.2, bright=2500, seed=10)[: int(d * SR)]


def coins():
    r = np.random.RandomState(12)
    d = 0.6
    x = np.zeros(int(d * SR))
    paper = bp(r.randn(int(0.18 * SR)), 1500, 6000) * env_exp(0.18, 0.05, 0.003) * 0.5
    x = at(x, paper, 0)
    for k, when in enumerate((0.03, 0.09, 0.16)):
        f = 2600 + r.rand() * 1500
        c = modes([(f, 0.08, 1), (f * 2.76, 0.05, 0.5), (f * 5.4, 0.03, 0.3)], 0.25, seed=k + 20)
        x = at(x, c * (0.6 - k * 0.12), when)
    return x


def mutant():
    r = np.random.RandomState(13)
    d = 1.1
    tt = t(d)
    f0 = 110 + 60 * np.sin(2 * np.pi * 1.3 * tt) + 40 * r.randn(len(tt)).cumsum() / SR * 30
    ph = 2 * np.pi * np.cumsum(np.abs(f0)) / SR
    src = np.sign(np.sin(ph)) * 0.5 + 0.5 * np.sin(2 * ph)
    src += bp(r.randn(len(tt)), 400, 3000) * 0.8
    x = bp(src, 250, 2600) * np.minimum(1, tt / 0.05) * np.exp(-np.maximum(0, tt - 0.7) / 0.2)
    x = sat(x * 3, 3)
    return reverb(x, rt=0.8, wet=0.2, bright=3000, seed=13)[: int(d * SR)]


if __name__ == '__main__':
    write('hitmark', hitmark(), peak=0.5)
    write('killmark', killmark(), peak=0.7)
    write('headpop', headpop(), peak=0.85)
    write('streak', streak(), peak=0.75)
    write('flare', flare(), peak=0.7)
    write('chute', chute(), peak=0.9)
    write('coins', coins(), peak=0.65)
    write('mutant', mutant(), peak=0.8)
