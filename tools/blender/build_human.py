"""Build one skinned human (zombie or survivor) as a game-ready GLB + textures.

    python build_human.py <variant> [--preview]

The professional pipeline, in Blender:
  1. MakeHuman's CC0 body, shaped by its macro targets (sex, age, weight,
     muscle) and folded onto a 27-bone game rig.
  2. Clothing is grown out of the body (inflation by region) so silhouettes
     read as shirts, trousers and shoes, not painted skin.
  3. A HIGH-POLY copy (subdivided twice, ~400k triangles) is sculpted in numpy:
     cloth folds at the joints, seams, hems, torn holes, wound craters,
     raised veins, ribs, hair strands.
  4. Albedo, roughness and a tangent-space normal map are BAKED from the
     high-poly onto the LOW-POLY game mesh (~7k triangles) with Cycles,
     supersampled 2x and downsized.
  5. The low-poly mesh + skeleton go out as GLB; textures as WebP.

Every pattern is evaluated in 3D on the body, never in UV space, so wounds
and blood run across UV seams without a break.
"""
import bpy
import bmesh
import math
import os
import sys
import time
import json
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mh  # noqa: E402
import tex  # noqa: E402
from tex import fbm, perlin, worley, smooth, hexc, mix  # noqa: E402
from variants import VARIANTS  # noqa: E402

OUT = os.path.join(HERE, '..', '..', 'public', 'assets', 'chars')
QA = os.path.join(HERE, '..', '..', 'qa')
BAKE = int(os.environ.get('BAKE', 2048))
FINAL = int(os.environ.get('FINAL', 1024))
LOW_TRIS = int(os.environ.get('LOW_TRIS', 7000))

REG = {
    'head': ['head', 'jaw'], 'neck': ['neck'],
    'torso': ['spine01', 'spine02', 'spine03', 'spine04', 'spine05',
              'clavicle_L', 'clavicle_R', 'root'],
    'uarm': ['upperarm_L', 'upperarm_R'], 'larm': ['forearm_L', 'forearm_R'],
    'hand': ['hand_L', 'hand_R', 'fingers_L', 'fingers_R'],
    'uleg': ['thigh_L', 'thigh_R', 'pelvis_L', 'pelvis_R'],
    'lleg': ['shin_L', 'shin_R'], 'foot': ['foot_L', 'foot_R'],
}
REG_ORDER = ['head', 'neck', 'torso', 'uarm', 'larm', 'hand', 'uleg', 'lleg',
             'foot', 'eye']


def conv(p):
    """MakeHuman (x, y-up, z-forward) -> Blender (x, y-back, z-up)."""
    p = np.asarray(p, np.float64)
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], -1)


def log(*a):
    print('[human]', *a, flush=True)


# ---------------------------------------------------------------------------
# Rig landmarks and limb parameters
# ---------------------------------------------------------------------------
class Rig:
    def __init__(self, bones, floor):
        self.b = {}
        for name, h, t, par in bones:
            self.b[name] = (conv(h) + [0, 0, floor], conv(t) + [0, 0, floor], par)

    def head(self, n):
        return self.b[n][0]

    def tail(self, n):
        return self.b[n][1]

    def arm(self, s):
        sh, el, wr = self.head(f'upperarm_{s}'), self.head(f'forearm_{s}'), self.head(f'hand_{s}')
        ft = self.tail(f'fingers_{s}')
        tip = ft + (ft - wr) / np.linalg.norm(ft - wr) * 0.06
        return [sh, el, wr, tip]

    def leg(self, s):
        hip, kn, an = self.head(f'thigh_{s}'), self.head(f'shin_{s}'), self.head(f'foot_{s}')
        toe = an + np.array([0, -0.17, -an[2] + 0.02])
        return [hip, kn, an, toe]


def chain_param(P, pts):
    """For each point: (param along the polyline, distance to it)."""
    best_d = np.full(len(P), 1e9)
    best_t = np.zeros(len(P))
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        ab = b - a
        t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
        d = np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
        m = d < best_d
        best_d[m] = d[m]
        best_t[m] = i + t[m]
    return best_t, best_d


class Field:
    """Everything a painter or sculptor needs to know about a set of points."""

    def __init__(self, P, N, R, rig):
        self.P, self.N, self.R, self.rig = P, N, R, rig
        x = P[:, 0]
        self.side = np.where(x >= 0, 'L', 'R')
        armL, _ = chain_param(P, rig.arm('L'))
        armR, _ = chain_param(P, rig.arm('R'))
        legL, _ = chain_param(P, rig.leg('L'))
        legR, _ = chain_param(P, rig.leg('R'))
        self.arm_t = np.where(x >= 0, armL, armR)
        self.leg_t = np.where(x >= 0, legL, legR)
        self.armw = R['uarm'] + R['larm'] + R['hand']
        self.legw = R['uleg'] + R['lleg'] + R['foot']
        self.z = P[:, 2]
        self.fwd = -P[:, 1]          # +forward
        self.waist = rig.head('spine04')[2]
        self.neckz = rig.head('neck')[2]
        self.headz = rig.head('head')[2]


