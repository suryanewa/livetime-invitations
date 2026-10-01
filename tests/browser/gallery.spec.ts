import { expect, test, type Page } from '@playwright/test';

/**
 * Collection review page (Production Plan M7, /gallery.html): scenes side by side as columns,
 * a live stage that is populated on load, readable captions, every outcome cell playing (also
 * a repeat of the last answer), no stale action reaching a later pick, and a phone layout that
 * keeps the live stage in view.
 */

type Snap = { resource: string; visual: string; mode: string; config: { category: string }; response: { intent: string | null } };
const state = (page: Page) => page.evaluate(() => (window as any).__gallery.state as Snap);
const cell = (page: Page, category: string, pose: string) => page.locator(`.g-cell[data-category="${category}"][data-pose="${pose}"]`);

async function open(page: Page) {
  await page.goto('/gallery.html');
  await page.waitForFunction(() => (window as any).__gallery?.state?.resource === 'ready', null, { timeout: 30_000 });
}

/** Record every visual state the live stage passes through from now on. */
async function record(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    clearInterval(w.__rec);
    w.__seen = [];
    w.__rec = setInterval(() => {
      const v = w.__gallery.state?.visual;
      if (w.__seen[w.__seen.length - 1] !== v) w.__seen.push(v);
    }, 8);
  });
}
const seen = (page: Page) => page.evaluate(() => (window as any).__seen as string[]);

/** Wait until the stage shows `category` loaded and at rest on `visual`, after passing `through`. */
async function settle(page: Page, visual: string, category: string, through?: string) {
  await expect.poll(async () => {
    const s = await state(page);
    const passed = !through || (await seen(page)).includes(through);
    return `${s.config.category} ${s.resource} ${s.visual}${passed ? '' : ' (not yet played)'}`;
  }, { timeout: 30_000 }).toBe(`${category} ready ${visual}`);
}

test('opens with the live stage showing a default, scenes as columns and readable captions', async ({ page }) => {
  await open(page);
  const stage = await page.locator('#g-stage').boundingBox();
  expect(stage!.height).toBeGreaterThan(200);
  expect(await state(page)).toMatchObject({ visual: 'guest-ready', mode: 'guest', config: { category: 'party' } });
  await expect(page.locator('#g-caption')).toHaveText('Party · Coral label · Guest ready');
  await expect(cell(page, 'party', 'guest-ready')).toHaveAttribute('aria-pressed', 'true');
  expect((await page.title()).toLowerCase()).toContain((await page.locator('h1').innerText()).toLowerCase());
  // Pose-major: four pose rows, each with the five scenes in collection order.
  const rows = await page.locator('.g-row').evaluateAll((els) => els.map((r) => [...r.querySelectorAll<HTMLElement>('.g-cell')].map((c) => c.dataset.category).join(',')));
  expect(rows).toEqual(Array(4).fill('party,birthday,sports,dinner,business'));
  await expect(page.locator('.g-head span')).toHaveText(['Coral label', 'Vanilla', 'Orange ball', 'Cloche and plate', 'Light card']);
  // The preset switch swaps every column to its second preset (Dinner v1.2 has one look, no food).
  await page.getByRole('button', { name: 'Preset B' }).click();
  await expect(page.locator('.g-head span')).toHaveText(['Cobalt label', 'Cocoa', 'Cream ball', 'Cloche and plate', 'Dark card']);
  await cell(page, 'business', 'guest-ready').click();
  await expect(page.locator('#g-caption')).toHaveText('Business · Dark card · Guest ready');
});

test('every outcome cell plays, also when the previous click had the same answer', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  const picks: [string, string, string, string][] = [
    ['party', 'accepted', 'accept-playing', 'accepted-pose'],
    ['birthday', 'accepted', 'accept-playing', 'accepted-pose'],
    ['birthday', 'accepted', 'accept-playing', 'accepted-pose'],
    ['sports', 'declined', 'decline-playing', 'declined-pose'],
    ['business', 'declined', 'decline-playing', 'declined-pose'],
  ];
  for (const [category, pose, playing, end] of picks) {
    await record(page);
    await cell(page, category, pose).click();
    await settle(page, end, category, playing);
  }
  // A guest-ready cell after an outcome shows guest-ready, not the last answer.
  await cell(page, 'business', 'guest-ready').click();
  await settle(page, 'guest-ready', 'business');
  expect((await state(page)).response.intent).toBeNull();
});

test('an action queued for an earlier pick never reaches the next one', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  // Birthday has to load, so its accept waits; Business host-ready is picked before it runs.
  await cell(page, 'birthday', 'accepted').click();
  await page.waitForTimeout(50);
  await record(page);
  await cell(page, 'business', 'host-ready').click();
  await settle(page, 'guest-ready', 'business');
  const trail = await seen(page);
  expect(trail).toContain('host-playing');
  expect(trail).not.toContain('accept-playing');
  expect((await state(page)).mode).toBe('host');
});

test('on a phone the live stage stays in view when a low cell is tapped', async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Preset B' }).tap();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await cell(page, 'business', 'declined').tap();
  await settle(page, 'declined-pose', 'business');
  const box = await page.locator('#g-stage').boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  await context.close();
});
