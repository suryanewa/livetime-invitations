import { Box3, Vector3 } from 'three';
import { BIN_BOUNDS, binIn } from './disposalBin.ts';
import { cm, REFERENCE_CM } from './worldScale.ts';

/**
 * Dinner (covered dish) contract — shared by the recipe (`scripts/masters/recipes/dinner.ts`),
 * the rig (`dinner.ts`), the tooling stand-in (`dinnerPremium.ts`) and the choreography
 * (`src/scenes/dinner`).
 *
 * v1.2: the dish is the scan-to-CAD masters, with NO food (Surya, 2026-10-01): the porcelain
 * coupe plate with its gilt rim (`dinner-plate.glb`) and the silver cloche's dome assembly
 * (`silver-cloche.glb` minus its own tray). Both masters are placed at one scale, DISH_SCALE, so
 * their real proportions hold (the cloche was built on a tray the plate's size). Every number
 * below is measured from the masters at that scale (scratch measurement of the vertex data; the
 * exported GLB is checked against them in tests/dinner.test.ts).
 */

export type DishPreset = 'pasta' | 'vegetables';

/** Scan units → scene units for both masters: the plate keeps the v1.1 plate's diameter (1.6). */
export const DISH_SCALE = 0.8 / 0.9525;
/**
 * World units per Dinner scene unit (v1.4, models/worldScale.ts): the plate is a 27 cm dinner
 * plate, so PLATE.radius (0.8) is 13.5 cm = 0.675 world units: 0.84375. The cloche keeps its real
 * size against it (dome 21.9 cm across, 14.3 cm to the handle top). The scene root carries the
 * scale, and the whole scene scales together; every Dinner number stays in scene units.
 */
export const DINNER_WORLD_SCALE = cm(REFERENCE_CM.plate / 2) / 0.8;

/**
 * v1.5: the shared bin keeps its real size here (a 45 cm pedal bin with a 31 cm mouth, the same
 * object as in Birthday): `bin_root` carries the inverse of the scene's world scale
 * (models/disposalBin.ts `attachBin`). Until v1.4 it scaled with the scene (31.7 × 22 cm here,
 * 37.6 × 26 cm in Birthday).
 */
export const DINNER_BIN_SCALE = 1 / DINNER_WORLD_SCALE;
/** The bin's dimensions in Dinner scene units (radius, rim, mouth, floor, hinge). */
export const DINNER_BIN = binIn(DINNER_BIN_SCALE);

/** Nodes the rig and the choreography look up (the GLB and the tooling stand-in both have them). */
export const DINNER_NODES = [
  'dinner_root', 'plate_authored', 'plate_secondary', 'cover_authored', 'cover_secondary', 'cover_mesh', 'cover_handle',
  'bin_root', 'bin_lid', 'dish_shadow',
] as const;

/** Every node the exported GLB must carry exactly once (the recipe's contract). */
export const DINNER_GLB_NODES = [
  'dinner_root', 'plate_authored', 'plate_secondary', 'plate_body', 'plate_gilt',
  'cover_authored', 'cover_secondary', 'cover_mesh', 'cover_handle', 'dish_shadow',
] as const;

/**
 * Plate on the floor, centred at the origin; `plate_authored` origin is the plate's underside
 * centre (the master's flat foot). `well` is the top of the flat well (out to `wellRadius`), from
 * where the coupe rim rises to `rimHeight` at the gilt band (`giltRadius` out to `radius`).
 */
export const PLATE = { radius: 0.8, rimHeight: 0.1232, well: 0.0281, wellRadius: 0.455, giltRadius: 0.7727 } as const;

/**
 * The plate's top surface as [radius, height] pairs: at each radius (0.01 steps) the highest of the
 * master's vertices within ±0.01 of it, so linear interpolation between pairs is an upper bound of
 * the surface (every vertex lies inside both neighbouring windows). Flat well to 0.45, then the
 * coupe rim to the gilt edge.
 */
export const PLATE_PROFILE: readonly (readonly [number, number])[] = [
  [0, 0.0281],
  [0.44, 0.0281], [0.45, 0.0282], [0.46, 0.0283], [0.47, 0.0286], [0.48, 0.0286], [0.49, 0.0290], [0.50, 0.0295], [0.51, 0.0303], [0.52, 0.0318],
  [0.53, 0.0340], [0.54, 0.0371], [0.55, 0.0405], [0.56, 0.0472], [0.57, 0.0564], [0.58, 0.0564], [0.59, 0.0773], [0.60, 0.0851], [0.61, 0.0888],
  [0.62, 0.0909], [0.63, 0.0936], [0.64, 0.0936], [0.65, 0.0962], [0.66, 0.0987], [0.67, 0.1013], [0.68, 0.1039], [0.69, 0.1039], [0.70, 0.1065],
  [0.71, 0.1091], [0.72, 0.1116], [0.73, 0.1139], [0.74, 0.1161], [0.75, 0.1178], [0.76, 0.1201], [0.77, 0.1228], [0.78, 0.1232], [0.79, 0.1232],
  [0.80, 0.1223],
];

/** Plate top height at plan radius r (linear in PLATE_PROFILE; 0 beyond the plate). */
export function plateTop(r: number): number {
  if (r > PLATE.radius + 0.001) return 0;
  for (let i = 1; i < PLATE_PROFILE.length; i++) {
    const [r1, y1] = PLATE_PROFILE[i]!;
    if (r <= r1) {
      const [r0, y0] = PLATE_PROFILE[i - 1]!;
      return y0 + ((y1 - y0) * (r - r0)) / (r1 - r0);
    }
  }
  return PLATE.rimHeight;
}

