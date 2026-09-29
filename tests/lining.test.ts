import { afterAll, describe, expect, it, vi } from 'vitest';
import type { Texture } from 'three';
import { DIRECTIONS } from '../src/render/materials.ts';
import { disposeTextureCache, weaveLiningNormal, weaveNormal } from '../src/render/textures.ts';

// Node has no canvas: each stub canvas keeps the pixels it was last drawn with.
interface StubCanvas { width: number; height: number; data?: Uint8ClampedArray }
vi.stubGlobal('document', {
  createElement: () => {
    const canvas: StubCanvas & { getContext(): unknown } = {
      width: 0,
      height: 0,
      getContext: () => ({
        createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: (img: { data: Uint8ClampedArray }) => { canvas.data = img.data; },
      }),
    };
    return canvas;
  },
});
afterAll(() => {
  disposeTextureCache();
  vi.unstubAllGlobals();
});

const levels = (t: Texture) => t.mipmaps as unknown as StubCanvas[];
/** Largest channel difference between each texel and its neighbour along the rib (x + 1, y − 1). */
function alongRib(c: StubCanvas): number {
  const s = c.width, d = c.data!;
  let worst = 0;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4, j = (((y - 1 + s) % s) * s + ((x + 1) % s)) * 4;
      for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(d[i + k]! - d[j + k]!));
    }
  }
  return worst;
}
const range = (c: StubCanvas) => {
  const red = c.data!.filter((_, i) => i % 4 === 0);
  return Math.max(...red) - Math.min(...red);
};

describe('Party lid lining weave (checkpoint 4: no moiré as the lid closes)', () => {
  it('only the lid lining takes the band-limited weave; the lanyard strap keeps its own', () => {
    expect(DIRECTIONS.L2.surfaces.mat_lid_fabric!.normal).toBe('weave-lining');
    expect(DIRECTIONS.L2.surfaces.mat_fabric!.normal).toBe('weave');
    const strap = weaveNormal();
    expect(weaveLiningNormal()).not.toBe(strap);
    expect(strap.mipmaps).toHaveLength(0);
    expect(strap.generateMipmaps).toBe(true);
    expect(strap.anisotropy).toBe(4);
  });

  it('keeps the approved weave at full size: level 0 is the strap weave, texel for texel', () => {
    const lining = weaveLiningNormal();
    expect(lining.image).toBe(levels(lining)[0]);
    expect((lining.image as StubCanvas).data).toEqual((weaveNormal().image as StubCanvas).data);
  });

  it('ships its own complete mip chain and samples it isotropically', () => {
    const lining = weaveLiningNormal();
    expect(levels(lining).map((c) => c.width)).toEqual([128, 64, 32, 16, 8, 4, 2, 1]);
    expect(lining.generateMipmaps).toBe(false);
    expect(lining.anisotropy).toBe(1);
  });

  it('keeps the thread while it resolves, leaves it out before it folds into a hatch, then lets the ribs go', () => {
    const [, l1, l2, ...rest] = levels(weaveLiningNormal());
    // Level 1 (desktop size): ribs and the diagonal thread.
    expect(alongRib(l1!)).toBeGreaterThan(3);
    // Level 2: ribs only (constant along each rib), softened but present.
    expect(alongRib(l2!)).toBeLessThanOrEqual(1);
    expect(range(l2!)).toBeGreaterThan(8);
    // Coarser levels: plain cloth (a flat normal), nothing left to alias.
    for (const c of rest) {
      for (let i = 0; i < c.data!.length; i += 4) expect([...c.data!.slice(i, i + 4)]).toEqual([128, 128, 255, 255]);
    }
  });
});
