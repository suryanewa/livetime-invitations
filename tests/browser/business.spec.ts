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

test('The status pictogram is dead-front while idle, lights in its colour with a hotspot, reads by shape at phone size, and leaves no glint on the glass', async ({ page }) => {
  await ready(page);
  await guest(page);
  await page.getByRole('button', { name: /Motion/ }).click();
  expect((await state(page)).reducedMotion).toBe(true);
  // v1.5: boxes as fractions of the square stage (fixed camera): the pictogram and its halo on the
  // lower glass (PICTO, inside the window: the steel lip starts at 0.735), and the lower glass round
  // it, below the NFC mark and clear of the window's edge highlights (GLASS: v1.4's point spill left a
  // 255 glint at 0.606, 0.694). The check is about 18 × 14 px on this 540 px still, the minus 16 × 5.
  const measure = () => page.evaluate(async () => {
    const url = (window as any).__showcase.controller.captureStill(540, 1, 'image/png') as string;
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
    const inBox = (x: number, y: number, b: number[]) => x >= b[0]! * width && x <= b[2]! * width && y >= b[1]! * height && y <= b[3]! * height;
    const PICTO = [0.55, 0.66, 0.645, 0.728], GLASS = [0.54, 0.672, 0.665, 0.722];
    const lit: number[][] = [];
    const px: { x: number; y: number; l: number }[] = [];
    let glint = 0, darkest = 255, brightest = [0, 0, 0];
    let lx0 = Infinity, lx1 = -Infinity;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const p = [data[i]!, data[i + 1]!, data[i + 2]!];
        const hi = Math.max(...p), sat = hi - Math.min(...p);
        const l = 0.2126 * p[0]! + 0.7152 * p[1]! + 0.0722 * p[2]!;
        if (inBox(x, y, PICTO)) {
          px.push({ x, y, l });
          if (sat > 60) { lit.push(p); lx0 = Math.min(lx0, x); lx1 = Math.max(lx1, x); }
          if (l > 0.2126 * brightest[0]! + 0.7152 * brightest[1]! + 0.0722 * brightest[2]!) brightest = p;
          darkest = Math.min(darkest, hi);
        }
        // A glint: a bright, colourless spot on the black glass (the lit glyph is coloured).
        if (inBox(x, y, GLASS) && hi >= 200 && sat <= 25) glint++;
      }
    }
    // The glyph's shape without colour: the extent of the pixels above 60 % of the box's peak luminance.
    const peak = Math.max(...px.map((p) => p.l));
    const core = px.filter((p) => p.l > 0.6 * peak);
    const ext = (k: 'x' | 'y') => Math.max(...core.map((p) => p[k])) - Math.min(...core.map((p) => p[k])) + 1;
    const median = lit.length ? [0, 1, 2].map((k) => lit.map((p) => p[k]!).sort((a, b) => a - b)[lit.length >> 1]!) : [0, 0, 0];
    return { count: lit.length, median, litWidth: lx1 - lx0 + 1, glint, peak, brightest, coreW: ext('x'), coreH: ext('y') };
  });
  // Relative luminance, and the same under deuteranopia (Machado 2009, severity 1).
  const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = ([r, g, b]: number[]) => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  const deut = (px: number[]) => {
    const [r, g, b] = px.map(lin) as [number, number, number];
    return lum([0.367322 * r + 0.860646 * g - 0.227968 * b, 0.280085 * r + 0.672501 * g + 0.047413 * b, -0.01182 * r + 0.04294 * g + 0.968881 * b]);
  };

  // Idle (guest-ready): dead front. Nothing lit on the glass, no glint.
  const idle = await measure();
  expect(idle.count, 'idle').toBe(0);
  expect(idle.peak, 'idle').toBeLessThan(110);
  expect(idle.glint, 'idle').toBe(0);

  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await state(page)).visual).toBe('accepted-pose');
  const accept = await measure();
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.poll(async () => (await state(page)).visual).toBe('declined-pose');
  const decline = await measure();

  for (const [label, m] of [['accept', accept], ['decline', decline]] as const) {
    // The light reads at 540 px (v1.4's tile was 37 × 26 px of flat colour; the glyph and its halo
    // are about 20 px across: 178 coloured pixels for the check, 129 for the minus).
    expect(m.count, label).toBeGreaterThan(100);
    expect(m.litWidth, label).toBeGreaterThan(16);
    // HDR: the stroke's core rolls a little towards white (its darkest channel at 143 / 153, the
    // tokens' at 59 / 34: a hotspot, not a flat token sticker) without clipping flat (v1.5's first
    // cut pinned the whole stroke at (180, 255, 213) and (255, 195, 199))…
    expect(Math.min(...m.brightest), label).toBeGreaterThan(110);
    expect(Math.min(...m.brightest), label).toBeLessThan(180);
    // …and no glint of a light on the glass beside it.
    expect(m.glint, label).toBe(0);
  }
  // One envelope: the check and the minus are as wide as each other (within 20 %).
  expect(Math.abs(accept.coreW - decline.coreW) / Math.max(accept.coreW, decline.coreW)).toBeLessThan(0.2);
  // Without colour: the check stands about twice the minus's height.
  expect(accept.coreH).toBeGreaterThan(decline.coreH * 1.8);
  // The halo keeps the token's hue: green and red, far apart.
  expect(accept.median[1]! - accept.median[0]!).toBeGreaterThan(90);
  expect(decline.median[0]! - decline.median[1]!).toBeGreaterThan(90);
  const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  expect(ratio(lum(accept.median.map(lin)), lum(decline.median.map(lin)))).toBeGreaterThanOrEqual(2);
  expect(ratio(deut(accept.median), deut(decline.median))).toBeGreaterThanOrEqual(1.75);
});

