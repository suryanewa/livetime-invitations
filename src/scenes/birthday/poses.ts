import { Vector3 } from 'three';
import { BIN_POS, BIN_START, CANDLE_COUNT, CANDLE_HOVER, CARRY_HEIGHT, IN_BIN, LEAN_MAX, RIM_CLEARANCE, STAND_TOP } from '../../../models/birthdayContract.ts';
import { BIN, GRAVITY } from '../../../models/disposalBin.ts';

/**
 * Birthday canonical poses and path keys (Birthday sub-spec, v1.2 on the cake master). Cake
 * positions are the cake_authored origin (the cake's underside centre) in birthday_root space.
 * Candle arrays are indexed candle_01 … candle_06, left to right on screen.
 */

export const DURATIONS = { host: 1.3, accept: 1.4, decline: 1.5 } as const;

export { CANDLE_COUNT, CANDLE_HOVER, LEAN_MAX };

export const ON_STAND = new Vector3(0, STAND_TOP, 0);

/** Host presentation: the cake turns this far and settles square to the camera (0–0.20 s). */
export const PRESENT_YAW = -0.14;

const each = (f: (i: number) => number) => Array.from({ length: CANDLE_COUNT }, (_, i) => f(i));

/**
 * Candle placement (0.18–0.94 s): six candles in a cascade, 55 ms apart, left to right. Each
 * lowers for CANDLE_DESCENT on a weighted ease (from rest, accelerating, landing at
 * CANDLE_LAND_SPEED), then presses into the buttercream and settles on a damped spring.
 */
export const CANDLE_START = each((i) => 0.18 + 0.055 * i);
export const CANDLE_DESCENT = 0.3;
/** Landing speed (units/s) the descent hands to the settle: C1 at contact. */
export const CANDLE_LAND_SPEED = 0.35;
/** Settle spring: 6 Hz, ζ 0.5 (≈5 mm press, ≈1 mm rebound), faded to exact rest by CANDLE_SETTLE. */
export const CANDLE_SETTLE = { hz: 6, zeta: 0.5, length: 0.18 } as const;
/** End of each candle's placement: seated exactly at its socket from here on. */
export const CANDLE_SEATED = CANDLE_START.map((s) => s + CANDLE_DESCENT + CANDLE_SETTLE.length);

/** Flames rise once their candle has settled (0.84–1.06 s), 20 ms apart, no overshoot. */
export const FLAME_START = each((i) => 0.84 + 0.02 * i);
export const FLAME_RISE = 0.12;

/**
 * Breath: flames lean away from the camera and to the right; wicks follow a little. The sideways
 * part (z, in the picture plane) is what reads from the 20°/15° camera: the away part is
 * foreshortened. ≈ 31° at full breath, up to ≈ 46° as each flame dies.
 */
export const LEAN = { x: -0.45, z: -0.3 };
export const WICK_LEAN = 0.3;
/** The gust is not steady: each flame's lean flutters ±12 % at 7 Hz, out of phase with its neighbours. */
export const FLAME_FLUTTER = { amount: 0.12, hz: 7 } as const;
/** At full breath a flame is drawn out this much taller and this much thinner (scale per axis). */
export const FLAME_STRETCH = { tall: 0.22, thin: 0.15 } as const;

/** Extinguish windows, left to right (0.25–0.595 s), and one wisp each (0.60–0.99 s). */
export const OUT_START = each((i) => 0.25 + 0.044 * i);
export const OUT_LEN = 0.125;
export const WISP_START = each((i) => 0.6 + 0.018 * i);
export const WISP_LEN = 0.3;
export const WISP_OPACITY = 0.62;
/**
 * A wisp leaves the wick: its foot stays on the wick tip while the curl unfurls upward (its
 * height grows from WISP_GROW_FROM to full), and it only lifts off (WISP_RISE, cubic ease-in) as
 * it dissolves, so the smoke never floats detached above a candle while it is visible.
 */
export const WISP_RISE = 0.07;
export const WISP_GROW_FROM = 0.4;

/** Decline path keys. */
export const BIN_AT = BIN_POS;
export const BIN_FROM = BIN_START;
export const HOVER_OVER_BIN = new Vector3(BIN_POS.x, BIN.rimTop + RIM_CLEARANCE, BIN_POS.z);
/** Carry height of the cake's underside between the lift and the drop. */
export const CARRY = CARRY_HEIGHT;
export const DROPPED = IN_BIN;

/**
 * Decline beats (v1.5, the real 47 cm bin): the lift off the stand (0.22–0.58, up to CARRY
 * height, 32 cm), the carry across (0.39–0.76, overlapping the end of the lift) to rest over the
 * opening, then the release: the cake falls into the bin under gravity (BIN_DROP_G) and is below
 * the rim by 0.986 s, when the flaps start to close.
 */
export const CARRY_FROM = 0.22;
/** End of the lift off the stand (to CARRY height); the carry's gentle lowering to the rim follows. */
export const LIFT_TO = 0.58;
/** The carry across starts once the cake is well clear of the stand (it rises first). */
export const ACROSS_FROM = 0.39;
/** Over the opening, at rest: the release. */
export const CARRY_TO = 0.76;
/** Gravity in Birthday units (9.81 m/s² at 1 unit = 20 cm). */
export const BIN_DROP_G = GRAVITY;
/** The cake lands on the bucket floor (hidden: far below the rim) at DROP_TO. */
export const DROP_TO = CARRY_TO + Math.sqrt((2 * (BIN.rimTop + RIM_CLEARANCE - BIN.floor)) / BIN_DROP_G);
/** The flaps start closing once the cake and candles are below the rim (0.986 s). */
export const FLAPS_CLOSE = 0.99;

/**
 * Carry lean: the cake on its plate behaves as a damped pendulum driven by the carry's plan
 * acceleration (2.1 Hz, ζ 0.4): it leans back as it sets off, forward as it slows over the bin,
 * and is steadied (faded to upright) by the time it is let go over the opening, LEAN_FADE (so it
 * drops into the 29.6 cm mouth upright). Peak scaled to LEAN_MAX.
 */
export const CARRY_LEAN = { hz: 2.1, zeta: 0.4 } as const;
export const LEAN_FADE = [0.68, 0.76] as const;
