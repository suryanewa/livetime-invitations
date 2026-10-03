/**
 * Master importer: merges scan-to-CAD masters (models/masters/*.glb) into a scene document next to
 * the code-authored builder output, following a per-scene recipe (scripts/masters/recipes/).
 * The order of operations is fixed and documented in scripts/masters/README.md.
 *
 * Everything here is deterministic: same recipe, same masters, same document.
 */
import { join, resolve } from 'node:path';
import { type Document, type Material, type Node, NodeIO, type Primitive, type Scene, type Texture } from '@gltf-transform/core';
import {
  ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP, KHRMaterialsEmissiveStrength, KHRMaterialsVariants, type EmissiveStrength, type MappingList,
} from '@gltf-transform/extensions';
import {
  compressTexture, dedup, joinPrimitives, listTextureSlots, mergeDocuments, prune, quantize, simplifyPrimitive, transformMesh, transformPrimitive, unpartition, weld, weldPrimitive,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { loadSharp } from './sharp.ts';
import type { BoxPoint, CreateNode, MasterRecipe, MaterialPolicy, NodePoint, RawImage, SceneRecipe, Vec3 } from './types.ts';

export const MASTERS_DIR = join(import.meta.dirname, '..', '..', 'models', 'masters');
export const SCENE_TOP = '@scene';

// v1.6: every runtime GLB is written with EXT_meshopt_compression (see `compressGeometry`), so
// every reader and writer needs the codec. Both are WASM; wait for them once, here.
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);

/** NodeIO with every extension and the meshopt codec (reads and writes compressed GLBs). */
export function createIO(): NodeIO {
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
}

// ── Matrices (three's Matrix4 is column-major, like glTF) ───────────────────────────
const world = (n: Node) => new Matrix4().fromArray(n.getWorldMatrix());
const local = (n: Node) => new Matrix4().fromArray(n.getMatrix());

function setLocal(n: Node, m: Matrix4): void {
  const t = new Vector3(), q = new Quaternion(), s = new Vector3();
  m.decompose(t, q, s);
  n.setTranslation(t.toArray() as Vec3).setRotation(q.toArray() as [number, number, number, number]).setScale(s.toArray() as Vec3);
}

function parentOf(n: Node): Node | null {
  return n.getParentNode();
}

function detach(n: Node): void {
  const p = n.getParentNode();
  if (p) p.removeChild(n);
  for (const s of n.listParents()) if (s.propertyType === 'Scene') (s as Scene).removeChild(n);
}

/** Moves `n` under `parent` (a node, or the scene for top level) keeping its scene-space placement. */
function reparentKeepWorld(n: Node, parent: Node | Scene): void {
  const w = world(n);
  detach(n);
  if (parent.propertyType === 'Scene') {
    (parent as Scene).addChild(n);
    setLocal(n, w);
  } else {
    const p = parent as Node;
    p.addChild(n);
    setLocal(n, world(p).invert().multiply(w));
  }
}

// ── Node lookup ────────────────────────────────────────────────────────────────────
function sceneOf(doc: Document): Scene {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error('document has no scene');
  return scene;
}

function traverseScene(scene: Scene, fn: (n: Node, path: string) => void): void {
  const walk = (n: Node, prefix: string) => {
    const path = prefix ? `${prefix}/${n.getName()}` : n.getName();
    fn(n, path);
    for (const c of n.listChildren()) walk(c, path);
  };
  for (const n of scene.listChildren()) walk(n, '');
}

/** The one node named `name` in the scene graph (`@scene` is handled by the callers). */
export function findNode(doc: Document, name: string): Node {
  const hits: Node[] = [];
  traverseScene(sceneOf(doc), (n) => { if (n.getName() === name) hits.push(n); });
  if (hits.length !== 1) throw new Error(`expected exactly one node named "${name}", found ${hits.length}`);
  return hits[0]!;
}

function findParent(doc: Document, name: string): Node | Scene {
  return name === SCENE_TOP ? sceneOf(doc) : findNode(doc, name);
}

