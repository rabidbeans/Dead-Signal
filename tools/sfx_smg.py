"""Round 5 sounds: the SMG-9 (four variants), the weapon swap, and the safehouse shop's
buy / deny cues.   python tools/sfx_smg.py   (re-uses the helpers in sfx.py)"""
import numpy as np
import sfx
from sfx import SR, t, env_exp, bp, lp, hp, pad, mixl, sat, reverb, write, burst


def smg(v):
    r = np.random.RandomState(300 + v)
    pitch = 1 + (r.rand() - 0.5) * 0.10
    d = 0.9
    # a lighter, snappier round than the pistol: short crack, a thinner body, a tight punch, bolt clack
    crack = hp(r.randn(int(0.009 * SR)) * env_exp(0.009, 0.0018, 0.0002), 1500)
    crack = sat(crack * 4, 3)
    body = bp(r.randn(int(0.09 * SR)), 700 * pitch, 3800 * pitch) * env_exp(0.09, 0.02, 0.0006)
    body2 = bp(r.randn(int(0.07 * SR)), 220, 1100) * env_exp(0.07, 0.025, 0.001)
    tt = t(0.1)
    f = 90 + 170 * np.exp(-tt / 0.012)
    ph = 2 * np.pi * np.cumsum(f * pitch) / SR
    punch = sat(np.sin(ph) * env_exp(0.1, 0.03, 0.001) * 2.0, 2.5)
    mech = np.zeros(int(0.05 * SR))
    for fr, g in ((3600, 1), (5200, 0.6), (2600, 0.5)):
        mech += np.sin(2 * np.pi * fr * pitch * t(0.05)) * env_exp(0.05, 0.004, 0.0003) * g
    mech = np.concatenate([np.zeros(int(0.014 * SR)), mech * 0.16])
    dry = pad(mixl(crack * 0.9, body, body2 * 0.55, punch * 0.8, mech), int(d * SR))
    slap = np.zeros_like(dry)
    for dt_, g in ((0.09, 0.26), (0.17, 0.16), (0.27, 0.09)):
        k = int(dt_ * SR)
        slap[k:] += lp(dry, 2500)[: len(dry) - k] * g
    rumble = lp(r.randn(len(dry)), 380) * env_exp(d, 0.22, 0.02) * 0.18
    out = reverb(mixl(dry, slap, rumble), rt=1.0, wet=0.2, bright=2800, seed=v + 20)
    return out[: int(d * SR)] * np.minimum(1, np.linspace(30, 0, int(d * SR)))


def swap():
    # a gun coming up: a strap rustle, a metal knock, a bolt click
    r = np.random.RandomState(7)
    rustle = bp(r.randn(int(0.12 * SR)), 900, 4200) * env_exp(0.12, 0.05, 0.01) * 0.5
    knock = bp(r.randn(int(0.05 * SR)), 300, 1800) * env_exp(0.05, 0.012, 0.0005)
    click = burst(0.04, 2800, 6500, 0.006, seed=5)
    return mixl(rustle, np.concatenate([np.zeros(int(0.07 * SR)), knock * 0.9]), np.concatenate([np.zeros(int(0.12 * SR)), click * 0.8]))


def buy():
    # two bright coin-like partials, a till
    d = 0.5
    x = np.zeros(int(d * SR))
    for k, (f, when, g) in enumerate(((1760, 0.0, 1.0), (2349, 0.07, 0.9), (3136, 0.14, 0.7))):
        n = int((d - when) * SR)
        tone = (np.sin(2 * np.pi * f * t(d - when)) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t(d - when))) * env_exp(d - when, 0.11, 0.001)
        x[int(when * SR):int(when * SR) + n] += tone[:n] * g
    return mixl(x * 0.5, burst(0.03, 3000, 8000, 0.006, seed=2) * 0.4)


def deny():
    d = 0.22
    x = np.sin(2 * np.pi * 150 * t(d)) * env_exp(d, 0.08, 0.001)
    x += np.sin(2 * np.pi * 112 * t(d)) * env_exp(d, 0.08, 0.001) * 0.8
    return sat(x * 1.4, 2) * 0.6


if __name__ == '__main__':
    for v in range(4):
        write(f'smg{v}', smg(v), br='128k')
    write('swap', swap(), peak=0.7)
    write('buy', buy(), peak=0.7)
    write('deny', deny(), peak=0.6)
