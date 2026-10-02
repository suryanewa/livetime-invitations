/**
 * Dark template print (v1.2): a second `card_print` image made from the badge master's own print
 * by a deterministic pixel function. Same layout, inverted field: the white card stock becomes an
 * ink field, black type becomes warm white, the grey signature panel a lifted ink and its grey
 * type a light grey, and the cobalt marks stay cobalt (lifted a little so they hold on ink). The
 * print's anti-aliased edges are unmixed first (each texel = a share of cobalt + a neutral grey),
 * so the edges of every mark stay clean.
 *
 * Pure function of the input pixels (sRGB 8-bit, any channel count of 3 or 4).
 */

export interface PrintImage {
  data: Uint8Array;
  width: number;
  height: number;
  channels: 3 | 4;
}

/** The master's cobalt (sRGB), measured as the print's most saturated colour. */
export const PRINT_COBALT = [10, 53, 150] as const;
/** Dark template colours (sRGB). */
export const DARK_PRINT = {
  /** The card field (was white stock): the family ink. */
  ink: [31, 34, 38],
  /** What black type becomes. */
  type: [242, 238, 230],
  /** Cobalt marks on ink: same hue, lifted so they read against the field. */
  cobalt: [64, 106, 224],
} as const;

const chroma = (r: number, g: number, b: number) => Math.max(r, g, b) - Math.min(r, g, b);
const COBALT_CHROMA = chroma(...PRINT_COBALT);

export function darkPrint<T extends PrintImage>(img: T): T {
  const out = new Uint8Array(img.data.length);
  const ch = img.channels;
  const [cr, cg, cb] = PRINT_COBALT;
  const { ink, type, cobalt } = DARK_PRINT;
  for (let i = 0; i < img.data.length; i += ch) {
    const r = img.data[i]!, g = img.data[i + 1]!, b = img.data[i + 2]!;
    // Share of cobalt in this texel (the rest is a neutral grey from black type to white stock).
    const a = Math.min(1, Math.max(0, b > r ? chroma(r, g, b) / COBALT_CHROMA : 0));
    const rest = 1 - a;
    // Neutral part, unmixed: (pixel − a·cobalt) / (1 − a); its lightness picks the dark colour.
    const n = rest > 1e-3 ? Math.min(255, Math.max(0, ((r - a * cr) + (g - a * cg) + (b - a * cb)) / (3 * rest))) : 255;
    const l = n / 255; // 1 = stock (→ ink), 0 = black type (→ warm white)
    for (let k = 0; k < 3; k++) {
      const neutral = type[k]! + (ink[k]! - type[k]!) * l;
      out[i + k] = Math.round(a * cobalt[k]! + rest * neutral);
    }
    if (ch === 4) out[i + 3] = img.data[i + 3]!;
  }
  return { ...img, data: out };
}

/** Dark template: the card's edge stock (linear factor), the family ink. */
export const DARK_STOCK_FACTOR: [number, number, number, number] = [0.0137, 0.0159, 0.0194, 1];

// ── Reader status light (v1.5) ─────────────────────────────────────────────────────────
/*
 * The reader shows its outcome the way a well-made access reader does: light behind its smoked
 * cover glass. A dead-front pictogram (invisible while off) glows in the status colour; what
 * reaches the eye through the glass is a crisp, slightly soft glyph (the printed mask, seen through
 * the diffuser), a bright core and a soft halo where the diffuser and the smoked glass scatter it.
 * This is the emission field for that light: a pure function of its parameters (no canvas, no
 * randomness), linear radiance with 1 = the stroke's core.
 */

/** A scalar field on a texel grid, row 0 at the top (v = 1). */
export interface EmissionField {
  width: number;
  height: number;
  /** Linear emission per texel, row-major. */
  data: Float32Array;
  /** Largest value (the texture stores data / peak; the material multiplies by peak). */
  peak: number;
}

/**
 * The shell's own status glyphs, exactly (src/ui/guestControls.ts, DESIGN.md "check for Accept, minus
 * for Decline"): the check `M4.5 10.5 l3.5 3.5 7.5 −8` and the minus `M5 10 h10` on the 20-unit grid
 * (y down), stroke 2.2, round caps and joins. The reader draws the product's iconography, not a
 * second set.
 *
 * Optical weight: one stroke weight for both, both centred on the grid by their boxes, as the shell
 * centres them. The minus keeps the shell's 10 units against the check's 11-unit span: one unbroken
 * lit bar reads longer and heavier than the two angled strokes of the check, so the shell's own
 * proportion is the balanced one (v1.5's first cut stretched it to 11 and it outweighed the check).
 */
