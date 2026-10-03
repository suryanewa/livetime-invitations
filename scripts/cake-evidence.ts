/**
 * v1.6 cake evidence (docs/scenes/birthday-v1.6-cake.md): the Birthday cake at the showcase's real sizes
 * (square 540 @2×, laptop 1280 × 720 @2×, phone 390 × 844 @3×) and macro close-ups through the live
 * stage's own camera, lights and materials (frosting side, a swag, a rosette, the top edge, the base),
 * plus a host placement strip. PNGs in outputs/cake/<label>/ (git-ignored), WebP copies in
 * evidence/v1.6/cake/<label>/.
 *
 *   node --experimental-transform-types --no-warnings scripts/cake-evidence.ts <label> [baseUrl] [sizes,macros,strip,cocoa]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium, type Page } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const label = process.argv[2] ?? 'current';
const base = process.argv[3] ?? 'http://127.0.0.1:5601';
const what = new Set((process.argv[4] ?? 'sizes,macros,cocoa').split(','));
const raw = join(import.meta.dirname, '..', 'outputs', 'cake', label);
const out = join(import.meta.dirname, '..', 'evidence', 'v1.6', 'cake', label);
await mkdir(raw, { recursive: true });
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const save = (file: string, url: string) => writeFile(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));

async function open(page: Page, query = '', clock = false) {
  if (clock) await page.clock.install();
  page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
  page.on('pageerror', (e) => console.error('[pageerror]', String(e)));
  // Catch the live stage (dev tooling): the app's own Stage module, by the URL Vite serves it at.
  await page.goto(`${base}/?scene=birthday${query}`);
  await page.evaluate(async () => {
    const m = await import('/src/render/stage.ts' as string);
    const proto = m.Stage.prototype;
    const orig = proto.render;
    proto.render = function (this: unknown) { (window as any).__stage = this; return orig.call(this); };
  });
  const call = <T,>(fn: string) => page.evaluate((f) => new Function('s', `return (${f})(s)`)((window as any).__showcase), fn) as Promise<T>;
  for (let i = 0; i < 600; i++) {
    const res = await call<string>('(s) => s.state?.resource');
    if (res === 'ready') break;
    if (res === 'fallback') throw new Error('the scene fell back (a shader error?)');
    if (clock) await page.clock.runFor(50);
    await page.waitForTimeout(20);
  }
  return { call };
}

/** A macro: the live stage's camera moved to look at `at` (world) from azimuth/elevation (deg), `width` across. */
interface Macro { name: string; at: [number, number, number]; az: number; el: number; width: number; size?: number }

async function macro(page: Page, m: Macro, file: string) {
  const url = await page.evaluate((m) => {
    const st = (window as any).__stage;
    const cam = st.camera;
    const r = st.renderer;
    const prev = { pos: cam.position.clone(), q: cam.quaternion.clone(), near: cam.near, far: cam.far, fov: cam.fov, aspect: cam.aspect, w: st.cssWidth, h: st.cssHeight, cap: st.dprCap, view: cam.view ? { ...cam.view } : null };
    // The hero framing shifts the projection (setViewOffset); a macro looks straight at its subject.
    cam.clearViewOffset();
    const az = (m.az * Math.PI) / 180, el = (m.el * Math.PI) / 180;
    const fov = 18;
    const d = m.width / 2 / Math.tan(((fov / 2) * Math.PI) / 180);
    cam.fov = fov;
    cam.aspect = 1;
    cam.near = Math.max(0.01, d * 0.2);
    cam.far = d * 20 + 10;
    cam.position.set(m.at[0] + d * Math.sin(az) * Math.cos(el), m.at[1] + d * Math.sin(el), m.at[2] + d * Math.cos(az) * Math.cos(el));
    cam.lookAt(m.at[0], m.at[1], m.at[2]);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    const size = m.size ?? 1024;
    r.setPixelRatio(1);
    r.setSize(size, size, false);
    r.shadowMap.needsUpdate = true;
    r.render(st.scene, cam);
    const data = r.domElement.toDataURL('image/png');
    cam.position.copy(prev.pos); cam.quaternion.copy(prev.q); cam.near = prev.near; cam.far = prev.far; cam.fov = prev.fov; cam.aspect = prev.aspect;
    if (prev.view) cam.setViewOffset(prev.view.fullWidth, prev.view.fullHeight, prev.view.offsetX, prev.view.offsetY, prev.view.width, prev.view.height);
    cam.updateProjectionMatrix();
    st.resize(prev.w, prev.h, prev.cap);
    return data as string;
  }, m);
  await save(file, url);
}

