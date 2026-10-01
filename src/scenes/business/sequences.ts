import { Euler, Quaternion, Vector3 } from 'three';
import { CARD_OFFSET_Y, HANG_PIVOT, HOOK, RIDE } from '../../../models/businessContract.ts';
import { cubicBezier, cubicBezier3, dampedSettle, EASE, lerp, seg, smoothstep } from '../../motion/curves.ts';
import type { SequenceName } from '../../core/types.ts';
import {
  ANCHOR_LAG, ANCHOR_RISE, cardFromRide, SLOT_MID, cardOnHook, DURATIONS, FACE_NORMAL, FACE_UP, HOOK_PATH, hookRide, HOST, POSE, PRESS_TRAVEL, SCAN_AT, SCAN_GAP,
} from './poses.ts';

/**
 * Pure authored choreography: every function maps time → transforms, so replay,
 * interruption and frame rate never accumulate state (Master §6). Every beat boundary is C1:
 * beats meet at rest or share their velocity.
 */

export interface BusinessFrame {
  /** card_authored: the swivel eye (D-ring and hook hang from it). */
  pivot: Vector3;
  rot: Quaternion;
  /** clip_pivot: the hook turning on its eye (about x; + = its bottom back). */
  clipTilt: number;
  /** clip_pivot: the hook turning on the swivel (about its own y, after the tilt). */
  swivel: number;
  /**
   * card_mesh (clip space): holder centre and pitch. The card's rotation is
   * Rx(clipTilt)·Ry(swivel)·Rx(cardTilt − clipTilt) (cardRotation): its pitch on the hook,
   * carried round by the hook. Without a swivel turn that is just Rx(cardTilt).
   */
  cardOffset: Vector3;
  cardTilt: number;
  gate: number;
  anchorX: number;
  anchorY: number;
  status: 'off' | 'lit';
  /** Status light level through its short rise (0–1; 0 when off). */
  statusLevel: number;
  /** How far the glass (and the gasket under it) gives at the press, stage units. */
  glass: number;
}

const X = new Vector3(1, 0, 0);
const e = new Euler();
const qa = new Quaternion(), qb = new Quaternion();
const readyQ = new Quaternion().setFromEuler(POSE.ready.rot);
const scanQ = new Quaternion().setFromEuler(POSE.scan.rot);
const restQ = new Quaternion().setFromEuler(POSE.rest.rot);
const hangOffset = new Vector3(0, CARD_OFFSET_Y, 0);

export function frameFor(pose: 'host-ready' | 'guest-ready' | 'accepted' | 'declined', out: BusinessFrame): BusinessFrame {
  out.clipTilt = 0;
  out.swivel = 0;
  out.cardTilt = 0;
  out.gate = 0;
  out.glass = 0;
  out.cardOffset.copy(hangOffset);
  if (pose === 'host-ready') {
    out.pivot.copy(POSE.ready.pivot);
    out.rot.copy(readyQ);
    out.cardOffset.copy(HOST.offset);
    out.cardTilt = HOST.tilt;
    out.gate = HOST.gateOpen;
    out.status = 'off';
    out.statusLevel = 0;
  } else if (pose === 'guest-ready') {
    out.pivot.copy(POSE.ready.pivot);
    out.rot.copy(readyQ);
    out.status = 'off';
    out.statusLevel = 0;
  } else {
    out.pivot.copy(POSE.rest.pivot);
    out.rot.copy(restQ);
    out.status = 'lit';
    out.statusLevel = 1;
  }
  out.anchorX = out.pivot.x;
  out.anchorY = out.pivot.y + ANCHOR_RISE;
  return out;
}

export function newFrame(): BusinessFrame {
  return frameFor('guest-ready', {
    pivot: new Vector3(), rot: new Quaternion(), clipTilt: 0, swivel: 0, cardOffset: new Vector3(), cardTilt: 0, gate: 0,
    anchorX: 0, anchorY: 0, status: 'off', statusLevel: 0, glass: 0,
  });
}

/**
 * Round the U the wire bows towards the strip inside the holder's thickness (z²/2R ≈ 0.01), so
 * the slot rides a little low on the wire until the strip settles onto the bottom of the U.
 */
