/**
 * v1.6 Birthday (the Hollywood pass): the cake's piping regenerated as sculpted sweeps of a star
 * tip, in the master's scan units (1 scan unit = 22 cm at CAKE_SCALE 1.1; MM below is a millimetre).
 *
 * A piping bag pushes buttercream through a toothed tip: what comes out is a rope whose cross-section
 * is the tip's star (6–16 rounded teeth with V grooves between them), sitting *in* the frosting it is
 * piped on (pressed a millimetre in, with a concave fillet where it meets the surface), whose width
 * follows the hand's pressure (a fatter start, slow swells, the odd hiccup), whose teeth twist as the
 * bag turns and fade where the pressure dropped, and which ends where the bag was pulled away (the
 * rope thins, the teeth converge, the tail curls and is tucked in). Every piece here is built that way
 * from its own seed, so no two are alike:
 *
 * - `sweep`: the rope itself (a star cross-section swept along a path of feet on the surface);
 * - swag strands (the master's own strand paths), columns (straight pulled lines), tassel bulbs and
 *   fans (the same rope with an onion or flared pressure profile), rope borders (a chain of short
 *   overlapping commas, as a rope border is piped), shells (a squeeze then a pull: fat head, ridged
 *   tail tucked under the next head), spiral rosettes (a rope piped once and a quarter round its
 *   centre, ending in a tail) and dots (a round-tip kiss with a pulled peak that droops).
 *
 * Every vertex carries `ridge` (tooth crest +1 … groove −1, the runtime's satin crests and matt
 * grooves) next to its position and normal. Everything is a pure function of its inputs and seeds.
 */

export type V3 = [number, number, number];
/** One millimetre in scan units. */
export const MM = 1 / 220;

export interface PipeMesh { pos: number[]; nrm: number[]; idx: number[]; ridge: number[] }
export const emptyMesh = (): PipeMesh => ({ pos: [], nrm: [], idx: [], ridge: [] });

export function appendMesh(dst: PipeMesh, src: PipeMesh): PipeMesh {
  const base = dst.pos.length / 3;
  for (const v of src.pos) dst.pos.push(v);
  for (const v of src.nrm) dst.nrm.push(v);
  for (const v of src.ridge) dst.ridge.push(v);
  for (const i of src.idx) dst.idx.push(i + base);
  return dst;
}

// ── Small vector kit ────────────────────────────────────────────────────────────────
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => { if (b === a) return x < a ? 0 : 1; const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Rotates `v` about the unit axis `k` by `a`. */
export function rotate(v: V3, k: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a), d = dot(k, v);
  const kx = cross(k, v);
  return [v[0] * c + kx[0] * s + k[0] * d * (1 - c), v[1] * c + kx[1] * s + k[1] * d * (1 - c), v[2] * c + kx[2] * s + k[2] * d * (1 - c)];
}

// ── Deterministic noise ─────────────────────────────────────────────────────────────
export function hash1(i: number, seed: number): number {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Smooth 1D value noise in [−1, 1] (quintic). */
export function noise1(x: number, seed: number): number {
  const i = Math.floor(x), f = x - i;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  const a = 2 * hash1(i, seed) - 1, b = 2 * hash1(i + 1, seed) - 1;
  return a + (b - a) * u;
}
export function fbm1(x: number, seed: number, oct = 3): number {
  let s = 0, amp = 0.5, n = 0, f = 1;
  for (let o = 0; o < oct; o++) { s += amp * noise1(x * f, seed + 131 * o); n += amp; amp *= 0.5; f *= 2.03; }
  return s / n;
}
/** A seeded stream: `r()` in [0, 1), `s()` in [−1, 1). */
export function stream(seed: number): { r: () => number; s: () => number } {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { r, s: () => 2 * r() - 1 };
}
export function seedOf(text: string, index = 0): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h ^ Math.imul(index + 1, 2654435761)) >>> 0;
}

// ── The rope: a star-tip cross-section swept along feet on the surface ─────────────────
/**
 * One foot of a sweep: `c` on the surface the rope is piped on, `n` that surface's outward normal
 * (the section's up), `t` along the rope; `w` the half-width, `h` how far it stands proud, `sink` how
 * deep it is pressed in, `tw` the tip's turn (radians), `amp` the teeth's depth (fraction of the
 * smaller radius) and `flare` the fillet's reach (fraction of h, where it meets the surface).
 */
export interface Foot {
  c: V3; n: V3; t: V3; w: number; h: number; sink: number; tw: number; amp: number; flare: number;
  /**
   * v1.6 polish: how much of the rope's underside shows its teeth (0 resting on the surface, the
   * teeth fading into the fillet; 1 overhanging, the star's teeth all round, as from behind).
   */
  back?: number;
  /** v1.6 polish: how far the rope's foot spreads where it slumped onto a flat surface (fraction of w). */
  bulge?: number;
}

export interface Tip {
  /** Teeth round the whole section (about half show above the surface). */
  teeth: number;
  /** Crest shape: ((1 − cos 2πf)/2)^k (k < 1: broad rounded crests, soft V grooves). */
  crest: number;
  /** Per-tooth depth variation (±) and how it drifts along the rope (cycles over the rope). */
  toothJitter: number;
  toothDrift: number;
  /** Samples per tooth across the visible arc; samples on the hidden underside. */
  perTooth: number;
  hidden: number;
  /**
   * Sample the section uniformly all round and turn the samples with the tip (`tw`), so the grid's
   * columns follow the teeth: a fast-twisting rope keeps clean helical grooves instead of a sheared
   * zig-zag. For ropes whose whole section shows.
   */
  aligned?: boolean;
  /** v1.6 polish: sample the whole section at the visible arc's density (for ropes seen from behind). */
  wrap?: boolean;
}
export const STAR: Tip = { teeth: 12, crest: 0.65, toothJitter: 0.2, toothDrift: 3, perTooth: 5, hidden: 4 };

/**
 * Sweeps `feet` (≥ 2) into a closed tube. A foot with w = h = sink = 0 closes the tube to a point
 * there (rounded caps are the caller's taper). Normals come from the finished surface.
 */
