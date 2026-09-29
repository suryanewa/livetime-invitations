import { Euler, Quaternion, Vector3 } from 'three';
import { cubicBezier, cubicBezier3, dampedSettle, EASE, lerp, seg, smoothstep } from '../../motion/curves.ts';
import { ANCHOR_LAG, ANCHOR_RISE, DURATIONS, HOST_CARD, POSE, SCAN_AT } from './poses.ts';
import { CARD_OFFSET_Y, HANG_PIVOT } from '../../../models/keycard.ts';
import type { SequenceName } from '../../core/types.ts';

/**
 * Pure authored choreography: every function maps time → transforms, so replay,
 * interruption and frame rate never accumulate state (Master §6).
 */

export interface BusinessFrame {
  pivot: Vector3;
  rot: Quaternion;
  cardOffset: Vector3;
  cardTilt: number;
  gate: number;
  anchorX: number;
  anchorY: number;
  status: 'off' | 'lit';
}

const q = new Quaternion();
const e = new Euler();
const qa = new Quaternion(), qb = new Quaternion();
const readyQ = new Quaternion().setFromEuler(POSE.ready.rot);
const scanQ = new Quaternion().setFromEuler(POSE.scan.rot);
const restQ = new Quaternion().setFromEuler(POSE.rest.rot);
const hangOffset = new Vector3(0, CARD_OFFSET_Y, 0);

export function frameFor(pose: 'host-ready' | 'guest-ready' | 'accepted' | 'declined', out: BusinessFrame): BusinessFrame {
  if (pose === 'host-ready') {
    out.pivot.copy(POSE.ready.pivot);
    out.rot.copy(readyQ);
    out.cardOffset.copy(HOST_CARD.offset);
    out.cardTilt = HOST_CARD.tilt;
    out.gate = HOST_CARD.gateOpen;
    out.status = 'off';
  } else if (pose === 'guest-ready') {
    out.pivot.copy(POSE.ready.pivot);
    out.rot.copy(readyQ);
    out.cardOffset.copy(hangOffset);
    out.cardTilt = 0;
    out.gate = 0;
    out.status = 'off';
  } else {
    out.pivot.copy(POSE.rest.pivot);
    out.rot.copy(restQ);
    out.cardOffset.copy(hangOffset);
    out.cardTilt = 0;
    out.gate = 0;
    out.status = 'lit';
  }
  out.anchorX = out.pivot.x;
  out.anchorY = out.pivot.y + ANCHOR_RISE;
  return out;
}

export function newFrame(): BusinessFrame {
  return frameFor('guest-ready', {
    pivot: new Vector3(), rot: new Quaternion(), cardOffset: new Vector3(), cardTilt: 0, gate: 0, anchorX: 0, anchorY: 0, status: 'off',
  });
}

// ── Host: 1.2 s ───────────────────────────────────────────────────────────────
const hostTmp = new Vector3();
/** Spring gate: quick but visible close, no overshoot through the card. */
const GATE_CLOSE = cubicBezier(0.25, 0.8, 0.3, 1);
function host(t: number, out: BusinessFrame): void {
  frameFor('guest-ready', out);
  // 0–0.20: lift (with a small anticipation dip) to slot height in front of the open gate.
  // 0.20–0.50: slide straight back — the gate and run pass through the slot.
  // 0.46–0.60: gate swings up clear of the card face; 0.50–0.62: slot settles onto the run.
  if (t < 0.2) {
    const a = EASE.lift(seg(t, 0, 0.2));
    hostTmp.lerpVectors(HOST_CARD.offset, HOST_CARD.front, a);
    hostTmp.y -= Math.sin(Math.PI * seg(t, 0, 0.08)) * 0.02;
    out.cardTilt = lerp(HOST_CARD.tilt, 0, a);
  } else if (t < 0.5) {
    hostTmp.lerpVectors(HOST_CARD.front, HOST_CARD.slid, EASE.travel(seg(t, 0.2, 0.5)));
    out.cardTilt = 0;
  } else {
    hostTmp.lerpVectors(HOST_CARD.slid, hangOffset, EASE.land(seg(t, 0.5, 0.62)));
    out.cardTilt = 0;
  }
  out.cardOffset.copy(hostTmp);
  out.gate = t < 0.44 ? HOST_CARD.gateOpen : lerp(HOST_CARD.gateOpen, 0, GATE_CLOSE(seg(t, 0.44, 0.6)));
  // 0.60–0.95: support transfers to the lanyard — a small authored weight dip, damped by 1.2.
  const w = t < 0.6 ? 0 : dampedSettle(t - 0.6, -0.03, 2.4, 0.5, 0.6);
  out.pivot.y = HANG_PIVOT.y + (t < 0.6 ? 0 : w + 0.03 * (1 - smoothstep(seg(t, 0.6, 0.68))));
  out.anchorY = HANG_PIVOT.y + ANCHOR_RISE;
  out.status = 'off';
}

