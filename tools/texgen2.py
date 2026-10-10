"""More surfaces and decals (second pass): wood, roller shutters, chain-link,
manholes, drains, skid marks, scorches, oil, long cracks, drag trails, a dirt
overlay for paint. Same conventions as texgen.py (tileable, WebP, no downloads).

    python tools/texgen2.py
"""
import os
import sys
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from texgen import (fbm, pnoise, worley, smooth, hexc, lerp, normal_from_height,  # noqa: E402
                    save, save_set, rgba, radial)


def streak(n, period, length, seed):
    a = fbm(n, period, 4, seed=seed)
    return np.mean([np.roll(a, k, 1) for k in range(0, length, max(1, length // 12))], 0)


def wood(n=512):
    t = np.arange(n) / n
    X, Y = np.meshgrid(t, t)
    plank = np.floor(Y * 6).astype(int)
    fy = (Y * 6) % 1
    gap = smooth(0.06, 0.02, np.minimum(fy, 1 - fy))
    rs = np.random.RandomState(3)
    tone = rs.rand(6) * 0.25 - 0.12
    grain = streak(n, 24, 160, 5)
    rings = np.sin((grain * 9 + Y * 20) * 1.0) * 0.5 + 0.5
    fine = streak(n, 64, 90, 7)
    base = lerp(hexc('#6d4f31'), hexc('#8d6a43'), smooth(-0.4, 0.5, grain))
    base = base * (1 + tone[plank][..., None]) * (0.85 + 0.25 * rings[..., None])
    weather = smooth(0.0, 0.6, fbm(n, 5, 4, seed=9))
    base = lerp(base, hexc('#4f4a43'), weather * 0.45)           # grey, weathered
    base = lerp(base, hexc('#1a130c'), gap * 0.9)
    nails = np.zeros((n, n))
    for p in range(6):
        for nx in (0.08, 0.92):
            yy = (p + 0.5) / 6
            r = np.hypot(X - nx, (Y - yy) * 1.0)
            nails = np.maximum(nails, smooth(0.006, 0.002, r))
    base = lerp(base, hexc('#222222'), nails * 0.8)
    h = grain * 0.25 + fine * 0.15 - gap * 1.4 + nails * 0.3
    save_set('wood', base, h, 0.85 - weather * 0.1, 1 - gap * 0.6, strength=7)


def shutter(n=512):
    """Roller shutter: horizontal slats, dents, rust runs, a scrawl or two."""
    t = np.arange(n) / n
    X, Y = np.meshgrid(t, t)
    slat = (Y * 32) % 1
    ridge = np.sin(slat * np.pi)
    rust = smooth(0.1, 0.7, fbm(n, 4, 4, seed=21) + streak(n, 12, 200, 22) * 0.6)
    dent = fbm(n, 3, 3, seed=23) * 0.5
    base = lerp(hexc('#5d6065'), hexc('#868a8f'), ridge)
    base = lerp(base, hexc('#6b3f22'), rust * 0.55)
    base = base * (0.8 + 0.2 * ridge[..., None])
    # spray scrawl: a few thick wobbly lines
    scrawl = np.zeros((n, n))
    rs = np.random.RandomState(8)
    for k in range(3):
        x0, y0 = rs.rand() * 0.5 + 0.1, rs.rand() * 0.6 + 0.2
        ang = rs.rand() * 6.28
        for s in np.linspace(0, 0.25, 90):
            cx = x0 + s * np.cos(ang) + 0.015 * np.sin(s * 70)
            cy = y0 + s * np.sin(ang) * 0.4 + 0.02 * np.cos(s * 50)
            scrawl = np.maximum(scrawl, smooth(0.011, 0.005, np.hypot(X - cx, Y - cy)))
    col = rs.choice(['#a82424', '#e8e0b0', '#2b5c9c'])
    base = lerp(base, hexc(col), scrawl * 0.8)
    h = ridge * 0.5 + dent * 0.3 - scrawl * 0.05
    save_set('shutter', base, h, 0.55 + rust * 0.3, 0.75 + ridge * 0.25, strength=6)


def chainlink(n=256):
    t = np.arange(n) / n
    X, Y = np.meshgrid(t, t)
    cells = 6
    u = (X * cells + Y * cells) % 1
    v = (X * cells - Y * cells) % 1
    wire = np.maximum(smooth(0.1, 0.0, np.minimum(u, 1 - u)), smooth(0.1, 0.0, np.minimum(v, 1 - v)))
    a = np.clip(wire * 1.4, 0, 1)
    col = np.ones((n, n, 3)) * hexc('#8a8d90')
    rgba('chainlink', col, a)


def manhole(n=256):
    X, Y, r, a = radial(n)
    disc = smooth(0.96, 0.9, r)
    ring = smooth(0.06, 0.0, np.abs(r - 0.82))
    rib = smooth(0.025, 0.0, np.abs(((X + Y) * 9.0) % 1 - 0.5) - 0.44) * (r < 0.78)
    rib = np.maximum(rib, smooth(0.025, 0.0, np.abs(((X - Y) * 9.0) % 1 - 0.5) - 0.44) * (r < 0.78))
    pit = fbm(n, 24, 2, seed=1)
    col = lerp(hexc('#2a2623'), hexc('#4a433d'), np.clip(ring + rib * 0.8 + pit * 0.2, 0, 1))
    col = lerp(col, hexc('#1b100a'), smooth(0.2, 0.7, fbm(n, 6, 3, seed=2)) * 0.5)
    rgba('manhole', col, disc * (0.92 + 0.08 * pit))


def drain(n=256):
    t = np.arange(n) / n
    X, Y = np.meshgrid(t, t)
    frame = smooth(0.05, 0.03, np.minimum(np.minimum(X, 1 - X), np.minimum(Y, 1 - Y)) - 0.0)
    bars = smooth(0.18, 0.12, np.abs((X * 8) % 1 - 0.5)) * (np.abs(Y - 0.5) < 0.42) * (np.abs(X - 0.5) < 0.45)
    inner = (np.abs(Y - 0.5) < 0.4) & (np.abs(X - 0.5) < 0.44)
    col = np.where(inner[..., None], np.array([0.012, 0.012, 0.012]), np.array([0.22, 0.21, 0.2]))
    col = np.where((bars > 0.5)[..., None], np.array([0.2, 0.19, 0.18]), col)
    rgba('drain', col, np.where(inner | (frame > 0.5), 0.95, 0.0) * np.ones((n, n)))


def skid(n=256):
    """Two curved tyre marks along +x; the decal is stretched in game."""
    t = np.arange(n) / n
    X, Y = np.meshgrid(t, t)
    out = np.zeros((n, n))
    for off in (0.34, 0.66):
        c = off + 0.05 * np.sin(X * 3.0) * (0.6 + X)
        w = 0.05 * (1 - 0.3 * X)
        m = smooth(w, w * 0.4, np.abs(Y - c))
        m *= smooth(0.0, 0.2, X) * smooth(1.0, 0.7, X)
        m *= 0.55 + 0.45 * fbm(n, 24, 3, seed=int(off * 100))
        out = np.maximum(out, m)
    rgba('skid', np.ones((n, n, 3)) * 0.03, out * 0.75)


def scorch(n=256):
    X, Y, r, a = radial(n)
    d = fbm(n, 5, 4, seed=3) * 0.3
    al = smooth(0.95, 0.15, r + d) ** 1.4
    col = lerp(np.ones((n, n, 3)) * 0.02, hexc('#3a1a08'), smooth(0.3, 0.9, r + d))
    rgba('scorch', col, al * 0.9)


def oil(n=256):
    X, Y, r, a = radial(n)
    d = fbm(n, 4, 4, seed=5) * 0.45
    al = smooth(0.8, 0.5, r + d)
    col = lerp(hexc('#0b0b0d'), hexc('#2a2530'), smooth(0.2, 0.9, fbm(n, 8, 3, seed=7) * 0.5 + 0.5))
    rgba('oil', col, al * 0.8)


def crack(n=256):
    t = np.arange(n) / n
    X, Y = np.meshgrid(t, t)
    out = np.zeros((n, n))
    rs = np.random.RandomState(4)

    def seg(x0, y0, ang, L, w, depth):
        nonlocal out
        for s in np.linspace(0, L, 70):
            wob = 0.02 * np.sin(s * 38 + x0 * 90)
            cx, cy = x0 + s * np.cos(ang) + wob * np.sin(ang), y0 + s * np.sin(ang) - wob * np.cos(ang)
            out = np.maximum(out, smooth(w, w * 0.2, np.hypot(X - cx, Y - cy)) * (1 - s / L * 0.5))
        if depth:
            for k in range(2):
                s = L * rs.uniform(0.3, 0.8)
                seg(x0 + s * np.cos(ang), y0 + s * np.sin(ang), ang + rs.uniform(-1.0, 1.0), L * 0.45, w * 0.7, depth - 1)
    seg(0.05, 0.5, 0.0, 0.9, 0.006, 2)
    rgba('crackdec', np.ones((n, n, 3)) * 0.02, out)


def drag(n=256):
    """A smeared blood drag-trail along +x."""
    t = np.arange(n) / n
    X, Y = np.meshgrid(t, t)
    c = 0.5 + 0.08 * np.sin(X * 7)
    w = 0.16 * (0.4 + 0.6 * smooth(0, 0.3, X)) * (1 - 0.5 * X)
    m = smooth(w, w * 0.3, np.abs(Y - c)) * smooth(1.0, 0.75, X)
    m *= 0.6 + 0.4 * fbm(n, 14, 3, seed=9)
    m = np.clip(m * 1.2, 0, 1)
    col = lerp(hexc('#3d0a07'), hexc('#1d0403'), smooth(0.2, 0.9, X))
    rgba('drag', col, m * 0.85)


def dirt(n=512):
    """Grime overlay for paint: tall rain streaks, mud toward the bottom (v=0)."""
    t = np.arange(n) / n
    X, Y = np.meshgrid(t, t)
    streaks = streak(n, 40, 200, 11)
    streaks = np.rot90(streaks)
    mud = smooth(0.5, 0.0, Y) * (0.5 + 0.5 * fbm(n, 12, 4, seed=3))
    spots = smooth(0.35, 0.6, fbm(n, 30, 3, seed=4))
    g = np.clip(0.25 + streaks * 0.6 + mud * 0.9 + spots * 0.3, 0, 1)
    save('dirt', np.stack([g, g, g], -1))


def graffiti_tag(n=256):
    t = np.arange(n) / n
    X, Y = np.meshgrid(t, t)
    out = np.zeros((n, n))
    rs = np.random.RandomState(14)
    for k in range(4):
        x0 = 0.1 + k * 0.2
        for s in np.linspace(0, 1, 100):
            cx = x0 + 0.1 * np.sin(s * 5 + k) * 0.5
            cy = 0.15 + s * 0.7
            out = np.maximum(out, smooth(0.022, 0.012, np.hypot(X - (x0 + 0.08 * np.sin(s * 6 + k * 2)), Y - cy)))
    out *= 0.9 + 0.1 * fbm(n, 30, 2, seed=2)
    rgba('tag', np.ones((n, n, 3)) * hexc('#d8442e'), out * 0.85)


if __name__ == '__main__':
    wood(); shutter(); chainlink(); manhole(); drain(); skid(); scorch(); oil(); crack(); drag(); dirt(); graffiti_tag()
