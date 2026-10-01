import { Vector3 } from 'three';
import { cubicBezier, EASE, lerp, seg, smoothstep } from '../../motion/curves.ts';
import { PLATTER_TOP, RECORD } from '../../../models/recordContract.ts';
import type { CanonicalPose, SequenceName } from '../../core/types.ts';
import { ALIGNED, ARM, CUEING, DURATIONS, HOVER, LEVEL_BY, LID_CLOSED, LID_OPEN, PLAY_AT, RPM_33, SEATED, SPIN } from './poses.ts';

/**
 * Pure authored choreography for Party: every function maps time → transforms, so replay,
 * interruption and frame rate never accumulate rotation, arm offsets or lid energy
 * (Party sub-spec acceptance criteria). Every beat boundary is C1: positions and angles meet
 * with matching (mostly zero) velocities.
 */

export interface PartyFrame {
  /** record_authored origin (record bottom centre). */
  recordPos: Vector3;
  /** record_authored rotation.x: label tipped towards the camera while presented. */
  recordTilt: number;
  /**
   * record_secondary rotation.x / rotation.z: the settle's tilt vector (its low side precesses
   * round the rim; the edge never dips below the mat). Zero outside the settle beat.
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
  out.spin = pose === 'accepted' ? SPIN.total : 0;
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

// ── Host: 1.2 s ───────────────────────────────────────────────────────────────
/** Weighted lowering: unhurried start, controlled descent, soft set-down exactly at 0.75 s. */
const LOWER = cubicBezier(0.42, 0, 0.22, 1);
const TILT_OUT = cubicBezier(0.45, 0, 0.3, 1);
/** The record is level by 0.44 s, still above LEVEL_BY (the spindle top plus a 5 cm margin). */
const TILT_LEVEL_AT = 0.44;
/**
 * Seat-and-settle: contact at 0.75 s, then the record settles like a coin on a table: a small
 * tilt whose low side runs round the rim (precession, `hz` turns per second) while the tilt
 * decays (`tau`) and is windowed to exactly zero at `end`. The record turns about its lowest rim
 * point, so its centre rises by R·sin(tilt) and no point ever dips below the mat. Unlike a rock
 * between two edges, the contact point never jumps, so the motion is smooth (C¹) throughout.
 */
export const SETTLE = { at: 0.75, amplitude: 0.011, hz: 3.2, tau: 0.09, rampIn: 0.05, end: 0.3, phase: 2.2 } as const;
/** Settle tilt magnitude (rad) at u seconds after contact: smooth in, decaying, exactly 0 at end. */
export function settleTilt(u: number): number {
  if (u <= 0 || u >= SETTLE.end) return 0;
  return SETTLE.amplitude * smoothstep(seg(u, 0, SETTLE.rampIn)) * Math.exp(-u / SETTLE.tau) * (1 - smoothstep(seg(u, SETTLE.end * 0.55, SETTLE.end)));
}
function host(t: number, out: PartyFrame): void {
  frameFor('guest-ready', out);
  if (t < 0.2) {
    // Align over the platter, label still presented.
    const a = EASE.travel(seg(t, 0, 0.2));
    out.recordPos.lerpVectors(HOVER.pos, ALIGNED.pos, a);
    out.recordTilt = lerp(HOVER.tilt, ALIGNED.tilt, a);
  } else if (t < SETTLE.at) {
    // Lower onto the spindle: level and centred before the hole reaches the spindle top.
    const s = LOWER(seg(t, 0.2, SETTLE.at));
    out.recordPos.lerpVectors(ALIGNED.pos, SEATED, s);
    out.recordTilt = lerp(ALIGNED.tilt, 0, TILT_OUT(seg(t, 0.2, TILT_LEVEL_AT)));
  } else {
    // Contact at 0.75 s (zero speed), the precessing settle, still by 1.05 s, then hold.
    out.recordPos.copy(SEATED);
    out.recordTilt = 0;
    const u = t - SETTLE.at;
    const tilt = settleTilt(u);
    const phi = SETTLE.phase + 2 * Math.PI * SETTLE.hz * u;
    out.wobble = tilt * Math.cos(phi);
    out.wobbleZ = tilt * Math.sin(phi);
    // The disc's true tilt under rotation.x then rotation.z: cos θ = cos x·cos z.
    const cosTilt = Math.cos(out.wobble) * Math.cos(out.wobbleZ);
    out.recordPos.y += RECORD.radius * Math.sqrt(Math.max(0, 1 - cosTilt * cosTilt));
  }
  out.status = 'off';
}

// ── Accept: 1.6 s ─────────────────────────────────────────────────────────────
/**
 * Unit spin integral ∫ω/ω_ss over the belt-drive profile (poses.ts, SPIN), in closed form:
 * u = t − start; spin-up U(u) = 1 − (1 + a·u)·e^(−a·u); braking B = 1 − smootherstep over
 * [brakeAt, stopAt]. ∫U·B is exact: the polynomial × exponential part by repeated parts.
 */
const A = SPIN.lag;
const UB = SPIN.brakeAt - SPIN.start, UE = SPIN.stopAt - SPIN.start, D = UE - UB;
const spinUp = (u: number) => u - (2 * (1 - Math.exp(-A * u))) / A + u * Math.exp(-A * u);
/** 1 − smootherstep(x) as coefficients in x, times (1 + a·(UB + D·x)). */
const BRAKE_POLY = (() => {
  const q = [1, 0, 0, -10, 15, -6];
  const alpha = 1 + A * UB, beta = A * D;
  return Array.from({ length: q.length + 1 }, (_, k) => alpha * (q[k] ?? 0) + beta * (q[k - 1] ?? 0));
})();
const C = A * D;
/** ∫₀ˣ P(ξ)·e^(−Cξ) dξ, with F = −e^(−Cξ)·Σ P⁽ᵏ⁾(ξ)/C^(k+1). */
function polyExpIntegral(x: number): number {
  const F = (xi: number) => {
    let p = BRAKE_POLY.slice(), sum = 0, ck = C;
    while (p.length) {
      let v = 0;
      for (let i = p.length - 1; i >= 0; i--) v = v * xi + p[i]!;
      sum += v / ck;
      ck *= C;
      p = p.slice(1).map((c, i) => c * (i + 1));
    }
    return -Math.exp(-C * xi) * sum;
  };
  return F(x) - F(0);
}
function brakeIntegral(x: number): number {
  const plain = D * (x - (x ** 6 - 3 * x ** 5 + 2.5 * x ** 4));
  return plain - D * Math.exp(-A * UB) * polyExpIntegral(x);
}
const SPIN_AREA = spinUp(UB) + brakeIntegral(1);
function spinArea(t: number): number {
  const u = t - SPIN.start;
  if (u <= 0) return 0;
  if (u <= UB) return spinUp(u);
  if (u < UE) return spinUp(UB) + brakeIntegral((u - UB) / D);
  return SPIN_AREA;
}
/** Normalised spin progress (0 → 1 over the clip, monotonic). */
export function spinProgress(t: number): number {
  return spinArea(t) / SPIN_AREA;
}
/** Steady platter speed (rad/s) and its multiple of 33⅓ rpm. */
export const STEADY = { omega: Math.abs(SPIN.total) / SPIN_AREA, beatScale: Math.abs(SPIN.total) / SPIN_AREA / RPM_33 };

/** Cue: lift off the rest, swing, then the damped cue descent (zero speed at both ends). */
const CUE_DOWN = cubicBezier(0.35, 0, 0.4, 1);
function accept(t: number, out: PartyFrame): void {
  frameFor('guest-ready', out);
  // 0–0.08: lift off the rest. 0.04–0.25: swing over the lead-in groove. 0.25–0.40: the cue
  // damper lowers the stylus onto the (already turning) record.
  if (t < 0.25) out.armPitch = ARM.lifted * EASE.lift(seg(t, 0, 0.08));
  else out.armPitch = lerp(ARM.lifted, ARM.contact, CUE_DOWN(seg(t, 0.25, 0.4)));
  const progress = spinProgress(t);
  out.armYaw = t < 0.25 ? lerp(ARM.parked, ARM.cue, EASE.travel(seg(t, 0.04, 0.25))) : lerp(ARM.cue, ARM.played, progress);
  out.spin = SPIN.total * progress;
  out.status = t >= PLAY_AT ? 'lit' : 'off';
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

export function sampleSequence(sequence: SequenceName, t: number, out: PartyFrame): PartyFrame {
  const tc = Math.min(Math.max(t, 0), DURATIONS[sequence]);
  if (sequence === 'host') host(tc, out);
  else if (sequence === 'accept') accept(tc, out);
  else decline(tc, out);
  return out;
}

/**
 * Pitch ceiling during interruption blends, derived from yaw: the arm's resting pitch for that
 * yaw (on the vinyl at `played`, on the rest at `parked`) raised by a lift that peaks mid-swing,
 * so the stylus never drags across the record or the rest's prongs.
 */
export function blendLift(yaw: number): number {
  const u = (yaw - ARM.played) / (ARM.parked - ARM.played);
  const base = ARM.contact * (1 - Math.min(1, Math.max(0, u)));
  if (u <= 0.001 || u >= 0.999) return base;
  return base + ARM.lifted * Math.min(1, 4 * u * (1 - u) * 1.6);
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
