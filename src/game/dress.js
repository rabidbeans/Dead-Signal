// Dressing the level: street furniture, vehicles, the checkpoint's clutter,
// shop awnings, fire escapes, trees (populate, before the nav grid is built),
// then the ground itself — manholes, drains, skid marks, scorching, oil,
// cracks, debris by the hundred, the fallen, blood, a low fog (dressGround).
import * as THREE from 'three';
import { prop, instanced, awningMaterial, tex } from './assets.js';
import { mulberry } from './world.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

function mat4(x, y, z, ry = 0, s = 1, sy = null) {
  _q.setFromAxisAngle(UP, ry);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), new THREE.Vector3(s, sy ?? s, s));
}

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
  const faceTo = (nx, nz) => Math.atan2(nx, nz);

  // ---- sidewalk furniture (the walk is 2 m wide on the avenue, 3 m on the street)
  const W = faceTo(1, 0), E = faceTo(-1, 0), N = faceTo(0, 1), S = faceTo(0, -1);
  [[-7.9, -16, W], [7.9, 20, E], [-14, 7.5, S], [14, -7.5, N]].forEach(([x, z, r]) => put('bench', x, z, r, { box: [0.9, 0.28], h: 0.6, tag: 'low' }));
  [[7.8, -12, 0], [-7.8, 11, 0], [-7.7, -28, 0], [7.8, 14, 0], [16, -7.4, 0], [-10, 7.3, 0], [-7.8, -33, 0]].forEach(([x, z]) => put('trash_bin', x, z, rng() * 6, { circle: 0.32, h: 1.1 }));
  put('mailbox', -7.8, -10.5, W, { box: [0.25, 0.25], h: 1.2 });
  put('mailbox', 7.8, 16.5, E, { box: [0.25, 0.25], h: 1.2 });
  put('news_box', -7.8, -12.6, W, { box: [0.22, 0.2], h: 0.9 });
  put('news_box', 9.2, 7.4, N, { box: [0.22, 0.2], h: 0.9 });
  for (const x of [-24, -20, -16, -12]) put('parking_meter', x, 6.7, S, { circle: 0.08, h: 1.4 });
  for (const x of [12, 16, 20, 24]) put('parking_meter', x, -6.7, N, { circle: 0.08, h: 1.4 });
  for (const [x, z] of [[7.6, 6.5], [8.5, 6.5], [-7.6, 6.5], [-8.5, 6.5], [7.6, -6.5], [8.5, -6.5], [-7.6, -6.5], [-8.5, -6.5]]) put('bollard', x, z, 0, { circle: 0.15, h: 1.0 });
  put('traffic_light', 7.7, 7.1, Math.PI, { circle: 0.14, h: 6 });
  put('traffic_light', -7.7, -7.1, 0, { circle: 0.14, h: 6 });
  put('stop_sign', 7.9, -6.9, 0, { circle: 0.06, h: 2.3 });
  put('stop_sign', -7.9, 6.9, Math.PI, { circle: 0.06, h: 2.3 });
  [[10.5, 7.5, 0], [-10.5, -7.5, Math.PI], [-12.5, 7.5, 0], [12.5, -7.5, Math.PI]].forEach(([x, z, r]) => put('planter', x, z, r, { box: [0.7, 0.3], h: 0.6, tag: 'low' }));
  put('bus_shelter', -17.5, 7.7, S, { box: [1.5, 0.7], h: 2.4 });
  [[-7.7, -20], [7.7, -26], [7.7, 24], [-7.7, 18], [-13, 7.9], [13, -8]].forEach(([x, z]) => put('street_tree', x, z, rng() * 6, { circle: 0.28, h: 4, s: 0.95 + rng() * 0.3 }));
  // chain-link sections close the alley mouth and fence the checkpoint's flank
  put('fence_chain', 20.5, -9.4, 0, { box: [1.5, 0.08], h: 2 });
  put('fence_chain', 17.5, -9.6, 0.1, { box: [1.5, 0.08], h: 2 });
  put('fence_chain', 14, 8.3, 0, { box: [1.5, 0.08], h: 2 });

  // ---- vehicles: the bus across the north road is the chokepoint
  const tints = [0x6d1d1a, 0x23303b, 0x7a7b72, 0x1d2a22, 0x3e3d3f, 0x5b4a2d, 0x2b3946, 0x8b8c87];
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
  veh('bus', 0.4, -19.5, 0.1, 5.85, 1.3, 0xc9a23a, true, 3.1);
  veh('ambulance', -13.5, 2.2, 0.06, 2.95, 1.05, 0xffffff, false, 2.6);
  veh('van', 11.5, 3.2, -0.5, 2.95, 1.05, 0x2d4560, true, 2.5);
  veh('pickup', -9, 15.5, 2.8, 2.7, 1.0, 0x4d1f1b, true, 1.8);
  veh('suv', 3.5, -31, 0.35, 2.5, 1.0, 0x1c2128, false, 1.8);
  veh('suv', 2.5, 12, 0.18, 2.5, 1.0, 0x5c5f58, true, 1.8);
  world.fires.push({ x: 0.4, y: 1.8, z: -19.5, phase: 1, size: 2.4 });                 // the bus burns
  world.fires.push({ x: 11.5 - 1.2, y: 1.2, z: 3.2 + 0.4, phase: 4, size: 1.2 });        // the van smoulders

  // ---- the checkpoint, dressed
  const cp = (name, x, z, r, o) => put(name, x, z, r, o);
  cp('crate_wood', -5.2, -7.6, 0.2, { box: [0.45, 0.45], h: 0.85 });
  cp('crate_wood', -5.9, -7.0, 0.5, { box: [0.45, 0.45], h: 0.85 });
  cp('crate_wood', -5.4, -7.3, 0.9, { y: 0.9, s: 0.9 });
  cp('crate_mil', 4.6, -9.8, 0.25, { box: [0.5, 0.25], h: 0.42, tag: 'low' });
  cp('crate_mil', 5.4, -9.4, -0.1, { box: [0.5, 0.25], h: 0.42, tag: 'low' });
  cp('crate_mil', 5.0, -9.6, 0.2, { y: 0.42 });
  cp('pallet', -1.0, -8.2, 0.3, {});
  cp('pallet', 8.5, 9.0, 1.1, {});
  cp('barrel_blue', -3.4, 2.0, 0, { circle: 0.3, h: 0.88 });
  cp('barrel_blue', -3.9, 2.6, 0, { circle: 0.3, h: 0.88 });
  cp('barrel_blue', 6.4, -7.2, 0, { circle: 0.3, h: 0.88 });
  cp('barrel', 5.9, -7.8, 0, { circle: 0.3, h: 0.88 });
  cp('tires_stack', -6.3, -4.3, 0.4, { circle: 0.4, h: 0.6, tag: 'low' });
  cp('tires_stack', 7.8, 10.5, 1.0, { circle: 0.4, h: 0.6, tag: 'low' });
  cp('cinder_blocks', 2.4, -6.0, 0.3, { box: [0.85, 0.2], h: 0.4, tag: 'low' });
  cp('plywood_barrier', -9.4, -3.0, 1.5, { box: [1.2, 0.1], h: 1.2 });
  cp('plywood_barrier', 9.0, -3.0, 1.45, { box: [1.2, 0.1], h: 1.2 });
  cp('cardboard_stack', 8.2, 3.3, 0.6, { box: [0.55, 0.35], h: 0.5, tag: 'low' });
  cp('cardboard_stack', -8.4, 4.4, 0.0, { box: [0.55, 0.35], h: 0.5, tag: 'low' });
  cp('shopping_cart', -2.2, -12.5, 2.3, { box: [0.3, 0.45], h: 0.7, tag: 'low' });
  cp('shopping_cart', 13.5, 5.5, 0.9, { box: [0.3, 0.45], h: 0.7, tag: 'low' });
  cp('suitcase', 1.2, -4.0, 0.7, { tilt: 1.45, y: 0.2 });
  cp('backpack', -1.6, 6.8, 0.2, {});
  cp('suitcase', 10.5, -1.0, 2.1, {});
  const tent = cp('tarp_tent', 5.8, 5.8, 3.14 - 0.3, { box: [1.5, 1.2], h: 1.5, tag: 'solid' });
  cp('tarp_tent', -10.8, -2.4, 0.2, { box: [1.5, 1.2], h: 1.5, tag: 'solid' });
  cp('floodlight', -7.0, -3.2, 0.4, { circle: 0.4, h: 2.5 });
  world.lampSpots.push({ x: -7.0, y: 2.8, z: -3.2, broken: false, phase: 0, nofx: true, power: 0.8 });
  // second sandbag arc covers the police car
  const sb = put('sandbags', -3, -7.8, 0.2, {});
  for (let a = -28; a <= 28; a += 7) {
    const r = a * Math.PI / 180;
    col.circle(-3 + Math.cos(0.2) * Math.sin(r) * 3.2 + Math.sin(0.2) * (Math.cos(r) * 3.2 - 3.2), -7.8 - Math.sin(0.2) * Math.sin(r) * 3.2 + Math.cos(0.2) * (Math.cos(r) * 3.2 - 3.2), 0.4, 0.62, 'low');
  }

  // ---- shop awnings, boarded windows and doors along the ground floor
  world.dressFacades?.();
}

