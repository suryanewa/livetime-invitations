import { Box3, Vector3 } from 'three';

/**
 * Party record player — shared contract between the recipe (`scripts/masters/recipes/party.ts`),
 * the scaffold builder (`recordPremium.ts`, `buildPartyScaffold`), the rig (`recordPlayer.ts`) and
 * the choreography (`src/scenes/party`). Units are scene units (stage decimetres).
 *
 * v1.2: the player is the scan-to-CAD turntable master (`models/masters/vintage-turntable.glb`)
 * at TT_SCALE. Every number below was measured from the master (scan units, `scripts/masters/
 * inspect.ts` and the importer's exact vertex boxes) and converted with `fromMaster`;
 * `tests/party.test.ts` ("Party runtime GLB matches the contract") re-measures the exported GLB.
 */

export type RecordLabel = 'coral' | 'cobalt';

/** Nodes the runtime looks up (the export fails if one is missing or duplicated). */
export const PARTY_NODES = [
  'party_root', 'player_body', 'platter', 'record_authored', 'record_secondary', 'record_label', 'tonearm_pivot',
  'tonearm_lift', 'tonearm_rest', 'cue_lever', 'cue_lift', 'lid_hinge', 'player_status', 'record_shadow', 'player_shadow',
] as const;

// ── Master → scene ────────────────────────────────────────────────────────────────
/** Scan → scene units: the master plinth's 1.855 width becomes 2.1, the v1.1 player width. */
export const TT_SCALE = 2.1 / 1.855;
/**
 * World units per Party scene unit (v1.4, models/worldScale.ts): 1. Party was already authored at
 * the world scale: the record (2 × RECORD.radius = 1.5216) is 30.43 cm, a 12-inch LP (30.48 cm)
 * to 0.16 %, and the plinth 42.1 × 32.4 cm.
 */
export const PARTY_WORLD_SCALE = 1;
/** Master point (scan units) that lands on the scene origin: the plinth's x/z centre, the feet's soles. */
export const TT_ORIGIN = [0.0125, -0.701, 0.115] as const;
/** A master point (scan units, the master's own frame) in party_root space. */
export function fromMaster(x: number, y: number, z: number, out = new Vector3()): Vector3 {
  return out.set((x - TT_ORIGIN[0]) * TT_SCALE, (y - TT_ORIGIN[1]) * TT_SCALE, (z - TT_ORIGIN[2]) * TT_SCALE);
}
const s = (scan: number) => scan * TT_SCALE;

/** Body: centred on x/z, feet on y = 0; the deck (plinth top, y −0.400 scan) at PLAYER.deck. */
export const PLAYER = { width: s(1.855), depth: s(1.43), deck: s(-0.4 + 0.701) } as const;

/**
 * Platter (with its rubber mat and spindle) turns about the spindle axis; `platter` sits on that
 * axis at the record seat (rubber mat top, y −0.328 scan). Spindle r 0.0155, top y −0.2582.
 */
const SPINDLE = fromMaster(-0.145, -0.328, 0.122);
export const PLATTER = {
  x: SPINDLE.x, z: SPINDLE.z, radius: s(0.697), spindleRadius: s(0.0155), spindleHeight: s(-0.2582 + 0.328),
} as const;
/** Record seat: the mat's top face. */
export const PLATTER_TOP = SPINDLE.y;

/**
 * Record: `record_authored` origin is the record's bottom centre (record_edge's underside, y −0.328
 * scan); seated it sits on the mat. `record_secondary` (child) carries spin and the settle wobble.
 * The master record is 0.0085 scan thick with a 0.0158 centre hole (0.0003 round the spindle) and a
 * 0.232 paper label; `grooveOuter` is the radius of the master's own authored stylus (0.5938), the
 * lead-in groove where the arm is cued.
 */
