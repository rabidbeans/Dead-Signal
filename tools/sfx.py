"""Synthesised sound design (no samples, no downloads).

    python tools/sfx.py

Pistol: transient crack (0-10 ms, clipped) + body (10-80 ms band noise) +
a saturated 100-250 Hz punch (phones cannot play the sub, so the weight
lives here) + slide mechanics + a street slapback tail. Variants differ in
pitch and noise so repeats never machine-gun the same sample.

Zombie voices: a jittery glottal pulse train through vowel formants,
pitch glides down, wet gurgle amplitude modulation, breath noise, mild
distortion. Mono 44.1 kHz MP3: the one format every phone browser decodes.
"""
import os
import subprocess
import numpy as np
from scipy import signal

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'sfx')
os.makedirs(OUT, exist_ok=True)
rng = np.random.RandomState(3)


def t(d):
    return np.arange(int(d * SR)) / SR


def env_exp(d, tau, attack=0.001):
    x = t(d)
    e = np.exp(-x / tau)
    a = np.clip(x / max(attack, 1e-5), 0, 1)
    return e * a


def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), hi / (SR / 2)], 'band')
    return signal.lfilter(b, a, x)


def lp(x, f, order=2):
    b, a = signal.butter(order, f / (SR / 2), 'low')
    return signal.lfilter(b, a, x)


def hp(x, f, order=2):
    b, a = signal.butter(order, f / (SR / 2), 'high')
    return signal.lfilter(b, a, x)


def pad(x, n):
    return np.pad(x, (0, max(0, n - len(x))))[:n]


def mixl(*xs):
    n = max(len(x) for x in xs)
    return sum(pad(x, n) for x in xs)


def sat(x, drive):
    return np.tanh(x * drive) / np.tanh(drive)


def norm(x, peak=0.89):
    m = np.max(np.abs(x)) + 1e-9
    return x / m * peak


def reverb(x, rt=1.2, wet=0.3, pre=0.012, bright=3500, seed=0):
    """Cheap synthetic IR: early reflections + decaying filtered noise."""
    r = np.random.RandomState(seed)
    n = int(rt * SR)
    ir = r.randn(n) * np.exp(-np.arange(n) / SR / (rt / 6.9))
    ir = lp(ir, bright)
    for d, g in ((0.011, 0.5), (0.023, 0.35), (0.041, 0.3), (0.067, 0.22), (0.093, 0.18)):
        k = int(d * SR)
        if k < n:
            ir[k] += g * (1 if r.rand() > 0.5 else -1)
    ir = np.concatenate([np.zeros(int(pre * SR)), ir])
    ir /= np.sqrt(np.sum(ir ** 2))
    y = signal.fftconvolve(x, ir)[: len(x) + len(ir)]
    return mixl(x, y * wet * 3)


def write(name, x, br='96k'):
    x = norm(x)
    wav = f'/tmp/{name}.wav'
    from scipy.io import wavfile
    wavfile.write(wav, SR, (x * 32767).astype(np.int16))
    out = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', br, out], check=True)
    print('wrote', name, f'{len(x) / SR:.2f}s')


# ------------------------------------------------------------- pistol ----
def pistol(v):
    r = np.random.RandomState(100 + v)
    pitch = 1 + (r.rand() - 0.5) * 0.08
    d = 1.6
    # transient: a hard broadband crack, clipped
    crack = r.randn(int(0.012 * SR)) * env_exp(0.012, 0.0025, 0.0002)
    crack = hp(crack, 1200)
    crack = sat(crack * 4, 3)
    # body: the report
    body = r.randn(int(0.14 * SR))
    body = bp(body, 500 * pitch, 3200 * pitch) * env_exp(0.14, 0.028, 0.0008)
    body2 = bp(r.randn(int(0.1 * SR)), 180, 900) * env_exp(0.1, 0.035, 0.001)
    # punch: pitched thump 220 -> 70 Hz, saturated so a phone speaker hears it
    tt = t(0.16)
    f = 70 + 150 * np.exp(-tt / 0.018)
    ph = 2 * np.pi * np.cumsum(f * pitch) / SR
    punch = sat(np.sin(ph) * env_exp(0.16, 0.045, 0.001) * 2.2, 2.5)
    # mechanics: the slide cycling ~25 ms after the shot
    mech = np.zeros(int(0.08 * SR))
    for fr, g in ((3100, 1), (4700, 0.6), (6900, 0.4), (2300, 0.5)):
        mech += np.sin(2 * np.pi * fr * pitch * t(0.08)) * env_exp(0.08, 0.006, 0.0003) * g
    mech = np.concatenate([np.zeros(int(0.022 * SR)), mech * 0.18])
    dry = mixl(crack * 0.9, body * 1.0, body2 * 0.6, punch * 0.85, mech)
    dry = pad(dry, int(d * SR))
    # tail: street slapback from buildings + a long low rumble
    slap = np.zeros_like(dry)
    for dt_, g in ((0.11, 0.32), (0.19, 0.2), (0.31, 0.12)):
        k = int(dt_ * SR)
        slap[k:] += lp(dry, 2500)[: len(dry) - k] * g
    rumble = lp(r.randn(len(dry)), 400) * env_exp(d, 0.35, 0.02) * 0.25
    out = reverb(mixl(dry, slap, rumble), rt=1.3, wet=0.22, bright=2800, seed=v)
    return out[: int(d * SR)] * np.minimum(1, np.linspace(30, 0, int(d * SR)))


