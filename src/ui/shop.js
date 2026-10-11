// The safehouse: spend what you looted on guns and on the survivor. A DOM overlay, so it is crisp on any phone and
// costs nothing while a level is running. Everything bought is written to the save straight away.
import { WEAPONS, WEAPON_IDS, WEAPON_UPGRADES, PERKS, upgradeCost, weaponStats } from '../game/weapons.js';
import { save } from '../game/save.js';
import { audio } from '../game/audio.js';
import { levelInfo } from '../game/level.js';

const BASE = import.meta.env.BASE_URL;
const $ = (sel, root) => root.querySelector(sel);
const money = (n) => '$' + n.toLocaleString('en-US');

export class Shop {
  constructor() {
    const el = this.el = document.createElement('div');
    el.id = 'shop';
    el.className = 'screen hidden';
    el.innerHTML = `
      <div class="shop-top">
        <div class="shop-title"><small>SAFEHOUSE</small><b>REARM</b></div>
        <div class="shop-tabs"><button data-tab="guns" class="on">GUNS</button><button data-tab="you">SURVIVOR</button></div>
        <div class="shop-wallet"><small>WALLET</small><b>$0</b></div>
      </div>
      <div class="shop-body"></div>
      <div class="shop-bottom">
        <button class="btn back">BACK</button>
        <div class="shop-msg"></div>
        <button class="btn primary deploy">DEPLOY</button>
      </div>`;
    document.body.appendChild(el);
    this.body = $('.shop-body', el);
    this.tab = 'guns';
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
    this.el.classList.remove('hidden');
    this.render();
  }

  close() { this.el.classList.add('hidden'); this.onClose?.(); }
  get isOpen() { return !this.el.classList.contains('hidden'); }

  flash(ok) {
    audio.play(ok ? 'buy' : 'deny', { vol: ok ? 0.8 : 0.7, jitter: 0 });
    const w = $('.shop-wallet', this.el);
    w.classList.remove('bump', 'deny');
    void w.offsetWidth;
    w.classList.add(ok ? 'bump' : 'deny');
  }

  pips(lv, max) { return Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join(''); }

  bar(label, v, max, text) {
    return `<div class="stat"><span>${label}</span><div class="sbar"><i style="width:${Math.min(100, v / max * 100).toFixed(0)}%"></i></div><em>${text}</em></div>`;
  }

  render() {
    const el = this.el, cash = save.cash;
    $('.shop-wallet b', el).textContent = money(cash);
    el.querySelectorAll('.shop-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    const keepScroll = this.body.scrollTop;
    this.body.innerHTML = this.tab === 'guns' ? this.gunsHtml() : this.perksHtml();
    this.body.scrollTop = keepScroll;
    // wiring
    this.body.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => { const r = save.buyWeapon(b.dataset.buy); this.flash(r.ok); this.render(); }));
    this.body.querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', () => { save.equip(b.dataset.equip); audio.play('swap', { vol: 0.7 }); this.render(); }));
    this.body.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => { const [id, key] = b.dataset.up.split(':'); const r = save.buyWeaponUpgrade(id, key); this.flash(r.ok); this.render(); }));
    this.body.querySelectorAll('[data-perk]').forEach((b) => b.addEventListener('click', () => { const r = save.buyPerk(b.dataset.perk); this.flash(r.ok); this.render(); }));
  }

  gunsHtml() {
    const d = save.data;
    return WEAPON_IDS.map((id) => {
      const W = WEAPONS[id], owned = save.owns(id);
      const st = weaponStats(id, owned ? d.weapons[id].lv : {});
      const rof = 1 / st.autoInterval;
      const stats = `
        ${this.bar('DAMAGE', st.dmg, 60, Math.round(st.dmg))}
        ${this.bar('FIRE RATE', rof, 14, rof.toFixed(1) + '/s')}
        ${this.bar('MAGAZINE', st.mag, 40, st.mag)}
        ${this.bar('RELOAD', 3 - st.reload, 3, st.reload.toFixed(1) + ' s')}`;
      let head;
      if (!owned) head = `<button class="btn primary buy" data-buy="${id}" ${save.cash < W.price ? 'disabled' : ''}>BUY · ${money(W.price)}</button>`;
      else if (d.equipped === id) head = '<span class="tag">EQUIPPED</span>';
      else head = `<button class="btn" data-equip="${id}">EQUIP</button>`;
      const ups = !owned ? '<div class="locked">Buy it to upgrade it.</div>' : WEAPON_UPGRADES.map((u) => {
        const lv = save.weaponLevel(id, u.key), maxed = lv >= u.max;
        const c = maxed ? 0 : upgradeCost(id, u.key, lv);
        return `<div class="up"><div class="up-name"><b>${u.name}</b><small>${u.desc}</small></div><div class="pips">${this.pips(lv, u.max)}</div>${maxed ? '<span class="tag dim">MAX</span>' : `<button class="btn small" data-up="${id}:${u.key}" ${save.cash < c ? 'disabled' : ''}>${money(c)}</button>`}</div>`;
      }).join('');
      return `<div class="gun ${owned ? '' : 'unowned'}">
        <div class="gun-head"><img src="${BASE}assets/weapons/${W.icon}" alt=""><div><b>${W.name}</b><small>${W.blurb}</small></div>${head}</div>
        <div class="gun-stats">${stats}</div>
        <div class="gun-ups">${ups}</div>
      </div>`;
    }).join('');
  }

  perksHtml() {
    const rows = PERKS.map((p) => {
      const lv = save.perkLevel(p.key), maxed = lv >= p.max, c = maxed ? 0 : p.cost[lv];
      return `<div class="perk"><div class="up-name"><b>${p.name}</b><small>${p.unit}</small></div><div class="pips">${this.pips(lv, p.max)}</div>${maxed ? '<span class="tag dim">MAX</span>' : `<button class="btn small" data-perk="${p.key}" ${save.cash < c ? 'disabled' : ''}>${money(c)}</button>`}</div>`;
    }).join('');
    const lo = save.loadout();
    return `<div class="perks"><div class="perk-sum">
      <div><b>${lo.maxHp}</b><span>HEALTH</span></div><div><b>${lo.maxArmor}</b><span>ARMOR</span></div>
      <div><b>${Math.round(lo.speed / 3.6 * 100)}%</b><span>SPEED</span></div><div><b>+${Math.round((lo.cashMul - 1) * 100)}%</b><span>CASH</span></div>
    </div>${rows}</div>`;
  }
}
