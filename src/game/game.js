// One play session of a level: world, players, the dead, the director, the
// camera, and the network glue. Solo play is simply a host with no friends.
import * as THREE from 'three';
import { World, cutaway } from './world.js';
import { FX } from './fx.js';
import { Player, PISTOL } from './player.js';
import { Zombie } from './zombie.js';
import { audio, buzz } from './audio.js';
import { loadWeapon } from './assets.js';
import { nightEnvironment, isTouch } from './engine.js';
import { perlin1 } from './noise.js';
import { dressGround, tickFog } from './dress.js';

// ------------------------------------------------------------- camera --
class CameraRig {
  constructor(cam) {
    this.cam = cam;
    this.focus = new THREE.Vector3();
    this.lead = new THREE.Vector3();
    this.kickV = new THREE.Vector3();
    this.kickX = new THREE.Vector3();
    this.tr = 0;
    this.t = 0;
    const q = new URLSearchParams(location.search);
    const zoom = parseFloat(q.get('zoom') || '1');
    this.height = 13.4 * zoom;
    this.back = 8.5 * zoom;
  }
  kick(x, z) { this.kickV.x += x * 22; this.kickV.z += z * 22; }
  trauma(a) { this.tr = Math.min(1, this.tr + a); }
  update(dt, target, aimx, aimz, aiming) {
    this.t += dt;
    // lead toward where you're aiming so you see what you shoot at
    const lx = aiming ? aimx * 2.4 : 0, lz = aiming ? aimz * 1.8 : 0;
    this.lead.x += (lx - this.lead.x) * Math.min(1, dt * 2.5);
    this.lead.z += (lz - this.lead.z) * Math.min(1, dt * 2.5);
    const k = Math.min(1, dt * 6);
    this.focus.x += (target.x + this.lead.x - this.focus.x) * k;
    this.focus.z += (target.z + this.lead.z - this.focus.z) * k;
    // kick: a critically damped spring back to rest in ~100 ms, solved
    // exactly (explicit Euler at w*dt > 1 blows up and flings the camera away)
    const w = 38, e = Math.exp(-w * dt);
    for (const ax of ['x', 'z']) {
      const x0 = this.kickX[ax], v0 = this.kickV[ax], c = v0 + w * x0;
      this.kickX[ax] = (x0 + c * dt) * e;
      this.kickV[ax] = (v0 - w * c * dt) * e;
    }
    // trauma shake (Eiserloh): squared, smooth noise, mostly rotational
    this.tr = Math.max(0, this.tr - dt * 1.8);
    const s = this.tr * this.tr;
    const n = (o) => perlin1(this.t * 22 + o);
    const c = this.cam;
    c.position.set(this.focus.x + this.kickX.x + n(10) * s * 0.3, this.height + n(20) * s * 0.15, this.focus.z + this.back + this.kickX.z + n(30) * s * 0.3);
    c.lookAt(this.focus.x + this.kickX.x * 0.5, 0, this.focus.z + this.kickX.z * 0.5);
    c.rotateZ(n(40) * s * 0.026);
    c.rotateX(n(50) * s * 0.012);
  }
}

// -------------------------------------------------------------- waves --
// Dead Signal level 1. `n` bodies per wave (per player: +60%), `every` seconds
// between arrivals. Waves open fast: the first of the dead is on screen
// within seconds, they come out of the dark at the edge of the picture.
const WAVES = [
  { n: 12, lurch: 0.0, runner: 0.0, every: 0.9 },
  { n: 19, lurch: 0.12, runner: 0.0, every: 0.75 },
  { n: 27, lurch: 0.18, runner: 0.12, every: 0.6 },
  { n: 36, lurch: 0.22, runner: 0.2, every: 0.5 },
  { n: 48, lurch: 0.25, runner: 0.28, every: 0.4 },
];

