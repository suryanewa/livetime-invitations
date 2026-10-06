/**
 * v1.7 Dinner card evidence: stills of the live showcase (the real controller) at the laptop
 * (1280 × 720 @2) and phone (390 × 844 @3) sizes, and square captureStill posters.
 *   node --experimental-transform-types evidence/v1.7/dinner-card/stills.ts <base> <out> <what>
 * what: host (host-ready, the card on the plate at 15°), accepted (reduced motion: the canonical close-up),
 * declined, poster (720 px posters of every pose).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const [base = 'http://127.0.0.1:5701', out = 'evidence/v1.7/dinner-card/stills', what = 'host'] = process.argv.slice(2);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SIZES = { laptop: { width: 1280, height: 720, dsf: 2 }, phone: { width: 390, height: 844, dsf: 3 } } as const;
const save = (file: string, url: string) => writeFile(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
for (const [name, s] of Object.entries(SIZES)) {
  if (what === 'poster' && name === 'phone') continue;
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.dsf, reducedMotion: what === 'host' ? 'no-preference' : 'reduce' });
  page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
  await page.goto(`${base}/?scene=dinner`);
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 60_000 });
  await page.waitForFunction(() => (window as any).__showcase.controller.deferredReady(), null, { timeout: 60_000 });
  const c = (fn: string) => page.evaluate(new Function(`const c = window.__showcase.controller; ${fn}`) as () => unknown);
  if (what === 'host') {
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(out, `host-ready-${name}.png`) });
  } else if (what === 'accepted' || what === 'declined') {
    await c(`c.setReducedMotion(true); c.setMode('guest'); c.chooseResponse('${what === 'accepted' ? 'accept' : 'decline'}');`);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(out, `${what}-${name}.png`) });
  } else if (what === 'poster') {
    await c(`c.setReducedMotion(true);`);
    for (const [pose, act] of [['host-ready', "c.setMode('host'); c.resetVisual();"], ['guest-ready', "c.setMode('guest');"], ['accepted', "c.chooseResponse('accept');"], ['declined', "c.chooseResponse('decline');"]] as const) {
      await c(act);
      await page.waitForTimeout(400);
      await save(join(out, `poster-${pose}.png`), (await c('return c.captureStill(720, 1);')) as string);
    }
  }
  await page.close();
}
await browser.close();
console.log('stills in', out);
