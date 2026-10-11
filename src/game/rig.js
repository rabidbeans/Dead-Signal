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
      this.rest[n] = { local: bone.quaternion.clone(), world: wq, inv: wq.clone().invert(), pos: bone.position.clone() };
    }
    this.hipsY = this.b.root ? this.b.root.position.y : 0;
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
        _v.copy(axis).applyQuaternion(r.inv);
        _q.setFromAxisAngle(_v, ang);
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
  rig.rot(`shin_${side}`, o.axis, knee);
  rig.rot(`foot_${side}`, o.axis, foot);
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

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// grip offsets in the GUN's frame (x forward, y up, z the shooter's right)
const GRIP_R = [-0.075, 0.014, 0.022];
const GRIP_L = [-0.056, -0.034, -0.034];
const HAND_R = { down: 0.55, yaw: 0 };
const HAND_L = { down: 0.25, yaw: 0.25 };
const STANCE = {
  aimed: { p: [-0.02, -0.075, 0.46], pitch: 0, roll: 0 },
  ready: { p: [-0.04, -0.30, 0.34], pitch: -0.55, roll: 0 },
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
const R_HAND = [
  { u: 0.00, g: GRIP_L }, { u: 0.09, g: [-0.06, -0.085, -0.012] }, { u: 0.20, g: [-0.06, -0.20, -0.012] },
  { u: 0.34, c: [0.20, -0.52, 0.16] }, { u: 0.43, c: [0.17, -0.47, 0.22] },
  { u: 0.52, g: [-0.06, -0.17, -0.01] }, { u: 0.58, g: [-0.06, -0.075, -0.004] }, { u: 0.64, g: [-0.06, -0.085, -0.014] },
  { u: 0.71, g: [-0.075, 0.085, -0.048] }, { u: 0.80, g: [-0.12, 0.085, -0.048] }, { u: 0.84, g: [-0.075, 0.085, -0.048] },
  { u: 0.93, g: GRIP_L }, { u: 1.0, g: GRIP_L },
];

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
    const root = rig.c.root;
    root.updateMatrixWorld(true);
    const wp = (n) => rig.b[n].getWorldPosition(new THREE.Vector3());
    this.len = {};
    for (const s of ['L', 'R']) {
      this.len[s] = [wp('upperarm_' + s).distanceTo(wp('forearm_' + s)), wp('forearm_' + s).distanceTo(wp('hand_' + s)), wp('hand_' + s).distanceTo(wp('fingers_' + s))];
    }
  }

  fire(last = false) { this.recoil.kick(26); this.spineKick.kick(6); this.slide = 0.03; if (last) this.slideLock = true; }
  hit() { this.hurt.kick(10); }

  // moveLocal: velocity in the character's frame (x left, z forward), m/s
  update(dt, moveLocal, aiming) {
    const rig = this.rig;
    this.t += dt;
    this.recoil.step(dt);
    this.spineKick.step(dt);
    this.hurt.step(dt);
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
      axis = new THREE.Vector3(dz, 0, -dx);      // perpendicular to travel, in the ground plane
    }
    const o = { stride: (0.3 + run * 0.35) * walk, knee: (0.7 + run * 0.6) * walk, bend: 0.08 + run * 0.1, lean: 0, axis };
    legCycle(rig, 'L', this.phase, o);
    legCycle(rig, 'R', (this.phase + 0.5) % 1, o);
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
    const L = new THREE.Vector3(), R = new THREE.Vector3();
    b.upperarm_L.getWorldPosition(L); b.upperarm_R.getWorldPosition(R);
    root.worldToLocal(L); root.worldToLocal(R);
    const M = L.clone().add(R).multiplyScalar(0.5);
    const a = this.aim;
    // ---- the gun's pose, in the body's frame
    const st = (k) => ({ p: new THREE.Vector3().fromArray(STANCE[k].p), pitch: STANCE[k].pitch, roll: STANCE[k].roll });
    const A = st('aimed'), D = st('ready');
    let pose = { p: D.p.clone().lerp(A.p, a), pitch: D.pitch + (A.pitch - D.pitch) * a, roll: 0 };
    const u = this.reload > 0 ? Math.min(1, this.reload) : 0;
    if (u > 0) {
      pose = this._track(R_GUN, u, (k0, k1, t) => {
        const g0 = k0.p ? { p: new THREE.Vector3().fromArray(k0.p), pitch: k0.pitch, roll: k0.roll } : pose;
        const g1 = k1.p ? { p: new THREE.Vector3().fromArray(k1.p), pitch: k1.pitch, roll: k1.roll } : pose;
        return { p: g0.p.clone().lerp(g1.p, t), pitch: g0.pitch + (g1.pitch - g0.pitch) * t, roll: g0.roll + (g1.roll - g0.roll) * t };
      });
    }
    // events (sounds are the player's business)
    if (this.reload > 0) {
      for (const ev of RELOAD_EVENTS) if (this._ru < ev.u && u >= ev.u) this.onEvent?.(ev.name);
    }
    this._ru = this.reload > 0 ? u : -1;
    // recoil and gait
    const rec = this.recoil.x;
    const bobY = Math.sin(this.phase * TAU * 2) * 0.012 * run;
    const pos = M.clone().add(pose.p);
    pos.y += bobY;
    const pitch = pose.pitch + rec * 0.12 + this.hurt.x * 0.01;
    pos.z -= rec * 0.03;
    // the gun's frame: x forward (pitched), y up, z the shooter's right
    const fwd = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    const zr = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const yu = new THREE.Vector3().crossVectors(zr, fwd).normalize();
    const mat = new THREE.Matrix4().makeBasis(fwd, yu, zr);
    const q0 = new THREE.Quaternion().setFromRotationMatrix(mat);
    q0.multiply(new THREE.Quaternion().setFromAxisAngle(X, pose.roll));
    const toChar = (g, q = q0, p = pos) => new THREE.Vector3(g[0], g[1], g[2]).applyQuaternion(q).add(p);
    // reach: the gun hand must be able to get there
    const wR = toChar(GRIP_R);
    const sR = R;
    const reach = (this.len.R[0] + this.len.R[1]) * 0.985;
    const v = wR.clone().sub(sR);
    if (v.length() > reach) { const fix = v.clone().multiplyScalar(reach / v.length()).sub(v); pos.add(fix); wR.add(fix); }
    // the world pose of the gun
    root.getWorldQuaternion(_wq);
    this.gunQuat.copy(_wq).multiply(q0);
    this.gunPos.copy(pos); root.localToWorld(this.gunPos);
    // ---- the support hand's target
    let wL;
    if (u > 0) {
      wL = this._track(R_HAND, u, (k0, k1, t) => {
        const at = (k) => (k.g ? toChar(k.g, q0, pos) : M.clone().add(new THREE.Vector3().fromArray(k.c)));
        return at(k0).lerp(at(k1), t);
      });
    } else wL = toChar(GRIP_L, q0, pos);
    // the mag leaves the gun at 'magout' and a fresh one rides the hand until it seats
    this.magOut = u <= 0 ? 0 : u < 0.2 ? 0 : u < 0.5 ? 1 : u < 0.58 ? 1 - sm((u - 0.5) / 0.08) : 0;
    this.magHand = u >= 0.2 && u < 0.58 ? 1 : 0;
    // ---- solve both arms
    this._arm('R', wR, M, q0, pos, HAND_R, 0.0, pose.roll);
    this._arm('L', wL, M, q0, pos, HAND_L, 0.0, pose.roll);
    this.handL.copy(wL); root.localToWorld(this.handL);
  }

  _arm(side, targetChar, M, q0, pos, hand, rollAdd, gunRoll) {
    const rig = this.rig, b = rig.b, root = rig.c.root;
    const sg = side === 'L' ? 1 : -1;
    const up = b['upperarm_' + side], fo = b['forearm_' + side], ha = b['hand_' + side], fi = b['fingers_' + side];
    const [l1, l2, l3] = this.len[side];
    const S = up.getWorldPosition(new THREE.Vector3());
    const T = root.localToWorld(targetChar.clone());
    const Sd = T.clone().sub(S);
    const dist = Math.min(Sd.length(), (l1 + l2) * 0.995);
    const dir = Sd.normalize();
    // the elbow: down and out
    const rq = root.getWorldQuaternion(new THREE.Quaternion());
    const pole = new THREE.Vector3(sg * 0.55, -1, -0.15).applyQuaternion(rq);
    pole.sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const aL = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, l1 * l1 - aL * aL));
    const E = S.clone().add(dir.clone().multiplyScalar(aL)).add(pole.multiplyScalar(h));
    const Tw = S.clone().add(dir.clone().multiplyScalar(dist));
    aimBone(up, fo, E);
    aimBone(fo, ha, Tw);
    // the hand points along the gun, a little down (and a little in for the support hand)
    const hd = new THREE.Vector3(Math.cos(hand.down) * Math.cos(hand.yaw), -Math.sin(hand.down), Math.sin(hand.yaw));
    hd.applyQuaternion(q0).applyQuaternion(rq).normalize();
    const look = Tw.clone().add(hd.multiplyScalar(l3));
    aimBone(ha, fi, look);
    rollBone(ha, fi, (side === 'R' ? this.rollR : this.rollL) + gunRoll * 0.0);
  }
}

export function mulberry(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
