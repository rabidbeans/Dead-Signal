// Loading and preparing everything built by tools/: characters (skinned
// GLB + baked WebP maps), props (named objects, materials upgraded by name)
// and the generated surface textures.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const BASE = import.meta.env.BASE_URL + 'assets/';
const gltf = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const cache = new Map();

export const ZOMBIES = ['z_office', 'z_patient', 'z_worker', 'z_hoodie', 'z_elder'];
export const SURVIVORS = ['survivor_a', 'survivor_b'];

let maxAniso = 4;
export function setAnisotropy(renderer) {
  maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
}

export function tex(path, { srgb = true, repeat = null } = {}) {
  const key = path + (srgb ? ':s' : ':l');
  if (cache.has(key)) return cache.get(key);
  const t = texLoader.load(BASE + path);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = maxAniso;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  cache.set(key, t);
  return t;
}

function loadGLB(path) {
  if (cache.has(path)) return cache.get(path);
  const p = new Promise((res, rej) => gltf.load(BASE + path, res, undefined, rej));
  cache.set(path, p);
  return p;
}

// ---------------------------------------------------------------- people --
const charTemplates = {};

// A shader hook every character shares: a hit flash (pale, desaturated —
// white reads as cartoon) and a cool rim so silhouettes survive the dark.
function characterMaterial(name) {
  const m = new THREE.MeshStandardMaterial({
    map: tex(`chars/${name}_albedo.webp`),
    normalMap: tex(`chars/${name}_normal.webp`, { srgb: false }),
    roughnessMap: tex(`chars/${name}_rough.webp`, { srgb: false }),
    roughness: 1,
    metalness: 0,
  });
  m.map.flipY = false;
  m.normalMap.flipY = false;
  m.roughnessMap.flipY = false;
  m.userData.uniforms = {
    uFlash: { value: 0 },
    uRim: { value: name.startsWith('z_') ? 0.5 : 0.35 },
    uRimColor: { value: new THREE.Color(name.startsWith('z_') ? 0x6f8aa8 : 0x8aa0b8) },
    uTint: { value: new THREE.Color(1, 1, 1) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uFlash; uniform float uRim; uniform vec3 uRimColor; uniform vec3 uTint;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
diffuseColor.rgb *= uTint;`)
      .replace('#include <opaque_fragment>', `
float rimF = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 3.0);
outgoingLight += uRimColor * rimF * uRim * 0.35;
outgoingLight = mix(outgoingLight, vec3(0.55, 0.5, 0.48) * (0.6 + 0.4 * diffuseColor.r), uFlash * 0.8);
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'char';
  return m;
}

export async function loadCharacters(names) {
  await Promise.all(names.map(async (n) => {
    const g = await loadGLB(`chars/${n}.glb`);
    charTemplates[n] = g.scene;
  }));
}

// A fresh, independently animatable copy (own skeleton, own material).
export function makeCharacter(name) {
  const src = charTemplates[name];
  const root = SkeletonUtils.clone(src);
  const mat = characterMaterial(name);
  let mesh = null;
  root.traverse((o) => {
    if (o.isSkinnedMesh) {
      o.material = mat;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      mesh = o;
    }
  });
  const bones = {};
  root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  return { root, mesh, bones, material: mat, name };
}

// ----------------------------------------------------------------- props --
let propsScene = null;
const propMats = {};

function surface(name, rep, color = 0xffffff) {
  const m = new THREE.MeshStandardMaterial({
    color,
    map: tex(`tex/${name}_albedo.webp`, { repeat: true }),
    normalMap: tex(`tex/${name}_normal.webp`, { srgb: false, repeat: true }),
    roughnessMap: tex(`tex/${name}_orm.webp`, { srgb: false, repeat: true }),
    aoMap: null,
    roughness: 1,
    metalness: 0,
  });
  return m;
}

function upgrade(mat) {
  const key = mat.name;
  if (propMats[key]) return propMats[key];
  let m = mat;
  switch (key) {
    case 'concrete': m = surface('concrete'); break;
    case 'metal': m = surface('metal', 1, 0x26392c); m.metalness = 0.35; break;
    case 'paint':
      m = new THREE.MeshPhysicalMaterial({ color: 0x4a4f55, metalness: 0.55, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.25 });
      break;
    case 'paint_white':
      m = new THREE.MeshPhysicalMaterial({ color: 0xb5b5b0, metalness: 0.2, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 });
      break;
    case 'glass':
      m = new THREE.MeshPhysicalMaterial({ color: 0x0b0d10, metalness: 0.1, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.4 });
      break;
    case 'lamp':
      m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb36a, emissiveIntensity: 6 });
      break;
    case 'lightbar_red':
      m = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a10, emissiveIntensity: 0 });
      break;
    case 'lightbar_blue':
      m = new THREE.MeshStandardMaterial({ color: 0x000022, emissive: 0x1a4dff, emissiveIntensity: 0 });
      break;
    case 'headlight':
      m = new THREE.MeshStandardMaterial({ color: 0x777770, roughness: 0.1, emissive: 0xfff0d0, emissiveIntensity: 0 });
      break;
    case 'taillight':
      m = new THREE.MeshStandardMaterial({ color: 0x400404, roughness: 0.15, emissive: 0xff1010, emissiveIntensity: 0 });
      break;
    case 'burlap': {
      m = mat.clone();
      m.roughness = 1;
      m.normalMap = tex('tex/concrete_normal.webp', { srgb: false, repeat: true });
      m.normalScale = new THREE.Vector2(2, 2);
      break;
    }
    default:
      m = mat;
  }
  m.name = key;
  propMats[key] = m;
  return m;
}

export async function loadProps() {
  const g = await loadGLB('props/props.glb');
  propsScene = g.scene;
  propsScene.traverse((o) => {
    if (o.isMesh) {
      o.material = Array.isArray(o.material) ? o.material.map(upgrade) : upgrade(o.material);
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

export function prop(name) {
  const src = propsScene.getObjectByName(name);
  if (!src) throw new Error('no prop ' + name);
  const o = src.clone(true);
  o.position.set(0, 0, 0);
  o.rotation.set(0, 0, 0);
  return o;
}

export function propMaterial(name) {
  return propMats[name];
}

export async function loadWeapon(name) {
  const g = await loadGLB(`weapons/${name}.glb`);
  const o = g.scene.clone(true);
  o.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = true;
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      mats.forEach((m) => { m.envMapIntensity = 1.2; });
    }
  });
  return o;
}

export { surface };
