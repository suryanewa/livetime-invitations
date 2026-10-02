import type { Box3, Object3D, WebGLRenderer, Camera, Vector3 } from 'three';
import type { MaterialLibrary } from '../render/materials.ts';
import type { CanonicalPose, Category, SceneConfig, SequenceName } from './types.ts';

/**
 * Scene contract. The controller knows scene ids and sequence capabilities, never
 * individual node names (Master §8). Every sequence is a pure function of time so replay,
 * interruption and frame-rate changes cannot accumulate state.
 */

export interface SceneLoadContext {
  config: SceneConfig;
  library: MaterialLibrary;
  assetBase: string;
  signal: AbortSignal;
}

export interface PointerHit {
  /** True when the pointer landed on the scene's optional manipulation target. */
  captured: boolean;
}

/** Optional direct manipulation (Business only). Never affects the chosen response. */
export interface ScenePointer {
  /** Whether manipulation is currently allowed (after a choice, during the approach). */
  enabled(): boolean;
  hitTest(ndcX: number, ndcY: number, camera: Camera): boolean;
  begin(ndcX: number, ndcY: number, camera: Camera): void;
  move(ndcX: number, ndcY: number, camera: Camera): void;
  /** Release or cancel: blend back to the authored path. */
  end(cancelled: boolean): void;
  /** Screen-space rectangle of the manipulation target in NDC [x0, y0, x1, y1], or null. */
  screenRect(camera: Camera): [number, number, number, number] | null;
}

export interface SceneInstance {
  readonly category: Category;
  readonly root: Object3D;
  /** Complete motion bounds for every authored path, used for camera fit. */
  readonly bounds: Box3;
  readonly durations: Readonly<Record<SequenceName, number>>;
  /** Nodes whose local transforms the interruption blend may interpolate. */
  readonly animatedNodes: readonly Object3D[];
  /**
   * Optional studio adjustments (premium stage), e.g. a deeper backdrop for far-back motion.
   * `wallZ` in the scene's units; `scale` the set's scale (default: the root's scale, the scene's
   * world scale, v1.4): the cove and the key's throw scale with the scene (src/render/rig.ts).
   */
  readonly studio?: { wallZ?: number; scale?: number };
  /** Optional silhouette samples of every authored path for a tighter camera fit than the box. */
  readonly framePoints?: readonly Vector3[];
  /**
   * Silhouette samples of the objects on stage at guest-ready (v1.4 framing rule,
   * src/render/framing.ts): the camera distance makes them fill HERO_FILL of the frame.
   */
  readonly heroPoints?: readonly Vector3[];

  /** Swap preset materials/visibility. Called only at canonical poses. */
  setConfig(config: SceneConfig): void;
  /** Exact canonical pose (also resets transient visibility, opacity and emissive state). */
  pose(pose: CanonicalPose): void;
  /** Deterministic sample of a sequence at t seconds (clamped to [0, duration]). */
  sample(sequence: SequenceName, t: number): void;
  /**
   * Advance secondary motion by one step (at most 1/120 s; v1.5: a frame's steps sum exactly to
   * its clock delta, so motion that runs on here is as smooth as a sampled sequence). Never
   * called under reduced motion, nor while the stage is hidden or off-screen.
   */
  simulate?(dt: number): void;
  /**
   * True while any secondary offset (or pointer blend) still needs frames. A scene may keep it
   * true indefinitely for motion that runs on (v1.5: Party's playing record): the controller
   * then draws only while the stage is visible (a hidden tab or an off-screen stage suspends the
   * loop and pauses the clock).
   */
  settling?(): boolean;
  /** Snap secondary offsets to rest (reduced motion, interruption, settle deadline). */
  settle?(): void;
  pointer?: ScenePointer;
  /** Optional manipulation holds the timeline while active. */
  holding?(): boolean;
  /** One-shot timeline jump requested by the scene (e.g. early scan on contact). */
  takeSeek?(): number | null;
  /** Recompute derived state (strap curves, shadows) from current node transforms. */
  refresh?(): void;
  /** Interruption would blend objects through each other: cut to guest-ready instead. */
  interruptCut?(): boolean;
  /** Called once per rendered frame, after sampling and simulation, before drawing. */
  beforeRender?(): void;
  /**
   * Low tier for materials outside the locked library (imported scan-to-CAD masters,
   * `models/imported.ts`): the controller calls it next to `MaterialLibrary.setLowDetail`
   * whenever the tier is applied, with `true` on Low. Optional: scenes without imported
   * materials omit it.
   */
  setLowDetail?(enabled: boolean): void;
  /** Warm shader programs for every material/preset variant before declaring ready. */
  precompile?(renderer: WebGLRenderer, camera: Camera): Promise<void>;
  dispose(): void;
}

export interface SceneModule {
  readonly category: Category;
  load(context: SceneLoadContext): Promise<SceneInstance>;
}

export function finalPose(sequence: SequenceName): CanonicalPose {
  return sequence === 'host' ? 'guest-ready' : sequence === 'accept' ? 'accepted' : 'declined';
}
