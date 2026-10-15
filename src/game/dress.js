// Dressing the level: the four checkpoint gates, the junction arenas, the
// landing zone, wrecks along the avenue and the traffic furniture (populate,
// before the nav grid is built); then the ground itself — manholes, drains,
// scorching, a few cracks, the fallen, blood, a low fog (dressGround).
//
// Rule from Sam: keep the ground clear. Things lie where something happened
// (a wreck, a fire, a body) and nowhere else.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prop, instanced, tex, surface } from './assets.js';
import { mulberry } from './rng.js';
export { buildMaze };
import { L, LV, MAZE, LANES } from './level.js';
import { container, stall, hesco, lanternStrings, safeRoom } from './kit.js';
import { Q } from './quality.js';
import { placeObjective } from './objective.js';
import { signTexture } from './world.js';

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

// ------------------------------------------------------------ populate ----
// Everything with a collider has to exist before the nav field is built.
export function populate(world) {
  const col = world.col;
  const rng = mulberry(77);
  const put = (name, x, z, ry = 0, o = {}) => {
    const g = prop(name);
    const y = o.y ?? world.groundY(x, z);
    g.position.set(x, y, z);
    g.rotation.y = ry;
    if (o.s) g.scale.setScalar(o.s);
    if (o.tilt) g.rotation.z = o.tilt;
    world.add(g);
    if (o.box) col.box(x, z, o.box[0], o.box[1], -ry, o.h ?? 1.0, o.tag || 'solid');
    if (o.circle) col.circle(x, z, o.circle, o.h ?? 1.0, o.tag || 'solid');
    return g;
  };
  const tint = (g, hex, wreck) => g.traverse((c) => {
    if (!c.isMesh) return;
    const mats = Array.isArray(c.material) ? c.material : [c.material];
    const next = mats.map((m) => {
      if (m.name !== 'paint') return m;
      const p = m.clone();
      p.onBeforeCompile = m.onBeforeCompile;
      p.customProgramCacheKey = m.customProgramCacheKey;
      p.color.set(hex);
      if (wreck) { p.roughness = 0.8; p.clearcoat = 0.05; p.color.multiplyScalar(0.55); }
      return p;
    });
    c.material = Array.isArray(c.material) ? next : next[0];
  });
  const veh = (name, x, z, ry, hw, hd, color, wreck = false, h = 1.7) => {
    const g = put(name, x, z, ry, { y: 0 });
    tint(g, color, wreck);
    col.box(x, z, hw, hd, -ry, h);
    return g;
  };
  const sandbags = (x, z, ry = 0) => {
    put('sandbags', x, z, ry);
    for (let a = -28; a <= 28; a += 7) {
      const r = a * Math.PI / 180, lx = Math.sin(r) * 3.2, lz = Math.cos(r) * 3.2 - 3.2;
      col.circle(x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry), 0.4, 0.62, 'low');
    }
  };
  const fire = (x, z, o = {}) => world.fires.push({ x, y: o.y ?? 0.95, z, phase: rng() * 10, size: o.size ?? 1, rgb: o.rgb, color: o.color });
  const floodlight = (x, z, ry) => {
    put('floodlight', x, z, ry, { circle: 0.4, h: 2.5 });
    world.lampSpots.push({ x, y: 2.8, z, broken: false, phase: 0, nofx: true, power: 0.8 });
  };
  const tints = [0x5b1f1c, 0x29323d, 0x6b6a62, 0x1e2a22, 0x3c3c3e, 0x44331f, 0x2c3540, 0x6e6f6a];
  const police = (x, z, ry) => {
    const o = put('car_police', x, z, ry, { y: 0 });
    col.box(x, z, 2.45, 0.95, -ry, 1.5);
    world.police.push({ obj: o, x, z });
  };
  const wreck = (kind, x, z, ry, i, burn = false) => {
    const g = put(kind, x, z, ry, { y: 0 });
    tint(g, tints[i % tints.length], kind === 'car_wreck');
    col.box(x, z, 2.42, 0.93, -ry, 1.45);
    if (burn) fire(x + Math.cos(ry) * 1.6, z - Math.sin(ry) * 1.6, { y: 1.0, size: 1.4 });
  };

  // ---- the gates
  L.gate.forEach((gz, k) => buildGate(world, k, gz, put, floodlight, sandbags, fire));

  // ---- the start: the safe room you came out of, its door open behind you
  world.startRoom = safeRoom(world, 35, 1, true);
  floodlight(6.9, 31, 3.4);
  fire(5.4, 27, { size: 1 }); put('barrel', 5.4, 27, 0, { circle: 0.32, h: 0.9 });
  put('crate_mil', -5.4, 30.5, 0.3, { box: [0.5, 0.25], h: 0.42, tag: 'low' });
  put('crate_mil', -5.8, 29.6, -0.2, { box: [0.5, 0.25], h: 0.42, tag: 'low' });
  put('crate_mil', -5.6, 30.1, 0.1, { y: 0.42 });
  // ---- the end: the next safe room, shut until the boss is down (level 5 ends at the helicopter instead)
  if (LV.finale === 'saferoom') world.endRoom = safeRoom(world, L.zMin + 4.5, -1, false);

  // ---- the junction arenas: cover to fight from, in five different arrangements. A level picks which one
  // stands at each junction (and may mirror it), so level 2 re-uses the kits in a different order.
  const arenas = {
    // the old police roadblock
    1: (zc, A) => {
      A.police(-3.4, zc - 5.2, 0.35);
      A.sandbags(3.4, zc + 4.6, 0.12);
      A.sandbags(-3.2, zc + 5.4, -0.1);
      A.put('barrel', 5.4, zc - 3.2, 0, { circle: 0.32, h: 0.9 }); A.fire(5.4, zc - 3.2);
      A.put('barrel', -5.4, zc + 1.2, 0, { circle: 0.32, h: 0.9 }); A.fire(-5.4, zc + 1.2);
      A.floodlight(6.9, zc + 1, 3.0);
      A.put('crate_wood', 5.0, zc - 6.4, 0.2, { box: [0.45, 0.45], h: 0.85 });
      A.put('crate_wood', 5.7, zc - 5.8, 0.5, { box: [0.45, 0.45], h: 0.85 });
      A.put('crate_wood', 5.3, zc - 6.1, 0.9, { y: 0.9, s: 0.9 });
    },
    // an overturned ambulance and a van
    2: (zc, A) => {
      A.veh('ambulance', 3.6, zc - 4.6, -0.28, 2.95, 1.05, 0xffffff, false, 2.6);
      A.veh('van', -4.6, zc + 6.2, 2.78, 2.95, 1.05, 0x2d4560, true, 2.5);
      A.fire(-4.6 - Math.cos(2.78) * 1.2, zc + 6.2 + Math.sin(2.78) * 1.2, { y: 1.2, size: 1.2 });
      A.sandbags(0.2, zc + 3.6, 0.05);
      A.put('barrel', -5.3, zc - 2.4, 0, { circle: 0.32, h: 0.9 }); A.fire(-5.3, zc - 2.4);
      A.put('crate_mil', 5.4, zc + 2.4, 0.25, { box: [0.5, 0.25], h: 0.42, tag: 'low' });
      A.put('crate_mil', 5.9, zc + 1.8, -0.1, { box: [0.5, 0.25], h: 0.42, tag: 'low' });
      A.floodlight(-6.9, zc - 1.5, 0.2);
    },
    // a pickup and an SUV crash, a barricade of plywood
    3: (zc, A) => {
      A.veh('pickup', -3.4, zc - 5.2, 0.5, 2.7, 1.0, 0x4d1f1b, true, 1.8);
      A.veh('suv', 4.2, zc + 5.6, 2.5, 2.5, 1.0, 0x1c2128, false, 1.8);
      A.sandbags(-0.6, zc - 0.5, 0.0);
      A.put('plywood_barrier', 7.0, zc - 2.5, 1.5, { box: [1.2, 0.1], h: 1.2 });
      A.put('plywood_barrier', -7.0, zc + 2.5, 1.55, { box: [1.2, 0.1], h: 1.2 });
      A.put('barrel', 5.2, zc - 1.5, 0, { circle: 0.32, h: 0.9 }); A.fire(5.2, zc - 1.5);
      A.put('cinder_blocks', 2.0, zc - 5.8, 0.3, { box: [0.85, 0.2], h: 0.4, tag: 'low' });
      A.floodlight(6.9, zc + 2.4, 3.3);
    },
    // the military cordon: two police cars in a V, crates, light
    4: (zc, A) => {
      A.police(-3.8, zc - 5.4, 0.55);
      A.police(3.8, zc - 5.4, -0.55);
      A.sandbags(-5.0, zc + 2.0, 0.5);
      A.sandbags(5.0, zc + 2.0, -0.5);
      A.put('crate_mil', 0.6, zc + 5.6, 0.2, { box: [0.5, 0.25], h: 0.42, tag: 'low' });
      A.put('crate_mil', 1.3, zc + 5.2, -0.15, { box: [0.5, 0.25], h: 0.42, tag: 'low' });
      A.put('crate_mil', 0.9, zc + 5.4, 0.1, { y: 0.42 });
      A.put('barrel', -5.4, zc - 1.6, 0, { circle: 0.32, h: 0.9 }); A.fire(-5.4, zc - 1.6);
      A.floodlight(-6.9, zc + 0.6, 0.0);
      A.floodlight(6.9, zc - 2.6, 3.14);
    },
    // the docks' yard: containers along both kerbs and floodlights, the middle left clear for the bulldozer
    yard: (zc, A) => {
      for (const [x, z, ry] of [[-7.2, zc + 6.5, 0.04], [7.3, zc - 6.8, -0.03]]) {
        const m = container(5 + Math.round(x));
        m.position.set(x, 0, z); m.rotation.y = Math.PI / 2 + ry;
        world.add(m);
        col.box(x, z, 1.22, 3.03, -ry, 2.6);
      }
      A.sandbags(-4.6, zc - 4.8, 0.3);
      A.sandbags(4.8, zc + 4.2, -0.3 + Math.PI);
      A.put('crate_mil', -5.6, zc + 1.4, 0.2, { box: [0.5, 0.25], h: 0.42, tag: 'low' });
      A.put('barrel', 5.6, zc - 1.2, 0, { circle: 0.32, h: 0.9 }); A.fire(5.6, zc - 1.2);
      A.floodlight(-6.9, zc - 2.2, 0.1);
      A.floodlight(6.9, zc + 2.6, 3.1);
    },
    // the boss plaza: open ground to fight in, a little cover at the edges and fire to see by
    plaza: (zc, A) => {
      A.sandbags(-5.4, zc + 7.5, 0.2);
      A.sandbags(5.4, zc - 6.5, Math.PI - 0.2);
      A.put('barrel', -6.2, zc - 3, 0, { circle: 0.32, h: 0.9 }); A.fire(-6.2, zc - 3);
      A.put('barrel', 6.2, zc + 3.5, 0, { circle: 0.32, h: 0.9 }); A.fire(6.2, zc + 3.5);
      A.floodlight(-7.0, zc + 9, 0.1);
      A.floodlight(7.0, zc - 10, 3.0);
      A.wreck('car_wreck', -16, zc + 1.5, 0.15, 3, true);
      A.wreck('car_sedan', 17, zc - 1.2, -0.2, 5, false);
    },
    // a stalled ambulance convoy: two ambulances nose to tail either side, a burning wreck between
    5: (zc, A) => {
      A.veh('ambulance', -3.9, zc - 4.8, 0.3, 2.95, 1.05, 0xffffff, false, 2.6);
      A.veh('ambulance', 3.7, zc + 5.0, 2.9, 2.95, 1.05, 0xe9e4d6, true, 2.6);
      A.veh('car_wreck', 0.2, zc + 0.4, 1.35, 2.42, 0.93, 0x29323d, true, 1.45);
      A.fire(0.2 + Math.cos(1.35) * 1.6, zc + 0.4 - Math.sin(1.35) * 1.6, { y: 1.0, size: 1.4 });
      A.sandbags(-3.2, zc + 4.2, 0.1);
      A.sandbags(3.0, zc - 3.6, Math.PI - 0.1);
      A.put('barrel', 5.5, zc - 0.4, 0, { circle: 0.32, h: 0.9 }); A.fire(5.5, zc - 0.4);
      A.put('crate_mil', -5.4, zc - 0.8, 0.2, { box: [0.5, 0.25], h: 0.42, tag: 'low' });
      A.floodlight(-6.9, zc + 1.4, 0.1);
      A.floodlight(6.9, zc - 1.8, 3.1);
    },
  };
  // x mirrors, and so does every heading
  const mirror = (m) => ({
    put: (n, x, z, ry, o) => put(n, m * x, z, m * ry, o),
    veh: (n, x, z, ry, hw, hd, c, w, h) => veh(n, m * x, z, m * ry, hw, hd, c, w, h),
    police: (x, z, ry) => police(m * x, z, m * ry),
    sandbags: (x, z, ry) => sandbags(m * x, z, m * ry),
    floodlight: (x, z, ry) => floodlight(m * x, z, m * ry),
    fire: (x, z, o) => fire(m * x, z, o),
    wreck: (k, x, z, ry, i, burn) => wreck(k, m * x, z, m * ry, i, burn),
  });
  const zc = L.cross;
  zc.forEach((c, i) => {
    const a = LV.arenas[i % LV.arenas.length];
    arenas[a.k](c, mirror(a.flip ? -1 : 1));
  });

  // ---- the landing zone (the last level only)
  if (LV.finale === 'heli') buildPad(world, put, sandbags, floodlight, fire, police);

  // ---- junction furniture: signals and stop signs at the four corners
  for (const c of zc) {
    put('traffic_light', 7.7, c + 7.1, Math.PI, { circle: 0.14, h: 6 });
    put('traffic_light', -7.7, c - 7.1, 0, { circle: 0.14, h: 6 });
    put('stop_sign', 7.9, c - 6.9, 0, { circle: 0.06, h: 2.3 });
    put('stop_sign', -7.9, c + 6.9, Math.PI, { circle: 0.06, h: 2.3 });
    for (const [x, z] of [[7.6, c + 6.5], [-7.6, c - 6.5]]) put('bollard', x, z, 0, { circle: 0.15, h: 1.0 });
  }

  // ---- the maze: barricade rows across the street, one gap each (level.js MAZE)
  buildMaze(world, { put, veh, wreck, sandbags, fire, rng });
  buildLanes(world, { put, veh, fire, rng });
  placeObjective(world);           // breaker cabinets, nests and gas tanks need their colliders before the nav grid
  if (LV.theme.lanterns) {
    const zs = [];
    for (let z = L.zMax - 8; z > L.zMin + 10; z -= 12) if (!MAZE.some((r) => Math.abs(r.z - z) < 1) && !L.gate.some((g) => Math.abs(g - z) < 4)) zs.push(z);
    lanternStrings(world, zs);
  }

  // ---- shop awnings, boarded windows and doors along the ground floor
  world.dressFacades?.();
}

