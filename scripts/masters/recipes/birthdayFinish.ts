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
 * - Piping beads, shells, dots, pearls and rosettes vary in size (shells ±10 %, rosettes ±9–10 %,
 *   dots ±12 %, pearls ±7 %, about the point they touch the cake with) and the star rosettes in
 *   twist (±15°). Two rosettes are softened: their star ridges relaxed (Taubin smoothing) and the
 *   rosette slumped 8 % with a slight droop.
 * - v1.5 polish (judged at laptop size): the bays are uneven (positions ±2.3 mm, columns leaning
 *   ±2.5°, swags dropping ±4 mm), the top tier sits 2.4 mm off the lower one's centre, the swag
 *   ropes are rebuilt as smooth 16-sided tubes with tucked tails, round pieces as fine spheres.
 * - Materials: the frosting loses the master's clearcoat (the "plastic" in the brief); the body
 *   gets a generated relief (normal map: bench-scraper streaks on the sides, offset-spatula
 *   strokes on the tops, sparse air pockets) and a roughness map 0.40–0.66 (scraped ridges a touch
 *   glossier than the troughs, pockets matt); piping and rosettes get a very slight sheen and a
 *   per-vertex convexity (`_RIDGE`) the runtime uses to make ridges glossier than grooves.
 * - Candles re-tessellated (30 → 128 segments, 2.2 → 0.39 mm rows) from the master's own twisted
 *   six-flute surface, with a `_PROFILE` parameter the runtime melt shader deforms.
 *
 * v1.6 (the Hollywood pass, docs/scenes/birthday-v1.6-cake.md): the owner still saw "a plasticky, too
 * perfect and geometric shape / texture". The piping is no longer the master's moulded instances
 * jittered: `regeneratePiping` rebuilds every piped part as a sculpted star-tip sweep
 * (birthdayPiping.ts) at the master's own placements and sizes, each from its own seed; the tiers'
 * top edges are a soft bead (`handProfile`, EDGE_BEAD) with a hand-pushed lip (`topUneven`), the
 * sides carry the scraper's hand waves (`HAND_WAVES`), knife chatter and, on the tops, the turntable's
 * spiral (relief); `bakeLight` bakes occlusion and thickness (birthdayBake.ts) into the piping's
 * `_FOOD` attribute and the body's unique contact map (TEXCOORD_1, `UNIQUE`); the base gets a smear
 * and crumbs on the plate (a child of the stand).
 *
 * Everything is a pure function of the master and fixed seeds: `pnpm models birthday` is
 * deterministic.
 */
import type { Accessor, Document, Material, Node, Primitive } from '@gltf-transform/core';
import { KHRMaterialsSheen } from '@gltf-transform/extensions';
import { CAKE_SCALE, CANDLE_SINK, MASTER, MASTER_CANDLES } from '../../../models/birthdayContract.ts';
import { BIN } from '../../../models/disposalBin.ts';
import { loadSharp } from '../sharp.ts';
import { Baker, Occupancy } from './birthdayBake.ts';
import {
  add, appendMesh, backMound, baseSmears, cross, domedSwirl, dot, emptyMesh, hash1, len, MM, mul, norm, pipedDot, type PipeMesh, pulledLine, recomputeNormals as recomputePipeNormals, rotate, ropeBorder, seedOf, shell, spiralRosette, STAR, stream, sub, swagStrand,
} from './birthdayPiping.ts';

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

function setGeometry(doc: Document, prim: Primitive, g: { pos: number[]; nrm: number[]; uv: number[]; idx: number[]; uv1?: number[]; extra?: Record<string, number[]> }): void {
  for (const sem of prim.listSemantics()) prim.setAttribute(sem, null);
  prim.setAttribute('POSITION', accessor(doc, 'VEC3', new Float32Array(g.pos)));
  prim.setAttribute('NORMAL', accessor(doc, 'VEC3', new Float32Array(g.nrm)));
  prim.setAttribute('TEXCOORD_0', accessor(doc, 'VEC2', new Float32Array(g.uv)));
  if (g.uv1) prim.setAttribute('TEXCOORD_1', accessor(doc, 'VEC2', new Float32Array(g.uv1)));
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
    // m = 1 is the tier sitting 0.5 mm off the stand's axis (it is centred on the board; the
    // stacked upper tier is the one visibly off, and the cake must still clear the bin's mouth).
    drift: [{ m: 1, a: 0.004, phase: 1.9 }, { m: 2, a: 0.0075, phase: 0.7 }, { m: 3, a: 0.0042, phase: 2.9 }, { m: 4, a: 0.0018, phase: 4.4 }],
    barrel: 0.0022,
    tilt: { a: 0.0016, phase: 2.2 },
    bumps: [{ x: 0.5, z: 0.12, s: 0.07, a: 0.0018 }, { x: -0.36, z: 0.4, s: 0.08, a: -0.0016 }],
  },
  top: {
    // The upper tier 2.4 mm off the lower's centre: stacked by hand.
    drift: [{ m: 1, a: 0.025, phase: 4.1 }, { m: 2, a: 0.0065, phase: 3.6 }, { m: 3, a: 0.0044, phase: 1.1 }, { m: 4, a: 0.0021, phase: 5.3 }],
    barrel: 0.0018,
    tilt: { a: 0.0019, phase: 0.9 },
    bumps: [{ x: 0.12, z: -0.2, s: 0.11, a: 0.0017 }, { x: -0.2, z: 0.16, s: 0.1, a: -0.0014 }],
  },
};

/**
 * The bays (v1.5 polish, judged at laptop size where 1 mm ≈ 1.45 px): a hand-piped cake's swag
 * bays are not equal. Per tier, how many bays there are, the heights a swag hangs from, reaches
 * at its lowest and where the columns' tassels start (scan units), and the amplitudes: bay
 * positions ±2.3 mm along the side (neighbours differ by up to ±4 mm), columns leaning ±2.5° (a
 * sideways shear of everything at that angle, so swags, rosettes and pearls stay attached), swag
 * drops ±4 mm.
 */
export const BAYS: Record<TierId, { count: number; attach: number; low: number; fade: number; mid: number }> = {
  bottom: { count: 14, attach: 0.14, low: -0.07, fade: -0.125, mid: -0.03 },
  top: { count: 12, attach: 0.555, low: 0.385, fade: 0.3, mid: 0.39 },
};
export const BAY_AMPLITUDE = { shift: 0.0105, lean: 0.044, drop: 0.018 } as const;

/** Smooth per-bay value noise around the tier (one random value per cell, `cells` around). */
function bayNoise(theta: number, cells: number, seed: number): number {
  const u = ((theta / (2 * Math.PI)) * cells + cells * 8) % cells;
  const i = Math.floor(u), f = u - i;
  const a = 2 * hash2(i % cells, 0, seed) - 1, b = 2 * hash2((i + 1) % cells, 0, seed) - 1;
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}

/** Relative radius drift of a tier at angle θ and height y (fraction of R; peak ≈ ±1.4 %). */
export function radialDrift(tier: TierId, theta: number, y: number): number {
  const T = TIERS[tier], F = FIELDS[tier];
  const yy = clamp((y - T.y0) / (T.y1 - T.y0), 0, 1);
  let d = F.barrel * ((2 * yy - 1) ** 2 - 1 / 3);
  // The ovality leans a little with height (a hand-scraped side is never a perfect cylinder).
  for (const k of F.drift) d += k.a * Math.cos(k.m * theta + k.phase + 0.35 * (yy - 0.5) * k.m);
  // v1.6: the scraper's hand waves, 2–8 cm round the tier (≈ ±1 mm on the silhouette), their phase
  // drifting with height so they run as soft diagonal swells; and a slow horizontal wave up the side.
  for (const w of HAND_WAVES[tier]) d += 1.5 * w.a * Math.cos(w.m * theta + w.phase + w.k * (yy - 0.5));
  d += 0.0016 * Math.sin(2 * Math.PI * 3.1 * yy + 1.7 * Math.cos(theta + (tier === 'top' ? 0.4 : 2.2)));
  return d;
}

/** The scraper's mid-frequency waves (fraction of the tier's radius; m waves round it; k radians of drift up the side). */
export const HAND_WAVES: Record<TierId, { m: number; a: number; phase: number; k: number }[]> = {
  bottom: [{ m: 5, a: 0.0042, phase: 0.4, k: 2.1 }, { m: 8, a: 0.0031, phase: 2.6, k: -3.3 }, { m: 12, a: 0.0021, phase: 5.1, k: 4.4 }, { m: 17, a: 0.0012, phase: 1.3, k: -2.2 }],
  top: [{ m: 6, a: 0.0048, phase: 3.3, k: -2.6 }, { m: 9, a: 0.0034, phase: 0.9, k: 3.1 }, { m: 13, a: 0.0022, phase: 4.2, k: -4.0 }, { m: 18, a: 0.0013, phase: 2.0, k: 2.5 }],
};

/** Height offset of a tier's top surface at (x, z) (scan units; ≈ ±0.0032 = ±0.7 mm). */
export function topUneven(tier: TierId, x: number, z: number): number {
  const T = TIERS[tier], F = FIELDS[tier];
  let t = (F.tilt.a * (x * Math.cos(F.tilt.phase) + z * Math.sin(F.tilt.phase))) / T.R;
  for (const b of F.bumps) t += b.a * Math.exp(-((x - b.x) ** 2 + (z - b.z) ** 2) / (2 * b.s * b.s));
  // v1.6: the hand-coated edge. Scraping the side pushes a crown of buttercream up over the edge;
  // the spatula sweeps it in, leaving a soft raised lip just inside the edge (0.2–0.9 mm, with the
  // odd pulled peak) and a shallow valley inside it where the blade lifted.
  const r = Math.hypot(x, z), th = Math.atan2(z, x);
  const L = EDGE_LIP[tier];
  const lipH = (L.h + L.var * fbmTheta(th, tier === 'top' ? 331 : 337)) * MM_SCAN;
  t += Math.max(0, lipH) * Math.exp(-(((r - (T.R - L.at)) / L.w) ** 2));
  t -= L.valley * MM_SCAN * Math.exp(-(((r - (T.R - L.vAt)) / L.vW) ** 2)) * (0.6 + 0.4 * fbmTheta(th + 1.3, 341));
  // The bottom tier's top under the upper tier carries its weight flat: only the exposed ledge waves.
  if (tier === 'bottom') t *= smoothstep(0.44, 0.5, r);
  return t;
}

