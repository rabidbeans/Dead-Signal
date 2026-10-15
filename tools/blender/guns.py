"""Round 7 long guns: the Breacher 12 pump shotgun, the AR-7 Carbine and the M-60 Hailstorm.

    python guns.py [shotgun] [rifle] [lmg]        (all three when none is named)

Each writes public/assets/weapons/<name>.glb with the three nodes the game drives
(gun_frame, gun_slide, gun_mag; origins at the web of the shooting hand, x forward,
z up, -y the shooter's RIGHT side, metres) and <name>_icon.webp (768x432, transparent).
QA renders (the icon at full size plus a 3/4 view of the other side) go to qa/.

gun_slide is what cycles back along -x: the shotgun's pump forend and action bars, the
rifle's charging handle and bolt carrier, the LMG's charging handle. gun_mag drops on a
reload: the rifle's curved mag, the LMG's ammo box and belt, and (the shotgun has no
detachable magazine) the two red shells riding in the side saddle.

A touch more stylised and colourful than the pistol / SMG: walnut, coyote and olive
furniture, dark steel with bright worn-steel accents, red shells, brass.
"""
import math
import os
import sys
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import weapons as W  # noqa: E402
from weapons import reset, mat, cyl, boolean, apply_all, OUT, QA  # noqa: E402


def box(name, size, loc, material=None, bevel=0.0008, segs=None):
    """weapons.box with a cheaper bevel: one chamfer on small parts (a two-segment bevel costs a
    small box 108 triangles; one segment 44; none 12)."""
    ob = W.box(name, size, loc, material, bevel=bevel)
    if bevel:
        ob.modifiers['bev'].segments = segs or (1 if bevel < 0.0025 else 2)
    return ob


def profile_extrude(name, pts, width, bevel=0.0015, segs=None, material=None):
    return W.profile_extrude(name, pts, width, bevel=bevel, segs=segs or (1 if bevel < 0.0016 else 2 if bevel < 0.005 else 3),
                             material=material)

R90 = math.radians(90)


def join(objs, name):
    for o in objs:
        apply_all(o)
    if os.environ.get('GUN_DEBUG'):
        tally = {}
        for o in objs:
            k = o.name.split('.')[0]
            tally[k] = tally.get(k, 0) + sum(len(p.vertices) - 2 for p in o.data.polygons)
        print('[tris]', name, sorted(tally.items(), key=lambda kv: -kv[1])[:14])
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    j = bpy.context.active_object
    j.name = name
    return j


def sphere(name, r, loc, material=None, seg=10, rings=6):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=rings)
    ob = bpy.context.active_object
    ob.name = name
    if material:
        ob.data.materials.append(material)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def cone(name, r1, r2, depth, loc, material=None, verts=10, rot=(0, R90, 0)):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot, vertices=verts)
    ob = bpy.context.active_object
    ob.name = name
    if material:
        ob.data.materials.append(material)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def turn(ob, euler):
    """Rotate about the object's own centre. (box() applies its transform, which leaves the origin
    at the WORLD origin, so a bare rotation_euler on a box swings it about the grip.)"""
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    ob.rotation_euler = euler
    return ob


def smooth(ob):
    """Cylinders: smooth shading with sharp caps (auto-smooth by angle)."""
    apply_all(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    except Exception:
        for p in ob.data.polygons:
            p.use_smooth = True
    return ob


def tcyl(name, r, depth, loc, material=None, verts=16, rot=(0, R90, 0)):
    return smooth(cyl(name, r, depth, loc, rot=rot, verts=verts, material=material))


def mats():
    return dict(
        steel=mat('steel_dark', (0.055, 0.058, 0.064), metal=0.85, rough=0.36),
        blued=mat('steel_blued', (0.035, 0.042, 0.06), metal=0.9, rough=0.3),
        worn=mat('steel_worn', (0.48, 0.47, 0.44), metal=1.0, rough=0.3),
        poly=mat('poly_black', (0.03, 0.031, 0.034), rough=0.6),
        glass=mat('lens', (0.02, 0.06, 0.08), metal=0.2, rough=0.08),
        dot=mat('reddot', (0.3, 0.0, 0.0), rough=0.3, emit=(1.0, 0.12, 0.05)),
    )


def finish(name, frame, slide, mag, side=-1, extra=None):
    """Origins at the grip web, export, measure, icon."""
    bpy.context.scene.cursor.location = (0, 0, 0)
    objs = (frame, slide, mag)
    for o in objs:
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        o.location = (0, 0, 0)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs}
    xs = [v.co.x for o in objs for v in o.data.vertices]
    mz = [v.co.z for v in mag.data.vertices]
    print(f'[{name}] tris {tris} total {sum(tris.values())}')
    print(f'[{name}] x {min(xs):.4f} .. {max(xs):.4f}  length {max(xs) - min(xs):.4f}  mag bottom z {min(mz):.4f}')
    sx = [v.co.x for v in slide.data.vertices]
    print(f'[{name}] slide x {min(sx):.4f} .. {max(sx):.4f}')
    if extra:
        for k, v in extra.items():
            print(f'[{name}] {k}: {v}')
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f'{name}.glb'), export_format='GLB', use_selection=True,
                              export_materials='EXPORT', export_yup=True)
    icon(name, objs, side)


