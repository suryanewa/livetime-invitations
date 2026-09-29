import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  type Material,
  Mesh,
  Object3D,
  Path,
  Shape,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries as mergeBufferGeometriesRaw } from 'three/addons/utils/BufferGeometryUtils.js';

function mergeBufferGeometries(list: BufferGeometry[]): BufferGeometry {
  const merged = mergeBufferGeometriesRaw(list, false);
  if (!merged) throw new Error('mergeParts: incompatible geometries');
  return merged;
}

/**
 * Modelling primitives for code-authored masters. Everything is built from explicit
 * profiles with fillets so bevels catch light at phone scale (Master §5).
 * Units: 1 scene unit ≈ one "stage decimetre"; objects are stylised, not real scale.
 */

export type ProfilePoint = [x: number, y: number, fillet?: number];

/** Polyline with per-corner fillet radius → smooth point list (for lathe/extrude profiles). */
export function filletPolyline(points: ProfilePoint[], segments = 6): Vector2[] {
  const out: Vector2[] = [];
  for (let i = 0; i < points.length; i++) {
    const [x, y, r = 0] = points[i]!;
    const p = new Vector2(x, y);
    if (r <= 0 || i === 0 || i === points.length - 1) {
      out.push(p);
      continue;
    }
    const a = new Vector2(points[i - 1]![0], points[i - 1]![1]);
    const b = new Vector2(points[i + 1]![0], points[i + 1]![1]);
    const da = a.clone().sub(p).normalize();
    const db = b.clone().sub(p).normalize();
    const angle = Math.acos(Math.min(1, Math.max(-1, da.dot(db))));
    const tanDist = Math.min(r / Math.tan(angle / 2), a.distanceTo(p) * 0.5, b.distanceTo(p) * 0.5);
    const p0 = p.clone().addScaledVector(da, tanDist);
    const p1 = p.clone().addScaledVector(db, tanDist);
    // Quadratic Bézier with the corner as control point: smooth, cheap, stable.
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const mt = 1 - t;
      out.push(
        new Vector2(
          mt * mt * p0.x + 2 * mt * t * p.x + t * t * p1.x,
          mt * mt * p0.y + 2 * mt * t * p.y + t * t * p1.y,
        ),
      );
    }
  }
  return out;
}

export function lathe(profile: ProfilePoint[], radialSegments = 64, filletSegments = 6): LatheGeometry {
  return new LatheGeometry(filletPolyline(profile, filletSegments), radialSegments);
}

export function roundedRectPath<T extends Path>(target: T, w: number, h: number, r: number, cx = 0, cy = 0): T {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const rr = Math.min(r, w / 2, h / 2);
  target.moveTo(x + rr, y);
  target.lineTo(x + w - rr, y);
  target.quadraticCurveTo(x + w, y, x + w, y + rr);
  target.lineTo(x + w, y + h - rr);
  target.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  target.lineTo(x + rr, y + h);
  target.quadraticCurveTo(x, y + h, x, y + h - rr);
  target.lineTo(x, y + rr);
  target.quadraticCurveTo(x, y, x + rr, y);
  return target;
}

export function roundedRectShape(w: number, h: number, r: number, cx = 0, cy = 0): Shape {
  return roundedRectPath(new Shape(), w, h, r, cx, cy);
}

/**
 * Extrude a rounded rectangle whose OUTER size (including bevel) is exactly w × h × depth,
 * centred on the origin, faces on ±Z.
 */
export function beveledPlate(
  w: number,
  h: number,
  depth: number,
  radius: number,
  bevel: number,
  bevelSegments = 4,
  holes: Path[] = [],
): ExtrudeGeometry {
  const b = Math.min(bevel, depth / 2 - 1e-4, w / 4, h / 4);
  const shape = roundedRectShape(w - 2 * b, h - 2 * b, Math.max(0.001, radius - b));
  shape.holes.push(...holes);
  const geo = new ExtrudeGeometry(shape, {
    depth: depth - 2 * b,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments,
    curveSegments: 10,
  });
  geo.translate(0, 0, -(depth - 2 * b) / 2);
  return geo;
}