/** Cake landmarks (world, birthday_root at the origin; cake_secondary at STAND_TOP ≈ 0.7657). */
const CAM_AZ = 20;
const onSide = (r: number, y: number, az = CAM_AZ): [number, number, number] => [r * Math.sin((az * Math.PI) / 180), y, r * Math.cos((az * Math.PI) / 180)];
const MACROS: Macro[] = [
  { name: 'hero-close', at: [0, 1.32, 0], az: CAM_AZ, el: 15, width: 1.7 },
  { name: 'side-bottom', at: onSide(0.63, 1.02, 34), az: 34, el: 8, width: 0.34 },
  { name: 'swag-top', at: onSide(0.49, 1.52, 22), az: 22, el: 10, width: 0.32 },
  { name: 'rosette-crown', at: onSide(0.44, 1.72, 26), az: 26, el: 32, width: 0.26 },
  { name: 'top-edge', at: onSide(0.45, 1.70, 8), az: 8, el: 9, width: 0.36 },
  { name: 'top-surface', at: [0.05, 1.71, 0.12], az: CAM_AZ, el: 38, width: 0.7 },
  { name: 'base', at: onSide(0.66, 0.79, 14), az: 14, el: 10, width: 0.36 },
  { name: 'graze-side', at: onSide(0.62, 1.0, 70), az: 70, el: 6, width: 0.6 },
  // Single pieces, a few centimetres across (the bottom tier, facing the lens).
  { name: 'z-shells', at: onSide(0.64, 0.80, 20), az: 20, el: 14, width: 0.16 },
  { name: 'z-dot', at: onSide(0.627, 1.192, 18), az: 18, el: 8, width: 0.06 },
  { name: 'z-rosette', at: onSide(0.64, 1.236, 5), az: 5, el: 16, width: 0.11 },
  { name: 'z-swag', at: onSide(0.635, 0.99, 24), az: 24, el: 6, width: 0.1 },
  { name: 'z-rope', at: onSide(0.615, 1.245, 18), az: 18, el: 22, width: 0.07 },
  { name: 'z-crown', at: onSide(0.44, 1.715, 2), az: 2, el: 24, width: 0.12 },
  { name: 'z-smear', at: onSide(0.68, 0.776, 52), az: 52, el: 26, width: 0.14 },
];

async function sizes(preset: 'vanilla' | 'cocoa') {
  const q = preset === 'cocoa' ? '&cake=cocoa' : '';
  // Square 540 @2× (the embed), at guest-ready.
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const { call } = await open(page, q);
    if (preset === 'cocoa') await call('(s) => s.setConfig({ category: "birthday", cake: "cocoa" })');
    await call('(s) => s.controller.setReducedMotion(true)');
    await call('(s) => s.controller.setMode("guest")');
    await page.waitForTimeout(600);
    await save(join(raw, `${preset}-square540.png`), await call<string>('(s) => s.controller.captureStill(540, 2)'));
    await page.close();
  }
  for (const [name, w, h, dsf] of [['laptop', 1280, 720, 2], ['phone', 390, 844, 3]] as const) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, reducedMotion: 'reduce' });
    const { call } = await open(page, q);
    if (preset === 'cocoa') await call('(s) => s.setConfig({ category: "birthday", cake: "cocoa" })');
    await call('(s) => s.controller.setMode("guest")');
    await page.waitForTimeout(900);
    const file = join(raw, `${preset}-${name}.png`);
    await page.screenshot({ path: file });
    // The cake at 1:1 device pixels (where a viewer's eye judges it).
    const box = await page.evaluate(() => {
      const st = (window as any).__stage;
      const c = st.renderer.domElement.getBoundingClientRect();
      const v = st.camera.position.clone();
      const P = (x: number, y: number, z: number) => { const p = new (v.constructor)(x, y, z).project(st.camera); return [c.left + (p.x * 0.5 + 0.5) * c.width, c.top + (-p.y * 0.5 + 0.5) * c.height]; };
      const a = P(-0.8, 1.95, 0), b = P(0.8, 0.72, 0);
      return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
    });
    execFileSync('magick', [file, '-crop', `${Math.round(box.w * dsf)}x${Math.round(box.h * dsf)}+${Math.round(box.x * dsf)}+${Math.round(box.y * dsf)}`, '+repage', join(raw, `${preset}-${name}-crop.png`)]);
    await page.close();
  }
}

async function macros(preset: 'vanilla' | 'cocoa') {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const { call } = await open(page, preset === 'cocoa' ? '&cake=cocoa' : '');
  if (preset === 'cocoa') await call('(s) => s.setConfig({ category: "birthday", cake: "cocoa" })');
  await call('(s) => s.controller.setReducedMotion(true)');
  await call('(s) => s.controller.setMode("guest")');
  await page.waitForTimeout(800);
  for (const m of MACROS) await macro(page, m, join(raw, `${preset}-macro-${m.name}.png`));
  await page.close();
}

/** The host's placement: the candles going in (the collars and dimples), 60 fps on the fake clock. */
async function strip() {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 });
  const { call } = await open(page, '', true);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await call('(s) => s.controller.setReducedMotion(false)');
  await call('(s) => { s.controller.setMode("host"); s.controller.resetVisual(); }');
  await page.clock.runFor(300);
  await call('(s) => s.controller.prepareHost()');
  const dir = join(raw, 'placement');
  await mkdir(dir, { recursive: true });
  for (let i = 0; i <= 160; i++) {
    if (i % 8 === 0) await macro(page, { name: 'p', at: [0.0, 1.74, 0.05], az: CAM_AZ, el: 30, width: 0.8, size: 540 }, join(dir, `f${String(i / 8).padStart(4, '0')}.png`));
    await page.clock.runFor(16);
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(dir, 'f%04d.png'), '-vf', 'scale=270:-1,tile=7x3:padding=4:color=white', '-frames:v', '1', '-update', '1', join(raw, 'placement-strip.png')]);
  await page.close();
}

if (what.has('sizes')) await sizes('vanilla');
if (what.has('macros')) await macros('vanilla');
if (what.has('cocoa')) { await sizes('cocoa'); await macros('cocoa'); }
if (what.has('strip')) await strip();
await browser.close();
for (const f of readdirSync(raw).filter((x) => x.endsWith('.png'))) execFileSync('cwebp', ['-quiet', '-q', '88', join(raw, f), '-o', join(out, f.replace(/\.png$/, '.webp'))]);
console.log(`frames: ${raw}\nwebp: ${out}`);
