// node shot.mjs <url> <out.png> [w h] [waitMs]
import { chromium } from 'playwright-core';
const [url, out, w = '1280', h = '720', wait = '1500'] = process.argv.slice(2);
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
p.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
p.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
await p.goto(url);
try { await p.waitForFunction('window.__ready === true', null, { timeout: 60000 }); } catch (e) { logs.push('TIMEOUT waiting for __ready'); }
await p.waitForTimeout(+wait);
await p.screenshot({ path: out });
console.log(logs.filter((l) => !l.includes('GPU stall')).slice(0, 30).join('\n'));
await b.close();