export function roundedBox(w: number, h: number, d: number, r: number, segments = 4): RoundedBoxGeometry {
  return new RoundedBoxGeometry(w, h, d, segments, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
}

/**
 * Open cylindrical band (for signature inlays on round supports). UV u runs around at
 * one tile per band height so perforations/stipple stay round.
 */
export function cylinderBand(radius: number, height: number, tileSize: number, segments = 96): BufferGeometry {
  const g = new CylinderGeometry(radius, radius, height, segments, 1, true);
  const uv = g.getAttribute('uv') as BufferAttribute;
  const circumference = Math.PI * 2 * radius;
  const repeatU = Math.max(1, Math.round(circumference / tileSize));
  const repeatV = height / tileSize;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeatU, uv.getY(i) * repeatV);
  return g;
}

/** Flat inlay plate on +Z with UVs in tile units. */
export function inlayPlate(w: number, h: number, depth: number, radius: number, tileSize: number): ExtrudeGeometry {
  const geo = beveledPlate(w, h, depth, radius, depth * 0.45, 2);
  const pos = geo.getAttribute('position') as BufferAttribute;
  const uv = geo.getAttribute('uv') as BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / tileSize, (pos.getY(i) + h / 2) / tileSize);
  return geo;
}

export function mesh(name: string, geometry: BufferGeometry, material: Material | Material[], parent?: Object3D): Mesh {
  const m = new Mesh(geometry, material);
  m.name = name;
  parent?.add(m);
  return m;
}

export function group(name: string, parent?: Object3D): Object3D {
  const g = new Object3D();
  g.name = name;
  parent?.add(g);
  return g;
}

/** Tube along a polyline of points with fixed radius (wire parts, handles). */
export function wire(points: Vector3[], radius: number, radial = 10): BufferGeometry {
  const rings = points.length;
  const pos = new Float32Array(rings * (radial + 1) * 3);
  const nor = new Float32Array(rings * (radial + 1) * 3);
  const idx: number[] = [];
  const t = new Vector3(), n = new Vector3(), b = new Vector3(), up = new Vector3(0, 0, 1);
  for (let i = 0; i < rings; i++) {
    const p = points[i]!;
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(rings - 1, i + 1)]!;
    t.subVectors(next, prev).normalize();
    if (Math.abs(t.dot(up)) > 0.95) up.set(1, 0, 0);
    n.crossVectors(t, up).normalize();
    b.crossVectors(t, n).normalize();
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cx = Math.cos(a), cy = Math.sin(a);
      const k = (i * (radial + 1) + j) * 3;
      const nx = n.x * cx + b.x * cy, ny = n.y * cx + b.y * cy, nz = n.z * cx + b.z * cy;
      pos[k] = p.x + nx * radius; pos[k + 1] = p.y + ny * radius; pos[k + 2] = p.z + nz * radius;
      nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz;
    }
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, c = a + radial + 1;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Evenly spaced points on a circle in the XZ plane. */
export function ringPositions(count: number, radius: number, y: number, phase = 0): Vector3[] {
  return Array.from({ length: count }, (_, i) => {
    const a = phase + (i / count) * Math.PI * 2;
    return new Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius);
  });
}

/**
 * Signature perforation row (direction B/L): whole dots only, spacing equal to band height,
 * centred by construction. Returns a plate exactly N·pitch long; callers leave at least one
 * pitch of plain surface at each end. Material groups: 0 = faces (perforated), 1 = sides
 * (plain host material), so bevel walls never smear the dot texture.
 */
export function perforationRow(available: number, pitch: number, depth = 0.004): { geometry: ExtrudeGeometry; count: number; length: number } {
  const count = Math.max(1, Math.floor(available / pitch));
  const length = count * pitch;
  return { geometry: inlayPlate(length, pitch, depth, pitch * 0.5, pitch), count, length };
}

/**
 * Merge same-material parts into one mesh (one draw call). Each part is placed by its own
 * position/rotation before merging; attributes are normalised to position/normal/uv.
 */
export function mergeParts(parts: { geometry: BufferGeometry; position?: [number, number, number]; rotationX?: number }[]): BufferGeometry {
  const prepared = parts.map(({ geometry, position, rotationX }) => {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    g.clearGroups();
    if (rotationX) g.rotateX(rotationX);
    if (position) g.translate(...position);
    geometry.dispose();
    return g;
  });
  const merged = mergeBufferGeometries(prepared);
  prepared.forEach((g) => g.dispose());
  return merged;
}
