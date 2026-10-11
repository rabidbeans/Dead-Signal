// Level geometry, lights, colliders and the navigation field.
//
// World frame: x east, y up, z south (toward the camera). Metres.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prop, surface, tex, propMaterial, instanced, awningMaterial, dirtify } from './assets.js';
import { populate } from './dress.js';
import { L, blockRanges, buildLots, lampSites } from './level.js';
import { mulberry } from './rng.js';
import { Q } from './quality.js';

// ---------------------------------------------------------------- shapes --
// Colliders are 2D in the ground plane: oriented boxes and circles.
export class Colliders {
  constructor() { this.boxes = []; this.circles = []; }
  box(cx, cz, hw, hd, rot = 0, h = 3, tag = 'solid') {
    const c = Math.cos(rot), s = Math.sin(rot);
    const rec = { cx, cz, hw, hd, c, s, h, tag };
    this.boxes.push(rec);
    return rec;
  }
  circle(x, z, r, h = 1, tag = 'solid') { const rec = { x, z, r, h, tag }; this.circles.push(rec); return rec; }
  remove(rec) {
    this._unindex(rec);
    let i = this.boxes.indexOf(rec);
    if (i >= 0) { this.boxes.splice(i, 1); return; }
    i = this.circles.indexOf(rec);
    if (i >= 0) this.circles.splice(i, 1);
  }

  // does collider `c` (a box or a circle record) overlap the disc (x, z, r)?
  static overlaps(c, x, z, r) {
    if (c.hw !== undefined) {
      const dx = x - c.cx, dz = z - c.cz;
      const lx = dx * c.c + dz * c.s, lz = -dx * c.s + dz * c.c;
      const qx = Math.max(-c.hw, Math.min(c.hw, lx)), qz = Math.max(-c.hd, Math.min(c.hd, lz));
      return (lx - qx) ** 2 + (lz - qz) ** 2 < r * r;
    }
    const dx = x - c.x, dz = z - c.z;
    return dx * dx + dz * dz < (r + c.r) ** 2;
  }

  // A broad phase for a 300 m street: colliders are filed into 8 m strips along z, and a query looks
  // only at the strips it touches (a zombie used to test every box and barrel in the level).
  index() {
    const SZ = 8;
    this.SZ = SZ;
    this.strips = new Map();
    const put = (rec, z0, z1, kind) => {
      for (let k = Math.floor(z0 / SZ); k <= Math.floor(z1 / SZ); k++) {
        let st = this.strips.get(k);
        if (!st) this.strips.set(k, st = { boxes: [], circles: [] });
        st[kind].push(rec);
      }
    };
    for (const b of this.boxes) { const e = Math.abs(b.s) * b.hw + Math.abs(b.c) * b.hd; put(b, b.cz - e, b.cz + e, 'boxes'); }
    for (const c of this.circles) put(c, c.z - c.r, c.z + c.r, 'circles');
  }

  _unindex(rec) {
    if (!this.strips) return;
    for (const st of this.strips.values()) {
      let i = st.boxes.indexOf(rec); if (i >= 0) st.boxes.splice(i, 1);
      i = st.circles.indexOf(rec); if (i >= 0) st.circles.splice(i, 1);
    }
  }

  // push a circle (x, z, r) out of everything; returns corrected {x, z}
  resolve(x, z, r) {
    if (!this.strips) return this._resolve(this.boxes, this.circles, x, z, r);
    const k0 = Math.floor((z - r - 0.5) / this.SZ), k1 = Math.floor((z + r + 0.5) / this.SZ);
    let o = { x, z };
    for (let k = k0; k <= k1; k++) {
      const st = this.strips.get(k);
      if (st) o = this._resolve(st.boxes, st.circles, o.x, o.z, r);
    }
    return o;
  }

  _resolve(boxes, circles, x, z, r) {
    for (const b of boxes) {
      const dx = x - b.cx, dz = z - b.cz;
      const lx = dx * b.c + dz * b.s, lz = -dx * b.s + dz * b.c;
      const qx = Math.max(-b.hw, Math.min(b.hw, lx)), qz = Math.max(-b.hd, Math.min(b.hd, lz));
      let ex = lx - qx, ez = lz - qz;
      const d2 = ex * ex + ez * ez;
      if (d2 < r * r) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), k = (r - d) / d;
          ex *= k; ez *= k;
        } else {
          // centre inside: push out along the shallowest axis
          const px = b.hw - Math.abs(lx), pz = b.hd - Math.abs(lz);
          if (px < pz) { ex = (px + r) * Math.sign(lx || 1); ez = 0; } else { ez = (pz + r) * Math.sign(lz || 1); ex = 0; }
        }
        x += ex * b.c - ez * b.s;
        z += ex * b.s + ez * b.c;
      }
    }
    for (const c of circles) {
      const dx = x - c.x, dz = z - c.z, rr = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-8) {
        const d = Math.sqrt(d2), k = (rr - d) / d;
        x += dx * k; z += dz * k;
      }
    }
    return { x, z };
  }

  // nearest hit of a 2D ray against the world (bullets); returns distance
  ray(ox, oz, dx, dz, maxD) {
    if (!this.strips) return this._ray(this.boxes, this.circles, ox, oz, dx, dz, maxD);
    const za = oz, zb = oz + dz * maxD;
    const k0 = Math.floor((Math.min(za, zb) - 0.3) / this.SZ), k1 = Math.floor((Math.max(za, zb) + 0.3) / this.SZ);
    let best = { d: maxD, nx: 0, nz: 0 };
    for (let k = k0; k <= k1; k++) {
      const st = this.strips.get(k);
      if (!st) continue;
      const h = this._ray(st.boxes, st.circles, ox, oz, dx, dz, best.d);
      if (h.d < best.d) best = h;
    }
    return best;
  }

  _ray(boxes, circles, ox, oz, dx, dz, maxD) {
    let best = maxD, nx = 0, nz = 0;
    for (const b of boxes) {
      if (b.h < 0.9) continue;    // bullets fly over curbs, sandbags and barriers
      const rx = ox - b.cx, rz = oz - b.cz;
      const lox = rx * b.c + rz * b.s, loz = -rx * b.s + rz * b.c;
      const ldx = dx * b.c + dz * b.s, ldz = -dx * b.s + dz * b.c;
      let tmin = -Infinity, tmax = Infinity, axis = -1, sgn = 0, miss = false;
      for (let a = 0; a < 2; a++) {
        const o = a ? loz : lox, d = a ? ldz : ldx, h = a ? b.hd : b.hw;
        if (Math.abs(d) < 1e-9) { if (o < -h || o > h) { miss = true; break; } continue; }
        let t1 = (-h - o) / d, t2 = (h - o) / d, n = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; n = 1; }
        if (t1 > tmin) { tmin = t1; axis = a; sgn = n; }
        if (t2 < tmax) tmax = t2;
      }
      if (!miss && tmin <= tmax && tmin > 0 && tmin < best) {
        best = tmin;
        const lnx = axis === 0 ? sgn : 0, lnz = axis === 1 ? sgn : 0;
        nx = lnx * b.c - lnz * b.s; nz = lnx * b.s + lnz * b.c;
      }
    }
    for (const c of circles) {
      if (c.h < 0.9) continue;
      const fx = ox - c.x, fz = oz - c.z;
      const bq = fx * dx + fz * dz, cq = fx * fx + fz * fz - c.r * c.r;
      const disc = bq * bq - cq;
      if (disc < 0) continue;
      const t = -bq - Math.sqrt(disc);
      if (t > 0 && t < best) { best = t; nx = (fx + dx * t) / c.r; nz = (fz + dz * t) / c.r; }
    }
    return { d: best, nx, nz };
  }
}

