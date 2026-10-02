import { Box3, Quaternion, Vector3 } from 'three';
import { BALL_AT, BALL_R, BOARD, HOOP_ROOT, POLE, RIM, RIM_CENTER, STAND } from '../../../models/sportsContract.ts';
import {
  BallTrack, BOUNCE, bounceTime, bounceToRest, cloneState, contactShift, fly, floorContact, GRAVITY, ROLL_DECEL, rollingSpin, throughNet, type BallState,
} from './ballPhysics.ts';
import {
  blankFrame, CONTACTS, gatherAngle, gatherAt, gatherAxis, gatherRate, gatherVelocity, type Launch, LAUNCH_LIFT, makeGather, MADE_DRIFT, RELEASE_AT, REST, RISE_FROM,
  NET_RATE, rollAxis, sampleTrack, SHOT_APEX_ABOVE_RIM, SHOT_BACKSPIN, solveNet, TRACKS,
} from './sequences.ts';
import type { SequenceName } from '../../core/types.ts';

/**
 * Sports v1.5: a change of mind continues the ball's own physics.
 *
 * The director's interruption (a 150 ms straight blend, or a cut) would reverse a flying ball in
 * one frame and slide it to the guest spot, or teleport it. Instead the scene answers
 * `interruptCut()` with true (Party and Business do the same) and draws the hand-over itself: a
 * **change track** from the ball's exact state on screen (position, velocity, spin, orientation)
 * to the new outcome's rest, made of the same physics as the sequences:
 *
 * 1. **The ball carries on.** In the air, in the net or bouncing, it follows its own track until
 *    its next floor contact (a shot in flight finishes, through the net if it was going in; a
 *    bounce lands). Rolling or at rest, it is on the floor already.
 * 2. **The hand acts through the floor**, as it does at every launch. At that contact the bounce
 *    is redirected (`floorContact` with an outgoing state, its squash following the larger
 *    impulse); from the floor (a ball at rest or rolling) the hand grabs it (it stops in a few
 *    centimetres), gathers it (the sequences' roll-back and rise) and launches it.
 *    - **To decline:** the ball is sent on towards the declined rest spot: it keeps the bounce's
 *      own height, rolls at the speed that brings it to rest exactly there (bounces at constant
 *      speed with matching spin, then rolling resistance: solved in closed form).
 *    - **To accept:** a shot through the rim centre with the made arc's apex and backspin; then the
 *      net (the canonical braking) and the bounces to the accepted rest spot (the net's hand-back
 *      solved by Newton so it comes to rest exactly there). From behind the board,
 *      or from under the rim, where a shot would hit the board or rise through the net, the ball is
 *      first hopped to the guest spot and shot from there.
 *
 * The track is planned once, when the director cuts, so the new sequence stays a pure function of
 * its time; it ends exactly on the new outcome's rest position (the orientation is the one the
 * ball really ends with). The only hand-over that still blends is the first 0.1 s of a gather,
 * while the ball sits on the floor at the guest spot (a few centimetres).
 */

/** What the scene shows when the guest changes their mind. */
export type Showing =
  /** A sequence's (or a change's) physics at time t: sampled by the director, or its tail. */
  | { kind: 'track'; seq: SequenceName; t: number; change: Change | null }
  /** A ball at rest (a canonical pose). */
  | { kind: 'rest'; pos: Vector3; rot: Quaternion };

/** A planned change of mind: the new outcome's ball, t = 0 at the cut, absolute orientations. */
export interface Change {
  to: SequenceName;
  track: BallTrack;
}

/** How fast the hand stops a rolling ball it grabs (su/s²). */
const GRAB = 4;
/** Knot spacing for copied and gathered motion (s). */
const STEP = 1 / 1000;
/** The spot a shot from a blocked place is taken from (the guest spot: the made arc's own). */
const SHOT_SPOT = BALL_AT.guest.clone();

