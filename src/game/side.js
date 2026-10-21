// Level 5's last fight is a SIDE-SCROLLER (Sam, 2026-10-17: "suddenly in level five, the game switches into a 2d side
// scroller for the boss battle. And it has a cool animation showing it switch and like warp into the 2d").
//
// When Subject Omega's hold starts, every machine plays THE WARP: the picture glitches, the whole street is squashed flat
// toward the evac pad like a sheet of paper while the camera swings down from overhead to the side, a white flash, and
// the fight continues on a side-on stage built at the pad: a long slab of concrete, crates and containers to jump onto,
// the fort and the burning city behind. From then on:
//   - you run left and right, JUMP (left stick up, W, Space, ↑) onto the platforms, drop through them (stick down, S)
//   - you aim anywhere in the plane (right stick, or the mouse) and bullets fly in the plane
//   - the dead walk the floor and cannot climb; Omega cannot reach you up high, so it SPITS acid at you there, and on
//     the floor it SLAMS the ground: a shockwave runs out both ways along the floor - jump it
// The sim stays the same (x, z): in 2D everyone's z is pinned to the stage plane, and heights live in `y2`.
import * as THREE from 'three';
import { L, LV } from './level.js';
import { audio, buzz } from './audio.js';
import { surface, tex, prop } from './assets.js';
import { container } from './kit.js';
import { signTexture } from './world.js';
import { mulberry } from './rng.js';
import { GUN_IDS } from './weapons.js';

