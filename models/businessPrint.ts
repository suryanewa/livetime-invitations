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
  cobalt: [58, 98, 214],
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
