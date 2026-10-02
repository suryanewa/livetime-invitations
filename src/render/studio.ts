import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  ShaderChunk,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { keepPixels } from './textures.ts';

/**
 * Studio kit (shared by the rigs in src/render/rigs/): the v1.1 foliage gobo, the limewash
 * plaster, the seamless cove sweep and the noise-free PCF filter. Everything is procedural and
 * seeded (no HDRI, no downloads), so every render and poster matches.
 */

/** Default backdrop wall (objects reach z ≈ −1.2). */
export const DEFAULT_WALL_Z = -3.2;

/**
 * Sun-through-palms cookie. Two depths of foliage: a far layer, heavily blurred and faint, and
 * a near layer of tapered, drooping palm leaflets with a crisper edge (a real shadow sharpens
 * as the leaf nears the surface). Fronds enter from the edges so the objects sit in open sun.
 */
export function foliageCookie(size = 768): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  // Deterministic pseudo-random fronds so every render (and poster) matches.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const leaflet = (len: number, width: number) => {
    // Lanceolate: widest a third of the way out, tapering to a fine tip.
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.3, -width, len, 0);
    ctx.quadraticCurveTo(len * 0.3, width * 0.8, 0, 0);
    ctx.fill();
  };
  const frond = (cx: number, cy: number, len: number, angle: number, droop: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const n = 24;
    // Midrib arcs (droop) so the frond reads as a living leaf, not a comb.
    const rib = (t: number) => [t * len, droop * len * t * t] as const;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const [x, y] = rib(t);
      const [x2, y2] = rib(Math.min(1, t + 0.01));
      const heading = Math.atan2(y2 - y, x2 - x);
      const leafLen = len * (0.46 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.06);
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(heading + side * (0.62 + 0.3 * t + 0.12 * (rand() - 0.5)));
        leaflet(leafLen, len * 0.028);
        ctx.restore();
      }
    }
    ctx.lineWidth = len * 0.012;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 1; i <= 20; i++) ctx.lineTo(...rib(i / 20));
    ctx.stroke();
    ctx.restore();
  };
  // Far layer: large, faint, very soft.
  ctx.filter = `blur(${Math.round(size / 70)}px)`;
  ctx.fillStyle = ctx.strokeStyle = 'rgba(52, 40, 30, 0.42)';
  frond(size * 1.1, size * 0.35, size * 0.75, 2.9, 0.18);
  frond(size * -0.1, size * 0.62, size * 0.7, -0.35, -0.12);
  frond(size * 0.62, size * 1.1, size * 0.6, -1.9, 0.15);
  // Near layer: crisper leaflets.
  ctx.filter = `blur(${Math.max(1, Math.round(size / 300))}px)`;
  ctx.fillStyle = ctx.strokeStyle = 'rgba(40, 30, 22, 0.86)';
  frond(size * 0.02, size * 0.12, size * 0.6, 0.35, 0.16);
  frond(size * 0.98, size * 0.08, size * 0.58, 2.6, -0.14);
  // (A fourth near frond from the lower right was removed at checkpoint 4: its tip landed on
  // the front floor as a grey streak under the objects.)
  frond(size * 0.02, size * 1.02, size * 0.44, -0.8, -0.1);
  ctx.filter = 'none';
  const tex = new CanvasTexture(keepPixels(canvas));
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

/**
 * Limewash plaster for the sweep (tileable, procedural): periodic multi-octave value noise for
 * the trowelled relief, sparse pits, and a matching albedo mottle. Returns a normal map and a
 * near-white colour map (multiplied by the sweep colour).
 */
