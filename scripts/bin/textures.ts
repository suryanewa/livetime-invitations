/**
 * Procedural texture generators for the shared bin (v1.5). Deterministic: integer-hash lattice
 * noise, fixed seeds, no Math.random, so `pnpm models bin` writes the same pixels every time.
 *
 * Conventions (the scan-to-cad-rebuilds generators, verified there with a dome test on three.js):
 * - Images are row-major, row 0 at the top; glTF UV (u, v) = ((col + 0.5) / W, (row + 0.5) / H).
 * - Tiled maps are periodic in both axes (they repeat across the UV0 tile grid without seams).
 * - Normal maps come from a height field h (cm) with physical texel sizes:
 *   n = normalize(−∂h/∂x, +∂h/∂row, 1) (x along columns, row downwards), encoded n·0.5 + 0.5.
 *   The surfaces carry no tangents, so GLTFLoader uses derivative tangent frames and flips the
 *   normal scale's y, which this convention expects: bumps render raised and lit from the key side.
 * - ORM: R occlusion, G roughness, B metalness (glTF packs occlusion and metallicRoughness so).
 */

/** 32-bit integer hash of a lattice point → [0, 1). */
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Periodic 2D gradient noise in about [−1, 1]; (x, y) in lattice cells, periods px × py cells. */
export function pnoise(x: number, y: number, px: number, py: number, seed: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const g = (ix: number, iy: number, dx: number, dy: number) => {
    const a = hash(mod(ix, px), mod(iy, py), seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const n00 = g(x0, y0, fx, fy), n10 = g(x0 + 1, y0, fx - 1, fy);
  const n01 = g(x0, y0 + 1, fx, fy - 1), n11 = g(x0 + 1, y0 + 1, fx - 1, fy - 1);
  const u = fade(fx), v = fade(fy);
  return 1.41 * (n00 + (n10 - n00) * u + (n01 - n00) * v + (n00 - n10 - n01 + n11) * u * v);
}

/** Periodic fBm over (u, v) ∈ [0, 1)²: `cx` × `cy` cells at the first octave. */
export function fbm(u: number, v: number, cx: number, cy: number, octaves: number, gain: number, seed: number): number {
  let sum = 0, amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const kx = cx << o, ky = cy << o;
    sum += amp * pnoise(u * kx, v * ky, kx, ky, seed + o * 101);
    norm += amp;
    amp *= gain;
  }
  return sum / norm;
}

export interface Image { width: number; height: number; data: Uint8Array /* RGBA */ }

export function image(width: number, height: number): Image {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/** Field over the texel centres (u, v), row 0 at the top. */
export function field(width: number, height: number, f: (u: number, v: number, col: number, row: number) => number): Float32Array {
  const out = new Float32Array(width * height);
  for (let row = 0; row < height; row++) {
    const v = (row + 0.5) / height;
    for (let col = 0; col < width; col++) out[row * width + col] = f((col + 0.5) / width, v, col, row);
  }
  return out;
}

/**
 * Normal map from a periodic height field, scaled so the RMS surface slope is `rmsSlopeDeg`
 * (the measurable property of a finish: orange peel ≈ 1°, EDM grain ≈ 4–6°), or by an explicit
 * `scale` (cm of height per unit of `h`) for geometric reliefs such as ribs.
 */
export function heightToNormal(h: Float32Array, width: number, height: number, tileX: number, tileY: number, opts: { rmsSlopeDeg?: number; scale?: number }): Image {
  const sx = tileX / width, sy = tileY / height;
  const gx = new Float32Array(width * height), gy = new Float32Array(width * height);
  let sum = 0;
  for (let row = 0; row < height; row++) {
    const up = mod(row - 1, height), dn = mod(row + 1, height);
    for (let col = 0; col < width; col++) {
      const l = mod(col - 1, width), r = mod(col + 1, width);
      const k = row * width + col;
      gx[k] = (h[row * width + r]! - h[row * width + l]!) / (2 * sx);
      gy[k] = (h[dn * width + col]! - h[up * width + col]!) / (2 * sy);
      sum += gx[k]! * gx[k]! + gy[k]! * gy[k]!;
    }
  }
  const rms = Math.sqrt(sum / (width * height)) || 1;
  const k = opts.scale ?? Math.tan(((opts.rmsSlopeDeg ?? 1) * Math.PI) / 180) / rms;
  const img = image(width, height);
  for (let i = 0; i < width * height; i++) {
    const nx = -gx[i]! * k, ny = gy[i]! * k;
    const l = Math.hypot(nx, ny, 1);
    img.data.set([Math.round((nx / l) * 127.5 + 127.5), Math.round((ny / l) * 127.5 + 127.5), Math.round((1 / l) * 127.5 + 127.5), 255], i * 4);
  }
  return img;
}

/** ORM image from three fields (occlusion, roughness, metalness), each 0–1 (null = constant). */
export function orm(width: number, height: number, ao: Float32Array | number, rough: Float32Array | number, metal: number): Image {
  const img = image(width, height);
  const q = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)));
  for (let i = 0; i < width * height; i++) {
    const a = typeof ao === 'number' ? ao : ao[i]!;
    const r = typeof rough === 'number' ? rough : rough[i]!;
    img.data.set([q(a), q(r), q(metal), 255], i * 4);
  }
  return img;
}

