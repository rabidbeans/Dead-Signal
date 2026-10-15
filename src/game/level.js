// The campaign: five levels that are one continuous push across the city to Fort Hope. Each level is one long street
// running north (z decreasing), turned into a LINEAR MAZE by barricade rows across it, each with a single gap (the gaps
// zig-zag, so you weave from side to side). Half way there is ONE junction with a steel gate you must hold while it is cut
// open. At the far end a boss guards the safe room door (level 5: the evac pad). The next level starts at the door you left by.
//
//   z +40  south end: the safe room you came out of (start at +25)
//   maze A ........................ rows every ~11-14 m
//   cross[0]  the junction (hold), gate[0] = cross[0] - 14
//   maze B ........................
//   cross[1] = lz.z  the boss plaza; the safe room door is at zMin + 3
import { mulberry } from './rng.js';

// ---------------------------------------------------------------- the levels --
// L, HOLDS, MEDKITS, AMBUSH, MAZE and LV are live objects that setLevel(n) rewrites IN PLACE, so every module that
// imported them keeps seeing the current level. Call it before a World is built.
export const L = {};
export const HOLDS = [];
export const MEDKITS = [];
export const AMBUSH = [];
export const MAZE = [];          // barricade rows: { z, gx (gap centre x), gw (gap width), kind, seed }
export const LV = {};            // everything else about the current level (names, theme, dressing)

const BASE = { roadHW: 6, buildX: 9, crossHW: 5, zMax: 40, xWall: 34, start: { x: 0, z: 29 } };
const geo = (zc, lz) => ({ ...BASE, cross: [zc, lz], gate: [zc - 14], lz: { x: 0, z: lz, r: 9 }, zMin: lz - 22 });

