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
      const { PRESETS } = await load('/src/demo/fixtures.ts');
      const { posterUrl } = await load('/src/demo/posters.ts');
      const { presetOf } = await load('/src/core/config.ts');
      const sc = (window as any).__showcase;
      const ready = async () => {
        for (let i = 0; i < 600 && sc.state?.resource !== 'ready'; i++) await new Promise((r) => setTimeout(r, 50));
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
        sc.setConfig(option.config);
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
      `Regenerate and ship them: pnpm capture ${scene} <baseUrl> (posters into assets/scenes/${scene}/posters/, the thumbnail into assets/ui/collection/${scene}.webp; CAPTURE_STAGE_ONLY=1 only stages them in outputs/${scene}/, it does not ship them), then pnpm capture backdrops <baseUrl> if the framing changed.`,
    ].join('\n')).toEqual([]);
  });
}
