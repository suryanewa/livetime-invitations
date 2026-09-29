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
// argv[3] is a base URL (http…) or, for lookdev, a subject filter.
const base = process.argv[3]?.startsWith('http') ? process.argv[3] : 'http://127.0.0.1:5199';
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

  const frames = await page.$$('[data-name^="frame-"]');
  for (const f of frames) {
    const name = (await f.getAttribute('data-name'))!;
    await (await f.$('.s-phone'))!.screenshot({ path: join(outDir, `${name}.png`) });
    const src = await f.$eval('.lt-stage img', (i) => (i as HTMLImageElement).src);
    await saveDataUrl(join(outDir, `${name}-stage.png`), src);
  }
  const narrowShots = await page.$$eval('[data-name^="narrow-"]', (els) => els.map((e) => [e.getAttribute('data-name'), (e.querySelector('img') as HTMLImageElement).src]));
  for (const [name, src] of narrowShots) await saveDataUrl(join(outDir, `${name}.png`), src!);

  const sheets = await page.$$('.s-sheet');
  for (const sh of sheets) await sh.screenshot({ path: join(outDir, `contact-sheet-${await sh.getAttribute('data-dir')}.png`) });

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
  for (const dir of ['L', 'A', 'B']) {
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

/**
 * Business evidence: posters (runtime assets), six review stills and 60 fps recordings.
 * Playwright's fake clock steps requestAnimationFrame and performance.now exactly, so the
 * recordings show authored timing, not capture jitter.
 */
async function captureBusiness() {
  const { execFileSync } = await import('node:child_process');
  await mkdir(outDir, { recursive: true });
  // Stage posters outside the watched tree; writing into assets/ mid-run makes Vite reload.
  const posterDir = join(import.meta.dirname, '..', 'assets', 'scenes', 'business', 'posters');
  const stagedPosters = join(outDir, 'posters');
  await mkdir(stagedPosters, { recursive: true });
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 });
  page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
  await page.clock.install();
  await page.goto(`${base}/`);

  const call = <T,>(fn: string, ...args: unknown[]) =>
    page.evaluate(([f, a]) => new Function('s', 'a', `return (${f})(s, a)`)((window as any).__showcase, a), [fn, args] as const) as Promise<T>;
  const tick = (ms: number) => page.clock.runFor(ms);
  const waitReady = async () => {
    for (let i = 0; i < 400; i++) {
      const r = await call<string>('(s) => s.state?.resource');
      if (r === 'ready') return;
      await tick(50);
      await page.waitForTimeout(10);
    }
    throw new Error('scene never became ready');
  };
  const reset = async () => {
    await page.evaluate(() => (document.querySelector('[data-action="reset"]') as HTMLButtonElement).click());
    await waitReady();
  };
  const still = (size: number, dpr: number, type = 'image/png', q?: number) =>
    call<string | null>('(s, a) => s.controller.captureStill(a[0], a[1], a[2], a[3])', size, dpr, type, q);

  await waitReady();

  // Posters + review stills for both templates (reduced motion snaps to exact canonical poses).
  for (const template of ['light', 'dark'] as const) {
    await reset();
    await call('(s, a) => s.setConfig({ category: "business", template: a[0] })', template);
    await call('(s) => s.controller.setReducedMotion(true)');
    await tick(100);
    const poses: [string, string][] = [
      ['host-ready', '(s) => { s.controller.setMode("host"); s.controller.resetVisual(); }'],
      ['guest-ready', '(s) => s.controller.setMode("guest")'],
      ['accepted', '(s) => s.controller.chooseResponse("accept")'],
      ['declined', '(s) => s.controller.chooseResponse("decline")'],
    ];
    for (const [pose, action] of poses) {
      await call(action);
      await tick(400);
      const poster = await still(720, 1, 'image/webp', 0.86);
      await saveDataUrl(join(stagedPosters, `${template}-${pose}.webp`), poster!);
      if (pose !== 'host-ready') {
        const review = await still(540, 2);
        await saveDataUrl(join(outDir, `capture-${template}-${pose}.png`), review!);
      }
    }
  }

  // Recordings at 60 fps (light template, motion on).
  await call('(s) => s.setConfig({ category: "business", template: "light" })');
  const record = async (name: string, setup: string, action: string, seconds: number, mid?: [number, string]) => {
    await reset();
    await call('(s) => s.controller.setReducedMotion(false)');
    await call(setup);
    await tick(300);
    const framesDir = join(outDir, `frames-${name}`);
    await mkdir(framesDir, { recursive: true });
    await call(action);
    const total = Math.round(seconds * 60);
    for (let i = 0; i <= total; i++) {
      if (mid && i === Math.round(mid[0] * 60)) await call(mid[1]);
      const url = await still(540, 1);
      await saveDataUrl(join(framesDir, `f${String(i).padStart(4, '0')}.png`), url!);
      await tick(1000 / 60);
    }
    const mp4 = join(outDir, `${name}.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '60', '-i', join(framesDir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', mp4]);
    console.log('recording', mp4);
  };
  await record('host', '(s) => { s.controller.setMode("host"); s.controller.resetVisual(); }', '(s) => s.controller.prepareHost()', 1.5);
  await record('accept', '(s) => s.controller.setMode("guest")', '(s) => s.controller.chooseResponse("accept")', 1.8);
  await record('decline', '(s) => s.controller.setMode("guest")', '(s) => s.controller.chooseResponse("decline")', 1.8);
  await record('change', '(s) => s.controller.setMode("guest")', '(s) => s.controller.chooseResponse("accept")', 2.4, [0.5, '(s) => s.controller.chooseResponse("decline")']);

  await browser.close();
  const { cp } = await import('node:fs/promises');
  await mkdir(posterDir, { recursive: true });
  await cp(stagedPosters, posterDir, { recursive: true });
  console.log('Saved to', outDir, 'and posters to', posterDir);
}

async function captureThumbs() {
  const staged = join(outDir);
  await mkdir(staged, { recursive: true });
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`${base}/study.html`);
  await page.waitForSelector('body[data-ready="true"]', { timeout: 60_000 });
  const map = { record: 'party', cake: 'birthday', sports: 'sports', dish: 'dinner', keycard: 'business' } as const;
  for (const [subject, category] of Object.entries(map)) {
    const url = await page.evaluate(([s]) => (window as any).__studyThumb(s, 192), [subject] as const);
    await saveDataUrl(join(staged, `${category}.webp`), url as string);
  }
  await browser.close();
  const { cp } = await import('node:fs/promises');
  const dest = join(import.meta.dirname, '..', 'assets', 'ui', 'collection');
  await mkdir(dest, { recursive: true });
  await cp(staged, dest, { recursive: true });
  console.log('thumbnails →', dest);
}

/** Showcase UI across the supported viewport matrix, with overflow and target-size checks. */
async function captureUi() {
  await mkdir(outDir, { recursive: true });
  const browser = await launch();
  const cases = [
    { name: 'desktop-1440', width: 1440, height: 1000, dsf: 1 },
    { name: 'phone-390', width: 390, height: 844, dsf: 3 },
    { name: 'phone-320', width: 320, height: 700, dsf: 2 },
    { name: 'landscape-844x390', width: 844, height: 390, dsf: 3 },
    { name: 'zoom200-1440', width: 720, height: 500, dsf: 2 },
  ];
  for (const c of cases) {
    const page = await browser.newPage({ viewport: { width: c.width, height: c.height }, deviceScaleFactor: c.dsf });
    await page.goto(`${base}/`);
    await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
    const report = await page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      const small = [...document.querySelectorAll('button, summary, [role="button"]')]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
        .map(({ el, r }) => `${(el.textContent ?? '').trim().slice(0, 24)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      return { overflow, small };
    });
    console.log(`${c.name}: overflow=${report.overflow} small-targets=${JSON.stringify(report.small)}`);
    await page.screenshot({ path: join(outDir, `${c.name}-host.png`), fullPage: true });
    // Guest flow: accept → saved.
    await page.getByRole('button', { name: 'Guest', exact: true }).click();
    await page.getByRole('button', { name: 'Accept' }).click();
    await page.waitForTimeout(2200);
    await page.screenshot({ path: join(outDir, `${c.name}-guest-accepted.png`), fullPage: true });
    await page.close();
  }
  // Error state with Retry (fail mode), and reduced motion.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, reducedMotion: 'reduce' });
  await page.goto(`${base}/`);
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
  await page.locator('.sc-dev summary').click();
  await page.getByRole('button', { name: 'Fail' }).click();
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Decline' }).click();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: join(outDir, 'phone-390-error-reduced.png'), fullPage: true });
  await browser.close();
}

