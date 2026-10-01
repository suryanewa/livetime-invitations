import { Euler, Quaternion, Vector3 } from 'three';
import {
  CARD, CARD_OFFSET_Y, FACE, facePoint, SLOT, HANG_PIVOT, HOLDER_CLIPS, HOOK, hookCentreline, LANYARD_TOP_Y, PRESS_DEPTH, RIDE, RIDE_HANG, SCAN_CONTACT_W,
  SCAN_SPOT,
} from '../../../models/businessContract.ts';

/**
 * Business canonical poses and path keys (Business sub-spec), v1.2 on the badge and reader
 * masters. Positions are the `card_authored` pivot (the swivel eye), in business_root space.
 */

export const DURATIONS = { host: 1.2, accept: 1.5, decline: 1.5 } as const;

/** Contact beat: the indicator changes exactly once, as a function of time. */
export const SCAN_AT = 0.72;

/** Reading face (business_root space): outward normal and up the 11.6° lean. */
export const FACE_NORMAL = FACE.normal.clone();
export const FACE_UP = FACE.up.clone();
/** Centre of the scan spot on the glass (over the NFC mark). */
export const PAD_CENTER = facePoint(SCAN_SPOT.u, SCAN_SPOT.v, 0);

/** Card tilt that lays its face flat on the reading face (rotation about x: top back). */
export const SCAN_TILT = -FACE.lean;
/**
 * v1.1 turned the card 20° about its long axis at the reader so the laminate stopped mirroring
 * the key softbox. The master reader's face is nearly upright (11.6°), so flat on the glass the
 * mirror already falls about 42° from the key: the card is pressed flat (a real tap).
 */
export const SCAN_YAW = 0;

// ── Card on the hook ─────────────────────────────────────────────────────────────────
const X = new Vector3(1, 0, 0);
/** Card centre in clip (hook) space when the card turns by `tilt` about the slot's ride point. */
export function cardOnHook(tilt: number, out = new Vector3()): Vector3 {
  return out.set(0, CARD_OFFSET_Y - RIDE_HANG.y, 0).applyAxisAngle(X, tilt).add(RIDE_HANG);
}

/**
 * Hook tilt relative to the card at the reader. Pressed flat to the glass, the hook's U (which
 * runs through the holder's slot and bulges behind it) would pass into the reader, so the clip
 * turns on the slot until its back clears the glass plane, as a real clip flops forward when its
 * badge is pressed to a reader. Smallest such angle with a 2 mm (stage 0.026) margin, found once.
 */
export const HOOK_LIFT = (() => {
  const margin = 0.006;
  const pts = hookCentreline(0.002);
  // Card back contact plane (clips on the glass) in clip space, card turned by −k about RIDE_HANG.
  const clear = (k: number) => {
    const n = new Vector3(0, 0, 1).applyAxisAngle(X, -k);
    const plane = new Vector3(0, 0, -HOLDER_CLIPS.halfDepth).applyAxisAngle(X, -k).add(cardOnHook(-k));
    let worst = Infinity;
    for (const p of pts) worst = Math.min(worst, p.clone().sub(plane).dot(n) - HOOK.tube);
    return worst;
  };
  let lo = 0, hi = Math.PI / 2;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (clear(mid) >= margin) hi = mid;
    else lo = mid;
  }
  return hi;
})();

/**
 * Hover gap at the scan pose: the clips sit 0.2 mm off the glass (no coplanar contact), and the
 * press closes it and pushes the glass in by PRESS_DEPTH.
 */
export const SCAN_GAP = 0.003;

function scanPose(): { pivot: Vector3; rot: Euler; cardTilt: number } {
  const centre = facePoint(SCAN_SPOT.u, SCAN_SPOT.v, SCAN_CONTACT_W + SCAN_GAP);
  const rot = new Euler(SCAN_TILT + HOOK_LIFT, SCAN_YAW, 0);
  const off = cardOnHook(-HOOK_LIFT).applyQuaternion(new Quaternion().setFromEuler(rot));
  return { pivot: centre.sub(off), rot, cardTilt: -HOOK_LIFT };
}
const SCAN = scanPose();

