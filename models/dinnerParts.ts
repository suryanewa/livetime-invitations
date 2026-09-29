import { BufferAttribute, BufferGeometry, Matrix4, SphereGeometry, Vector3 } from 'three';
import { mergeGeometries, mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { mergeIndexed, rng } from './cakeParts.ts';
import { COVER, PLATE } from './dinnerContract.ts';
import type { ProfilePoint } from './geometry.ts';
import { turned } from './recordParts.ts';

/**
 * Premium covered-dish parts (Dinner, direction L2). Turned parts are explicit arc-and-Bézier
 * profiles swept with analytic normals (crisp reveals auto-crease); food is swept tubes and
 * displaced grids with smooth indexed topology. Units match dinnerContract.ts; the plate and
 * food live in plate space (y = 0 on the floor), food in food_root space (y = 0 on the well),
 * the cloche in cover space (y = 0 at the skirt bottom).
 */

const TAU = Math.PI * 2;
/** Float32 headroom so contract maxima (plate radius, skirt radius, knob top) are never exceeded. */
const EPS = 2e-5;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Unsigned angle between two plan angles, 0..π. */
const angleTo = (a: number, b: number) => {
  const d = Math.abs(a - b) % TAU;
  return Math.min(d, TAU - d);
};

/**
 * Plan angle (x = cos φ, z = sin φ) of the side of the dish that faces the shared camera
 * (azimuth 20°). The dish never turns about y and every scene uses the one camera, so food is
 * composed for this view: garnish and sauce runs face it, strand ends tuck in behind.
 */
const CAM_PHI = Math.atan2(Math.cos((20 * Math.PI) / 180), Math.sin((20 * Math.PI) / 180));

// ── Profiles ────────────────────────────────────────────────────────────────

/** Profile builder (x = radius, y = height) with explicit arcs and quadratic Béziers. */
class Profile {
  readonly pts: ProfilePoint[] = [];
  add(r: number, y: number): this {
    this.pts.push([Math.max(0, r), y]);
    return this;
  }
  /** Arc about (cx, cy) from angle a0 to a1 (radians, CCW positive), first point skipped. */
  arc(cx: number, cy: number, rad: number, a0: number, a1: number, n: number): this {
    for (let i = 1; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      this.add(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    return this;
  }
  /** Quadratic Bézier from the last point via (cx, cy) to (x1, y1). */
  bez(cx: number, cy: number, x1: number, y1: number, n: number): this {
    const [x0, y0] = this.pts[this.pts.length - 1]!;
    for (let i = 1; i <= n; i++) {
      const t = i / n, mt = 1 - t;
      this.add(mt * mt * x0 + 2 * mt * t * cx + t * t * x1, mt * mt * y0 + 2 * mt * t * cy + t * t * y1);
    }
    return this;
  }
}

// ── Plate ───────────────────────────────────────────────────────────────────

/**
 * Channel on the plate's rim wall that carries the family perforation row: a 4.4 cm band set
 * 3.5 mm into the wall between the rolled rim above and the ink foot below, so the inlay sits
 * inside the plate radius and reads at phone scale (116 whole dots).
 */
const CHANNEL = { y0: 0.018, y1: 0.062, inset: 0.0035 } as const;
export const PLATE_BAND = {
  y: (CHANNEL.y0 + CHANNEL.y1) / 2,
  height: CHANNEL.y1 - CHANNEL.y0 - 0.001,
  radius: PLATE.radius - 0.0015,
} as const;
/** Rolled rim: a 9 mm round whose top is PLATE.rimHeight. */
const ROLL = { y: 0.066, r: PLATE.rimHeight - 0.066 } as const;

/**
 * Glazed coupe plate above the ink foot: the channel floor, a crisp ledge, the rolled rim
 * (top = PLATE.rimHeight) and an inner flank that leaves the roll on its tangent and lands
 * flat on the well at PLATE.wellRadius. Starts on the foot's top ring (watertight seam).
 */
export function plateBody(segments = 72): BufferGeometry {
  const R = PLATE.radius - EPS, W = PLATE.well, WR = PLATE.wellRadius;
  // The channel floor, then the rim from the channel's top lip. The lip's underside (a flat ring
  // facing straight down) is never front-facing to the fixed orthographic camera at 15°
  // elevation (the dish never tips), so it is not modelled.
  const floor = turned([[R - CHANNEL.inset, CHANNEL.y0], [R - CHANNEL.inset, CHANNEL.y1]], { segments, filletSegments: 1 });
  const p = new Profile();
  p.add(R, CHANNEL.y1).add(R, ROLL.y).arc(R - ROLL.r, ROLL.y, ROLL.r, 0, (2 * Math.PI) / 3, 6);
  const [ex, ey] = p.pts[p.pts.length - 1]!;
  // Inner flank leaves the roll on its tangent (30° down) and lands flat on the well.
  const cx = ex - (ey - W) / Math.tan(Math.PI / 6);
  p.bez(cx, W, WR, W, 5).add(0, W);
  return mergeGeometries([floor, turned(p.pts, { segments, filletSegments: 1 })], false)!;
}

/**
 * Ink-glazed foot band (`mat_body_ink`): the plate's dark base line, flush with the rim and
 * forming the channel's lower lip, so the plate keeps a ≥3:1 edge against the peach stage
 * even when the cover stands beside it. The flat underside faces straight down, away from the
 * 15° camera (the dish never tips), so the band starts at its rounded bottom edge.
 */
export function plateFoot(segments = 72): BufferGeometry {
  const R = PLATE.radius - EPS, f = 0.005;
  const p = new Profile().add(R - f, 0).arc(R - f, f, f, -Math.PI / 2, 0, 2);
  p.add(R, CHANNEL.y0).add(R - CHANNEL.inset, CHANNEL.y0);
  return turned(p.pts, { segments, filletSegments: 1 });
}

/** Invisible low-poly caster for the plate: rim wall and flank, everywhere under the glaze. */
export function plateProxy(): BufferGeometry {
  return turned([[0, 0.001], [0.784, 0.001], [0.784, 0.056], [0.772, 0.061], [0.72, 0.041], [0, 0.041]], { segments: 32, filletSegments: 1 });
}

// ── Cloche ──────────────────────────────────────────────────────────────────

const BEAD = 0.018;
/**
 * Cloche section: a polished rolled bead (outer = COVER.radius, 18 mm round, so its glint holds
 * at phone scale), a polished skirt band that flares out into it from a crisp applied rib, a
 * brushed superellipse dome, and a small turned step at the crown that seats the knob's collar.
 */
export const CLOCHE = {
  bead: BEAD,
  beadX: COVER.radius - EPS - BEAD,
  /** Outer radius of the skirt at the rib; the dome springs from here. */
  skirt: 0.629,
  ribY: 0.078,
  rib: 0.004,
  /** Superellipse exponent of the dome (2 = ellipse; higher = fuller shoulder, flatter crown). */
  n: 2.5,
  stepR: 0.165,
  stepH: 0.0035,
} as const;
const DOME_Y0 = CLOCHE.ribY + 2 * CLOCHE.rib;
/** Apex of the superellipse; the crown step lifts the centre to COVER.domeHeight. */
const DOME_TOP = COVER.domeHeight - CLOCHE.stepH;

function domeY(r: number): number {
  const q = Math.min(1, r / CLOCHE.skirt);
  return DOME_Y0 + (DOME_TOP - DOME_Y0) * Math.pow(1 - Math.pow(q, CLOCHE.n), 1 / CLOCHE.n);
}

interface Meridian { outer: [number, number][]; inner: [number, number][] }

/** Dome meridian samples (outer) from the rib top to the apex, and their inward offsets. */
function domeMeridian(samples: number): Meridian {
  const { skirt, n } = CLOCHE;
  const a = skirt, b = DOME_TOP - DOME_Y0;
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    // Ease the parameter so samples crowd the shoulder, where the curvature lives.
    const u = i / samples;
    const phi = (Math.PI / 2) * (u * 0.55 + 0.45 * (1 - Math.cos((u * Math.PI) / 2)));
    const c = Math.cos(phi), s = Math.sin(phi);
    const r = i === samples ? 0 : a * Math.pow(c, 2 / n);
    const y = i === samples ? DOME_TOP : DOME_Y0 + b * Math.pow(s, 2 / n);
    // Normal of the superellipse |r/a|^n + |y/b|^n = 1: gradient (r^(n-1)/a^n, y^(n-1)/b^n).
    const gy = (y - DOME_Y0) / b, gr = r / a;
    let nr = Math.pow(Math.max(gr, 0), n - 1) / a, ny = Math.pow(Math.max(gy, 0), n - 1) / b;
    if (i === 0) { nr = 1; ny = 0; }
    const l = Math.hypot(nr, ny);
    outer.push([r, y]);
    inner.push([Math.max(0, r - (nr / l) * COVER.wall), y - (ny / l) * COVER.wall]);
  }
  inner[inner.length - 1]![0] = 0;
  return { outer, inner };
}

/**
 * Flared skirt (outer) from inside the bead up to the rib, and its inward offset. The outer
 * line carries a fine V crease just above the bead, where the sheet was rolled over the wire:
 * it parts the polished bead from the brushed skirt with a hairline of shadow.
 */
function skirtCurve(samples: number, crease: number | null = 0.25): Meridian {
  const { beadX, skirt, ribY } = CLOCHE;
  const p0 = [beadX - 0.0015, BEAD + 0.006] as const;
  const c = [skirt + 0.0005, BEAD + 0.03] as const;
  const p1 = [skirt, ribY] as const;
  const at = (t: number) => {
    const mt = 1 - t;
    const r = mt * mt * p0[0] + 2 * mt * t * c[0] + t * t * p1[0];
    const y = mt * mt * p0[1] + 2 * mt * t * c[1] + t * t * p1[1];
    const dr = 2 * mt * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]);
    const dy = 2 * mt * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1]);
    const l = Math.hypot(dr, dy);
    return { r, y, nr: dy / l, ny: -dr / l };
  };
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  const ts: number[] = [];
  for (let i = 0; i <= samples; i++) ts.push(i / samples);
  for (const t of ts) {
    const q = at(t);
    inner.push([q.r - q.nr * COVER.wall, q.y - q.ny * COVER.wall]);
  }
  const outT = crease === null ? ts : [...ts, crease - 0.03, crease, crease + 0.03].sort((a, b) => a - b);
  for (const t of outT) {
    const q = at(t);
    const d = t === crease ? 0.0009 : 0;
    outer.push([q.r - q.nr * d, q.y - q.ny * d]);
  }
  return { outer, inner };
}

/** Plan segments of the polished lip: its outline is under a pixel off round at phone scale. */
const LIP_SEGMENTS = 40;
/** Bead section vertices (degrees about the bead's centre; 0 = outwards, 90 = up). */
const BEAD_ANGLES = [-90, -40, 0, 35, 70, 105, 160, 215, 270];

export interface ClocheParts {
  outer: BufferGeometry;
  bead: BufferGeometry;
  inner: BufferGeometry;
}

/**
 * Thin-walled cloche: the brushed outer skin (superellipse dome from the rib's top, turned crown
 * step and the knob's collar), the polished lip (flared skirt band, crisp applied rib and the
 * rolled bead, one polished mesh) and the inner skin. Both skins tuck into the bead, so the three
 * meshes close without shared seams (and may differ in density); the band meets the dome on the
 * rib's top ring.
 * Analytic tangents steer the brushed anisotropy (CLOCHE_BRUSH) so the satin highlight is
 * continuous over the facets. The inner skin carries the knob's fixing nut and washer.
 */
export function clocheShell(segments = 64, domeSamples = 16, brush: { outer: 'meridian' | 'around'; inner: 'meridian' | 'around' } = CLOCHE_BRUSH): ClocheParts {
  const { bead, beadX, skirt, ribY, rib, stepR, stepH } = CLOCHE;
  const dome = domeMeridian(domeSamples);
  // The inside is only glimpsed as the cover lifts: a coarser spin than the outside.
  const domeIn = domeMeridian(9);
  const skirtC = skirtCurve(6);
  // Outer: dome with the crown step. It springs from inside the applied rib (the rib curls on
  // past its top into the dome's wall), so dome and polished lip meet on a crisp intersection
  // and need not share a seam or a segment count.
  const o = new Profile().add(skirt - 0.0025, ribY + rib).add(skirt, ribY + 2 * rib);
  const ch = 0.001;
  let stepped = false;
  for (const [r, y] of dome.outer.slice(1)) {
    if (!stepped && r < stepR + 0.002) {
      if (r > stepR - 2 * ch) continue;
      const ys = domeY(stepR);
      o.add(stepR, ys).add(stepR, ys + stepH - ch).add(stepR - ch, ys + stepH);
      stepped = true;
    }
    o.add(r, stepped ? y + stepH : y);
  }
  // Inner: apex → down the dome offset → the inner skirt → into the bead.
  const i = new Profile();
  for (let k = domeIn.inner.length - 1; k >= 0; k--) i.add(domeIn.inner[k]![0], domeIn.inner[k]![1]);
  for (let k = skirtC.inner.length - 1; k >= 0; k--) i.add(skirtC.inner[k]![0], skirtC.inner[k]![1]);
  i.add(beadX - 0.005, BEAD);
  // The turned collar under the knob is part of the same spun skin (one draw).
  const collar = collarGeometry(32);
  collar.translate(0, COVER.domeHeight, 0);
  const outer = mergeGeometries([withTangents(turned(o.pts, { segments, filletSegments: 1 }), brush.outer), withTangents(collar, brush.outer)], false)!;
  const innerParts = [turned(i.pts, { segments: 40, filletSegments: 1 }), ...fixingHardware(domeIn.inner[domeIn.inner.length - 1]![1])];
  const inner = mergeGeometries(innerParts.map((g) => withTangents(g, brush.inner)), false)!;
  // Polished stock (one mesh, LIP_SEGMENTS round): the rolled bead, a closed round with its
  // spans set finest on the outside and top, where the camera and the glint are (the skirts end
  // inside it); the plain skirt band flaring out of it; and the applied rib, split from the band
  // by a crisp crease.
  const beadPts: ProfilePoint[] = BEAD_ANGLES.map((a) => [beadX + Math.cos((a * Math.PI) / 180) * bead, bead + Math.sin((a * Math.PI) / 180) * bead]);
  const band = skirtCurve(3, null).outer;
  const ribP = new Profile().add(skirt, ribY).arc(skirt, ribY + rib, rib, -Math.PI / 2, (110 * Math.PI) / 180, 4);
  const lip = { segments: LIP_SEGMENTS, filletSegments: 1, crease: 80 };
  const beadG = mergeGeometries([turned(beadPts, lip), turned(band, { ...lip, crease: 35 }), turned(ribP.pts, lip)], false)!;
  return { outer, bead: beadG, inner };
}

