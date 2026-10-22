// Level 6, THE CROSSING (2026-10-22): the street becomes a suspension bridge over the river. Between L.bridge.zS (the
// south shore) and L.bridge.zN (the far shore) there are no buildings: a deck 19 m wide on a red steel stiffening truss,
// railings you cannot climb (the dead can: they come up out of the river), two towers and their main cables, lamps,
// and the black water eight metres down. Half way over, the LIFT SPAN is raised: it is the level's gate. It comes down
// slowly while you hold the deck in front of it (the hold's progress drives the angle) and drops into place when the
// hold is done.
//
// world.js asks `onBridge(z)` wherever a street would build something that cannot stand on a bridge (buildings, the
// sidewalk slabs out to the walls, street furniture, the cross streets).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { surface, tex } from './assets.js';
import { L, LV, HOLDS } from './level.js';
import { mulberry } from './rng.js';

export const DECK_HW = 9.6;          // the walkable deck, railing to railing
export const WATER_Y = -9;
const SPAN_LEN = 12;                 // the lift span's leaf, from its south edge to the hinge
const SPAN_UP = 1.16;                // radians, raised

export const onBridge = (z, pad = 0) => !!L.bridge && z < L.bridge.zS + pad && z > L.bridge.zN - pad;
// the hole the raised span leaves in the deck: [north z (hinge), south z]
export const spanHole = () => L.bridge ? [L.gate[0] - SPAN_LEN + 0.5, L.gate[0] + 0.5] : null;

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// yellow and black hazard stripes for the span's edge
let _stripe = null;
function stripeTex() {
  if (_stripe) return _stripe;
  const c = document.createElement('canvas'); c.width = 256; c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#d8b020'; x.fillRect(0, 0, 256, 32);
  x.fillStyle = '#141414';
  for (let i = -2; i < 18; i++) { x.beginPath(); x.moveTo(i * 16, 32); x.lineTo(i * 16 + 8, 32); x.lineTo(i * 16 + 24, 0); x.lineTo(i * 16 + 16, 0); x.fill(); }
  _stripe = new THREE.CanvasTexture(c); _stripe.colorSpace = THREE.SRGBColorSpace; _stripe.wrapS = THREE.RepeatWrapping; _stripe.repeat.set(4, 1);
  return _stripe;
}

let _water = null;
function waterMat() {
  if (_water) return _water;
  const n = tex('tex/concrete_normal.webp', { srgb: false, repeat: true });
  n.repeat.set(14, 40);
  _water = new THREE.MeshStandardMaterial({ color: 0x0b2630, roughness: 0.16, metalness: 0.35, normalMap: n, normalScale: new THREE.Vector2(0.45, 0.45) });
  _water.userData.scroll = n;
  _water.name = 'river';
  return _water;
}

