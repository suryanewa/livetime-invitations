import { Vector3 } from 'three';

/**
 * Authored motion primitives (Master §6). Sequences are pure functions of time built from
 * beats — preparation → action → contact → settle — each with its own easing. Never one
 * ease across a whole shot.
 */

export type Ease = (t: number) => number;

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Normalised progress of t inside the beat [t0, t1]. */
export const seg = (t: number, t0: number, t1: number) => clamp01((t - t0) / (t1 - t0));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const linear: Ease = (t) => t;
export const easeInQuad: Ease = (t) => t * t;
export const easeOutQuad: Ease = (t) => 1 - (1 - t) * (1 - t);
export const easeInCubic: Ease = (t) => t * t * t;
export const easeOutCubic: Ease = (t) => 1 - (1 - t) ** 3;
export const easeInOutCubic: Ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutQuint: Ease = (t) => 1 - (1 - t) ** 5;
export const easeInOutSine: Ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const smoothstep: Ease = (t) => t * t * (3 - 2 * t);

/** CSS-style cubic-bezier easing (x1, y1, x2, y2), solved by Newton + bisection. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x;
      if (Math.abs(err) < 1e-6) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

/** House eases: weighted lift, soft landing, mechanical hinge. */
export const EASE = {
  anticipate: cubicBezier(0.36, 0, 0.66, -0.2),
  lift: cubicBezier(0.3, 0, 0.2, 1),
  travel: cubicBezier(0.45, 0, 0.2, 1),
  land: cubicBezier(0.2, 0.8, 0.3, 1),
  hinge: cubicBezier(0.55, 0, 0.25, 1),
  snap: cubicBezier(0.3, 1.4, 0.5, 1),
} as const;

export type Key = readonly [t: number, value: number, ease?: Ease];

/** Piecewise scalar track; each segment eases into its end key with that key's ease. */
export function track(keys: readonly Key[]): (t: number) => number {
  if (keys.length === 0) throw new Error('empty track');
  return (t) => {
    if (t <= keys[0]![0]) return keys[0]![1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, e = smoothstep] = keys[i]!;
      const [t0, v0] = keys[i - 1]!;
      if (t <= t1) return lerp(v0, v1, e(seg(t, t0, t1)));
    }
    return keys[keys.length - 1]![1];
  };
}

export function quadBezier(out: Vector3, a: Vector3, c: Vector3, b: Vector3, t: number): Vector3 {
  const mt = 1 - t;
  return out.set(
    mt * mt * a.x + 2 * mt * t * c.x + t * t * b.x,
    mt * mt * a.y + 2 * mt * t * c.y + t * t * b.y,
    mt * mt * a.z + 2 * mt * t * c.z + t * t * b.z,
  );
}

export function cubicBezier3(out: Vector3, a: Vector3, c1: Vector3, c2: Vector3, b: Vector3, t: number): Vector3 {
  const mt = 1 - t;
  const w0 = mt * mt * mt, w1 = 3 * mt * mt * t, w2 = 3 * mt * t * t, w3 = t * t * t;
  return out.set(
    w0 * a.x + w1 * c1.x + w2 * c2.x + w3 * b.x,
    w0 * a.y + w1 * c1.y + w2 * c2.y + w3 * b.y,
    w0 * a.z + w1 * c1.z + w2 * c2.z + w3 * b.z,
  );
}

/**
 * Authored damped settle: amplitude·e^(−ζωt)·cos(ωd t). Deterministic, so "tiny damped
 * settle" beats never depend on simulation state. Returns exactly 0 at and after `end`.
 */
export function dampedSettle(t: number, amplitude: number, frequencyHz: number, zeta = 0.55, end = Infinity): number {
  if (t <= 0) return amplitude;
  if (t >= end) return 0;
  const w = 2 * Math.PI * frequencyHz;
  const wd = w * Math.sqrt(Math.max(0, 1 - zeta * zeta));
  const v = amplitude * Math.exp(-zeta * w * t) * Math.cos(wd * t);
  // Fade the tail to exactly zero at the deadline so the canonical pose is exact.
  const fade = end === Infinity ? 1 : 1 - smoothstep(seg(t, end * 0.7, end));
  return v * fade;
}

/** Ballistic-looking height for an authored arc with apex at s = apexAt. */
export function arcHeight(s: number, apex: number, apexAt = 0.5): number {
  const u = s <= apexAt ? s / apexAt : (1 - s) / (1 - apexAt);
  return apex * (1 - (1 - u) * (1 - u));
}
