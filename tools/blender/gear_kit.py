"""The survivor's new gear: the engineer's sentry, the throwables, the mastery attachments, the weapon crate and the
locked hard case. One object per item, named as the game asks for it.

    python gear_kit.py        (bpy venv)   -> public/assets/props/gear.glb + qa/gear_kit.png

Axes (BLENDER; the glTF export turns Blender +Z into three's +Y and Blender -Y into three's +Z):
  - sentry_base / sentry_head: origin on the floor (the head's origin is ON its yaw axis, at the floor too, so the game
    only turns it); the barrels point toward -Y (three's +Z, the game's "forward")
  - frag / molotov / pipebomb: origin at the centre of the thing
  - reddot / suppressor: in a GUN's frame (x forward, z up): the sight's origin at the middle of its base, the
    suppressor's at the back face that meets the muzzle, its bore along +X
  - crate_base / crate_lid, case_base / case_lid: origin on the floor at the middle; each lid's origin is ON its hinge
    (the back top edge, +Y), so opening it is a single rotation about X
  - supply: a small ordnance box that throwables come in, origin on the floor
Chunky and bevelled so they read from the top-down camera; the ink outline picks up every bevel.
"""
import math
import os
import sys
import bpy
import bmesh

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from weapons import reset, mat, apply_all  # noqa: E402
from guns import box, sphere, join, tcyl  # noqa: E402
from boss_gear import torus, text_mesh, origin_at  # noqa: E402

OUT = os.path.join(HERE, '..', '..', 'public', 'assets', 'props')
QA = os.path.join(HERE, '..', '..', 'qa')
R90 = math.radians(90)


def rod(name, p0, p1, r, material, verts=12):
    """a cylinder from p0 to p1"""
    from mathutils import Vector
    a, b = Vector(p0), Vector(p1)
    d = b - a
    ob = tcyl(name, r, d.length, tuple((a + b) / 2), material, rot=(0, 0, 0), verts=verts)
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return ob


def rot(ob, e):
    ob.rotation_euler = e
    return ob