export function sweep(feet: Foot[], tip: Tip, seed: number): PipeMesh {
  const L = feet.length;
  // Section angles: dense over the visible arc (|φ| ≤ 0.74π), a few under the surface.
  const vis = 0.74 * Math.PI;
  const nVis = Math.max(8, Math.round(((tip.teeth * vis) / Math.PI) * tip.perTooth));
  const phis: number[] = [];
  for (let k = 0; k <= nVis; k++) phis.push(-vis + (2 * vis * k) / nVis);
  for (let k = 1; k < tip.hidden; k++) phis.push(vis + ((2 * Math.PI - 2 * vis) * k) / tip.hidden);
  if (tip.aligned || tip.wrap) {
    phis.length = 0;
    const n = Math.round(tip.teeth * tip.perTooth);
    for (let k = 0; k < n; k++) phis.push(-Math.PI + (2 * Math.PI * (k + 0.5)) / n);
  }
  const A = phis.length;
  const jitter = Array.from({ length: tip.teeth }, (_, k) => 1 + tip.toothJitter * (2 * hash1(k, seed) - 1));
  const P: V3[][] = [], RG: number[][] = [];
  for (let i = 0; i < L; i++) {
    const f = feet[i]!;
    const s = L > 1 ? i / (L - 1) : 0;
    const n = norm(f.n);
    const t = norm(sub(f.t, mul(n, dot(f.t, n))));
    const b = cross(t, n);
    const rv = (f.h + f.sink) / 2, y0 = f.h - rv;
    const rmin = Math.max(1e-9, Math.min(f.w, rv));
    const ring: V3[] = [], rg: number[] = [];
    const flare = f.flare * Math.max(f.h, 1e-9);
    for (const phi0 of phis) {
      const phi = tip.aligned ? phi0 + f.tw : phi0;
      const sx = Math.sin(phi), cy = Math.cos(phi);
      let x = f.w * sx, y = y0 + rv * cy;
      // Ellipse normal.
      let nx = f.w > 1e-12 ? sx / f.w : 0, ny = rv > 1e-12 ? cy / rv : 0;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl; ny /= nl;
      // Teeth: rounded crests, V grooves; continuous at every groove whatever the tooth's depth.
      const u = (tip.teeth * (phi - f.tw)) / (2 * Math.PI);
      const k = Math.floor(u), fr = u - k;
      const kk = ((k % tip.teeth) + tip.teeth) % tip.teeth;
      const crest = Math.pow(Math.max(0, 0.5 - 0.5 * Math.cos(2 * Math.PI * fr)), tip.crest);
      const depth = jitter[kk]! * (1 + 0.42 * noise1(s * tip.toothDrift + 7.3 * kk, seed + 17));
      // Teeth fade into the fillet near the surface and vanish on the hidden underside.
      const show0 = smooth(-0.15 * f.h, 0.5 * f.h, y);
      const show = show0 + (1 - show0) * clamp(f.back ?? 0, 0, 1);
      const a = f.amp * rmin * show;
      const off = a * (Math.max(0, depth) * crest - 0.6);
      x += nx * off;
      y += ny * off;
      // Slumped onto a flat surface (a shell border on the plate): the lower half spreads.
      if (f.bulge && y < 0.55 * f.h) { const q = 1 - Math.max(y, 0) / (0.55 * f.h); x *= 1 + f.bulge * q * q; }
      // Fillet: the rope's flanks flare out into the surface it is pressed into (concave).
      if (flare > 0 && y < flare) {
        const d = (flare - y) / flare;
        const push = d <= 1 ? 0.85 * flare * d * d : 0.85 * flare * (1 + 2 * (d - 1));
        x += Math.sign(x || 1e-9) * push;
      }
      ring.push(add(add(f.c, mul(b, x)), mul(n, y)));
      rg.push(clamp((crest - 0.6) / 0.4, -1, 1) * show + (1 - show) * -0.2);
    }
    P.push(ring);
    RG.push(rg);
  }
  return gridMesh(P, RG, true, feet.map((f) => f.t));
}

/**
 * Triangulates rows (along) × cols (around, closed if `wrap`) and gives every vertex the normal of
 * the finished surface (central differences on the grid, oriented away from the row's centre).
 */
export function gridMesh(P: V3[][], RG: number[][], wrap: boolean, along: V3[], up?: V3): PipeMesh {
  const L = P.length, A = P[0]!.length;
  const m = emptyMesh();
  for (let i = 0; i < L; i++) {
    const row = P[i]!;
    const ctr: V3 = [0, 0, 0];
    for (const p of row) { ctr[0] += p[0] / A; ctr[1] += p[1] / A; ctr[2] += p[2] / A; }
    let rowSize = 0;
    for (const p of row) rowSize = Math.max(rowSize, len(sub(p, ctr)));
    for (let j = 0; j < A; j++) {
      const p = row[j]!;
      const jl = wrap ? (j + A - 1) % A : Math.max(0, j - 1), jr = wrap ? (j + 1) % A : Math.min(A - 1, j + 1);
      const tu = sub(row[jr]!, row[jl]!);
      const tv = sub(P[Math.min(L - 1, i + 1)]![j]!, P[Math.max(0, i - 1)]![j]!);
      let n = cross(tv, tu);
      const out = sub(p, ctr);
      if (len(n) < 1e-14 || rowSize < 1e-7) n = up ?? mul(norm(along[i]!), i === 0 ? -1 : 1);
      else if (dot(n, up ?? out) < 0) n = mul(n, -1);
      n = norm(n);
      m.pos.push(p[0], p[1], p[2]);
      m.nrm.push(n[0], n[1], n[2]);
      m.ridge.push(RG[i]![j]!);
    }
  }
  const cols = wrap ? A : A - 1;
  for (let i = 0; i < L - 1; i++) for (let j = 0; j < cols; j++) {
    const a = i * A + j, b = i * A + ((j + 1) % A), c = a + A, d = b + A;
    m.idx.push(a, c, b, b, c, d);
  }
  orientMesh(m);
  return m;
}

/**
 * Area-weighted vertex normals from the triangles, welded by position (a tube's seams and collapsed
 * cap rows share one normal), keeping each vertex's previous side.
 */
export function recomputeNormals(m: PipeMesh): void {
  const key = (i: number) => `${Math.round(m.pos[3 * i]! * 2e6)},${Math.round(m.pos[3 * i + 1]! * 2e6)},${Math.round(m.pos[3 * i + 2]! * 2e6)}`;
  const id = new Map<string, number>();
  const weld = new Int32Array(m.pos.length / 3);
  for (let i = 0; i < weld.length; i++) { const k = key(i); const j = id.get(k); weld[i] = j ?? i; if (j === undefined) id.set(k, i); }
  const acc = new Float64Array(m.pos.length);
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = m.idx[t]!, b = m.idx[t + 1]!, c = m.idx[t + 2]!;
    const pa: V3 = [m.pos[3 * a]!, m.pos[3 * a + 1]!, m.pos[3 * a + 2]!];
    const n = cross(sub([m.pos[3 * b]!, m.pos[3 * b + 1]!, m.pos[3 * b + 2]!], pa), sub([m.pos[3 * c]!, m.pos[3 * c + 1]!, m.pos[3 * c + 2]!], pa));
    // Orient by the vertices' previous normals.
    const s = dot(n, [m.nrm[3 * a]! + m.nrm[3 * b]! + m.nrm[3 * c]!, m.nrm[3 * a + 1]! + m.nrm[3 * b + 1]! + m.nrm[3 * c + 1]!, m.nrm[3 * a + 2]! + m.nrm[3 * b + 2]! + m.nrm[3 * c + 2]!]) < 0 ? -1 : 1;
    for (const v of [a, b, c]) { const w = weld[v]!; acc[3 * w] = acc[3 * w]! + s * n[0]; acc[3 * w + 1] = acc[3 * w + 1]! + s * n[1]; acc[3 * w + 2] = acc[3 * w + 2]! + s * n[2]; }
  }
  for (let i = 0; i < weld.length; i++) {
    const w = weld[i]!;
    const n: V3 = [acc[3 * w]!, acc[3 * w + 1]!, acc[3 * w + 2]!];
    if (len(n) < 1e-16) continue;
    const nn = norm(n);
    m.nrm[3 * i] = nn[0]; m.nrm[3 * i + 1] = nn[1]; m.nrm[3 * i + 2] = nn[2];
  }
}

/** Makes every triangle wind counter-clockwise about its vertices' normals. */
export function orientMesh(m: { pos: number[]; nrm: number[]; idx: number[] }): void {
  const P = m.pos, N = m.nrm;
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = m.idx[t]!, b = m.idx[t + 1]!, c = m.idx[t + 2]!;
    const ux = P[3 * b]! - P[3 * a]!, uy = P[3 * b + 1]! - P[3 * a + 1]!, uz = P[3 * b + 2]! - P[3 * a + 2]!;
    const vx = P[3 * c]! - P[3 * a]!, vy = P[3 * c + 1]! - P[3 * a + 1]!, vz = P[3 * c + 2]! - P[3 * a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const sx = N[3 * a]! + N[3 * b]! + N[3 * c]!, sy = N[3 * a + 1]! + N[3 * b + 1]! + N[3 * c + 1]!, sz = N[3 * a + 2]! + N[3 * b + 2]! + N[3 * c + 2]!;
    if (nx * sx + ny * sy + nz * sz < 0) { m.idx[t + 1] = c; m.idx[t + 2] = b; }
  }
}

