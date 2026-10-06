/** v1.7 dinner polish (item 2): the print's capacity at the config's clamps (title 80, name 48 characters).
 *  The judge's capacity.ts cases plus the limits: every drawn line (what fillText receives) and its size in mm,
 *  the block's extent, and the print box-reduced to the close-up's card width at laptop and phone (PNG).
 *  node --experimental-transform-types capacity-limits.ts <outDir>   (dev server on 5704) */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? 'capacity-out';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto('http://127.0.0.1:5704/?scene=party');
await page.waitForTimeout(1500);
const W = { laptop: Number(process.env.LAPTOP_W ?? 574), phone: Number(process.env.PHONE_W ?? 636) };
const res = await page.evaluate(async (W) => {
  const m = await import('/src/render/cardPrint.ts');
  await m.loadCardFont();
  const cases: [string, { eyebrow?: string; title?: string; name?: string }][] = [
    ['name-48', { eyebrow: 'You’re invited', title: 'Supper club: autumn menu', name: 'Anne-Sophie Vandenberghe-Østergaard de la Fuente' }],
    ['name-48b', { eyebrow: 'You’re invited', title: 'Supper club: autumn menu', name: 'Siobhán Ní Mhaoldomhnaigh-Fitzgerald-O’Callaghan' }],
    ['name-35-oneword', { eyebrow: 'You’re invited', title: 'Supper club: autumn menu', name: 'Wolfeschlegelsteinhausenbergerdorff' }],
    ['title-80', { eyebrow: 'You’re invited', title: 'A long table under the orchard lights: five courses, natural wines and slow talk', name: 'Alex Rivera' }],
    ['both-limits', { eyebrow: 'You’re invited', title: 'A long table under the orchard lights: five courses, natural wines and slow talk', name: 'Anne-Sophie Vandenberghe-Østergaard de la Fuente' }],
    ['eyebrow-60', { eyebrow: 'You’re invited to a very special evening with friends and fam', title: 'Supper club: autumn menu', name: 'Alex Rivera' }],
    ['all-limits', { eyebrow: 'You’re invited to a very special evening with friends and fam', title: 'A long table under the orchard lights: five courses, natural wines and slow talk', name: 'Anne-Sophie Vandenberghe-Østergaard de la Fuente' }],
    ['sample', { eyebrow: 'You’re invited', title: 'Supper club: autumn menu', name: 'Alex Rivera' }],
  ];
  const draw = (text: any) => {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 1434;
    const ctx = c.getContext('2d')!; const lines: string[] = []; const f = ctx.fillText.bind(ctx);
    (ctx as any).fillText = (s: string, x: number, y: number) => { const px = Number(/ ([\d.]+)px/.exec(ctx.font)![1]); lines.push(`${JSON.stringify(s)} ${(px / 20.48).toFixed(2)} mm`); f(s, x, y); };
    (c as any).getContext = () => ctx;
    const block = m.drawCardPrint(c, text);
    return { lines, block, c };
  };
  const reduce = (c: HTMLCanvasElement, w: number) => { const r = document.createElement('canvas'); r.width = w; r.height = Math.round((w * 1434) / 2048); const x = r.getContext('2d')!; x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, r.width, r.height); return r.toDataURL('image/png'); };
  const rows: string[] = []; const imgs: Record<string, string> = {};
  for (const [k, t] of cases) {
    const d = draw(t);
    const cut = d.lines.some((l) => l.includes('…'));
    rows.push(`${k}: ${d.lines.length} lines${cut ? ' (CUT)' : ''}; block ${d.block!.top.toFixed(1)}–${d.block!.bottom.toFixed(1)} mm of 70\n    ${d.lines.join('\n    ')}`);
    imgs[`${k}-laptop`] = reduce(d.c, W.laptop); imgs[`${k}-phone`] = reduce(d.c, W.phone);
  }
  return { rows, imgs };
}, W);
for (const [k, url] of Object.entries(res.imgs)) await writeFile(`${out}/${k}.png`, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
console.log(res.rows.join('\n'));
await browser.close();