/** True unless the ball sits in the first part of a gather (on the floor at the guest spot): there the director may blend. */
export function changeHandover(s: Showing): boolean {
  return !(s.kind === 'track' && !s.change && s.seq !== 'host' && s.t < RISE_FROM);
}

// ── The showing source ─────────────────────────────────────────────────────────────
interface Source {
  sample(t: number, p: Vector3, q: Quaternion, v: Vector3, w: Vector3): number;
  contacts: readonly { at: number }[];
  /** Time the ball stays down from (the end of its last contact), and the time it is at rest. */
  downAt: number;
  end: number;
}
const scratch = blankFrame();
function sourceOf(s: Extract<Showing, { kind: 'track' }>): Source {
  if (s.change) {
    const tr = s.change.track;
    return { sample: (t, p, q, v, w) => tr.sample(t, p, q, v, w), contacts: tr.contacts, downAt: tr.lastContactEnd, end: tr.end };
  }
  const seq = s.seq;
  const tr = TRACKS[seq];
  return {
    sample: (t, p, q, v, w) => {
      sampleTrack(seq, t, scratch, v, w);
      p.copy(scratch.ballPos);
      q.copy(scratch.ballRot);
      return scratch.squash;
    },
    contacts: CONTACTS[seq],
    downAt: tr.lastContactEnd,
    end: tr.end,
  };
}

/**
 * Step 1: copy the showing motion from its time t until its next floor contact (or, if it has no
 * more contacts, until it is down). Returns the state there and whether that is a contact (a
 * touch-down to redirect) or the floor (rolling or at rest).
 */
function carryOn(track: BallTrack, s: Showing): { st: BallState; atContact: boolean } {
  if (s.kind === 'rest') {
    const st: BallState = { t: 0, p: s.pos.clone().setY(BALL_R), v: new Vector3(), w: new Vector3(), q: s.rot.clone() };
    track.push(0, st.p, st.v, st.q, st.w);
    return { st, atContact: false };
  }
  const src = sourceOf(s);
  const t0 = s.t;
  const next = src.contacts.find((c) => c.at > t0 + 1e-9);
  const stop = next ? next.at : Math.max(t0, Math.min(src.downAt, src.end));
  const p = new Vector3(), q = new Quaternion(), v = new Vector3(), w = new Vector3();
  const n = Math.max(1, Math.ceil((stop - t0) / STEP));
  for (let i = 0; i <= n; i++) {
    // The last sample is the touch's left limit (the fall), not the contact's compression.
    const t = i === n ? stop - (next ? 1e-9 : 0) : t0 + ((stop - t0) * i) / n;
    const sq = src.sample(t, p, q, v, w);
    if (i === n && next) p.y = BALL_R;
    track.push(i === n ? stop - t0 : t - t0, p, v, q, w, sq);
    if (stop <= t0) break;
  }
  const st: BallState = { t: stop - t0, p: p.clone(), v: v.clone(), w: w.clone(), q: q.clone() };
  if (!next) {
    st.p.y = BALL_R;
    st.v.y = 0;
  }
  return { st, atContact: !!next };
}

// ── Step 2: the hand ───────────────────────────────────────────────────────────────
/** A rolling ball grabbed: it stops over a few centimetres (constant deceleration, rolling). */
function grab(track: BallTrack, st: BallState): void {
  const speed = Math.hypot(st.v.x, st.v.z);
  if (speed < 1e-6) return;
  const dir = new Vector3(st.v.x, 0, st.v.z).divideScalar(speed);
  const T = speed / GRAB;
  const p0 = st.p.clone(), q0 = st.q.clone(), t0 = st.t;
  const axis = rollAxis(dir), dq = new Quaternion(), p = new Vector3(), v = new Vector3(), q = new Quaternion(), w = new Vector3();
  const n = Math.max(1, Math.ceil(T / STEP));
  for (let i = 1; i <= n; i++) {
    const u = (T * i) / n;
    const along = speed * u - 0.5 * GRAB * u * u;
    p.copy(p0).addScaledVector(dir, along);
    v.copy(dir).multiplyScalar(speed - GRAB * u);
    q.copy(q0).premultiply(dq.setFromAxisAngle(axis, along / BALL_R));
    track.push(t0 + u, p, v, q, rollingSpin(v, w));
  }
  st.t = t0 + T;
  st.p.copy(p0).addScaledVector(dir, (speed * speed) / (2 * GRAB));
  st.v.set(0, 0, 0);
  st.w.set(0, 0, 0);
  st.q.copy(q);
}