def icon(name, objs, side):
    """side -1: the camera looks at the gun's right (like the SMG's icon). side +1: it looks at the
    left and the picture is flipped, so the muzzle still points right (the saddle / the belt live there)."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 80
    sc.cycles.use_denoising = True
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
    xs = [v.co.x for o in objs for v in o.data.vertices]
    zs = [v.co.z for o in objs for v in o.data.vertices]
    cx, cz = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2
    L, H = max(xs) - min(xs), max(zs) - min(zs)
    tgt = bpy.data.objects.new('tgt', None)
    tgt.location = (cx, 0, cz)
    sc.collection.objects.link(tgt)
    k = L / 0.64
    for loc, energy, size, col in (((-0.1, 0.35, 0.45), 6.0, 0.6, (1, 0.93, 0.85)), ((0.5, -0.4, 0.2), 3.0, 0.2, (0.6, 0.75, 1)),
                                   ((0.0, -0.6, 0.3), 2.2, 0.8, (1, 1, 1))):
        ld = bpy.data.lights.new('l', 'AREA')
        ld.energy = energy * k * k
        ld.size = size * k
        ld.color = col
        lo = bpy.data.objects.new('l', ld)
        x, y, z = loc
        if side > 0:
            x = -x            # mirror the key so the flipped picture is lit like the SMG's
        lo.location = (cx + x * k, (y if side < 0 else -y) * k, cz + z * k)
        sc.collection.objects.link(lo)
        c = lo.constraints.new('TRACK_TO')
        c.target = tgt
        c.track_axis = 'TRACK_NEGATIVE_Z'
        c.up_axis = 'UP_Y'
    cd = bpy.data.cameras.new('c')
    cd.type = 'ORTHO'
    cd.ortho_scale = max(L * 1.05, H * 1.15 * 768 / 432)
    cd.clip_end = 10
    co = bpy.data.objects.new('c', cd)
    sc.collection.objects.link(co)
    co.location = (cx, 1.5 * side, cz)
    co.rotation_euler = (R90, 0, 0 if side < 0 else math.pi)
    sc.camera = co
    os.makedirs(QA, exist_ok=True)
    p = os.path.join(QA, f'{name}_icon.png')
    sc.render.filepath = p
    bpy.ops.render.render(write_still=True)
    from PIL import Image
    im = Image.open(p)
    if side > 0:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
        im.save(p)
    im.save(os.path.join(OUT, f'{name}_icon.webp'), 'WEBP', quality=90)
    # a QA look at the other side, from above and in front: everything a top-down camera sees
    sc.cycles.samples = 32
    co.data.type = 'PERSP'
    co.data.lens = 50
    d = L * 1.25
    co.location = (cx + d * 0.55, -side * d * 0.75, cz + d * 0.55)
    tr = co.constraints.new('TRACK_TO')
    tr.target = tgt
    tr.track_axis = 'TRACK_NEGATIVE_Z'
    tr.up_axis = 'UP_Y'
    sc.render.film_transparent = False
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.25, 0.26, 0.28, 1)
    sc.render.filepath = os.path.join(QA, f'{name}_qa34.png')
    bpy.ops.render.render(write_still=True)
    print(f'[{name}] icon written')


# --------------------------------------------------------------------------- shotgun
def shotgun():
    """Breacher 12: an 870-pattern pump gun, ~0.96 m. Bore at z 0.03; the web of the hand sits on the
    top of the stock's wrist right behind the receiver (the origin)."""
    reset()
    M = mats()
    wood = mat('walnut', (0.25, 0.085, 0.03), rough=0.42)
    wood_d = mat('walnut_dark', (0.11, 0.035, 0.014), rough=0.5)
    pad = mat('recoil_pad', (0.13, 0.025, 0.018), rough=0.75)
    red = mat('shell_red', (0.62, 0.04, 0.025), rough=0.4)
    brass = mat('brass', (0.78, 0.52, 0.2), metal=1.0, rough=0.28)
    olive = mat('saddle', (0.13, 0.14, 0.07), rough=0.65)
    B = 0.03                           # the bore's height
    parts = []

    # ---- the receiver: flat sides, a rounded top running down into the stock
    rc = profile_extrude('receiver', [(0.022, -0.026), (0.245, -0.026), (0.245, 0.052), (0.235, 0.058),
                                      (0.06, 0.058), (0.025, 0.046), (0.018, 0.02)], 0.034, bevel=0.003, material=M['blued'])
    apply_all(rc)
    boolean(rc, box('port', (0.075, 0.02, 0.026), (0.155, -0.02, 0.03), bevel=0))        # ejection port, right side
    boolean(rc, box('load', (0.085, 0.024, 0.02), (0.165, 0, -0.03), bevel=0))            # loading port underneath
    parts.append(rc)
    parts.append(box('bolt', (0.07, 0.006, 0.02), (0.155, -0.011, 0.03), M['worn'], bevel=0.001))   # the bolt in the port
    parts.append(box('ridge', (0.17, 0.012, 0.004), (0.14, 0, 0.0595), M['worn'], bevel=0.0008))    # worn top edge
    for x in (0.05, 0.215):
        parts.append(tcyl('pin', 0.0035, 0.036, (x, 0, -0.012), M['worn'], verts=8, rot=(R90, 0, 0)))   # trigger-group pins
    # ---- trigger guard, trigger, safety
    tg = profile_extrude('tguard', [(0.04, -0.026), (0.135, -0.026), (0.13, -0.034), (0.112, -0.062), (0.06, -0.064),
                                    (0.045, -0.05)], 0.018, bevel=0.002, material=M['poly'])
    apply_all(tg)
    boolean(tg, profile_extrude('tg_hole', [(0.056, -0.02), (0.118, -0.02), (0.104, -0.052), (0.066, -0.054), (0.056, -0.044)], 0.05, bevel=0))
    parts.append(tg)
    parts.append(profile_extrude('trigger', [(0.083, -0.026), (0.093, -0.026), (0.088, -0.05), (0.081, -0.052)], 0.007, bevel=0.0008, material=M['worn']))
    parts.append(tcyl('safety', 0.004, 0.026, (0.052, 0, -0.03), M['worn'], verts=8, rot=(R90, 0, 0)))
    # ---- barrel, vent rib, bead; magazine tube, its cap, the barrel ring
    parts.append(tcyl('barrel', 0.0115, 0.385, (0.43, 0, B), M['blued'], verts=18))
    parts.append(tcyl('muzzle', 0.0125, 0.012, (0.617, 0, B), M['worn'], verts=18))
    parts.append(box('rib', (0.37, 0.007, 0.004), (0.43, 0, B + 0.0135), M['steel'], bevel=0.0006))
    for i in range(9):
        parts.append(box('post', (0.006, 0.005, 0.004), (0.26 + i * 0.043, 0, B + 0.0105), M['steel'], bevel=0))
    parts.append(sphere('bead', 0.0032, (0.612, 0, B + 0.018), M['worn'], seg=8, rings=5))
    parts.append(tcyl('tube', 0.0105, 0.34, (0.415, 0, B - 0.025), M['blued'], verts=16))
    parts.append(tcyl('cap', 0.0125, 0.03, (0.598, 0, B - 0.025), M['steel'], verts=16))
    parts.append(tcyl('capring', 0.013, 0.006, (0.585, 0, B - 0.025), M['worn'], verts=16))
    parts.append(box('clamp', (0.016, 0.026, 0.05), (0.565, 0, B - 0.012), M['steel'], bevel=0.003))
    parts.append(box('swivel', (0.01, 0.004, 0.016), (0.585, 0, B - 0.044), M['worn'], bevel=0.001))
    # ---- the stock: walnut, a straight English-ish line with a hand-filling wrist
    st = profile_extrude('stock', [(0.03, 0.036), (0.0, 0.004), (-0.05, -0.004), (-0.12, 0.004), (-0.32, -0.006),
                                   (-0.335, -0.012), (-0.335, -0.122), (-0.30, -0.124), (-0.10, -0.078),
                                   (-0.045, -0.058), (0.0, -0.04), (0.03, -0.028)], 0.041, bevel=0.009, segs=3, material=wood)
    parts.append(st)
    chk = profile_extrude('chkpanel', [(0.008, -0.012), (-0.02, -0.016), (-0.07, -0.02), (-0.08, -0.05), (-0.04, -0.046),
                                       (0.0, -0.034)], 0.0425, bevel=0.002, material=wood_d)   # wrist checkering panels
    apply_all(chk)
    for i in range(6):
        c = box('chk', (0.0025, 0.06, 0.05), (-0.064 + i * 0.012, 0, -0.03), bevel=0)
        turn(c, (0, math.radians(30), 0))
        boolean(chk, c)
    parts.append(chk)
    parts.append(profile_extrude('pad', [(-0.333, -0.01), (-0.352, -0.008), (-0.354, -0.124), (-0.333, -0.124)],
                                 0.043, bevel=0.005, material=pad))
    parts.append(box('spacer', (0.003, 0.044, 0.112), (-0.334, 0, -0.067), M['poly'], bevel=0))
    parts.append(tcyl('stud', 0.004, 0.012, (-0.26, 0, -0.112), M['worn'], verts=8, rot=(0, 0, 0)))
    # ---- side saddle on the LEFT (+y) of the receiver: an olive carrier, two loops, a bolt head
    parts.append(box('saddle', (0.105, 0.006, 0.05), (0.12, 0.02, 0.012), olive, bevel=0.002))
    for x in (0.09, 0.15):
        parts.append(box('loop', (0.014, 0.008, 0.054), (x, 0.0345, 0.012), olive, bevel=0.002))
    parts.append(tcyl('screw', 0.004, 0.004, (0.12, 0.024, 0.012), M['worn'], verts=8, rot=(R90, 0, 0)))
    frame = join(parts, 'gun_frame')

    # ---- gun_slide: the pump forend and its action bars
    fe = tcyl('forend', 0.026, 0.19, (0.425, 0, B - 0.021), wood, verts=20)
    fe.scale = (1, 0.92, 1)
    apply_all(fe)
    for i in range(8):
        x = 0.36 + i * 0.019
        for s in (-1, 1):
            boolean(fe, box('gr', (0.006, 0.012, 0.034), (x, s * 0.025, B - 0.024), bevel=0))
        boolean(fe, box('gb', (0.006, 0.03, 0.012), (x, 0, B - 0.047), bevel=0))
    sl = [fe,
          tcyl('fe_cap_f', 0.0225, 0.01, (0.523, 0, B - 0.021), wood_d, verts=20),
          tcyl('fe_cap_r', 0.0225, 0.01, (0.327, 0, B - 0.021), wood_d, verts=20)]
    for s in (-1, 1):
        sl.append(box('bar', (0.12, 0.003, 0.008), (0.27, s * 0.0135, B - 0.024), M['worn'], bevel=0.0006))
    slide = join(sl, 'gun_slide')

    # ---- gun_mag: two red 12-gauge shells in the saddle, brass to the rear
    sh = []
    crimp_m = mat('shell_end', (0.35, 0.02, 0.015), rough=0.5)
    for z in (0.024, 0.0):
        sh.append(tcyl('hull', 0.0105, 0.058, (0.124, 0.034, z), red, verts=14))
        sh.append(tcyl('base', 0.0108, 0.014, (0.087, 0.034, z), brass, verts=14))
        sh.append(tcyl('rim', 0.0118, 0.002, (0.0795, 0.034, z), brass, verts=14))
        sh.append(tcyl('crimp', 0.0085, 0.002, (0.1535, 0.034, z), crimp_m, verts=14))
    mag = join(sh, 'gun_mag')
    finish('shotgun', frame, slide, mag, side=+1, extra={
        'bore z': B, 'grip (wrist) centre': (-0.03, -0.027), 'forend palm x': 0.425, 'forend wrist': (0.36, -0.03),
        'pump grabbed x': 0.425, 'pump travel back': 0.085, 'loading port x': 0.165})


