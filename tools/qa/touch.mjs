import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://127.0.0.1:5173/?play');
await p.waitForFunction('window.__ready === true', null, { timeout: 90000 });
await p.evaluate(() => { const g = window.__game(); g.hud.el.banner.classList.remove('on'); g.phase = 'test'; g.addZombie(950, { type: 'shambler', seed: 5, x: 5, z: -4 }); });
const cdp = await ctx.newCDPSession(p);
const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 10, radiusY: 10, force: 1 })) });
// left thumb down at (150, 280), right thumb down at (650, 250)
await T('touchStart', [[150, 280, 1]]);
await T('touchStart', [[150, 280, 1], [650, 250, 2]]);
for (let i = 1; i <= 8; i++) {
  await T('touchMove', [[150 + i * 6, 280 - i * 4, 1], [650 + i * 7, 250 - i * 5, 2]]);
  await p.evaluate(() => window.__advance(0.15));
}
const before = await p.evaluate(() => { const g = window.__game(); return { x: g.me.x, z: g.me.z, ammo: g.me.ammo, face: g.me.face, aim: g.me.aiming, sticks: Object.values(g.input.sticks).map(s => s.kind) }; });
await p.evaluate(() => window.__advance(1.0));
await p.waitForTimeout(1500);
await p.screenshot({ path: '/home/user/dead-signal/qa/touch.png' });
const after = await p.evaluate(() => { const g = window.__game(); return { x: +g.me.x.toFixed(2), z: +g.me.z.toFixed(2), ammo: g.me.ammo, face: +g.me.face.toFixed(2) }; });
await T('touchEnd', []);
console.log('during', JSON.stringify(before));
console.log('after ', JSON.stringify(after));
await b.close();
