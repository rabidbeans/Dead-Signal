// One play session of a level: world, players, the dead, the director, the
// camera, and the network glue. Solo play is simply a host with no friends.
import * as THREE from 'three';
import { World, NavField, cutaway } from './world.js';
import { FX } from './fx.js';
import { Player } from './player.js';
import { save } from './save.js';
import { WEAPONS, WEAPON_IDS, BOUNTY } from './weapons.js';
import { Zombie, TYPES } from './zombie.js';
import { audio, buzz } from './audio.js';
import { loadWeapon, tex, makeCharacter, ZOMBIES, BOSS_MODELS } from './assets.js';
import { nightEnvironment, isTouch } from './engine.js';
import { perlin1 } from './noise.js';
import { dressGround, tickFog } from './dress.js';
import { openSafeRoom, tickSafeRoom } from './kit.js';
import { BossFX } from './boss.js';
import { Speech } from './speech.js';
import { gearPieces } from './bossgear.js';
import { SideStage } from './side.js';
import { Objective, ring, beam } from './objective.js';
import { tickZones, takeKey, dressKeys, indoors, KEY_COLORS } from './zones.js';

// picking a downed teammate back up: stand this close for this long
const REVIVE_R = 2.4, REVIVE_T = 2.5;
import { L, LV, HOLDS, AMBUSH, MAZE, HOLD_TRIGGER, HOLD_RADIUS, MEDKITS, ZONE_HW, setLevel, zoneAt } from './level.js';
import { mulberry } from './rng.js';
import { Q } from './quality.js';

const _v2 = new THREE.Vector2(), _v3 = new THREE.Vector3();

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
    // (Sam, 2026-10-17: 10% further out than the old 13.4 / 8.5)
    this.height = 14.74 * zoom;
    this.back = 9.35 * zoom;
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

// ------------------------------------------------------------- the route --
// Level 1 is a run, not a siege: sleepers along the avenue, ambushes, and a
// held junction at each checkpoint gate (HOLDS in level.js). The director is
// host-only; clients get the state in every snapshot.
const ATTRACT_Z = 8;

export class Game {
  constructor(engine, hud, input, net, opts) {
    this.engine = engine;
    this.hud = hud;
    this.input = input;
    this.net = net;
    this.role = net?.role || 'solo';
    this.isHost = this.role !== 'client';
    this.opts = opts;
    setLevel(opts.level || 1);
    this.level = LV.id;
    this.cash = 0;             // earned this run; banked into the save when the run ends
    this.banked = false;
    this.scene = engine.scene;
    this.camera = engine.camera;
    this.touch = isTouch;
    this.zombies = new Map();
    this.players = new Map();
    this.nextZid = 1;
    this.time = 0;
    this.timers = [];          // after(): beats on the game clock, gone with the game (a setTimeout outlived a retry)
    this.hitstop = 0;
    this.phase = 'intro';
    this.phaseT = 0;
    this.opened = 0;          // checkpoint gates opened so far
    this.hold = -1;           // index of the hold in progress, or -1
    this.holdT = 0;
    this.holdSpawned = 0;
    this.holdTotal = 0;
    this.holdAway = false;    // nobody near the gate: the clock is paused
    this.spawnT = 0;
    this.trickleT = 6;
    this.ambushed = new Set();
    this.heli = { on: false, t: 0, voice: null };
    this.gateFx = [];
    this.padT = 0;
    this.noise = null;
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
    s.background = new THREE.Color(LV.theme.bg);
    s.fog = new THREE.FogExp2(LV.theme.fog, LV.theme.fogD * 0.75);
    if (Q.env) { s.environment = nightEnvironment(this.engine.renderer); s.environmentIntensity = 1.0; }
    this.world = new World(s);
    this.fx = new FX(s, this.world);
    this.fx.roofed = indoors;
    this.corpses = [];
    this.gunModels = {};
    await Promise.all(WEAPON_IDS.map(async (id) => { this.gunModels[id] = await loadWeapon(WEAPONS[id].model); }));
    this.cam = new CameraRig(this.camera);
    dressGround(this);
    this.engine.onLowTier = () => { this.world.moon.castShadow = false; if (this.groundFog) this.groundFog.pts.visible = false; this.hud.toast?.('Performance mode'); };
    const cp = this.opts.attract ? 0 : (this.opts.checkpoint || 0);
    if (cp > 0) this.openGateTo(cp, true);                      // restart from a checkpoint: the gates behind us are already open
    const baseZ = this.opts.attract ? ATTRACT_Z : cp > 0 ? L.gate[cp - 1] - 5 : L.start.z;
    const spawn = [[0, 0], [1.4, 0.5], [-1.4, 0.5], [0, 1.6]];
    for (const p of this.opts.players) {
      const local = p.id === this.opts.localId;
      const pl = new Player(this, p.id, { name: p.name, model: p.model, local, seat: p.seat, loadout: local && !this.opts.attract ? save.loadout() : null });
      const sp = spawn[p.seat % 4];
      pl.spawnAt(sp[0], baseZ + sp[1]);
      this.players.set(p.id, pl);
    }
    this.me = this.players.get(this.opts.localId);
    this.cam.focus.set(this.me.x, 0, this.me.z);
    if (!this.opts.attract) {
      this.hud.weapon(this.me);
      this.hud.ammo(this.me);
      this.hud.health(this.me.hp, this.me.maxHp);
      this.hud.armor(this.me.armor, this.me.maxArmor);
      this.hud.cash(0);
      this.hud.team([...this.players.values()], this.me);
    }
    this.world.nav.build([...this.players.values()]);
    if (!this.opts.attract) {
      this.buildHeli(); this.layMedkits(); this.bossFx = new BossFX(this); this.speech = new Speech(this); if (this.isHost) this.buildPopulation();
      // the level's own objective at the junction (breakers, nests, the bulldozer) and its hazards (gas tanks, shells)
      this.objective = new Objective(this);
      if (cp > 0) this.objective.skip();
      dressKeys(this, beam);
      // level 5: the boss fight is a side-scroller, built at the evac pad and hidden until the warp
      if (LV.finale === 'heli') this.side = new SideStage(this);
      // a checkpoint restart: the keycards of the stretch already behind us are taken
      if (cp > 0) this.world.keyItems.forEach((k, i) => { if (k.zone < cp) takeKey(this, i, true); });
    } else this.targets = new Map();
    // (main.js routes network messages here once the level is running)
    // warm up shaders while the title card shows
    this.engine.renderer.compile(s, this.camera);
    if (!this.opts.attract) this.warmUp();       // (the menu backdrop is thrown away on PLAY: its warm-up would be wasted)
    this.ready = true;
  }