export function buildBridge(world) {
  const B = L.bridge;
  if (!B) return;
  const red = surface('metal', 1, LV.theme.bridge ?? 0xa83a24); red.metalness = 0.55; red.roughness = 0.55; red.name = 'bridge_red';
  const steel = surface('metal', 1, 0x3a3e42); steel.metalness = 0.6; steel.roughness = 0.5;
  const conc = surface('concrete', 1, 0x8a867c);
  const add = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; world.add(m); return m; };
  const [hN, hS] = spanHole();
  const len = B.zS - B.zN;

  // ---- the river: a wide sheet of black water under everything, its far edges lost in the fog
  const water = new THREE.Mesh(new THREE.PlaneGeometry(240, len + 120).rotateX(-Math.PI / 2), waterMat());
  water.position.set(0, WATER_Y, (B.zS + B.zN) / 2);
  water.receiveShadow = true;
  water.userData.noMerge = true;
  world.add(water);
  world.river = water;
  // the quay walls the bridge leaves from, dropping into the water on both shores
  for (const [z, s] of [[B.zS, 1], [B.zN, -1]]) {
    add(box(200, -WATER_Y + 1.5, 3, 0, (WATER_Y - 1.5) / 2, z + s * 1.5), conc);
    add(box(200, 0.4, 0.5, 0, 0.05, z + s * 0.25), conc);
  }
  // ---- the deck: a slab under the asphalt, its red fascia, and the stiffening truss hanging under each edge
  const deckRuns = [[B.zS, hS], [hN, B.zN]];
  for (const [z0, z1] of deckRuns) {
    for (let z = z0; z > z1 + 0.01; z -= 12) {
      const zz = Math.max(z1, z - 12), mid = (z + zz) / 2, l = z - zz;
      add(box(DECK_HW * 2 + 0.8, 1.1, l, 0, -0.57, mid), conc, false);
      for (const s of [-1, 1]) {
        add(box(0.35, 1.25, l, s * (DECK_HW + 0.55), -0.45, mid), red, false);            // fascia
        // the truss: top and bottom chords and a W of diagonals
        const g = [box(0.3, 0.3, l, s * (DECK_HW + 0.75), -1.1, mid), box(0.3, 0.3, l, s * (DECK_HW + 0.75), -3.6, mid)];
        for (let k = 0; k < 2; k++) {
          const za = z - k * l / 2, zb = za - l / 2;
          const d = new THREE.BoxGeometry(0.22, Math.hypot(2.5, l / 2), 0.22);
          d.rotateX((k % 2 ? 1 : -1) * Math.atan2(l / 2, 2.5));
          d.translate(s * (DECK_HW + 0.75), -2.35, (za + zb) / 2);
          g.push(d, box(0.22, 2.5, 0.22, s * (DECK_HW + 0.75), -2.35, za));
        }
        add(mergeGeometries(g), red, false);
      }
    }
  }
  // ---- the railings: posts, three rails, a red cap. A collider the living cannot cross (bullets fly over it)
  const rail = [];
  // (the colliders run the whole length, over the span's hole too, and beyond them the river is blocked out to the
  // walls: from the shores' sidewalks nobody walks off onto the water)
  for (const s of [-1, 1]) {
    world.col.box(s * (DECK_HW + 0.35), (B.zS + B.zN) / 2, 0.35, len / 2, 0, 1.0, 'low');
    world.col.box(s * (DECK_HW + 0.7 + 12), (B.zS + B.zN) / 2, 12, len / 2 + 0.5, 0, 0.6, 'low');
  }
  for (const [z0, z1] of deckRuns) {
    for (const s of [-1, 1]) {
      const x = s * (DECK_HW + 0.15), l = z0 - z1;
      for (let z = z0 - 0.4; z > z1 + 0.2; z -= 2.4) rail.push({ x, z });
      for (const y of [0.35, 0.7]) add(box(0.06, 0.06, l, x, y, (z0 + z1) / 2), steel, false);
      add(box(0.14, 0.08, l, x, 1.05, (z0 + z1) / 2), red, false);
    }
  }
  const posts = rail.map(({ x, z }) => box(0.12, 1.05, 0.12, x, 0.52, z));
  for (let i = 0; i < posts.length; i += 60) add(mergeGeometries(posts.slice(i, i + 60)), steel, false);
  // ---- the two towers and the main cables: tall red legs outside the railings, a portal far overhead
  const T1 = B.zS - len * 0.22, T2 = B.zN + len * 0.22, TOP = 26, TX = DECK_HW + 2.1;
  for (const tz of [T1, T2]) {
    for (const s of [-1, 1]) {
      add(box(2.0, TOP - WATER_Y + 2, 2.4, s * TX, (TOP + WATER_Y - 2) / 2, tz), red);
      add(box(2.4, 1.4, 2.8, s * TX, TOP - 1, tz), red);
      for (const y of [4, 12, 20]) add(box(2.15, 0.25, 2.55, s * TX, y, tz), steel, false);
      add(box(3.6, 3, 4, s * TX, WATER_Y + 1.2, tz), conc, false);                // the pier in the water
    }
    add(box(TX * 2, 2.2, 2.0, 0, TOP + 0.4, tz), red);                             // the portal (above the camera)
  }
  world.towers = [T1, T2];
  // the cables: a sag between the towers, straight down to the shore anchorages either side
  const sag = (z) => {
    if (z > T1) return 1.5 + (TOP - 1.5) * (B.zS - z) / (B.zS - T1);
    if (z < T2) return 1.5 + (TOP - 1.5) * (z - B.zN) / (T2 - B.zN);
    const u = (z - (T1 + T2) / 2) / ((T1 - T2) / 2);
    return 2.6 + (TOP - 2.6) * u * u;
  };
  world.cableY = sag;
  for (const s of [-1, 1]) {
    const pts = [];
    for (let z = B.zS; z >= B.zN - 0.01; z -= 4) pts.push(new THREE.Vector3(s * TX, sag(z), z));
    // in pieces so each chunk of the level culls its own
    for (let i = 0; i < pts.length - 1; i += 6) {
      const seg = pts.slice(i, Math.min(pts.length, i + 7));
      if (seg.length < 2) continue;
      const curve = new THREE.CatmullRomCurve3(seg);
      add(new THREE.TubeGeometry(curve, seg.length * 3, 0.32, 8), red, false);
    }
    // the hangers: thin rods from the cable down to the truss
    const hg = [];
    for (let z = B.zS - 4; z > B.zN + 2; z -= 4) {
      if (z < hS + 0.5 && z > hN - 0.5) continue;
      const y = sag(z);
      if (y < 1.2) continue;
      hg.push(box(0.07, y + 1, 0.07, s * TX, (y - 1) / 2, z));
    }
    for (let i = 0; i < hg.length; i += 10) add(mergeGeometries(hg.slice(i, i + 10)), steel, false);
  }
  // ---- the hole the raised span leaves: the counterweight pit's walls, the hinge's gear wheels either side
  for (const s of [-1, 1]) add(box(0.6, 6, SPAN_LEN, s * (DECK_HW + 0.5), -3, (hN + hS) / 2), conc, false);
  add(box(DECK_HW * 2, 1.6, 0.9, 0, -0.86, hN - 0.45), conc, false);        // the far lip the leaf comes down on
  add(box(DECK_HW * 2, 1.6, 0.6, 0, -0.86, hS + 0.3), conc, false);         // the hinge beam
}

