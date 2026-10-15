"""Round 7 sounds: the Breacher 12 shotgun (four variants) and its pump, the AR-7 carbine (four),
the M-60 Hailstorm (four) and its belt / feed-cover reload.

    cd tools && python sfx_guns.py        (re-uses the helpers in sfx.py; run with the bpy venv's python)

Same recipe as the pistol / SMG: a clipped broadband crack, a band-noise body, a saturated pitched
punch that a phone speaker can carry, the action's mechanics, street slapback and a low rumble.
What changes is the weight: the shotgun is all punch and long slapback, the 5.56 is the sharpest,
brightest crack with a short body, the 7.62 a heavier, longer thump with a mechanical clatter.
"""
import numpy as np
from sfx import SR, t, env_exp, bp, lp, hp, pad, mixl, sat, reverb, write, burst, modes, at, rasp


def report(r, d, pitch, crack_ms, crack_hp, body, body2, punch, mech, slaps, rumble, rt, wet, seed, gains):
    """One gunshot from its parts. body = (lo, hi, len, tau); body2 likewise; punch = (f_lo, f_hi, sweep_tau,
    len, tau, drive); mech = [(freq, gain)] + (delay, tau, gain); slaps = [(delay, gain)]; rumble = (lp, tau, gain)."""
    gc, gb, gb2, gp = gains
    cl = crack_ms / 1000
    crack = hp(r.randn(int(cl * SR)) * env_exp(cl, cl / 4.5, 0.0002), crack_hp)
    crack = sat(crack * 4, 3)
    lo, hi, ln, tau = body
    b1 = bp(r.randn(int(ln * SR)), lo * pitch, hi * pitch) * env_exp(ln, tau, 0.0008)
    lo, hi, ln, tau = body2
    b2 = bp(r.randn(int(ln * SR)), lo, hi) * env_exp(ln, tau, 0.001)
    flo, fhi, sw, ln, tau, drive = punch
    tt = t(ln)
    f = flo + (fhi - flo) * np.exp(-tt / sw)
    ph = 2 * np.pi * np.cumsum(f * pitch) / SR
    pu = sat(np.sin(ph) * env_exp(ln, tau, 0.001) * drive, 2.5)
    parts, (mdel, mtau, mg) = mech
    mc = np.zeros(int(0.09 * SR))
    for fr, g in parts:
        mc += np.sin(2 * np.pi * fr * pitch * t(0.09) + r.rand() * 6.28) * env_exp(0.09, mtau, 0.0003) * g
    mc = np.concatenate([np.zeros(int(mdel * SR)), mc * mg])
    dry = pad(mixl(crack * gc, b1 * gb, b2 * gb2, pu * gp, mc), int(d * SR))
    slap = np.zeros_like(dry)
    for dt_, g in slaps:
        k = int(dt_ * SR)
        slap[k:] += lp(dry, 2400)[: len(dry) - k] * g
    rl, rtau, rg = rumble
    rum = lp(r.randn(len(dry)), rl) * env_exp(d, rtau, 0.02) * rg
    out = reverb(mixl(dry, slap, rum), rt=rt, wet=wet, bright=2700, seed=seed)
    return out[: int(d * SR)] * np.minimum(1, np.linspace(30, 0, int(d * SR)))


def glue(x, drive):
    """Soft-clip the whole report against its own peak: denser and louder for the same peak level
    (every sound is peak-normalised on write, so this is what makes one gun LOUDER than another)."""
    return sat(x / (np.max(np.abs(x)) + 1e-9) * drive, 1.0)


def shotgun(v):
    """A 12-gauge: a broad, less 'cracky' blast, a deep saturated punch (160 -> 48 Hz), a big low body,
    and long slapback off the buildings with a rolling rumble."""
    r = np.random.RandomState(400 + v)
    pitch = 1 + (r.rand() - 0.5) * 0.08
    x = report(r, 2.1, pitch, crack_ms=16, crack_hp=800,
               body=(300, 2600, 0.2, 0.045), body2=(90, 600, 0.22, 0.06),
               punch=(48, 160, 0.03, 0.3, 0.07, 2.6), mech=([(1900, 0.6), (3100, 0.4)], (0.03, 0.008, 0.06)),
               slaps=((0.13, 0.3), (0.23, 0.2), (0.37, 0.13), (0.55, 0.08)), rumble=(320, 0.5, 0.34),
               rt=1.7, wet=0.2, seed=40 + v, gains=(1.1, 1.0, 0.9, 1.1))
    return glue(x, 1.6)


def rifle(v):
    """5.56: the sharpest, loudest crack of the lot (supersonic snap), a bright thin body, a quick punch,
    the buffer's 'spang', a short tail."""
    r = np.random.RandomState(500 + v)
    pitch = 1 + (r.rand() - 0.5) * 0.08
    x = report(r, 1.1, pitch, crack_ms=7, crack_hp=2200,
               body=(900, 5200, 0.075, 0.016), body2=(250, 1400, 0.07, 0.022),
               punch=(85, 210, 0.01, 0.1, 0.028, 2.4), mech=([(3900, 1), (5600, 0.6), (2700, 0.4)], (0.012, 0.004, 0.13)),
               slaps=((0.085, 0.3), (0.16, 0.18), (0.26, 0.1)), rumble=(420, 0.24, 0.16),
               rt=1.0, wet=0.18, seed=50 + v, gains=(1.25, 0.9, 0.5, 0.8))
    spang = modes([(2350 * pitch, 0.03, 0.2), (3480 * pitch, 0.02, 0.12)], 0.08, seed=v)   # buffer spring ring
    return glue(at(x, spang * 0.5, 0.018), 1.8)


