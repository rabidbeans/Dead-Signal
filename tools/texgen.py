"""Tileable PBR surface textures and FX sprites, generated (no downloads).

    python tools/texgen.py

Surfaces get albedo (sRGB), normal (OpenGL +Y) and an ORM-style map
(R = ambient occlusion, G = roughness, B = wetness mask for puddles).
Everything tiles: the noise is periodic on the texture's own lattice.
"""
import os
import math
import numpy as np
from PIL import Image, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'tex')
os.makedirs(OUT, exist_ok=True)
RNG = np.random.RandomState(7)


# ---------------------------------------------------------------- noise ----
def pnoise(n, period, seed=0):
    """Periodic gradient noise on an n×n grid with `period` cells."""
    rs = np.random.RandomState(seed)
    ang = rs.rand(period, period) * 2 * np.pi
    gx, gy = np.cos(ang), np.sin(ang)
    t = np.arange(n) / n * period
    X, Y = np.meshgrid(t, t)
    xi, yi = np.floor(X).astype(int), np.floor(Y).astype(int)
    xf, yf = X - xi, Y - yi
    x0, y0 = xi % period, yi % period
    x1, y1 = (xi + 1) % period, (yi + 1) % period

    def dot(ix, iy, dx, dy):
        return gx[iy, ix] * dx + gy[iy, ix] * dy
    u = xf * xf * xf * (xf * (xf * 6 - 15) + 10)
    v = yf * yf * yf * (yf * (yf * 6 - 15) + 10)
    n00 = dot(x0, y0, xf, yf)
    n10 = dot(x1, y0, xf - 1, yf)
    n01 = dot(x0, y1, xf, yf - 1)
    n11 = dot(x1, y1, xf - 1, yf - 1)
    return ((n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v) * 1.414


def fbm(n, period, octaves=5, gain=0.5, seed=0):
    tot, amp, norm = 0, 1.0, 0
    for o in range(octaves):
        tot = tot + pnoise(n, period * 2 ** o, seed + o * 31) * amp
        norm += amp
        amp *= gain
    return tot / norm


def worley(n, cells, seed=0):
    """Periodic F1/F2 on an n×n grid."""
    rs = np.random.RandomState(seed)
    pts = (np.arange(cells)[:, None, None] * 0 + 0)  # placeholder
    jitter = rs.rand(cells, cells, 2)
    t = np.arange(n) / n * cells
    X, Y = np.meshgrid(t, t)
    xi, yi = np.floor(X).astype(int), np.floor(Y).astype(int)
    f1 = np.full((n, n), 9.0)
    f2 = np.full((n, n), 9.0)
    cid = np.zeros((n, n), int)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            cx, cy = xi + dx, yi + dy
            j = jitter[cy % cells, cx % cells]
            px, py = cx + j[..., 0], cy + j[..., 1]
            d = np.hypot(px - X, py - Y)
            m = d < f1
            f2 = np.where(m, f1, np.minimum(f2, d))
            cid = np.where(m, (cy % cells) * cells + (cx % cells), cid)
            f1 = np.minimum(f1, d)
    return f1, f2, cid


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def lerp(a, b, t):
    t = np.asarray(t)
    if t.ndim == 2:
        t = t[..., None]
    return a * (1 - t) + b * t


def normal_from_height(h, strength):
    """Tangent-space normal (OpenGL convention) from a periodic height map."""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    nx, ny = -dx * strength, dy * strength
    nz = np.ones_like(h)
    L = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / L, ny / L, nz / L], -1) * 0.5 + 0.5


def save(name, arr, mode='RGB', q=90):
    a = np.clip(arr, 0, 1)
    im = Image.fromarray((a * 255 + 0.5).astype(np.uint8), mode)
    p = os.path.join(OUT, name + '.webp')
    im.save(p, 'WEBP', quality=q, method=6)
    print('wrote', name, im.size)


def save_set(name, alb, h, rough, ao, wet=None, strength=6.0):
    save(name + '_albedo', alb)
    save(name + '_normal', normal_from_height(h, strength), q=92)
    if wet is None:
        wet = np.zeros_like(rough)
    save(name + '_orm', np.stack([ao, rough, wet], -1))


