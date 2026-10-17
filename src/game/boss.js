// The five bosses' special moves. The HOST decides (BossBrain, called from Zombie.think) and announces each move as a
// `boss` event; every machine draws it (BossFX.event) from the same numbers, so projectiles, puddles and leaps look the
// same everywhere. Only the host checks who got hit (Game.hurtPlayer sends the damage to the right machine).
//
//   THE WARDEN     (level 1)  CHARGE      a red lane on the ground, then he bulldozes down it
//   PATIENT ZERO   (level 2)  BILE        three globs lobbed at you; each leaves a burning green puddle
//   THE BUTCHER    (level 3)  CLEAVERS    a fan of three spinning cleavers thrown at you
//   THE FOREMAN    (level 4)  GROUND SLAM he leaps to where you stood; get out of the red circle
//   SUBJECT OMEGA  (level 5)  SUMMON + BERSERK  screams the horde in; under half health he goes red and starts charging
import * as THREE from 'three';
import { tex } from './assets.js';
import { audio, buzz } from './audio.js';

const _v = new THREE.Vector3();

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let RING = null, LANE = null, DISC = null;
function textures() {
  if (RING) return;
  RING = canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 14; g.beginPath(); g.arc(c, c, c - 12, 0, 7); g.stroke();
    g.lineWidth = 4; g.setLineDash([18, 14]); g.beginPath(); g.arc(c, c, c - 34, 0, 7); g.stroke();
  });
  DISC = canvasTex(256, 256, (g, w) => {
    const c = w / 2, r = g.createRadialGradient(c, c, 0, c, c, c);
    r.addColorStop(0, 'rgba(255,255,255,0.15)'); r.addColorStop(0.75, 'rgba(255,255,255,0.45)'); r.addColorStop(0.97, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
  LANE = canvasTex(64, 256, (g, w, h) => {
    const r = g.createLinearGradient(0, 0, w, 0);
    r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.2, 'rgba(255,255,255,0.55)'); r.addColorStop(0.8, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    for (let y = 10; y < h; y += 46) { g.beginPath(); g.moveTo(w * 0.15, y + 26); g.lineTo(w / 2, y); g.lineTo(w * 0.85, y + 26); g.lineTo(w * 0.7, y + 26); g.lineTo(w / 2, y + 12); g.lineTo(w * 0.3, y + 26); g.fill(); }
  });
}

const flat = (geo) => geo.rotateX(-Math.PI / 2);

// ---------------------------------------------------------------- what everyone sees --
export class BossFX {
  constructor(game) {
    textures();
    this.game = game;
    const s = this.scene = game.scene;
    this.tele = [];         // telegraphs: rings, lanes, discs
    this.globs = [];        // bile in flight
    this.puddles = [];      // bile on the ground
    this.cleavers = [];     // cleavers in flight
    this.waves = [];        // expanding shock rings (slam, scream)
    const mk = (geo, map, color) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 }));
      m.renderOrder = 3; m.visible = false; m.frustumCulled = false; s.add(m); return m;
    };
    this.pool = {
      ring: Array.from({ length: 8 }, () => mk(flat(new THREE.PlaneGeometry(2, 2)), RING, 0xff2a1a)),
      disc: Array.from({ length: 4 }, () => mk(flat(new THREE.PlaneGeometry(2, 2)), DISC, 0xff2a1a)),
      lane: Array.from({ length: 3 }, () => mk(flat(new THREE.PlaneGeometry(1, 1)).translate(0, 0, -0.5), LANE, 0xff2a1a)),
      puddle: Array.from({ length: 10 }, () => mk(flat(new THREE.PlaneGeometry(2, 2)), tex('tex/soft.webp'), 0x5aff2a)),
    };
    // bile globs and cleavers: small real meshes
    const globMat = new THREE.MeshStandardMaterial({ color: 0x6aff3a, emissive: 0x3aff1a, emissiveIntensity: 1.2, roughness: 0.3, toneMapped: false });
    this.globMeshes = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), globMat); m.visible = false; s.add(m); return m; });
    const steel = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.9, roughness: 0.25 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3018, roughness: 0.7 });
    this.cleaverMeshes = Array.from({ length: 9 }, () => {
      const g = new THREE.Group();
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.22), steel);
      blade.position.x = 0.08;
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.2, 8).rotateZ(Math.PI / 2), wood);
      handle.position.set(-0.17, 0, -0.06);
      g.add(blade, handle);
      g.scale.setScalar(1.6);
      g.visible = false; s.add(g); return g;
    });
  }

  take(kind) { const list = this.pool[kind]; const m = list.find((x) => !x.visible) || list[0]; m.visible = true; return m; }

  // ---- the moves, as announced by the host
  event(e) {
    const g = this.game;
    const z = g.zombies.get(e.id);
    if (e.a === 'wind') {
      if (z) { z.anim.move = e.m; z.anim.moveT = 0; if (e.m === 'quake') { z.anim.roar = 1.3; audio.zombie('scream', z.x, z.z, 1.4); } }
    } else if (e.a === 'quake') {
      if (z) z.anim.strike = 1;
      g.side?.quake(e.x);
    } else if (e.a === 'spit') {
      if (z) z.anim.strike = 1;
      g.side?.spit(e.x, e.y, e.tx, e.ty);
    } else if (e.a === 'overtime') {
      if (z) { z.overtime = true; z.char.material.userData.uniforms.uTint.value.multiplyScalar(1.08); z.anim.springs.headX.kick(-20); }
      g.hud.toast('The Foreman is on overtime: faster swings!');
      if (z) audio.zombie('scream', z.x, z.z, 1.3);
    } else if (e.a === 'mutate') {
      if (z) {
        z.mut = e.n;
        z.char.root.scale.setScalar(z.baseScale * 1.07 ** e.n);
        z.anim.roar = 1.2; z.flash = 1;
        audio.zombie('scream', z.x, z.z, 1.6);
        for (let i = 0; i < 30; i++) g.fx.glow.emit({ x: z.x + (Math.random() - 0.5) * 1.5, y: 0.5 + Math.random() * 2.5, z: z.z + (Math.random() - 0.5) * 1.5, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 3, life: 0.9, s0: 0.25, s1: 0.05, r: 0.6, g: 1, b: 0.2, a0: 0.9, a1: 0 });
      }
      g.cam.trauma(0.35);
      g.hud.toast('Subject Omega is mutating!');
    } else if (e.a === 'lane') {
      // the Warden's (and the berserk Omega's) charge: a red lane flashes where he is about to go
      const m = this.take('lane');
      m.position.set(e.x, 0.06, e.z);
      m.rotation.y = Math.atan2(-e.dx, -e.dz);
      m.scale.set(2.6, 1, e.len);
      this.tele.push({ m, t: 0, dur: e.dur, pulse: true });
      if (g.side?.active) {
        // side-on, a lane on the floor is a line: stand a red wall of light up along it instead
        this.lane2d ??= (() => { const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 2.6).translate(0.5, 1.3, 0), new THREE.MeshBasicMaterial({ map: LANE, color: 0xff2a1a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 })); q.frustumCulled = false; this.scene.add(q); return q; })();
        const q = this.lane2d;
        q.visible = true; q.position.set(e.x, 0, e.z + 0.3); q.scale.set(e.len * Math.sign(e.dx || 1), 1, 1);
        this.tele.push({ m: q, t: 0, dur: e.dur, pulse: true });
      }
      if (z) { audio.zombie('scream', z.x, z.z, 1.2); z.flash = 1; }
    } else if (e.a === 'charge') {
      if (z) { z.charging = e.dur; audio.play('gate', { x: z.x, z: z.z, vol: 0.5, rate: 1.5 }); }
    } else if (e.a === 'skid') {
      if (z && !g.isHost) { z.anim.springs.spineX.kick(14); z.anim.springs.headX.kick(16); }
      for (let i = 0; i < 16; i++) g.fx.smoke.emit({ x: e.x + (Math.random() - 0.5), y: 0.15, z: e.z + (Math.random() - 0.5), vx: e.dx * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2, vy: 0.4, vz: e.dz * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2, life: 1.1, s0: 0.4, s1: 1.6, r: 0.5, g: 0.47, b: 0.43, a0: 0.35, a1: 0, drag: 1.8 });
      audio.play('hard', { x: e.x, z: e.z, vol: 0.5, rate: 0.6 });
    } else if (e.a === 'ring') {
      // a landing spot: a ring and a filling disc
      const r = this.take('ring'), d = this.take('disc');
      r.position.set(e.x, 0.07, e.z); r.scale.setScalar(e.r);
      d.position.set(e.x, 0.065, e.z); d.scale.setScalar(0.01);
      r.material.color.set(e.c ?? 0xff2a1a); d.material.color.set(e.c ?? 0xff2a1a);
      this.tele.push({ m: r, t: 0, dur: e.dur, pulse: true }, { m: d, t: 0, dur: e.dur, fill: e.r });
    } else if (e.a === 'bile') {
      if (z) { audio.zombie('scream', z.x, z.z, 1); z.anim.strike = 1; }
      e.t.forEach(([tx, tz], i) => {
        const m = this.globMeshes.find((q) => !q.visible) || this.globMeshes[0];
        m.visible = true;
        this.globs.push({ m, x0: e.x, z0: e.z, x1: tx, z1: tz, t: -i * 0.12, dur: e.dur });
        this.event({ a: 'ring', x: tx, z: tz, r: 1.9, dur: e.dur + i * 0.12, c: 0x6aff2a });
      });
    } else if (e.a === 'cleaver') {
      if (z) { audio.play('slide', { x: z.x, z: z.z, vol: 0.9, rate: 0.7 }); z.anim.throwT = 1; z.anim.strike = 1; }
      for (const [dx, dz] of e.d) {
        const m = this.cleaverMeshes.find((q) => !q.visible) || this.cleaverMeshes[0];
        m.visible = true;
        this.cleavers.push({ m, x: e.x, z: e.z, dx, dz, v: e.v, left: e.range, hit: new Set() });
      }
    } else if (e.a === 'leap') {
      if (z) { z.leap = { x0: e.x0, z0: e.z0, x1: e.x1, z1: e.z1, t: 0, dur: e.dur }; audio.zombie('scream', z.x, z.z, 1.2); }
    } else if (e.a === 'slam') {
      if (z) z.anim.strike = 1;
      this.wave(e.x, e.z, e.r, 0xffb040, 0.55);
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * 6.283, r = Math.random() * 1.5;
        g.fx.smoke.emit({ x: e.x + Math.cos(a) * r, y: 0.2, z: e.z + Math.sin(a) * r, vx: Math.cos(a) * (4 + Math.random() * 4), vy: 0.5 + Math.random(), vz: Math.sin(a) * (4 + Math.random() * 4), life: 1.6, s0: 0.6, s1: 2.6, r: 0.55, g: 0.5, b: 0.45, a0: 0.45, a1: 0, drag: 1.4, spin: 0.4 });
      }
      audio.play('thunder', { x: e.x, z: e.z, vol: 1.0, rate: 1.6 });
      const d = Math.hypot(g.me.x - e.x, g.me.z - e.z);
      g.cam.trauma(Math.max(0.25, 0.8 - d * 0.04));
      buzz([60]);
    } else if (e.a === 'scream') {
      if (z) z.anim.roar = 1.5;
      this.wave(e.x, e.z, 10, 0xb04aff, 1.2);
      audio.zombie('scream', e.x, e.z, 1.5);
      g.cam.trauma(0.35);
      g.hud.toast('It is calling the horde!');
    } else if (e.a === 'enrage') {
      if (z) { z.enraged = true; z.anim.roar = 1.5; z.char.material.userData.uniforms.uTint.value.setRGB(1.5, 0.55, 0.5); }
      g.hud.banner('BERSERK', 'Subject Omega is enraged', 2.2);
      audio.zombie('scream', e.x, e.z, 1.6);
      g.cam.trauma(0.5);
    }
  }

  // a boss's body hits the ground: a ring of dust, the street shakes, a deep thump (every machine, from zombie.js)
  thud(z) {
    const g = this.game, s = z.char.root.scale.x, d = z.anim.deathDir || 1;
    const fx = Math.sin(z.vface ?? z.face) * d, fz = Math.cos(z.vface ?? z.face) * d;
    const cx = z.x + fx * 1.0 * s, cz = z.z + fz * 1.0 * s;
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * 6.283, r = Math.random() * 0.8 * s;
      g.fx.smoke.emit({ x: cx + Math.cos(a) * r, y: 0.15, z: cz + Math.sin(a) * r, vx: Math.cos(a) * (2 + Math.random() * 3), vy: 0.3 + Math.random() * 0.6, vz: Math.sin(a) * (2 + Math.random() * 3), life: 1.5, s0: 0.5, s1: 2.0, r: 0.5, g: 0.47, b: 0.43, a0: 0.4, a1: 0, drag: 1.6, spin: 0.3 });
    }
    audio.play('thunder', { x: cx, z: cz, vol: 0.7, rate: 1.9 });
    const dm = g.me ? Math.hypot(g.me.x - cx, g.me.z - cz) : 99;
    g.cam.trauma(Math.max(0.15, 0.55 - dm * 0.03));
    buzz([40]);
  }

  wave(x, z, r, color, dur) {
    const m = this.take('ring');
    m.position.set(x, 0.08, z);
    m.material.color.set(color);
    this.waves.push({ m, t: 0, dur, r });
  }

  update(dt) {
    const g = this.game, host = g.isHost;
    for (const t of this.tele) {
      t.t += dt;
      const u = Math.min(1, t.t / t.dur);
      if (t.fill) t.m.scale.setScalar(Math.max(0.01, t.fill * u));
      const blink = t.pulse ? 0.55 + 0.45 * Math.sin(t.t * (10 + 16 * u)) : 0.6;
      t.m.material.opacity = (u < 1 ? 1 : 0) * blink * (t.fill ? 0.6 : 1);
      if (u >= 1) t.m.visible = false;
    }
    this.tele = this.tele.filter((t) => t.m.visible);
    for (const w of this.waves) {
      w.t += dt;
      const u = Math.min(1, w.t / w.dur);
      w.m.scale.setScalar(0.5 + w.r * u);
      w.m.material.opacity = (1 - u) * 1.2;
      if (u >= 1) w.m.visible = false;
    }
    this.waves = this.waves.filter((w) => w.m.visible);
    // bile: a lob, then a puddle that burns whoever stands in it
    for (const b of this.globs) {
      b.t += dt;
      const u = Math.max(0, Math.min(1, b.t / b.dur));
      b.m.position.set(b.x0 + (b.x1 - b.x0) * u, 1.8 + Math.sin(u * Math.PI) * 3.2 - u * 1.7, b.z0 + (b.z1 - b.z0) * u);
      b.m.visible = b.t > 0;
      if (b.t >= b.dur) {
        b.m.visible = false; b.done = true;
        const m = this.take('puddle');
        m.position.set(b.x1, 0.05, b.z1); m.scale.setScalar(1.9);
        this.puddles.push({ m, x: b.x1, z: b.z1, r: 1.9, t: 0, life: 6, tick: 0 });
        for (let i = 0; i < 14; i++) g.fx.glow.emit({ x: b.x1, y: 0.3, z: b.z1, vx: (Math.random() - 0.5) * 4, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 4, life: 0.7, s0: 0.25, s1: 0.1, r: 0.4, g: 1, b: 0.2, a0: 0.9, a1: 0, grav: 6 });
        g.fx.splat?.(b.x1, b.z1, 1.2);
        audio.play('flesh', { x: b.x1, z: b.z1, vol: 0.8, rate: 0.6 });
      }
    }
    this.globs = this.globs.filter((b) => !b.done);
    for (const p of this.puddles) {
      p.t += dt;
      const fade = Math.min(1, p.t / 0.3) * Math.min(1, (p.life - p.t) / 1);
      p.m.material.opacity = 0.75 * fade * (0.85 + 0.15 * Math.sin(p.t * 6));
      if (Math.random() < dt * 8) g.fx.glow.emit({ x: p.x + (Math.random() - 0.5) * p.r * 1.4, y: 0.1, z: p.z + (Math.random() - 0.5) * p.r * 1.4, vx: 0, vy: 0.6, vz: 0, life: 0.9, s0: 0.2, s1: 0.05, r: 0.3, g: 1, b: 0.25, a0: 0.7, a1: 0 });
      if (host && (p.tick -= dt) <= 0) {
        p.tick = 0.5;
        for (const pl of g.players.values()) if (pl.alive && Math.hypot(pl.x - p.x, pl.z - p.z) < p.r) g.hurtPlayer(pl, 6, { x: p.x, z: p.z }, 0.05);
      }
      if (p.t >= p.life) p.m.visible = false;
    }
    this.puddles = this.puddles.filter((p) => p.m.visible);
    // cleavers: spinning, straight, until a wall or their range
    for (const c of this.cleavers) {
      const step = c.v * dt;
      const wall = g.world.col.ray(c.x, c.z, c.dx, c.dz, step + 0.2);
      c.x += c.dx * step; c.z += c.dz * step; c.left -= step;
      c.m.position.set(c.x, 1.25, c.z);
      c.m.rotation.y += dt * 22;
      if (host) {
        for (const pl of g.players.values()) {
          if (!pl.alive || c.hit.has(pl.id)) continue;
          if (Math.hypot(pl.x - c.x, pl.z - c.z) < 0.7) { c.hit.add(pl.id); g.hurtPlayer(pl, 18, { x: c.x - c.dx, z: c.z - c.dz }, 0.6); }
        }
      }
      if (wall.d < step + 0.2 || c.left <= 0) {
        c.m.visible = false; c.done = true;
        if (wall.d < step + 0.2) { g.fx.hard(c.x, 1.2, c.z, wall.nx, wall.nz, c.dx, c.dz); audio.play('hard', { x: c.x, z: c.z, vol: 0.7 }); }
      }
    }
    this.cleavers = this.cleavers.filter((c) => !c.done);
  }
}

