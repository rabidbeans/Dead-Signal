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
import { genInterior, genCanals, zoneBlocked } from './layout.js';

// ---------------------------------------------------------------- the levels --
// L, HOLDS, MEDKITS, AMBUSH, MAZE and LV are live objects that setLevel(n) rewrites IN PLACE, so every module that
// imported them keeps seeing the current level. Call it before a World is built.
export const L = {};
export const HOLDS = [];
export const MEDKITS = [];
export const AMBUSH = [];
export const MAZE = [];          // barricade rows: { z, gx (gap centre x), gw (gap width), kind, seed }
export const LANES = [];         // walls ALONG the street: { x, z0 (south end), z1 (north end), kind, brk: [south, north] | null, seed }
export const LV = {};            // everything else about the current level (names, theme, dressing)
export const ZONES = [];         // the WIDE stretches (layout.js): hospital wards, warehouse, canals - instead of barricade rows
export const ZONE_HW = 20;       // half the width of a wide zone (the street is 9)

const BASE = { roadHW: 6, buildX: 9, crossHW: 5, zMax: 40, xWall: 34, start: { x: 0, z: 29 } };
const geo = (zc, lz) => ({ ...BASE, cross: [zc, lz], gate: [zc - 14], lz: { x: 0, z: lz, r: 9 }, zMin: lz - 22 });

