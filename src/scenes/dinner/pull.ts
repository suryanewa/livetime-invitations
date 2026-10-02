import type { SequenceName } from '../../core/types.ts';
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
