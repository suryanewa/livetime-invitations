import { Vector3 } from 'three';
import { cubicBezier, EASE, lerp, seg, smoothstep } from '../../motion/curves.ts';
import { PLATTER_TOP, RECORD } from '../../../models/recordContract.ts';
import type { CanonicalPose, SequenceName } from '../../core/types.ts';
import { ARM, CHANGE, COAST, CUEING, DURATIONS, HOVER, LEVEL_BY, LID_CLOSED, LID_OPEN, PLACE, PLAY_AT, RPM_33, SEATED, SPIN } from './poses.ts';

/**
 * Pure authored choreography for Party: every function maps time → transforms, so replay,
 * interruption and frame rate never accumulate rotation, arm offsets or lid energy
 * (Party sub-spec acceptance criteria). Every beat boundary is C1 (the host is C2 throughout).
 *
 * v1.5: the record plays on after acceptance. The platter is a closed-form belt-drive model
 * (`Platter`) that the accept clip samples and the scene keeps evaluating after the clip (index.ts),
 * and a change of mind is drawn by the scene from the pose on screen (`Change`), never by the
 * director's straight blend.
 */

export interface PartyFrame {
  /** record_authored origin (record bottom centre). */
  recordPos: Vector3;
  /** record_authored rotation.x: label tipped towards the camera while presented. */
  recordTilt: number;
  /**
   * record_secondary rotation.x / rotation.z: the settle's tilt vector (its low side precesses
   * round the rim; the edge never dips below the mat). Zero outside the drop and settle.
   */
  wobble: number;
  wobbleZ: number;
  /** Record and platter rotation.y (they turn together once seated). */
  spin: number;
  armYaw: number;
  armPitch: number;
  lid: number;
  status: 'off' | 'lit';
}

export function newFrame(): PartyFrame {
  return frameFor('guest-ready', {
    recordPos: new Vector3(), recordTilt: 0, wobble: 0, wobbleZ: 0, spin: 0, armYaw: 0, armPitch: 0, lid: 0, status: 'off',
  });
}

export function frameFor(pose: CanonicalPose, out: PartyFrame): PartyFrame {
  out.recordPos.copy(pose === 'host-ready' ? HOVER.pos : SEATED);
  out.recordTilt = pose === 'host-ready' ? HOVER.tilt : 0;
  out.wobble = 0;
  out.wobbleZ = 0;
  out.spin = pose === 'accepted' ? -DISPLAY_ANGLE : 0;
  out.armYaw = pose === 'accepted' ? ARM.played : ARM.parked;
  out.armPitch = pose === 'accepted' ? ARM.contact : 0;
  out.lid = pose === 'declined' ? LID_CLOSED : LID_OPEN;
  out.status = pose === 'accepted' ? 'lit' : 'off';
  return out;
}

/** Height of the record's underside above the platter top (drives the contact shadow). */
export function recordHeight(f: PartyFrame): number {
  return f.recordPos.y - PLATTER_TOP;
}

// ── Smooth primitives ─────────────────────────────────────────────────────────
/**
 * Beta(3, 4) CDF, the progress of a placing hand: speed ∝ s²(1−s)³, one bell peaking at 40 % of
 * the movement (the approach is longer than the start), zero speed and acceleration at both ends.
 */
export const reach = (s: number) => (s <= 0 ? 0 : s >= 1 ? 1 : s * s * s * (20 + s * (-45 + s * (36 - 10 * s))));
const reachRate = (s: number) => (s <= 0 || s >= 1 ? 0 : 60 * s * s * (1 - s) ** 3);
const reachAccel = (s: number) => (s <= 0 || s >= 1 ? 0 : 60 * s * (1 - s) ** 2 * (2 - 5 * s));