# ---------------------------------------------------------------------------
# Clothing masks (shared by the inflation, the sculpt and the paint)
# ---------------------------------------------------------------------------
def cloth_masks(F, spec, hard=True):
    P, R = F.P, F.R
    o = spec['outfit']
    n = len(P)
    jit = fbm(P * 9, 3, seed=5) * (0.012 if hard else 0.0)
    m = {}
    # shirt / top
    sh = o.get('shirt')
    shirt = np.zeros(n)
    if sh:
        hem = F.waist - sh.get('hem', 0.07) + jit * 1.5
        body = (R['torso'] + R['neck'] * 0.0 + R['uarm'] + R['larm'] * 0.9) > 0.35
        body &= F.z > hem
        sleeve = sh.get('sleeve', 0.5)
        on_arm = F.armw > 0.5
        body &= ~(on_arm & (F.arm_t > sleeve + jit * 3))
        neckcut = F.neckz - sh.get('collar', 0.02)
        vneck = sh.get('vneck', 0.0)
        cut = neckcut - vneck * np.clip(1 - np.abs(P[:, 0]) / 0.09, 0, 1) * (F.fwd > 0)
        body &= F.z < cut + jit
        body &= R['head'] < 0.3
        if sh.get('open_back'):
            ob = (F.fwd < -0.02) & (np.abs(P[:, 0]) < 0.05 + 0.03 * fbm(P * 4, 2, seed=8)) & (F.z > F.waist - 0.3)
            body &= ~ob
        shirt = body.astype(float)
    m['shirt'] = shirt
    # trousers
    pa = o.get('pants')
    pants = np.zeros(n)
    if pa:
        top = F.waist + pa.get('rise', 0.0) + jit
        leg = (F.legw > 0.4) & (F.leg_t < pa.get('length', 1.95) + jit * 3)
        hips = (R['torso'] + F.legw > 0.4) & (F.z < top) & (F.z > F.rig.head('thigh_L')[2] - 0.25)
        pants = (leg | hips) & (F.z < top) & (F.armw < 0.5)
        pants = pants.astype(float)
    m['pants'] = pants
    # gown: covers torso and thighs to just above the knee
    gw = o.get('gown')
    if gw:
        g = ((R['torso'] + R['uarm'] + F.legw) > 0.3) & (F.z < F.neckz - 0.025 + jit)
        g &= ~((F.armw > 0.5) & (F.arm_t > 0.42 + jit * 3))
        g &= ~((F.legw > 0.4) & (F.leg_t > gw.get('length', 0.8) + jit * 4))
        g &= R['head'] < 0.3
        ob = (F.fwd < -0.01) & (np.abs(P[:, 0]) < 0.045 + 0.035 * fbm(P * 5, 2, seed=8)) & (F.z > F.waist - 0.1)
        g &= ~ob
        m['shirt'] = np.maximum(m['shirt'], g.astype(float))
    # vest over the shirt (hi-vis, tactical)
    vs = o.get('vest')
    vest = np.zeros(n)
    if vs:
        v = (R['torso'] > 0.4) & (F.z > F.waist - 0.05 + jit) & (F.z < F.neckz - 0.05)
        v &= ~((F.armw > 0.3))
        v &= ~((F.fwd > 0) & (np.abs(P[:, 0]) < vs.get('open', 0.0)))
        vest = v.astype(float)
    m['vest'] = vest
    # shoes
    so = o.get('shoes')
    shoes = np.zeros(n)
    if so:
        shoes = ((F.legw > 0.4) & (F.leg_t > so.get('top', 1.9) + jit)).astype(float)
    m['shoes'] = shoes
    gl = o.get('gloves')
    m['gloves'] = ((R['hand'] > 0.5) & (F.arm_t > 1.9)).astype(float) if gl else np.zeros(n)
    # a butcher's apron: the front of the body from the chest to below the knee, a strap round the neck
    ap = o.get('apron')
    apron = np.zeros(n)
    if ap:
        sy = F.rig.head('spine03')[1]
        front = (-(P[:, 1] - sy) > -0.02) & (-F.N[:, 1] > 0.05)
        top = F.neckz - ap.get('top', 0.2)
        knee = F.rig.head('shin_L')[2]
        a = front & (F.z < top + jit) & (F.z > knee + ap.get('drop', 0.04) + jit * 2) & (F.armw < 0.35) & (R['head'] < 0.3)
        # a narrow bib above the waist, the full skirt below it
        half = np.where(F.z > F.waist, ap.get('bib', 0.12), ap.get('width', 0.24))
        a &= np.abs(P[:, 0]) < half + jit
        strap = (F.z >= top - 0.01) & (F.z < F.neckz + 0.02) & (np.abs(np.abs(P[:, 0]) - 0.075) < 0.02) & (F.armw < 0.3) & (R['head'] < 0.4)
        tie = (np.abs(F.z - (F.waist - 0.02)) < 0.018) & (R['torso'] > 0.4) & (F.armw < 0.3)
        apron = (a | strap | tie).astype(float)
    m['apron'] = apron
    # restraints: leather straps round the chest, the belly, the arms and the legs, with buckles
    st = o.get('straps')
    straps = np.zeros(n)
    if st:
        w = st.get('w', 0.022)
        band = np.zeros(n, bool)
        for zz in (F.waist + 0.06, F.waist + 0.24):
            band |= (np.abs(F.z - zz) < w) & (R['torso'] > 0.4) & (F.armw < 0.4)
        for t in (0.42, 0.85, 1.55):
            band |= (np.abs(F.arm_t - t) < w * 1.2) & (F.armw > 0.5) & (R['hand'] < 0.3)
        for t in (0.35, 1.25):
            band |= (np.abs(F.leg_t - t) < w * 1.2) & (F.legw > 0.5)
        straps = band.astype(float)
    m['straps'] = straps
    m['cloth'] = np.clip(m['shirt'] + m['pants'] + m['shoes'] + m['vest'] + m['gloves'] + m['apron'] + m['straps'], 0, 1)
    # hair cap
    hr = o.get('hair')
    hair = np.zeros(n)
    if hr:
        ctr = F.rig.head('head') + np.array([0, 0.0, 0.03])
        d = P - ctr
        up = d[:, 2] / (np.linalg.norm(d, axis=1) + 1e-9)
        front = F.fwd - ctr[1] * -1
        line = hr.get('line', 0.25)
        hcap = (R['head'] > 0.6) & (up > line - 0.35 * (F.fwd - (-ctr[1])).clip(-1, 0) * 0)
        # hairline: higher at the forehead, low at the nape
        fwdness = (-(P[:, 1] - ctr[1])) / 0.1
        hl = line + 0.35 * np.clip(fwdness, 0, 1) - 0.55 * np.clip(-fwdness, 0, 1)
        hcap = (R['head'] > 0.5) & (up > hl + jit * 4)
        bald = hr.get('bald', 0.0)
        if bald > 0:
            hcap &= fbm(P * 14, 3, seed=31) > (bald - 0.5)
        hair = hcap.astype(float)
    m['hair'] = hair
    return m


# ---------------------------------------------------------------------------
# Body shaping (zombie posture is animation; this is flesh)
# ---------------------------------------------------------------------------
def inflate(V, Nrm, F, spec):
    m = cloth_masks(F, spec, hard=False)
    o = spec['outfit']
    d = np.zeros(len(V))
    d += m['shirt'] * o.get('shirt', {}).get('thick', 0.006) if o.get('shirt') else 0
    if o.get('gown'):
        loose = np.clip((F.waist + 0.05 - F.z) / 0.4, 0, 1)
        d += m['shirt'] * (0.008 + 0.03 * loose)
    d = np.maximum(d, m['pants'] * o.get('pants', {}).get('thick', 0.005) if o.get('pants') else 0)
    d += m['vest'] * 0.012
    d = np.maximum(d, m['shoes'] * o.get('shoes', {}).get('thick', 0.011) if o.get('shoes') else 0)
    d = np.maximum(d, m['gloves'] * 0.003)
    d += m['apron'] * 0.014 + m['straps'] * 0.009
    d += m['hair'] * spec['outfit'].get('hair', {}).get('volume', 0.006)
    return V + Nrm * d[:, None]


def bulk_body(V, Nrm, F, bulk):
    """Monsters are people pushed out of shape: a bloated belly, a mutated arm, a hunched back, a bull neck.
    Displacement along the normal (metres), weighted by the skin's region weights so the rig still fits."""
    P, R = F.P, F.R
    x = P[:, 0]
    sy = F.rig.head('spine03')[1]
    fwd = -(P[:, 1] - sy)
    d = np.zeros(len(P))
    g = lambda u: np.exp(-u * u)
    for b in bulk:
        k, amt = b['kind'], b['amt']
        side = b.get('side')
        sidew = np.ones(len(P)) if not side else smooth(-0.02, 0.02, x if side == 'L' else -x)
        if k == 'belly':
            w = (R['torso'] + 0.4 * R['uleg']) * g((F.z - (F.waist - 0.04)) / 0.16) * smooth(-0.03, 0.09, fwd) * g(x / 0.2)
        elif k == 'arm':
            w = F.armw * (0.55 + 0.45 * smooth(0.4, 1.3, F.arm_t)) * (1 - R['hand'])      # (a bulked hand is a balloon)
        elif k == 'shoulders':
            w = (R['torso'] + R['uarm'] + R['neck'] * 0.5) * g((F.z - (F.neckz - 0.09)) / 0.11) * g((np.abs(x) - 0.16) / 0.11)
        elif k == 'hump':
            w = R['torso'] * g((F.z - (F.neckz - 0.16)) / 0.13) * smooth(0.0, -0.08, fwd) * g(x / 0.14)
        elif k == 'neck':
            w = R['neck'] + 0.5 * R['torso'] * g((F.z - F.neckz) / 0.06)
        elif k == 'chest':
            w = R['torso'] * g((F.z - (F.neckz - 0.2)) / 0.12) * smooth(-0.02, 0.08, fwd)
        elif k == 'legs':
            w = F.legw * (1 - smooth(1.6, 1.9, F.leg_t))
        else:
            continue
        if b.get('lumpy'):
            # a mutation is not an even swelling: knots of muscle and tumour pushed out unevenly (a smooth bulge reads
            # as a balloon)
            rs = np.random.default_rng(b.get('seed', 7))
            n = np.zeros(len(P))
            for f in (19.0, 31.0, 47.0):
                k = rs.normal(size=3); k /= np.linalg.norm(k)
                n += np.sin(P @ (k * f) + rs.uniform(0, 6.283)) * (19.0 / f)
            w = w * np.clip(1 + b['lumpy'] * n / 1.6, 0.25, 2.2)
        d += amt * w * sidew * (1 - R['eye'])
    return V + Nrm * d[:, None]


