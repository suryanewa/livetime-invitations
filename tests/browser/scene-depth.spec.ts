import { expect, test } from '@playwright/test';

/**
 * v1.6 scene depth (src/render/sceneDepth.ts): Dinner's steam and (v1.6 flames polish) Birthday's
 * smoke volume ask for it. Every other scene's frames are byte-identical with the hook taken out of
 * the stage, at rest and mid-sequence; Dinner draws the depth pass only while its steam shows (not
 * for its accepted still); Birthday only while its smoke rises (not lit, not for its accepted still).
 */

const SCENES = ['party', 'sports', 'business'] as const;

for (const scene of SCENES) {
  test(`${scene}: frames are byte-identical with the scene-depth hook removed; no depth pass is drawn`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(`/?scene=${scene}`);
    await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
    const result = await page.evaluate(async () => {
      const sc = (window as any).__showcase;
      const { SceneDepth } = await import(/* @vite-ignore */ '/src/render/sceneDepth.ts' as string);
      const original = SceneDepth.prototype.render;
      let drawn = 0;
      SceneDepth.prototype.render = function (...args: unknown[]) {
        const r = original.apply(this, args);
        if (r) drawn++;
        return r;
      };
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      sc.controller.setMode('guest');
      await frame();
      const stills: [string, string][] = [];
      const pair = () => {
        const a = sc.controller.captureStill(320, 1, 'image/png') as string;
        SceneDepth.prototype.render = () => false;
        const b = sc.controller.captureStill(320, 1, 'image/png') as string;
        SceneDepth.prototype.render = function (...args: unknown[]) {
          const r = original.apply(this, args);
          if (r) drawn++;
          return r;
        };
        stills.push([a, b]);
      };
      pair();
      sc.controller.chooseResponse('accept');
      await new Promise((r) => setTimeout(r, 400));
      pair();
      await new Promise((r) => setTimeout(r, 2000));
      pair();
      SceneDepth.prototype.render = original;
      return { same: stills.map(([a, b]) => a === b), drawn };
    });
    expect(result.same).toEqual([true, true, true]);
    expect(result.drawn).toBe(0);
  });
}

test('dinner: the depth pass is drawn while the steam shows, and not for the accepted still', async ({ page }) => {
  await page.goto('/?scene=dinner');
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
  const drawn = await page.evaluate(async () => {
    const sc = (window as any).__showcase;
    const { SceneDepth } = await import(/* @vite-ignore */ '/src/render/sceneDepth.ts' as string);
    const original = SceneDepth.prototype.render;
    let count = 0;
    SceneDepth.prototype.render = function (...args: unknown[]) {
      const r = original.apply(this, args);
      if (r) count++;
      return r;
    };
    sc.controller.setMode('guest');
    await new Promise((r) => setTimeout(r, 200));
    const before = count;
    sc.controller.chooseResponse('accept');
    await new Promise((r) => setTimeout(r, 1500));
    const during = count - before;
    sc.controller.setReducedMotion(true);
    await new Promise((r) => setTimeout(r, 200));
    const still = count;
    sc.controller.captureStill(256, 1);
    const atRest = count - still;
    SceneDepth.prototype.render = original;
    return { before, during, atRest };
  });
  expect(drawn.before).toBe(0);
  expect(drawn.during).toBeGreaterThan(20);
  expect(drawn.atRest).toBe(0);
});

test('birthday: no depth pass while lit (byte-identical without the hook); drawn while the smoke rises (the settled accepted still draws none: tests/flameRender.test.ts)', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?scene=birthday');
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
  const result = await page.evaluate(async () => {
    const sc = (window as any).__showcase;
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/render/sceneDepth.ts')) ?? '/src/render/sceneDepth.ts';
    const { SceneDepth } = await import(/* @vite-ignore */ url as string);
    const original = SceneDepth.prototype.render;
    let drawn = 0;
    const count = function (this: unknown, ...args: unknown[]) {
      const r = original.apply(this, args);
      if (r) drawn++;
      return r;
    };
    SceneDepth.prototype.render = count;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    sc.controller.setMode('guest');
    await frame();
    await frame();
    const pair = () => {
      const a = sc.controller.captureStill(320, 1, 'image/png') as string;
      SceneDepth.prototype.render = () => false;
      const b = sc.controller.captureStill(320, 1, 'image/png') as string;
      SceneDepth.prototype.render = count;
      return a === b;
    };
    drawn = 0;
    const lit = pair();
    const litDrawn = drawn;
    sc.controller.chooseResponse('accept');
    await new Promise((r) => setTimeout(r, 1200));
    drawn = 0;
    await frame();
    const smokeDrawn = drawn;
    SceneDepth.prototype.render = original;
    return { lit, litDrawn, smokeDrawn };
  });
  expect(result.lit).toBe(true);
  expect(result.litDrawn).toBe(0);
  expect(result.smokeDrawn).toBeGreaterThan(0);
});
