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
import { mulberry } from './rig.js';

const T = {};
export async function loadBossGear() {
  const g = await loadGLB('props/boss_gear.glb');
  for (const name of ['riot_helmet', 'riot_shield', 'baton', 'iv_pole', 'cleaver', 'hardhat', 'sledgehammer', 'shackle', 'chain_link', 'canister', 'holster', 'combat_helmet']) {
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
export const gearPieces = () => [...Object.keys(T).map(make).filter(Boolean), hairPiece()];
// a scrap of hair with the hair's own material, so its shader is compiled behind the loading screen too
function hairPiece() {
  const geo = new THREE.PlaneGeometry(0.1, 0.3);
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(0.6), 3));
  return new THREE.Mesh(geo, hairMaterial(0x6a260d));
}
function hairMaterial(color) {
  // blended, and NOT written to depth: the ink outline (engine.js, edges in the depth buffer) would draw every ribbon
  // as a paper cut-out; the body still hides the hair behind it (depth TEST stays on)
  return new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: hairTex(), transparent: true, depthWrite: false, alphaTest: 0.04, side: THREE.DoubleSide, roughness: 0.55, metalness: 0 });
}

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
      // (no helmet since her redesign: the hair is the silhouette)
      this.hair = new Hair(z, { n: 110, seg: 10, len: 0.9, color: 0x6a260d });
      // her sidearm in its duty holster on the right hip, riding the pelvis
      wear(b.root, 'holster', { at: wp(b.thigh_R, new THREE.Vector3()), off: [-0.105, 0.075, 0.0], zf: [0, 0, 1], k: 1.0 });
      // the baton forward out of the fist, the side handle up
      this.baton = free('baton', 1.0, () => this.batonPose());
      this.shield = free('riot_shield', 0.76, () => this.shieldPose());
    } else if (kind === 'patientzero') {
      this.pole = free('iv_pole', 1.0, () => this.polePose());
    } else if (kind === 'butcher') {
      // a cleaver in each fist, the blade forward, the edge down
      this.clR = wear(b.hand_R, 'cleaver', { y: [0, 0, 1], zf: [1, 0, 0], at: grip('R'), k: 1.25 });
      this.clL = wear(b.hand_L, 'cleaver', { y: [0, 0, 1], zf: [1, 0, 0], at: grip('L'), k: 1.25 });
    } else if (kind === 'screamer') {
      // long black hair hanging over her face, thrown back when she screams
      this.hair = new Hair(z, { n: 64, seg: 8, len: 0.72, color: 0x0c0909 });
    } else if (kind === 'soldier') {
      wear(b.head, 'combat_helmet', { off: [0, 0.105, 0.0], k: 1.02 });
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
    // carried at her side it turns edge-on, its face outward, and only swings round to face the front when she raises
    // it (the charge and its set)
    const an = this.z.anim, up = Math.max(an.chargeS, an.move === 'charge' ? an.attack : 0);
    const c = el.lerp(wr, 0.72).addScaledVector(this.fw, 0.16 * this.s * up).addScaledVector(this.lf, 0.09 * this.s * (1 - up));
    const o = this.shield;
    o.position.copy(c);
    _d.copy(this.fw).multiplyScalar(up + 0.25 * (1 - up)).addScaledVector(this.lf, -0.15 * up + (1 - up));
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
    z.char.root.updateMatrixWorld(true);
    this.hair?.update(dt);
    if (z.state === 'dead') { this.fall(dt); return; }
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
    this.hair?.dispose();
    const s = this.z.game.scene;
    for (const it of this.free) for (const o of it.links || [it.o]) if (o) s.remove(o);
    for (const o of this.worn) o.parent?.remove(o);
  }
}

