/**
 * Poster layer vs live stage, through the real controller (read-only on the repo).
 *   node --experimental-transform-types --no-warnings layer.ts
 * Env: BASE, VIEW (3x2 | 1x1 | 3x4 | laptop | phone), SCENES (csv), POSES (csv), OUT (dir)
 * Per pose: the harness loads the scene behind a gate, so the poster layer (poster + backdrop, as
 * shown before the scene is live: host-ready, guest-ready, a saved accept / decline) is captured
 * first; then the gate opens, the scene goes live in the same pose (reduced motion) and the stage
 * is captured again.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '/Users/suryanewa/Developer/projects/livetime-invitations/.claude/worktrees/v17-posters/node_modules/playwright-core/index.mjs';
const base = process.env.BASE ?? 'http://127.0.0.1:5706';
const view = process.env.VIEW ?? '3x2';
const out = process.env.OUT!;
const scenes = (process.env.SCENES ?? 'party,birthday,sports,dinner,business').split(',');
const poses = (process.env.POSES ?? 'host-ready,guest-ready,accepted,declined').split(',');
/**
 * VIA=choose: the live capture of an answered pose is taken on a second load without the saved
 * answer, the answer chosen once live (reduced motion); the poster layer is always the saved
 * answer's (what a guest with a saved answer sees before load). Default: both from the saved load.
 */
