// Judge renders for the v1.6 cake (read-only). Adapted from scripts/cake-evidence.ts: renders through the live
// stage (Stage.render: depth, bloom, haze) from any camera. Usage: node judge.mjs <sizes|macros|cocoa-sizes|cocoa-macros|probes> [only=a,b]
import { chromium } from '/Users/suryanewa/Developer/projects/livetime-invitations/.claude/worktrees/v16-cake4/node_modules/playwright-core/index.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const base = 'http://127.0.0.1:5611';
const OUT = process.env.OUT ?? join(import.meta.dirname, 'raw');
await mkdir(OUT, { recursive: true });
const what = process.argv[2];
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
const t0 = Date.now();
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const save = (file, url) => writeFile(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

async function open(page, preset) {
  page.on('pageerror', (e) => console.error('[pageerror]', String(e)));
  await page.goto(`${base}/?scene=birthday${preset === 'cocoa' ? '&cake=cocoa' : ''}`);
  if (process.env.NOSHADOW) await page.evaluate(() => { window.__noshadow = true; });
  await page.evaluate(async () => {
    let url = '/src/render/stage.ts';
    for (let i = 0; i < 200; i++) { const e = performance.getEntriesByType('resource').map((x) => x.name).find((n) => n.includes('/src/render/stage.ts')); if (e) { url = e; break; } await new Promise((r) => setTimeout(r, 25)); }
    const m = await import(url);
    const proto = m.Stage.prototype; const orig = proto.render;
    proto.render = function () { window.__stage = this;
      if (window.__cream) this.scene.traverse((o) => { for (const mt of [].concat(o.material ?? [])) { const u = mt.userData?.cakeUniforms?.uPoolColor; if (u) u.value.setRGB(...window.__cream); } });
      if (window.__ringsReq) { window.__ringsReq = false; const st = this; let A, B, R, T;
        st.scene.traverse((o) => { for (const mt of [].concat(o.material ?? [])) { const u = mt.userData?.cakeUniforms; if (u?.uPoolA && !A) { A = u.uPoolA.value; B = u.uPoolB.value; R = u.uPoolR.value; T = u.uPoolTier.value; } } });
        const W = st.renderer.domElement.width, H = st.renderer.domElement.height; const V = st.camera.position.constructor;
        const P = (x, y, z) => { const p = new V(x, y, z).project(st.camera); return [(p.x * 0.5 + 0.5) * W, (-p.y * 0.5 + 0.5) * H]; };
        const topO = (rr) => Array.from({ length: 72 }, (_, k) => { const t = (k / 72) * 2 * Math.PI; return P(T.x + rr * Math.cos(t), T.z, T.y + rr * Math.sin(t)); });
        window.__ringsOut = { R: [R.x, R.y], tier: [T.x, T.y, T.z, T.w], W, H, top: topO(T.w - 0.06), cands: A.map((a, i) => ({ base: P(a.x, T.z, a.z), tip: P(B[i].x, B[i].y + 0.03, B[i].z), a: [a.x, a.y, a.z], b: [B[i].x, B[i].y, B[i].z],
          rings: [0.5, 1, 1.5, 2, 2.5, 3, 4, 5].map((cm) => ({ cm, pts: Array.from({ length: 36 }, (_, k) => { const r = R.x + cm * 0.05, t = (k / 36) * 2 * Math.PI; return P(a.x + r * Math.cos(t), T.z, a.z + r * Math.sin(t)); }) })) })) }; }
      if (window.__noshadow) this.scene.traverse((o) => { for (const mt of [].concat(o.material ?? [])) { const u = mt.userData?.cakeUniforms?.uPoolB; if (u && !u.__ns) { u.value = u.value.map((v) => v.clone().setY(-100)); u.__ns = true; window.__nsCount = (window.__nsCount ?? 0) + 1; } } });
      return orig.call(this); };
  });
  const call = (fn) => page.evaluate((f) => new Function('s', `return (${f})(s)`)(window.__showcase), fn);
  for (let i = 0; i < 600; i++) { const r = await call('(s) => s.state?.resource'); if (r === 'ready') break; if (r === 'fallback') throw new Error('fallback'); await page.waitForTimeout(25); }
  if (preset === 'cocoa') await call('(s) => s.setConfig({ category: "birthday", cake: "cocoa" })');
  if (process.env.CREAM) await page.evaluate((c) => { window.__cream = c.split(',').map(Number); }, process.env.CREAM);
  return { call };
}

async function noshadow(page) {
  if (!process.env.NOSHADOW) return;
  const r = await page.evaluate(() => { const done = new Set(); let n = 0, mats = 0; window.__stage.scene.traverse((o) => { for (const mt of [].concat(o.material ?? [])) { const u = mt.userData?.cakeUniforms?.uPoolB; if (u) mats++; if (u && !done.has(u)) { done.add(u); u.value = u.value.map((v) => v.clone().setY(-100)); n++; } } }); return [n, mats]; });
  console.log('candle shadows off: uniforms', r[0], 'materials', r[1]);
}
async function macro(page, m, file) {
  await noshadow(page);
  const url = await page.evaluate(([m, nopool]) => {
    const st = window.__stage;
    const pools = []; if (nopool) st.scene.traverse((o) => { for (const mt of [].concat(o.material ?? [])) { const u = mt.userData?.cakeUniforms?.uPoolI; if (u && !pools.includes(u)) pools.push(u); } });
    const saved = pools.map((u) => u.value); for (const u of pools) u.value = u.value.map(() => 0); const cam = st.camera; const r = st.renderer;
    const prev = { pos: cam.position.clone(), q: cam.quaternion.clone(), near: cam.near, far: cam.far, fov: cam.fov, aspect: cam.aspect, w: st.cssWidth, h: st.cssHeight, cap: st.dprCap, view: cam.view ? { ...cam.view } : null };
    cam.clearViewOffset();
    const az = (m.az * Math.PI) / 180, el = (m.el * Math.PI) / 180;
    const fov = m.fov ?? 18;
    const d = m.width / 2 / Math.tan(((fov / 2) * Math.PI) / 180);
    cam.fov = fov; cam.aspect = (m.w ?? 1) / (m.h ?? 1);
    cam.near = Math.max(0.01, d * 0.2); cam.far = d * 20 + 10;
    cam.position.set(m.at[0] + d * Math.sin(az) * Math.cos(el), m.at[1] + d * Math.sin(el), m.at[2] + d * Math.cos(az) * Math.cos(el));
    cam.lookAt(m.at[0], m.at[1], m.at[2]);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    const size = m.size ?? 1200;
    r.setPixelRatio(1);
    r.setSize(Math.round(size * (m.w ?? 1)), Math.round(size * (m.h ?? 1)), false);
    r.shadowMap.needsUpdate = true;
    st.render();
    const data = r.domElement.toDataURL('image/png');
    pools.forEach((u, i) => { u.value = saved[i]; }); if (nopool) console.log('pools zeroed', pools.length);
    cam.position.copy(prev.pos); cam.quaternion.copy(prev.q); cam.near = prev.near; cam.far = prev.far; cam.fov = prev.fov; cam.aspect = prev.aspect;
    if (prev.view) cam.setViewOffset(prev.view.fullWidth, prev.view.fullHeight, prev.view.offsetX, prev.view.offsetY, prev.view.width, prev.view.height);
    cam.updateProjectionMatrix();
    st.resize(prev.w, prev.h, prev.cap);
    return data;
  }, [m, !!process.env.NOPOOL]);
  await save(file, url);
}

const CAM_AZ = 18;
const onSide = (r, y, az = CAM_AZ) => [r * Math.sin((az * Math.PI) / 180), y, r * Math.cos((az * Math.PI) / 180)];
const MACROS = [
  { name: 'hero-close', at: [0, 1.25, 0], az: CAM_AZ, el: 19, width: 1.65 },
  { name: 'front-side', at: onSide(0.6, 1.24, 18), az: 18, el: 12, width: 0.62 },
  { name: 'swag-wide', at: onSide(0.62, 1.0, 26), az: 26, el: 10, width: 0.3 },
  { name: 'swag-z', at: onSide(0.635, 0.99, 24), az: 24, el: 6, width: 0.1 },
  { name: 'swag-top', at: onSide(0.49, 1.52, 22), az: 22, el: 10, width: 0.3 },
  { name: 'rosette-z', at: onSide(0.64, 1.236, 5), az: 5, el: 16, width: 0.11 },
  { name: 'rosette-side3q', at: onSide(0.64, 1.236, 5), az: 45, el: 10, width: 0.13 },
  { name: 'crown-z', at: onSide(0.44, 1.715, 2), az: 2, el: 24, width: 0.12 },
  { name: 'crown-row', at: onSide(0.44, 1.72, 22), az: 22, el: 30, width: 0.3 },
  { name: 'shells-z', at: onSide(0.64, 0.80, 20), az: 20, el: 14, width: 0.16 },
  { name: 'shells-wide', at: onSide(0.64, 0.80, 20), az: 20, el: 14, width: 0.36 },
  { name: 'top-edge', at: onSide(0.45, 1.70, 8), az: 8, el: 9, width: 0.36 },
  { name: 'body-lower-z', at: onSide(0.632, 1.06, 30), az: 30, el: 8, width: 0.12 },
  { name: 'body-upper-z', at: onSide(0.49, 1.36, 34), az: 34, el: 8, width: 0.12 },
  { name: 'base', at: onSide(0.66, 0.79, 14), az: 14, el: 10, width: 0.36 },
  { name: 'smear-z', at: onSide(0.68, 0.776, 52), az: 52, el: 26, width: 0.14 },
  { name: 'sockets-front', at: [-0.03, 1.68, 0.2], az: CAM_AZ, el: 34, width: 0.5 },
  { name: 'socket-z', at: [-0.132, 1.665, 0.284], az: CAM_AZ, el: 30, width: 0.11 },
  { name: 'top-surface', at: [0.0, 1.70, 0.05], az: CAM_AZ, el: 55, width: 0.8 },
  { name: 'far-edge', at: [-0.1, 1.72, -0.4], az: CAM_AZ, el: 22, width: 0.45 },
  { name: 'graze-side', at: onSide(0.62, 1.0, 70), az: 70, el: 6, width: 0.6 },
  { name: 'rear', at: [0, 1.25, 0], az: 200, el: 15, width: 1.65 },
  { name: 'dot-zz', at: onSide(0.49, 1.36, 34), az: 34, el: 8, width: 0.035 },
  { name: 'rosette-edge', at: onSide(0.66, 1.24, -66), az: 18, el: 14, width: 0.22 },
];
const COCOA = ['hero-close', 'front-side', 'swag-z', 'rosette-z', 'crown-z', 'shells-z', 'top-edge', 'body-lower-z', 'base', 'socket-z', 'far-edge'];

async function sizes(preset) {
  { // square 540 @1 and @2 (the embed still)
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const { call } = await open(page, preset);
    await call('(s) => s.controller.setReducedMotion(true)');
    await call('(s) => s.controller.setMode("guest")');
    await page.waitForTimeout(700);
    if (process.env.NOPOOL) { for (let k = 0; k < 20 && !(await page.evaluate(() => !!window.__stage)); k++) { await page.setViewportSize({ width: 1200, height: 1000 + (k % 2) }); await page.waitForTimeout(100); }
      await page.evaluate(() => { const st = window.__stage; const snap = st.snapshot; st.snapshot = function (...a) { st.scene.traverse((o) => { for (const mt of [].concat(o.material ?? [])) { const u = mt.userData?.cakeUniforms?.uPoolI; if (u) u.value.fill?.(0) ?? u.value.forEach((_, i) => { u.value[i] = 0; }); } }); return snap.apply(this, a); }; }); }
    if (process.env.NOSHADOW) { for (let k = 0; k < 20 && !(await page.evaluate(() => !!window.__stage)); k++) { await page.setViewportSize({ width: 1200, height: 1000 + (k % 2) }); await page.waitForTimeout(100); } await noshadow(page);
      await page.evaluate(() => { const st = window.__stage; const snap = st.snapshot; st.snapshot = function (...a) { st.scene.traverse((o) => { for (const mt of [].concat(o.material ?? [])) { const u = mt.userData?.cakeUniforms?.uPoolB; if (u) for (const v of u.value) v.y = -100; } }); return snap.apply(this, a); }; }); }
    await save(join(OUT, `${preset}-square540@1.png`), await call('(s) => s.controller.captureStill(540, 1)'));
    await page.evaluate(() => { window.__ringsReq = true; });
    await save(join(OUT, `${preset}-square540@2.png`), await call('(s) => s.controller.captureStill(540, 2)'));
    await writeFile(join(OUT, `${preset}-square540@2-rings.json`), JSON.stringify(await page.evaluate(() => window.__ringsOut)));
    await page.close(); log(preset, 'square');
  }
  for (const [name, w, h, dsf] of [['laptop', 1280, 720, 2], ['phone', 390, 844, 3]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, reducedMotion: 'reduce' });
    const { call } = await open(page, preset);
    await call('(s) => s.controller.setMode("guest")');
    await page.waitForTimeout(600);
    for (let k = 0; k < 20 && !(await page.evaluate(() => !!window.__stage)); k++) { await page.setViewportSize({ width: w, height: h + (k % 2 ? 0 : 1) }); await page.waitForTimeout(150); }
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(900);
    const file = join(OUT, `${preset}-${name}.png`);
    if (process.env.NOSHADOW) await noshadow(page);
    if (process.env.NOSHADOW || process.env.NOPOOL) {
      const shot = await page.evaluate((nopool) => { const st = window.__stage; const pools = []; if (nopool) st.scene.traverse((o) => { for (const mt of [].concat(o.material ?? [])) { const u = mt.userData?.cakeUniforms?.uPoolI; if (u && !pools.includes(u)) pools.push(u); } });
        for (const u of pools) u.value = u.value.map(() => 0); st.renderer.shadowMap.needsUpdate = true; st.render(); return st.renderer.domElement.toDataURL('image/png'); }, !!process.env.NOPOOL);
      await save(file.replace('.png', '-canvas.png'), shot);
    }
    await page.screenshot({ path: file });
    const box = await page.evaluate(() => {
      const st = window.__stage; const c = st.renderer.domElement.getBoundingClientRect(); const v = st.camera.position;
      const P = (x, y, z) => { const p = new v.constructor(x, y, z).project(st.camera); return [c.left + (p.x * 0.5 + 0.5) * c.width, c.top + (-p.y * 0.5 + 0.5) * c.height]; };
      const a = P(-0.8, 1.95, 0), b = P(0.8, 0.72, 0);
      return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
    });
    execFileSync('magick', [file, '-crop', `${Math.round(box.w * dsf)}x${Math.round(box.h * dsf)}+${Math.round(box.x * dsf)}+${Math.round(box.y * dsf)}`, '+repage', join(OUT, `${preset}-${name}-crop.png`)]);
    console.log(name, JSON.stringify(box));
    const rj = await page.evaluate(([dsf, ox, oy]) => { const st = window.__stage; const c = st.renderer.domElement.getBoundingClientRect(); window.__ringsReq = true; const saved = []; 
      if (window.__nopoolLive) st.scene.traverse((o) => { for (const mt of [].concat(o.material ?? [])) { const u = mt.userData?.cakeUniforms?.uPoolI; if (u) u.value = u.value.map(() => 0); } });
      st.render(); const r = window.__ringsOut; const sx = c.width * dsf / r.W, sy = c.height * dsf / r.H;
      r.top = r.top.map(([x, y]) => [x * sx + c.left * dsf - ox, y * sy + c.top * dsf - oy]);
      for (const cd of r.cands) { cd.base = [cd.base[0] * sx + c.left * dsf - ox, cd.base[1] * sy + c.top * dsf - oy]; cd.tip = [cd.tip[0] * sx + c.left * dsf - ox, cd.tip[1] * sy + c.top * dsf - oy]; for (const g of cd.rings) g.pts = g.pts.map(([x, y]) => [x * sx + c.left * dsf - ox, y * sy + c.top * dsf - oy]); } return r; }, [dsf, Math.round(box.x * dsf), Math.round(box.y * dsf)]);
    await writeFile(join(OUT, `${preset}-${name}-rings.json`), JSON.stringify(rj));
    await page.close(); log(preset, name);
  }
}

