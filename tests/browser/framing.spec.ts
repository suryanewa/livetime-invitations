import { expect, test } from '@playwright/test';

/**
 * v1.4 framing rule on the real silhouettes (src/render/framing.ts): one lens and angle; the hero
 * (the objects on stage at guest-ready) fills 60 % of the frame height, or 75 % of its width when
 * it is wide and low; across, it sits centred unless a path needs the room; every path stays in
 * frame. The disposal scenes are the recorded exceptions (docs/spec-revisions.md #3): since v1.5
 * the shared bin is a real 47 cm pedal bin, and the object carried over its 44.5 cm rim sets the
 * frame in Dinner (the dish at 0.354 of the width at 1:1; v1.4 0.496) and, by 6 %, in Birthday
 * (the cake at 0.563 of the height; v1.4 0.60).
 */

type Framing = { heroHeight: number; heroWidth: number; binding: 'height' | 'width'; pathLimited: boolean; heroCenter: [number, number] };

const SCENES = ['party', 'birthday', 'sports', 'dinner', 'business'] as const;

for (const scene of SCENES) {
  test(`${scene}: the hero fills the frame by the shared rule at three aspects`, async ({ page }) => {
    await page.goto(`/?scene=${scene}`);
    await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
    const fits = await page.evaluate(() => [0.75, 1, 1.5].map((a) => (window as any).__showcase.controller.framing(a))) as Framing[];
    for (const [i, f] of fits.entries()) {
      const label = `${scene} @ ${[0.75, 1, 1.5][i]}`;
      expect(f, label).not.toBeNull();
      if (scene === 'dinner') {
        // The dish carried over the open bin behind it cannot fit at the hero size: the camera backs off.
        expect(f.pathLimited, label).toBe(true);
        expect(Math.max(f.heroWidth / 0.75, f.heroHeight / 0.6), label).toBeGreaterThan(0.4);
        continue;
      }
      if (scene === 'birthday') {
        // The cake carried over the real bin's rim needs 6 % more height than the hero rule gives.
        expect(f.pathLimited, label).toBe(true);
        expect(f.heroHeight, label).toBeGreaterThan(0.55);
        expect(f.heroHeight, label).toBeLessThanOrEqual(0.6 + 1e-3);
        expect(Math.abs(f.heroCenter[0]), label).toBeLessThan(0.15);
        continue;
      }
      expect(f.pathLimited, label).toBe(false);
      if (f.binding === 'height') expect(f.heroHeight, label).toBeCloseTo(0.6, 2);
      else expect(f.heroWidth, label).toBeCloseTo(0.75, 2);
      expect(f.heroHeight, label).toBeLessThanOrEqual(0.6 + 1e-3);
      expect(f.heroWidth, label).toBeLessThanOrEqual(0.75 + 1e-3);
      // Centred across unless a path needed the room (Birthday's bin slides it at 3:4).
      expect(Math.abs(f.heroCenter[0]), label).toBeLessThan(0.15);
    }
    // At the square stage every scene but Dinner is held by its height.
    if (scene !== 'dinner') expect(fits[1]!.binding).toBe('height');
  });
}
