// node adv.mjs <url> <out.png> <advanceSecs> [w h] [extra js]
import { chromium } from 'playwright-core';
const [url, out, secs, w = '1280', h = '600', extra = ''] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text()); });
await p.goto(url);
await p.waitForFunction('window.__ready === true', null, { timeout: 90000 });
if (extra) console.log(JSON.stringify(await p.evaluate(extra)));
const t = await p.evaluate((s) => window.__advance(+s), secs);
await p.waitForTimeout(2500);
console.log('game time', t, JSON.stringify(await p.evaluate(() => { const g = window.__game(); return { phase: g.phase, wave: g.wave, zombies: [...g.zombies.values()].filter(z => z.alive).length, dead: [...g.zombies.values()].filter(z => !z.alive).length, hp: g.me.hp, kills: g.stats.kills, shots: g.stats.shots }; })));
await p.screenshot({ path: out });
await b.close();