async function macros(preset, list) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await open(page, preset);
  await page.evaluate(() => { const s = window.__showcase; s.controller.setReducedMotion(true); s.controller.setMode('guest'); });
  await page.waitForTimeout(900);
  for (const m of MACROS) {
    if (list && !list.includes(m.name)) continue;
    if (only && !only.has(m.name)) continue;
    await macro(page, m, join(OUT, `${preset}-m-${m.name}.png`));
    log(preset, m.name);
  }
  await page.close();
}

// Lighting probes (in-page only, nothing saved to the repo): the production hero framing at macro scale under
// (a) the rig as is, (b) + a soft fill from camera-right, (c) + a rim from behind-right, (d) flames hidden.
async function probes() {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await open(page, 'vanilla');
  await page.evaluate(() => { const s = window.__showcase; s.controller.setReducedMotion(true); s.controller.setMode('guest'); });
  await page.waitForTimeout(900);
  const lights = await page.evaluate(() => { const out = []; window.__stage.scene.traverse((o) => { if (o.isLight) out.push({ type: o.type, name: o.name, i: o.intensity, pos: o.position.toArray(), castShadow: o.castShadow, mapSize: o.shadow?.mapSize?.toArray?.(), radius: o.shadow?.radius, bias: o.shadow?.bias }); }); return out; });
  console.log(JSON.stringify(lights));
  const views = [MACROS.find((m) => m.name === 'front-side'), MACROS.find((m) => m.name === 'hero-close')];
  const setups = {
    rig: () => {},
    fill: () => { const st = window.__stage; let key; st.scene.traverse((o) => { if (o.isSpotLight && !key) key = o; }); const f = new key.constructor('#fff4ea', key.intensity * 0.35); f.angle = 0.9; f.penumbra = 1; f.castShadow = false; f.position.set(9, 4, 6); f.target.position.set(0, 1.2, 0); f.name = '__probe'; st.scene.add(f, f.target); },
    rim: () => { const st = window.__stage; let key; st.scene.traverse((o) => { if (o.isSpotLight && !key) key = o; }); const f = new key.constructor('#fff8f0', key.intensity * 0.9); f.angle = 0.5; f.penumbra = 1; f.castShadow = false; f.position.set(5, 6, -9); f.target.position.set(0, 1.2, 0); f.name = '__probe'; st.scene.add(f, f.target); },
    noflame: () => { const st = window.__stage; st.scene.traverse((o) => { if (/^flame_\d+_fx/.test(o.name)) o.visible = false; }); },
  };
  for (const [k, fn] of Object.entries(setups)) {
    await page.evaluate(`(${fn.toString()})()`);
    for (const v of views) await macro(page, v, join(OUT, `probe-${k}-${v.name}.png`));
    await page.evaluate(() => { const st = window.__stage; const rm = []; st.scene.traverse((o) => { if (o.name === '__probe') rm.push(o); }); for (const o of rm) { st.scene.remove(o); if (o.target) st.scene.remove(o.target); } st.scene.traverse((o) => { if (/^flame_\d+_fx/.test(o.name)) o.visible = true; }); });
    log('probe', k);
  }
  await page.close();
}

