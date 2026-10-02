import { Vector3 } from 'three';
import { BIN_POS, BIN_START, CANDLE_COUNT, CANDLE_HOVER, CARRY_HEIGHT, IN_BIN, LEAN_MAX, RIM_CLEARANCE, STAND_TOP } from '../../../models/birthdayContract.ts';
import { BIN } from '../../../models/disposalBin.ts';

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

/**
 * Flames (v1.5): ignition, the breath, extinction and smoke are physics in fire.ts (IGNITE_START,
 * BREATH, SMOKE), sampled as pure functions of time. Each wick catches once its candle has seated
 * (0.84 s on, 20 ms apart) and its flame grows for IGNITE; the guest's breath arrives 0.06 s into
 * accept and the flames go out nearest the mouth first, the last by ≈0.55 s; the smoke rises for
 * a few seconds after the sequence, on the scene's live clock.
 */
export { IGNITE, IGNITE_START } from './fire.ts';

/** Decline path keys. */
export const BIN_AT = BIN_POS;
export const BIN_FROM = BIN_START;
export const HOVER_OVER_BIN = new Vector3(BIN_POS.x, BIN.rimTop + RIM_CLEARANCE, BIN_POS.z);
/** Carry height of the cake's underside between the lift and the drop. */
export const CARRY = CARRY_HEIGHT;
export const DROPPED = IN_BIN;

/** Decline beats: lift + carry across (0.25–0.72), drop into the bin (0.72–0.95). */
export const CARRY_FROM = 0.25;
/** End of the lift off the stand (to CARRY height); the carry's gentle lowering to the rim follows. */
export const LIFT_TO = 0.46;
export const CARRY_TO = 0.72;
export const DROP_TO = 0.95;

/**
 * Carry lean: the cake on its plate behaves as a damped pendulum driven by the carry's plan
 * acceleration (2.1 Hz, ζ 0.4): it leans back as it sets off, forward as it slows over the bin,
 * and is steadied (faded to upright) during the drop, LEAN_FADE. Peak scaled to LEAN_MAX.
 */
export const CARRY_LEAN = { hz: 2.1, zeta: 0.4 } as const;
export const LEAN_FADE = [0.8, 0.93] as const;
