import { Box3, type Camera, type MeshBasicMaterial, type Object3D, Quaternion, Vector3, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import glbUrl from '../../../assets/scenes/birthday/birthday.glb?url';
import binUrl from '../../../assets/shared/disposal-bin.glb?url';
import { rigBirthday, type BirthdayRig } from '../../../models/birthday.ts';
import { BIN_POS, BIN_YAW, WALL_Z } from '../../../models/birthdayContract.ts';
import type { CakePreset } from '../../../models/cake.ts';
import { flapAngles, openBinFramePoints } from '../../../models/disposalBin.ts';
import { disposeImported, loadMaterialVariants, prepareImported, setImportedLowDetail } from '../../../models/imported.ts';
import { bindMaterialsByName } from '../../../models/types.ts';
import type { SceneInstance, SceneLoadContext, SceneModule } from '../../core/sequence.ts';
import type { CanonicalPose, SceneConfig, SequenceName } from '../../core/types.ts';
import { birthdayFramePoints } from './framing.ts';
import { DURATIONS, LEAN, ON_STAND } from './poses.ts';
import { frameFor, LEAN_AXIS, newFrame, sampleSequence, type BirthdayFrame } from './sequences.ts';

const UP = new Vector3(0, 1, 0);

export class BirthdayScene implements SceneInstance {
  readonly category = 'birthday' as const;
  readonly root: Object3D;
  readonly bounds: Box3;
  readonly durations = DURATIONS;
  readonly animatedNodes: Object3D[];
  readonly studio = { wallZ: WALL_Z };
  readonly framePoints: Vector3[];

  private readonly frame = newFrame();
  private preset: CakePreset;
  private readonly qYaw = new Quaternion();

  constructor(readonly rig: BirthdayRig, config: Extract<SceneConfig, { category: 'birthday' }>) {
    this.root = rig.root;
    this.bounds = rig.bounds.clone();
    this.preset = config.cake;
    const n = rig.nodes;
    this.animatedNodes = [
      n.cake_authored!, n.cake_secondary!, n.bin_root!, rig.flapL, rig.flapR,
      ...rig.candles.flatMap((c) => [c.candle, c.flame, c.wick]),
    ];
    this.framePoints = [...birthdayFramePoints(), ...openBinFramePoints(n.bin_root!, BIN_POS, BIN_YAW)];
    this.pose('guest-ready');
  }

  setConfig(config: SceneConfig): void {
    if (config.category !== 'birthday' || config.cake === this.preset) return;
    this.preset = config.cake;
    this.rig.setPreset(config.cake);
  }

  pose(pose: CanonicalPose): void {
    this.apply(frameFor(pose, this.frame));
  }

  sample(sequence: SequenceName, t: number): void {
    this.apply(sampleSequence(sequence, t, this.frame));
  }

  /** From the bin (or on the way), a straight blend back would pull the cake through the stand. */
  interruptCut(): boolean {
    const f = this.frame;
    return f.binVisible || !f.cakeVisible || f.cakePos.distanceTo(ON_STAND) > 1e-3;
  }

  /** Low tier for the imported stand, frosting and candle materials (the library handles the rest). */
  setLowDetail(enabled: boolean): void {
    setImportedLowDetail(this.root, enabled);
  }

  async precompile(renderer: WebGLRenderer, camera: Camera): Promise<void> {
    // Warm both frostings, the bin and the wisps (made visible for the compile only).
    const scene = this.root.parent ?? this.root;
    const n = this.rig.nodes;
    n.bin_root!.visible = true;
    for (const c of this.rig.candles) c.wisp.visible = true;
    await renderer.compileAsync(scene, camera);
    this.rig.setPreset(this.preset === 'vanilla' ? 'cocoa' : 'vanilla');
    await renderer.compileAsync(scene, camera);
    this.rig.setPreset(this.preset);
    this.apply(this.frame);
  }

  dispose(): void {
    this.rig.dispose();
    disposeImported(this.root);
    this.root.traverse((o) => (o as { geometry?: { dispose(): void } }).geometry?.dispose());
    this.root.removeFromParent();
  }

  // ── internals ─────────────────────────────────────────────────────────────
  private apply(f: BirthdayFrame): void {
    const n = this.rig.nodes;
    n.cake_authored!.position.copy(f.cakePos);
    n.cake_authored!.visible = f.cakeVisible;
    // Carry lean about the horizontal axis across the carry, then the presentation yaw about the cake's own axis.
    n.cake_secondary!.quaternion.setFromAxisAngle(LEAN_AXIS, f.cakeLean).multiply(this.qYaw.setFromAxisAngle(UP, f.cakeYaw));
    this.rig.candles.forEach((c, i) => {
      c.candle.position.y = c.seatedY + (f.drop[i] ?? 0);
      const s = Math.max(f.flameScale[i] ?? 0, 0.0001), o = f.flameOpacity[i] ?? 0;
      c.flame.visible = o > 0.001;
      c.flame.scale.set(c.flameSize.x * s, c.flameSize.y * s, c.flameSize.z * s);
      c.flame.rotation.set(LEAN.x * (f.flameLean[i] ?? 0), 0, LEAN.z * (f.flameLean[i] ?? 0));
      c.flameMaterial.uniforms.uOpacity!.value = o;
      c.wick.rotation.set(LEAN.x * f.wickLean, 0, LEAN.z * f.wickLean);
      const wo = f.wispOpacity[i] ?? 0;
      c.wisp.visible = wo > 0.001;
      (c.wisp.material as MeshBasicMaterial).opacity = wo;
      c.wisp.position.y = c.flame.position.y + 0.01 + (f.wispRise[i] ?? 0);
    });
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

export const birthdayScene: SceneModule = {
  category: 'birthday',
  async load({ config, library, signal }: SceneLoadContext): Promise<SceneInstance> {
    if (config.category !== 'birthday') throw new Error('birthday scene given another config');
    const [cakeBuffer, binBuffer] = await Promise.all([fetchGlb(glbUrl, signal), fetchGlb(binUrl, signal)]);
    const loader = new GLTFLoader();
    const [cake, bin] = await Promise.all([loader.parseAsync(cakeBuffer, ''), loader.parseAsync(binBuffer, '')]);
    const root = cake.scene.getObjectByName('birthday_root');
    const binRoot = bin.scene.getObjectByName('bin_root');
    if (!root || !binRoot) throw Object.assign(new Error('missing birthday nodes'), { reason: 'asset-failure' as const });
    // Frosting presets live in the GLB (KHR_materials_variants); read them before detaching the root.
    const variants = await loadMaterialVariants(cake);
    root.removeFromParent();
    binRoot.removeFromParent();
    bindMaterialsByName(root, library);
    prepareImported(root, library, variants.materials);
    bindMaterialsByName(binRoot, library);
    const rig = rigBirthday(root, binRoot, library, config.cake, variants);
    return new BirthdayScene(rig, config);
  },
};

