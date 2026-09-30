import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { keepPixels } from './textures.ts';

/**
 * Printed graphics for the objects (fidelity pass), drawn at load time on a canvas: no font
 * files, no downloads, deterministic. Letterforms are original geometric constructions, so
 * nothing needs a licence. Decorative only — guests read everything essential in HTML.
 */

export const PRINT_COLORS = {
  cream: '#F2ECE0',
  ink: '#1F2226',
  cobalt: '#2C47A6',
  cobaltDeep: '#1D3180',
  coral: '#FF714A',
  butter: '#EDB449',
  paper: '#FBF8F2',
};

type Ctx = CanvasRenderingContext2D;

/** Geometric display letters on a unit grid (height 1). Stroke-built, rounded terminals. */
const GLYPHS: Record<string, { w: number; draw(c: Ctx): void }> = {
  // G: open bowl from upper-right round to the right, then the inward bar.
  G: { w: 0.8, draw(c) { const r = 0.44, cx = 0.44, cy = 0.5; c.beginPath(); c.arc(cx, cy, r, -0.28 * Math.PI, 0.02 * Math.PI, true); c.stroke(); c.beginPath(); c.moveTo(cx + r * Math.cos(0.02 * Math.PI), cy + 0.02); c.lineTo(cx + 0.06, cy + 0.02); c.stroke(); } },
  U: { w: 0.7, draw(c) { c.beginPath(); c.moveTo(0, 0.06); c.lineTo(0, 0.62); c.arc(0.35, 0.62, 0.35, Math.PI, 0, true); c.lineTo(0.7, 0.06); c.stroke(); } },
  E: { w: 0.56, draw(c) { c.beginPath(); c.moveTo(0.56, 0.06); c.lineTo(0, 0.06); c.lineTo(0, 0.94); c.lineTo(0.56, 0.94); c.moveTo(0, 0.5); c.lineTo(0.46, 0.5); c.stroke(); } },
  S: { w: 0.62, draw(c) { c.beginPath(); c.moveTo(0.6, 0.18); c.bezierCurveTo(0.52, 0.02, 0.06, 0.0, 0.04, 0.26); c.bezierCurveTo(0.02, 0.5, 0.62, 0.46, 0.6, 0.72); c.bezierCurveTo(0.58, 1.0, 0.1, 0.98, 0.02, 0.82); c.stroke(); } },
  T: { w: 0.62, draw(c) { c.beginPath(); c.moveTo(0, 0.06); c.lineTo(0.62, 0.06); c.moveTo(0.31, 0.06); c.lineTo(0.31, 0.94); c.stroke(); } },
  P: { w: 0.6, draw(c) { c.beginPath(); c.moveTo(0, 0.94); c.lineTo(0, 0.06); c.lineTo(0.32, 0.06); c.arc(0.32, 0.29, 0.23, -Math.PI / 2, Math.PI / 2); c.lineTo(0, 0.52); c.stroke(); } },
  A: { w: 0.74, draw(c) { c.beginPath(); c.moveTo(0, 0.94); c.lineTo(0.37, 0.06); c.lineTo(0.74, 0.94); c.moveTo(0.14, 0.64); c.lineTo(0.6, 0.64); c.stroke(); } },
};

/** Draw a word in the geometric face. Returns the drawn width in px. */
export function drawWord(c: Ctx, word: string, x: number, y: number, height: number, color: string, weight = 0.17, tracking = 0.1): number {
  c.save();
  c.translate(x, y);
  c.scale(height, height);
  c.strokeStyle = color;
  c.lineWidth = weight;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  let cursor = weight / 2;
  for (const ch of word) {
    const g = GLYPHS[ch];
    if (!g) {
      cursor += 0.35;
      continue;
    }
    c.save();
    c.translate(cursor, 0);
    g.draw(c);
    c.restore();
    cursor += g.w + tracking + weight * 0.5;
  }
  c.restore();
  return cursor * height;
}

export function wordWidth(word: string, height: number, weight = 0.17, tracking = 0.1): number {
  let w = weight / 2;
  for (const ch of word) w += (GLYPHS[ch]?.w ?? 0.35) + tracking + weight * 0.5;
  return w * height;
}

function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