# ---------------------------------------------------------------------------
# Sculpt (high poly displacement, metres) and paint (linear albedo, rough)
# ---------------------------------------------------------------------------
def wounds_of(F, spec):
    """Resolve each wound anchor to a surface point and normal."""
    out = []
    for w in spec.get('wounds', []):
        rig = F.rig
        a = w['at']
        pts = {
            'neck_L': rig.head('neck') + [0.045, 0.01, -0.02],
            'neck_R': rig.head('neck') + [-0.045, 0.01, -0.02],
            'shoulder_L': rig.head('upperarm_L') + [0.0, -0.02, 0.06],
            'shoulder_R': rig.head('upperarm_R') + [0.0, -0.02, 0.06],
            'forearm_L': (rig.head('forearm_L') + rig.head('hand_L')) / 2,
            'forearm_R': (rig.head('forearm_R') + rig.head('hand_R')) / 2,
            'chest_L': rig.head('spine01') + [0.08, -0.12, -0.05],
            'belly': rig.head('spine03') + [0.04, -0.14, 0.0],
            'flank_R': rig.head('spine03') + [-0.15, 0.0, 0.02],
            'back': rig.head('spine02') + [0.03, 0.15, 0.0],
            'thigh_L': (rig.head('thigh_L') + rig.head('shin_L')) / 2 + [0.0, -0.08, 0],
            'calf_R': (rig.head('shin_R') + rig.head('foot_R')) / 2 + [0.0, 0.06, 0],
            'cheek_L': rig.head('head') + [0.05, -0.08, 0.03],
            'scalp': rig.tail('head') + [0.03, 0.0, -0.03],
        }[a]
        out.append((np.asarray(pts, float), w.get('r', 0.05), w.get('depth', 0.008)))
    # snap to the surface
    res = []
    for c, r, dep in out:
        i = np.argmin(np.linalg.norm(F.P - c, axis=1))
        res.append((F.P[i], F.N[i], r, dep))
    return res


def details(F, m, spec):
    """The small things that make clothes read as clothes: belts and buckles,
    pockets and flies, buttons and plackets, collars, cuffs and hems, shoe
    soles and laces, a badge. One set of masks shared by the sculpt (raised
    or cut) and the paint."""
    P, o = F.P, spec['outfit']
    n = len(P)
    z, front, x = F.z, F.fwd > 0, P[:, 0]
    out = {k: np.zeros(n) for k in ('belt', 'buckle', 'buttons', 'placket', 'collar', 'cuff', 'hem', 'sole', 'laces', 'pocket', 'fly', 'badge', 'pantcuff', 'zip', 'pouch', 'molle', 'pad', 'flap')}
    pa, sh = o.get('pants'), o.get('shirt')
    if pa:
        top = F.waist + pa.get('rise', 0.0)
        body = ((F.R['torso'] + F.legw) > 0.4) & (F.armw < 0.5)
        belt = (m['pants'] > 0.5) & body & (z > top - 0.05) & (z < top - 0.003) & bool(pa.get('belt', True))
        out['belt'] = belt.astype(float)
        out['buckle'] = (belt & front & (np.abs(x) < 0.03) & (np.abs(z - (top - 0.026)) < 0.016)).astype(float)
        pk = np.zeros(n, bool)
        for sg in (-1, 1):
            a = np.array([0.085 * sg, top - 0.05]); b = np.array([0.17 * sg, top - 0.21])
            q = np.stack([x, z], 1) - a
            ab = b - a
            t = np.clip((q @ ab) / (ab @ ab), 0, 1)
            dist = np.linalg.norm(q - t[:, None] * ab, axis=1)
            pk |= front & (dist < 0.0042) & (m['pants'] > 0.5) & body & (F.legw < 0.9)
            dx = np.abs(x - 0.075 * sg) / 0.055; dz = np.abs(z - (top - 0.115)) / 0.047
            e = np.maximum(dx, dz)
            pk |= (~front) & (e > 0.86) & (e < 1.0) & (m['pants'] > 0.5) & body
        out['pocket'] = pk.astype(float)
        out['fly'] = (front & (np.abs(x) < 0.0035) & (z < top - 0.045) & (z > top - 0.15) & (m['pants'] > 0.5)).astype(float)
        out['pantcuff'] = ((m['pants'] > 0.5) & (F.legw > 0.5) & (F.leg_t > pa.get('length', 1.95) - 0.1) & (F.leg_t < pa.get('length', 1.95))).astype(float)
    if sh:
        hem = F.waist - sh.get('hem', 0.07)
        body = (F.R['torso'] > 0.3) & (F.armw < 0.5)
        cut = F.neckz - sh.get('collar', 0.02)
        out['collar'] = ((m['shirt'] > 0.5) & (z > cut - 0.035) & (F.R['head'] < 0.3)).astype(float)
        out['hem'] = ((m['shirt'] > 0.5) & body & (z > hem) & (z < hem + 0.03)).astype(float)
        sl = sh.get('sleeve', 0.5)
        out['cuff'] = ((m['shirt'] > 0.5) & (F.armw > 0.5) & (F.arm_t > sl - 0.1) & (F.arm_t < sl + 0.02)).astype(float)
        pl = front & (m['shirt'] > 0.5) & body & (z < cut - 0.03) & (z > hem + 0.03)
        if sh.get('buttons'):
            out['placket'] = (pl & (np.abs(x) < 0.02)).astype(float)
            bt = np.zeros(n, bool)
            zk = cut - 0.08
            while zk > hem + 0.05:
                bt |= front & (np.hypot(x, z - zk) < 0.0065) & pl
                zk -= 0.075
            out['buttons'] = bt.astype(float)
        if sh.get('zip'):
            out['zip'] = (pl & (np.abs(x) < 0.0035)).astype(float)
    if o.get('gown'):
        out['collar'] = ((m['shirt'] > 0.5) & (z > F.neckz - 0.06) & (F.R['head'] < 0.3)).astype(float) * 0.0
    if o.get('shoes'):
        sm = m['shoes'] > 0.5
        out['sole'] = (sm & (z < 0.02 + 0.012 * (np.abs(P[:, 1] - F.rig.head('foot_L')[1]) < 0.12))).astype(float)
        ay = F.rig.head('foot_L')[1]
        yy = P[:, 1] - ay
        lace = sm & (F.N[:, 2] > 0.5) & (z > 0.05) & (yy < -0.03) & (yy > -0.11) & (np.abs(np.abs(x) - abs(F.rig.head('foot_L')[0])) < 0.022)
        out['laces'] = (lace & (np.abs(np.sin(yy * math.pi / 0.021)) < 0.22)).astype(float)
    vs = o.get('vest')
    if vs and vs.get('pouches'):
        v = (m['vest'] > 0.5) & front
        pch = np.zeros(n, bool)
        for cx in (-0.105, 0.0, 0.105):
            pch |= v & (np.abs(x - cx) < 0.036) & (z > F.waist - 0.01) & (z < F.waist + 0.09)
        out['pouch'] = pch.astype(float)
        out['molle'] = (v & ~pch & (z > F.waist - 0.02) & (z < F.neckz - 0.09) & (np.sin(z * math.pi / 0.038) > 0.55) & (np.abs(x) > 0.02)).astype(float)
    if o.get('pads'):
        pd = np.zeros(n, bool)
        for s_ in ('L', 'R'):
            kc = F.rig.head(f'shin_{s_}')
            pd |= front & (np.linalg.norm((P - kc) * np.array([1.0, 1.0, 1.25]), axis=1) < 0.062) & (P[:, 1] < kc[1] + 0.02) & (m['pants'] > 0.5)
            ec = F.rig.head(f'forearm_{s_}')
            pd |= (np.linalg.norm((P - ec) * np.array([1.0, 1.0, 1.2]), axis=1) < 0.05) & (P[:, 1] > ec[1] - 0.01) & (m['shirt'] > 0.5)
        out['pad'] = pd.astype(float)
    if o.get('cargo'):
        fl = np.zeros(n, bool)
        for s_ in (-1, 1):
            e = np.maximum(np.abs(x - s_ * 0.2) / 0.05, np.abs(z - 0.68) / 0.075)
            fl |= (F.legw > 0.5) & (m['pants'] > 0.5) & (s_ * F.N[:, 0] > 0.3) & (e < 1.0)
        out['flap'] = fl.astype(float)
    if o.get('badge'):
        c = F.rig.head('spine01') + np.array([0.09, -0.11, -0.04])
        r = np.linalg.norm(P - c, axis=1)
        out['badge'] = (front & (r < 0.024)).astype(float)
    return out


