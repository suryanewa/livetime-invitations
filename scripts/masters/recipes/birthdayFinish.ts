/**
 * v1.5 Birthday: the hand finish of the cake master (scripts/masters/recipes/birthday.ts runs it as
 * the master's `transform`, in the master's own scan units, before it is placed).
 *
 * Owner's note (v1.5, edit #3): "The birthday cake reads like plastic and seems too geometrically
 * perfect — add texture and imperfection without overdoing it." What a real piped buttercream cake
 * has that the master did not (reference notes in docs/scenes/birthday-v1.5-cake.md):
 *
 * - Tiers rebuilt as dense lathes from the master's own profile (the master's top was a three-ring
 *   fan: nothing could deform it), with a UV atlas laid out for a physical relief: the sides in
 *   v 0.02–0.48 (one UV unit ≈ 20 cm, three repeats around), the tops in v 0.52–0.98 (planar).
 *   The top tier's top is densest (0.44 mm) in the annulus the candles stand in, so the runtime
 *   can press dimples and collars into it (models/birthday.ts, the press shader).
 * - A deterministic finish field on every frosting part (tiers, piping, rosettes, pearls), so
 *   decorations ride the surface they sit on: tiers drift ±1.4 % from round at low frequency
 *   (2θ, 3θ, 4θ and a slight barrel), each top is uneven by about ±0.7 mm (a tilt plus two soft
 *   bumps), and the side piping carries a hand wobble (≈ ±0.8 mm along, ±0.55 mm up and down).
 * - Piping beads, shells, dots, pearls and rosettes vary in size (±4–9 % about the point they
 *   touch the cake with) and the star rosettes in twist (±10°). Two rosettes are softened: their
 *   star ridges relaxed (Taubin smoothing) and the rosette slumped 8 % with a slight droop.
 * - Materials: the frosting loses the master's clearcoat (the "plastic" in the brief); the body
 *   gets a generated relief (normal map: bench-scraper streaks on the sides, offset-spatula
 *   strokes on the tops, sparse air pockets) and a roughness map 0.45–0.70 (scraped ridges a touch
 *   glossier than the troughs, pockets matt); piping and rosettes get a very slight sheen and a
 *   per-vertex convexity (`_RIDGE`) the runtime uses to make ridges glossier than grooves.
 * - Candles re-tessellated (30 → 128 segments, 2.2 → 0.39 mm rows) from the master's own twisted
 *   six-flute surface, with a `_PROFILE` parameter the runtime melt shader deforms.
 *
 * Everything is a pure function of the master and fixed seeds: `pnpm models birthday` is
 * deterministic.
 */
import type { Accessor, Document, Material, Primitive } from '@gltf-transform/core';
import { KHRMaterialsSheen } from '@gltf-transform/extensions';
import { MASTER_CANDLES } from '../../../models/birthdayContract.ts';
import { loadSharp } from '../sharp.ts';

type V3 = [number, number, number];

// ── Deterministic randomness ───────────────────────────────────────────────────────
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
/**
 * Gradient (Perlin) noise in about [-1, 1]; `px` makes it periodic in x with that many cells.
 * Gradient, not value, noise: the roughness map reads the relief's high-pass, and value noise's
 * derivatives show its lattice as a checkerboard.
 */
function vnoise(x: number, y: number, seed: number, px = 0): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const wrap = (i: number) => (px ? ((i % px) + px) % px : i);
  const g = (ix: number, iy: number, dx: number, dy: number) => {
    const a = hash2(wrap(ix), iy, seed) * 2 * Math.PI;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const u = fade(fx), v = fade(fy);
  const n00 = g(x0, y0, fx, fy), n10 = g(x0 + 1, y0, fx - 1, fy);
  const n01 = g(x0, y0 + 1, fx, fy - 1), n11 = g(x0 + 1, y0 + 1, fx - 1, fy - 1);
  return 1.6 * (n00 + (n10 - n00) * u + (n01 - n00) * v + (n00 - n10 - n01 + n11) * u * v);
}

function fbm(x: number, y: number, seed: number, octaves: number, px = 0): number {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    s += amp * vnoise(x * f, y * f, seed + o * 101, px ? px * f : 0);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return s / norm;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

// ── Accessor helpers ───────────────────────────────────────────────────────────────
function read(acc: Accessor): Float32Array {
  const n = acc.getCount(), k = acc.getElementSize();
  const out = new Float32Array(n * k);
  const e = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) {
    acc.getElement(i, e);
    for (let j = 0; j < k; j++) out[i * k + j] = e[j]!;
  }
  return out;
}

function accessor(doc: Document, type: 'SCALAR' | 'VEC2' | 'VEC3', array: Float32Array | Uint32Array): Accessor {
  return doc.createAccessor().setType(type).setArray(array as Float32Array<ArrayBuffer>).setBuffer(doc.getRoot().listBuffers()[0]!);
}

function setGeometry(doc: Document, prim: Primitive, g: { pos: number[]; nrm: number[]; uv: number[]; idx: number[]; extra?: Record<string, number[]> }): void {
  for (const sem of prim.listSemantics()) prim.setAttribute(sem, null);
  prim.setAttribute('POSITION', accessor(doc, 'VEC3', new Float32Array(g.pos)));
  prim.setAttribute('NORMAL', accessor(doc, 'VEC3', new Float32Array(g.nrm)));
  prim.setAttribute('TEXCOORD_0', accessor(doc, 'VEC2', new Float32Array(g.uv)));
  for (const [name, values] of Object.entries(g.extra ?? {})) prim.setAttribute(name, accessor(doc, 'SCALAR', new Float32Array(values)));
  prim.setIndices(accessor(doc, 'SCALAR', new Uint32Array(g.idx)));
}

// ── The cake's geometry, as the master builds it (scan units) ─────────────────────
type TierId = 'bottom' | 'top';
interface TierSpec {
  /** Side radius, underside and top-surface heights of the tier body. */
  R: number;
  y0: number;
  y1: number;
  /** Repeats of the side relief around the tier (≈ 20 cm each at CAKE_SCALE). */
  repeats: number;
  /** Planar map radius of the top (fills the atlas' top square). */
  mapR: number;
}
export const TIERS: Record<TierId, TierSpec> = {
  bottom: { R: 0.567, y0: -0.2455, y1: 0.191, repeats: 3, mapR: 0.57 },
  top: { R: 0.43, y0: 0.182, y1: 0.603, repeats: 3, mapR: 0.43 },
};

/** Candle sockets (master scan space): the radius they stand on and their angles about the cake axis. */
const SOCKET_R = Math.hypot(MASTER_CANDLES[0].x, MASTER_CANDLES[0].z);
const SOCKET_ANGLES = MASTER_CANDLES.map(({ x, z }) => Math.atan2(z, x));

/**
 * The finish field (fixed seeds; amplitudes in scan units, 1 scan unit = 22 cm at CAKE_SCALE 1.1).
 * Drift: radius × (1 + Σ a·cos(mθ + φ) + barrel), faded in over the outer quarter of the tier so
 * the candle sockets stay where the master put them. Top: Δy = tilt + bumps, faded in over the top
 * 1.1 cm of the side (scraped tops are slightly uneven; the sides below stay level).
 */
interface Field {
  drift: { m: number; a: number; phase: number }[];
  barrel: number;
  tilt: { a: number; phase: number };
  bumps: { x: number; z: number; s: number; a: number }[];
}
export const FIELDS: Record<TierId, Field> = {
  bottom: {
    drift: [{ m: 2, a: 0.0058, phase: 0.7 }, { m: 3, a: 0.0042, phase: 2.9 }, { m: 4, a: 0.0018, phase: 4.4 }],
    barrel: 0.0022,
    tilt: { a: 0.0016, phase: 2.2 },
    bumps: [{ x: 0.5, z: 0.12, s: 0.07, a: 0.0018 }, { x: -0.36, z: 0.4, s: 0.08, a: -0.0016 }],
  },
  top: {
    drift: [{ m: 2, a: 0.0052, phase: 3.6 }, { m: 3, a: 0.0044, phase: 1.1 }, { m: 4, a: 0.0021, phase: 5.3 }],
    barrel: 0.0018,
    tilt: { a: 0.0019, phase: 0.9 },
    bumps: [{ x: 0.12, z: -0.2, s: 0.11, a: 0.0017 }, { x: -0.2, z: 0.16, s: 0.1, a: -0.0014 }],
  },
};

