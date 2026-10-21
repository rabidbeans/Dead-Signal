// Every gun, its upgrade ladder, and the survivor perks that the safehouse sells.
// Numbers are the BASE stats; `weaponStats(id, levels)` applies what has been bought.
const deg = (d) => d * Math.PI / 180;

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Service Pistol', model: 'pistol', icon: 'pistol_icon.webp', blurb: 'Accurate, hard-hitting, slow. Always with you.',
    dmg: 36, crit: 2.6, mag: 12, tapInterval: 0.2, autoInterval: 0.29, reload: 1.55,
    spreadBase: deg(1.2), spreadAdd: deg(1.2), spreadMax: deg(5), spreadRecover: deg(8), spreadMove: deg(1),
    range: 30, assistAcquire: deg(10), assistHold: deg(16), assistRange: 12, assistBend: 0.65, magnet: 0.4,
    kick: 0.2, trauma: 0.12, recoil: 26, shot: 'pistol', shellVol: 0.25, duck: 0.45, price: 0,
    magStep: 4, tip: [0.145, 0.061, 0], spare: [0.002, 0.027, 0], unlock: 0, costK: 1,
  },
  smg: {
    id: 'smg', name: 'SMG-9', model: 'smg', icon: 'smg_icon.webp', blurb: 'Twelve rounds a second. Thirty in the mag. Loud.',
    dmg: 19, crit: 2.0, mag: 30, tapInterval: 0.1, autoInterval: 0.085, reload: 1.9,
    spreadBase: deg(2.0), spreadAdd: deg(0.55), spreadMax: deg(6.5), spreadRecover: deg(10), spreadMove: deg(1.6),
    range: 25, assistAcquire: deg(9), assistHold: deg(15), assistRange: 11, assistBend: 0.5, magnet: 0.35,
    kick: 0.06, trauma: 0.045, recoil: 11, shot: 'smg', shellVol: 0.12, duck: 0.8, price: 1400,
    magStep: 6, tip: [0.365, 0.052, 0], spare: [-0.112, 0.105, 0], unlock: 1, costK: 1.15,
  },
  // a new gun opens in the safehouse for every level you beat (`unlock` = the level to beat)
  shotgun: {
    id: 'shotgun', name: 'Breacher 12', model: 'shotgun', icon: 'shotgun_icon.webp', blurb: 'Pump-action. Ten heavy pellets that tear through a crowd and throw the dead back.',
    // (Sam: "shotgun seems weak": 8 x 17 with a steep falloff dropped ~1 body a blast. Now 10 x 44, pellets go on
    // through the first body into the next at 60%, a blast knocks bodies back and staggers them, and it cycles faster.
    // Measured into a crowd of five 132-hp dead (level 3): ~2 drop per blast at 3-8 m, ~0.2 at 12 m)
    dmg: 44, crit: 1.6, pellets: 10, falloff: 0.45, pierce: 1, knock: 2.4, mag: 6, tapInterval: 0.6, autoInterval: 0.66, reload: 2.3,
    spreadBase: deg(11), spreadAdd: 0, spreadMax: deg(11), spreadRecover: deg(20), spreadMove: deg(2),
    range: 16, assistAcquire: deg(14), assistHold: deg(20), assistRange: 10, assistBend: 0.4, magnet: 0.3,
    kick: 0.5, trauma: 0.26, recoil: 42, shot: 'shotgun', shellVol: 0.35, duck: 0.3, price: 2600,
    magStep: 2, tip: [0.623, 0.03, 0], spare: [-0.116, 0.01, 0.034], unlock: 2, costK: 1.3,
    pump: 0.25, noDrop: true, snd: { release: null, magout: 'mag_in', magin: 'mag_in', rack: 'pump' },
  },
  rifle: {
    id: 'rifle', name: 'AR-7 Carbine', model: 'rifle', icon: 'rifle_icon.webp', blurb: 'Accurate full-auto. Hits hard at range.',
    dmg: 30, crit: 2.2, mag: 30, tapInterval: 0.11, autoInterval: 0.105, reload: 2.1,
    spreadBase: deg(1.0), spreadAdd: deg(0.35), spreadMax: deg(3.5), spreadRecover: deg(9), spreadMove: deg(1.2),
    range: 34, assistAcquire: deg(9), assistHold: deg(15), assistRange: 13, assistBend: 0.55, magnet: 0.35,
    kick: 0.1, trauma: 0.06, recoil: 15, shot: 'rifle', shellVol: 0.14, duck: 0.7, price: 4200,
    magStep: 6, tip: [0.606, 0.058, 0], spare: [-0.11, 0.12, 0], unlock: 3, costK: 1.45,
  },
  lmg: {
    id: 'lmg', name: 'M-60 Hailstorm', model: 'lmg', icon: 'lmg_icon.webp', blurb: 'A hundred-round belt. Heavy: you move slower.',
    dmg: 34, crit: 2.0, mag: 100, tapInterval: 0.1, autoInterval: 0.09, reload: 3.8,
    spreadBase: deg(1.8), spreadAdd: deg(0.3), spreadMax: deg(5), spreadRecover: deg(6), spreadMove: deg(2.5),
    range: 32, assistAcquire: deg(9), assistHold: deg(15), assistRange: 12, assistBend: 0.5, magnet: 0.35,
    kick: 0.12, trauma: 0.08, recoil: 18, shot: 'lmg', shellVol: 0.16, duck: 0.6, price: 6500,
    magStep: 20, tip: [0.7425, 0.05, 0], spare: [-0.145, 0.09, 0], unlock: 4, costK: 1.6, moveK: 0.86,
    snd: { release: 'mag_release', magout: 'belt', magin: 'mag_in', rack: 'slide' },
  },
};
// the hidden POWER weapons: found in a locked case in a level, a handful of shots, gone when empty (never bought,
// never upgraded, never carried to the next level)
Object.assign(WEAPONS, {
  crossbow: {
    id: 'crossbow', name: 'X-Bolt Crossbow', model: 'crossbow', icon: 'crossbow_icon.webp', blurb: 'Silent. One bolt goes through everything in a line.', power: true, mode: 'bolt',
    dmg: 320, crit: 1.4, mag: 12, tapInterval: 0.85, autoInterval: 0.9, reload: 9, pierce: 8, pierceK: 0.92, quiet: true,
    spreadBase: deg(0.4), spreadAdd: 0, spreadMax: deg(0.6), spreadRecover: deg(8), spreadMove: deg(0.8),
    range: 34, assistAcquire: deg(9), assistHold: deg(14), assistRange: 15, assistBend: 0.6, magnet: 0.3,
    kick: 0.25, trauma: 0.1, recoil: 22, shot: 'xbow', shellVol: 0, duck: 0.85, magStep: 0, tip: [0.56, 0.076, 0], spare: [0, 0, 0], noDrop: true, noShell: true,
  },
  flamer: {
    id: 'flamer', name: 'Hellfire Flamethrower', model: 'flamer', icon: 'flamer_icon.webp', blurb: 'A river of fire. Everything in front of you burns.', power: true, mode: 'flame',
    dmg: 9, crit: 1, mag: 140, tapInterval: 0.06, autoInterval: 0.06, reload: 9, flame: { len: 6.8, cone: 0.34, burn: { dps: 32, t: 3.2, spread: 1.3 } },
    spreadBase: deg(4), spreadAdd: 0, spreadMax: deg(4), spreadRecover: deg(8), spreadMove: deg(0),
    range: 7, assistAcquire: deg(16), assistHold: deg(22), assistRange: 7, assistBend: 0.6, magnet: 0.3,
    kick: 0.01, trauma: 0.02, recoil: 2, shot: 'flame', shellVol: 0, duck: 0.9, magStep: 0, tip: [0.765, 0.05, 0], spare: [0, 0, 0], noDrop: true, noShell: true,
  },
  launcher: {
    id: 'launcher', name: 'Thumper 40mm', model: 'launcher', icon: 'launcher_icon.webp', blurb: 'Six-shot grenade launcher. Rounds burst on whatever they hit.', power: true, mode: 'gl',
    dmg: 0, crit: 1, mag: 10, tapInterval: 0.6, autoInterval: 0.7, reload: 9,
    spreadBase: deg(1), spreadAdd: 0, spreadMax: deg(1), spreadRecover: deg(8), spreadMove: deg(1),
    range: 26, assistAcquire: deg(12), assistHold: deg(18), assistRange: 16, assistBend: 0.7, magnet: 0.3,
    kick: 0.4, trauma: 0.18, recoil: 34, shot: 'gl', shellVol: 0, duck: 0.6, magStep: 0, tip: [0.585, 0.09, 0], spare: [0, 0, 0], noDrop: true, noShell: true,
  },
});
// every gun the game knows (the network sends an index into this) and the ones a survivor can own
export const GUN_IDS = Object.keys(WEAPONS);
export const WEAPON_IDS = GUN_IDS.filter((id) => !WEAPONS[id].power);
export const POWER_IDS = GUN_IDS.filter((id) => WEAPONS[id].power);

