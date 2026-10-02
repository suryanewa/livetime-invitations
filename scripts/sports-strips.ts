/**
 * Sports v1.5 frame strips (evidence for docs/scenes/sports-v1.5.md): deterministic 60 fps-
 * equivalent frames (Playwright's fake clock, 16 ms per frame as in scripts/capture.ts) of host,
 * accept and decline with their tails, plus an mp4 per sequence.
 *
 *   node --experimental-transform-types --no-warnings scripts/sports-strips.ts <outDir> [baseUrl] [seq,…] [seconds]
 *
 * Env: STRIP_SIZE (px, default 540), STRIP_CROP=x0,y0,x1,y1 (fractions of the still: a close-up),
 * STRIP_CHANGE=<s>:<accept|decline> (change of mind at that time).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out = process.argv[2] ?? 'outputs/sports-strips';
const base = process.argv[3] ?? 'http://127.0.0.1:5504';
const seqs = (process.argv[4] ?? 'accept,decline,host').split(',');
const seconds = Number(process.argv[5] ?? 7.5);
const size = Number(process.env.STRIP_SIZE ?? 540);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 });
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.error('[page]', m.text()));
page.on('pageerror', (e) => console.error('[pageerror]', e));
await page.clock.install();
await page.goto(`${base}/?scene=sports`);
const call = <T,>(fn: string) => page.evaluate((f) => new Function('s', `return (${f})(s)`)((window as any).__showcase), fn) as Promise<T>;
const tick = (ms: number) => page.clock.runFor(ms);
for (let i = 0; i < 400; i++) { if ((await call<string>('(s) => s.state?.resource')) === 'ready') break; await tick(50); await page.waitForTimeout(10); }
await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
await tick(1000);
const save = async (file: string, url: string) => writeFile(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
for (const seq of seqs) {
  const dir = join(out, `frames-${seq}${process.env.STRIP_CHANGE ? '-change' : ''}`);
  await mkdir(dir, { recursive: true });
  await page.evaluate(() => (document.querySelector('[data-action="reset"]') as HTMLButtonElement).click());
  for (let i = 0; i < 400; i++) { if ((await call<string>('(s) => s.state?.resource')) === 'ready') break; await tick(50); await page.waitForTimeout(10); }
  await call('(s) => s.controller.setReducedMotion(false)');
  if (seq === 'host') await call('(s) => { s.controller.setMode("host"); s.controller.resetVisual(); }');
  else await call('(s) => s.controller.setMode("guest")');
  await tick(300);
  await call(seq === 'host' ? '(s) => s.controller.prepareHost()' : `(s) => s.controller.chooseResponse("${seq}")`);
  const total = Math.round((seconds * 1000) / 16);
  const change = process.env.STRIP_CHANGE?.split(':');
  for (let i = 0; i <= total; i++) {
    if (change && i === Math.round((Number(change[0]) * 1000) / 16)) await call(`(s) => s.controller.chooseResponse("${change[1]}")`);
    const crop = process.env.STRIP_CROP;
    const url = crop
      ? await page.evaluate(async ([sz, c]) => {
          const [x0, y0, x1, y1] = (c as string).split(',').map(Number) as [number, number, number, number];
          const src = (window as any).__showcase.controller.captureStill(sz, 1) as string;
          const img = new Image();
          img.src = src;
          await img.decode();
          const cv = document.createElement('canvas');
          cv.width = Math.round((x1 - x0) * (sz as number));
          cv.height = Math.round((y1 - y0) * (sz as number));
          cv.getContext('2d')!.drawImage(img, -x0 * (sz as number), -y0 * (sz as number));
          return cv.toDataURL('image/png');
        }, [size, crop] as const)
      : await call<string>(`(s) => s.controller.captureStill(${size}, 1)`);
    await save(join(dir, `f${String(i).padStart(4, '0')}.png`), url);
    await tick(16);
  }
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '62.5', '-i', join(dir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-r', '60', join(out, `${seq}.mp4`)]);
  } catch (e) { console.error('ffmpeg failed', e); }
  console.log(seq, 'frames', total + 1);
}
await browser.close();
