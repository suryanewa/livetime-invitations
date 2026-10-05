/** Judge's frame renderer (copy of the steam owner's dinner-frames approach): Playwright virtual clock, 16 ms ticks.
 *  node --experimental-transform-types frames.ts <outDir> <mode accept|decline> <seconds> [every]
 *  env VIEW=square|laptop|phone (square: captureStill(SIZE,1); else page screenshot), SIZE, SCHEDULE="500:decline,700:accept",
 *  FROM (first ms saved), CLIP="x,y,w,h" (page-screenshot clip, CSS px), DEBUG (__steamDebug). */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
const [outDir, mode = 'accept', secondsArg = '6', everyArg = '1'] = process.argv.slice(2);
const seconds = Number(secondsArg), every = Number(everyArg);
const view = process.env.VIEW ?? 'square', size = Number(process.env.SIZE ?? 720), from = Number(process.env.FROM ?? 0);
const vp = view === 'laptop' ? { width: 1280, height: 720, dpr: 2 } : view === 'phone' ? { width: 390, height: 844, dpr: 3 } : { width: 1200, height: 1000, dpr: 1 };
const clip = process.env.CLIP ? (([x, y, width, height]) => ({ x, y, width, height }))(process.env.CLIP.split(',').map(Number)) : undefined;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('[console]', m.text().slice(0, 1500)); });
await page.clock.install();
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5617}/?scene=dinner`);
const call = <T,>(fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => new Function('s', 'a', `return (${f})(s, a)`)((window as any).__showcase, a), [fn, args] as const) as Promise<T>;
const tick = (ms: number) => page.clock.runFor(ms);
for (let i = 0; i < 400; i++) { if ((await call<string>('(s) => s.state?.resource')) === 'ready') break; await tick(50); await page.waitForTimeout(10); }
await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
await tick(1000);
if (process.env.STATS) await page.evaluate(() => { (window as any).__steamStats = []; });
if (process.env.FWDCUR) await page.evaluate(() => { (window as any).__steamFwdCur = true; });
if (process.env.NOTAA) await page.evaluate(() => { (window as any).__steamNoTaa = true; });
if (process.env.GLOBALS) await page.evaluate((g) => Object.assign(window as any, JSON.parse(g)), process.env.GLOBALS);
if (process.env.DEBUG) await page.evaluate((d) => { (window as any).__steamDebug = Number(d); }, process.env.DEBUG);
await mkdir(outDir, { recursive: true });
// (WARM: let the deferred bin load and warm in real time before the sequence.)
if (process.env.WARM) { for (let i = 0; i < Number(process.env.WARM) / 50; i++) { await tick(50); await page.waitForTimeout(40); } }
if (process.env.TIER) { await call(`(s) => s.controller.setQualityTier('${process.env.TIER}')`); await tick(500); }
await call('(s) => s.controller.setReducedMotion(false)');
await call('(s) => s.controller.setMode("guest")');
await tick(300);
await call(`(s) => s.controller.chooseResponse("${mode}")`);
const FRAME_MS = 16;
const schedule = new Map((process.env.SCHEDULE ?? '').split(',').filter(Boolean).map((e) => { const [ms, intent] = e.split(':'); return [Math.round(Number(ms) / FRAME_MS), intent!] as const; }));
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',').map(Number)) : null;
const total = only ? Math.max(...only) : Math.round((seconds * 1000) / FRAME_MS);
const t0 = performance.now();
for (let i = 0; i <= total; i++) {
  if (schedule.has(i)) await call(`(s) => s.controller.chooseResponse("${schedule.get(i)}")`);
  if (only ? only.has(i) : (i % every === 0 && i * FRAME_MS >= from)) {
    const file = join(outDir, `f${String(i).padStart(4, '0')}.png`);
    if (view === 'square') { const url = await call<string>('(s, a) => s.controller.captureStill(a[0], 1)', size); await writeFile(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')); }
    else await page.screenshot({ path: file, clip, timeout: 0 });
  }
  await tick(FRAME_MS);
}
if (process.env.PROBE) console.log(JSON.stringify(await page.evaluate(() => (window as any).__steamProbe)));
console.log(`${total + 1} frames in ${((performance.now() - t0) / 1000).toFixed(1)} s; visual ${await call<string>('(s) => s.state.visual')}`);
await browser.close();