def build():
    reset()
    M = dict(
        olive=mat('kit_olive', (0.12, 0.14, 0.07), rough=0.6),
        olive2=mat('kit_olive_dark', (0.06, 0.07, 0.035), rough=0.7),
        steel=mat('kit_steel', (0.42, 0.43, 0.45), metal=1.0, rough=0.32),
        dark=mat('kit_dark', (0.03, 0.032, 0.036), metal=0.6, rough=0.45),
        black=mat('kit_black', (0.012, 0.012, 0.014), rough=0.6),
        rubber=mat('kit_rubber', (0.025, 0.025, 0.025), rough=0.85),
        brass=mat('kit_brass', (0.62, 0.45, 0.16), metal=1.0, rough=0.3),
        glass=mat('kit_glass', (0.25, 0.36, 0.28), metal=0.2, rough=0.08),
        rag=mat('kit_rag', (0.55, 0.47, 0.34), rough=0.95),
        fuel=mat('kit_fuel', (0.55, 0.32, 0.05), rough=0.15, emit=(0.08, 0.04, 0.0)),
        tape=mat('kit_tape', (0.42, 0.42, 0.44), rough=0.7),
        red=mat('kit_red', (0.75, 0.05, 0.03), rough=0.4),
        led=mat('kit_led', (1.0, 0.1, 0.05), rough=0.3, emit=(1.0, 0.08, 0.02)),
        lens=mat('kit_lens', (0.4, 0.05, 0.03), metal=0.3, rough=0.08, emit=(0.5, 0.03, 0.01)),
        cyan=mat('kit_cyan', (0.1, 0.7, 1.0), rough=0.3, emit=(0.1, 0.6, 1.0)),
        orange=mat('kit_orange', (0.95, 0.42, 0.04), rough=0.4),
        stencil=mat('kit_stencil', (0.78, 0.74, 0.6), rough=0.7),
        wood=mat('kit_wood', (0.3, 0.19, 0.09), rough=0.75),
        yellow=mat('kit_yellow', (0.9, 0.66, 0.05), rough=0.4),
    )
    items = []

    # ---- the ENGINEER's sentry: a tripod with a pintle, a boxy receiver with an ammo can on its side and a twin barrel
    legs = []
    for k in range(3):
        a = k * 2 * math.pi / 3 + math.pi / 2
        lx, ly = math.cos(a), math.sin(a)
        leg = rod(f's_leg{k}', (lx * 0.05, ly * 0.05, 0.5), (lx * 0.38, ly * 0.38, 0.03), 0.022, M['olive2'])
        foot = box(f's_foot{k}', (0.09, 0.09, 0.025), (lx * 0.38, ly * 0.38, 0.013), M['rubber'], bevel=0.008)
        legs += [leg, foot]
    hub = tcyl('s_hub', 0.08, 0.12, (0, 0, 0.5), M['dark'], rot=(0, 0, 0), verts=20)
    post = tcyl('s_post', 0.035, 0.22, (0, 0, 0.62), M['steel'], rot=(0, 0, 0))
    plate = box('s_plate', (0.16, 0.12, 0.04), (0, 0.16, 0.42), M['olive'], bevel=0.008)      # the battery pack
    lamp = box('s_lamp', (0.04, 0.012, 0.02), (0, 0.1, 0.43), M['cyan'], bevel=0.003)
    items.append(join(legs + [hub, post, plate, lamp], 'sentry_base'))

    body = box('h_body', (0.24, 0.36, 0.2), (0, 0.0, 0.82), M['olive'], bevel=0.02)
    top = box('h_top', (0.18, 0.24, 0.05), (0, 0.04, 0.945), M['olive2'], bevel=0.012)
    can = box('h_can', (0.12, 0.22, 0.16), (0.18, 0.06, 0.8), M['olive2'], bevel=0.012)
    belt = box('h_belt', (0.06, 0.04, 0.04), (0.11, -0.04, 0.83), M['brass'], bevel=0.006)
    barrels = [tcyl(f'h_bar{s}', 0.022, 0.5, (s * 0.045, -0.38, 0.84), M['dark'], rot=(R90, 0, 0)) for s in (-1, 1)]
    shroud = tcyl('h_shroud', 0.07, 0.16, (0, -0.21, 0.84), M['dark'], rot=(R90, 0, 0), verts=20)
    muzz = [tcyl(f'h_mz{s}', 0.03, 0.06, (s * 0.045, -0.62, 0.84), M['black'], rot=(R90, 0, 0)) for s in (-1, 1)]
    eye = box('h_eye', (0.1, 0.02, 0.04), (0, -0.185, 0.93), M['cyan'], bevel=0.005)
    ant = tcyl('h_ant', 0.006, 0.3, (-0.08, 0.14, 1.06), M['black'], rot=(0, 0, 0))
    stripe = box('h_stripe', (0.245, 0.06, 0.02), (0, 0.1, 0.92), M['yellow'], bevel=0.004)
    items.append(join([body, top, can, belt, shroud, eye, ant, stripe] + barrels + muzz, 'sentry_head'))

    # ---- THROWABLES (a little larger than life, or they are a speck from 15 m up)
    g = sphere('f_body', 0.055, (0, 0, 0), M['olive'], seg=16, rings=10)
    g.scale = (1, 1, 1.12)
    ribs = [torus(f'f_rib{k}', 0.0555, 0.0032, (0, 0, -0.032 + k * 0.022), material=M['olive2'], maj=20, mnr=5) for k in range(4)]
    ribs += [torus(f'f_v{k}', 0.0555, 0.003, (0, 0, 0), (R90, 0, k * math.pi / 4), M['olive2'], maj=22, mnr=5, scale=(1, 1, 1.12)) for k in range(4)]
    fuse = tcyl('f_fuse', 0.018, 0.04, (0, 0, 0.07), M['steel'], rot=(0, 0, 0))
    spoon = box('f_spoon', (0.016, 0.012, 0.11), (0.03, 0, 0.04), M['steel'], bevel=0.003)
    spoon.rotation_euler = (0, 0.32, 0)
    pin = torus('f_pin', 0.018, 0.003, (-0.032, 0, 0.085), (R90, 0, 0), M['steel'], maj=14, mnr=5)
    band = torus('f_band', 0.057, 0.004, (0, 0, 0.0), material=M['yellow'], maj=18, mnr=5)
    items.append(join([g, fuse, spoon, pin, band] + ribs, 'frag'))

    bot = tcyl('m_bottle', 0.05, 0.17, (0, 0, -0.03), M['glass'], rot=(0, 0, 0), verts=16)
    shoulder = sphere('m_shoulder', 0.05, (0, 0, 0.055), M['glass'], seg=16, rings=8)
    shoulder.scale = (1, 1, 0.55)
    neck = tcyl('m_neck', 0.019, 0.08, (0, 0, 0.1), M['glass'], rot=(0, 0, 0))
    fuel = tcyl('m_fuel', 0.046, 0.12, (0, 0, -0.05), M['fuel'], rot=(0, 0, 0), verts=16)
    rag = box('m_rag', (0.03, 0.022, 0.08), (0.01, 0, 0.165), M['rag'], bevel=0.008)
    rag.rotation_euler = (0.2, 0.3, 0.15)
    tail = box('m_tail', (0.05, 0.012, 0.03), (0.035, 0, 0.12), M['rag'], bevel=0.005)
    label = tcyl('m_label', 0.051, 0.06, (0, 0, -0.04), M['stencil'], rot=(0, 0, 0), verts=16)
    items.append(join([bot, shoulder, neck, fuel, rag, tail, label], 'molotov'))

    pipe = tcyl('p_pipe', 0.034, 0.2, (0, 0, 0), M['steel'], rot=(0, R90, 0))
    caps = [tcyl(f'p_cap{s}', 0.041, 0.035, (s * 0.11, 0, 0), M['dark'], rot=(0, R90, 0)) for s in (-1, 1)]
    tp = [tcyl(f'p_tape{s}', 0.0365, 0.03, (s * 0.04, 0, 0), M['tape'], rot=(0, R90, 0)) for s in (-1, 1)]
    timer = box('p_timer', (0.07, 0.045, 0.022), (0, 0, 0.042), M['black'], bevel=0.005)
    led = box('p_led', (0.012, 0.012, 0.008), (0.018, 0, 0.055), M['led'], bevel=0.002)
    wires = [tcyl(f'p_w{k}', 0.004, 0.08, (-0.03 + k * 0.01, -0.02, 0.03), M['red'] if k else M['yellow'], rot=(0.4, R90, 0)) for k in range(2)]
    items.append(join([pipe, timer, led] + caps + tp + wires, 'pipebomb'))

    # ---- MASTERY ATTACHMENTS, in a gun's frame (x forward, z up)
    rd = [box('r_mount', (0.05, 0.026, 0.012), (0, 0, 0.006), M['dark'], bevel=0.002),
          box('r_body', (0.042, 0.03, 0.028), (-0.004, 0, 0.026), M['black'], bevel=0.004),
          rot(tcyl('r_hood', 0.017, 0.02, (0.02, 0, 0.03), M['black'], rot=(0, R90, 0), verts=14), (0, R90, 0)),
          rot(tcyl('r_lens', 0.0135, 0.004, (0.031, 0, 0.03), M['lens'], rot=(0, R90, 0), verts=14), (0, R90, 0)),
          box('r_knob', (0.012, 0.008, 0.012), (-0.01, -0.019, 0.026), M['dark'], bevel=0.002)]
    items.append(join(rd, 'reddot'))
    sup = [rot(tcyl('u_body', 0.02, 0.15, (0.09, 0, 0), M['black'], rot=(0, R90, 0), verts=18), (0, R90, 0)),
           rot(tcyl('u_ring0', 0.0215, 0.012, (0.02, 0, 0), M['dark'], rot=(0, R90, 0), verts=18), (0, R90, 0)),
           rot(tcyl('u_ring1', 0.0215, 0.01, (0.16, 0, 0), M['dark'], rot=(0, R90, 0), verts=18), (0, R90, 0)),
           rot(tcyl('u_bore', 0.007, 0.004, (0.166, 0, 0), M['black'], rot=(0, R90, 0), verts=10), (0, R90, 0))]
    items.append(join(sup, 'suppressor'))

    # ---- THE WEAPON CRATE (the safehouse unlock) and its lid, hinged at the back top edge
    W, D, H = 1.2, 0.5, 0.34
    cb = [box('c_shell', (W, D, H), (0, 0, H / 2), M['olive'], bevel=0.02)]
    for s in (-1, 1):
        cb.append(box(f'c_end{s}', (0.06, D + 0.03, H + 0.01), (s * (W / 2 - 0.05), 0, H / 2), M['olive2'], bevel=0.012))
        cb.append(box(f'c_handle{s}', (0.03, 0.16, 0.04), (s * (W / 2 + 0.02), 0, H * 0.62), M['dark'], bevel=0.008))
    for x in (-0.3, 0.3):
        cb.append(box(f'c_latch{x}', (0.06, 0.03, 0.06), (x, -D / 2 - 0.012, H - 0.04), M['steel'], bevel=0.006))
    inner = box('c_foam', (W - 0.14, D - 0.06, 0.04), (0, 0, H - 0.05), M['black'], bevel=0.004)
    cb.append(inner)
    cb.append(text_mesh('c_text', 'ARMS', 0.09, (0, -D / 2 - 0.003, H * 0.45), (R90, 0, 0), M['stencil'], extrude=0.002))
    items.append(join(cb, 'crate_base'))
    lid = [box('l_top', (W + 0.01, D + 0.01, 0.07), (0, -D / 2, 0.035), M['olive'], bevel=0.018),
           box('l_rib', (W - 0.2, 0.06, 0.02), (0, -D / 2, 0.08), M['olive2'], bevel=0.006),
           text_mesh('l_text', 'US ARMY', 0.07, (0, -D / 2, 0.071), (0, 0, 0), M['stencil'], extrude=0.002)]
    lj = join(lid, 'crate_lid')
    lj.location = (0, D / 2, H)
    items.append(lj)

    # ---- THE LOCKED HARD CASE (a power weapon in a level): black, orange latches, a light strip that says "open me"
    CW, CD, CH = 1.15, 0.42, 0.2
    cs = [box('k_shell', (CW, CD, CH), (0, 0, CH / 2), M['black'], bevel=0.03),
          box('k_strip', (CW - 0.2, 0.01, 0.025), (0, -CD / 2 - 0.004, CH * 0.5), M['cyan'], bevel=0.004)]
    for x in (-0.35, 0.35):
        cs.append(box(f'k_latch{x}', (0.08, 0.035, 0.07), (x, -CD / 2 - 0.012, CH - 0.03), M['orange'], bevel=0.008))
    cs.append(box('k_handle', (0.24, 0.04, 0.05), (0, -CD / 2 - 0.03, CH * 0.6), M['dark'], bevel=0.012))
    cs.append(box('k_foam', (CW - 0.1, CD - 0.06, 0.03), (0, 0, CH - 0.03), M['dark'], bevel=0.004))
    items.append(join(cs, 'case_base'))
    kl = join([box('kl_top', (CW, CD, 0.07), (0, -CD / 2, 0.035), M['black'], bevel=0.03),
               box('kl_ribs', (CW - 0.3, CD - 0.12, 0.012), (0, -CD / 2, 0.075), M['dark'], bevel=0.004),
               box('kl_mark', (0.1, 0.1, 0.004), (0.35, -CD / 2, 0.072), M['orange'], bevel=0.002)], 'case_lid')
    kl.location = (0, CD / 2, CH)
    items.append(kl)

    # ---- an ordnance box: where frags, molotovs and pipe bombs are found
    sb = [box('o_box', (0.46, 0.3, 0.24), (0, 0, 0.12), M['wood'], bevel=0.012),
          box('o_band0', (0.47, 0.31, 0.03), (0, 0, 0.06), M['dark'], bevel=0.004),
          box('o_band1', (0.47, 0.31, 0.03), (0, 0, 0.19), M['dark'], bevel=0.004),
          box('o_lid', (0.48, 0.32, 0.03), (0, 0, 0.255), M['olive'], bevel=0.008),
          box('o_stripe', (0.2, 0.005, 0.05), (0, -0.152, 0.125), M['yellow'], bevel=0.002)]
    sb.append(text_mesh('o_text', 'ORD', 0.07, (0, -0.154, 0.125), (R90, 0, 0), M['black'], extrude=0.002))
    items.append(join(sb, 'supply'))

    for ob in items:
        piv = tuple(ob.location)
        apply_all(ob)
        origin_at(ob, piv)
        ob.data.name = ob.name
    bpy.ops.object.select_all(action='DESELECT')
    os.makedirs(OUT, exist_ok=True)
    for ob in items:
        ob.select_set(True)
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in items}
    print('[kit] tris', tris, 'total', sum(tris.values()))
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'gear.glb'), export_format='GLB', use_selection=True,
                              export_materials='EXPORT', export_yup=True)
    print('[kit] wrote', os.path.join(OUT, 'gear.glb'))
    preview(items)


