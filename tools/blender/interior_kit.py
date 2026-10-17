"""The furniture of the new level layouts (2026-10-17): the hospital's wards (level 2), the warehouse (level 4) and the
canal district (level 3).

    python interior_kit.py        (bpy venv)   -> public/assets/props/interior.glb + qa/interior_kit.png

One object per item, named as dress/interior.js asks for it. Every origin is on the FLOOR at the item's centre; the
front (the side you walk up to) faces Blender -Y, which the glTF export turns into the game's +Z. Material names that
assets.js upgrade() knows (steel, wood, metal, glass, paint_white, cardboard) get the game's own shaders; the int_* ones
keep the colours given here.
"""
import math
import os
import sys
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from weapons import reset, mat, cyl, apply_all  # noqa: E402
from guns import box, sphere, join, smooth, tcyl  # noqa: E402

OUT = os.path.join(HERE, '..', '..', 'public', 'assets', 'props')
QA = os.path.join(HERE, '..', '..', 'qa')
R90 = math.radians(90)


def torus(name, R, r, loc, rot=(0, 0, 0), material=None, maj=20, mnr=8):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc, rotation=rot, major_segments=maj, minor_segments=mnr)
    ob = bpy.context.active_object
    ob.name = name
    if material:
        ob.data.materials.append(material)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def rod(name, a, b, r, material, verts=10):
    """a cylinder from point a to point b"""
    ax, ay, az = a
    bx, by, bz = b
    dx, dy, dz = bx - ax, by - ay, bz - az
    L = math.sqrt(dx * dx + dy * dy + dz * dz)
    ob = cyl(name, r, L, ((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), rot=(0, 0, 0), verts=verts, material=material)
    # point the cylinder's +Z along (dx, dy, dz)
    from mathutils import Vector
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector((dx, dy, dz)).normalized())
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def caster(name, x, y, M, r=0.05):
    return [rod(name + '_stem', (x, y, r * 2 + 0.06), (x, y, r * 2), 0.012, M['steel'], 6),
            tcyl(name + '_w', r, 0.03, (x, y, r), M['rubber'], verts=12, rot=(R90, 0, 0))]