def sculpt(F, m, spec):
    P, N = F.P, F.N
    o = spec['outfit']
    d = np.zeros(len(P))
    # skin: pores and fine creases
    d += fbm(P * 220, 2, seed=3) * 0.00025
    d += (ridged(P * 60, seed=4) - 0.6) * 0.0004 * (1 - m['cloth'])
    # emaciation: ribs where the body shows
    if spec.get('ribs'):
        rib = np.sin((F.z - F.waist) * 2 * math.pi / 0.032)
        ribzone = (F.R['torso'] > 0.5) & (F.z > F.waist + 0.08) & (F.z < F.neckz - 0.12) & (np.abs(P[:, 0]) > 0.035)
        d += rib * 0.0018 * ribzone * (1 - m['cloth'])
    # veins
    f1, f2 = worley(P * 38, seed=7)
    vein = smooth(0.06, 0.0, f2 - f1) * smooth(0.0, 0.35, fbm(P * 5, 2, seed=9))
    d += vein * 0.0005 * (1 - m['cloth'])
    # cloth: weave, broad folds, joint bunching, hems
    weave = perlin(P * 400, seed=11) * 0.00012
    folds = fbm(P * np.array([14, 14, 5]), 3, seed=12) * 0.0028
    elbow = np.exp(-((F.arm_t - 1.0) / 0.18) ** 2) * (F.armw > 0.5)
    knee = np.exp(-((F.leg_t - 1.0) / 0.2) ** 2) * (F.legw > 0.5)
    crotch = np.exp(-((F.leg_t - 0.12) / 0.15) ** 2) * (F.legw > 0.5)
    crease = ridged(P * np.array([26, 26, 34]), 3, seed=13) - 0.55
    bunch = (elbow + knee + crotch * 0.6) * crease * 0.006
    hemline = np.zeros(len(P))
    cl = m['cloth']
    d += cl * (weave + folds + bunch)
    dt_ = details(F, m, spec)
    d += (dt_['belt'] * 0.0018 + dt_['buckle'] * 0.0017 + dt_['collar'] * 0.003 + dt_['cuff'] * 0.0022 + dt_['hem'] * 0.002 + dt_['pantcuff'] * 0.002
          + dt_['placket'] * 0.0012 + dt_['buttons'] * 0.0024 + dt_['badge'] * 0.002 + dt_['sole'] * 0.0045 + dt_['laces'] * 0.0018
          - dt_['pocket'] * 0.0015 - dt_['fly'] * 0.0013 - dt_['zip'] * 0.001
          + dt_['pouch'] * 0.008 + dt_['molle'] * 0.0022 + dt_['pad'] * 0.009 + dt_['flap'] * 0.004)
    # seams down the outside of the trouser legs and along shirt sides
    seam_x = np.abs(np.abs(P[:, 0]) - (F.rig.head('thigh_L')[0] + 0.07))
    d -= m['pants'] * (F.legw > 0.5) * smooth(0.004, 0.0, seam_x) * 0.0008
    # tears: cloth gone, skin under it, frayed rim
    tear_n = fbm(P * 7, 3, seed=21)
    tear_amt = spec.get('tears', 0.0)
    holes = (tear_n > 0.55 - tear_amt * 0.5) & (cl > 0.5) & (m['shoes'] < 0.5) & (tear_amt > 0)
    rim = (tear_n > 0.5 - tear_amt * 0.5) & (cl > 0.5) & ~holes & (tear_amt > 0)
    d -= holes * 0.004
    d += rim * 0.0012 * (perlin(P * 300, seed=22) * 0.5 + 0.5)
    # hair strands flow back from the forehead and down from the crown
    if o.get('hair'):
        ctr = F.rig.head('head') + np.array([0, 0.02, 0.06])
        q = P - ctr
        az = np.arctan2(q[:, 0], -q[:, 1])
        strands = perlin(np.stack([az * 60, np.linalg.norm(q, axis=1) * 30, q[:, 2] * 4], 1), seed=40)
        d += m['hair'] * (strands * 0.0012 + fbm(P * 30, 2, seed=41) * 0.002)
    # wounds: crater with a torn, lifted rim
    for c, n_, r, dep in wounds_of(F, spec):
        dist = np.linalg.norm(P - c, axis=1)
        jag = r * (1 + 0.35 * fbm(P * 40, 2, seed=int(r * 1000)))
        crater = smooth(jag, jag * 0.35, dist)
        lip = np.exp(-((dist - jag) / (r * 0.18)) ** 2)
        chunks = fbm(P * 160, 2, seed=50) * 0.0015
        d += -crater * (dep + chunks) + lip * 0.0016
    # pustules: swollen boils across the skin (Subject Omega)
    pu = spec.get('pustules', 0.0)
    pust = np.zeros(len(P))
    if pu:
        f1p, _ = worley(P * 16, seed=77)
        pust = smooth(0.13, 0.0, f1p) * smooth(0.1, 0.5, fbm(P * 3, 2, seed=78)) * (1 - m['cloth'])
        d += pust * 0.007 * pu
    d += m['straps'] * (0.0015 + 0.001 * np.sin(F.z * 600))
    hm = {'holes': holes.astype(float), 'rim': rim.astype(float), 'pust': pust}
    return d, hm


def ridged(p, octaves=3, seed=0):
    return 1 - np.abs(fbm(p, octaves, seed=seed))