// ------------------------------------------------------------ the ground ---
export function dressGround(game) {
  const { world, fx, scene } = game;
  const rng = mulberry(31);
  const gy = (x, z) => world.groundY(x, z);

  // decals: tinted, stretched, flat on the ground
  const mk = (file, max, o = {}) => {
    const d = fx.makeDecals(file, max, o);
    return d;
  };
  const manhole = mk('manhole', 12, { rough: 0.5 });
  const drain = mk('drain', 24, { rough: 0.6 });
  const skid = mk('skid', 12, { rough: 0.9 });
  const scorch = mk('scorch', 16, { rough: 0.95 });
  const oil = mk('oil', 14, { rough: 0.15 });
  const crack = mk('crackdec', 20, { rough: 0.9 });
  const drag = mk('drag', 20, { rough: 0.2 });
  const tag = mk('tag', 6, { rough: 0.8 });
  const free = (x, z, r = 0.3) => { const p = world.col.resolve(x, z, r); return Math.abs(p.x - x) + Math.abs(p.z - z) < 1e-3; };
  for (const [x, z] of [[-2, -14], [3, 6], [-3, 17], [5, -27], [-16, 1], [18, -2], [0, 0.5], [-5, 28]]) manhole.add(x, z, 1.05, rng() * 6, 0, gy(x, z) + 0.004);
  // storm drains sit in the gutters beside each curb
  for (let i = 0; i < 12; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    const along = (rng() - 0.5) * 60;
    if (rng() < 0.5) drain.add(side * 6.55, along, 0.85, Math.PI / 2, 0, 0.006); else drain.add(along, side * 5.55, 0.85, 0, 0, 0.006);
  }
  // brakes: long skids that end at wrecks
  for (const [x, z, r] of [[1, -30, 1.57], [5.2, -21, 1.65], [-4.6, 21, -1.5], [17, 1, 3.1], [-20, -1, 0.1]]) skid.add(x, z, 6.5, r, 0, 0.007, 0, 0, 0.55);
  // everything that burned
  for (const f of world.fires) scorch.add(f.x, f.z, 4.6 * f.size, rng() * 6, 0, 0.005);
  for (let i = 0; i < 12; i++) { const x = (rng() - 0.5) * 50, z = (rng() - 0.5) * 50; if (free(x, z)) oil.add(x, z, 0.8 + rng() * 1.6, rng() * 6, 0, gy(x, z) + 0.006); }
  for (let i = 0; i < 24; i++) { const x = (rng() - 0.5) * 56, z = (rng() - 0.5) * 56; if (free(x, z)) crack.add(x, z, 3 + rng() * 3, rng() * 6, 0, gy(x, z) + 0.005); }
  for (let i = 0; i < 5; i++) {
    const [x, z, nx, nz] = [[-9.02, -22, 1, 0], [8.98, -21, -1, 0], [-9.02, -16, 1, 0], [21.98, -13, -1, 0], [-14, 9.02, 0, -1]][i];
    tag.add(x + nx * 0.01, z, 1.8, 0.0, 0, 1.6 + rng() * 0.9, nx, nz);
  }

  // ---- debris by the hundred (instanced; nothing here casts a shadow)
  const clusters = [...world.fires.map((f) => [f.x, f.z, 5]), [0.4, -19.5, 7], [11.5, 3.2, 4], [-3, -9, 6], [5.2, -25, 4], [-4.4, -33, 3], [4, 21, 4], [-4.5, 25.5, 4], [-13.5, 2.2, 4], [-9, 15.5, 4]];
  const spots = (count, spread = 1) => {
    const out = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 25) {
      let x, z;
      if (rng() < 0.55) { const c = clusters[(rng() * clusters.length) | 0]; x = c[0] + (rng() - 0.5) * c[2] * 2 * spread; z = c[1] + (rng() - 0.5) * c[2] * 2 * spread; }
      else { x = (rng() - 0.5) * 66; z = (rng() - 0.5) * 70; }
      if (Math.abs(x) > 33 || z < -40 || z > 33) continue;
      if (free(x, z, 0.12)) out.push([x, z]);
    }
    return out;
  };
  const scatter = (name, count, scaleLo = 0.9, scaleHi = 1.15, lift = 0, spread = 1) => {
    const ms = spots(count, spread).map(([x, z]) => {
      const s = scaleLo + rng() * (scaleHi - scaleLo);
      _e.set((name === 'deb_can' || name === 'deb_bottle') && rng() < 0.6 ? Math.PI / 2 : 0, rng() * 6.28, 0, 'YXZ');
      _q.setFromEuler(_e);
      const y = gy(x, z) + lift + ((name === 'deb_can' || name === 'deb_bottle') ? 0.03 : 0);
      return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), new THREE.Vector3(s, s, s));
    });
    world.add(instanced(name, ms));
  };
  scatter('deb_can', 80, 0.9, 1.1); scatter('deb_bottle', 60, 0.9, 1.1); scatter('deb_carton', 50, 0.8, 1.3, 0.004);
  scatter('deb_brick', 55, 0.85, 1.1); scatter('deb_bag', 36, 0.8, 1.5, 0.002); scatter('deb_rag', 30, 0.9, 1.4, 0.004);
  scatter('deb_glass', 60, 0.9, 1.5, 0.003, 0.6); scatter('deb_plank', 18, 0.8, 1.2, 0.002); scatter('deb_pipe', 10, 0.8, 1.2);

  // ---- the fallen: bodies in the road, each with its pool and a drag trail
  const dead = [
    [-3.5, -13.2, 0.4, 'z_cop'], [-1.5, -11.6, 2.4, 'z_cop'], [2.6, -14.6, 5.0, 'z_worker'], [6.2, -17.5, 1.1, 'z_office'], [-5.8, -24, 3.2, 'z_nurse'],
    [4.5, -28, 0.3, 'z_hoodie'], [-6.4, -2.2, 4.4, 'z_jogger'], [10.8, 1.6, 2.0, 'z_trucker'], [-11, 4.6, 5.5, 'z_patient'], [1.4, 9.8, 0.9, 'z_elder'],
    [-6.2, 12.4, 3.8, 'z_burned'], [5.8, 17.4, 2.7, 'z_worker'], [-15.5, -1.4, 1.5, 'z_office'], [16.4, -1.0, 4.2, 'z_hoodie'],
  ];
  game.corpses = [];
  for (const [x, z, face, model] of dead) {
    if (!free(x, z, 0.4)) continue;
    game.corpses.push(game.makeCorpse(model, x, z, face));
    fx.pools.add(x + Math.sin(face) * 0.4, z + Math.cos(face) * 0.4, 1.3 + rng() * 0.8, rng() * 6, 0, gy(x, z) + 0.018);
    if (rng() < 0.7) drag.add(x - Math.sin(face) * 2.0, z - Math.cos(face) * 2.0, 3.4, Math.atan2(Math.cos(face), -Math.sin(face)) + Math.PI, 0, gy(x, z) + 0.012);
  }

  // ---- ground fog: big soft sheets that drift in the wind
  const N = 36;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (rng() - 0.5) * 70; pos[i * 3 + 1] = 0.5 + rng() * 0.9; pos[i * 3 + 2] = (rng() - 0.5) * 70; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pm = new THREE.PointsMaterial({ map: tex('tex/smoke.webp'), size: 15, sizeAttenuation: true, transparent: true, opacity: 0.1, depthWrite: false, color: 0x8da0b8, fog: false });
  const fog = new THREE.Points(g, pm);
  fog.frustumCulled = false;
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
