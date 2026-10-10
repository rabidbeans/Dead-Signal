"""MakeHuman (CC0 assets) loader: base mesh, macro targets, skeleton, weights.

Pure numpy, no bpy, so it runs inside Blender's Python and outside it.
Units: MakeHuman works in decimetres; everything here is returned in metres.
"""
import json
import os
import numpy as np

MH = os.environ.get(
    'MH_DATA', '/home/user/makehumancommunity/makehuman/makehuman/data')

# The game rig. Every one of MakeHuman's 163 bones folds into the nearest
# of these (its own ancestor unless OVERRIDE says otherwise), so the face,
# toes, twist and metacarpal bones all keep their skin, just on fewer bones.
KEEP = {
    'root': 'root',
    'spine05': 'spine05', 'spine04': 'spine04', 'spine03': 'spine03',
    'spine02': 'spine02', 'spine01': 'spine01',
    'neck01': 'neck', 'head': 'head', 'jaw': 'jaw',
}
for s in ('L', 'R'):
    KEEP.update({
        f'clavicle.{s}': f'clavicle_{s}', f'upperarm01.{s}': f'upperarm_{s}',
        f'lowerarm01.{s}': f'forearm_{s}', f'wrist.{s}': f'hand_{s}',
        f'finger3-1.{s}': f'fingers_{s}',
        f'pelvis.{s}': f'pelvis_{s}', f'upperleg01.{s}': f'thigh_{s}',
        f'lowerleg01.{s}': f'shin_{s}', f'foot.{s}': f'foot_{s}',
    })
OVERRIDE = {}
for s in ('L', 'R'):
    OVERRIDE[f'shoulder01.{s}'] = f'upperarm01.{s}'
    for f in (2, 4, 5):
        for j in (1, 2, 3):
            OVERRIDE[f'finger{f}-{j}.{s}'] = f'finger3-1.{s}'


def read_obj(path):
    v, vt, faces, groups = [], [], [], []
    g = None
    with open(path) as fh:
        for line in fh:
            if line.startswith('v '):
                v.append([float(x) for x in line.split()[1:4]])
            elif line.startswith('vt '):
                vt.append([float(x) for x in line.split()[1:3]])
            elif line.startswith('g '):
                g = line.split()[1]
            elif line.startswith('f '):
                vi, ti = [], []
                for tok in line.split()[1:]:
                    p = tok.split('/')
                    vi.append(int(p[0]) - 1)
                    ti.append(int(p[1]) - 1 if len(p) > 1 and p[1] else -1)
                faces.append((vi, ti))
                groups.append(g)
    return np.array(v, np.float64), np.array(vt, np.float64), faces, groups


def read_target(path):
    idx, d = [], []
    with open(path) as fh:
        for line in fh:
            if not line.strip() or line[0] == '#':
                continue
            p = line.split()
            idx.append(int(p[0]))
            d.append([float(p[1]), float(p[2]), float(p[3])])
    return np.array(idx, np.int64), np.array(d, np.float64)


def _interp(value, names):
    """MakeHuman's 3-point macro interpolation: value 0..1 -> {name: w}."""
    lo, mid, hi = names
    if value < 0.5:
        return {lo: 1 - value * 2, mid: value * 2}
    return {mid: 1 - (value - 0.5) * 2, hi: (value - 0.5) * 2}


def macro_targets(gender=1.0, age=0.5, muscle=0.5, weight=0.5,
                  height=0.5, proportions=0.5, race=(1/3, 1/3, 1/3)):
    """The weighted target list for MakeHuman's macro sliders.

    gender 0 female .. 1 male; age 0.5 = 25 years, 1.0 = 90 years;
    muscle/weight/height/proportions 0..1 with 0.5 average."""
    out = []
    genders = {'female': 1 - gender, 'male': gender}
    # age: 0 baby, 0.1875 child, 0.5 young, 1 old
    if age < 0.1875:
        ages = {'baby': 1 - age / 0.1875, 'child': age / 0.1875}
    elif age < 0.5:
        t = (age - 0.1875) / (0.5 - 0.1875)
        ages = {'child': 1 - t, 'young': t}
    else:
        t = (age - 0.5) / 0.5
        ages = {'young': 1 - t, 'old': t}
    muscles = _interp(muscle, ('minmuscle', 'averagemuscle', 'maxmuscle'))
    weights = _interp(weight, ('minweight', 'averageweight', 'maxweight'))
    base = os.path.join(MH, 'targets', 'macrodetails')
    for g, gw in genders.items():
        for a, aw in ages.items():
            for m, mw in muscles.items():
                for w, ww in weights.items():
                    k = gw * aw * mw * ww
                    if k > 1e-4:
                        out.append((os.path.join(
                            base, f'universal-{g}-{a}-{m}-{w}.target'), k))
                    # height
                    if abs(height - 0.5) > 1e-3:
                        hn = 'maxheight' if height > 0.5 else 'minheight'
                        hk = k * abs(height - 0.5) * 2
                        out.append((os.path.join(
                            base, 'height', f'{g}-{a}-{m}-{w}-{hn}.target'), hk))
                    if abs(proportions - 0.5) > 1e-3 and a != 'baby':
                        pn = ('idealproportions' if proportions > 0.5
                              else 'uncommonproportions')
                        pk = k * abs(proportions - 0.5) * 2
                        out.append((os.path.join(
                            base, 'proportions',
                            f'{g}-{a}-{m}-{w}-{pn}.target'), pk))
        for r, rw in zip(('african', 'asian', 'caucasian'), race):
            for a, aw in ages.items():
                k = gw * aw * rw
                if k > 1e-4:
                    out.append((os.path.join(base, f'{r}-{g}-{a}.target'), k))
    return [(p, k) for p, k in out if os.path.exists(p)]