def paint(F, m, hm, d, cav, spec):
    """Returns (albedo sRGB 0..1, roughness 0..1)."""
    P = F.P
    n = len(P)
    sk = spec['skin']
    o = spec['outfit']
    rnd = np.random.RandomState(spec.get('seed', 1))
    # ---- skin ----------------------------------------------------------
    base = hexc(sk['base'])
    mott = fbm(P * 9, 4, seed=60)
    blot = fbm(P * 2.6, 3, seed=61)
    col = np.tile(base, (n, 1))
    col = mix(col, col * np.array([0.82, 0.86, 0.80]), smooth(-0.3, 0.6, mott) * 0.7)
    livid = hexc(sk.get('livid', '#5b4a5e'))
    # gravity pooling: hands, feet, lower legs, the underside of everything
    pool = np.clip((F.R['hand'] + F.R['foot'] * 1.2 + F.R['lleg'] * 0.5) * 0.8 + smooth(0.6, 1.4, -F.N[:, 2] + 0.6) * 0.3, 0, 1)
    col = mix(col, livid, np.clip(pool * sk.get('pool', 0.6) + smooth(0.2, 0.7, blot) * sk.get('bruise', 0.35), 0, 0.85))
    # veins
    f1, f2 = worley(P * 38, seed=7)
    veinzone = np.clip(F.R['neck'] + F.R['larm'] * 0.8 + F.R['uarm'] * 0.5 + F.R['torso'] * 0.4 + F.R['head'] * 0.3, 0, 1)
    vein = smooth(0.06, 0.0, f2 - f1) * smooth(0.0, 0.35, fbm(P * 5, 2, seed=9)) * veinzone
    col = mix(col, hexc(sk.get('vein', '#2f3a3f')), vein * sk.get('veins', 0.6))
    ch = sk.get('char', 0.0)
    if ch > 0:
        f1c, f2c = worley(P * 24, seed=61)
        crk = smooth(0.09, 0.0, f2c - f1c)
        ash = mix(np.tile(hexc('#1b1714'), (n, 1)), np.tile(hexc('#3a322c'), (n, 1)), smooth(-0.3, 0.6, fbm(P * 11, 3, seed=62)))
        col = mix(col, ash, ch * smooth(-0.35, 0.25, fbm(P * 3.2, 3, seed=63)))
        col = mix(col, hexc('#d4551a'), crk * ch * smooth(-0.1, 0.5, fbm(P * 5, 2, seed=64)) * 0.85)
    # face: sunken eyes, dark lips
    rig = F.rig
    eyes = rig.eyes
    socket = sum(np.exp(-(np.linalg.norm(P - e, axis=1) / 0.024) ** 2) for e in eyes)
    col = mix(col, hexc(sk.get('socket', '#3a2a2e')), np.clip(socket * sk.get('sunken', 0.8), 0, 0.9))
    mouth = rig.tail('jaw') + [0, 0.004, 0.024]
    dm = np.linalg.norm(P - mouth, axis=1)
    col = mix(col, hexc('#2e1416'), smooth(0.022, 0.008, dm) * 0.85)
    # ---- blood around the mouth, running down the chin and chest ----------
    gore = spec.get('gore', 0.6)
    drip = fbm(np.stack([P[:, 0] * 45, P[:, 1] * 45, P[:, 2] * 3], 1), 3, seed=70)
    below = np.clip((mouth[2] - P[:, 2]) / 0.45, 0, 1)
    lateral = np.abs(P[:, 0] - mouth[0]) / (0.05 + below * 0.12)
    front = F.fwd > -0.02
    mouthblood = (smooth(0.035, 0.012, dm) + smooth(1.0, 0.3, lateral + (0.4 - drip) * 1.0) * (below > 0) * (1 - below) * front) * gore
    blood_fresh = np.clip(mouthblood, 0, 1)
    blood_dry = np.zeros(n)
    # ---- wounds -------------------------------------------------------------
    for c, n_, r, dep in wounds_of(F, spec):
        dist = np.linalg.norm(P - c, axis=1)
        jag = r * (1 + 0.35 * fbm(P * 40, 2, seed=int(r * 1000)))
        inner = smooth(jag * 0.9, jag * 0.4, dist)
        bruise = smooth(jag * 2.4, jag, dist)
        col = mix(col, hexc('#3d2a35'), bruise * 0.7)
        flesh = mix(np.tile(hexc('#5a1210'), (n, 1)), np.tile(hexc('#8a3a2c'), (n, 1)), smooth(-0.2, 0.5, fbm(P * 90, 2, seed=52)))
        flesh = mix(flesh, hexc('#c9a888'), smooth(0.55, 0.75, fbm(P * 70, 2, seed=53)) * 0.5)   # fat / sinew
        flesh = mix(flesh, hexc('#1a0505'), smooth(0.3, 0.9, inner) * 0.6)
        col = mix(col, flesh, inner)
        # runs downward from the wound
        under = np.clip((c[2] - P[:, 2]) / 0.35, 0, 1) * (P[:, 2] < c[2])
        lat = np.linalg.norm((P - c)[:, :2], axis=1) / (r * (0.8 + 1.4 * smooth(-0.3, 0.6, drip)))
        run = smooth(1.0, 0.4, lat) * (1 - under) * (under > 0)
        blood_fresh = np.maximum(blood_fresh, run * gore + inner * 0.3)
        blood_dry = np.maximum(blood_dry, smooth(jag * 3.5, jag, dist) * smooth(-0.2, 0.4, fbm(P * 16, 3, seed=55)) * gore)
    # ---- clothing ----------------------------------------------------------
    cl = m['cloth']
    clothcol = np.zeros((n, 3))

    def fabric(spec_c, mask, seed):
        c = hexc(spec_c['color'])
        k = np.tile(c, (n, 1))
        pat = spec_c.get('pattern')
        if pat == 'stripes':
            s = (np.sin(P[:, 2] * 2 * math.pi / spec_c.get('pitch', 0.03)) > 0.6)
            k = mix(k, hexc(spec_c.get('color2', '#20242a')), s * 0.7)
        elif pat == 'plaid':
            a = np.sin(P[:, 0] * 2 * math.pi / 0.07) > 0.3
            b = np.sin(P[:, 2] * 2 * math.pi / 0.07) > 0.3
            k = mix(k, hexc(spec_c.get('color2', '#2a1a1a')), (a.astype(float) + b) * 0.33)
        elif pat == 'denim':
            fade = smooth(-0.2, 0.6, fbm(P * np.array([6, 6, 2]), 3, seed=seed)) * (F.fwd > 0)
            k = mix(k, k * 1.45 + 0.04, fade * 0.6)
            k = k * (1 + perlin(P * np.array([600, 600, 150]), seed=seed) * 0.08)[:, None]
        elif pat == 'hivis':
            band = (np.abs(F.z - (F.waist + 0.12)) < 0.022) | (np.abs(F.z - (F.waist + 0.27)) < 0.022)
            k = mix(k, hexc('#9a9c98'), band * 0.9)
        elif pat == 'camo':
            c2 = hexc(spec_c.get('color2', '#3a3a2c'))
            k = mix(k, c2, smooth(0.0, 0.08, fbm(P * 6, 3, seed=seed + 2)))
        # weave and wear
        k = k * (1 + perlin(P * 300, seed=seed) * 0.05 + fbm(P * 8, 3, seed=seed + 1) * 0.14)[:, None]
        return k
    for key, sub in (('pants', 'pants'), ('shirt', 'shirt'), ('vest', 'vest'), ('shoes', 'shoes'), ('gloves', 'gloves'), ('apron', 'apron'), ('straps', 'straps')):
        sc = o.get(sub) or (o.get('gown') if key == 'shirt' else None)
        if sc is None or not m[key].any():
            continue
        if key == 'shirt' and o.get('gown') and not o.get('shirt'):
            sc = o['gown']
        k = fabric(sc, m[key], seed=hash(key) % 97)
        clothcol = np.where(m[key][:, None] > 0.5, k, clothcol)
    dt_ = details(F, m, spec)
    clothcol = mix(clothcol, hexc('#1f1813'), dt_['belt'] * 0.95)
    clothcol = mix(clothcol, hexc('#6c6c69'), dt_['buckle'])
    clothcol = mix(clothcol, hexc('#d9d1be'), dt_['buttons'] * 0.95)
    clothcol = mix(clothcol, hexc('#c4bea9'), dt_['sole'] * 0.95)
    clothcol = mix(clothcol, hexc('#bdb8a6'), dt_['laces'] * 0.7)
    clothcol = mix(clothcol, hexc('#c9a23a'), dt_['badge'] * 0.95)
    clothcol = mix(clothcol, clothcol * 0.55 + 0.02, dt_['pouch'] * 0.9)
    clothcol = mix(clothcol, clothcol * 0.7, dt_['molle'] * 0.8)
    clothcol = mix(clothcol, hexc('#1b1b1a'), dt_['pad'] * 0.95)
    clothcol = mix(clothcol, clothcol * 0.85 + 0.01, dt_['flap'] * 0.8)
    clothcol = clothcol * (1 - 0.25 * np.clip(dt_['pocket'] + dt_['fly'] + dt_['zip'], 0, 1))[:, None]
    clothcol = clothcol * (1 - 0.12 * np.clip(dt_['collar'] + dt_['cuff'] + dt_['hem'] + dt_['pantcuff'], 0, 1))[:, None]
    # grime gets worse toward the ground
    grime = smooth(0.9, 0.1, F.z) * 0.6 + smooth(0.2, 0.8, fbm(P * 5, 3, seed=80)) * 0.35
    grime *= spec.get('grime', 0.7)
    clothcol = mix(clothcol, clothcol * np.array([0.55, 0.5, 0.42]), np.clip(grime, 0, 0.8))
    # cloth folds darken in the creases
    shade = np.clip(1 + d * 28, 0.72, 1.1)
    clothcol *= shade[:, None]
    if o.get('apron'):
        # a butcher's apron is a record of the day: smears, splashes and handprints
        st = smooth(-0.1, 0.45, fbm(P * 7, 4, seed=140)) + smooth(0.55, 0.75, fbm(P * 22, 2, seed=141)) * 0.6
        clothcol = mix(clothcol, hexc('#3e100c'), np.clip(st * 0.8, 0, 1) * m['apron'] * o['apron'].get('blood', 0.8))
    if o.get('straps'):
        bk = (m['straps'] > 0.5) & (np.abs(P[:, 0]) < 0.025) & (F.fwd > 0)
        clothcol = mix(clothcol, hexc('#8a8a84'), bk.astype(float) * 0.95)
    holes = hm['holes']
    col = mix(col, clothcol, cl * (1 - holes))
    col = mix(col, col * 0.55, hm['rim'] * cl)      # frayed rim is darker
    # hair
    if o.get('hair'):
        hc = hexc(o['hair']['color'])
        hcol = np.tile(hc, (n, 1)) * (0.75 + 0.5 * (perlin(P * np.array([200, 200, 60]), seed=90) * 0.5 + 0.5))[:, None]
        col = mix(col, hcol, m['hair'] * (1 - m['cloth']))
    # blood over everything (cloth soaks darker)
    soak = smooth(0.15, 0.6, np.clip(blood_dry * (0.6 + cl * 0.4), 0, 1))
    col = mix(col, hexc('#2b0d0b'), soak * 0.85)
    fresh = np.clip(blood_fresh, 0, 1)
    fresh = smooth(0.12, 0.55, fresh)        # blood has an edge; no pink wash
    b1, b2 = spec.get('bile', ('#33100c', '#1f0806'))      # (Patient Zero drools green bile, not blood)
    wet = mix(np.tile(hexc(b1), (n, 1)), np.tile(hexc(b2), (n, 1)), smooth(0.0, 0.5, fbm(P * 25, 2, seed=96)))
    col = mix(col, wet, fresh * 0.95)
    # dirt on skin too
    col = mix(col, col * np.array([0.62, 0.56, 0.48]), np.clip(grime * (1 - cl) * 0.6, 0, 0.6))
    # cavity: creases and the gaps between fingers go dark
    col *= np.clip(1 - cav * (0.75 - 0.5 * cl * (1 - holes)), 0.35, 1)[:, None]
    # glowing veins and boils (Subject Omega): bright enough to bloom under the street lamps
    gl_ = sk.get('glow')
    if gl_:
        f1g, f2g = worley(P * 30, seed=170)
        gv = smooth(0.07, 0.0, f2g - f1g) * smooth(-0.1, 0.4, fbm(P * 4, 2, seed=171)) * (1 - cl)
        col = mix(col, hexc(gl_), np.clip(gv * 1.2, 0, 1))
        col = mix(col, hexc(sk.get('boil', gl_)), np.clip(hm.get('pust', 0) * 1.4, 0, 1))
    # eyes
    eye = F.R['eye']
    if eye.any():
        ec = hexc(sk.get('eye', '#c9c6b4'))
        ecol = np.tile(ec, (n, 1))
        for e in eyes:
            q = P - e
            q /= np.linalg.norm(q, axis=1, keepdims=True) + 1e-9
            front = -q[:, 1]                 # 1 straight ahead
            iris = smooth(0.86, 0.9, front)
            pupil = smooth(0.965, 0.975, front)
            vessels = smooth(0.6, 0.9, ridged(P * 900, 2, seed=95)) * smooth(0.9, 0.3, front)
            ecol = mix(ecol, hexc(sk.get('iris', '#7d7a6c')), iris * (np.linalg.norm(P - e, axis=1) < 0.03))
            ecol = mix(ecol, hexc(sk.get('pupil', '#55534a')), pupil * (np.linalg.norm(P - e, axis=1) < 0.03))
            ecol = mix(ecol, hexc('#6a1d18'), vessels * sk.get('bloodshot', 0.6) * (np.linalg.norm(P - e, axis=1) < 0.03))
        col = mix(col, ecol, eye)
    # ---- roughness ---------------------------------------------------------
    rough = np.full(n, sk.get('rough', 0.55)) + fbm(P * 20, 2, seed=91) * 0.08
    rough = np.where(cl * (1 - holes) > 0.5, 0.9 + fbm(P * 30, 2, seed=92) * 0.05, rough)
    if o.get('shoes', {}).get('leather'):
        rough = np.where(m['shoes'] > 0.5, 0.45, rough)
    rough = np.where(m['hair'] * (1 - cl) > 0.5, 0.6, rough)
    rough = np.where(dt_['buckle'] > 0.5, 0.3, rough)
    rough = np.where(dt_['buttons'] > 0.5, 0.35, rough)
    rough = np.where(dt_['sole'] > 0.5, 0.75, rough)
    rough = np.where(dt_['badge'] > 0.5, 0.3, rough)
    rough = np.where(m['straps'] > 0.5, 0.5, rough)
    if o.get('apron'):
        rough = np.where(m['apron'] > 0.5, 0.55, rough)
    if spec.get('pustules'):
        rough = np.where(hm['pust'] > 0.3, 0.2, rough)
    rough = rough * (1 - fresh * 0.75) + fresh * 0.22
    rough = rough * (1 - soak * 0.25)
    rough = np.where(eye > 0.5, 0.2, rough)
    return np.clip(col, 0, 1), np.clip(rough, 0.05, 1)


