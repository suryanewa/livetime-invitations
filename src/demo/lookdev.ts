import '../ui/shell.css';
import './study.css';
import { buildCake } from '../../models/cake.ts';
import { buildKeycard } from '../../models/keycard.ts';
import { buildRecordPlayer } from '../../models/recordPlayer.ts';
import { buildBirthday } from '../../models/birthday.ts';
import { buildSports } from '../../models/sports.ts';
import { frameFor as sportsFrameFor, newFrame as sportsNewFrame } from '../scenes/sports/sequences.ts';
import { COVER_BESIDE } from '../../models/dinnerContract.ts';
import { buildDinner } from '../../models/dinner.ts';
import { buildBasketballBlockout, buildDishBlockout, buildRecordPlayerBlockout } from '../../models/blockouts.ts';
import type { BuiltModel } from '../../models/types.ts';
import { MaterialLibrary, type DirectionId } from '../render/materials.ts';
import { Stage, type StageOptions } from '../render/stage.ts';
import { BusinessScene } from '../scenes/business/index.ts';
import { createSimplifier, type Simplify } from '../../models/simplify.ts';
import type { CanonicalPose } from '../core/types.ts';

/**
 * Fidelity lookdev (checkpoint 2 rework): identical subjects rendered three ways so the
 * premium pass can be judged side by side, with render cost measured on this machine.
 */

type Variant = { key: string; label: string; dir: DirectionId; stage: StageOptions };
const VARIANTS: Variant[] = [
  { key: 'current', label: 'Current L (checkpoint 2)', dir: 'L', stage: {} },
  { key: 'premium-ortho', label: 'Premium L2 · orthographic', dir: 'L2', stage: { premium: true } },
  { key: 'premium-persp', label: 'Premium L2 · long-lens perspective', dir: 'L2', stage: { premium: true, projection: 'perspective', fov: 18 } },
];

let simplify: Simplify | undefined;
type Subject = { key: string; label: string; build(lib: MaterialLibrary): { model: BuiltModel; pose?(p: CanonicalPose): void; dispose(): void } };
const SUBJECTS: Subject[] = [
  {
    key: 'badge-ready',
    label: 'Badge · guest-ready (light)',
    build(lib) {
      const model = buildKeycard({ lib, simplify }, 'light');
      const scene = new BusinessScene(model, lib, { category: 'business', template: 'light' });
      scene.pose('guest-ready');
      scene.beforeRender();
      return { model, dispose: () => model.dispose() };
    },
  },
  {
    key: 'badge-accepted-dark',
    label: 'Badge · accepted (dark)',
    build(lib) {
      const model = buildKeycard({ lib, simplify }, 'dark');
      const scene = new BusinessScene(model, lib, { category: 'business', template: 'dark' });
      scene.pose('accepted');
      scene.beforeRender();
      return { model, dispose: () => model.dispose() };
    },
  },
  {
    key: 'cake',
    label: 'Cake · guest-ready (identity check)',
    build(lib) {
      const model = buildCake({ lib, simplify }, 'vanilla');
      return { model, dispose: () => model.dispose() };
    },
  },
  {
    key: 'record',
    label: 'Record player · guest-ready (Party)',
    build(lib) {
      // Only L2 has the production model; the current column shows L's study blockout.
      const model = lib.direction.id === 'L2' ? buildRecordPlayer({ lib, simplify }, 'coral') : buildRecordPlayerBlockout({ lib });
      return { model, dispose: () => model.dispose() };
    },
  },
  {
    key: 'birthday',
    label: 'Birthday scene · guest-ready (cake, stand, bin hidden)',
    build(lib) {
      if (lib.direction.id !== 'L2') {
        const model = buildCake({ lib, simplify }, 'vanilla');
        return { model, dispose: () => model.dispose() };
      }
      const model = buildBirthday({ lib, simplify }, 'vanilla');
      model.nodes.bin_root!.visible = false;
      return { model, dispose: () => model.dispose() };
    },
  },
  {
    key: 'sports',
    label: 'Sports · guest-ready (ball, hoop, net)',
    build(lib) {
      if (lib.direction.id !== 'L2') {
        const model = buildBasketballBlockout({ lib });
        return { model, dispose: () => model.dispose() };
      }
      // The guest-ready ball: rotated so the seams read as the classic "( + )".
      const model = buildSports({ lib, simplify }, 'orange');
      const ready = sportsFrameFor('guest-ready', sportsNewFrame());
      model.nodes.ball_authored!.position.copy(ready.ballPos);
      model.nodes.ball_secondary!.quaternion.copy(ready.ballRot);
      return { model, dispose: () => model.dispose() };
    },
  },
  {
    key: 'dinner',
    label: 'Dinner · accepted (cloche beside the clean plate)',
    build(lib) {
      if (lib.direction.id !== 'L2') {
        const model = buildDishBlockout({ lib });
        return { model, dispose: () => model.dispose() };
      }
      const model = buildDinner({ lib, simplify }, 'pasta');
      model.nodes.bin_root!.visible = false;
      const cover = model.nodes.cover_authored!;
      cover.position.copy(COVER_BESIDE);
      return { model, dispose: () => model.dispose() };
    },
  },
];