# --------------------------------------------------------------------------- rifle
def rifle():
    """AR-7 Carbine: a 14.5" AR, ~0.88 m, coyote furniture, holographic sight, angled foregrip. Bore z 0.058."""
    reset()
    M = mats()
    fde = mat('coyote', (0.36, 0.25, 0.13), rough=0.62)
    fde_d = mat('coyote_dark', (0.2, 0.135, 0.07), rough=0.65)
    magm = mat('mag_steel', (0.16, 0.165, 0.17), metal=0.8, rough=0.4)
    B = 0.058
    parts = []

    # ---- upper (dark steel, flat-top) and lower (dark steel, magwell flare)
    up = profile_extrude('upper', [(-0.065, 0.03), (0.20, 0.03), (0.20, 0.084), (-0.062, 0.084), (-0.068, 0.076)],
                         0.036, bevel=0.0022, material=M['steel'])
    apply_all(up)
    boolean(up, box('port', (0.072, 0.02, 0.022), (0.03, -0.02, 0.052), bevel=0))
    parts.append(up)
    parts.append(box('deflect', (0.016, 0.01, 0.018), (-0.02, -0.02, 0.066), M['steel'], bevel=0.003))
    parts.append(tcyl('fwdassist', 0.0075, 0.03, (-0.035, -0.021, 0.05), M['steel'], verts=10))
    parts.append(tcyl('fa_btn', 0.0065, 0.006, (-0.052, -0.021, 0.05), M['worn'], verts=10))
    parts.append(box('dustcover', (0.07, 0.003, 0.022), (0.035, -0.0195, 0.04), M['poly'], bevel=0.0006))
    lo = profile_extrude('lower', [(-0.06, -0.012), (0.06, -0.012), (0.06, -0.05), (0.145, -0.05), (0.15, 0.03),
                                   (-0.062, 0.03), (-0.066, 0.01)], 0.032, bevel=0.0022, material=fde)
    apply_all(lo)
    boolean(lo, box('well', (0.074, 0.024, 0.07), (0.103, 0, -0.03), bevel=0))
    parts.append(lo)
    parts.append(box('flare', (0.012, 0.036, 0.008), (0.141, 0, -0.047), fde, bevel=0.002))
    parts.append(box('seam', (0.262, 0.0335, 0.003), (0.042, 0, 0.0305), M['worn'], bevel=0))     # bare steel where upper meets lower
    parts.append(tcyl('magrel', 0.006, 0.01, (0.06, -0.019, 0.0), M['worn'], verts=10, rot=(R90, 0, 0)))
    parts.append(box('boltcatch', (0.018, 0.004, 0.024), (0.05, 0.018, 0.015), M['poly'], bevel=0.001))
    parts.append(tcyl('selector', 0.006, 0.038, (-0.03, 0, 0.012), M['worn'], verts=10, rot=(R90, 0, 0)))
    parts.append(box('sel_lever', (0.018, 0.004, 0.006), (-0.022, -0.02, 0.014), M['worn'], bevel=0.001))
    for x in (0.0, 0.03, 0.115):                                                        # takedown / trigger pins
        parts.append(tcyl('pin', 0.0028, 0.034, (x, 0, 0.0 if x < 0.1 else 0.02), M['worn'], verts=8, rot=(R90, 0, 0)))
    # ---- coyote pistol grip, guard, trigger
    grip = profile_extrude('grip', [(-0.026, 0.002), (0.03, 0.002), (0.012, -0.104), (-0.04, -0.098), (-0.047, -0.062)],
                           0.031, bevel=0.0045, material=fde_d)
    apply_all(grip)
    for i in range(3):
        boolean(grip, tcyl('g', 0.009, 0.05, (0.031 - i * 0.0055, 0, -0.03 - i * 0.026), verts=12, rot=(R90, 0, 0)))
    parts.append(grip)
    parts.append(box('gripcap', (0.05, 0.033, 0.008), (-0.015, 0, -0.1), M['poly'], bevel=0.002))
    for s_ in (-1, 1):
        parts.append(box('texture', (0.034, 0.003, 0.05), (-0.012, s_ * 0.0155, -0.05), M['poly'], bevel=0.0008))
    tg = profile_extrude('tguard', [(0.026, -0.012), (0.08, -0.012), (0.08, -0.05), (0.035, -0.05)], 0.014, bevel=0.0015, material=M['poly'])
    apply_all(tg)
    boolean(tg, box('tgh', (0.044, 0.05, 0.03), (0.055, 0, -0.03), bevel=0))
    parts.append(tg)
    parts.append(profile_extrude('trigger', [(0.043, -0.012), (0.051, -0.012), (0.047, -0.038), (0.04, -0.04)], 0.006, bevel=0.0006, material=M['worn']))
    # ---- coyote handguard (round-ish, M-LOK), barrel, gas block, A2 flash hider
    hg = tcyl('handguard', 0.029, 0.27, (0.34, 0, B - 0.002), fde, verts=8)
    hg.rotation_euler = (math.radians(22.5), R90, 0)
    apply_all(hg)
    for i in range(5):
        for s in (-1, 1):
            boolean(hg, box('mlok', (0.03, 0.02, 0.01), (0.235 + i * 0.05, s * 0.028, B - 0.004), bevel=0))
        boolean(hg, box('mlb', (0.03, 0.012, 0.02), (0.235 + i * 0.05, 0, B - 0.03), bevel=0))
    parts.append(hg)
    parts.append(tcyl('hg_nut', 0.031, 0.012, (0.204, 0, B - 0.002), M['steel'], verts=16))
    parts.append(tcyl('barrel', 0.0085, 0.09, (0.52, 0, B), M['steel'], verts=14))
    parts.append(box('gasblock', (0.018, 0.022, 0.03), (0.488, 0, B + 0.004), M['steel'], bevel=0.002))
    fh = tcyl('hider', 0.0115, 0.055, (0.578, 0, B), M['steel'], verts=16)
    for a in range(3):
        c = box('slot', (0.03, 0.004, 0.03), (0.585, 0, B), bevel=0)
        turn(c, (a * math.pi / 3, 0, 0))
        boolean(fh, c)
    parts.append(fh)
    parts.append(tcyl('hider_lip', 0.0122, 0.006, (0.603, 0, B), M['worn'], verts=16))
    # ---- top rail (receiver + handguard), BUIS, holo sight
    parts.append(box('rail', (0.52, 0.021, 0.007), (0.205, 0, 0.0875), M['steel'], bevel=0.0008))
    for i in range(24):
        parts.append(box('rs', (0.0045, 0.023, 0.0045), (-0.05 + i * 0.0217, 0, 0.0925), M['steel'], bevel=0))
    parts.append(box('front_buis', (0.016, 0.018, 0.012), (0.455, 0, 0.1), M['poly'], bevel=0.002))
    parts.append(box('rear_buis', (0.022, 0.024, 0.014), (-0.045, 0, 0.101), M['poly'], bevel=0.002))
    holo = box('holo', (0.088, 0.04, 0.054), (0.075, 0, 0.122), fde_d, bevel=0.005)
    apply_all(holo)
    boolean(holo, box('window', (0.07, 0.03, 0.032), (0.08, 0, 0.13), bevel=0))
    parts.append(holo)
    parts.append(box('hood', (0.07, 0.044, 0.006), (0.082, 0, 0.152), M['poly'], bevel=0.002))
    parts.append(box('glass', (0.002, 0.03, 0.032), (0.112, 0, 0.13), M['glass'], bevel=0))
    parts.append(box('reticle', (0.0015, 0.004, 0.004), (0.111, 0, 0.13), M['dot'], bevel=0))
    parts.append(box('holo_btn', (0.03, 0.006, 0.01), (0.055, -0.022, 0.108), M['worn'], bevel=0.001))
    parts.append(box('holo_mount', (0.06, 0.03, 0.01), (0.075, 0, 0.096), M['poly'], bevel=0.0015))
    # ---- angled foregrip
    parts.append(profile_extrude('afg', [(0.27, 0.03), (0.35, 0.03), (0.34, 0.013), (0.31, 0.004), (0.27, 0.01)], 0.03,
                                 bevel=0.004, material=fde_d))
    # ---- stock: buffer tube, the coyote collapsible stock
    parts.append(tcyl('tube', 0.0155, 0.17, (-0.15, 0, B - 0.004), M['steel'], verts=16))
    parts.append(tcyl('castle', 0.019, 0.012, (-0.07, 0, B - 0.004), M['worn'], verts=12))
    stk = profile_extrude('stock', [(-0.165, 0.08), (-0.282, 0.084), (-0.292, 0.076), (-0.292, -0.052), (-0.27, -0.056),
                                    (-0.215, 0.012), (-0.165, 0.03)], 0.042, bevel=0.006, material=fde)
    apply_all(stk)
    for s_ in (-1, 1):
        boolean(stk, box('pocket', (0.045, 0.01, 0.03), (-0.25, s_ * 0.022, 0.0), bevel=0))
    parts.append(stk)
    parts.append(box('cheek', (0.1, 0.046, 0.014), (-0.228, 0, 0.083), fde_d, bevel=0.004))
    parts.append(box('buttpad', (0.012, 0.046, 0.142), (-0.295, 0, 0.013), M['poly'], bevel=0.004))
    parts.append(box('adjust', (0.03, 0.014, 0.01), (-0.2, 0, 0.032), fde_d, bevel=0.002))
    parts.append(box('qd', (0.014, 0.008, 0.014), (-0.185, 0.023, 0.055), M['worn'], bevel=0.002))
    frame = join(parts, 'gun_frame')

    # ---- gun_slide: charging handle (T on the top rear) and the bolt carrier seen in the port
    sl = [box('ch', (0.06, 0.012, 0.008), (-0.045, 0, 0.081), M['steel'], bevel=0.001),
          box('ch_t', (0.012, 0.05, 0.01), (-0.073, 0, 0.081), M['worn'], bevel=0.002),
          box('carrier', (0.075, 0.008, 0.022), (0.03, -0.012, 0.052), M['worn'], bevel=0.001),
          box('lug', (0.012, 0.005, 0.01), (0.012, -0.0165, 0.06), M['steel'], bevel=0.0005)]
    slide = join(sl, 'gun_slide')

    # ---- gun_mag: a 30-round steel mag, curved forward, coyote base plate
    mp = profile_extrude('mag', [(0.07, 0.02), (0.136, 0.02), (0.137, -0.05), (0.146, -0.11), (0.162, -0.17), (0.178, -0.2),
                                 (0.124, -0.216), (0.11, -0.18), (0.095, -0.12), (0.086, -0.06)], 0.022, bevel=0.0018, material=magm)
    ribs = []
    for i, (x0, z0) in enumerate(((0.105, -0.07), (0.112, -0.11), (0.122, -0.15))):
        r_ = box('rib', (0.032, 0.0236, 0.004), (x0 + 0.006, 0, z0), M['worn'], bevel=0.0006)
        turn(r_, (0, math.radians(-12 - i * 5), 0))
        ribs.append(r_)
    plate = profile_extrude('plate', [(0.12, -0.212), (0.18, -0.195), (0.186, -0.204), (0.124, -0.224), (0.116, -0.218)],
                            0.027, bevel=0.002, material=fde_d)
    mag = join([mp, plate, *ribs, box('round', (0.03, 0.009, 0.006), (0.1, 0, 0.024), mat('brass', (0.78, 0.52, 0.2), metal=1.0, rough=0.28), bevel=0.001)], 'gun_mag')
    finish('rifle', frame, slide, mag, side=-1, extra={
        'bore z': B, 'grip centre': (-0.01, -0.05), 'handguard palm x': 0.31, 'left wrist': (0.25, -0.01),
        'charging handle grabbed x': -0.073, 'magwell centre x': 0.103})