// ── Pressure: how a hand squeezes along a rope ────────────────────────────────────────
/**
 * Width multiplier at s ∈ [0, 1] along a rope `length` long (scan): slow swells (≈ ±8 % over a
 * couple of centimetres), the odd hiccup (a short thinning and a lump after it), a fatter start
 * where the bag was first squeezed. Rounded caps and the pulled tail are applied by `taper`.
 */
export function pressure(s: number, length: number, seed: number, opts: { swell?: number; start?: number; hiccups?: number } = {}): number {
  const mm = (s * length) / MM;
  let p = 1 + (opts.swell ?? 0.08) * fbm1(mm / 22, seed, 2);
  p += (opts.start ?? 0.1) * Math.exp(-(((s - 0.04) / 0.05) ** 2));
  const hic = opts.hiccups ?? 0.35;
  const g = stream(seed + 99);
  if (g.r() < hic) {
    const at = 0.25 + 0.5 * g.r(), wd = (2 + 3 * g.r()) * MM / Math.max(length, 1e-6);
    p *= 1 - 0.16 * Math.exp(-(((s - at) / wd) ** 2)) + 0.1 * Math.exp(-(((s - at - 2.2 * wd) / (1.4 * wd)) ** 2));
  }
  return p;
}

/**
 * The ends of a rope: a rounded start cap over `cap0` (fraction of the length) and a pulled tail
 * over `tail` (the rope thins to `tip` and is drawn into the surface; `curl` sideways at the very end).
 * Returns the size multiplier and how far the end is drawn in (fraction of h).
 */
export function taper(s: number, cap0: number, tail: number, tip = 0.12): { k: number; dive: number } {
  let k = 1, dive = 0;
  if (cap0 > 0 && s < cap0) k = Math.sqrt(Math.max(0, 1 - (1 - s / cap0) ** 2));
  if (tail > 0 && s > 1 - tail) {
    const u = (s - (1 - tail)) / tail;
    k *= tip + (1 - tip) * (1 - smooth(0, 1, u)) ** 1.2;
    dive = smooth(0.55, 1, u);
    // The very end closes.
    if (u > 0.94) k *= Math.sqrt(Math.max(0, 1 - ((u - 0.94) / 0.06) ** 2));
  }
  return { k, dive };
}

// ── Paths ─────────────────────────────────────────────────────────────────────────────
/** Catmull-Rom point on an open polyline at u ∈ [0, n − 1]. */
export function catmull(pts: V3[], u: number): V3 {
  const n = pts.length;
  const i = Math.min(Math.floor(u), n - 2), f = u - i;
  const p1 = pts[i]!, p2 = pts[i + 1]!;
  const p0 = i > 0 ? pts[i - 1]! : sub(mul(p1, 2), p2);
  const p3 = i + 2 < n ? pts[i + 2]! : sub(mul(p2, 2), p1);
  const f2 = f * f, f3 = f2 * f;
  const out: V3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) out[k] = 0.5 * (2 * p1[k]! + (-p0[k]! + p2[k]!) * f + (2 * p0[k]! - 5 * p1[k]! + 4 * p2[k]! - p3[k]!) * f2 + (-p0[k]! + 3 * p1[k]! - 3 * p2[k]! + p3[k]!) * f3);
  return out;
}

/** Resamples a polyline by arc length into `count` points. */
export function resample(pts: V3[], count: number): V3[] {
  const dense: V3[] = [];
  const n = pts.length;
  for (let k = 0; k <= (n - 1) * 8; k++) dense.push(catmull(pts, Math.min(n - 1, k / 8)));
  const acc = [0];
  for (let k = 1; k < dense.length; k++) acc.push(acc[k - 1]! + len(sub(dense[k]!, dense[k - 1]!)));
  const total = acc[acc.length - 1]!;
  const out: V3[] = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const want = (total * i) / (count - 1);
    while (j < acc.length - 2 && acc[j + 1]! < want) j++;
    const f = acc[j + 1]! > acc[j]! ? (want - acc[j]!) / (acc[j + 1]! - acc[j]!) : 0;
    out.push(lerp3(dense[j]!, dense[j + 1]!, clamp(f, 0, 1)));
  }
  return out;
}
export const pathLength = (pts: V3[]) => pts.reduce((a, p, i) => (i ? a + len(sub(p, pts[i - 1]!)) : 0), 0);
export const tangents = (pts: V3[]): V3[] => pts.map((_, i) => norm(sub(pts[Math.min(pts.length - 1, i + 1)]!, pts[Math.max(0, i - 1)]!)));

// ── Swag strands ──────────────────────────────────────────────────────────────────────
/**
 * A hanging swag strand from its master path: `feet` (the master's ring centres on the surface),
 * `normals` (the surface's outward normal there), `w`/`h` its master half-width and height (scan).
 * Rebuilt as a star rope piped from one end to the other: the bag's start blob, pressure swells,
 * teeth twisting as the bag turns, a sag at the low point (≈ 0.6–1.4 mm, buttercream is heavy),
 * the pulled tail curling and tucked in; each strand its own.
 */
export function swagStrand(feet: V3[], normals: V3[], w0: number, h0: number, seed: number, opts: { drop?: number } = {}): PipeMesh {
  const g = stream(seed);
  // v1.6 polish (fix 2): each strand its own weight of buttercream (±12 %), and its bay's own drop.
  const thick = 1 + 0.12 * g.s();
  const w = w0 * thick, h = h0 * (1 + 0.1 * g.s()) * thick;
  const length = pathLength(feet);
  const L = Math.max(24, Math.round(length / (1.6 * MM)));
  const path = resample(feet, L);
  const nPath = resample(normals, L).map(norm);
  // Which end the bag started at (the decorator pipes each strand from one column to the next).
  const reverse = g.r() < 0.5;
  if (reverse) { path.reverse(); nPath.reverse(); }
  const T = tangents(path);
  const twist0 = g.r() * 2 * Math.PI, twist = (0.5 + 0.9 * g.r()) * (g.r() < 0.5 ? -1 : 1);
  const sag = (0.6 + 0.8 * g.r()) * MM + (opts.drop ?? 0), sagAt = 0.45 + 0.1 * g.s();
  // Buttercream gathers at the bottom of the loop (it sags while it sets): a fuller low point.
  const gather = 0.1 + 0.1 * g.r();
  const curl = (g.s() * 1.4) * MM;
  const amp = 0.23 + 0.05 * g.s();
  const wob = 0.18 * MM;
  const feetOut: Foot[] = [];
  for (let i = 0; i < L; i++) {
    const s = i / (L - 1);
    const lowS = reverse ? 1 - sagAt : sagAt;
    const p = pressure(s, length, seed + 3, { swell: 0.12, start: 0.12, hiccups: 0.35 }) * (1 + gather * Math.exp(-(((s - lowS) / 0.13) ** 2)));
    const { k, dive: dive0 } = taper(s, 0.025, 0.12, 0.18);
    // v1.6 polish (fix 4): both ends tucked into the coat under the rosettes they meet (no end pokes
    // up between a rosette's loops).
    const dive = Math.max(dive0, 0.8 * (1 - smooth(0, 0.07, s)), 0.8 * smooth(0.93, 1, s));
    const n = nPath[i]!, t = T[i]!;
    const b = norm(cross(t, n));
    // Gravity: the strand's low middle droops a little (down along the surface).
    const down: V3 = norm(sub([0, -1, 0], mul(n, -n[1])));
    const drop = sag * Math.exp(-(((s - lowS) / 0.24) ** 2));
    // The hand: a sub-millimetre wander across the strand.
    const across = wob * fbm1((s * length) / (7 * MM), seed + 5, 2) + curl * smooth(0.9, 1, s) ** 2;
    const c = add(add(add(path[i]!, mul(down, drop)), mul(b, across)), mul(n, -dive * 0.9 * h * k));
    feetOut.push({ c, n, t, w: w * p * k, h: h * p * k, sink: 1.1 * MM * Math.max(k, 0.35) * (k > 0 ? 1 : 0), tw: twist0 + twist * s + 0.22 * fbm1((s * length) / (9 * MM), seed + 11, 2), amp: amp * (1 + 0.25 * fbm1((s * length) / (14 * MM), seed + 13, 2)), flare: 0.3 });
  }
  // (v1.6 polish, fix 4: 4.6 samples a tooth, the silhouette's grooves no longer a sawtooth.)
  return sweep(feetOut, { ...STAR, teeth: 11 + 2 * Math.floor(g.r() * 2), crest: 0.42, perTooth: 4.6, toothDrift: 2 + 3 * g.r() }, seed);
}

