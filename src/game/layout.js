// Level layouts that are not "a street with things across it" (Sam, 2026-10-17: "most of all the levels are the same,
// it's just different objects stacked in maze formations ... more interesting, setup like doom style or wolfenstein.
// Where the map is kind of a maze. Or maybe like similar to the game magicka").
//
// A level's two maze stretches (start -> junction, gate -> boss plaza) can be a WIDE ZONE instead of barricade rows:
//   wards      (level 2) the inside of St. Mercy Hospital, Wolfenstein-style: rooms and corridors on a 4 m grid, sliding
//              doors that open as you come up to them, wards of beds behind curtains, offices, an operating theatre
//   warehouse  (level 4) the bonded warehouse, Doom-style: aisles of racking and storage bays, and ONE door per stretch
//              that is locked until somebody picks up its coloured keycard, hidden in a side room
//   canals     (level 3) the canal quarter, Magicka-style: open islands of paving between water channels, crossed only
//              by footbridges (which zig-zag from one side to the other) and broken up by lengthwise canals
//
// Everything here is PURE DATA, seeded per level, so every machine builds exactly the same maze.
import { mulberry } from './rng.js';

export const CELL = 4;           // the interior grid (m)
export const DOOR_W = 2.2;       // a doorway
export const WALL_T = 0.3;       // wall thickness
export const WALL_H = 2.7;       // wall height (low enough that the camera sees over it, high enough to hide what is behind)

