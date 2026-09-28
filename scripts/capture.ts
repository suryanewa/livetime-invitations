/**
 * Capture tooling (outputs are disposable and git-ignored under outputs/).
 * Uses the system Google Chrome through playwright-core — no browser download.
 *
 *   node --experimental-strip-types scripts/capture.ts study [baseUrl]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const mode = process.argv[2] ?? 'study';
const base = process.argv[3] ?? 'http://127.0.0.1:5199';
const outDir = join(import.meta.dirname, '..', 'outputs', mode);

async function saveDataUrl(file: string, dataUrl: string) {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  await writeFile(file, Buffer.from(b64, 'base64'));
}

async function launch() {
  return chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
}

async function renderer(page: Page) {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
}

async function captureStudy() {
  await mkdir(outDir, { recursive: true });
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
  await page.goto(`${base}/study.html`);
  await page.waitForSelector('body[data-ready="true"]', { timeout: 60_000 });
  console.log('GPU:', await renderer(page));

  const phones = await page.$$('.s-phone');
  const names = ['frame-cake-A', 'frame-keycard-A', 'frame-cake-B', 'frame-keycard-B'];
  for (let i = 0; i < phones.length; i++) await phones[i]!.screenshot({ path: join(outDir, `${names[i]}.png`) });

  const stages = await page.$$eval('.s-phone .lt-stage img', (imgs) => imgs.map((i) => (i as HTMLImageElement).src));
  for (let i = 0; i < stages.length; i++) await saveDataUrl(join(outDir, `${names[i]}-stage.png`), stages[i]!);

  const sheets = await page.$$('.s-sheet');
  for (let i = 0; i < sheets.length; i++) await sheets[i]!.screenshot({ path: join(outDir, `contact-sheet-${i === 0 ? 'A' : 'B'}.png`) });

  const crops = await page.$('.s-crops');
  await crops?.screenshot({ path: join(outDir, 'detail-crops.png') });
  const narrow = await page.$('.s-narrow');
  await narrow?.screenshot({ path: join(outDir, 'narrow-320.png') });
  const tokens = await page.$('.s-tokens');
  await tokens?.screenshot({ path: join(outDir, 'token-sheets.png') });
  const stats = await page.evaluate(() => (window as any).__studyStats);
  await writeFile(join(outDir, 'render-stats.json'), JSON.stringify(stats, null, 2));
  console.log('render stats:', JSON.stringify(stats));
  const rubric = await page.$('.s-rubric');
  await rubric?.screenshot({ path: join(outDir, 'rubric.png') });

  await browser.close();
  console.log('Saved to', outDir);
}

async function captureMotion() {
  // Two-second settle sample per direction: deterministic frames at 60 fps, encoded with
  // the system ffmpeg (no Playwright video download).
  const { execFileSync } = await import('node:child_process');
  await mkdir(outDir, { recursive: true });
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(`${base}/study.html`);
  await page.waitForSelector('body[data-ready="true"]', { timeout: 60_000 });
  for (const dir of ['A', 'B']) {
    const framesDir = join(outDir, `frames-${dir}`);
    await mkdir(framesDir, { recursive: true });
    await page.evaluate((d) => (window as any).__studySettle.show(d), dir);
    const fps = 60;
    for (let i = 0; i <= 2 * fps; i++) {
      const url = await page.evaluate(([t, size]) => (window as any).__studySettle.frame(t, size), [i / fps, 420] as const);
      await saveDataUrl(join(framesDir, `f${String(i).padStart(4, '0')}.png`), url as string);
    }
    const mp4 = join(outDir, `settle-${dir}.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(framesDir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', mp4]);
    console.log(`motion ${dir}:`, mp4);
  }
  await browser.close();
}

async function captureSkeleton() {
  await mkdir(outDir, { recursive: true });
  const browser = await launch();
  for (const width of [320, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(`${base}/`);
    await page.waitForSelector('#poster img', { timeout: 30_000 });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    const targets = await page.$$eval('.lt-choice', (els) => els.map((e) => e.getBoundingClientRect()).map((r) => [Math.round(r.width), Math.round(r.height)]));
    console.log(`skeleton ${width}px: horizontal overflow=${overflow}, control sizes=${JSON.stringify(targets)}`);
    await page.screenshot({ path: join(outDir, `skeleton-${width}.png`), fullPage: true });
    await page.close();
  }
  await browser.close();
}

if (mode === 'study') await captureStudy();
else if (mode === 'skeleton') await captureSkeleton();
else if (mode === 'motion') await captureMotion();
else throw new Error(`Unknown capture mode ${mode}`);
