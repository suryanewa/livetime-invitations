import { expect, test } from '@playwright/test';

/** Master §9: no continuous rendering after settle; zero hidden-tab animation rendering. */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    (window as any).__rafCalls = 0;
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      (window as any).__rafCalls++;
      return raf(cb);
    };
  });
});

const calls = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).__rafCalls as number);

test('the render loop stops after settle and stays stopped', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.waitForFunction(() => (window as any).__showcase.state.visual === 'accepted-pose');
  await page.waitForTimeout(1500); // secondary springs settle
  const before = await calls(page);
  await page.waitForTimeout(2000);
  expect(await calls(page)).toBe(before);
});

test('a hidden tab schedules no frames even mid-sequence', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Decline' }).click();
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(100);
  const before = await calls(page);
  await page.waitForTimeout(1500);
  expect(await calls(page)).toBeLessThanOrEqual(before + 1);
});
