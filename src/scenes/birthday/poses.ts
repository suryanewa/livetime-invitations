import { Vector3 } from 'three';
import { BIN_POS, BIN_START, CANDLE_HOVER, CARRY_HEIGHT, IN_BIN, RIM_CLEARANCE, STAND_TOP } from '../../../models/birthdayContract.ts';
import { BIN } from '../../../models/disposalBin.ts';

/**
 * Birthday canonical poses and path keys (Birthday sub-spec). Cake positions are the
 * cake_authored origin (the cake's underside centre) in birthday_root space.
 */

export const DURATIONS = { host: 1.3, accept: 1.4, decline: 1.5 } as const;

export const ON_STAND = new Vector3(0, STAND_TOP, 0);

/** Host presentation: the cake turns this far and settles square to the camera (0–0.20 s). */
export const PRESENT_YAW = -0.14;

export { CANDLE_HOVER };

/** Candle placement: start of each candle's lowering (≈100 ms stagger) and its length. */
export const CANDLE_START = [0.2, 0.3, 0.4] as const;
export const CANDLE_LOWER = 0.45;

/** Breath: flames lean away from the camera and a touch right; wicks follow a little. */
export const LEAN = { x: -0.42, z: -0.12 };
export const WICK_LEAN = 0.3;

/** Extinguish windows, left to right (0.25–0.60 s), and one wisp each (0.60–1.00 s). */
export const OUT_START = [0.25, 0.34, 0.43] as const;
export const OUT_LEN = 0.17;
export const WISP_START = [0.6, 0.64, 0.68] as const;
export const WISP_LEN = 0.32;
export const WISP_OPACITY = 0.32;
export const WISP_RISE = 0.16;

/** Decline path keys. */
export const BIN_AT = BIN_POS;
export const BIN_FROM = BIN_START;
export const HOVER_OVER_BIN = new Vector3(BIN_POS.x, BIN.rimTop + RIM_CLEARANCE, BIN_POS.z);
/** Carry height of the cake's underside between the lift and the drop. */
export const CARRY = CARRY_HEIGHT;
export const DROPPED = IN_BIN;
