/**
 * Export code-authored masters to optimised runtime GLB (asset contract, Master §8).
 *
 *   node --experimental-transform-types scripts/export-models.ts [scene...]
 *
 * Geometry and named nodes only; materials are exported as named placeholders and re-bound
 * from the locked material library at runtime. Pipeline: GLTFExporter → gltf-transform
 * (dedup, weld, prune, KHR_mesh_quantization). No decoder is needed at runtime.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { Color, MeshStandardMaterial, type Object3D } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, weld } from '@gltf-transform/functions';
import { buildKeycardGeometry } from '../models/keycard.ts';
import { DIRECTIONS, type DirectionId, type MaterialLibrary } from '../src/render/materials.ts';
import { createSimplifier, type Simplify } from '../models/simplify.ts';
import { buildRecordPlayerGeometry } from '../models/recordPremium.ts';

/** Direction exported to runtime GLB (the showcase's production look). */
const EXPORT_DIRECTION: DirectionId = 'L2';
let simplify: Simplify;

// GLTFExporter uses FileReader for binary output; Node has Blob but not FileReader.
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((b) => {
      this.result = `data:${blob.type};base64,${Buffer.from(b).toString('base64')}`;
      this.onloadend?.();
    });
  }
}
(globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;

/** Library stand-in: named plain materials, no textures (runtime re-binds by name). */
function exportLibrary(): MaterialLibrary {
  const direction = DIRECTIONS[EXPORT_DIRECTION];
  const cache = new Map<string, MeshStandardMaterial>();
  const make = (name: string) => {
    const spec = direction.surfaces[name];
    if (!spec) throw new Error(`Unknown material ${name}`);
    return new MeshStandardMaterial({ name, color: new Color(spec.color), roughness: spec.roughness, metalness: spec.metalness ?? 0 });
  };
  return {
    direction,
    get(name: string) {
      let m = cache.get(name);
      if (!m) cache.set(name, (m = make(name)));
      return m;
    },
    unique: make,
    dispose() {},
  } as unknown as MaterialLibrary;
}

const SCENES: Record<string, () => Object3D> = {
  business: () => buildKeycardGeometry({ lib: exportLibrary(), simplify }, 'light'),
  party: () => buildRecordPlayerGeometry({ lib: exportLibrary(), simplify }, 'coral'),
};

async function exportScene(name: string) {
  const root = SCENES[name]!();
  root.updateMatrixWorld(true);
  const exporter = new GLTFExporter();
  const glb = (await exporter.parseAsync(root, { binary: true, onlyVisible: false })) as ArrayBuffer;

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.readBinary(new Uint8Array(glb));
  await doc.transform(
    dedup(),
    weld(),
    // keepAttributes: placeholder materials carry no textures, but the runtime library does.
    prune({ keepLeaves: true, keepAttributes: true }),
    // UVs stay float: signature tiling uses UV ranges beyond 0–1 with no texture transform.
    quantize({ pattern: /^(POSITION|NORMAL)$/, quantizePosition: 14, quantizeNormal: 10 }),
  );
  const out = await io.writeBinary(doc);
  const file = join(import.meta.dirname, '..', 'assets', 'scenes', name, `${name}.glb`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, out);

  const nodes = doc.getRoot().listNodes().length;
  const meshes = doc.getRoot().listMeshes().length;
  const prims = doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0);
  console.log(
    `${name}: raw ${(glb.byteLength / 1024).toFixed(1)} KiB → optimised ${(out.byteLength / 1024).toFixed(1)} KiB` +
      ` (gzip ${(gzipSync(out).byteLength / 1024).toFixed(1)} KiB) · ${nodes} nodes · ${meshes} meshes · ${prims} primitives`,
  );
}

simplify = await createSimplifier();
const targets = process.argv.slice(2);
for (const name of targets.length ? targets : Object.keys(SCENES)) await exportScene(name);
