/**
 * v1.4: one world scale for all five scenes (docs/style-reference.md, "v1.4 scale").
 *
 * One world unit is 20 cm, and every object stands in the world at its real size. The camera's
 * lens, azimuth and elevation are shared, and the framing rule (src/render/framing.ts) sets its
 * distance from the hero's real silhouette: the camera moves, the object keeps its size.
 *
 * Each scene's contract keeps its own **scene units** (the numbers its choreography, tests and
 * GLB were authored and measured in) and declares `<SCENE>_WORLD_SCALE`: world units per scene
 * unit, derived below from one real-world reference per scene. The scene's root node carries that
 * scale at runtime, so the whole scene (paths, arcs, nets, pivots, clearances) scales together and
 * every beat, duration and test intent holds unchanged. Party and Birthday were already authored
 * at this scale (1). The set (the cove, the key's throw, the shadow camera) scales with the scene
 * too (src/render/rig.ts setWall): a photographer sizes the set and the light to the subject, so the
 * five scenes keep one look.
 */

/** Centimetres per world unit. */
export const WORLD_UNIT_CM = 20;

/** Centimetres → world units. */
export const cm = (v: number): number => v / WORLD_UNIT_CM;

/**
 * Real-world reference sizes (cm): the one size per object that fixes its scale, and the
 * resulting sizes the scene tests re-measure (tests/world-scale.test.ts).
 */
export const REFERENCE_CM = {
  /** Party: a 12-inch LP. The turntable master is built round it; its plinth comes out 42.1 cm wide. */
  record: 30.48,
  /**
   * Birthday: the two-tier cake on its stand, foot of the stand to the top tier's rosettes (candles
   * excluded). It comes out 34.9 cm; the stand 33.5 cm across, the cake 27.7 cm across its piping.
   */
  cakeOnStand: 35,
  /**
   * Sports: a mini (size 3) basketball, 18 cm. The hoop master is a wall-mount mini hoop; its rim's
   * inner diameter stays 1.6 × the ball (28.8 cm), its board comes out 58.6 cm wide.
   */
  miniBall: 18,
  /** Dinner: a 27 cm dinner plate; the cloche keeps its real size against it (21.9 cm dome). */
  plate: 27,
  /**
   * Business: the printed card in the badge holder is a CR80 card, 5.4 cm on its short side (the
   * holder comes out 5.7 × 8.9 cm). The reader keeps its v1.2.1 size against the badge (7.0 cm
   * wide, 10.4 cm tall): its glass takes the holder with the side clips on the glass.
   */
  cardShortSide: 5.4,
  /**
   * v1.5: the shared bin is one real 47 cm butterfly pedal bin at its real size in both scenes
   * (models/disposalBin.ts): 32.4 cm across its base, a 29.6 cm mouth for the 27.7 cm cake and the
   * 27 cm plate, 38.6 cm of depth. (v1.4: 37.6 × 26 cm in Birthday, 31.7 × 22 cm in Dinner.)
   */
  binDiameter: { birthday: 32.44, dinner: 32.44 },
} as const;
