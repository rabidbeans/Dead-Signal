"""The street kit: facade modules, street furniture, checkpoint clutter, debris.

    python street_kit.py            -> public/assets/props/street.glb

Every object is modelled about its own origin (Blender: x right, y depth, z up;
the glTF export turns that into three.js y-up). FACADE MODULES face Blender -Y
(= +Z in the game) with the wall plane at y = 0. Everything else sits on the
floor at z = 0. Material NAMES are a contract with src/game/assets.js.
"""
import bpy
import bmesh
import math
import os
import random
import sys
from mathutils import Vector, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from props import (mat, link, bevel, apply, boolean, uv_cube)  # noqa: E402
import props as P  # noqa: E402

OUT = os.path.join(HERE, '..', '..', 'public', 'assets', 'props')
MADE = []
R = random.Random(11)


def M(name, color=(0.5, 0.5, 0.5), metal=0.0, rough=0.6, emit=None):
    return mat(name, color, metal, rough, emit)


# ----------------------------------------------------------------- parts ---
def blk(size, loc, material, rot=(0, 0, 0), bev=0.0, segs=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.scale = size
    bpy.ops.object.transform_apply(scale=True)
    ob.data.materials.append(material)
    if bev:
        bevel(ob, bev, segs, 40)
    return ob


def tube(a, b, r, material, verts=8, cap=True):
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, vertices=verts, location=(a + b) / 2, end_fill_type='NGON' if cap else 'NOTHING')
    ob = bpy.context.active_object
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
    bpy.ops.object.transform_apply(rotation=True)
    ob.data.materials.append(material)
    return ob


def cylz(r, h, loc, material, verts=16, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=(loc[0], loc[1], loc[2] + h / 2), vertices=verts)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, location=(loc[0], loc[1], loc[2] + h / 2), vertices=verts)
    ob = bpy.context.active_object
    ob.data.materials.append(material)
    return ob


def sphere(r, loc, material, scale=(1, 1, 1), seg=12):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=seg // 2)
    ob = bpy.context.active_object
    ob.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    ob.data.materials.append(material)
    return ob


def quad(p0, p1, p2, p3, material, name='q'):
    me = bpy.data.meshes.new(name)
    me.from_pydata([p0, p1, p2, p3], [], [(0, 1, 2, 3)])
    me.update()
    ob = link(bpy.data.objects.new(name, me))
    ob.data.materials.append(material)
    return ob


def lattice(w, h, loc, material, step=0.08, r=0.004, plane='xz'):
    """A grid of thin bars (chain-link, a cart's basket, a grille)."""
    parts = []
    x0, z0 = loc[0], loc[2]
    n = int(w / step)
    for i in range(n + 1):
        x = x0 - w / 2 + i * step
        parts.append(tube((x, loc[1], z0), (x, loc[1], z0 + h), r, material, 4, False))
    m = int(h / step)
    for j in range(m + 1):
        z = z0 + j * step
        parts.append(tube((x0 - w / 2, loc[1], z), (x0 + w / 2, loc[1], z), r, material, 4, False))
    return parts


