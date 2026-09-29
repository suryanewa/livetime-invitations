import { expect, test, type Page } from '@playwright/test';

/**
 * Resilience checks (Master §9–11, coverage gaps from the checkpoint 3 audit): automatic
 * quality step-down to Static, asset failure, context restore, touch cancellation, rotation
 * mid-playback, increased text size and missing song metadata. Responses never depend on 3D.
 */

type Snap = { resource: string; resourceReason: string; visual: string; tier: string; response: { intent: string | null; persistence: string } };
const state = (page: Page) => page.evaluate(() => (window as any).__showcase.state as Snap);
const requests = (page: Page) => page.evaluate(() => (window as any).__showcase.requests.length as number);

async function ready(page: Page, url = '/') {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 30_000 });
}

test('a device too slow even on Low completes the current intent in Static, with one request', async ({ page }) => {
  test.setTimeout(90_000);
  await ready(page, '/?scene=party');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  // Simulate a struggling GPU: every animation frame costs ≈45 ms of main-thread work.
  await page.evaluate(() => {
    const raf = window.requestAnimationFrame.bind(window);
    (window as any).requestAnimationFrame = (cb: FrameRequestCallback) => raf((t) => { const end = performance.now() + 45; while (performance.now() < end); cb(t); });
  });
  await page.getByRole('button', { name: 'Accept' }).click();
  // Keep replaying (visual only) until the monitor steps Normal → Low → Static.
  for (let i = 0; i < 12; i++) {
    const s = await state(page);
    if (s.tier === 'static') break;
    if (s.visual === 'accepted-pose') await page.getByRole('button', { name: 'Replay' }).click();
    await page.waitForTimeout(1500);
  }
  const s = await state(page);
  expect(s.tier).toBe('static');
  expect(s.resource).toBe('fallback');
  expect(s.resourceReason).toBe('performance-static');
  expect(s.visual).toBe('accepted-pose');
  await expect(page.locator('.lt-stage__poster')).toHaveAttribute('src', /coral-accepted/);
  expect(await requests(page)).toBe(1);
});

test('a failed model download shows the poster and the answer still saves', async ({ page }) => {
  await page.route('**/*.glb', (route) => route.abort());
  await page.goto('/?scene=birthday');
  await expect.poll(async () => (await state(page)).resource, { timeout: 20_000 }).toBe('fallback');
  expect((await state(page)).resourceReason).toBe('asset-failure');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await state(page)).response.persistence).toBe('saved');
  await expect(page.locator('.lt-stage__poster')).toHaveAttribute('src', /vanilla-accepted/);
});

test('after a lost graphics context is restored, 3D comes back once and responses keep working', async ({ page }) => {
  await ready(page);
  const restored = await page.evaluate(async () => {
    const canvas = document.querySelector('.lt-stage canvas') as HTMLCanvasElement;
    const ext = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    ext.loseContext();
    await new Promise((r) => setTimeout(r, 300));
    ext.restoreContext();
    return true;
  });
  expect(restored).toBe(true);
  // Wait until the loss has been handled and the scene reloaded on the restored context.
  await expect.poll(async () => page.evaluate(() => ((window as any).__showcase.events as string[]).some((e) => /context-lost/.test(e))), { timeout: 10_000 }).toBe(true);
  await expect.poll(async () => (await state(page)).resource, { timeout: 20_000 }).toBe('ready');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('declined-pose');
  expect(await requests(page)).toBe(1);
});

test('a cancelled touch drag on the card never sends a request and the scan still completes', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.waitForTimeout(250);
  const grab = page.locator('.lt-stage__grab');
  await expect(grab).toBeVisible();
  const box = (await grab.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await grab.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true, bubbles: true });
  await grab.dispatchEvent('pointermove', { pointerId: 7, pointerType: 'touch', clientX: x + 30, clientY: y - 20, isPrimary: true, bubbles: true });
  await grab.dispatchEvent('pointercancel', { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true });
  await expect.poll(async () => (await state(page)).visual, { timeout: 6000 }).toBe('accepted-pose');
  expect(await requests(page)).toBe(1);
  expect((await state(page)).response.intent).toBe('accept');
});

test('rotating the phone mid-playback keeps the sequence, layout and answer intact', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page, '/?scene=sports');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.waitForTimeout(400);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('accepted-pose');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  expect(await requests(page)).toBe(1);
});

test('increased text size (150 %) keeps every control usable with no horizontal overflow', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await ready(page, '/?scene=party');
    await page.addStyleTag({ content: 'html { font-size: 150% !important; }' });
    const report = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      small: [...document.querySelectorAll('button')]
        .filter((b) => (b as HTMLElement).offsetParent !== null)
        .map((b) => b.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.width < 44 || r.height < 44)).length,
    }));
    expect(report.overflow).toBe(false);
    expect(report.small).toBe(0);
  }
});

