import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Document, type Texture } from '@gltf-transform/core';
import { KHRMaterialsAnisotropy } from '@gltf-transform/extensions';
import { boxIn, composeMasters, compressGeometry, createIO, createSceneNodes, findNode, LUT_EDGE, optimizeComposed } from '../scripts/masters/compose.ts';
import { loadSharp } from '../scripts/masters/sharp.ts';
import type { SceneRecipe } from '../scripts/masters/types.ts';

/**
 * The master importer end to end on a synthetic master: compose → the export chain (quantize
 * included) → geometry compression (meshopt, v1.6) → GLB bytes → read back, exactly as
 * `pnpm models` does.
 */

/** Deterministic pseudo-random bytes (LCG). */
function noise(n: number, seed: number): Uint8Array {
  const out = new Uint8Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = s >>> 24;
  }
  return out;
}

async function png(width: number, height: number, seed: number): Promise<{ bytes: Uint8Array; raw: Uint8Array }> {
  const raw = noise(width * height * 3, seed);
  const bytes = new Uint8Array(await loadSharp()(raw, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 6 }).toBuffer());
  return { bytes, raw };
}

async function decodeRgb(tex: Texture): Promise<Uint8Array> {
  const { data, info } = await loadSharp()(tex.getImage()!).raw().toBuffer({ resolveWithObject: true });
  if (info.channels === 3) return new Uint8Array(data);
  const rgb = new Uint8Array(info.width * info.height * 3);
  for (let i = 0, j = 0; i < data.length; i += info.channels, j += 3) rgb.set(data.subarray(i, i + 3), j);
  return rgb;
}

/** A unit box mesh spanning x, z ∈ [−0.1, 0.1] and y ∈ [0, 1] in its node's space. */
function boxMesh(doc: Document, name: string) {
  const p: number[] = [];
  for (const x of [-0.1, 0.1]) for (const y of [0, 1]) for (const z of [-0.1, 0.1]) p.push(x, y, z);
  const idx = [0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3];
  const buffer = doc.getRoot().listBuffers()[0]!;
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(p)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(idx)).setBuffer(buffer));
  return doc.createMesh(name).addPrimitive(prim);
}

/** Master: group(t 0.1,0,0) › { leaf (t 0.3,0.5,0, box y 0..1), base (box) }, with textures on leaf. */
async function writeMaster(dir: string) {
  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene('master');
  doc.getRoot().setDefaultScene(scene);
  const aniso = await png(8192, 4, 1); // groove-direction LUT, as the turntable's vinyl
  const ramp = await png(256, 4, 2); // colour ramp LUT, as the cake's wax
  const wide = await png(3000, 100, 3); // colour, over the cap
  const tex = (name: string, bytes: Uint8Array) => doc.createTexture(name).setImage(bytes).setMimeType('image/png');
  const vinyl = doc.createMaterial('vinyl').setBaseColorTexture(tex('ramp', ramp.bytes)).setEmissiveTexture(tex('wide', wide.bytes));
  const ext = doc.createExtension(KHRMaterialsAnisotropy);
  vinyl.setExtension('KHR_materials_anisotropy', ext.createAnisotropy().setAnisotropyStrength(1).setAnisotropyTexture(tex('aniso', aniso.bytes)));
  const group = doc.createNode('group').setTranslation([0.1, 0, 0]);
  const leaf = doc.createNode('leaf').setTranslation([0.3, 0.5, 0]).setMesh(boxMesh(doc, 'leaf'));
  leaf.getMesh()!.listPrimitives()[0]!.setMaterial(vinyl);
  const base = doc.createNode('base').setTranslation([-0.3, 0, 0]).setMesh(boxMesh(doc, 'base'));
  base.getMesh()!.listPrimitives()[0]!.setMaterial(doc.createMaterial('stone'));
  group.addChild(leaf).addChild(base);
  scene.addChild(group);
  const file = join(dir, 'synthetic.glb');
  await writeFile(file, await createIO().writeBinary(doc));
  return { file, aniso, ramp };
}

