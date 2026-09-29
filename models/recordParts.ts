import { BufferAttribute, BufferGeometry, Matrix4, Shape, ShapeGeometry, Vector2, Vector3 } from 'three';
import { filletPolyline, type ProfilePoint } from './geometry.ts';

/**
 * Parametric hard-surface helpers for the Party record player (premium build). Everything is a
 * profile swept along a plan path — a rounded rectangle for the plinth and dust cover, a circle
 * for turned parts — with analytic normals, so continuous fillets shade perfectly smoothly and
 * unfilleted corners stay crisp (auto-crease). Far cheaper than SDF meshing for these forms and
 * exactly watertight between neighbouring sweeps and caps (shared contours).
 */

/** One station of a plan path: base point, outward unit normal (xz) and arc length. */
export interface PlanSample {
  x: number;
  z: number;
  nx: number;
  nz: number;
  s: number;
  /** Profile points below this height collapse onto it (hinge notches in a wall). */
  clampY?: number;
}

/** A notch in the back (−z) straight side: x range and the height the wall is cut up to. */
export interface Notch {
  x0: number;
  x1: number;
  y: number;
}

const TAU = Math.PI * 2;

/**
 * Closed rounded-rectangle plan (half sizes hx × hz, corner radius r) centred on (cx, cz),
 * counter-clockwise seen from above, first sample repeated at the end so UVs never wrap.
 * Offsetting a profile by o along the normals gives the concentric contour at radius r + o.
 */
export function planRoundedRect(hx: number, hz: number, r: number, cornerSegments: number, cx = 0, cz = 0, notches: Notch[] = []): PlanSample[] {
  const out: PlanSample[] = [];
  const ax = hx - r, az = hz - r;
  const corners: [number, number, number][] = [[ax, az, 0], [-ax, az, 0.25], [-ax, -az, 0.5], [ax, -az, 0.75]];
  const push = (x: number, z: number, nx: number, nz: number, clampY?: number) => {
    const prev = out[out.length - 1];
    const s = prev ? prev.s + Math.hypot(x - prev.x, z - prev.z) : 0;
    const sample: PlanSample = { x, z, nx, nz, s };
    if (clampY !== undefined) sample.clampY = clampY;
    out.push(sample);
  };
  corners.forEach(([ccx, ccz, turn], ci) => {
    for (let i = 0; i <= cornerSegments; i++) {
      const a = (turn + (i / cornerSegments) * 0.25) * TAU;
      const nx = Math.cos(a), nz = Math.sin(a);
      push(cx + ccx + nx * r, cz + ccz + nz * r, nx, nz);
    }
    // Back side (after the third corner) runs −x → +x: insert notch stations.
    if (ci === 2) {
      for (const n of [...notches].sort((p, q) => p.x0 - q.x0)) {
        push(cx + n.x0, cz - hz, 0, -1);
        push(cx + n.x0, cz - hz, 0, -1, n.y);
        push(cx + n.x1, cz - hz, 0, -1, n.y);
        push(cx + n.x1, cz - hz, 0, -1);
      }
    }
  });
  const first = out[0]!;
  push(first.x, first.z, first.nx, first.nz);
  return out;
}

/** Circle plan for turned parts: profile offsets are radii. u runs 0–1 around. */
export function planCircle(segments: number, cx = 0, cz = 0): PlanSample[] {
  const out: PlanSample[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * TAU;
    out.push({ x: cx, z: cz, nx: Math.cos(a), nz: -Math.sin(a), s: i / segments });
  }
  return out;
}

/** Contour of a rounded rectangle at offset o (for caps that close a sweep exactly). */
export function planContour(hx: number, hz: number, r: number, cornerSegments: number, o: number, cx = 0, cz = 0): Vector2[] {
  const path = planRoundedRect(hx, hz, r, cornerSegments, cx, cz);
  path.pop();
  const pts = path.map((p) => new Vector2(p.x + p.nx * o, p.z + p.nz * o));
  // Drop coincident neighbours (zero-length straight sides).
  return pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]!) > 1e-7);
}

export function circleContour(cx: number, cz: number, r: number, segments: number): Vector2[] {
  return Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * TAU;
    return new Vector2(cx + Math.cos(a) * r, cz + Math.sin(a) * r);
  });
}

/** Filleted profile → point list (x = offset/radius, y = height). */
export function profile(points: ProfilePoint[], filletSegments = 4): Vector2[] {
  return filletPolyline(points, filletSegments);
}

export interface SweepOptions {
  /** Normals on the left of the profile direction (cavities, inner walls). */
  flip?: boolean;
  /** Corners sharper than this (degrees) get split normals. */
  crease?: number;
  /** Scene units per UV unit (path/profile UVs). */
  tile?: number;
  /** Planar disc UVs (record vinyl): u,v = 0–1 across the square of half-size `radius`. */
  planar?: { radius: number };
}

