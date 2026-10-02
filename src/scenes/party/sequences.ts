import { Vector3 } from 'three';
import { lerp, seg, smoothstep } from '../../motion/curves.ts';
import { PLATTER_TOP, RECORD } from '../../../models/recordContract.ts';
import type { CanonicalPose, SequenceName } from '../../core/types.ts';
import { ACCEPT_ARM, ARM, CHANGE, COAST, CUEING, DURATIONS, HOVER, LEVEL_BY, LID_CLOSED, LID_OPEN, PLACE, PLAY_AT, RPM_33, SEATED, SPIN } from './poses.ts';

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

/** Acceptance from guest-ready: the platter at rest, the motor started with the key (SPIN.start). */
export const ACCEPT_PLATTER: Readonly<Platter> = { at: 0, angle: 0, speed: 0, motorAt: SPIN.start };
/** Steady platter speed (rad/s) and its multiple of 33⅓ rpm (1: the real speed). */
export const STEADY = { omega: SPIN.steady, beatScale: SPIN.steady / RPM_33 };

// ── The arm, at a hand's pace ─────────────────────────────────────────────────
/** The arm's yaw and pitch with their rates. */
export interface ArmState {
  yaw: number;
  yawRate: number;
  pitch: number;
  pitchRate: number;
}
/** On its rest and still (guest-ready). */
export const ARM_AT_REST: Readonly<ArmState> = { yaw: ARM.parked, yawRate: 0, pitch: 0, pitchRate: 0 };
/** The mechanism's range: yaw from the lead-in's end (`played`) to the rest, pitch from the cue lift's top to the vinyl. */
const YAW_IN = Math.min(ARM.played, ARM.parked), YAW_OUT = Math.max(ARM.played, ARM.parked);
const clampYaw = (y: number) => Math.min(YAW_OUT, Math.max(YAW_IN, y));
const clampPitch = (p: number) => Math.min(ARM.contact, Math.max(ARM.lifted, p));
const FULL_SWING = Math.abs(ARM.parked - ARM.cue);
/**
 * A swing that starts moving may carry its speed into the quintic only while v0·T ≤ R_MAX·d: up
 * to 2.55 the quintic from (0, v0) to (d, 0) never reverses (measured); beyond, it would
 * overshoot and come back (the wobble the v1.5 judge saw).
 */
const R_MAX = 2.4;
const swingTime = (d: number) => ACCEPT_ARM.swing * Math.sqrt(Math.min(1, d / FULL_SWING));

/**
 * The arm's way from a state to a target, as a real arm moves (v1.5 polish): with the stylus in
 * the groove, on the rest or more than half lowered, the cue lever first lifts it (`lift`) while
 * the yaw holds; an arm already in the air keeps its velocity. Moving away from the target, the
 * hand brakes it to rest (quartic, deceleration ≤ `brake`, never past the mechanism's ends) and
 * swings it back; moving towards it, it swings on with its speed (time ∝ √distance) when that
 * cannot overshoot, or else is braked to rest exactly on the target. So the yaw turns round at
 * most once per hand-over. At the cue the damper lowers the stylus (from `cueAt` at the earliest); at
 * the rest it is lowered into the cradle. Yaw stays within [played, parked] and pitch within
 * [lifted, contact] throughout, and nothing ever oscillates.
 */
