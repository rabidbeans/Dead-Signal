// The dead. Simulation runs on the host; every machine animates from the
// resulting positions, so a client's horde moves exactly like the host's.
import * as THREE from 'three';
import { makeCharacter, ZOMBIES } from './assets.js';
import { BossKit } from './bossgear.js';
import { Rig, ZombieAnim, mulberry } from './rig.js';
import { audio } from './audio.js';
import { LV } from './level.js';
import { BossBrain } from './boss.js';
import { bloaterBurst } from './specials.js';
// (the burst runs a beat later: it is set off from inside a damage call, and it deals damage of its own)
const bloaterBurstLater = (g, z) => g.after(0.05, () => bloaterBurst(g, z));

export const TYPES = {
  // research: shamblers 0.6-1.0 m/s turning 90-150°/s; lurchers burst to ~3 m/s for 0.4-0.8 s every 3-6 s
  shambler: { hp: 110, speed: [1.0, 1.5], turn: 2.6, dmg: 16 },
  lurcher: { hp: 100, speed: [1.2, 1.65], turn: 3.4, dmg: 18, burst: 3.5, burstEvery: [3, 3] },
  runner: { hp: 70, speed: [2.4, 3.0], turn: 4.6, dmg: 12 },
  // the brute (level 2): a hulking, slow, hard-hitting body that shrugs off a stagger. A long wind-up tells you the blow
  // is coming, and it is a big one.
  brute: { hp: 380, speed: [0.85, 1.05], turn: 2.0, dmg: 28, scale: 1.32, rad: 0.5, reach: 1.55, windup: 0.8, recover: 1.2, stagger: 0.12, knock: 0.22, models: ['z_trucker', 'z_burned', 'z_worker'] },
  // one new kind of the dead for each map (specials.js says what each does). `tip` is said the first time you meet one.
  bloater: { hp: 230, speed: [0.72, 0.9], turn: 2.0, dmg: 14, scale: 1.08, rad: 0.48, reach: 1.3, windup: 0.7, stagger: 0.35, knock: 0.45, models: ['z_bloater'], anim: 'bloater', xp: 3, special: true,
    tip: 'BLOATER: it bursts into poison gas when it dies. Pop it far away, or in the middle of a crowd.', pop: { r: 3.4, zDmg: 150, pDmg: 16 } },
  screamer: { hp: 95, speed: [1.15, 1.4], turn: 3.4, dmg: 10, models: ['z_screamer'], anim: 'screamer', xp: 3, special: true, kit: true,
    tip: 'SCREAMER: if she screams, everything nearby wakes up and comes running. Kill her first.', scream: { cd: 12, range: 15, wake: 28, haste: 18, adds: 2 } },
  spitter: { hp: 120, speed: [1.0, 1.25], turn: 3.0, dmg: 12, models: ['z_spitter'], anim: 'spitter', xp: 3, special: true,
    tip: 'SPITTER: it keeps its distance and spits acid. Do not stand in the green.', spit: { cd: 3.4, min: 5.5, max: 13, r: 1.7, dps: 12, life: 5, dur: 0.9 } },
  leaper: { hp: 115, speed: [1.55, 1.9], turn: 4.2, dmg: 8, models: ['z_leaper'], anim: 'leaper', xp: 3, special: true,
    tip: 'LEAPER: it pounces and pins you down. A friend can shoot it off; alone, tap the screen to struggle free.', pounce: { cd: 5, min: 3.2, max: 9, wind: 0.55, dur: 0.5, dps: 12, hold: 4, breakDmg: 55 } },
  soldier: { hp: 270, speed: [1.0, 1.25], turn: 2.6, dmg: 20, models: ['z_soldier'], anim: 'soldier', xp: 4, special: true, kit: true, armor: 0.3, stagger: 0.4, knock: 0.6,
    tip: 'SOLDIER: body armour turns bullets from the front. Flank it, burn it, blow it up, or go for the head.' },
  // the bosses: one guarding the end of each level, each with its own special move (boss.js). Huge, and they barely flinch.
  warden: { boss: true, name: 'THE WARDEN', trait: 'Riot shield: bullets from the front glance off. Flank her, or shoot her while she is dazed after a charge.', hp: 1150, speed: [0.9, 1.0], turn: 2.2, dmg: 24, scale: 1.7, rad: 0.85, reach: 2.1, windup: 0.85, recover: 1.3, stagger: 0.03, knock: 0.06, models: ['b_warden'], shield: 0.3 },
  patientzero: { boss: true, name: 'PATIENT ZERO', trait: 'Hooked to his drip: he heals if you stop shooting. Keep the pressure on.', hp: 3000, speed: [1.0, 1.1], turn: 2.4, dmg: 32, scale: 1.7, rad: 0.9, reach: 2.2, windup: 0.8, recover: 1.2, stagger: 0.02, knock: 0.05, models: ['b_patientzero'], regen: 0.006 },
  butcher: { boss: true, name: 'THE BUTCHER', trait: 'He smells blood: when you are hurt, he comes faster.', hp: 3800, speed: [1.0, 1.12], turn: 2.6, dmg: 34, scale: 1.8, rad: 0.9, reach: 2.2, windup: 0.75, recover: 1.1, stagger: 0.02, knock: 0.05, models: ['b_butcher'], tint: [1.04, 0.98, 0.98] },
  foreman: { boss: true, name: 'THE FOREMAN', trait: 'Overtime: under half health he swings and leaps faster.', hp: 4600, speed: [0.95, 1.05], turn: 2.3, dmg: 38, scale: 1.85, rad: 0.95, reach: 2.3, windup: 0.85, recover: 1.2, stagger: 0.02, knock: 0.04, models: ['b_foreman'] },
  omega: { boss: true, name: 'SUBJECT OMEGA', trait: 'It mutates as it is hurt: bigger and faster every quarter of its health.', hp: 3600, speed: [1.05, 1.15], turn: 2.6, dmg: 40, scale: 1.95, rad: 1.0, reach: 2.4, windup: 0.75, recover: 1.0, stagger: 0.01, knock: 0.03, models: ['b_omega'] },
};

