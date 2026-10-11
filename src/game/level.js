// One long avenue running north (z decreasing) with three cross streets. Each cross street is a checkpoint:
// a steel gate stands on the avenue a little beyond it and only opens once the survivors have held the
// junction for a while. Past the last gate is the landing zone, where a boss waits; kill it and the
// helicopter comes. (Level 1: crosses at -26/-80/-134, gates -40/-94/-148, pad at -186, north end -208.)
import { mulberry } from './rng.js';

// ---------------------------------------------------------------- the levels --
// L, HOLDS, MEDKITS and AMBUSH are live objects that setLevel(n) rewrites IN PLACE, so every module that
// imported them keeps seeing the current level. Call it before a World is built.
export const L = {};
export const HOLDS = [];
export const MEDKITS = [];
export const AMBUSH = [];
export const LV = {};            // everything else about the current level (names, theme, dressing)

const LEVELS = {
  1: {
    id: 1, name: 'THE EVAC ROUTE', short: 'EVAC ROUTE', kicker: 'LEVEL 1 · EVAC ROUTE', banner: 'Fight north. Hold three junctions, then take down the Warden and get out.',
    blurb: 'Fight north along the avenue. Hold three junctions until the gates open, then kill the Warden at the landing zone and get out. About five minutes.',
    L: {
      roadHW: 6, buildX: 9, crossHW: 5, zMax: 40, zMin: -208, xWall: 34,
      start: { x: 0, z: 25 }, cross: [-26, -80, -134], gate: [-40, -94, -148], lz: { x: 0, z: -186, r: 9 },
    },
    // `secs` the junction must be held, `n` the dead that come while you do it (per player: +50%), the mix of the
    // faster kinds, how many may be on the street at once. The last hold is the boss fight: it ends when the boss is dead.
    holds: [
      { secs: 34, n: 44, lurch: 0.10, runner: 0.00, cap: 24, title: 'JUNCTION 1' },
      { secs: 38, n: 60, lurch: 0.18, runner: 0.10, cap: 28, title: 'JUNCTION 2' },
      { secs: 42, n: 76, lurch: 0.22, runner: 0.18, cap: 32, title: 'JUNCTION 3' },
      { secs: 50, n: 100, lurch: 0.25, runner: 0.22, cap: 34, title: 'THE WARDEN', final: true, boss: 'warden' },
    ],
    ambush: [{ z: -4, n: 8 }, { z: -56, n: 12 }, { z: -110, n: 14 }, { z: -162, n: 16 }],
    medkits: [[3.2, 14], [-3.4, -34], [3.4, -58], [-3.4, -88], [3.4, -112], [-3.4, -142], [3.4, -166]],
    heights: [6.5, 3, 7, 8],             // first block: lo + rng*span; the rest: lo + rng*span
    signs: [['PHARMACY', '#3dff8a', 5.5], ['LIQUOR', '#ff4040', 4.5], ['MOTEL', '#ff8a3a', 4.5], ['24 HR', '#6aa8ff', 3.5], ['DINER', '#ff5fb0', 4], ['CLINIC', '#7affd6', 4.5], ['PAWN', '#ffd34a', 3.5], ['HOTEL', '#ff7a4a', 4.5], ['BAR', '#8aa0ff', 3]],
    theme: { bg: 0x0a0f16, fog: 0x101822, fogD: 0.019, hemiSky: 0x5f759b, hemiGround: 0x1a1a1f, hemiI: 1.7, moon: 0x9db6dc, moonI: 1.5, fogSheet: 0x8da0b8, sat: -0.06 },
    arenas: [{ k: 1 }, { k: 2 }, { k: 4 }],
    buses: [[-4.0, -58, 0], [4.0, -112, 1]],
    brutePop: 0,
    popGap: [4, 4.5],                    // spacing of the sleepers along the road: lo + rng*span
  },
  2: {
    id: 2, name: 'ST. MERCY ROW', short: 'ST. MERCY ROW', kicker: 'LEVEL 2 · ST. MERCY ROW', banner: 'The hospital district. Hold three junctions, then put down Patient Zero.',
    blurb: 'The hospital district, quarantined and overrun. Three junctions, brutes in the street, and Patient Zero waiting at the landing zone. About six minutes.',
    L: {
      roadHW: 6, buildX: 9, crossHW: 5, zMax: 40, zMin: -224, xWall: 34,
      start: { x: 0, z: 25 }, cross: [-26, -86, -146], gate: [-40, -100, -160], lz: { x: 0, z: -202, r: 9 },
    },
    holds: [
      { secs: 36, n: 56, lurch: 0.14, runner: 0.08, cap: 26, title: 'JUNCTION 1', brutes: 0 },
      { secs: 42, n: 76, lurch: 0.20, runner: 0.14, cap: 30, title: 'JUNCTION 2', brutes: 1 },
      { secs: 46, n: 96, lurch: 0.22, runner: 0.20, cap: 34, title: 'JUNCTION 3', brutes: 2 },
      { secs: 52, n: 120, lurch: 0.25, runner: 0.24, cap: 36, title: 'PATIENT ZERO', final: true, boss: 'patientzero', brutes: 2 },
    ],
    ambush: [{ z: -4, n: 10 }, { z: -62, n: 14, brutes: 1 }, { z: -122, n: 16, brutes: 1 }, { z: -176, n: 18, brutes: 1 }],
    medkits: [[3.2, 14], [-3.4, -36], [3.4, -66], [-3.4, -96], [3.4, -126], [-3.4, -156], [3.4, -182]],
    heights: [8, 4, 9, 15],
    signs: [['ER', '#ff4040', 3], ['PHARMACY', '#3dff8a', 5.5], ['MORGUE', '#9ad7ff', 4.5], ['CLINIC', '#7affd6', 4.5], ['X-RAY', '#b8a0ff', 3.5], ['URGENT CARE', '#ff9a4a', 6], ['DENTAL', '#7ad0ff', 4], ['24 HR', '#6aa8ff', 3.5], ['QUARANTINE', '#ffd34a', 6.5]],
    theme: { bg: 0x081110, fog: 0x0f2623, fogD: 0.021, hemiSky: 0x4f9a8a, hemiGround: 0x141d1b, hemiI: 1.75, moon: 0x8fe0c8, moonI: 1.5, fogSheet: 0x8fb0a6, sat: -0.1 },
    arenas: [{ k: 3, flip: true }, { k: 5 }, { k: 4, flip: true }],
    buses: [[4.0, -64, 1], [-4.0, -124, 0]],
    brutePop: 0.07,
    popGap: [4, 4.5],
  },
};
export const LEVEL_IDS = Object.keys(LEVELS).map(Number);
export const levelInfo = (n) => LEVELS[n];

export function setLevel(n) {
  const d = LEVELS[n] || LEVELS[1];
  for (const k of Object.keys(L)) delete L[k];
  Object.assign(L, JSON.parse(JSON.stringify(d.L)));
  HOLDS.splice(0, HOLDS.length, ...d.holds);
  MEDKITS.splice(0, MEDKITS.length, ...d.medkits);
  AMBUSH.splice(0, AMBUSH.length, ...d.ambush);
  for (const k of Object.keys(LV)) delete LV[k];
  Object.assign(LV, d);
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
  for (let z = 30; z > L.zMin + 6; z -= 22) {
    // keep clear of the gates and cross-street mouths
    if (L.cross.some((c) => Math.abs(z - c) < 7)) continue;
    if (L.gate.some((g) => Math.abs(z - g) < 4)) continue;
    const side = k++ % 2 ? 1 : -1;
    out.push({ x: side * 7.7, z, ry: side < 0 ? 0 : Math.PI });
  }
  return out;
}