def dry_click():
    r = np.random.RandomState(5)
    x = np.zeros(int(0.12 * SR))
    for fr, g in ((2600, 1), (5200, 0.5), (1700, 0.4)):
        x += np.sin(2 * np.pi * fr * t(0.12)) * env_exp(0.12, 0.004, 0.0002) * g
    x += hp(r.randn(len(x)), 3000) * env_exp(0.12, 0.002) * 0.6
    return reverb(x, rt=0.4, wet=0.1)


def metal_clack(fs, tau, noise=0.4, seed=0, d=0.25):
    r = np.random.RandomState(seed)
    x = np.zeros(int(d * SR))
    for fr, g in fs:
        x += np.sin(2 * np.pi * fr * t(d) + r.rand() * 6) * env_exp(d, tau * (0.6 + r.rand() * 0.8), 0.0003) * g
    x += bp(r.randn(len(x)), 1500, 8000) * env_exp(d, 0.006) * noise
    return reverb(x, rt=0.5, wet=0.12, seed=seed)


def shell(v):
    r = np.random.RandomState(200 + v)
    out = np.zeros(int(0.5 * SR))
    pos = 0
    for k in range(3):
        f0 = 4800 + r.rand() * 1500
        c = np.zeros(int(0.12 * SR))
        for h, g in ((1, 1), (2.76, 0.5), (5.4, 0.25)):
            c += np.sin(2 * np.pi * f0 * h * t(0.12)) * env_exp(0.12, 0.02 / h) * g
        amp = 0.8 ** k * (1 if k == 0 else 0.5)
        out[pos:pos + len(c)] += c * amp
        pos += int((0.07 + r.rand() * 0.06) * SR / (k + 1))
    return out


def impact_flesh(v):
    r = np.random.RandomState(300 + v)
    thud = lp(r.randn(int(0.2 * SR)), 300) * env_exp(0.2, 0.03, 0.001)
    splat = bp(r.randn(int(0.25 * SR)), 300, 2500) * env_exp(0.25, 0.05, 0.002)
    # wet: random tiny drips
    wet = np.zeros(int(0.35 * SR))
    for i in range(8):
        k = int(r.rand() * 0.25 * SR)
        n = int(0.015 * SR)
        wet[k:k + n] += bp(r.randn(n), 800, 3000) * np.hanning(n) * 0.3
    return mixl(sat(thud * 3, 2) * 0.8, splat * 0.7, wet)


def impact_hard(v):
    r = np.random.RandomState(400 + v)
    crack = hp(r.randn(int(0.05 * SR)), 2000) * env_exp(0.05, 0.004, 0.0002)
    ping = np.sin(2 * np.pi * (2400 + 800 * r.rand()) * t(0.2)) * env_exp(0.2, 0.03) * 0.25
    dust = bp(r.randn(int(0.3 * SR)), 400, 3000) * env_exp(0.3, 0.06) * 0.4
    return reverb(mixl(crack, ping, dust), rt=0.6, wet=0.2, seed=v)


def step(v, wet=True):
    r = np.random.RandomState(500 + v)
    thud = lp(r.randn(int(0.12 * SR)), 250) * env_exp(0.12, 0.02, 0.003)
    scuff = bp(r.randn(int(0.12 * SR)), 800, 4000) * env_exp(0.12, 0.025, 0.004) * 0.35
    splash = bp(r.randn(int(0.2 * SR)), 1500, 7000) * env_exp(0.2, 0.05, 0.002) * (0.5 if wet else 0)
    return mixl(thud, scuff, splash)


# ------------------------------------------------------------- zombies ---
FORMANTS = {
    'a': [(700, 110), (1150, 130), (2600, 180)],
    'o': [(450, 90), (850, 110), (2500, 170)],
    'u': [(350, 80), (700, 100), (2400, 170)],
    'e': [(500, 90), (1700, 140), (2500, 180)],
    'r': [(600, 120), (1300, 160), (1700, 200)],
}


