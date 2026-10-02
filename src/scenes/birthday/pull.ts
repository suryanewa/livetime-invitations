import type { SequenceName } from '../../core/types.ts';
import { declinePull } from '../../render/framing.ts';
import { type AnswerChange, changeTime, REWIND } from './change.ts';

/**
 * v1.5 decline pull-back (src/render/framing.ts DECLINE_PULL) for Birthday: where the camera is
 * between the rest fit (0) and the decline fit (1), from what the scene shows (its sequence, its
 * time) and the change of mind in progress. Pure, so replay-safe and deterministic. As Dinner's
 * (src/scenes/dinner/pull.ts), whose reasoning this follows:
 *
 * - The decline: the shared curve on the decline's clock (the bin waits BIN_DELAY for it).
 *   Declined: 1. Every other pose and sequence: 0.
 * - Declined → accept (the decline rewinds, change.ts): the camera has its own C1 rewind rather
 *   than riding the scene's rewind clock, which is paced by arc length and so changes speed where a
 *   part starts or stops. It leaves the interrupted pull at its own speed, is never tighter than the
 *   decline was at the same scene state (the cake and the bin framed at least as the decline framed
 *   them), comes home on a smootherstep, and may trail the scene's rewind into the accept, as it led
 *   the bin in on the way out.
 * - A change back to the decline being rewound: it plays on from where it is.
 */
export function birthdayPull(shown: { seq: SequenceName; t: number } | null, change: AnswerChange | null): number {
  if (!shown) return 0;
  if (change && shown.seq === change.next) {
    if (change.from === 'decline' && change.next === 'accept') return rewindPull(change, shown.t);
    const [seq, s] = changeTime(change, shown.t);
    return seq === 'decline' ? declinePull(s) : 0;
  }
  return shown.seq === 'decline' ? declinePull(shown.t) : 0;
}

/** declinePull's rate (1/s) at decline time t, and its peak (the dolly's top speed). */
const pullRate = (t: number) => (declinePull(t + 1e-4) - declinePull(t - 1e-4)) / 2e-4;
export const PULL_TOP_SPEED = (() => {
  let v = 0;
  for (let t = 0; t <= 1; t += 1 / 2000) v = Math.max(v, pullRate(t));
  return v;
})();
/** The move home: held for the first `hold` of the span, then a smootherstep (lands at rest). */
const home = (u: number, hold: number) => {
  const x = Math.min(1, Math.max(0, (u - hold) / (1 - hold)));
  return x * x * x * (x * (6 * x - 15) + 10);
};
/** The camera's rewind at u ∈ [0, 1]: from p0 (leaving at the decline's own pull speed, m0 per unit u) to 0. */
const rewindCurve = (u: number, p0: number, m0: number, hold: number) => p0 * (1 - home(u, hold)) + m0 * u * (1 - u) * (1 - u);

const SHAPES = Array.from({ length: 29 }, (_, i) => i * 0.025);
const TAILS = Array.from({ length: 41 }, (_, i) => i * 0.01);
const N = 240;
const planOf = new WeakMap<AnswerChange, { span: number; hold: number; p0: number; v0: number }>();

/** Declined → accept: the camera's own return (the shortest tail, then the shortest hold, that keeps the constraints above). */
export function rewindPull(c: AnswerChange, t: number): number {
  const plan = planOf.get(c) ?? planCameraRewind(c);
  if (t >= plan.span) return 0;
  return Math.max(0, rewindCurve(t / plan.span, plan.p0, plan.v0 * plan.span, plan.hold));
}

/** The span (s) the camera takes to come home after a change (≥ the scene's rewind). */
export function cameraSpan(c: AnswerChange): number {
  return (planOf.get(c) ?? planCameraRewind(c)).span;
}

function planCameraRewind(c: AnswerChange): { span: number; hold: number; p0: number; v0: number } {
  const p0 = declinePull(c.at), v0 = c.rate * pullRate(c.at);
  const R = c.rewind;
  const dt = 1 / 960;
  const need = Array.from({ length: Math.ceil(R / dt) + 1 }, (_, i) => {
    const [seq, s] = changeTime(c, Math.min(i * dt, R - 1e-9));
    return seq === 'decline' ? declinePull(s) : 0;
  });
  const needAt = (t: number) => (t >= R ? 0 : need[Math.min(need.length - 1, Math.round(t / dt))]!);
  const top = REWIND.pace * PULL_TOP_SPEED;
  // The scene's state just before its rewind ends (the grid's last sample is already past it).
  const endAt = R - 1e-4;
  const [endSeq, endS] = changeTime(c, endAt);
  const endNeed = endSeq === 'decline' ? declinePull(endS) : 0;
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
      // And the instant before the scene's rewind ends, which the samples can step over: its
      // last part can be quick (the bin's entrance comes in already moving: models/disposalBin.ts
      // BIN_ENTRANCE), and the decline's pull is still high there.
      ok = ok && rewindCurve(endAt / span, p0, v0 * span, hold) >= endNeed - 1e-3;
      if (ok) { found = { span, hold, p0, v0 }; break; }
    }
    if (found) break;
  }
  const plan = found ?? { span: R + TAILS[TAILS.length - 1]!, hold: SHAPES[SHAPES.length - 1]!, p0, v0 };
  planOf.set(c, plan);
  return plan;
}
