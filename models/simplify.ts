import { BufferAttribute, BufferGeometry } from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';

/**
 * Tooling-only decimation for SDF parts (dev pages and GLB export). Never imported by the
 * runtime bundle: production loads pre-decimated GLB.
 */
export type Simplify = (g: BufferGeometry, ratio: number, error?: number) => BufferGeometry;

export async function createSimplifier(): Promise<Simplify> {
  await MeshoptSimplifier.ready;
  return (g, ratio, error = 0.0006) => {
    const pos = g.getAttribute('position') as BufferAttribute;
    const nor = g.getAttribute('normal') as BufferAttribute;
    const index = new Uint32Array(g.getIndex()!.array);
    const target = Math.max(3, Math.floor((index.length * ratio) / 3) * 3);
    const [out] = MeshoptSimplifier.simplifyWithAttributes(
      index,
      pos.array as Float32Array,
      3,
      nor.array as Float32Array,
      3,
      [0.6, 0.6, 0.6],
      null,
      target,
      error,
      ['ErrorAbsolute'],
    );
    // Compact to the vertices still referenced.
    const [remap, unique] = MeshoptSimplifier.compactMesh(out);
    const p = new Float32Array(unique * 3), n = new Float32Array(unique * 3);
    const uvSrc = g.getAttribute('uv') as BufferAttribute | undefined;
    const uv = uvSrc ? new Float32Array(unique * 2) : null;
    // compactMesh rewrites `out` in place and returns the old→new remap.
    for (let old = 0; old < remap.length; old++) {
      const nw = remap[old]!;
      if (nw === 0xffffffff) continue;
      p[nw * 3] = pos.getX(old); p[nw * 3 + 1] = pos.getY(old); p[nw * 3 + 2] = pos.getZ(old);
      n[nw * 3] = nor.getX(old); n[nw * 3 + 1] = nor.getY(old); n[nw * 3 + 2] = nor.getZ(old);
      if (uv && uvSrc) { uv[nw * 2] = uvSrc.getX(old); uv[nw * 2 + 1] = uvSrc.getY(old); }
    }
    const r = new BufferGeometry();
    r.setAttribute('position', new BufferAttribute(p, 3));
    r.setAttribute('normal', new BufferAttribute(n, 3));
    if (uv) r.setAttribute('uv', new BufferAttribute(uv, 2));
    r.setIndex(new BufferAttribute(out, 1));
    g.dispose();
    return r;
  };
}