/** From rest on the floor: the sequences' gather (roll back, rise, spin on in the hand) into `launch`. */
function gatherInto(track: BallTrack, st: BallState, launch: Launch): void {
  const g = makeGather(st.p.clone().setY(BALL_R), launch);
  const t0 = st.t, q0 = st.q.clone(), axis = gatherAxis(g);
  const p = new Vector3(), v = new Vector3(), q = new Quaternion(), w = new Vector3();
  const n = Math.ceil(RELEASE_AT / (2 * STEP));
  for (let i = 1; i <= n; i++) {
    const u = (RELEASE_AT * i) / n;
    gatherAt(g, u, p);
    gatherVelocity(g, u, v);
    q.setFromAxisAngle(axis, gatherAngle(g, u)).multiply(q0);
    track.push(t0 + u, p, v, q, w.copy(axis).multiplyScalar(gatherRate(g, u)));
  }
  st.t = t0 + RELEASE_AT;
  st.p.copy(launch.from);
  st.v.copy(launch.vh).setY(launch.vy);
  st.w.copy(axis).multiplyScalar(launch.spin);
  st.q.copy(q);
}

/**
 * Speed u that brings a ball leaving (or launched) with horizontal direction û to rest `dist`
 * away: it keeps u through its bounces (spin matched: no friction at the contacts) for `time`,
 * then rolls u²/(2a). Closed form.
 */
const restSpeed = (dist: number, time: number) => ROLL_DECEL * (-time + Math.sqrt(time * time + (2 * dist) / ROLL_DECEL));

/** To decline: send the ball on to `target`, where it comes to rest. */
function sendTo(track: BallTrack, st: BallState, atContact: boolean, target: Vector3): void {
  if (atContact) {
    // The bounce keeps its own height (at least a visible hop) and is turned towards the target.
    const vIn = st.v.clone();
    const vy = Math.max(BOUNCE.restitution * Math.max(0, -vIn.y), 2.2);
    const T = bounceTime(vy);
    // Solve with the contact's own displacement ((v_in + v_out)·τ/2).
    const L = target.clone().sub(st.p).setY(0).addScaledVector(vIn.clone().setY(0), -BOUNCE.contactTime / 2);
    const u = restSpeed(L.length(), T + BOUNCE.contactTime / 2);
    const out = L.normalize().multiplyScalar(u);
    floorContact(track, st, { v: out.clone().setY(vy), w: rollingSpin(out) });
  } else {
    grab(track, st);
    // A low lob from the hand, matched topspin: it lands rolling and bounces on to rest.
    const lift = 0.06, apex = 0.35;
    const vy = Math.sqrt(2 * GRAVITY * apex);
    const air = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * lift)) / GRAVITY;
    const land = Math.sqrt(vy * vy + 2 * GRAVITY * lift);
    const rebound = BOUNCE.restitution * land;
    const T = air + BOUNCE.contactTime + (rebound >= BOUNCE.minBounceSpeed ? bounceTime(rebound) : 0);
    const L = target.clone().sub(st.p).setY(0);
    const u = restSpeed(L.length(), T);
    const dir = L.normalize();
    gatherInto(track, st, { from: st.p.clone().setY(BALL_R + lift), vh: dir.clone().multiplyScalar(u), vy, spin: u / BALL_R, pullBack: 0.03 });
  }
  bounceToRest(track, st);
}

