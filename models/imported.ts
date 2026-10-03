import { type Material, type Mesh, MeshPhysicalMaterial, MeshStandardMaterial, type Object3D, type Texture } from 'three';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { MaterialLibrary } from '../src/render/materials.ts';

let sharedLoader: GLTFLoader | null = null;

/**
 * The one GLTFLoader every runtime GLB goes through (the five scenes and the deferred bin), with
 * three's MeshoptDecoder set once: since v1.6 the exported GLBs carry EXT_meshopt_compression
 * (scripts/masters/compose.ts `compressGeometry`). The decoder's WASM is inlined in its module,
 * so the bundle needs no extra file; it decodes on the main thread while the GLB is parsed.
 */
export function gltfLoader(): GLTFLoader {
  return (sharedLoader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder));
}

/**
 * Runtime side of the master import path (scripts/masters/). Imported scan-to-CAD materials are
 * not the locked library's: `bindMaterialsByName` leaves them as loaded (textures and extensions
 * included). This module gives them what library materials get for free:
 *
 * - `prepareImported(root, lib, extra?)`: flags every material the library does not own
 *   (`userData.imported`), gives polished metal its own copy of the studio environment
 *   (envMapIntensity from the recipe's `ownEnv` extras, else 1.1 for metalness ≥ 0.5; the stage's
 *   `assignOwnEnvironment` then sets the map, as for the cloche), and registers them for the
 *   Low tier. Call it after `bindMaterialsByName`, with any variant materials as `extra`.
 * - `setImportedLowDetail(root, enabled)`: the Low tier's equivalent of
 *   `MaterialLibrary.setLowDetail` for imported materials (no normal maps, no sheen, softer own
 *   environment). Reversible. Scenes call it from `SceneInstance.setLowDetail`.
 * - `loadMaterialVariants(gltf)`: presets stored with KHR_materials_variants (recipe
 *   `materialVariants`), which three's GLTFLoader does not apply itself.
 */

/** envMapIntensity for imported metal with its own environment map (the cloche's value). */
export const IMPORTED_OWN_ENV = 1.1;
/** Low tier: own-environment intensity, as MaterialLibrary.setLowDetail uses. */
const LOW_ENV = 0.8;

interface Saved {
  normalMap: Texture | null;
  clearcoatNormalMap: Texture | null;
  sheen: number;
  envMapIntensity: number;
}

interface Registry {
  materials: Set<MeshStandardMaterial>;
  saved: Map<MeshStandardMaterial, Saved>;
  low: boolean;
}

const registries = new WeakMap<Object3D, Registry>();

function registry(root: Object3D): Registry {
  let r = registries.get(root);
  if (!r) registries.set(root, (r = { materials: new Set(), saved: new Map(), low: false }));
  return r;
}

function prepareMaterial(m: Material, lib: MaterialLibrary, reg: Registry): void {
  if (!(m instanceof MeshStandardMaterial) || lib.direction.surfaces[m.name] || reg.materials.has(m)) return;
  m.userData.imported = true;
  const own = m.userData.ownEnv;
  // Recipe extras: a number is the intensity (0 opts out); `true` means the default.
  const intensity = typeof own === 'number' ? own : own === true || (own === undefined && m.metalness >= 0.5) ? IMPORTED_OWN_ENV : 0;
  if (intensity > 0) {
    m.envMapIntensity = intensity;
    m.userData.ownEnv = true;
  } else {
    delete m.userData.ownEnv;
  }
  reg.materials.add(m);
  if (reg.low) simplify(m, reg);
}

/** Flags, adjusts and registers every imported material under `root` (plus `extra` variants). */
export function prepareImported(root: Object3D, lib: MaterialLibrary, extra: readonly Material[] = []): MeshStandardMaterial[] {
  const reg = registry(root);
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) prepareMaterial(m, lib, reg);
  });
  for (const m of extra) prepareMaterial(m, lib, reg);
  return [...reg.materials];
}

function simplify(m: MeshStandardMaterial, reg: Registry): void {
  if (reg.saved.has(m)) return;
  const phys = m instanceof MeshPhysicalMaterial ? m : null;
  reg.saved.set(m, { normalMap: m.normalMap, clearcoatNormalMap: phys?.clearcoatNormalMap ?? null, sheen: phys?.sheen ?? 0, envMapIntensity: m.envMapIntensity });
  m.normalMap = null;
  if (phys) {
    phys.clearcoatNormalMap = null;
    phys.sheen = 0;
  }
  if (m.userData.ownEnv) m.envMapIntensity = LOW_ENV;
  m.needsUpdate = true;
}

