import { Vector3 } from 'three';
import { CONTACT_PITCH, CUE, LID, PLATTER, PLATTER_TOP, RECORD, RECORD_SEATED, TONEARM, tonearmYawFor } from '../../../models/recordContract.ts';

/**
 * Party canonical poses and path keys (Party sub-spec). Record positions are the
 * record_authored origin (record bottom centre) in party_root space.
 */

/**
 * v1.5 polish: acceptance runs 1.85 s (was 1.6): a real deck's order, the platter first and the arm
 * at a hand's pace once it is at speed (ACCEPT_ARM), ends 0.2 s after the stylus lands.
 */
export const DURATIONS = { host: 1.2, accept: 1.85, decline: 1.4 } as const;

/**
 * The start/stop key is pressed: it lights and the motor starts (SPIN.start). It lights exactly
 * once, as a function of time, three frames after the tap so the clip's first frame is still the
 * ready pose.
 */
export const PLAY_AT = 0.05;

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

/** Height above the mat at which the record must be level and centred (spindle top + margin). */
export const LEVEL_BY = PLATTER.spindleHeight + 0.05;

export const SEATED = RECORD_SEATED;

/**
 * Setting the record on the spindle (host, v1.5): one hand gesture, a short drop, a coin's settle.
 *
 * - **Reach** (0 → `reach.time`): the hand carries the record from the presentation pose down to
 *   the mat along a Beta(3, 4) progress, the speed profile of a human placing movement (one bell,
 *   zero speed and acceleration at the start, its peak at 40 %: the approach is longer than the
 *   start). The same profile levels it by `reach.levelAt` and carries it back over the spindle from
 *   `reach.alignFrom` to `reach.alignAt` (3 cm above LEVEL_BY). Levelling and moving back go
 *   together: levelling alone would push the front edge out of the frame's motion bounds (it
 *   reaches 3 cm further), and moving back before the record has come down would put its back edge
 *   into the open cover's lean (the hover is 2.1 mm from the cover's inside; this path never comes
 *   closer, where v1.2's came to 1.2 mm). The path curves down and back and then runs straight
 *   down the spindle; the hole guides it from there.
 * - **Release** at `release.height` (8 mm): a hand holding a 12" record by its edge cannot follow it
 *   below the platter's rim, so the last few millimetres are a drop. The fingers leave one side
 *   first: the record tips by `release.tilt` (0.8°), starting `release.lead` before they let go, so
 *   slowly that its centre never stops descending. The low rim's gap then closes along a quintic
 *   from its state at the release (position, speed, acceleration: still the hand's 11 cm/s) to
 *   zero gap with zero speed and acceleration `release.fall` later: the air film under the disc
 *   brakes it (the "soft slap"), so the low rim meets the mat at rest and the motion is C².
 * - **Settle**: from that touch the record rides on its low rim (centre R·sin(tilt) above the mat)
 *   while the tilt decays to exactly zero over `settle.time`, never growing back (no hop), and the
 *   low side runs round the rim faster as the tilt falls (a coin settling on a table: Euler's disc
 *   precession rises as the tilt decays; capped at `settle.hz` so 60 fps never aliases it).
 */
export const PLACE = {
  reach: { time: 0.9, target: 0, levelAt: 0.52, alignFrom: 0.08, alignAt: 0.52 },
  release: { height: 0.04, fall: 0.07, tilt: 0.014, lowSide: 2.2, lead: 0.12 },
  /** Settle: time from the first touch to flat (s) and the precession at the end (Hz). */
  settle: { time: 0.28, hz: 6 },
} as const;

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

export const RPM_33 = (100 / 3) * ((2 * Math.PI) / 60);

