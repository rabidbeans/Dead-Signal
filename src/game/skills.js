// SPECIALTIES (Sam, 2026-10-21): pick one before a level; each has a passive and an ACTIVE SKILL on its own button with
// a cooldown. Skill points (earned by killing the dead and getting out) level the skill up in the safehouse.
//
//   MEDIC     Field Dressing   a healing circle on the ground for everyone inside it    passive: revives twice as fast,
//                                                                                        medkits heal half again
//   GUNNER    Overdrive        no reloads and a faster trigger for a few seconds         passive: +8% gun damage
//   SCOUT     Dash             a burst a few metres ahead that shoves the dead aside     passive: +8% move speed
//   ENGINEER  Sentry           an auto-turret that guns down what comes near             passive: +1 frag every level
//
// Co-op: the skill is used on its own machine and sent as an event. Each machine heals its OWN survivor in a medic's
// circle; the host shoves the dead out of a scout's path and runs the sentry (its target is broadcast, every machine
// draws it firing).
import * as THREE from 'three';
import { audio, buzz } from './audio.js';
import { gear } from './gear.js';
import { ring } from './objective.js';

export const XP_PER_POINT = 60;
export const nodeCost = (lv) => lv + 1;            // 1, 2, 3 points for the levels of a node

const NODES = (power, size, cd) => [
  { key: 'power', name: power[0], desc: power[1], max: 3 },
  { key: 'size', name: size[0], desc: size[1], max: 3 },
  { key: 'cd', name: 'Quick recovery', desc: cd, max: 3 },
];
export const SPECS = {
  medic: {
    id: 'medic', name: 'MEDIC', skill: 'FIELD DRESSING', color: '#49e07a',
    blurb: 'Drop a healing circle: everyone standing in it is patched up.',
    passive: 'Revives teammates twice as fast. Medkits heal half again as much.',
    nodes: NODES(['Strong dressing', '+35% healing a level'], ['Wide dressing', '+20% radius and +1.5 s a level'], '-15% cooldown a level'),
  },
  gunner: {
    id: 'gunner', name: 'GUNNER', skill: 'OVERDRIVE', color: '#ff9a2a',
    blurb: 'For a few seconds: no reloads, and the trigger runs hot.',
    passive: '+8% damage with every gun.',
    nodes: NODES(['Hot barrel', '+15% fire rate and +10% damage in overdrive, a level'], ['Long burn', '+1.5 s of overdrive a level'], '-15% cooldown a level'),
  },
  scout: {
    id: 'scout', name: 'SCOUT', skill: 'DASH', color: '#55c8ff',
    blurb: 'Burst a few metres forward, untouchable, shoving the dead out of the way.',
    passive: '+8% movement speed.',
    nodes: NODES(['Shoulder charge', 'the dash hits what it crosses for 45 a level, and knocks it flat'], ['Second wind', '+1 dash charge a level'], '-15% recharge a level'),
  },
  engineer: {
    id: 'engineer', name: 'ENGINEER', skill: 'SENTRY', color: '#ffd23a',
    blurb: 'Deploy an auto-turret that guns down whatever comes near.',
    passive: 'One extra frag grenade every level.',
    nodes: NODES(['Hot loads', '+30% sentry damage a level'], ['Big battery', '+6 s of sentry a level'], '-15% cooldown a level'),
  },
};
export const SPEC_IDS = Object.keys(SPECS);

// the numbers of a specialty at its node levels
export function specStats(spec, lv = {}) {
  const l = (k) => lv[k] || 0, cdK = 1 - 0.15 * l('cd');
  if (spec === 'medic') return { cd: 38 * cdK, heal: 12 * (1 + 0.35 * l('power')), r: 3.2 * (1 + 0.2 * l('size')), life: 6 + 1.5 * l('size') };
  if (spec === 'gunner') return { cd: 45 * cdK, rateK: 1.35 + 0.15 * l('power'), dmgK: 1 + 0.1 * l('power'), t: 7 + 1.5 * l('size') };
  if (spec === 'scout') return { cd: 7 * cdK, charges: 1 + l('size'), dist: 5.5, dmg: 45 * l('power') };
  if (spec === 'engineer') return { cd: 50 * cdK, dmg: 14 * (1 + 0.3 * l('power')), life: 18 + 6 * l('size'), rate: 7, range: 13 };
  return null;
}

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const TAU = Math.PI * 2;

