import { NeutralToneMapping, SRGBColorSpace, WebGLRenderer } from 'three';

/** Master §9: never allocate a drawing buffer above 2.5 million pixels. */
export const MAX_DRAWING_BUFFER_PIXELS = 2_500_000;

export interface RendererOptions {
  canvas?: HTMLCanvasElement;
  /** Only for capture tooling; shipping renderers keep the default. */
  preserveDrawingBuffer?: boolean;
  antialias?: boolean;
}

export type RendererResult =
  | { ok: true; renderer: WebGLRenderer }
  | { ok: false; reason: 'webgl-unavailable' | 'shader-failure' };

export function hasWebGL2(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    const ok = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

/**
 * One colour pipeline for every scene (Master §5): sRGB output, linear working space,
 * NeutralToneMapping with fixed exposure. No postprocessing.
 */
export function createRenderer(options: RendererOptions = {}): RendererResult {
  if (!hasWebGL2()) return { ok: false, reason: 'webgl-unavailable' };
  try {
    const renderer = new WebGLRenderer({
      canvas: options.canvas,
      antialias: options.antialias ?? true,
      alpha: false,
      powerPreference: 'default',
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
    });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = false;
    return { ok: true, renderer };
  } catch {
    return { ok: false, reason: 'webgl-unavailable' };
  }
}

/** Device pixel ratio after tier cap and the drawing-buffer ceiling. */
export function effectivePixelRatio(cssWidth: number, cssHeight: number, dprCap: number): number {
  const dpr = Math.min(globalThis.devicePixelRatio || 1, dprCap);
  const pixels = cssWidth * cssHeight * dpr * dpr;
  if (pixels <= MAX_DRAWING_BUFFER_PIXELS) return dpr;
  return Math.sqrt(MAX_DRAWING_BUFFER_PIXELS / Math.max(1, cssWidth * cssHeight));
}

export function sizeRenderer(renderer: WebGLRenderer, cssWidth: number, cssHeight: number, dprCap: number): void {
  const w = Math.max(1, Math.round(cssWidth));
  const h = Math.max(1, Math.round(cssHeight));
  renderer.setPixelRatio(effectivePixelRatio(w, h, dprCap));
  renderer.setSize(w, h, false);
}
