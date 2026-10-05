/** Real-time pacing of the Dinner accept: rAF intervals over the whole accept (no virtual clock). VIEW=laptop|phone, RUNS. */
import { chromium } from 'playwright-core';
const view = process.env.VIEW ?? 'laptop';
const vp = view === 'phone' ? { width: 390, height: 844, dpr: 3 } : { width: 1280, height: 720, dpr: 2 };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
if (process.env.GLOBALS) await page.addInitScript((g) => Object.assign(window as any, JSON.parse(g)), process.env.GLOBALS);
await page.goto(`http://127.0.0.1:5619/?scene=dinner`);
const call = <T,>(fn: string) => page.evaluate((f) => new Function('s', `return (${f})(s)`)((window as any).__showcase), fn) as Promise<T>;
for (let i = 0; i < 200; i++) { if ((await call<string>('(s) => s.state?.resource')) === 'ready') break; await page.waitForTimeout(50); }
await page.waitForTimeout(2500); // the deferred bin warms
await call('(s) => s.controller.setReducedMotion(false)');
await call('(s) => s.controller.setMode("guest")');
await page.waitForTimeout(400);
const out: number[][] = [];
for (let run = 0; run < Number(process.env.RUNS ?? 3); run++) {
  if (run > 0) { await call('(s) => s.controller.chooseResponse("decline")'); await page.waitForTimeout(3500); }
  await page.evaluate(() => { const w = window as any; w.__dts = []; let last = performance.now(); const tick = (t: number) => { w.__dts.push(t - last); last = t; if (w.__dts.length < 420) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await call('(s) => s.controller.chooseResponse("accept")');
  await page.waitForTimeout(7200);
  out.push((await page.evaluate(() => (window as any).__dts)).slice(2));
}
const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]!;
for (const [i, d] of out.entries()) {
  const steam = d.slice(15, 360); // ≈ 0.25–6 s of the accept: the steam's window
  console.log(`${view} run ${i}: frames ${d.length} | all p50 ${q(d, 0.5).toFixed(2)} p95 ${q(d, 0.95).toFixed(2)} max ${Math.max(...d).toFixed(1)} | steam window p95 ${q(steam, 0.95).toFixed(2)} >20ms ${d.filter((x) => x > 20).length}`);
}
await browser.close();
