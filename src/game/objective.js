// What each level asks of you half way, and its hazards (Sam: "each level should be unique, not just running through
// gates and around walls for every level"). The junction at 50% is no longer always "hold the gate":
//
//   level 1  gate     hold the junction while the gate is cut open (the original)
//   level 2  power    the hospital district is BLACKED OUT: throw three breakers to bring the lights back and the gate up
//   level 3  nests    three pulsing nests birth the dead around the market crossing: burn them out (gas tanks help)
//   level 4  dozer    a bulldozer will break the container wall, but it only creeps forward while someone is beside it
//   level 5  gate     hold the fort gate UNDER ARTILLERY: shells (red rings) fall on the living and the dead alike
//
// Host-authoritative like everything else: the host decides charges, hit points and where shells fall; every machine
// builds the same set pieces and draws them from the snapshot (`state()` / `apply()`) and from events.
import * as THREE from 'three';
import { L, LV, LANES } from './level.js';
import { audio } from './audio.js';
import { tex } from './assets.js';

const TAU = Math.PI * 2;

// --------------------------------------------------------------- sites --
// Pure functions of the level, so populate() can put colliders down before the nav grid is built.
export function objectiveSites() {
  const c = L.cross[0], g = L.gate[0];
  if (LV.objective === 'power') return [{ x: -15.5, z: c - 1.2 }, { x: 15.5, z: c + 1.2 }, { x: 5.2, z: g + 4.2 }];
  if (LV.objective === 'nests') return [{ x: -14.5, z: c + 0.5 }, { x: 14.5, z: c - 0.5 }, { x: -4.2, z: g + 4.8 }];
  return [];
}
export function tankSites() {
  if (!LV.tanks) return [];
  const out = [];
  LANES.forEach((l, i) => {
    if (i % 2) return;
    const side = (i >> 1) % 2 ? 1 : -1;
    out.push({ x: l.x + side * 1.75, z: l.z1 + 1.0 });
  });
  return out;
}
export function placeObjective(world) {
  world.objCols = objectiveSites().map((s) => LV.objective === 'power'
    ? world.col.box(s.x, s.z, 0.5, 0.35, 0, 1.7)
    : world.col.circle(s.x, s.z, 1.05, 1.6));
  world.tankCols = tankSites().map((s) => world.col.circle(s.x, s.z, 0.32, 1.2));
}

// ------------------------------------------------------------ helpers --
// a flat ring on the ground that fills clockwise (a progress dial you can see from the camera)
function ringMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uProg: { value: 0 }, uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uA: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uProg; uniform vec3 uColor; uniform float uTime; uniform float uA; varying vec2 vUv;
      void main(){
        vec2 p = vUv * 2.0 - 1.0; float r = length(p);
        float band = smoothstep(0.70, 0.74, r) * (1.0 - smoothstep(0.94, 0.98, r));
        float a = atan(p.x, p.y) / 6.2831853 + 0.5;
        float fill = step(a, uProg);
        float pulse = 0.55 + 0.45 * sin(uTime * 4.0);
        float alpha = band * (fill * 0.95 + (1.0 - fill) * 0.22) + (1.0 - smoothstep(0.0, 0.7, r)) * 0.10 * pulse;
        gl_FragColor = vec4(uColor * (0.6 + 0.8 * fill), alpha * uA);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}
function ring(color, r) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), ringMaterial(color));
  m.renderOrder = 2;
  return m;
}
// a tall shaft of light over something you need to reach: readable from anywhere on the street
function beam(color) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 22, 16, 1, true).translate(0, 11, 0), new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uA: { value: 1 } },
    vertexShader: 'varying float vY; void main(){ vY = position.y / 22.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uA; varying float vY; void main(){ gl_FragColor = vec4(uColor, (1.0 - vY) * (1.0 - vY) * 0.32 * uA); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  m.renderOrder = 3;
  return m;
}
const std = (o) => new THREE.MeshStandardMaterial(o);
const near = (g, x, z, r) => [...g.players.values()].some((p) => p.alive && (p.x - x) ** 2 + (p.z - z) ** 2 < r * r);

