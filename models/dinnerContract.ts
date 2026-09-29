import { Box3, Vector3 } from 'three';
import { BIN, BIN_BOUNDS } from './disposalBin.ts';

/**
 * Dinner (covered dish) contract — shared by the model (`dinnerPremium.ts`), the rig
 * (`dinner.ts`) and the choreography (`src/scenes/dinner`). The covered dish is sized to drop
 * whole into the shared bin approved at checkpoint 3, and the cloche clears the tallest food
 * preset everywhere under it.
 */

export type DishPreset = 'pasta' | 'vegetables';

export const DINNER_NODES = [
  'dinner_root', 'plate_authored', 'plate_secondary', 'food_root', 'food_pasta', 'food_vegetables',
  'cover_authored', 'cover_secondary', 'cover_mesh', 'cover_handle', 'bin_root', 'bin_lid', 'dish_shadow',
] as const;

/**
 * Plate on the floor, centred at the origin. `plate_authored` origin is the plate's underside
 * centre; the food sits on the well at PLATE.well; the cover's skirt seats on the well inside
 * the rim wall (which carries the family perforation row).
 */
export const PLATE = { radius: 0.8, rimHeight: 0.075, well: 0.045, wellRadius: 0.7 } as const;

/**
 * Cloche: `cover_authored` origin is the skirt's bottom centre. Seated, it rests on the plate
 * well. `cover_handle` is the coral knob on top.
 */
export const COVER = { radius: 0.66, domeHeight: 0.56, handleHeight: 0.12, wall: 0.012 } as const;
export const COVER_TOP = COVER.domeHeight + COVER.handleHeight;

/** Food envelope (both presets) above the well: radius and height at the centre and at the edge. */
export const FOOD = { radius: 0.5, centreHeight: 0.26, edgeHeight: 0.12 } as const;

/** Minimum gap between the cloche's inner surface and the food envelope. */
export const COVER_CLEARANCE = 0.04;

/** Covered-dish height from the plate's underside to the knob top. */
export const DISH_HEIGHT = PLATE.well + COVER_TOP;

/**
 * Seated cover (skirt on the well) and the accepted rest pose beside the plate: set down
 * behind-left, clear of the food on screen, so the food stays in front and the dish sits
 * centred in the fixed frame (checkpoint 4 layout search over the real bin geometry).
 */
export const COVER_SEATED = new Vector3(0, PLATE.well, 0);
export const COVER_BESIDE = new Vector3(-1.2, 0, -0.95);
/** Host-ready: the cover poised beside and above the plate, tipped towards it. */
export const COVER_POISED = new Vector3(1.05, 0.62, 0.18);
export const COVER_POISED_TILT = 0.32;

/**
 * Bin placement (same approved treatment as Birthday): behind-left of the dish, clear of the
 * plate by at least 5 cm, turned so the dish enters between the flaps. The tall open flaps, not
 * the dish, set the fixed frame; a search over bin and cloche placements, fitted to the bin's
 * real open geometry with 8 % clearance, found this near the most compact literal disposal
 * (43 % ready-pose fill, dish centred; recorded exception in docs/spec-revisions.md).
 */
export const DINNER_BIN_POS = new Vector3(-0.7, 0, -1.7);
export const DINNER_BIN_YAW = Math.atan2(-DINNER_BIN_POS.x, -DINNER_BIN_POS.z);
/** Off-frame start: the bin slides in from the left margin. */
export const DINNER_BIN_START = new Vector3(-3.9, 0, -1.7);
export const DINNER_WALL_Z = -4.2;
/** Underside clearance over the rim while the dish crosses it, and the carry height. */
export const DINNER_RIM_CLEARANCE = 0.06;
export const DINNER_CARRY = 1.4;
/** Plate underside when the dish rests on the liner floor. */
export const DISH_IN_BIN = new Vector3(DINNER_BIN_POS.x, BIN.floor, DINNER_BIN_POS.z);

/** Complete motion bounds (box fallback; the scene also supplies silhouette frame points). */
export function dinnerBounds(): Box3 {
  const b = new Box3(new Vector3(-PLATE.radius, 0, -PLATE.radius), new Vector3(Math.max(COVER_BESIDE.x, COVER_POISED.x) + COVER.radius + 0.02, COVER_POISED.y + COVER_TOP + 0.1, PLATE.radius + 0.1));
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    b.expandByPoint(new Vector3(COVER_BESIDE.x + dx * (COVER.radius + 0.02), COVER_TOP, COVER_BESIDE.z + dz * (COVER.radius + 0.02)));
  }
  const r = Math.hypot(BIN_BOUNDS.max.x, BIN_BOUNDS.max.z);
  b.union(new Box3(new Vector3(DINNER_BIN_POS.x - r, 0, DINNER_BIN_POS.z - r), new Vector3(DINNER_BIN_POS.x + r, BIN_BOUNDS.max.y, DINNER_BIN_POS.z + r)));
  b.expandByPoint(new Vector3(DINNER_BIN_POS.x, BIN.rimTop + DINNER_RIM_CLEARANCE + DISH_HEIGHT, DINNER_BIN_POS.z));
  b.expandByPoint(new Vector3(DINNER_BIN_POS.x * 0.2, DINNER_CARRY + DISH_HEIGHT, DINNER_BIN_POS.z * 0.2));
  return b;
}