export class Skills {
  constructor(g) {
    this.g = g;
    this.zones = [];               // medic circles
    this.turrets = new Map();      // sentries, by id
    this.n = 0;
    const me = g.me;
    this.spec = me.loadout.spec || null;
    this.st = this.spec ? specStats(this.spec, me.loadout.skills) : null;
    this.cd = 0;                   // seconds until the next use (the scout: until the next charge)
    this.charges = this.st?.charges || 1;
  }

  // the HUD's view of it
  view() {
    if (!this.st) return null;
    const max = this.st.charges || 1;
    return { spec: this.spec, frac: this.charges >= max ? 1 : 1 - this.cd / this.st.cd, ready: this.charges > 0, charges: max > 1 ? this.charges : null, secs: Math.ceil(this.cd) };
  }

  // ---- the local survivor pressed the button
  use() {
    const g = this.g, me = g.me;
    if (!this.st || this.charges <= 0 || !me.alive || g.over || g.side?.active || g.side?.warping) { if (this.st && this.charges <= 0) audio.play('deny', { vol: 0.4, jitter: 0 }); return false; }
    const S = this.st;
    let e = null;
    if (this.spec === 'medic') {
      e = { k: 'skill', s: 'medic', pid: me.id, x: +me.x.toFixed(2), z: +me.z.toFixed(2), r: +S.r.toFixed(2), life: S.life, heal: +S.heal.toFixed(1) };
    } else if (this.spec === 'gunner') {
      e = { k: 'skill', s: 'gunner', pid: me.id, t: S.t };
      me.over = { t: S.t, rateK: S.rateK, dmgK: S.dmgK };
      me.ammo = me.W.mag; me.reloadT = 0; me.anim.reload = 0; g.hud.ammo(me);
    } else if (this.spec === 'scout') {
      // along the stick, else the way you face
      let dx = g.input.move?.x || 0, dz = g.input.move?.y || 0;
      if (Math.hypot(dx, dz) < 0.2) { dx = Math.sin(me.face); dz = Math.cos(me.face); }
      const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      // as far as the way is clear
      const d = Math.max(0.5, Math.min(S.dist, g.world.col.ray(me.x, me.z, dx, dz, S.dist + 0.4).d - 0.4));
      me.dash = { t: 0.2, T: 0.2, vx: dx * d / 0.2, vz: dz * d / 0.2 };
      me.invT = 0.38;
      e = { k: 'skill', s: 'scout', pid: me.id, x0: +me.x.toFixed(2), z0: +me.z.toFixed(2), x1: +(me.x + dx * d).toFixed(2), z1: +(me.z + dz * d).toFixed(2), dmg: S.dmg };
    } else if (this.spec === 'engineer') {
      const fx = Math.sin(me.face), fz = Math.cos(me.face);
      const d = Math.min(1.4, g.world.col.ray(me.x, me.z, fx, fz, 2).d - 0.5);
      e = { k: 'skill', s: 'engineer', pid: me.id, id: me.id + ':' + (this.n++), x: +(me.x + fx * d).toFixed(2), z: +(me.z + fz * d).toFixed(2), f: +me.face.toFixed(2), life: S.life, dmg: +S.dmg.toFixed(1), rate: S.rate, range: S.range };
    }
    this.charges--;
    if (this.cd <= 0) this.cd = S.cd;
    buzz([20, 30, 20]);
    this.apply(e);
    g.netEvent(e);
    return true;
  }