def finish(name, parts, uv=1.0, smooth=True):
    for o in parts:
        apply(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object
    ob.name = name
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    ob.location = (0, 0, 0)
    if smooth:
        for p in ob.data.polygons:
            p.use_smooth = True
        ob.data.set_sharp_from_angle(angle=math.radians(35))
    if uv:
        uv_cube(ob, uv)
    MADE.append(ob)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print(f'[street] {name:16s} {tris:6d} tris')
    return ob


# materials (names are the contract)
def mats():
    return dict(
        frame=M('winframe', (0.09, 0.09, 0.1), metal=0.6, rough=0.55),
        glass=M('winglass', (0.02, 0.025, 0.03), rough=0.08),
        wood=M('wood', (0.35, 0.25, 0.15), rough=0.85),
        rust=M('rust', (0.28, 0.14, 0.08), metal=0.5, rough=0.8),
        steel=M('steel', (0.45, 0.46, 0.47), metal=0.9, rough=0.4),
        dark=M('trim', (0.03, 0.03, 0.03), rough=0.7),
        rubber=M('rubber', (0.025, 0.025, 0.025), rough=0.85),
        concrete=M('concrete', (0.55, 0.54, 0.5), rough=0.85),
        olive=M('olive', (0.13, 0.16, 0.09), metal=0.3, rough=0.7),
        blue=M('mailblue', (0.05, 0.1, 0.34), metal=0.4, rough=0.45),
        plastic=M('plastic', (0.02, 0.02, 0.022), rough=0.28),
        cloth=M('cloth', (0.3, 0.28, 0.25), rough=0.95),
        awning=M('awning', (0.6, 0.12, 0.1), rough=0.9),
        tarp=M('tarp', (0.12, 0.2, 0.3), rough=0.7),
        cardboard=M('cardboard', (0.45, 0.33, 0.2), rough=0.95),
        brick=M('brickbits', (0.3, 0.17, 0.13), rough=0.9),
        yellow=M('hazard', (0.55, 0.42, 0.05), rough=0.7),
        red=M('tl_red', (0.35, 0.02, 0.02), rough=0.3, emit=(1, 0.05, 0.03)),
        amber=M('tl_amber', (0.3, 0.2, 0.02), rough=0.3),
        green=M('tl_green', (0.02, 0.2, 0.05), rough=0.3),
        lamp=M('floodlamp', (0.9, 0.85, 0.7), rough=0.2, emit=(1, 0.9, 0.7)),
        stopred=M('stopred', (0.5, 0.03, 0.03), rough=0.4),
        white=M('paint_white', (0.75, 0.75, 0.73), metal=0.2, rough=0.4),
        ad=M('adpanel', (0.5, 0.5, 0.5), rough=0.4),
        leaf=M('bark', (0.1, 0.08, 0.06), rough=0.95),
    )


# ======================================================= FACADE MODULES ===
def facade(m):
    # --- window frame (opening 1.1 x 1.5 centred on the origin; front = -Y)
    def frame_parts(w=1.1, h=1.5, m=m):
        t = 0.07
        p = [blk((t, 0.12, h + 2 * t), (-(w / 2 + t / 2), -0.04, 0), m['frame']),
             blk((t, 0.12, h + 2 * t), ((w / 2 + t / 2), -0.04, 0), m['frame']),
             blk((w + 2 * t, 0.12, t), (0, -0.04, h / 2 + t / 2), m['frame']),
             blk((w + 2 * t, 0.12, t), (0, -0.04, -(h / 2 + t / 2)), m['frame']),
             blk((0.035, 0.07, h), (0, -0.03, 0), m['frame']),
             blk((w, 0.07, 0.035), (0, -0.03, 0.18), m['frame']),
             blk((w + 0.3, 0.2, 0.07), (0, -0.1, -(h / 2 + 0.1)), m['concrete'], bev=0.012, segs=1),     # sill
             blk((w + 0.28, 0.14, 0.13), (0, -0.07, h / 2 + 0.13), m['concrete'], bev=0.012, segs=1)]    # lintel
        return p
    finish('win_frame', frame_parts(), 1.0)
    # --- glass: a plane just behind the frame
    q = quad((-0.55, 0.0, -0.75), (0.55, 0.0, -0.75), (0.55, 0.0, 0.75), (-0.55, 0.0, 0.75), m['glass'], 'win_glass')
    q.data.polygons[0].flip()
    finish('win_glass', [q], 0, smooth=False)
    # --- boarded up
    parts = frame_parts()
    for z, a in ((-0.4, 0.04), (0.0, -0.06), (0.42, 0.03)):
        parts.append(blk((1.35, 0.04, 0.26), (0.02, -0.11, z), m['wood'], rot=(0, a, 0), bev=0.006))
    parts.append(blk((0.22, 0.04, 1.9), (-0.2, -0.15, 0.0), m['wood'], rot=(0, 0.22, 0), bev=0.006))
    for x, z in ((-0.5, -0.4), (0.5, -0.4), (-0.5, 0.42), (0.5, 0.42), (0.1, 0.0)):
        parts.append(cylz(0.012, 0.03, (x, -0.17, z), m['steel'], 6))
        parts[-1].rotation_euler = (math.pi / 2, 0, 0)
    finish('win_boarded', parts, 1.0)
    # --- window unit
    parts = frame_parts()
    parts += [blk((0.7, 0.45, 0.42), (0, -0.28, -0.1), M('metal_grey', (0.42, 0.43, 0.42), metal=0.6, rough=0.5), bev=0.02),
              blk((0.6, 0.02, 0.3), (0, -0.52, -0.1), m['dark'])]
    finish('win_ac', parts, 1.0)
    # --- cornice (1 m long along x, bottom at z=0, front -Y)
    parts = [blk((1.0, 0.08, 0.22), (0, -0.04, 0.11), m['concrete']),
             blk((1.0, 0.2, 0.1), (0, -0.1, 0.27), m['concrete']),
             blk((1.0, 0.32, 0.08), (0, -0.16, 0.36), m['concrete']),
             blk((1.0, 0.4, 0.06), (0, -0.2, 0.43), m['concrete'])]
    for i in range(10):
        parts.append(blk((0.06, 0.12, 0.1), (-0.45 + i * 0.1, -0.2, 0.22), m['concrete']))
    finish('cornice', parts, 1.0)
    # --- shop awning (width 4.4), wall at y=0, hangs from z=3.1 down to 2.5 at the front
    w = 4.4
    bm = bmesh.new()
    cols = 22
    top, drop, out = 3.1, 2.55, 1.5
    verts = []
    for ci in range(cols + 1):
        x = -w / 2 + ci * w / cols
        sag = 0.05 * math.sin(ci * 1.3) + (0.1 if R.random() < 0.15 else 0)
        verts.append((bm.verts.new((x, 0, top)), bm.verts.new((x, -out * 0.55, top - 0.18 - sag * 0.4)),
                      bm.verts.new((x, -out, drop - sag)), bm.verts.new((x, -out - 0.03, drop - 0.24 - sag * 1.6))))
    for ci in range(cols):
        for k in range(3):
            bm.faces.new((verts[ci][k], verts[ci + 1][k], verts[ci + 1][k + 1], verts[ci][k + 1]))
    for f in bm.faces:
        f.normal_flip()
    me = bpy.data.meshes.new('awn')
    bm.to_mesh(me)
    bm.free()
    aw = link(bpy.data.objects.new('awn', me))
    aw.data.materials.append(m['awning'])
    sol = aw.modifiers.new('s', 'SOLIDIFY')
    sol.thickness = 0.012
    parts = [aw,
             tube((-w / 2, 0, top - 0.05), (-w / 2, -out, drop), 0.02, m['steel'], 6),
             tube((w / 2, 0, top - 0.05), (w / 2, -out, drop), 0.02, m['steel'], 6),
             tube((-w / 2, -out, drop - 0.02), (w / 2, -out, drop - 0.02), 0.018, m['steel'], 6)]
    finish('awning', parts, 1.0)
    # --- shop door
    parts = [blk((0.08, 0.14, 2.3), (-0.62, -0.05, 1.15), m['frame'], bev=0.01), blk((0.08, 0.14, 2.3), (0.62, -0.05, 1.15), m['frame'], bev=0.01),
             blk((1.32, 0.14, 0.1), (0, -0.05, 2.35), m['frame'], bev=0.01),
             blk((1.1, 0.05, 0.3), (0, -0.04, 0.15), m['frame'], bev=0.01), blk((1.1, 0.04, 1.7), (0, -0.02, 1.25), m['glass']),
             tube((0.42, -0.1, 0.95), (0.42, -0.1, 1.45), 0.018, m['steel'], 8),
             blk((1.5, 0.3, 0.1), (0, -0.14, 0.05), m['concrete'], bev=0.01)]
    finish('door_shop', parts, 1.0)
    # --- drainpipe, 7 m
    parts = [tube((0, -0.12, 0.2), (0, -0.12, 7.0), 0.055, m['steel'], 10), tube((0, -0.12, 0.2), (0, -0.4, 0.05), 0.055, m['steel'], 10)]
    for z in (1.0, 2.4, 3.8, 5.2, 6.6):
        parts.append(blk((0.14, 0.14, 0.04), (0, -0.07, z), m['steel']))
    finish('drainpipe', parts, 0)
    # --- fire escape, two landings (wall at y=0), 2.4 wide
    parts = []
    for fl in (3.2, 6.4):
        parts.append(blk((2.4, 1.0, 0.05), (0, -0.5, fl), m['dark'], bev=0.005))
        for x in (-1.2, 1.2):
            parts.append(tube((x, -1.0, fl), (x, -1.0, fl + 1.0), 0.022, m['dark'], 6))
        parts.append(tube((-1.2, -1.0, fl + 1.0), (1.2, -1.0, fl + 1.0), 0.022, m['dark'], 6))
        parts.append(tube((-1.2, -1.0, fl + 0.5), (1.2, -1.0, fl + 0.5), 0.018, m['dark'], 6))
        parts.append(tube((-1.2, 0.0, fl + 1.0), (-1.2, -1.0, fl + 1.0), 0.022, m['dark'], 6))
        parts.append(tube((1.2, 0.0, fl + 1.0), (1.2, -1.0, fl + 1.0), 0.022, m['dark'], 6))
        for x in range(-5, 6):
            parts.append(tube((x * 0.2, -1.0, fl), (x * 0.2, -1.0, fl + 1.0), 0.012, m['dark'], 4, False))
        parts.append(tube((-1.1, -1.0, fl - 0.05), (-1.1, -0.1, fl + 1.5), 0.02, m['dark'], 6))
        parts.append(tube((1.1, -1.0, fl - 0.05), (1.1, -0.1, fl + 1.5), 0.02, m['dark'], 6))
    # stair run from the first landing down toward the street
    a, b = Vector((0.7, -1.0, 3.2)), Vector((0.7, -3.0, 0.5))
    for i in range(10):
        t = i / 9
        p = a.lerp(b, t)
        parts.append(blk((0.8, 0.28, 0.035), (p.x, p.y, p.z), m['dark']))
    for x in (0.3, 1.1):
        parts.append(tube((x, -1.0, 3.95), (x, -3.0, 1.3), 0.02, m['dark'], 6))
        parts.append(tube((x, -1.0, 3.2), (x, -3.0, 0.5), 0.02, m['dark'], 6))
    # ladder between the landings
    for x in (-0.9, -0.6):
        parts.append(tube((x, -0.95, 3.2), (x, -0.95, 6.4), 0.02, m['dark'], 6))
    for z in [3.4 + 0.3 * i for i in range(10)]:
        parts.append(tube((-0.9, -0.95, z), (-0.6, -0.95, z), 0.013, m['dark'], 5, False))
    finish('fire_escape', parts, 0)
    # --- rooftop water tank, standing on legs
    parts = [cylz(1.3, 2.6, (0, 0, 2.0), m['wood'], 20), cylz(1.38, 2.6, (0, 0, 2.0), m['wood'], 20)]
    parts[1].scale = (1.0, 1.0, 0.02)
    for z in (2.35, 3.2, 4.1):
        parts.append(cylz(1.36, 0.07, (0, 0, z), m['rust'], 20))
    parts.append(cylz(1.45, 0.9, (0, 0, 4.6), m['wood'], 20, r2=0.05))
    for a in range(4):
        x, y = math.cos(a * math.pi / 2 + 0.78) * 1.1, math.sin(a * math.pi / 2 + 0.78) * 1.1
        parts.append(tube((x, y, 0.0), (x * 0.9, y * 0.9, 2.1), 0.07, m['rust'], 6))
    for z in (0.6, 1.3):
        for a in range(4):
            a0 = a * math.pi / 2 + 0.78
            a1 = (a + 1) * math.pi / 2 + 0.78
            parts.append(tube((math.cos(a0) * 1.1, math.sin(a0) * 1.1, z), (math.cos(a1) * 1.1, math.sin(a1) * 1.1, z + 0.7), 0.03, m['rust'], 4, False))
    finish('water_tank', parts, 1.0)
    # --- roof vent + chimney
    parts = [cylz(0.25, 0.9, (0, 0, 0), m['steel'], 12), cylz(0.42, 0.06, (0, 0, 0.9), m['steel'], 12), cylz(0.12, 0.3, (0, 0, 0.96), m['steel'], 8, r2=0.3)]
    finish('roof_vent', parts, 1.0)
    parts = [blk((0.9, 0.9, 1.8), (0, 0, 0.9), M('brickchim', (0.35, 0.2, 0.16), rough=0.9), bev=0.01), blk((1.1, 1.1, 0.15), (0, 0, 1.85), m['concrete'], bev=0.01)]
    finish('chimney', parts, 1.0)


# =========================================================== STREET KIT ===
def furniture(m):
    # bench 1.8 m
    parts = []
    for i in range(5):
        parts.append(blk((1.8, 0.07, 0.045), (0, 0.02 - 0.075 * i, 0.46), m['wood'], bev=0.006))
    for i in range(3):
        parts.append(blk((1.8, 0.04, 0.09), (0, 0.17, 0.6 + 0.12 * i), m['wood'], rot=(-0.12, 0, 0), bev=0.006))
    for x in (-0.8, 0.8):
        parts += [blk((0.07, 0.5, 0.06), (x, 0.0, 0.43), m['dark']), blk((0.07, 0.06, 0.5), (x, 0.17, 0.2), m['dark']), blk((0.07, 0.06, 0.5), (x, -0.25, 0.2), m['dark']),
                  blk((0.07, 0.06, 0.55), (x, 0.17, 0.72), m['dark'], rot=(-0.12, 0, 0))]
    finish('bench', parts, 1.0)
    # street trash bin
    parts = [cylz(0.28, 0.85, (0, 0, 0.05), m['dark'], 16)]
    for z in (0.15, 0.45, 0.8):
        parts.append(cylz(0.3, 0.03, (0, 0, z), m['steel'], 16))
    parts += [cylz(0.34, 0.07, (0, 0, 0.9), m['steel'], 16), sphere(0.2, (0.0, 0.0, 1.0), m['plastic'], (1.3, 1.2, 0.7))]
    finish('trash_bin', parts, 1.0)
    # US mailbox
    parts = [blk((0.5, 0.5, 0.9), (0, 0, 0.75), m['blue'], bev=0.04), sphere(0.25, (0, 0, 1.2), m['blue'], (1, 1, 0.7)),
             blk((0.3, 0.05, 0.05), (0, -0.26, 1.0), m['dark']), blk((0.08, 0.08, 0.3), (-0.2, 0.0, 0.15), m['steel']), blk((0.08, 0.08, 0.3), (0.2, 0.0, 0.15), m['steel']),
             blk((0.35, 0.02, 0.2), (0, -0.26, 0.7), m['white'])]
    finish('mailbox', parts, 1.0)
    # newspaper box
    parts = [blk((0.45, 0.4, 0.9), (0, 0, 0.55), m['rust'], bev=0.02), blk((0.34, 0.02, 0.32), (0, -0.21, 0.78), m['glass']), blk((0.38, 0.04, 0.06), (0, -0.21, 0.5), m['steel']),
             tube((-0.15, 0, 0.1), (-0.15, 0, 0.1 + 0.1), 0.03, m['dark'], 6), tube((0.15, 0, 0.0), (0.15, 0, 0.1), 0.03, m['dark'], 6)]
    finish('news_box', parts, 1.0)
    # bollard
    parts = [cylz(0.14, 1.0, (0, 0, 0), m['concrete'], 14), cylz(0.145, 0.12, (0, 0, 0.7), m['yellow'], 14), sphere(0.14, (0, 0, 1.0), m['concrete'], (1, 1, 0.5))]
    finish('bollard', parts, 1.0)
    # parking meter
    parts = [tube((0, 0, 0), (0, 0, 1.2), 0.03, m['steel'], 8), blk((0.2, 0.12, 0.28), (0, 0, 1.3), m['steel'], bev=0.03), blk((0.12, 0.01, 0.1), (0, -0.065, 1.35), m['glass'])]
    finish('parking_meter', parts, 1.0)
    # traffic light: 5.6 m pole + 4 m arm, 2 heads
    parts = [cylz(0.1, 5.6, (0, 0, 0), m['dark'], 10, r2=0.07), cylz(0.2, 0.5, (0, 0, 0), m['dark'], 10, r2=0.12), tube((0, 0, 5.3), (3.8, 0, 5.9), 0.05, m['dark'], 8)]
    for hx, hz in ((3.8, 5.55), (1.8, 5.4)):
        parts.append(blk((0.35, 0.3, 1.05), (hx, 0, hz), m['dark'], bev=0.03))
        for i, key in enumerate(('red', 'amber', 'green')):
            parts.append(cylz(0.1, 0.06, (hx, -0.17, hz + 0.34 - 0.34 * i), m[key], 12))
            parts[-1].rotation_euler = (math.pi / 2, 0, 0)
            parts[-1].location = (hx, -0.17, hz + 0.34 - 0.34 * i)
            parts.append(blk((0.26, 0.12, 0.03), (hx, -0.2, hz + 0.34 - 0.34 * i + 0.1), m['dark']))
    parts.append(blk((0.35, 0.3, 0.3), (0, 0.2, 1.2), m['dark'], bev=0.02))
    finish('traffic_light', parts, 1.0)
    # stop sign
    oct = []
    for sc, key in ((1.0, 'white'), (0.92, 'stopred')):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.3 * sc, depth=0.02, vertices=8, location=(0, -0.05 - (0.01 if key == 'stopred' else 0), 2.3), rotation=(math.pi / 2, 0, math.pi / 8))
        o = bpy.context.active_object
        o.data.materials.append(m[key])
        oct.append(o)
    parts = oct + [tube((0, 0, 0), (0, 0, 2.3), 0.025, m['steel'], 8), blk((0.12, 0.012, 0.045), (0, -0.065, 2.3), m['white'])]
    finish('stop_sign', parts, 1.0)
    # planter with a dead shrub
    parts = [blk((1.4, 0.6, 0.55), (0, 0, 0.275), m['concrete'], bev=0.03), blk((1.25, 0.45, 0.04), (0, 0, 0.5), M('soil', (0.07, 0.05, 0.035), rough=1.0))]
    for i in range(12):
        a = R.random() * math.tau
        d = R.uniform(0.0, 0.35)
        top = Vector((math.cos(a) * 0.35, math.sin(a) * 0.12, 0.5 + R.uniform(0.4, 0.85)))
        parts.append(tube((math.cos(a) * d * 0.4, math.sin(a) * d * 0.2, 0.5), top, 0.012, m['leaf'], 4, False))
    finish('planter', parts, 1.0)
    # bus shelter (2.8 wide, front = -Y)
    parts = [blk((3.0, 1.4, 0.08), (0, 0, 2.5), m['frame'], bev=0.01)]
    for x in (-1.4, 1.4):
        parts.append(tube((x, 0.6, 0), (x, 0.6, 2.5), 0.035, m['frame'], 8))
        parts.append(tube((x, -0.6, 0), (x, -0.6, 2.5), 0.035, m['frame'], 8))
    parts.append(blk((2.76, 0.03, 2.2), (0, 0.62, 1.3), m['glass']))
    parts.append(blk((0.03, 1.2, 2.2), (-1.38, 0, 1.3), m['glass']))
    parts.append(blk((1.0, 0.06, 1.5), (0.95, 0.58, 1.3), m['ad']))
    parts.append(blk((1.8, 0.4, 0.05), (0, 0.35, 0.48), m['steel'], bev=0.01))
    parts += [blk((0.05, 0.05, 0.48), (-0.8, 0.35, 0.24), m['steel']), blk((0.05, 0.05, 0.48), (0.8, 0.35, 0.24), m['steel'])]
    finish('bus_shelter', parts, 1.0)
    # dead street tree (branching)
    parts = []

    def branch(p, d, r, L, depth):
        e = p + d * L
        parts.append(tube(p, e, r, m['leaf'], 6, False))
        if depth == 0 or r < 0.014:
            return
        for k in range(2 + (1 if depth > 2 else 0)):
            nd = (d + Vector((R.uniform(-0.8, 0.8), R.uniform(-0.8, 0.8), R.uniform(0.0, 0.55)))).normalized()
            branch(e, nd, r * 0.66, L * R.uniform(0.62, 0.8), depth - 1)
    branch(Vector((0, 0, 0)), Vector((0.02, 0.0, 1.0)), 0.2, 2.4, 4)
    finish('street_tree', parts, 1.0)
    # chain-link fence, 3 m section (alphaMap plane drawn in game)
    parts = [tube((-1.5, 0, 0), (-1.5, 0, 2.0), 0.035, m['steel'], 8), tube((1.5, 0, 0), (1.5, 0, 2.0), 0.035, m['steel'], 8),
             tube((-1.5, 0, 1.97), (1.5, 0, 1.97), 0.025, m['steel'], 8), tube((-1.5, 0, 0.05), (1.5, 0, 0.05), 0.02, m['steel'], 8),
             quad((-1.5, 0, 0.05), (1.5, 0, 0.05), (1.5, 0, 1.97), (-1.5, 0, 1.97), M('chainlink', (0.5, 0.5, 0.5), metal=0.8, rough=0.5), 'fcp')]
    finish('fence_chain', parts, 1.0, smooth=False)


