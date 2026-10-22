// Procedural animation on the 27-bone rig built by tools/blender.
//
// Every rotation is expressed about an axis in the CHARACTER's rest frame
// (x = the character's left, y = up, z = forward), converted once into each
// bone's local frame. That makes poses readable ("swing the thigh forward
// about x") and immune to bone roll. Rotations on one bone are applied
// outermost-last: q = rest * R(a_n) ... R(a_1).
//
// Research brief (design/research.md) numbers used here: zombie spine
// forward 15-30°, head forward and tilted 10-25°, one shoulder low, one arm
// reaching and one dangling; uneven step lengths and one dragged foot;
// gait phase advanced by distance travelled so feet never skate; random
// phase and time scale per zombie; twitches every 2-7 s.
import * as THREE from 'three';

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const TAU = Math.PI * 2;

// a critically-damped-ish spring for secondary motion
export class Spring {
  constructor(k = 120, d = 14) { this.x = 0; this.v = 0; this.k = k; this.d = d; this.target = 0; }
  kick(v) { this.v += v; }
  step(dt) {
    const a = -this.k * (this.x - this.target) - this.d * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

export class Rig {
  constructor(char) {
    this.c = char;
    this.b = char.bones;
    this.rest = {};
    // rest local quats and each bone's rest world rotation relative to the root
    char.root.updateMatrixWorld(true);
    const rootInv = new THREE.Quaternion();
    char.root.getWorldQuaternion(rootInv).invert();
    for (const [n, bone] of Object.entries(this.b)) {
      const wq = new THREE.Quaternion();
      bone.getWorldQuaternion(wq);
      wq.premultiply(rootInv);
      const inv = wq.clone().invert();
      // the three canonical axes expressed in this bone's frame, once (apply() runs for every body every frame)
      const ax = [X, Y, Z].map((a) => a.clone().applyQuaternion(inv));
      this.rest[n] = { local: bone.quaternion.clone(), world: wq, inv, pos: bone.position.clone(), ax };
      bone.quaternion._onChange(() => {});    // nothing reads a bone's Euler angles: skip keeping them in sync
    }
    this.hipsY = this.b.root ? this.b.root.position.y : 0;
    // the leg's bone lengths (the boss's kneel lowers the hips by the shin)
    this.shinLen = this.rest.foot_L ? this.rest.foot_L.pos.length() : 0.42;
    this.thighLen = this.rest.shin_L ? this.rest.shin_L.pos.length() : 0.44;
    // a touch of cartoon in the proportions: heads and hands ~10% larger
    if (this.b.head) this.b.head.scale.setScalar(1.22);
    for (const h of ['hand_L', 'hand_R']) if (this.b[h]) this.b[h].scale.setScalar(1.16);
    this.pending = {};
  }

  // queue a rotation about a character-space axis
  rot(name, axis, angle) {
    if (!angle || !this.b[name]) return;
    (this.pending[name] ||= []).push([axis, angle]);
  }

  apply() {
    for (const [n, bone] of Object.entries(this.b)) {
      const r = this.rest[n];
      bone.quaternion.copy(r.local);
      const list = this.pending[n];
      if (!list) continue;
      // rest * R(last) * ... * R(first): build the right-hand product
      _q2.identity();
      for (let i = list.length - 1; i >= 0; i--) {
        const [axis, ang] = list[i];
        const ci = axis === X ? 0 : axis === Y ? 1 : axis === Z ? 2 : -1;
        _q.setFromAxisAngle(ci >= 0 ? r.ax[ci] : _v.copy(axis).applyQuaternion(r.inv), ang);
        _q2.multiply(_q);
      }
      // the list is in application order (first applied first)
      bone.quaternion.multiply(_q2);
      list.length = 0;
    }
  }

  setHips(dx, dy, dz) {
    const b = this.b.root;
    if (!b) return;
    const r = this.rest.root;
    b.position.set(r.pos.x + dx, r.pos.y + dy, r.pos.z + dz);
  }
}

// ---------------------------------------------------------------- shared --
// Bring the A-pose arms down to the sides (left arm is +x).
function armsDown(rig, amt, s = 1) {
  rig.rot('upperarm_L', Z, -0.82 * amt * s);
  rig.rot('upperarm_R', Z, 0.82 * amt * s);
}

function legCycle(rig, side, ph, o) {
  // ph 0..1 for this leg; 0 = heel strike forward, 0.5 = push-off behind
  const s = Math.sin(ph * TAU);
  const c = Math.cos(ph * TAU);
  const swingPhase = ph > 0.5 ? (ph - 0.5) * 2 : 0;    // 0..1 while the foot is in the air
  const lift = Math.sin(swingPhase * Math.PI);
  const thigh = -c * o.stride - o.lean * 0.4;
  const knee = lift * o.knee + o.bend;
  const foot = -thigh * 0.6 - knee * 0.5 + lift * 0.2;
  rig.rot(`thigh_${side}`, o.axis, thigh);
  // the knee and ankle are hinges: they only ever bend about the body's own side-to-side axis, whichever way the leg swings
  rig.rot(`shin_${side}`, X, knee);
  rig.rot(`foot_${side}`, X, o.axis === X ? foot : -knee * 0.5 + lift * 0.2);
  return { lift, s };
}

// ---------------------------------------------------------------- zombie --
export class ZombieAnim {
  constructor(rig, seed, kind = 'shambler') {
    this.rig = rig;
    this.kind = kind;
    const r = mulberry(seed);
    this.r = r;
    this.p = {
      lean: 0.4 + r() * 0.3,           // spine forward, radians
      headTilt: (r() < 0.5 ? -1 : 1) * (0.18 + r() * 0.25),
      headFwd: 0.2 + r() * 0.25,
      reach: r() < 0.65 ? (r() < 0.5 ? 'L' : 'R') : (r() < 0.4 ? 'both' : 'none'),
      reachAmt: 0.7 + r() * 0.5,
      limp: r() < 0.55 ? (r() < 0.5 ? 'L' : 'R') : null,
      shoulderDrop: (r() - 0.5) * 0.35,
      stride: 0.28 + r() * 0.12,
      timeScale: 0.85 + r() * 0.3,
      sway: 0.08 + r() * 0.08,
      jaw: 0.1 + r() * 0.2,
    };
    if (kind === 'runner') {            // head down, arms pumping, a long ragged stride
      this.p.lean = 0.55 + r() * 0.15; this.p.stride = 0.5; this.p.reach = 'none';
      this.p.timeScale = 1.25 + r() * 0.2; this.p.limp = null; this.p.sway = 0.04;
    } else if (kind === 'lurcher') { this.p.lean += 0.1; }
    else if (kind === 'brute') {        // a heavy, deliberate walk, both arms hanging forward
      this.p.lean = 0.3 + r() * 0.1; this.p.stride = 0.36; this.p.reach = 'both'; this.p.reachAmt = 0.6;
      this.p.timeScale = 0.62 + r() * 0.1; this.p.limp = null; this.p.sway = 0.14; this.p.shoulderDrop = 0.1;
    }
    else if (kind === 'bloater') {      // a swollen waddle: upright, rolling side to side, short steps
      this.p.lean = 0.05 + r() * 0.08; this.p.stride = 0.22; this.p.reach = 'none'; this.p.timeScale = 0.6 + r() * 0.1;
      this.p.sway = 0.2; this.p.limp = null; this.p.headFwd = 0.05; this.p.jaw = 0.25;
    } else if (kind === 'screamer') {   // light, twitchy, head lolling, arms loose
      this.p.lean = 0.25 + r() * 0.15; this.p.reach = 'none'; this.p.headTilt *= 1.4; this.p.timeScale = 1.1;
    } else if (kind === 'spitter') {    // bent forward, the swollen throat leading
      this.p.lean = 0.55 + r() * 0.1; this.p.headFwd = 0.5; this.p.reach = 'none'; this.p.jaw = 0.35; this.p.stride = 0.32;
    } else if (kind === 'leaper') {     // low and long, knuckles near the floor, like something that hunts
      this.p.lean = 0.85; this.p.stride = 0.46; this.p.reach = 'none'; this.p.limp = null; this.p.timeScale = 1.2; this.p.sway = 0.05; this.p.headFwd = -0.1;
    } else if (kind === 'soldier') {    // still almost upright, arms up as if the rifle were still there
      this.p.lean = 0.15; this.p.stride = 0.34; this.p.reach = 'none'; this.p.limp = r() < 0.3 ? 'R' : null; this.p.sway = 0.05; this.p.headTilt *= 0.5;
    }
    // the five bosses each move their own way (BOSS_STYLE below)
    this.style = BOSS_STYLE[kind] || null;
    if (this.style) this.style.init(this.p, r);
    this.strike = 0;       // 1 the moment a blow lands, decays (the follow-through of a swing)
    this.move = null;      // a boss's special move being wound up ('bile', 'cleaver', 'leap', 'charge', 'scream')
    this.moveT = 0;
    this.charge = 0;       // >0 while charging
    this.air = 0;          // >0 while leaping
    this.throwT = 0;       // the Butcher's throw
    this.roar = 0;         // Omega's scream
    this.enraged = false;
    this.stepEv = 0;       // +1 each time a foot lands (the Foreman's stomp reads it)
    // the swing: when something sets strike = 1 a timeline runs - the raised weapon ACCELERATES through an arc to the
    // impact pose (sw 0..1), overshoots past it (over, the follow-through) and only then eases back (strike 1 -> 0)
    this.st = null; this.sw = 0; this.over = 0; this.aHold = 0; this.swinging = false;
    this.roarS = 0;        // the scream, eased in (it used to snap fully open in one frame)
    this.chargeS = 0;      // the charge, eased in: the walk opens into a run
    this.leapU = -1;       // the Foreman's leap: 0..1 along the arc while he is in the air
    this.preK = 0;         // how far a swing has already come down before its blow lands
    this.turn = 0;         // how fast the body is turning (rad/s): a boss leans into it
    this.hipX = 0; this.hipY = 0; this.hipZ = 0;
    this.phase = r();
    this.t = r() * 10;
    this.twitchT = 1 + r() * 4;
    this.springs = {
      headX: new Spring(90, 9), headZ: new Spring(90, 9), shoulder: new Spring(70, 8),
      spineX: new Spring(60, 10), spineY: new Spring(60, 10), armL: new Spring(50, 6), armR: new Spring(50, 6),
    };
    this.attack = 0;       // 0..1 lunge/grab pose
    this.lurch = 0;
    this.dead = 0;         // 0 alive, >0 seconds since death
    this.deathDir = 1;
  }

  hit(localDir, strength = 1) {
    // localDir: hit direction in the zombie's frame (x left, z forward)
    const S = this.springs;
    S.spineX.kick(-localDir.z * 6 * strength);
    S.spineY.kick(localDir.x * 8 * strength);
    S.headX.kick(-localDir.z * 14 * strength);
    S.headZ.kick((this.r() - 0.5) * 12 * strength);
    S.shoulder.kick((this.r() - 0.5) * 10 * strength);
    S.armL.kick((this.r() - 0.3) * 8);
    S.armR.kick((this.r() - 0.3) * 8);
  }

  doLurch() { this.lurch = 1; this.springs.spineX.kick(5); this.springs.headX.kick(6); }

  update(dt, moved, speed) {
    const rig = this.rig;
    const p = this.p;
    const S = this.springs;
    this.t += dt * p.timeScale;
    // twitches
    this.twitchT -= dt;
    if (this.twitchT < 0) {
      this.twitchT = 2 + this.r() * 5;
      const k = this.r();
      if (k < 0.4) S.headZ.kick((this.r() - 0.5) * 28);
      else if (k < 0.7) S.shoulder.kick((this.r() - 0.5) * 20);
      else S.headX.kick(-10 - this.r() * 10);
    }
    for (const s of Object.values(S)) s.step(dt);
    this.lurch = Math.max(0, this.lurch - dt * 2.5);
    // (a swing already brought down in the air, the Foreman's, picks up at the impact instead of starting over)
    if (this.strike >= 1) { this.st = this.preK > 0.5 ? (this.style?.swingT ?? 0.13) : 0; this.aHold = Math.max(this.attack, 0.6); this.strike = 0.999; this.preK = 0; }
    if (this.st !== null) {
      this.st += dt;
      const SW = this.style?.swingT ?? 0.13, REC = this.style?.recT ?? 0.7;
      const u = Math.min(1, this.st / SW);
      this.sw = u * u;                                                   // slow out of the hold, fast into the hit
      const rec = smooth(Math.max(0, Math.min(1, (this.st - SW - 0.18) / REC)));
      this.attack = Math.min(this.attack, this.aHold * (1 - this.sw));
      this.strike = Math.min(0.999, this.sw * (1 - rec));    // (never 1: that is the trigger)
      const o = (this.st - SW) / 0.3;
      this.over = o > 0 && o < 1 ? Math.sin(o * Math.PI) * (1 - rec) : 0;
      if (rec >= 1) { this.st = null; this.strike = 0; this.over = 0; this.sw = 0; }
    } else { this.strike = Math.max(0, this.strike - dt * 2.6); this.over = 0; }
    this.swinging = this.st !== null;
    this.roarS += (Math.min(1, this.roar * 1.6) - this.roarS) * Math.min(1, dt * 7);
    this.chargeS += (Math.min(1, this.charge) - this.chargeS) * Math.min(1, dt * 6);
    this.throwT = Math.max(0, this.throwT - dt * 1.7);
    this.roar = Math.max(0, this.roar - dt * 0.8);
    this.moveT += dt;
    if (this.style?.tick) this.style.tick(this, dt);

    if (this.dead > 0) { if (this.style) this.updateBossDeath(dt); else this.updateDeath(dt); return; }

    // gait phase advances by distance: one cycle = two steps (moved is in the body's own units: zombie.js divides by
    // its scale, or a 1.8x boss would take a normal man's steps and his feet would skate). A charging boss runs: a
    // longer stride, so the legs open up instead of spinning faster.
    const run = this.style ? this.chargeS : 0;
    const strideE = p.stride * (1 + 0.85 * run);
    const cycleLen = 1.05 * (strideE / 0.33);
    const ph0 = this.phase;
    this.phase = (this.phase + moved / cycleLen) % 1;
    if (moved > 0 && (Math.floor(ph0 * 2) !== Math.floor(this.phase * 2))) this.stepEv++;
    const walk = Math.min(1, speed / 0.5);
    const ph = this.phase;
    const lean = p.lean + this.lurch * 0.35 + this.attack * 0.25 + 0.3 * run;

    // limp: the bad leg's step is shorter and the foot drags
    const sl = this.style?.legs;
    const o = { stride: strideE * walk, knee: 0.9 * walk * (sl?.knee ?? 1) * (1 + 0.55 * run), bend: sl?.bend ?? 0.12, lean, axis: X };
    let phL = ph, phR = (ph + 0.5) % 1;
    const aL = legCycle(rig, 'L', phL, p.limp === 'L' ? { ...o, stride: o.stride * 0.55, knee: o.knee * 0.25 } : o);
    const aR = legCycle(rig, 'R', phR, p.limp === 'R' ? { ...o, stride: o.stride * 0.55, knee: o.knee * 0.25 } : o);
    // body: drop on the bad leg, bob, sway
    const bob = -Math.abs(Math.cos(ph * TAU)) * 0.035 * walk;
    const limpDrop = p.limp ? (p.limp === 'L' ? Math.max(0, -Math.cos(phL * TAU)) : Math.max(0, -Math.cos(phR * TAU))) * 0.04 * walk : 0;
    this.hipX = 0; this.hipY = bob * (p.bob ?? 1) - limpDrop - 0.03 - this.attack * 0.04; this.hipZ = 0;
    // a heavy body rides over the standing leg
    if (this.style) this.hipX = Math.sin(ph * TAU) * (p.shift ?? 0.025) * walk;
    const sway = Math.sin(ph * TAU) * p.sway * (0.5 + walk);
    rig.rot('root', Z, sway * 0.4);
    rig.rot('root', Y, Math.sin(ph * TAU) * 0.12 * walk);
    // spine: hunched, twisting against the hips, lurching
    const sX = lean + S.spineX.x * 0.05;
    rig.rot('spine04', X, sX * 0.3);
    rig.rot('spine03', X, sX * 0.3);
    rig.rot('spine02', X, sX * 0.25);
    rig.rot('spine01', X, sX * 0.15);
    rig.rot('spine03', Y, -Math.sin(ph * TAU) * 0.14 * walk + S.spineY.x * 0.04);
    rig.rot('spine02', Z, -sway * 0.6);
    // shoulders: one dropped
    rig.rot('clavicle_L', Z, p.shoulderDrop - S.shoulder.x * 0.03);
    rig.rot('clavicle_R', Z, p.shoulderDrop - S.shoulder.x * 0.03);
    // head: pushed forward, lolling, out of phase with the body
    const loll = Math.sin(this.t * 1.3 + 1) * 0.08 + Math.sin(ph * TAU * 2 + 0.7) * 0.06 * walk;
    rig.rot('neck', X, p.headFwd * 0.6 - lean * 0.5);
    rig.rot('head', X, -p.headFwd * 0.2 + S.headX.x * 0.04 + this.attack * -0.3);
    rig.rot('head', Z, p.headTilt + loll + S.headZ.x * 0.04);
    rig.rot('jaw', X, -(p.jaw + Math.max(0, Math.sin(this.t * 2.1)) * 0.12 + this.attack * 0.45));
    // arms
    const armSwing = (side) => Math.sin((side === 'L' ? phR : phL) * TAU) * (this.kind === 'runner' ? 0.9 : 0.25) * walk;
    if (this.style) { this.style.pose(this, { ph, phL, phR, walk, lean, aL, aR, run }); this.bossBody(); }
    else if (!SPECIAL_POSE[this.kind]) for (const side of ['L', 'R']) {
      const sg = side === 'L' ? 1 : -1;
      const reaching = p.reach === 'both' || p.reach === side;
      const spring = side === 'L' ? S.armL.x : S.armR.x;
      rig.rot(`upperarm_${side}`, Z, -sg * 0.78);         // down from the A-pose
      if (reaching || this.attack > 0) {
        const amt = Math.max(reaching ? p.reachAmt : 0, this.attack * 1.25);
        const wob = Math.sin(this.t * 2.3 + sg) * 0.08;
        rig.rot(`upperarm_${side}`, X, -(1.0 * amt) + lean * 0.6 + wob + spring * 0.03);
        rig.rot(`upperarm_${side}`, Y, sg * -0.06 * amt);
        rig.rot(`forearm_${side}`, X, -0.12 * amt);
        rig.rot(`hand_${side}`, X, 0.3 * amt);
        rig.rot(`fingers_${side}`, X, 0.5);
      } else {
        // dead weight: a pendulum swing that lags the body
        rig.rot(`upperarm_${side}`, X, armSwing(side) + spring * 0.04 + lean * 0.5);
        rig.rot(`forearm_${side}`, X, -0.15 - Math.max(0, armSwing(side)) * 0.3);
        rig.rot(`fingers_${side}`, X, 0.35);
      }
    }
    SPECIAL_POSE[this.kind]?.(this, { ph, phL, phR, walk, lean });
    rig.setHips(this.hipX, this.hipY, this.hipZ);
    rig.apply();
  }

  // What every boss's body does around its blows, whatever it holds: it LOADS into the wind-up (sinks, knees giving,
  // the chest drawn back, a tremble at the top), drives forward through the swing, and leans into its turns.
  bossBody() {
    const rig = this.rig, A = this.attack, K = this.strike, O = this.over;
    const load = this.style.load ?? 1;
    const sink = (0.7 * A + K) * load;
    this.hipY -= 0.075 * sink;
    for (const sd of ['L', 'R']) { rig.rot(`thigh_${sd}`, X, -0.24 * sink); rig.rot(`shin_${sd}`, X, 0.46 * sink); rig.rot(`foot_${sd}`, X, -0.22 * sink); }
    rig.rot('spine02', X, (-0.12 * A + 0.2 * K + 0.14 * O) * load);
    if (A > 0.8 && !this.swinging) { const tr = (A - 0.8) / 0.2 * Math.sin(this.t * 47) * 0.03; rig.rot('spine03', Y, tr); rig.rot('head', Z, tr * 0.7); }
    const tl = Math.max(-1, Math.min(1, this.turn / 3));
    rig.rot('root', Z, -0.09 * tl);
    rig.rot('neck', Y, 0.16 * tl);
  }

  // A boss does not fold like a man: the knees go first and he drops onto them (the hips fall by a shin's length),
  // slumps, and then the whole bulk topples (zombie.js tips the root over the knees after ~0.45 s).
  updateBossDeath(dt) {
    const rig = this.rig;
    this.dead += dt;
    const kn = smooth(Math.min(1, this.dead / 0.42));
    const slump = smooth(Math.max(0, Math.min(1, (this.dead - 0.25) / 0.6)));
    const d = this.deathDir;
    for (const sd of ['L', 'R']) {
      rig.rot(`thigh_${sd}`, X, -0.12 * kn);
      rig.rot(`shin_${sd}`, X, 1.62 * kn);
      rig.rot(`foot_${sd}`, X, -0.75 * kn);
    }
    rig.setHips(0, -rig.shinLen * 0.92 * kn, -0.05 * kn);
    rig.rot('spine03', X, (0.2 + 0.25 * d) * slump);
    rig.rot('spine02', X, (0.15 + 0.2 * d) * slump);
    rig.rot('neck', X, 0.45 * slump);
    rig.rot('head', Z, this.p.headTilt * 1.4 * slump);
    rig.rot('jaw', X, -0.5);
    const flop = this.p.flop ??= [this.r() * 0.9, this.r() * 0.9, this.r() * 1.2, this.r() * 1.2];
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? 1 : -1, i = side === 'L' ? 0 : 1;
      rig.rot(`upperarm_${side}`, Z, -sg * (0.82 - slump * flop[i] * 0.5));
      rig.rot(`upperarm_${side}`, X, -0.25 * kn - flop[i] * 0.5 * slump * d);
      rig.rot(`forearm_${side}`, X, -0.3 - flop[i + 2] * 0.6 * slump);
      rig.rot(`fingers_${side}`, X, 0.6);
    }
    rig.apply();
  }

  updateDeath(dt) {
    // knees go, the body folds the way the bullet pushed it
    const rig = this.rig;
    this.dead += dt;
    const t = Math.min(1, this.dead / 0.65);
    const knees = Math.min(1, this.dead / 0.18);
    const k = 1 - Math.pow(1 - t, 2.2);
    const d = this.deathDir;
    rig.rot('thigh_L', X, -0.9 * knees * (d > 0 ? 1 : 0.4));
    rig.rot('thigh_R', X, -0.7 * knees * (d > 0 ? 1 : 0.4));
    rig.rot('shin_L', X, 1.3 * knees * (1 - k * 0.6));
    rig.rot('shin_R', X, 1.1 * knees * (1 - k * 0.6));
    rig.rot('spine03', X, 0.25 * k * d);
    rig.rot('spine02', X, 0.2 * k * d);
    rig.rot('neck', X, 0.3 * k);
    rig.rot('head', Z, this.p.headTilt * 1.6);
    rig.rot('jaw', X, -0.4);
    // arms go limp: down to the sides first, then flopping out as the body lands
    const flop = this.p.flop ??= [this.r() * 0.9, this.r() * 0.9, this.r() * 1.2, this.r() * 1.2];
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? 1 : -1;
      const i = side === 'L' ? 0 : 1;
      rig.rot(`upperarm_${side}`, Z, -sg * (0.8 - k * flop[i] * 0.6));
      rig.rot(`upperarm_${side}`, X, (-0.3 - flop[i] * 0.4) * k * d);
      rig.rot(`forearm_${side}`, X, -flop[i + 2] * k);
      rig.rot(`forearm_${side}`, Y, sg * 0.4 * k);
      rig.rot(`fingers_${side}`, X, 0.7);
    }
    rig.setHips(0, -0.05 * knees, 0);
    rig.apply();
    return k;
  }
}

