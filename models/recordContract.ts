import { Box3, Vector3 } from 'three';

/**
 * Party record player — shared contract between the model (`recordPremium.ts`), the rig
 * (`recordPlayer.ts`) and the choreography (`src/scenes/party`). Units are scene units (the
 * badge card is 1.3 tall). Everything the sequences touch is fixed here, so geometry can be
 * refined without breaking contact, clearance or motion bounds.
 */

export type RecordLabel = 'coral' | 'cobalt';

/** Required nodes (Party sub-spec) plus the rig's optional status mark. */
export const PARTY_NODES = [
  'party_root', 'player_body', 'lid_hinge', 'lid_mesh', 'platter', 'record_authored', 'record_secondary',
  'record_label', 'tonearm_pivot', 'tonearm_mesh', 'record_shadow',
] as const;

/** Body: centred on x/z, sitting on y = 0; the deck (top plate) is at y = PLAYER.deck. */
export const PLAYER = { width: 2.1, depth: 1.5, deck: 0.34 } as const;

/** Platter: rotates about its own Y. Origin on the deck; top face at deck + height. */
export const PLATTER = { x: -0.3, z: 0.02, radius: 0.64, height: 0.05, spindleRadius: 0.016, spindleHeight: 0.045 } as const;
export const PLATTER_TOP = PLAYER.deck + PLATTER.height;

/**
 * Record: `record_authored` origin is the record's bottom centre. Seated, it sits on the
 * platter top. `record_secondary` (child) carries spin and the settle wobble.
 */
export const RECORD = { radius: 0.6, thickness: 0.02, labelRadius: 0.2, holeRadius: 0.02, grooveOuter: 0.56, grooveInner: 0.24 } as const;
export const RECORD_TOP = PLATTER_TOP + RECORD.thickness;
export const RECORD_SEATED = new Vector3(PLATTER.x, PLATTER_TOP, PLATTER.z);

/**
 * Tonearm: `tonearm_pivot` sits at the bearing (yaw about +Y). Its child `tonearm_lift`
 * pitches about local X (negative raises the headshell). In the arm's local frame the tube
 * runs along +Z and the stylus tip is at (0, −TONEARM.drop, TONEARM.length), so with zero lift
 * the tip rests exactly on the record's top face.
 */
export const TONEARM = {
  pivot: new Vector3(0.68, 0.44, -0.42),
  length: 0.98,
  drop: 0.44 - RECORD_TOP,
  /** Yaw (rotation.y) with the arm on its rest post. */
  parkedYaw: -0.102,
  /** Lift (rotation.x) that clears the record by ≈3 cm at the stylus. */
  liftedPitch: -0.035,
  /** Rest post under the tube (world x/z) and its saddle height. */
  rest: new Vector3(0.6, 0.428, 0.36),
} as const;

/**
 * Dust cover: `lid_hinge` pivots about +X at the back edge; `lid_mesh` is a box cover that
 * encloses platter, record and parked tonearm when closed (inner clearance ≥ 1.2 cm).
 */
export const LID = {
  hinge: new Vector3(0, 0.36, -0.73),
  /** rotation.x of lid_hinge: 0 closed, OPEN tilted back ≈ 75.6°. */
  open: -1.32,
  closed: 0,
  width: 2.06,
  length: 1.46,
  height: 0.17,
  wall: 0.014,
} as const;

/** Small status mark on the plinth front (lights when playing; never pulses). */
export const STATUS_MARK = new Vector3(0.74, 0.11, PLAYER.depth / 2 + 0.003);

/**
 * Complete motion bounds: open lid, hovering record, parked and playing arm. x carries extra
 * symmetric margin (motion needs only ±(width/2 + 0.02)) so the fitted ready pose shows the
 * plinth at ≈72 % of stage width (Master §5: 60–75 %; its sharp 2.1 × 1.5 box projects to
 * ≈73.7 %, the rounded corners read narrower).
 */
export const PARTY_BOUNDS = new Box3(new Vector3(-PLAYER.width / 2 - 0.13, 0, -1.0), new Vector3(PLAYER.width / 2 + 0.13, 1.86, PLAYER.depth / 2 + 0.05));

/**
 * Yaw that puts the stylus on the groove at `radius` from the spindle (the arm's inner
 * solution, headshell towards the record centre). Pure: used by sequences and tests.
 */
export function tonearmYawFor(radius: number): number {
  const px = TONEARM.pivot.x, pz = TONEARM.pivot.z;
  const dx = PLATTER.x - px, dz = PLATTER.z - pz;
  const d = Math.hypot(dx, dz);
  const L = TONEARM.length;
  // Angle at the pivot between the pivot→spindle line and the pivot→stylus line.
  const cos = (L * L + d * d - radius * radius) / (2 * L * d);
  const alpha = Math.acos(Math.max(-1, Math.min(1, cos)));
  const toCentre = Math.atan2(dx, dz); // yaw pointing at the spindle
  return toCentre + alpha; // swing outward (towards the front) from the centre line
}

/** Stylus tip in world space for a given yaw/pitch (tests and contact checks). */
export function stylusAt(yaw: number, pitch: number, out = new Vector3()): Vector3 {
  const L = TONEARM.length, h = -TONEARM.drop;
  // Local tip (0, h, L) pitched about X, then yawed about Y.
  const y1 = h * Math.cos(pitch) - L * Math.sin(pitch);
  const z1 = h * Math.sin(pitch) + L * Math.cos(pitch);
  return out.set(TONEARM.pivot.x + z1 * Math.sin(yaw), TONEARM.pivot.y + y1, TONEARM.pivot.z + z1 * Math.cos(yaw));
}

