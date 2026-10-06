/** Eyebrow-case mock: drawCardPrint from the real module in the dev page, variants via runtime tweaks (no repo edits). */
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto('http://127.0.0.1:5704/?scene=party');
await page.waitForTimeout(1500);
const out = await page.evaluate(async () => {
  const m = await import('/src/render/cardPrint.ts');
  await m.loadCardFont();
  const text = { eyebrow: 'You’re invited', title: 'Supper club: autumn menu', name: 'Alex Rivera' };
  const L = m.CARD_LAYOUT as any;
  const orig = { ...L.eyebrow };
  const up = String.prototype.toLocaleUpperCase;
  const variants: [string, () => void][] = [
    ['A-built-caps', () => {}],
    ['B-as-written-same-tracking', () => { (String.prototype as any).toLocaleUpperCase = function () { return String(this); }; }],
    ['C-as-written-4.2mm-500-0', () => { (String.prototype as any).toLocaleUpperCase = function () { return String(this); }; L.eyebrow.size = 4.2; L.eyebrow.weight = 500; L.eyebrow.tracking = 0; }],
  ];
  const res: Record<string, string> = {};
  for (const [k, set] of variants) {
    set();
    const c = document.createElement('canvas'); c.width = 2048; c.height = 1434;
    m.drawCardPrint(c, text);
    // box-reduce to the phone close-up's card width (752 px) via the canvas (high-quality smoothing)
    const r = document.createElement('canvas'); r.width = 752; r.height = Math.round(752 * 1434 / 2048);
    const x = r.getContext('2d')!; x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, r.width, r.height);
    res[k] = r.toDataURL('image/png');
    (String.prototype as any).toLocaleUpperCase = up; Object.assign(L.eyebrow, orig);
  }
  return res;
});
for (const [k, url] of Object.entries(out)) await writeFile(`crops/eyebrow-${k}.png`, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
await browser.close();
console.log(Object.keys(out).join(' '));
