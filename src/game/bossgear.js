// The bosses' rigid kit, modelled in Blender (tools/blender/boss_gear.py -> props/boss_gear.glb) and carried by the
// skeleton. Two kinds of item:
//   - WORN or GRIPPED in a way that simply follows one bone (helmets, the baton, the cleavers, the shackles, the
//     canister): placed once against the rest pose, then parented to the bone.
//   - HELD in a way no single bone explains (the riot shield on the forearm, the IV pole rolling on the floor, the
//     sledgehammer on the shoulder that swings into a slam, Omega's chains): placed every frame from the bones'
//     world positions.
// Everything here is a picture; the boss's behaviour lives in zombie.js / boss.js.
import * as THREE from 'three';
import { loadGLB } from './assets.js';
import { audio } from './audio.js';

const T = {};
export async function loadBossGear() {
  const g = await loadGLB('props/boss_gear.glb');
  for (const name of ['riot_helmet', 'riot_shield', 'baton', 'iv_pole', 'cleaver', 'hardhat', 'sledgehammer', 'shackle', 'chain_link', 'canister']) {
    const o = g.scene.getObjectByName(name);
    if (!o) continue;
    o.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true; m.receiveShadow = true;
        const mt = m.material;
        if (mt && mt.emissive && mt.emissive.getHex() !== 0) { mt.emissiveIntensity = 2.2; mt.toneMapped = false; }
        if (mt) mt.roughness = Math.max(0.18, mt.roughness);      // ⚠️ no mirrors (the bloom overflows)
      }
    });
    T[name] = o;
  }
}
const make = (name) => {
  const src = T[name];
  if (!src) return null;
  const o = src.clone(true);
  o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.setScalar(1);
  o.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
  return o;
};

// one of everything, for Game.warmUp (so no shader is compiled when the boss walks in)
export const gearPieces = () => Object.keys(T).map(make).filter(Boolean);

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const wp = (bone, v) => bone.getWorldPosition(v);

// a rotation that sends the item's +Y to `y` and its +Z (as near as possible) to `z` (world directions)
function basis(y, z, out) {
  _a.copy(y).normalize();
  _b.copy(z).addScaledVector(_a, -z.dot(_a));
  if (_b.lengthSq() < 1e-6) _b.set(_a.y, -_a.x, 0.3);
  _b.normalize();
  _c.crossVectors(_a, _b);       // x = y × z
  _m.makeBasis(_c, _a, _b);
  return out.setFromRotationMatrix(_m);
}