// ── Straight pulled lines: columns, tassel bulbs and fans ─────────────────────────────
/**
 * A rope pulled straight down a tier's side at angle `theta`, from y `y0` (top) to `y1`, on a
 * surface of radius `R` (scan); `w` half-width and `h` height at full pressure; `profile(s)` the
 * pressure along it (columns: steady; bulbs: an onion; fans: a flare).
 */
export function pulledLine(theta: number, y0: number, y1: number, R: (y: number) => number, w: number, h: number, profile: (s: number) => number, tip: Tip, seed: number, opts: { amp?: number; cap0?: number; tail?: number; flare?: number; lean?: number; twist?: number; hem?: number } = {}): PipeMesh {
  const g = stream(seed);
  const length = Math.abs(y0 - y1);
  const L = Math.max(16, Math.round(length / (1.2 * MM)));
  const lean = opts.lean ?? 0;
  const tw0 = g.r() * 2 * Math.PI, tw = (opts.twist ?? 0.4) * g.s();
  const feet: Foot[] = [];
  for (let i = 0; i < L; i++) {
    const s = i / (L - 1);
    const y = y0 + (y1 - y0) * s;
    const th = theta + (lean * (y - y0) + 0.25 * MM * fbm1(s * length / (9 * MM), seed + 4, 2)) / R(y);
    const r = R(y);
    const n: V3 = [Math.cos(th), 0, Math.sin(th)];
    const c: V3 = [r * Math.cos(th), y, r * Math.sin(th)];
    const t: V3 = norm([0, y1 - y0, 0]);
    const { k, dive } = taper(s, opts.cap0 ?? 0.05, opts.tail ?? 0.08, 0.2);
    const p = profile(s) * pressure(s, length, seed + 1, { swell: 0.05, start: 0.06, hiccups: 0.2 });
    feet.push({ c: add(c, mul(n, -dive * 0.6 * h)), n, t, w: w * p * k, h: h * p * k, sink: 1.0 * MM * (k > 0 ? Math.max(k, 0.3) : 0), tw: tw0 + tw * s, amp: opts.amp ?? 0.16, flare: opts.flare ?? 0.28 });
  }
  const mesh = sweep(feet, tip, seed);
  // v1.6 polish (fix 4): a pulled hem is not cut flat: each pleat is drawn down its own way (the
  // crests further than the grooves, each by its own amount), so the hem is scalloped and uneven.
  if (opts.hem) {
    const A = mesh.pos.length / 3 / L;
    const dn = Math.sign(y1 - y0);
    for (let i = 0; i < L; i++) {
      const s = i / (L - 1);
      const zone = smooth(0.72, 0.96, s);
      if (zone <= 0) continue;
      for (let j = 0; j < A; j++) {
        const v = i * A + j;
        const crest = 0.5 + 0.5 * mesh.ridge[v]!;
        // (Smooth round the hem: a pleat's own length, not a random spike per vertex column.)
        const own = 0.75 + 0.5 * noise1((j / A) * 9, seed + 71) + 0.25 * noise1((j / A) * 23, seed + 73);
        mesh.pos[3 * v + 1] = mesh.pos[3 * v + 1]! + dn * opts.hem * zone * zone * crest * Math.max(0.2, own);
      }
    }
    recomputeNormals(mesh);
    orientMesh(mesh);
  }
  return mesh;
}

// ── Rope border ───────────────────────────────────────────────────────────────────────
/**
 * A rope border round a tier at height `y` on radius `R(y)` (scan): a star tip turned steadily as it
 * is drawn round, so its teeth run as diagonal twists (a full turn every 8–10 mm), with the slight
 * bead of each push every ≈ 3.4 mm; piped in four runs that overlap where the decorator stopped and
 * started again (each with its own start and pulled tail).
 */
export function ropeBorder(y: number, R: (y: number) => number, thick: number, seed: number): PipeMesh {
  const out = emptyMesh();
  const g = stream(seed);
  const runs = 4;
  const start = g.r() * 2 * Math.PI;
  for (let k = 0; k < runs; k++) {
    const seedK = seed + 977 * (k + 1);
    const h = stream(seedK);
    const a0 = start + (k * 2 * Math.PI) / runs - 0.04 - 0.02 * h.r();
    const a1 = start + ((k + 1) * 2 * Math.PI) / runs + 0.04 + 0.02 * h.r();
    const r0 = R(y);
    const length = (a1 - a0) * r0;
    const L = Math.round(length / (0.6 * MM));
    const twistPitch = (8.5 + 1.5 * h.s()) * MM, beadPitch = (3.4 + 0.3 * h.s()) * MM;
    const tw0 = h.r() * 2 * Math.PI, yOff = 0.25 * MM * h.s();
    const feet: Foot[] = [];
    for (let i = 0; i < L; i++) {
      const s = i / (L - 1);
      const th = a0 + (a1 - a0) * s;
      const along = s * length;
      const yy = y + yOff + 0.3 * MM * fbm1(along / (11 * MM), seedK + 3, 2);
      const r = R(yy);
      // On the edge's bead the surface faces out and up: the rope sits on it, not into it.
      const dR = (R(yy + 0.0005) - R(yy - 0.0005)) / 0.001;
      const n: V3 = norm([Math.cos(th), -dR, Math.sin(th)]);
      const c: V3 = [r * Math.cos(th), yy, r * Math.sin(th)];
      const t: V3 = [-Math.sin(th), 0, Math.cos(th)];
      // (v1.6 polish, fix 4: softer beads and rounder teeth; three-quarter on, the old ones read as spikes.)
      const bead = 1 - 0.12 * (0.5 + 0.5 * Math.cos((2 * Math.PI * along) / beadPitch + 0.8 * fbm1(along / (6 * MM), seedK + 5, 1)));
      const { k: tk, dive } = taper(s, 0.008, 0.02, 0.25);
      const p = pressure(s, length, seedK + 7, { swell: 0.07, start: 0.12, hiccups: 0.2 });
      feet.push({ c: add(c, mul(n, -dive * 0.5 * thick)), n, t, w: 0.58 * thick * bead * tk * p, h: 0.95 * thick * bead * tk * p, sink: 0.6 * MM * (tk > 0 ? Math.max(tk, 0.3) : 0), tw: tw0 + (2 * Math.PI * along) / twistPitch, amp: 0.19, flare: 0.22 });
    }
    appendMesh(out, sweep(feet, { teeth: 6, crest: 0.55, toothJitter: 0.1, toothDrift: 4, perTooth: 6, hidden: 3, aligned: true }, seedK));
  }
  return out;
}