/**
 * Sweep a 2D profile (x = offset along the plan normal, y = height) along a plan path.
 * Normals come from the profile tangent (right-hand side of the profile direction, or left with
 * `flip`), so the surface is analytically smooth; sharp profile corners are auto-creased.
 * Output is a non-indexed triangle list with position/normal/uv.
 */
export function sweep(path: PlanSample[], prof: Vector2[], opt: SweepOptions = {}): BufferGeometry {
  const creaseCos = Math.cos(((opt.crease ?? 35) * Math.PI) / 180);
  const tile = opt.tile ?? 1;
  const segN: Vector2[] = [];
  for (let i = 0; i < prof.length - 1; i++) {
    const t = prof[i + 1]!.clone().sub(prof[i]!);
    const l = t.length();
    if (l < 1e-10) {
      segN.push(segN[segN.length - 1]?.clone() ?? new Vector2(1, 0));
      continue;
    }
    t.divideScalar(l);
    segN.push(opt.flip ? new Vector2(-t.y, t.x) : new Vector2(t.y, -t.x));
  }
  type PV = { o: number; y: number; no: number; ny: number; v: number; link: boolean };
  const pv: PV[] = [];
  let v = 0;
  for (let i = 0; i < prof.length; i++) {
    const p = prof[i]!;
    if (i > 0) v += p.distanceTo(prof[i - 1]!);
    const a = segN[i - 1], b = segN[i];
    if (a && b && a.dot(b) < creaseCos) {
      pv.push({ o: p.x, y: p.y, no: a.x, ny: a.y, v, link: false });
      pv.push({ o: p.x, y: p.y, no: b.x, ny: b.y, v, link: true });
    } else {
      const n = a && b ? a.clone().add(b).normalize() : (a ?? b ?? new Vector2(1, 0)).clone();
      pv.push({ o: p.x, y: p.y, no: n.x, ny: n.y, v, link: true });
    }
  }
  pv[pv.length - 1]!.link = false;

  const pos: number[] = [], nor: number[] = [], uvs: number[] = [];
  const P = (j: number, k: number): Vector3 => {
    const s = path[j]!, q = pv[k]!;
    const y = s.clampY !== undefined ? Math.max(q.y, s.clampY) : q.y;
    return new Vector3(s.x + s.nx * q.o, y, s.z + s.nz * q.o);
  };
  const N = (j: number, k: number): Vector3 => {
    const s = path[j]!, q = pv[k]!;
    return new Vector3(s.nx * q.no, q.ny, s.nz * q.no).normalize();
  };
  const UV = (j: number, k: number, p: Vector3): [number, number] => {
    if (opt.planar) return [(p.x / opt.planar.radius + 1) / 2, (-p.z / opt.planar.radius + 1) / 2];
    return [path[j]!.s / tile, pv[k]!.v / tile];
  };
  const e1 = new Vector3(), e2 = new Vector3(), fn = new Vector3();
  const tri = (verts: [Vector3, Vector3, Vector3], normals: [Vector3, Vector3, Vector3] | null, uv: [[number, number], [number, number], [number, number]], ref: Vector3) => {
    e1.subVectors(verts[1], verts[0]);
    e2.subVectors(verts[2], verts[0]);
    fn.crossVectors(e1, e2);
    const area = fn.length();
    if (area < 1e-12) return;
    let order = [0, 1, 2];
    if (fn.dot(ref) < 0) {
      order = [0, 2, 1];
      fn.negate();
    }
    fn.divideScalar(area);
    for (const i of order) {
      const p = verts[i]!, n = normals ? normals[i]! : fn;
      pos.push(p.x, p.y, p.z);
      nor.push(n.x, n.y, n.z);
      uvs.push(uv[i]![0], uv[i]![1]);
    }
  };
  const same = (a: PlanSample, b: PlanSample) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.z - b.z) < 1e-9 && a.nx === b.nx && a.nz === b.nz;
  for (let j = 0; j < path.length - 1; j++) {
    const s0 = path[j]!, s1 = path[j + 1]!;
    const transition = same(s0, s1) && s0.clampY !== s1.clampY;
    if (same(s0, s1) && !transition) continue;
    let ref = new Vector3();
    if (transition) {
      // Notch side face: normal along the path, into the notch.
      const entering = s0.clampY === undefined;
      const a = entering ? s1 : path[Math.max(0, j - 1)]!;
      const b = entering ? path[Math.min(path.length - 1, j + 2)]! : s0;
      ref = new Vector3(b.x - a.x, 0, b.z - a.z).normalize();
      if (!entering) ref.negate();
    }
    for (let k = 0; k < pv.length - 1; k++) {
      if (!pv[k]!.link) continue;
      const a = P(j, k), b = P(j + 1, k), c = P(j + 1, k + 1), d = P(j, k + 1);
      const uva = UV(j, k, a), uvb = UV(j + 1, k, b), uvc = UV(j + 1, k + 1, c), uvd = UV(j, k + 1, d);
      if (transition) {
        tri([a, b, c], null, [uva, uvb, uvc], ref);
        tri([a, c, d], null, [uva, uvc, uvd], ref);
      } else {
        const na = N(j, k), nb = N(j + 1, k), nc = N(j + 1, k + 1), nd = N(j, k + 1);
        tri([a, b, c], [na, nb, nc], [uva, uvb, uvc], na.clone().add(nb).add(nc));
        tri([a, c, d], [na, nc, nd], [uva, uvc, uvd], na.clone().add(nc).add(nd));
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  return g;
}

export interface LatheOptions extends SweepOptions {
  segments?: number;
  filletSegments?: number;
}

/** Turned part about +Y: profile (radius, height), traversed bottom → out → up → in. */
export function turned(points: ProfilePoint[], opt: LatheOptions = {}): BufferGeometry {
  return sweep(planCircle(opt.segments ?? 48), profile(points, opt.filletSegments ?? 3), opt);
}

/**
 * Flat cap over a closed contour (plan x/z), facing up or down, with optional holes.
 * UVs are planar in scene units / tile, optionally rotated by `uvAngle` (radians).
 */
export function cap(contour: Vector2[], y: number, up: boolean, holes: Vector2[][] = [], tile = 1, uvAngle = 0): BufferGeometry {
  const map = (p: Vector2) => new Vector2(p.x, up ? -p.y : p.y);
  const shape = new Shape(contour.map(map));
  for (const h of holes) shape.holes.push(new Shape(h.map(map)));
  const g = new ShapeGeometry(shape, 1);
  g.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
  g.translate(0, y, 0);
  const pos = g.getAttribute('position') as BufferAttribute;
  const uv = g.getAttribute('uv') as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, y); // exact plane (rotation leaves ~1e-17 noise that breaks strict bounds checks)
    const x = pos.getX(i), z = pos.getZ(i), c = Math.cos(uvAngle), sn = Math.sin(uvAngle);
    uv.setXY(i, (x * c - z * sn) / tile, (x * sn + z * c) / tile);
  }
  return g;
}

