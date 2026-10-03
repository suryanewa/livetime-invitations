import { Box3, Vector3 } from 'three';
import { CAMERA_ANGLES } from '../src/render/camera.ts';
import { BIN, BIN_BOUNDS } from './disposalBin.ts';

/**
 * Birthday layout contract (v1.2): the scan-to-CAD cake master (`models/masters/birthday-cake.glb`)
 * on its turned ceramic stand at the origin, six twisted candles placed by the host, and the shared
 * bin entering behind and to the left. Behind, because the bin has to be deep enough to swallow
 * the cake with its candles; from behind, the bin's front wall is what hides the cake as it drops
 * (real occlusion).
 *
 * Every number marked "master" was measured from the GLB with scripts/masters/inspect.ts (and a
 * vertex scan for the radial extents) in the master's own scan units; `tests/birthday.test.ts`
 * re-measures the exported runtime GLB against the derived scene numbers.
 */

// ── Master measurements (scan units, y-up, centred) ─────────────────────────────────
export const MASTER = {
  /** cake_stand: foot underside, plate top (centre), plate radius, foot radius. */
  standBottom: -0.948,
  plateTop: -0.2425,
  plateRadius: 0.7615,
  footRadius: 0.379156,
  /** Lowest vertex of the tiers and piping (the bottom shell border; it beds 0.009 into the plate). */
  cakeBottom: -0.251947,
  /**
   * Widest point of the tiers and piping (the bottom tier's tassel skirts and rosettes). v1.6:
   * re-measured after the Hollywood pass regenerated the piping as sculpted sweeps
   * (scripts/masters/recipes/birthdayPiping.ts) on the hand-coated tiers (v1.5: 0.635837; the master's
   * own 0.628963).
   */
  cakeRadius: 0.62869,
  /**
   * Top-tier surface where the candles stand (the master's; v1.5 the finished top is uneven by
   * ±0.7 mm about it), and the crown rosettes' tips (v1.6 re-measured: the spiral rosettes and their
   * pearls; v1.5 0.647391, the master's 0.639565).
   */
  tierTop: 0.603,
  cakeTop: 0.64371,
  /** Candles (all six identical): base, top, radius; they bed 0.017 into the top tier. */
  candleBase: 0.586,
  candleTop: 0.8028,
  candleRadius: 0.018662,
  /** candle_wicks / candle_flames (dropped: one mesh each for all six; re-authored per candle). */
  wickBase: 0.796,
  wickTop: 0.8221,
  wickRadius: 0.0024,
  flameBase: 0.809,
  flameTop: 0.947,
  flameRadius: 0.0181,
} as const;

/**
 * Master candle nodes and their base centres (x, z), in the order the contract numbers them:
 * left to right as the shared camera sees them, so `candle_01` is the leftmost.
 */
export const MASTER_CANDLES = [
  { node: 'candle_5_pink', x: -0.285, z: 0 },
  { node: 'candle_6_blue', x: -0.1425, z: 0.246817 },
  { node: 'candle_4_blue', x: -0.1425, z: -0.246817 },
  { node: 'candle_1_pink', x: 0.1425, z: 0.246817 },
  { node: 'candle_3_pink', x: 0.1425, z: -0.246817 },
  { node: 'candle_2_blue', x: 0.285, z: 0 },
] as const;

/**
 * Scan → scene units. The cake with its candles (underside to wick tips, 1.074 scan) must drop
 * below the shared bin's rim with the flaps' 12 mm margin: 1.1 × 1.074 = 1.181 on a 0.10 floor
 * against a 1.30 rim. That keeps the lower tier's piping at r 0.692 (v1.1 0.815) and the stand
 * at r 0.838, 0.776 tall (v1.1 1.0, 0.70).
 */
export const CAKE_SCALE = 1.1;
/**
 * World units per Birthday scene unit (v1.4, models/worldScale.ts): 1. Birthday was already
 * authored at the world scale: the cake on its stand (stand foot to the top tier's rosettes,
 * 1.5876 scan × 1.1 = 1.746) is 34.9 cm (reference 35 cm), the bottom tier 27.7 cm across its
 * piping, the stand 33.5 cm, a candle 4.8 cm. v1.5: the shared bin is a real 47 cm pedal bin
 * (models/disposalBin.ts) at its real size here too: the cake with candles (23.6 cm) drops into
 * its 29.6 cm mouth and 38.6 cm deep bucket.
 */
