// The dead. Simulation runs on the host; every machine animates from the
// resulting positions, so a client's horde moves exactly like the host's.
import * as THREE from 'three';
import { makeCharacter, ZOMBIES } from './assets.js';
import { Rig, ZombieAnim, mulberry } from './rig.js';
import { audio } from './audio.js';

export const TYPES = {
  // research: shamblers 0.6-1.0 m/s turning 90-150°/s; lurchers burst to ~3 m/s for 0.4-0.8 s every 3-6 s
  shambler: { hp: 110, speed: [1.0, 1.5], turn: 2.6, dmg: 16 },
  lurcher: { hp: 100, speed: [1.2, 1.65], turn: 3.4, dmg: 18, burst: 3.5, burstEvery: [3, 3] },
  runner: { hp: 70, speed: [2.4, 3.0], turn: 4.6, dmg: 12 },
  // the brute (level 2): a hulking, slow, hard-hitting body that shrugs off a stagger. A long wind-up tells you the blow
  // is coming, and it is a big one.
  brute: { hp: 380, speed: [0.85, 1.05], turn: 2.0, dmg: 28, scale: 1.32, rad: 0.5, reach: 1.55, windup: 0.8, recover: 1.2, stagger: 0.12, knock: 0.22, models: ['z_trucker', 'z_burned', 'z_worker'] },
  // the bosses: one at the landing zone of each level. Huge, they charge in bursts, and they do not flinch.
  warden: { boss: true, name: 'THE WARDEN', hp: 1500, speed: [0.95, 1.05], turn: 2.2, dmg: 34, scale: 1.75, rad: 0.85, reach: 2.1, windup: 0.85, recover: 1.3, stagger: 0.03, knock: 0.06, burst: 3.6, burstEvery: [5, 4], models: ['z_cop'], anim: 'brute', tint: [1, 0.95, 0.95] },
  patientzero: { boss: true, name: 'PATIENT ZERO', hp: 2400, speed: [1.0, 1.1], turn: 2.4, dmg: 40, scale: 1.85, rad: 0.9, reach: 2.2, windup: 0.8, recover: 1.2, stagger: 0.02, knock: 0.05, burst: 4.2, burstEvery: [4, 3], models: ['z_patient'], anim: 'brute', tint: [0.8, 1.0, 0.8] },
};

export const SPEED_K = 1.1;      // everything walks 10% faster than the numbers below
const ATTACK_RANGE = 1.15;
const WINDUP = 0.5;

export class Zombie {
  constructor(game, id, { type = 'shambler', model = null, seed = 1, x = 0, z = 0, idle = false, home = false } = {}) {
    this.game = game;
    this.id = id;
    this.type = type;
    this.def = TYPES[type];
    const r = mulberry(seed);
    this.r = r;
    this.model = model || (this.def.models || ZOMBIES)[Math.floor(r() * (this.def.models || ZOMBIES).length)];
    this.char = makeCharacter(this.model);
    const scale = (0.92 + r() * 0.16) * (this.def.scale || 1);
    this.char.root.scale.setScalar(scale);
    this.rig = new Rig(this.char);
    this.anim = new ZombieAnim(this.rig, seed, this.def.anim || type);
    // a little colour drift per body so a horde of the same model isn't clones
    const tint = 0.9 + r() * 0.16;
    const tk = this.def.tint || [1, 1, 1];
    this.char.material.userData.uniforms.uTint.value.setRGB(tint * tk[0], tint * (0.97 + r() * 0.05) * tk[1], tint * (0.95 + r() * 0.06) * tk[2]);
    game.scene.add(this.char.root);
    this.x = x; this.z = z;
    this.px = x; this.pz = z;
    this.face = Math.atan2(-x, -z);
    // a boss has more health with every extra player
    this.maxHp = this.hp = this.def.hp * (this.def.boss ? 1 + 0.6 * (game.players.size - 1) : 1);
    this.speed = (this.def.speed[0] + r() * (this.def.speed[1] - this.def.speed[0])) * SPEED_K;
    this.state = 'walk';      // walk | windup | recover | stagger | dead
    this.stateT = 0;
    this.burstT = 2 + r() * 4;
    this.boss = !!this.def.boss;
    this.bursting = 0;
    this.slot = (r() - 0.5) * 2.2;   // flanking offset (radians around the target)
    this.groanT = 1 + r() * 6;
    this.flash = 0;
    this.knock = { x: 0, z: 0 };
    this.deadT = 0;
    this.target = null;
    this.sunk = 0;
    this.idle = idle;               // asleep on its feet until someone comes near
    this.wakeR = 9 + r() * 3;
    if (idle && home) { this.home = { x, z }; this.wander = { x: x + (r() - 0.5) * 5, z: z + (r() - 0.5) * 5 }; }
    // client interpolation buffer
    this.buf = [];
    this.place();
  }

