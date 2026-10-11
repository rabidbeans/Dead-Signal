"""The SMG-9: a compact 9 mm submachine gun, ~0.64 m with the stock out, red-dot optic,
curved 30-round magazine, M-LOK handguard, ported flash hider, vertical foregrip.

    python smg.py

Writes public/assets/weapons/smg.glb (three nodes, like the pistol, so the game's reload and
recoil code works unchanged: gun_slide = charging handle + bolt, gun_mag, gun_frame) and
smg_icon.webp. Origin at the web of the shooting hand (top-rear of the pistol grip), x forward.
"""
import math
import os
import sys
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from weapons import reset, mat, profile_extrude, cyl, box, boolean, apply_all, OUT, QA  # noqa: E402


def join(objs, name):
    for o in objs:
        apply_all(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    j = bpy.context.active_object
    j.name = name
    return j


def build():
    reset()
    steel = mat('steel_dark', (0.045, 0.048, 0.052), metal=0.85, rough=0.38)
    poly = mat('poly', (0.026, 0.027, 0.029), rough=0.62)
    tan = mat('tan', (0.20, 0.17, 0.11), rough=0.7)
    glass = mat('lens', (0.01, 0.03, 0.05), metal=0.1, rough=0.06)
    dot = mat('reddot', (0.2, 0.0, 0.0), rough=0.3, emit=(1.0, 0.1, 0.05))
    metal = mat('steel', (0.30, 0.30, 0.29), metal=1.0, rough=0.3)
    parts = []

    # ---- receivers
    up = profile_extrude('upper', [(-0.14, 0.02), (0.28, 0.02), (0.28, 0.085), (-0.12, 0.085), (-0.14, 0.075)], 0.040, bevel=0.002, material=steel)
    apply_all(up)
    boolean(up, box('port', (0.07, 0.02, 0.028), (0.0, -0.022, 0.055), bevel=0))      # ejection port, shooter's right
    for i in range(7):                                                                  # cocking-side serrations
        boolean(up, box('s', (0.003, 0.05, 0.02), (-0.125 + i * 0.008, 0, 0.06), bevel=0))
    parts.append(up)
    lower = profile_extrude('lower', [(-0.07, -0.012), (0.10, -0.012), (0.10, 0.02), (-0.07, 0.02)], 0.036, bevel=0.002, material=poly)
    parts.append(lower)
    # ---- handguard with M-LOK slots, barrel and flash hider
    hg = box('handguard', (0.17, 0.046, 0.085), (0.215, 0, 0.022), poly, bevel=0.003)
    apply_all(hg)
    for i in range(4):
        for s in (-1, 1):
            boolean(hg, box('mlok', (0.034, 0.02, 0.011), (0.165 + i * 0.045, s * 0.023, 0.022), bevel=0))
    parts.append(hg)
    parts.append(cyl('barrel', 0.0085, 0.05, (0.31, 0, 0.052), material=steel, verts=16))
    fh = cyl('hider', 0.0135, 0.06, (0.335, 0, 0.052), material=steel, verts=16)
    apply_all(fh)
    for a in range(4):
        c = box('port', (0.014, 0.004, 0.034), (0.342, 0, 0.052), bevel=0)
        c.rotation_euler = (a * math.pi / 4, 0, 0)
        boolean(fh, c)
    parts.append(fh)
    # ---- the pistol grip, trigger guard, trigger
    grip = profile_extrude('grip', [(-0.022, 0.0), (0.036, 0.0), (0.022, -0.105), (-0.034, -0.10), (-0.042, -0.07)], 0.034, bevel=0.004, material=poly)
    apply_all(grip)
    for i in range(6):
        boolean(grip, box('g', (0.04, 0.006, 0.003), (-0.006 - i * 0.002, 0, -0.012 - i * 0.015), bevel=0))
    parts.append(grip)
    parts.append(box('tg_f', (0.006, 0.012, 0.042), (0.099, 0, -0.03), poly, bevel=0.001))
    parts.append(box('tg_b', (0.064, 0.012, 0.006), (0.068, 0, -0.056), poly, bevel=0.001))
    parts.append(profile_extrude('trigger', [(0.05, -0.008), (0.058, -0.008), (0.054, -0.04), (0.047, -0.04)], 0.007, bevel=0.0006, material=steel))
    parts.append(box('magwell', (0.062, 0.036, 0.042), (0.093, 0, -0.022), poly, bevel=0.003))
    # ---- stock: buffer tube, strut, cheek riser, tan butt pad
    parts.append(cyl('tube', 0.0165, 0.14, (-0.21, 0, 0.045), material=steel, verts=16))
    parts.append(box('strut', (0.12, 0.014, 0.014), (-0.20, 0, 0.012), poly, bevel=0.002))
    parts.append(box('cheek', (0.10, 0.03, 0.02), (-0.19, 0, 0.074), poly, bevel=0.004))
    parts.append(box('butt', (0.024, 0.036, 0.1), (-0.286, 0, 0.034), tan, bevel=0.006))
    # ---- optic on a short rail
    parts.append(box('rail', (0.14, 0.022, 0.008), (0.05, 0, 0.089), steel, bevel=0.001))
    for i in range(9):
        parts.append(box('rs', (0.004, 0.024, 0.0045), (-0.015 + i * 0.016, 0, 0.0945), steel, bevel=0))
    parts.append(box('optic', (0.062, 0.032, 0.040), (0.05, 0, 0.117), poly, bevel=0.005))
    parts.append(box('lens_f', (0.002, 0.024, 0.027), (0.0825, 0, 0.12), glass, bevel=0))
    parts.append(box('lens_r', (0.002, 0.024, 0.027), (0.0175, 0, 0.12), glass, bevel=0))
    parts.append(box('dot', (0.0015, 0.003, 0.003), (0.0162, 0, 0.121), dot, bevel=0))
    parts.append(box('knob', (0.016, 0.006, 0.014), (0.05, -0.019, 0.12), steel, bevel=0.001))
    # ---- vertical foregrip, a sling loop, a tan accent on the handguard
    parts.append(box('foregrip', (0.026, 0.028, 0.072), (0.205, 0, -0.03), poly, bevel=0.005))
    parts.append(box('fg_base', (0.04, 0.03, 0.01), (0.205, 0, -0.0), steel, bevel=0.001))
    parts.append(box('stripe', (0.17, 0.047, 0.006), (0.215, 0, 0.0), tan, bevel=0.0006))
    frame = join(parts, 'gun_frame')

    # ---- moving parts: the charging handle and bolt
    sl = [box('ch', (0.05, 0.012, 0.012), (-0.10, 0, 0.092), steel, bevel=0.001),
          box('ch2', (0.012, 0.034, 0.012), (-0.118, 0, 0.092), poly, bevel=0.002),
          box('bolt', (0.07, 0.010, 0.026), (0.0, -0.021, 0.055), metal, bevel=0.001)]
    slide = join(sl, 'gun_slide')

    # ---- the magazine: a curved 30-round box and its base plate
    mp = profile_extrude('mag', [(0.074, -0.03), (0.115, -0.03), (0.123, -0.10), (0.148, -0.19), (0.147, -0.20), (0.103, -0.20), (0.102, -0.19), (0.08, -0.10)], 0.028, bevel=0.002, material=steel)
    mp.data.materials.append(poly)
    mag = join([mp, box('plate', (0.052, 0.03, 0.012), (0.1255, 0, -0.206), poly, bevel=0.002),
                box('rib', (0.003, 0.0285, 0.15), (0.134, 0, -0.12), poly, bevel=0)], 'gun_mag')

    # origins at the grip web (world origin), then export all three
    bpy.context.scene.cursor.location = (0, 0, 0)
    for o in (slide, mag, frame):
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        o.location = (0, 0, 0)
    for o in (slide, mag, frame):
        o.select_set(True)
    tris = sum(len(p.vertices) - 2 for o in (slide, mag, frame) for p in o.data.polygons)
    print('[smg] tris', tris)
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'smg.glb'), export_format='GLB', use_selection=True, export_materials='EXPORT', export_yup=True)
    icon(frame)


def icon(gun):
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
    for loc, energy, size, col in (((-0.1, 0.35, 0.45), 6.0, 0.6, (1, 0.93, 0.85)), ((0.5, -0.4, 0.2), 3.0, 0.2, (0.6, 0.75, 1)), ((0.0, -0.6, 0.3), 0.8, 0.8, (1, 1, 1))):
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
    cd.ortho_scale = 0.68
    co = bpy.data.objects.new('c', cd)
    sc.collection.objects.link(co)
    co.location = (0.05, -0.6, -0.03)
    co.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = co
    os.makedirs(QA, exist_ok=True)
    p = os.path.join(QA, 'smg_icon.png')
    sc.render.filepath = p
    bpy.ops.render.render(write_still=True)
    from PIL import Image
    Image.open(p).save(os.path.join(OUT, 'smg_icon.webp'), 'WEBP', quality=90)
    print('[smg] icon written')


if __name__ == '__main__':
    build()