const LEVELS = {
  1: {
    id: 1, name: 'DOWNTOWN', kicker: 'LEVEL 1 · DOWNTOWN', finale: 'saferoom',
    objective: 'gate',
    banner: 'Weave through the barricades, hold the gate, then get past the Warden into the safe room.',
    blurb: 'The first night. Weave through the barricades downtown, hold the junction while the gate is cut, and get past the Warden into the safe room.',
    L: geo(-78, -188),
    holds: [
      { secs: 40, n: 42, lurch: 0.12, runner: 0.03, cap: 16, title: 'THE JUNCTION' },
      { secs: 40, n: 24, lurch: 0.15, runner: 0.04, cap: 11, title: 'THE WARDEN', final: true, boss: 'warden' },
    ],
    // level 1 is played with the pistol alone (Sam: "too hard with only a pistol"): softer, slower, fewer dead
    zHp: 0.8, zSpd: 0.92, brutePop: 0, sleepGap: [6.5, 5], ambK: 0.6, ambRunner: 0.08, trickle: 0.5,
    rowGap: [11, 3], rowKinds: ['jersey', 'cars', 'jersey', 'fence', 'cars'],
    heights: [6.5, 3, 7, 8],
    signs: [['PHARMACY', '#3dff8a', 5.5], ['LIQUOR', '#ff3d7a', 4.5], ['MOTEL', '#ff8a3a', 4.5], ['24 HR', '#4ad8ff', 3.5], ['DINER', '#ff5fd0', 4], ['ARCADE', '#b56bff', 4.5], ['PAWN', '#ffd34a', 3.5], ['HOTEL', '#ff7a4a', 4.5], ['BAR', '#6a8aff', 3]],
    theme: { bg: 0x120f26, fog: 0x1b1838, fogD: 0.017, hemiSky: 0x8a86e0, hemiGround: 0x2a1a2c, hemiI: 1.9, moon: 0xb8c0ff, moonI: 1.55, fogSheet: 0x9a92d8, sat: 0.32, lamp: 0xffa040, lamp2: 0xff4fb0, walls: [0xffc8b0, 0x8fa8ff, 0xd8c090], accent: [0xff7a1a, 0xf2f2f2], rim: 0x7fa0ff },
    arenas: [{ k: 1 }, { k: 'plaza' }],
  },
  2: {
    id: 2, name: 'ST. MERCY ROW', kicker: 'LEVEL 2 · ST. MERCY ROW', finale: 'saferoom',
    objective: 'power',
    banner: 'The power is out. Find your way through the dark wards of St. Mercy, throw the three breakers in the courtyard, then put down Patient Zero.',
    blurb: 'Inside St. Mercy Hospital, blacked out: a maze of wards, corridors and sliding doors, three breakers to throw in the courtyard, and Patient Zero.',
    L: geo(-84, -200),
    holds: [
      { secs: 50, n: 55, lurch: 0.2, runner: 0.12, cap: 22, title: 'THE BLACKOUT', brutes: 1 },
      { secs: 40, n: 46, lurch: 0.22, runner: 0.14, cap: 19, title: 'PATIENT ZERO', final: true, boss: 'patientzero', brutes: 1 },
    ],
    zHp: 1.1, zSpd: 1.03, brutePop: 0.05, sleepGap: [4.2, 4.2],
    style: 'wards', rowGap: [12, 3], rowKinds: ['pileup', 'pileup', 'fence', 'pileup'],
    heights: [8, 4, 9, 15],
    signs: [['ER', '#ff3030', 3], ['PHARMACY', '#3dff8a', 5.5], ['MORGUE', '#8ad7ff', 4.5], ['CLINIC', '#4affd6', 4.5], ['X-RAY', '#b8a0ff', 3.5], ['URGENT CARE', '#ff9a4a', 6], ['DENTAL', '#5ad0ff', 4], ['24 HR', '#6aa8ff', 3.5], ['QUARANTINE', '#ffd34a', 6.5]],
    theme: { bg: 0x081414, fog: 0x0e2a28, fogD: 0.018, hemiSky: 0x52c0aa, hemiGround: 0x142220, hemiI: 1.85, moon: 0xa0ffe0, moonI: 1.5, fogSheet: 0x8ad0c0, sat: 0.3, lamp: 0xd8ffea, lamp2: 0x50e0ff, walls: [0xf0f0e8, 0x7ad8c8, 0xf0c8c8], accent: [0xe03030, 0xf2f2f2], rim: 0x6affc0 },
    arenas: [{ k: 2 }, { k: 'plaza' }],
  },
  3: {
    id: 3, name: 'LANTERN STREET', kicker: 'LEVEL 3 · LANTERN STREET', finale: 'saferoom',
    objective: 'nests', tanks: true,
    banner: 'Cross the canal quarter bridge by bridge, burn out the three nests, and watch for the Butcher\'s cleavers. Red gas tanks go off when shot.',
    blurb: 'The canal quarter: islands of market stalls joined by narrow footbridges, red gas tanks you can shoot, three pulsing nests breeding the dead, and the Butcher.',
    L: geo(-90, -212),
    holds: [
      { secs: 55, n: 24, lurch: 0.22, runner: 0.15, cap: 17, title: 'THE NESTS', brutes: 1 },
      { secs: 40, n: 52, lurch: 0.24, runner: 0.18, cap: 20, title: 'THE BUTCHER', final: true, boss: 'butcher', brutes: 1 },
    ],
    zHp: 1.2, zSpd: 1.06, brutePop: 0.06, sleepGap: [4, 4],
    style: 'canals', rowGap: [12.5, 2], rowKinds: ['stalls'],
    heights: [7, 4, 8, 10],
    signs: [['NOODLES', '#ff4040', 5], ['DUMPLINGS', '#ffd040', 6], ['KARAOKE', '#ff5fd0', 5.5], ['TEA', '#4affb0', 3], ['MARKET', '#ffb030', 5], ['HERBS', '#7aff5a', 4], ['LUCKY', '#ff3060', 4.5], ['BBQ', '#ff8a3a', 3.5]],
    theme: { bg: 0x1a0c0c, fog: 0x2c1414, fogD: 0.017, hemiSky: 0xe08a6a, hemiGround: 0x2a1410, hemiI: 1.8, moon: 0xffd0b0, moonI: 1.4, fogSheet: 0xd8968a, sat: 0.36, lamp: 0xff6a3a, lamp2: 0xffd040, walls: [0xffa888, 0xb8e890, 0xffd080], accent: [0xd02020, 0xffc020], rim: 0xff8a50, lanterns: true },
    arenas: [{ k: 'nest' }, { k: 'plaza' }],
  },
  4: {
    id: 4, name: 'THE DOCKS', kicker: 'LEVEL 4 · THE DOCKS', finale: 'saferoom',
    objective: 'dozer',
    banner: 'Find the keycards in the bonded warehouses to open the locked doors, keep the bulldozer moving, and dodge the Foreman\'s leap.',
    blurb: 'The docks\' bonded warehouses: aisles of racking, doors locked until you find their coloured keycard, a bulldozer that only pushes while you stand by it, and the Foreman.',
    L: geo(-96, -224),
    holds: [
      { secs: 45, n: 85, lurch: 0.24, runner: 0.2, cap: 26, title: 'THE CONTAINER WALL', brutes: 2 },
      { secs: 40, n: 58, lurch: 0.25, runner: 0.22, cap: 21, title: 'THE FOREMAN', final: true, boss: 'foreman', brutes: 2 },
    ],
    zHp: 1.25, zSpd: 1.08, brutePop: 0.07, sleepGap: [4, 4],
    style: 'warehouse', keys: ['red', 'blue'], rowGap: [18, 2], rowKinds: ['containers'],
    heights: [7, 3, 8, 7],
    signs: [['PIER 9', '#ffb030', 4], ['CUSTOMS', '#4ad8ff', 5], ['FREIGHT', '#ff6a3a', 5], ['BAIT', '#7aff5a', 3], ['CRANE 3', '#ffd34a', 5]],
    theme: { bg: 0x1a1024, fog: 0x2a1a34, fogD: 0.016, hemiSky: 0xb08ad8, hemiGround: 0x2a1a20, hemiI: 1.85, moon: 0xffb070, moonI: 1.6, fogSheet: 0xc09ad0, sat: 0.34, lamp: 0xffb050, lamp2: 0x60b0ff, walls: [0xc8d0ff, 0xd8a070, 0xffb890], accent: [0xffc020, 0x202020], rim: 0xffa060 },
    arenas: [{ k: 'yard' }, { k: 'plaza' }],
  },
  5: {
    id: 5, name: 'FORT HOPE', kicker: 'LEVEL 5 · FORT HOPE', finale: 'heli',
    objective: 'gate', barrage: true,
    banner: 'The fort is shelling its own streets. Run the chicanes, hold the fort gate, and stay out of the red rings. Then Subject Omega.',
    blurb: 'The overrun fort: tight chicanes, the gate to hold while the guns shell the street (stay out of the red rings), and Subject Omega at the last helicopter.',
    L: geo(-102, -236),
    holds: [
      { secs: 60, n: 115, lurch: 0.25, runner: 0.26, cap: 34, title: 'THE FORT GATE', brutes: 3 },
      { secs: 40, n: 60, lurch: 0.25, runner: 0.26, cap: 22, title: 'SUBJECT OMEGA', final: true, boss: 'omega', brutes: 2 },
    ],
    zHp: 1.32, zSpd: 1.1, brutePop: 0.08, sleepGap: [3.9, 3.9],
    style: 'chicane', rowGap: [7.5, 1.5], rowKinds: ['hesco', 'hesco', 'jersey'],
    heights: [6, 3, 7, 6],
    signs: [['RESTRICTED', '#ff3030', 6], ['MEDICAL', '#4affb0', 5], ['ARMORY', '#ffd34a', 5], ['GATE B', '#4ad8ff', 4], ['DECON', '#ff8a3a', 4.5]],
    theme: { bg: 0x0f140c, fog: 0x1c2616, fogD: 0.017, hemiSky: 0x9ac080, hemiGround: 0x1c2016, hemiI: 1.85, moon: 0xe8ffc8, moonI: 1.55, fogSheet: 0xa8c094, sat: 0.28, lamp: 0xfff0c0, lamp2: 0xff5040, walls: [0xd0d8a0, 0xa0c090, 0xe0c890], accent: [0xffd020, 0x202020], rim: 0xb0ff80 },
    arenas: [{ k: 4 }, { k: 'plaza' }],
  },
};
export const LEVEL_IDS = Object.keys(LEVELS).map(Number);
export const levelInfo = (n) => LEVELS[n];

