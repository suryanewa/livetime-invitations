import { Vector3 } from 'three';
import { CONTACT_PITCH, CUE, LID, PLATTER, PLATTER_TOP, RECORD, RECORD_SEATED, TONEARM, tonearmYawFor } from '../../../models/recordContract.ts';

/**
 * Party canonical poses and path keys (Party sub-spec). Record positions are the
 * record_authored origin (record bottom centre) in party_root space.
 */

export const DURATIONS = { host: 1.2, accept: 1.6, decline: 1.4 } as const;

/** Playback beat: the status key lights exactly once, as a function of time. */
export const PLAY_AT = 0.5;

/**
 * Pre-action presentation: hovering above the platter, label tipped towards the camera. High
 * enough that the tipped record's lowest edge clears the mat by 0.16 (its radius is 0.76).
 *
 * The tilt stays below the studio key's mirror angle on the vinyl. From about 0.8 rad up, the
 * key's broad (anisotropic, roughness 0.38) specular lobe fills the disc, which then reads as a
 * grey-silver CD with white rings, and it falls off within a few hundredths of a radian (the
 * frame's dark area grows from 14k to 25k pixels between 0.85 and 0.80). At 0.65 the record reads
 * black with a faint groove sheen, and the host path (0.65 → 0.30 → 0) never crosses that lobe,
 * so its shade changes smoothly. TILT_MAX_SHEEN is the bound the test holds it under.
 */
export const HOVER = {
  pos: new Vector3(PLATTER.x - 0.06, PLATTER_TOP + 0.76, PLATTER.z + 0.16),
  tilt: 0.65,
};
/** Highest presentation tilt that stays clear of the key's specular lobe (measured, see HOVER). */
export const TILT_MAX_SHEEN = 0.7;

/** Aligned over the spindle, still slightly tipped (end of the 0–0.20 s beat). */
export const ALIGNED = {
  pos: new Vector3(PLATTER.x, PLATTER_TOP + 0.42, PLATTER.z),
  tilt: 0.3,
};

/** Height above the mat at which the record must be level and centred (spindle top + margin). */
export const LEVEL_BY = PLATTER.spindleHeight + 0.05;

export const SEATED = RECORD_SEATED;

/**
 * Tonearm yaw on its rest, on the lead-in groove (the master's own authored arm pose) and where
 * playback leaves it (tracking inward); pitch lifted for the swing and set down on the vinyl.
 */
export const ARM = {
  parked: TONEARM.parkedYaw,
  cue: tonearmYawFor(RECORD.grooveOuter),
  played: tonearmYawFor(RECORD.grooveOuter - 0.025),
  lifted: TONEARM.liftedPitch,
  contact: CONTACT_PITCH,
};

/**
 * Belt-drive playback. The motor starts at SPIN.start; the platter (with the record on it) follows
 * through the elastic belt as a critically damped lag, ω = ω_ss·(1 − (1 + a·u)·e^(−a·u)), so it
 * starts from rest with zero angular acceleration and reaches 95 % of speed ≈0.35 s later. Steady
 * state is 33⅓ rpm scaled to the beat (BEAT_SCALE ≈ 2.2: a silent 1.6 s clip has to read as
 * playing). From SPIN.brakeAt the platter brakes along a smootherstep to rest at the end of the
 * clip, so the accepted pose is still (no idle spin) at its display angle. Negative is clockwise
 * from above.
 */
export const SPIN = {
  start: 0.3,
  /** Belt lag rate a (1/s). */
  lag: 13.5,
  brakeAt: 1.1,
  stopAt: 1.6,
  /** Total rotation at the end of acceptance (the display angle: one turn plus 0.6 rad). */
  total: -(2 * Math.PI + 0.6),
};
export const RPM_33 = (100 / 3) * ((2 * Math.PI) / 60);

export const LID_OPEN = LID.open;
export const LID_CLOSED = LID.closed;

/** Cue lever angle and lift-platform rise at full lift (see CUE in the contract). */
export const CUEING = { leverUp: CUE.leverUp, liftRise: CUE.liftRise };

export const STATUS_COLOUR = '#3BE08A';
