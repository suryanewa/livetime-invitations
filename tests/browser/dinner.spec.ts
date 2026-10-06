import { expect, test, type Page } from '@playwright/test';

/**
 * Dinner behaviour checks (Production Plan M6, Dinner sub-spec acceptance criteria). The
 * decline reuses the shared bin approved at checkpoint 3.
 */

type Snap = { resource: string; visual: string; response: { intent: string | null; persistence: string } };
const state = (page: Page) => page.evaluate(() => (window as any).__showcase.state as Snap);
const requests = (page: Page) => page.evaluate(() => (window as any).__showcase.requests.length as number);

/**
 * Mean per-channel difference (0–255) the steam still makes in a 256 px still just after the
 * reveal, when the column is thinning (measured 0.07; the cleared frame measures 0).
 */
const STEAM_VISIBLE = 0.03;

async function ready(page: Page, url = '/?scene=dinner') {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
}

async function stillDiff(page: Page, a: string, b: string): Promise<number> {
  return page.evaluate(async ([ua, ub]) => {
    const pixels = async (url: string) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const x = c.getContext('2d')!;
      x.drawImage(img, 0, 0);
      return x.getImageData(0, 0, 256, 256).data;
    };
    const [pa, pb] = await Promise.all([pixels(ua!), pixels(ub!)]);
    let sum = 0;
    for (let i = 0; i < pa.length; i += 4) sum += Math.abs(pa[i]! - pb[i]!) + Math.abs(pa[i + 1]! - pb[i + 1]!) + Math.abs(pa[i + 2]! - pb[i + 2]!);
    return sum / (256 * 256 * 3);
  }, [a, b] as const);
}

test('Cover dish plays the host sequence and ends at guest-ready; Dinner has no preset control', async ({ page }) => {
  await ready(page);
  // v1.2: the cloche and the clean plate, no food: no Dish control in the host panel.
  await expect(page.locator('[data-bind="preset-legend"]')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Pasta' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Vegetables' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cover dish' }).click();
  await expect.poll(async () => (await state(page)).visual).toBe('host-playing');
  await expect.poll(async () => (await state(page)).visual, { timeout: 4000 }).toBe('guest-ready');
});

test('Accept reveals the dish; Decline bins the covered dish; one request each', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 4000 }).toBe('accepted-pose');
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('declined-pose');
  await expect.poll(() => requests(page)).toBe(2);
  await expect.poll(async () => (await state(page)).response.persistence).toBe('saved');
});

test('Accept releases steam that rises on after the reveal, then the camera moves in to the card; the loop idles on the canonical close-up', async ({ page }) => {
  // v1.5: the steam lives in simulate past the reveal (settling() while it rises); count frames.
  // v1.7 (#42): the close-up moves in on the reveal's clock (τ 2.4–4.4 s since the polish round), inside the steam's life.
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    (window as any).__rafCalls = 0;
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      (window as any).__rafCalls++;
      return raf(cb);
    };
  });
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 4000 }).toBe('accepted-pose');
  const still = () => page.evaluate(() => (window as any).__showcase.controller.captureStill(256, 1) as string);
  const close = () => page.evaluate(() => (window as any).__showcase.controller.framing().close as number);
  // At the accepted pose the camera is still at rest while the steam rises (τ ≈ 1.5 s).
  expect(await close()).toBe(0);
  const steaming = await still();
  // Still drawing: the column is rising off the plate.
  const calls = () => page.evaluate(() => (window as any).__rafCalls as number);
  const a = await calls();
  await page.waitForTimeout(300);
  expect(await calls()).toBeGreaterThan(a + 5);
  // The cloud is thinning (τ ≈ 2.1–2.3 s), the camera not yet moved (it sets off at τ 2.4 s; polling is
  // not frame-exact): the steam has visibly changed the still.
  await page.waitForTimeout(300);
  expect(await close()).toBeLessThan(0.01);
  expect(await stillDiff(page, steaming, await still())).toBeGreaterThan(STEAM_VISIBLE);
  // The move, then the close-up (τ 4.4 s, ≈ 2.9 s after the accepted pose), the thin tail still rising.
  await expect.poll(close, { timeout: 4000 }).toBeGreaterThan(0);
  await expect.poll(close, { timeout: 4000 }).toBe(1);
  const t = await calls();
  await page.waitForTimeout(300);
  expect(await calls()).toBeGreaterThan(t + 5);
  // Gone by STEAM_END (5.88 s of the reveal's clock, ≈ 4.4 s after the accepted pose): idle.
  await page.waitForTimeout(2200);
  const b = await calls();
  await page.waitForTimeout(800);
  expect(await calls()).toBeLessThanOrEqual(b + 1);
  const cleared = await still();
  const canonical = await page.evaluate(async () => {
    const c = (window as any).__showcase.controller;
    c.setReducedMotion(true);
    await new Promise((r) => setTimeout(r, 100));
    return c.captureStill(256, 1) as string;
  });
  // The live close-up after the move is the canonical one (the poster's).
  expect(await stillDiff(page, cleared, canonical)).toBeLessThan(0.3);
});

