// Level 1 — EVAC ROUTE. One long avenue running north (z decreasing) with
// four cross streets. Each cross street is a checkpoint: a steel gate stands
// on the avenue a little beyond it and only opens once the survivors have
// held the junction for a while. Past the last gate is the landing zone.
//
//   z +40  south end (sealed)
//   z +26  start
//   z -26  junction 1, gate at -40       z -134  junction 3, gate at -148
//   z -80  junction 2, gate at -94       z -188  junction 4, gate at -202
//   z -240 landing zone                  z -262  north end (sealed)
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
    id: 1, name: 'THE EVAC ROUTE', short: 'EVAC ROUTE', kicker: 'LEVEL 1 · EVAC ROUTE', banner: 'Fight north to the landing zone. Hold each junction until the gate opens.',
    blurb: 'Fight north along the avenue. Hold each junction until the checkpoint gate opens, then make it to the landing zone. About five minutes.',
    L: {
      roadHW: 6, buildX: 9, crossHW: 5, zMax: 40, zMin: -262, xWall: 34,
      start: { x: 0, z: 25 }, cross: [-26, -80, -134, -188], gate: [-40, -94, -148, -202], lz: { x: 0, z: -240, r: 9 },
    },
    // `secs` the junction must be held, `n` the dead that come while you do it (per player: +50%), the mix of the
    // faster kinds, how many may be on the street at once.
    holds: [
      { secs: 34, n: 22, lurch: 0.10, runner: 0.00, cap: 14, title: 'JUNCTION 1' },
      { secs: 38, n: 30, lurch: 0.18, runner: 0.10, cap: 16, title: 'JUNCTION 2' },
      { secs: 42, n: 38, lurch: 0.22, runner: 0.18, cap: 18, title: 'JUNCTION 3' },
      { secs: 46, n: 42, lurch: 0.24, runner: 0.20, cap: 19, title: 'JUNCTION 4' },
      { secs: 50, n: 50, lurch: 0.25, runner: 0.22, cap: 20, title: 'EVAC POINT', final: true },
    ],
    ambush: [{ z: -4, n: 4 }, { z: -56, n: 6 }, { z: -110, n: 7 }, { z: -164, n: 8 }, { z: -218, n: 9 }],
    medkits: [[3.2, 14], [-3.4, -34], [3.4, -58], [-3.4, -88], [3.4, -112], [-3.4, -142], [3.4, -166], [-3.4, -196], [3.4, -222]],
    heights: [6.5, 3, 7, 8],             // first block: lo + rng*span; the rest: lo + rng*span
    signs: [['PHARMACY', '#3dff8a', 5.5], ['LIQUOR', '#ff4040', 4.5], ['MOTEL', '#ff8a3a', 4.5], ['24 HR', '#6aa8ff', 3.5], ['DINER', '#ff5fb0', 4], ['CLINIC', '#7affd6', 4.5], ['PAWN', '#ffd34a', 3.5], ['HOTEL', '#ff7a4a', 4.5], ['BAR', '#8aa0ff', 3]],
    theme: { bg: 0x0a0f16, fog: 0x101822, fogD: 0.019, hemiSky: 0x5f759b, hemiGround: 0x1a1a1f, hemiI: 1.7, moon: 0x9db6dc, moonI: 1.5, fogSheet: 0x8da0b8, sat: -0.06 },
    arenas: [{ k: 1 }, { k: 2 }, { k: 3 }, { k: 4 }],
    buses: [[-4.0, -58, 0], [4.0, -112, 1], [-4.0, -166, 2]],
    brutePop: 0,
  },
  2: {
    id: 2, name: 'ST. MERCY ROW', short: 'ST. MERCY ROW', kicker: 'LEVEL 2 · ST. MERCY ROW', banner: 'The hospital district. Something big is walking the Row. Hold every junction.',
    blurb: 'The hospital district, quarantined and overrun. Five junctions, a longer road and a bigger kind of dead. About seven minutes.',
    L: {
      roadHW: 6, buildX: 9, crossHW: 5, zMax: 40, zMin: -326, xWall: 34,
      start: { x: 0, z: 25 }, cross: [-26, -82, -138, -194, -250], gate: [-40, -96, -152, -208, -264], lz: { x: 0, z: -304, r: 9 },
    },
    holds: [
      { secs: 36, n: 28, lurch: 0.14, runner: 0.08, cap: 16, title: 'JUNCTION 1', brutes: 0 },
      { secs: 40, n: 36, lurch: 0.20, runner: 0.14, cap: 18, title: 'JUNCTION 2', brutes: 1 },
      { secs: 44, n: 44, lurch: 0.22, runner: 0.20, cap: 20, title: 'JUNCTION 3', brutes: 1 },
      { secs: 48, n: 52, lurch: 0.24, runner: 0.22, cap: 21, title: 'JUNCTION 4', brutes: 2 },
      { secs: 52, n: 58, lurch: 0.25, runner: 0.24, cap: 22, title: 'JUNCTION 5', brutes: 2 },
      { secs: 56, n: 66, lurch: 0.26, runner: 0.26, cap: 24, title: 'EVAC POINT', final: true, brutes: 3 },
    ],
    ambush: [{ z: -4, n: 5 }, { z: -60, n: 7 }, { z: -116, n: 8, brutes: 1 }, { z: -172, n: 9, brutes: 1 }, { z: -228, n: 10, brutes: 1 }, { z: -284, n: 11, brutes: 2 }],
    medkits: [[3.2, 14], [-3.4, -36], [3.4, -62], [-3.4, -92], [3.4, -118], [-3.4, -148], [3.4, -174], [-3.4, -204], [3.4, -230], [-3.4, -260], [3.4, -286]],
    heights: [8, 4, 9, 15],
    signs: [['ER', '#ff4040', 3], ['PHARMACY', '#3dff8a', 5.5], ['MORGUE', '#9ad7ff', 4.5], ['CLINIC', '#7affd6', 4.5], ['X-RAY', '#b8a0ff', 3.5], ['URGENT CARE', '#ff9a4a', 6], ['DENTAL', '#7ad0ff', 4], ['24 HR', '#6aa8ff', 3.5], ['QUARANTINE', '#ffd34a', 6.5]],
    theme: { bg: 0x081110, fog: 0x0f2623, fogD: 0.021, hemiSky: 0x4f9a8a, hemiGround: 0x141d1b, hemiI: 1.75, moon: 0x8fe0c8, moonI: 1.5, fogSheet: 0x8fb0a6, sat: -0.1 },
    arenas: [{ k: 3, flip: true }, { k: 2, flip: true }, { k: 5 }, { k: 4, flip: true }, { k: 1, flip: true }],
    buses: [[4.0, -60, 1], [-4.0, -118, 0], [4.0, -174, 2], [-4.0, -230, 1]],
    brutePop: 0.07,
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
