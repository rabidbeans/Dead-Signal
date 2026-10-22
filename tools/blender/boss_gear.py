"""The bosses' kit: everything they carry or wear that is rigid.

    python boss_gear.py        (bpy venv)   -> public/assets/props/boss_gear.glb + qa/boss_gear.png

One object per item, named as the game asks for it (src/game/bossgear.js). Convention (BLENDER axes; the glTF export
turns Blender +Z into three's +Y and Blender -Y into three's +Z):
  - held things (baton, cleaver, sledgehammer): origin at the centre of the grip, the long axis along +Z, the
    "edge" / striking face toward -X
  - worn on the head (riot helmet, hard hat): origin at the centre of the skull, up +Z, face toward -Y
  - the riot shield: origin at its handle on the back, up +Z, the outer face toward -Y
  - the IV pole: origin on the floor at the centre of its wheel base, up +Z
  - the shackle: origin at the centre of the cuff, the cuff's axis along +Z; chain_link likewise
  - the canister: origin where it sits on the upper back, up +Z, away from the back toward +Y
Stylised and a little chunky so they read from a phone's top-down camera, with bevels everywhere (the ink outline
catches them) and colours that belong to their owners.
"""
import math
import os
import sys
import bpy
import bmesh

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from weapons import reset, mat, cyl, apply_all  # noqa: E402
from guns import box, sphere, join, smooth, tcyl  # noqa: E402

OUT = os.path.join(HERE, '..', '..', 'public', 'assets', 'props')
QA = os.path.join(HERE, '..', '..', 'qa')
R90 = math.radians(90)


def torus(name, R, r, loc, rot=(0, 0, 0), material=None, maj=24, mnr=10, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc, rotation=rot, major_segments=maj, minor_segments=mnr)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    if material:
        ob.data.materials.append(material)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def text_mesh(name, s, size, loc, rot, material, extrude=0.004):
    bpy.ops.object.text_add(location=loc, rotation=rot)
    t = bpy.context.active_object
    t.data.body = s
    t.data.size = size
    t.data.extrude = extrude
    t.data.align_x = 'CENTER'
    t.data.align_y = 'CENTER'
    bpy.ops.object.convert(target='MESH')
    t.name = name
    t.data.materials.append(material)
    return t


def shell(name, R, z0, z1, thickness, loc, material, ring=32, segs=12, cut=None):
    """A dome (helmet / hard hat): the upper part of a sphere between polar angles, given a thickness."""
    bpy.ops.mesh.primitive_uv_sphere_add(radius=R, location=loc, segments=ring, ring_count=segs)
    ob = bpy.context.active_object
    ob.name = name
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    kill = [v for v in bm.verts if (v.co.z < z0)]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(me)
    bm.free()
    sol = ob.modifiers.new('sol', 'SOLIDIFY')
    sol.thickness = thickness
    ob.data.materials.append(material)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def bevel(ob, w=0.004, segs=2):
    b = ob.modifiers.new('bev', 'BEVEL')
    b.width = w
    b.segments = segs
    b.limit_method = 'ANGLE'
    return ob


def origin_at(ob, xyz=(0, 0, 0)):
    bpy.context.scene.cursor.location = xyz
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    ob.location = (0, 0, 0)
    bpy.context.scene.cursor.location = (0, 0, 0)