const ARC_SAG = 0.012;
/** Card-space slot height on the wire while threading (see cardFromRide). */
const THREAD_Y = SLOT_MID;
// ── Host: 1.2 s ───────────────────────────────────────────────────────────────
const ride = new Vector3(), centre = new Vector3();
const h0 = new Vector3(), h1 = new Vector3(), hc1 = new Vector3(), hc2 = new Vector3();
const Y = new Vector3(0, 1, 0);
/** Hook space → clip space: tilt on the eye, then the swivel. */
function hookToClip(v: Vector3, hook: number, swivel: number): Vector3 {
  return v.applyAxisAngle(Y, swivel).applyAxisAngle(X, hook);
}
/** Card pose (clip space) with the hook turned by `hook` on its eye and `swivel` on the swivel. */
function onTurnedHook(rideAt: Vector3, rel: number, hook: number, swivel: number, out: BusinessFrame, rideY = THREAD_Y): void {
  hookToClip(cardFromRide(rideAt, rel, centre, rideY), hook, swivel);
  out.cardOffset.copy(centre);
  out.cardTilt = hook + rel;
  out.clipTilt = hook;
  out.swivel = swivel;
}
/** Pre-entry: the card at right angles to the front leg, its strip level with the gate gap. */
const PRE_RIDE = new Vector3(0, HOST.gapY, HOST.entryZ);
const PRE_CENTRE = hookToClip(cardFromRide(PRE_RIDE, -Math.PI / 2, new Vector3(), THREAD_Y), HOST.hookTilt, HOST.swivel);
const PRE_TILT = HOST.hookTilt - Math.PI / 2;
/** Entered: the ride point on the front leg's centreline (the strip is inside the hook). */
const ENTERED_Z = HOOK.legZ;
/** Spring gate: released, it snaps shut fast and lands without overshoot through the card. */
const GATE_CLOSE = cubicBezier(0.3, 0.7, 0.3, 1);
/** Half-width (in arc lengths) of the eased start of the card's turn where the leg meets the U. */
const TURN_EASE = 0.3;
/** Host beat times. */
export const HOST_BEATS = { present: 0.24, entered: 0.4, hung: 0.64, gate: [0.56, 0.68] as const } as const;

function host(t: number, out: BusinessFrame): void {
  frameFor('guest-ready', out);
  const { present, entered, hung } = HOST_BEATS;
  if (t < present) {
    // Lift from host-ready and offer the card to the hook at 45°, its strip in front of the gap,
    // while the hook turns back on its eye to take it.
    const a = EASE.lift(seg(t, 0, present));
    h0.copy(HOST.offset);
    h1.copy(PRE_CENTRE);
    hc1.copy(h0).add(new Vector3(0, 0.22, 0.06));
    hc2.copy(h1).add(new Vector3(0, -0.16, 0.12));
    cubicBezier3(out.cardOffset, h0, hc1, hc2, h1, a);
    out.cardTilt = lerp(HOST.tilt, PRE_TILT, a);
    const k = EASE.lift(seg(t, 0.04, present));
    out.clipTilt = HOST.hookTilt * k;
    out.swivel = HOST.swivel * a;
  } else if (t < entered) {
    // Push: the strip passes through the open gate's gap into the hook.
    ride.set(0, HOST.gapY, lerp(HOST.entryZ, ENTERED_Z, EASE.travel(seg(t, present, entered))));
    onTurnedHook(ride, -Math.PI / 2, HOST.hookTilt, HOST.swivel, out);
  } else {
    // Drop: the slot slides down the front leg and round the U; the card swings down to hang
    // as the hook comes back under the eye.
    const s = HOOK_PATH.length * EASE.travel(seg(t, entered, hung));
    hookRide(s, ride);
    // The card stays square to the wire: −90° on the leg, then −φ round the U. Where the leg
    // meets the arc the turn eases in over ±TURN_EASE arc lengths (a C1 ramp, within the slot's
    // slack), so it never snaps on.
    const x = s - HOOK_PATH.leg, h = TURN_EASE * HOOK_PATH.arc;
    const ramp = x >= h ? x : x <= -h ? 0 : ((x + h) * (x + h)) / (4 * h);
    const g = Math.min(1, ramp / HOOK_PATH.arc);
    onTurnedHook(ride, -(Math.PI / 2) * (1 - g), HOST.hookTilt * (1 - g), HOST.swivel * (1 - smoothstep(Math.min(1, s / HOOK_PATH.length))), out, lerp(THREAD_Y - ARC_SAG * Math.sin(Math.PI * g), RIDE.y, g * g * g));
  }
  const [g0, g1] = HOST_BEATS.gate;
  out.gate = t < g0 ? HOST.gateOpen : lerp(HOST.gateOpen, 0, GATE_CLOSE(seg(t, g0, g1)));
  // After the drop the strap takes the weight: a small authored dip of the eye, damped by 1.2.
  const w = t < hung ? 0 : dampedSettle(t - hung, -0.03, 2.4, 0.5, DURATIONS.host - hung);
  out.pivot.y = HANG_PIVOT.y + (t < hung ? 0 : w + 0.03 * (1 - smoothstep(seg(t, hung, hung + 0.08))));
  out.anchorY = HANG_PIVOT.y + ANCHOR_RISE;
  out.status = 'off';
}

