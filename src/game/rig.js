// Procedural animation on the 27-bone rig built by tools/blender.
//
// Every rotation is expressed about an axis in the CHARACTER's rest frame
// (x = the character's left, y = up, z = forward), converted once into each
// bone's local frame. That makes poses readable ("swing the thigh forward
// about x") and immune to bone roll. Rotations on one bone are applied
// outermost-last: q = rest * R(a_n) ... R(a_1).
//
// Research brief (design/research.md) numbers used here: zombie spine
// forward 15-30°, head forward and tilted 10-25°, one shoulder low, one arm
// reaching and one dangling; uneven step lengths and one dragged foot;
// gait phase advanced by distance travelled so feet never skate; random
// phase and time scale per zombie; twitches every 2-7 s.
import * as THREE from 'three';

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const TAU = Math.PI * 2;

// a critically-damped-ish spring for secondary motion
export class Spring {
  constructor(k = 120, d = 14) { this.x = 0; this.v = 0; this.k = k; this.d = d; this.target = 0; }
  kick(v) { this.v += v; }
  step(dt) {
    const a = -this.k * (this.x - this.target) - this.d * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

export class Rig {
  constructor(char) {
    this.c = char;
    this.b = char.bones;
    this.rest = {};
    // rest local quats and each bone's rest world rotation relative to the root
    char.root.updateMatrixWorld(true);
    const rootInv = new THREE.Quaternion();
    char.root.getWorldQuaternion(rootInv).invert();
    for (const [n, bone] of Object.entries(this.b)) {
      const wq = new THREE.Quaternion();
      bone.getWorldQuaternion(wq);
      wq.premultiply(rootInv);
      const inv = wq.clone().invert();
      // the three canonical axes expressed in this bone's frame, once (apply() runs for every body every frame)
      const ax = [X, Y, Z].map((a) => a.clone().applyQuaternion(inv));
      this.rest[n] = { local: bone.quaternion.clone(), world: wq, inv, pos: bone.position.clone(), ax };
      bone.quaternion._onChange(() => {});    // nothing reads a bone's Euler angles: skip keeping them in sync
    }
    this.hipsY = this.b.root ? this.b.root.position.y : 0;
    // a touch of cartoon in the proportions: heads and hands ~10% larger
    if (this.b.head) this.b.head.scale.setScalar(1.22);
    for (const h of ['hand_L', 'hand_R']) if (this.b[h]) this.b[h].scale.setScalar(1.16);
    this.pending = {};
  }

  // queue a rotation about a character-space axis
  rot(name, axis, angle) {
    if (!angle || !this.b[name]) return;
    (this.pending[name] ||= []).push([axis, angle]);
  }

  apply() {
    for (const [n, bone] of Object.entries(this.b)) {
      const r = this.rest[n];
      bone.quaternion.copy(r.local);
      const list = this.pending[n];
      if (!list) continue;
      // rest * R(last) * ... * R(first): build the right-hand product
      _q2.identity();
      for (let i = list.length - 1; i >= 0; i--) {
        const [axis, ang] = list[i];
        const ci = axis === X ? 0 : axis === Y ? 1 : axis === Z ? 2 : -1;
        _q.setFromAxisAngle(ci >= 0 ? r.ax[ci] : _v.copy(axis).applyQuaternion(r.inv), ang);
        _q2.multiply(_q);
      }
      // the list is in application order (first applied first)
      bone.quaternion.multiply(_q2);
      list.length = 0;
    }
  }

  setHips(dx, dy, dz) {
    const b = this.b.root;
    if (!b) return;
    const r = this.rest.root;
    b.position.set(r.pos.x + dx, r.pos.y + dy, r.pos.z + dz);
  }
}

// ---------------------------------------------------------------- shared --
// Bring the A-pose arms down to the sides (left arm is +x).
function armsDown(rig, amt, s = 1) {
  rig.rot('upperarm_L', Z, -0.82 * amt * s);
  rig.rot('upperarm_R', Z, 0.82 * amt * s);
}

function legCycle(rig, side, ph, o) {
  // ph 0..1 for this leg; 0 = heel strike forward, 0.5 = push-off behind
  const s = Math.sin(ph * TAU);
  const c = Math.cos(ph * TAU);
  const swingPhase = ph > 0.5 ? (ph - 0.5) * 2 : 0;    // 0..1 while the foot is in the air
  const lift = Math.sin(swingPhase * Math.PI);
  const thigh = -c * o.stride - o.lean * 0.4;
  const knee = lift * o.knee + o.bend;
  const foot = -thigh * 0.6 - knee * 0.5 + lift * 0.2;
  rig.rot(`thigh_${side}`, o.axis, thigh);
  // the knee and ankle are hinges: they only ever bend about the body's own side-to-side axis, whichever way the leg swings
  rig.rot(`shin_${side}`, X, knee);
  rig.rot(`foot_${side}`, X, o.axis === X ? foot : -knee * 0.5 + lift * 0.2);
  return { lift, s };
}

// ---------------------------------------------------------------- zombie --
export class ZombieAnim {
  constructor(rig, seed, kind = 'shambler') {
    this.rig = rig;
    this.kind = kind;
    const r = mulberry(seed);
    this.r = r;
    this.p = {
      lean: 0.4 + r() * 0.3,           // spine forward, radians
      headTilt: (r() < 0.5 ? -1 : 1) * (0.18 + r() * 0.25),
      headFwd: 0.2 + r() * 0.25,
      reach: r() < 0.65 ? (r() < 0.5 ? 'L' : 'R') : (r() < 0.4 ? 'both' : 'none'),
      reachAmt: 0.7 + r() * 0.5,
      limp: r() < 0.55 ? (r() < 0.5 ? 'L' : 'R') : null,
      shoulderDrop: (r() - 0.5) * 0.35,
      stride: 0.28 + r() * 0.12,
      timeScale: 0.85 + r() * 0.3,
      sway: 0.08 + r() * 0.08,
      jaw: 0.1 + r() * 0.2,
    };
    if (kind === 'runner') {            // head down, arms pumping, a long ragged stride
      this.p.lean = 0.55 + r() * 0.15; this.p.stride = 0.5; this.p.reach = 'none';
      this.p.timeScale = 1.25 + r() * 0.2; this.p.limp = null; this.p.sway = 0.04;
    } else if (kind === 'lurcher') { this.p.lean += 0.1; }
    else if (kind === 'brute') {        // a heavy, deliberate walk, both arms hanging forward
      this.p.lean = 0.3 + r() * 0.1; this.p.stride = 0.36; this.p.reach = 'both'; this.p.reachAmt = 0.6;
      this.p.timeScale = 0.62 + r() * 0.1; this.p.limp = null; this.p.sway = 0.14; this.p.shoulderDrop = 0.1;
    }
    this.phase = r();
    this.t = r() * 10;
    this.twitchT = 1 + r() * 4;
    this.springs = {
      headX: new Spring(90, 9), headZ: new Spring(90, 9), shoulder: new Spring(70, 8),
      spineX: new Spring(60, 10), spineY: new Spring(60, 10), armL: new Spring(50, 6), armR: new Spring(50, 6),
    };
    this.attack = 0;       // 0..1 lunge/grab pose
    this.lurch = 0;
    this.dead = 0;         // 0 alive, >0 seconds since death
    this.deathDir = 1;
  }

  hit(localDir, strength = 1) {
    // localDir: hit direction in the zombie's frame (x left, z forward)
    const S = this.springs;
    S.spineX.kick(-localDir.z * 6 * strength);
    S.spineY.kick(localDir.x * 8 * strength);
    S.headX.kick(-localDir.z * 14 * strength);
    S.headZ.kick((this.r() - 0.5) * 12 * strength);
    S.shoulder.kick((this.r() - 0.5) * 10 * strength);
    S.armL.kick((this.r() - 0.3) * 8);
    S.armR.kick((this.r() - 0.3) * 8);
  }

  doLurch() { this.lurch = 1; this.springs.spineX.kick(5); this.springs.headX.kick(6); }

  update(dt, moved, speed) {
    const rig = this.rig;
    const p = this.p;
    const S = this.springs;
    this.t += dt * p.timeScale;
    // twitches
    this.twitchT -= dt;
    if (this.twitchT < 0) {
      this.twitchT = 2 + this.r() * 5;
      const k = this.r();
      if (k < 0.4) S.headZ.kick((this.r() - 0.5) * 28);
      else if (k < 0.7) S.shoulder.kick((this.r() - 0.5) * 20);
      else S.headX.kick(-10 - this.r() * 10);
    }
    for (const s of Object.values(S)) s.step(dt);
    this.lurch = Math.max(0, this.lurch - dt * 2.5);

    if (this.dead > 0) { this.updateDeath(dt); return; }

    // gait phase advances by distance: one cycle = two steps
    const cycleLen = 1.05 * (p.stride / 0.33);
    this.phase = (this.phase + moved / cycleLen) % 1;
    const walk = Math.min(1, speed / 0.5);
    const ph = this.phase;
    const lean = p.lean + this.lurch * 0.35 + this.attack * 0.25;

    // limp: the bad leg's step is shorter and the foot drags
    const o = { stride: p.stride * walk, knee: 0.9 * walk, bend: 0.12, lean, axis: X };
    let phL = ph, phR = (ph + 0.5) % 1;
    const aL = legCycle(rig, 'L', phL, p.limp === 'L' ? { ...o, stride: o.stride * 0.55, knee: o.knee * 0.25 } : o);
    const aR = legCycle(rig, 'R', phR, p.limp === 'R' ? { ...o, stride: o.stride * 0.55, knee: o.knee * 0.25 } : o);
    // body: drop on the bad leg, bob, sway
    const bob = -Math.abs(Math.cos(ph * TAU)) * 0.035 * walk;
    const limpDrop = p.limp ? (p.limp === 'L' ? Math.max(0, -Math.cos(phL * TAU)) : Math.max(0, -Math.cos(phR * TAU))) * 0.04 * walk : 0;
    rig.setHips(0, bob - limpDrop - 0.03 - this.attack * 0.04, 0);
    const sway = Math.sin(ph * TAU) * p.sway * (0.5 + walk);
    rig.rot('root', Z, sway * 0.4);
    rig.rot('root', Y, Math.sin(ph * TAU) * 0.12 * walk);
    // spine: hunched, twisting against the hips, lurching
    const sX = lean + S.spineX.x * 0.05;
    rig.rot('spine04', X, sX * 0.3);
    rig.rot('spine03', X, sX * 0.3);
    rig.rot('spine02', X, sX * 0.25);
    rig.rot('spine01', X, sX * 0.15);
    rig.rot('spine03', Y, -Math.sin(ph * TAU) * 0.14 * walk + S.spineY.x * 0.04);
    rig.rot('spine02', Z, -sway * 0.6);
    // shoulders: one dropped
    rig.rot('clavicle_L', Z, p.shoulderDrop - S.shoulder.x * 0.03);
    rig.rot('clavicle_R', Z, p.shoulderDrop - S.shoulder.x * 0.03);
    // head: pushed forward, lolling, out of phase with the body
    const loll = Math.sin(this.t * 1.3 + 1) * 0.08 + Math.sin(ph * TAU * 2 + 0.7) * 0.06 * walk;
    rig.rot('neck', X, p.headFwd * 0.6 - lean * 0.5);
    rig.rot('head', X, -p.headFwd * 0.2 + S.headX.x * 0.04 + this.attack * -0.3);
    rig.rot('head', Z, p.headTilt + loll + S.headZ.x * 0.04);
    rig.rot('jaw', X, -(p.jaw + Math.max(0, Math.sin(this.t * 2.1)) * 0.12 + this.attack * 0.45));
    // arms
    const armSwing = (side) => Math.sin((side === 'L' ? phR : phL) * TAU) * (this.kind === 'runner' ? 0.9 : 0.25) * walk;
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? 1 : -1;
      const reaching = p.reach === 'both' || p.reach === side;
      const spring = side === 'L' ? S.armL.x : S.armR.x;
      rig.rot(`upperarm_${side}`, Z, -sg * 0.78);         // down from the A-pose
      if (reaching || this.attack > 0) {
        const amt = Math.max(reaching ? p.reachAmt : 0, this.attack * 1.25);
        const wob = Math.sin(this.t * 2.3 + sg) * 0.08;
        rig.rot(`upperarm_${side}`, X, -(1.0 * amt) + lean * 0.6 + wob + spring * 0.03);
        rig.rot(`upperarm_${side}`, Y, sg * -0.06 * amt);
        rig.rot(`forearm_${side}`, X, -0.12 * amt);
        rig.rot(`hand_${side}`, X, 0.3 * amt);
        rig.rot(`fingers_${side}`, X, 0.5);
      } else {
        // dead weight: a pendulum swing that lags the body
        rig.rot(`upperarm_${side}`, X, armSwing(side) + spring * 0.04 + lean * 0.5);
        rig.rot(`forearm_${side}`, X, -0.15 - Math.max(0, armSwing(side)) * 0.3);
        rig.rot(`fingers_${side}`, X, 0.35);
      }
    }
    rig.apply();
  }

  updateDeath(dt) {
    // knees go, the body folds the way the bullet pushed it
    const rig = this.rig;
    this.dead += dt;
    const t = Math.min(1, this.dead / 0.65);
    const knees = Math.min(1, this.dead / 0.18);
    const k = 1 - Math.pow(1 - t, 2.2);
    const d = this.deathDir;
    rig.rot('thigh_L', X, -0.9 * knees * (d > 0 ? 1 : 0.4));
    rig.rot('thigh_R', X, -0.7 * knees * (d > 0 ? 1 : 0.4));
    rig.rot('shin_L', X, 1.3 * knees * (1 - k * 0.6));
    rig.rot('shin_R', X, 1.1 * knees * (1 - k * 0.6));
    rig.rot('spine03', X, 0.25 * k * d);
    rig.rot('spine02', X, 0.2 * k * d);
    rig.rot('neck', X, 0.3 * k);
    rig.rot('head', Z, this.p.headTilt * 1.6);
    rig.rot('jaw', X, -0.4);
    // arms go limp: down to the sides first, then flopping out as the body lands
    const flop = this.p.flop ??= [this.r() * 0.9, this.r() * 0.9, this.r() * 1.2, this.r() * 1.2];
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? 1 : -1;
      const i = side === 'L' ? 0 : 1;
      rig.rot(`upperarm_${side}`, Z, -sg * (0.8 - k * flop[i] * 0.6));
      rig.rot(`upperarm_${side}`, X, (-0.3 - flop[i] * 0.4) * k * d);
      rig.rot(`forearm_${side}`, X, -flop[i + 2] * k);
      rig.rot(`forearm_${side}`, Y, sg * 0.4 * k);
      rig.rot(`fingers_${side}`, X, 0.7);
    }
    rig.setHips(0, -0.05 * knees, 0);
    rig.apply();
    return k;
  }
}

