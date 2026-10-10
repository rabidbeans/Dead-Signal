// Renderer, post-processing and the frame budget.
//
// Mobile budget from design/research.md: pixel ratio <= 1.5 with dynamic
// resolution (step down when a 1 s average exceeds 18 ms, back up under
// 13 ms), one merged post pass (bloom with a high threshold so only muzzle
// flashes, fire and lamps bloom; vignette; grain; grade), and only the
// flashlights cast shadows.
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, VignetteEffect, NoiseEffect,
  ToneMappingEffect, ToneMappingMode, BlendFunction, BrightnessContrastEffect, HueSaturationEffect,
  ChromaticAberrationEffect,
} from 'postprocessing';
import { setAnisotropy } from './assets.js';

export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export class Engine {
  constructor(canvas) {
    const r = new THREE.WebGLRenderer({
      canvas, antialias: false, stencil: false, depth: true,
      powerPreference: 'high-performance',
    });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;   // tone mapping is a post effect
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    setAnisotropy(r);
    this.maxDpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);
    this.dpr = this.maxDpr;
    this.minDpr = isTouch ? 0.75 : 1;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.5, 120);
    this.composer = new EffectComposer(r, { frameBufferType: THREE.HalfFloatType, multisampling: isTouch ? 0 : 4 });
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new BloomEffect({
      luminanceThreshold: 0.82, luminanceSmoothing: 0.12, intensity: 1.15, mipmapBlur: true, radius: 0.72,
    });
    this.vignette = new VignetteEffect({ offset: 0.35, darkness: 0.4 });
    this.noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
    this.noise.blendMode.opacity.value = 0.11;
    this.grade = new HueSaturationEffect({ saturation: -0.06, hue: 0 });
    this.contrast = new BrightnessContrastEffect({ contrast: 0.14, brightness: 0.05 });
    this.tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    this.chroma = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0006, 0.0004), radialModulation: true, modulationOffset: 0.4 });
    this.composer.addPass(new EffectPass(this.camera, this.bloom, this.tone, this.grade, this.contrast, this.vignette, this.chroma, this.noise));
    this.frameTimes = [];
    this.lastAdjust = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep about 22 m of street across the long side of the screen
    const longSide = Math.max(w, h);
    this.camera.fov = w >= h ? 34 : 50;
    this.camera.updateProjectionMatrix();
    this.w = w; this.h = h; this.longSide = longSide;
  }

  // dynamic resolution
  budget(dtMs, now) {
    this.frameTimes.push(dtMs);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    if (now - this.lastAdjust < 1000 || this.frameTimes.length < 60) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    let d = this.dpr;
    if (avg > 18.5 && d > this.minDpr) d = Math.max(this.minDpr, d - 0.125);
    else if (avg < 13 && d < this.maxDpr) d = Math.min(this.maxDpr, d + 0.125);
    if (d === this.minDpr && avg > 24 && !this.lowTier) { this.lowTier = true; this.onLowTier?.(); }
    if (d !== this.dpr) {
      this.dpr = d;
      this.resize();
      this.frameTimes.length = 0;
    }
    this.lastAdjust = now;
  }

  render(dt) {
    this.composer.render(dt);
  }
}

// A dim, cool night environment for reflections: a gradient sky with a few
// warm smudges of city glow, so wet paint and puddles have something to show.
export function nightEnvironment(renderer) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#05070b');
  sky.addColorStop(0.45, '#0d1219');
  sky.addColorStop(0.5, '#1c1a18');
  sky.addColorStop(0.55, '#0a0b0c');
  sky.addColorStop(1, '#030303');
  g.fillStyle = sky;
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 9; i++) {
    const x = (i * 57 + 20) % 512, y = 112 + (i % 3) * 6;
    const rg = g.createRadialGradient(x, y, 0, x, y, 40 + (i % 4) * 12);
    rg.addColorStop(0, i % 3 === 0 ? 'rgba(255,170,90,0.5)' : 'rgba(140,170,220,0.25)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 512, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromEquirectangular(t).texture;
  pm.dispose();
  t.dispose();
  return env;
}
