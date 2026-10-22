// Every particle, streak, decal and flash. Pooled: nothing is allocated
// after start-up, and each system is one draw call.
import * as THREE from 'three';
import { tex } from './assets.js';
import { Q } from './quality.js';

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const _eu = new THREE.Euler();

// ------------------------------------------------------------ particles --
class Particles {
  constructor(scene, { map, max = 256, additive = false, depthTest = true }) {
    this.max = max;
    this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.rot = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uMap: { value: map }, uScale: { value: 400 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      depthTest,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `
        attribute vec4 aColor; attribute float aSize; attribute float aRot;
        uniform float uScale; varying vec4 vC; varying float vR;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uScale / max(0.1, -mv.z); vC = aColor; vR = aRot; }`,
      fragmentShader: `
        uniform sampler2D uMap; varying vec4 vC; varying float vR;
        void main(){ vec2 p = gl_PointCoord - 0.5; float c = cos(vR), s = sin(vR);
          p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
          vec4 t = texture2D(uMap, p); gl_FragColor = vec4(vC.rgb * t.rgb, vC.a * t.a); }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.p = [];
    for (let i = 0; i < max; i++) this.p.push({ alive: false });
    this.cursor = 0;
  }

  emit(o) {
    const p = this.p[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    p.alive = true;
    p.x = o.x; p.y = o.y; p.z = o.z;
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.life = 0; p.max = o.life || 1;
    p.s0 = o.s0 ?? 0.2; p.s1 = o.s1 ?? p.s0;
    p.r = o.r ?? 1; p.g = o.g ?? 1; p.b = o.b ?? 1;
    p.a0 = o.a0 ?? 1; p.a1 = o.a1 ?? 0;
    p.grav = o.grav || 0; p.drag = o.drag || 0;
    p.rot = o.rot ?? Math.random() * 6.28; p.spin = o.spin || 0;
    p.floor = o.floor ?? -1;
    p.onLand = o.onLand || null;
    return p;
  }

  update(dt, scale) {
    this.uniforms.uScale.value = scale;
    let n = 0;
    for (const p of this.p) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.max) { p.alive = false; continue; }
      p.vy -= p.grav * dt;
      const dr = Math.max(0, 1 - p.drag * dt);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.spin * dt;
      if (p.floor >= 0 && p.y < p.floor) {
        p.y = p.floor;
        if (p.onLand) { p.onLand(p); p.onLand = null; }
        p.alive = false;
        continue;
      }
      const k = p.life / p.max;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.col[n * 4] = p.r; this.col[n * 4 + 1] = p.g; this.col[n * 4 + 2] = p.b;
      this.col[n * 4 + 3] = p.a0 + (p.a1 - p.a0) * k;
      this.size[n] = p.s0 + (p.s1 - p.s0) * k;
      this.rot[n] = p.rot;
      n++;
    }
    this.n = n;
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    for (const a of ['position', 'aColor', 'aSize', 'aRot']) g.attributes[a].needsUpdate = true;
  }
}

// --------------------------------------------------------------- streaks --
// Camera-facing ribbons from A to B: tracers, sparks, rain.
class Streaks {
  constructor(scene, max, { additive = true, color = 0xffffff, map = null, taper = true } = {}) {
    this.max = max;
    const base = new THREE.PlaneGeometry(1, 2);
    base.translate(0.5, 0, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.attributes.position = base.attributes.position;
    g.attributes.uv = base.attributes.uv;
    this.a = new Float32Array(max * 3);
    this.b = new Float32Array(max * 3);
    this.w = new Float32Array(max);
    this.c = new Float32Array(max * 4);
    g.setAttribute('iA', new THREE.InstancedBufferAttribute(this.a, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iB', new THREE.InstancedBufferAttribute(this.b, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iW', new THREE.InstancedBufferAttribute(this.w, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iC', new THREE.InstancedBufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: `
        attribute vec3 iA; attribute vec3 iB; attribute float iW; attribute vec4 iC;
        varying vec4 vC; varying vec2 vUv;
        void main(){
          vec4 a = modelViewMatrix * vec4(iA, 1.0); vec4 b = modelViewMatrix * vec4(iB, 1.0);
          vec3 d = b.xyz - a.xyz; float L = length(d);
          vec3 side = normalize(cross(d / max(L, 1e-4), vec3(0.0, 0.0, 1.0)));
          vec3 p = mix(a.xyz, b.xyz, position.x) + side * position.y * 0.5 * iW;
          gl_Position = projectionMatrix * vec4(p, 1.0); vC = iC; vUv = vec2(position.x, position.y * 0.5 + 0.5);
        }`,
      fragmentShader: `
        uniform vec3 uColor; varying vec4 vC; varying vec2 vUv;
        void main(){ float across = 1.0 - abs(vUv.y * 2.0 - 1.0); float along = ${taper ? 'smoothstep(0.0, 0.35, vUv.x)' : '1.0'};
          gl_FragColor = vec4(uColor * vC.rgb, vC.a * across * across * along); }`,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.g = g;
    this.list = [];
  }

  push(s) { if (this.list.length < this.max) this.list.push(s); }

  // writes the current list (caller fills ax..bz, w, r g b a)
  flush() {
    const n = this.list.length;
    for (let i = 0; i < n; i++) {
      const s = this.list[i];
      this.a.set([s.ax, s.ay, s.az], i * 3);
      this.b.set([s.bx, s.by, s.bz], i * 3);
      this.w[i] = s.w;
      this.c.set([s.r, s.g, s.b, s.a], i * 4);
    }
    this.g.instanceCount = n;
    for (const k of ['iA', 'iB', 'iW', 'iC']) this.g.attributes[k].needsUpdate = true;
  }
}

// ---------------------------------------------------------------- decals --
class Decals {
  constructor(scene, map, max, { y = 0.02, normal = false, opacity = 1, size = 1, rough = 0.25, gy = null } = {}) {
    this.gy = gy;
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({
      map, transparent: true, depthWrite: false, roughness: rough, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -4, opacity,
    });
    this.mesh = new THREE.InstancedMesh(g, m, max);
    this.mesh.count = 0;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.max = max;
    this.items = [];
    this.cursor = 0;
    this.y = y;
  }

  add(x, z, size, rot = Math.random() * 6.28, grow = 0, y = null, nx = 0, nz = 0, aspect = 1) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.mesh.count = Math.min(this.max, Math.max(this.mesh.count, i + 1));
    const it = { x, z, size, rot, grow, t: 0, y: y ?? ((this.gy ? this.gy(x, z) : 0) + this.y + (i % 7) * 0.0006), nx, nz, aspect };
    this.items[i] = it;
    this.write(i, grow ? 0.05 : 1);
  }

  write(i, k) {
    const it = this.items[i];
    _v.set(it.x, it.y, it.z);
    if (it.nx || it.nz) {
      // a wall decal: face along the wall normal
      _q.setFromUnitVectors(UP, _s.set(it.nx, 0, it.nz));
      const r = new THREE.Quaternion().setFromAxisAngle(_s, it.rot);
      _q.premultiply(r);
    } else {
      _q.setFromAxisAngle(UP, it.rot);
    }
    _s.set(it.size * k * (it.aspect || 1), 1, it.size * k);
    _m.compose(_v, _q, _s);
    this.mesh.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    this.items.forEach((it, i) => {
      if (!it || !it.grow || it.t >= it.grow) return;
      it.t += dt;
      const k = 1 - Math.pow(1 - Math.min(1, it.t / it.grow), 3);
      this.write(i, 0.05 + 0.95 * k);
    });
  }
}

// ---------------------------------------------------------------- the FX --
export class FX {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    const soft = tex('tex/soft.webp');
    this.mist = new Particles(scene, { map: tex('tex/smoke.webp'), max: 160 });
    this.drops = new Particles(scene, { map: soft, max: 400 });
    this.smoke = new Particles(scene, { map: tex('tex/smoke.webp'), max: 220 });
    this.fire = new Particles(scene, { map: soft, max: 520, additive: true });
    this.glow = new Particles(scene, { map: soft, max: 64, additive: true });
    this.sparks = new Streaks(scene, 160);
    this.tracers = new Streaks(scene, 48, { color: 0xffffff });
    // lightning (the HORNET's shock rounds): flat, jagged, re-struck every few frames
    this.bolts = new Streaks(scene, 220, { color: 0xffffff, taper: false });
    this.boltList = [];
    this.rain = new Streaks(scene, Q.rain + 40, { additive: false, color: 0xa9b8cc });
    this.sparkList = [];
    this.tracerList = [];
    const gy = (x, z) => world.groundY(x, z);
    this.blood = [0, 1, 2, 3].map((i) => new Decals(scene, tex(`tex/blood${i}.webp`), 60, { y: 0.025, rough: 0.28, gy }));
    this.pools = new Decals(scene, tex('tex/pool.webp'), 60, { y: 0.022, rough: 0.2, gy });
    this.holes = new Decals(scene, tex('tex/hole.webp'), 80, { y: 0.03, rough: 0.9 });
    // ground ripples from rain
    const rg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.ripples = new THREE.InstancedMesh(rg, new THREE.MeshBasicMaterial({ map: tex('tex/ripple.webp'), transparent: true, depthWrite: false, opacity: 0.18, color: 0x9fb2c8 }), 90);
    this.ripples.frustumCulled = false;
    scene.add(this.ripples);
    this.rip = [];
    for (let i = 0; i < 90; i++) this.rip.push({ t: Math.random(), x: 0, z: 0, s: 0.3 });
    // brass
    const sg = new THREE.CylinderGeometry(0.0045, 0.0045, 0.019, 6).rotateZ(Math.PI / 2);
    this.shells = new THREE.InstancedMesh(sg, new THREE.MeshStandardMaterial({ color: 0xb08a3c, metalness: 1, roughness: 0.3 }), 60);
    this.shells.frustumCulled = false;
    this.shells.count = 0;
    scene.add(this.shells);
    this.shellList = [];
    this.shellCursor = 0;
    // muzzle flashes
    this.flashes = [];
    const star = new THREE.MeshBasicMaterial({ map: tex('tex/muzzle.webp'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffffff });
    const side = new THREE.MeshBasicMaterial({ map: tex('tex/muzzle_side.webp'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const s1 = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42).rotateX(-Math.PI / 2), star);
      const s2 = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.22).translate(0.27, 0, 0), side);
      const s3 = s2.clone();
      s3.rotation.x = Math.PI / 2;
      g.add(s1, s2, s3);
      g.visible = false;
      scene.add(g);
      this.flashes.push({ g, t: 0 });
    }
    // (a muzzle flash lights the street through the local player's lantern: see Player.update; a light of
    // its own would be paid for on every lit pixel of every frame, shots or not)
    this.flash = { x: 0, y: 0, z: 0, t: 1 };
    this.time = 0;
    this.poolPts = [];
  }

  makeDecals(file, max, o = {}) {
    return new Decals(this.scene, tex(`tex/${file}.webp`), max, { y: 0.01, gy: null, ...o });
  }

  // ---- shots --------------------------------------------------------
  muzzle(x, y, z, dirx, dirz) {
    const f = this.flashes.find((q) => !q.g.visible) || this.flashes[0];
    f.g.visible = true;
    f.t = 0;
    f.g.position.set(x, y, z);
    f.g.rotation.set(0, Math.atan2(-dirz, dirx), 0);
    const s = 0.8 + Math.random() * 0.45;
    f.g.scale.set(s, s, s);
    f.g.children[0].rotation.y = Math.random() * 6.28;
    f.g.children[1].rotation.x = Math.random() * 6.28;
    this.flash.x = x + dirx * 0.3; this.flash.y = y + 0.15; this.flash.z = z + dirz * 0.3; this.flash.t = 0;
    // a puff of gun smoke that lingers in the rain
    for (let i = 0; i < 2; i++) {
      this.smoke.emit({ x: x + dirx * 0.2, y, z: z + dirz * 0.2, vx: dirx * (1.2 + Math.random()), vy: 0.3, vz: dirz * (1.2 + Math.random()), life: 0.9, s0: 0.15, s1: 0.7, r: 0.6, g: 0.6, b: 0.62, a0: 0.16, a1: 0, drag: 3 });
    }
  }

  // col: [r, g, b] (a prototype gun's rounds are its own colour)
  tracer(x0, y, z0, x1, z1, y1 = y, col = null) {
    const len = Math.hypot(x1 - x0, z1 - z0, y1 - y) || 1e-3;
    this.tracerList.push({ x0, z0, y, dx: (x1 - x0) / len, dz: (z1 - z0) / len, dy: (y1 - y) / len, len, d: 0.3, speed: 140, c: col });
  }

  // a jagged arc of lightning from A to B, struck again every few frames while it lives
  bolt(x0, y0, z0, x1, y1, z1, col = [0.55, 0.85, 1], life = 0.18) {
    this.boltList.push({ x0, y0, z0, x1, y1, z1, c: col, t: 0, life, pts: null, rt: 0 });
    this.glow.emit({ x: x1, y: y1, z: z1, life: 0.12, s0: 0.9, s1: 0.3, r: col[0], g: col[1], b: col[2], a0: 0.9, a1: 0 });
  }

  shell(x, y, z, dirx, dirz) {
    // eject to the right of the aim (aim + 100..150°), up and back
    const a = Math.atan2(dirz, dirx) - (1.75 + Math.random() * 0.6);
    const sp = 2 + Math.random() * 1.2;
    const s = { x, y, z, vx: Math.cos(a) * sp, vy: 2.2 + Math.random(), vz: Math.sin(a) * sp, rx: Math.random() * 6, ry: Math.random() * 6, spin: 20 + Math.random() * 20, bounces: 0, rest: false, cb: null };
    const i = this.shellCursor;
    this.shellCursor = (this.shellCursor + 1) % 60;
    this.shellList[i] = s;
    this.shells.count = Math.max(this.shells.count, i + 1);
    return s;
  }

  // ---- impacts ------------------------------------------------------
  flesh(x, y, z, dirx, dirz, strength = 1, crit = false) {
    const n = Math.floor((crit ? 18 : 9) * strength);
    for (let i = 0; i < n; i++) {
      // exit spray: a 25° cone along the bullet
      const a = Math.atan2(dirz, dirx) + (Math.random() - 0.5) * 0.9;
      const sp = 2 + Math.random() * 4.5 * strength;
      const dark = 0.12 + Math.random() * 0.14;
      this.drops.emit({
        x, y, z, vx: Math.cos(a) * sp, vy: 0.5 + Math.random() * 2.5, vz: Math.sin(a) * sp,
        life: 1.2, s0: 0.035 + Math.random() * 0.04, s1: 0.02, r: dark * 1.6, g: dark * 0.12, b: dark * 0.1, a0: 1, a1: 0.9,
        grav: 14, floor: this.world.groundY(x, z) + 0.03,
        onLand: Math.random() < 0.18 ? (p) => this.splat(p.x, p.z, 0.18 + Math.random() * 0.2) : null,
      });
    }
    // the mist puff
    this.mist.emit({ x, y, z, vx: dirx * 0.8, vy: 0.2, vz: dirz * 0.8, life: 0.35, s0: 0.2, s1: crit ? 0.9 : 0.6, r: 0.22, g: 0.02, b: 0.02, a0: 0.55, a1: 0, drag: 4 });
    if (crit) this.mist.emit({ x, y: y + 0.2, z, vx: dirx * 1.6, vy: 0.4, vz: dirz * 1.6, life: 0.5, s0: 0.3, s1: 1.2, r: 0.18, g: 0.015, b: 0.015, a0: 0.5, a1: 0, drag: 3 });
    // the floor splat lands 1-2 m behind
    const back = 1 + Math.random();
    this.splat(x + dirx * back, z + dirz * back, (0.6 + Math.random() * 0.5) * (crit ? 1.4 : 1));
  }

  splat(x, z, size) {
    const d = this.blood[(Math.random() * 4) | 0];
    d.add(x, z, size);
  }

  pool(x, z) {
    this.pools.add(x, z, 1.6 + Math.random() * 0.8, Math.random() * 6.28, 3.0);
    // (where the pools are: walking through one leaves bloody boot prints, juice.js)
    this.poolPts.push({ x, z });
    if (this.poolPts.length > 40) this.poolPts.shift();
  }

  hard(x, y, z, nx, nz, dirx, dirz) {
    // sparks off the surface (reflected around the normal) + dust + a hole
    const dot = dirx * nx + dirz * nz;
    const rx = dirx - 2 * dot * nx, rz = dirz - 2 * dot * nz;
    for (let i = 0; i < 6; i++) {
      const a = Math.atan2(rz, rx) + (Math.random() - 0.5) * 1.6;
      const sp = 4 + Math.random() * 6;
      this.sparkList.push({ x, y, z, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 3, vz: Math.sin(a) * sp, t: 0, max: 0.08 + Math.random() * 0.1 });
    }
    this.smoke.emit({ x, y, z, vx: nx * 0.6, vy: 0.3, vz: nz * 0.6, life: 0.6, s0: 0.1, s1: 0.5, r: 0.55, g: 0.53, b: 0.5, a0: 0.35, a1: 0, drag: 3 });
    this.glow.emit({ x, y, z, life: 0.06, s0: 0.35, s1: 0.1, r: 1, g: 0.75, b: 0.4, a0: 0.9, a1: 0 });
    this.holes.add(x + nx * 0.02, z + nz * 0.02, 0.12, Math.random() * 6.28, 0, y, nx, nz);
  }

  // ---- per frame ---------------------------------------------------
  update(dt, cam, focus, scale, wind) {
    this.time += dt;
    // muzzle flashes live 1-2 frames (~33 ms)
    for (const f of this.flashes) {
      if (!f.g.visible) continue;
      f.t += dt;
      if (f.t > 0.034) f.g.visible = false;
    }
    this.flash.t += dt;
    // tracers: 2 m streaks moving at 140 m/s
    this.tracers.list.length = 0;
    this.tracerList = this.tracerList.filter((t) => {
      t.d += t.speed * dt;
      const head = Math.min(t.len, t.d), tail = Math.max(0, t.d - 2.2);
      if (tail >= t.len) return false;
      const c = t.c;
      this.tracers.push({ ax: t.x0 + t.dx * tail, ay: t.y + t.dy * tail, az: t.z0 + t.dz * tail, bx: t.x0 + t.dx * head, by: t.y + t.dy * head, bz: t.z0 + t.dz * head, w: c ? 0.05 : 0.035, r: c ? c[0] : 1, g: c ? c[1] : 0.72, b: c ? c[2] : 0.38, a: 0.9 });
      return true;
    });
    this.tracers.flush();
    // lightning: 7 kinks, re-struck every ~40 ms, a bright core over a wide glow
    this.bolts.list.length = 0;
    this.boltList = this.boltList.filter((b) => {
      b.t += dt; b.rt -= dt;
      if (b.t > b.life) return false;
      if (!b.pts || b.rt <= 0) {
        b.rt = 0.04;
        const n = 7, pts = [];
        const L = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) || 1;
        for (let i = 0; i <= n; i++) {
          const u = i / n, j = i === 0 || i === n ? 0 : (Math.random() - 0.5) * Math.min(1.2, L * 0.25);
          pts.push([b.x0 + (b.x1 - b.x0) * u + j * (b.z1 - b.z0) / L, b.y0 + (b.y1 - b.y0) * u + (Math.random() - 0.5) * 0.3 * (i % n ? 1 : 0), b.z0 + (b.z1 - b.z0) * u - j * (b.x1 - b.x0) / L]);
        }
        b.pts = pts;
      }
      const a = 1 - b.t / b.life;
      for (let i = 0; i < b.pts.length - 1; i++) {
        const p = b.pts[i], q = b.pts[i + 1];
        this.bolts.push({ ax: p[0], ay: p[1], az: p[2], bx: q[0], by: q[1], bz: q[2], w: 0.28, r: b.c[0] * 0.5, g: b.c[1] * 0.5, b: b.c[2] * 0.5, a: 0.6 * a });
        this.bolts.push({ ax: p[0], ay: p[1], az: p[2], bx: q[0], by: q[1], bz: q[2], w: 0.07, r: 1, g: 1, b: 1, a: a });
      }
      return true;
    });
    this.bolts.flush();
    // sparks
    this.sparks.list.length = 0;
    this.sparkList = this.sparkList.filter((s) => {
      s.t += dt;
      if (s.t > s.max) return false;
      s.vy -= 9 * dt;
      const x0 = s.x, y0 = s.y, z0 = s.z;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      const k = 1 - s.t / s.max;
      this.sparks.push({ ax: x0 - s.vx * 0.02, ay: y0 - s.vy * 0.02, az: z0 - s.vz * 0.02, bx: s.x, by: s.y, bz: s.z, w: 0.025, r: 1, g: 0.8, b: 0.45, a: k });
      return true;
    });
    this.sparks.flush();
    // brass
    for (let i = 0; i < this.shellList.length; i++) {
      const s = this.shellList[i];
      if (!s) continue;
      if (!s.rest) {
        s.vy -= 12 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
        s.rx += s.spin * dt;
        const gyv = this.world.groundY(s.x, s.z);
        if (s.y < gyv + 0.01) {
          s.y = gyv + 0.01;
          if (s.bounces < 2 && Math.abs(s.vy) > 0.6) {
            s.vy = -s.vy * 0.3; s.vx *= 0.5; s.vz *= 0.5; s.spin *= 0.5;
            s.bounces++;
            if (s.bounces === 1) s.cb?.(s);
          } else { s.rest = true; s.rx = Math.round(s.rx / Math.PI) * Math.PI; }
        }
      }
      _q.setFromEuler(_eu.set(s.rx, s.ry, 0));
      _m.compose(_v.set(s.x, s.y, s.z), _q, _s.set(1, 1, 1));
      this.shells.setMatrixAt(i, _m);
    }
    this.shells.instanceMatrix.needsUpdate = true;
    // fires: flames, embers, smoke
    for (const f of this.world.fires) {
      if (!!f.stage !== !!this.stage2d) continue;      // the 2D stage has its own fires (side.js)
      const d2 = (f.x - focus.x) ** 2 + (f.z - focus.z) ** 2;
      if (d2 > 900) continue;
      const rate = 26 * f.size;
      if (Math.random() < rate * dt * 2) {
        const r = 0.18 * f.size;
        this.fire.emit({ x: f.x + (Math.random() - 0.5) * r, y: f.y, z: f.z + (Math.random() - 0.5) * r, vx: wind.x * 0.3, vy: 1.2 + Math.random(), vz: wind.z * 0.3, life: 0.45 + Math.random() * 0.3, s0: 0.45 * f.size, s1: 0.08, r: f.rgb ? f.rgb[0] : 1, g: f.rgb ? f.rgb[1] : 0.45 + Math.random() * 0.2, b: f.rgb ? f.rgb[2] : 0.12, a0: 0.75, a1: 0 });
      }
      if (Math.random() < 6 * dt) {
        this.fire.emit({ x: f.x, y: f.y + 0.3, z: f.z, vx: (Math.random() - 0.5) * 0.8 + wind.x, vy: 1.5 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 0.8 + wind.z, life: 1.6 + Math.random(), s0: 0.05, s1: 0.02, r: 1, g: 0.55, b: 0.2, a0: 1, a1: 0, spin: 3 });
      }
      if (Math.random() < 7 * dt * f.size) {
        this.smoke.emit({ x: f.x, y: f.y + 0.8, z: f.z, vx: wind.x * 0.8, vy: 0.9, vz: wind.z * 0.8, life: 3, s0: 0.5, s1: 2.4 * f.size, r: 0.1, g: 0.1, b: 0.11, a0: 0.35, a1: 0, drag: 0.4, spin: 0.3 });
      }
    }
    // steam from the gratings
    for (const v of this.world.steam || []) {
      if (Math.abs(v.z - focus.z) > 28 || Math.abs(v.x - focus.x) > 28) continue;
      if (Math.random() < 5 * dt) this.mist.emit({ x: v.x + (Math.random() - 0.5) * 0.3, y: 0.1, z: v.z + (Math.random() - 0.5) * 0.3, vx: wind.x * 0.6, vy: 0.5 + Math.random() * 0.4, vz: wind.z * 0.6, life: 3 + Math.random() * 1.5, s0: 0.5, s1: 2.6, r: 0.62, g: 0.66, b: 0.72, a0: 0.2, a1: 0, drag: 0.3, spin: 0.2 });
    }
    // rain: streaks in a box around the focus, slanted by the wind
    this.rain.list.length = 0;
    if (!this.rainDrops) {
      this.rainDrops = [];
      for (let i = 0; i < Q.rain; i++) this.rainDrops.push({ x: (Math.random() - 0.5) * 34, y: Math.random() * 14, z: (Math.random() - 0.5) * 26, v: 13 + Math.random() * 5 });
    }
    for (const r of this.rainDrops) {
      r.y -= r.v * dt;
      r.x += wind.x * 2 * dt; r.z += wind.z * 2 * dt;
      if (r.y < 0) {
        r.y += 14; r.x = (Math.random() - 0.5) * 34; r.z = (Math.random() - 0.5) * 26;
      }
      const X = focus.x + r.x, Z = focus.z + r.z;
      if (this.roofed?.(X, Z)) continue;           // no rain inside the hospital and the warehouse
      this.rain.push({ ax: X, ay: r.y, az: Z, bx: X - wind.x * 0.05, by: r.y + 0.55, bz: Z - wind.z * 0.05, w: 0.018, r: 1, g: 1, b: 1, a: 0.32 });
    }
    this.rain.flush();
    // ripples
    for (let i = 0; i < this.rip.length; i++) {
      const p = this.rip[i];
      p.t += dt * 2.2;
      if (p.t > 1) { p.t = 0; p.x = focus.x + (Math.random() - 0.5) * 30; p.z = focus.z + (Math.random() - 0.5) * 22; p.s = 0.15 + Math.random() * 0.25; }
      const s = this.roofed?.(p.x, p.z) ? 0.001 : p.s * (0.2 + p.t);
      _m.compose(_v.set(p.x, 0.035, p.z), _q.identity(), _s.set(s, 1, s));
      this.ripples.setMatrixAt(i, _m);
    }
    this.ripples.instanceMatrix.needsUpdate = true;
    this.ripples.material.opacity = 0.09;
    for (const sys of [this.mist, this.drops, this.smoke, this.fire, this.glow]) sys.update(dt, scale);
    this.pools.update(dt);
  }
}
