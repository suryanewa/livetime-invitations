import { Box3, type Camera, Euler, type Object3D, Vector3, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import glbUrl from '../../../assets/scenes/dinner/dinner.glb?url';
import binUrl from '../../../assets/shared/disposal-bin.glb?url';
import {
  COVER, COVER_PROFILE, COVER_TOP, finishDish, DINNER_BIN_POS, DINNER_BIN_YAW, DINNER_WALL_Z, DISH_HEIGHT, PLATE, rigDinner,
  type DinnerRig,
} from '../../../models/dinner.ts';
import { flapAngles, openBinFramePoints } from '../../../models/disposalBin.ts';
import { disposeImported, prepareImported, setImportedLowDetail } from '../../../models/imported.ts';
import { bindMaterialsByName } from '../../../models/types.ts';
import type { SceneInstance, SceneLoadContext, SceneModule } from '../../core/sequence.ts';
import type { CanonicalPose, SceneConfig, SequenceName } from '../../core/types.ts';
import { smoothstep } from '../../motion/curves.ts';
import { coverBlendSafe, DURATIONS, frameFor, newFrame, sampleSequence, type DinnerFrame } from './sequences.ts';

/**
 * Silhouette samples of every Dinner path: the plate, the cover along the host and accept paths
 * (its measured profile, tilted and placed exactly as rendered), the resting cover and the carry.
 * The scene adds the open bin from its geometry (openBinFramePoints).
 */
export function dinnerFramePoints(): Vector3[] {
  const pts: Vector3[] = [];
  const ring = (cx: number, cz: number, r: number, y: number, n = 16) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(new Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
    }
  };
  ring(0, 0, PLATE.radius, 0);
  ring(0, 0, PLATE.radius, PLATE.rimHeight);
  // The cover: rim, shoulder, crown and handle top, in cover space, at each sampled pose.
  const shoulder = COVER_PROFILE[Math.floor(COVER_PROFILE.length / 2)]!;
  const local: Vector3[] = [];
  for (const [r, y, n] of [[COVER.radius, 0, 16], [shoulder[0], shoulder[1], 12], [COVER.radius * 0.35, COVER.domeHeight, 8], [COVER.radius * 0.25, COVER_TOP, 6]] as const) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      local.push(new Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
  }
  const e = new Euler();
  const cover = (f: DinnerFrame) => {
    e.set(f.coverTiltX, 0, f.coverTilt);
    for (const p of local) pts.push(p.clone().applyEuler(e).add(f.coverPos));
  };
  const f = newFrame();
  for (const pose of ['host-ready', 'guest-ready', 'accepted'] as const) cover(frameFor(pose, f));
  for (const seq of ['host', 'accept'] as const) {
    for (let t = 0; t <= DURATIONS[seq] + 1e-9; t += 0.02) cover(sampleSequence(seq, t, f));
  }
  for (let t = 0.25; t <= DURATIONS.decline; t += 0.025) {
    const p = sampleSequence('decline', t, f).platePos;
    ring(p.x, p.z, PLATE.radius, p.y, 12);
    ring(p.x, p.z, COVER.radius * 0.35, p.y + DISH_HEIGHT, 6);
  }
  // The bin itself (body and open flaps) is sampled from its geometry: openBinFramePoints.
  return pts;
}

export class DinnerScene implements SceneInstance {
  readonly category = 'dinner' as const;
  readonly root: Object3D;
  readonly bounds: Box3;
  readonly durations = DURATIONS;
  readonly animatedNodes: Object3D[];
  readonly studio = { wallZ: DINNER_WALL_Z };
  readonly framePoints: Vector3[];

  private readonly frame = newFrame();

  constructor(readonly rig: DinnerRig, _config: Extract<SceneConfig, { category: 'dinner' }>) {
    this.root = rig.root;
    this.bounds = rig.bounds.clone();
    const n = rig.nodes;
    this.animatedNodes = [n.plate_authored!, n.cover_authored!, n.bin_root!, rig.flapL, rig.flapR];
    this.framePoints = [...dinnerFramePoints(), ...openBinFramePoints(n.bin_root!, DINNER_BIN_POS, DINNER_BIN_YAW)];
    this.pose('guest-ready');
  }

  /** v1.2 has no food: `dish` stays in SceneConfig for integration compatibility and selects nothing. */
  setConfig(_config: SceneConfig): void {}

