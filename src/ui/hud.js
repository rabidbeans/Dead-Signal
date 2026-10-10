// The in-game HUD: DOM over the canvas (crisp text, cheap to update).
import * as THREE from 'three';
import { PISTOL } from '../game/player.js';

const $ = (sel, root = document) => root.querySelector(sel);

export class HUD {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-top">
        <div class="hp">
          <div class="hp-name"></div>
          <div class="hp-bar"><div class="hp-fill"></div><div class="hp-ticks"></div></div>
          <div class="team"></div>
        </div>
        <div class="wave"><span class="wave-label"></span><span class="wave-left"></span></div>
        <button class="pause" aria-label="Pause"><span></span><span></span></button>
      </div>
      <div class="weapon">
        <img class="weapon-icon" src="${import.meta.env.BASE_URL}assets/weapons/pistol_icon.webp" alt="">
        <div class="ammo"><span class="ammo-n">12</span><span class="ammo-r">/ ∞</span></div>
        <div class="weapon-name">${PISTOL.name}</div>
      </div>
      <button class="reload-btn" aria-label="Reload"><svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg></button>
      <div class="stick move"><div class="knob"></div></div>
      <div class="stick aim"><div class="knob"></div></div>
      <div class="reload-ring"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17"/></svg></div>
      <div class="assist"></div>
      <div class="vignette"></div>
      <div class="banner"><div class="banner-title"></div><div class="banner-sub"></div><div class="banner-note"></div></div>
      <div class="down-msg"><b>YOU'RE DOWN</b><span>Keep shooting. A teammate can pull you up.</span><div class="bleed"><i></i></div></div>
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
      waveLabel: $('.wave-label', root), waveLeft: $('.wave-left', root),
      ammoN: $('.ammo-n', root), weapon: $('.weapon', root),
      move: $('.stick.move', root), aim: $('.stick.aim', root),
      ring: $('.reload-ring', root), ringC: $('.reload-ring circle', root),
      assist: $('.assist', root), vig: $('.vignette', root),
      banner: $('.banner', root), bt: $('.banner-title', root), bs: $('.banner-sub', root), bn: $('.banner-note', root),
      down: $('.down-msg', root), bleed: $('.bleed i', root), toast: $('.toast', root), hint: $('.hint', root),
      pause: $('.pause', root), pauseMenu: $('.pause-menu', root), end: $('.end', root),
      reloadBtn: $('.reload-btn', root),
    };
    this.vig = 0;
    this.bannerT = 0;
    this.reloadT = 0;
    this.reloadMax = 1;
    this.onReload = null;
    this.onQuit = null;
    this.onRetry = null;
    this.el.reloadBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.onReload?.(); });
    this.el.pause.addEventListener('click', () => this.el.pauseMenu.classList.remove('hidden'));
    $('.resume', root).addEventListener('click', () => this.el.pauseMenu.classList.add('hidden'));
    $('.quit', root).addEventListener('click', () => this.onQuit?.());
    this._v = new THREE.Vector3();
  }

  show(on) { this.root.classList.toggle('hidden', !on); }
  get paused() { return !this.el.pauseMenu.classList.contains('hidden'); }

  // -------------------------------------------------------------- bits --
  health(hp) {
    this.el.fill.style.width = Math.max(0, hp) + '%';
    this.el.fill.classList.toggle('low', hp <= 35);
  }

  ammo(p) {
    this.el.ammoN.textContent = p.ammo;
    this.el.ammoN.classList.toggle('empty', p.ammo === 0);
    this.el.weapon.classList.remove('kick');
    void this.el.weapon.offsetWidth;
    this.el.weapon.classList.add('kick');
  }

  reload(t) { this.reloadT = t; this.reloadMax = t; }

  damage(dmg, hp) {
    this.vig = Math.min(1, this.vig + dmg / 25);
    this.health(hp);
  }

  killConfirm() {
    this.el.weapon.classList.remove('kill');
    void this.el.weapon.offsetWidth;
    this.el.weapon.classList.add('kill');
  }

  team(players, me) {
    this.el.name.textContent = me.name.toUpperCase();
    this.el.team.innerHTML = players.filter((p) => p !== me).map((p) => `
      <div class="mate" data-id="${p.id}"><span>${escapeHtml(p.name)}</span><div class="mate-bar"><i></i></div></div>`).join('');
  }

  wave(phase, wave, waves, left) {
    if (phase === 'intro') { this.el.waveLabel.textContent = 'STAND BY'; this.el.waveLeft.textContent = ''; return; }
    this.el.waveLabel.textContent = `WAVE ${wave + 1} / ${waves}`;
    this.el.waveLeft.textContent = phase === 'wave' ? `${left} LEFT` : phase === 'break' ? 'BREATHE' : '';
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
    $('.panel', e).innerHTML = `
      <div class="end-kicker">${win ? 'LEVEL 1 · THE CHECKPOINT' : (why || 'THE CHECKPOINT FELL')}</div>
      <h1 class="${win ? 'win' : 'lose'}">${win ? 'SIGNAL ACQUIRED' : 'YOU DIED'}</h1>
      <div class="stats">
        <div><b>${s.kills}</b><span>KILLS</span></div>
        <div><b>${s.acc}%</b><span>ACCURACY</span></div>
        <div><b>${s.crits}</b><span>CRITICALS</span></div>
        <div><b>${win ? s.waves : s.wave}/${s.waves}</b><span>WAVES</span></div>
      </div>
      ${win ? '<p class="next">Level 2 and new weapons are next. Hold on to that pistol.</p>' : ''}
      <div class="end-buttons">
        <button class="btn primary retry">${win ? 'PLAY AGAIN' : 'TRY AGAIN'}</button>
        <button class="btn menu">MAIN MENU</button>
      </div>`;
    $('.retry', e).addEventListener('click', () => this.onRetry?.());
    $('.menu', e).addEventListener('click', () => this.onQuit?.());
  }

  reset() {
    this.el.end.classList.add('hidden');
    this.el.pauseMenu.classList.add('hidden');
    this.vig = 0;
    this.el.vig.style.opacity = 0;
  }

  // per frame: things that follow the world
  frame(game, dt) {
    const me = game.me;
    const cam = game.camera;
    const proj = (x, y, z) => {
      this._v.set(x, y, z).project(cam);
      return { x: (this._v.x * 0.5 + 0.5) * innerWidth, y: (-this._v.y * 0.5 + 0.5) * innerHeight };
    };
    // damage vignette fades
    this.vig = Math.max(0, this.vig - dt * 0.9);
    const low = me.alive ? Math.max(0, (35 - me.hp) / 35) * (0.55 + 0.25 * Math.sin(performance.now() / 180)) : 0.7;
    this.el.vig.style.opacity = Math.min(1, this.vig + low * 0.6);
    // reload ring around the player
    if (me.reloadT > 0) {
      const p = proj(me.x, 0.1, me.z);
      this.el.ring.style.opacity = 1;
      this.el.ring.style.transform = `translate(${p.x}px, ${p.y}px)`;
      const k = 1 - me.reloadT / PISTOL.reload;
      this.el.ringC.style.strokeDashoffset = 106.8 * (1 - k);
    } else this.el.ring.style.opacity = 0;
    // assist bracket on the target the pistol is locked to
    const t = me.assistTarget;
    if (t && t.alive && me.aiming) {
      const p = proj(t.x, 1.1, t.z);
      this.el.assist.style.opacity = 0.8;
      this.el.assist.style.transform = `translate(${p.x}px, ${p.y}px)`;
    } else this.el.assist.style.opacity = 0;
    // down
    this.el.down.classList.toggle('on', me.down && !me.dead);
    if (me.down) this.el.bleed.style.width = Math.max(0, 100 - me.downT / 30 * 100) + '%';
    // team bars
    for (const p of game.players.values()) {
      if (p === me) continue;
      const bar = this.root.querySelector(`.mate[data-id="${p.id}"] i`);
      if (bar) { bar.style.width = Math.max(0, p.hp) + '%'; bar.parentElement.parentElement.classList.toggle('down', p.down); }
    }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.el.banner.classList.remove('on'); }
    game.paused = this.paused && game.role === 'solo';
  }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