function finish(canvas: HTMLCanvasElement, repeat = false): Texture {
  const t = new CanvasTexture(keepPixels(canvas));
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/**
 * Badge face print (portrait, card aspect 0.86 : 1.30). The slot band at the top stays plain.
 * light = cream stock with a cobalt block; dark = ink stock with a cobalt→deep gradient.
 */
export function cardPrint(template: 'light' | 'dark', width = 600): Texture {
  const W = width, H = Math.round((width * 1.3) / 0.86);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d')!;
  const u = W / 0.86; // px per scene unit
  const stock = template === 'light' ? PRINT_COLORS.cream : PRINT_COLORS.ink;
  const onStock = template === 'light' ? PRINT_COLORS.ink : PRINT_COLORS.cream;
  c.fillStyle = stock;
  c.fillRect(0, 0, W, H);

  // Colour block: a big cobalt field with a quarter-disc bite, bleeding off the right edge.
  const top = 0.24 * u, blockH = 0.64 * u;
  if (template === 'light') {
    c.fillStyle = PRINT_COLORS.cobalt;
  } else {
    const g = c.createLinearGradient(0, top, W, top + blockH);
    g.addColorStop(0, '#3453C4');
    g.addColorStop(1, PRINT_COLORS.cobaltDeep);
    c.fillStyle = g;
  }
  roundRect(c, 0.07 * u, top, W - 0.07 * u, blockH, 0.05 * u);
  c.fill();
  // Coral disc bitten by the block's top-right corner — the family's warm accent. Clipped to
  // the block so it never crowds the wordmark or the name bars.
  c.save();
  roundRect(c, 0.07 * u, top, W - 0.07 * u, blockH, 0.05 * u);
  c.clip();
  c.fillStyle = PRINT_COLORS.coral;
  c.beginPath();
  c.arc(W - 0.1 * u, top + 0.12 * u, 0.2 * u, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // Butter quarter at the block's lower-left corner.
  c.fillStyle = PRINT_COLORS.butter;
  c.beginPath();
  c.moveTo(0.07 * u, top + blockH);
  c.arc(0.07 * u, top + blockH, 0.16 * u, -Math.PI / 2, 0);
  c.closePath();
  c.fill();

  // "GUEST" in the geometric face, large, cream on cobalt.
  const wordH = 0.15 * u;
  const ww = wordWidth('GUEST', wordH);
  drawWord(c, 'GUEST', (W - ww) / 2 + 0.02 * u, top + 0.36 * u, wordH, PRINT_COLORS.cream);

  // Small portrait window and non-readable "name" bars (personal-ID cue, no fake data).
  const px = 0.13 * u, py = top + 0.06 * u;
  c.strokeStyle = PRINT_COLORS.cream;
  c.lineWidth = 0.014 * u;
  roundRect(c, px, py, 0.17 * u, 0.2 * u, 0.03 * u);
  c.stroke();
  c.fillStyle = PRINT_COLORS.cream;
  c.beginPath();
  c.arc(px + 0.085 * u, py + 0.075 * u, 0.032 * u, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.arc(px + 0.085 * u, py + 0.2 * u - 0.006 * u, 0.058 * u, Math.PI, 0);
  c.fill();
  for (const [i, len] of [[0, 0.16], [1, 0.1]] as const) {
    roundRect(c, px + 0.22 * u, py + 0.05 * u + i * 0.05 * u, len * u, 0.024 * u, 0.012 * u);
    c.fill();
  }

  // Coral stripe under the block, then fine print bars on the stock (unreadable by design).
  c.fillStyle = PRINT_COLORS.coral;
  roundRect(c, 0.07 * u, top + blockH + 0.05 * u, W - 0.14 * u, 0.035 * u, 0.017 * u);
  c.fill();
  c.fillStyle = onStock;
  c.globalAlpha = 0.55;
  for (const [i, len] of [[0, 0.34], [1, 0.22]] as const) {
    roundRect(c, 0.07 * u, top + blockH + 0.13 * u + i * 0.04 * u, len * u, 0.018 * u, 0.009 * u);
    c.fill();
  }
  c.globalAlpha = 1;
  return finish(canvas);
}

/**
 * Lanyard strap print, tiled along the strap: cobalt ground, a cream dot row (the family
 * signature, printed), coral dashes at the edges. Width axis = u, length axis = v.
 */
export function strapPrint(size = 256): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d')!;
  c.fillStyle = PRINT_COLORS.cobaltDeep;
  c.fillRect(0, 0, size, size);
  c.fillStyle = PRINT_COLORS.coral;
  c.fillRect(0, 0, size * 0.08, size);
  c.fillRect(size * 0.92, 0, size * 0.08, size);
  c.fillStyle = PRINT_COLORS.cream;
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.arc(size / 2, (i + 0.5) * (size / 4), size * 0.07, 0, Math.PI * 2);
    c.fill();
  }
  return finish(canvas, true);
}

/**
 * Holographic seal artwork: a rainbow sunburst crossed with fine rings and a small star at the
 * centre. The material rotates its hue with viewing angle, so this is only the starting point.
 */
export function holoPattern(size = 256): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  const img = c.createImageData(size, size);
  const hsl = (h: number, sat: number, l: number): [number, number, number] => {
    const k = (n: number) => (n + h * 12) % 12;
    const a = sat * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x / size - 0.5, dy = y / size - 0.5;
      const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const burst = 0.5 + 0.5 * Math.cos(a * 16);
      const rings = 0.5 + 0.5 * Math.cos(r * 90);
      const hue = (((a / (2 * Math.PI)) * 2 + r * 2.2 + 0.08 * rings) % 1 + 1) % 1;
      const [R, G, B] = hsl(hue, 0.42, 0.7 + 0.12 * burst - 0.05 * rings);
      const i = (y * size + x) * 4;
      img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  // Centre star, embossed look (lighter).
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.beginPath();
  for (let k = 0; k < 10; k++) {
    const rr = (k % 2 ? 0.06 : 0.15) * size, ang = (k / 10) * Math.PI * 2 - Math.PI / 2;
    const px = size / 2 + Math.cos(ang) * rr, py = size / 2 + Math.sin(ang) * rr;
    if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
  }
  c.closePath();
  c.fill();
  return finish(canvas);
}

/**
 * Record label art (circle UVs, 0–1 across the label disc). Deliberately asymmetric — an
 * off-centre wedge and a printed side mark — so a quarter turn of the record reads at a
 * glance, even foreshortened at the family's 15° elevation.
 */
export function labelPrint(preset: 'coral' | 'cobalt', size = 512): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  const ground = preset === 'coral' ? PRINT_COLORS.coral : PRINT_COLORS.cobalt;
  const accent = preset === 'coral' ? PRINT_COLORS.cobaltDeep : PRINT_COLORS.coral;
  const r = size / 2;
  c.fillStyle = ground;
  c.fillRect(0, 0, size, size);
  // Wedge: a quarter sector in the accent colour, with a butter sliver beside it.
  c.fillStyle = accent;
  c.beginPath();
  c.moveTo(r, r);
  c.arc(r, r, r, -Math.PI * 0.62, -Math.PI * 0.12);
  c.closePath();
  c.fill();
  c.fillStyle = PRINT_COLORS.butter;
  c.beginPath();
  c.moveTo(r, r);
  c.arc(r, r, r, -Math.PI * 0.12, -Math.PI * 0.04);
  c.closePath();
  c.fill();
  // Fine printed rings.
  c.strokeStyle = PRINT_COLORS.cream;
  c.globalAlpha = 0.85;
  c.lineWidth = size * 0.008;
  for (const rr of [0.93, 0.88]) {
    c.beginPath();
    c.arc(r, r, r * rr, 0, Math.PI * 2);
    c.stroke();
  }
  c.globalAlpha = 1;
  // Side mark: a bold "A" on the lower half, plus unreadable title bars (no fake metadata).
  drawWord(c, 'A', r - size * 0.07, r + size * 0.14, size * 0.2, PRINT_COLORS.cream, 0.2, 0);
  c.fillStyle = PRINT_COLORS.cream;
  for (const [i, len] of [[0, 0.3], [1, 0.2]] as const) {
    c.beginPath();
    c.roundRect(r - (len * size) / 2, r - size * 0.28 + i * size * 0.06, len * size, size * 0.028, size * 0.014);
    c.fill();
  }
  // Spindle hole shadow ring.
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.beginPath();
  c.arc(r, r, size * 0.05, 0, Math.PI * 2);
  c.fill();
  return finish(canvas);
}

/**
 * Tangential anisotropy directions for vinyl (disc UVs 0–1): RG = groove direction in
 * tangent space, B = strength. Gives the classic concentric sheen that stays put while the
 * record turns — the groove read without any fine geometry to shimmer.
 */
export function grooveDirections(size = 256): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  const img = c.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size - 0.5, v = 0.5 - (y + 0.5) / size;
      const len = Math.hypot(u, v) || 1;
      // Tangent to the circle through (u, v).
      const tx = -v / len, ty = u / len;
      const rad = Math.hypot(u, v) * 2;
      const strength = rad > 0.4 && rad < 0.97 ? 1 : 0.15;
      const i = (y * size + x) * 4;
      img.data[i] = (tx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ty * 0.5 + 0.5) * 255;
      img.data[i + 2] = strength * 255;
      img.data[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  const t = new CanvasTexture(keepPixels(canvas));
  t.minFilter = LinearMipmapLinearFilter;
  return t;
}