def glottal(f0_curve, jitter=0.03, shimmer=0.2, seed=0):
    r = np.random.RandomState(seed)
    n = len(f0_curve)
    f = f0_curve * (1 + np.cumsum(r.randn(n)) * jitter / np.sqrt(SR) * 8)
    ph = np.cumsum(f) / SR
    saw = (ph % 1)
    pulse = np.where(saw < 0.6, np.sin(np.pi * saw / 0.6) ** 2, 0)   # Rosenberg-ish
    pulse = np.diff(np.concatenate([[0], pulse]))
    amp = 1 + lp(r.randn(n), 40) * shimmer * 8
    return pulse * amp


def formant_filter(x, vowel, shift=1.0):
    y = np.zeros_like(x)
    for f, bw in FORMANTS[vowel]:
        f *= shift
        b, a = signal.iirpeak(f / (SR / 2), f / bw)
        y += signal.lfilter(b, a, x)
    return y


def groan(v, d=None, kind='groan'):
    r = np.random.RandomState(600 + v)
    d = d or (1.4 + r.rand() * 1.4)
    n = int(d * SR)
    tt = np.arange(n) / SR
    base = 70 + r.rand() * 45
    # pitch: a swell then a long fall, with a wobble
    curve = base * (1 + 0.25 * np.sin(np.pi * tt / d) - 0.25 * tt / d) * (1 + 0.04 * np.sin(2 * np.pi * (4 + r.rand() * 3) * tt))
    if kind == 'scream':
        curve = (180 + r.rand() * 80) * (1 + 0.6 * np.sin(np.pi * np.minimum(tt / d * 1.3, 1))) * (1 + 0.06 * np.sin(2 * np.pi * 9 * tt))
    src = glottal(curve, jitter=0.05, shimmer=0.35, seed=v)
    vowels = list('aour') if kind != 'scream' else list('ae')
    v1, v2 = r.choice(vowels), r.choice(vowels)
    # glide between two vowels by crossfading their filtered versions
    a1 = formant_filter(src, v1, 0.92 + r.rand() * 0.15)
    a2 = formant_filter(src, v2, 0.92 + r.rand() * 0.15)
    k = np.clip(tt / d * 1.4 - 0.2, 0, 1)
    voice = a1 * (1 - k) + a2 * k
    # breath and a wet gurgle in the throat
    breath = bp(r.randn(n), 400, 3500) * 0.25
    gurgle = 1 - 0.55 * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * (18 + r.rand() * 14) * tt + lp(r.randn(n), 15) * 40)))
    env = np.sin(np.pi * np.clip(tt / d, 0, 1)) ** 0.7
    env *= 0.75 + 0.25 * lp(r.randn(n), 3) * 10
    x = (voice * gurgle * 1.0 + breath * (0.4 if kind != 'scream' else 0.8)) * env
    x = sat(x * 2.5, 2.2 if kind != 'scream' else 3.5)
    x = hp(x, 70)
    return reverb(x, rt=0.9, wet=0.15, seed=v)


def death(v):
    r = np.random.RandomState(700 + v)
    rattle = groan(30 + v, d=1.1)
    rattle *= np.linspace(1, 0, len(rattle)) ** 1.5
    fall = lp(r.randn(int(0.3 * SR)), 200) * env_exp(0.3, 0.06, 0.005)
    out = np.zeros(max(int(1.4 * SR), len(rattle)))
    out[: len(rattle)] += rattle * 0.8
    k = int(0.55 * SR)
    out[k:k + len(fall)] += sat(fall * 3, 2) * 0.9
    return out


# ---------------------------------------------------------- ambience ----
def loop_rain(d=8.0):
    r = np.random.RandomState(900)
    n = int(d * SR)
    hiss = bp(r.randn(n), 1200, 9000) * 0.35
    body = bp(r.randn(n), 200, 1200) * 0.25
    drops = np.zeros(n)
    for i in range(int(d * 900)):
        k = r.randint(0, n - 400)
        L = r.randint(60, 300)
        drops[k:k + L] += hp(r.randn(L), 2500) * np.hanning(L) * r.rand() * 0.25
    gutter = lp(r.randn(n), 600) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.3 * np.arange(n) / SR)) * 0.25
    x = hiss + body + drops + gutter
    # make it loop: crossfade the end into the start
    f = int(0.5 * SR)
    x[:f] = x[:f] * np.linspace(0, 1, f) + x[-f:] * np.linspace(1, 0, f)
    return x[:-f]