// ---------------------------------------------------------------- the host's decisions --
const MOVES = {
  warden: ['charge'], patientzero: ['bile'], butcher: ['cleaver'], foreman: ['leap'], omega: ['scream'],
};

export class BossBrain {
  constructor(z) {
    this.z = z;
    this.cd = 3.5;          // the first move comes a few seconds in
    this.cd2 = 6;           // the berserk Omega's charge
    this.act = null;
  }

  // true while a move owns the boss this frame (Zombie.think skips its normal walk and bite)
  think(dt, best, dist) {
    const z = this.z, g = z.game;
    const a = this.act;
    if (z.type === 'omega' && !z.enraged && z.hp < z.maxHp * 0.5) {
      z.enraged = true;
      g.emit({ k: 'boss', a: 'enrage', id: z.id, x: z.x, z: z.z });
      g.bossFx.event({ a: 'enrage', id: z.id, x: z.x, z: z.z });
    }
    if (a) {
      a.t += dt;
      return this[a.name](dt, a, best);
    }
    this.cd -= dt; this.cd2 -= dt;
    if (!best || z.state !== 'walk') return false;
    if (g.side?.active) return this.think2D(best, dist);      // level 5's side-scrolling fight has its own moves
    const move = MOVES[z.type][0];
    if (z.enraged && this.cd2 <= 0 && dist > 4 && dist < 15) { this.cd2 = 5.5; return this.startCharge(best, dist); }
    if (this.cd > 0) return false;
    const ot = z.overtime ? 0.7 : 1;      // the Foreman's overtime
    if (move === 'charge' && dist > 4.5 && dist < 16) { this.cd = 6 + Math.random() * 2; return this.startCharge(best, dist); }
    if (move === 'bile' && dist > 3 && dist < 18) { this.cd = 4.5 + Math.random(); return this.begin('bileWind', { tx: best.x, tz: best.z }); }
    if (move === 'cleaver' && dist > 2.5 && dist < 17) { this.cd = 3.2 + Math.random(); return this.begin('cleaverWind', { tx: best.x, tz: best.z }); }
    if (move === 'leap' && dist > 3.5 && dist < 14) { this.cd = (5.5 + Math.random() * 1.5) * ot; return this.startLeap(best); }
    if (move === 'scream') { this.cd = 10 + Math.random() * 2; return this.begin('scream', {}); }
    return false;
  }