export function plasterTextures(size = 512): { normal: Texture; albedo: Texture } {
  let seed = 11;
  const rand = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  const h = new Float32Array(size * size);
  const low = new Float32Array(size * size);
  const octave = (cells: number, amp: number, into: Float32Array) => {
    const g = new Float32Array(cells * cells).map(() => rand());
    const at = (x: number, y: number) => g[((y + cells) % cells) * cells + ((x + cells) % cells)]!;
    const step = size / cells;
    for (let y = 0; y < size; y++) {
      const gy = y / step, y0 = Math.floor(gy), fy = gy - y0, sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < size; x++) {
        const gx = x / step, x0 = Math.floor(gx), fx = gx - x0, sx = fx * fx * (3 - 2 * fx);
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        into[y * size + x]! += (a + (b - a) * sy) * amp;
      }
    }
  };
  octave(4, 1.0, low);
  octave(8, 0.55, low);
  h.set(low);
  octave(32, 0.22, h);
  octave(64, 0.12, h);
  octave(128, 0.07, h);
  // Pits: small soft dents, as in hand-applied plaster.
  const pits = new Float32Array(size * size);
  for (let k = 0; k < 520; k++) {
    const cx = rand() * size, cy = rand() * size, r = 0.8 + rand() * rand() * 3.2, d = 0.25 + rand() * 0.35;
    const R = Math.ceil(r * 2);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const q = (dx * dx + dy * dy) / (r * r);
        if (q > 4) continue;
        const i = (((Math.floor(cy) + dy + size) % size) * size + ((Math.floor(cx) + dx + size) % size));
        pits[i] = Math.max(pits[i]!, d * Math.exp(-q * 1.6));
      }
    }
  }
  for (let i = 0; i < h.length; i++) h[i] = h[i]! - pits[i]! * 0.5;

  const canvasOf = () => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  };
  const nc = canvasOf(), ac = canvasOf();
  const nctx = nc.getContext('2d')!, actx = ac.getContext('2d')!;
  const nimg = nctx.createImageData(size, size), aimg = actx.createImageData(size, size);
  const H = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)]!;
  let lo = Infinity, hi = -Infinity;
  for (const v of low) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * 3.2;
      const dy = (H(x, y + 1) - H(x, y - 1)) * 3.2;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      nimg.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 3] = 255;
      // Limewash mottle: broad clouding plus darker pit floors.
      const m = (low[y * size + x]! - lo) / (hi - lo);
      const v = 255 * (1 - 0.07 * m - 0.1 * pits[y * size + x]!);
      aimg.data[i] = v;
      aimg.data[i + 1] = v * 0.995;
      aimg.data[i + 2] = v * 0.985;
      aimg.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);
  actx.putImageData(aimg, 0, 0);
  const normal = new CanvasTexture(keepPixels(nc));
  normal.colorSpace = NoColorSpace;
  const albedo = new CanvasTexture(keepPixels(ac));
  albedo.colorSpace = SRGBColorSpace;
  for (const t of [normal, albedo]) {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(2.2, 2.2);
    t.anisotropy = 4;
  }
  return { normal, albedo };
}

/**
 * Seamless cove sweep: floor that curves up into a back wall, so objects sit in a real
 * space and their shadows (and the gobo) land on something. Scenes whose motion reaches far
 * back (the Birthday bin) push the wall back so the cove never meets an object.
 */
/** Radius of the backdrop cove: the floor starts curving up at z = wallZ + COVE_RADIUS. */
export const COVE_RADIUS = 1.6;

/**
 * Sweep extents. v1.4 (fullscreen layout): 64 wide, 40 deep, 32 tall (was 16 × 7 × 8, sized for
 * the square stage): a wide or tall viewport, and the 7× backdrop still, look well past the square
 * frame and must still see cove, never its edges. The cove itself (radius, wall) is unchanged.
 */
export const SWEEP_EXTENT = { width: 64, depth: 40, height: 32 } as const;