/**
 * Faceted knurl band about +Y: `ridges` V-ridges between radii r − depth (valleys) and r
 * (crests), with triangular end caps so it closes against turned chamfers at the valley radius.
 */
export function knurlBand(r: number, depth: number, y0: number, y1: number, ridges: number): BufferGeometry {
  const pos: number[] = [];
  const at = (a: number, rr: number, y: number) => new Vector3(Math.cos(a) * rr, y, -Math.sin(a) * rr);
  const quad = (p: Vector3[]) => {
    const n = new Vector3().subVectors(p[1]!, p[0]!).cross(new Vector3().subVectors(p[2]!, p[0]!));
    // Outward: compare with the radial direction of the quad centre.
    const c = p.reduce((s, q) => s.add(q), new Vector3()).divideScalar(p.length);
    const flip = n.dot(new Vector3(c.x, 0, c.z)) < 0;
    const t = flip ? [p[0]!, p[2]!, p[1]!, p[0]!, p[3]!, p[2]!] : [p[0]!, p[1]!, p[2]!, p[0]!, p[2]!, p[3]!];
    for (const q of t) pos.push(q.x, q.y, q.z);
  };
  const capTri = (p: Vector3[], upFacing: boolean) => {
    const n = new Vector3().subVectors(p[1]!, p[0]!).cross(new Vector3().subVectors(p[2]!, p[0]!));
    const t = (n.y > 0) === upFacing ? p : [p[0]!, p[2]!, p[1]!];
    for (const q of t) pos.push(q.x, q.y, q.z);
  };
  const rv = r - depth;
  for (let i = 0; i < ridges; i++) {
    const a0 = (i / ridges) * TAU, a1 = ((i + 0.5) / ridges) * TAU, a2 = ((i + 1) / ridges) * TAU;
    quad([at(a0, rv, y0), at(a1, r, y0), at(a1, r, y1), at(a0, rv, y1)]);
    quad([at(a1, r, y0), at(a2, rv, y0), at(a2, rv, y1), at(a1, r, y1)]);
    capTri([at(a0, rv, y1), at(a1, r, y1), at(a2, rv, y1)], true);
    capTri([at(a0, rv, y0), at(a1, r, y0), at(a2, rv, y0)], false);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}

export interface Placement {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

/** Bake a rotation (X, then Y, then Z order as Euler 'XYZ') and translation into a geometry. */
export function place<T extends BufferGeometry>(g: T, t: Placement): T {
  if (t.rx) g.rotateX(t.rx);
  if (t.rz) g.rotateZ(t.rz);
  if (t.ry) g.rotateY(t.ry);
  if (t.x || t.y || t.z) g.translate(t.x ?? 0, t.y ?? 0, t.z ?? 0);
  return g;
}

/** Apply an arbitrary matrix (for parts built in a rotated local frame). */
export function transformed<T extends BufferGeometry>(g: T, m: Matrix4): T {
  g.applyMatrix4(m);
  return g;
}