export class BossKit {
  constructor(z) {
    this.z = z;
    this.free = [];        // per-frame items: { o, fn }
    this.worn = [];
    this.t = 0;
    this.lastStep = 0;
    const kind = z.type, b = z.rig.b, root = z.char.root;
    root.updateMatrixWorld(true);
    this.s = root.scale.x;
    // character-frame directions in the world (the rest pose, facing z.face)
    const rq = root.quaternion;
    this.fw = new THREE.Vector3(0, 0, 1).applyQuaternion(rq);
    this.lf = new THREE.Vector3(1, 0, 0).applyQuaternion(rq);
    const wear = (bone, name, { y = [0, 1, 0], zf = [0, 0, 1], at = null, off = [0, 0, 0], k = 1 } = {}) => {
      const o = make(name);
      if (!o || !bone) return null;
      const cy = new THREE.Vector3(...y).applyQuaternion(rq), cz = new THREE.Vector3(...zf).applyQuaternion(rq);
      basis(cy, cz, o.quaternion);
      const p = at ? at.clone() : wp(bone, new THREE.Vector3());
      p.add(new THREE.Vector3(...off).applyQuaternion(rq).multiplyScalar(this.s));
      o.position.copy(p);
      o.scale.setScalar(this.s * k);
      z.game.scene.add(o);
      o.updateMatrixWorld(true);
      bone.attach(o);
      this.worn.push(o);
      return o;
    };
    const grip = (side) => wp(b[`hand_${side}`], new THREE.Vector3()).lerp(wp(b[`fingers_${side}`], new THREE.Vector3()), 0.55);
    const free = (name, k, fn) => {
      const o = make(name);
      if (!o) return null;
      o.scale.setScalar(this.s * k);
      z.game.scene.add(o);
      this.free.push({ o, fn });
      return o;
    };

    if (kind === 'warden') {
      wear(b.head, 'riot_helmet', { off: [0, 0.105, 0.012], k: 0.95 });
      // the baton forward out of the fist, the side handle up
      this.baton = free('baton', 1.0, () => this.batonPose());
      this.shield = free('riot_shield', 0.9, () => this.shieldPose());
    } else if (kind === 'patientzero') {
      this.pole = free('iv_pole', 1.0, () => this.polePose());
    } else if (kind === 'butcher') {
      // a cleaver in each fist, the blade forward, the edge down
      this.clR = wear(b.hand_R, 'cleaver', { y: [0, 0, 1], zf: [1, 0, 0], at: grip('R'), k: 1.25 });
      this.clL = wear(b.hand_L, 'cleaver', { y: [0, 0, 1], zf: [1, 0, 0], at: grip('L'), k: 1.25 });
    } else if (kind === 'foreman') {
      wear(b.head, 'hardhat', { off: [0, 0.11, 0.005], k: 0.95 });
      this.hammer = free('sledgehammer', 1.15, () => this.hammerPose());
    } else if (kind === 'omega') {
      for (const side of ['L', 'R']) {
        const el = wp(b[`forearm_${side}`], new THREE.Vector3()), wr = wp(b[`hand_${side}`], new THREE.Vector3());
        const along = wr.clone().sub(el).normalize().applyQuaternion(rq.clone().invert());
        const cuff = wear(b[`forearm_${side}`], 'shackle', { y: along.toArray(), zf: [0, 0, 1], at: el.lerp(wr, 0.86), k: side === 'R' ? 1.55 : 1.0 });
        if (cuff) this.chain(cuff, side === 'R' ? 6 : 4);
      }
      wear(b.spine04 || b.spine03, 'canister', { off: [0, 0.02, -0.17], zf: [0, 0, 1], k: 1.0 });
      // the eyes burn
      const mat = new THREE.MeshBasicMaterial({ color: 0xb6ff3a, toneMapped: false });
      const eyes = new THREE.Group();
      for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 6), mat); e.position.set(sx * 0.034, 0.065, 0.09); eyes.add(e); }
      if (b.head) { wp(b.head, eyes.position); eyes.quaternion.copy(rq); eyes.scale.setScalar(this.s * 0.82); z.game.scene.add(eyes); eyes.updateMatrixWorld(true); b.head.attach(eyes); this.worn.push(eyes); }
    }
  }

  // Omega's broken chains: a few links hanging off each cuff, a rope of points under gravity
  chain(cuff, n) {
    const links = [], pts = [];
    const start = cuff.localToWorld(new THREE.Vector3(0, -0.05, 0.07));
    for (let i = 0; i < n; i++) {
      const o = make('chain_link');
      if (!o) return;
      o.scale.setScalar(this.s * 1.3);
      this.z.game.scene.add(o);
      links.push(o);
      pts.push({ p: start.clone().add(new THREE.Vector3(0, -0.06 * this.s * (i + 1), 0)), o: start.clone().add(new THREE.Vector3(0, -0.06 * this.s * (i + 1), 0)) });
    }
    const seg = 0.058 * this.s * 1.3;
    this.free.push({ o: null, links, fn: (dt) => {
      const a0 = cuff.localToWorld(_d.set(0, -0.05, 0.07));
      const g = this.z.game;
      const ground = g.world.groundY(a0.x, a0.z) + 0.03;
      for (const q of pts) {
        const vx = (q.p.x - q.o.x) * 0.96, vy = (q.p.y - q.o.y) * 0.96, vz = (q.p.z - q.o.z) * 0.96;
        q.o.copy(q.p);
        q.p.x += vx; q.p.y += vy - 9.8 * dt * dt; q.p.z += vz;
        if (q.p.y < ground) q.p.y = ground;
      }
      for (let it = 0; it < 3; it++) {
        let prev = a0;
        for (const q of pts) {
          _a.copy(q.p).sub(prev);
          const d = _a.length() || 1e-6;
          q.p.copy(prev).addScaledVector(_a, seg / d);
          prev = q.p;
        }
      }
      let prev = a0;
      links.forEach((o, i) => {
        const q = pts[i].p;
        o.position.copy(prev).lerp(q, 0.5);
        _b.copy(q).sub(prev);
        basis(_c.set(_b.x, _b.y, _b.z), i % 2 ? this.fw : this.lf, o.quaternion);
        o.rotateY(i % 2 ? Math.PI / 2 : 0);
        prev = q;
      });
    }, dead: () => {} });
  }

  // the riot shield rides the left forearm, its face to the front
  shieldPose() {
    const b = this.z.rig.b;
    const el = wp(b.forearm_L, _a.set(0, 0, 0)).clone(), wr = wp(b.hand_L, _b).clone();
    // centred over the fist and well in front of it: the hand grips the strap BEHIND the shield, never through it
    const c = el.lerp(wr, 0.72).addScaledVector(this.fw, 0.16 * this.s);
    const o = this.shield;
    o.position.copy(c);
    _d.copy(this.fw).addScaledVector(this.lf, -0.15);
    basis(_c.copy(UP).addScaledVector(this.fw, -0.12), _d, o.quaternion);
    o.position.y -= 0.04 * this.s;
  }

  // the baton carries on from the forearm, tipped forward: low and ahead while he walks, cocked back over his head
  // in the wind-up, cracking down through the swing
  batonPose() {
    const b = this.z.rig.b;
    const el = wp(b.forearm_R, _a).clone(), h = wp(b.hand_R, _b).clone(), f = wp(b.fingers_R, _c).clone();
    const grip = h.clone().lerp(f, 0.55);
    const d = h.sub(el).normalize().multiplyScalar(0.75).addScaledVector(this.fw, 0.7).normalize();
    const o = this.baton;
    o.position.copy(grip);
    basis(d, this.lf, o.quaternion);
  }

  // the IV pole stands on its wheels beside him, leaning into the hand that pushes it
  polePose() {
    const b = this.z.rig.b, g = this.z.game;
    const h = wp(b.hand_R, _a).clone().lerp(wp(b.fingers_R, _b), 0.5);
    const base = _c.copy(h).addScaledVector(this.lf, -0.1 * this.s).addScaledVector(this.fw, 0.12 * this.s);
    base.y = g.world.groundY(base.x, base.z);
    const dir = _d.copy(h).sub(base);
    const L = dir.length();
    const o = this.pole;
    o.position.copy(base);
    basis(dir, this.fw, o.quaternion);
    o.scale.setScalar(THREE.MathUtils.clamp(L / 1.2, 0.85, 1.7));
  }

  // the sledgehammer: on the shoulder while he walks, following the forearm through the overhead slam
  hammerPose() {
    const z = this.z, b = z.rig.b, an = z.anim;
    const h = wp(b.hand_R, new THREE.Vector3()), f = wp(b.fingers_R, new THREE.Vector3());
    const grip = h.clone().lerp(f, 0.55);
    // walking, it rests on the shoulder; once the swing starts the shaft simply carries on the line from his shoulder
    // through his fists, so it travels the same arc as the arms (and overshoots into the ground with them)
    const sh = wp(b.upperarm_R, new THREE.Vector3());
    const arm = grip.clone().sub(sh).normalize();
    const A = Math.max(an.attack, an.leapU >= 0 ? 1 : 0), K = an.strike;
    const swing = Math.min(1, (A + K) * 1.4);
    const carry = new THREE.Vector3().addScaledVector(UP, 0.5).addScaledVector(this.fw, -0.85).addScaledVector(this.lf, 0.12).normalize();
    // in the swing the head leads the hands a little (a heavy head lags only on the way up)
    const d = carry.multiplyScalar(1 - swing).addScaledVector(arm, swing).addScaledVector(UP, 0.25 * an.attack * (1 - K));
    if (d.lengthSq() < 1e-4) d.copy(UP);
    d.normalize();
    const o = this.hammer;
    o.position.copy(grip);
    basis(d, this.lf, o.quaternion);
  }

  update(dt) {
    const z = this.z;
    this.t += dt;
    const rq = z.char.root.quaternion;
    this.fw.set(0, 0, 1).applyQuaternion(rq);
    this.lf.set(1, 0, 0).applyQuaternion(rq);
    if (z.state === 'dead') { this.fall(dt); return; }
    z.char.root.updateMatrixWorld(true);
    for (const it of this.free) it.fn(dt);
    // the Butcher's right cleaver leaves his hand when he throws it
    if (this.clR) this.clR.visible = !(z.anim.throwT > 0.25);
    // the Foreman's stomp: dust off each footfall, and you feel it close up
    if (z.type === 'foreman' && z.anim.stepEv !== this.lastStep) {
      this.lastStep = z.anim.stepEv;
      const g = z.game;
      for (let i = 0; i < 5; i++) g.fx.smoke.emit({ x: z.x + (Math.random() - 0.5) * 0.8, y: 0.1, z: z.z + (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 2, vy: 0.3, vz: (Math.random() - 0.5) * 2, life: 0.9, s0: 0.3, s1: 1.1, r: 0.5, g: 0.47, b: 0.42, a0: 0.3, a1: 0, drag: 2 });
      const me = g.me, d = me ? Math.hypot(me.x - z.x, me.z - z.z) : 99;
      if (d < 9) g.cam.trauma(0.07 * (1 - d / 9));
      audio.play('thunder', { x: z.x, z: z.z, vol: 0.18, rate: 2.6 });
    }
    // Patient Zero: green bile dripping from the mouth
    if (z.type === 'patientzero' && Math.random() < dt * 6 && z.rig.b.head) {
      const p = wp(z.rig.b.head, _a).addScaledVector(this.fw, 0.12 * this.s);
      z.game.fx.glow.emit({ x: p.x, y: p.y, z: p.z, vx: 0, vy: -0.4, vz: 0, life: 0.8, s0: 0.12, s1: 0.05, r: 0.4, g: 1, b: 0.2, a0: 0.8, a1: 0, grav: 9 });
    }
  }

  // dead: what he was holding drops and lies flat
  fall(dt) {
    if (!this.fell) {
      this.fell = [];
      for (const it of this.free) {
        for (const o of it.links || [it.o]) {
          if (!o) continue;
          const y = new THREE.Vector3(0, 1, 0).applyQuaternion(o.quaternion);
          y.y = 0; if (y.lengthSq() < 1e-4) y.copy(this.fw); y.normalize();
          const q1 = basis(y, UP, new THREE.Quaternion());
          this.fell.push({ o, q0: o.quaternion.clone(), q1, y0: o.position.y, t: 0 });
        }
      }
    }
    for (const f of this.fell) {
      if (f.t >= 1) continue;
      f.t = Math.min(1, f.t + dt / 0.55);
      const k = f.t * f.t;
      f.o.quaternion.slerpQuaternions(f.q0, f.q1, k);
      const gy = this.z.game.world.groundY(f.o.position.x, f.o.position.z) + 0.04;
      f.o.position.y = f.y0 + (gy - f.y0) * k;
      if (f.t >= 1) audio.play('hard', { x: f.o.position.x, z: f.o.position.z, vol: 0.4, rate: 0.7 });
    }
  }

  dispose() {
    const s = this.z.game.scene;
    for (const it of this.free) for (const o of it.links || [it.o]) if (o) s.remove(o);
    for (const o of this.worn) o.parent?.remove(o);
  }
}
