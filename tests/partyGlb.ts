import { join } from 'node:path';
import type { Document, Node as GltfNode } from '@gltf-transform/core';
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { createIO } from '../scripts/masters/compose.ts';

/**
 * Test helper: the exported Party GLB (`pnpm models party`) as a three.js hierarchy, geometry only.
 * Node transforms, positions (dequantised), normals and indices are read with gltf-transform and
 * every material becomes a plain MeshStandardMaterial carrying its name, so the rig's geometry
 * operations (extendLid) and the scene's node writes run in Node exactly as they do on the
 * GLTFLoader's output. A node with several primitives becomes a Group of meshes (as GLTFLoader).
 */
export const PARTY_GLB = join(import.meta.dirname, '..', 'assets', 'scenes', 'party', 'party.glb');

export async function readPartyDoc(): Promise<Document> {
  return createIO().read(PARTY_GLB);
}

export function threeFromDoc(doc: Document, rootName = 'party_root'): Object3D {
  const materials = new Map<string, MeshStandardMaterial>();
  const material = (name: string) => materials.get(name) ?? (materials.set(name, new MeshStandardMaterial({ name })), materials.get(name)!);
  const build = (n: GltfNode): Object3D => {
    const prims = n.getMesh()?.listPrimitives() ?? [];
    const meshes = prims.map((p) => {
      const g = new BufferGeometry();
      for (const [semantic, attr] of [['position', 'POSITION'], ['normal', 'NORMAL']] as const) {
        const a = p.getAttribute(attr);
        if (!a) continue;
        const out = new Float32Array(a.getCount() * 3), el = [0, 0, 0];
        for (let i = 0; i < a.getCount(); i++) {
          a.getElement(i, el);
          out[i * 3] = el[0]!; out[i * 3 + 1] = el[1]!; out[i * 3 + 2] = el[2]!;
        }
        g.setAttribute(semantic, new BufferAttribute(out, 3));
      }
      const idx = p.getIndices();
      if (idx) g.setIndex(Array.from(idx.getArray()!));
      return new Mesh(g, material(p.getMaterial()?.getName() ?? ''));
    });
    let o: Object3D;
    if (meshes.length === 1) o = meshes[0]!;
    else {
      o = new Group();
      for (const m of meshes) o.add(m);
    }
    o.name = n.getName();
    o.position.fromArray(n.getTranslation());
    o.quaternion.fromArray(n.getRotation());
    o.scale.fromArray(n.getScale());
    o.userData = { ...(n.getExtras() as object) };
    for (const c of n.listChildren()) o.add(build(c));
    return o;
  };
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]!;
  let found: GltfNode | null = null;
  for (const top of scene.listChildren()) top.traverse((n) => { if (!found && n.getName() === rootName) found = n; });
  if (!found) throw new Error(`no ${rootName} in the GLB`);
  const root = build(found);
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  return root;
}
