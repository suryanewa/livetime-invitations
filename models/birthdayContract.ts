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
  /** Widest point of the tiers and piping (the bottom tier's tassels and rosettes). */
  cakeRadius: 0.628963,
  /** Top-tier surface where the candles stand, and the crown rosettes' tips. */
  tierTop: 0.603,
  cakeTop: 0.639565,
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
 * piping, the stand 33.5 cm, a candle 4.8 cm. The bin is sized against it: the cake with candles
 * (23.6 cm) sinks below the 26 cm rim.
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

/** Cake + candles + wicks, from the cake's underside to the wick tips (flames out). */
export const CAKE_TOTAL_HEIGHT = (MASTER.wickTop - MASTER.cakeBottom) * s;

/** Candle geometry in candle_NN space (origin: the candle's base centre, seated). */
export const CANDLE = {
  /** Seated base height in cake_secondary space. */
  seat: (MASTER.candleBase - MASTER.cakeBottom) * s,
  height: (MASTER.candleTop - MASTER.candleBase) * s,
  radius: MASTER.candleRadius * s,
  /** Depth the seated candle beds into the top tier. */
  insert: (MASTER.tierTop - MASTER.candleBase) * s,
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

/** Carry height of the cake's underside while it glides from the stand to the bin. */
export const CARRY_HEIGHT = 1.42;

/**
 * Bin resting position (bin_root origin), behind-left of the stand and ≥ 1.95 from its axis so
 * the plate never touches the bin (radius 0.94). It is turned to face the stand so the cake
 * enters between the butterfly flaps (they hinge along the bin's local z axis).
 */
export const BIN_POS = new Vector3(-1.04, 0, -1.72);
export const BIN_YAW = Math.atan2(-BIN_POS.x, -BIN_POS.z);
/** Slide-in start: off-frame to the left, along the same line. */
export const BIN_START = new Vector3(-3.8, 0, -1.72);

/** The backdrop cove starts behind the bin for this scene (studio sweep wall z). */
export const WALL_Z = -4.3;

/** Cake underside when resting on the bin liner floor. */
export const IN_BIN = new Vector3(BIN_POS.x, BIN.floor, BIN_POS.z);

/** Height the cake's underside clears the rim by while it crosses over. */
export const RIM_CLEARANCE = 0.06;

/** Candle hover height above its seated position before the host places it. */
export const CANDLE_HOVER = 0.5;

/** Largest pendulum lean of the carried cake (radians): 1.8°, under the brief's 2°. */
export const LEAN_MAX = (1.8 * Math.PI) / 180;

/**
 * The GLB's placeholder flame (the v1.1 lathe at each wick): this many times the master flame's
 * height and width (v1.2.1). Since v1.5 the runtime drops it and draws the real flame instead
 * (src/scenes/birthday/fire.ts FLAME_REST: 13 mm from base to tip, 5 mm wide; models/birthdayFire.ts),
 * so FLAME/FLAME_TOP only size the exported placeholder and keep the motion bounds conservative.
 */
export const FLAME_DRAW = { height: 1.5, width: 1.45 } as const;

/** Drawn flame height and widest radius (candle_NN space). */
export const FLAME = {
  height: CANDLE.flameHeight * FLAME_DRAW.height,
  radius: CANDLE.flameRadius * FLAME_DRAW.width,
} as const;

/** Flame top above the candle base at full size. */
export const FLAME_TOP = CANDLE.flameBase + FLAME.height;

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