# -------------------------------------------------------------- surfaces --
def asphalt(n=1024):
    """Old city asphalt: aggregate, binder, patch repairs, cracks, oil, puddles.
    One tile = 4 m."""
    agg = fbm(n, 128, 3, seed=1)
    stones = smooth(0.25, 0.6, agg)
    f1, f2, _ = worley(n, 9, seed=2)
    cracks = smooth(0.035, 0.0, f2 - f1) * smooth(0.0, 0.3, fbm(n, 6, 3, seed=3))
    hair = smooth(0.02, 0.0, np.abs(fbm(n, 16, 4, seed=4))) * smooth(0.1, 0.5, fbm(n, 4, 2, seed=5))
    patch = smooth(0.15, 0.2, fbm(n, 3, 3, seed=6))          # repair patches, darker & smoother
    oil = smooth(0.35, 0.65, fbm(n, 5, 4, seed=7))
    wear = fbm(n, 8, 4, seed=8)
    base = lerp(hexc('#2e2f31'), hexc('#3c3d3e'), smooth(-0.4, 0.5, wear))
    base = lerp(base, hexc('#58585a'), stones * 0.45)
    base = lerp(base, hexc('#2a2b2d'), patch * 0.55)
    base = lerp(base, hexc('#1e1e1f'), oil * 0.4)
    base = lerp(base, hexc('#121212'), np.clip(cracks + hair, 0, 1) * 0.85)
    base *= (0.9 + 0.2 * fbm(n, 256, 2, seed=9))[..., None]
    h = (stones * 0.6 + agg * 0.3) * (1 - patch * 0.75) - (cracks + hair) * 1.8
    puddle = smooth(0.12, 0.3, fbm(n, 3, 4, seed=10) - patch * 0.2)
    rough = np.clip(0.9 - stones * 0.06 - oil * 0.12 + patch * 0.04, 0.5, 1)
    ao = np.clip(1 - (cracks + hair) * 0.7 - (1 - stones) * 0.08, 0, 1)
    save_set('asphalt', base, h, rough, ao, wet=puddle, strength=9)


def concrete_slabs(n=1024):
    """Sidewalk: 2×2 slabs per tile (tile = 3 m), saw-cut joints, stains."""
    t = np.arange(n) / n
    X, Y = np.meshgrid(t, t)
    jx = np.minimum((X * 2) % 1, 1 - (X * 2) % 1)
    jy = np.minimum((Y * 2) % 1, 1 - (Y * 2) % 1)
    joint = smooth(0.006, 0.002, np.minimum(jx, jy))
    slab = (np.floor(X * 2) + np.floor(Y * 2) * 2).astype(int)
    tone = np.array([0.0, 0.05, -0.04, 0.025])[slab]
    grain = fbm(n, 96, 4, seed=11)
    stain = smooth(0.1, 0.5, fbm(n, 4, 4, seed=12))
    f1, f2, _ = worley(n, 6, seed=13)
    crack = smooth(0.02, 0.0, f2 - f1) * smooth(0.25, 0.45, fbm(n, 5, 3, seed=14))
    base = lerp(hexc('#6a6862'), hexc('#7d7b74'), smooth(-0.5, 0.5, grain))
    base = base + tone[..., None]
    base = lerp(base, hexc('#3f3b35'), stain * 0.55)
    base = lerp(base, hexc('#262422'), np.clip(joint + crack, 0, 1) * 0.8)
    h = grain * 0.3 - joint * 2 - crack * 1.2 + fbm(n, 300, 2, seed=15) * 0.2
    rough = np.clip(0.88 - stain * 0.2, 0.4, 1)
    ao = 1 - joint * 0.6 - crack * 0.4
    wet = smooth(0.2, 0.4, fbm(n, 3, 3, seed=16)) * 0.7 + joint * 0.3
    save_set('sidewalk', base, h, rough, ao, wet=wet, strength=7)