def lmg(v):
    """7.62: heavier than the rifle, a lower body, a bigger punch, the bolt slamming home and the belt
    jumping in the tray, a longer tail."""
    r = np.random.RandomState(600 + v)
    pitch = 1 + (r.rand() - 0.5) * 0.08
    x = report(r, 1.4, pitch, crack_ms=10, crack_hp=1500,
               body=(600, 3800, 0.12, 0.028), body2=(150, 900, 0.12, 0.04),
               punch=(62, 190, 0.016, 0.16, 0.05, 2.7), mech=([(2600, 1), (4100, 0.6), (1700, 0.5)], (0.016, 0.006, 0.17)),
               slaps=((0.1, 0.34), (0.19, 0.22), (0.31, 0.13)), rumble=(380, 0.32, 0.24),
               rt=1.25, wet=0.2, seed=60 + v, gains=(1.0, 1.0, 0.75, 1.0))
    rattle = burst(0.05, 1400, 5200, 0.008, seed=70 + v) * 0.12                    # links jumping in the tray
    return glue(at(x, rattle, 0.035), 1.9)


def pump():
    """Rack-rack: the forend snapped back (a slide rasp, the bolt unlocking, a hard stop clack),
    a beat, then driven forward (rasp, the bolt locking, a heavier clack)."""
    back = rasp(0.06, 900, 5200, 81, rise=True, ridges=120) * 0.55
    clack1 = mixl(burst(0.14, 500, 7000, 0.004, seed=82) * 1.0,
                  modes([(720, 0.022, 0.8), (1580, 0.012, 0.55), (2900, 0.007, 0.35), (4400, 0.004, 0.2)], 0.14, seed=82),
                  lp(np.random.RandomState(83).randn(int(0.1 * SR)), 260) * env_exp(0.1, 0.018) * 0.7)
    fwd = rasp(0.055, 1000, 5600, 84, rise=False, ridges=130) * 0.5
    clack2 = mixl(burst(0.16, 450, 7500, 0.0045, seed=85) * 1.1,
                  modes([(640, 0.026, 0.85), (1420, 0.014, 0.6), (2650, 0.008, 0.4), (4100, 0.004, 0.2)], 0.16, seed=85),
                  lp(np.random.RandomState(86).randn(int(0.12 * SR)), 240) * env_exp(0.12, 0.022) * 0.85)
    x = at(back, clack1, 0.05)
    x = at(x, burst(0.03, 3000, 8000, 0.0015, seed=87) * 0.4, 0.06)                   # the shell lifter
    x = at(x, fwd, 0.17)
    x = at(x, clack2, 0.215)
    return reverb(x, rt=0.45, wet=0.1, seed=81)[: int(0.42 * SR)]


def belt():
    """The M-60 reload: the feed-cover latch, the cover swinging up (hinge creak, a clank at the top),
    the belt laid in the tray (a rattle of brass and links), the cover slapped down and latched."""
    latch = mixl(burst(0.06, 1800, 6500, 0.002, seed=91), modes([(1900, 0.008, 0.5), (3300, 0.005, 0.3)], 0.06, seed=91))
    creak = bp(np.random.RandomState(92).randn(int(0.09 * SR)), 600, 1800, 3) * env_exp(0.09, 0.05, 0.02) * 0.35
    up = mixl(burst(0.12, 400, 5000, 0.006, seed=93) * 0.8, modes([(560, 0.03, 0.7), (1240, 0.016, 0.45), (2600, 0.008, 0.25)], 0.12, seed=93))
    rattle = np.zeros(int(0.2 * SR))
    rr = np.random.RandomState(94)
    for k in range(9):                                                               # links and brass, quick and uneven
        when = 0.012 + k * 0.019 + rr.rand() * 0.008
        tk = mixl(modes([(2800 + rr.rand() * 1600, 0.008, 0.6), (5200 + rr.rand() * 1500, 0.004, 0.3)], 0.03, seed=95 + k),
                  burst(0.02, 2500, 8000, 0.002, seed=110 + k) * 0.5) * (0.55 + rr.rand() * 0.45)
        rattle = at(rattle, tk, when)
    slam = mixl(burst(0.2, 300, 6500, 0.006, seed=96) * 1.1,
                modes([(470, 0.04, 0.9), (1100, 0.02, 0.6), (2300, 0.01, 0.35), (3900, 0.005, 0.2)], 0.2, seed=96),
                lp(np.random.RandomState(97).randn(int(0.14 * SR)), 230) * env_exp(0.14, 0.03) * 0.9)
    x = at(latch, creak, 0.04)
    x = at(x, up * 0.8, 0.11)
    x = at(x, rattle, 0.22)
    x = at(x, slam, 0.47)
    x = at(x, burst(0.04, 2000, 7000, 0.0012, seed=98) * 0.35, 0.53)                 # the latch catching
    return reverb(x, rt=0.5, wet=0.12, seed=91)[: int(0.68 * SR)]


if __name__ == '__main__':
    for v in range(4):
        write(f'shotgun{v}', shotgun(v), br='128k')
        write(f'rifle{v}', rifle(v), br='128k')
        write(f'lmg{v}', lmg(v), br='128k')
    write('pump', pump(), peak=0.85)
    write('belt', belt(), peak=0.8)
