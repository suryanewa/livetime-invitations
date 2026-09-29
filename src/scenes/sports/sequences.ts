import { Quaternion, Vector3 } from 'three';
import { EASE, dampedSettle, seg, smoothstep } from '../../motion/curves.ts';
import { CAMERA_ANGLES } from '../../render/camera.ts';
import { BALL_AT, BALL_R, MISS_OFFSET, NET, RIM_CENTER } from '../../../models/sportsContract.ts';
import type { CanonicalPose, SequenceName } from '../../core/types.ts';

/**
 * Pure authored choreography for Sports (Sports sub-spec). Trajectories are closed-form curves
 * sampled by time, never a projectile solver, so every Accept scores and every Decline misses at
 * any frame rate, on replay and after reversal. Every flight (pass, shot, airball, bounces) falls
 * under one gravity, the approved made arc's, and each beat hands its velocity on to the next:
 * nothing stops at the rim or restarts from rest.
 */

export const DURATIONS = { host: 1.2, accept: 1.7, decline: 1.6 } as const;

/** End of the shared gather: the shot leaves LAUNCH. */
export const RELEASE_AT = 0.2;
/** The made shot passes the rim centre, moving down, exactly at this beat (net contact). */
export const CONTACT_AT = 0.95;
const FLIGHT = CONTACT_AT - RELEASE_AT;

export interface SportsFrame {
  ballPos: Vector3;
  ballRot: Quaternion;
  /** Net deformation (0 at rest): lower rows widen and the net lengthens. */
  netFlare: number;
  netStretch: number;
}

const UP = new Vector3(0, 1, 0);
const horiz = (from: Vector3, to: Vector3) => new Vector3(to.x - from.x, 0, to.z - from.z).normalize();

// ── Flights under one gravity ────────────────────────────────────────────────────
interface Flight {
  from: Vector3;
  /** Horizontal velocity (y = 0), units per second. */
  vh: Vector3;
  /** Vertical launch speed, units per second. */
  vy: number;
  /** Gather wind-up: how far the ball rolls back, away from the target, before release. */
  pullBack: number;
}
function flightAt(f: Flight, t: number, out: Vector3): Vector3 {
  return out.copy(f.from).addScaledVector(f.vh, t).setY(f.from.y + f.vy * t - 0.5 * GRAVITY * t * t);
}
/** Time at which the ball, moving down, reaches height y (from launch speed vy at height y0). */
function fallTime(y0: number, vy: number, y: number): number {
  return (vy + Math.sqrt(vy * vy + 2 * GRAVITY * (y0 - y))) / GRAVITY;
}

/** The gather ends at LAUNCH, a little above the guest spot, and the shot leaves from there. */
const LAUNCH = BALL_AT.guest.clone().add(new Vector3(0, 0.12, 0));

// ── Made shot: the approved arc, LAUNCH → rim centre with its apex at 2.62 ─────────
const MADE_APEX = 2.62;
const madeArc = (): Flight & { g: number } => {
  // Height over normalised flight τ ∈ [0, 1]: LAUNCH.y + bτ + aτ², apex at MADE_APEX (the steep root).
  const D = RIM_CENTER.y - LAUNCH.y, K = MADE_APEX - LAUNCH.y;
  const bq = 4 * K - 2 * D;
  const a = (-bq - Math.sqrt(bq * bq - 4 * D * D)) / 2;
  const b = D - a;
  const vh = new Vector3(RIM_CENTER.x - LAUNCH.x, 0, RIM_CENTER.z - LAUNCH.z).divideScalar(FLIGHT);
  return { from: LAUNCH, vh, vy: b / FLIGHT, pullBack: 0.05, g: (-2 * a) / (FLIGHT * FLIGHT) };
};
const MADE_FLIGHT = madeArc();
/** Scene gravity (units/s²): the approved made arc's, shared by every flight and bounce. */
export const GRAVITY = MADE_FLIGHT.g;
const MADE_DIR = MADE_FLIGHT.vh.clone().normalize();

/**
 * Through the net: the ball keeps the arc's velocity at contact. While it is inside the net
 * (until its top clears the net's bottom) the net brakes it with one constant drag: its fall
 * slows to NET_KEEP of the entry speed (never to a stop) and its drift towards the board turns
 * back out towards the guest. From there it falls freely under GRAVITY to MADE_LAND.
 */
