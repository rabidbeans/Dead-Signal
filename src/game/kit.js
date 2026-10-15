// Procedural set pieces for the maze levels: shipping containers, market stalls, hesco barriers, paper lanterns and
// the safe rooms. Geometry and materials are made once and shared (World.bake() merges by material per chunk), and
// everything is coloured on purpose: Sam asked for "more color, it's too dull and bland".
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { surface } from './assets.js';
import { signTexture } from './world.js';

const cache = {};
const once = (k, f) => cache[k] || (cache[k] = f());

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function box(w, h, d, x = 0, y = 0, z = 0) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
function shade(n, k) {
  const r = Math.min(255, ((n >> 16) & 255) * k) | 0, g = Math.min(255, ((n >> 8) & 255) * k) | 0, b = Math.min(255, (n & 255) * k) | 0;
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------- containers --
export const CONTAINER_COLORS = [0xb8352a, 0x2a5fa8, 0x2f8a4a, 0xd8792a, 0x1f8a8a, 0xc8a22a];
const CONTAINER_WORDS = ['MAERSKON', 'HANJIN', 'EVERSEA', 'COSTA', 'PACIFIC', 'NORDLINE'];

function containerMat(color, i) {
  return once('cont' + color, () => {
    const map = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = hex(color); g.fillRect(0, 0, w, h);
      // corrugation: light and dark vertical bands
      for (let x = 0; x < w; x += 16) {
        g.fillStyle = shade(color, 1.18); g.fillRect(x, 0, 5, h);
        g.fillStyle = shade(color, 0.72); g.fillRect(x + 10, 0, 4, h);
      }
      // top and bottom rails
      g.fillStyle = shade(color, 0.55); g.fillRect(0, 0, w, 10); g.fillRect(0, h - 12, w, 12);
      // rust and grime running down from the top
      for (let k = 0; k < 90; k++) {
        const x = Math.random() * w, l = 20 + Math.random() * 120;
        const gr = g.createLinearGradient(0, 0, 0, l);
        gr.addColorStop(0, 'rgba(90,40,15,0.55)'); gr.addColorStop(1, 'rgba(90,40,15,0)');
        g.fillStyle = gr; g.fillRect(x, 8, 2 + Math.random() * 6, l);
      }
      for (let k = 0; k < 400; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 10, 1 + Math.random() * 4); }
    });
    // the long sides carry the line's name; the roof and the ends are plain (lettering on the roof read upside down)
    const named = map.image;
    const c2 = document.createElement('canvas'); c2.width = named.width; c2.height = named.height;
    const g2 = c2.getContext('2d'); g2.drawImage(named, 0, 0);
    g2.font = 'bold 54px Arial Black, Arial'; g2.fillStyle = 'rgba(245,240,230,0.85)'; g2.textAlign = 'center';
    g2.fillText(CONTAINER_WORDS[i % CONTAINER_WORDS.length], c2.width / 2, c2.height / 2 + 18);
    const side = new THREE.CanvasTexture(c2); side.colorSpace = THREE.SRGBColorSpace; side.anisotropy = 4;
    const plain = new THREE.MeshStandardMaterial({ map, roughness: 0.62, metalness: 0.35 });
    const lettered = new THREE.MeshStandardMaterial({ map: side, roughness: 0.62, metalness: 0.35 });
    return [plain, plain, plain, plain, lettered, lettered];
  });
}

function containerGeo() {
  return once('contGeo', () => {
    const L = 6.06, H = 2.59, D = 2.44;
    const parts = [];
    // corner posts and the door bars stand proud of the walls
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.16, H, 0.16, sx * (L / 2 - 0.08), H / 2, sz * (D / 2 - 0.02)));
    for (let k = 0; k < 4; k++) parts.push(box(0.05, H - 0.3, 0.06, L / 2 + 0.02, H / 2, -0.85 + k * 0.57));
    return mergeGeometries(parts);
  });
}

