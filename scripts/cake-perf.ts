/**
 * v1.6 cake frame cost (docs/scenes/birthday-v1.6-cake.md): the Birthday scene in a real-time session
 * (no fake clock) at the laptop (1280 × 720 @2×) and phone (390 × 844 @3×) sizes. Two numbers per size:
 *
 * - the frame interval (rAF) while the scene plays (guest-ready with its live flames, then an accept and
 *   a decline), p50/p95/p99, the Master §9 measure;
 * - the GPU time of the stage's own render (EXT_disjoint_timer_query_webgl2 around Stage.render), at
 *   guest-ready, the cake's cost on its own (compare against the same run on the parent commit).
 *
 *   node --experimental-transform-types --no-warnings scripts/cake-perf.ts [baseUrl] [label]
 */
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const base = process.argv[2] ?? 'http://127.0.0.1:5601';
const label = process.argv[3] ?? '';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]!; };

for (const [name, w, h, dsf] of [['laptop', 1280, 720, 2], ['phone', 390, 844, 3]] as const) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
  page.on('pageerror', (e) => console.error('[pageerror]', String(e)));
  await page.goto(`${base}/?scene=birthday`);
  // GPU timer around the stage's render (dev tooling: the app's own Stage module).
  await page.evaluate(async () => {
    const m = await import('/src/render/stage.ts' as string);
    const proto = m.Stage.prototype;
    const orig = proto.render;
    const W = window as any;
    W.__gpu = [] as number[];
    proto.render = function (this: any) {
      W.__stage = this;
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (!ext || !W.__timing) return orig.call(this);
      const q = gl.createQuery()!;
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      orig.call(this);
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      const poll = () => {
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return void setTimeout(poll, 4);
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) W.__gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(q);
      };
      setTimeout(poll, 4);
    };
  });
  await page.waitForFunction(() => (window as any).__showcase?.state?.resource === 'ready', null, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const W = window as any, sc = W.__showcase;
    const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
    const iv: number[] = [];
    let last = 0, on = true;
    const loop = (t: number) => { if (last) iv.push(t - last); last = t; if (on) requestAnimationFrame(loop); };
    // Guest-ready with the live flames: the loop runs (fire.ts flicker).
    W.__timing = true;
    requestAnimationFrame(loop);
    await wait(3000);
    W.__timing = false;
    const gpuReady = [...W.__gpu];
    for (let i = 0; i < 4; i++) { sc.controller.chooseResponse(i % 2 ? 'decline' : 'accept'); await wait(2400); }
    on = false;
    await wait(100);
    // Bench: the guest-ready frame rendered back to back with a finish between (min and quartile of
    // 120 GPU timings: robust against other work on the machine's GPU).
    sc.controller.setMode('guest');
    await wait(1500);
    const st = W.__stage, gl2 = st.renderer.getContext() as WebGL2RenderingContext;
    const ext2 = gl2.getExtension('EXT_disjoint_timer_query_webgl2');
    const bench: number[] = [];
    if (ext2) {
      for (let i = 0; i < 140; i++) {
        const q = gl2.createQuery()!;
        gl2.beginQuery(ext2.TIME_ELAPSED_EXT, q);
        st.renderer.render(st.scene, st.camera);
        gl2.endQuery(ext2.TIME_ELAPSED_EXT);
        gl2.finish();
        for (let k = 0; k < 50 && !gl2.getQueryParameter(q, gl2.QUERY_RESULT_AVAILABLE); k++) await wait(2);
        if (i >= 20 && gl2.getQueryParameter(q, gl2.QUERY_RESULT_AVAILABLE) && !gl2.getParameter(ext2.GPU_DISJOINT_EXT)) bench.push(gl2.getQueryParameter(q, gl2.QUERY_RESULT) / 1e6);
        gl2.deleteQuery(q);
      }
    }
    const gl = W.__stage.renderer.getContext();
    // Materials: the same frame with the frosting's own (patched) materials and with plain clones of
    // them (three's PBR with the same maps, none of the cake's patches), alternated in blocks, wall
    // time to a finish: the patches' cost, independent of the geometry.
    const frosting: any[] = [];
    st.scene.traverse((o: any) => { if (o.isMesh && /^frosting_cake_/.test(o.name)) frosting.push(o); });
    const own = frosting.map((m) => m.material), plain = own.map((m: any) => m.clone());
    const px = new Uint8Array(4);
    // readPixels waits for the GPU to finish the frame (gl.finish alone does not under ANGLE/Metal).
    const sync = () => gl2.readPixels(0, 0, 1, 1, gl2.RGBA, gl2.UNSIGNED_BYTE, px);
    const block = async (mats: any[]) => {
      frosting.forEach((m, i) => { m.material = mats[i]; });
      for (let i = 0; i < 4; i++) { st.renderer.render(st.scene, st.camera); sync(); }
      const t0 = performance.now();
      for (let i = 0; i < 16; i++) { st.renderer.render(st.scene, st.camera); sync(); }
      return (performance.now() - t0) / 16;
    };
    const tOwn: number[] = [], tPlain: number[] = [];
    for (let rep = 0; rep < 8; rep++) { tOwn.push(await block(own)); tPlain.push(await block(plain)); await wait(5); }
    frosting.forEach((m, i) => { m.material = own[i]; });
    plain.forEach((m: any) => m.dispose());
    const mats = { own: tOwn, plain: tPlain };
    return { iv, gpu: gpuReady, bench, mats, timer: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'), info: sc.controller.renderInfo() };
  });
  const gpuS = r.gpu.slice(10);
  const bs = [...r.bench].sort((x, y) => x - y);
  const med = (a: number[]) => pct(a, 50);
  const matsLine = ` · materials: own ${med(r.mats.own).toFixed(2)} vs plain ${med(r.mats.plain).toFixed(2)} ms (patches +${(med(r.mats.own) - med(r.mats.plain)).toFixed(2)})`;
  const bench = bs.length ? ` · bench (${bs.length}) min ${bs[0]!.toFixed(2)} q25 ${pct(bs, 25).toFixed(2)} med ${pct(bs, 50).toFixed(2)} ms` : '';
  console.log(`${label} ${name}${matsLine}${bench}: frames ${r.iv.length} p50 ${pct(r.iv, 50).toFixed(2)} p95 ${pct(r.iv, 95).toFixed(2)} p99 ${pct(r.iv, 99).toFixed(2)} max ${Math.max(...r.iv).toFixed(1)} ms · GPU render at guest-ready (${r.timer ? `${gpuS.length} frames` : 'no timer query'}) p50 ${gpuS.length ? pct(gpuS, 50).toFixed(2) : '–'} p95 ${gpuS.length ? pct(gpuS, 95).toFixed(2) : '–'} ms · buffer ${r.info?.buffer?.join('×')} @${r.info?.pixelRatio}`);
  await page.close();
}
await browser.close();