/** Hop the ball to land exactly at `spot` (a bounce turned, or a toss from the hand). */
function hopTo(track: BallTrack, st: BallState, atContact: boolean, spot: Vector3): void {
  const dist = Math.hypot(spot.x - st.p.x, spot.z - st.p.z);
  const apex = Math.min(1, Math.max(0.4, 0.25 * dist));
  const vy = Math.sqrt(2 * GRAVITY * apex);
  if (atContact) {
    const vIn = st.v.clone().setY(0);
    const air = (2 * vy) / GRAVITY;
    const L = spot.clone().sub(st.p).setY(0).addScaledVector(vIn, -BOUNCE.contactTime / 2);
    const out = L.divideScalar(air + BOUNCE.contactTime / 2);
    floorContact(track, st, { v: out.clone().setY(vy), w: rollingSpin(out) });
  } else {
    grab(track, st);
    const lift = 0.06;
    const air = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * lift)) / GRAVITY;
    const L = spot.clone().sub(st.p).setY(0);
    const out = L.divideScalar(air);
    gatherInto(track, st, { from: st.p.clone().setY(BALL_R + lift), vh: out, vy, spin: out.length() / BALL_R, pullBack: 0.03 });
  }
  if (!fly(track, st)) throw new Error('hop never landed');
}

const BOARD_BOX = new Box3(
  new Vector3(HOOP_ROOT.x - BOARD.width / 2, BOARD.centerY - BOARD.height / 2, HOOP_ROOT.z + BOARD.front - BOARD.thickness),
  new Vector3(HOOP_ROOT.x + BOARD.width / 2, BOARD.centerY + BOARD.height / 2, HOOP_ROOT.z + BOARD.front),
).expandByScalar(BALL_R + 0.03);

/** The made arc from a launch point (centre height y0) through the rim centre: velocity at launch and time to the rim. */
function shotFrom(p: Vector3, horizontalShift: Vector3 = new Vector3(), extraTime = 0): { v: Vector3; t: number } {
  const apex = RIM_CENTER.y + SHOT_APEX_ABOVE_RIM;
  const vy = Math.sqrt(2 * GRAVITY * (apex - p.y));
  const t = (vy + Math.sqrt(vy * vy - 2 * GRAVITY * (RIM_CENTER.y - p.y))) / GRAVITY;
  const L = RIM_CENTER.clone().sub(p).setY(0).sub(horizontalShift);
  return { v: L.divideScalar(t + extraTime).setY(vy), t };
}

/** True if the made arc from p reaches the rim cleanly: clear of the board, never rising through the net or the ring. */
export function shotClear(p: Vector3): boolean {
  const { v, t } = shotFrom(p);
  const q = new Vector3();
  for (let i = 0; i <= 60; i++) {
    const u = (t * i) / 60;
    q.copy(p).addScaledVector(v, u);
    q.y = p.y + v.y * u - 0.5 * GRAVITY * u * u;
    if (BOARD_BOX.containsPoint(q)) return false;
    const r = Math.hypot(q.x - RIM_CENTER.x, q.z - RIM_CENTER.z);
    const falling = v.y - GRAVITY * u < 0;
    // Below rim height near the axis only on the way down, inside the ring.
    if (q.y > RIM_CENTER.y - 1.2 && q.y < RIM_CENTER.y + BALL_R + RIM.tube && r < RIM.innerRadius + BALL_R + 0.1 && !(falling && r < RIM.innerRadius - BALL_R)) {
      if (i < 60) return false;
    }
  }
  // A shot needs room: not from under the hoop.
  return Math.hypot(p.x - RIM_CENTER.x, p.z - RIM_CENTER.z) > 1.1;
}