  // every machine: a skill was used (by anyone)
  apply(e, from) {
    const g = this.g, p = g.players.get(e.pid);
    if (e.s === 'medic') {
      const m = ring(0x49e07a, e.r * 1.0);
      m.material.uniforms.uProg.value = 1;
      m.position.set(e.x, g.world.groundY(e.x, e.z) + 0.06, e.z);
      g.scene.add(m);
      this.zones.push({ ...e, t: 0, m });
      audio.play('power', { x: e.x, z: e.z, vol: 0.6, rate: 1.4 });
      for (let i = 0; i < 24; i++) { const a = Math.random() * TAU, r = Math.random() * e.r; g.fx.glow.emit({ x: e.x + Math.cos(a) * r, y: 0.2, z: e.z + Math.sin(a) * r, vx: 0, vy: 1 + Math.random(), vz: 0, life: 0.9, s0: 0.25, s1: 0.05, r: 0.3, g: 1, b: 0.45, a0: 0.9, a1: 0 }); }
    } else if (e.s === 'gunner') {
      if (p && !p.local) p.over = { t: e.t, rateK: 1, dmgK: 1 };
      if (p) audio.play('power', { x: p.x, z: p.z, vol: 0.55, rate: 0.8 });
      if (p?.local) g.hud.banner('', 'OVERDRIVE', 1.2);
    } else if (e.s === 'scout') {
      if (p && !p.local) p.dashFx = 0.25;
      audio.play('swap', { x: e.x0, z: e.z0, vol: 0.9, rate: 0.6 });
      for (let i = 0; i < 10; i++) {
        const u = i / 9, x = e.x0 + (e.x1 - e.x0) * u, z = e.z0 + (e.z1 - e.z0) * u;
        g.fx.smoke.emit({ x, y: 0.2, z, vx: (Math.random() - 0.5), vy: 0.4, vz: (Math.random() - 0.5), life: 0.7, s0: 0.3, s1: 1.1, r: 0.45, g: 0.47, b: 0.5, a0: 0.3, a1: 0, drag: 2 });
        g.fx.glow.emit({ x, y: 1.0, z, life: 0.18, s0: 0.5, s1: 0.2, r: 0.35, g: 0.8, b: 1, a0: 0.5 * (1 - u * 0.6), a1: 0 });
      }
      // host: the dead along the path are shoved aside (and with Shoulder charge, hurt and knocked flat)
      if (g.isHost) {
        const dx = e.x1 - e.x0, dz = e.z1 - e.z0, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
        for (const z of [...g.zombies.values()]) {
          if (!z.alive || z.boss) continue;
          const fx = z.x - e.x0, fz = z.z - e.z0, along = fx * ux + fz * uz;
          if (along < -0.5 || along > L + 0.8) continue;
          const side = fx * -uz + fz * ux;
          if (Math.abs(side) > 1.4) continue;
          const s = side >= 0 ? 1 : -1;
          z.knock.x += (-uz * s * 5 + ux * 2); z.knock.z += (ux * s * 5 + uz * 2);
          if (e.dmg > 0) {
            const killed = z.damage(e.dmg, -uz * s, ux * s, false, e.pid, 2.5);
            if (killed) g.onKill(z, -uz * s, ux * s, false, e.pid === g.me.id, e.pid);
            else g.netEvent({ k: 'zhit', id: z.id, dx: -uz * s, dz: ux * s, crit: 0 });
          }
          z.staggerFor = e.dmg > 0 ? 1.1 : 0.5; z.setState('stagger');
        }
      }
    } else if (e.s === 'engineer') {
      this.addTurret(e);
    }
  }

  addTurret(e) {
    const g = this.g;
    const base = gear('sentry_base'), head = gear('sentry_head');
    const root = new THREE.Group();
    root.add(base, head);
    root.position.set(e.x, g.world.groundY(e.x, e.z), e.z);
    root.scale.setScalar(1.25);
    head.rotation.y = e.f;
    g.scene.add(root);
    const t = { ...e, root, head, yaw: e.f, t: 0, cool: 0.4, target: null, look: 0, fire: 0, side: 0, deploy: 0 };
    this.turrets.set(e.id, t);
    audio.play('slide', { x: e.x, z: e.z, vol: 0.9, rate: 0.7 });
    audio.play('mag_in', { x: e.x, z: e.z, vol: 0.8 });
  }