// ------------------------------------------------------------ the maze ----
// Each row runs from building front to building front (x -9.3..9.3) except for its gap. What a row is made of depends
// on the level: concrete jersey barriers and chain-link you can SHOOT OVER (h < 0.9) but not walk through; wrecks,
// ambulances, containers and hesco walls that stop bullets too. Some rows get a short wing beside the gap, so the way
// through is a little dog-leg rather than a hole.
const CAR_TINTS = [0xc83a2a, 0x2a6ac8, 0xe8c02a, 0x2aa86a, 0xe8e4dc, 0x8a3ac0, 0xe8762a, 0x30b8c8];
function buildMaze(world, A) {
  const col = world.col;
  let ci = 0;
  for (const row of MAZE) {
    const r = mulberry(row.seed);
    const g0 = row.gx - row.gw / 2, g1 = row.gx + row.gw / 2;
    const spans = [[-9.3, g0], [g1, 9.3]].filter(([a, b]) => b - a > 0.3);
    for (const [a, b] of spans) fillSpan(world, row, a, b, r, A, () => ci++);
    // a wing along the street beside the gap (a dog-leg), on the side away from the wall (the open-street styles only)
    if (r() < 0.55 && Math.abs(row.gx) > 1 && (LV.style || 'rows') === 'rows' || LV.style === 'pileup' && r() < 0.4 && Math.abs(row.gx) > 1) {
      const wx = row.gx > 0 ? g0 - 0.3 : g1 + 0.3;
      const dz = (r() < 0.5 ? -1 : 1) * 2.4;
      const kind = row.kind === 'containers' || row.kind === 'hesco' ? row.kind : 'jersey';
      if (kind === 'containers') {
        const m = container(ci++);
        m.position.set(wx + (row.gx > 0 ? -1.22 : 1.22), 0, row.z + dz * 1.3);
        m.rotation.y = Math.PI / 2;
        world.add(m);
        col.box(m.position.x, m.position.z, 1.22, 3.03, 0, 2.6);
      } else if (kind === 'hesco') {
        for (let k = 0; k < 3; k++) { const h = hesco(); h.position.set(wx, 0, row.z + Math.sign(dz) * (0.8 + k * 1.1)); world.add(h); }
        col.box(wx, row.z + Math.sign(dz) * 1.9, 0.55, 1.65, 0, 1.05);
      } else {
        A.put('barrier', wx, row.z + dz * 0.7, Math.PI / 2 + (r() - 0.5) * 0.06, { box: [1.5, 0.3], h: 0.82, tag: 'low' });
      }
    }
  }
}

