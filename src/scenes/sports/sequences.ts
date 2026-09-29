import { Quaternion, Vector3 } from 'three';
import { EASE, dampedSettle, lerp, seg, smoothstep } from '../../motion/curves.ts';
import { BALL_AT, BALL_R, MISS_OFFSET, RIM_CENTER } from '../../../models/sportsContract.ts';
import type { CanonicalPose, SequenceName } from '../../core/types.ts';

/**
 * Pure authored choreography for Sports (Sports sub-spec). Trajectories are sampled authored
 * curves, never a projectile solver, so every Accept scores and every Decline misses at any
 * frame rate, on replay and after reversal.
 */

export const DURATIONS = { host: 1.2, accept: 1.7, decline: 1.6 } as const;

/** The made shot passes the rim centre, moving down, exactly at this beat (net contact). */
export const CONTACT_AT = 0.95;

export interface SportsFrame {
  ballPos: Vector3;
  ballRot: Quaternion;
  /** Net deformation (0 at rest): lower rows widen and the net lengthens. */
  netFlare: number;
  netStretch: number;
}

const UP = new Vector3(0, 1, 0);

// ── Orientation: spin segments composed in time order (pure function of t) ──────
interface Spin {
  t0: number;
  t1: number;
  axis: Vector3;
  /** Angle travelled over the segment at local progress s ∈ [0, 1]. */
  angle(s: number): number;
}
const qa = new Quaternion();
function orientation(spins: Spin[], t: number, out: Quaternion): Quaternion {
  out.identity();
  for (const sp of spins) {
    if (t <= sp.t0) break;
    const s = Math.min(1, (t - sp.t0) / (sp.t1 - sp.t0));
    qa.setFromAxisAngle(sp.axis, sp.angle(s));
    out.premultiply(qa);
    if (t < sp.t1) break;
  }
  return out;
}
/** Axis for rolling (or top-spin) along horizontal direction d; backspin is the negation. */
const rollAxis = (d: Vector3) => new Vector3().crossVectors(UP, d).normalize();
const horiz = (from: Vector3, to: Vector3) => new Vector3(to.x - from.x, 0, to.z - from.z).normalize();

// ── Shared prep beat (0–0.20 s): gather — a small lift and a dip back before release ──
const LAUNCH = BALL_AT.guest.clone().add(new Vector3(0, 0.12, 0));
function prep(t: number, dirToTarget: Vector3, out: Vector3): void {
  const s = seg(t, 0, 0.2);
  const back = Math.sin(Math.PI * s) * 0.05;
  out.copy(BALL_AT.guest).addScaledVector(dirToTarget, -back);
  out.y = BALL_R + 0.12 * EASE.lift(s);
}

/**
 * Ballistic arc from LAUNCH (τ = 0) through `target` (τ = 1) with its apex at `apexY`:
 * constant horizontal speed, parabolic height.
 */
function arc(target: Vector3, apexY: number) {
  const D = target.y - LAUNCH.y, K = apexY - LAUNCH.y;
  const bq = 4 * K - 2 * D;
  const a = (-bq - Math.sqrt(bq * bq - 4 * D * D)) / 2; // the steep root: apex before the target
  const b = D - a;
  return {
    at(tau: number, out: Vector3) {
      out.set(lerp(LAUNCH.x, target.x, tau), LAUNCH.y + b * tau + a * tau * tau, lerp(LAUNCH.z, target.z, tau));
      return out;
    },
    /** d(height)/dτ at τ. */
    slope: (tau: number) => b + 2 * a * tau,
  };
}

// ── Made shot ────────────────────────────────────────────────────────────────
const MADE_ARC = arc(RIM_CENTER, 2.62);
/** Below the rim the net catches the ball: it drops nearly straight, lands, bounces once. */
const MADE_LAND = new Vector3(RIM_CENTER.x + 0.06, BALL_R, RIM_CENTER.z + 0.06);
const MADE_BOUNCE_TOP = 0.2;
const MADE_DIR = horiz(BALL_AT.guest, RIM_CENTER);

