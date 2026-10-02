import { expect, test } from '@playwright/test';

/**
 * v1.4 framing rule on the real silhouettes (src/render/framing.ts): one lens and angle; the hero
 * (the objects on stage at guest-ready) fills 60 % of the frame height, or 75 % of its width when
 * it is wide and low; across, it sits centred unless a path needs the room; every path stays in
 * frame. Dinner is the recorded exception: its open bin sets the frame.
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
        // The open bin behind the dish cannot fit at the hero size: the camera backs off.
        expect(f.pathLimited, label).toBe(true);
        expect(Math.max(f.heroWidth / 0.75, f.heroHeight / 0.6), label).toBeGreaterThan(0.55);
        continue;
      }
      expect(f.pathLimited, label).toBe(false);
      if (f.binding === 'height') expect(f.heroHeight, label).toBeCloseTo(0.6, 2);
      else expect(f.heroWidth, label).toBeCloseTo(0.75, 2);
      expect(f.heroHeight, label).toBeLessThanOrEqual(0.6 + 1e-3);
      expect(f.heroWidth, label).toBeLessThanOrEqual(0.75 + 1e-3);
      // Centred across unless a path needed the room (Birthday's bin slides it at 3:4: 0.19 since
      // v1.5, whose real-size 1.4 cm flames no longer pad the hero's top, so the cake is framed
      // larger and the bin's path takes more of the width).
      expect(Math.abs(f.heroCenter[0]), label).toBeLessThan(scene === 'birthday' && i === 0 ? 0.21 : 0.15);
    }
    // At the square stage every scene but Dinner is held by its height.
    if (scene !== 'dinner') expect(fits[1]!.binding).toBe('height');
  });
}