/** Master lookup by name (must be unique in the master) or by path `a/b/c` from the master's scene. */
class MasterIndex {
  private readonly byName = new Map<string, Node[]>();
  private readonly byPath = new Map<string, Node>();
  constructor(readonly file: string, scene: Scene) {
    traverseScene(scene, (n, path) => {
      const list = this.byName.get(n.getName()) ?? [];
      list.push(n);
      this.byName.set(n.getName(), list);
      this.byPath.set(path, n);
    });
  }
  get(key: string): Node {
    if (key.includes('/')) {
      const n = this.byPath.get(key);
      if (!n) throw new Error(`${this.file}: no node at path "${key}"`);
      return n;
    }
    const list = this.byName.get(key) ?? [];
    if (list.length === 0) throw new Error(`${this.file}: no node named "${key}"`);
    if (list.length > 1) throw new Error(`${this.file}: node name "${key}" is ambiguous; use a path (${[...this.byPath].filter(([, n]) => n.getName() === key).map(([p]) => p).join(', ')})`);
    return list[0]!;
  }
}

// ── Geometry measures ──────────────────────────────────────────────────────────────
/** Exact box of every vertex in `n`'s subtree, in `space`'s local frame (null = scene space). */
export function boxIn(n: Node, space: Node | null): { min: Vector3; max: Vector3 } {
  const toSpace = space ? world(space).invert() : new Matrix4();
  const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
  const v = new Vector3();
  const el: number[] = [0, 0, 0];
  n.traverse((c) => {
    const mesh = c.getMesh();
    if (!mesh) return;
    const m = toSpace.clone().multiply(world(c));
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, el);
        v.set(el[0]!, el[1]!, el[2]!).applyMatrix4(m);
        min.min(v);
        max.max(v);
      }
    }
  });
  if (!Number.isFinite(min.x)) throw new Error(`node "${n.getName()}" has no geometry to measure`);
  return { min, max };
}

const POINTS: Record<Exclude<BoxPoint, Vec3 | 'origin'>, Vec3> = {
  center: [0.5, 0.5, 0.5], bottom: [0.5, 0, 0.5], top: [0.5, 1, 0.5], back: [0.5, 0.5, 0], front: [0.5, 0.5, 1],
};
export function boxPoint(n: Node, point: BoxPoint, space: Node | null): Vector3 {
  // The node's own origin (its authored pivot: a hinge axis, a bearing), in `space`'s frame.
  if (point === 'origin') return new Vector3().setFromMatrixPosition((space ? world(space).invert() : new Matrix4()).multiply(world(n)));
  const { min, max } = boxIn(n, space);
  const f = Array.isArray(point) ? point : POINTS[point];
  return new Vector3(min.x + (max.x - min.x) * f[0], min.y + (max.y - min.y) * f[1], min.z + (max.z - min.z) * f[2]);
}

// ── Materials ──────────────────────────────────────────────────────────────────────
function applyMaterialPolicy(doc: Document, mat: Material, p: MaterialPolicy): void {
  if (p.rename) mat.setName(p.rename);
  const extras: Record<string, unknown> = { ...(mat.getExtras() as Record<string, unknown>) };
  if (p.transmissionToAlpha !== undefined) {
    mat.setExtension('KHR_materials_transmission', null);
    mat.setExtension('KHR_materials_volume', null);
    mat.setAlphaMode('BLEND');
    const bc = mat.getBaseColorFactor();
    mat.setBaseColorFactor([bc[0], bc[1], bc[2], p.transmissionToAlpha]);
    extras.transmissionToAlpha = p.transmissionToAlpha;
  }
  if (p.ownEnv !== undefined) extras.ownEnv = p.ownEnv === true ? 1.1 : p.ownEnv === false ? 0 : p.ownEnv;
  if (p.emissiveStrength !== undefined) {
    let ext = mat.getExtension<EmissiveStrength>('KHR_materials_emissive_strength');
    if (!ext) {
      ext = doc.createExtension(KHRMaterialsEmissiveStrength).createEmissiveStrength();
      mat.setExtension('KHR_materials_emissive_strength', ext);
    }
    ext.setEmissiveStrength(p.emissiveStrength);
  }
  if (p.doubleSided !== undefined) mat.setDoubleSided(p.doubleSided);
  if (p.baseColorFactor) mat.setBaseColorFactor(p.baseColorFactor);
  if (p.roughness !== undefined) mat.setRoughnessFactor(p.roughness);
  if (p.metalness !== undefined) mat.setMetallicFactor(p.metalness);
  Object.assign(extras, p.extras ?? {});
  mat.setExtras(extras);
}

function findMaterial(doc: Document, name: string): Material {
  const hits = doc.getRoot().listMaterials().filter((m) => m.getName() === name);
  if (hits.length !== 1) throw new Error(`expected exactly one material named "${name}", found ${hits.length}`);
  return hits[0]!;
}

