/**
 * Export code-authored masters to optimised runtime GLB (asset contract, Master §8).
 *
 *   node --experimental-transform-types scripts/export-models.ts [scene...]
 *
 * Geometry and named nodes only; materials are exported as named placeholders and re-bound
 * from the locked material library at runtime. Pipeline: GLTFExporter → gltf-transform
 * (dedup, weld, prune, KHR_mesh_quantization). No decoder is needed at runtime.
 *
 * v1.2: a scene whose recipe (scripts/masters/recipes/<scene>.ts) lists masters is composed from
 * the builder output AND the imported scan-to-CAD masters in one document (composeMasters), then
 * runs the same chain plus the texture policy (WebP, size caps) and prints a report. A scene
 * whose recipe has no masters exports exactly as before. Recipes for every scene are registered
 * in scripts/masters/recipes/index.ts; scene agents edit only their own recipe file.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { Color, MeshStandardMaterial, type Object3D } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, weld } from '@gltf-transform/functions';
import { buildKeycardGeometry } from '../models/keycard.ts';
import { DIRECTIONS, type DirectionId, type MaterialLibrary } from '../src/render/materials.ts';
import { createSimplifier, type Simplify } from '../models/simplify.ts';
import { buildRecordPlayerGeometry } from '../models/recordPremium.ts';
import { buildCakeGeometry } from '../models/cake.ts';
import { buildDisposalBin } from '../models/disposalBin.ts';
import { buildSportsGeometry } from '../models/sportsPremium.ts';
import { buildDinnerGeometry } from '../models/dinnerPremium.ts';
import { composeMasters, createSceneNodes, optimizeComposed } from './masters/compose.ts';
import { formatReport, measure } from './masters/report.ts';
import { RECIPES } from './masters/recipes/index.ts';
import type { SceneRecipe } from './masters/types.ts';

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
  birthday: () => buildCakeGeometry({ lib: exportLibrary(), simplify }, 'vanilla'),
  bin: () => buildDisposalBin({ lib: exportLibrary(), simplify }),
  sports: () => buildSportsGeometry({ lib: exportLibrary(), simplify }, 'orange'),
  dinner: () => buildDinnerGeometry({ lib: exportLibrary(), simplify }, 'pasta'),
};

/** Output path per target (shared props live outside any one scene). */
const OUTPUT: Record<string, string[]> = { bin: ['shared', 'disposal-bin.glb'] };

async function exportScene(name: string) {
  const recipe = RECIPES[name];
  if (recipe?.masters.length) return exportComposed(name, recipe);
  if (recipe?.status) console.log(`${name}: recipe ${recipe.status}; code-authored builder only`);
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
  const file = OUTPUT[name] ? join(import.meta.dirname, '..', 'assets', ...OUTPUT[name]!) : join(import.meta.dirname, '..', 'assets', 'scenes', name, `${name}.glb`);
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

/**
 * Builder output + imported masters (scripts/masters/README.md for the order), then the same
 * dedup/weld/prune/quantize chain as above with the texture policy between prune and quantize
 * (`optimizeComposed`, plus unpartition).
 */
async function exportComposed(name: string, recipe: SceneRecipe) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const build = recipe.builder === undefined ? SCENES[name] : recipe.builder ? () => recipe.builder!({ lib: exportLibrary(), simplify }) : null;
  let doc: Document;
  if (build) {
    const root = build();
    root.updateMatrixWorld(true);
    const glb = (await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false })) as ArrayBuffer;
    doc = await io.readBinary(new Uint8Array(glb));
  } else {
    doc = new Document();
    doc.createBuffer();
    doc.getRoot().setDefaultScene(doc.createScene(name));
  }
  if (recipe.create) createSceneNodes(doc, recipe.create);
  console.log(`${name}: composing ${recipe.masters.map((m) => m.file).join(' + ')}`);
  await composeMasters(doc, recipe, (line) => console.log(line));
  // dedup → weld → prune → texture policy → quantize → unpartition (shared with the tests).
  await optimizeComposed(doc, recipe, (line) => console.log(line));
  const out = await io.writeBinary(doc);
  const file = join(import.meta.dirname, '..', 'assets', 'scenes', name, `${name}.glb`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, out);
  console.log(formatReport(measure(name, doc, out, recipe.contract)));
}

simplify = await createSimplifier();
const targets = process.argv.slice(2);
for (const name of targets.length ? targets : Object.keys(SCENES)) await exportScene(name);
