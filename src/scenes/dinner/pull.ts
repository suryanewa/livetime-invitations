import type { SequenceName } from '../../core/types.ts';
import { cubicBezier } from '../../motion/curves.ts';
import { declinePull } from '../../render/framing.ts';
import { type AnswerChange, changeTime, REWIND } from './sequences.ts';

/**
 * v1.5 decline pull-back (src/render/framing.ts DECLINE_PULL): where the camera is between the
 * rest fit (0) and the decline fit (1), from what the scene shows: its sequence, its time and the
 * change of mind in progress. A pure function of them, so replay-safe and deterministic.
 *
 * - The decline: the shared curve on the decline's clock; the bin, BIN_DELAY behind the camera,
 *   glides into the room it makes. Declined: 1. Every other pose and sequence: 0.
 * - Accept → decline (the reveal rewinds, the bin comes in on its own clock `start` ahead of the
 *   dish): the camera follows the bin's clock, whose rate steps from 1 to the decline's k at the end
 *   of the rewind; the camera's clock takes that step over ±RATE_BLEND (C1), a hair ahead of the bin.
 * - Decline → accept (the decline rewinds): the camera has its own C1 rewind (`rewindPull`) rather
 *   than riding the scene's rewind clock, which is paced by arc length and so changes speed where a
 *   part starts or stops (the bin's entrance starts at speed, off-frame): measured, up to 2.5 % of
 *   zoom per frame between consecutive frames. Its own curve is never tighter than the decline was
 *   at the same scene state, so the dish and the bin are framed at least as the decline framed them,
 *   and it may trail the scene's rewind into the accept's first beat, as it led the bin out.
 */
export function dinnerPull(shown: { seq: SequenceName; t: number } | null, change: AnswerChange | null): number {
  if (!shown) return 0;
  if (change && shown.seq === change.next) {
    if (change.from === 'decline' && change.next === 'accept') return rewindPull(change, shown.t);
    const [seq, s] = changeTime(change, shown.t);
    if (change.next === 'decline' && change.from !== 'decline') return declinePull(cameraClock(change, shown.t));
    // A change back to the decline being shown: it plays on from where it is.
    return seq === 'decline' ? declinePull(s) : 0;
  }
  return shown.seq === 'decline' ? declinePull(shown.t) : 0;
}

/** Half-width (s) of the C1 blend of the camera's clock from the rewind's rate (1) to the decline's (k). */
export const RATE_BLEND = 0.05;

/**
 * Accept → decline: the bin's clock as sampleAnswerChange runs it (t − (rewind − start) during the
 * reveal's rewind, then start + (t − rewind)·k), its rate step at the rewind's end rounded over
 * ±RATE_BLEND by a quadratic ramp (C1; at most (k − 1)·RATE_BLEND / 4 ahead of the bin).
 */
export function cameraClock(c: AnswerChange, t: number): number {
  const x = t - c.rewind, w = RATE_BLEND;
  const q = x <= -w ? 0 : x >= w ? x : ((x + w) * (x + w)) / (4 * w);
  return c.start + x + (c.k - 1) * q;
}

/** declinePull's rate (1/s) at decline time t, and its peak (the dolly's top speed). */
const pullRate = (t: number) => (declinePull(t + 1e-4) - declinePull(t - 1e-4)) / 2e-4;
const PULL_TOP_SPEED = (() => {
  let v = 0;
  for (let t = 0; t <= 1; t += 1 / 2000) v = Math.max(v, pullRate(t));
  return v;
})();
/**
 * The move home: held for the first `hold` of the span, then a smootherstep (zero speed and zero
 * acceleration at both ends: it lands as softly as it starts).
 */
const home = (u: number, hold: number) => {
  const x = Math.min(1, Math.max(0, (u - hold) / (1 - hold)));
  return x * x * x * (x * (6 * x - 15) + 10);
};
/** The camera's rewind at u ∈ [0, 1]: from p0 (leaving at the decline's own pull speed, m0 per unit u) to 0, landing at rest. */
const rewindCurve = (u: number, p0: number, m0: number, hold: number) => p0 * (1 - home(u, hold)) + m0 * u * (1 - u) * (1 - u);

