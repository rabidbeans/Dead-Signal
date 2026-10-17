// Building the WIDE ZONES of layout.js: the hospital's wards (level 2), the bonded warehouse (level 4) and the canal
// quarter (level 3). Called from populate() (dress.js) before the nav grid is built, so walls, furniture and water are
// in the colliders. Doors and keycards then live on in tickZones().
//
// The interiors have no roof (the camera looks down into them like a floor plan): 2.7 m walls with dark tops so the
// maze reads from above, cut away round the survivors like the buildings. Doors slide open as anyone alive (or any of the
// dead) comes up to them and close behind; a closed door stops bullets. A locked door (level 4) only opens once somebody
// has picked up its keycard (the host decides, `key` events tell everyone).
import * as THREE from 'three';
import { prop, surface, tex } from './assets.js';
import { withCutaway, signTexture } from './world.js';
import { ZONES, LV } from './level.js';
import { WALL_H, WALL_T, DOOR_W } from './layout.js';
import { stall, lanternStrings } from './kit.js';
import { mulberry } from './rng.js';
import { audio } from './audio.js';

export const ZONE_TANKS = [];          // gas tank sites on the canal islands (objective.js puts the tanks there)
export const KEY_COLORS = { red: 0xff2a2a, blue: 0x2a8cff, yellow: 0xffd020 };