// ── Primitive helpers ──────────────────────────────────────────────────────────────
/** Deep copy (own accessors) so in-place transforms never touch the source. */
function clonePrimitive(prim: Primitive, keep?: readonly string[]): Primitive {
  const c = prim.clone();
  for (const sem of c.listSemantics()) {
    if (keep && !keep.includes(sem)) c.setAttribute(sem, null);
    else c.setAttribute(sem, c.getAttribute(sem)!.clone());
  }
  for (const t of c.listTargets()) c.removeTarget(t);
  const idx = c.getIndices();
  if (idx) c.setIndices(idx.clone());
  return c;
}

function signature(prim: Primitive): string {
  const attrs = prim.listSemantics().sort().map((s) => {
    const a = prim.getAttribute(s)!;
    return `${s}:${a.getType()}:${a.getComponentType()}:${a.getNormalized()}`;
  });
  return `${prim.getMaterial()?.getName() ?? '(none)'}|${prim.getMode()}|${!!prim.getIndices()}|${attrs.join(',')}`;
}

export function triangleCount(prim: Primitive): number {
  const n = prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0;
  return prim.getMode() === 4 ? n / 3 : 0;
}

let simplifierReady: Promise<void> | null = null;
async function simplifier(): Promise<typeof MeshoptSimplifier> {
  simplifierReady ??= MeshoptSimplifier.ready;
  await simplifierReady;
  return MeshoptSimplifier;
}

// ── Master import ──────────────────────────────────────────────────────────────────
export interface ComposeLog {
  (line: string): void;
}

/** Nodes the recipe created or mapped: never removed as empty leftovers. */
type Keep = Set<Node>;
/** `<name>_mesh` children that hold a mapped node's own mesh (they move with it: never joined). */
type Holders = Set<Node>;

/**
 * Suffix of the child node that carries a mapped node's own mesh. A mapped (contract) node always
 * leaves the importer as an EMPTY transform: KHR_mesh_quantization's dequantisation transform is
 * folded into a leaf mesh node's own matrix by gltf-transform `quantize` (origin moved to the mesh
 * box centre, scale ≠ 1), which would silently undo a recipe pivot. On a child it does no harm.
 */
export const MESH_HOLDER_SUFFIX = '_mesh';

