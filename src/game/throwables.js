// Things you throw (Sam, 2026-10-21): a FRAG grenade (bounces, rolls, goes off), a MOLOTOV (shatters into a patch of
// fire that sets the dead alight), and a PIPE BOMB (beeps; every one of the dead nearby turns and shuffles toward it
// before it goes off). You start each level with two frags (the engineer three) and find more in ordnance boxes.
//
// Co-op: the thrower's machine sends one 'throw' event with the start and the velocity; every machine flies the same
// arc and draws the same bang. Only the HOST deals the damage (and lights the fires, and pulls the dead to a pipe
// bomb), crediting the thrower.
import * as THREE from 'three';
import { audio, buzz } from './audio.js';
import { gear } from './gear.js';
import { boomFx, explode } from './objective.js';
import { tex } from './assets.js';

export const NADES = {
  frag: { name: 'FRAG', fuse: 1.7, r: 4.6, zDmg: 330, pDmg: 16, max: 4, color: '#c8d07a' },
  molotov: { name: 'MOLOTOV', r: 2.8, life: 7, dps: 30, burn: { dps: 30, t: 3.5, spread: 1.2 }, max: 3, color: '#ff8a2a' },
  pipe: { name: 'PIPE BOMB', fuse: 4.2, lure: 24, r: 5.6, zDmg: 480, pDmg: 18, max: 2, color: '#ff4a3a' },
};
export const NADE_IDS = Object.keys(NADES);
const MODEL = { frag: 'frag', molotov: 'molotov', pipe: 'pipebomb' };
const G = 15;                     // gravity: a little more than real, so a throw reads as a snap, not a lob
const TAU = Math.PI * 2;

export class Throwables {
  constructor(g) {
    this.g = g;
    this.items = [];
    this.fires = [];
    this.n = 0;
    const me = g.me;
    this.have = { frag: 2 + (me.spec === 'engineer' ? 1 : 0), molotov: 0, pipe: 0 };
    this.sel = 'frag';
    this.cool = 0;
    this.supplies = [];
  }

  view() { return { kind: this.sel, n: this.have[this.sel], any: NADE_IDS.some((k) => this.have[k] > 0) }; }

  cycle() {
    const i = NADE_IDS.indexOf(this.sel);
    for (let k = 1; k <= NADE_IDS.length; k++) {
      const n = NADE_IDS[(i + k) % NADE_IDS.length];
      if (this.have[n] > 0 || k === NADE_IDS.length) { this.sel = n; break; }
    }
    audio.play('click', { vol: 0.5, jitter: 0 });
  }

  // where a throw lands: the aim stick's way, else the mouse, else the thick of the dead ahead, else 8 m ahead
  target(inp) {
    const g = this.g, me = g.me;
    if (inp?.mouse && !g.touch) { const p = g.screenToGround(inp.mouse.x, inp.mouse.y); if (p) return clampTo(me, p.x, p.z, 3, 16); }
    let fx = Math.sin(me.face), fz = Math.cos(me.face);
    if (me.aiming) { fx = me.aimx; fz = me.aimz; }
    let best = null, bs = -1;
    for (const z of g.zombies.values()) {
      if (!z.alive || z.idle) continue;
      const dx = z.x - me.x, dz = z.z - me.z, d = Math.hypot(dx, dz);
      if (d < 3 || d > 15 || (dx * fx + dz * fz) / d < 0.6) continue;
      let crowd = 0;
      for (const o of g.zombies.values()) if (o.alive && (o.x - z.x) ** 2 + (o.z - z.z) ** 2 < 9) crowd++;
      const sc = crowd - d * 0.08;
      if (sc > bs) { bs = sc; best = z; }
    }
    if (best) return { x: best.x, z: best.z };
    return clampTo(me, me.x + fx * 8, me.z + fz * 8, 3, 16);
  }

