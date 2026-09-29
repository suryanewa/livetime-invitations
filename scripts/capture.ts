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
/** Per-scene capture plan: presets (poster file keys), shared poses and clip lengths. */
const SCENE_CAPTURE = {
  business: {
    presets: [['light', '{ category: "business", template: "light" }'], ['dark', '{ category: "business", template: "dark" }']],
    sharedDeclined: false,
    clips: { host: 1.5, accept: 1.8, decline: 1.8, change: 2.4 },
  },
  party: {
    presets: [['coral', '{ category: "party", songId: "sample-track-a", label: "coral" }'], ['cobalt', '{ category: "party", songId: "sample-track-a", label: "cobalt" }']],
    // The closed lid hides the record, so both labels share one declined poster.
    sharedDeclined: true,
    clips: { host: 1.5, accept: 1.9, decline: 1.7, change: 2.6 },
  },
  birthday: {
    presets: [['vanilla', '{ category: "birthday", cake: "vanilla" }'], ['cocoa', '{ category: "birthday", cake: "cocoa" }']],
    // Declined shows the empty stand and the closed bin: identical for both frostings.
    sharedDeclined: true,
    clips: { host: 1.6, accept: 1.7, decline: 1.8, change: 2.6 },
  },
  sports: {
    presets: [['orange', '{ category: "sports", ball: "orange" }'], ['cream', '{ category: "sports", ball: "cream" }']],
    // Every pose shows the ball, so each preset gets its own posters.
    sharedDeclined: false,
    clips: { host: 1.5, accept: 2.0, decline: 1.9, change: 2.6 },
  },
  dinner: {
    presets: [['pasta', '{ category: "dinner", dish: "pasta" }'], ['vegetables', '{ category: "dinner", dish: "vegetables" }']],
    // Declined shows the closed bin and the cleared place: identical for both dishes.
    sharedDeclined: true,
    clips: { host: 1.5, accept: 1.8, decline: 1.8, change: 2.6 },
  },
} as const;

/**
 * Scene evidence: posters (runtime assets), review stills, the collection thumbnail and
 * 60 fps recordings driven by a virtual clock, so recordings show authored timing.
 */