/** Dark ("ink") pixels of a 720 px still inside and outside the card's rectangle (the close-up: 55 % of the width, centred; v1.7 polish, was 65 %). */
async function inkOf(page: Page, url: string): Promise<{ inside: number; outside: number; rows: number; greyRows: number }> {
  return page.evaluate(async (u) => {
    const img = new Image();
    img.src = u;
    await img.decode();
    const n = 720;
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0, n, n);
    const d = x.getImageData(0, 0, n, n).data;
    // The card's print area: inside its rectangle (half-width 0.55 × the half-frame, 10:7, a hair of perspective).
    const hw = 0.55 * n / 2 * 0.9, hh = 0.55 * n / 2 * 0.7 * 0.9;
    let inside = 0, outside = 0;
    const rows = new Set<number>(), grey = new Set<number>();
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = (j * n + i) * 4;
        const luma = 0.2126 * d[k]! + 0.7152 * d[k + 1]! + 0.0722 * d[k + 2]!;
        const onCard = Math.abs(i - n / 2) < hw && Math.abs(j - n / 2) < hh;
        // The Sage Graphite eyebrow (luma ≈ 90–95 at its darkest here) counts as grey type (≤ 170), not ink.
        if (onCard && luma <= 170) grey.add(j);
        if (luma > 90) continue;
        if (onCard) { inside++; rows.add(j); } else outside++;
      }
    }
    return { inside, outside, rows: rows.size, greyRows: grey.size };
  }, url);
}

test('The accepted close-up prints the card legibly; a text change reprints it where it lies without resetting', async ({ page }) => {
  await ready(page);
  const c = (fn: string) => page.evaluate(new Function(`const c = window.__showcase.controller; return (${fn})(c, window.__showcase);`) as () => unknown);
  await c('(c) => { c.setReducedMotion(true); c.setMode("guest"); c.chooseResponse("accept"); }');
  await expect.poll(async () => (await state(page)).visual).toBe('accepted-pose');
  // The close channel is placed by the next frame's prepareFrame (setClose), so a read straight after
  // the state poll can precede it (seen once under load): poll it too.
  await expect.poll(() => page.evaluate(() => (window as any).__showcase.controller.framing().close), { timeout: 2000 }).toBe(1);
  const before = (await c('(c) => c.captureStill(720, 1)')) as string;
  const small = (await c('(c) => c.captureStill(256, 1)')) as string;
  const ink = await inkOf(page, before);
  console.log('dinner close-up ink (720 px still):', JSON.stringify(ink));
  // Ink only on the card (the porcelain round it is clean), in several lines of type: measured at the
  // polish round's 55 % fill 3,844 ink pixels (luma ≤ 90) inside the card's print area and none
  // outside, across 72 pixel rows (two title lines and the name; 5,843 / 86 at the first cut's 65 %).
  expect(ink.inside).toBeGreaterThan(3000);
  expect(ink.outside).toBeLessThan(ink.inside / 50);
  expect(ink.rows).toBeGreaterThan(60);
  // The eyebrow (Sage Graphite, lighter than the ink threshold) is there too: rows of grey type
  // (luma ≤ 170) above the ink's, at least its capitals' height (≈ 10 px here).
  expect(ink.greyRows - ink.rows).toBeGreaterThanOrEqual(8);
  // A new title (print-only): the same pose, a new print.
  await c('(c, s) => s.setConfig({ category: "dinner", dish: "pasta", card: { eyebrow: "You’re invited", title: "A much longer evening title for the card", name: "Sam" } })');
  await page.waitForTimeout(200);
  expect((await state(page)).visual).toBe('accepted-pose');
  const after = (await c('(c) => c.captureStill(720, 1)')) as string;
  expect(await stillDiff(page, small, (await c('(c) => c.captureStill(256, 1)')) as string)).toBeGreaterThan(0.2);
  expect((await inkOf(page, after)).outside).toBeLessThan(ink.inside / 50);
});

