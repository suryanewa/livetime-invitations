import { Box3, Vector3 } from 'three';
import { BIN, BIN_BOUNDS } from './disposalBin.ts';
import { CAKE_METRICS, PREMIUM_TIERS } from './cake.ts';

/**
 * Birthday layout contract (premium L2): the cake stand at the origin and the shared bin
 * entering behind and to the right. Behind, because the bin has to be deep enough to swallow
 * the cake with its candles (≈1.1 tall), and a bin that size in the side margin would push
 * the stand below the Master spec's 60–75 % of stage width. From behind, the bin's front
 * wall is what hides the cake as it drops — real occlusion.
 */

export const CAKE = CAKE_METRICS.premium;
export { PREMIUM_TIERS };

/** Stand top (cake_authored rests here). */
export const STAND_TOP = CAKE.trayTop;

/** Widest part of the cake with its piped borders (lower tier + shell border). */
export const CAKE_RADIUS = PREMIUM_TIERS.lower.radius + 0.06;

/** Cake + candles, from the cake's underside to the candle tops. */
export const CAKE_TOTAL_HEIGHT = CAKE.cakeHeight - CAKE.candleInsert + CAKE.candleHeight;

/**
 * Bin resting position (bin_root origin), behind-left of the stand and ≥ 1.95 from its axis so
 * the plate (radius 1.0) never touches the bin (radius 0.9). It is turned to face the stand so
 * the cake enters between the butterfly flaps (they hinge along the bin's local z axis).
 */
export const BIN_POS = new Vector3(-1.0, 0, -1.65);
export const BIN_YAW = Math.atan2(-BIN_POS.x, -BIN_POS.z);
/** Slide-in start: off-frame to the left, along the same line. */
export const BIN_START = new Vector3(-3.7, 0, -1.65);

/** The backdrop cove starts behind the bin for this scene (studio sweep wall z). */
export const WALL_Z = -4.3;

/** Cake underside when resting on the bin liner floor. */
export const IN_BIN = new Vector3(BIN_POS.x, BIN.floor, BIN_POS.z);

/** Height the cake's underside clears the rim by while it crosses over. */
export const RIM_CLEARANCE = 0.06;

/** Candle hover height above its seated position before the host places it. */
export const CANDLE_HOVER = 0.5;

/**
 * Complete motion bounds: stand, lit flames, the cake's arc over the rim and the bin with
 * its flaps open (the slide-in start is deliberately outside the frame).
 */
export function birthdayBounds(): Box3 {
  const b = new Box3(new Vector3(-CAKE.trayRadius, 0, -CAKE.trayRadius), new Vector3(CAKE.trayRadius, STAND_TOP + CAKE_TOTAL_HEIGHT + 0.14, CAKE.trayRadius));
  // The bin is turned; its radius bounds any yaw, flaps add their outward lean.
  const r = BIN_BOUNDS.max.x;
  b.union(new Box3(new Vector3(BIN_POS.x - r, 0, BIN_POS.z - r), new Vector3(BIN_POS.x + r, BIN_BOUNDS.max.y, BIN_POS.z + r)));
  const apexTop = BIN.rimTop + RIM_CLEARANCE + CAKE_TOTAL_HEIGHT;
  b.expandByPoint(new Vector3(BIN_POS.x, apexTop, BIN_POS.z));
  return b;
}