// ── Guest outcome: 1.5 s, identical motion for accept and decline ─────────────
const p0 = new Vector3(), c1 = new Vector3(), c2 = new Vector3(), p1 = new Vector3();
const travel = new Vector3(), toRest = new Vector3();
const normalPress = new Vector3(0, -0.69, -0.724);

function outcome(t: number, out: BusinessFrame): void {
  frameFor('guest-ready', out);
  if (t < 0.15) {
    // Angle toward the pad with a small anticipation lift.
    const a = EASE.lift(seg(t, 0, 0.15));
    out.pivot.y += Math.sin(Math.PI * a) * 0.015;
    e.set(-0.06 * a, 0, -0.1 * a);
    out.rot.setFromEuler(e);
  } else if (t < 0.7) {
    // Travel on an arc to the reading face.
    const s = EASE.travel(seg(t, 0.15, 0.7));
    p0.copy(POSE.ready.pivot);
    p1.copy(POSE.scan.pivot);
    c1.set(lerp(p0.x, p1.x, 0.35), p0.y + 0.08, p0.z + 0.25);
    c2.set(lerp(p0.x, p1.x, 0.85), p1.y + 0.28, p1.z + 0.3);
    cubicBezier3(travel, p0, c1, c2, p1, s);
    out.pivot.copy(travel);
    e.set(-0.06, 0, -0.1);
    qa.setFromEuler(e);
    out.rot.slerpQuaternions(qa, scanQ, EASE.travel(seg(t, 0.2, 0.7)));
  } else if (t < 1.2) {
    // Contact press (0.70–0.85), scan hold and small settle (0.85–1.20).
    out.pivot.copy(POSE.scan.pivot);
    out.rot.copy(scanQ);
    const press = Math.sin(Math.PI * seg(t, 0.7, 0.86)) * 0.022;
    out.pivot.addScaledVector(normalPress, press);
    const settle = t < 0.86 ? 0.012 * smoothstep(seg(t, 0.7, 0.86)) : dampedSettle(t - 0.86, 0.012, 3, 0.55, 0.34);
    e.set(settle, 0, settle * 0.5);
    qb.setFromEuler(e);
    out.rot.multiply(qb);
  } else {
    // Card leaves the pad and comes to rest beside it; line tension settles.
    const s = EASE.land(seg(t, 1.2, 1.5));
    toRest.lerpVectors(POSE.scan.pivot, POSE.rest.pivot, s);
    toRest.y += Math.sin(Math.PI * s) * 0.06;
    out.pivot.copy(toRest);
    out.rot.slerpQuaternions(scanQ, restQ, EASE.travel(seg(t, 1.2, 1.46)));
  }
  // Anchors (off-frame) trail the clip horizontally, so the strap visibly follows.
  const lagT = Math.max(0, t - ANCHOR_LAG);
  // The last leg finishes at t = 1.5 so the final frame equals the canonical pose exactly.
  const trailing = lagT < 0.15 ? POSE.ready.pivot.x
    : lagT < 0.7 ? lerp(POSE.ready.pivot.x, POSE.scan.pivot.x, EASE.travel(seg(lagT, 0.15, 0.7)))
    : lagT < 1.1 ? POSE.scan.pivot.x
    : lerp(POSE.scan.pivot.x, POSE.rest.pivot.x, EASE.land(seg(lagT, 1.1, 1.4)));
  out.anchorX = trailing;
  out.anchorY = out.pivot.y + ANCHOR_RISE;
  out.status = t >= SCAN_AT ? 'lit' : 'off';
}

export function sampleSequence(sequence: SequenceName, t: number, out: BusinessFrame): BusinessFrame {
  const d = DURATIONS[sequence];
  const tc = Math.min(Math.max(t, 0), d);
  if (sequence === 'host') host(tc, out);
  else outcome(tc, out);
  return out;
}

void q;