/** A quintic segment on [0, T] with position, velocity and acceleration given at both ends. */
export class Quintic {
  private readonly c: readonly number[];
  constructor(p0: number, v0: number, a0: number, p1: number, v1: number, a1: number, readonly T: number) {
    const D = p1 - (p0 + v0 * T + (a0 * T * T) / 2), E = v1 - (v0 + a0 * T), F = a1 - a0;
    const T2 = T * T;
    this.c = [p0, v0, a0 / 2, (20 * D - 8 * E * T + F * T2) / (2 * T2 * T), (-30 * D + 14 * E * T - 2 * F * T2) / (2 * T2 * T2), (12 * D - 6 * E * T + F * T2) / (2 * T2 * T2 * T)];
  }
  /** Value at u (held at the end values outside [0, T]). */
  at(u: number): number {
    const x = Math.min(Math.max(u, 0), this.T), c = this.c;
    return c[0]! + x * (c[1]! + x * (c[2]! + x * (c[3]! + x * (c[4]! + x * c[5]!))));
  }
  rate(u: number): number {
    const x = Math.min(Math.max(u, 0), this.T), c = this.c;
    return c[1]! + x * (2 * c[2]! + x * (3 * c[3]! + x * (4 * c[4]! + x * 5 * c[5]!)));
  }
  accel(u: number): number {
    const x = Math.min(Math.max(u, 0), this.T), c = this.c;
    return 2 * c[2]! + x * (6 * c[3]! + x * (12 * c[4]! + x * 20 * c[5]!));
  }
}

/** Monotone root of f on [a, b] (f(a) and f(b) of opposite signs). */
function bisect(f: (x: number) => number, a: number, b: number): number {
  let lo = a, hi = b;
  const up = f(b) > f(a);
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    if ((f(m) > 0) === up) hi = m;
    else lo = m;
  }
  return (lo + hi) / 2;
}

// ── Host: 1.2 s ───────────────────────────────────────────────────────────────
const H0 = HOVER.pos.y - PLATTER_TOP;
const R = RECORD.radius;
const { reach: REACH, release: RELEASE, settle: SETTLE_SPEC } = PLACE;
const handHeight = (t: number) => H0 - (H0 - REACH.target) * reach(t / REACH.time);
const handRate = (t: number) => (-(H0 - REACH.target) * reachRate(t / REACH.time)) / REACH.time;
const handAccel = (t: number) => (-(H0 - REACH.target) * reachAccel(t / REACH.time)) / REACH.time ** 2;

/** The fingers let go: the hand has brought the record down to the release height. */
export const RELEASE_AT = bisect((t) => handHeight(t) - RELEASE.height, 0, REACH.time);
/** The low rim first touches the mat. */
export const CONTACT_AT = RELEASE_AT + RELEASE.fall;
/**
 * Seat-and-settle (v1.5). The tilt the record picked up as it left the fingers peaks halfway down
 * the fall (`peakAt`): the air film under the disc is thinnest under its low side and starts to
 * level it. From the peak the tilt decays as (1 − x)^k·(1 + k·x) (k = 4: zero slope at the peak,
 * a long soft tail, exactly zero with zero slope and curvature at `end`), so it never grows back
 * after contact, and the low side runs round the rim at `hz`·(1 − tilt/peak): faster as it settles.
 */
export const SETTLE = (() => {
  const peakAt = RELEASE_AT + RELEASE.fall / 2;
  const time = SETTLE_SPEC.time + (CONTACT_AT - peakAt);
  return { at: CONTACT_AT, peakAt, peak: RELEASE.tilt, end: peakAt + time, time, k: 4, hz: SETTLE_SPEC.hz, lowSide: RELEASE.lowSide };
})();
const K = SETTLE.k;
/** Decay of the tilt from its peak, x = (t − peakAt)/time ∈ [0, 1]. */
const decay = (x: number) => (x <= 0 ? 1 : x >= 1 ? 0 : (1 - x) ** K * (1 + K * x));
/** ∫₀ˣ decay. */
const decayIntegral = (x: number) => {
  const y = Math.min(Math.max(x, 0), 1);
  return 2 / (K + 2) - (1 - y) ** (K + 1) * (1 - (K * (1 - y)) / (K + 2));
};
/**
 * The tilt's rise to its peak, C² into the decay (zero slope, its curvature). It starts while the
 * hand still lowers the record (`release.lead` before the fingers let go: a hand is never exactly
 * level as it lets go), slowly enough that the record's centre never stops descending.
 */
