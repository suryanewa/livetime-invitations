import { Box3, Color, type Material, Mesh, type MeshStandardMaterial, Object3D, type OrthographicCamera, PCFShadowMap, PerspectiveCamera, Scene, type Texture, type Vector3, VSMShadowMap, type WebGLRenderer } from 'three';
import { createStageCamera, fitCameraToBounds, fitPerspectiveToBounds, PERSPECTIVE_FOV } from './camera.ts';
import { createRenderer, sizeRenderer } from './createRenderer.ts';
import { releaseShadowTextureGpu } from './contactShadow.ts';
import { STUDY_RIG } from './lighting.ts';
import type { Rig, RigBuild } from './rig.ts';
import { resolveRig } from './rigRegistry.ts';
import { smoothPcf } from './studio.ts';
import { releaseCachedTextureGpu } from './textures.ts';
import { shadowProxyMaterial } from '../../models/shadowProxy.ts';

const extent = new Box3();
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
  private dprCap = 1.5;

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

  /** Low/Static tier: the rig drops its expensive detail (gobo resolution, backdrop relief). */
  setLowDetail(enabled: boolean): void {
    this.studio.setLowDetail?.(enabled);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  setContent(object: Object3D | null, bounds?: Box3, studio?: { wallZ?: number }, framePoints?: readonly Vector3[]): void {
    this.framePoints = framePoints;
    if (this.content) this.scene.remove(this.content);
    this.content = object;
    if (object) {
      this.scene.add(object);
      if (bounds) this.bounds.copy(bounds);
      this.assignOwnEnvironment(object);
      this.studio.setWall?.(studio?.wallZ);
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
  }

  setBounds(bounds: Box3): void {
    this.bounds.copy(bounds);
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

  private fit(): void {
    if (this.bounds.isEmpty()) return;
    const aspect = this.cssWidth / this.cssHeight;
    if (this.camera instanceof PerspectiveCamera) fitPerspectiveToBounds(this.camera, this.bounds, aspect, undefined, this.framePoints);
    else fitCameraToBounds(this.camera, this.bounds, aspect, undefined, this.framePoints);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Render at an explicit size and return an image URL (capture tooling and posters). `empty`
   * hides the content for the frame: the bare backdrop under the same light and camera, which
   * is what the stage colour is measured from.
   */
  snapshot(cssWidth: number, cssHeight: number, dpr: number, type = 'image/png', quality?: number, empty = false): string {
    const hidden = empty && this.content?.visible ? this.content : null;
    if (hidden) hidden.visible = false;
    const prev = { w: this.cssWidth, h: this.cssHeight, cap: this.dprCap };
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(cssWidth, cssHeight, false);
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.fit();
    this.render();
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