// The lift span: the level's gate. `put`/`floodlight` etc. are dress.js's helpers.
export function buildSpan(world, k, gz, { put, floodlight, sandbags, fire }) {
  const [hN, hS] = spanHole();
  const asphalt = world.asphalt;
  const red = surface('metal', 1, LV.theme.bridge ?? 0xa83a24); red.metalness = 0.55; red.roughness = 0.55;
  const steel = surface('metal', 1, 0x3a3e42); steel.metalness = 0.6; steel.roughness = 0.5;
  // the hinge is on the NEAR (south) edge: raised, the leaf's road climbs away from you into the sky, which is what the
  // camera (behind and above you) can see; it comes down onto the far lip
  const hinge = new THREE.Group();
  hinge.position.set(0, 0, hS);
  hinge.userData.noMerge = true;
  world.add(hinge);
  const L0 = hS - hN;
  // the leaf: road on top (with its markings), a steel grid underneath, railings along its edges
  const deck = new THREE.Mesh(new THREE.BoxGeometry(DECK_HW * 2 + 0.6, 0.45, L0).translate(0, -0.23, -L0 / 2), [steel, steel, asphalt, steel, red, steel]);
  deck.castShadow = true; deck.receiveShadow = true;
  hinge.add(deck);
  const paint = new THREE.MeshStandardMaterial({ color: 0xa88a2a, roughness: 0.7 });
  for (let z = 1.5; z < L0; z += 6) for (const x of [-0.12, 0.12]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 3).rotateX(-Math.PI / 2), paint); p.position.set(x, 0.012, -z); hinge.add(p); }
  const ribs = [];
  for (let z = 0.6; z < L0; z += 1.4) ribs.push(box(DECK_HW * 2, 0.35, 0.18, 0, -0.62, -z));
  for (const s of [-1, 1]) {
    ribs.push(box(0.5, 0.9, L0, s * DECK_HW, -0.7, -L0 / 2));
    for (let z = 0.4; z < L0; z += 2.4) ribs.push(box(0.12, 1.05, 0.12, s * (DECK_HW + 0.15), 0.52, -z));
    ribs.push(box(0.06, 0.06, L0, s * (DECK_HW + 0.15), 0.5, -L0 / 2));
    ribs.push(box(0.14, 0.08, L0, s * (DECK_HW + 0.15), 1.05, -L0 / 2));
  }
  hinge.add(new THREE.Mesh(mergeGeometries(ribs), red));
  // warning lights along the leaf's free edge (they blink while it is up), and a striped band across it
  const lamps = [];
  const lmat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false });
  for (let x = -8; x <= 8; x += 4) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), lmat); l.position.set(x, 0.15, -L0 + 0.15); hinge.add(l); lamps.push(l); }
  // and up both edges, so the raised leaf reads as a road climbing into the dark
  for (const s2 of [-1, 1]) for (let z = 1.5; z < L0; z += 2.5) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), lmat); l.position.set(s2 * (DECK_HW + 0.15), 1.15, -z); hinge.add(l); lamps.push(l); }
  const stripe2 = new THREE.Mesh(new THREE.PlaneGeometry(DECK_HW * 2, 1.2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: stripeTex(), roughness: 0.6 }));
  stripe2.position.set(0, 0.014, -1.2);
  hinge.add(stripe2);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(DECK_HW * 2, 1.2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: stripeTex(), roughness: 0.6 }));
  stripe.position.set(0, 0.014, -L0 + 0.9);
  hinge.add(stripe);
  // the hinge drums and the motor housings either side of the near edge
  for (const s of [-1, 1]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.9, 18).rotateZ(Math.PI / 2), steel);
    drum.position.set(s * (DECK_HW + 1.0), 0.0, hS);
    drum.castShadow = true;
    world.add(drum);
  }
  hinge.rotation.x = SPAN_UP;
  // the collider over the hole: nobody walks into the river (taken away when the span is down)
  const cols = [world.col.box(0, (hN + hS) / 2, DECK_HW, L0 / 2, 0, 4, 'gate')];
  const sp = { group: hinge, cols, leaves: [], beacon: null, open: false, t: 0, z: gz, span: true, lamps, lmat, prog: 0 };
  // the gate's opening animation (world.js) calls this: from wherever the hold left it, down into place
  sp.anim = (k2) => { const from = SPAN_UP * (1 - sp.prog * 0.85); hinge.rotation.x = from * (1 - k2) * (1 - k2); if (k2 >= 1) for (const l of lamps) l.visible = false; };
  world.gates[k] = sp;
  // the control hut on the near side, floodlights, the last cover before the hole
  put('crate_mil', -6.8, hS + 3.5, 0.2, { box: [0.5, 0.25], h: 0.42, tag: 'low' });
  floodlight(-8.4, hS + 4.2, 0.2);
  floodlight(8.4, hS + 4.2, 2.9);
  put('barrel', 5.2, hS + 2.4, 0, { circle: 0.32, h: 0.9 }); fire(5.2, hS + 2.4);
  sandbags(-2.8, hS + 5.5, 0);
  sandbags(3.0, hS + 5.8, 0);
}

