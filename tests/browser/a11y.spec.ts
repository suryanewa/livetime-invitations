import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Keyboard focus checks (Master §10: visible focus, screen readers). Every flow that hides,
 * disables or rebuilds the control the viewer just used must keep focus on a sensible,
 * visible element with a focus ring, never drop it to the page.
 */

type Snap = { resource: string; visual: string; response: { persistence: string } };

const state = (page: Page) => page.evaluate(() => (window as any).__showcase.state as Snap);

async function ready(page: Page, url = '/') {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
}

/** Tab forward (only Tab) until the target has focus. */
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error('Tab never reached the target');
}

/** The focused element is real, visible and shows its keyboard focus ring. */
async function expectVisibleFocus(page: Page, target: Locator) {
  await expect(target).toBeFocused();
  const focus = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    const r = el?.getBoundingClientRect();
    return {
      body: !el || el === document.body,
      visible: !!el && el.checkVisibility() && !!r && r.width > 0 && r.height > 0,
      ring: !!el?.matches(':focus-visible'),
    };
  });
  expect(focus).toEqual({ body: false, visible: true, ring: true });
}

test('Preview as guest moves focus to Accept once the host panel hides', async ({ page }) => {
  await ready(page);
  await tabTo(page, page.getByRole('button', { name: 'Preview as guest' }));
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-panel="host"]')).toBeHidden();
  await expectVisibleFocus(page, page.getByRole('button', { name: 'Accept' }));
});

test('Attach card keeps focus while the host sequence plays, and ignores repeat presses', async ({ page }) => {
  await ready(page);
  const prepare = page.locator('[data-action="prepare"]');
  // Count what reaches the controller: a repeat Enter during playback must be ignored.
  await page.evaluate(() => {
    const c = (window as any).__showcase.controller;
    const original = c.prepareHost.bind(c);
    (window as any).__prepareCalls = 0;
    c.prepareHost = () => { (window as any).__prepareCalls++; original(); };
  });
  await tabTo(page, prepare);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).visual).toBe('host-playing');
  await expect(prepare).toHaveAttribute('aria-disabled', 'true');
  await expectVisibleFocus(page, prepare);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).visual, { timeout: 4000 }).toBe('guest-ready');
  expect(await page.evaluate(() => (window as any).__prepareCalls)).toBe(1);
  await expect(prepare).toHaveAttribute('aria-disabled', 'false');
  await expect(prepare).toHaveText('Attach card again');
  await expectVisibleFocus(page, prepare);
});

test('Try again hands focus to the chosen answer as it hides', async ({ page }) => {
  await ready(page);
  await page.locator('.sc-dev summary').click();
  await page.locator('[data-bind="mock"] button', { hasText: 'Fail' }).click();
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  const decline = page.getByRole('button', { name: 'Decline' });
  await tabTo(page, decline);
  await page.keyboard.press('Enter');
  const retry = page.getByRole('button', { name: 'Try again' });
  await expect(retry).toBeVisible({ timeout: 5000 });
  await tabTo(page, retry);
  await page.keyboard.press('Enter');
  await expect(retry).toBeHidden();
  await expect(page.getByRole('status')).toHaveText('Saving response…');
  await expectVisibleFocus(page, decline);
});

test('Choosing a scene in the collection returns focus to the rebuilt rail item', async ({ page }) => {
  await ready(page);
  await tabTo(page, page.locator('.sc-rail__item', { hasText: 'Party' }));
  await page.keyboard.press('Enter');
  const party = page.locator('.sc-rail__item', { hasText: 'Party' });
  await expect(party).toHaveAttribute('aria-pressed', 'true');
  await expectVisibleFocus(page, party);
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
});

test('On a phone, choosing a scene brings its stage into view and announces the event; focus stays on the rail', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await ready(page);
  const party = page.locator('.sc-rail__item', { hasText: 'Party' });
  await party.scrollIntoViewIfNeeded();
  await party.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-bind="announce"]')).toHaveText('Showing Party: Rooftop listening party');
  await expect(party).toBeFocused();
  await expect(party).toHaveAttribute('aria-pressed', 'true');
  // At least half the stage is on screen once the (smooth) scroll settles.
  await expect.poll(() => page.evaluate(() => {
    const r = document.querySelector('.sc-stage')!.getBoundingClientRect();
    return (Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / r.height;
  })).toBeGreaterThanOrEqual(0.5);
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
});

test('Rail items are named by scene and object; the event meta reads as separate items', async ({ page }) => {
  await ready(page);
  await expect(page.locator('.sc-rail')).toMatchAriaSnapshot(`
    - list:
      - listitem:
        - button "Party, record player"
      - listitem:
        - button "Birthday, cake"
      - listitem:
        - button "Sports, basketball"
      - listitem:
        - button "Dinner, covered dish"
      - listitem:
        - button "Business, keycard" [pressed]
  `);
  // No run-together words such as "PMHudson": each meta item is separated for assistive tech.
  const snapshot = await page.locator('.sc-event__meta').ariaSnapshot();
  expect(snapshot).toMatch(/6:30 PM\s*,\s*Hudson Yards, New York\s*,\s*Sample event/);
});

test('The graphics notice names what the stage shows and who it is for', async ({ page }) => {
  const notice = page.locator('[data-bind="graphics-text"]');
  await ready(page, '/?scene=birthday');
  await page.evaluate(() => (window as any).__showcase.controller.setQualityTier('static'));
  await expect(notice).toHaveText('Showing a still image. Presets and preview still work.');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await expect(notice).toHaveText('Showing a still image. Your response still works.');
  // A poster that cannot load leaves a sentence on the stage, so the notice must not claim an image.
  await page.route('**/posters/**', (r) => (r.request().resourceType() === 'image' ? r.abort() : r.continue()));
  await ready(page, '/?scene=party');
  await page.evaluate(() => (window as any).__showcase.controller.setQualityTier('static'));
  await expect(page.locator('.lt-stage__fallback')).toBeVisible();
  await expect(notice).toHaveText('The 3D scene isn’t available right now. Presets and preview still work.');
  await page.locator('.sc-dev summary').click();
  // The two graphics buttons are distinguishable in a screen reader's button list.
  await expect(page.getByRole('button', { name: 'Try 3D again' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Restore 3D (dev)' })).toBeVisible();
});

test('Motion Off from the keyboard also stops the shell CSS motion', async ({ page }) => {
  await ready(page);
  const motion = page.getByRole('button', { name: /Motion/ });
  await tabTo(page, motion);
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await expectVisibleFocus(page, motion);
  await page.locator('.sc-dev summary').click();
  await page.locator('[data-bind="mock"] button', { hasText: 'Slow' }).click();
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  const spinner = page.locator('.lt-spinner');
  await expect(spinner).toBeVisible();
  expect(await spinner.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
});