def brick(n=1024):
    """Running-bond brick, 8 courses × 4 bricks per tile (tile ≈ 2 m)."""
    t = np.arange(n) / n
    X, Y = np.meshgrid(t, t)
    rows = 16
    ry = Y * rows
    row = np.floor(ry).astype(int)
    bx = X * 4 + (row % 2) * 0.5
    col = np.floor(bx).astype(int)
    fx, fy = bx % 1, ry % 1
    mortar = smooth(0.05, 0.025, np.minimum(np.minimum(fx, 1 - fx) * 2.0, np.minimum(fy, 1 - fy)))
    rs = np.random.RandomState(20)
    tint = (rs.rand(rows, 5, 1) * 0.08 - 0.04) + (rs.rand(rows, 5, 3) * 0.03 - 0.015)
    bc = tint[row % rows, col % 5]
    grain = fbm(n, 128, 3, seed=21)
    soot = smooth(-0.1, 0.6, fbm(n, 3, 4, seed=22))
    base = hexc('#4a3029') + bc + grain[..., None] * 0.05
    base = lerp(base, hexc('#2a2622'), soot * 0.55)
    base = lerp(base, hexc('#5f5a52') * (0.8 + 0.2 * grain[..., None]), mortar)
    chip = smooth(0.55, 0.7, fbm(n, 24, 3, seed=23)) * (1 - mortar)
    base = lerp(base, hexc('#3b2219'), chip * 0.6)
    h = (1 - mortar) * 0.8 + grain * 0.15 - chip * 0.4
    rough = 0.9 - soot * 0.05
    ao = 1 - mortar * 0.45
    save_set('brick', base, h, rough * np.ones_like(h), ao, strength=10)


def roof(n=1024):
    """Flat tar-and-gravel roof with seams and stains (tile = 4 m)."""
    gravel = fbm(n, 220, 2, seed=30)
    blob = fbm(n, 6, 4, seed=31)
    t = np.arange(n) / n
    X, Y = np.meshgrid(t, t)
    seam = smooth(0.004, 0.0, np.abs(((X * 3) % 1) - 0.5) - 0.495 + 0.004)
    base = lerp(hexc('#3a3936'), hexc('#4d4b46'), smooth(-0.3, 0.5, gravel))
    base = lerp(base, hexc('#22211f'), smooth(0.1, 0.6, blob) * 0.6)
    h = gravel * 0.8 + seam * 0.5
    rough = 0.92 * np.ones_like(h)
    ao = 1 - smooth(0.2, 0.7, -gravel) * 0.3
    wet = smooth(0.3, 0.5, blob)
    save_set('roof', base, h, rough, ao, wet=wet, strength=8)


def metal_paint(n=512):
    """Chipped paint over rust, for dumpsters, barrels, signs."""
    chip = smooth(0.35, 0.4, fbm(n, 6, 5, seed=40))
    rust = fbm(n, 24, 4, seed=41)
    streak = fbm(n, 3, 4, seed=42)
    base = np.ones((n, n, 3)) * 0.8
    rustc = lerp(hexc('#4a2a18'), hexc('#7a4220'), smooth(-0.3, 0.6, rust))
    base = lerp(base, rustc, chip)
    base = lerp(base, base * 0.6, smooth(0.2, 0.6, streak) * 0.5)
    h = (1 - chip) * 0.4 + rust * 0.2 * chip
    rough = np.clip(0.55 + chip * 0.35, 0, 1)
    ao = np.ones_like(h)
    # albedo here is a MASK-tinted base: white = paint (tinted in the shader)
    save_set('metal', base, h, rough, ao, strength=5)


def concrete_cast(n=512):
    """Jersey barriers, curbs, pillars."""
    g = fbm(n, 64, 5, seed=50)
    pits = smooth(0.6, 0.75, fbm(n, 96, 2, seed=51))
    stain = smooth(0.0, 0.6, fbm(n, 4, 4, seed=52))
    base = lerp(hexc('#86847c'), hexc('#9b9890'), smooth(-0.4, 0.5, g))
    base = lerp(base, hexc('#4c4a44'), stain * 0.5)
    base = lerp(base, hexc('#3a3834'), pits * 0.6)
    h = g * 0.3 - pits * 0.6
    save_set('concrete', base, h, np.clip(0.85 - stain * 0.1, 0, 1), 1 - pits * 0.4, strength=6)


# ------------------------------------------------------------------ FX -----
def rgba(name, rgb, a, q=92):
    arr = np.concatenate([np.clip(rgb, 0, 1), np.clip(a, 0, 1)[..., None]], -1)
    im = Image.fromarray((arr * 255 + 0.5).astype(np.uint8), 'RGBA')
    im.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=q, method=6)
    print('wrote', name, im.size)


