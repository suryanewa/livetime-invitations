/**
 * v1.7 Dinner card evidence: the print itself (src/render/cardPrint.ts) drawn in the page with the
 * bundled face, at its texture size, and box-reduced to the card's width in the close-up (≈ 430 px
 * on a 720 px poster, ≈ 860 px on a 2× phone), for a set of texts (the showcase's, host and guest,
 * a long title, a long name, accents, an empty card).
 *   node --experimental-transform-types evidence/v1.7/dinner-card/print.ts <base> <out>
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const [base = 'http://127.0.0.1:5701', out = 'evidence/v1.7/dinner-card/b-print'] = process.argv.slice(2);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const save = (file: string, url: string) => writeFile(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
const TEXTS: Record<string, { eyebrow?: string; title?: string; name?: string }> = {
  guest: { eyebrow: 'You’re invited', title: 'Supper club: autumn menu', name: 'Alex Rivera' },
  host: { eyebrow: 'You’re invited', title: 'Supper club: autumn menu' },
  long: { eyebrow: 'You’re cordially invited to join us for', title: 'The twentieth annual harvest supper club and winter menu tasting evening at the studio', name: 'Maximiliana Theodora Montgomery-Okonkwo' },
  accents: { eyebrow: 'Vous êtes invité', title: 'Dîner d’automne à Łódź', name: 'Zoë Ångström-Núñez' },
  short: { title: 'Dinner' },
};

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(`${base}/?scene=dinner`);
await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 60_000 });
for (const [name, text] of Object.entries(TEXTS)) {
  const urls = await page.evaluate(async (t) => {
    const m = await import(/* @vite-ignore */ '/src/render/cardPrint.ts');
    const loaded = await m.loadCardFont();
    const c = document.createElement('canvas');
    [c.width, c.height] = m.CARD_PRINT_SIZE.full;
    const block = m.drawCardPrint(c, t);
    const shrink = (w: number) => {
      // Successive halvings then one resample, as a mip chain would reach that size.
      let src: HTMLCanvasElement = c;
      while (src.width / 2 >= w) {
        const d = document.createElement('canvas');
        d.width = src.width / 2; d.height = Math.round(src.height / 2);
        const x = d.getContext('2d')!; x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, d.width, d.height);
        src = d;
      }
      const d = document.createElement('canvas');
      d.width = w; d.height = Math.round((w * c.height) / c.width);
      const x = d.getContext('2d')!; x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, d.width, d.height);
      return d.toDataURL('image/png');
    };
    return { loaded, block, full: c.toDataURL('image/png'), w430: shrink(430), w860: shrink(860), w200: shrink(200) };
  }, text);
  console.log(name, 'font loaded', urls.loaded, 'block mm', JSON.stringify(urls.block));
  await save(join(out, `print-${name}-2048.png`), urls.full);
  await save(join(out, `print-${name}-430.png`), urls.w430);
  await save(join(out, `print-${name}-860.png`), urls.w860);
  await save(join(out, `print-${name}-200.png`), urls.w200);
}
await browser.close();
