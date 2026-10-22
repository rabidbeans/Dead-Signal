// The supply drop (Sam, 2026-10-22: "twists"): once a level, somewhere along the first stretch, a red flare goes up on
// the road ahead, a helicopter you never see thunders over, and a hard case comes down under a striped parachute. It
// holds a power weapon (cases.js pries it open like the hidden one). The noise of it brings the dead running.
//
// The host picks the moment and the spot and sends `sdrop`; every machine plays the same fall. When it lands the case
// is added to Cases (index = its place in the list, the same everywhere since events arrive in order).
import * as THREE from 'three';
import { audio, buzz } from './audio.js';
import { gear } from './gear.js';
import { L } from './level.js';
import { POWER_IDS } from './weapons.js';

const FALL = 9;            // seconds from the flare to touchdown
const H0 = 38;             // height it falls from

function canopy() {
  // a dome of eight gores, red and white, and the shroud lines down to the case
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(2.2, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const col = [], pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    const red = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) % 2 === 0;
    col.push(...(red ? [0.75, 0.14, 0.1] : [0.86, 0.84, 0.78]));
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const dome = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
  dome.position.y = 3.1;
  dome.scale.y = 0.7;
  dome.castShadow = true;
  g.add(dome);
  const pts = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    pts.push(0, 0.55, 0, Math.cos(a) * 2.0, 3.6, Math.sin(a) * 2.0);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x2a2620 })));
  g.userData.dome = dome;
  return g;
}

export class SupplyDrop {
  constructor(g) {
    this.g = g;
    this.done = false;        // host: dropped already this run
    this.cur = null;
  }

  // host: when the lead is well into the first stretch, call it in on the road ahead
  director(lead) {
    const g = this.g;
    if (this.done || g.phase !== 'run' || g.opened > 0) return;
    if (lead.z > L.start.z - 42) return;
    this.done = true;
    const nav = g.world.nav;
    let spot = null;
    for (let i = 0; i < 80 && !spot; i++) {
      const x = (Math.random() - 0.5) * 8, z = lead.z - 16 - Math.random() * 8;
      const k = nav.idx(x, z);
      if (k < 0 || nav.block[k] || nav.dist[k] > 1e8) continue;
      const o = g.world.col.resolve(x, z, 1.1);
      if (Math.hypot(o.x - x, o.z - z) < 0.01) spot = { x, z };
    }
    if (!spot) return;
    const not = g.cases?.list[0]?.id;
    const ids = POWER_IDS.filter((id) => id !== not);
    const e = { k: 'sdrop', x: +spot.x.toFixed(2), z: +spot.z.toFixed(2), gun: ids[(Math.random() * ids.length) | 0] };
    this.start(e);
    g.netEvent(e);
  }

  // every machine
  start(e) {
    const g = this.g;
    this.done = true;
    const root = new THREE.Group();
    const box = new THREE.Group();
    box.add(gear('case_base'), (() => { const l = gear('case_lid'); l.position.set(0, 0.2, -0.21); return l; })());
    box.scale.setScalar(1.3);
    root.add(box);
    const ch = canopy();
    root.add(ch);
    root.position.set(e.x, H0, e.z);
    g.scene.add(root);
    this.cur = { ...e, root, box, ch, t: 0, landed: false, gy: g.world.groundY(e.x, e.z), sway: Math.random() * 6 };
    g.hud.banner('SUPPLY DROP', 'Inbound on the road ahead', 2.4);
    audio.play('flare', { x: e.x, z: e.z, vol: 0.9, jitter: 0 });
    this.rotor = audio.play('rotor', { vol: 0, loop: true, jitter: 0 });
  }

  markers() {
    const c = this.cur;
    if (!c || c.landed) return [];
    return [{ x: c.x, z: c.z, c: '#ff4a3a', label: 'SUPPLY DROP' }];
  }