/** To accept: a shot into the rim, the net, and the bounces to rest exactly at `target`. */
function shootAt(track: BallTrack, st: BallState, atContact: boolean, target: Vector3): void {
  const backspin = -2 * Math.PI * SHOT_BACKSPIN.made;
  let toRim: number;
  if (atContact) {
    const vIn = st.v.clone().setY(0);
    // A bounce-shot: the hand turns the bounce into the made arc (from lift-off at the contact's end).
    const shift = vIn.clone().multiplyScalar(BOUNCE.contactTime / 2);
    const { v, t } = shotFrom(st.p, shift, BOUNCE.contactTime / 2);
    floorContact(track, st, { v, w: rollAxis(v.clone().setY(0).normalize()).multiplyScalar(backspin) });
    toRim = t;
  } else {
    grab(track, st);
    const from = st.p.clone().setY(BALL_R + LAUNCH_LIFT);
    const { v, t } = shotFrom(from);
    gatherInto(track, st, { from, vh: v.clone().setY(0), vy: v.y, spin: backspin, pullBack: 0.05 });
    toRim = t;
  }
  fly(track, st, st.t + toRim);
  // The net, solved for this entry (the canonical braking; the hand-back aimed so the ball comes to
  // rest on the target): Newton on the exit drift over the cheap post-net motion, twice through the net.
  const entry = cloneState(st);
  const drift = MADE_DRIFT.clone();
  for (let outer = 0; outer < 3; outer++) {
    const exit = cloneState(entry);
    throughNet(new BallTrack(false), exit, solveNet(cloneState(entry), drift, NET_RATE));
    const restOf = (u: Vector3) => {
      const s2 = cloneState(exit);
      s2.v.x = u.x;
      s2.v.z = u.z;
      bounceToRest(new BallTrack(false), s2);
      return s2.p;
    };
    const u = exit.v.clone().setY(0);
    for (let i = 0; i < 10; i++) {
      const r = restOf(u);
      const ex = target.x - r.x, ez = target.z - r.z;
      if (Math.hypot(ex, ez) < 1e-9) break;
      const h = 1e-4;
      const rx = restOf(u.clone().setX(u.x + h)), rz = restOf(u.clone().setZ(u.z + h));
      const a = (rx.x - r.x) / h, b = (rz.x - r.x) / h, c = (rx.z - r.z) / h, d = (rz.z - r.z) / h;
      const det = a * d - b * c;
      if (Math.abs(det) < 1e-12) break;
      u.x += (d * ex - b * ez) / det;
      u.z += (-c * ex + a * ez) / det;
    }
    // Aim the net's hand-back by the correction the exit needs.
    drift.x += u.x - exit.v.x;
    drift.z += u.z - exit.v.z;
  }
  throughNet(track, st, solveNet(cloneState(entry), drift, NET_RATE));
  bounceToRest(track, st);
}

/** The straight floor path from a to b stays clear of the stand (base and pole), with the ball's radius. */
export function floorPathClear(a: Vector3, b: Vector3): boolean {
  const base = new Box3(
    new Vector3(HOOP_ROOT.x - STAND.base.halfWidth, -1, HOOP_ROOT.z + STAND.base.back),
    new Vector3(HOOP_ROOT.x + STAND.base.halfWidth, 1, HOOP_ROOT.z + STAND.base.front),
  ).expandByScalar(BALL_R + 0.05);
  const foot = HOOP_ROOT.clone().add(POLE.foot).setY(0);
  const p = new Vector3();
  for (let i = 0; i <= 64; i++) {
    p.lerpVectors(a, b, i / 64).setY(0);
    if (base.containsPoint(p) || Math.hypot(p.x - foot.x, p.z - foot.z) < BALL_R + POLE.radius + 0.1) return false;
  }
  return true;
}

/** Plan the change of mind from what is showing to the new sequence `to` (accept or decline). */
export function planChange(s: Showing, to: SequenceName): Change {
  const track = new BallTrack();
  const { st, atContact } = carryOn(track, s);
  if (to === 'accept') {
    let contact = atContact;
    if (!shotClear(st.p)) {
      hopTo(track, st, contact, SHOT_SPOT);
      contact = true;
    }
    shootAt(track, st, contact, REST.made);
  } else {
    sendTo(track, st, atContact, REST.missed);
  }
  return { to, track };
}
