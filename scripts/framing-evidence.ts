/**
 * v1.5 decline pull-back evidence (docs/style-reference.md, "Decline pull-back"): frame strips of
 * the Birthday and Dinner declines and of a change of mind, on the real controller with Playwright's
 * fake clock (16 ms per frame, as scripts/capture.ts: 60 fps-equivalent), with the camera's pull,
 * distance and the hero's place on screen logged per frame; the canonical stills (square, and the
 * fullscreen showcase at desktop and phone sizes, live and as the static poster over its backdrop).
 *
 *   node --experimental-transform-types --no-warnings scripts/framing-evidence.ts <outDir> [baseUrl] [strips|stills|all]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium, type Page } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out = process.argv[2] ?? 'evidence/v1.5/framing';
const base = process.argv[3] ?? 'http://127.0.0.1:5509';
const what = process.argv[4] ?? 'all';
const FRAME_MS = 16;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const save = (file: string, url: string) => writeFile(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));

async function open(page: Page, scene: string, clock = true) {
  if (clock) await page.clock.install();
  await page.goto(`${base}/?scene=${scene}`);
  const call = <T,>(fn: string) => page.evaluate((f) => new Function('s', `return (${f})(s)`)((window as any).__showcase), fn) as Promise<T>;
  const tick = (ms: number) => page.clock.runFor(ms);
  const ready = async () => {
    for (let i = 0; i < 600; i++) {
      if ((await call<string>('(s) => s.state?.resource')) === 'ready') return;
      if (clock) await tick(50);
      await page.waitForTimeout(10);
    }
    throw new Error(`${scene} never became ready`);
  };
  await ready();
  if (clock) {
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await tick(1000);
  }
  return { call, tick, ready };
}

const rowsOf = (dir: string) => readdirSync(dir).filter((f) => f.endsWith('.png')).length;

/** A tiled contact sheet of every `step`-th frame (ffmpeg), and an mp4 of the strip. */
function encode(dir: string, name: string, step: number, cols: number) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(1000 / FRAME_MS), '-i', join(dir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-r', '60', join(out, `${name}.mp4`)]);
  // Row-major, every `step`-th frame (step × 16 ms apart), named so: <name>-sheet-every<step×16>ms.png.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(dir, 'f%04d.png'), '-vf', `select='not(mod(n\\,${step}))',scale=216:-1,tile=${cols}x${Math.ceil(rowsOf(dir) / step / cols)}:padding=4:color=white`, '-frames:v', '1', '-update', '1', join(out, `${name}-sheet-every${step * FRAME_MS}ms.png`)]);
}

async function strips() {
  const log: Record<string, unknown> = {};
  const cases: { scene: string; name: string; seconds: number; change?: [number, 'accept' | 'decline'] }[] = [
    { scene: 'birthday', name: 'birthday-decline', seconds: 1.8 },
    { scene: 'dinner', name: 'dinner-decline', seconds: 1.8 },
    // Changes of mind: mid-pull, mid-carry and after the decline has finished.
    { scene: 'dinner', name: 'dinner-change-0.10s', seconds: 2.4, change: [0.1, 'accept'] },
    { scene: 'dinner', name: 'dinner-change-0.45s', seconds: 2.6, change: [0.45, 'accept'] },
    { scene: 'dinner', name: 'dinner-change-after', seconds: 3.6, change: [1.7, 'accept'] },
    { scene: 'birthday', name: 'birthday-change-0.45s', seconds: 2.2, change: [0.45, 'accept'] },
    { scene: 'dinner', name: 'dinner-change-to-decline-0.5s', seconds: 2.8, change: [0.5, 'decline'] },
  ];
  for (const c of cases) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 });
    page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
    const { call, tick } = await open(page, c.scene);
    await call('(s) => s.controller.setReducedMotion(false)');
    await call('(s) => s.controller.setMode("guest")');
    await tick(300);
    const fits = await call<any>('(s) => { const f = s.controller.framing(1); return { rest: f.rest, decline: f.decline }; }');
    const dir = join(out, `frames-${c.name}`);
    await mkdir(dir, { recursive: true });
    const first = c.change?.[1] === 'decline' ? 'accept' : 'decline';
    await call(`(s) => s.controller.chooseResponse("${first}")`);
    const rows: { ms: number; pull: number; visual: string }[] = [];
    const total = Math.round((c.seconds * 1000) / FRAME_MS);
    const solves0 = await call<number>('(s) => s.controller.framing().solves');
    for (let i = 0; i <= total; i++) {
      if (c.change && i === Math.round((c.change[0] * 1000) / FRAME_MS)) await call(`(s) => s.controller.chooseResponse("${c.change[1]}")`);
      const url = await call<string>('(s) => s.controller.captureStill(540, 1)');
      await save(join(dir, `f${String(i).padStart(4, '0')}.png`), url);
      rows.push({ ms: i * FRAME_MS, pull: await call<number>('(s) => s.controller.framing().pull'), visual: await call<string>('(s) => s.state.visual') });
      await tick(FRAME_MS);
    }
    const solves1 = await call<number>('(s) => s.controller.framing().solves');
    encode(dir, c.name, c.name.endsWith('decline') ? 3 : 4, 10);
    // Jump analysis: the camera's distance per frame (the same dolly as pulledView), its speed and
    // its change of speed; a pop shows as one frame's speed far from its neighbours'.
    const d = rows.map((r) => fits.rest.distance * (fits.decline.distance / fits.rest.distance) ** r.pull);
    const logv = d.map((x, i) => (i ? Math.log(x / d[i - 1]!) : 0));
    let worstJerk = 0, worstAt = 0;
    for (let i = 2; i < logv.length; i++) {
      const j = Math.abs(logv[i]! - logv[i - 1]!);
      if (j > worstJerk) { worstJerk = j; worstAt = rows[i]!.ms; }
    }
    const peak = Math.max(...logv.map(Math.abs));
    log[c.name] = { fits: { restDistance: fits.rest.distance, declineDistance: fits.decline.distance }, solvesDuring: solves1 - solves0, peakZoomPerFrame: peak, worstSpeedChangePerFrame: worstJerk, worstAt, rows };
    console.log(`${c.name}: peak zoom ${(peak * 100).toFixed(2)} %/frame, largest frame-to-frame change of zoom speed ${(worstJerk * 100).toFixed(3)} %/frame at ${worstAt} ms, fits solved during it: ${solves1 - solves0}; pull ${rows.filter((_, i) => i % 6 === 0).map((r) => r.pull.toFixed(2)).join(' ')}`);
    await page.close();
  }
  await writeFile(join(out, 'strips.json'), JSON.stringify(log, null, 1));
}