test('The card print keeps its colour through the scan hold: the laminate does not wash it out', async ({ page }) => {
  await page.clock.install();
  await ready(page);
  await guest(page);
  // Mean linear luminance of the cobalt print panel (light template): the largest strongly
  // blue region, eroded 2 px so edges and the strap never count.
  const panel = () => page.evaluate(async () => {
    // v1.4: the hero framing shows the badge at 0.73× its v1.3 size, so the still is 736 px
    // (540 / 0.734): the panel keeps the pixel count the saturation check was tuned on.
    const url = (window as any).__showcase.controller.captureStill(736, 1, 'image/png') as string;
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const { data, width: w, height: h } = g.getImageData(0, 0, c.width, c.height);
    const blue = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const r = data[i * 4]!, gr = data[i * 4 + 1]!, b = data[i * 4 + 2]!;
      blue[i] = b > r + 25 && b > gr + 15 ? 1 : 0;
    }
    const label = new Int32Array(w * h);
    let best = 0, bestSize = 0, next = 0;
    for (let s = 0; s < w * h; s++) {
      if (!blue[s] || label[s]) continue;
      const stack = [s];
      label[s] = ++next;
      let size = 0, touchesTop = false;
      while (stack.length) {
        const i = stack.pop()!;
        size++;
        if (i < w * 3) touchesTop = true;
        const x = i % w;
        for (const j of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
          if (j >= 0 && j < w * h && blue[j] && !label[j]) { label[j] = next; stack.push(j); }
        }
      }
      // The strap is blue too: it runs off the top edge, the print's cobalt never does.
      if (size > bestSize && !touchesTop) { bestSize = size; best = next; }
    }
    const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const lumAt = (i: number) => 0.2126 * lin(data[i]!) + 0.7152 * lin(data[i + 1]!) + 0.0722 * lin(data[i + 2]!);
    let sum = 0, n = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        let inside = true;
        for (let dy = -2; dy <= 2 && inside; dy++) for (let dx = -2; dx <= 2 && inside; dx++) inside = label[(y + dy) * w + x + dx] === best;
        if (!inside) continue;
        sum += lumAt((y * w + x) * 4);
        n++;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    // Saturation of the panel (sRGB (max − min) / max): a laminate veil adds white and turns the
    // cobalt pale (v1.1's failure read lavender, about 0.3); more light on the print does not.
    let sat = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (label[y * w + x] !== best) continue;
        const i = (y * w + x) * 4;
        const hi = Math.max(data[i]!, data[i + 1]!, data[i + 2]!), lo = Math.min(data[i]!, data[i + 1]!, data[i + 2]!);
        sat += (hi - lo) / Math.max(1, hi);
      }
    }
    return { lum: sum / n, n, sat: sat / n };
  });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.clock.runFor(1000);
  await page.evaluate(() => (window as any).__showcase.controller.chooseResponse('accept'));
  // Approach end, contact press, scan hold and settle (sub-spec 0.55–1.15 s).
  const hold: { lum: number; sat: number }[] = [];
  let at = 0;
  for (const t of [0.6, 0.75, 0.9, 1.05, 1.15]) {
    await page.clock.runFor(Math.round((t - at) * 1000));
    at = t;
    const p = await panel();
    expect(p.n, `t=${t}`).toBeGreaterThan(1500);
    hold.push(p);
  }
  await page.clock.runFor(1000);
  expect((await state(page)).visual).toBe('accepted-pose');
  const rest = await panel();
  expect(rest.n).toBeGreaterThan(1500);
  // A laminate veil adds white: the cobalt pales (v1.1's key-beat washout was 2.8x the rest
  // luminance, pale lavender). Pressed flat on the 11.6° face the card also simply turns towards
  // the key, so the print gets brighter as a whole (about 1.5x the hanging rest pose): the checks
  // are the panel's saturation, which light alone barely changes, and a luminance ceiling well
  // below the old failure. (v1.2 checked luminance within 1.25x of rest; with the card pressed
  // higher on a smaller reader the honest lighting difference alone is 1.47x.)
  // v1.4: from the hero framing's camera distance the pressed holder's laminate catches the
  // room's window a little more (measured 0.877–0.882 of the rest saturation and up to 1.69× its
  // luminance; v1.3 0.916–0.922 and 1.52×); the v1.1 failure (pale lavender, 2.8×) stays far out.
  for (const p of hold) {
    expect(p.sat / rest.sat).toBeGreaterThanOrEqual(0.86);
    expect(p.lum / rest.lum).toBeLessThanOrEqual(1.8);
  }
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