// ------------------------------------------------------------ the bosses --
// Each boss has its own body language on top of the shared zombie gait: what the arms do (all of it), how the legs
// lift, how it holds its weapon, and how it winds up and lands its blows. Inputs set by the zombie (zombie.js) and the
// boss's moves (boss.js): attack (0..1 the wind-up), strike (1 when the blow lands), move (which special is coming),
// charge, air, throwT, roar, enraged.
const smooth = (x) => x * x * (3 - 2 * x);
const pulse = (t, period, width) => { const u = (t % period) / width; return u < 1 ? Math.sin(u * Math.PI) : 0; };

// one arm, written as: lower it from the A-pose, swing it forward (-) or back (+), turn it in or out, bend the elbow
function arm(rig, side, { down = 0.78, fwd = 0, twist = 0, elbow = 0, wrist = 0, fist = 0.4, elbowY = 0 }) {
  const sg = side === 'L' ? 1 : -1;
  rig.rot(`upperarm_${side}`, Z, -sg * down);
  rig.rot(`upperarm_${side}`, X, fwd);
  rig.rot(`upperarm_${side}`, Y, sg * twist);
  rig.rot(`forearm_${side}`, X, -elbow);
  rig.rot(`forearm_${side}`, Y, sg * elbowY);
  rig.rot(`hand_${side}`, X, wrist);
  rig.rot(`fingers_${side}`, X, fist);
}

