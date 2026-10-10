"""The sidearm: a 9mm polymer-frame service pistol, modelled to real
dimensions (186 mm long, 128 mm tall, 30 mm wide).

    python weapons.py

Writes public/assets/weapons/pistol.glb (the in-hand model, origin at the
grip so it sits in the right hand bone) and pistol_icon.webp (a studio
render for the HUD).
"""
import bpy
import bmesh
import math
import os
import sys
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'assets', 'weapons')
QA = os.path.join(HERE, '..', '..', 'qa')


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, color, metal=0.0, rough=0.5, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = 4
    return m


def profile_extrude(name, pts_xz, width, bevel=0.0015, segs=3, material=None):
    """A side profile (x forward, z up, metres) extruded across y."""
    bm = bmesh.new()
    vs_a = [bm.verts.new((x, -width / 2, z)) for x, z in pts_xz]
    vs_b = [bm.verts.new((x, width / 2, z)) for x, z in pts_xz]
    n = len(pts_xz)
    bm.faces.new(vs_a[::-1])
    bm.faces.new(vs_b)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((vs_a[i], vs_a[j], vs_b[j], vs_b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if bevel:
        bv = ob.modifiers.new('bev', 'BEVEL')
        bv.width = bevel
        bv.segments = segs
        bv.limit_method = 'ANGLE'
        bv.angle_limit = math.radians(30)
        bv.harden_normals = True
    if material:
        ob.data.materials.append(material)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def cyl(name, r, depth, loc, rot=(0, math.radians(90), 0), verts=24, material=None):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    ob = bpy.context.active_object
    ob.name = name
    if material:
        ob.data.materials.append(material)
    return ob


def box(name, size, loc, material=None, bevel=0.0008):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.active_object
    ob.scale = size
    bpy.ops.object.transform_apply(scale=True)
    ob.name = name
    if bevel:
        bv = ob.modifiers.new('bev', 'BEVEL')
        bv.width = bevel
        bv.segments = 2
    if material:
        ob.data.materials.append(material)
    return ob


def boolean(target, cutter, op='DIFFERENCE'):
    m = target.modifiers.new('bool', 'BOOLEAN')
    m.object = cutter
    m.operation = op
    m.solver = 'EXACT'
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def apply_all(ob):
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def build_pistol():
    reset()
    slide_m = mat('slide', (0.035, 0.036, 0.038), metal=0.85, rough=0.38)
    frame_m = mat('frame', (0.028, 0.028, 0.03), metal=0.0, rough=0.62)
    steel_m = mat('steel', (0.32, 0.31, 0.3), metal=1.0, rough=0.28)
    sight_m = mat('sight', (0.9, 0.9, 0.85), rough=0.4)

    # -- slide: x from -0.093 (rear) to +0.093 (muzzle), top at z=0.128
    sl = profile_extrude('slide', [
        (-0.093, 0.093), (0.088, 0.093), (0.093, 0.098), (0.093, 0.118),
        (0.086, 0.126), (-0.086, 0.126), (-0.093, 0.120)], 0.0255, bevel=0.0018, material=slide_m)
    apply_all(sl)
    # rear cocking serrations: thin cuts on both sides
    for i in range(7):
        x = -0.084 + i * 0.0045
        for s in (-1, 1):
            c = box('cut', (0.0016, 0.004, 0.022), (x, s * 0.0135, 0.112), bevel=0)
            c.rotation_euler = (0, math.radians(-8), 0)
            boolean(sl, c)
    # ejection port
    boolean(sl, box('port', (0.034, 0.02, 0.012), (0.02, 0.008, 0.124), bevel=0))
    # muzzle bore
    boolean(sl, cyl('bore', 0.0052, 0.03, (0.093, 0, 0.106), material=None))
    bar = cyl('barrel', 0.0062, 0.012, (0.088, 0, 0.106), material=steel_m)
    boolean(bar, cyl('bb', 0.0046, 0.02, (0.088, 0, 0.106)))
    # sights
    box('front_sight', (0.004, 0.004, 0.005), (0.083, 0, 0.1285), sight_m)
    rs = box('rear_sight', (0.007, 0.018, 0.006), (-0.083, 0, 0.1285), slide_m)
    boolean(rs, box('notch', (0.012, 0.0045, 0.006), (-0.083, 0, 0.131), bevel=0))
    # -- frame (dust cover + rail + trigger guard + grip in one profile)
    fr = profile_extrude('frame', [
        (0.088, 0.093), (0.088, 0.084), (0.06, 0.082), (0.035, 0.080),
        (0.030, 0.064), (0.024, 0.056), (0.006, 0.054), (-0.014, 0.060),
        (-0.016, 0.050), (-0.036, -0.005), (-0.040, -0.016), (-0.072, -0.016),
        (-0.076, -0.006), (-0.068, 0.040), (-0.070, 0.070), (-0.086, 0.082),
        (-0.090, 0.093)], 0.0285, bevel=0.0022, material=frame_m)
    apply_all(fr)
    # trigger guard opening
    tg = profile_extrude('tg', [(0.024, 0.081), (0.024, 0.062), (0.012, 0.059), (-0.006, 0.060), (-0.012, 0.068), (-0.012, 0.081)], 0.05, bevel=0)
    boolean(fr, tg)
    # grip texture: shallow horizontal grooves on both grip panels
    for i in range(7):
        z = 0.002 + i * 0.0075
        xc = -0.056 + (z - 0.02) * 0.36
        for sgn in (-1, 1):
            c = box('st', (0.028, 0.002, 0.0022), (xc, sgn * 0.0145, z + 0.004), bevel=0)
            c.rotation_euler = (0, math.radians(-20), 0)
            boolean(fr, c)
    # magazine base plate
    box('mag_base', (0.038, 0.030, 0.006), (-0.056, 0, -0.018), frame_m, bevel=0.0015)
    # trigger
    trg = profile_extrude('trigger', [(0.005, 0.078), (0.010, 0.072), (0.009, 0.064), (0.004, 0.062), (0.002, 0.068), (0.0, 0.078)], 0.006, bevel=0.0006, material=frame_m)
    # slide stop + takedown lever
    box('slide_stop', (0.016, 0.031, 0.003), (0.010, 0, 0.088), steel_m, bevel=0.0005)
    box('takedown', (0.006, 0.031, 0.004), (0.028, 0, 0.088), steel_m, bevel=0.0005)
    # one object, origin at the web of the hand (top-rear of the grip)
    obs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in obs:
        apply_all(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = sl
    bpy.ops.object.join()
    gun = bpy.context.active_object
    gun.name = 'pistol'
    # grip centre ~(-0.055, 0, 0.03): place origin there
    bpy.context.scene.cursor.location = (-0.052, 0, 0.045)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    gun.location = (0, 0, 0)
    tris = sum(len(p.vertices) - 2 for p in gun.data.polygons)
    print('[pistol] tris', tris)
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'pistol.glb'), export_format='GLB',
                              use_selection=True, export_materials='EXPORT', export_yup=True)
    render_icon(gun)


def render_icon(gun):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 96
    sc.render.film_transparent = True
    sc.render.resolution_x = 768
    sc.render.resolution_y = 432
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Punchy'
    w = bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.02, 0.02, 0.025, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.3
    # a long rim strip from above-behind and a cool kicker: the gun reads by its edges
    for loc, energy, size, col in (((-0.1, 0.25, 0.35), 5.0, 0.5, (1, 0.93, 0.85)),
                                   ((0.3, -0.3, 0.2), 2.5, 0.15, (0.6, 0.75, 1)),
                                   ((0.0, -0.45, 0.25), 0.5, 0.6, (1, 1, 1))):
        ld = bpy.data.lights.new('l', 'AREA')
        ld.energy = energy
        ld.size = size
        ld.color = col
        lo = bpy.data.objects.new('l', ld)
        lo.location = loc
        sc.collection.objects.link(lo)
        c = lo.constraints.new('TRACK_TO')
        c.target = gun
        c.track_axis = 'TRACK_NEGATIVE_Z'
        c.up_axis = 'UP_Y'
    cd = bpy.data.cameras.new('c')
    cd.type = 'ORTHO'
    cd.ortho_scale = 0.30
    co = bpy.data.objects.new('c', cd)
    sc.collection.objects.link(co)
    co.location = (0.052, -0.5, 0.012)
    co.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = co
    os.makedirs(QA, exist_ok=True)
    p = os.path.join(QA, 'pistol_icon.png')
    sc.render.filepath = p
    bpy.ops.render.render(write_still=True)
    from PIL import Image
    Image.open(p).save(os.path.join(OUT, 'pistol_icon.webp'), 'WEBP', quality=90)
    print('[pistol] icon written')


if __name__ == '__main__':
    build_pistol()
