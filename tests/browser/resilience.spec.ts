import { expect, test, type Page } from '@playwright/test';

/**
 * Resilience checks (Master §9–11, coverage gaps from the checkpoint 3 audit): automatic
 * quality step-down to Static, asset failure, context restore, touch cancellation, rotation
 * mid-playback, increased text size and missing song metadata. Responses never depend on 3D.
 */

type Snap = { resource: string; resourceReason: string; visual: string; tier: string; response: { intent: string | null; persistence: string } };
const state = (page: Page) => page.evaluate(() => (window as any).__showcase.state as Snap);
const requests = (page: Page) => page.evaluate(() => (window as any).__showcase.requests.length as number);

async function ready(page: Page, url = '/') {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
}

test('a device too slow even on Low completes the current intent in Static, with one request', async ({ page }) => {
  test.setTimeout(90_000);
  await ready(page, '/?scene=party');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  // Simulate a struggling GPU: every animation frame costs ≈45 ms of main-thread work.
  await page.evaluate(() => {
    const raf = window.requestAnimationFrame.bind(window);
    (window as any).requestAnimationFrame = (cb: FrameRequestCallback) => raf((t) => { const end = performance.now() + 45; while (performance.now() < end); cb(t); });
  });
  await page.getByRole('button', { name: 'Accept' }).click();
  // Keep replaying (visual only) until the monitor steps Normal → Low → Static.
  for (let i = 0; i < 12; i++) {
    const s = await state(page);
    if (s.tier === 'static') break;
    if (s.visual === 'accepted-pose') await page.getByRole('button', { name: 'Replay' }).click();
    await page.waitForTimeout(1500);
  }
  const s = await state(page);
  expect(s.tier).toBe('static');
  expect(s.resource).toBe('fallback');
  expect(s.resourceReason).toBe('performance-static');
  expect(s.visual).toBe('accepted-pose');
  await expect(page.locator('.lt-stage__poster')).toHaveAttribute('src', /coral-accepted/);
  expect(await requests(page)).toBe(1);
});

test('a failed model download shows the poster and the answer still saves', async ({ page }) => {
  await page.route('**/*.glb', (route) => route.abort());
  await page.goto('/?scene=birthday');
  await expect.poll(async () => (await state(page)).resource, { timeout: 20_000 }).toBe('fallback');
  expect((await state(page)).resourceReason).toBe('asset-failure');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await state(page)).response.persistence).toBe('saved');
  await expect(page.locator('.lt-stage__poster')).toHaveAttribute('src', /vanilla-accepted/);
});

test('after a lost graphics context is restored, 3D comes back once and responses keep working', async ({ page }) => {
  await ready(page);
  const restored = await page.evaluate(async () => {
    const canvas = document.querySelector('.lt-stage canvas') as HTMLCanvasElement;
    const ext = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    ext.loseContext();
    await new Promise((r) => setTimeout(r, 300));
    ext.restoreContext();
    return true;
  });
  expect(restored).toBe(true);
  // Wait until the loss has been handled and the scene reloaded on the restored context.
  await expect.poll(async () => page.evaluate(() => ((window as any).__showcase.events as string[]).some((e) => /context-lost/.test(e))), { timeout: 10_000 }).toBe(true);
  await expect.poll(async () => (await state(page)).resource, { timeout: 20_000 }).toBe('ready');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('declined-pose');
  expect(await requests(page)).toBe(1);
});

test('a cancelled touch drag on the card never sends a request and the scan still completes', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.waitForTimeout(250);
  const grab = page.locator('.lt-stage__grab');
  await expect(grab).toBeVisible();
  const box = (await grab.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await grab.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true, bubbles: true });
  await grab.dispatchEvent('pointermove', { pointerId: 7, pointerType: 'touch', clientX: x + 30, clientY: y - 20, isPrimary: true, bubbles: true });
  await grab.dispatchEvent('pointercancel', { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true });
  await expect.poll(async () => (await state(page)).visual, { timeout: 6000 }).toBe('accepted-pose');
  expect(await requests(page)).toBe(1);
  expect((await state(page)).response.intent).toBe('accept');
});

test('rotating the phone mid-playback keeps the sequence, layout and answer intact', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page, '/?scene=sports');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.waitForTimeout(400);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('accepted-pose');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  expect(await requests(page)).toBe(1);
});

test('increased text size (150 %) keeps every control usable with no horizontal overflow', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await ready(page, '/?scene=party');
    await page.addStyleTag({ content: 'html { font-size: 150% !important; }' });
    const report = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      small: [...document.querySelectorAll('button')]
        .filter((b) => (b as HTMLElement).offsetParent !== null)
        .map((b) => b.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.width < 44 || r.height < 44)).length,
    }));
    expect(report.overflow).toBe(false);
    expect(report.small).toBe(0);
  }
});

test('unknown song metadata reads "Selected track" and the outcome still plays', async ({ page }) => {
  await ready(page, '/?scene=party');
  await page.evaluate(() => (window as any).__showcase.setConfig({ category: 'party', songId: 'not-in-the-catalogue', label: 'cobalt' }));
  await expect(page.locator('[data-bind="track-title"]')).toHaveText('Selected track');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('accepted-pose');
  await expect(page.locator('[data-bind="track-title"]')).toHaveText('Selected track');
});