// The maze of a level, seeded so every machine builds the same one. Each level has its own STYLE (Sam: "each level
// should be unique, not just running through gates and around walls"):
//   rows    downtown: barricade rows with one gap each, the gaps zig-zag (jersey barriers, chain-link, wrecks)
//   pileup  the hospital: crash pile-ups, vehicles slewed at angles across the road, a fire here and there
//   aisles  the night market: two long lines of stalls run ALONG the street, making three aisles; rows of stalls close
//           two aisles at a time and a gap in each line lets you cut across - a market you weave through
//   yard    the docks: steel container walls; a container spur runs back from every wall, so each stretch is an S-bend
//           with a dead-end pocket beside it (and something asleep in it)
//   chicane the fort: tight military chicanes of hesco and sandbags, a few metres apart, swinging hard left and right
function genMaze(d) {
  const rng = mulberry(7000 + d.id * 31);
  const rows = [], lanes = [];
  const zones = WIDE[d.style] ? [] : mazeZones(d);
  const style = d.style || 'rows';
  let side = rng() < 0.5 ? -1 : 1;
  for (const [a, b] of zones) {
    const zrows = [];
    for (let z = a; z > b; z -= d.rowGap[0] + rng() * d.rowGap[1]) {
      let gx, gw = 3.2;
      if (style === 'aisles') {
        // the gap is one of the three aisles, never the same one twice running
        const opts = [-6.2, 0, 6.2].filter((x) => x !== zrows[zrows.length - 1]?.gx);
        gx = opts[(rng() * opts.length) | 0]; gw = 3.0;
      } else if (style === 'yard' || style === 'chicane') {
        gx = side * (style === 'yard' ? 6.6 : 5.6 + rng() * 1.2); side = -side; gw = style === 'yard' ? 3.4 : 3.0;
      } else {
        const centre = rng() < 0.18;
        gx = centre ? 0 : side * (5.2 + rng() * 1.6);
        if (!centre) side = -side;
      }
      const kind = d.rowKinds[(rng() * d.rowKinds.length) | 0];
      const row = { z: +z.toFixed(1), gx: +gx.toFixed(2), gw, kind, seed: (rng() * 1e6) | 0 };
      zrows.push(row); rows.push(row);
    }
    if (style === 'aisles') {
      // stall lines along the street between each pair of rows, each with one break to cut across
      for (let i = 0; i + 1 < zrows.length; i++) {
        const z0 = zrows[i].z - 0.7, z1 = zrows[i + 1].z + 0.7;
        for (const x of [-3.1, 3.1]) {
          const span = z0 - z1, bw = 2.8;
          const bs = z0 - 1.5 - rng() * Math.max(0.1, span - 3 - bw);
          lanes.push({ x, z0, z1, kind: 'stalls', brk: [+bs.toFixed(2), +(bs - bw).toFixed(2)], seed: (rng() * 1e6) | 0 });
        }
      }
    } else if (style === 'yard') {
      // a container spur back (south) from the middle of each wall but the first: an S-bend and a blind pocket
      for (let i = 1; i < zrows.length; i++) {
        const len = Math.min(12.1, zrows[i - 1].z - zrows[i].z - 1.25 - 1.25 - 3.4);
        if (len < 5) continue;
        lanes.push({ x: 0, z0: +(zrows[i].z + 1.22 + len).toFixed(2), z1: +(zrows[i].z + 1.22).toFixed(2), kind: 'containers', brk: null, seed: (rng() * 1e6) | 0 });
      }
    }
  }
  return { rows, lanes };
}