export class Game {
  constructor(engine, hud, input, net, opts) {
    this.engine = engine;
    this.hud = hud;
    this.input = input;
    this.net = net;
    this.role = net?.role || 'solo';
    this.isHost = this.role !== 'client';
    this.opts = opts;
    this.scene = engine.scene;
    this.camera = engine.camera;
    this.touch = isTouch;
    this.quality = { shadow: isTouch ? 1024 : 2048 };
    this.zombies = new Map();
    this.players = new Map();
    this.nextZid = 1;
    this.time = 0;
    this.hitstop = 0;
    this.phase = 'intro';
    this.phaseT = 0;
    this.wave = 0;
    this.spawned = 0;
    this.spawnT = 0;
    this.stats = { kills: 0, shots: 0, hits: 0, crits: 0 };
    this.snapT = 0;
    this.inT = 0;
    this.navT = 0;
    this.thunderT = 30 + Math.random() * 40;
    this.sirenT = 15;
    this.wind = { x: 0.6, z: 0.3, gust: 0 };
    this.over = false;
    this.events = [];
    this.medkits = [];
  }

  async init() {
    const s = this.scene;
    s.background = new THREE.Color(0x0a0f16);
    s.fog = new THREE.FogExp2(0x101822, 0.019);
    s.environment = nightEnvironment(this.engine.renderer);
    s.environmentIntensity = 1.0;
    this.world = new World(s);
    this.fx = new FX(s, this.world);
    this.corpses = [];
    this.pistolModel = await loadWeapon('pistol');
    this.cam = new CameraRig(this.camera);
    dressGround(this);
    this.engine.onLowTier = () => { this.world.moon.castShadow = false; this.hud.toast?.('Performance mode'); };
    const spawn = [[0, 1.2], [1.4, 1.6], [-1.4, 1.6], [0, 2.6]];
    for (const p of this.opts.players) {
      const pl = new Player(this, p.id, { name: p.name, model: p.model, local: p.id === this.opts.localId, seat: p.seat });
      const sp = spawn[p.seat % 4];
      pl.spawnAt(sp[0], sp[1]);
      this.players.set(p.id, pl);
    }
    this.me = this.players.get(this.opts.localId);
    this.cam.focus.set(this.me.x, 0, this.me.z);
    if (!this.opts.attract) {
      this.hud.ammo(this.me);
      this.hud.health(this.me.hp);
      this.hud.team([...this.players.values()], this.me);
    }
    this.world.nav.build([...this.players.values()]);
    // (main.js routes network messages here once the level is running)
    // warm up shaders while the title card shows
    this.engine.renderer.compile(s, this.camera);
  }

  start() {
    audio.ambience();
    if (this.opts.attract) { this.setupAttract(); return; }
    this.setPhase('intro');
  }

