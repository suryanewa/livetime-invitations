import { Vector3 } from 'three';
import { BIN_POS, BIN_START, CANDLE, CANDLE_COUNT, CANDLE_HOVER, CARRY_HEIGHT, IN_BIN, LEAN_MAX, RIM_CLEARANCE, STAND_TOP } from '../../../models/birthdayContract.ts';
import { BIN, GRAVITY } from '../../../models/disposalBin.ts';
import { mulberry32 } from '../../motion/random.ts';
import { IGNITE, IGNITE_START } from './fire.ts';

/**
 * Birthday canonical poses and path keys (Birthday sub-spec, v1.2 on the cake master). Cake
 * positions are the cake_authored origin (the cake's underside centre) in birthday_root space.
 * Candle arrays are indexed candle_01 … candle_06, left to right on screen.
 */

/**
 * Host (v1.5 polish): the careful placement takes longer than v1.2–v1.5's 1.3 s lurch; the beat
 * ends 0.14 s after the last wick's flame has grown (fire.ts IGNITE), ≈ 2.45 s.
 */
export const DURATIONS = { host: Math.round((IGNITE_START[CANDLE_COUNT - 1]! + IGNITE + 0.14) * 1000) / 1000, accept: 1.4, decline: 1.5 } as const;

export { CANDLE_COUNT, CANDLE_HOVER, LEAN_MAX };

export const ON_STAND = new Vector3(0, STAND_TOP, 0);

/** Host presentation: the cake turns this far and settles square to the camera (0–0.20 s). */
export const PRESENT_YAW = -0.14;

const each = (f: (i: number) => number) => Array.from({ length: CANDLE_COUNT }, (_, i) => f(i));

/**
 * Candle placement (v1.5; the timeline lives in placement.ts, which the fire's ignition also keys
 * on): six candles lowered by a careful hand at seeded intervals, each pushed 10 mm into the
 * buttercream, which yields and then drags harder with depth (models/cakeShaders.ts draws the
 * dimple and the collar of displaced buttercream; the cake gives under the pushes, CAKE_LOAD).
 */
export { CANDLE_CONTACT_SPEED, CANDLE_DESCENTS, CANDLE_PRESS, CANDLE_SEATED, CANDLE_START, LIGHT_FROM } from './placement.ts';

/**
 * The lean of a hand-placed candle: a fixed, seeded angle (0.6–1.8°, within the brief's 2°) and
 * direction per candle (radians about y in the cake's space, atan2(z, x): the way its top leans and
 * its low side faces). It develops as the candle seats (the push is never quite along its axis).
 * Seed chosen so the six lean every which way, as six hands' worth of candles do, and four low
 * sides (where the runs form, melt.ts) face the camera.
 */
export const CANDLE_LEAN: readonly { angle: number; azimuth: number }[] = (() => {
  const r = mulberry32(27 * 7919);
  return Array.from({ length: CANDLE_COUNT }, () => ({ angle: ((0.6 + 1.2 * r()) * Math.PI) / 180, azimuth: r() * 2 * Math.PI }));
})();

/**
 * The cake takes each push (v1.5 polish: visible at showcase sizes). The stand is rigid ceramic;
 * the cake on it is a soft sponge under buttercream, so a push into the top compresses it: the
 * cake squashes about its underside (the top tier dips ≈ 1.5 mm at the peak, where two or three
 * pushes overlap) and rings down at ≈ 9 Hz, ζ 0.22, rocking a little towards the pushed side.
 * `dip` is the static compression under one full push (units), `tilt` the rock per push.
 */
export const CAKE_LOAD = { hz: 9, zeta: 0.22, dip: 0.0026, tilt: 0.0016, release: 0.06 } as const;

/**
 * Flames (v1.5): ignition, the breath, extinction and smoke are physics in fire.ts (IGNITE_START,
 * BREATH, SMOKE), sampled as pure functions of time. Each wick catches once its candle has seated
 * (0.84 s on, 20 ms apart) and its flame grows for IGNITE; the guest's breath arrives 0.06 s into
 * accept and the flames go out nearest the mouth first, the last by ≈0.55 s; the smoke rises for
 * a few seconds after the sequence, on the scene's live clock.
 */
export { IGNITE, IGNITE_START } from './fire.ts';

/**
 * v1.5 decline pull-back (src/render/framing.ts DECLINE_PULL): the camera starts easing back on
 * the tap, and the bin's entrance (its slide and its flaps, shape and length unchanged) waits
 * this long for it, so it glides into room the camera has already made: at the rest framing its
 * open flaps would rise through the frame's top edge (measured: none clipped from 0.12 s on). It
 * is settled, flaps open, at 0.37 s, before the carry across sets off (ACROSS_FROM).
 */
export const BIN_DELAY = 0.12;

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