// ── Shells ────────────────────────────────────────────────────────────────────────────
/**
 * A shell border's shell: squeezed (a fat rounded head) then pulled along the border into a ridged
 * tail that tucks under the next head. Sits on a ledge at height `yLedge` (scan) against a wall of
 * radius `Rw`, its head at angle `theta`, running `dir` (±1) round the tier; `size` its length.
 */
export function shell(theta: number, yLedge: number, Rw: number, size: number, height: number, depth: number, dir: number, seed: number, sinkDepth = 0.9 * MM, opts: { headAt?: number; bulge?: number } = {}): PipeMesh {
  const g = stream(seed);
  const lengthS = size * (1 + 0.06 * g.s());
  const L = 44;
  const rC = Rw + depth * (0.36 + 0.06 * g.s());
  // v1.6 polish (fix 3): a shell border is one chain: each shell is squeezed out *on* the last one's
  // tail (its back already fat, rising out of it), then pulled into a ridged tail that runs on under
  // the next head. The head sits at `headAt` of its length.
  const headAt = (opts.headAt ?? 0.28) + 0.03 * g.s();
  const H = height * (1 + 0.08 * g.s()), W = depth * 0.62 * (1 + 0.08 * g.s());
  const sway = 0.7 * MM * g.s();
  const tw0 = 0.25 * g.s(), tw1 = 0.5 * g.s(), amp = 0.3 + 0.04 * g.s();
  const feet: Foot[] = [];
  for (let i = 0; i < L; i++) {
    const s = i / (L - 1);
    const along = s * lengthS;
    const th = theta + (dir * along) / rC;
    // The tail runs down and in towards the wall, under the next head; the head is round.
    const rr = rC - 0.2 * depth * smooth(0.45, 1, s) + sway * Math.sin(Math.PI * s) ** 2;
    const c: V3 = [rr * Math.cos(th), yLedge, rr * Math.sin(th)];
    const t: V3 = norm([-Math.sin(th) * dir, -0.03 * smooth(0.6, 1, s), Math.cos(th) * dir]);
    // Squeeze profile: the back rises fat out of the last tail to the head, then a long pull to a
    // fine tail (the teeth converging on it).
    let prof: number;
    if (s < headAt) prof = 0.25 + 0.75 * Math.sqrt(Math.max(0, 1 - ((headAt - s) / headAt) ** 2));
    else prof = Math.max(0.1, 1 - Math.pow((s - headAt) / (1 - headAt), 1.3));
    const p = pressure(s, lengthS, seed + 2, { swell: 0.05, start: 0, hiccups: 0.15 });
    const open = s < 0.05 ? Math.sqrt(Math.max(0, 1 - (1 - s / 0.05) ** 2)) : 1;
    const close = s > 0.97 ? Math.sqrt(Math.max(0, 1 - ((s - 0.97) / 0.03) ** 2)) : 1;
    const k = prof * p * open * close;
    // The tail lies lower than the head (it is pressed under the next one).
    const hk = H * k * (1 - 0.25 * smooth(0.55, 1, s));
    feet.push({ c, n: [0, 1, 0], t, w: W * k, h: hk, sink: sinkDepth * (k > 0 ? Math.max(k, 0.3) : 0), tw: tw0 + tw1 * s, amp, flare: 0.26, bulge: opts.bulge ?? 0 });
  }
  return sweep(feet, { teeth: 9 + Math.floor(2 * g.r()), crest: 0.5, toothJitter: 0.12, toothDrift: 1.5, perTooth: 5, hidden: 4 }, seed);
}

// ── Spiral rosettes ───────────────────────────────────────────────────────────────────
/**
 * A rosette piped with a star tip: started at the centre, carried once and a quarter round it, and
 * pulled off in a tapering tail that lies over the first loop. In the frame (`c` the centre on the
 * surface, `n` out of it, `u` any direction in it); `R` its radius (to the rope's outer edge).
 * Returns the mesh and the top of its centre (where a sugar pearl is set).
 */
/**
 * `rest`: what the rosette rests on: for a point and a direction, how far back along the direction
 * the surface is (signed, positive in front of it). A piped rosette sits on the surface it is piped
 * on whatever that surface does under it.
 */
