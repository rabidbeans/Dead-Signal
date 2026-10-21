// The locked hard case (Sam, 2026-10-21: "hidden power weapons in levels, in locked cases with limited ammo"): one a
// level, a little off the way, a light strip glowing on it. Stand at it and the ring fills while you pry it open; then
// the lid swings up and the power weapon is in your hands (the crossbow, the flamethrower or the grenade launcher), a
// handful of shots that are gone when they run out. Opened once, by whoever gets there first.
// Every machine draws every case; the one who opens it sends a 'case' event.
import * as THREE from 'three';
import { audio, buzz } from './audio.js';
import { gear } from './gear.js';
import { ring, beam } from './objective.js';
import { WEAPONS } from './weapons.js';

const OPEN_T = 1.5, R = 1.5;

export class Cases {
  constructor(g, spots) {
    this.g = g;
    this.list = spots.map(([x, z, id], i) => {
      const root = new THREE.Group();
      const base = gear('case_base'), lid = gear('case_lid');
      lid.position.set(0, 0.2, -0.21);
      root.add(base, lid);
      root.scale.setScalar(1.3);
      root.position.set(x, g.world.groundY(x, z), z);
      root.rotation.y = (i * 2.1) % (Math.PI * 2);
      g.scene.add(root);
      const rg = ring(0x55c8ff, R * 1.5);
      rg.position.set(x, g.world.groundY(x, z) + 0.06, z);
      g.scene.add(rg);
      const bm = beam(0x55c8ff);
      bm.position.set(x, 0, z); bm.scale.set(0.6, 0.35, 0.6);
      g.scene.add(bm);
      return { i, x, z, id, root, lid, rg, bm, prog: 0, open: false, openT: 0 };
    });
  }

  // nearest closed case, for the HUD's screen-edge marker
  markers() {
    const out = [];
    for (const c of this.list) if (!c.open && Math.hypot(c.x - this.g.me.x, c.z - this.g.me.z) < 30) out.push({ x: c.x, z: c.z, c: '#55c8ff', label: WEAPONS[c.id].name.toUpperCase() });
    return out;
  }

  update(dt) {
    const g = this.g, me = g.me;
    for (const c of this.list) {
      const u = c.rg.material.uniforms;
      u.uTime.value = g.time;
      if (c.open) {
        c.openT += dt;
        const k = Math.min(1, c.openT / 0.5);
        c.lid.rotation.x = -1.9 * (1 - (1 - k) ** 3);
        c.rg.visible = false;
        c.bm.material.uniforms.uA.value = Math.max(0, 1 - c.openT);
        continue;
      }
      c.bm.material.uniforms.uA.value = 0.6 + 0.3 * Math.sin(g.time * 3);
      const near = me.alive && !me.pinnedBy && Math.hypot(me.x - c.x, me.z - c.z) < R;
      c.prog = near ? c.prog + dt : Math.max(0, c.prog - dt * 2);
      u.uProg.value = Math.min(1, c.prog / OPEN_T);
      u.uA.value = near ? 1 : 0.55;
      if (near && Math.random() < dt * 8) audio.play('click', { x: c.x, z: c.z, vol: 0.25, rate: 0.6 + c.prog * 0.4 });
      if (c.prog >= OPEN_T) {
        const e = { k: 'case', i: c.i, pid: me.id };
        this.open(e);
        g.netEvent(e);
      }
      if (near !== c.near) { c.near = near; g.hud.hint(near ? `Prying open the case… ${WEAPONS[c.id].name}` : ''); }
    }
  }

  // every machine: a case was opened (the opener gets what is inside)
  open(e) {
    const g = this.g, c = this.list[e.i];
    if (!c || c.open) return;
    c.open = true; c.openT = 0;
    audio.play('crate', { x: c.x, z: c.z, vol: 0.9, jitter: 0 });
    for (let i = 0; i < 16; i++) g.fx.glow.emit({ x: c.x + (Math.random() - 0.5) * 0.8, y: 0.4, z: c.z + (Math.random() - 0.5) * 0.4, vx: 0, vy: 1 + Math.random(), vz: 0, life: 0.8, s0: 0.25, s1: 0.05, r: 0.4, g: 0.85, b: 1, a0: 0.9, a1: 0 });
    if (c.near) { c.near = false; g.hud.hint(''); }
    const p = g.players.get(e.pid);
    if (p?.local) {
      p.pickPower(c.id);
      g.hud.banner(WEAPONS[c.id].name.toUpperCase(), `${WEAPONS[c.id].mag} shots. Make them count.`, 2.6);
      audio.play('sting', { vol: 0.6, jitter: 0 });
      buzz([30, 30, 60]);
    } else if (p) g.hud.toast(`${p.name || 'A teammate'} found the ${WEAPONS[c.id].name}`);
  }

  dispose() { for (const c of this.list) this.g.scene.remove(c.root, c.rg, c.bm); }
}