  // Draw everything once, behind the loading screen. A GPU only gets a texture, a mesh or a shader
  // the first time something using it is drawn, and on a phone each of those is a stall of 5-50 ms:
  // a new zombie model, or the next block of street, showed up as a stutter while moving around.
  // This pays all of it up front: every chunk of the street, one of each zombie, every effect.
  warmUp() {
    const scene = this.scene, extra = [];
    const me = this.me;
    if (!this.opts.attract) {
      const boss = HOLDS.find((h) => h.boss)?.boss;
      [...ZOMBIES, ...(boss ? [BOSS_MODELS[boss]] : [])].forEach((name, i) => {
        try {
          const c = makeCharacter(name);
          c.root.position.set(me.x - 2.5 + i * 0.55, 0, me.z - 3);
          scene.add(c.root);
          extra.push(c);
        } catch (e) { /* a model that did not load is not worth stopping for */ }
      });
      gearPieces().forEach((o, i) => { o.position.set(me.x - 2 + i * 0.4, 0, me.z - 4); scene.add(o); extra.push({ root: o, gear: true }); });
    }
    const saved = [];
    scene.traverse((o) => {
      if (o.isLight) return;
      if (o.isMesh || o.isPoints || o.isLine || o.isGroup) saved.push([o, o.visible, o.frustumCulled]);
      if (o.isMesh || o.isPoints || o.isLine) o.frustumCulled = false;
      if (o.isMesh || o.isPoints || o.isLine || o.isGroup) o.visible = true;
    });
    try {
      this.engine.composer.render(0.016);
      this.engine.composer.render(0.016);
    } catch (e) { console.warn('warm-up', e); }
    for (const [o, v, f] of saved) { o.visible = v; o.frustumCulled = f; }
    for (const c of extra) { scene.remove(c.root); if (c.gear) continue; c.mesh.skeleton?.dispose?.(); c.material.dispose(); }
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
    if (me.lantern) me.lantern.intensity = 0;
    me.laser.visible = false;
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * 6.28, r = 6 + Math.random() * 14;
      const z = this.addZombie(this.nextZid++, { type: 'shambler', seed: (Math.random() * 1e6) | 0, x: Math.cos(a) * r * 0.7, z: ATTRACT_Z + Math.sin(a) * r });
      z.wander = { x: (Math.random() - 0.5) * 16, z: ATTRACT_Z + (Math.random() - 0.5) * 30 };
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
    me.x = Math.sin(t * 0.05) * 2 - 1;
    me.z = ATTRACT_Z + Math.cos(t * 0.04) * 4 - 2;
    for (const z of this.zombies.values()) { z.think(dt, []); z.update(dt, this.camera); }
    this.search.position.set(-14, 16, ATTRACT_Z - 18);
    this.search.target.position.set(Math.sin(t * 0.21) * 5, 0, ATTRACT_Z + Math.cos(t * 0.13) * 9);
    this.world.update(this.time, dt, me, this.wind);
    this.wind.gust = Math.max(0, perlin1(this.time * 0.25) * 1.4);
    this.ambient(dt);
    this.cam.update(dt, { x: me.x + 1.5, z: me.z - 2 }, 0, 0, false);
    audio.setListener(me.x, me.z);
    const scale = this.engine.h * this.engine.renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    this.fx.update(dt, this.camera, me, scale, this.wind);
    tickFog(this, dt, this.wind);
  }

  // ---------------------------------------------------------- phases --
  setPhase(p) {
    this.phase = p;
    this.phaseT = 0;
    if (p === 'intro') {
      if (this.opened > 0) this.hud.banner(`CHECKPOINT ${this.opened}`, 'Keep moving. Evac is north.', 3.0);
      else this.hud.banner(`LEVEL ${this.level}`, LV.name, 3.2, LV.banner);
    }
    if (p === 'extract') {
      if (LV.finale === 'heli') { this.hud.banner('EVAC IS HERE', 'Get everyone on the pad!', 3); this.startHeli(); }
      else { this.hud.banner('THE DOOR IS OPEN', 'Everyone into the safe room!', 3); openSafeRoom(this.world, this.world.endRoom); audio.play('gate', { vol: 0.8, jitter: 0 }); }
    }
    if (p === 'win') {
      if (LV.finale === 'heli') this.hud.banner('SIGNAL ACQUIRED', 'The bird is lifting', 3);
      else this.hud.banner('SAFE', 'The door seals behind you', 3);
      this.endAt = this.time + 3.5;
    }
    if (this.role === 'host') this.net.broadcast({ t: 'phase', p, hold: this.hold, opened: this.opened });
    this.refreshHud();
  }