  // the local survivor throws what is selected
  throw(inp) {
    const g = this.g, me = g.me;
    if (!me.alive || g.over || g.side?.active || g.side?.warping || this.cool > 0) return false;
    if (this.have[this.sel] <= 0) { const k = NADE_IDS.find((n) => this.have[n] > 0); if (!k) { audio.play('deny', { vol: 0.4, jitter: 0 }); return false; } this.sel = k; }
    const tg = this.target(inp);
    const y0 = g.world.groundY(me.x, me.z) + 1.5;
    const sx = me.x + Math.sin(me.face) * 0.3, sz = me.z + Math.cos(me.face) * 0.3;
    const d = Math.hypot(tg.x - sx, tg.z - sz);
    const T = Math.max(0.42, Math.min(0.95, d / 13));
    const ty = g.world.groundY(tg.x, tg.z);
    const e = { k: 'throw', pid: me.id, n: this.sel, id: me.id + ':' + (this.n++), x: +sx.toFixed(2), y: +y0.toFixed(2), z: +sz.toFixed(2), vx: +((tg.x - sx) / T).toFixed(3), vy: +((ty - y0 + 0.5 * G * T * T) / T).toFixed(3), vz: +((tg.z - sz) / T).toFixed(3) };
    this.have[this.sel]--;
    if (this.have[this.sel] <= 0) { const k = NADE_IDS.find((n) => this.have[n] > 0); if (k) this.sel = k; }
    this.cool = 0.6;
    me.face = Math.atan2(tg.x - me.x, tg.z - me.z);
    me.anim.swap = 1;                    // the gun dips while the throwing hand goes
    buzz([12]);
    this.launch(e);
    g.netEvent(e);
    return true;
  }

  // every machine: something is in the air
  launch(e) {
    const g = this.g;
    const mesh = gear(MODEL[e.n]);
    mesh.scale.setScalar(e.n === 'frag' ? 1.6 : 1.4);
    mesh.position.set(e.x, e.y, e.z);
    g.scene.add(mesh);
    const it = { ...e, mesh, t: 0, fuse: NADES[e.n].fuse || 99, rest: false, spin: 8 + Math.random() * 6, beep: 0 };
    this.items.push(it);
    audio.play('throw', { x: e.x, z: e.z, vol: 0.7 });
    if (e.n === 'pipe') this.g.hud.toast?.('Pipe bomb: the dead are drawn to it');
  }

  // ordnance boxes along the level (every machine lays the same ones; whoever touches one takes it)
  laySupplies(spots) {
    const g = this.g;
    spots.forEach(([x, z, kind], i) => {
      const m = gear('supply');
      m.scale.setScalar(1.35);
      m.position.set(x, g.world.groundY(x, z), z);
      m.rotation.y = (i * 1.7) % TAU;
      g.scene.add(m);
      this.supplies.push({ id: 's' + i, x, z, kind, m });
    });
  }

  takeSupply(id) {
    const i = this.supplies.findIndex((s) => s.id === id);
    if (i < 0) return;
    this.g.scene.remove(this.supplies[i].m);
    this.supplies.splice(i, 1);
  }

