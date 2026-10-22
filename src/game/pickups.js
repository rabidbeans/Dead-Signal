// Loot on the street (Sam, 2026-10-22: "twists"): the dead sometimes drop something.
//
//   cash      a bundle of bills (a mutant always drops a fat one; one of the ordinary dead now and then a thin one)
//   frag / molotov / pipe   a throwable
//
// The host decides what drops (`roll`, on a kill) and sends a `drop` event; every machine lays the same pickup. Whoever
// walks over it takes it (cash goes into their own wallet, a throwable into their own pouch) and says so, like a medkit.
// A pickup lies there for 35 s, blinking in its last five.
import * as THREE from 'three';
import { audio, buzz } from './audio.js';
import { gear } from './gear.js';
import { NADES } from './throwables.js';
import { tex } from './assets.js';

const LIFE = 35, R = 1.05;
let _bills = null;

// a bundle of greenbacks with a paper band: one canvas texture shared by every bundle
function billsMat() {
  if (_bills) return _bills;
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#6f8f5a'; x.fillRect(0, 0, 128, 64);
  x.strokeStyle = '#3d5532'; x.lineWidth = 3; x.strokeRect(6, 6, 116, 52);
  x.fillStyle = '#4a6a3e'; x.beginPath(); x.arc(64, 32, 15, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#d8d0b0'; x.fillRect(54, 0, 20, 64);
  x.fillStyle = '#2e4426'; x.font = 'bold 18px sans-serif'; x.fillText('100', 12, 26); x.fillText('100', 88, 52);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  _bills = [new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0xc8c2a4, roughness: 0.9 })];
  return _bills;
}

function cashModel(big) {
  const g = new THREE.Group();
  const [face, edge] = billsMat();
  const n = big ? 3 : 1;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.16), [edge, edge, face, edge, edge, edge]);
    m.position.set((i - (n - 1) / 2) * 0.05, 0.035 + i * 0.07, (i % 2) * 0.03);
    m.rotation.y = (i - 1) * 0.35;
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

export class Pickups {
  constructor(g) {
    this.g = g;
    this.list = [];
    this.n = 0;
    this.glowMat = new THREE.MeshBasicMaterial({ map: tex('tex/soft.webp'), color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glowGeo = new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2);
  }

  // host: something died; maybe it drops something
  roll(z) {
    if (z.boss || !this.g.isHost) return;
    let kind = null, amt = 0;
    const r = Math.random();
    if (z.elite) {
      if (r < 0.6) { kind = 'cash'; amt = 80 + ((Math.random() * 7) | 0) * 10; } else kind = Math.random() < 0.5 ? 'frag' : 'molotov';
    } else if (r < 0.022) { kind = 'cash'; amt = 15 + ((Math.random() * 4) | 0) * 5; } else if (r < 0.03) kind = Math.random() < 0.65 ? 'frag' : 'molotov';
    if (!kind) return;
    const e = { k: 'drop', id: 'p' + (++this.n), x: +z.x.toFixed(2), z: +z.z.toFixed(2), kind, amt };
    this.add(e);
    this.g.netEvent(e);
  }

  // every machine: lay it
  add(e) {
    const g = this.g;
    const root = new THREE.Group();
    const m = e.kind === 'cash' ? cashModel(e.amt >= 60) : gear(e.kind === 'pipe' ? 'pipebomb' : e.kind);
    if (e.kind !== 'cash') m.scale.setScalar(2.2);
    root.add(m);
    const glow = new THREE.Mesh(this.glowGeo, this.glowMat.clone());
    glow.material.color.set(e.kind === 'cash' ? 0x7aff6a : NADES[e.kind]?.color || '#ffffff');
    glow.position.y = 0.03;
    root.add(glow);
    root.position.set(e.x, g.world.groundY(e.x, e.z), e.z);
    g.scene.add(root);
    this.list.push({ ...e, root, m, glow, t: 0, hop: 0 });
    audio.play('click', { x: e.x, z: e.z, vol: 0.4, rate: 1.6 });
  }

  take(id) {
    const i = this.list.findIndex((p) => p.id === id);
    if (i < 0) return null;
    const p = this.list[i];
    this.g.scene.remove(p.root);
    p.glow.material.dispose();
    this.list.splice(i, 1);
    return p;
  }

  update(dt) {
    const g = this.g, me = g.me;
    for (const p of [...this.list]) {
      p.t += dt;
      // pops out of the body, bobs and turns; blinks when it is about to go
      p.hop = Math.min(1, p.hop + dt * 2.5);
      const u = p.hop;
      p.m.position.y = 0.25 + Math.sin(p.t * 2.6) * 0.06 + Math.sin(u * Math.PI) * 0.6;
      p.m.rotation.y += dt * 1.6;
      p.glow.material.opacity = 0.28 + 0.14 * Math.sin(p.t * 5);
      p.root.visible = p.t < LIFE - 5 || Math.sin(p.t * 18) > 0;
      if (p.t > LIFE) { this.take(p.id); continue; }
      if (!me.alive || p.hop < 0.6 || Math.hypot(me.x - p.x, me.z - p.z) > R) continue;
      if (p.kind !== 'cash') {
        const have = g.nades?.have;
        if (!have || have[p.kind] >= NADES[p.kind].max) continue;
        have[p.kind]++;
        g.nades.sel = p.kind;
        g.hud.toast(`+1 ${NADES[p.kind].name}`);
        audio.play('mag_in', { vol: 0.8 });
      } else {
        g.earn(p.amt, 'LOOT');
        audio.play('coins', { vol: 0.75, jitter: 0.05 });
      }
      buzz([12]);
      for (let i = 0; i < 10; i++) g.fx.glow.emit({ x: p.x, y: 0.4, z: p.z, vx: (Math.random() - 0.5) * 2, vy: 1.5 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 2, life: 0.5, s0: 0.2, s1: 0.04, r: 0.6, g: 1, b: 0.5, a0: 0.9, a1: 0, grav: 4 });
      this.take(p.id);
      if (g.role === 'host') g.net.broadcast({ t: 'drop_take', id: p.id });
      else if (g.role === 'client') g.net.toHost({ t: 'drop_take', id: p.id });
    }
  }

  markers() { return []; }

  dispose() { for (const p of this.list) this.g.scene.remove(p.root); this.list.length = 0; }
}
