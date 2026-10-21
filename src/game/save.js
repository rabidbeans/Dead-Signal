// The survivor's wallet, kit and skills, kept in this browser (localStorage). Nothing here is online: in co-op every
// player brings his own saved loadout, his own cash and his own skill points.
//
// Two currencies (Sam, 2026-10-21: "save the money only for upgrading weapons rather than unlocking them"):
//   CASH          looted from the dead, gates and getting out. It buys gun upgrades and the prototype refit. Nothing else.
//   SKILL POINTS  one for every XP_PER_POINT experience (kills, bosses, wins). They buy the survivor perks (health,
//                 armor, speed) and the specialty's upgrades.
// Guns are not bought: beating level N hands you the gun that opens there (WEAPONS[id].unlock).
import { WEAPONS, WEAPON_IDS, WEAPON_UPGRADES, PERKS, OLD_SCAVENGER, upgradeCost, weaponStats, maxedOut, PROTO, BASE_HP, BASE_SPEED } from './weapons.js';
import { SPECS, SPEC_IDS, nodeCost, XP_PER_POINT } from './skills.js';

const KEY = 'dead-signal-save-v1';
const MIG = 2;                                  // save format: 2 = guns free, perks on skill points, mastery, specialties
const gunRec = () => ({ owned: false, lv: {}, kills: 0, proto: false });
const blank = () => ({
  mig: MIG,
  cash: 0,
  unlocked: 1,                                  // highest level you may start
  equipped: 'pistol',
  weapons: Object.fromEntries(WEAPON_IDS.map((id) => [id, { ...gunRec(), owned: id === 'pistol' }])),
  seen: ['pistol'],                             // guns whose unlock has been shown (the crate in the safehouse)
  perks: {},
  xp: 0, sp: 0,                                 // experience toward the next point, unspent skill points
  spec: null,                                   // the chosen specialty
  skills: Object.fromEntries(SPEC_IDS.map((id) => [id, {}])),
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
        const b = blank();
        this.data = { ...b, ...d, weapons: { ...b.weapons }, skills: { ...b.skills, ...(d.skills || {}) } };
        for (const id of WEAPON_IDS) this.data.weapons[id] = { ...gunRec(), ...(d.weapons?.[id] || {}) };
        if ((d.mig || 1) < MIG) this.migrate(d);
      }
    } catch (e) { console.warn('save', e); /* private mode: it just will not persist */ }
    this.grant();
  }

  // an older save: guns used to be bought and perks paid in cash. Give back what is now free or gone.
  migrate(d) {
    const D = this.data;
    let refund = 0;
    for (const id of WEAPON_IDS) if (id !== 'pistol' && d.weapons?.[id]?.owned) refund += WEAPONS[id].price || 0;
    const sc = d.perks?.cash || 0;
    for (let i = 0; i < sc; i++) refund += OLD_SCAVENGER[i];
    delete D.perks.cash;
    D.cash += refund;
    // the guns you already had need no crate
    D.seen = WEAPON_IDS.filter((id) => id === 'pistol' || d.weapons?.[id]?.owned);
    // skill points for the levels already beaten
    D.sp += 3 * Math.max(0, (d.unlocked || 1) - 1);
    D.mig = MIG;
    D.migrated = { refund, sp: D.sp };            // the safehouse says so once
    this.write();
  }

  // every gun whose level has been beaten is yours
  grant() {
    for (const id of WEAPON_IDS) if (this.data.unlocked > (WEAPONS[id].unlock || 0)) this.data.weapons[id].owned = true;
  }

  // start over: everything back to a fresh survivor (Sam: "a way to reset your character so that you can start new")
  reset() { this.data = blank(); this.write(); }

  write() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } }

  get cash() { return this.data.cash; }
  addCash(n) { this.data.cash = Math.max(0, Math.round(this.data.cash + n)); this.write(); }
  unlock(level) { if (level > this.data.unlocked) { this.data.unlocked = level; this.grant(); this.write(); } }
  get unlocked() { return this.data.unlocked; }

  owns(id) { return !!this.data.weapons[id]?.owned; }
  weaponLevel(id, key) { return this.data.weapons[id]?.lv[key] || 0; }
  perkLevel(key) { return this.data.perks[key] || 0; }
  kills(id) { return this.data.weapons[id]?.kills || 0; }
  hasProto(id) { return !!this.data.weapons[id]?.proto; }
  // guns that are yours but whose crate has not been opened yet
  unseen() { return WEAPON_IDS.filter((id) => this.owns(id) && !this.data.seen.includes(id)); }
  markSeen(id) { if (!this.data.seen.includes(id)) { this.data.seen.push(id); this.write(); } }

  // ---- experience: kills and wins. Returns how many new points this earned.
  addXp(n) {
    const D = this.data;
    D.xp += n;
    let got = 0;
    while (D.xp >= XP_PER_POINT) { D.xp -= XP_PER_POINT; D.sp++; got++; }
    return got;
  }
  // kills with each gun, for mastery
  addKills(byGun) {
    for (const [id, n] of Object.entries(byGun)) if (this.data.weapons[id]) this.data.weapons[id].kills += n;
  }

  // ---- shopping: each returns { ok, why }
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

  buyProto(id) {
    const w = this.data.weapons[id];
    if (!this.owns(id) || w.proto) return { ok: false, why: 'owned' };
    if (!maxedOut(w.lv)) return { ok: false, why: 'locked' };
    const c = PROTO[id].cost;
    if (this.data.cash < c) return { ok: false, why: 'cash' };
    this.data.cash -= c;
    w.proto = true;
    this.write();
    return { ok: true };
  }

  buyPerk(key) {
    const p = PERKS.find((x) => x.key === key);
    const lv = this.perkLevel(key);
    if (lv >= p.max) return { ok: false, why: 'max' };
    const c = p.cost[lv];
    if (this.data.sp < c) return { ok: false, why: 'points' };
    this.data.sp -= c;
    this.data.perks[key] = lv + 1;
    this.write();
    return { ok: true };
  }

  skillLevel(spec, key) { return this.data.skills[spec]?.[key] || 0; }
  pickSpec(id) { if (SPECS[id]) { this.data.spec = id; this.write(); } }
  buySkill(spec, key) {
    const n = SPECS[spec]?.nodes.find((x) => x.key === key);
    if (!n) return { ok: false, why: 'max' };
    const lv = this.skillLevel(spec, key);
    if (lv >= n.max) return { ok: false, why: 'max' };
    const c = nodeCost(lv);
    if (this.data.sp < c) return { ok: false, why: 'points' };
    this.data.sp -= c;
    this.data.skills[spec][key] = lv + 1;
    this.write();
    return { ok: true };
  }

  equip(id) { if (this.owns(id)) { this.data.equipped = id; this.write(); } }

  // a gun's stats as this survivor has it: upgrades, mastery attachments, the prototype refit
  gunStats(id) { const w = this.data.weapons[id]; return weaponStats(id, w.lv, { kills: w.kills, proto: w.proto }); }

  // everything a run needs to know about this survivor
  loadout() {
    const d = this.data;
    const weapons = {};
    for (const id of WEAPON_IDS) if (d.weapons[id]?.owned) weapons[id] = this.gunStats(id);
    const p = (k) => d.perks[k] || 0;
    const spec = d.spec && SPECS[d.spec] ? d.spec : null;
    return {
      weapons,
      equipped: d.weapons[d.equipped]?.owned ? d.equipped : 'pistol',
      maxHp: BASE_HP + 20 * p('hp'),
      maxArmor: 25 * p('armor'),
      speed: BASE_SPEED * (1 + 0.05 * p('speed')) * (spec === 'scout' ? 1.08 : 1),
      cashMul: 1,
      spec, skills: spec ? { ...d.skills[spec] } : {},
    };
  }
}

export const save = new Save();