  update(dt) {
    const g = this.g, me = g.me;
    this.cool = Math.max(0, this.cool - dt);
    // pick up an ordnance box
    for (const s of [...this.supplies]) {
      if (!me.alive || Math.hypot(me.x - s.x, me.z - s.z) > 1.1) continue;
      const N = NADES[s.kind];
      if (this.have[s.kind] >= N.max) continue;
      this.have[s.kind] = Math.min(N.max, this.have[s.kind] + (s.kind === 'pipe' ? 1 : 2));
      this.sel = s.kind;
      g.hud.toast?.(`+${s.kind === 'pipe' ? 1 : 2} ${N.name}${s.kind === 'pipe' ? '' : 'S'}`);
      audio.play('mag_in', { vol: 0.8 });
      this.takeSupply(s.id);
      if (g.role === 'host') g.net.broadcast({ t: 'supply_take', id: s.id });
      else if (g.role === 'client') g.net.toHost({ t: 'supply_take', id: s.id });
    }
    // flying, bouncing, rolling
    for (const it of this.items) {
      it.t += dt;
      const m = it.mesh;
      if (!it.rest) {
        it.vy -= G * dt;
        const nx = it.x + it.vx * dt, nz = it.z + it.vz * dt;
        const sp = Math.hypot(it.vx, it.vz);
        // a wall in the way: a frag (and a pipe) bounces off it; a bottle breaks on it
        if (sp > 0.01 && it.y < 2.6) {
          const hit = g.world.col.ray(it.x, it.z, it.vx / sp, it.vz / sp, sp * dt + 0.12);
          if (hit.d < sp * dt + 0.12) {
            if (it.n === 'molotov') { this.shatter(it); continue; }
            const dot = it.vx * hit.nx + it.vz * hit.nz;
            it.vx = (it.vx - 2 * dot * hit.nx) * 0.45; it.vz = (it.vz - 2 * dot * hit.nz) * 0.45;
            audio.play('mag_drop', { x: it.x, z: it.z, vol: 0.6, rate: 0.8 });
            continue;
          }
        }
        it.x = nx; it.z = nz; it.y += it.vy * dt;
        const gy = g.world.groundY(it.x, it.z) + 0.07;
        if (it.y <= gy) {
          it.y = gy;
          if (it.n === 'molotov') { this.shatter(it); continue; }
          if (Math.abs(it.vy) > 2) audio.play('mag_drop', { x: it.x, z: it.z, vol: 0.55, rate: 0.75 });
          it.vy = Math.abs(it.vy) * 0.3; it.vx *= 0.55; it.vz *= 0.55; it.spin *= 0.5;
          if (it.vy < 0.7) { it.vy = 0; it.vx *= 0.8; it.vz *= 0.8; if (Math.hypot(it.vx, it.vz) < 0.15) it.rest = true; }
        }
        m.rotation.x += it.spin * dt; m.rotation.z += it.spin * 0.6 * dt;
      }
      m.position.set(it.x, it.y, it.z);
      // the pipe bomb: beeping faster, a red blink, and (host) every awake body near it turns toward it
      if (it.n === 'pipe') {
        it.beep -= dt;
        const left = it.fuse - it.t;
        if (it.beep <= 0) {
          it.beep = Math.max(0.12, 0.6 * left / it.fuse);
          audio.play('beep', { x: it.x, z: it.z, vol: 0.55, jitter: 0, maxDist: 40 });
          g.fx.glow.emit({ x: it.x, y: it.y + 0.15, z: it.z, life: 0.12, s0: 0.8, s1: 0.4, r: 1, g: 0.1, b: 0.05, a0: 1, a1: 0 });
        }
        if (g.isHost) g.lure = { x: it.x, z: it.z, r: NADES.pipe.lure, isLure: true, alive: true, until: g.time + 0.3 };
      }
      if (it.n === 'frag' && Math.random() < dt * 20) g.fx.smoke.emit({ x: it.x, y: it.y + 0.1, z: it.z, vx: 0, vy: 0.4, vz: 0, life: 0.6, s0: 0.05, s1: 0.25, r: 0.6, g: 0.6, b: 0.6, a0: 0.25, a1: 0 });
      if (it.t >= it.fuse) this.detonate(it);
    }
    this.items = this.items.filter((it) => !it.done);
    if (g.lure && g.time > g.lure.until) g.lure = null;
    // fire patches
    for (const f of this.fires) {
      f.t += dt;
      const k = Math.min(1, f.t * 3) * Math.min(1, (f.life - f.t) * 0.8);
      f.glow.material.opacity = 0.65 * k * (0.85 + 0.15 * Math.sin(g.time * 13 + f.x));
      for (let i = 0; i < 3; i++) if (Math.random() < dt * 30 * k) {
        const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * f.r;
        g.fx.fire.emit({ x: f.x + Math.cos(a) * r, y: f.y + 0.05, z: f.z + Math.sin(a) * r, vx: g.wind.x * 0.3, vy: 1.2 + Math.random() * 1.2, vz: g.wind.z * 0.3, life: 0.4 + Math.random() * 0.4, s0: 0.55, s1: 0.1, r: 1, g: 0.42 + Math.random() * 0.3, b: 0.1, a0: 0.85, a1: 0 });
      }
      if (Math.random() < dt * 4 * k) g.fx.smoke.emit({ x: f.x + (Math.random() - 0.5) * f.r, y: f.y + 1.2, z: f.z + (Math.random() - 0.5) * f.r, vx: g.wind.x * 0.6, vy: 1, vz: g.wind.z * 0.6, life: 2.5, s0: 0.6, s1: 2.4, r: 0.1, g: 0.09, b: 0.09, a0: 0.3, a1: 0, drag: 0.5 });
      // host: burn whatever is in it (the living, a little)
      if (g.isHost) {
        f.tick -= dt;
        if (f.tick <= 0) {
          f.tick = 0.25;
          for (const z of [...g.zombies.values()]) {
            if (!z.alive || (z.x - f.x) ** 2 + (z.z - f.z) ** 2 > f.r * f.r) continue;
            z.ignite(NADES.molotov.burn, f.pid);
          }
          for (const p of g.players.values()) if (p.alive && (p.x - f.x) ** 2 + (p.z - f.z) ** 2 < (f.r * 0.85) ** 2) g.hurtPlayer(p, 2, { x: f.x, z: f.z }, 0.05);
        }
      }
    }
    this.fires = this.fires.filter((f) => { if (f.t < f.life) return true; g.scene.remove(f.glow); return false; });
  }