// walls ALONG the street (level.js LANES): the market's stall lines, the docks' container spurs
function buildLanes(world, A) {
  const col = world.col;
  let ci = 3;
  for (const l of LANES) {
    const r = mulberry(l.seed);
    const parts = l.brk ? [[l.z0, l.brk[0]], [l.brk[1], l.z1]] : [[l.z0, l.z1]];
    for (const [s0, s1] of parts) {
      const len = s0 - s1;
      if (len < 0.8) continue;
      if (l.kind === 'stalls') {
        // stalls back to back down the middle of the street, canopies over both aisles
        const n = Math.max(1, Math.round(len / 3.05));
        for (let i = 0; i < n; i++) {
          const z = s0 - (i + 0.5) * len / n;
          // one stall per slot, facing the two aisles in turn, a striped tarp hung behind it (half the cost of two)
          for (const face of [i % 2 ? 1 : -1]) {
            const g = stall(ci++, r);
            g.position.set(l.x + face * 0.3, world.groundY(l.x, z), z);
            g.rotation.y = face > 0 ? -Math.PI / 2 : Math.PI / 2;
            g.scale.set(Math.min(1, len / n / 3.05), 1, 1);
            world.add(g);
          }
        }
        col.box(l.x, (s0 + s1) / 2, 1.25, len / 2, 0, 0.88, 'low');
      } else {
        // a line of shipping containers end to end
        const n = Math.max(1, Math.round(len / 6.06));
        for (let i = 0; i < n; i++) {
          const z = s0 - (i + 0.5) * len / n;
          const m = container(ci++);
          m.position.set(l.x + (r() - 0.5) * 0.2, 0, z);
          m.rotation.y = Math.PI / 2 + (r() - 0.5) * 0.04;
          m.scale.set(Math.min(1.02, len / n / 6.06), 1, 1);
          world.add(m);
        }
        col.box(l.x, (s0 + s1) / 2, 1.22, len / 2, 0, 2.6);
      }
    }
  }
}

