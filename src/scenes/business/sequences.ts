import { Euler, Quaternion, Vector3 } from 'three';
import { CARD, CARD_OFFSET_Y, FACE, HANG_PIVOT, HOLDER_CLIPS, HOOK, hookCentreline, READER, READER_SCALE, RIDE, SCANNER_POS } from '../../../models/businessContract.ts';
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
/** The push direction (clip space): along the hook's −z, i.e. up through the downward-facing gate. */
const PUSH_DIR = hookToClip(new Vector3(0, 0, -1), HOST.hookTilt, HOST.swivel);
/** Entered: the ride point on the front leg's centreline (the strip is inside the hook). */
const ENTERED_Z = HOOK.legZ;
/** Spring gate: released, it snaps shut fast and lands without overshoot through the card. */
const GATE_CLOSE = cubicBezier(0.3, 0.7, 0.3, 1);
/** The offer's tilt ease: an even turn (no quick first half), at rest at both ends. */
const OFFER = cubicBezier(0.42, 0, 0.3, 1);
/** Half-width (in arc lengths) of the eased start of the card's turn where the leg meets the U. */
const TURN_EASE = 0.3;
/**
 * Host beat times: the offer (hook turned back, card lifted to below the gate), the thread (push up
 * through the gate, round a small corner onto the leg, slide along it; ending at SLIDE_SPEED), the
 * swing home round the U (starting at that speed, ending at rest), the gate's spring close.
 * `entered` is when the slot centres on the front leg (the strip is through the gate).
 *
 * v1.2.2: the offer hands its speed to the push (THREAD_SPEED) and the push rounds into the slide,
 * so the card never stops between the lift and the swing (v1.2.1 came to rest at 0.30 s and again
 * at 0.42 s: a stop-hop-stop).
 */
export const HOST_BEATS = { present: 0.28, entered: 0.39, leg: 0.5, hung: 0.94, gate: [0.6, 0.72] as const } as const;
/** Ride speed (stage units/s) where the leg meets the U: the slide hands over to the swing at it. */
const SLIDE_SPEED = 0.45;
/** Ride speed (stage units/s) the offer hands to the push. */
const THREAD_SPEED = 0.7;
/**
 * Corner between the push (hook −z) and the leg (hook −y): a quarter circle of this radius. The
 * slot is 0.051 tall round a 0.033 wire, so the strip can turn down the leg only once the slot is
 * within about 0.009 of centring on it.
 */
const CORNER = 0.006;
/** The push, corner and leg as one path (arc lengths, hook space). */
const THREAD = (() => {
  const push = HOST.entryZ - ENTERED_Z - CORNER;
  const corner = (Math.PI / 2) * CORNER;
  const leg = HOOK_PATH.leg - CORNER;
  return { push, corner, leg, length: push + corner + leg };
})();

/** How far before the pre-entry point the offer's curve already runs along the push (stage units). */
const OFFER_LEAD = 0.24;
/** End slope of the offer's ease, so its last stretch moves at THREAD_SPEED along the push. */
const OFFER_END_SLOPE = (THREAD_SPEED * HOST_BEATS.present) / (3 * OFFER_LEAD);

/** Cubic Hermite on [0, 1]: p0 → p1 with end slopes m0, m1 (per unit u). */
function hermite(u: number, p0: number, p1: number, m0: number, m1: number): number {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
}

/**
 * Ride position at host time t, as an arc length σ from the pre-entry point along the push, the
 * corner, the leg and the U (THREAD then HOOK_PATH.arc). C1: it leaves the offer at THREAD_SPEED,
 * meets the U at SLIDE_SPEED and comes to rest when the card hangs.
 */
export function hostRide(t: number): number {
  const { present, leg, hung } = HOST_BEATS;
  if (t <= present) return 0;
  if (t >= hung) return THREAD.length + HOOK_PATH.arc;
  if (t < leg) return hermite(seg(t, present, leg), 0, THREAD.length, THREAD_SPEED * (leg - present), SLIDE_SPEED * (leg - present));
  return THREAD.length + hermite(seg(t, leg, hung), 0, HOOK_PATH.arc, SLIDE_SPEED * (hung - leg), 0);
}

