// 1D smooth noise for camera shake and wind (values in -1..1).
const P = new Float32Array(512);
for (let i = 0; i < 512; i++) P[i] = Math.random() * 2 - 1;

export function perlin1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const a = P[i & 511], b = P[(i + 1) & 511];
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}
