import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 800 }, deviceScaleFactor: Number(process.env.DSF ?? 1) });
page.on('console', (m) => (m.type() === 'error') && console.error('[page]', m.text())); page.on('response', (r) => r.status() >= 400 && console.error('[http]', r.status(), r.url()));
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
for (const size of (process.env.SIZES ?? '1400').split(',')) {
  await page.goto(`http://127.0.0.1:5617/scripts/_scratch/gpu-bench.html?size=${size}&n=${process.env.N ?? 120}&taus=${process.env.TAUS ?? '0.3,0.5,0.7,1.0,1.5,2.2,3.0,-1'}&dbg=${process.env.DBG ?? ''}&variants=${process.env.VARIANTS ?? 'full'}&tq=${process.env.TQ ?? ''}&rounds=${process.env.ROUNDS ?? 9}&globals=${encodeURIComponent(process.env.GLOBALS ?? "{}")}${process.env.W ? `&w=${process.env.W}&h=${process.env.H}&dpr=${process.env.DPR}` : ""}`);
  await page.waitForFunction(() => (window as any).__bench, null, { timeout: 150_000 });
  console.log(JSON.stringify(await page.evaluate(() => (window as any).__bench), null, 1));
}
await browser.close();
