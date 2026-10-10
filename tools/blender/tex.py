"""Vectorised 3D noise for painting and sculpting in object space.

Everything is evaluated on world positions, never on UVs, so nothing seams
at UV island borders: a wound that crosses the shoulder seam is one wound.
"""
import numpy as np

_PERM = np.random.RandomState(1337).permutation(256)
_PERM = np.concatenate([_PERM, _PERM]).astype(np.int64)
_GRAD = np.array([[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
                  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
                  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]], np.float64)


def _fade(t):
    return t * t * t * (t * (t * 6 - 15) + 10)


def perlin(p, seed=0):
    """Gradient noise in roughly [-1, 1] for an (N, 3) array."""
    p = np.asarray(p, np.float64) + seed * 17.123
    pi = np.floor(p).astype(np.int64)
    pf = p - pi
    pi &= 255
    u = _fade(pf)
    X, Y, Z = pi[:, 0], pi[:, 1], pi[:, 2]
    out = 0

    def g(ix, iy, iz, dx, dy, dz):
        h = _PERM[_PERM[_PERM[ix] + iy] + iz] % 12
        G = _GRAD[h]
        return G[:, 0] * dx + G[:, 1] * dy + G[:, 2] * dz
    x, y, z = pf[:, 0], pf[:, 1], pf[:, 2]
    n000 = g(X, Y, Z, x, y, z)
    n100 = g(X + 1, Y, Z, x - 1, y, z)
    n010 = g(X, Y + 1, Z, x, y - 1, z)
    n110 = g(X + 1, Y + 1, Z, x - 1, y - 1, z)
    n001 = g(X, Y, Z + 1, x, y, z - 1)
    n101 = g(X + 1, Y, Z + 1, x - 1, y, z - 1)
    n011 = g(X, Y + 1, Z + 1, x, y - 1, z - 1)
    n111 = g(X + 1, Y + 1, Z + 1, x - 1, y - 1, z - 1)
    ux, uy, uz = u[:, 0], u[:, 1], u[:, 2]
    nx00 = n000 + ux * (n100 - n000)
    nx10 = n010 + ux * (n110 - n010)
    nx01 = n001 + ux * (n101 - n001)
    nx11 = n011 + ux * (n111 - n011)
    nxy0 = nx00 + uy * (nx10 - nx00)
    nxy1 = nx01 + uy * (nx11 - nx01)
    out = nxy0 + uz * (nxy1 - nxy0)
    return out * 1.4


def fbm(p, octaves=4, lac=2.03, gain=0.5, seed=0):
    p = np.asarray(p, np.float64)
    amp, tot, norm = 1.0, 0.0, 0.0
    for o in range(octaves):
        tot = tot + perlin(p, seed + o * 7) * amp
        norm += amp
        amp *= gain
        p = p * lac
    return tot / norm


def ridged(p, octaves=4, seed=0):
    return 1 - np.abs(fbm(p, octaves, seed=seed))


def worley(p, seed=0):
    """(F1, F2) distances to jittered cell points."""
    p = np.asarray(p, np.float64)
    pi = np.floor(p).astype(np.int64)
    f1 = np.full(len(p), 9.0)
    f2 = np.full(len(p), 9.0)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                c = pi + np.array([dx, dy, dz])
                h = (c[:, 0] * 73856093) ^ (c[:, 1] * 19349663) ^ (c[:, 2] * 83492791) ^ (seed * 2654435761)
                h = h & 0xffffffff
                jx = ((h * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
                jy = ((h * 214013 + 2531011) & 0x7fffffff) / 0x7fffffff
                jz = ((h * 22695477 + 1) & 0x7fffffff) / 0x7fffffff
                pt = c + np.stack([jx, jy, jz], 1)
                d = np.linalg.norm(pt - p, axis=1)
                f2 = np.where(d < f1, f1, np.minimum(f2, d))
                f1 = np.minimum(f1, d)
    return f1, f2


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def mix(a, b, t):
    t = np.asarray(t)
    if t.ndim == 1:
        t = t[:, None]
    return a * (1 - t) + b * t


def srgb_to_lin(c):
    c = np.asarray(c)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