  shatter(it) {
    const g = this.g;
    it.done = true;
    g.scene.remove(it.mesh);
    const y = g.world.groundY(it.x, it.z);
    audio.play('glass', { x: it.x, z: it.z, vol: 0.9 });
    audio.play('ignite', { x: it.x, z: it.z, vol: 1.0 });
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * TAU, s = 2 + Math.random() * 5;
      g.fx.fire.emit({ x: it.x, y: y + 0.3, z: it.z, vx: Math.cos(a) * s, vy: 1 + Math.random() * 3, vz: Math.sin(a) * s, life: 0.4 + Math.random() * 0.3, s0: 0.7, s1: 1.4, r: 1, g: 0.5, b: 0.12, a0: 0.9, a1: 0, drag: 3 });
    }
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * TAU, s = 3 + Math.random() * 4;
      g.fx.sparkList.push({ x: it.x, y: y + 0.2, z: it.z, vx: Math.cos(a) * s, vy: 1 + Math.random() * 2, vz: Math.sin(a) * s, t: 0, max: 0.2 + Math.random() * 0.2 });
    }
    const N = NADES.molotov;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(N.r * 2.6, N.r * 2.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex('tex/soft.webp'), color: 0xff6a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(it.x, y + 0.05, it.z);
    glow.renderOrder = 2;
    g.scene.add(glow);
    (g.scorch ??= g.fx.makeDecals('scorch', 40, { y: 0.021, opacity: 0.9 })).add(it.x, it.z, N.r * 2.2, Math.random() * TAU);
    this.fires.push({ x: it.x, y, z: it.z, r: N.r, life: N.life, t: 0, tick: 0, glow, pid: it.pid });
    g.cam.trauma(Math.max(0, 0.3 - Math.hypot(g.me.x - it.x, g.me.z - it.z) / 40));
  }

  detonate(it) {
    const g = this.g, N = NADES[it.n];
    it.done = true;
    g.scene.remove(it.mesh);
    boomFx(g, it.x, it.z, N.r * 0.85);
    if (g.isHost) explode(g, it.x, it.z, N.r, N.zDmg, N.pDmg, it.pid);
    if (it.n === 'pipe' && g.lure && Math.hypot(g.lure.x - it.x, g.lure.z - it.z) < 0.5) g.lure = null;
  }

  dispose() {
    for (const it of this.items) this.g.scene.remove(it.mesh);
    for (const f of this.fires) this.g.scene.remove(f.glow);
    for (const s of this.supplies) this.g.scene.remove(s.m);
  }
}

function clampTo(me, x, z, lo, hi) {
  const dx = x - me.x, dz = z - me.z, d = Math.hypot(dx, dz) || 1;
  const k = Math.max(lo, Math.min(hi, d)) / d;
  return { x: me.x + dx * k, z: me.z + dz * k };
}