const LEVELS = {
  1: {
    id: 1, name: 'DOWNTOWN', kicker: 'LEVEL 1 · DOWNTOWN', finale: 'saferoom',
    banner: 'Weave through the barricades, hold the gate, then get past the Warden into the safe room.',
    blurb: 'The first night. Weave through the barricades downtown, hold the junction while the gate is cut, and get past the Warden into the safe room.',
    L: geo(-78, -188),
    holds: [
      { secs: 45, n: 70, lurch: 0.15, runner: 0.06, cap: 28, title: 'THE JUNCTION' },
      { secs: 40, n: 40, lurch: 0.2, runner: 0.1, cap: 18, title: 'THE WARDEN', final: true, boss: 'warden' },
    ],
    zHp: 1.0, zSpd: 1.0, brutePop: 0, sleepGap: [4.5, 4.5],
    rowGap: [11, 3], rowKinds: ['jersey', 'cars', 'jersey', 'fence', 'cars'],
    heights: [6.5, 3, 7, 8],
    signs: [['PHARMACY', '#3dff8a', 5.5], ['LIQUOR', '#ff3d7a', 4.5], ['MOTEL', '#ff8a3a', 4.5], ['24 HR', '#4ad8ff', 3.5], ['DINER', '#ff5fd0', 4], ['ARCADE', '#b56bff', 4.5], ['PAWN', '#ffd34a', 3.5], ['HOTEL', '#ff7a4a', 4.5], ['BAR', '#6a8aff', 3]],
    theme: { bg: 0x120f26, fog: 0x1b1838, fogD: 0.017, hemiSky: 0x8a86e0, hemiGround: 0x2a1a2c, hemiI: 1.9, moon: 0xb8c0ff, moonI: 1.55, fogSheet: 0x9a92d8, sat: 0.16, lamp: 0xffa040, walls: [0xffe0d0, 0x9aa8e0, 0xd0c4b0], accent: [0xff7a1a, 0xf2f2f2], rim: 0x7fa0ff },
    arenas: [{ k: 1 }, { k: 'plaza' }],
  },
  2: {
    id: 2, name: 'ST. MERCY ROW', kicker: 'LEVEL 2 · ST. MERCY ROW', finale: 'saferoom',
    banner: 'The hospital district. Brutes walk here. Hold the gate, then put down Patient Zero.',
    blurb: 'The hospital district, quarantined and overrun. Brutes in the street, and Patient Zero spitting bile in front of the next safe room.',
    L: geo(-84, -200),
    holds: [
      { secs: 50, n: 85, lurch: 0.2, runner: 0.12, cap: 30, title: 'THE JUNCTION', brutes: 1 },
      { secs: 40, n: 46, lurch: 0.22, runner: 0.14, cap: 19, title: 'PATIENT ZERO', final: true, boss: 'patientzero', brutes: 1 },
    ],
    zHp: 1.1, zSpd: 1.03, brutePop: 0.05, sleepGap: [4.2, 4.2],
    rowGap: [11, 3], rowKinds: ['jersey', 'ambulance', 'fence', 'cars', 'jersey'],
    heights: [8, 4, 9, 15],
    signs: [['ER', '#ff3030', 3], ['PHARMACY', '#3dff8a', 5.5], ['MORGUE', '#8ad7ff', 4.5], ['CLINIC', '#4affd6', 4.5], ['X-RAY', '#b8a0ff', 3.5], ['URGENT CARE', '#ff9a4a', 6], ['DENTAL', '#5ad0ff', 4], ['24 HR', '#6aa8ff', 3.5], ['QUARANTINE', '#ffd34a', 6.5]],
    theme: { bg: 0x081414, fog: 0x0e2a28, fogD: 0.018, hemiSky: 0x52c0aa, hemiGround: 0x142220, hemiI: 1.85, moon: 0xa0ffe0, moonI: 1.5, fogSheet: 0x8ad0c0, sat: 0.14, lamp: 0xd8ffea, walls: [0xf0f0e8, 0x9ad0c4, 0xe0d8d0], accent: [0xe03030, 0xf2f2f2], rim: 0x6affc0 },
    arenas: [{ k: 2 }, { k: 'plaza' }],
  },
  3: {
    id: 3, name: 'LANTERN STREET', kicker: 'LEVEL 3 · LANTERN STREET', finale: 'saferoom',
    banner: 'The old market under the lanterns. Watch for flying cleavers when the Butcher shows.',
    blurb: 'The night market: lanterns, stalls and a lot more dead. The Butcher throws cleavers; keep moving.',
    L: geo(-90, -212),
    holds: [
      { secs: 55, n: 100, lurch: 0.22, runner: 0.18, cap: 32, title: 'THE JUNCTION', brutes: 2 },
      { secs: 40, n: 52, lurch: 0.24, runner: 0.18, cap: 20, title: 'THE BUTCHER', final: true, boss: 'butcher', brutes: 1 },
    ],
    zHp: 1.2, zSpd: 1.06, brutePop: 0.06, sleepGap: [4, 4],
    rowGap: [10.5, 3], rowKinds: ['stalls', 'jersey', 'stalls', 'cars', 'fence'],
    heights: [7, 4, 8, 10],
    signs: [['NOODLES', '#ff4040', 5], ['DUMPLINGS', '#ffd040', 6], ['KARAOKE', '#ff5fd0', 5.5], ['TEA', '#4affb0', 3], ['MARKET', '#ffb030', 5], ['HERBS', '#7aff5a', 4], ['LUCKY', '#ff3060', 4.5], ['BBQ', '#ff8a3a', 3.5]],
    theme: { bg: 0x1a0c0c, fog: 0x2c1414, fogD: 0.017, hemiSky: 0xe08a6a, hemiGround: 0x2a1410, hemiI: 1.8, moon: 0xffd0b0, moonI: 1.4, fogSheet: 0xd8968a, sat: 0.2, lamp: 0xff6a3a, walls: [0xffb8a0, 0xc0d8a0, 0xf0d0a0], accent: [0xd02020, 0xffc020], rim: 0xff8a50, lanterns: true },
    arenas: [{ k: 3, flip: true }, { k: 'plaza' }],
  },
  4: {
    id: 4, name: 'THE DOCKS', kicker: 'LEVEL 4 · THE DOCKS', finale: 'saferoom',
    banner: 'Container yards at dusk. The Foreman jumps; get out of the red circle.',
    blurb: 'The shipping yards, walls of steel containers and the Foreman, who leaps across the yard and smashes the ground.',
    L: geo(-96, -224),
    holds: [
      { secs: 58, n: 115, lurch: 0.24, runner: 0.22, cap: 34, title: 'THE JUNCTION', brutes: 2 },
      { secs: 40, n: 58, lurch: 0.25, runner: 0.22, cap: 21, title: 'THE FOREMAN', final: true, boss: 'foreman', brutes: 2 },
    ],
    zHp: 1.3, zSpd: 1.09, brutePop: 0.08, sleepGap: [3.8, 3.8],
    rowGap: [10.5, 3], rowKinds: ['containers', 'containers', 'jersey', 'cars', 'containers'],
    heights: [7, 3, 8, 7],
    signs: [['PIER 9', '#ffb030', 4], ['CUSTOMS', '#4ad8ff', 5], ['FREIGHT', '#ff6a3a', 5], ['BAIT', '#7aff5a', 3], ['CRANE 3', '#ffd34a', 5]],
    theme: { bg: 0x1a1024, fog: 0x2a1a34, fogD: 0.016, hemiSky: 0xb08ad8, hemiGround: 0x2a1a20, hemiI: 1.85, moon: 0xffb070, moonI: 1.6, fogSheet: 0xc09ad0, sat: 0.18, lamp: 0xffb050, walls: [0xd0d0e0, 0xc0a890, 0xe0c0a0], accent: [0xffc020, 0x202020], rim: 0xffa060 },
    arenas: [{ k: 4, flip: true }, { k: 'plaza' }],
  },
  5: {
    id: 5, name: 'FORT HOPE', kicker: 'LEVEL 5 · FORT HOPE', finale: 'heli',
    banner: 'The quarantine fort. Subject Omega stands between you and the last helicopter out.',
    blurb: 'The overrun military fort and the last helicopter out. Subject Omega summons the horde and goes berserk when hurt.',
    L: geo(-102, -236),
    holds: [
      { secs: 62, n: 130, lurch: 0.25, runner: 0.26, cap: 36, title: 'THE JUNCTION', brutes: 3 },
      { secs: 40, n: 60, lurch: 0.25, runner: 0.26, cap: 22, title: 'SUBJECT OMEGA', final: true, boss: 'omega', brutes: 2 },
    ],
    zHp: 1.4, zSpd: 1.12, brutePop: 0.1, sleepGap: [3.6, 3.6],
    rowGap: [10, 3], rowKinds: ['hesco', 'jersey', 'hesco', 'cars', 'fence'],
    heights: [6, 3, 7, 6],
    signs: [['RESTRICTED', '#ff3030', 6], ['MEDICAL', '#4affb0', 5], ['ARMORY', '#ffd34a', 5], ['GATE B', '#4ad8ff', 4], ['DECON', '#ff8a3a', 4.5]],
    theme: { bg: 0x0f140c, fog: 0x1c2616, fogD: 0.017, hemiSky: 0x9ac080, hemiGround: 0x1c2016, hemiI: 1.85, moon: 0xe8ffc8, moonI: 1.55, fogSheet: 0xa8c094, sat: 0.12, lamp: 0xfff0c0, walls: [0xc8c8a8, 0xa8b898, 0xd0c4a8], accent: [0xffd020, 0x202020], rim: 0xb0ff80 },
    arenas: [{ k: 4 }, { k: 'plaza' }],
  },
};
export const LEVEL_IDS = Object.keys(LEVELS).map(Number);
export const levelInfo = (n) => LEVELS[n];