/** Relative radius drift of a tier at angle θ and height y (fraction of R; peak ≈ ±1.4 %). */
export function radialDrift(tier: TierId, theta: number, y: number): number {
  const T = TIERS[tier], F = FIELDS[tier];
  const yy = clamp((y - T.y0) / (T.y1 - T.y0), 0, 1);
  let d = F.barrel * ((2 * yy - 1) ** 2 - 1 / 3);
  // The ovality leans a little with height (a hand-scraped side is never a perfect cylinder).
  for (const k of F.drift) d += k.a * Math.cos(k.m * theta + k.phase + 0.35 * (yy - 0.5) * k.m);
  return d;
}

/** Height offset of a tier's top surface at (x, z) (scan units; ≈ ±0.0032 = ±0.7 mm). */
export function topUneven(tier: TierId, x: number, z: number): number {
  const T = TIERS[tier], F = FIELDS[tier];
  let t = (F.tilt.a * (x * Math.cos(F.tilt.phase) + z * Math.sin(F.tilt.phase))) / T.R;
  for (const b of F.bumps) t += b.a * Math.exp(-((x - b.x) ** 2 + (z - b.z) ** 2) / (2 * b.s * b.s));
  // The bottom tier's top under the upper tier carries its weight flat: only the exposed ledge waves.
  if (tier === 'bottom') t *= smoothstep(0.44, 0.5, Math.hypot(x, z));
  return t;
}

/** Hand wobble of side piping: along the surface (tangential) and up/down, scan units. */
function wobble(tier: TierId, theta: number, y: number): [number, number] {
  const seed = tier === 'top' ? 71 : 37;
  const R = TIERS[tier].R;
  // ~1.8 cm wavelength around (about one bead pitch), 3 cm up and down.
  const cells = Math.round((2 * Math.PI * R) / 0.082);
  const u = (theta / (2 * Math.PI)) * cells;
  return [0.0035 * fbm(u, y / 0.14, seed, 2, cells), 0.0025 * fbm(u + 17.3, y / 0.14, seed + 9, 2, cells)];
}

type Kind = 'body' | 'side' | 'ledge' | 'crown';
/** The finish field: where a frosting point at `p` (scan units) goes. */
export function finishPoint(p: V3, tier: TierId, kind: Kind, out: V3 = [0, 0, 0]): V3 {
  const T = TIERS[tier];
  const [x, y, z] = p;
  const r = Math.hypot(x, z);
  const theta = Math.atan2(z, x);
  const dr = T.R * radialDrift(tier, theta, y) * smoothstep(0.75 * T.R, 0.92 * T.R, r);
  const dy = topUneven(tier, x, z) * smoothstep(T.y1 - 0.05, T.y1 - 0.004, y);
  let dt = 0, dw = 0;
  if (kind === 'side' || kind === 'ledge') {
    const w = wobble(tier, theta, y);
    dt = w[0];
    // Piping resting on a ledge (shell borders) only slides along it: no vertical wobble.
    dw = kind === 'side' ? w[1] : 0;
  }
  const r2 = r + dr;
  const th2 = r > 1e-6 ? theta + dt / Math.max(r, 0.05) : theta;
  out[0] = r2 * Math.cos(th2);
  out[1] = y + dy + dw;
  out[2] = r2 * Math.sin(th2);
  if (r < 1e-9) { out[0] = x; out[2] = z; }
  return out;
}

/** Applies `map` to positions and transforms normals by its Jacobian (n' ∝ cof(J)·n). */
function deform(pos: Float32Array, nrm: Float32Array | null, map: (p: V3, out: V3) => V3): void {
  const p: V3 = [0, 0, 0], a: V3 = [0, 0, 0], b: V3 = [0, 0, 0];
  const J = new Float64Array(9);
  const eps = 1e-5;
  for (let i = 0; i < pos.length / 3; i++) {
    p[0] = pos[3 * i]!; p[1] = pos[3 * i + 1]!; p[2] = pos[3 * i + 2]!;
    if (nrm) {
      for (let c = 0; c < 3; c++) {
        const q0: V3 = [p[0], p[1], p[2]], q1: V3 = [p[0], p[1], p[2]];
        q0[c] = q0[c]! - eps; q1[c] = q1[c]! + eps;
        map(q0, a); map(q1, b);
        for (let rr = 0; rr < 3; rr++) J[rr * 3 + c] = (b[rr]! - a[rr]!) / (2 * eps);
      }
      const n0 = nrm[3 * i]!, n1 = nrm[3 * i + 1]!, n2 = nrm[3 * i + 2]!;
      // Cofactor matrix of J (= det·J^{-T}).
      const c00 = J[4]! * J[8]! - J[5]! * J[7]!, c01 = J[5]! * J[6]! - J[3]! * J[8]!, c02 = J[3]! * J[7]! - J[4]! * J[6]!;
      const c10 = J[2]! * J[7]! - J[1]! * J[8]!, c11 = J[0]! * J[8]! - J[2]! * J[6]!, c12 = J[1]! * J[6]! - J[0]! * J[7]!;
      const c20 = J[1]! * J[5]! - J[2]! * J[4]!, c21 = J[2]! * J[3]! - J[0]! * J[5]!, c22 = J[0]! * J[4]! - J[1]! * J[3]!;
      const m0 = c00 * n0 + c01 * n1 + c02 * n2, m1 = c10 * n0 + c11 * n1 + c12 * n2, m2 = c20 * n0 + c21 * n1 + c22 * n2;
      const l = Math.hypot(m0, m1, m2) || 1;
      nrm[3 * i] = m0 / l; nrm[3 * i + 1] = m1 / l; nrm[3 * i + 2] = m2 / l;
    }
    map(p, a);
    pos[3 * i] = a[0]; pos[3 * i + 1] = a[1]; pos[3 * i + 2] = a[2];
  }
}

// ── Tier rebuild: a dense lathe of the master's own profile ───────────────────────
interface ProfilePoint { r: number; y: number; nr: number; ny: number }

/** The master tier's profile rings (it is a 160-segment lathe), bottom centre → top centre. */
function masterProfile(prim: Primitive): ProfilePoint[] {
  const pos = read(prim.getAttribute('POSITION')!), nrm = read(prim.getAttribute('NORMAL')!), uv = read(prim.getAttribute('TEXCOORD_0')!);
  const rings = new Map<number, { r: number; y: number; nr: number; ny: number; n: number }>();
  for (let i = 0; i < pos.length / 3; i++) {
    const v = Math.round(uv[2 * i + 1]! * 1e4);
    const x = pos[3 * i]!, y = pos[3 * i + 1]!, z = pos[3 * i + 2]!;
    const r = Math.hypot(x, z);
    const nr = r > 1e-6 ? (nrm[3 * i]! * x + nrm[3 * i + 2]! * z) / r : 0;
    const k = rings.get(v) ?? { r: 0, y: 0, nr: 0, ny: 0, n: 0 };
    k.r += r; k.y += y; k.nr += nr; k.ny += nrm[3 * i + 1]!; k.n++;
    rings.set(v, k);
  }
  return [...rings.entries()].sort((a, b) => a[0] - b[0]).map(([, k]) => {
    const l = Math.hypot(k.nr, k.ny) || 1;
    return { r: k.r / k.n, y: k.y / k.n, nr: k.nr / l, ny: k.ny / l };
  });
}