/**
 * The knob's fixing inside the crown (merged into the inner skin): a turned washer, a hex nut
 * with a chamfered face and the stud end, as on a real cloche; it also covers the pole of the
 * spun inner skin.
 */
function fixingHardware(ceiling: number): BufferGeometry[] {
  const yc = ceiling;
  const washer = turned([[0, yc - 0.0025], [0.042, yc - 0.0025, 0.001], [0.042, yc + 0.0008], [0, yc + 0.0008]], { segments: 32, filletSegments: 1 });
  const nut = turned([[0, yc - 0.0165], [0.0195, yc - 0.0165], [0.0238, yc - 0.0128], [0.0238, yc - 0.0025], [0, yc - 0.0025]], { segments: 6, filletSegments: 1 });
  nut.computeVertexNormals();
  const stud = turned([[0, yc - 0.0225], [0.0072, yc - 0.0225], [0.0094, yc - 0.0203], [0.0094, yc - 0.016], [0, yc - 0.016]], { segments: 12, filletSegments: 1 });
  return [washer, nut, stud];
}

/**
 * Direction the brushed highlight stretches on each skin: up the meridian outside (spun,
 * circumferentially brushed), round the circumference inside (quieter concentric sheen).
 */
export const CLOCHE_BRUSH = { outer: 'meridian', inner: 'around' } as const;

/**
 * Analytic tangents for a surface of revolution about +y, so the anisotropic highlight is
 * smooth across facets (derivative tangents are per-triangle and quilt the brushed sheen).
 * `around` follows the circumference; `meridian` runs up the profile.
 */
export function withTangents(g: BufferGeometry, mode: 'meridian' | 'around'): BufferGeometry {
  const pos = g.getAttribute('position') as BufferAttribute;
  const nor = g.getAttribute('normal') as BufferAttribute;
  const tan = new Float32Array(pos.count * 4);
  const C = new Vector3(), N = new Vector3(), T = new Vector3();
  for (let k = 0; k < pos.count; k++) {
    let x = pos.getX(k), z = pos.getZ(k);
    // A vertex on the axis takes its direction from its triangle (non-indexed sweep output),
    // so the brushed sheen converges cleanly at the pole instead of pinching.
    if (Math.hypot(x, z) < 1e-5 && !g.index) {
      const t0 = k - (k % 3);
      x = 0; z = 0;
      for (let q = t0; q < t0 + 3; q++) if (q !== k) { x += pos.getX(q); z += pos.getZ(q); }
    }
    const r = Math.hypot(x, z);
    if (r > 1e-9) C.set(z / r, 0, -x / r);
    else C.set(1, 0, 0);
    N.fromBufferAttribute(nor, k);
    if (mode === 'around') T.copy(C).addScaledVector(N, -N.dot(C));
    else T.crossVectors(N, C);
    if (T.lengthSq() < 1e-12) T.set(1, 0, 0);
    T.normalize();
    tan.set([T.x, T.y, T.z, 1], k * 4);
  }
  g.setAttribute('tangent', new BufferAttribute(tan, 4));
  return g;
}

/** Knob in cover_handle space (origin on the dome apex); top at COVER.handleHeight (less EPS). */
export const KNOB = { collar: 0.1, bulb: 0.11, equator: 0.078, under: 0.026, neck: 0.021, spigot: 0.03 } as const;

/**
 * Invisible low-poly caster for the knob. The cloche's inner skin casts for the shell itself:
 * the shadow pass renders back faces, so the near wall's inner skin shades everything under
 * and inside the cloche, exactly as the metal would, with no acne on the outer skin.
 */
export function knobProxy(): BufferGeometry {
  return turned([[0, 0.012], [0.028, 0.012], [0.028, 0.042], [KNOB.bulb - 0.012, 0.064], [KNOB.bulb - 0.012, 0.086], [0.06, 0.112], [0, 0.116]], { segments: 16, filletSegments: 1 });
}

/**
 * Turned coral knob, the object's one enamel insert: a spigot seated in the collar, a slim
 * waist that reads as a dark gap at the camera angle, and a broad mushroom cap (domed top,
 * flatter underside) split by a crisp machined groove on its equator.
 */
export function knobGeometry(segments = 32): BufferGeometry {
  const Ht = COVER.handleHeight - EPS;
  const { bulb: rx, equator: ey, under, neck, spigot } = KNOB;
  const top = Ht - ey;
  const eT = 2 / 2.2, eU = 2 / 2.6;
  const upper = (a: number): [number, number] => [rx * Math.cos(a) ** eT, ey + top * Math.sin(a) ** eT];
  const lower = (a: number): [number, number] => [rx * Math.cos(a) ** eU, ey - under * Math.sin(a) ** eU];
  const p = new Profile().add(0, 0.01).add(spigot, 0.01).add(spigot, 0.021);
  // Waist: a cove from the spigot shoulder into the neck, flaring into the cap's underside.
  const aJ = 1.05;
  const [jx, jy] = lower(aJ);
  p.bez(neck, 0.021, neck, 0.03, 2).bez(neck, jy - 0.004, jx, jy, 3);
  for (let i = 1; i <= 6; i++) p.add(...lower(aJ * (1 - i / 6)));
  // Machined groove on the equator.
  p.add(rx - 0.003, ey + 0.0015).add(...upper(0.07));
  for (let i = 1; i <= 9; i++) p.add(...upper(0.07 + ((Math.PI / 2 - 0.07) * i) / 9));
  return turned(p.pts, { segments, filletSegments: 1 });
}

/** Turned collar under the knob (merged into the outer skin): bedded into the crown step, stepped edge, cove to the spigot. */
export function collarGeometry(segments = 32): BufferGeometry {
  const c = KNOB.collar;
  return turned([
    [0, -0.008], [c - 0.004, -0.008], [c, -0.003, 0.003], [c - 0.001, 0.004, 0.0025], [c - 0.02, 0.0088, 0.004],
    [0.042, 0.0118, 0.004], [0.034, 0.016, 0.002], [0, 0.016],
  ], { segments, filletSegments: 1 });
}

// ── Tubes and grids ─────────────────────────────────────────────────────────

/**
 * Indexed grid with wrapped columns (closed section), smooth computed normals. With `poles`,
 * the first and last rows are single vertices (a closed sphere-like surface): no degenerate
 * triangles, and the pole shades smoothly instead of as a pinwheel of facet normals.
 */
function wrapGrid(rows: number, cols: number, at: (i: number, j: number) => [number, number, number], poles = false): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  if (!poles) {
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) pos.push(...at(i, j));
    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < cols; j++) {
        const j1 = (j + 1) % cols;
        const a = i * cols + j, b = i * cols + j1, c = (i + 1) * cols + j, d = (i + 1) * cols + j1;
        idx.push(a, b, c, b, d, c);
      }
    }
  } else {
    pos.push(...at(0, 0));
    for (let i = 1; i < rows - 1; i++) for (let j = 0; j < cols; j++) pos.push(...at(i, j));
    pos.push(...at(rows - 1, 0));
    const ring = (i: number, j: number) => 1 + (i - 1) * cols + (j % cols);
    const last = 1 + (rows - 2) * cols;
    for (let j = 0; j < cols; j++) idx.push(0, ring(1, j + 1), ring(1, j));
    for (let i = 1; i < rows - 2; i++) {
      for (let j = 0; j < cols; j++) {
        const a = ring(i, j), b = ring(i, j + 1), c = ring(i + 1, j), d = ring(i + 1, j + 1);
        idx.push(a, b, c, b, d, c);
      }
    }
    for (let j = 0; j < cols; j++) idx.push(ring(rows - 2, j), ring(rows - 2, j + 1), last);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  return g;
}

/**
 * Append a flat cap at the first (start) or last ring of a wrapGrid tube. The cap has its own
 * ring vertices, so the cut edge stays crisp (square-cut ends) instead of smoothing round.
 */
function capRing(g: BufferGeometry, rows: number, cols: number, end: boolean): BufferGeometry {
  const pos = g.getAttribute('position') as BufferAttribute;
  const ring = end ? rows - 1 : 0;
  const c = new Vector3();
  for (let j = 0; j < cols; j++) c.add(new Vector3().fromBufferAttribute(pos, ring * cols + j));
  c.divideScalar(cols);
  const base = pos.count;
  const arr = new Float32Array((base + cols + 1) * 3);
  arr.set(pos.array as Float32Array);
  for (let j = 0; j < cols; j++) {
    const k = ring * cols + j;
    arr.set([pos.getX(k), pos.getY(k), pos.getZ(k)], (base + j) * 3);
  }
  arr.set([c.x, c.y, c.z], (base + cols) * 3);
  const idx = Array.from(g.index!.array);
  const centre = base + cols;
  for (let j = 0; j < cols; j++) {
    const a = base + j, b = base + ((j + 1) % cols);
    if (end) idx.push(a, b, centre);
    else idx.push(a, centre, b);
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(arr, 3));
  out.setIndex(idx);
  return out;
}

export interface TubeSpec {
  path: Vector3[];
  /** Reference "up" per sample (the flat side of an elliptical section faces it). */
  up?: Vector3[] | Vector3;
  /** Half width / half thickness at t ∈ [0, 1] along the path. */
  half: (t: number) => [number, number];
  sides: number;
  /** Close the start / end ring with a flat fan (cut ends) instead of tapering. */
  capStart?: boolean;
  capEnd?: boolean;
  /**
   * Shade with the swept section's own normals (exact for a tube, whatever the ring spacing or
   * bend) instead of normals averaged from the facets, which pick up the spacing of the rings as
   * shading steps along a curved strand. Tapered ends take computed normals near the tip.
   */
  analytic?: boolean;
}

/**
 * Swept tube with an elliptical section (strands, stems, carrots) along a sampled path.
 * Frames follow the path tangent and the supplied up vectors, so sections lie flat on a surface.
 */
export function tube(o: TubeSpec): BufferGeometry {
  const n = o.path.length;
  const T = new Vector3(), N = new Vector3(), Wd = new Vector3();
  const frames: { p: Vector3; t: Vector3; n: Vector3; w: Vector3; a: number; b: number }[] = [];
  let prevN: Vector3 | null = null;
  for (let i = 0; i < n; i++) {
    const p = o.path[i]!;
    T.subVectors(o.path[Math.min(n - 1, i + 1)]!, o.path[Math.max(0, i - 1)]!).normalize();
    const up = o.up instanceof Vector3 ? o.up : o.up ? o.up[i]! : null;
    if (up) N.copy(up);
    else if (prevN) N.copy(prevN);
    else N.set(0, 1, 0);
    N.addScaledVector(T, -T.dot(N));
    if (N.lengthSq() < 1e-10) N.set(1, 0, 0).addScaledVector(T, -T.x);
    N.normalize();
    Wd.crossVectors(T, N).normalize();
    prevN = N.clone();
    const [a, b] = o.half(i / (n - 1));
    frames.push({ p, t: T.clone(), n: N.clone(), w: Wd.clone(), a, b });
  }
  const cols = o.sides;
  const psiOf = (j: number) => -((j + 0.5) / cols) * TAU;
  let g = wrapGrid(n, cols, (i, j) => {
    const f = frames[i]!;
    const psi = psiOf(j);
    const c = Math.cos(psi) * f.a, s = Math.sin(psi) * f.b;
    return [f.p.x + f.w.x * c + f.n.x * s, f.p.y + f.w.y * c + f.n.y * s, f.p.z + f.w.z * c + f.n.z * s];
  });
  const grid = n * cols;
  if (o.capStart) g = capRing(g, n, cols, false);
  if (o.capEnd) g = capRing(g, n, cols, true);
  g.computeVertexNormals();
  if (o.analytic) {
    const nrm = g.getAttribute('normal') as BufferAttribute;
    const v = new Vector3();
    for (let i = 0; i < n; i++) {
      const f = frames[i]!;
      // A ring shrunk to (nearly) a point keeps its computed normal: the tip rounds over.
      if (Math.min(f.a, f.b) < 1e-5) continue;
      for (let j = 0; j < cols; j++) {
        const psi = psiOf(j);
        v.copy(f.w).multiplyScalar(Math.cos(psi) / f.a).addScaledVector(f.n, Math.sin(psi) / f.b).normalize();
        nrm.setXYZ(i * cols + j, v.x, v.y, v.z);
      }
    }
    // Cut ends face straight along the path.
    const pos = g.getAttribute('position') as BufferAttribute;
    for (let k = grid; k < pos.count; k++) {
      const end = o.capEnd && (!o.capStart || k >= grid + cols + 1);
      const t = end ? frames[n - 1]!.t : frames[0]!.t.clone().negate();
      nrm.setXYZ(k, t.x, t.y, t.z);
    }
  }
  return g;
}