export const STATUS_ICON = {
  grid: 20,
  stroke: 2.2,
  accept: [[4.5, 10.5], [8, 14], [15.5, 6]] as readonly (readonly [number, number])[],
  decline: [[5, 10], [15, 10]] as readonly (readonly [number, number])[],
} as const;

/** Diffusion of the status light (fractions of the icon's stroke width unless noted). */
export const STATUS_DIFFUSION = {
  /** Edge of the printed mask seen through the glass and diffuser: half-width of the soft edge. */
  edge: 0.07,
  /**
   * Near halo: light scattered in the diffuser right round the stroke (Gaussian σ, weight). Kept
   * light, so the lit stroke reads at its drawn weight (v1.5's first cut, 0.45 at σ 0.5, made it
   * look 1.3–1.5× the NFC mark's strokes: a neon tube, not a lit icon).
   */
  near: { sigma: 0.4, weight: 0.22 },
  /**
   * Far halo: the smoked cover glass's own scatter, a faint wider glow (Gaussian σ, weight). Its
   * scale is the glass's thickness (2–3 mm; the stroke is 1.8 mm), so it has faded long before
   * the window's edge.
   */
  far: { sigma: 1.3, weight: 0.08 },
  /**
   * Hotspot: the LED sits behind the middle of the light guide, so the stroke is brightest there
   * and falls to `floor` at the glyph's ends (Gaussian over `radius` grid units).
   */
  hotspot: { radius: 6.5, floor: 0.72 },
} as const;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Distance from (px, py) to the segment a–b. */
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp01(((px - ax) * dx + (py - ay) * dy) / l2) : 0;
  const x = ax + dx * t - px, y = ay + dy * t - py;
  return Math.sqrt(x * x + y * y);
}

/** Separable Gaussian blur (σ in texels), clamped edges. Deterministic. */
export function gaussianBlur(src: Float32Array, width: number, height: number, sigma: number): Float32Array {
  if (sigma <= 0) return src.slice();
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i]! /= sum;
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const xx = x + i < 0 ? 0 : x + i >= width ? width - 1 : x + i;
        acc += src[row + xx]! * k[i + r]!;
      }
      tmp[row + x] = acc;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const yy = y + i < 0 ? 0 : y + i >= height ? height - 1 : y + i;
        acc += tmp[yy * width + x]! * k[i + r]!;
      }
      out[y * width + x] = acc;
    }
  }
  return out;
}

/** Box-downsample by an integer factor (the halos are computed at a quarter resolution). */
function downsample(src: Float32Array, width: number, height: number, f: number): Float32Array {
  const w = width / f, h = height / f, out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) acc += src[(y * f + j) * width + x * f + i]!;
      out[y * w + x] = acc / (f * f);
    }
  }
  return out;
}

/** Bilinear sample of a low-resolution field at full-resolution texel (x, y) (texel centres aligned). */
function upsample(src: Float32Array, w: number, h: number, f: number, x: number, y: number): number {
  const fx = Math.min(w - 1, Math.max(0, (x + 0.5) / f - 0.5)), fy = Math.min(h - 1, Math.max(0, (y + 0.5) / f - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const a = src[y0 * w + x0]! * (1 - tx) + src[y0 * w + x1]! * tx;
  const b = src[y1 * w + x0]! * (1 - tx) + src[y1 * w + x1]! * tx;
  return a * (1 - ty) + b * ty;
}

/**
 * Light through the smoked glass from a mask given as a signed distance (in the field's own units,
 * < 0 inside): the soft-edged core plus the near and far halos, shaped by `gain` (the hotspot),
 * faded to exactly 0 over the outer `taper` of the frame so no edge of the carrying quad can show.
 */
function diffuseLight(
  width: number, height: number, unitsPerTexel: number, distance: (x: number, y: number) => number, stroke: number,
  gain: (x: number, y: number) => number, taper: number, toUnits: (i: number, j: number) => [number, number],
  diffusion: { edge: number; near: { sigma: number; weight: number }; far: { sigma: number; weight: number } } = STATUS_DIFFUSION,
): EmissionField {
  const core = new Float32Array(width * height);
  // The soft edge is never narrower than about one texel, so the core stays anti-aliased.
  const e = Math.max(diffusion.edge * stroke, 0.75 * unitsPerTexel);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const [x, y] = toUnits(i, j);
      core[j * width + i] = (1 - smooth(-e, e, distance(x, y))) * gain(x, y);
    }
  }
  const f = width % 4 === 0 && height % 4 === 0 ? 4 : 1;
  const lw = width / f, lh = height / f, low = f > 1 ? downsample(core, width, height, f) : core;
  const near = gaussianBlur(low, lw, lh, (diffusion.near.sigma * stroke) / (unitsPerTexel * f));
  const far = gaussianBlur(low, lw, lh, (diffusion.far.sigma * stroke) / (unitsPerTexel * f));
  const data = new Float32Array(width * height);
  let peak = 0;
  for (let j = 0; j < height; j++) {
    const ty = Math.min(j + 0.5, height - j - 0.5) / height;
    for (let i = 0; i < width; i++) {
      const tx = Math.min(i + 0.5, width - i - 0.5) / width;
      const w = smooth(0, taper, tx) * smooth(0, taper, ty);
      const v = (core[j * width + i]! + diffusion.near.weight * upsample(near, lw, lh, f, i, j) + diffusion.far.weight * upsample(far, lw, lh, f, i, j)) * w;
      data[j * width + i] = v;
      if (v > peak) peak = v;
    }
  }
  return { width, height, data, peak };
}