const NET_KEEP = 0.5;
const V_CONTACT = MADE_FLIGHT.vy - GRAVITY * FLIGHT;
const NET_EXIT_Y = RIM_CENTER.y - NET.depth - BALL_R;
/** Seconds after contact at which the made ball's top leaves the bottom of the net. */
export const NET_EXIT = (2 * (NET_EXIT_Y - RIM_CENTER.y)) / (V_CONTACT * (1 + NET_KEEP));
/** The net stays fully open this long after contact: until the ball has left its bottom. */
export const NET_HOLD = NET_EXIT;
const NET_VERTICAL = (V_CONTACT * (NET_KEEP - 1)) / NET_EXIT; // upward, so the ball slows
const V_EXIT = NET_KEEP * V_CONTACT;
const MADE_FALL = fallTime(NET_EXIT_Y, V_EXIT, BALL_R);
/** The made ball meets the floor at this time. */
export const MADE_LAND_AT = CONTACT_AT + NET_EXIT + MADE_FALL;
/** Landing spot: just out from the rim axis, on the way to the made rest spot. */
const MADE_LAND = RIM_CENTER.clone().addScaledVector(horiz(RIM_CENTER, BALL_AT.made), 0.14).setY(BALL_R);
const MADE_BOUNCE_TOP = 0.2;
/** Constant horizontal net drag that carries the entry drift into a landing on MADE_LAND. */
const NET_HORIZONTAL = (() => {
  const kL = NET_EXIT + MADE_FALL;
  const land = new Vector3(MADE_LAND.x - RIM_CENTER.x, 0, MADE_LAND.z - RIM_CENTER.z);
  return land.addScaledVector(MADE_FLIGHT.vh, -kL).divideScalar(NET_EXIT * (kL - NET_EXIT / 2));
})();
/** Total net drag (units/s², on top of gravity) while the made ball is inside the net. */
export const NET_DRAG = Math.hypot(NET_HORIZONTAL.length(), NET_VERTICAL + GRAVITY);
const MADE_EXIT_VH = MADE_FLIGHT.vh.clone().addScaledVector(NET_HORIZONTAL, NET_EXIT);

// ── Airball: thrown long and wide to the left, past the backboard, into the back of the court ──
/** Screen-right in the floor plane for the shared camera azimuth. */
const AZ = (CAMERA_ANGLES.azimuthDeg * Math.PI) / 180;
const SCREEN_RIGHT = new Vector3(Math.cos(AZ), 0, -Math.sin(AZ));
/** The airball flies in the vertical plane from the guest spot to its declined rest spot. */
const MISS_DIR = horiz(BALL_AT.guest, BALL_AT.missed);
/** Its apex: under the made arc's on screen, so the airball never widens the frame. */
const MISS_APEX = 2.36;
const MISS_VY = Math.sqrt(2 * GRAVITY * (MISS_APEX - LAUNCH.y));
/** Descending through rim height, the ball sits MISS_OFFSET screen-left of the rim centre. */
const MISS_AT_RIM = fallTime(LAUNCH.y, MISS_VY, RIM_CENTER.y);
const MISS_REACH = (RIM_CENTER.clone().sub(LAUNCH).dot(SCREEN_RIGHT) - MISS_OFFSET) / MISS_DIR.dot(SCREEN_RIGHT);
// Its wind-up points almost straight at the camera, so it rolls back less (it would otherwise dip
// below the ready ball's floor line on screen and widen the frame).
const MISS_FLIGHT: Flight = { from: LAUNCH, vh: MISS_DIR.clone().multiplyScalar(MISS_REACH / MISS_AT_RIM), vy: MISS_VY, pullBack: 0.03 };
/** Where the airball passes rim height, beside the hoop. */
export const MISS_POINT = flightAt(MISS_FLIGHT, MISS_AT_RIM, new Vector3());
/** The airball meets the floor at this time (its own parabola, extrapolated past the miss). */
export const MISS_LAND_AT = RELEASE_AT + fallTime(LAUNCH.y, MISS_VY, BALL_R);
const MISS_LAND = flightAt(MISS_FLIGHT, MISS_LAND_AT - RELEASE_AT, new Vector3());
const MISS_BOUNCE_TOP = 0.16;

// ── Shared gather (0 – RELEASE_AT): roll back, then rise into the release still accelerating ──
const LIFT = LAUNCH.y - BALL_R;
const RISE_FROM = 0.1;
/**
 * Offset along the shot direction during the gather: at rest, then a cubic pull-back of exactly
 * the flight's `pullBack` that swings forward into its own horizontal speed at release.
 */
function gatherAlong(f: Flight, t: number): number {
  const v = f.vh.length();
  const window = (f.pullBack * 27) / (4 * v);
  const s = seg(t, RELEASE_AT - window, RELEASE_AT);
  return v * window * (s * s * s - s * s);
}
function gather(f: Flight, t: number, out: Vector3): void {
  out.copy(BALL_AT.guest).addScaledVector(f.vh.clone().normalize(), gatherAlong(f, t));
  // An ease-in rise: the ball is still speeding up as it leaves, never parked in the air.
  out.y = BALL_R + LIFT * seg(t, RISE_FROM, RELEASE_AT) ** 4;
}

