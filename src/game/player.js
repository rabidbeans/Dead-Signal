// A survivor: movement, the pistol, the flashlight. The LOCAL player is
// simulated on its own machine (instant response); everyone else is
// interpolated from the network.
import * as THREE from 'three';
import { makeCharacter } from './assets.js';
import { Rig, SurvivorAnim } from './rig.js';
import { audio, buzz } from './audio.js';
import { tex } from './assets.js';
import { Q } from './quality.js';

import { WEAPONS, WEAPON_IDS, weaponStats, ARMOR_ABSORB, BASE_HP, BASE_SPEED } from './weapons.js';

// what a survivor with nothing bought has (also what a friend's machine assumes about a remote player)
export const defaultLoadout = () => ({
  weapons: { pistol: weaponStats('pistol') }, equipped: 'pistol', maxHp: BASE_HP, maxArmor: 0, speed: BASE_SPEED, cashMul: 1,
});

const GUN_TURN = new THREE.Quaternion();     // the gun's own frame already has x forward
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
    const ids = local ? WEAPON_IDS.filter((w) => lo.weapons[w]) : WEAPON_IDS;
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
    this.lantern = local ? new THREE.PointLight(0xa9bddb, 16, 9, 1.3) : null;
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
    return { id, W: stats, gun, tip, slide, mag, magProp: prop, ammo: stats.mag };
  }

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
    if (this.dead) return;
    const sp = this.down ? 0.7 : this.speed * (this.reloadT > 0 ? 0.92 : 1) * (this.W.moveK || 1);
    // screen -> world: right is +x, down the screen is +z
    let mx = inp.move.x, mz = inp.move.y;
    const ax = mx * sp, az = mz * sp;
    // accelerate quickly, stop quickly (weighty but responsive)
    const k = Math.min(1, dt * 14);
    this.vx += (ax - this.vx) * k;
    this.vz += (az - this.vz) * k;
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
    const interval = inp.tap || inp.mouseFiring ? W.tapInterval : W.autoInterval;
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
        else { audio.play('dryfire', { x: this.x, z: this.z }); buzz([4]); this.startReload(); }
        // carry the remainder so a fast gun keeps its true rate whatever the frame time
        this.cool = interval + Math.max(this.cool, -dt);
      }
    }
    if (this.down) this.downT += dt;
  }

  startReload() {
    if (this.reloadT > 0) return;
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
    this.ammo--;
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
      for (const z of g.zombies.values()) {
        if (!z.alive) continue;
        const fx = z.x - mz.x, fz = z.z - mz.z;
        const along = fx * dx + fz * dz;
        if (along < 0 || along > hd) continue;
        const perp = Math.abs(fx * dz - fz * dx);
        const rad = (z.def.rad || 0.32) + (z === t ? W.magnet * 0.5 : 0);
        if (perp < rad) { hd = along - Math.sqrt(Math.max(0, rad * rad - perp * perp)) * 0.5; hit = z; }
      }
      const hx = mz.x + dx * hd, hz = mz.z + dz * hd;
      g.fx.tracer(mz.x + dx * 0.4, mz.y, mz.z + dz * 0.4, hx, hz);
      if (hit) {
        const fall = W.falloff ? 1 - W.falloff * Math.min(1, hd / W.range) : 1;
        const h = hits.get(hit) || { dmg: 0, dx, dz, hx, hz };
        h.dmg += W.dmg * fall; hits.set(hit, h);
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
    if (!W.pump) {
      const sh = g.fx.shell(mz.x - dx * 0.12, mz.y + 0.05, mz.z - dz * 0.12, dx, dz);
      sh.cb = (s) => audio.play('shell', { x: s.x, z: s.z, vol: W.shellVol });
    }
    audio.play(W.shot, { vol: 1, jitter: 0.035 });
    g.noise = { x: this.x, z: this.z, t: g.time };
    audio.duck(W.duck, 150);
    buzz([pellets > 1 ? 30 : 12]);
    g.hud.ammo(this);
    for (const [hit, h] of hits) {
      const crit = Math.random() < (pellets > 1 ? 0.06 : 0.12) || (hit === t && Math.random() < 0.1);
      g.fx.flesh(h.hx, 1.25, h.hz, h.dx, h.dz, pellets > 1 ? 1.5 : 1, crit);
      audio.play('flesh', { x: h.hx, z: h.hz, vol: 0.7 });
      hit.hitFx(h.dx, h.dz, crit);
      buzz([6]);
      g.localHit(this, hit, h.dmg * (crit ? W.crit : 1), h.dx, h.dz, crit);
    }
    g.netEvent({ k: 'shot', pid: this.id, wp: WEAPON_IDS.indexOf(W.id), x: +mz.x.toFixed(2), z: +mz.z.toFixed(2), y: +mz.y.toFixed(2), dx: +dx.toFixed(3), dz: +dz.toFixed(3), hx: +first.hx.toFixed(2), hz: +first.hz.toFixed(2), w: first.w, nx: +first.nx.toFixed(2), nz: +first.nz.toFixed(2) });
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
    g.fx.muzzle(e.x, e.y, e.z, e.dx, e.dz);
    g.fx.tracer(e.x + e.dx * 0.4, e.y, e.z + e.dz * 0.4, e.hx, e.hz);
    g.fx.shell(e.x, e.y + 0.05, e.z, e.dx, e.dz);
    const id = WEAPON_IDS[e.wp] || 'pistol';
    if (this.cur.id !== id) this.setWeapon(id, true);
    audio.play(WEAPONS[id].shot, { x: e.x, z: e.z, vol: 0.9 });
    this.anim.fire(false, WEAPONS[id].recoil);
    const P = WEAPONS[id].pellets || 1;
    for (let i = 1; i < P; i++) {
      const a = Math.atan2(e.dz, e.dx) + ((i + Math.random()) / P - 0.5) * WEAPONS[id].spreadBase, d = 4 + Math.random() * 8;
      g.fx.tracer(e.x + e.dx * 0.4, e.y, e.z + e.dz * 0.4, e.x + Math.cos(a) * d, e.z + Math.sin(a) * d);
    }
    if (WEAPONS[id].pump) setTimeout(() => { audio.play('pump', { x: this.x, z: this.z, vol: 0.6 }); this.anim.slide = 0.085; }, WEAPONS[id].pump * 1000);
    if (e.w === 1) { g.fx.hard(e.hx, e.y, e.hz, e.nx, e.nz, e.dx, e.dz); audio.play('hard', { x: e.hx, z: e.hz, vol: 0.4 }); }
  }

  hurt(dmg, fromX, fromZ, kb = 0.35) {
    if (!this.alive) return;
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
    this.gy = this.game.world.groundY(this.x, this.z);
    root.position.set(this.x, this.gy, this.z);
    root.rotation.y = this.face;
    const c = Math.cos(this.face), s = Math.sin(this.face);
    const vx = this.vx, vz = this.vz;
    // velocity in the character's frame (x = its left, z = its forward)
    const local = _loc.set(vx * c - vz * s, 0, vx * s + vz * c);
    this.anim.down += ((this.down ? 1 : 0) - this.anim.down) * Math.min(1, dt * 6);
    this.anim.update(dt, local, this.aiming || this.down);
    // the gun is held in BOTH hands: the animation decides where it is
    this.gun.position.copy(this.anim.gunPos);
    this.gun.quaternion.copy(this.anim.gunQuat).multiply(GUN_TURN);
    this.gun.visible = !this.dead;
    this.updateGunParts(dt);
    // a weapon light: it rides the muzzle, so the arms never shadow it
    const fx = Math.sin(this.face), fz = Math.cos(this.face);
    const tip = this.gunTip.getWorldPosition(_tip);
    this.light.position.set(tip.x + fx * 0.08, Math.max(1.0, tip.y), tip.z + fz * 0.08);
    this.light.target.position.set(this.x + fx * 9, 0, this.z + fz * 9);
    this.light.intensity = this.dead ? 0 : (this.local ? 560 : 400) * (this.flick ? 0.2 : 1);
    if (this.lantern) {
      const fl = this.game.fx.flash;
      if (fl.t < 0.06) { this.lantern.position.set(fl.x, fl.y, fl.z); this.lantern.intensity = 16 + 26 * (1 - fl.t / 0.06); }
      else { this.lantern.position.set(this.x, 2.2 + this.gy, this.z); this.lantern.intensity = 16; }
    }
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
