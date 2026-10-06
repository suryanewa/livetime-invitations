/** Sway on the real stage: per 16 ms frame of the decline (fake clock), the stand's angle and the board's top / the ball in CSS px. VIEW=laptop|phone, SEQ, SECONDS, FROM. */
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
const HASH = JSON.parse(readFileSync('node_modules/.vite/deps/_metadata.json', 'utf8')).browserHash as string;
const view = process.env.VIEW ?? 'laptop';
const vp = view === 'phone' ? { width: 390, height: 844, dpr: 3 } : { width: 1280, height: 720, dpr: 2 };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.addInitScript(() => performance.setResourceTimingBufferSize(100000));
await page.clock.install();
await page.goto(`${process.env.BASE ?? 'http://127.0.0.1:5705'}/?scene=sports`);
const call = <T,>(fn: string) => page.evaluate((f) => new Function('s', `return (${f})(s)`)((window as any).__showcase), fn) as Promise<T>;
const tick = (ms: number) => page.clock.runFor(ms);
for (let i = 0; i < 400; i++) { if ((await call<string>('(s) => s.state?.resource')) === 'ready') break; await tick(50); await page.waitForTimeout(10); }
await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
await tick(1000);
await page.evaluate(async (hash) => {
  const url = `/node_modules/.vite/deps/three.js?v=${hash}`;
  const THREE = await import(url);
  const w = window as any;
  w.__T = THREE;
  // WebGLRenderer's methods are own properties: catch the scene and the stage camera by their matrix updates instead.
  w.__last = { canvas: document.querySelector('[data-bind="stage"] canvas') };
  const o1 = THREE.Object3D.prototype.updateMatrixWorld;
  THREE.Object3D.prototype.updateMatrixWorld = function (this: any, force?: boolean) { if (this.isScene && this.getObjectByName('hoop_root')) w.__last.scene = this; return o1.call(this, force); };
  const o2 = THREE.PerspectiveCamera.prototype.updateMatrixWorld;
  THREE.PerspectiveCamera.prototype.updateMatrixWorld = function (this: any, force?: boolean) { if (this.fov === 18) w.__last.camera = this; return o2.call(this, force); };
}, HASH);
await call('(s) => s.controller.setReducedMotion(false)');
await call('(s) => s.controller.setMode("guest")');
await tick(300);
await call(`(s) => s.controller.chooseResponse("${process.env.SEQ ?? 'decline'}")`);
await tick(16);
// Rest references (hoop space) before the tap.
await page.evaluate(() => {
  const w = window as any, T = w.__T, s = w.__last.scene;
  const hoop = s.getObjectByName('hoop_root'), board = s.getObjectByName('backboard'), pole = s.getObjectByName('hoop_pole');
  const box = new T.Box3().setFromObject(board);
  const topW = new T.Vector3((box.min.x + box.max.x) / 2, box.max.y, box.max.z);
  w.__ref = { topHoop: hoop.worldToLocal(topW.clone()), topLocal: board.worldToLocal(topW.clone()), poleQ: pole.quaternion.clone() };
});
const rows: string[] = ['t,standDeg,boardTopDx,boardTopDy,boardTopPx,ballX,ballY,close'];
const total = Math.round((Number(process.env.SECONDS ?? 3.5) * 1000) / 16);
for (let i = 1; i <= total; i++) {
  const r = await page.evaluate(() => {
    const w = window as any, T = w.__T, { scene, camera, canvas } = w.__last;
    const hoop = scene.getObjectByName('hoop_root'), board = scene.getObjectByName('backboard'), pole = scene.getObjectByName('hoop_pole'), ball = scene.getObjectByName('ball_authored');
    scene.updateMatrixWorld(true);
    const css = (p: any) => { const q = p.clone().project(camera); return [((q.x + 1) / 2) * canvas.clientWidth, ((1 - q.y) / 2) * canvas.clientHeight]; };
    const now = css(board.localToWorld(w.__ref.topLocal.clone()));
    const rest = css(hoop.localToWorld(w.__ref.topHoop.clone()));
    const ang = 2 * Math.acos(Math.min(1, Math.abs(pole.quaternion.clone().multiply(w.__ref.poleQ.clone().invert()).w))) * 180 / Math.PI * Math.sign(pole.quaternion.clone().multiply(w.__ref.poleQ.clone().invert()).x || 1);
    const b = css(ball.getWorldPosition(new T.Vector3()));
    return [ang, now[0] - rest[0], now[1] - rest[1], b[0], b[1]];
  });
  const close = await call<number>('(s) => s.controller.framing(1)?.close ?? 0');
  rows.push([(i * 0.016).toFixed(3), r[0]!.toFixed(4), r[1]!.toFixed(2), r[2]!.toFixed(2), Math.hypot(r[1]!, r[2]!).toFixed(2), r[3]!.toFixed(1), r[4]!.toFixed(1), close.toFixed(3)].join(','));
  await tick(16);
}
writeFileSync(process.env.OUT ?? `scripts/_scratch/sway-${view}.csv`, rows.join('\n') + '\n');
await browser.close();