/** Periodic sparse bumps (dust inclusions, grit): `count` Gaussian domes of radius `r` (in UV). */
function specks(width: number, height: number, count: number, r: number, seed: number): Float32Array {
  const out = new Float32Array(width * height);
  const rw = Math.ceil(r * 3 * width), rh = Math.ceil(r * 3 * height);
  for (let i = 0; i < count; i++) {
    const cu = hash(i, 1, seed), cv = hash(i, 2, seed), a = 0.5 + hash(i, 3, seed);
    const c0 = Math.floor(cu * width), r0 = Math.floor(cv * height);
    for (let dr = -rh; dr <= rh; dr++) {
      for (let dc = -rw; dc <= rw; dc++) {
        const du = (c0 + dc + 0.5) / width - cu, dv = (r0 + dr + 0.5) / height - cv;
        const d2 = (du * du + dv * dv) / (r * r);
        if (d2 > 9) continue;
        out[mod(r0 + dr, height) * width + mod(c0 + dc, width)]! += a * Math.exp(-d2);
      }
    }
  }
  return out;
}

// ── Finishes ─────────────────────────────────────────────────────────────────────────────────

/**
 * Powder coat (graphite, satin): orange peel — smooth isotropic undulation with a 2–3 mm
 * wavelength and about 0.5° RMS slope (what makes a powder-coated panel's reflections ripple
 * softly; at 1° it read as hammertone) — plus a sparse dust inclusion every few square
 * centimetres. One tile is `tile` cm.
 */
export function powderNormal(size: number, tile: number): Image {
  const cells = Math.round(tile / 0.22); // ≈ 2.2 mm peel cells, and a finer octave under them
  const peel = field(size, size, (u, v) => fbm(u, v, cells, cells, 3, 0.4, 11) + 0.18 * fbm(u, v, cells * 4, cells * 4, 2, 0.5, 13));
  const grit = specks(size, size, Math.round(tile * tile * 0.25), 0.02 / tile, 17);
  for (let i = 0; i < peel.length; i++) peel[i] = peel[i]! + 0.3 * grit[i]!;
  return heightToNormal(peel, size, size, tile, tile, { rmsSlopeDeg: 0.55 });
}

/**
 * Moulded PP with an EDM (spark-eroded) mould finish, VDI 3400 ≈ Ref 27: a fine, even matte grain
 * of 0.1–0.4 mm pits, RMS slope about 5°. `soft` lowers it for the glossier inner bucket.
 */
export function edmNormal(size: number, tile: number, soft = 1): Image {
  const cells = Math.round(tile / 0.045);
  const grain = field(size, size, (u, v) => fbm(u, v, cells, cells, 2, 0.55, 23) + 0.25 * fbm(u, v, Math.round(cells / 8), Math.round(cells / 8), 2, 0.5, 29));
  return heightToNormal(grain, size, size, tile, tile, { rmsSlopeDeg: 5 * soft });
}