// the two maze stretches of a level: start -> junction, gate -> boss plaza
const mazeZones = (d) => [[d.L.start.z - 11, d.L.cross[0] + 13], [d.L.gate[0] - 11, d.L.lz.z + 17]];
const WIDE = { wards: 1, warehouse: 1, canals: 1 };
function genZones(d) {
  if (!WIDE[d.style]) return [];
  return mazeZones(d).map(([a, b], k) => {
    const seed = 9100 + d.id * 53 + k * 7;
    if (d.style === 'canals') return genCanals(seed, a, b, ZONE_HW);
    const ward = d.style === 'wards';
    const Z = genInterior(seed, a, b, ZONE_HW, ward ? { corridors: 0.45, loops: 0.25, arch: 0.15, archC: 0.3, maxArea: 9 } : { corridors: 0.35, loops: 0.12, arch: 0.25, archC: 0.5, maxArea: 12, key: d.keys?.[k] });
    Z.style = d.style;
    Z.index = k;
    return Z;
  });
}
// the wide zone (if any) that z is in
export function zoneAt(z, pad = 0) {
  for (const Z of ZONES) if (z <= Z.zTop + pad && z >= Z.zBot - pad) return Z;
  return null;
}

// is (x, z) inside a maze piece (with `pad` metres to spare)? Used to keep kits, lamps and sleepers out of the walls.
export function inMaze(x, z, pad = 1.2) {
  const Z = zoneAt(z, 0.5);
  if (Z && zoneBlocked(Z, x, z, pad * 0.7)) return true;
  for (const r of MAZE) if (Math.abs(r.z - z) < pad + 0.6 && Math.abs(x - r.gx) > r.gw / 2 - 0.2) return true;
  for (const l of LANES) {
    if (Math.abs(x - l.x) > pad + 0.8 || z > l.z0 + pad || z < l.z1 - pad) continue;
    if (l.brk && z < l.brk[0] - pad && z > l.brk[1] + pad) continue;
    return true;
  }
  return false;
}