export function sweepGeometry(wallZ: number = DEFAULT_WALL_Z): BufferGeometry {
  const { width, depth, height } = SWEEP_EXTENT;
  const radius = COVE_RADIUS, segs = 24;
  // Profile in (z, y): front edge → floor → cove arc → wall top.
  const profile: [number, number][] = [];
  profile.push([depth, 0], [wallZ + radius, 0]);
  for (let i = 1; i < segs; i++) {
    const a = (i / segs) * (Math.PI / 2);
    profile.push([wallZ + radius - Math.sin(a) * radius, radius - Math.cos(a) * radius]);
  }
  profile.push([wallZ, radius], [wallZ, height]);
  const cols = 2;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let run = 0;
  for (let r = 0; r < profile.length; r++) {
    if (r > 0) run += Math.hypot(profile[r]![0] - profile[r - 1]![0], profile[r]![1] - profile[r - 1]![1]);
    for (let c = 0; c < cols; c++) {
      const x = (c / (cols - 1) - 0.5) * width;
      pos.push(x, profile[r]![1], profile[r]![0]);
      uv.push(x / 4, run / 4);
    }
  }
  for (let r = 0; r < profile.length - 1; r++) {
    const a = r * cols, b = a + cols;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * three's PCF rotates 5 taps per pixel with interleaved gradient noise, which dithers wide
 * penumbrae. Swap it (spot/directional path only) for 16 fixed Vogel taps, each a hardware
 * bilinear compare: smooth, noise-free soft shadows, and unlike VSM no extra draw calls.
 */
let pcfPatched = false;
export function smoothPcf(): void {
  if (pcfPatched) return;
  pcfPatched = true;
  const noisy = /float phi = interleavedGradientNoise\( gl_FragCoord\.xy \) \* PI2;\s*shadow = \([\s\S]*?\) \* 0\.2;/;
  const chunk = ShaderChunk.shadowmap_pars_fragment;
  if (!noisy.test(chunk)) {
    if (import.meta.env?.DEV) console.warn('studio: PCF chunk changed; keeping three default filtering');
    return;
  }
  ShaderChunk.shadowmap_pars_fragment = chunk.replace(
    noisy,
    `shadow = 0.0;
				for ( int i = 0; i < 16; i ++ ) {
					shadow += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( i, 16, 0.0 ) * radius, shadowCoord.z ) );
				}
				shadow *= 0.0625;`,
  );
}

/** A small copy of a gobo cookie for the Low tier (same pattern, softer edges). */
export function downsampledCookie(full: Texture, size: number): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full.image as CanvasImageSource, 0, 0, size, size);
  const tex = new CanvasTexture(keepPixels(canvas));
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

export interface SweepOptions {
  color: string;
  roughness: number;
  /** Limewash plaster relief and mottle (v1.1); false = a clean painted cove. */
  plaster?: boolean;
  /** Plaster relief strength. */
  normalScale?: number;
  wallZ?: number;
}

export interface SweepBackdrop {
  mesh: Mesh;
  /**
   * Rebuilds the geometry only when the wall moves or the set's scale changes. `wallZ` is in the
   * scene's units; the whole sweep (floor, cove, wall) is scaled by `scale` about the origin, the
   * scene's world scale (v1.4), so the cove sits where it sat in v1.3 relative to the scene.
   */
  setWall(wallZ?: number, scale?: number): void;
  /** Low tier: drop the plaster relief (GPU copy freed; the canvas stays, so it returns). */
  setLowDetail(enabled: boolean): void;
  dispose(): void;
}

/**
 * Seamless cove sweep backdrop: floor that curves up into a back wall, receiving the key's
 * shadow. Scenes whose motion reaches far back (the Birthday bin) push the wall back through
 * `setWall` so the cove never meets an object.
 */
export function createSweepBackdrop(renderer: WebGLRenderer, options: SweepOptions): SweepBackdrop {
  let wall = options.wallZ ?? DEFAULT_WALL_Z;
  const plaster = options.plaster === false ? null : plasterTextures();
  const material = new MeshStandardMaterial({
    name: 'mat_sweep',
    color: new Color(options.color),
    roughness: options.roughness,
    metalness: 0,
    map: plaster?.albedo ?? null,
    normalMap: plaster?.normal ?? null,
  });
  const scale = options.normalScale ?? 0.55;
  material.normalScale.set(scale, scale);
  let setScale = 1;
  const mesh = new Mesh(sweepGeometry(wall), material);
  mesh.name = 'studio_sweep';
  mesh.receiveShadow = true;
  let lowDetail = false;
  return {
    mesh,
    setWall(wallZ = DEFAULT_WALL_Z, scale = 1) {
      if (wallZ === wall && scale === setScale) return;
      wall = wallZ;
      setScale = scale;
      mesh.geometry.dispose();
      mesh.geometry = sweepGeometry(wallZ);
      if (scale !== 1) mesh.geometry.scale(scale, scale, scale);
      renderer.shadowMap.needsUpdate = true;
    },
    setLowDetail(enabled) {
      if (!plaster || enabled === lowDetail) return;
      lowDetail = enabled;
      material.normalMap = enabled ? null : plaster.normal;
      material.needsUpdate = true;
      if (enabled) plaster.normal.dispose();
    },
    dispose() {
      mesh.geometry.dispose();
      plaster?.normal.dispose();
      plaster?.albedo.dispose();
      material.dispose();
    },
  };
}
