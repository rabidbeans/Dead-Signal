"""The hidden power weapons (2026-10-21): found in a locked hard case somewhere in a level, a handful of shots, gone
when they run dry.

    python power_guns.py [crossbow] [flamer] [launcher]        (all three when none is named)

Same contract as guns.py: public/assets/weapons/<name>.glb with gun_frame / gun_slide / gun_mag (origins at the web of
the shooting hand, x forward, z up, -y the shooter's RIGHT, metres) and <name>_icon.webp.

  crossbow   a compound crossbow: a skeletal stock, a long rail, two cam limbs, the string cocked, a bolt on the rail
             (gun_mag), a scope. Bore z 0.07.
  flamer     a flamethrower wand: a perforated heat shield over the barrel, a nozzle with a pilot flame, a red fuel
             bottle slung under it (gun_mag), hoses, a front grip. Bore z 0.05.
  launcher   a six-shot revolving grenade launcher: the big drum (gun_mag), a fat 40 mm barrel, a folding stock, a
             ladder sight, a front grip. Bore z 0.07.
"""
import math
import os
import sys
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from weapons import reset, mat, apply_all, boolean  # noqa: E402
from guns import box, profile_extrude, join, sphere, cone, turn, tcyl, mats, finish  # noqa: E402

R90 = math.radians(90)


