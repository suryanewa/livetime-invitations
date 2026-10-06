import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import interLatin from '../../assets/shared/fonts/inter-latin-wght-normal.woff2?url';
import interLatinExt from '../../assets/shared/fonts/inter-latin-ext-wght-normal.woff2?url';
import { PRINT_COLORS } from './print.ts';
import { keepPixels } from './textures.ts';

/**
 * v1.7 (spec revision #41, pending Surya): the print on Dinner's invitation card — an eyebrow
 * ("You're invited"), the event's title and the invitee's name — drawn on a canvas at load and on
 * every text change. HTML stays authoritative: the guest reads the event in the page; the card is
 * the scene's echo of it.
 *
 * The one printed-text exception to "system sans only" (print.ts draws its letters geometrically):
 * a printed card must look the same in every poster on every machine, and a system face differs
 * between them. So the print is set in **one bundled OFL typeface, Inter** (rsms/inter, the
 * variable wght axis as woff2, latin and latin-ext; assets/shared/fonts/, OFL.txt beside it),
 * loaded with FontFace before the card is first drawn. If it fails to load, the interface's
 * system stack draws instead (the card still reads; only cross-machine determinism is lost).
 *
 * The roles follow the interface's ramp, set as print (DESIGN.md: hierarchy by weight and ink
 * tone): the eyebrow in Sage Graphite at the caption weight, letter-spaced capitals; the title in
 * ink at the display weight with the display's tight tracking, one or two balanced lines, shrunk
 * to fit; a short perforation rule (Perforation Taupe dots, decorative); the name in ink at the
 * title weight. The block is centred on the card.
 */

/** The family the bundled faces are registered under (an alias of Inter; never used by the page's CSS). */
export const CARD_FONT = 'Livetime Card Inter';
/** The interface's system stack (DESIGN.md), the fallback if the bundled face fails. */
const SYSTEM = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const FAMILY = `"${CARD_FONT}", ${SYSTEM}`;

/** The two subsets' unicode ranges (the fontsource split of Inter v4). */
const RANGES = {
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  latinExt: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
} as const;

let fontLoad: Promise<boolean> | null = null;
/**
 * Load the bundled face once (both subsets, every weight of the variable axis). Resolves true when
 * it is ready, false where there is no FontFace (unit tests) or it failed (the system stack draws).
 */
export function loadCardFont(): Promise<boolean> {
  if (fontLoad) return fontLoad;
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (typeof FontFace === 'undefined' || !fonts) return (fontLoad = Promise.resolve(false));
  const faces = [
    new FontFace(CARD_FONT, `url(${interLatin}) format('woff2')`, { weight: '100 900', style: 'normal', unicodeRange: RANGES.latin }),
    new FontFace(CARD_FONT, `url(${interLatinExt}) format('woff2')`, { weight: '100 900', style: 'normal', unicodeRange: RANGES.latinExt }),
  ];
  fontLoad = Promise.all(faces.map((f) => f.load().then((loaded) => fonts.add(loaded))))
    .then(() => true)
    .catch((e) => {
      console.warn('The card face did not load; the card prints in the system face', e);
      return false;
    });
  return fontLoad;
}

/** What the card prints. A missing or empty line is not printed (the host's card has no name). */
export interface CardText {
  eyebrow?: string;
  title?: string;
  name?: string;
}

/** The card's size in millimetres (models/dinnerContract.ts CARD: 10 × 7 cm, landscape). */
export const CARD_MM = { width: 100, height: 70 } as const;
/** Texture sizes: Normal/High, and Low (the Low tier halves it). */
export const CARD_PRINT_SIZE = { full: [2048, 1434], low: [1024, 717] } as const;

/** Print colours: the card stock (PRINT_COLORS.cream), the ink, the eyebrow's Sage Graphite, the rule's taupe. */
export const CARD_INK = {
  paper: PRINT_COLORS.cream,
  ink: PRINT_COLORS.ink,
  eyebrow: '#585C57',
  rule: '#CDC7BB',
} as const;

/**
 * The layout in millimetres: side margin, sizes (font size, the em) and gaps. Sizes are the
 * largest; the title steps down (TITLE_MIN) and wraps to two balanced lines before it is cut.
 */
export const CARD_LAYOUT = {
  margin: 10,
  eyebrow: { size: 3.3, weight: 600, tracking: 0.2 },
  title: { size: 9.2, min: 5.4, weight: 650, tracking: -0.018, leading: 1.1 },
  name: { size: 5.6, min: 4.2, weight: 600, tracking: -0.01 },
  gapEyebrow: 4.6,
  gapRule: 5.2,
  gapName: 4.4,
  rule: { dots: 9, pitch: 1.6, radius: 0.32 },
} as const;