/**
 * Ride point (hook space) at thread arc length σ; returns the arc length along HOOK_PATH (s, 0 =
 * the gap on the front leg's centreline), negative while the strip is still outside the leg.
 */
function threadRide(sigma: number, out: Vector3): number {
  const { push, corner } = THREAD;
  if (sigma <= push) {
    out.set(0, HOST.gapY, HOST.entryZ - sigma);
    return sigma - push - CORNER;
  }
  if (sigma < push + corner) {
    const th = (sigma - push) / CORNER;
    out.set(0, HOST.gapY - CORNER + CORNER * Math.cos(th), ENTERED_Z + CORNER - CORNER * Math.sin(th));
    // Count the corner as the 2·CORNER it replaces, linearly (only the sign and the leg matter).
    return -CORNER + (2 * CORNER * (sigma - push)) / corner;
  }
  const s = sigma - push - corner + CORNER;
  hookRide(s, out);
  return s;
}

function host(t: number, out: BusinessFrame): void {
  frameFor('guest-ready', out);
  const { present, hung } = HOST_BEATS;
  if (t < present) {
    // Lift from host-ready to just below the gate, upright, while the host turns the hook back on
    // its eye to take it; the last of the lift runs along the push direction and does not stop:
    // it hands THREAD_SPEED to the push.
    const u = seg(t, 0, present);
    h0.copy(HOST.offset);
    h1.copy(PRE_CENTRE);
    hc1.copy(h0).add(new Vector3(0, 0.2, -0.02));
    hc2.copy(h1).addScaledVector(PUSH_DIR, -OFFER_LEAD);
    cubicBezier3(out.cardOffset, h0, hc1, hc2, h1, hermite(u, 0, 1, 0, OFFER_END_SLOPE));
    const a = OFFER(u);
    out.cardTilt = lerp(HOST.tilt, PRE_TILT, a);
    out.clipTilt = HOST.hookTilt * smoothstep(u);
    out.swivel = HOST.swivel * a;
  } else {
    // Push: the strip passes up through the open gate's gap into the hook and rounds onto the
    // front leg (the card square to the wire, the hook held back); no stop between the beats.
    // Slide back along the leg, then round the U: the card stays square to the wire (−90° on the
    // leg, then −φ round the U) while the hook swings home by the same angle, so the card hangs
    // upright throughout and the hook carries it down. Where the leg meets the arc the turn eases
    // in over ±TURN_EASE arc lengths (a C1 ramp, within the slot's slack).
    const s = threadRide(hostRide(t), ride);
    const x = s - HOOK_PATH.leg, h = TURN_EASE * HOOK_PATH.arc;
    const ramp = x >= h ? x : x <= -h ? 0 : ((x + h) * (x + h)) / (4 * h);
    const g = Math.min(1, ramp / HOOK_PATH.arc);
    onTurnedHook(ride, -(Math.PI / 2) * (1 - g), HOST.hookTilt * (1 - g), HOST.swivel * (1 - g), out, lerp(THREAD_Y - ARC_SAG * Math.sin(Math.PI * g), RIDE.y, g * g * g));
  }
  const [g0, g1] = HOST_BEATS.gate;
  out.gate = t < g0 ? HOST.gateOpen : lerp(HOST.gateOpen, 0, GATE_CLOSE(seg(t, g0, g1)));
  // After the swing the strap takes the weight: a small authored dip of the eye, damped by 1.2.
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
/** The strap anchor's last leg: an even ease, so it never outruns its approach (it covers the same ground in less time). */
const ANCHOR_HOME = cubicBezier(0.4, 0, 0.35, 1);
/**
 * Lagged time the anchor's last leg starts (t = ANCHOR_DEPART + ANCHOR_LAG): v1.2.2 starts it with
 * the clip's departure (was 1.1, i.e. 60 ms after it) so the strap swings over 0.36 s, not 0.3 s.
 */
const ANCHOR_DEPART = OUTCOME_BEATS.depart - ANCHOR_LAG;

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
    // Contact press (0.70–0.86): the clips close the hover gap and push the glass in by 0.6 mm
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
    : lagT < ANCHOR_DEPART ? POSE.scan.pivot.x
    : lerp(POSE.scan.pivot.x, POSE.rest.pivot.x, ANCHOR_HOME(seg(lagT, ANCHOR_DEPART, 1.4)));
  out.anchorX = trailing;
  out.anchorY = out.pivot.y + ANCHOR_RISE;
  out.status = t >= SCAN_AT ? 'lit' : 'off';
  out.statusLevel = 0;
}

