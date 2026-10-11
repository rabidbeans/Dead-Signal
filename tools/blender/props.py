"""Street props for level one, at real-world scale (metres).

    python props.py

One GLB, one named object per prop (public/assets/props/props.glb). Material
NAMES are a contract with the game: src/assets.js swaps 'concrete',
'asphalt', 'metal', 'paint' and friends for the generated PBR textures and
animates 'lamp', 'lightbar_red', 'lightbar_blue'.
"""
import bpy
import bmesh
import math
import os
import random
import numpy as np
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'assets', 'props')
QA = os.path.join(HERE, '..', '..', 'qa')
MATS = {}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, color=(0.5, 0.5, 0.5), metal=0.0, rough=0.6, emit=None):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = 3
    MATS[name] = m
    return m


def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def mesh_from_bm(name, bm, material=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    if material:
        ob.data.materials.append(material)
    return ob


def profile(name, pts, width, material=None, taper_top=None, axis='y'):
    """Extrude a closed (x, z) profile across y; optionally narrow the top."""
    bm = bmesh.new()
    a = [bm.verts.new((x, -width / 2, z)) for x, z in pts]
    b = [bm.verts.new((x, width / 2, z)) for x, z in pts]
    if taper_top:
        zmax = max(z for _, z in pts)
        zmin = min(z for _, z in pts)
        for v in a + b:
            k = (v.co.z - zmin) / max(zmax - zmin, 1e-6)
            v.co.y *= 1 - (1 - taper_top) * k
    n = len(pts)
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_from_bm(name, bm, material)


def box(name, size, loc, material=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.scale = size
    bpy.ops.object.transform_apply(scale=True)
    ob.name = name
    if material:
        ob.data.materials.append(material)
    return ob


def cyl(name, r, depth, loc, rot=(0, 0, 0), verts=16, material=None, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot, vertices=verts)
    ob = bpy.context.active_object
    ob.name = name
    if material:
        ob.data.materials.append(material)
    return ob


def bevel(ob, w, segs=2, angle=40):
    m = ob.modifiers.new('bev', 'BEVEL')
    m.width = w
    m.segments = segs
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(angle)
    m.harden_normals = False
    return ob


def apply(ob):
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    return ob


def boolean(target, cutter, op='DIFFERENCE'):
    m = target.modifiers.new('bool', 'BOOLEAN')
    m.object = cutter
    m.operation = op
    m.solver = 'EXACT'
    apply(target)
    bpy.data.objects.remove(cutter, do_unlink=True)


def join(name, obs):
    for o in obs:
        apply(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object
    ob.name = name
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.data.set_sharp_from_angle(angle=math.radians(35))
    return ob


def uv_cube(ob, scale=1.0):
    """World-scale box UVs so tiling textures land at a constant density."""
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.cube_project(cube_size=scale)
    bpy.ops.object.mode_set(mode='OBJECT')


def dent(ob, amount, center, radius, seed=0):
    me = ob.data
    c = Vector(center)
    for v in me.vertices:
        d = (v.co - c).length
        if d < radius:
            k = (1 - d / radius) ** 2
            n = noise.noise(v.co * 6 + Vector((seed, 0, 0)))
            v.co += (c - v.co).normalized() * amount * k * (0.6 + 0.4 * n)


def place_origin_floor(ob):
    """Origin at the centre of the footprint, on the ground."""
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    cx = (min(v.x for v in bb) + max(v.x for v in bb)) / 2
    cy = (min(v.y for v in bb) + max(v.y for v in bb)) / 2
    cz = min(v.z for v in bb)
    bpy.context.scene.cursor.location = (cx, cy, cz)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    ob.location = (0, 0, 0)


# ---------------------------------------------------------------- cars ----
def car(name, police=False, wreck=0.0, seed=0):
    random.seed(seed)
    paint = mat('paint', (0.3, 0.3, 0.32), metal=0.6, rough=0.32)
    glass = mat('glass', (0.02, 0.025, 0.03), metal=0.0, rough=0.05)
    trim = mat('trim', (0.03, 0.03, 0.03), rough=0.7)
    tire = mat('tire', (0.025, 0.025, 0.025), rough=0.85)
    rim = mat('rim', (0.5, 0.5, 0.52), metal=1.0, rough=0.35)
    head = mat('headlight', (0.8, 0.8, 0.75), rough=0.1)
    tail = mat('taillight', (0.35, 0.02, 0.02), rough=0.15)
    white = mat('paint_white', (0.75, 0.75, 0.73), metal=0.3, rough=0.35)
    # lower body: bumper to bumper, beltline at 0.98 m. Many stations along
    # the length so the plan-view rounding and the dents have vertices.
    L, W = 4.7, 1.82
    side = [(-2.35, 0.32), (-1.8, 0.31), (-1.0, 0.30), (0.0, 0.30), (1.0, 0.30), (1.8, 0.31), (2.35, 0.32),
            (2.39, 0.55), (2.34, 0.72), (2.1, 0.84), (1.6, 0.92), (1.15, 0.98), (0.4, 0.99), (-0.4, 1.0),
            (-1.0, 1.0), (-1.6, 1.0), (-2.05, 0.99), (-2.28, 0.95), (-2.39, 0.78)]
    body = profile(name + '_body', side, W, paint)

    def shape(ob, wmax):
        for v in ob.data.vertices:
            ax = min(1.0, abs(v.co.x) / 2.39)
            v.co.y *= 1 - 0.13 * ax ** 5                     # rounded corners in plan
            v.co.y *= 1 - 0.07 * max(0.0, min(1.0, (v.co.z - 0.62) / 0.5))  # tumblehome
    shape(body, W)
    bevel(body, 0.09, 4, 25)
    apply(body)
    for x in (1.42, -1.42):
        boolean(body, cyl('arch', 0.4, W + 0.2, (x, 0, 0.36), rot=(math.radians(90), 0, 0), verts=24))
    # cabin: glass sides, painted roof and pillars, all one tapered shell
    cab = profile(name + '_cab', [
        (-1.6, 0.97), (1.14, 0.97), (0.95, 1.08), (0.45, 1.40), (0.2, 1.445), (-0.6, 1.455),
        (-0.86, 1.43), (-1.3, 1.14)], W - 0.1, glass, taper_top=0.8)
    shape(cab, W)
    bevel(cab, 0.06, 3, 25)
    apply(cab)
    cab.data.materials.append(paint)
    for poly in cab.data.polygons:
        if poly.normal.z > 0.82:
            poly.material_index = 1          # the roof is metal, not glass
    roof = box(name + '_dummy', (0.01, 0.01, 0.01), (0, 0, 1.2), paint)
    pil = box(name + '_dummy2', (0.01, 0.01, 0.01), (0, 0, 1.2), paint)
    # bumpers, grille, lights, mirrors
    fb = box('fb', (0.16, W + 0.02, 0.2), (2.32, 0, 0.44), trim)
    bevel(fb, 0.05, 2)
    rb = box('rb', (0.16, W + 0.02, 0.2), (-2.33, 0, 0.46), trim)
    bevel(rb, 0.05, 2)
    gr = box('grille', (0.05, 0.8, 0.12), (2.36, 0, 0.66), trim)
    hl = [box('hl', (0.06, 0.32, 0.1), (2.31, s * 0.66, 0.7), head) for s in (-1, 1)]
    tl = [box('tl', (0.06, 0.34, 0.12), (-2.36, s * 0.68, 0.82), tail) for s in (-1, 1)]
    mr = [box('mirror', (0.12, 0.12, 0.08), (0.95, s * 0.93, 1.05), paint) for s in (-1, 1)]
    parts = [body, cab, roof, pil, fb, rb, gr] + hl + tl + mr
    if police:
        # doors white: a skin over the middle third of the lower body
        for s in (-1, 1):
            d = box('door', (2.0, 0.02, 0.5), (-0.2, s * (W / 2 + 0.005), 0.66), white)
            parts.append(d)
        roofw = box('roofw', (1.2, (W - 0.08) * 0.8, 0.02), (-0.2, 0, 1.475), white)
        parts.append(roofw)
        base = box('lb_base', (0.3, 1.25, 0.08), (-0.15, 0, 1.5), trim)
        red = box('lb_r', (0.24, 0.55, 0.1), (-0.15, -0.3, 1.58), mat('lightbar_red', (0.4, 0.02, 0.02), rough=0.2, emit=(1, 0.05, 0.03)))
        blue = box('lb_b', (0.24, 0.55, 0.1), (-0.15, 0.3, 1.58), mat('lightbar_blue', (0.02, 0.05, 0.4), rough=0.2, emit=(0.05, 0.2, 1)))
        push = box('pushbar', (0.12, 1.1, 0.35), (2.45, 0, 0.55), trim)
        parts += [base, red, blue, push]
    wheels = []
    for x in (1.42, -1.42):
        for s in (-1, 1):
            t = cyl('tire', 0.34, 0.22, (x, s * (W / 2 - 0.13), 0.34), rot=(math.radians(90), 0, 0), verts=20, material=tire)
            bevel(t, 0.05, 2)
            r = cyl('rim', 0.21, 0.23, (x, s * (W / 2 - 0.125), 0.34), rot=(math.radians(90), 0, 0), verts=12, material=rim)
            wheels += [t, r]
    ob = join(name, parts + wheels)
    if wreck > 0:
        dent(ob, 0.45 * wreck, (2.7, 0.6 * random.choice((-1, 1)), 0.9), 1.3, seed)
        dent(ob, 0.18 * wreck, (0.2, 1.15, 0.75), 0.9, seed + 1)
        dent(ob, 0.15 * wreck, (-0.3, 0.0, 1.7), 0.8, seed + 2)
        ob.rotation_euler = (0, math.radians(1.5 * wreck), 0)
    uv_cube(ob, 2.0)
    place_origin_floor(ob)
    return ob


# ------------------------------------------------------------- street ----
def jersey(name='barrier'):
    c = mat('concrete', (0.55, 0.54, 0.5), rough=0.85)
    ob = profile(name, [(-0.3, 0), (0.3, 0), (0.26, 0.08), (0.1, 0.33), (0.08, 0.81), (-0.08, 0.81), (-0.1, 0.33), (-0.26, 0.08)], 3.0, c)
    ob.rotation_euler = (0, 0, math.radians(90))
    bevel(ob, 0.015, 2, 30)
    apply(ob)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.ops.object.transform_apply(rotation=True)
    # chipped corners
    for i in range(6):
        dent(ob, 0.04, (random.uniform(-1.5, 1.5), random.choice((-0.3, 0.3)), random.uniform(0.1, 0.8)), 0.12, i)
    # yellow/black chevrons painted on as a separate thin shell
    stripe = mat('hazard', (0.55, 0.42, 0.05), rough=0.7)
    s = box(name + '_paint', (0.5, 0.012, 0.16), (1.1, 0.088, 0.62), stripe, rot=(0, math.radians(30), 0))
    s2 = box(name + '_paint2', (0.5, 0.012, 0.16), (-1.1, -0.088, 0.62), stripe, rot=(0, math.radians(-30), 0))
    ob = join(name, [ob, s, s2])
    uv_cube(ob, 1.0)
    place_origin_floor(ob)
    return ob


def sandbags(name='sandbags', rows=3, per=7, radius=3.2, arc=60):
    burlap = mat('burlap', (0.36, 0.3, 0.21), rough=0.95)
    bags = []
    rnd = random.Random(4)
    for r in range(rows):
        n = per - r
        for i in range(n):
            a = math.radians(-arc / 2 + arc * (i + 0.5 + (r % 2) * 0.5 * 0) / n)
            x, y = math.sin(a) * radius, math.cos(a) * radius - radius
            bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, 0.1 + r * 0.17))
            b = bpy.context.active_object
            b.scale = (0.66, 0.38, 0.2)
            b.rotation_euler = (rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), -a + rnd.uniform(-0.08, 0.08))
            bpy.ops.object.transform_apply(scale=True, rotation=True)
            bv = b.modifiers.new('b', 'BEVEL')
            bv.width = 0.07
            bv.segments = 2
            apply(b)
            # stuffed, slumped bag: squash the top, bulge the sides
            for v in b.data.vertices:
                q = v.co - Vector((x, y, 0.1 + r * 0.17))
                v.co.z += 0.03 * (q.z > 0) * (1 - min(1, abs(q.x) / 0.34)) - 0.012 * (q.z > 0)
                v.co += q.normalized() * 0.01 * noise.noise(v.co * 9)
            b.data.materials.append(burlap)
            bags.append(b)
    ob = join(name, bags)
    uv_cube(ob, 0.5)
    place_origin_floor(ob)
    return ob


