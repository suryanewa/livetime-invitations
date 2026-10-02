import { CANDLE_COUNT } from '../../../models/birthdayContract.ts';

/**
 * v1.5 (edit #6, "Candles and cake should subtly melt"): the melt as pure functions of how long a
 * candle has been lit. Shared contract between the cake (wax, frosting: models/cakeShaders.ts) and
 * the fire (flame height, wick: the fire owner reads `candleShortening` to lower the flame base).
 *
 * Time. `tLit` is on-screen seconds a candle has burnt at full flame, already weighted by its
 * flame's size (sequences.ts `litTime` integrates `flameScale`, so a flame drives the melt in
 * proportion to its height), plus the live seconds it has burnt at rest (BirthdayScene.simulate).
 * Real paraffin birthday candles (≈ 8 mm twisted, ≈ 11 min to burn 5 cm, 0.07 mm/s): a pool
 * across the top within ≈ 10 s, the first run down the low side after 20–40 s. The clip cannot
 * wait half a minute, so the melt is shown MELT_TIME_SCALE = 7.5 times faster than real: a run
 * starts 2.9–5.1 s into a guest's look at the lit cake and has nearly stopped by ≈ 12 s. The
 * authored host clip alone (≤ 0.4 s lit) only softens the rims a little; the canonical poses
 * (posters, reduced motion) stay nearly fresh.
 *
 * Cap. Everything is a saturating function, and nothing changes after MELT_CAP on-screen seconds
 * (150 s of real burning): a lit cake left open never turns grotesque. After the blow `tLit`
 * stops growing, so the melt freezes where it is.
 */

/** Real seconds of burning shown per on-screen lit second (real runs form at 20–40 s). */
export const MELT_TIME_SCALE = 7.5;
/** On-screen lit seconds after which the melt is complete and constant (150 s of real burning). */
export const MELT_CAP = 20;

/** Scene units per millimetre (1 unit = 20 cm). */
const MM = 0.005;

/**
 * Per candle (left to right), fixed: when the first run leaves the rim (real seconds, within the
 * 20–40 s a real run takes; earlier on the candles that lean more, since the pool spills over the
 * low side first: poses.ts CANDLE_LEAN) and how far it gets (mm). The run goes down the low side.
 */
export const MELT_CANDLE = [
  { runAt: 22, runLength: 16.0 },
  { runAt: 31, runLength: 12.5 },
  { runAt: 36, runLength: 10.0 },
  { runAt: 28, runLength: 14.0 },
  { runAt: 24, runLength: 15.5 },
  { runAt: 38, runLength: 9.5 },
] as const;

export interface MeltState {
  /** Real seconds of burning this state shows. */
  burn: number;
  /** Lip rounding, 0–1 (the hard shoulder softens into a ≈ 0.9 mm fillet). */
  round: number;
  /** The twist's ridges relaxing near the top, 0–1. */
  soften: number;
  /** Molten pool across the top, 0–1 (a shallow glossy cup around the wick). */
  pool: number;
  /** The pool overfilling into a bead on the low side, 0–1. */
  bead: number;
  /** Length of the run down the low side (scene units; 0 before it leaves the rim). */
  run: number;
  /** How far the top has burnt down (scene units; ≤ 0.8 mm). */
  shorten: number;
  /** The frosting just around the socket glossing and softening, 0–1. */
  gloss: number;
}

export function newMeltState(): MeltState {
  return { burn: 0, round: 0, soften: 0, pool: 0, bead: 0, run: 0, shorten: 0, gloss: 0 };
}

const sat = (x: number, tau: number) => 1 - Math.exp(-Math.max(0, x) / tau);
const step = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Burn rate of the top (mm per real second) and the most it shows (mm: "by a hair"). */
export const SHORTEN = { rate: 0.07, cap: 0.8 } as const;

/** The melt of candle `candle` (0–5) after `tLit` on-screen seconds lit (pure; capped). */
export function meltState(candle: number, tLit: number, out: MeltState = newMeltState()): MeltState {
  const c = MELT_CANDLE[Math.min(Math.max(candle, 0), CANDLE_COUNT - 1)]!;
  const burn = Math.min(Math.max(tLit, 0), MELT_CAP) * MELT_TIME_SCALE;
  out.burn = burn;
  out.round = sat(burn, 10);
  out.soften = sat(burn, 25);
  out.pool = step(1.5, 12, burn);
  out.bead = step(10, c.runAt, burn);
  // A run leaves fast and slows as it cools: 63 % of its length in its first 14 s.
  out.run = burn > c.runAt ? c.runLength * MM * sat(burn - c.runAt, 14) : 0;
  out.shorten = SHORTEN.cap * MM * sat(burn, SHORTEN.cap / SHORTEN.rate);
  out.gloss = sat(burn, 45);
  return out;
}

/** How far candle `candle`'s top (wick and flame base) has burnt down after `tLit` (scene units). */
export function candleShortening(candle: number, tLit: number): number {
  return meltState(candle, tLit).shorten;
}

/** One number for "how melted" (0 fresh – 1 complete): the mean of the visible stages. */
export function meltAmount(candle: number, tLit: number): number {
  const m = meltState(candle, tLit);
  const c = MELT_CANDLE[Math.min(Math.max(candle, 0), CANDLE_COUNT - 1)]!;
  return (m.round + m.pool + m.bead + m.run / (c.runLength * MM) + m.gloss) / 5;
}

/**
 * After the flame goes out the molten wax sets (v1.5 polish): paraffin's pool and run go from a
 * clear, glossy liquid to opaque, satin solid in 10–30 s of real time; on the same 7.5× clock
 * that is 1.3–4 s on screen. 0 liquid – 1 set, from seconds since the flame went out.
 */
export function solidify(tCool: number): number {
  return step(0, SET_REAL, Math.max(0, tCool) * MELT_TIME_SCALE);
}

/** Real seconds the wax takes to set (paraffin: 10–30 s), and the same on screen (≈ 2.9 s). */
const SET_REAL = 22;
export const SET_AFTER = SET_REAL / MELT_TIME_SCALE;
