// A survivor: movement, the pistol, the flashlight. The LOCAL player is
// simulated on its own machine (instant response); everyone else is
// interpolated from the network.
import * as THREE from 'three';
import { makeCharacter } from './assets.js';
import { Rig, SurvivorAnim } from './rig.js';
import { audio, buzz } from './audio.js';
import { tex } from './assets.js';
import { Q } from './quality.js';
import { indoors } from './zones.js';

import { WEAPONS, WEAPON_IDS, GUN_IDS, weaponStats, ARMOR_ABSORB, BASE_HP, BASE_SPEED, PROTO, lookBits } from './weapons.js';
import { gear } from './gear.js';
const GOD = typeof location !== 'undefined' && new URLSearchParams(location.search).has('god');

// what a survivor with nothing bought has (also what a friend's machine assumes about a remote player)
export const defaultLoadout = () => ({
  weapons: { pistol: weaponStats('pistol') }, equipped: 'pistol', maxHp: BASE_HP, maxArmor: 0, speed: BASE_SPEED, cashMul: 1,
});

const GUN_TURN = new THREE.Quaternion();     // the gun's own frame already has x forward
const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const GOLD = new THREE.Color(0xd8a640);
// where a red-dot sits on each gun (x along the gun, found on the model's top at that point)
const SIGHT_X = { pistol: -0.01, smg: 0.02, shotgun: 0.05, rifle: 0.02, lmg: 0.06, riot12: 0.28 };
const sm01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const _tip = new THREE.Vector3(), _loc = new THREE.Vector3(), _mz = new THREE.Vector3();

export class Player {
  constructor(game, id, { name = 'Survivor', model = 'survivor_a', local = false, seat = 0, loadout = null } = {}) {
    this.game = game;
    this.id = id;
    this.name = name;
    this.local = local;
    this.seat = seat;
    this.model = model;
    this.char = makeCharacter(model);
    this.rig = new Rig(this.char);
    this.anim = new SurvivorAnim(this.rig);
    game.scene.add(this.char.root);
    this.x = 0; this.z = 0; this.vx = 0; this.vz = 0;
    this.face = Math.PI;      // facing north (-z)
    this.aimx = 0; this.aimz = -1;
    this.aiming = false;
    const lo = this.loadout = loadout || defaultLoadout();
    this.maxHp = lo.maxHp; this.hp = lo.maxHp;
    this.maxArmor = lo.maxArmor; this.armor = lo.maxArmor;
    this.speed = lo.speed;
    this.cashMul = lo.cashMul;
    this.spec = lo.spec || null;
    this.over = null;          // the gunner's overdrive { t, rateK, dmgK }
    this.dash = null;          // the scout's dash in progress
    this.invT = 0;             // untouchable (a dash)
    this.spinT = 0;            // the Warmonger spinning up
    this.shockN = 0;           // the Hornet's hit counter
    this.down = false;
    this.downT = 0;
    this.reviveT = 0;
    this.dead = false;
    this.reloadT = 0;
    this.cool = 0;
    this.drawT = 0;
    this.aimHold = 0;
    this.assistTarget = null;
    this.stepDist = 0;
    this.buf = [];
    this.flags = 0;
    // the guns: one model per weapon in the kit, only the drawn one is visible. A friend's machine does not
    // know what he owns, so a remote survivor carries every gun.
    this.kit = {};
    const ids = local ? WEAPON_IDS.filter((w) => lo.weapons[w]) : GUN_IDS;
    for (const id of ids) this.kit[id] = this.makeGun(id, lo.weapons[id] || weaponStats(id));
    this.order = ids;
    this.anim.onEvent = (n) => this.reloadEvent(n);
    this.magFall = null;
    this.setWeapon(local ? lo.equipped : 'pistol', true);
    // the flashlight: the one shadow caster for the local player
    const fl = new THREE.SpotLight(0xfff1dc, local ? 560 : 400, 28, 0.46, 0.5, 1.5);
    if (Q.spotMap) fl.map = tex('tex/flashlight.webp');
    fl.castShadow = local && Q.spotShadow;
    if (fl.castShadow) {
      fl.shadow.mapSize.set(Q.spotShadowSize, Q.spotShadowSize);
      fl.shadow.bias = -0.0004;
      fl.shadow.normalBias = 0.03;
      fl.shadow.camera.near = 0.3;
    }
    game.scene.add(fl, fl.target);
    this.light = fl;
    // a faint lantern so anything right next to you is always readable
    // (only your own: a point light is paid for on every lit pixel, a friend's flashlight is enough)
    this.lantern = local ? new THREE.PointLight(0xa9bddb, 30, 12, 1.3) : null;
    if (this.lantern) game.scene.add(this.lantern);
    // laser sight: a thin red line that only shows while aiming
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    this.laser = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.laser.frustumCulled = false;
    game.scene.add(this.laser);
  }

  get alive() { return !this.down && !this.dead; }

  // the current gun's numbers, and its ammo, read as if they were the player's own
  get ammo() { return this.cur.ammo; }
  set ammo(v) { this.cur.ammo = v; }
  get W() { return this.cur.W; }

  makeGun(id, stats) {
    const game = this.game;
    const gun = game.gunModels[id].clone();
    gun.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    gun.visible = false;
    game.scene.add(gun);
    const tip = new THREE.Object3D();
    tip.position.set(...WEAPONS[id].tip);
    gun.add(tip);
    const slide = gun.getObjectByName('gun_slide');
    const mag = gun.getObjectByName('gun_mag');
    // a spare magazine: rides the support hand during a reload, and the old one falls
    const prop = new THREE.Group();
    if (mag) {
      const m = mag.clone(true);
      m.position.set(...WEAPONS[id].spare);
      prop.add(m);
    }
    prop.visible = false;
    game.scene.add(prop);
    const k = { id, W: stats, gun, tip, slide, mag, magProp: prop, ammo: stats.mag, bits: 0, mats: null, adds: [] };
    this.decorate(k, lookBits(stats));
    return k;
  }

