import { Vector3 } from 'three';
import { BIN_POS, BIN_START, CANDLE, CANDLE_COUNT, CANDLE_HOVER, CARRY_HEIGHT, IN_BIN, LEAN_MAX, RIM_CLEARANCE, STAND_TOP } from '../../../models/birthdayContract.ts';
import { BIN } from '../../../models/disposalBin.ts';
import { mulberry32 } from '../../motion/random.ts';

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
 * Candle placement (0.18–0.89 s; v1.5, edit #5 "candles must actually interact with the cake as
 * they would in real life as they're placed"): six candles in a cascade, 55 ms apart, left to
 * right. Each is brought down for CANDLE_DESCENT (from rest; the hand slows as it nears the cake)
 * and meets the buttercream at CANDLE_CONTACT_SPEED, its base CANDLE.insert above the seat. Then
 * it is pushed in: buttercream is a soft plastic solid (it yields, it does not spring back), and
 * its resistance grows with depth as more of the candle's side is in contact, so the candle
 * decelerates (deceleration rising linearly from 0) and stops exactly at the seat after
 * CANDLE_PRESS. The plug it pushes aside rises as a collar round the socket (models/cakeShaders.ts)
 * and the cake takes the push as a sub-millimetre dip and tilt (CAKE_LOAD).
 */
export const CANDLE_START = each((i) => 0.18 + 0.055 * i);
export const CANDLE_DESCENT = 0.3;
/** Speed (units/s) at which the base meets the frosting: 4.4 cm/s, a careful hand. C1 at contact. */
export const CANDLE_CONTACT_SPEED = 0.22;
/**
 * Push-in time: velocity v(u) = −v₀(1 − u²) over the insertion depth (u = s / CANDLE_PRESS), so
 * depth = ⅔ v₀ T: T = 1.5 · CANDLE.insert / v₀ (3.7 mm in 0.128 s; peak deceleration 3.5 units/s²).
 */
export const CANDLE_PRESS = (1.5 * CANDLE.insert) / CANDLE_CONTACT_SPEED;
/** End of each candle's placement: seated exactly at its socket from here on. */
export const CANDLE_SEATED = CANDLE_START.map((s) => s + CANDLE_DESCENT + CANDLE_PRESS);

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
 * The cake takes each push: the stand is rigid ceramic, the cake on it a stiff spring (sponge
 * and buttercream, ≈ 1.5 kg at ≈ 14 Hz, ζ 0.35). `dip` is the static settling under a full push
 * (≈ 3 N: 0.24 mm; the overlapping cascade peaks at ≈ 0.5 mm), `tilt` the rock about its underside
 * centre per unit push at the socket radius (0.07°: a 25 cm cake on a flat plate barely rocks; the
 * give is mostly the sponge under the candle).
 */
export const CAKE_LOAD = { hz: 14, zeta: 0.35, dip: 0.0012, tilt: 0.0012, release: 0.035 } as const;

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
