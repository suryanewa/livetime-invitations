/** (v1.7 dinner card: the judges' evidence/v1.6/verification/pace-scene.ts with BASE and the close-up's window, M0/M1 frames.) Real-time pacing of a scene's accept (SCENE=dinner|birthday, W0/W1 = the effect window in frames): rAF intervals over the whole accept (no virtual clock). VIEW=laptop|phone, RUNS. */
import { chromium } from 'playwright-core';
const view = process.env.VIEW ?? 'laptop';
const vp = view === 'phone' ? { width: 390, height: 844, dpr: 3 } : { width: 1280, height: 720, dpr: 2 };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
if (process.env.GLOBALS) await page.addInitScript((g) => Object.assign(window as any, JSON.parse(g)), process.env.GLOBALS);
await page.goto(`${process.env.BASE ?? "http://127.0.0.1:5701"}/?scene=${process.env.SCENE ?? "dinner"}`);
const call = <T,>(fn: string) => page.evaluate((f) => new Function('s', `return (${f})(s)`)((window as any).__showcase), fn) as Promise<T>;
for (let i = 0; i < 200; i++) { if ((await call<string>('(s) => s.state?.resource')) === 'ready') break; await page.waitForTimeout(50); }
await page.waitForTimeout(2500); // the deferred bin warms
await call('(s) => s.controller.setReducedMotion(false)');
await call('(s) => s.controller.setMode("guest")');
await page.waitForTimeout(400);
const out: number[][] = [];
for (let run = 0; run < Number(process.env.RUNS ?? 3); run++) {
  if (run > 0 && process.env.RELOAD) {
    // a fresh guest-ready start for every run (Birthday: lit candles -> blow -> smoke)
    await page.goto(`${process.env.BASE ?? "http://127.0.0.1:5701"}/?scene=${process.env.SCENE ?? "dinner"}`);
    for (let i = 0; i < 200; i++) { if ((await call<string>('(s) => s.state?.resource')) === 'ready') break; await page.waitForTimeout(50); }
    await page.waitForTimeout(2500);
    await call('(s) => s.controller.setReducedMotion(false)');
    await call('(s) => s.controller.setMode("guest")');
    await page.waitForTimeout(400);
  } else if (run > 0) { await call('(s) => s.controller.chooseResponse("decline")'); await page.waitForTimeout(3500); }
  await page.evaluate(() => { const w = window as any; w.__dts = []; let last = performance.now(); const tick = (t: number) => { w.__dts.push(t - last); last = t; if (w.__dts.length < 420) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  const v0 = await call<string>('(s) => s.state.visual');
  await call('(s) => s.controller.chooseResponse("accept")');
  await page.waitForTimeout(600);
  const v1 = await call<string>('(s) => s.state.visual');
  await page.waitForTimeout(6600);
  console.log(`state before ${v0} | 0.6 s after accept ${v1} | end ${await call<string>('(s) => s.state.visual')}`);
  out.push((await page.evaluate(() => (window as any).__dts)).slice(2));
}
const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]!;
for (const [i, d] of out.entries()) {
  const steam = d.slice(Number(process.env.W0 ?? 15), Number(process.env.W1 ?? 360)); // the effect window (frames)
  const move = d.slice(Number(process.env.M0 ?? 168), Number(process.env.M1 ?? 270)); // v1.7: the close-up's move (τ 2.8–4.5 s)
  console.log(`${view} run ${i}: frames ${d.length} | all p50 ${q(d, 0.5).toFixed(2)} p95 ${q(d, 0.95).toFixed(2)} max ${Math.max(...d).toFixed(1)} | move window p95 ${q(move, 0.95).toFixed(2)} max ${Math.max(...move).toFixed(1)} | steam window p95 ${q(steam, 0.95).toFixed(2)} >20ms ${d.filter((x) => x > 20).length}${d.some((x) => x > 20) ? ' at frames ' + d.map((x, k) => (x > 20 ? k : -1)).filter((k) => k >= 0).join(',') : ''}`);
}
await browser.close();
