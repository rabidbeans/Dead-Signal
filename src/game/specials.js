// The special dead, one new kind per map (Sam, 2026-10-21):
//
//   L1  BLOATER   slow and swollen; when it dies it bursts: a blast that tears the dead around it, and a cloud of gas
//                 that eats at the living. Pop it far away, or inside a crowd.
//   L2  SCREAMER  stops, rears back and SCREAMS: every sleeper in earshot wakes, the dead near her run faster, a few
//                 runners come. Then she backs off. Kill her before she opens her mouth.
//   L3  SPITTER   keeps its distance and lobs acid that pools on the ground.
//   L4  LEAPER    crouches, then flies at you and PINS you: you cannot move or shoot until a friend shoots it off (or
//                 you struggle free by tapping).
//   L5  SOLDIER   a plate carrier and a helmet: bullets from the front glance off (headshots and fire and blasts do not).
//
// Their brains are in zombie.js (`special()`, host only). Everything they DO that everyone must see goes out as a
// `zev` event and is drawn here on every machine; the damage it deals is the host's.
import * as THREE from 'three';
import { audio, buzz } from './audio.js';
import { tex } from './assets.js';
import { explode } from './objective.js';

const TAU = Math.PI * 2;
const flat = (geo) => geo.rotateX(-Math.PI / 2);

