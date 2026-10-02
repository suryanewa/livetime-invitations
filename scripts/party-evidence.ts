/**
 * Party v1.5 evidence: frame strips, beat stills and clips rendered on the production stage at exact
 * times (scripts/party-lab/), plus the real render loop (the showcase on a virtual clock).
 *
 *   node --experimental-transform-types --no-warnings scripts/party-evidence.ts <job> [baseUrl] [outDir]
 *
 * Jobs: host (120 fps strip + clip + zoomed strip of the last 0.5 s), beats (stills per beat),
 * accept (strip + clip incl. the perpetual spin after the clip), loop (showcase: accept, the
 * hand-over and 4 s of play; accept → decline change of mind; rapid reversals).
 * Output defaults to evidence/v1.5/party/<job>/.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';

const job = process.argv[2] ?? 'host';
const base = process.argv[3]?.startsWith('http') ? process.argv[3] : 'http://127.0.0.1:5501';
const root = join(import.meta.dirname, '..', 'evidence', 'v1.5', 'party');
const out = process.argv[4] ?? join(root, job);

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'],
});

async function save(file: string, dataUrl: string) {
  await writeFile(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
}
const pad = (i: number) => String(i).padStart(4, '0');

async function lab(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });
  page.on('console', (m) => m.type() === 'error' && console.error('[lab]', m.text()));
  await page.goto(`${base}/scripts/party-lab/index.html${process.env.LAB_QUERY ? `?${process.env.LAB_QUERY}` : ''}`);
  await page.waitForSelector('body[data-ready="true"]', { timeout: 60_000 });
  return page;
}

type Frame = { seq?: 'host' | 'accept' | 'decline'; t: number; run?: number };
/** Renders frames on the lab page; returns the files written. */
async function frames(page: Page, dir: string, list: Frame[], size = 540, dpr = 2): Promise<string[]> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const files: string[] = [];
  for (const [i, f] of list.entries()) {
    const url = await page.evaluate(([fr, s, d]) => {
      const lab = (window as any).__lab;
      if (fr.seq) lab.sample(fr.seq, fr.t);
      if (fr.run) lab.run(fr.run);
      return lab.still(s, d) as string;
    }, [f, size, dpr] as const);
    const file = join(dir, `f${pad(i)}.png`);
    await save(file, url);
    files.push(file);
  }
  return files;
}

/** Contact sheet of `files` (every `step`-th), labelled with their times. */
function sheet(files: string[], labels: string[], file: string, tile: string, crop?: string, step = 1, columns = 8) {
  const args: string[] = [];
  for (let i = 0; i < files.length; i += step) {
    let src = files[i]!;
    if (crop) {
      src = `${src.slice(0, -4)}-crop.png`;
      execFileSync('magick', [files[i]!, '-crop', crop, '+repage', src]);
    }
    args.push('(', src, '-resize', tile, '-gravity', 'north', '-font', '/System/Library/Fonts/Supplemental/Arial Narrow.ttf', '-fill', '#222', '-pointsize', '15', '-annotate', '+0+4', labels[i]!, ')');
  }
  execFileSync('magick', ['montage', ...args, '-tile', `${columns}x`, '-geometry', '+2+2', '-background', '#bbb', file]);
}

function clip(dir: string, fps: number, file: string, crop?: string) {
  const vf = crop ? [`crop=${crop}`, 'scale=trunc(iw/2)*2:trunc(ih/2)*2'] : ['scale=trunc(iw/2)*2:trunc(ih/2)*2'];
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(dir, 'f%04d.png'), '-vf', vf.join(','), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '14', file]);
}

/** The record's region in a 1080 px still (the platter, with the hover above it). */
const RECORD_CROP = '480x220+255+520';
const RECORD_CROP_FF = '480:220:255:520';

