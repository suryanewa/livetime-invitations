import { describe, expect, it } from 'vitest';
import { Baker, Occupancy } from '../scripts/masters/recipes/birthdayBake.ts';
import {
  type Foot, MM, pipedDot, pressure, shell, spiralRosette, STAR, sweep, swagStrand, taper, type V3,
} from '../scripts/masters/recipes/birthdayPiping.ts';

/**
 * v1.6 (the Hollywood pass): the cake's piping is regenerated as sculpted star-tip sweeps
 * (scripts/masters/recipes/birthdayPiping.ts) and its light baked (birthdayBake.ts). These pin the
 * properties the look depends on: deterministic, every piece its own, teeth that read, ends that close
 * and tuck in, parts pressed into the surface, and occlusion where parts meet.
 */

/** A straight rope on the plane y = 0 along +x, `n` feet, 40 mm long. */
function straightFeet(n: number, w = 2.5 * MM, h = 4.5 * MM, tw = (s: number) => 0): Foot[] {
  return Array.from({ length: n }, (_, i) => {
    const s = i / (n - 1);
    return { c: [s * 40 * MM, 0, 0] as V3, n: [0, 1, 0] as V3, t: [1, 0, 0] as V3, w, h, sink: MM, tw: tw(s), amp: 0.22, flare: 0.3 };
  });
}

/** A hanging swag path on a cylinder of radius 0.567 (the bottom tier, scan units). */
function swagPath(): { feet: V3[]; normals: V3[] } {
  const feet: V3[] = [], normals: V3[] = [];
  for (let k = 0; k < 19; k++) {
    const a = 1.2 + (0.4 * k) / 18, y = 0.15 - 0.15 * Math.sin((Math.PI * k) / 18);
    feet.push([0.567 * Math.cos(a), y, 0.567 * Math.sin(a)]);
    normals.push([Math.cos(a), 0, Math.sin(a)]);
  }
  return { feet, normals };
}