/** Canonical stills: square (captureStill) and the fullscreen showcase, live and as the static poster. */
async function stills() {
  const poses: [string, string][] = [
    ['host-ready', '(s) => { s.controller.setMode("host"); s.controller.resetVisual(); }'],
    ['guest-ready', '(s) => s.controller.setMode("guest")'],
    ['accepted', '(s) => s.controller.chooseResponse("accept")'],
    ['declined', '(s) => s.controller.chooseResponse("decline")'],
  ];
  const report: string[] = [];
  for (const scene of ['birthday', 'dinner', 'party', 'sports', 'business']) {
    // Square stills (the posters' framing) at every pose.
    {
      const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 });
      const { call, tick } = await open(page, scene);
      await call('(s) => s.controller.setReducedMotion(true)');
      for (const [pose, action] of poses) {
        await call(action);
        await tick(400);
        await save(join(out, `still-${scene}-${pose}.png`), await call<string>('(s) => s.controller.captureStill(720, 1)'));
        const pull = await call<number>('(s) => s.controller.framing().pull');
        report.push(`${scene} ${pose}: pull ${pull}`);
      }
      await page.close();
    }
    if (scene !== 'birthday' && scene !== 'dinner') continue;
    // Fullscreen showcase, desktop and phone: the live canvas and the static poster over its backdrop.
    for (const [label, w, h, dsf] of [['desktop', 1440, 900, 1], ['phone', 390, 844, 2]] as const) {
      for (const [pose, action] of poses) {
        const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, reducedMotion: 'reduce' });
        const { call } = await open(page, scene, false);
        await call(action);
        await page.waitForTimeout(500);
        await page.screenshot({ path: join(out, `fullscreen-${label}-${scene}-${pose}-live.png`) });
        await call('(s) => s.controller.setQualityTier("static")');
        await page.waitForFunction(() => {
          const img = document.querySelector('.lt-stage__poster') as HTMLImageElement | null;
          return !!img && img.complete && img.naturalWidth > 0 && !img.classList.contains('is-hidden');
        });
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(out, `fullscreen-${label}-${scene}-${pose}-poster.png`) });
        const bg = await page.locator('.lt-stage__backdrop').evaluate((el) => getComputedStyle(el).backgroundImage);
        const src = await page.locator('.lt-stage__poster').getAttribute('src');
        report.push(`${label} ${scene} ${pose}: poster ${src?.split('/').pop()?.split('?')[0]} over ${bg.match(/backdrop[^"/)]*\.webp/)?.[0]}`);
        await page.close();
      }
    }
  }
  await writeFile(join(out, 'stills.txt'), report.join('\n') + '\n');
  console.log(report.join('\n'));
}

if (what === 'strips' || what === 'all') await strips();
if (what === 'stills' || what === 'all') await stills();
await browser.close();
