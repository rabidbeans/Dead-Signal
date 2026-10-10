"""Boxy vehicles for the street: bus, van, ambulance, pickup, SUV.

    python vehicles.py   ->  public/assets/props/vehicles.glb

Same conventions as props.py's cars: x is the length (front = +x), origin at
the footprint centre on the ground, materials named 'paint' (tinted per
vehicle in game), 'glass', 'trim', 'tire', 'rim', 'headlight', 'taillight'.
"""
import bpy
import math
import os
import sys
import random
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import props as P  # noqa: E402
from props import mat, profile, box, cyl, bevel, apply, boolean, join, uv_cube, place_origin_floor  # noqa: E402

OUT = os.path.join(HERE, '..', '..', 'public', 'assets', 'props')
R = random.Random(5)


def mats():
    return dict(
        paint=mat('paint', (0.3, 0.3, 0.32), metal=0.6, rough=0.32),
        white=mat('paint_white', (0.75, 0.75, 0.73), metal=0.3, rough=0.35),
        glass=mat('glass', (0.02, 0.025, 0.03), rough=0.05),
        trim=mat('trim', (0.03, 0.03, 0.03), rough=0.7),
        tire=mat('tire', (0.025, 0.025, 0.025), rough=0.85),
        rim=mat('rim', (0.5, 0.5, 0.52), metal=1.0, rough=0.35),
        head=mat('headlight', (0.8, 0.8, 0.75), rough=0.1),
        tail=mat('taillight', (0.35, 0.02, 0.02), rough=0.15),
        red=mat('lightbar_red', (0.4, 0.02, 0.02), rough=0.2, emit=(1, 0.05, 0.03)),
        blue=mat('lightbar_blue', (0.02, 0.05, 0.4), rough=0.2, emit=(0.05, 0.2, 1)),
        rust=mat('rust', (0.28, 0.14, 0.08), metal=0.5, rough=0.8),
        steel=mat('steel', (0.45, 0.46, 0.47), metal=0.9, rough=0.4),
        redpaint=mat('cross_red', (0.5, 0.03, 0.03), rough=0.4),
    )


def wheel(x, y, z, r, w, m):
    t = cyl('t', r, w, (x, y, z), rot=(math.radians(90), 0, 0), verts=22, material=m['tire'])
    bevel(t, 0.05, 2)
    rm = cyl('r', r * 0.62, w + 0.01, (x, y, z), rot=(math.radians(90), 0, 0), verts=14, material=m['rim'])
    hub = cyl('h', r * 0.2, w + 0.04, (x, y, z), rot=(math.radians(90), 0, 0), verts=8, material=m['steel'])
    return [t, rm, hub]


def sideprofile(name, pts, W, m, bev=0.06):
    ob = profile(name, pts, W, m['paint'])
    # soften corners in plan (front and rear narrow slightly)
    L = max(abs(p[0]) for p in pts)
    for v in ob.data.vertices:
        v.co.y *= 1 - 0.07 * (abs(v.co.x) / L) ** 4
    bevel(ob, bev, 3, 28)
    apply(ob)
    return ob


def vehicle(name, L, W, H, ground, belt, hood, cowl, roof_f, roof_r, rear_h, wheels, tire_r, kind, m):
    x0, x1 = -L / 2, L / 2
    body = sideprofile(name + '_body', [
        (x0, ground), (x1 - 0.1, ground), (x1, ground + 0.2), (x1, hood - 0.1), (x1 - 0.25, hood), (cowl, hood + 0.03),
        (cowl - 0.05, belt), (x0 + 0.1, belt), (x0, belt - 0.05)], W, m)
    parts = [body]
    for wx, wr in wheels:
        for s in (-1, 1):
            boolean(body, cyl('a', tire_r + 0.08, 0.5, (wx, s * (W / 2 - 0.12), ground + tire_r - 0.05), rot=(math.radians(90), 0, 0), verts=20))
    # cab / greenhouse
    cab = profile(name + '_cab', [(cowl - 0.05, belt), (roof_f, H - 0.05), (roof_f - 0.1, H), (roof_r + 0.1, H), (roof_r, H - 0.05), (roof_r - 0.12, belt)], W - 0.08, m['glass'])
    for v in cab.data.vertices:
        v.co.y *= 1 - 0.1 * max(0.0, min(1.0, (v.co.z - belt) / max(H - belt, 0.1)))
    bevel(cab, 0.05, 2, 30)
    apply(cab)
    cab.data.materials.append(m['paint'])
    for poly in cab.data.polygons:
        if poly.normal.z > 0.8:
            poly.material_index = 1
    parts.append(cab)
    # window pillars, door seams
    for px in (cowl - 0.5, (roof_f + roof_r) / 2, roof_r + 0.25):
        parts.append(box('pil', (0.07, W + 0.01, H - belt - 0.25), (px, 0, (H + belt) / 2), m['paint']))
    parts.append(box('seam', (0.012, W + 0.012, belt - ground - 0.25), ((cowl + roof_r) / 2 + 0.2, 0, (belt + ground) / 2 + 0.05), m['trim']))
    # bumpers, grille, lights
    parts.append(box('fb', (0.22, W + 0.04, 0.26), (x1 - 0.02, 0, ground + 0.22), m['trim']))
    bevel(parts[-1], 0.05, 2)
    parts.append(box('rb', (0.22, W + 0.04, 0.26), (x0 + 0.02, 0, ground + 0.24), m['trim']))
    bevel(parts[-1], 0.05, 2)
    parts.append(box('grille', (0.06, W * 0.45, 0.28), (x1 + 0.0, 0, hood - 0.3), m['trim']))
    for s in (-1, 1):
        parts.append(box('hl', (0.08, 0.34, 0.16), (x1 - 0.02, s * (W / 2 - 0.3), hood - 0.28), m['head']))
        parts.append(box('tl', (0.07, 0.3, 0.3), (x0 + 0.01, s * (W / 2 - 0.12), belt - 0.35), m['tail']))
        parts.append(box('mirror', (0.12, 0.28, 0.22), (cowl - 0.3, s * (W / 2 + 0.22), belt + 0.35), m['trim']))
        parts.append(box('marm', (0.05, 0.22, 0.04), (cowl - 0.3, s * (W / 2 + 0.1), belt + 0.3), m['trim']))
    parts.append(box('plate', (0.02, 0.45, 0.15), (x1 + 0.02, 0, ground + 0.36), m['white']))
    parts.append(box('plate2', (0.02, 0.45, 0.15), (x0 - 0.01, 0, ground + 0.4), m['white']))
    for wx, wr in wheels:
        for s in (-1, 1):
            parts += wheel(wx, s * (W / 2 - 0.15), ground + tire_r - 0.05, tire_r, 0.26 if wr == 1 else 0.3, m)
    return parts, body


