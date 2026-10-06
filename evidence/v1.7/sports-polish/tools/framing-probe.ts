import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.goto(`${process.env.BASE ?? 'http://127.0.0.1:5705'}/?scene=sports`);
const call = <T,>(fn: string) => page.evaluate((f) => new Function('s', `return (${f})(s)`)((window as any).__showcase), fn) as Promise<T>;
for (let i = 0; i < 200; i++) { if ((await call<string>('(s) => s.state?.resource')) === 'ready') break; await page.waitForTimeout(50); }
for (const a of [0.75, 1, 1.5]) {
  const f = await call<any>(`(s) => s.controller.framing(${a})`);
  const r = f.rest;
  const top = r.heroCenter[1] + r.heroHeight;
  console.log(`aspect ${a}: heroH ${r.heroHeight.toFixed(3)} heroW ${r.heroWidth.toFixed(3)} ${r.binding} pathLimited ${r.pathLimited} dist ${r.distance.toFixed(2)} | hero top ${(100 * (1 - top) / 2).toFixed(1)}% from top | paths x ${(100 * (r.pathExtents[0] + 1) / 2).toFixed(1)}%..${(100 * (1 - r.pathExtents[1]) / 2).toFixed(1)}% y bottom ${(100 * (r.pathExtents[2] + 1) / 2).toFixed(1)}% top ${(100 * (1 - r.pathExtents[3]) / 2).toFixed(1)}% | close ${f.close} focus ${f.focus} | focusFit d ${f.focusFit?.distance.toFixed(2)} (zoom ×${(r.distance / f.focusFit?.distance).toFixed(3)}) heroH ${f.focusFit?.heroHeight.toFixed(3)} heroW ${f.focusFit?.heroWidth.toFixed(3)} ${f.focusFit?.binding} pathLimited ${f.focusFit?.pathLimited} paths ${f.focusFit?.pathExtents.map((v: number) => v.toFixed(3))}`);
}
await browser.close();
