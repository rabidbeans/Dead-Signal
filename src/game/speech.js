// The dead talk. Speech bubbles over their heads: zombie puns from the horde, and each boss with a voice of its own
// (an entrance, a line for each special move, taunts, hurt lines, a last word). The HOST decides who says what and
// when (hostLine), and sends `say` events so every machine shows the same line on the same body.
import * as THREE from 'three';
import { audio } from './audio.js';

export const LINES = {
  // the ordinary dead
  z: {
    idle: [
      "I'm dead serious.", "Let's grab a bite!", 'No body loves me.', "I'm dying to meet you.", 'Lend me a hand... I lost mine.',
      'Got brains? Asking for a friend.', "I've got a bone to pick with you.", "Don't be a stranger. Be a snack.",
      'Stop running, I just want a hug!', "I'm not slow. I'm decomposing.", "Doctor says I'm in grave condition.",
      'I used to be a people person.', 'Mind if I pick your brain?', "I'm on a strict brain diet.", 'Gimme some skin!',
      'Feeling a little rotten today.', 'Undead and loving it.', "I'd run, but I'm dead tired.",
      "You're the apple of my eye socket.", 'Heads up! ...Mine fell off.', 'Just a nibble. I swear.',
      "Brains! They're gluten free!", 'Is that a pulse? How rude.', "I've been dying to see you!",
      "Don't worry, I'm a vegetarian. I only eat HUMAN BEANS.", 'Ugh. Mondays. Forever.',
      "I'm a little rough around the edges. And the middle.", "Wait up! I've got a flesh wound!",
      "Rot 'n' roll!", 'Corpse-orate team building!',
    ],
    wake: ['Five more minutes... OH, FOOD!', 'Rise and dine!', 'Who ordered takeout?', 'I smell a snack!', 'Good mourning!', 'Who woke the dead?!'],
    bite: ['Tastes like chicken!', 'Mmm, finger food!', 'Bite-sized!', 'Needs salt.', "You're to die for!", 'Nom. NOM.', 'Chew on THAT.'],
    die: ["I'm dead... again.", 'Rest in pieces.', 'Not AGAIN!', 'Worth it.', 'Back to the graveyard shift.', 'I was... gutted...', 'Ugh. Dead end.'],
  },
  // lines that belong to who they were (picked now and then instead of a general one)
  m: {
    z_cop: ["Freeze! ...Oh wait, I'm already stiff.", 'Officer Dead, at your service!', 'You have the right to remain... tasty.'],
    z_nurse: ['Time for your shot... of BRAINS!', 'Nurse needs a bite!', 'This will only sting... forever.'],
    z_jogger: ["Can't stop! Cardio!", 'Personal best: zero heartbeats!', 'Running on empty! Feed me!'],
    z_office: ['Per my last email: BRAINS.', "Let's circle back... to your brain.", "Let's take this offline. Into my mouth."],
    z_elder: ['Back in my day we ate brains uphill both ways!', 'You kids and your PULSES!', "I'm not old. I'm VINTAGE."],
    z_burned: ["I'm a little toasty.", 'Too hot to handle!', 'Well done. Like me.'],
    z_trucker: ['Breaker breaker, I am HUNGRY!', '10-4, good bite!', 'Long haul... to your brain.'],
    z_worker: ["I'm on my lunch break. You're lunch.", 'Punching in... to your skull!', 'Hard work, hard hat, soft brain!'],
    z_hoodie: ['No cap, I am dead.', 'Bruh. BRAINS.', "It's giving... DEAD."],
    z_patient: ["I'm feeling much worse, thanks!", 'Is the doctor in? I am STARVING!', 'Discharge me... into your face!'],
  },
  warden: {
    spawn: ["Freeze! You're under a-REST!", 'Halt! This is a dead zone!'],
    charge: ['STOP RESISTING!', 'You have the right to remain... DINNER!', 'Make way! RIOT ACT!'],
    bite: ["Book 'em... and COOK 'em!", "Hands where I can eat 'em!", 'Assault with a deadly FEASTER!'],
    hurt: ['Officer down! ...And up again.', 'Requesting brain-forcements!', 'That is assaulting an officer! A dead one!'],
    die: ['End of my shift... forever...', 'Badge... returned... to sender...'],
    idle: ['You have the right to remain DEAD!', 'Anything you say will be used as seasoning.', "License and brain-istration, please.", "I am the law. You are lunch.", 'Move along! Into my mouth!'],
  },
  patientzero: {
    spawn: ["I'm patient. ZERO patience!", 'The doctor will see you now... in pieces!'],
    bile: ['Say ahh... BLEARGH!', 'Time for your BILE-ology lesson!', 'Take your medicine!', 'I have a stomach bug. Want it?'],
    bite: ["This won't hurt a bit... it'll hurt a BITE!", 'Open wide!', 'Cough cough. You are welcome.'],
    hurt: ['I need a doctor... to EAT!', 'Careful! My drip is dripping!', "Nurse! NURSE! ...Oh right, I ate her."],
    die: ['Flatlining... finally...', 'Discharged...'],
    idle: ['Visiting hours are OVER!', "I've been dying to spread this!", 'Symptoms: hungry. Very hungry.', "I'm the original. Accept no imitations.", 'This is going to be infectious!'],
  },
  butcher: {
    spawn: ['FRESH MEAT! Come to papa!', "Welcome to my shop. Today's special is YOU!"],
    cleaver: ['Chop chop!', 'Catch! With your FACE!', "Let's SPLIT!", 'Special delivery: prime cuts!'],
    bite: ['Tenderized!', 'Now THAT is a meat-ing!', 'Prime cut!', 'Grade A!'],
    hurt: ['Watch the merchandise!', 'What a HACK job!', "You'll pay for that. By the POUND!"],
    die: ["I've been... butchered...", 'Shop is... closed...'],
    idle: ['Meat me halfway!', "You're a cut above the rest!", 'Pound for pound, you look delicious.', "I don't do fast food... but YOU are fast food!", 'Steak your claim, little snack!'],
  },
  foreman: {
    spawn: ['Hard hat area! Hard HEAD area!', "Break time's OVER!"],
    leap: ['HAMMER TIME!', 'Ground-breaking ceremony!', 'Incoming! DEMOLITION CREW!', 'Wrecking ball!'],
    bite: ['Nailed it!', "That's a structural failure!", 'Demolished!'],
    hurt: ['Workplace injury! I am SUING!', "That's gonna cost you OVERTIME!", 'Safety first. YOUR safety? LAST.'],
    overtime: ['Time and a half, BABY!', 'OVERTIME! Double pay! Double BRAINS!'],
    die: ['Clocking... out...', 'Under... construction...'],
    idle: ["I'm the boss of this site!", "Let's lay some foundations. With your BONES!", 'Union says I get a lunch break. YOU.', "Building a better tomorrow... out of YOU!", 'Sledge-ing you is part of the job!'],
  },
  omega: {
    spawn: ['I AM THE ALPHA AND THE OMEGA!', 'TESTING, TESTING... ONE, TWO, CHEW!'],
    scream: ['COME, MY LAB RATS!', 'DINNER BELL! RING RING!', 'EVERYBODY... GROUP HUG!'],
    charge: ['SIDE EFFECTS INCLUDE... ME!', 'FAST-ACTING FORMULA!'],
    bite: ['EXPERIMENT SUCCESSFUL!', 'PEER... REVIEWED!', 'NEW SPECIES: SNACK!'],
    hurt: ["I'M EVOLVING!", 'GAIN OF FUNCTION!', 'MORE! MORE SERUM!'],
    die: ['Results... inconclusive...', 'Experiment... over...'],
    idle: ['SIDE EFFECTS INCLUDE... YOU!', 'I was a mistake. A BIG one.', 'The lab coats tasted better.', 'DO NOT FEED AFTER MIDNIGHT!', 'I AM THE ULTIMATE... BRAIN CHILD!'],
  },
};

