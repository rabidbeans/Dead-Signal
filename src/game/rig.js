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
  }

  fire() { this.recoil.kick(26); this.spineKick.kick(6); }
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
    rig.rot('neck', X, -lean * 0.4);
    rig.rot('head', X, -0.1 + this.aim * 0.05);
    // arms: two-handed grip in front of the chest, or low ready
    const a = this.aim;
    const rec = this.recoil.x * 0.012;
    const rl = this.reload > 0 ? Math.sin(Math.min(1, this.reload) * Math.PI) : 0;
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? 1 : -1;
      rig.rot(`upperarm_${side}`, Z, -sg * 0.82);
      // raise forward: aiming ~ shoulder height, low ready ~ 40°
      rig.rot(`upperarm_${side}`, X, -(0.55 + a * 0.58) + rec + rl * 0.35 * (side === 'L' ? 1 : 0.3));
      // bring both hands to the centre line
      rig.rot(`upperarm_${side}`, Y, -sg * (0.2 + a * 0.12));
      rig.rot(`forearm_${side}`, X, -(0.5 - a * 0.35) - rec * 0.6 - rl * 0.35);
      rig.rot(`forearm_${side}`, Y, -sg * 0.32);
      rig.rot(`hand_${side}`, X, -rec * 1.2);
      rig.rot(`fingers_${side}`, X, 0.9);
    }
    // swing the free arm a little when running without aiming
    rig.rot('upperarm_L', X, Math.sin(this.phase * TAU) * 0.2 * run * (1 - a));
    rig.apply();
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