// Four upgrades per gun, bought with cash: the ONLY thing cash buys now (guns open by beating levels, the survivor is
// levelled with skill points). cost[i] is the price of level i+1, times the gun's `costK`.
export const WEAPON_UPGRADES = [
  { key: 'dmg', name: 'Damage', desc: '+10% damage a round', max: 5, cost: [150, 250, 400, 600, 900] },
  { key: 'mag', name: 'Magazine', desc: 'more rounds before a reload', max: 3, cost: [120, 220, 360] },
  { key: 'reload', name: 'Fast hands', desc: '-10% reload time', max: 3, cost: [100, 180, 300] },
  { key: 'acc', name: 'Stability', desc: '-12% spread', max: 3, cost: [100, 180, 300] },
];

// The PROTOTYPE refit (the game's pack-a-punch): once every upgrade on a gun is maxed, the gunsmith rebuilds it into a
// one-off with its own trick, so an early gun is still worth carrying at the end (Sam: "come up with a way to still
// encourage old guns ... the pistol is super good fully upgraded"). Each one does something no other gun does.
export const PROTO = {
  pistol: {
    name: 'THE LAST WORD', color: 0xffc23a, cost: 2500,
    desc: 'Double damage. Every round punches through three bodies, then ricochets into the next one along.',
    dmgK: 2.0, crit: 0.3, pierce: 3, pierceK: 0.85, ricochet: { r: 7, k: 0.7 },
  },
  smg: {
    name: 'HORNET', color: 0x55c8ff, cost: 3000,
    desc: 'Shock rounds: every fifth hit arcs lightning into three more of the dead and stuns them all.',
    dmgK: 1.25, rateK: 1.12, shock: { every: 5, n: 3, r: 5.5, k: 2.6, stun: 0.9 },
  },
  shotgun: {
    name: "DRAGON'S BREATH", color: 0xff6a1e, cost: 3400,
    desc: 'Incendiary shells: whatever it hits goes up in flames, and the fire spreads to the dead beside them.',
    dmgK: 1.3, burn: { dps: 34, t: 4, spread: 1.4 },
  },
  rifle: {
    name: 'SHRAPNEL', color: 0xff3a2e, cost: 3800,
    desc: 'Explosive tips: every hit bursts and tears into everything around it.',
    dmgK: 1.2, blast: { r: 2.2, k: 0.6 },
  },
  lmg: {
    name: 'WARMONGER', color: 0xa6ff3c, cost: 4200,
    desc: 'A double belt that spins up faster the longer you hold the trigger, and rounds that go through two bodies.',
    dmgK: 1.15, magK: 2, spin: { k: 0.75, t: 1.6 }, pierce: 2, pierceK: 0.7,
  },
};

