/**
 * v1.6 Birthday: baked light transport for the cake's frosting (the Hollywood pass). The runtime
 * lights the cake with one key and the room's image-based light; what makes piping sit *in* the
 * frosting and read as soft and edible is the light it does not get (occlusion in the crease where a
 * rope meets the body, between the strands of a swag, under a rosette) and the light that goes through
 * it (thin crests glow). Both are baked here from the finished geometry, deterministically:
 *
 * - an occupancy grid (every frosting surface voxelised at 0.55 mm);
 * - ambient occlusion per point: cosine-weighted rays over the hemisphere, an occluder's weight
 *   falling off with distance over `reach` (far: 10 mm, the room's light; near: 2.5 mm, contact);
 * - thickness per point: how far light travels through the part from a point to its far side (or to
 *   the body it is piped on), the runtime's translucency.
 *
 * Units are the master's scan units (1 = 22 cm).
 */

export type V3 = [number, number, number];
const MM = 1 / 220;

export class Occupancy {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  private readonly bits: Uint32Array;
  constructor(readonly min: V3, max: V3, readonly cell: number) {
    this.nx = Math.ceil((max[0] - min[0]) / cell) + 1;
    this.ny = Math.ceil((max[1] - min[1]) / cell) + 1;
    this.nz = Math.ceil((max[2] - min[2]) / cell) + 1;
    this.bits = new Uint32Array(Math.ceil((this.nx * this.ny * this.nz) / 32));
  }
  private index(x: number, y: number, z: number): number {
    const i = Math.floor((x - this.min[0]) / this.cell), j = Math.floor((y - this.min[1]) / this.cell), k = Math.floor((z - this.min[2]) / this.cell);
    if (i < 0 || j < 0 || k < 0 || i >= this.nx || j >= this.ny || k >= this.nz) return -1;
    return (k * this.ny + j) * this.nx + i;
  }
  set(x: number, y: number, z: number): void {
    const n = this.index(x, y, z);
    if (n >= 0) this.bits[n >>> 5]! |= 1 << (n & 31);
  }
  get(x: number, y: number, z: number): boolean {
    const n = this.index(x, y, z);
    return n >= 0 && (this.bits[n >>> 5]! & (1 << (n & 31))) !== 0;
  }
  /** Marks every cell a triangle passes through (sampled at half a cell). */
  addTriangles(pos: ArrayLike<number>, idx: ArrayLike<number>): void {
    const h = this.cell * 0.5;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t]! * 3, b = idx[t + 1]! * 3, c = idx[t + 2]! * 3;
      const ax = pos[a]!, ay = pos[a + 1]!, az = pos[a + 2]!;
      const bx = pos[b]!, by = pos[b + 1]!, bz = pos[b + 2]!;
      const cx = pos[c]!, cy = pos[c + 1]!, cz = pos[c + 2]!;
      const e = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(ax - cx, ay - cy, az - cz));
      const n = Math.max(1, Math.ceil(e / h));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        const u = i / n, v = j / n, w = 1 - u - v;
        this.set(ax * w + bx * u + cx * v, ay * w + by * u + cy * v, az * w + bz * u + cz * v);
      }
    }
  }
}

/** Cosine-weighted hemisphere directions about +z (Hammersley), skipping the last few degrees above the horizon. */
function hemisphere(count: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < count; i++) {
    let bits = i;
    bits = ((bits << 16) | (bits >>> 16)) >>> 0;
    bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0;
    bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0;
    bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0;
    bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0;
    const u = (i + 0.5) / count, v = bits / 4294967296;
    const r = Math.sqrt(u * 0.94), phi = 2 * Math.PI * v;
    out.push([r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(1 - r * r)]);
  }
  return out;
}

export interface Bake {
  /** Ambient occlusion over `far` (the room) and `near` (contact), 1 = open. */
  far: number;
  near: number;
}

export class Baker {
  private readonly dirs: V3[];
  constructor(readonly grid: Occupancy, rays = 24, readonly reachFar = 10 * MM, readonly reachNear = 2.5 * MM) {
    this.dirs = hemisphere(rays);
  }

  /** Occlusion at `p` with outward normal `n` (unit). */
  occlusion(p: V3, n: V3): Bake {
    const g = this.grid, step = g.cell;
    // A frame about n.
    const a: V3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let tx = a[1] * n[2] - a[2] * n[1], ty = a[2] * n[0] - a[0] * n[2], tz = a[0] * n[1] - a[1] * n[0];
    const tl = Math.hypot(tx, ty, tz);
    tx /= tl; ty /= tl; tz /= tl;
    const bx = n[1] * tz - n[2] * ty, by = n[2] * tx - n[0] * tz, bz = n[0] * ty - n[1] * tx;
    const off = 2.6 * step;
    const sx = p[0] + n[0] * off, sy = p[1] + n[1] * off, sz = p[2] + n[2] * off;
    // Starting inside an occupied cell (a crease narrower than the offset): fully occluded close by.
    let far = 0, near = 0;
    const steps = Math.ceil(this.reachFar / step);
    for (const d of this.dirs) {
      const dx = tx * d[0] + bx * d[1] + n[0] * d[2];
      const dy = ty * d[0] + by * d[1] + n[1] * d[2];
      const dz = tz * d[0] + bz * d[1] + n[2] * d[2];
      for (let s = 0; s <= steps; s++) {
        const t = s * step;
        if (g.get(sx + dx * t, sy + dy * t, sz + dz * t)) {
          const dist = t + off * 0.5;
          far += Math.max(0, 1 - (dist / this.reachFar) ** 2);
          if (dist < this.reachNear) near += 1 - (dist / this.reachNear) ** 2;
          break;
        }
      }
    }
    const k = this.dirs.length;
    return { far: 1 - far / k, near: 1 - near / k };
  }

  /**
   * Thickness at `p` (outward normal `n`): marching inward, past the surface's own cells, to the next
   * surface (the part's far side, or the body it is piped on). Capped at `cap`.
   */
  thickness(p: V3, n: V3, cap = 15 * MM): number {
    const g = this.grid, step = g.cell * 0.5;
    let t = step, inside = true;
    while (t < cap) {
      const hit = g.get(p[0] - n[0] * t, p[1] - n[1] * t, p[2] - n[2] * t);
      if (inside && !hit) inside = false;
      else if (!inside && hit) return t;
      // A part thinner than a couple of cells never leaves its own surface's cells.
      if (inside && t > 3 * g.cell) return t;
      t += step;
    }
    return cap;
  }
}