  // ---- Omega in the side-scroller: spit at whoever is up on a platform, slam the floor (a shockwave to jump), charge
  // when berserk, scream the horde in now and then
  think2D(best, dist) {
    const z = this.z, g = z.game;
    const high = [...g.players.values()].filter((p) => p.alive && (p.y2 || 0) > 1.5);
    if (this.cd <= 0 && high.length && Math.random() < 0.7) { this.cd = 2.4 + Math.random(); const p = high[(Math.random() * high.length) | 0]; return this.begin('spitWind', { tx: p.x, ty: (p.y2 || 0) + 0.9 }); }
    if (z.enraged && this.cd2 <= 0 && dist > 4 && dist < 15) { this.cd2 = 5.5; return this.startCharge(best, dist); }
    if (this.cd <= 0 && dist < 10) { this.cd = 4.2 + Math.random() * 1.5; return this.begin('quakeWind', {}); }
    if (this.cd <= -4) { this.cd = 3; return this.begin('scream', {}); }
    return false;
  }
  quakeWind(dt, a) {
    if (a.t < 0.95) return true;
    this.emit({ a: 'quake', x: +this.z.x.toFixed(2) });
    return this.end(0.9);
  }
  spitWind(dt, a) {
    if (a.t < 0.5) return true;
    const z = this.z, h = 1.8 * z.char.root.scale.x;
    this.emit({ a: 'spit', x: +z.x.toFixed(2), y: +(h * 0.85).toFixed(2), tx: +a.tx.toFixed(2), ty: +a.ty.toFixed(2) });
    return this.end(0.35);
  }