const TILT_FROM = RELEASE_AT - RELEASE.lead;
const TILT_RISE = new Quintic(0, 0, 0, SETTLE.peak, 0, (-SETTLE.peak * K * (K + 1)) / SETTLE.time ** 2, SETTLE.peakAt - TILT_FROM);
/** Settle tilt magnitude (rad) at time t of the host clip. */
export function settleTilt(t: number): number {
  if (t <= TILT_FROM || t >= SETTLE.end) return 0;
  if (t < SETTLE.peakAt) return TILT_RISE.at(t - TILT_FROM);
  return SETTLE.peak * decay((t - SETTLE.peakAt) / SETTLE.time);
}
/** Azimuth of the low side: fixed while airborne, precessing from the tilt's peak. */
export function settleAzimuth(t: number): number {
  if (t <= SETTLE.peakAt) return SETTLE.lowSide;
  const u = Math.min(t, SETTLE.end) - SETTLE.peakAt;
  return SETTLE.lowSide + 2 * Math.PI * SETTLE.hz * (u - SETTLE.time * decayIntegral(u / SETTLE.time));
}
/** Rotation.x / rotation.z of a tilt `tilt` towards azimuth `phi`, and the centre's lift on the low rim. */
function tiltVector(tilt: number, phi: number, out: { wobble: number; wobbleZ: number }): number {
  out.wobble = tilt * Math.cos(phi);
  out.wobbleZ = tilt * Math.sin(phi);
  // The disc's true tilt under rotation.x then rotation.z: cos θ = cos x·cos z, so
  // sin²θ = sin²x + sin²z·cos²x (this form keeps its precision as the tilt dies away).
  const sx = Math.sin(out.wobble), sz = Math.sin(out.wobbleZ) * Math.cos(out.wobble);
  return R * Math.sqrt(sx * sx + sz * sz);
}
const _tv = { wobble: 0, wobbleZ: 0 };
/** The centre's lift above the low rim at time t (R·sin of the true tilt). */
const liftAt = (t: number) => tiltVector(settleTilt(t), settleAzimuth(t), _tv);
/**
 * Gap under the low rim while it falls: a quintic from its height, speed and acceleration at the
 * release (the hand's, less the tilt's lift) to zero gap with zero speed and acceleration at contact
 * (the air film under the disc brakes it), so the centre (gap + lift) is C² through the release and
 * the touch, and the low rim meets the mat at rest.
 */
const FALL = (() => {
  // The lift is smooth through the release: central differences.
  const e = 1e-4, t0 = RELEASE_AT;
  const liftRate = (liftAt(t0 + e) - liftAt(t0 - e)) / (2 * e);
  const liftAccel = (liftAt(t0 + e) - 2 * liftAt(t0) + liftAt(t0 - e)) / (e * e);
  return new Quintic(handHeight(t0) - liftAt(t0), handRate(t0) - liftRate, handAccel(t0) - liftAccel, 0, 0, 0, RELEASE.fall);
})();

function host(t: number, out: PartyFrame): void {
  frameFor('guest-ready', out);
  out.status = 'off';
  // The reach: level by levelAt, over the spindle by alignAt (moving back only once it has come
  // down from under the open cover), lowered along the spindle to the release.
  const across = reach((t - REACH.alignFrom) / (REACH.alignAt - REACH.alignFrom));
  if (across >= 1) out.recordPos.copy(SEATED);
  else out.recordPos.lerpVectors(HOVER.pos, SEATED, across);
  out.recordTilt = HOVER.tilt * (1 - reach(t / REACH.levelAt));
  const lift = tiltVector(settleTilt(t), settleAzimuth(t), out);
  // Held: the hand's height. Released: the low rim's gap falls to zero at contact; then it rides on
  // its low rim (the centre R·sin(tilt) above the mat).
  out.recordPos.y = PLATTER_TOP + (t < RELEASE_AT ? handHeight(t) : (t < CONTACT_AT ? FALL.at(t - RELEASE_AT) : 0) + lift);
}