// ── Landing: one bounce under GRAVITY, then roll out to rest ─────────────────────
/**
 * Horizontal progress from the landing spot to the rest spot: starts at `v0` (normalised speed)
 * and arrives with zero speed. `v0` is clamped to 0–3 so the ball never overshoots its rest spot;
 * a faster landing sheds the difference in the bounce (floor friction).
 */
const rollOut = (s: number, v0: number) => {
  const v = Math.min(3, Math.max(0, v0));
  return v * (s - 2 * s * s + s * s * s) + s * s * (3 - 2 * s);
};
interface Landing {
  at: number;
  restAt: number;
  land: Vector3;
  rest: Vector3;
  top: number;
  /** Normalised horizontal speed into the roll-out. */
  v0: number;
}
const landing = (at: number, restAt: number, land: Vector3, rest: Vector3, top: number, vh: Vector3): Landing => {
  const d = new Vector3(rest.x - land.x, 0, rest.z - land.z);
  const len = d.length();
  return { at, restAt, land, rest, top, v0: len > 1e-9 ? (vh.dot(d) / len) * ((restAt - at) / len) : 0 };
};
function settle(l: Landing, t: number, out: Vector3): void {
  out.lerpVectors(l.land, l.rest, rollOut(seg(t, l.at, l.restAt), l.v0));
  const u = t - l.at;
  const hop = Math.sqrt((8 * l.top) / GRAVITY);
  out.y = BALL_R + (u < hop ? 0.5 * GRAVITY * u * (hop - u) : 0);
}
const MADE_SETTLE = landing(MADE_LAND_AT, DURATIONS.accept, MADE_LAND, BALL_AT.made, MADE_BOUNCE_TOP, MADE_EXIT_VH);
const MISS_SETTLE = landing(MISS_LAND_AT, DURATIONS.decline, MISS_LAND, BALL_AT.missed, MISS_BOUNCE_TOP, MISS_FLIGHT.vh);

// ── Host pass (0.20–0.85 s) under the same gravity ───────────────────────────────
// A 0.65 s lob under GRAVITY would peak 1.1 u up and cross the net's bottom on screen (it reads
// as a ball dropping out of the net). Instead the lob keeps its approved height (≈0.67 u over
// 0.5 s), lands just short of the guest, makes one small forward hop and rolls the last few
// centimetres into place while the catch spin settles (0.85–1.20 s).
const PASS_FROM = 0.2, PASS_TO = 0.85, CATCH_TO = DURATIONS.host;
const PASS_DIR = horiz(BALL_AT.host, BALL_AT.guest);
const CATCH_HOP = 0.06;
const CATCH_TIME = Math.sqrt((8 * CATCH_HOP) / GRAVITY);
/** The lob lands here in time, then the catch hop carries it to PASS_TO. */
export const PASS_LAND_AT = PASS_TO - CATCH_TIME;
const PASS_VY = 0.5 * GRAVITY * (PASS_LAND_AT - PASS_FROM);
/** The catch spin (0.35 rad forward) rolls the ball exactly this far into the guest spot. */
const CATCH_ROLL = 0.35 * BALL_R;
/** Hop speed = the roll's opening speed (EASE.land starts at slope 4). */
const CATCH_HOP_RUN = ((4 * CATCH_ROLL) / (CATCH_TO - PASS_TO)) * CATCH_TIME;
const PASS_SPAN = Math.hypot(BALL_AT.guest.x - BALL_AT.host.x, BALL_AT.guest.z - BALL_AT.host.z);
const PASS_RUN = PASS_SPAN - CATCH_HOP_RUN - CATCH_ROLL;

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
/** Rolling spin while the ball rolls from a landing to its rest spot. */
const rollSpin = (l: Landing): Spin => ({
  t0: l.at,
  t1: l.restAt,
  axis: rollAxis(horiz(l.land, l.rest)),
  angle: (s) => (Math.hypot(l.rest.x - l.land.x, l.rest.z - l.land.z) / BALL_R) * rollOut(s, l.v0),
});
const gatherSpin = (f: Flight): Spin => ({
  t0: 0,
  t1: RELEASE_AT,
  axis: rollAxis(f.vh.clone().normalize()),
  angle: (s) => gatherAlong(f, s * RELEASE_AT) / BALL_R,
});