/** Catmull-Rom resample of control points into `count` samples. */
function spline(ctrl: Vector3[], count: number): Vector3[] {
  const out: Vector3[] = [];
  const segs = ctrl.length - 1;
  for (let i = 0; i < count; i++) {
    const u = (i / (count - 1)) * segs;
    const k = Math.min(segs - 1, Math.floor(u));
    const t = u - k;
    const p0 = ctrl[Math.max(0, k - 1)]!, p1 = ctrl[k]!, p2 = ctrl[k + 1]!, p3 = ctrl[Math.min(segs, k + 2)]!;
    const t2 = t * t, t3 = t2 * t;
    const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    out.push(new Vector3(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y), f(p0.z, p1.z, p2.z, p3.z)));
  }
  return out;
}

/** Food rests on the well: anything modelled below y = 0 is flattened onto it. */
function restOnWell(g: BufferGeometry, floor = 0.0004, renormal = true): BufferGeometry {
  const p = g.getAttribute('position') as BufferAttribute;
  let moved = false;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < floor) { p.setY(i, floor); moved = true; }
  }
  if (moved && renormal) g.computeVertexNormals();
  return g;
}

// ── Pasta ───────────────────────────────────────────────────────────────────

/**
 * Twirled spaghetti nest (food_root space): bed radius and crown height, strand radius. The
 * bed is the surface the lowest strands rest on: a beehive whose steep side rolls into a
 * rounded crown that follows the food envelope's taper.
 */
export const NEST = { radius: 0.35, crown: 0.2, r: 0.0075 } as const;
/** The hidden core sits this far under the bed, below every strand. */
const CORE_SINK = 0.0045;
/** How far the core's shading normal leans from straight down towards the camera. */
const CORE_LEAN = 0.45;

export function bedHeight(rho: number): number {
  if (rho >= NEST.radius) return 0;
  const c = 0.08;
  const cap = NEST.crown - 0.28 * (Math.sqrt(rho * rho + c * c) - c);
  return cap * Math.sqrt(1 - Math.pow(rho / NEST.radius, 8));
}

interface MeridianTable { m: number[]; rho: number[]; y: number[]; total: number }
let MERIDIAN: MeridianTable | null = null;

/** Arc length up the bed's meridian (m = 0 on the well at the base, total at the crown). */
function meridian(): MeridianTable {
  if (MERIDIAN) return MERIDIAN;
  const N = 1600;
  const m: number[] = [0], rho: number[] = [NEST.radius], y: number[] = [0];
  for (let i = 1; i <= N; i++) {
    const u = i / N;
    const r = NEST.radius * (1 - u * u);
    const h = bedHeight(r);
    m.push(m[i - 1]! + Math.hypot(r - rho[i - 1]!, h - y[i - 1]!));
    rho.push(r);
    y.push(h);
  }
  MERIDIAN = { m, rho, y, total: m[N]! };
  return MERIDIAN;
}

function meridianAt(mm: number): [number, number] {
  const T = meridian();
  const x = Math.min(T.total, Math.max(0, mm));
  let lo = 0, hi = T.m.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (T.m[mid]! <= x) lo = mid;
    else hi = mid;
  }
  const f = (x - T.m[lo]!) / Math.max(1e-12, T.m[hi]! - T.m[lo]!);
  return [T.rho[lo]! + (T.rho[hi]! - T.rho[lo]!) * f, T.y[lo]! + (T.y[hi]! - T.y[lo]!) * f];
}

/** Meridian distance of the bed at plan radius rho. */
function meridianOf(rho: number): number {
  const T = meridian();
  for (let i = 1; i < T.rho.length; i++) {
    if (T.rho[i]! <= rho) {
      const f = (T.rho[i - 1]! - rho) / Math.max(1e-12, T.rho[i - 1]! - T.rho[i]!);
      return T.m[i - 1]! + (T.m[i]! - T.m[i - 1]!) * f;
    }
  }
  return T.total;
}

/** Bed point at meridian distance m and plan angle phi, with its outward normal. */
function bedAt(mm: number, phi: number, outN: Vector3): Vector3 {
  const e = 0.0015;
  const [r, y] = meridianAt(mm);
  const [r0, y0] = meridianAt(mm - e), [r1, y1] = meridianAt(mm + e);
  let nr = y1 - y0, ny = -(r1 - r0);
  const l = Math.hypot(nr, ny) || 1;
  nr /= l; ny /= l;
  const c = Math.cos(phi), s = Math.sin(phi);
  outN.set(nr * c, ny, nr * s);
  return new Vector3(r * c, y, r * s);
}

interface StrandSpec {
  /** Base point and outward normal at t ∈ [0, 1]. */
  at: (t: number, n: Vector3) => Vector3;
  /** Approximate length (sets the collision sampling). */
  length: number;
  /** Largest parameter step between render rings (keeps curves round). */
  maxDt: number;
  tuck0: boolean;
  tuck1: boolean;
  /** Buried samples (inside the core) neither collide nor block. */
  buried?: (c: Vector3) => boolean;
}

interface StrandSample { t: number; s: number; b: Vector3; n: Vector3; lift: number; c: Vector3 }
interface PlacedSample { c: Vector3; id: number }

export interface NestLayout {
  strands: { samples: StrandSample[]; spec: StrandSpec }[];
  /** Highest strand surface near a plan point (for sauce and garnish). */
  topAt: (x: number, z: number, radius: number) => number;
}

let LAYOUT: NestLayout | null = null;

/**
 * Lays the strands one at a time and drapes each over those already placed: every sample
 * takes the smallest lift off the bed that keeps its centreline one strand diameter (plus a
 * hair) from every placed centreline, then the lift is eased along the strand so it climbs
 * over a crossing and settles back. No two strands interpenetrate, whatever their paths.
 */
export function nestLayout(): NestLayout {
  if (LAYOUT) return LAYOUT;
  const r: number = NEST.r, D = 2 * r + 0.0012;
  const cell = 0.02;
  const grid = new Map<string, PlacedSample[]>();
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const insert = (p: PlacedSample) => {
    const k = key(p.c.x, p.c.y, p.c.z);
    const list = grid.get(k);
    if (list) list.push(p);
    else grid.set(k, [p]);
  };
  const near = (c: Vector3, radius: number, cb: (p: PlacedSample) => void) => {
    const x0 = Math.floor((c.x - radius) / cell), x1 = Math.floor((c.x + radius) / cell);
    const y0 = Math.floor((c.y - radius) / cell), y1 = Math.floor((c.y + radius) / cell);
    const z0 = Math.floor((c.z - radius) / cell), z1 = Math.floor((c.z + radius) / cell);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) grid.get(`${x},${y},${z}`)?.forEach(cb);
  };
  const specs = strandSpecs();
  const strands: NestLayout['strands'] = [];
  const LMAX = 7 * r;
  specs.forEach((spec, id) => {
    const count = Math.max(8, Math.ceil(spec.length / 0.0035));
    const samples: StrandSample[] = [];
    let s = 0;
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const n = new Vector3();
      const b = spec.at(t, n);
      if (i > 0) s += b.distanceTo(samples[i - 1]!.b);
      samples.push({ t, s, b, n, lift: r, c: new Vector3() });
    }
    const total = s;
    // Forbidden lift intervals per sample from the strands already placed.
    const forbid: [number, number][][] = samples.map((q) => {
      const out: [number, number][] = [];
      const probe = q.b.clone().addScaledVector(q.n, 3.5 * r);
      near(probe, D + 4 * r, (p) => {
        const w = q.b.clone().sub(p.c);
        const beta = q.n.dot(w), gamma = w.lengthSq() - D * D;
        const disc = beta * beta - gamma;
        if (disc > 0) {
          const sq = Math.sqrt(disc);
          out.push([-beta - sq, -beta + sq]);
        }
      });
      return out.sort((a, b) => a[0] - b[0]);
    });
    const feasible = (k: number, from: number) => {
      let L = from;
      for (const [a, b] of forbid[k]!) if (L > a && L < b) L = b;
      // Intervals are sorted by start; a raise can land in a later one, so sweep again.
      for (const [a, b] of forbid[k]!) if (L > a && L < b) L = b;
      return Math.min(L, LMAX);
    };
    const flat = 0.012, ramp = 0.07;
    const K = (d: number) => (d <= flat ? 1 : d >= flat + ramp ? 0 : 1 - smoothstep(flat, flat + ramp, d));
    // Baseline lift: resting on the bed, except that tucked ends dive into the core over a short
    // run. The raises that clear crossings are eased on top of it, so lift stays continuous along
    // every strand (a jump from under a strand to over it between two samples would pass straight
    // through it).
    const tuckLen = 0.07, sunk = -(r + CORE_SINK + 0.002);
    // d0, d1: how far from each tucked end the strand is already fully sunk.
    const layLift = (d0: number, d1: number) => {
      const base = samples.map((q) => {
        let B: number = r;
        if (spec.tuck0) B = sunk + (B - sunk) * smoothstep(0, tuckLen, q.s - d0);
        if (spec.tuck1) B = sunk + (B - sunk) * smoothstep(0, tuckLen, total - d1 - q.s);
        return B;
      });
      let req = samples.map((_, k) => feasible(k, base[k]!));
      let lift = req.slice();
      for (let iter = 0; iter < 8; iter++) {
        // Ease: each sample rises towards any nearby requirement.
        lift = samples.map((q, k) => {
          let E = 0;
          for (let j = k; j >= 0 && q.s - samples[j]!.s < flat + ramp; j--) E = Math.max(E, (req[j]! - base[j]!) * K(q.s - samples[j]!.s));
          for (let j = k + 1; j < samples.length && samples[j]!.s - q.s < flat + ramp; j++) E = Math.max(E, (req[j]! - base[j]!) * K(samples[j]!.s - q.s));
          return base[k]! + E;
        });
        let changed = false;
        req = lift.map((L, k) => {
          const f = feasible(k, L);
          if (f > L + 1e-7) changed = true;
          return Math.max(req[k]!, f);
        });
        if (!changed) break;
      }
      return { base, req, lift };
    };
    // A tucked end whose dive meets a strand lying across it dives sooner, so it is already sunk
    // in the core where it passes under that strand (it seems to slip beneath it), instead of
    // arching over it and plunging beyond: a hook that shows over the crown or on the flanks.
    let d0 = 0, d1 = 0;
    let laid = layLift(d0, d1);
    for (let attempt = 0; attempt < 6; attempt++) {
      let c0 = -1, c1 = -1;
      samples.forEach((q, k) => {
        if (laid.req[k]! - laid.base[k]! <= 0.3 * r) return;
        if (spec.tuck0 && q.s >= d0 && q.s < d0 + tuckLen) c0 = Math.max(c0, q.s);
        if (spec.tuck1 && total - q.s >= d1 && total - q.s < d1 + tuckLen) c1 = Math.max(c1, total - q.s);
      });
      // Only while the strand is still round the back, out of the camera's sight, where it sinks.
      const hiddenAt = (sAt: number) => {
        const q = samples.find((p) => p.s >= sAt) ?? samples[samples.length - 1]!;
        return Math.cos(angleTo(Math.atan2(q.b.z, q.b.x), CAM_PHI)) < -0.3;
      };
      const n0 = c0 >= 0 && hiddenAt(c0 + 0.004) ? c0 + 0.004 : d0;
      const n1 = c1 >= 0 && hiddenAt(total - c1 - 0.004) ? c1 + 0.004 : d1;
      if (n0 === d0 && n1 === d1) break;
      d0 = n0;
      d1 = n1;
      laid = layLift(d0, d1);
    }
    samples.forEach((q, k) => {
      q.lift = laid.lift[k]!;
      q.c.copy(q.b).addScaledVector(q.n, q.lift);
    });
    for (const q of samples) if (q.lift > 0.4 * r && !spec.buried?.(q.c)) insert({ c: q.c, id });
    strands.push({ samples, spec });
  });
  const topAt = (x: number, z: number, radius: number) => {
    let best = -Infinity;
    const c = new Vector3(x, 0.15, z);
    const x0 = Math.floor((x - radius) / cell), x1 = Math.floor((x + radius) / cell);
    const z0 = Math.floor((z - radius) / cell), z1 = Math.floor((z + radius) / cell);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) for (let gy = 0; gy <= Math.ceil(0.3 / cell); gy++) {
      grid.get(`${gx},${gy},${gz}`)?.forEach((p) => {
        const d = Math.hypot(p.c.x - c.x, p.c.z - c.z);
        if (d < radius + r) best = Math.max(best, p.c.y + Math.sqrt(Math.max(0, r * r - Math.max(0, d - radius) ** 2)));
      });
    }
    return best;
  };
  LAYOUT = { strands, topAt };
  return LAYOUT;
}

/**
 * The composition of the nest, laid bottom to top: two tails that form the lowest ring and peel
 * off onto the well with square-cut ends, the main twirl (arcs that wrap the front and climb in
 * the fork's direction, their ends tucked into the core behind, where the fixed camera never
 * looks), and two strands that cross back over the twirl.
 */