const _v = new THREE.Vector3();
const BOSS_COL = { warden: '#5a8cff', patientzero: '#9cff4a', butcher: '#ff5040', foreman: '#ffc81a', omega: '#c07aff' };

export class Speech {
  constructor(game) {
    this.g = game;
    this.el = document.createElement('div');
    this.el.className = 'speech';
    document.body.appendChild(this.el);
    this.list = [];
    this.cd = new Map();           // per body: no new line until then
    this.chatT = 4;
    this.tauntT = 10;
    this.bag = {};                  // lines not yet used, per category (so you don't hear the same pun twice in a row)
  }

  pick(key, cat) {
    const all = LINES[key]?.[cat];
    if (!all?.length) return -1;
    const k = key + ':' + cat;
    if (!this.bag[k]?.length) this.bag[k] = all.map((_, i) => i).sort(() => Math.random() - 0.5);
    return this.bag[k].pop();
  }

  pickM(model) {
    const all = LINES.m[model];
    const k = 'm:' + model;
    if (!this.bag[k]?.length) this.bag[k] = all.map((_, i) => i).sort(() => Math.random() - 0.5);
    return this.bag[k].pop();
  }

  // host: maybe say something (cat: idle, wake, bite, die, hurt, spawn, or a move name)
  hostLine(z, cat, prob = 1, delay = 0) {
    const g = this.g;
    if (!g.isHost || g.opts.attract || !z || Math.random() > prob) return;
    const key = z.boss ? z.type : 'z';
    if (!LINES[key]?.[cat]) return;
    const now = g.time || 0;
    if (cat !== 'die' && (this.cd.get(z.id) || 0) > now) return;
    if (!z.boss) {
      // the horde: only close to someone, and never more than two talking at once
      if (this.list.filter((b) => !b.boss && b.t < b.life).length >= 2) return;
      let near = false;
      for (const p of g.players.values()) if (Math.hypot(p.x - z.x, p.z - z.z) < 15) near = true;
      if (!near) return;
    }
    // the ordinary dead: sometimes a line about who they used to be
    if (!z.boss && cat === 'idle' && LINES.m[z.model] && Math.random() < 0.45) cat = 'm';
    const i = cat === 'm' ? this.pickM(z.model) : this.pick(key, cat);
    if (i < 0) return;
    this.cd.set(z.id, now + (z.boss ? 3 : 7));
    const e = { k: 'say', id: z.id, c: cat, i, d: delay };
    g.emit(e);
    this.show(e);
  }