describe('Birthday v1.6 sculpted piping', () => {
  it('is deterministic: the same seed builds the same rope, to the bit', () => {
    const { feet, normals } = swagPath();
    const a = swagStrand(feet, normals, 2.3 * MM, 5 * MM, 1234);
    const b = swagStrand(feet, normals, 2.3 * MM, 5 * MM, 1234);
    expect(a.pos).toEqual(b.pos);
    expect(a.nrm).toEqual(b.nrm);
    expect(a.idx).toEqual(b.idx);
    expect(a.ridge).toEqual(b.ridge);
  });

  it('no two pieces alike: another seed changes the shape everywhere, not just a little', () => {
    const { feet, normals } = swagPath();
    const a = swagStrand(feet, normals, 2.3 * MM, 5 * MM, 1);
    const b = swagStrand(feet, normals, 2.3 * MM, 5 * MM, 2);
    // Different sampling (teeth, length) or different positions: either way not the same object copied.
    const n = Math.min(a.pos.length, b.pos.length);
    let diff = 0;
    for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(a.pos[i]! - b.pos[i]!));
    expect(a.pos.length !== b.pos.length || diff > 0.4 * MM).toBe(true);
    const r1 = spiralRosette([0, 0, 0], [0, 1, 0], [1, 0, 0], 13 * MM, 7);
    const r2 = spiralRosette([0, 0, 0], [0, 1, 0], [1, 0, 0], 13 * MM, 8);
    expect(r1.mesh.pos).not.toEqual(r2.mesh.pos);
    const s1 = shell(0, 0, 0.567, 25 * MM, 9 * MM, 11 * MM, 1, 3), s2 = shell(0, 0, 0.567, 25 * MM, 9 * MM, 11 * MM, 1, 4);
    expect(s1.pos).not.toEqual(s2.pos);
  });

  it('a star tip\'s teeth read: round a rope\'s visible arc the radius rises and falls tooth by tooth, ≥ 0.4 mm deep', () => {
    const tip = { ...STAR, teeth: 12, perTooth: 6 };
    const m = sweep(straightFeet(9), tip, 5);
    // The middle ring: distance from the rope's axis (the section centre above the foot).
    const ringSize = m.pos.length / 3 / 9;
    const mid = 4 * ringSize;
    const centre: V3 = [m.pos[3 * mid]!, 0, 0];
    const rv = (4.5 * MM + MM) / 2, y0 = 4.5 * MM - rv;
    const radii: number[] = [];
    for (let j = 0; j < ringSize; j++) {
      const i = mid + j;
      const y = m.pos[3 * i + 1]!, z = m.pos[3 * i + 2]!;
      if (y < 2.5 * MM) continue; // the visible upper arc
      radii.push(Math.hypot(y - y0, z, m.pos[3 * i]! - centre[0]));
    }
    let peaks = 0;
    for (let k = 1; k < radii.length - 1; k++) if (radii[k]! > radii[k - 1]! && radii[k]! >= radii[k + 1]!) peaks++;
    expect(peaks).toBeGreaterThanOrEqual(3);
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.4 * MM);
    // Ridge attribute spans crest and groove.
    expect(Math.max(...m.ridge)).toBeGreaterThan(0.8);
    expect(Math.min(...m.ridge)).toBeLessThan(-0.8);
  });

  it('ropes are pressed into what they are piped on, and flare into it (a fillet, not a tube resting on it)', () => {
    const m = sweep(straightFeet(9), { ...STAR, perTooth: 6 }, 9);
    let below = 0, minY = Infinity, wideAt0 = 0, wideHigh = 0;
    for (let i = 0; i < m.pos.length; i += 3) {
      const y = m.pos[i + 1]!, z = Math.abs(m.pos[i + 2]!);
      minY = Math.min(minY, y);
      if (y < 0) below++;
      if (Math.abs(y) < 0.15 * MM) wideAt0 = Math.max(wideAt0, z);
      if (Math.abs(y - 2.0 * MM) < 0.3 * MM) wideHigh = Math.max(wideHigh, z);
    }
    expect(below).toBeGreaterThan(0);
    expect(minY).toBeLessThan(-0.5 * MM);
    // Where it meets the surface it is wider than the rope's own flank higher up: the fillet.
    expect(wideAt0).toBeGreaterThan(wideHigh);
  });

  it('a piped end closes: the start is a rounded cap and the pulled tail thins to a point drawn into the surface', () => {
    const feet = straightFeet(41).map((f, i, all) => {
      const s = i / (all.length - 1);
      const { k, dive } = taper(s, 0.05, 0.15, 0.15);
      return { ...f, w: f.w * k, h: f.h * k, sink: k > 0 ? f.sink * Math.max(k, 0.3) : 0, c: [f.c[0], -dive * 2 * MM * k, 0] as V3 };
    });
    expect(feet[0]!.w).toBe(0);
    expect(feet[feet.length - 1]!.w).toBe(0);
    const m = sweep(feet, STAR, 3);
    const ring = m.pos.length / 3 / 41;
    // First and last rings collapse to one point each.
    for (const r of [0, 40]) {
      const p0 = [m.pos[3 * r * ring]!, m.pos[3 * r * ring + 1]!, m.pos[3 * r * ring + 2]!];
      for (let j = 1; j < ring; j++) for (let c = 0; c < 3; c++) expect(Math.abs(m.pos[3 * (r * ring + j) + c]! - p0[c]!)).toBeLessThan(1e-9);
    }
    // The tail is thin just before its end.
    let tailWidth = 0;
    for (let j = 0; j < ring; j++) tailWidth = Math.max(tailWidth, Math.abs(m.pos[3 * (38 * ring + j) + 2]!));
    expect(tailWidth).toBeLessThan(1.4 * MM);
  });

  it('the hand\'s pressure varies along a rope (swells, a fatter start), but never pinches it off mid-rope', () => {
    const p = Array.from({ length: 201 }, (_, i) => pressure(i / 200, 0.5, 77, { swell: 0.12, start: 0.12, hiccups: 1 }));
    expect(Math.max(...p) - Math.min(...p)).toBeGreaterThan(0.08);
    expect(Math.min(...p)).toBeGreaterThan(0.7);
    expect(p[8]!).toBeGreaterThan(p[100]! - 0.05);
  });

  it('a dot is a pressed-in dome with a pulled peak, each leaning its own way (v1.6 polish: not all down)', () => {
    const quadrants = new Set<number>();
    for (let seed = 11; seed < 23; seed++) {
      const m = pipedDot([0, 0, 0], [0, 0, 1], [0, -1, 0], 2.6 * MM, seed);
      let top: V3 = [0, 0, -Infinity], minZ = Infinity;
      for (let i = 0; i < m.pos.length; i += 3) {
        if (m.pos[i + 2]! > top[2]) top = [m.pos[i]!, m.pos[i + 1]!, m.pos[i + 2]!];
        minZ = Math.min(minZ, m.pos[i + 2]!);
      }
      expect(top[2]).toBeGreaterThan(2 * MM);
      expect(minZ).toBeLessThan(-0.2 * MM);
      // The peak is pulled off the dome's centre.
      expect(Math.hypot(top[0], top[1])).toBeGreaterThan(0.05 * MM);
      quadrants.add((top[0] > 0 ? 1 : 0) + (top[1] > 0 ? 2 : 0));
    }
    expect(quadrants.size).toBeGreaterThanOrEqual(3);
  });
});