const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [-1, -1, 1.414]];

// ------------------------------------------------------- navigation grid --
// A distance field from the players over a 0.5 m grid; zombies walk down
// its gradient, so they path around cars and barricades as a horde.
export class NavField {
  constructor(minX, minZ, maxX, maxZ, cell, colliders) {
    this.minX = minX; this.minZ = minZ; this.cell = cell;
    this.w = Math.ceil((maxX - minX) / cell); this.h = Math.ceil((maxZ - minZ) / cell);
    this.block = new Uint8Array(this.w * this.h);
    this.dist = new Float32Array(this.w * this.h).fill(1e9);
    this.distB = new Float32Array(this.w * this.h).fill(1e9);
    this.job = null;
    this.colliders = colliders;
    this.markAll();
    this.queue = new Int32Array(this.w * this.h * 4);
  }

  // mark the cells a collider covers (a cell is blocked if a 0.32 m body centred in it would overlap)
  mark(c, val = 1) {
    const r = 0.32, cell = this.cell;
    let x0, x1, z0, z1;
    if (c.hw !== undefined) {
      const ext = Math.abs(c.c) * c.hw + Math.abs(c.s) * c.hd + r, extz = Math.abs(c.s) * c.hw + Math.abs(c.c) * c.hd + r;
      x0 = c.cx - ext; x1 = c.cx + ext; z0 = c.cz - extz; z1 = c.cz + extz;
    } else { x0 = c.x - c.r - r; x1 = c.x + c.r + r; z0 = c.z - c.r - r; z1 = c.z + c.r + r; }
    const i0 = Math.max(0, Math.floor((x0 - this.minX) / cell)), i1 = Math.min(this.w - 1, Math.floor((x1 - this.minX) / cell));
    const j0 = Math.max(0, Math.floor((z0 - this.minZ) / cell)), j1 = Math.min(this.h - 1, Math.floor((z1 - this.minZ) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (val === 0) continue;
        if (Colliders.overlaps(c, this.minX + (i + 0.5) * cell, this.minZ + (j + 0.5) * cell, r)) this.block[j * this.w + i] = 1;
      }
    }
  }

  markAll() {
    for (const b of this.colliders.boxes) this.mark(b);
    for (const c of this.colliders.circles) this.mark(c);
  }