const MM_SCAN = 1 / 220;
/** The thickness range the packed `_FOOD` attribute stores (mm; models/cakeShaders.ts reads it). */
export const FOOD_THICK_MM = 16;
/** The edge lip and valley (mm; scan-unit offsets inward from the tier's radius). */
export const EDGE_LIP: Record<TierId, { h: number; var: number; at: number; w: number; valley: number; vAt: number; vW: number }> = {
  bottom: { h: 0.45, var: 0.4, at: 0.012, w: 0.011, valley: 0.25, vAt: 0.04, vW: 0.02 },
  top: { h: 0.5, var: 0.45, at: 0.013, w: 0.011, valley: 0.3, vAt: 0.042, vW: 0.02 },
};
/** Smooth noise round the tier in [−1, 1] (≈ 9 cells round, periodic). */
function fbmTheta(theta: number, seed: number): number {
  const u = ((theta / (2 * Math.PI)) * 9 + 90) % 9;
  return fbm(u, 0.5, seed, 3, 9);
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

/**
 * The cake's reach (scan units): it drops into the bin upright and must clear its mouth by 8 mm
 * (tests/birthday.test.ts). A large bottom shell at a bulge of the side would reach ½ mm past it:
 * the outermost 3.5 mm of reach are eased (tanh) to stop just short, so no decoration crosses it.
 */
// (v1.6 polish: 0.6 mm short of it, so the slumped shell border and the larger rosettes keep the
// cake at its real 27.7 cm ± 1 %, tests/world-scale.test.ts.)
const REACH = (BIN.opening - 0.04) / CAKE_SCALE - 0.0006;
function reachLimit(r: number): number {
  const w = 0.0035, r0 = REACH - w;
  return r <= r0 ? r : r0 + w * Math.tanh((r - r0) / w);
}

type Kind = 'body' | 'side' | 'ledge' | 'crown' | 'column' | 'hang';
/** The finish field: where a frosting point at `p` (scan units) goes. */
export function finishPoint(p: V3, tier: TierId, kind: Kind, out: V3 = [0, 0, 0]): V3 {
  const T = TIERS[tier];
  const [x, y, z] = p;
  const r = Math.hypot(x, z);
  const theta = Math.atan2(z, x);
  const dr = T.R * radialDrift(tier, theta, y) * smoothstep(0.75 * T.R, 0.92 * T.R, r);
  const dy = topUneven(tier, x, z) * smoothstep(T.y1 - 0.05, T.y1 - 0.004, y);
  let dt = 0, dw = 0;
  if (kind !== 'body') {
    // Uneven bays: each bay's decorations shifted along the side, leaning a little.
    const B = BAYS[tier], seed = tier === 'top' ? 211 : 233;
    dt += BAY_AMPLITUDE.shift * bayNoise(theta, B.count, seed);
    dt += BAY_AMPLITUDE.lean * bayNoise(theta + 0.5 * ((2 * Math.PI) / B.count), B.count, seed + 1) * (y - B.mid);
    if (kind === 'hang') {
      // Swags (and the pearls and dots in them) hang lower or higher, bay by bay.
      const w = y >= B.low ? smoothstep(B.attach, B.low, y) : smoothstep(B.fade, B.low, y);
      dw += BAY_AMPLITUDE.drop * bayNoise(theta, B.count * 2, seed + 2) * w;
    }
  }
  if (kind === 'side' || kind === 'ledge' || kind === 'column' || kind === 'hang') {
    const w = wobble(tier, theta, y);
    dt += w[0];
    // Piping resting on a ledge (shell borders) only slides along it: no vertical wobble.
    if (kind !== 'ledge') dw += w[1];
  }
  const r2 = kind === 'body' ? r + dr : reachLimit(r + dr);
  const th2 = r > 1e-6 ? theta + dt / Math.max(r, 0.05) : theta;
  out[0] = r2 * Math.cos(th2);
  out[1] = y + dy + dw;
  out[2] = r2 * Math.sin(th2);
  if (r < 1e-9) { out[0] = x; out[2] = z; }
  return out;
}

/** Applies `map` to positions and transforms normals by its Jacobian (n' ∝ cof(J)·n). */
/** v1.6 polish 2: moves each run of `per` vertices (one pearl) by the map at its centre, rigidly. */
function deformRigid(pos: Float32Array, per: number, map: (p: V3, out: V3) => V3): void {
  const c: V3 = [0, 0, 0], o: V3 = [0, 0, 0];
  for (let s = 0; s < pos.length / 3; s += per) {
    const n = Math.min(per, pos.length / 3 - s);
    c[0] = c[1] = c[2] = 0;
    for (let i = s; i < s + n; i++) { c[0] += pos[3 * i]! / n; c[1] += pos[3 * i + 1]! / n; c[2] += pos[3 * i + 2]! / n; }
    map(c, o);
    for (let i = s; i < s + n; i++) { pos[3 * i] = pos[3 * i]! + o[0] - c[0]; pos[3 * i + 1] = pos[3 * i + 1]! + o[1] - c[1]; pos[3 * i + 2] = pos[3 * i + 2]! + o[2] - c[2]; }
  }
}

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
export function masterProfile(prim: Primitive): ProfilePoint[] {
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

/**
 * v1.6: the hand-coated edge's bead. The master's top edge is a 3.7–4.4 mm fillet of constant radius
 * (razor-clean at laptop size): replaced by a softer bead, `EDGE_BEAD` mm, tangent to the side and the
 * top (the lip and its variation round the tier come from the finish field, topUneven).
 */
export const EDGE_BEAD: Record<TierId, number> = { bottom: 6.0, top: 6.5 };
function handProfile(prof: ProfilePoint[], tier: TierId): ProfilePoint[] {
  const rho = EDGE_BEAD[tier] / 220;
  const capStart = prof.findIndex((p, i) => i > 2 && p.ny > 0.995);
  const firstEdge = prof.findIndex((p) => p.ny > -0.995);
  // The side's top and the top's edge, from the master's straight runs either side of its corner.
  const side = prof.slice(firstEdge, capStart).filter((p) => p.nr > 0.995);
  const sTop = side[side.length - 1]!, sBelow = side[side.length - 2]!;
  const cap = prof.slice(capStart);
  const slope = (sTop.r - sBelow.r) / (sTop.y - sBelow.y);
  const Rs = (y: number) => sTop.r + slope * (y - sTop.y);
  const yTopAt = (r: number) => { // the cap (r descending)
    for (let i = 0; i < cap.length - 1; i++) { const a = cap[i]!, b = cap[i + 1]!; if (r <= a.r && r >= b.r) return a.y + ((b.y - a.y) * (a.r - r)) / Math.max(a.r - b.r, 1e-9); }
    return cap[cap.length - 1]!.y;
  };
  const Yt = yTopAt(sTop.r - 0.02) + 0.0004;
  const cr = Rs(Yt - rho) - rho, cy = Yt - rho;
  const out: ProfilePoint[] = [];
  for (const p of prof.slice(0, capStart)) if (!(p.ny > -0.995 && p.y > cy)) out.push(p);
  // The bead: a quarter circle from the side to the top, finely sampled (≈ 0.4 mm).
  const steps = 22;
  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * (Math.PI / 2);
    out.push({ r: cr + rho * Math.cos(a), y: cy + rho * Math.sin(a), nr: Math.cos(a), ny: Math.sin(a) });
  }
  for (const p of cap) if (p.r < cr - 1e-4) out.push(p);
  return out;
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

interface Mesh { pos: number[]; nrm: number[]; uv: number[]; idx: number[]; uv1?: number[] }

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
function rebuildTier(prof: ProfilePoint[], tier: TierId): Mesh {
  const T = TIERS[tier];
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

  const m: Mesh = { pos: [], nrm: [], uv: [], idx: [], uv1: [] };
  const N = 256;
  const ringStart: number[] = [];
  rings.forEach((p, k) => {
    ringStart.push(m.pos.length / 3);
    const v = 0.02 + (0.46 * clamp(s[k]! - s0, 0, s1 - s0)) / (s1 - s0);
    // v1.6 unique atlas (uv1): this tier's side band, by angle and arc length (the hidden underside
    // squeezed into the band's first rows).
    const v1 = UNIQUE.side[tier] + UNIQUE.band * (0.02 + (0.96 * clamp(s[k]! - s0, 0, s1 - s0)) / (s1 - s0));
    for (let j = 0; j <= N; j++) {
      const th = (2 * Math.PI * j) / N;
      const c = Math.cos(th), sn = Math.sin(th);
      m.pos.push(p.r * c, p.y, p.r * sn);
      m.nrm.push(p.nr * c, p.ny, p.nr * sn);
      m.uv.push((T.repeats * j) / N, v);
      m.uv1!.push(j / N, v1);
    }
  });
  for (let k = 0; k < rings.length - 1; k++) {
    const a = ringStart[k]!, b = ringStart[k + 1]!;
    for (let j = 0; j < N; j++) m.idx.push(a + j, b + j, a + j + 1, a + j + 1, b + j, b + j + 1);
  }

  // The top: polar rings from the edge ring inwards, planar UVs (u along +x, v along −z).
  const edge = rings[rings.length - 1]!;
  const ys = monotone([...cap].reverse().map((p) => p.r), [...cap].reverse().map((p) => p.y));
  // v1.5 polish: the collar of a 10 mm insertion reaches ≈ 5 mm out from the candle: a wider band.
  const band = tier === 'top' ? { lo: SOCKET_R - 0.058, hi: SOCKET_R + 0.058 } : null;
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
    // Unique atlas: this tier's top as a planar square in the atlas' lower half.
    m.uv1!.push(UNIQUE.top[tier] + 0.25 * (1 + 0.98 * x / UNIQUE.topR[tier]), 0.5 + 0.25 * (1 + 0.98 * z / UNIQUE.topR[tier]));
    return m.pos.length / 3 - 1;
  };
  let prevIdx: number[] = [], prevAng: number[] = [];
  radii.forEach((r, k) => {
    const inBand = band && r <= band.hi + 1e-9 && r >= band.lo - 1e-9;
    const ang = k === 0 ? Array.from({ length: N }, (_, j) => (2 * Math.PI * j) / N) : ringAngles(r, r > 0.3 ? 0.008 : 0.012, inBand ? { step: 0.002, reach: 0.068 } : undefined);
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

// ── Piping: the master's pieces as components (placements for the regenerated piping) ─────
interface PrimData { prim: Primitive; pos: Float32Array; nrm: Float32Array; idx: Uint32Array }
interface Component { verts: { d: PrimData; i: number }[]; min: V3; max: V3; centroid: V3 }

export function primData(prim: Primitive): PrimData {
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

export function components(d: PrimData): Component[] {
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

// ── Swag strands and round piping, re-tessellated (v1.5 polish) ───────────────────
/**
 * The master's swag strands are open half-pipes of 8 sides × 20 segments (21 rings of 9), one end
 * drawn to a point, the other cut square: faceted at laptop size, the cut ends showing as sliced
 * stubs beside the columns. Rebuilt as a Catmull-Rom surface through the same points (16 sides ×
 * 40 segments), and every end closed into a rounded tail sunk into the cake, as a piping
 * bag lifted away leaves it.
 */
export const STRAND = { rings: 21, side: 9, around: 2, along: 2, tail: 0.18 } as const;

const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Least-squares sphere through points (algebraic fit: |p|² = 2c·p + k). */
function fitSphere(pts: V3[]): { c: V3; r: number } {
  const M = new Float64Array(16), v = new Float64Array(4);
  for (const p of pts) {
    const row = [2 * p[0], 2 * p[1], 2 * p[2], 1], b = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
    for (let i = 0; i < 4; i++) { v[i] = v[i]! + row[i]! * b; for (let j = 0; j < 4; j++) M[i * 4 + j] = M[i * 4 + j]! + row[i]! * row[j]!; }
  }
  // Gaussian elimination.
  const A = Array.from({ length: 4 }, (_, i) => [M[i * 4]!, M[i * 4 + 1]!, M[i * 4 + 2]!, M[i * 4 + 3]!, v[i]!]);
  for (let i = 0; i < 4; i++) {
    let piv = i;
    for (let r = i + 1; r < 4; r++) if (Math.abs(A[r]![i]!) > Math.abs(A[piv]![i]!)) piv = r;
    [A[i], A[piv]] = [A[piv]!, A[i]!];
    for (let r = 0; r < 4; r++) {
      if (r === i) continue;
      const f = A[r]![i]! / A[i]![i]!;
      for (let c = i; c < 5; c++) A[r]![c] = A[r]![c]! - f * A[i]![c]!;
    }
  }
  const x = A.map((row, i) => row[4]! / row[i]!);
  const c: V3 = [x[0]!, x[1]!, x[2]!];
  return { c, r: Math.sqrt(Math.max(1e-12, x[3]! + c[0] * c[0] + c[1] * c[1] + c[2] * c[2])) };
}


// ── Relief and roughness maps for the tier bodies (generated, physical units) ─────
/** Atlas size (px): the side relief at ≈ 0.1 mm a texel, the tops at ≈ 0.2 mm. */
export const ATLAS = 2048;

/**
 * v1.6 unique atlas (TEXCOORD_1, one texel per place on the body, 0.75 mm on the bottom tier's side):
 * what the body's light depends on that cannot repeat (the piping's occlusion and contact). Bands:
 * the bottom tier's side in v 0–0.125, the top tier's side in 0.125–0.25 (u = angle, 1024 × 128 each);
 * the tops as 512² planar squares in the lower half (bottom tier left, top tier right).
 */
export const UNIQUE = {
  width: 1024, height: 1024,
  band: 0.125,
  side: { bottom: 0, top: 0.125 } as Record<'bottom' | 'top', number>,
  top: { bottom: 0, top: 0.5 } as Record<'bottom' | 'top', number>,
  topR: { bottom: 0.575, top: 0.44 } as Record<'bottom' | 'top', number>,
} as const;

/**
 * An air pocket (cm): position, radii and orientation, an irregular outline (two lobes), depth, and
 * whether it is an open bubble (steep wall) or a soft dent.
 */
interface Pocket { x: number; y: number; rx: number; ry: number; cos: number; sin: number; l2: number; p2: number; l3: number; p3: number; depth: number; open: boolean }

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
        // Sizes on a steep power law: mostly pinholes (0.3 mm), now and then a 2 mm bubble.
        const rad = 0.015 + 0.09 * r() ** 3.2;
        const ang = r() * Math.PI;
        this.cells.set(`${gx},${gy}`, {
          x: (gx + r()) * cell, y: (gy + r()) * cell, rx: rad * (1 + 0.9 * r()), ry: rad, cos: Math.cos(ang), sin: Math.sin(ang),
          l2: 0.25 * r(), p2: r() * 6.283, l3: 0.18 * r(), p3: r() * 6.283,
          // v1.6 polish: soft dents only (the open, steep-walled bubbles read as isolated crater rings at a
          // distance); the runtime's clustered pinholes (models/cakeShaders.ts) are the open ones.
          depth: rad * (0.05 + 0.15 * r()), open: r() < 0, // (the draw kept: the stream stays as it was)
        });
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

/** A pocket's depth at (dx, dy) from its centre (cm, ≤ 0) and its mask (0–1): irregular, no rim. */
function pocketAt(p: Pocket, dx: number, dy: number): [number, number] {
  const u = (dx * p.cos + dy * p.sin) / p.rx, v = (-dx * p.sin + dy * p.cos) / p.ry;
  const d = Math.hypot(u, v);
  if (d > 1.8) return [0, 0];
  const phi = Math.atan2(v, u);
  const q = d / (1 + p.l2 * Math.sin(2 * phi + p.p2) + p.l3 * Math.sin(3 * phi + p.p3));
  // An open bubble has a steep wall; a dent is a soft hollow.
  const h = p.open ? 1 - smoothstep(0.7, 1.0, q) : Math.exp(-2.2 * q * q);
  return [-p.depth * h, 1 - smoothstep(0.6, 1.1, q)];
}

/**
 * Height field (cm) of the side finish at (x along the circumference, y up): bench-scraper streaks
 * that run around the cake (constant y), their strength drifting along x where the pressure
 * changed, a soft waviness, and the air pockets the scraper opened. Periodic in x (20 cm).
 */
function sideHeight(x: number, y: number, P: Pockets): { h: number; pocket: number } {
  const period = 20;
  const u = x / period;
  let h = 0;
  // Scraper lines: not a brushed texture but a few discrete ridges and grooves (a nick in the blade,
  // a crumb dragged round), ≈ 1 in 3 of 2.4 mm slots carries one; each 0.3–0.9 mm wide, ±20–50 µm,
  // fading in and out along the turn as the pressure changed. Plus a faint fine grain.
  const slot = 0.24, gy = Math.floor(y / slot);
  for (let k = gy - 2; k <= gy + 2; k++) {
    if (hash2(k, 7, 61) > 0.36) continue;
    const r1 = hash2(k, 8, 61), r2 = hash2(k, 9, 61), r3 = hash2(k, 10, 61);
    const centre = (k + r1) * slot, width = 0.03 + 0.06 * r2;
    const amp = (r3 > 0.5 ? 1 : -1) * (0.002 + 0.003 * r3);
    const along = Math.max(0, fbm(u * 5 + k * 1.7, k * 0.37, 71, 2, 5) * 1.6 + 0.2);
    h += amp * along * Math.exp(-(((y - centre) / width) ** 2));
  }
  h += 0.0006 * fbm(u * 3, y * 9, 11, 2, 3);
  // Soft waviness (1–4 cm), ±0.25 mm: the scraper's passes, what keeps the broad highlight from
  // reading as a lathe at a distance (slopes ≈ 2–4°).
  h += 0.025 * fbm(u * 7, y * 0.4, 17, 3, 7);
  // v1.6 knife chatter: where the scraper juddered as it was pulled round, near-vertical ripples
  // ≈ 2.9 mm apart, 25–55 µm, in patches over about a third of the side (they read in the satin
  // highlight at laptop size: slopes of 3–6°).
  const chatterEnv = Math.max(0, fbm(u * 4, y * 0.13, 83, 2, 4) * 2.4 - 0.45);
  if (chatterEnv > 0) {
    // v1.6 polish: shallower and irregular (pitch and phase wander), so it is no corduroy.
    const ph = (2 * Math.PI * 69 * (x + 0.1 * y)) / period + 6.5 * fbm(u * 9, y * 0.4, 89, 3, 9);
    h += 0.0012 * Math.min(chatterEnv, 1) * (Math.sin(ph) + 0.35 * Math.sin(2.3 * ph + 1.1)) * (0.6 + 0.8 * fbm(u * 20, y * 1.3, 91, 2, 20));
  }
  let pocket = 0;
  for (const p of P.near(x, y, scratch)) {
    let dx = x - p.x;
    dx -= period * Math.round(dx / period);
    const [dh, m] = pocketAt(p, dx, y - p.y);
    h += dh;
    pocket = Math.max(pocket, m);
  }
  return { h, pocket };
}

interface Stroke { cx: number; cz: number; R: number; w: number; a0: number; a1: number; depth: number; lip: number }

/**
 * Palette-knife swooshes across a top (cm, centred): broad arcs 2.5–5 cm wide, each a shallow
 * scoop (0.1–0.25 mm) with a soft lip of buttercream (3–5 mm wide, 0.1–0.2 mm) on its outer side
 * where the knife pushed it, laid one over another. Millimetre-scale and low in frequency: no
 * hairline edges (v1.5 polish: the thin lifted-edge lines read as cracks, in the bin as foil).
 */
function strokesFor(seed: number, radius: number): Stroke[] {
  const r = mulberry32(seed);
  return Array.from({ length: 26 }, () => {
    const R = 5 + 7 * r();
    const ang = r() * 2 * Math.PI, dist = radius * Math.sqrt(r()) * 1.05;
    const a0 = r() * 2 * Math.PI;
    return { cx: dist * Math.cos(ang) - R * Math.cos(a0 + 0.5), cz: dist * Math.sin(ang) - R * Math.sin(a0 + 0.5), R, w: 2.5 + 2.5 * r(), a0, a1: a0 + 0.6 + 0.8 * r(), depth: 0.016 + 0.024 * r(), lip: 0.014 + 0.014 * r() };
  });
}

function topHeight(x: number, z: number, S: Stroke[], P: Pockets): { h: number; pocket: number; edge: number } {
  let h = 0.016 * fbm(x * 0.35, z * 0.35, 23, 3);
  // v1.6 the turntable's spiral: the cake turned under a resting spatula leaves an Archimedean
  // spiral of shallow ridges (≈ 7.5 mm apart, up to 70 µm), patchy, fading out at the centre where
  // the blade was lifted; the knife strokes below are laid over it.
  const rr = Math.hypot(x, z), th = Math.atan2(z, x);
  const spiralEnv = smoothstep(0.6, 2.2, rr) * Math.max(0, 0.55 + 0.6 * fbm(x * 0.4 + 3, z * 0.4, 97, 2));
  if (spiralEnv > 0) {
    // v1.6 polish: fainter and wandering (it read as regular rings in the ganache's gloss).
    const ph = (2 * Math.PI * rr) / 0.75 - th + 4.0 * fbm(x * 0.6, z * 0.6, 101, 3);
    h += 0.004 * spiralEnv * (Math.sin(ph) + 0.3 * Math.sin(2 * ph + 0.7)) * (0.5 + fbm(x * 1.5, z * 1.5, 103, 2));
  }
  let edge = 0;
  for (const s of S) {
    const dx = x - s.cx, dz = z - s.cz;
    const rr = Math.hypot(dx, dz);
    let a = Math.atan2(dz, dx) - s.a0;
    a -= 2 * Math.PI * Math.floor(a / (2 * Math.PI));
    const span = s.a1 - s.a0;
    if (a > span + 0.3) continue;
    const along = smoothstep(0, 0.25, a) * (1 - smoothstep(span - 0.1, span + 0.3, a));
    const across = (rr - s.R) / (s.w / 2);
    if (Math.abs(across) > 1.8) continue;
    // Within the band the knife sets the surface: the scoop replaces what was under it.
    const inside = (1 - smoothstep(0.75, 1.15, Math.abs(across))) * along;
    const scoop = -s.depth * (1 - across * across) ** 2 * (Math.abs(across) < 1 ? 1 : 0);
    h = h * (1 - inside) + scoop * inside;
    // The lip: buttercream pushed out of the scoop, soft, on the outer side.
    const lip = s.lip * Math.exp(-(((across - 1.1) / 0.28) ** 2)) * along;
    h += lip;
    edge = Math.max(edge, lip / 0.02);
  }
  let pocket = 0;
  for (const p of P.near(x, z, scratch)) {
    const [dh, m] = pocketAt(p, x - p.x, z - p.y);
    h += dh;
    pocket = Math.max(pocket, m);
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
 * metallic-roughness map (G = roughness 0.40–0.66, B = metalness 0) as RGBA8, ATLAS × ATLAS.
 */
export function frostingMaps(size = ATLAS): { normal: Uint8Array; roughness: Uint8Array; albedo: Uint8Array; stats: { min: number; max: number; mean: number } } {
  const H = new Float32Array(size * size), pocketMask = new Float32Array(size * size), edgeMask = new Float32Array(size * size);
  // Side region: v 0.02–0.48 ↔ y 0–9.4 cm (one UV unit ≈ 20.4 cm), u 0–1 ↔ x 0–20 cm.
  const sideCm = { x: 20, y: 20.4 };
  // Top region: the square u 0.27–0.73, v 0.52–0.98 ↔ the top tier's 18.9 cm across (UV unit 41 cm).
  const topCm = (2 * TIERS.top.mapR * 1.1 * 20) / 0.46;
  const sideP = new Pockets(101, 0.6, 0.07, sideCm.x, 0, sideCm.x, -1, 0.5 * sideCm.y + 1);
  const topP = new Pockets(202, 0.9, 0.08, 0, -topCm / 2, topCm / 2, -topCm / 2, topCm / 2);
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
  const normal = new Uint8Array(size * size * 4), roughness = new Uint8Array(size * size * 4), albedo = new Uint8Array(size * size * 4);
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
      // v1.5 polish: satin, not clay. Buttercream is fat and sugar: a soft broad highlight on the
      // smoothed highs (≈ 0.42), matt in the lows and pockets (≈ 0.62); mean ≈ 0.52.
      const base = 0.52 + 0.035 * fbm((px / size) * 7, (py / size) * 7, 41, 3, top ? 0 : 7);
      let rough = base - 0.04 * clamp(hp, -2.5, 2.5) + 0.12 * pocketMask[k]! - 0.04 * edgeMask[k]!;
      rough = clamp(rough, 0.4, 0.66);
      min = Math.min(min, rough); max = Math.max(max, rough); sum += rough;
      roughness[4 * k] = 255;
      roughness[4 * k + 1] = Math.round(rough * 255);
      roughness[4 * k + 2] = 0;
      roughness[4 * k + 3] = 255;
      // Albedo multiplier (sRGB, ≈ 0.965–1.0): a hand-scraped finish is not one even film. Where the
      // blade pressed (the relief's lows) the cream is denser and reads a touch deeper; a pocket's
      // floor is a shade darker. Mean ≈ 0.99 (sRGB): the palette colour is what the eye averages.
      const a = clamp(0.997 + 0.008 * clamp(hp, -2.5, 0.4) + 0.006 * fbm((px / size) * 5, (py / size) * 5, 47, 3, top ? 0 : 5) - 0.02 * pocketMask[k]!, 0.95, 1);
      const a8 = Math.round(a * 255);
      albedo[4 * k] = a8; albedo[4 * k + 1] = a8; albedo[4 * k + 2] = a8; albedo[4 * k + 3] = 255;
    }
  }
  return { normal, roughness, albedo, stats: { min, max, mean: sum / (size * size) } };
}

/**
 * 2×2 box average (RGBA8): roughness and the albedo finish vary slowly and ship at half the relief's
 * size (GPU memory 64 → 32 MiB); a box keeps the values inside the generated range (Lanczos rings).
 */
function halve(data: Uint8Array, size: number): Uint8Array {
  const h = size / 2, out = new Uint8Array(h * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < h; x++) for (let c = 0; c < 4; c++) {
    const at = (dx: number, dy: number) => data[((2 * y + dy) * size + 2 * x + dx) * 4 + c]!;
    out[(y * h + x) * 4 + c] = Math.round((at(0, 0) + at(1, 0) + at(0, 1) + at(1, 1)) / 4);
  }
  return out;
}

async function pngWH(data: Uint8Array, w: number, h: number): Promise<Uint8Array> {
  return new Uint8Array(await loadSharp()(data, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 6 }).toBuffer());
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

/** Which tier a master node belongs to, and how the finish field moves it. */
function nodeInfo(name: string): { tier: TierId; kind: Kind } | null {
  const m = FROSTING_NODE.exec(name);
  if (!m) return null;
  const tier = m[1] as TierId;
  const part = name.slice(m[0].length).replace(/^_/, '');
  switch (part) {
    case '': return { tier, kind: 'body' };
    case 'shell_border': return { tier, kind: 'ledge' };
    case 'border_pearls': return { tier, kind: 'ledge' };
    case 'dots': return { tier, kind: 'hang' };
    case 'pearls': return { tier, kind: 'hang' };
    case 'tassels': return { tier, kind: 'column' };
    case 'drops': return { tier, kind: 'column' };
    case 'rosettes': return { tier, kind: 'crown' };
    case 'top_rosettes': return { tier, kind: 'crown' };
    case 'swags': return { tier, kind: 'hang' };
    case 'rope_edge': return { tier, kind: 'side' };
    default: throw new Error(`birthday finish: unknown frosting node ${name}`);
  }
}

export interface FinishReport {
  lines: string[];
}

// ── v1.6: the piping regenerated as sculpted star-tip sweeps (birthdayPiping.ts) ─────────
/** The side's radius at height y on the master's own profile (the tier's outer surface, scan units). */
function sideRadius(prof: ProfilePoint[]): (y: number) => number {
  // The outer run: from the first point off the bottom cap to the last before the top cap.
  const a = prof.findIndex((p) => p.ny > -0.995);
  const b = prof.findIndex((p, i) => i > a && p.ny > 0.995);
  const run = prof.slice(Math.max(0, a - 1), b + 1).sort((p, q) => p.y - q.y);
  return (y: number) => {
    if (y <= run[0]!.y) return run[0]!.r;
    for (let i = 0; i < run.length - 1; i++) {
      const p = run[i]!, q = run[i + 1]!;
      if (y <= q.y) return p.r + ((q.r - p.r) * (y - p.y)) / Math.max(q.y - p.y, 1e-9);
    }
    return run[run.length - 1]!.r;
  };
}

interface Local { theta: number; rMin: number; rMax: number; tMin: number; tMax: number; yMin: number; yMax: number; centroid: V3 }
/** A master piece's extents in its own (radial, tangential, height) frame about the cake axis. */
function localOf(c: Component, R: number): Local {
  const theta = Math.atan2(c.centroid[2], c.centroid[0]);
  const o: Local = { theta, rMin: Infinity, rMax: -Infinity, tMin: Infinity, tMax: -Infinity, yMin: Infinity, yMax: -Infinity, centroid: c.centroid };
  for (const { d, i } of c.verts) {
    const x = d.pos[3 * i]!, y = d.pos[3 * i + 1]!, z = d.pos[3 * i + 2]!;
    const r = Math.hypot(x, z), a = Math.atan2(z, x) - theta;
    const t = Math.atan2(Math.sin(a), Math.cos(a)) * r;
    o.rMin = Math.min(o.rMin, r - R); o.rMax = Math.max(o.rMax, r - R);
    o.tMin = Math.min(o.tMin, t); o.tMax = Math.max(o.tMax, t);
    o.yMin = Math.min(o.yMin, y); o.yMax = Math.max(o.yMax, y);
  }
  return o;
}

/** Fine spheres (sugar pearls), each a dragée a hair out of round. */
/** Vertices of one pearl (pearlSpheres: (RINGS + 1) × (SEG + 1)). */
const PEARL_VERTS = 14 * 21;
function pearlSpheres(list: { c: V3; r: number }[], seed: number): Mesh {
  const m: Mesh = { pos: [], nrm: [], uv: [], idx: [] };
  const SEG = 20, RINGS = 13;
  list.forEach(({ c, r }, k) => {
    const g = stream(seed + 31 * k);
    const ax: V3 = [1 + 0.035 * g.s(), 1 + 0.035 * g.s(), 1 + 0.035 * g.s()];
    const start = m.pos.length / 3;
    for (let i = 0; i <= RINGS; i++) {
      const ph = (i / RINGS) * Math.PI;
      for (let j = 0; j <= SEG; j++) {
        const th = (j / SEG) * 2 * Math.PI;
        const nx = Math.sin(ph) * Math.cos(th), ny = Math.cos(ph), nz = Math.sin(ph) * Math.sin(th);
        m.pos.push(c[0] + r * ax[0] * nx, c[1] + r * ax[1] * ny, c[2] + r * ax[2] * nz);
        const nn = norm([nx / ax[0], ny / ax[1], nz / ax[2]]);
        m.nrm.push(...nn);
        m.uv.push(j / SEG, i / RINGS);
      }
    }
    for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEG; j++) {
      const a = start + i * (SEG + 1) + j;
      m.idx.push(a, a + SEG + 1, a + 1, a + 1, a + SEG + 1, a + SEG + 2);
    }
  });
  orient(m);
  return m;
}

/** The master's 21 × 9 swag strands: per strand, the feet on the surface, its normals and its size. */
function masterStrands(prim: Primitive, R: (y: number) => number): { feet: V3[]; normals: V3[]; w: number; h: number }[] {
  const pos = read(prim.getAttribute('POSITION')!);
  const per = STRAND.rings * STRAND.side;
  if ((pos.length / 3) % per) throw new Error('birthday finish: swags are not 21 × 9 strands');
  const out: { feet: V3[]; normals: V3[]; w: number; h: number }[] = [];
  for (let s = 0; s < pos.length / 3 / per; s++) {
    const P = (k: number, j: number): V3 => { const i = s * per + k * STRAND.side + j; return [pos[3 * i]!, pos[3 * i + 1]!, pos[3 * i + 2]!]; };
    const feet: V3[] = [], normals: V3[] = [];
    let w = 0, h = 0;
    // The master's end rings are drawn to a point: the path runs between the second and the second-last.
    for (let k = 1; k < STRAND.rings - 1; k++) {
      const q0 = P(k, 0), q8 = P(k, STRAND.side - 1), apex = P(k, (STRAND.side - 1) / 2);
      const M: V3 = [(q0[0] + q8[0]) / 2, (q0[1] + q8[1]) / 2, (q0[2] + q8[2]) / 2];
      const th = Math.atan2(M[2], M[0]);
      const n: V3 = [Math.cos(th), 0, Math.sin(th)];
      const r = R(M[1]);
      feet.push([r * n[0], M[1], r * n[2]]);
      normals.push(n);
      const out = Math.hypot(apex[0], apex[2]) - r;
      h = Math.max(h, out);
      let lat = 0;
      for (let j = 0; j < STRAND.side; j++) { const q = P(k, j); lat = Math.max(lat, len(sub(q, add(M, mul(n, dot(sub(q, M), n)))))); }
      w = Math.max(w, lat);
    }
    out.push({ feet, normals, w, h });
  }
  return out;
}

/**
 * Regenerates every piped part of the master as sculpted star-tip sweeps (birthdayPiping.ts) at the
 * master's own placements, sizes and counts, each from its own seed. Returns the vertex count.
 */
function regeneratePiping(doc: Document, nodes: Node[], profiles: Record<TierId, ProfilePoint[]>, log: (line: string) => void): void {
  const hash = new PipingHash();
  const deferred: { prim: Primitive; pearls: { c: V3; r: number; d?: V3; cap?: number; optional?: boolean }[]; seed: number; name: string; before: number }[] = [];
  for (const node of nodes) {
    const name = node.getName();
    const info = nodeInfo(name);
    if (!info || info.kind === 'body') continue;
    const tier = info.tier;
    const T = TIERS[tier];
    const R = sideRadius(profiles[tier]);
    const prims = node.getMesh()!.listPrimitives();
    const part = name.slice(`tier_${tier}`.length).replace(/^_/, '');
    const out = emptyMesh();
    const seed0 = seedOf(name);
    const pearls: { c: V3; r: number; d?: V3; cap?: number; optional?: boolean }[] = [];
    const comps = () => components(primData(prims[0]!)).map((c) => localOf(c, T.R));
    switch (part) {
      case 'swags': {
        const strands = masterStrands(prims[0]!, R);
        // v1.6 polish (fix 2): each bay hangs its own way (±2.6 mm at the low point, the bay's strands
        // together, ±0.5 mm each): the strands grouped into bays by their middles' angle.
        const bw = (2 * Math.PI) / BAYS[tier].count;
        const xs = strands.map((st) => { const m = st.feet[st.feet.length >> 1]!; return Math.atan2(m[2], m[0]) / bw; });
        const phase = Math.atan2(xs.reduce((a, x) => a + Math.sin(2 * Math.PI * x), 0), xs.reduce((a, x) => a + Math.cos(2 * Math.PI * x), 0)) / (2 * Math.PI);
        strands.forEach((st, k) => {
          const bay = ((Math.round(xs[k]! - phase) % BAYS[tier].count) + BAYS[tier].count) % BAYS[tier].count;
          const drop = (2.6 * (2 * hash1(bay, seed0 + 17) - 1) + 0.5 * stream(seed0 + 41 * k).s()) * MM;
          appendMesh(out, swagStrand(st.feet, st.normals, 0.95 * st.w, 0.92 * st.h, seed0 + 7919 * k, { drop }));
        });
        break;
      }
      case 'drops': {
        comps().forEach((c, k) => {
          const g = stream(seed0 + k);
          const w = (c.tMax - c.tMin) / 2, h = c.rMax;
          // (v1.6 polish, fix 4: pleats of uneven depth and a pulled, uneven end, not a turned part.)
          appendMesh(out, pulledLine(c.theta, c.yMax - 0.004, c.yMin + 0.002, R, 0.86 * w, 0.82 * h, (s) => 1 - 0.1 * s + 0.05 * Math.sin(5 * s + k) + 0.03 * Math.sin(13 * s + 2 * k), { ...STAR, teeth: 16, perTooth: 5, toothJitter: 0.3, toothDrift: 5 }, seed0 + 101 * k, { amp: 0.17, lean: 0.03 * g.s(), twist: 0.6, hem: 0.5 * MM }));
        });
        break;
      }
      case 'tassels': {
        comps().forEach((c, k) => {
          const w = (c.tMax - c.tMin) / 2, h = c.rMax;
          const fan = c.yMax - c.yMin > 0.012 * 1.2 && w > 0.04;
          if (fan) {
            // A flared skirt: narrow at its collar, widest just above where it stands on the border.
            // (v1.6 polish, fix 4: irregular pulled pleats and a tapered, scalloped hem.)
            appendMesh(out, pulledLine(c.theta, c.yMax, c.yMin + 0.004, R, 0.8 * w, 0.78 * h, (s) => 0.35 + 0.65 * Math.pow(s, 0.8) - 0.3 * smoothstep(0.82, 1, s), { ...STAR, teeth: 18, perTooth: 4, toothJitter: 0.3, toothDrift: 4 }, seed0 + 211 * k, { amp: 0.21, cap0: 0.12, tail: 0.1, twist: 0.5, flare: 0.2, hem: 0.6 * MM }));
          } else {
            // An onion bulb under a thin collar.
            appendMesh(out, pulledLine(c.theta, c.yMax, c.yMin, R, 0.82 * w, 0.82 * h, (s) => 0.3 + 0.75 * Math.sin(Math.PI * Math.pow(s, 0.85)) ** 0.9, { ...STAR, teeth: 14, perTooth: 4, toothJitter: 0.28, toothDrift: 4 }, seed0 + 307 * k, { amp: 0.2, cap0: 0.15, tail: 0.15, twist: 0.8, hem: 0.4 * MM }));
          }
        });
        break;
      }
      case 'dots': {
        comps().forEach((c, k) => {
          const yc = (c.yMin + c.yMax) / 2;
          const r = R(yc);
          const n: V3 = [Math.cos(c.theta), 0, Math.sin(c.theta)];
          const size = 0.5 * Math.max(c.tMax - c.tMin, c.yMax - c.yMin);
          // v1.6 polish (fix 2): ±20 % in size, each dot its own.
          appendMesh(out, pipedDot([r * n[0], yc, r * n[2]], n, [0, -1, 0], 0.92 * size * (1 + 0.2 * stream(seed0 + 409 * k + 3).s()), seed0 + 409 * k));
        });
        break;
      }
      case 'shell_border': {
        const ledge = tier === 'bottom' ? MASTER.plateTop : TIERS.bottom.y1;
        const list = comps();
        // A shell border is piped one way round: each head is squeezed onto the last one's tail.
        const angles = list.map((c) => c.theta).sort((a, b) => a - b);
        const gaps = angles.map((a, i) => (i ? a - angles[i - 1]! : a + 2 * Math.PI - angles[angles.length - 1]!)).sort((a, b) => a - b);
        const spacing = gaps[Math.floor(gaps.length / 2)]!;
        list.forEach((c, k) => {
          const depth = c.rMax - c.rMin;
          const rS = T.R + depth * 0.36;
          // v1.6 polish (fix 3): 1.6 slots long, the head on the master's shell, so its tail runs on
          // under the next head (one chain, no gap).
          const lengthS = spacing * rS * 1.6;
          const th0 = c.theta - 0.35 * 1.6 * spacing;
          // The bottom border beds into the plate down to the master's underside (MASTER.cakeBottom, the
          // contract's cake_secondary origin); the upper one a millimetre into the ledge.
          const sinkDepth = tier === 'bottom' ? 1.15 * (ledge - MASTER.cakeBottom) : 0.9 * MM;
          const sh = shell(th0, ledge, T.R, lengthS, 0.95 * (c.yMax - ledge), depth, 1, seed0 + 503 * k, sinkDepth, { headAt: 0.35, bulge: tier === 'bottom' ? 0.3 : 0.15 });
          // Flat on the underside the contract measures from (hidden in the plate).
          if (tier === 'bottom') for (let i = 1; i < sh.pos.length; i += 3) sh.pos[i] = Math.max(sh.pos[i]!, MASTER.cakeBottom);
          appendMesh(out, sh);
        });
        break;
      }
      case 'rope_edge': {
        const pd = primData(prims[0]!);
        let y0 = Infinity, y1 = -Infinity;
        for (let i = 1; i < pd.pos.length; i += 3) { y0 = Math.min(y0, pd.pos[i]!); y1 = Math.max(y1, pd.pos[i]!); }
        appendMesh(out, ropeBorder((y0 + y1) / 2, R, 0.95 * (y1 - y0), seed0));
        break;
      }
      case 'rosettes':
      case 'top_rosettes': {
        const crown = part === 'top_rosettes';
        const pearlComps = prims[1] ? components(primData(prims[1])) : [];
        comps().forEach((c, k) => {
          const g = stream(seed0 + 601 * k);
          const yc = (c.yMin + c.yMax) / 2;
          const radial: V3 = [Math.cos(c.theta), 0, Math.sin(c.theta)];
          const pc = pearlComps.reduce((best, p) => (len(sub(p.centroid, c.centroid)) < len(sub(best.centroid, c.centroid)) ? p : best), pearlComps[0]!);
          const pr = pc ? (pc.max[1] - pc.min[1]) / 2 : 0.012;
          // v1.6 polish (fix 2): no two alike: ±15 % in size, tipped up to ±8° off the design, the
          // pearl set off the centre by hand, and one rosette in four or five left without one.
          const tilt = (axis: V3): V3 => {
            const side = norm(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
            return norm(rotate(axis, norm(rotate(side, axis, g.r() * 2 * Math.PI)), (8 * Math.PI / 180) * g.s()));
          };
          const pearlAt = (top: V3, axis: V3, R0: number, sink: number) => {
            const side = norm(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
            const d = norm(rotate(side, axis, g.r() * 2 * Math.PI));
            const keep = g.r() > 0.12;
            const at = add(add(top, mul(axis, -sink * pr)), mul(d, R0 * (0.06 + 0.16 * g.r())));
            if (keep) pearls.push({ c: at, r: pr * (1 + 0.08 * g.s()), d: axis, cap: 0.6 });
          };
          if (crown) {
            // Small rosettes round the top's edge, tipped a little outward over it: domed swirls
            // (each loop riding up on the last) pulled off in a tapered tail.
            const rr = T.R + (c.rMin + c.rMax) / 2;
            const centre: V3 = [rr * radial[0], T.y1 - 0.003, rr * radial[2]];
            const axis = tilt(norm(add([0, 1, 0], mul(radial, 0.06 + 0.04 * g.s()))));
            const size = 0.5 * (c.tMax - c.tMin);
            const R0 = size * (1 + 0.15 * g.s());
            const { mesh, seat } = domedSwirl(centre, axis, radial, R0, seed0 + 613 * k);
            appendMesh(out, mesh);
            // Pressed into the dome beside the tail's peak (not skewered on it).
            pearlAt(seat, axis, 0.15 * R0, -0.3);
          } else {
            // Big rosettes on the tier's top edge, facing out and a little up.
            const yr = yc - 0.007;
            const r0 = R(yr);
            const centre: V3 = [r0 * radial[0], yr, r0 * radial[2]];
            const axis = tilt(norm(add(radial, [0, 0.16 + 0.06 * g.s(), 0])));
            const size = 0.5 * Math.max(c.tMax - c.tMin, c.yMax - c.yMin);
            const R0 = size * (1 + 0.15 * g.s());
            const { mesh, top } = spiralRosette(centre, axis, [0, 1, 0], R0, seed0 + 619 * k, { rope: 0.4, turns: 1.25, droop: [0, -0.9 * MM * (1 + 0.4 * g.s()), 0], rest: restOn(profiles[tier]) });
            appendMesh(out, mesh);
            // Its back: the buttercream it was piped onto the edge with (seen from behind, over the
            // far side of the top), a soft mass inside the coil's outline (v1.6 polish 2: no ridged loops).
            appendMesh(out, backMound(centre, axis, R0, seed0 + 631 * k));
            pearlAt(top, axis, R0, -0.45);
          }
        });
        break;
      }
      case 'pearls':
      case 'border_pearls': {
        // Dragées pressed into the frosting where the master set them: sizes ±6 %, a third sunk.
        components(primData(prims[0]!)).forEach((c, k) => {
          const g = stream(seed0 + 701 * k);
          const pts = c.verts.map(({ d, i }) => [d.pos[3 * i]!, d.pos[3 * i + 1]!, d.pos[3 * i + 2]!] as V3);
          let { c: ctr, r } = fitSphere(pts);
          const box = (c.max[0] - c.min[0] + c.max[1] - c.min[1] + c.max[2] - c.min[2]) / 6;
          if (!(r > 0.3 * box && r < 2.5 * box) || dist(ctr, c.centroid) > 2 * box) { ctr = c.centroid; r = box; }
          const size = 1 + 0.06 * g.s();
          if (part === 'border_pearls') {
            // v1.6 polish 2 (the re-judge's optional item): a shell border is not dotted at every junction:
            // a third of the dragées left off, the rest set by hand (±10 % in size, off the junction by
            // up to a tenth of their radius along and across the border).
            const h = stream(seed0 + 7919 * k + 5);
            if (h.r() < 0.33) return;
            const t: V3 = norm([-ctr[2], 0, ctr[0]]);
            ctr = add(add(ctr, mul(t, 0.1 * r * h.s())), mul(norm([ctr[0], 0, ctr[2]]), 0.1 * r * h.s()));
            pearls.push({ c: ctr, r: r * (1 + 0.1 * h.s()), cap: 3 });
            return;
          }
          pearls.push({ c: ctr, r: r * size, cap: 1.4 });
        });
        break;
      }
      default:
        throw new Error(`birthday finish: no generator for ${name}`);
    }
    const before = prims.reduce((a, p) => a + p.getAttribute('POSITION')!.getCount(), 0);
    if (part === 'pearls' || part === 'border_pearls') {
      deferred.push({ prim: prims[0]!, pearls, seed: seed0, name, before });
      continue;
    }
    hash.add(out.pos);
    const bad = out.pos.findIndex((v) => !Number.isFinite(v)), badN = out.nrm.findIndex((v) => !Number.isFinite(v));
    if (bad >= 0 || badN >= 0) throw new Error(`birthday finish: ${name} has a non-finite ${bad >= 0 ? 'position' : 'normal'} (vertex ${Math.floor(Math.max(bad, badN) / 3)})`);
    setGeometry(doc, prims[0]!, { pos: out.pos, nrm: out.nrm, uv: new Array((out.pos.length / 3) * 2).fill(0), idx: out.idx, extra: { _RIDGE: out.ridge } });
    if (prims[1] && pearls.length) deferred.push({ prim: prims[1], pearls, seed: seed0 + 1, name: `${name} pearls`, before: 0 });
    log(`  piping ${name}: sculpted (${before} → ${out.pos.length / 3} vertices)`);
  }
  // v1.6 polish (fix 3): every sugar pearl bedded in what it was pressed into, once all the piping is
  // built: lifted out along the way it faces until the piping holds only its lowest part (no piping
  // through its visible side: the "bitten" pearls), the frosting round it its fillet.
  let lifted = 0, maxLift = 0, buried = 0, merged = 0;
  // v1.6 polish 2: two dragées the bedding lifted into each other read as one egg (the column tops):
  // the smaller of an overlapping pair is left off.
  const placed: { c: V3; r: number }[] = [];
  for (const d of deferred) {
    const kept: typeof d.pearls = [];
    for (const pr of d.pearls) {
      const t = hash.bed(pr.c, pr.r, pr.d, pr.cap, !!pr.optional);
      // One the piping has closed over (a shell border's dragée under the next head) is not there.
      if (t < 0) { buried++; continue; }
      const hit = placed.find((q) => dist(q.c, pr.c) < 0.85 * (q.r + pr.r));
      if (hit && hit.r >= pr.r) { merged++; continue; }
      if (t > 0) { lifted++; maxLift = Math.max(maxLift, t / pr.r); }
      kept.push(pr);
      placed.push(pr);
    }
    d.pearls = kept;
    const m = pearlSpheres(d.pearls, d.seed);
    setGeometry(doc, d.prim, m);
    log(`  piping ${d.name}: ${d.pearls.length} dragées (${d.before} → ${m.pos.length / 3} vertices)`);
  }
  log(`  pearls bedded: ${lifted} lifted out of the piping (up to ${maxLift.toFixed(2)} r), ${buried} buried under it (left out), ${merged} overlapping a larger one (left out)`);
}

/** The piping's vertices in a uniform grid (scan units), for bedding the pearls. */
class PipingHash {
  private readonly cells = new Map<string, number[]>();
  constructor(private readonly cell = 0.01) {}
  private key(x: number, y: number, z: number): string { return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)},${Math.floor(z / this.cell)}`; }
  add(pos: ArrayLike<number>): void {
    for (let i = 0; i < pos.length; i += 3) {
      const k = this.key(pos[i]!, pos[i + 1]!, pos[i + 2]!);
      let a = this.cells.get(k);
      if (!a) this.cells.set(k, (a = []));
      a.push(pos[i]!, pos[i + 1]!, pos[i + 2]!);
    }
  }
  near(c: V3, r: number): V3[] {
    const out: V3[] = [];
    const n = Math.ceil(r / this.cell);
    const ix = Math.floor(c[0] / this.cell), iy = Math.floor(c[1] / this.cell), iz = Math.floor(c[2] / this.cell);
    for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) for (let d = -n; d <= n; d++) {
      const pts = this.cells.get(`${ix + a},${iy + b},${iz + d}`);
      if (!pts) continue;
      for (let i = 0; i < pts.length; i += 3) {
        const p: V3 = [pts[i]!, pts[i + 1]!, pts[i + 2]!];
        if (dist(p, c) < r) out.push(p);
      }
    }
    return out;
  }
  /**
   * Beds a pearl (centre `c`, moved in place, radius `r`): the way it faces is away from the piping
   * round it; it is lifted along that until no piping point inside it stands above its lowest
   * 30 %. Returns how far it moved, or −1 if the piping still closes over it at `cap` radii.
   */
  bed(c: V3, r: number, dir?: V3, cap = 1.1, optional = false): number {
    const around = this.near(c, (2.2 + cap) * r);
    if (!around.length) return 0;
    let d: V3;
    if (dir) d = norm(dir);
    else {
      const m: V3 = [0, 0, 0];
      const close = around.filter((p) => dist(p, c) < 2.2 * r);
      for (const p of close) { m[0] += p[0] / close.length; m[1] += p[1] / close.length; m[2] += p[2] / close.length; }
      const out = sub(c, m);
      // Mostly up and out of the cake (a pearl is pressed into the top of what it sits on).
      const radial = norm([c[0], 0, c[2]]);
      d = norm(add(close.length && len(out) > 1e-9 ? norm(out) : radial, mul(add(radial, [0, 1, 0]), 0.35)));
      // Never down (into the plate or the coat): a pearl comes out of what holds it upwards.
      if (d[1] < 0.35) d = norm(add(d, [0, 0.35 - d[1] + 0.2, 0]));
    }
    let t = 0;
    let clear = false;
    for (; t <= cap * r; t += r / 24) {
      const cc = add(c, mul(d, t));
      const bad = around.some((p) => dist(p, cc) < 1.05 * r && dot(sub(p, cc), d) > -0.4 * r);
      if (!bad) { clear = true; break; }
    }
    if (!clear) {
      if (optional) return -1;
      t = cap * r;
    }
    const moved = add(c, mul(d, t));
    c[0] = moved[0]; c[1] = moved[1]; c[2] = moved[2];
    return t;
  }
}

/**
 * The tier's surface seen from a point: signed distance in the (r, y) half-plane to the outer profile
 * (positive outside the cake); `restOn`: how far back along a direction the surface is from a point.
 */
function profileSd(prof: ProfilePoint[]): (r: number, y: number) => number {
  const a = prof.findIndex((p) => p.ny > -0.995);
  const line = prof.slice(Math.max(0, a - 1));
  return (r, y) => {
    let best = Infinity, sign = 1;
    for (let k = 0; k < line.length - 1; k++) {
      const p = line[k]!, q = line[k + 1]!;
      const dr = q.r - p.r, dy = q.y - p.y, l2 = dr * dr + dy * dy || 1e-12;
      const t = clamp(((r - p.r) * dr + (y - p.y) * dy) / l2, 0, 1);
      const pr = p.r + dr * t, py = p.y + dy * t;
      const d = Math.hypot(r - pr, y - py);
      if (d < best) { best = d; sign = (r - pr) * (p.nr + (q.nr - p.nr) * t) + (y - py) * (p.ny + (q.ny - p.ny) * t) >= 0 ? 1 : -1; }
    }
    return sign * best;
  };
}
function restOn(prof: ProfilePoint[]): (p: V3, dir: V3) => number {
  const sd = profileSd(prof);
  const at = (q: V3) => sd(Math.hypot(q[0], q[2]), q[1]);
  return (p, dir) => {
    // March back along −dir from 2 cm in front to 2 cm behind: the first crossing into the cake.
    const step = 0.0004;
    let prev = at(sub(p, mul(dir, -0.02)));
    for (let t = -0.02 + step; t <= 0.02; t += step) {
      const cur = at(sub(p, mul(dir, t)));
      if (prev > 0 && cur <= 0) return t - step * (cur / (cur - prev));
      prev = cur;
    }
    // v1.6 polish 2: no surface within 2 cm (over the top, past the edge): far off it, not on it (0 had
    // settled those feet as resting, with a fillet flared out into the air: the terraces and sheets).
    return Infinity;
  };
}

/**
 * Bakes occlusion and thickness on the finished frosting (positions in scan units, the master's own
 * frame) and returns the body's unique occlusion map: R the room's occlusion (10 mm reach, three's
 * aoMap), G contact (2.5 mm), B how much of the sky a point sees past the piping (unused: 255), A 255.
 */
async function bakeLight(doc: Document, nodes: Node[], log: (line: string) => void): Promise<Uint8Array> {
  const t0 = performance.now();
  const grid = new Occupancy([-0.68, -0.29, -0.68], [0.68, 0.68, 0.68], 0.0025);
  const frosting: { node: Node; prim: Primitive; info: NonNullable<ReturnType<typeof nodeInfo>> }[] = [];
  for (const node of [...nodes, ...doc.getRoot().listNodes().filter((n) => n.getName() === 'cake_smears')]) {
    const smear = node.getName() === 'cake_smears';
    const info = smear ? { tier: 'bottom' as TierId, kind: 'ledge' as Kind } : nodeInfo(node.getName());
    const stand = node.getName() === 'cake_stand';
    if (!info && !stand) continue;
    const M = node.getWorldMatrix();
    for (const prim of node.getMesh()?.listPrimitives() ?? []) {
      let pos = read(prim.getAttribute('POSITION')!);
      if (stand) {
        // The plate the cake stands on (its top only matters): into the frosting's frame.
        const q = new Float32Array(pos.length);
        for (let i = 0; i < pos.length; i += 3) {
          const x = pos[i]!, y = pos[i + 1]!, z = pos[i + 2]!;
          q[i] = M[0]! * x + M[4]! * y + M[8]! * z + M[12]!;
          q[i + 1] = M[1]! * x + M[5]! * y + M[9]! * z + M[13]!;
          q[i + 2] = M[2]! * x + M[6]! * y + M[10]! * z + M[14]!;
        }
        pos = q;
      } else frosting.push({ node, prim, info: info! });
      grid.addTriangles(pos, prim.getIndices()!.getArray()!);
    }
  }
  const baker = new Baker(grid, 24);
  let verts = 0, aoSum = 0, thickMin = Infinity, thickMax = 0;
  for (const { prim, info } of frosting) {
    if (info.kind === 'body') continue;
    const pos = read(prim.getAttribute('POSITION')!), nrm = read(prim.getAttribute('NORMAL')!);
    const n = pos.length / 3;
    const ao = new Float32Array(n), thick = new Float32Array(n);
    const pearl = prim.getMaterial()?.getName() === 'cake_pearl';
    for (let i = 0; i < n; i++) {
      const p: V3 = [pos[3 * i]!, pos[3 * i + 1]!, pos[3 * i + 2]!], nn: V3 = [nrm[3 * i]!, nrm[3 * i + 1]!, nrm[3 * i + 2]!];
      const o = baker.occlusion(p, nn);
      ao[i] = o.far * (0.7 + 0.3 * o.near);
      aoSum += ao[i]!;
      if (!pearl) {
        thick[i] = baker.thickness(p, nn) / MM_SCAN;
        thickMin = Math.min(thickMin, thick[i]!); thickMax = Math.max(thickMax, thick[i]!);
      }
    }
    // v1.6 polish (fix 4): one-ring averages over the mesh: 24 rays leave a vertex's occlusion noisy by
    // a few per cent, and the inward march finds a small dome's far side from one vertex and misses it
    // (to the 15 mm cap) from the next: its faces showed as grey facets (translucency on, off).
    {
      const idx = prim.getIndices()!.getArray()!;
      const smoothV = (v: Float32Array, passes: number) => {
        for (let pass = 0; pass < passes; pass++) {
          const acc = new Float32Array(n), cnt = new Float32Array(n);
          for (let t = 0; t < idx.length; t += 3) {
            const a = idx[t]!, b = idx[t + 1]!, c = idx[t + 2]!;
            acc[a] = acc[a]! + v[b]! + v[c]!; cnt[a] = cnt[a]! + 2;
            acc[b] = acc[b]! + v[a]! + v[c]!; cnt[b] = cnt[b]! + 2;
            acc[c] = acc[c]! + v[a]! + v[b]!; cnt[c] = cnt[c]! + 2;
          }
          for (let i = 0; i < n; i++) if (cnt[i]! > 0) v[i] = 0.5 * v[i]! + 0.5 * (acc[i]! / cnt[i]!);
        }
      };
      smoothV(ao, 2);
      if (!pearl) {
        // (In log: a few cap-length outliers must not lift a thin neighbourhood.)
        for (let i = 0; i < n; i++) thick[i] = Math.log(Math.max(thick[i]!, 0.3));
        smoothV(thick, 5);
        for (let i = 0; i < n; i++) thick[i] = Math.exp(thick[i]!);
      }
    }
    verts += n;
    // Packed for the runtime (models/cakeShaders.ts foodPatch): one normalised RGBA8 attribute, x the
    // tooth ridge (−1…1 → 0…1), y the occlusion, z the thickness over FOOD_THICK_MM, w unused.
    const ridge = prim.getAttribute('_RIDGE') ? read(prim.getAttribute('_RIDGE')!) : null;
    const food = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      food[4 * i] = Math.round(255 * clamp(0.5 + 0.5 * (ridge ? ridge[i]! : 0), 0, 1));
      food[4 * i + 1] = Math.round(255 * clamp(ao[i]!, 0, 1));
      food[4 * i + 2] = Math.round(255 * clamp(thick[i]! / FOOD_THICK_MM, 0, 1));
      food[4 * i + 3] = 255;
    }
    prim.setAttribute('_RIDGE', null);
    prim.setAttribute('_FOOD', doc.createAccessor().setType('VEC4').setArray(food).setNormalized(true).setBuffer(doc.getRoot().listBuffers()[0]!));
  }
  // The body: rasterised in its unique atlas, one bake per texel.
  const W = UNIQUE.width, H = UNIQUE.height;
  const tex = new Uint8Array(W * H * 4);
  const filled = new Uint8Array(W * H);
  let texels = 0;
  for (const { prim, info } of frosting) {
    if (info.kind !== 'body') continue;
    const pos = read(prim.getAttribute('POSITION')!), nrm = read(prim.getAttribute('NORMAL')!), uv = read(prim.getAttribute('TEXCOORD_1')!);
    const idx = prim.getIndices()!.getArray()!;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t]!, b = idx[t + 1]!, c = idx[t + 2]!;
      const ax = uv[2 * a]! * W, ay = uv[2 * a + 1]! * H, bx = uv[2 * b]! * W, by = uv[2 * b + 1]! * H, cx = uv[2 * c]! * W, cy = uv[2 * c + 1]! * H;
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (Math.abs(area) < 1e-12) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
        const k = py * W + px;
        if (filled[k]) continue;
        const qx = px + 0.5, qy = py + 0.5;
        const w0 = ((bx - qx) * (cy - qy) - (cx - qx) * (by - qy)) / area;
        const w1 = ((cx - qx) * (ay - qy) - (ax - qx) * (cy - qy)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        const P: V3 = [0, 0, 0], N: V3 = [0, 0, 0];
        for (let e = 0; e < 3; e++) {
          P[e] = w0 * pos[3 * a + e]! + w1 * pos[3 * b + e]! + w2 * pos[3 * c + e]!;
          N[e] = w0 * nrm[3 * a + e]! + w1 * nrm[3 * b + e]! + w2 * nrm[3 * c + e]!;
        }
        const o = baker.occlusion(P, norm(N));
        tex[4 * k] = Math.round(255 * o.far);
        tex[4 * k + 1] = Math.round(255 * o.near);
        tex[4 * k + 2] = 255;
        tex[4 * k + 3] = 255;
        filled[k] = 1;
        texels++;
      }
    }
  }
  // Texels under the piping (wholly enclosed: no ray gets out of the crease) are never seen, but a
  // bilinear sample at the contact line would read their black: treat them as gutters too, refilled
  // from the visible frosting next to them.
  for (let k = 0; k < W * H; k++) if (filled[k] && tex[4 * k + 1]! < 40) filled[k] = 0;
  // Dilate into the gutters (mip levels and bilinear filtering read across island edges).
  for (let pass = 0; pass < 10; pass++) {
    const next = filled.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x;
      if (filled[k]) continue;
      const acc = [0, 0, 0, 0];
      let c = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const xx = (x + dx + W) % W, yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        const j = yy * W + xx;
        if (!filled[j]) continue;
        for (let e = 0; e < 4; e++) acc[e]! += tex[4 * j + e]!;
        c++;
      }
      if (!c) continue;
      for (let e = 0; e < 4; e++) tex[4 * k + e] = Math.round(acc[e]! / c);
      next[k] = 1;
    }
    filled.set(next);
  }
  for (let k = 0; k < W * H; k++) if (!filled[k]) { tex[4 * k] = 255; tex[4 * k + 1] = 255; tex[4 * k + 2] = 255; tex[4 * k + 3] = 255; }
  // Two passes of a 3 × 3 tent (u wraps): the 24 rays' speckle out, the contact lines kept (≈ 1 texel).
  for (let pass = 0; pass < 2; pass++) {
    const src = tex.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let e = 0; e < 2; e++) {
      let acc = 0, wsum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        const w = (2 - Math.abs(dx)) * (2 - Math.abs(dy));
        acc += w * src[4 * (yy * W + ((x + dx + W) % W)) + e]!;
        wsum += w;
      }
      tex[4 * (y * W + x) + e] = Math.round(acc / wsum);
    }
  }
  log(`  bake: ${verts} piping vertices (mean occlusion ${(aoSum / Math.max(verts, 1)).toFixed(3)}, thickness ${thickMin.toFixed(1)}–${thickMax.toFixed(1)} mm), ${texels} body texels (${W}×${H}) in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  return tex;
}

export async function finishCake(doc: Document, log: (line: string) => void): Promise<void> {
  const root = doc.getRoot();
  const nodes = root.listNodes();

  // 1. Tiers: rebuilt dense lathes (the finish field is applied with everything else below).
  const geometry = new Map<Primitive, PrimData>();
  const profiles = {} as Record<TierId, ProfilePoint[]>;
  for (const node of nodes) {
    const info = nodeInfo(node.getName());
    if (!info || info.kind !== 'body') continue;
    const prim = node.getMesh()!.listPrimitives()[0]!;
    profiles[info.tier] = handProfile(masterProfile(prim), info.tier);
    const before = prim.getAttribute('POSITION')!.getCount();
    const m = rebuildTier(profiles[info.tier], info.tier);
    setGeometry(doc, prim, m);
    log(`  finish ${node.getName()}: rebuilt ${before} → ${m.pos.length / 3} vertices (dense top annulus at the sockets)`);
  }

  // 2. v1.6: every piped part regenerated as a sculpted star-tip sweep at the master's placements.
  regeneratePiping(doc, nodes, profiles, log);

  // 2b. v1.6: the base: a smear of the coat and a crumb or two on the plate. They belong to the stand
  //     (a child of its node, so they stay on it when the cake is carried off), in their own material
  //     (the body's colour; a cocoa variant in the recipe).
  const standNode = nodes.find((n) => n.getName() === 'cake_stand');
  if (!standNode) throw new Error('birthday finish: no cake_stand');
  if (standNode.getWorldMatrix().some((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) > 1e-9)) throw new Error('birthday finish: cake_stand is not at the master origin');
  const bodyMat = root.listMaterials().find((m) => m.getName() === 'cake_buttercream')!;
  const smearMat = doc.createMaterial('cake_smear').setBaseColorFactor(bodyMat.getBaseColorFactor()).setRoughnessFactor(0.55).setMetallicFactor(0).setExtras({ frosting: 'smear' });
  // Where (the master's frame; the lens looks along master 75°): one smear front right, one at the
  // left edge of the view, one behind; a crumb in view, two behind.
  const deg = Math.PI / 180;
  const sm = baseSmears(MASTER.plateTop, 0.5985, 0x5e3a, [43 * deg, 128 * deg, 262 * deg], [58 * deg, 200 * deg, 305 * deg]);
  const smearPrim = doc.createPrimitive().setMaterial(smearMat);
  setGeometry(doc, smearPrim, { pos: sm.pos, nrm: sm.nrm, uv: new Array((sm.pos.length / 3) * 2).fill(0), idx: sm.idx, extra: { _RIDGE: sm.ridge } });
  smearPrim.setAttribute('TEXCOORD_0', null);
  standNode.addChild(doc.createNode('cake_smears').setMesh(doc.createMesh('cake_smears').addPrimitive(smearPrim)));
  log(`  base: 3 smears and 3 crumbs on the plate (${sm.pos.length / 3} vertices)`);

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
      // v1.6 polish 2: a sugar pearl is hard: it moves with the field, it is not stretched by it (the
      // bays' drop changes over a pearl's height at the column tops: the egg-shaped dragées).
      const part = node.getName().replace(/^tier_(top|bottom)_?/, '');
      const pearlPrim = part === 'pearls' || part === 'border_pearls' || ((part === 'rosettes' || part === 'top_rosettes') && prim !== node.getMesh()!.listPrimitives()[0]);
      if (pearlPrim) deformRigid(d.pos, PEARL_VERTS, (p, out) => finishPoint(p, info.tier, info.kind, out));
      else deform(d.pos, d.nrm, (p, out) => finishPoint(p, info.tier, info.kind, out));
      prim.setAttribute('POSITION', accessor(doc, 'VEC3', d.pos));
      prim.setAttribute('NORMAL', accessor(doc, 'VEC3', d.nrm));
      for (let i = 0; i < d.pos.length; i += 3) { maxR = Math.max(maxR, Math.hypot(d.pos[i]!, d.pos[i + 2]!)); top = Math.max(top, d.pos[i + 1]!); }
      // Piping, rosettes and pearls carry no texture: their UVs are dead weight (≈ 2 MiB).
      if (info.kind !== 'body') prim.setAttribute('TEXCOORD_0', null);
    }
  }
  log(`  finish field: tiers ±1.4 % from round, tops ±0.7 mm; frosting now reaches r ${maxR.toFixed(5)}, top ${top.toFixed(5)} (scan)`);

  // 3b. v1.6: baked light transport (birthdayBake.ts) on the finished frosting: occlusion per vertex on
  //     the piping, rosettes and pearls (and thickness on the piping and rosettes), and the body's
  //     unique occlusion map (uv1).
  const contact = await bakeLight(doc, nodes, log);

  // 4. Materials: no clearcoat on the frosting; generated relief and roughness on the body; a
  //    very slight sheen on the piping and rosettes; the runtime's subsurface and press settings.
  const mat = (name: string): Material => {
    const m = root.listMaterials().find((x) => x.getName() === name);
    if (!m) throw new Error(`birthday finish: no material ${name}`);
    return m;
  };
  const { normal, roughness, albedo, stats } = frostingMaps();
  const body = mat('cake_buttercream');
  body.setExtension('KHR_materials_clearcoat', null);
  body.setNormalTexture(doc.createTexture('cake_buttercream_relief').setImage(await png(normal, ATLAS)).setMimeType('image/png'));
  body.setMetallicRoughnessTexture(doc.createTexture('cake_buttercream_roughness').setImage(await png(halve(roughness, ATLAS), ATLAS / 2)).setMimeType('image/png'));
  body.setBaseColorTexture(doc.createTexture('cake_buttercream_finish').setImage(await png(halve(albedo, ATLAS), ATLAS / 2)).setMimeType('image/png'));
  body.setRoughnessFactor(1).setMetallicFactor(0);
  // v1.6: the unique occlusion map (uv1): R the room's occlusion (three's aoMap), G contact.
  body.setOcclusionTexture(doc.createTexture('cake_buttercream_contact').setImage(await pngWH(contact, UNIQUE.width, UNIQUE.height)).setMimeType('image/png'));
  body.getOcclusionTextureInfo()!.setTexCoord(1);
  body.setExtras({ ...(body.getExtras() as object), frosting: 'body' });
  log(`  finish maps: relief ${ATLAS}², roughness and albedo finish ${ATLAS / 2}² (roughness ${stats.min.toFixed(2)}–${stats.max.toFixed(2)}, mean ${stats.mean.toFixed(3)})`);
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

  // 5. Candles: stood CANDLE_SINK deeper (a real candle needs ≈ 10 mm to stand), one shared mesh,
  //    re-tessellated.
  const sinkScan = CANDLE_SINK / CAKE_SCALE;
  for (const n of nodes.filter((x) => /^candle_\d_/.test(x.getName()))) {
    const t = n.getTranslation();
    n.setTranslation([t[0], t[1] - sinkScan, t[2]]);
  }
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