// --------------------------------------------------------------- survivor --
// Two-bone arm IK. The survivor holds a pistol with BOTH hands: the gun's pose
// is decided first (a stance, the recoil, the reload), then each arm is solved
// onto its grip.
const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _d0 = new THREE.Vector3(), _d1 = new THREE.Vector3();
const _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _dq = new THREE.Quaternion();

// turn `bone` about its own origin so the line to `child` points at `want`
function aimBone(bone, child, want) {
  bone.updateWorldMatrix(true, false);
  bone.getWorldPosition(_p0);
  child.getWorldPosition(_p1);
  _d0.copy(_p1).sub(_p0).normalize();
  _d1.copy(want).sub(_p0).normalize();
  _dq.setFromUnitVectors(_d0, _d1);
  bone.getWorldQuaternion(_wq);
  _wq.premultiply(_dq);
  bone.parent.getWorldQuaternion(_pq).invert();
  bone.quaternion.copy(_pq.multiply(_wq));
  bone.updateMatrixWorld(true);
}

// roll a bone about the line toward `child` by `ang` (world axis)
function rollBone(bone, child, ang) {
  if (!ang) return;
  bone.getWorldPosition(_p0);
  child.getWorldPosition(_p1);
  _d0.copy(_p1).sub(_p0).normalize();
  _dq.setFromAxisAngle(_d0, ang);
  bone.getWorldQuaternion(_wq);
  _wq.premultiply(_dq);
  bone.parent.getWorldQuaternion(_pq).invert();
  bone.quaternion.copy(_pq.multiply(_wq));
  bone.updateMatrixWorld(true);
}