  begin(name, o) { this.act = { name, t: 0, ...o }; this.z.setState('windup'); this.face(o.tx, o.tz); this.wind(name); return true; }
  // every machine poses the wind-up of the move that is coming; the boss says something about it
  wind(name) {
    const m = { bileWind: 'bile', cleaverWind: 'cleaver', scream: 'scream', chargeWind: 'charge', leapWind: 'leap', quakeWind: 'quake', spitWind: 'spit' }[name] || name;
    this.emit({ a: 'wind', m });
    this.z.game.speech?.hostLine(this.z, m, 0.7);
  }
  end(rest = 0) { this.act = rest ? { name: 'rest', t: 0, dur: rest } : null; this.z.setState(rest ? 'stagger' : 'walk'); this.z.staggerFor = rest; return true; }
  face(tx, tz) { if (tx !== undefined) this.z.face = Math.atan2(tx - this.z.x, tz - this.z.z); }
  emit(e) { const g = this.z.game; e.k = 'boss'; e.id = this.z.id; g.emit(e); g.bossFx.event(e); }

  rest(dt, a) { if (a.t > a.dur) { this.act = null; this.z.setState('walk'); } return true; }

  // ---- CHARGE: wind up behind a red lane, then run it, flattening whoever is in it
  startCharge(best, dist) {
    const z = this.z;
    const dx = (best.x - z.x) / dist, dz = (best.z - z.z) / dist;
    const len = Math.min(16, dist + 4);
    this.act = { name: 'chargeWind', t: 0, dx, dz, len };
    z.setState('windup');
    this.wind('charge');
    z.face = Math.atan2(dx, dz);
    this.emit({ a: 'lane', x: +z.x.toFixed(2), z: +z.z.toFixed(2), dx: +dx.toFixed(3), dz: +dz.toFixed(3), len: +len.toFixed(1), dur: 0.95 });
    return true;
  }
  chargeWind(dt, a) {
    if (a.t > 0.95) { this.act = { name: 'charging', t: 0, dx: a.dx, dz: a.dz, len: a.len, gone: 0, hit: new Set() }; this.z.setState('walk'); this.emit({ a: 'charge', dur: 1.8 }); }
    return true;
  }
  charging(dt, a) {
    const z = this.z, g = z.game;
    // he drives up to speed over the first strides instead of starting at full tilt
    const step = 10 * dt * Math.min(1, 0.35 + a.t / 0.35);
    const res = g.side?.active ? g.side.resolve(z.x + a.dx * step, z.z + a.dz * step) : g.world.col.resolve(z.x + a.dx * step, z.z + a.dz * step, 0.5);
    const moved = Math.hypot(res.x - z.x, res.z - z.z);
    z.x = res.x; z.z = res.z;
    a.gone += moved;
    for (const p of g.players.values()) {
      if (!p.alive || a.hit.has(p.id)) continue;
      if (Math.hypot(p.x - z.x, p.z - z.z) < 1.6 && (p.y2 || 0) < 2.2) { a.hit.add(p.id); g.hurtPlayer(p, z.enraged ? 34 : z.type === 'warden' ? 20 : 28, { x: z.x - a.dx, z: z.z - a.dz }, 2.6); }
    }
    if (Math.random() < 0.6) g.fx.smoke.emit({ x: z.x, y: 0.2, z: z.z, vx: -a.dx * 2, vy: 0.4, vz: -a.dz * 2, life: 1.0, s0: 0.5, s1: 1.8, r: 0.5, g: 0.47, b: 0.43, a0: 0.35, a1: 0, drag: 1 });
    // stops at the end of the lane, or against a wall (and is dazed a moment: the time to unload on him)
    if (a.gone >= a.len || moved < step * 0.3) {
      g.cam.trauma(0.25);
      // the stop: the body keeps going for a beat (a lurch forward), a skid of dust
      z.anim.springs.spineX.kick(14); z.anim.springs.headX.kick(16);
      this.emit({ a: 'skid', x: +z.x.toFixed(2), z: +z.z.toFixed(2), dx: +a.dx.toFixed(3), dz: +a.dz.toFixed(3) });
      return this.end(moved < step * 0.3 ? 1.4 : 0.8);
    }
    return true;
  }

