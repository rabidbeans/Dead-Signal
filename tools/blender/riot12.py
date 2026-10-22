"""Round 10 (2026-10-22): the RIOT-12, a drum-fed full-auto combat shotgun (AA-12 lineage). Opens after level 5.

    /home/user/tools/bpyenv/bin/python riot12.py

Same contract as guns.py: public/assets/weapons/riot12.glb with gun_frame / gun_slide / gun_mag (origin at the web of the
shooting hand, x forward, z up, -y the shooter's RIGHT), and riot12_icon.webp.

gun_slide is the charging handle on the top of the receiver (it rides back on a reload); gun_mag is the 20-round drum.
Olive polymer, black steel, a tan drum with a clear window and red shells behind it.
"""
import math
import os
import sys
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import guns as G  # noqa: E402
from guns import box, profile_extrude, tcyl, join, sphere, turn, mats, finish, R90  # noqa: E402
from weapons import reset, mat, boolean, apply_all  # noqa: E402


def riot12():
    reset()
    M = mats()
    olive = mat('poly_olive', (0.085, 0.095, 0.05), rough=0.62)
    olive_d = mat('poly_olive_dark', (0.045, 0.05, 0.028), rough=0.68)
    tan = mat('drum_tan', (0.24, 0.19, 0.11), rough=0.6)
    red = mat('shell_red', (0.62, 0.04, 0.025), rough=0.4)
    brass = mat('brass', (0.78, 0.52, 0.2), metal=1.0, rough=0.28)
    win = mat('drum_window', (0.03, 0.035, 0.04), metal=0.0, rough=0.08)
    pad = mat('recoil_pad', (0.03, 0.03, 0.032), rough=0.85)
    B = 0.035                           # the bore's height
    parts = []

    # ---- the receiver: a long slab-sided box, the stock straight out of the back of it (in line with the bore)
    rc = profile_extrude('receiver', [(-0.02, -0.03), (0.33, -0.03), (0.33, 0.062), (0.315, 0.072), (0.0, 0.072), (-0.02, 0.062)],
                         0.056, bevel=0.004, material=olive)
    apply_all(rc)
    boolean(rc, box('port', (0.08, 0.02, 0.026), (0.2, -0.026, 0.035), bevel=0))        # ejection port, right side
    boolean(rc, box('well', (0.07, 0.04, 0.03), (0.12, 0, -0.03), bevel=0))              # the drum's well underneath
    parts.append(rc)
    parts.append(box('bolt', (0.075, 0.006, 0.022), (0.2, -0.022, 0.035), M['worn'], bevel=0.001))
    # ribs moulded into the sides and a steel rail along the top
    for s in (-1, 1):
        for i in range(5):
            parts.append(box('rib', (0.03, 0.004, 0.05), (0.02 + i * 0.045, s * 0.029, 0.02), olive_d, bevel=0.0015))
    parts.append(box('rail', (0.3, 0.022, 0.008), (0.16, 0, 0.076), M['steel'], bevel=0.001))
    for i in range(14):
        parts.append(box('slot', (0.009, 0.024, 0.004), (0.02 + i * 0.021, 0, 0.081), M['steel'], bevel=0))
    # the carry handle with its sight tunnel
    for x in (0.05, 0.24):
        parts.append(box('post', (0.02, 0.02, 0.05), (x, 0, 0.1), olive, bevel=0.003))
    parts.append(box('handle', (0.23, 0.026, 0.02), (0.145, 0, 0.13), olive, bevel=0.006))
    parts.append(box('sight_r', (0.012, 0.016, 0.024), (0.052, 0, 0.152), M['steel'], bevel=0.001))
    # ---- the stock, in line: a skeleton of polymer, a fat rubber butt
    st = profile_extrude('stock', [(-0.02, 0.06), (-0.29, 0.05), (-0.31, 0.04), (-0.31, -0.065), (-0.29, -0.075), (-0.2, -0.06),
                                   (-0.1, -0.035), (-0.02, -0.025)], 0.046, bevel=0.006, segs=2, material=olive)
    apply_all(st)
    boolean(st, profile_extrude('stock_hole', [(-0.08, 0.035), (-0.26, 0.03), (-0.26, -0.03), (-0.2, -0.04), (-0.1, -0.015)], 0.08, bevel=0))
    parts.append(st)
    parts.append(profile_extrude('butt', [(-0.305, 0.05), (-0.335, 0.05), (-0.338, -0.074), (-0.305, -0.076)], 0.05, bevel=0.008, segs=2, material=pad))
    parts.append(box('cheek', (0.12, 0.05, 0.012), (-0.17, 0, 0.058), olive_d, bevel=0.003))
    # ---- pistol grip, trigger guard, trigger, selector
    gp = profile_extrude('grip', [(0.0, -0.03), (0.05, -0.03), (0.04, -0.06), (0.012, -0.135), (-0.035, -0.135), (-0.025, -0.12), (-0.005, -0.06)],
                         0.034, bevel=0.007, segs=2, material=olive_d)
    parts.append(gp)
    for i in range(4):
        parts.append(box('gripline', (0.004, 0.036, 0.016), (0.02 - i * 0.012 + 0.005, 0, -0.065 - i * 0.017), olive, bevel=0))
    tg = profile_extrude('tguard', [(0.045, -0.03), (0.13, -0.03), (0.125, -0.04), (0.11, -0.066), (0.06, -0.068), (0.05, -0.055)],
                         0.018, bevel=0.002, material=olive)
    apply_all(tg)
    boolean(tg, profile_extrude('tg_hole', [(0.058, -0.025), (0.114, -0.025), (0.1, -0.058), (0.066, -0.06), (0.058, -0.048)], 0.05, bevel=0))
    parts.append(tg)
    parts.append(profile_extrude('trigger', [(0.077, -0.03), (0.087, -0.03), (0.082, -0.054), (0.075, -0.056)], 0.007, bevel=0.0008, material=M['worn']))
    parts.append(tcyl('selector', 0.006, 0.06, (0.03, 0, 0.0), M['worn'], verts=10, rot=(R90, 0, 0)))
    # ---- the front: a perforated heat shield round the barrel, a muzzle brake, a vertical grip, the front sight
    parts.append(tcyl('barrel', 0.0125, 0.34, (0.49, 0, B), M['blued'], verts=16))
    sh = tcyl('shroud', 0.026, 0.22, (0.44, 0, B), olive, verts=16)
    for i in range(7):
        for a in (-1, 1):
            c = tcyl('vent', 0.009, 0.07, (0.36 + i * 0.027, 0, B + a * 0.012), rot=(R90, 0, 0), verts=8)
            boolean(sh, c)
    parts.append(sh)
    parts.append(tcyl('shroud_cap', 0.028, 0.012, (0.554, 0, B), olive_d, verts=16))
    mb = tcyl('brake', 0.02, 0.055, (0.64, 0, B), M['steel'], verts=14)
    for i in range(3):
        boolean(mb, box('port', (0.008, 0.06, 0.03), (0.625 + i * 0.014, 0, B + 0.012), bevel=0))
    parts.append(mb)
    parts.append(box('fsight', (0.012, 0.012, 0.04), (0.53, 0, B + 0.045), olive, bevel=0.002))
    parts.append(box('fsight_ring', (0.02, 0.03, 0.006), (0.53, 0, B + 0.066), olive, bevel=0.002))
    fg = profile_extrude('foregrip', [(0.37, -0.0), (0.43, -0.0), (0.425, -0.03), (0.42, -0.1), (0.39, -0.106), (0.375, -0.09), (0.37, -0.03)],
                         0.034, bevel=0.007, segs=2, material=olive_d)
    parts.append(fg)
    parts.append(box('fg_rail', (0.09, 0.04, 0.01), (0.4, 0, B - 0.03), M['steel'], bevel=0.001))
    parts.append(box('sling', (0.012, 0.006, 0.02), (-0.28, 0.026, -0.03), M['worn'], bevel=0.001))
    frame = join(parts, 'gun_frame')

    # ---- gun_slide: the charging handle on the left of the carry handle's front post
    sl = [box('ch_body', (0.05, 0.012, 0.016), (0.205, 0.034, 0.055), M['steel'], bevel=0.002),
          tcyl('ch_knob', 0.009, 0.026, (0.22, 0.05, 0.055), M['worn'], verts=10, rot=(R90, 0, 0))]
    slide = join(sl, 'gun_slide')

    # ---- gun_mag: the 20-round drum, a window showing the red shells inside
    dz = -0.1
    dm = [tcyl('drum', 0.078, 0.06, (0.12, 0, dz), tan, verts=28, rot=(R90, 0, 0))]
    for s in (-1, 1):
        # a steel band round each edge of the drum (a ring, so the tan face shows), the winding hub in the middle
        bpy.ops.mesh.primitive_torus_add(major_radius=0.076, minor_radius=0.0045, major_segments=32, minor_segments=6,
                                         location=(0.12, s * 0.03, dz), rotation=(R90, 0, 0))
        tr = bpy.context.active_object
        tr.data.materials.append(M['steel'])
        dm.append(tr)
        dm.append(tcyl('drum_hub', 0.022, 0.008, (0.12, s * 0.032, dz), M['steel'], verts=12, rot=(R90, 0, 0)))
        dm.append(tcyl('drum_key', 0.006, 0.014, (0.12, s * 0.038, dz), M['worn'], verts=8, rot=(R90, 0, 0)))
    dm.append(box('drum_neck', (0.068, 0.05, 0.05), (0.12, 0, -0.04), tan, bevel=0.004))
    # a crescent window on the left face, the shells' rims and red hulls behind it
    dm.append(box('window', (0.07, 0.004, 0.022), (0.12, 0.033, dz - 0.05), win, bevel=0.002))
    for i in range(5):
        x = 0.093 + i * 0.0135
        dm.append(tcyl('shell', 0.0065, 0.004, (x, 0.0325, dz - 0.05), red, verts=10, rot=(R90, 0, 0)))
        dm.append(tcyl('shell_b', 0.0068, 0.002, (x, 0.0348, dz - 0.05), brass, verts=10, rot=(R90, 0, 0)))
    for a in range(8):
        ang = a * math.pi / 4
        dm.append(box('drum_bolt', (0.006, 0.065, 0.006), (0.12 + math.cos(ang) * 0.066, 0, dz + math.sin(ang) * 0.066), M['worn'], bevel=0))
    mag = join(dm, 'gun_mag')
    finish('riot12', frame, slide, mag, side=+1, extra={
        'bore z': B, 'tip': (0.668, B), 'grip centre': (-0.01, -0.06), 'foregrip x': 0.4, 'drum centre': (0.12, dz),
        'charging handle x': 0.22})


if __name__ == '__main__':
    riot12()