def bus(m):
    L, W, H = 11.6, 2.55, 3.15
    ground, belt = 0.42, 2.85
    parts, body = vehicle('bus', L, W, 3.2, ground, belt, 2.7, 5.0, 5.6, -5.6, 3.0, [(3.7, 1), (-3.1, 2), (-4.3, 2)], 0.5, 'bus', m)
    # one long body: replace cab with full-height box + window strip
    parts = [body]
    for wx in (3.7, -3.3):
        for s in (-1, 1):
            boolean(body, cyl('a', 0.62, 0.5, (wx, s * (W / 2 - 0.12), 0.46), rot=(math.radians(90), 0, 0), verts=22))
    top = profile('bus_top', [(-5.7, belt), (5.5, belt), (5.7, belt - 0.2), (5.7, 3.1), (5.5, H), (-5.5, H), (-5.7, 3.1)], W - 0.05, m['paint'])
    bevel(top, 0.12, 3, 30)
    apply(top)
    parts.append(top)
    # window strip on both sides: dark glass bands between pillars
    for s in (-1, 1):
        parts.append(box('wl', (10.5, 0.03, 0.85), (-0.1, s * (W / 2 + 0.005), 2.15), m['glass']))
    for i in range(13):
        parts.append(box('pil', (0.08, W + 0.02, 0.9), (-5.1 + i * 0.86, 0, 2.15), m['paint']))
    parts.append(box('wf', (0.04, W * 0.84, 0.9), (5.72, 0, 2.2), m['glass']))
    parts.append(box('wr', (0.04, W * 0.7, 0.75), (-5.72, 0, 2.3), m['glass']))
    parts.append(box('dest', (0.05, W * 0.6, 0.25), (5.73, 0, 2.95), m['red']))
    # doors (front and middle) dark
    for dx in (4.4, -0.3):
        for s in (-1, 1):
            parts.append(box('door', (0.95, 0.03, 1.9), (dx, s * (W / 2 + 0.006), 1.4), m['glass']))
    # livery stripe
    for s in (-1, 1):
        parts.append(box('stripe', (11.4, 0.02, 0.18), (0, s * (W / 2 + 0.008), 0.95), m['white']))
    # roof ac, bumpers, lights, mirrors
    parts.append(box('ac', (2.2, 1.5, 0.3), (-1.0, 0, 3.3), m['white']))
    bevel(parts[-1], 0.06, 2)
    parts.append(box('fb', (0.3, W + 0.05, 0.3), (5.65, 0, 0.55), m['trim']))
    parts.append(box('rb', (0.3, W + 0.05, 0.3), (-5.65, 0, 0.6), m['trim']))
    for s in (-1, 1):
        parts.append(box('hl', (0.08, 0.4, 0.2), (5.74, s * 0.95, 0.9), m['head']))
        parts.append(box('tl', (0.07, 0.3, 0.5), (-5.74, s * 1.1, 1.3), m['tail']))
        parts.append(box('mir', (0.1, 0.3, 0.6), (5.5, s * 1.45, 2.3), m['trim']))
    for wx, n in ((3.7, 1), (-3.1, 2), (-4.3, 2)):
        for s in (-1, 1):
            parts += wheel(wx, s * (W / 2 - 0.2), 0.5, 0.5, 0.32, m)
    ob = join('bus', parts)
    uv_cube(ob, 2.5)
    place_origin_floor(ob)
    return ob


