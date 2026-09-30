import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  type Wrapping,
} from 'three';

/**
 * Procedural textures are drawn once into 2D canvases and uploaded to every new WebGL context
 * (a restored context, leaving Static, a remount). Chrome may back a 2D canvas on the GPU and
 * drop its pixels under memory pressure or a GPU reset; a re-upload then yields a black texture
 * (a black gobo blocks the key light entirely). Drawing stays on the fast default canvas; the
 * finished pixels are copied once into a CPU-backed canvas (`willReadFrequently`), which keeps
 * them, and the texture uploads from that copy.
 */
export function keepPixels(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  const ctx = copy.getContext('2d', { willReadFrequently: true });
  // Without a real 2D context (unit-test stubs) the original canvas is used as is.
  if (!ctx || typeof ctx.drawImage !== 'function') return canvas;
  ctx.drawImage(canvas, 0, 0);
  return copy;
}

/**
 * Procedural signature textures. Original, code-generated, no external source to license.
 * UV convention: signature surfaces map 1 UV unit to one tile, sized in scene units by the
 * model builders so density is identical across the family.
 */

type HeightFn = (u: number, v: number) => number;

function heightToNormal(size: number, height: HeightFn, strength: number): HTMLCanvasElement {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) h[y * size + x] = height((x + 0.5) / size, (y + 0.5) / size);
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5 * strength;
      // Canvas y runs opposite to UV v (flipY), so +dy maps to +normal.y.
      let nx = -dx, ny = dy, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      img.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function dataTexture(canvas: HTMLCanvasElement, color: boolean, wrapV: Wrapping = RepeatWrapping): Texture {
  const t = new CanvasTexture(keepPixels(canvas));
  t.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = wrapV;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

const cache = new Map<string, Texture>();
const keyOf = new Map<Texture, string>();
/** Holders (material libraries) per cached texture; the last release frees it. */
const holds = new Map<Texture, number>();
function cached(key: string, make: () => Texture): Texture {
  let t = cache.get(key);
  if (!t) {
    cache.set(key, (t = make()));
    keyOf.set(t, key);
  }
  return t;
}

/** Take a hold on a cached map. False when the texture is not one this module caches. */
export function retainCachedTexture(t: Texture): boolean {
  if (!keyOf.has(t)) return false;
  holds.set(t, (holds.get(t) ?? 0) + 1);
  return true;
}

/** Drop a hold; the last one evicts the map and frees it, so the next use regenerates it. */
export function releaseCachedTexture(t: Texture): void {
  const n = holds.get(t);
  if (n === undefined) return;
  if (n > 1) {
    holds.set(t, n - 1);
    return;
  }
  holds.delete(t);
  const key = keyOf.get(t);
  keyOf.delete(t);
  if (key !== undefined && cache.get(key) === t) cache.delete(key);
  t.dispose();
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Direction A signature: fine staggered stipple, slightly raised domes. 8×8 per tile. */
export function stippleNormal(): Texture {
  return cached('stipple', () => {
    const n = 8;
    const r = 0.3;
    const height: HeightFn = (u, v) => {
      const row = Math.floor(v * n);
      const off = row % 2 ? 0.5 : 0;
      const cu = ((u * n + off) % 1) - 0.5;
      const cv = ((v * n) % 1) - 0.5;
      const d = Math.hypot(cu, cv) / r;
      return d < 1 ? Math.sqrt(1 - d * d) : 0;
    };
    return dataTexture(heightToNormal(192, height, 5), false);
  });
}

/** Direction B signature: one inset perforation per square tile, used along bands. */
export function perforationMaps(): { map: Texture; normalMap: Texture } {
  const r = 0.26;
  const depth: HeightFn = (u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5);
    return -smooth(r + 0.05, r - 0.02, d);
  };
  const map = cached('perf-color', () => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * r);
    g.addColorStop(0, '#2c2622');
    g.addColorStop(0.72, '#3a332d');
    g.addColorStop(1, '#8d8378');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * r, 0, Math.PI * 2);
    ctx.fill();
    return dataTexture(canvas, true, ClampToEdgeWrapping);
  });
  const normalMap = cached('perf-normal', () =>
    dataTexture(heightToNormal(128, depth, 7), false, ClampToEdgeWrapping),
  );
  return { map, normalMap };
}

/** Perforations through a dark body: ink band, holes showing the light stage behind. */
export function perforationDarkMap(): Texture {
  return cached('perf-dark', () => {
    const size = 128;
    const r = 0.26;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#25282B';
    ctx.fillRect(0, 0, size, size);
    const g = ctx.createRadialGradient(size / 2, size / 2 - 3, 0, size / 2, size / 2, size * r);
    g.addColorStop(0, '#EDE7DB');
    g.addColorStop(0.7, '#D9D2C4');
    g.addColorStop(1, '#8B857B');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * r, 0, Math.PI * 2);
    ctx.fill();
    return dataTexture(canvas, true, ClampToEdgeWrapping);
  });
}

/** Weave: diagonal twill ridges (6 per tile) crossed by a fine thread (24 per tile along v). */
const WEAVE_N = 6;
const WEAVE_SIZE = 128;
const WEAVE_STRENGTH = 2.2;
const weaveRidge: HeightFn = (u, v) => Math.sin((u * WEAVE_N + v * WEAVE_N) * Math.PI * 2) * 0.5 + 0.5;
const weaveThread: HeightFn = (u, v) => Math.sin(v * WEAVE_N * 4 * Math.PI * 2) * 0.5 + 0.5;
const weaveHeight: HeightFn = (u, v) => weaveRidge(u, v) * 0.8 + weaveThread(u, v) * 0.25;