async function importMaster(doc: Document, m: MasterRecipe, keep: Keep, holders: Holders, log: ComposeLog): Promise<void> {
  const io = createIO();
  // `file` is relative to models/masters/ (an absolute path is used as is: tests).
  const src = await io.read(resolve(MASTERS_DIR, m.file));
  const srcScene = sceneOf(src);
  const index = new MasterIndex(m.file, srcScene);
  const masterNodes = new Set<Node>();
  traverseScene(srcScene, (n) => masterNodes.add(n));

  // 1. Drop.
  for (const key of m.drop ?? []) {
    const n = index.get(key);
    n.traverse((c) => masterNodes.delete(c));
    const all: Node[] = [];
    n.traverse((c) => all.push(c));
    detach(n);
    for (const c of all.reverse()) c.dispose();
  }

  // 2. Materials: policies and renames (names checked so a typo fails loudly).
  const materials = src.getRoot().listMaterials();
  const used = new Set<string>();
  materials.forEach((mat, i) => {
    const key = m.materials?.[mat.getName()] !== undefined && mat.getName() ? mat.getName() : `#${i}`;
    const policy = m.materials?.[key];
    if (!policy) return;
    used.add(key);
    applyMaterialPolicy(src, mat, policy);
  });
  for (const key of Object.keys(m.materials ?? {})) if (!used.has(key)) throw new Error(`${m.file}: no material "${key}" (names: ${materials.map((x, i) => x.getName() || `#${i}`).join(', ')})`);

  // 2b. The recipe's own deterministic edit of the master (geometry, generated textures).
  if (m.transform) await m.transform(src, log);

  // 3. Decimation (after a weld, so the simplifier sees connected topology).
  if (m.decimate && Object.keys(m.decimate).length) {
    await src.transform(weld());
    const simp = await simplifier();
    for (const [key, spec] of Object.entries(m.decimate)) {
      const { ratio, error } = typeof spec === 'number' ? { ratio: spec, error: undefined } : spec;
      const mesh = index.get(key).getMesh();
      if (!mesh) throw new Error(`${m.file}: "${key}" has no mesh to decimate`);
      for (const prim of mesh.listPrimitives()) {
        const before = triangleCount(prim);
        simplifyPrimitive(prim, { simplifier: simp, ratio, error: error ?? 0.001, lockBorder: false });
        log(`  decimate ${key}: ${before} → ${triangleCount(prim)} tris (ratio ${ratio})`);
      }
    }
  }

  // 4. Merge, wrapped in a placement node under the anchor.
  const map = mergeDocuments(doc, src);
  const merged = map.get(srcScene) as Scene;
  const node = (key: string) => map.get(index.get(key)) as Node;
  const wrapper = doc.createNode(`__master_${m.file}`);
  for (const c of merged.listChildren()) {
    merged.removeChild(c);
    wrapper.addChild(c);
  }
  merged.dispose();
  const anchor = findNode(doc, m.anchor);
  anchor.addChild(wrapper);
  wrapper.setScale([m.scale, m.scale, m.scale]).setRotation(m.rotation ?? [0, 0, 0, 1]).setTranslation(m.offset ?? [0, 0, 0]);
  if (m.align) {
    const at = boxPoint(node(m.align.node), m.align.point, anchor);
    const t = new Vector3(...wrapper.getTranslation()).add(new Vector3(...m.align.to).sub(at));
    wrapper.setTranslation(t.toArray() as Vec3);
  }
  const mergedNodes = new Set([...masterNodes].map((n) => map.get(n) as Node));

  // 5. Created nodes.
  for (const c of m.create ?? []) keep.add(createNode(doc, c, (key) => node(key)));

  // 6. Node maps: pivot (in the node's current parent space), reparent (default: the anchor),
  //    rename, extras, then the node's own mesh moves to a `<name>_mesh` child.
  for (const [key, nm] of Object.entries(m.nodes ?? {})) {
    const n = node(key);
    keep.add(n);
    if (nm.pivot) {
      const parent = parentOf(n);
      const p = Array.isArray(nm.pivot) ? new Vector3(...nm.pivot) : boxPoint(node((nm.pivot as NodePoint).node), (nm.pivot as NodePoint).point, parent);
      repivot(n, p);
    }
    // Default parent: the anchor (out of the master's own scan-space grouping nodes).
    reparentKeepWorld(n, findParent(doc, nm.parent ?? m.anchor));
    // Contract nodes carry unit scale: the scan → scene scale moves into their mesh and children,
    // so a choreography or spring writing `scale` (squash, recoil) starts from 1.
    bakeScale(n);
    if (nm.rename) n.setName(nm.rename);
    if (nm.extras) n.setExtras({ ...(n.getExtras() as Record<string, unknown>), ...nm.extras });
    const holder = holdMesh(doc, n);
    if (holder) holders.add(holder);
  }

  // 7. Shadow flags.
  for (const key of m.noShadowCast ?? []) markNoShadowCast(node(key));

  // 8. Dissolve the wrapper into the anchor; remove empty master leftovers.
  for (const c of wrapper.listChildren()) reparentKeepWorld(c, anchor);
  detach(wrapper);
  wrapper.dispose();
  removeEmpty([...mergedNodes], keep);
  log(`  merged ${m.file} under ${m.anchor} (scale ${m.scale.toFixed(5)})`);
}

/**
 * Moves `n`'s own mesh onto a new child `<name>_mesh` (identity transform), leaving `n` an empty
 * transform that keeps its pivot and unit scale through quantisation. Shadow flags the node carries
 * (`noShadowCast`, `shadowProxy`) are copied to the child, where the stage reads them (on meshes).
 */
function holdMesh(doc: Document, n: Node): Node | null {
  const mesh = n.getMesh();
  if (!mesh) return null;
  const extras = n.getExtras() as Record<string, unknown>;
  const flags: Record<string, unknown> = {};
  for (const k of ['noShadowCast', 'shadowProxy']) if (k in extras) flags[k] = extras[k];
  const holder = doc.createNode(`${n.getName()}${MESH_HOLDER_SUFFIX}`).setMesh(mesh).setExtras(flags);
  n.setMesh(null);
  n.addChild(holder);
  return holder;
}

function markNoShadowCast(n: Node): void {
  n.traverse((c) => {
    if (c.getMesh()) c.setExtras({ ...(c.getExtras() as Record<string, unknown>), noShadowCast: true });
  });
}

function createNode(doc: Document, c: CreateNode, masterNode?: (key: string) => Node): Node {
  const parent = findParent(doc, c.parent);
  const n = doc.createNode(c.name);
  let at = new Vector3();
  if (Array.isArray(c.at)) at = new Vector3(...c.at);
  else if (c.at) {
    if (!masterNode) throw new Error(`created node "${c.name}": a box point needs a master (create it in the master's recipe)`);
    at = boxPoint(masterNode(c.at.node), c.at.point, parent.propertyType === 'Scene' ? null : (parent as Node));
  }
  n.setTranslation(at.toArray() as Vec3);
  if (c.rotation) n.setRotation(c.rotation);
  if (c.scale) n.setScale(c.scale);
  if (c.extras) n.setExtras(c.extras);
  (parent as Node).addChild(n); // Scene and Node share addChild
  return n;
}

/** Moves `n`'s origin to `p` (in its parent's space) without moving its geometry or children. */
function repivot(n: Node, p: Vector3): void {
  const L = local(n);
  const origin = new Vector3().setFromMatrixPosition(L);
  const delta = p.clone().sub(origin);
  // The same offset seen from inside the node (rotation and scale undone).
  // The new origin seen from inside the node (its rotation and scale undone).
  const dLocal = p.clone().applyMatrix4(L.clone().invert());
  if (delta.lengthSq() === 0) return;
  n.setTranslation(p.toArray() as Vec3);
  const shift = new Matrix4().makeTranslation(-dLocal.x, -dLocal.y, -dLocal.z);
  const mesh = n.getMesh();
  if (mesh) {
    const users = mesh.listParents().filter((x) => x.propertyType === 'Node');
    const own = users.length > 1 ? mesh.clone() : mesh;
    if (own !== mesh) n.setMesh(own);
    transformMesh(own, shift.toArray() as Parameters<typeof transformMesh>[1]);
  }
  for (const c of n.listChildren()) setLocal(c, shift.clone().multiply(local(c)));
}

/** Moves `n`'s scale into its mesh vertices and its children's transforms (placement unchanged). */
function bakeScale(n: Node): void {
  const [sx, sy, sz] = n.getScale();
  if (Math.abs(sx - 1) < 1e-9 && Math.abs(sy - 1) < 1e-9 && Math.abs(sz - 1) < 1e-9) return;
  const S = new Matrix4().makeScale(sx, sy, sz);
  const mesh = n.getMesh();
  if (mesh) {
    const users = mesh.listParents().filter((x) => x.propertyType === 'Node');
    const own = users.length > 1 ? mesh.clone() : mesh;
    if (own !== mesh) n.setMesh(own);
    transformMesh(own, S.toArray() as Parameters<typeof transformMesh>[1]);
  }
  for (const c of n.listChildren()) setLocal(c, S.clone().multiply(local(c)));
  n.setScale([1, 1, 1]);
}

function removeEmpty(nodes: Node[], keep: Keep): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes) {
      if (n.isDisposed() || keep.has(n) || n.getMesh() || n.listChildren().length) continue;
      detach(n);
      n.dispose();
      changed = true;
    }
  }
}