// ── The platter: belt drive and coast, in closed form ─────────────────────────
/**
 * The platter's motion from a known state. Angles are magnitudes (rad, turning clockwise from
 * above: rotation.y = −angle). From `at` it coasts with the motor off (COAST) until `motorAt`, if
 * any; from there the belt drives it to SPIN.steady (critically damped lag, from the state the coast
 * left it in, so speed and acceleration are continuous when the motor starts).
 */
export interface Platter {
  at: number;
  angle: number;
  speed: number;
  motorAt: number | null;
}
export interface PlatterState {
  angle: number;
  speed: number;
  accel: number;
}

const CK = COAST.c / COAST.k;
function coast(angle: number, speed: number, u: number, out: PlatterState): PlatterState {
  if (speed <= 0) return Object.assign(out, { angle, speed: 0, accel: 0 });
  const stop = Math.log(1 + speed / CK) / COAST.k;
  const v = Math.min(Math.max(u, 0), stop);
  const e = Math.exp(-COAST.k * v);
  out.angle = angle + ((speed + CK) * (1 - e)) / COAST.k - CK * v;
  out.speed = u >= stop ? 0 : v === 0 ? speed : (speed + CK) * e - CK;
  out.accel = u >= stop ? 0 : -COAST.k * (out.speed + CK);
  return out;
}
function drive(s: PlatterState, u: number, out: PlatterState): PlatterState {
  const a = SPIN.lag, W = SPIN.steady;
  const A = s.speed - W, B = A * a + s.accel;
  const e = Math.exp(-a * u);
  out.angle = s.angle + W * u + (A * (1 - e)) / a + (B * (1 - (1 + a * u) * e)) / (a * a);
  out.speed = W + (A + B * u) * e;
  out.accel = (B - a * (A + B * u)) * e;
  return out;
}
const _coasted: PlatterState = { angle: 0, speed: 0, accel: 0 };
export function platterAt(p: Platter, t: number, out: PlatterState = { angle: 0, speed: 0, accel: 0 }): PlatterState {
  const u = Math.max(0, t - p.at);
  if (p.motorAt === null || t <= p.motorAt) return coast(p.angle, p.speed, u, out);
  coast(p.angle, p.speed, p.motorAt - p.at, _coasted);
  return drive(_coasted, t - p.motorAt, out);
}

/** Acceptance from guest-ready: the platter at rest, the motor started at SPIN.start. */
export const ACCEPT_PLATTER: Readonly<Platter> = { at: 0, angle: 0, speed: 0, motorAt: SPIN.start };
/** The display angle: where the record is at the end of the acceptance clip (the accepted pose). */
export const DISPLAY_ANGLE = platterAt(ACCEPT_PLATTER, DURATIONS.accept).angle;
/** Steady platter speed (rad/s) and its multiple of 33⅓ rpm (1: the real speed). */
export const STEADY = { omega: SPIN.steady, beatScale: SPIN.steady / RPM_33 };

// ── Accept: 1.6 s ─────────────────────────────────────────────────────────────
/** Cue: lift off the rest, swing, then the damped cue descent (zero speed at both ends). */
const CUE_DOWN = cubicBezier(0.35, 0, 0.4, 1);
/** The stylus lands on the lead-in groove. */
export const STYLUS_DOWN = 0.4;
const _p0: PlatterState = { angle: 0, speed: 0, accel: 0 };
const _p1: PlatterState = { angle: 0, speed: 0, accel: 0 };
/**
 * Lead-in: the groove carries the stylus inward as the record turns, from the cue (the lead-in
 * groove) to `played` by the end of the clip, eased so the arm arrives at rest there (the music
 * groove's pitch moves it 0.05 mm a second, which no frame shows).
 */
