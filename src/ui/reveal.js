// A new gun: the first thing you see in the safehouse after the level that opened it (Sam, 2026-10-21: "make the weapon
// unlocks cooler"). A crate under a work light, its latches snap, the lid comes up with light spilling out, the gun
// rises and turns in the light while its numbers come up beside it. TEST FIRE shoots it right there.
// Its own small renderer, made when it opens and thrown away when it closes (nothing is kept on a phone's GPU).
import * as THREE from 'three';
import { WEAPONS } from '../game/weapons.js';
import { save } from '../game/save.js';
import { loadWeapon, tex } from '../game/assets.js';
import { gear } from '../game/gear.js';
import { audio } from '../game/audio.js';

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const BASE = import.meta.env.BASE_URL;

export class Reveal {
  constructor() {
    const el = this.el = document.createElement('div');
    el.id = 'reveal';
    el.className = 'hidden';
    el.innerHTML = `
      <canvas></canvas>
      <div class="rv-kicker">NEW WEAPON</div>
      <div class="rv-card"><b class="rv-name"></b><small class="rv-blurb"></small><div class="rv-stats"></div></div>
      <div class="rv-buttons"><button class="btn rv-fire">TEST FIRE</button><button class="btn primary rv-take">TAKE IT</button></div>`;
    document.body.appendChild(el);
    this.canvas = el.querySelector('canvas');
    el.querySelector('.rv-fire').addEventListener('click', () => this.fire());
    el.querySelector('.rv-take').addEventListener('click', () => { audio.play('swap', { vol: 0.8, jitter: 0 }); const d = this.done; this.hide(); d?.(); });
  }