  place() {
    this.char.root.position.set(this.x, 0, this.z);
    this.char.root.rotation.y = this.face;
  }

  get alive() { return this.state !== 'dead'; }

  // ----------------------------------------------------------- host sim --
  think(dt, players) {
    if (this.state === 'dead') { this.deadT += dt; return; }
    this.stateT += dt;
    // nearest living player
    let best = null, bd = 1e9;
    for (const p of players) {
      if (!p.alive) continue;
      const d = (p.x - this.x) ** 2 + (p.z - this.z) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    this.target = best;
    let dist = Math.sqrt(bd);
    if (this.idle) {
      // the dead on their feet: they notice you close up, or a gunshot nearby
      const g = this.game;
      const noisy = g.noise && g.time - g.noise.t < 1.5 && (g.noise.x - this.x) ** 2 + (g.noise.z - this.z) ** 2 < 22 * 22;
      if (dist < this.wakeR || noisy || this.state !== 'walk') this.wake();
      else best = null;
    }
    // rescue: a body that has not got anywhere for 3 s is put back on the road
    this.stuckT = (this.stuckT || 0) + dt;
    if (this.stuckT > 3) {
      const moved = Math.hypot(this.x - (this.sx ?? this.x), this.z - (this.sz ?? this.z));
      this.sx = this.x; this.sz = this.z; this.stuckT = 0;
      if (moved < 0.35 && dist > 4 && this.state === 'walk' && !this.wander && !this.idle && !this.boss) this.game.relocate(this);
    }
    let want = 0, dirx = 0, dirz = 0;
    if (best) {
      const tx = best.x - this.x, tz = best.z - this.z;
      if (dist < 5) {
        // close: home in, approaching through a flanking slot
        const a = Math.atan2(tz, tx) + this.slot * Math.min(1, (dist - 1) / 4) * 0.5;
        dirx = Math.cos(a); dirz = Math.sin(a);
      } else {
        const f = this.game.world.nav.dir(this.x, this.z);
        if (f) { dirx = f.x; dirz = f.z; } else { dirx = tx / dist; dirz = tz / dist; }
      }
      want = this.speed;
    } else if (this.wander) {
      // nobody to chase (the menu): drift between points
      const tx = this.wander.x - this.x, tz = this.wander.z - this.z, d = Math.hypot(tx, tz);
      if (d < 1) this.wander = this.home ? { x: this.home.x + (this.r() - 0.5) * 6, z: this.home.z + (this.r() - 0.5) * 6 } : { x: (this.r() - 0.5) * 40, z: (this.r() - 0.5) * 40 };
      const f = d > 0.01 ? { x: tx / d, z: tz / d } : { x: 0, z: 0 };
      dirx = f.x; dirz = f.z;
      want = this.speed * (this.home ? 0.35 : 0.8);
    }
    // lurchers and bosses: a sudden dash with a scream (the RE6 scare)
    if (this.def.burst && best) {
      this.burstT -= dt;
      if (this.burstT < 0 && dist < 14 && dist > 2.5 && this.state === 'walk') {
        this.bursting = 0.45 + this.r() * 0.35;
        const be = this.def.burstEvery;
        this.burstT = be[0] + this.r() * be[1];
        this.anim.doLurch();
        this.game.emit({ k: 'lurch', id: this.id });
      }
    }
    if (this.bursting > 0) { this.bursting -= dt; want = this.def.burst * SPEED_K; }
    // states
    if (this.state === 'stagger') { want *= 0.15; if (this.stateT > this.staggerFor) this.setState('walk'); }
    const reach = this.def.reach || ATTACK_RANGE, windup = this.def.windup || WINDUP;
    if (this.state === 'walk' && best && dist < reach) {
      this.setState('windup');
      this.game.emit({ k: 'windup', id: this.id });
    }
    if (this.state === 'windup') {
      want = 0.3;
      if (this.stateT > windup) {
        if (best && dist < reach + 0.35) this.game.hurtPlayer(best, this.def.dmg, this);
        this.setState('recover');
      }
    }
    if (this.state === 'recover') { want = 0.2; if (this.stateT > (this.def.recover || 0.9)) this.setState('walk'); }
    // turn toward the travel direction at a limited rate
    if (dirx || dirz) {
      const ta = Math.atan2(dirx, dirz);
      let da = ta - this.face;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const turn = this.def.turn * (this.bursting > 0 ? 1.5 : 1);
      this.face += Math.max(-turn * dt, Math.min(turn * dt, da));
    }
    // move along the facing (they can't strafe)
    let vx = Math.sin(this.face) * want, vz = Math.cos(this.face) * want;
    // separation from the rest of the horde
    for (const o of this.game.zombies.values()) {
      if (o === this || !o.alive) continue;
      const dx = this.x - o.x, dz = this.z - o.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.5 && d2 > 1e-6) { const d = Math.sqrt(d2); const k = (0.71 - d) / d * 2.2; vx += dx * k; vz += dz * k; }
    }
    // knockback from bullets
    vx += this.knock.x; vz += this.knock.z;
    this.knock.x *= Math.max(0, 1 - dt * 9); this.knock.z *= Math.max(0, 1 - dt * 9);
    let nx = this.x + vx * dt, nz = this.z + vz * dt;
    // don't walk through the living
    for (const p of players) {
      if (!p.alive) continue;
      const dx = nx - p.x, dz = nz - p.z, d = Math.hypot(dx, dz);
      if (d < 0.55 && d > 1e-4) { nx = p.x + dx / d * 0.55; nz = p.z + dz / d * 0.55; }
    }
    const res = this.game.world.col.resolve(nx, nz, 0.3);
    this.x = res.x; this.z = res.z;
  }

