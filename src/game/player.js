// A survivor: movement, the pistol, the flashlight. The LOCAL player is
// simulated on its own machine (instant response); everyone else is
// interpolated from the network.
import * as THREE from 'three';
import { makeCharacter } from './assets.js';
import { Rig, SurvivorAnim } from './rig.js';
import { audio, buzz } from './audio.js';
import { tex } from './assets.js';
import { Q } from './quality.js';

// Numbers from design/research.md (Nuclear Throne / Eiserloh / Housemarque).
export const PISTOL = {
  name: 'Service Pistol',
  dmg: 36,
  crit: 2.6,
  mag: 12,
  tapInterval: 0.2,      // up to 5 shots/s when you tap
  autoInterval: 0.29,    // the stick's deliberate cadence
  reload: 1.55,
  spreadBase: 1.2 * Math.PI / 180,
  spreadAdd: 1.2 * Math.PI / 180,
  spreadMax: 5 * Math.PI / 180,
  spreadRecover: 8 * Math.PI / 180,
  spreadMove: 1 * Math.PI / 180,
  range: 30,
  assistAcquire: 10 * Math.PI / 180,
  assistHold: 16 * Math.PI / 180,
  assistRange: 12,
  assistBend: 0.65,
  magnet: 0.4,
};

const GUN_TURN = new THREE.Quaternion();     // the gun's own frame already has x forward
const sm01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const _tip = new THREE.Vector3(), _loc = new THREE.Vector3(), _mz = new THREE.Vector3();
const SPEED = 3.6;        // a jog; zombies shamble at 0.6-1.0, lurchers burst to 3.1

export class Player {
  constructor(game, id, { name = 'Survivor', model = 'survivor_a', local = false, seat = 0 } = {}) {
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
    this.hp = 100;
    this.down = false;
    this.downT = 0;
    this.reviveT = 0;
    this.dead = false;
    this.ammo = PISTOL.mag;
    this.reloadT = 0;
    this.cool = 0;
    this.spread = PISTOL.spreadBase;
    this.aimHold = 0;
    this.assistTarget = null;
    this.stepDist = 0;
    this.buf = [];
    this.flags = 0;
    // the gun
    this.gun = game.pistolModel.clone();
    this.gun.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    game.scene.add(this.gun);
    this.gunTip = new THREE.Object3D();
    this.gunTip.position.set(0.145, 0.061, 0);
    this.gun.add(this.gunTip);
    this.slideNode = this.gun.getObjectByName('gun_slide');
    this.magNode = this.gun.getObjectByName('gun_mag');
    // a spare magazine: rides the support hand during a reload, and the old one falls
    this.magProp = new THREE.Group();
    if (this.magNode) {
      const m = this.magNode.clone(true);
      m.position.set(0.002, 0.027, 0);
      this.magProp.add(m);
    }
    this.magProp.visible = false;
    game.scene.add(this.magProp);
    this.magFall = null;
    this.anim.onEvent = (n) => this.reloadEvent(n);
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

  spawnAt(x, z) { this.x = x; this.z = z; this.place(); }

  place() {
    this.char.root.position.set(this.x, 0, this.z);
    this.char.root.rotation.y = this.face;
  }

  // --------------------------------------------------------- local sim --
  control(dt, inp, cam) {
    const g = this.game;
    if (this.dead) return;
    const sp = this.down ? 0.7 : SPEED;
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
      if (d < 0.55 && d > 1e-4) { res.x = zb.x + dx / d * 0.55; res.z = zb.z + dz / d * 0.55; }
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
    // ---- the pistol
    this.cool -= dt;
    this.spread = Math.max(PISTOL.spreadBase, this.spread - PISTOL.spreadRecover * dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      this.anim.reload = 1 - this.reloadT / PISTOL.reload;
      if (this.reloadT <= 0) { this.ammo = PISTOL.mag; this.reloadT = 0; this.anim.reload = 0; buzz([8]); g.hud.ammo(this); }
    }
    if (inp.reload && this.ammo < PISTOL.mag && this.reloadT <= 0) this.startReload();
    const wantFire = (inp.firing && this.aiming) || inp.tap || inp.mouseFiring;
    const interval = inp.tap || inp.mouseFiring ? PISTOL.tapInterval : PISTOL.autoInterval;
    if (wantFire && this.cool <= 0 && this.reloadT <= 0) {
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
        this.cool = interval;
      }
    }
    if (this.down) this.downT += dt;
  }