function strandSpecs(): StrandSpec[] {
  const rand = rng(29);
  const R = NEST.radius, r = NEST.r;
  const deg = Math.PI / 180;
  const mSauce = meridianOf(0.15);
  const specs: StrandSpec[] = [];
  const onBed = (m: (t: number) => number, phi: (t: number) => number) => (t: number, n: Vector3) => bedAt(m(t), phi(t), n);
  // Tails: the nest's lowest ring. Each runs round the base from behind (starting inside the
  // core) and peels away onto the well at the front, curling out to a square-cut end.
  const tails: [number, number, number, number][] = [
    // start angle, peel angle (rel. camera), end radius, curl (rad past the peel)
    [2.5, 0.62, 0.415, -0.5],
    [-2.45, -0.95, 0.405, 0.45],
  ];
  for (const [a0, aPeel, rEnd, curl] of tails) {
    const tp = 0.8;
    const hug = R + 0.9 * r;
    specs.push({
      at: (t, n) => {
        n.set(0, 1, 0);
        const u = t < tp ? 0 : (t - tp) / (1 - tp);
        const phi = t < tp ? CAM_PHI + a0 + (aPeel - a0) * (t / tp) : CAM_PHI + aPeel + curl * (1 - (1 - u) ** 2) * 0.5 + curl * 0.5 * u * u;
        const rho = (t < 0.08 ? R - 0.02 + (hug - R + 0.02) * smoothstep(0, 0.08, t) : hug) + (rEnd - hug) * Math.pow(u, 1.4);
        return new Vector3(rho * Math.cos(phi), 0, rho * Math.sin(phi));
      },
      length: R * Math.abs(aPeel - a0) + 0.12,
      maxDt: (10 * deg) / Math.abs(aPeel - a0) * tp,
      tuck0: false,
      tuck1: false,
      buried: (c) => {
        const rho = Math.hypot(c.x, c.z);
        return rho < R - 0.004 && c.y + r < bedHeight(rho) - CORE_SINK;
      },
    });
  }
  // Main twirl: fourteen arcs that wrap the front and climb from screen right to left, their
  // ends tucked into the core behind. Each is placed by where it crosses the two flanks of the
  // nest (screen right and left): on both flanks the strands take evenly spaced slots up the
  // meridian (closer on the steep side, which faces the camera square-on, than on the crown,
  // which the 15° camera sees foreshortened), so neither flank bunches strands into pairs and
  // leaves the core bare between them; a strand's slot on the left is a near neighbour of its
  // slot on the right, and those swaps are the crossings on the front.
  const mKnee = meridianOf(0.305), mTop = mSauce + 0.01;
  /** Ends beyond mCrown (high on the crown) tuck in under the sauce, at mUnder. */
  const mCrown = meridianOf(0.27), mUnder = meridianOf(0.1);
  const STEEP = 6, SLOTS = 14;
  // The lowest slot rests on the tails, which ring the base on either flank.
  const mBase = 0.023;
  const slotM = (x: number) => (x <= STEEP ? mBase + ((mKnee - mBase) * x) / STEEP : mKnee + ((mTop - mKnee) * (x - STEEP)) / (SLOTS - STEEP));
  const order = Array.from({ length: SLOTS }, (_, k) => k);
  const swapped = order.map((k) => ({ k, key: k + (rand() - 0.5) * 3.2 })).sort((a, b) => a.key - b.key).map((e) => e.k);
  const leftSlot: number[] = [];
  swapped.forEach((k, slot) => (leftSlot[k] = slot));
  const climb = 0.5;
  const main = order.map((k) => ({ k, sR: k + 0.5 - climb / 2 + (rand() - 0.5) * 0.2, sL: leftSlot[k]! + 0.5 + climb / 2 + (rand() - 0.5) * 0.2 }));
  // Laid in random order, so which strand lies on top at a crossing varies.
  for (let k = main.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1));
    [main[k], main[j]] = [main[j]!, main[k]!];
  }
  for (const { sR, sL } of main) {
    const half = (sR < STEEP ? 136 + rand() * 8 : 150 + rand() * 10) * deg;
    const centre = CAM_PHI + (rand() - 0.5) * 0.3;
    const wob = rand() * TAU, wobF = 3 + rand() * 3;
    const tR = (CAM_PHI - Math.PI / 2 - (centre - half)) / (2 * half), tL = (CAM_PHI + Math.PI / 2 - (centre - half)) / (2 * half);
    const mR = slotM(Math.max(0, sR)), mL = slotM(sL);
    const lin = (t: number) => mR + ((mL - mR) * (t - tR)) / (tL - tR);
    // An end that would finish high on the back of the crown (seen over the sauce) runs on
    // inwards and tucks in under the sauce instead.
    const pull = (t: number, edge: number, from: number) => (lin(edge) > mCrown ? smoothstep(from, edge, t) * (mUnder - lin(t)) : 0);
    const mOf = (t: number) => Math.min(meridian().total - 0.01, Math.max(0.005, lin(t) + Math.max(0, pull(t, 0, tR * 0.6)) + Math.max(0, pull(t, 1, 1 - (1 - tL) * 0.6)) + 0.003 * Math.sin(wobF * t * Math.PI + wob)));
    const rhoMid = meridianAt((mR + mL) / 2)[0];
    specs.push({
      at: onBed(mOf, (t) => centre - half + 2 * half * t),
      length: rhoMid * 2 * half * 1.05,
      maxDt: ((sR < STEEP ? 10 : 12) * deg) / (2 * half),
      tuck0: true,
      tuck1: true,
    });
  }
  // Back over the twirl: low at one side, climbing across the front against it.
  const cross: [number, number, number, number][] = [
    // m start, m end, start angle (rel. camera), sweep
    [0.02, 0.2, 2.35, -4.8],
    [0.05, 0.215, -2.3, 4.55],
  ];
  for (const [m0, m1, a0, sweep] of cross) {
    const phi0 = CAM_PHI + a0;
    specs.push({
      at: onBed((t) => m0 + (m1 - m0) * smoothstep(0, 1, t), (t) => phi0 + sweep * t),
      length: meridianAt(0.5 * (m0 + m1))[0] * Math.abs(sweep) * 1.1,
      maxDt: (9 * deg) / Math.abs(sweep),
      tuck0: true,
      tuck1: true,
    });
  }
  // The crossing strands are laid first after the tails, so they lie on the bed and the twirl
  // drapes over them: their ends dive into the core freely instead of plunging off the top.
  specs.splice(2, 0, ...specs.splice(specs.length - cross.length, cross.length));
  return specs;
}

/**
 * Douglas–Peucker ring selection on a strand's centreline, with a largest parameter step and a
 * largest change of climb angle between rings (so a strand lifting over another bends smoothly
 * instead of kinking at the ring where the climb starts). Where the fixed camera sees the strand
 * (the front of the nest, `seen`), tolerance, step and turn are all tighter, so visible arcs
 * stay round and climbs stay smooth; hidden runs at the back carry fewer rings to pay for it.
 */
function selectRings(samples: StrandSample[], maxDt: number, seen: (q: StrandSample) => boolean): number[] {
  const keep = new Set<number>([0, samples.length - 1]);
  const seg = new Vector3(), w = new Vector3();
  const turn: number[] = [0];
  const vis = samples.map(seen);
  let prev = 0;
  for (let k = 1; k < samples.length; k++) {
    const a = samples[k - 1]!, b = samples[k]!;
    const climb = Math.atan2(b.lift - a.lift, Math.max(1e-6, b.s - a.s));
    // Tucked (hidden) runs may bend as they like.
    const shown = a.lift > 0.98 * NEST.r && b.lift > 0.98 * NEST.r;
    turn.push(turn[k - 1]! + (k > 1 && shown ? Math.abs(climb - prev) : 0));
    prev = climb;
  }
  const recurse = (i: number, j: number) => {
    if (j - i < 2) return;
    let seenSpan = false;
    for (let k = i; k <= j && !seenSpan; k++) seenSpan = vis[k]!;
    const tol = seenSpan ? 0.0014 : 0.0035;
    const maxTurn = ((seenSpan ? 7.5 : 12) * Math.PI) / 180;
    const dt = maxDt * (seenSpan ? 0.78 : 2.4);
    let worst = -1, wd = 0;
    const a = samples[i]!.c, b = samples[j]!.c;
    seg.subVectors(b, a);
    const l2 = Math.max(1e-12, seg.lengthSq());
    for (let k = i + 1; k < j; k++) {
      w.subVectors(samples[k]!.c, a);
      const t = clamp01(w.dot(seg) / l2);
      const d = w.addScaledVector(seg, -t).length();
      if (d > wd) { wd = d; worst = k; }
    }
    const bend = turn[j]! - turn[i]! > maxTurn;
    if (wd > tol || bend || samples[j]!.t - samples[i]!.t > dt) {
      let k = wd > tol ? worst : (i + j) >> 1;
      if (wd <= tol && bend) {
        const half = (turn[i]! + turn[j]!) / 2;
        k = i + 1;
        while (k < j - 1 && turn[k]! < half) k++;
      }
      keep.add(k);
      recurse(i, k);
      recurse(k, j);
    }
  };
  recurse(0, samples.length - 1);
  return [...keep].sort((a, b) => a - b);
}

/**
 * Whether the fixed camera sees a strand sample: on the front of the nest, or high on the
 * crown (seen over it), and not tucked under the core.
 */
function strandSeen(q: StrandSample): boolean {
  if (q.lift < 0.5 * NEST.r) return false;
  const phi = Math.atan2(q.c.z, q.c.x);
  const front = Math.cos(angleTo(phi, CAM_PHI));
  return front > -0.35 || q.c.y > 0.2;
}

/**
 * Centripetal Catmull–Rom point (α = ½) on the span P[i] → P[i+1] at u ∈ [0, 1]; the end spans
 * use mirrored phantom points. Centripetal knots never overshoot or cusp on uneven ring spacing,
 * so a resampled strand stays within the collision-checked centreline.
 */
function centripetal(P: Vector3[], i: number, u: number): Vector3 {
  const n = P.length;
  const p1 = P[i]!, p2 = P[i + 1]!;
  const p0 = i > 0 ? P[i - 1]! : p1.clone().multiplyScalar(2).sub(p2);
  const p3 = i + 2 < n ? P[i + 2]! : p2.clone().multiplyScalar(2).sub(p1);
  const k = (a: Vector3, b: Vector3) => Math.max(1e-6, Math.sqrt(a.distanceTo(b)));
  const t0 = 0, t1 = t0 + k(p0, p1), t2 = t1 + k(p1, p2), t3 = t2 + k(p2, p3);
  const t = t1 + (t2 - t1) * u;
  const mix = (a: Vector3, b: Vector3, ta: number, tb: number) => a.clone().multiplyScalar((tb - t) / (tb - ta)).addScaledVector(b, (t - ta) / (tb - ta));
  const A1 = mix(p0, p1, t0, t1), A2 = mix(p1, p2, t1, t2), A3 = mix(p2, p3, t2, t3);
  const B1 = mix(A1, A2, t0, t2), B2 = mix(A2, A3, t1, t3);
  return mix(B1, B2, t1, t2);
}

/**
 * Render rings on a strand, chosen along a centripetal Catmull–Rom spline through its dense,
 * collision-checked centreline samples. A ring is placed whenever the spline has turned by the
 * joint limit since the last one (tight where the camera looks, loose where it cannot) or run
 * the longest span, so no joint kinks by more than the limit and a climb over a crossing bends
 * as smoothly as an arc; the chords stay far inside the strands' clearance. Frames are then
 * carried along by parallel transport (rotation-minimising), so the five-sided section never
 * twists between rings (a twist pinches the tube into a lump).
 */
const STRAND_RINGS = { seenTurn: 5.2, hiddenTurn: 16, seenSpan: 0.034, hiddenSpan: 0.09, sub: 4, chordTol: 0.0006, minSpan: 0.004 } as const;