/** Catmull-Rom between profile points, with normals interpolated by angle. */
function refineProfile(pts: ProfilePoint[], maxStep: number): ProfilePoint[] {
  const out: ProfilePoint[] = [pts[0]!];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const len = Math.hypot(p2.r - p1.r, p2.y - p1.y);
    const n = Math.max(1, Math.ceil(len / maxStep));
    const a1 = Math.atan2(p1.ny, p1.nr), a2 = Math.atan2(p2.ny, p2.nr);
    for (let k = 1; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      // Straight runs (the sides) stay exactly straight: linear when the neighbours are collinear.
      const straight = Math.abs(a1 - a2) < 0.05;
      const r = straight ? p1.r + (p2.r - p1.r) * t : cr(p0.r, p1.r, p2.r, p3.r);
      const y = straight ? p1.y + (p2.y - p1.y) * t : cr(p0.y, p1.y, p2.y, p3.y);
      const a = a1 + (a2 - a1) * t;
      out.push({ r, y, nr: Math.cos(a), ny: Math.sin(a) });
    }
  }
  return out;
}

/** Monotone cubic (Fritsch–Carlson) through (x, y) knots, x ascending. */
function monotone(xs: number[], ys: number[]): (x: number) => [number, number] {
  const n = xs.length, d: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!));
  m.push(d[0]!);
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2);
  m.push(d[n - 2]!);
  return (x: number) => {
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]!) i++;
    const h = xs[i + 1]! - xs[i]!, t = clamp((x - xs[i]!) / h, 0, 1);
    const t2 = t * t, t3 = t2 * t;
    const y = (2 * t3 - 3 * t2 + 1) * ys[i]! + (t3 - 2 * t2 + t) * h * m[i]! + (-2 * t3 + 3 * t2) * ys[i + 1]! + (t3 - t2) * h * m[i + 1]!;
    const dy = ((6 * t2 - 6 * t) * ys[i]! + (3 * t2 - 4 * t + 1) * h * m[i]! + (-6 * t2 + 6 * t) * ys[i + 1]! + (3 * t2 - 2 * t) * h * m[i + 1]!) / h;
    return [y, dy];
  };
}

interface Mesh { pos: number[]; nrm: number[]; uv: number[]; idx: number[] }

/** Triangulates between two closed rings of vertex indices sorted by angle (both starting at angle 0). */
function zipper(idx: number[], a: number[], aAng: number[], b: number[], bAng: number[]): void {
  let i = 0, j = 0;
  const na = a.length, nb = b.length;
  const angA = (k: number) => (k < na ? aAng[k]! : aAng[k - na]! + 2 * Math.PI);
  const angB = (k: number) => (k < nb ? bAng[k]! : bAng[k - nb]! + 2 * Math.PI);
  while (i < na || j < nb) {
    if (j >= nb || (i < na && angA(i + 1) <= angB(j + 1))) {
      idx.push(a[i % na]!, b[j % nb]!, a[(i + 1) % na]!);
      i++;
    } else {
      idx.push(a[i % na]!, b[j % nb]!, b[(j + 1) % nb]!);
      j++;
    }
  }
}

/** θ samples for one ring: uniform at `step` (arc length) or, in the socket band, dense near sockets. */
function ringAngles(r: number, step: number, dense?: { step: number; reach: number }): number[] {
  if (!dense) {
    const n = Math.max(12, Math.ceil((2 * Math.PI * r) / step));
    return Array.from({ length: n }, (_, k) => (2 * Math.PI * k) / n);
  }
  const at = (th: number) => {
    let d = Infinity;
    for (const s of SOCKET_ANGLES) d = Math.min(d, Math.abs(Math.atan2(Math.sin(th - s), Math.cos(th - s))) * r);
    const k = smoothstep(dense.reach * 0.7, dense.reach, d);
    return (dense.step + (step - dense.step) * k) / r;
  };
  const raw: number[] = [];
  for (let th = 0; th < 2 * Math.PI; th += at(th)) raw.push(th);
  // Close the loop evenly: stretch so the last gap matches its neighbour.
  const s = (2 * Math.PI) / (raw[raw.length - 1]! + at(raw[raw.length - 1]!));
  return raw.map((t) => t * s);
}

/**
 * Rebuilds a master tier (a 160-segment lathe whose top is a three-ring fan) as a dense lathe of
 * the same profile: 256 segments around, rings ≤ 1.2 cm apart on the sides; the top as polar rings
 * (planar UVs), with the candle annulus of the top tier at 0.002 (0.44 mm).
 */
function rebuildTier(prim: Primitive, tier: TierId): Mesh {
  const T = TIERS[tier];
  const prof = masterProfile(prim);
  // The cap: the last ring before the top's flat (ny ≈ 1) start, then the master's cap rings.
  const capStart = prof.findIndex((p, i) => i > 2 && p.ny > 0.995);
  const lathe = prof.slice(0, capStart + 1);
  const cap = prof.slice(capStart);
  // Bottom cap (hidden on the tier below or the plate): centre and edge only; then refine the rest.
  const firstEdge = lathe.findIndex((p) => p.ny > -0.995);
  const bottom = lathe.slice(0, firstEdge);
  const rest = refineProfile(lathe.slice(firstEdge - 1), 0.012);
  const rings = [...bottom.slice(0, -1), ...rest];
  // Arc length for the side's v.
  const s: number[] = [0];
  for (let i = 1; i < rings.length; i++) s.push(s[i - 1]! + Math.hypot(rings[i]!.r - rings[i - 1]!.r, rings[i]!.y - rings[i - 1]!.y));
  const s0 = s[bottom.length - 1]!, s1 = s[s.length - 1]!;

  const m: Mesh = { pos: [], nrm: [], uv: [], idx: [] };
  const N = 256;
  const ringStart: number[] = [];
  rings.forEach((p, k) => {
    ringStart.push(m.pos.length / 3);
    const v = 0.02 + (0.46 * clamp(s[k]! - s0, 0, s1 - s0)) / (s1 - s0);
    for (let j = 0; j <= N; j++) {
      const th = (2 * Math.PI * j) / N;
      const c = Math.cos(th), sn = Math.sin(th);
      m.pos.push(p.r * c, p.y, p.r * sn);
      m.nrm.push(p.nr * c, p.ny, p.nr * sn);
      m.uv.push((T.repeats * j) / N, v);
    }
  });
  for (let k = 0; k < rings.length - 1; k++) {
    const a = ringStart[k]!, b = ringStart[k + 1]!;
    for (let j = 0; j < N; j++) m.idx.push(a + j, b + j, a + j + 1, a + j + 1, b + j, b + j + 1);
  }

  // The top: polar rings from the edge ring inwards, planar UVs (u along +x, v along −z).
  const edge = rings[rings.length - 1]!;
  const ys = monotone([...cap].reverse().map((p) => p.r), [...cap].reverse().map((p) => p.y));
  const band = tier === 'top' ? { lo: SOCKET_R - 0.04, hi: SOCKET_R + 0.04 } : null;
  const radii: number[] = [edge.r];
  for (let r = edge.r; r > 0.012;) {
    const inBand = band && r <= band.hi + 0.002 && r >= band.lo - 0.002;
    const near = band && r > band.lo - 0.03 && r < band.hi + 0.03;
    r -= inBand ? 0.002 : near ? 0.005 : 0.012;
    if (r > 0.006) radii.push(r);
  }
  const capVertex = (x: number, z: number) => {
    const r = Math.hypot(x, z);
    const [y, dy] = ys(Math.min(r, edge.r));
    const nx = r > 1e-9 ? -dy * (x / r) : 0, nz = r > 1e-9 ? -dy * (z / r) : 0;
    const l = Math.hypot(nx, 1, nz);
    m.pos.push(x, y, z);
    m.nrm.push(nx / l, 1 / l, nz / l);
    m.uv.push(0.5 + (0.23 * x) / T.mapR, 0.75 - (0.23 * z) / T.mapR);
    return m.pos.length / 3 - 1;
  };
  let prevIdx: number[] = [], prevAng: number[] = [];
  radii.forEach((r, k) => {
    const inBand = band && r <= band.hi + 1e-9 && r >= band.lo - 1e-9;
    const ang = k === 0 ? Array.from({ length: N }, (_, j) => (2 * Math.PI * j) / N) : ringAngles(r, r > 0.3 ? 0.008 : 0.012, inBand ? { step: 0.002, reach: 0.05 } : undefined);
    const ids = ang.map((th) => capVertex(r * Math.cos(th), r * Math.sin(th)));
    if (k > 0) zipper(m.idx, prevIdx, prevAng, ids, ang);
    prevIdx = ids;
    prevAng = ang;
  });
  const centre = capVertex(0, 0);
  for (let j = 0; j < prevIdx.length; j++) m.idx.push(prevIdx[j]!, centre, prevIdx[(j + 1) % prevIdx.length]!);
  orient(m);
  return m;
}