  startReload() {
    if (this.reloadT > 0) return;
    this.reloadT = PISTOL.reload;
    this.game.hud.reload(PISTOL.reload);
    this.game.netEvent({ k: 'reload', pid: this.id });
  }

  bestTarget(dx, dz, cone) {
    let best = null, bs = 1e9;
    for (const z of this.game.zombies.values()) {
      if (!z.alive) continue;
      const ex = z.x - this.x, ez = z.z - this.z, d = Math.hypot(ex, ez);
      if (d > PISTOL.assistRange || d < 0.1) continue;
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
    this.ammo--;
    // aim assist: acquire inside ±10°, keep inside ±16°, bend the shot 65%
    let t = this.assistTarget;
    if (t && (!t.alive || !this.inCone(t, dirx, dirz, PISTOL.assistHold))) t = null;
    if (!t) t = this.bestTarget(dirx, dirz, PISTOL.assistAcquire);
    this.assistTarget = t;
    let a = Math.atan2(dirz, dirx);
    if (t) {
      const ta = Math.atan2(t.z - this.z, t.x - this.x);
      let da = ta - a;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      a += da * PISTOL.assistBend;
    }
    const moving = Math.hypot(this.vx, this.vz) > 0.5 ? PISTOL.spreadMove : 0;
    a += (Math.random() * 2 - 1) * (this.spread + moving) * 0.5;
    this.spread = Math.min(PISTOL.spreadMax, this.spread + PISTOL.spreadAdd);
    const dx = Math.cos(a), dz = Math.sin(a);
    const mz = this.muzzle();
    // hitscan on the shot frame
    const wall = g.world.col.ray(mz.x, mz.z, dx, dz, PISTOL.range);
    let hit = null, hd = wall.d;
    for (const z of g.zombies.values()) {
      if (!z.alive) continue;
      const fx = z.x - mz.x, fz = z.z - mz.z;
      const along = fx * dx + fz * dz;
      if (along < 0 || along > hd) continue;
      const perp = Math.abs(fx * dz - fz * dx);
      const rad = 0.32 + (z === t ? PISTOL.magnet * 0.5 : 0);
      if (perp < rad) { hd = along - Math.sqrt(Math.max(0, rad * rad - perp * perp)) * 0.5; hit = z; }
    }
    const crit = !!hit && (Math.random() < 0.12 || (hit === t && Math.random() < 0.1));
    const hx = mz.x + dx * hd, hz = mz.z + dz * hd;
    // feel: kick, shake, flash, smoke, brass, sound, haptics
    g.cam.kick(-dx * 0.2, -dz * 0.2);
    g.cam.trauma(0.12);
    this.anim.fire(this.ammo === 0);
    g.fx.muzzle(mz.x, mz.y, mz.z, dx, dz);
    g.fx.tracer(mz.x + dx * 0.4, mz.y, mz.z + dz * 0.4, hx, hz);
    const sh = g.fx.shell(mz.x - dx * 0.12, mz.y + 0.05, mz.z - dz * 0.12, dx, dz);
    sh.cb = (s) => audio.play('shell', { x: s.x, z: s.z, vol: 0.25 });
    audio.play('pistol', { vol: 1, jitter: 0.035 });
    g.noise = { x: this.x, z: this.z, t: g.time };
    audio.duck(0.45, 150);
    buzz([12]);
    g.hud.ammo(this);
    if (hit) {
      g.fx.flesh(hx, 1.25, hz, dx, dz, 1, crit);
      audio.play('flesh', { x: hx, z: hz, vol: 0.7 });
      hit.hitFx(dx, dz, crit);
      buzz([6]);
      g.localHit(this, hit, PISTOL.dmg * (crit ? PISTOL.crit : 1), dx, dz, crit);
    } else if (wall.d < PISTOL.range) {
      g.fx.hard(hx, mz.y, hz, wall.nx, wall.nz, dx, dz);
      audio.play('hard', { x: hx, z: hz, vol: 0.5 });
    }
    g.netEvent({ k: 'shot', pid: this.id, x: +mz.x.toFixed(2), z: +mz.z.toFixed(2), y: +mz.y.toFixed(2), dx: +dx.toFixed(3), dz: +dz.toFixed(3), hx: +hx.toFixed(2), hz: +hz.toFixed(2), w: hit ? 0 : (wall.d < PISTOL.range ? 1 : 2), nx: +wall.nx.toFixed(2), nz: +wall.nz.toFixed(2) });
  }

  inCone(z, dx, dz, cone) {
    const ex = z.x - this.x, ez = z.z - this.z, d = Math.hypot(ex, ez);
    if (d > PISTOL.assistRange * 1.2) return false;
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
    audio.play('pistol', { x: e.x, z: e.z, vol: 0.9 });
    this.anim.fire();
    if (e.w === 1) { g.fx.hard(e.hx, e.y, e.hz, e.nx, e.nz, e.dx, e.dz); audio.play('hard', { x: e.hx, z: e.hz, vol: 0.4 }); }
  }

  hurt(dmg, fromX, fromZ) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.anim.hit();
    if (this.local) {
      const g = this.game;
      g.cam.trauma(0.4);
      const dx = this.x - fromX, dz = this.z - fromZ, l = Math.hypot(dx, dz) || 1;
      g.cam.kick(dx / l * 0.25, dz / l * 0.25);
      g.hud.damage(dmg, this.hp);
      audio.play('hurt', { vol: 0.9 });
      buzz([50]);
      // being bitten pushes you back a step
      const res = g.world.col.resolve(this.x + dx / l * 0.35, this.z + dz / l * 0.35, 0.33);
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
    this.down = false; this.dead = false; this.hp = 50; this.downT = 0; this.reviveT = 0;
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
    if (name === 'release') audio.play('mag_release', { ...at, vol: 0.7 });
    else if (name === 'magout') {
      audio.play('mag_out', { ...at, vol: 0.6 });
      if (this.magNode) {
        if (this.magFall) this.game.scene.remove(this.magFall.m);
        const m = this.magNode.clone(true);
        const hp = this.anim.handL;
        m.position.set(hp.x, hp.y - 0.05, hp.z);
        m.quaternion.copy(this.anim.gunQuat).multiply(GUN_TURN);
        this.game.scene.add(m);
        const a = this.face + 1.2 + Math.random() * 0.5;
        this.magFall = { m, vx: Math.sin(a) * 0.5, vz: Math.cos(a) * 0.5, vy: -0.5, sx: 4 + Math.random() * 4, sz: 3 + Math.random() * 3, hit: false, life: 3.5 };
      }
    } else if (name === 'magin') audio.play('mag_in', { ...at, vol: 0.8 });
    else if (name === 'rack') {
      audio.play('slide', { ...at, vol: 0.85 });
      this.anim.slideLock = false;
      if (this.local) this.game.cam.kick(-this.aimx * 0.04, -this.aimz * 0.04);
    }
  }

  dispose() {
    const s = this.game.scene;
    if (this.magFall) s.remove(this.magFall.m);
    s.remove(this.magProp);
    s.remove(this.char.root, this.gun, this.light, this.light.target, this.laser);
    if (this.lantern) s.remove(this.lantern);
    this.light.dispose?.();
  }
}