// ── Status light (v1.5) ─────────────────────────────────────────────────────────────
/**
 * How the reader's light answers, timed as real readers time theirs (HID Signo and Kisi flash or
 * "breathe" into green or red; EMV readers pair a success tone with the light) and never switching
 * on or off in a single frame: every edge is a ramp of the light's level, so the glyph emerges from
 * the dead-front glass instead of popping on.
 *
 * The ramps are perceptual, as a product's LED driver fades with gamma-corrected PWM: brightness is
 * seen roughly as its cube root (CIE L*), and the pictogram's HDR core reaches the tone curve's
 * shoulder by half of full level, so a ramp linear in level would look like a switch (v1.5's
 * first cut, an ease-out, showed 59 % of the change in its first 16 ms frame). Every edge is a
 * smootherstep, which starts and ends as a cube (10u³): the glyph surfaces from black over the
 * first third and the halo fills in after.
 *
 * - **Accept: one rise.** From the contact beat the light comes up over `attack` (0.22 s; above
 *   half by 0.11 s) and holds: the canonical `accepted` pose is lit at 1. (A crest above full,
 *   tried first as a "chime", added 5 % light to the halo only: invisible, so dropped.)
 * - **Decline: a double blink, then a hold.** On over `rise`, held `hold`, off over `fall`, dark
 *   for `gap`, on again and held lit (the canonical `declined` pose is lit at 1): two flashes, as a
 *   reader flags a refusal, without an alarm's repetition. On and off read about equal (above half
 *   level for 145 ms, below it for 175 ms): v1.5's first cut held on 225 ms and dark 96 ms, which
 *   read as a stutter. Finished 0.40 s after contact, before the card leaves the glass (depart
 *   1.14 s).
 *
 * Every piece meets the next with zero slope (C1; C2 inside each ramp), and both are pure in t.
 */
export const STATUS_TIMING = {
  accept: { attack: 0.22 },
  decline: { rise: 0.08, hold: 0.07, fall: 0.07, gap: 0.1 },
} as const;

/** Smootherstep (C2): 0 → 1 with zero slope and curvature at both ends; 10u³ near 0. */
const smoother = (x: number) => x * x * x * (x * (6 * x - 15) + 10);

/** Status level at `tau` seconds after the contact beat (0 before it), in [0, 1]. */
export function statusEnvelope(outcome: 'accept' | 'decline', tau: number): number {
  if (tau <= 0) return 0;
  // Smootherstep can round a hair past 0 or 1 near its ends: the level is clamped exactly.
  const level = (x: number) => Math.min(1, Math.max(0, x));
  if (outcome === 'accept') return level(smoother(seg(tau, 0, STATUS_TIMING.accept.attack)));
  const { rise, hold, fall, gap } = STATUS_TIMING.decline;
  const off = rise + hold, dark = off + fall, again = dark + gap;
  if (tau < off) return level(smoother(seg(tau, 0, rise)));
  if (tau < dark) return level(1 - smoother(seg(tau, off, dark)));
  return level(smoother(seg(tau, again, again + rise)));
}

export function sampleSequence(sequence: SequenceName, t: number, out: BusinessFrame): BusinessFrame {
  const d = DURATIONS[sequence];
  const tc = Math.min(Math.max(t, 0), d);
  if (sequence === 'host') host(tc, out);
  else {
    outcome(tc, out);
    out.statusLevel = statusEnvelope(sequence, tc - SCAN_AT);
  }
  out.rot.normalize();
  return out;
}

// ── Change of mind: the reader as a solid ───────────────────────────────────────────
// v1.2.1 cut wherever the straight blend below would pass into the reader (v1.2 measured 8–12 mm);
// v1.2.2 uses the same measure only to decide how far the recovery peels off the glass.
/**
 * The reader as a solid for the interruption check (face space): everything behind the front
 * surface across the reader's width, from the floor to its top. The front surface is the glass
 * inside the window, the steel bezel round it (up to 0.014 R proud) and its bottom lip (0.031 R
 * proud below the glass), plus a margin. Conservative: the top's slope back is counted as solid.
 */