/** Makes every triangle wind counter-clockwise about its vertices' normals. */
function orient(m: Mesh): void {
  const P = m.pos, Nn = m.nrm;
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = m.idx[t]!, b = m.idx[t + 1]!, c = m.idx[t + 2]!;
    const ux = P[3 * b]! - P[3 * a]!, uy = P[3 * b + 1]! - P[3 * a + 1]!, uz = P[3 * b + 2]! - P[3 * a + 2]!;
    const vx = P[3 * c]! - P[3 * a]!, vy = P[3 * c + 1]! - P[3 * a + 1]!, vz = P[3 * c + 2]! - P[3 * a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const sx = Nn[3 * a]! + Nn[3 * b]! + Nn[3 * c]!, sy = Nn[3 * a + 1]! + Nn[3 * b + 1]! + Nn[3 * c + 1]!, sz = Nn[3 * a + 2]! + Nn[3 * b + 2]! + Nn[3 * c + 2]!;
    if (nx * sx + ny * sy + nz * sz < 0) { m.idx[t + 1] = c; m.idx[t + 2] = b; }
  }
}

// ── Piping: components, size jitter, softened rosettes, convexity ─────────────────
interface PrimData { prim: Primitive; pos: Float32Array; nrm: Float32Array; idx: Uint32Array }
interface Component { verts: { d: PrimData; i: number }[]; min: V3; max: V3; centroid: V3 }

function primData(prim: Primitive): PrimData {
  return { prim, pos: read(prim.getAttribute('POSITION')!), nrm: read(prim.getAttribute('NORMAL')!), idx: new Uint32Array(prim.getIndices()!.getArray()!) };
}

/** Position-welded vertex ids (vertices split only by UV or normal seams share one id). */
function weldIds(d: PrimData): Int32Array {
  const ids = new Int32Array(d.pos.length / 3);
  const map = new Map<string, number>();
  for (let i = 0; i < ids.length; i++) {
    const k = `${Math.round(d.pos[3 * i]! * 1e6)},${Math.round(d.pos[3 * i + 1]! * 1e6)},${Math.round(d.pos[3 * i + 2]! * 1e6)}`;
    const j = map.get(k);
    ids[i] = j ?? i;
    if (j === undefined) map.set(k, i);
  }
  return ids;
}

function components(d: PrimData): Component[] {
  const n = d.pos.length / 3, parent = new Int32Array(n).map((_, i) => i);
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]!]!; a = parent[a]!; } return a; };
  const union = (a: number, b: number) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const weld = weldIds(d);
  for (let i = 0; i < n; i++) union(i, weld[i]!);
  for (let t = 0; t < d.idx.length; t += 3) { union(d.idx[t]!, d.idx[t + 1]!); union(d.idx[t]!, d.idx[t + 2]!); }
  const byRoot = new Map<number, Component>();
  const used = new Set(d.idx);
  for (const i of [...used].sort((a, b) => a - b)) {
    const r = find(i);
    let c = byRoot.get(r);
    if (!c) byRoot.set(r, (c = { verts: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], centroid: [0, 0, 0] }));
    c.verts.push({ d, i });
    for (let k = 0; k < 3; k++) { c.min[k] = Math.min(c.min[k]!, d.pos[3 * i + k]!); c.max[k] = Math.max(c.max[k]!, d.pos[3 * i + k]!); }
  }
  const out = [...byRoot.values()];
  for (const c of out) for (let k = 0; k < 3; k++) c.centroid[k] = (c.min[k]! + c.max[k]!) / 2;
  // Stable order: by angle about the cake axis, then height.
  return out.sort((a, b) => Math.atan2(a.centroid[2], a.centroid[0]) - Math.atan2(b.centroid[2], b.centroid[0]) || a.centroid[1] - b.centroid[1]);
}

/** The point a decoration touches the cake at: its inner face (side), its foot (crown) or inner foot (ledge). */
function anchorOf(c: Component, mount: 'side' | 'ledge' | 'crown'): V3 {
  const [cx, cy, cz] = c.centroid;
  const r = Math.hypot(cx, cz) || 1;
  const ex = cx / r, ez = cz / r;
  // Radial half-extent of the box along the outward direction.
  const half = (Math.abs(ex) * (c.max[0] - c.min[0]) + Math.abs(ez) * (c.max[2] - c.min[2])) / 2;
  if (mount === 'crown') return [cx, c.min[1], cz];
  if (mount === 'ledge') return [cx - ex * half, c.min[1], cz - ez * half];
  return [cx - ex * half, cy, cz - ez * half];
}

/** Rotation by `angle` about the unit axis `k` through `o`, then uniform scale `s` about `o`. */
function rigid(p: V3, o: V3, k: V3, angle: number, s: number, out: V3): V3 {
  const vx = p[0] - o[0], vy = p[1] - o[1], vz = p[2] - o[2];
  const c = Math.cos(angle), sn = Math.sin(angle), dot = k[0] * vx + k[1] * vy + k[2] * vz;
  const cx = k[1] * vz - k[2] * vy, cy = k[2] * vx - k[0] * vz, cz = k[0] * vy - k[1] * vx;
  out[0] = o[0] + s * (vx * c + cx * sn + k[0] * dot * (1 - c));
  out[1] = o[1] + s * (vy * c + cy * sn + k[1] * dot * (1 - c));
  out[2] = o[2] + s * (vz * c + cz * sn + k[2] * dot * (1 - c));
  return out;
}

function rotateNormal(n: V3, k: V3, angle: number, out: V3): V3 {
  return rigid(n, [0, 0, 0], k, angle, 1, out);
}

/** Recomputes area-weighted normals of a component, welded by position. */
function recomputeNormals(c: Component): void {
  const d = c.verts[0]!.d;
  const weld = weldIds(d);
  const set = new Set(c.verts.map((v) => v.i));
  const acc = new Map<number, V3>();
  for (let t = 0; t < d.idx.length; t += 3) {
    const a = d.idx[t]!, b = d.idx[t + 1]!, e = d.idx[t + 2]!;
    if (!set.has(a)) continue;
    const P = d.pos;
    const ux = P[3 * b]! - P[3 * a]!, uy = P[3 * b + 1]! - P[3 * a + 1]!, uz = P[3 * b + 2]! - P[3 * a + 2]!;
    const vx = P[3 * e]! - P[3 * a]!, vy = P[3 * e + 1]! - P[3 * a + 1]!, vz = P[3 * e + 2]! - P[3 * a + 2]!;
    const n: V3 = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const v of [a, b, e]) {
      const w = weld[v]!;
      const s = acc.get(w) ?? [0, 0, 0];
      s[0] += n[0]; s[1] += n[1]; s[2] += n[2];
      acc.set(w, s);
    }
  }
  for (const { i } of c.verts) {
    const s = acc.get(weld[i]!);
    if (!s) continue;
    const l = Math.hypot(...s) || 1;
    // Keep the orientation the master gave (outward).
    const sign = s[0] * d.nrm[3 * i]! + s[1] * d.nrm[3 * i + 1]! + s[2] * d.nrm[3 * i + 2]! < 0 ? -1 : 1;
    d.nrm[3 * i] = (sign * s[0]) / l; d.nrm[3 * i + 1] = (sign * s[1]) / l; d.nrm[3 * i + 2] = (sign * s[2]) / l;
  }
}