// a two-handed overhead swing: raise -> hold -> chop through
function chop(a) { return -2.7 * a.attack * (1 - a.strike) - 0.55 * a.strike - 0.45 * (a.over || 0); }

export const BOSS_STYLE = {
  // THE WARDEN: a riot cop who still walks the beat. Upright, a stiff measured march with the knees lifting, the
  // shield held across the body on the left forearm, the baton low in the right hand tapping the shield as he comes.
  // The swing is an overhead baton blow; the charge is head down behind the shield.
  warden: {
    legs: { knee: 1.2, bend: 0.1 },
    swingT: 0.11, recT: 0.6,
    init(p) { p.lean = 0.12; p.headFwd = 0.08; p.headTilt *= 0.25; p.stride = 0.36; p.timeScale = 0.72; p.limp = null; p.sway = 0.05; p.jaw = 0.08; p.shoulderDrop = 0; p.bob = 1.3; p.shift = 0.022; },
    pose(a, g) {
      const rig = a.rig, A = a.attack, K = a.strike, C = a.chargeS;
      // the charge is SET first: down low behind the shield, the back foot dug in, the head tucked
      const set = a.move === 'charge' ? A : 0;
      a.hipY -= 0.12 * set;
      rig.rot('thigh_L', X, -0.55 * set); rig.rot('shin_L', X, 0.7 * set); rig.rot('foot_L', X, -0.2 * set);
      rig.rot('thigh_R', X, 0.25 * set); rig.rot('shin_R', X, 0.55 * set); rig.rot('foot_R', X, -0.4 * set);
      rig.rot('spine03', X, 0.25 * C + 0.35 * set);
      rig.rot('spine02', X, 0.15 * set);
      rig.rot('neck', X, 0.3 * C + 0.2 * set);
      rig.rot('spine03', Y, 0.3 * set);
      // shield arm: forearm across the chest, raised higher in the charge
      // the shield hangs at her side from the left hand while she walks (so her face, hair and uniform show), and comes
      // up across her chest for the charge and the set
      const up = Math.max(C, set);
      arm(rig, 'L', { down: 0.84 - 0.14 * up, fwd: -0.12 - 0.98 * up + Math.sin(g.phR * Math.PI * 2) * 0.1 * g.walk * (1 - up), twist: -0.05 - 0.5 * up, elbow: 0.35 + 1.1 * up, elbowY: 0.5 * up, wrist: -0.2, fist: 1.1 });
      // baton arm: low and forward; a tap on the shield every few seconds; an overhead blow
      const tap = pulse(a.t, 3.6, 0.5) * (1 - A) * (1 - C);
      if (set > 0) { arm(rig, 'R', { down: 0.75, fwd: 0.35 * set - 0.25 * (1 - set), twist: 0, elbow: 0.9, fist: 1.2 }); rig.rot('spine03', Y, 0.35 * K); return; }
      arm(rig, 'R', { down: 0.75, fwd: -0.25 + Math.sin(g.phL * Math.PI * 2) * 0.12 * g.walk - 0.7 * tap + chop(a) * 0.95, twist: -0.6 * tap + 0.15 * A, elbow: 0.55 + 0.6 * tap - 0.3 * A, fist: 1.2 });
      rig.rot('spine03', Y, -0.25 * A + 0.35 * K);
    },
  },

  // PATIENT ZERO: tall, starved, bent nearly double. One hand on the IV pole he rolls along beside him, the other arm
  // swinging dead, the left foot dragging, and every few seconds a violent spasm runs through him. The bile is
  // brought up from the gut: he arches back with his mouth wide, then heaves forward.
  patientzero: {
    legs: { knee: 0.7, bend: 0.18 },
    swingT: 0.16, recT: 0.85,
    init(p, r) { p.bob = 1.0; p.shift = 0.03; p.lean = 0.72; p.headFwd = 0.5; p.headTilt = 0.38; p.stride = 0.3; p.timeScale = 0.66; p.limp = 'L'; p.sway = 0.13; p.jaw = 0.32; p.shoulderDrop = 0.2; p.spasmT = 1 + r() * 2; },
    tick(a, dt) {
      const p = a.p;
      p.spasmT -= dt;
      if (p.spasmT < 0) {
        p.spasmT = 1.2 + a.r() * 2.6;
        a.springs.spineY.kick((a.r() - 0.5) * 60);
        a.springs.headZ.kick((a.r() - 0.5) * 70);
        a.springs.shoulder.kick((a.r() - 0.5) * 50);
        a.springs.armL.kick(30);
      }
    },
    pose(a, g) {
      const rig = a.rig, A = a.attack, K = a.strike;
      const bile = a.move === 'bile' ? 1 : 0;
      // the retch: arch back, head thrown back, jaw wide; then the heave forward
      rig.rot('spine03', X, -0.7 * A * bile + 0.45 * K * bile);
      rig.rot('spine02', X, -0.4 * A * bile);
      rig.rot('neck', X, -0.7 * A * bile + 0.4 * K * bile);
      rig.rot('jaw', X, -0.9 * Math.max(A * bile, K * bile));
      // the pole hand at chest height out to the right
      arm(rig, 'R', { down: 0.5, fwd: -0.55 + g.lean * 0.35, twist: 0.1, elbow: 1.05, wrist: 0.25, fist: 1.25 });
      // the free arm: long and dead, a lagging pendulum, a claw swipe for the bite
      const sw = Math.sin(g.phR * Math.PI * 2 - 0.9) * 0.35 * g.walk + a.springs.armL.x * 0.05;
      arm(rig, 'L', { down: 0.86, fwd: sw + g.lean * 0.55 + (-1.9 * A + 0.9 * K) * (1 - bile), twist: 0.4 * A * (1 - bile), elbow: 0.1 + 0.3 * A, fist: 0.5 + 0.6 * A });
    },
  },

  // THE BUTCHER: a heavy, rolling waddle on wide-set legs, chin up, a cleaver in each fist held out from the belly.
  // Now and then he scrapes the blades together. The swing is both cleavers overhead and down; the throw is a
  // sidearm whip of the right hand.
  butcher: {
    legs: { knee: 0.6, bend: 0.16, wide: 0.14 },
    swingT: 0.12, recT: 0.65, load: 1.1,
    init(p) { p.lean = -0.06; p.headFwd = 0.02; p.headTilt *= 0.3; p.stride = 0.24; p.timeScale = 0.76; p.limp = null; p.sway = 0.24; p.jaw = 0.18; p.shoulderDrop = 0; p.bob = 1.5; p.shift = 0.05; },
    pose(a, g) {
      const rig = a.rig, T = 0;
      // the throw: the right hand cocks the cleaver back behind his ear, the whole bulk twisting away (the wind-up),
      // then whips it across his body, the shoulders unwinding through and past (the follow-through)
      const thr = a.move === 'cleaver';
      const A = thr ? 0 : a.attack, K = thr ? 0 : a.strike;
      const tA = thr ? a.attack : 0, tK = thr ? a.strike : 0, tO = thr ? a.over : 0;
      rig.rot('thigh_L', Z, 0.14); rig.rot('thigh_R', Z, -0.14);
      rig.rot('foot_L', Z, -0.12); rig.rot('foot_R', Z, 0.12);
      rig.rot('head', X, -0.15);
      if (thr) {
        // the body coils away from the target and unwinds through it; the off hand points at you the whole time
        rig.rot('spine03', Y, 0.6 * tA - 0.85 * tK - 0.25 * tO);
        rig.rot('spine02', Y, 0.25 * tA - 0.35 * tK);
        rig.rot('spine03', X, -0.12 * tA + 0.3 * tK + 0.1 * tO);
        rig.rot('neck', Y, -0.3 * tA + 0.4 * tK);              // the eyes stay on the target while the chest turns
        // cocked: the elbow up level with the shoulder and drawn back, the cleaver up beside his head;
        // the throw: the arm unfolds forward and across, the wrist snapping over
        arm(rig, 'R', { down: 0.5 - 0.7 * tA + 0.3 * tK, fwd: 1.35 * tA - 1.45 * tK - 0.35 * tO, twist: -0.35 * tA + 0.35 * tK, elbow: 0.7 + 1.2 * tA - 0.75 * tK, wrist: -0.35 * tA + 0.6 * tK, fist: 1.2 });
        arm(rig, 'L', { down: 0.78, fwd: -1.35 * tA + 0.6 * tK + 0.3 * tO, twist: 0.1 * tA, elbow: 0.15 + 0.3 * tK, fist: 0.9 });
        return;
      }
      rig.rot('root', Y, Math.sin(g.ph * Math.PI * 2) * 0.12 * g.walk);
      rig.rot('jaw', X, -Math.max(0, Math.sin(a.t * 5)) * 0.15);         // chewing
      const sharpen = pulse(a.t + 2, 5.5, 1.1) * (1 - A) * (1 - T);
      const scr = Math.sin(a.t * 22) * 0.12 * sharpen;
      for (const side of ['L', 'R']) {
        const sg = side === 'L' ? 1 : -1;
        const sw = Math.sin((side === 'L' ? g.phR : g.phL) * Math.PI * 2) * 0.1 * g.walk;
        arm(rig, side, {
          down: 0.5 - 0.2 * sharpen, fwd: -0.35 + sw + chop(a) - 0.4 * sharpen,
          twist: -0.75 * sharpen + sg * scr, elbow: 0.95 - 0.5 * A + 0.3 * sharpen, wrist: 0.2, fist: 1.25,
        });
      }
    },
  },

  // THE FOREMAN: the swagger of a man who owns the site. Upright, chest out, a heavy stomping stride that kicks up
  // dust, the sledgehammer resting on his right shoulder and the free arm swinging wide. The blow is a two-handed
  // overhead slam; the leap is arms up, knees tucked.
  foreman: {
    legs: { knee: 1.05, bend: 0.1 },
    swingT: 0.14, recT: 0.9, load: 1.45,
    init(p) { p.lean = 0.04; p.headFwd = 0.1; p.headTilt *= 0.25; p.stride = 0.42; p.timeScale = 0.68; p.limp = null; p.sway = 0.11; p.jaw = 0.06; p.shoulderDrop = 0; p.bob = 1.0; p.shift = 0.03; },
    pose(a, g) {
      const rig = a.rig;
      let K = a.strike;
      // the leap, along its arc (leapU): a push off with the legs driving out straight, a tuck at the top with the
      // hammer drawn right back over his head, then the legs reach for the ground and the hammer comes over with him
      const u = a.leapU, air = u >= 0 ? 1 : 0;
      const push = air ? Math.max(0, 1 - u / 0.25) : 0, tuck = air ? Math.sin(Math.min(1, Math.max(0, (u - 0.1) / 0.75)) * Math.PI) : 0, reach = air ? Math.max(0, (u - 0.72) / 0.28) : 0;
      // before the leap he SINKS: a deep squat, chest over his knees, the hammer swung down and back to load the jump
      if (air) a.leapt = true; else if (a.move !== 'leap') a.leapt = false;
      const crouch = !air && !a.leapt && a.move === 'leap' ? a.attack : 0;
      // the landing: the body takes the drop through the legs (the slam's own swing comes from strike)
      const land = a.move === 'leap' && !air ? K : 0;
      a.hipY -= 0.3 * crouch + 0.16 * land;
      for (const sd of ['L', 'R']) { rig.rot(`thigh_${sd}`, X, -0.95 * crouch - 0.55 * land); rig.rot(`shin_${sd}`, X, 1.5 * crouch + 0.9 * land); rig.rot(`foot_${sd}`, X, -0.55 * crouch - 0.35 * land); }
      rig.rot('spine02', X, 0.4 * crouch);
      // the hammer comes over in the last third of the fall so it meets the ground with his feet
      const pre = air ? reach * reach : 0;
      a.preK = pre;
      const A = air ? 1 - pre : crouch ? 0 : a.attack;
      rig.rot('spine03', X, -0.14 - 0.35 * A + 0.65 * K + 0.25 * reach);
      rig.rot('spine04', X, -0.06);
      rig.rot('head', Y, Math.sin(g.ph * Math.PI * 2) * 0.12 * g.walk);
      // the stomp: the body drops onto each heel
      const st = Math.pow(Math.abs(Math.cos(g.ph * Math.PI * 2)), 6) * 0.05 * g.walk;
      a.hipY -= st;
      if (air) {
        for (const [sd, k] of [['L', 1], ['R', 0.85]]) {
          rig.rot(`thigh_${sd}`, X, (-1.05 * tuck + 0.35 * push - 0.3 * reach) * k);
          rig.rot(`shin_${sd}`, X, (1.55 * tuck + 0.1 * push + 0.2 * reach) * k);
          rig.rot(`foot_${sd}`, X, 0.4 * push - 0.3 * tuck);
        }
      }
      if (crouch > 0) {
        arm(rig, 'R', { down: 0.7, fwd: 0.9 * crouch - 0.55 * (1 - crouch), twist: 0.1, elbow: 0.4, fist: 1.3 });
        arm(rig, 'L', { down: 0.7, fwd: 0.75 * crouch, twist: -0.2, elbow: 0.4, fist: 1.2 });
        return;
      }
      K = Math.max(K, pre);
      const two = Math.max(A, K);
      arm(rig, 'R', { down: 0.6 - 0.2 * two, fwd: -0.55 * (1 - two) + chop({ attack: A, strike: K, over: a.over }), twist: 0.15 * (1 - two), elbow: 2.05 * (1 - two) + 0.25 * two, wrist: -0.1, fist: 1.3 });
      const sw = Math.sin(g.phR * Math.PI * 2) * 0.5 * g.walk;
      arm(rig, 'L', { down: 0.72 - 0.15 * two, fwd: sw * (1 - two) + chop({ attack: A, strike: K, over: a.over }), twist: -0.35 * two, elbow: 0.45 + 0.2 * two, fist: 1.1 });
    },
  },

  // SUBJECT OMEGA: an animal now. Doubled over, it lopes on its legs and the knuckles of the huge right arm like a
  // gorilla, the left hand curled to its chest in a claw, the head jerking every second. The scream rears it up with
  // both arms flung wide; berserk, everything twitches harder.
  omega: {
    legs: { knee: 1.0, bend: 0.25 },
    swingT: 0.1, recT: 0.55, load: 1.2,
    init(p, r) { p.bob = 1.4; p.shift = 0.035; p.lean = 0.88; p.headFwd = 0.55; p.headTilt = 0.15; p.stride = 0.48; p.timeScale = 1.0; p.limp = null; p.sway = 0.09; p.jaw = 0.38; p.shoulderDrop = 0.25; p.jerkT = r(); },
    tick(a, dt) {
      const p = a.p;
      p.jerkT -= dt * (a.enraged ? 2.2 : 1);
      if (p.jerkT < 0) {
        p.jerkT = 0.5 + a.r() * 1.3;
        a.springs.headZ.kick((a.r() - 0.5) * 80);
        a.springs.headX.kick((a.r() - 0.5) * 40);
        if (a.r() < 0.4) a.springs.spineY.kick((a.r() - 0.5) * 40);
      }
    },
    pose(a, g) {
      const rig = a.rig, A = a.attack, K = a.strike, R = smooth(a.roarS);
      rig.rot('spine03', X, -0.85 * R);
      rig.rot('spine02', X, -0.5 * R);
      rig.rot('neck', X, -0.6 * R);
      rig.rot('jaw', X, -0.8 * R - 0.3 * A);
      // the big right arm plants with the left foot: a knuckle-walk
      const kn = Math.sin(g.phL * Math.PI * 2) * 0.55 * g.walk;
      arm(rig, 'R', { down: 0.62 - 1.5 * R, fwd: kn + g.lean * 0.55 + chop(a) * 1.1 - 0.5 * a.chargeS, twist: 0.1, elbow: 0.12 + 0.2 * A, fist: 1.5 });
      // the small left arm: a claw against the chest
      arm(rig, 'L', { down: 0.55 - 1.4 * R, fwd: -0.55 + g.lean * 0.2 + a.springs.armL.x * 0.04, twist: -0.45 * (1 - R), elbow: 1.5 * (1 - R), wrist: 0.5, fist: 1.2 + Math.sin(a.t * 9) * 0.25 * (a.enraged ? 1 : 0.4) });
    },
  },
};