describe('Birthday v1.6 baked light', () => {
  it('occlusion: open frosting sees the room, the crease where a part meets the surface does not', () => {
    const grid = new Occupancy([-0.05, -0.02, -0.05], [0.05, 0.05, 0.05], 0.0025);
    // A floor and a 1 cm block standing on it.
    const quad = (a: V3, b: V3, c: V3, d: V3, pos: number[], idx: number[]) => {
      const o = pos.length / 3;
      pos.push(...a, ...b, ...c, ...d);
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    };
    const pos: number[] = [], idx: number[] = [];
    quad([-0.05, 0, -0.05], [0.05, 0, -0.05], [0.05, 0, 0.05], [-0.05, 0, 0.05], pos, idx);
    const h = 0.045, s = 0.0225;
    quad([-s, 0, s], [s, 0, s], [s, h, s], [-s, h, s], pos, idx);
    quad([-s, 0, -s], [s, 0, -s], [s, h, -s], [-s, h, -s], pos, idx);
    quad([s, 0, -s], [s, 0, s], [s, h, s], [s, h, -s], pos, idx);
    quad([-s, 0, -s], [-s, 0, s], [-s, h, s], [-s, h, -s], pos, idx);
    quad([-s, h, -s], [s, h, -s], [s, h, s], [-s, h, s], pos, idx);
    grid.addTriangles(pos, idx);
    const baker = new Baker(grid, 32);
    const open = baker.occlusion([0.045, 0, 0.045], [0, 1, 0]);
    const crease = baker.occlusion([s + 0.003, 0, 0], [0, 1, 0]);
    const top = baker.occlusion([0, h, 0], [0, 1, 0]);
    expect(top.far).toBeGreaterThan(0.95);
    expect(crease.far).toBeLessThan(open.far - 0.15);
    expect(crease.near).toBeLessThan(open.near);
    // Thickness: through the block's 4.5 cm from its top, capped at the bake's reach.
    expect(baker.thickness([0, h, 0], [0, 1, 0], 0.03)).toBeCloseTo(0.03, 6);
    expect(baker.thickness([s, 0.02, 0], [1, 0, 0], 0.08)).toBeGreaterThan(0.04);
  });
});
