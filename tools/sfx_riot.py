"""The RIOT-12 (2026-10-22): a full-auto 12-gauge. Punchier and shorter than the pump gun's blast (the shots overlap at
five a second), with the open bolt's heavy clack.

    cd tools && /home/user/tools/bpyenv/bin/python sfx_riot.py
"""
import numpy as np
from sfx import write
from sfx_guns import report, glue


def riot(v):
    r = np.random.RandomState(700 + v)
    pitch = 1.04 + (r.rand() - 0.5) * 0.08
    x = report(r, 1.0, pitch, crack_ms=14, crack_hp=900,
               body=(320, 2800, 0.16, 0.036), body2=(100, 650, 0.18, 0.05),
               punch=(52, 175, 0.025, 0.22, 0.055, 2.8), mech=([(1400, 0.8), (2300, 0.6), (3900, 0.3)], (0.022, 0.012, 0.12)),
               slaps=((0.12, 0.22), (0.21, 0.14), (0.33, 0.08)), rumble=(300, 0.3, 0.3),
               rt=1.1, wet=0.16, seed=70 + v, gains=(1.1, 1.0, 0.9, 1.15))
    return glue(x, 1.7)


if __name__ == '__main__':
    for v in range(4):
        write(f'riot{v}', riot(v), br='128k')
