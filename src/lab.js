// Character lab: ?who=z_office,z_worker&mode=walk|idle|attack|die|aim&cam=game|front|side&t=2
import * as THREE from 'three';
import { Engine, nightEnvironment } from './game/engine.js';
import { loadCharacters, makeCharacter, ZOMBIES, SURVIVORS, loadWeapon } from './game/assets.js';
import { Rig, ZombieAnim, SurvivorAnim } from './game/rig.js';

const q = new URLSearchParams(location.search);
const who = (q.get('who') || ZOMBIES.join(',')).split(',');
const mode = q.get('mode') || 'walk';
const cam = q.get('cam') || 'game';
const eng = new Engine(document.getElementById('c'));
const { scene, camera } = eng;
scene.background = new THREE.Color(0x07090c);
scene.environment = nightEnvironment(eng.renderer);
scene.environmentIntensity = 0.4;
scene.fog = new THREE.FogExp2(0x07090c, 0.02);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.6 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
scene.add(new THREE.HemisphereLight(0x55688a, 0x0b0b0b, 0.5));
const key = new THREE.SpotLight(0xfff2dd, 120, 30, 0.6, 0.5, 2);
key.position.set(3, 7, 6); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0x7f9cc8, 0.6); rim.position.set(-4, 5, -6); scene.add(rim);

await loadCharacters(who);
const actors = [];
who.forEach((n, i) => {
  const c = makeCharacter(n);
  c.root.position.set((i - (who.length - 1) / 2) * 1.3, 0, 0);
  scene.add(c.root);
  const rig = new Rig(c);
  const anim = n.startsWith('z_') ? new ZombieAnim(rig, i * 7 + 3) : new SurvivorAnim(rig);
  if (mode === 'attack' && anim.attack !== undefined) anim.attack = 1;
  actors.push({ c, anim });
});
if (mode === 'aim' || mode === 'run') {
  const gun = await loadWeapon('pistol');
  actors.forEach((a) => { if (a.anim instanceof SurvivorAnim) { a.gun = gun.clone(); scene.add(a.gun); } });
}
const span = who.length * 1.3;
if (cam === 'game') { camera.position.set(0, 11.5 * Math.max(1, span / 6), 7.5 * Math.max(1, span / 6)); camera.lookAt(0, 0.8, 0); }
else if (cam === 'front') { camera.position.set(0, 1.5, 3 + span * 0.9); camera.lookAt(0, 1.0, 0); }
else { camera.position.set(4 + span, 1.6, 0.5); camera.lookAt(0, 1.0, 0); }
key.target.position.set(0, 0, 0);
let t = 0;
const T = parseFloat(q.get('t') || '0');
function step(dt) {
  t += dt;
  for (const a of actors) {
    if (a.anim instanceof ZombieAnim) {
      if (mode === 'die' && t > 0.3 && !a.anim.dead) a.anim.dead = 0.001;
      const sp = mode === 'walk' ? 0.8 : 0;
      a.anim.update(dt, sp * dt, sp);
    } else {
      const sp = mode === 'run' ? 3.5 : mode === 'walk' ? 1.4 : 0;
      a.anim.update(dt, new THREE.Vector3(0, 0, sp), mode === 'aim' || mode === 'run');
      if (a.gun) {
        const h = a.c.bones.hand_R; h.getWorldPosition(a.gun.position);
        a.gun.rotation.set(0, -Math.PI / 2, 0);
      }
    }
  }
}
// fast-forward for deterministic screenshots
for (let i = 0; i < T * 60; i++) step(1 / 60);
window.__ready = true;
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!q.has('freeze')) step(dt);
  eng.render(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