# ---------------------------------------------------------------------------
# Blender plumbing
# ---------------------------------------------------------------------------
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mesh(name, V, faces, uvs_per_loop):
    me = bpy.data.meshes.new(name)
    me.from_pydata(V.tolist(), [], faces)
    me.update()
    uvl = me.uv_layers.new(name='UVMap')
    uvl.data.foreach_set('uv', np.asarray(uvs_per_loop, np.float32).ravel())
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def set_attr(ob, name, arr):
    me = ob.data
    if name in me.attributes:
        me.attributes.remove(me.attributes[name])
    a = me.attributes.new(name, 'FLOAT_COLOR', 'POINT')
    rgba = np.ones((len(me.vertices), 4), np.float32)
    rgba[:, :arr.shape[1]] = arr
    a.data.foreach_set('color', rgba.ravel())


def get_attr(ob, name):
    a = ob.data.attributes[name]
    out = np.zeros(len(ob.data.vertices) * 4, np.float32)
    a.data.foreach_get('color', out)
    return out.reshape(-1, 4)


def verts_of(ob):
    me = ob.data
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def normals_of(ob):
    me = ob.data
    n = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get('normal', n)
    return n.reshape(-1, 3)


def select_only(*obs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]


def image(name, size, noncolor=False):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    if noncolor:
        img.colorspace_settings.name = 'Non-Color'
    return img