const AXIS = new THREE.Vector3();
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// Per-gun hold, in the GUN's frame (x forward, y up, z the shooter's right): where each wrist goes,
// how the hands point, where the gun floats in front of the chest, and where the support hand
// goes to pull the magazine and work the action.
const HAND_R = { down: 0.55, yaw: 0 };
export const WEAPON_RIG = {
  pistol: {
    gripR: [-0.075, 0.014, 0.022], gripL: [-0.056, -0.034, -0.034],
    handL: { down: 0.25, yaw: 0.25 },
    stance: { aimed: { p: [-0.02, -0.075, 0.46], pitch: 0, roll: 0 }, ready: { p: [-0.04, -0.30, 0.34], pitch: -0.55, roll: 0 } },
    well: [-0.06, -0.012],     // [x, z] of the magazine well (the hand goes under it)
    rack: [-0.075, -0.048],    // [x, z] where the support hand takes the slide / charging handle
    rackBack: -0.12,
  },
  smg: {
    gripR: [-0.075, 0.012, 0.022], gripL: [0.135, -0.02, -0.036],
    handL: { down: 0.9, yaw: 0.1 },
    stance: { aimed: { p: [-0.02, -0.07, 0.34], pitch: 0, roll: 0 }, ready: { p: [-0.04, -0.28, 0.27], pitch: -0.5, roll: 0 } },
    well: [0.112, -0.012],
    rack: [-0.075, -0.045],
    rackBack: -0.14,
  },
  // the long guns ride against the right shoulder (x is the body's LEFT, so the stock sits at -x)
  shotgun: {
    gripR: [-0.085, 0.0, 0.022], gripL: [0.36, -0.04, -0.036],
    handL: { down: 0.35, yaw: 0.15 },
    stance: { aimed: { p: [-0.1, -0.08, 0.24], pitch: 0, roll: 0 }, ready: { p: [-0.1, -0.26, 0.2], pitch: -0.5, roll: 0 } },
    well: [0.165, -0.004],          // the loading port: shells go in from underneath
    rack: [0.36, -0.036], rackY: -0.04, rackBack: 0.27,     // "racking" a pump gun is the pump itself
  },
  rifle: {
    gripR: [-0.075, 0.0, 0.022], gripL: [0.245, -0.012, -0.04],
    handL: { down: 0.9, yaw: 0.1 },
    stance: { aimed: { p: [-0.1, -0.08, 0.26], pitch: 0, roll: 0 }, ready: { p: [-0.1, -0.26, 0.21], pitch: -0.5, roll: 0 } },
    well: [0.103, -0.012],
    rack: [-0.073, -0.045], rackY: 0.081, rackBack: -0.15,
  },
  lmg: {
    gripR: [-0.075, -0.005, 0.022], gripL: [0.335, -0.035, -0.04],
    handL: { down: 0.35, yaw: 0.15 },
    stance: { aimed: { p: [-0.1, -0.1, 0.22], pitch: 0, roll: 0 }, ready: { p: [-0.1, -0.28, 0.19], pitch: -0.45, roll: 0 } },
    well: [0.145, -0.012],
    rack: [0.218, 0.04], rackY: 0.028, rackBack: 0.12,
  },
};
// A reload, as fractions of its length. Poses are relative to the shoulders.
export const RELOAD_EVENTS = [
  { u: 0.10, name: 'release' }, { u: 0.20, name: 'magout' }, { u: 0.50, name: 'magin' }, { u: 0.70, name: 'rack' },
];
const R_GUN = [
  { u: 0.00 }, { u: 0.12, p: [-0.03, -0.17, 0.30], pitch: 0.30, roll: 0.55 },
  { u: 0.44, p: [-0.03, -0.17, 0.30], pitch: 0.30, roll: 0.55 }, { u: 0.60, p: [-0.03, -0.14, 0.32], pitch: 0.2, roll: 0.35 },
  { u: 0.72, p: [-0.02, -0.09, 0.40], pitch: 0.08, roll: 0.1 }, { u: 0.88, p: [-0.02, -0.08, 0.44], pitch: 0.02, roll: 0 }, { u: 1.0 },
];
// the support hand: 'g' keys are in the gun's frame, 'c' keys in the body's
function handKeys(W) {
  const [wx, wz] = W.well, [rx, rz] = W.rack, gl = W.gripL;
  return [
    { u: 0.00, g: gl }, { u: 0.09, g: [wx, -0.085, wz] }, { u: 0.20, g: [wx, -0.20, wz] },
    { u: 0.34, c: [0.20, -0.52, 0.16] }, { u: 0.43, c: [0.17, -0.47, 0.22] },
    { u: 0.52, g: [wx, -0.17, wz + 0.002] }, { u: 0.58, g: [wx, -0.075, wz + 0.008] }, { u: 0.64, g: [wx, -0.085, wz - 0.002] },
    { u: 0.71, g: [rx, W.rackY ?? 0.085, rz] }, { u: 0.80, g: [W.rackBack, W.rackY ?? 0.085, rz] }, { u: 0.84, g: [rx, W.rackY ?? 0.085, rz] },
    { u: 0.93, g: gl }, { u: 1.0, g: gl },
  ];
}
for (const W of Object.values(WEAPON_RIG)) W.keys = handKeys(W);

