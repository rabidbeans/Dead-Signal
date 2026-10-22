"""Third pass (2026-10-22): the blood on the screen when you are hurt, and a boot print for bloody footprints.

    /home/user/tools/bpyenv/bin/python tools/texgen3.py
"""
import os
import sys
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from texgen import pnoise, smooth, hexc, lerp, rgba  # noqa: E402


def screen_blood(w=1024, h=576):
    """Splatters and runs at the edges of the screen, nothing in the middle third."""
    rs = np.random.RandomState(77)
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = x / w, y / h
    a = np.zeros((h, w), np.float32)
    # a soft rim of smeared blood
    edge = np.minimum(np.minimum(u, 1 - u) * 1.6, np.minimum(v, 1 - v))
    n = pnoise(1024, 8, 5)[:h, :w] * 0.5 + pnoise(1024, 24, 6)[:h, :w] * 0.3
    a = np.maximum(a, smooth(0.11 + n * 0.08, 0.0, edge) * 0.85)
    # splats: blobs with droplets flung around them, mostly near the edges
    for i in range(34):
        side = rs.randint(4)
        t0 = rs.rand()
        cx, cy = [(t0, rs.rand() * 0.12), (t0, 1 - rs.rand() * 0.12), (rs.rand() * 0.1, t0), (1 - rs.rand() * 0.1, t0)][side]
        r0 = 0.015 + rs.rand() ** 2 * 0.07
        dx, dy = (u - cx) * (w / h), v - cy
        d = np.hypot(dx, dy)
        wob = 1 + 0.25 * np.sin(np.arctan2(dy, dx) * (5 + rs.randint(6)) + rs.rand() * 6)
        a = np.maximum(a, smooth(r0 * wob, r0 * wob * 0.7, d))
        for k in range(10):
            ang = rs.rand() * 2 * np.pi
            dist = r0 * (1.3 + rs.rand() * 2.5)
            rr = r0 * (0.06 + rs.rand() * 0.18)
            px, py = cx + np.cos(ang) * dist * h / w, cy + np.sin(ang) * dist
            dd = np.hypot((u - px) * (w / h), v - py)
            a = np.maximum(a, smooth(rr, rr * 0.5, dd))
        # a run dripping down from it
        if rs.rand() < 0.5 and cy < 0.5:
            ln = 0.08 + rs.rand() * 0.25
            wd = r0 * 0.25
            px = cx + rs.randn() * 0.002
            run = smooth(wd, wd * 0.4, np.abs((u - px) * (w / h))) * smooth(cy + ln, cy + ln - 0.02, v) * (v > cy)
            a = np.maximum(a, run * 0.9)
            tip = np.hypot((u - px) * (w / h), v - (cy + ln))
            a = np.maximum(a, smooth(wd * 1.6, wd * 0.8, tip))
    a = np.clip(a, 0, 1) * (0.88 + 0.12 * pnoise(1024, 40, 9)[:h, :w])
    # colour: bright arterial red where thin, near black where it pools
    col = lerp(hexc('#8a0c08'), hexc('#2a0202'), np.clip(a * 1.2, 0, 1))
    col = col * (0.85 + 0.25 * pnoise(1024, 60, 10)[:h, :w])[..., None]
    rgba('screenblood', col, a * 0.95)


def footprint(w=64, h=128):
    """One boot print (the right foot), toe toward -y: a sole with lugs and a separate heel."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = (x + 0.5) / w * 2 - 1, (y + 0.5) / h * 2 - 1
    sole = smooth(1.0, 0.85, np.hypot(u / 0.78, (v + 0.32) / 0.6))
    heel = smooth(1.0, 0.85, np.hypot(u / 0.62, (v - 0.62) / 0.3))
    lugs = (np.sin(v * 38) > -0.2) * 0.55 + 0.45
    a = np.maximum(sole, heel) * lugs
    a *= 0.75 + 0.25 * pnoise(128, 8, 3)[:h, :w]
    col = lerp(hexc('#4a0806'), hexc('#220202'), a)
    rgba('footprint', col, a * 0.9)


if __name__ == '__main__':
    screen_blood()
    footprint()