def clutter(m):
    # wooden pallet
    parts = []
    for y in (-0.42, 0.0, 0.42):
        parts.append(blk((1.2, 0.1, 0.09), (0, y, 0.045), m['wood'], bev=0.004))
    for i in range(7):
        parts.append(blk((1.2, 0.1, 0.022), (0, -0.45 + i * 0.15, 0.1), m['wood'], rot=(0, 0, R.uniform(-0.01, 0.01))))
    for x in (-0.55, 0.0, 0.55):
        parts.append(blk((0.09, 1.0, 0.04), (x, 0.0, 0.01 + 0.05), m['wood']))
    finish('pallet', parts, 1.0)
    # wooden crate 0.9
    parts = [blk((0.9, 0.9, 0.9), (0, 0, 0.45), m['wood'], bev=0.01)]
    for s in (-1, 1):
        parts.append(blk((0.95, 0.06, 0.1), (0, s * 0.45, 0.2), m['wood'], rot=(0, 0.0, 0), bev=0.004))
        parts.append(blk((0.95, 0.06, 0.1), (0, s * 0.45, 0.7), m['wood'], bev=0.004))
        parts.append(blk((0.06, 0.95, 0.1), (s * 0.45, 0, 0.2), m['wood'], bev=0.004))
        parts.append(blk((0.06, 0.95, 0.1), (s * 0.45, 0, 0.7), m['wood'], bev=0.004))
        parts.append(tube((-0.45, s * 0.46, 0.0 + 0.05), (0.45, s * 0.46, 0.85), 0.04, m['wood'], 4))
    finish('crate_wood', parts, 1.0)
    # military crate
    parts = [blk((1.0, 0.5, 0.42), (0, 0, 0.21), m['olive'], bev=0.015), blk((1.04, 0.54, 0.05), (0, 0, 0.405), m['olive'], bev=0.01)]
    for x in (-0.35, 0.35):
        parts.append(blk((0.05, 0.54, 0.43), (x, 0, 0.21), m['olive'], bev=0.006))
    for s in (-1, 1):
        parts.append(blk((0.14, 0.03, 0.04), (0, s * 0.27, 0.34), m['steel']))
        parts.append(tube((-0.52, 0, 0.3), (-0.52, 0, 0.34), 0.012, m['steel'], 4))
    parts.append(blk((0.3, 0.012, 0.1), (0.15, -0.265, 0.2), m['white']))
    finish('crate_mil', parts, 1.0)
    # tyre stack of three
    parts = []
    for i in range(3):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.27, minor_radius=0.11, major_segments=18, minor_segments=8, location=(0.01 * i, 0.0, 0.11 + 0.2 * i))
        o = bpy.context.active_object
        o.scale = (1, 1, 0.9)
        o.data.materials.append(m['rubber'])
        parts.append(o)
    parts.append(cylz(0.17, 0.5, (0, 0, 0.0), m['steel'], 12))
    parts[-1].scale = (1, 1, 0.01)
    finish('tires_stack', parts, 1.0)
    # cinder blocks
    parts = []
    for r_, c in ((0, 0), (0, 1), (0, 2), (1, 0), (1, 1)):
        parts.append(blk((0.4, 0.2, 0.2), (-0.4 + c * 0.41 + r_ * 0.2, R.uniform(-0.01, 0.01), 0.1 + r_ * 0.2), m['concrete'], rot=(0, 0, R.uniform(-0.03, 0.03)), bev=0.008))
        for hx in (-0.1, 0.1):
            parts.append(blk((0.09, 0.12, 0.2), (-0.4 + c * 0.41 + r_ * 0.2 + hx, 0, 0.1 + r_ * 0.2 + 0.001), M('hole', (0.02, 0.02, 0.02), rough=1)))
    finish('cinder_blocks', parts, 1.0)
    # plywood barrier on A-stands
    parts = [blk((2.4, 0.03, 1.2), (0, 0, 0.9), m['wood'], rot=(0.0, 0, 0.0), bev=0.004)]
    for x in (-0.9, 0.9):
        parts += [tube((x, -0.3, 0.0), (x, 0.0, 1.4), 0.025, m['steel'], 6), tube((x, 0.3, 0.0), (x, 0.0, 1.4), 0.025, m['steel'], 6), tube((x, -0.3, 0.3), (x, 0.3, 0.3), 0.02, m['steel'], 6)]
    finish('plywood_barrier', parts, 1.0)
    # tarp lean-to / tent (3 x 2.4, ridge 1.7 high)
    bm = bmesh.new()
    nx, ny = 10, 6
    grid = []
    for i in range(nx + 1):
        row = []
        for j in range(ny + 1):
            u, v = i / nx, j / ny
            x = (u - 0.5) * 3.0
            ridge = 1.7 * (1 - abs(v - 0.5) * 2) ** 0.85
            z = 0.1 + ridge + 0.05 * math.sin(i * 1.7 + j * 2.3) - 0.07 * math.sin(math.pi * u) * (1 - abs(v - 0.5) * 2)
            y = (v - 0.5) * 2.6
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for i in range(nx):
        for j in range(ny):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    me = bpy.data.meshes.new('tarp')
    bm.to_mesh(me)
    bm.free()
    tp = link(bpy.data.objects.new('tarp', me))
    tp.data.materials.append(m['tarp'])
    sol = tp.modifiers.new('s', 'SOLIDIFY')
    sol.thickness = 0.01
    parts = [tp, tube((-1.5, 0, 0.0), (-1.5, 0, 1.85), 0.03, m['wood'], 6), tube((1.5, 0, 0.0), (1.5, 0, 1.85), 0.03, m['wood'], 6), tube((-1.5, 0, 1.82), (1.5, 0, 1.82), 0.02, m['wood'], 6)]
    for sx in (-1.5, 1.5):
        for sy in (-1, 1):
            parts.append(tube((sx, 0, 1.8), (sx * 1.25, sy * 1.7, 0.0), 0.006, m['cloth'], 4, False))
    for sy in (-1, 1):
        parts.append(blk((2.6, 0.6, 0.05), (0.0, sy * 0.95, 0.08), M('bedroll', (0.15, 0.2, 0.15), rough=1)))
    finish('tarp_tent', parts, 1.0, smooth=True)
    # floodlight tripod + generator
    parts = []
    for a in range(3):
        ang = a * math.tau / 3 + 0.4
        parts.append(tube((0, 0, 1.9), (math.cos(ang) * 0.6, math.sin(ang) * 0.6, 0.0), 0.022, m['steel'], 6))
    parts += [tube((0, 0, 1.6), (0, 0, 2.5), 0.03, m['steel'], 8), blk((0.5, 0.08, 0.1), (0, 0, 2.5), m['dark'])]
    for x in (-0.2, 0.2):
        parts += [blk((0.34, 0.16, 0.28), (x, -0.06, 2.65), m['dark'], bev=0.015), blk((0.3, 0.02, 0.24), (x, -0.15, 2.65), m['lamp'])]
    parts += [blk((0.8, 0.5, 0.55), (0.9, 0.7, 0.28), m['olive'], bev=0.03), blk((0.2, 0.2, 0.15), (1.0, 0.7, 0.62), m['dark']),
              cylz(0.1, 0.3, (0.55, 0.9, 0.0), m['rust'], 10), tube((0.55, 0.9, 0.32), (0.2, 0.2, 0.0), 0.012, m['dark'], 4, False), tube((0.2, 0.2, 0.0), (0.0, 0.0, 1.0), 0.012, m['dark'], 4, False)]
    finish('floodlight', parts, 1.0)
    # shopping cart
    parts = [blk((0.55, 0.9, 0.04), (0, 0, 0.3), m['steel'])]
    parts += lattice(0.55, 0.4, (0, -0.45, 0.32), m['steel'], 0.07, 0.006)
    parts += lattice(0.55, 0.4, (0, 0.45, 0.32), m['steel'], 0.07, 0.006)
    for s in (-1, 1):
        parts += lattice(0.9, 0.4, (s * 0.275, 0.0, 0.32), m['steel'], 0.07, 0.006)
        parts[-1].rotation_euler = (0, 0, 0)
    parts += [tube((-0.28, 0.45, 0.7), (0.28, 0.45, 0.7), 0.014, m['steel'], 6), tube((-0.28, 0.45, 0.7), (-0.25, 0.5, 0.2), 0.012, m['steel'], 6), tube((0.28, 0.45, 0.7), (0.25, 0.5, 0.2), 0.012, m['steel'], 6)]
    for x in (-0.22, 0.22):
        for y in (-0.4, 0.4):
            parts.append(cylz(0.045, 0.03, (x, y, 0.045), m['rubber'], 8))
            parts[-1].rotation_euler = (0, math.pi / 2, 0)
            parts[-1].location = (x, y, 0.06)
    finish('shopping_cart', parts, 0, smooth=True)
    # suitcase + backpack
    parts = [blk((0.5, 0.2, 0.7), (0, 0, 0.4), M('suitcase', (0.25, 0.04, 0.05), rough=0.5), bev=0.035), blk((0.3, 0.03, 0.04), (0, 0, 0.78), m['dark'])]
    for x in (-0.18, 0.18):
        parts.append(blk((0.04, 0.03, 0.7), (x, 0.0, 0.4), m['dark']))
        parts.append(cylz(0.03, 0.03, (x, 0.0, 0.03), m['rubber'], 8))
    finish('suitcase', parts, 0)
    parts = [sphere(0.22, (0, 0, 0.25), M('backpack', (0.1, 0.12, 0.16), rough=0.9), (1.0, 0.7, 1.15)), blk((0.3, 0.1, 0.18), (0, -0.16, 0.2), M('backpack', (0.1, 0.12, 0.16), rough=0.9), bev=0.03),
             tube((-0.12, 0.1, 0.4), (-0.15, 0.3, 0.05), 0.012, m['dark'], 4, False), tube((0.12, 0.1, 0.4), (0.15, 0.3, 0.05), 0.012, m['dark'], 4, False)]
    finish('backpack', parts, 0)
    # cardboard stack
    parts = []
    for loc, size, rot in (((0, 0, 0.2), (0.6, 0.45, 0.4), 0.05), ((0.12, 0.05, 0.55), (0.5, 0.4, 0.3), -0.15), ((-0.7, 0.2, 0.15), (0.45, 0.4, 0.3), 0.3), ((0.7, -0.1, 0.12), (0.4, 0.3, 0.24), -0.2)):
        parts.append(blk(size, loc, m['cardboard'], rot=(0, 0, rot), bev=0.008))
        parts.append(blk((size[0] * 0.96, 0.05, 0.002), (loc[0], loc[1], loc[2] + size[2] / 2 + 0.002), m['white'], rot=(0, 0, rot)))
    finish('cardboard_stack', parts, 1.0)
    # barrel (blue + grey variants are tinted in game)
    parts = [cylz(0.29, 0.88, (0, 0, 0.0), M('barrel2', (0.07, 0.15, 0.3), metal=0.5, rough=0.55), 24)]
    for z in (0.15, 0.45, 0.72):
        parts.append(cylz(0.3, 0.03, (0, 0, z), M('barrel2', (0.07, 0.15, 0.3), metal=0.5, rough=0.55), 24))
    parts += [cylz(0.12, 0.02, (0.1, 0.1, 0.88), m['steel'], 8), cylz(0.04, 0.03, (-0.12, 0.05, 0.88), m['dark'], 8)]
    finish('barrel_blue', parts, 1.0)