// --------------------------------------------------------------- survivor --
// Two-bone arm IK. The survivor holds a pistol with BOTH hands: the gun's pose
// is decided first (a stance, the recoil, the reload), then each arm is solved
// onto its grip.
const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _d0 = new THREE.Vector3(), _d1 = new THREE.Vector3();
const _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _dq = new THREE.Quaternion();

// turn `bone` about its own origin so the line to `child` points at `want`
function aimBone(bone, child, want) {
  bone.updateWorldMatrix(true, false);
  bone.getWorldPosition(_p0);
  child.getWorldPosition(_p1);
  _d0.copy(_p1).sub(_p0).normalize();
  _d1.copy(want).sub(_p0).normalize();
  _dq.setFromUnitVectors(_d0, _d1);
  bone.getWorldQuaternion(_wq);
  _wq.premultiply(_dq);
  bone.parent.getWorldQuaternion(_pq).invert();
  bone.quaternion.copy(_pq.multiply(_wq));
  bone.updateMatrixWorld(true);
}

// roll a bone about the line toward `child` by `ang` (world axis)
function rollBone(bone, child, ang) {
  if (!ang) return;
  bone.getWorldPosition(_p0);
  child.getWorldPosition(_p1);
  _d0.copy(_p1).sub(_p0).normalize();
  _dq.setFromAxisAngle(_d0, ang);
  bone.getWorldQuaternion(_wq);
  _wq.premultiply(_dq);
  bone.parent.getWorldQuaternion(_pq).invert();
  bone.quaternion.copy(_pq.multiply(_wq));
  bone.updateMatrixWorld(true);
}