// ── Scene-level steps ──────────────────────────────────────────────────────────────
function joinUnder(doc: Document, parentName: string, only: readonly string[] | undefined, prefix: string, contract: ReadonlySet<string>, holders: Holders, log: ComposeLog): void {
  const parent = findNode(doc, parentName);
  const toParent = world(parent).invert();
  const candidates: Node[] = [];
  // Contract nodes below `parent` move on their own: their subtrees (and the mesh holders of
  // mapped nodes) are never baked into the parent's static mesh.
  const walk = (n: Node) => {
    for (const c of n.listChildren()) {
      if (contract.has(c.getName()) || holders.has(c)) continue;
      if (c.listChildren().length) { walk(c); continue; }
      if (!c.getMesh() || (only && !only.includes(c.getName()))) continue;
      candidates.push(c);
    }
  };
  walk(parent);
  const groups = new Map<string, Primitive[]>();
  for (const n of candidates) {
    const m = toParent.clone().multiply(world(n));
    for (const prim of n.getMesh()!.listPrimitives()) {
      const copy = clonePrimitive(prim);
      transformPrimitive(copy, m.toArray() as Parameters<typeof transformPrimitive>[1]);
      const key = signature(copy);
      const list = groups.get(key) ?? [];
      list.push(copy);
      groups.set(key, list);
    }
  }
  const names = new Map<string, number>();
  for (const prims of groups.values()) {
    const joined = prims.length === 1 ? prims[0]! : joinPrimitives(prims);
    if (prims.length > 1) for (const p of prims) p.dispose();
    const mat = joined.getMaterial()?.getName() || 'material';
    const k = names.get(mat) ?? 0;
    names.set(mat, k + 1);
    const name = `${prefix}_${mat}${k ? `_${k}` : ''}`;
    const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(joined));
    parent.addChild(node);
  }
  for (const n of candidates) {
    detach(n);
    n.dispose();
  }
  log(`  join ${parentName}: ${candidates.length} meshes → ${groups.size}`);
}