async function captureScene(category: keyof typeof SCENE_CAPTURE) {
  const plan = SCENE_CAPTURE[category];
  const { execFileSync } = await import('node:child_process');
  await mkdir(outDir, { recursive: true });
  // Stage posters outside the watched tree; writing into assets/ mid-run makes Vite reload.
  const posterDir = join(import.meta.dirname, '..', 'assets', 'scenes', category, 'posters');
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
  const setPreset = (literal: string) => call(`(s) => s.setConfig(${literal})`);

  await setPreset(plan.presets[0][1]);
  await waitReady();
  // Freeze natural time: from here only tick() advances the page clock, so recordings show
  // authored timing exactly (install() alone lets real time keep flowing between frames).
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await tick(1000);

  // Posters + review stills for every preset (reduced motion snaps to exact canonical poses).
  for (const [key, literal] of plan.presets) {
    await reset();
    await setPreset(literal);
    await waitReady();
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
      const file = plan.sharedDeclined && pose === 'declined' ? 'shared-declined' : `${key}-${pose}`;
      await saveDataUrl(join(stagedPosters, `${file}.webp`), poster!);
      if (pose !== 'host-ready') {
        const review = await still(540, 2);
        await saveDataUrl(join(outDir, `capture-${key}-${pose}.png`), review!);
      }
      if (pose === 'guest-ready' && key === plan.presets[0][0]) {
        const thumb = await still(192, 1, 'image/webp', 0.86);
        await saveDataUrl(join(outDir, 'thumb.webp'), thumb!);
      }
    }
  }

  // Recordings at 60 fps (first preset, motion on).
  await setPreset(plan.presets[0][1]);
  const record = async (name: string, setup: string, action: string, seconds: number, mid?: [number, string]) => {
    await reset();
    await call('(s) => s.controller.setReducedMotion(false)');
    await call(setup);
    await tick(300);
    const framesDir = join(outDir, `frames-${name}`);
    await mkdir(framesDir, { recursive: true });
    await call(action);
    const total = Math.round(seconds * 60);
    // Integer-millisecond schedule (the fake clock rounds fractional steps: 16.67 ms ticks
    // double-stepped every 16 frames). Frame i shows time round(i × 1000/60).
    for (let i = 0; i <= total; i++) {
      if (mid && i === Math.round(mid[0] * 60)) await call(mid[1]);
      const url = await still(540, 1);
      await saveDataUrl(join(framesDir, `f${String(i).padStart(4, '0')}.png`), url!);
      await tick(Math.round(((i + 1) * 1000) / 60) - Math.round((i * 1000) / 60));
    }
    const mp4 = join(outDir, `${name}.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '60', '-i', join(framesDir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', mp4]);
    console.log('recording', mp4);
  };
  await record('host', '(s) => { s.controller.setMode("host"); s.controller.resetVisual(); }', '(s) => s.controller.prepareHost()', plan.clips.host);
  await record('accept', '(s) => s.controller.setMode("guest")', '(s) => s.controller.chooseResponse("accept")', plan.clips.accept);
  await record('decline', '(s) => s.controller.setMode("guest")', '(s) => s.controller.chooseResponse("decline")', plan.clips.decline);
  await record('change', '(s) => s.controller.setMode("guest")', '(s) => s.controller.chooseResponse("accept")', plan.clips.change, [0.5, '(s) => s.controller.chooseResponse("decline")']);
  // The second preset plays both outcomes too (dark card, cobalt label, cocoa, cream ball, vegetables).
  const [secondKey, secondLiteral] = plan.presets[1];
  await setPreset(secondLiteral);
  await waitReady();
  await record(`accept-${secondKey}`, '(s) => s.controller.setMode("guest")', '(s) => s.controller.chooseResponse("accept")', plan.clips.accept);
  await record(`decline-${secondKey}`, '(s) => s.controller.setMode("guest")', '(s) => s.controller.chooseResponse("decline")', plan.clips.decline);

  await browser.close();
  if (process.env.CAPTURE_STAGE_ONLY) {
    // Copying into assets/ makes a running dev server reload every open page; defer it.
    console.log('Staged in', outDir, '(posters and thumbnail not copied into assets/)');
    return;
  }
  const { cp } = await import('node:fs/promises');
  await mkdir(posterDir, { recursive: true });
  await cp(stagedPosters, posterDir, { recursive: true });
  const thumbDir = join(import.meta.dirname, '..', 'assets', 'ui', 'collection');
  await cp(join(outDir, 'thumb.webp'), join(thumbDir, `${category}.webp`));
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

/**
 * Showcase UI across the supported viewport matrix for every live scene (outputs named
 * `<scene>-<case>-…`), with overflow and target-size checks in host and guest modes.
 */
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
  const audit = (page: Page) =>
    page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      const small = [...document.querySelectorAll('button, summary, [role="button"]')]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
        .map(({ el, r }) => `${(el.textContent ?? '').trim().slice(0, 24)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      return { overflow, small };
    });
  for (const scene of ['business', 'party', 'birthday', 'sports', 'dinner'] as const) {
    for (const c of cases) {
      const name = `${scene}-${c.name}`;
      const page = await browser.newPage({ viewport: { width: c.width, height: c.height }, deviceScaleFactor: c.dsf });
      await page.goto(`${base}/?scene=${scene}`);
      await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
      const host = await audit(page);
      console.log(`${name} host: overflow=${host.overflow} small-targets=${JSON.stringify(host.small)}`);
      await page.screenshot({ path: join(outDir, `${name}-host.png`), fullPage: true });
      // Guest flow: accept → saved.
      await page.getByRole('button', { name: 'Guest', exact: true }).click();
      await page.getByRole('button', { name: 'Accept' }).click();
      await page.waitForTimeout(2200);
      const guest = await audit(page);
      console.log(`${name} guest: overflow=${guest.overflow} small-targets=${JSON.stringify(guest.small)}`);
      await page.screenshot({ path: join(outDir, `${name}-guest-accepted.png`), fullPage: true });
      await page.close();
    }
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
  await page.screenshot({ path: join(outDir, 'business-phone-390-error-reduced.png'), fullPage: true });
  await browser.close();
}

/**
 * Frame-time evidence (Master §9 protocol, desktop only): one warm-up, then 10 alternating
 * accept/decline cycles on a visible page; frame intervals sampled only during active playback.
 * Also a 4× CPU-throttled run, labelled SIMULATION — never mobile evidence.
 */
/**
 * Frame cadence per scene (Master §9 measurement protocol, desktop only): one warm-up pair, then
 * 10 alternating accept/decline cycles on a visible page; samples only while a sequence plays.
 * `pnpm capture perf [scene]` measures one scene; without it, all five at 1× and 4× CPU.
 */
async function capturePerf() {
  await mkdir(outDir, { recursive: true });
  const browser = await launch();
  const only = process.argv[3] && !process.argv[3].startsWith('http') ? process.argv[3] : null;
  const scenes = only ? [only] : ['business', 'party', 'birthday', 'sports', 'dinner'];
  const results: Record<string, unknown> = {};
  for (const scene of scenes) {
    for (const throttle of [1, 4]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
      const cdp = await page.context().newCDPSession(page);
      await page.goto(`${base}/?scene=${scene}`);
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
        sc.controller.chooseResponse('accept');
        await wait(2100);
        sc.controller.chooseResponse('decline');
        await wait(2100);
        intervals.length = 0;
        for (let i = 0; i < 10; i++) {
          sc.controller.chooseResponse(i % 2 ? 'decline' : 'accept');
          await wait(2100);
        }
        running = false;
        return { intervals, info: { dpr: devicePixelRatio, tier: sc.state.tier, render: sc.controller.renderInfo() } };
      });
      const iv = samples.intervals.sort((a, b) => a - b);
      const pct = (p: number) => iv[Math.min(iv.length - 1, Math.ceil((p / 100) * iv.length) - 1)]!;
      const summary = {
        scene,
        label: throttle === 1 ? 'M2 Pro · Chrome 153 · 390×844 @3x · Normal tier' : `SIMULATION: ${throttle}× CPU throttle (not device evidence)`,
        frames: iv.length,
        p50: +pct(50).toFixed(2),
        p95: +pct(95).toFixed(2),
        p99: +pct(99).toFixed(2),
        max: +iv[iv.length - 1]!.toFixed(2),
        over50ms: iv.filter((x) => x > 50).length,
        tier: samples.info.tier,
        gpu: samples.info.render,
      };
      console.log(JSON.stringify(summary));
      results[`${scene}-throttle${throttle}`] = { ...summary, raw: iv };
      await page.close();
    }
  }
  await writeFile(join(outDir, only ? `frame-times-${only}.json` : 'frame-times.json'), JSON.stringify(results, null, 2));
  await browser.close();
}