const READER_SOLID = {
  halfWidth: READER.width / 2 + 0.02,
  front: FACE.bezelProud + 0.004,
  lip: 0.031 * READER_SCALE + 0.004,
  depth: READER.front - READER.back + 0.1,
  top: READER.height + 0.02,
} as const;
const faceAt = new Vector3();
/** Signed depth of a business_root point inside the reader solid (> 0 = inside), less `radius`. */
export function readerDepth(p: Vector3, radius = 0): number {
  faceAt.copy(p).sub(SCANNER_POS).sub(FACE.origin);
  const u = faceAt.x, v = faceAt.dot(FACE.up), w = faceAt.dot(FACE.normal);
  const front = v < FACE.glassY0 ? READER_SOLID.lip : READER_SOLID.front;
  return Math.min(
    READER_SOLID.halfWidth + radius - Math.abs(u),
    front + radius - w,
    w + READER_SOLID.depth + radius,
    READER_SOLID.top + radius - p.y,
    p.y + radius,
  );
}

/** Card-space samples of the holder (both faces' outline, the side clips) and the hook's wire. */
const CARD_SAMPLES: Vector3[] = (() => {
  const pts: Vector3[] = [];
  for (const z of [-CARD.depth / 2, CARD.depth / 2]) {
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 12; j++) pts.push(new Vector3((i / 8 - 0.5) * CARD.width, (j / 12 - 0.5) * CARD.height, z));
  }
  for (const sx of [-1, 1]) for (let j = 0; j <= 6; j++) pts.push(new Vector3(sx * HOLDER_CLIPS.x, HOLDER_CLIPS.y0 + ((HOLDER_CLIPS.y1 - HOLDER_CLIPS.y0) * j) / 6, -HOLDER_CLIPS.halfDepth));
  return pts;
})();
const HOOK_SAMPLES = hookCentreline(0.01);
const READY = frameFor('guest-ready', {
  pivot: new Vector3(), rot: new Quaternion(), clipTilt: 0, swivel: 0, cardOffset: new Vector3(), cardTilt: 0, gate: 0,
  anchorX: 0, anchorY: 0, status: 'off', statusLevel: 0, glass: 0,
});
const bq = { pivot: new Vector3(), rot: new Quaternion(), card: new Quaternion(), clip: new Quaternion(), offset: new Vector3() };
const fromCard = new Quaternion(), toCard = new Quaternion(), fromClip = new Quaternion(), toClip = new Quaternion(), bp = new Vector3();

/**
 * How deep the visual director's straight interruption blend (Master §6: 150 ms, position lerp and
 * quaternion slerp of each animated node) from `f` back to guest-ready would carry the badge into
 * the reader: the largest readerDepth over the blend (≤ 0 = it stays clear).
 */
export function blendReaderDepth(f: BusinessFrame, steps = 24): number {
  cardRotation(f, fromCard);
  cardRotation(READY, toCard);
  e.set(f.clipTilt, f.swivel, 0);
  fromClip.setFromEuler(e);
  e.set(READY.clipTilt, READY.swivel, 0);
  toClip.setFromEuler(e);
  let worst = -Infinity;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    bq.pivot.lerpVectors(f.pivot, READY.pivot, k);
    bq.rot.slerpQuaternions(f.rot, READY.rot, k);
    bq.offset.lerpVectors(f.cardOffset, READY.cardOffset, k);
    bq.card.slerpQuaternions(fromCard, toCard, k);
    bq.clip.slerpQuaternions(fromClip, toClip, k);
    for (const p of CARD_SAMPLES) {
      bp.copy(p).applyQuaternion(bq.card).add(bq.offset).applyQuaternion(bq.rot).add(bq.pivot);
      worst = Math.max(worst, readerDepth(bp));
    }
    for (const p of HOOK_SAMPLES) {
      bp.copy(p).applyQuaternion(bq.clip).applyQuaternion(bq.rot).add(bq.pivot);
      worst = Math.max(worst, readerDepth(bp, HOOK.tube));
    }
  }
  return worst;
}