async function shadowProxy(doc: Document, name: string, from: readonly string[], parentName: string, ratio: number, error: number, log: ComposeLog): Promise<void> {
  const parent = findNode(doc, parentName);
  const toParent = world(parent).invert();
  const prims: Primitive[] = [];
  for (const f of from) {
    const root = findNode(doc, f);
    root.traverse((n) => {
      const mesh = n.getMesh();
      if (!mesh) return;
      const m = toParent.clone().multiply(world(n));
      for (const prim of mesh.listPrimitives()) {
        const copy = clonePrimitive(prim, ['POSITION']);
        transformPrimitive(copy, m.toArray() as Parameters<typeof transformPrimitive>[1]);
        // Dequantised float positions so every clone joins.
        prims.push(copy);
      }
    });
    markNoShadowCast(root);
  }
  const material = doc.getRoot().listMaterials().find((m) => m.getName() === 'fx_shadow_proxy') ?? doc.createMaterial('fx_shadow_proxy');
  for (const p of prims) p.setMaterial(material);
  const joined = prims.length === 1 ? prims[0]! : joinPrimitives(prims);
  if (prims.length > 1) for (const p of prims) p.dispose();
  const before = triangleCount(joined);
  weldPrimitive(joined);
  simplifyPrimitive(joined, { simplifier: await simplifier(), ratio, error, lockBorder: false });
  const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(joined)).setExtras({ shadowProxy: true });
  parent.addChild(node);
  log(`  shadow proxy ${name}: ${before} → ${triangleCount(joined)} tris from ${from.join(', ')}`);
}

async function decodeImage(bytes: Uint8Array): Promise<RawImage> {
  const { data, info } = await loadSharp()(bytes).raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height, channels: info.channels as 3 | 4 };
}
async function encodePng(img: RawImage): Promise<Uint8Array> {
  return new Uint8Array(await loadSharp()(img.data, { raw: { width: img.width, height: img.height, channels: img.channels } }).png({ compressionLevel: 6 }).toBuffer());
}

async function materialVariants(doc: Document, recipe: SceneRecipe, log: ComposeLog): Promise<void> {
  const specs = recipe.materialVariants ?? [];
  if (!specs.length) return;
  const names = recipe.variants ?? [];
  if (names.length < 2) throw new Error('materialVariants need recipe.variants with a default first');
  const ext = doc.createExtension(KHRMaterialsVariants);
  const variants = new Map(names.map((n) => [n, ext.createVariant(n)]));
  const def = variants.get(names[0]!)!;
  for (const spec of specs) {
    const variant = variants.get(spec.variant);
    if (!variant) throw new Error(`variant "${spec.variant}" is not in recipe.variants`);
    const src = findMaterial(doc, spec.of);
    const copy = src.clone().setName(spec.name);
    if (spec.baseColorFactor) copy.setBaseColorFactor(spec.baseColorFactor);
    if (spec.baseColor) {
      const tex = src.getBaseColorTexture();
      if (!tex?.getImage()) throw new Error(`variant ${spec.name}: "${spec.of}" has no base-colour image`);
      const out = await spec.baseColor(await decodeImage(tex.getImage()!));
      const t = doc.createTexture(`${spec.name}_baseColor`).setImage(await encodePng(out)).setMimeType('image/png');
      copy.setBaseColorTexture(t);
    }
    let mapped = 0;
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        if (prim.getMaterial() !== src) continue;
        let list = prim.getExtension<MappingList>('KHR_materials_variants');
        if (!list) {
          list = ext.createMappingList();
          list.addMapping(ext.createMapping().setMaterial(src).addVariant(def));
          prim.setExtension('KHR_materials_variants', list);
        }
        list.addMapping(ext.createMapping().setMaterial(copy).addVariant(variant));
        mapped++;
      }
    }
    log(`  variant ${spec.variant}: ${spec.of} → ${spec.name} on ${mapped} primitive(s)`);
  }
}

/**
 * Builds the masters into `doc` (the builder's document, or a fresh one) in the documented order:
 * drop builder nodes → scene-level create → each master (drop, materials, decimate, merge+place,
 * create, node maps, noShadowCast) → joins → shadow proxies → material variants → finish → contract check.
 */
