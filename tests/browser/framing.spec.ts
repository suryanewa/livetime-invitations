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
type Report = { rest: Fit; decline: Fit; closeUp?: Fit; focusFit?: Fit; pull: number; close: number; focus: number; solves: number; points: { hero: number; rest: number; decline: number } };

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
      // v1.7 (#43): Sports frames its board, rim, net and ball at its own fill, the largest that
      // keeps every path inside the clearance, with the air the judge gave back (the polish round:
      // 0.85 of the height; at 3:4 0.70 of the width binds).
      const fill = scene === 'sports' ? { height: 0.85, width: 0.7 } : { height: 0.6, width: 0.75 };
      expect(rest.heroHeight, label).toBeLessThanOrEqual(fill.height + 1e-3);
      expect(rest.heroWidth, label).toBeLessThanOrEqual(fill.width + 1e-3);
      if (scene === 'dinner') {
        // The rule at rest, held only by the cover's own host and accept paths (the cover poised
        // above the plate, then set down beside it): 0.724 of the width at 3:4, 0.696 at 1:1, 0.547
        // of the height at 3:2 (v1.4 0.496 at 1:1 with a smaller bin; v1.5 one fixed camera, 0.354).
        expect(Math.max(rest.heroWidth / 0.75, rest.heroHeight / 0.6), label).toBeGreaterThan(0.9);
      } else {
        expect(rest.pathLimited, label).toBe(false);
        if (rest.binding === 'height') expect(rest.heroHeight, label).toBeCloseTo(fill.height, 2);
        else expect(rest.heroWidth, label).toBeCloseTo(fill.width, 2);
        if (scene === 'sports') expect(rest.binding, label).toBe(i === 0 ? 'width' : 'height');
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
    // v1.7: only Dinner has a close-up; at rest no scene is on one.
    expect(fits[1]!.close, scene).toBe(0);
    if (scene !== 'dinner') expect(fits[1]!.closeUp, scene).toBeUndefined();
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
    // The channels are placed by the next frame's prepareFrame, so poll rather than read once after a state poll.
    await expect.poll(async () => (await report(page)).pull, { timeout: 2000 }).toBe(1);
    // A change of mind: the camera is home (the rest fit) once the accept has played.
    await page.getByRole('button', { name: 'Accept' }).click();
    await expect.poll(() => visual(page), { timeout: 6000 }).toBe('accepted-pose');
    await expect.poll(async () => (await report(page)).pull, { timeout: 2000 }).toBe(0);
    const after = await report(page);
    // Not one fit solved through guest mode, the decline, the change of mind and the accept.
    expect(after.solves).toBe(before.solves);
  });
}

