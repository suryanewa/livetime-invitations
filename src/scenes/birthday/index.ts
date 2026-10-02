import { Box3, type Camera, type Object3D, Quaternion, Vector3, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import glbUrl from '../../../assets/scenes/birthday/birthday.glb?url';
import binUrl from '../../../assets/shared/disposal-bin.glb?url';
import { rigBirthday, type BirthdayRig } from '../../../models/birthday.ts';
import { poseFlame } from '../../../models/birthdayFire.ts';
import { BIN_POS, BIN_YAW, WALL_Z } from '../../../models/birthdayContract.ts';
import type { CakePreset } from '../../../models/cake.ts';
import { BIN, flapAngles, openBinFramePoints } from '../../../models/disposalBin.ts';
import { disposeImported, loadMaterialVariants, prepareImported, setImportedLowDetail } from '../../../models/imported.ts';
import { bindMaterialsByName } from '../../../models/types.ts';
import { silhouettePoints } from '../../render/framing.ts';
import type { SceneInstance, SceneLoadContext, SceneModule } from '../../core/sequence.ts';
import type { CanonicalPose, SceneConfig, SequenceName } from '../../core/types.ts';
import { birthdayFramePoints } from './framing.ts';
import { DURATIONS, ON_STAND } from './poses.ts';
import { frameFor, LEAN_AXIS, newFrame, sampleSequence, type BirthdayFrame } from './sequences.ts';
import { EMBER, emberAt, FLAME_REST, FLICKER, flicker, newFlicker, SMOKE } from './fire.ts';

const UP = new Vector3(0, 1, 0);

export class BirthdayScene implements SceneInstance {
  readonly category = 'birthday' as const;
  readonly root: Object3D;
  readonly bounds: Box3;
  /** Silhouette of the objects on stage at guest-ready: the v1.4 framing rule's hero. */
  readonly heroPoints: Vector3[];
  readonly durations = DURATIONS;
  readonly animatedNodes: Object3D[];
  readonly studio = { wallZ: WALL_Z };
  readonly framePoints: Vector3[];

  private readonly frame = newFrame();
  private preset: CakePreset;
  private readonly qYaw = new Quaternion();
  private readonly rimWorld = new Vector3();

  // ── Fire: the secondary channel (v1.5) ──
  /** Live clock (s) the flicker is sampled at; `simulate` advances it. */
  private liveTime = 0;
  /** Flicker gain: 0 after settle() (still flames), back to 1 over FLICKER.resume while simulating. */
  private flickerGain = 0;
  /** Smoke tail: the accept time the smoke and embers continue at after the sequence ends (null: none). */
  private tail: number | null = null;
  /** The last sampled sequence and time (the tail starts where accept left off). */
  private last: { sequence: SequenceName; t: number } | null = null;
  private readonly flicker = newFlicker();
  private readonly wicks: [number, number, number][];
  private readonly wickTmp = new Vector3();

  constructor(readonly rig: BirthdayRig, config: Extract<SceneConfig, { category: 'birthday' }>) {
    this.root = rig.root;
    this.bounds = rig.bounds.clone();
    this.preset = config.cake;
    const n = rig.nodes;
    this.animatedNodes = [
      n.cake_authored!, n.cake_secondary!, n.bin_root!, rig.flapL, rig.flapR,
      ...rig.candles.map((c) => c.candle),
    ];
    this.wicks = rig.candles.map(() => [0, 0, 0]);
    this.framePoints = [...birthdayFramePoints(), ...openBinFramePoints(n.bin_root!, BIN_POS, BIN_YAW)];
    this.pose('guest-ready');
    // The hero: every real mesh (the fire's camera-facing quads and ribbons excluded), plus each
    // steady flame's envelope (tip and widest ring).
    this.heroPoints = [...silhouettePoints(this.root, (o) => !!o.userData.fx), ...this.flamePoints()];
  }

  /** Steady flames' silhouettes in the root's space: tip and the widest ring of each. */
  private flamePoints(): Vector3[] {
    const pts: Vector3[] = [];
    this.root.updateMatrixWorld(true);
    const toRoot = this.root.matrixWorld.clone().invert();
    for (const c of this.rig.candles) {
      const w = c.fire.wickTip;
      const at = (x: number, y: number, z: number) => pts.push(new Vector3(x, y, z).applyMatrix4(c.candle.matrixWorld).applyMatrix4(toRoot));
      at(w.x, FLAME_REST.base + FLAME_REST.length, w.z);
      const y = FLAME_REST.base + FLAME_REST.widest * FLAME_REST.length;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        at(w.x + Math.cos(a) * FLAME_REST.radius, y, w.z + Math.sin(a) * FLAME_REST.radius);
      }
    }
    return pts;
  }

  setConfig(config: SceneConfig): void {
    if (config.category !== 'birthday' || config.cake === this.preset) return;
    this.preset = config.cake;
    this.rig.setPreset(config.cake);
  }

  pose(pose: CanonicalPose): void {
    // The accept sequence ending on its own pose hands the smoke over to the live clock: it keeps
    // rising from where the sequence left it (the canonical pose itself carries none).
    const last = this.last;
    this.tail = pose === 'accepted' && last?.sequence === 'accept' && last.t > DURATIONS.accept - 0.25 ? last.t : null;
    this.last = null;
    this.apply(frameFor(pose, this.frame));
  }

  sample(sequence: SequenceName, t: number): void {
    this.tail = null;
    this.last = { sequence, t };
    this.apply(sampleSequence(sequence, t, this.frame));
  }

  /** Live flames and smoke: the flicker clock, the smoke tail after accept. Never under reduced motion. */
  simulate(dt: number): void {
    this.liveTime += dt;
    this.flickerGain = Math.min(1, this.flickerGain + dt / FLICKER.resume);
    if (this.tail !== null) {
      this.tail += dt;
      if (this.tail >= SMOKE.end) this.tail = null;
    }
  }

  /** Frames are needed while any flame burns (it flickers) or smoke is still rising. */
  settling(): boolean {
    return this.tail !== null || this.frame.flames.some((f) => f.intensity > 0);
  }

  /** Rest: still flames (no flicker) and no smoke. */
  settle(): void {
    this.flickerGain = 0;
    this.tail = null;
  }

  /** Accept time the ember and smoke are drawn at (−1: none). */
  private smokeClock(): number {
    return this.frame.smokeTime >= 0 ? this.frame.smokeTime : this.tail ?? -1;
  }

  /** Compose the authored flames with the live flicker, the embers and the smoke, and draw them. */
  beforeRender(): void {
    const f = this.frame;
    const clock = this.smokeClock();
    const g = this.flickerGain;
    const gain = g * g * (3 - 2 * g);
    this.rig.candles.forEach((c, i) => {
      const flame = f.flames[i]!;
      flicker(i, this.liveTime, flame.intensity > 0 ? gain : 0, this.flicker);
      // The wick glows inside a burning flame; bare after the breath, it flares and cools.
      const ember = clock >= 0 ? emberAt(i, clock) : EMBER.lit * flame.lit * (flame.out ? 0 : 1);
      poseFlame(c.fire, c.candle, flame, this.flicker, ember);
      // Wick tip in cake_secondary space, for the smoke.
      const w = this.wickTmp.copy(c.fire.wickTip).applyQuaternion(c.candle.quaternion).add(c.candle.position);
      this.wicks[i]![0] = w.x;
      this.wicks[i]![1] = w.y;
      this.wicks[i]![2] = w.z;
    });
    this.rig.smoke.update(clock, this.wicks);
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
    // Warm both frostings, the bin, the flames and the smoke (made visible for the compile only).
    const scene = this.root.parent ?? this.root;
    const n = this.rig.nodes;
    n.bin_root!.visible = true;
    for (const c of this.rig.candles) c.fire.quad.visible = true;
    this.rig.smoke.mesh.visible = true;
    this.rig.smoke.puffMesh.visible = true;
    await renderer.compileAsync(scene, camera);
    this.rig.setPreset(this.preset === 'vanilla' ? 'cocoa' : 'vanilla');
    await renderer.compileAsync(scene, camera);
    this.rig.setPreset(this.preset);
    this.apply(this.frame);
    this.beforeRender();
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
    // Bin shade on the cake's materials once it is over the opening (rim height in world space).
    this.root.updateWorldMatrix(true, false);
    this.rig.binShade.rimY.value = this.rimWorld.set(0, BIN.rimTop, 0).applyMatrix4(this.root.matrixWorld).y;
    this.rig.binShade.on.value = f.cakeInBin ? 1 : 0;
    // Carry lean about the horizontal axis across the carry, then the presentation yaw about the cake's own axis.
    n.cake_secondary!.quaternion.setFromAxisAngle(LEAN_AXIS, f.cakeLean).multiply(this.qYaw.setFromAxisAngle(UP, f.cakeYaw));
    this.rig.candles.forEach((c, i) => {
      c.candle.position.y = c.seatedY + (f.drop[i] ?? 0);
    });
    // The flames, embers and smoke are drawn in beforeRender (with the live flicker on top).
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

