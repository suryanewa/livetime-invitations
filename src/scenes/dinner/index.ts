import { Box3, type Camera, type Object3D, Vector3, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import glbUrl from '../../../assets/scenes/dinner/dinner.glb?url';
import binUrl from '../../../assets/shared/disposal-bin.glb?url';
import {
  COVER, COVER_BESIDE, COVER_POISED, COVER_SEATED, COVER_TOP, DINNER_BIN_POS, DINNER_BIN_YAW, DINNER_WALL_Z, DISH_HEIGHT, PLATE, rigDinner,
  type DinnerRig, type DishPreset,
} from '../../../models/dinner.ts';
import { BIN, flapAngles } from '../../../models/disposalBin.ts';
import { bindMaterialsByName } from '../../../models/types.ts';
import type { SceneInstance, SceneLoadContext, SceneModule } from '../../core/sequence.ts';
import type { CanonicalPose, SceneConfig, SequenceName } from '../../core/types.ts';
import { DURATIONS, frameFor, newFrame, sampleSequence, type DinnerFrame } from './sequences.ts';

/** Silhouette samples of every Dinner path: dish, poised and resting cover, carry, open bin. */
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
  ring(DINNER_BIN_POS.x, DINNER_BIN_POS.z, BIN.radius, 0);
  ring(DINNER_BIN_POS.x, DINNER_BIN_POS.z, BIN.radius, BIN.rimTop);
  // Open flaps: half-discs standing on their hinges (tallest mid-hinge), turned with the bin.
  const c = Math.cos(DINNER_BIN_YAW), s = Math.sin(DINNER_BIN_YAW);
  const flapR = BIN.radius + 0.022, lean = Math.cos(BIN.flapOpen), rise = Math.sin(BIN.flapOpen);
  for (const side of [-1, 1]) {
    for (let k = 0; k <= 16; k++) {
      const lz = -flapR + (2 * flapR * k) / 16;
      const reach = Math.sqrt(Math.max(0, flapR * flapR - lz * lz));
      for (const out of [0, 0.11]) {
        const lx = side * (BIN.hingeX - reach * lean + out);
        pts.push(new Vector3(DINNER_BIN_POS.x + lx * c + lz * s, BIN.rimTop + reach * rise + (out ? 0 : 0.11 * Math.abs(lean)), DINNER_BIN_POS.z - lx * s + lz * c));
      }
    }
  }
  return pts;
}

export class DinnerScene implements SceneInstance {
  readonly category = 'dinner' as const;
  readonly root: Object3D;
  readonly bounds: Box3;
  readonly durations = DURATIONS;
  readonly animatedNodes: Object3D[];
  readonly studio = { wallZ: DINNER_WALL_Z };
  readonly framePoints = dinnerFramePoints();

  private readonly frame = newFrame();
  private preset: DishPreset;

  constructor(readonly rig: DinnerRig, config: Extract<SceneConfig, { category: 'dinner' }>) {
    this.root = rig.root;
    this.bounds = rig.bounds.clone();
    this.preset = config.dish;
    const n = rig.nodes;
    this.animatedNodes = [n.plate_authored!, n.cover_authored!, n.bin_root!, rig.flapL, rig.flapR];
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
    const coverAside = Math.hypot(f.coverPos.x - COVER_SEATED.x, f.coverPos.z - COVER_SEATED.z) > 0.05;
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
    n.cover_authored!.rotation.set(0, 0, f.coverTilt);
    n.cover_authored!.visible = f.dishVisible;
    // The dish shadow follows the plate and softens as it is carried up and away.
    const shadow = this.rig.dishShadow;
    shadow.visible = f.dishVisible;
    shadow.setFootprint(f.platePos.x, f.platePos.z);
    shadow.setHeight(f.platePos.y, 1.4);
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
