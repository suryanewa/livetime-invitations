// Group view (z3.5 600@2) after Accept, frames T0..T1 every STEP, smoke on (f) and off (n) at each.
import { launch, open, save, mkdir } from './lab5.mjs';
const tag = process.env.TAG ?? 'grpv'; const o = `out/${tag}`; await mkdir(o, { recursive: true });
const T0 = Number(process.env.T0 ?? 0.16), T1 = Number(process.env.T1 ?? 0.288), STEP = Number(process.env.STEP ?? 2);
const b = await launch();
const { page, call } = await open(b, { w: 1200, h: 1000, dpr: 1 });
await call('(s) => s.controller.setMode("guest")');
await page.clock.runFor(4000);
await call('(s) => s.controller.captureStill(200, 1)');
const fl = await page.evaluate(() => window.__flames);
const cx = fl.reduce((a, p) => a + p[0], 0) / 6, cy = fl.reduce((a, p) => a + p[1], 0) / 6;
await page.evaluate(([cx, cy]) => { window.__zoom = { z: 3.5, cx, cy: cy + 0.02 }; }, [cx, cy]);
const cap = '(s) => s.controller.captureStill(600, 2)';
await call('(s) => s.controller.chooseResponse("accept")');
const n0 = Math.round(T0 / 0.016), n1 = Math.round(T1 / 0.016);
if (n0) await page.clock.runFor(n0 * 16);
for (let i = n0; i <= n1; i += STEP) {
  const id = String(i).padStart(4, '0');
  await save(`${o}/f${id}.png`, await call(cap));
  await page.evaluate(() => { window.__noSmoke = true; });
  await save(`${o}/n${id}.png`, await call(cap));
  await page.evaluate(() => { window.__noSmoke = false; });
  await page.clock.runFor(16 * STEP);
}
await b.close(); console.log('done');