export function container(i) {
  const color = CONTAINER_COLORS[i % CONTAINER_COLORS.length];
  const mats = containerMat(color, i);
  const g = new THREE.Group();
  const body = new THREE.Mesh(once('contBody', () => box(6.06, 2.59, 2.44, 0, 2.59 / 2, 0)), mats);
  const trim = new THREE.Mesh(containerGeo(), mats[0]);
  g.add(body, trim);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// --------------------------------------------------------------- market stall --
const STALL_COLORS = [[0xd8282a, 0xf2e6c8], [0x2a8a3a, 0xf2e6c8], [0xe8a020, 0x8a2a1a], [0x2a5aa8, 0xf2f0e8], [0xa83a9a, 0xf8d8f0]];
export function stall(i, rng) {
  const [c1, c2] = STALL_COLORS[i % STALL_COLORS.length];
  const g = new THREE.Group();
  const wood = once('stallWood', () => { const m = surface('wood', 1, 0x9a6a42); return m; });
  const pole = once('stallPole', () => new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.5, metalness: 0.6 }));
  const canopy = once('canopy' + c1, () => new THREE.MeshStandardMaterial({
    map: canvasTex(256, 64, (gg, w, h) => { for (let x = 0; x < w; x += 32) { gg.fillStyle = hex(c1); gg.fillRect(x, 0, 16, h); gg.fillStyle = hex(c2); gg.fillRect(x + 16, 0, 16, h); } gg.fillStyle = 'rgba(0,0,0,0.25)'; gg.fillRect(0, h - 8, w, 8); }),
    roughness: 0.85, side: THREE.DoubleSide,
  }));
  const table = new THREE.Mesh(box(2.8, 0.1, 1.2, 0, 0.9, 0), wood);
  const legs = new THREE.Mesh(mergeGeometries([[-1.3, -0.5], [1.3, -0.5], [-1.3, 0.5], [1.3, 0.5]].map(([x, z]) => box(0.07, 2.4, 0.07, x, 1.2, z))), pole);
  const front = new THREE.Mesh(box(2.8, 0.8, 0.05, 0, 0.45, 0.58), wood);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.7).rotateX(-Math.PI / 2 + 0.28).translate(0, 2.45, 0), canopy);
  const val = new THREE.Mesh(box(3.2, 0.26, 0.02, 0, 2.15, 0.82), canopy);
  g.add(table, legs, front, top, val);
  // produce: crates of fruit and vegetables in loud colours
  const fruitCols = [0xff7a1a, 0xe02a2a, 0x8ad02a, 0xffd23a, 0x9a2ad0];
  for (let k = 0; k < 4; k++) {
    const crate = new THREE.Mesh(box(0.55, 0.22, 0.42, -1.0 + k * 0.66, 1.06, -0.05), wood);
    const col = fruitCols[(i + k) % fruitCols.length];
    const fm = once('fruit' + col, () => new THREE.MeshStandardMaterial({ color: col, roughness: 0.45 }));
    const fr = new THREE.Mesh(once('fruitGeo', () => {
      const parts = [];
      for (let a = 0; a < 9; a++) { const s = new THREE.SphereGeometry(0.075, 8, 6); s.translate((a % 3 - 1) * 0.15, 0.2, (Math.floor(a / 3) - 1) * 0.11); parts.push(s); }
      return mergeGeometries(parts);
    }), fm);
    fr.position.set(-1.0 + k * 0.66, 1.0, -0.05);
    g.add(crate, fr);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.rotation.y = (rng() - 0.5) * 0.12;
  return g;
}

// --------------------------------------------------------------------- hesco --
export function hesco() {
  return once('hescoProto', () => {
    const fabric = new THREE.MeshStandardMaterial({
      map: canvasTex(128, 128, (g, w, h) => {
        g.fillStyle = '#8a7a52'; g.fillRect(0, 0, w, h);
        for (let k = 0; k < 300; k++) { g.fillStyle = `rgba(40,30,10,${Math.random() * 0.18})`; g.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 12, 2 + Math.random() * 6); }
        g.strokeStyle = 'rgba(200,200,190,0.75)'; g.lineWidth = 3;
        for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
        for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      }),
      roughness: 0.9,
    });
    const sand = new THREE.MeshStandardMaterial({ color: 0x9a8a62, roughness: 1 });
    const g = new THREE.Group();
    const b = new THREE.Mesh(box(1.1, 1.05, 1.1, 0, 0.525, 0), fabric);
    const t = new THREE.Mesh(box(1.0, 0.04, 1.0, 0, 1.06, 0), sand);
    g.add(b, t);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }).clone();
}