/**
 * Frame-time evidence (Master §9 protocol, desktop only): one warm-up, then 10 alternating
 * accept/decline cycles on a visible page; frame intervals sampled only during active playback.
 * Also a 4× CPU-throttled run, labelled SIMULATION — never mobile evidence.
 */
async function capturePerf() {
  await mkdir(outDir, { recursive: true });
  const browser = await launch();
  const results: Record<string, unknown> = {};
  for (const throttle of [1, 4]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const cdp = await page.context().newCDPSession(page);
    await page.goto(`${base}/`);
    await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await page.getByRole('button', { name: 'Guest', exact: true }).click();
    const samples = await page.evaluate(async () => {
      const sc = (window as any).__showcase;
      const intervals: number[] = [];
      let last = 0;
      let running = true;
      const loop = (t: number) => {
        const v = sc.state.visual as string;
        const active = v.endsWith('playing');
        if (active && last) intervals.push(t - last);
        last = active ? t : 0;
        if (running) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      // Warm-up (not recorded separately: shader compile already happened at load).
      sc.controller.chooseResponse('accept');
      await wait(1900);
      sc.controller.chooseResponse('decline');
      await wait(1900);
      intervals.length = 0;
      for (let i = 0; i < 10; i++) {
        sc.controller.chooseResponse(i % 2 ? 'decline' : 'accept');
        await wait(1900);
      }
      running = false;
      const info = { dpr: devicePixelRatio, tier: sc.state.tier };
      return { intervals, info };
    });
    const iv = samples.intervals.sort((a, b) => a - b);
    const pct = (p: number) => iv[Math.min(iv.length - 1, Math.ceil((p / 100) * iv.length) - 1)]!;
    const summary = {
      label: throttle === 1 ? 'M2 Pro · Chrome 153 · 390×844 @3x · Normal tier' : `SIMULATION: ${throttle}× CPU throttle (not device evidence)`,
      frames: iv.length,
      p50: +pct(50).toFixed(2),
      p95: +pct(95).toFixed(2),
      p99: +pct(99).toFixed(2),
      max: +iv[iv.length - 1]!.toFixed(2),
      over50ms: iv.filter((x) => x > 50).length,
      tier: samples.info.tier,
    };
    console.log(JSON.stringify(summary));
    results[`throttle${throttle}`] = { ...summary, raw: iv };
    await page.close();
  }
  await writeFile(join(outDir, 'frame-times.json'), JSON.stringify(results, null, 2));
  await browser.close();
}

async function captureLookdev() {
  await mkdir(outDir, { recursive: true });
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
  // `pnpm capture lookdev record` renders one subject.
  const only = process.argv[3]?.startsWith('http') ? undefined : process.argv[3];
  await page.goto(`${base}/lookdev.html${only ? `?only=${only}` : ''}`);
  await page.waitForSelector('body[data-ready="true"]', { timeout: 120_000 });
  const results = await page.evaluate(() => (window as any).__lookdev);
  for (const [name, r] of Object.entries(results as Record<string, { url: string; triangles: number; calls: number; ms: number }>)) {
    await saveDataUrl(join(outDir, `${name}.png`), r.url);
    console.log(`${name}: ${r.triangles} tris · ${r.calls} calls · ${r.ms.toFixed(2)} ms`);
  }
  await browser.close();
}

if (mode === 'study') await captureStudy();
else if (mode === 'lookdev') await captureLookdev();
else if (mode === 'perf') await capturePerf();
else if (mode === 'ui') await captureUi();
else if (mode === 'thumbs') await captureThumbs();
else if (mode === 'business') await captureBusiness();
else if (mode === 'skeleton') await captureSkeleton();
else if (mode === 'motion') await captureMotion();
else throw new Error(`Unknown capture mode ${mode}`);