const SPINS: Record<SequenceName, Spin[]> = {
  host: [
    { t0: 0, t1: 0.2, axis: rollAxis(PASS_DIR).negate(), angle: (s) => -0.25 * Math.sin(Math.PI * s) },
    // Slight natural backspin in the air; the catch settles it.
    { t0: 0.2, t1: 0.85, axis: rollAxis(PASS_DIR).negate(), angle: (s) => 2.4 * s },
    { t0: 0.85, t1: 1.2, axis: rollAxis(PASS_DIR), angle: (s) => 0.35 * EASE.land(s) },
  ],
  accept: [
    gatherSpin(MADE_FLIGHT),
    { t0: RELEASE_AT, t1: CONTACT_AT, axis: rollAxis(MADE_DIR).negate(), angle: (s) => 7.5 * s },
    { t0: CONTACT_AT, t1: MADE_LAND_AT, axis: rollAxis(MADE_DIR).negate(), angle: (s) => 1.3 * s },
    rollSpin(MADE_SETTLE),
  ],
  decline: [
    gatherSpin(MISS_FLIGHT),
    // One steady backspin for the whole flight, through the miss to the floor.
    { t0: RELEASE_AT, t1: MISS_LAND_AT, axis: rollAxis(MISS_DIR).negate(), angle: (s) => 9.6 * (MISS_LAND_AT - RELEASE_AT) * s },
    rollSpin(MISS_SETTLE),
  ],
};

function host(t: number, out: SportsFrame): void {
  const p = out.ballPos;
  if (t < PASS_FROM) {
    // A small preparatory rock back towards the far side.
    p.copy(BALL_AT.host).addScaledVector(PASS_DIR, -0.06 * Math.sin(Math.PI * seg(t, 0, PASS_FROM)));
  } else if (t < PASS_LAND_AT) {
    const u = t - PASS_FROM;
    p.copy(BALL_AT.host).addScaledVector(PASS_DIR, (PASS_RUN * u) / (PASS_LAND_AT - PASS_FROM));
    p.y = BALL_R + PASS_VY * u - 0.5 * GRAVITY * u * u;
  } else if (t < PASS_TO) {
    // One restrained catch: a single small forward hop towards the presentation position...
    const u = t - PASS_LAND_AT;
    p.copy(BALL_AT.host).addScaledVector(PASS_DIR, PASS_RUN + (CATCH_HOP_RUN * u) / CATCH_TIME);
    p.y = BALL_R + 0.5 * GRAVITY * u * (CATCH_TIME - u);
  } else {
    // ...then it rolls the last few centimetres into place as the catch spin settles, and is still.
    p.copy(BALL_AT.guest).addScaledVector(PASS_DIR, -CATCH_ROLL * (1 - EASE.land(seg(t, PASS_TO, CATCH_TO))));
  }
  orientation(SPINS.host, t, out.ballRot);
  out.netFlare = 0;
  out.netStretch = 0;
}

/** Made ball after contact, k seconds past CONTACT_AT and before it lands. */
function throughNet(k: number, out: Vector3): void {
  const inNet = Math.min(k, NET_EXIT);
  out.copy(RIM_CENTER).addScaledVector(MADE_FLIGHT.vh, inNet).addScaledVector(NET_HORIZONTAL, 0.5 * inNet * inNet);
  if (k <= NET_EXIT) {
    out.y = RIM_CENTER.y + V_CONTACT * k + 0.5 * NET_VERTICAL * k * k;
  } else {
    const u = k - NET_EXIT;
    out.addScaledVector(MADE_EXIT_VH, u);
    out.y = NET_EXIT_Y + V_EXIT * u - 0.5 * GRAVITY * u * u;
  }
}

function shot(t: number, out: SportsFrame, made: boolean): void {
  const p = out.ballPos;
  const flight = made ? MADE_FLIGHT : MISS_FLIGHT;
  const settling = made ? MADE_SETTLE : MISS_SETTLE;
  if (t < RELEASE_AT) gather(flight, t, p);
  else if (t >= settling.at) settle(settling, t, p);
  else if (made && t > CONTACT_AT) throughNet(t - CONTACT_AT, p);
  else flightAt(flight, t - RELEASE_AT, p);
  // Outcomes continue from the pass's final orientation (the guest-ready pose).
  orientation(made ? SPINS.accept : SPINS.decline, t, out.ballRot).multiply(GUEST_ROT);
  // The net answers only the made shot, starting exactly at contact: it opens as the ball
  // enters, stays open while the ball passes through, then swings back and settles.
  if (made && t >= CONTACT_AT) {
    const k = t - CONTACT_AT;
    const open = smoothstep(Math.min(1, k / 0.06));
    out.netFlare = k < NET_HOLD ? open : dampedSettle(k - NET_HOLD, 1, 2.2, 0.55, 0.4);
    out.netStretch = 0.8 * (k < NET_HOLD ? open : dampedSettle(k - NET_HOLD, 1, 2.2, 0.55, 0.4));
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

/** Diagnostics for tests: the landing spots derived from the curves. */
export const LANDINGS = { made: MADE_LAND, missed: MISS_LAND } as const;

export function newFrame(): SportsFrame {
  return frameFor('guest-ready', blank());
}