const qc = new Quaternion(), qy = new Quaternion();
/** The card's rotation in clip space for a frame (see BusinessFrame.cardTilt). */
export function cardRotation(f: BusinessFrame, out = new Quaternion()): Quaternion {
  out.setFromAxisAngle(X, f.clipTilt);
  if (f.swivel !== 0) out.multiply(qy.setFromAxisAngle(Y, f.swivel));
  return out.multiply(qc.setFromAxisAngle(X, f.cardTilt - f.clipTilt));
}

// ── Change of mind: the scene's own recovery path (v1.2.2) ───────────────────────────
/**
 * A change of mind hands over from wherever the badge is (pressed on the glass, in the air on its
 * approach, at rest beside the reader) to the new outcome without a cut and without the director's
 * straight blend (which would pass through the reader). The scene asks the director to cut
 * (`interruptCut` → true: a 0 ms switch to guest-ready and the new sequence from t = 0) and then
 * draws the first RECOVER seconds of the new sequence as an offset that starts at the pose on
 * screen and decays to nothing:
 *
 * - the eye (pivot) follows an offset from the new sequence's own path: the pose on screen's offset
 *   decays by a smootherstep (gentle start, zero slope at both ends) and the old motion's velocity
 *   by a Hermite velocity term, so it starts with that velocity and arrives on the authored path
 *   with the authored velocity (C1 at both ends); a peel along the face normal makes the first move
 *   a lift off the glass;
 * - rotations and the card's turn on the hook hold for the first part of the peel (the card leaves
 *   flat, as it arrived) and then ease onto the authored ones (zero slope at both ends);
 * - the glass springs back exactly as far as the card has left it;
 * - the old status light fades out (the new one lights at the contact beat as usual).
 *
 * The new outcome's first 0.15 s is a near-still anticipation at guest-ready, so the badge passes
 * through the ready pose on its way, as Master §6 asks, and the sequence still ends 1.5 s after
 * the change (the director's blend took 0.15 s more).
 */
export const RECOVER = 0.3;
/** Peel along the face normal at full proximity (stage units, the bump's peak). */
export const PEEL = 0.14;
/** Fraction of the recovery the rotations hold while the card lifts off flat. */
const ROT_HOLD = 0.18;

export interface Recovery {
  from: BusinessFrame;
  /** Pivot velocity carried in from the interrupted motion (stage units/s, already scaled). */
  vel: Vector3;
  /** Peel amplitude (0 away from the reader). */
  peel: number;
}

/** Peel bump: 0 with zero slope at both ends, peak 1 at u = 0.4. */
const peelBump = (u: number) => (u * u * (1 - u) ** 3) / 0.03456;
const qOff = new Quaternion(), qI = new Quaternion(), rv = new Vector3();

export function copyFrame(src: BusinessFrame, out: BusinessFrame): BusinessFrame {
  out.pivot.copy(src.pivot);
  out.rot.copy(src.rot);
  out.clipTilt = src.clipTilt;
  out.swivel = src.swivel;
  out.cardOffset.copy(src.cardOffset);
  out.cardTilt = src.cardTilt;
  out.gate = src.gate;
  out.anchorX = src.anchorX;
  out.anchorY = src.anchorY;
  out.status = src.status;
  out.statusLevel = src.statusLevel;
  out.glass = src.glass;
  return out;
}

/**
 * Status level of the interrupted outcome's light while it fades (×its level at the change): over
 * 0.18 s, on the status light's perceptual edge (a cubic tail, so the glyph sinks into the glass
 * rather than cutting out at the end; v1.5, was a smoothstep).
 */
export function recoveryFade(t: number): number {
  return 1 - smoother(seg(t / RECOVER, 0, 0.6));
}

/**
 * Overlay the recovery on `out`, which holds the new sequence's authored frame at t (t < RECOVER;
 * the authored frame at t = 0 is exactly guest-ready).
 */