async function rings(name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await open(page, 'vanilla');
  await page.evaluate(() => { const s = window.__showcase; s.controller.setReducedMotion(true); s.controller.setMode('guest'); });
  await page.waitForTimeout(600);
  const m = MACROS.find((x) => x.name === name);
  const out = await page.evaluate((m) => {
    const st = window.__stage; let A, B, R, T;
    st.scene.traverse((o) => { for (const mt of [].concat(o.material ?? [])) { const u = mt.userData?.cakeUniforms; if (u?.uPoolA && !A) { A = u.uPoolA.value; B = u.uPoolB.value; R = u.uPoolR.value; T = u.uPoolTier.value; } } });
    const cam = st.camera.clone(); cam.clearViewOffset?.();
    const az = (m.az * Math.PI) / 180, el = (m.el * Math.PI) / 180, fov = m.fov ?? 18;
    const d = m.width / 2 / Math.tan(((fov / 2) * Math.PI) / 180);
    cam.fov = fov; cam.aspect = 1; cam.near = Math.max(0.01, d * 0.2); cam.far = d * 20 + 10;
    cam.position.set(m.at[0] + d * Math.sin(az) * Math.cos(el), m.at[1] + d * Math.sin(el), m.at[2] + d * Math.cos(az) * Math.cos(el));
    cam.lookAt(m.at[0], m.at[1], m.at[2]); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    const size = m.size ?? 1200; const V = cam.position.constructor;
    const P = (x, y, z) => { const p = new V(x, y, z).project(cam); return [(p.x * 0.5 + 0.5) * size, (-p.y * 0.5 + 0.5) * size]; };
    const cands = A.map((a, i) => ({ base: P(a.x, a.y, a.z), top: P(B[i].x, B[i].y, B[i].z), a: [a.x, a.y, a.z], b: [B[i].x, B[i].y, B[i].z],
      rings: [0.5, 1, 1.5, 2, 2.5, 3, 4, 5].map((cm) => ({ cm, pts: Array.from({ length: 36 }, (_, k) => { const r = R.x + cm * 0.05, t = (k / 36) * 2 * Math.PI; return P(a.x + r * Math.cos(t), T.z, a.z + r * Math.sin(t)); }) })) }));
    const top = Array.from({ length: 72 }, (_, k) => { const t = (k / 72) * 2 * Math.PI; return P(T.x + (T.w - 0.06) * Math.cos(t), T.z, T.y + (T.w - 0.06) * Math.sin(t)); });
    return { R: [R.x, R.y], tier: [T.x, T.y, T.z, T.w], cands, top, centre: P(T.x, T.z, T.y) };
  }, m);
  await writeFile(join(OUT, `rings-${name}.json`), JSON.stringify(out));
  console.log('candles', out.cands.length, 'R', out.R, 'tier', out.tier, 'centre px', out.centre.map((v) => v.toFixed(0)).join(','), out.cands.map((c) => c.base.map((v) => v.toFixed(0)).join(',')).join(' | '));
  await page.close();
}
if (what === 'rings') await rings(process.argv[3] ?? 'top-surface');
if (what === 'sizes') await sizes('vanilla');
if (what === 'cocoa-sizes') await sizes('cocoa');
if (what === 'macros') await macros('vanilla');
if (what === 'cocoa-macros') await macros('cocoa', COCOA);
if (what === 'probes') await probes();
if (what === 'cocoa-all') await macros('cocoa');
await browser.close();
log('done');