test('dinner (v1.7 #42): the accepted pose\'s live camera is the close-up on the card; host, guest-ready and the decline stay off it; no fit is solved', async ({ page }) => {
  await ready(page, '/?scene=dinner');
  // The close-up's fit: the card 55 % of the frame's width (v1.7 polish; was 65 %), centred, at every aspect.
  for (const a of [0.75, 1, 1.5]) {
    const f = (await report(page, a)).closeUp!;
    expect(f, `${a}`).toBeDefined();
    expect(f.heroWidth, `${a}`).toBeCloseTo(0.55, 2);
    expect(Math.abs(f.heroCenter[0]) + Math.abs(f.heroCenter[1]), `${a}`).toBeLessThan(0.01);
  }
  // (Measuring other aspects solved and cached them; from here nothing may solve.)
  const start = await report(page);
  expect(start.close).toBe(0);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await expect.poll(() => visual(page)).toBe('guest-ready');
  await expect.poll(async () => (await report(page)).close, { timeout: 2000 }).toBe(0);
  // The channel every animation frame through the accept and the move.
  await page.evaluate(() => {
    const w = window as any;
    w.__closes = [];
    const loop = () => {
      w.__closes.push([w.__showcase.state.visual, w.__showcase.controller.framing().close]);
      if (w.__closes.length < 480) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await report(page)).close, { timeout: 8000 }).toBe(1);
  const closes = (await page.evaluate(() => (window as any).__closes as [string, number][]));
  // 0 while the reveal plays; then monotone up to 1.
  for (const [v, c] of closes) if (v === 'accept-playing') expect(c).toBe(0);
  const k = closes.map(([, c]) => c);
  for (let i = 1; i < k.length; i++) expect(k[i]!).toBeGreaterThanOrEqual(k[i - 1]! - 1e-9);
  expect(k.filter((c) => c > 0 && c < 1).length).toBeGreaterThan(20);
  // The live camera now is the canonical accepted pose's (reduced motion lands there too).
  await page.evaluate(() => (window as any).__showcase.controller.setReducedMotion(true));
  await expect.poll(async () => (await report(page)).close, { timeout: 2000 }).toBe(1);
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.poll(() => visual(page), { timeout: 6000 }).toBe('declined-pose');
  // (Reduced motion: the pose is drawn on the next frame.)
  await expect.poll(async () => (await report(page)).close).toBe(0);
  await expect.poll(async () => (await report(page)).pull, { timeout: 2000 }).toBe(1);
  const d = await report(page);
  expect(d.solves).toBe(start.solves);
});

test('sports (v1.7 polish, #43): the decline pushes in on the bank and back before the ball lands; every pose, reduced motion and a decline from the accept stay off it; no fit is solved', async ({ page }) => {
  await ready(page, '/?scene=sports');
  // The focus fit: the board, the rim and the net at 0.8 of the frame's height (at 3:4 the width binds), closer than the rest fit.
  for (const a of [0.75, 1, 1.5]) {
    const r = await report(page, a);
    const f = r.focusFit!;
    expect(f, `${a}`).toBeDefined();
    expect(r.closeUp, `${a}`).toBeUndefined();
    expect(f.pathLimited, `${a}`).toBe(false);
    expect(r.rest.distance / f.distance, `${a}`).toBeGreaterThan(1.5);
    if (a >= 1) expect(f.heroHeight, `${a}`).toBeCloseTo(0.8, 2);
    for (const v of f.pathExtents) expect(Math.abs(v), `${a}`).toBeLessThanOrEqual(CLEAR);
  }
  const start = await report(page);
  expect(start.focus).toBe(0);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await expect.poll(() => visual(page)).toBe('guest-ready');
  await expect.poll(async () => (await report(page)).focus, { timeout: 2000 }).toBe(0);
  // The channel every animation frame through the decline: up to 1, held, back to 0, never a step.
  await page.evaluate(() => {
    const w = window as any;
    w.__focus = [];
    const t0 = performance.now();
    const loop = (now: number) => {
      w.__focus.push([now - t0, w.__showcase.state.visual, w.__showcase.controller.framing().focus]);
      if (w.__focus.length < 420) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.poll(() => visual(page), { timeout: 5000 }).toBe('declined-pose');
  await expect.poll(async () => (await page.evaluate(() => (window as any).__focus.length)) as number, { timeout: 10_000 }).toBeGreaterThanOrEqual(420);
  const k = (await page.evaluate(() => (window as any).__focus as [number, string, number][])).map(([, , c]) => c);
  expect(Math.max(...k)).toBe(1);
  expect(k.filter((c) => c === 1).length).toBeGreaterThan(20);
  expect(k.filter((c) => c > 0 && c < 1).length).toBeGreaterThan(20);
  const peak = k.indexOf(1), last = k.lastIndexOf(1);
  for (let i = 1; i <= peak; i++) expect(k[i]!).toBeGreaterThanOrEqual(k[i - 1]! - 1e-9);
  for (let i = last + 1; i < k.length; i++) expect(k[i]!).toBeLessThanOrEqual(k[i - 1]! + 1e-9);
  expect(k.at(-1)).toBe(0);
  // Declined: off it. Reduced motion: the camera cuts with the pose (a decline after an accept never pushes in).
  await expect.poll(async () => (await report(page)).focus, { timeout: 2000 }).toBe(0);
  await page.evaluate(() => (window as any).__showcase.controller.setReducedMotion(true));
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(() => visual(page), { timeout: 6000 }).toBe('accepted-pose');
  await expect.poll(async () => (await report(page)).focus).toBe(0);
  await page.evaluate(() => (window as any).__showcase.controller.setReducedMotion(false));
  await page.getByRole('button', { name: 'Decline' }).click();
  for (let i = 0; i < 20; i++) {
    expect((await report(page)).focus).toBe(0);
    await page.waitForTimeout(100);
  }
  expect((await report(page)).solves).toBe(start.solves);
});

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
