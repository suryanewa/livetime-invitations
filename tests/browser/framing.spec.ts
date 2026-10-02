import { expect, test, type Page } from '@playwright/test';

/**
 * The framing rule on the real silhouettes (src/render/framing.ts): one lens and angle; the hero
 * (the objects on stage at guest-ready) fills 60 % of the frame height, or 75 % of its width when
 * it is wide and low; across, it sits centred unless a path needs the room; every path stays 4 %
 * inside the frame. v1.5 decline pull-back: a scene whose decline carries its object over the real
 * 47 cm bin (Birthday, Dinner) has two fits, `rest` (the rule; host-ready, guest-ready, accepted)
 * and `decline` (every path 4 % inside; the declined pose), and the camera dollies between them
 * during the decline. The fit is solved once per scene and aspect, never during a sequence.
 */

type Fit = {
  heroHeight: number; heroWidth: number; binding: 'height' | 'width'; pathLimited: boolean; heroCenter: [number, number]; distance: number;
  offset: [number, number]; pathExtents: [number, number, number, number];
};
type Report = { rest: Fit; decline: Fit; pull: number; solves: number; points: { hero: number; rest: number; decline: number } };

const SCENES = ['party', 'birthday', 'sports', 'dinner', 'business'] as const;
const PULLS = new Set(['birthday', 'dinner']);
const CLEAR = 1 - 0.04 + 1e-3;

async function ready(page: Page, url: string) {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
}
const report = (page: Page, aspect = 1) => page.evaluate((a) => (window as any).__showcase.controller.framing(a), aspect) as Promise<Report>;
const visual = (page: Page) => page.evaluate(() => (window as any).__showcase.state.visual as string);

for (const scene of SCENES) {
  test(`${scene}: at rest the hero fills the frame by the shared rule; at the decline fit every path keeps its clearance`, async ({ page }) => {
    await ready(page, `/?scene=${scene}`);
    const fits = await page.evaluate(() => [0.75, 1, 1.5].map((a) => (window as any).__showcase.controller.framing(a))) as Report[];
    for (const [i, f] of fits.entries()) {
      const label = `${scene} @ ${[0.75, 1, 1.5][i]}`;
      expect(f, label).not.toBeNull();
      const { rest, decline } = f;
      // Every path inside the clearance, at rest and at pull 1.
      for (const fit of [rest, decline]) {
        const [x0, x1, y0, y1] = fit.pathExtents;
        for (const v of [-x0, x1, -y0, y1]) expect(v, label).toBeLessThanOrEqual(CLEAR);
      }
      expect(rest.heroHeight, label).toBeLessThanOrEqual(0.6 + 1e-3);
      expect(rest.heroWidth, label).toBeLessThanOrEqual(0.75 + 1e-3);
      if (scene === 'dinner') {
        // The rule at rest, held only by the cover's own host and accept paths (the cover poised
        // above the plate, then set down beside it): 0.724 of the width at 3:4, 0.696 at 1:1, 0.547
        // of the height at 3:2 (v1.4 0.496 at 1:1 with a smaller bin; v1.5 one fixed camera, 0.354).
        expect(Math.max(rest.heroWidth / 0.75, rest.heroHeight / 0.6), label).toBeGreaterThan(0.9);
      } else {
        expect(rest.pathLimited, label).toBe(false);
        if (rest.binding === 'height') expect(rest.heroHeight, label).toBeCloseTo(0.6, 2);
        else expect(rest.heroWidth, label).toBeCloseTo(0.75, 2);
        // Centred across (no rest path needs the room).
        expect(Math.abs(rest.heroCenter[0]), label).toBeLessThan(0.15);
      }
      if (PULLS.has(scene)) {
        // The carry over the bin's rim sets the decline fit: wider than the rest fit.
        expect(decline.pathLimited, label).toBe(true);
        expect(decline.distance, label).toBeGreaterThan(rest.distance * 1.1);
      } else {
        expect(decline, label).toEqual(rest);
      }
    }
    // At the square stage every scene but Dinner is held by its height at rest.
    if (scene !== 'dinner') expect(fits[1]!.rest.binding).toBe('height');
    // The fit works on a few hundred points (framingHull), whatever the meshes' vertex counts.
    const pts = fits[1]!.points;
    expect(pts.hero + pts.decline, scene).toBeLessThan(800);
  });
}

for (const scene of ['birthday', 'dinner'] as const) {
  test(`${scene}: the camera is at rest until the decline, pulls back through it, holds at the declined pose and comes home on a change of mind; no fit is solved`, async ({ page }) => {
    await ready(page, `/?scene=${scene}`);
    await page.getByRole('button', { name: 'Guest', exact: true }).click();
    await expect.poll(() => visual(page)).toBe('guest-ready');
    const before = await report(page);
    expect(before.pull).toBe(0);
    // The pull every animation frame through the decline.
    await page.evaluate(() => {
      const w = window as any;
      w.__pulls = [];
      const loop = () => {
        w.__pulls.push([w.__showcase.state.visual, w.__showcase.controller.framing().pull]);
        if (w.__pulls.length < 600) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.getByRole('button', { name: 'Decline' }).click();
    await expect.poll(() => visual(page), { timeout: 5000 }).toBe('declined-pose');
    const pulls = (await page.evaluate(() => (window as any).__pulls as [string, number][])).filter(([v]) => v === 'decline-playing').map(([, p]) => p);
    expect(pulls.length).toBeGreaterThan(20);
    for (let i = 1; i < pulls.length; i++) expect(pulls[i]!).toBeGreaterThanOrEqual(pulls[i - 1]! - 1e-9);
    expect(Math.max(...pulls)).toBe(1);
    expect((await report(page)).pull).toBe(1);
    // A change of mind: the camera is home (the rest fit) once the accept has played.
    await page.getByRole('button', { name: 'Accept' }).click();
    await expect.poll(() => visual(page), { timeout: 6000 }).toBe('accepted-pose');
    const after = await report(page);
    expect(after.pull).toBe(0);
    // Not one fit solved through guest mode, the decline, the change of mind and the accept.
    expect(after.solves).toBe(before.solves);
  });
}

test('phone: the dock changing size (mode switch, an answer) only places the camera, never refits', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page, '/?scene=dinner');
  const start = (await report(page)).solves;
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(() => visual(page), { timeout: 6000 }).toBe('accepted-pose');
  await page.getByRole('button', { name: 'Controls' }).click();
  await page.waitForTimeout(400);
  expect((await report(page)).solves).toBe(start);
});