// ----------------------------------------------------------- paper lanterns --
// Strings of red and gold lanterns across the street (Lantern Street): one InstancedMesh each, glowing (they bloom).
export function lanternStrings(world, zs) {
  const per = 9;
  const bodyGeo = new THREE.SphereGeometry(0.2, 12, 9).scale(1, 1.25, 1);
  const capGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10);
  const colors = [new THREE.Color(1.3, 0.16, 0.06), new THREE.Color(1.3, 0.6, 0.08), new THREE.Color(1.2, 0.08, 0.22)];
  // unlit and coloured per lantern (the instance colour), low over the street so they do not fill the camera
  const body = new THREE.InstancedMesh(bodyGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), zs.length * per);
  const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshStandardMaterial({ color: 0xd8a83a, metalness: 0.8, roughness: 0.35 }), zs.length * per * 2);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  const wire = [];
  let n = 0, nc = 0;
  zs.forEach((z, si) => {
    for (let k = 0; k < per; k++) {
      const u = (k + 0.5) / per, x = -8.8 + u * 17.6;
      const y = 4.7 - Math.sin(u * Math.PI) * 0.6;
      p.set(x, y - 0.24, z); m.compose(p, q, s); body.setMatrixAt(n, m);
      body.setColorAt(n, colors[(k + si) % colors.length]); n++;
      p.set(x, y - 0.02, z); m.compose(p, q, s); caps.setMatrixAt(nc++, m);
      p.set(x, y - 0.5, z); m.compose(p, q, s); caps.setMatrixAt(nc++, m);
    }
    for (let k = 0; k <= 20; k++) { const u = k / 20; wire.push(new THREE.Vector3(-9 + u * 18, 4.7 - Math.sin(u * Math.PI) * 0.6, z)); if (k > 0 && k < 20) wire.push(wire[wire.length - 1].clone()); }
  });
  body.instanceMatrix.needsUpdate = true; body.instanceColor.needsUpdate = true; caps.instanceMatrix.needsUpdate = true;
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wire), new THREE.LineBasicMaterial({ color: 0x1a1a1a }));
  for (const o of [body, caps, lines]) { o.frustumCulled = false; o.userData.noMerge = true; world.add(o); }
  // they glow in the fog: every string is a light source for the lamp pool
  for (const z of zs) world.lampSpots.push({ x: 0, y: 4.6, z, broken: false, phase: 0, nofx: true, power: 0.6, color: 0xff5a2a });
}

