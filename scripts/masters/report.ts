import { gzipSync } from 'node:zlib';
import type { Document, Material, Node, Texture } from '@gltf-transform/core';
import { listTextureSlots } from '@gltf-transform/functions';
import { contractStatus, triangleCount } from './compose.ts';

export interface ExportReport {
  scene: string;
  triangles: number;
  drawCalls: number;
  proxyTriangles: number;
  proxyDrawCalls: number;
  textures: { name: string; slots: string; size: [number, number]; mime: string; bytes: number }[];
  textureMiB: number;
  glbKiB: number;
  gzipKiB: number;
  /** v1.6: the same document written without geometry compression (null when not measured). */
  uncompressed: { glbKiB: number; gzipKiB: number } | null;
  /** Geometry compression in the written GLB ('meshopt' or 'none'). */
  compression: string;
  nodes: number;
  contract: { found: string[]; missing: string[]; duplicated: string[] };
}

/** RGBA8 with a full mip chain: 4 bytes per texel × 4/3. */
export const gpuBytes = (w: number, h: number) => (w * h * 4 * 4) / 3;

export function measure(scene: string, doc: Document, glb: Uint8Array, contract: readonly string[], uncompressed?: Uint8Array): ExportReport {
  let triangles = 0, drawCalls = 0, proxyTriangles = 0, proxyDrawCalls = 0, nodes = 0;
  const visit = (n: Node) => {
    nodes++;
    const proxy = !!(n.getExtras() as { shadowProxy?: boolean }).shadowProxy;
    for (const prim of n.getMesh()?.listPrimitives() ?? []) {
      const t = triangleCount(prim);
      if (proxy) { proxyTriangles += t; proxyDrawCalls++; } else { triangles += t; drawCalls++; }
    }
    for (const c of n.listChildren()) visit(c);
  };
  for (const s of doc.getRoot().listScenes()) for (const n of s.listChildren()) visit(n);
  const textures = doc.getRoot().listTextures().map((t: Texture) => {
    const users = new Set<string>();
    for (const p of t.listParents()) {
      if (p.propertyType === 'Material') users.add((p as Material).getName());
      else for (const pp of p.listParents()) if (pp.propertyType === 'Material') users.add((pp as Material).getName());
    }
    return { name: t.getName(), slots: `${listTextureSlots(t).join('+')} of ${[...users].join(', ')}`, size: (t.getSize() ?? [0, 0]) as [number, number], mime: t.getMimeType(), bytes: t.getImage()?.byteLength ?? 0 };
  });
  return {
    scene, triangles, drawCalls, proxyTriangles, proxyDrawCalls, textures, nodes,
    textureMiB: textures.reduce((a, t) => a + gpuBytes(t.size[0], t.size[1]), 0) / 2 ** 20,
    glbKiB: glb.byteLength / 1024,
    gzipKiB: gzipSync(glb, { level: 9 }).byteLength / 1024,
    uncompressed: uncompressed ? { glbKiB: uncompressed.byteLength / 1024, gzipKiB: gzipSync(uncompressed, { level: 9 }).byteLength / 1024 } : null,
    compression: doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'EXT_meshopt_compression') ? 'meshopt' : 'none',
    contract: contractStatus(doc, contract),
  };
}

export function formatReport(r: ExportReport): string {
  const lines = [
    `── ${r.scene} export report ──`,
    `  triangles ${r.triangles.toLocaleString('en-US')} · draw calls ${r.drawCalls}` +
      (r.proxyDrawCalls ? ` (+ ${r.proxyDrawCalls} shadow proxy, ${r.proxyTriangles.toLocaleString('en-US')} tris, shadow pass only)` : '') + ` · ${r.nodes} nodes`,
    `  textures ${r.textures.length} · ${r.textureMiB.toFixed(1)} MiB as RGBA8 + mips`,
    ...r.textures.map((t) => `    ${t.size[0]}×${t.size[1]} ${t.mime.replace('image/', '')} ${(t.bytes / 1024).toFixed(0)} KiB  ${t.slots}${t.name ? ` (${t.name})` : ''}`),
    `  GLB ${r.glbKiB.toFixed(1)} KiB raw · ${r.gzipKiB.toFixed(1)} KiB gzip · geometry compression ${r.compression}` +
      (r.uncompressed && r.compression !== 'none' ? ` (uncompressed ${r.uncompressed.glbKiB.toFixed(1)} KiB raw · ${r.uncompressed.gzipKiB.toFixed(1)} KiB gzip)` : ''),
    `  contract nodes found (${r.contract.found.length}): ${r.contract.found.join(', ')}`,
    `  contract nodes missing: ${r.contract.missing.length ? r.contract.missing.join(', ') : 'none'}`,
  ];
  return lines.join('\n');
}