  update(dt) {
    const c = this.cur, g = this.g;
    if (!c) return;
    c.t += dt;
    // the flare: red light and a column of red smoke from the spot, for as long as the drop takes and a while after
    if (c.t < FALL + 8) {
      if (Math.random() < dt * 30) g.fx.glow.emit({ x: c.x + 0.6, y: c.gy + 0.15, z: c.z + 0.4, vx: (Math.random() - 0.5) * 0.6, vy: 0.6, vz: (Math.random() - 0.5) * 0.6, life: 0.3, s0: 0.5, s1: 0.2, r: 1, g: 0.15, b: 0.08, a0: 1, a1: 0 });
      if (Math.random() < dt * 9) g.fx.smoke.emit({ x: c.x + 0.6, y: c.gy + 0.3, z: c.z + 0.4, vx: g.wind.x * 0.6, vy: 1.6 + Math.random(), vz: g.wind.z * 0.6, life: 3.2, s0: 0.4, s1: 2.6, r: 0.75, g: 0.12, b: 0.1, a0: 0.5, a1: 0, drag: 0.4 });
    }
    // the helicopter overhead: loud, then gone
    if (this.rotor) {
      const k = Math.max(0, Math.min(1, c.t / 2.5)) * Math.max(0, 1 - Math.max(0, c.t - 6) / 4);
      this.rotor.g.gain.value = 0.7 * k;
      if (c.t > 2 && c.t < 6) g.cam.tr = Math.max(g.cam.tr, 0.08);
      if (c.t > 10) { try { this.rotor.src.stop(); } catch (er) { /* gone */ } this.rotor = null; }
    }
    if (!c.landed) {
      const u = Math.min(1, Math.max(0, (c.t - 1.5) / (FALL - 1.5)));
      // fast at first, then the canopy bites and it drifts down, swaying
      const y = c.t < 1.5 ? H0 + 6 : c.gy + (H0 - c.gy) * (1 - u) * (1 - u * 0.25) / 1;
      c.root.position.y = Math.max(c.gy, y);
      c.root.rotation.z = Math.sin(c.t * 1.3 + c.sway) * 0.12 * (1 - u);
      c.root.rotation.x = Math.cos(c.t * 1.1 + c.sway) * 0.1 * (1 - u);
      c.root.rotation.y += dt * 0.2;
      c.ch.userData.dome.scale.x = c.ch.userData.dome.scale.z = Math.min(1, c.t / 1.8);
      if (u >= 1) this.land();
    } else {
      // the canopy slumps over and settles beside the case, then fades
      const k = Math.min(1, (c.t - c.landT) / 1.4);
      c.ch.position.set(1.4 * k, -0.2 * k, 0.6 * k);
      c.ch.rotation.z = -1.35 * k;
      c.ch.scale.y = 1 - 0.75 * k;
      if (c.t - c.landT > 25) { g.scene.remove(c.root); this.cur = null; }
    }
  }

  land() {
    const c = this.cur, g = this.g;
    c.landed = true; c.landT = c.t;
    c.root.rotation.set(0, c.root.rotation.y, 0);
    c.root.position.y = c.gy;
    c.box.visible = false;
    g.cases?.addDrop(c.x, c.z, c.gun, c.root.rotation.y);
    audio.play('chute', { x: c.x, z: c.z, vol: 1, jitter: 0 });
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4;
      g.fx.smoke.emit({ x: c.x, y: c.gy + 0.2, z: c.z, vx: Math.cos(a) * s, vy: 0.3 + Math.random() * 0.5, vz: Math.sin(a) * s, life: 1.6, s0: 0.5, s1: 2.0, r: 0.5, g: 0.48, b: 0.44, a0: 0.4, a1: 0, drag: 1.6 });
    }
    const d = Math.hypot(g.me.x - c.x, g.me.z - c.z);
    g.cam.trauma(Math.max(0, 0.45 - d / 40));
    if (d < 20) buzz([30]);
    // the racket brings them: a pack of the dead out of the dark around it (host)
    if (g.isHost) {
      for (let i = 0; i < 6 + 2 * g.players.size; i++) g.after(0.3 + i * 0.35, () => { if (!g.over) g.spawnZombie(g.mix(i % 3 === 0 ? 'runner' : 'shambler', 0.1)); });
      for (const z of g.zombies.values()) if (z.idle && (z.x - c.x) ** 2 + (z.z - c.z) ** 2 < 28 * 28) z.wake();
    }
  }

  dispose() {
    if (this.cur) this.g.scene.remove(this.cur.root);
    if (this.rotor) { try { this.rotor.src.stop(); } catch (e) { /* gone */ } }
  }
}