// per body: how the person they were still shows in the walk (on top of the shambler/lurcher/runner/brute gait)
const MODEL_GAIT = {
  z_elder: (p) => { p.lean += 0.25; p.stride *= 0.8; p.headFwd += 0.15; p.limp ??= 'R'; },             // bent double, shuffling
  z_jogger: (p, t) => { if (t !== 'runner') { p.stride *= 1.15; p.reach = 'none'; } p.sway *= 0.6; },  // still trying to jog
  z_burned: (p) => { p.reach = 'both'; p.reachAmt = 1.1; p.jaw += 0.15; },                              // arms seared stiff out front
  z_hoodie: (p) => { p.headFwd += 0.25; p.headTilt *= 0.4; p.shoulderDrop += 0.12; },                    // head down, slouched
  z_nurse: (p) => { p.headTilt *= 1.6; p.reach = p.reach === 'none' ? 'R' : p.reach; },                 // head lolled right over
  z_trucker: (p) => { p.sway *= 1.6; p.stride *= 0.9; p.lean -= 0.1; },                                  // a heavy roll
  z_patient: (p) => { p.limp = p.limp || 'L'; p.timeScale *= 0.9; },                                    // a dragged leg
  z_office: (p) => { p.reach = p.reach === 'none' ? 'L' : p.reach; p.shoulderDrop -= 0.1; },
  z_cop: (p) => { p.lean -= 0.1; p.headFwd -= 0.05; },                                                   // still almost upright
  z_worker: (p) => { p.limp = p.limp || 'R'; p.shoulderDrop += 0.15; },
};