/** Woven strap: a tight twill so the lanyard reads as fabric at phone scale. */
export function weaveNormal(): Texture {
  return cached('weave', () => dataTexture(heightToNormal(WEAVE_SIZE, weaveHeight, WEAVE_STRENGTH), false));
}

/** One periodic height term of a band-limited normal map. */
interface WeaveTerm {
  height: HeightFn;
  weight: number;
  /** Period along the term's gradient, in base texels. */
  period: number;
  /** Full strength while the period spans at least fade[1] texels of a level, gone at fade[0]. */
  fade: [number, number];
}

/**
 * A full mip chain (levels 1 to n) for a sum of periodic height terms. Each level is the
 * base-resolution normal field box-filtered down, as the GPU would build it, except that each
 * term is first faded by how many of that level's texels its period spans: a term too fine
 * for a level is left out of it instead of folding into a coarser alias.
 */
function bandLimitedNormalMips(size: number, terms: WeaveTerm[], strength: number): HTMLCanvasElement[] {
  // Per-term slopes at base resolution (central differences, as heightToNormal).
  const slopes = terms.map(({ height, weight }) => {
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) h[y * size + x] = height((x + 0.5) / size, (y + 0.5) / size) * weight;
    }
    const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)]!;
    const dx = new Float32Array(size * size), dy = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        dx[y * size + x] = (at(x + 1, y) - at(x - 1, y)) * 0.5 * strength;
        dy[y * size + x] = (at(x, y + 1) - at(x, y - 1)) * 0.5 * strength;
      }
    }
    return { dx, dy };
  });
  const levels: HTMLCanvasElement[] = [];
  for (let block = 2; block <= size; block *= 2) {
    const gains = terms.map((t) => smooth(t.fade[0], t.fade[1], t.period / block));
    const s = size / block;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = s;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(s, s);
    for (let by = 0; by < s; by++) {
      for (let bx = 0; bx < s; bx++) {
        let sx = 0, sy = 0, sz = 0;
        for (let y = by * block; y < (by + 1) * block; y++) {
          for (let x = bx * block; x < (bx + 1) * block; x++) {
            let dx = 0, dy = 0;
            for (let t = 0; t < terms.length; t++) {
              dx += slopes[t]!.dx[y * size + x]! * gains[t]!;
              dy += slopes[t]!.dy[y * size + x]! * gains[t]!;
            }
            // Canvas y runs opposite to UV v (flipY), so +dy maps to +normal.y.
            const len = Math.hypot(dx, dy, 1);
            sx += -dx / len;
            sy += dy / len;
            sz += 1 / len;
          }
        }
        const n = block * block;
        const i = (by * s + bx) * 4;
        img.data[i] = Math.round((sx / n * 0.5 + 0.5) * 255);
        img.data[i + 1] = Math.round((sy / n * 0.5 + 0.5) * 255);
        img.data[i + 2] = Math.round((sz / n * 0.5 + 0.5) * 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    levels.push(canvas);
  }
  return levels;
}

/**
 * Dust-cover lining (checkpoint 4): the strap's weave with a band-limited mip chain, so the
 * lining never shimmers as the lid closes. The GPU's box-filtered mips folded the 24-per-tile
 * thread into a coarse diagonal alias and kept the ribs down to two-pixel stripes, and the
 * anisotropic probes beat against them: the minified lining crawled into a hatch that flipped
 * orientation mid-close. Here level 0 is the strap's weave exactly and level 1 keeps the thread
 * (the woven look at desktop size); the ribs fade from five texels per period to gone at two
 * and a half, so a shrinking or foreshortened lining settles to soft ribs, then plain cloth.
 */
export function weaveLiningNormal(): Texture {
  return cached('weave-lining', () => {
    const base = heightToNormal(WEAVE_SIZE, weaveHeight, WEAVE_STRENGTH);
    const t = dataTexture(base, false);
    const terms: WeaveTerm[] = [
      // Ridges vary along u + v: measured across them, one period is 1 / (6√2) of a tile.
      { height: weaveRidge, weight: 0.8, period: WEAVE_SIZE / (WEAVE_N * Math.SQRT2), fade: [2.5, 5] },
      { height: weaveThread, weight: 0.25, period: WEAVE_SIZE / (WEAVE_N * 4), fade: [2, 3] },
    ];
    t.mipmaps = [base, ...bandLimitedNormalMips(WEAVE_SIZE, terms, WEAVE_STRENGTH)];
    t.generateMipmaps = false;
    // Isotropic: anisotropic probes along the foreshortened axis sample the ribs near their own
    // spacing and beat into a hatch; trilinear lets the closing lid settle evenly.
    t.anisotropy = 1;
    return t;
  });
}

/** Concentric rings for the scanner pad and record grooves (kept coarse to avoid shimmer). */
export function ringNormal(rings: number): Texture {
  return cached(`rings-${rings}`, () => {
    const height: HeightFn = (u, v) => {
      const d = Math.hypot(u - 0.5, v - 0.5) * 2;
      return d > 1 ? 0 : Math.sin(d * rings * Math.PI) * 0.5;
    };
    const t = dataTexture(heightToNormal(256, height, 3), false, ClampToEdgeWrapping);
    t.wrapS = ClampToEdgeWrapping;
    return t;
  });
}

/**
 * Free GPU copies of cached textures without discarding them: a disposed renderer's
 * listeners are dropped and any live renderer re-uploads lazily on next use.
 */
export function releaseCachedTextureGpu(): void {
  for (const t of cache.values()) t.dispose();
}

export function disposeTextureCache(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
  keyOf.clear();
  holds.clear();
}