type Ctx = CanvasRenderingContext2D;

const font = (weight: number, px: number) => `${weight} ${px.toFixed(2)}px ${FAMILY}`;

/** Letter spacing where the canvas supports it (Chrome, Firefox, Safari 18.4+); otherwise none. */
function track(ctx: Ctx, em: number, px: number): void {
  const c = ctx as Ctx & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = `${(em * px).toFixed(2)}px`;
}

function width(ctx: Ctx, text: string, weight: number, px: number, em: number): number {
  ctx.font = font(weight, px);
  track(ctx, em, px);
  // The trailing letter space is not part of the line.
  return ctx.measureText(text).width - ('letterSpacing' in ctx ? em * px : 0);
}

/** `text` cut to fit `max` with an ellipsis (whole words first, then letters). */
function cut(ctx: Ctx, text: string, weight: number, px: number, em: number, max: number): string {
  if (width(ctx, text, weight, px, em) <= max) return text;
  let s = text;
  while (s.length > 1 && width(ctx, `${s}…`, weight, px, em) > max) {
    const space = s.lastIndexOf(' ');
    s = space > s.length * 0.6 ? s.slice(0, space) : s.slice(0, -1);
    s = s.trimEnd();
  }
  return `${s}…`;
}

/** The title's lines: one line, else two balanced at a word break, stepping the size down to fit; cut at the smallest. */
export function layoutTitle(ctx: Ctx, title: string, max: number, mm: number): { lines: string[]; px: number } {
  const T = CARD_LAYOUT.title;
  const words = title.split(/\s+/).filter(Boolean);
  for (let size = T.size; size >= T.min - 1e-6; size *= 0.96) {
    const px = size * mm;
    if (width(ctx, title, T.weight, px, T.tracking) <= max) return { lines: [title], px };
    // The break that makes the longer line shortest.
    let best: string[] | null = null, bestW = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
      const w = Math.max(width(ctx, a, T.weight, px, T.tracking), width(ctx, b, T.weight, px, T.tracking));
      if (w < bestW) { bestW = w; best = [a, b]; }
    }
    if (best && bestW <= max) return { lines: best, px };
  }
  const px = T.min * mm;
  if (words.length < 2) return { lines: [cut(ctx, title, T.weight, px, T.tracking, max)], px };
  // Two lines at the smallest size: the first as full as fits, the rest cut.
  let i = 1;
  while (i < words.length - 1 && width(ctx, words.slice(0, i + 1).join(' '), T.weight, px, T.tracking) <= max) i++;
  return { lines: [cut(ctx, words.slice(0, i).join(' '), T.weight, px, T.tracking, max), cut(ctx, words.slice(i).join(' '), T.weight, px, T.tracking, max)], px };
}

/** A single line shrunk to fit down to `min` (mm), then cut. */
function fitLine(ctx: Ctx, text: string, weight: number, size: number, min: number, em: number, max: number, mm: number): { text: string; px: number } {
  for (let s = size; s >= min - 1e-6; s *= 0.96) if (width(ctx, text, weight, s * mm, em) <= max) return { text, px: s * mm };
  return { text: cut(ctx, text, weight, min * mm, em, max), px: min * mm };
}

/** A deterministic hash in [0, 1) (no Math.random: the print is the same on every load). */
const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