/**
 * Belt-drive playback (v1.5: the record plays on after acceptance; spec revision #37). The motor
 * starts when the key is pressed (SPIN.start = PLAY_AT), before the arm moves, as on a real deck:
 * the stylus is cued at 1.65 s onto a record at 99.6 % of speed. The platter (with the record on
 * it) follows through the elastic belt as a critically damped lag, ω = ω_ss + (A + B·u)·e^(−a·u) (from rest A = −ω_ss, B = a·A: zero angular
 * acceleration at the start), and then runs at ω_ss for as long as the record plays: the clip hands
 * the same closed form over to the scene's continuous channel (index.ts), so speed and acceleration
 * are continuous at the hand-over. No brake: the accepted pose is "playing at the display angle",
 * the lead-in done (sequences.ts ACCEPTED_AT).
 *
 * ω_ss is the real 33⅓ rpm (1.8 s a turn). v1.2 ran 2.2× faster because a silent 1.6 s clip that
 * braked to a stop had to read as playing; with the perpetual spin that reason is gone, and at the
 * 18° lens the true speed reads as a turntable (2.2× read as a 78 on a toy). The lag a = 4.75/s
 * reaches 95 % of speed 1.0 s after the motor starts: a DC-servo belt drive (DJ belt decks quote
 * "< 1 s"; low-torque hi-fi decks 2–5 s; direct drives 0.5–0.7 s, which v1.2's 0.35 s resembled).
 * Negative rotation is clockwise from above.
 */
export const SPIN = {
  start: PLAY_AT,
  /** Belt lag rate a (1/s). */
  lag: 4.75,
  /** Steady platter speed (rad/s): 33⅓ rpm. */
  steady: RPM_33,
};

/**
 * Motor off (a change of mind after acceptance): the platter freewheels down. Bearing friction alone
 * lets a belt-drive platter coast 10–15 s; the stopped motor's cogging and the belt's hysteresis
 * drag on it too, which this models as a viscous term `k` plus a Coulomb term `c` (rad/s²): from
 * 33⅓ rpm it slows to 62 % in the 0.7 s before the closing cover hides the label and stops 3.0 s
 * after the motor is cut (dω/dt = −(c + k·ω); stiction holds it once stopped).
 */
export const COAST = { k: 0.5, c: 0.5 };

/**
 * The arm at a hand's pace (v1.5 polish; sequences.ts `armPath`). A real cue lever lifts the arm in
 * a fraction of a second; the hand swings it at 60–90°/s; the cue's damper lowers the stylus over
 * the better part of a second. Times in seconds:
 * - `reach`: the hand goes from the start key to the cue lever after the press (accept only).
 * - `lift`: the cue lever raises the arm off its rest or out of the groove (yaw held meanwhile).
 * - `swing`: the whole rest-to-lead-in swing (0.41 rad: peak 1.41 rad/s, 81°/s; shorter swings
 *   take time ∝ √distance), `brake` the hand's deceleration limit (rad/s²) when the arm was moving
 *   away from where it now has to go.
 * - `cueAt`/`cue`: the damper's descent starts no earlier than `cueAt` (by then the platter is at
 *   99 % of speed) and takes `cue`: the stylus lands at `cueAt + cue` (STYLUS_DOWN).
 * - `lower`: onto the rest when the arm comes home.
 * - `leadIn`: the record turns this far (rad: 1.5 turns, 2.7 s at 33⅓) while the lead-in groove
 *   carries the stylus from the cue to `played`; it ends after the clip, while the record plays.
 * The arm never leaves its mechanism's range: yaw between `played` and `parked`, pitch between the
 * cue lift's top and the vinyl (or the rest).
 */
export const ACCEPT_ARM = { reach: 0.15, lift: 0.2, swing: 0.55, brake: 12, cueAt: 0.9, cue: 0.75, lower: 0.25, leadIn: 3 * Math.PI } as const;

/**
 * A change of mind (v1.5; the scene draws its own hand-over, index.ts `interruptCut`):
 * - Decline after acceptance: the motor is cut and the platter coasts (COAST); the arm goes home
 *   along `armPath` from the pose on screen (lift if down, brake if it was swinging out, swing,
 *   lower onto the rest); the key goes dark at once, as a real stop button's lamp does. The cover
 *   closes as authored.
 * - Accept after a decline began: the cover is lifted back open from wherever it is (`lid`), the
 *   arm goes to the cue along `armPath` from the pose on screen and is lowered at the authored time,
 *   and a platter still coasting is picked up by the belt when the motor starts.
 * Every hand-over starts from the pose on screen with its velocity (C¹).
 */
export const CHANGE = { lid: 0.5 } as const;

export const LID_OPEN = LID.open;
export const LID_CLOSED = LID.closed;

/** Cue lever angle and lift-platform rise at full lift (see CUE in the contract). */
export const CUEING = { leverUp: CUE.leverUp, liftRise: CUE.liftRise };

export const STATUS_COLOUR = '#3BE08A';
