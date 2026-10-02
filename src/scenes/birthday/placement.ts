import { CANDLE, CANDLE_COUNT, CANDLE_HOVER } from '../../../models/birthdayContract.ts';
import { mulberry32 } from '../../motion/random.ts';

/**
 * v1.5 candle placement (edit #5, "candles must actually interact with the cake as they would in
 * real life as they're placed"; v1.5 polish after the motion review): the timeline every other part
 * of the Birthday host beat keys on (poses.ts re-exports it; fire.ts lights the wicks after it).
 *
 * A person placing six candles: each is lowered from CANDLE_HOVER (6 cm) by a careful hand, a
 * minimum-jerk speed bell peaking at ≈ 11–12 cm/s that has slowed to a steady 5 cm/s when the base
 * meets the buttercream (C² from rest: no jolt; acceleration 0 at contact). Then it is pushed
 * 10 mm in (CANDLE.insert, as real candles stand in buttercream). Buttercream is viscoplastic: the
 * surface yields first (a short dip in speed as the skin breaks) and then its drag grows with the
 * length of candle in it, so the candle keeps slowing, harder the deeper it goes, until the hand
 * stops pushing at the seat (no rebound: frosting does not spring back). The hands are not a
 * metronome: the gaps between candles (60–115 ms) and each approach (0.60–0.74 s) are seeded.
 */

const rand = mulberry32(0xca4d1e);

/** When each candle starts down (s): seeded gaps of 60–115 ms, left to right. */
export const CANDLE_START: readonly number[] = (() => {
  let t = 0.16;
  return Array.from({ length: CANDLE_COUNT }, () => {
    const s = t;
    t += 0.06 + 0.055 * rand();
    return s;
  });
})();

/** Each candle's approach, rest to contact (s). */
export const CANDLE_DESCENTS: readonly number[] = Array.from({ length: CANDLE_COUNT }, () => 0.6 + 0.14 * rand());

/** Speed (units/s) the hand has slowed to when the base meets the buttercream: 5 cm/s. */
export const CANDLE_CONTACT_SPEED = 0.25;

/** The skin's yield: the speed dips by up to this fraction over the first 18 % of the push. */
export const PRESS_YIELD = 0.35;

/** Speed profile of the push (fraction of the contact speed) at u ∈ [0, 1] of its duration. */
export function pressSpeed(u: number): number {
  const t = Math.min(1, Math.max(0, u / 0.18));
  const s = t * t * (3 - 2 * t);
  return (1 - u * u) * (1 - PRESS_YIELD * s);
}

/** ∫ pressSpeed tabulated (Simpson, 1/2000), sampled with Hermite tangents = pressSpeed: C1. */
const PRESS_N = 2000;
const PRESS_TABLE = (() => {
  const acc = new Float64Array(PRESS_N + 1);
  for (let k = 0; k < PRESS_N; k++) {
    const a = k / PRESS_N, h = 1 / PRESS_N;
    acc[k + 1] = acc[k]! + (h / 6) * (pressSpeed(a) + 4 * pressSpeed(a + h / 2) + pressSpeed(a + h));
  }
  return acc;
})();

/** ∫₀ᵘ pressSpeed (the push's progress in units of contact speed × duration). */
export function pressProgress(u: number): number {
  const x = Math.min(Math.max(u, 0), 1) * PRESS_N;
  const k = Math.min(Math.floor(x), PRESS_N - 1), v = x - k, h = 1 / PRESS_N;
  const v2 = v * v, v3 = v2 * v;
  return (2 * v3 - 3 * v2 + 1) * PRESS_TABLE[k]! + (v3 - 2 * v2 + v) * pressSpeed(k * h) * h + (-2 * v3 + 3 * v2) * PRESS_TABLE[k + 1]! + (v3 - v2) * pressSpeed((k + 1) * h) * h;
}

/** Push-in time: the 10 mm insertion at the contact speed shaped by pressSpeed (≈ 0.43 s). */
export const CANDLE_PRESS = CANDLE.insert / (CANDLE_CONTACT_SPEED * PRESS_TABLE[PRESS_N]!);

/** Each candle seated exactly at its socket from here on. */
export const CANDLE_SEATED: readonly number[] = CANDLE_START.map((s, i) => s + CANDLE_DESCENTS[i]! + CANDLE_PRESS);

/** The first wick is lit this long after the last candle is in (a hand reaching for the lighter). */
export const LIGHT_FROM = Math.max(...CANDLE_SEATED) + 0.12;

/** Quintic Hermite on u ∈ [0, 1]: value p0 (rest: no speed, no acceleration) to p1 at speed v1 (per unit u), acceleration 0. */
function approach(u: number, p0: number, p1: number, v1: number): number {
  const u3 = u * u * u, u4 = u3 * u, u5 = u4 * u;
  const h0 = 1 - 10 * u3 + 15 * u4 - 6 * u5;
  const h3 = 10 * u3 - 15 * u4 + 6 * u5;
  const h4 = -4 * u3 + 7 * u4 - 3 * u5;
  return p0 * h0 + p1 * h3 + v1 * h4;
}

/**
 * Height of candle i above its seat, `tau` seconds after it starts down. Approach: the C² bell from
 * rest at CANDLE_HOVER to contact (the base at the surface, CANDLE.insert above the seat) at the
 * contact speed with zero acceleration; push: the viscoplastic profile to the seat.
 */
export function candleDrop(tau: number, i = 0): number {
  if (tau <= 0) return CANDLE_HOVER;
  const T = CANDLE_DESCENTS[i]!;
  if (tau < T) return approach(tau / T, CANDLE_HOVER, CANDLE.insert, -CANDLE_CONTACT_SPEED * T);
  const s = tau - T;
  if (s >= CANDLE_PRESS) return 0;
  return CANDLE.insert - CANDLE_CONTACT_SPEED * CANDLE_PRESS * pressProgress(s / CANDLE_PRESS);
}

/** How far a candle at `drop` above its seat has been pushed in (0 at the surface or above – 1 seated). */
export const pressOf = (drop: number) => Math.min(1, Math.max(0, 1 - drop / CANDLE.insert));

/**
 * The push on the cake from candle i at time t (host), as a fraction of a full push: the skin's
 * yield, then the drag growing with depth; it goes as the hand lets go.
 */
export function push(i: number, t: number, release = 0.06): number {
  const contact = CANDLE_START[i]! + CANDLE_DESCENTS[i]!, end = contact + CANDLE_PRESS;
  if (t <= contact) return 0;
  const sm = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
  if (t < end) {
    const u = (t - contact) / CANDLE_PRESS;
    return 0.35 * sm(u / 0.12) + 0.65 * u;
  }
  return 1 - sm((t - end) / release);
}