function strandRings(samples: StrandSample[]): { path: Vector3[]; up: Vector3[]; lift: number[] } {
  const C = samples.map((q) => q.c);
  const K = C.length;
  const seen = samples.map(strandSeen);
  const deg = Math.PI / 180;
  // Fine walk along the spline: points, their dense-sample parameter.
  const fine: { p: Vector3; k: number }[] = [{ p: C[0]!.clone(), k: 0 }];
  for (let i = 0; i < K - 1; i++) for (let s = 1; s <= STRAND_RINGS.sub; s++) fine.push({ p: s === STRAND_RINGS.sub ? C[i + 1]!.clone() : centripetal(C, i, s / STRAND_RINGS.sub), k: i + s / STRAND_RINGS.sub });
  const keep: number[] = [0];
  let turn = 0, len = 0;
  const d0 = new Vector3(), d1 = new Vector3();
  for (let f = 1; f < fine.length - 1; f++) {
    d0.subVectors(fine[f]!.p, fine[f - 1]!.p);
    d1.subVectors(fine[f + 1]!.p, fine[f]!.p);
    len += d0.length();
    if (d0.lengthSq() > 1e-14 && d1.lengthSq() > 1e-14) turn += d0.angleTo(d1);
    const k = Math.round(fine[f]!.k);
    const vis = seen[Math.min(K - 1, k)]! || seen[Math.min(K - 1, Math.floor(fine[f]!.k))]!;
    const maxTurn = (vis ? STRAND_RINGS.seenTurn : STRAND_RINGS.hiddenTurn) * deg;
    const maxLen = vis ? STRAND_RINGS.seenSpan : STRAND_RINGS.hiddenSpan;
    if ((turn >= maxTurn && len >= STRAND_RINGS.minSpan) || len >= maxLen) {
      keep.push(f);
      turn = 0;
      len = 0;
    }
  }
  keep.push(fine.length - 1);
  const lerpAt = <T>(x: number, get: (i: number) => T, mix: (a: T, b: T, u: number) => T) => {
    const i = Math.min(K - 2, Math.floor(x));
    return mix(get(i), get(i + 1), x - i);
  };
  // Chords must stay on the collision-checked centreline: wherever a span between rings strays
  // from the spline by more than a hair (a small fraction of the clearance between strands), the
  // farthest point becomes a ring too. Runs tucked inside the core may cut corners freely.
  const liftAt = (f: number) => lerpAt(fine[f]!.k, (i) => samples[i]!.lift, (a, b, u) => a + (b - a) * u);
  const seg = new Vector3(), w = new Vector3();
  for (let pass = 0; pass < 8; pass++) {
    let added = false;
    for (let q = keep.length - 2; q >= 0; q--) {
      const fa = keep[q]!, fb = keep[q + 1]!;
      if (fb - fa < 2) continue;
      const a = fine[fa]!.p, b = fine[fb]!.p;
      seg.subVectors(b, a);
      const l2 = Math.max(1e-12, seg.lengthSq());
      let worst = -1, wd = 0, exposed = false;
      for (let f = fa + 1; f < fb; f++) {
        if (liftAt(f) > 0.4 * NEST.r) exposed = true;
        w.subVectors(fine[f]!.p, a);
        const d = w.addScaledVector(seg, -clamp01(w.dot(seg) / l2)).length();
        if (d > wd) { wd = d; worst = f; }
      }
      if (wd > (exposed ? STRAND_RINGS.chordTol : 4 * STRAND_RINGS.chordTol)) {
        keep.splice(q + 1, 0, worst);
        added = true;
      }
    }
    if (!added) break;
  }
  const P = keep.map((f) => fine[f]!.p);
  const L = keep.map((f) => lerpAt(fine[f]!.k, (i) => samples[i]!.lift, (a, b, u) => a + (b - a) * u));
  const U0 = keep.map((f) => lerpAt(fine[f]!.k, (i) => samples[i]!.n, (a, b, u) => a.clone().lerp(b, u).normalize()));
  // Parallel transport, seeded with the bed normal at the first ring (same tangents as tube()).
  const m = P.length;
  const T = P.map((_, k) => P[Math.min(m - 1, k + 1)]!.clone().sub(P[Math.max(0, k - 1)]!).normalize());
  const N: Vector3[] = [];
  const seed = U0[0]!.clone().addScaledVector(T[0]!, -T[0]!.dot(U0[0]!));
  N.push(seed.lengthSq() > 1e-10 ? seed.normalize() : new Vector3(0, 1, 0));
  const axis = new Vector3();
  for (let k = 1; k < m; k++) {
    const v = N[k - 1]!.clone();
    axis.crossVectors(T[k - 1]!, T[k]!);
    const s = axis.length();
    if (s > 1e-9) v.applyAxisAngle(axis.divideScalar(s), Math.atan2(s, T[k - 1]!.dot(T[k]!)));
    v.addScaledVector(T[k]!, -T[k]!.dot(v));
    N.push(v.lengthSq() > 1e-10 ? v.normalize() : N[k - 1]!.clone());
  }
  return { path: P, up: N, lift: L };
}

/** The rendered centreline of every strand: its ring centres and frame normals (also for tooling). */
export function strandPaths(): { path: Vector3[]; up: Vector3[]; lift: number[]; tuck0: boolean; tuck1: boolean }[] {
  return nestLayout().strands.map(({ samples, spec }) => ({ ...strandRings(samples), tuck0: spec.tuck0, tuck1: spec.tuck1 }));
}

/**
 * The core under the strands: the bed offset inwards along its normal. On the side of the nest
 * the camera sees, it sinks a further strand diameter and more at mid-height, so a gap between
 * strand bands reads as depth (strands below) rather than as a smooth wall; behind, where the
 * strand ends tuck in, and under the sauce it stays just under the lowest strands.
 */
function coreSink(mm: number, phi: number): number {
  const T = meridian();
  const side = smoothstep(0.004, 0.03, mm) * (1 - smoothstep(meridianOf(0.23), meridianOf(0.17), mm));
  const front = smoothstep(-0.55, 0.05, Math.cos(angleTo(phi, CAM_PHI)));
  return CORE_SINK + CORE_DEEP * side * front * (mm < T.total ? 1 : 0);
}
/** Extra depth of the seen side of the core: two strand radii and a little more. */
const CORE_DEEP = 2 * NEST.r + 0.0025;

/**
 * The nest: round spaghetti strands (five-sided, smooth-shaded, so each carries a highlight line
 * with a dark gap either side) draped over one another, square-cut where an end shows, over a
 * hidden core sunk below the lowest strands.
 */
export function pastaNest(): BufferGeometry {
  const r = NEST.r;
  const parts: BufferGeometry[] = [];
  // Square-cut ends where an end shows; a tucked end is capped too unless it lies wholly inside
  // the core (a crossing near the end can hold it above the core).
  for (const { path, up, lift, tuck0, tuck1 } of strandPaths()) {
    parts.push(tube({ path, up, sides: 5, analytic: true, half: () => [r, r], capStart: !tuck0 || lift[0]! > -r, capEnd: !tuck1 || lift[lift.length - 1]! > -r }));
  }
  // Core: a grid over the bed (meridian rows × plan columns), ending in a pole at the crown.
  const T = meridian();
  const ms = [0, 0.012, 0.03, 0.055, 0.085, 0.12, 0.16, 0.2, 0.25, 0.3, 0.35, T.total];
  const cols = 28;
  const nb = new Vector3();
  const core = wrapGrid(ms.length, cols, (i, j) => {
    const mm = Math.min(ms[i]!, T.total);
    const phi = (j / cols) * TAU;
    const b = bedAt(mm, phi, nb);
    if (i === ms.length - 1) return [0, b.y - coreSink(mm, phi), 0];
    const d = coreSink(mm, phi);
    const rho = Math.hypot(b.x, b.z);
    const k = rho > 1e-6 ? Math.max(0, rho - Math.hypot(nb.x, nb.z) * d) / rho : 0;
    return [b.x * k, Math.max(0.0004, b.y - nb.y * d), b.z * k];
  });
  // Face outwards (front faces only are drawn): test one side triangle against its radial.
  {
    const idx = core.index!.array as Uint32Array | Uint16Array;
    const cp = core.getAttribute('position') as BufferAttribute;
    const a = new Vector3().fromBufferAttribute(cp, idx[cols * 6]!), b = new Vector3().fromBufferAttribute(cp, idx[cols * 6 + 1]!), c = new Vector3().fromBufferAttribute(cp, idx[cols * 6 + 2]!);
    const fnrm = b.clone().sub(a).cross(c.clone().sub(a));
    if (fnrm.dot(new Vector3(a.x, 0, a.z)) < 0) for (let t = 0; t < idx.length; t += 3) { const q = idx[t + 1]!; idx[t + 1] = idx[t + 2]!; idx[t + 2] = q; }
  }
  core.computeVertexNormals();
  // The core stands for the strands underneath, in the shade of those above: one shading normal
  // for all of it, turned away from the key (no key light) yet still towards the fixed camera
  // (a normal facing away from the eye would pick up a bright Fresnel rim), so a gap between
  // strand bands reads as shadowed depth, never as a lit wall.
  const cn = core.getAttribute('normal') as BufferAttribute;
  const el = (15 * Math.PI) / 180;
  const v = new Vector3(Math.cos(CAM_PHI) * Math.cos(el), Math.sin(el), Math.sin(CAM_PHI) * Math.cos(el)).multiplyScalar(CORE_LEAN).add(new Vector3(0, -1, 0)).normalize();
  for (let i = 0; i < cn.count; i++) cn.setXYZ(i, v.x, v.y, v.z);
  parts.push(core);
  return restOnWell(mergeIndexed(parts), 0.0004, false);
}

/**
 * Plan angle of the studio key's half-vector at the shared camera (key spot at (−4.2, 7.8, 5.4),
 * style reference v1.1). A glossy face whose normal leans about 55° from vertical towards this
 * direction sends the key's highlight to the camera; it lies about 23° to screen left of the
 * camera-facing side.
 */
const KEY_PHI = (() => {
  const az = (20 * Math.PI) / 180, el = (15 * Math.PI) / 180;
  const h = new Vector3(-4.2, 7.8, 5.4).normalize().add(new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)));
  return Math.atan2(h.z, h.x);
})();

/**
 * Sauce: a glossy pool laid over the crown's strands. Radius at the back and the front, the
 * straight front edge (distance of the chord facing the key), dome and lip heights.
 */
const SAUCE = { cx: 0.0, cz: 0.012, back: 0.15, front: 0.192, chord: 0.176, dome: 0.009, lipBack: 0.005, lipFront: 0.0155 } as const;
/** Centre of the pool's thick front: between the key's highlight direction and the camera. */
const SAUCE_FRONT = KEY_PHI - 0.2;
/** 0 at the back of the pool, 1 at its thick front. */
const sauceFront = (theta: number) => ((1 + Math.cos(angleTo(theta, SAUCE_FRONT))) / 2) ** 2;

function sauceMain(theta: number): number {
  const f = sauceFront(theta);
  // Soft lobes round the back and flanks, where the sauce has settled unevenly between strands.
  const round = SAUCE.back + (SAUCE.front - SAUCE.back) * f + (0.006 * Math.sin(3 * theta + 0.6) + 0.004 * Math.sin(5 * theta + 2.1) + 0.0025 * Math.sin(9 * theta + 0.4)) * (1 - f);
  // The front runs straight across the key's direction, so its highlight is a long line
  // instead of a spot: a smooth minimum of the round outline and the chord.
  const c = Math.cos(angleTo(theta, KEY_PHI));
  if (c <= 0.2) return round;
  const chord = SAUCE.chord / c, k = 0.012;
  const h = clamp01(0.5 + (chord - round) / (2 * k));
  return chord * (1 - h) + round * h - k * h * (1 - h);
}

interface SauceBase { x0: number; step: number; n: number; h: Float32Array; crest: Float32Array }
let SAUCE_BASE: SauceBase | null = null;

/**
 * Surface under the sauce: an envelope over the strand tops (grown by a max filter, then
 * smoothed), so the pool lies on the pasta like a blanket and its front lip hangs in front of
 * the strands instead of disappearing under them.
 */
function sauceBed(x: number, z: number): number {
  if (!SAUCE_BASE) {
    const layout = nestLayout();
    const x0 = -0.28, step = 0.008, n = 71;
    let h = new Float32Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const px = x0 + i * step, pz = x0 + j * step;
      h[i * n + j] = Math.max(bedHeight(Math.hypot(px, pz)) + 2 * NEST.r, layout.topAt(px, pz, 0.004));
    }
    const pass = (src: Float32Array, op: (v: number[]) => number) => {
      const out = new Float32Array(n * n);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const v: number[] = [];
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) v.push(src[Math.min(n - 1, Math.max(0, i + a)) * n + Math.min(n - 1, Math.max(0, j + b))]!);
        out[i * n + j] = op(v);
      }
      return out;
    };
    // The strand crests as they lie (one light blur), for the thin film round the pool's edge.
    const crest = pass(h, (v) => v.reduce((a, b) => a + b, 0) / v.length);
    h = pass(h, (v) => Math.max(...v));
    for (let k = 0; k < 2; k++) h = pass(h, (v) => v.reduce((a, b) => a + b, 0) / v.length);
    SAUCE_BASE = { x0, step, n, h, crest };
  }
  return sampleSauceGrid(SAUCE_BASE.h, x, z) + 0.0015;
}

/** Height of the strand crests under a plan point (lightly smoothed), or the bed's top strand. */
function sauceCrest(x: number, z: number): number {
  sauceBed(x, z);
  return sampleSauceGrid(SAUCE_BASE!.crest, x, z);
}

function sampleSauceGrid(h: Float32Array, x: number, z: number): number {
  const { x0, step, n } = SAUCE_BASE!;
  const fx = Math.min(n - 1.001, Math.max(0, (x - x0) / step)), fz = Math.min(n - 1.001, Math.max(0, (z - x0) / step));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const at = (a: number, b: number) => h[a * n + b]!;
  return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
}

function sauceHeightAt(x: number, z: number): number | null {
  const dx = x - SAUCE.cx, dz = z - SAUCE.cz;
  const theta = Math.atan2(dz, dx);
  const d = Math.hypot(dx, dz);
  const edge = sauceMain(theta);
  if (d >= edge) return null;
  // A smooth, softly domed pool with a rounded lip: thick and broadly rolled at the front, where
  // the roll turns through the key's half-vector and draws a crisp wet highlight along the
  // straight front edge, thin at the back and sides.
  const main = edge;
  const f = sauceFront(theta);
  const lip = SAUCE.lipBack + (SAUCE.lipFront - SAUCE.lipBack) * f;
  const roll = 0.01 + 0.016 * f;
  const u0 = Math.max(0, 1 - roll / edge), u = d / edge;
  const shoulder = u <= u0 ? 1 : Math.sqrt(Math.max(0, 1 - ((u - u0) / (1 - u0)) ** 2));
  const dome = SAUCE.dome * Math.pow(Math.max(0, 1 - (d / main) ** 2), 2);
  // Sauce, not a moulded cap: a loose, uneven surface (two octaves of soft swells) that settles
  // flat towards the rolled lip, so the wet highlight line stays clean.
  const swell = (0.0016 * Math.sin(dx * 31 + 1.3) * Math.sin(dz * 27 + 0.4) + 0.0008 * Math.sin(dx * 63 - dz * 21 + 2.2) * Math.sin(dz * 58 + dx * 17 + 0.7)) * (1 - u) ** 0.7;
  const bed = sauceBed(x, z);
  const full = bed + lip * shoulder + dome + swell;
  // Round the sides and back the pool thins out over its outer band to a film between the
  // strands: its level drops under their crests (the blanket follows the crests), so the strands
  // break through it as it runs out.
  const film = sauceCrest(x, z) - SAUCE_FILM * NEST.r;
  return full + (Math.min(full, film) - full) * sauceThin(theta, u);
}

