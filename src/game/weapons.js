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
    magStep: 6, tip: [0.365, 0.052, 0], spare: [-0.112, 0.105, 0], unlock: 1, costK: 1.3,
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
    magStep: 2, tip: [0.623, 0.03, 0], spare: [-0.116, 0.01, 0.034], unlock: 2, costK: 1.6,
    pump: 0.25, noDrop: true, snd: { release: null, magout: 'mag_in', magin: 'mag_in', rack: 'pump' },
  },
  rifle: {
    id: 'rifle', name: 'AR-7 Carbine', model: 'rifle', icon: 'rifle_icon.webp', blurb: 'Accurate full-auto. Hits hard at range.',
    dmg: 30, crit: 2.2, mag: 30, tapInterval: 0.11, autoInterval: 0.105, reload: 2.1,
    spreadBase: deg(1.0), spreadAdd: deg(0.35), spreadMax: deg(3.5), spreadRecover: deg(9), spreadMove: deg(1.2),
    range: 34, assistAcquire: deg(9), assistHold: deg(15), assistRange: 13, assistBend: 0.55, magnet: 0.35,
    kick: 0.1, trauma: 0.06, recoil: 15, shot: 'rifle', shellVol: 0.14, duck: 0.7, price: 4200,
    magStep: 6, tip: [0.606, 0.058, 0], spare: [-0.11, 0.12, 0], unlock: 3, costK: 2.0,
  },
  lmg: {
    id: 'lmg', name: 'M-60 Hailstorm', model: 'lmg', icon: 'lmg_icon.webp', blurb: 'A hundred-round belt. Heavy: you move slower.',
    dmg: 34, crit: 2.0, mag: 100, tapInterval: 0.1, autoInterval: 0.09, reload: 3.8,
    spreadBase: deg(1.8), spreadAdd: deg(0.3), spreadMax: deg(5), spreadRecover: deg(6), spreadMove: deg(2.5),
    range: 32, assistAcquire: deg(9), assistHold: deg(15), assistRange: 12, assistBend: 0.5, magnet: 0.35,
    kick: 0.12, trauma: 0.08, recoil: 18, shot: 'lmg', shellVol: 0.16, duck: 0.6, price: 6500,
    magStep: 20, tip: [0.7425, 0.05, 0], spare: [-0.145, 0.09, 0], unlock: 4, costK: 2.4, moveK: 0.86,
    snd: { release: 'mag_release', magout: 'belt', magin: 'mag_in', rack: 'slide' },
  },
};
export const WEAPON_IDS = Object.keys(WEAPONS);

// Four upgrades per gun. cost[i] is the price of level i+1 (times the gun's `costK`).
export const WEAPON_UPGRADES = [
  { key: 'dmg', name: 'Damage', desc: '+10% damage a round', max: 5, cost: [150, 250, 400, 600, 900] },
  { key: 'mag', name: 'Magazine', desc: 'more rounds before a reload', max: 3, cost: [120, 220, 360] },
  { key: 'reload', name: 'Fast hands', desc: '-10% reload time', max: 3, cost: [100, 180, 300] },
  { key: 'acc', name: 'Stability', desc: '-12% spread', max: 3, cost: [100, 180, 300] },
];
export const SMG_COST_K = 1.3;

// Survivor perks. `unit` is what one level gives.
export const PERKS = [
  { key: 'hp', name: 'Health', unit: '+20 max health', max: 5, cost: [200, 300, 450, 650, 900] },
  { key: 'armor', name: 'Armor', unit: '+25 armor, refilled every level', max: 5, cost: [250, 380, 560, 800, 1100] },
  { key: 'speed', name: 'Movement speed', unit: '+5% speed', max: 4, cost: [250, 400, 650, 950] },
  { key: 'cash', name: 'Scavenger', unit: '+15% cash from kills', max: 3, cost: [300, 550, 900] },
];

export const BASE_HP = 100;
export const BASE_SPEED = 3.6;
export const ARMOR_ABSORB = 0.6;     // armor takes this share of every hit until it is gone

// the stats of a gun with its upgrades applied
export function weaponStats(id, lv = {}) {
  const b = WEAPONS[id];
  const l = (k) => lv[k] || 0;
  return {
    ...b,
    dmg: b.dmg * (1 + 0.10 * l('dmg')),
    mag: b.mag + b.magStep * l('mag'),
    reload: b.reload * (1 - 0.10 * l('reload')),
    spreadBase: b.spreadBase * (1 - 0.12 * l('acc')),
    spreadAdd: b.spreadAdd * (1 - 0.12 * l('acc')),
    spreadMax: b.spreadMax * (1 - 0.12 * l('acc')),
  };
}

export function upgradeCost(weaponId, key, level) {
  const u = WEAPON_UPGRADES.find((x) => x.key === key);
  return Math.round(u.cost[level] * (WEAPONS[weaponId].costK || 1));
}

// what a zombie is worth
export const BOUNTY = { shambler: 10, lurcher: 16, runner: 14, brute: 60, warden: 400, patientzero: 600, butcher: 800, foreman: 1000, omega: 1500 };