export async function composeMasters(doc: Document, recipe: SceneRecipe, log: ComposeLog = console.log): Promise<void> {
  for (const name of recipe.dropBuilderNodes ?? []) {
    const n = findNode(doc, name);
    const all: Node[] = [];
    n.traverse((c) => all.push(c));
    detach(n);
    for (const c of all.reverse()) c.dispose();
  }
  const keep: Keep = new Set();
  const holders: Holders = new Set();
  for (const m of recipe.masters) await importMaster(doc, m, keep, holders, log);
  const contract = new Set(recipe.contract);
  for (const j of recipe.join ?? []) joinUnder(doc, j.parent, j.nodes, j.prefix ?? j.parent, contract, holders, log);
  for (const s of recipe.shadowProxies ?? []) await shadowProxy(doc, s.name, s.from, s.parent, s.ratio, s.error ?? 0.02, log);
  await materialVariants(doc, recipe, log);
  if (recipe.finish) await recipe.finish(doc, log);
  checkContract(doc, recipe.contract);
}

/** Scene-level created nodes (before any master), e.g. a root when there is no builder. */
export function createSceneNodes(doc: Document, nodes: readonly CreateNode[]): void {
  for (const c of nodes) createNode(doc, c);
}

export function contractStatus(doc: Document, contract: readonly string[]): { found: string[]; missing: string[]; duplicated: string[] } {
  const counts = new Map<string, number>();
  traverseScene(sceneOf(doc), (n) => counts.set(n.getName(), (counts.get(n.getName()) ?? 0) + 1));
  return {
    found: contract.filter((n) => counts.get(n) === 1),
    missing: contract.filter((n) => !counts.get(n)),
    duplicated: contract.filter((n) => (counts.get(n) ?? 0) > 1),
  };
}

export function checkContract(doc: Document, contract: readonly string[]): void {
  const { missing, duplicated } = contractStatus(doc, contract);
  if (missing.length || duplicated.length) throw new Error(`contract nodes missing: [${missing.join(', ')}] duplicated: [${duplicated.join(', ')}]`);
}

// ── Texture policy ─────────────────────────────────────────────────────────────────
/** Slots that hold vectors, not colour: always lossless (any normal map, anisotropy direction). */
export const DATA_SLOT = /normal|anisotropy/i;
/** Short edge at or below this many pixels: a lookup table (LUT). Never resized, always lossless. */
export const LUT_EDGE = 16;

/** Materials using `tex`, directly or through an extension property (clearcoat, sheen…). */
function textureUsers(tex: Texture): Set<string> {
  const users = new Set<string>();
  for (const p of tex.listParents()) {
    if (p.propertyType === 'Material') users.add((p as Material).getName());
    else for (const pp of p.listParents()) if (pp.propertyType === 'Material') users.add((pp as Material).getName());
  }
  return users;
}

export interface TextureDecision {
  /** Target size (unchanged when no resize is needed). */
  size: [number, number];
  lossless: boolean;
  /** Why: 'lut', 'data slot', 'recipe' (lossless / keepSize lists), or ''. */
  reason: string;
}

/** What the policy does to one texture (pure: tests and the report use it too). */
export function textureDecision(tex: Texture, recipe: SceneRecipe): TextureDecision {
  const policy = recipe.textures ?? {};
  const size = (tex.getSize() ?? [0, 0]) as [number, number];
  const keys: string[] = [];
  for (const u of textureUsers(tex)) for (const s of listTextureSlots(tex)) keys.push(`${u}/${s}`);
  const listed = (list?: readonly string[]) => keys.some((k) => list?.includes(k));
  const lut = size[0] > 0 && Math.min(size[0], size[1]) <= LUT_EDGE;
  const data = listTextureSlots(tex).some((s) => DATA_SLOT.test(s));
  const keep = lut || listed(policy.keepSize);
  let cap = policy.maxSize ?? 2048;
  for (const k of keys) {
    const c = policy.caps?.[k];
    if (c !== undefined) cap = Math.min(cap, c);
  }
  // Fit within cap × cap, aspect kept (gltf-transform's fitWithin, so sizes match its resize).
  let [w, h] = size;
  if (!keep) {
    if (w > cap) { h = Math.floor(h * (cap / w)); w = cap; }
    if (h > cap) { w = Math.floor(w * (cap / h)); h = cap; }
  }
  return {
    size: [Math.max(1, w), Math.max(1, h)],
    lossless: lut || data || listed(policy.lossless),
    reason: lut ? 'lut' : listed(policy.lossless) || listed(policy.keepSize) ? 'recipe' : data ? 'data slot' : '',
  };
}