def crossbow():
    reset()
    M = mats()
    wood = mat('cb_wood', (0.22, 0.12, 0.05), rough=0.55)
    limb = mat('cb_limb', (0.06, 0.07, 0.05), rough=0.5)
    string = mat('cb_string', (0.75, 0.72, 0.62), rough=0.7)
    fletch = mat('cb_fletch', (0.85, 0.12, 0.05), rough=0.6)
    B = 0.07
    parts = []
    # stock and grip: a skeletal stock in walnut
    stk = profile_extrude('stock', [(-0.05, 0.05), (-0.3, 0.07), (-0.32, 0.06), (-0.32, -0.06), (-0.29, -0.065), (-0.17, -0.005), (-0.05, 0.0)],
                          0.04, bevel=0.006, material=wood)
    apply_all(stk)
    boolean(stk, profile_extrude('hole', [(-0.13, 0.035), (-0.27, 0.05), (-0.27, -0.03), (-0.18, 0.005)], 0.08, bevel=0))
    parts.append(stk)
    parts.append(box('buttpad', (0.014, 0.044, 0.135), (-0.325, 0, 0.003), M['poly'], bevel=0.004))
    parts.append(profile_extrude('grip', [(-0.03, 0.005), (0.025, 0.005), (0.01, -0.1), (-0.045, -0.094), (-0.05, -0.06)], 0.03, bevel=0.005, material=wood))
    tg = profile_extrude('tguard', [(0.02, -0.005), (0.075, -0.005), (0.075, -0.045), (0.03, -0.045)], 0.012, bevel=0.0015, material=M['steel'])
    apply_all(tg)
    boolean(tg, box('tgh', (0.04, 0.05, 0.03), (0.05, 0, -0.025), bevel=0))
    parts.append(tg)
    parts.append(profile_extrude('trigger', [(0.04, -0.005), (0.047, -0.005), (0.043, -0.033), (0.036, -0.035)], 0.006, bevel=0.0006, material=M['worn']))
    # the rail: a long aluminium beam with a groove for the bolt, a foregrip under it
    parts.append(box('rail', (0.58, 0.032, 0.03), (0.22, 0, B - 0.018), M['steel'], bevel=0.003))
    parts.append(box('groove', (0.56, 0.008, 0.004), (0.22, 0, B - 0.002), M['poly'], bevel=0))
    parts.append(box('fore', (0.2, 0.04, 0.03), (0.22, 0, B - 0.045), M['poly'], bevel=0.006))
    for i in range(6):
        parts.append(box('rib', (0.012, 0.042, 0.032), (0.14 + i * 0.03, 0, B - 0.047), M['steel'], bevel=0.002))
    parts.append(box('latch', (0.07, 0.04, 0.035), (0.0, 0, B), M['steel'], bevel=0.004))
    # the riser at the front and two limbs swept back, cams at their tips
    parts.append(box('riser', (0.06, 0.09, 0.06), (0.49, 0, B - 0.01), M['steel'], bevel=0.008))
    tips = []
    for s in (-1, 1):
        lm = box(f'limb{s}', (0.04, 0.27, 0.012), (0.47, s * 0.14, B - 0.0), limb, bevel=0.004)
        turn(lm, (0, 0, s * math.radians(-14)))
        parts.append(lm)
        tip = (0.43, s * 0.27, B)
        tips.append(tip)
        cam = tcyl(f'cam{s}', 0.028, 0.014, tip, M['worn'], verts=16, rot=(0, 0, 0))
        parts.append(cam)
        parts.append(tcyl(f'axle{s}', 0.006, 0.03, tip, M['steel'], verts=8, rot=(0, 0, 0)))
    # the string, drawn back to the latch (a thin cylinder each side)
    for s, (tx, ty, tz) in zip((-1, 1), tips):
        dx, dy = 0.02 - tx, 0 - ty
        Ls = math.hypot(dx, dy)
        st = tcyl(f'str{s}', 0.0025, Ls, ((tx + 0.02) / 2, ty / 2, B + 0.003), string, verts=6, rot=(0, R90, 0))
        st.rotation_euler = (0, R90, math.atan2(dy, dx))
        parts.append(st)
    # the scope
    parts.append(tcyl('scope', 0.017, 0.2, (0.1, 0, B + 0.06), M['steel'], verts=16))
    parts.append(tcyl('obj', 0.022, 0.04, (0.21, 0, B + 0.06), M['steel'], verts=16))
    parts.append(tcyl('eye', 0.02, 0.03, (-0.01, 0, B + 0.06), M['steel'], verts=16))
    parts.append(tcyl('lens', 0.019, 0.003, (0.231, 0, B + 0.06), M['glass'], verts=16))
    for x in (0.05, 0.15):
        parts.append(box('ring', (0.016, 0.026, 0.05), (x, 0, B + 0.035), M['steel'], bevel=0.003))
    parts.append(tcyl('turret', 0.009, 0.025, (0.1, 0, B + 0.083), M['worn'], verts=10, rot=(0, 0, 0)))
    frame = join(parts, 'gun_frame')
    # gun_slide: the cocking stirrup at the front
    sl = [box('stirrup', (0.03, 0.09, 0.008), (0.545, 0, B - 0.04), M['steel'], bevel=0.002),
          box('stirrup_b', (0.012, 0.012, 0.06), (0.545, -0.04, B - 0.02), M['steel'], bevel=0.002),
          box('stirrup_c', (0.012, 0.012, 0.06), (0.545, 0.04, B - 0.02), M['steel'], bevel=0.002)]
    slide = join(sl, 'gun_slide')
    # gun_mag: the bolt on the rail (a broadhead, a red fletch)
    bolt = [tcyl('shaft', 0.0045, 0.48, (0.25, 0, B + 0.006), M['poly'], verts=8),
            cone('head', 0.012, 0.0, 0.05, (0.515, 0, B + 0.006), M['worn'], verts=6),
            box('fl0', (0.06, 0.002, 0.022), (0.04, 0, B + 0.016), fletch, bevel=0),
            box('fl1', (0.06, 0.022, 0.002), (0.04, -0.008, B + 0.006), fletch, bevel=0)]
    mag = join(bolt, 'gun_mag')
    finish('crossbow', frame, slide, mag, side=-1, extra={'bore z': B, 'fore palm x': 0.22})


