import type { Box3, Object3D, Scene, WebGLRenderer, Camera, Vector3 } from 'three';
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

/**
 * v1.5: what a scene loads after it is ready (the shared bin, 6.6 MB, which only the decline
 * needs): the stage's pieces it compiles and uploads with, and how it hands new parts to the stage.
 */
export interface DeferredContext {
  renderer: WebGLRenderer;
  /** The stage's scene (the content is in it) and camera. */
  scene: Scene;
  camera: Camera;
  /** Parts added under the content after it was set get what content gets: shadows, own environment. */
  adopt(object: Object3D): void;
  /** Resolves at the next idle moment between frames (the browser's idle callback, or a timeout). */
  idle(): Promise<void>;
  /** True while a sequence plays: background work waits it out (it never costs a sequence a frame). */
  busy(): boolean;
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
  /**
   * v1.7: this scene's hero fill (src/render/framing.ts), when it differs from the shared
   * HERO_FILL: Sports frames its board, rim, net and ball at the largest fill that keeps every path
   * inside PATH_CLEARANCE (#43). Omitted: HERO_FILL.
   */
  readonly heroFill?: { readonly height: number; readonly width: number };
  /**
   * v1.5 decline pull-back (docs/style-reference.md): the subset of `framePoints` that must be in
   * frame at rest, the host and accept paths. A scene whose decline needs more room (the carry
   * over the bin) gives it, and the stage keeps two fits: `rest` (hero + these) and `decline`
   * (hero + every path). Omitted, the two are one (`framePull` then changes nothing).
   */
  readonly restFramePoints?: readonly Vector3[];

  /**
   * v1.5 decline pull-back: where the camera is between the rest fit (0) and the decline fit (1),
   * read by the controller every frame before drawing. A pure function of what the scene shows:
   * its current sequence and time (the decline's dolly out and, on a change of mind, its rewind),
   * 1 at the declined pose, 0 at every other pose; so it is deterministic, replay-safe and the same
   * under reduced motion (which shows poses only: the camera cuts with the pose). Omitted: 0.
   */
  framePull?(): number;

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
  /**
   * v1.5 deferred assets (the shared bin). `needs(target)`: true while the sequence or pose cannot
   * be shown yet; `ensure` resolves once it can (loaded, attached and warmed: its programs
   * compiled and its textures uploaded), rejecting if the asset failed. `prefetch` does the same in
   * the background after ready, in idle moments. Omitted: everything was loaded up front.
   */
  needs?(target: SequenceName | CanonicalPose): boolean;
  ensure?(target: SequenceName | CanonicalPose, context: DeferredContext): Promise<void>;
  prefetch?(context: DeferredContext): Promise<void>;
  dispose(): void;
}

export interface SceneModule {
  readonly category: Category;
  load(context: SceneLoadContext): Promise<SceneInstance>;
}

export function finalPose(sequence: SequenceName): CanonicalPose {
  return sequence === 'host' ? 'guest-ready' : sequence === 'accept' ? 'accepted' : 'declined';
}
