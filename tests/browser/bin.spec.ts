import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * v1.5 review (the guest-experience judge's measurements): the shared bin (6 MB) loads after the
 * scene is ready and warms in idle moments, so the live scene appears without it and the first
 * decline costs nothing; a decline tapped before it has arrived waits for it, then plays.
 */

type Snap = { resource: string; resourceReason?: string; visual: string; response: { intent: string | null; persistence: string } };
const state = (page: Page) => page.evaluate(() => (window as any).__showcase.state as Snap);
const deferredReady = (page: Page) => page.evaluate(() => (window as any).__showcase.controller.deferredReady() as boolean);
const info = (page: Page) => page.evaluate(() => (window as any).__showcase.controller.renderInfo() as { textures: number; programs: number; geometries: number });

async function ready(page: Page, scene: string) {
  await page.goto(`/?scene=${scene}`);
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
}

for (const scene of ['birthday', 'dinner'] as const) {
  test(`${scene}: ready without the bin; it arrives after, and the first decline uploads and links nothing`, async ({ page }) => {
    // When the stage first says ready, on the page's own clock.
    await page.addInitScript(() => {
      new MutationObserver((records) => {
        for (const r of records) {
          const el = r.target as HTMLElement;
          if (el.dataset?.resource === 'ready' && !(window as any).__readyAt) (window as any).__readyAt = performance.now();
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-resource'] });
    });
    await ready(page, scene);
    await expect.poll(() => deferredReady(page), { timeout: 30_000 }).toBe(true);
    // The bin is not part of the load: it is requested once the scene is up.
    const [readyAt, binAt] = await page.evaluate(() => [
      (window as any).__readyAt as number,
      performance.getEntriesByType('resource').find((e) => new URL(e.name).pathname.endsWith('disposal-bin.glb') && !new URL(e.name).search)?.startTime ?? -1,
    ]);
    expect(binAt).toBeGreaterThanOrEqual(readyAt);
    await expect.poll(() => deferredReady(page), { timeout: 30_000 }).toBe(true);
    await page.getByRole('button', { name: 'Guest', exact: true }).click();
    await page.waitForTimeout(300);
    const before = await info(page);
    await page.getByRole('button', { name: 'Decline' }).click();
    await expect.poll(async () => (await state(page)).visual, { timeout: 10_000 }).toBe('declined-pose');
    const after = await info(page);
    // Its textures and programs were all made before the tap.
    expect(after.textures).toBeLessThanOrEqual(before.textures);
    expect(after.programs).toBeLessThanOrEqual(before.programs);
  });

  test(`${scene}: a decline tapped before the bin has arrived saves at once, holds the picture, then plays the whole decline`, async ({ page }) => {
    let release: (() => void) | null = null;
    await page.route('**/disposal-bin*.glb', async (route: Route) => {
      await new Promise<void>((r) => (release = r));
      await route.continue();
    });
    await ready(page, scene);
    await page.getByRole('button', { name: 'Guest', exact: true }).click();
    await page.getByRole('button', { name: 'Decline' }).click();
    await expect.poll(async () => (await state(page)).response.persistence).toBe('saved');
    await page.waitForTimeout(500);
    // The answer is in; the picture waits on guest-ready for the bin.
    expect((await state(page)).visual).toBe('guest-ready');
    expect((await state(page)).resource).toBe('ready');
    await expect.poll(() => release !== null, { timeout: 10_000 }).toBe(true);
    release!();
    await expect.poll(async () => (await state(page)).visual, { timeout: 20_000 }).toBe('decline-playing');
    await expect.poll(async () => (await state(page)).visual, { timeout: 10_000 }).toBe('declined-pose');
  });

  test(`${scene}: if the bin cannot be loaded, a decline shows the declined poster and the answer still saves`, async ({ page }) => {
    await page.route('**/disposal-bin*.glb', (route) => route.abort());
    await ready(page, scene);
    await page.getByRole('button', { name: 'Guest', exact: true }).click();
    await page.getByRole('button', { name: 'Decline' }).click();
    await expect.poll(async () => (await state(page)).response.persistence).toBe('saved');
    await expect.poll(async () => (await state(page)).resource, { timeout: 10_000 }).toBe('fallback');
    expect((await state(page)).resourceReason).toBe('asset-failure');
    await expect(page.locator('.lt-stage__poster')).toHaveAttribute('src', /declined/);
  });
}

for (const scene of ['birthday', 'dinner'] as const) {
  test(`${scene}: a saved decline opens on the declined pose with the bin (it loads before ready then)`, async ({ page }) => {
    await page.goto(`/?scene=${scene}&saved=decline`);
    await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
    expect((await state(page)).visual).toBe('declined-pose');
    expect(await deferredReady(page)).toBe(true);
    const still = await page.evaluate(() => (window as any).__showcase.controller.captureStill(128, 1) as string);
    // The bin is drawn: a dark mass in the left half of the still.
    const dark = await page.evaluate(async (url) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d')!;
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, 128, 128).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i]! + d[i + 1]! + d[i + 2]! < 150) n++;
      return n / (128 * 128);
    }, still);
    expect(dark).toBeGreaterThan(0.05);
  });
}
