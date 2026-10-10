// node probe.mjs <url> <js-expression> [waitMs]
import { chromium } from 'playwright-core';
const [url, expr, wait = '4000'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 600 } });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text()); });
await p.goto(url);
await p.waitForFunction('window.__ready === true', null, { timeout: 60000 });
await p.waitForTimeout(+wait);
console.log(JSON.stringify(await p.evaluate(expr), null, 1));
await b.close();