// Long hair: strands of points hung off the scalp (a verlet rope each, the first point riding the head bone), kept off
// the skull and the shoulders, drawn as camera-facing ribbons in ONE mesh. It hangs down her back walking, swings as she
// turns, streams out behind her in the charge and falls with her. ~550 points: nothing for a phone.
let HAIR_TEX = null;
function hairTex() {
  if (HAIR_TEX) return HAIR_TEX;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 256);
  // a body of hair under the strands, thinning to wisps at the edges and the ends
  const bg = g.createLinearGradient(0, 0, 64, 0);
  bg.addColorStop(0, 'rgba(255,255,255,0)'); bg.addColorStop(0.2, 'rgba(255,255,255,0.75)'); bg.addColorStop(0.8, 'rgba(255,255,255,0.75)'); bg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = bg; g.fillRect(0, 0, 64, 200);
  const fade = g.createLinearGradient(0, 150, 0, 256);
  fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = fade; g.fillRect(0, 150, 64, 106); g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 70; i++) {
    const x = 3 + Math.random() * 58, w = 0.8 + Math.random() * 1.8, l = 0.55 + Math.random() * 0.45;
    const a = 0.55 + Math.random() * 0.45;
    const gr = g.createLinearGradient(0, 0, 0, 256 * l);
    gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.85, `rgba(255,255,255,${a * 0.8})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = gr; g.lineWidth = w;
    g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (Math.random() - 0.5) * 6, 90, x + (Math.random() - 0.5) * 8, 170, x + (Math.random() - 0.5) * 10, 256 * l); g.stroke();
  }
  HAIR_TEX = new THREE.CanvasTexture(c);
  HAIR_TEX.colorSpace = THREE.SRGBColorSpace;
  return HAIR_TEX;
}

const _h0 = new THREE.Vector3(), _h1 = new THREE.Vector3(), _h2 = new THREE.Vector3(), _h3 = new THREE.Vector3();
class Hair {
  constructor(z, { n = 60, seg = 9, len = 0.6, color = 0xa4441a } = {}) {
    this.z = z;
    const b = z.rig.b, head = b.head, s = z.char.root.scale.x;
    this.s = s;
    z.char.root.updateMatrixWorld(true);
    const rq = z.char.root.quaternion;
    const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(rq), lf = new THREE.Vector3(1, 0, 0).applyQuaternion(rq), up = new THREE.Vector3(0, 1, 0);
    const hs = head.scale.x;
    // the skull, in the head bone's own frame (so it nods and turns with the head)
    const cW = wp(head, new THREE.Vector3()).addScaledVector(up, 0.088 * s * hs).addScaledVector(fw, 0.005 * s);
    this.cL = head.worldToLocal(cW.clone());
    this.rHead = 0.104 * s * hs;
    this.roots = []; this.dirs = []; this.backK = [];
    const rng = mulberry(424);
    let tries = 0;
    while (this.roots.length < n && tries++ < 5000) {
      // a hair line round the back and sides of the head and over the crown, never the face
      const az = (rng() - 0.5) * Math.PI * 2, el = -0.25 + rng() * 1.55;
      const d = new THREE.Vector3().addScaledVector(fw, Math.cos(az) * Math.cos(el)).addScaledVector(lf, Math.sin(az) * Math.cos(el)).addScaledVector(up, Math.sin(el));
      // (the sides come further forward, down to the temples, so the hair frames the face)
      const sideK = Math.abs(Math.sin(az));
      if (d.dot(fw) > 0.2 + 0.4 * sideK * (el < 0.55 ? 1 : 0) - 0.45 * Math.max(0, Math.sin(el) - 0.6)) continue;
      const p = cW.clone().addScaledVector(d, this.rHead * 0.97);
      this.roots.push(head.worldToLocal(p.clone()));
      this.backK.push(d.dot(fw) > -0.05 ? 0.05 : 0.6);      // the front strands fall straight down past the face
      this.dirs.push(head.worldToLocal(p.clone().add(d)).sub(head.worldToLocal(p.clone())).normalize());
    }
    this.n = this.roots.length; this.seg = seg;
    this.len = [];
    for (let i = 0; i < this.n; i++) this.len.push(len * s * (0.78 + rng() * 0.32) / seg);
    // points, in the world
    const P = this.P = new Float32Array(this.n * (seg + 1) * 3), O = this.O = new Float32Array(P.length);
    for (let i = 0; i < this.n; i++) {
      const r = head.localToWorld(this.roots[i].clone());
      for (let k = 0; k <= seg; k++) { const j = (i * (seg + 1) + k) * 3; P[j] = r.x; P[j + 1] = r.y - k * this.len[i]; P[j + 2] = r.z; }       // (O: velocities, from rest)
    }
    // the ribbons
    const nv = this.n * (seg + 1) * 2;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(nv * 3);
    const uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3), idx = [];
    const base = new THREE.Color(color);
    for (let i = 0; i < this.n; i++) {
      const tone = 0.7 + rng() * 0.5;
      for (let k = 0; k <= seg; k++) {
        const v = (i * (seg + 1) + k) * 2, t = k / seg;
        const u0 = (i % 4) * 0.25;
        uv.set([u0, t, u0 + 0.25, t], v * 2);
        const sh = tone * (0.55 + 0.6 * t);         // darker at the roots, lighter at the ends
        for (const q of [v, v + 1]) col.set([base.r * sh, base.g * sh, base.b * sh], q * 3);
        if (k < seg) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = hairMaterial(color);
    this.nrm = geo.attributes.normal.array;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    z.game.scene.add(this.mesh);
    this.width = 0.052 * s;
    this.t = 0;
  }

  // the body the hair must stay outside: the skull, the neck and the upper back, as spheres in the world
  bodySpheres() {
    const b = this.z.rig.b, s = this.s;
    const list = this.sph ??= [{ c: new THREE.Vector3(), r: 0 }, { c: new THREE.Vector3(), r: 0 }, { c: new THREE.Vector3(), r: 0 }, { c: new THREE.Vector3(), r: 0 }];
    b.head.localToWorld(list[0].c.copy(this.cL)); list[0].r = this.rHead * 1.04;
    wp(b.neck, list[1].c); list[1].r = 0.075 * s;
    wp(b.spine03 || b.spine02, list[2].c); list[2].r = 0.16 * s;
    wp(b.spine02 || b.spine01, list[3].c); list[3].r = 0.15 * s;
    return list;
  }

  update(dt) {
    if (dt <= 0) return;
    const z = this.z, head = z.rig.b.head, P = this.P, O = this.O, seg = this.seg;
    this.back = (this.back ?? new THREE.Vector3()).set(0, 0, -1).applyQuaternion(z.char.root.quaternion);
    this.t += dt;
    const h = Math.min(dt, 1 / 30);
    const sph = this.bodySpheres();
    const ground = z.game.side?.active ? 0 : z.game.world.groundY(z.x, z.z);
    // Dynamic follow-the-leader (Mueller et al. 2012, the method made for hair): predict every point, then walk down
    // the strand putting each one back at its length from the one above, and give each point back the velocity it
    // was moved by, minus most of what its child was corrected by (that term is what keeps a long strand from
    // whipping itself up; a plain verlet rope did).
    const D = this.D ??= new Float32Array(P.length);
    const ih = 1 / h, gdt = -9.8 * h;
    const wx = Math.sin(this.t * 0.7) * 0.5 * h, wz = Math.cos(this.t * 0.53) * 0.5 * h;
    for (let i = 0; i < this.n; i++) {
      const r = head.localToWorld(_h0.copy(this.roots[i]));
      const d = _h1.copy(this.dirs[i]).transformDirection(head.matrixWorld);
      const L = this.len[i];
      // the comb direction: straight down, and back off the face, flattened onto the scalp
      _h2.set(0, -1, 0).addScaledVector(this.back, this.backK[i]);
      _h2.addScaledVector(d, -_h2.dot(d)).normalize();
      const j0 = i * (seg + 1) * 3;
      P[j0] = r.x; P[j0 + 1] = r.y; P[j0 + 2] = r.z;
      for (let k = 1; k <= seg; k++) {
        const j = j0 + k * 3;
        // predict (O holds the velocity here)
        O[j] *= 0.985; O[j + 1] = O[j + 1] * 0.985 + gdt; O[j + 2] *= 0.985;
        const px = P[j] + (O[j] + wx) * h, py = P[j + 1] + O[j + 1] * h, pz = P[j + 2] + (O[j + 2] + wz) * h;
        let dx = px - P[j - 3], dy = py - P[j - 2], dz = pz - P[j - 1];
        // the first piece leaves the scalp combed down and back, lifting off it only a little
        if (k === 1) { dx = dx * 0.25 + (_h2.x * 0.85 + d.x * 0.15) * L; dy = dy * 0.25 + (_h2.y * 0.85 + d.y * 0.15) * L; dz = dz * 0.25 + (_h2.z * 0.85 + d.z * 0.15) * L; }
        const len = Math.hypot(dx, dy, dz) || 1e-6, f = L / len;
        let nx = P[j - 3] + dx * f, ny = P[j - 2] + dy * f, nz = P[j - 1] + dz * f;
        for (const sp of sph) {
          const ex = nx - sp.c.x, ey = ny - sp.c.y, ez = nz - sp.c.z, e = Math.hypot(ex, ey, ez);
          if (e < sp.r && e > 1e-6) { const q = sp.r / e; nx = sp.c.x + ex * q; ny = sp.c.y + ey * q; nz = sp.c.z + ez * q; }
        }
        if (ny < ground + 0.02) ny = ground + 0.02;
        D[j] = nx - px; D[j + 1] = ny - py; D[j + 2] = nz - pz;            // how far the strand moved this point
        O[j] = (nx - P[j]) * ih; O[j + 1] = (ny - P[j + 1]) * ih; O[j + 2] = (nz - P[j + 2]) * ih;
        P[j] = nx; P[j + 1] = ny; P[j + 2] = nz;
      }
      // the follow-the-leader damping: take back most of the child's correction from each point's velocity
      for (let k = 1; k < seg; k++) {
        const j = j0 + k * 3, c = j + 3;
        O[j] -= 0.9 * D[c] * ih; O[j + 1] -= 0.9 * D[c + 1] * ih; O[j + 2] -= 0.9 * D[c + 2] * ih;
      }
    }
    // ribbons facing the camera
    const cam = z.game.camera.position, pos = this.pos;
    for (let i = 0; i < this.n; i++) {
      for (let k = 0; k <= seg; k++) {
        const j = (i * (seg + 1) + k) * 3;
        const a = Math.max(0, k - 1), bq = Math.min(seg, k + 1);
        const ja = (i * (seg + 1) + a) * 3, jb = (i * (seg + 1) + bq) * 3;
        _h2.set(P[jb] - P[ja], P[jb + 1] - P[ja + 1], P[jb + 2] - P[ja + 2]);
        _h3.set(cam.x - P[j], cam.y - P[j + 1], cam.z - P[j + 2]);
        _h2.cross(_h3).normalize();
        const t = k / seg, w = this.width * (0.45 + 0.55 * Math.sin(Math.min(1, t * 3) * Math.PI / 2)) * (1 - 0.4 * t) * 0.5;   // fine at the root, fullest a little way down
        const v = (i * (seg + 1) + k) * 2 * 3;
        pos[v] = P[j] - _h2.x * w; pos[v + 1] = P[j + 1] - _h2.y * w; pos[v + 2] = P[j + 2] - _h2.z * w;
        pos[v + 3] = P[j] + _h2.x * w; pos[v + 4] = P[j + 1] + _h2.y * w; pos[v + 5] = P[j + 2] + _h2.z * w;
        _h3.normalize();
        this.nrm[v] = this.nrm[v + 3] = _h3.x; this.nrm[v + 1] = this.nrm[v + 4] = _h3.y; this.nrm[v + 2] = this.nrm[v + 5] = _h3.z;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.normal.needsUpdate = true;
  }

  dispose() { this.z.game.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