def debris(m):
    # tiny things, instanced by the hundred in game
    finish('deb_can', [cylz(0.033, 0.11, (0, 0, 0.0), m['steel'], 8), cylz(0.036, 0.01, (0, 0, 0.1), m['steel'], 8)], 0)
    finish('deb_bottle', [cylz(0.03, 0.17, (0, 0, 0.0), M('bottle', (0.12, 0.07, 0.02), rough=0.1), 8), cylz(0.012, 0.08, (0, 0, 0.16), M('bottle', (0.12, 0.07, 0.02), rough=0.1), 8, r2=0.012)], 0)
    finish('deb_carton', [blk((0.32, 0.22, 0.025), (0, 0, 0.0125), m['cardboard'], rot=(0, 0, 0.0), bev=0.004)], 0)
    finish('deb_brick', [blk((0.21, 0.1, 0.065), (0, 0, 0.032), m['brick'], bev=0.006)], 0)
    finish('deb_bag', [sphere(0.12, (0, 0, 0.03), m['plastic'], (1.4, 1.0, 0.3), 8)], 0)
    finish('deb_rag', [blk((0.4, 0.3, 0.015), (0, 0, 0.008), m['cloth'], rot=(0.05, 0.05, 0.4), bev=0.004)], 0)
    sh = []
    for i in range(7):
        a = R.random() * math.tau
        bpy.ops.mesh.primitive_cone_add(radius1=R.uniform(0.012, 0.03), radius2=0.0, depth=0.003, vertices=3, location=(math.cos(a) * 0.07, math.sin(a) * 0.07, 0.003), rotation=(0, 0, R.random() * 6))
        o = bpy.context.active_object
        o.data.materials.append(M('shard', (0.5, 0.6, 0.65), rough=0.05))
        sh.append(o)
    finish('deb_glass', sh, 0, smooth=False)
    finish('deb_plank', [blk((0.8, 0.09, 0.025), (0, 0, 0.0125), m['wood'], rot=(0, 0, 0.0), bev=0.004)], 1.0)
    finish('deb_pipe', [tube((-0.3, 0, 0.04), (0.3, 0, 0.04), 0.04, m['steel'], 8)], 0)


def build():
    P.reset()
    P.MATS.clear()
    m = mats()
    facade(m)
    furniture(m)
    clutter(m)
    debris(m)
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'street.glb'), export_format='GLB', use_selection=True, export_materials='EXPORT',
                              export_yup=True, export_texcoords=True, export_normals=True)
    print('[street] wrote', os.path.getsize(os.path.join(OUT, 'street.glb')) // 1024, 'KB')


if __name__ == '__main__':
    build()