// the barricade rows of a level, seeded so every machine builds the same maze
function genMaze(d) {
  const rng = mulberry(7000 + d.id * 31);
  const rows = [];
  const zones = [[d.L.start.z - 11, d.L.cross[0] + 13], [d.L.gate[0] - 11, d.L.lz.z + 17]];
  let side = rng() < 0.5 ? -1 : 1;
  for (const [a, b] of zones) {
    for (let z = a; z > b; z -= d.rowGap[0] + rng() * d.rowGap[1]) {
      const centre = rng() < 0.18;
      const gx = centre ? 0 : side * (5.2 + rng() * 1.6);
      if (!centre) side = -side;
      rows.push({ z: +z.toFixed(1), gx: +gx.toFixed(2), gw: 3.2, kind: d.rowKinds[(rng() * d.rowKinds.length) | 0], seed: (rng() * 1e6) | 0 });
    }
  }
  return rows;
}

export function setLevel(n) {
  const d = LEVELS[n] || LEVELS[1];
  for (const k of Object.keys(L)) delete L[k];
  Object.assign(L, JSON.parse(JSON.stringify(d.L)));
  HOLDS.splice(0, HOLDS.length, ...d.holds);
  MAZE.splice(0, MAZE.length, ...genMaze(d));
  // first-aid kits: a few along each stretch, never in a barricade, and one in front of the boss plaza
  const kits = [];
  const kz = [d.L.start.z - 18, (d.L.start.z + d.L.cross[0]) / 2, d.L.cross[0] + 9, d.L.gate[0] - 16, (d.L.gate[0] + d.L.lz.z) / 2, d.L.lz.z + 14];
  kz.forEach((z, i) => { let zz = z; while (MAZE.some((r) => Math.abs(r.z - zz) < 2.2)) zz -= 1.5; kits.push([(i % 2 ? 3.3 : -3.3), +zz.toFixed(1)]); });
  MEDKITS.splice(0, MEDKITS.length, ...kits);
  // ambushes: one a little way into each stretch, bigger every level
  AMBUSH.splice(0, AMBUSH.length, { z: d.L.start.z - 30, n: 6 + 2 * d.id }, { z: d.L.cross[0] + 30, n: 8 + 2 * d.id, brutes: d.id >= 3 ? 1 : 0 },
    { z: d.L.gate[0] - 30, n: 10 + 2 * d.id, brutes: d.id >= 2 ? 1 : 0 }, { z: d.L.lz.z + 30, n: 10 + 2 * d.id, brutes: d.id >= 4 ? 1 : 0 });
  for (const k of Object.keys(LV)) delete LV[k];
  Object.assign(LV, d, { short: d.name });
  return d;
}
setLevel(1);