/**
 * Weight of the thin film round the back and sides of the pool (0 on its body, 1 at the edge);
 * the thick rolled front lip (the wet highlight line) is untouched. SAUCE_FILM: how far under
 * the strand crests the film settles, in strand radii.
 */
const SAUCE_FILM = 1.0;
function sauceThin(theta: number, u: number): number {
  return (1 - sauceFront(theta)) ** 1.2 * smoothstep(0.5, 0.86, u);
}

/** Glossy tomato sauce: a smooth pool over the crown with a rounded, light-catching front lip and three runs down the nest. */
export function sauceDollop(rings = 14, cols = 48): BufferGeometry {
  const pos: number[] = [];
  const cy = sauceHeightAt(SAUCE.cx, SAUCE.cz)!;
  pos.push(SAUCE.cx, cy, SAUCE.cz);
  for (let i = 1; i <= rings; i++) {
    // Rings crowd the edge, where the lip rounds over (a crisp wet highlight needs several
    // rings across the roll). The last ring tucks out and down onto the strands at 45°.
    const v = Math.min(i, rings - 1) / (rings - 1);
    const u = (1 - Math.pow(1 - v, 2.2)) * 0.9995;
    for (let j = 0; j < cols; j++) {
      const theta = (j / cols) * TAU;
      const edge = sauceMain(theta);
      const d = u * edge + (i === rings ? 0.0035 : 0);
      const x = SAUCE.cx + Math.cos(theta) * d, z = SAUCE.cz + Math.sin(theta) * d;
      const y = i === rings ? sauceBed(x, z) - 0.004 : sauceHeightAt(x, z) ?? sauceBed(x, z);
      pos.push(x, y, z);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < cols; j++) idx.push(0, 1 + ((j + 1) % cols), 1 + j);
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < cols; j++) {
      const j1 = (j + 1) % cols;
      const a = 1 + (i - 1) * cols + j, b = 1 + (i - 1) * cols + j1, c = 1 + i * cols + j, d = 1 + i * cols + j1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Where the pool thins to a film its shading normal is drawn a little towards the vertical:
  // the film's outward slope faces away from the key and would otherwise pick up a grey,
  // grazing clearcoat sheen; drawn up, it reads as the same sauce, a shade darker than the body.
  const nrm = g.getAttribute('normal') as BufferAttribute;
  const nv = new Vector3();
  const gp = g.getAttribute('position') as BufferAttribute;
  for (let k = 1; k < gp.count; k++) {
    const dx = gp.getX(k) - SAUCE.cx, dz = gp.getZ(k) - SAUCE.cz;
    const theta = Math.atan2(dz, dx), u = Math.min(1, Math.hypot(dx, dz) / sauceMain(theta));
    const w = 0.6 * sauceThin(theta, u);
    if (w <= 0) continue;
    nv.fromBufferAttribute(nrm, k);
    nv.y += w;
    nv.normalize();
    nrm.setXYZ(k, nv.x, nv.y, nv.z);
  }
  // The tuck is shaded like the lip above it, bent upwards: no grazing, Fresnel-lit fringe.
  for (let j = 0; j < cols; j++) {
    const k = 1 + (rings - 1) * cols + j, above = k - cols;
    nv.fromBufferAttribute(nrm, above);
    nv.y += 0.6;
    nv.normalize();
    nrm.setXYZ(k, nv.x, nv.y, nv.z);
  }
  return g;
}

/**
 * Leaf along +x from the origin (petiole end), up +y: ovate outline with a pointed tip, a
 * V fold along the midrib, and a soft droop towards the tip. Closed thin section.
 */
export function leaf(length: number, width: number, fold = 0.35, droop = 0.2, rings = 10, sides = 8, crease = 0): BufferGeometry {
  const thick = Math.max(0.0012, width * 0.05);
  const g = wrapGrid(rings, sides, (i, j) => {
    const u = i / (rings - 1);
    const w = (width / 2) * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.9) * (1 - 0.1 * u);
    const psi = -(j / sides) * TAU;
    const z = Math.cos(psi) * w;
    // A creased leaf is sunk along its midrib (a groove down the centre of the blade, fading
    // out at the tip), on top of the fold.
    const groove = crease * w * Math.exp(-((z / (0.22 * Math.max(w, 1e-6))) ** 2)) * (1 - u * 0.6);
    const y = Math.sin(psi) * thick * (0.3 + 0.7 * Math.sin(Math.PI * u)) + fold * Math.abs(z) - droop * length * (u - 0.35) ** 2 - groove;
    return [u * length, y, z];
  });
  if (crease <= 0) {
    g.computeVertexNormals();
    return g;
  }
  // The midrib is a crisp crease: normals split along it (and round the blade's edge).
  const creased = toCreasedNormals(g, (24 * Math.PI) / 180);
  g.dispose();
  return mergeVertices(creased);
}

/** Placement matrix: yaw about y, pitch about the leaf's local z, then translate. */
function placeM(x: number, y: number, z: number, yaw: number, pitch = 0, roll = 0, scale = 1): Matrix4 {
  return new Matrix4()
    .makeTranslation(x, y, z)
    .multiply(new Matrix4().makeRotationY(yaw))
    .multiply(new Matrix4().makeRotationZ(pitch))
    .multiply(new Matrix4().makeRotationX(roll))
    .multiply(new Matrix4().makeScale(scale, scale, scale));
}

/** Surface under garnish: the sauce where it lies, else the strand tops. */
function garnishBase(x: number, z: number): number {
  const layout = nestLayout();
  return Math.max(sauceHeightAt(x, z) ?? -Infinity, layout.topAt(x, z, 0.014), bedHeight(Math.hypot(x, z)) + 2 * NEST.r);
}

/**
 * Two basil leaves (one large, one small) laid flat on the crown's front-right shoulder,
 * draped over the sauce's edge onto the strands: garnish to one side, never a calyx on top,
 * and clear of the lip's highlight (which falls front-left of centre).
 */
export function basilLeaves(): BufferGeometry {
  const specs: [number, number, number, number, number][] = [
    // angle (rel. camera), radius, heading (rel. radial), length, width
    [-0.72, 0.11, 0.45, 0.108, 0.058],
    [-1.05, 0.155, -0.6, 0.07, 0.04],
  ];
  const parts = specs.map(([a, rad, heading, len, wid], i) => {
    // The larger leaf carries a creased midrib (12 sides, so the groove has room across the blade).
    const g = i === 0 ? leaf(len, wid, 0.21, 0, 10, 12, 0.18) : leaf(len, wid, 0.2, 0);
    const phi = CAM_PHI + a;
    const ox = SAUCE.cx + Math.cos(phi) * rad, oz = SAUCE.cz + Math.sin(phi) * rad;
    // Heading in plan: outward from the crown, turned by `heading`.
    const hdg = phi + heading;
    const ux = Math.cos(hdg), uz = Math.sin(hdg);
    const p = g.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i), ly = p.getY(i), lz = p.getZ(i);
      // Start the petiole a little back so the leaf's middle sits at the placement point.
      const s = lx - len * 0.35;
      const x = ox + ux * s - uz * lz, z = oz + uz * s + ux * lz;
      p.setXYZ(i, x, garnishBase(x, z) + 0.0016 + ly, z);
    }
    g.computeVertexNormals();
    return g;
  });
  return mergeIndexed(parts);
}

/** Low-poly caster for the nest with its sauce. */
export function pastaProxy(): BufferGeometry {
  const pts: ProfilePoint[] = [[0, 0.001], [NEST.radius * 0.99, 0.001]];
  for (let i = 1; i <= 6; i++) {
    const rho = NEST.radius * 0.99 * (1 - i / 6);
    pts.push([rho, Math.max(0.002, bedHeight(rho) + (rho < 0.19 ? 0.024 : 0.01))]);
  }
  return turned(pts, { segments: 16, filletSegments: 1 });
}

// ── Vegetables ──────────────────────────────────────────────────────────────

/** Plan unit vectors of the camera frame: towards the camera, and to screen right. */
const FWD = { x: Math.cos(CAM_PHI), z: Math.sin(CAM_PHI) } as const;
const SCREEN_RIGHT = { x: Math.sin(CAM_PHI), z: -Math.cos(CAM_PHI) } as const;

/** Food-root plan point `front` towards the camera and `right` to screen right of the centre. */
function planAt(front: number, right: number): Vector3 {
  return new Vector3(FWD.x * front + SCREEN_RIGHT.x * right, 0, FWD.z * front + SCREEN_RIGHT.z * right);
}

interface Ball { c: Vector3; r: number; owner: number }

/**
 * Collision model of the vegetable pile. Every placed piece is a set of balls (bud clusters,
 * stem and carrot sections, tomatoes); a piece added later rests on the well or on the pieces
 * already there, so the pile stacks without interpenetration and without floating.
 */
class Pile {
  readonly balls: Ball[] = [];
  add(c: Vector3, r: number, owner: number): void {
    this.balls.push({ c: c.clone(), r, owner });
  }
  /** Lowest centre height of a ball of radius r at plan (x, z). */
  support(x: number, z: number, r: number): number {
    let y = r + 0.0006;
    for (const b of this.balls) {
      const R = r + b.r, d2 = (x - b.c.x) ** 2 + (z - b.c.z) ** 2;
      if (d2 < R * R) y = Math.max(y, b.c.y + Math.sqrt(R * R - d2));
    }
    return y;
  }
  /** Lower a ball at (x, z) and let it roll down the support surface into a pocket. */
  settle(x: number, z: number, r: number): Vector3 {
    let y = this.support(x, z, r), step = 0.004;
    while (step > 0.0002) {
      let best: [number, number, number] | null = null;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        const nx = x + Math.cos(a) * step, nz = z + Math.sin(a) * step;
        const ny = this.support(nx, nz, r);
        if (ny < y - 1e-7 && (!best || ny < best[2])) best = [nx, nz, ny];
      }
      if (best) [x, z, y] = best;
      else step /= 2;
    }
    return new Vector3(x, y, z);
  }
}

/**
 * Broccoli floret: a pale stalk with its cut end on the well at (front, right) in the camera
 * frame, leaning towards `leanTo` by `lean` radians, under a crown of sub-florets of radius
 * `crown`.
 */
export interface Floret { front: number; right: number; /** Stalk length, base to head centre. */ stalk: number; crown: number; /** Dome height over radius (default HEAD_RISE). */ rise?: number; /** Sub-florets round the top one (default 5). */ ring?: number; lean: number; leanTo: [number, number]; seed: number }
/** Baby carrot from its shoulder (the trimmed crown) to its tip, both in the camera frame; bowed in plan by `bend`. */
export interface CarrotSpec { shoulder: [number, number]; tip: [number, number]; radius: number; bend: number; /** Splay of the fronds (radians about the carrot's axis). */ fronds: number[] }
/** Cherry tomato dropped at (front, right) that settles into the pile; vine tomatoes carry a calyx. */
export interface TomatoSpec { front: number; right: number; r: number; vine: boolean }

/**
 * Roasted vegetables, composed for the fixed camera as one generous, layered mound that fills the
 * food envelope under the cloche's taper: a bank of broccoli across the back and down the left
 * flank round a big central floret (the pile's peak), three baby carrots lying side by side
 * across the front — their full length faces the camera, their trimmed crowns and feathery tops
 * at the front left, their tips running in to the right — and a truss of cherry tomatoes on the
 * vine clustered at the front right. One bank above, one run of carrots and one cluster of
 * tomatoes below: no pair of blobs over a crescent, so nothing reads as a face.
 */
export const FLORETS: Floret[] = [
  { front: -0.08, right: -0.03, stalk: 0.16, crown: 0.17, lean: 0.22, leanTo: [1, -0.1], seed: 3 },
  { front: -0.26, right: 0.19, stalk: 0.15, crown: 0.14, rise: 0.58, lean: 0.5, leanTo: [1, 0.6], seed: 11 },
  { front: -0.29, right: -0.15, stalk: 0.15, crown: 0.14, rise: 0.56, lean: 0.5, leanTo: [1, -0.8], seed: 17 },
  { front: 0.03, right: -0.3, stalk: 0.15, crown: 0.14, rise: 0.6, lean: 0.45, leanTo: [0.1, -1], seed: 5 },
];
export const CARROTS: CarrotSpec[] = [
  { shoulder: [0.22, -0.22], tip: [0.25, 0.2], radius: 0.05, bend: 0.008, fronds: [-0.45, 0.3] },
  { shoulder: [0.36, -0.08], tip: [0.3, 0.25], radius: 0.054, bend: -0.01, fronds: [-0.55, 0, 0.5] },
  { shoulder: [0.3, -0.18], tip: [0.2, 0.24], radius: 0.047, bend: 0.006, fronds: [-0.3, 0.35] },
];
export const TOMATOES: TomatoSpec[] = [
  { front: 0.1, right: 0.27, r: 0.07, vine: true },
  { front: -0.07, right: 0.33, r: 0.066, vine: true },
  { front: 0.21, right: 0.32, r: 0.066, vine: true },
  { front: -0.03, right: 0.19, r: 0.064, vine: true },
];
const TOMATO_SQUASH = 0.9;

