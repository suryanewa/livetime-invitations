import { Box3, Color, type Material, Mesh, type MeshStandardMaterial, Object3D, type OrthographicCamera, PCFShadowMap, PerspectiveCamera, Scene, type Texture, Vector3, VSMShadowMap, type WebGLRenderer } from 'three';
import {
  createStageCamera, type FrameInsets, type FrameRect, type FramingPair, frameSquare, fitCameraToBounds, fitPerspectiveToBounds, framingHull, PERSPECTIVE_FOV, placeHeroView,
  pulledView, solveHeroFits,
} from './camera.ts';
import { HERO_FILL, PATH_CLEARANCE } from './framing.ts';
import { createRenderer, sizeRenderer } from './createRenderer.ts';
import { releaseShadowTextureGpu } from './contactShadow.ts';
import { STUDY_RIG } from './lighting.ts';
import type { Rig, RigBuild } from './rig.ts';
import { resolveRig } from './rigRegistry.ts';
import { smoothPcf } from './studio.ts';
import { releaseCachedTextureGpu } from './textures.ts';
import { shadowProxyMaterial } from '../../models/shadowProxy.ts';

const extent = new Box3();
const aimPoint = new Vector3();
const boxCorners = (b: Box3) => Array.from({ length: 8 }, (_, i) => new Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
/**
 * Draw-call economy for the shadow pass: flat decals (printed rings, status window, symbols,
 * hole floors) and tiny parts cast nothing visible under the soft filter, so they skip it.
 * Runtime-built lanyard strands always cast.
 */
function castsVisibleShadow(m: Mesh): boolean {
  if (m.name.startsWith('lanyard')) return true;
  const g = m.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  extent.copy(g.boundingBox!);
  const x = extent.max.x - extent.min.x, y = extent.max.y - extent.min.y, z = extent.max.z - extent.min.z;
  return Math.min(x, y, z) > 0.015 && Math.max(x, y, z) > 0.05;
}

/**
 * three r186 shares one DFG lookup texture across every renderer on the page. Each renderer that
 * uploads it adds a dispose listener that renderer.dispose() leaves behind, so the LUT keeps every
 * disposed renderer (and its context) reachable. Disposing the LUT drops all those listeners;
 * live renderers upload it again on their next draw. three does not export it: it is found
 * through a drawn material's uniforms, and remembered for stages whose materials are gone.
 */
let dfgLUT: Texture | null = null;
function releaseDfgLUT(renderer: WebGLRenderer, scene: Scene): void {
  scene.traverse((o) => {
    const m = (o as Mesh).material as Material | Material[] | undefined;
    for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
      if (dfgLUT) return;
      const uniforms = (renderer.properties.get(mat) as { uniforms?: { dfgLUT?: { value?: Texture | null } } }).uniforms;
      dfgLUT = uniforms?.dfgLUT?.value ?? null;
    }
  });
  dfgLUT?.dispose();
}

/**
 * What `InvitationHandle.framing()` reports (tooling and tests, v1.5): the two fits at an aspect,
 * where the live camera is between them, and the fit's cost guards.
 */
export interface FramingReport extends FramingPair {
  /** The live pull (0 rest, 1 decline). */
  pull: number;
  /** Hero fits solved since the stage was made (the render loop never solves one). */
  solves: number;
  /** Points the fit works on, after framingHull. */
  points: { hero: number; rest: number; decline: number };
}

export interface StageOptions {
  canvas?: HTMLCanvasElement;
  preserveDrawingBuffer?: boolean;
  /**
   * Studio rig (src/render/rigs/): a registered name or a Rig. Omitted, the stage uses the study
   * rig (checkpoint-1 L light on a flat ground, no backdrop or shadow map) that the study and
   * lookdev pages compare against; the controller always passes one.
   */
  rig?: Rig | string;
  /** Perspective (default, the product camera) or the orthographic study camera. */
  projection?: 'orthographic' | 'perspective';
  /** Vertical field of view of the perspective camera, degrees. */
  fov?: number;
}

