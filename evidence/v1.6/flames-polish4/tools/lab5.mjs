// Judge harness: the real controller on a fake clock, with a zoom hook on the live stage.
import { chromium } from '/Users/suryanewa/Developer/projects/livetime-invitations/.claude/worktrees/v16-flames5/node_modules/playwright-core/index.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
export const BASE = process.env.BASE ?? 'http://127.0.0.1:5614';
export async function launch() {
  return chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
}
export async function open(browser, { w = 1200, h = 1000, dpr = 1, reduced = false } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.clock.install();
  await page.goto(`${BASE}/?scene=birthday`);
  const call = (fn, arg) => page.evaluate(([f, a]) => new Function('s', 'a', `return (${f})(s, a)`)(window.__showcase, a), [fn, arg]);
  for (let i = 0; i < 400; i++) { if ((await call('(s) => s.state?.resource')) === 'ready') break; await page.clock.runFor(50); await page.waitForTimeout(10); }
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.clock.runFor(1000);
  // Hook: capture the stage instance; a zoom crop (window.__zoom = {z, cx, cy}) on any render.
  await page.evaluate(async () => {
    // Resolve the module URLs the app actually loaded (Vite appends ?t= after HMR).
    const src = async (u) => (await fetch(u)).text();
    const pick = (code, re) => (code.match(re) ?? [])[1];
    const mainU = [...document.scripts].map((s) => s.src).find((u) => u.includes('/src/demo/main.ts'));
    const ctrlU = pick(await src(mainU), /from "(\/src\/core\/controller\.ts[^"]*)"/);
    const stageU = pick(await src(ctrlU), /from "(\/src\/render\/stage\.ts[^"]*)"/);
    const stageCode = await src(stageU);
    const hazeU = pick(stageCode, /from "(\/src\/render\/heatHaze\.ts[^"]*)"/);
    window.__mods = { stageU, hazeU, bloomU: pick(stageCode, /from "(\/src\/render\/bloom\.ts[^"]*)"/) };
    const { Stage } = await import(stageU);
    try {
      const bs = await import('/src/scenes/birthday/index.ts');
      const ob = bs.BirthdayScene.prototype.beforeRender;
      bs.BirthdayScene.prototype.beforeRender = function () { window.__bsc = this; window.__smokeT = this.frame?.smokeTime; return ob.call(this); };
    } catch (e) { console.error('scene hook', e.message); }
    const hz = await import(hazeU);
    window.__haze = (on) => { hz.hazeTooling.enabled = on; };
    const orig = Stage.prototype.render;
    Stage.prototype.render = function () {
      window.__stage = this;
      const c = this.camera;
      // Flame anchors in 0..1 of the current (unzoomed) view.
      const out = [], up = [];
      this.scene.updateMatrixWorld(true);
      for (let i = 1; i <= 6; i++) {
        const n = this.scene.getObjectByName(`flame_0${i}`);
        if (!n) continue;
        const p = n.getWorldPosition(new n.position.constructor()).project(c);
        out.push([(p.x + 1) / 2, (1 - p.y) / 2]);
        const q = n.getWorldPosition(new n.position.constructor()); q.y += 0.5; q.project(c);
        up.push([(q.x + 1) / 2, (1 - q.y) / 2]);
      }
      window.__flames = out; window.__flamesUp = up;
      if (window.__bloomK !== undefined) this.bloom.strength = window.__bloomK;
      if (window.__noLight) {
        const props = this.renderer.properties;
        this.scene.traverse((o) => {
          const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
          for (const m of ms) if (m.userData?.flameLight) { const u = props.get(m).uniforms; if (u?.uFlameI) u.uFlameI.value.fill(0); }
        });
      }
      const hid = [];
      if (window.__noSmoke) this.scene.traverse((o) => { if (o.name && o.name.startsWith('fx_smoke') && o.visible) { o.visible = false; hid.push(o); } });
      if (window.__noRibbon) this.scene.traverse((o) => { if (o.name === 'fx_smoke' && o.visible) { o.visible = false; hid.push(o); } });
      if (window.__noVolume) this.scene.traverse((o) => { if (o.name === 'fx_smoke_volume_box' && o.visible) { o.visible = false; hid.push(o); } });
      const zm = window.__zoom;
      if (zm && c.view && zm.z > 1) {
        const v = { ...c.view };
        const px = v.offsetX + zm.cx * v.width, py = v.offsetY + zm.cy * v.height;
        c.view.fullWidth = v.fullWidth * zm.z; c.view.fullHeight = v.fullHeight * zm.z;
        c.view.offsetX = px * zm.z - v.width / 2; c.view.offsetY = py * zm.z - v.height / 2;
        c.updateProjectionMatrix();
        orig.call(this);
        Object.assign(c.view, v);
        c.updateProjectionMatrix();
      } else orig.call(this);
      for (const o of hid) o.visible = true;
    };
  });
  return { page, call };
}
export async function save(path, url) {
  await writeFile(path, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
}
export { mkdir };