  setState(s) { this.state = s; this.stateT = 0; }

  wake() {
    if (!this.idle) return;
    this.idle = false;
    this.wander = null; this.home = null;
    this.game.wakeNear?.(this);
  }

  // bullets (host applies; clients send hits to the host)
  damage(dmg, dirx, dirz, crit, byId) {
    if (!this.alive) return false;
    this.wake();
    this.hp -= dmg;
    const kk = this.def.knock ?? 1;
    this.knock.x += dirx * (crit ? 0.9 : 0.45) * 4 * kk;
    this.knock.z += dirz * (crit ? 0.9 : 0.45) * 4 * kk;
    if (this.hp <= 0) { this.die(dirx, dirz, crit); return true; }
    // a stagger meter: torso shots lose effect, but a run of hits staggers
    const sg = this.def.stagger ?? 1;          // a brute almost never breaks stride
    this.staggerFor = 0.15 + Math.random() * 0.15;
    if ((this.state === 'walk' || this.state === 'recover') && Math.random() < sg) this.setState('stagger');
    if (this.state === 'windup' && Math.random() < 0.5 * sg) this.setState('stagger');
    return false;
  }

  // ------------------------------------------------------------- visual --
  hitFx(dirx, dirz, crit) {
    // local frame: x = the zombie's left, z = forward
    const c = Math.cos(this.face), s = Math.sin(this.face);
    const lx = dirx * c - dirz * s, lz = dirx * s + dirz * c;
    this.anim.hit(new THREE.Vector3(lx, 0, lz), crit ? 1.6 : 1);
    this.flash = 1;
  }

