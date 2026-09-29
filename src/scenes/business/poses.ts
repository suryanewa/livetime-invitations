import { Euler, Vector3 } from 'three';
import { CARD, CARD_OFFSET_Y, FACE_F0, FACE_F1, HANG_PIVOT, HOOK, LANYARD_TOP_Y, SCANNER_FOOT, SCANNER_POS } from '../../../models/keycard.ts';

/**
 * Business canonical poses and path keys (Business sub-spec). All positions are the
 * card_authored pivot (the clip), in business_root space.
 */

export const DURATIONS = { host: 1.2, accept: 1.5, decline: 1.5 } as const;

/** Contact beat: the indicator changes exactly once, as a function of time. */
export const SCAN_AT = 0.72;

// Reading-face frame in world space (matches the geometry builder).
const fc = { z: (FACE_F0.x + FACE_F1.x) / 2, y: (FACE_F0.y + FACE_F1.y) / 2 };
const n = new Vector3(0, -(FACE_F1.y - FACE_F0.y), FACE_F1.x - FACE_F0.x);
export const FACE_NORMAL = new Vector3(0, n.z, n.y).normalize(); // (0, y, z)
const nz = FACE_F1.x - FACE_F0.x, ny = FACE_F1.y - FACE_F0.y;
const len = Math.hypot(nz, ny);
/** Unit vector pointing up the reading face (towards the scanner's back edge). */
export const FACE_UP = new Vector3(0, -ny / len, -nz / len);
export const PAD_CENTER = new Vector3(SCANNER_POS.x - 0.1, SCANNER_FOOT + fc.y + 0.03, SCANNER_POS.z + fc.z + 0.03);

/** Card tilt that lays its face parallel to the reading face. */
export const SCAN_TILT = -Math.asin(FACE_NORMAL.y);

function scanPivot(): Vector3 {
  // Card centre hovers over the face with its lower edge just past the pad; kept left of the
  // indicator window so the status stays visible.
  const centre = new Vector3(0.33, PAD_CENTER.y, PAD_CENTER.z)
    .addScaledVector(FACE_UP, CARD.height / 2 - 0.2)
    .addScaledVector(FACE_NORMAL, 0.07);
  const offset = new Vector3(0, CARD_OFFSET_Y, 0).applyEuler(new Euler(SCAN_TILT, 0, 0));
  return centre.sub(offset);
}

export const POSE = {
  ready: { pivot: HANG_PIVOT.clone(), rot: new Euler(0, 0, 0) },
  scan: { pivot: scanPivot(), rot: new Euler(SCAN_TILT, 0, 0) },
  rest: { pivot: new Vector3(-0.22, 1.98, 0.3), rot: new Euler(0, 0, -0.035) },
} as const;

/**
 * Host attach path (card_mesh centre in clip space). The card stays vertical: it lifts to
 * slot height in front of the open gate, slides straight back over the gate and run, the gate
 * swings up clear of its face, then the slot's top edge settles onto the run.
 */
const SLOT_ON_RUN = HOOK.runY - CARD.slotY; // slot centred on the run (sliding height)
export const HOST_CARD = {
  offset: new Vector3(0, CARD_OFFSET_Y - 0.32, 0.12),
  front: new Vector3(0, SLOT_ON_RUN, HOOK.hinge + HOOK.gateLength + CARD.depth / 2 + 0.03),
  slid: new Vector3(0, SLOT_ON_RUN, 0),
  tilt: 0.1,
  /** Open: gate rotated forward, in line with the run. */
  gateOpen: Math.PI / 2,
};

/** Lanyard anchors sit off-frame above the clip and trail it horizontally. */
export const ANCHOR_RISE = LANYARD_TOP_Y - HANG_PIVOT.y;
export const ANCHOR_LAG = 0.1;

export const STATUS_COLOURS = { accept: '#3BE08A', decline: '#E53E3E' } as const;
