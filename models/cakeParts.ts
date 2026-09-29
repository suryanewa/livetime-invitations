import { BufferAttribute, BufferGeometry, CylinderGeometry, LatheGeometry, Matrix4, SphereGeometry, Vector2, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Premium cake parts (fidelity pass). Everything is parametric so triangles go where the
 * light needs them: piped shells, star drops and garlands are closed tubes/revolves with
 * smooth indexed topology (no seams), the glaze is one wrapped grid with rounded drip
 * tongues and a rolled lip, and the stand is a turned ceramic profile.
 * Units match models/cake.ts (1 unit ≈ one stage decimetre).
 */

const TAU = Math.PI * 2;
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Deterministic PRNG so every render, poster and GLB matches. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/**
 * Grid surface: rows × cols vertices from fn(i, j). Columns wrap (closed ring); rows wrap
 * when closedRows is set (torus-like tubes). Wrapped indices, not duplicated seam vertices,
 * so computed normals are continuous everywhere.
 */
function grid(rows: number, cols: number, fn: (i: number, j: number) => [number, number, number], closedRows = false): BufferGeometry {
  const pos = new Float32Array(rows * cols * 3);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const [x, y, z] = fn(i, j);
      const k = (i * cols + j) * 3;
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
    }
  }
  const idx: number[] = [];
  const rowLimit = closedRows ? rows : rows - 1;
  for (let i = 0; i < rowLimit; i++) {
    const i1 = (i + 1) % rows;
    for (let j = 0; j < cols; j++) {
      const j1 = (j + 1) % cols;
      const a = i * cols + j, b = i * cols + j1, c = i1 * cols + j, d = i1 * cols + j1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Merge indexed parts that share one material into a single draw call. */
export function mergeIndexed(parts: BufferGeometry[]): BufferGeometry {
  const prepared = parts.map((src) => {
    const g = src.index ? src : src.clone();
    if (!g.index) {
      const n = g.getAttribute('position').count;
      g.setIndex(Array.from({ length: n }, (_, i) => i));
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    g.clearGroups();
    return g;
  });
  const merged = mergeGeometries(prepared, false);
  if (!merged) throw new Error('mergeIndexed: incompatible geometries');
  parts.forEach((p) => p.dispose());
  prepared.forEach((p) => p.dispose());
  return merged;
}

/** Copies of one part placed by matrices, merged. The source is disposed. */
export function instances(part: BufferGeometry, matrices: Matrix4[]): BufferGeometry {
  const list = matrices.map((m) => part.clone().applyMatrix4(m));
  part.dispose();
  return mergeIndexed(list);
}

// ── Stand ────────────────────────────────────────────────────────────────────

export interface StandSpec {
  /** Plate outer radius (rim wall). */
  radius: number;
  /** Plate top (where the cake sits). */
  top: number;
  /** Foot radius on the floor. */
  foot: number;
}

export interface StandParts {
  body: LatheGeometry;
  /** Centre height and height of the rim wall that carries the perforation band. */
  band: { y: number; height: number; radius: number };
}

/**
 * Turned pedestal cake stand: rounded foot ring, trumpet flare, slim stem with a knop,
 * a flared neck into a thick plate, a vertical rim wall for the signature band and a small
 * rolled lip. Every corner is an arc so the lathe normals stay clean.
 */
export function pedestalStand({ radius: R, top, foot }: StandSpec): StandParts {
  const p: Vector2[] = [];
  const add = (r: number, y: number) => p.push(new Vector2(Math.max(0, r), y));
  const arc = (cx: number, cy: number, rad: number, a0: number, a1: number, n: number, skipFirst = true) => {
    for (let i = skipFirst ? 1 : 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      add(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
  };
  const bez = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, n: number) => {
    for (let i = 1; i <= n; i++) {
      const t = i / n, mt = 1 - t;
      add(mt * mt * x0 + 2 * mt * t * cx + t * t * x1, mt * mt * y0 + 2 * mt * t * cy + t * t * y1);
    }
  };
  const s = top / 0.7; // proportions hold if the stand height changes
  const footH = 0.062 * s;
  const stemR = 0.066;
  const knopY = 0.47 * s;
  const knopR = 0.022 * s;
  const underY = top - 0.095;
  const wallBottom = top - 0.05;
  const wallTop = top + 0.02;
  const lip = 0.02;

  add(0, 0);
  add(foot - 0.03, 0);
  arc(foot - 0.03, 0.03, 0.03, -Math.PI / 2, 0, 4); // floor edge
  add(foot, footH - 0.018);
  arc(foot - 0.018, footH - 0.018, 0.018, 0, Math.PI / 2, 3); // foot ring shoulder
  // Trumpet: leaves the foot ring almost flat, then sweeps up into a slim stem.
  const trumpetTop = knopY - knopR - 0.03 * s;
  const n = 9;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const r = stemR + (foot - 0.03 - stemR) * (1 - t) ** 3.4;
    add(r, footH + (trumpetTop - footH) * t ** 0.92);
  }
  // Knop: a turned bead on the stem.
  bez(stemR, trumpetTop, stemR, knopY - knopR, stemR + 0.01, knopY - knopR, 2);
  arc(stemR + 0.01, knopY, knopR, -Math.PI / 2, Math.PI / 2, 5);
  bez(stemR + 0.01, knopY + knopR, stemR - 0.004, knopY + knopR, stemR - 0.006, knopY + knopR + 0.02 * s, 2);
  // Neck flares into the plate underside, arriving horizontal.
  bez(stemR - 0.006, knopY + knopR + 0.02 * s, stemR - 0.004, underY - 0.002, 0.34, underY, 7);
  arc(R - 0.03, wallBottom, 0.03, -Math.PI / 2 - 0.05, 0, 5); // underside → rim wall
  add(R, wallTop);
  arc(R - lip, wallTop, lip, 0, Math.PI, 5); // rolled lip
  bez(R - 2 * lip, wallTop, R - 2 * lip, top, R - 2 * lip - 0.028, top, 3); // inner cove to the plate
  add(0, top);

  const body = new LatheGeometry(p, 56);
  return { body, band: { y: (wallBottom + wallTop) / 2, height: 0.04, radius: R + 0.0015 } };
}

// ── Frosting bodies ──────────────────────────────────────────────────────────

/**
 * Buttercream tier: straight sides and a soft top edge. Guard rings just inside each end of
 * the straight side keep lathe normal smoothing out of the long faces. `capped: false`
 * stops below the edge fillet (for a tier fully covered by glaze on top).
 */
export function tierBody(radius: number, height: number, fillet: number, y0 = 0, capped = true, radial = 80): LatheGeometry {
  const e = 0.004;
  const p: Vector2[] = [new Vector2(0, y0), new Vector2(radius - e, y0), new Vector2(radius, y0 + e), new Vector2(radius, y0 + 2 * e)];
  const sideTop = height - fillet;
  if (!capped) {
    p.push(new Vector2(radius, y0 + sideTop - e), new Vector2(radius, y0 + sideTop), new Vector2(radius - fillet, y0 + sideTop + fillet * 0.5), new Vector2(0, y0 + sideTop + fillet * 0.5));
    return new LatheGeometry(p, radial);
  }
  p.push(new Vector2(radius, y0 + sideTop - e));
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2);
    p.push(new Vector2(radius - fillet + Math.cos(a) * fillet, y0 + sideTop + Math.sin(a) * fillet));
  }
  p.push(new Vector2(radius - fillet - e, y0 + height));
  p.push(new Vector2(0, y0 + height + 0.004));
  return new LatheGeometry(p, radial);
}

// ── Piping ───────────────────────────────────────────────────────────────────

/** Teardrop shell rhythm: quick swell into a plump head, long slim taper into the next shell. */
function shellProfile(t: number, fmin: number): number {
  const head = 0.34;
  if (t < head) return fmin + (1 - fmin) * Math.sin(((t / head) * Math.PI) / 2) ** 0.9;
  const x = (t - head) / (1 - head);
  return fmin + (1 - fmin) * (0.5 + 0.5 * Math.cos(Math.PI * x)) ** 1.7;
}

export interface ShellBorderSpec {
  /** Surface the border hugs (cake side radius). */
  radius: number;
  /** Surface it rests on (plate or tier top). */
  y: number;
  count: number;
  /** Shell head radius. */
  size: number;
  along?: number;
  cross?: number;
  phase?: number;
  /** Star-tip ridges on the shell (0 = smooth). */
  ridges?: number;
}

/** Piped shell border as one closed tube whose section swells and tapers per shell. */
export function shellBorder(o: ShellBorderSpec): BufferGeometry {
  const along = (o.along ?? 9) * o.count;
  const cross = o.cross ?? 12;
  const ridges = o.ridges ?? 0;
  const fmin = 0.3;
  return grid(along, cross, (i, j) => {
    const phi = (i / along) * TAU;
    const t = (((i / along) * o.count + (o.phase ?? 0)) % 1 + 1) % 1;
    const f = shellProfile(t, fmin);
    const head = (f - fmin) / (1 - fmin);
    const rho = o.size * f;
    // The head leans out and sits up; the tail tucks into the corner.
    const rc = o.radius + rho * 0.6 + o.size * 0.2 * head;
    const yc = o.y + rho * 0.7 + o.size * 0.1 * head;
    const psi = (j / cross) * TAU;
    const groove = ridges > 0 ? 1 + 0.075 * head * Math.cos(ridges * psi + t * 2.4) : 1;
    const dr = Math.cos(psi) * rho * groove;
    const dy = Math.sin(psi) * rho * 0.9 * groove;
    const r = rc + dr;
    return [Math.cos(phi) * r, yc + dy, -Math.sin(phi) * r];
  }, true);
}

/** Catmull-Rom through [v, r] control points (v ascending). */
function spline(ctrl: [number, number][], v: number): number {
  let k = 0;
  while (k < ctrl.length - 2 && v > ctrl[k + 1]![0]) k++;
  const p0 = ctrl[Math.max(0, k - 1)]!, p1 = ctrl[k]!, p2 = ctrl[k + 1]!, p3 = ctrl[Math.min(ctrl.length - 1, k + 2)]!;
  const t = (v - p1[0]) / (p2[0] - p1[0] || 1);
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
}

export interface StarDropSpec {
  radius: number;
  height: number;
  flutes?: number;
  /** Swirl (radians of flute rotation from base to tip). */
  twist?: number;
  radial?: number;
  rows?: number;
  /** Tip curl offset (fraction of radius). */
  curl?: number;
}

/**
 * Star-tip rosette ("kiss"): a revolved belly-and-peak profile with swirled flutes and a
 * soft curled tip. Axis +Y, base at y = 0 (base ring sinks slightly into the surface).
 */
export function starDrop(o: StarDropSpec): BufferGeometry {
  const flutes = o.flutes ?? 6;
  const radial = o.radial ?? flutes * 4;
  const rows = o.rows ?? 9;
  const twist = o.twist ?? 1.4;
  const curl = (o.curl ?? 0.18) * o.radius;
  const ctrl: [number, number][] = [[0, 0.84], [0.13, 1], [0.38, 0.92], [0.62, 0.62], [0.82, 0.32], [0.95, 0.1], [1, 0.02]];
  const pos: number[] = [];
  for (let i = 0; i < rows; i++) {
    const v = i / (rows - 1);
    const vv = Math.min(v, 0.97);
    const base = Math.max(0.03, spline(ctrl, vv)) * o.radius;
    const amp = 0.17 * (1 - smoothstep(0.55, 1, v));
    const y = -0.08 * o.height + o.height * 1.08 * vv;
    const cx = curl * v ** 3;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU;
      const r = base * (1 + amp * Math.cos(flutes * (a + twist * v)));
      pos.push(cx + Math.cos(a) * r, y, Math.sin(a) * r);
    }
  }
  const apex = pos.length / 3;
  pos.push(curl * 1.02, o.height, 0);
  const idx: number[] = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const j1 = (j + 1) % radial;
      const a = i * radial + j, b = i * radial + j1, c = (i + 1) * radial + j, d = (i + 1) * radial + j1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const last = (rows - 1) * radial;
  for (let j = 0; j < radial; j++) idx.push(last + j, apex, last + ((j + 1) % radial));
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface SwagSpec {
  radius: number;
  /** Anchor height on the tier side. */
  y: number;
  count: number;
  /** Sag at the middle of each garland. */
  depth: number;
  thickness: number;
  phase?: number;
  along?: number;
  cross?: number;
}

/** Piped garlands draped between anchors around a tier side (one mesh). */
export function swags(o: SwagSpec): { geometry: BufferGeometry; anchors: Vector3[]; lows: Vector3[] } {
  const along = o.along ?? 16;
  const cross = o.cross ?? 8;
  const span = TAU / o.count;
  const parts: BufferGeometry[] = [];
  const anchors: Vector3[] = [];
  const lows: Vector3[] = [];
  const P = new Vector3(), T = new Vector3(), N = new Vector3(), B = new Vector3(), Pn = new Vector3();
  const at = (a0: number, u: number, out: Vector3) => {
    const s = Math.sin(Math.PI * u);
    const rho = o.thickness * (0.5 + 0.5 * s ** 0.7);
    const r = o.radius + rho * 0.55;
    const a = a0 + span * u;
    return out.set(Math.cos(a) * r, o.y - o.depth * s ** 1.15, -Math.sin(a) * r);
  };
  for (let k = 0; k < o.count; k++) {
    const a0 = (o.phase ?? 0) + k * span;
    anchors.push(new Vector3(Math.cos(a0) * o.radius, o.y, -Math.sin(a0) * o.radius));
    const am = a0 + span / 2;
    lows.push(new Vector3(Math.cos(am) * o.radius, o.y - o.depth, -Math.sin(am) * o.radius));
    const pos: number[] = [];
    for (let i = 0; i <= along; i++) {
      const u = i / along;
      at(a0, u, P);
      at(a0, Math.min(1, u + 0.01), Pn);
      if (u >= 1) { at(a0, u - 0.01, Pn); T.subVectors(P, Pn); } else T.subVectors(Pn, P);
      T.normalize();
      // Section frame: N points away from the cake axis, B completes it.
      N.set(P.x, 0, P.z).normalize();
      B.crossVectors(T, N).normalize();
      N.crossVectors(B, T).normalize();
      const s = Math.sin(Math.PI * u);
      const rho = o.thickness * (0.5 + 0.5 * s ** 0.7);
      for (let j = 0; j < cross; j++) {
        const psi = (j / cross) * TAU;
        const c = Math.cos(psi) * rho, d = Math.sin(psi) * rho * 0.92;
        pos.push(P.x + N.x * c + B.x * d, P.y + N.y * c + B.y * d, P.z + N.z * c + B.z * d);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    const idx: number[] = [];
    for (let i = 0; i < along; i++) {
      for (let j = 0; j < cross; j++) {
        const j1 = (j + 1) % cross;
        const a = i * cross + j, b = i * cross + j1, c = (i + 1) * cross + j, d = (i + 1) * cross + j1;
        idx.push(a, b, c, b, d, c);
      }
    }
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g);
  }
  return { geometry: mergeIndexed(parts), anchors, lows };
}

/** Sugar pearls at points, one mesh. */
export function pearls(points: Vector3[], size: number | number[]): BufferGeometry {
  const parts = points.map((p, i) => {
    const r = Array.isArray(size) ? size[i % size.length]! : size;
    const s = new SphereGeometry(r, 8, 5);
    s.translate(p.x, p.y, p.z);
    return s;
  });
  return mergeIndexed(parts);
}

// ── Glaze ────────────────────────────────────────────────────────────────────

export interface Drip {
  /** Angle (radians, measured like the ring: x = cos a, z = −sin a). */
  a: number;
  /** Half-width along the surface. */
  w: number;
  /** Length below the edge band. */
  len: number;
}

/** Deterministic drip rhythm: varied lengths with a few long statement drips. */
export function dripLayout(count: number, radius: number, maxLen: number, seed = 5): Drip[] {
  const rand = rng(seed);
  const out: Drip[] = [];
  for (let i = 0; i < count; i++) {
    const a = ((i + 0.5 + (rand() - 0.5) * 0.45) / count) * TAU;
    const tier = rand();
    const len = maxLen * (tier > 0.72 ? 0.85 + rand() * 0.15 : tier > 0.3 ? 0.45 + rand() * 0.25 : 0.2 + rand() * 0.15);
    const w = radius * (0.052 + rand() * 0.022);
    out.push({ a, w, len });
  }
  return out;
}

export interface GlazeSpec {
  radius: number;
  /** Tier top (glaze sits on it). */
  top: number;
  /** Tier edge fillet the glaze wraps. */
  fillet: number;
  thickness: number;
  /** Glaze band depth below the top edge between drips. */
  base: number;
  drips: Drip[];
  sideRows?: number;
}

/**
 * Poured glaze cap: flat top, wraps the edge fillet, and runs down in rounded tongues.
 * Columns are placed non-uniformly (dense across each drip, sparse between), and each
 * tongue has a rounded bead cross-section that thins to nothing at its sides, so drips read
 * as poured beads rather than cut slabs. Tongues swell towards the tip and end in a rolled
 * bulb; the band between drips ends in a rolled lip. Zero-thickness regions tuck just under
 * the frosting surface.
 */
export function glazeCap(o: GlazeSpec): BufferGeometry {
  const sideRows = o.sideRows ?? 11;
  const edgeRows = 5;
  const R = o.radius, t0 = o.thickness, f = o.fillet;
  const kf = 0.024;
  // Column angles: 9 across each drip (edge-weighted), ≤0.032 arc apart elsewhere.
  const angles: number[] = [];
  // Tongues taper: a wide neck where the glaze leaves the band, narrowing to the bulb.
  const NECK = 1.85;
  for (const d of o.drips) {
    const hw = (d.w * NECK + kf) / R;
    for (let k = 0; k <= 8; k++) {
      const u = -Math.cos((k / 8) * Math.PI); // −1…1, denser at the edges
      angles.push((((d.a + u * hw) % TAU) + TAU) % TAU);
    }
  }
  const gap = 0.032 / R;
  const sorted = angles.sort((a, b) => a - b);
  const cols: number[] = [];
  for (let k = 0; k < sorted.length; k++) {
    const a = sorted[k]!;
    const next = k + 1 < sorted.length ? sorted[k + 1]! : sorted[0]! + TAU;
    if (cols.length && a - cols[cols.length - 1]! < 1e-4) continue;
    cols.push(a);
    const steps = Math.floor((next - a) / gap);
    for (let q = 1; q < steps; q++) cols.push(a + ((next - a) * q) / steps);
  }
  const nc = cols.length;
  const colL = new Float32Array(nc);
  const colLat = new Float32Array(nc);
  const colDrip = new Float32Array(nc);
  for (let j = 0; j < nc; j++) {
    const a = cols[j]!;
    let v = 0, lat = 0, drip = 0;
    for (const d of o.drips) {
      let da = Math.abs(a - d.a) % TAU;
      da = Math.min(da, TAU - da);
      const s = da * R;
      const w = Math.min(d.w, d.len * 0.9);
      const neck = w * NECK;
      const body = d.len - w; // where the round tip starts
      let dv = 0;
      if (s < w) {
        dv = body + Math.sqrt(w * w - s * s);
        lat = Math.max(lat, Math.sqrt(1 - (s / neck) ** 2));
        drip = Math.max(drip, Math.min(1, d.len / 0.08));
      } else if (s < neck) {
        // Concave flank: the half-width eases from `neck` at the band to `w` at the tip.
        const q = (s - w) / (neck - w);
        dv = body * (1 - Math.sqrt(q)) ** 1.6;
        lat = Math.max(lat, Math.sqrt(1 - (s / neck) ** 2) * (1 - q * 0.6));
      } else if (s < neck + kf) {
        const q = neck + kf - s;
        dv = Math.min(0.01, kf - Math.sqrt(Math.max(0, kf * kf - q * q))) * 0.4;
      }
      v = Math.max(v, dv);
    }
    colL[j] = o.base + v;
    colLat[j] = lat;
    colDrip[j] = drip;
  }
  const rows = 2 + edgeRows + sideRows;
  const sr = 0.74;
  return grid(rows, nc, (i, j) => {
    const a = cols[j]!;
    let r: number, y: number;
    if (i === 0) { r = 0; y = o.top + t0; }
    else if (i === 1) { r = R - f; y = o.top + t0; }
    else if (i < 2 + edgeRows) {
      const th = ((i - 1) / edgeRows) * (Math.PI / 2);
      r = R - f + Math.sin(th) * (f + t0);
      y = o.top - f + Math.cos(th) * (f + t0);
    } else {
      const s = (i - 1 - edgeRows) / sideRows;
      const L = colL[j]!;
      const v = (L * Math.min(s, sr)) / sr;
      const roll = Math.max(0, (s - sr) / (1 - sr));
      // Bead thickness across the tongue, swelling into the tip.
      const bead = t0 * 1.15 * colLat[j]! ** 0.55 * (1 + 0.5 * colDrip[j]! * smoothstep(0.5, 0.95, s));
      const th = t0 + (bead - t0) * smoothstep(o.base - 0.004, o.base + 0.03, v);
      const tuck = 0.0025 * (1 - smoothstep(0, 0.006, th));
      r = R - tuck + th * Math.cos((roll * Math.PI) / 2);
      y = o.top - f - v - th * 0.95 * Math.sin((roll * Math.PI) / 2);
    }
    return [Math.cos(a) * r, y, -Math.sin(a) * r];
  });
}

// ── Candles ──────────────────────────────────────────────────────────────────

/**
 * Twisted (spiral-fluted) candle: flutes spiral up the shaft, fade into a rounded shoulder
 * and a shallow melt cup around the wick. Base at y = 0, closed. Keep the flute count even:
 * both silhouette edges then swell in phase and read as a twist; odd counts read as a bend.
 */
export function spiralCandle(radius: number, height: number, flutes = 4, turns = 2.6, radial = 16, rows = 36): BufferGeometry {
  const shoulder = radius * 0.55;
  const ringRows: [number, number, number][] = []; // [radius scale, y, flute amount]
  ringRows.push([0.96, 0, 1]);
  for (let i = 0; i <= rows; i++) ringRows.push([1, (height - shoulder) * (i / rows), 1]);
  for (let i = 1; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    ringRows.push([(radius - shoulder + Math.cos(a) * shoulder) / radius, height - shoulder + Math.sin(a) * shoulder, 1 - i / 4]);
  }
  ringRows.push([0.55, height - radius * 0.12, 0]);
  const pos: number[] = [];
  for (const [sc, y, fl] of ringRows) {
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU;
      const phase = flutes * a - TAU * turns * (y / height);
      const r = radius * sc * (1 + 0.085 * fl * Math.cos(phase));
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  }
  const nRing = ringRows.length;
  const bottom = pos.length / 3;
  pos.push(0, 0, 0);
  const cup = bottom + 1;
  pos.push(0, height - radius * 0.2, 0);
  const idx: number[] = [];
  for (let i = 0; i < nRing - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const j1 = (j + 1) % radial;
      const a = i * radial + j, b = i * radial + j1, c = (i + 1) * radial + j, d = (i + 1) * radial + j1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const top = (nRing - 1) * radial;
  for (let j = 0; j < radial; j++) {
    idx.push(bottom, j, (j + 1) % radial);
    idx.push(top + j, cup, top + ((j + 1) % radial));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Slightly bent wick with a charred tip. */
export function wickGeometry(height: number, radius: number): BufferGeometry {
  const g = new CylinderGeometry(radius * 0.8, radius, height, 8, 4);
  g.translate(0, height / 2, 0);
  const p = g.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / height;
    p.setX(i, p.getX(i) + 0.35 * radius * y * y * 4);
  }
  g.computeVertexNormals();
  return g;
}

/** Rotation that turns +Y into the given direction, then translation. */
export function orient(dir: Vector3, at: Vector3, spin = 0, scale = 1): Matrix4 {
  const up = new Vector3(0, 1, 0);
  const q = new Matrix4().makeRotationY(spin);
  const d = dir.clone().normalize();
  const axis = new Vector3().crossVectors(up, d);
  const angle = Math.acos(Math.min(1, Math.max(-1, up.dot(d))));
  const r = axis.lengthSq() < 1e-9 ? new Matrix4() : new Matrix4().makeRotationAxis(axis.normalize(), angle);
  return new Matrix4().makeTranslation(at.x, at.y, at.z).multiply(r).multiply(q).multiply(new Matrix4().makeScale(scale, scale, scale));
}