def streetlight(name='streetlight'):
    pole = mat('pole', (0.12, 0.13, 0.12), metal=0.8, rough=0.55)
    lamp = mat('lamp', (0.9, 0.75, 0.5), rough=0.3, emit=(1.0, 0.62, 0.3))
    p = cyl('pole', 0.09, 6.2, (0, 0, 3.1), material=pole, r2=0.06)
    base = cyl('base', 0.16, 0.5, (0, 0, 0.25), material=pole, r2=0.12)
    arm = cyl('arm', 0.045, 2.0, (0.9, 0, 6.15), rot=(0, math.radians(84), 0), material=pole)
    head = box('head', (0.6, 0.3, 0.12), (1.9, 0, 6.05), pole)
    bevel(head, 0.04, 2)
    lens = box('lens', (0.5, 0.22, 0.02), (1.9, 0, 5.985), lamp)
    ob = join(name, [p, base, arm, head, lens])
    uv_cube(ob, 1.0)
    place_origin_floor(ob)
    return ob


def dumpster(name='dumpster'):
    paint = mat('metal', (0.13, 0.22, 0.16), metal=0.5, rough=0.6)
    lid = mat('lid', (0.05, 0.05, 0.05), rough=0.6)
    body = profile('dbody', [(-0.9, 0.12), (0.9, 0.12), (0.95, 1.2), (-1.0, 1.25)], 1.6, paint)
    bevel(body, 0.03, 2)
    ribs = [box('rib', (0.06, 1.66, 1.05), (x, 0, 0.7), paint) for x in (-0.55, 0.0, 0.55)]
    l1 = box('lid1', (0.95, 1.65, 0.05), (-0.5, 0, 1.28), lid, rot=(0, math.radians(-4), 0))
    l2 = box('lid2', (0.95, 1.65, 0.05), (0.42, 0, 1.36), lid, rot=(0, math.radians(14), 0))
    wheels = [cyl('w', 0.07, 0.06, (x, y, 0.07), rot=(math.radians(90), 0, 0), material=lid) for x in (-0.75, 0.75) for y in (-0.7, 0.7)]
    ob = join(name, [body, *ribs, l1, l2, *wheels])
    uv_cube(ob, 1.0)
    place_origin_floor(ob)
    return ob


