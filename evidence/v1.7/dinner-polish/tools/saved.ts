/** ?saved=accept on load: a screenshot while the poster shows (before ready), and after the live scene is ready. VIEW=laptop|phone */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const view = process.env.VIEW ?? 'laptop';
const vp = view === 'phone' ? { width: 390, height: 844, dpr: 3 } : { width: 1280, height: 720, dpr: 2 };
const out = `saved/${view}`; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr });
// Hold the GLB so the poster stays up long enough to photograph it.
let release: () => void = () => {};
const gate = new Promise<void>((r) => (release = r));
await page.route('**/*.glb', async (route) => { await gate; await route.continue(); });
await page.clock.install();
await page.goto(`http://127.0.0.1:5704/?scene=dinner&saved=accept`);
for (let i = 0; i < 40; i++) { await page.clock.runFor(50); await page.waitForTimeout(30); }
const st0 = await page.evaluate(() => (window as any).__showcase?.state?.resource + ' / ' + (window as any).__showcase?.state?.visual);
await page.screenshot({ path: `${out}/a-poster.png` });
const posterInfo = await page.evaluate(() => [...document.querySelectorAll('img, [style*="background"]')].map((e) => (e as HTMLImageElement).currentSrc || getComputedStyle(e).backgroundImage).filter((s) => s && s !== 'none').slice(0, 8));
release();
for (let i = 0; i < 600; i++) { if (await page.evaluate(() => (window as any).__showcase?.state?.resource === 'ready' && (window as any).__showcase.controller.deferredReady())) break; await page.clock.runFor(50); await page.waitForTimeout(15); }
// The entrance (220 ms) and a beat.
for (let i = 0; i < 40; i++) { await page.clock.runFor(16); }
await page.screenshot({ path: `${out}/b-live.png` });
const fr = await page.evaluate(() => { const c = (window as any).__showcase.controller.framing(); return [c.close, c.pull, (window as any).__showcase.state.visual]; });
console.log(view, 'before:', st0, '| after:', JSON.stringify(fr), '| images:', JSON.stringify(posterInfo));
await browser.close();
