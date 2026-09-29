import { expect, test, type Page } from '@playwright/test';

/**
 * Business behaviour checks (Production Plan M2, Business sub-spec acceptance criteria).
 * Runs the real showcase with the simulated adapter; no real RSVP service is involved.
 */

type Snap = {
  resource: string;
  visual: string;
  response: { intent: string | null; persistence: string; latestRequestId: string | null };
  reducedMotion: boolean;
};

const state = (page: Page) => page.evaluate(() => (window as any).__showcase.state as Snap);
const requests = (page: Page) => page.evaluate(() => (window as any).__showcase.requests.length as number);
const stored = (page: Page) => page.evaluate(() => (window as any).__showcase.adapter?.stored as string | null);

async function ready(page: Page, url = '/') {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
}

async function guest(page: Page) {
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
}

async function mock(page: Page, mode: 'Normal' | 'Slow' | 'Fail') {
  const drawer = page.locator('.sc-dev');
  if (!(await drawer.evaluate((d: HTMLDetailsElement) => d.open))) await drawer.locator('summary').click();
  await page.locator('[data-bind="mock"] button', { hasText: mode }).click();
}

test('choosing Accept emits exactly one request; repeated taps and Replay emit none', async ({ page }) => {
  await ready(page);
  await guest(page);
  const accept = page.getByRole('button', { name: 'Accept' });
  await accept.click();
  await accept.click();
  await accept.click();
  await expect.poll(() => requests(page)).toBe(1);
  await expect.poll(async () => (await state(page)).response.persistence).toBe('saved');
  await expect(page.getByRole('status')).toHaveText('Accepted');
  await page.getByRole('button', { name: 'Replay' }).click();
  await page.waitForTimeout(1800);
  expect(await requests(page)).toBe(1);
  expect((await state(page)).visual).toBe('accepted-pose');
});

test('Decline during saving creates a newer request; the stale Accept result cannot overwrite it', async ({ page }) => {
  await ready(page);
  await mock(page, 'Slow');
  await guest(page);
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Decline' }).click();
  expect(await requests(page)).toBe(2);
  await expect(page.getByRole('status')).toHaveText('Saving response…');
  // Serialised writes: accept lands at ~3 s (stale, ignored), decline at ~6 s.
  await page.waitForTimeout(3400);
  let s = await state(page);
  expect(s.response.intent).toBe('decline');
  expect(s.response.persistence).toBe('saving');
  await expect.poll(async () => (await state(page)).response.persistence, { timeout: 8000 }).toBe('saved');
  s = await state(page);
  expect(s.response.intent).toBe('decline');
  expect(await stored(page)).toBe('decline');
  await expect(page.getByRole('status')).toHaveText('Declined');
});

test('A failed save keeps the chosen intent and Retry sends a new request', async ({ page }) => {
  await ready(page);
  await mock(page, 'Fail');
  await guest(page);
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.poll(async () => (await state(page)).response.persistence, { timeout: 5000 }).toBe('error');
  const s = await state(page);
  expect(s.response.intent).toBe('decline');
  expect(s.visual).toMatch(/decline/);
  await expect(page.getByRole('status')).toHaveText('Couldn’t save your response.');
  await expect(page.getByRole('button', { name: 'Decline' })).toHaveAttribute('aria-pressed', 'true');
  await mock(page, 'Normal');
  await page.getByRole('button', { name: 'Try again' }).click();
  expect(await requests(page)).toBe(2);
  await expect.poll(async () => (await state(page)).response.persistence).toBe('saved');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeHidden();
});

test('Optional card drag never creates a response request and the scan still completes', async ({ page }) => {
  await ready(page);
  await guest(page);
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.waitForTimeout(220);
  const grab = page.locator('.lt-stage__grab');
  await expect(grab).toBeVisible();
  const box = (await grab.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2 - 30, { steps: 8 });
  const held = (await state(page)).visual;
  expect(held).toBe('accept-playing');
  await page.waitForTimeout(600);
  expect((await state(page)).visual).toBe('accept-playing');
  await page.mouse.up();
  await expect.poll(async () => (await state(page)).visual, { timeout: 4000 }).toBe('accepted-pose');
  expect(await requests(page)).toBe(1);
});

