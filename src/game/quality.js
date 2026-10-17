// Quality tiers. A phone gets 'mid' by default and drops to 'low' by itself when
// it cannot hold ~55 fps at the lowest resolution; a desktop gets 'high'.
// `?q=high|mid|low` forces one (the way to test the phone settings on a computer).
const qs = new URLSearchParams(location.search);
export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

const TIERS = {
  high: {
    name: 'high', maxDpr: 2, startDpr: 1.5, minDpr: 1, msaa: 4,
    pcfSoft: true, basicShadow: false, spotMap: true, moonShadow: 2048, moonRange: 17, spotShadow: true, spotShadowSize: 2048,
    env: true, chroma: true, bloomScale: 0.5, aniso: 8, fogSheets: 24, rain: 480, zombieShadows: 14,
    physicalPaint: true, lowTex: false,
  },
  mid: {
    name: 'mid', maxDpr: 1, startDpr: 1, minDpr: 0.62, msaa: 0,
    pcfSoft: false, basicShadow: true, spotMap: false, moonShadow: 1024, moonRange: 14.5, spotShadow: false, spotShadowSize: 512,
    env: false, chroma: false, bloomScale: 0.35, aniso: 2, fogSheets: 8, rain: 220, zombieShadows: 6,
    physicalPaint: false, lowTex: true,
  },
  low: {
    name: 'low', maxDpr: 0.75, startDpr: 0.75, minDpr: 0.5, msaa: 0,
    pcfSoft: false, basicShadow: true, spotMap: false, moonShadow: 0, moonRange: 14.5, spotShadow: false, spotShadowSize: 512,
    env: false, chroma: false, bloomScale: 0.25, aniso: 1, fogSheets: 0, rain: 120, zombieShadows: 0,
    physicalPaint: false, lowTex: true,
  },
};

export const Q = { ...(TIERS[qs.get('q')] || (isTouch ? TIERS.mid : TIERS.high)) };
// ?o=key:value,key:value overrides single settings (testing a phone setting on a computer)
for (const kv of (qs.get('o') || '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':');
  Q[k] = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v;
}
export const tier = Q;
export { TIERS };
