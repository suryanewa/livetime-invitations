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
   * Sports: a mini (size 3) basketball, 18 cm. Since v1.5 the hoop is a mini hoop system of the
   * SKLZ Pro Mini Hoop System class (models/sportsContract.ts HOOP_PRODUCT_CM): a 14.5" (36.8 cm)
   * rim at 4 ft; the master's board comes out 74.9 cm wide.
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
   * The shared bin is one design sized against what it receives. Birthday: the cake (27.7 cm across
   * its piping, 23.6 cm with its candles) needs the 37.6 cm bin (35.6 cm opening, 26 cm tall).
   * Dinner: the covered dish (27 cm plate, 15.9 cm tall) takes it at Dinner's scale, 31.7 cm
   * (30 cm opening, 21.9 cm tall, 20.3 cm deep). Both keep their approved choreography.
   */
  binDiameter: { birthday: 37.6, dinner: 31.7 },
} as const;