function fillSpan(world, row, a, b, r, A, nextColor) {
  const col = world.col;
  const z = row.z;
  let x = a;
  const len = b - a;
  const jitter = () => (r() - 0.5) * 0.3;
  // n pieces spread evenly over [x0, x1] (they overlap a little rather than leave a crack)
  const run = (x0, x1, piece, fn) => {
    const n = Math.max(1, Math.ceil((x1 - x0) / piece - 0.15));
    for (let i = 0; i < n; i++) fn(x0 + (i + 0.5) * (x1 - x0) / n);
  };
  const barrierRun = (x0, x1) => run(x0, x1, 3, (cx) => A.put('barrier', cx, z + jitter() * 0.4, (r() - 0.5) * 0.08, { box: [Math.max(1.5, (x1 - x0) / 2 / Math.ceil((x1 - x0) / 3)), 0.3], h: 0.82, tag: 'low' }));
  const fenceRun = (x0, x1) => run(x0, x1, 3.06, (cx) => {
    A.put('fence_chain', cx, z, 0, { box: [1.53, 0.1], h: 0.85, tag: 'low' });
    if (r() < 0.35) A.put('plywood_barrier', cx + (r() - 0.5), z + 0.35, (r() - 0.5) * 0.2);
  });
  if (len < 2.6) {
    // a sliver between the gap and a wall: barrels, exactly as wide as it is
    for (let xx = a + 0.3; xx < b; xx += 0.62) A.put(r() < 0.5 ? 'barrel' : 'barrel_blue', Math.min(xx, b - 0.3), z + jitter() * 0.3, r() * 6);
    col.box((a + b) / 2, z, len / 2, 0.32, 0, 0.85, 'low');
    return;
  }
  switch (row.kind) {
    case 'pileup': {
      // a crash pile-up: cars, vans and ambulances slewed at angles, shunted into each other
      while (b - x > 3.2) {
        const big = r() < 0.45;
        const name = big ? (r() < 0.55 ? 'ambulance' : 'van') : (r() < 0.45 ? 'car_wreck' : r() < 0.5 ? 'car_sedan' : r() < 0.5 ? 'pickup' : 'suv');
        const hw = big ? 3.0 : name === 'pickup' ? 2.75 : 2.45, hd = big ? 1.15 : 1.0;
        const ang = (0.35 + r() * 0.4) * (r() < 0.5 ? -1 : 1);
        const ex = hw * Math.cos(ang) + hd * Math.abs(Math.sin(ang));
        if (b - x < ex * 2 - 0.3) break;
        const ry = ang + (r() < 0.5 ? Math.PI : 0);
        const tint = name === 'ambulance' ? 0xffffff : CAR_TINTS[nextColor() % CAR_TINTS.length];
        const cx = Math.min(x + ex, b - ex), cz = z + (r() - 0.5) * 1.6;
        A.veh(name, cx, cz, ry, hw, hd, tint, name === 'car_wreck' || r() < 0.3, big ? 2.4 : 1.6);
        if (r() < 0.22) A.fire(cx, cz, { y: 1.1, size: 1.3 });
        x = cx + ex - 0.9;
      }
      if (b - x > 0.4) {
        for (let xx = x + 0.3; xx < b; xx += 0.62) A.put(r() < 0.5 ? 'barrel' : 'barrel_blue', Math.min(xx, b - 0.3), z + jitter() * 0.3, r() * 6);
        col.box((x + b) / 2, z, (b - x) / 2, 0.32, 0, 0.85, 'low');
      }
      break;
    }
    case 'cars':
    case 'ambulance': {
      // vehicles nose to tail across the street; a barrier closes what is left
      while (b - x > 4.4) {
        const big = row.kind === 'ambulance' && r() < 0.6;
        const name = big ? (r() < 0.6 ? 'ambulance' : 'van') : (r() < 0.5 ? 'car_wreck' : r() < 0.5 ? 'car_sedan' : 'pickup');
        const hw = big ? 3.04 : name === 'pickup' ? 2.79 : 2.47;
        if (b - x < hw * 2) break;
        const ry = (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 0.25;
        const tint = big && name === 'ambulance' ? 0xffffff : CAR_TINTS[nextColor() % CAR_TINTS.length];
        A.veh(name, x + hw, z + jitter(), ry, hw, big ? 1.3 : 1.0, tint, name === 'car_wreck', big ? 2.4 : 1.6);
        if (r() < 0.12) A.fire(x + hw, z, { y: 1.1, size: 1.2 });
        x += hw * 2 + 0.05;
      }
      if (b - x > 0.4) barrierRun(x, b);
      break;
    }
    case 'containers': {
      // steel shipping containers, sometimes stacked two high
      while (b - x > 2.0) {
        const w = Math.min(6.06, b - x + 1.2);
        const m = container(nextColor());
        const cx = x + w / 2;
        m.position.set(cx, 0, z + jitter() * 0.5);
        m.rotation.y = (r() - 0.5) * 0.06 + (r() < 0.5 ? Math.PI : 0);
        world.add(m);
        col.box(cx, z, w / 2, 1.22, 0, 2.6);
        if (r() < 0.35) { const t = container(nextColor()); t.position.set(cx + (r() - 0.5) * 0.4, 2.6, z + (r() - 0.5) * 0.3); t.rotation.y = (r() - 0.5) * 0.1; world.add(t); }
        x += 6.1;
      }
      if (b - x > 0.4) barrierRun(x, b);
      break;
    }
    case 'stalls': {
      // market stalls back to back with the gap between them; crates and a barrier fill the ends
      while (b - x > 3.0) {
        const g = stall(nextColor(), r);
        g.position.set(x + 1.5, world.groundY(x + 1.5, z), z);
        if (r() < 0.5) g.rotation.y += Math.PI;
        world.add(g);
        col.box(x + 1.5, z, 1.5, 0.65, 0, 0.88, 'low');
        x += 3.05;
      }
      if (b - x > 0.4) { A.put('crate_wood', (x + b) / 2, z, r(), { box: [Math.max(0.3, (b - x) / 2), 0.45], h: 0.85 }); }
      break;
    }
    case 'hesco': {
      for (let xx = x; xx < b - 0.2; xx += 1.1) { const h = hesco(); h.position.set(Math.min(xx + 0.55, b - 0.55), 0, z); world.add(h); }
      col.box((a + b) / 2, z, (b - a) / 2, 0.55, 0, 1.05);
      break;
    }
    case 'fence':
      fenceRun(a, b);
      break;
    default:
      barrierRun(a, b);
  }
}

// ------------------------------------------------------------ the gates ----
function hazardTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#c9a21a'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#16140f';
  for (let i = -2; i < 10; i++) { g.beginPath(); g.moveTo(i * 16, 32); g.lineTo(i * 16 + 8, 32); g.lineTo(i * 16 + 40, 0); g.lineTo(i * 16 + 32, 0); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function box(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }

function buildGate(world, k, gz, put, floodlight, sandbags, fire) {
  const col = world.col;
  const steel = surface('metal', 1, 0x4a5258); steel.metalness = 0.65; steel.roughness = 0.6;
  const concrete = surface('concrete', 1, 0x8f8b82);
  const hazard = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.55, metalness: 0.2 });
  const grp = new THREE.Group();
  grp.position.set(0, 0, gz);
  grp.userData.noMerge = true;
  world.add(grp);
  // the two leaves: bars between rails, a hazard band across the top
  const leaves = [];
  for (const side of [-1, 1]) {
    const bars = [];
    for (let i = 0; i < 14; i++) bars.push(box(0.09, 3.2, 0.09, -2.98 + i * 0.46, 1.9, 0));
    for (const y of [0.4, 1.7, 3.3]) bars.push(box(6.3, 0.16, 0.2, 0, y, 0));
    for (const x of [-3.1, 3.1]) bars.push(box(0.2, 3.7, 0.24, x, 1.85, 0));
    const lf = new THREE.Group();
    lf.add(new THREE.Mesh(mergeGeometries(bars), steel));
    const hz = new THREE.Mesh(box(6.3, 0.55, 0.12, 0, 2.7, 0), hazard);
    lf.add(hz);
    lf.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    lf.position.set(side * 3.2, 0, 0);
    lf.userData.x0 = side * 3.2;
    grp.add(lf);
    leaves.push(lf);
  }
  // posts, the walls out to the buildings, the header and its sign
  const fixed = [];
  for (const side of [-1, 1]) {
    fixed.push(box(1.1, 4.6, 1.1, side * 6.9, 2.3, 0));
    fixed.push(box(1.7, 2.7, 0.9, side * 8.25, 1.35, 0));
  }
  const m = new THREE.Mesh(mergeGeometries(fixed), concrete);
  m.castShadow = true; m.receiveShadow = true;
  grp.add(m);
  const header = new THREE.Mesh(box(15.4, 0.5, 0.7, 0, 4.6, 0), steel);
  header.castShadow = true;
  grp.add(header);
  const hz2 = new THREE.Mesh(box(15.4, 0.22, 0.72, 0, 4.2, 0), hazard);
  grp.add(hz2);
  const sg = new THREE.MeshBasicMaterial({ map: signTexture(`CHECKPOINT ${k + 1}`, '#ff5a38', '#120a08', 512, 96), toneMapped: false });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.05), sg);
  sign.position.set(0, 5.35, 0.36);
  grp.add(sign);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, toneMapped: false }));
  beacon.position.set(0, 6.15, 0);
  grp.add(beacon);
  // colliders: the leaves (removed on opening), the posts and walls (always)
  const cols = [col.box(0, gz, 6.4, 0.45, 0, 4, 'gate')];
  for (const side of [-1, 1]) col.box(side * 7.7, gz, 1.4, 0.55, 0, 4.6);
  world.gates[k] = { group: grp, cols, leaves, beacon, open: false, t: 0, z: gz };
  // lighting and cover on the near side
  floodlight(-7.2, gz + 3.2, 0.1);
  floodlight(7.2, gz + 3.2, 3.0);
  put('barrel', -5.0, gz + 2.2, 0, { circle: 0.32, h: 0.9 }); fire(-5.0, gz + 2.2);
  put('barrel', 5.0, gz + 2.2, 0, { circle: 0.32, h: 0.9 }); fire(5.0, gz + 2.2);
  sandbags(-2.6, gz + 5.0, 0);
  sandbags(2.6, gz + 5.0, 0);
}