  die(dirx, dirz, crit) {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.deadT = 0;
    this.hp = 0;
    const c = Math.cos(this.face), s = Math.sin(this.face);
    const lz = dirx * s + dirz * c;          // + when shot from behind
    this.anim.deathDir = lz >= 0 ? 1 : -1;   // fall the way the bullet pushes
    this.anim.dead = 0.001;
    this.fallDir = { x: dirx, z: dirz };
    this.fall = 0;
    audio.play('death', { x: this.x, z: this.z, vol: 0.9 });
  }

  update(dt, cam) {
    // groans: more often and louder once it has someone in sight
    if (this.alive) {
      this.groanT -= dt;
      if (this.groanT < 0) {
        const near = this.target ? Math.hypot(this.target.x - this.x, this.target.z - this.z) : 30;
        this.groanT = (near < 8 ? 2.5 : 4.5) * (this.idle ? 2 : 1) + Math.random() * 4;
        audio.zombie('groan', this.x, this.z, this.idle ? 0.4 : near < 8 ? 1 : 0.65);
      }
    }
    const moved = Math.hypot(this.x - this.px, this.z - this.pz);
    const speed = dt > 0 ? moved / dt : 0;
    this.px = this.x; this.pz = this.z;
    this.anim.attack += ((this.state === 'windup' ? 1 : 0) - this.anim.attack) * Math.min(1, dt * 10);
    // Posing 27 bones is the single biggest cost of the horde, so only what you can see is posed every
    // frame: the dead beyond the screen edge every few frames, the long-dead not at all.
    const me = this.game.me;
    const d2 = me ? (this.x - me.x) ** 2 + (this.z - me.z) ** 2 : 0;
    this.adt = (this.adt || 0) + dt; this.amv = (this.amv || 0) + moved;
    this.lodN = (this.lodN || 0) + 1;
    const settled = this.state === 'dead' && this.deadT > 1.8;
    const pose = !settled && (d2 < 324 || this.lodN % (d2 > 676 ? 6 : 2) === 0);
    if (pose) {
      this.anim.update(this.adt, Math.min(this.amv, 0.2 * (this.adt / Math.max(dt, 1e-3))), this.adt > 0 ? this.amv / this.adt : 0);
      this.adt = 0; this.amv = 0;
    }
    this.flash = Math.max(0, this.flash - dt / 0.08);
    this.char.material.userData.uniforms.uFlash.value = this.flash;
    // the fall: pivot at the feet, onto the ground over ~0.6 s
    const root = this.char.root;
    if (this.state === 'dead') {
      this.fall = Math.min(1, this.fall + dt / 0.6);
      const k = this.fall < 1 ? (1 - Math.pow(1 - this.fall, 2.4)) : 1;
      const bounce = this.fall >= 1 ? 0 : Math.sin(Math.max(0, this.fall - 0.8) / 0.2 * Math.PI) * 0.04;
      const d = this.anim.deathDir;
      root.rotation.set(d * (k * 1.45 - bounce), this.face, 0, 'YXZ');
      root.position.set(this.x, this.game.world.groundY(this.x, this.z) + 0.02 + k * 0.08, this.z);
      if (this.deadT > 30) { this.sunk += dt * 0.05; root.position.y -= this.sunk; }
      return;
    }
    root.position.set(this.x, this.game.world.groundY(this.x, this.z), this.z);
    root.rotation.set(0, this.face, 0);
  }

  dispose() {
    this.game.scene.remove(this.char.root);
    this.char.material.dispose();
  }
}