  // ---- BILE: three globs lobbed at you and around you
  bileWind(dt, a) {
    if (a.t < 0.7) return true;
    const z = this.z;
    const t = [[a.tx, a.tz]];
    for (let i = 0; i < 2; i++) { const ang = Math.random() * 6.283, r = 1.8 + Math.random() * 1.6; t.push([a.tx + Math.cos(ang) * r, a.tz + Math.sin(ang) * r]); }
    this.emit({ a: 'bile', x: +z.x.toFixed(2), z: +z.z.toFixed(2), t: t.map(([x, zz]) => [+x.toFixed(2), +zz.toFixed(2)]), dur: 1.05 });
    return this.end(0.5);
  }

  // ---- CLEAVERS: a fan of three, aimed where you are
  cleaverWind(dt, a) {
    if (a.t < 0.55) return true;
    const z = this.z;
    const base = Math.atan2(a.tx - z.x, a.tz - z.z);
    const d = [-0.22, 0, 0.22].map((o) => [+Math.sin(base + o).toFixed(3), +Math.cos(base + o).toFixed(3)]);
    this.emit({ a: 'cleaver', x: +(z.x + Math.sin(base) * 0.8).toFixed(2), z: +(z.z + Math.cos(base) * 0.8).toFixed(2), d, v: 12, range: 20 });
    return this.end(0.35);
  }

