/**
 * Adaptive quality (Master §9). Camera, silhouette, motion timing and status are identical
 * across tiers. Start at Normal; drop one tier at the next safe point when the p95 active
 * frame interval exceeds 25 ms over two consecutive 1 s windows; from Low, exceeding 34 ms
 * over two windows completes the current intent in Static. Never auto-upgrade mid-session.
 */

export type Tier = 'high' | 'normal' | 'low' | 'static';

export const TIER_DPR: Record<Tier, number> = { high: 2, normal: 1.5, low: 1, static: 1 };
export const DROP_THRESHOLD_MS = 25;
export const STATIC_THRESHOLD_MS = 34;
export const WINDOW_MS = 1000;

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

export class QualityMonitor {
  private samples: number[] = [];
  private windowStart: number | null = null;
  private strikes = 0;
  /** Tier requested at the next safe point, if any. */
  pending: Tier | null = null;

  constructor(public tier: Tier = 'normal') {}

  /** Record one displayed-frame interval during warmed active playback. */
  record(intervalMs: number, nowMs: number): void {
    if (this.tier === 'static') return;
    if (this.windowStart === null) this.windowStart = nowMs;
    this.samples.push(intervalMs);
    if (nowMs - this.windowStart < WINDOW_MS) return;

    const p95 = percentile(this.samples, 95);
    this.samples = [];
    this.windowStart = nowMs;
    const limit = this.tier === 'low' ? STATIC_THRESHOLD_MS : DROP_THRESHOLD_MS;
    this.strikes = p95 > limit ? this.strikes + 1 : 0;
    if (this.strikes >= 2) {
      this.strikes = 0;
      this.pending = this.tier === 'high' ? 'normal' : this.tier === 'normal' ? 'low' : 'static';
    }
  }

  /** Playback stopped: discard the partial window so idle gaps never count. */
  pause(): void {
    this.samples = [];
    this.windowStart = null;
  }

  /** Apply a pending drop at a safe point; returns the new tier or null. */
  applyPending(): Tier | null {
    if (!this.pending) return null;
    this.tier = this.pending;
    this.pending = null;
    this.pause();
    return this.tier;
  }
}