let grain: HTMLCanvasElement | null = null;
/** A 128 px tile of the stock's tooth: fine value noise, a level or two either way. */
function grainTile(): HTMLCanvasElement {
  if (grain) return grain;
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d')!;
  const img = x.createImageData(n, n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v = Math.round(hash(i, j) * 255);
      const k = (j * n + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
      img.data[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return (grain = c);
}

/**
 * Draw the card: the stock (cream with a faint tooth and a soft mottle) and the print, centred.
 * `canvas` is CARD_PRINT_SIZE (landscape, 10:7). Returns the block's extent (mm from the card's
 * top, for tests and the legibility check) or null when nothing is printed.
 */
export function drawCardPrint(canvas: HTMLCanvasElement, text: CardText): { top: number; bottom: number } | null {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  const mm = W / CARD_MM.width;
  const L = CARD_LAYOUT;
  ctx.save();
  ctx.fillStyle = CARD_INK.paper;
  ctx.fillRect(0, 0, W, H);
  // The stock's tooth (≈ 0.05 mm grain) and a soft mottle (≈ 2–3 cm): under a level or two, never a pattern.
  ctx.globalAlpha = 0.03;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(grainTile(), 'repeat')!;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 28; i++) {
    const x = hash(i, 7) * W, y = hash(i, 11) * H, r = (12 + 16 * hash(i, 13)) * mm;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = hash(i, 17) < 0.5;
    g.addColorStop(0, dark ? 'rgba(120, 100, 70, 0.007)' : 'rgba(255, 252, 244, 0.014)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  ctx.globalAlpha = 1;

  const eyebrow = text.eyebrow?.trim() ?? '', title = text.title?.trim() ?? '', name = text.name?.trim() ?? '';
  if (!eyebrow && !title && !name) {
    ctx.restore();
    return null;
  }
  const max = (CARD_MM.width - 2 * L.margin) * mm;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // Measure the block (cap heights from the face's own metrics), then centre it on the card.
  const cap = (weight: number, px: number) => {
    ctx.font = font(weight, px);
    const m = ctx.measureText('H');
    return m.actualBoundingBoxAscent || px * 0.727;
  };
  type Line = { text: string; weight: number; px: number; em: number; color: string; cap: number; advance: number };
  const lines: Line[] = [];
  const gaps: number[] = [];
  if (eyebrow) {
    const e = fitLine(ctx, eyebrow.toLocaleUpperCase(), L.eyebrow.weight, L.eyebrow.size, L.eyebrow.size * 0.8, L.eyebrow.tracking, max, mm);
    lines.push({ text: e.text, weight: L.eyebrow.weight, px: e.px, em: L.eyebrow.tracking, color: CARD_INK.eyebrow, cap: cap(L.eyebrow.weight, e.px), advance: 0 });
  }
  if (title) {
    const t = layoutTitle(ctx, title, max, mm);
    if (lines.length) gaps.push(L.gapEyebrow * mm);
    t.lines.forEach((s, i) => {
      if (i > 0) gaps.push(t.px * L.title.leading - cap(L.title.weight, t.px));
      lines.push({ text: s, weight: L.title.weight, px: t.px, em: L.title.tracking, color: CARD_INK.ink, cap: cap(L.title.weight, t.px), advance: 0 });
    });
  }
  let ruleAt = -1;
  if (name) {
    const n = fitLine(ctx, name, L.name.weight, L.name.size, L.name.min, L.name.tracking, max, mm);
    if (lines.length) {
      ruleAt = lines.length;
      gaps.push((L.gapRule + L.gapName) * mm);
    }
    lines.push({ text: n.text, weight: L.name.weight, px: n.px, em: L.name.tracking, color: CARD_INK.ink, cap: cap(L.name.weight, n.px), advance: 0 });
  }
  const total = lines.reduce((s, l) => s + l.cap, 0) + gaps.reduce((s, g) => s + g, 0);
  // Optical centre: a hair above the middle.
  let y = (H - total) / 2 - 0.6 * mm;
  const top = y;
  lines.forEach((l, i) => {
    if (i > 0) {
      if (i === ruleAt) {
        // The perforation rule, centred in the gap before the name.
        const R = L.rule, cy = y + L.gapRule * mm - (R.radius * mm) / 2 - 0.4 * mm;
        ctx.fillStyle = CARD_INK.rule;
        for (let d = 0; d < R.dots; d++) {
          const cx = W / 2 + (d - (R.dots - 1) / 2) * R.pitch * mm;
          ctx.beginPath();
          ctx.arc(cx, cy, R.radius * mm, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      y += gaps[i - 1]!;
    }
    y += l.cap;
    ctx.font = font(l.weight, l.px);
    track(ctx, l.em, l.px);
    ctx.fillStyle = l.color;
    // Centred: the trailing letter space shifts the line by half of it.
    const shift = 'letterSpacing' in ctx ? (l.em * l.px) / 2 : 0;
    ctx.fillText(l.text, W / 2 + shift, y);
  });
  ctx.restore();
  return { top: top / mm, bottom: y / mm };
}

/**
 * The card's print as a texture (world-space detail: sRGB, mipmapped, the renderer's maximum
 * anisotropy set by the card), or null where there is no canvas (unit tests).
 */
export function createCardPrint(text: CardText, size: keyof typeof CARD_PRINT_SIZE = 'full'): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const [w, h] = CARD_PRINT_SIZE[size];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  drawCardPrint(canvas, text);
  const tex = new CanvasTexture(keepPixels(canvas));
  tex.name = 'card_print';
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}
