/** Judge (v1.7 dinner card) frame renderer: the real controller on Playwright's virtual clock, 16 ms ticks.
 *  node --experimental-transform-types jf.ts <outDir>
 *  env: PORT(5704) VIEW=laptop|phone|square  SQ=size SQDPR=dpr (square: captureStill)  Q=query (e.g. "&saved=accept")
 *       MODE=guest|host  CONFIG=json (via __showcase.setConfig)  RM=1  TIER=Low  WARM=ms
 *       ACTION=accept|decline|none (at frame 0)  SCHEDULE="ms:intent,..."  SECONDS  EVERY  FROM(ms) TO(ms)  ONLY=i,j
 *       FMT=png|jpeg  CLIP=x,y,w,h  SETTLE=1 (call controller.settle? no: just ticks)  */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
const [outDir] = process.argv.slice(2);
const E = process.env;
const view = E.VIEW ?? 'laptop';
const vp = view === 'laptop' ? { width: 1280, height: 720, dpr: 2 } : view === 'phone' ? { width: 390, height: 844, dpr: 3 } : { width: 1200, height: 1000, dpr: 1 };
const seconds = Number(E.SECONDS ?? 1), every = Number(E.EVERY ?? 1), from = Number(E.FROM ?? 0), to = Number(E.TO ?? 1e9);
const fmt = (E.FMT ?? 'png') as 'png' | 'jpeg';
const clip = E.CLIP ? (([x, y, width, height]) => ({ x, y, width, height }))(E.CLIP.split(',').map(Number)) : undefined;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text().slice(0, 500)); });
await page.clock.install();
await page.goto(`http://127.0.0.1:${E.PORT ?? 5704}/?scene=${E.PRE ? 'party' : 'dinner'}${E.Q ?? ''}`);
if (E.PRE) {
  for (let i = 0; i < 600; i++) { if (await page.evaluate(() => (window as any).__showcase?.state?.resource === 'ready')) break; await page.clock.runFor(50); await page.waitForTimeout(15); }
  console.log('PRE:', await page.evaluate(new Function(`return (async () => { ${E.PRE} })()`) as any));
  await page.evaluate(() => (window as any).__showcase.setConfig({ category: 'dinner', dish: 'pasta' }));
  for (let i = 0; i < 20; i++) { await page.clock.runFor(50); await page.waitForTimeout(15); }
}
const call = <T,>(fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => new Function('s', 'a', `return (${f})(s, a)`)((window as any).__showcase, a), [fn, args] as const) as Promise<T>;
const tick = (ms: number) => page.clock.runFor(ms);
for (let i = 0; i < 600; i++) { if (await call<boolean>('(s) => s.state?.resource === "ready" && s.controller.deferredReady()')) break; await tick(50); await page.waitForTimeout(15); }
await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
await tick(1000);
await mkdir(outDir, { recursive: true });
if (E.WARM) for (let i = 0; i < Number(E.WARM) / 50; i++) { await tick(50); await page.waitForTimeout(30); }
if (E.TIER) { await call(`(s) => s.controller.setQualityTier('${E.TIER}')`); await tick(500); }
await call(`(s) => s.controller.setReducedMotion(${E.RM ? 'true' : 'false'})`);
if (E.CONFIG) { await call('(s, a) => s.setConfig(JSON.parse(a[0]))', E.CONFIG); await tick(300); }
if (E.MODE) { await call(`(s) => { s.controller.setMode("${E.MODE}"); ${E.MODE === 'host' ? 's.controller.resetVisual();' : ''} }`); await tick(400); }
const FRAME_MS = 16;
const schedule = new Map((E.SCHEDULE ?? '').split(',').filter(Boolean).map((e) => { const [ms, intent] = e.split(':'); return [Math.round(Number(ms) / FRAME_MS), intent!] as const; }));
if (E.ACTION && E.ACTION !== 'none') schedule.set(0, E.ACTION);
const only = E.ONLY ? new Set(E.ONLY.split(',').map(Number)) : null;
const total = only ? Math.max(...only) : Math.round((seconds * 1000) / FRAME_MS);
const rows: string[] = [];
const t0 = performance.now();
for (let i = 0; i <= total; i++) {
  if (schedule.has(i)) await call(`(s) => s.controller.chooseResponse("${schedule.get(i)}")`);
  const f = await call<[number, number, string]>('(s) => { const c = s.controller.framing(); return [c?.close ?? -1, c?.pull ?? -1, s.state.visual]; }');
  rows.push(`${i}\t${(i * 0.016).toFixed(3)}\t${f[0].toFixed(5)}\t${f[1].toFixed(5)}\t${f[2]}`);
  const ms = i * FRAME_MS;
  if (only ? only.has(i) : (i % every === 0 && ms >= from && ms <= to)) {
    const file = join(outDir, `f${String(i).padStart(4, '0')}.${fmt === 'png' ? 'png' : 'jpg'}`);
    if (view === 'square') { const url = await call<string>('(s, a) => s.controller.captureStill(a[0], a[1], "image/png", undefined, { field: a[2] })', Number(E.SQ ?? 540), Number(E.SQDPR ?? 2), Number(E.FIELD ?? 1)); await writeFile(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')); }
    else await page.screenshot({ path: file, clip, type: fmt, quality: fmt === 'jpeg' ? 90 : undefined, timeout: 0 });
  }
  await tick(FRAME_MS);
}
await writeFile(join(outDir, 'channels.txt'), `i\tt\tclose\tpull\tvisual\n${rows.join('\n')}\n`);
const fr = await call<unknown>('(s) => { const c = s.controller.framing(); return c && JSON.parse(JSON.stringify(c)); }');
await writeFile(join(outDir, 'framing.json'), JSON.stringify(fr, null, 1));
const frame = await call<unknown>('(s) => s.controller.getFrame?.()');
console.log(`${total + 1} frames in ${((performance.now() - t0) / 1000).toFixed(1)} s; visual ${await call<string>('(s) => s.state.visual')}; frame ${JSON.stringify(frame)}`);
await browser.close();
