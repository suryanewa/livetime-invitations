import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { arcHeight, cubicBezier, dampedSettle, EASE, quadBezier, seg, track } from '../src/motion/curves.ts';

describe('curves', () => {
  it('seg normalises progress inside a beat and clamps outside it', () => {
    expect(seg(0.1, 0.2, 0.6)).toBe(0);
    expect(seg(0.4, 0.2, 0.6)).toBeCloseTo(0.5);
    expect(seg(0.9, 0.2, 0.6)).toBe(1);
  });

  it('cubicBezier matches endpoints and is monotonic for monotonic control points', () => {
    const e = cubicBezier(0.3, 0, 0.2, 1);
    expect(e(0)).toBe(0);
    expect(e(1)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const v = e(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });

  it('track hits its keys exactly and holds outside the range', () => {
    const f = track([[0, 0], [0.5, 1, EASE.lift], [1.2, 0.25]]);
    expect(f(-1)).toBe(0);
    expect(f(0.5)).toBeCloseTo(1);
    expect(f(1.2)).toBeCloseTo(0.25);
    expect(f(5)).toBe(0.25);
  });

  it('dampedSettle is exactly zero at its deadline', () => {
    expect(dampedSettle(0, 0.2, 3)).toBe(0.2);
    expect(dampedSettle(0.3, 0.2, 3, 0.55, 0.3)).toBe(0);
    expect(Math.abs(dampedSettle(0.29, 0.2, 3, 0.55, 0.3))).toBeLessThan(0.01);
  });

  it('arcHeight peaks at the apex position', () => {
    expect(arcHeight(0.4, 2, 0.4)).toBeCloseTo(2);
    expect(arcHeight(0, 2, 0.4)).toBe(0);
    expect(arcHeight(1, 2, 0.4)).toBeCloseTo(0);
  });

  it('quadBezier interpolates its endpoints', () => {
    const a = new Vector3(0, 0, 0), c = new Vector3(1, 2, 0), b = new Vector3(2, 0, 0);
    expect(quadBezier(new Vector3(), a, c, b, 0).equals(a)).toBe(true);
    expect(quadBezier(new Vector3(), a, c, b, 1).equals(b)).toBe(true);
    expect(quadBezier(new Vector3(), a, c, b, 0.5).y).toBeCloseTo(1);
  });
});
