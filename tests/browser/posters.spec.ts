import { expect, test } from '@playwright/test';

/**
 * Poster staleness (v1.5). The posters and collection thumbnails are stills of the live scene
 * (`pnpm capture <scene>`), shipped as WebP. When a scene's model, material, choreography or framing
 * changes, they must be captured again; four scenes shipped stale posters in the v1.5 pass because
 * their owners captured with CAPTURE_STAGE_ONLY=1 (which stages them in outputs/ only). So every
 * canonical pose of every preset is rendered live, exactly as the capture does it (reduced motion,
 * 720 px, DPR 1), and compared with the shipped file.
 *
 * The comparison is perceptual and tolerant of WebP: both images are box-filtered to a quarter of
 * their size (720 → 180 px: WebP's 4 × 4 ringing and the renderer's sub-pixel noise average out),
 * and a pixel counts as changed when a channel differs by more than CHANGED_DELTA. The poster is
 * stale when more than CHANGED_SHARE of its pixels changed. Calibrated on this build (M2 Pro,
 * Chrome, Metal), 41 shipped stills: every fresh capture differs from the live render by at most
 * 15/255 anywhere (mean 1.0–1.5), so no pixel passes CHANGED_DELTA; every stale one (Business's
 * v1.5 status, the bin's polish in Birthday's and Dinner's declined posters) has 0.42–3.3 % of its
 * pixels over it (max 35–223). CHANGED_SHARE (0.05 %, 16 pixels at a quarter size, about the bin's
 * pedal tread in a declined poster) is far below the smallest stale and far above the fresh.
 */

const CHANGED_DELTA = 24;
const CHANGED_SHARE = 0.0005;
const POSES = ['host-ready', 'guest-ready', 'accepted', 'declined'] as const;
const SCENES = ['party', 'birthday', 'sports', 'dinner', 'business'] as const;

type Row = { file: string; share: number; mean: number; max: number };