export function setLevel(n) {
  const d = LEVELS[n] || LEVELS[1];
  for (const k of Object.keys(L)) delete L[k];
  Object.assign(L, JSON.parse(JSON.stringify(d.L)));
  HOLDS.splice(0, HOLDS.length, ...d.holds);
  const mz = genMaze(d);
  MAZE.splice(0, MAZE.length, ...mz.rows);
  LANES.splice(0, LANES.length, ...mz.lanes);
  ZONES.splice(0, ZONES.length, ...genZones(d));
  // first-aid kits: a few along each stretch, never in a barricade, and one in front of the boss plaza
  const kits = [];
  const kz = [d.L.start.z - 18, (d.L.start.z + d.L.cross[0]) / 2, d.L.cross[0] + 9, d.L.gate[0] - 16, (d.L.gate[0] + d.L.lz.z) / 2, d.L.lz.z + 14];
  kz.forEach((z, i) => {
    const Z = zoneAt(z);
    if (Z?.kind === 'interior') {
      // the middle of the nearest real room (furniture keeps to the walls)
      const r = Z.rooms.filter((q) => q.kind !== 'corridor' && !q.keyRoom).sort((a, b) => Math.abs(a.cz - z) - Math.abs(b.cz - z))[0];
      if (r) { kits.push([+r.cx.toFixed(1), +r.cz.toFixed(1)]); r.medkit = true; return; }
    }
    let zz = z, x = i % 2 ? 4.6 : -4.6;
    for (let k = 0; k < 40 && inMaze(x, zz, 0.9); k++) { if (k % 2) zz -= 1.5; x = -x; }
    kits.push([x, +zz.toFixed(1)]);
  });
  MEDKITS.splice(0, MEDKITS.length, ...kits);
  // ambushes: one a little way into each stretch, bigger every level
  const ak = d.ambK || 1, an = (b) => Math.round((b + 1.5 * d.id) * ak);
  AMBUSH.splice(0, AMBUSH.length, { z: d.L.start.z - 30, n: an(6) }, { z: d.L.cross[0] + 30, n: an(8), brutes: d.id >= 3 ? 1 : 0 },
    { z: d.L.gate[0] - 30, n: an(9), brutes: d.id >= 2 ? 1 : 0 }, { z: d.L.lz.z + 30, n: an(9), brutes: d.id >= 4 ? 1 : 0 });
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
  // a wide zone pushes the buildings back to its walls: the part of a lot inside the zone's z range starts at ZONE_HW
  let out = lots;
  for (const Z of ZONES) {
    const next = [];
    const inner = ZONE_HW + 0.25;
    for (const lot of out) {
      if (lot.z1 <= Z.zBot || lot.z0 >= Z.zTop) { next.push(lot); continue; }
      if (lot.z0 < Z.zBot - 2) next.push({ ...lot, z1: Z.zBot, northCross: false, southCross: false });
      if (lot.z1 > Z.zTop + 2) next.push({ ...lot, z0: Z.zTop, northCross: false });
      const z0 = Math.max(lot.z0, Z.zBot), z1 = Math.min(lot.z1, Z.zTop);
      const far = lot.side < 0 ? lot.x0 : lot.x1;
      if (Math.abs(far) - inner < 4) continue;
      next.push({ ...lot, z0, z1, x0: lot.side < 0 ? Math.min(lot.x0, -inner - 6) : inner, x1: lot.side < 0 ? -inner : Math.max(lot.x1, inner + 6), southCross: false, northCross: false, zone: true });
    }
    out = next;
  }
  return out;
}

// Lamp posts: one every ~22 m, alternating sides, on the sidewalk.
export function lampSites() {
  const out = [];
  let k = 0;
  for (let z0 = 30; z0 > L.zMin + 6; z0 -= 22) {
    // keep clear of the gates, the cross-street mouths, the barricade rows and the safe room front
    const ok = (z) => !L.cross.some((c) => Math.abs(z - c) < 7) && !L.gate.some((g) => Math.abs(z - g) < 4) && !MAZE.some((r) => Math.abs(z - r.z) < 2.5) && z > L.zMin + 10 && !zoneAt(z, 3);
    const z = [0, 3, -3, 5, -5].map((o) => z0 + o).find(ok);
    if (z === undefined) continue;
    const side = k++ % 2 ? 1 : -1;
    out.push({ x: side * 7.7, z, ry: side < 0 ? 0 : Math.PI });
  }
  return out;
}