function leadIn(platter: Platter, t: number): number {
  if (t <= STYLUS_DOWN) return 0;
  const a0 = platterAt(platter, STYLUS_DOWN, _p0).angle;
  const span = platterAt(platter, DURATIONS.accept, _p1).angle - a0;
  const p = Math.min(1, Math.max(0, (platterAt(platter, t, _p1).angle - a0) / span));
  return 1 - (1 - p) * (1 - p);
}
const _spin: PlatterState = { angle: 0, speed: 0, accel: 0 };
function accept(t: number, out: PartyFrame, platter: Platter): void {
  frameFor('guest-ready', out);
  // 0–0.08: lift off the rest. 0.04–0.25: swing over the lead-in groove. 0.25–0.40: the cue
  // damper lowers the stylus onto the (already turning) record.
  if (t < 0.25) out.armPitch = ARM.lifted * EASE.lift(seg(t, 0, 0.08));
  else out.armPitch = lerp(ARM.lifted, ARM.contact, CUE_DOWN(seg(t, 0.25, STYLUS_DOWN)));
  out.armYaw = t < 0.25 ? lerp(ARM.parked, ARM.cue, EASE.travel(seg(t, 0.04, 0.25))) : lerp(ARM.cue, ARM.played, leadIn(platter, t));
  out.spin = -platterAt(platter, t, _spin).angle;
  out.status = t >= PLAY_AT ? 'lit' : 'off';
}

/** The accepted pose while the record plays on, `t` seconds into acceptance (t ≥ the clip's end). */
export function playingFrame(platter: Platter, t: number, out: PartyFrame): PartyFrame {
  frameFor('accepted', out);
  // Wrapped: the angle grows without bound while the record plays; the view is periodic.
  out.spin = -(platterAt(platter, t, _spin).angle % (2 * Math.PI));
  return out;
}

// ── Decline: 1.4 s ────────────────────────────────────────────────────────────
/**
 * The dust cover released from its 27.6° lean onto a damped friction hinge, as one continuous
 * curve over 0.20–1.30 s: gravity start (constant acceleration from rest), a single speed peak,
 * then the damper brakes it into contact at zero speed. Progress is the Beta(2, k) CDF (speed ∝
 * u·(1−u)^(k−1)), so it never stops and restarts and never passes closed.
 */
export const CLOSE_K = 4;
const CLOSE = (u: number) => 1 - (1 - u) ** CLOSE_K * (1 + CLOSE_K * u);
function decline(t: number, out: PartyFrame): void {
  frameFor('guest-ready', out);
  out.lid = lerp(LID_OPEN, LID_CLOSED, CLOSE(seg(t, 0.2, 1.3)));
  out.status = 'off';
}

// ── A change of mind ──────────────────────────────────────────────────────────
/**
 * The pose on screen when the guest changed their mind (index.ts `interruptCut`), with its
 * velocities: the new outcome's clip starts from it (`sampleSequence` with a change). Pure data:
 * the composed frame is a function of (sequence, t, change), so nothing accumulates.
 */
export interface Change {
  armYaw: number;
  armYawRate: number;
  armPitch: number;
  armPitchRate: number;
  lid: number;
  lidRate: number;
  /** Platter angle (magnitude, rad) and speed (rad/s): it keeps its momentum through the change. */
  angle: number;
  speed: number;
}

/** The platter for `sequence` (from rest, or carrying the change's momentum). */
export function platterFor(sequence: SequenceName, change: Change | null): Platter {
  if (sequence === 'accept') return change ? { at: 0, angle: change.angle, speed: change.speed, motorAt: SPIN.start } : ACCEPT_PLATTER;
  return { at: 0, angle: change?.angle ?? 0, speed: change?.speed ?? 0, motorAt: null };
}

/** An offset that starts at (value, rate) and eases to nothing by T (quintic, C² at its end). */
function fade(value: number, rate: number, T: number, t: number): number {
  if (t >= T) return 0;
  return new Quintic(value, rate, 0, 0, 0, 0, T).at(t);
}

/** The arm's pitch ceiling for a yaw: on the vinyl at `played`, on the rest at `parked`, lifted between. */
export function blendLift(yaw: number): number {
  const u = (yaw - ARM.played) / (ARM.parked - ARM.played);
  const base = ARM.contact * (1 - Math.min(1, Math.max(0, u)));
  if (u <= 0.001 || u >= 0.999) return base;
  return base + ARM.lifted * Math.min(1, 4 * u * (1 - u) * 1.6);
}

