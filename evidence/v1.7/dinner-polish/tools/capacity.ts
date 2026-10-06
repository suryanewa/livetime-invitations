import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto('http://127.0.0.1:5704/?scene=party');
await page.waitForTimeout(1500);
const res = await page.evaluate(async () => {
  const m = await import('/src/render/cardPrint.ts');
  await m.loadCardFont();
  const drawn = (text: any) => { const c = document.createElement('canvas'); c.width = 2048; c.height = 1434; const ctx = c.getContext('2d')!; const out: string[] = []; const f = ctx.fillText.bind(ctx); (ctx as any).fillText = (s: string, x: number, y: number) => { out.push(s); f(s, x, y); }; (c as any).getContext = () => ctx; m.drawCardPrint(c, text); return out; };
  const names = ['Alex Rivera', 'Anne-Sophie Vandenberghe', 'María José Fernández-Ocampo', 'Anne-Sophie Vandenberghe-Østergaard', 'Dr. Christopher Montgomery-Whitfield III', 'Siobhán Ní Mhaoldomhnaigh-Fitzgerald'];
  const titles = ['Supper club: autumn menu', 'Harvest supper at the old mill: seven courses', 'Harvest supper at the old mill: seven courses with paired wines', 'A long table under the orchard lights: five courses, natural wines and slow talk'];
  const r: string[] = [];
  for (const n of names) { const d = drawn({ eyebrow: 'You’re invited', title: 'Supper', name: n }); r.push(`name ${n.length}ch "${n}" -> ${JSON.stringify(d.slice(2))}`); }
  // the longest name (in "average" letters) that fits: grow 'Abcdefgh ' pattern
  for (const t of titles) { const d = drawn({ eyebrow: 'You’re invited', title: t, name: 'Alex' }); r.push(`title ${t.length}ch -> ${JSON.stringify(d.slice(1, -1))}`); }
  return r;
});
console.log(res.join('\n'));
await browser.close();
