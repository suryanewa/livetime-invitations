import { expect, test, type Page } from '@playwright/test';

/**
 * Fullscreen showcase (v1.4): the scene fills the viewport at any aspect; the header and the dock
 * (side column on landscape screens, bottom sheet on portrait ones) float over it and never cover
 * the object's frame square; the poster sits exactly on that square; the square layout stays the
 * embed default.
 */

type Rect = { x: number; y: number; width: number; height: number };
type Frame = { x: number; y: number; size: number; width: number; height: number };

async function ready(page: Page, url = '/') {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
}
const frame = (page: Page) => page.evaluate(() => (window as any).__showcase.controller.getFrame() as Frame);
const rect = (page: Page, sel: string) => page.locator(sel).evaluate((el) => el.getBoundingClientRect().toJSON() as Rect);
/** Until the frame square stops moving (an inset ease lasts 250 ms). */
async function settled(page: Page) {
  let prev = '';
  await expect.poll(async () => {
    const now = JSON.stringify(await frame(page));
    const still = now === prev;
    prev = now;
    return still;
  }, { intervals: [120, 120, 120, 120, 200, 300] }).toBe(true);
}
const overlaps = (a: Rect, f: Frame) => a.x < f.x + f.size && a.x + a.width > f.x && a.y < f.y + f.size && a.y + a.height > f.y;

/** Layout invariants for one viewport: full-bleed canvas, overlays clear of the frame square. */
async function expectLayout(page: Page) {
  const vw = await page.evaluate(() => [innerWidth, innerHeight]);
  const canvas = await rect(page, '.lt-stage canvas');
  expect([canvas.x, canvas.y, canvas.width, canvas.height]).toEqual([0, 0, vw[0], vw[1]]);
  // The frame square eases to new insets (v1.5, INSET_EASE_MS): judge it once it has settled.
  await settled(page);
  const f = await frame(page);
  expect(f.size).toBeGreaterThan(Math.min(vw[0]!, vw[1]!) * 0.25);
  expect(overlaps(await rect(page, '.sc-top'), f), 'header clear of the frame').toBe(false);
  expect(overlaps(await rect(page, '.sc-dock'), f), 'dock clear of the frame').toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1)).toBe(false);
}

for (const [name, width, height] of [['desktop', 1440, 900], ['laptop', 1280, 720], ['tablet', 768, 1024], ['phone', 390, 844], ['landscape phone', 844, 390], ['200 % zoom', 720, 450]] as const) {
  test(`${name} ${width}×${height}: full-viewport scene, overlays clear of the object, the answer reachable`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await ready(page, '/?scene=sports');
    await expectLayout(page);
    await page.getByRole('button', { name: 'Guest', exact: true }).click();
    await expectLayout(page);
    // Accept and Decline are on screen without scrolling the page or the dock.
    for (const choice of ['Accept', 'Decline']) {
      const r = await page.getByRole('button', { name: choice }).boundingBox();
      expect(r!.y + r!.height, choice).toBeLessThanOrEqual(height);
      expect(r!.height).toBeGreaterThanOrEqual(44);
    }
    // Every visible control keeps a 44 px target.
    const small = await page.evaluate(() => [...document.querySelectorAll('button, summary')]
      .filter((el) => el.checkVisibility())
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.width < 44 || r.height < 44)).length);
    expect(small).toBe(0);
  });
}

test('the dock is a side column on landscape screens and a bottom sheet on portrait ones', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await ready(page);
  const side = await rect(page, '.sc-dock');
  expect(side.x + side.width).toBeLessThanOrEqual(1280 - 16);
  expect(side.width).toBeLessThan(420);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await rect(page, '.sc-dock')).width).toBe(390);
  const sheet = await rect(page, '.sc-dock');
  expect(sheet.y + sheet.height).toBeCloseTo(844, 0);
});

