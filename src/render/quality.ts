/**
 * Adaptive quality (Master §9). Camera, silhouette, motion timing and status are identical
 * across tiers. Start at Normal; drop one tier at the next safe point when the p95 active
 * frame interval exceeds 25 ms over two consecutive 1 s windows; from Low, exceeding 34 ms
 * over two windows completes the current intent in Static. Never auto-upgrade mid-session.
 *
 * v1.5 (the judges' measurement): Normal renders at up to 2 device pixels per CSS pixel. At 1.5
 * the phone's 3× screen showed every edge, the stand's grooves, the flames and the prints upscaled
 * 2× next to crisp UI. Before any tier drop, Normal and High have one cheaper step: the pixel ratio
 * falls to REDUCED_DPR (the v1.4 cap) when the p95 interval exceeds DPR_DROP_MS (a 60 Hz display
 * missing frames) over two consecutive windows. Like every drop it waits for a safe point (never
 * mid-sequence) and is never undone automatically (only setQualityTier resets it), so it cannot
 * oscillate; the tier ladder (25 ms, 34 ms) starts once it has been taken.
 */

export type Tier = 'high' | 'normal' | 'low' | 'static';

export const TIER_DPR: Record<Tier, number> = { high: 2, normal: 2, low: 1, static: 1 };
/** Normal's (and High's) one pixel-ratio step down, before any tier drop. */
export const REDUCED_DPR = 1.5;
/** p95 active frame interval (ms) above which the pixel ratio steps down (two consecutive windows). */
export const DPR_DROP_MS = 20;
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
  private dprStrikes = 0;
  /** Tier requested at the next safe point, if any. */
  pending: Tier | null = null;
  /** The pixel-ratio step down has been taken (REDUCED_DPR), or is requested at the next safe point. */
  reducedDpr = false;
  pendingDpr = false;

  constructor(public tier: Tier = 'normal') {}

  /** Device-pixel cap for the renderer: the tier's, or REDUCED_DPR once the step down is taken. */
  get dprCap(): number {
    return this.reducedDpr ? Math.min(TIER_DPR[this.tier], REDUCED_DPR) : TIER_DPR[this.tier];
  }

  /** Whether the pixel-ratio step is still ahead of the tier ladder (Normal and High only). */
  private dprStepAhead(): boolean {
    return (this.tier === 'normal' || this.tier === 'high') && (!this.reducedDpr || this.pendingDpr);
  }

  /** Record one displayed-frame interval during warmed active playback. */
  record(intervalMs: number, nowMs: number): void {
    if (this.tier === 'static') return;
    if (this.windowStart === null) this.windowStart = nowMs;
    this.samples.push(intervalMs);
    if (nowMs - this.windowStart < WINDOW_MS) return;

    const p95 = percentile(this.samples, 95);
    this.samples = [];
    this.windowStart = nowMs;
    if (this.dprStepAhead()) {
      // The cheaper step first; the tier ladder waits until it has been applied.
      if (this.pendingDpr) return;
      this.dprStrikes = p95 > DPR_DROP_MS ? this.dprStrikes + 1 : 0;
      if (this.dprStrikes >= 2) {
        this.dprStrikes = 0;
        this.pendingDpr = true;
      }
      return;
    }
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

  /** Apply a pending pixel-ratio step at a safe point; returns whether one was applied. */
  applyPendingDpr(): boolean {
    if (!this.pendingDpr) return false;
    this.pendingDpr = false;
    this.reducedDpr = true;
    this.pause();
    return true;
  }

  /** An explicit tier choice (the host's setQualityTier) starts again at the tier's own pixel ratio. */
  resetDpr(): void {
    this.reducedDpr = this.pendingDpr = false;
    this.dprStrikes = 0;
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