/** `?only=record` renders one subject (faster iteration). */
const only = new URLSearchParams(location.search).get('only');
if (only) SUBJECTS.splice(0, SUBJECTS.length, ...SUBJECTS.filter((x) => x.key === only));

const results: Record<string, { url: string; triangles: number; calls: number; ms: number }> = {};

async function main() {
  simplify = await createSimplifier();
  const root = document.getElementById('lookdev-root')!;
  root.innerHTML = `<div class="s-wrap"><header class="s-head"><p class="s-kicker">Checkpoint 2 rework · fidelity lookdev</p><h1>Premium pass: same identity, higher fidelity</h1><p>Each row is one subject; columns compare the current L look with the premium L2 candidate in both projections. Rendered live by the shipping WebGL2 renderer at 3× (390 pt stage). Numbers are render cost on this Mac, not phone evidence.</p></header><div id="grid"></div></div>`;
  const grid = document.getElementById('grid')!;
  for (const subject of SUBJECTS) {
    const section = document.createElement('section');
    section.className = 's-section';
    section.innerHTML = `<header><h2>${subject.label}</h2></header><div class="s-frames" style="grid-template-columns:repeat(3,minmax(0,1fr))"></div>`;
    const row = section.querySelector('.s-frames')!;
    for (const v of VARIANTS) {
      const stage = Stage.create({ ...v.stage, preserveDrawingBuffer: true });
      if (!stage) continue;
      const lib = new MaterialLibrary(v.dir);
      const built = subject.build(lib);
      stage.setContent(built.model.root, built.model.bounds);
      stage.resize(358, 358, 3);
      stage.render();
      const url = stage.snapshot(358, 358, 3);
      const info = { ...stage.renderer.info.render };
      // Rough cost: 30 synced renders at the snapshot size.
      const gl = stage.renderer.getContext();
      const px = new Uint8Array(4);
      const t0 = performance.now();
      for (let i = 0; i < 30; i++) {
        stage.renderer.shadowMap.needsUpdate = true;
        stage.render();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      }
      const ms = (performance.now() - t0) / 30;
      results[`${subject.key}-${v.key}`] = { url, triangles: info.triangles, calls: info.calls, ms };
      const fig = document.createElement('figure');
      fig.style.margin = '0';
      fig.dataset.name = `${subject.key}-${v.key}`;
      fig.innerHTML = `<img src="${url}" alt="" style="width:100%;border-radius:18px;display:block" /><figcaption style="margin-top:8px;font-size:.8125rem;color:var(--lt-text-2)">${v.label}<br><code>${info.triangles.toLocaleString()} tris · ${info.calls} calls · ${ms.toFixed(2)} ms/frame</code></figcaption>`;
      row.append(fig);
      built.dispose();
      lib.dispose();
      stage.dispose();
    }
    grid.append(section);
  }
  (window as unknown as { __lookdev: unknown }).__lookdev = results;
  document.body.dataset.ready = 'true';
}
main();