const G = 27, JUMP_V = 10.4;
const HALF = 23;                  // the stage runs X0 ± HALF
const WARP = 2.7;                 // seconds of transition
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class SideStage {
  constructor(game) {
    this.g = game;
    this.X0 = L.lz.x;
    this.Z0 = L.lz.z;
    this.active = false;          // the fight is 2D
    this.warping = false;         // the transition is playing
    this.t = 0;
    // one-way platforms: [x0, x1, top] relative to X0 (a crate step, a container, a scaffold, ...)
    this.plats = [[-20.5, -17.5, 1.3], [-17, -11, 2.6], [-9.5, -5.5, 3.9], [-3, 3, 2.6], [5.5, 9.5, 3.9], [11, 17, 2.6], [17.5, 20.5, 1.3]].map(([a, b, y]) => ({ x0: this.X0 + a, x1: this.X0 + b, y }));
    this.waves = [];              // Omega's ground shockwaves
    this.spits = [];              // acid in flight
    this.build();
  }

  // ------------------------------------------------------------ the stage --
  build() {
    const g = this.g, X0 = this.X0, Z0 = this.Z0;
    const root = this.group = new THREE.Group();
    root.visible = false;
    g.scene.add(root);
    const add = (o) => { root.add(o); return o; };
    const rng = mulberry(77);
    // the floor: a long slab with a hazard-striped lip
    const conc = surface('concrete', 1, 0x8a8a80);
    // (deep toward the camera too, so the bottom of the picture is floor and not the void)
    const slab = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 40, 1.2, 22), conc);
    slab.position.set(X0, -0.6, Z0 + 6);
    slab.receiveShadow = true;
    add(slab);
    const lip = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 12, 0.35), new THREE.MeshStandardMaterial({ map: hazard(), roughness: 0.6 }));
    lip.material.map.repeat.set(20, 1);
    lip.position.set(X0, 0.01, Z0 + 2.2);
    lip.rotation.x = -Math.PI / 2;
    add(lip);
    // the evac pad painted on the floor (seen at a slant)
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: signTexture('H  ·  EVAC  ·  H', '#ffd23a', '#1a1a1a', 1024, 160), transparent: true, opacity: 0.85 }));
    pad.position.set(X0, 0.01, Z0 - 0.5);
    add(pad);
    // platforms: crates, containers, a scaffold - all just BEHIND the line everybody walks on (front faces at Z0 - 0.8),
    // so nobody is ever hidden inside one, and somebody standing on top stands at its front edge
    const PZ = Z0 - 0.8;
    for (const p of this.plats) {
      const w = p.x1 - p.x0, cx = (p.x0 + p.x1) / 2;
      if (p.y < 2) {
        for (let k = 0; k < Math.round(w / 1.0); k++) for (let lv = 0; lv < 2; lv++) {
          const c = prop('crate_wood');
          c.position.set(p.x0 + 0.5 + k * 1.0, lv * 0.65, PZ - 0.55);
          c.scale.set(1.05, 0.76, 1.05);
          c.rotation.y = (rng() - 0.5) * 0.15;
          add(c);
        }
      } else if (p.y < 3) {
        const m = container(Math.floor(rng() * 6));
        m.position.set(cx, 0, PZ - 1.25);
        m.scale.set(w / 6.06, 1, 1);
        add(m);
      } else {
        // a scaffold: poles, a deck of planks, braces
        const pole = new THREE.MeshStandardMaterial({ color: 0x8a8d90, metalness: 0.8, roughness: 0.4 });
        for (const x of [p.x0 + 0.2, p.x1 - 0.2]) for (const z of [PZ - 2.0, PZ - 0.1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, p.y, 8), pole); c.position.set(x, p.y / 2, z); add(c); }
        const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 2.2), surface('wood', 1, 0xc0a080));
        deck.position.set(cx, p.y - 0.06, PZ - 1.05);
        deck.castShadow = true;
        add(deck);
        for (const z of [PZ - 2.0, PZ - 0.1]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, Math.hypot(w, p.y) * 0.95, 6), pole); b.position.set(cx, p.y / 2, z); b.rotation.z = Math.atan2(w, p.y) * (z > PZ - 1 ? 1 : -1); add(b); }
        const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.06), pole); rail.position.set(cx, p.y + 0.9, PZ - 2.0); add(rail);
      }
    }
    // behind: the fort's wall, floodlit, with two watchtowers
    const wall = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 30, 7, 1.5), surface('concrete', 1, 0x6e705f));
    wall.position.set(X0, 3.5, Z0 - 7);
    wall.receiveShadow = true;
    add(wall);
    for (let x = -HALF - 14; x < HALF + 14; x += 2.2) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.5), wall.material); m.position.set(X0 + x, 7.45, Z0 - 7); add(m); }
    for (const sx of [-1, 1]) {
      const tw = new THREE.Mesh(new THREE.BoxGeometry(3.4, 13, 3.4), wall.material);
      tw.position.set(X0 + sx * 17, 6.5, Z0 - 8.5);
      add(tw);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff2d0, toneMapped: false }));
      lamp.position.set(X0 + sx * 17, 12.4, Z0 - 6.7);
      add(lamp);
    }
    // sandbags and burning barrels along the foot of the wall
    for (let x = -HALF; x < HALF; x += 7 + rng() * 4) {
      const s = prop('sandbags'); s.position.set(X0 + x, 0, Z0 - 4.5); s.scale.setScalar(0.8); add(s);
      if (rng() < 0.5) { const b = prop('barrel'); b.position.set(X0 + x + 2.5, 0, Z0 - 4.2); add(b); g.world.fires.push({ x: X0 + x + 2.5, y: 0.95, z: Z0 - 4.2, phase: rng() * 9, size: 1, stage: true }); }
    }
    // the city burning behind the fort: three layers of skyline, further and further into the fog
    const winTex = windowsTexture();
    for (const [dz, hmin, hmax, tint] of [[-24, 8, 20, 0x2a2838], [-46, 14, 34, 0x221f30], [-80, 20, 48, 0x1b1828]]) {
      let x = -70;
      while (x < 70) {
        const w = 6 + rng() * 9, h = hmin + rng() * (hmax - hmin);
        const m = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.9, emissive: 0xffc070, emissiveMap: winTex, emissiveIntensity: 0.6 + rng() * 0.5 });
        m.emissiveMap = winTex.clone(); m.emissiveMap.needsUpdate = true; m.emissiveMap.repeat.set(w / 8, h / 8); m.emissiveMap.wrapS = m.emissiveMap.wrapT = THREE.RepeatWrapping;
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 6), m);
        b.position.set(X0 + x + w / 2, h / 2 - 1, Z0 + dz - rng() * 6);
        add(b);
        if (rng() < 0.25) g.world.fires.push({ x: X0 + x + w / 2, y: h - 0.5, z: Z0 + dz + 3, phase: rng() * 9, size: 2.2, stage: true });
        x += w + 0.5 + rng() * 3;
      }
    }
    // the moon, low over the city; searchlights sweeping the clouds
    const moon = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0xe8ffd0, fog: false, toneMapped: false }));
    moon.position.set(X0 + 30, 34, Z0 - 140);
    add(moon);
    this.beams = [];
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(3.5, 60, 20, 1, true).translate(0, -30, 0), new THREE.MeshBasicMaterial({ map: tex('tex/cone.webp'), color: 0xdfeaff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      c.position.set(X0 + sx * 17, 12.4, Z0 - 6.7);
      add(c);
      this.beams.push({ c, ph: sx * 1.7 });
    }
    // Omega's shockwaves and acid (drawn from pools)
    const waveMat = new THREE.MeshBasicMaterial({ map: tex('tex/soft.webp'), color: 0x9aff3a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.waveMeshes = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), waveMat.clone()); m.visible = false; g.scene.add(m); return m; });
    const accMat = new THREE.MeshStandardMaterial({ color: 0x8aff3a, emissive: 0x4aff1a, emissiveIntensity: 1.4, roughness: 0.3, toneMapped: false });
    this.spitMeshes = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), accMat); m.visible = false; g.scene.add(m); return m; });
    // the glitch overlay
    const ov = this.overlay = document.createElement('div');
    ov.className = 'warp';
    document.body.appendChild(ov);
  }

  // ------------------------------------------------------------ the warp --
  start(instant = false) {
    if (this.warping || this.active) return;
    const g = this.g;
    this.warping = true;
    this.t = instant ? WARP : 0;
    this.camFrom = { p: g.camera.position.clone(), q: g.camera.quaternion.clone(), fov: g.camera.fov };
    this.zFrom = new Map();
    this.swapped = false;
    if (!instant) {
      this.overlay.classList.add('on');
      audio.play('zap', { vol: 0.9, jitter: 0 });
      audio.play('sting', { vol: 0.8, jitter: 0, rate: 0.7 });
      this.g.after(1.3, () => audio.play('boom1', { vol: 0.6, rate: 1.6 }));
      buzz([30, 40, 60]);
    }
    for (const p of g.players.values()) { p.y2 = 0; p.vy2 = 0; p.grounded = true; }
  }

  // every frame (both sides)
  update(dt) {
    const g = this.g;
    if (this.warping) this.warpTick(dt);
    if (!this.active && !this.warping) return;
    const t = g.time;
    for (const b of this.beams) b.c.rotation.z = Math.sin(t * 0.35 + b.ph) * 0.6;
    // pin everybody to the stage plane
    if (this.active) {
      for (const z of g.zombies.values()) if (z.alive) z.z = Math.max(this.Z0 - 0.7, Math.min(this.Z0 + 0.7, z.z));
      this.wavesTick(dt);
      this.spitTick(dt);
    }
  }

  warpTick(dt) {
    const g = this.g, Z0 = this.Z0;
    this.t += dt;
    const u = this.t / WARP;
    // the street squashes flat toward the pad: a page being pressed into the plane
    const sq = sm((this.t - 0.35) / 1.15);
    const s = 1 - 0.97 * sq;
    g.world.group.scale.z = s;
    g.world.group.position.z = Z0 * (1 - s);
    // the people slide into the plane with it
    for (const p of g.players.values()) {
      if (!this.zFrom.has(p)) this.zFrom.set(p, p.z);
      const z0 = this.zFrom.get(p);
      p.z = z0 + (this.planeZ(p) - z0) * sq;
    }
    if (g.isHost) for (const z of g.zombies.values()) {
      if (!z.alive) continue;
      if (!this.zFrom.has(z)) this.zFrom.set(z, z.z);
      const z0 = this.zFrom.get(z);
      z.z = z0 + (Z0 + (z0 > Z0 ? 0.5 : -0.5) * Math.min(1, Math.abs(z0 - Z0) / 6) - z0) * sq;
      z.px = z.x; z.pz = z.z;
    }
    // the camera swings down from overhead to the side
    const k = sm((this.t - 0.25) / 2.2);
    const fx = this.focusX();
    const side = this.sideCam(fx);
    _v.copy(this.camFrom.p).lerp(side.p, k);
    // arc over the top rather than through the floor
    _v.y += Math.sin(k * Math.PI) * 3;
    g.camera.position.copy(_v);
    g.camera.fov = this.camFrom.fov + (side.fov - this.camFrom.fov) * k;
    g.camera.updateProjectionMatrix();
    _w.set(fx, 0, Z0).lerp(side.look, k);
    g.camera.up.set(0, 1, 0);
    g.camera.lookAt(_w);
    g.camera.rotateZ(Math.sin(u * Math.PI) * 0.25 * (1 - k));     // a dutch roll through the middle of the swing
    // the swap, under a white flash
    if (!this.swapped && this.t > 1.5) {
      this.swapped = true;
      g.world.group.visible = false;
      this.group.visible = true;
      for (const c of g.corpses || []) c.char.root.visible = false;
      for (const m of g.medkits || []) if (m.g) m.g.visible = false;
      if (g.groundFog) g.groundFog.pts.visible = false;
      g.fx.stage2d = true;
      flash();
      // the horde of the 3D street does not make it through the fold: Omega is alone on the stage when the light clears
      if (g.isHost) for (const [id, z] of [...g.zombies]) {
        if (z.boss) continue;
        z.dispose(); g.zombies.delete(id);
        g.netEvent({ k: 'zgone', id });
      }
    }
    if (this.t >= WARP) {
      this.warping = false;
      this.active = true;
      this.overlay.classList.remove('on');
      g.world.group.scale.z = 1; g.world.group.position.z = 0;
      g.world.group.visible = false;
      this.group.visible = true;
      for (const p of g.players.values()) p.z = this.planeZ(p);
      if (!g.over) {
        g.hud.banner('SIDE-SCROLL', 'Stick up / W / Space to JUMP · stick down to drop', 3.2);
        g.after(3.8, () => g.hud?.toast('Omega cannot reach you up high, but it spits acid. Jump its shockwaves!'));
      }
    }
  }

  // each survivor has his own depth on the stage, so two of them are never one shape
  planeZ(p) { return this.Z0 + [0, 0.45, -0.45, 0.9][(p.seat || 0) % 4]; }

  focusX() {
    const g = this.g;
    const me = g.me;
    return Math.max(this.X0 - HALF + 9, Math.min(this.X0 + HALF - 9, me.x));
  }
  sideCam(fx, y = 0) {
    return { p: new THREE.Vector3(fx, 3.7 + y * 0.45, this.Z0 + 12.5), look: new THREE.Vector3(fx, 2.3 + y * 0.45, this.Z0), fov: 44 };
  }

  // the side-on camera (replaces the overhead rig while the fight is 2D)
  camera(dt) {
    const g = this.g, c = g.camera;
    const me = g.me;
    this.fx = this.fx ?? me.x;
    this.fy = this.fy ?? 0;
    this.fx += (this.focusX() + (me.aiming ? (me.aim2x || 0) * 2 : 0) - this.fx) * Math.min(1, dt * 4);
    this.fy += ((me.y2 || 0) - this.fy) * Math.min(1, dt * 3);
    const s = this.sideCam(this.fx, this.fy);
    const tr = g.cam.tr, sh = tr * tr;
    g.cam.tr = Math.max(0, tr - dt * 1.8);
    const n = (o) => Math.sin(g.time * 37 + o) * 0.5 + Math.sin(g.time * 23 + o * 2) * 0.5;
    c.position.set(s.p.x + n(1) * sh * 0.35, s.p.y + n(2) * sh * 0.25, s.p.z);
    c.fov = s.fov; c.updateProjectionMatrix();
    c.up.set(0, 1, 0);
    c.lookAt(s.look.x + n(3) * sh * 0.2, s.look.y, s.look.z);
  }

  // ------------------------------------------------------------ movement --
  // the local survivor in 2D: run, jump, fall, land on platforms; aim in the plane; shoot
  control(p, inp, dt) {
    const g = this.g;
    if (this.warping) { p.vx = 0; p.vz = 0; return; }
    if (p.dead) return;
    const sp = p.down ? 0.7 : p.speed * (p.reloadT > 0 ? 0.92 : 1) * (p.W.moveK || 1);
    const k = Math.min(1, dt * 14);
    p.vx += (inp.move.x * sp - p.vx) * k;
    p.vz = 0;
    // jump, and drop through a platform
    const up = !p.down && (inp.move.y < -0.55 || inp.jump);
    if (up && !p.jumpLatch && p.grounded) { p.vy2 = JUMP_V; p.grounded = false; audio.play('step', { x: p.x, z: p.z, vol: 0.6, rate: 0.8 }); buzz([8]); }
    p.jumpLatch = up;
    if (inp.move.y > 0.6 && p.grounded && p.y2 > 0.1) { p.dropT = 0.3; p.grounded = false; }
    p.dropT = Math.max(0, (p.dropT || 0) - dt);
    this.fall(p, dt);
    let nx = p.x + p.vx * dt;
    nx = Math.max(this.X0 - HALF + 0.5, Math.min(this.X0 + HALF - 0.5, nx));
    // the dead are solid on the floor
    if (p.y2 < 1.0) for (const zb of g.zombies.values()) {
      if (!zb.alive) continue;
      const dx = nx - zb.x, rr = 0.5 + ((zb.def.rad || 0.32) - 0.32) * 0.9;
      if (Math.abs(dx) < rr && Math.abs(zb.z - p.z) < 1.2) nx = zb.x + Math.sign(dx || 1) * rr;
    }
    nx = Math.max(this.X0 - HALF + 0.5, Math.min(this.X0 + HALF - 0.5, nx));
    const moved = Math.abs(nx - p.x);
    p.x = nx; p.z = this.planeZ(p);
    if (p.grounded) { p.stepDist += moved; if (p.stepDist > 0.95) { p.stepDist = 0; audio.play('step', { x: p.x, z: p.z, vol: 0.35 }); } }
    // aim: the right stick (up is up), else the mouse on the stage plane, else the way you face
    let ax = null, ay = 0;
    if (inp.aim) { ax = inp.aim.x; ay = -inp.aim.y; }
    else if (inp.mouse && !g.touch) {
      const q = this.screenToPlane(inp.mouse.x, inp.mouse.y);
      if (q) { ax = q.x - p.x; ay = q.y - (p.y2 + 1.35); }
    }
    if (ax !== null) {
      const l = Math.hypot(ax, ay) || 1;
      p.aim2x = ax / l; p.aim2y = ay / l;
      p.aimHold = 0.3;
    } else p.aimHold -= dt;
    p.aiming = p.aimHold > 0 || inp.mouseFiring;
    const faceX = p.aiming ? p.aim2x : Math.abs(p.vx) > 0.4 ? p.vx : Math.sin(p.face);
    const ta = faceX >= 0 ? Math.PI / 2 : -Math.PI / 2;
    let da = ta - p.face; da = Math.atan2(Math.sin(da), Math.cos(da));
    p.face += Math.max(-24 * dt, Math.min(24 * dt, da));
    p.aimx = Math.sign(Math.sin(p.face)) || 1; p.aimz = 0;
    // ---- the gun (the same cadence as on foot)
    const W = p.W;
    if (inp.slot !== null && inp.slot !== undefined) p.selectSlot(inp.slot);
    if (inp.swap) p.cycleWeapon();
    p.cool -= dt;
    if (p.pumpT > 0 && (p.pumpT -= dt) <= 0) { audio.play('pump', { x: p.x, z: p.z, vol: 0.8 }); p.anim.slide = 0.085; }
    p.drawT = Math.max(0, p.drawT - dt);
    p.spread = Math.max(W.spreadBase, p.spread - W.spreadRecover * dt);
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      p.anim.reload = 1 - p.reloadT / W.reload;
      if (p.reloadT <= 0) { p.ammo = W.mag; p.reloadT = 0; p.anim.reload = 0; buzz([8]); g.hud.ammo(p); }
    }
    if (inp.reload && p.ammo < W.mag && p.reloadT <= 0 && p.drawT <= 0) p.startReload();
    const wantFire = (inp.firing && p.aiming) || inp.tap || inp.mouseFiring;
    const interval = inp.tap || inp.mouseFiring ? W.tapInterval : W.autoInterval;
    if (wantFire && p.cool <= 0 && p.reloadT <= 0 && p.drawT <= 0) {
      if (inp.tap && !inp.aim) { const t = this.bestTarget(p); if (t) { const dx = t.x - p.x, dy = 1.0 - (p.y2 + 1.35), l = Math.hypot(dx, dy); p.aim2x = dx / l; p.aim2y = dy / l; p.aimHold = 0.4; } }
      if (p.ammo > 0) this.fire(p, p.aim2x ?? Math.sin(p.face), p.aim2y || 0);
      else { audio.play('dryfire', { x: p.x, z: p.z }); buzz([4]); p.startReload(); }
      p.cool = interval + Math.max(p.cool, -dt);
    }
    if (p.down) p.downT += dt;
  }

  // gravity and the platforms (one-way: you land on them from above, jump up through them)
  fall(p, dt) {
    const y0 = p.y2 || 0;
    p.vy2 = (p.vy2 || 0) - G * dt;
    let y = y0 + p.vy2 * dt;
    let land = null;
    if (p.vy2 <= 0) {
      if (y <= 0) land = 0;
      else if (!p.dropT) for (const pl of this.plats) if (p.x > pl.x0 - 0.3 && p.x < pl.x1 + 0.3 && y0 >= pl.y - 0.05 && y <= pl.y) land = Math.max(land ?? -1, pl.y);
    }
    if (land !== null) {
      if (!p.grounded && p.vy2 < -6) { audio.play('step', { x: p.x, z: p.z, vol: 0.55, rate: 0.7 }); this.g.fx.smoke.emit({ x: p.x, y: land + 0.1, z: p.z, vx: 0, vy: 0.3, vz: 0, life: 0.6, s0: 0.3, s1: 0.9, r: 0.5, g: 0.48, b: 0.45, a0: 0.25, a1: 0, drag: 2 }); }
      y = land; p.vy2 = 0; p.grounded = true;
    } else {
      // walked off the edge of a platform
      if (p.grounded && y0 > 0 && !this.plats.some((pl) => p.x > pl.x0 - 0.3 && p.x < pl.x1 + 0.3 && Math.abs(pl.y - y0) < 0.05)) p.grounded = false;
      if (!p.grounded) { /* in the air */ } else { y = y0; p.vy2 = 0; }
    }
    p.y2 = y;
  }

  screenToPlane(sx, sy) {
    const c = this.g.camera;
    _v.set(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1, 0.5).unproject(c).sub(c.position).normalize();
    const t = (this.Z0 - c.position.z) / _v.z;
    if (!(t > 0)) return null;
    return { x: c.position.x + _v.x * t, y: c.position.y + _v.y * t };
  }

  bestTarget(p) {
    let best = null, bd = 1e9;
    for (const z of this.g.zombies.values()) {
      if (!z.alive) continue;
      const d = Math.abs(z.x - p.x) + Math.abs(p.y2) * 0.5;
      if (d < bd && d < 16) { bd = d; best = z; }
    }
    return best;
  }

  // ------------------------------------------------------------ shooting --
  // bullets fly in the plane: every body is a box from the floor to the top of its head
  fire(p, ax, ay) {
    const g = this.g, W = p.W;
    p.ammo--;
    const mz = p.muzzle();
    const ox = mz.x, oy = mz.y;
    let a0 = Math.atan2(ay, ax);
    // a little help: bend toward a body near the line
    let t = null, tb = 0.2;
    for (const z of g.zombies.values()) {
      if (!z.alive) continue;
      const h = 1.8 * z.char.root.scale.x;
      const da = Math.atan2(h * 0.55 - oy, z.x - ox) - a0;
      const d = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
      if (d < tb && Math.abs(z.x - ox) < W.range) { tb = d; t = z; }
    }
    if (t) { const ta = Math.atan2(1.8 * t.char.root.scale.x * 0.55 - oy, t.x - ox); let da = ta - a0; da = Math.atan2(Math.sin(da), Math.cos(da)); a0 += da * W.assistBend; }
    const moving = Math.abs(p.vx) > 0.5 ? W.spreadMove : 0;
    const pellets = W.pellets || 1;
    const hits = new Map();
    let first = null;
    for (let i = 0; i < pellets; i++) {
      let a = a0;
      if (pellets > 1) a += ((i + Math.random()) / pellets - 0.5) * (W.spreadBase + moving);
      else a += (Math.random() * 2 - 1) * (p.spread + moving) * 0.5;
      const dx = Math.cos(a), dy = Math.sin(a);
      // the floor and the ends of the stage
      let wd = W.range;
      if (dy < -1e-4) wd = Math.min(wd, -oy / dy);
      if (dx > 1e-4) wd = Math.min(wd, (this.X0 + HALF + 2 - ox) / dx);
      if (dx < -1e-4) wd = Math.min(wd, (this.X0 - HALF - 2 - ox) / dx);
      const line = [];
      for (const z of g.zombies.values()) {
        if (!z.alive) continue;
        const r = (z.def.rad || 0.32) * 1.35, h = 1.85 * z.char.root.scale.x;
        // ray vs the box [x-r, x+r] x [0, h]
        let t0 = 0, t1 = wd;
        for (const [o, d, lo, hi] of [[ox, dx, z.x - r, z.x + r], [oy, dy, 0, h]]) {
          if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { t0 = 1; t1 = 0; } continue; }
          let ta = (lo - o) / d, tb2 = (hi - o) / d;
          if (ta > tb2) { const q = ta; ta = tb2; tb2 = q; }
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb2);
        }
        if (t0 <= t1) line.push({ z, d: t0 });
      }
      line.sort((q, r) => q.d - r.d);
      const hit = line[0]?.z || null;
      const hd = hit ? line[0].d : wd;
      const hx = ox + dx * hd, hy = oy + dy * hd;
      g.fx.tracer(ox + dx * 0.4, oy + dy * 0.4, mz.z, hx, mz.z, hy);
      if (hit) {
        const fall = W.falloff ? 1 - W.falloff * Math.min(1, hd / W.range) : 1;
        const h = hits.get(hit) || { dmg: 0, dx, dy, hx, hy };
        h.dmg += W.dmg * fall; hits.set(hit, h);
        for (let k = 1; k <= (W.pierce || 0) && k < line.length; k++) {
          const b = line[k], h2 = hits.get(b.z) || { dmg: 0, dx, dy, hx: ox + dx * b.d, hy: oy + dy * b.d };
          h2.dmg += W.dmg * 0.6 * (W.falloff ? 1 - W.falloff * Math.min(1, b.d / W.range) : 1); hits.set(b.z, h2);
        }
      } else if (hd < W.range - 0.1 && (pellets === 1 || i % 2 === 0)) {
        g.fx.hard(hx, Math.max(0.05, hy), mz.z, dy < -0.3 ? 0 : -Math.sign(dx), 0, dx, 0);
      }
      if (i === 0) first = { dx, dy, hx, hy, w: hit ? 0 : 1 };
    }
    p.spread = Math.min(W.spreadMax, p.spread + W.spreadAdd);
    g.cam.trauma(W.trauma);
    p.anim.fire(p.ammo === 0 && !W.pump, W.recoil);
    if (W.pump) { p.pumpT = W.pump; p.anim.slide = 0; }
    g.fx.muzzle(mz.x, mz.y, mz.z, first.dx, 0);
    if (!W.pump) { const sh = g.fx.shell(mz.x - first.dx * 0.12, mz.y + 0.05, mz.z, first.dx, 0); sh.cb = (s) => audio.play('shell', { x: s.x, z: s.z, vol: W.shellVol }); }
    audio.play(W.shot, { vol: 1, jitter: 0.035 });
    g.noise = { x: p.x, z: p.z, t: g.time };
    audio.duck(W.duck, 150);
    buzz([pellets > 1 ? 30 : 12]);
    g.hud.ammo(p);
    for (const [hit, h] of hits) {
      const crit = Math.random() < (pellets > 1 ? 0.06 : 0.12);
      const dxn = Math.sign(h.dx) || 1;
      g.fx.flesh(h.hx, Math.max(0.6, h.hy), hit.z, dxn, 0, pellets > 1 ? 1.5 : 1, crit);
      audio.play('flesh', { x: h.hx, z: hit.z, vol: 0.7 });
      hit.hitFx(dxn, 0, crit);
      buzz([6]);
      g.localHit(p, hit, h.dmg * (crit ? W.crit : 1), dxn, 0, crit, W.knock || 1);
    }
    g.netEvent({ k: 'shot', pid: p.id, wp: GUN_IDS.indexOf(W.id), x: +mz.x.toFixed(2), z: +mz.z.toFixed(2), y: +mz.y.toFixed(2), dx: +first.dx.toFixed(3), dz: 0, hx: +first.hx.toFixed(2), hz: +mz.z.toFixed(2), hy: +first.hy.toFixed(2), w: first.w, nx: 0, nz: 0 });
  }

  // a remote survivor's laser and light follow his 2D aim
  aimVisuals(p) {
    const tip = p.gunTip?.getWorldPosition(_v);
    if (!tip) return;
    const ax = p.aim2x ?? Math.sin(p.face), ay = p.aim2y || 0;
    const pos = p.laser.geometry.attributes.position;
    pos.setXYZ(0, tip.x, tip.y, tip.z);
    pos.setXYZ(1, tip.x + ax * 12, tip.y + ay * 12, tip.z);
    pos.needsUpdate = true;
    p.light.target.position.set(tip.x + ax * 9, tip.y + ay * 9, tip.z);
  }

  // where the dead come from in 2D: either end of the stage
  spawnPoint() {
    const s = Math.random() < 0.5 ? -1 : 1;
    return { x: this.X0 + s * (HALF - 1 - Math.random() * 2), z: this.Z0 + (Math.random() - 0.5) * 1.2 };
  }

  // the floor height things stand on
  resolve(x, z) { return { x: Math.max(this.X0 - HALF + 0.4, Math.min(this.X0 + HALF - 0.4, x)), z: Math.max(this.Z0 - 0.8, Math.min(this.Z0 + 0.8, z)) }; }

  // ---------------------------------------------------- Omega in 2D (moves) --
  // SLAM: a shockwave runs along the floor both ways. Anyone on the floor when it passes is thrown; jump it.
  quake(x) {
    const g = this.g;
    for (const dir of [-1, 1]) {
      const m = this.waveMeshes.find((q) => !q.visible) || this.waveMeshes[0];
      m.visible = true;
      this.waves.push({ m, x, dir, t: 0, hit: new Set() });
    }
    g.cam.trauma(0.6);
    audio.play('boom0', { x, z: this.Z0, vol: 1, rate: 0.7 });
    buzz([80]);
    for (let i = 0; i < 30; i++) g.fx.smoke.emit({ x: x + (Math.random() - 0.5) * 2, y: 0.2, z: this.Z0 + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 9, vy: 0.5 + Math.random() * 2, vz: 0, life: 1.2, s0: 0.5, s1: 2.2, r: 0.5, g: 0.55, b: 0.4, a0: 0.4, a1: 0, drag: 1.5 });
  }
  wavesTick(dt) {
    const g = this.g;
    for (const w of this.waves) {
      w.t += dt;
      w.x += w.dir * 10 * dt;
      const fade = Math.min(1, w.t / 0.15) * Math.max(0, 1 - w.t / 2.4);
      w.m.position.set(w.x, 1.0, this.Z0 + 0.1);
      w.m.scale.set(1 + w.t * 0.4, 1.1 - w.t * 0.25, 1);
      w.m.material.opacity = 0.9 * fade;
      if (Math.random() < 0.6) g.fx.glow.emit({ x: w.x, y: 0.2, z: this.Z0 + (Math.random() - 0.5) * 0.6, vx: w.dir * 2, vy: 1 + Math.random() * 2, vz: 0, life: 0.5, s0: 0.25, s1: 0.06, r: 0.5, g: 1, b: 0.2, a0: 0.8, a1: 0, grav: 5 });
      if (g.isHost) for (const p of g.players.values()) {
        if (!p.alive || w.hit.has(p.id) || (p.y2 || 0) > 0.7) continue;
        if (Math.abs(p.x - w.x) < 0.8) { w.hit.add(p.id); g.hurtPlayer(p, 22, { x: w.x - w.dir, z: p.z }, 1.4); }
      }
      if (w.t > 2.4 || Math.abs(w.x - this.X0) > HALF + 2) { w.m.visible = false; w.done = true; }
    }
    this.waves = this.waves.filter((w) => !w.done);
  }
  // SPIT: acid lobbed at somebody up on a platform
  spit(x0, y0, tx, ty) {
    const m = this.spitMeshes.find((q) => !q.visible) || this.spitMeshes[0];
    m.visible = true;
    const dur = 0.9 + Math.abs(tx - x0) * 0.03;
    this.spits.push({ m, x0, y0, tx, ty, t: 0, dur });
    audio.play('squelch0', { x: x0, z: this.Z0, vol: 0.8 });
  }
  spitTick(dt) {
    const g = this.g;
    for (const s of this.spits) {
      s.t += dt;
      const u = Math.min(1, s.t / s.dur);
      s.m.position.set(s.x0 + (s.tx - s.x0) * u, s.y0 + (s.ty - s.y0) * u + Math.sin(u * Math.PI) * 3, this.Z0 + 0.2);
      if (u >= 1) {
        s.m.visible = false; s.done = true;
        for (let i = 0; i < 16; i++) g.fx.glow.emit({ x: s.tx, y: s.ty + 0.2, z: this.Z0, vx: (Math.random() - 0.5) * 5, vy: 1 + Math.random() * 3, vz: (Math.random() - 0.5) * 2, life: 0.7, s0: 0.25, s1: 0.08, r: 0.4, g: 1, b: 0.2, a0: 0.9, a1: 0, grav: 7 });
        audio.play('squelch1', { x: s.tx, z: this.Z0, vol: 0.8 });
        if (g.isHost) for (const p of g.players.values()) if (p.alive && Math.abs(p.x - s.tx) < 1.5 && Math.abs((p.y2 || 0) - s.ty) < 1.4) g.hurtPlayer(p, 16, { x: s.x0, z: p.z }, 0.6);
      }
    }
    this.spits = this.spits.filter((s) => !s.done);
  }

  dispose() { this.overlay.remove(); }
}

function flash() {
  const f = document.createElement('div');
  f.className = 'warp-flash';
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 900);
}

function hazard() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#d0a018'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#16140f';
  for (let i = -2; i < 10; i++) { g.beginPath(); g.moveTo(i * 16, 32); g.lineTo(i * 16 + 8, 32); g.lineTo(i * 16 + 40, 0); g.lineTo(i * 16 + 32, 0); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowsTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  const rng = mulberry(3);
  for (let y = 6; y < 128; y += 16) for (let x = 6; x < 128; x += 16) {
    const r = rng();
    if (r < 0.28) { g.fillStyle = r < 0.08 ? '#ff7a2a' : '#ffd890'; g.fillRect(x, y, 8, 9); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
