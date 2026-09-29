import { expect, test, type Page } from '@playwright/test';

/**
 * Party behaviour checks (Production Plan M3, Party sub-spec acceptance criteria).
 * Runs the real showcase with the simulated adapter; no playback service is involved.
 */

type Snap = {
  resource: string;
  visual: string;
  response: { intent: string | null; persistence: string };
};

const state = (page: Page) => page.evaluate(() => (window as any).__showcase.state as Snap);
const requests = (page: Page) => page.evaluate(() => (window as any).__showcase.requests.length as number);

async function ready(page: Page, url = '/?scene=party') {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
}

test('Party loads from the collection, and the chosen song shows in HTML through every mode', async ({ page }) => {
  await ready(page, '/');
  await page.locator('.sc-rail__item', { hasText: 'Party' }).click();
  await expect(page.locator('[data-bind="preset-legend"]')).toHaveText('Record label');
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Sample track B' }).click();
  await expect(page.locator('[data-bind="track-title"]')).toHaveText('Sample track B');
  await page.getByRole('button', { name: 'Cobalt label' }).click();
  // Changing the label keeps the song.
  await expect(page.locator('[data-bind="track-title"]')).toHaveText('Sample track B');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await expect(page.locator('[data-bind="track-title"]')).toHaveText('Sample track B');
});

test('Place record plays the host sequence and ends at guest-ready', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Place record' }).click();
  await expect.poll(async () => (await state(page)).visual).toBe('host-playing');
  await expect.poll(async () => (await state(page)).visual, { timeout: 4000 }).toBe('guest-ready');
  await expect(page.getByRole('button', { name: 'Place record again' })).toBeVisible();
});

test('Accept plays to a still display pose (no idle spin); Decline closes the lid; one request each', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 4000 }).toBe('accepted-pose');
  await expect(page.getByRole('status')).toHaveText('Accepted');
  // The record stops: no frames are scheduled once the pose is reached.
  const frames = await page.evaluate(async () => {
    let n = 0;
    const count = () => { n++; };
    const orig = window.requestAnimationFrame;
    (window as any).requestAnimationFrame = (cb: FrameRequestCallback) => { count(); return orig(cb); };
    await new Promise((r) => setTimeout(r, 800));
    (window as any).requestAnimationFrame = orig;
    return n;
  });
  expect(frames).toBeLessThanOrEqual(2);
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 4000 }).toBe('declined-pose');
  await expect.poll(() => requests(page)).toBe(2);
  await expect.poll(async () => (await state(page)).response.persistence).toBe('saved');
});

test('Rapid reversals end in the latest choice with no accumulated motion', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  for (const choice of ['Accept', 'Decline', 'Accept', 'Decline', 'Accept']) {
    await page.getByRole('button', { name: choice }).click();
    await page.waitForTimeout(120);
  }
  await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('accepted-pose');
  // The settled frame must match the exact canonical pose (reduced motion snaps to it).
  const diff = await page.evaluate(async () => {
    const s = (window as any).__showcase;
    const a = s.controller.captureStill(256, 1) as string;
    s.controller.setReducedMotion(true);
    await new Promise((r) => setTimeout(r, 100));
    const b = s.controller.captureStill(256, 1) as string;
    const pixels = async (url: string) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const x = c.getContext('2d')!;
      x.drawImage(img, 0, 0);
      return x.getImageData(0, 0, 256, 256).data;
    };
    const [pa, pb] = await Promise.all([pixels(a), pixels(b)]);
    let sum = 0;
    for (let i = 0; i < pa.length; i += 4) sum += Math.abs(pa[i]! - pb[i]!) + Math.abs(pa[i + 1]! - pb[i + 1]!) + Math.abs(pa[i + 2]! - pb[i + 2]!);
    return sum / (256 * 256 * 3);
  });
  expect(diff).toBeLessThan(0.5);
});

test('Graphics loss shows the matching Party poster and responses still work', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.locator('.sc-dev summary').click();
  await page.getByRole('button', { name: 'Simulate graphics loss' }).click();
  await expect.poll(async () => (await state(page)).resource).toBe('fallback');
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.poll(async () => (await state(page)).response.persistence).toBe('saved');
  await expect(page.locator('.lt-stage__poster')).toHaveAttribute('src', /shared-declined/);
});