def flamer():
    reset()
    M = mats()
    red = mat('fl_red', (0.45, 0.04, 0.02), metal=0.4, rough=0.4)
    brass = mat('fl_brass', (0.7, 0.5, 0.18), metal=1.0, rough=0.3)
    hose = mat('fl_hose', (0.03, 0.03, 0.03), rough=0.8)
    pilot = mat('fl_pilot', (1.0, 0.45, 0.1), rough=0.3, emit=(1.0, 0.5, 0.1))
    B = 0.05
    parts = []
    # the body: a box receiver, a pistol grip, a stock tube
    parts.append(box('body', (0.2, 0.05, 0.07), (0.04, 0, B - 0.005), M['steel'], bevel=0.008))
    parts.append(profile_extrude('grip', [(-0.03, 0.005), (0.025, 0.005), (0.01, -0.1), (-0.045, -0.094), (-0.05, -0.06)], 0.032, bevel=0.005, material=M['poly']))
    tg = profile_extrude('tguard', [(0.02, -0.005), (0.075, -0.005), (0.075, -0.045), (0.03, -0.045)], 0.013, bevel=0.0015, material=M['poly'])
    apply_all(tg)
    boolean(tg, box('tgh', (0.04, 0.05, 0.03), (0.05, 0, -0.025), bevel=0))
    parts.append(tg)
    parts.append(profile_extrude('trigger', [(0.04, -0.005), (0.048, -0.005), (0.044, -0.035), (0.036, -0.037)], 0.007, bevel=0.0006, material=M['worn']))
    parts.append(tcyl('stocktube', 0.016, 0.22, (-0.15, 0, B), M['steel'], verts=14))
    parts.append(box('butt', (0.03, 0.045, 0.12), (-0.26, 0, B - 0.02), M['poly'], bevel=0.006))
    # the wand: barrel inside a perforated heat shield, the nozzle, the pilot flame
    parts.append(tcyl('barrel', 0.012, 0.56, (0.42, 0, B), M['steel'], verts=14))
    shield = tcyl('shield', 0.032, 0.36, (0.36, 0, B), M['steel'], verts=20)
    apply_all(shield)
    for i in range(7):
        for a in range(4):
            c = tcyl('h', 0.009, 0.1, (0.22 + i * 0.045, 0, B), verts=8, rot=(a * math.pi / 4, 0, 0))
            c.rotation_euler = (a * math.pi / 4 + R90, 0, 0)
            boolean(shield, c)
    parts.append(shield)
    parts.append(tcyl('nozzle', 0.02, 0.06, (0.71, 0, B), brass, verts=16))
    parts.append(cone('tip', 0.022, 0.015, 0.03, (0.75, 0, B), brass, verts=16))
    parts.append(sphere('pilot', 0.012, (0.74, 0, B - 0.03), pilot, seg=10, rings=6))
    parts.append(tcyl('igniter', 0.006, 0.06, (0.71, 0, B - 0.026), M['steel'], verts=8))
    # the front grip and the valve
    parts.append(profile_extrude('fgrip', [(0.27, B - 0.03), (0.33, B - 0.03), (0.32, B - 0.13), (0.28, B - 0.13)], 0.03, bevel=0.006, material=M['poly']))
    parts.append(tcyl('valve', 0.016, 0.03, (0.13, -0.035, B + 0.01), red, verts=12, rot=(R90, 0, 0)))
    # hoses down to where the tank sits
    for i, (x0, z0, x1, z1) in enumerate(((0.12, B - 0.04, 0.2, -0.07), (0.16, B - 0.04, 0.28, -0.07))):
        L = math.hypot(x1 - x0, z1 - z0)
        h = tcyl(f'hose{i}', 0.008, L, ((x0 + x1) / 2, 0.012 * (i * 2 - 1), (z0 + z1) / 2), hose, verts=8)
        h.rotation_euler = (0, R90 + math.atan2(z0 - z1, x1 - x0), 0)
        parts.append(h)
    frame = join(parts, 'gun_frame')
    slide = join([tcyl('vknob', 0.012, 0.02, (0.13, -0.055, B + 0.01), brass, verts=10, rot=(R90, 0, 0))], 'gun_slide')
    # gun_mag: the fuel bottle slung under the wand, its gauge, the strap bands
    tank = [tcyl('tank', 0.045, 0.3, (0.24, 0, -0.1), red, verts=20),
            sphere('cap0', 0.045, (0.39, 0, -0.1), red, seg=16, rings=8), sphere('cap1', 0.045, (0.09, 0, -0.1), red, seg=16, rings=8),
            tcyl('gauge', 0.016, 0.012, (0.32, -0.046, -0.08), M['worn'], verts=12, rot=(R90, 0, 0)),
            box('label', (0.12, 0.002, 0.03), (0.22, -0.046, -0.1), mat('fl_label', (0.9, 0.75, 0.1), rough=0.5), bevel=0)]
    for x in (0.16, 0.32):
        tank.append(tcyl('band', 0.047, 0.012, (x, 0, -0.1), M['steel'], verts=20))
    mag = join(tank, 'gun_mag')
    finish('flamer', frame, slide, mag, side=-1, extra={'bore z': B, 'fore palm x': 0.30})


