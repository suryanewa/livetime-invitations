import { expect, test, type Page } from '@playwright/test';

/**
 * v1.6 bloom and heat haze (src/render/bloom.ts, src/render/heatHaze.ts; docs/scenes/
 * birthday-v1.6-flames.md). Both run only after a main pass that drew an emitter (a burning
 * flame): a frame without one is the stage's own frame, byte for byte, and costs nothing. Checked
 * against the same capture with the bloom switched off (its tooling switch, through the dev
 * server's own module instance), on the stage-colour measurement (the empty stage) and on scenes
 * and poses with nothing emissive; and that it does run, and changes the picture, round the
 * Birthday's lit candles. The haze shimmers only while the scene is live.
 */

async function ready(page: Page, scene: string) {
  // The page's own instance of a module is found by the URL it loaded (Vite adds an HMR timestamp
  // to modules edited while the server runs): keep every resource entry.
  await page.addInitScript(() => performance.setResourceTimingBufferSize(5000));
  await page.goto(`/?scene=${scene}`);
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
}

/** The page's own instance of `/src/render/<name>.ts` (the URL it was loaded by). */
const MODULE = `async (name) => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => new URL(n).pathname === '/src/render/' + name + '.ts') ?? '/src/render/' + name + '.ts';
  return import(/* @vite-ignore */ url);
}`;

/** A still with and without the bloom, and the passes the bloom ran for each. */
async function withAndWithout(page: Page, size: number, options?: { empty?: boolean }) {
  return page.evaluate(async ({ size, options, MODULE }) => {
    const b = await (new Function(`return (${MODULE})`)())('bloom') as { bloomTooling: { enabled: boolean; passes: number } };
    const c = (window as any).__showcase.controller;
    const p0 = b.bloomTooling.passes;
    const on = c.captureStill(size, 1, 'image/png', undefined, options) as string;
    const p1 = b.bloomTooling.passes;
    b.bloomTooling.enabled = false;
    const off = c.captureStill(size, 1, 'image/png', undefined, options) as string;
    b.bloomTooling.enabled = true;
    return { same: on === off, passes: p1 - p0 };
  }, { size, options, MODULE });
}

test('nothing emissive on stage: no bloom pass, and the frame is the stage\'s own (Party host-ready, the stage colour)', async ({ page }) => {
  await ready(page, 'party');
  await page.evaluate(() => {
    const c = (window as any).__showcase.controller;
    c.setReducedMotion(true);
    c.setMode('host');
    c.resetVisual();
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const host = await withAndWithout(page, 720);
  expect(host.passes).toBe(0);
  expect(host.same).toBe(true);
  // The stage-colour measurement (scripts/capture.ts stagecolor: the empty stage, content hidden).
  const empty = await withAndWithout(page, 720, { empty: true });
  expect(empty.passes).toBe(0);
  expect(empty.same).toBe(true);
});

test('Birthday: the lit candles bloom (and the empty stage under them does not)', async ({ page }) => {
  await ready(page, 'birthday');
  await page.evaluate(() => {
    const c = (window as any).__showcase.controller;
    c.setReducedMotion(true);
    c.setMode('guest');
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const lit = await withAndWithout(page, 720);
  expect(lit.passes).toBe(1);
  expect(lit.same).toBe(false);
  const empty = await withAndWithout(page, 720, { empty: true });
  expect(empty.passes).toBe(0);
  expect(empty.same).toBe(true);
  // Blown out: no flame, no bloom.
  await page.evaluate(() => (window as any).__showcase.controller.chooseResponse('accept'));
  await expect.poll(() => page.evaluate(() => (window as any).__showcase.state.visual), { timeout: 5000 }).toBe('accepted-pose');
  const out = await withAndWithout(page, 720);
  expect(out.passes).toBe(0);
  expect(out.same).toBe(true);
});

test('Birthday: the heat haze shimmers while the flames are live, never under reduced motion', async ({ page }) => {
  await ready(page, 'birthday');
  const columns = () => page.evaluate(async (MODULE) => ((await (new Function(`return (${MODULE})`)())('heatHaze')) as { hazeTooling: { columns: number } }).hazeTooling.columns, MODULE);
  await page.evaluate(() => (window as any).__showcase.controller.setMode('guest'));
  await page.waitForTimeout(1200);
  const a = await columns();
  await page.waitForTimeout(500);
  expect(await columns()).toBeGreaterThan(a);
  await page.evaluate(() => (window as any).__showcase.controller.setReducedMotion(true));
  await page.waitForTimeout(300);
  const b = await columns();
  await page.evaluate(() => (window as any).__showcase.controller.captureStill(540, 1, 'image/png'));
  await page.waitForTimeout(500);
  expect(await columns()).toBe(b);
});
