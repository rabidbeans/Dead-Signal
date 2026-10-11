// Twin-stick touch controls, with keyboard + mouse for desktop testing.
//
// From design/research.md:
//  - both sticks FLOAT: the base appears where the thumb lands (left half
//    moves, right half aims); radius ~60 px; if the thumb runs past the rim
//    the base follows on a leash so the thumb never "falls off" the stick.
//  - RADIAL dead zone (12%), rescaled, with a 1.5 power curve for movement.
//  - right stick: past 0.2 it aims, past 0.5 (or held 120 ms) it fires.
//  - a quick tap on the right side fires one aim-assisted shot.
//  - pointer ids + setPointerCapture; touch-action: none.
export class Input {
  constructor(el, hud) {
    this.el = el;
    this.hud = hud;
    this.move = { x: 0, y: 0 };      // screen space, y down; magnitude 0..1
    this.aim = { x: 0, y: 0, mag: 0 };
    this.firing = false;
    this.tapShot = false;
    this.reloadPressed = false;
    this.slotPressed = null;
    this.swapPressed = false;
    this.sticks = {};               // pointerId -> stick
    this.R = 62;
    this.mouse = null;
    this.keys = new Set();
    el.addEventListener('pointerdown', (e) => this.down(e), { passive: false });
    el.addEventListener('pointermove', (e) => this.moveEv(e), { passive: false });
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyR') this.reloadPressed = true;
      if (e.code === 'Digit1') this.slotPressed = 0;
      if (e.code === 'Digit2') this.slotPressed = 1;
      if (e.code === 'KeyQ') this.swapPressed = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    this.mouseAim = null;   // for desktop: the cursor in screen px
  }

  side(e) { return e.clientX < innerWidth * 0.5 ? 'move' : 'aim'; }

  down(e) {
    if (e.pointerType === 'mouse') {
      this.mouseAim = { x: e.clientX, y: e.clientY };
      if (e.button === 0) this.mouseDown = true;
      return;
    }
    e.preventDefault();
    const kind = this.side(e);
    if (Object.values(this.sticks).some((s) => s.kind === kind)) return;
    try { this.el.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
    this.sticks[e.pointerId] = { kind, bx: e.clientX, by: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), maxMag: 0 };
    this.hud?.stick(kind, e.clientX, e.clientY, e.clientX, e.clientY, true);
  }

  moveEv(e) {
    if (e.pointerType === 'mouse') { this.mouseAim = { x: e.clientX, y: e.clientY }; return; }
    const s = this.sticks[e.pointerId];
    if (!s) return;
    e.preventDefault();
    s.x = e.clientX; s.y = e.clientY;
    let dx = s.x - s.bx, dy = s.y - s.by;
    const d = Math.hypot(dx, dy);
    if (d > this.R) {               // leash: drag the base behind the thumb
      const k = (d - this.R) / d;
      s.bx += dx * k; s.by += dy * k;
      dx = s.x - s.bx; dy = s.y - s.by;
    }
    this.hud?.stick(s.kind, s.bx, s.by, s.x, s.y, true);
  }

  up(e) {
    if (e.pointerType === 'mouse') { if (e.button === 0) this.mouseDown = false; return; }
    const s = this.sticks[e.pointerId];
    if (!s) return;
    if (s.kind === 'aim' && performance.now() - s.t0 < 180 && s.maxMag < 0.35) this.tapShot = true;
    delete this.sticks[e.pointerId];
    this.hud?.stick(s.kind, 0, 0, 0, 0, false);
  }

  // sample once per frame
  poll(dt) {
    if (this.override) return this.override(dt);
    let mv = { x: 0, y: 0 }, aim = null, firing = false;
    for (const s of Object.values(this.sticks)) {
      const dx = (s.x - s.bx) / this.R, dy = (s.y - s.by) / this.R;
      const m = Math.min(1, Math.hypot(dx, dy));
      s.maxMag = Math.max(s.maxMag, m);
      if (s.kind === 'move') {
        const dz = 0.12;
        if (m > dz) {
          const k = Math.pow((m - dz) / (1 - dz), 1.5) / m;
          mv = { x: dx * k, y: dy * k };
        }
      } else if (m > 0.2) {
        aim = { x: dx / m, y: dy / m, mag: m };
        const held = performance.now() - s.t0;
        firing = m > 0.5 || held > 120;
      }
    }
    // keyboard + mouse
    const k = this.keys;
    const kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const ky = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    if (kx || ky) { const l = Math.hypot(kx, ky); mv = { x: kx / l, y: ky / l }; }
    this.move = mv;
    this.aim = aim;
    this.firing = firing;
    this.mouseFiring = !!this.mouseDown;
    const tap = this.tapShot; this.tapShot = false;
    const rl = this.reloadPressed; this.reloadPressed = false;
    const slot = this.slotPressed; this.slotPressed = null;
    const swap = this.swapPressed; this.swapPressed = false;
    return { move: mv, aim, firing, tap, reload: rl, slot, swap, mouse: this.mouseAim, mouseFiring: this.mouseFiring };
  }
}