/** Radius of a carrot at t ∈ [0, 1] from the crown to the tip (R at the shoulder). */
function carrotRadius(t: number, R: number): number {
  // A domed crown (the trimmed top, rounded over), then a long gentle taper to a fine tip.
  const tc = 0.065;
  const crown = t < tc ? Math.sqrt(Math.max(0, 1 - (1 - t / tc) ** 2)) : 1;
  const body = Math.pow(Math.max(0, 1 - t), 0.6) * (1 - 0.06 * t);
  // Faint growth rings, and the gentle swells of a grown root (seeded by its size).
  const rings = 1 - 0.035 * Math.pow(Math.max(0, Math.cos(TAU * t * 7.5)), 10) * smoothstep(0.12, 0.25, t);
  const swell = 1 + 0.03 * Math.sin(t * 17 + R * 900) * Math.sin(t * 5.3 + R * 400) * smoothstep(0.08, 0.2, t);
  return R * crown * body * rings * swell;
}

/** One sub-floret of a head: centre, axis (u) with its frame, radius, and the buds on its dome. */
interface SubFloret { c: Vector3; u: Vector3; X: Vector3; Z: Vector3; s: number; lobes: { d: Vector3; w: number }[] }
interface PlacedFloret { spec: Floret; base: Vector3; up: Vector3; X: Vector3; Z: Vector3; head: Vector3; neck: Vector3; A: number; B: number; subs: SubFloret[] }
interface PlacedCarrot { spec: CarrotSpec; at: (t: number) => Vector3; axis: Vector3 }
interface PlacedTomato { spec: TomatoSpec; c: Vector3 }
interface VegLayout { florets: PlacedFloret[]; carrots: PlacedCarrot[]; tomatoes: PlacedTomato[]; pile: Pile }

let VEG: VegLayout | null = null;

/** Top of the food envelope at plan radius rho (food_root space), less a hair of margin. */
function envelopeTop(rho: number): number {
  return 0.26 + (0.12 - 0.26) * Math.min(1, rho / 0.5) - 0.004;
}

function buildFloret(f: Floret, leanAngle: number, stalk: number, scale = 1): PlacedFloret {
  const rand = rng(f.seed);
  const base = planAt(f.front, f.right);
  base.y = 0.0006;
  const lean = planAt(f.leanTo[0], f.leanTo[1]).normalize();
  const up = new Vector3(0, Math.cos(leanAngle), 0).addScaledVector(lean, Math.sin(leanAngle)).normalize();
  const X = new Vector3(1, 0, 0).addScaledVector(up, -up.x).normalize();
  const Z = new Vector3().crossVectors(X, up).normalize();
  // The head: a crown A across and B high on the end of the stalk, made of sub-florets — one on
  // top and a ring round it, each a rounded dome of buds on its own branch — so it reads as a
  // floret (clusters parted by shadowed clefts, branches under them), not as one smooth cap.
  const A = f.crown * scale, B = (f.rise ?? HEAD_RISE) * A;
  const head = base.clone().addScaledVector(up, stalk);
  const neck = head.clone().addScaledVector(up, -0.4 * B);
  const ring = f.ring ?? 5;
  const sn = Math.sin(Math.PI / ring);
  const sR = ((A * sn) / (1 + sn)) * 1.24, sC = sR * 1.18;
  const subs: SubFloret[] = [];
  const addSub = (c: Vector3, u: Vector3, sz: number) => {
    const sx = new Vector3(1, 0, 0).addScaledVector(u, -u.x);
    if (sx.lengthSq() < 1e-6) sx.set(0, 0, 1).addScaledVector(u, -u.z);
    sx.normalize();
    const sz3 = new Vector3().crossVectors(sx, u).normalize();
    const lobes: SubFloret['lobes'] = [];
    const bud = (polar: number, az: number, w: number) => lobes.push({ d: new Vector3().addScaledVector(sx, Math.sin(polar) * Math.cos(az)).addScaledVector(sz3, Math.sin(polar) * Math.sin(az)).addScaledVector(u, Math.cos(polar)).normalize(), w });
    bud(0.12 * rand(), rand() * TAU, 1);
    const ph = rand() * TAU;
    for (let i = 0; i < 6; i++) bud(0.9 + (rand() - 0.5) * 0.15, ph + (i / 6) * TAU + (rand() - 0.5) * 0.35, 0.9 + 0.15 * rand());
    subs.push({ c, u, X: sx, Z: sz3, s: sz, lobes });
  };
  const tilt = (a: number, radial: Vector3) => up.clone().multiplyScalar(Math.cos(a)).addScaledVector(radial, Math.sin(a)).normalize();
  const ph = rand() * TAU;
  addSub(head.clone().addScaledVector(up, B - 0.85 * sC).addScaledVector(X, 0.08 * sC * (rand() - 0.5)), tilt(0.08, X), sC);
  for (let i = 0; i < ring; i++) {
    const az = ph + (i / ring) * TAU + (rand() - 0.5) * 0.25;
    const radial = new Vector3().addScaledVector(X, Math.cos(az)).addScaledVector(Z, Math.sin(az));
    const sz = sR * (0.92 + 0.16 * rand());
    addSub(head.clone().addScaledVector(radial, A - sz).addScaledVector(up, 0.22 * B + 0.04 * B * (rand() - 0.5)), tilt(0.62, radial), sz);
  }
  return { spec: f, base, up, X, Z, head, neck, A, B, subs };
}

/** Extreme of a floret's crown surface (sampled over every sub-floret): largest `fn` over it. */
function headExtreme(p: PlacedFloret, fn: (q: Vector3) => number): number {
  let best = -Infinity;
  for (const q of p.subs) for (let i = 0; i <= 10; i++) for (let j = 0; j < 14; j++) best = Math.max(best, fn(subPoint(q, (i / 10) * Math.PI, (j / 14) * TAU)));
  return best;
}

/**
 * A floret keeps its lean; its stalk shortens (the crown sinks) until the crown clears the food
 * envelope's taper, but never so far that the crown's underside meets the well; a crown that
 * still stands proud is trimmed smaller instead.
 */
function placeFloret(f: Floret): PlacedFloret {
  const lean = f.lean;
  let stalk = f.stalk, scale = 1, p = buildFloret(f, lean, stalk, scale);
  for (let k = 0; k < 40; k++) {
    const over = headExtreme(p, (q) => q.y - envelopeTop(Math.hypot(q.x, q.z)));
    const low = -headExtreme(p, (q) => -q.y);
    if (over <= 0 && low >= 0.0025 - 1e-6) break;
    const dy = Math.max(0.3, p.up.y);
    const sMin = stalk - (low - 0.0025) / dy, sFit = Math.min(f.stalk, stalk - (over + 0.0005) / dy);
    if (sFit >= sMin) stalk = over > 0 ? sFit : sMin;
    else { stalk = sMin; scale *= 0.97; }
    p = buildFloret(f, lean, stalk, scale);
  }
  return p;
}

/**
 * Surface of a floret's head along the unit direction (in its frame: polar angle from `up`,
 * azimuth about it): a domed cap over a short underside that tucks in to the stalk, swollen by
 * soft bud clusters. A smooth maximum of rounded bumps, so the clusters part in soft shadowed
 * valleys rather than in hard intersection creases.
 */
/** Dome height of a floret's crown over its radius. */
const HEAD_RISE = 0.68;
/** Angular reach of one bud on a sub-floret's dome (radians from its centre). */
const BUD_R = 0.62;
/** Polar angle past which a sub-floret's buds fade out on its underside. */
const SUB_RIM = 1.75;
/**
 * Surface of a sub-floret along the unit direction (its frame: polar angle from `u`, azimuth
 * about it): a rounded dome over a short underside that tucks in to its branch, swollen by soft
 * buds (a smooth maximum of rounded bumps, so buds part in soft valleys, never in hard creases).
 */
function subPoint(q: SubFloret, polar: number, az: number): Vector3 {
  const { X, Z, u, c, s } = q;
  const radial = new Vector3().addScaledVector(X, Math.cos(az)).addScaledVector(Z, Math.sin(az));
  // A smooth ovoid: a full dome over a shallower underside that draws in towards the branch
  // (both halves meet on the equator with a vertical tangent, so the outline never kinks).
  const sp = Math.sin(polar), cp = Math.cos(polar);
  const hr = s * sp * (1 - 0.3 * smoothstep(Math.PI / 2, Math.PI, polar));
  const hy = cp >= 0 ? 0.78 * s * cp : 0.5 * s * cp;
  const dir = radial.clone().multiplyScalar(Math.sin(polar)).addScaledVector(u, Math.cos(polar)).normalize();
  let sum = 0;
  for (const l of q.lobes) {
    const a = Math.acos(Math.min(1, Math.max(-1, dir.dot(l.d))));
    if (a >= BUD_R) continue;
    sum += (l.w * Math.cos((Math.PI / 2) * (a / BUD_R))) ** 2;
  }
  const cap = polar <= SUB_RIM ? 1 : Math.max(0, 1 - (polar - SUB_RIM) / 0.4);
  const swell = 1 + (0.13 * Math.sqrt(sum) - 0.07) * cap;
  return c.clone().addScaledVector(radial, hr * swell).addScaledVector(u, hy >= 0 ? hy * swell : hy);
}

/**
 * A carrot rests like a rigid rod: its plan line is fixed, and of all the straight lines that
 * keep every section clear of the well and the pieces below, it takes the one that puts its
 * centre of mass lowest (where it comes to rest when lowered onto them).
 */
function placeCarrot(c: CarrotSpec, pile: Pile): PlacedCarrot {
  const s = planAt(c.shoulder[0], c.shoulder[1]), e = planAt(c.tip[0], c.tip[1]);
  const dir = e.clone().sub(s), length = dir.length();
  dir.divideScalar(length);
  const side = new Vector3(-dir.z, 0, dir.x);
  const planOf = (t: number) => s.clone().addScaledVector(dir, length * t).addScaledVector(side, c.bend * Math.sin(Math.PI * t));
  const n = 32;
  const ts: number[] = [], hs: number[] = [], ws: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), r = carrotRadius(Math.min(0.999, Math.max(0.035, t)), c.radius), p = planOf(t);
    ts.push(t);
    hs.push(pile.support(p.x, p.z, r));
    ws.push(r * r);
  }
  const tc = ts.reduce((a, t, i) => a + t * ws[i]!, 0) / ws.reduce((a, w) => a + w, 0);
  let best = { a: Math.max(...hs), b: 0 }, bestV = best.a;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const b = (hs[j]! - hs[i]!) / (ts[j]! - ts[i]!), a = hs[i]! - b * ts[i]!;
      if (a + b * tc >= bestV) continue;
      if (hs.every((h, k) => a + b * ts[k]! >= h - 1e-9)) { best = { a, b }; bestV = a + b * tc; }
    }
  }
  const at = (t: number) => planOf(t).setY(best.a + best.b * t);
  const axis = at(1).sub(at(0)).normalize();
  return { spec: c, at, axis };
}

/**
 * The pile, placed in order: broccoli on the well, then each carrot onto what is there, then
 * each tomato lowered and rolled into its pocket. Collision balls of every piece are kept for
 * the next.
 */
export function vegLayout(): VegLayout {
  if (VEG) return VEG;
  const pile = new Pile();
  let owner = 0;
  const florets = FLORETS.map((f) => {
    const p = placeFloret(f);
    // Crown: a core ball and one ball per sub-floret; stalk: a column of balls.
    pile.add(p.head.clone().addScaledVector(p.up, 0.05 * p.B), 0.62 * p.A, owner);
    for (const q of p.subs) pile.add(q.c, 0.92 * q.s, owner);
    for (let i = 0; i <= 3; i++) pile.add(p.base.clone().lerp(p.head, i / 4).setY(p.base.y + (p.head.y - p.base.y) * (i / 4) + 0.02), 0.3 * p.A, owner);
    owner++;
    return p;
  });
  const carrots = CARROTS.map((c) => {
    const p = placeCarrot(c, pile);
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      const r = carrotRadius(Math.min(0.999, Math.max(0.035, t)), c.radius);
      if (r > 0.004) pile.add(p.at(t), r, owner);
    }
    owner++;
    return p;
  });
  const tomatoes = TOMATOES.map((t) => {
    const p = planAt(t.front, t.right);
    const c = pile.settle(p.x, p.z, t.r * 0.97);
    c.y = Math.max(c.y, t.r * TOMATO_SQUASH + 0.0006);
    pile.add(c, t.r * 0.97, owner++);
    return { spec: t, c };
  });
  VEG = { florets, carrots, tomatoes, pile };
  return VEG;
}

/** Carrot rows (t along the root): crowded at the domed crown and the fine tip. */
const CARROT_T = [0, 0.006, 0.016, 0.03, 0.047, 0.066, 0.09, 0.12, 0.16, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.895, 0.935, 0.965, 0.985, 1];