/**
 * Cold loading on a throttled network (Master §9 target: DOM controls usable ≤ 2 s and
 * render-ready ≤ 6 s at 4 Mbps / 100 ms RTT). Cache disabled; timings from navigation start.
 * Uses the dev server, so JavaScript is unbundled and slower than a production build.
 */
async function captureNetwork() {
  await mkdir(outDir, { recursive: true });
  const browser = await launch();
  const target = process.argv[3]?.startsWith('http') ? process.argv[3] : 'http://127.0.0.1:5198';
  const results: unknown[] = [];
  for (const scene of ['business', 'party', 'birthday', 'sports', 'dinner']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (1 * 1024 * 1024) / 8 });
    let bytes = 0;
    cdp.on('Network.loadingFinished', (e: { encodedDataLength: number }) => { bytes += e.encodedDataLength; });
    const t0 = Date.now();
    await page.goto(`${target}/?scene=${scene}`, { waitUntil: 'commit' });
    await page.getByRole('button', { name: 'Guest', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
    const controls = Date.now() - t0;
    // Render-ready: the live canvas has drawn its first frame and replaced the poster.
    await page.locator('.lt-stage__canvas.is-visible').waitFor({ state: 'attached', timeout: 60_000 });
    const ready = Date.now() - t0;
    const row = { scene, controlsUsableMs: controls, renderReadyMs: ready, transferredBytes: bytes };
    console.log(JSON.stringify(row));
    results.push(row);
    await page.close();
  }
  await writeFile(join(outDir, 'cold-load.json'), JSON.stringify(results, null, 2));
  await browser.close();
}

/**
 * Real-time sequence lengths in the live showcase (no virtual clock): from the call to the
 * visual state reaching the final pose, polled every animation frame. Three runs each; median.
 */
async function captureTiming() {
  const out = join(import.meta.dirname, '..', 'outputs', 'perf');
  await mkdir(out, { recursive: true });
  const browser = await launch();
  const results: Record<string, Record<string, number>> = {};
  for (const scene of ['business', 'party', 'birthday', 'sports', 'dinner']) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    await page.goto(`${base}/?scene=${scene}`);
    await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
    const row: Record<string, number> = {};
    for (const [name, setup, action, done] of [
      ['host', 'c.setMode("host"); c.resetVisual();', 'c.prepareHost()', 'guest-ready'],
      // Answer once, then time replays: each snaps to guest-ready and plays the outcome in full.
      ['accept', 'c.setMode("guest"); c.chooseResponse("accept");', 'c.replay()', 'accepted-pose'],
      ['decline', 'c.setMode("guest"); c.chooseResponse("decline");', 'c.replay()', 'declined-pose'],
    ] as const) {
      const runs: number[] = [];
      for (let i = 0; i < 3; i++) {
        runs.push(await page.evaluate(async ([setupSrc, actionSrc, doneState]) => {
          const sc = (window as any).__showcase;
          const c = sc.controller;
          new Function('c', setupSrc)(c);
          await new Promise((r) => setTimeout(r, 2600));
          return new Promise<number>((resolve) => {
            const t0 = performance.now();
            new Function('c', actionSrc)(c);
            let seenPlaying = false;
            const poll = () => {
              const v = sc.state.visual as string;
              if (v.endsWith('playing')) seenPlaying = true;
              if (seenPlaying && v === doneState) resolve(performance.now() - t0);
              else requestAnimationFrame(poll);
            };
            requestAnimationFrame(poll);
          });
        }, [setup, action, done] as const));
      }
      runs.sort((a, b) => a - b);
      row[name] = +(runs[1]! / 1000).toFixed(3);
    }
    console.log(scene, JSON.stringify(row));
    results[scene] = row;
    await page.close();
  }
  await writeFile(join(out, 'sequence-timing.json'), JSON.stringify(results, null, 2));
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
else if (mode === 'network') await captureNetwork();
else if (mode === 'timing') await captureTiming();
else if (mode === 'ui') await captureUi();
else if (mode === 'thumbs') await captureThumbs();
else if (mode === 'business' || mode === 'party' || mode === 'birthday' || mode === 'sports' || mode === 'dinner') await captureScene(mode);
else if (mode === 'skeleton') await captureSkeleton();
else if (mode === 'motion') await captureMotion();
else throw new Error(`Unknown capture mode ${mode}`);