// ------------------------------------------------------------- interiors --
// zTop is the south edge (where you come in), zBot the north edge (where you leave). Rows count north from zTop.
export function genInterior(seed, zTop, zBot, hw, o = {}) {
  const rng = mulberry(seed);
  const cols = Math.round((2 * hw) / CELL);
  const rows = Math.max(4, Math.floor((zTop - zBot) / CELL));
  const x0 = -hw;
  const cellX = (i) => x0 + (i + 0.5) * CELL;
  const cellZ = (j) => zTop - (j + 0.5) * CELL;
  // ---- rooms: a binary space partition of the grid, with the odd one-cell strip left as a corridor
  const rooms = [];
  const maxA = o.maxArea ?? 9;
  const leaf = (i, j, w, h) => rooms.push({ i, j, w, h, id: rooms.length });
  const split = (i, j, w, h) => {
    const a = w * h;
    if ((w <= 3 && h <= 3) || (a <= maxA && rng() < 0.55) || (w < 4 && h < 4)) return leaf(i, j, w, h);
    let vert = w > h * 1.25 ? true : h > w * 1.25 ? false : rng() < 0.5;
    if (vert && w < 4) vert = false;
    if (!vert && h < 4) vert = true;
    const D = vert ? w : h;
    if (D < 4) return leaf(i, j, w, h);
    // a corridor: a one-cell strip through the middle of a big block
    if (D >= 7 && rng() < (o.corridors ?? 0.35)) {
      const c = 2 + Math.floor(rng() * (D - 4));
      if (vert) { split(i, j, c, h); leaf(i + c, j, 1, h); split(i + c + 1, j, w - c - 1, h); }
      else { split(i, j, w, c); leaf(i, j + c, w, 1); split(i, j + c + 1, w, h - c - 1); }
      return;
    }
    const c = 2 + Math.floor(rng() * (D - 3));
    if (vert) { split(i, j, c, h); split(i + c, j, w - c, h); } else { split(i, j, w, c); split(i, j + c, w, h - c); }
  };
  split(0, 0, cols, rows);
  const owner = new Int16Array(cols * rows);
  for (const r of rooms) for (let a = r.i; a < r.i + r.w; a++) for (let b = r.j; b < r.j + r.h; b++) owner[b * cols + a] = r.id;
  const own = (i, j) => owner[j * cols + i];
  // ---- which rooms touch, and along which cell edges ('E': between (i,j) and (i+1,j); 'N': between (i,j) and (i,j+1))
  const adj = new Map();
  const addAdj = (a, b, e) => {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    if (!adj.has(k)) adj.set(k, { a: Math.min(a, b), b: Math.max(a, b), edges: [] });
    adj.get(k).edges.push(e);
  };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (i + 1 < cols && own(i, j) !== own(i + 1, j)) addAdj(own(i, j), own(i + 1, j), { i, j, d: 'E' });
    if (j + 1 < rows && own(i, j) !== own(i, j + 1)) addAdj(own(i, j), own(i, j + 1), { i, j, d: 'N' });
  }
  const nb = rooms.map(() => []);
  for (const v of adj.values()) { nb[v.a].push(v); nb[v.b].push(v); }
  const other = (v, r) => (v.a === r ? v.b : v.a);
  // ---- the way in (south wall) and out (north wall), near the middle where the street meets the building
  const ci = Math.floor(cols / 2) - (rng() < 0.5 ? 1 : 0), co = Math.floor(cols / 2) - (rng() < 0.5 ? 1 : 0);
  const entrance = { i: ci, j: 0, room: own(ci, 0), x: cellX(ci), z: zTop };
  const exit = { i: co, j: rows - 1, room: own(co, rows - 1), x: cellX(co), z: zTop - rows * CELL };
  // ---- a spanning tree from the entrance (a random depth-first walk: long winding routes, Wolfenstein style)
  const inTree = new Set(), conns = [];
  const seen = new Set([entrance.room]);
  const stack = [entrance.room];
  while (stack.length) {
    const r = stack[stack.length - 1];
    const opts = nb[r].filter((v) => !seen.has(other(v, r)));
    if (!opts.length) { stack.pop(); continue; }
    const v = opts[(rng() * opts.length) | 0];
    const to = other(v, r);
    seen.add(to); inTree.add(v); conns.push(v); stack.push(to);
  }
  // ---- the path in -> out through the tree
  const treeNb = rooms.map(() => []);
  for (const v of conns) { treeNb[v.a].push(v); treeNb[v.b].push(v); }
  const parent = new Map([[entrance.room, null]]);
  const q = [entrance.room];
  while (q.length) { const r = q.shift(); for (const v of treeNb[r]) { const t = other(v, r); if (!parent.has(t)) { parent.set(t, v); q.push(t); } } }
  const path = [];
  for (let r = exit.room; parent.get(r); ) { const v = parent.get(r); path.unshift(v); r = other(v, r); }
  // ---- a locked door (Doom): a door on the way out, past half way, and its key somewhere you can reach without it
  let lock = null, keyRoom = null;
  if (o.key && path.length >= 2) {
    const k = Math.min(path.length - 1, Math.max(1, Math.floor(path.length * (0.5 + rng() * 0.3))));
    lock = path[k];
    // the entrance side of the tree with the locked door cut
    const side = new Set([entrance.room]);
    const qq = [entrance.room];
    while (qq.length) { const r = qq.shift(); for (const v of treeNb[r]) { if (v === lock) continue; const t = other(v, r); if (!side.has(t)) { side.add(t); qq.push(t); } } }
    // the key: the entrance-side room furthest from the way through (a side room you have to go looking in)
    const onPath = new Set([entrance.room, ...path.map((v) => [v.a, v.b]).flat()]);
    const dist = new Map([[entrance.room, 0]]);
    const q3 = [entrance.room];
    while (q3.length) { const r = q3.shift(); for (const v of treeNb[r]) { if (v === lock) continue; const t = other(v, r); if (!dist.has(t)) { dist.set(t, dist.get(r) + 1); q3.push(t); } } }
    let best = -1;
    for (const r of side) {
      if (r === entrance.room) continue;
      const score = dist.get(r) + (onPath.has(r) ? -3 : 2) + rng() * 0.5;
      if (score > best) { best = score; keyRoom = r; }
    }
    lock.side = side;
  }
  // ---- a few loops, so it is a maze and not a tree (never across the locked door)
  for (const v of adj.values()) {
    if (inTree.has(v)) continue;
    if (lock && lock.side.has(v.a) !== lock.side.has(v.b)) continue;
    if (rng() < (o.loops ?? 0.22)) conns.push(v);
  }
  // ---- doorways: one cell edge per connection (not at a room's corner if it can help it)
  const doors = [];
  for (const v of conns) {
    const e = v.edges.length > 2 ? v.edges[1 + ((rng() * (v.edges.length - 2)) | 0)] : v.edges[(rng() * v.edges.length) | 0];
    const ra = rooms[v.a], rb = rooms[v.b];
    const corridor = Math.min(ra.w, ra.h) === 1 || Math.min(rb.w, rb.h) === 1;
    let kind = v === lock ? 'lock' : rng() < (corridor ? o.archC ?? 0.35 : o.arch ?? 0.2) ? 'arch' : 'door';
    const dx = e.d === 'E' ? x0 + (e.i + 1) * CELL : cellX(e.i);
    const dz = e.d === 'E' ? cellZ(e.j) : zTop - (e.j + 1) * CELL;
    doors.push({ x: dx, z: dz, axis: e.d === 'E' ? 'z' : 'x', w: kind === 'arch' ? 2.6 : DOOR_W, kind, a: v.a, b: v.b, e, color: v === lock ? o.key : null });
  }
  // ---- walls: every cell edge between two rooms, and the outer shell, merged into long runs
  const doorAt = new Map(doors.map((d) => [`${d.e.i},${d.e.j},${d.e.d}`, d]));
  const H = new Map(), V = new Map();     // horizontal runs keyed by z, vertical by x: lists of [a, b]
  const push = (m, k, a, b) => { if (!m.has(k)) m.set(k, []); m.get(k).push([a, b]); };
  const hEdge = (zLine, xa, xb, gap) => {     // a wall along x at z, with an optional gap [g0, g1]
    if (!gap) return push(H, zLine, xa, xb);
    if (gap[0] - xa > 0.05) push(H, zLine, xa, gap[0]);
    if (xb - gap[1] > 0.05) push(H, zLine, gap[1], xb);
  };
  const vEdge = (xLine, za, zb, gap) => {
    if (!gap) return push(V, xLine, za, zb);
    if (gap[0] - za > 0.05) push(V, xLine, za, gap[0]);
    if (zb - gap[1] > 0.05) push(V, xLine, gap[1], zb);
  };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const xa = x0 + i * CELL, xb = xa + CELL, zs = zTop - j * CELL, zn = zs - CELL;
    if (i + 1 < cols && own(i, j) !== own(i + 1, j)) {
      const d = doorAt.get(`${i},${j},E`);
      vEdge(xb, zn, zs, d ? [d.z - d.w / 2, d.z + d.w / 2] : null);
    }
    if (j + 1 < rows && own(i, j) !== own(i, j + 1)) {
      const d = doorAt.get(`${i},${j},N`);
      hEdge(zn, xa, xb, d ? [d.x - d.w / 2, d.x + d.w / 2] : null);
    }
  }
  const zN = zTop - rows * CELL;
  const OPEN = 3.2;      // the way in and out: a wide doorway
  for (let i = 0; i < cols; i++) {
    const xa = x0 + i * CELL, xb = xa + CELL, c = cellX(i);
    hEdge(zTop, xa, xb, i === ci ? [c - OPEN / 2, c + OPEN / 2] : null);
    hEdge(zN, xa, xb, i === co ? [c - OPEN / 2, c + OPEN / 2] : null);
  }
  for (let j = 0; j < rows; j++) { const zs = zTop - j * CELL; vEdge(x0, zs - CELL, zs); vEdge(x0 + cols * CELL, zs - CELL, zs); }
  const merge = (m, horiz) => {
    const out = [];
    for (const [k, list] of m) {
      list.sort((p, q) => p[0] - q[0]);
      let cur = null;
      const flush = () => { if (cur) out.push(horiz ? { x0: cur[0], x1: cur[1], z0: k, z1: k } : { x0: k, x1: k, z0: cur[0], z1: cur[1] }); };
      for (const [a, b] of list) {
        if (cur && a <= cur[1] + 0.01) cur[1] = Math.max(cur[1], b);
        else { flush(); cur = [a, b]; }
      }
      flush();
    }
    return out;
  };
  const walls = [...merge(H, true), ...merge(V, false)];
  // ---- what each room is: by its shape, and one special room per zone
  for (const r of rooms) {
    r.x0 = x0 + r.i * CELL; r.x1 = r.x0 + r.w * CELL;
    r.z1 = zTop - r.j * CELL; r.z0 = r.z1 - r.h * CELL;          // z0 north edge, z1 south edge
    r.cx = (r.x0 + r.x1) / 2; r.cz = (r.z0 + r.z1) / 2;
    r.kind = Math.min(r.w, r.h) === 1 ? 'corridor' : r.w * r.h <= 4 ? 'small' : r.w * r.h >= 9 ? 'big' : 'mid';
    r.doors = doors.filter((d) => d.a === r.id || d.b === r.id);
    r.seed = (rng() * 1e6) | 0;
  }
  const bigs = rooms.filter((r) => r.kind === 'big' || r.kind === 'mid').sort((a, b) => b.w * b.h - a.w * a.h);
  if (bigs.length) bigs[(rng() * Math.min(3, bigs.length)) | 0].special = true;
  rooms[entrance.room].entry = true;
  rooms[exit.room].exitRoom = true;
  const key = keyRoom !== null ? { x: rooms[keyRoom].cx, z: rooms[keyRoom].cz, color: o.key, room: keyRoom } : null;
  if (key) rooms[keyRoom].keyRoom = true;
  return { kind: 'interior', zTop, zBot: zN, hw, cols, rows, rooms, doors, walls, entrance, exit, key, x0 };
}