// the visuals of a blast (every machine); host damage is separate (explode)
export function boomFx(g, x, z, r = 4) {
  const fx = g.fx;
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * TAU, s = 2 + Math.random() * 6;
    fx.fire.emit({ x, y: 0.4 + Math.random() * 0.8, z, vx: Math.cos(a) * s, vy: 2 + Math.random() * 5, vz: Math.sin(a) * s, life: 0.35 + Math.random() * 0.4, s0: 0.8, s1: 2.6 * r / 4, r: 1, g: 0.55 + Math.random() * 0.25, b: 0.15, a0: 0.95, a1: 0, drag: 2.2 });
  }
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * TAU, s = 1 + Math.random() * 3;
    fx.smoke.emit({ x, y: 0.8, z, vx: Math.cos(a) * s, vy: 1.2 + Math.random() * 1.8, vz: Math.sin(a) * s, life: 2.6 + Math.random(), s0: 1.2, s1: 4.5, r: 0.16, g: 0.14, b: 0.13, a0: 0.55, a1: 0, drag: 1.1, spin: 0.4 });
  }
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * TAU, s = 4 + Math.random() * 9;
    fx.sparkList.push({ x, y: 0.5, z, vx: Math.cos(a) * s, vy: 2 + Math.random() * 6, vz: Math.sin(a) * s, t: 0, max: 0.4 + Math.random() * 0.5 });
  }
  fx.glow.emit({ x, y: 1.2, z, vx: 0, vy: 0, vz: 0, life: 0.45, s0: r * 3, s1: r * 4.5, r: 1, g: 0.6, b: 0.25, a0: 0.9, a1: 0, drag: 0 });
  (g.scorch ??= fx.makeDecals('scorch', 40, { y: 0.021, opacity: 0.9 })).add(x, z, r * 1.3, Math.random() * TAU);
  audio.play('boom', { x, z, vol: 1.0, maxDist: 70 });
  const d = Math.hypot(g.me.x - x, g.me.z - z);
  g.cam.trauma(Math.max(0, 0.75 - d / 30));
  if (d < 14) g.hitstop = Math.max(g.hitstop, 0.05);
}

// host: everything inside r takes damage that falls off to half at the edge
export function explode(g, x, z, r, zDmg, pDmg) {
  for (const zb of [...g.zombies.values()]) {
    if (!zb.alive) continue;
    const dx = zb.x - x, dz = zb.z - z, d = Math.hypot(dx, dz);
    if (d > r + (zb.def.rad || 0.32)) continue;
    const k = 1 - 0.5 * Math.min(1, d / r), nx = dx / (d || 1), nz = dz / (d || 1);
    const killed = zb.damage((zb.boss ? 0.35 : 1) * zDmg * k, nx, nz, false, null);
    if (killed) g.onKill(zb, nx, nz, false, false, null);
    else g.netEvent({ k: 'zhit', id: zb.id, dx: nx, dz: nz, crit: 0 });
  }
  for (const p of g.players.values()) {
    if (!p.alive) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < r) g.hurtPlayer(p, pDmg * (1 - 0.5 * d / r), { x, z }, 2.6);
  }
  // a blast sets off the gas tanks next to it
  for (const t of g.targets.values()) if (t.alive && t.kind === 'tank' && Math.hypot(t.x - x, t.z - z) < r * 0.9) setTimeout(() => g.objective?.damage(t, 999), 140);
}