def build():
    reset()
    M = dict(
        navy=mat('gear_navy', (0.02, 0.035, 0.07), rough=0.45),
        black=mat('gear_black', (0.015, 0.015, 0.017), rough=0.55),
        visor=mat('gear_visor', (0.12, 0.2, 0.26), metal=0.3, rough=0.08),
        white=mat('gear_white', (0.85, 0.85, 0.82), rough=0.4),
        chrome=mat('gear_chrome', (0.75, 0.76, 0.78), metal=1.0, rough=0.22),
        steel=mat('gear_steel', (0.55, 0.56, 0.58), metal=1.0, rough=0.3),
        dark=mat('gear_dark', (0.09, 0.09, 0.1), metal=0.8, rough=0.4),
        wood=mat('gear_wood', (0.32, 0.17, 0.07), rough=0.6),
        yellow=mat('gear_yellow', (0.95, 0.68, 0.02), rough=0.35),
        bile=mat('gear_bile', (0.35, 0.5, 0.03), rough=0.15, emit=(0.25, 0.45, 0.02)),
        bag=mat('gear_bag', (0.75, 0.8, 0.7), rough=0.2),
        rubber=mat('gear_rubber', (0.04, 0.04, 0.04), rough=0.8),
        glow=mat('gear_glow', (0.4, 1.0, 0.15), rough=0.2, emit=(0.5, 1.0, 0.1)),
        rust=mat('gear_rust', (0.3, 0.13, 0.06), metal=0.6, rough=0.7),
        blood=mat('gear_blood', (0.25, 0.02, 0.01), rough=0.25),
        red=mat('gear_red', (0.8, 0.05, 0.03), rough=0.4),
    )
    items = []

    # ---- THE WARDEN: riot helmet (dome, visor, neck guard), shield with POLICE on it, side-handle baton
    hel = [shell('h_dome', 0.15, 0.0, 0, 0.012, (0, 0, 0), M['navy'])]
    rim = torus('h_rim', 0.152, 0.012, (0, 0, 0.0), material=M['black'], scale=(1, 1.02, 1))
    vz = shell('h_visor', 0.165, 0.0, 0, 0.006, (0, -0.01, 0.0), M['visor'])
    # keep only the front half of the visor shell, from the brow down to the chin
    bm = bmesh.new(); bm.from_mesh(vz.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > -0.06 or v.co.z > 0.11], context='VERTS')
    bm.to_mesh(vz.data); bm.free()
    vz.location = (0, 0, -0.1)
    neck = box('h_neck', (0.2, 0.03, 0.09), (0, 0.13, -0.05), M['black'], bevel=0.008)
    stripe = box('h_stripe', (0.03, 0.31, 0.015), (0, 0, 0.152), M['white'], bevel=0.005)
    items.append(join(hel + [rim, vz, neck, stripe], 'riot_helmet'))

    sh = box('s_body', (0.62, 0.035, 1.05), (0, -0.07, 0.05), M['black'], bevel=0.02)
    bend = sh.modifiers.new('bend', 'SIMPLE_DEFORM'); bend.deform_method = 'BEND'; bend.angle = math.radians(25); bend.deform_axis = 'Z'
    win = box('s_window', (0.4, 0.04, 0.16), (0, -0.09, 0.4), M['visor'], bevel=0.01)
    txt = text_mesh('s_text', 'POLICE', 0.13, (0, -0.095, 0.08), (R90, 0, 0), M['white'])
    edge = box('s_edge', (0.64, 0.045, 0.04), (0, -0.07, -0.47), M['dark'], bevel=0.01)
    handle = box('s_handle', (0.04, 0.06, 0.18), (0, 0.0, 0.0), M['dark'], bevel=0.008)
    scuff = box('s_scuff', (0.2, 0.04, 0.06), (0.15, -0.075, -0.25), M['blood'], bevel=0.01)
    items.append(join([sh, win, txt, edge, handle, scuff], 'riot_shield'))

    bat = tcyl('b_shaft', 0.02, 0.62, (0, 0, 0.18), M['black'], rot=(0, 0, 0))
    bgrip = tcyl('b_grip', 0.024, 0.16, (0, 0, -0.02), M['rubber'], rot=(0, 0, 0))
    side = tcyl('b_side', 0.017, 0.13, (0.07, 0, 0.06), M['black'], rot=(0, R90, 0))
    tip = sphere('b_tip', 0.022, (0, 0, 0.49), M['black'])
    items.append(join([bat, bgrip, side, tip], 'baton'))

    # a duty holster for her right hip (Sam's reference): the leather body, the retention strap, the pistol grip out of
    # the top. Origin at the belt, up +Z, the body hanging below it, outward toward -X.
    hb = box('ho_body', (0.075, 0.055, 0.23), (0, 0, -0.1), M['black'], bevel=0.012)
    ht = box('ho_toe', (0.06, 0.045, 0.05), (0, 0, -0.22), M['black'], bevel=0.02)
    hl = box('ho_loop', (0.085, 0.07, 0.04), (0, 0.004, 0.0), M['dark'], bevel=0.006)
    hs = box('ho_strap', (0.08, 0.06, 0.018), (0, 0, 0.035), M['dark'], bevel=0.005)
    hg = box('ho_grip', (0.045, 0.034, 0.11), (0, -0.012, 0.075), M['rubber'], bevel=0.008)
    hg.rotation_euler = (math.radians(-12), 0, 0)
    hsn = tcyl('ho_snap', 0.008, 0.012, (-0.04, 0, 0.035), M['chrome'], rot=(0, R90, 0))
    items.append(join([hb, ht, hl, hs, hg, hsn], 'holster'))

    # ---- THE SOLDIER (one of the dead, level 5): a combat helmet - olive dome, a cut-away brim, the night-vision
    # mount on the front, the chin strap hanging loose
    olive = mat('gear_olive', (0.1, 0.12, 0.06), rough=0.7)
    cd = shell('ch_dome', 0.142, 0.0, 0, 0.012, (0, 0, 0), olive)
    crim = torus('ch_rim', 0.146, 0.009, (0, 0, 0.0), material=olive, scale=(1, 1.08, 0.9))
    mount = box('ch_mount', (0.06, 0.02, 0.05), (0, -0.142, 0.07), M['dark'], bevel=0.005)
    rails = [box(f'ch_rail{s_}', (0.02, 0.17, 0.016), (s_ * 0.132, 0, 0.06), M['dark'], bevel=0.004) for s_ in (-1, 1)]
    straps = [box(f'ch_strap{s_}', (0.012, 0.02, 0.13), (s_ * 0.12, -0.02, -0.06), M['black'], bevel=0.003) for s_ in (-1, 1)]
    band = torus('ch_band', 0.143, 0.005, (0, 0, 0.055), material=M['black'])
    items.append(join([cd, crim, mount, band] + rails + straps, 'combat_helmet'))

    # ---- PATIENT ZERO: an IV pole on a five-wheel base, a bag of glowing green bile, the line hanging off it
    pole = tcyl('iv_pole', 0.012, 2.05, (0, 0, 1.05), M['chrome'], rot=(0, 0, 0))
    parts = [pole]
    for k in range(5):
        a = k * 2 * math.pi / 5
        leg = box(f'iv_leg{k}', (0.3, 0.025, 0.02), (math.cos(a) * 0.15, math.sin(a) * 0.15, 0.06), M['chrome'], bevel=0.004)
        leg.rotation_euler = (0, 0, a)
        wheel = tcyl(f'iv_wh{k}', 0.025, 0.02, (math.cos(a) * 0.3, math.sin(a) * 0.3, 0.025), M['rubber'], rot=(R90, 0, a))
        parts += [leg, wheel]
    for a in (0, math.pi):
        hook = torus(f'iv_hook{a:.0f}', 0.035, 0.006, (math.cos(a) * 0.05, math.sin(a) * 0.05, 2.06), (R90, 0, a), M['chrome'], maj=12, mnr=6)
        parts.append(hook)
    bag = sphere('iv_bag', 0.09, (0.08, 0, 1.87), M['bile'], seg=16, rings=10)
    bag.scale = (0.9, 0.45, 1.35)
    cap = box('iv_cap', (0.12, 0.05, 0.03), (0.08, 0, 2.02), M['white'], bevel=0.006)
    line = tcyl('iv_line', 0.004, 0.75, (0.1, 0, 1.4), M['bag'], rot=(0, 0.12, 0))
    grip = tcyl('iv_grip', 0.016, 0.14, (0, 0, 1.2), M['rubber'], rot=(0, 0, 0))
    parts += [bag, cap, line, grip]
    items.append(join(parts, 'iv_pole'))

    # ---- THE BUTCHER: a heavy cleaver (two are hung on him), the blade with a hanging hole and a bloody edge
    def cleaver(name):
        blade = box(name + '_blade', (0.17, 0.008, 0.3), (-0.05, 0, 0.22), M['steel'], bevel=0.003)
        spine = box(name + '_spine', (0.014, 0.014, 0.3), (0.034, 0, 0.22), M['steel'], bevel=0.003)
        hole = tcyl(name + '_hole', 0.016, 0.012, (0.0, 0, 0.32), M['black'], rot=(R90, 0, 0))
        edge = box(name + '_edge', (0.012, 0.009, 0.28), (-0.13, 0, 0.21), M['blood'], bevel=0.002)
        hd = tcyl(name + '_handle', 0.019, 0.16, (0, 0, 0.0), M['wood'], rot=(0, 0, 0))
        ferr = tcyl(name + '_ferrule', 0.022, 0.02, (0, 0, 0.075), M['steel'], rot=(0, 0, 0))
        rivets = [sphere(f'{name}_rv{k}', 0.006, (0, 0.02, -0.04 + k * 0.05), M['steel'], seg=6, rings=4) for k in range(3)]
        return join([blade, spine, hole, edge, hd, ferr] + rivets, name)
    items.append(cleaver('cleaver'))

    # ---- THE FOREMAN: a yellow hard hat with a ridge and a brim, and a sledgehammer with a battered head
    hh = shell('hh_dome', 0.145, 0.0, 0, 0.01, (0, 0, 0), M['yellow'])
    brim = tcyl('hh_brim', 0.185, 0.012, (0, -0.01, 0.0), M['yellow'], rot=(0, 0, 0), verts=32)
    brim.scale = (1.0, 1.15, 1.0)
    ridge = box('hh_ridge', (0.03, 0.27, 0.025), (0, 0, 0.145), M['yellow'], bevel=0.01)
    band = torus('hh_band', 0.142, 0.006, (0, 0, 0.02), material=M['black'])
    logo = box('hh_logo', (0.07, 0.01, 0.04), (0, -0.142, 0.06), M['red'], bevel=0.004)
    items.append(join([hh, brim, ridge, band, logo], 'hardhat'))

    hshaft = tcyl('sh_shaft', 0.022, 0.95, (0, 0, 0.3), M['wood'], rot=(0, 0, 0))
    hgrip = tcyl('sh_grip', 0.026, 0.22, (0, 0, -0.06), M['rubber'], rot=(0, 0, 0))
    head = box('sh_head', (0.3, 0.1, 0.1), (0, 0, 0.8), M['dark'], bevel=0.012)
    faces = [tcyl(f'sh_face{s}', 0.055, 0.03, (s * 0.15, 0, 0.8), M['steel'], rot=(0, R90, 0)) for s in (-1, 1)]
    wedge = box('sh_wedge', (0.04, 0.02, 0.05), (0, 0, 0.86), M['steel'], bevel=0.004)
    items.append(join([hshaft, hgrip, head, wedge] + faces, 'sledgehammer'))

    # ---- SUBJECT OMEGA: the cuffs it broke, their chain, and the canister of whatever they pumped into it
    cuff = tcyl('cuff_band', 0.07, 0.07, (0, 0, 0), M['steel'], rot=(0, 0, 0), verts=20)
    hollow = cuff.modifiers.new('sol', 'SOLIDIFY'); hollow.thickness = 0.015
    lock = box('cuff_lock', (0.04, 0.03, 0.05), (0, -0.075, 0), M['dark'], bevel=0.005)
    ring = torus('cuff_ring', 0.022, 0.007, (0, -0.07, -0.05), (0, R90, 0), M['steel'], maj=12, mnr=6)
    items.append(join([cuff, lock, ring], 'shackle'))
    items.append(join([torus('link', 0.03, 0.009, (0, 0, 0), (R90, 0, 0), M['steel'], maj=14, mnr=6, scale=(0.75, 1, 1.5))], 'chain_link'))

    tank = tcyl('c_glass', 0.11, 0.42, (0, 0.16, 0.0), M['visor'], rot=(0, 0, 0), verts=24)
    fluid = tcyl('c_fluid', 0.095, 0.34, (0, 0.16, -0.02), M['glow'], rot=(0, 0, 0), verts=20)
    caps = [tcyl(f'c_cap{s}', 0.12, 0.05, (0, 0.16, s * 0.23), M['dark'], rot=(0, 0, 0), verts=24) for s in (-1, 1)]
    strap = [box(f'c_strap{s}', (0.3, 0.03, 0.025), (0, 0.06, s * 0.12), M['rust'], bevel=0.005) for s in (-1, 1)]
    tubes = [tcyl(f'c_tube{s}', 0.012, 0.32, (s * 0.07, 0.06, 0.28), M['glow'], rot=(0.5, 0, 0)) for s in (-1, 1)]
    hazard = box('c_label', (0.1, 0.01, 0.08), (0, 0.272, 0.05), M['yellow'], bevel=0.003)
    items.append(join([tank, fluid, hazard] + caps + strap + tubes, 'canister'))

    # ---- THE FERRYMAN (level 6): a ship's anchor (held at its ring, the shank along +Z, the crown and flukes at the far
    # end) and a yellow sou'wester with the long brim at the back
    ash = tcyl('an_shank', 0.045, 0.9, (0, 0, 0.47), M['dark'], rot=(0, 0, 0), verts=12)
    ast = tcyl('an_stock', 0.035, 0.64, (0, 0, 0.12), M['dark'], rot=(R90, 0, 0), verts=10)
    knobs = [sphere(f'an_knob{s}', 0.05, (0, s * 0.32, 0.12), M['dark'], seg=10, rings=6) for s in (-1, 1)]
    aring = torus('an_ring', 0.075, 0.018, (0, 0, -0.04), (0, R90, 0), M['steel'], maj=16, mnr=6)
    crown = sphere('an_crown', 0.075, (0, 0, 0.93), M['dark'], seg=12, rings=8)
    arms = []
    for i in range(7):
        a0 = math.radians(-160 + i * 20)
        a1 = math.radians(-160 + (i + 1) * 20)
        p0 = (math.cos(a0) * 0.36, 0.6 - math.sin(a0) * 0.36)
        p1 = (math.cos(a1) * 0.36, 0.6 - math.sin(a1) * 0.36)
        cx, cz = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
        ln = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        ang = math.atan2(p1[0] - p0[0], p1[1] - p0[1])
        arms.append(tcyl(f'an_arm{i}', 0.042, ln * 1.12, (cx, 0, cz), M['dark'], rot=(0, ang, 0), verts=10))
    flukes = []
    for s in (-1, 1):
        fx = s * math.cos(math.radians(20)) * 0.36
        fz = 0.6 - math.sin(math.radians(-20)) * 0.36 - 0.1
        bpy.ops.mesh.primitive_cone_add(radius1=0.14, radius2=0.0, depth=0.26, vertices=3, location=(fx, 0, fz), rotation=(0, math.radians(180 - s * 25), 0))
        f = bpy.context.active_object
        f.name = f'an_fluke{s}'
        f.scale = (1, 0.28, 1)
        f.data.materials.append(M['dark'])
        flukes.append(f)
    rustbits = [box(f'an_rust{k}', (0.05, 0.095, 0.04), (0, 0, 0.3 + k * 0.22), M['rust'], bevel=0.006) for k in range(3)]
    items.append(join([ash, ast, aring, crown] + knobs + arms + flukes + rustbits, 'anchor'))

    sw = shell('sw_dome', 0.15, 0.0, 0, 0.01, (0, 0, 0), M['yellow'])
    swb = tcyl('sw_brim', 0.21, 0.01, (0, 0.05, -0.005), M['yellow'], rot=(0, 0, 0), verts=32)
    swb.scale = (1.0, 1.35, 1.0)
    swt = torus('sw_band', 0.148, 0.007, (0, 0, 0.015), material=M['dark'])
    items.append(join([sw, swb, swt], 'souwester'))

    for ob in items:
        apply_all(ob)
        origin_at(ob)
        ob.data.name = ob.name
    # lay them out for the QA picture, then put them all back at the origin for export
    bpy.ops.object.select_all(action='DESELECT')
    os.makedirs(OUT, exist_ok=True)
    for ob in items:
        ob.select_set(True)
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in items}
    print('[gear] tris', tris, 'total', sum(tris.values()))
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'boss_gear.glb'), export_format='GLB', use_selection=True,
                              export_materials='EXPORT', export_yup=True)
    print('[gear] wrote', os.path.join(OUT, 'boss_gear.glb'))
    preview(items)


def preview(items):
    for i, ob in enumerate(items):
        ob.location = ((i % 5) * 0.9 - 1.8, 0, -(i // 5) * 2.4)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 24
    sc.render.resolution_x, sc.render.resolution_y = 1400, 900
    world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.06, 0.08, 1)
    bpy.ops.object.light_add(type='SUN', rotation=(0.8, 0.2, 0.6)); bpy.context.active_object.data.energy = 4
    bpy.ops.object.light_add(type='AREA', location=(0, -4, 3)); bpy.context.active_object.data.energy = 600
    bpy.ops.object.camera_add(location=(0, -7.5, -0.6), rotation=(math.radians(88), 0, 0))
    cam = bpy.context.active_object; cam.data.lens = 32; sc.camera = cam
    os.makedirs(QA, exist_ok=True)
    sc.render.filepath = os.path.join(QA, 'boss_gear.png')
    bpy.ops.render.render(write_still=True)
    print('[gear] preview', sc.render.filepath)


if __name__ == '__main__':
    build()