export class SurvivorAnim {
  constructor(rig) {
    this.rig = rig;
    this.phase = 0;
    this.t = 0;
    this.recoil = new Spring(260, 20);
    this.spineKick = new Spring(150, 16);
    this.aim = 0;          // 0 low ready .. 1 aiming
    this.reload = 0;       // 0..1 during a reload
    this.hurt = new Spring(120, 12);
    this.down = 0;
    this.slide = 0;        // how far back the slide is (m); locked back when empty
    this.slideLock = false;
    this.magOut = 0;       // 0 mag in the gun .. 1 out of it
    this.magHand = 0;      // 1 while a fresh mag is in the left hand
    this.onEvent = null;
    this._ru = -1;
    this.gunPos = new THREE.Vector3();
    this.gunQuat = new THREE.Quaternion();
    this.handL = new THREE.Vector3();      // world position of the support wrist (for the mag prop)
    this.rollR = 0; this.rollL = 0;
    this.W = WEAPON_RIG.pistol;
    this.swap = 0;         // 1 just after drawing a gun, easing to 0
    const root = rig.c.root;
    root.updateMatrixWorld(true);
    const wp = (n) => rig.b[n].getWorldPosition(new THREE.Vector3());
    this.len = {};
    for (const s of ['L', 'R']) {
      this.len[s] = [wp('upperarm_' + s).distanceTo(wp('forearm_' + s)), wp('forearm_' + s).distanceTo(wp('hand_' + s)), wp('hand_' + s).distanceTo(wp('fingers_' + s))];
    }
  }

