import { Vector3 } from 'three';
import { LID, PLATTER, PLATTER_TOP, RECORD, RECORD_SEATED, TONEARM, tonearmYawFor } from '../../../models/recordContract.ts';

/**
 * Party canonical poses and path keys (Party sub-spec). Record positions are the
 * record_authored origin (record bottom centre) in party_root space.
 */

export const DURATIONS = { host: 1.2, accept: 1.6, decline: 1.4 } as const;

/** Playback beat: the status mark changes exactly once, as a function of time. */
export const PLAY_AT = 0.5;

/** Pre-action presentation: hovering above the platter, label tipped towards the camera. */
export const HOVER = {
  pos: new Vector3(PLATTER.x - 0.06, PLATTER_TOP + 0.62, PLATTER.z + 0.14),
  tilt: 0.9,
};

/** Aligned over the spindle, still slightly tipped (end of the 0–0.20 s beat). */
export const ALIGNED = {
  pos: new Vector3(PLATTER.x, PLATTER_TOP + 0.4, PLATTER.z),
  tilt: 0.34,
};

/** Height above the platter at which the record must be level and centred (spindle top + margin). */
export const LEVEL_BY = PLATTER.spindleHeight + 0.05;

export const SEATED = RECORD_SEATED;

/** Tonearm yaw on the lead-in groove and where playback leaves it (slight inward drift). */
export const ARM = {
  parked: TONEARM.parkedYaw,
  cue: tonearmYawFor(RECORD.grooveOuter),
  played: tonearmYawFor(RECORD.grooveOuter - 0.022),
  lifted: TONEARM.liftedPitch,
};

/**
 * Bounded stylised playback: the record turns just over one revolution (clockwise from
 * above) and eases into the accepted display angle. Deliberately faster than 33⅓ rpm so a
 * silent clip reads as playing.
 */
export const SPIN = {
  /** Total rotation at the end of acceptance: −(2π + 0.9); negative is clockwise from above. */
  total: -(2 * Math.PI + 0.9),
};

export const LID_OPEN = LID.open;
export const LID_CLOSED = LID.closed;

export const STATUS_COLOUR = '#3BE08A';
