// The safehouse. Two tabs, two currencies (Sam, 2026-10-21):
//   GUNS      cash buys upgrades, then the PROTOTYPE refit on a maxed gun. Guns themselves are never bought: beating a
//             level hands you its gun. Kills with a gun earn its MASTERY attachments for free.
//   SURVIVOR  skill points buy health, armor and speed, and level up the chosen SPECIALTY's skill.
// A DOM overlay, so it is crisp on any phone and costs nothing while a level runs. Everything bought is saved at once.
import { WEAPONS, WEAPON_IDS, WEAPON_UPGRADES, PERKS, PROTO, MASTERY, upgradeCost, maxedOut } from '../game/weapons.js';
import { SPECS, SPEC_IDS, nodeCost, XP_PER_POINT } from '../game/skills.js';
import { save } from '../game/save.js';
import { audio } from '../game/audio.js';
import { levelInfo } from '../game/level.js';
import { ICONS } from './hud.js';
import { Reveal } from './reveal.js';

const BASE = import.meta.env.BASE_URL;
const $ = (sel, root) => root.querySelector(sel);
const money = (n) => '$' + n.toLocaleString('en-US');
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export class Shop {
  constructor() {
    const el = this.el = document.createElement('div');
    el.id = 'shop';
    el.className = 'screen hidden';
    el.innerHTML = `
      <div class="shop-top">
        <div class="shop-title"><small>SAFEHOUSE</small><b>REARM</b></div>
        <div class="shop-tabs"><button data-tab="guns" class="on">GUNS</button><button data-tab="you">SURVIVOR</button></div>
        <div class="shop-wallet"><small>CASH · SKILL POINTS</small><b class="cashv">$0</b><b class="spv">0 SP</b></div>
      </div>
      <div class="shop-note hidden"></div>
      <div class="shop-body"></div>
      <div class="shop-bottom">
        <button class="btn back">BACK</button>
        <div class="shop-msg"></div>
        <button class="btn primary deploy">DEPLOY</button>
      </div>`;
    document.body.appendChild(el);
    this.body = $('.shop-body', el);
    this.tab = 'guns';
    this.reveal = new Reveal();
    el.querySelectorAll('.shop-tabs button').forEach((b) => b.addEventListener('click', () => { this.tab = b.dataset.tab; this.render(); audio.play('click', { vol: 0.5, jitter: 0 }); }));
    $('.back', el).addEventListener('click', () => this.close());
    $('.deploy', el).addEventListener('click', () => { audio.play('click', { vol: 0.6, jitter: 0 }); this.onDeploy?.(); });
    this.onDeploy = null; this.onClose = null;
  }

  // opts: { level (the one DEPLOY starts), deploy: fn | null, why: text when DEPLOY is not allowed }
  open(opts = {}) {
    this.opts = opts;
    this.onDeploy = opts.deploy || null;
    this.onClose = opts.onClose || null;
    const d = $('.deploy', this.el);
    d.classList.toggle('hidden', !opts.level);
    d.disabled = !opts.deploy;
    d.textContent = opts.deploy ? `DEPLOY · LEVEL ${opts.level}` : (opts.why || 'WAITING FOR THE HOST');
    $('.shop-msg', this.el).textContent = opts.level ? levelInfo(opts.level).name : '';
    // an older save was upgraded: say what changed, once
    const mg = save.data.migrated, note = $('.shop-note', this.el);
    if (mg) {
      note.innerHTML = `<b>THE SAFEHOUSE HAS CHANGED.</b> Guns are free now: each one opens when you beat its level. Cash is only for gun upgrades and prototype refits; health, armor and speed cost skill points. ${mg.refund ? `You got <em>${money(mg.refund)}</em> back for what you bought before. ` : ''}${mg.sp ? `You have <em>${mg.sp} skill points</em> for the levels you have beaten.` : ''}`;
      note.innerHTML += ' <u>OK</u>';
      note.onclick = () => note.classList.add('hidden');
      note.classList.remove('hidden');
      delete save.data.migrated; save.write();
    } else note.classList.add('hidden');
    this.el.classList.remove('hidden');
    this.render();
    // a gun opened since the last visit: its crate is the first thing you see
    const fresh = save.unseen();
    if (fresh.length) this.reveal.show(fresh[0], () => { save.markSeen(fresh[0]); save.equip(fresh[0]); this.render(); if (save.unseen().length) this.open(this.opts); });
  }

  close() { this.reveal.hide(); this.el.classList.add('hidden'); this.onClose?.(); }
  get isOpen() { return !this.el.classList.contains('hidden'); }

  flash(ok, which = 'cash') {
    audio.play(ok ? 'buy' : 'deny', { vol: ok ? 0.8 : 0.7, jitter: 0 });
    const w = $(which === 'cash' ? '.cashv' : '.spv', this.el);
    w.classList.remove('bump', 'deny');
    void w.offsetWidth;
    w.classList.add(ok ? 'bump' : 'deny');
  }

  pips(lv, max) { return Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join(''); }

  bar(label, v, max, text) {
    return `<div class="stat"><span>${label}</span><div class="sbar"><i style="width:${Math.min(100, v / max * 100).toFixed(0)}%"></i></div><em>${text}</em></div>`;
  }

  render() {
    const el = this.el;
    $('.cashv', el).textContent = money(save.cash);
    $('.spv', el).textContent = `${save.data.sp} SP`;
    el.querySelectorAll('.shop-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    const keepScroll = this.body.scrollTop;
    this.body.innerHTML = this.tab === 'guns' ? this.gunsHtml() : this.youHtml();
    this.body.scrollTop = keepScroll;
    // wiring
    const on = (sel, fn) => this.body.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => fn(b)));
    on('[data-equip]', (b) => { save.equip(b.dataset.equip); audio.play('swap', { vol: 0.7 }); this.render(); });
    on('[data-up]', (b) => { const [id, key] = b.dataset.up.split(':'); const r = save.buyWeaponUpgrade(id, key); this.flash(r.ok); this.render(); });
    on('[data-proto]', (b) => { const r = save.buyProto(b.dataset.proto); this.flash(r.ok); if (r.ok) { audio.play('power', { vol: 0.8, jitter: 0 }); } this.render(); });
    on('[data-look]', (b) => { this.reveal.show(b.dataset.look, () => this.render(), { replay: true }); });
    on('[data-perk]', (b) => { const r = save.buyPerk(b.dataset.perk); this.flash(r.ok, 'sp'); this.render(); });
    on('[data-spec]', (b) => { save.pickSpec(b.dataset.spec); audio.play('swap', { vol: 0.7 }); this.render(); });
    on('[data-node]', (b) => { const [sp, key] = b.dataset.node.split(':'); const r = save.buySkill(sp, key); this.flash(r.ok, 'sp'); this.render(); });
  }

  gunsHtml() {
    const d = save.data;
    return WEAPON_IDS.map((id) => {
      const W = WEAPONS[id], owned = save.owns(id), w = d.weapons[id];
      const st = save.gunStats(id);
      const rof = 1 / st.autoInterval;
      const stats = `
        ${this.bar('DAMAGE', st.dmg * (st.pellets || 1), 160, st.pellets ? `${Math.round(st.dmg)}×${st.pellets}` : Math.round(st.dmg))}
        ${this.bar('FIRE RATE', rof, 14, rof.toFixed(1) + '/s')}
        ${this.bar('MAGAZINE', st.mag, 200, st.mag)}
        ${this.bar('RELOAD', 4.2 - st.reload, 3.7, st.reload.toFixed(1) + ' s')}`;
      let head;
      if (!owned) head = `<span class="tag dim">BEAT LEVEL ${W.unlock}</span>`;
      else if (d.equipped === id) head = '<span class="tag">EQUIPPED</span>';
      else head = `<button class="btn" data-equip="${id}">EQUIP</button>`;
      const P = PROTO[id];
      if (!owned) {
        return `<div class="gun unowned">
          <div class="gun-head"><img src="${BASE}assets/weapons/${W.icon}" alt=""><div><b>${W.name}</b><small>${W.blurb}</small></div>${head}</div>
          <div class="gun-stats">${stats}</div>
          <div class="locked">Beat level ${W.unlock} and it is yours: no cash needed.</div>
        </div>`;
      }
      const ups = WEAPON_UPGRADES.map((u) => {
        const lv = save.weaponLevel(id, u.key), maxed = lv >= u.max;
        const c = maxed ? 0 : upgradeCost(id, u.key, lv);
        return `<div class="up"><div class="up-name"><b>${u.name}</b><small>${u.desc}</small></div><div class="pips">${this.pips(lv, u.max)}</div>${maxed ? '<span class="tag dim">MAX</span>' : `<button class="btn small" data-up="${id}:${u.key}" ${save.cash < c ? 'disabled' : ''}>${money(c)}</button>`}</div>`;
      }).join('');
      // mastery: the attachments its kills have earned, and how far to the next
      const kills = w.kills || 0;
      const next = MASTERY.find((m) => kills < m.kills);
      const prev = [...MASTERY].reverse().find((m) => kills >= m.kills);
      const span0 = prev ? prev.kills : 0, frac = next ? (kills - span0) / (next.kills - span0) : 1;
      const chips = MASTERY.map((m) => `<span class="mchip ${kills >= m.kills ? 'on' : ''}" title="${m.desc}">${m.name}</span>`).join('');
      const mastery = `<div class="mastery"><div class="mhead"><b>MASTERY</b><small>${kills} kills${next ? ` · ${next.kills - kills} more for the ${next.name.toLowerCase()} (${next.desc})` : ' · fully mastered'}</small></div><div class="mbar"><i style="width:${(frac * 100).toFixed(0)}%"></i></div><div class="mchips">${chips}</div></div>`;
      // the prototype refit
      let proto;
      if (w.proto) proto = `<div class="proto on" style="--pc:${hex(P.color)}"><b>PROTOTYPE · ${P.name}</b><small>${P.desc}</small></div>`;
      else if (maxedOut(w.lv)) proto = `<div class="proto ready" style="--pc:${hex(P.color)}"><div><b>PROTOTYPE REFIT · ${P.name}</b><small>${P.desc}</small></div><button class="btn small" data-proto="${id}" ${save.cash < P.cost ? 'disabled' : ''}>${money(P.cost)}</button></div>`;
      else proto = `<div class="proto locked" style="--pc:${hex(P.color)}"><b>PROTOTYPE · ${P.name}</b><small>Max every upgrade above to unlock the refit: ${P.desc.charAt(0).toLowerCase() + P.desc.slice(1)}</small></div>`;
      return `<div class="gun ${w.proto ? 'is-proto' : ''}" style="--pc:${hex(P.color)}">
        <div class="gun-head"><img src="${BASE}assets/weapons/${W.icon}" alt="" class="${st.gold ? 'gold' : ''}" data-look="${id}"><div><b>${w.proto ? P.name : W.name}</b><small>${w.proto ? W.name + ', rebuilt' : W.blurb}</small></div>${head}</div>
        <div class="gun-stats">${stats}</div>
        <div class="gun-ups">${ups}</div>
        ${proto}
        ${mastery}
      </div>`;
    }).join('');
  }

  youHtml() {
    const d = save.data, lo = save.loadout();
    const perks = PERKS.map((p) => {
      const lv = save.perkLevel(p.key), maxed = lv >= p.max, c = maxed ? 0 : p.cost[lv];
      return `<div class="perk"><div class="up-name"><b>${p.name}</b><small>${p.unit}</small></div><div class="pips">${this.pips(lv, p.max)}</div>${maxed ? '<span class="tag dim">MAX</span>' : `<button class="btn small sp" data-perk="${p.key}" ${d.sp < c ? 'disabled' : ''}>${c} SP</button>`}</div>`;
    }).join('');
    const xpFrac = d.xp / XP_PER_POINT;
    const specs = SPEC_IDS.map((sid) => {
      const S = SPECS[sid], on = d.spec === sid;
      return `<button class="spec ${on ? 'on' : ''}" data-spec="${sid}" style="--c:${S.color}"><i>${ICONS[sid]}</i><b>${S.name}</b><em>${S.skill}</em><small>${S.blurb}</small><small class="pas">${S.passive}</small>${on ? '<span class="tag">CHOSEN</span>' : ''}</button>`;
    }).join('');
    const cur = d.spec && SPECS[d.spec];
    const nodes = cur ? cur.nodes.map((n) => {
      const lv = save.skillLevel(d.spec, n.key), maxed = lv >= n.max, c = nodeCost(lv);
      return `<div class="perk"><div class="up-name"><b>${n.name}</b><small>${n.desc}</small></div><div class="pips">${this.pips(lv, n.max)}</div>${maxed ? '<span class="tag dim">MAX</span>' : `<button class="btn small sp" data-node="${d.spec}:${n.key}" ${d.sp < c ? 'disabled' : ''}>${c} SP</button>`}</div>`;
    }).join('') : '<div class="locked">Pick a specialty above: it gives you a skill on its own button in every level.</div>';
    return `<div class="perks">
      <div class="perk-sum">
        <div><b>${lo.maxHp}</b><span>HEALTH</span></div><div><b>${lo.maxArmor}</b><span>ARMOR</span></div>
        <div><b>${Math.round(lo.speed / 3.6 * 100)}%</b><span>SPEED</span></div><div><b>${d.sp}</b><span>SKILL POINTS</span></div>
      </div>
      <div class="xpline"><span>NEXT POINT</span><div class="mbar"><i style="width:${(xpFrac * 100).toFixed(0)}%"></i></div><em>${d.xp} / ${XP_PER_POINT} XP</em></div>
      <p class="hintp">Skill points come from experience: every kill, more for the big ones and bosses, and a bonus for getting out alive.</p>
      ${perks}
    </div>
    <div class="perks specs-box">
      <div class="mhead"><b>SPECIALTY</b><small>One skill on its own button. Change it any time here.</small></div>
      <div class="specs">${specs}</div>
      ${cur ? `<div class="mhead"><b>${cur.skill}</b><small>level it up with skill points</small></div>` : ''}
      ${nodes}
    </div>`;
  }
}