def emission_mat(name, attr):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_name = attr
    nt.links.new(at.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return mat


def bake_target_mat(img):
    mat = bpy.data.materials.new('bake_' + img.name)
    mat.use_nodes = True
    nt = mat.node_tree
    tn = nt.nodes.new('ShaderNodeTexImage')
    tn.image = img
    nt.nodes.active = tn
    return mat


def shoe_shell(V, F):
    """Fill the toes into a shoe: every slice of the foot (across its length)
    is pushed out to that slice's convex outline, so the gaps between toes
    close and the foot becomes one smooth last."""
    from scipy.spatial import ConvexHull
    V = V.copy()
    for s in (1, -1):
        sel = np.nonzero((F.legw > 0.4) & (F.leg_t > 2.05) & (np.sign(V[:, 0] + 1e-9) == s))[0]
        if len(sel) < 10:
            continue
        y = V[sel, 1]
        bins = np.floor((y - y.min()) / 0.008).astype(int)
        for b in np.unique(bins):
            idx = sel[bins == b]
            if len(idx) < 4:
                continue
            q = V[idx][:, [0, 2]]
            try:
                hull = ConvexHull(q)
            except Exception:
                continue
            c = q.mean(0)
            hp = q[hull.vertices]
            for k, vi in enumerate(idx):
                dvec = q[k] - c
                L = np.linalg.norm(dvec)
                if L < 1e-6:
                    continue
                dvec /= L
                best = L
                for a, bb in zip(hp, np.roll(hp, -1, 0)):
                    e = bb - a
                    den = dvec[0] * e[1] - dvec[1] * e[0]
                    if abs(den) < 1e-9:
                        continue
                    w = a - c
                    t = (w[0] * e[1] - w[1] * e[0]) / den
                    u = (w[0] * dvec[1] - w[1] * dvec[0]) / den
                    if t > 0 and -1e-6 <= u <= 1 + 1e-6:
                        best = max(best, t)
                        break
                newp = c + dvec * best
                V[vi, 0], V[vi, 2] = newp[0], max(newp[1], 0.004)
        # the toe box: the forefoot becomes its own 3D convex hull
        fore = np.nonzero((F.legw > 0.4) & (F.leg_t > 2.35) & (np.sign(V[:, 0] + 1e-9) == s))[0]
        if len(fore) > 10:
            pts = V[fore]
            hull = ConvexHull(pts)
            c = pts.mean(0)
            u = pts - c
            L = np.linalg.norm(u, axis=1, keepdims=True)
            u /= np.maximum(L, 1e-9)
            nrm, dd = hull.equations[:, :3], hull.equations[:, 3]
            den = u @ nrm.T
            num = -(c @ nrm.T + dd)
            t = np.where(den > 1e-9, num / np.where(den > 1e-9, den, 1), np.inf).min(1)
            newp = c + u * np.maximum(t, L[:, 0])[:, None]
            newp[:, 2] = np.maximum(newp[:, 2], 0.004)
            V[fore] = newp
    return V


def hull_slices(V, sel, slice_axis, plane, step, keep=0.0):
    """Push each selected vertex out to the convex outline of its slice.
    `plane` are the two axes of the slice. keep>0 blends back toward the
    original so the garment still follows the body a little."""
    from scipy.spatial import ConvexHull
    V = V.copy()
    if len(sel) < 8:
        return V
    key = np.floor((V[sel, slice_axis] - V[sel, slice_axis].min()) / step).astype(int)
    for b in np.unique(key):
        idx = sel[key == b]
        if len(idx) < 5:
            continue
        q = V[idx][:, plane]
        try:
            hull = ConvexHull(q)
        except Exception:
            continue
        c = q.mean(0)
        nrm, dd = hull.equations[:, :2], hull.equations[:, 2]
        u = q - c
        L = np.linalg.norm(u, axis=1, keepdims=True)
        u = u / np.maximum(L, 1e-9)
        den = u @ nrm.T
        num = -(c @ nrm.T + dd)
        t = np.where(den > 1e-9, num / np.where(den > 1e-9, den, 1), np.inf).min(1)
        newq = c + u * np.maximum(t, L[:, 0])[:, None]
        newq = newq * (1 - keep) + q * keep
        V[idx[:, None], np.array(plane)[None, :]] = newq
    return V


def drape(base, V, F, spec):
    """Garments span hollows: cleavage, the navel, the small of the back,
    the gap under the bust and the groin. Slice the clothed torso both ways
    and fill each slice to its convex outline, then relax the seams."""
    m = cloth_masks(F, spec, hard=False)
    torso = (F.R['torso'] > 0.55) & (F.armw < 0.2) & (F.R['neck'] < 0.3)
    top = np.nonzero(torso & (m['shirt'] > 0.5) & (F.z > F.waist - 0.12))[0]
    V = hull_slices(V, top, 2, [0, 1], 0.012, keep=0.0)      # horizontal rings
    groin = np.nonzero(((F.R['torso'] + F.legw) > 0.5) & (F.armw < 0.2) & (F.z < F.waist + 0.02) &
                       (F.z > F.rig.head('shin_L')[2] + 0.2) & (np.abs(V[:, 0]) < 0.11) & (m['pants'] + m['shirt'] > 0.5))[0]
    top = np.union1d(top, groin)
    front = top[V[top, 1] < np.median(V[top, 1])]
    V = hull_slices(V, front, 0, [1, 2], 0.012, keep=0.1)    # sagittal strips, front
    w = np.zeros(len(V))
    w[top] = 1.0
    hips = (F.legw > 0.3) & (F.leg_t < 0.35) & (m['pants'] + m['shirt'] > 0.5)
    w[hips] = 0.8
    return relax(base, V, np.clip(w * 0.9, 0, 1), 8)


def relax(ob, V, w, iters):
    me = ob.data
    e = np.zeros(len(me.edges) * 2, np.int64)
    me.edges.foreach_get('vertices', e)
    e = e.reshape(-1, 2)
    nv = len(V)
    cnt = np.zeros(nv)
    np.add.at(cnt, e[:, 0], 1)
    np.add.at(cnt, e[:, 1], 1)
    V = V.copy()
    for _ in range(iters):
        acc = np.zeros((nv, 3))
        np.add.at(acc, e[:, 0], V[e[:, 1]])
        np.add.at(acc, e[:, 1], V[e[:, 0]])
        avg = acc / np.maximum(cnt, 1)[:, None]
        V += (avg - V) * (0.6 * w)[:, None]
    return V


def laplacian_cavity(ob, d):
    """Concavity per vertex from the mesh itself (creases, armpits, fingers)."""
    me = ob.data
    nv = len(me.vertices)
    e = np.zeros(len(me.edges) * 2, np.int64)
    me.edges.foreach_get('vertices', e)
    e = e.reshape(-1, 2)
    P = verts_of(ob)
    N = normals_of(ob)
    acc = np.zeros((nv, 3))
    cnt = np.zeros(nv)
    np.add.at(acc, e[:, 0], P[e[:, 1]])
    np.add.at(acc, e[:, 1], P[e[:, 0]])
    np.add.at(cnt, e[:, 0], 1)
    np.add.at(cnt, e[:, 1], 1)
    lap = acc / np.maximum(cnt, 1)[:, None] - P
    conc = (lap * N).sum(1)        # >0 where the neighbours sit above: a crease
    # blur a few times over the edge graph to get broad occlusion too
    c = conc.copy()
    for _ in range(6):
        a2 = np.zeros(nv)
        np.add.at(a2, e[:, 0], c[e[:, 1]])
        np.add.at(a2, e[:, 1], c[e[:, 0]])
        c = 0.5 * c + 0.5 * a2 / np.maximum(cnt, 1)
    fine = smooth(0.0, 0.0012, conc)
    broad = smooth(0.0, 0.0006, c)
    sculpt_cav = smooth(0.0, -0.004, d)
    return np.clip(fine * 0.5 + broad * 0.6 + sculpt_cav * 0.5, 0, 1)


# ---------------------------------------------------------------------------
def build(name, preview=False):
    spec = VARIANTS[name]
    t0 = time.time()
    reset()
    H = mh.Human(**spec['macro'])
    Vb, faces_b, remap = H.body()
    V = conv(Vb)
    floor = -V[:, 2].min()
    V[:, 2] += floor
    rig = Rig(H.game_bones(), floor)
    rig.eyes = [conv(H.bone_head(b)) + [0, 0, floor] for b in ('eye.L', 'eye.R')]

    # ---- weights onto the body vertices
    gw = H.game_weights()
    names = sorted(gw)
    W = np.zeros((len(V), len(names)))
    for j, b in enumerate(names):
        for vi, w in gw[b].items():
            k = remap[vi]
            if k >= 0:
                W[k, j] += w
    W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
    R = {k: W[:, [names.index(b) for b in bl]].sum(1) for k, bl in REG.items()}
    R['eye'] = np.zeros(len(V))

    # ---- eyes from the proxy, mapped into the spare corner of the atlas
    ev, ef, evt = H.fit_proxy(os.path.join(mh.MH, 'eyes', 'low-poly', 'low-poly.mhclo'))
    EV = conv(ev)
    EV[:, 2] += floor
    left = EV[:, 0] > 0

    # ---- assemble the base mesh (body + eyes) with per-loop UVs
    faces = [f[0] for f in faces_b]
    loops_uv = [H.vt[t] for f in faces_b for t in f[1]]
    nb = len(V)
    for vi, ti in ef:
        faces.append([nb + i for i in vi])
        for i, t in zip(vi, ti):
            u, v = evt[t]
            off = 0.82 if left[i] else 0.905
            loops_uv.append((off + u * 0.075, 0.88 + v * 0.1))
    Vall = np.concatenate([V, EV])
    Wall = np.concatenate([W, np.tile(np.eye(len(names))[names.index('head')], (len(EV), 1))])
    for k in R:
        R[k] = np.concatenate([R[k], np.zeros(len(EV))])
    R['eye'][nb:] = 1.0
    R['head'][nb:] = 1.0

    base = make_mesh(name + '_base', Vall, faces, loops_uv)
    for p in base.data.polygons:
        p.use_smooth = True
    if spec.get('bulk'):
        V0 = Vall.copy()
        Vall = bulk_body(Vall, normals_of(base), Field(Vall, normals_of(base), R, rig), spec['bulk'])
        base.data.vertices.foreach_set('co', Vall.ravel())
        base.data.update()
        log('bulk max', round(float(np.linalg.norm(Vall - V0, axis=1).max()), 4), 'verts moved >1cm', int((np.linalg.norm(Vall - V0, axis=1) > 0.01).sum()))
    # region weights travel with the mesh through subdivision
    RA = np.stack([R[k] for k in REG_ORDER], 1)
    for i in range(0, len(REG_ORDER), 4):
        chunk = RA[:, i:i + 4]
        set_attr(base, f'reg{i // 4}', chunk)

    # ---- clothing inflation on the base
    Nb = normals_of(base)
    Fb = Field(Vall, Nb, R, rig)
    mb = cloth_masks(Fb, spec, hard=False)
    Vs = Vall.copy()
    if spec['outfit'].get('shoes'):
        # a shoe is a smooth shell, not a sock: relax the toes away
        Vs = shoe_shell(Vs, Fb)
        Vs = relax(base, Vs, smooth(1.8, 2.2, Fb.leg_t) * (Fb.legw > 0.4), 6)
        log('shoe shell moved', int((np.linalg.norm(Vs - Vall, axis=1) > 1e-4).sum()))
        base.data.vertices.foreach_set('co', Vs.ravel())
        base.data.update()
        Nb = normals_of(base)
        Fb = Field(Vs, Nb, R, rig)
    if spec['outfit'].get('shirt') or spec['outfit'].get('gown'):
        Vs = drape(base, Vs, Fb, spec)
        base.data.vertices.foreach_set('co', Vs.ravel())
        base.data.update()
        Nb = normals_of(base)
        Fb = Field(Vs, Nb, R, rig)
    V2 = inflate(Vs, Nb, Fb, spec)
    base.data.vertices.foreach_set('co', V2.ravel())
    base.data.update()
    log('base vs input', float(np.abs(verts_of(base) - V2).max()), float(np.abs(V2 - Vall).max()))

    # ---- armature
    arm_data = bpy.data.armatures.new(name + '_rig')
    arm = bpy.data.objects.new(name + '_rig', arm_data)
    bpy.context.scene.collection.objects.link(arm)
    select_only(arm)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for bname, h, t, par in H.game_bones():
        b = arm_data.edit_bones.new(bname)
        b.head = (conv(h) + [0, 0, floor]).tolist()
        b.tail = (conv(t) + [0, 0, floor]).tolist()
        if bname == 'root':
            b.tail = (np.array(b.head) + [0, 0, 0.1]).tolist()
        if np.linalg.norm(np.array(b.tail) - np.array(b.head)) < 0.01:
            b.tail = (np.array(b.head) + [0, -0.03, 0]).tolist()
        eb[bname] = b
    for bname, h, t, par in H.game_bones():
        if par:
            eb[bname].parent = eb[par]
    bpy.ops.object.mode_set(mode='OBJECT')

    # vertex groups on the base (decimation and subdivision carry them)
    for j, b in enumerate(names):
        vg = base.vertex_groups.new(name=b)
        nz = np.nonzero(Wall[:, j] > 1e-4)[0]
        for vi in nz:
            vg.add([int(vi)], float(Wall[vi, j]), 'REPLACE')

    # ---- LOW: decimate the body
    low = base.copy()
    low.data = base.data.copy()
    low.name = name
    bpy.context.scene.collection.objects.link(low)
    select_only(low)
    tris = sum(len(p.vertices) - 2 for p in low.data.polygons)
    dm = low.modifiers.new('dec', 'DECIMATE')
    dm.ratio = min(1.0, LOW_TRIS / tris)
    dm.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    log('low tris', sum(len(p.vertices) - 2 for p in low.data.polygons))

    # ---- HIGH: subdivide, sculpt, paint
    high = base.copy()
    high.data = base.data.copy()
    high.name = name + '_high'
    bpy.context.scene.collection.objects.link(high)
    high.vertex_groups.clear()
    select_only(high)
    sm = high.modifiers.new('sub', 'SUBSURF')
    sm.levels = int(os.environ.get('SUBDIV', 2))
    sm.render_levels = int(os.environ.get('SUBDIV', 2))
    bpy.ops.object.modifier_apply(modifier='sub')
    PH = verts_of(high)
    NH = normals_of(high)
    regs = np.concatenate([get_attr(high, f'reg{i}') for i in range(3)], 1)
    RH = {k: regs[:, i] for i, k in enumerate(REG_ORDER)}
    FH = Field(PH, NH, RH, rig)
    log('high verts', len(PH), f'{time.time() - t0:.1f}s')
    mH = cloth_masks(FH, spec)
    ft = RH['foot'] > 0.5
    log('foot verts', int(ft.sum()), 'shoe frac', float(mH['shoes'][ft].mean()), 'leg_t', np.percentile(FH.leg_t[ft], [5, 50, 95]).round(2), 'legw', np.percentile(FH.legw[ft], [5, 50]).round(2))
    disp, hm = sculpt(FH, mH, spec)
    disp *= (1 - RH['eye'])
    high.data.vertices.foreach_set('co', (PH + NH * disp[:, None]).ravel())
    high.data.update()
    cav = laplacian_cavity(high, disp)
    alb, rough = paint(FH, mH, hm, disp, cav, spec)
    set_attr(high, 'albedo', tex.srgb_to_lin(alb))
    set_attr(high, 'rough', np.repeat(rough[:, None], 3, 1))
    log('sculpt+paint', f'{time.time() - t0:.1f}s')

    # ---- bake
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 1
    sc.render.bake.use_selected_to_active = True
    sc.render.bake.cage_extrusion = 0.02
    sc.render.bake.max_ray_distance = 0.05
    sc.render.bake.margin = 16
    imgs = {
        'albedo': image(name + '_albedo', BAKE),
        'rough': image(name + '_rough', BAKE, noncolor=True),
        'normal': image(name + '_normal', BAKE, noncolor=True),
    }
    low.data.materials.clear()
    for key in ('albedo', 'rough', 'normal'):
        low.data.materials.clear()
        low.data.materials.append(bake_target_mat(imgs[key]))
        high.data.materials.clear()
        high.data.materials.append(emission_mat('src_' + key, 'albedo' if key == 'normal' else key))
        select_only(low, high)
        bpy.context.view_layer.objects.active = low
        high.select_set(True)
        tb = time.time()
        if key == 'normal':
            bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
        else:
            bpy.ops.object.bake(type='EMIT')
        log('baked', key, f'{time.time() - tb:.1f}s')

    os.makedirs(OUT, exist_ok=True)
    from PIL import Image
    paths = {}
    for key, img in imgs.items():
        tmp = os.path.join('/tmp', f'{name}_{key}.png')
        img.filepath_raw = tmp
        img.file_format = 'PNG'
        img.save()
        im = Image.open(tmp).convert('RGB')
        size = FINAL if key != 'rough' else FINAL // 2
        im = im.resize((size, size), Image.LANCZOS)
        p = os.path.join(OUT, f'{name}_{key}.webp')
        im.save(p, 'WEBP', quality=88 if key != 'normal' else 92, method=6)
        paths[key] = p

    # ---- export low + rig
    bpy.data.objects.remove(high, do_unlink=True)
    bpy.data.objects.remove(base, do_unlink=True)
    low.data.materials.clear()
    mod = low.modifiers.new('arm', 'ARMATURE')
    mod.object = arm
    low.parent = arm
    for a in list(low.data.attributes):
        if a.name.startswith('reg'):
            low.data.attributes.remove(a)
    select_only(arm, low)
    glb = os.path.join(OUT, f'{name}.glb')
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format='GLB', use_selection=True,
        export_skins=True, export_animations=False, export_tangents=True,
        export_materials='NONE', export_texcoords=True, export_vertex_color='NONE', export_normals=True,
        export_attributes=False, export_yup=True)
    log('wrote', glb, f'{os.path.getsize(glb) // 1024} KB', f'{time.time() - t0:.1f}s total')

    if preview:
        render_preview(name, low, arm, imgs)