const _sv = new THREE.Vector3();
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
    this.baseScale = scale;
    this.rig = new Rig(this.char);
    if (this.def.boss) for (const h of ['hand_L', 'hand_R']) this.rig.b[h]?.scale.setScalar(1.04);    // (a giant with cartoon hands reads as balloon gloves)
    this.anim = new ZombieAnim(this.rig, seed, this.def.anim || type);
    // the ordinary dead move a little like who they were
    if (!this.def.boss) MODEL_GAIT[this.model]?.(this.anim.p, type);
    // a little colour drift per body so a horde of the same model isn't clones
    const tint = 0.9 + r() * 0.16;
    const tk = this.def.tint || [1, 1, 1];
    this.char.material.userData.uniforms.uTint.value.setRGB(tint * tk[0], tint * (0.97 + r() * 0.05) * tk[1], tint * (0.95 + r() * 0.06) * tk[2]);
    game.scene.add(this.char.root);
    this.x = x; this.z = z;
    this.px = x; this.pz = z;
    this.face = Math.atan2(-x, -z);
    // a boss has more health with every extra player
    // later levels: the ordinary dead are tougher and faster (LV.zHp / zSpd)
    this.maxHp = this.hp = this.def.hp * (this.def.boss ? 1 + 0.6 * (game.players.size - 1) : (LV.zHp || 1));
    this.speed = (this.def.speed[0] + r() * (this.def.speed[1] - this.def.speed[0])) * SPEED_K * (this.def.boss ? 1 : (LV.zSpd || 1));
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
    this.wakeR = 11 + r() * 4;
    if (idle && home) { this.home = { x, z }; this.wander = { x: x + (r() - 0.5) * 5, z: z + (r() - 0.5) * 5 }; }
    // client interpolation buffer
    this.buf = [];
    this.place();
    if (this.boss || this.def.kit) { try { this.kit = new BossKit(this); } catch (e) { console.warn('boss kit', e); } }
    this.specT = 1.5 + r() * 2.5;     // a special's move: seconds until it may use it
    this.prevState = this.state;
    this.hitT = 99;          // seconds since it was last shot (Patient Zero's drip)
    this.mut = 0;            // Omega's mutations so far
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
    this.hitT += dt;
    // on fire (Dragon's Breath): it burns down, and sets the dead it brushes against alight
    if (this.burn) {
      const b = this.burn;
      b.t -= dt; b.tick -= dt;
      if (b.tick <= 0) {
        b.tick = 0.25;
        const killed = this.damage(b.dps * 0.25 * (this.boss ? 0.5 : 1), 0, 0, false, b.by, 0);
        if (killed) { this.game.onKill(this, 0, 0, false, b.by === this.game.me.id, b.by); return; }
        if (b.spread) for (const o of this.game.zombies.values()) {
          if (o === this || !o.alive || o.burn || (o.x - this.x) ** 2 + (o.z - this.z) ** 2 > b.spread * b.spread) continue;
          if (Math.random() < 0.35) o.ignite({ dps: b.dps, t: b.t0 * 0.6, spread: 0 }, b.by);
        }
      }
      if (b.t <= 0) this.burn = null;
    }
    // Patient Zero's drip: he heals while nobody is shooting him
    if (this.def.regen && this.hitT > 2.5 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * this.def.regen * dt);
    // nearest living player
    let best = null, bd = 1e9;
    for (const p of players) {
      if (!p.alive) continue;
      const d = (p.x - this.x) ** 2 + (p.z - this.z) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    // a pipe bomb beeping nearby: the awake dead turn and go to it instead
    const lure = this.game.lure;
    if (lure && !this.boss && !this.idle) {
      const ld = (lure.x - this.x) ** 2 + (lure.z - this.z) ** 2;
      if (ld < lure.r * lure.r) { best = lure; bd = ld; }
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
    // a boss's special move takes over while it runs (boss.js)
    if (this.boss && best) {
      this.brain ??= new BossBrain(this);
      if (this.brain.think(dt, best, dist)) return;
    }
    // the special dead: their own move (it takes over the body while it runs)
    if (this.def.special && (this.pinPid || (best && !best.isLure))) { if (this.special(dt, best, dist)) return; }
    if (this.hasteT > 0) this.hasteT -= dt;
    // rescue: a body that has not got anywhere for 3 s is put back on the road
    this.stuckT = (this.stuckT || 0) + dt;
    if (this.stuckT > 3) {
      const moved = Math.hypot(this.x - (this.sx ?? this.x), this.z - (this.sz ?? this.z));
      this.sx = this.x; this.sz = this.z; this.stuckT = 0;
      // (only when nobody can see it: further than any screen reaches from every survivor - it used to vanish in plain sight)
      if (moved < 0.35 && dist > 18 && this.state === 'walk' && !this.wander && !this.idle && !this.boss) this.game.relocate(this);
    }
    let want = 0, dirx = 0, dirz = 0;
    if (best) {
      const tx = best.x - this.x, tz = best.z - this.z;
      if (dist < 5 || best.isLure) {
        // close: home in, approaching through a flanking slot
        const a = Math.atan2(tz, tx) + this.slot * Math.min(1, (dist - 1) / 4) * 0.5;
        dirx = Math.cos(a); dirz = Math.sin(a);
      } else {
        const f = this.game.world.nav.dir(this.x, this.z);
        if (f) { dirx = f.x; dirz = f.z; } else { dirx = tx / dist; dirz = tz / dist; }
      }
      want = this.speed * (this.enraged ? 1.45 : 1) * (this.hasteT > 0 ? 1.35 : 1);
      // a spitter keeps its distance; a screamer that has screamed backs off
      if (!best.isLure && ((this.type === 'spitter' && dist < this.def.spit.min) || (this.type === 'screamer' && this.screamed && dist < 9))) { dirx = -dirx; dirz = -dirz; want *= 0.85; }
      // the Butcher smells blood: a wounded survivor brings him on faster
      if (this.type === 'butcher' && best.hp < best.maxHp * 0.4) want *= 1.35;
      // a long way behind its prey (someone ran past it): it hurries, so a horde builds up on your heels
      // (but the hurry never makes it faster than a survivor can jog: it catches up at the gates, not in the open)
      if (dist > 12 && !this.boss) want = Math.max(want, Math.min(want * 1.3, 3.1));
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
    const reach = this.def.reach || ATTACK_RANGE, windup = (this.def.windup || WINDUP) * (this.overtime ? 0.68 : 1);
    if (this.state === 'walk' && best && !best.isLure && dist < reach) {
      this.setState('windup');
      this.game.emit({ k: 'windup', id: this.id });
    }
    if (this.state === 'windup') {
      want = 0.3;
      if (this.stateT > windup) {
        // (in the 2D fight the dead cannot climb: a survivor up on a platform is out of reach)
        if (best && dist < reach + 0.35 && (best.y2 || 0) < (this.boss ? 2.7 : 1.3)) {
          this.game.hurtPlayer(best, this.def.dmg * (this.enraged ? 1.25 : 1), this, this.type === 'butcher' ? 1.6 : undefined);
          this.game.speech?.hostLine(this, 'bite', this.boss ? 0.45 : 0.1);
        }
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
    const res = this.game.side?.active ? this.game.side.resolve(nx, nz) : this.game.world.col.resolve(nx, nz, 0.3);
    this.x = res.x; this.z = res.z;
  }

  setState(s) { this.state = s; this.stateT = 0; }

  // host: a special's move. Returns true while the move owns the body this frame.
  special(dt, best, dist) {
    const g = this.game, d = this.def;
    this.specT -= dt;
    const see = (p) => { const dd = Math.hypot(p.x - this.x, p.z - this.z) || 1; return g.world.col.ray(this.x, this.z, (p.x - this.x) / dd, (p.z - this.z) / dd, dd).d >= dd - 0.3; };
    const faceTo = (x, z) => { this.face = Math.atan2(x - this.x, z - this.z); };
    const ev = (o) => { const e = { k: 'zev', id: this.id, ...o }; g.emit(e); g.specials?.event(e); };
    if (this.type === 'spitter') {
      const S = d.spit;
      if (this.state === 'spit') {
        if (best) faceTo(best.x, best.z);
        if (this.stateT > 0.6 && !this.spat && best) {
          this.spat = true;
          // aim where they will be
          const lead = 0.6;
          const tx = best.x + (best.vx || 0) * lead, tz = best.z + (best.vz || 0) * lead;
          ev({ a: 'spit', x0: +this.x.toFixed(2), z0: +this.z.toFixed(2), x1: +tx.toFixed(2), z1: +tz.toFixed(2), dur: S.dur, r: S.r, life: S.life, dps: S.dps });
        }
        if (this.stateT > 1.0) this.setState('walk');
        return true;
      }
      if (this.state === 'walk' && this.specT <= 0 && best && dist > S.min * 0.7 && dist < S.max && see(best)) {
        this.specT = S.cd; this.spat = false; this.setState('spit'); ev({ a: 'spitwind' });
        return true;
      }
    } else if (this.type === 'screamer') {
      const S = d.scream;
      if (this.state === 'scream') {
        if (best) faceTo(best.x, best.z);
        if (this.stateT > 0.9 && !this.screamDone) {
          this.screamDone = true; this.screamed = true;
          ev({ a: 'scream', x: +this.x.toFixed(2), z: +this.z.toFixed(2) });
          for (const o of g.zombies.values()) {
            if (!o.alive || o === this) continue;
            const dd = (o.x - this.x) ** 2 + (o.z - this.z) ** 2;
            if (o.idle && dd < S.wake * S.wake) o.wake();
            if (dd < S.haste * S.haste) o.hasteT = 6;
          }
          for (let k = 0; k < S.adds; k++) g.spawnZombie('runner');
        }
        if (this.stateT > 1.8) this.setState('walk');
        return true;
      }
      if (this.state === 'walk' && this.specT <= 0 && best && dist < S.range && see(best)) {
        this.specT = S.cd; this.screamDone = false; this.setState('scream'); ev({ a: 'screamwind' });
        return true;
      }
    } else if (this.type === 'leaper') {
      const P = d.pounce;
      // on top of somebody: hold them down, chew; a friend's bullets (or the struggle) knock it off
      if (this.pinPid) {
        const p = g.players.get(this.pinPid);
        this.pinT += dt;
        if (!p || !p.alive || this.pinT > P.hold || this.pinHp0 - this.hp >= P.breakDmg || (this.pinStruggle || 0) >= 1) { this.unpin(); return true; }
        const bx = p.x - Math.sin(p.face) * 0.45, bz = p.z - Math.cos(p.face) * 0.45;
        this.x += (bx - this.x) * Math.min(1, dt * 12); this.z += (bz - this.z) * Math.min(1, dt * 12);
        faceTo(p.x, p.z);
        this.pinTick = (this.pinTick || 0) - dt;
        if (this.pinTick <= 0) { this.pinTick = 0.5; g.hurtPlayer(p, P.dps * 0.5, this, 0); }
        return true;
      }
      if (this.pounce) {
        const L = this.pounce;
        L.t += dt;
        const u = Math.min(1, L.t / L.dur);
        const res = g.world.col.resolve(L.x0 + (L.x1 - L.x0) * u, L.z0 + (L.z1 - L.z0) * u, 0.3);
        this.x = res.x; this.z = res.z;
        if (u >= 1) {
          this.pounce = null;
          // whoever it lands on is pinned
          let hit = null, hd = 1.5;
          for (const p of g.players.values()) { if (!p.alive || p.pinnedBy) continue; const dd = Math.hypot(p.x - this.x, p.z - this.z); if (dd < hd) { hd = dd; hit = p; } }
          if (hit) { this.pinPid = hit.id; this.pinT = 0; this.pinHp0 = this.hp; this.pinStruggle = 0; this.setState('walk'); ev({ a: 'pin', pid: hit.id, x: +hit.x.toFixed(2), z: +hit.z.toFixed(2) }); }
          else { this.staggerFor = 0.9; this.setState('stagger'); }
        }
        return true;
      }
      if (this.state === 'crouch') {
        if (best) faceTo(best.x, best.z);
        if (this.stateT > P.wind && best) {
          const dd = Math.hypot(best.x - this.x, best.z - this.z) || 1;
          const reach = Math.min(dd + 0.4, P.max + 1);
          const x1 = this.x + (best.x - this.x) / dd * reach, z1 = this.z + (best.z - this.z) / dd * reach;
          this.pounce = { x0: this.x, z0: this.z, x1, z1, t: 0, dur: P.dur };
          this.setState('walk');
          ev({ a: 'pounce', x0: +this.x.toFixed(2), z0: +this.z.toFixed(2), x1: +x1.toFixed(2), z1: +z1.toFixed(2), dur: P.dur });
        }
        return true;
      }
      if (this.state === 'walk' && this.specT <= 0 && best && !best.pinnedBy && dist > P.min && dist < P.max && see(best)) {
        this.specT = P.cd; this.setState('crouch'); ev({ a: 'crouch' });
        return true;
      }
    }
    return false;
  }

  // host: let go of whoever it had pinned (shot off, struggled off, or it died)
  unpin() {
    const g = this.game, pid = this.pinPid;
    if (!pid) return;
    this.pinPid = null;
    const e = { k: 'zev', id: this.id, a: 'unpin', pid };
    if (g.isHost) { g.emit(e); }
    g.specials?.event(e);
    if (this.alive) {
      const p = g.players.get(pid);
      if (p) { const dx = this.x - p.x, dz = this.z - p.z, l = Math.hypot(dx, dz) || 1; this.knock.x += dx / l * 9; this.knock.z += dz / l * 9; }
      this.staggerFor = 1.2; this.setState('stagger');
    }
  }

  // host: set it alight (everyone sees the flames through a zfx event)
  ignite(o, by) {
    if (!this.alive) return;
    const t = o.t * (this.boss ? 0.6 : 1);
    if (this.burn) { this.burn.t = Math.max(this.burn.t, t); this.burn.by = by; return; }
    this.burn = { dps: o.dps, t, t0: t, tick: 0.1, spread: o.spread || 0, by };
    this.burnT = t;
    this.game.netEvent({ k: 'zfx', id: this.id, f: 'b', t: +t.toFixed(1) });
  }

  wake() {
    if (!this.idle) return;
    this.idle = false;
    this.wander = null; this.home = null;
    this.game.speech?.hostLine(this, 'wake', 0.1);
    this.game.wakeNear?.(this);
  }

  // bullets (host applies; clients send hits to the host)
  damage(dmg, dirx, dirz, crit, byId, kmul = 1) {
    if (!this.alive) return false;
    this.wake();
    this.hitT = 0;
    if (byId) this.lastBy = byId;
    if (this.blocks(dirx, dirz) && !(crit && this.def.armor)) dmg *= this.def.shield ?? this.def.armor;     // the Warden's riot shield, a soldier's plates (a headshot goes round them)
    const before = this.hp / this.maxHp;
    this.hp -= dmg;
    if (this.boss && this.hp > 0) this.bossHurt(before, this.hp / this.maxHp);
    const kk = (this.def.knock ?? 1) * kmul;        // (a shotgun blast throws a body back: kmul > 1)
    this.knock.x += dirx * (crit ? 0.9 : 0.45) * 4 * kk;
    this.knock.z += dirz * (crit ? 0.9 : 0.45) * 4 * kk;
    if (this.hp <= 0) { this.die(dirx, dirz, crit); return true; }
    // a stagger meter: torso shots lose effect, but a run of hits staggers
    const sg = Math.min(1, (this.def.stagger ?? 1) * kmul);          // a brute almost never breaks stride
    this.staggerFor = 0.15 + Math.random() * 0.15;
    if ((this.state === 'walk' || this.state === 'recover') && Math.random() < sg) this.setState('stagger');
    if (this.state === 'windup' && Math.random() < 0.5 * sg) this.setState('stagger');
    return false;
  }

  // the Warden's shield turns bullets that hit her from the front (not while she is dazed or charging)
  blocks(dirx, dirz) {
    if (!(this.def.shield || this.def.armor) || (dirx === 0 && dirz === 0) || this.state === 'stagger' || this.charging > 0 || this.state === 'dead') return false;
    return dirx * Math.sin(this.face) + dirz * Math.cos(this.face) < -0.35;
  }

  // host: a boss crossing a health threshold
  bossHurt(before, now) {
    const g = this.game;
    for (const th of [0.66, 0.33]) if (before > th && now <= th) g.speech?.hostLine(this, 'hurt', 1);
    // the Foreman goes into overtime below half
    if (this.type === 'foreman' && !this.overtime && now < 0.5) {
      this.overtime = true;
      const e = { k: 'boss', a: 'overtime', id: this.id }; g.emit(e); g.bossFx.event(e);
      g.speech?.hostLine(this, 'overtime', 1);
    }
    // Omega mutates every quarter: bigger, faster
    if (this.type === 'omega') {
      const n = now < 0.25 ? 3 : now < 0.5 ? 2 : now < 0.75 ? 1 : 0;
      if (n > this.mut) {
        this.speed *= 1.08 ** (n - this.mut);
        const e = { k: 'boss', a: 'mutate', id: this.id, n }; g.emit(e); g.bossFx.event(e);
      }
    }
  }

  // ------------------------------------------------------------- visual --
  hitFx(dirx, dirz, crit) {
    // local frame: x = the zombie's left, z = forward
    const c = Math.cos(this.face), s = Math.sin(this.face);
    const lx = dirx * c - dirz * s, lz = dirx * s + dirz * c;
    if (this.blocks(dirx, dirz)) {
      // a bullet off the riot shield: sparks and a clang, no flinch
      const g = this.game, s = this.char.root.scale.x;
      const fx = Math.sin(this.face), fz = Math.cos(this.face);
      g.fx.hard(this.x + fx * 0.55 * s, 1.0 * s, this.z + fz * 0.55 * s, fx, fz, dirx, dirz);
      audio.play('hard', { x: this.x, z: this.z, vol: 0.55, rate: 1.4 + Math.random() * 0.3 });
      this.blockedT = 0.15;
      return;
    }
    this.anim.hit(new THREE.Vector3(lx, 0, lz), crit ? 1.6 : 1);
    this.flash = 1;
  }

  die(dirx, dirz, crit) {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.deadT = 0;
    this.hp = 0;
    this.game.speech?.hostLine(this, 'die', this.boss ? 1 : 0.05);
    if (this.def.pop) { this.game.specials?.burst(this.x, this.z, this.def.pop.r); if (this.game.isHost) bloaterBurstLater(this.game, this); }
    if (this.pinPid) this.unpin();
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
    // the wind-up: a boss draws it out (slow away from rest, quicker into the coil, then held trembling until the
    // blow); the horde just lunges
    this.windT = this.state === 'windup' ? (this.windT || 0) + dt : 0;
    if (this.boss && this.state === 'windup') { const u = Math.min(1, this.windT / 0.5); this.anim.attack = Math.max(this.anim.attack * (this.prevState === 'windup' ? 1 : 0), u * u * (3 - 2 * u)); }
    else this.anim.attack += ((this.state === 'windup' ? 1 : 0) - this.anim.attack) * Math.min(1, dt * (this.boss ? 4 : 10));
    // the blow lands: the swing follows through (rig.js runs the arc from here)
    if (this.prevState === 'windup' && this.state === 'recover') this.anim.strike = 1;
    this.prevState = this.state;
    if (this.state !== 'windup' && !this.anim.swinging && this.anim.strike < 0.05 && this.anim.attack < 0.1 && !(this.charging > 0)) this.anim.move = null;
    if (this.charging > 0) this.charging -= dt;
    this.anim.charge = Math.max(0, Math.min(1, this.charging > 0 ? 1 : this.anim.charge - dt * 3));
    this.anim.air = this.leap ? 1 : Math.max(0, this.anim.air - dt * 4);
    this.anim.leapU = this.leap ? Math.min(1, this.leap.t / this.leap.dur) : -1;
    // a boss's body turns to its new heading over a moment (the AI snaps `face` when it picks a target); the rate of
    // that turn is what it leans into
    if (this.boss) {
      if (this.vface === undefined) this.vface = this.face;
      let da = this.face - this.vface;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const step = da * Math.min(1, dt * (this.anim.chargeS > 0.3 ? 14 : 7));
      this.vface += step;
      this.anim.turn += ((dt > 0 ? step / dt : 0) - this.anim.turn) * Math.min(1, dt * 8);
    }
    this.anim.enraged = !!this.enraged;
    // Posing 27 bones is the single biggest cost of the horde, so only what you can see is posed every
    // frame: the dead beyond the screen edge every few frames, the long-dead not at all.
    const me = this.game.me;
    const d2 = me ? (this.x - me.x) ** 2 + (this.z - me.z) ** 2 : 0;
    this.adt = (this.adt || 0) + dt; this.amv = (this.amv || 0) + moved;
    this.lodN = (this.lodN || 0) + 1;
    const settled = this.state === 'dead' && this.deadT > 1.8;
    const pose = !settled && (d2 < 324 || this.lodN % (d2 > 676 ? 6 : 2) === 0);
    if (pose) {
      const sc = this.char.root.scale.x || 1;      // the gait is in the body's own units
      this.anim.update(this.adt, Math.min(this.amv, 0.2 * (this.adt / Math.max(dt, 1e-3))) / sc, this.adt > 0 ? this.amv / this.adt / sc : 0);
      this.adt = 0; this.amv = 0;
    }
    this.flash = Math.max(0, this.flash - dt / 0.08);
    this.char.material.userData.uniforms.uFlash.value = this.flash;
    // burning: flames licking up the body, a char tint; shocked: blue crackle
    const g = this.game;
    if (this.burnT > 0) {
      this.burnT -= dt;
      const sc = this.char.root.scale.x, gy = g.world.groundY(this.x, this.z);
      const n = this.alive ? 2 : 1;
      for (let i = 0; i < n; i++) if (Math.random() < dt * 22) {
        g.fx.fire.emit({ x: this.x + (Math.random() - 0.5) * 0.45 * sc, y: gy + (0.3 + Math.random() * 1.2) * sc, z: this.z + (Math.random() - 0.5) * 0.45 * sc, vx: (Math.random() - 0.5) * 0.4, vy: 1.4 + Math.random(), vz: (Math.random() - 0.5) * 0.4, life: 0.35 + Math.random() * 0.25, s0: 0.42 * sc, s1: 0.06, r: 1, g: 0.42 + Math.random() * 0.25, b: 0.1, a0: 0.85, a1: 0 });
      }
      if (Math.random() < dt * 5) g.fx.smoke.emit({ x: this.x, y: gy + 1.7 * sc, z: this.z, vx: 0, vy: 1.0, vz: 0, life: 1.6, s0: 0.3, s1: 1.4, r: 0.08, g: 0.07, b: 0.07, a0: 0.35, a1: 0, drag: 0.6 });
      const t = this.char.material.userData.uniforms.uTint.value;
      t.multiplyScalar(1 - Math.min(0.5, dt * 0.25));
      if (t.r < 0.45) t.setRGB(0.45, 0.42, 0.4);
    }
    if (this.shockT > 0) {
      this.shockT -= dt;
      if (Math.random() < dt * 14) {
        const sc = this.char.root.scale.x, gy = g.world.groundY(this.x, this.z), y0 = gy + (0.5 + Math.random()) * sc;
        g.fx.bolt(this.x + (Math.random() - 0.5) * 0.5, y0, this.z + (Math.random() - 0.5) * 0.5, this.x + (Math.random() - 0.5) * 0.7, y0 + (Math.random() - 0.3) * 0.6, this.z + (Math.random() - 0.5) * 0.7, undefined, 0.08);
      }
      this.anim.hit(_sv.set((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3), 0.15);
    }
    // the fall: pivot at the feet, onto the ground over ~0.6 s
    const root = this.char.root;
    if (this.state === 'dead') {
      let k, bounce;
      if (this.boss) {
        // on its knees first (rig.js), then the whole bulk topples, gathering speed, and lands with a jolt
        this.fallT = (this.fallT || 0) + dt;
        const f = Math.max(0, Math.min(1, (this.fallT - 0.45) / 0.8));
        const was = this.fall;
        this.fall = f;
        k = f * f * (1.6 - 0.6 * f);
        bounce = f >= 1 ? Math.max(0, Math.sin(Math.min(1, (this.fallT - 1.25) / 0.35) * Math.PI)) * 0.06 * Math.max(0, 1 - (this.fallT - 1.25) / 0.35) : 0;
        if (was < 1 && f >= 1) this.game.bossFx?.thud?.(this);
      } else {
        this.fall = Math.min(1, this.fall + dt / 0.6);
        k = this.fall < 1 ? (1 - Math.pow(1 - this.fall, 2.4)) : 1;
        bounce = this.fall >= 1 ? 0 : Math.sin(Math.max(0, this.fall - 0.8) / 0.2 * Math.PI) * 0.04;
      }
      const d = this.anim.deathDir;
      root.rotation.set(d * (k * (this.boss ? 1.4 : 1.45) - bounce), this.boss ? (this.vface ?? this.face) : this.face, 0, 'YXZ');
      root.position.set(this.x, this.game.world.groundY(this.x, this.z) + 0.02 + k * 0.08, this.z);
      if (this.deadT > 30) { this.sunk += dt * 0.05; root.position.y -= this.sunk; }
      this.kit?.update(dt);
      return;
    }
    let y = this.game.side?.active ? 0 : this.game.world.groundY(this.x, this.z);
    if (this.leap) {
      // the Foreman's leap: every machine flies the same arc (the host moves him along the ground)
      const lp = this.leap;
      lp.t += dt;
      const u = Math.min(1, lp.t / lp.dur);
      y += 4 * (lp.h ?? 2.6) * u * (1 - u);
      if (u >= 1) this.leap = null;
    }
    root.position.set(this.x, y, this.z);
    root.rotation.set(0, this.boss ? this.vface : this.face, 0);
    this.kit?.update(dt);
  }

  dispose() {
    this.kit?.dispose();
    this.game.scene.remove(this.char.root);
    this.char.material.dispose();
  }
}
