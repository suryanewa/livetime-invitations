/**
 * v1.7 net strips: scripts/sports-strips.ts's method (the real controller under Playwright's fake
 * clock, 16 ms per frame, captureStill), restricted to a time window so a close-up of the net's
 * passage and settle can be taken in one short call, then tiled into a contact sheet.
 *
 *   node --experimental-transform-types --no-warnings evidence/v1.7/sports-net/tools/net-strips.ts <outDir> <baseUrl> <from s> <to s> [every n frames]
 *
 * Env: STRIP_SIZE (the frame square, CSS px, default 540), STRIP_DPR (default 1), STRIP_CROP=x0,y0,x1,y1 (fractions of the still), STRIP_VIEW=WxH
 * (the page viewport, default 1200x1000), STRIP_COLS (contact sheet columns, default 10), STRIP_SEQ (accept).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [out = 'outputs/net-strips', base = 'http://127.0.0.1:5703', fromS = '0.9', toS = '3.5', everyS = '1'] = process.argv.slice(2);
const from = Number(fromS), to = Number(toS), every = Number(everyS);
const size = Number(process.env.STRIP_SIZE ?? 540);
/** Device pixels per CSS pixel of the still (laptop 2, phone 3): the image is size × dpr square. */
const dpr = Number(process.env.STRIP_DPR ?? 1);
const [vw, vh] = (process.env.STRIP_VIEW ?? '1200x1000').split('x').map(Number) as [number, number];
const seq = process.env.STRIP_SEQ ?? 'accept';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('[pageerror]', e));
await page.clock.install();
await page.goto(`${base}/?scene=sports`);
const call = <T,>(fn: string) => page.evaluate((f) => new Function('s', `return (${f})(s)`)((window as any).__showcase), fn) as Promise<T>;
const tick = (ms: number) => page.clock.runFor(ms);
for (let i = 0; i < 400; i++) { if ((await call<string>('(s) => s.state?.resource')) === 'ready') break; await tick(50); await page.waitForTimeout(10); }
await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
await tick(1000);
const save = async (file: string, url: string) => writeFile(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
const dir = join(out, 'frames');
await mkdir(dir, { recursive: true });
await call('(s) => s.controller.setReducedMotion(false)');
await call('(s) => s.controller.setMode("guest")');
await tick(300);
await call(`(s) => s.controller.chooseResponse("${seq}")`);
const first = Math.round((from * 1000) / 16), last = Math.round((to * 1000) / 16);
const files: string[] = [];
for (let i = 0; i <= last; i++) {
  if (i >= first && (i - first) % every === 0) {
    const crop = process.env.STRIP_CROP;
    const url = crop
      ? await page.evaluate(async ([css, d, c]) => {
          const [x0, y0, x1, y1] = (c as string).split(',').map(Number) as [number, number, number, number];
          const src = (window as any).__showcase.controller.captureStill(css, d) as string;
          const sz = (css as number) * (d as number);
          const img = new Image();
          img.src = src;
          await img.decode();
          const cv = document.createElement('canvas');
          cv.width = Math.round((x1 - x0) * (sz as number));
          cv.height = Math.round((y1 - y0) * (sz as number));
          cv.getContext('2d')!.drawImage(img, -x0 * (sz as number), -y0 * (sz as number));
          return cv.toDataURL('image/png');
        }, [size, dpr, crop] as const)
      : await call<string>(`(s) => s.controller.captureStill(${size}, ${dpr})`);
    const f = join(dir, `f${String(i).padStart(4, '0')}.png`);
    await save(f, url);
    files.push(f);
  }
  await tick(16);
}
await browser.close();
// Contact sheet, each frame labelled with its time (ms since the response).
const cols = Number(process.env.STRIP_COLS ?? 10);
execFileSync('montage', [...files.flatMap((f) => ['-label', `${Number(f.slice(-8, -4)) * 16} ms`, f]), '-tile', `${cols}x`, '-geometry', '+2+2', '-font', '/System/Library/Fonts/Supplemental/Arial.ttf', '-pointsize', '11', '-background', '#202020', '-fill', '#e0e0e0', join(out, 'sheet.jpg')]);
// Every 16 ms frame: also a 62.5 fps clip (the strips' clock), scaled to an even width.
if (every === 1) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '62.5', '-start_number', String(first), '-i', join(dir, 'f%04d.png'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', join(out, 'motion.mp4')]);
console.log(`${files.length} frames, ${from}–${to} s every ${every * 16} ms → ${join(out, 'sheet.jpg')}`);