// ---------------------------------------------------------------- safe rooms --
// A concrete bulkhead across the street with a steel door and a lit room behind it. `dir` = -1: the room is to the north
// (the end of a level, the door shut until the boss is down); +1: to the south (the start: the room you just left, open).
export function safeRoom(world, wz, dir, open) {
  const col = world.col;
  const concrete = once('srConcrete', () => surface('concrete', 1, 0x9c968a));
  const hazard = once('srHazard', () => new THREE.MeshStandardMaterial({
    map: canvasTex(128, 32, (g) => { g.fillStyle = '#e8b51a'; g.fillRect(0, 0, 128, 32); g.fillStyle = '#16140f'; for (let i = -2; i < 10; i++) { g.beginPath(); g.moveTo(i * 16, 32); g.lineTo(i * 16 + 8, 32); g.lineTo(i * 16 + 40, 0); g.lineTo(i * 16 + 32, 0); g.fill(); } }, true),
    roughness: 0.55,
  }));
  const steel = once('srSteel', () => new THREE.MeshStandardMaterial({ color: 0x3f6a5a, roughness: 0.45, metalness: 0.7 }));
  const inside = once('srInside', () => new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffb860, emissiveIntensity: 0.55, roughness: 0.8 }));
  const W = 9.4, DW = 1.35, DH = 2.8, H = 5.2, T = 0.6, RD = 3.9, RW = 2.9;
  const g = new THREE.Group();
  g.userData.noMerge = true;
  const wall = [box(W - DW, H, T, -(W + DW) / 2, H / 2, 0), box(W - DW, H, T, (W + DW) / 2, H / 2, 0), box(DW * 2, H - DH, T, 0, DH + (H - DH) / 2, 0)];
  const wm = new THREE.Mesh(mergeGeometries(wall), concrete);
  wm.castShadow = true; wm.receiveShadow = true;
  // a hazard-striped frame round the door
  const frame = new THREE.Mesh(mergeGeometries([box(0.22, DH + 0.2, T + 0.08, -DW - 0.11, (DH + 0.2) / 2, 0), box(0.22, DH + 0.2, T + 0.08, DW + 0.11, (DH + 0.2) / 2, 0), box(DW * 2 + 0.44, 0.22, T + 0.08, 0, DH + 0.11, 0)]), hazard);
  // the room: floor, walls and a roof (the roof cuts away round survivors like a building does)
  const room = new THREE.Mesh(mergeGeometries([
    box(RW * 2, 0.06, RD, 0, 0.03, dir * RD / 2), box(0.3, 3.2, RD, -RW, 1.6, dir * RD / 2), box(0.3, 3.2, RD, RW, 1.6, dir * RD / 2), box(RW * 2 + 0.3, 3.2, 0.3, 0, 1.6, dir * RD),
  ]), inside);
  const roof = new THREE.Mesh(box(RW * 2 + 0.6, 0.3, RD + 0.3, 0, 3.35, dir * RD / 2), world.roofMat || concrete);
  roof.castShadow = true;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.85), new THREE.MeshBasicMaterial({ map: signTexture('SAFE ROOM', '#4dff7a', '#081208', 512, 104), toneMapped: false }));
  sign.position.set(0, DH + 1.15, -dir * (T / 2 + 0.03));
  if (dir > 0) sign.rotation.y = Math.PI;
  const lampGeo = new THREE.SphereGeometry(0.16, 12, 8);
  const lampMat = new THREE.MeshBasicMaterial({ color: open ? 0x30ff60 : 0xff2a1a, toneMapped: false });
  const lamps = [-1, 1].map((sx) => { const l = new THREE.Mesh(lampGeo, lampMat); l.position.set(sx * (DW + 0.55), DH + 0.35, -dir * (T / 2 + 0.1)); return l; });
  const door = new THREE.Mesh(box(DW * 2 - 0.04, DH - 0.02, 0.18, 0, (DH - 0.02) / 2, 0), steel);
  door.castShadow = true;
  g.add(wm, frame, room, roof, sign, door, ...lamps);
  g.position.set(0, 0, wz);
  world.add(g);
  // colliders: the bulkhead either side of the door, the room's walls, and the door itself (removed when it opens)
  col.box(-(W + DW) / 2, wz, (W - DW) / 2, T / 2, 0, H);
  col.box((W + DW) / 2, wz, (W - DW) / 2, T / 2, 0, H);
  col.box(-RW, wz + dir * RD / 2, 0.15, RD / 2, 0, 3.2);
  col.box(RW, wz + dir * RD / 2, 0.15, RD / 2, 0, 3.2);
  col.box(0, wz + dir * RD, RW + 0.15, 0.15, 0, 3.2);
  const doorCol = open ? null : col.box(0, wz, DW, T / 2, 0, 3, 'door');
  if (open) door.position.x = DW * 2 - 0.1;
  world.lampSpots.push({ x: 0, y: 2.6, z: wz + dir * RD / 2, broken: false, phase: 0, nofx: true, power: 0.6, color: 0xffd090 });
  return {
    door, lamps, lampMat, doorCol, open, t: open ? 1 : 0, wz, dir,
    // the room's floor, a step in from its walls
    inside: (x, z) => Math.abs(x) < RW - 0.45 && (dir < 0 ? z < wz - 0.5 && z > wz - RD + 0.35 : z > wz + 0.5 && z < wz + RD - 0.35),
  };
}

// slide the door open (animated by World.update through `tick`)
export function openSafeRoom(world, sr) {
  if (!sr || sr.open) return;
  sr.open = true;
  sr.lampMat.color.set(0x30ff60);
  if (sr.doorCol) { world.col.remove(sr.doorCol); world.nav?.rebuildAround(sr.doorCol); }
}

export function tickSafeRoom(sr, dt) {
  if (!sr) return;
  sr.t = Math.min(1, sr.t + (sr.open ? dt / 1.6 : 0));
  const k = sr.t * sr.t * (3 - 2 * sr.t);
  sr.door.position.x = k * (1.35 * 2 - 0.1);
}
