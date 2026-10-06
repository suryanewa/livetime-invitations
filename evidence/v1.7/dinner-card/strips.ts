/**
 * v1.7 Dinner card evidence: the reveal → steam → close-up move through the real controller on a
 * 16 ms virtual clock (Playwright's fake clock; every frame advances exactly 16 ms), as the guest sees
 * it (the showcase's fullscreen layout), from the tap to `seconds` after it. Also the change of mind
 * from the close-up (`change`): accept, wait, decline.
 *   node --experimental-transform-types evidence/v1.7/dinner-card/strips.ts <base> <out> <laptop|phone> [accept|change] [seconds] [every]
 * Writes f0000.jpg … (every `every`th frame), close.txt (t, close, pull per frame) and sheet.jpg.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const [base = 'http://127.0.0.1:5701', out = 'outputs/strips', size = 'laptop', what = 'accept', secs = '5', everyArg = '1'] = process.argv.slice(2);
const SIZES = { laptop: { width: 1280, height: 720, dsf: 1 }, phone: { width: 390, height: 844, dsf: 2 } } as const;
const s = SIZES[size as keyof typeof SIZES];
const every = Number(everyArg);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.dsf });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.clock.install();
await page.goto(`${base}/?scene=dinner`);
const tick = (ms: number) => page.clock.runFor(ms);
for (let i = 0; i < 600; i++) {
  const ok = await page.evaluate(() => (window as any).__showcase?.state?.resource === 'ready' && (window as any).__showcase.controller.deferredReady());
  if (ok) break;
  await tick(50);
  await page.waitForTimeout(20);
}
await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
await tick(1000);
await page.getByRole('button', { name: 'Guest', exact: true }).click();
await tick(600);
await page.getByRole('button', { name: 'Accept' }).click();
const total = Math.round((Number(secs) * 1000) / 16);
const rows: string[] = [];
for (let i = 0; i <= total; i++) {
  if (what === 'change' && i === Math.round(5000 / 16)) await page.getByRole('button', { name: 'Decline' }).click();
  const f = await page.evaluate(() => { const c = (window as any).__showcase.controller.framing(); return [c.close, c.pull, (window as any).__showcase.state.visual]; });
  rows.push(`${(i * 0.016).toFixed(3)}\t${(f[0] as number).toFixed(5)}\t${(f[1] as number).toFixed(5)}\t${f[2]}`);
  if (i % every === 0) await page.screenshot({ path: join(out, `f${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 80 });
  await tick(16);
}
await writeFile(join(out, 'close.txt'), `t\tclose\tpull\tvisual\n${rows.join('\n')}\n`);
await browser.close();
console.log('frames in', out);