  // ---- GROUND SLAM: a leap to where you stand, a shockwave when he lands
  startLeap(best) {
    const z = this.z, g = z.game;
    const to = g.world.col.resolve(best.x, best.z, 0.6);
    this.act = { name: 'leapWind', t: 0, x1: to.x, z1: to.z };
    z.setState('windup');
    this.wind('leap');
    this.face(to.x, to.z);
    this.emit({ a: 'ring', x: +to.x.toFixed(2), z: +to.z.toFixed(2), r: 4.5, dur: 1.5 });
    return true;
  }
  leapWind(dt, a) {
    if (a.t < 0.5) return true;
    const z = this.z;
    this.act = { name: 'leaping', t: 0, x0: z.x, z0: z.z, x1: a.x1, z1: a.z1, dur: 1.0 };
    this.emit({ a: 'leap', x0: +z.x.toFixed(2), z0: +z.z.toFixed(2), x1: +a.x1.toFixed(2), z1: +a.z1.toFixed(2), dur: 1.0 });
    return true;
  }
  leaping(dt, a) {
    const z = this.z, g = z.game;
    const u = Math.min(1, a.t / a.dur);
    z.x = a.x0 + (a.x1 - a.x0) * u; z.z = a.z0 + (a.z1 - a.z0) * u;
    if (u < 1) return true;
    for (const p of g.players.values()) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - z.x, p.z - z.z);
      if (d < 4.5) g.hurtPlayer(p, Math.round(40 * (1 - d / 4.5 * 0.5)), { x: z.x, z: z.z }, 3.2);
    }
    this.emit({ a: 'slam', x: +z.x.toFixed(2), z: +z.z.toFixed(2), r: 4.5 });
    return this.end(1.1);
  }

  // ---- SUMMON: a scream that calls a pack of runners in from the dark
  scream(dt, a) {
    const z = this.z, g = z.game;
    if (!a.done && a.t > 0.5) {
      a.done = true;
      this.emit({ a: 'scream', x: +z.x.toFixed(2), z: +z.z.toFixed(2) });
      for (let i = 0; i < (g.side?.active ? 3 : 5) + 2 * (g.players.size - 1); i++) g.spawnZombie('runner');
    }
    if (a.t > 1.2) return this.end(0);
    return true;
  }
}
