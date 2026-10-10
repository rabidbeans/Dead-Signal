// Level geometry, lights, colliders and the navigation field.
//
// World frame: x east, y up, z south (toward the camera). Metres.
import * as THREE from 'three';
import { prop, surface, tex, propMaterial } from './assets.js';

// ---------------------------------------------------------------- shapes --
// Colliders are 2D in the ground plane: oriented boxes and circles.
export class Colliders {
  constructor() { this.boxes = []; this.circles = []; }
  box(cx, cz, hw, hd, rot = 0, h = 3, tag = 'solid') {
    const c = Math.cos(rot), s = Math.sin(rot);
    this.boxes.push({ cx, cz, hw, hd, c, s, h, tag });
  }
  circle(x, z, r, h = 1, tag = 'solid') { this.circles.push({ x, z, r, h, tag }); }

  // push a circle (x, z, r) out of everything; returns corrected {x, z}
  resolve(x, z, r) {
    for (const b of this.boxes) {
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
    for (const c of this.circles) {
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
    let best = maxD, nx = 0, nz = 0;
    for (const b of this.boxes) {
      if (b.h < 0.9) continue;    // bullets fly over curbs, sandbags and barriers
      const rx = ox - b.cx, rz = oz - b.cz;
      const lox = rx * b.c + rz * b.s, loz = -rx * b.s + rz * b.c;
      const ldx = dx * b.c + dz * b.s, ldz = -dx * b.s + dz * b.c;
      let tmin = -Infinity, tmax = Infinity, axis = -1, sgn = 0, miss = false;
      const slabs = [[lox, ldx, b.hw, 0], [loz, ldz, b.hd, 1]];
      for (const [o, d, h, a] of slabs) {
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
    for (const c of this.circles) {
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

// ------------------------------------------------------- navigation grid --
// A distance field from the players over a 0.5 m grid; zombies walk down
// its gradient, so they path around cars and barricades as a horde.
export class NavField {
  constructor(minX, minZ, maxX, maxZ, cell, colliders) {
    this.minX = minX; this.minZ = minZ; this.cell = cell;
    this.w = Math.ceil((maxX - minX) / cell); this.h = Math.ceil((maxZ - minZ) / cell);
    this.block = new Uint8Array(this.w * this.h);
    this.dist = new Float32Array(this.w * this.h).fill(1e9);
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const x = minX + (i + 0.5) * cell, z = minZ + (j + 0.5) * cell;
        const p = colliders.resolve(x, z, 0.32);
        if (Math.abs(p.x - x) + Math.abs(p.z - z) > 1e-4) this.block[j * this.w + i] = 1;
      }
    }
    this.queue = new Int32Array(this.w * this.h * 4);
  }

  idx(x, z) {
    const i = Math.floor((x - this.minX) / this.cell), j = Math.floor((z - this.minZ) / this.cell);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }

  // Dijkstra-lite (two-pass BFS with diagonals approximated by a deque)
  build(targets) {
    const D = this.dist, W = this.w, H = this.h, B = this.block, Q = this.queue;
    D.fill(1e9);
    let head = 0, tail = 0;
    for (const t of targets) {
      const k = this.idx(t.x, t.z);
      if (k >= 0) { D[k] = 0; Q[tail++] = k; }
    }
    const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [-1, -1, 1.414]];
    while (head < tail) {
      const k = Q[head++];
      if (head >= Q.length) break;
      const i = k % W, j = (k / W) | 0;
      const d0 = D[k];
      for (const [di, dj, c] of nb) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const nk = nj * W + ni;
        if (B[nk]) continue;
        if (di && dj && (B[j * W + ni] || B[nj * W + i])) continue;   // no corner cutting
        const nd = d0 + c;
        if (nd < D[nk] - 1e-3) { D[nk] = nd; if (tail < Q.length) Q[tail++] = nk; }
      }
    }
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
float bayer4(vec2 p){ ivec2 q = ivec2(mod(p, 4.0)); int i = q.x + q.y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.); return m[i] / 16.; }`)
      .replace('void main() {', `void main() {
  for (int i = 0; i < 4; i++) {
    vec4 P = uPlayers[i];
    if (P.w <= 0.0) continue;
    vec2 d = (gl_FragCoord.xy - P.xy) / uRes.y;
    float r = length(d) / P.w;
    if (gl_FragCoord.z < P.z && r < 1.0) {
      if (smoothstep(0.6, 1.0, r) < bayer4(gl_FragCoord.xy)) discard;
    }
  }`);
  };
  m.customProgramCacheKey = () => 'cut' + (m.name || '');
  return m;
}

function signTexture(text, color, bg = '#060606', w = 512, h = 128) {
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
export class World {
  constructor(scene) {
    this.scene = scene;
    this.col = new Colliders();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.flicker = [];          // lights and emissives that misbehave
    this.lampSpots = [];        // positions of street lamps (for the light pool)
    this.fires = [];
    this.police = [];
    this.windows = null;
    this.bounds = { minX: -34, maxX: 34, minZ: -42, maxZ: 34 };
    this.spawns = [];
    this.build();
  }

  add(o) { this.group.add(o); return o; }

  build() {
    this.ground();
    this.buildings();
    this.streetFurniture();
    this.checkpoint();
    this.wrecks();
    this.edges();
    this.lights();
    this.nav = new NavField(this.bounds.minX - 6, this.bounds.minZ - 8, this.bounds.maxX + 6, this.bounds.maxZ + 8, 0.5, this.col);
  }

  // ------------------------------------------------------------ ground --
  ground() {
    const asphalt = withCutaway(surface('asphalt'));
    asphalt.name = 'asphalt';
    this.wetMaterial(asphalt, 0.9);
    const size = 200;
    const g = new THREE.PlaneGeometry(size, size);
    tiled(g, size / 4, size / 4);
    const road = new THREE.Mesh(g, asphalt);
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    this.add(road);

    // sidewalks: raised slabs with concrete curbs, around each block
    const walk = surface('sidewalk');
    walk.name = 'sidewalk';
    this.wetMaterial(walk, 0.6);
    const curbMat = surface('concrete');
    const blocks = this.blocks = [
      // [minX, maxX, minZ, maxZ] of the land between the streets (incl. sidewalk)
      [-80, -7, -80, -6], [7, 80, -80, -6], [-80, -7, 6, 80], [7, 80, 6, 80],
    ];
    for (const [x0, x1, z0, z1] of blocks) {
      const w = x1 - x0, d = z1 - z0;
      const slab = new THREE.Mesh(worldBox(w, 0.15, d, 3), [walk, walk, walk, walk, walk, walk]);
      slab.position.set((x0 + x1) / 2, 0.075, (z0 + z1) / 2);
      slab.receiveShadow = true;
      this.add(slab);
      // curb edge strip (a lip of cast concrete along the street sides)
      const edges = [];
      if (x0 > -79) edges.push([x0 + 0.12, (z0 + z1) / 2, 0.24, d]);
      if (x1 < 79) edges.push([x1 - 0.12, (z0 + z1) / 2, 0.24, d]);
      if (z0 > -79) edges.push([(x0 + x1) / 2, z0 + 0.12, w, 0.24]);
      if (z1 < 79) edges.push([(x0 + x1) / 2, z1 - 0.12, w, 0.24]);
      for (const [cx, cz, ew, ed] of edges) {
        const c = new THREE.Mesh(worldBox(ew, 0.17, ed, 1.5), curbMat);
        c.position.set(cx, 0.085, cz);
        c.receiveShadow = true;
        this.add(c);
      }
    }
    // road markings: dashed centre lines, stop lines, crosswalks
    const paint = new THREE.MeshStandardMaterial({
      color: 0x77746a, roughness: 0.75, transparent: true, opacity: 0.5, envMapIntensity: 0.1,
      alphaMap: tex('tex/concrete_albedo.webp', { srgb: false, repeat: true }),
      polygonOffset: true, polygonOffsetFactor: -2,
    });
    const yellow = paint.clone();
    yellow.color.set(0xa88a2a);
    const marks = [];
    const strip = (x, z, w, d, m) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
      p.rotation.x = -Math.PI / 2;
      p.position.set(x, 0.012, z);
      p.receiveShadow = true;
      marks.push(p);
    };
    for (let z = -80; z < 80; z += 6) if (Math.abs(z) > 9) { strip(-0.12, z, 0.12, 3, yellow); strip(0.12, z, 0.12, 3, yellow); }
    for (let x = -80; x < 80; x += 6) if (Math.abs(x) > 10) strip(x, 0, 3, 0.14, yellow);
    for (let z = -80; z < 80; z += 4.5) if (Math.abs(z) > 10) { strip(-3.5, z, 0.12, 2, paint); strip(3.5, z, 0.12, 2, paint); }
    // crosswalks at the four mouths of the intersection
    for (const [cx, cz, along] of [[0, -8.2, 'x'], [0, 8.2, 'x'], [-8.6, 0, 'z'], [8.6, 0, 'z']]) {
      for (let k = -5; k <= 5; k++) {
        if (along === 'x') strip(cx + k * 1.2, cz, 0.55, 2.6, paint);
        else strip(cx, cz + k * 1.05, 2.6, 0.5, paint);
      }
    }
    marks.forEach((m) => this.add(m));
    this.asphalt = asphalt;
  }

  // wet ground: darken and smooth where the ORM's blue channel marks puddles;
  // the flashlight's highlight on them sells the rain.
  wetMaterial(m, amount) {
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev?.(sh, r);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = roughness;
vec4 ormS = texture2D( roughnessMap, vRoughnessMapUv );
float wetP = smoothstep(0.25, 0.7, ormS.b) * ${amount.toFixed(2)};
roughnessFactor = max(0.3, roughnessFactor * mix(ormS.g * 0.92, 0.3, wetP));
`)
        .replace('#include <normal_fragment_maps>', `
vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
mapN.xy *= normalScale * (1.0 - min(1.0, wetP * 1.4));
normal = normalize( tbn * mapN );`)
        .replace('#include <map_fragment>', `#include <map_fragment>
{ vec4 o = texture2D( roughnessMap, vRoughnessMapUv ); float w = smoothstep(0.25, 0.7, o.b) * ${amount.toFixed(2)};
  diffuseColor.rgb *= mix(0.8, 0.6, w); }`);
    };
    m.envMapIntensity = 0.55;
    return m;
  }

  // ---------------------------------------------------------- buildings --
  buildings() {
    const brick = withCutaway(surface('brick'));
    brick.name = 'brick';
    const brick2 = withCutaway(surface('brick', 1, 0x8a8f96));   // painted brick, grey
    brick2.name = 'brick2';
    const concrete = withCutaway(surface('concrete', 1, 0x9a968c));
    concrete.name = 'concrete_b';
    const roof = withCutaway(surface('roof'));
    roof.name = 'roof';
    this.wetMaterial(roof, 0.5);
    const shutter = withCutaway(surface('metal', 1, 0x5a5a58));
    shutter.name = 'shutter';
    shutter.metalness = 0.5;
    this.roofMat = roof;
    // [x0, x1, z0, z1, height, material]
    const B = [
      // north-west block
      [-34, -20, -40, -9, 13, brick], [-20, -9, -24, -9, 10, concrete], [-20, -9, -40, -26.5, 15, brick2],
      // north-east block (the alley runs between the two at x = 19..22)
      [9, 19, -40, -9, 12, brick2], [22, 36, -22, -9, 9, brick], [22, 36, -40, -24, 14, concrete],
      // south-west block (kept low: it sits between the camera and the street)
      [-34, -21, 9, 34, 7, brick], [-21, -9, 9, 20, 6, brick2], [-21, -9, 22, 34, 8, concrete],
      // south-east block: a gas station forecourt, then shops
      [21, 36, 9, 34, 7, brick], [9, 21, 24, 34, 6, concrete],
    ];
    const winGeo = new THREE.PlaneGeometry(1.1, 1.5);
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true });
    const wins = [];
    for (const [x0, x1, z0, z1, h, mat] of B) {
      const w = x1 - x0, d = z1 - z0;
      const geo = worldBox(w, h, d, 2.2);
      const m = new THREE.Mesh(geo, [mat, mat, roof, mat, mat, mat]);
      m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
      m.castShadow = true;
      m.receiveShadow = true;
      this.add(m);
      this.col.box((x0 + x1) / 2, (z0 + z1) / 2, w / 2, d / 2, 0, h);
      // parapet
      const pm = concrete;
      for (const [px, pz, pw, pd] of [[(x0 + x1) / 2, z0 + 0.15, w, 0.3], [(x0 + x1) / 2, z1 - 0.15, w, 0.3], [x0 + 0.15, (z0 + z1) / 2, 0.3, d], [x1 - 0.15, (z0 + z1) / 2, 0.3, d]]) {
        const p = new THREE.Mesh(worldBox(pw, 0.7, pd, 1.5), pm);
        p.position.set(px, h + 0.35, pz);
        p.castShadow = true;
        this.add(p);
      }
      // rooftop clutter
      const rng = mulberry(Math.floor(x0 * 13 + z0 * 7));
      for (let i = 0; i < Math.floor(w * d / 90) + 1; i++) {
        const ac = prop('ac_unit');
        ac.position.set(x0 + 2 + rng() * (w - 4), h, z0 + 2 + rng() * (d - 4));
        ac.rotation.y = Math.floor(rng() * 4) * Math.PI / 2;
        this.add(ac);
      }
      // windows on every face that looks at a street
      const faces = [];
      if (z1 <= -8) faces.push(['s', z1 + 0.02]);
      if (z0 >= 8) faces.push(['n', z0 - 0.02]);
      if (x1 <= -8) faces.push(['e', x1 + 0.02]);
      if (x0 >= 8) faces.push(['w', x0 - 0.02]);
      if (x1 === 19) faces.push(['e', x1 + 0.02]);
      if (x0 === 22) faces.push(['w', x0 - 0.02]);
      for (const [f, p] of faces) {
        const len = f === 's' || f === 'n' ? w : d;
        const n = Math.floor(len / 2.6);
        for (let fl = 1; fl * 3.2 + 1.5 < h; fl++) {
          for (let i = 0; i < n; i++) {
            const t = (i + 0.5) / n;
            const y = fl * 3.2 + 1.2;
            let x, z, ry;
            if (f === 's') { x = x0 + t * w; z = p; ry = 0; }
            if (f === 'n') { x = x0 + t * w; z = p; ry = Math.PI; }
            if (f === 'e') { x = p; z = z0 + t * d; ry = Math.PI / 2; }
            if (f === 'w') { x = p; z = z0 + t * d; ry = -Math.PI / 2; }
            const r = rng();
            const lit = r < 0.07 ? 'warm' : r < 0.1 ? 'tv' : 'dark';
            wins.push({ x, y, z, ry, lit, flick: rng() });
          }
        }
        // ground floor: shuttered storefronts and a few signs
        const shopN = Math.max(1, Math.floor(len / 7));
        for (let i = 0; i < shopN; i++) {
          const t = (i + 0.5) / shopN;
          const sh = new THREE.Mesh(tiled(new THREE.PlaneGeometry(4.6, 2.8), 2, 1), shutter);
          sh.position.y = 1.55;
          if (f === 's') sh.position.set(x0 + t * w, 1.55, p + 0.01);
          if (f === 'n') { sh.position.set(x0 + t * w, 1.55, p - 0.01); sh.rotation.y = Math.PI; }
          if (f === 'e') { sh.position.set(p + 0.01, 1.55, z0 + t * d); sh.rotation.y = Math.PI / 2; }
          if (f === 'w') { sh.position.set(p - 0.01, 1.55, z0 + t * d); sh.rotation.y = -Math.PI / 2; }
          sh.receiveShadow = true;
          this.add(sh);
        }
      }
    }
    // the windows: one instanced draw; colours are animated (flicker / TV)
    const im = new THREE.InstancedMesh(winGeo, winMat, wins.length);
    const dummy = new THREE.Object3D();
    wins.forEach((wn, i) => {
      dummy.position.set(wn.x, wn.y, wn.z);
      dummy.rotation.set(0, wn.ry, 0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      im.setColorAt(i, this.windowColor(wn, 0));
    });
    im.instanceColor.needsUpdate = true;
    this.add(im);
    this.windows = { mesh: im, list: wins };
    // signs that still have power
    const signs = [
      ['PHARMACY', '#3dff8a', -9.05, 4.6, -15, Math.PI / 2, 5.5],
      ['LIQUOR', '#ff4040', 8.95, 4.4, -16, -Math.PI / 2, 4.5],
      ['MOTEL', '#ff8a3a', 21.95, 5.5, -16, -Math.PI / 2, 4.5],
      ['24 HR', '#6aa8ff', 15, 4.2, 23.95, Math.PI, 3.5],
    ];
    for (const [txt, col, x, y, z, ry, w] of signs) {
      const m = new THREE.MeshBasicMaterial({ map: signTexture(txt, col), toneMapped: false, color: 0xffffff });
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), m);
      s.position.set(x, y, z);
      s.rotation.y = ry;
      this.add(s);
      this.flicker.push({ kind: 'sign', mat: m, base: 1.6, phase: Math.random() * 10 });
    }
  }

  windowColor(wn, t) {
    const c = new THREE.Color();
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

  // --------------------------------------------------- street furniture --
  streetFurniture() {
    const place = (name, x, z, ry = 0, colR = null, colBox = null, h = 1.2) => {
      const o = prop(name);
      o.position.set(x, 0, z);
      o.rotation.y = ry;
      this.add(o);
      if (colR) this.col.circle(x, z, colR, h);
      if (colBox) this.col.box(x, z, colBox[0], colBox[1], -ry, h);
      return o;
    };
    // street lamps along both streets
    const lamps = [[-7.6, -16, 0], [7.6, -28, Math.PI], [-7.6, 18, 0], [7.6, 26, Math.PI], [-18, -6.6, -Math.PI / 2], [20, 6.6, Math.PI / 2], [-28, 6.6, Math.PI / 2], [30, -6.6, -Math.PI / 2]];
    for (const [x, z, ry] of lamps) {
      place('streetlight', x, z, ry, 0.18, null, 6);
      // the lamp head sits 1.9 m along the arm (local +x in Blender = +x here)
      const hx = x + Math.cos(ry) * 1.9, hz = z - Math.sin(ry) * 1.9;
      this.lampSpots.push({ x: hx, y: 5.95, z: hz, broken: Math.random() < 0.25, phase: Math.random() * 10 });
    }
    // hydrants, dumpsters, trash
    place('hydrant', -8.2, -9.5, 0, 0.2, null, 0.8);
    place('hydrant', 8.4, 12, 0, 0.2, null, 0.8);
    place('dumpster', 20.5, -18, Math.PI / 2, null, [0.95, 0.8], 1.3);
    place('dumpster', 20.5, -30, Math.PI / 2 + 0.2, null, [0.95, 0.8], 1.3);
    const trash = [[19.6, -15.5], [21.3, -16], [20.2, -21], [-9.4, -12], [-9.8, -12.8], [9.6, 16.5], [10.2, 17.2], [-12, 9.8], [21.5, -26]];
    trash.forEach(([x, z], i) => place(i % 2 ? 'trash_a' : 'trash_b', x, z, i * 1.7, 0.3, null, 0.5));
    place('rubble', -12.5, -9.3, 0.3);
    place('rubble', 26, 8.5, 1.3);
    place('cone', -3, 11, 0, null, null);
    place('cone', -1.6, 12.2, 0.4, null, null);
    place('cone', 4.5, -12.5, 0.4, null, null);
    // paper litter (wind will push some of it around)
    const pm = new THREE.MeshStandardMaterial({ map: tex('tex/paper.webp'), transparent: true, alphaTest: 0.3, roughness: 0.9, side: THREE.DoubleSide });
    this.papers = [];
    for (let i = 0; i < 26; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.36), pm);
      p.rotation.x = -Math.PI / 2;
      p.rotation.z = Math.random() * 6.28;
      p.position.set((Math.random() - 0.5) * 50, 0.02, (Math.random() - 0.5) * 50);
      p.receiveShadow = true;
      this.add(p);
      this.papers.push({ m: p, vx: 0, vz: 0, vy: 0, spin: 0 });
    }
  }

  // ---------------------------------------------------------- checkpoint --
  checkpoint() {
    // police roadblock across the north mouth, sandbags at the centre
    const put = (name, x, z, ry) => { const o = prop(name); o.position.set(x, 0, z); o.rotation.y = ry; this.add(o); return o; };
    const pol = put('car_police', -2.5, -10.5, 0.35);
    this.col.box(-2.5, -10.5, 2.45, 0.95, -0.35, 1.5);
    this.police.push({ obj: pol, x: -2.5, z: -10.5 });
    for (const [x, z, ry] of [[3.8, -11.5, 0.1], [-6, -14, 1.5], [12, 4.2, 0], [15.2, 4.2, 0], [-12, -4.4, 0.05]]) {
      put('barrier', x, z, ry);
      this.col.box(x, z, 0.3, 1.5, -ry, 0.81, 'low');
    }
    const sb = put('sandbags', 0, 3.4, 0);
    // sandbag wall: an arc of radius 3.2 m, chest high -> a row of circles
    for (let a = -28; a <= 28; a += 7) {
      const r = a * Math.PI / 180;
      this.col.circle(Math.sin(r) * 3.2, 3.4 + Math.cos(r) * 3.2 - 3.2, 0.4, 0.62, 'low');
    }
    put('sawhorse', -9, 9.2, 0.0);
    this.col.box(-9, 9.2, 1.0, 0.18, 0, 1, 'low');
    put('sawhorse', 6.5, -18, 0.3);
    this.col.box(6.5, -18, 1.0, 0.18, -0.3, 1, 'low');
    // fire barrels: the warm light at the centre of the cold scene
    for (const [x, z] of [[-4.2, 1.2], [5.6, -6.5]]) {
      put('barrel', x, z, 0);
      this.col.circle(x, z, 0.32, 0.9);
      this.fires.push({ x, y: 0.95, z, phase: Math.random() * 10, size: 1 });
    }
  }

  wrecks() {
    const cars = [
      ['car_wreck', 5.2, -25, 2.6], ['car_sedan', -4.4, -33, -0.1], ['car_sedan', 4.0, 21, Math.PI + 0.05],
      ['car_wreck', -4.5, 25.5, 0.4], ['car_sedan', 17, -2.6, Math.PI / 2 + 0.05], ['car_wreck', -19, 2.5, -Math.PI / 2 + 0.5],
      ['car_sedan', 27.5, 2.9, Math.PI / 2], ['car_sedan', -27, -2.8, -Math.PI / 2 - 0.08],
    ];
    const colors = [0x5b1f1c, 0x29323d, 0x6b6a62, 0x1e2a22, 0x3c3c3e, 0x44331f, 0x2c3540, 0x6e6f6a];
    cars.forEach(([name, x, z, ry], i) => {
      const o = prop(name);
      o.position.set(x, 0, z);
      o.rotation.y = ry;
      // each car gets its own paint
      o.traverse((c) => {
        if (!c.isMesh) return;
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        const next = mats.map((m) => {
          if (m.name !== 'paint') return m;
          const p = m.clone();
          p.color.set(colors[i % colors.length]);
          if (name === 'car_wreck') { p.roughness = 0.75; p.clearcoat = 0.1; p.color.multiplyScalar(0.55); }
          return p;
        });
        c.material = Array.isArray(c.material) ? next : next[0];
      });
      this.add(o);
      this.col.box(x, z, 2.42, 0.93, -ry, 1.45);
      if (name === 'car_wreck' && i === 0) this.fires.push({ x: x + Math.cos(ry) * 1.8, y: 1.0, z: z - Math.sin(ry) * 1.8, phase: 2, size: 1.8 });
    });
  }

  // street ends are barricaded; the dead climb over them (spawn points)
  edges() {
    const b = this.bounds;
    // invisible walls
    this.col.box(0, b.minZ - 1, 80, 1, 0, 3);
    this.col.box(0, b.maxZ + 1, 80, 1, 0, 3);
    this.col.box(b.minX - 1, 0, 1, 80, 0, 3);
    this.col.box(b.maxX + 1, 0, 1, 80, 0, 3);
    // spawn points just beyond the edges of each street and the alley
    this.spawns = [
      { x: -4, z: b.minZ + 1 }, { x: 3, z: b.minZ + 1 }, { x: 0, z: b.maxZ - 1 }, { x: -3.5, z: b.maxZ - 1 },
      { x: b.minX + 1, z: -2 }, { x: b.minX + 1, z: 3 }, { x: b.maxX - 1, z: -3 }, { x: b.maxX - 1, z: 2 },
      { x: 20.5, z: b.minZ + 1 }, { x: 20.5, z: -36 },
    ];
  }

  // ----------------------------------------------------------- lighting --
  lights() {
    const s = this.scene;
    const hemi = new THREE.HemisphereLight(0x4a5c7c, 0x0d0d10, 0.9);
    s.add(hemi);
    const moon = new THREE.DirectionalLight(0x8aa2c8, 0.55);
    moon.position.set(-20, 40, -10);
    s.add(moon);
    this.moon = moon;
    // a fixed pool of point lights handed to whatever is nearest the camera
    // (never add or remove lights at runtime: that recompiles shaders)
    this.lampPool = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffa860, 0, 16, 1.6);
      s.add(l);
      this.lampPool.push(l);
    }
    this.firePool = [];
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xff7a2a, 0, 11, 1.7);
      s.add(l);
      this.firePool.push(l);
    }
    this.policeLight = new THREE.PointLight(0xff2020, 0, 14, 1.5);
    s.add(this.policeLight);
    // fake volumetrics: lamp cones and ground pools (cheap, everywhere)
    const coneMat = new THREE.MeshBasicMaterial({ map: tex('tex/cone.webp'), color: 0xffb070, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const poolMat = new THREE.MeshBasicMaterial({ map: tex('tex/soft.webp'), color: 0xffa050, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lampFx = [];
    for (const L of this.lampSpots) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5.9, 20, 1, true), coneMat.clone());
      cone.position.set(L.x, L.y - 2.95, L.z);
      this.add(cone);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), poolMat.clone());
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(L.x, 0.03, L.z);
      this.add(pool);
      this.lampFx.push({ cone, pool, L });
    }
  }

  // ------------------------------------------------------------- update --
  update(t, dt, focus, wind) {
    // street lamps: the nearest three get real light; broken ones stutter
    const near = this.lampSpots.map((L, i) => ({ L, i, d: (L.x - focus.x) ** 2 + (L.z - focus.z) ** 2 })).sort((a, b) => a.d - b.d);
    this.lampPool.forEach((l, k) => {
      const n = near[k];
      if (!n) { l.intensity = 0; return; }
      l.position.set(n.L.x, n.L.y - 0.3, n.L.z);
      l.intensity = 38 * this.lampLevel(n.L, t);
    });
    this.lampFx.forEach(({ cone, pool, L }) => {
      const k = this.lampLevel(L, t);
      cone.material.opacity = 0.075 * k;
      pool.material.opacity = 0.2 * k;
    });
    const lampMat = propMaterial('lamp');
    if (lampMat) lampMat.emissiveIntensity = 5;
    // fires
    const fn = this.fires.map((f) => ({ f, d: (f.x - focus.x) ** 2 + (f.z - focus.z) ** 2 })).sort((a, b) => a.d - b.d);
    this.firePool.forEach((l, k) => {
      const f = fn[k]?.f;
      if (!f) { l.intensity = 0; return; }
      const fl = 0.75 + 0.15 * Math.sin(t * 17 + f.phase) + 0.1 * Math.sin(t * 31.7 + f.phase * 2) + 0.08 * Math.sin(t * 5.3);
      l.position.set(f.x + Math.sin(t * 9) * 0.08, f.y + 0.6, f.z + Math.cos(t * 7) * 0.08);
      l.intensity = 22 * fl * f.size;
    });
    // police lightbar: alternating red / blue, the light moves with it
    const ph = (t * 2.2) % 1;
    const red = ph < 0.5;
    const flash = (ph % 0.5) < 0.12 || ((ph % 0.5) > 0.2 && (ph % 0.5) < 0.3) ? 1 : 0.15;
    const p = this.police[0];
    if (p) {
      this.policeLight.position.set(p.x, 2.2, p.z);
      this.policeLight.color.set(red ? 0xff1a14 : 0x1f4dff);
      this.policeLight.intensity = 30 * flash;
      const r = propMaterial('lightbar_red'), b = propMaterial('lightbar_blue');
      if (r) r.emissiveIntensity = red ? 8 * flash : 0.2;
      if (b) b.emissiveIntensity = red ? 0.2 : 8 * flash;
    }
    // signs and windows
    for (const f of this.flicker) {
      const glitch = Math.sin(t * 23 + f.phase * 7) > 0.96 || (Math.sin(t * 0.7 + f.phase) > 0.9 && Math.sin(t * 40) > 0);
      f.mat.color.setScalar(glitch ? 0.15 : f.base);
    }
    if (this.windows && Math.floor(t * 10) !== this._wt) {
      this._wt = Math.floor(t * 10);
      const { mesh, list } = this.windows;
      list.forEach((wn, i) => { if (wn.lit !== 'dark') mesh.setColorAt(i, this.windowColor(wn, t)); });
      mesh.instanceColor.needsUpdate = true;
    }
    // paper in the wind
    for (const p of this.papers) {
      const gust = wind.gust;
      if (gust > 0.4 && Math.random() < dt * gust * 0.6) { p.vx += wind.x * gust * 2.5; p.vz += wind.z * gust * 2.5; p.vy += 1.2 * gust; p.spin = (Math.random() - 0.5) * 8; }
      p.m.position.x += p.vx * dt; p.m.position.z += p.vz * dt; p.m.position.y = Math.max(0.02, p.m.position.y + p.vy * dt);
      p.vy -= 4 * dt;
      p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5;
      p.m.rotation.z += p.spin * dt;
      p.spin *= 1 - dt * 2;
      if (p.m.position.y <= 0.02) { p.vy = 0; p.spin *= 0.5; }
      if (Math.abs(p.m.position.x) > 34) p.m.position.x *= -0.95;
      if (Math.abs(p.m.position.z) > 34) p.m.position.z *= -0.95;
    }
  }

  lampLevel(L, t) {
    if (!L.broken) return 1;
    const a = Math.sin(t * 1.3 + L.phase) + Math.sin(t * 7.7 + L.phase * 3) * 0.5;
    if (a > 1.1) return Math.sin(t * 60) > 0 ? 0.2 : 0.9;
    return a > 0.7 ? 0.05 : 0.95;
  }
}

export function mulberry(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