/** Taubin smoothing of a component's vertices (λ|μ, no shrink), welded by position. */
function taubin(c: Component, iterations: number): void {
  const d = c.verts[0]!.d;
  const weld = weldIds(d);
  const set = new Set(c.verts.map((v) => v.i));
  const nbr = new Map<number, Set<number>>();
  for (let t = 0; t < d.idx.length; t += 3) {
    const tri = [d.idx[t]!, d.idx[t + 1]!, d.idx[t + 2]!];
    if (!set.has(tri[0]!)) continue;
    for (let k = 0; k < 3; k++) {
      const a = weld[tri[k]!]!, b = weld[tri[(k + 1) % 3]!]!;
      if (!nbr.has(a)) nbr.set(a, new Set());
      if (!nbr.has(b)) nbr.set(b, new Set());
      nbr.get(a)!.add(b);
      nbr.get(b)!.add(a);
    }
  }
  const ids = [...nbr.keys()];
  const P = new Map<number, V3>(ids.map((w) => [w, [d.pos[3 * w]!, d.pos[3 * w + 1]!, d.pos[3 * w + 2]!]]));
  for (let it = 0; it < iterations * 2; it++) {
    const f = it % 2 === 0 ? 0.5 : -0.53;
    const next = new Map<number, V3>();
    for (const w of ids) {
      const p = P.get(w)!, ns = nbr.get(w)!;
      const avg: V3 = [0, 0, 0];
      for (const q of ns) { const pq = P.get(q)!; avg[0] += pq[0]; avg[1] += pq[1]; avg[2] += pq[2]; }
      next.set(w, [p[0] + f * (avg[0] / ns.size - p[0]), p[1] + f * (avg[1] / ns.size - p[1]), p[2] + f * (avg[2] / ns.size - p[2])]);
    }
    for (const [w, p] of next) P.set(w, p);
  }
  for (const { i } of c.verts) {
    const p = P.get(weld[i]!);
    if (!p) continue;
    d.pos[3 * i] = p[0]; d.pos[3 * i + 1] = p[1]; d.pos[3 * i + 2] = p[2];
  }
}

/**
 * Per-vertex convexity in [-1, 1] (tanh of the mean curvature, normalised per part): the runtime makes piping
 * ridges a touch glossier and its grooves a touch matter, as a scraped, settled piping line is.
 */
function convexity(d: PrimData): number[] {
  const weld = weldIds(d);
  const sum = new Map<number, { k: number; w: number }>();
  for (let t = 0; t < d.idx.length; t += 3) {
    const tri = [d.idx[t]!, d.idx[t + 1]!, d.idx[t + 2]!];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      if (a === b) continue;
      const i = tri[a]!, j = tri[b]!;
      const dx = d.pos[3 * i]! - d.pos[3 * j]!, dy = d.pos[3 * i + 1]! - d.pos[3 * j + 1]!, dz = d.pos[3 * i + 2]! - d.pos[3 * j + 2]!;
      const l2 = dx * dx + dy * dy + dz * dz;
      if (l2 < 1e-14) continue;
      const nd = d.nrm[3 * i]! * dx + d.nrm[3 * i + 1]! * dy + d.nrm[3 * i + 2]! * dz;
      const s = sum.get(weld[i]!) ?? { k: 0, w: 0 };
      s.k += 2 * nd; s.w += l2;
      sum.set(weld[i]!, s);
    }
  }
  const raw = Array.from({ length: d.pos.length / 3 }, (_, i) => {
    const s = sum.get(weld[i]!);
    return s && s.w > 0 ? s.k / s.w : 0;
  });
  // Normalised per part (its own 85th percentile of |curvature| ↦ tanh 1): a star rosette's
  // grooves and a swag's rounded back both span the range.
  const mags = raw.map(Math.abs).sort((a, b) => a - b);
  const scale = mags[Math.floor(0.85 * (mags.length - 1))] || 1;
  return raw.map((c) => Math.tanh(c / scale));
}

// ── Relief and roughness maps for the tier bodies (generated, physical units) ─────
/** Atlas size (px): the side relief at ≈ 0.1 mm a texel, the tops at ≈ 0.2 mm. */
export const ATLAS = 2048;

interface Pocket { x: number; y: number; rx: number; ry: number; depth: number }

/** Sparse air pockets on a jittered grid (cm), looked up by cell; periodic in x when `period` > 0. */
class Pockets {
  private readonly cells = new Map<string, Pocket>();
  readonly count: number;
  constructor(readonly seed: number, readonly cell: number, density: number, readonly period: number, x0: number, x1: number, y0: number, y1: number) {
    const pc = period ? Math.round(period / cell) : 0;
    for (let gy = Math.floor(y0 / cell) - 1; gy <= Math.ceil(y1 / cell) + 1; gy++) {
      for (let gx = period ? 0 : Math.floor(x0 / cell) - 1; gx <= (period ? pc - 1 : Math.ceil(x1 / cell) + 1); gx++) {
        if (hash2(gx, gy, seed) > density) continue;
        const r = mulberry32((gx * 73856093) ^ (gy * 19349663) ^ seed);
        const rad = 0.018 + 0.05 * r() ** 2.2; // 0.36–1.4 mm across
        this.cells.set(`${gx},${gy}`, { x: (gx + r()) * cell, y: (gy + r()) * cell, rx: rad * (1.2 + 0.8 * r()), ry: rad, depth: 0.004 + 0.01 * r() });
      }
    }
    this.count = this.cells.size;
  }
  /** The pockets that can reach (x, y): this cell and its neighbours. */
  near(x: number, y: number, out: Pocket[]): Pocket[] {
    out.length = 0;
    const pc = this.period ? Math.round(this.period / this.cell) : 0;
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const gx = pc ? (((cx + dx) % pc) + pc) % pc : cx + dx;
      const p = this.cells.get(`${gx},${cy + dy}`);
      if (p) out.push(p);
    }
    return out;
  }
}

const scratch: Pocket[] = [];

/**
 * Height field (cm) of the side finish at (x along the circumference, y up): bench-scraper streaks
 * that run around the cake (constant y), their strength drifting along x where the pressure
 * changed, a soft waviness, and the air pockets the scraper opened. Periodic in x (20 cm).
 */
function sideHeight(x: number, y: number, P: Pockets): { h: number; pocket: number } {
  const period = 20;
  const u = x / period;
  let h = 0;
  // Streaks: 0.6–3 mm spacing, ±15–40 µm, strength varying along the pass.
  const press = 0.55 + 0.45 * fbm(u * 8, y * 0.4, 5, 2, 8);
  h += press * 0.0036 * fbm(u * 3, y * 6.5, 11, 3, 3);
  h += press * 0.0016 * fbm(u * 2, y * 17, 13, 2, 2);
  // Soft waviness (1–4 cm), ±0.25 mm: the scraper's passes, what keeps the broad highlight from
  // reading as a lathe at a distance (slopes ≈ 2–4°).
  h += 0.025 * fbm(u * 7, y * 0.4, 17, 3, 7);
  let pocket = 0;
  for (const p of P.near(x, y, scratch)) {
    let dx = x - p.x;
    dx -= period * Math.round(dx / period);
    const q = (dx / p.rx) ** 2 + ((y - p.y) / p.ry) ** 2;
    if (q > 2.6) continue;
    // A rounded pit with the faint rim the scraper drags up beside it.
    h += -p.depth * Math.exp(-q * 2.2) + 0.25 * p.depth * Math.exp(-((Math.sqrt(q) - 1.15) ** 2) * 18);
    pocket = Math.max(pocket, Math.exp(-q * 1.6));
  }
  return { h, pocket };
}

interface Stroke { cx: number; cz: number; R: number; w: number; a0: number; a1: number; lift: number }

/** Offset-spatula strokes across a top (cm, centred): arcs laid one over another. */
function strokesFor(seed: number, radius: number): Stroke[] {
  const r = mulberry32(seed);
  return Array.from({ length: 56 }, () => {
    const R = 4 + 6 * r();
    const ang = r() * 2 * Math.PI, dist = radius * Math.sqrt(r()) * 1.05;
    const a0 = r() * 2 * Math.PI;
    return { cx: dist * Math.cos(ang) - R * Math.cos(a0 + 0.6), cz: dist * Math.sin(ang) - R * Math.sin(a0 + 0.6), R, w: 1.2 + 1.8 * r(), a0, a1: a0 + 0.5 + 0.9 * r(), lift: 0.002 + 0.004 * r() };
  });
}