  pose(pose: CanonicalPose): void {
    this.apply(frameFor(pose, this.frame));
  }

  sample(sequence: SequenceName, t: number): void {
    this.apply(sampleSequence(sequence, t, this.frame));
  }

  /**
   * A cover lifted aside, or a dish on its way to the bin, would sweep through the plate rim
   * or out of the bin on a straight blend: cut to the covered dish instead.
   */
  interruptCut(): boolean {
    const f = this.frame;
    const coverAside = !coverBlendSafe(f);
    return f.binVisible || !f.dishVisible || f.platePos.lengthSq() > 1e-6 || coverAside;
  }

  /** Low tier for the imported plate and cloche materials (the library handles the bin). */
  setLowDetail(enabled: boolean): void {
    setImportedLowDetail(this.root, enabled);
  }

  async precompile(renderer: WebGLRenderer, camera: Camera): Promise<void> {
    // Warm the bin too (shown for the compile only).
    const scene = this.root.parent ?? this.root;
    this.rig.nodes.bin_root!.visible = true;
    await renderer.compileAsync(scene, camera);
    this.apply(this.frame);
  }

  dispose(): void {
    this.rig.dispose();
    disposeImported(this.root);
    this.root.traverse((o) => (o as { geometry?: { dispose(): void } }).geometry?.dispose());
    this.root.removeFromParent();
  }

  private apply(f: DinnerFrame): void {
    const n = this.rig.nodes;
    n.plate_authored!.position.copy(f.platePos);
    n.plate_authored!.visible = f.dishVisible;
    n.cover_authored!.position.copy(f.coverPos);
    n.cover_authored!.rotation.set(f.coverTiltX, 0, f.coverTilt);
    n.cover_authored!.visible = f.dishVisible;
    // The dish shadow follows the plate and softens as it is carried up and away.
    const shadow = this.rig.dishShadow;
    shadow.setFootprint(f.platePos.x, f.platePos.z);
    shadow.setHeight(f.platePos.y, 1.4);
    // setHeight decides visibility from its fade; the hidden dish must stay hidden after it.
    if (!f.dishVisible) shadow.visible = false;
    // The cloche's own shadow fades in as it leaves the plate and lands beside it (as it rises
    // off the plate it is still over the dish's shadow, so it is held back there).
    const off = Math.hypot(f.coverPos.x - f.platePos.x, f.coverPos.z - f.platePos.z);
    const beside = smoothstep(Math.min(1, Math.max(0, (off - 0.9) / 0.55)));
    const coverShadow = this.rig.coverShadow;
    coverShadow.setFootprint(f.coverPos.x, f.coverPos.z);
    coverShadow.setHeight(f.dishVisible ? f.coverPos.y + (1 - beside) * 2 : 99, 1.2);
    n.bin_root!.position.copy(f.binPos);
    n.bin_root!.visible = f.binVisible;
    const [l, r] = flapAngles(f.flaps);
    this.rig.flapL.rotation.set(0, 0, l);
    this.rig.flapR.rotation.set(0, 0, r);
  }
}

async function fetchGlb(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw Object.assign(new Error(`asset ${res.status}`), { reason: 'asset-failure' as const });
  return res.arrayBuffer();
}

export const dinnerScene: SceneModule = {
  category: 'dinner',
  async load({ config, library, signal }: SceneLoadContext): Promise<SceneInstance> {
    if (config.category !== 'dinner') throw new Error('dinner scene given another config');
    const [dishBuffer, binBuffer] = await Promise.all([fetchGlb(glbUrl, signal), fetchGlb(binUrl, signal)]);
    const loader = new GLTFLoader();
    const [dish, bin] = await Promise.all([loader.parseAsync(dishBuffer, ''), loader.parseAsync(binBuffer, '')]);
    const root = dish.scene.getObjectByName('dinner_root');
    const binRoot = bin.scene.getObjectByName('bin_root');
    if (!root || !binRoot) throw Object.assign(new Error('missing dinner nodes'), { reason: 'asset-failure' as const });
    root.removeFromParent();
    binRoot.removeFromParent();
    bindMaterialsByName(root, library);
    bindMaterialsByName(binRoot, library);
    // The plate and cloche masters keep their own PBR materials: own environment for the
    // silver and the gilt, the Low tier's registry (models/imported.ts).
    prepareImported(root, library);
    finishDish(root);
    return new DinnerScene(rigDinner(root, binRoot, library), config);
  },
};