  // how a gun looks: gold, the prototype's glow, the attachments its kills have earned. `bits` = lookBits().
  decorate(k, bits) {
    if (k.bits === bits) return;
    k.bits = bits;
    const gun = k.gun;
    for (const a of k.adds) a.parent?.remove(a);
    k.adds = [];
    // materials of its own once it is not stock (the model's are shared by every copy)
    if (bits & 3 && !k.mats) {
      k.mats = [];
      gun.traverse((o) => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); k.mats.push(...[].concat(o.material)); } });
    }
    if (k.mats) for (const m of k.mats) {
      m.userData.base ??= { c: m.color.clone(), metal: m.metalness, rough: m.roughness, e: m.emissive?.clone() };
      const B = m.userData.base;
      const glowy = B.e && B.e.getHex() !== 0;
      m.color.copy(bits & 1 && !glowy ? GOLD : B.c);
      m.metalness = bits & 1 && !glowy ? 1 : B.metal;
      m.roughness = bits & 1 && !glowy ? 0.3 : B.rough;
      if (m.emissive && !glowy) m.emissive.setHex(bits & 2 ? PROTO[k.id].color : 0x000000);
      m.emissiveIntensity = bits & 2 && !glowy ? 0.25 : m.emissiveIntensity;
    }
    k.glow = bits & 2 ? PROTO[k.id].color : null;
    // attachments
    const mag = k.mag;
    if (mag) mag.scale.y = bits & 4 && k.id !== 'riot12' ? 1.3 : 1;      // (a drum stays round)
    if (bits & 8) {
      const rd = gear('reddot', { shadow: false });
      rd.position.set(SIGHT_X[k.id] ?? 0, topAt(gun, SIGHT_X[k.id] ?? 0, k.id), 0);
      gun.add(rd); k.adds.push(rd);
    }
    if (bits & 16) {
      const sp = gear('suppressor', { shadow: false });
      sp.position.copy(k.tip.position).x -= 0.005;
      sp.scale.setScalar(k.id === 'pistol' || k.id === 'smg' ? 0.9 : 1.15);
      gun.add(sp); k.adds.push(sp);
      k.tip.position.x = WEAPONS[k.id].tip[0] + 0.16 * sp.scale.x;
    } else k.tip.position.x = WEAPONS[k.id].tip[0];
  }

  // a friend's gun: what his machine says it looks like
  applyLook(id, bits) { const k = this.kit[id]; if (k) this.decorate(k, bits); }

  // draw a gun: swap the model, the hold and the sounds. Ammo stays with the gun.
  setWeapon(id, instant = false) {
    const k = this.kit[id];
    if (!k) return false;
    if (this.cur === k) return true;
    if (this.cur) { this.cur.gun.visible = false; this.cur.magProp.visible = false; }
    this.reloadT = 0; this.anim.reload = 0; this.anim.slideLock = false;
    if (this.magFall) { this.game.scene.remove(this.magFall.m); this.magFall = null; }
    this.cur = k;
    this.gun = k.gun; this.gunTip = k.tip; this.slideNode = k.slide; this.magNode = k.mag; this.magProp = k.magProp;
    k.gun.visible = !this.dead;
    this.spread = k.W.spreadBase;
    this.anim.setWeapon(id);
    if (!instant) { this.drawT = 0.38; this.anim.swap = 1; audio.play('swap', { x: this.x, z: this.z, vol: 0.7, jitter: 0.03 }); this.game.hud.weapon?.(this); this.game.hud.ammo(this); }
    return true;
  }

  cycleWeapon() {
    if (this.order.length < 2 || this.down) return;
    const i = this.order.indexOf(this.cur.id);
    this.setWeapon(this.order[(i + 1) % this.order.length]);
  }

  selectSlot(n) { const id = this.order[n]; if (id && !this.down) this.setWeapon(id); }

  spawnAt(x, z) { this.x = x; this.z = z; this.place(); }

  place() {
    this.char.root.position.set(this.x, 0, this.z);
    this.char.root.rotation.y = this.face;
  }

  // --------------------------------------------------------- local sim --
  control(dt, inp, cam) {
    const g = this.game;
    if (g.side?.active || g.side?.warping) return g.side.control(this, inp, dt);     // level 5's side-scrolling boss fight
    if (this.dead) return;
    // pinned under a leaper: no moving, no shooting. Every tap (or flick of a stick) is a heave to get free.
    if (this.pinnedBy) {
      this.vx = this.vz = 0;
      const mv = Math.hypot(inp.move.x, inp.move.y) > 0.5, fire = !!(inp.firing || inp.mouseFiring);
      if (inp.tap || (fire && !this._pf) || (mv && !this._pm) || inp.reload) g.struggle();
      this._pf = fire; this._pm = mv;
      g.hud.hint(g.players.size > 1 ? 'PINNED! Tap fast to break free, or call a friend to shoot it off' : 'PINNED! Tap fast to break free');
      return;
    }
    const sp = this.down ? 0.7 : this.speed * (this.reloadT > 0 ? 0.92 : 1) * (this.W.moveK || 1);
    // screen -> world: right is +x, down the screen is +z
    let mx = inp.move.x, mz = inp.move.y;
    const ax = mx * sp, az = mz * sp;
    // accelerate quickly, stop quickly (weighty but responsive)
    const k = Math.min(1, dt * 14);
    this.vx += (ax - this.vx) * k;
    this.vz += (az - this.vz) * k;
    if (this.invT > 0) this.invT -= dt;
    // the scout's dash overrides the stick for a fifth of a second
    if (this.dash) {
      this.vx = this.dash.vx; this.vz = this.dash.vz;
      this.dash.t -= dt;
      if (this.dash.t <= 0) { this.vx *= 0.35; this.vz *= 0.35; this.dash = null; }
    }
    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    const res = g.world.col.resolve(nx, nz, 0.33);
    // zombies are solid
    for (const zb of g.zombies.values()) {
      if (!zb.alive) continue;
      const dx = res.x - zb.x, dz = res.z - zb.z, d = Math.hypot(dx, dz);
      const rr = 0.55 + ((zb.def.rad || 0.32) - 0.32) * 0.9;
      if (d < rr && d > 1e-4) { res.x = zb.x + dx / d * rr; res.z = zb.z + dz / d * rr; }
    }
    const moved = Math.hypot(res.x - this.x, res.z - this.z);
    this.x = res.x; this.z = res.z;
    // footsteps
    this.stepDist += moved;
    if (this.stepDist > 0.95) { this.stepDist = 0; audio.play('step', { x: this.x, z: this.z, vol: 0.35 }); }

    // aim: the right stick, else the mouse, else keep facing the way you move
    let aim = null;
    if (inp.aim) aim = { x: inp.aim.x, z: inp.aim.y };
    else if (inp.mouse && !g.touch) {
      const p = g.screenToGround(inp.mouse.x, inp.mouse.y);
      if (p) { const dx = p.x - this.x, dz = p.z - this.z, l = Math.hypot(dx, dz); if (l > 0.3) aim = { x: dx / l, z: dz / l }; }
    }
    if (aim) { this.aimHold = 0.3; this.aimx = aim.x; this.aimz = aim.z; }
    else this.aimHold -= dt;
    this.aiming = this.aimHold > 0 || inp.mouseFiring;
    // turn toward the aim at ~800°/s (never snap); otherwise toward travel
    let tx, tz;
    if (this.aiming) { tx = this.aimx; tz = this.aimz; } else if (Math.hypot(this.vx, this.vz) > 0.4) { tx = this.vx; tz = this.vz; }
    if (tx !== undefined) {
      const ta = Math.atan2(tx, tz);
      let da = ta - this.face;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const rate = 14 * dt;
      this.face += Math.max(-rate, Math.min(rate, da));
    }
    // ---- the gun
    const W = this.W;
    if (inp.slot !== null && inp.slot !== undefined) this.selectSlot(inp.slot);
    if (inp.swap) this.cycleWeapon();
    this.cool -= dt;
    if (this.pumpT > 0 && (this.pumpT -= dt) <= 0) { audio.play('pump', { x: this.x, z: this.z, vol: 0.8 }); this.anim.slide = 0.085; }
    this.drawT = Math.max(0, this.drawT - dt);
    this.spread = Math.max(W.spreadBase, this.spread - W.spreadRecover * dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      this.anim.reload = 1 - this.reloadT / W.reload;
      if (this.reloadT <= 0) { this.ammo = W.mag; this.reloadT = 0; this.anim.reload = 0; buzz([8]); g.hud.ammo(this); }
    }
    if (inp.reload && this.ammo < W.mag && this.reloadT <= 0 && this.drawT <= 0) this.startReload();
    const wantFire = (inp.firing && this.aiming) || inp.tap || inp.mouseFiring;
    let interval = inp.tap || inp.mouseFiring ? W.tapInterval : W.autoInterval;
    if (this.over) interval /= this.over.rateK;                        // the gunner's overdrive
    if (W.spin) {                                                      // the Warmonger spins up the longer you hold it
      this.spinT = wantFire && this.reloadT <= 0 ? Math.min(W.spin.t, this.spinT + dt) : Math.max(0, this.spinT - dt * 2);
      interval /= 1 + W.spin.k * this.spinT / W.spin.t;
    }
    if (wantFire && this.cool <= 0 && this.reloadT <= 0 && this.drawT <= 0) {
      // a tap with no aim yet: shoot the best target in front
      if (inp.tap && !inp.aim) {
        const t = this.bestTarget(this.aimx, this.aimz, Math.PI * 0.5);
        if (t) { const dx = t.x - this.x, dz = t.z - this.z, l = Math.hypot(dx, dz); this.aimx = dx / l; this.aimz = dz / l; this.face = Math.atan2(this.aimx, this.aimz); this.aimHold = 0.4; }
      }
      // fire along the BODY's facing so bullets leave the gun, not the stick
      const fx = Math.sin(this.face), fz = Math.cos(this.face);
      const err = Math.acos(Math.max(-1, Math.min(1, fx * this.aimx + fz * this.aimz)));
      if (err < 0.35 || inp.tap) {
        if (this.ammo > 0) this.fire(fx, fz);
        else if (W.power) this.dropPower();
        else { audio.play('dryfire', { x: this.x, z: this.z }); buzz([4]); this.startReload(); }
        // carry the remainder so a fast gun keeps its true rate whatever the frame time
        this.cool = interval + Math.max(this.cool, -dt);
      }
    }
    if (this.down) this.downT += dt;
  }

  startReload() {
    if (this.reloadT > 0 || this.W.power) return;
    const rt = this.W.reload;
    this.reloadT = rt;
    this.game.hud.reload(rt);
    this.game.netEvent({ k: 'reload', pid: this.id, rt: +rt.toFixed(2) });
  }

  bestTarget(dx, dz, cone) {
    let best = null, bs = 1e9;
    for (const z of this.game.zombies.values()) {
      if (!z.alive) continue;
      const ex = z.x - this.x, ez = z.z - this.z, d = Math.hypot(ex, ez);
      if (d > this.W.assistRange || d < 0.1) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (ex * dx + ez * dz) / d)));
      if (ang > cone) continue;
      // can we actually see it?
      if (this.game.world.col.ray(this.x, this.z, ex / d, ez / d, d).d < d - 0.2) continue;
      let score = ang * 1.0 + d * 0.03;
      if (z.state === 'windup' || d < 3) score -= 0.15;
      if (score < bs) { bs = score; best = z; }
    }
    return best;
  }

  fire(dirx, dirz) {
    const g = this.game;
    const W = this.W;
    if (W.mode === 'flame') return this.flameFire();
    if (W.mode === 'gl') return this.glFire();
    if (!this.over) this.ammo--;                // overdrive: no reloads
    if (this.local) g.stats.shots++;
    const dmgK = (this.spec === 'gunner' ? 1.08 : 1) * (this.over?.dmgK || 1);
    const col = W.proto ? rgb(PROTO[W.id].color) : null;
    // aim assist: acquire inside ±10°, keep inside ±16°, bend the shot
    let t = this.assistTarget;
    if (t && (!t.alive || !this.inCone(t, dirx, dirz, W.assistHold))) t = null;
    if (!t) t = this.bestTarget(dirx, dirz, W.assistAcquire);
    this.assistTarget = t;
    let a0 = Math.atan2(dirz, dirx);
    if (t) {
      const ta = Math.atan2(t.z - this.z, t.x - this.x);
      let da = ta - a0;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      a0 += da * W.assistBend;
    }
    const moving = Math.hypot(this.vx, this.vz) > 0.5 ? W.spreadMove : 0;
    const mz = this.muzzle();
    // one ray, or a shotgun's cloud of pellets; the hits on each body are summed into one wound
    const pellets = W.pellets || 1;
    const hits = new Map();
    let first = null;
    for (let i = 0; i < pellets; i++) {
      let a = a0;
      if (pellets > 1) a += ((i + Math.random()) / pellets - 0.5) * (W.spreadBase + moving);
      else a += (Math.random() * 2 - 1) * (this.spread + moving) * 0.5;
      const dx = Math.cos(a), dz = Math.sin(a);
      const wall = g.world.col.ray(mz.x, mz.z, dx, dz, W.range);
      let hit = null, hd = wall.d;
      // every body on the line, nearest first: a pellet that PIERCES goes on into the one behind (W.pierce)
      const line = [];
      for (const z of g.zombies.values()) {
        if (!z.alive) continue;
        const fx = z.x - mz.x, fz = z.z - mz.z;
        const along = fx * dx + fz * dz;
        if (along < 0 || along > wall.d) continue;
        const perp = Math.abs(fx * dz - fz * dx);
        const rad = (z.def.rad || 0.32) + (z === t ? W.magnet * 0.5 : 0);
        if (perp < rad) line.push({ z, d: along - Math.sqrt(Math.max(0, rad * rad - perp * perp)) * 0.5 });
      }
      if (line.length > 1) line.sort((p, q) => p.d - q.d);
      if (line.length) { hit = line[0].z; hd = line[0].d; }
      // the nests and the gas tanks can be shot too
      if (g.targets) for (const tg of g.targets.values()) {
        if (!tg.alive) continue;
        const fx = tg.x - mz.x, fz = tg.z - mz.z;
        const along = fx * dx + fz * dz;
        if (along < 0 || along - tg.r > hd + 0.05) continue;        // (its own collider stops the ray at its skin)
        const perp = Math.abs(fx * dz - fz * dx);
        if (perp < tg.r) { hd = along - Math.sqrt(Math.max(0, tg.r * tg.r - perp * perp)); hit = tg; }
      }
      const hx = mz.x + dx * hd, hz = mz.z + dz * hd;
      g.fx.tracer(mz.x + dx * 0.4, mz.y, mz.z + dz * 0.4, hx, hz, mz.y, col);
      if (hit) {
        const fall = W.falloff ? 1 - W.falloff * Math.min(1, hd / W.range) : 1;
        const h = hits.get(hit) || { dmg: 0, dx, dz, hx, hz, first: true };
        h.dmg += W.dmg * dmgK * fall; hits.set(hit, h);
        // through the first body and into the next, weaker
        if (!hit.isTarget) for (let k = 1; k <= (W.pierce || 0) && k < line.length; k++) {
          const b = line[k], f2 = (W.falloff ? 1 - W.falloff * Math.min(1, b.d / W.range) : 1) * (W.pierceK ?? 0.6);
          const h2 = hits.get(b.z) || { dmg: 0, dx, dz, hx: mz.x + dx * b.d, hz: mz.z + dz * b.d };
          h2.dmg += W.dmg * dmgK * f2; hits.set(b.z, h2);
        }
      } else if (wall.d < W.range && (pellets === 1 || i % 2 === 0)) {
        g.fx.hard(hx, mz.y, hz, wall.nx, wall.nz, dx, dz);
        if (i === 0) audio.play('hard', { x: hx, z: hz, vol: 0.5 });
      }
      if (i === 0) first = { dx, dz, hx, hz, w: hit ? 0 : (wall.d < W.range ? 1 : 2), nx: wall.nx, nz: wall.nz };
    }
    const { dx, dz } = first;
    this.spread = Math.min(W.spreadMax, this.spread + W.spreadAdd);
    // feel: kick, shake, flash, smoke, brass, sound, haptics
    g.cam.kick(-dx * W.kick, -dz * W.kick);
    g.cam.trauma(W.trauma);
    this.anim.fire(this.ammo === 0 && !W.pump, W.recoil);
    if (W.pump) { this.pumpT = W.pump; this.anim.slide = 0; }
    g.fx.muzzle(mz.x, mz.y, mz.z, dx, dz);
    if (!W.pump && !W.noShell) {
      const sh = g.fx.shell(mz.x - dx * 0.12, mz.y + 0.05, mz.z - dz * 0.12, dx, dz);
      sh.cb = (s) => audio.play('shell', { x: s.x, z: s.z, vol: W.shellVol });
    }
    if (W.quiet && !W.power) audio.play('sup', { vol: 0.9, jitter: 0.04, rate: W.pellets ? 0.75 : W.id === 'pistol' ? 1.1 : 0.95 });
    else audio.play(W.shot, { vol: 1, jitter: 0.035 });
    if (!W.quiet) g.noise = { x: this.x, z: this.z, t: g.time };      // a suppressor does not wake the sleeping dead
    audio.duck(W.duck, 150);
    buzz([pellets > 1 ? 30 : 12]);
    g.hud.ammo(this);
    const extra = {};          // what the prototype did, for the friends' screens
    const struck = new Set(hits.keys());
    for (const [hit, h] of hits) {
      if (hit.isTarget) { g.targetHit(this, hit, h.dmg, h.dx, h.dz); continue; }
      const crit = Math.random() < (W.critChance ?? (pellets > 1 ? 0.06 : 0.12)) || (hit === t && Math.random() < 0.1);
      g.fx.flesh(h.hx, 1.25, h.hz, h.dx, h.dz, pellets > 1 ? 1.5 : 1, crit);
      audio.play('flesh', { x: h.hx, z: h.hz, vol: 0.7 });
      hit.hitFx(h.dx, h.dz, crit);
      buzz([6]);
      let opt = W.burn ? { burn: W.burn } : null;
      if (W.burn) hit.burnT = Math.max(hit.burnT || 0, W.burn.t);       // (shown at once; the host keeps the real fire)
      if (W.freeze) { (opt ||= {}).fr = W.freeze.t; hit.frostT = Math.max(hit.frostT || 0, W.freeze.t); }
      g.localHit(this, hit, h.dmg * (crit ? W.crit : 1), h.dx, h.dz, crit, W.knock || 1, opt);
      if (h.first) this.protoHit(hit, h, struck, extra, col);
    }
    g.netEvent({ k: 'shot', pid: this.id, wp: GUN_IDS.indexOf(W.id), x: +mz.x.toFixed(2), z: +mz.z.toFixed(2), y: +mz.y.toFixed(2), dx: +dx.toFixed(3), dz: +dz.toFixed(3), hx: +first.hx.toFixed(2), hz: +first.hz.toFixed(2), w: first.w, nx: +first.nx.toFixed(2), nz: +first.nz.toFixed(2), lf: this.cur.bits, ...extra });
  }

  // ---- the power weapons
  // the flamethrower: everything in the cone ahead takes fire (and catches); a river of flame is drawn
  flameFire() {
    const g = this.game, W = this.W, F = W.flame;
    this.ammo--;
    const mz = this.muzzle(), fx = Math.sin(this.face), fz = Math.cos(this.face);
    const len = Math.min(F.len, g.world.col.ray(mz.x, mz.z, fx, fz, F.len).d + 0.6);
    for (const z of g.zombies.values()) {
      if (!z.alive) continue;
      const ex = z.x - mz.x, ez = z.z - mz.z, d = Math.hypot(ex, ez);
      if (d > len + (z.def.rad || 0.3) || d < 0.01) continue;
      if (Math.acos(Math.max(-1, Math.min(1, (ex * fx + ez * fz) / d))) > F.cone + 0.25 / Math.max(1, d)) continue;
      z.burnT = Math.max(z.burnT || 0, 1);
      g.localHit(this, z, W.dmg * (this.spec === 'gunner' ? 1.08 : 1), ex / d, ez / d, false, 0.12, { burn: F.burn });
    }
    if (g.targets) for (const t of g.targets.values()) if (t.alive && Math.hypot(t.x - mz.x, t.z - mz.z) < len && ((t.x - mz.x) * fx + (t.z - mz.z) * fz) > 0) g.targetHit(this, t, W.dmg * 0.5, fx, fz);
    this.flameFx = 0.12; this.flameT = 0.15;
    this.flameSound();
    g.noise = { x: this.x, z: this.z, t: g.time };
    g.cam.trauma(0.03);
    this.anim.fire(false, W.recoil);
    g.hud.ammo(this);
    buzz([4]);
    if (((this._fl = (this._fl || 0) + 1) & 3) === 0) g.netEvent({ k: 'shot', pid: this.id, wp: GUN_IDS.indexOf(W.id), fl: 1, x: +mz.x.toFixed(2), z: +mz.z.toFixed(2), y: +mz.y.toFixed(2), dx: +fx.toFixed(2), dz: +fz.toFixed(2), hx: 0, hz: 0, w: 2 });
  }

  flameSound() {
    this.flameT = 0.18;
    if (!this.flameVoice) this.flameVoice = audio.play('flame', { x: this.local ? null : this.x, z: this.local ? null : this.z, vol: this.local ? 0.75 : 0.5, loop: true, jitter: 0.02 });
  }

  // the stream itself: fire racing out of the nozzle, spreading and slowing, smoke off its end
  flameJet(m, fx, fz, dt, k) {
    const g = this.game;
    const n = Math.round(dt * 260 * k);
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(fz, fx) + (Math.random() - 0.5) * 0.36, s = 10 + Math.random() * 6, hot = Math.random();
      g.fx.fire.emit({ x: m.x + fx * 0.12, y: m.y - 0.05, z: m.z + fz * 0.12, vx: Math.cos(a) * s, vy: 0.2 + Math.random() * 1.0, vz: Math.sin(a) * s, life: 0.45 + Math.random() * 0.25, s0: 0.25, s1: 1.8 + Math.random() * 0.9, r: 0.95, g: 0.24 + hot * 0.36, b: 0.04 + hot * 0.06, a0: 0.42, a1: 0, drag: 1.1, spin: 2 });
    }
    // a white-hot tongue at the nozzle, embers thrown off the stream, black smoke off its end
    g.fx.glow.emit({ x: m.x + fx * 0.35, y: m.y, z: m.z + fz * 0.35, life: 0.06, s0: 0.7, s1: 0.4, r: 1, g: 0.7, b: 0.3, a0: 0.6, a1: 0 });
    if (Math.random() < dt * 30) { const a = Math.atan2(fz, fx) + (Math.random() - 0.5) * 0.6, s = 6 + Math.random() * 6; g.fx.sparkList.push({ x: m.x + fx, y: m.y, z: m.z + fz, vx: Math.cos(a) * s, vy: 1 + Math.random() * 2, vz: Math.sin(a) * s, t: 0, max: 0.4 + Math.random() * 0.3 }); }
    if (Math.random() < dt * 14) g.fx.smoke.emit({ x: m.x + fx * 5.5, y: m.y + 0.8, z: m.z + fz * 5.5, vx: fx * 1.5, vy: 1.4, vz: fz * 1.5, life: 1.8, s0: 0.8, s1: 2.8, r: 0.1, g: 0.09, b: 0.08, a0: 0.32, a1: 0, drag: 0.8, spin: 0.3 });
    g.fx.flash.x = m.x + fx * 2.5; g.fx.flash.y = m.y + 0.4; g.fx.flash.z = m.z + fz * 2.5; g.fx.flash.t = 0.02;
  }

  // the launcher: a 40 mm round in a flat arc that bursts on whatever it hits
  glFire() {
    const g = this.game, W = this.W;
    this.ammo--;
    const mz = this.muzzle(), fx = Math.sin(this.face), fz = Math.cos(this.face);
    g.nades.fireRound(this, mz, fx, fz);
    g.fx.muzzle(mz.x, mz.y, mz.z, fx, fz);
    audio.play(W.shot, { vol: 1, jitter: 0.04 });
    g.cam.kick(-fx * W.kick, -fz * W.kick); g.cam.trauma(W.trauma);
    this.anim.fire(false, W.recoil);
    g.hud.ammo(this);
    buzz([20]);
  }

  // a power weapon out of the case: into the kit and into your hands (a second one tops it up)
  pickPower(id) {
    let k = this.kit[id];
    if (!k) { k = this.kit[id] = this.makeGun(id, weaponStats(id)); }
    if (!this.order.includes(id)) this.order.push(id);
    k.ammo = Math.min(k.W.mag * 2, (this.cur === k ? k.ammo : 0) + k.W.mag);
    this.setWeapon(id);
    this.game.hud.weapon(this); this.game.hud.ammo(this);
  }

  // out of shots: it is gone, back to your own gun
  dropPower() {
    const id = this.cur.id, g = this.game;
    this.order = this.order.filter((o) => o !== id);
    const prev = this.order.find((o) => o === this.loadout.equipped) || this.order[0];
    this.setWeapon(prev);
    g.hud.toast(`${WEAPONS[id].name} is empty`);
    g.hud.weapon(this);
  }

  // a prototype's trick, off the body a round struck first (the ricochet, the shock arc, the shrapnel burst)
  protoHit(hit, h, struck, extra, col) {
    const g = this.game, W = this.W;
    const near = (x, z, r, n) => {
      const out = [];
      for (const o of g.zombies.values()) {
        if (!o.alive || struck.has(o)) continue;
        const d = (o.x - x) ** 2 + (o.z - z) ** 2;
        if (d < r * r) out.push({ o, d });
      }
      return out.sort((a, b) => a.d - b.d).slice(0, n).map((q) => q.o);
    };
    if (W.ricochet) {
      const o = near(hit.x, hit.z, W.ricochet.r, 1)[0];
      if (o) {
        struck.add(o);
        const d = Math.hypot(o.x - hit.x, o.z - hit.z) || 1, dx = (o.x - hit.x) / d, dz = (o.z - hit.z) / d;
        g.fx.tracer(hit.x, 1.2, hit.z, o.x, o.z, 1.2, col);
        g.fx.hard(hit.x, 1.25, hit.z, -dx, -dz, dx, dz);
        o.hitFx(dx, dz, false);
        g.localHit(this, o, W.dmg * W.ricochet.k, dx, dz, false, 1);
        (extra.rc ??= []).push([+hit.x.toFixed(2), +hit.z.toFixed(2), +o.x.toFixed(2), +o.z.toFixed(2)]);
      }
    }
    if (W.shock && ++this.shockN % W.shock.every === 0) {
      const S = W.shock, chain = near(hit.x, hit.z, S.r, S.n);
      let px = hit.x, pz = hit.z;
      g.localHit(this, hit, 0.01, h.dx, h.dz, false, 0.2, { st: S.stun });
      for (const o of chain) {
        struck.add(o);
        g.fx.bolt(px, 1.3, pz, o.x, 1.3, o.z);
        const d = Math.hypot(o.x - px, o.z - pz) || 1;
        o.hitFx((o.x - px) / d, (o.z - pz) / d, true);
        g.localHit(this, o, W.dmg * S.k, (o.x - px) / d, (o.z - pz) / d, false, 0.3, { st: S.stun });
        px = o.x; pz = o.z;
      }
      g.fx.bolt(hit.x, 2.2, hit.z, hit.x, 0.3, hit.z, undefined, 0.12);
      audio.play('zap', { x: hit.x, z: hit.z, vol: 0.8, rate: 1.3 });
      extra.ch = [[+hit.x.toFixed(2), +hit.z.toFixed(2)], ...chain.map((o) => [+o.x.toFixed(2), +o.z.toFixed(2)])];
    }
    if (W.blast) {
      const B = W.blast;
      for (const o of near(h.hx, h.hz, B.r, 12)) {
        struck.add(o);
        const d = Math.hypot(o.x - h.hx, o.z - h.hz) || 1;
        o.hitFx((o.x - h.hx) / d, (o.z - h.hz) / d, false);
        g.localHit(this, o, W.dmg * B.k, (o.x - h.hx) / d, (o.z - h.hz) / d, false, 1.6);
      }
      miniBlast(g, h.hx, h.hz, B.r);
      extra.bl = [+h.hx.toFixed(2), +h.hz.toFixed(2)];
    }
  }

  inCone(z, dx, dz, cone) {
    const ex = z.x - this.x, ez = z.z - this.z, d = Math.hypot(ex, ez);
    if (d > this.W.assistRange * 1.2) return false;
    return Math.acos(Math.max(-1, Math.min(1, (ex * dx + ez * dz) / d))) < cone;
  }

  muzzle() {
    this.gunTip.getWorldPosition(_mz);
    return _mz;
  }

  // a remote player's shot, drawn here
  remoteShot(e) {
    const g = this.game;
    const id = GUN_IDS[e.wp] || 'pistol';
    if (this.cur.id !== id) this.setWeapon(id, true);
    if (e.lf !== undefined) this.applyLook(id, e.lf);
    if (e.fl) { this.flameFx = 0.32; return; }          // a friend's flamethrower: a burst of fire drawn here
    const col = e.lf & 2 ? rgb(PROTO[id].color) : null;
    g.fx.muzzle(e.x, e.y, e.z, e.dx, e.dz);
    g.fx.tracer(e.x + e.dx * 0.4, e.y, e.z + e.dz * 0.4, e.hx, e.hz, e.hy ?? e.y, col);
    g.fx.shell(e.x, e.y + 0.05, e.z, e.dx, e.dz);
    if (e.lf & 16) audio.play('sup', { x: e.x, z: e.z, vol: 0.7 });
    else audio.play(WEAPONS[id].shot, { x: e.x, z: e.z, vol: 0.9 });
    for (const r of e.rc || []) g.fx.tracer(r[0], 1.2, r[1], r[2], r[3], 1.2, col);
    if (e.ch) { for (let i = 1; i < e.ch.length; i++) g.fx.bolt(e.ch[i - 1][0], 1.3, e.ch[i - 1][1], e.ch[i][0], 1.3, e.ch[i][1]); audio.play('zap', { x: e.ch[0][0], z: e.ch[0][1], vol: 0.6, rate: 1.3 }); }
    if (e.bl) miniBlast(g, e.bl[0], e.bl[1], 2.2);
    this.anim.fire(false, WEAPONS[id].recoil);
    const P = WEAPONS[id].pellets || 1;
    for (let i = 1; i < P; i++) {
      const a = Math.atan2(e.dz, e.dx) + ((i + Math.random()) / P - 0.5) * WEAPONS[id].spreadBase, d = 4 + Math.random() * 8;
      g.fx.tracer(e.x + e.dx * 0.4, e.y, e.z + e.dz * 0.4, e.x + Math.cos(a) * d, e.z + Math.sin(a) * d);
    }
    if (WEAPONS[id].pump) g.after(WEAPONS[id].pump, () => { audio.play('pump', { x: this.x, z: this.z, vol: 0.6 }); this.anim.slide = 0.085; });
    if (e.w === 1) { g.fx.hard(e.hx, e.y, e.hz, e.nx, e.nz, e.dx, e.dz); audio.play('hard', { x: e.hx, z: e.hz, vol: 0.4 }); }
  }

  hurt(dmg, fromX, fromZ, kb = 0.35) {
    if (!this.alive || this.invT > 0) return;
    if (GOD) dmg *= 0.15;          // QA only (?god): the level flow can be walked end to end
    // armor takes a share of every hit until it is spent
    if (this.armor > 0) {
      const soak = Math.min(this.armor, dmg * ARMOR_ABSORB);
      this.armor -= soak; dmg -= soak;
      if (this.local) this.game.hud.armor(this.armor, this.maxArmor);
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.anim.hit();
    if (this.local) {
      const g = this.game;
      g.cam.trauma(0.4);
      const dx = this.x - fromX, dz = this.z - fromZ, l = Math.hypot(dx, dz) || 1;
      g.cam.kick(dx / l * 0.25, dz / l * 0.25);
      g.hud.damage(dmg, this.hp, this.maxHp);
      audio.play('hurt', { vol: 0.9 });
      buzz([50]);
      // being bitten pushes you back a step
      // pushed in small steps so a big shove (a boss) cannot pop you through a thin barricade
      let res = { x: this.x, z: this.z };
      for (let k = 0, n = Math.ceil(kb / 0.3); k < n; k++) res = g.world.col.resolve(res.x + dx / l * kb / n, res.z + dz / l * kb / n, 0.33);
      if (kb > 1) { g.cam.trauma(0.6); g.cam.kick(dx / l * 0.6, dz / l * 0.6); }
      this.x = res.x; this.z = res.z;
    }
    if (this.hp <= 0) this.goDown();
  }

  goDown() {
    if (this.local && !this.down) this.game.stats.downs = (this.game.stats.downs || 0) + 1;
    this.down = true;
    this.downT = 0;
    this.reloadT = 0;
  }

  revive() {
    this.down = false; this.dead = false; this.hp = this.maxHp * 0.5; this.downT = 0; this.reviveT = 0;
  }

  // --------------------------------------------------------- visuals --
  update(dt) {
    const root = this.char.root;
    // remote players are smoothed toward the latest network position
    if (!this.local && this.y2t !== undefined) this.y2 = (this.y2 || 0) + (this.y2t - (this.y2 || 0)) * Math.min(1, dt * 15);
    this.gy = this.game.side?.active ? (this.y2 || 0) : this.game.world.groundY(this.x, this.z);
    root.position.set(this.x, this.gy, this.z);
    root.rotation.y = this.face;
    const c = Math.cos(this.face), s = Math.sin(this.face);
    const vx = this.vx, vz = this.vz;
    // velocity in the character's frame (x = its left, z = its forward)
    const local = _loc.set(vx * c - vz * s, 0, vx * s + vz * c);
    this.anim.down += ((this.down ? 1 : this.pinnedBy ? 0.6 : 0) - this.anim.down) * Math.min(1, dt * 6);
    this.anim.update(dt, local, this.aiming || this.down);
    // the gun is held in BOTH hands: the animation decides where it is
    this.gun.position.copy(this.anim.gunPos);
    this.gun.quaternion.copy(this.anim.gunQuat).multiply(GUN_TURN);
    this.gun.visible = !this.dead;
    this.updateGunParts(dt);
    // the flamethrower: a looping roar while it pours, and a friend's flames drawn from his shot events
    if (this.flameVoice && (this.flameT -= dt) <= 0) { const v = this.flameVoice; this.flameVoice = null; try { v.g.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.05); v.src.stop(audio.ctx.currentTime + 0.3); } catch (e) { /* gone */ } }
    if (this.flameFx > 0) { this.flameFx -= dt; if (this.gunTip) { const m = this.gunTip.getWorldPosition(_mz); this.flameJet(m, Math.sin(this.face), Math.cos(this.face), dt, 1); } if (!this.local) this.flameSound(); }
    // a prototype's glow breathes (and flares on every shot)
    if (this.cur.glow && this.cur.mats) {
      const e = 0.22 + 0.12 * Math.sin(this.game.time * 3.1) + this.anim.recoil.x * 0.02;
      for (const m of this.cur.mats) if (m.emissive && !(m.userData.base.e && m.userData.base.e.getHex() !== 0)) m.emissiveIntensity = Math.max(0.1, e);
    }
    // a weapon light: it rides the muzzle, so the arms never shadow it
    const fx = Math.sin(this.face), fz = Math.cos(this.face);
    const tip = this.gunTip.getWorldPosition(_tip);
    this.light.position.set(tip.x + fx * 0.08, Math.max(1.0, tip.y), tip.z + fz * 0.08);
    this.light.target.position.set(this.x + fx * 9, 0, this.z + fz * 9);
    // indoors the walls are a couple of metres away: at the street's strength the beam whited the hospital out
    this.inK = (this.inK ?? 1) + ((indoors(this.x, this.z) ? 0.25 : 1) - (this.inK ?? 1)) * Math.min(1, dt * 3);
    this.light.intensity = this.dead ? 0 : (this.local ? 560 : 400) * this.inK * (this.flick ? 0.2 : 1);
    if (this.lantern) {
      const fl = this.game.fx.flash;
      if (fl.t < 0.06) { this.lantern.position.set(fl.x, fl.y, fl.z); this.lantern.intensity = 30 + 26 * (1 - fl.t / 0.06); }
      else { this.lantern.position.set(this.x, 2.2 + this.gy, this.z + (this.game.side?.active ? 1.2 : 0)); this.lantern.intensity = this.game.side?.active ? 14 : 30 * (0.55 + 0.45 * this.inK); }
    }
    if (this.game.side?.active) { this.game.side.aimVisuals(this); this.laser.material.opacity += (((this.aiming && !this.dead) ? 0.55 : 0) - this.laser.material.opacity) * Math.min(1, dt * 12); this.char.material.userData.uniforms.uFlash.value = Math.max(0, this.char.material.userData.uniforms.uFlash.value - dt * 10); return; }
    // laser
    const showLaser = this.aiming && !this.dead && this.reloadT <= 0;
    this.laser.material.opacity += ((showLaser ? 0.55 : 0) - this.laser.material.opacity) * Math.min(1, dt * 12);
    if (this.gunTip) {
      const p = _tip;
      const d = this.game.world.col.ray(p.x, p.z, fx, fz, 14).d;
      const pos = this.laser.geometry.attributes.position;
      pos.setXYZ(0, p.x, p.y, p.z);
      pos.setXYZ(1, p.x + fx * d, p.y, p.z + fz * d);
      pos.needsUpdate = true;
    }
    this.char.material.userData.uniforms.uFlash.value = Math.max(0, this.char.material.userData.uniforms.uFlash.value - dt * 10);
  }

  // the slide cycles, the magazine drops and is replaced
  updateGunParts(dt) {
    const an = this.anim;
    an.slide = Math.max(0, an.slide - dt * 0.35);
    let back = an.slide;
    if (an.slideLock && !(an.reload > 0)) back = Math.max(back, 0.026);
    const rackU = an.reload > 0 ? Math.min(1, an.reload) : 0;
    if (an.reload > 0 && rackU > 0.7 && rackU < 0.84) {
      const k = rackU < 0.8 ? sm01((rackU - 0.71) / 0.07) : 1 - sm01((rackU - 0.80) / 0.03);
      back = Math.max(back, 0.034 * k);
    }
    if (this.slideNode) this.slideNode.position.x = -back;
    // the magazine in the gun
    const u = rackU;
    let off = 0, shown = true;
    if (u > 0.10 && u < 0.20) off = -0.12 * sm01((u - 0.10) / 0.10);
    else if (u >= 0.20 && u < 0.50) shown = false;
    else if (u >= 0.50 && u < 0.58) off = -0.12 * (1 - sm01((u - 0.5) / 0.08));
    if (this.W.noDrop) { off = 0; shown = true; }
    if (this.magNode) { this.magNode.visible = shown; this.magNode.position.y = off; }
    // the spare in the support hand
    this.magProp.visible = !this.dead && u >= 0.2 && u < 0.5;
    if (this.magProp.visible) {
      this.magProp.position.copy(an.handL);
      this.magProp.quaternion.copy(an.gunQuat).multiply(GUN_TURN);
      this.magProp.translateY(-0.02);
    }
    // the old one, falling
    const f = this.magFall;
    if (f) {
      f.vy -= 9.8 * dt;
      f.m.position.x += f.vx * dt; f.m.position.z += f.vz * dt; f.m.position.y += f.vy * dt;
      f.m.rotation.x += f.sx * dt; f.m.rotation.z += f.sz * dt;
      const gy = this.game.world.groundY(f.m.position.x, f.m.position.z) + 0.02;
      if (f.m.position.y < gy) {
        f.m.position.y = gy;
        if (!f.hit) { f.hit = true; audio.play('mag_drop', { x: f.m.position.x, z: f.m.position.z, vol: 0.55 }); }
        f.vy = Math.abs(f.vy) * 0.25; f.vx *= 0.5; f.vz *= 0.5; f.sx *= 0.4; f.sz *= 0.4;
        if (f.vy < 0.4) f.vy = 0;
      }
      f.life -= dt;
      if (f.life < 0) { this.game.scene.remove(f.m); this.magFall = null; }
    }
  }

  reloadEvent(name) {
    const at = { x: this.x, z: this.z };
    const snd = this.W.snd || {};
    const say = (k, def, vol) => { const n = snd[k] === undefined ? def : snd[k]; if (n) audio.play(n, { ...at, vol }); };
    if (name === 'release') say('release', 'mag_release', 0.7);
    else if (name === 'magout') {
      say('magout', 'mag_out', 0.6);
      if (this.magNode && !this.W.noDrop) {
        if (this.magFall) this.game.scene.remove(this.magFall.m);
        const m = this.magNode.clone(true);
        const hp = this.anim.handL;
        m.position.set(hp.x, hp.y - 0.05, hp.z);
        m.quaternion.copy(this.anim.gunQuat).multiply(GUN_TURN);
        this.game.scene.add(m);
        const a = this.face + 1.2 + Math.random() * 0.5;
        this.magFall = { m, vx: Math.sin(a) * 0.5, vz: Math.cos(a) * 0.5, vy: -0.5, sx: 4 + Math.random() * 4, sz: 3 + Math.random() * 3, hit: false, life: 3.5 };
      }
    } else if (name === 'magin') say('magin', 'mag_in', 0.8);
    else if (name === 'rack') {
      say('rack', 'slide', 0.85);
      this.anim.slideLock = false;
      if (this.local) this.game.cam.kick(-this.aimx * 0.04, -this.aimz * 0.04);
    }
  }

  dispose() {
    const s = this.game.scene;
    if (this.magFall) s.remove(this.magFall.m);
    for (const k of Object.values(this.kit)) s.remove(k.gun, k.magProp);
    s.remove(this.char.root, this.light, this.light.target, this.laser);
    if (this.lantern) s.remove(this.lantern);
    this.light.dispose?.();
  }
}