function topHeight(x: number, z: number, S: Stroke[], P: Pockets): { h: number; pocket: number; edge: number } {
  let h = 0.016 * fbm(x * 0.35, z * 0.35, 23, 3);
  let edge = 0;
  // Painter's order: each stroke levels what is under it to its own plateau, leaving a ridge where
  // its edge lifted (40–60 µm, 0.5 mm wide).
  for (const s of S) {
    const dx = x - s.cx, dz = z - s.cz;
    const rr = Math.hypot(dx, dz);
    let a = Math.atan2(dz, dx) - s.a0;
    a -= 2 * Math.PI * Math.floor(a / (2 * Math.PI));
    const span = s.a1 - s.a0;
    if (a > span + 0.15) continue;
    const along = smoothstep(0, 0.12, a) * (1 - smoothstep(span - 0.05, span + 0.15, a));
    const across = Math.abs(rr - s.R) / (s.w / 2);
    if (across > 1.4) continue;
    const inside = (1 - smoothstep(0.85, 1.05, across)) * along;
    h = h * (1 - inside) + s.lift * inside + 0.6 * inside * 0.002 * fbm(x * 3, z * 3, 29, 2);
    const ridge = Math.exp(-(((rr - (s.R + s.w / 2)) / 0.03) ** 2)) * along;
    h += 0.005 * ridge;
    edge = Math.max(edge, ridge);
  }
  let pocket = 0;
  for (const p of P.near(x, z, scratch)) {
    const q = ((x - p.x) / p.rx) ** 2 + ((z - p.y) / p.ry) ** 2;
    if (q > 2.6) continue;
    h += -p.depth * Math.exp(-q * 2.2);
    pocket = Math.max(pocket, Math.exp(-q * 1.6));
  }
  return { h, pocket, edge };
}

/** Separable box blur (radius `r`, `passes` times ≈ gaussian), the two atlas regions apart, x wrapping. */
function boxBlurRegions(src: Float32Array, size: number, half: number, r: number, passes: number): Float32Array {
  let a = Float32Array.from(src), b = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < size; y++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[y * size + ((x + size) % size)]!;
      for (let x = 0; x < size; x++) {
        b[y * size + x] = acc / n;
        acc += a[y * size + ((x + r + 1) % size)]! - a[y * size + ((x - r + size) % size)]!;
      }
    }
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        const lo = y < half ? 0 : half, hi = y < half ? half - 1 : size - 1;
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += b[clamp(y + k, lo, hi) * size + x]!;
        a[y * size + x] = acc / n;
      }
    }
    [a, b] = [a, b];
  }
  return a;
}

/**
 * Generates the body's normal map (glTF convention, tangent space along +u and −v) and its
 * metallic-roughness map (G = roughness 0.45–0.70, B = metalness 0) as RGBA8, ATLAS × ATLAS.
 */
export function frostingMaps(size = ATLAS): { normal: Uint8Array; roughness: Uint8Array; stats: { min: number; max: number; mean: number } } {
  const H = new Float32Array(size * size), pocketMask = new Float32Array(size * size), edgeMask = new Float32Array(size * size);
  // Side region: v 0.02–0.48 ↔ y 0–9.4 cm (one UV unit ≈ 20.4 cm), u 0–1 ↔ x 0–20 cm.
  const sideCm = { x: 20, y: 20.4 };
  // Top region: the square u 0.27–0.73, v 0.52–0.98 ↔ the top tier's 18.9 cm across (UV unit 41 cm).
  const topCm = (2 * TIERS.top.mapR * 1.1 * 20) / 0.46;
  const sideP = new Pockets(101, 0.6, 0.26, sideCm.x, 0, sideCm.x, -1, 0.5 * sideCm.y + 1);
  const topP = new Pockets(202, 0.9, 0.25, 0, -topCm / 2, topCm / 2, -topCm / 2, topCm / 2);
  const S = strokesFor(303, (0.46 * topCm) / 2);
  for (let py = 0; py < size; py++) {
    const v = (py + 0.5) / size;
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) / size;
      const k = py * size + px;
      if (v < 0.5) {
        const r = sideHeight(u * sideCm.x, (v - 0.02) * sideCm.y, sideP);
        H[k] = r.h; pocketMask[k] = r.pocket;
      } else {
        const r = topHeight((u - 0.5) * topCm, (0.75 - v) * topCm, S, topP);
        H[k] = r.h; pocketMask[k] = r.pocket; edgeMask[k] = r.edge;
      }
    }
  }
  // High-pass of the relief (minus a ≈0.5 mm blur, per region): what stands proud of its
  // surroundings was smoothed by the blade and is a touch glossier; what sits low is matter.
  const half = size / 2;
  const blur = boxBlurRegions(H, size, half, 4, 3);
  let hpVar = 0;
  for (let k = 0; k < H.length; k++) hpVar += (H[k]! - blur[k]!) ** 2;
  const hpStd = Math.sqrt(hpVar / H.length) || 1;
  const normal = new Uint8Array(size * size * 4), roughness = new Uint8Array(size * size * 4);
  let min = 1, max = 0, sum = 0;
  for (let py = 0; py < size; py++) {
    const top = py >= half;
    // Texel size in cm along u and v for this region.
    const du = (top ? topCm : sideCm.x) / size, dv = (top ? topCm : sideCm.y) / size;
    for (let px = 0; px < size; px++) {
      const k = py * size + px;
      const at = (x: number, y: number) => {
        const yy = clamp(y, top ? half : 0, top ? size - 1 : half - 1);
        return H[yy * size + (((x % size) + size) % size)]!;
      };
      // Height gradients per cm along +u and +v; normal = (−∂h/∂u, +∂h/∂v, 1) (glTF: +Y is −v).
      const gu = (at(px + 1, py) - at(px - 1, py)) / (2 * du);
      const gv = (at(px, py + 1) - at(px, py - 1)) / (2 * dv);
      const nx = -gu, ny = gv, l = Math.hypot(nx, ny, 1);
      normal[4 * k] = Math.round((nx / l * 0.5 + 0.5) * 255);
      normal[4 * k + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
      normal[4 * k + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      normal[4 * k + 3] = 255;
      const hp = (H[k]! - blur[k]!) / hpStd;
      const base = 0.585 + 0.04 * fbm((px / size) * 7, (py / size) * 7, 41, 3, top ? 0 : 7);
      let rough = base - 0.03 * clamp(hp, -2.5, 2.5) + 0.12 * pocketMask[k]! - 0.04 * edgeMask[k]!;
      rough = clamp(rough, 0.45, 0.7);
      min = Math.min(min, rough); max = Math.max(max, rough); sum += rough;
      roughness[4 * k] = 255;
      roughness[4 * k + 1] = Math.round(rough * 255);
      roughness[4 * k + 2] = 0;
      roughness[4 * k + 3] = 255;
    }
  }
  return { normal, roughness, stats: { min, max, mean: sum / (size * size) } };
}

async function png(data: Uint8Array, size: number): Promise<Uint8Array> {
  return new Uint8Array(await loadSharp()(data, { raw: { width: size, height: size, channels: 4 } }).png({ compressionLevel: 6 }).toBuffer());
}

// ── Candles: the master's twisted six-flute candle, re-tessellated ────────────────
/**
 * Measured from the master (candle_N_* local space, scan units): base 0.586, side to 0.796, a
 * 0.004 shoulder to a 0.016 circle at 0.800, a shallow cone to 0.8028 at the axis. Six flutes,
 * radius 0.017616 + 0.001212 cos 6φ − 0.000132 cos 12φ (the master's 30 samples, band-limited),
 * twisting at −60.3186 rad per unit height (ridge 0 at 0.96761 rad at y 0.596). The stripe LUT
 * runs along u = (twist(y) − θ)/2π, which these vertices keep exactly (u = j/128).
 */
export const CANDLE_SHAPE = {
  base: 0.586, side: 0.796, rim: 0.8, top: 0.8028, rimR: 0.016,
  c0: 0.017616, c1: 0.001212, c2: -0.000132, flutes: 6,
  twist: -60.3186, phase0: 0.96761, phaseY: 0.596,
  segments: 128,
} as const;

const C = CANDLE_SHAPE;
const fluteR = (phi: number) => C.c0 + C.c1 * Math.cos(C.flutes * phi) + C.c2 * Math.cos(2 * C.flutes * phi);
const twistAt = (y: number) => C.phase0 + C.twist * (y - C.phaseY);

/**
 * A point of the candle surface from (φ, σ): φ the flute phase (−2πu), σ the profile parameter
 * (0–1 side from base to shoulder, 1–2 shoulder, 2–3 the cone to the axis). Shared with the melt
 * shader (models/cakeMelt.ts mirrors it in GLSL).
 */
export function candlePoint(phi: number, sigma: number): V3 {
  let r: number, y: number;
  if (sigma <= 1) {
    y = C.base + (C.side - C.base) * sigma;
    r = fluteR(phi);
  } else if (sigma <= 2) {
    const t = sigma - 1;
    y = C.side + (C.rim - C.side) * t;
    r = fluteR(phi) + (C.rimR - fluteR(phi)) * t ** 4;
  } else {
    const t = Math.min(1, sigma - 2);
    r = C.rimR * (1 - t);
    // A cone with its tip rounded over the last 0.002.
    const k = Math.sqrt((r / C.rimR) ** 2 + 0.015) - Math.sqrt(0.015);
    y = C.top - (C.top - C.rim) * (k / (Math.sqrt(1.015) - Math.sqrt(0.015)));
  }
  const th = twistAt(y) + phi;
  return [r * Math.cos(th), y, r * Math.sin(th)];
}

function candleMesh(): Mesh & { profile: number[] } {
  const m: Mesh & { profile: number[] } = { pos: [], nrm: [], uv: [], idx: [], profile: [] };
  const N = C.segments;
  const sigmas: number[] = [];
  for (let k = 0; k <= 120; k++) sigmas.push(k / 120); // side rows, 1.75e-3 apart (0.39 mm)
  for (let k = 1; k <= 8; k++) sigmas.push(1 + k / 8); // shoulder
  for (let k = 1; k <= 10; k++) sigmas.push(2 + k / 10); // cone to the axis
  const rows: number[] = [];
  for (const s of sigmas) {
    rows.push(m.pos.length / 3);
    for (let j = 0; j <= N; j++) {
      const u = j / N, phi = -2 * Math.PI * u;
      const p = candlePoint(phi, s);
      const e = 1e-4;
      const a = candlePoint(phi + e, s), b = candlePoint(phi - e, s);
      const c = candlePoint(phi, Math.min(3, s + e)), d = candlePoint(phi, Math.max(0, s - e));
      const tu: V3 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], tv: V3 = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
      let n: V3 = [tu[1] * tv[2] - tu[2] * tv[1], tu[2] * tv[0] - tu[0] * tv[2], tu[0] * tv[1] - tu[1] * tv[0]];
      // Outward (side) / upward (top).
      const out = s < 2 ? p[0] * n[0] + p[2] * n[2] : n[1];
      if (out < 0) n = [-n[0], -n[1], -n[2]];
      if (s >= 3 - 1e-9) n = [0, 1, 0];
      const l = Math.hypot(...n) || 1;
      m.pos.push(...p);
      m.nrm.push(n[0] / l, n[1] / l, n[2] / l);
      m.uv.push(u, clamp((p[1] - C.base) / (C.rim - C.base), 0, 1));
      m.profile.push(s);
    }
  }
  for (let k = 0; k < rows.length - 1; k++) {
    const a = rows[k]!, b = rows[k + 1]!;
    for (let j = 0; j < N; j++) m.idx.push(a + j, b + j, a + j + 1, a + j + 1, b + j, b + j + 1);
  }
  // The underside, buried in the frosting: a flat fan (profile −1: the melt never moves it).
  const ring = rows[0]!;
  const centre = m.pos.length / 3;
  m.pos.push(0, C.base, 0);
  m.nrm.push(0, -1, 0);
  m.uv.push(0.5, 0);
  m.profile.push(-1);
  const under: number[] = [];
  for (let j = 0; j <= N; j++) {
    under.push(m.pos.length / 3);
    m.pos.push(m.pos[3 * (ring + j)]!, C.base, m.pos[3 * (ring + j) + 2]!);
    m.nrm.push(0, -1, 0);
    m.uv.push(m.uv[2 * (ring + j)]!, 0);
    m.profile.push(-1);
  }
  for (let j = 0; j < N; j++) m.idx.push(centre, under[j]!, under[j + 1]!);
  orient(m);
  return m;
}