const AXIS = new THREE.Vector3();
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// Per-gun hold, in the GUN's frame (x forward, y up, z the shooter's right): where each wrist goes,
// how the hands point, where the gun floats in front of the chest, and where the support hand
// goes to pull the magazine and work the action.
const HAND_R = { down: 0.55, yaw: 0 };
export const WEAPON_RIG = {
  pistol: {
    gripR: [-0.075, 0.014, 0.022], gripL: [-0.056, -0.034, -0.034],
    handL: { down: 0.25, yaw: 0.25 },
    stance: { aimed: { p: [-0.02, -0.075, 0.46], pitch: 0, roll: 0 }, ready: { p: [-0.04, -0.30, 0.34], pitch: -0.55, roll: 0 } },
    well: [-0.06, -0.012],     // [x, z] of the magazine well (the hand goes under it)
    rack: [-0.075, -0.048],    // [x, z] where the support hand takes the slide / charging handle
    rackBack: -0.12,
  },
  smg: {
    gripR: [-0.075, 0.012, 0.022], gripL: [0.135, -0.02, -0.036],
    handL: { down: 0.9, yaw: 0.1 },
    stance: { aimed: { p: [-0.02, -0.07, 0.34], pitch: 0, roll: 0 }, ready: { p: [-0.04, -0.28, 0.27], pitch: -0.5, roll: 0 } },
    well: [0.112, -0.012],
    rack: [-0.075, -0.045],
    rackBack: -0.14,
  },
  // the long guns ride against the right shoulder (x is the body's LEFT, so the stock sits at -x)
  shotgun: {
    gripR: [-0.085, 0.0, 0.022], gripL: [0.36, -0.04, -0.036],
    handL: { down: 0.35, yaw: 0.15 },
    stance: { aimed: { p: [-0.1, -0.08, 0.24], pitch: 0, roll: 0 }, ready: { p: [-0.1, -0.26, 0.2], pitch: -0.5, roll: 0 } },
    well: [0.165, -0.004],          // the loading port: shells go in from underneath
    rack: [0.36, -0.036], rackY: -0.04, rackBack: 0.27,     // "racking" a pump gun is the pump itself
  },
  rifle: {
    gripR: [-0.075, 0.0, 0.022], gripL: [0.245, -0.012, -0.04],
    handL: { down: 0.9, yaw: 0.1 },
    stance: { aimed: { p: [-0.1, -0.08, 0.26], pitch: 0, roll: 0 }, ready: { p: [-0.1, -0.26, 0.21], pitch: -0.5, roll: 0 } },
    well: [0.103, -0.012],
    rack: [-0.073, -0.045], rackY: 0.081, rackBack: -0.15,
  },
  lmg: {
    gripR: [-0.075, -0.005, 0.022], gripL: [0.335, -0.035, -0.04],
    handL: { down: 0.35, yaw: 0.15 },
    stance: { aimed: { p: [-0.1, -0.1, 0.22], pitch: 0, roll: 0 }, ready: { p: [-0.1, -0.28, 0.19], pitch: -0.45, roll: 0 } },
    well: [0.145, -0.012],
    rack: [0.218, 0.04], rackY: 0.028, rackBack: 0.12,
  },
  riot12: {
    gripR: [-0.075, -0.01, 0.022], gripL: [0.4, -0.055, -0.036],
    handL: { down: 0.9, yaw: 0.1 },
    stance: { aimed: { p: [-0.1, -0.09, 0.23], pitch: 0, roll: 0 }, ready: { p: [-0.1, -0.27, 0.2], pitch: -0.48, roll: 0 } },
    well: [0.12, -0.012],
    rack: [0.22, 0.045], rackY: 0.055, rackBack: 0.13,
  },
};
// the power weapons: shouldered like the rifle
Object.assign(WEAPON_RIG, {
  crossbow: {
    gripR: [-0.075, 0.0, 0.022], gripL: [0.22, -0.005, -0.036], handL: { down: 0.35, yaw: 0.15 },
    stance: { aimed: { p: [-0.1, -0.09, 0.24], pitch: 0, roll: 0 }, ready: { p: [-0.1, -0.27, 0.2], pitch: -0.5, roll: 0 } },
    well: [0.2, -0.012], rack: [-0.07, -0.045], rackBack: -0.12,
  },
  flamer: {
    gripR: [-0.075, 0.0, 0.022], gripL: [0.3, -0.02, -0.036], handL: { down: 0.9, yaw: 0.1 },
    stance: { aimed: { p: [-0.12, -0.12, 0.22], pitch: -0.05, roll: 0 }, ready: { p: [-0.1, -0.28, 0.2], pitch: -0.45, roll: 0 } },
    well: [0.24, -0.012], rack: [-0.07, -0.045], rackBack: -0.12,
  },
  launcher: {
    gripR: [-0.075, 0.0, 0.022], gripL: [0.39, 0.0, -0.036], handL: { down: 0.9, yaw: 0.1 },
    stance: { aimed: { p: [-0.1, -0.1, 0.22], pitch: 0, roll: 0 }, ready: { p: [-0.1, -0.28, 0.2], pitch: -0.45, roll: 0 } },
    well: [0.175, -0.012], rack: [-0.07, -0.045], rackBack: -0.12,
  },
});
// A reload, as fractions of its length. Poses are relative to the shoulders.
export const RELOAD_EVENTS = [
  { u: 0.10, name: 'release' }, { u: 0.20, name: 'magout' }, { u: 0.50, name: 'magin' }, { u: 0.70, name: 'rack' },
];
const R_GUN = [
  { u: 0.00 }, { u: 0.12, p: [-0.03, -0.17, 0.30], pitch: 0.30, roll: 0.55 },
  { u: 0.44, p: [-0.03, -0.17, 0.30], pitch: 0.30, roll: 0.55 }, { u: 0.60, p: [-0.03, -0.14, 0.32], pitch: 0.2, roll: 0.35 },
  { u: 0.72, p: [-0.02, -0.09, 0.40], pitch: 0.08, roll: 0.1 }, { u: 0.88, p: [-0.02, -0.08, 0.44], pitch: 0.02, roll: 0 }, { u: 1.0 },
];
// the support hand: 'g' keys are in the gun's frame, 'c' keys in the body's
function handKeys(W) {
  const [wx, wz] = W.well, [rx, rz] = W.rack, gl = W.gripL;
  return [
    { u: 0.00, g: gl }, { u: 0.09, g: [wx, -0.085, wz] }, { u: 0.20, g: [wx, -0.20, wz] },
    { u: 0.34, c: [0.20, -0.52, 0.16] }, { u: 0.43, c: [0.17, -0.47, 0.22] },
    { u: 0.52, g: [wx, -0.17, wz + 0.002] }, { u: 0.58, g: [wx, -0.075, wz + 0.008] }, { u: 0.64, g: [wx, -0.085, wz - 0.002] },
    { u: 0.71, g: [rx, W.rackY ?? 0.085, rz] }, { u: 0.80, g: [W.rackBack, W.rackY ?? 0.085, rz] }, { u: 0.84, g: [rx, W.rackY ?? 0.085, rz] },
    { u: 0.93, g: gl }, { u: 1.0, g: gl },
  ];
}
for (const W of Object.values(WEAPON_RIG)) W.keys = handKeys(W);