export interface ArmPlan {
  target: 'cue' | 'rest';
  from: ArmState;
  start: number;
  liftEnd: number;
  lift: Quintic | null;
  yawFrom: number;
  yawStart: number;
  brake: Quintic | null;
  swingStart: number;
  swing: Quintic | null;
  yawTo: number;
  arrive: number;
  lowerStart: number;
  lower: Quintic | null;
  pitchTo: number;
}
export function planArm(from: ArmState, target: 'cue' | 'rest', start: number): ArmPlan {
  const yaw0 = clampYaw(from.yaw), pitch0 = clampPitch(from.pitch);
  const down = pitch0 > ARM.lifted * 0.5;
  const yawTo = target === 'cue' ? ARM.cue : ARM.parked;
  const pitchTo = target === 'cue' ? ARM.contact : 0;
  // Already home and resting: settle onto the rest from wherever the pitch is.
  if (target === 'rest' && Math.abs(yaw0 - yawTo) < 1e-4 && down && Math.abs(from.yawRate) < 1e-6) {
    const T = 0.15;
    return {
      target, from, start, liftEnd: start, lift: null, yawFrom: yaw0, yawStart: start, brake: null, swingStart: start, swing: null, yawTo, arrive: start,
      lowerStart: start, lower: new Quintic(pitch0, from.pitchRate, 0, pitchTo, 0, 0, T), pitchTo,
    };
  }
  // Lift: the whole travel takes `lift`; a partly lifted arm finishes its share (from its own rate).
  const share = Math.min(1.1, (pitch0 - ARM.lifted) / -ARM.lifted);
  const needsLift = share > 1e-6 || Math.abs(from.pitchRate) > 1e-6;
  const liftTime = needsLift ? Math.max(0.08, ACCEPT_ARM.lift * share) : 0;
  const lift = needsLift ? new Quintic(pitch0, from.pitchRate, 0, ARM.lifted, 0, 0, liftTime) : null;
  const liftEnd = start + liftTime;
  // Yaw: held while the stylus (or the tube on the rest) is down, until the lift is done.
  const yawStart = down ? liftEnd : start;
  const v0 = down ? 0 : from.yawRate;
  let y = yaw0, t = yawStart, brake: Quintic | null = null;
  const d0 = yawTo - y;
  const toward = Math.sign(v0) === Math.sign(d0);
  if (Math.abs(v0) > 1e-6 && (!toward || Math.abs(v0) * swingTime(Math.abs(d0)) > R_MAX * Math.abs(d0))) {
    // Moving away: the hand brakes it to rest (within the mechanism's range), then swings it back.
    // Moving towards the target too fast to swing on: it brakes to rest exactly on the target.
    let Tb = toward ? (2 * Math.abs(d0)) / Math.abs(v0) : Math.max(0.06, (1.5 * Math.abs(v0)) / ACCEPT_ARM.brake);
    let turn = toward ? yawTo : y + 0.5 * v0 * Tb;
    if (turn < YAW_IN || turn > YAW_OUT) {
      turn = clampYaw(turn);
      Tb = Math.max(1e-3, (2 * (turn - y)) / v0);
    }
    brake = new Quintic(y, v0, 0, turn, 0, 0, Tb);
    y = turn;
    t += Tb;
  }
  const d = yawTo - y, vs = brake ? 0 : v0;
  let swing: Quintic | null = null;
  if (Math.abs(d) > 1e-6) {
    let Ts = Math.max(0.2, swingTime(Math.abs(d)));
    if (Math.abs(vs) > 1e-6) Ts = Math.min(Ts, (R_MAX * Math.abs(d)) / Math.abs(vs));
    swing = new Quintic(y, vs, 0, yawTo, 0, 0, Ts);
  }
  const swingStart = t;
  const arrive = t + (swing?.T ?? 0);
  const lowerStart = Math.max(arrive, liftEnd, target === 'cue' ? ACCEPT_ARM.cueAt : 0);
  const lower = new Quintic(ARM.lifted, 0, 0, pitchTo, 0, 0, target === 'cue' ? ACCEPT_ARM.cue : ACCEPT_ARM.lower);
  return { target, from, start, liftEnd, lift, yawFrom: yaw0, yawStart, brake, swingStart, swing, yawTo, arrive, lowerStart, lower, pitchTo };
}

/** The arm's yaw and pitch at time t of its plan (before `start` it holds where it was). */
function armAt(p: ArmPlan, t: number, out: { armYaw: number; armPitch: number }): void {
  let yaw: number;
  if (t <= p.yawStart) yaw = p.yawFrom;
  else if (p.brake && t < p.swingStart) yaw = p.brake.at(t - p.yawStart);
  else if (p.swing && t < p.arrive) yaw = p.swing.at(t - p.swingStart);
  else yaw = p.yawTo;
  let pitch: number;
  if (t <= p.start) pitch = clampPitch(p.from.pitch);
  else if (t >= p.lowerStart && p.lower) pitch = p.lower.at(t - p.lowerStart);
  else if (p.lift && t < p.liftEnd) pitch = p.lift.at(t - p.start);
  else pitch = ARM.lifted;
  out.armYaw = clampYaw(yaw);
  out.armPitch = clampPitch(pitch);
}

// ── Accept: 1.85 s ────────────────────────────────────────────────────────────
/** The authored arm: the hand presses the key, reaches the cue lever, lifts, swings, cues. */
const ACCEPT_ARM_PLAN = planArm(ARM_AT_REST, 'cue', ACCEPT_ARM.reach);
/** The stylus lands on the lead-in groove (the damper's descent from `cueAt`). */
export const STYLUS_DOWN = ACCEPT_ARM.cueAt + ACCEPT_ARM.cue;
const _p0: PlatterState = { angle: 0, speed: 0, accel: 0 };
const _p1: PlatterState = { angle: 0, speed: 0, accel: 0 };
/**
 * Lead-in: the groove carries the stylus inward as the record turns, from the cue to `played`
 * over ACCEPT_ARM.leadIn of the record's turning (1.5 turns), eased so the arm comes to rest there
 * (the music groove's pitch then moves it 0.05 mm a second, which no frame shows). It goes on after
 * the clip, while the record plays.
 */