/**
 * Status pictogram emission: the glyph on a square texture `size` texels across that spans
 * `extent` icon-grid units (centred on the grid's centre, 10, 10). Linear, 1 = the stroke core at
 * the hotspot.
 */
export function statusGlyphField(kind: 'accept' | 'decline', size = 512, extent = 30): EmissionField {
  const pts = STATUS_ICON[kind];
  const half = STATUS_ICON.stroke / 2, c = STATUS_ICON.grid / 2;
  const unitsPerTexel = extent / size;
  const toUnits = (i: number, j: number): [number, number] => [c - extent / 2 + (i + 0.5) * unitsPerTexel, c - extent / 2 + (j + 0.5) * unitsPerTexel];
  const distance = (x: number, y: number) => {
    let d = Infinity;
    for (let k = 0; k + 1 < pts.length; k++) d = Math.min(d, segmentDistance(x, y, pts[k]![0], pts[k]![1], pts[k + 1]![0], pts[k + 1]![1]));
    return d - half;
  };
  const { radius, floor } = STATUS_DIFFUSION.hotspot;
  const gain = (x: number, y: number) => floor + (1 - floor) * Math.exp(-((x - c) ** 2 + (y - c) ** 2) / (2 * radius * radius));
  return diffuseLight(size, size, unitsPerTexel, distance, STATUS_ICON.stroke, gain, 0.12, toUnits);
}

/** 8 × 8 Bayer matrix (0–63). */
const BAYER8 = (() => {
  const m = [0];
  let n = 1;
  while (n < 8) {
    const next = new Array<number>(4 * n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = 4 * m[y * n + x]!;
        next[y * 2 * n + x] = v;
        next[y * 2 * n + x + n] = v + 2;
        next[(y + n) * 2 * n + x] = v + 3;
        next[(y + n) * 2 * n + x + n] = v + 1;
      }
    }
    m.splice(0, m.length, ...next);
    n *= 2;
  }
  return m;
})();

/**
 * Field → 8-bit sRGB-encoded RGBA texels (grey, alpha 1), normalised by its peak, rows bottom-up
 * (a texture upload's first row is v = 0). sRGB encoding keeps the faint halo smooth (a linear
 * byte would band it below 1 %); a fixed ordered dither (8 × 8 Bayer, ±½ step) breaks the last
 * step to black into a fade (one byte there is about four output levels after the tone curve and
 * sRGB, a contour round the halo without it). Deterministic.
 */
export function encodeEmission(field: EmissionField): Uint8Array {
  const { width, height } = field;
  const out = new Uint8Array(width * height * 4);
  const inv = field.peak > 0 ? 1 / field.peak : 0;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const l = clamp01(field.data[j * width + i]! * inv);
      const s = l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055;
      const d = l > 0 ? (BAYER8[(j & 7) * 8 + (i & 7)]! + 0.5) / 64 - 0.5 : 0;
      const k = ((height - 1 - j) * width + i) * 4;
      out[k] = out[k + 1] = out[k + 2] = Math.min(255, Math.max(0, Math.round(s * 255 + d)));
      out[k + 3] = 255;
    }
  }
  return out;
}