// A hold starts when the lead survivor is this far south of the gate.
export const HOLD_TRIGGER = 22;
// To make progress the survivors must stay this close to the gate.
export const HOLD_RADIUS = 26;

// Blocks of city between the cross streets: [north z, south z].
export function blockRanges() {
  const out = [];
  const edges = [L.zMax, ...L.cross.flatMap((z) => [z + L.crossHW, z - L.crossHW]), L.zMin];
  for (let i = 0; i < edges.length; i += 2) out.push([edges[i + 1], edges[i]]);
  return out;
}

// Building lots along both sides of the avenue, generated once.
// side -1 = west (x < 0), +1 = east.
export function buildLots() {
  const lots = [];
  const rng = mulberry(4242);
  const blocks = blockRanges();
  blocks.forEach(([zN, zS], bi) => {
    for (const side of [-1, 1]) {
      let z = zS;                                  // work northward from the south end
      while (z - zN > 0.5) {
        const left = z - zN;
        let len = 11 + rng() * 10;
        if (left - len < 9) len = left;            // no sliver at the end
        const depth = 13 + rng() * 9;
        const hh = LV.heights;
        const h = bi === 0 ? hh[0] + rng() * hh[1] : hh[2] + rng() * hh[3];
        const x0 = side < 0 ? -L.buildX - depth : L.buildX;
        const x1 = side < 0 ? -L.buildX : L.buildX + depth;
        lots.push({ x0, x1, z0: z - len, z1: z, h, side, block: bi, mat: Math.floor(rng() * 3), southCross: z === zS && zS < L.zMax - 0.5, northCross: Math.abs(z - len - zN) < 0.01 && zN > L.zMin + 0.5, r: rng() });
        z -= len;
      }
    }
  });
  return lots;
}

// Lamp posts: one every ~22 m, alternating sides, on the sidewalk.
export function lampSites() {
  const out = [];
  let k = 0;
  for (let z0 = 30; z0 > L.zMin + 6; z0 -= 22) {
    // keep clear of the gates, the cross-street mouths, the barricade rows and the safe room front
    const ok = (z) => !L.cross.some((c) => Math.abs(z - c) < 7) && !L.gate.some((g) => Math.abs(z - g) < 4) && !MAZE.some((r) => Math.abs(z - r.z) < 2.5) && z > L.zMin + 10;
    const z = [0, 3, -3, 5, -5].map((o) => z0 + o).find(ok);
    if (z === undefined) continue;
    const side = k++ % 2 ? 1 : -1;
    out.push({ x: side * 7.7, z, ry: side < 0 ? 0 : Math.PI });
  }
  return out;
}