def preview(items):
    sizes = {'frag': 4, 'molotov': 3, 'pipebomb': 3, 'reddot': 6, 'suppressor': 4}
    for i, ob in enumerate(items):
        ob.location = ((i % 5) * 1.5 - 3.0, 0, -(i // 5) * 1.4)
        ob.scale = (sizes.get(ob.name, 1),) * 3
        if ob.name.endswith('_lid'):
            ob.rotation_euler = (-1.1, 0, 0)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 24
    sc.render.resolution_x, sc.render.resolution_y = 1400, 900
    world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.06, 0.08, 1)
    bpy.ops.object.light_add(type='SUN', rotation=(0.8, 0.2, 0.6)); bpy.context.active_object.data.energy = 4
    bpy.ops.object.light_add(type='AREA', location=(0, -4, 3)); bpy.context.active_object.data.energy = 600
    bpy.ops.object.camera_add(location=(0, -8.0, 1.6), rotation=(math.radians(78), 0, 0))
    cam = bpy.context.active_object; cam.data.lens = 32; sc.camera = cam
    os.makedirs(QA, exist_ok=True)
    sc.render.filepath = os.path.join(QA, 'gear_kit.png')
    bpy.ops.render.render(write_still=True)
    print('[kit] preview', sc.render.filepath)


if __name__ == '__main__':
    build()