test('Turning motion off mid-sequence snaps to the final pose', async ({ page }) => {
  await ready(page);
  await guest(page);
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.waitForTimeout(250);
  expect((await state(page)).visual).toBe('accept-playing');
  await page.getByRole('button', { name: /Motion/ }).click();
  const s = await state(page);
  expect(s.reducedMotion).toBe(true);
  expect(s.visual).toBe('accepted-pose');
  await expect(page.getByRole('button', { name: 'Replay' })).toBeHidden();
});

test('Graphics loss falls back to a poster and responses still work', async ({ page }) => {
  await ready(page);
  await guest(page);
  await page.locator('.sc-dev summary').click();
  await page.getByRole('button', { name: 'Simulate graphics loss' }).click();
  await expect.poll(async () => (await state(page)).resource).toBe('fallback');
  await expect(page.locator('.lt-stage__poster')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await state(page)).response.persistence).toBe('saved');
  expect(await requests(page)).toBe(1);
  await expect(page.locator('.lt-stage__poster')).toHaveAttribute('src', /light-accepted/);
});

test('An initially saved response shows its final pose without a new submission', async ({ page }) => {
  await ready(page, '/?saved=decline');
  const s = await state(page);
  expect(s.response.persistence).toBe('saved');
  expect(s.visual).toBe('declined-pose');
  await page.waitForTimeout(500);
  expect(await requests(page)).toBe(0);
  await expect(page.getByRole('button', { name: 'Decline' })).toHaveAttribute('aria-pressed', 'true');
});

test('Keyboard-only: Tab reaches the choices and Enter answers', async ({ page }) => {
  await ready(page);
  await guest(page);
  await page.getByRole('button', { name: 'Accept' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Decline' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => requests(page)).toBe(1);
  expect((await state(page)).response.intent).toBe('decline');
});

test('Background tab pauses the visual clock and resumes without skipping', async ({ page }) => {
  await ready(page);
  await guest(page);
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(2500);
  expect((await state(page)).visual).toBe('accept-playing');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await state(page)).visual, { timeout: 4000 }).toBe('accepted-pose');
});

test('30 controller re-creations leave one canvas and no runaway WebGL contexts', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (/Too many active WebGL contexts|CONTEXT_LOST/i.test(m.text())) warnings.push(m.text());
  });
  await ready(page);
  await page.locator('.sc-dev summary').click();
  for (let i = 0; i < 30; i++) {
    await page.getByRole('button', { name: 'Reset demo' }).click();
    await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
  }
  expect(await page.locator('canvas').count()).toBe(1);
  expect(warnings).toEqual([]);
});

test('Graphics loss mid-attach finishes the host state instead of leaving Attach card disabled', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Attach card' }).click();
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const canvas = document.querySelector('.lt-stage canvas') as HTMLCanvasElement;
    canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect.poll(async () => (await state(page)).resource).toBe('fallback');
  expect((await state(page)).visual).toBe('guest-ready');
  await expect(page.locator('[data-action="prepare"]')).toBeEnabled();
  await expect(page.locator('.lt-stage__grab')).toBeHidden();
});

test('A load slower than 6 s clears its "taking a while" notice once 3D is ready', async ({ page }) => {
  // Generous margins: the 6 s timer starts when the scene load starts, which can lag page
  // start-up on a busy machine. Hold the GLB until the notice is confirmed visible.
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/*.glb', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/');
  await expect(page.getByText('The 3D scene is taking a while')).toBeVisible({ timeout: 20_000 });
  release();
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
  await expect(page.locator('[data-bind="graphics"]')).toBeHidden();
});
