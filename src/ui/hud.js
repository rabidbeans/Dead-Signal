// The in-game HUD: DOM over the canvas (crisp text, cheap to update).
import * as THREE from 'three';
import { WEAPONS, MASTERY, PROTO } from '../game/weapons.js';
import { SPECS } from '../game/skills.js';
import { NADES } from '../game/throwables.js';

// small icons for the skill and throw buttons (drawn, so they stay crisp on any screen)
export const ICONS = {
  medic: '<svg viewBox="0 0 24 24"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg>',
  gunner: '<svg viewBox="0 0 24 24"><path d="M5 21V10l2-4 2 4v11zM11 21V8l2-5 2 5v13zM17 21V10l2-4 2 4v11z"/></svg>',
  scout: '<svg viewBox="0 0 24 24"><path d="M3 5l7 7-7 7V5zm8 0l7 7-7 7V5z"/><path d="M19 4h2v16h-2z"/></svg>',
  engineer: '<svg viewBox="0 0 24 24"><path d="M7 7h9v6H7zM16 9h6v2h-6zM10 13h3v3l5 6h-3l-3-4-3 4H6l4-6z"/></svg>',
  frag: '<svg viewBox="0 0 24 24"><circle cx="11" cy="14" r="7"/><path d="M9 5h4v3H9zM13 5l6 4-1 1-6-3z"/><circle cx="7" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  molotov: '<svg viewBox="0 0 24 24"><path d="M10 9h4v2l2 3v8H8v-8l2-3z"/><path d="M11 3c2 2-1 3 1 5 1-1 2-2 1-4 2 1 2 4 0 5h-3c-1-2 0-4 1-6z"/></svg>',
  pipe: '<svg viewBox="0 0 24 24"><path d="M3 10h3V8h12v2h3v4h-3v2H6v-2H3z"/><path d="M10 6h4v2h-4z"/><circle cx="12" cy="5" r="1.4"/></svg>',
};

const ICON = (id) => `${import.meta.env.BASE_URL}assets/weapons/${WEAPONS[id].icon}`;

const $ = (sel, root = document) => root.querySelector(sel);

