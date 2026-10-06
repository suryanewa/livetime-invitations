import { declinePull } from './framing.ts';

/**
 * v1.7: a camera channel's homecoming. A scene's second camera channel (`SceneInstance.closeUp` and
 * `frameClose`: Dinner's close-up on the card, #42; Sports' push-in on the bank, the polish round)
 * comes home on a change of mind on its own C1 curve, as the decline's camera does on the way back
 * (Dinner's `rewindPull`): it leaves at the speed it had (no velocity jump), lands at rest on 0
 * (zero speed and acceleration), and is no faster than the decline's own dolly at its top speed
 * (PULL_TOP_SPEED, 3.4/s): from 1 at rest, 0.56 s.
 *
 * Moved here from `src/scenes/dinner/pull.ts` (which re-exports it) so both scenes share one
 * mechanism; the code is unchanged.
 */

/** declinePull's rate (1/s) at decline time t. */
export const pullRate = (t: number) => (declinePull(t + 1e-4) - declinePull(t - 1e-4)) / 2e-4;
/** The decline's dolly at its top speed (1/s). */
export const PULL_TOP_SPEED = (() => {
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
/** The camera's rewind at u ∈ [0, 1]: from p0 (leaving at m0 per unit u) to 0, landing at rest. */
export const rewindCurve = (u: number, p0: number, m0: number, hold: number) => p0 * (1 - home(u, hold)) + m0 * u * (1 - u) * (1 - u);
/** Samples a homecoming is checked at. */
export const HOME_SAMPLES = 240;

/** A channel's homecoming: from c0, leaving at v0 (1/s), over span (s). */
export interface CloseHome {
  c0: number;
  v0: number;
  span: number;
}
/** The shortest and longest homecoming (s). */
export const CLOSE_HOME = { min: 0.2, max: 0.7 } as const;
/** Plan the homecoming from the channel's value c0 and rate v0 at the cut (null: it is home already). */
export function planCloseHome(c0: number, v0: number): CloseHome | null {
  if (c0 <= 1e-6 && Math.abs(v0) <= 1e-6) return null;
  const top = PULL_TOP_SPEED * 1.0001;
  for (let span = CLOSE_HOME.min; span < CLOSE_HOME.max; span += 0.01) {
    let ok = true, prev = c0;
    for (let i = 1; i <= HOME_SAMPLES && ok; i++) {
      const p = homeCurve(i / HOME_SAMPLES, c0, v0 * span);
      ok = Math.abs(p - prev) / (span / HOME_SAMPLES) <= top;
      prev = p;
    }
    if (ok) return { c0, v0, span: Math.round(span * 100) / 100 };
  }
  return { c0, v0, span: CLOSE_HOME.max };
}
/** The homecoming at u ∈ [0, 1]: from c0 leaving at m0 (per unit u) to 0, a smootherstep landing. */
const homeCurve = (u: number, c0: number, m0: number) => rewindCurve(u, c0, m0, 0);
/** The channel `t` s into the change (0 from the span on), clamped to [0, 1]. */
export function closeHome(h: CloseHome | null, t: number): number {
  if (!h || t >= h.span) return 0;
  if (t <= 0) return Math.min(1, Math.max(0, h.c0));
  return Math.min(1, Math.max(0, homeCurve(t / h.span, h.c0, h.v0 * h.span)));
}
