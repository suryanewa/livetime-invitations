/**
 * Party lab (v1.5 evidence tooling, dev server only: /scripts/party-lab/): the production stage
 * (neutral-room rig, the 18° product lens, the same hero framing as the showcase's square stage)
 * with the Party scene, driven at exact times instead of by the render loop, so frame strips can
 * sample the choreography at any rate (scripts/party-evidence.ts).
 *
 *   window.__lab.sample('host', 0.75); window.__lab.still(540, 2)
 */
import { MaterialLibrary } from '../../src/render/materials.ts';
import { Stage } from '../../src/render/stage.ts';
import { DEFAULT_RIG } from '../../src/render/rigRegistry.ts';
import { PLACE, SPIN } from '../../src/scenes/party/poses.ts';
import type { PartyScene } from '../../src/scenes/party/index.ts';
import type { CanonicalPose, SequenceName } from '../../src/core/types.ts';

const mount = document.getElementById('stage')!;
const stage = Stage.create({ rig: DEFAULT_RIG, preserveDrawingBuffer: true })!;
mount.append(stage.canvas);
const library = new MaterialLibrary('L2');
const params = new URLSearchParams(location.search);
// Experiment overrides (?place={"release":{...}}), applied before the choreography module evaluates.
const place = params.get('place');
if (place) for (const [k, v] of Object.entries(JSON.parse(place))) Object.assign((PLACE as Record<string, object>)[k]!, v);
const spin = params.get('spin');
if (spin) Object.assign(SPIN, JSON.parse(spin));
const { partyScene } = await import('../../src/scenes/party/index.ts');
const label = params.get('label') === 'cobalt' ? 'cobalt' : 'coral';
const scene = (await partyScene.load({
  config: { category: 'party', label, songId: 'sample-track-a' },
  library,
  assetBase: './assets',
  signal: new AbortController().signal,
})) as PartyScene;
stage.setContent(scene.root, scene.bounds, undefined, scene.framePoints, scene.heroPoints);
stage.resize(540, 540, 2);
await scene.precompile?.(stage.renderer, stage.camera);

const draw = () => {
  scene.beforeRender?.();
  stage.render();
};

(window as unknown as { __lab: unknown }).__lab = {
  scene,
  sample(sequence: SequenceName, t: number) {
    scene.sample(sequence, t);
    draw();
  },
  pose(p: CanonicalPose) {
    scene.pose(p);
    scene.settle?.();
    draw();
  },
  /** Drives the scene's own continuous channel for `seconds` in display frames of `frame` seconds. */
  run(seconds: number, frame = 1 / 60) {
    for (let t = 0; t < seconds - 1e-9; t += frame) scene.simulate?.(frame);
    draw();
  },
  still(size = 540, dpr = 2, type = 'image/png') {
    scene.beforeRender?.();
    return stage.snapshot(size, size, dpr, type);
  },
  draw,
};
document.body.dataset.ready = 'true';
