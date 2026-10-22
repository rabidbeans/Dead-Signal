// The juice (Sam, 2026-10-22: "spruce the game up"): the little things that make a kill feel like one.
//
//   streaks      kills close together chain into a STREAK: the bounty climbs (+1% a kill, up to +50%) and every so often
//                the streak is called out (RAMPAGE, BLOODBATH...) with a bonus. Local to each player (it is your streak).
//   hit marks    a tick at the body when your bullet lands, a heavier red one when it kills (HUD, hud.js `mark`)
//   eye shine    the dead's eyes catch the light: two faint points on every face, burning bright in your flashlight's
//                cone (one Points draw call for the whole horde)
//   footprints   walk through a pool of blood and you leave red boot prints for a while
//   head pops    a critical kill takes the head clean off (zombie.js `popHead`)
import * as THREE from 'three';
import { audio, buzz } from './audio.js';

export const STREAK_WINDOW = 3.2;           // seconds to the next kill before the streak ends
export const STREAKS = [[10, 'RAMPAGE'], [20, 'BLOODBATH'], [35, 'MASSACRE'], [50, 'UNSTOPPABLE'], [75, 'APOCALYPSE'], [100, 'LEGEND'], [150, 'GOD OF THE DEAD']];
const MAX_EYES = 70;
const _v = new THREE.Vector3();

// a hot little core with a soft halo (the generic soft sprite fades out too early to read as a glint at this size)
function eyeTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.16, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Juice {
  constructor(g) {
    this.g = g;
    this.combo = 0; this.comboT = 0; this.best = 0; this.step = 0;
    this.markT = 0;
    // eyes: two points a face
    const geo = new THREE.BufferGeometry();
    this.ePos = new Float32Array(MAX_EYES * 2 * 3);
    this.eCol = new Float32Array(MAX_EYES * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.ePos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.eCol, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.eyes = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.28, map: eyeTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, sizeAttenuation: true }));
    this.eyes.frustumCulled = false;
    this.eyes.renderOrder = 4;
    g.scene.add(this.eyes);
    // bloody boot prints
    this.prints = g.fx.makeDecals('footprint', 140, { y: 0.026, gy: (x, z) => g.world.groundY(x, z), rough: 0.7 });
    this.feet = new Map();
  }

  // the bounty multiplier this streak is worth
  mult() { return 1 + Math.min(0.5, this.combo * 0.01); }

  // a kill by the local player
  kill(z, crit) {
    const g = this.g;
    this.combo++;
    this.comboT = STREAK_WINDOW;
    if (this.combo > this.best) this.best = this.combo;
    const S = STREAKS[this.step];
    if (S && this.combo >= S[0]) {
      this.step++;
      const bonus = S[0] * 3;
      g.hud.announce(S[1], `${S[0]} KILL STREAK  ·  +$${bonus}`);
      g.earn(bonus, null, null);
      g.xp += Math.round(S[0] / 5);
      audio.play('streak', { vol: 0.75, jitter: 0 });
      buzz([20, 30, 40]);
      g.cam.trauma(0.25);
    }
  }

  // ticks at the body (throttled: a flamethrower or a shotgun hits a lot of things at once)
  hit(z, crit) {
    if (this.markT > 0) return;
    this.markT = 0.045;
    this.g.hud.mark(z.x, 1.3 * z.char.root.scale.x, z.z, crit ? 'crit' : 'hit', this.g.camera);
    audio.play('hitmark', { vol: crit ? 0.35 : 0.22, rate: crit ? 0.85 : 1 + Math.random() * 0.1, jitter: 0 });
  }

  killMark(z, crit) {
    this.g.hud.mark(z.x, 1.3 * z.char.root.scale.x, z.z, 'kill', this.g.camera);
    audio.play('killmark', { vol: 0.32, jitter: 0 });
  }

  update(dt) {
    const g = this.g;
    this.markT -= dt;
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) { this.combo = 0; this.step = 0; }
    }
    g.hud.streak(this.combo, Math.max(0, this.comboT / STREAK_WINDOW), this.mult());
    this.eyeShine();
    this.footprints(dt);
  }

  // the dead's eyes catch the light
  eyeShine() {
    const g = this.g, me = g.me, P = this.ePos, C = this.eCol;
    const ax = Math.sin(me.face), az = Math.cos(me.face);
    let n = 0;
    if (!g.side?.active) for (const z of g.zombies.values()) {
      if (n >= MAX_EYES * 2 || !z.alive || z.headless) continue;
      const dx = z.x - me.x, dz = z.z - me.z, d2 = dx * dx + dz * dz;
      if (d2 > 26 * 26) continue;
      const hb = z.rig.b.head;
      if (!hb) continue;
      hb.getWorldPosition(_v);
      const s = z.char.root.scale.x, f = z.boss ? (z.vface ?? z.face) : z.face;
      const fx = Math.sin(f), fz = Math.cos(f), rx = fz, rz = -fx;
      // brighter in the flashlight's cone, and when it is looking your way
      const d = Math.sqrt(d2) || 1;
      const inBeam = Math.max(0, ((dx * ax + dz * az) / d - 0.84) / 0.16) * Math.max(0, 1 - d / 16);
      const facing = Math.max(0, -(dx * fx + dz * fz) / d);
      const k = (0.15 + 2.2 * inBeam) * facing * facing * (z.idle ? 0.7 : 1);
      const col = z.boss ? [1, 0.18, 0.1] : z.elite ? [1, 0.55, 0.12] : [0.85, 1, 0.55];
      const y = _v.y + 0.07 * s;
      for (const sd of [-1, 1]) {
        const i = n * 3;
        P[i] = _v.x + fx * 0.16 * s + rx * 0.036 * s * sd;
        P[i + 1] = y;
        P[i + 2] = _v.z + fz * 0.16 * s + rz * 0.036 * s * sd;
        C[i] = col[0] * k; C[i + 1] = col[1] * k; C[i + 2] = col[2] * k;
        n++;
      }
    }
    const geo = this.eyes.geometry;
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  // a pool of blood underfoot soaks the boots: red prints for the next dozen metres
  footprints(dt) {
    const g = this.g, pools = g.fx.poolPts;
    for (const p of g.players.values()) {
      if (!p.alive || g.side?.active) continue;
      let f = this.feet.get(p.id);
      if (!f) { f = { wet: 0, d: 0, side: 1, x: p.x, z: p.z }; this.feet.set(p.id, f); }
      const moved = Math.hypot(p.x - f.x, p.z - f.z);
      f.x = p.x; f.z = p.z;
      if (moved > 2) continue;                       // a respawn or a teleport
      for (const q of pools) if ((q.x - p.x) ** 2 + (q.z - p.z) ** 2 < 1.1) { f.wet = 13; break; }
      if (f.wet <= 0) continue;
      f.d += moved;
      if (f.d < 0.62) continue;
      f.d = 0;
      f.wet -= 0.62;
      f.side = -f.side;
      const h = Math.atan2(p.vx || Math.sin(p.face), p.vz || Math.cos(p.face));
      const ox = Math.cos(h) * 0.11 * f.side, oz = -Math.sin(h) * 0.11 * f.side;
      this.prints.add(p.x + ox, p.z + oz, 0.3 * (0.5 + 0.5 * Math.min(1, f.wet / 6)), h + Math.PI + (Math.random() - 0.5) * 0.12, 0, null, 0, 0, 0.5);
    }
  }

  dispose() { this.g.scene.remove(this.eyes, this.prints.mesh); }
}