/**
 * Every texture → WebP (declared with EXT_texture_webp). Longest edge capped (default 2048,
 * per material/slot caps) unless the texture is a LUT or listed in `keepSize`; data slots (normal,
 * clearcoat normal, anisotropy), LUTs and `lossless` keys are exact lossless WebP (`exact`: RGB
 * under zero alpha kept too); colour and ORM maps lossy at `quality`. A texture that already fits
 * is never resampled.
 */
export async function applyTexturePolicy(doc: Document, recipe: SceneRecipe, log: ComposeLog): Promise<void> {
  const policy = recipe.textures ?? {};
  const encoder = loadSharp();
  const textures = doc.getRoot().listTextures();
  for (const tex of textures) {
    const before = (tex.getSize() ?? [0, 0]) as [number, number];
    const d = textureDecision(tex, recipe);
    const resize = d.size[0] !== before[0] || d.size[1] !== before[1];
    if (d.lossless) {
      let img = encoder(tex.getImage()!);
      if (resize) img = img.resize(d.size[0], d.size[1], { fit: 'fill', kernel: 'lanczos3' });
      tex.setImage(new Uint8Array(await img.webp({ lossless: true, exact: true }).toBuffer())).setMimeType('image/webp');
    } else {
      await compressTexture(tex, {
        encoder, targetFormat: 'webp', quality: policy.quality ?? 90,
        ...(resize ? { resize: d.size } : {}),
      });
    }
    const uri = tex.getURI();
    if (uri) tex.setURI(uri.replace(/\.(png|jpe?g)$/i, '.webp'));
    const label = tex.getName() || listTextureSlots(tex).join('+');
    if (resize) log(`  texture ${label}: ${before.join('×')} → ${d.size.join('×')}${d.lossless ? ' (lossless)' : ''}`);
    else if (d.reason === 'lut' || d.reason === 'recipe') log(`  texture ${label}: ${before.join('×')} kept, lossless (${d.reason})`);
  }
  // Core glTF allows only PNG and JPEG images: WebP needs the extension, declared required.
  if (textures.length) doc.createExtension(EXTTextureWebP).setRequired(true);
}

/**
 * The chain after composition (shared by `pnpm models` and the tests): dedup → weld →
 * prune(keepLeaves, keepAttributes) → texture policy → quantize(POSITION, NORMAL) → unpartition.
 * UVs stay float (masters' atlases and the builder's signature tiling alike). The writer then
 * applies `compressGeometry` (v1.6, meshopt; lossless on top of this quantisation).
 */
export async function optimizeComposed(doc: Document, recipe: SceneRecipe, log: ComposeLog): Promise<void> {
  await doc.transform(dedup(), weld(), prune({ keepLeaves: true, keepAttributes: true }));
  await applyTexturePolicy(doc, recipe, log);
  await doc.transform(quantize({ pattern: /^(POSITION|NORMAL)$/, quantizePosition: 14, quantizeNormal: 10 }), unpartition());
}

// ── Geometry compression (v1.6) ───────────────────────────────────────────────────────
/**
 * The one pipeline option for geometry compression, applied to every scene GLB and the shared
 * bin as the last step before writing (`compressGeometry`). `pnpm models --compression=none`
 * writes the same document without it, for A/B checks.
 *
 * - `'meshopt'` (default): EXT_meshopt_compression, declared required, with the QUANTIZE method:
 *   every vertex stream and index buffer goes through meshopt's byte codecs with **no filters**
 *   (no octahedral normals, no exponential positions) and **no reorder**, so the decoded
 *   accessors are bit-identical to the uncompressed export's, in the same vertex and triangle
 *   order (the index codec may rotate a triangle's corners, keeping its winding). Quantisation
 *   stays exactly what `optimizeComposed` does (14-bit positions, 10-bit normals, KHR_mesh_quantization).
 * - `'none'`: the uncompressed form every GLB had before v1.6 (KHR_mesh_quantization only).
 *
 * Why no reorder and no further quantisation (measured on the v1.6 exports, docs/asset-manifest.md):
 * meshopt's size-targeted reorder made the cake 1.4 MiB larger (its swept piping is already in
 * coherent strip order); 13-bit positions saved 11 KiB raw / 238 KiB gzip on the cake while
 * moving vertices; octahedral 8-bit normals would change the shading.
 */
export type GeometryCompression = 'meshopt' | 'none';
export const GEOMETRY_COMPRESSION: GeometryCompression = 'meshopt';

/** Marks the document for meshopt compression on write (or leaves it as is for `'none'`). */
export function compressGeometry(doc: Document, mode: GeometryCompression = GEOMETRY_COMPRESSION): void {
  if (mode === 'none' || !doc.getRoot().listAccessors().length) return;
  doc.createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
}
