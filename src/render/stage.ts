import { Box3, Color, type Object3D, type OrthographicCamera, Scene, type WebGLRenderer } from 'three';
import { createStageCamera, fitCameraToBounds } from './camera.ts';
import { createRenderer, sizeRenderer } from './createRenderer.ts';
import { createStudioRig, type StudioRig } from './lighting.ts';

export const STAGE_COLOR = '#F4F1EB';

/**
 * One live canvas: renderer, shared camera, studio rig and a single content slot.
 * Scenes own their content; the stage owns lifecycle of GPU-side shared resources.
 */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: OrthographicCamera = createStageCamera();
  readonly rig: StudioRig;
  private content: Object3D | null = null;
  private bounds = new Box3();
  private cssWidth = 1;
  private cssHeight = 1;
  private dprCap = 1.5;

  static create(options: { canvas?: HTMLCanvasElement; preserveDrawingBuffer?: boolean } = {}): Stage | null {
    const result = createRenderer(options);
    return result.ok ? new Stage(result.renderer) : null;
  }

  private constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;
    this.scene.background = new Color(STAGE_COLOR);
    this.rig = createStudioRig(renderer, this.scene);
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
    if (!this.bounds.isEmpty()) fitCameraToBounds(this.camera, this.bounds, this.cssWidth / this.cssHeight);
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
    this.rig.dispose();
    this.renderer.dispose();
  }
}