export const RECORD = {
  radius: s(0.672), thickness: s(0.0085), labelRadius: s(0.232), holeRadius: s(0.0158), grooveOuter: s(0.59384), grooveInner: s(0.262),
} as const;
export const RECORD_TOP = PLATTER_TOP + RECORD.thickness;
export const RECORD_SEATED = new Vector3(PLATTER.x, PLATTER_TOP, PLATTER.z);

/**
 * Tonearm: `tonearm_pivot` sits at the gimbal bearing (the master's `tonearm_gimbal` origin) and
 * yaws about +Y; its child `tonearm_lift` pitches about local X at the same point (negative
 * raises the headshell). The recipe creates the pivot turned to the master's cue yaw, so in the
 * arm's frame the stylus tip lies exactly on +Z at (0, −drop, length). The gimbal housing yaws
 * only; the tube, headshell, cartridge and counterweight pitch with the lift.
 */
const PIVOT_M = [0.64, -0.228, -0.282] as const;
const TIP_M = [0.35842, -0.31723, 0.43698] as const;
export const TONEARM = {
  pivot: fromMaster(...PIVOT_M),
  length: s(Math.hypot(TIP_M[0] - PIVOT_M[0], TIP_M[2] - PIVOT_M[2])),
  drop: s(PIVOT_M[1] - TIP_M[1]),
  /** The master's authored arm yaw: stylus on the lead-in groove (RECORD.grooveOuter). */
  cueYaw: Math.atan2(TIP_M[0] - PIVOT_M[0], TIP_M[2] - PIVOT_M[2]),
  /**
   * Yaw on its rest: swung out 0.413 rad (23.7°) from the cue towards the front-right corner, so
   * the parked headshell and cartridge sit beside the platter, clear of its silver rim (as a real
   * arm parks), not over it.
   */
  parkedYaw: 0.04,
  /** Lift (rotation.x) that clears the record by ≈3 cm at the stylus. */
  liftedPitch: -0.035,
  /** Arm frame point (x across, z along) where the rest post's saddle meets the tube's underside. */
  restAt: { x: s(0.079), z: s(0.48) },
  /** Tube underside above the pivot at `restAt` (arm frame y, master: −0.0501 scan). */
  restDrop: s(0.0501),
  /** The tube's direction at `restAt` relative to the arm frame's +Z (it bends towards the headshell). */
  restAngle: -0.2,
  /** Tube radius (master 0.0125 scan). */
  tubeRadius: s(0.0125),
} as const;
/** Pitch that sets the stylus tip down on the record's top face (the master tip floats 0.0023 scan above it). */
export const CONTACT_PITCH = (() => {
  const { length: L, drop } = TONEARM;
  const h = TONEARM.pivot.y - RECORD_TOP;
  // Solve drop·cos p + L·sin p = h  →  R·sin(p + φ) = h with R = hypot(L, drop), φ = atan2(drop, L).
  return Math.asin(h / Math.hypot(L, drop)) - Math.atan2(drop, L);
})();

/** Rest post: world x/z of its saddle (under the parked tube) and the saddle height. */
export const REST = (() => {
  const { x, z } = TONEARM.restAt;
  const c = Math.cos(TONEARM.parkedYaw), sn = Math.sin(TONEARM.parkedYaw);
  return new Vector3(TONEARM.pivot.x + x * c + z * sn, TONEARM.pivot.y - TONEARM.restDrop, TONEARM.pivot.z - x * sn + z * c);
})();

/**
 * Cueing: the lever (`cue_lever`, the master's cue_lever_handle) turns about its post's top
 * (local Z after its −6° yaw) and the lift platform (`cue_lift`, the master's arm_lift_bar)
 * rises under the tube's root as the arm lifts. Both are driven from the arm's lift.
 */
export const CUE = {
  /** Pivot of the lever (post top, master 0.772, −0.334, −0.140). */
  leverPivot: fromMaster(0.772, -0.334, -0.14),
  /** Lever angle with the arm fully lifted (its free end up ≈ 5 mm). */
  leverUp: 0.42,
  /** Platform rise with the arm fully lifted: its 0.0015 scan gap plus the tube's rise above it. */
  liftRise: s(0.005),
} as const;