export class HUD {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-top">
        <div class="hp">
          <div class="hp-name"></div>
          <div class="hp-bar"><div class="hp-fill"></div><div class="hp-ticks"></div></div>
          <div class="ar-bar hidden"><div class="ar-fill"></div></div>
          <div class="cash"><b>$</b><span class="cash-n">0</span><em class="cash-d"></em></div>
          <div class="team"></div>
          <div class="objective"><i></i><span></span></div>
          <div class="holdbar"><u></u></div>
          <div class="streak"><b></b><span>STREAK</span><em></em><u><i></i></u></div>
        </div>
        <div class="wave"><span class="wave-label"></span><span class="wave-left"></span></div>
        <button class="pause" aria-label="Pause"><span></span><span></span></button>
      </div>
      <div class="bossbar hidden"><b></b><div><i></i></div></div>
      <div class="weapon">
        <img class="weapon-icon" src="${ICON('pistol')}" alt="">
        <div class="ammo"><span class="ammo-n">12</span><span class="ammo-r">/ ∞</span></div>
        <div class="weapon-name">${WEAPONS.pistol.name}</div>
      </div>
      <button class="reload-btn" aria-label="Reload"><svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg><span>RELOAD</span></button>
      <button class="swap-btn hidden" aria-label="Switch weapon"><img class="swap-icon" alt=""><span>SWITCH GUN</span></button>
      <button class="skill-btn hidden" aria-label="Skill"><i class="sk-icon"></i><em class="sk-n"></em><b class="sk-cd"></b><span class="sk-name"></span></button>
      <button class="throw-btn hidden" aria-label="Throw"><i class="th-icon"></i><em class="th-n"></em><span class="th-name"></span><u class="th-cycle">⟳</u></button>
      <div class="stick move"><div class="knob"></div></div>
      <div class="stick aim"><div class="knob"></div></div>
      <div class="reload-ring"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17"/></svg></div>
      <div class="assist"></div>
      <div class="vignette"></div>
      <div class="bloodfx"></div>
      <div class="hitmarks">${'<i></i>'.repeat(10)}</div>
      <div class="announce"><b></b><span></span></div>
      <div class="banner"><div class="banner-title"></div><div class="banner-sub"></div><div class="banner-note"></div></div>
      <div class="down-msg"><b>YOU'RE DOWN</b><span class="down-sub">Keep shooting. A teammate standing next to you picks you up.</span><div class="bleed"><i></i></div></div>
      <div class="markers">${'<div class="mk"><i></i><b></b></div>'.repeat(6)}</div>
      <div class="toast"></div>
      <div class="hint"></div>
      <div class="pause-menu hidden">
        <div class="panel">
          <h2>PAUSED</h2>
          <button class="btn primary resume">RESUME</button>
          <button class="btn quit">QUIT TO MENU</button>
        </div>
      </div>
      <div class="end hidden"><div class="panel"></div></div>
    `;
    this.el = {
      name: $('.hp-name', root), fill: $('.hp-fill', root), team: $('.team', root),
      waveLabel: $('.wave-label', root), waveLeft: $('.wave-left', root), obj: $('.objective span', root), objBox: $('.objective', root),
      holdbar: $('.holdbar', root), holdfill: $('.holdbar u', root),
      ammoN: $('.ammo-n', root), weapon: $('.weapon', root), wIcon: $('.weapon-icon', root), wName: $('.weapon-name', root), swapBtn: $('.swap-btn', root), swapIcon: $('.swap-icon', root),
      bossBar: $('.bossbar', root), bossName: $('.bossbar b', root), bossFill: $('.bossbar i', root),
      arBar: $('.ar-bar', root), arFill: $('.ar-fill', root), cashN: $('.cash-n', root), cashD: $('.cash-d', root), cashBox: $('.cash', root),
      move: $('.stick.move', root), aim: $('.stick.aim', root),
      ring: $('.reload-ring', root), ringC: $('.reload-ring circle', root),
      assist: $('.assist', root), vig: $('.vignette', root),
      banner: $('.banner', root), bt: $('.banner-title', root), bs: $('.banner-sub', root), bn: $('.banner-note', root),
      down: $('.down-msg', root), downSub: $('.down-sub', root), bleed: $('.bleed i', root), toast: $('.toast', root), hint: $('.hint', root),
      pause: $('.pause', root), pauseMenu: $('.pause-menu', root), end: $('.end', root),
      reloadBtn: $('.reload-btn', root),
      skillBtn: $('.skill-btn', root), skIcon: $('.sk-icon', root), skN: $('.sk-n', root), skCd: $('.sk-cd', root), skName: $('.sk-name', root),
      throwBtn: $('.throw-btn', root), thIcon: $('.th-icon', root), thN: $('.th-n', root), thName: $('.th-name', root), thCycle: $('.th-cycle', root),
      marks: [...root.querySelectorAll('.mk')],
      blood: $('.bloodfx', root), hm: [...root.querySelectorAll('.hitmarks i')],
      streak: $('.streak', root), stN: $('.streak b', root), stMul: $('.streak em', root), stBar: $('.streak u i', root),
      ann: $('.announce', root), annT: $('.announce b', root), annS: $('.announce span', root),
    };
    this.bloodK = 0;
    this.hmI = 0;
    this.el.blood.style.backgroundImage = `url(${import.meta.env.BASE_URL}assets/tex/screenblood.webp)`;
    this.vig = 0;
    this.bannerT = 0;
    this.reloadT = 0;
    this.reloadMax = 1;
    this.onReload = null;
    this.onSwap = null;
    this.onSafehouse = null;
    this.onNext = null;
    this.onQuit = null;
    this.onRetry = null;
    this.el.reloadBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.onReload?.(); });
    this.el.swapBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.onSwap?.(); });
    this.el.skillBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.onSkill?.(); });
    // the throw button: a tap throws, the little arrow (or a long press) changes what you throw
    this.el.throwBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      if (e.target === this.el.thCycle) { this.onCycle?.(); return; }
      this._thDown = performance.now();
      clearTimeout(this._thHold);
      this._thHold = setTimeout(() => { this._thDown = 0; this.onCycle?.(); }, 420);
    });
    const thUp = (e) => { e.stopPropagation(); clearTimeout(this._thHold); if (this._thDown) { this._thDown = 0; this.onThrow?.(); } };
    this.el.throwBtn.addEventListener('pointerup', thUp);
    this.el.throwBtn.addEventListener('pointercancel', () => { clearTimeout(this._thHold); this._thDown = 0; });
    this.el.pause.addEventListener('click', () => this.el.pauseMenu.classList.remove('hidden'));
    $('.resume', root).addEventListener('click', () => this.el.pauseMenu.classList.add('hidden'));
    $('.quit', root).addEventListener('click', () => this.onQuit?.());
    this._v = new THREE.Vector3();
  }

  show(on) { this.root.classList.toggle('hidden', !on); }
  get paused() { return !this.el.pauseMenu.classList.contains('hidden'); }

  // -------------------------------------------------------------- bits --
  health(hp, max = 100) {
    const f = Math.max(0, hp) / max;
    this.el.fill.style.width = (f * 100).toFixed(1) + '%';
    this.el.fill.classList.toggle('low', f <= 0.35);
  }

  armor(a, max) {
    this.el.arBar.classList.toggle('hidden', max <= 0);
    this.el.arFill.style.width = (max > 0 ? Math.max(0, a) / max * 100 : 0).toFixed(1) + '%';
  }

  // the gun in hand: its picture, its name, and whether there is another to switch to
  weapon(p) {
    const W = p.W;
    this.el.wIcon.src = ICON(W.id);
    this.el.wName.textContent = (W.proto ? PROTO[W.id].name : W.name).toUpperCase();
    this.el.wIcon.classList.toggle('gold', !!W.gold);
    this.root.querySelector('.ammo-r').textContent = W.power ? ' LEFT' : '/ ∞';
    this.el.wIcon.classList.toggle('proto', !!W.proto);
    if (W.proto) this.el.weapon.style.setProperty('--pc', '#' + PROTO[W.id].color.toString(16).padStart(6, '0')); else this.el.weapon.style.removeProperty('--pc');
    this.el.swapBtn.classList.toggle('hidden', p.order.length < 2);
    // the switch button shows the gun you would switch TO, so it can never be mistaken for reload
    if (p.order.length > 1) {
      const next = p.order[(p.order.indexOf(W.id) + 1) % p.order.length];
      const src = ICON(next);
      if (this.el.swapIcon.getAttribute('src') !== src) this.el.swapIcon.src = src;
    }
  }

  // the wallet for this run, with a little "+10" that floats up
  cash(total, delta = 0, label = null) {
    this.el.cashN.textContent = total;
    if (!delta) return;
    const d = this.el.cashD;
    d.textContent = (label ? label + '  ' : '') + '+' + delta;
    d.classList.remove('on');
    cancelAnimationFrame(this._cashA);
    this._cashA = requestAnimationFrame(() => d.classList.add('on'));
  }

  ammo(p) {
    this.el.ammoN.textContent = p.ammo;
    this.el.ammoN.classList.toggle('empty', p.ammo === 0);
    this.el.reloadBtn.classList.toggle('need', p.ammo <= Math.max(1, Math.floor(p.W.mag * 0.25)));
    // restart the little recoil animation WITHOUT forcing a layout (reading offsetWidth on every shot is a
    // forced reflow: a few ms on a phone, five times a second)
    const w = this.el.weapon;
    w.classList.remove('kick');
    cancelAnimationFrame(this._kick);
    this._kick = requestAnimationFrame(() => w.classList.add('kick'));
  }

  reload(t) { this.reloadT = t; this.reloadMax = t; }

  damage(dmg, hp, max = 100) {
    this.vig = Math.min(1, this.vig + dmg / 25);
    // a big hit throws blood across the screen (mirrored at random so it never looks the same twice)
    if (dmg >= 6) {
      if (this.bloodK < 0.25) this.el.blood.style.transform = `scale(${Math.random() < 0.5 ? -1 : 1}, ${Math.random() < 0.3 ? -1 : 1})`;
      this.bloodK = Math.min(1, this.bloodK + dmg / 22);
    }
    this.health(hp, max);
  }

  // a hit marker at a body on the screen: 'hit', 'crit' or 'kill'
  mark(x, y, z, kind, cam) {
    this._v.set(x, y, z).project(cam);
    if (this._v.z > 1) return;
    const el = this.el.hm[this.hmI = (this.hmI + 1) % this.el.hm.length];
    el.className = '';
    el.style.left = ((this._v.x * 0.5 + 0.5) * innerWidth).toFixed(0) + 'px';
    el.style.top = ((-this._v.y * 0.5 + 0.5) * innerHeight).toFixed(0) + 'px';
    cancelAnimationFrame(el._a);
    el._a = requestAnimationFrame(() => { el.className = kind; });
  }

  // the kill streak: the count, how long until it runs out, and what it is doing to the bounty
  streak(n, frac, mul) {
    const on = n >= 3;
    if (on !== this._stOn) { this._stOn = on; this.el.streak.classList.toggle('on', on); }
    if (!on) return;
    if (n !== this._stN) {
      this._stN = n;
      this.el.stN.textContent = '×' + n;
      this.el.stMul.textContent = '$ ×' + mul.toFixed(2);
      const s = this.el.streak;
      s.classList.remove('pop');
      cancelAnimationFrame(this._stA);
      this._stA = requestAnimationFrame(() => s.classList.add('pop'));
    }
    this.el.stBar.style.transform = `scaleX(${frac.toFixed(3)})`;
  }

  // a big word slammed onto the screen (kill streaks)
  announce(title, sub = '') {
    this.el.annT.textContent = title;
    this.el.annS.textContent = sub;
    const a = this.el.ann;
    a.classList.remove('on');
    void a.offsetWidth;
    a.classList.add('on');
  }

  killConfirm() {
    const w = this.el.weapon;
    w.classList.remove('kill');
    cancelAnimationFrame(this._kill);
    this._kill = requestAnimationFrame(() => w.classList.add('kill'));
  }

  team(players, me) {
    this.el.name.textContent = me.name.toUpperCase();
    this.el.team.innerHTML = players.filter((p) => p !== me).map((p) => `
      <div class="mate" data-id="${p.id}"><span>${escapeHtml(p.name)}</span><div class="mate-bar"><i></i></div></div>`).join('');
  }

  // the top plate and the objective line: the route, or a held junction
  route({ ob = null, phase, hold, title, left, secs, dist, opened, away, final, gates = 1, name = '', boss = null, finale = 'saferoom', holdText = null }) {
    const box = this.el.objBox;
    box.classList.toggle('on', phase === 'run' || phase === 'hold' || phase === 'extract');
    this.el.holdbar.classList.toggle('on', hold >= 0);
    box.classList.toggle('away', hold >= 0 && !!away);
    if (phase === 'intro') { this.el.waveLabel.textContent = 'STAND BY'; this.el.waveLeft.textContent = ''; return; }
    if (hold >= 0 && boss) {
      this.el.holdbar.classList.remove('on');
      this.el.obj.textContent = away ? 'GET BACK TO THE FIGHT' : `KILL ${boss}`;
      this.el.waveLabel.textContent = title;
      this.el.waveLeft.textContent = away ? 'PAUSED' : 'BOSS';
    } else if (hold >= 0 && ob) {
      // the level's own objective: breakers, nests, the bulldozer
      this.el.obj.textContent = ob.text;
      this.el.holdfill.style.width = Math.min(100, ob.frac * 100).toFixed(1) + '%';
      this.el.waveLabel.textContent = title;
      this.el.waveLeft.textContent = ob.right;
    } else if (hold >= 0) {
      const t = Math.ceil(left);
      this.el.obj.textContent = away ? 'GET BACK TO THE GATE' : final ? `HOLD THE LANDING ZONE  ·  ${t} s` : `${holdText || 'HOLD THE JUNCTION'}  ·  ${t} s`;
      this.el.holdfill.style.width = Math.min(100, (1 - left / Math.max(1, secs)) * 100) + '%';
      this.el.waveLabel.textContent = title;
      this.el.waveLeft.textContent = away ? 'PAUSED' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    } else {
      const heli = finale === 'heli';
      this.el.obj.textContent = phase === 'win' ? (heli ? 'EVACUATED' : 'SAFE') : phase === 'extract' ? (heli ? 'GET EVERYONE ON THE PAD' : 'EVERYONE INTO THE SAFE ROOM') : opened >= gates ? (heli ? 'REACH THE LANDING ZONE' : 'REACH THE SAFE ROOM') : 'FIND A WAY THROUGH TO THE GATE';
      this.el.waveLabel.textContent = phase === 'extract' ? (heli ? 'EVAC' : 'SAFE ROOM') : name;
      this.el.waveLeft.textContent = phase === 'win' ? '' : `${dist} M`;
    }
  }

  banner(title, sub = '', secs = 2, note = '') {
    this.el.bt.textContent = title;
    this.el.bs.textContent = sub;
    this.el.bn.textContent = note;
    this.el.banner.classList.remove('on');
    void this.el.banner.offsetWidth;
    this.el.banner.classList.add('on');
    this.bannerT = secs;
  }

  toast(text) {
    this.el.toast.textContent = text;
    this.el.toast.classList.remove('on');
    this.el.toast.classList.toggle('long', text.length > 40);
    void this.el.toast.offsetWidth;
    this.el.toast.classList.add('on');
  }

  hint(text) { this.el.hint.textContent = text; this.el.hint.classList.toggle('on', !!text); }

  stick(kind, bx, by, x, y, on) {
    const s = kind === 'move' ? this.el.move : this.el.aim;
    s.classList.toggle('on', on);
    if (!on) return;
    s.style.transform = `translate(${bx}px, ${by}px)`;
    s.firstElementChild.style.transform = `translate(${x - bx}px, ${y - by}px)`;
  }

  end(win, s, why) {
    const e = this.el.end;
    e.classList.remove('hidden');
    const mm = Math.floor(s.time / 60), ss = String(Math.floor(s.time % 60)).padStart(2, '0');
    const cp = s.checkpoint || 0;
    const next = win && !s.last;
    const note = win
      ? (s.last ? 'You made it across the river. The city burns behind you; the dead are on the wrong side of the water.' : 'The safehouse is open: upgrade your guns with the cash and your survivor with skill points, then on to the next level.')
      : (cp > 0 ? `You made it past checkpoint ${cp} of ${s.gates}.` : 'You never got past the first gate.');
    $('.panel', e).innerHTML = `
      <div class="end-kicker">${win ? s.name : (why || 'THE ROUTE CLAIMED ANOTHER')}</div>
      <h1 class="${win ? 'win' : 'lose'}">${win ? 'SIGNAL ACQUIRED' : 'YOU DIED'}</h1>
      <div class="stats">
        <div><b>${s.kills}</b><span>KILLS</span></div>
        <div><b>${s.acc}%</b><span>ACCURACY</span></div>
        <div><b>${mm}:${ss}</b><span>TIME</span></div>
        <div class="cashbox"><b>$${s.cash}</b><span>LOOTED</span></div>
        ${s.best >= 5 ? `<div><b>×${s.best}</b><span>BEST STREAK</span></div>` : ''}
      </div>
      <p class="next">${note}</p>
      ${s.newGun ? `<div class="end-new">NEW WEAPON UNLOCKED · <b>${WEAPONS[s.newGun].name.toUpperCase()}</b> <small>waiting in the safehouse</small></div>` : ''}
      ${(s.mastered || []).map((m) => `<div class="end-new mast">MASTERY · <b>${WEAPONS[m.id].name.toUpperCase()}</b> earned the ${MASTERY.find((q) => q.key === m.att)?.name.toLowerCase()}</div>`).join('')}
      ${s.challenges ? `<div class="end-chal">${s.challenges.map((c) => `<div class="${c.done ? 'done' : ''} ${c.fresh ? 'fresh' : ''}"><i>${c.done ? '✓' : ''}</i><b>${c.name}</b><span>${c.text}</span>${c.fresh ? '<em>+1 SKILL POINT</em>' : ''}</div>`).join('')}</div>` : ''}
      ${s.xp ? `<div class="end-xp">+${s.xp} XP${s.points ? ` · <b>+${s.points} SKILL POINT${s.points > 1 ? 'S' : ''}</b>` : ''}</div>` : ''}
      <div class="wallet">WALLET <b>$${s.wallet}</b></div>
      <div class="end-buttons">
        ${!win && cp > 0 ? '<button class="btn primary retry-cp">FROM CHECKPOINT</button>' : ''}
        ${next ? '<button class="btn primary safe">SAFEHOUSE</button>' : '<button class="btn safe">SAFEHOUSE</button>'}
        ${win ? '' : '<button class="btn retry">FROM THE START</button>'}
        ${win ? '<button class="btn retry">PLAY AGAIN</button>' : ''}
        <button class="btn menu">MAIN MENU</button>
      </div>`;
    $('.retry', e)?.addEventListener('click', () => this.onRetry?.(false));
    $('.retry-cp', e)?.addEventListener('click', () => this.onRetry?.(true));
    $('.safe', e).addEventListener('click', () => this.onSafehouse?.());
    $('.menu', e).addEventListener('click', () => this.onQuit?.());
  }

  // the skill and throw buttons
  gear(game) {
    const sv = game.skills?.view(), E = this.el;
    E.skillBtn.classList.toggle('hidden', !sv);
    if (sv) {
      const S = SPECS[sv.spec];
      if (E.skillBtn.dataset.spec !== sv.spec) { E.skillBtn.dataset.spec = sv.spec; E.skIcon.innerHTML = ICONS[sv.spec]; E.skName.textContent = S.skill; E.skillBtn.style.setProperty('--c', S.color); }
      E.skillBtn.style.setProperty('--p', sv.frac.toFixed(3));
      E.skillBtn.classList.toggle('ready', sv.ready);
      const cd = sv.ready ? '' : String(sv.secs);
      if (E.skCd.textContent !== cd) E.skCd.textContent = cd;
      const n = sv.charges ? '×' + sv.charges : '';
      if (E.skN.textContent !== n) E.skN.textContent = n;
    }
    const tv = game.nades?.view();
    E.throwBtn.classList.toggle('hidden', !tv);
    if (tv) {
      if (E.throwBtn.dataset.kind !== tv.kind) { E.throwBtn.dataset.kind = tv.kind; E.thIcon.innerHTML = ICONS[tv.kind]; E.thName.textContent = NADES[tv.kind].name; E.throwBtn.style.setProperty('--c', NADES[tv.kind].color); }
      const n = String(tv.n);
      if (E.thN.textContent !== n) E.thN.textContent = n;
      E.throwBtn.classList.toggle('empty', tv.n <= 0);
    }
  }

  reset() {
    this.el.end.classList.add('hidden');
    this.el.pauseMenu.classList.add('hidden');
    this.vig = 0;
    this.el.vig.style.opacity = 0;
    this.bloodK = 0; this._bo = -1;
    this.el.ann.classList.remove('on');
  }

  // per frame: things that follow the world
  frame(game, dt) {
    const me = game.me;
    const cam = game.camera;
    const proj = (x, y, z) => {
      this._v.set(x, y, z).project(cam);
      return { x: (this._v.x * 0.5 + 0.5) * innerWidth, y: (-this._v.y * 0.5 + 0.5) * innerHeight };
    };
    // objective markers: a ring over each thing to reach or destroy, pinned to the screen edge (with an arrow) when off it
    const mks = game.markers?.() || [];
    this.el.marks.forEach((el, i) => {
      const m = mks[i];
      if (!m) { if (el._on) { el._on = false; el.style.display = 'none'; } return; }
      if (!el._on) { el._on = true; el.style.display = 'block'; }
      this._v.set(m.x, 2.4, m.z).project(cam);
      let x = this._v.x, y = this._v.y;
      if (this._v.z > 1) { x = -x; y = -y; }
      const pad = 0.86, off = Math.abs(x) > pad || Math.abs(y) > pad || this._v.z > 1;
      if (off) { const k = pad / Math.max(Math.abs(x), Math.abs(y)); x *= k; y *= k; }
      const sx = (x * 0.5 + 0.5) * innerWidth, sy = (-y * 0.5 + 0.5) * innerHeight;
      el.style.transform = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px)`;
      el.style.setProperty('--c', m.c);
      if (el._lb !== (m.label || '')) { el._lb = m.label || ''; el.lastChild.textContent = el._lb; }
      el.classList.toggle('off', off);
      if (off) el.firstChild.style.transform = `rotate(${(Math.atan2(-y, x) * 180 / Math.PI + 90).toFixed(0)}deg)`;
    });
    // damage vignette fades
    this.vig = Math.max(0, this.vig - dt * 0.9);
    const low = me.alive ? Math.max(0, (0.35 - me.hp / me.maxHp) / 0.35) * (0.55 + 0.25 * Math.sin(performance.now() / 180)) : 0.7;
    const vo = Math.round(Math.min(1, this.vig + low * 0.6) * 100) / 100;
    if (vo !== this._vo) { this._vo = vo; this.el.vig.style.opacity = vo; }
    this.bloodK = Math.max(0, this.bloodK - dt * 0.45);
    const bo = Math.round(Math.min(0.85, Math.max(this.bloodK, low * 0.4)) * 100) / 100;
    if (bo !== this._bo) { this._bo = bo; this.el.blood.style.opacity = bo; }
    // reload ring around the player
    if (me.reloadT > 0) {
      const p = proj(me.x, 0.1, me.z);
      this.el.ring.style.opacity = 1; this._ringOn = true;
      this.el.ring.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      const k = 1 - me.reloadT / me.W.reload;
      this.el.ringC.style.strokeDashoffset = 106.8 * (1 - k);
    } else if (this._ringOn) { this._ringOn = false; this.el.ring.style.opacity = 0; }
    // assist bracket on the target the pistol is locked to
    const t = me.assistTarget;
    if (t && t.alive && me.aiming) {
      const p = proj(t.x, 1.1, t.z);
      this.el.assist.style.opacity = 0.8; this._asOn = true;
      this.el.assist.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    } else if (this._asOn) { this._asOn = false; this.el.assist.style.opacity = 0; }
    // down
    const dn = me.down && !me.dead;
    if (dn !== this._dn) { this._dn = dn; this.el.down.classList.toggle('on', dn); }
    if (me.down) this.el.bleed.style.width = Math.max(0, 100 - me.downT / 30 * 100).toFixed(0) + '%';
    const rv = me.down && !me.dead && me.reviveT > 0.05;
    if (rv !== this._rv) { this._rv = rv; this.el.downSub.textContent = rv ? 'BEING PICKED UP… hold on' : game.players.size > 1 ? 'Keep shooting. A teammate standing next to you picks you up.' : 'Keep shooting.'; }
    // team bars
    if (this._mt === undefined || (this._mt -= dt) < 0) {            // teammates' bars: a few times a second is plenty
      this._mt = 0.2;
      for (const p of game.players.values()) {
        if (p === me) continue;
        const bar = this.root.querySelector(`.mate[data-id="${p.id}"] i`);
        if (bar) { bar.style.width = Math.max(0, p.hp / (p.maxHp || 100) * 100) + '%'; bar.parentElement.parentElement.classList.toggle('down', p.down); }
      }
    }
    if (this._bt === undefined || (this._bt -= dt) < 0) {
      this._bt = 0.15;
      const bz = game.bossZ?.();
      this.el.bossBar.classList.toggle('hidden', !bz);
      if (bz) { this.el.bossName.textContent = bz.def.name; this.el.bossFill.style.width = Math.max(0, bz.hp / bz.maxHp * 100).toFixed(1) + '%'; }
    }
    if (this._sk === undefined || (this._sk -= dt) < 0) { this._sk = 0.08; this.gear(game); }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.el.banner.classList.remove('on'); }
    game.paused = this.paused && game.role === 'solo';
  }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