export function applyRecovery(r: Recovery, t: number, out: BusinessFrame): BusinessFrame {
  if (t >= RECOVER) return out;
  const u = Math.max(0, t) / RECOVER;
  const u2 = u * u, u3 = u2 * u;
  const h00 = 1 - smoother(u), h10 = (u3 - 2 * u2 + u) * RECOVER;
  const f = r.from;
  const authoredY = out.pivot.y;
  out.pivot
    .addScaledVector(rv.copy(f.pivot).sub(READY.pivot), h00)
    .addScaledVector(r.vel, h10)
    .addScaledVector(FACE_NORMAL, r.peel * peelBump(u));
  const keep = 1 - smoother(seg(u, ROT_HOLD, 1));
  // READY.rot is the identity: the offset rotation is the one on screen.
  qOff.copy(f.rot).multiply(qb.copy(READY.rot).invert());
  out.rot.premultiply(qI.identity().slerp(qOff, keep));
  out.clipTilt += (f.clipTilt - READY.clipTilt) * keep;
  out.swivel += (f.swivel - READY.swivel) * keep;
  out.gate += (f.gate - READY.gate) * keep;
  out.cardTilt += (f.cardTilt - READY.cardTilt) * keep;
  // The card stays on the hook: its centre follows its turn on the slot (plus any residual of the
  // pose on screen, e.g. a host frame, eased out with the rotations).
  const onHook = cardOnHook(out.cardTilt, rv);
  const resid = cardOnHook(f.cardTilt, c1).sub(f.cardOffset).multiplyScalar(-keep);
  out.cardOffset.copy(onHook).add(resid);
  out.anchorX += (f.anchorX - READY.anchorX) * (1 - smoother(u));
  out.anchorY += out.pivot.y - authoredY;
  // The glass gives back as far as the card has left it (the C1 contact ramp of the press).
  const into = f.glass - rv.copy(out.pivot).sub(f.pivot).dot(FACE_NORMAL), h = 0.0008;
  const glass = into >= h ? into : into <= -h ? 0 : ((into + h) * (into + h)) / (4 * h);
  out.glass = Math.max(out.glass, Math.min(f.glass, glass));
  return out;
}

const pathF = newFrame();
/** Deepest readerDepth of the badge over a recovery into `sequence` (card and hook samples). */
export function recoveryReaderDepth(r: Recovery, sequence: SequenceName, steps = 30): number {
  let worst = -Infinity;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * RECOVER;
    applyRecovery(r, t, sampleSequence(sequence, t, pathF));
    worst = Math.max(worst, frameReaderDepth(pathF));
  }
  return worst;
}

const fq = new Quaternion(), fc = new Quaternion(), fp = new Vector3();
/** Deepest readerDepth of a frame's holder and hook samples. */
export function frameReaderDepth(f: BusinessFrame): number {
  cardRotation(f, fc);
  e.set(f.clipTilt, f.swivel, 0);
  fq.setFromEuler(e);
  let worst = -Infinity;
  for (const p of CARD_SAMPLES) worst = Math.max(worst, readerDepth(fp.copy(p).applyQuaternion(fc).add(f.cardOffset).applyQuaternion(f.rot).add(f.pivot)));
  for (const p of HOOK_SAMPLES) worst = Math.max(worst, readerDepth(fp.copy(p).applyQuaternion(fq).applyQuaternion(f.rot).add(f.pivot), HOOK.tube));
  return worst;
}

/**
 * Plan the recovery from the pose on screen `from` (moving at `vel`) into `sequence`. Near the
 * reader the badge peels off along the face normal; away from it (where a straight blend is clear)
 * it does not. The carried velocity is kept whole unless it would carry the badge deeper into the
 * reader than it already is (an approach cut short just before contact): then it is scaled down
 * to the largest of 1, ¾, ½, ¼, 0 that keeps it clear. Deterministic.
 */
export function planRecovery(from: BusinessFrame, vel: Vector3, sequence: SequenceName): Recovery {
  const peel = PEEL * smoothstep(seg(blendReaderDepth(from), -0.1, 0));
  const r: Recovery = { from: copyFrame(from, newFrame()), vel: new Vector3(), peel };
  const start = Math.max(0, frameReaderDepth(from));
  for (const k of [1, 0.75, 0.5, 0.25, 0]) {
    r.vel.copy(vel).multiplyScalar(k);
    if (k === 0 || recoveryReaderDepth(r, sequence) <= start + 1e-4) break;
  }
  return r;
}
