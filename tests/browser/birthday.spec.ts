import { expect, test, type Page } from '@playwright/test';

/**
 * Birthday behaviour checks (Production Plan M4, Birthday sub-spec acceptance criteria).
 * Runs the real showcase with the simulated adapter; no microphone or breath input exists.
 */

type Snap = { resource: string; visual: string; response: { intent: string | null; persistence: string } };

const state = (page: Page) => page.evaluate(() => (window as any).__showcase.state as Snap);
const requests = (page: Page) => page.evaluate(() => (window as any).__showcase.requests.length as number);

async function ready(page: Page, url = '/?scene=birthday') {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
}

/** Mean absolute RGB difference between two still captures (0–255). */
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

test('Birthday loads with no microphone permission request and places candles', async ({ page, context }) => {
  const permissions: string[] = [];
  await context.exposeFunction('__permission', (name: string) => permissions.push(name));
  await page.addInitScript(() => {
    const md = navigator.mediaDevices;
    if (md?.getUserMedia) md.getUserMedia = (async () => { (window as any).__permission('getUserMedia'); throw new Error('blocked'); }) as typeof md.getUserMedia;
  });
  await ready(page);
  await expect(page.locator('[data-bind="preset-legend"]')).toHaveText('Frosting');
  await page.getByRole('button', { name: 'Place candles' }).click();
  await expect.poll(async () => (await state(page)).visual).toBe('host-playing');
  await expect.poll(async () => (await state(page)).visual, { timeout: 4000 }).toBe('guest-ready');
  expect(permissions).toEqual([]);
});

test('Accept blows the candles out; Decline bins the cake; one request each', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 4000 }).toBe('accepted-pose');
  await expect(page.getByRole('status')).toHaveText('Accepted');
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('declined-pose');
  await expect.poll(() => requests(page)).toBe(2);
  await expect.poll(async () => (await state(page)).response.persistence).toBe('saved');
});

test('Replay after decline restores the cake and ends exactly on the canonical declined pose', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('declined-pose');
  // Replay runs the decline again from guest-ready (cake, candles and flames restored first).
  await page.getByRole('button', { name: 'Replay' }).click();
  await expect.poll(async () => (await state(page)).visual).toBe('decline-playing');
  await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('declined-pose');
  const replayed = await page.evaluate(() => (window as any).__showcase.controller.captureStill(256, 1) as string);
  // Reduced motion snaps to the exact canonical pose; compare at the same quality tier.
  const canonical = await page.evaluate(async () => {
    const c = (window as any).__showcase.controller;
    c.setReducedMotion(true);
    await new Promise((r) => setTimeout(r, 100));
    return c.captureStill(256, 1) as string;
  });
  expect(await stillDiff(page, replayed, canonical)).toBeLessThan(0.5);
  expect(await requests(page)).toBe(1);
});

test('Cocoa preset and a saved decline show the right static state without a new request', async ({ page }) => {
  await ready(page, '/?scene=birthday&saved=decline');
  const s = await state(page);
  expect(s.visual).toBe('declined-pose');
  expect(s.response.persistence).toBe('saved');
  await page.getByRole('button', { name: 'Host', exact: true }).click();
  await page.getByRole('button', { name: 'Cocoa' }).click();
  await expect(page.getByRole('button', { name: 'Cocoa' })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(300);
  expect(await requests(page)).toBe(0);
});

test('Graphics loss shows the shared declined Birthday poster and responses still work', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.locator('.sc-dev summary').click();
  await page.getByRole('button', { name: 'Simulate graphics loss' }).click();
  await expect.poll(async () => (await state(page)).resource).toBe('fallback');
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.poll(async () => (await state(page)).response.persistence).toBe('saved');
  await expect(page.locator('.lt-stage__poster')).toHaveAttribute('src', /shared-declined/);
});
