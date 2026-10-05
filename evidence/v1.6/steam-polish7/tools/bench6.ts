/** In-app steam cost bench (judge 6): the real app page at its real viewport and DSF, virtual clock paused, the app's own
 *  Stage captured by wrapping Stage.prototype.render (import('/src/render/stage.ts')), the reveal driven by the controller
 *  to each time; then stage.render() timed with fx_steam visible / hidden interleaved, each frame synced by a 1-px read-back.
 *  VIEW=laptop|phone, TIMES (s since accept), N, ROUNDS, SCHEDULE ("600:decline,750:accept"). Prints p10/p25 diffs (ms). */
import { chromium } from 'playwright-core';
const view = process.env.VIEW ?? 'laptop';
const vp = view === 'phone' ? { width: 390, height: 844, dpr: 3 } : { width: 1280, height: 720, dpr: 2 };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.addInitScript(() => { const pn = performance.now.bind(performance); (window as any).__realNow = pn; });
await page.clock.install();
await page.goto('http://127.0.0.1:5619/?scene=dinner');
const call = <T,>(fn: string) => page.evaluate((f) => new Function('s', `return (${f})(s)`)((window as any).__showcase), fn) as Promise<T>;
const tick = (ms: number) => page.clock.runFor(ms);
for (let i = 0; i < 400; i++) { if ((await call<string>('(s) => s.state?.resource')) === 'ready') break; await tick(50); await page.waitForTimeout(10); }
await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
await tick(1000);
for (let i = 0; i < 40; i++) { await tick(50); await page.waitForTimeout(40); }
await call('(s) => s.controller.setReducedMotion(false)');
await call('(s) => s.controller.setMode("guest")');
await tick(300);
await page.evaluate(async () => {
  const m = await import('/src/render/stage.ts' as string);
  const P = m.Stage.prototype; const orig = P.render;
  P.render = function (this: unknown) { (window as any).__stage = this; return orig.apply(this, arguments as any); };
});
await call('(s) => s.controller.chooseResponse("accept")');
await tick(32);
const info = await page.evaluate(() => { const st = (window as any).__stage; const gl = st.renderer.getContext(); return { buf: `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`, pr: st.renderer.getPixelRatio() }; });
console.log(view, 'stage captured', JSON.stringify(info));
const schedule = new Map((process.env.SCHEDULE ?? '').split(',').filter(Boolean).map((e) => { const [ms, intent] = e.split(':'); return [Math.round(Number(ms) / 16), intent!] as const; }));
const times = (process.env.TIMES ?? '0.3,0.4,0.45,0.5,0.6,0.7,1.0,1.2,1.5,2.2,3.0').split(',').map(Number);
let frame = 2;
const N = Number(process.env.N ?? 40), ROUNDS = Number(process.env.ROUNDS ?? 6);
for (const t of times) {
  while (frame * 16 < t * 1000) { if (schedule.has(frame)) await call(`(s) => s.controller.chooseResponse("${schedule.get(frame)}")`); await tick(16); frame++; }
  const r = await page.evaluate(([N, ROUNDS]) => {
    const st = (window as any).__stage; const gl = st.renderer.getContext() as WebGL2RenderingContext;
    let steam: any = null; st.scene.traverse((o: any) => { if (o.name === 'fx_steam') steam = o; });
    const shown = steam?.visible ?? false;
    const px = new Uint8Array(4); const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const f = (v: boolean) => { steam.visible = v; const now = (window as any).__realNow; const t0 = now(); st.render(); sync(); return now() - t0; };
    const on: number[] = [], off: number[] = [];
    if (!steam || !shown) return { shown };
    (window as any).__steamStats = []; f(true); const stat = (window as any).__steamStats.slice(-1)[0]; (window as any).__steamStats = undefined; f(false);
    for (let i = 0; i < 8; i++) { f(true); f(false); }
    for (let k = 0; k < N * ROUNDS; k++) { on.push(f(true)); off.push(f(false)); }
    steam.visible = shown;
    const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)]!;
    return { stat, shown, p10: +(q(on, 0.1) - q(off, 0.1)).toFixed(2), p25: +(q(on, 0.25) - q(off, 0.25)).toFixed(2), p50: +(q(on, 0.5) - q(off, 0.5)).toFixed(2), onP50: +q(on, 0.5).toFixed(2), offP50: +q(off, 0.5).toFixed(2) };
  }, [N, ROUNDS] as const);
  console.log(`${view} t ${t.toFixed(3)}`, JSON.stringify(r));
}
await browser.close();
