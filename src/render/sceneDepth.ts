import {
  type Camera,
  DepthTexture,
  DoubleSide,
  FloatType,
  MeshBasicMaterial,
  NearestFilter,
  type Object3D,
  RedFormat,
  type Scene,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';

/**
 * v1.6 (the Dinner steam): the opaque scene's depth as a texture, for effects that need to know
 * where the solid scene is (a raymarched volume stops at the plate, the cloche and the table).
 *
 * Off unless asked for. A client registers itself (`requestSceneDepth`) and says, frame by frame,
 * whether it needs the depth (`active`); the stage's one hook (`SceneDepth.render`, before the
 * main render) does nothing at all for a scene with no active client, so every other scene's frame
 * is exactly what it was (no extra pass, no state change).
 *
 * When a client is active, the meshes marked on `SCENE_DEPTH_LAYER` (the client marks its
 * occluders: `markDepthOccluders`) are drawn depth-only into a float depth texture the size of the
 * drawing buffer, with the stage's camera: no lights, no shadow pass, no colour. Then each active
 * client's `prepare` runs with the texture (its offscreen passes, its uniforms), and the main render
 * follows as usual, with the client's own objects reading the depth in the transparent pass.
 */

/** The camera layer the depth pass draws (occluders carry it besides their own). */
export const SCENE_DEPTH_LAYER = 30;

/** What a client is given after the depth pass. */
export interface SceneDepthFrame {
  /** The opaque scene's depth (the projection's [0, 1] depth, nearest filtering). */
  texture: DepthTexture;
  /** Its size in pixels (the drawing buffer's). */
  size: Vector2;
  /** The camera it was drawn with (near/far for linearising), and the scene. */
  camera: Camera;
  scene: Scene;
}

export interface SceneDepthClient {
  /** The client's root: it is served only by a stage whose scene contains it. */
  readonly object: Object3D;
  /** Whether it needs the depth this frame (false: nothing is drawn for it). */
  active(): boolean;
  /** After the depth pass, before the main render. */
  prepare(renderer: WebGLRenderer, frame: SceneDepthFrame): void;
}

const clients = new Set<SceneDepthClient>();

/** Lights put on the depth layer for one pass (and taken off it after). */
const lit: Object3D[] = [];
const enableLight = (o: Object3D) => {
  if ((o as Object3D & { isLight?: boolean }).isLight && !o.layers.isEnabled(SCENE_DEPTH_LAYER)) {
    o.layers.enable(SCENE_DEPTH_LAYER);
    lit.push(o);
  }
};

/** Register a client; returns its unregistration. */
export function requestSceneDepth(client: SceneDepthClient): () => void {
  clients.add(client);
  return () => clients.delete(client);
}

/** Put the opaque meshes under `root` on the depth layer (skipping transparent, invisible-proxy and `noSceneDepth` meshes). */
export function markDepthOccluders(root: Object3D): void {
  root.traverse((o) => {
    const m = o as Object3D & { isMesh?: boolean; material?: { transparent?: boolean; colorWrite?: boolean } | unknown[] };
    if (!m.isMesh || o.userData.shadowProxy || o.userData.noSceneDepth) return;
    const mat = Array.isArray(m.material) ? m.material[0] as { transparent?: boolean; colorWrite?: boolean } : m.material;
    if (mat?.transparent || mat?.colorWrite === false) return;
    o.layers.enable(SCENE_DEPTH_LAYER);
  });
}

/** Is `object` in `scene` and drawn (it and every ancestor visible)? */
function drawnIn(object: Object3D, scene: Scene): boolean {
  let o: Object3D | null = object;
  while (o) {
    if (!o.visible) return false;
    if (o === scene) return true;
    o = o.parent;
  }
  return false;
}

/** One per stage: the depth target and the pass. */
export class SceneDepth {
  private target: WebGLRenderTarget | null = null;
  private readonly material = new MeshBasicMaterial({ name: 'fx_scene_depth', colorWrite: false, side: DoubleSide });
  private readonly size = new Vector2();
  private readonly frame: SceneDepthFrame = { texture: null as unknown as DepthTexture, size: this.size, camera: null as unknown as Camera, scene: null as unknown as Scene };
  /** Frames the pass ran (tooling, tests). */
  passes = 0;

  /**
   * The hook: before the main render. Returns whether a pass was drawn. With no active client in
   * `scene` it returns at once and touches nothing.
   */
  render(renderer: WebGLRenderer, scene: Scene, camera: Camera): boolean {
    let served: SceneDepthClient[] | null = null;
    if (clients.size) for (const c of clients) if (drawnIn(c.object, scene) && c.active()) (served ??= []).push(c);
    if (!served) {
      // Nothing needs it: free the target (no GPU memory is held for scenes that do not ask; a
      // scene switch must leave nothing behind). Without one, nothing at all is touched.
      if (this.target) this.release();
      return false;
    }

    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, this.size.x), h = Math.max(1, this.size.y);
    if (!this.target) {
      const depth = new DepthTexture(w, h, FloatType);
      depth.minFilter = depth.magFilter = NearestFilter;
      // A one-byte colour attachment (never written: the material has no colour write).
      this.target = new WebGLRenderTarget(w, h, { format: RedFormat, type: UnsignedByteType, depthBuffer: true, depthTexture: depth, samples: 0 });
      this.target.texture.name = 'fx_scene_depth_colour';
    } else if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);

    const prevTarget = renderer.getRenderTarget();
    const prevMask = camera.layers.mask;
    const prevOverride = scene.overrideMaterial;
    const prevBackground = scene.background;
    const prevAutoClear = renderer.autoClear;
    // Only the occluders, depth only: no lights are on this layer, so no lighting setup and no
    // shadow pass (the shadow map's own update flag is left as it was).
    camera.layers.set(SCENE_DEPTH_LAYER);
    scene.overrideMaterial = this.material;
    scene.background = null;
    renderer.autoClear = true;
    renderer.setRenderTarget(this.target);
    // The scene's lights take part (three keeps one light state per scene: a pass without them bumps
    // its version, and every lit material then looks its program up again in the main pass, ≈0.5 ms
    // a frame at the laptop size; the bloom pass does the same), but the shadow map is never drawn
    // here (it is the main pass's, and may be due once).
    scene.traverse(enableLight);
    const shadows = renderer.shadowMap as WebGLRenderer['shadowMap'] | undefined;
    const autoShadow = shadows?.autoUpdate ?? false, dueShadow = shadows?.needsUpdate ?? false;
    if (shadows) shadows.autoUpdate = shadows.needsUpdate = false;
    renderer.render(scene, camera);
    if (shadows) {
      shadows.autoUpdate = autoShadow;
      shadows.needsUpdate = dueShadow;
    }
    for (const l of lit) l.layers.disable(SCENE_DEPTH_LAYER);
    lit.length = 0;
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;
    scene.background = prevBackground;
    scene.overrideMaterial = prevOverride;
    camera.layers.mask = prevMask;
    this.passes++;

    this.frame.texture = this.target.depthTexture!;
    this.frame.camera = camera;
    this.frame.scene = scene;
    for (const c of served) c.prepare(renderer, this.frame);
    return true;
  }

  private release(): void {
    this.target?.depthTexture?.dispose();
    this.target?.dispose();
    this.target = null;
  }

  /** Whether a depth target is held (only while a client is active). */
  get allocated(): boolean {
    return this.target !== null;
  }

  dispose(): void {
    this.release();
    this.material.dispose();
  }
}