test('collapsing the sheet hides its body, frees the scene and a mode choice opens it again', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const toggle = page.getByRole('button', { name: 'Controls' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const before = (await frame(page)).size;
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#sc-dock-body')).toBeHidden();
  await expect.poll(async () => (await frame(page)).size).toBeGreaterThan(before);
  await expect(toggle).toBeFocused();
  await expectLayout(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();
});

test('the poster sits on the frame square, with the backdrop still around it', async ({ page }) => {
  for (const [width, height] of [[1440, 900], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await ready(page, '/?scene=party');
    await page.evaluate(() => (window as any).__showcase.controller.setQualityTier('static'));
    const poster = page.locator('.lt-stage__poster');
    await expect(poster).toHaveAttribute('src', /coral-host-ready/);
    await expect(poster).toBeVisible();
    const f = await frame(page);
    const p = await rect(page, '.lt-stage__poster');
    expect(p.x).toBeCloseTo(f.x, 0);
    expect(p.y).toBeCloseTo(f.y, 0);
    expect(p.width).toBeCloseTo(f.size, 0);
    expect(p.height).toBeCloseTo(f.size, 0);
    // The backdrop is BACKDROP_FIELD frame squares, centred on the frame, and covers the viewport.
    const b = await rect(page, '.lt-stage__backdrop');
    expect(b.width).toBeCloseTo(7 * f.size, 0);
    expect(b.x + b.width / 2).toBeCloseTo(f.x + f.size / 2, 0);
    expect(b.x).toBeLessThanOrEqual(0);
    expect(b.y).toBeLessThanOrEqual(0);
    expect(b.x + b.width).toBeGreaterThanOrEqual(width);
    expect(b.y + b.height).toBeGreaterThanOrEqual(height);
    expect(await page.locator('.lt-stage__backdrop').evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(/backdrop.*\.webp/);
    // v1.7 posters: the backdrop shows under its loaded poster.
    await expect.poll(() => page.locator('.lt-stage__backdrop').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  }
});

test('v1.7 posters: the poster is feathered over 2 % of the frame, only on its edges inside the stage', async ({ page }) => {
  // 1440 × 900: the dock at the right, the frame square inside the viewport on every side; 390 × 844
  // in guest mode: the frame square spans the phone's width, so its left and right edges are the
  // stage's own and stay sharp (v1.4–v1.6: 9 % on every edge, which faded the content there).
  for (const [width, height, mode] of [[1440, 900, 'Host'], [390, 844, 'Guest']] as const) {
    await page.setViewportSize({ width, height });
    await ready(page, '/?scene=sports');
    await page.getByRole('button', { name: mode, exact: true }).click();
    await settled(page);
    const f = await frame(page);
    const vars = await page.evaluate(() => Object.fromEntries(['left', 'top', 'right', 'bottom'].map((e) => [e, parseFloat(getComputedStyle(document.querySelector('.lt-stage')!).getPropertyValue(`--lt-poster-feather-${e}`))])));
    const gaps = { left: f.x, top: f.y, right: width - f.x - f.size, bottom: height - f.y - f.size };
    for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
      expect(vars[edge], `${width} ${edge}`).toBeCloseTo(gaps[edge] > 0.5 ? 0.02 * f.size : 0, 3);
    }
    if (width === 390) expect([vars.left, vars.right]).toEqual([0, 0]);
    await expect(page.locator('.lt-stage__poster')).toHaveClass(/is-feathered/);
  }
});

test('phone: the frame square eases with the sheet (no one-frame jump of the object), and lands exactly on the new insets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page, '/?scene=party');
  await settled(page);
  const before = await frame(page);
  // Sample the frame square every animation frame while "Preview as guest" swaps the sheet's panel.
  await page.evaluate(() => {
    const w = window as any;
    w.__frames = [];
    const loop = () => {
      w.__frames.push(w.__showcase.controller.getFrame());
      if (w.__frames.length < 40) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.getByRole('button', { name: 'Preview as guest' }).click();
  await page.waitForFunction(() => (window as any).__frames.length >= 40);
  const sizes = (await page.evaluate(() => (window as any).__frames as Frame[])).map((f) => f.size);
  await settled(page);
  const after = await frame(page);
  const change = Math.abs(after.size - before.size);
  expect(change, 'the preview changes the free area').toBeGreaterThan(20);
  // Several frames in between, no single frame taking more than a third of the change.
  const steps = sizes.slice(1).map((s, i) => Math.abs(s - sizes[i]!));
  expect(sizes.filter((s) => Math.abs(s - before.size) > 1 && Math.abs(s - after.size) > 1).length).toBeGreaterThanOrEqual(5);
  expect(Math.max(...steps)).toBeLessThan(change / 3);
  // And it lands on exactly the square the insets give (the canvas and the poster agree).
  const p = await page.evaluate(() => [...['--lt-frame-x', '--lt-frame-y', '--lt-frame-size']].map((v) => parseFloat(getComputedStyle(document.querySelector('.lt-stage')!).getPropertyValue(v))));
  expect(p).toEqual([after.x, after.y, after.size]);
});

test('each answered poster sits over its own backdrop (the pulled-back declined ones at their framing); guest-ready over the rest backdrop', async ({ page }) => {
  // v1.5 decline pull-back: Birthday's and Dinner's declined pose is at the decline fit, wider than
  // the rest fit the other posters are at, so its poster melts only into backdrop-declined.webp.
  // v1.7 posters: every scene's backdrops have the scene in them, one per pose, so every declined
  // poster has its own (Party's lid is closed, Business's lanyard has swung, outside the frame).
  for (const [width, height] of [[1440, 900], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    for (const scene of ['birthday', 'dinner', 'party'] as const) {
      await ready(page, `/?scene=${scene}`);
      await page.getByRole('button', { name: 'Guest', exact: true }).click();
      await page.evaluate(() => (window as any).__showcase.controller.setQualityTier('static'));
      const backdrop = () => page.locator('.lt-stage__backdrop').evaluate((el) => getComputedStyle(el).backgroundImage);
      await expect(page.locator('.lt-stage__poster')).toHaveAttribute('src', /guest-ready/);
      expect(await backdrop(), `${scene} ${width}`).toMatch(/backdrop\.webp/);
      await page.getByRole('button', { name: 'Decline' }).click();
      await expect(page.locator('.lt-stage__poster')).toHaveAttribute('src', /declined/);
      await expect(page.locator('.lt-stage__poster')).toBeVisible();
      await expect.poll(backdrop).toMatch(/backdrop-declined\.webp/);
      // Still on the frame square, and the backdrop still covers the viewport around it.
      const f = await frame(page);
      const p = await rect(page, '.lt-stage__poster');
      expect(p.x).toBeCloseTo(f.x, 0);
      expect(p.width).toBeCloseTo(f.size, 0);
      const b = await rect(page, '.lt-stage__backdrop');
      expect(b.x).toBeLessThanOrEqual(0);
      expect(b.x + b.width).toBeGreaterThanOrEqual(width);
    }
  }
});

test('v1.7: Dinner\'s accepted poster (the close-up on the card) sits over its own backdrop, the close-up with the plate in it', async ({ page }) => {
  for (const [width, height] of [[1440, 900], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await ready(page, '/?scene=dinner');
    await page.getByRole('button', { name: 'Guest', exact: true }).click();
    await page.evaluate(() => (window as any).__showcase.controller.setQualityTier('static'));
    const backdrop = () => page.locator('.lt-stage__backdrop').evaluate((el) => getComputedStyle(el).backgroundImage);
    await expect(page.locator('.lt-stage__poster')).toHaveAttribute('src', /guest-ready/);
    expect(await backdrop(), `${width}`).toMatch(/backdrop\.webp/);
    await page.getByRole('button', { name: 'Accept' }).click();
    await expect(page.locator('.lt-stage__poster')).toHaveAttribute('src', /shared-accepted/);
    await expect(page.locator('.lt-stage__poster')).toBeVisible();
    await expect.poll(backdrop).toMatch(/backdrop-accepted\.webp/);
    const f = await frame(page);
    const p = await rect(page, '.lt-stage__poster');
    expect(p.x).toBeCloseTo(f.x, 0);
    expect(p.width).toBeCloseTo(f.size, 0);
    const b = await rect(page, '.lt-stage__backdrop');
    expect(b.x).toBeLessThanOrEqual(0);
    expect(b.x + b.width).toBeGreaterThanOrEqual(width);
  }
});

test('overlay text sits on a surface dense enough for 4.5:1 over any scene', async ({ page }) => {
  await ready(page);
  for (const sel of ['.sc-top', '.sc-dock']) {
    const alpha = await page.locator(sel).evaluate((el) => {
      const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/)!;
      const parts = m[1]!.split(',').map(Number);
      return parts.length === 4 ? parts[3]! : 1;
    });
    // Warm White at ≥ 0.9 over black is ≥ #E2E1DE: Sage Graphite (#585C57) ≥ 5.2:1.
    expect(alpha, sel).toBeGreaterThanOrEqual(0.9);
  }
});

test('the square layout stays the embed default', async ({ page }) => {
  await page.goto('/gallery.html');
  const stage = page.locator('#g-stage');
  await expect(stage).toHaveClass(/lt-stage/);
  await expect(stage).not.toHaveClass(/lt-stage--fullscreen/);
  const box = (await stage.boundingBox())!;
  expect(Math.abs(box.width - box.height)).toBeLessThan(1);
});