export function spiralRosette(c: V3, n0: V3, u0: V3, R: number, seed: number, opts: { turns?: number; rope?: number; droop?: V3; fine?: number; rest?: (p: V3, dir: V3) => number } = {}): { mesh: PipeMesh; top: V3 } {
  const g = stream(seed);
  const n = norm(n0);
  const u = norm(sub(u0, mul(n, dot(u0, n))));
  const v = cross(n, u);
  const turns = (opts.turns ?? 1.25) + 0.12 * g.s();
  const dirS = g.r() < 0.5 ? 1 : -1;
  const rope = (opts.rope ?? 0.36) * R * (1 + 0.06 * g.s());
  const a0 = g.r() * 2 * Math.PI;
  const off: V3 = add(mul(u, 0.06 * R * g.s()), mul(v, 0.06 * R * g.s()));
  const L = Math.round(72 * turns * (opts.fine ?? 1));
  const feet: Foot[] = [];
  const pathR = R - rope * 0.95;
  const centres: V3[] = [];
  const lifts: number[] = [];
  const tw0 = 0.5 * g.s(), amp = 0.42 + 0.05 * g.s();
  // v1.6 polish (the judge's fix 4): the rope's half-width along it, so the path never turns tighter
  // than the rope is wide (a tighter turn folds the sweep through itself: the crumpled centres).
  // (The start's rounded cap counts at full width: the rope starts with its inner flank on the centre.)
  // (A start 18 % fat: the old 35 % blob stood taller than the tail riding over it, which cut through it.)
  const press = (s: number) => pressure(s, 2 * Math.PI * pathR * turns, seed + 8, { swell: 0.07, start: 0.18, hiccups: 0.25 });
  const halfW = (s: number) => rope * 0.98 * press(s) * (s < 0.5 ? 1 : taper(s, 0.06, 0.16, 0.22).k);
  // Where the rope comes round over its own start, it rides on it: lifted by most of the height of
  // the loop under it (pressed into it by its own sink).
  const once = 1 / turns;
  const under = (s: number) => (s <= once ? 0 : rope * 1.35 * press(s - once) * taper(s - once, 0.06, 0.16, 0.22).k);
  // The tail eases off round the outside of the first loop (each its own reach), tapering along it:
  // it never cuts back across the centre (that fold was the crumpled centre).
  const tailOut = 0.05 + 0.08 * g.r();
  for (let i = 0; i < L; i++) {
    const s = i / (L - 1);
    const ang = a0 + dirS * 2 * Math.PI * turns * s;
    // Out from the centre over the first quarter turn, then round at the rosette's radius, a hair
    // wider each turn; the tail draws in a little and rides up over the start, then lies on it.
    const grow = smooth(0, 0.26, s);
    let rr = pathR * grow * (1 + 0.05 * Math.sin(3 * ang + seed) + 0.04 * s + tailOut * smooth(0.78, 1, s));
    rr = Math.max(rr, 1.12 * halfW(s) + 0.15 * MM);
    const lift = rope * 0.18 * (1 - grow) + 0.9 * under(s) * smooth(once - 0.02, once + 0.08, s);
    const radial = add(mul(u, Math.cos(ang)), mul(v, Math.sin(ang)));
    centres.push(add(add(c, off), mul(radial, rr)));
    lifts.push(lift);
  }
  // Resting on what is under it: a foot a little off the surface (≤ ≈ 3 mm) is settled onto it and
  // fillets into it; one far off it (over a rounded edge) overhangs with the rope's own round
  // underside showing, as a piped rosette overhangs an edge. Settled smoothly along the rope.
  const flareK = new Array<number>(L).fill(1);
  if (opts.rest) {
    const d = centres.map((p) => opts.rest!(p, n));
    const move = d.map((x) => x * (1 - smooth(2.5 * MM, 4.5 * MM, Math.abs(x))));
    const settled = move.map((_, i) => {
      let acc = 0, w = 0;
      for (let k = -5; k <= 5; k++) { const j = clamp(i + k, 0, L - 1); const wk = 6 - Math.abs(k); acc += move[j]! * wk; w += wk; }
      return acc / w;
    });
    for (let i = 0; i < L; i++) {
      centres[i] = sub(centres[i]!, mul(n, settled[i]!));
      flareK[i] = 1 - smooth(1 * MM, 3 * MM, Math.abs(d[i]! - settled[i]!));
    }
  }
  const T = tangents(centres);
  for (let i = 0; i < L; i++) {
    const s = i / (L - 1);
    const { k, dive } = taper(s, 0.06, 0.16, 0.22);
    const p = press(s);
    const hk = rope * 1.35 * p * k;
    // (The tail lies down on the loop under it rather than plunging through it.)
    const pc = add(centres[i]!, mul(n, lifts[i]! - dive * 0.35 * hk));
    // v1.6 polish (fix 2): where the rope overhangs the edge its underside shows, seen from behind
    // over the far side of the top: the star's teeth carry on round it.
    feet.push({ c: pc, n, t: T[i]!, w: rope * 0.98 * p * k, h: hk, sink: 0.9 * MM * (k > 0 ? Math.max(k, 0.3) : 0), tw: tw0 + 1.1 * s * dirS, amp, flare: 0.25 * flareK[i]! + 0.15 * smooth(once, once + 0.08, s), back: opts.rest ? (1 - flareK[i]!) * (1 - smooth(once, once + 0.08, s)) : 0 });
  }
  const mesh = sweep(feet, { teeth: 12 + Math.floor(g.r() * 3), crest: 0.42, toothJitter: 0.18, toothDrift: 2.5, perTooth: opts.fine ? 3.5 : opts.rest ? 3.7 : 4.2, hidden: 6, wrap: !!opts.rest }, seed);
  // The centre: the soft mound the bag pushed out before it moved off (fills the eye of the coil).
  appendMesh(mesh, pipedDot(add(add(c, off), mul(n, 0.15 * R)), n, u, 0.42 * R, seed + 23, [10, 40], 8));
  // A side rosette droops a little where it overhangs (its outer half slumps by up to `droop`).
  if (opts.droop) {
    const d = opts.droop;
    for (let i = 0; i < mesh.pos.length; i += 3) {
      const p: V3 = [mesh.pos[i]!, mesh.pos[i + 1]!, mesh.pos[i + 2]!];
      const q = sub(p, c);
      const reach = clamp(len(sub(q, mul(n, dot(q, n)))) / R, 0, 1.3);
      const out = clamp(dot(q, n) / R, 0, 1);
      const k = reach * reach * (0.6 + 0.4 * out);
      mesh.pos[i] = p[0] + d[0] * k; mesh.pos[i + 1] = p[1] + d[1] * k; mesh.pos[i + 2] = p[2] + d[2] * k;
    }
    recomputeNormals(mesh);
  }
  return { mesh, top: add(add(c, off), mul(n, rope * 1.75)) };
}

/**
 * v1.6 polish (the judge's fix 2): a crown rosette as a star-tip swirl, as it is piped on a cake's top
 * edge: started on the outside, carried round and in one and a half turns, each loop riding up on
 * the one before (a dome, not a coil of equal rings), the rope thinning as the pressure eases, and
 * pulled off at the top in a tapered tail that leans the way the bag left. `c` the centre on the
 * surface, `n` out of it, `u` any direction in it; `R` its radius. Returns the mesh and its peak.
 */
export function domedSwirl(c: V3, n0: V3, u0: V3, R: number, seed: number): { mesh: PipeMesh; top: V3; seat: V3 } {
  const g = stream(seed);
  const n = norm(n0);
  const u = norm(sub(u0, mul(n, dot(u0, n))));
  const v = cross(n, u);
  const turns = 1.55 + 0.2 * g.s();
  const dirS = g.r() < 0.5 ? 1 : -1;
  const w0 = 0.42 * R * (1 + 0.06 * g.s());
  const h0 = 1.1 * w0;
  const r0 = R - w0;
  const a0 = g.r() * 2 * Math.PI;
  // The dome: how high the loops climb (each its own), and the tail's peak over it.
  const H = (1.7 + 0.4 * g.r()) * h0;
  const peak = (0.45 + 0.3 * g.r()) * h0;
  const lean = add(mul(u, g.s()), mul(v, g.s()));
  const tw0 = g.r() * 2 * Math.PI, twist = (1.5 + 1.5 * g.r()) * dirS;
  const L = Math.round(84 * turns);
  const length = 2 * Math.PI * r0 * turns * 0.7;
  const centres: V3[] = [], ups: V3[] = [], ws: number[] = [], hs: number[] = [], ks: number[] = [];
  for (let i = 0; i < L; i++) {
    const s = i / (L - 1);
    const ang = a0 + dirS * 2 * Math.PI * turns * s;
    const p = pressure(s, length, seed + 3, { swell: 0.06, start: 0.15, hiccups: 0.2 });
    const { k } = taper(s, 0.05, 0.24, 0.1);
    // The pressure eases as the swirl climbs: the inner loop is thinner than the base.
    const thin = 1 - 0.4 * smooth(0.1, 0.8, s);
    const w = w0 * p * thin, h = h0 * p * thin;
    // In towards the centre, never tighter than the rope is wide (no fold), to the axis at the tail.
    let rr = r0 * (1 - 0.97 * Math.pow(smooth(0, 1, s), 0.9)) * (1 + 0.04 * Math.sin(3 * ang + seed));
    rr = Math.max(rr, 1.12 * w * (s < 0.7 ? 1 : k) + 0.1 * MM);
    const radial = add(mul(u, Math.cos(ang)), mul(v, Math.sin(ang)));
    // Each loop rides up on the last (a dome over the radius); the tail pulled up into a peak that
    // leans the way the bag left.
    const q = clamp(rr / r0, 0, 1);
    const lift = H * (1 - Math.pow(q, 1.6)) + peak * smooth(0.78, 1, s);
    const drift = mul(lean, 0.1 * R * smooth(0.8, 1, s));
    centres.push(add(add(add(c, mul(radial, rr)), mul(n, lift)), drift));
    // The rope's up tilts outward with the dome's slope (its inner flank pressed into the loop under it).
    const alpha = 0.85 * (1 - q) * (1 - smooth(0.8, 1, s));
    ups.push(add(mul(n, Math.cos(alpha)), mul(radial, Math.sin(alpha))));
    ws.push(w); hs.push(h); ks.push(k);
  }
  const T = tangents(centres);
  const feet: Foot[] = [];
  for (let i = 0; i < L; i++) {
    const s = i / (L - 1);
    const k = ks[i]!;
    // The section's up square to the rope (the tail climbs steeply: an up along it folds the section).
    const up = norm(sub(ups[i]!, mul(T[i]!, dot(ups[i]!, T[i]!))));
    feet.push({ c: centres[i]!, n: up, t: T[i]!, w: ws[i]! * k, h: hs[i]! * k, sink: 0.8 * MM * (k > 0 ? Math.max(k, 0.3) : 0), tw: tw0 + twist * s, amp: 0.4 + 0.05 * g.s(), flare: s < 0.3 ? 0.25 : 0.1 });
  }
  const mesh = sweep(feet, { teeth: 9 + Math.floor(g.r() * 3), crest: 0.45, toothJitter: 0.18, toothDrift: 2, perTooth: 3.6, hidden: 5 }, seed);
  // The eye under the tail: the buttercream the inner loop closed over (no hole down the middle).
  appendMesh(mesh, pipedDot(add(c, mul(n, 0.55 * H)), n, u, 0.45 * R, seed + 29, [9, 22], 9));
  // The peak: the highest point of the rope (where the tail was pulled off).
  let top: V3 = c, best = -Infinity;
  for (let i = 0; i < L; i++) {
    const tp = add(centres[i]!, mul(n, 0.55 * hs[i]! * ks[i]!));
    const ht = dot(sub(tp, c), n) - 0.3 * len(sub(sub(tp, c), mul(n, dot(sub(tp, c), n))));
    if (ht > best) { best = ht; top = tp; }
  }
  // Where a pearl is pressed in: on the dome's crown, on the side away from where the tail leans.
  const away = norm(sub(c, sub(top, mul(n, dot(sub(top, c), n)))));
  const seat = add(add(c, mul(n, 0.55 * H + 0.3 * R)), mul(len(sub(top, c)) > 1e-9 && Number.isFinite(away[0]) ? away : u, 0.38 * R));
  return { mesh, top, seat };
}