def van(m, ambulance=False):
    name = 'ambulance' if ambulance else 'van'
    L, W = 5.9, 2.05
    parts, body = vehicle(name, L, W, 2.7 if ambulance else 2.55, 0.32, 1.1, 1.0, 1.9, 1.35, 0.9, 1.1, [(1.9, 1), (-1.8, 1)], 0.38, 'van', m)
    # cargo box over the rear
    bx = box('cargo', (3.95, W - 0.06, (2.7 if ambulance else 2.55) - 1.1), (-0.95, 0, (1.1 + (2.7 if ambulance else 2.55)) / 2), m['white'] if ambulance else m['paint'])
    bevel(bx, 0.1, 3, 30)
    parts.append(bx)
    parts.append(box('rdoor', (0.02, 0.02, 1.6), (-2.92, 0, 1.75), m['trim']))
    parts.append(box('rwin', (0.03, 0.8, 0.5), (-2.935, 0.45, 2.05), m['glass']))
    parts.append(box('rwin', (0.03, 0.8, 0.5), (-2.935, -0.45, 2.05), m['glass']))
    if ambulance:
        for s in (-1, 1):
            parts.append(box('stripe', (4.0, 0.02, 0.22), (-0.95, s * (W / 2 - 0.02), 1.45), m['redpaint']))
            parts.append(box('cr1', (0.7, 0.02, 0.2), (-1.0, s * (W / 2 - 0.02), 2.1), m['redpaint']))
            parts.append(box('cr2', (0.2, 0.02, 0.7), (-1.0, s * (W / 2 - 0.02), 2.1), m['redpaint']))
        parts.append(box('lb', (0.34, 1.35, 0.1), (1.6, 0, 2.55), m['trim']))
        parts.append(box('lbr', (0.26, 0.6, 0.12), (1.6, -0.34, 2.63), m['red']))
        parts.append(box('lbb', (0.26, 0.6, 0.12), (1.6, 0.34, 2.63), m['blue']))
    else:
        parts.append(box('rack', (3.7, 1.6, 0.05), (-1.0, 0, 2.58), m['steel']))
        for x in (-2.6, -1.6, -0.6, 0.4):
            parts.append(box('rk', (0.05, 1.6, 0.12), (x, 0, 2.62), m['steel']))
    ob = join(name, parts)
    uv_cube(ob, 2.0)
    place_origin_floor(ob)
    return ob


def pickup(m):
    L, W = 5.4, 2.0
    parts, body = vehicle('pickup', L, W, 1.85, 0.34, 1.1, 1.0, 0.9, 0.4, -0.75, 1.05, [(1.75, 1), (-1.7, 1)], 0.4, 'pickup', m)
    # bed: walls + floor
    parts.append(box('bedf', (1.9, W - 0.2, 0.08), (-1.75, 0, 1.02), m['trim']))
    for s in (-1, 1):
        parts.append(box('bedw', (1.9, 0.08, 0.45), (-1.75, s * (W / 2 - 0.1), 1.28), m['paint']))
    parts.append(box('bedt', (0.08, W - 0.1, 0.45), (-2.68, 0, 1.28), m['paint']))
    parts.append(box('bedh', (0.08, W - 0.1, 0.45), (-0.8, 0, 1.28), m['paint']))
    for i in range(6):
        parts.append(box('rib', (0.05, W - 0.22, 0.03), (-2.5 + i * 0.3, 0, 1.07), m['steel']))
    ob = join('pickup', parts)
    uv_cube(ob, 2.0)
    place_origin_floor(ob)
    return ob


def suv(m):
    L, W = 4.95, 1.98
    parts, body = vehicle('suv', L, W, 1.82, 0.3, 1.08, 1.0, 1.25, 0.45, -2.35, 1.0, [(1.55, 1), (-1.55, 1)], 0.38, 'suv', m)
    parts.append(box('rack', (1.9, 1.3, 0.04), (-0.7, 0, 1.86), m['trim']))
    parts.append(box('spare', (0.18, 0.6, 0.6), (-2.5, 0, 1.0), m['tire']))
    ob = join('suv', parts)
    uv_cube(ob, 2.0)
    place_origin_floor(ob)
    return ob


def build():
    P.reset()
    P.MATS.clear()
    m = mats()
    made = [bus(m), van(m), van(m, True), pickup(m), suv(m)]
    for o in made:
        print(f'[veh] {o.name:10s} {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris')
    for o in made:
        o.location = (0, 0, 0)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'vehicles.glb'), export_format='GLB', use_selection=True, export_materials='EXPORT', export_yup=True, export_texcoords=True, export_normals=True)
    print('[veh] wrote', os.path.getsize(os.path.join(OUT, 'vehicles.glb')) // 1024, 'KB')


if __name__ == '__main__':
    build()
