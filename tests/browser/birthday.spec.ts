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

test('Frosting variants and the Low tier on the cake master: visible, exact round trips, no leaks', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await ready(page);
  const c = 'window.__showcase.controller';
  const settle = () => page.waitForTimeout(400);
  const still = () => page.evaluate(`${c}.captureStill(256, 1)`) as Promise<string>;
  const info = () => page.evaluate(`${c}.renderInfo()`) as Promise<{ textures: number; geometries: number }>;
  const config = async (literal: string, reload = false) => {
    await page.evaluate((l) => (window as any).__showcase.setConfig(new Function(`return (${l})`)()), literal);
    if (reload) await expect.poll(async () => (await state(page)).resource, { timeout: 30_000 }).toBe('ready');
    await settle();
  };
  const tier = async (t: string) => {
    await page.evaluate(`${c}.setQualityTier('${t}')`);
    await expect.poll(async () => (await state(page) as unknown as { tier: string }).tier).toBe(t);
    await settle();
  };
  await page.evaluate(`${c}.setReducedMotion(true)`);
  await settle();
  const vanilla = await still();

  // Cocoa is a KHR_materials_variants switch on the frosting: a large change; vanilla comes back exactly.
  await config('{ category: "birthday", cake: "cocoa" }');
  expect(await stillDiff(page, vanilla, await still())).toBeGreaterThan(2);
  await config('{ category: "birthday", cake: "vanilla" }');
  expect(await stillDiff(page, vanilla, await still())).toBeLessThan(0.3);

  // Low tier (shadow map off for the master's proxies) and back.
  await tier('low');
  expect(await stillDiff(page, vanilla, await still())).toBeGreaterThan(0.2);
  await tier('normal');
  expect(await stillDiff(page, vanilla, await still())).toBeLessThan(0.3);

  // Leaving and re-entering the scene (once at Low) frees the master, the wisps and the flames.
  const away = '{ category: "party", songId: "sample-track-a", label: "coral" }';
  const back = '{ category: "birthday", cake: "vanilla" }';
  await config(away, true);
  await config(back, true);
  const baseline = await info();
  for (let i = 0; i < 2; i++) {
    if (i === 1) await tier('low');
    await config(away, true);
    await config(back, true);
    await tier('normal');
    const now = await info();
    expect(now.textures, `visit ${i + 1}`).toBeLessThanOrEqual(baseline.textures);
    expect(now.geometries).toBeLessThanOrEqual(baseline.geometries);
  }
  expect(errors).toEqual([]);
});
