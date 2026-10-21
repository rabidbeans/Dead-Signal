// The survivor's gear, modelled in Blender (tools/blender/gear_kit.py -> props/gear.glb): the engineer's sentry, the
// throwables, the mastery attachments, the weapon crate and the locked hard case. `gear(name)` is a fresh copy.
import * as THREE from 'three';
import { loadGLB } from './assets.js';

const T = {};
export const GEAR = ['sentry_base', 'sentry_head', 'frag', 'molotov', 'pipebomb', 'reddot', 'suppressor', 'crate_base', 'crate_lid', 'case_base', 'case_lid', 'supply'];

export async function loadGear() {
  if (T.frag) return;
  const g = await loadGLB('props/gear.glb');
  for (const name of GEAR) {
    const o = g.scene.getObjectByName(name);
    if (!o) continue;
    o.traverse((m) => {
      if (!m.isMesh) return;
      m.castShadow = true; m.receiveShadow = true;
      const mt = m.material;
      if (!mt) return;
      mt.roughness = Math.max(0.18, mt.roughness ?? 0.5);      // ⚠️ no mirrors (the bloom overflows)
      if (mt.emissive && mt.emissive.getHex() !== 0) { mt.emissiveIntensity = 2.4; mt.toneMapped = false; }
    });
    T[name] = o;
  }
}

export function gear(name, { shadow = true } = {}) {
  const src = T[name];
  if (!src) return new THREE.Group();
  const o = src.clone(true);
  o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.setScalar(1);
  o.traverse((m) => { if (m.isMesh) m.castShadow = shadow; });
  return o;
}

// one of each, for Game.warmUp
export const gearAll = () => GEAR.filter((n) => T[n]).map((n) => gear(n));