export const POSE = {
  ready: { pivot: HANG_PIVOT.clone(), rot: new Euler(0, 0, 0) },
  scan: { pivot: SCAN.pivot, rot: SCAN.rot, cardTilt: SCAN.cardTilt },
  rest: { pivot: new Vector3(-0.24, 1.9, 0.42), rot: new Euler(0, 0, -0.035) },
} as const;

/** Card travel at the press: the hover gap plus the glass's give. */
export const PRESS_TRAVEL = SCAN_GAP + PRESS_DEPTH;

// ── Host attach (clip space) ─────────────────────────────────────────────────────────
/**
 * The snap hook is a closed C: the holder's strip enters through the gate gap with the card at
 * right angles to the front leg, the slot slides along the leg and round the U, and the hook swings
 * down under the eye with the card hanging from it.
 *
 * v1.2.1: the host holds the hook turned back 80° on its eye (HOST.hookTilt), so its front leg is
 * nearly level and its gate faces down; the card, hanging nearly upright below it, is pushed up
 * through the gate. Square to the leg, the card then leans back only 10° (its laminate stays
 * 48° from the key light's mirror angle), and while the slot rounds the U the card turns with the
 * wire exactly as the hook swings down, so the card itself never pitches more than those 10°: the
 * drop is the hook swinging home (a quarter of the pendulum's period or more), not the card
 * flipping over. v1.2 offered the card face-up at 45° (11° from the mirror angle: the print washed
 * out) and then dropped it to hanging in 0.1 s.
 */
export const HOST = {
  /** Host-ready card pose (card centre in clip space, tilt about x). */
  offset: new Vector3(0, CARD_OFFSET_Y - 0.3, 0.16),
  tilt: 0.08,
  /** Ride-point height that threads the strip through the gate gap (gap centre). */
  gapY: (HOOK.gapTop + HOOK.gapBottom) / 2,
  /** Ride point in front of the gap before the push (hook space z). */
  entryZ: HOOK.legZ + 0.075,
  /** Hook tilt on its eye while taking the card (rad; + = its bottom back). */
  hookTilt: (80 * Math.PI) / 180,
  /** The hook does not turn on its swivel (the swivel eye stays square in the D-ring). */
  swivel: 0,
  /** Gate held open inwards (rad). */
  gateOpen: 1.95,
} as const;
/** Ride-point path down the front leg and round the U (hook space), by arc length. */
export const HOOK_PATH = (() => {
  const leg = HOST.gapY - HOOK.arcY;
  const arc = (HOOK.arcR * Math.PI) / 2;
  return { leg, arc, length: leg + arc };
})();

/** Ride point and relative card tilt at arc length s along HOOK_PATH (0 = gap, end = hanging). */
export function hookRide(s: number, out: Vector3): number {
  const { leg, arc } = HOOK_PATH;
  if (s <= leg) {
    out.set(0, HOST.gapY - s, HOOK.legZ);
    return -Math.PI / 2;
  }
  const phi = (Math.PI / 2) * (1 - Math.min(1, (s - leg) / arc));
  out.set(0, HOOK.arcY - Math.cos(phi) * HOOK.arcR, Math.sin(phi) * HOOK.arcR);
  return -phi;
}

/**
 * Card centre (hook space) for a ride point and relative tilt. `rideY` is the card-space height
 * of the slot point on the wire: the slot's middle while the card threads on (clear of both
 * edges), RIDE once it hangs (the strip resting on the U).
 */
export function cardFromRide(ride: Vector3, tilt: number, out: Vector3, rideY: number = RIDE.y): Vector3 {
  return out.set(0, -rideY, 0).applyAxisAngle(X, tilt).add(ride);
}
/** The slot's middle (card space y). */
export const SLOT_MID = (SLOT.top + SLOT.bottom) / 2;

/** Lanyard anchors sit off-frame above the clip and trail it horizontally. */
export const ANCHOR_RISE = LANYARD_TOP_Y - HANG_PIVOT.y;
export const ANCHOR_LAG = 0.1;

export { STATUS_COLOURS } from '../../../models/business.ts';
export { CARD, PRESS_DEPTH };