// ---------------------------------------------------------- textures --
function canvasTex(w, h, draw, rep = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
const grime = (g, w, h, n, a, rng) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(20,16,12,${rng() * a})`;
    const x = rng() * w, y = rng() * h, r = 4 + rng() * 40;
    g.beginPath(); g.ellipse(x, y, r, r * (0.4 + rng()), rng() * 3, 0, 7); g.fill();
  }
};
// the hospital wall: green-tiled dado, a dark rail, cream plaster above; dirt, drips, a smear of blood
function wardWallTex() {
  const rng = mulberry(11);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#c2bba6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5a9283'; g.fillRect(0, h * 0.58, w, h * 0.42);
    g.strokeStyle = 'rgba(30,60,55,0.35)'; g.lineWidth = 2;
    for (let y = h * 0.58; y < h; y += 28) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let x = 0; x < w; x += 28) { g.beginPath(); g.moveTo(x, h * 0.58); g.lineTo(x, h); g.stroke(); }
    g.fillStyle = '#2b5650'; g.fillRect(0, h * 0.55, w, h * 0.035);
    g.fillStyle = '#3a3a36'; g.fillRect(0, h * 0.965, w, h * 0.035);
    grime(g, w, h, 60, 0.12, rng);
    for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(40,30,20,${0.08 + rng() * 0.1})`; g.fillRect(rng() * w, 0, 2 + rng() * 4, h * (0.2 + rng() * 0.5)); }
    for (let i = 0; i < 3; i++) {
      g.fillStyle = `rgba(90,10,6,${0.35 + rng() * 0.3})`;
      const x = rng() * w, y = h * (0.3 + rng() * 0.4);
      g.beginPath(); g.ellipse(x, y, 12 + rng() * 18, 8 + rng() * 10, rng() * 3, 0, 7); g.fill();
      g.fillRect(x - 3, y, 5, 30 + rng() * 60);
    }
  });
}
function wardFloorTex() {
  const rng = mulberry(12);
  return canvasTex(512, 512, (g, w, h) => {
    const n = 8, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? '#9a937f' : '#748577'; g.fillRect(i * s, j * s, s, s); }
    g.strokeStyle = 'rgba(40,40,30,0.4)'; g.lineWidth = 2;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
    grime(g, w, h, 90, 0.14, rng);
    for (let i = 0; i < 25; i++) { g.strokeStyle = `rgba(20,20,20,${0.1 + rng() * 0.15})`; g.lineWidth = 1 + rng() * 2; g.beginPath(); const x = rng() * w, y = rng() * h; g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 80, y + (rng() - 0.5) * 30); g.stroke(); }
  });
}
// the warehouse: grey-blue corrugated sheet, a hazard band at the foot, rust
function whWallTex() {
  const rng = mulberry(13);
  return canvasTex(512, 512, (g, w, h) => {
    for (let x = 0; x < w; x += 16) { const k = Math.sin(x / 16 * Math.PI) > 0; g.fillStyle = k ? '#7b8a96' : '#5f6d78'; g.fillRect(x, 0, 16, h); }
    for (let x = 0; x < w; x += 128) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, 0, 3, h); }
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(120,55,20,${0.1 + rng() * 0.25})`; g.fillRect(rng() * w, h * 0.2 + rng() * h * 0.5, 3 + rng() * 6, 20 + rng() * 120); }
    grime(g, w, h, 40, 0.15, rng);
    const y0 = h * 0.86;
    g.fillStyle = '#d8a51a'; g.fillRect(0, y0, w, h - y0);
    g.fillStyle = '#16140f';
    for (let i = -2; i < 20; i++) { g.beginPath(); g.moveTo(i * 32, h); g.lineTo(i * 32 + 16, h); g.lineTo(i * 32 + 16 + (h - y0), y0); g.lineTo(i * 32 + (h - y0), y0); g.fill(); }
  });
}
function blastTex(color) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#3a4046'; g.fillRect(0, 0, w, h);
    g.fillStyle = color; for (let i = -2; i < 10; i++) { g.beginPath(); g.moveTo(i * 40, h); g.lineTo(i * 40 + 20, h); g.lineTo(i * 40 + 20 + h, 0); g.lineTo(i * 40 + h, 0); g.fill(); }
    g.fillStyle = '#25292e'; g.fillRect(w * 0.08, h * 0.08, w * 0.84, h * 0.84);
    g.fillStyle = color; g.fillRect(w * 0.08, h * 0.44, w * 0.84, h * 0.12);
    g.fillStyle = 'rgba(0,0,0,0.5)'; for (let i = 0; i < 6; i++) g.fillRect(w * 0.12, h * (0.14 + i * 0.05), w * 0.76, 2);
  }, false);
}
function hospDoorTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8eaab2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b2a30'; g.fillRect(w * 0.3, h * 0.12, w * 0.4, h * 0.25);
    g.fillStyle = 'rgba(160,210,220,0.25)'; g.fillRect(w * 0.32, h * 0.14, w * 0.12, h * 0.21);
    g.fillStyle = '#c0c4c4'; g.fillRect(0, h * 0.86, w, h * 0.14);
    g.fillStyle = '#4a5c62'; g.fillRect(w * 0.84, h * 0.45, w * 0.04, h * 0.14);
    g.fillStyle = 'rgba(100,12,8,0.5)'; g.beginPath(); g.ellipse(w * 0.6, h * 0.5, 22, 30, 0.3, 0, 7); g.fill();
  }, false);
}

// a box whose sides tile at `tile` metres horizontally and span the texture once vertically
function wallBox(len, h, t, horiz) {
  const w = horiz ? len : t, d = horiz ? t : len;
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [d, d, 0, 0, w, w];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    if (f === 2 || f === 3) continue;
    uv.setXY(i, uv.getX(i) * dims[f] / h, uv.getY(i));
  }
  return g;
}

// ---------------------------------------------------------------- build --
export function buildZones(world, A) {
  ZONE_TANKS.length = 0;
  world.zoneBlood = [];
  world.doors = [];
  world.keyItems = [];
  for (const Z of ZONES) {
    if (Z.kind === 'interior') buildInterior(world, Z, A);
    else if (Z.kind === 'canals') buildCanals(world, Z, A);
  }
}

const MATS = {};
function mats(style) {
  if (MATS[style]) return MATS[style];
  const cap = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.8 });
  let wall, floor;
  if (style === 'wards') {
    wall = withCutaway(new THREE.MeshStandardMaterial({ map: wardWallTex(), roughness: 0.75 }));
    floor = new THREE.MeshStandardMaterial({ map: wardFloorTex(), roughness: 0.42, metalness: 0.05 });
  } else {
    wall = withCutaway(new THREE.MeshStandardMaterial({ map: whWallTex(), roughness: 0.6, metalness: 0.35 }));
    floor = surface('concrete', 1, 0x9c9c96);
    floor.roughness = 0.7;
  }
  wall.name = 'zwall_' + style;
  return (MATS[style] = { wall, cap: withCutaway(cap), floor });
}

function buildInterior(world, Z, A) {
  const M = mats(Z.style);
  const ward = Z.style === 'wards';
  const col = world.col;
  const rng = mulberry(4400 + Z.index * 17 + (ward ? 0 : 900));
  // ---- the floor
  const len = Z.zTop - Z.zBot;
  const fg = new THREE.PlaneGeometry(Z.hw * 2, len).rotateX(-Math.PI / 2);
  const tile = ward ? 4 : 6;
  const uv = fg.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Z.hw * 2 / tile, uv.getY(i) * len / tile);
  if (!ward) { M.floor.map.repeat.set(1, 1); }
  const floor = new THREE.Mesh(fg, M.floor);
  floor.position.set(0, 0.012, (Z.zTop + Z.zBot) / 2);
  floor.receiveShadow = true;
  world.add(floor);
  // ---- the walls
  for (const w of Z.walls) {
    const horiz = w.z0 === w.z1;
    const L = (horiz ? w.x1 - w.x0 : w.z1 - w.z0) + WALL_T;
    const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
    // one material each (a material array is never batched): the wall, and a dark cap on top that reads from above
    const m = new THREE.Mesh(wallBox(L, WALL_H, WALL_T, horiz), M.wall);
    m.position.set(cx, WALL_H / 2, cz);
    m.castShadow = true; m.receiveShadow = true;
    world.add(m);
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(horiz ? L : WALL_T + 0.02, horiz ? WALL_T + 0.02 : L).rotateX(-Math.PI / 2), M.cap);
    cap.position.set(cx, WALL_H + 0.006, cz);
    world.add(cap);
    col.box(cx, cz, horiz ? L / 2 : WALL_T / 2, horiz ? WALL_T / 2 : L / 2, 0, WALL_H);
  }
  // ---- doors
  const frameMat = new THREE.MeshStandardMaterial({ color: ward ? 0x5a6a6c : 0x2a2d30, roughness: 0.5, metalness: 0.5 });
  const doorMat = ward ? new THREE.MeshStandardMaterial({ map: hospDoorTex(), roughness: 0.45, metalness: 0.2 }) : surface('shutter', 1, 0xb8b8b0);
  if (!ward) doorMat.metalness = 0.5;
  for (const d of Z.doors) {
    const along = d.axis === 'x';            // the wall runs along x: the door is in a horizontal wall
    // posts either side of the opening
    for (const s of [-1, 1]) {
      const px = along ? d.x + s * (d.w / 2 + 0.06) : d.x, pz = along ? d.z : d.z + s * (d.w / 2 + 0.06);
      const post = new THREE.Mesh(new THREE.BoxGeometry(along ? 0.14 : 0.42, WALL_H + 0.06, along ? 0.42 : 0.14), frameMat);
      post.position.set(px, (WALL_H + 0.06) / 2, pz);
      post.castShadow = true;
      world.add(post);
    }
    if (d.kind === 'arch') continue;
    const lock = d.kind === 'lock';
    const grp = new THREE.Group();
    grp.position.set(d.x, 0, d.z);
    grp.userData.noMerge = true;
    const lw = d.w - 0.02, lh = WALL_H - 0.25;
    let leaf;
    if (lock) {
      const c = KEY_COLORS[d.color];
      const face = new THREE.MeshStandardMaterial({ map: blastTex('#' + c.toString(16).padStart(6, '0')), roughness: 0.45, metalness: 0.6 });
      leaf = new THREE.Mesh(new THREE.BoxGeometry(along ? lw : 0.22, lh, along ? 0.22 : lw), face);
      // a light bar over the door in the key's colour
      const bar = new THREE.Mesh(new THREE.BoxGeometry(along ? d.w + 0.4 : 0.3, 0.16, along ? 0.3 : d.w + 0.4), new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
      bar.position.y = WALL_H + 0.1;
      grp.add(bar);
      world.lampSpots.push({ x: d.x, y: 3.0, z: d.z, broken: false, phase: 0, nofx: true, power: 0.55, color: c });
    } else leaf = new THREE.Mesh(new THREE.BoxGeometry(along ? lw : 0.09, lh, along ? 0.09 : lw), doorMat);
    leaf.position.y = lh / 2;
    leaf.castShadow = true;
    grp.add(leaf);
    world.add(grp);
    const rec = col.box(d.x, d.z, along ? d.w / 2 : 0.12, along ? 0.12 : d.w / 2, 0, WALL_H, lock ? 'locked' : 'door');
    world.doors.push({ grp, leaf, rec, x: d.x, z: d.z, along, w: d.w, lh, lock, color: d.color, open: 0, locked: lock, shutter: !ward && !lock, sounded: false });
  }
  // ---- the keycard (level 4): in its side room, under a shaft of its colour
  if (Z.key) world.keyItems.push({ x: Z.key.x, z: Z.key.z, color: Z.key.color, zone: Z.index, taken: false });
  // ---- the signs over the way in and out
  const front = ward ? ['ST. MERCY HOSPITAL', '#ff4040'] : [`BONDED WAREHOUSE ${Z.index + 3}`, '#ffb030'];
  const sgn = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.0), new THREE.MeshBasicMaterial({ map: signTexture(front[0], front[1], '#0c0808', 1024, 140), toneMapped: false }));
  sgn.position.set(Z.entrance.x, 3.6, Z.zTop + 0.2);
  world.add(sgn);
  world.flicker.push({ kind: 'sign', mat: sgn.material, base: 1.5, phase: Z.index * 7 + 3 });
  const ex = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: signTexture('EXIT', '#40ff70', '#06120a', 256, 80), toneMapped: false }));
  ex.position.set(Z.exit.x, 3.1, Z.zBot + 0.17);
  ex.rotation.y = Math.PI;
  world.add(ex);
  for (const s of [-1, 1]) {
    for (const [x, zz] of [[Z.entrance.x, Z.zTop], [Z.exit.x, Z.zBot]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.9, 0.5), frameMat);
      post.position.set(x + s * 1.85, 1.95, zz);
      post.castShadow = true;
      world.add(post);
    }
  }
  // ---- the rooms
  for (const r of Z.rooms) furnish(world, Z, r, A, ward);
}

// ------------------------------------------------------------ furniture --
// Things go along the walls (never in front of a door), facing into the room; the middle is kept clear (a medkit or a
// keycard may be there), except in the theatre (the table) and the warehouse bays (rows of racking).
const ITEMS = {
  hosp_bed: { w: 0.95, d: 2.05, head: true, h: 0.8, tag: 'low' },
  curtain_screen: { w: 2.25, d: 0.35, h: 0.8, tag: 'low' },
  gurney: { w: 2.3, d: 0.65, h: 0.85, tag: 'low' },
  wheelchair: { w: 0.75, d: 0.85, h: 0.85, tag: 'low' },
  desk: { w: 1.6, d: 0.78, h: 0.85, tag: 'low' },
  med_cabinet: { w: 0.9, d: 0.44, h: 1.9 },
  med_cart: { w: 0.62, d: 0.52, h: 1.0, tag: 'low' },
  waiting_chairs: { w: 2.3, d: 0.55, h: 0.8, tag: 'low' },
  vending: { w: 0.95, d: 0.82, h: 1.85 },
  iv_stand: { w: 0.5, d: 0.5, h: 0.6, tag: 'low' },
  rack: { w: 2.8, d: 1.1, h: 3.0 },
  crate_wood: { w: 0.95, d: 0.95, h: 0.85 },
  pallet: { w: 1.2, d: 1.0, h: 0.2, tag: 'low' },
  cardboard_stack: { w: 1.0, d: 0.8, h: 0.9, tag: 'low' },
  barrel: { w: 0.65, d: 0.65, h: 0.9 },
  barrel_blue: { w: 0.65, d: 0.65, h: 0.9 },
  forklift: { w: 1.2, d: 2.6, head: true, h: 2.2 },
  tires_stack: { w: 0.8, d: 0.8, h: 0.9 },
};
const RECIPES = {
  wards: {
    corridor: ['gurney', 'waiting_chairs', 'wheelchair', 'med_cart', 'vending', 'iv_stand', 'gurney'],
    small: ['desk', 'med_cabinet', 'med_cart', 'iv_stand'],
    mid: ['hosp_bed', 'curtain_screen', 'hosp_bed', 'iv_stand', 'hosp_bed', 'curtain_screen', 'med_cart'],
    big: ['waiting_chairs', 'vending', 'waiting_chairs', 'desk', 'gurney', 'waiting_chairs', 'med_cabinet'],
    special: ['med_cabinet', 'med_cart', 'iv_stand', 'med_cabinet', 'gurney'],
  },
  warehouse: {
    corridor: ['rack', 'rack', 'cardboard_stack', 'rack', 'pallet', 'barrel'],
    small: ['desk', 'crate_wood', 'cardboard_stack', 'barrel_blue'],
    mid: ['rack', 'crate_wood', 'rack', 'pallet', 'cardboard_stack', 'rack'],
    big: ['rack', 'rack', 'pallet', 'crate_wood', 'rack', 'barrel', 'tires_stack'],
    special: ['pallet', 'crate_wood', 'barrel', 'barrel_blue', 'pallet', 'cardboard_stack'],
  },
};

function furnish(world, Z, r, A, ward) {
  const rng = mulberry(r.seed);
  const col = world.col;
  const kind = r.special ? 'special' : r.kind;
  const recipe = RECIPES[Z.style][kind];
  // the openings in this room's walls (doors, arches, the way in and out)
  const gaps = r.doors.map((d) => ({ x: d.x, z: d.z, w: d.w }));
  if (r.entry) gaps.push({ x: Z.entrance.x, z: Z.zTop, w: 3.4 });
  if (r.exitRoom) gaps.push({ x: Z.exit.x, z: Z.zBot, w: 3.4 });
  const inset = WALL_T / 2 + 0.06;
  // the four walls: [from (x, z), to, inward normal]
  const sides = [
    { a: [r.x0, r.z1 - inset], b: [r.x1, r.z1 - inset], n: [0, -1] },     // south wall, facing north
    { a: [r.x0, r.z0 + inset], b: [r.x1, r.z0 + inset], n: [0, 1] },      // north wall, facing south
    { a: [r.x0 + inset, r.z0], b: [r.x0 + inset, r.z1], n: [1, 0] },      // west wall, facing east
    { a: [r.x1 - inset, r.z0], b: [r.x1 - inset, r.z1], n: [-1, 0] },     // east wall, facing west
  ];
  // corridors: one long side only (the other stays clear to run down)
  let useSides = sides;
  if (kind === 'corridor') {
    const longX = r.w > r.h;
    useSides = sides.filter((s) => (longX ? s.n[0] === 0 : s.n[1] === 0));
    useSides = [useSides[(rng() * useSides.length) | 0]];
  }
  const placed = [];
  const clearOf = (x, z, rad) => {
    if (gaps.some((g) => Math.hypot(g.x - x, g.z - z) < g.w / 2 + 1.3 + rad)) return false;
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + rad + 0.15)) return false;
    // keep the middle clear in rooms with something there
    if ((r.medkit || r.keyRoom) && Math.hypot(r.cx - x, r.cz - z) < 1.6 + rad) return false;
    return true;
  };
  let k = (rng() * recipe.length) | 0;
  for (const s of useSides) {
    const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    const ux = (s.b[0] - s.a[0]) / L, uz = (s.b[1] - s.a[1]) / L;
    let t = 0.5;
    while (t < L - 0.5) {
      const name = recipe[k++ % recipe.length];
      const it = ITEMS[name];
      if (!it) continue;
      const along = it.head ? it.w : it.w, depth = it.d;
      if (t + along > L - 0.4) break;
      const cx = s.a[0] + ux * (t + along / 2) + s.n[0] * (depth / 2 + 0.02);
      const cz = s.a[1] + uz * (t + along / 2) + s.n[1] * (depth / 2 + 0.02);
      const rad = Math.max(along, depth) / 2;
      if (rng() < (kind === 'corridor' ? 0.45 : 0.25) || !clearOf(cx, cz, rad * 0.8)) { t += 1.0; continue; }
      // facing: an 'along' item turns its front (+z) to the room; a 'head' item (a bed) puts its head (-x) to the wall
      const ry = it.head ? Math.atan2(-s.n[1], s.n[0]) : Math.atan2(s.n[0], s.n[1]);
      const wallX = s.n[0] === 0;     // the wall runs along x
      const hx = wallX ? along / 2 : depth / 2, hz = wallX ? depth / 2 : along / 2;
      const g = A.put(name, cx, cz, ry, { box: [hx * 0.95, hz * 0.95], h: it.h, tag: it.tag || 'solid', boxWorld: true });
      if (it.h < 1.5) g.traverse((c) => { c.castShadow = false; });      // (only the tall things are worth a shadow-map draw)
      placed.push({ x: cx, z: cz, r: rad });
      // a chair at every desk
      if (name === 'desk') A.put('office_chair', cx + s.n[0] * 0.9, cz + s.n[1] * 0.9, ry + Math.PI + (rng() - 0.5) * 0.6, { circle: 0.28, h: 0.6, tag: 'low' });
      t += along + 0.25 + rng() * 0.6;
    }
  }
  // ---- the room's own centrepiece
  if (kind === 'special' && ward) {
    A.put('op_table', r.cx, r.cz, rng() < 0.5 ? 0 : Math.PI / 2, { circle: 0.75, h: 0.9, tag: 'low' });
    world.lampSpots.push({ x: r.cx, y: 2.6, z: r.cz, broken: false, phase: 0, nofx: true, dim: true, power: 0.45, color: 0xe8fff8 });
  } else if (!ward && (kind === 'mid' || kind === 'big') && !r.keyRoom && !r.medkit) {
    // racking in rows across the bay, an aisle between every row and a clear walk round the edge
    const longX = r.w >= r.h;
    const m = 2.2;
    const ax0 = r.x0 + m, ax1 = r.x1 - m, az0 = r.z0 + m, az1 = r.z1 - m;
    const span = longX ? az1 - az0 : ax1 - ax0;
    const rows = Math.max(0, Math.floor((span + 1.0) / 3.3));
    for (let i = 0; i < rows; i++) {
      const off = (longX ? az0 : ax0) + 0.55 + i * 3.3;
      const runL = longX ? ax1 - ax0 : az1 - az0;
      const n = Math.floor(runL / 2.85);
      for (let j = 0; j < n; j++) {
        if (j === Math.floor(n / 2) && n > 2) continue;       // a gap half way along each row
        const p = (longX ? ax0 : az0) + 1.42 + j * 2.85;
        const x = longX ? p : off, z = longX ? off : p;
        if (!clearOf(x, z, 1.2)) continue;
        A.put('rack', x, z, longX ? 0 : Math.PI / 2, { box: longX ? [1.4, 0.55] : [0.55, 1.4], h: 3.0, boxWorld: true });
        placed.push({ x, z, r: 1.4 });
      }
    }
  } else if (!ward && kind === 'special') {
    const x = r.cx + (rng() - 0.5) * 2, z = r.cz + (rng() - 0.5) * 2;
    if (clearOf(x, z, 1.3)) A.put('forklift', x, z, rng() * 6, { circle: 1.25, h: 2.2 });
  }
  // ---- light: one fixture's worth per room (no ceiling: the light just falls), some broken
  if (kind !== 'special' || !ward) {
    const n = kind === 'corridor' ? Math.max(1, Math.round(Math.max(r.w, r.h) / 3)) : 1;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const x = r.w > r.h ? r.x0 + u * (r.x1 - r.x0) : r.cx, z = r.w > r.h ? r.cz : r.z0 + u * (r.z1 - r.z0);
      world.lampSpots.push({ x, y: 2.65, z, broken: rng() < 0.3, phase: rng() * 10, nofx: true, dim: true, power: ward ? 0.3 : 0.36, color: ward ? 0xd8fff0 : 0xffe0b0 });
    }
  }
  // ---- what happened here: blood on the floor, a body in a bed
  if (rng() < 0.35) world.zoneBlood?.push({ x: r.cx + (rng() - 0.5) * (r.x1 - r.x0) * 0.5, z: r.cz + (rng() - 0.5) * (r.z1 - r.z0) * 0.5 });
}

// ---------------------------------------------------------------- canals --
function waterMaterial() {
  if (MATS.water) return MATS.water;
  const n = tex('tex/concrete_normal.webp', { srgb: false, repeat: true });
  const m = new THREE.MeshStandardMaterial({ color: 0x0f3a40, roughness: 0.18, metalness: 0.25, normalMap: n, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.92 });
  m.userData.scroll = n;
  m.name = 'water';
  return (MATS.water = m);
}

function buildCanals(world, Z, A) {
  const col = world.col;
  const rng = mulberry(5300 + Z.index * 11);
  const water = waterMaterial();
  const stone = surface('concrete', 1, 0x8a8478);
  const len = Z.zTop - Z.zBot;
  // paving over the whole quarter (the water is laid over it)
  const pave = surface('sidewalk', 1, 0x9a8e7e);
  const pg = new THREE.PlaneGeometry(Z.hw * 2, len).rotateX(-Math.PI / 2);
  const puv = pg.attributes.uv;
  for (let i = 0; i < puv.count; i++) puv.setXY(i, puv.getX(i) * Z.hw * 2 / 3, puv.getY(i) * len / 3);
  const pm = new THREE.Mesh(pg, pave);
  pm.position.set(0, 0.012, (Z.zTop + Z.zBot) / 2);
  pm.receiveShadow = true;
  world.add(pm);
  const waterRect = (x0, x1, z0, z1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), water);
    m.position.set((x0 + x1) / 2, 0.05, (z0 + z1) / 2);
    m.receiveShadow = true;
    m.userData.noMerge = true;
    world.add(m);
  };
  const quay = (x0, x1, z0, z1) => {
    if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.32, z1 - z0), stone);
    m.position.set((x0 + x1) / 2, 0.16, (z0 + z1) / 2);
    m.receiveShadow = true; m.castShadow = true;
    world.add(m);
  };
  // the water stops you (and the dead); bullets fly over it ('low')
  const block = (x0, x1, z0, z1) => { if (x1 - x0 > 0.05 && z1 - z0 > 0.05) col.box((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 0, 0.35, 'low'); };
  const Q = 0.45;
  for (const c of Z.chans) {
    const z0 = c.z - c.w / 2, z1 = c.z + c.w / 2;
    waterRect(-Z.hw, Z.hw, z0, z1);
    const bs = Z.bridges.filter((b) => Math.abs(b.z - c.z) < 0.1).sort((a, b) => a.x - b.x);
    let x = -Z.hw;
    for (const b of bs) {
      block(x, b.x - b.w / 2, z0, z1);
      quay(x, b.x - b.w / 2, z1, z1 + Q); quay(x, b.x - b.w / 2, z0 - Q, z0);
      x = b.x + b.w / 2;
    }
    block(x, Z.hw, z0, z1);
    quay(x, Z.hw, z1, z1 + Q); quay(x, Z.hw, z0 - Q, z0);
  }
  for (const l of Z.lengths) {
    const x0 = l.x - l.w / 2, x1 = l.x + l.w / 2;
    waterRect(x0, x1, l.z1, l.z0);
    block(x0, x1, l.z1, l.z0);
    quay(x0 - Q, x0, l.z1 - Q, l.z0); quay(x1, x1 + Q, l.z1 - Q, l.z0);
    // the closed end
    const attachedSouth = Z.chans.some((c) => Math.abs(c.z - c.w / 2 - l.z0) < 0.05) || l.z0 >= Z.zTop - 1.05;
    if (attachedSouth) quay(x0 - Q, x1 + Q, l.z1 - Q, l.z1); else quay(x0 - Q, x1 + Q, l.z0, l.z0 + Q);
  }
  // ---- footbridges: the arch is a walkway (groundY rides it), rails along the sides
  for (const b of Z.bridges) {
    const g = prop('footbridge');
    g.position.set(b.x, 0, b.z);
    world.add(g);
    const span = 5.6;
    world.raised.push({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - span / 2, z1: b.z + span / 2, h: (x, z) => 0.14 + 0.32 * Math.cos((z - b.z) / span * Math.PI) });
    for (const s of [-1, 1]) col.box(b.x + s * (b.w / 2 - 0.05), b.z, 0.08, span / 2 - 0.4, 0, 0.8, 'low');
    // a lamp at each end
    const end = rng() < 0.5 ? -1 : 1;
    const lx = b.x + (b.w / 2 + 0.7) * (rng() < 0.5 ? -1 : 1), lz = b.z + end * (span / 2 + 0.9);
    A.put('streetlight', lx, lz, lx < b.x ? Math.PI / 2 : -Math.PI / 2, { circle: 0.18, h: 6 });
    world.lampSpots.push({ x: lx + (lx < b.x ? 1.9 : -1.9), y: 5.95, z: lz, broken: rng() < 0.15, phase: rng() * 10, color: rng() < 0.5 ? LV.theme.lamp2 : undefined });
  }
  // ---- boats in the channels, mooring posts on the quays
  for (const c of Z.chans) {
    for (let i = 0; i < 2; i++) {
      const x = (rng() - 0.5) * (Z.hw * 2 - 6);
      if (Z.bridges.some((b) => Math.abs(b.z - c.z) < 0.1 && Math.abs(b.x - x) < 4.5)) continue;
      const g = prop('rowboat');
      g.position.set(x, 0.02, c.z + (rng() - 0.5) * 0.6);
      g.rotation.y = (rng() - 0.5) * 0.3 + (rng() < 0.5 ? Math.PI : 0);
      g.rotation.z = (rng() - 0.5) * 0.06;
      g.userData.noMerge = true;
      world.add(g);
      world.boats = world.boats || [];
      world.boats.push({ g, ph: rng() * 6 });
      A.put('mooring_post', x + 1.6, c.z + c.w / 2 + 0.25, 0, { circle: 0.15, h: 0.9, tag: 'low' });
    }
  }
  // ---- the islands: market stalls, trees, benches; red gas tanks between the stalls
  const free = (x, z, r) => {
    if (Math.abs(x) > Z.hw - 1.2) return false;
    for (const c of Z.chans) if (Math.abs(z - c.z) < c.w / 2 + Q + r + 0.3) return false;
    for (const l of Z.lengths) if (Math.abs(x - l.x) < l.w / 2 + Q + r + 0.3 && z < l.z0 + r + 0.6 && z > l.z1 - r - 0.6) return false;
    for (const b of Z.bridges) if (Math.abs(x - b.x) < b.w / 2 + r + 0.8 && Math.abs(z - b.z) < 2.8 + 2.4 + r) return false;
    if (Math.abs(x) < 4 && (z > Z.zTop - 3 || z < Z.zBot + 3)) return false;         // the way in and out
    const p = col.resolve(x, z, r);
    return Math.abs(p.x - x) + Math.abs(p.z - z) < 1e-3;
  };
  let ci = 0;
  for (const isl of Z.islands) {
    const n = Math.round((isl.z1 - isl.z0) * 1.4);
    for (let i = 0; i < n; i++) {
      const x = (rng() - 0.5) * (Z.hw * 2 - 4), z = isl.z0 + 1 + rng() * (isl.z1 - isl.z0 - 2);
      const k = rng();
      if (k < 0.4) {
        if (!free(x, z, 1.7)) continue;
        const g = stall(ci++, rng);
        g.position.set(x, 0, z);
        g.rotation.y = Math.floor(rng() * 4) * Math.PI / 2;
        world.add(g);
        const q = Math.abs(Math.sin(g.rotation.y)) > 0.5;
        col.box(x, z, q ? 0.7 : 1.5, q ? 1.5 : 0.7, 0, 0.88, 'low');
        // a red gas tank by some stalls (they go off when shot)
        if (rng() < 0.45 && ZONE_TANKS.length < 6) { const tx = x + (rng() < 0.5 ? -1 : 1) * 2.1, tz = z + (rng() - 0.5); if (free(tx, tz, 0.5)) ZONE_TANKS.push({ x: +tx.toFixed(2), z: +tz.toFixed(2) }); }
      } else if (k < 0.62) {
        if (!free(x, z, 0.6)) continue;
        A.put('street_tree', x, z, rng() * 6, { circle: 0.28, h: 4, s: 0.9 + rng() * 0.3 });
      } else if (k < 0.78) {
        if (!free(x, z, 1.0)) continue;
        A.put('bench', x, z, Math.floor(rng() * 4) * Math.PI / 2, { circle: 0.5, h: 0.6, tag: 'low' });
      } else if (k < 0.9) {
        if (!free(x, z, 0.6)) continue;
        A.put(rng() < 0.5 ? 'crate_wood' : 'barrel', x, z, rng() * 6, { circle: 0.45, h: 0.9 });
      } else {
        if (!free(x, z, 0.5)) continue;
        A.put('planter', x, z, 0, { circle: 0.45, h: 0.7, tag: 'low' });
      }
    }
  }
  // lanterns strung over every channel
  lanternStrings(world, Z.chans.map((c) => c.z), Z.hw);
}

// ---------------------------------------------------------------- live --
// doors open for anyone alive (or dead) coming up to them; keycards are picked up (host) and their door unlocks
export function tickZones(game, dt) {
  const w = game.world;
  const me = game.me;
  const t = game.time;
  for (const d of w.doors) {
    let want = 0;
    if (!d.locked) {
      for (const p of game.players.values()) if (p.alive && (p.x - d.x) ** 2 + (p.z - d.z) ** 2 < 7.3) { want = 1; break; }
      if (!want) for (const z of game.zombies.values()) if (z.alive && !z.idle && (z.x - d.x) ** 2 + (z.z - d.z) ** 2 < 2.9) { want = 1; break; }
    }
    // never shut on somebody standing in the doorway
    if (!want && d.open > 0.3) {
      const inDoor = (q) => Math.abs((d.along ? q.x - d.x : q.z - d.z)) < d.w / 2 + 0.2 && Math.abs((d.along ? q.z - d.z : q.x - d.x)) < 0.6;
      for (const p of game.players.values()) if (p.alive && inDoor(p)) want = 1;
      if (!want) for (const z of game.zombies.values()) if (z.alive && inDoor(z)) { want = 1; break; }
    }
    const was = d.open;
    d.open = Math.max(0, Math.min(1, d.open + (want ? 1 : -1) * dt * (d.lock ? 1.1 : 2.8)));
    if (d.open === was) continue;
    d.rec.off = d.open > 0.55;
    const k = d.open * d.open * (3 - 2 * d.open);
    if (d.shutter) {
      // a roller shutter: it rolls up into the head
      d.leaf.scale.y = Math.max(0.04, 1 - k);
      d.leaf.position.y = d.lh - (d.lh * Math.max(0.04, 1 - k)) / 2;
    } else {
      const s = k * (d.w - 0.1);
      if (d.along) d.leaf.position.x = s; else d.leaf.position.z = s;
    }
    if (want && was === 0 && Math.hypot(d.x - me.x, d.z - me.z) < 22) audio.play(d.shutter || d.lock ? 'gate' : 'mag_out', { x: d.x, z: d.z, vol: d.shutter || d.lock ? 0.25 : 0.35, rate: d.shutter ? 1.8 : d.lock ? 1.2 : 0.55 });
  }
  // the water moves; the boats rock
  if (MATS.water) MATS.water.userData.scroll.offset.set(t * 0.015, t * 0.03);
  if (w.boats) for (const b of w.boats) { b.g.rotation.z = Math.sin(t * 1.2 + b.ph) * 0.04; b.g.position.y = 0.02 + Math.sin(t * 1.5 + b.ph) * 0.03; }
  // keycards: spin over their shaft of light; the host hands one to whoever walks into it
  for (let i = 0; i < w.keyItems.length; i++) {
    const kI = w.keyItems[i];
    if (kI.taken) continue;
    if (kI.g) { kI.g.rotation.y = t * 2; kI.g.position.y = 1.0 + Math.sin(t * 3) * 0.1; }
    if (game.isHost) for (const p of game.players.values()) if (p.alive && Math.hypot(p.x - kI.x, p.z - kI.z) < 1.1) { const e = { k: 'key', i }; game.emit(e); takeKey(game, i); break; }
  }
}

// everyone: the keycard is taken, its door unlocks
export function takeKey(game, i, silent = false) {
  const w = game.world, kI = w.keyItems[i];
  if (!kI || kI.taken) return;
  kI.taken = true;
  if (kI.g) kI.g.visible = false;
  if (kI.beam) kI.beam.visible = false;
  for (const d of w.doors) {
    if (!d.lock || d.color !== kI.color) continue;
    d.locked = false;
    d.rec.tag = 'door';
    d.rec.off = true; w.nav?.rebuildAround(d.rec); d.rec.off = d.open > 0.55;
    game.botNav = null;
  }
  if (silent) return;
  const name = kI.color.toUpperCase();
  game.hud.banner(`${name} KEYCARD`, `The ${kI.color} door is unlocked`, 2.4);
  audio.play('power', { vol: 0.7, jitter: 0 });
  game.cam.trauma(0.1);
}

// the keycards' models (built once the game exists: they need the beam from objective.js)
export function dressKeys(game, beam) {
  for (const kI of game.world.keyItems) {
    const c = KEY_COLORS[kI.color];
    const g = new THREE.Group();
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.03), new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.35, metalness: 0.2 }));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.08, 0.035), new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
    stripe.position.y = 0.06;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: tex('tex/soft.webp'), color: c, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(card, stripe, glow);
    g.scale.setScalar(1.4);
    g.position.set(kI.x, 1.0, kI.z);
    game.scene.add(g);
    kI.g = g;
    const b = beam(c);
    b.position.set(kI.x, 0, kI.z);
    game.scene.add(b);
    kI.beam = b;
    // a pool of its colour on the floor
    game.world.lampSpots.push({ x: kI.x, y: 2.4, z: kI.z, broken: false, phase: 0, nofx: true, power: 0.6, color: c });
  }
}

// is somebody inside a roofed interior (no rain, no fog sheets)?
export function indoors(x, z) {
  for (const Z of ZONES) if (Z.kind === 'interior' && z < Z.zTop && z > Z.zBot && Math.abs(x) < Z.hw) return true;
  return false;
}