  // a collider was removed (a gate opened): rebuild the cells it covered
  rebuildAround(c) {
    const r = 0.32;
    let x0, x1, z0, z1;
    if (c.hw !== undefined) {
      const ext = Math.abs(c.c) * c.hw + Math.abs(c.s) * c.hd + r + 0.6, extz = Math.abs(c.s) * c.hw + Math.abs(c.c) * c.hd + r + 0.6;
      x0 = c.cx - ext; x1 = c.cx + ext; z0 = c.cz - extz; z1 = c.cz + extz;
    } else { x0 = c.x - c.r - 1; x1 = c.x + c.r + 1; z0 = c.z - c.r - 1; z1 = c.z + c.r + 1; }
    const i0 = Math.max(0, Math.floor((x0 - this.minX) / this.cell)), i1 = Math.min(this.w - 1, Math.floor((x1 - this.minX) / this.cell));
    const j0 = Math.max(0, Math.floor((z0 - this.minZ) / this.cell)), j1 = Math.min(this.h - 1, Math.floor((z1 - this.minZ) / this.cell));
    this.dirty = true;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = this.minX + (i + 0.5) * this.cell, z = this.minZ + (j + 0.5) * this.cell;
      const p = this.colliders.resolve(x, z, r);
      this.block[j * this.w + i] = Math.abs(p.x - x) + Math.abs(p.z - z) > 1e-4 ? 1 : 0;
    }
  }

  idx(x, z) {
    const i = Math.floor((x - this.minX) / this.cell), j = Math.floor((z - this.minZ) / this.cell);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }

  // The flood fill is INCREMENTAL: it fills a second buffer a few thousand cells a frame and swaps
  // when done, so a phone never pays for the whole thing in one frame (that was a hitch every 0.3 s).
  // Distances are in cells (0.5 m), diagonals 1.414, and stop at maxD (70 cells = 35 m): the dead
  // beyond that walk straight at you until they are close enough to be on the map.
  startBuild(targets, maxD = 70) {
    const D = this.distB, W = this.w, Q = this.queue;
    D.fill(1e9);
    let tail = 0;
    for (const t of targets) {
      const k = this.idx(t.x, t.z);
      if (k >= 0) { D[k] = 0; Q[tail++] = k; }
    }
    this.job = { head: 0, tail, maxD };
  }

  // process up to `ops` queue entries; true when the field has just been swapped in
  step(ops = 1800) {
    const j = this.job;
    if (!j) return false;
    const D = this.distB, W = this.w, H = this.h, B = this.block, Q = this.queue, maxD = j.maxD, qn = Q.length;
    let head = j.head, tail = j.tail;
    const end = head + ops;
    while (head < tail && head < end) {
      const k = Q[head++];
      const i = k % W, jj = (k / W) | 0;
      const d0 = D[k];
      for (let n = 0; n < 8; n++) {
        const di = NB[n][0], dj = NB[n][1], c = NB[n][2];
        const ni = i + di, nj = jj + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const nk = nj * W + ni;
        if (B[nk]) continue;
        if (di && dj && (B[jj * W + ni] || B[nj * W + i])) continue;   // no corner cutting
        const nd = d0 + c;
        if (nd > maxD) continue;
        if (nd < D[nk] - 1e-3) { D[nk] = nd; if (tail < qn) Q[tail++] = nk; }
      }
    }
    j.head = head; j.tail = tail;
    if (head >= tail) {
      const t = this.dist; this.dist = this.distB; this.distB = t;
      this.job = null;
      return true;
    }
    return false;
  }

  // the whole thing at once (level start)
  build(targets, maxD = 70) {
    this.startBuild(targets, maxD);
    while (!this.step(1e9));
  }

  // steepest-descent direction at (x, z); null if unreachable
  dir(x, z) {
    const k = this.idx(x, z);
    if (k < 0) return null;
    const W = this.w, i = k % W, j = (k / W) | 0;
    let best = this.dist[k], bi = 0, bj = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= this.h) continue;
        const v = this.dist[nj * W + ni];
        const cost = (di && dj) ? v + 0.0 : v;
        if (cost < best) { best = cost; bi = di; bj = dj; }
      }
    }
    if (!bi && !bj) return null;
    const l = Math.hypot(bi, bj);
    return { x: bi / l, z: bj / l };
  }
}

// --------------------------------------------------------------- helpers --
function tiled(geo, sx, sy) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  return geo;
}

// box with per-face UVs scaled to world size (tile = `tile` metres)
function worldBox(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // faces in order: +x, -x, +y, -y, +z, -z ; 4 verts each
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
    }
  }
  return g;
}