// ── Dots ──────────────────────────────────────────────────────────────────────────────
/**
 * A dot piped with a round tip: a soft dome pressed into the surface with a fillet, and the little
 * peak the bag leaves as it is lifted away, which droops (`down`, along the surface) under its own
 * weight. `c` on the surface, `n` out of it; `R` the dome's radius.
 */
export function pipedDot(c: V3, n0: V3, down0: V3, R: number, seed: number, res: [number, number] = [16, 40], teeth = 0): PipeMesh {
  const g = stream(seed);
  const n = norm(n0);
  const down = norm(sub(down0, mul(n, dot(down0, n))));
  const side = cross(n, down);
  // v1.6 polish (fix 4): finer, so the rim and the peak shade smoothly close up.
  const [I, J] = res;
  const H = R * (0.78 + 0.12 * g.s());
  const peak = R * (0.14 + 0.2 * g.r());
  // v1.6 polish (fix 2): the bag leaves each dot its own way (the peak leans anywhere, mostly down).
  const pa = Math.PI * 0.9 * g.s();
  const peakDir = mul(add(mul(down, Math.cos(pa)), mul(side, Math.sin(pa))), 0.3 + 0.45 * g.r());
  const ecc = 1 + 0.08 * g.s(), eAng = g.r() * Math.PI;
  const P: V3[][] = [], RG: number[][] = [];
  const along: V3[] = [];
  for (let i = 0; i <= I; i++) {
    // i = 0 the peak's tip … i = I the foot (a little beyond R, where the fillet meets the surface).
    const q = i / I;
    const row: V3[] = [], rg: number[] = [];
    for (let j = 0; j < J; j++) {
      const a = (2 * Math.PI * j) / J;
      const lob = 1 + 0.05 * Math.sin(2 * a + seed) + 0.04 * Math.sin(3 * a + 2 * seed);
      const ell = 1 + (ecc - 1) * Math.cos(2 * (a - eAng));
      // A star tip's kiss (the eye of a rosette or swirl): its teeth run from the peak to the foot,
      // turning a little as the bag was lifted.
      const star = teeth ? 1 + 0.16 * (Math.pow(0.5 - 0.5 * Math.cos(teeth * (a + 0.6 * q)), 0.6) - 0.6) * Math.min(1, q / 0.3) : 1;
      const rho = q * R * lob * ell * star;
      // Dome (1 − ρ²)^0.75 over the peak's gaussian; a concave fillet in the last 15 %.
      const x = Math.min(q, 1);
      let z = H * Math.pow(Math.max(0, 1 - x * x), 0.72) + peak * Math.exp(-((q / 0.2) ** 2));
      let rr = rho;
      if (q > 0.86) { const f = (q - 0.86) / 0.14; rr += 0.18 * R * f * f; z = z * (1 - f) - 0.45 * MM * f; }
      // The peak leans the way it was pulled, and droops.
      const lean = mul(peakDir, peak * 0.9 * Math.exp(-((q / 0.35) ** 2)));
      const dir = add(mul(down, Math.cos(a)), mul(side, Math.sin(a)));
      row.push(add(add(add(c, mul(dir, rr)), mul(n, z)), lean));
      rg.push(teeth ? clamp((star - 1) / 0.064, -1, 1) : 0.5 - q);
    }
    P.push(row);
    RG.push(rg);
    along.push(mul(n, -1));
  }
  // The foot ring stays open under the surface it is pressed into (a closing fan there only
  // confused the rim's orientation).
  return gridMesh(P, RG, true, along);
}

// ── The base: a smear and a crumb or two on the plate ────────────────────────────────────
/**
 * Where a hand-coated cake meets its stand there is always a little evidence: a thin smear of the
 * coat dragged out past the border by the scraper (0.2–0.6 mm thick, 8–15 mm long, streaked along
 * the drag, thicker where it was deposited) and a crumb or two of buttercream. On a plate whose top
 * is at `yPlate`, just past `r0` (scan units), at the angles given (radians, the master's frame).
 */
export function baseSmears(yPlate: number, r0: number, seed: number, smearAt: number[], crumbAt: number[]): PipeMesh {
  const out = emptyMesh();
  const g = stream(seed);
  for (let k = 0; k < smearAt.length; k++) {
    const th = smearAt[k]! + 0.05 * g.s();
    // v1.6 polish (fix 4): a film, not a chip: 10–16 mm long, thickest (≤ 0.3 mm) where it was
    // deposited, feathering to nothing at its outline, streaked along the drag (the scraper's teeth
    // left grooves in it and fingers at its tail).
    const lenS = (10 + 6 * g.r()) * MM, wid = (2.2 + 1.4 * g.r()) * MM, H = (0.16 + 0.14 * g.r()) * MM;
    // Dragged out from under the border, a little across.
    const yaw = (g.r() < 0.5 ? 1 : -1) * (0.9 + 0.4 * g.r());
    const rc = r0 + (0.5 + 1.5 * g.r()) * MM;
    const c: V3 = [rc * Math.cos(th), yPlate, rc * Math.sin(th)];
    const tan: V3 = [-Math.sin(th), 0, Math.cos(th)], rad: V3 = [Math.cos(th), 0, Math.sin(th)];
    const along = add(mul(tan, Math.cos(yaw)), mul(rad, Math.sin(yaw) * 0.6));
    const across = norm(cross([0, 1, 0], along));
    const I = 44, J = 30;
    const P: V3[][] = [], RG: number[][] = [], dir: V3[] = [];
    const sk = seed + 31 * k;
    for (let i = 0; i <= I; i++) {
      const u = i / I;
      // Outline: round where it was deposited, drawn out to a ragged, fingered tail.
      const wU = wid * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.02)), 0.5) * (1 - 0.45 * u) * (1 + 0.18 * noise1(u * 5, sk));
      const row: V3[] = [], rg: number[] = [];
      for (let j = 0; j <= J; j++) {
        const v = (2 * j) / J - 1;
        const x = v * wU * (1 + 0.1 * noise1(u * 9 + v * 3, sk + 5));
        // Streaks along the drag (fine grooves and the odd finger reaching further).
        const streak = 0.45 * noise1(v * 9 + 11, sk + 9) + 0.25 * noise1(v * 23 + 3, sk + 13);
        const finger = 1 - smooth(0.55 + 0.35 * (0.5 + 0.5 * noise1(v * 6 + 1, sk + 17)), 1, u);
        const body = Math.pow(Math.max(0, 1 - v * v), 1.6) * (0.35 + 0.8 * (1 - u)) * finger;
        // Feathered: the film thins to a few microns at its edge, lying on (a hair into) the plate.
        const h = H * body * (1 + streak * smooth(0.05, 0.4, u)) - 0.012 * MM;
        const p = add(add(add(c, mul(along, (u - 0.3) * lenS)), mul(across, x)), [0, h, 0]);
        row.push(p);
        // The ridge channel carries the film's thickness (−1 feathered to nothing … 1 the deposit).
        rg.push(clamp(2 * Math.min(1, (h + 0.012 * MM) / H) - 1, -1, 1));
      }
      P.push(row);
      RG.push(rg);
      dir.push(along);
    }
    appendMesh(out, gridMesh(P, RG, false, dir, [0, 1, 0]));
  }
  // Crumbs: knocked off the border, porous (air in the whipped butter), lumpy, a millimetre or so.
  for (let k = 0; k < crumbAt.length; k++) {
    const th = crumbAt[k]! + 0.05 * g.s();
    const rc = r0 + (3 + 6 * g.r()) * MM;
    const c: V3 = [rc * Math.cos(th), yPlate - 0.15 * MM, rc * Math.sin(th)];
    appendMesh(out, crumb(c, (0.6 + 0.5 * g.r()) * MM, seed + 97 * k));
  }
  return out;
}

