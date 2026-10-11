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

export const L = {
  roadHW: 6,                 // the avenue's half width (kerb to kerb)
  buildX: 9,                 // building line, each side of the avenue
  crossHW: 5,                // half width of a cross street
  zMax: 40, zMin: -262, xWall: 34,
  start: { x: 0, z: 25 },
  cross: [-26, -80, -134, -188],
  gate: [-40, -94, -148, -202],
  lz: { x: 0, z: -240, r: 9 },
};

// The holds. `secs` the junction must be held, `n` the dead that come while
// you do it (per player: +50%), mix of the faster kinds, how many may be on
// the street at once.
export const HOLDS = [
  { secs: 34, n: 22, lurch: 0.10, runner: 0.00, cap: 14, title: 'JUNCTION 1' },
  { secs: 38, n: 30, lurch: 0.18, runner: 0.10, cap: 16, title: 'JUNCTION 2' },
  { secs: 42, n: 38, lurch: 0.22, runner: 0.18, cap: 18, title: 'JUNCTION 3' },
  { secs: 46, n: 42, lurch: 0.24, runner: 0.20, cap: 19, title: 'JUNCTION 4' },
  { secs: 50, n: 50, lurch: 0.25, runner: 0.22, cap: 20, title: 'EVAC POINT', final: true },
];

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
        const h = bi === 0 ? 6.5 + rng() * 3 : 7 + rng() * 8;
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

// First-aid kits lying about. Picked up by walking over them while hurt.
export const MEDKITS = [
  [3.2, 14], [-3.4, -34], [3.4, -58], [-3.4, -88], [3.4, -112], [-3.4, -142], [3.4, -166], [-3.4, -196], [3.4, -222],
];