// ── Airball ───────────────────────────────────────────────────────────────────
/** Passes the rim's height beside it, well clear of the board's edge, then drops. */
const SCREEN_RIGHT = new Vector3(Math.cos((20 * Math.PI) / 180), 0, -Math.sin((20 * Math.PI) / 180));
export const MISS_POINT = RIM_CENTER.clone().addScaledVector(SCREEN_RIGHT, -MISS_OFFSET).add(new Vector3(-0.05, -0.02, 0.35));
const MISS_ARC = arc(MISS_POINT, 2.5);
const MISS_LAND = new Vector3(MISS_POINT.x - 0.12, BALL_R, MISS_POINT.z + 0.02);
const MISS_DIR = horiz(BALL_AT.guest, MISS_POINT);

// ── Host pass ─────────────────────────────────────────────────────────────────
const PASS_DIR = horiz(BALL_AT.host, BALL_AT.guest);

const SPINS: Record<SequenceName, Spin[]> = {
  host: [
    { t0: 0, t1: 0.2, axis: rollAxis(PASS_DIR).negate(), angle: (s) => -0.25 * Math.sin(Math.PI * s) },
    // Slight natural backspin in the air; the catch settles it.
    { t0: 0.2, t1: 0.85, axis: rollAxis(PASS_DIR).negate(), angle: (s) => 2.4 * s },
    { t0: 0.85, t1: 1.2, axis: rollAxis(PASS_DIR), angle: (s) => 0.35 * EASE.land(s) },
  ],
  accept: [
    { t0: 0, t1: 0.2, axis: rollAxis(MADE_DIR), angle: (s) => -0.2 * Math.sin(Math.PI * s) },
    { t0: 0.2, t1: 0.95, axis: rollAxis(MADE_DIR).negate(), angle: (s) => 7.5 * s },
    { t0: 0.95, t1: 1.22, axis: rollAxis(MADE_DIR).negate(), angle: (s) => 1.3 * s },
    { t0: 1.22, t1: 1.7, axis: rollAxis(horiz(MADE_LAND, BALL_AT.made)), angle: (s) => (BALL_AT.made.distanceTo(MADE_LAND) / BALL_R) * EASE.land(s) },
  ],
  decline: [
    { t0: 0, t1: 0.2, axis: rollAxis(MISS_DIR), angle: (s) => -0.2 * Math.sin(Math.PI * s) },
    { t0: 0.2, t1: 0.95, axis: rollAxis(MISS_DIR).negate(), angle: (s) => 7.2 * s },
    { t0: 0.95, t1: 1.12, axis: rollAxis(MISS_DIR).negate(), angle: (s) => 1.5 * s },
    { t0: 1.12, t1: 1.6, axis: rollAxis(horiz(MISS_LAND, BALL_AT.missed)), angle: (s) => (BALL_AT.missed.distanceTo(MISS_LAND) / BALL_R) * EASE.land(s) },
  ],
};

function host(t: number, out: SportsFrame): void {
  const p = out.ballPos;
  if (t < 0.2) {
    // A small preparatory rock back towards the far side.
    p.copy(BALL_AT.host).addScaledVector(PASS_DIR, -0.06 * Math.sin(Math.PI * seg(t, 0, 0.2)));
  } else if (t < 0.85) {
    const s = seg(t, 0.2, 0.85);
    p.lerpVectors(BALL_AT.host, BALL_AT.guest, s);
    p.y = BALL_R + 0.62 * 4 * s * (1 - s);
  } else {
    // One restrained catch: a single small hop into the presentation position, then still.
    const k = seg(t, 0.85, 1.05);
    p.copy(BALL_AT.guest);
    p.y = BALL_R + 0.06 * 4 * k * (1 - k);
  }
  orientation(SPINS.host, t, out.ballRot);
  out.netFlare = 0;
  out.netStretch = 0;
}