/** Low tier for the imported materials registered under `root`. Reversible; idempotent. */
export function setImportedLowDetail(root: Object3D, enabled: boolean): void {
  const reg = registry(root);
  if (enabled === reg.low) return;
  reg.low = enabled;
  for (const m of reg.materials) {
    if (enabled) {
      simplify(m, reg);
      continue;
    }
    const prev = reg.saved.get(m);
    if (!prev) continue;
    m.normalMap = prev.normalMap;
    if (m instanceof MeshPhysicalMaterial) {
      m.clearcoatNormalMap = prev.clearcoatNormalMap;
      m.sheen = prev.sheen;
    }
    m.envMapIntensity = prev.envMapIntensity;
    m.needsUpdate = true;
    reg.saved.delete(m);
  }
}

export function importedLowDetail(root: Object3D): boolean {
  return registries.get(root)?.low ?? false;
}

/**
 * Frees the imported materials and their textures (variants included), at any tier: maps the Low
 * tier holds aside (normal, clearcoat normal) are freed too. Never frees the environment: `envMap`
 * on an ownEnv material is the stage's shared PMREM (`Stage.assignOwnEnvironment`), and render
 * target textures in general belong to whoever owns the target.
 */
export function disposeImported(root: Object3D): void {
  const reg = registries.get(root);
  if (!reg) return;
  const textures = new Set<Texture>();
  const add = (v: unknown) => {
    const t = v as (Texture & { isRenderTargetTexture?: boolean }) | null;
    if (t?.isTexture && !t.isRenderTargetTexture) textures.add(t);
  };
  for (const m of reg.materials) {
    for (const [key, v] of Object.entries(m)) if (key !== 'envMap') add(v);
    const saved = reg.saved.get(m);
    if (saved) {
      add(saved.normalMap);
      add(saved.clearcoatNormalMap);
    }
    m.dispose();
  }
  for (const t of textures) t.dispose();
  reg.saved.clear();
  reg.materials.clear();
  registries.delete(root);
}

// ── KHR_materials_variants ──────────────────────────────────────────────────────────
export interface MaterialVariants {
  /** Variant names in file order (the recipe's first is the default). */
  readonly names: readonly string[];
  /** Every material any variant uses (for prepareImported and precompile). */
  readonly materials: readonly Material[];
  /** Assigns a variant's materials to every mapped mesh; unknown names throw. */
  select(name: string): void;
}

interface VariantJson {
  extensions?: { KHR_materials_variants?: { variants?: { name: string }[] } };
  meshes?: { primitives: { extensions?: { KHR_materials_variants?: { mappings: { material: number; variants: number[] }[] } } }[] }[];
}

/**
 * Reads the variant mappings GLTFLoader leaves in the JSON, loads every mapped material through
 * the parser (same cache, same extension handling as the default materials) and returns a
 * selector. A file without the extension yields no names and a no-op selector.
 *
 * Each mapped material is passed through the parser's `assignFinalMaterial` for its mesh once,
 * here, so a variant gets exactly what the default material got: for a mesh without tangents the
 * derivative-tangent flip (`normalScale.y = −1`), plus the vertex-colour / flat-shading variants.
 * The selector then assigns those final materials; assigning the raw cache material would render
 * every variant's normal map with its green channel inverted.
 */
export async function loadMaterialVariants(gltf: GLTF): Promise<MaterialVariants> {
  const json = gltf.parser.json as VariantJson;
  const names = (json.extensions?.KHR_materials_variants?.variants ?? []).map((v) => v.name);
  const table = new Map<Mesh, Map<string, Material>>();
  const all = new Set<Material>();
  const jobs: Promise<void>[] = [];
  const parser = gltf.parser as GLTF['parser'] & { assignFinalMaterial(mesh: Mesh): void };
  gltf.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const ref = gltf.parser.associations.get(mesh) as { meshes?: number; primitives?: number } | undefined;
    if (ref?.meshes === undefined || ref.primitives === undefined) return;
    const mappings = json.meshes?.[ref.meshes]?.primitives[ref.primitives]?.extensions?.KHR_materials_variants?.mappings;
    if (!mappings) return;
    const byName = new Map<string, Material>();
    table.set(mesh, byName);
    const loaded = mappings.map((mapping) => gltf.parser.getDependency('material', mapping.material).then((m: Material) => [mapping, m] as const));
    jobs.push(Promise.all(loaded).then((pairs) => {
      // The loader already assigned the default material's final form; keep it and restore it.
      const current = mesh.material;
      for (const [mapping, raw] of pairs) {
        mesh.material = raw;
        parser.assignFinalMaterial(mesh);
        const final = mesh.material as Material;
        all.add(final);
        for (const v of mapping.variants) byName.set(names[v]!, final);
      }
      mesh.material = current;
    }));
  });
  await Promise.all(jobs);
  return {
    names,
    materials: [...all],
    select(name) {
      if (!names.includes(name)) throw new Error(`unknown material variant ${name}`);
      for (const [mesh, byName] of table) {
        const m = byName.get(name);
        if (m) mesh.material = m;
      }
    },
  };
}