for (const scene of SCENES) {
  test(`${scene}: the shipped posters and collection thumbnail are the live scene's (not stale)`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?scene=${scene}`);
    await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
    const rows = await page.evaluate(async ({ scene, poses, delta }) => {
      // The showcase's own modules, from the dev server (paths, not types: this runs in the page).
      const load = (path: string) => import(/* @vite-ignore */ path) as Promise<any>;
      const { PRESETS, posterConfig } = await load('/src/demo/fixtures.ts');
      const { posterUrl, backdropUrl } = await load('/src/demo/posters.ts');
      const { presetOf } = await load('/src/core/config.ts');
      const sc = (window as any).__showcase;
      const ready = async () => {
        for (let i = 0; i < 600 && sc.state?.resource !== 'ready'; i++) await new Promise((r) => setTimeout(r, 50));
        // v1.5: Birthday and Dinner load the bin after ready (the declined pose waits for it).
        for (let i = 0; i < 600 && !sc.controller.deferredReady(); i++) await new Promise((r) => setTimeout(r, 50));
      };
      const image = async (src: string) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        return img;
      };
      /** RGB of `img` box-filtered to size/4 (two halvings of 2 × 2 averages). */
      const reduce = (img: HTMLImageElement, size: number) => {
        let src: CanvasImageSource = img, s = size;
        for (let k = 0; k < 2; k++) {
          const cv = document.createElement('canvas');
          cv.width = cv.height = s / 2;
          const ctx = cv.getContext('2d')!;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(src, 0, 0, s / 2, s / 2);
          src = cv;
          s /= 2;
        }
        return (src as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, s, s).data;
      };
      const compare = async (live: string, shipped: string, size: number, file: string) => {
        const [a, b] = await Promise.all([image(live), image(shipped)]);
        const A = reduce(a, size), B = reduce(b, size);
        let changed = 0, sum = 0, max = 0;
        const n = A.length / 4;
        for (let i = 0; i < A.length; i += 4) {
          const d = Math.max(Math.abs(A[i]! - B[i]!), Math.abs(A[i + 1]! - B[i + 1]!), Math.abs(A[i + 2]! - B[i + 2]!));
          sum += d;
          max = Math.max(max, d);
          if (d > delta) changed++;
        }
        return { file, share: changed / n, mean: sum / n, max };
      };
      const c = () => sc.controller;
      const act: Record<string, () => void> = {
        'host-ready': () => { c().setMode('host'); c().resetVisual(); },
        'guest-ready': () => c().setMode('guest'),
        accepted: () => { c().setMode('guest'); c().chooseResponse('accept'); },
        declined: () => { c().setMode('guest'); c().chooseResponse('decline'); },
      };
      const out: { file: string; share: number; mean: number; max: number }[] = [];
      const seen = new Set<string>();
      const presets = (PRESETS as Record<string, { config: unknown }[]>)[scene]!;
      for (const [i, option] of presets.entries()) {
        // A fresh showcase per preset, as the capture does (no answer carried over from the last).
        (document.querySelector('[data-action="reset"]') as HTMLButtonElement).click();
        await new Promise((r) => setTimeout(r, 50));
        await ready();
        // v1.7 polish (#41): rendered as the capture renders them (posterConfig: Dinner's card neutral).
        sc.setConfig(posterConfig(option.config));
        await ready();
        c().setReducedMotion(true);
        for (const pose of poses) {
          act[pose]!();
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const url = posterUrl(scene as never, presetOf(option.config as never), pose);
          if (!url || seen.has(url)) continue;
          seen.add(url);
          out.push(await compare(c().captureStill(720, 1, 'image/png'), url, 720, `assets/scenes/${scene}/posters/${url.split('/').pop()!.split('?')[0]}`));
          // The collection thumbnail: the first preset at guest-ready, 192 px.
          if (i === 0 && pose === 'guest-ready') out.push(await compare(c().captureStill(192, 1, 'image/png'), `/assets/ui/collection/${scene}.webp`, 192, `assets/ui/collection/${scene}.webp`));
          // v1.7 posters: the backdrops have the scene in them (one per pose, the default config), so
          // they go stale like the posters: the pose at 7 × the field, compared at a quarter of 1000 px.
          const backdrop = i === 0 ? backdropUrl(scene, pose) : null;
          if (backdrop && !seen.has(backdrop)) {
            seen.add(backdrop);
            out.push(await compare(c().captureStill(1000, 1, 'image/png', undefined, { field: 7 }), backdrop, 1000, `assets/scenes/${scene}/${backdrop.split('/').pop()!.split('?')[0]}`));
          }
        }
      }
      return out;
    }, { scene, poses: POSES, delta: CHANGED_DELTA }) as Row[];
    expect(rows.length, `${scene}: no posters compared`).toBeGreaterThan(3);
    const stale = rows.filter((r) => r.share > CHANGED_SHARE);
    const lines = rows.map((r) => `  ${r.share > CHANGED_SHARE ? 'STALE' : 'ok   '} ${r.file}: ${(r.share * 100).toFixed(2)} % of pixels changed by > ${CHANGED_DELTA}/255 (mean ${r.mean.toFixed(2)}, max ${r.max})`);
    console.log(`${scene}\n${lines.join('\n')}`);
    expect(stale, [
      `${scene}: ${stale.length} shipped still(s) no longer match the live scene: more than ${(CHANGED_SHARE * 100).toFixed(2)} % of the pixels (box-filtered to a quarter size) differ by more than ${CHANGED_DELTA}/255.`,
      ...lines,
      `Regenerate and ship them: pnpm capture ${scene} <baseUrl> (posters into assets/scenes/${scene}/posters/, the thumbnail into assets/ui/collection/${scene}.webp; CAPTURE_STAGE_ONLY=1 only stages them in outputs/${scene}/, it does not ship them), then pnpm capture backdrops <baseUrl> (the backdrop*.webp, which have the scene in them since v1.7).`,
    ].join('\n')).toEqual([]);
  });
}

/**
 * v1.7 posters: the poster layer is the live stage. Before the scene is live (and on the Static tier,
 * after a context loss, on a load failure, for a saved answer) the guest sees the square poster on
 * the frame square, feathered over 2 % of the frame on its edges inside the stage only, over the
 * backdrop (the scene at the poster's pose, 7 × the field). Through the real controller, the scene
 * loading behind a gate: the poster layer is captured, then the gate opens and the same pose is
 * captured live (reduced motion). In a square-layout mount of another aspect (3:2, 3:4; v1.7: the
 * square poster was cover-cropped, Sports' balls and board top cut) and in fullscreen at the
 * showcase's laptop frame (v1.7: a 9 % feather faded Sports' board top and balls, a bare backdrop
 * lacked the hoop's shadow and Business's lanyard): both box-filtered so the frame square is about
 * 180 px, a pixel changed when a channel differs by more than CHANGED_DELTA, the share of changed
 * pixels inside the frame square and outside it. Calibrated on this build: inside ≤ 0.12 %, outside
 * ≤ 0.25 % (v1.7 before the fix: Sports inside 1.5–27 %, outside 5.6–17 %).
 */
const LAYER_SHARE = 0.005;
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
  sports: () => import('/src/scenes/sports/index.ts').then((m) => m.sportsScene),
  business: () => import('/src/scenes/business/index.ts').then((m) => m.businessScene),
};
const handle = createInvitation({
  mount: el, layout: q.get('layout') || undefined, frameInsets: q.get('insets') ? JSON.parse(q.get('insets')) : undefined,
  config: posterConfig(DEFAULT_CONFIGS[scene]), mode: q.get('mode'), initialResponse: q.get('resp') || undefined,
  reducedMotion: true, scenes: { [scene]: () => gate.then(mods[scene]) }, posterFor: posterUrl, backdropFor: backdropUrl,
  describePose: (c, p) => POSE_TEXT[c][p],
  onResponseRequested: (r) => queueMicrotask(() => handle.applyResponseResult({ requestId: r.requestId, status: 'saved', response: r.response })),
});
window.__showcase = { controller: handle, get state() { return handle.getState(); } };
</script></body></html>`;

test('v1.7 posters: in a square-layout mount of another aspect and in fullscreen, the poster layer is the live stage (the frame square, the feather, the backdrop)', async ({ page }) => {
  test.setTimeout(180_000);
  await page.route(/\/__posters\/harness\.html/, (route) => route.fulfill({ body: HARNESS, contentType: 'text/html' }));
  const open = async (scene: string, w: number, h: number, pose: string, fullscreen?: object) => {
    const p: Record<string, string> = ({ 'host-ready': { mode: 'host' }, 'guest-ready': { mode: 'guest' }, accepted: { mode: 'guest', resp: 'accept' }, declined: { mode: 'guest', resp: 'decline' } } as Record<string, Record<string, string>>)[pose]!;
    const qs = new URLSearchParams({ scene, w: String(w), h: String(h), ...p, ...(fullscreen ? { layout: 'fullscreen', insets: JSON.stringify(fullscreen) } : {}) });
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`/__posters/harness.html?${qs}`);
    await page.waitForFunction(() => { const i = document.querySelector('.lt-stage__poster') as HTMLImageElement | null; return !!i && i.complete && i.naturalWidth > 0; });
  };
  // The square stage (1:1): the poster is the whole stage, unfeathered, and no backdrop is fetched.
  await open('sports', 720, 720, 'guest-ready');
  expect(await page.locator('.lt-stage__poster').evaluate((el) => [el.classList.contains('is-feathered'), el.getBoundingClientRect().width])).toEqual([false, 720]);
  expect(await page.locator('.lt-stage__backdrop').evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none');
  // (In dev the stills' URL modules, `backdrop*.webp?url`, load with posters.ts; the images do not.)
  expect(await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => /backdrop[-a-z]*\.webp$/.test(e.name)).map((e) => e.name))).toEqual([]);

  const LAPTOP = { left: 184.15, top: 176.3, right: 1280 - 184.15 - 527.7, bottom: 720 - 176.3 - 527.7 };
  const rows: string[] = [];
  const bad: string[] = [];
  for (const [label, w, h, fullscreen] of [['3:2 embed', 1080, 720, undefined], ['3:4 embed', 540, 720, undefined], ['laptop fullscreen', 1280, 720, LAPTOP]] as const) {
    for (const [scene, pose] of [['sports', 'host-ready'], ['sports', 'accepted'], ['sports', 'declined'], ['business', 'accepted']] as const) {
      await open(scene, w, h, pose, fullscreen);
      // The backdrop decoded and shown (it waits for its poster), when the stage shows more than the frame.
      await page.evaluate(async () => {
        const b = document.querySelector('.lt-stage__backdrop') as HTMLElement;
        const m = getComputedStyle(b).backgroundImage.match(/url\("?(.*?)"?\)/);
        if (m) { const i = new Image(); i.src = m[1]!; await i.decode(); }
      });
      await expect.poll(() => page.locator('.lt-stage__backdrop').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
      await page.waitForTimeout(100);
      const layer = (await page.locator('#s').screenshot()).toString('base64');
      await page.evaluate(() => (window as any).__release());
      await page.waitForFunction(() => (window as any).__showcase.state.resource === 'ready', null, { timeout: 30_000 });
      await page.waitForFunction((v) => (window as any).__showcase.state.visual === v, { 'host-ready': 'host-ready', accepted: 'accepted-pose', declined: 'declined-pose' }[pose]);
      await page.waitForFunction(() => document.querySelector('.lt-stage__canvas')?.classList.contains('is-visible'));
      await page.waitForTimeout(600);
      const live = (await page.locator('#s').screenshot()).toString('base64');
      const r = await page.evaluate(async ({ a, b, w, h, delta }) => {
        const f = (window as any).__showcase.controller.getFrame() ?? (() => { const s = Math.min(w, h); return { x: (w - s) / 2, y: (h - s) / 2, size: s }; })();
        const k = Math.max(1, Math.round(f.size / 180));
        const W = Math.round(w / k), H = Math.round(h / k);
        const pixels = async (src: string) => {
          const img = new Image();
          img.src = `data:image/png;base64,${src}`;
          await img.decode();
          const cv = document.createElement('canvas');
          cv.width = W; cv.height = H;
          const ctx = cv.getContext('2d')!;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, W, H);
          return ctx.getImageData(0, 0, W, H).data;
        };
        const [A, B] = await Promise.all([pixels(a), pixels(b)]);
        const x0 = f.x / k, y0 = f.y / k, x1 = (f.x + f.size) / k, y1 = (f.y + f.size) / k;
        let inN = 0, inC = 0, outN = 0, outC = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const d = Math.max(Math.abs(A[i]! - B[i]!), Math.abs(A[i + 1]! - B[i + 1]!), Math.abs(A[i + 2]! - B[i + 2]!));
          const inside = x + 0.5 >= x0 && x + 0.5 < x1 && y + 0.5 >= y0 && y + 0.5 < y1;
          if (inside) { inN++; if (d > delta) inC++; } else { outN++; if (d > delta) outC++; }
        }
        return { inside: inC / Math.max(1, inN), outside: outN ? outC / outN : 0 };
      }, { a: layer, b: live, w, h, delta: CHANGED_DELTA });
      const line = `${label} ${scene} ${pose}: inside the frame ${(r.inside * 100).toFixed(2)} %, outside ${(r.outside * 100).toFixed(2)} % changed by > ${CHANGED_DELTA}/255`;
      rows.push(line);
      if (r.inside > LAYER_SHARE || r.outside > LAYER_SHARE) bad.push(line);
    }
  }
  console.log(rows.join('\n'));
  expect(bad, `the poster layer differs from the live stage (more than ${LAYER_SHARE * 100} % of the pixels):\n${rows.join('\n')}`).toEqual([]);
});