export class SurvivorAnim {
  constructor(rig) {
    this.rig = rig;
    this.phase = 0;
    this.t = 0;
    this.recoil = new Spring(260, 20);
    this.spineKick = new Spring(150, 16);
    this.aim = 0;          // 0 low ready .. 1 aiming
    this.reload = 0;       // 0..1 during a reload
    this.hurt = new Spring(120, 12);
    this.down = 0;
    this.slide = 0;        // how far back the slide is (m); locked back when empty
    this.slideLock = false;
    this.magOut = 0;       // 0 mag in the gun .. 1 out of it
    this.magHand = 0;      // 1 while a fresh mag is in the left hand
    this.onEvent = null;
    this._ru = -1;
    this.gunPos = new THREE.Vector3();
    this.gunQuat = new THREE.Quaternion();
    this.handL = new THREE.Vector3();      // world position of the support wrist (for the mag prop)
    this.rollR = 0; this.rollL = 0;
    this.W = WEAPON_RIG.pistol;
    this.swap = 0;         // 1 just after drawing a gun, easing to 0
    const root = rig.c.root;
    root.updateMatrixWorld(true);
    const wp = (n) => rig.b[n].getWorldPosition(new THREE.Vector3());
    this.len = {};
    for (const s of ['L', 'R']) {
      this.len[s] = [wp('upperarm_' + s).distanceTo(wp('forearm_' + s)), wp('forearm_' + s).distanceTo(wp('hand_' + s)), wp('hand_' + s).distanceTo(wp('fingers_' + s))];
    }
  }

