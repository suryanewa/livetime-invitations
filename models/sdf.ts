import { BufferAttribute, BufferGeometry, Vector3, type Box3 } from 'three';

/**
 * Signed-distance modelling for hard-surface masters (fidelity pass). Shapes are built from
 * primitives with true fillets (smooth unions/intersections), shadow-gap grooves and flush
 * insets, then meshed with surface nets. Normals come from the field gradient, so filleted
 * forms shade perfectly smoothly. Runs in the browser (lookdev) and in Node (GLB export).
 */

export type SDF = (x: number, y: number, z: number) => number;
export type SDF2 = (x: number, y: number) => number;

const len2 = (x: number, y: number) => Math.sqrt(x * x + y * y);
const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

// ── 2D primitives ────────────────────────────────────────────────────────────
export const rect2 = (hx: number, hy: number, r = 0): SDF2 => (x, y) => {
  const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r;
  return len2(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
export const circle2 = (r: number): SDF2 => (x, y) => len2(x, y) - r;

/** Exact polygon distance (Inigo Quilez), points in order. */
export const polygon2 = (pts: [number, number][]): SDF2 => (x, y) => {
  let d = Infinity;
  let s = 1;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[i]!, [bx, by] = pts[j]!;
    const ex = bx - ax, ey = by - ay, wx = x - ax, wy = y - ay;
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
    const dx = wx - ex * t, dy = wy - ey * t;
    d = Math.min(d, dx * dx + dy * dy);
    const c1 = y >= ay, c2 = y < by, c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
};

export const offset2 = (f: SDF2, r: number): SDF2 => (x, y) => f(x, y) - r;

// ── 3D primitives ────────────────────────────────────────────────────────────
export const roundBox = (hx: number, hy: number, hz: number, r = 0): SDF => (x, y, z) => {
  const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r, qz = Math.abs(z) - hz + r;
  return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
};
export const sphere = (r: number): SDF => (x, y, z) => len3(x, y, z) - r;
/** Vertical cylinder with rounded rims. */
export const cylinderY = (r: number, hh: number, round = 0): SDF => (x, y, z) => {
  const dx = len2(x, z) - r + round, dy = Math.abs(y) - hh + round;
  return Math.min(Math.max(dx, dy), 0) + len2(Math.max(dx, 0), Math.max(dy, 0)) - round;
};
export const torusY = (R: number, r: number): SDF => (x, y, z) => len2(len2(x, z) - R, y) - r;
export const capsule = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number): SDF => {
  const ex = bx - ax, ey = by - ay, ez = bz - az;
  const ee = ex * ex + ey * ey + ez * ez;
  return (x, y, z) => {
    const px = x - ax, py = y - ay, pz = z - az;
    const t = clamp((px * ex + py * ey + pz * ez) / ee, 0, 1);
    return len3(px - ex * t, py - ey * t, pz - ez * t) - r;
  };
};
/** Half-space below a plane through point p with outward normal n. */
export const halfSpace = (nx: number, ny: number, nz: number, px: number, py: number, pz: number): SDF => {
  const l = len3(nx, ny, nz);
  const ux = nx / l, uy = ny / l, uz = nz / l;
  return (x, y, z) => (x - px) * ux + (y - py) * uy + (z - pz) * uz;
};

/** Extrude a 2D shape along an axis with rounded (radius r) edges. */
export const extrude = (f: SDF2, half: number, r = 0, axis: 'x' | 'y' | 'z' = 'z'): SDF => (x, y, z) => {
  const [a, b, c] = axis === 'z' ? [x, y, z] : axis === 'x' ? [z, y, x] : [x, z, y];
  const d = f(a, b) + r;
  const w = Math.abs(c) - half + r;
  return Math.min(Math.max(d, w), 0) + len2(Math.max(d, 0), Math.max(w, 0)) - r;
};

/** Revolve a 2D profile (x = radius, y = height) around Y. */
export const revolve = (f: SDF2): SDF => (x, y, z) => f(len2(x, z), y);

// ── Operations ───────────────────────────────────────────────────────────────
export const union = (...fs: SDF[]): SDF => (x, y, z) => {
  let d = Infinity;
  for (const f of fs) d = Math.min(d, f(x, y, z));
  return d;
};
export const subtract = (a: SDF, b: SDF): SDF => (x, y, z) => Math.max(a(x, y, z), -b(x, y, z));
export const intersect = (a: SDF, b: SDF): SDF => (x, y, z) => Math.max(a(x, y, z), b(x, y, z));
export const smoothUnion = (a: SDF, b: SDF, k: number): SDF => (x, y, z) => {
  const d1 = a(x, y, z), d2 = b(x, y, z);
  const h = clamp(0.5 + (0.5 * (d2 - d1)) / k, 0, 1);
  return d2 + (d1 - d2) * h - k * h * (1 - h);
};
export const smoothSubtract = (a: SDF, b: SDF, k: number): SDF => (x, y, z) => {
  const d1 = a(x, y, z), d2 = -b(x, y, z);
  const h = clamp(0.5 - (0.5 * (d1 - d2)) / k, 0, 1);
  return d1 + (d2 - d1) * h + k * h * (1 - h);
};
export const smoothIntersect = (a: SDF, b: SDF, k: number): SDF => (x, y, z) => {
  const d1 = a(x, y, z), d2 = b(x, y, z);
  const h = clamp(0.5 - (0.5 * (d2 - d1)) / k, 0, 1);
  return d2 + (d1 - d2) * h + k * h * (1 - h);
};
export const shell = (f: SDF, t: number): SDF => (x, y, z) => Math.abs(f(x, y, z)) - t;
export const translate = (f: SDF, dx: number, dy: number, dz: number): SDF => (x, y, z) => f(x - dx, y - dy, z - dz);
export const rotateX = (f: SDF, a: number): SDF => {
  const c = Math.cos(a), s = Math.sin(a);
  return (x, y, z) => f(x, c * y + s * z, -s * y + c * z);
};
export const rotateY = (f: SDF, a: number): SDF => {
  const c = Math.cos(a), s = Math.sin(a);
  return (x, y, z) => f(c * x - s * z, y, s * x + c * z);
};
export const rotateZ = (f: SDF, a: number): SDF => {
  const c = Math.cos(a), s = Math.sin(a);
  return (x, y, z) => f(c * x + s * y, -s * x + c * y, z);
};

// ── Mesher: surface nets with gradient normals and surface projection ─────────
export interface MeshOptions {
  /** Cell size in scene units. */
  cell: number;
  /** Project vertices onto the zero set with one Newton step (sharper detail). */
  project?: boolean;
}

export function meshSDF(f: SDF, bounds: Box3, options: MeshOptions): BufferGeometry {
  const { cell } = options;
  const min = bounds.min.clone().subScalar(cell * 2);
  const size = bounds.max.clone().addScalar(cell * 2).sub(min);
  const nx = Math.ceil(size.x / cell) + 1, ny = Math.ceil(size.y / cell) + 1, nz = Math.ceil(size.z / cell) + 1;
  const field = new Float32Array(nx * ny * nz);
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) {
    const z = min.z + k * cell;
    for (let j = 0; j < ny; j++) {
      const y = min.y + j * cell;
      for (let i = 0; i < nx; i++) field[at(i, j, k)] = f(min.x + i * cell, y, z);
    }
  }
  const cellIndex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cAt = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos: number[] = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]] as const;
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]] as const;
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const [a, b, d] = corners[c]!;
          v[c] = field[at(i + a, j + b, k + d)]!;
          if (v[c]! < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [e0, e1] of edges) {
          const a = v[e0]!, b = v[e1]!;
          if (a < 0 === b < 0) continue;
          const t = a / (a - b);
          const c0 = corners[e0]!, c1 = corners[e1]!;
          sx += c0[0] + (c1[0] - c0[0]) * t;
          sy += c0[1] + (c1[1] - c0[1]) * t;
          sz += c0[2] + (c1[2] - c0[2]) * t;
          n++;
        }
        cellIndex[cAt(i, j, k)] = pos.length / 3;
        pos.push(min.x + (i + sx / n) * cell, min.y + (j + sy / n) * cell, min.z + (k + sz / n) * cell);
      }
    }
  }
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // Winding chosen so faces point along the field gradient (outward).
    if (flip) idx.push(a, b, c, a, c, d);
    else idx.push(a, c, b, a, d, c);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const s0 = field[at(i, j, k)]! < 0;
        if (i < nx - 1 && s0 !== field[at(i + 1, j, k)]! < 0) {
          quad(cellIndex[cAt(i, j - 1, k - 1)]!, cellIndex[cAt(i, j, k - 1)]!, cellIndex[cAt(i, j, k)]!, cellIndex[cAt(i, j - 1, k)]!, s0);
        }
        if (j < ny - 1 && s0 !== field[at(i, j + 1, k)]! < 0) {
          quad(cellIndex[cAt(i - 1, j, k - 1)]!, cellIndex[cAt(i - 1, j, k)]!, cellIndex[cAt(i, j, k)]!, cellIndex[cAt(i, j, k - 1)]!, s0);
        }
        if (k < nz - 1 && s0 !== field[at(i, j, k + 1)]! < 0) {
          quad(cellIndex[cAt(i - 1, j - 1, k)]!, cellIndex[cAt(i, j - 1, k)]!, cellIndex[cAt(i, j, k)]!, cellIndex[cAt(i - 1, j, k)]!, s0);
        }
      }
    }
  }
  // Gradient normals (and optional projection onto the surface).
  const h = cell * 0.5;
  const nor = new Float32Array(pos.length);
  const grad = new Vector3();
  for (let p = 0; p < pos.length; p += 3) {
    let x = pos[p]!, y = pos[p + 1]!, z = pos[p + 2]!;
    grad.set(f(x + h, y, z) - f(x - h, y, z), f(x, y + h, z) - f(x, y - h, z), f(x, y, z + h) - f(x, y, z - h)).normalize();
    if (options.project !== false) {
      const d = f(x, y, z);
      x -= grad.x * d; y -= grad.y * d; z -= grad.z * d;
      pos[p] = x; pos[p + 1] = y; pos[p + 2] = z;
      grad.set(f(x + h, y, z) - f(x - h, y, z), f(x, y + h, z) - f(x, y - h, z), f(x, y, z + h) - f(x, y, z - h)).normalize();
    }
    nor[p] = grad.x; nor[p + 1] = grad.y; nor[p + 2] = grad.z;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Planar UVs from a projection plane (for prints/grain on SDF parts), in scene units / tile. */
export function planarUV(g: BufferGeometry, axisU: 'x' | 'y' | 'z', axisV: 'x' | 'y' | 'z', tile = 1): BufferGeometry {
  const pos = g.getAttribute('position') as BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  const get = (a: 'x' | 'y' | 'z', i: number) => (a === 'x' ? pos.getX(i) : a === 'y' ? pos.getY(i) : pos.getZ(i));
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = get(axisU, i) / tile;
    uv[i * 2 + 1] = get(axisV, i) / tile;
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  return g;
}
