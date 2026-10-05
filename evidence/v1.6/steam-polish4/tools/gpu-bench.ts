/**
 * Dinner steam GPU cost (scratch): the real scene on the production stage; each frame's prepasses
 * (scene depth + flow map + half-resolution march) and main render timed with GPU timer queries,
 * steam on and off, alternating. Results on window.__bench.
 */
import { Stage } from '../../src/render/stage.ts';
import { MaterialLibrary, LOCKED_DIRECTION } from '../../src/render/materials.ts';
import { dinnerScene } from '../../src/scenes/dinner/index.ts';

const params = new URLSearchParams(location.search);
const size = Number(params.get('size') ?? 1400);
const N = Number(params.get('n') ?? 20);
const ROUNDS = Number(params.get('rounds') ?? 10);
if (params.get('globals')) Object.assign(globalThis as any, JSON.parse(params.get('globals')!));
const stage = Stage.create({ rig: 'neutral-room' })!;
document.getElementById('host')!.append(stage.canvas);
const lib = new MaterialLibrary(LOCKED_DIRECTION);
const scene = await dinnerScene.load({ config: { category: 'dinner', dish: 'pasta' }, library: lib, assetBase: './assets', signal: new AbortController().signal });
stage.setContent(scene.root, scene.bounds, scene.studio, scene.framePoints, scene.heroPoints);
const vw = Number(params.get('w') ?? size), vh = Number(params.get('h') ?? size), vdpr = Number(params.get('dpr') ?? 1);
stage.resize(vw, vh, vdpr);
if (params.get('low')) { scene.setLowDetail?.(true); }
await stage.renderer.compileAsync(stage.scene, stage.camera);
const gl = stage.renderer.getContext() as WebGL2RenderingContext;
const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')!;
const steam = (scene as unknown as { steam: { object: { visible: boolean } } }).steam;

const px = new Uint8Array(4);
const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
const useTq = params.get("tq") === "1";
function frame(): number {
  if (useTq) {
    const qq = gl.createQuery()!;
    gl.beginQuery(ext!.TIME_ELAPSED_EXT, qq);
    stage.render();
    gl.endQuery(ext!.TIME_ELAPSED_EXT);
    sync();
    let v = NaN;
    for (let i = 0; i < 1000 && !gl.getQueryParameter(qq, gl.QUERY_RESULT_AVAILABLE); i++) sync();
    if (gl.getQueryParameter(qq, gl.QUERY_RESULT_AVAILABLE)) v = gl.getQueryParameter(qq, gl.QUERY_RESULT) / 1e6;
    gl.deleteQuery(qq);
    return v;
  }
  const t0 = performance.now();
  stage.render();
  sync();
  return performance.now() - t0;
}
const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)] ?? NaN;
const out: Record<string, number> = {};
for (const tau of (params.get('taus') ?? '0.3,0.5,0.7,1.0,1.5,2.2,3.0,4.5,-1').split(',').map(Number)) {
  const overlap = tau < 0;
  scene.sample('accept', overlap ? 1.0 : Math.min(tau, 1.499));
  if (overlap) { Object.assign((scene as any).leftSteam[0], { t: 1.0, start: -Infinity, end: Infinity, until: 9, capture: Infinity }); (scene as any).syncSteam(); }
  if (tau >= 1.5) { scene.pose('accepted'); (scene as any).steamT = tau; (scene as any).steamFree = true; (scene as any).syncSteam(); }
  const variants = (params.get('variants') ?? 'full').split(',');
  const diffs: Record<string, number[]> = {};
  const g = globalThis as any;
  steam.object.visible = true; for (let i = 0; i < 10; i++) frame();
  for (let k = 0; k < N * ROUNDS; k++) {
    for (const v of variants) {
      g.__steamSkip = v === 'full' || /^[pqfs]\d/.test(v) ? undefined : v;
      g.__steamProf = v.startsWith('p') ? Number(v.slice(1)) : 0;
      g.__steamSteps = v.startsWith('s') ? Number(v.slice(1)) : undefined;
      g.__steamProbes = v.startsWith('q') ? Number(v.slice(1)) : undefined;
      g.__steamFlags = v.startsWith('f') ? Number(v.slice(1)) : undefined;
      steam.object.visible = true;
      const a = frame();
      steam.object.visible = false;
      const b = frame();
      (diffs[v] ??= []).push(a - b);
      (diffs[v + ':on'] ??= []).push(a);
      (diffs[v + ':off'] ??= []).push(b);
    }
  }
  g.__steamSkip = undefined; g.__steamProf = 0; g.__steamSteps = undefined; g.__steamProbes = undefined; g.__steamFlags = undefined;
  steam.object.visible = true;
  const key = overlap ? 'overlap 1.0+1.0' : `tau ${tau}`;
  for (const v of variants) { out[`${key} ${v} p10`] = +(q(diffs[v + ':on']!, 0.1) - q(diffs[v + ':off']!, 0.1)).toFixed(2); out[`${key} ${v} p25`] = +(q(diffs[v + ':on']!, 0.25) - q(diffs[v + ':off']!, 0.25)).toFixed(2); out[`${key} ${v} min`] = +(q(diffs[v + ':on']!, 0) - q(diffs[v + ':off']!, 0)).toFixed(2); out[`${key} ${v} frame-on p50`] = +q(diffs[v + ':on']!, 0.5).toFixed(2); out[`${key} ${v} frame-on p95`] = +q(diffs[v + ':on']!, 0.95).toFixed(2); out[`${key} ${v} frame-off p50`] = +q(diffs[v + ':off']!, 0.5).toFixed(2); }
}
(window as any).__bench = { size: params.get('w') ? `${vw}x${vh}@${vdpr}` : size, N, out };