// ── The transform ──────────────────────────────────────────────────────────────────
const FROSTING_NODE = /^tier_(top|bottom)/;

/** Which tier a master node belongs to, and how its decorations are mounted. */
function nodeInfo(name: string): { tier: TierId; kind: Kind; mount?: 'side' | 'ledge' | 'crown'; jitter?: number; twist?: number } | null {
  const m = FROSTING_NODE.exec(name);
  if (!m) return null;
  const tier = m[1] as TierId;
  const part = name.slice(m[0].length).replace(/^_/, '');
  switch (part) {
    case '': return { tier, kind: 'body' };
    case 'shell_border': return { tier, kind: 'ledge', mount: 'ledge', jitter: 0.06 };
    case 'border_pearls': return { tier, kind: 'ledge', mount: 'ledge', jitter: 0.05 };
    case 'dots': return { tier, kind: 'side', mount: 'side', jitter: 0.09 };
    case 'pearls': return { tier, kind: 'side', mount: 'side', jitter: 0.05 };
    case 'tassels': return { tier, kind: 'side', mount: 'side', jitter: 0.04 };
    case 'drops': return { tier, kind: 'side', mount: 'side', jitter: 0.02 };
    case 'rosettes': return { tier, kind: 'crown', mount: 'ledge', jitter: 0.04, twist: (10 * Math.PI) / 180 };
    case 'top_rosettes': return { tier, kind: 'crown', mount: 'crown', jitter: 0.05, twist: (12 * Math.PI) / 180 };
    case 'swags': return { tier, kind: 'side' };
    case 'rope_edge': return { tier, kind: 'side' };
    default: throw new Error(`birthday finish: unknown frosting node ${name}`);
  }
}

/**
 * The two softened rosettes (master angle, radians): one on each tier's crown, a little either
 * side of the camera's line (world azimuth 70° ↔ master 75° after the 5° presentation yaw), so the
 * eye finds them without them being the first thing it sees.
 */
export const SOFTENED = [{ node: 'tier_top_rosettes', angle: (112 * Math.PI) / 180 }, { node: 'tier_bottom_rosettes', angle: (44 * Math.PI) / 180 }] as const;

export interface FinishReport {
  lines: string[];
}