  // the menu backdrop: an empty checkpoint, the dead wandering in the rain
  setupAttract() {
    this.phase = 'attract';
    const me = this.me;
    me.dead = true;
    me.char.root.visible = false;
    me.gun.visible = false;
    me.light.visible = false;
    me.lantern.intensity = 0;
    me.laser.visible = false;
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * 6.28, r = 6 + Math.random() * 14;
      const z = this.addZombie(this.nextZid++, { type: 'shambler', seed: (Math.random() * 1e6) | 0, x: Math.cos(a) * r, z: Math.sin(a) * r });
      z.wander = { x: (Math.random() - 0.5) * 30, z: (Math.random() - 0.5) * 30 };
      z.face = Math.random() * 6.28;
    }
    // a searchlight sweeping the street instead of a flashlight
    this.search = new THREE.SpotLight(0xdfe8ff, 260, 60, 0.22, 0.6, 1.2);
    this.search.castShadow = true;
    this.search.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.search, this.search.target);
  }

  updateAttract(dt) {
    const t = this.time;
    const me = this.me;
    me.x = Math.sin(t * 0.05) * 5 - 2;
    me.z = Math.cos(t * 0.04) * 4 - 2;
    for (const z of this.zombies.values()) { z.think(dt, []); z.update(dt, this.camera); }
    this.search.position.set(-14, 16, -18);
    this.search.target.position.set(Math.sin(t * 0.21) * 9, 0, Math.cos(t * 0.13) * 7);
    this.world.update(this.time, dt, me, this.wind);
    this.wind.gust = Math.max(0, perlin1(this.time * 0.25) * 1.4);
    this.ambient(dt);
    this.cam.update(dt, { x: me.x + 6, z: me.z }, 0, 0, false);
    audio.setListener(me.x, me.z);
    const scale = this.engine.h * this.engine.renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    this.fx.update(dt, this.camera, me, scale, this.wind);
    tickFog(this, dt, this.wind);
  }

  // ---------------------------------------------------------- phases --
  setPhase(p, extra = {}) {
    this.phase = p;
    this.phaseT = 0;
    if (p === 'intro') this.hud.banner('LEVEL 1', 'The Checkpoint', 3.2, 'Hold the intersection. The evac signal is coming.');
    if (p === 'wave') {
      this.spawned = 0;
      this.spawnT = 0.3;
      const w = WAVES[this.wave];
      this.waveTotal = Math.round(w.n * (1 + 0.6 * (this.players.size - 1)));
      this.hud.banner(`WAVE ${this.wave + 1}`, this.wave === WAVES.length - 1 ? 'They heard the signal' : '', 2.2);
      audio.play('sting', { vol: 0.7, jitter: 0 });
      // the fallen get back up at the start of a wave
      for (const pl of this.players.values()) if (pl.dead && pl.local) { pl.revive(); this.hud.health(pl.hp); }
    }
    if (p === 'break') {
      this.hud.banner(`WAVE ${this.wave + 1} CLEARED`, '', 2.4);
      if (this.wave < WAVES.length - 1) this.spawnMedkit();
    }
    if (p === 'win') {
      this.hud.banner('SIGNAL ACQUIRED', 'Evac is inbound', 3);
      this.endAt = this.time + 3.5;
    }
    if (this.isHost && this.role === 'host') this.net.broadcast({ t: 'phase', p, wave: this.wave, total: this.waveTotal || 0 });
    this.hud.wave(this.phase, this.wave, WAVES.length, this.remaining(), this.waveTotal || 0);
  }

  remaining() {
    if (this.phase !== 'wave') return 0;
    if (!this.isHost && this.leftNet !== undefined) return this.leftNet;
    let alive = 0;
    for (const z of this.zombies.values()) if (z.alive) alive++;
    return (this.waveTotal - this.spawned) + alive;
  }

  director(dt) {
    this.phaseT += dt;
    if (this.phase === 'intro' && this.phaseT > 3.0) this.setPhase('wave');
    else if (this.phase === 'wave') {
      const w = WAVES[this.wave];
      const cap = 24 + 8 * (this.players.size - 1) + this.wave * 4;
      let alive = 0;
      for (const z of this.zombies.values()) if (z.alive) alive++;
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.spawned < this.waveTotal && alive < cap) {
        this.spawnT = w.every * (0.6 + Math.random() * 0.8);
        const roll = Math.random();
        this.spawnZombie(roll < w.runner ? 'runner' : roll < w.runner + w.lurch ? 'lurcher' : 'shambler');
      }
      if (this.spawned >= this.waveTotal && alive === 0) {
        if (this.wave >= WAVES.length - 1) this.setPhase('win');
        else this.setPhase('break');
      }
    } else if (this.phase === 'break' && this.phaseT > 6) {
      this.wave++;
      this.setPhase('wave');
    } else if (this.phase === 'win' && this.time > this.endAt && !this.over) {
      this.finish(true);
    }
    // everyone down?
    if (!this.over && this.phase !== 'intro' && [...this.players.values()].every((p) => !p.alive)) {
      this.finish(false);
    }
  }

  // Out of sight, but not far: a free, reachable bit of street 15-30 m from the
  // nearest survivor that is off the edge of the screen. Falls back to the
  // far street ends.
  pickSpawn() {
    const pls = [...this.players.values()];
    const nav = this.world.nav, b = this.world.bounds, v = new THREE.Vector3();
    for (let i = 0; i < 90; i++) {
      const x = b.minX + Math.random() * (b.maxX - b.minX), z = b.minZ + Math.random() * (b.maxZ - b.minZ);
      const k = nav.idx(x, z);
      if (k < 0 || nav.block[k] || nav.dist[k] > 1e8) continue;
      const d = Math.min(...pls.map((p) => Math.hypot(p.x - x, p.z - z)));
      if (d < 15 || d > 30) continue;
      let seen = false;
      for (const p of pls) {
        if (!p.local) continue;
        v.set(x, 1, z).project(this.camera);
        if (Math.abs(v.x) < 1.12 && Math.abs(v.y) < 1.12) seen = true;
      }
      if (seen) continue;
      return { x, z };
    }
    const far = this.world.spawns.map((s) => ({ s, d: Math.min(...pls.map((p) => Math.hypot(p.x - s.x, p.z - s.z))) }))
      .filter((c) => c.d > 12).sort(() => Math.random() - 0.5)[0];
    return far ? far.s : this.world.spawns[(Math.random() * this.world.spawns.length) | 0];
  }

  // host: a body stuck behind something is put somewhere else on the road
  relocate(z) {
    const s = this.pickSpawn();
    z.x = s.x; z.z = s.z; z.px = s.x; z.pz = s.z;
  }

  spawnZombie(type) {
    const c = this.pickSpawn();
    const id = this.nextZid++;
    const seed = (Math.random() * 1e6) | 0;
    const x = c.x + (Math.random() - 0.5) * 1.2, z = c.z + (Math.random() - 0.5) * 1.2;
    this.addZombie(id, { type, seed, x, z });
    this.spawned++;
    this.netEvent({ k: 'zspawn', id, type, seed, x: +x.toFixed(2), z: +z.toFixed(2), model: this.zombies.get(id).model });
  }

  addZombie(id, o) {
    const z = new Zombie(this, id, o);
    this.zombies.set(id, z);
    // corpses are permanent, up to a point
    const dead = [...this.zombies.values()].filter((q) => !q.alive);
    if (dead.length > 26) { const old = dead[0]; old.dispose(); this.zombies.delete(old.id); }
    return z;
  }

  spawnMedkit() {
    const x = (Math.random() - 0.5) * 6, z = -1 + Math.random() * 3;
    const id = 'm' + this.time.toFixed(2);
    this.addMedkit(id, x, z);
    this.netEvent({ k: 'medkit', id, x, z });
  }

  addMedkit(id, x, z) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.3), new THREE.MeshStandardMaterial({ color: 0x1f3d2a, roughness: 0.6 }));
    box.position.y = 0.09;
    const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.05), new THREE.MeshStandardMaterial({ color: 0xdcdcd0, emissive: 0x335533, emissiveIntensity: 1 }));
    cross1.position.y = 0.185;
    const cross2 = cross1.clone();
    cross2.rotation.y = Math.PI / 2;
    g.add(box, cross1, cross2);
    g.position.set(x, 0, z);
    box.castShadow = true;
    this.scene.add(g);
    this.medkits.push({ id, x, z, g });
  }

  takeMedkit(id) {
    const i = this.medkits.findIndex((m) => m.id === id);
    if (i < 0) return;
    this.scene.remove(this.medkits[i].g);
    this.medkits.splice(i, 1);
  }

  // ---------------------------------------------------------- combat --
  // a local player's bullet hit zombie z
  localHit(pl, z, dmg, dx, dz, crit) {
    this.stats.hits++;
    if (crit) this.stats.crits++;
    if (this.isHost) {
      const killed = z.damage(dmg, dx, dz, crit, pl.id);
      if (killed) this.onKill(z, dx, dz, crit, pl.id === this.me.id, pl.id);
      else this.netEvent({ k: 'zhit', id: z.id, dx, dz, crit: crit ? 1 : 0 });
    } else {
      this.net.toHost({ t: 'hit', id: z.id, dmg, dx, dz, crit: crit ? 1 : 0 });
    }
  }

  onKill(z, dx, dz, crit, mine, byId = null) {
    if (mine) {
      this.stats.kills++;
      this.hitstop = crit ? 0.07 : 0.045;       // a beat of weight on kills only
      buzz([0, 25]);
      this.hud.killConfirm();
    }
    setTimeout(() => this.fx.pool(z.x + dx * 0.6, z.z + dz * 0.6), 450);
    if (this.isHost) this.netEvent({ k: 'zdie', id: z.id, dx, dz, crit: crit ? 1 : 0, by: byId });
    if (this.phase === 'wave') {
      let alive = 0;
      for (const q of this.zombies.values()) if (q.alive) alive++;
      if (alive === 0 && this.spawned >= this.waveTotal) this.hitstop = 0.14;   // the last one of a wave
    }
    this.hud.wave(this.phase, this.wave, WAVES.length, this.remaining(), this.waveTotal || 0);
  }

  // host: a zombie's bite connects
  hurtPlayer(p, dmg, z) {
    if (p.local) p.hurt(dmg, z.x, z.z);
    else this.net.send(p.id, { t: 'hurt', dmg, fx: z.x, fz: z.z });
    audio.play('scream', { x: z.x, z: z.z, vol: 0.55 });
  }

  emit(e) {
    if (e.k === 'lurch') { const z = this.zombies.get(e.id); if (z) audio.zombie('scream', z.x, z.z, 1); }
    this.netEvent(e);
  }

  // events travel host -> everyone; a client's own events go to the host
  netEvent(e) {
    if (!this.net || this.role === 'solo') return;
    if (this.role === 'host') this.net.broadcast({ t: 'ev', e });
    else if (e.k === 'shot' || e.k === 'reload') this.net.toHost({ t: 'ev', e });
  }

  // ------------------------------------------------------------- net --
  onNet(from, m) {
    if (m.t === 'in' && this.isHost) {
      const p = this.players.get(from);
      if (p) this.applyRemote(p, m);
    } else if (m.t === 'snap' && !this.isHost) {
      this.applySnap(m);
    } else if (m.t === 'ev') {
      this.applyEvent(m.e, from);
      if (this.isHost && (m.e.k === 'shot' || m.e.k === 'reload')) this.net.broadcast(m, true, from);
    } else if (m.t === 'hit' && this.isHost) {
      const z = this.zombies.get(m.id);
      if (!z || !z.alive) return;
      const killed = z.damage(m.dmg, m.dx, m.dz, !!m.crit, from);
      z.hitFx(m.dx, m.dz, !!m.crit);
      this.fx.flesh(z.x, 1.25, z.z, m.dx, m.dz, 1, !!m.crit);
      if (killed) this.onKill(z, m.dx, m.dz, !!m.crit, false, from);
      else this.net.broadcast({ t: 'ev', e: { k: 'zhit', id: z.id, dx: m.dx, dz: m.dz, crit: m.crit } }, true, from);
    } else if (m.t === 'hurt') {
      this.me.hurt(m.dmg, m.fx, m.fz);
    } else if (m.t === 'revive') {
      this.me.revive();
      this.hud.health(this.me.hp);
      this.hud.banner('', 'You were pulled back up', 1.5);
    } else if (m.t === 'phase' && !this.isHost) {
      this.wave = m.wave;
      this.waveTotal = m.total;
      if (m.p !== this.phase) this.setPhase(m.p);
    } else if (m.t === 'end' && !this.isHost) {
      this.finish(m.win);
    } else if (m.t === 'medkit_take') {
      this.takeMedkit(m.id);
      if (this.isHost) this.net.broadcast({ t: 'medkit_take', id: m.id }, true, from);
    }
  }

  applyEvent(e, from) {
    if (e.k === 'zspawn' && !this.isHost) this.addZombie(e.id, e);
    else if (e.k === 'zdie') {
      const z = this.zombies.get(e.id);
      if (z && z.alive) { z.hitFx(e.dx, e.dz, !!e.crit); z.die(e.dx, e.dz, !!e.crit); this.onKill(z, e.dx, e.dz, !!e.crit, e.by === this.me.id); }
    } else if (e.k === 'zhit') {
      const z = this.zombies.get(e.id);
      if (z) { z.hitFx(e.dx, e.dz, !!e.crit); this.fx.flesh(z.x, 1.25, z.z, e.dx, e.dz, 1, !!e.crit); }
    } else if (e.k === 'shot') {
      const p = this.players.get(e.pid);
      if (p && !p.local) p.remoteShot(e);
    } else if (e.k === 'reload') {
      const p = this.players.get(e.pid);
      if (p && !p.local) { p.anim.reload = 0.01; p.remoteReload = 1.4; audio.play('mag_out', { x: p.x, z: p.z, vol: 0.6 }); }
    } else if (e.k === 'lurch') {
      const z = this.zombies.get(e.id);
      if (z) { z.anim.doLurch(); if (!this.isHost) audio.zombie('scream', z.x, z.z, 1); }
    } else if (e.k === 'medkit' && !this.isHost) this.addMedkit(e.id, e.x, e.z);
  }

  applyRemote(p, m) {
    p.buf.push({ t: performance.now(), x: m.x, z: m.z, f: m.f });
    if (p.buf.length > 20) p.buf.shift();
    p.aimx = m.ax; p.aimz = m.az; p.aiming = !!(m.fl & 1);
    p.hp = m.hp;
    p.down = !!(m.fl & 2);
    p.dead = !!(m.fl & 4);
  }

  applySnap(m) {
    const now = performance.now();
    if (m.l !== undefined && m.l !== this.leftNet) {
      this.leftNet = m.l;
      this.hud.wave(this.phase, this.wave, WAVES.length, m.l, this.waveTotal || 0);
    }
    for (const r of m.p) {
      const [id, x, z, f, ax, az, hp, fl] = r;
      if (id === this.me.id) continue;
      const p = this.players.get(id);
      if (p) this.applyRemote(p, { x, z, f, ax, az, hp, fl });
    }
    for (const r of m.z) {
      const [id, x, z, f, st] = r;
      const zb = this.zombies.get(id);
      if (!zb || !zb.alive) continue;
      zb.buf.push({ t: now, x, z, f });
      if (zb.buf.length > 12) zb.buf.shift();
      zb.state = ['walk', 'windup', 'stagger', 'recover'][st] || 'walk';
    }
  }

  // render remote things 110 ms in the past, between two known samples
  interp(o, delay = 110) {
    const b = o.buf;
    if (!b.length) return;
    const t = performance.now() - delay;
    let i = b.length - 1;
    while (i > 0 && b[i - 1].t > t) i--;
    const a = b[Math.max(0, i - 1)], c = b[i];
    let k = c.t === a.t ? 1 : (t - a.t) / (c.t - a.t);
    k = Math.max(0, Math.min(1.2, k));
    const nx = a.x + (c.x - a.x) * k, nz = a.z + (c.z - a.z) * k;
    let da = c.f - a.f; da = Math.atan2(Math.sin(da), Math.cos(da));
    o.vx = (nx - o.x) / Math.max(1e-3, this.dt); o.vz = (nz - o.z) / Math.max(1e-3, this.dt);
    o.x = nx; o.z = nz; o.face = a.f + da * Math.min(1, k);
  }

  sendNet(dt) {
    if (this.role === 'client') {
      this.inT -= dt;
      if (this.inT <= 0) {
        this.inT = 1 / 20;
        const p = this.me;
        const fl = (p.aiming ? 1 : 0) | (p.down ? 2 : 0) | (p.dead ? 4 : 0);
        this.net.toHost({ t: 'in', x: +p.x.toFixed(2), z: +p.z.toFixed(2), f: +p.face.toFixed(3), ax: +p.aimx.toFixed(2), az: +p.aimz.toFixed(2), hp: p.hp, fl }, false);
      }
    } else if (this.role === 'host') {
      this.snapT -= dt;
      if (this.snapT <= 0) {
        this.snapT = 1 / 15;
        const P = [...this.players.values()].map((p) => [p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.face.toFixed(3), +p.aimx.toFixed(2), +p.aimz.toFixed(2), p.hp, (p.aiming ? 1 : 0) | (p.down ? 2 : 0) | (p.dead ? 4 : 0)]);
        const Z = [];
        for (const z of this.zombies.values()) {
          if (!z.alive) continue;
          Z.push([z.id, +z.x.toFixed(2), +z.z.toFixed(2), +z.face.toFixed(2), { walk: 0, windup: 1, stagger: 2, recover: 3 }[z.state] || 0]);
        }
        this.net.broadcast({ t: 'snap', p: P, z: Z, l: this.remaining() }, false);
      }
    }
  }

  peerLeft(id) {
    const p = this.players.get(id);
    if (!p) return;
    p.dispose();
    this.players.delete(id);
    this.hud.toast(`${p.name} lost the signal`);
    this.hud.team([...this.players.values()], this.me);
    if (this.role === 'client' && id === this.net.hostId) this.finish(false, 'The host left the game');
  }

  // co-op: stand next to a downed friend to pull them up (host decides)
  revives(dt) {
    if (!this.isHost) return;
    for (const p of this.players.values()) {
      if (!p.down || p.dead) continue;
      const helper = [...this.players.values()].find((o) => o !== p && o.alive && Math.hypot(o.x - p.x, o.z - p.z) < 1.6);
      p.reviveT = helper ? p.reviveT + dt : Math.max(0, p.reviveT - dt);
      if (p.reviveT > 3) {
        p.reviveT = 0;
        if (p.local) { p.revive(); this.hud.health(p.hp); } else this.net.send(p.id, { t: 'revive' });
      }
    }
  }

  finish(win, why = null) {
    if (this.over) return;
    this.over = true;
    if (this.role === 'host') this.net.broadcast({ t: 'end', win });
    const acc = this.stats.shots ? Math.round(100 * this.stats.hits / this.stats.shots) : 0;
    this.hud.end(win, { ...this.stats, acc, wave: this.wave + 1, waves: WAVES.length }, why);
  }

  // a body that has been lying here for days: a zombie put straight into its
  // last pose (never simulated, never in the horde)
  makeCorpse(model, x, z, face) {
    const c = new Zombie(this, -1, { type: 'shambler', model, seed: (x * 37 + z * 11) | 0, x, z });
    c.face = face;
    c.state = 'dead';
    c.anim.deathDir = Math.sin(x * 3 + z) > 0 ? 1 : -1;
    c.anim.dead = 0.001;
    c.fall = 1;
    c.anim.update(1.0, 0, 0);
    c.update(0.016, null);
    c.groanT = 1e9;
    c.char.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    return c;
  }

  // ---------------------------------------------------------- helpers --
  screenToGround(sx, sy) {
    const ndc = new THREE.Vector2(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.2);
    const p = new THREE.Vector3();
    return rc.ray.intersectPlane(plane, p) ? p : null;
  }

  // ------------------------------------------------------------- frame --
  update(dtReal) {
    // hit-stop: the world freezes for a beat, audio and UI keep going
    let dt = dtReal;
    if (this.hitstop > 0) { this.hitstop -= dtReal; dt = dtReal * 0.05; }
    this.dt = dt;
    this.time += dt;
    if (this.opts.attract) { this.updateAttract(dt); return; }
    const me = this.me;
    const inp = this.bot ? this.botInput(dtReal) : this.input.poll(dtReal);
    if (!this.over && !this.paused) {
      const shots = me.ammo;
      me.control(dt, inp, this.camera);
      if (me.ammo < shots) this.stats.shots++;
    }
    // medkits
    for (const m of [...this.medkits]) {
      m.g.rotation.y += dt;
      if (me.alive && me.hp < 100 && Math.hypot(me.x - m.x, me.z - m.z) < 0.9) {
        me.hp = Math.min(100, me.hp + 50);
        this.hud.health(me.hp);
        audio.play('click', { vol: 0.8 });
        this.takeMedkit(m.id);
        if (this.role === 'host') this.net.broadcast({ t: 'medkit_take', id: m.id });
        else if (this.role === 'client') this.net.toHost({ t: 'medkit_take', id: m.id });
      }
    }
    // bleed out: 30 s on the ground alone
    if (me.down && !me.dead && me.downT > 30) { me.dead = true; this.hud.banner('', 'You bled out — back next wave', 2); }
    // remote players
    for (const p of this.players.values()) if (!p.local) this.interp(p);
    // the dead
    if (this.isHost) {
      this.navT -= dt;
      if (this.navT <= 0) { this.navT = 0.3; this.world.nav.build([...this.players.values()].filter((p) => p.alive)); }
      for (const z of this.zombies.values()) z.think(dt, [...this.players.values()]);
      this.director(dt);
      this.revives(dt);
    } else {
      for (const z of this.zombies.values()) if (z.alive) this.interp(z, 120);
    }
    for (const z of this.zombies.values()) z.update(dt, this.camera);
    for (const p of this.players.values()) {
      if (p.remoteReload > 0) { p.remoteReload -= dt; p.anim.reload = 1 - p.remoteReload / 1.4; if (p.remoteReload <= 0) p.anim.reload = 0; }
      p.update(dt);
    }
    // environment
    this.wind.gust = Math.max(0, perlin1(this.time * 0.25) * 1.4);
    this.world.update(this.time, dt, me, this.wind);
    this.ambient(dt);
    this.cam.update(dtReal, me, me.aimx, me.aimz, me.aiming);
    audio.setListener(me.x, me.z);
    const scale = this.engine.h * this.engine.renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    this.fx.update(dt, this.camera, me, scale, this.wind);
    tickFog(this, dt, this.wind);
    for (const c of this.corpses) c.char.root.visible = Math.hypot(c.x - me.x, c.z - me.z) < 24;
    this.updateCutaway();
    // low health: heartbeat and a draining picture
    const low = me.alive ? Math.max(0, (40 - me.hp) / 40) : 0.8;
    this.engine.grade.saturation = -0.06 - low * 0.5;
    this.heartT = (this.heartT || 0) - dtReal;
    if (low > 0 && this.heartT <= 0) { this.heartT = 1.1 - low * 0.4; audio.play('heart', { vol: 0.35 + low * 0.5, jitter: 0 }); }
    this.hud.frame(this, dtReal);
    this.sendNet(dtReal);
  }

  // QA bot: strafe in a slow circle, aim at the nearest of the dead, fire
  botInput(dt) {
    const me = this.me;
    let best = null, bd = 1e9;
    for (const z of this.zombies.values()) {
      if (!z.alive) continue;
      const d = Math.hypot(z.x - me.x, z.z - me.z);
      if (d < bd) { bd = d; best = z; }
    }
    const t = this.time;
    const move = { x: Math.cos(t * 0.4) * 0.35, y: Math.sin(t * 0.4) * 0.35 };
    let aim = null;
    if (best && bd < 13) aim = { x: (best.x - me.x) / bd, y: (best.z - me.z) / bd, mag: 1 };
    return { move, aim, firing: !!aim, tap: false, reload: me.ammo === 0, mouse: null, mouseFiring: false };
  }

  ambient(dt) {
    this.thunderT -= dt;
    if (this.thunderT < 0) {
      this.thunderT = 40 + Math.random() * 50;
      // lightning first, thunder a beat later
      this.flashT = 0.35;
      setTimeout(() => audio.play('thunder', { vol: 0.8, jitter: 0.02, bus: 'amb' }), 600 + Math.random() * 1200);
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = this.flashT > 0.25 || (this.flashT > 0.1 && this.flashT < 0.16) ? 1 : 0;
      this.world.moon.intensity = this.world.moonBase + k * 4;
    } else this.world.moon.intensity = this.world.moonBase;
    this.sirenT -= dt;
    if (this.sirenT < 0) { this.sirenT = 70 + Math.random() * 60; audio.play('siren', { vol: 0.12, bus: 'amb', jitter: 0.05 }); }
  }

  updateCutaway() {
    const r = this.engine.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    cutaway.uRes.value.copy(size);
    const v = new THREE.Vector3();
    let i = 0;
    for (const p of this.players.values()) {
      if (i >= 4) break;
      v.set(p.x, 1.1, p.z).project(this.camera);
      cutaway.uPlayers.value[i].set((v.x * 0.5 + 0.5) * size.x, (v.y * 0.5 + 0.5) * size.y, v.z * 0.5 + 0.5, 0.16);
      i++;
    }
    for (; i < 4; i++) cutaway.uPlayers.value[i].w = 0;
  }

  dispose() {
    for (const z of this.zombies.values()) z.dispose();
    for (const p of this.players.values()) p.dispose();
    this.scene.clear();
    audio.stopAll();
  }
}

export { PISTOL };
