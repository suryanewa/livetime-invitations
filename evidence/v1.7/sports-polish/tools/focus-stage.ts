/** The push-in on the real stage: per 16 ms frame of the decline (fake clock), the focus channel, the ball's and the base's place in CSS px. VIEW=laptop|phone. */
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
const HASH = JSON.parse(readFileSync('node_modules/.vite/deps/_metadata.json', 'utf8')).browserHash as string;
const view = process.env.VIEW ?? 'laptop';
const vp = view === 'phone' ? { width: 390, height: 844, dpr: 3 } : { width: 1280, height: 720, dpr: 2 };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.clock.install();
await page.goto(`${process.env.BASE ?? 'http://127.0.0.1:5705'}/?scene=sports`);
const call = <T,>(fn: string) => page.evaluate((f) => new Function('s', `return (${f})(s)`)((window as any).__showcase), fn) as Promise<T>;
const tick = (ms: number) => page.clock.runFor(ms);
for (let i = 0; i < 400; i++) { if ((await call<string>('(s) => s.state?.resource')) === 'ready') break; await tick(50); await page.waitForTimeout(10); }
await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
await tick(1000);
await page.evaluate(async (hash) => {
  const THREE = await import(`/node_modules/.vite/deps/three.js?v=${hash}`);
  const w = window as any;
  w.__T = THREE;
  w.__last = { canvas: document.querySelector('[data-bind="stage"] canvas') };
  const o1 = THREE.Object3D.prototype.updateMatrixWorld;
  THREE.Object3D.prototype.updateMatrixWorld = function (this: any, force?: boolean) { if (this.isScene && this.getObjectByName('hoop_root')) w.__last.scene = this; return o1.call(this, force); };
  const o2 = THREE.PerspectiveCamera.prototype.updateMatrixWorld;
  THREE.PerspectiveCamera.prototype.updateMatrixWorld = function (this: any, force?: boolean) { if (this.fov === 18) w.__last.camera = this; return o2.call(this, force); };
}, HASH);
await call('(s) => s.controller.setReducedMotion(false)');
await call('(s) => s.controller.setMode("guest")');
await tick(300);
const seq = process.env.SEQ ?? 'decline';
await call(`(s) => s.controller.chooseResponse("${seq}")`);
const change = process.env.CHANGE?.split(':');
const rows: string[] = ['t,focus,ballL,ballR,ballT,ballB,baseTop,poleCutCm,boardTop,frameBottom,visibleBottom'];
const total = Math.round((Number(process.env.SECONDS ?? 2.6) * 1000) / 16);
for (let i = 1; i <= total; i++) {
  await tick(16);
  if (change && i === Math.round((Number(change[0]) * 1000) / 16)) await call(`(s) => s.controller.chooseResponse("${change[1]}")`);
  const r = await page.evaluate(() => {
    const w = window as any, T = w.__T, { scene, camera, canvas } = w.__last;
    scene.updateMatrixWorld(true);
    const hoop = scene.getObjectByName('hoop_root'), ball = scene.getObjectByName('ball_authored');
    const css = (p: any) => { const q = p.clone().project(camera); return [((q.x + 1) / 2) * canvas.clientWidth, ((1 - q.y) / 2) * canvas.clientHeight]; };
    const b = ball.getWorldPosition(new T.Vector3());
    const R = 0.25 * scene.getObjectByName('sports_root').scale.x;
    let l = Infinity, rr = -Infinity, t = Infinity, bb = -Infinity;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { const q = css(b.clone().add(new T.Vector3(dx * R, dy * R, dz * R))); l = Math.min(l, q[0]); rr = Math.max(rr, q[0]); t = Math.min(t, q[1]); bb = Math.max(bb, q[1]); }
    // The base: its highest drawn point (min CSS y) over its geometry (the stand mesh below the cut).
    const stand = scene.getObjectByName('hoop_stand'), hw = scene.getObjectByName('hoop_hardware');
    let baseTop = Infinity;
    for (const m of [stand, hw]) { const pos = m.geometry.getAttribute('position'), idx = m.geometry.index; const v = new T.Vector3(); for (let k = 0; k < idx.count; k += 7) { v.fromBufferAttribute(pos, idx.getX(k)); m.localToWorld(v); baseTop = Math.min(baseTop, css(v)[1]); } }
    // Where the visible bottom crosses the pole (cm above the floor), by bisection on its axis.
    const pole = scene.getObjectByName('hoop_pole'); const pb = new T.Box3().setFromObject(pole);
    const board = new T.Box3().setFromObject(scene.getObjectByName('backboard'));
    const boardTop = css(new T.Vector3((board.min.x + board.max.x) / 2, board.max.y, board.max.z))[1];
    return { ball: [l, rr, t, bb], baseTop, poleY: [pb.min.y, pb.max.y], boardTop, scale: scene.getObjectByName('sports_root').scale.x, hoopX: hoop.position.x };
  });
  const frame = await call<any>('(s) => s.controller.getFrame()');
  const f = await call<any>('(s) => s.controller.framing(1)');
  const visibleBottom = view === 'phone' ? await page.evaluate(() => document.querySelector('[data-bind="dock"]')!.getBoundingClientRect().top) : vp.height;
  rows.push([(i * 0.016).toFixed(3), (f?.focus ?? 0).toFixed(4), ...r.ball.map((x: number) => x.toFixed(1)), r.baseTop.toFixed(1), '', r.boardTop.toFixed(1), (frame.y + frame.size).toFixed(1), visibleBottom].join(','));
}
writeFileSync(process.env.OUT ?? `scripts/_scratch/focus-${view}.csv`, rows.join('\n') + '\n');
await browser.close();