/**
 * A crumb of buttercream on the plate (v1.6 polish, fix 4): a lumpy blob `R` across, flattened where
 * it landed, its surface pitted by the air whipped into the butter (pores of ≈ 0.1–0.2 mm).
 */
export function crumb(c: V3, R: number, seed: number): PipeMesh {
  const g = stream(seed);
  const I = 14, J = 28;
  const P: V3[][] = [], RG: number[][] = [], along: V3[] = [];
  const sq = 0.55 + 0.2 * g.r();
  for (let i = 0; i <= I; i++) {
    const ph = (i / I) * Math.PI;
    const row: V3[] = [], rg: number[] = [];
    for (let j = 0; j < J; j++) {
      const a = (2 * Math.PI * j) / J;
      const d: V3 = [Math.sin(ph) * Math.cos(a), Math.cos(ph), Math.sin(ph) * Math.sin(a)];
      const q: V3 = [d[0] * 3 + seed % 7, d[1] * 3, d[2] * 3];
      const lump = 0.22 * (noise1(q[0] + 2.1 * q[1], seed) + 0.6 * noise1(q[2] * 1.7 - q[1], seed + 3));
      const pore = 0.12 * Math.min(0, noise1(q[0] * 4.3 + q[2] * 3.1 + q[1] * 5, seed + 5) + 0.2);
      const r = R * (1 + lump + pore);
      // Flattened below (it sits on the plate, a hair into it).
      const y = d[1] < 0 ? d[1] * r * 0.25 : d[1] * r * sq;
      row.push([c[0] + d[0] * r, c[1] + y, c[2] + d[2] * r]);
      rg.push(pore < -0.02 ? -1 : 0);
    }
    P.push(row);
    RG.push(rg);
    along.push([0, -1, 0]);
  }
  const m = gridMesh(P, RG, true, along);
  for (let i = 0; i < m.pos.length; i += 3) {
    const d = sub([m.pos[i]!, m.pos[i + 1]!, m.pos[i + 2]!], c);
    if (dot([m.nrm[i]!, m.nrm[i + 1]!, m.nrm[i + 2]!], d) < 0) { m.nrm[i] = -m.nrm[i]!; m.nrm[i + 1] = -m.nrm[i + 1]!; m.nrm[i + 2] = -m.nrm[i + 2]!; }
  }
  orientMesh(m);
  return m;
}

/**
 * The back of a rosette piped on a tier's edge: a soft squashed dome behind its coil (centre `c`,
 * axis `n` out of the coil), so from behind it reads as the rounded mass of buttercream the coil
 * was piped with, not the flat underside of a spiral. Mostly hidden inside the coil and the cake.
 */
export function backMound(c: V3, n0: V3, R: number, seed: number): PipeMesh {
  const n = norm(n0);
  const u = norm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const v = cross(n, u);
  // v1.6 polish (fix 2): the mass behind is the coil's own rope seen from behind, so it carries its
  // loops (a spiral of rope wrapping round the axis, ridged along its length), not a plain hump, a
  // little inside the coil's outline.
  const I = 30, J = 40;
  const g = stream(seed + 5);
  const loops = 4 + 0.8 * g.r(), dirL = g.r() < 0.5 ? 1 : -1, ph0 = g.r();
  const centre = sub(c, mul(n, 0.12 * R));
  const P: V3[][] = [], RG: number[][] = [], along: V3[] = [];
  for (let i = 0; i <= I; i++) {
    // From the pole out of the coil (i = 0) round to the pole behind it (i = I).
    const ph = (i / I) * Math.PI;
    const row: V3[] = [], rg: number[] = [];
    for (let j = 0; j < J; j++) {
      const a = (2 * Math.PI * j) / J;
      const wob = 1 + 0.05 * noise1(a * 2.2 + i * 0.3, seed) + 0.03 * Math.sin(3 * a + seed);
      // Loops (ridges round the axis, advancing one loop a turn) with the star's finer teeth on them.
      const fr = loops * (ph / Math.PI) + dirL * a / (2 * Math.PI) + ph0;
      const loop = Math.pow(0.5 - 0.5 * Math.cos(2 * Math.PI * fr), 0.45);
      const crest = 0.8 * loop + 0.2 * Math.pow(0.5 - 0.5 * Math.cos(2 * Math.PI * 4 * fr), 0.6);
      // The ridges fade at the poles (where they converge) and stand ≈ 0.6 mm proud on the flank.
      const fade = Math.sin(ph) ** 1.5;
      const ridge = 0.16 * R * (crest - 0.6) * fade;
      const rr = (0.74 * R * Math.sin(ph) + ridge * Math.sin(ph)) * wob;
      const z = (ph < Math.PI / 2 ? 0.35 : 0.55) * R * Math.cos(ph) + ridge * Math.cos(ph);
      row.push(add(add(centre, mul(n, z)), add(mul(u, rr * Math.cos(a)), mul(v, rr * Math.sin(a)))));
      rg.push(clamp((crest - 0.6) / 0.4, -1, 1) * fade);
    }
    P.push(row);
    RG.push(rg);
    along.push(mul(n, -1));
  }
  const m = gridMesh(P, RG, true, along);
  // gridMesh orients by each row's centre; the poles' rows are points: orient those by the dome.
  for (let i = 0; i < m.pos.length; i += 3) {
    const d = sub([m.pos[i]!, m.pos[i + 1]!, m.pos[i + 2]!], centre);
    if (dot([m.nrm[i]!, m.nrm[i + 1]!, m.nrm[i + 2]!], d) < 0) { m.nrm[i] = -m.nrm[i]!; m.nrm[i + 1] = -m.nrm[i + 1]!; m.nrm[i + 2] = -m.nrm[i + 2]!; }
  }
  orientMesh(m);
  return m;
}