// ------------------------------------------------------- the objective --
export class Objective {
  constructor(g) {
    this.g = g;
    this.mode = LV.objective || 'gate';
    this.custom = this.mode !== 'gate';
    this.t = 0;
    this.parts = [];
    this.shells = [];
    this.shellT = 4;
    g.targets = new Map();
    g.nextTid = 1;
    const sites = objectiveSites();
    if (this.mode === 'power') this.buildPower(sites);
    else if (this.mode === 'nests') this.buildNests(sites);
    else if (this.mode === 'dozer') this.buildDozer();
    this.buildTanks();
    if (LV.barrage) this.warnMat = new THREE.MeshBasicMaterial({ map: this.warnTex(), color: 0xff2a1a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  }

  // a restart from the checkpoint: whatever was here is already done
  skip() {
    for (const p of this.parts) {
      if (this.mode === 'power') { p.charge = 1; p.done = true; this.partDone(p, true); }
      if (this.mode === 'nests' && p.target.alive) { p.target.hp = 0; this.nestDie(p, true); }
    }
    if (this.mode === 'power') this.lightsOn(true);
    if (this.mode === 'dozer') { this.dz.z = this.dz.zEnd; this.dz.done = true; }
  }

  // ---------------------------------------------------------- power --
  buildPower(sites) {
    const g = this.g;
    const body = std({ color: 0x8a9096, roughness: 0.55, metalness: 0.5 });
    const dark = std({ color: 0x2a2d31, roughness: 0.6, metalness: 0.4 });
    const hz = std({ color: 0xe8c020, roughness: 0.6 });
    for (const s of sites) {
      const grp = new THREE.Group();
      grp.position.set(s.x, g.world.groundY(s.x, s.z), s.z);
      grp.rotation.y = s.x < -1 ? Math.PI / 2 : s.x > 1 ? -Math.PI / 2 : 0;
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.18, 0.9).translate(0, 0.09, 0), dark);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.55, 0.6).translate(0, 0.95, 0), body);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.14, 0.62).translate(0, 0.32, 0), hz);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.25, 0.04).translate(0, 1.0, 0.31), dark);
      const lever = new THREE.Group();
      lever.position.set(0.32, 1.05, 0.36);
      lever.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.06).translate(0, 0.18, 0), std({ color: 0xc8202a, roughness: 0.4 })));
      lever.rotation.x = 0.9;
      const lampM = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8).translate(0, 1.82, 0), lampM);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6).translate(0, 1.25, -0.22), dark);   // the conduit up the wall
      grp.add(plinth, cab, stripe, door, lever, lamp, cone);
      grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      grp.userData.noMerge = true;
      g.scene.add(grp);
      const rg = ring(0xffc030, 2.6); rg.position.set(s.x, 0.06, s.z); g.scene.add(rg);
      const bm = beam(0xffc030); bm.position.set(s.x, 0, s.z); g.scene.add(bm);
      this.parts.push({ ...s, grp, lever, lampM, rg, bm, charge: 0, done: false, zapT: 0 });
    }
    // the blackout: street lamps nearly dead, the sky darker, until the power is back
    if (!(g.opts.checkpoint > 0)) { g.world.lampDim = 0.12; this.hemiBase = g.world.hemi.intensity; g.world.hemi.intensity *= 0.72; }
  }

  partDone(p, quiet = false) {
    p.lampM.color.set(0x30ff60);
    p.lever.rotation.x = -0.9;
    p.rg.material.uniforms.uColor.value.set(0x30ff60);
    p.bm.visible = false;
    if (quiet) return;
    audio.play('power', { x: p.x, z: p.z, vol: 0.9, maxDist: 50, jitter: 0 });
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * TAU, sp = 2 + Math.random() * 5;
      this.g.fx.sparkList.push({ x: p.x, y: 1.6, z: p.z, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 4, vz: Math.sin(a) * sp, t: 0, max: 0.3 + Math.random() * 0.4 });
    }
    const n = this.parts.filter((q) => q.done).length;
    this.g.hud.toast(n < this.parts.length ? `Breaker ${n} of ${this.parts.length} on` : 'POWER RESTORED');
  }

  lightsOn(quiet = false) {
    this.lit = quiet ? 1 : 0.01;
    if (quiet) { this.g.world.lampDim = 1; if (this.hemiBase) this.g.world.hemi.intensity = this.hemiBase; }
    else { this.g.hud.banner('POWER RESTORED', 'The gate is opening', 2.6); this.g.cam.trauma(0.25); }
  }

  updatePower(dt) {
    const g = this.g;
    const active = g.hold === 0;
    for (const p of this.parts) {
      p.rg.material.uniforms.uProg.value = p.charge;
      p.rg.material.uniforms.uTime.value = this.t;
      p.bm.material.uniforms.uA.value = active ? 0.75 + 0.25 * Math.sin(this.t * 3) : 0.5;
      if (p.done) continue;
      const charging = active && near(g, p.x, p.z, 2.6);
      if (g.isHost && charging) {
        const k = [...g.players.values()].filter((q) => q.alive && Math.hypot(q.x - p.x, q.z - p.z) < 2.6).length;
        p.charge = Math.min(1, p.charge + dt / 5.5 * (k > 1 ? 1.4 : 1));
      }
      // the lamp blinks and the cabinet crackles while it charges
      p.lampM.color.set(charging && Math.sin(this.t * 14) > 0 ? 0xffd040 : 0xff2a1a);
      if (charging) {
        p.zapT -= dt;
        if (p.zapT <= 0) {
          p.zapT = 0.5 + Math.random() * 0.4;
          audio.play('zap', { x: p.x, z: p.z, vol: 0.5 });
          for (let i = 0; i < 5; i++) g.fx.sparkList.push({ x: p.x + (Math.random() - 0.5) * 0.6, y: 1.2 + Math.random() * 0.6, z: p.z + (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 3, t: 0, max: 0.2 });
        }
      }
      if (p.charge >= 1 && !p.done) { p.done = true; this.partDone(p); }
    }
    if (!this.lit && this.parts.every((p) => p.done)) this.lightsOn();
    if (this.lit && this.lit < 1) {
      // the street lights stutter back on
      this.lit = Math.min(1, this.lit + dt / 2.2);
      const fl = this.lit < 0.95 ? (Math.random() < 0.35 ? 0.15 : 1) : 1;
      g.world.lampDim = 0.12 + 0.88 * this.lit * fl;
      if (this.hemiBase) g.world.hemi.intensity = this.hemiBase * (0.72 + 0.28 * this.lit);
    }
  }

  // ---------------------------------------------------------- nests --
  buildNests(sites) {
    const g = this.g;
    const flesh = std({ color: 0x7a1828, roughness: 0.32, metalness: 0.05, emissive: 0x4a0618, emissiveIntensity: 0.6 });
    const vein = std({ color: 0x3a0a12, roughness: 0.5 });
    const eye = new THREE.MeshBasicMaterial({ color: 0xd8ff3a });
    this.fleshMat = flesh;
    const hp = 520 * (1 + 0.5 * (g.players.size - 1)) * (LV.zHp || 1);
    sites.forEach((s, i) => {
      const grp = new THREE.Group();
      grp.position.set(s.x, 0, s.z);
      const r = (k) => { const v = Math.sin(i * 91.7 + k * 13.3) * 43758.5; return v - Math.floor(v); };
      // lumps: deformed spheres piled into a mound, some taller (sacs)
      for (let k = 0; k < 7; k++) {
        const geo = new THREE.IcosahedronGeometry(0.5 + r(k) * 0.45, 2);
        const pa = geo.attributes.position;
        for (let v = 0; v < pa.count; v++) {
          const x = pa.getX(v), y = pa.getY(v), z = pa.getZ(v);
          const n = 1 + 0.18 * Math.sin(x * 7 + k) * Math.sin(y * 6 + i) * Math.sin(z * 8);
          pa.setXYZ(v, x * n, y * n * (k === 0 ? 1.5 : 1), z * n);
        }
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, flesh);
        const a = k * 2.1 + i, d = k === 0 ? 0 : 0.45 + r(k + 9) * 0.55;
        m.position.set(Math.cos(a) * d, k === 0 ? 0.9 : 0.35 + r(k + 3) * 0.3, Math.sin(a) * d);
        grp.add(m);
      }
      // pustules that glow
      for (let k = 0; k < 9; k++) {
        const a = k * 0.73 + i, h = 0.4 + r(k + 20) * 1.2;
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.06 + r(k + 30) * 0.06, 8, 6), eye);
        m.position.set(Math.cos(a) * (0.75 - h * 0.25), h, Math.sin(a) * (0.75 - h * 0.25));
        grp.add(m);
      }
      // tendrils reaching out over the asphalt
      for (let k = 0; k < 6; k++) {
        const a = k * 1.05 + r(k + 40);
        const len = 1.4 + r(k + 50) * 1.6;
        const pts = [0, 0.33, 0.66, 1].map((u) => new THREE.Vector3(Math.cos(a + u * 0.6) * (0.6 + u * len), 0.35 * (1 - u) + 0.05, Math.sin(a + u * 0.6) * (0.6 + u * len)));
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.09, 6), vein);
        grp.add(tube);
      }
      grp.traverse((o) => { if (o.isMesh && o.material !== eye) { o.castShadow = true; o.receiveShadow = true; } });
      g.scene.add(grp);
      g.fx.pools.add(s.x, s.z, 3.6, i, 0);
      const bm = beam(0xff3050); bm.position.set(s.x, 0, s.z); g.scene.add(bm);
      const target = this.addTarget({ kind: 'nest', x: s.x, z: s.z, r: 1.05, y: 0.9, hp, col: g.world.objCols?.[i] });
      const part = { ...s, grp, bm, target, spawnT: 1.5 + i };
      target.part = part;
      this.parts.push(part);
    });
  }

  addTarget(o) {
    const g = this.g;
    const t = { id: g.nextTid++, alive: true, maxHp: o.hp, isTarget: true, ...o };
    g.targets.set(t.id, t);
    return t;
  }

  nestDie(p, quiet = false) {
    const g = this.g, t = p.target;
    t.alive = false;
    p.bm.visible = false;
    p.dead = 0.001;
    if (t.col) { g.world.col.remove(t.col); g.world.nav?.rebuildAround(t.col); }
    if (quiet) { p.grp.scale.set(1.2, 0.18, 1.2); return; }
    audio.play('burst', { x: p.x, z: p.z, vol: 1, maxDist: 60, jitter: 0 });
    for (let i = 0; i < 10; i++) { const a = Math.random() * TAU; g.fx.flesh(p.x, 0.9, p.z, Math.cos(a), Math.sin(a), 2.2, true); }
    for (let i = 0; i < 5; i++) g.fx.pool(p.x + (Math.random() - 0.5) * 3, p.z + (Math.random() - 0.5) * 3);
    g.cam.trauma(0.3);
    const n = this.parts.filter((q) => !q.target.alive).length;
    g.hud.toast(n < this.parts.length ? `Nest ${n} of ${this.parts.length} destroyed` : 'THE NESTS ARE DEAD');
  }

  updateNests(dt) {
    const g = this.g;
    const active = g.hold === 0;
    for (const p of this.parts) {
      const t = p.target;
      if (p.dead) {
        // collapse into a deflated, smoking husk
        p.dead = Math.min(1, p.dead + dt * 1.6);
        const k = p.dead;
        p.grp.scale.set(1 + 0.25 * k, 1 - 0.82 * k, 1 + 0.25 * k);
        continue;
      }
      // it breathes (faster when hurt), and flinches when shot
      const hurt = 1 - t.hp / t.maxHp;
      const br = Math.sin(this.t * (2.2 + hurt * 3) + p.x);
      p.flinch = Math.max(0, (p.flinch || 0) - dt * 4);
      const s = 1 + br * 0.05 + p.flinch * 0.12;
      p.grp.scale.set(s, 1 + br * 0.08 - p.flinch * 0.1, s);
      p.bm.material.uniforms.uA.value = active ? 0.8 : 0.45;
      // host: while the objective is on, every living nest births the dead
      if (g.isHost && active && near(g, p.x, p.z, 24)) {
        p.spawnT -= dt;
        let hunting = 0;
        for (const z of g.zombies.values()) if (z.alive && !z.idle) hunting++;
        if (p.spawnT <= 0 && hunting < 30 + 8 * (g.players.size - 1)) {
          p.spawnT = 4.6 + Math.random() * 2.0;
          const a = Math.random() * TAU;
          g.spawnZombie(Math.random() < 0.22 ? 'runner' : Math.random() < 0.3 ? 'lurcher' : 'shambler', { x: p.x + Math.cos(a) * 1.7, z: p.z + Math.sin(a) * 1.7 });
          audio.play('squelch', { x: p.x, z: p.z, vol: 0.6 });
          p.flinch = 1;
        }
      }
    }
    if (this.fleshMat) this.fleshMat.emissiveIntensity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(this.t * 3.1));
  }

  // ---------------------------------------------------------- dozer --
  buildDozer() {
    const g = this.g;
    const yel = std({ color: 0xf2b21a, roughness: 0.45, metalness: 0.3 });
    const blk = std({ color: 0x1e1f22, roughness: 0.7, metalness: 0.3 });
    const steel = std({ color: 0x5a5e64, roughness: 0.35, metalness: 0.8 });
    const glass = std({ color: 0x1a2a3a, roughness: 0.08, metalness: 0.2, emissive: 0x3a5a6a, emissiveIntensity: 0.4 });
    const grp = new THREE.Group();
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; grp.add(o); return o; };
    // tracks with their wheels
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.7, 0.85, 4.2), blk, sx * 1.25, 0.43, 0.2);
      for (let k = 0; k < 5; k++) add(new THREE.CylinderGeometry(0.3, 0.3, 0.74, 14).rotateZ(Math.PI / 2), steel, sx * 1.25, 0.38, -1.4 + k * 0.8);
    }
    add(new THREE.BoxGeometry(1.9, 0.9, 3.6), yel, 0, 1.15, 0.35);          // the body
    add(new THREE.BoxGeometry(1.7, 0.7, 1.3), yel, 0, 1.75, 1.35);           // the engine deck
    add(new THREE.BoxGeometry(1.5, 1.25, 1.4), glass, 0, 2.2, -0.1);         // the cab
    add(new THREE.BoxGeometry(1.64, 0.1, 1.55), yel, 0, 2.86, -0.1);          // the roof
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.08, 1.25, 0.08), yel, sx * 0.76, 2.2, -0.1 + sz * 0.7);
    const stack = add(new THREE.CylinderGeometry(0.07, 0.08, 1.2, 10), blk, 0.6, 2.4, 1.6);
    // the blade on its push arms
    const blade = add(new THREE.BoxGeometry(3.4, 1.25, 0.25), steel, 0, 0.75, -2.55);
    blade.rotation.x = 0.18;
    add(new THREE.BoxGeometry(3.4, 0.14, 0.32), yel, 0, 1.38, -2.45);
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.16, 0.18, 1.3), yel, sx * 1.25, 0.95, -1.8);
    // a warning beacon and two headlights
    const beaconM = new THREE.MeshBasicMaterial({ color: 0xff8a10 });
    add(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 10), beaconM, 0, 3.0, -0.1);
    const headM = new THREE.MeshBasicMaterial({ color: 0xfff2c8 });
    for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.1, 10, 8), headM, sx * 0.62, 2.9, -0.88);
    const glowM = new THREE.MeshBasicMaterial({ map: tex('tex/soft.webp'), color: 0xff8a10, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2), glowM);
    glow.position.set(0, 3.05, -0.1);
    grp.add(glow);
    const coneM = new THREE.MeshBasicMaterial({ map: tex('tex/cone.webp'), color: 0xfff0c0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(1.4, 7, 16, 1, true).translate(0, -3.5, 0).rotateX(-Math.PI / 2 + 0.3), coneM);
      c.position.set(sx * 0.62, 2.9, -0.95);
      grp.add(c);
    }
    grp.scale.setScalar(1.12);
    g.scene.add(grp);
    const z0 = L.cross[0] + 7, zEnd = L.gate[0] + 3.4;
    const col = g.world.col.dynBox(0, z0, 1.75, 3.05, 0, 3);
    const rg = ring(0xffb020, 8.5);
    g.scene.add(rg);
    const bm = beam(0xffb020);
    g.scene.add(bm);
    this.dz = { grp, col, z: z0, z0, zEnd, vz: 0, moving: false, glow, stack, rg, bm, smokeT: 0, done: false, voice: null, roll: 0 };
    this.placeDozer();
  }

  placeDozer() {
    const d = this.dz;
    d.grp.position.set(0, 0, d.z);
    d.col.cz = d.z - 0.25;
    d.rg.position.set(0, 0.06, d.z);
    d.bm.position.set(0, 0, d.z);
  }

  updateDozer(dt) {
    const g = this.g, d = this.dz;
    const active = g.hold === 0 && !d.done;
    if (g.isHost) {
      d.moving = active && near(g, 0, d.z, 8.5);
      if (d.moving) d.z = Math.max(d.zEnd, d.z - 0.62 * dt);
      if (d.z <= d.zEnd + 1e-3 && active) d.done = true;
      // the blade crushes whatever is standing in front of it
      if (d.moving) for (const zb of g.zombies.values()) {
        if (!zb.alive || zb.boss) continue;
        if (Math.abs(zb.x) < 2.1 && zb.z < d.z - 2.2 && zb.z > d.z - 3.8) {
          if (zb.damage(400, 0, -1, true, null)) g.onKill(zb, (Math.random() - 0.5), -1, true, false, null);
        }
      }
    } else {
      if (d.netZ !== undefined) d.z += (d.netZ - d.z) * Math.min(1, dt * 6);
    }
    this.placeDozer();
    // the beacon turns, exhaust coughs while it pushes, the whole machine shudders
    d.glow.rotation.y += dt * 6;
    d.glow.material.opacity = 0.5 + 0.4 * Math.max(0, Math.sin(this.t * 9));
    d.grp.position.y = d.moving ? Math.abs(Math.sin(this.t * 22)) * 0.02 : 0;
    d.smokeT -= dt;
    if (d.smokeT <= 0) {
      d.smokeT = d.moving ? 0.12 : 0.45;
      const sp = d.stack.getWorldPosition(new THREE.Vector3());
      g.fx.smoke.emit({ x: sp.x, y: sp.y + 0.7, z: sp.z, vx: 0.3, vy: 1.6, vz: 0.4, life: 1.8, s0: 0.25, s1: 1.4, r: 0.12, g: 0.12, b: 0.13, a0: d.moving ? 0.5 : 0.25, a1: 0, drag: 0.5, spin: 0.4 });
    }
    const prog = (d.z0 - d.z) / (d.z0 - d.zEnd);
    d.rg.material.uniforms.uProg.value = prog;
    d.rg.material.uniforms.uTime.value = this.t;
    d.rg.material.uniforms.uA.value = active ? (d.moving ? 0.5 : 1) : 0.3;
    d.bm.visible = active && !d.moving;
    // the engine: idling until the hold starts, labouring while it pushes
    const dist = Math.hypot(g.me.x, g.me.z - d.z);
    if (!d.voice && audio.ready && dist < 60) d.voice = audio.play('engine', { vol: 0, loop: true, jitter: 0 });
    if (d.voice) {
      d.voice.g.gain.value = Math.max(0, 1 - dist / 45) * (d.moving ? 0.75 : 0.35);
      d.voice.src.playbackRate.value = d.moving ? 1.12 : 0.85;
    }
  }

  // ---------------------------------------------------------- tanks --
  buildTanks() {
    const g = this.g;
    const sites = tankSites();
    if (!sites.length) return;
    const red = std({ color: 0xd82a1a, roughness: 0.35, metalness: 0.4 });
    const white = std({ color: 0xf2f0e8, roughness: 0.5 });
    const steel = std({ color: 0x7a7e84, roughness: 0.3, metalness: 0.9 });
    sites.forEach((s, i) => {
      const grp = new THREE.Group();
      grp.position.set(s.x, g.world.groundY(s.x, s.z), s.z);
      const add = (geo, m, y) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.castShadow = true; grp.add(o); };
      add(new THREE.CylinderGeometry(0.28, 0.28, 0.95, 16), red, 0.55);
      add(new THREE.SphereGeometry(0.28, 16, 8, 0, TAU, 0, Math.PI / 2), red, 1.02);
      add(new THREE.CylinderGeometry(0.285, 0.285, 0.12, 16), white, 0.75);
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8), steel, 1.35);
      add(new THREE.TorusGeometry(0.12, 0.025, 6, 16).rotateX(Math.PI / 2), steel, 1.42);
      g.scene.add(grp);
      const t = this.addTarget({ kind: 'tank', x: s.x, z: s.z, r: 0.34, y: 0.7, hp: 25, col: g.world.tankCols?.[i] });
      t.grp = grp;
    });
  }

  tankDie(t, quiet = false) {
    const g = this.g;
    t.alive = false;
    t.grp.visible = false;
    if (t.col) { g.world.col.remove(t.col); g.world.nav?.rebuildAround(t.col); }
    if (quiet) return;
    boomFx(g, t.x, t.z, 4.2);
    if (g.isHost) explode(g, t.x, t.z, 4.2, 320, 30);
  }

  // ------------------------------------------------------- artillery --
  warnTex() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    x.strokeStyle = '#fff'; x.lineWidth = 7;
    x.beginPath(); x.arc(64, 64, 58, 0, TAU); x.stroke();
    x.lineWidth = 3;
    x.beginPath(); x.arc(64, 64, 36, 0, TAU); x.stroke();
    x.beginPath(); x.moveTo(64, 10); x.lineTo(64, 118); x.moveTo(10, 64); x.lineTo(118, 64); x.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // when the guns are firing: the whole fort hold, and (lighter) the run from the fort gate to the plaza
  barrageRate() {
    const g = this.g;
    if (!LV.barrage || g.phase === 'extract' || g.phase === 'win' || g.phase === 'intro') return 0;
    if (g.hold === 0) return 1;
    const lead = g.lead();
    if (g.hold < 0 && g.opened >= 1 && lead.z > L.lz.z + 24) return 0.45;
    return 0;
  }

  shell(x, z) {
    const g = this.g;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 7.4).rotateX(-Math.PI / 2), this.warnMat.clone());
    m.position.set(x, g.world.groundY(x, z) + 0.05, z);
    m.renderOrder = 2;
    g.scene.add(m);
    this.shells.push({ x, z, t: 0, m, whistle: false });
  }

  updateShells(dt) {
    const g = this.g;
    if (g.isHost) {
      const rate = this.barrageRate();
      if (rate > 0) {
        this.shellT -= dt * rate;
        if (this.shellT <= 0) {
          this.shellT = 1.5 + Math.random() * 0.9;
          const pls = [...g.players.values()].filter((p) => p.alive);
          if (pls.length) {
            const p = pls[(Math.random() * pls.length) | 0];
            const a = Math.random() * TAU, r = Math.random() < 0.45 ? 1 + Math.random() * 2.5 : 3 + Math.random() * 7;
            const x = Math.max(-8.5, Math.min(8.5, p.x + Math.cos(a) * r)), z = p.z + Math.sin(a) * r - 1;
            this.shell(x, z);
            g.netEvent({ k: 'shell', x: +x.toFixed(2), z: +z.toFixed(2) });
          }
        }
      }
    }
    for (const s of this.shells) {
      s.t += dt;
      const k = Math.min(1, s.t / 1.75);
      s.m.material.opacity = (0.35 + 0.65 * k) * (Math.sin(s.t * (8 + k * 20)) > -0.2 ? 1 : 0.35);
      s.m.scale.setScalar(1.15 - 0.15 * k);
      s.m.rotation.y += dt * 1.5;
      if (!s.whistle && s.t > 0.2) { s.whistle = true; audio.play('incoming', { x: s.x, z: s.z, vol: 0.6, maxDist: 40, jitter: 0.06 }); }
      if (s.t >= 1.75 && !s.gone) {
        s.gone = true;
        g.scene.remove(s.m); s.m.material.dispose();
        boomFx(g, s.x, s.z, 3.6);
        if (g.isHost) explode(g, s.x, s.z, 3.6, 420, 32);
      }
    }
    this.shells = this.shells.filter((s) => !s.gone);
  }

  // ---------------------------------------------------- the interface --
  update(dt) {
    this.t += dt;
    if (this.mode === 'power') this.updatePower(dt);
    else if (this.mode === 'nests') this.updateNests(dt);
    else if (this.mode === 'dozer') this.updateDozer(dt);
    if (LV.barrage) this.updateShells(dt);
  }

  done() {
    if (this.mode === 'power') return this.parts.every((p) => p.done) && this.lit >= 1;
    if (this.mode === 'nests') return this.parts.every((p) => !p.target.alive);
    if (this.mode === 'dozer') return this.dz.done;
    return false;
  }

  // the junction's objective as the HUD shows it
  hud() {
    if (this.mode === 'power') {
      const n = this.parts.filter((p) => p.done).length;
      const any = this.parts.some((p) => !p.done && near(this.g, p.x, p.z, 2.6));
      return { text: any ? 'STAY BY THE BREAKER' : `RESTORE THE POWER  ·  ${n}/${this.parts.length}`, right: `${n}/${this.parts.length}`, frac: this.parts.reduce((a, p) => a + p.charge, 0) / this.parts.length };
    }
    if (this.mode === 'nests') {
      const n = this.parts.filter((p) => !p.target.alive).length;
      return { text: `DESTROY THE NESTS  ·  ${n}/${this.parts.length}`, right: `${n}/${this.parts.length}`, frac: this.parts.reduce((a, p) => a + (1 - Math.max(0, p.target.hp) / p.target.maxHp), 0) / this.parts.length };
    }
    if (this.mode === 'dozer') {
      const d = this.dz, f = (d.z0 - d.z) / (d.z0 - d.zEnd);
      return { text: d.moving ? 'ESCORT THE DOZER' : 'STAY WITH THE DOZER', right: `${Math.round(f * 100)}%`, frac: f };
    }
    return null;
  }

  blurb() {
    return { power: 'Throw the three breakers to get the gate up', nests: 'Burn out the three nests', dozer: 'Stay beside the bulldozer while it pushes through' }[this.mode];
  }

  // the places the HUD points at
  markers() {
    if (this.g.hold !== 0) return [];
    if (this.mode === 'power') return this.parts.filter((p) => !p.done).map((p) => ({ x: p.x, z: p.z, c: '#ffc030' }));
    if (this.mode === 'nests') return this.parts.filter((p) => p.target.alive).map((p) => ({ x: p.x, z: p.z, c: '#ff3050' }));
    if (this.mode === 'dozer' && !this.dz.done) return [{ x: 0, z: this.dz.z, c: '#ffb020' }];
    return [];
  }

  // host -> snapshot
  state() {
    if (this.mode === 'power') return this.parts.map((p) => Math.round(p.charge * 100));
    if (this.mode === 'nests') return this.parts.map((p) => Math.max(0, Math.round(p.target.hp)));
    if (this.mode === 'dozer') return [+this.dz.z.toFixed(2), this.dz.moving ? 1 : 0, this.dz.done ? 1 : 0];
    return 0;
  }

  apply(s) {
    if (!Array.isArray(s)) return;
    if (this.mode === 'power') this.parts.forEach((p, i) => { p.charge = (s[i] ?? 0) / 100; });
    if (this.mode === 'nests') this.parts.forEach((p, i) => {
      const t = p.target;
      if (s[i] < t.hp - 1) p.flinch = 1;
      t.hp = s[i];
      if (t.alive && t.hp <= 0) this.nestDie(p);
    });
    if (this.mode === 'dozer') { this.dz.netZ = s[0]; this.dz.moving = !!s[1]; this.dz.done = !!s[2]; }
  }

  // events from the host
  onEvent(e) {
    if (e.k === 'shell') this.shell(e.x, e.z);
    else if (e.k === 'tdie') {
      const t = this.g.targets.get(e.id);
      if (t && t.alive) { if (t.kind === 'tank') this.tankDie(t); else this.nestDie(t.part); }
    }
  }

  // a bullet connected (every machine shows it; the host keeps the score)
  hitFx(t, dx, dz) {
    const g = this.g;
    if (t.kind === 'nest') {
      t.part.flinch = 1;
      g.fx.flesh(t.x - dx * 0.8, 1.0, t.z - dz * 0.8, -dx, -dz, 1.3, false);
      audio.play('squelch', { x: t.x, z: t.z, vol: 0.45 });
    } else {
      for (let i = 0; i < 4; i++) g.fx.sparkList.push({ x: t.x, y: 0.8, z: t.z, vx: -dx * 2 + (Math.random() - 0.5) * 3, vy: Math.random() * 2, vz: -dz * 2 + (Math.random() - 0.5) * 3, t: 0, max: 0.15 });
      audio.play('hard', { x: t.x, z: t.z, vol: 0.5 });
    }
  }

  // host: a target loses hit points
  damage(t, dmg) {
    if (!t.alive) return;
    t.hp -= dmg;
    if (t.hp > 0) return;
    if (t.kind === 'tank') this.tankDie(t); else this.nestDie(t.part);
    this.g.netEvent({ k: 'tdie', id: t.id });
  }

  dispose() {
    if (this.dz?.voice) { try { this.dz.voice.src.stop(); } catch (e) { /* already stopped */ } }
  }
}