def radial(n):
    t = (np.arange(n) + 0.5) / n * 2 - 1
    X, Y = np.meshgrid(t, t)
    return X, Y, np.hypot(X, Y), np.arctan2(Y, X)


def blood_splats(n=256, count=4):
    for k in range(count):
        X, Y, r, a = radial(n)
        rs = np.random.RandomState(100 + k)
        edge = 0.42 + 0.12 * pnoise(n, 6, 100 + k) + 0.06 * pnoise(n, 20, 200 + k)
        core = smooth(edge, edge - 0.08, r)
        drops = np.zeros_like(r)
        for i in range(26):
            ang = rs.rand() * 2 * np.pi
            dist = 0.35 + rs.rand() * 0.55
            rad = 0.008 + rs.rand() * 0.04 * (1.1 - dist)
            cx, cy = np.cos(ang) * dist, np.sin(ang) * dist
            # streak from the centre
            px, py = X - cx, Y - cy
            along = (px * np.cos(ang) + py * np.sin(ang))
            perp = np.abs(-px * np.sin(ang) + py * np.cos(ang))
            streak = smooth(rad, 0, perp) * smooth(0.0, -0.15, along) * smooth(-0.25, -0.1, along) * 0.0
            drops = np.maximum(drops, smooth(rad, rad * 0.4, np.hypot(px, py)))
            drops = np.maximum(drops, streak)
        a_ = np.clip(core + drops, 0, 1)
        dark = smooth(0.0, edge, r)
        col = lerp(hexc('#3a0705'), hexc('#1c0303'), 1 - dark)
        col = col * (0.85 + 0.3 * pnoise(n, 30, 300 + k))[..., None]
        rgba(f'blood{k}', col, a_ * (0.85 + 0.15 * pnoise(n, 12, 400 + k)))


def blood_pool(n=256):
    X, Y, r, a = radial(n)
    edge = 0.75 + 0.1 * pnoise(n, 5, 500) + 0.04 * pnoise(n, 14, 501)
    al = smooth(edge, edge - 0.06, r)
    col = lerp(hexc('#260403'), hexc('#3d0806'), smooth(edge, 0, r) * 0.6)
    rgba('pool', col, al)


def bullet_hole(n=64):
    X, Y, r, a = radial(n)
    rim = np.exp(-((r - 0.18) / 0.06) ** 2) * 0.6
    core = smooth(0.16, 0.1, r)
    crack = smooth(0.08, 0.0, np.abs(np.sin(a * 3 + 1.3))) * smooth(0.6, 0.15, r) * 0.6
    al = np.clip(core + rim + crack * 0.8 + smooth(0.5, 0.2, r) * 0.25, 0, 1)
    col = lerp(hexc('#151413'), hexc('#3a3835'), rim)
    rgba('hole', col, al)


def muzzle(n=256):
    """Front-on star flash: hot core, four irregular petals."""
    X, Y, r, a = radial(n)
    petals = np.abs(np.cos(a * 2 + 0.3)) ** 6 * 0.9 + np.abs(np.cos(a * 3 + 1.1)) ** 10 * 0.5
    petals *= 0.8 + 0.4 * pnoise(n, 10, 600)
    body = smooth(0.15 + petals * 0.8, 0.0, r)
    core = smooth(0.25, 0.0, r)
    col = lerp(hexc('#ff8a2a'), hexc('#fff3d8'), core)
    rgba('muzzle', col, np.clip(body + core, 0, 1))


def muzzle_side(n=256):
    """Side flash: a cone of fire along +X."""
    t = (np.arange(n) + 0.5) / n
    X, Y = np.meshgrid(t, t * 2 - 1)
    width = 0.08 + X * 0.45
    tongue = smooth(width, width * 0.1, np.abs(Y + pnoise(n, 8, 610) * 0.08 * X)) * smooth(1.0, 0.45, X) * smooth(0.0, 0.05, X)
    core = smooth(0.6, 0.0, X) * smooth(0.18, 0.0, np.abs(Y))
    col = lerp(hexc('#ff7a1a'), hexc('#fff0cc'), np.clip(core * 1.5, 0, 1))
    rgba('muzzle_side', col, np.clip(tongue * (0.6 + 0.4 * pnoise(n, 14, 611)) + core, 0, 1))


