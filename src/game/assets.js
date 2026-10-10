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

export const ZOMBIES = ['z_office', 'z_patient', 'z_worker', 'z_hoodie', 'z_elder', 'z_cop', 'z_nurse', 'z_jogger', 'z_burned', 'z_trucker'];
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
      if (!o.geometry.userData.sphereSet) {      // animated bodies swing far out of their bind pose
        o.geometry.computeBoundingSphere();
        o.geometry.boundingSphere.center.y = 0.9;
        o.geometry.boundingSphere.radius = 2.4;
        o.geometry.userData.sphereSet = true;
      }
      o.frustumCulled = true;
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
      m = dirtify(new THREE.MeshPhysicalMaterial({ color: 0x4a4f55, metalness: 0.55, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.25 }));
      break;
    case 'paint_white':
      m = dirtify(new THREE.MeshPhysicalMaterial({ color: 0xb5b5b0, metalness: 0.2, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 }));
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
    case 'winframe':
      m = new THREE.MeshStandardMaterial({ color: 0x2c2d30, metalness: 0.5, roughness: 0.62, map: tex('tex/metal_albedo.webp', { repeat: true }), roughnessMap: tex('tex/metal_orm.webp', { srgb: false, repeat: true }) });
      break;
    case 'winglass':
      m = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      break;
    case 'wood':
      m = surface('wood', 1, 0xd8cfc4);
      break;
    case 'rust':
      m = surface('metal', 1, 0x7a4a30); m.metalness = 0.45;
      break;
    case 'steel':
      m = new THREE.MeshStandardMaterial({ color: 0x8a8d90, metalness: 0.85, roughness: 0.45 });
      break;
    case 'olive':
      m = surface('metal', 1, 0x41502f); m.metalness = 0.3;
      break;
    case 'mailblue':
      m = new THREE.MeshPhysicalMaterial({ color: 0x1c3a85, metalness: 0.4, roughness: 0.4, clearcoat: 0.5 });
      break;
    case 'awning':
      m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide });
      break;
    case 'tarp':
      m = new THREE.MeshStandardMaterial({ color: 0x3d5f7a, roughness: 0.6, side: THREE.DoubleSide, normalMap: tex('tex/concrete_normal.webp', { srgb: false, repeat: true }), normalScale: new THREE.Vector2(0.6, 0.6) });
      break;
    case 'cardboard':
      m = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.95, normalMap: tex('tex/concrete_normal.webp', { srgb: false, repeat: true }), normalScale: new THREE.Vector2(0.5, 0.5) });
      break;
    case 'bark':
      m = new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 1 });
      break;
    case 'floodlamp':
      m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff2d0, emissiveIntensity: 7 });
      break;
    case 'tl_red':
      m = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff2010, emissiveIntensity: 2.5 });
      break;
    case 'tl_amber':
      m = new THREE.MeshStandardMaterial({ color: 0x302000, emissive: 0xffa010, emissiveIntensity: 0 });
      break;
    case 'tl_green':
      m = new THREE.MeshStandardMaterial({ color: 0x003010, emissive: 0x10ff40, emissiveIntensity: 0 });
      break;
    case 'adpanel':
      m = new THREE.MeshStandardMaterial({ color: 0x1b2230, emissive: 0x5c80c0, emissiveIntensity: 0.9, roughness: 0.4 });
      break;
    case 'stopred':
      m = new THREE.MeshStandardMaterial({ color: 0x9a1612, roughness: 0.45, metalness: 0.2 });
      break;
    case 'chainlink':
      m = new THREE.MeshStandardMaterial({ color: 0x9a9da0, metalness: 0.7, roughness: 0.5, alphaMap: tex('tex/chainlink.webp', { srgb: false, repeat: true }), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
      m.alphaMap = null; m.map = tex('tex/chainlink.webp', { repeat: true });
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

let propRoots = [];

export async function loadProps() {
  const gs = await Promise.all(['props/props.glb', 'props/street.glb', 'props/vehicles.glb'].map(loadGLB));
  propRoots = gs.map((g) => g.scene);
  for (const root of propRoots) {
    root.traverse((o) => {
      if (o.isMesh) {
        o.material = Array.isArray(o.material) ? o.material.map(upgrade) : upgrade(o.material);
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }
}

function findProp(name) {
  for (const r of propRoots) {
    const o = r.getObjectByName(name);
    if (o) return o;
  }
  throw new Error('no prop ' + name);
}

export function prop(name) {
  const o = findProp(name).clone(true);
  o.position.set(0, 0, 0);
  o.rotation.set(0, 0, 0);
  return o;
}

// One InstancedMesh per mesh of a prop (shared geometry, `matrices` places each copy).
// opts.shadow: cast shadows; opts.map(material): swap the material (per call).
export function instanced(name, matrices, opts = {}) {
  const src = findProp(name);
  src.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
  const group = new THREE.Group();
  src.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const mat = opts.map ? (Array.isArray(o.material) ? o.material.map(opts.map) : opts.map(o.material)) : o.material;
    const im = new THREE.InstancedMesh(geo, mat, matrices.length);
    matrices.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = !!opts.shadow;
    im.receiveShadow = true;
    im.frustumCulled = false;
    group.add(im);
  });
  return group;
}

// Grime on anything painted: rain streaks, mud splashed up from the road
// (strongest low down), and speckle, from a tiling dirt map read in world space.
export function dirtify(m, amount = 1) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDirt = { value: tex('tex/dirt.webp', { srgb: false, repeat: true }) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform sampler2D uDirt;')
      .replace('#include <map_fragment>', `#include <map_fragment>
float dirtV = texture2D(uDirt, vec2(vWP.x * 0.31 + vWP.z * 0.27, vWP.y * 0.4)).r;
float mud = smoothstep(1.1, 0.12, vWP.y);
float gr = clamp(dirtV * 0.55 + mud * 0.7, 0.0, 1.0) * ${amount.toFixed(2)};
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.34, 0.3, 0.26), gr * 0.8);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.88, gr);`);
  };
  m.customProgramCacheKey = () => 'dirt' + amount;
  return m;
}

// striped shop awnings, one material per colour
const awnCache = {};
export function awningMaterial(hex) {
  if (awnCache[hex]) return awnCache[hex];
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#cfc8b6' : hex;
    g.fillRect(i * 32, 0, 32, 64);
  }
  for (let i = 0; i < 260; i++) {                // grime and sun-fade
    g.fillStyle = `rgba(20,14,8,${Math.random() * 0.12})`;
    g.fillRect(Math.random() * 256, Math.random() * 64, 2 + Math.random() * 18, 1 + Math.random() * 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(0.5, 1);
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, side: THREE.DoubleSide });
  awnCache[hex] = m;
  return m;
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