  async show(id, done, { replay = false } = {}) {
    this.hide();
    this.id = id; this.done = done; this.t = replay ? 2.6 : 0; this.t0 = undefined; this.replay = replay;
    const W = WEAPONS[id], st = save.gunStats(id);
    const el = this.el;
    el.querySelector('.rv-kicker').textContent = replay ? (st.proto ? 'PROTOTYPE' : 'YOUR WEAPON') : 'NEW WEAPON · UNLOCKED';
    el.querySelector('.rv-name').textContent = W.name.toUpperCase();
    el.querySelector('.rv-blurb').textContent = W.blurb;
    const rof = 1 / st.autoInterval;
    el.querySelector('.rv-stats').innerHTML = [['DAMAGE', st.pellets ? `${Math.round(st.dmg)}×${st.pellets}` : Math.round(st.dmg)], ['FIRE RATE', rof.toFixed(1) + '/s'], ['MAGAZINE', st.mag], ['RELOAD', st.reload.toFixed(1) + ' s'], ['RANGE', W.range + ' m']]
      .map(([k, v]) => `<div><span>${k}</span><em>${v}</em></div>`).join('');
    el.classList.remove('hidden', 'on');
    el.classList.toggle('replay', replay);
    // the renderer and the little set (a fresh canvas each time: a context that was let go cannot be used again)
    const cv = document.createElement('canvas');
    this.canvas.replaceWith(cv); this.canvas = cv;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false });
    r.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    const sc = this.scene = new THREE.Scene();
    sc.background = new THREE.Color(0x07090b);
    sc.fog = new THREE.Fog(0x07090b, 4, 11);
    const cam = this.cam = new THREE.PerspectiveCamera(32, 1, 0.05, 40);
    sc.add(new THREE.HemisphereLight(0x8aa0c0, 0x120d08, 0.5));
    const key = new THREE.SpotLight(0xffe2b8, 55, 12, 0.55, 0.6, 1.4);
    key.position.set(0.6, 4.2, 0.9); key.target.position.set(0, 0.4, 0);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005;
    sc.add(key, key.target);
    const rim = new THREE.DirectionalLight(0x6fb0ff, 1.3); rim.position.set(-3, 2, -3); sc.add(rim);
    // the work light's beam in the dust, and the dust itself
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4.2, 32, 1, true).translate(0, -2.1, 0), new THREE.MeshBasicMaterial({ map: tex('tex/cone.webp'), color: 0xffd8a0, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(0.3, 4.3, 0.3); sc.add(beam);
    const N = 160, dp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const a = Math.random() * 6.28, r0 = Math.random() * 1.5; dp.set([Math.cos(a) * r0, Math.random() * 3.5, Math.sin(a) * r0], i * 3); }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.motes = new THREE.Points(dg, new THREE.PointsMaterial({ map: tex('tex/soft.webp'), color: 0xffe0b0, size: 0.03, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    sc.add(this.motes);
    this.inner = new THREE.PointLight(0xffc070, 0, 3, 1.5); this.inner.position.set(0, 0.45, 0); sc.add(this.inner);
    this.flashL = new THREE.PointLight(0xffb060, 0, 6, 1.5); sc.add(this.flashL);
    // the floor: concrete under the work light
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a3936, roughness: 0.85, map: tex('tex/concrete_albedo.webp', { repeat: true }) }));
    if (fl.material.map) fl.material.map.repeat.set(6, 6);
    fl.receiveShadow = true; sc.add(fl);
    // the crate
    const base = this.base = gear('crate_base'), lid = this.lid = gear('crate_lid');
    base.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    const crate = this.crate = new THREE.Group();
    lid.position.set(0, 0.34, -0.25);        // its hinge: the back top edge
    crate.add(base, lid);
    crate.rotation.y = -0.25;
    sc.add(crate);
    // light spilling out of it
    this.spill = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.42).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd090, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.spill.position.set(0, 0.33, 0); crate.add(this.spill);
    // the gun
    const gun = this.gun = (await loadWeapon(WEAPONS[id].model)).clone(true);
    if (this.id !== id || !this.renderer) return;
    gun.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); o.material.envMapIntensity = 1; } });
    if (st.gold) gun.traverse((o) => { if (o.isMesh && !(o.material.emissive?.getHex())) { o.material.color.setHex(0xd8a640); o.material.metalness = 1; o.material.roughness = 0.3; } });
    const g = this.gunRoot = new THREE.Group();
    const len = { pistol: 0.3, smg: 0.6, shotgun: 1.05, rifle: 0.95, lmg: 1.15, riot12: 1.05 }[id] || 0.8;
    const k = Math.min(1.6, 1.0 / len);         // as big as fits in the crate
    gun.scale.setScalar(k);
    const bb = new THREE.Box3().setFromObject(gun);
    gun.position.x = -(bb.min.x + bb.max.x) / 2;     // turn it about its middle, not the grip
    gun.position.y = -(bb.min.y + bb.max.y) / 2;
    g.add(gun);
    g.position.set(0, 0.16, 0);
    g.visible = false;
    this.tip = new THREE.Object3D(); this.tip.position.set(...WEAPONS[id].tip); gun.add(this.tip);
    this.slide = gun.getObjectByName('gun_slide');
    this.slide0 = this.slide ? this.slide.position.x : 0;
    this.crate.add(g);
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: tex('tex/muzzle.webp'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    sc.add(this.flash);
    this.dust = [];
    this.kick = 0; this.shake = 0; this.fired = 0;
    this.resize();
    this._onResize = () => this.resize();
    addEventListener('resize', this._onResize);
    if (!replay) audio.play('sting', { vol: 0.55, jitter: 0 });
    this.last = performance.now();
    const loop = (now) => {
      if (!this.renderer) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(dt, now);
      this.renderer.render(this.scene, this.cam);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  resize() {
    if (!this.renderer) return;
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
  }

  step(dt, now) {
    // on the wall clock: a slow phone sees the same timing (a few dropped frames, never a slow-motion lid)
    this.t0 ??= now - this.t * 1000;
    const t = this.t = (now - this.t0) / 1000;
    // camera: in from the dark, settling into a low 3/4 view; the gun sits to the left of the card
    const k = sm(t / 2.2);
    const wide = innerWidth / innerHeight > 1.3;
    this.cam.position.set(wide ? 0.72 : 0.1, 1.45 + 0.9 * (1 - k), 3.6 + 1.6 * (1 - k));
    this.cam.lookAt(wide ? 0.85 : 0.0, 0.6, 0);
    this.motes.rotation.y += dt * 0.05;
    const mp = this.motes.geometry.attributes.position;
    for (let i = 0; i < mp.count; i++) { let y = mp.getY(i) - dt * 0.05; if (y < 0) y += 3.5; mp.setY(i, y); }
    mp.needsUpdate = true;
    if (this.shake > 0) { this.shake -= dt; this.cam.position.x += (Math.random() - 0.5) * this.shake * 0.05; this.cam.position.y += (Math.random() - 0.5) * this.shake * 0.05; }
    // the latches (0.8 s), the lid (1.0 - 1.9 s) with light spilling out
    if (!this.replay && t > 0.75 && !this.latched) { this.latched = true; audio.play('crate', { vol: 0.9, jitter: 0 }); }
    const rattle = t > 0.3 && t < 0.9 ? Math.sin(t * 70) * 0.008 * (1 - (t - 0.3) / 0.6) : 0;
    this.crate.position.x = rattle;
    const lidU = sm((t - 1.0) / 0.9);
    this.lid.rotation.x = -lidU * 1.95 - Math.sin(Math.min(1, Math.max(0, (t - 1.9) / 0.5)) * Math.PI) * 0.06;
    this.spill.material.opacity = lidU * 0.16;
    this.inner.intensity = lidU * 2.2;
    if (t > 1.0 && t < 1.6 && Math.random() < dt * 30) this.dust.push({ x: (Math.random() - 0.5) * 1, y: 0.35, z: (Math.random() - 0.5) * 0.4, vy: 0.4 + Math.random() * 0.3, t: 0 });
    // the gun rises out of it and turns slowly in the light
    const up = sm((t - 1.7) / 1.1);
    const g = this.gunRoot;
    if (g) {
      g.visible = t > 1.15;
      g.position.y = 0.16 + up * 0.62 + Math.sin(t * 1.3) * 0.02 * up;
      if (this.fired > 0) {
        // held still and side on while test-firing
        { const want = Math.round(g.rotation.y / (Math.PI * 2)) * Math.PI * 2 + 0.25; g.rotation.y += (want - g.rotation.y) * Math.min(1, dt * 8); }
        this.fired -= dt;
      } else g.rotation.y = 0.2 + Math.sin(Math.max(0, t - 2.4) * 0.55) * 0.6;     // it presents itself, side on, turning a little
      g.rotation.z = Math.sin(t * 0.7) * 0.05 * up - this.kick * 0.25;
      g.position.x = -this.kick * 0.04;
      this.kick = Math.max(0, this.kick - dt * 8);
      if (this.slide) this.slide.position.x = this.slide0 - Math.min(0.03, this.kick * 0.04);
    }
    this.flash.material.opacity = Math.max(0, this.flash.material.opacity - dt * 25);
    this.flashL.intensity = Math.max(0, this.flashL.intensity - dt * 200);
    if (t > 2.5 && !this.el.classList.contains('on')) this.el.classList.add('on');
  }

  fire() {
    if (!this.gunRoot || !this.renderer) return;
    const W = WEAPONS[this.id];
    const go = () => {
      if (!this.renderer) return;
      this.fired = 1.2;
      this.kick = 1;
      this.shake = 0.25;
      const p = this.tip.getWorldPosition(new THREE.Vector3());
      this.flash.position.copy(p);
      this.flash.lookAt(this.cam.position);
      this.flash.material.opacity = 1;
      this.flash.scale.setScalar(W.pellets ? 1.6 : 1);
      this.flashL.position.copy(p); this.flashL.intensity = 40;
      audio.play(W.shot, { vol: 0.9, jitter: 0.03 });
    };
    // a burst for the automatics, one for the rest
    const n = W.id === 'smg' || W.id === 'rifle' || W.id === 'lmg' || W.id === 'riot12' ? 4 : 1;
    for (let i = 0; i < n; i++) setTimeout(go, i * W.autoInterval * 1000);
    if (W.pump) setTimeout(() => audio.play('pump', { vol: 0.8 }), 450);
  }

  hide() {
    cancelAnimationFrame(this.raf);
    if (this._onResize) removeEventListener('resize', this._onResize);
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss?.();
      this.renderer = null;
    }
    this.latched = false;
    this.el.classList.add('hidden');
    this.el.classList.remove('on');
  }
}