  setWeapon(id) { this.W = WEAPON_RIG[id] || WEAPON_RIG.pistol; }
  fire(last = false, kick = 26) { this.recoil.kick(kick); this.spineKick.kick(6); this.slide = 0.03; if (last) this.slideLock = true; }
  hit() { this.hurt.kick(10); }

  // moveLocal: velocity in the character's frame (x left, z forward), m/s
  update(dt, moveLocal, aiming) {
    const rig = this.rig;
    this.t += dt;
    this.recoil.step(dt);
    this.spineKick.step(dt);
    this.hurt.step(dt);
    this.swap = Math.max(0, this.swap - dt / 0.38);
    this.aim += ((aiming ? 1 : 0) - this.aim) * Math.min(1, dt * 12);
    const speed = Math.hypot(moveLocal.x, moveLocal.z);
    const run = Math.min(1, speed / 3.5);
    const walk = Math.min(1, speed / 1.0);
    const cycleLen = 1.3 + run * 1.0;
    this.phase = (this.phase + speed * dt / cycleLen) % 1;
    // legs swing along the direction of travel (strafe and backpedal read from above)
    let axis = X;
    if (speed > 0.05) {
      const dx = moveLocal.x / speed, dz = moveLocal.z / speed;
      axis = AXIS.set(dz, 0, -dx);      // perpendicular to travel, in the ground plane
    }
    // a side-step is a shorter step than a stride forward (full-length swings sideways read as a jumping jack)
    const fwdK = speed > 0.05 ? Math.abs(moveLocal.z) / speed : 1;
    const o = { stride: (0.3 + run * 0.35) * walk * (0.5 + 0.5 * fwdK), knee: (0.7 + run * 0.6) * walk, bend: 0.08 + run * 0.1, lean: 0, axis };
    legCycle(rig, 'L', this.phase, o);
    legCycle(rig, 'R', (this.phase + 0.5) % 1, o);
    // the model's rest pose has its legs apart: bring the feet in under the hips (Sam: "the legs walk too wide")
    const tuck = this.legIn ?? 0.1;
    rig.rot('thigh_L', Z, -tuck); rig.rot('thigh_R', Z, tuck);
    rig.rot('foot_L', Z, tuck * 0.8); rig.rot('foot_R', Z, -tuck * 0.8);
    const bob = -Math.abs(Math.cos(this.phase * TAU)) * (0.02 + run * 0.04) * walk;
    rig.setHips(0, bob - 0.02 - this.down * 0.5, 0);
    // torso: a fighting crouch, leaning into the run
    const lean = 0.08 + run * 0.18 + this.spineKick.x * -0.012 + this.down * 0.4;
    rig.rot('spine04', X, lean * 0.4);
    rig.rot('spine03', X, lean * 0.3);
    rig.rot('spine02', X, lean * 0.2 - this.hurt.x * 0.01);
    rig.rot('spine03', Y, Math.sin(this.phase * TAU) * 0.08 * walk * (1 - this.aim));
    // a little twist toward the gun hand, more while it is up
    rig.rot('spine03', Y, -0.1 * this.aim);
    rig.rot('neck', X, -lean * 0.4);
    rig.rot('head', X, -0.1 + this.aim * 0.05);
    // the arms: start from a relaxed pose; the IK below takes over
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? 1 : -1;
      rig.rot(`upperarm_${side}`, Z, -sg * 0.82);
      rig.rot(`fingers_${side}`, Z, -sg * (this.curl ?? 1.0));
    }
    rig.apply();
    this.holdGun(dt, run, lean);
  }

  // key tracks -------------------------------------------------------------
  _track(keys, u, f) {
    let i = 0;
    while (i < keys.length - 2 && u > keys[i + 1].u) i++;
    const a = keys[i], b = keys[i + 1];
    return f(a, b, sm((u - a.u) / Math.max(1e-4, b.u - a.u)));
  }

  holdGun(dt, run, lean) {
    const rig = this.rig, b = rig.b, root = rig.c.root;
    root.updateMatrixWorld(true);
    const Lw = S_L, Rw = S_R, M = S_M;
    b.upperarm_L.getWorldPosition(Lw); b.upperarm_R.getWorldPosition(Rw);
    root.worldToLocal(Lw); root.worldToLocal(Rw);
    M.copy(Lw).add(Rw).multiplyScalar(0.5);
    const a = this.aim;
    // ---- the gun's pose, in the body's frame
    const A = this.W.stance.aimed, D = this.W.stance.ready;
    let px = D.p[0] + (A.p[0] - D.p[0]) * a, py = D.p[1] + (A.p[1] - D.p[1]) * a, pz = D.p[2] + (A.p[2] - D.p[2]) * a;
    let pitch = D.pitch + (A.pitch - D.pitch) * a, roll = 0;
    const u = this.reload > 0 ? Math.min(1, this.reload) : 0;
    if (u > 0) {
      const keys = R_GUN;
      let i = 0;
      while (i < keys.length - 2 && u > keys[i + 1].u) i++;
      const k0 = keys[i], k1 = keys[i + 1], t = sm((u - k0.u) / Math.max(1e-4, k1.u - k0.u));
      const g = (k, f, d) => (k.p ? f(k) : d);
      const x0 = g(k0, (k) => k.p[0], px), y0 = g(k0, (k) => k.p[1], py), z0 = g(k0, (k) => k.p[2], pz), pi0 = g(k0, (k) => k.pitch, pitch), r0 = g(k0, (k) => k.roll, roll);
      const x1 = g(k1, (k) => k.p[0], px), y1 = g(k1, (k) => k.p[1], py), z1 = g(k1, (k) => k.p[2], pz), pi1 = g(k1, (k) => k.pitch, pitch), r1 = g(k1, (k) => k.roll, roll);
      px = x0 + (x1 - x0) * t; py = y0 + (y1 - y0) * t; pz = z0 + (z1 - z0) * t; pitch = pi0 + (pi1 - pi0) * t; roll = r0 + (r1 - r0) * t;
    }
    // events (sounds are the player's business)
    if (this.reload > 0) {
      for (const ev of RELOAD_EVENTS) if (this._ru < ev.u && u >= ev.u) this.onEvent?.(ev.name);
    }
    this._ru = this.reload > 0 ? u : -1;
    // recoil and gait
    const rec = this.recoil.x;
    py -= this.swap * this.swap * 0.16;
    const pos = S_POS.set(M.x + px, M.y + py + Math.sin(this.phase * TAU * 2) * 0.012 * run, M.z + pz - rec * 0.03);
    pitch += rec * 0.12 + this.hurt.x * 0.01 - this.swap * this.swap * 0.7;
    // the gun's frame: x forward (pitched), y up, z the shooter's right
    S_FWD.set(0, Math.sin(pitch), Math.cos(pitch));
    S_ZR.crossVectors(S_FWD, Y).normalize();
    S_YU.crossVectors(S_ZR, S_FWD).normalize();
    S_MAT.makeBasis(S_FWD, S_YU, S_ZR);
    const q0 = S_Q0.setFromRotationMatrix(S_MAT);
    q0.multiply(S_QR.setFromAxisAngle(X, roll));
    // reach: the gun hand must be able to get there
    const GR = this.W.gripR, GL = this.W.gripL;
    const wR = S_WR.set(GR[0], GR[1], GR[2]).applyQuaternion(q0).add(pos);
    const v = S_V.copy(wR).sub(Rw);
    const reach = (this.len.R[0] + this.len.R[1]) * 0.985;
    const vl = v.length();
    if (vl > reach) { v.multiplyScalar(reach / vl - 1); pos.add(v); wR.add(v); }
    // the world pose of the gun
    root.getWorldQuaternion(_wq);
    this.gunQuat.copy(_wq).multiply(q0);
    this.gunPos.copy(pos); root.localToWorld(this.gunPos);
    // ---- the support hand's target
    const wL = S_WL;
    if (u > 0) {
      const keys = this.W.keys;
      let i = 0;
      while (i < keys.length - 2 && u > keys[i + 1].u) i++;
      const k0 = keys[i], k1 = keys[i + 1], t = sm((u - k0.u) / Math.max(1e-4, k1.u - k0.u));
      const at = (k, out) => (k.g ? out.set(k.g[0], k.g[1], k.g[2]).applyQuaternion(q0).add(pos) : out.set(M.x + k.c[0], M.y + k.c[1], M.z + k.c[2]));
      at(k0, S_A); at(k1, S_B);
      wL.copy(S_A).lerp(S_B, t);
    } else wL.set(GL[0], GL[1], GL[2]).applyQuaternion(q0).add(pos);
    // the mag leaves the gun at 'magout' and a fresh one rides the hand until it seats
    this.magOut = u <= 0 ? 0 : u < 0.2 ? 0 : u < 0.5 ? 1 : u < 0.58 ? 1 - sm((u - 0.5) / 0.08) : 0;
    this.magHand = u >= 0.2 && u < 0.58 ? 1 : 0;
    // ---- solve both arms
    this._arm('R', wR, q0, HAND_R, roll);
    this._arm('L', wL, q0, this.W.handL, roll);
    this.handL.copy(wL); root.localToWorld(this.handL);
  }

  _arm(side, targetChar, q0, hand, gunRoll) {
    const rig = this.rig, b = rig.b, root = rig.c.root;
    const sg = side === 'L' ? 1 : -1;
    const up = b['upperarm_' + side], fo = b['forearm_' + side], ha = b['hand_' + side], fi = b['fingers_' + side];
    const [l1, l2, l3] = this.len[side];
    const S = up.getWorldPosition(S_S);
    const T = S_T.copy(targetChar); root.localToWorld(T);
    const Sd = S_SD.copy(T).sub(S);
    const dist = Math.min(Sd.length(), (l1 + l2) * 0.995);
    const dir = Sd.normalize();
    // the elbow: down and out
    const rq = root.getWorldQuaternion(S_RQ);
    const pole = S_POLE.set(sg * 0.55, -1, -0.15).applyQuaternion(rq);
    pole.sub(S_D2.copy(dir).multiplyScalar(pole.dot(dir))).normalize();
    const aL = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, l1 * l1 - aL * aL));
    const E = S_E.copy(S).addScaledVector(dir, aL).addScaledVector(pole, h);
    const Tw = S_TW.copy(S).addScaledVector(dir, dist);
    aimBone(up, fo, E);
    aimBone(fo, ha, Tw);
    // the hand points along the gun, a little down (and a little in for the support hand)
    const hd = S_HD.set(Math.cos(hand.down) * Math.cos(hand.yaw), -Math.sin(hand.down), Math.sin(hand.yaw));
    hd.applyQuaternion(q0).applyQuaternion(rq).normalize();
    const look = S_LK.copy(Tw).addScaledVector(hd, l3);
    aimBone(ha, fi, look);
    rollBone(ha, fi, (side === 'R' ? this.rollR : this.rollL));
  }
}

// scratch for holdGun/_arm: this runs for every survivor every frame, and a phone's garbage
// collector turns a few dozen short-lived objects a frame into a visible hitch
const S_L = new THREE.Vector3(), S_R = new THREE.Vector3(), S_M = new THREE.Vector3(), S_POS = new THREE.Vector3();
const S_FWD = new THREE.Vector3(), S_ZR = new THREE.Vector3(), S_YU = new THREE.Vector3(), S_V = new THREE.Vector3();
const S_WR = new THREE.Vector3(), S_WL = new THREE.Vector3(), S_A = new THREE.Vector3(), S_B = new THREE.Vector3();
const S_S = new THREE.Vector3(), S_T = new THREE.Vector3(), S_SD = new THREE.Vector3(), S_POLE = new THREE.Vector3();
const S_D2 = new THREE.Vector3(), S_E = new THREE.Vector3(), S_TW = new THREE.Vector3(), S_HD = new THREE.Vector3(), S_LK = new THREE.Vector3();
const S_MAT = new THREE.Matrix4(), S_Q0 = new THREE.Quaternion(), S_QR = new THREE.Quaternion(), S_RQ = new THREE.Quaternion();

export function mulberry(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