// MASTERY: kills with a gun earn it attachments, for free (the guns you actually use get better on their own).
export const MASTERY = [
  { kills: 40, key: 'extmag', name: 'Extended magazine', desc: '+30% rounds in a magazine' },
  { kills: 120, key: 'reddot', name: 'Red-dot sight', desc: '-15% spread, and the aim assist reaches further' },
  { kills: 260, key: 'suppressor', name: 'Suppressor', desc: 'your shots no longer wake the sleeping dead' },
  { kills: 500, key: 'gold', name: 'Gold finish', desc: '+10% damage, and it gleams' },
];
export const masteryOf = (kills = 0) => MASTERY.filter((m) => kills >= m.kills).map((m) => m.key);

// Survivor perks: bought with SKILL POINTS now (earned by killing the dead and getting out), not cash.
export const PERKS = [
  { key: 'hp', name: 'Health', unit: '+20 max health', max: 5, cost: [1, 1, 2, 2, 3] },
  { key: 'armor', name: 'Armor', unit: '+25 armor, refilled every level', max: 5, cost: [1, 1, 2, 2, 3] },
  { key: 'speed', name: 'Movement speed', unit: '+5% speed', max: 4, cost: [1, 2, 2, 3] },
];
// what each perk used to cost in cash (the old Scavenger perk is refunded from this when a save is upgraded)
export const OLD_SCAVENGER = [300, 550, 900];