test('unknown song metadata reads "Selected track" and the outcome still plays', async ({ page }) => {
  await ready(page, '/?scene=party');
  await page.evaluate(() => (window as any).__showcase.setConfig({ category: 'party', songId: 'not-in-the-catalogue', label: 'cobalt' }));
  await expect(page.locator('[data-bind="track-title"]')).toHaveText('Selected track');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await state(page)).visual, { timeout: 5000 }).toBe('accepted-pose');
  await expect(page.locator('[data-bind="track-title"]')).toHaveText('Selected track');
});

// ── Stage lifecycle and GPU hygiene (checkpoint 4 engine findings) ───────────────────────────

const click = (page: Page, action: string) =>
  page.evaluate((a) => (document.querySelector(`.sc-dev [data-action="${a}"]`) as HTMLButtonElement).click(), action);
const renderInfo = (page: Page) => page.evaluate(() => (window as any).__showcase.controller.renderInfo());
const resource = async (page: Page) => (await state(page)).resource;

/** WebGLRenderer instances and WebGL2 contexts still reachable from JS after a full GC. */
async function reachable(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  // The app's own three module: importing its exact URL returns the same module instance.
  const url = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/\.vite\/deps\/three\.js/.test(n)));
  expect(url, 'three module URL').toBeTruthy();
  await page.evaluate(async (u) => { (window as any).__three = await import(u!); }, url);
  const count = async (expression: string) => {
    const { result } = await cdp.send('Runtime.evaluate', { expression });
    const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: result.objectId! });
    const { result: n } = await cdp.send('Runtime.callFunctionOn', { objectId: objects.objectId!, functionDeclaration: 'function () { return this.length; }', returnByValue: true });
    return n.value as number;
  };
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const counts = { renderers: await count('window.__three.WebGLRenderer.prototype'), contexts: await count('WebGL2RenderingContext.prototype') };
  await page.evaluate(() => { delete (window as any).__three; });
  await cdp.detach();
  return counts;
}

test('30 stage re-creations (remount, loss + retry, Static and back) leave one canvas and one renderer', async ({ page }) => {
  test.setTimeout(240_000);
  await ready(page);
  for (let i = 0; i < 10; i++) {
    await click(page, 'reset');
    await expect.poll(() => resource(page), { timeout: 30_000 }).toBe('ready');
    await click(page, 'lose-context');
    await expect.poll(async () => (await state(page)).resourceReason).toBe('context-lost');
    await click(page, 'retry-3d');
    await expect.poll(() => resource(page), { timeout: 30_000 }).toBe('ready');
    await page.evaluate(() => (window as any).__showcase.controller.setQualityTier('static'));
    await page.evaluate(() => (window as any).__showcase.controller.setQualityTier('normal'));
    await expect.poll(() => resource(page), { timeout: 30_000 }).toBe('ready');
  }
  expect(await page.locator('canvas').count()).toBe(1);
  expect(await reachable(page)).toEqual({ renderers: 1, contexts: 1 });
});

test('Static releases the WebGL stage, keeps the poster and controls, and leaving it brings 3D back', async ({ page }) => {
  await ready(page, '/?scene=party');
  await page.evaluate(() => (window as any).__showcase.controller.setQualityTier('static'));
  expect(await renderInfo(page)).toBeNull();
  expect(await page.locator('.lt-stage canvas').count()).toBe(0);
  expect(await reachable(page)).toEqual({ renderers: 0, contexts: 0 });
  await expect(page.locator('.lt-stage__poster')).toHaveAttribute('src', /coral-host-ready/);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await state(page)).visual).toBe('accepted-pose');
  await expect(page.locator('.lt-stage__poster')).toHaveAttribute('src', /coral-accepted/);
  expect(await requests(page)).toBe(1);
  await page.evaluate(() => (window as any).__showcase.controller.setQualityTier('low'));
  await expect.poll(() => resource(page), { timeout: 30_000 }).toBe('ready');
  expect(await renderInfo(page)).not.toBeNull();
  expect(await page.locator('.lt-stage canvas').count()).toBe(1);
});

test('context loss, restore, a second loss and "Try 3D again" log no warnings', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') warnings.push(m.text()); });
  await ready(page, '/?scene=business');
  await page.evaluate(async () => {
    const ext = (document.querySelector('.lt-stage canvas') as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    ext.loseContext();
    await new Promise((r) => setTimeout(r, 300));
    ext.restoreContext();
  });
  await expect.poll(async () => page.evaluate(() => ((window as any).__showcase.events as string[]).some((e) => /context-restored/.test(e))), { timeout: 20_000 }).toBe(true);
  await click(page, 'lose-context');
  await expect.poll(async () => (await state(page)).resourceReason).toBe('context-lost');
  await click(page, 'retry-3d');
  await expect.poll(() => resource(page), { timeout: 30_000 }).toBe('ready');
  await page.waitForTimeout(300);
  expect(warnings).toEqual([]);
  expect(await page.locator('.lt-stage canvas').count()).toBe(1);
});