// ------------------------------------------------------- the landing zone ----
function padTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 512);
  g.fillStyle = 'rgba(28,30,32,0.96)'; g.beginPath(); g.arc(256, 256, 250, 0, 7); g.fill();
  g.strokeStyle = '#d6b21c'; g.lineWidth = 14; g.beginPath(); g.arc(256, 256, 232, 0, 7); g.stroke();
  g.strokeStyle = 'rgba(214,178,28,0.6)'; g.lineWidth = 5; g.beginPath(); g.arc(256, 256, 204, 0, 7); g.stroke();
  g.fillStyle = '#e8e4d6'; g.fillRect(168, 156, 30, 200); g.fillRect(314, 156, 30, 200); g.fillRect(168, 238, 176, 34);
  for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.16})`; g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 14, 1 + Math.random() * 5); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function buildPad(world, put, sandbags, floodlight, fire, police) {
  const { x, z, r } = L.lz;
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(r * 2 + 1, r * 2 + 1), new THREE.MeshStandardMaterial({ map: padTexture(), transparent: true, roughness: 0.8, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -3 }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(x, 0.03, z);
  pad.receiveShadow = true;
  world.add(pad);
  // perimeter lights
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x6dffa0, toneMapped: false });
  const g = new THREE.SphereGeometry(0.12, 8, 6);
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    const m = new THREE.Mesh(g, lampMat);
    m.position.set(x + Math.cos(a) * (r + 0.1), 0.14, z + Math.sin(a) * (r + 0.1));
    world.add(m);
  }
  // flares and floods, a cordon of cars and sandbags either side of the pad
  fire(x - 5, z - 5, { size: 1.0, y: 0.25, rgb: [1, 0.2, 0.12], color: 0xff3020 });
  fire(x + 5, z - 5, { size: 1.0, y: 0.25, rgb: [1, 0.2, 0.12], color: 0xff3020 });
  floodlight(-7.0, z + 6, 0.0);
  floodlight(7.0, z + 6, 3.14);
  sandbags(-5.2, z + 12.5, Math.PI);
  sandbags(5.2, z + 12.5, Math.PI);
  police(-4.2, z + 17, 0.4);
  police(4.2, z + 17.5, -0.4);
  // chain-link along the sidewalks, closing the end
  for (const side of [-1, 1]) {
    for (const dz of [-4, 0, 4, 8]) put('fence_chain', side * 8.3, z + dz, Math.PI / 2, { box: [0.08, 1.5], h: 2 });
  }
  for (const dx of [-6, -3, 0, 3, 6]) put('fence_chain', dx, L.zMin + 10, 0, { box: [1.5, 0.08], h: 2 });
}

// ------------------------------------------------------------ the ground ---
export function dressGround(game) {
  const { world, fx, scene } = game;
  const rng = mulberry(31);
  const gy = (x, z) => world.groundY(x, z);
  const mk = (file, max, o = {}) => fx.makeDecals(file, max, o);
  const manhole = mk('manhole', 16, { rough: 0.5 });
  const drain = mk('drain', 40, { rough: 0.6 });
  const skid = mk('skid', 16, { rough: 0.9 });
  const scorch = mk('scorch', 40, { rough: 0.95 });
  const oil = mk('oil', 14, { rough: 0.15 });
  const crack = mk('crackdec', 28, { rough: 0.9 });
  const drag = mk('drag', 24, { rough: 0.2 });
  const tag = mk('tag', 12, { rough: 0.8 });
  const free = (x, z, r = 0.3) => { const p = world.col.resolve(x, z, r); return Math.abs(p.x - x) + Math.abs(p.z - z) < 1e-3; };
  world.steam = [];
  for (const c of L.cross) { manhole.add(-1.6, c + 1.4, 1.05, rng() * 6, 0, 0.004); manhole.add(2.2, c - 2.2, 1.05, rng() * 6, 0, 0.004); world.steam.push({ x: -1.6, z: c + 1.4 }); }
  for (let z = 10; z > L.zMin + 8; z -= 40 + rng() * 20) manhole.add((rng() - 0.5) * 6, z, 1.05, rng() * 6, 0, 0.004);
  // storm drains sit in the gutters beside each curb
  for (let z = 20; z > L.zMin + 6; z -= 18 + rng() * 14) drain.add(rng() < 0.5 ? -5.55 : 5.55, z, 0.85, Math.PI / 2, 0, 0.006);
  // brake marks that end at the wrecks
  const wrecks = world.col.boxes.filter((b) => b.tag === 'solid' && b.hw > 2.3 && b.hw < 3.1 && Math.abs(b.cx) < 6);
  wrecks.slice(0, 12).forEach((b, i) => { if (i % 2 === 0) skid.add(b.cx, b.cz + 4.5, 6.5, 1.57 + (rng() - 0.5) * 0.2, 0, 0.007, 0, 0, 0.55); });
  // everything that burned
  for (const f of world.fires) scorch.add(f.x, f.z, 4.2 * f.size, rng() * 6, 0, 0.005);
  for (let z = 14; z > L.zMin + 10; z -= 30 + rng() * 25) { const x = (rng() - 0.5) * 9; if (free(x, z)) oil.add(x, z, 0.8 + rng() * 1.2, rng() * 6, 0, 0.006); }
  for (let z = 18; z > L.zMin + 10; z -= 12 + rng() * 14) { const x = (rng() - 0.5) * 10; if (free(x, z)) crack.add(x, z, 3 + rng() * 3, rng() * 6, 0, 0.005); }
  // spray paint on a few walls
  for (let z = 6; z > L.zMin + 10; z -= 38 + rng() * 22) {
    const side = rng() < 0.5 ? -1 : 1;
    if (L.cross.some((c) => Math.abs(z - c) < 7)) continue;
    tag.add(side * 9.02 - side * 0.01, z, 1.8, 0.0, 0, 1.6 + rng() * 0.9, -side, 0);
  }

  // ---- debris: only where something happened (wrecks and fires), and only a little
  const clusters = [...world.fires.map((f) => [f.x, f.z, 3.2]), ...wrecks.map((b) => [b.cx, b.cz, 3.0])];
  const spots = (count) => {
    const out = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 30) {
      const c = clusters[(rng() * clusters.length) | 0];
      const x = c[0] + (rng() - 0.5) * c[2] * 2, z = c[1] + (rng() - 0.5) * c[2] * 2;
      if (free(x, z, 0.12)) out.push([x, z]);
    }
    return out;
  };
  const scatter = (name, count, scaleLo = 0.9, scaleHi = 1.15, lift = 0) => {
    const ms = spots(count).map(([x, z]) => {
      const s = scaleLo + rng() * (scaleHi - scaleLo);
      _e.set((name === 'deb_can' || name === 'deb_bottle') && rng() < 0.6 ? Math.PI / 2 : 0, rng() * 6.28, 0, 'YXZ');
      _q.setFromEuler(_e);
      const y = gy(x, z) + lift + ((name === 'deb_can' || name === 'deb_bottle') ? 0.03 : 0);
      return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), new THREE.Vector3(s, s, s));
    });
    if (ms.length) world.add(instanced(name, ms));
  };
  scatter('deb_can', 22, 0.9, 1.1); scatter('deb_bottle', 14, 0.9, 1.1); scatter('deb_carton', 10, 0.8, 1.3, 0.004);
  scatter('deb_brick', 18, 0.85, 1.1); scatter('deb_bag', 8, 0.8, 1.5, 0.002); scatter('deb_rag', 8, 0.9, 1.4, 0.004);
  scatter('deb_plank', 6, 0.8, 1.2, 0.002);

  // ---- the fallen: bodies in the road, each with its pool and a drag trail
  const models = ['z_cop', 'z_worker', 'z_office', 'z_nurse', 'z_hoodie', 'z_jogger', 'z_trucker', 'z_patient', 'z_elder', 'z_burned'];
  const dead = LV.id === 1 ? [
    [-3.5, L.cross[0] - 8.2, 0.4, 'z_cop'], [-1.5, L.cross[0] - 6.0, 2.4, 'z_cop'], [2.6, L.cross[0] + 1.6, 5.0, 'z_worker'],
    [3.0, L.gate[0] + 6.5, 1.1, 'z_office'], [-5.0, -62, 3.2, 'z_nurse'], [1.2, L.cross[1] - 3.6, 0.3, 'z_hoodie'],
    [-2.0, L.cross[1] + 4.6, 4.4, 'z_jogger'], [4.6, L.gate[1] + 6.8, 2.0, 'z_trucker'], [-1.0, -100, 5.5, 'z_patient'],
    [2.0, L.cross[2] + 3.0, 0.9, 'z_elder'], [-3.4, L.cross[2] - 3.4, 3.8, 'z_burned'], [-2.6, L.gate[2] + 7.0, 2.7, 'z_worker'],
    [3.4, -170, 1.5, 'z_office'],
    [-2.4, L.lz.z + 14, 5.2, 'z_nurse'], [3.2, L.lz.z + 12, 1.9, 'z_trucker'],
  ] : [
    ...L.cross.flatMap((c, i) => [
      [(rng() - 0.5) * 7, c - 6 - rng() * 3, rng() * 6.28, models[(i * 3) % 10]], [(rng() - 0.5) * 7, c + 2 + rng() * 3, rng() * 6.28, models[(i * 3 + 1) % 10]],
      [(rng() - 0.5) * 7, L.gate[i] + 6 + rng() * 2, rng() * 6.28, models[(i * 3 + 2) % 10]],
    ]),
    [-2.4, L.lz.z + 14, 5.2, 'z_nurse'], [3.2, L.lz.z + 12, 1.9, 'z_trucker'],
  ];
  game.corpses = [];
  for (const [x, z, face, model] of dead) {
    if (!free(x, z, 0.4)) continue;
    game.corpses.push(game.makeCorpse(model, x, z, face));
    fx.pools.add(x + Math.sin(face) * 0.4, z + Math.cos(face) * 0.4, 1.3 + rng() * 0.8, rng() * 6, 0, gy(x, z) + 0.018);
    if (rng() < 0.7) drag.add(x - Math.sin(face) * 2.0, z - Math.cos(face) * 2.0, 3.4, Math.atan2(Math.cos(face), -Math.sin(face)) + Math.PI, 0, gy(x, z) + 0.012);
  }

  // ---- ground fog: big soft sheets that drift in the wind, always around the survivors
  const N = Q.fogSheets;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (rng() - 0.5) * 70; pos[i * 3 + 1] = 0.5 + rng() * 0.9; pos[i * 3 + 2] = (rng() - 0.5) * 70; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pm = new THREE.PointsMaterial({ map: tex('tex/smoke.webp'), size: 15, sizeAttenuation: true, transparent: true, opacity: 0.1, depthWrite: false, color: LV.theme.fogSheet, fog: false });
  const fog = new THREE.Points(g, pm);
  fog.frustumCulled = false;
  fog.visible = N > 0;
  scene.add(fog);
  game.groundFog = { pts: fog, pos, n: N };
}

export function tickFog(game, dt, wind) {
  const f = game.groundFog;
  if (!f) return;
  const c = game.me;
  for (let i = 0; i < f.n; i++) {
    f.pos[i * 3] += (wind.x * 0.5 + 0.12) * dt * (1 + (i % 3) * 0.3);
    f.pos[i * 3 + 2] += wind.z * 0.3 * dt;
    // wrap around the player so the mist is always where the eye is
    if (f.pos[i * 3] - c.x > 36) f.pos[i * 3] -= 72;
    if (f.pos[i * 3] - c.x < -36) f.pos[i * 3] += 72;
    if (f.pos[i * 3 + 2] - c.z > 36) f.pos[i * 3 + 2] -= 72;
    if (f.pos[i * 3 + 2] - c.z < -36) f.pos[i * 3 + 2] += 72;
  }
  f.pts.geometry.attributes.position.needsUpdate = true;
}