export const BASE_HP = 100;
export const BASE_SPEED = 3.6;
export const ARMOR_ABSORB = 0.6;     // armor takes this share of every hit until it is gone

// the stats of a gun with its upgrades applied; `x` = { kills, proto } (mastery attachments and the prototype refit)
export function weaponStats(id, lv = {}, x = {}) {
  const b = WEAPONS[id];
  const l = (k) => lv[k] || 0;
  const att = masteryOf(x.kills || 0);
  const has = (k) => att.includes(k);
  const P = x.proto ? PROTO[id] : null;
  const acc = (1 - 0.12 * l('acc')) * (has('reddot') ? 0.85 : 1);
  const st = {
    ...b,
    dmg: b.dmg * (1 + 0.10 * l('dmg')) * (has('gold') ? 1.1 : 1) * (P?.dmgK || 1),
    mag: Math.round((b.mag + b.magStep * l('mag')) * (has('extmag') ? 1.3 : 1) * (P?.magK || 1)),
    reload: b.reload * (1 - 0.10 * l('reload')),
    spreadBase: b.spreadBase * acc,
    spreadAdd: b.spreadAdd * acc,
    spreadMax: b.spreadMax * acc,
    assistRange: b.assistRange * (has('reddot') ? 1.25 : 1),
    att, proto: P ? id : null, gold: has('gold'), quiet: has('suppressor'),
  };
  if (P) {
    if (P.rateK) { st.autoInterval /= P.rateK; st.tapInterval /= P.rateK; }
    if (P.crit) st.critChance = P.crit;
    if (P.pierce) { st.pierce = P.pierce; st.pierceK = P.pierceK; }
    for (const k of ['ricochet', 'shock', 'burn', 'blast', 'spin']) if (P[k]) st[k] = P[k];
  }
  return st;
}

// what a friend's machine needs to draw a gun right: gold, prototype, and the attachments (also its sound)
export function lookBits(W) {
  return (W.gold ? 1 : 0) | (W.proto ? 2 : 0) | (W.att?.includes('extmag') ? 4 : 0) | (W.att?.includes('reddot') ? 8 : 0) | (W.quiet ? 16 : 0);
}

// every upgrade on the gun maxed: the prototype refit is on offer
export function maxedOut(lv = {}) { return WEAPON_UPGRADES.every((u) => (lv[u.key] || 0) >= u.max); }

export function upgradeCost(weaponId, key, level) {
  const u = WEAPON_UPGRADES.find((x) => x.key === key);
  return Math.round(u.cost[level] * (WEAPONS[weaponId].costK || 1));
}

// what a zombie is worth
export const BOUNTY = { shambler: 10, lurcher: 16, runner: 14, brute: 60, bloater: 25, screamer: 30, spitter: 25, leaper: 30, soldier: 35, warden: 400, patientzero: 600, butcher: 800, foreman: 1000, omega: 1500 };
