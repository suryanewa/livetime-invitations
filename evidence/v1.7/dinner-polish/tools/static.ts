import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
await page.goto('http://127.0.0.1:5704/?scene=dinner');
for (let i = 0; i < 200; i++) { if (await page.evaluate(() => (window as any).__showcase?.state?.resource === 'ready')) break; await page.waitForTimeout(100); }
await page.evaluate(() => (window as any).__showcase.setConfig({ category: 'dinner', dish: 'pasta', card: { eyebrow: 'You’re invited', title: 'Maya turns 30: dinner at Lupa', name: 'Jordan Okafor' } }));
await page.evaluate(() => { const s = (window as any).__showcase; s.controller.setReducedMotion(true); s.controller.setMode('guest'); s.controller.chooseResponse('accept'); });
await page.waitForTimeout(800);
await page.screenshot({ path: 'static/phone-live-own-card.png' });
await page.evaluate(() => (window as any).__showcase.controller.setQualityTier('static'));
await page.waitForTimeout(1500);
await page.screenshot({ path: 'static/phone-static-tier.png' });
console.log(await page.evaluate(() => JSON.stringify({ r: (window as any).__showcase.state.resource, v: (window as any).__showcase.state.visual })));
await browser.close();