def trash_bag(name, seed):
    plastic = mat('plastic', (0.02, 0.02, 0.022), rough=0.28)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=0.3)
    b = bpy.context.active_object
    b.scale = (1.0 + seed * 0.1, 0.85, 0.7)
    bpy.ops.object.transform_apply(scale=True)
    for v in b.data.vertices:
        n = noise.noise(v.co * 5 + Vector((seed * 3.1, 0, 0)))
        v.co += v.co.normalized() * 0.05 * n
        v.co.z = max(v.co.z, -0.18)
    # knot
    k = cyl('knot', 0.04, 0.12, (0.1, 0, 0.24), material=plastic, r2=0.015)
    b.data.materials.append(plastic)
    ob = join(name, [b, k])
    ob.data.set_sharp_from_angle(angle=math.radians(80))
    uv_cube(ob, 0.5)
    place_origin_floor(ob)
    return ob


def barrel(name='barrel'):
    m = mat('barrel', (0.28, 0.08, 0.05), metal=0.6, rough=0.6)
    inside = mat('char', (0.02, 0.015, 0.01), rough=0.95)
    body = cyl('b', 0.29, 0.88, (0, 0, 0.44), verts=24, material=m)
    sol = body.modifiers.new('sol', 'SOLIDIFY')
    sol.thickness = 0.012
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(body.data)
    for f in bm.faces:
        if f.normal.z > 0.9:
            bm.faces.remove(f)
            break
    bmesh.update_edit_mesh(body.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    ribs = [cyl('rib', 0.3, 0.025, (0, 0, z), verts=24, material=m) for z in (0.29, 0.59)]
    ash = cyl('ash', 0.27, 0.02, (0, 0, 0.7), verts=24, material=inside)
    ob = join(name, [body, *ribs, ash])
    uv_cube(ob, 1.0)
    place_origin_floor(ob)
    return ob


def cone(name='cone'):
    o = mat('cone_orange', (0.75, 0.2, 0.03), rough=0.55)
    w = mat('cone_white', (0.8, 0.8, 0.78), rough=0.4)
    base = box('base', (0.4, 0.4, 0.03), (0, 0, 0.015), mat('trim', (0.03, 0.03, 0.03), rough=0.7))
    c1 = cyl('c', 0.16, 0.7, (0, 0, 0.38), r2=0.03, material=o)
    band = cyl('band', 0.115, 0.12, (0, 0, 0.42), r2=0.09, material=w, verts=16)
    ob = join(name, [base, c1, band])
    place_origin_floor(ob)
    return ob


def sawhorse(name='sawhorse'):
    o = mat('cone_orange', (0.75, 0.2, 0.03), rough=0.55)
    w = mat('cone_white', (0.8, 0.8, 0.78), rough=0.4)
    leg = mat('trim', (0.03, 0.03, 0.03), rough=0.7)
    parts = []
    for i, z in enumerate((0.85, 0.55)):
        parts.append(box('rail', (2.0, 0.03, 0.2), (0, 0, z), o if i == 0 else w))
    for x in (-0.85, 0.85):
        for s in (-1, 1):
            parts.append(box('leg', (0.06, 0.06, 1.0), (x, s * 0.15, 0.48), leg, rot=(s * math.radians(14), 0, 0)))
    ob = join(name, parts)
    uv_cube(ob, 1.0)
    place_origin_floor(ob)
    return ob


def hydrant(name='hydrant'):
    m = mat('hydrant', (0.45, 0.32, 0.05), metal=0.4, rough=0.55)
    body = cyl('h', 0.12, 0.6, (0, 0, 0.35), material=m)
    cap = bpy.ops.mesh.primitive_uv_sphere_add(radius=0.13, location=(0, 0, 0.66))
    capo = bpy.context.active_object
    capo.scale = (1, 1, 0.6)
    capo.data.materials.append(m)
    noz = [cyl('n', 0.05, 0.12, (s * 0.15, 0, 0.45), rot=(0, math.radians(90), 0), material=m) for s in (-1, 1)]
    base = cyl('base', 0.17, 0.08, (0, 0, 0.04), material=m)
    ob = join(name, [body, capo, *noz, base])
    place_origin_floor(ob)
    return ob


def ac_unit(name='ac_unit'):
    m = mat('metal_grey', (0.42, 0.43, 0.42), metal=0.6, rough=0.5)
    dark = mat('trim', (0.03, 0.03, 0.03), rough=0.7)
    b = box('ac', (1.4, 1.1, 0.8), (0, 0, 0.45), m)
    bevel(b, 0.02, 2)
    fan = cyl('fan', 0.4, 0.02, (0.0, 0, 0.86), material=dark, verts=24)
    grille = [box('g', (0.82, 0.02, 0.02), (0, y, 0.875), m) for y in np.linspace(-0.36, 0.36, 7)]
    feet = [box('f', (0.08, 1.0, 0.06), (x, 0, 0.03), dark) for x in (-0.6, 0.6)]
    ob = join(name, [b, fan, *grille, *feet])
    uv_cube(ob, 1.0)
    place_origin_floor(ob)
    return ob


def rubble(name='rubble', seed=3):
    c = mat('concrete', (0.55, 0.54, 0.5), rough=0.85)
    br = mat('brickbits', (0.3, 0.17, 0.13), rough=0.9)
    rnd = random.Random(seed)
    parts = []
    for i in range(16):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=rnd.uniform(0.06, 0.22),
                                              location=(rnd.gauss(0, 0.5), rnd.gauss(0, 0.5), 0))
        r = bpy.context.active_object
        r.scale = (rnd.uniform(0.7, 1.4), rnd.uniform(0.7, 1.4), rnd.uniform(0.35, 0.7))
        r.rotation_euler = (rnd.random(), rnd.random(), rnd.random())
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        r.data.materials.append(c if rnd.random() < 0.6 else br)
        parts.append(r)
    ob = join(name, parts)
    ob.data.set_sharp_from_angle(angle=math.radians(20))
    uv_cube(ob, 0.5)
    place_origin_floor(ob)
    return ob