test('the first frame after "ready" links no programs in any scene (shadow pass warmed while loading)', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.__links = 0;
    const link = WebGL2RenderingContext.prototype.linkProgram;
    WebGL2RenderingContext.prototype.linkProgram = function (p) { w.__links++; return link.call(this, p); };
    // Links made inside animation frames while the resource is ready (the guest can act then).
    w.__readyFrameLinks = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => {
      const before = w.__links;
      const live = w.__showcase?.state?.resource === 'ready';
      cb(t);
      if (live) w.__readyFrameLinks += w.__links - before;
    });
  });
  for (const scene of ['business', 'party', 'birthday', 'sports', 'dinner']) {
    await ready(page, `/?scene=${scene}`);
    // The canvas replaces the poster only after a frame has drawn.
    await expect(page.locator('.lt-stage__canvas')).toHaveClass(/is-visible/);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => (window as any).__readyFrameLinks), scene).toBe(0);
  }
});

test('switching away and back while a scene is still compiling logs no GL errors and frees what it built', async ({ page }) => {
  test.setTimeout(120_000);
  const warnings: string[] = [];
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') warnings.push(m.text()); });
  await page.addInitScript(() => {
    // Armed, the first program link of the next load switches back at once: the superseded
    // scene's programs are then certainly still compiling in parallel.
    const w = window as any;
    const link = WebGL2RenderingContext.prototype.linkProgram;
    WebGL2RenderingContext.prototype.linkProgram = function (p) {
      const r = link.call(this, p);
      const back = w.__switchBack;
      if (back) { w.__switchBack = null; setTimeout(back, 0); }
      return r;
    };
  });
  for (const [a, b] of [['business', 'party'], ['sports', 'dinner']] as const) {
    await ready(page, `/?scene=${a}`);
    let first: unknown = null;
    for (let i = 0; i < 5; i++) {
      await page.evaluate(({ a, b }) => new Promise<void>((resolve) => {
        const sc = (window as any).__showcase;
        (window as any).__switchBack = () => { sc.setConfig({ category: a }); resolve(); };
        sc.setConfig({ category: b });
      }), { a, b });
      await expect.poll(() => resource(page), { timeout: 30_000 }).toBe('ready');
      await page.waitForTimeout(300);
      // The superseded scene's materials go once its compile settles: nothing accumulates.
      // (The first round trip may add a program: the studio sweep keeps a variant per lighting.)
      if (i === 0) first = await renderInfo(page);
      else expect(await renderInfo(page), `${a}↔${b} round trip ${i + 1}`).toEqual(first);
    }
  }
  expect(warnings.filter((w) => /WebGL|GL_/.test(w))).toEqual([]);
});

test('the first switch to Low waits for no program link on the main thread', async ({ page }) => {
  await page.addInitScript(() => {
    // A LINK_STATUS query on a program whose parallel compile has not reported completion
    // blocks the main thread until the link finishes.
    const w = window as any;
    const P = WebGL2RenderingContext.prototype;
    const done = new WeakSet<WebGLProgram>();
    w.__blockingLinkWaits = 0;
    const get = P.getProgramParameter;
    P.getProgramParameter = function (program: WebGLProgram, pname: number) {
      const value = get.call(this, program, pname);
      if (pname === 0x91b1 /* COMPLETION_STATUS_KHR */ && value) done.add(program);
      if (pname === this.LINK_STATUS && !done.has(program)) w.__blockingLinkWaits++;
      return value;
    };
  });
  for (const scene of ['business', 'party']) {
    await ready(page, `/?scene=${scene}`);
    await page.waitForTimeout(1000);
    await page.evaluate(() => { (window as any).__blockingLinkWaits = 0; (window as any).__showcase.controller.setQualityTier('low'); });
    await page.waitForTimeout(1500);
    const s = await state(page);
    expect(s.tier).toBe('low');
    expect(s.resource).toBe('ready');
    expect(await page.evaluate(() => (window as any).__blockingLinkWaits), scene).toBe(0);
  }
});

test('the environment map keeps no depth renderbuffer once generated', async ({ page }) => {
  await page.addInitScript(() => {
    const P = WebGL2RenderingContext.prototype;
    const live = new Map<WebGLRenderbuffer | null, string>();
    (window as any).__renderbuffers = live;
    let bound: WebGLRenderbuffer | null = null;
    const bind = P.bindRenderbuffer;
    P.bindRenderbuffer = function (t, rb) { bound = rb; return bind.call(this, t, rb); };
    const storage = P.renderbufferStorage;
    P.renderbufferStorage = function (t, f, w, h) { live.set(bound, `${f.toString(16)} ${w}×${h}`); return storage.call(this, t, f, w, h); };
    const del = P.deleteRenderbuffer;
    P.deleteRenderbuffer = function (rb) { live.delete(rb); return del.call(this, rb); };
  });
  await ready(page, '/?scene=business');
  expect(await page.evaluate(() => [...(window as any).__renderbuffers.values()])).toEqual([]);
});
