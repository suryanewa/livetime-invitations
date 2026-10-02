import { expect, test, type Page } from '@playwright/test';

/**
 * Master §9: no continuous rendering after settle; zero hidden-tab animation rendering.
 *
 * v1.5: the accepted Party record plays on (spec revision #37), so the loop runs for as long as it
 * is seen. The idle rule is checked on a scene that still settles (Business: its lanyard springs
 * come to rest), and Party is checked for the other half of the rule: it runs while visible and
 * schedules nothing while its stage is out of view (the controller's IntersectionObserver) or the
 * tab is hidden, then resumes where it was.
 */

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

const calls = (page: Page) => page.evaluate(() => (window as any).__rafCalls as number);
/** Animation frames requested over `ms`. */
async function framesOver(page: Page, ms: number): Promise<number> {
  const before = await calls(page);
  await page.waitForTimeout(ms);
  return (await calls(page)) - before;
}
async function ready(page: Page, url: string) {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
}
async function hideTab(page: Page, hidden: boolean) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}
/** Moves the stage out of the viewport (or back): what scrolling an embed out of view does to it. */
async function offScreen(page: Page, away: boolean) {
  await page.evaluate((a) => {
    (document.querySelector('[data-bind="stage"]') as HTMLElement).style.transform = a ? 'translateY(-300vh)' : '';
  }, away);
  await page.waitForTimeout(250); // IntersectionObserver reports on the next rendering opportunity
}

test('the render loop stops after settle and stays stopped (Business: its springs come to rest)', async ({ page }) => {
  await ready(page, '/?scene=business');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.waitForFunction(() => (window as any).__showcase.state.visual === 'accepted-pose');
  await page.waitForTimeout(1500); // secondary springs settle
  expect(await framesOver(page, 2000)).toBe(0);
});

test('a hidden tab schedules no frames even mid-sequence', async ({ page }) => {
  await ready(page, '/');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Decline' }).click();
  await page.waitForTimeout(150);
  await hideTab(page, true);
  await page.waitForTimeout(100);
  expect(await framesOver(page, 1500)).toBeLessThanOrEqual(1);
});

test('Party plays on after acceptance while seen, and schedules nothing out of view or in a hidden tab', async ({ page }) => {
  await ready(page, '/?scene=party');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.waitForFunction(() => (window as any).__showcase.state.visual === 'accepted-pose');
  // Long after the clip the loop still draws every frame: the record plays.
  await page.waitForTimeout(1500);
  expect(await framesOver(page, 1000)).toBeGreaterThan(40);
  // Scrolled out of view: nothing is scheduled, however long it stays away.
  await offScreen(page, true);
  expect(await framesOver(page, 1500)).toBeLessThanOrEqual(1);
  // Back in view: it plays again, and the state never left the accepted pose.
  await offScreen(page, false);
  expect(await framesOver(page, 1000)).toBeGreaterThan(40);
  expect(await page.evaluate(() => (window as any).__showcase.state.visual)).toBe('accepted-pose');
  // A hidden tab stops it too, and showing the tab resumes it.
  await hideTab(page, true);
  await page.waitForTimeout(100);
  expect(await framesOver(page, 1500)).toBeLessThanOrEqual(1);
  await hideTab(page, false);
  expect(await framesOver(page, 1000)).toBeGreaterThan(40);
});

test('an off-screen stage pauses a sequence too, and finishes it once it is back in view', async ({ page }) => {
  await ready(page, '/?scene=party');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Decline' }).click();
  await page.waitForTimeout(200);
  await offScreen(page, true);
  expect(await framesOver(page, 2000)).toBeLessThanOrEqual(1);
  // The visual clock paused with it: the decline has not been skipped while unseen.
  expect(await page.evaluate(() => (window as any).__showcase.state.visual)).toBe('decline-playing');
  await offScreen(page, false);
  await page.waitForFunction(() => (window as any).__showcase.state.visual === 'declined-pose', null, { timeout: 4000 });
  // Declined, nothing plays on: the loop goes idle.
  await page.waitForTimeout(500);
  expect(await framesOver(page, 1500)).toBe(0);
});
