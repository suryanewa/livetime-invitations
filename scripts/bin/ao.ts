/**
 * Baked ambient occlusion for the bin's turned parts (v1.5). The body, base, lid ring and inner
 * bucket are surfaces of revolution, so their occlusion depends only on where a point is along
 * its profile: it is ray-traced once per profile point against every turned part (each profile
 * segment revolved is a cone, a cylinder or an annulus: exact intersections, no mesh), with a
 * deterministic cosine-weighted hemisphere (a Fibonacci spiral). Open lid (the flaps stand at the
 * sides, clear of the mouth) and no floor (the contact shadow and the shadow map darken the
 * floor contact). The result is the ambient a point sees: deep in the bucket ≈ 0.15, the outer
 * wall ≈ 1, the seams under the lid ring's overhang and above the base cup in between.
 */
import { BIN_LATHES, roundLoop } from '../../models/disposalBin.ts';

type Seg = { r0: number; y0: number; r1: number; y1: number };

const SEGMENTS: Seg[] = BIN_LATHES.flatMap((part) => {
  const loop = roundLoop(part.loop, Math.PI / 12);
  const segs: Seg[] = [];
  for (let i = 0; i + 1 < loop.length; i++) {
    const a = loop[i]!, b = loop[i + 1]!;
    if (Math.hypot(a.r - b.r, a.y - b.y) > 1e-6) segs.push({ r0: a.r, y0: a.y, r1: b.r, y1: b.y });
  }
  return segs;
});

/** Nearest hit distance of the ray o + t·d (t > tMin) against the revolved segments, or Infinity. */
function trace(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, tMin: number): number {
  let best = Infinity;
  for (const s of SEGMENTS) {
    if (Math.abs(s.y1 - s.y0) < 1e-9) {
      if (Math.abs(dy) < 1e-12) continue;
      const t = (s.y0 - oy) / dy;
      if (t <= tMin || t >= best) continue;
      const x = ox + t * dx, z = oz + t * dz, rho = Math.hypot(x, z);
      if (rho >= Math.min(s.r0, s.r1) && rho <= Math.max(s.r0, s.r1)) best = t;
      continue;
    }
    const k = (s.r1 - s.r0) / (s.y1 - s.y0), a = s.r0 - k * s.y0;
    const ra = a + k * oy;
    const A = dx * dx + dz * dz - k * k * dy * dy;
    const B = 2 * (ox * dx + oz * dz - k * dy * ra);
    const C = ox * ox + oz * oz - ra * ra;
    const roots: number[] = [];
    if (Math.abs(A) < 1e-12) {
      if (Math.abs(B) > 1e-12) roots.push(-C / B);
    } else {
      const disc = B * B - 4 * A * C;
      if (disc < 0) continue;
      const q = Math.sqrt(disc);
      roots.push((-B - q) / (2 * A), (-B + q) / (2 * A));
    }
    const yLo = Math.min(s.y0, s.y1), yHi = Math.max(s.y0, s.y1);
    for (const t of roots) {
      if (t <= tMin || t >= best) continue;
      const y = oy + t * dy;
      if (y < yLo || y > yHi || a + k * y < 0) continue;
      best = t;
    }
  }
  return best;
}

/** Fraction of the cosine-weighted hemisphere over (r, y) with outward normal (nr, ny) that is open. */
export function occlusionAt(r: number, y: number, nr: number, ny: number, rays = 256): number {
  // Point at azimuth 0 (x = r, z = 0), normal in the (x, y) plane; a frame around it.
  const n = [nr, ny, 0] as const;
  const t1 = Math.abs(ny) < 0.9 ? [-ny, nr, 0] : [0, 0, 1];
  const l1 = Math.hypot(t1[0]!, t1[1]!, t1[2]!);
  const tx = [t1[0]! / l1, t1[1]! / l1, t1[2]! / l1];
  const bx = [n[1] * tx[2]! - n[2] * tx[1]!, n[2] * tx[0]! - n[0] * tx[2]!, n[0] * tx[1]! - n[1] * tx[0]!];
  const ox = r + nr * 0.02, oy = y + ny * 0.02, oz = 0;
  let open = 0;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < rays; i++) {
    // Cosine-weighted: uniform on the disc, lifted to the hemisphere (Fibonacci spiral on the disc).
    const rr = Math.sqrt((i + 0.5) / rays), ph = i * golden;
    const a = rr * Math.cos(ph), b = rr * Math.sin(ph), c = Math.sqrt(Math.max(0, 1 - rr * rr));
    const dx = a * tx[0]! + b * bx[0]! + c * n[0], dy = a * tx[1]! + b * bx[1]! + c * n[1], dz = a * tx[2]! + b * bx[2]! + c * n[2];
    if (trace(ox, oy, oz, dx, dy, dz, 1e-4) === Infinity) open++;
  }
  return open / rays;
}

/**
 * Occlusion along a part's loop, sampled at `rows` evenly spaced positions of its arc length
 * (v1 = (row + 0.5) / rows, as the ORM texture's rows). Interpolated between the loop's points.
 */
export function occlusionProfile(partName: string, rows: number, rays = 256): Float32Array {
  const part = BIN_LATHES.find((p) => p.name === partName);
  if (!part) throw new Error(`no turned part ${partName}`);
  const loop = roundLoop(part.loop);
  const total = loop[loop.length - 1]!.s;
  const at = loop.map((p) => (p.r < 1e-6 && Math.abs(p.ny) < 0.5 ? 1 : occlusionAt(p.r, p.y, p.nr, p.ny, rays)));
  const out = new Float32Array(rows);
  let j = 0;
  for (let row = 0; row < rows; row++) {
    const s = ((row + 0.5) / rows) * total;
    while (j + 1 < loop.length - 1 && loop[j + 1]!.s < s) j++;
    const a = loop[j]!, b = loop[j + 1]!;
    const f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
    out[row] = at[j]! + (at[j + 1]! - at[j]!) * f;
  }
  return out;
}
