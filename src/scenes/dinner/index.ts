import { Box3, type Camera, type Object3D, Vector3, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import glbUrl from '../../../assets/scenes/dinner/dinner.glb?url';
import binUrl from '../../../assets/shared/disposal-bin.glb?url';
import {
  COVER, COVER_BESIDE, COVER_POISED, COVER_SEATED, COVER_TOP, DINNER_BIN_POS, DINNER_BIN_YAW, DINNER_WALL_Z, DISH_HEIGHT, PLATE, rigDinner,
  type DinnerRig, type DishPreset,
} from '../../../models/dinner.ts';
import { flapAngles, openBinFramePoints } from '../../../models/disposalBin.ts';
import { bindMaterialsByName } from '../../../models/types.ts';
import type { SceneInstance, SceneLoadContext, SceneModule } from '../../core/sequence.ts';
import type { CanonicalPose, SceneConfig, SequenceName } from '../../core/types.ts';
import { smoothstep } from '../../motion/curves.ts';
import { coverBlendSafe, DURATIONS, frameFor, newFrame, sampleSequence, type DinnerFrame } from './sequences.ts';

/**
 * Silhouette samples of every Dinner path: dish, poised and resting cover and the carry. The
 * scene adds the open bin from its geometry (openBinFramePoints).
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
  ring(0, 0, COVER.radius * 0.35, PLATE.well + COVER_TOP, 8);
  ring(COVER_BESIDE.x, COVER_BESIDE.z, COVER.radius, 0);
  ring(COVER_BESIDE.x, COVER_BESIDE.z, COVER.radius * 0.35, COVER_TOP, 8);
  ring(COVER_POISED.x, COVER_POISED.z, COVER.radius, COVER_POISED.y);
  ring(COVER_POISED.x, COVER_POISED.z, COVER.radius * 0.4, COVER_POISED.y + COVER_TOP, 8);
  const f = newFrame();
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
  private preset: DishPreset;

  constructor(readonly rig: DinnerRig, config: Extract<SceneConfig, { category: 'dinner' }>) {
    this.root = rig.root;
    this.bounds = rig.bounds.clone();
    this.preset = config.dish;
    const n = rig.nodes;
    this.animatedNodes = [n.plate_authored!, n.cover_authored!, n.bin_root!, rig.flapL, rig.flapR];
    this.framePoints = [...dinnerFramePoints(), ...openBinFramePoints(n.bin_root!, DINNER_BIN_POS, DINNER_BIN_YAW)];
    this.pose('guest-ready');
  }

  setConfig(config: SceneConfig): void {
    if (config.category !== 'dinner' || config.dish === this.preset) return;
    this.preset = config.dish;
    this.rig.setPreset(config.dish);
  }

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

  async precompile(renderer: WebGLRenderer, camera: Camera): Promise<void> {
    // Warm both foods and the bin (shown for the compile only).
    const scene = this.root.parent ?? this.root;
    const n = this.rig.nodes;
    n.bin_root!.visible = true;
    n.food_pasta!.visible = n.food_vegetables!.visible = true;
    await renderer.compileAsync(scene, camera);
    this.rig.setPreset(this.preset);
    this.apply(this.frame);
  }

  dispose(): void {
    this.rig.dispose();
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
    shadow.visible = f.dishVisible;
    shadow.setFootprint(f.platePos.x, f.platePos.z);
    shadow.setHeight(f.platePos.y, 1.4);
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
    return new DinnerScene(rigDinner(root, binRoot, library, config.dish), config);
  },
};
