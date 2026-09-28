import { describe, expect, it } from 'vitest';
import { percentile, QualityMonitor } from '../src/render/quality.ts';

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
    feed(q, 16.7, 5);
    expect(q.pending).toBeNull();
  });

  it('requests low after two consecutive slow windows, not one', () => {
    const q = new QualityMonitor();
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