def render_preview(name, low, arm, imgs):
    mat = bpy.data.materials.new('preview')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    ta = nt.nodes.new('ShaderNodeTexImage'); ta.image = imgs['albedo']
    tr = nt.nodes.new('ShaderNodeTexImage'); tr.image = imgs['rough']
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = imgs['normal']
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(ta.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tr.outputs['Color'], bsdf.inputs['Roughness'])
    nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    low.data.materials.clear()
    low.data.materials.append(mat)
    sc = bpy.context.scene
    world = bpy.data.worlds.new('w'); sc.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.02, 0.022, 0.03, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    for loc, en, col in (((2.5, -3, 3.5), 900, (1, 0.9, 0.8)), ((-3, 1, 2.5), 400, (0.6, 0.7, 1)), ((0, 3, 2), 600, (0.7, 0.8, 1))):
        ld = bpy.data.lights.new('l', 'AREA'); ld.energy = en; ld.size = 2; ld.color = col
        lo = bpy.data.objects.new('l', ld); lo.location = loc
        sc.collection.objects.link(lo)
        lo.rotation_euler = (0, 0, 0)
        con = lo.constraints.new('TRACK_TO'); con.target = low; con.track_axis = 'TRACK_NEGATIVE_Z'; con.up_axis = 'UP_Y'
    sc.cycles.samples = 48
    sc.render.resolution_x = 900
    sc.render.resolution_y = 900
    sc.render.film_transparent = False
    os.makedirs(QA, exist_ok=True)
    for tag, loc in (('front', (0.45, -3.6, 1.2)), ('top', (1.5, -2.2, 4.2)), ('back', (-0.8, 3.3, 1.5))):
        cd = bpy.data.cameras.new('c'); cd.lens = 50
        co = bpy.data.objects.new('c', cd); co.location = loc
        sc.collection.objects.link(co)
        tgt = bpy.data.objects.new('t', None); tgt.location = (0, 0, 0.95)
        sc.collection.objects.link(tgt)
        con = co.constraints.new('TRACK_TO'); con.target = tgt; con.track_axis = 'TRACK_NEGATIVE_Z'; con.up_axis = 'UP_Y'
        sc.camera = co
        sc.render.filepath = os.path.join(QA, f'{name}_{tag}.png')
        bpy.ops.render.render(write_still=True)
    log('preview written')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:]]
    pv = '--preview' in args
    for a in args:
        if not a.startswith('--'):
            build(a, preview=pv)