# --------------------------------------------------------------------------- LMG
def lmg():
    """M-60 Hailstorm: a 7.62 belt-fed GPMG, ~1.06 m. Olive furniture, heavy barrel with a carry handle,
    folded bipod, a 100-round box with a short belt climbing into the feed tray on the LEFT. Bore z 0.05."""
    reset()
    M = mats()
    od = mat('olive', (0.16, 0.175, 0.075), rough=0.6)
    od_d = mat('olive_dark', (0.085, 0.095, 0.04), rough=0.65)
    brass = mat('brass', (0.8, 0.53, 0.2), metal=1.0, rough=0.26)
    copper = mat('copper', (0.62, 0.26, 0.12), metal=1.0, rough=0.3)
    B = 0.05
    parts = []

    # ---- the receiver: a long box; the feed cover on top, hinged at the front
    rc = profile_extrude('receiver', [(-0.045, -0.012), (0.29, -0.012), (0.29, 0.07), (-0.04, 0.07), (-0.048, 0.06)],
                         0.05, bevel=0.003, material=M['steel'])
    apply_all(rc)
    boolean(rc, box('chslot', (0.15, 0.01, 0.008), (0.17, -0.026, 0.028), bevel=0))         # charging-handle track, right
    boolean(rc, box('eject', (0.05, 0.03, 0.02), (0.13, 0, -0.012), bevel=0))               # ejection chute underneath
    for i in range(6):
        boolean(rc, box('vent', (0.01, 0.01, 0.024), (0.0 + i * 0.022, -0.026, 0.035), bevel=0))
    parts.append(rc)
    fc = profile_extrude('feedcover', [(0.0, 0.068), (0.225, 0.068), (0.232, 0.08), (0.215, 0.096), (0.02, 0.096), (0.005, 0.088)],
                         0.054, bevel=0.003, material=M['steel'])
    apply_all(fc)
    for i in range(5):
        boolean(fc, box('fcr', (0.008, 0.07, 0.006), (0.05 + i * 0.03, 0, 0.098), bevel=0))
    parts.append(fc)
    parts.append(tcyl('hinge', 0.008, 0.06, (0.226, 0, 0.074), M['worn'], verts=12, rot=(R90, 0, 0)))
    parts.append(box('latch', (0.022, 0.03, 0.012), (0.005, 0, 0.098), M['worn'], bevel=0.002))
    parts.append(box('rsight', (0.016, 0.03, 0.03), (-0.025, 0, 0.088), M['steel'], bevel=0.002))
    parts.append(box('rs_leaf', (0.006, 0.02, 0.028), (-0.022, 0, 0.112), M['steel'], bevel=0.001))
    parts.append(box('feedtray', (0.06, 0.02, 0.02), (0.13, 0.034, 0.052), M['worn'], bevel=0.002))  # the belt goes in here
    parts.append(box('tray_guide', (0.07, 0.006, 0.03), (0.13, 0.045, 0.046), M['steel'], bevel=0.001))
    # ---- grip, trigger guard, trigger
    grip = profile_extrude('grip', [(-0.024, -0.008), (0.036, -0.008), (0.018, -0.112), (-0.036, -0.106), (-0.044, -0.07)],
                           0.035, bevel=0.005, material=od)
    apply_all(grip)
    for i in range(3):
        boolean(grip, tcyl('g', 0.0095, 0.05, (0.037 - i * 0.006, 0, -0.032 - i * 0.026), verts=12, rot=(R90, 0, 0)))
    parts.append(grip)
    tg = profile_extrude('tguard', [(0.034, -0.012), (0.1, -0.012), (0.095, -0.058), (0.042, -0.058)], 0.018, bevel=0.002, material=M['steel'])
    apply_all(tg)
    boolean(tg, box('tgh', (0.048, 0.05, 0.036), (0.068, 0, -0.034), bevel=0))
    parts.append(tg)
    parts.append(profile_extrude('trigger', [(0.054, -0.012), (0.064, -0.012), (0.06, -0.042), (0.052, -0.044)], 0.008, bevel=0.0008, material=M['worn']))
    parts.append(tcyl('safety', 0.005, 0.044, (0.03, 0, -0.022), M['worn'], verts=8, rot=(R90, 0, 0)))
    # ---- olive forend around the barrel and gas tube, ribbed
    fe = profile_extrude('forend', [(0.288, -0.006), (0.47, 0.004), (0.478, 0.016), (0.478, 0.064), (0.288, 0.07)],
                         0.06, bevel=0.007, segs=3, material=od)
    apply_all(fe)
    for i in range(7):
        x = 0.31 + i * 0.022
        for s in (-1, 1):
            boolean(fe, box('rib', (0.007, 0.012, 0.05), (x, s * 0.031, 0.03), bevel=0))
    parts.append(fe)
    parts.append(box('fe_band', (0.012, 0.062, 0.074), (0.29, 0, 0.032), od_d, bevel=0.003))
    # ---- heavy barrel, gas cylinder, front sight, flash hider
    parts.append(tcyl('barrel', 0.0135, 0.42, (0.48, 0, B), M['blued'], verts=18))
    parts.append(tcyl('gas', 0.009, 0.1, (0.525, 0, B - 0.028), M['steel'], verts=12))
    parts.append(box('gasblock', (0.024, 0.024, 0.044), (0.57, 0, B - 0.014), M['steel'], bevel=0.003))
    parts.append(box('fsight_base', (0.03, 0.02, 0.012), (0.66, 0, B + 0.018), M['steel'], bevel=0.002))
    parts.append(box('fsight', (0.008, 0.006, 0.03), (0.665, 0, B + 0.035), M['steel'], bevel=0.001))
    fh = tcyl('hider', 0.0165, 0.055, (0.715, 0, B), M['steel'], verts=16)
    for a in range(4):
        c = box('slot', (0.036, 0.0045, 0.04), (0.723, 0, B), bevel=0)
        turn(c, (a * math.pi / 4, 0, 0))
        boolean(fh, c)
    parts.append(fh)
    parts.append(tcyl('hider_ring', 0.017, 0.008, (0.69, 0, B), M['worn'], verts=16))
    # ---- carry handle on the barrel: two posts and a grip bar
    for x in (0.5, 0.585):
        parts.append(box('post', (0.014, 0.012, 0.05), (x, 0.0, B + 0.035), M['steel'], bevel=0.002))
        parts.append(tcyl('collar', 0.0165, 0.016, (x, 0, B), M['steel'], verts=16))
    parts.append(tcyl('handle', 0.0095, 0.115, (0.5425, 0, B + 0.062), od_d, verts=12))
    # ---- folded bipod: a yoke on the gas cylinder, two legs swept back under the forend
    parts.append(box('yoke', (0.026, 0.04, 0.018), (0.6, 0, B - 0.038), M['steel'], bevel=0.003))
    for s in (-1, 1):
        lg = tcyl('leg', 0.0065, 0.2, (0.5, s * 0.02, B - 0.05), M['steel'], verts=8)
        lg.rotation_euler = (0, R90 + math.radians(-3), math.radians(s * 2.5))
        parts.append(lg)
        parts.append(box('foot', (0.024, 0.01, 0.01), (0.4, s * 0.024, B - 0.056), M['worn'], bevel=0.002))
    parts.append(tcyl('bp_pivot', 0.006, 0.05, (0.6, 0, B - 0.045), M['worn'], verts=8, rot=(R90, 0, 0)))
    # ---- the stock: big olive butt in line with the bore, a steel butt plate and a shoulder rest
    st = profile_extrude('stock', [(-0.045, 0.062), (-0.33, 0.06), (-0.335, 0.05), (-0.335, -0.098), (-0.32, -0.1),
                                   (-0.13, -0.034), (-0.045, -0.012)], 0.05, bevel=0.008, segs=3, material=od)
    apply_all(st)
    for s_ in (-1, 1):                                                  # a shallow panel on each flank
        boolean(st, box('panel', (0.13, 0.012, 0.04), (-0.2, s_ * 0.029, 0.0), bevel=0))
    parts.append(st)
    for x in (0.0, 0.07, 0.19, 0.26):                                   # receiver rivets, both sides
        parts.append(tcyl('rivet', 0.0035, 0.054, (x, 0, 0.008), M['worn'], verts=8, rot=(R90, 0, 0)))
    parts.append(box('buttplate', (0.012, 0.054, 0.162), (-0.341, 0, -0.019), M['steel'], bevel=0.003))
    parts.append(box('swivel', (0.012, 0.006, 0.02), (-0.27, 0, -0.088), M['worn'], bevel=0.001))
    frame = join(parts, 'gun_frame')

    # ---- gun_slide: the charging handle on the right
    sl = [box('ch_rod', (0.03, 0.012, 0.008), (0.215, -0.026, 0.028), M['steel'], bevel=0.001),
          box('ch_knob', (0.02, 0.028, 0.016), (0.218, -0.04, 0.028), M['worn'], bevel=0.003)]
    slide = join(sl, 'gun_slide')

    # ---- gun_mag: the ammo box and a short belt rising up the left side into the tray
    bx = box('ammobox', (0.13, 0.075, 0.12), (0.145, 0.014, -0.08), od, bevel=0.004)
    apply_all(bx)
    for i in range(3):
        for s_ in (-1, 1):                                              # pressed ribs on both faces
            boolean(bx, box('emboss', (0.11, 0.006, 0.005), (0.145, 0.014 + s_ * 0.0375, -0.045 - i * 0.03), bevel=0))
    ms = [bx,
          box('lid', (0.136, 0.08, 0.014), (0.145, 0.014, -0.016), od_d, bevel=0.003),
          box('box_latch', (0.016, 0.006, 0.03), (0.21, -0.025, -0.04), M['worn'], bevel=0.001),
          box('box_handle', (0.06, 0.006, 0.008), (0.145, -0.026, -0.1), M['worn'], bevel=0.001),
          box('stencil', (0.06, 0.002, 0.022), (0.12, -0.0245, -0.075), mat('stencil', (0.75, 0.68, 0.45), rough=0.7), bevel=0)]
    # the belt: from the box's left-top lip, bulging out, up into the feed tray
    pts = [(0.044, -0.004), (0.052, 0.008), (0.056, 0.021), (0.054, 0.034), (0.046, 0.046)]
    for i, (y, z) in enumerate(pts):
        ms.append(tcyl('case', 0.0062, 0.05, (0.125, y, z), brass, verts=10))
        ms.append(cone('bullet', 0.0055, 0.0012, 0.022, (0.161, y, z), copper, verts=10))
        ms.append(box('link', (0.016, 0.014, 0.004), (0.115, y + 0.003, z - 0.006), M['steel'], bevel=0))
    mag = join(ms, 'gun_mag')
    finish('lmg', frame, slide, mag, side=+1, extra={
        'bore z': B, 'grip centre': (-0.004, -0.055), 'forend palm x': 0.40, 'left wrist': (0.34, -0.03),
        'charging handle grabbed x': 0.218, 'ammo box centre x': 0.145})


if __name__ == '__main__':
    want = sys.argv[1:] or ['shotgun', 'rifle', 'lmg']
    for n in want:
        {'shotgun': shotgun, 'rifle': rifle, 'lmg': lmg}[n]()