// every frame: the raised span comes down with the hold's progress, and its lamps blink while it is up
export function tickSpan(g, dt) {
  const sp = g.world.gates?.[0];
  if (!sp?.span) return;
  if (!sp.open) {
    let prog = 0;
    if (g.hold === 0 && g.phase === 'hold') prog = Math.min(1, g.holdT / Math.max(1, HOLDS[0].secs));
    sp.prog += (prog - sp.prog) * Math.min(1, dt * 2);
    sp.group.rotation.x = SPAN_UP * (1 - sp.prog * 0.85);
    // the motors grind while it moves
    if (prog > 0 && Math.random() < dt * 2) g.fx.sparkList.push({ x: (Math.random() < 0.5 ? -1 : 1) * 10.6, y: 0.4, z: spanHole()[1], vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2, vz: Math.random() * 2, t: 0, max: 0.4 });
  }
  const on = !sp.open && Math.sin(g.time * 6) > 0;
  sp.lmat.color.setHex(on ? 0xff2a1a : 0x401010);
  // the river moves
  if (g.world.river) { const n = g.world.river.material.userData.scroll; n.offset.x = g.time * 0.008; n.offset.y = g.time * 0.02; }
}

// spawn points along the railings, either side, near z: where the drowned climb up (Game.climbers)
export function railSpot(z, side) { return { x: side * (DECK_HW - 0.45), z }; }

export { mulberry };