/**
 * Decline after acceptance: the arm goes home. With the stylus down the cue lever first lifts it
 * clear (CHANGE.lift) while the arm holds its yaw; an arm already in the air turns back at once,
 * from its own velocity. It swings to the rest (time ∝ distance, CHANGE.swing for the whole swing)
 * and is lowered onto it (CHANGE.lower) as it arrives. Quintics throughout (C² inside; the start is
 * C¹ from the pose on screen).
 */
function armHome(c: Change, t: number, out: PartyFrame): void {
  const down = c.armPitch > ARM.lifted * 0.5;
  const yawStart = down ? CHANGE.lift * 0.6 : 0;
  const dist = Math.abs(c.armYaw - ARM.parked) / Math.abs(ARM.played - ARM.parked);
  const swing = dist < 1e-6 ? 0 : Math.max(0.2, CHANGE.swing * Math.sqrt(dist));
  const home = yawStart + swing;
  out.armYaw = swing === 0 || t >= home ? ARM.parked
    : t <= yawStart ? c.armYaw
    : new Quintic(c.armYaw, down ? 0 : c.armYawRate, 0, ARM.parked, 0, 0, swing).at(t - yawStart);
  // Pitch: up to lifted (from its own rate), held, then lowered onto the rest as the yaw arrives.
  const liftTime = down ? CHANGE.lift : Math.max(0.06, CHANGE.lift * (1 - Math.min(1, c.armPitch / ARM.lifted)));
  const lowerAt = Math.max(liftTime, home - CHANGE.lower * 0.6);
  let pitch: number;
  if (t < liftTime) pitch = new Quintic(c.armPitch, c.armPitchRate, 0, ARM.lifted, 0, 0, liftTime).at(t);
  else if (t < lowerAt) pitch = ARM.lifted;
  else pitch = new Quintic(ARM.lifted, 0, 0, 0, 0, 0, CHANGE.lower).at(t - lowerAt);
  // Never lower than the ceiling for the yaw it is at (no drag across the vinyl or the rest's prongs).
  out.armPitch = Math.min(pitch, blendLift(out.armYaw));
}

/** The end of the authored swing to the cue: the hand-over's pitch guard holds until then. */
const SWING_END = 0.25;

function changed(sequence: SequenceName, t: number, c: Change, out: PartyFrame): void {
  // The platter keeps its momentum: it coasts (decline) or is picked up by the belt (accept).
  out.spin = -platterAt(platterFor(sequence, c), t, _spin).angle;
  if (sequence === 'decline') {
    armHome(c, t, out);
  } else {
    // The arm hands over to the authored lift and swing (which start from the rest at rest) before
    // the cue descends; until then it is never lower than its yaw's ceiling.
    out.armYaw += fade(c.armYaw - ARM.parked, c.armYawRate, CHANGE.arm, t);
    const pitch = out.armPitch + fade(c.armPitch, c.armPitchRate, CHANGE.arm, t);
    out.armPitch = t < SWING_END ? Math.min(pitch, blendLift(out.armYaw)) : pitch;
  }
  // The cover hands over from wherever it was (lifted back open on accept; on decline it closes as
  // authored once the hand-over has run out), never past its open stop or its closed seat.
  out.lid = Math.min(LID_CLOSED, Math.max(LID_OPEN, out.lid + fade(c.lid - LID_OPEN, c.lidRate, CHANGE.lid, t)));
}

export function sampleSequence(sequence: SequenceName, t: number, out: PartyFrame, change: Change | null = null): PartyFrame {
  const tc = Math.min(Math.max(t, 0), DURATIONS[sequence]);
  if (sequence === 'host') host(tc, out);
  else if (sequence === 'accept') accept(tc, out, platterFor('accept', change));
  else decline(tc, out);
  if (change && sequence !== 'host') changed(sequence, tc, change, out);
  return out;
}

/** How far the arm is lifted (0 resting, 1 fully lifted): drives the cue lever and platform. */
export function cueAmount(pitch: number): number {
  return Math.min(1, Math.max(0, pitch / ARM.lifted));
}

export function cueLever(pitch: number): number {
  return CUEING.leverUp * smoothstep(cueAmount(pitch));
}

export function cueRise(pitch: number): number {
  return CUEING.liftRise * smoothstep(cueAmount(pitch));
}

export { LEVEL_BY };