export class SpecialFX {
  constructor(g) {
    this.g = g;
    this.globs = [];
    this.puddles = [];
    this.clouds = [];
    const s = g.scene;
    const mk = (color, blend = THREE.AdditiveBlending) => {
      const m = new THREE.Mesh(flat(new THREE.PlaneGeometry(2, 2)), new THREE.MeshBasicMaterial({ map: tex('tex/soft.webp'), color, transparent: true, opacity: 0, depthWrite: false, blending: blend, toneMapped: false }));
      m.renderOrder = 3; m.visible = false; m.frustumCulled = false; s.add(m); return m;
    };
    this.pool = { acid: Array.from({ length: 12 }, () => mk(0x8cff2a)), gas: Array.from({ length: 6 }, () => mk(0x9aa63a, THREE.NormalBlending)) };
    const globMat = new THREE.MeshStandardMaterial({ color: 0x9cff3a, emissive: 0x6aff1a, emissiveIntensity: 0.55, roughness: 0.3 });
    this.globMeshes = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 7), globMat); m.visible = false; s.add(m); return m; });
  }

  take(kind) { const l = this.pool[kind]; const m = l.find((x) => !x.visible) || l[0]; m.visible = true; return m; }

  // ---- everyone: what the special dead did (from the host)
  event(e) {
    const g = this.g, z = g.zombies.get(e.id);
    if (e.a === 'spitwind') {
      if (z) { z.anim.throwT = 1; z.anim.move = 'spit'; z.anim.moveT = 0; audio.zombie('groan', z.x, z.z, 1.3); }
    } else if (e.a === 'spit') {
      if (z) { z.anim.strike = 1; z.anim.move = null; }
      const gl = this.globMeshes.find((m) => !m.visible) || this.globMeshes[0];
      gl.visible = true;
      this.globs.push({ m: gl, x0: e.x0, z0: e.z0, x1: e.x1, z1: e.z1, t: 0, dur: e.dur, r: e.r, life: e.life, dps: e.dps });
      audio.play('squelch', { x: e.x0, z: e.z0, vol: 0.8, rate: 1.4 });
    } else if (e.a === 'screamwind') {
      if (z) { z.anim.roar = 0.6; z.anim.move = 'scream'; }
    } else if (e.a === 'scream') {
      if (z) { z.anim.roar = 1.5; z.flash = 0.6; }
      audio.zombie('scream', e.x, e.z, 1.8);
      audio.play('scream', { x: e.x, z: e.z, vol: 1.0, rate: 1.35, maxDist: 60 });
      g.bossFx?.wave(e.x, e.z, 14, 0xd8e8ff, 0.9);
      g.bossFx?.wave(e.x, e.z, 22, 0xa8c0ff, 1.4);
      const d = Math.hypot(g.me.x - e.x, g.me.z - e.z);
      if (d < 26) { g.cam.trauma(0.35 * (1 - d / 26)); buzz([30, 20, 30]); }
      if (!g.introduced?.has('screamed')) { g.introduced?.add('screamed'); g.hud.toast('The scream woke everything nearby'); }
    } else if (e.a === 'pounce') {
      if (z) { z.leap = { x0: e.x0, z0: e.z0, x1: e.x1, z1: e.z1, t: 0, dur: e.dur, h: 1.3 }; z.anim.air = 1; audio.zombie('scream', z.x, z.z, 1.4); }
    } else if (e.a === 'crouch') {
      if (z) { z.anim.move = 'crouch'; z.anim.moveT = 0; audio.zombie('groan', z.x, z.z, 1.1); }
    } else if (e.a === 'pin') {
      const p = g.players.get(e.pid);
      if (z) { z.pinPid = e.pid; z.anim.move = 'pin'; }
      if (p) { p.pinnedBy = e.id; p.pinT = 0; if (p.local) { g.hud.banner('', 'PINNED!', 1.4); g.cam.trauma(0.6); buzz([60, 40, 60]); } }
      audio.play('hurt', { x: e.x, z: e.z, vol: 1 });
    } else if (e.a === 'unpin') {
      const p = g.players.get(e.pid);
      if (z) { z.pinPid = null; z.anim.move = null; }
      if (p && p.pinnedBy === e.id) { p.pinnedBy = null; if (p.local) g.hud.hint(''); }
    } else if (e.a === 'burst') {
      this.burst(e.x, e.z, e.r);
    }
  }

  // the bloater's end: a wet blast, then a slowly spreading cloud
  burst(x, z, r) {
    const g = this.g;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * TAU, s = 2 + Math.random() * 6;
      g.fx.drops.emit({ x, y: 1.0, z, vx: Math.cos(a) * s, vy: 1 + Math.random() * 4, vz: Math.sin(a) * s, life: 1.0, s0: 0.07 + Math.random() * 0.06, s1: 0.03, r: 0.35, g: 0.42, b: 0.08, a0: 1, a1: 0.8, grav: 12, floor: g.world.groundY(x, z) + 0.03 });
    }
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * TAU, s = 1 + Math.random() * 3;
      g.fx.mist.emit({ x, y: 0.9, z, vx: Math.cos(a) * s, vy: 0.6, vz: Math.sin(a) * s, life: 1.4, s0: 0.8, s1: 2.8, r: 0.45, g: 0.5, b: 0.12, a0: 0.55, a1: 0, drag: 1.5 });
    }
    g.fx.splat(x, z, 2.2); g.fx.splat(x + 0.8, z - 0.4, 1.4);
    audio.play('burst', { x, z, vol: 1.0 });
    audio.play('squelch', { x, z, vol: 0.9, rate: 0.6 });
    const m = this.take('gas');
    m.position.set(x, g.world.groundY(x, z) + 0.4, z);
    this.clouds.push({ m, x, z, r, t: 0, life: 4.5, tick: 0.2 });
    const d = Math.hypot(g.me.x - x, g.me.z - z);
    g.cam.trauma(Math.max(0, 0.4 - d / 25));
  }

  update(dt) {
    const g = this.g, host = g.isHost;
    // acid in flight, then a pool that burns the living who stand in it
    for (const b of this.globs) {
      b.t += dt;
      const u = Math.min(1, b.t / b.dur);
      b.m.position.set(b.x0 + (b.x1 - b.x0) * u, 1.6 + Math.sin(u * Math.PI) * 2.2 - u * 1.5, b.z0 + (b.z1 - b.z0) * u);
      if (Math.random() < dt * 30) g.fx.glow.emit({ x: b.m.position.x, y: b.m.position.y, z: b.m.position.z, life: 0.25, s0: 0.25, s1: 0.05, r: 0.5, g: 1, b: 0.2, a0: 0.7, a1: 0 });
      if (u >= 1) {
        b.m.visible = false; b.done = true;
        const m = this.take('acid');
        m.position.set(b.x1, g.world.groundY(b.x1, b.z1) + 0.05, b.z1); m.scale.setScalar(b.r);
        this.puddles.push({ m, x: b.x1, z: b.z1, r: b.r, t: 0, life: b.life, dps: b.dps, tick: 0 });
        for (let i = 0; i < 12; i++) g.fx.glow.emit({ x: b.x1, y: 0.3, z: b.z1, vx: (Math.random() - 0.5) * 4, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 4, life: 0.6, s0: 0.2, s1: 0.08, r: 0.5, g: 1, b: 0.2, a0: 0.9, a1: 0, grav: 6 });
        audio.play('squelch', { x: b.x1, z: b.z1, vol: 0.8, rate: 0.8 });
      }
    }
    this.globs = this.globs.filter((b) => !b.done);
    for (const p of this.puddles) {
      p.t += dt;
      const fade = Math.min(1, p.t / 0.3) * Math.min(1, (p.life - p.t) / 1);
      p.m.material.opacity = 0.7 * fade * (0.85 + 0.15 * Math.sin(p.t * 7));
      if (Math.random() < dt * 7) g.fx.glow.emit({ x: p.x + (Math.random() - 0.5) * p.r * 1.3, y: 0.08, z: p.z + (Math.random() - 0.5) * p.r * 1.3, vx: 0, vy: 0.5, vz: 0, life: 0.8, s0: 0.15, s1: 0.04, r: 0.4, g: 1, b: 0.25, a0: 0.7, a1: 0 });
      if (host && (p.tick -= dt) <= 0) {
        p.tick = 0.5;
        for (const pl of g.players.values()) if (pl.alive && Math.hypot(pl.x - p.x, pl.z - p.z) < p.r) g.hurtPlayer(pl, p.dps * 0.5, { x: p.x, z: p.z }, 0.03);
      }
      if (p.t >= p.life) p.m.visible = false;
    }
    this.puddles = this.puddles.filter((p) => p.m.visible);
    // gas: a sickly cloud that spreads and thins
    for (const c of this.clouds) {
      c.t += dt;
      const u = c.t / c.life;
      c.m.scale.setScalar(c.r * (0.6 + 0.5 * Math.min(1, c.t * 2)));
      c.m.material.opacity = 0.45 * Math.min(1, c.t * 3) * (1 - u);
      if (Math.random() < dt * 10 * (1 - u)) {
        const a = Math.random() * TAU, rr = Math.random() * c.r;
        g.fx.mist.emit({ x: c.x + Math.cos(a) * rr, y: 0.4 + Math.random() * 0.8, z: c.z + Math.sin(a) * rr, vx: g.wind.x * 0.4, vy: 0.15, vz: g.wind.z * 0.4, life: 2.2, s0: 0.8, s1: 2.0, r: 0.42, g: 0.46, b: 0.14, a0: 0.3, a1: 0, drag: 0.6 });
      }
      if (host && (c.tick -= dt) <= 0) {
        c.tick = 0.5;
        for (const pl of g.players.values()) if (pl.alive && Math.hypot(pl.x - c.x, pl.z - c.z) < c.r) g.hurtPlayer(pl, 4, { x: c.x, z: c.z }, 0.02);
      }
      if (c.t >= c.life) c.m.visible = false;
    }
    this.clouds = this.clouds.filter((c) => c.m.visible);
  }

  dispose() {
    for (const l of Object.values(this.pool)) for (const m of l) this.g.scene.remove(m);
    for (const m of this.globMeshes) this.g.scene.remove(m);
  }
}

// host: the bloater's blast hurts the dead around it (the living only a little: the gas is the danger)
export function bloaterBurst(g, z) {
  const B = z.def.pop;
  explode(g, z.x, z.z, B.r, B.zDmg, B.pDmg, z.lastBy || null);
}