  show(e) {
    const z = this.g.zombies.get(e.id);
    if (!z) return;
    const key = z.boss ? z.type : 'z';
    const text = e.c === 'm' ? LINES.m[z.model]?.[e.i] : LINES[key]?.[e.c]?.[e.i];
    if (!text) return;
    // one bubble per body: a new line replaces the old
    for (const b of this.list) if (b.z === z) b.life = Math.min(b.life, b.t + 0.15);
    const el = document.createElement('div');
    el.className = 'say' + (z.boss ? ' boss' : '') + (e.c === 'die' ? ' last' : '');
    if (z.boss) el.style.setProperty('--bc', BOSS_COL[z.type] || '#fff');
    el.textContent = text;
    el.style.opacity = '0';
    this.el.appendChild(el);
    this.list.push({ el, z, t: -(e.d || 0), life: (z.boss ? 2.6 : 2.0) + text.length * 0.045, boss: z.boss, x: z.x, zz: z.z, shown: false });
  }

  update(dt) {
    const g = this.g;
    if (!g.opts.attract && g.isHost) {
      // the horde chatters: now and then, one of the dead near a survivor says something
      this.chatT -= dt;
      if (this.chatT <= 0) {
        this.chatT = 3.5 + Math.random() * 3.5;
        const cands = [];
        for (const z of g.zombies.values()) {
          if (!z.alive || z.boss || z.idle) continue;
          for (const p of g.players.values()) if (p.alive && Math.hypot(p.x - z.x, p.z - z.z) < 12) { cands.push(z); break; }
        }
        if (cands.length) this.hostLine(cands[Math.floor(Math.random() * cands.length)], 'idle', 1);
      }
      // a boss taunts while it hunts you
      this.tauntT -= dt;
      if (this.tauntT <= 0) {
        this.tauntT = 8 + Math.random() * 5;
        for (const z of g.zombies.values()) if (z.boss && z.alive && z.target) this.hostLine(z, 'idle', 1);
      }
    }
    const cam = g.camera, W = window.innerWidth, H = window.innerHeight;
    for (const b of this.list) {
      b.t += dt;
      if (b.t < 0) continue;
      if (!b.shown) {
        b.shown = true;
        b.el.classList.add('in');
        if (b.z.alive || b.z.boss) audio.zombie('groan', b.z.x, b.z.z, b.boss ? 1 : 0.7);
      }
      const z = b.z;
      if (g.zombies.has(z.id)) { b.x = z.x; b.zz = z.z; }
      const s = z.char.root.scale.x;
      const y = (z.alive ? 1.95 * s : 0.7) + g.world.groundY(b.x, b.zz) + 0.25;
      _v.set(b.x, y, b.zz).project(cam);
      const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
      const fade = Math.min(1, b.t / 0.12) * Math.min(1, (b.life - b.t) / 0.3);
      b.el.style.opacity = vis ? String(Math.max(0, fade)) : '0';
      b.vis = vis;
      b.sx = (_v.x + 1) / 2 * W; b.sy = (1 - _v.y) / 2 * H;
    }
    // two heads close together: the later bubble moves up out of the way instead of covering the first
    const on = this.list.filter((b) => b.vis && b.t >= 0);
    for (let i = 0; i < on.length; i++) {
      const b = on[i];
      b.w ??= b.el.offsetWidth; b.h ??= b.el.offsetHeight;
      for (let j = 0; j < i; j++) {
        const o = on[j];
        if (Math.abs(o.sx - b.sx) < (o.w + b.w) / 2 && Math.abs(o.sy - b.sy) < (o.h + b.h) / 2 + 4) b.sy = o.sy - o.h - 8;
      }
      b.el.style.transform = `translate(${b.sx.toFixed(1)}px, ${b.sy.toFixed(1)}px) translate(-50%, -100%)`;
    }
    const keep = [];
    for (const b of this.list) { if (b.t < b.life) keep.push(b); else b.el.remove(); }
    this.list = keep;
  }

  dispose() { this.el.remove(); this.list = []; }
}