/** Rubber: a soft matte grain (0.3 mm), RMS slope 4°. */
export function rubberNormal(size: number, tile: number): Image {
  const cells = Math.round(tile / 0.06);
  const grain = field(size, size, (u, v) => fbm(u, v, cells, cells, 3, 0.5, 31));
  return heightToNormal(grain, size, size, tile, tile, { rmsSlopeDeg: 4 });
}

/**
 * Brushed stainless (lid, pedal): the grain runs along u (the sheet's brushing direction) —
 * long, fine grooves 0.02–0.1 mm apart with a slowly varying density, plus a few longer, deeper
 * scratches from the belt. RMS slope about 2.5° across the grain, almost none along it.
 */
export function brushedNormal(size: number, tile: number): Image {
  const across = Math.round(tile / 0.012); // ≈ 0.12 mm grain cells across
  const h = field(size, size, (u, v) => {
    const fine = fbm(u, v, 3, across, 2, 0.6, 41);
    const coarse = 0.5 * fbm(u, v, 2, Math.round(across / 6), 2, 0.5, 43);
    return fine + coarse;
  });
  // Belt scratches: thin straight grooves along u at random v, a few degrees off the grain.
  for (let i = 0; i < 90; i++) {
    const v0 = hash(i, 5, 47), slope = (hash(i, 6, 47) - 0.5) * 0.04, depth = 0.6 + hash(i, 7, 47), len = 0.2 + 0.6 * hash(i, 8, 47), u0 = hash(i, 9, 47);
    for (let col = 0; col < size * len; col++) {
      const u = u0 + col / size;
      const v = v0 + slope * (u - u0);
      const row = mod(Math.round(v * size), size);
      const fadeIn = Math.min(1, col / (size * 0.05), (size * len - col) / (size * 0.05));
      h[row * size + mod(Math.round(u * size), size)]! -= depth * fadeIn;
    }
  }
  return heightToNormal(h, size, size, tile, tile, { rmsSlopeDeg: 2.5 });
}

/**
 * Brushed stainless roughness (ORM on UV0, metal 1): 0.27 with streaks along the grain at three
 * widths (0.4 mm, 1 mm, 2.5 mm), each a few centimetres long: the belt's uneven passes, which is
 * what makes a brushed sheet read as brushed from a metre away.
 */
export function brushedOrm(size: number): Image {
  const r = field(size, size, (u, v) => 0.27 + 0.03 * fbm(u, v, 2, 160, 2, 0.5, 53) + 0.045 * fbm(u, v, 2, 60, 2, 0.5, 57) + 0.025 * fbm(u, v, 4, 24, 2, 0.5, 59));
  return orm(size, size, 1, r, 1);
}

/**
 * Elastomer pedal tread: ribs across the pedal (0.4 cm pitch, rounded crowns 0.5 mm high) and a
 * fine moulded grain. One tile is `tile` cm; v runs out along the pedal.
 */
export function treadNormal(size: number, tile: number): Image {
  const ribs = Math.round(tile / 0.4);
  const h = field(size, size, (u, v) => {
    const p = (v * ribs) % 1;
    // Flat-topped ribs with 0.6 mm rounded shoulders, grooves 1.2 mm wide.
    const d = Math.abs(p - 0.5) * 2; // 0 at the groove centre, 1 at the crown centre
    const crown = d < 0.3 ? 0 : d > 0.55 ? 1 : 0.5 - 0.5 * Math.cos(((d - 0.3) / 0.25) * Math.PI);
    return 0.05 * crown + 0.002 * fbm(u, v, 24, 24, 2, 0.5, 61);
  });
  return heightToNormal(h, size, size, tile, tile, { scale: 1 });
}

/** Macro roughness variation (periodic in u): soft mottling and finer speckle, mean 0. */
export function roughnessMottle(width: number, height: number, cu: number, cv: number, seed: number): Float32Array {
  return field(width, height, (u, v) => 0.6 * fbm(u, v, cu, cv, 3, 0.5, seed) + 0.4 * fbm(u, v, cu * 16, cv * 16, 2, 0.5, seed + 7));
}