  setWeapon(id) { this.W = WEAPON_RIG[id] || WEAPON_RIG.pistol; }
  fire(last = false, kick = 26) { this.recoil.kick(kick); this.spineKick.kick(6); this.slide = 0.03; if (last) this.slideLock = true; }
  hit() { this.hurt.kick(10); }

  // moveLocal: velocity in the character's frame (x left, z forward), m/s
  update(dt, moveLocal, aiming) {
    const rig = this.rig;
    this.t += dt;
    this.recoil.step(dt);
    this.spineKick.step(dt);
    this.hurt.step(dt);
    this.swap = Math.max(0, this.swap - dt / 0.38);
    this.aim += ((aiming ? 1 : 0) - this.aim) * Math.min(1, dt * 12);
    const speed = Math.hypot(moveLocal.x, moveLocal.z);
    const run = Math.min(1, speed / 3.5);
    const walk = Math.min(1, speed / 1.0);
    const cycleLen = 1.3 + run * 1.0;
    this.phase = (this.phase + speed * dt / cycleLen) % 1;
    // legs swing along the direction of travel (strafe and backpedal read from above)
    let axis = X;
    if (speed > 0.05) {
      const dx = moveLocal.x / speed, dz = moveLocal.z / speed;
      axis = AXIS.set(dz, 0, -dx);      // perpendicular to travel, in the ground plane
    }
    // a side-step is a shorter step than a stride forward (full-length swings sideways read as a jumping jack)
    const fwdK = speed > 0.05 ? Math.abs(moveLocal.z) / speed : 1;
    const o = { stride: (0.3 + run * 0.35) * walk * (0.5 + 0.5 * fwdK), knee: (0.7 + run * 0.6) * walk, bend: 0.08 + run * 0.1, lean: 0, axis };
    legCycle(rig, 'L', this.phase, o);
    legCycle(rig, 'R', (this.phase + 0.5) % 1, o);
    // the model's rest pose has its legs apart: bring the feet in under the hips (Sam: "the legs walk too wide")
    const tuck = this.legIn ?? 0.1;
    rig.rot('thigh_L', Z, -tuck); rig.rot('thigh_R', Z, tuck);
    rig.rot('foot_L', Z, tuck * 0.8); rig.rot('foot_R', Z, -tuck * 0.8);
    const bob = -Math.abs(Math.cos(this.phase * TAU)) * (0.02 + run * 0.04) * walk;
    rig.setHips(0, bob - 0.02 - this.down * 0.5, 0);
    // torso: a fighting crouch, leaning into the run
    const lean = 0.08 + run * 0.18 + this.spineKick.x * -0.012 + this.down * 0.4;
    rig.rot('spine04', X, lean * 0.4);
    rig.rot('spine03', X, lean * 0.3);
    rig.rot('spine02', X, lean * 0.2 - this.hurt.x * 0.01);
    rig.rot('spine03', Y, Math.sin(this.phase * TAU) * 0.08 * walk * (1 - this.aim));
    // a little twist toward the gun hand, more while it is up
    rig.rot('spine03', Y, -0.1 * this.aim);
    rig.rot('neck', X, -lean * 0.4);
    rig.rot('head', X, -0.1 + this.aim * 0.05);
    // the arms: start from a relaxed pose; the IK below takes over
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? 1 : -1;
      rig.rot(`upperarm_${side}`, Z, -sg * 0.82);
      rig.rot(`fingers_${side}`, Z, -sg * (this.curl ?? 1.0));
    }
    rig.apply();
    this.holdGun(dt, run, lean);
  }

  // key tracks -------------------------------------------------------------
  _track(keys, u, f) {
    let i = 0;
    while (i < keys.length - 2 && u > keys[i + 1].u) i++;
    const a = keys[i], b = keys[i + 1];
    return f(a, b, sm((u - a.u) / Math.max(1e-4, b.u - a.u)));
  }

  holdGun(dt, run, lean) {
    const rig = this.rig, b = rig.b, root = rig.c.root;
    root.updateMatrixWorld(true);
    const Lw = S_L, Rw = S_R, M = S_M;
    b.upperarm_L.getWorldPosition(Lw); b.upperarm_R.getWorldPosition(Rw);
    root.worldToLocal(Lw); root.worldToLocal(Rw);
    M.copy(Lw).add(Rw).multiplyScalar(0.5);
    const a = this.aim;
    // ---- the gun's pose, in the body's frame
    const A = this.W.stance.aimed, D = this.W.stance.ready;
    let px = D.p[0] + (A.p[0] - D.p[0]) * a, py = D.p[1] + (A.p[1] - D.p[1]) * a, pz = D.p[2] + (A.p[2] - D.p[2]) * a;
    let pitch = D.pitch + (A.pitch - D.pitch) * a, roll = 0;
    const u = this.reload > 0 ? Math.min(1, this.reload) : 0;
    if (u > 0) {
      const keys = R_GUN;
      let i = 0;
      while (i < keys.length - 2 && u > keys[i + 1].u) i++;
      const k0 = keys[i], k1 = keys[i + 1], t = sm((u - k0.u) / Math.max(1e-4, k1.u - k0.u));
      const g = (k, f, d) => (k.p ? f(k) : d);
      const x0 = g(k0, (k) => k.p[0], px), y0 = g(k0, (k) => k.p[1], py), z0 = g(k0, (k) => k.p[2], pz), pi0 = g(k0, (k) => k.pitch, pitch), r0 = g(k0, (k) => k.roll, roll);
      const x1 = g(k1, (k) => k.p[0], px), y1 = g(k1, (k) => k.p[1], py), z1 = g(k1, (k) => k.p[2], pz), pi1 = g(k1, (k) => k.pitch, pitch), r1 = g(k1, (k) => k.roll, roll);
      px = x0 + (x1 - x0) * t; py = y0 + (y1 - y0) * t; pz = z0 + (z1 - z0) * t; pitch = pi0 + (pi1 - pi0) * t; roll = r0 + (r1 - r0) * t;
    }
    // events (sounds are the player's business)
    if (this.reload > 0) {
      for (const ev of RELOAD_EVENTS) if (this._ru < ev.u && u >= ev.u) this.onEvent?.(ev.name);
    }
    this._ru = this.reload > 0 ? u : -1;
    // recoil and gait
    const rec = this.recoil.x;
    py -= this.swap * this.swap * 0.16;
    const pos = S_POS.set(M.x + px, M.y + py + Math.sin(this.phase * TAU * 2) * 0.012 * run, M.z + pz - rec * 0.03);
    pitch += rec * 0.12 + this.hurt.x * 0.01 - this.swap * this.swap * 0.7;
    // the gun's frame: x forward (pitched), y up, z the shooter's right
    S_FWD.set(0, Math.sin(pitch), Math.cos(pitch));
    S_ZR.crossVectors(S_FWD, Y).normalize();
    S_YU.crossVectors(S_ZR, S_FWD).normalize();
    S_MAT.makeBasis(S_FWD, S_YU, S_ZR);
    const q0 = S_Q0.setFromRotationMatrix(S_MAT);
    q0.multiply(S_QR.setFromAxisAngle(X, roll));
    // reach: the gun hand must be able to get there
    const GR = this.W.gripR, GL = this.W.gripL;
    const wR = S_WR.set(GR[0], GR[1], GR[2]).applyQuaternion(q0).add(pos);
    const v = S_V.copy(wR).sub(Rw);
    const reach = (this.len.R[0] + this.len.R[1]) * 0.985;
    const vl = v.length();
    if (vl > reach) { v.multiplyScalar(reach / vl - 1); pos.add(v); wR.add(v); }
    // the world pose of the gun
    root.getWorldQuaternion(_wq);
    this.gunQuat.copy(_wq).multiply(q0);
    this.gunPos.copy(pos); root.localToWorld(this.gunPos);
    // ---- the support hand's target
    const wL = S_WL;
    if (u > 0) {
      const keys = this.W.keys;
      let i = 0;
      while (i < keys.length - 2 && u > keys[i + 1].u) i++;
      const k0 = keys[i], k1 = keys[i + 1], t = sm((u - k0.u) / Math.max(1e-4, k1.u - k0.u));
      const at = (k, out) => (k.g ? out.set(k.g[0], k.g[1], k.g[2]).applyQuaternion(q0).add(pos) : out.set(M.x + k.c[0], M.y + k.c[1], M.z + k.c[2]));
      at(k0, S_A); at(k1, S_B);
      wL.copy(S_A).lerp(S_B, t);
    } else wL.set(GL[0], GL[1], GL[2]).applyQuaternion(q0).add(pos);
    // the mag leaves the gun at 'magout' and a fresh one rides the hand until it seats
    this.magOut = u <= 0 ? 0 : u < 0.2 ? 0 : u < 0.5 ? 1 : u < 0.58 ? 1 - sm((u - 0.5) / 0.08) : 0;
    this.magHand = u >= 0.2 && u < 0.58 ? 1 : 0;
    // ---- solve both arms
    this._arm('R', wR, q0, HAND_R, roll);
    this._arm('L', wL, q0, this.W.handL, roll);
    this.handL.copy(wL); root.localToWorld(this.handL);
  }

  _arm(side, targetChar, q0, hand, gunRoll) {
    const rig = this.rig, b = rig.b, root = rig.c.root;
    const sg = side === 'L' ? 1 : -1;
    const up = b['upperarm_' + side], fo = b['forearm_' + side], ha = b['hand_' + side], fi = b['fingers_' + side];
    const [l1, l2, l3] = this.len[side];
    const S = up.getWorldPosition(S_S);
    const T = S_T.copy(targetChar); root.localToWorld(T);
    const Sd = S_SD.copy(T).sub(S);
    const dist = Math.min(Sd.length(), (l1 + l2) * 0.995);
    const dir = Sd.normalize();
    // the elbow: down and out
    const rq = root.getWorldQuaternion(S_RQ);
    const pole = S_POLE.set(sg * 0.55, -1, -0.15).applyQuaternion(rq);
    pole.sub(S_D2.copy(dir).multiplyScalar(pole.dot(dir))).normalize();
    const aL = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, l1 * l1 - aL * aL));
    const E = S_E.copy(S).addScaledVector(dir, aL).addScaledVector(pole, h);
    const Tw = S_TW.copy(S).addScaledVector(dir, dist);
    aimBone(up, fo, E);
    aimBone(fo, ha, Tw);
    // the hand points along the gun, a little down (and a little in for the support hand)
    const hd = S_HD.set(Math.cos(hand.down) * Math.cos(hand.yaw), -Math.sin(hand.down), Math.sin(hand.yaw));
    hd.applyQuaternion(q0).applyQuaternion(rq).normalize();
    const look = S_LK.copy(Tw).addScaledVector(hd, l3);
    aimBone(ha, fi, look);
    rollBone(ha, fi, (side === 'R' ? this.rollR : this.rollL));
  }
}