function shot(t: number, out: SportsFrame, made: boolean): void {
  const p = out.ballPos;
  const dir = made ? MADE_DIR : MISS_DIR;
  const path = made ? MADE_ARC : MISS_ARC;
  const land = made ? MADE_LAND : MISS_LAND;
  const rest = made ? BALL_AT.made : BALL_AT.missed;
  const landAt = made ? 1.22 : 1.12;
  const restAt = made ? 1.7 : 1.6;
  if (t < 0.2) prep(t, dir, p);
  else if (t < CONTACT_AT) path.at(seg(t, 0.2, CONTACT_AT), p);
  else if (t < landAt) {
    // From the rim (made) or beside it (miss) down to the floor: the net slows a made ball.
    const s = seg(t, CONTACT_AT, landAt);
    const from = made ? RIM_CENTER : MISS_POINT;
    const drop = made ? s * s * (0.35 + 0.65 * s) : s * s;
    p.lerpVectors(from, land, made ? 1 - (1 - s) ** 2 : s);
    p.y = from.y + (BALL_R - from.y) * drop;
  } else {
    // One small bounce, then roll to rest.
    const s = seg(t, landAt, restAt);
    const top = made ? MADE_BOUNCE_TOP : 0.16;
    p.lerpVectors(land, rest, EASE.land(s));
    const b = seg(s, 0, 0.62);
    p.y = BALL_R + (s < 0.62 ? top * 4 * b * (1 - b) : 0);
  }
  // Outcomes continue from the pass's final orientation (the guest-ready pose).
  orientation(made ? SPINS.accept : SPINS.decline, t, out.ballRot).multiply(GUEST_ROT);
  // The net answers only the made shot, starting exactly at contact.
  if (made && t >= CONTACT_AT) {
    const k = t - CONTACT_AT;
    const env = Math.sin(Math.PI * Math.min(1, k / 0.18)) * (k < 0.18 ? 1 : 0);
    out.netFlare = k < 0.18 ? env : dampedSettle(k - 0.18, -0.18, 3, 0.6, 0.45);
    out.netStretch = k < 0.18 ? env * 0.8 : dampedSettle(k - 0.18, -0.12, 3, 0.6, 0.45);
  } else {
    out.netFlare = 0;
    out.netStretch = 0;
  }
}


export function sampleSequence(sequence: SequenceName, t: number, out: SportsFrame): SportsFrame {
  const tc = Math.min(Math.max(t, 0), DURATIONS[sequence]);
  if (sequence === 'host') host(tc, out);
  else shot(tc, out, sequence === 'accept');
  return out;
}

const blank = (): SportsFrame => ({ ballPos: new Vector3(), ballRot: new Quaternion(), netFlare: 0, netStretch: 0 });

/** Canonical poses are the exact end states of their sequences (orientation included). */
const GUEST_END = sampleSequence('host', DURATIONS.host, blank());
const GUEST_ROT = GUEST_END.ballRot.clone();
const MADE_END = sampleSequence('accept', DURATIONS.accept, blank());
const MISSED_END = sampleSequence('decline', DURATIONS.decline, blank());

export function frameFor(pose: CanonicalPose, out: SportsFrame): SportsFrame {
  if (pose === 'host-ready') {
    out.ballPos.copy(BALL_AT.host);
    out.ballRot.identity();
  } else {
    const e = pose === 'guest-ready' ? GUEST_END : pose === 'accepted' ? MADE_END : MISSED_END;
    out.ballPos.copy(e.ballPos);
    out.ballRot.copy(e.ballRot);
  }
  out.netFlare = 0;
  out.netStretch = 0;
  return out;
}

export { MADE_ARC, MISS_ARC };

export function newFrame(): SportsFrame {
  return frameFor('guest-ready', blank());
}
