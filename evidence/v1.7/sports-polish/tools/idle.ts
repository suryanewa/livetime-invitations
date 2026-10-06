/** The judges' idle probe (judge-net/tools/idle.ts) for any sequence (SEQ, default decline): rAF calls per 0.5 s after the tap, and the last. */
import { chromium } from 'playwright-core';
const [base] = process.argv.slice(2) as [string];
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
for (const rm of [false, true]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); (window as any).__raf = []; window.requestAnimationFrame = (cb) => { (window as any).__raf.push(performance.now()); return raf(cb); }; });
  await page.goto(`${base}/?scene=sports`);
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.evaluate((rm) => { const c = (window as any).__showcase.controller; c.setReducedMotion(rm); c.setMode('guest'); }, rm);
  await page.waitForTimeout(800);
  const t0 = await page.evaluate((seq) => { (window as any).__raf = []; (window as any).__showcase.controller.chooseResponse(seq); return performance.now(); }, process.env.SEQ ?? 'decline');
  await page.waitForTimeout(9500);
  const r = await page.evaluate(() => (window as any).__raf as number[]);
  const bins = Array.from({ length: 19 }, (_, i) => r.filter((t) => t - t0 >= i * 500 && t - t0 < (i + 1) * 500).length);
  const last = r.length ? ((r[r.length - 1]! - t0) / 1000).toFixed(2) : 'none';
  console.log(`reducedMotion ${rm}: rAF per 0.5 s from the tap: ${bins.join(' ')} | last rAF at ${last} s | state ${await page.evaluate(() => (window as any).__showcase.state.visual)}`);
  await page.close();
}
await browser.close();