def build_all():
    reset()
    random.seed(1)
    made = []
    x = 0

    def put(ob, w):
        nonlocal x
        ob.location = (x + w / 2, 0, 0)
        x += w + 1
        made.append(ob)
    put(car('car_sedan', wreck=0.0, seed=1), 2)
    put(car('car_wreck', wreck=1.0, seed=2), 2)
    put(car('car_police', police=True, seed=3), 2)
    put(jersey(), 0.6)
    put(sandbags(), 3)
    put(streetlight(), 2)
    put(dumpster(), 2)
    put(trash_bag('trash_a', 0), 0.6)
    put(trash_bag('trash_b', 1), 0.6)
    put(barrel(), 0.6)
    put(cone(), 0.4)
    put(sawhorse(), 2)
    put(hydrant(), 0.4)
    put(ac_unit(), 1.4)
    put(rubble(), 1.5)
    for ob in made:
        tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        print(f'[props] {ob.name:14s} {tris:6d} tris')
    # export with every prop at the origin (the game places them)
    for ob in made:
        ob['lay_x'] = ob.location.x
        ob.location = (0, 0, 0)
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'props.glb'), export_format='GLB',
                              use_selection=True, export_materials='EXPORT', export_yup=True,
                              export_texcoords=True, export_normals=True)
    for ob in made:
        ob.location = (ob['lay_x'], 0, 0)
    preview(made)


def preview(made):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 32
    sc.render.resolution_x = 1600
    sc.render.resolution_y = 700
    w = bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.25, 0.27, 0.3, 1)
    sun = bpy.data.lights.new('s', 'SUN')
    sun.energy = 3
    so = link(bpy.data.objects.new('s', sun))
    so.rotation_euler = (math.radians(40), 0, math.radians(30))
    span = max(o.location.x for o in made) + 2
    cd = bpy.data.cameras.new('c')
    cd.type = 'ORTHO'
    cd.ortho_scale = span + 2
    co = link(bpy.data.objects.new('c', cd))
    co.location = (span / 2, -20, 14)
    co.rotation_euler = (math.radians(55), 0, 0)
    sc.camera = co
    os.makedirs(QA, exist_ok=True)
    sc.render.filepath = os.path.join(QA, 'props.png')
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    build_all()