export const BIRTHDAY_WORLD_SCALE = 1;

/**
 * The master turns 5° about y so the six candles spread evenly across the frame (screen x at
 * ±0.26, ±0.71, ±0.97 of the ring radius from the 20° camera, instead of pairs 0.17 apart).
 */
export const CAKE_YAW = (5 * Math.PI) / 180;

export const CANDLE_COUNT = 6;

const s = CAKE_SCALE;

/** The plate: its top surface at the centre, its radius, the foot's radius (birthday_root space). */
export const STAND = {
  top: (MASTER.plateTop - MASTER.standBottom) * s,
  radius: MASTER.plateRadius * s,
  foot: MASTER.footRadius * s,
} as const;

/**
 * cake_authored rests here: the cake's underside (the shell border's lowest point) as the master
 * seats it on the plate, 10 mm below the plate's top (the piping beds into the plate).
 */
export const STAND_TOP = (MASTER.cakeBottom - MASTER.standBottom) * s;

/** Widest part of the cake with its piping, about cake_secondary's axis. */
export const CAKE_RADIUS = MASTER.cakeRadius * s;

/**
 * v1.5 polish: how much deeper than the master the candles stand (scene units). The master beds
 * them 3.7 mm into the top tier; a real candle needs ≈ 10 mm of buttercream and sponge to stand,
 * so each is pushed 6.3 mm further in (the recipe sinks the master candles by as much).
 */
export const CANDLE_SINK = 0.0313;

/** Cake + candles + wicks, from the cake's underside to the wick tips (flames out). */
export const CAKE_TOTAL_HEIGHT = (MASTER.wickTop - MASTER.cakeBottom) * s - CANDLE_SINK;

/** Candle geometry in candle_NN space (origin: the candle's base centre, seated). */
export const CANDLE = {
  /** Seated base height in cake_secondary space (v1.5: CANDLE_SINK under the master's). */
  seat: (MASTER.candleBase - MASTER.cakeBottom) * s - CANDLE_SINK,
  height: (MASTER.candleTop - MASTER.candleBase) * s,
  radius: MASTER.candleRadius * s,
  /** Depth the seated candle beds into the top tier (10 mm since v1.5; the master's 3.7). */
  insert: (MASTER.tierTop - MASTER.candleBase) * s + CANDLE_SINK,
  wickBase: (MASTER.wickBase - MASTER.candleBase) * s,
  wickHeight: (MASTER.wickTop - MASTER.wickBase) * s,
  wickRadius: MASTER.wickRadius * s,
  flameBase: (MASTER.flameBase - MASTER.candleBase) * s,
  flameHeight: (MASTER.flameTop - MASTER.flameBase) * s,
  flameRadius: MASTER.flameRadius * s,
} as const;

/** Candle sockets (x, z) in cake_secondary space: the master's candle bases, turned by CAKE_YAW. */
export const CANDLE_SOCKETS: [number, number][] = MASTER_CANDLES.map(({ x, z }) => {
  const c = Math.cos(CAKE_YAW), sn = Math.sin(CAKE_YAW);
  return [(x * c + z * sn) * s, (-x * sn + z * c) * s];
});

/** Screen-x of a point from the shared camera (right vector of the 20° azimuth). */
export function screenX(x: number, z: number): number {
  const az = (CAMERA_ANGLES.azimuthDeg * Math.PI) / 180;
  return x * Math.cos(az) - z * Math.sin(az);
}

/** Height the cake's underside clears the rim by while it crosses over. */
export const RIM_CLEARANCE = 0.06;

/**
 * Carry height of the cake's underside at the top of the lift off the stand (v1.5: over the real
 * bin's 44.5 cm rim, 1.5 cm above the hover height it then settles to over the opening, so it is
 * clear of the rim with its lean before it reaches over it).
 */
export const CARRY_HEIGHT = BIN.rimTop + RIM_CLEARANCE + 0.075;