def loop_wind(d=10.0):
    r = np.random.RandomState(901)
    n = int(d * SR)
    w = lp(r.randn(n), 500)
    gust = 0.5 + 0.5 * lp(r.randn(n), 0.4) * 60
    whistle = bp(r.randn(n), 600, 900) * (0.3 + 0.3 * np.sin(2 * np.pi * 0.11 * np.arange(n) / SR))
    x = (w + whistle * 0.4) * np.clip(gust, 0.1, 2)
    f = int(1.0 * SR)
    x[:f] = x[:f] * np.linspace(0, 1, f) + x[-f:] * np.linspace(1, 0, f)
    return x[:-f]


def thunder(v):
    r = np.random.RandomState(950 + v)
    d = 6.0
    n = int(d * SR)
    x = lp(r.randn(n), 180) * 2
    crack = hp(r.randn(int(0.4 * SR)), 1500) * env_exp(0.4, 0.08) * 0.5
    env = np.exp(-np.arange(n) / SR / 1.6) * (0.6 + 0.4 * lp(r.randn(n), 4) * 20)
    out = x * np.clip(env, 0, 2)
    out[: len(crack)] += crack
    return reverb(sat(out, 1.5), rt=2.5, wet=0.3, bright=1200)


def siren(d=9.0):
    n = int(d * SR)
    tt = np.arange(n) / SR
    f = 700 + 350 * np.sin(2 * np.pi * 0.18 * tt)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) + 0.3 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph)
    x = lp(x, 1500)
    env = np.sin(np.pi * tt / d) ** 2
    return reverb(x * env * 0.5, rt=3, wet=0.6, bright=1500)


def sting():
    """Wave start: a low brass-like swell with a metallic scrape."""
    d = 3.0
    n = int(d * SR)
    tt = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * f * tt + i) for i, f in enumerate((55, 55.4, 82.5, 110.3)))
    x = sat(x * 0.6, 2) * np.minimum(1, tt / 0.6) * np.exp(-np.maximum(0, tt - 1.2) / 0.8)
    scrape = bp(np.random.RandomState(4).randn(n), 2500, 4500) * np.exp(-tt / 0.5) * 0.3
    return reverb(mixl(lp(x, 900), scrape), rt=3, wet=0.4, bright=2000)


def heartbeat():
    d = 1.0
    x = np.zeros(int(d * SR))
    for k0 in (0.0, 0.28):
        k = int(k0 * SR)
        b = np.sin(2 * np.pi * 55 * t(0.15)) * env_exp(0.15, 0.04, 0.005)
        x[k:k + len(b)] += sat(b * 2, 2) * (1 if k0 == 0 else 0.7)
    return x


def hurt(v):
    r = np.random.RandomState(1000 + v)
    thud = lp(r.randn(int(0.2 * SR)), 300) * env_exp(0.2, 0.04, 0.002)
    grunt = formant_filter(glottal(np.full(int(0.25 * SR), 120 + r.rand() * 30), seed=v), 'u') * np.hanning(int(0.25 * SR))
    return mixl(sat(thud * 3, 2), grunt * 0.6)


def ui_click():
    return metal_clack([(1800, 1), (3600, 0.3)], 0.01, noise=0.2, d=0.12)


if __name__ == '__main__':
    for v in range(4):
        write(f'pistol{v}', pistol(v), br='128k')
    write('dryfire', dry_click())
    write('mag_out', metal_clack([(1900, 1), (3400, 0.6), (5100, 0.3)], 0.02, seed=1))
    write('mag_in', mixl(metal_clack([(1400, 1), (2900, 0.7), (4400, 0.4)], 0.025, noise=0.7, seed=2),
                         lp(np.random.RandomState(9).randn(int(0.1 * SR)), 300) * env_exp(0.1, 0.02) * 0.6))
    write('slide', metal_clack([(2200, 1), (3300, 0.8), (6100, 0.5), (1100, 0.4)], 0.018, noise=0.8, seed=3, d=0.3))
    for v in range(3):
        write(f'shell{v}', shell(v))
        write(f'flesh{v}', impact_flesh(v))
    for v in range(2):
        write(f'hard{v}', impact_hard(v))
    for v in range(4):
        write(f'step{v}', step(v))
    for v in range(6):
        write(f'groan{v}', groan(v))
    for v in range(2):
        write(f'scream{v}', groan(40 + v, d=1.2, kind='scream'))
        write(f'death{v}', death(v))
        write(f'hurt{v}', hurt(v))
        write(f'thunder{v}', thunder(v))
    write('rain', loop_rain(), br='96k')
    write('wind', loop_wind(), br='64k')
    write('siren', siren(), br='64k')
    write('sting', sting())
    write('heart', heartbeat())
    write('click', ui_click())