/** The holds (fraction of the span) and the tails (s past the scene's rewind) tried, earliest and shortest first. */
const SHAPES = Array.from({ length: 29 }, (_, i) => i * 0.025);
const TAILS = Array.from({ length: 41 }, (_, i) => i * 0.01);
const N = 240;
const planOf = new WeakMap<AnswerChange, { span: number; hold: number; p0: number; v0: number }>();

/**
 * Decline → accept: the camera comes back in on its own C1 curve. It leaves the interrupted pull
 * at the decline's own pull speed (no velocity jump), holds while the dish and the bin still need
 * the room, and comes home on a smootherstep, landing on the rest fit at rest (zero speed, zero
 * acceleration). Constraints,
 * solved once per change (the shortest tail, then the shortest hold): never tighter than the
 * decline was at the same scene state (the bin leaves and the dish comes down inside a frame at
 * least that wide: the mirror of the camera leading the bin in), and no faster than the rewind
 * paces every part (REWIND.pace × the dolly's own top speed). The scene's rewind skips the
 * decline's still first BIN_DELAY (nothing but the camera moved), so it ends as the bin leaves the
 * frame, where the decline's camera was still at 0.28: the camera may then run on for a `tail`
 * (≤ 0.4 s, measured ≤ 0.2 s) into the accept's first beat (its cover tips on the plate, well inside
 * the rest fit), as it trailed in on the way out.
 */
export function rewindPull(c: AnswerChange, t: number): number {
  const plan = planOf.get(c) ?? planCameraRewind(c);
  if (t >= plan.span) return 0;
  return Math.max(0, rewindCurve(t / plan.span, plan.p0, plan.v0 * plan.span, plan.hold));
}

function planCameraRewind(c: AnswerChange): { span: number; hold: number; p0: number; v0: number } {
  const p0 = declinePull(c.at), v0 = c.rate * pullRate(c.at);
  const R = c.rewind;
  // The decline's pull at the scene state shown, on a fine grid of the scene's rewind.
  const dt = 1 / 960;
  const need = Array.from({ length: Math.ceil(R / dt) + 1 }, (_, i) => {
    const [seq, s] = changeTime(c, Math.min(i * dt, R - 1e-9));
    return seq === 'decline' ? declinePull(s) : 0;
  });
  const needAt = (t: number) => (t >= R ? 0 : need[Math.min(need.length - 1, Math.round(t / dt))]!);
  const top = REWIND.pace * PULL_TOP_SPEED;
  let found: { span: number; hold: number; p0: number; v0: number } | null = null;
  for (const tail of TAILS) {
    const span = R + tail;
    for (const hold of SHAPES) {
      let ok = true, prev = p0;
      for (let i = 1; i <= N && ok; i++) {
        const u = i / N, p = rewindCurve(u, p0, v0 * span, hold);
        ok = p >= needAt(u * span) - 1e-3 && Math.abs(p - prev) / (span / N) <= top;
        prev = p;
      }
      if (ok) { found = { span, hold, p0, v0 }; break; }
    }
    if (found) break;
  }
  const plan = found ?? { span: R + TAILS[TAILS.length - 1]!, hold: SHAPES[SHAPES.length - 1]!, p0, v0 };
  planOf.set(c, plan);
  return plan;
}

// ── v1.7 (spec revision #42, pending Surya): the close-up on the card ─────────────────────────────

/**
 * The close-up channel (0 the rest view, 1 the card head-on; src/render/camera.ts `closeUpView`) on
 * the reveal's own clock τ (the steam's: the accept's time, running on past its 1.5 s in
 * `simulate`). It sets off as the cloud's last tatters thin out (τ 2.4 s; the cloud is gone by
 * 2.8 s, the steam's CLOUD.release + life) and arrives as the veil's last wisps cross the card
 * (4.4 s, where the plate stops steaming, VEIL.end): the guest sees the steam clear, then the
 * camera rises over the plate and turns down to read the card. The accepted pose *is* the close-up
 * (1): reduced motion, a saved accept and the poster.
 *
 * v1.7 polish (the judge's constant, tested in place): from 2.4 s, not 2.8 s. The still hold after
 * the reveal shortens by 0.4 s and the 2.0 s move turns the line of sight at ≤ 66°/s (was 83°/s
 * over 1.6 s); it lands at the same 4.4 s (earlier, at 3.6 s, the veil still clouds the title).
 */
