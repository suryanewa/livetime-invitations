import { expect, test, type Page } from '@playwright/test';

/**
 * Collection checks (Production Plan M7): scene switching across all five categories, retained
 * GPU resources and running loops, and every category's outcomes through the shared controller.
 */

type Snap = { resource: string; visual: string };
const state = (page: Page) => page.evaluate(() => (window as any).__showcase.state as Snap);
const CATEGORIES = [
  '{ category: "party", songId: "sample-track-a", label: "coral" }',
  '{ category: "birthday", cake: "vanilla" }',
  '{ category: "sports", ball: "orange" }',
  '{ category: "dinner", dish: "pasta" }',
  '{ category: "business", template: "light" }',
];

async function ready(page: Page) {
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
}

test('30 scene switches keep one canvas, free each scene\'s GPU resources and leave no loop running', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await ready(page);
  type Info = { geometries: number; textures: number };
  const firstVisit: Info[] = [], lastVisit: Info[] = [];
  for (let i = 0; i < 30; i++) {
    const literal = CATEGORIES[i % CATEGORIES.length]!;
    await page.evaluate((l) => (window as any).__showcase.setConfig(new Function(`return (${l})`)()), literal);
    await expect.poll(async () => (await state(page)).resource, { timeout: 30_000 }).toBe('ready');
    const info = (await page.evaluate(() => (window as any).__showcase.controller.renderInfo())) as Info;
    if (i < 5) firstVisit.push(info);
    if (i >= 25) lastVisit.push(info);
  }
  expect(await page.locator('.lt-stage canvas').count()).toBe(1);
  // The sixth visit to each category holds no more GPU objects than the first: nothing
  // accumulates across switches (the library frees each scene's materials and textures).
  for (let k = 0; k < 5; k++) {
    expect(lastVisit[k]!.textures).toBeLessThanOrEqual(firstVisit[k]!.textures + 1);
    expect(lastVisit[k]!.geometries).toBeLessThanOrEqual(firstVisit[k]!.geometries + 2);
  }
  // Idle: no animation frames once the scene has settled.
  await page.waitForTimeout(800);
  const frames = await page.evaluate(async () => {
    let n = 0;
    const orig = window.requestAnimationFrame;
    (window as any).requestAnimationFrame = (cb: FrameRequestCallback) => { n++; return orig(cb); };
    await new Promise((r) => setTimeout(r, 800));
    (window as any).requestAnimationFrame = orig;
    return n;
  });
  expect(frames).toBeLessThanOrEqual(2);
});

test('choosing another category opens a fresh invitation: the previous answer never carries over', async ({ page }) => {
  // Master §7: a controller and adapter serve one invitation identity; each category is a new event.
  await page.goto('/?scene=sports');
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.lt-status')).toHaveText('Accepted');
  const before = await page.evaluateHandle(() => (window as any).__showcase.adapter);
  await page.locator('.sc-rail__item', { hasText: 'Dinner' }).click();
  await expect(page.locator('.sc-event__title')).toHaveText('Supper club: autumn menu');
  await expect(page.getByRole('button', { name: 'Accept' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Decline' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.lt-status')).toHaveText('');
  await expect.poll(async () => (await state(page)).visual).toBe('guest-ready');
  expect(await page.evaluate((old) => {
    const s = (window as any).__showcase;
    return { fresh: s.adapter !== old, stored: s.adapter.stored, intent: s.state.response.intent };
  }, before)).toEqual({ fresh: true, stored: null, intent: null });
  await ready(page);
  expect(await page.locator('.lt-stage canvas').count()).toBe(1);
});

test('every category plays host, accept and decline to its canonical pose', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await ready(page);
  for (const literal of CATEGORIES) {
    await page.evaluate((l) => (window as any).__showcase.setConfig(new Function(`return (${l})`)()), literal);
    await expect.poll(async () => (await state(page)).resource, { timeout: 30_000 }).toBe('ready');
    await page.evaluate(() => { const c = (window as any).__showcase.controller; c.setMode('host'); c.resetVisual(); c.prepareHost(); });
    await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('guest-ready');
    await page.evaluate(() => { const c = (window as any).__showcase.controller; c.setMode('guest'); c.chooseResponse('accept'); });
    await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('accepted-pose');
    await page.evaluate(() => (window as any).__showcase.controller.chooseResponse('decline'));
    await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('declined-pose');
  }
});
