import { expect, test, type Page } from '@playwright/test';

/**
 * Sports behaviour checks (Production Plan M5, Sports sub-spec acceptance criteria).
 * Input only sets intent: nothing the guest does aims, times or strengthens the shot.
 */

type Snap = { resource: string; visual: string; response: { intent: string | null; persistence: string } };
const state = (page: Page) => page.evaluate(() => (window as any).__showcase.state as Snap);
const requests = (page: Page) => page.evaluate(() => (window as any).__showcase.requests.length as number);

async function ready(page: Page, url = '/?scene=sports') {
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

test('Pass ball plays the host sequence and ends at guest-ready', async ({ page }) => {
  await ready(page);
  await expect(page.locator('[data-bind="preset-legend"]')).toHaveText('Ball');
  await page.getByRole('button', { name: 'Pass ball' }).click();
  await expect.poll(async () => (await state(page)).visual).toBe('host-playing');
  await expect.poll(async () => (await state(page)).visual, { timeout: 4000 }).toBe('guest-ready');
});

test('Accept scores and Decline banks off the glass and rattles out; the HTML says Declined, never Failed', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 4000 }).toBe('accepted-pose');
  await expect(page.getByRole('status')).toHaveText('Accepted');
  await page.getByRole('button', { name: 'Decline' }).click();
  // v1.7: the bank, the rattle and the carom: the director's 1.6 s, then the tail plays on (≈ 5 s).
  await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('declined-pose');
  await expect(page.getByRole('status')).toHaveText('Declined');
  await expect(page.getByText(/failed/i)).toHaveCount(0);
  await expect.poll(() => requests(page)).toBe(2);
});

test('Pointer drags and rapid taps on the stage never change the outcome or send requests', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  const stage = page.locator('.lt-stage canvas');
  const box = (await stage.boundingBox())!;
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.7);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.1, { steps: 4 });
    await page.mouse.up();
  }
  await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('accepted-pose');
  expect((await state(page)).response.intent).toBe('accept');
  expect(await requests(page)).toBe(1);
  // Same trajectory as a clean replay: once the ball's bounces (the tail after the 1.7 s beat) and
  // the net have come to rest, the frame matches the canonical made pose.
  const still = () => page.evaluate(() => (window as any).__showcase.controller.captureStill(256, 1) as string);
  let settled = await still();
  await expect.poll(async () => {
    await page.waitForTimeout(400);
    const next = await still();
    const diff = await stillDiff(page, settled, next);
    settled = next;
    return diff;
  }, { timeout: 15_000 }).toBeLessThan(0.01);
  const canonical = await page.evaluate(async () => {
    const c = (window as any).__showcase.controller;
    c.setReducedMotion(true);
    await new Promise((r) => setTimeout(r, 100));
    return c.captureStill(256, 1) as string;
  });
  expect(await stillDiff(page, settled, canonical)).toBeLessThan(0.5);
});

test('The declined still is clearly not the guest-ready still (Static tier and reduced-motion swap)', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  const snap = async () => {
    await page.waitForTimeout(150);
    return page.evaluate(() => (window as any).__showcase.controller.captureStill(256, 1) as string);
  };
  await page.evaluate(() => (window as any).__showcase.controller.setReducedMotion(true));
  const guestReady = await snap();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await state(page)).visual).toBe('accepted-pose');
  const accepted = await snap();
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.poll(async () => (await state(page)).visual).toBe('declined-pose');
  const declined = await snap();
  const toDeclined = await stillDiff(page, guestReady, declined);
  const toAccepted = await stillDiff(page, guestReady, accepted);
  // The ball ends visibly elsewhere: the swap to declined changes about as much as the swap to accepted.
  expect(toDeclined).toBeGreaterThan(0.75 * toAccepted);
  expect(await stillDiff(page, accepted, declined)).toBeGreaterThan(0.75 * toAccepted);
});

test('Cream preset and a saved decline show the static state without a new request', async ({ page }) => {
  await ready(page, '/?scene=sports&saved=decline');
  expect((await state(page)).visual).toBe('declined-pose');
  await page.getByRole('button', { name: 'Host', exact: true }).click();
  await page.getByRole('button', { name: 'Cream ball' }).click();
  await expect(page.getByRole('button', { name: 'Cream ball' })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(300);
  expect(await requests(page)).toBe(0);
});

test('Low tier on the imported masters: toggles, restores exactly, and a dispose at Low frees every texture', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await ready(page);
  const c = 'window.__showcase.controller';
  const settle = () => page.waitForTimeout(400);
  const still = () => page.evaluate(`${c}.captureStill(256, 1)`) as Promise<string>;
  const info = () => page.evaluate(`${c}.renderInfo()`) as Promise<{ textures: number; geometries: number }>;
  const tier = async (t: string) => {
    await page.evaluate(`${c}.setQualityTier('${t}')`);
    await expect.poll(async () => (await state(page) as unknown as { tier: string }).tier).toBe(t);
    await settle();
  };
  const category = async (literal: string) => {
    await page.evaluate((l) => (window as any).__showcase.setConfig(new Function(`return (${l})`)()), literal);
    await expect.poll(async () => (await state(page)).resource, { timeout: 30_000 }).toBe('ready');
    await settle();
  };
  await page.evaluate(`${c}.setReducedMotion(true)`);
  await settle();
  const normal = await still();

  // Low: the imported normal maps (and the key's shadow) go; Normal brings them back exactly.
  await tier('low');
  expect(await stillDiff(page, normal, await still())).toBeGreaterThan(0.2);
  await tier('normal');
  expect(await stillDiff(page, normal, await still())).toBeLessThan(0.3);

  // Baseline: one round trip at Normal (the second visit settles 2 shared textures above the first).
  const away = '{ category: "party", songId: "sample-track-a", label: "coral" }';
  const back = '{ category: "sports", ball: "orange" }';
  await category(away);
  await category(back);
  const baseline = await info();
  // Disposed while Low, twice: the maps the Low tier held aside are freed with the scene (before
  // the fix each such visit left the ball's and hoop's five normal maps allocated).
  for (let i = 0; i < 2; i++) {
    await tier('low');
    await category(away);
    await category(back);
    await tier('normal');
    const now = await info();
    expect(now.textures, `visit ${i + 1} after a dispose at Low`).toBeLessThanOrEqual(baseline.textures);
    expect(now.geometries).toBeLessThanOrEqual(baseline.geometries);
  }
  expect(errors).toEqual([]);
});