/**
 * One live canvas: renderer, shared camera, studio rig and a single content slot.
 * Scenes own their content; the stage owns lifecycle of GPU-side shared resources.
 */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: OrthographicCamera | PerspectiveCamera;
  /** The rig this stage is lit by, and what its build allocated. */
  readonly rig: Rig;
  readonly studio: RigBuild;
  private readonly aim = new Object3D();
  private content: Object3D | null = null;
  private bounds = new Box3();
  private cssWidth = 1;
  private cssHeight = 1;
  private dprCap = 2;

  static create(options: StageOptions = {}): Stage | null {
    const result = createRenderer(options);
    return result.ok ? new Stage(result.renderer, options) : null;
  }

  private constructor(renderer: WebGLRenderer, options: StageOptions) {
    this.renderer = renderer;
    this.rig = typeof options.rig === 'string' ? resolveRig(options.rig) : (options.rig ?? STUDY_RIG);
    this.camera = options.projection === 'orthographic' ? createStageCamera() : new PerspectiveCamera(options.fov ?? PERSPECTIVE_FOV, 1, 0.5, 200);
    const rig = this.rig;
    renderer.toneMapping = rig.toneMapping;
    renderer.toneMappingExposure = rig.exposure;
    this.scene.background = new Color(rig.stageColor);
    this.scene.add(this.aim);
    this.studio = rig.build({ renderer, scene: this.scene, target: this.aim });
    this.scene.environment = this.studio.environment;
    this.scene.environmentIntensity = rig.environmentIntensity;
    if (this.studio.objects.length) this.scene.add(...this.studio.objects);
    const key = this.studio.shadowKey;
    if (rig.shadows && !key) console.warn(`Rig ${rig.name} declares shadows but its build() returns no shadowKey; no real-time shadow`);
    if (rig.shadows && key) {
      const sh = rig.shadows;
      if (sh.filter === 'vogel16') smoothPcf();
      renderer.shadowMap.type = sh.filter === 'vsm' ? VSMShadowMap : PCFShadowMap;
      const shadow = key.shadow;
      shadow.mapSize.set(sh.mapSize, sh.mapSize);
      shadow.radius = sh.radius;
      shadow.bias = sh.bias;
      shadow.normalBias = sh.normalBias;
      if (sh.near !== undefined) shadow.camera.near = sh.near;
      if (sh.far !== undefined) shadow.camera.far = sh.far;
      this.setShadows(true);
    }
  }

  /** The scene's world scale the set is sized to (v1.4; rig.ts setWall). */
  private studioScale = 1;

  /** The rig's shadow camera range and normal bias, in proportion to the set (v1.4). */
  private scaleShadow(): void {
    const sh = this.rig.shadows, key = this.studio.shadowKey;
    if (!sh || !key) return;
    const s = this.studioScale;
    key.shadow.normalBias = sh.normalBias * s;
    if (sh.near !== undefined) key.shadow.camera.near = sh.near * s;
    if (sh.far !== undefined) key.shadow.camera.far = sh.far * s;
    key.shadow.camera.updateProjectionMatrix();
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Whether this rig casts real-time shadows onto its backdrop. */
  get shadowed(): boolean {
    return !!(this.rig.shadows && this.studio.shadowKey);
  }

  /** Shadows on (Normal/High) or off (Low/Static); off frees the shadow map. */
  setShadows(enabled: boolean): void {
    const key = this.studio.shadowKey;
    if (!this.rig.shadows || !key) return;
    this.renderer.shadowMap.enabled = enabled;
    key.castShadow = enabled;
    if (!enabled && key.shadow.map) {
      // Free the depth target (and its depth texture); three rebuilds it when shadows return.
      key.shadow.map.dispose();
      key.shadow.map = null;
    }
    this.renderer.shadowMap.needsUpdate = true;
    this.studio.setShadows?.(enabled);
  }

  /**
   * Low/Static tier: the rig drops its expensive detail (gobo resolution, backdrop relief). A rig
   * that sets `metalEnvIntensity` keeps it on every tier: the material libraries' Low tier (called
   * before this) softens ownEnv materials to 0.8 and restores their saved values on the way back,
   * so the rig's value is applied again after them.
   */
  setLowDetail(enabled: boolean): void {
    this.studio.setLowDetail?.(enabled);
    if (this.content) this.applyMetalEnvIntensity(this.content);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /**
   * `heroPoints` (v1.4): silhouette samples of the objects on stage at guest-ready. With them the
   * perspective camera follows the hero framing rule (src/render/framing.ts); without them it fits
   * the motion bounds or `framePoints` as before (study, lookdev, the orthographic camera).
   * `restFramePoints` (v1.5, the decline pull-back): the paths that must be in frame at rest (host
   * and accept); with them the stage keeps two fits, `rest` (hero + these) and `decline` (hero +
   * `framePoints`, every path), and `setPull` moves the camera between them. Without them the two
   * are one.
   * `bounds`, `framePoints`, `heroPoints` and `restFramePoints` are in the content's own space (its
   * scene units): the stage carries them into the world through the content's transform (v1.4: a
   * scene root may carry its world scale, models/worldScale.ts). `studio.wallZ` is in world units.
   */
  setContent(
    object: Object3D | null, bounds?: Box3, studio?: { wallZ?: number; scale?: number }, framePoints?: readonly Vector3[], heroPoints?: readonly Vector3[],
    restFramePoints?: readonly Vector3[],
  ): void {
    if (this.content) this.scene.remove(this.content);
    this.content = object;
    this.framePoints = this.heroPoints = this.restPoints = undefined;
    this.pull = 0;
    this.fits.clear();
    if (object) {
      this.scene.add(object);
      object.updateMatrixWorld(true);
      const toWorld = object.matrixWorld;
      // Only the points that can set a framing at the shared angle (exact; framingHull).
      const world = (pts?: readonly Vector3[]) => (pts ? framingHull(pts.map((p) => p.clone().applyMatrix4(toWorld))) : undefined);
      this.framePoints = world(framePoints);
      this.heroPoints = world(heroPoints);
      this.restPoints = world(restFramePoints);
      if (bounds) this.bounds.copy(bounds).applyMatrix4(toWorld);
      this.assignOwnEnvironment(object);
      // v1.4: the set scales with the scene's world scale (rig.ts setWall): the cove and the key's
      // throw here, the shadow camera's range and normal bias below.
      this.studioScale = studio?.scale ?? object.scale.x;
      this.studio.setWall?.(studio?.wallZ, this.studioScale);
      this.scaleShadow();
      if (this.shadowed) {
        object.traverse((o) => {
          const m = o as Mesh;
          if (!m.isMesh) return;
          const transparent = Array.isArray(m.material) ? false : (m.material as { transparent?: boolean }).transparent;
          if (m.userData.shadowProxy) {
            // Invisible low-poly stand-in: casts for the dense mesh it replaces, receives nothing.
            m.castShadow = true;
            m.receiveShadow = false;
            return;
          }
          m.castShadow = !transparent && !m.name.endsWith('_shadow') && !m.userData.noShadowCast && castsVisibleShadow(m);
          m.receiveShadow = !transparent;
        });
      }
      this.bounds.getCenter(this.aim.position);
      this.aim.updateMatrixWorld();
      this.studio.setContent?.(this.bounds, this.studioScale);
      this.fit();
    }
  }

  /**
   * Materials marked `ownEnv` (polished metal) take the stage environment as their own map, so
   * their envMapIntensity applies instead of the scene-wide intensity. The texture stays the
   * rig's: material disposal never frees it.
   */
  assignOwnEnvironment(object: Object3D): void {
    const env = this.scene.environment;
    object.traverse((o) => {
      const m = (o as Mesh).material as MeshStandardMaterial | undefined;
      if (!m || Array.isArray(m) || !m.userData?.ownEnv || m.envMap === env) return;
      m.envMap = env;
      m.needsUpdate = true;
    });
    this.applyMetalEnvIntensity(object);
  }

  /** The rig's `metalEnvIntensity` on every ownEnv material under `object` (none declared: no-op). */
  private applyMetalEnvIntensity(object: Object3D): void {
    const intensity = this.rig.metalEnvIntensity;
    if (intensity === undefined) return;
    object.traverse((o) => {
      const m = (o as Mesh).material as MeshStandardMaterial | MeshStandardMaterial[] | undefined;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) if (mat.userData?.ownEnv) mat.envMapIntensity = intensity;
    });
  }

  /** Motion bounds in the content's own space (see setContent). */
  setBounds(bounds: Box3): void {
    this.fits.clear();
    this.bounds.copy(bounds);
    if (this.content) this.bounds.applyMatrix4(this.content.matrixWorld);
    this.studio.setContent?.(this.bounds, this.studioScale);
    this.fit();
  }

  resize(cssWidth: number, cssHeight: number, dprCap = this.dprCap): void {
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.dprCap = dprCap;
    sizeRenderer(this.renderer, cssWidth, cssHeight, dprCap);
    this.fit();
  }

  private framePoints: readonly Vector3[] | undefined;
  private heroPoints: readonly Vector3[] | undefined;
  private restPoints: readonly Vector3[] | undefined;
  /**
   * The last hero fits (null when the camera fitted bounds instead): `rest` and `decline`, the same
   * fit for content without `restFramePoints`.
   */
  framing: FramingPair | null = null;
  /** The decline pull-back (v1.5): 0 the rest fit, 1 the decline fit (`setPull`). */
  private pull = 0;
  /**
   * Solved hero fits by aspect (v1.5). A fit depends on the content and the aspect only (the
   * fullscreen frame square is always fitted square, then placed), so a resize, an inset change,
   * a still or a pull only places the camera; a fit is solved once per content and aspect.
   */
  private readonly fits = new Map<number, FramingPair>();
  /** Tooling (guard tests): hero fits solved since the stage was made. */
  fitSolves = 0;

  /** Tooling (guard tests): how many points the hero fit works on, after framingHull. */
  get framingPointCounts(): { hero: number; rest: number; decline: number } {
    return { hero: this.heroPoints?.length ?? 0, rest: this.restPoints?.length ?? this.framePoints?.length ?? 0, decline: this.framePoints?.length ?? 0 };
  }
  /** What the last hero fit was made for, so `setPull` can place the camera without refitting. */
  private view: { aim: Vector3; aspect: number; frame: FrameRect | undefined } | null = null;

  /**
   * The decline pull-back (v1.5; docs/style-reference.md): 0 shows the rest fit, 1 the decline fit,
   * in between the dolly of `pulledView`. The controller sets it every frame from the scene's
   * `framePull()`; it holds across resizes and stills. Cheap: no fit is solved, the camera moves.
   */
  setPull(k: number): void {
    const next = Math.min(1, Math.max(0, Number.isFinite(k) ? k : 0));
    if (next === this.pull) return;
    this.pull = next;
    this.placeView();
  }

  get currentPull(): number {
    return this.pull;
  }

  private placeView(): void {
    const f = this.framing, v = this.view;
    if (!f || !v || !(this.camera instanceof PerspectiveCamera)) return;
    const { distance, offset } = pulledView(f.rest, f.decline, this.pull);
    placeHeroView(this.camera, v.aim, v.aspect, distance, offset, v.frame);
  }

  /** Fullscreen layout: the overlay insets; null frames the whole canvas (square layout). */
  private insets: FrameInsets | null = null;
  /** Snapshot override: null renders the plain square fit (posters); a rect, that framing. */
  private snapshotFrame: FrameRect | null | undefined = undefined;

  /**
   * Fullscreen layout (v1.4): frame the object in the largest square left free by `insets` and
   * extend the view to the whole canvas. `null` restores the plain fit (square stage).
   */
  setFrameInsets(insets: FrameInsets | null): void {
    this.insets = insets;
    this.fit();
  }

  private fit(): void {
    if (this.bounds.isEmpty()) return;
    const aspect = this.cssWidth / this.cssHeight;
    const frame = this.snapshotFrame !== undefined
      ? this.snapshotFrame ?? undefined
      : this.insets ? frameSquare(this.cssWidth, this.cssHeight, this.insets) : undefined;
    this.framing = null;
    this.view = null;
    if (this.camera instanceof PerspectiveCamera) {
      if (this.heroPoints?.length) {
        const aim = this.bounds.getCenter(aimPoint).clone();
        const key = Math.round((frame ? 1 : aspect) * 1e6);
        let pair = this.fits.get(key);
        if (!pair) {
          const paths = this.framePoints?.length ? this.framePoints : boxCorners(this.bounds);
          // Two fits when the rest needs less room than the decline (v1.5), else one.
          const sets = this.restPoints?.length ? [this.restPoints, paths] : [paths];
          const fits = solveHeroFits(this.camera, aim, aspect, this.heroPoints, sets, HERO_FILL, PATH_CLEARANCE, frame);
          pair = { rest: fits[0]!, decline: fits[fits.length - 1]! };
          this.fits.set(key, pair);
          this.fitSolves++;
        }
        this.framing = pair;
        this.view = { aim, aspect, frame };
        this.placeView();
      } else fitPerspectiveToBounds(this.camera, this.bounds, aspect, undefined, this.framePoints, frame);
    } else fitCameraToBounds(this.camera, this.bounds, aspect, undefined, this.framePoints, frame);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** The hero fits (rest and decline) at another aspect (tooling), leaving the live fit as it was. */
  measureFraming(aspect: number): FramingPair | null {
    const prev = { w: this.cssWidth, h: this.cssHeight, frame: this.snapshotFrame };
    this.cssWidth = aspect * 1000;
    this.cssHeight = 1000;
    this.snapshotFrame = null;
    this.fit();
    const r = this.framing;
    this.cssWidth = prev.w;
    this.cssHeight = prev.h;
    this.snapshotFrame = prev.frame;
    this.fit();
    return r;
  }

  /**
   * Render at an explicit size and return an image URL (capture tooling and posters). `empty`
   * hides the content for the frame: the bare backdrop under the same light and camera, which
   * is what the stage colour is measured from. The still is the plain square fit (as the posters
   * are); `field` > 1 widens it to `field` × the frame square around the same framing (the
   * fullscreen backdrop still, v1.4), so the square fit sits in its middle at 1/`field` the size.
   * The still is taken at the current pull (v1.5): the declined pose's at the decline fit.
   */
  snapshot(cssWidth: number, cssHeight: number, dpr: number, type = 'image/png', quality?: number, empty = false, field = 1): string {
    const hidden = empty && this.content?.visible ? this.content : null;
    if (hidden) {
      hidden.visible = false;
      // The bare backdrop must not keep the content's shadow (shadowMap.autoUpdate may be off).
      this.renderer.shadowMap.needsUpdate = true;
    }
    const prev = { w: this.cssWidth, h: this.cssHeight, cap: this.dprCap };
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(cssWidth, cssHeight, false);
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    const size = Math.min(cssWidth, cssHeight) / field;
    this.snapshotFrame = field > 1 ? { x: (cssWidth - size) / 2, y: (cssHeight - size) / 2, size, width: cssWidth, height: cssHeight } : null;
    this.fit();
    this.render();
    this.snapshotFrame = undefined;
    const url = this.canvas.toDataURL(type, quality);
    if (hidden) {
      hidden.visible = true;
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.resize(prev.w, prev.h, prev.cap);
    return url;
  }

  dispose(): void {
    // Before the content and studio (whose materials lead to the shared LUT) leave the scene.
    releaseDfgLUT(this.renderer, this.scene);
    this.setContent(null);
    if (this.studio.objects.length) this.scene.remove(...this.studio.objects);
    this.scene.remove(this.aim);
    if (this.scene.environment === this.studio.environment) this.scene.environment = null;
    this.studio.dispose();
    // Shared texture caches and the shared shadow-proxy material (Birthday, Dinner) hold dispose
    // listeners that would keep this renderer (and its GL context) reachable; release their GPU
    // copies, then drop the context explicitly (a context already lost has nothing left to
    // release, and no extension to do it with).
    releaseCachedTextureGpu();
    releaseShadowTextureGpu();
    shadowProxyMaterial().dispose();
    this.renderer.dispose();
    if (!this.renderer.getContext().isContextLost()) this.renderer.forceContextLoss();
  }
}