await mkdir(out, { recursive: true });
if (job === 'host') {
  const page = await lab();
  const fps = Number(process.env.FPS ?? 120);
  const T = 1.2;
  const list = Array.from({ length: Math.round(T * fps) + 1 }, (_, i) => ({ seq: 'host' as const, t: i / fps }));
  const files = await frames(page, join(out, 'frames'), list);
  const labels = list.map((f) => `${f.t.toFixed(3)} s`);
  sheet(files, labels, join(out, 'host-strip.jpg'), '270x270', undefined, Math.max(1, Math.round(fps / 30)));
  // The landing and settle, zoomed: every 60 fps frame from 0.55 s to 1.05 s.
  const from = Math.round(0.55 * fps), to = Math.round(1.05 * fps) + 1;
  sheet(files.slice(from, to), labels.slice(from, to), join(out, 'host-landing-zoom.jpg'), '400x', RECORD_CROP, Math.max(1, Math.round(fps / 60)), 6);
  clip(join(out, 'frames'), fps, join(out, `host-${fps}fps.mp4`));
  clip(join(out, 'frames'), fps, join(out, `host-${fps}fps-zoom.mp4`), RECORD_CROP_FF);
  console.log('host strip:', out);
} else if (job === 'beats') {
  const page = await lab();
  const beats: [string, Frame][] = (process.env.BEATS ?? 'host:0,host:0.2,host:0.4,host:0.6,host:0.75,host:0.8,host:0.85,host:0.95,host:1.2,accept:0.25,accept:0.4,accept:1.0,accept:1.6,decline:0.7,decline:1.4')
    .split(',').map((s) => { const [seq, t] = s.split(':'); return [`${seq}-${t}`, { seq: seq as Frame['seq'], t: Number(t) }]; });
  const files = await frames(page, join(out, 'stills'), beats.map(([, f]) => f));
  sheet(files, beats.map(([n]) => n), join(out, 'beats.jpg'), '400x400');
  console.log('beats:', out);
} else if (job === 'accept') {
  const page = await lab();
  const fps = Number(process.env.FPS ?? 60);
  // The clip, then the scene's own continuous channel (simulate) for 3.2 s more.
  const clipFrames = Array.from({ length: Math.round(1.6 * fps) }, (_, i) => ({ seq: 'accept' as const, t: i / fps }));
  const files = await frames(page, join(out, 'frames'), clipFrames);
  const more = await page.evaluate(([n, f, s]) => {
    const lab = (window as any).__lab;
    lab.scene.pose('accepted');
    const urls: string[] = [];
    for (let i = 0; i < n; i++) {
      lab.scene.simulate(f);
      urls.push(lab.still(s, 2));
    }
    return urls;
  }, [Math.round(3.2 * fps), 1 / fps, 540] as const);
  const first = files.length;
  for (const [i, u] of more.entries()) {
    const file = join(out, 'frames', `f${pad(first + i)}.png`);
    await save(file, u);
    files.push(file);
  }
  const labels = files.map((_, i) => `${(i / fps).toFixed(3)} s`);
  sheet(files, labels, join(out, 'accept-strip.jpg'), '270x270', undefined, Math.max(1, Math.round(fps / 10)));
  clip(join(out, 'frames'), fps, join(out, `accept-${fps}fps.mp4`));
  clip(join(out, 'frames'), fps, join(out, `accept-${fps}fps-zoom.mp4`), RECORD_CROP_FF);
  console.log('accept strip:', out);
}
if (job === 'loop') {
  // The real controller and render loop on Playwright's virtual clock (frames every 16 ms), as
  // `pnpm capture` records: the accept clip, its hand-over and the record playing on; a change of
  // mind while it plays and one during the clip; decline then accept; rapid reversals.
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 });
  page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
  await page.clock.install();
  await page.goto(`${base}/?scene=party`);
  const call = <T,>(fn: string) => page.evaluate((f) => new Function('s', `return (${f})(s)`)((window as any).__showcase), fn) as Promise<T>;
  const tick = (ms: number) => page.clock.runFor(ms);
  const waitReady = async () => {
    for (let i = 0; i < 400; i++) {
      if ((await call<string>('(s) => s.state?.resource')) === 'ready') return;
      await tick(50);
      await page.waitForTimeout(10);
    }
    throw new Error('scene never became ready');
  };
  await waitReady();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await tick(1000);
  const still = () => call<string>('(s) => s.controller.captureStill(540, 2)');
  const runs: [string, number, [number, string][]][] = [
    ['accept-play', 5.0, [[0, 'accept']]],
    ['change-while-playing', 4.4, [[0, 'accept'], [3.0, 'decline']]],
    ['change-mid-clip', 2.4, [[0, 'accept'], [0.7, 'decline']]],
    ['change-back', 3.0, [[0, 'decline'], [0.6, 'accept']]],
    ['reversals', 3.4, [[0, 'accept'], [0.12, 'decline'], [0.24, 'accept'], [0.36, 'decline'], [0.48, 'accept']]],
  ];
  const only = process.env.RUNS?.split(',');
  for (const [name, seconds, script] of runs) {
    if (only && !only.includes(name)) continue;
    await page.evaluate(() => (document.querySelector('[data-action="reset"]') as HTMLButtonElement).click());
    await waitReady();
    await call('(s) => { s.controller.setReducedMotion(false); s.controller.setMode("guest"); }');
    await tick(300);
    const dir = join(out, name);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    const FRAME_MS = 16;
    const total = Math.round((seconds * 1000) / FRAME_MS);
    const files: string[] = [];
    for (let i = 0; i <= total; i++) {
      for (const [at, choice] of script) if (Math.round((at * 1000) / FRAME_MS) === i) await call(`(s) => s.controller.chooseResponse("${choice}")`);
      const file = join(dir, `f${pad(i)}.png`);
      await save(file, await still());
      files.push(file);
      await tick(FRAME_MS);
    }
    const labels = files.map((_, i) => `${((i * FRAME_MS) / 1000).toFixed(3)} s`);
    sheet(files, labels, join(out, `${name}-strip.jpg`), '270x270', undefined, 6);
    clip(dir, 1000 / FRAME_MS, join(out, `${name}.mp4`));
    clip(dir, 1000 / FRAME_MS, join(out, `${name}-zoom.mp4`), '640:360:220:420');
    console.log('loop', name);
  }
}
await browser.close();