def soft(n=128):
    X, Y, r, a = radial(n)
    rgba('soft', np.ones((n, n, 3)), smooth(1.0, 0.0, r) ** 2)


def smoke(n=256):
    X, Y, r, a = radial(n)
    d = fbm(n, 6, 5, seed=700) * 0.25
    al = smooth(0.95, 0.2, r + d) * (0.55 + 0.45 * smooth(-0.3, 0.6, fbm(n, 8, 4, seed=701)))
    rgba('smoke', np.ones((n, n, 3)) * 0.85, al)


def spark(n=64):
    t = (np.arange(n) + 0.5) / n * 2 - 1
    X, Y = np.meshgrid(t, t)
    al = smooth(0.3, 0.0, np.abs(Y)) * smooth(1.0, 0.0, np.abs(X))
    rgba('spark', np.ones((n, n, 3)), al)


def rain(n=128):
    """Several streaks per sprite, as recommended for cheap mobile rain."""
    rs = np.random.RandomState(9)
    t = (np.arange(n) + 0.5) / n
    X, Y = np.meshgrid(t, t)
    al = np.zeros((n, n))
    for i in range(5):
        cx = rs.rand() * 0.8 + 0.1
        y0 = rs.rand() * 0.5
        L = 0.3 + rs.rand() * 0.4
        al = np.maximum(al, smooth(0.012, 0.0, np.abs(X - cx)) * smooth(y0, y0 + 0.05, Y) * smooth(y0 + L, y0 + L - 0.15, Y) * (0.5 + rs.rand() * 0.5))
    rgba('rain', np.ones((n, n, 3)) * np.array([0.8, 0.85, 0.95]), al)


def ripple(n=128):
    X, Y, r, a = radial(n)
    al = np.exp(-((r - 0.7) / 0.06) ** 2) * 0.9 + np.exp(-((r - 0.45) / 0.05) ** 2) * 0.4
    rgba('ripple', np.ones((n, n, 3)), al)


def cone(n=128):
    """Fake volumetric light cone: bright at the top, fading out and down."""
    t = (np.arange(n) + 0.5) / n
    X, Y = np.meshgrid(t * 2 - 1, t)
    width = 0.12 + Y * 0.88
    al = smooth(width, width * 0.2, np.abs(X)) * smooth(1.0, 0.0, Y) ** 1.6
    rgba('cone', np.ones((n, n, 3)), al)


def flashlight(n=256):
    """Projected cookie for the flashlight: hot spot, ring, soft fringe."""
    X, Y, r, a = radial(n)
    hot = smooth(0.35, 0.0, r) * 0.6
    ring = np.exp(-((r - 0.55) / 0.08) ** 2) * 0.25
    body = smooth(0.95, 0.6, r) * 0.55
    v = np.clip(hot + ring + body, 0, 1) * (0.92 + 0.08 * pnoise(n, 12, 900))
    save('flashlight', np.stack([v, v * 0.97, v * 0.9], -1))


def paper(n=128):
    rs = np.random.RandomState(31)
    t = np.arange(n) / n
    X, Y = np.meshgrid(t, t)
    lines = (np.sin(Y * 90) > 0.85) * (X > 0.12) * (X < 0.88) * (Y > 0.15) * (Y < 0.85)
    base = lerp(hexc('#bdb7a6'), hexc('#8d8676'), smooth(-0.4, 0.6, fbm(n, 4, 3, seed=32)))
    base = lerp(base, hexc('#3a3632'), lines * 0.5)
    edge = smooth(0.0, 0.04, np.minimum(np.minimum(X, 1 - X), np.minimum(Y, 1 - Y)) + pnoise(n, 10, 33) * 0.02)
    rgba('paper', base, edge)


if __name__ == '__main__':
    asphalt(); concrete_slabs(); brick(); roof(); metal_paint(); concrete_cast()
    blood_splats(); blood_pool(); bullet_hole(); muzzle(); muzzle_side(); soft()
    smoke(); spark(); rain(); ripple(); cone(); flashlight(); paper()