describe('master importer: export chain on a synthetic master', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'masters-'));
  const master = await writeMaster(dir);
  const recipe: SceneRecipe = {
    scene: 'test',
    builder: null,
    create: [{ name: 'test_root', parent: '@scene' }],
    masters: [{
      file: master.file,
      anchor: 'test_root',
      scale: 0.5,
      offset: [1, 0, 0],
      materials: { vinyl: { rename: 'vinyl_renamed' } },
      // Runs on the master's own document after the material policies (it sees the new name),
      // before placement: lifts `base` by 0.1 scan units and marks the material.
      transform: (src) => {
        const vinyl = src.getRoot().listMaterials().find((m) => m.getName() === 'vinyl_renamed');
        vinyl?.setExtras({ transformed: true });
        const base = src.getRoot().listNodes().find((n) => n.getName() === 'base')!;
        const pos = base.getMesh()!.listPrimitives()[0]!.getAttribute('POSITION')!;
        const e = [0, 0, 0];
        for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, e); pos.setElement(i, [e[0]!, e[1]! + 0.1, e[2]!]); }
      },
      nodes: { leaf: { rename: 'candle', pivot: { node: 'leaf', point: 'bottom' }, extras: { noShadowCast: true } } },
    }],
    join: [{ parent: 'test_root' }],
    contract: ['test_root', 'candle'],
  };
  const doc = new Document();
  doc.createBuffer();
  doc.getRoot().setDefaultScene(doc.createScene('test'));
  createSceneNodes(doc, recipe.create!);
  await composeMasters(doc, recipe, () => {});
  await optimizeComposed(doc, recipe, () => {});
  const plain = await createIO().writeBinary(doc);
  compressGeometry(doc);
  const glb = await createIO().writeBinary(doc);
  const out = await createIO().readBinary(glb);
  const used = out.getRoot().listExtensionsUsed();

  it('compresses geometry with meshopt (required, no filters) and decodes to the uncompressed streams bit for bit', async () => {
    const meshopt = used.find((e) => e.extensionName === 'EXT_meshopt_compression');
    expect(meshopt?.isRequired()).toBe(true);
    // (No size check here: two boxes are smaller than the extension's JSON. The real GLBs: docs/asset-manifest.md.)
    const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + new DataView(glb.buffer, glb.byteOffset).getUint32(12, true))));
    const views = (json.bufferViews as { extensions?: { EXT_meshopt_compression?: { filter?: string } } }[]).map((v) => v.extensions?.EXT_meshopt_compression).filter(Boolean);
    expect(views.length).toBeGreaterThan(0);
    expect(views.every((v) => v!.filter === undefined)).toBe(true);
    // Same vertex and triangle order: every attribute equal; each triangle the same corners, at
    // most rotated by the index codec (winding kept).
    const ref = await createIO().readBinary(plain);
    const prims = (d: typeof out) => d.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
    expect(prims(out).length).toBe(prims(ref).length);
    prims(ref).forEach((a, i) => {
      const b = prims(out)[i]!;
      expect(b.listSemantics()).toEqual(a.listSemantics());
      for (const sem of a.listSemantics()) expect(Array.from(b.getAttribute(sem)!.getArray()!)).toEqual(Array.from(a.getAttribute(sem)!.getArray()!));
      const ia = a.getIndices()!.getArray()!, ib = b.getIndices()!.getArray()!;
      expect(ib.length).toBe(ia.length);
      for (let t = 0; t < ia.length; t += 3) {
        const tri = [ia[t]!, ia[t + 1]!, ia[t + 2]!], got = [ib[t]!, ib[t + 1]!, ib[t + 2]!];
        expect([0, 1, 2].some((r) => tri.every((v, k) => v === got[(k + r) % 3]))).toBe(true);
      }
    });
  });

  it('the compressed export is deterministic', async () => {
    expect(Buffer.compare(Buffer.from(await createIO().writeBinary(doc)), Buffer.from(glb))).toBe(0);
  });

  it('really quantises (the case that used to undo a pivot)', () => {
    expect(used.map((e) => e.extensionName)).toContain('KHR_mesh_quantization');
  });

  it('a pivoted leaf mesh keeps its pivot and unit scale through quantisation', () => {
    // Master: group 0.1 + leaf 0.3 + box bottom (0, 0, 0) = (0.4, 0.5, 0) scan units; × 0.5 + (1, 0, 0).
    const candle = findNode(out, 'candle');
    const t = candle.getTranslation();
    expect(t[0]).toBeCloseTo(1.2, 6);
    expect(t[1]).toBeCloseTo(0.25, 6);
    expect(t[2]).toBeCloseTo(0, 6);
    expect(candle.getScale()).toEqual([1, 1, 1]);
    expect(candle.getRotation()).toEqual([0, 0, 0, 1]);
    // The contract node is an empty transform; its mesh rides on `candle_mesh` (with the shadow flag).
    expect(candle.getMesh()).toBeNull();
    const holder = findNode(out, 'candle_mesh');
    expect(holder.getParentNode()).toBe(candle);
    expect(holder.getMesh()).not.toBeNull();
    expect((holder.getExtras() as { noShadowCast?: boolean }).noShadowCast).toBe(true);
    // Geometry unchanged: the box spans y 0.25..0.75 in scene space, from the pivot upwards.
    const box = boxIn(candle, candle);
    expect(box.min.y).toBeCloseTo(0, 3);
    expect(box.max.y).toBeCloseTo(0.5, 3);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 3);
  });

  it('a master `transform` runs after the material policies and before placement, and its edits survive the chain', () => {
    const vinyl = out.getRoot().listMaterials().find((m) => m.getName() === 'vinyl_renamed')!;
    expect(vinyl.getExtras()).toMatchObject({ transformed: true });
    // base: box y 0..1 lifted to 0.1..1.1 scan units, × 0.5 → 0.05..0.55 under test_root.
    const b = boxIn(findNode(out, 'test_root_stone'), findNode(out, 'test_root'));
    expect(b.min.y).toBeCloseTo(0.05, 3);
    expect(b.max.y).toBeCloseTo(0.55, 3);
  });

  it('a scene join never bakes a contract node or its mesh holder into the static mesh', () => {
    const root = findNode(out, 'test_root');
    const joined = root.listChildren().filter((c) => c.getName().startsWith('test_root_'));
    expect(joined.map((c) => c.getName())).toEqual(['test_root_stone']);
    expect(findNode(out, 'candle').getParentNode()).toBe(root);
  });

  it('data textures and LUTs stay exact; colour maps are capped; WebP is declared', async () => {
    const byName = (name: string) => out.getRoot().listTextures().find((t) => t.getName() === name)!;
    for (const t of out.getRoot().listTextures()) expect(t.getMimeType()).toBe('image/webp');
    const webp = used.find((e) => e.extensionName === 'EXT_texture_webp');
    expect(webp?.isRequired()).toBe(true);
    // The 8192 × 4 anisotropy LUT: full size, bit-exact (it used to become a lossy 2048 × 1).
    expect(byName('aniso').getSize()).toEqual([8192, 4]);
    expect(Buffer.compare(Buffer.from(await decodeRgb(byName('aniso'))), Buffer.from(master.aniso.raw))).toBe(0);
    // A colour LUT (short edge ≤ LUT_EDGE) is exact too.
    expect(LUT_EDGE).toBeGreaterThanOrEqual(4);
    expect(byName('ramp').getSize()).toEqual([256, 4]);
    expect(Buffer.compare(Buffer.from(await decodeRgb(byName('ramp'))), Buffer.from(master.ramp.raw))).toBe(0);
    // An ordinary colour map over the cap is fitted within 2048 (aspect kept).
    expect(byName('wide').getSize()).toEqual([2048, 68]);
  });
});
