import { describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import { meshSDF, roundBox, smoothUnion, sphere, translate } from '../models/sdf.ts';

function windingStats(f: Parameters<typeof meshSDF>[0], b: Box3, cell: number) {
  const g = meshSDF(f, b, { cell });
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const idx = g.getIndex()!;
  const a = new Vector3(), bb = new Vector3(), c = new Vector3(), n = new Vector3(), face = new Vector3();
  let flipped = 0;
  const edges = new Map<string, number>();
  for (let t = 0; t < idx.count; t += 3) {
    const i0 = idx.getX(t), i1 = idx.getX(t + 1), i2 = idx.getX(t + 2);
    a.fromBufferAttribute(pos, i0); bb.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    face.subVectors(bb, a).cross(c.clone().sub(a));
    n.fromBufferAttribute(nor, i0).add(new Vector3().fromBufferAttribute(nor, i1)).add(new Vector3().fromBufferAttribute(nor, i2));
    if (face.dot(n) < 0) flipped++;
    for (const [p, q] of [[i0, i1], [i1, i2], [i2, i0]]) {
      const k = p! < q! ? `${p}-${q}` : `${q}-${p}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  const open = [...edges.values()].filter((v) => v !== 2).length;
  let maxErr = 0;
  for (let i = 0; i < pos.count; i++) maxErr = Math.max(maxErr, Math.abs(f(pos.getX(i), pos.getY(i), pos.getZ(i))));
  return { tris: idx.count / 3, flipped, open, maxErr };
}

describe('SDF surface nets', () => {
  it('meshes a sphere watertight, outward-wound, on the surface', () => {
    const s = windingStats(sphere(0.5), new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5)), 0.04);
    expect(s.tris).toBeGreaterThan(500);
    expect(s.flipped).toBe(0);
    expect(s.open).toBe(0);
    expect(s.maxErr).toBeLessThan(0.002);
  });

  it('meshes a filleted union of boxes watertight', () => {
    const f = smoothUnion(roundBox(0.4, 0.2, 0.3, 0.05), translate(roundBox(0.15, 0.3, 0.15, 0.04), 0.2, 0.3, 0), 0.08);
    const s = windingStats(f, new Box3(new Vector3(-0.45, -0.25, -0.35), new Vector3(0.45, 0.65, 0.35)), 0.02);
    expect(s.flipped).toBe(0);
    expect(s.open).toBe(0);
  });
});