export async function finishCake(doc: Document, log: (line: string) => void): Promise<void> {
  const root = doc.getRoot();
  const nodes = root.listNodes();
  const rand = mulberry32(0xb17d);

  // 1. Tiers: rebuilt dense lathes (the finish field is applied with everything else below).
  const geometry = new Map<Primitive, PrimData>();
  for (const node of nodes) {
    const info = nodeInfo(node.getName());
    if (!info || info.kind !== 'body') continue;
    const prim = node.getMesh()!.listPrimitives()[0]!;
    const before = prim.getAttribute('POSITION')!.getCount();
    const m = rebuildTier(prim, info.tier);
    setGeometry(doc, prim, m);
    log(`  finish ${node.getName()}: rebuilt ${before} → ${m.pos.length / 3} vertices (dense top annulus at the sockets)`);
  }

  // 2. Decorations: sizes, twists and the two softened rosettes (before the finish field, about
  //    the points where they touch the cake).
  let jittered = 0;
  for (const node of nodes) {
    const info = nodeInfo(node.getName());
    if (!info || info.kind === 'body') continue;
    const prims = node.getMesh()!.listPrimitives();
    const datas = prims.map((p) => { const d = primData(p); geometry.set(p, d); return d; });
    if (!info.mount) continue;
    // Rosette meshes carry their centre pearls as a second primitive: a pearl moves with the
    // rosette it sits in.
    const main = components(datas[0]!);
    const extras = datas.slice(1).flatMap((d) => components(d));
    const owner = (c: Component) => {
      let best = -1, bd = Infinity;
      main.forEach((m, k) => { const d = Math.hypot(c.centroid[0] - m.centroid[0], c.centroid[1] - m.centroid[1], c.centroid[2] - m.centroid[2]); if (d < bd) { bd = d; best = k; } });
      return best;
    };
    const softened = SOFTENED.find((s) => s.node === node.getName());
    let softIndex = -1;
    if (softened) {
      let bd = Infinity;
      main.forEach((m, k) => {
        const a = Math.atan2(m.centroid[2], m.centroid[0]);
        const d = Math.abs(Math.atan2(Math.sin(a - softened.angle), Math.cos(a - softened.angle)));
        if (d < bd) { bd = d; softIndex = k; }
      });
    }
    const groups = main.map((m) => [m]);
    for (const e of extras) groups[owner(e)]!.push(e);
    groups.forEach((group, k) => {
      const c = group[0]!;
      const o = anchorOf(c, info.mount!);
      const s = 1 + info.jitter! * (2 * rand() - 1);
      const tw = (info.twist ?? 0) * (2 * rand() - 1);
      const out: V3 = [c.centroid[0] - o[0], c.centroid[1] - o[1], c.centroid[2] - o[2]];
      const l = Math.hypot(...out) || 1;
      const axis: V3 = info.mount === 'crown' ? [0, 1, 0] : [out[0] / l, out[1] / l, out[2] / l];
      const tmp: V3 = [0, 0, 0], p: V3 = [0, 0, 0];
      for (const part of group) {
        for (const { d, i } of part.verts) {
          p[0] = d.pos[3 * i]!; p[1] = d.pos[3 * i + 1]!; p[2] = d.pos[3 * i + 2]!;
          rigid(p, o, axis, tw, s, tmp);
          d.pos[3 * i] = tmp[0]; d.pos[3 * i + 1] = tmp[1]; d.pos[3 * i + 2] = tmp[2];
          p[0] = d.nrm[3 * i]!; p[1] = d.nrm[3 * i + 1]!; p[2] = d.nrm[3 * i + 2]!;
          rotateNormal(p, axis, tw, tmp);
          d.nrm[3 * i] = tmp[0]; d.nrm[3 * i + 1] = tmp[1]; d.nrm[3 * i + 2] = tmp[2];
        }
      }
      jittered++;
      if (k !== softIndex) return;
      // Softened: the star ridges relaxed, the rosette slumped 8 % and drooping at its outer edge.
      const size = Math.hypot(c.max[0] - c.min[0], c.max[1] - c.min[1], c.max[2] - c.min[2]);
      const slump = (q: V3, outQ: V3) => {
        const dx = q[0] - o[0], dz = q[2] - o[2];
        const reach = Math.hypot(dx, dz) / size;
        outQ[0] = o[0] + dx * 1.03;
        outQ[1] = o[1] + (q[1] - o[1]) * 0.92 - 0.006 * reach * reach;
        outQ[2] = o[2] + dz * 1.03;
        return outQ;
      };
      taubin(c, 5);
      for (const { d, i } of c.verts) {
        p[0] = d.pos[3 * i]!; p[1] = d.pos[3 * i + 1]!; p[2] = d.pos[3 * i + 2]!;
        slump(p, tmp);
        d.pos[3 * i] = tmp[0]; d.pos[3 * i + 1] = tmp[1]; d.pos[3 * i + 2] = tmp[2];
      }
      recomputeNormals(c);
      // Its pearl rides down with the rosette's top: moved as its centre moves.
      for (const part of group.slice(1)) {
        const moved = slump(part.centroid, [0, 0, 0]);
        for (const { d, i } of part.verts) {
          d.pos[3 * i] = d.pos[3 * i]! + moved[0] - part.centroid[0];
          d.pos[3 * i + 1] = d.pos[3 * i + 1]! + moved[1] - part.centroid[1];
          d.pos[3 * i + 2] = d.pos[3 * i + 2]! + moved[2] - part.centroid[2];
        }
      }
      log(`  finish ${node.getName()}: softened the rosette at ${((Math.atan2(c.centroid[2], c.centroid[0]) * 180) / Math.PI).toFixed(0)}° (master)`);
    });
  }
  log(`  finish: ${jittered} beads, shells, dots, pearls and rosettes varied in size (±2–9 %) and twist`);

  // 3. The finish field on every frosting part; then convexity on piping and rosettes.
  let maxR = 0, top = -Infinity;
  for (const node of nodes) {
    const info = nodeInfo(node.getName());
    if (!info) continue;
    for (const prim of node.getMesh()!.listPrimitives()) {
      const d = geometry.get(prim) ?? primData(prim);
      if (info.kind === 'body') {
        d.pos = read(prim.getAttribute('POSITION')!);
        d.nrm = read(prim.getAttribute('NORMAL')!);
      }
      deform(d.pos, d.nrm, (p, out) => finishPoint(p, info.tier, info.kind, out));
      prim.setAttribute('POSITION', accessor(doc, 'VEC3', d.pos));
      prim.setAttribute('NORMAL', accessor(doc, 'VEC3', d.nrm));
      for (let i = 0; i < d.pos.length; i += 3) { maxR = Math.max(maxR, Math.hypot(d.pos[i]!, d.pos[i + 2]!)); top = Math.max(top, d.pos[i + 1]!); }
      const mat = prim.getMaterial()?.getName() ?? '';
      if (mat === 'cake_piping' || mat === 'cake_rosette') prim.setAttribute('_RIDGE', accessor(doc, 'SCALAR', new Float32Array(convexity(d))));
    }
  }
  log(`  finish field: tiers ±1.4 % from round, tops ±0.7 mm; frosting now reaches r ${maxR.toFixed(5)}, top ${top.toFixed(5)} (scan)`);

  // 4. Materials: no clearcoat on the frosting; generated relief and roughness on the body; a
  //    very slight sheen on the piping and rosettes; the runtime's subsurface and press settings.
  const mat = (name: string): Material => {
    const m = root.listMaterials().find((x) => x.getName() === name);
    if (!m) throw new Error(`birthday finish: no material ${name}`);
    return m;
  };
  const { normal, roughness, stats } = frostingMaps();
  const body = mat('cake_buttercream');
  body.setExtension('KHR_materials_clearcoat', null);
  body.setNormalTexture(doc.createTexture('cake_buttercream_relief').setImage(await png(normal, ATLAS)).setMimeType('image/png'));
  body.setMetallicRoughnessTexture(doc.createTexture('cake_buttercream_roughness').setImage(await png(roughness, ATLAS)).setMimeType('image/png'));
  body.setRoughnessFactor(1).setMetallicFactor(0);
  body.setExtras({ ...(body.getExtras() as object), frosting: 'body' });
  log(`  finish maps: relief + roughness ${ATLAS}² (roughness ${stats.min.toFixed(2)}–${stats.max.toFixed(2)}, mean ${stats.mean.toFixed(3)})`);
  const sheenExt = doc.createExtension(KHRMaterialsSheen);
  for (const name of ['cake_piping', 'cake_rosette']) {
    const m = mat(name);
    m.setExtension('KHR_materials_clearcoat', null);
    m.setRoughnessFactor(0.52);
    m.setExtension('KHR_materials_sheen', sheenExt.createSheen().setSheenColorFactor([0.1, 0.1, 0.1]).setSheenRoughnessFactor(0.45));
    m.setExtras({ ...(m.getExtras() as object), frosting: 'piping' });
  }
  const pearl = mat('cake_pearl');
  pearl.setExtras({ ...(pearl.getExtras() as object), frosting: 'pearl' });

  // 5. Candles: one shared mesh, re-tessellated.
  const candleMeshes = new Set(nodes.filter((n) => /^candle_\d_/.test(n.getName())).map((n) => n.getMesh()!));
  for (const mesh of candleMeshes) {
    for (const prim of mesh.listPrimitives()) {
      const before = prim.getAttribute('POSITION')!.getCount();
      const m = candleMesh();
      setGeometry(doc, prim, { ...m, extra: { _PROFILE: m.profile } });
      log(`  finish candles: ${before} → ${m.pos.length / 3} vertices (${C.segments} around, 0.39 mm rows, melt profile)`);
    }
  }
}