def build():
    reset()
    M = dict(
        steel=mat('steel', (0.55, 0.56, 0.58), metal=1.0, rough=0.35),
        white=mat('int_white', (0.78, 0.8, 0.8), rough=0.45),
        cream=mat('int_cream', (0.75, 0.7, 0.58), rough=0.6),
        mattress=mat('int_mattress', (0.33, 0.55, 0.62), rough=0.7),
        sheet=mat('int_sheet', (0.82, 0.84, 0.86), rough=0.8),
        blood=mat('int_blood', (0.22, 0.02, 0.015), rough=0.3),
        rubber=mat('int_rubber', (0.03, 0.03, 0.03), rough=0.8),
        curtain=mat('int_curtain', (0.22, 0.48, 0.48), rough=0.85),
        wood=mat('wood', (0.4, 0.25, 0.14), rough=0.6),
        desk=mat('int_laminate', (0.42, 0.33, 0.24), rough=0.5),
        black=mat('int_black', (0.025, 0.025, 0.03), rough=0.5),
        screen=mat('int_screen', (0.02, 0.05, 0.06), rough=0.2, emit=(0.15, 0.45, 0.5)),
        grey=mat('int_grey', (0.3, 0.32, 0.34), metal=0.5, rough=0.45),
        glass=mat('glass', (0.02, 0.05, 0.06), metal=0.2, rough=0.12),
        teal=mat('int_teal', (0.08, 0.42, 0.42), rough=0.45),
        red=mat('int_red', (0.6, 0.06, 0.04), rough=0.45),
        orange=mat('int_orange', (0.85, 0.32, 0.03), metal=0.3, rough=0.45),
        blue=mat('int_blue', (0.05, 0.16, 0.55), metal=0.4, rough=0.45),
        yellow=mat('int_yellow', (0.95, 0.66, 0.02), metal=0.2, rough=0.45),
        card=mat('cardboard', (0.45, 0.32, 0.18), rough=0.95),
        plastic=mat('int_plastic', (0.05, 0.28, 0.5), rough=0.45),
        vend=mat('int_vend', (0.6, 0.04, 0.05), metal=0.3, rough=0.4),
        vendlit=mat('int_vendlit', (0.3, 0.3, 0.25), rough=0.3, emit=(0.9, 0.85, 0.7)),
        lamp=mat('int_lamp', (0.4, 0.4, 0.35), rough=0.3, emit=(1.0, 0.95, 0.8)),
        plank=mat('int_plank', (0.36, 0.24, 0.14), rough=0.8),
        hull=mat('int_hull', (0.2, 0.32, 0.36), rough=0.6),
        rope=mat('int_rope', (0.5, 0.42, 0.28), rough=0.95),
    )
    items = []
    bv = 0.006

    # ---------------------------------------------------------------- the hospital --
    # a hospital bed: steel frame on casters, blue mattress, a crumpled sheet with a stain, head and foot boards, rails
    p = []
    p.append(box('b_frame', (2.0, 0.92, 0.08), (0, 0, 0.42), M['steel'], bevel=bv))
    p.append(box('b_matt', (1.94, 0.86, 0.16), (0, 0, 0.54), M['mattress'], bevel=0.03))
    p.append(box('b_sheet', (1.3, 0.9, 0.06), (0.25, 0, 0.62), M['sheet'], bevel=0.025))
    p.append(box('b_stain', (0.4, 0.5, 0.012), (0.1, 0.05, 0.655), M['blood'], bevel=0.004))
    p.append(box('b_pillow', (0.36, 0.62, 0.12), (-0.74, 0, 0.66), M['sheet'], bevel=0.04))
    p.append(box('b_head', (0.06, 0.94, 0.62), (-1.0, 0, 0.72), M['white'], bevel=0.02))
    p.append(box('b_foot', (0.06, 0.94, 0.42), (1.0, 0, 0.62), M['white'], bevel=0.02))
    for s in (-1, 1):
        p.append(box(f'b_rail{s}', (0.9, 0.03, 0.04), (-0.3, s * 0.47, 0.78), M['steel'], bevel=0.008))
        for x in (-0.7, 0.1):
            p.append(rod(f'b_rp{s}{x}', (x, s * 0.47, 0.46), (x, s * 0.47, 0.78), 0.012, M['steel'], 6))
    for x in (-0.9, 0.9):
        for y in (-0.38, 0.38):
            p += caster(f'b_c{x}{y}', x, y, M)
            p.append(rod(f'b_leg{x}{y}', (x, y, 0.16), (x, y, 0.42), 0.022, M['steel'], 8))
    items.append(join(p, 'hosp_bed'))

    # a gurney: thinner, a pad, push handles
    p = [box('g_frame', (1.9, 0.6, 0.05), (0, 0, 0.78), M['steel'], bevel=bv), box('g_pad', (1.86, 0.56, 0.08), (0, 0, 0.84), M['white'], bevel=0.025),
         box('g_sheet', (1.0, 0.58, 0.03), (0.35, 0, 0.895), M['sheet'], bevel=0.012), box('g_shelf', (1.7, 0.5, 0.03), (0, 0, 0.32), M['steel'], bevel=bv)]
    for x in (-0.82, 0.82):
        for y in (-0.24, 0.24):
            p += caster(f'g_c{x}{y}', x, y, M, 0.045)
            p.append(rod(f'g_leg{x}{y}', (x, y, 0.15), (x, y, 0.78), 0.016, M['steel'], 8))
    for y in (-0.26, 0.26):
        p.append(rod(f'g_h{y}', (-0.95, y, 0.8), (-1.15, y, 1.0), 0.014, M['steel'], 6))
    p.append(rod('g_hb', (-1.15, -0.26, 1.0), (-1.15, 0.26, 1.0), 0.016, M['rubber'], 8))
    items.append(join(p, 'gurney'))

    # a wheelchair
    p = [box('w_seat', (0.46, 0.44, 0.04), (0, 0, 0.48), M['black'], bevel=0.01), box('w_back', (0.04, 0.44, 0.42), (-0.24, 0, 0.74), M['black'], bevel=0.01)]
    for s in (-1, 1):
        p.append(torus(f'w_wh{s}', 0.3, 0.018, (-0.05, s * 0.27, 0.31), (R90, 0, 0), M['rubber'], 24, 6))
        p.append(torus(f'w_hr{s}', 0.26, 0.008, (-0.05, s * 0.3, 0.31), (R90, 0, 0), M['steel'], 24, 5))
        p.append(rod(f'w_fr{s}', (-0.24, s * 0.23, 0.95), (-0.24, s * 0.23, 0.3), 0.012, M['steel'], 6))
        p.append(rod(f'w_fr2{s}', (-0.24, s * 0.23, 0.48), (0.24, s * 0.23, 0.48), 0.012, M['steel'], 6))
        p.append(rod(f'w_fr3{s}', (0.22, s * 0.23, 0.48), (0.3, s * 0.2, 0.1), 0.012, M['steel'], 6))
        p.append(rod(f'w_h{s}', (-0.24, s * 0.23, 0.95), (-0.36, s * 0.23, 0.97), 0.015, M['rubber'], 6))
        p.append(box(f'w_foot{s}', (0.12, 0.14, 0.02), (0.34, s * 0.12, 0.09), M['steel'], bevel=0.004))
        p.append(tcyl(f'w_cast{s}', 0.05, 0.03, (0.3, s * 0.2, 0.05), M['rubber'], verts=10, rot=(R90, 0, 0)))
    items.append(join(p, 'wheelchair'))

    # a privacy curtain on its stand: a pleated sheet (a sine fold) between two poles
    p = []
    for x in (-1.1, 1.1):
        p.append(rod(f'c_pole{x}', (x, 0, 0.04), (x, 0, 2.0), 0.018, M['steel'], 8))
        p.append(box(f'c_foot{x}', (0.08, 0.5, 0.03), (x, 0, 0.015), M['steel'], bevel=0.005))
    p.append(rod('c_rail', (-1.1, 0, 1.98), (1.1, 0, 1.98), 0.014, M['steel'], 8))
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=48, y_subdivisions=2, size=1, location=(0, 0, 1.12))
    cur = bpy.context.active_object
    cur.name = 'c_cloth'
    cur.scale = (2.1, 1.62, 1)
    cur.rotation_euler = (R90, 0, 0)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    for v in cur.data.vertices:
        v.co.y += math.sin(v.co.x * 22) * 0.045 + math.sin(v.co.x * 5.3) * 0.03
    sol = cur.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.012
    cur.data.materials.append(M['curtain'])
    for poly in cur.data.polygons:
        poly.use_smooth = True
    p.append(cur)
    items.append(join(p, 'curtain_screen'))

    # a desk with a CRT-era monitor, a keyboard and a mess of paper
    p = [box('d_top', (1.6, 0.75, 0.04), (0, 0, 0.75), M['desk'], bevel=0.008), box('d_ped', (0.42, 0.7, 0.72), (0.56, 0, 0.37), M['grey'], bevel=0.008),
         box('d_leg', (0.04, 0.7, 0.72), (-0.76, 0, 0.37), M['grey'], bevel=0.006), box('d_mon', (0.42, 0.1, 0.34), (-0.15, 0.18, 1.0), M['black'], bevel=0.012),
         box('d_scr', (0.38, 0.012, 0.28), (-0.15, 0.125, 1.0), M['screen'], bevel=0.003), box('d_kb', (0.44, 0.15, 0.02), (-0.12, -0.12, 0.78), M['black'], bevel=0.004),
         box('d_paper', (0.3, 0.22, 0.01), (0.35, -0.12, 0.775), M['sheet'], bevel=0.002), box('d_paper2', (0.28, 0.2, 0.01), (0.42, 0.06, 0.785), M['sheet'], bevel=0.002)]
    for k in range(3):
        p.append(box(f'd_dr{k}', (0.36, 0.01, 0.2), (0.56, -0.355, 0.62 - k * 0.23), M['steel'], bevel=0.003))
    p.append(rod('d_stand', (-0.15, 0.2, 0.77), (-0.15, 0.2, 0.84), 0.03, M['black'], 8))
    items.append(join(p, 'desk'))

    # an office chair
    p = [box('o_seat', (0.46, 0.46, 0.07), (0, 0, 0.48), M['black'], bevel=0.02), box('o_back', (0.06, 0.44, 0.5), (-0.22, 0, 0.8), M['black'], bevel=0.02),
         rod('o_post', (0, 0, 0.1), (0, 0, 0.46), 0.025, M['steel'], 8)]
    for k in range(5):
        a = k * 2 * math.pi / 5
        p.append(rod(f'o_leg{k}', (0, 0, 0.1), (math.cos(a) * 0.3, math.sin(a) * 0.3, 0.06), 0.018, M['black'], 6))
        p.append(sphere(f'o_w{k}', 0.035, (math.cos(a) * 0.3, math.sin(a) * 0.3, 0.035), M['rubber'], 8, 5))
    items.append(join(p, 'office_chair'))

    # a tall medicine cabinet: steel body, glass doors, shelves of bottles
    p = [box('m_body', (0.9, 0.42, 1.9), (0, 0, 0.95), M['white'], bevel=0.01), box('m_glass', (0.84, 0.01, 1.2), (0, -0.212, 1.25), M['glass'], bevel=0.002)]
    for k in range(3):
        z = 0.75 + k * 0.4
        p.append(box(f'm_shelf{k}', (0.82, 0.36, 0.015), (0, 0, z), M['steel'], bevel=0.002))
        for j in range(5):
            col = [M['teal'], M['white'], M['red'], M['plastic'], M['cream']][(j + k) % 5]
            p.append(tcyl(f'm_bt{k}{j}', 0.035, 0.14 + (j % 2) * 0.05, (-0.32 + j * 0.15, 0.02, z + 0.09 + (j % 2) * 0.025), col, verts=10, rot=(0, 0, 0)))
    p.append(box('m_low', (0.84, 0.01, 0.5), (0, -0.212, 0.32), M['steel'], bevel=0.003))
    p.append(box('m_cross', (0.2, 0.012, 0.06), (0, -0.22, 1.72), M['red'], bevel=0.002))
    p.append(box('m_cross2', (0.06, 0.012, 0.2), (0, -0.22, 1.72), M['red'], bevel=0.002))
    items.append(join(p, 'med_cabinet'))

    # a med cart: drawers in five colours, a sharps bin on top
    p = [box('k_body', (0.6, 0.5, 0.9), (0, 0, 0.55), M['white'], bevel=0.015)]
    cols = [M['red'], M['yellow'], M['teal'], M['plastic'], M['white']]
    for k in range(5):
        p.append(box(f'k_dr{k}', (0.54, 0.012, 0.14), (0, -0.255, 0.92 - k * 0.165), cols[k], bevel=0.004))
    p.append(box('k_bin', (0.2, 0.18, 0.22), (0.15, 0.08, 1.11), M['red'], bevel=0.01))
    for x in (-0.24, 0.24):
        for y in (-0.19, 0.19):
            p += caster(f'k_c{x}{y}', x, y, M, 0.04)
    items.append(join(p, 'med_cart'))

    # a row of four waiting-room chairs on a beam
    p = [box('wr_beam', (2.3, 0.08, 0.06), (0, 0.05, 0.36), M['steel'], bevel=0.008)]
    for k in range(4):
        x = -0.87 + k * 0.58
        p.append(box(f'wr_s{k}', (0.5, 0.48, 0.05), (x, 0, 0.45), M['plastic'], bevel=0.02))
        p.append(box(f'wr_b{k}', (0.5, 0.05, 0.42), (x, 0.24, 0.72), M['plastic'], bevel=0.02))
    for x in (-1.0, 1.0):
        p.append(rod(f'wr_l{x}', (x, 0.05, 0.0), (x, 0.05, 0.36), 0.02, M['steel'], 8))
        p.append(box(f'wr_f{x}', (0.06, 0.5, 0.03), (x, 0.05, 0.015), M['steel'], bevel=0.005))
    items.append(join(p, 'waiting_chairs'))

    # a vending machine: a lit front, rows of cans
    p = [box('v_body', (0.95, 0.8, 1.85), (0, 0, 0.925), M['vend'], bevel=0.015), box('v_win', (0.62, 0.01, 1.2), (-0.1, -0.405, 1.12), M['vendlit'], bevel=0.003),
         box('v_pad', (0.18, 0.012, 0.42), (0.34, -0.405, 1.2), M['black'], bevel=0.004), box('v_slot', (0.5, 0.02, 0.14), (-0.08, -0.41, 0.3), M['black'], bevel=0.004)]
    for r in range(5):
        for c in range(5):
            p.append(tcyl(f'v_can{r}{c}', 0.04, 0.12, (-0.34 + c * 0.12, -0.36, 0.62 + r * 0.24), [M['red'], M['teal'], M['yellow'], M['plastic'], M['white']][(r + c) % 5], verts=8, rot=(0, 0, 0)))
    items.append(join(p, 'vending'))

    # an operating table and its big round lamp on an arm
    p = [box('op_top', (2.0, 0.55, 0.08), (0, 0, 0.95), M['black'], bevel=0.02), box('op_base', (0.5, 0.4, 0.08), (0, 0, 0.04), M['steel'], bevel=0.01),
         rod('op_col', (0, 0, 0.08), (0, 0, 0.92), 0.08, M['steel'], 12), box('op_sheet', (1.2, 0.6, 0.03), (0.25, 0, 1.005), M['teal'], bevel=0.01),
         box('op_stain', (0.5, 0.35, 0.008), (0.1, 0.05, 1.022), M['blood'], bevel=0.003),
         rod('op_arm', (1.4, 0.7, 0.0), (1.4, 0.7, 2.3), 0.04, M['steel'], 10), rod('op_arm2', (1.4, 0.7, 2.3), (0.3, 0.1, 2.0), 0.03, M['steel'], 8)]
    lamp = tcyl('op_lamp', 0.38, 0.12, (0.3, 0.1, 1.94), M['white'], verts=24, rot=(0, 0, 0))
    p.append(lamp)
    p.append(tcyl('op_lit', 0.32, 0.01, (0.3, 0.1, 1.875), M['lamp'], verts=24, rot=(0, 0, 0)))
    p.append(box('op_ft', (0.5, 0.5, 0.04), (1.4, 0.7, 0.02), M['steel'], bevel=0.01))
    items.append(join(p, 'op_table'))

    # an IV stand
    p = [rod('iv_p', (0, 0, 0.06), (0, 0, 1.9), 0.012, M['steel'], 8), box('iv_bag', (0.12, 0.04, 0.2), (0.07, 0, 1.75), M['sheet'], bevel=0.015)]
    for k in range(5):
        a = k * 2 * math.pi / 5
        p.append(rod(f'iv_l{k}', (0, 0, 0.07), (math.cos(a) * 0.28, math.sin(a) * 0.28, 0.04), 0.01, M['steel'], 6))
        p.append(sphere(f'iv_w{k}', 0.025, (math.cos(a) * 0.28, math.sin(a) * 0.28, 0.025), M['rubber'], 8, 5))
    p.append(rod('iv_line', (0.07, 0, 1.65), (0.1, 0.05, 0.9), 0.003, M['sheet'], 4))
    items.append(join(p, 'iv_stand'))

    # a ceiling light fixture (hung in the rooms; the game hangs it at 2.6 m): a fluorescent troffer
    p = [box('l_body', (1.2, 0.3, 0.06), (0, 0, 0.0), M['white'], bevel=0.008), box('l_tube', (1.1, 0.22, 0.012), (0, 0, -0.033), M['lamp'], bevel=0.003)]
    items.append(join(p, 'ceiling_light'))

    # ---------------------------------------------------------------- the warehouse --
    # pallet racking: blue uprights, orange beams, two levels of boxes and a wrapped pallet
    p = []
    for x in (-1.35, 1.35):
        for y in (-0.5, 0.5):
            p.append(box(f'r_up{x}{y}', (0.08, 0.08, 3.0), (x, y, 1.5), M['blue'], bevel=0.006))
        for z in (0.5, 1.4, 2.3):
            p.append(rod(f'r_br{x}{z}', (x, -0.5, z - 0.3), (x, 0.5, z + 0.3), 0.012, M['blue'], 5))
    for z in (0.1, 1.5, 2.85):
        for y in (-0.5, 0.5):
            p.append(box(f'r_beam{z}{y}', (2.7, 0.06, 0.12), (0, y, z), M['orange'], bevel=0.008))
        p.append(box(f'r_deck{z}', (2.66, 1.0, 0.02), (0, 0, z + 0.06), M['steel'], bevel=0.003))
    for lv, z0 in ((0, 0.18), (1, 1.58)):
        for k in range(3):
            x = -0.9 + k * 0.9
            h = 0.4 + ((k + lv) % 3) * 0.18
            p.append(box(f'r_box{lv}{k}', (0.78, 0.82, h), (x, 0, z0 + h / 2), M['card'], bevel=0.01))
            p.append(box(f'r_tape{lv}{k}', (0.79, 0.12, 0.012), (x, 0, z0 + h + 0.003), M['cream'], bevel=0.002))
    items.append(join(p, 'rack'))

    # a forklift: yellow body, counterweight, overhead guard, mast and forks, black tyres
    p = [box('f_body', (1.6, 1.05, 0.7), (0.1, 0, 0.6), M['yellow'], bevel=0.04), box('f_cw', (0.45, 1.05, 0.75), (-0.65, 0, 0.65), M['black'], bevel=0.05),
         box('f_seat', (0.4, 0.45, 0.12), (-0.15, 0, 1.02), M['black'], bevel=0.03), box('f_sback', (0.08, 0.45, 0.4), (-0.36, 0, 1.25), M['black'], bevel=0.02),
         box('f_mast', (0.1, 0.9, 2.4), (0.98, 0, 1.3), M['grey'], bevel=0.01), box('f_carr', (0.08, 0.95, 0.5), (1.05, 0, 0.45), M['grey'], bevel=0.01),
         box('f_roof', (1.0, 1.0, 0.06), (0.05, 0, 2.15), M['black'], bevel=0.01), rod('f_wheel', (0.55, -0.2, 1.05), (0.4, 0, 1.25), 0.02, M['black'], 6)]
    for y in (-0.3, 0.3):
        p.append(box(f'f_fork{y}', (1.1, 0.1, 0.05), (1.6, y, 0.12), M['grey'], bevel=0.008))
    for x in (-0.45, 0.55):
        for y in (-0.42, 0.42):
            p.append(rod(f'f_post{x}{y}', (x, y, 0.95), (x, y, 2.15), 0.03, M['black'], 8))
            p.append(tcyl(f'f_tyre{x}{y}', 0.27 if x > 0 else 0.22, 0.24, (x + 0.05, y * 1.25, 0.27 if x > 0 else 0.22), M['rubber'], verts=18, rot=(R90, 0, 0)))
    p.append(box('f_light', (0.08, 0.16, 0.08), (0.6, 0, 2.24), M['orange'], bevel=0.01))
    items.append(join(p, 'forklift'))

    # ---------------------------------------------------------------- the canals --
    # a wooden footbridge: plank deck along y (the crossing), a shallow arch, railings
    p = []
    span, width = 5.6, 3.0
    n = 20
    for k in range(n):
        y = -span / 2 + (k + 0.5) * span / n
        z = 0.14 + 0.32 * math.cos(y / span * math.pi)
        pl = box(f'br_p{k}', (width, span / n * 0.92, 0.07), (0, y, z), M['plank'], bevel=0.008)
        pl.rotation_euler = (math.atan(-0.32 * math.pi / span * math.sin(y / span * math.pi)), 0, (k % 3 - 1) * 0.004)
        p.append(pl)
    for s in (-1, 1):
        x = s * (width / 2 - 0.08)
        pts = []
        for k in range(9):
            y = -span / 2 + k * span / 8
            z = 0.14 + 0.32 * math.cos(y / span * math.pi)
            pts.append((y, z))
            p.append(rod(f'br_post{s}{k}', (x, y, z), (x, y, z + 0.95), 0.045, M['plank'], 6))
        for (ya, za), (yb, zb) in zip(pts, pts[1:]):
            p.append(rod(f'br_rail{s}{ya:.1f}', (x, ya, za + 0.95), (x, yb, zb + 0.95), 0.04, M['plank'], 6))
            p.append(rod(f'br_mid{s}{ya:.1f}', (x, ya, za + 0.5), (x, yb, zb + 0.5), 0.025, M['plank'], 6))
        for y in (-span / 2 + 0.3, span / 2 - 0.3):
            p.append(box(f'br_beam{s}{y}', (0.18, 0.5, 0.3), (x, y, 0.0), M['plank'], bevel=0.01))
    items.append(join(p, 'footbridge'))

    # a rowboat, moored: a hull from a squashed sphere, benches, oars
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=24, ring_count=12, location=(0, 0, 0.35))
    h = bpy.context.active_object
    h.name = 'bt_hull'
    h.scale = (1.7, 0.62, 0.42)
    bpy.ops.object.transform_apply(scale=True)
    import bmesh
    bm = bmesh.new(); bm.from_mesh(h.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > 0.36], context='VERTS')
    bm.to_mesh(h.data); bm.free()
    sol = h.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.05
    h.data.materials.append(M['hull'])
    for poly in h.data.polygons:
        poly.use_smooth = True
    p = [h, torus('bt_rim', 1, 0.035, (0, 0, 0.36), material=M['plank'], maj=32, mnr=6)]
    p[-1].scale = (1.7, 0.62, 1)
    for x in (-0.6, 0.3):
        p.append(box(f'bt_bench{x}', (0.25, 1.1, 0.04), (x, 0, 0.28), M['plank'], bevel=0.006))
    for s in (-1, 1):
        p.append(rod(f'bt_oar{s}', (-0.3, s * 0.4, 0.36), (0.9, s * 0.95, 0.22), 0.02, M['plank'], 6))
        p.append(box(f'bt_blade{s}', (0.32, 0.1, 0.02), (1.02, s * 1.0, 0.21), M['plank'], bevel=0.005))
    p.append(rod('bt_rope', (1.6, 0, 0.32), (2.2, 0.1, 0.0), 0.012, M['rope'], 5))
    items.append(join(p, 'rowboat'))

    # a mooring post with a coil of rope
    items.append(join([rod('mp_post', (0, 0, 0), (0, 0, 0.9), 0.12, M['plank'], 10), torus('mp_rope', 0.15, 0.03, (0, 0, 0.55), material=M['rope'], maj=16, mnr=6),
                       torus('mp_rope2', 0.15, 0.03, (0, 0, 0.62), material=M['rope'], maj=16, mnr=6), sphere('mp_cap', 0.13, (0, 0, 0.9), M['plank'], 10, 5)], 'mooring_post'))

    # ONE material for the whole kit (its colours baked into the vertices), one more for what glows: a room full of
    # furniture is then two draw calls per street chunk, not twenty-five
    vc = mat('int_vc', (1, 1, 1), rough=0.55)
    glowm = mat('int_glow', (1, 1, 1), rough=0.3, emit=(1, 1, 1))
    glowing = {'int_screen', 'int_vendlit', 'int_lamp'}
    for ob in items:
        apply_all(ob)
        ob.data.name = ob.name
        ob.location = (0, 0, 0)          # origin on the floor at the centre
        me = ob.data
        cols = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        mats_ = list(me.materials)
        for poly in me.polygons:
            m = mats_[poly.material_index] if poly.material_index < len(mats_) else None
            b = m.node_tree.nodes['Principled BSDF'] if m else None
            c = list(b.inputs['Base Color'].default_value) if b else [0.5, 0.5, 0.5, 1]
            if m and m.name.split('.')[0] in glowing:
                e = b.inputs['Emission Color'].default_value
                c = [e[0], e[1], e[2], 1]
            for li in poly.loop_indices:
                cols.data[li].color = c
        isglow = [bool(m and m.name.split('.')[0] in glowing) for m in mats_]
        for poly in me.polygons:
            poly.material_index = 1 if isglow[poly.material_index] else 0
        while len(me.materials) < 2:
            me.materials.append(vc)
        me.materials[0] = vc
        me.materials[1] = glowm
        while len(me.materials) > 2:
            me.materials.pop(index=len(me.materials) - 1)
        me.color_attributes.active_color = cols
    bpy.ops.object.select_all(action='DESELECT')
    for ob in items:
        ob.select_set(True)
    tris = {o.name: sum(len(pp.vertices) - 2 for pp in o.data.polygons) for o in items}
    print('[kit] tris', tris, 'total', sum(tris.values()))
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'interior.glb'), export_format='GLB', use_selection=True, export_materials='EXPORT', export_yup=True, export_vertex_color='ACTIVE')
    print('[kit] wrote', os.path.join(OUT, 'interior.glb'))
    preview(items)


def preview(items):
    for i, ob in enumerate(items):
        ob.location = ((i % 6) * 3.4 - 8.5, (i // 6) * 4.0, 0)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 20
    sc.render.resolution_x, sc.render.resolution_y = 1600, 1000
    world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.1, 0.11, 0.13, 1)
    bpy.ops.object.light_add(type='SUN', rotation=(0.7, 0.2, 0.5)); bpy.context.active_object.data.energy = 4
    bpy.ops.object.camera_add(location=(0, -14, 11), rotation=(math.radians(52), 0, 0))
    cam = bpy.context.active_object; cam.data.lens = 26; sc.camera = cam
    os.makedirs(QA, exist_ok=True)
    sc.render.filepath = os.path.join(QA, 'interior_kit.png')
    bpy.ops.render.render(write_still=True)
    print('[kit] preview', sc.render.filepath)


if __name__ == '__main__':
    build()
