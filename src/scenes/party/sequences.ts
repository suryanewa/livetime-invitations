import { Vector3 } from 'three';
import { cubicBezier, EASE, lerp, seg, smoothstep } from '../../motion/curves.ts';
import { dampedSettle } from '../../motion/curves.ts';
import { PLATTER_TOP, RECORD } from '../../../models/recordContract.ts';
import type { CanonicalPose, SequenceName } from '../../core/types.ts';
import { ALIGNED, ARM, DURATIONS, HOVER, LEVEL_BY, LID_CLOSED, LID_OPEN, PLAY_AT, SEATED, SPIN } from './poses.ts';

/**
 * Pure authored choreography for Party: every function maps time → transforms, so replay,
 * interruption and frame rate never accumulate rotation, arm offsets or lid energy
 * (Party sub-spec acceptance criteria).
 */

export interface PartyFrame {
  /** record_authored origin (record bottom centre). */
  recordPos: Vector3;
  /** record_authored rotation.x: label tipped towards the camera while presented. */
  recordTilt: number;
  /** record_secondary rotation.x: tiny contact settle (edge never dips below the platter). */
  wobble: number;
  /** Record and platter rotation.y (they turn together once seated). */
  spin: number;
  armYaw: number;
  armPitch: number;
  lid: number;
  status: 'off' | 'lit';
}

export function newFrame(): PartyFrame {
  return frameFor('guest-ready', {
    recordPos: new Vector3(), recordTilt: 0, wobble: 0, spin: 0, armYaw: 0, armPitch: 0, lid: 0, status: 'off',
  });
}

export function frameFor(pose: CanonicalPose, out: PartyFrame): PartyFrame {
  out.recordPos.copy(pose === 'host-ready' ? HOVER.pos : SEATED);
  out.recordTilt = pose === 'host-ready' ? HOVER.tilt : 0;
  out.wobble = 0;
  out.spin = pose === 'accepted' ? SPIN.total : 0;
  out.armYaw = pose === 'accepted' ? ARM.played : ARM.parked;
  out.armPitch = 0;
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
function host(t: number, out: PartyFrame): void {
  frameFor('guest-ready', out);
  if (t < 0.2) {
    // Align over the platter, label still presented.
    const a = EASE.travel(seg(t, 0, 0.2));
    out.recordPos.lerpVectors(HOVER.pos, ALIGNED.pos, a);
    out.recordTilt = lerp(HOVER.tilt, ALIGNED.tilt, a);
  } else if (t < 0.75) {
    // Lower onto the spindle: level and centred before the hole reaches the spindle top.
    const s = LOWER(seg(t, 0.2, 0.75));
    out.recordPos.lerpVectors(ALIGNED.pos, SEATED, s);
    out.recordTilt = lerp(ALIGNED.tilt, 0, TILT_OUT(seg(t, 0.2, 0.48)));
  } else {
    // Contact at 0.75 s, a tiny damped settle to 1.00 s, then hold.
    out.recordPos.copy(SEATED);
    out.recordTilt = 0;
    out.wobble = t < 1 ? dampedSettle(t - 0.75, 0.01, 4, 0.5, 0.25) * smoothstep(seg(t, 0.75, 0.79)) : 0;
    // Pivot about the lowest edge: lift the centre so nothing dips below the platter.
    out.recordPos.y += RECORD.radius * Math.abs(Math.sin(out.wobble));
  }
  out.status = 'off';
}

// ── Accept: 1.6 s ─────────────────────────────────────────────────────────────
/** Normalised spin progress ∫ω: ramp 0.30–0.50, steady to 1.10, ease out to 1.60. */
const SPIN_AREA = 0.1 + 0.6 + 0.25;
function spinProgress(t: number): number {
  let area: number;
  if (t <= 0.3) area = 0;
  else if (t <= 0.5) {
    const u = (t - 0.3) / 0.2;
    area = 0.2 * (u * u * u - (u * u * u * u) / 2);
  } else if (t <= 1.1) area = 0.1 + (t - 0.5);
  else if (t < 1.6) {
    const s = (t - 1.1) / 0.5;
    area = 0.7 + 0.5 * (s - (s * s * s - (s * s * s * s) / 2));
  } else area = SPIN_AREA;
  return area / SPIN_AREA;
}

function accept(t: number, out: PartyFrame): void {
  frameFor('guest-ready', out);
  // 0–0.25: lift, then swing over the lead-in groove. 0.25–0.40: stylus lowers.
  const lift = t < 0.25 ? EASE.lift(seg(t, 0, 0.08)) : 1 - EASE.land(seg(t, 0.25, 0.4));
  out.armPitch = ARM.lifted * lift;
  const progress = spinProgress(t);
  out.armYaw = t < 0.25 ? lerp(ARM.parked, ARM.cue, EASE.travel(seg(t, 0.04, 0.25))) : lerp(ARM.cue, ARM.played, progress);
  // 0.30–1.60: platter accelerates, plays, eases into the display angle.
  out.spin = SPIN.total * progress;
  out.status = t >= PLAY_AT ? 'lit' : 'off';
}

// ── Decline: 1.4 s ────────────────────────────────────────────────────────────
/** Light damped mechanism: gravity start, braking before contact. */
const CLOSE = cubicBezier(0.5, 0, 0.3, 1);
/** Soft-close creep: the last ≈1° is taken up by the damper, no bounce. */
const SOFT_GAP = 0.02;
function decline(t: number, out: PartyFrame): void {
  frameFor('guest-ready', out);
  if (t < 0.2) out.lid = LID_OPEN;
  else if (t < 1) out.lid = lerp(LID_OPEN, LID_CLOSED - SOFT_GAP, CLOSE(seg(t, 0.2, 1)));
  else out.lid = lerp(LID_CLOSED - SOFT_GAP, LID_CLOSED, EASE.land(seg(t, 1, 1.3)));
  out.status = 'off';
}

export function sampleSequence(sequence: SequenceName, t: number, out: PartyFrame): PartyFrame {
  const tc = Math.min(Math.max(t, 0), DURATIONS[sequence]);
  if (sequence === 'host') host(tc, out);
  else if (sequence === 'accept') accept(tc, out);
  else decline(tc, out);
  return out;
}

/** Arm lift during interruption blends, derived from yaw: never drags across the record. */
export function blendLift(yaw: number): number {
  const u = (yaw - ARM.played) / (ARM.parked - ARM.played);
  if (u <= 0.001 || u >= 0.999) return 0;
  return ARM.lifted * Math.min(1, 4 * u * (1 - u) * 1.6);
}

export { LEVEL_BY };