/**
 * Cloche (the master's dome, lip bead, two applied bands, finial and handle; its tray is not
 * used). `cover_authored` origin is the dome's rim centre: the centre of the lip bead's lowest
 * ring, so the cover seats and rocks on its rim. `radius` is the bead's outer radius,
 * `lipRadius` the radius of its lowest ring (the bead bottom it rests and rocks on), `domeHeight` the crown (finial base), `height` the handle
 * top. `grip` is where a hand holds the handle (its loop's top bar), in cover space.
 */
export const COVER = { radius: 0.6534, lipRadius: 0.642, domeHeight: 0.6333, height: 0.8491, grip: 0.81 } as const;
export const COVER_TOP = COVER.height;

/**
 * The dome's outer silhouette as [radius, height] in cover space (master, DISH_SCALE): the bead,
 * the near-vertical skirt, the shoulder and the crown. Used for framing and the tooling stand-in.
 */
export const COVER_PROFILE: readonly (readonly [number, number])[] = [
  [0.6534, 0], [0.6534, 0.0227], [0.64, 0.04], [0.638, 0.12], [0.6215, 0.196], [0.605, 0.236], [0.571, 0.313], [0.5375, 0.374],
  [0.504, 0.42], [0.47, 0.463], [0.42, 0.511], [0.336, 0.566], [0.252, 0.604], [0.168, 0.623], [0, 0.6333],
];

/**
 * Seated cover: the lip bead rests on the coupe rim's slope just inside the gilt band (contact at
 * r ≈ 0.646, on the bead's outer flank; measured against the plate's upward-facing vertices in
 * 1 mm radial bins, the bead clears the surface by 0.1 mm), so the dome
 * covers the whole well and the gilt band stays visible round it.
 */
export const COVER_SEATED = new Vector3(0, 0.0946, 0);

/** Covered-dish height from the plate's underside to the handle top. */
export const DISH_HEIGHT = COVER_SEATED.y + COVER_TOP;

/**
 * The accepted rest pose beside the plate: set down behind-left, so the plate stays in front and
 * the dish sits centred in the fixed frame (checkpoint 4 layout search over the real bin geometry).
 */
export const COVER_BESIDE = new Vector3(-1.2, 0, -0.95);
/**
 * Host-ready: the cover poised above its resting place (behind-left), tipped towards the plate,
 * so covering is the reverse of the guest's uncovering (Dinner acceptance criteria).
 */
export const COVER_POISED = new Vector3(-0.95, 0.62, -0.75);
export const COVER_POISED_TILT = 0.32;

/**
 * Bin placement (same approved treatment as Birthday): behind-left of the dish, turned so the
 * dish enters between the flaps, and far enough that the bin's pedal (under the lid's seam, so it
 * points at the dish; it reaches 23.45 cm = 1.39 units out) clears the plate and the cloche's
 * skirt by 2 cm while the bin slides in beside the resting dish: 2.32 units from the dish. (The
 * lathe body alone needs 0.8 + 1.003 + 0.04 = 1.843.) The covered dish rising over the real
 * bin's rim, not the dish, sets the fixed frame (recorded exception in docs/spec-revisions.md).
 * v1.5: a placement search over the real bin (every plan position from −6 to 6 by −8 to 4) found
 * the hero fill flat within 1 % behind and beside the dish: the height of the carry over a 42.4 cm
 * rim sets the frame, not where the bin stands.
 */
export const DINNER_BIN_POS = new Vector3(-0.93, 0, -2.125);
export const DINNER_BIN_YAW = Math.atan2(-DINNER_BIN_POS.x, -DINNER_BIN_POS.z);
/** Off-frame start: the bin slides in from the left margin. */
export const DINNER_BIN_START = new Vector3(-4.5, 0, -2.125);
export const DINNER_WALL_Z = -4.2;
/** Underside clearance over the rim while the dish crosses it, and the carry height. */
export const DINNER_RIM_CLEARANCE = 0.06;
/** v1.5: the plate's underside 1.5 cm over the real bin's rim (2.513 scene units). */
export const DINNER_CARRY = 2.6;
/** Plate underside when the dish rests on the liner floor. */
export const DISH_IN_BIN = new Vector3(DINNER_BIN_POS.x, DINNER_BIN.floor, DINNER_BIN_POS.z);

/** Complete motion bounds (box fallback; the scene also supplies silhouette frame points). */
export function dinnerBounds(): Box3 {
  // The plate, the covered dish's height, and both cover rest places as full discs.
  const b = new Box3(new Vector3(-PLATE.radius, 0, -PLATE.radius), new Vector3(PLATE.radius, DISH_HEIGHT, PLATE.radius + 0.1));
  for (const c of [COVER_BESIDE, COVER_POISED]) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      b.expandByPoint(new Vector3(c.x + dx * (COVER.radius + 0.02), c.y + COVER_TOP + 0.1, c.z + dz * (COVER.radius + 0.02)));
    }
  }
  const r = Math.hypot(BIN_BOUNDS.max.x, BIN_BOUNDS.max.z) * DINNER_BIN_SCALE;
  b.union(new Box3(new Vector3(DINNER_BIN_POS.x - r, 0, DINNER_BIN_POS.z - r), new Vector3(DINNER_BIN_POS.x + r, BIN_BOUNDS.max.y * DINNER_BIN_SCALE, DINNER_BIN_POS.z + r)));
  b.expandByPoint(new Vector3(DINNER_BIN_POS.x, DINNER_CARRY + DISH_HEIGHT, DINNER_BIN_POS.z));
  b.expandByPoint(new Vector3(DINNER_BIN_POS.x * 0.2, DINNER_CARRY + DISH_HEIGHT, DINNER_BIN_POS.z * 0.2));
  return b;
}
