"""Render named objects from a GLB at the game's camera angle and a 3/4 view.
    python look.py file.glb name [name...]"""
import bpy, sys, math, os
from mathutils import Vector
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
glb, names = args[0], args[1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.samples = 24
sc.render.resolution_x = 640; sc.render.resolution_y = 400
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.3, 0.32, 0.36, 1)
sun = bpy.data.lights.new('s', 'SUN'); sun.energy = 3.5
so = bpy.data.objects.new('s', sun); sc.collection.objects.link(so); so.rotation_euler = (math.radians(35), 0, math.radians(40))
gnd = bpy.data.meshes.new('g'); 
bpy.ops.mesh.primitive_plane_add(size=60); 
for ob in list(sc.objects):
    if ob.type == 'MESH' and ob.name not in names and ob.name != 'Plane': ob.hide_render = True
out = os.path.join(os.path.dirname(__file__), '..', '..', 'qa')
for n in names:
    ob = bpy.data.objects[n]
    for o in sc.objects:
        if o.type == 'MESH' and o.name != 'Plane': o.hide_render = (o.name != n)
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    ctr = sum(bb, Vector()) / 8; size = max((max(getattr(v, a) for v in bb) - min(getattr(v, a) for v in bb)) for a in 'xyz')
    for tag, (el, az) in (('game', (58, 15)), ('q', (25, 35))):
        cd = bpy.data.cameras.new('c'); cd.lens = 50
        co = bpy.data.objects.new('c', cd); sc.collection.objects.link(co)
        d = size * 2.1
        e, a = math.radians(el), math.radians(az)
        co.location = ctr + Vector((math.sin(a) * math.cos(e) * d, -math.cos(a) * math.cos(e) * d, math.sin(e) * d))
        t = bpy.data.objects.new('t', None); t.location = ctr; sc.collection.objects.link(t)
        c = co.constraints.new('TRACK_TO'); c.target = t; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
        sc.camera = co; sc.render.filepath = os.path.join(out, f'look_{n}_{tag}.png')
        bpy.ops.render.render(write_still=True)