function leadInYaw(platter: Platter, t: number): number {
  if (t <= STYLUS_DOWN) return ARM.cue;
  const turned = platterAt(platter, t, _p1).angle - platterAt(platter, STYLUS_DOWN, _p0).angle;
  const p = Math.min(1, Math.max(0, turned / ACCEPT_ARM.leadIn));
  return lerp(ARM.cue, ARM.played, 1 - (1 - p) * (1 - p));
}
/** When the lead-in ends for an acceptance from guest-ready: the canonical accepted pose's time. */
export const ACCEPTED_AT = bisect((t) => platterAt(ACCEPT_PLATTER, t).angle - platterAt(ACCEPT_PLATTER, STYLUS_DOWN).angle - ACCEPT_ARM.leadIn, STYLUS_DOWN, STYLUS_DOWN + 20);
/**
 * The display angle (rad, within one turn): the record where the canonical accepted pose shows it,
 * playing, with the stylus at the end of the lead-in (posters, reduced motion, snaps).
 */
export const DISPLAY_ANGLE = platterAt(ACCEPT_PLATTER, ACCEPTED_AT).angle % (2 * Math.PI);
const _spin: PlatterState = { angle: 0, speed: 0, accel: 0 };
function accept(t: number, out: PartyFrame, platter: Platter, arm: ArmPlan = ACCEPT_ARM_PLAN): void {
  frameFor('guest-ready', out);
  // 0.05: the key is pressed: it lights and the motor starts. 0.15–0.35: the cue lever lifts the
  // arm. 0.35–0.9: the hand swings it to the lead-in. 0.9–1.65: the damper lowers the stylus onto
  // the record, now at 99 % of speed. From 1.65 the groove draws the arm in.
  armAt(arm, t, out);
  if (t > STYLUS_DOWN) out.armYaw = leadInYaw(platter, t);
  out.spin = -platterAt(platter, t, _spin).angle;
  out.status = t >= PLAY_AT ? 'lit' : 'off';
}

/** The accepted pose while the record plays on, `t` seconds into acceptance (t ≥ the clip's end). */
export function playingFrame(platter: Platter, t: number, out: PartyFrame): PartyFrame {
  frameFor('accepted', out);
  out.armYaw = leadInYaw(platter, t);
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

/** The arm's plan for a change (cached per change: the clip samples it every frame). */
const plans = new WeakMap<Change, Partial<Record<SequenceName, ArmPlan>>>();
export function armPlanFor(sequence: 'accept' | 'decline', change: Change | null): ArmPlan {
  if (!change) return sequence === 'accept' ? ACCEPT_ARM_PLAN : planArm(ARM_AT_REST, 'rest', 0);
  const cached = plans.get(change) ?? {};
  const plan = cached[sequence] ?? planArm({ yaw: change.armYaw, yawRate: change.armYawRate, pitch: change.armPitch, pitchRate: change.armPitchRate }, sequence === 'accept' ? 'cue' : 'rest', 0);
  cached[sequence] = plan;
  plans.set(change, cached);
  return plan;
}

/** An offset that starts at (value, rate) and eases to nothing by T (quintic, C² at its end). */
function fade(value: number, rate: number, T: number, t: number): number {
  if (t >= T) return 0;
  return new Quintic(value, rate, 0, 0, 0, 0, T).at(t);
}

/**
 * The arm's pitch ceiling for a yaw during the director's straight blend (`refresh`, which Party no
 * longer asks for): on the vinyl at `played`, on the rest at `parked`, lifted between.
 */
export function blendLift(yaw: number): number {
  const u = (yaw - ARM.played) / (ARM.parked - ARM.played);
  const base = ARM.contact * (1 - Math.min(1, Math.max(0, u)));
  if (u <= 0.001 || u >= 0.999) return base;
  return base + ARM.lifted * Math.min(1, 4 * u * (1 - u) * 1.6);
}

function changed(sequence: SequenceName, t: number, c: Change, out: PartyFrame): void {
  // The platter keeps its momentum: it coasts (decline) or is picked up by the belt (accept).
  const platter = platterFor(sequence, c);
  out.spin = -platterAt(platter, t, _spin).angle;
  if (sequence === 'decline') armAt(armPlanFor('decline', c), t, out);
  else if (sequence === 'accept') {
    armAt(armPlanFor('accept', c), t, out);
    if (t > STYLUS_DOWN) out.armYaw = leadInYaw(platter, t);
  }
  // The cover hands over from wherever it was (lifted back open on accept; on decline it closes as
  // authored once the hand-over has run out), never past its open stop or its closed seat.
  out.lid = Math.min(LID_CLOSED, Math.max(LID_OPEN, out.lid + fade(c.lid - LID_OPEN, c.lidRate, CHANGE.lid, t)));
}

export function sampleSequence(sequence: SequenceName, t: number, out: PartyFrame, change: Change | null = null): PartyFrame {
  const tc = Math.min(Math.max(t, 0), DURATIONS[sequence]);
  if (sequence === 'host') host(tc, out);
  else if (sequence === 'accept') accept(tc, out, platterFor('accept', change), armPlanFor('accept', change));
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
