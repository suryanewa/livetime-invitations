import type { Box3, Object3D, WebGLRenderer, Camera } from 'three';
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

  /** Swap preset materials/visibility. Called only at canonical poses. */
  setConfig(config: SceneConfig): void;
  /** Exact canonical pose (also resets transient visibility, opacity and emissive state). */
  pose(pose: CanonicalPose): void;
  /** Deterministic sample of a sequence at t seconds (clamped to [0, duration]). */
  sample(sequence: SequenceName, t: number): void;
  /** Advance bounded secondary motion by one fixed step. Never called under reduced motion. */
  simulate?(dt: number): void;
  /** True while any secondary offset (or pointer blend) still needs frames. */
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
  /** Called once per rendered frame, after sampling and simulation, before drawing. */
  beforeRender?(): void;
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