  // the helicopter: a beam of light from above, a rotor you can feel, a wash of mist
  buildHeli() {
    const T = THREE;
    const cone = new T.Mesh(new T.ConeGeometry(7.5, 36, 28, 1, true), new T.MeshBasicMaterial({ map: tex('tex/cone.webp'), color: 0xdfeaff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
    cone.position.set(L.lz.x, 18, L.lz.z);
    cone.visible = false;
    const pool = new T.Mesh(new T.PlaneGeometry(26, 26).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: tex('tex/soft.webp'), color: 0xcfe0ff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
    pool.position.set(L.lz.x, 0.06, L.lz.z);
    pool.visible = false;
    this.scene.add(cone, pool);
    this.heli.cone = cone; this.heli.pool = pool;
  }

  startHeli() {
    const h = this.heli;
    if (h.on) return;
    h.on = true; h.t = 0;
    h.cone.visible = h.pool.visible = true;
    h.voice = audio.play('rotor', { vol: 0, loop: true, jitter: 0 });
  }

  heliTick(dt) {
    const h = this.heli;
    if (!h.on) return;
    h.t += dt;
    const k = Math.min(1, h.t / 5);
    const flick = 0.92 + 0.08 * Math.sin(this.time * 31);
    h.cone.material.opacity = 0.2 * k * flick;
    h.pool.material.opacity = 0.55 * k * flick;
    h.cone.rotation.y += dt * 0.6;
    const d = Math.hypot(this.me.x - L.lz.x, this.me.z - L.lz.z);
    const near = Math.max(0, 1 - d / 70);
    if (h.voice) h.voice.g.gain.value = 0.9 * k * (0.25 + 0.75 * near);
    if (d < 45) this.cam.tr = Math.max(this.cam.tr, 0.11 * k);
    // the downwash throws mist and grit across the pad
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * 6.283, r = 1 + Math.random() * 5;
      this.fx.mist.emit({ x: L.lz.x + Math.cos(a) * r, y: 0.15, z: L.lz.z + Math.sin(a) * r, vx: Math.cos(a) * (5 + Math.random() * 4) * k, vy: 0.3, vz: Math.sin(a) * (5 + Math.random() * 4) * k, life: 1.4, s0: 0.6, s1: 2.8, r: 0.7, g: 0.74, b: 0.8, a0: 0.18 * k, a1: 0, drag: 1.2 });
    }
  }

  // the gate rolls open: dust and sparks along both leaves
  gateTick(dt) {
    for (const g of this.gateFx) {
      g.t -= dt;
      for (let i = 0; i < 4; i++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = side * (2.5 + (1 - g.t / 2.4) * 8 + Math.random() * 1.5);
        this.fx.smoke.emit({ x, y: 0.2, z: g.z + (Math.random() - 0.5) * 0.8, vx: side * 1.2 + Math.random() - 0.5, vy: 0.4 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.8, life: 1.8, s0: 0.5, s1: 2.2, r: 0.42, g: 0.4, b: 0.37, a0: 0.3, a1: 0, drag: 0.8, spin: 0.3 });
      }
      if (Math.random() < 0.5) this.fx.sparkList.push({ x: (Math.random() - 0.5) * 12, y: 0.3 + Math.random() * 3, z: g.z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2, vz: Math.random() * 2, t: 0, max: 0.5 });
    }
    this.gateFx = this.gateFx.filter((g) => g.t > 0);
  }

  // the living boss, if there is one (every machine finds it the same way)
  bossZ() {
    for (const z of this.zombies.values()) if (z.boss && z.alive) return z;
    return null;
  }

  // the survivor furthest up the avenue
  lead() {
    let best = null;
    for (const p of this.players.values()) if (p.alive && (!best || p.z < best.z)) best = p;
    return best || this.me;
  }

  // where the level ends: the safe room's door, or the landing pad
  goal() { return LV.finale === 'heli' ? L.lz : { x: 0, z: L.zMin + 2.5, r: 2.5 }; }

  // where the held junction is centred: the gate, or the landing pad
  holdCentre(k) { return k < L.gate.length ? L.gate[k] : L.lz.z; }
  holdTrigger(k) {
    // the bulldozer waits south of the junction: its job starts as you reach it, not past it
    if (k === 0 && this.objective?.mode === 'dozer') return this.objective.dz.z0 + 7;
    return k < L.gate.length ? L.gate[k] + HOLD_TRIGGER : L.lz.z + 22;
  }

  refreshHud() {
    const me = this.me;
    const G = this.goal();
    const dist = this.phase === 'extract' ? Math.max(0, Math.round(Math.hypot(me.x - G.x, me.z - G.z) - G.r + 1)) : Math.max(0, Math.round(me.z - G.z));
    const secs = this.hold >= 0 ? HOLDS[this.hold].secs : 0;
    const ob = this.hold >= 0 && !HOLDS[this.hold].final && this.objective?.custom ? this.objective.hud() : null;
    this.hud.route({ ob, phase: this.phase, hold: this.hold, title: this.hold >= 0 ? HOLDS[this.hold].title : null, left: Math.max(0, secs - this.holdT), secs, dist, opened: this.opened, away: this.holdAway, final: this.hold === HOLDS.length - 1, gates: L.gate.length, name: LV.short, finale: LV.finale, boss: this.hold >= 0 && HOLDS[this.hold].boss ? TYPES[HOLDS[this.hold].boss].name : null });
  }

  startHold(k) {
    this.hold = k;
    this.holdT = 0;
    this.holdSpawned = 0;
    this.holdBrutes = 0;
    const H = HOLDS[k];
    this.holdTotal = Math.round(H.n * (1 + 0.5 * (this.players.size - 1)));
    this.holdBruteN = H.brutes ? H.brutes + (this.players.size - 1) : 0;
    this.spawnT = 0.4;
    if (H.boss && this.isHost) {
      // the boss comes down from the north end of the pad toward the survivors
      this.bossSpawned = true;
      const bz = this.spawnZombie(H.boss, { x: 0, z: LV.finale === 'heli' ? L.lz.z - 8 : L.zMin + 9, seed: 424242 + this.level });
      this.speech?.hostLine(bz, 'spawn', 1, 3.2);
      // level 5: everything warps into a side-scroller for the last fight
      if (this.side) { bz.x = L.lz.x + 9; this.netEvent({ k: 'warp' }); this.side.start(); }
    }
    const ob = !H.boss && this.objective?.custom ? this.objective.blurb() : null;
    this.hud.banner(H.boss ? TYPES[H.boss].name : H.title, H.boss ? (LV.finale === 'heli' ? 'Kill it to call in the bird' : 'Kill it to open the safe room') : ob || 'Hold the junction while the gate is cut open', 2.8);
    // what makes this boss different, a moment after the banner
    if (H.boss && TYPES[H.boss].trait) this.after(4.6, () => this.hud?.toast(TYPES[H.boss].trait));
    audio.play('sting', { vol: 0.7, jitter: 0 });
    if (this.role === 'host') this.net.broadcast({ t: 'phase', p: this.phase, hold: this.hold, opened: this.opened });
    this.refreshHud();
  }

  // host: the hold is done. The gate rolls open, the fallen are pulled back up.
  finishHold() {
    const k = this.hold;
    this.hold = -1;
    if (HOLDS[k].final) { this.setPhase('extract'); return; }
    this.openGateTo(k + 1);
    this.reviveDead();
    this.hitstop = 0.12;
    this.setPhase('run');
  }

  // both sides: open every gate below `n`
  openGateTo(n, instant = false) {
    while (this.opened < n) {
      this.world.openGate(this.opened, instant);
      if (!instant) this.gateFx.push({ z: L.gate[this.opened], t: 2.4 });
      this.opened++;
      if (!instant) {
        this.hud.banner('GATE OPEN', 'Move up. Evac is north.', 2.4);
        this.earn(50 + 10 * this.level, 'CHECKPOINT');
        audio.play('gate', { vol: 0.9, jitter: 0 });
        this.cam.trauma(0.35);
      }
    }
    this.checkpoint = this.opened;
  }

  // players who bled out come back, at the lead survivor's side
  reviveDead() {
    const lead = this.lead();
    for (const p of this.players.values()) {
      if (!p.dead && !p.down) continue;
      const x = lead.x + (Math.random() - 0.5) * 2, z = lead.z + 1.5;
      if (p.local) { p.x = x; p.z = z; p.revive(); p.hp = p.maxHp * 0.6; this.hud.health(p.hp, p.maxHp); this.hud.banner('', 'Back on your feet', 1.6); }
      else this.net.send(p.id, { t: 'revive', x, z });
      p.hp = p.maxHp * 0.6;
    }
  }

  director(dt) {
    this.phaseT += dt;
    const lead = this.lead();
    if (this.phase === 'intro' && this.phaseT > 3.0) this.setPhase('run');
    else if (this.phase === 'run' || this.phase === 'hold') {
      let alive = 0, hunting = 0;
      for (const z of this.zombies.values()) if (z.alive) { alive++; if (!z.idle) hunting++; }
      if (this.hold < 0) {
        // ---- running the avenue
        const k = this.opened;
        if (k < HOLDS.length && lead.z < this.holdTrigger(k)) { this.phase = 'hold'; this.startHold(k); }
        this.streamRoute(lead, hunting, dt);
      } else {
        // ---- holding a junction
        const H = HOLDS[this.hold];
        const c = this.holdCentre(this.hold);
        const obj = !H.final && this.objective?.custom ? this.objective : null;     // breakers / nests / the dozer instead of a timer
        const near = obj || [...this.players.values()].some((p) => p.alive && Math.abs(p.z - c) < HOLD_RADIUS && Math.abs(p.x) < 40);
        const away = !near;
        if (away !== this.holdAway) { this.holdAway = away; if (away) this.hud.toast('Get back to the gate!'); }
        if (near) this.holdT += dt;
        this.spawnT -= dt;
        // the dead arrive on a curve: slow at first, a flood in the middle
        const prog = Math.min(1, this.holdT / H.secs);
        // (the boss fight goes on until the boss is dead: after the planned dead have come, a steady trickle keeps coming)
        const endless = (H.boss || obj) && prog >= 1;
        const want = endless ? 1e9 : Math.round(this.holdTotal * Math.min(1, prog * 1.15));
        // (on the side-scroller's one line the dead pile straight into you: far fewer at a time)
        const cap = this.side?.active ? 5 + 3 * (this.players.size - 1) : H.cap + 8 * (this.players.size - 1);
        if (this.spawnT <= 0 && this.holdSpawned < want && hunting < cap && !this.side?.warping) {
          this.spawnT = (this.side?.active ? 2.2 : endless ? 1.0 : 0.25) + Math.random() * 0.5;
          const roll = Math.random();
          let type = roll < H.runner ? 'runner' : roll < H.runner + H.lurch ? 'lurcher' : 'shambler';
          // the brutes lumber in at even points through the hold
          if (this.holdBrutes < this.holdBruteN && this.holdSpawned >= this.holdTotal * (this.holdBrutes + 1) / (this.holdBruteN + 1)) { type = 'brute'; this.holdBrutes++; this.hud.toast('Something big is coming…'); }
          this.spawnZombie(type);
          this.holdSpawned++;
        }
        const done = H.boss ? this.bossSpawned && !this.bossZ() && this.holdT > 8 : obj ? obj.done() : this.holdT >= H.secs;
        if (done) { this.phase = 'run'; this.finishHold(); }
      }
      if (this.phaseT > 0.25) { this.phaseT = 0; this.refreshHud(); }
      // let the dead behind us go
      this.cullT = (this.cullT || 0) - dt;
      if (this.cullT <= 0) { this.cullT = 1.5; this.cullBehind(lead); }
    } else if (this.phase === 'extract') {
      // the bird is down / the door is open: everyone alive has to be on the pad, or inside the safe room
      const alive = [...this.players.values()].filter((p) => p.alive);
      const sr = this.world.endRoom;
      const on = alive.length > 0 && alive.every((p) => (sr ? sr.inside(p.x, p.z) : Math.hypot(p.x - L.lz.x, p.z - L.lz.z) < L.lz.r - 0.5));
      this.padT = on ? this.padT + dt : 0;
      let hunting = 0;
      for (const z of this.zombies.values()) if (z.alive && !z.idle) hunting++;
      this.spawnT -= dt;
      if (this.spawnT <= 0 && hunting < 26 + 8 * (this.players.size - 1)) { this.spawnT = 0.7; this.spawnZombie(Math.random() < 0.3 ? 'runner' : 'shambler'); }
      if (this.padT > (sr ? 0.8 : 1.5)) this.setPhase('win');
      if (this.phaseT > 0.25) { this.phaseT = 0; this.refreshHud(); }
    } else if (this.phase === 'win' && this.time > this.endAt && !this.over) {
      this.finish(true);
    }
    // everyone down?
    if (!this.over && this.phase !== 'intro' && [...this.players.values()].every((p) => !p.alive)) {
      this.finish(false);
    }
  }

  // sleepers placed along the avenue, ambushes, a thin trickle between holds
  buildPopulation() {
    const rng = mulberry(5150);
    const nav = this.world.nav;
    this.pop = [];
    const free = (x, z) => { const k = nav.idx(x, z); return k >= 0 && !nav.block[k]; };
    for (let z = L.start.z - 16; z > L.zMin + 14; z -= LV.sleepGap[0] + rng() * LV.sleepGap[1]) {
      if (L.cross.some((c) => Math.abs(z - c) < 10)) continue;       // junctions are for the hold
      const n = 1 + Math.floor(rng() * 3.4);
      const wide = zoneAt(z);
      const cx = (rng() - 0.5) * (wide ? (ZONE_HW - 3) * 2 : 9);
      for (let i = 0; i < n; i++) {
        const x = cx + (rng() - 0.5) * 3, zz = z + (rng() - 0.5) * 3;
        if (!free(x, zz)) continue;
        const r = rng();
        this.pop.push({ x, z: zz, type: r < LV.brutePop && z < L.cross[0] - 40 ? 'brute' : r < 0.12 + LV.brutePop ? 'lurcher' : 'shambler', seed: (rng() * 1e6) | 0, home: rng() < 0.65, done: false });
      }
    }
  }

  streamRoute(lead, hunting, dt) {
    // wake the street up ahead of us
    const gateZ = this.opened < L.gate.length ? L.gate[this.opened] + 1.5 : -1e9;
    const pls = [...this.players.values()].filter((p) => p.alive);
    if (this.pop) for (const e of this.pop) {
      if (e.done || e.z < gateZ) continue;
      if (pls.some((p) => Math.abs(p.z - e.z) < 46 && Math.abs(p.x - e.x) < 40)) { e.done = true; this.spawnZombie(e.type, { x: e.x, z: e.z, idle: true, home: e.home, seed: e.seed }); }
    }
    // ambushes: the street behind a wreck is not empty
    AMBUSH.forEach((a, i) => {
      if (this.ambushed.has(i) || lead.z > a.z) return;
      this.ambushed.add(i);
      if (this.opened > 0 && L.gate[this.opened - 1] > a.z + 6) return;        // already behind us
      for (let k = 0; k < a.n + 2 * (this.players.size - 1); k++) this.spawnZombie(Math.random() < (LV.ambRunner ?? 0.35) ? 'runner' : Math.random() < 0.3 ? 'lurcher' : 'shambler');
      for (let k = 0; k < (a.brutes || 0); k++) this.spawnZombie('brute');
    });
    // a trickle, so the road never feels safe
    this.trickleT -= dt;
    if (this.trickleT <= 0) {
      this.trickleT = (2.5 + Math.random() * 2) / (LV.trickle ?? 1);
      if (hunting < (10 + 4 * this.players.size) * (LV.trickle ?? 1)) this.spawnZombie(Math.random() < 0.2 * (LV.trickle ?? 1) ? 'runner' : 'shambler');
    }
  }

  cullBehind(lead) {
    // measured from the survivor furthest BACK, so nothing vanishes next to a teammate who is lagging behind
    let rear = lead.z;
    for (const p of this.players.values()) if (p.alive && p.z > rear) rear = p.z;
    for (const [id, z] of this.zombies) {
      // the sleeping dead behind us are let go; the AWAKE ones keep chasing (running past them is not a way through)
      if (!z.alive || z.boss || z.z < rear + (z.idle ? 48 : 85)) continue;
      z.dispose(); this.zombies.delete(id);
      this.netEvent({ k: 'zgone', id });
    }
  }

  // somebody woke up: the dead next to it do too
  wakeNear(zb) {
    for (const o of this.zombies.values()) if (o.idle && (o.x - zb.x) ** 2 + (o.z - zb.z) ** 2 < 36) o.wake();
  }

  // Out of sight, but not far: a free, reachable bit of street 15-30 m from a
  // survivor that is off the edge of the screen. Falls back to a street end.
  pickSpawn() {
    if (this.side?.active || this.side?.warping) return this.side.spawnPoint();
    const pls = [...this.players.values()].filter((p) => p.alive);
    if (!pls.length) return this.world.spawns[0];
    const nav = this.world.nav, v = new THREE.Vector3();
    const lead = this.lead();
    for (let i = 0; i < 70; i++) {
      const base = Math.random() < 0.5 ? lead : pls[(Math.random() * pls.length) | 0];
      const a = Math.random() * Math.PI * 2, r = 15 + Math.random() * 15;
      const x = base.x + Math.cos(a) * r, z = base.z + Math.sin(a) * r * 0.9;
      const k = nav.idx(x, z);
      if (k < 0 || nav.block[k] || nav.dist[k] > 1e8) continue;
      const d = Math.min(...pls.map((p) => Math.hypot(p.x - x, p.z - z)));
      if (d < 14) continue;
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
      .filter((c) => c.d > 14 && c.d < 60).sort((a, b) => a.d - b.d)[0];
    return far ? far.s : { x: lead.x + (Math.random() - 0.5) * 4, z: lead.z + 24 };
  }

  // host: a body stuck behind something is put somewhere else on the road
  relocate(z) {
    const s = this.pickSpawn();
    z.x = s.x; z.z = s.z; z.px = s.x; z.pz = s.z;
  }

  spawnZombie(type, o = {}) {
    const c = o.x !== undefined ? o : this.pickSpawn();
    const id = this.nextZid++;
    const seed = o.seed ?? ((Math.random() * 1e6) | 0);
    const x = c.x + (o.x !== undefined ? 0 : (Math.random() - 0.5) * 1.2), z = c.z + (o.x !== undefined ? 0 : (Math.random() - 0.5) * 1.2);
    const zb = this.addZombie(id, { type, seed, x, z, idle: !!o.idle, home: !!o.home });
    this.netEvent({ k: 'zspawn', id, type, seed, x: +x.toFixed(2), z: +z.toFixed(2), model: zb.model });
    return zb;
  }

  addZombie(id, o) {
    const z = new Zombie(this, id, o);
    this.zombies.set(id, z);
    // corpses are permanent, up to a point
    // past 26 corpses the one FURTHEST from every survivor is cleared (it used to be the oldest, even under your feet)
    const dead = [...this.zombies.values()].filter((q) => !q.alive);
    if (dead.length > 26) {
      let far = null, fd = -1;
      for (const q of dead) {
        let d = 1e9;
        for (const p of this.players.values()) d = Math.min(d, (p.x - q.x) ** 2 + (p.z - q.z) ** 2);
        if (d > fd) { fd = d; far = q; }
      }
      far.dispose(); this.zombies.delete(far.id);
    }
    return z;
  }

  // first-aid kits are laid out the same on every machine
  layMedkits() {
    MEDKITS.forEach(([x, z], i) => { if (z > L.lz.z && (this.opened === 0 || z < L.gate[this.opened - 1] + 4)) this.addMedkit('k' + i, x, z); });
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
    g.position.set(x, this.world.groundY(x, z), z);
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
  localHit(pl, z, dmg, dx, dz, crit, kmul = 1) {
    this.stats.hits++;
    if (crit) this.stats.crits++;
    if (this.isHost) {
      const killed = z.damage(dmg, dx, dz, crit, pl.id, kmul);
      if (killed) this.onKill(z, dx, dz, crit, pl.id === this.me.id, pl.id);
      else this.netEvent({ k: 'zhit', id: z.id, dx, dz, crit: crit ? 1 : 0 });
    } else {
      this.net.toHost({ t: 'hit', id: z.id, dmg, dx, dz, crit: crit ? 1 : 0, k: kmul });
    }
  }

  // a local player's bullet hit a nest or a gas tank
  targetHit(pl, t, dmg, dx, dz) {
    this.objective.hitFx(t, dx, dz);
    if (this.isHost) this.objective.damage(t, dmg);
    else this.net.toHost({ t: 'thit', id: t.id, dmg: Math.round(dmg), dx: +dx.toFixed(2), dz: +dz.toFixed(2) });
  }

  onKill(z, dx, dz, crit, mine, byId = null) {
    if (mine) {
      this.stats.kills++;
      this.earn(Math.round((BOUNTY[z.type] || 10) * (this.me.cashMul || 1)), null, z);
      this.hitstop = crit ? 0.07 : 0.045;       // a beat of weight on kills only
      buzz([0, 25]);
      this.hud.killConfirm();
    }
    this.after(0.45, () => this.fx.pool(z.x + dx * 0.6, z.z + dz * 0.6));
    if (this.isHost) this.netEvent({ k: 'zdie', id: z.id, dx, dz, crit: crit ? 1 : 0, by: byId });
    if (z.boss) { this.hud.banner('BOSS DOWN', TYPES[z.type].name, 3); this.cam.trauma(0.6); this.hitstop = 0.18; audio.play('sting', { vol: 0.8, jitter: 0 }); }
    if (this.hold >= 0) this.refreshHud();
  }

  // host: a zombie's bite connects
  hurtPlayer(p, dmg, z, kb = 0.35) {
    dmg = Math.round(dmg);
    if (p.local) p.hurt(dmg, z.x, z.z, kb);
    else this.net.send(p.id, { t: 'hurt', dmg, fx: +z.x.toFixed(2), fz: +z.z.toFixed(2), kb });
    if (z.def) audio.play('scream', { x: z.x, z: z.z, vol: 0.55 });
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
    } else if (m.t === 'thit' && this.isHost) {
      const t = this.targets.get(m.id);
      if (t && t.alive) { this.objective.hitFx(t, m.dx, m.dz); this.objective.damage(t, m.dmg); }
    } else if (m.t === 'hit' && this.isHost) {
      const z = this.zombies.get(m.id);
      if (!z || !z.alive) return;
      const killed = z.damage(m.dmg, m.dx, m.dz, !!m.crit, from, m.k || 1);
      z.hitFx(m.dx, m.dz, !!m.crit);
      this.fx.flesh(z.x, 1.25, z.z, m.dx, m.dz, 1, !!m.crit);
      if (killed) this.onKill(z, m.dx, m.dz, !!m.crit, false, from);
      else this.net.broadcast({ t: 'ev', e: { k: 'zhit', id: z.id, dx: m.dx, dz: m.dz, crit: m.crit } }, true, from);
    } else if (m.t === 'hurt') {
      this.me.hurt(m.dmg, m.fx, m.fz, m.kb ?? 0.35);
    } else if (m.t === 'revive') {
      if (m.x !== undefined) { this.me.x = m.x; this.me.z = m.z; }
      this.me.revive();
      this.hud.health(this.me.hp, this.me.maxHp);
      this.hud.banner('', 'You were pulled back up', 1.5);
    } else if (m.t === 'phase' && !this.isHost) {
      this.hold = m.hold;
      this.openGateTo(m.opened);
      if (m.p !== this.phase) this.setPhase(m.p); else this.refreshHud();
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
      if (p && !p.local) { p.remoteShot(e); this.noise = { x: p.x, z: p.z, t: this.time }; }
    } else if (e.k === 'reload') {
      const p = this.players.get(e.pid);
      if (p && !p.local) { p.anim.reload = 0.01; p.remoteReload = e.rt || p.W.reload; p.remoteReloadMax = p.remoteReload; }
    } else if (e.k === 'lurch') {
      const z = this.zombies.get(e.id);
      if (z) { z.anim.doLurch(); if (!this.isHost) audio.zombie('scream', z.x, z.z, 1); }
    } else if (e.k === 'boss') {
      if (!this.isHost) this.bossFx?.event(e);
    } else if (e.k === 'warp') {
      if (!this.isHost) this.side?.start();
    } else if (e.k === 'key') {
      if (!this.isHost) takeKey(this, e.i);
    } else if (e.k === 'say') {
      if (!this.isHost) this.speech?.show(e);
    } else if (e.k === 'zgone') {
      const z = this.zombies.get(e.id);
      if (z) { z.dispose(); this.zombies.delete(e.id); }
    } else if ((e.k === 'shell' || e.k === 'tdie') && !this.isHost) this.objective?.onEvent(e);
  }

  applyRemote(p, m) {
    p.buf.push({ t: performance.now(), x: m.x, z: m.z, f: m.f });
    if (p.buf.length > 20) p.buf.shift();
    p.aimx = m.ax; p.aimz = m.az; p.aiming = !!(m.fl & 1);
    p.y2t = m.y || 0; p.aim2x = m.ax; p.aim2y = m.ay || 0;
    p.hp = m.hp;
    if (m.mh) p.maxHp = m.mh;
    if (m.w !== undefined && p.order) { const id = WEAPON_IDS[m.w]; if (id && p.cur.id !== id) p.setWeapon(id, true); }
    p.down = !!(m.fl & 2);
    p.dead = !!(m.fl & 4);
  }

  applySnap(m) {
    const now = performance.now();
    if (m.h) {
      // [hold index, hold seconds so far, away, gates opened]
      const [hold, ht, away, opened] = m.h;
      if (opened > this.opened) this.openGateTo(opened);
      if (hold !== this.hold || away !== (this.holdAway ? 1 : 0)) { this.hold = hold; this.holdAway = !!away; this.holdT = ht; this.refreshHud(); }
      this.holdT = ht;
    }
    if (m.O) this.objective?.apply(m.O);
    if (m.S2 && this.side && !this.side.active && !this.side.warping) this.side.start(true);
    if (m.KY) this.world.keyItems.forEach((k, i) => { if (m.KY & (1 << i) && !k.taken) takeKey(this, i); });
    for (const r of m.p) {
      const [id, x, z, f, ax, az, hp, fl, w, mh, rv, y2, ay] = r;
      if (id === this.me.id) { this.me.reviveT = rv || 0; continue; }
      const p = this.players.get(id);
      if (p) p.reviveT = rv || 0;
      if (p) this.applyRemote(p, { x, z, f, ax, az, hp, fl, w, mh, y: y2, ay });
    }
    if (m.B) { const bz = this.zombies.get(m.B[0]); if (bz) bz.hp = m.B[1]; }
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
        this.net.toHost({ t: 'in', x: +p.x.toFixed(2), z: +p.z.toFixed(2), f: +p.face.toFixed(3), ax: +p.aimx.toFixed(2), az: +p.aimz.toFixed(2), hp: p.hp, fl, w: WEAPON_IDS.indexOf(p.cur.id), mh: p.maxHp, y: +(p.y2 || 0).toFixed(2), ay: +(p.aim2y || 0).toFixed(2) }, false);
      }
    } else if (this.role === 'host') {
      this.snapT -= dt;
      if (this.snapT <= 0) {
        this.snapT = 1 / 15;
        const P = [...this.players.values()].map((p) => [p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.face.toFixed(3), +p.aimx.toFixed(2), +p.aimz.toFixed(2), p.hp, (p.aiming ? 1 : 0) | (p.down ? 2 : 0) | (p.dead ? 4 : 0), WEAPON_IDS.indexOf(p.cur.id), p.maxHp, +(p.reviveT || 0).toFixed(1), +(p.y2 || 0).toFixed(2), +(p.aim2y || 0).toFixed(2)]);
        const Z = [];
        for (const z of this.zombies.values()) {
          if (!z.alive) continue;
          Z.push([z.id, +z.x.toFixed(2), +z.z.toFixed(2), +z.face.toFixed(2), { walk: 0, windup: 1, stagger: 2, recover: 3 }[z.state] || 0]);
        }
        const bz = this.bossZ();
        this.net.broadcast({ t: 'snap', p: P, z: Z, B: bz ? [bz.id, Math.round(bz.hp)] : 0, h: [this.hold, +this.holdT.toFixed(1), this.holdAway ? 1 : 0, this.opened], O: this.objective?.state() ?? 0, KY: this.world.keyItems.reduce((m, k, i) => m | (k.taken ? 1 << i : 0), 0), S2: this.side?.active || this.side?.warping ? 1 : 0 }, false);
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
      const helper = [...this.players.values()].find((o) => o !== p && o.alive && Math.hypot(o.x - p.x, o.z - p.z) < REVIVE_R);
      p.reviveT = helper ? p.reviveT + dt : Math.max(0, p.reviveT - dt * 0.5);
      if (p.reviveT > REVIVE_T) {
        p.reviveT = 0;
        if (p.local) { p.revive(); this.hud.health(p.hp, p.maxHp); } else this.net.send(p.id, { t: 'revive' });
      }
    }
  }

  // every machine: a filling green ring under a downed teammate, a shout when one goes down, a line while you pick one up
  reviveFx(dt) {
    let helping = null;
    for (const p of this.players.values()) {
      const down = p.down && !p.dead;
      if (!p.rvRing && down) { p.rvRing = ring(0x40ff70, REVIVE_R * 1.7); this.scene.add(p.rvRing); }
      if (p.rvRing) {
        p.rvRing.visible = down;
        if (down) {
          p.rvRing.position.set(p.x, this.world.groundY(p.x, p.z) + 0.07, p.z);
          const u = p.rvRing.material.uniforms;
          u.uProg.value = Math.min(1, (p.reviveT || 0) / REVIVE_T);
          u.uTime.value = this.time;
          u.uA.value = 0.75 + 0.25 * Math.sin(this.time * 6);
        }
      }
      if (!p.local && down && !p._wasDown) { this.hud.toast(`${p.name || 'A teammate'} is down! Stand next to them to pick them up`); audio.play('sting', { vol: 0.5, jitter: 0 }); }
      p._wasDown = down;
      if (!p.local && down && this.me.alive && Math.hypot(this.me.x - p.x, this.me.z - p.z) < REVIVE_R) helping = p;
    }
    const h = helping ? `Picking up ${helping.name || 'your teammate'}… stay close` : '';
    if (h !== this._rvHint) { this._rvHint = h; this.hud.hint(h); }
  }

  // the HUD's screen-edge markers: the objective's, and every downed teammate
  markers() {
    const out = this.objective?.markers() || [];
    const me = this.me;
    for (const k of this.world.keyItems) {
      if (k.taken) continue;
      const Z = zoneAt(me.z, 4);
      if (!Z || Z.index !== k.zone) continue;
      const hex = '#' + KEY_COLORS[k.color].toString(16).padStart(6, '0');
      out.push({ x: k.x, z: k.z, c: hex, label: `${k.color.toUpperCase()} KEY` });
    }
    for (const p of this.players.values()) if (!p.local && p.down && !p.dead) out.push({ x: p.x, z: p.z, c: '#ff4a4a', label: 'HELP' });
    return out;
  }

  finish(win, why = null) {
    if (this.over) return;
    this.over = true;
    this.won = !!win;
    if (this.role === 'host') this.net.broadcast({ t: 'end', win });
    const acc = this.stats.shots ? Math.round(100 * this.stats.hits / this.stats.shots) : 0;
    if (win) this.earn(150 + 100 * this.level, LV.finale === 'heli' ? 'EVACUATED' : 'SAFE ROOM');
    const bank = this.bank(win);
    this.hud.end(win, { ...this.stats, acc, time: this.time, checkpoint: this.opened, gates: L.gate.length, level: this.level, name: LV.kicker, cash: this.cash, wallet: save.cash, last: this.level >= 5, host: this.role !== 'client', coop: this.role !== 'solo', ...bank }, why);
  }

  // money found this run: kills pay a bounty, each gate a bonus, getting out a big one
  earn(n, label = null, at = null) {
    if (n <= 0) return;
    this.cash += n;
    this.hud.cash(this.cash, n, label);
  }

  // put this run's money in the wallet (once), and open the next level on a win
  bank(win) {
    if (this.banked || this.opts.attract) return {};
    this.banked = true;
    save.addCash(this.cash);
    save.data.runs++;
    if (win) { save.unlock(this.level + 1); const b = save.data.best[this.level]; if (!b || this.time < b) save.data.best[this.level] = Math.round(this.time); }
    save.write();
    return {};
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
    if (this.timers.length) for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i].at <= this.time) { const f = this.timers[i].fn; this.timers.splice(i, 1); f(); }
    if (this.opts.attract) { this.updateAttract(dt); return; }
    const me = this.me;
    const inp = this.bot ? this.botInput(dtReal) : this.input.poll(dtReal);
    if (!this.over && !this.paused) {
      const shots = me.ammo;
      me.control(dt, inp, this.camera);
      if (me.ammo < shots) this.stats.shots++;
    }
    // medkits
    for (const m of this.side?.active ? [] : [...this.medkits]) {
      m.g.rotation.y += dt;
      if (me.alive && me.hp < me.maxHp && Math.hypot(me.x - m.x, me.z - m.z) < 0.9) {
        me.hp = Math.min(me.maxHp, me.hp + Math.max(50, me.maxHp * 0.5));
        this.hud.health(me.hp, me.maxHp);
        audio.play('click', { vol: 0.8 });
        this.takeMedkit(m.id);
        if (this.role === 'host') this.net.broadcast({ t: 'medkit_take', id: m.id });
        else if (this.role === 'client') this.net.toHost({ t: 'medkit_take', id: m.id });
      }
    }
    // bleed out: 30 s on the ground alone
    if (me.down && !me.dead && me.downT > 30) { me.dead = true; this.hud.banner('', 'You bled out — back at the next gate', 2); }
    // remote players
    for (const p of this.players.values()) if (!p.local) this.interp(p);
    // the dead
    if (this.isHost) {
      // the chase map: restarted when someone has moved (or a gate opened), filled a little every frame
      const nav = this.world.nav;
      this.navT -= dt;
      if (!nav.job && this.navT <= 0) {
        let moved = nav.dirty;
        const last = this.navAt || (this.navAt = new Map());
        for (const p of this.players.values()) {
          const l = last.get(p.id);
          if (!l || (l.x - p.x) ** 2 + (l.z - p.z) ** 2 > 0.5 || l.alive !== p.alive) moved = true;
        }
        if (moved) {
          nav.dirty = false;
          this.navT = 0.3;
          const tg = [];
          for (const p of this.players.values()) { if (p.alive) tg.push(p); last.set(p.id, { x: p.x, z: p.z, alive: p.alive }); }
          nav.startBuild(tg);
        }
      }
      nav.step(1800);
      const plist = this._plist || (this._plist = []);
      plist.length = 0;
      for (const p of this.players.values()) plist.push(p);
      if (!this.side?.warping) for (const z of this.zombies.values()) z.think(dt, plist);
      this.director(dt);
      this.revives(dt);
      this.reviveFx(dt);
    } else {
      for (const z of this.zombies.values()) if (z.alive) this.interp(z, 120);
    }
    const zr2 = (Q.zombieShadows * 1.6) ** 2;
    for (const z of this.zombies.values()) {
      z.update(dt, this.camera);
      // only the dead close to you are worth a shadow-map draw each
      z.char.mesh.castShadow = zr2 > 0 && z.alive && (z.x - me.x) ** 2 + (z.z - me.z) ** 2 < zr2;
    }
    for (const p of this.players.values()) {
      if (p.remoteReload > 0) { p.remoteReload -= dt; p.anim.reload = 1 - p.remoteReload / (p.remoteReloadMax || p.W.reload); if (p.remoteReload <= 0) p.anim.reload = 0; }
      p.update(dt);
    }
    // environment
    this.wind.gust = Math.max(0, perlin1(this.time * 0.25) * 1.4);
    this.world.update(this.time, dt, me, this.wind);
    this.ambient(dt);
    this.side?.update(dt);
    if (this.side?.active) this.side.camera(dtReal);
    else if (!this.side?.warping) this.cam.update(dtReal, me, me.aimx, me.aimz, me.aiming);
    audio.setListener(me.x, me.z);
    const scale = this.engine.h * this.engine.renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    this.fx.update(dt, this.camera, me, scale, this.wind);
    tickFog(this, dt, this.wind);
    for (const c of this.corpses) c.char.root.visible = Math.hypot(c.x - me.x, c.z - me.z) < 24;
    this.heliTick(dt);
    tickSafeRoom(this.world.endRoom, dt);
    this.bossFx?.update(dt);
    this.speech?.update(dt);
    this.objective?.update(dt);
    tickZones(this, dt);
    if (this.groundFog) this.groundFog.pts.visible = Q.fogSheets > 0 && !indoors(me.x, me.z);
    this.gateTick(dt);
    this.updateCutaway();
    // low health: heartbeat and a draining picture
    const low = me.alive ? Math.max(0, (0.4 - me.hp / me.maxHp) / 0.4) : 0.8;
    this.engine.grade.saturation = LV.theme.sat - low * 0.5;
    this.heartT = (this.heartT || 0) - dtReal;
    if (low > 0 && this.heartT <= 0) { this.heartT = 1.1 - low * 0.4; audio.play('heart', { vol: 0.35 + low * 0.5, jitter: 0 }); }
    this.hud.frame(this, dtReal);
    this.sendNet(dtReal);
  }

  // QA bot: runs the avenue, strafes the dead, holds junctions
  // a distance field toward one place, rebuilt when the place changes
  botField(goal, key) {
    if (!this.botNav || this.botNavKey !== key) {
      const b = this.world.bounds;
      this.botNav = new NavField(b.minX - 6, b.minZ - 8, b.maxX + 6, b.maxZ + 8, 0.5, this.world.col);
      for (const d of this.world.col.dyn) this.botNav.mark(d);      // (the bulldozer: the bot walks round it)
      this.botNav.build([goal], 1e5);
      this.botNavKey = key;
    }
    return this.botNav;
  }

  // the side-scroller: keep a few metres from Omega, jump its shockwaves and the dead that get close, shoot
  botInput2D() {
    const me = this.me, S = this.side;
    let best = null, bd = 1e9;
    const boss = this.bossZ();
    for (const z of this.zombies.values()) { if (!z.alive) continue; const d = Math.abs(z.x - me.x); if (d < bd) { bd = d; best = z; } }
    const focus = boss || best;
    let mx = 0, my = 0;
    if (focus) {
      const side = me.x < focus.x ? -1 : 1;
      const want = focus.x + side * 8;
      mx = Math.max(-1, Math.min(1, (want - me.x) * 0.5));
      if (Math.abs(me.x - S.X0) > 19) mx = -Math.sign(me.x - S.X0);
    }
    const wave = S.waves.some((w) => Math.abs(w.x - me.x) < 3.5 && Math.sign(me.x - w.x) === w.dir);
    if (wave || (best && bd < 1.6 && Math.random() < 0.08)) my = -1;
    const t = best && bd < 18 ? best : null;
    const aim = t ? (() => { const ax = t.x - me.x, ay = 1.0 * t.char.root.scale.x - ((me.y2 || 0) + 1.35), l = Math.hypot(ax, ay); return { x: ax / l, y: -ay / l, mag: 1 }; })() : null;
    return { move: { x: mx, y: my }, aim, firing: !!aim, tap: false, reload: me.ammo === 0, mouse: null, mouseFiring: false, jump: false };
  }

  botInput(dt) {
    const me = this.me;
    if (this.side?.active || this.side?.warping) return this.botInput2D(dt);
    // what the objective wants: the nearest unfinished breaker, the nearest live nest (to shoot from range), the dozer
    let obGoal = null, obShoot = null;
    const O = this.objective;
    if (this.hold === 0 && O?.custom) {
      const byDist = (list) => list.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
      if (O.mode === 'power') { const p = byDist(O.parts.filter((q) => !q.done)); if (p) obGoal = { x: p.x + (p.x < -1 ? 1.6 : p.x > 1 ? -1.6 : 0), z: p.z + (Math.abs(p.x) < 1 ? 1.6 : 0), r: 1.4 }; }
      else if (O.mode === 'nests') { const p = byDist(O.parts.filter((q) => q.target.alive)); if (p) { obGoal = { x: p.x * 0.55, z: p.z + 4, r: 2.5 }; obShoot = p.target; } }
      else if (O.mode === 'dozer') obGoal = { x: 3.4, z: O.dz.z + 1, r: 2.2 };
    }
    let best = null, bd = 1e9;
    for (const z of this.zombies.values()) {
      if (!z.alive || z.idle) continue;
      const d = Math.hypot(z.x - me.x, z.z - me.z);
      if (d < bd) { bd = d; best = z; }
    }
    const t = this.time;
    let mx, my;
    const holding = this.hold >= 0;
    const god = this._god ??= new URLSearchParams(location.search).has('god');     // QA: walk the objectives, ignore the crowd
    if (best && bd < 3.2 && !god) { mx = Math.cos(t * 0.9) * 0.6 + (me.x - best.x) * 0.3; my = Math.sin(t * 0.9) * 0.6 + (me.z - best.z) * 0.3; }
    else if (this.phase === 'extract') { const G = this.goal(); mx = (G.x - me.x) * 0.5; my = Math.max(-1, Math.min(1, (G.z - me.z) * 0.3)); }
    else if (holding && obGoal) {
      // the level's objective: walk to the breaker / the nest / the dozer's side
      const d = Math.hypot(obGoal.x - me.x, obGoal.z - me.z);
      if (d > obGoal.r) {
        const f = this.botField(obGoal, `${obGoal.x.toFixed(0)},${obGoal.z.toFixed(0)}`);
        const v = f.dir(me.x, me.z);
        if (v) { mx = v.x; my = v.z; } else { mx = (obGoal.x - me.x) * 0.3; my = (obGoal.z - me.z) * 0.3; }
      } else { mx = Math.cos(t * 0.9) * 0.3; my = Math.sin(t * 0.9) * 0.3; }
    } else if (holding && HOLDS[this.hold].boss) {
      // the boss fight: close on the boss along the street (never straight through a wreck)
      const bz = this.bossZ();
      const goal = { x: 0, z: Math.round(bz ? bz.z + 7 : L.lz.z + 6) };
      if (Math.hypot(goal.x - me.x, goal.z - me.z) > 3) {
        const v = this.botField(goal, 'b' + goal.z).dir(me.x, me.z);
        if (v) { mx = v.x; my = v.z; } else { mx = -me.x * 0.3; my = (goal.z - me.z) * 0.2; }
      } else { mx = Math.cos(t * 0.9) * 0.6; my = Math.sin(t * 0.9) * 0.4; }
    } else if (holding) {
      const c = this.holdCentre(this.hold) + 10;
      mx = -me.x * 0.3; my = Math.max(-0.4, Math.min(0.4, (c - me.z) * 0.2));
    } else {
      // walk the maze: a distance field from where it is going (the shut gate, then the boss plaza)
      let goal = this.opened < L.gate.length ? { x: 0, z: L.gate[this.opened] + 4 } : { x: 0, z: L.lz.z + 2 };
      let gk = 'g' + this.opened;
      // a locked door ahead: the keycard first
      const kc = this.world.keyItems.find((k) => !k.taken && zoneAt(me.z, 4)?.index === k.zone);
      if (kc) { goal = { x: kc.x, z: kc.z }; gk = 'k' + kc.color; }
      const d = this.botField(goal, gk).dir(me.x, me.z);
      if (d) { mx = d.x; my = d.z; } else { mx = (goal.x - me.x) * 0.3; my = -1; }
    }
    // stuck on something (a sandbag arc dead ahead)? step round it
    const bp = this._bot || (this._bot = { x: me.x, z: me.z, t: 0, side: 0, until: 0 });
    bp.t += dt;
    if (bp.t > 1.2) { if (Math.hypot(me.x - bp.x, me.z - bp.z) < 0.5 && !(best && bd < 3.2) && (this.hold < 0 || (obGoal && Math.hypot(obGoal.x - me.x, obGoal.z - me.z) > obGoal.r))) { bp.side = Math.random() < 0.5 ? -1 : 1; bp.until = this.time + 1.6; } bp.x = me.x; bp.z = me.z; bp.t = 0; }
    if (this.time < bp.until) { mx = bp.side * 1.0; my = -0.5; }
    const move = { x: Math.max(-1, Math.min(1, mx)), y: Math.max(-1, Math.min(1, my)) };
    let aim = null;
    if (best && bd < 13 && !(obShoot && (bd > 2.2 || god))) aim = { x: (best.x - me.x) / bd, y: (best.z - me.z) / bd, mag: 1 };
    else if (obShoot) { const d = Math.hypot(obShoot.x - me.x, obShoot.z - me.z); if (d < 14) aim = { x: (obShoot.x - me.x) / d, y: (obShoot.z - me.z) / d, mag: 1 }; }
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
    const size = r.getDrawingBufferSize(_v2);
    cutaway.uRes.value.copy(size);
    const v = _v3;
    let i = 0;
    for (const p of this.players.values()) {
      if (i >= 4) break;
      v.set(p.x, 1.1, p.z).project(this.camera);
      cutaway.uPlayers.value[i].set((v.x * 0.5 + 0.5) * size.x, (v.y * 0.5 + 0.5) * size.y, v.z * 0.5 + 0.5, 0.16);
      i++;
    }
    for (; i < 4; i++) cutaway.uPlayers.value[i].w = 0;
  }

  after(sec, fn) { this.timers.push({ at: this.time + sec, fn }); }

  dispose() {
    this.timers.length = 0;
    this.bank(false);          // quitting keeps what you looted
    this.objective?.dispose();
    this.speech?.dispose();
    this.side?.dispose();
    for (const z of this.zombies.values()) z.dispose();
    for (const p of this.players.values()) p.dispose();
    this.scene.clear();
    audio.stopAll();
  }
}

