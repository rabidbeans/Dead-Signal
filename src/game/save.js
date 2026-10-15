// The survivor's wallet and kit, kept in this browser (localStorage). Nothing here is online: in
// co-op every player brings his own saved loadout and his own cash.
import { WEAPONS, WEAPON_IDS, WEAPON_UPGRADES, PERKS, upgradeCost, weaponStats, BASE_HP, BASE_SPEED } from './weapons.js';

const KEY = 'dead-signal-save-v1';
const blank = () => ({
  cash: 0,
  unlocked: 1,                                  // highest level you may start
  equipped: 'pistol',
  weapons: { pistol: { owned: true, lv: {} }, smg: { owned: false, lv: {} }, shotgun: { owned: false, lv: {} }, rifle: { owned: false, lv: {} }, lmg: { owned: false, lv: {} } },
  perks: {},
  best: {},
  runs: 0,
});

class Save {
  constructor() { this.data = blank(); this.load(); }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        this.data = { ...blank(), ...d, weapons: { ...blank().weapons, ...(d.weapons || {}) } };
        this.data.weapons.pistol.owned = true;
      }
    } catch (e) { /* private mode: it just will not persist */ }
  }

  write() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } }

  get cash() { return this.data.cash; }
  addCash(n) { this.data.cash = Math.max(0, Math.round(this.data.cash + n)); this.write(); }
  unlock(level) { if (level > this.data.unlocked) { this.data.unlocked = level; this.write(); } }
  get unlocked() { return this.data.unlocked; }

  owns(id) { return !!this.data.weapons[id]?.owned; }
  weaponLevel(id, key) { return this.data.weapons[id]?.lv[key] || 0; }
  perkLevel(key) { return this.data.perks[key] || 0; }

  // ---- shopping: each returns { ok, why }
  buyWeapon(id) {
    const w = WEAPONS[id];
    if (!w || this.owns(id)) return { ok: false, why: 'owned' };
    if (this.data.unlocked <= (w.unlock || 0)) return { ok: false, why: 'locked' };
    if (this.data.cash < w.price) return { ok: false, why: 'cash' };
    this.data.cash -= w.price;
    this.data.weapons[id].owned = true;
    this.data.equipped = id;
    this.write();
    return { ok: true };
  }

  buyWeaponUpgrade(id, key) {
    if (!this.owns(id)) return { ok: false, why: 'locked' };
    const u = WEAPON_UPGRADES.find((x) => x.key === key);
    const lv = this.weaponLevel(id, key);
    if (lv >= u.max) return { ok: false, why: 'max' };
    const c = upgradeCost(id, key, lv);
    if (this.data.cash < c) return { ok: false, why: 'cash' };
    this.data.cash -= c;
    this.data.weapons[id].lv[key] = lv + 1;
    this.write();
    return { ok: true };
  }

  buyPerk(key) {
    const p = PERKS.find((x) => x.key === key);
    const lv = this.perkLevel(key);
    if (lv >= p.max) return { ok: false, why: 'max' };
    const c = p.cost[lv];
    if (this.data.cash < c) return { ok: false, why: 'cash' };
    this.data.cash -= c;
    this.data.perks[key] = lv + 1;
    this.write();
    return { ok: true };
  }

  equip(id) { if (this.owns(id)) { this.data.equipped = id; this.write(); } }

  // everything a run needs to know about this survivor
  loadout() {
    const d = this.data;
    const weapons = {};
    for (const id of WEAPON_IDS) if (d.weapons[id]?.owned) weapons[id] = weaponStats(id, d.weapons[id].lv);
    const p = (k) => d.perks[k] || 0;
    return {
      weapons,
      equipped: d.weapons[d.equipped]?.owned ? d.equipped : 'pistol',
      maxHp: BASE_HP + 20 * p('hp'),
      maxArmor: 25 * p('armor'),
      speed: BASE_SPEED * (1 + 0.05 * p('speed')),
      cashMul: 1 + 0.15 * p('cash'),
    };
  }
}

export const save = new Save();
