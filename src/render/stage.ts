import { Box3, Color, Mesh, Object3D, type OrthographicCamera, PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { cameraDirection, createStageCamera, fitCameraToBounds, fitPerspectiveToBounds } from './camera.ts';
import { createPremiumStudio, type PremiumStudio } from './studio.ts';
import { createRenderer, sizeRenderer } from './createRenderer.ts';
import { releaseShadowTextureGpu } from './contactShadow.ts';
import { createStudioRig, type StudioRig } from './lighting.ts';
import { releaseCachedTextureGpu } from './textures.ts';

export const STAGE_COLOR = '#F4F1EB';

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
  return Math.min(x, y, z) > 0.008 && Math.max(x, y, z) > 0.05;
}

export interface StageOptions {
  canvas?: HTMLCanvasElement;
  preserveDrawingBuffer?: boolean;
  /** Fidelity pass: sunlit gobo key with soft shadows and a paper sweep. */
  premium?: boolean;
  projection?: 'orthographic' | 'perspective';
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
  readonly rig: StudioRig;
  readonly premium: PremiumStudio | null = null;
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
    this.scene.background = new Color(STAGE_COLOR);
    this.rig = createStudioRig(renderer, this.scene);
    this.camera = options.projection === 'perspective' ? new PerspectiveCamera(options.fov ?? 18, 1, 0.5, 200) : createStageCamera();
    if (options.premium) {
      // The sunlit spot becomes the key; the old directional key and some IBL step back.
      this.rig.lights[0].intensity = 0;
      this.scene.environmentIntensity = 0.62;
      this.scene.add(this.aim);
      this.premium = createPremiumStudio(renderer, this.scene, this.aim);
    }
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  setContent(object: Object3D | null, bounds?: Box3): void {
    if (this.content) this.scene.remove(this.content);
    this.content = object;
    if (object) {
      this.scene.add(object);
      if (bounds) this.bounds.copy(bounds);
      if (this.premium) {
        object.traverse((o) => {
          const m = o as Mesh;
          if (!m.isMesh) return;
          const transparent = Array.isArray(m.material) ? false : (m.material as { transparent?: boolean }).transparent;
          m.castShadow = !transparent && !m.name.endsWith('_shadow') && castsVisibleShadow(m);
          m.receiveShadow = !transparent;
        });
        this.bounds.getCenter(this.aim.position);
        this.aim.updateMatrixWorld();
      }
      this.fit();
    }
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

  private fit(): void {
    if (this.bounds.isEmpty()) return;
    const aspect = this.cssWidth / this.cssHeight;
    if (this.camera instanceof PerspectiveCamera) fitPerspectiveToBounds(this.camera, this.bounds, aspect);
    else fitCameraToBounds(this.camera, this.bounds, aspect);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Render at an explicit size and return an image URL (capture tooling and posters). */
  snapshot(cssWidth: number, cssHeight: number, dpr: number, type = 'image/png', quality?: number): string {
    const prev = { w: this.cssWidth, h: this.cssHeight, cap: this.dprCap };
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(cssWidth, cssHeight, false);
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.fit();
    this.render();
    const url = this.canvas.toDataURL(type, quality);
    this.resize(prev.w, prev.h, prev.cap);
    return url;
  }

  dispose(): void {
    this.setContent(null);
    this.premium?.dispose();
    this.rig.dispose();
    // Shared texture caches hold dispose listeners that would keep this renderer (and its
    // GL context) reachable; release their GPU copies, then drop the context explicitly.
    releaseCachedTextureGpu();
    releaseShadowTextureGpu();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