/**
 * Bin resting position (bin_root origin), behind-left of the stand, clear of the plate by more
 * than 4 cm (stand 0.838 + bin 0.846 + 0.04 = 1.724; this is 2.01). It is turned to face the
 * stand so the cake enters between the butterfly flaps (they hinge along the bin's local z axis).
 * v1.5: a placement search over the real bin found this v1.2 place the best at every aspect
 * (0.563 of the frame height at 3:4, 1:1 and 3:2; 0.524 with the real-size v1.5 flames, which
 * no longer pad the hero's top); further left the 1:1 fill reaches 0.59 but the 3:4 one falls to
 * 0.45 (the bin then sets the width).
 */
export const BIN_POS = new Vector3(-1.04, 0, -1.72);
export const BIN_YAW = Math.atan2(-BIN_POS.x, -BIN_POS.z);
/** Slide-in start: off-frame to the left, along the same line. */
export const BIN_START = new Vector3(-3.8, 0, -1.72);

/** The backdrop cove starts behind the bin for this scene (studio sweep wall z). */
export const WALL_Z = -4.3;

/** Cake underside when resting on the bin liner floor. */
export const IN_BIN = new Vector3(BIN_POS.x, BIN.floor, BIN_POS.z);

/**
 * Candle hover height above its seated position before the host places it (v1.5 polish: 6 cm, a
 * hand's careful lowering; v1.2–v1.5 10 cm in 0.3 s was a lurch).
 */
export const CANDLE_HOVER = 0.3;

/** Largest pendulum lean of the carried cake (radians): 1.8°, under the brief's 2°. */
export const LEAN_MAX = (1.8 * Math.PI) / 180;

/**
 * The candle flame (v1.5, edit #4): its real size, drawn by the fire rig (models/birthdayFire.ts,
 * src/scenes/birthday/fire.ts), candle_NN space. Sunderland et al., Proc. Combust. Inst. 33 (2011):
 * paraffin on a ≈1.1 mm wick, flame length from the pool Lf = 3.85·L^0.634 mm and width at the
 * wick top Wf = 3.38·L^0.201 mm; the master's wick stands L = 4.2 mm above the candle top, so
 * Lf ≈ 10 mm, Wf ≈ 4.5 mm, and a twisted birthday wick burns a little larger: the blue cup's
 * bottom 1 mm above the pool (the lowest ≈20 % of a thin wick is quenched), 13 mm from there to
 * the tip, 5 mm wide at the wick top. The master's own flame (0.152 tall, 3 cm) and v1.2's drawn
 * 1.5× of it (4.5 cm) were 2–3× too large; the exported GLB carries no flame mesh, only the
 * `flame_NN` anchor at CANDLE.flameBase.
 */
const MM = 0.005;
export const FLAME = {
  /** Bottom of the blue cup above the candle base. */
  base: CANDLE.height + 1.0 * MM,
  /** Base to tip. */
  height: 13 * MM,
  /** Half the widest width (5 mm). */
  radius: 2.5 * MM,
} as const;

/** Flame top above the candle base at full size (14 mm above the wax). */
export const FLAME_TOP = FLAME.base + FLAME.height;

/**
 * Complete motion bounds: stand, hovering candles, lit flames, the cake's arc over the rim and
 * the bin with its flaps open (the slide-in start is deliberately outside the frame).
 */
export function birthdayBounds(): Box3 {
  const top = STAND_TOP + CANDLE.seat + CANDLE_HOVER + FLAME_TOP;
  const b = new Box3(new Vector3(-STAND.radius, 0, -STAND.radius), new Vector3(STAND.radius, top, STAND.radius));
  // The bin is turned; its radius bounds any yaw, flaps add their outward lean.
  const r = Math.hypot(BIN_BOUNDS.max.x, BIN_BOUNDS.max.z);
  b.union(new Box3(new Vector3(BIN_POS.x - r, 0, BIN_POS.z - r), new Vector3(BIN_POS.x + r, BIN_BOUNDS.max.y, BIN_POS.z + r)));
  // Carried: lifted to CARRY_HEIGHT near the stand, lowered to the rim clearance over the bin.
  b.expandByPoint(new Vector3(BIN_POS.x * 0.2, CARRY_HEIGHT + CAKE_TOTAL_HEIGHT, BIN_POS.z * 0.2));
  b.expandByPoint(new Vector3(BIN_POS.x, BIN.rimTop + RIM_CLEARANCE + CAKE_TOTAL_HEIGHT, BIN_POS.z));
  return b;
}