// ── Guest outcome: 1.5 s, identical motion for accept and decline ─────────────
const p0 = new Vector3(), c1 = new Vector3(), c2 = new Vector3(), p1 = new Vector3();
const travel = new Vector3(), toRest = new Vector3();
/** Beats of the guest outcome. */
export const OUTCOME_BEATS = { contact: 0.7, pressEnd: 0.86, depart: 1.14 } as const;
/** In-plane settle of the pressed card about the face normal (rad), C1 at both ends. */
const SETTLE = { amplitude: 0.01, hz: 3, zeta: 0.55 };
const qn = new Quaternion(), cardWorld = new Vector3();

/** C1 damped settle: starts at `a` with zero velocity, fades to exactly 0 by `end`. */
function settleC1(t: number, a: number, hz: number, zeta: number, end: number): number {
  if (t <= 0) return a;
  if (t >= end) return 0;
  const w = 2 * Math.PI * hz, wd = w * Math.sqrt(1 - zeta * zeta);
  const v = a * Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
  return v * (1 - smoothstep(seg(t, end * 0.5, end)));
}

function outcome(t: number, out: BusinessFrame): void {
  frameFor('guest-ready', out);
  const { contact, pressEnd, depart } = OUTCOME_BEATS;
  if (t < 0.15) {
    // Angle toward the reader with a small anticipation lift.
    const a = EASE.lift(seg(t, 0, 0.15));
    out.pivot.y += Math.sin(Math.PI * a) * 0.015;
    e.set(-0.06 * a, 0, -0.1 * a);
    out.rot.setFromEuler(e);
  } else if (t < contact) {
    // Travel on an arc to the reading face, arriving along its normal; the card turns flat to
    // the glass first and the clip flops forward on the slot as it gets close.
    const s = EASE.travel(seg(t, 0.15, contact));
    p0.copy(POSE.ready.pivot);
    p1.copy(POSE.scan.pivot);
    c1.set(lerp(p0.x, p1.x, 0.35), p0.y + 0.08, p0.z + 0.25);
    c2.copy(p1).addScaledVector(FACE_NORMAL, 0.34).addScaledVector(FACE_UP, 0.04);
    cubicBezier3(travel, p0, c1, c2, p1, s);
    out.pivot.copy(travel);
    e.set(-0.06, 0, -0.1);
    qa.setFromEuler(e);
    const r = EASE.travel(seg(t, 0.2, 0.64));
    out.rot.slerpQuaternions(qa, scanQ, r);
    out.cardTilt = POSE.scan.cardTilt * r;
    out.cardOffset.copy(cardOnHook(out.cardTilt, cardWorld));
  } else if (t < depart) {
    // Contact press (0.70–0.86): the clips close the hover gap and push the glass in by 1 mm
    // (the gasket takes it), then the card relaxes on the glass with a tiny in-plane settle.
    out.pivot.copy(POSE.scan.pivot);
    out.rot.copy(scanQ);
    out.cardTilt = POSE.scan.cardTilt;
    out.cardOffset.copy(cardOnHook(out.cardTilt, cardWorld));
    const k = Math.sin((Math.PI * seg(t, contact, pressEnd)));
    const press = PRESS_TRAVEL * k * k;
    out.pivot.addScaledVector(FACE_NORMAL, -press);
    // The glass starts to give where the clips meet it: a C1 contact ramp (never less than the
    // card's own travel past the gap, so the card never passes into the glass).
    const into = press - SCAN_GAP, h = 0.0008;
    out.glass = into >= h ? into : into <= -h ? 0 : ((into + h) * (into + h)) / (4 * h);
    const ks = Math.sin((Math.PI / 2) * seg(t, contact, pressEnd));
    const a = t < pressEnd ? SETTLE.amplitude * ks * ks : settleC1(t - pressEnd, SETTLE.amplitude, SETTLE.hz, SETTLE.zeta, depart - pressEnd);
    if (a !== 0) {
      // Rotate the whole badge about the face normal through the card centre.
      cardWorld.copy(out.cardOffset).applyQuaternion(out.rot).add(out.pivot);
      qn.setFromAxisAngle(FACE_NORMAL, a);
      out.pivot.sub(cardWorld).applyQuaternion(qn).add(cardWorld);
      out.rot.premultiply(qn);
    }
  } else {
    // The card leaves the glass from rest and comes to rest beside the reader.
    const s = EASE.lift(seg(t, depart, 1.5));
    toRest.lerpVectors(POSE.scan.pivot, POSE.rest.pivot, s);
    toRest.y += Math.sin(Math.PI * s) * 0.06;
    const peel = Math.sin(Math.PI * Math.min(1, s * 1.6));
    toRest.addScaledVector(FACE_NORMAL, peel * peel * 0.08);
    out.pivot.copy(toRest);
    const r = EASE.travel(seg(t, depart, 1.46));
    out.rot.slerpQuaternions(scanQ, restQ, r);
    out.cardTilt = POSE.scan.cardTilt * (1 - r);
    out.cardOffset.copy(cardOnHook(out.cardTilt, cardWorld));
  }
  // Anchors (off-frame) trail the clip horizontally, so the strap visibly follows.
  const lagT = Math.max(0, t - ANCHOR_LAG);
  // The last leg starts from rest just after the clip's and finishes at t = 1.5, so the strap
  // trails the card and the final frame equals the canonical pose exactly.
  const trailing = lagT < 0.15 ? POSE.ready.pivot.x
    : lagT < 0.7 ? lerp(POSE.ready.pivot.x, POSE.scan.pivot.x, EASE.travel(seg(lagT, 0.15, 0.7)))
    : lagT < 1.1 ? POSE.scan.pivot.x
    : lerp(POSE.scan.pivot.x, POSE.rest.pivot.x, EASE.lift(seg(lagT, 1.1, 1.4)));
  out.anchorX = trailing;
  out.anchorY = out.pivot.y + ANCHOR_RISE;
  out.status = t >= SCAN_AT ? 'lit' : 'off';
  // The LED switches on at the contact beat and its glow rises over 90 ms.
  out.statusLevel = t >= SCAN_AT ? 0.2 + 0.8 * smoothstep(seg(t, SCAN_AT, SCAN_AT + 0.09)) : 0;
}

export function sampleSequence(sequence: SequenceName, t: number, out: BusinessFrame): BusinessFrame {
  const d = DURATIONS[sequence];
  const tc = Math.min(Math.max(t, 0), d);
  if (sequence === 'host') host(tc, out);
  else outcome(tc, out);
  out.rot.normalize();
  return out;
}

void qb;

const qc = new Quaternion(), qy = new Quaternion();
/** The card's rotation in clip space for a frame (see BusinessFrame.cardTilt). */
export function cardRotation(f: BusinessFrame, out = new Quaternion()): Quaternion {
  out.setFromAxisAngle(X, f.clipTilt);
  if (f.swivel !== 0) out.multiply(qy.setFromAxisAngle(Y, f.swivel));
  return out.multiply(qc.setFromAxisAngle(X, f.cardTilt - f.clipTilt));
}