/** Baby carrots: 12-sided, smooth-shaded roots, closed by a rounded crown and a fine tip. */
export function carrots(): BufferGeometry {
  const { carrots: placed } = vegLayout();
  return mergeIndexed(placed.map((p) => {
    const up = new Vector3(0, 1, 0).addScaledVector(p.axis, -p.axis.y).normalize();
    const side = new Vector3().crossVectors(p.axis, up).normalize();
    const g = wrapGrid(CARROT_T.length, 12, (i, j) => {
      const t = CARROT_T[i]!;
      const c = p.at(t);
      // The crown's pole sits a hair inside the dome, so the fronds grow out of its centre.
      const r = carrotRadius(t, p.spec.radius);
      const a = (j / 12) * TAU;
      return [c.x + (side.x * Math.cos(a) + up.x * Math.sin(a)) * r, c.y + (side.y * Math.cos(a) + up.y * Math.sin(a)) * r, c.z + (side.z * Math.cos(a) + up.z * Math.sin(a)) * r];
    }, true);
    g.computeVertexNormals();
    return g;
  }));
}

export function tomatoes(): BufferGeometry {
  const { tomatoes: placed } = vegLayout();
  return mergeIndexed(placed.map(({ spec: t, c }) => {
    const g = new SphereGeometry(t.r, 18, 12);
    const p = g.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const polar = Math.acos(Math.min(1, Math.max(-1, y / t.r)));
      // Shoulder dimple where the calyx sits.
      const dimple = 1 - 0.12 * Math.exp(-((polar / 0.32) ** 2));
      p.setXYZ(i, x * dimple, y * TOMATO_SQUASH * dimple, z * dimple);
    }
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    const welded = mergeVertices(g);
    g.dispose();
    welded.translate(c.x, c.y, c.z);
    welded.computeVertexNormals();
    return welded;
  }));
}

/** Sub-floret grid: rows crowd the dome the camera sees; the underside, tucked in to the branch, gets two. */
const SUB_GRID = { rows: 10, cols: 22, capRows: 7, capTo: 1.9 } as const;

/** Whether a point lies well inside a sub-floret (its dome is star-shaped about its centre). */
function insideSub(q: SubFloret, p: Vector3, margin: number): boolean {
  const d = p.clone().sub(q.c);
  const l = d.length();
  if (l > 1.3 * q.s) return false;
  if (l < 1e-9) return true;
  d.divideScalar(l);
  const polar = Math.acos(Math.min(1, Math.max(-1, d.dot(q.u))));
  const az = Math.atan2(d.dot(q.Z), d.dot(q.X));
  return l < subPoint(q, polar, az).distanceTo(q.c) - margin;
}

/**
 * Broccoli crowns: the sub-floret domes of every floret (dark velvety green, `mat_basil`). Where
 * sub-florets press into one another, the triangles buried inside a neighbour are dropped: they
 * can never be seen, and the triangles they free buy a finer spin where the outlines are.
 */
export function broccoliCrowns(): BufferGeometry {
  const { rows, cols, capRows, capTo } = SUB_GRID;
  const subs = vegLayout().florets.flatMap((p) => p.subs);
  return mergeIndexed(subs.map((q) => {
    const g = wrapGrid(rows, cols, (i, j) => {
      const polar = i <= capRows ? (i / capRows) * capTo : capTo + ((i - capRows) / (rows - 1 - capRows)) * (Math.PI - capTo);
      return subPoint(q, polar, (j / cols) * TAU).toArray() as [number, number, number];
    }, true);
    g.computeVertexNormals();
    const pos = g.getAttribute('position') as BufferAttribute;
    const others = subs.filter((o) => o !== q && o.c.distanceTo(q.c) < 1.4 * (o.s + q.s));
    const hidden = new Uint8Array(pos.count);
    const v = new Vector3();
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      hidden[k] = others.some((o) => insideSub(o, v, 0.0015)) ? 1 : 0;
    }
    const idx = g.index!.array;
    const keep: number[] = [];
    for (let t = 0; t < idx.length; t += 3) if (!(hidden[idx[t]!] && hidden[idx[t + 1]!] && hidden[idx[t + 2]!])) keep.push(idx[t]!, idx[t + 1]!, idx[t + 2]!);
    g.setIndex(keep);
    return g;
  }));
}

/**
 * A floret's stalk (pale stem green): flared and cut flat at the base, narrowing as it rises to
 * the neck, where it forks into one branch per sub-floret, each running up into the underside of
 * its dome (the branches show in the clefts under the crown).
 */
function floretStalk(p: PlacedFloret): BufferGeometry[] {
  const { base, up, X, neck, A } = p;
  const out: BufferGeometry[] = [];
  const mid = base.clone().lerp(neck, 0.5).addScaledVector(X, 0.004);
  out.push(tube({
    path: spline([base, mid, neck], 6), up: X, sides: 10, capStart: true, analytic: true,
    half: (t) => { const r = A * (0.3 - 0.06 * Math.sin(Math.PI * t) - 0.02 * t); return [r, r]; },
  }));
  for (const q of p.subs) {
    const end = q.c.clone().addScaledVector(q.u, -0.3 * q.s);
    const start = neck.clone().addScaledVector(up, -0.1 * A);
    const bow = start.clone().lerp(end, 0.5).addScaledVector(up, -0.02 * A);
    out.push(tube({ path: spline([start, bow, end], 4), up: X, sides: 6, analytic: true, half: (t) => { const r = q.s * (0.36 - 0.1 * t); return [r, r]; } }));
  }
  return out;
}

/**
 * A carrot's feathery top: a few slender stalks fanning out of the crown, arching up and drooping
 * at the tip, each carrying pairs of small narrow leaflets along its outer half and one at its
 * end, angled forward along the stalk (the finely divided leaf of a carrot, simplified).
 */
function carrotFronds(p: PlacedCarrot): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const crown = p.at(0);
  const back = p.axis.clone().negate();
  const upv = new Vector3(0, 1, 0).addScaledVector(back, -back.y).normalize();
  const side = new Vector3().crossVectors(back, upv).normalize();
  const R = p.spec.radius;
  p.spec.fronds.forEach((splay, k) => {
    const len = R * (1.9 + 0.3 * ((k * 5) % 3));
    // A crown propped up on the others lets its tops arch less (they stay under the envelope).
    const rise = 0.36 - 0.08 * Math.abs(splay) - 1.6 * Math.max(0, crown.y - 0.08);
    const d0 = back.clone().multiplyScalar(Math.cos(splay)).addScaledVector(side, Math.sin(splay));
    const ctrl: Vector3[] = [];
    for (let i = 0; i <= 4; i++) {
      const u = i / 4;
      ctrl.push(crown.clone().addScaledVector(back, -0.004).addScaledVector(d0, len * u).addScaledVector(upv, len * (rise * u - 0.45 * u * u * u)));
    }
    const path = spline(ctrl, 8);
    const stalkR = R * 0.075;
    out.push(tube({ path, up: upv, sides: 5, analytic: true, half: (u) => { const r = stalkR * (1 - 0.55 * u); return [r, r]; } }));
    // Leaflets: pairs at 52 % and 76 % of the stalk, and one at its tip.
    const at = (u: number) => {
      const x = u * (path.length - 1), i0 = Math.min(path.length - 2, Math.floor(x));
      const pos = path[i0]!.clone().lerp(path[i0 + 1]!, x - i0);
      const T = path[i0 + 1]!.clone().sub(path[i0]!).normalize();
      return { pos, T };
    };
    const leaflet = (u: number, sideSign: number, size: number) => {
      const { pos, T } = at(u);
      const W = new Vector3().crossVectors(T, upv).normalize();
      // Forward along the stalk, out to the side and a little up; flat side up.
      const dir = T.clone().multiplyScalar(0.72).addScaledVector(W, 0.62 * sideSign).addScaledVector(upv, 0.12).normalize();
      const g = leaf(R * 0.62 * size, R * 0.2 * size, 0.18, 0.4, 3, 4);
      const x = dir, z = new Vector3().crossVectors(x, upv).normalize(), y = new Vector3().crossVectors(z, x).normalize();
      g.applyMatrix4(new Matrix4().makeBasis(x, y, z).setPosition(pos));
      out.push(g);
    };
    for (const [u, size] of [[0.52, 0.9], [0.76, 1]] as const) {
      leaflet(u, 1, size);
      leaflet(u + 0.04, -1, size * 0.95);
    }
    leaflet(0.97, 0, 0.9);
  });
  return out;
}

/** The fronds of every carrot, as centreline points and widths (for tooling). */
export function carrotTops(): BufferGeometry[] {
  return vegLayout().carrots.flatMap(carrotFronds);
}

/** Broccoli stalks, carrot tops and the tomato truss (calyxes and vine): one pale green mesh. */
export function greens(): BufferGeometry {
  const layout = vegLayout();
  const parts: BufferGeometry[] = [];
  for (const f of layout.florets) parts.push(...floretStalk(f));
  for (const c of layout.carrots) parts.push(...carrotFronds(c));
  // Tomatoes on the vine: a calyx of five drooping sepals on each and a short pedicel rising
  // from it into the truss's main stem, one smooth, gently arched stem laid over the cluster along
  // its length. The stem runs from the first pedicel's joint to the last and ends exactly there.
  const vine = layout.tomatoes.filter((t) => t.spec.vine);
  if (vine.length) {
    const mean = vine.reduce((a, t) => a.add(t.c), new Vector3()).divideScalar(vine.length);
    // The cluster's long axis in plan (principal direction of the centres).
    let sxx = 0, sxz = 0, szz = 0;
    for (const t of vine) { const dx = t.c.x - mean.x, dz = t.c.z - mean.z; sxx += dx * dx; sxz += dx * dz; szz += dz * dz; }
    const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    const ax = new Vector3(Math.cos(ang), 0, Math.sin(ang));
    const chain = [...vine].sort((a, b) => a.c.clone().sub(mean).dot(ax) - b.c.clone().sub(mean).dot(ax));
    const tops = chain.map(({ spec: t, c }) => new Vector3(c.x, c.y + t.r * TOMATO_SQUASH * 0.88, c.z));
    const high = Math.max(...tops.map((q) => q.y));
    const n = chain.length;
    // Joints on the stem: over each tomato, drawn in almost onto the cluster's axis (so the stem
    // runs straight and never zigzags between tomatoes), on an even arch.
    const joints = tops.map((q, i) => {
      const along = q.clone().sub(mean).dot(ax);
      const onAxis = mean.clone().addScaledVector(ax, along);
      const u = n > 1 ? i / (n - 1) : 0.5;
      return new Vector3(q.x + (onAxis.x - q.x) * 0.85, high + 0.018 + 0.006 * Math.sin(Math.PI * u), q.z + (onAxis.z - q.z) * 0.85);
    });
    chain.forEach(({ spec: t, c }, i) => {
      const top = tops[i]!;
      for (let k = 0; k < 5; k++) {
        const yaw = (k / 5) * TAU + c.x * 10;
        const g = leaf(t.r * 0.7, t.r * 0.26, 0.15, 0.9, 5, 4);
        g.applyMatrix4(placeM(c.x, top.y - 0.001, c.z, yaw, -0.28));
        parts.push(g);
      }
      // Pedicel: straight up out of the calyx, then a smooth bend over into its joint.
      const J = joints[i]!;
      const rise = top.clone().add(new Vector3(0, Math.max(0.008, (J.y - top.y) * 0.55), 0));
      const bend = rise.clone().lerp(J, 0.5).add(new Vector3(0, 0.004, 0));
      parts.push(tube({ path: spline([top.clone().add(new Vector3(0, -0.002, 0)), rise, bend, J], 9), up: new Vector3(1, 0, 0), sides: 6, capStart: true, analytic: true, half: (u) => { const r = 0.0042 + 0.0012 * u; return [r, r]; } }));
    });
    if (n > 1) {
      parts.push(tube({ path: spline(joints, 7 * n), up: new Vector3(0, 1, 0), sides: 6, analytic: true, half: () => [0.0056, 0.0056] }));
      // The stem's ends are rounded off where they meet the end pedicels.
      for (const k of [joints[0]!, joints[n - 1]!]) {
        const b = new SphereGeometry(0.0058, 8, 6);
        b.deleteAttribute('uv');
        b.translate(k.x, k.y, k.z);
        parts.push(mergeVertices(b));
      }
    }
  }
  return restOnWell(mergeIndexed(parts));
}

/** Low-poly casters for the vegetables. */
export function vegProxy(): BufferGeometry {
  const layout = vegLayout();
  const parts: BufferGeometry[] = [];
  for (const c of layout.carrots) {
    const path = [0.03, 0.2, 0.4, 0.6, 0.8, 1].map((t) => c.at(t));
    parts.push(tube({ path, up: new Vector3(0, 1, 0), sides: 5, half: (t) => { const r = carrotRadius(0.03 + 0.97 * t, c.spec.radius) * 0.9; return [r, r]; } }));
  }
  for (const { spec: t, c } of layout.tomatoes) {
    const g = new SphereGeometry(t.r * 0.92, 8, 5);
    g.scale(1, TOMATO_SQUASH, 1);
    g.translate(c.x, c.y, c.z);
    parts.push(g);
  }
  for (const f of layout.florets) {
    const g = new SphereGeometry(f.A * 0.95, 8, 5);
    g.scale(1, 0.62, 1);
    g.translate(f.head.x, f.head.y + 0.1 * f.B, f.head.z);
    parts.push(g);
    parts.push(tube({ path: [f.base.clone().setY(0.001), f.head], up: new Vector3(1, 0, 0), sides: 4, half: () => [f.A * 0.22, f.A * 0.22] }));
  }
  const g = restOnWell(mergeIndexed(parts));
  // Triangles flattened onto the well have no area (and so no normal): point them up.
  const n = g.getAttribute('normal') as BufferAttribute;
  for (let i = 0; i < n.count; i++) if (Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) < 0.5) n.setXYZ(i, 0, 1, 0);
  return g;
}
