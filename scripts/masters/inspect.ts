/**
 * Inspect a master (or any GLB) before writing a recipe:
 *
 *   node --experimental-transform-types --no-warnings scripts/masters/inspect.ts models/masters/<file>.glb [scale]
 *
 * Prints the node tree (names, paths you can use in a recipe, transforms, triangles, materials,
 * scene-space boxes multiplied by `scale`), then every material (name or `#index`, factors,
 * extensions) and texture. Boxes are exact (every vertex), in the file's scene space × scale.
 */
import type { Node } from '@gltf-transform/core';
import { boxIn, createIO, triangleCount } from './compose.ts';

const file = process.argv[2];
if (!file) throw new Error('usage: inspect.ts <file.glb> [scale]');
const scale = Number(process.argv[3] ?? 1);
const doc = await createIO().read(file);
const root = doc.getRoot();
const f = (v: number) => (v * scale).toFixed(4);
const walk = (n: Node, path: string, depth: number) => {
  const p = path ? `${path}/${n.getName()}` : n.getName();
  const mesh = n.getMesh();
  let line = `${'  '.repeat(depth)}${n.getName()}  [${p}]`;
  const t = n.getTranslation(), r = n.getRotation(), s = n.getScale();
  if (t.some((x) => x !== 0) || r[3] !== 1 || s.some((x) => x !== 1)) line += `  t=${t.map((x) => x.toFixed(4))} r=${r.map((x) => x.toFixed(3))} s=${s.map((x) => x.toFixed(3))}`;
  if (mesh) line += `  tris=${mesh.listPrimitives().reduce((a, q) => a + triangleCount(q), 0)} mats=${mesh.listPrimitives().map((q) => q.getMaterial()?.getName() || '(unnamed)').join(',')}`;
  try {
    const b = boxIn(n, null);
    line += `  box=[${f(b.min.x)}, ${f(b.min.y)}, ${f(b.min.z)}]..[${f(b.max.x)}, ${f(b.max.y)}, ${f(b.max.z)}]`;
  } catch {
    // empty subtree
  }
  console.log(line);
  for (const c of n.listChildren()) walk(c, p, depth + 1);
};
for (const s of root.listScenes()) for (const n of s.listChildren()) walk(n, '', 0);
root.listMaterials().forEach((m, i) => {
  console.log(`material ${m.getName() || `#${i}`}: baseColor ${m.getBaseColorFactor().map((x) => x.toFixed(3))} rough ${m.getRoughnessFactor()} metal ${m.getMetallicFactor()} alpha ${m.getAlphaMode()}${m.getDoubleSided() ? ' doubleSided' : ''} ext [${m.listExtensions().map((e) => e.extensionName).join(', ')}]`);
});
for (const t of root.listTextures()) console.log(`texture ${t.getName() || '(unnamed)'} ${t.getMimeType()} ${(t.getSize() ?? []).join('×')} ${((t.getImage()?.byteLength ?? 0) / 1024).toFixed(0)} KiB`);
