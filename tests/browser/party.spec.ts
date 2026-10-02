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

const still = (page: Page) => page.evaluate(() => (window as any).__showcase.controller.captureStill(256, 1) as string);

/** Decoded RGBA of a 256 px still capture. */
async function pixels(page: Page, url: string): Promise<number[]> {
  return page.evaluate(async (u) => {
    const img = new Image();
    img.src = u;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0);
    return Array.from(x.getImageData(0, 0, 256, 256).data);
  }, url);
}

/** Mean absolute RGB difference between two still captures (0–255). */
async function stillDiff(page: Page, a: string, b: string): Promise<number> {
  const [pa, pb] = await Promise.all([pixels(page, a), pixels(page, b)]);
  let sum = 0;
  for (let i = 0; i < pa.length; i += 4) sum += Math.abs(pa[i]! - pb[i]!) + Math.abs(pa[i + 1]! - pb[i + 1]!) + Math.abs(pa[i + 2]! - pb[i + 2]!);
  return sum / (256 * 256 * 3);
}

/** Pixels whose blue channel clearly dominates (the cobalt label; the studio is warm paper). */
async function bluePixels(page: Page, url: string): Promise<number> {
  const p = await pixels(page, url);
  let n = 0;
  for (let i = 0; i < p.length; i += 4) if (p[i + 2]! > p[i]! + 40 && p[i + 2]! > p[i + 1]! + 20) n++;
  return n;
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

/**
 * Mean absolute RGB difference over the record's label in two 512 px stills: the record turning.
 * The label's box in the square still is (202–267, 294–314); its ink marks are small, so a turning
 * record measures ≈ 0.8 here and a still one exactly 0.
 */
async function labelTurned(page: Page, waitMs = 450): Promise<number> {
  const grab = async () => {
    const url = await page.evaluate(() => (window as any).__showcase.controller.captureStill(512, 1) as string);
    return page.evaluate(async (u) => {
      const img = new Image();
      img.src = u;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      const x = c.getContext('2d')!;
      x.drawImage(img, 0, 0);
      return Array.from(x.getImageData(202, 294, 66, 21).data);
    }, url);
  };
  const a = await grab();
  await page.waitForTimeout(waitMs);
  const b = await grab();
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) sum += Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
  return sum / ((a.length / 4) * 3);
}

test('Accept plays the record on (v1.5): the label keeps turning after the clip; Decline closes the lid; one request each', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 4000 }).toBe('accepted-pose');
  await expect(page.getByRole('status')).toHaveText('Accepted');
  // The record plays on: the loop keeps drawing and the label is somewhere else a moment later.
  await page.waitForTimeout(1000);
  expect(await labelTurned(page)).toBeGreaterThan(0.25);
  const frames = await page.evaluate(async () => {
    let n = 0;
    const orig = window.requestAnimationFrame;
    (window as any).requestAnimationFrame = (cb: FrameRequestCallback) => { n++; return orig(cb); };
    await new Promise((r) => setTimeout(r, 800));
    (window as any).requestAnimationFrame = orig;
    return n;
  });
  expect(frames).toBeGreaterThan(30);
  // A change of mind while it plays: the platter coasts, the arm goes home, the cover closes.
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 4000 }).toBe('declined-pose');
  await expect.poll(() => requests(page)).toBe(2);
  await expect.poll(async () => (await state(page)).response.persistence).toBe('saved');
});

test('Rapid reversals end in the latest choice with no accumulated motion', async ({ page, context }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  for (const choice of ['Accept', 'Decline', 'Accept', 'Decline', 'Accept']) {
    await page.getByRole('button', { name: choice }).click();
    await page.waitForTimeout(120);
  }
  await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('accepted-pose');
  // Playing on, as after any acceptance.
  expect(await labelTurned(page)).toBeGreaterThan(0.25);
  // Snapped to the canonical pose (reduced motion settles the record at its display angle), the
  // frame must match a fresh page that opens directly on the accepted pose (same quality tier):
  // no leftover spin, arm offset, lid angle or status state.
  await page.evaluate(() => (window as any).__showcase.controller.setReducedMotion(true));
  await page.waitForTimeout(100);
  expect(await labelTurned(page, 300)).toBe(0);
  const settled = await still(page);
  const tier = await page.evaluate(() => (window as any).__showcase.state.tier as string);
  const fresh = await context.newPage();
  await ready(fresh, '/?scene=party&saved=accept');
  expect((await state(fresh)).visual).toBe('accepted-pose');
  await fresh.evaluate((t) => {
    const s = (window as any).__showcase;
    if (s.state.tier !== t) s.controller.setQualityTier(t);
    s.controller.setReducedMotion(true);
  }, tier);
  await fresh.waitForTimeout(100);
  const canonical = await still(fresh);
  await fresh.close();
  expect(await stillDiff(page, settled, canonical)).toBeLessThan(0.5);
});

test('Cobalt label swaps the record label in 3D and in the poster, without a reload or request', async ({ page }) => {
  await ready(page);
  const coral = await still(page);
  await page.getByRole('button', { name: 'Cobalt label' }).click();
  await expect(page.getByRole('button', { name: 'Cobalt label' })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(150);
  expect((await state(page)).resource).toBe('ready');
  const cobalt = await still(page);
  const [before, after] = [await bluePixels(page, coral), await bluePixels(page, cobalt)];
  expect(after).toBeGreaterThan(before + 150);
  expect(await requests(page)).toBe(0);
  await page.locator('.sc-dev summary').click();
  await page.getByRole('button', { name: 'Simulate graphics loss' }).click();
  await expect.poll(async () => (await state(page)).resource).toBe('fallback');
  await expect(page.locator('.lt-stage__poster')).toHaveAttribute('src', /cobalt-host-ready/);
});

test('A saved acceptance opens on the accepted pose without a new request', async ({ page }) => {
  await ready(page, '/?scene=party&saved=accept');
  const s = await state(page);
  expect(s.visual).toBe('accepted-pose');
  expect(s.response.intent).toBe('accept');
  expect(s.response.persistence).toBe('saved');
  await page.waitForTimeout(500);
  expect(await requests(page)).toBe(0);
  expect((await state(page)).visual).toBe('accepted-pose');
  await expect(page.getByRole('button', { name: 'Accept' })).toHaveAttribute('aria-pressed', 'true');
});

test('An unknown song id shows the "Selected track" fallback', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as any).__showcase.setConfig({ category: 'party', label: 'coral', songId: 'not-a-fixture' }));
  await expect(page.locator('[data-bind="track-title"]')).toHaveText('Selected track');
  expect((await state(page)).resource).toBe('ready');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await expect(page.locator('[data-bind="track-title"]')).toHaveText('Selected track');
});

test('Switching to Business and back disposes and rebuilds Party cleanly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || /Too many active WebGL contexts|CONTEXT_LOST/i.test(m.text())) errors.push(m.text());
  });
  await ready(page);
  for (const name of ['Business', 'Party', 'Business', 'Party']) {
    await page.locator('.sc-rail__item', { hasText: name }).click();
    await expect(page.locator('.sc-rail__item[aria-pressed="true"]')).toContainText(name);
    await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
  }
  await expect(page.locator('[data-bind="preset-legend"]')).toHaveText('Record label');
  expect(await page.locator('canvas').count()).toBe(1);
  // The rebuilt scene still plays through to its pose.
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 4000 }).toBe('accepted-pose');
  expect(errors).toEqual([]);
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