  // host: the sentry chose something new to shoot
  onTarget(e) { const t = this.turrets.get(e.id); if (t) t.target = e.z ? this.g.zombies.get(e.z) || null : null; }

  update(dt) {
    const g = this.g, me = g.me;
    // recharge
    if (this.st && this.charges < (this.st.charges || 1)) {
      this.cd -= dt;
      if (this.cd <= 0) { this.charges++; this.cd = this.charges < (this.st.charges || 1) ? this.st.cd : 0; if (this.charges === (this.st.charges || 1)) audio.play('click', { vol: 0.5, rate: 1.4, jitter: 0 }); }
    }
    // medic circles: heal YOUR survivor if you stand in one
    for (const zn of this.zones) {
      zn.t += dt;
      const fade = Math.min(1, zn.t * 4) * Math.min(1, (zn.life - zn.t) * 2);
      const u = zn.m.material.uniforms;
      u.uTime.value = g.time; u.uA.value = Math.max(0, fade) * (0.7 + 0.3 * Math.sin(g.time * 5));
      if (Math.random() < dt * 14) { const a = Math.random() * TAU, r = Math.random() * zn.r; g.fx.glow.emit({ x: zn.x + Math.cos(a) * r, y: 0.15, z: zn.z + Math.sin(a) * r, vx: 0, vy: 0.8 + Math.random() * 0.6, vz: 0, life: 1.0, s0: 0.18, s1: 0.04, r: 0.3, g: 1, b: 0.5, a0: 0.8, a1: 0 }); }
      if (me.alive && me.hp < me.maxHp && Math.hypot(me.x - zn.x, me.z - zn.z) < zn.r) {
        me.hp = Math.min(me.maxHp, me.hp + zn.heal * dt);
        g.hud.health(me.hp, me.maxHp);
        me.char.material.userData.uniforms.uFlash.value = Math.max(me.char.material.userData.uniforms.uFlash.value, 0);
      }
    }
    this.zones = this.zones.filter((zn) => { if (zn.t < zn.life) return true; g.scene.remove(zn.m); zn.m.material.dispose(); return false; });
    // overdrive embers, dash streaks
    for (const p of g.players.values()) {
      if (p.over && (p.over.t -= dt) <= 0) p.over = null;
      if (p.over && Math.random() < dt * 30) {
        const m = p.muzzle?.();
        if (m) g.fx.fire.emit({ x: m.x, y: m.y, z: m.z, vx: (Math.random() - 0.5) * 0.6, vy: 0.6 + Math.random(), vz: (Math.random() - 0.5) * 0.6, life: 0.4, s0: 0.06, s1: 0.02, r: 1, g: 0.55, b: 0.15, a0: 1, a1: 0 });
      }
      const uni = p.char.material.userData.uniforms;
      if (p._rim0 === undefined) p._rim0 = uni.uRimColor.value.getHex();
      uni.uRimColor.value.setHex(p.over ? 0xff8a20 : p._rim0);
      uni.uRim.value = p.over ? 0.9 : 0.4;
    }
    // sentries
    for (const [id, t] of this.turrets) {
      t.t += dt;
      t.deploy = Math.min(1, t.deploy + dt * 3);
      t.root.scale.setScalar(1.25 * (0.6 + 0.4 * (1 - (1 - t.deploy) ** 3)));
      if (g.isHost) this.hostTurret(t, dt);
      // aim and fire (every machine draws it)
      const tg = t.target && t.target.alive ? t.target : null;
      if (tg) {
        const want = Math.atan2(tg.x - t.x, tg.z - t.z);
        let da = want - t.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
        t.yaw += Math.max(-9 * dt, Math.min(9 * dt, da));
        t.fire -= dt;
        if (Math.abs(da) < 0.2 && t.fire <= 0 && Math.hypot(tg.x - t.x, tg.z - t.z) < t.range + 1) {
          t.fire = 1 / t.rate;
          t.side ^= 1;
          const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw), rx = Math.cos(t.yaw), rz = -Math.sin(t.yaw);
          const s = t.side ? 1 : -1, sc = 1.25;
          const mx = t.x + fx * 0.64 * sc + rx * 0.045 * s * sc, mz = t.z + fz * 0.64 * sc + rz * 0.045 * s * sc, my = t.root.position.y + 0.84 * sc;
          g.fx.muzzle(mx, my, mz, fx, fz);
          g.fx.tracer(mx, my, mz, tg.x + (Math.random() - 0.5) * 0.3, tg.z + (Math.random() - 0.5) * 0.3, 1.2);
          if (Math.random() < 0.5) g.fx.shell(mx - fx * 0.3, my, mz - fz * 0.3, fx, fz);
          audio.play('smg', { x: t.x, z: t.z, vol: 0.55, rate: 1.15 });
          t.kick = 1;
        }
      } else t.yaw += Math.sin(g.time * 0.8 + t.x) * dt * 0.8;          // idle: a slow scan
      t.kick = Math.max(0, (t.kick || 0) - dt * 14);
      t.head.rotation.y = t.yaw;
      t.head.position.set(-Math.sin(t.yaw) * 0.03 * t.kick, 0, -Math.cos(t.yaw) * 0.03 * t.kick);
      // the last seconds: the light blinks red, then it folds away
      if (t.t > t.life - 2.5 && Math.random() < dt * 6) g.fx.glow.emit({ x: t.x, y: t.root.position.y + 1.25, z: t.z, life: 0.12, s0: 0.35, s1: 0.2, r: 1, g: 0.15, b: 0.1, a0: 1, a1: 0 });
      if (t.t >= t.life) {
        g.fx.smoke.emit({ x: t.x, y: 0.6, z: t.z, vx: 0, vy: 1, vz: 0, life: 1.2, s0: 0.5, s1: 1.6, r: 0.4, g: 0.4, b: 0.4, a0: 0.4, a1: 0, drag: 1 });
        audio.play('mag_out', { x: t.x, z: t.z, vol: 0.8 });
        g.scene.remove(t.root);
        this.turrets.delete(id);
      }
    }
  }

  // host: pick a target, shoot it (damage); tell everyone what it is aiming at
  hostTurret(t, dt) {
    const g = this.g;
    t.look -= dt;
    if (t.look <= 0 || (t.target && !t.target.alive)) {
      t.look = 0.25;
      let best = null, bd = t.range * t.range;
      for (const z of g.zombies.values()) {
        if (!z.alive || z.idle) continue;
        const d = (z.x - t.x) ** 2 + (z.z - t.z) ** 2;
        if (d >= bd) continue;
        const dd = Math.sqrt(d);
        if (g.world.col.ray(t.x, t.z, (z.x - t.x) / dd, (z.z - t.z) / dd, dd).d < dd - 0.4) continue;
        bd = d; best = z;
      }
      if (best !== t.target) { t.target = best; g.netEvent({ k: 'tgt', id: t.id, z: best ? best.id : 0 }); }
    }
    const z = t.target;
    t.cool -= dt;
    if (z && z.alive && t.cool <= 0) {
      const want = Math.atan2(z.x - t.x, z.z - t.z);
      let da = want - t.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < 0.2) {
        t.cool = 1 / t.rate;
        const d = Math.hypot(z.x - t.x, z.z - t.z) || 1, dx = (z.x - t.x) / d, dz = (z.z - t.z) / d;
        const killed = z.damage(t.dmg, dx, dz, false, t.pid, 0.6);
        if (killed) g.onKill(z, dx, dz, false, t.pid === g.me.id, t.pid);
        else g.netEvent({ k: 'zhit', id: z.id, dx, dz, crit: 0 });
        z.hitFx(dx, dz, false);
        g.fx.flesh(z.x, 1.2, z.z, dx, dz, 0.6, false);
      }
    }
  }

  dispose() {
    for (const zn of this.zones) this.g.scene.remove(zn.m);
    for (const t of this.turrets.values()) this.g.scene.remove(t.root);
  }
}