// ---------------------------------------------------------------- canals --
// Channels across the zone every 13-17 m, each crossed by one or two footbridges that swap sides from one channel to the
// next; between them, short lengthwise canals off one bank make the islands into L- and U-shaped walks.
export function genCanals(seed, zTop, zBot, hw) {
  const rng = mulberry(seed);
  const chans = [], bridges = [], lengths = [];
  const CW = 4.2;         // channel width
  let side = rng() < 0.5 ? -1 : 1;
  let z = zTop - 9 - rng() * 3;
  const across = [];
  while (z - CW > zBot + 8) {
    across.push(z);
    z -= 16 + rng() * 5;
  }
  across.forEach((cz, k) => {
    const x = side * (6 + rng() * 8);
    const list = [x];
    if (rng() < 0.35) list.push(-side * (2 + rng() * 6));          // now and then a second bridge
    side = -side;
    chans.push({ z: cz, w: CW, x0: -hw, x1: hw });
    for (const bx of list) bridges.push({ x: +bx.toFixed(2), z: cz, len: 5.6, w: 3.0 });
  });
  // lengthwise canals: off the south bank of a channel (or the north bank of the zone), never in front of a bridge
  for (let k = -1; k < across.length; k++) {
    const zS = k < 0 ? zTop - 1 : across[k] - CW / 2, zNn = k + 1 < across.length ? across[k + 1] + CW / 2 : zBot + 1;        // the island between channel k (south) and k+1 (north)
    const len = zS - zNn;
    if (len < 9) continue;
    const n = len > 13 ? 2 : 1;
    for (let m = 0; m < n; m++) {
      for (let tries = 0; tries < 8; tries++) {
        const x = (rng() - 0.5) * 2 * (hw - 5);
        const fromSouth = rng() < 0.5;
        // keep clear of the bridges landing on this island, and of the other lengthwise canals
        const clear = bridges.filter((b) => Math.abs(b.z - across[k]) < 0.1 || Math.abs(b.z - across[k + 1]) < 0.1).every((b) => Math.abs(b.x - x) > 4.4)
          && lengths.every((l) => Math.abs(l.x - x) > 6 || l.z0 > zS + 0.1 || l.z1 < zNn - 0.1);
        if (!clear) continue;
        const L = len * (0.55 + rng() * 0.2);
        lengths.push(fromSouth ? { x: +x.toFixed(2), z0: zS, z1: zS - L, w: 3.0 } : { x: +x.toFixed(2), z0: zNn + L, z1: zNn, w: 3.0 });
        break;
      }
    }
  }
  // islands: what is left, for dressing (stalls, trees, gas tanks)
  const islands = [];
  const edges = [zTop, ...across.flatMap((c) => [c + CW / 2, c - CW / 2]), zBot];
  for (let k = 0; k < edges.length; k += 2) islands.push({ z0: edges[k + 1], z1: edges[k] });
  return { kind: 'canals', zTop, zBot, hw, chans, bridges, lengths, islands, CW };
}

// ------------------------------------------------------------- queries --
// is (x, z) inside a wall, a closed piece of furniture-free cell edge, or the water? (kits, lamps, sleepers keep out)
export function zoneBlocked(Z, x, z, pad = 0.8) {
  if (Z.kind === 'interior') {
    for (const w of Z.walls) {
      if (x > Math.min(w.x0, w.x1) - pad - WALL_T && x < Math.max(w.x0, w.x1) + pad + WALL_T && z > Math.min(w.z0, w.z1) - pad - WALL_T && z < Math.max(w.z0, w.z1) + pad + WALL_T) return true;
    }
    return false;
  }
  if (Z.kind === 'canals') {
    for (const c of Z.chans) if (Math.abs(z - c.z) < c.w / 2 + pad) return !Z.bridges.some((b) => Math.abs(b.z - c.z) < 0.1 && Math.abs(x - b.x) < b.w / 2 - 0.3);
    for (const l of Z.lengths) if (Math.abs(x - l.x) < l.w / 2 + pad && z < l.z0 + pad && z > l.z1 - pad) return true;
  }
  return false;
}
