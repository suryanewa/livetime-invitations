import { describe, expect, it } from 'vitest';
import { DPR_DROP_MS, percentile, QualityMonitor, REDUCED_DPR, TIER_DPR } from '../src/render/quality.ts';

function feed(q: QualityMonitor, intervalMs: number, seconds: number, start = 0): number {
  let t = start;
  const end = start + seconds * 1000;
  while (t < end) {
    t += intervalMs;
    q.record(intervalMs, t);
  }
  return t;
}

describe('QualityMonitor', () => {
  it('computes nearest-rank percentiles', () => {
    expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 95)).toBe(100);
    expect(percentile([16, 16, 16, 40], 50)).toBe(16);
  });

  it('stays at normal when p95 is within 25 ms', () => {
    const q = new QualityMonitor();
    q.reducedDpr = true;
    feed(q, 16.7, 5);
    feed(q, 24, 3.1);
    expect(q.pending).toBeNull();
  });

  it('Normal renders at 2 device pixels; two windows over DPR_DROP_MS step it down to REDUCED_DPR first, at a safe point, once', () => {
    const q = new QualityMonitor();
    expect(TIER_DPR.normal).toBe(2);
    expect(q.dprCap).toBe(2);
    // 60 Hz with headroom never steps down.
    let t = feed(q, 16.7, 5);
    expect(q.pendingDpr).toBe(false);
    // One slow window is not enough; two are.
    t = feed(q, DPR_DROP_MS + 3, 1.05, t);
    expect(q.pendingDpr).toBe(false);
    t = feed(q, DPR_DROP_MS + 3, 1.05, t);
    expect(q.pendingDpr).toBe(true);
    // Requested, not applied: the cap holds until the controller's safe point; no tier strikes meanwhile.
    expect(q.dprCap).toBe(2);
    t = feed(q, 30, 3.1, t);
    expect(q.pending).toBeNull();
    expect(q.applyPendingDpr()).toBe(true);
    expect(q.dprCap).toBe(REDUCED_DPR);
    expect(q.tier).toBe('normal');
    // Never back up by itself (no oscillation): fast frames keep it down.
    t = feed(q, 8, 5, t);
    expect(q.dprCap).toBe(REDUCED_DPR);
    expect(q.applyPendingDpr()).toBe(false);
    // From here the tier ladder applies as before.
    t = feed(q, 30, 2.1, t);
    expect(q.pending).toBe('low');
    expect(q.applyPending()).toBe('low');
    expect(q.dprCap).toBe(TIER_DPR.low);
    // An explicit tier choice starts at the tier's own ratio again.
    q.tier = 'normal';
    q.resetDpr();
    expect(q.dprCap).toBe(2);
  });

  it('requests low after two consecutive slow windows, not one (once the pixel step is taken)', () => {
    const q = new QualityMonitor();
    q.reducedDpr = true;
    let t = feed(q, 30, 1.05);
    expect(q.pending).toBeNull();
    t = feed(q, 16.7, 1.05, t);
    t = feed(q, 30, 1.05, t);
    expect(q.pending).toBeNull();
    feed(q, 30, 1.05, t);
    expect(q.pending).toBe('low');
    expect(q.applyPending()).toBe('low');
    expect(q.tier).toBe('low');
  });

  it('from low, completes in static when p95 exceeds 34 ms twice', () => {
    const q = new QualityMonitor('low');
    let t = feed(q, 30, 2.1);
    expect(q.pending).toBeNull();
    feed(q, 40, 2.1, t);
    expect(q.pending).toBe('static');
  });

  it('pausing discards partial windows so idle gaps never count', () => {
    const q = new QualityMonitor();
    q.record(16, 0);
    q.pause();
    q.record(5000, 5000);
    expect(q.pending).toBeNull();
  });
});
