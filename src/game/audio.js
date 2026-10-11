// WebAudio: decoded buffers, positional one-shots (equal-power panning —
// HRTF is too expensive on low-end phones), voice caps for the horde, and
// ambience ducking after each shot.
const BASE = import.meta.env.BASE_URL + 'assets/sfx/';

const LIST = [
  'pistol0', 'pistol1', 'pistol2', 'pistol3', 'dryfire', 'mag_release', 'mag_drop', 'mag_out', 'mag_in', 'slide', 'gate', 'rotor',
  'shell0', 'shell1', 'shell2', 'flesh0', 'flesh1', 'flesh2', 'hard0', 'hard1',
  'step0', 'step1', 'step2', 'step3', 'groan0', 'groan1', 'groan2', 'groan3', 'groan4', 'groan5',
  'scream0', 'scream1', 'death0', 'death1', 'hurt0', 'hurt1', 'thunder0', 'thunder1',
  'rain', 'wind', 'siren', 'sting', 'heart', 'click',
];

class Audio {
  constructor() {
    this.ctx = null;
    this.buf = {};
    this.voices = new Set();
    this.listener = { x: 0, z: 0 };
    this.enabled = true;
  }

  // must be called from a user gesture (iOS)
  async unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = 0.9;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain();
      this.sfx.connect(this.master);
      this.amb = c.createGain();
      this.amb.gain.value = 0.55;
      this.amb.connect(this.master);
      this.loadAll();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  async loadAll() {
    await Promise.all(LIST.map(async (n) => {
      try {
        const r = await fetch(BASE + n + '.mp3');
        const ab = await r.arrayBuffer();
        this.buf[n] = await this.ctx.decodeAudioData(ab);
      } catch (e) { console.warn('sfx', n, e); }
    }));
    this.ready = true;
    this.onReady?.();
  }

  setListener(x, z) { this.listener.x = x; this.listener.z = z; }

  // name may be a prefix with variants: 'pistol' -> pistol0..3
  play(name, { x = null, z = null, vol = 1, rate = 1, jitter = 0.04, maxDist = 30, bus = 'sfx', loop = false } = {}) {
    if (!this.ctx || !this.enabled) return null;
    let key = name;
    if (!this.buf[key]) {
      const vs = Object.keys(this.buf).filter((k) => k.startsWith(name) && /\d$/.test(k));
      if (!vs.length) return null;
      key = vs[(Math.random() * vs.length) | 0];
    }
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.buf[key];
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);
    src.loop = loop;
    const g = c.createGain();
    let v = vol;
    let node = src;
    if (x !== null) {
      const dx = x - this.listener.x, dz = z - this.listener.z;
      const d = Math.hypot(dx, dz);
      if (d > maxDist) return null;
      v *= 1 / (1 + d * d * 0.012);
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, dx / 12));
      src.connect(p);
      node = p;
    }
    g.gain.value = v;
    node.connect(g).connect(bus === 'amb' ? this.amb : this.sfx);
    src.start();
    const voice = { src, g, name };
    this.voices.add(voice);
    src.onended = () => this.voices.delete(voice);
    return voice;
  }

  // horde voices: at most `cap` zombie sounds at once
  zombie(name, x, z, vol = 1) {
    let n = 0;
    for (const v of this.voices) if (v.name.startsWith('groan') || v.name.startsWith('scream')) n++;
    if (n >= 6) return null;
    return this.play(name, { x, z, vol, jitter: 0.08, maxDist: 26 });
  }

  duck(amount = 0.5, ms = 150) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const g = this.amb.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.55 * amount, now + 0.01);
    g.linearRampToValueAtTime(0.55, now + ms / 1000 + 0.2);
  }

  ambience() {
    if (this.ambOn || !this.ready) return;
    this.ambOn = true;
    this.play('rain', { vol: 0.5, loop: true, jitter: 0, bus: 'amb' });
    this.play('wind', { vol: 0.35, loop: true, jitter: 0, bus: 'amb' });
  }

  stopAll() {
    for (const v of this.voices) { try { v.src.stop(); } catch (e) { /* already stopped */ } }
    this.voices.clear();
    this.ambOn = false;
  }
}

export const audio = new Audio();

// Haptics (Android; iOS Safari has no vibrate). Throttled so a horde
// doesn't turn into constant buzzing.
let lastBuzz = 0;
export function buzz(pattern) {
  const now = performance.now();
  if (now - lastBuzz < 60) return;
  lastBuzz = now;
  try { navigator.vibrate?.(pattern); } catch (e) { /* not supported */ }
}