// the top of a gun model at a point along it (where a sight can sit), in the gun's own frame
const _top = new Map();
function topAt(gun, x, id) {
  const key = id + ':' + x;
  if (_top.has(key)) return _top.get(key);
  let top = 0.05;
  const inv = new THREE.Matrix4().copy(gun.matrixWorld).invert(), m = new THREE.Matrix4(), v = new THREE.Vector3();
  gun.updateMatrixWorld(true);
  gun.traverse((o) => {
    if (!o.isMesh || o.parent?.name === 'gun_mag' || o.name === 'gun_mag') return;
    m.multiplyMatrices(inv, o.matrixWorld);
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      if (Math.abs(v.x - x) < 0.03 && Math.abs(v.z) < 0.02 && v.y > top) top = v.y;
    }
  });
  _top.set(key, top);
  return top;
}

// the Shrapnel round bursting: a little blast of fire and grit (no shake, no hitstop: it is every hit)
export function miniBlast(g, x, z, r) {
  const y = g.world.groundY(x, z) + 1.0;
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * 6.283, s = 2 + Math.random() * 4;
    g.fx.fire.emit({ x, y, z, vx: Math.cos(a) * s, vy: Math.random() * 3, vz: Math.sin(a) * s, life: 0.22 + Math.random() * 0.15, s0: 0.5, s1: 1.1 * r / 2, r: 1, g: 0.45 + Math.random() * 0.25, b: 0.12, a0: 0.9, a1: 0, drag: 4 });
  }
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * 6.283, s = 5 + Math.random() * 7;
    g.fx.sparkList.push({ x, y, z, vx: Math.cos(a) * s, vy: 1 + Math.random() * 3, vz: Math.sin(a) * s, t: 0, max: 0.2 + Math.random() * 0.2 });
  }
  g.fx.smoke.emit({ x, y, z, vx: 0, vy: 0.6, vz: 0, life: 1.0, s0: 0.5, s1: 1.8, r: 0.2, g: 0.18, b: 0.16, a0: 0.4, a1: 0, drag: 1 });
  audio.play('boom', { x, z, vol: 0.32, rate: 1.7, maxDist: 40 });
}