def launcher():
    reset()
    M = mats()
    olive = mat('gl_olive', (0.12, 0.13, 0.07), rough=0.6)
    tan = mat('gl_tan', (0.4, 0.33, 0.2), rough=0.6)
    B = 0.07
    parts = []
    parts.append(box('frame', (0.16, 0.05, 0.06), (0.0, 0, B - 0.03), olive, bevel=0.008))
    parts.append(profile_extrude('grip', [(-0.03, 0.005), (0.025, 0.005), (0.01, -0.1), (-0.045, -0.094), (-0.05, -0.06)], 0.032, bevel=0.005, material=M['poly']))
    tg = profile_extrude('tguard', [(0.02, -0.005), (0.075, -0.005), (0.075, -0.045), (0.03, -0.045)], 0.013, bevel=0.0015, material=M['poly'])
    apply_all(tg)
    boolean(tg, box('tgh', (0.04, 0.05, 0.03), (0.05, 0, -0.025), bevel=0))
    parts.append(tg)
    parts.append(profile_extrude('trigger', [(0.04, -0.005), (0.048, -0.005), (0.044, -0.035), (0.036, -0.037)], 0.007, bevel=0.0006, material=M['worn']))
    # top strap over the drum to the barrel, the fat barrel
    parts.append(box('strap', (0.36, 0.04, 0.02), (0.17, 0, B + 0.075), olive, bevel=0.004))
    parts.append(box('rear', (0.03, 0.08, 0.15), (0.075, 0, B + 0.005), olive, bevel=0.006))
    parts.append(box('front', (0.03, 0.08, 0.15), (0.275, 0, B + 0.005), olive, bevel=0.006))
    bar = tcyl('barrel', 0.03, 0.3, (0.43, 0, B + 0.02), M['steel'], verts=20)
    apply_all(bar)
    boolean(bar, tcyl('bore', 0.022, 0.32, (0.44, 0, B + 0.02), verts=16))
    parts.append(bar)
    parts.append(tcyl('muzzle', 0.034, 0.03, (0.57, 0, B + 0.02), M['steel'], verts=20))
    # front grip, ladder sight, folding stock
    parts.append(profile_extrude('fgrip', [(0.36, B - 0.012), (0.42, B - 0.012), (0.41, B - 0.11), (0.37, B - 0.11)], 0.032, bevel=0.006, material=tan))
    parts.append(box('ladder', (0.012, 0.035, 0.06), (0.22, 0, B + 0.115), M['steel'], bevel=0.002))
    parts.append(box('ladder2', (0.04, 0.03, 0.006), (0.22, 0, B + 0.145), M['steel'], bevel=0.0015))
    parts.append(tcyl('stocktube', 0.015, 0.2, (-0.14, 0, B - 0.01), M['steel'], verts=14))
    parts.append(profile_extrude('stock', [(-0.17, B + 0.03), (-0.29, B + 0.035), (-0.3, B + 0.02), (-0.3, -0.07), (-0.27, -0.075), (-0.2, B - 0.05)], 0.04, bevel=0.006, material=tan))
    parts.append(box('buttpad', (0.012, 0.042, 0.13), (-0.305, 0, B - 0.025), M['poly'], bevel=0.004))
    frame = join(parts, 'gun_frame')
    slide = join([box('release', (0.02, 0.012, 0.03), (0.07, -0.045, B + 0.04), M['worn'], bevel=0.002)], 'gun_slide')
    # gun_mag: the six-shot drum (along the barrel's axis), its chambers' rims and the round noses
    drum = tcyl('drum', 0.075, 0.17, (0.175, 0, B + 0.005), olive, verts=24)
    apply_all(drum)
    for i in range(6):
        a = i * math.pi / 3
        boolean(drum, box('flute', (0.13, 0.014, 0.03), (0.175, math.cos(a + math.pi / 6) * 0.075, B + 0.005 + math.sin(a + math.pi / 6) * 0.075), bevel=0))
    dr = [drum]
    gold = mat('gl_round', (0.7, 0.55, 0.15), metal=0.9, rough=0.35)
    for i in range(6):
        a = i * math.pi / 3
        dr.append(tcyl(f'rim{i}', 0.022, 0.006, (0.26, math.cos(a) * 0.045, B + 0.005 + math.sin(a) * 0.045), gold, verts=12))
    dr.append(tcyl('axis', 0.012, 0.19, (0.175, 0, B + 0.005), M['steel'], verts=10))
    mag = join(dr, 'gun_mag')
    finish('launcher', frame, slide, mag, side=-1, extra={'bore z': B + 0.02, 'fore palm x': 0.39})


if __name__ == '__main__':
    want = sys.argv[1:] or ['crossbow', 'flamer', 'launcher']
    for n in want:
        {'crossbow': crossbow, 'flamer': flamer, 'launcher': launcher}[n]()
