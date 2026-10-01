import { createRequire } from 'node:module';

/**
 * sharp is not a direct dependency: it arrives with @gltf-transform/functions → ndarray-pixels.
 * Resolve it through that chain so the importer needs no new package. Typed loosely (its types are
 * not resolvable from this package); only the calls below are used.
 */
export interface SharpInstance {
  raw(): SharpInstance;
  png(options?: { compressionLevel?: number }): SharpInstance;
  ensureAlpha(): SharpInstance;
  resize(width: number, height: number, options?: { fit?: 'fill'; kernel?: 'lanczos3' }): SharpInstance;
  /** `exact`: keep RGB under fully transparent pixels (lossless data textures). */
  webp(options?: { lossless?: boolean; exact?: boolean; quality?: number }): SharpInstance;
  toBuffer(options: { resolveWithObject: true }): Promise<{ data: Uint8Array; info: { width: number; height: number; channels: number } }>;
  toBuffer(): Promise<Uint8Array>;
}
export type Sharp = ((input: Uint8Array, options?: { raw?: { width: number; height: number; channels: number } }) => SharpInstance) & { versions: Record<string, string> };

let cached: Sharp | null = null;

export function loadSharp(): Sharp {
  if (cached) return cached;
  const fromFunctions = createRequire(import.meta.resolve('@gltf-transform/functions'));
  const fromPixels = createRequire(fromFunctions.resolve('ndarray-pixels'));
  cached = fromPixels('sharp') as Sharp;
  return cached;
}