const via = process.env.VIA ?? 'saved';
const VIEWS: Record<string, { w: number; h: number; dpr: number; layout?: string; insets?: object }> = {
  '3x2': { w: 1080, h: 720, dpr: 1 },
  '1x1': { w: 720, h: 720, dpr: 1 },
  '3x4': { w: 540, h: 720, dpr: 1 },
  // The showcase's frame squares in guest mode (getFrame, v1.7 integration): the dock right / the sheet below.
  laptop: { w: 1280, h: 720, dpr: 2, layout: 'fullscreen', insets: { left: 184.1484375, top: 176.296875, right: 1280 - 184.1484375 - 527.703125, bottom: 720 - 176.296875 - 527.703125 } },
  phone: { w: 390, h: 844, dpr: 3, layout: 'fullscreen', insets: { left: 0, top: 173.59375, right: 0, bottom: 844 - 173.59375 - 390 } },
};
const v = VIEWS[view]!;
await mkdir(out, { recursive: true });
const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:#fff}#s{position:relative}</style></head><body><div id="s"></div>
<script type="module">
import '/src/ui/shell.css';
import { createInvitation } from '/src/core/controller.ts';
import { posterUrl, backdropUrl } from '/src/demo/posters.ts';
import { POSE_TEXT, posterConfig } from '/src/demo/fixtures.ts';
import { DEFAULT_CONFIGS } from '/src/core/types.ts';
const q = new URLSearchParams(location.search);
const el = document.getElementById('s');
el.style.width = q.get('w') + 'px'; el.style.height = q.get('h') + 'px';
let release; const gate = new Promise((r) => (release = r));
window.__release = () => release();
const scene = q.get('scene');
const mods = {
  party: () => import('/src/scenes/party/index.ts').then((m) => m.partyScene),
  birthday: () => import('/src/scenes/birthday/index.ts').then((m) => m.birthdayScene),
  sports: () => import('/src/scenes/sports/index.ts').then((m) => m.sportsScene),
  dinner: () => import('/src/scenes/dinner/index.ts').then((m) => m.dinnerScene),
  business: () => import('/src/scenes/business/index.ts').then((m) => m.businessScene),
};
const insets = q.get('insets') ? JSON.parse(q.get('insets')) : undefined;
const handle = createInvitation({
  mount: el, layout: q.get('layout') || undefined, frameInsets: insets,
  config: posterConfig(DEFAULT_CONFIGS[scene]), mode: q.get('mode'), initialResponse: q.get('resp') || undefined,
  reducedMotion: true, scenes: { [scene]: () => gate.then(mods[scene]) }, posterFor: posterUrl, backdropFor: backdropUrl,
  describePose: (c, p) => POSE_TEXT[c][p],
  onResponseRequested: (r) => queueMicrotask(() => handle.applyResponseResult({ requestId: r.requestId, status: 'saved', response: r.response })),
});
window.__showcase = { controller: handle, get state() { return handle.getState(); } };
</script></body></html>`;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.dpr });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.route(/\/__posters\/harness\.html/, (route) => route.fulfill({ body: HARNESS, contentType: 'text/html' }));
const PARAMS: Record<string, { mode: string; resp?: string; visual: string }> = {
  'host-ready': { mode: 'host', visual: 'host-ready' },
  'guest-ready': { mode: 'guest', visual: 'guest-ready' },
  accepted: { mode: 'guest', resp: 'accept', visual: 'accepted-pose' },
  declined: { mode: 'guest', resp: 'decline', visual: 'declined-pose' },
};
const meta: any[] = [];
const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
for (const scene of scenes) {
  for (const pose of poses) {
    const p = PARAMS[pose]!;
    const qs = new URLSearchParams({ scene, w: String(v.w), h: String(v.h), mode: p.mode, ...(p.resp ? { resp: p.resp } : {}), ...(v.layout ? { layout: v.layout, insets: JSON.stringify(v.insets) } : {}) });
    await page.goto(`${base}/__posters/harness.html?${qs}`);
    // The poster layer: the poster decoded, the backdrop's image decoded.
    await page.waitForFunction(() => { const i = document.querySelector('.lt-stage__poster') as HTMLImageElement | null; return !!i && i.complete && i.naturalWidth > 0; }, null, { timeout: 30000 });
    await page.evaluate(async () => {
      const b = document.querySelector('.lt-stage__backdrop') as HTMLElement | null;
      const m = b?.style.backgroundImage.match(/url\("?(.*?)"?\)/);
      if (m) { const i = new Image(); i.src = m[1]!; await i.decode(); }
    });
    await frames();
    await page.waitForTimeout(150);
    const st = await page.evaluate(() => (window as any).__showcase.state.resource);
    await page.locator('#s').screenshot({ path: join(out, `${scene}-${pose}-poster.png`) });
    // Live: open the gate, wait for ready, the pose, the canvas shown and the poster gone.
    if (via !== 'saved' && p.resp) { qs.delete('resp'); await page.goto(`${base}/__posters/harness.html?${qs}`); }
    await page.waitForFunction(() => typeof (window as any).__release === "function");
    await page.evaluate(() => (window as any).__release());
    await page.waitForFunction(() => (window as any).__showcase.state.resource === 'ready', null, { timeout: 60000 });
    await page.waitForFunction(() => (window as any).__showcase.controller.deferredReady(), null, { timeout: 60000 });
    if (via !== 'saved' && p.resp) await page.evaluate((r) => (window as any).__showcase.controller.chooseResponse(r), p.resp);
    await page.waitForFunction((vis) => (window as any).__showcase.state.visual === vis, p.visual, { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector('.lt-stage__canvas')?.classList.contains('is-visible'), null, { timeout: 20000 });
    await page.waitForTimeout(700);
    await frames();
    await page.locator('#s').screenshot({ path: join(out, `${scene}-${pose}-live.png`) });
    const frame = await page.evaluate(() => (window as any).__showcase.controller.getFrame());
    const fr = await page.evaluate(() => { const f = (window as any).__showcase.controller.framing(); return f && { pull: f.pull, close: f.close }; });
    meta.push({ scene, pose, posterState: st, frame, ...fr });
    console.log(view, scene, pose, 'poster@', st, 'frame', frame ? `${frame.x.toFixed(1)},${frame.y.toFixed(1)} ${frame.size.toFixed(1)}` : 'none', JSON.stringify(fr));
  }
}
await writeFile(join(out, `meta.json`), JSON.stringify({ view, ...v, meta }, null, 1));
await browser.close();