// X-ray cut: anything between the camera and a player is dissolved in a
// screen-space circle around them (dithered edge), so buildings never hide you.
export const cutaway = {
  uPlayers: { value: [new THREE.Vector4(-9, -9, 0, 0), new THREE.Vector4(-9, -9, 0, 0), new THREE.Vector4(-9, -9, 0, 0), new THREE.Vector4(-9, -9, 0, 0)] },
  uRes: { value: new THREE.Vector2(1, 1) },
};
function withCutaway(m) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.uPlayers = cutaway.uPlayers;
    sh.uniforms.uRes = cutaway.uRes;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec4 uPlayers[4]; uniform vec2 uRes;
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }`)
      .replace('void main() {', `void main() {
  for (int i = 0; i < 4; i++) {
    vec4 P = uPlayers[i];
    if (P.w <= 0.0) continue;
    vec2 d = (gl_FragCoord.xy - P.xy) / uRes.y;
    float r = length(d) / P.w;
    if (r < 1.0 && gl_FragCoord.z < P.z) {
      if (smoothstep(0.6, 1.0, r) < ign(gl_FragCoord.xy)) discard;
    }
  }`);
  };
  m.customProgramCacheKey = () => 'cut' + (m.name || '');
  return m;
}

export function signTexture(text, color, bg = '#060606', w = 512, h = 128) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.font = `700 ${h * 0.62}px "Oswald", "Arial Narrow", Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = h * 0.18;
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- level --
const _wc = new THREE.Color();
const CH = 36;                                   // batching / culling chunk (m of street)
export const chunkOf = (z) => Math.floor(z / CH);
const faceTo = (nx, nz) => Math.atan2(nx, nz);

export class World {
  constructor(scene) {
    this.scene = scene;
    this.col = new Colliders();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.flicker = [];          // lights and emissives that misbehave
    this.lampSpots = [];        // positions of lamps (for the light pool)
    this.fires = [];
    this.police = [];
    this.gates = [];            // the checkpoint gates (dress.js builds them)
    this.windows = [];          // per-chunk window colour state
    this.papers = [];
    this.bounds = { minX: -L.xWall, maxX: L.xWall, minZ: L.zMin, maxZ: L.zMax };
    this.spawns = [];
    this.build();
  }

  add(o) { this.group.add(o); return o; }

  build() {
    this.ground();
    this.buildings();
    this.streetFurniture();
    this.edges();
    populate(this);
    this.col.index();
    this.lights();
    this.events = [...this.fires, ...this.police.map((q) => ({ x: q.x, z: q.z, police: true }))];   // everything that wants one of the two event lights
    const b = this.bounds;
    this.nav = new NavField(b.minX - 6, b.minZ - 8, b.maxX + 6, b.maxZ + 8, 0.5, this.col);
    this.bake();
  }

  // ------------------------------------------------------------ ground --
  ground() {
    const asphalt = surface('asphalt');          // (never between the camera and a survivor: no cut-away, no discard)
    asphalt.name = 'asphalt';
    this.wetMaterial(asphalt, 0.75);
    const len = L.zMax - L.zMin + 60;
    const g = new THREE.PlaneGeometry(90, len);
    tiled(g, 90 / 4, len / 4);
    const road = new THREE.Mesh(g, asphalt);
    road.rotation.x = -Math.PI / 2;
    road.position.z = (L.zMax + L.zMin) / 2;
    road.receiveShadow = true;
    road.userData.noMerge = true;
    this.add(road);

    // sidewalks: raised slabs with concrete curbs, along each side of each block
    const walk = surface('sidewalk');
    walk.name = 'sidewalk';
    this.wetMaterial(walk, 0.6);
    const curbMat = surface('concrete');
    const blocks = this.blocks = [];
    for (const [zN, zS] of blockRanges()) for (const side of [-1, 1]) blocks.push(side < 0 ? [-80, -7, zN, zS] : [7, 80, zN, zS]);
    for (const [x0, x1, z0, z1] of blocks) {
      const w = x1 - x0, d = z1 - z0;
      const slab = new THREE.Mesh(worldBox(w, 0.15, d, 3), [walk, walk, walk, walk, walk, walk]);
      slab.position.set((x0 + x1) / 2, 0.075, (z0 + z1) / 2);
      slab.receiveShadow = true;
      this.add(slab);
      const edges = [];
      edges.push(x0 > -79 ? [x0 + 0.12, (z0 + z1) / 2, 0.24, d] : [x1 - 0.12, (z0 + z1) / 2, 0.24, d]);
      if (z0 > L.zMin + 0.5) edges.push([(x0 + x1) / 2, z0 + 0.12, w, 0.24]);
      if (z1 < L.zMax - 0.5) edges.push([(x0 + x1) / 2, z1 - 0.12, w, 0.24]);
      for (const [cx, cz, ew, ed] of edges) {
        const c = new THREE.Mesh(worldBox(ew, 0.17, ed, 1.5), curbMat);
        c.position.set(cx, 0.085, cz);
        c.receiveShadow = true;
        this.add(c);
      }
    }
    // road markings: dashed centre lines, lane edges, crosswalks
    const paint = new THREE.MeshStandardMaterial({
      color: 0x77746a, roughness: 0.75, transparent: true, opacity: 0.5, envMapIntensity: 0.1,
      alphaMap: tex('tex/concrete_albedo.webp', { srgb: false, repeat: true }),
      polygonOffset: true, polygonOffsetFactor: -2,
    });
    const yellow = paint.clone();
    yellow.color.set(0xa88a2a);
    const strip = (x, z, w, d, m) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
      p.rotation.x = -Math.PI / 2;
      p.position.set(x, 0.012, z);
      p.receiveShadow = true;
      this.add(p);
    };
    const nearCross = (z, pad) => L.cross.some((c) => Math.abs(z - c) < pad);
    for (let z = L.zMax - 3; z > L.zMin; z -= 6) {
      if (nearCross(z, 8.5)) continue;
      strip(-0.12, z, 0.12, 3, yellow); strip(0.12, z, 0.12, 3, yellow);
    }
    for (let z = L.zMax - 3; z > L.zMin; z -= 4.5) {
      if (nearCross(z, 9)) continue;
      strip(-3.5, z, 0.12, 2, paint); strip(3.5, z, 0.12, 2, paint);
    }
    for (const zc of L.cross) {
      for (let k = -4; k <= 4; k++) { strip(k * 1.2, zc - 7.2, 0.55, 2.6, paint); strip(k * 1.2, zc + 7.2, 0.55, 2.6, paint); }
      for (let k = -4; k <= 4; k++) { strip(-8.6, zc + k * 1.0, 2.6, 0.5, paint); strip(8.6, zc + k * 1.0, 2.6, 0.5, paint); }
      for (let x = -L.xWall + 2; x < L.xWall; x += 6) if (Math.abs(x) > 12) strip(x, zc, 3, 0.14, yellow);
    }
    this.asphalt = asphalt;
  }

  // wet ground: darken and smooth where the ORM's blue channel marks puddles;
  // the flashlight's highlight on them sells the rain.
  wetMaterial(m, amount) {
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev?.(sh, r);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <roughnessmap_pars_fragment>', `#include <roughnessmap_pars_fragment>
// puddles from two scales of the same map, so the pattern never visibly repeats
float wetMask(vec2 uv) {
  float a = texture2D(roughnessMap, uv).b;
  float b = texture2D(roughnessMap, uv * 0.37 + vec2(0.31, 0.17)).b;
  return min(a, b * 1.3);
}`)
        .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = roughness;
vec4 ormS = texture2D( roughnessMap, vRoughnessMapUv );
float wetP = wetG;
roughnessFactor = max(0.3, roughnessFactor * mix(ormS.g * 0.92, 0.3, wetP));
`)
        .replace('#include <normal_fragment_maps>', `
vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
mapN.xy *= normalScale * (1.0 - min(1.0, wetP * 1.4));
normal = normalize( tbn * mapN );`)
        .replace('#include <map_fragment>', `#include <map_fragment>
float wetG = smoothstep(0.25, 0.7, wetMask(vRoughnessMapUv)) * ${amount.toFixed(2)};
  diffuseColor.rgb *= mix(0.88, 0.72, wetG);`);
    };
    m.envMapIntensity = 0.4;
    return m;
  }

  // ---------------------------------------------------------- buildings --
  buildings() {
    const brick = withCutaway(dirtify(surface('brick'), 0.9));
    brick.name = 'brick';
    const brick2 = withCutaway(dirtify(surface('brick', 1, 0x8a8f96), 0.9));   // painted brick, grey
    brick2.name = 'brick2';
    const concrete = withCutaway(dirtify(surface('concrete', 1, 0x9a968c), 0.9));
    concrete.name = 'concrete_b';
    const roof = withCutaway(surface('roof'));
    roof.name = 'roof';
    this.wetMaterial(roof, 0.5);
    this.stoneMat = withCutaway(dirtify(surface('concrete', 1, 0xa9a69c), 0.9));
    const shutter = withCutaway(surface('shutter', 1, 0xc8c8c8));
    shutter.name = 'shutter';
    shutter.metalness = 0.5;
    this.shutterMat = shutter;
    this.roofMat = roof;
    const mats = [brick, brick2, concrete];
    this.faceList = [];
    this.wins = [];
    const lots = this.lots = buildLots();
    for (const lot of lots) {
      const { x0, x1, z0, z1, h } = lot;
      const mat = mats[lot.mat];
      const w = x1 - x0, d = z1 - z0;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const geo = worldBox(w, h, d, 2.2);
      const m = new THREE.Mesh(geo, [mat, mat, roof, mat, mat, mat]);
      m.position.set(cx, h / 2, cz);
      m.castShadow = true;
      m.receiveShadow = true;
      this.add(m);
      this.col.box(cx, cz, w / 2, d / 2, 0, h);
      // a concrete plinth round the foot, parapets round the roof
      const plinth = new THREE.Mesh(worldBox(w + 0.3, 1.0, d + 0.3, 1.5), concrete);
      plinth.position.set(cx, 0.5, cz);
      plinth.receiveShadow = true;
      this.add(plinth);
      for (const [px, pz, pw, pd] of [[cx, z0 + 0.15, w, 0.3], [cx, z1 - 0.15, w, 0.3], [x0 + 0.15, cz, 0.3, d], [x1 - 0.15, cz, 0.3, d]]) {
        const p = new THREE.Mesh(worldBox(pw, 0.7, pd, 1.5), concrete);
        p.position.set(px, h + 0.35, pz);
        this.add(p);
      }
      // the roof: air-conditioning, vents, a chimney, sometimes a water tower
      const rng = mulberry(Math.floor(Math.abs(x0) * 13 + Math.abs(z0) * 7 + 5));
      for (let i = 0; i < Math.floor(w * d / 90) + 1; i++) {
        const kind = rng();
        const o = prop(kind < 0.55 ? 'ac_unit' : kind < 0.8 ? 'roof_vent' : 'chimney');
        o.position.set(x0 + 2 + rng() * (w - 4), h, z0 + 2 + rng() * (d - 4));
        o.rotation.y = Math.floor(rng() * 4) * Math.PI / 2;
        o.traverse((c) => { if (c.isMesh) c.castShadow = false; });       // roofs are never seen from the street: nothing to shadow
        this.add(o);
      }
      if (h >= 9 && rng() < 0.7) {
        const t = prop('water_tank');
        t.position.set(x0 + 3 + rng() * (w - 6), h, z0 + 3 + rng() * (d - 6));
        t.rotation.y = rng() * 6;
        t.traverse((c) => { if (c.isMesh) c.castShadow = false; });
        this.add(t);
      }
      // which faces look at a street
      const faces = [];
      if (lot.side < 0) faces.push(['e', x1 + 0.02]); else faces.push(['w', x0 - 0.02]);
      if (lot.southCross) faces.push(['s', z1 + 0.02]);
      if (lot.northCross) faces.push(['n', z0 - 0.02]);
      for (const [f, p] of faces) {
        const len = f === 's' || f === 'n' ? w : d;
        this.faceList.push({ f, p, x0, x1, z0, z1, w, d, h, len, rng, alley: false });
      }
      // a neon sign on some of the fronts
      if (lot.r < 0.32 && h >= 8) {
        const words = [['PHARMACY', '#3dff8a', 5.5], ['LIQUOR', '#ff4040', 4.5], ['MOTEL', '#ff8a3a', 4.5], ['24 HR', '#6aa8ff', 3.5], ['DINER', '#ff5fb0', 4], ['CLINIC', '#7affd6', 4.5], ['PAWN', '#ffd34a', 3.5], ['HOTEL', '#ff7a4a', 4.5], ['BAR', '#8aa0ff', 3]];
        const [txt, col, sw] = words[Math.floor(lot.r * 1000) % words.length];
        const mm = new THREE.MeshBasicMaterial({ map: signTexture(txt, col), toneMapped: false, color: 0xffffff });
        const sgn = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw / 4), mm);
        sgn.position.set(lot.side < 0 ? x1 + 0.05 : x0 - 0.05, 4.2 + (lot.r * 40 % 1.2), (z0 + z1) / 2);
        sgn.rotation.y = lot.side < 0 ? Math.PI / 2 : -Math.PI / 2;
        this.add(sgn);
        this.flicker.push({ kind: 'sign', mat: mm, base: 1.6, phase: lot.r * 100 });
      }
    }
  }

  windowColor(wn, t) {
    const c = _wc;
    if (wn.lit === 'warm') {
      const f = wn.flick > 0.7 ? (Math.sin(t * 13 + wn.flick * 40) > 0.85 ? 0.3 : 1) : 1;
      return c.setRGB(1.0 * f, 0.62 * f, 0.32 * f).multiplyScalar(0.85);
    }
    if (wn.lit === 'tv') {
      const k = 0.35 + 0.35 * Math.sin(t * 7 + wn.flick * 20) * Math.sin(t * 3.1 + wn.flick * 9);
      return c.setRGB(0.35 * k + 0.15, 0.5 * k + 0.2, 0.9 * k + 0.25);
    }
    return c.setRGB(0.018, 0.022, 0.028);
  }

  // Static batching: every plain mesh that never moves is baked into world
  // space and merged per material, shadow flags and street chunk (so culling
  // still works along a long avenue).
  bake() {
    this.group.updateMatrixWorld(true);
    const skip = new Set();
    this.lampFx.forEach(({ cone, pool }) => { skip.add(cone); skip.add(pool); });
    const buckets = new Map();
    const victims = [];
    this.group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || skip.has(o) || Array.isArray(o.material) || o.userData.noMerge) return;
      let noMerge = false;
      for (let p = o.parent; p && p !== this.group; p = p.parent) if (p.userData.noMerge) { noMerge = true; break; }
      if (noMerge) return;
      const ch = chunkOf(o.matrixWorld.elements[14]);
      const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${ch}`;
      let g = o.geometry;
      g = g.index ? g.toNonIndexed() : g.clone();
      g.applyMatrix4(o.matrixWorld);
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, geos: [] });
      buckets.get(key).geos.push(g);
      victims.push(o);
    });
    for (const o of victims) o.parent.remove(o);
    let tris = 0;
    for (const b of buckets.values()) {
      const merged = mergeGeometries(b.geos, false);
      if (!merged) continue;
      const m = new THREE.Mesh(merged, b.mat);
      m.castShadow = b.cast;
      m.receiveShadow = b.recv;
      m.matrixAutoUpdate = false;
      this.group.add(m);
      tris += merged.attributes.position.count / 3;
    }
    this.baked = { meshes: victims.length, draws: buckets.size, tris };
  }

  // height of the walking surface: the sidewalks are a 15 cm slab with a
  // 40 cm ramp worth of curb, so feet never sink into it
  groundY(x, z) {
    let y = 0;
    for (const [x0, x1, z0, z1] of this.blocks) {
      const d = Math.min(x - x0, x1 - x, z - z0, z1 - z);
      if (d > 0) {
        const k = Math.min(1, d / 0.4);
        y = Math.max(y, 0.15 * k * k * (3 - 2 * k));
      }
    }
    return y;
  }

  // windows, cornices, string courses, shutters, doors, awnings, drainpipes
  // and fire escapes: real modules, instanced (per street chunk, so they cull)
  dressFacades() {
    const rotOf = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };
    const Q = new THREE.Quaternion();
    const Y = new THREE.Vector3(0, 1, 0);
    const mk = (x, y, z, ry, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), Q.clone().setFromAxisAngle(Y, ry), new THREE.Vector3(sx, sy, sz));
    const cut = new Map();
    const cutMat = (m) => {
      if (!cut.has(m.uuid)) { const c = m.clone(); c.name = m.name; cut.set(m.uuid, withCutaway(c)); }
      return cut.get(m.uuid);
    };
    const frames = [], boards = [], units = [], glass = [], corn = [], pipes = [], doors = [];
    const awnCols = ['#8c2a24', '#27496b', '#2f5a3a', '#7b5a24', '#5a2a5a'];
    for (const F of this.faceList) {
      const { f, p, x0, z0, w, d, h, len, rng } = F;
      const ry = rotOf[f];
      const at = (t, off = 0) => (f === 's' || f === 'n' ? [x0 + t * w + (f === 's' ? off : -off), p] : [p, z0 + t * d + (f === 'e' ? -off : off)]);
      const n = Math.floor(len / 2.6);
      for (let fl = 1; fl * 3.2 + 1.5 < h; fl++) {
        for (let i = 0; i < n; i++) {
          const [x, z] = at((i + 0.5) / n);
          const y = fl * 3.2 + 1.2;
          const r = rng(), r2 = rng();
          if (r2 < 0.12) { boards.push(mk(x, y, z, ry)); continue; }
          const ac = r2 < 0.19;
          (ac ? units : frames).push(mk(x, y, z, ry));
          glass.push(mk(x, y, z, ry));
          this.wins.push({ x, y, z, ry, lit: r < 0.07 ? 'warm' : r < 0.1 ? 'tv' : 'dark', flick: rng() });
        }
      }
      // the roof line is a dentilled cornice; each floor is marked by a stone band
      for (let k = 0; k < len; k++) {
        const [x, z] = at((k + 0.5) / len);
        corn.push(mk(x, h - 0.28, z, ry));
      }
      for (let fl = 1; fl * 3.2 < h - 0.6; fl++) {
        const [bx, bz] = at(0.5);
        const band = new THREE.Mesh(f === 's' || f === 'n' ? new THREE.BoxGeometry(len, 0.2, 0.22) : new THREE.BoxGeometry(0.22, 0.2, len), this.stoneMat);
        band.position.set(bx + Math.sin(ry) * 0.09, fl * 3.2 - 0.1, bz + Math.cos(ry) * 0.09);
        band.castShadow = false; band.receiveShadow = true;
        this.add(band);
      }
      // ground floor: a shuttered shop, a door, maybe an awning, a downpipe or two
      const shopN = Math.max(1, Math.floor(len / 7));
      for (let i = 0; i < shopN; i++) {
        const t = (i + 0.5) / shopN;
        const [x, z] = at(t);
        const sh = new THREE.Mesh(tiled(new THREE.PlaneGeometry(4.6, 2.8), 2, 1), this.shutterMat);
        sh.position.set(x + Math.sin(ry) * 0.03, 1.65, z + Math.cos(ry) * 0.03);
        sh.rotation.y = ry;
        sh.receiveShadow = true;
        this.add(sh);
        const [dx, dz] = at(t, 3.3);
        if (t + 3.3 / len < 0.97) doors.push(mk(dx, 0.15, dz, ry));
        if (rng() < 0.7) {
          const a = prop('awning');
          a.position.set(x, 0.15, z);
          a.rotation.y = ry;
          const am = awningMaterial(awnCols[(rng() * awnCols.length) | 0]);
          a.traverse((c) => { if (c.isMesh) { c.material = am; c.castShadow = false; } });
          this.add(a);
        }
      }
      for (const t of [0.5 / len + 0.01, 1 - 0.5 / len - 0.01]) {
        if (rng() < 0.45 && h >= 7) { const [x, z] = at(t); pipes.push(mk(x, 0.15, z, ry, 1, h / 7, 1)); }
      }
      if (h > 9 && rng() < 0.3) {
        const [x, z] = at(0.5);
        const g = prop('fire_escape');
        g.position.set(x, 0.15, z);
        g.rotation.y = ry;
        g.traverse((c) => { if (c.isMesh) c.castShadow = false; });
        this.add(g);
      }
    }
    // chunked instancing: each street chunk is its own InstancedMesh so it can be culled
    const split = (mats) => {
      const m = new Map();
      mats.forEach((mt, i) => { const c = chunkOf(mt.elements[14]); if (!m.has(c)) m.set(c, []); m.get(c).push(i); });
      return m;
    };
    const add = (name, mats, shadow = false) => {
      for (const idx of split(mats).values()) this.add(instanced(name, idx.map((i) => mats[i]), { shadow, map: cutMat, cull: true }));
    };
    add('win_frame', frames); add('win_boarded', boards); add('win_ac', units); add('cornice', corn); add('door_shop', doors); add('drainpipe', pipes);
    this.windows = [];
    for (const idx of split(glass).values()) {
      const gl = instanced('win_glass', idx.map((i) => glass[i]), { map: cutMat, cull: true });
      const im = gl.children[0];
      const list = idx.map((i) => this.wins[i]);
      list.forEach((wn, k) => im.setColorAt(k, this.windowColor(wn, 0)));
      im.instanceColor.needsUpdate = true;
      this.add(gl);
      const lit = []; list.forEach((wn, k) => { if (wn.lit !== 'dark') lit.push(k); });
      this.windows.push({ mesh: im, list, lit, z: list[0].z });
    }
  }

  // --------------------------------------------------- street furniture --
  // Lamps, trees, benches, bins and the rest, on the sidewalks only. The road
  // stays clear: it is the level.
  streetFurniture() {
    const place = (name, x, z, ry = 0, colR = null, colBox = null, h = 1.2) => {
      const o = prop(name);
      o.position.set(x, this.groundY(x, z), z);
      o.rotation.y = ry;
      if (name !== 'street_tree') o.traverse((c) => { if (c.isMesh) c.castShadow = false; });
      this.add(o);
      if (colR) this.col.circle(x, z, colR, h);
      if (colBox) this.col.box(x, z, colBox[0], colBox[1], -ry, h);
      return o;
    };
    this.place = place;
    const lamps = lampSites();
    for (const { x, z, ry } of lamps) {
      place('streetlight', x, z, ry, 0.18, null, 6);
      const hx = x + Math.cos(ry) * 1.9, hz = z - Math.sin(ry) * 1.9;
      this.lampSpots.push({ x: hx, y: 5.95, z: hz, broken: mulberry(Math.floor(z * 7) + 3)() < 0.22, phase: (z * 1.7) % 10 });
    }
    const rng = mulberry(909);
    const nearLamp = (z) => lamps.some((l) => Math.abs(l.z - z) < 2.5);
    for (const [zN, zS] of blockRanges()) {
      for (let z = zS - 3; z > zN + 2; z -= 5 + rng() * 5) {
        if (nearLamp(z) || L.gate.some((g) => Math.abs(g - z) < 6)) continue;
        for (const side of [-1, 1]) {
          const r = rng();
          if (r > 0.55) continue;
          const x = side * (7.7 + rng() * 0.8);
          const face = side < 0 ? faceTo(1, 0) : faceTo(-1, 0);
          if (r < 0.14) place('street_tree', x, z, rng() * 6, 0.28, null, 4).scale.setScalar(0.95 + rng() * 0.3);
          else if (r < 0.26) place('trash_bin', x, z, rng() * 6, 0.32, null, 1.1);
          else if (r < 0.34) place('bench', x, z, face, null, [0.9, 0.28], 0.6);
          else if (r < 0.40) place('hydrant', x, z, 0, 0.2, null, 0.8);
          else if (r < 0.46) place('mailbox', x, z, face, null, [0.25, 0.25], 1.2);
          else if (r < 0.50) place('news_box', x, z, face, null, [0.22, 0.2], 0.9);
          else place('parking_meter', x, z, face, 0.08, null, 1.4);
        }
      }
    }
  }

  // street ends are sealed; the dead come in from them (fallback spawn points)
  edges() {
    const b = this.bounds, midZ = (b.minZ + b.maxZ) / 2, len = (b.maxZ - b.minZ) / 2 + 4;
    this.col.box(0, b.minZ - 1, 80, 1, 0, 3);
    this.col.box(0, b.maxZ + 1, 80, 1, 0, 3);
    this.col.box(b.minX - 1, midZ, 1, len, 0, 3);
    this.col.box(b.maxX + 1, midZ, 1, len, 0, 3);
    this.spawns = [{ x: -3, z: b.maxZ - 2 }, { x: 3, z: b.maxZ - 2 }];
    for (const zc of L.cross) this.spawns.push({ x: b.minX + 1.5, z: zc - 1.5 }, { x: b.minX + 1.5, z: zc + 1.5 }, { x: b.maxX - 1.5, z: zc - 1.5 }, { x: b.maxX - 1.5, z: zc + 1.5 });
  }

  // ------------------------------------------------------------ gates --
  openGate(k, instant = false) {
    const g = this.gates[k];
    if (!g || g.open) return;
    g.open = true;
    for (const c of g.cols) { this.col.remove(c); this.nav?.rebuildAround(c); }
    g.t = instant ? 1 : 0;
    g.instant = instant;
    this.onGate?.(k, instant);
  }

  // ----------------------------------------------------------- lighting --
  lights() {
    const s = this.scene;
    const hemi = new THREE.HemisphereLight(0x5f759b, 0x1a1a1f, 1.7);
    s.add(hemi);
    const moon = new THREE.DirectionalLight(0x9db6dc, 1.5);
    this.moonBase = 1.5;
    moon.castShadow = Q.moonShadow > 0;
    if (Q.moonShadow > 0) moon.shadow.mapSize.set(Q.moonShadow, Q.moonShadow);
    const msc = moon.shadow.camera;
    const R = Q.moonRange;
    msc.left = -R; msc.right = R; msc.top = R; msc.bottom = -R; msc.near = 1; msc.far = 70;
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.05;
    s.add(moon.target);
    moon.position.set(-20, 40, -10);
    s.add(moon);
    this.moon = moon;
    // A FIXED pool of point lights handed to whatever is nearest the camera (never add or remove
    // lights at runtime: that recompiles every shader). Every light is paid for on every lit pixel,
    // so there are few: two lamps, and two "event" lights shared by fires, flares and police cars.
    this.lampPool = [];
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xffa860, 0, 18, 1.5);
      s.add(l);
      this.lampPool.push(l);
    }
    this.firePool = [];
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xff7a2a, 0, 14, 1.5);
      s.add(l);
      this.firePool.push(l);
    }
    // fake volumetrics: lamp cones and ground pools (cheap, everywhere)
    const coneMat = new THREE.MeshBasicMaterial({ map: tex('tex/cone.webp'), color: 0xffb070, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const poolMat = new THREE.MeshBasicMaterial({ map: tex('tex/soft.webp'), color: 0xffa050, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lampFx = [];
    for (const Lm of this.lampSpots) {
      if (Lm.nofx) continue;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5.9, 20, 1, true), coneMat.clone());
      cone.position.set(Lm.x, Lm.y - 2.95, Lm.z);
      this.add(cone);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), poolMat.clone());
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(Lm.x, 0.03, Lm.z);
      this.add(pool);
      this.lampFx.push({ cone, pool, L: Lm });
    }
  }

  // ------------------------------------------------------------- update --
  update(t, dt, focus, wind) {
    // the moon's shadow map rides with the survivors
    this.moon.position.set(focus.x - 22, 30, focus.z - 12);
    this.moon.target.position.set(focus.x, 0, focus.z);
    // street lamps: the nearest ones get real light; broken ones stutter
    const nearest = (list, k, out) => {
      out.length = 0;
      for (const it of list) {
        const d = ((it.x - focus.x) ** 2 + (it.z - focus.z) ** 2) * (it.police ? 0.4 : 1);   // a police car's lights win over a barrel at the same distance
        let i = out.length;
        if (i === k && d >= out[i - 1].d) continue;
        if (i < k) out.push(null); else i = k - 1;
        while (i > 0 && out[i - 1].d > d) { out[i] = out[i - 1]; i--; }
        out[i] = { it, d };
      }
      return out;
    };
    const nl = nearest(this.lampSpots, this.lampPool.length, this._nl ??= []);
    this.lampPool.forEach((l, k) => {
      const n = nl[k];
      if (!n) { l.intensity = 0; return; }
      l.position.set(n.it.x, n.it.y - 0.3, n.it.z);
      l.intensity = 85 * (n.it.power ?? 1) * this.lampLevel(n.it, t);
    });
    for (const { cone, pool, L: Lm } of this.lampFx) {
      const far = Math.abs(Lm.z - focus.z) > 40;
      cone.visible = pool.visible = !far;
      if (far) continue;
      const k = this.lampLevel(Lm, t);
      cone.material.opacity = 0.075 * k;
      pool.material.opacity = 0.2 * k;
    }
    const lampMat = propMaterial('lamp');
    if (lampMat) lampMat.emissiveIntensity = 5;
    // fires, flares and police cars: the two nearest light the street
    const ph = (t * 2.2) % 1;
    const red = ph < 0.5;
    const flash = (ph % 0.5) < 0.12 || ((ph % 0.5) > 0.2 && (ph % 0.5) < 0.3) ? 1 : 0.15;
    const nf = nearest(this.events, this.firePool.length, this._nf ??= []);
    this.firePool.forEach((l, k) => {
      const n = nf[k];
      if (!n) { l.intensity = 0; return; }
      const f = n.it;
      if (f.police) {
        l.position.set(f.x, 2.2, f.z);
        l.color.set(red ? 0xff1a14 : 0x1f4dff);
        l.intensity = 30 * flash;
      } else {
        const fl = 0.75 + 0.15 * Math.sin(t * 17 + f.phase) + 0.1 * Math.sin(t * 31.7 + f.phase * 2) + 0.08 * Math.sin(t * 5.3);
        l.position.set(f.x + Math.sin(t * 9) * 0.08, f.y + 0.6, f.z + Math.cos(t * 7) * 0.08);
        l.color.set(f.color ?? 0xff7a2a);
        l.intensity = 42 * fl * f.size;
      }
    });
    const r = propMaterial('lightbar_red'), b = propMaterial('lightbar_blue');
    if (r) r.emissiveIntensity = red ? 8 * flash : 0.2;
    if (b) b.emissiveIntensity = red ? 0.2 : 8 * flash;
    // signs
    for (const f of this.flicker) {
      const glitch = Math.sin(t * 23 + f.phase * 7) > 0.96 || (Math.sin(t * 0.7 + f.phase) > 0.9 && Math.sin(t * 40) > 0);
      f.mat.color.setScalar(glitch ? 0.15 : f.base);
    }
    // windows: only the chunks near the survivors are re-coloured
    if (Math.floor(t * 6) !== this._wt) {
      this._wt = Math.floor(t * 6);
      for (const w of this.windows) {
        if (Math.abs(w.z - focus.z) > CH * 2.2 || !w.lit.length) continue;
        for (const k of w.lit) w.mesh.setColorAt(k, this.windowColor(w.list[k], t));
        w.mesh.instanceColor.needsUpdate = true;
      }
    }
    // gates: the leaves slide into the walls
    for (const g of this.gates) {
      if (g.open && g.t < 1) {
        g.t = Math.min(1, g.t + dt / 2.2);
        const k = g.t * g.t * (3 - 2 * g.t);
        g.leaves.forEach((lf, i) => { lf.position.x = lf.userData.x0 + (i ? 1 : -1) * 9.4 * k; });
        if (g.t >= 1) g.onDone?.();
      }
      g.beacon?.material.color.set(g.open ? 0x20ff60 : 0xff2a1a);
      if (g.beacon) g.beacon.material.opacity = g.open ? 1 : 0.55 + 0.45 * (Math.sin(t * 5 + g.z) > 0 ? 1 : 0.2);
    }
  }

  lampLevel(L, t) {
    if (!L.broken) return 1;
    const a = Math.sin(t * 1.3 + L.phase) + Math.sin(t * 7.7 + L.phase * 3) * 0.5;
    if (a > 1.1) return Math.sin(t * 60) > 0 ? 0.2 : 0.9;
    return a > 0.7 ? 0.05 : 0.95;
  }
}

export { mulberry };