class Human:
    def __init__(self, **macro):
        v, vt, faces, groups = read_obj(os.path.join(MH, '3dobjs', 'base.obj'))
        for path, k in macro_targets(**macro):
            idx, d = read_target(path)
            if len(idx):
                v[idx] += d * k
        self.v_all = v * 0.1          # decimetres -> metres
        self.vt = vt
        self.faces_all = faces
        self.groups = groups
        self.skel = json.load(open(os.path.join(MH, 'rigs', 'default.mhskel')))
        self.weights_src = json.load(open(
            os.path.join(MH, 'rigs', 'default_weights.mhw')))['weights']
        self._joints()

    # ---- skeleton -------------------------------------------------------
    def _joints(self):
        self.jpos = {}
        for name, idx in self.skel['joints'].items():
            self.jpos[name] = self.v_all[np.array(idx)].mean(0)

    def bone_head(self, b):
        return self.jpos[self.skel['bones'][b]['head']]

    def bone_tail(self, b):
        return self.jpos[self.skel['bones'][b]['tail']]

    def kept_of(self, b):
        if b in OVERRIDE:
            b = OVERRIDE[b]
        while b not in KEEP:
            b = self.skel['bones'][b]['parent']
        return b

    def game_bones(self):
        """[(name, head, tail, parent_name)] in parent-first order."""
        out = []
        order = list(self.skel['bones'].keys())
        # parent-first ordering
        done = set()
        bones = self.skel['bones']

        def visit(b):
            if b in done:
                return
            p = bones[b]['parent']
            if p:
                visit(p)
            done.add(b)
            if b in KEEP:
                par = p
                while par and par not in KEEP:
                    par = bones[par]['parent']
                out.append([KEEP[b], self.bone_head(b), self.bone_tail(b),
                            KEEP[par] if par else None])
        for b in order:
            visit(b)
        # Twist bones were folded in, so a limb bone ends where the next
        # kept bone starts (upper arm -> elbow, not mid-arm).
        heads = {o[0]: o[1] for o in out}
        for o in out:
            for s in ('L', 'R'):
                nxt = {f'upperarm_{s}': f'forearm_{s}', f'forearm_{s}': f'hand_{s}',
                       f'thigh_{s}': f'shin_{s}', f'shin_{s}': f'foot_{s}'}
                if o[0] in nxt:
                    o[2] = heads[nxt[o[0]]]
            if o[0] == 'neck':
                o[2] = heads['head']
        return [tuple(o) for o in out]

    def game_weights(self):
        """{game_bone: {vertex: weight}} merged from all 163 bones."""
        merged = {}
        for b, pairs in self.weights_src.items():
            if b not in self.skel['bones']:
                continue
            g = KEEP[self.kept_of(b)]
            dst = merged.setdefault(g, {})
            for vi, w in pairs:
                dst[vi] = dst.get(vi, 0.0) + w
        return merged

    # ---- the body mesh only -------------------------------------------
    def body(self):
        """Vertices, per-face (vi, ti) lists and the old->new vertex map for
        the 'body' group (no helpers, no joint cubes)."""
        used = sorted({i for (vi, _), g in zip(self.faces_all, self.groups)
                       if g == 'body' for i in vi})
        remap = -np.ones(len(self.v_all), np.int64)
        remap[used] = np.arange(len(used))
        faces = [([int(remap[i]) for i in vi], ti)
                 for (vi, ti), g in zip(self.faces_all, self.groups)
                 if g == 'body']
        return self.v_all[used].copy(), faces, remap

    def fit_proxy(self, mhclo_path):
        """Fit an .mhclo proxy (eyes, clothes) to this body. Returns
        (verts, faces(vi,ti), uvs) in metres."""
        d = os.path.dirname(mhclo_path)
        obj_file, refs, scales = None, [], {}
        mode = None
        with open(mhclo_path) as fh:
            for line in fh:
                s = line.strip()
                if not s or s.startswith('#'):
                    continue
                p = s.split()
                if p[0] == 'obj_file':
                    obj_file = os.path.join(d, p[1])
                elif p[0] in ('x_scale', 'y_scale', 'z_scale'):
                    scales[p[0][0]] = (int(p[1]), int(p[2]), float(p[3]))
                elif p[0] == 'verts':
                    mode = 'verts'
                elif p[0] == 'delete_verts':
                    mode = None
                elif mode == 'verts':
                    if len(p) == 1:
                        refs.append(((int(p[0]),), (1.0,), (0, 0, 0)))
                    elif len(p) >= 9:
                        refs.append(((int(p[0]), int(p[1]), int(p[2])),
                                     tuple(float(x) for x in p[3:6]),
                                     tuple(float(x) for x in p[6:9])))
        V = self.v_all * 10   # proxy offsets are in MakeHuman units

        def sc(axis):
            if axis not in scales:
                return 1.0
            a, b, ref = scales[axis]
            k = 'xyz'.index(axis)
            return abs(V[a][k] - V[b][k]) / ref
        s = np.array([sc('x'), sc('y'), sc('z')])
        out = []
        for idx, w, off in refs:
            p = sum(V[i] * wi for i, wi in zip(idx, w)) + np.array(off) * s
            out.append(p)
        pv, pvt, pf, _ = read_obj(obj_file)
        return np.array(out) * 0.1, pf, pvt
