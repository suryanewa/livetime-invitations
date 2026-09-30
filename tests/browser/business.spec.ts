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

test('The lit status window keeps its colour: no clipping, no hotspot, green and red differ in hue and value', async ({ page }) => {
  await ready(page);
  await guest(page);
  await page.getByRole('button', { name: /Motion/ }).click();
  expect((await state(page)).reducedMotion).toBe(true);
  // Window and glass boxes as fractions of the square stage (fixed camera and bounds).
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
    const WIN = [0.675, 0.67, 0.752, 0.732], GLASS = [0.52, 0.62, 0.78, 0.77];
    const lit: number[][] = [];
    let hot = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const px = [data[i]!, data[i + 1]!, data[i + 2]!];
        const hi = Math.max(...px), sat = hi - Math.min(...px);
        if (inBox(x, y, WIN)) {
          if (sat > 60) lit.push(px);
        } else if (inBox(x, y, GLASS) && hi >= 230 && sat > 60) hot++;
      }
    }
    const median = [0, 1, 2].map((k) => lit.map((p) => p[k]!).sort((a, b) => a - b)[lit.length >> 1]!);
    return { median, max: Math.max(...lit.map((p) => Math.max(...p))), count: lit.length, hot };
  });
  // Relative luminance, and the same under deuteranopia (Machado 2009, severity 1).
  const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = ([r, g, b]: number[]) => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  const deut = (px: number[]) => {
    const [r, g, b] = px.map(lin) as [number, number, number];
    return lum([0.367322 * r + 0.860646 * g - 0.227968 * b, 0.280085 * r + 0.672501 * g + 0.047413 * b, -0.01182 * r + 0.04294 * g + 0.968881 * b]);
  };

  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await state(page)).visual).toBe('accepted-pose');
  const accept = await measure();
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.poll(async () => (await state(page)).visual).toBe('declined-pose');
  const decline = await measure();

  for (const [label, m] of [['accept', accept], ['decline', decline]] as const) {
    expect(m.count, label).toBeGreaterThan(300);
    // No channel clips: the window reads as its token, not as mint or pink.
    expect(m.max, label).toBeLessThanOrEqual(245);
    // No specular hotspot from the spill light on the glass beside the window.
    expect(m.hot, label).toBeLessThanOrEqual(5);
  }
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
    const url = (window as any).__showcase.controller.captureStill(540, 1, 'image/png') as string;
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
      let size = 0;
      while (stack.length) {
        const i = stack.pop()!;
        size++;
        const x = i % w;
        for (const j of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
          if (j >= 0 && j < w * h && blue[j] && !label[j]) { label[j] = next; stack.push(j); }
        }
      }
      if (size > bestSize) { bestSize = size; best = next; }
    }
    const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    let sum = 0, n = 0;
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        let inside = true;
        for (let dy = -2; dy <= 2 && inside; dy++) for (let dx = -2; dx <= 2 && inside; dx++) inside = label[(y + dy) * w + x + dx] === best;
        if (!inside) continue;
        const i = (y * w + x) * 4;
        sum += 0.2126 * lin(data[i]!) + 0.7152 * lin(data[i + 1]!) + 0.0722 * lin(data[i + 2]!);
        n++;
      }
    }
    return { lum: sum / n, n };
  });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.clock.runFor(1000);
  await page.evaluate(() => (window as any).__showcase.controller.chooseResponse('accept'));
  // Approach end, contact press, scan hold and settle (sub-spec 0.55–1.15 s).
  const hold: number[] = [];
  let at = 0;
  for (const t of [0.6, 0.75, 0.9, 1.05, 1.15]) {
    await page.clock.runFor(Math.round((t - at) * 1000));
    at = t;
    const p = await panel();
    expect(p.n, `t=${t}`).toBeGreaterThan(1500);
    hold.push(p.lum);
  }
  await page.clock.runFor(1000);
  expect((await state(page)).visual).toBe('accepted-pose');
  const rest = await panel();
  expect(rest.n).toBeGreaterThan(1500);
  // Within about 25 % of rest for the whole hold (it was 2.8x: pale lavender at the key beat).
  const ratios = hold.map((l) => l / rest.lum);
  expect(ratios.reduce((a, b) => a + b) / ratios.length).toBeLessThanOrEqual(1.25);
  for (const r of ratios) expect(r).toBeLessThanOrEqual(1.3);
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