export const CLOSE = { from: 2.4, to: 4.4 } as const;
/**
 * The move's ease: zero speed at both ends (C1 with the still camera before and after), a gathered
 * start and a slightly longer settle than its rise, so the card lands softly under the eye:
 * cubic-bezier(0.4, 0, 0.4, 1), half-way at 0.43 of the move, peak speed 2.04 × the mean (1.28
 * close/s at 0.39). (Measured against (0.45, 0, 0.25, 1) 2.63 ×, (0.3, 0, 0.3, 1) 2.18 ×, the
 * symmetric (0.42, 0, 0.58, 1) 1.72 ×.)
 */
export const CLOSE_EASE = cubicBezier(0.4, 0, 0.4, 1);
/** The close channel at reveal time τ: 0 to CLOSE.from, 1 from CLOSE.to. */
export function closeIn(tau: number): number {
  const u = (tau - CLOSE.from) / (CLOSE.to - CLOSE.from);
  return u <= 0 ? 0 : u >= 1 ? 1 : CLOSE_EASE(u);
}
/** closeIn's rate (1/s) at τ. */
export const closeRate = (tau: number) => (closeIn(tau + 1e-4) - closeIn(tau - 1e-4)) / 2e-4;

/**
 * A change of mind away from the close-up: the channel comes home on its own C1 curve (as the
 * decline's camera does on the way back, `rewindPull`): it leaves at the speed it had (no velocity
 * jump), lands at rest on 0 (zero speed and acceleration), and is no faster than the decline's own
 * dolly at its top speed (PULL_TOP_SPEED, 3.4/s): from the close-up at rest, 0.56 s. The decline's
 * bin waits for it (planAnswerChange's `closeHome`): its pull may start BIN_DELAY before the camera
 * is home, so the two moves meet in one outward motion, and the bin enters only once it is.
 */
export interface CloseHome {
  c0: number;
  v0: number;
  span: number;
}
/** The shortest and longest homecoming (s). */
export const CLOSE_HOME = { min: 0.2, max: 0.7 } as const;
export function planCloseHome(c0: number, v0: number): CloseHome | null {
  if (c0 <= 1e-6 && Math.abs(v0) <= 1e-6) return null;
  const top = PULL_TOP_SPEED * 1.0001;
  for (let span = CLOSE_HOME.min; span < CLOSE_HOME.max; span += 0.01) {
    let ok = true, prev = c0;
    for (let i = 1; i <= N && ok; i++) {
      const p = homeCurve(i / N, c0, v0 * span);
      ok = Math.abs(p - prev) / (span / N) <= top;
      prev = p;
    }
    if (ok) return { c0, v0, span: Math.round(span * 100) / 100 };
  }
  return { c0, v0, span: CLOSE_HOME.max };
}
/** The homecoming at u ∈ [0, 1]: from c0 leaving at m0 (per unit u) to 0, a smootherstep landing. */
const homeCurve = (u: number, c0: number, m0: number) => rewindCurve(u, c0, m0, 0);
/**
 * v1.7 polish: the close channel at which the camera has left the close-up. On a change of mind
 * the cover's return waits until the homecoming is at or under it for good (`closeClearAt`), so
 * the mirror dome never sweeps across the card while the camera is still near it.
 */
export const CLOSE_CLEAR = 0.3;
/** The time (s) after which the homecoming stays at or under CLOSE_CLEAR (0 when it already is). */
export function closeClearAt(h: CloseHome | null): number {
  if (!h) return 0;
  const dt = 1 / 960;
  let last = -1;
  for (let i = 0; i * dt < h.span; i++) if (closeHome(h, i * dt) > CLOSE_CLEAR) last = i;
  return last < 0 ? 0 : Math.min(h.span, (last + 1) * dt);
}
/** The close channel `t` s into the change (0 from the span on), clamped to [0, 1]. */
export function closeHome(h: CloseHome | null, t: number): number {
  if (!h || t >= h.span) return 0;
  if (t <= 0) return Math.min(1, Math.max(0, h.c0));
  return Math.min(1, Math.max(0, homeCurve(t / h.span, h.c0, h.v0 * h.span)));
}