/**
 * Dust cover: `lid_hinge` sits on the hinge pins' axis (the master's dust_cover origin, y −0.387,
 * z −0.609 scan) and turns about +X. The master poses the lid open at −62.4° (its shell leaning
 * 27.6° back from vertical): LID.open. LID.closed = 0 is the master lid's own closed frame.
 *
 * The master's cover is a short display lid: closed, it would end 0.30 scan short of the plinth's
 * front, cut through the speed knob and leave the counterweight poking through its top. The rig
 * therefore extends it in place (`extendLid`): vertices past each threshold move out by a constant,
 * so the walls lengthen and the corner fillets, rim and tab keep their exact shape (no scaling).
 * Values in the master's closed lid frame (scan units).
 */
export const LID = {
  hinge: fromMaster(0, -0.387, -0.609),
  open: -1.0890854532444614,
  closed: 0,
  /** Wall and top thickness of the shell (master 0.011 scan). */
  wall: s(0.011),
  extend: {
    front: { from: 0, by: 0.33 },
    up: { from: -0.29, by: 0.034 },
    left: { from: -0.5, by: 0.04 },
    right: { from: 0.5, by: 0.065 },
  },
} as const;
/** The extended closed lid's outer box (master closed-frame scan units → scene): a test re-measures it. */
export const LID_CLOSED_BOX = new Box3(fromMaster(-0.95 + 0.04, -0.398, -0.631), fromMaster(0.87 + 0.065, -0.173 + 0.034, 0.538 + 0.33));

/** The plinth-hinge and lid scan-frame thresholds converted to lid_hinge space (scene units). */
export function lidExtendLocal() {
  const e = LID.extend;
  return {
    front: { from: s(e.front.from + 0.609), by: s(e.front.by) },
    up: { from: s(e.up.from + 0.387), by: s(e.up.by) },
    left: { from: s(e.left.from), by: s(e.left.by) },
    right: { from: s(e.right.from), by: s(e.right.by) },
  };
}

/** Start/stop key (`player_status`, the master's button_cap): lights while the record plays. */
export const STATUS_KEY = fromMaster(0.753, -0.336, 0.447);

/**
 * Side margin (scene units) beside the plinth: the framing breathes as v1.1 did (the player
 * fills 74.6 % of the stage width; tests/party.test.ts "Party framing").
 */
export const FRAME_MARGIN_X = 0.17;
/**
 * Complete motion bounds: open lid, hovering record, parked and playing arm, plus the symmetric
 * framing margin on x. The camera fits `partyFramePoints` (silhouette samples) inside them.
 */
export const PARTY_BOUNDS = new Box3(new Vector3(-PLAYER.width / 2 - FRAME_MARGIN_X, 0, -1.9), new Vector3(PLAYER.width / 2 + FRAME_MARGIN_X, 2.02, PLAYER.depth / 2 + 0.05));

/**
 * Yaw that puts the stylus on the groove at `radius` from the spindle (the arm's outer solution,
 * headshell towards the record centre). Pure: used by sequences and tests.
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

/** Stylus tip in party_root space for a given yaw/pitch (tests and contact checks). */
export function stylusAt(yaw: number, pitch: number, out = new Vector3()): Vector3 {
  return armPoint(yaw, pitch, 0, -TONEARM.drop, TONEARM.length, out);
}

/** A point of the arm's frame (x across, y up, z along the tube from the pivot) in party_root space. */
export function armPoint(yaw: number, pitch: number, x: number, y: number, z: number, out = new Vector3()): Vector3 {
  // Pitched about X, then yawed about Y (three's rotation.x then rotation.y on the parent).
  const y1 = y * Math.cos(pitch) - z * Math.sin(pitch);
  const z1 = y * Math.sin(pitch) + z * Math.cos(pitch);
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  return out.set(TONEARM.pivot.x + x * c + z1 * sn, TONEARM.pivot.y + y1, TONEARM.pivot.z - x * sn + z1 * c);
}