test('v1.7 polish: the print holds the config\'s clamps in the bundled face (no ellipsis)', async ({ page }) => {
  await ready(page);
  const out = await page.evaluate(async () => {
    const m = await import(/* @vite-ignore */ '/src/render/cardPrint.ts' as string);
    await m.loadCardFont();
    const draw = (text: Record<string, string>) => {
      const c = document.createElement('canvas');
      c.width = 2048; c.height = 1434;
      const ctx = c.getContext('2d')!;
      const lines: { s: string; w: number }[] = [];
      const fill = ctx.fillText.bind(ctx);
      (ctx as any).fillText = (str: string, x: number, y: number) => { lines.push({ s: str, w: ctx.measureText(str).width }); fill(str, x, y); };
      (c as any).getContext = () => ctx;
      const block = m.drawCardPrint(c, text);
      return { lines, block };
    };
    const max = (m.CARD_MM.width - 2 * m.CARD_LAYOUT.margin) * (2048 / m.CARD_MM.width);
    return {
      max,
      limits: [
        draw({ eyebrow: 'You’re invited to a very special evening with friends and fa', title: 'A long table under the orchard lights: five courses, natural wines and slow talk', name: 'Anne-Sophie Vandenberghe-Østergaard de la Fuente' }),
        draw({ eyebrow: 'You’re invited', title: 'Supper club: autumn menu', name: 'Wolfeschlegelsteinhausenbergerdorff' }),
        draw({ eyebrow: 'You’re invited', title: 'Supper club: autumn menu', name: 'Siobhán Ní Mhaoldomhnaigh-Fitzgerald-O’Callaghan' }),
      ],
    };
  });
  for (const r of out.limits) {
    const text = r.lines.map((l) => l.s);
    expect(text.join(' / '), 'printed whole').not.toContain('…');
    for (const l of r.lines) expect(l.w, l.s).toBeLessThanOrEqual(out.max + 1);
    // The block stays inside the card's 70 mm with a margin top and bottom.
    expect(r.block!.top).toBeGreaterThan(8);
    expect(r.block!.bottom).toBeLessThan(62);
  }
});

test('v1.7 polish: the eyebrow\'s capitals follow the page\'s language, not the browser\'s', async ({ browser }) => {
  // A Turkish browser (its default locale upper-cases i to İ) showing an English page.
  const context = await browser.newContext({ locale: 'tr-TR' });
  const page = await context.newPage();
  await ready(page);
  const out = await page.evaluate(async () => {
    const m = await import(/* @vite-ignore */ '/src/render/cardPrint.ts' as string);
    const browserDefault = 'invited'.toLocaleUpperCase();
    const en = m.capitals('You’re invited');
    document.documentElement.lang = 'tr';
    const tr = m.capitals('Davetlisiniz');
    document.documentElement.lang = 'not a tag!';
    const bad = m.capitals('invited');
    document.documentElement.lang = 'en';
    return { browserDefault, en, tr, bad };
  });
  // (Whether the browser's own default maps i to İ depends on the build's ICU default locale: logged, not asserted.)
  console.log('browser default upper case of "invited" under tr-TR:', out.browserDefault);
  expect(out.en).toBe('YOU’RE INVITED');
  expect(out.tr).toBe('DAVETLİSİNİZ');
  expect(out.bad).toBe('INVITED');
  await context.close();
});

test('A card text change mid-reveal reprints the card and does not restart or cut the reveal', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.waitForTimeout(400);
  expect((await state(page)).visual).toBe('accept-playing');
  await page.evaluate(() => (window as any).__showcase.setConfig({ category: 'dinner', dish: 'pasta', card: { title: 'Changed mid-reveal', name: 'Sam' } }));
  expect((await state(page)).visual).toBe('accept-playing');
  await expect.poll(async () => (await state(page)).visual, { timeout: 4000 }).toBe('accepted-pose');
  expect(await requests(page)).toBe(1);
});

test('Replay after decline restores plate, cover and bin, and ends on the canonical pose', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('declined-pose');
  await page.getByRole('button', { name: 'Replay' }).click();
  await expect.poll(async () => (await state(page)).visual).toBe('decline-playing');
  await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('declined-pose');
  const replayed = await page.evaluate(() => (window as any).__showcase.controller.captureStill(256, 1) as string);
  const canonical = await page.evaluate(async () => {
    const c = (window as any).__showcase.controller;
    c.setReducedMotion(true);
    await new Promise((r) => setTimeout(r, 100));
    return c.captureStill(256, 1) as string;
  });
  expect(await stillDiff(page, replayed, canonical)).toBeLessThan(0.5);
  expect(await requests(page)).toBe(1);
});

test('A saved accept shows the static state without a new request; the dish config selects nothing', async ({ page }) => {
  await ready(page, '/?scene=dinner&saved=accept');
  expect((await state(page)).visual).toBe('accepted-pose');
  // `dish` stays in SceneConfig for integration compatibility; changing it changes nothing.
  await page.evaluate(() => (window as any).__showcase.setConfig({ category: 'dinner', dish: 'vegetables' }));
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Host', exact: true }).click();
  await expect(page.locator('[data-bind="presets"] button')).toHaveCount(0);
  expect(await requests(page)).toBe(0);
});

test('Graphics loss shows the shared declined Dinner poster and responses still work', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.locator('.sc-dev summary').click();
  await page.getByRole('button', { name: 'Simulate graphics loss' }).click();
  await expect.poll(async () => (await state(page)).resource).toBe('fallback');
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.poll(async () => (await state(page)).response.persistence).toBe('saved');
  await expect(page.locator('.lt-stage__poster')).toHaveAttribute('src', /shared-declined/);
});
