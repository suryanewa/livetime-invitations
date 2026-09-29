import type { Box3, Object3D } from 'three';
import type { MaterialLibrary } from '../src/render/materials.ts';
import type { ContactShadow } from '../src/render/contactShadow.ts';

export interface ModelContext {
  lib: MaterialLibrary;
  /** Optional decimation for SDF parts (dev pages and export inject it; runtime never builds). */
  simplify?: (g: import('three').BufferGeometry, ratio: number, error?: number) => import('three').BufferGeometry;
}

export interface BuiltModel {
  root: Object3D;
  /** Required named nodes from the scene sub-spec, looked up once. */
  nodes: Record<string, Object3D>;
  shadows: ContactShadow[];
  /** Complete motion bounds (all authored paths), used for camera fit. */
  bounds: Box3;
  dispose(): void;
}

export function collectNodes(root: Object3D, names: readonly string[]): Record<string, Object3D> {
  const nodes: Record<string, Object3D> = {};
  for (const name of names) {
    const found = root.getObjectByName(name);
    if (!found) throw new Error(`Missing required node ${name}`);
    nodes[name] = found;
  }
  return nodes;
}

export function disposeGeometry(root: Object3D): void {
  root.traverse((o) => {
    const g = (o as { geometry?: { dispose(): void } }).geometry;
    g?.dispose();
  });
}
