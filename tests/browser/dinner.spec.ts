import { expect, test, type Page } from '@playwright/test';

/**
 * Dinner behaviour checks (Production Plan M6, Dinner sub-spec acceptance criteria). The
 * decline reuses the shared bin approved at checkpoint 3.
 */

type Snap = { resource: string; visual: string; response: { intent: string | null; persistence: string } };
const state = (page: Page) => page.evaluate(() => (window as any).__showcase.state as Snap);
const requests = (page: Page) => page.evaluate(() => (window as any).__showcase.requests.length as number);

/**
 * Mean per-channel difference (0–255) the steam still makes in a 256 px still just after the
 * reveal, when the column is thinning (measured 0.07; the cleared frame measures 0).
 */
const STEAM_VISIBLE = 0.03;

async function ready(page: Page, url = '/?scene=dinner') {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
}

async function stillDiff(page: Page, a: string, b: string): Promise<number> {
  return page.evaluate(async ([ua, ub]) => {
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
    const [pa, pb] = await Promise.all([pixels(ua!), pixels(ub!)]);
    let sum = 0;
    for (let i = 0; i < pa.length; i += 4) sum += Math.abs(pa[i]! - pb[i]!) + Math.abs(pa[i + 1]! - pb[i + 1]!) + Math.abs(pa[i + 2]! - pb[i + 2]!);
    return sum / (256 * 256 * 3);
  }, [a, b] as const);
}

test('Cover dish plays the host sequence and ends at guest-ready; Dinner has no preset control', async ({ page }) => {
  await ready(page);
  // v1.2: the cloche and the clean plate, no food: no Dish control in the host panel.
  await expect(page.locator('[data-bind="preset-legend"]')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Pasta' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Vegetables' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cover dish' }).click();
  await expect.poll(async () => (await state(page)).visual).toBe('host-playing');
  await expect.poll(async () => (await state(page)).visual, { timeout: 4000 }).toBe('guest-ready');
});

test('Accept reveals the dish; Decline bins the covered dish; one request each', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 4000 }).toBe('accepted-pose');
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('declined-pose');
  await expect.poll(() => requests(page)).toBe(2);
  await expect.poll(async () => (await state(page)).response.persistence).toBe('saved');
});

test('Accept releases steam that rises on after the reveal, then fades clear: the loop idles on the canonical still', async ({ page }) => {
  // v1.5: the steam lives in simulate past the reveal (settling() while it rises); count frames.
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    (window as any).__rafCalls = 0;
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      (window as any).__rafCalls++;
      return raf(cb);
    };
  });
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 4000 }).toBe('accepted-pose');
  const still = () => page.evaluate(() => (window as any).__showcase.controller.captureStill(256, 1) as string);
  const steaming = await still();
  // Still drawing: the column is rising off the plate.
  const calls = () => page.evaluate(() => (window as any).__rafCalls as number);
  const a = await calls();
  await page.waitForTimeout(300);
  expect(await calls()).toBeGreaterThan(a + 5);
  // The thin tail still rising 3 s after the accepted pose (≈ 4.5 s of the reveal's clock).
  await page.waitForTimeout(2700);
  const t = await calls();
  await page.waitForTimeout(300);
  expect(await calls()).toBeGreaterThan(t + 5);
  // Gone by STEAM_END (6.6 s of the reveal's clock, ≈ 5.1 s after the accepted pose): idle.
  await page.waitForTimeout(2700);
  const b = await calls();
  await page.waitForTimeout(800);
  expect(await calls()).toBeLessThanOrEqual(b + 1);
  const cleared = await still();
  const canonical = await page.evaluate(async () => {
    const c = (window as any).__showcase.controller;
    c.setReducedMotion(true);
    await new Promise((r) => setTimeout(r, 100));
    return c.captureStill(256, 1) as string;
  });
  expect(await stillDiff(page, steaming, canonical)).toBeGreaterThan(STEAM_VISIBLE);
  expect(await stillDiff(page, cleared, canonical)).toBeLessThan(0.3);
});

test('Replay after decline restores plate, cover and bin, and ends on the canonical pose', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('declined-pose');
  await page.getByRole('button', { name: 'Replay' }).click();
  await expect.poll(async () => (await state(page)).visual).toBe('decline-playing');
  await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('declined-pose');
  const replayed = await page.evaluate(() => (window as any).__showcase.controller.captureStill(256, 1) as string);
  const canonical = await page.evaluate(async () => {
    const c = (window as any).__showcase.controller;
    c.setReducedMotion(true);
    await new Promise((r) => setTimeout(r, 100));
    return c.captureStill(256, 1) as string;
  });
  expect(await stillDiff(page, replayed, canonical)).toBeLessThan(0.5);
  expect(await requests(page)).toBe(1);
});

test('A saved accept shows the static state without a new request; the dish config selects nothing', async ({ page }) => {
  await ready(page, '/?scene=dinner&saved=accept');
  expect((await state(page)).visual).toBe('accepted-pose');
  // `dish` stays in SceneConfig for integration compatibility; changing it changes nothing.
  await page.evaluate(() => (window as any).__showcase.setConfig({ category: 'dinner', dish: 'vegetables' }));
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Host', exact: true }).click();
  await expect(page.locator('[data-bind="presets"] button')).toHaveCount(0);
  expect(await requests(page)).toBe(0);
});

test('Graphics loss shows the shared declined Dinner poster and responses still work', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.locator('.sc-dev summary').click();
  await page.getByRole('button', { name: 'Simulate graphics loss' }).click();
  await expect.poll(async () => (await state(page)).resource).toBe('fallback');
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.poll(async () => (await state(page)).response.persistence).toBe('saved');
  await expect(page.locator('.lt-stage__poster')).toHaveAttribute('src', /shared-declined/);
});