// scratch for holdGun/_arm: this runs for every survivor every frame, and a phone's garbage
// collector turns a few dozen short-lived objects a frame into a visible hitch
const S_L = new THREE.Vector3(), S_R = new THREE.Vector3(), S_M = new THREE.Vector3(), S_POS = new THREE.Vector3();
const S_FWD = new THREE.Vector3(), S_ZR = new THREE.Vector3(), S_YU = new THREE.Vector3(), S_V = new THREE.Vector3();
const S_WR = new THREE.Vector3(), S_WL = new THREE.Vector3(), S_A = new THREE.Vector3(), S_B = new THREE.Vector3();
const S_S = new THREE.Vector3(), S_T = new THREE.Vector3(), S_SD = new THREE.Vector3(), S_POLE = new THREE.Vector3();
const S_D2 = new THREE.Vector3(), S_E = new THREE.Vector3(), S_TW = new THREE.Vector3(), S_HD = new THREE.Vector3(), S_LK = new THREE.Vector3();
const S_MAT = new THREE.Matrix4(), S_Q0 = new THREE.Quaternion(), S_QR = new THREE.Quaternion(), S_RQ = new THREE.Quaternion();

export function mulberry(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------- the special dead --
// Poses layered over the shared gait for the five new kinds (zombie.js / specials.js set move, roar, throwT, air).
const SPECIAL_POSE = {
  bloater(a, { ph, walk, lean }) {
    const rig = a.rig;
    // legs apart round the belly, the arms held out over it
    rig.rot('thigh_L', Z, -0.12); rig.rot('thigh_R', Z, 0.12);
    rig.rot('foot_L', Z, 0.1); rig.rot('foot_R', Z, -0.1);
    rig.rot('spine03', X, -0.12);
    for (const sd of ['L', 'R']) {
      const sg = sd === 'L' ? 1 : -1;
      arm(rig, sd, { down: 0.74 + 0.04 * Math.sin(ph * TAU + sg), fwd: -0.3 + lean * 0.5 - a.attack * 1.0, twist: -0.2, elbow: 0.55, fist: 0.5 });
    }
    a.hipY -= 0.02 + Math.abs(Math.sin(ph * TAU)) * 0.03 * walk;
  },
  screamer(a, { lean }) {
    const rig = a.rig, R = a.roarS;
    if (a.move === 'scream' || R > 0.02) {
      // rear back, arms flung wide, the head thrown back, the jaw torn open
      const k = Math.max(R, a.move === 'scream' ? 0.35 : 0);
      rig.rot('spine03', X, -0.55 * k); rig.rot('spine02', X, -0.3 * k);
      rig.rot('neck', X, -0.5 * k); rig.rot('head', X, -0.45 * k + Math.sin(a.t * 60) * 0.04 * R);
      rig.rot('jaw', X, -1.1 * k);
      for (const sd of ['L', 'R']) arm(rig, sd, { down: 0.8 - 0.95 * k, fwd: lean * 0.5 * (1 - k) + 0.4 * k, elbow: 0.25, fist: 0.2, twist: 0.3 * k });
    } else {
      for (const sd of ['L', 'R']) arm(rig, sd, { down: 0.82, fwd: lean * 0.55 + Math.sin(a.t * 1.7 + (sd === 'L' ? 0 : 2)) * 0.1 - a.attack * 1.1, elbow: 0.3, fist: 0.3 });
    }
  },
  spitter(a, { lean }) {
    const rig = a.rig;
    // the spit: the head draws back, the throat swells, then the whole neck snaps forward
    const back = a.move === 'spit' ? Math.min(1, a.moveT / 0.55) : 0, snap = a.strike;
    rig.rot('neck', X, -0.4 * back + 0.6 * snap);
    rig.rot('head', X, -0.35 * back + 0.3 * snap);
    rig.rot('jaw', X, -0.2 * back - 0.9 * snap);
    rig.rot('spine03', X, -0.15 * back + 0.25 * snap);
    for (const sd of ['L', 'R']) arm(rig, sd, { down: 0.72, fwd: lean * 0.5 + 0.25 * back - a.attack * 1.0, elbow: 0.55, fist: 0.8 });
  },
  leaper(a, { ph, walk, lean }) {
    const rig = a.rig;
    const crouch = a.move === 'crouch' ? Math.min(1, a.moveT / 0.35) : 0, air = a.air, pin = a.move === 'pin' ? 1 : 0;
    // always low: knees bent, hips dropped, knuckles near the floor
    const low = 0.45 + 0.4 * crouch;
    for (const sd of ['L', 'R']) { rig.rot(`thigh_${sd}`, X, -0.55 * low - 0.6 * air); rig.rot(`shin_${sd}`, X, 1.0 * low + 0.9 * air); rig.rot(`foot_${sd}`, X, -0.4 * low); }
    a.hipY -= 0.22 * low;
    rig.rot('neck', X, -0.5 - 0.2 * crouch); rig.rot('head', X, -0.3);
    for (const sd of ['L', 'R']) {
      const sg = sd === 'L' ? 1 : -1;
      if (air > 0.05) arm(rig, sd, { down: 0.35, fwd: -1.6 * air, elbow: 0.2, fist: 0.2 });
      else if (pin) arm(rig, sd, { down: 0.55, fwd: lean * 0.3 - 0.4 + Math.sin(a.t * 14 + sg) * 0.4, elbow: 1.0, fist: 1.2 });
      else arm(rig, sd, { down: 0.72, fwd: lean * 0.45 - 0.1 - 0.3 * crouch + Math.sin((ph + (sg > 0 ? 0 : 0.5)) * TAU) * 0.35 * walk, elbow: 0.25, fist: 1.0 });
    }
    if (pin) { rig.rot('jaw', X, -0.5 - Math.max(0, Math.sin(a.t * 9)) * 0.4); rig.rot('head', X, 0.2 + Math.sin(a.t * 9) * 0.15); }
  },
  soldier(a, { lean }) {
    const rig = a.rig;
    // the arms still hold a rifle that is not there: the right hand at the hip, the left forward under it
    arm(rig, 'R', { down: 0.62, fwd: lean * 0.5 - 0.45 - a.attack * 0.9, elbow: 1.3, twist: 0.25, fist: 1.2 });
    arm(rig, 'L', { down: 0.55, fwd: lean * 0.5 - 0.9 - a.attack * 0.7, elbow: 0.8, twist: -0.25, fist: 1.0 });
    rig.rot('spine03', Y, -0.15);
  },
};
