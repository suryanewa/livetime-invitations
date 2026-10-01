import { Quaternion, Vector3 } from 'three';
import { EASE, seg, smoothstep } from '../../motion/curves.ts';
import { CAMERA_ANGLES } from '../../render/camera.ts';
import {
  BALL_AT, BALL_R, HOOP_ROOT, MISS_OFFSET, NET, newNetPose, recoilPoint, RIM_CENTER, RIM_LOCAL, type NetPose,
} from '../../../models/sportsContract.ts';
import type { CanonicalPose, SequenceName } from '../../core/types.ts';

/**
 * Pure authored choreography for Sports (Sports sub-spec). Trajectories are closed-form curves
 * sampled by time, never a projectile solver, so every Accept scores and every Decline misses at
 * any frame rate, on replay and after reversal. Every flight (pass, shot, airball, bounces) falls
 * under one gravity, the approved made arc's, and each beat hands its velocity on to the next:
 * nothing stops at the rim or restarts from rest.
 *
 * v1.2 fidelity pass (same beats, same durations):
 * - Spin is integrated from angular-velocity profiles, so the spin rate is continuous at every
 *   beat boundary (C1 orientation). The shots carry real backspin (2.5 and 2.2 rev/s); on the
 *   floor the ball rolls without sliding; a skid during each first bounce's 35 ms contact hands
 *   the air spin over to the rolling rate (in the air the spin never changes, except where the
 *   net grips the made ball). The host pass's backspin is solved so guest-ready keeps the
 *   orientation the master's seam cross was fitted to (`GUEST_TURN`).
 * - The gathers (host pass and both shots) rise into their release with exactly the flight's
 *   launch velocity (C1 release).
 * - Contacts with the floor squash the ball (volume-preserving, ≤ 8 %, along the floor normal)
 *   and hold it on the floor for a few milliseconds while it compresses (`squash`, `ballDrop`
 *   on `ball_secondary`); the authored centre path is untouched.
 * - The made shot drives a ball-following net bulge (`NetPose`: the rows round the ball open
 *   just enough to clear it, the net stretches while the ball drags it, and once the ball's top
 *   has left the bottom it rebounds and settles) and a small damped recoil of the rim on its
 *   bracket hinge (≤ 1.2°) and of the board on its arm (≤ 0.3°), zero again 0.6 s after contact.
 */

export const DURATIONS = { host: 1.2, accept: 1.7, decline: 1.6 } as const;

/** End of the shared gather: the shot leaves LAUNCH. */
export const RELEASE_AT = 0.2;
/** The made shot passes the rim centre, moving down, exactly at this beat (net contact). */
export const CONTACT_AT = 0.95;
const FLIGHT = CONTACT_AT - RELEASE_AT;

export interface SportsFrame {
  /** Authored ball centre (sports_root space). */
  ballPos: Vector3;
  /** Ball orientation (world-frame spin composed over the guest-ready pose). */
  ballRot: Quaternion;
  /** Floor-contact squash along the floor normal (+ compressed, − stretched); 0 at rest. */
  squash: number;
  /** Vertical offset of the drawn ball from the authored centre (contact hold + squash pivot). */
  ballDrop: number;
  /** Net deformation (made shot only). */
  net: NetPose;
  /** Recoil pitches (radians, + tips the front down). */
  rimPitch: number;
  boardPitch: number;
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

// ── Gathers (0 – RELEASE_AT): roll back, then rise into the release at the launch velocity ──
/** The ball leaves the floor here; until then it rolls. */
export const RISE_FROM = 0.1;
interface Gather {
  /** Rest spot on the floor the gather starts from. */
  origin: Vector3;
  flight: Flight;
  /** Height gained by the release (flight.from.y − BALL_R). */
  lift: number;
  /**
   * Rise exponent: height = lift · s^exp over [RISE_FROM, RELEASE_AT]. exp = vy·T/lift makes the
   * vertical speed at release exactly the flight's vy (C1 release); the ball is still
   * accelerating as it leaves, never parked in the air.
   */
  exp: number;
  /** Start of the pull-back window. */
  windowFrom: number;
}
const makeGather = (origin: Vector3, flight: Flight): Gather => {
  const lift = flight.from.y - BALL_R;
  const window = (flight.pullBack * 27) / (4 * flight.vh.length());
  return { origin, flight, lift, exp: (flight.vy * (RELEASE_AT - RISE_FROM)) / lift, windowFrom: RELEASE_AT - window };
};
/**
 * Offset along the shot direction during the gather: at rest, then a cubic pull-back of exactly
 * the flight's `pullBack` that swings forward into its own horizontal speed at release.
 */
function gatherAlong(g: Gather, t: number): number {
  const v = g.flight.vh.length();
  const window = RELEASE_AT - g.windowFrom;
  const s = seg(t, g.windowFrom, RELEASE_AT);
  return v * window * (s * s * s - s * s);
}
/** d/dt gatherAlong. */
function gatherSpeed(g: Gather, t: number): number {
  if (t <= g.windowFrom || t >= RELEASE_AT) return t >= RELEASE_AT ? g.flight.vh.length() : 0;
  const s = seg(t, g.windowFrom, RELEASE_AT);
  return g.flight.vh.length() * (3 * s * s - 2 * s);
}
function gather(g: Gather, t: number, out: Vector3): void {
  out.copy(g.origin).addScaledVector(g.flight.vh.clone().normalize(), gatherAlong(g, t));
  out.y = BALL_R + g.lift * seg(t, RISE_FROM, RELEASE_AT) ** g.exp;
}
const MADE_GATHER = makeGather(BALL_AT.guest, MADE_FLIGHT);
const MISS_GATHER = makeGather(BALL_AT.guest, MISS_FLIGHT);

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
const rollOutRate = (s: number, v0: number) => {
  const v = Math.min(3, Math.max(0, v0));
  return v * (1 - 4 * s + 3 * s * s) + 6 * s * (1 - s);
};
interface Landing {
  at: number;
  restAt: number;
  land: Vector3;
  rest: Vector3;
  top: number;
  /** Normalised horizontal speed into the roll-out. */
  v0: number;
  /** Bounce height's flight time. */
  hop: number;
}
const landing = (at: number, restAt: number, land: Vector3, rest: Vector3, top: number, vh: Vector3): Landing => {
  const d = new Vector3(rest.x - land.x, 0, rest.z - land.z);
  const len = d.length();
  return { at, restAt, land, rest, top, v0: len > 1e-9 ? (vh.dot(d) / len) * ((restAt - at) / len) : 0, hop: Math.sqrt((8 * top) / GRAVITY) };
};
function settle(l: Landing, t: number, out: Vector3): void {
  out.lerpVectors(l.land, l.rest, rollOut(seg(t, l.at, l.restAt), l.v0));
  const u = t - l.at;
  out.y = BALL_R + (u < l.hop ? 0.5 * GRAVITY * u * (l.hop - u) : 0);
}
const MADE_SETTLE = landing(MADE_LAND_AT, DURATIONS.accept, MADE_LAND, BALL_AT.made, MADE_BOUNCE_TOP, MADE_EXIT_VH);
const MISS_SETTLE = landing(MISS_LAND_AT, DURATIONS.decline, MISS_LAND, BALL_AT.missed, MISS_BOUNCE_TOP, MISS_FLIGHT.vh);

// ── Host pass (0.20–0.85 s) under the same gravity ───────────────────────────────
// A 0.65 s lob under GRAVITY would peak 1.1 u up and cross the net's bottom on screen (it reads
// as a ball dropping out of the net). Instead the lob keeps its approved height (≈0.7 u over
// 0.5 s), lands just short of the guest, makes one small forward hop and rolls the last few
// centimetres into place while the catch spin settles (0.85–1.20 s). Its gather (0–0.2 s) rocks
// back towards the far side and rises into the lob's launch velocity, like the shots'.
const PASS_FROM = RELEASE_AT, PASS_TO = 0.85, CATCH_TO = DURATIONS.host;
const PASS_DIR = horiz(BALL_AT.host, BALL_AT.guest);
const CATCH_HOP = 0.06;
const CATCH_TIME = Math.sqrt((8 * CATCH_HOP) / GRAVITY);
/** The lob lands here in time, then the catch hop carries it to PASS_TO. */
export const PASS_LAND_AT = PASS_TO - CATCH_TIME;
/** The catch spin (0.35 rad forward) rolls the ball exactly this far into the guest spot. */
const CATCH_ROLL = 0.35 * BALL_R;
/** Hop speed = the roll's opening speed (EASE.land starts at slope 4). */
const CATCH_HOP_RUN = ((4 * CATCH_ROLL) / (CATCH_TO - PASS_TO)) * CATCH_TIME;
const PASS_SPAN = Math.hypot(BALL_AT.guest.x - BALL_AT.host.x, BALL_AT.guest.z - BALL_AT.host.z);
const PASS_RUN = PASS_SPAN - CATCH_HOP_RUN - CATCH_ROLL;
/** Height the pass gather lifts the ball before it leaves the hand. */
const PASS_LIFT = 0.06;
const PASS_T = PASS_LAND_AT - PASS_FROM;
const PASS_FLIGHT: Flight = {
  from: BALL_AT.host.clone().setY(BALL_R + PASS_LIFT),
  vh: PASS_DIR.clone().multiplyScalar(PASS_RUN / PASS_T),
  // Lands on the floor exactly at PASS_LAND_AT from the lifted release.
  vy: (GRAVITY * PASS_T) / 2 - PASS_LIFT / PASS_T,
  pullBack: 0.06,
};
const PASS_GATHER = makeGather(BALL_AT.host, PASS_FLIGHT);

// ── Orientation: spin segments integrated from their rates (pure functions of t) ──
/**
 * A rotation about a fixed world axis over [t0, t1]: either a closed-form `angle(t)` (angle
 * travelled from t0) or an angular-speed profile `rate(t)` (rad/s) integrated exactly by 8-point
 * Gauss–Legendre between `breaks` (every rate here is a polynomial of degree ≤ 6 between breaks,
 * which the rule integrates exactly). Segments are composed in list order, each premultiplied
 * (world frame), so the ball's angular velocity is the current segment's: where two segments
 * overlap (a skid), the later one is the outer rotation.
 */
interface Spin {
  t0: number;
  t1: number;
  axis: Vector3;
  rate?: (t: number) => number;
  angle?: (t: number) => number;
  breaks?: number[];
}
const GL_X = [0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363];
const GL_W = [0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];
function integrate(f: (t: number) => number, a: number, b: number): number {
  const h = (b - a) / 2, m = (a + b) / 2;
  let s = 0;
  for (let i = 0; i < 4; i++) s += GL_W[i]! * (f(m - h * GL_X[i]!) + f(m + h * GL_X[i]!));
  return s * h;
}
function spinAngle(sp: Spin, t: number): number {
  const end = Math.min(t, sp.t1);
  if (end <= sp.t0) return 0;
  if (sp.angle) return sp.angle(end);
  let a = sp.t0, sum = 0;
  for (const br of sp.breaks ?? []) {
    if (br <= a) continue;
    if (br >= end) break;
    sum += integrate(sp.rate!, a, br);
    a = br;
  }
  return sum + integrate(sp.rate!, a, end);
}
const qa = new Quaternion();
function orientation(spins: Spin[], t: number, out: Quaternion): Quaternion {
  out.identity();
  for (const sp of spins) {
    if (t <= sp.t0) continue;
    qa.setFromAxisAngle(sp.axis, spinAngle(sp, t));
    out.premultiply(qa);
  }
  return out;
}
/** Axis for rolling (or top-spin) along horizontal direction d; backspin is a negative rate. */
const rollAxis = (d: Vector3) => new Vector3().crossVectors(UP, d).normalize();

/** Backspin of the shots in the air (rev/s): a real shot leaves the fingertips at 2–3 rev/s. */
export const SHOT_BACKSPIN = { made: 2.5, missed: 2.2 } as const;
/**
 * Floor contact time (s): the drawn ball stays on the floor while it compresses (`contact`). Only
 * then can friction act, so the bounce's skid (the air spin handing over to the rolling rate)
 * lasts exactly as long: in the air the spin never changes.
 */
export const CONTACT_HOLD = 0.035;
/** Skid at a first bounce: the air spin hands over to the rolling rate during the contact. */
export const SKID = CONTACT_HOLD;
const skidWeight = (t: number, at: number) => smoothstep(seg(t, at, at + SKID));

/** Gather spin: rolls with the gather on the floor, then (in the air) turns into the flight's `air` rate. */
const gatherSpin = (g: Gather, air: number): Spin => {
  const R = BALL_R;
  return {
    t0: 0,
    t1: RELEASE_AT,
    axis: rollAxis(g.flight.vh.clone().normalize()),
    rate: (t) => {
      const roll = t < RELEASE_AT ? gatherSpeed(g, t) / R : 0;
      const w = smoothstep(seg(t, RISE_FROM, RELEASE_AT));
      return (1 - w) * roll + w * air;
    },
    breaks: [g.windowFrom, RISE_FROM].sort((a, b) => a - b),
  };
};
/** Rolling rate (rad/s) of a landing's roll-out: horizontal speed / BALL_R. */
const rollRate = (l: Landing) => {
  const dist = Math.hypot(l.rest.x - l.land.x, l.rest.z - l.land.z);
  const T = l.restAt - l.at;
  return (t: number) => (dist / BALL_R) * (rollOutRate(seg(t, l.at, l.restAt), l.v0) / T);
};
/**
 * First bounce, then rolling to rest: the air spin `air` (about `airAxis`) fades over SKID while
 * the rolling spin (about the roll axis) grows in; from then on the ball rolls without sliding.
 */
const landSpins = (l: Landing, airAxis: Vector3, air: number): Spin[] => {
  const axis = rollAxis(horiz(l.land, l.rest));
  const roll = rollRate(l);
  const skidEnd = l.at + SKID;
  return [
    { t0: l.at, t1: skidEnd, axis: airAxis, rate: (t) => (1 - skidWeight(t, l.at)) * air },
    { t0: l.at, t1: skidEnd, axis, rate: (t) => skidWeight(t, l.at) * roll(t) },
    { t0: skidEnd, t1: l.restAt, axis, rate: roll },
  ];
};

const MADE_AXIS = rollAxis(MADE_DIR);
const MISS_AXIS = rollAxis(MISS_DIR);
const PASS_AXIS = rollAxis(PASS_DIR);
const W_MADE = -2 * Math.PI * SHOT_BACKSPIN.made;
const W_MISS = -2 * Math.PI * SHOT_BACKSPIN.missed;
/**
 * The net grips the made ball and slows its backspin to the rate it will roll at after the
 * bounce (its drift has turned back towards the guest, so that backspin is now a forward roll):
 * the component of the made roll-out's opening spin along the shot's axis.
 */
const W_NET_OUT = rollRate(MADE_SETTLE)(MADE_SETTLE.at) * rollAxis(horiz(MADE_SETTLE.land, MADE_SETTLE.rest)).dot(MADE_AXIS);
const NET_SPIN_END = CONTACT_AT + NET_EXIT;

// Host: every segment turns about the pass's roll axis, so the guest-ready orientation is the sum
// of their angles. The lob's backspin W_PASS is solved so that sum is GUEST_TURN (mod 2π).
/**
 * Net turn (rad, about the pass's roll axis) from host-ready to guest-ready. The seam frame the
 * master ball was oriented with (`SEAM_FRAME`, recipes/sports.ts `ballRotation`) was fitted to
 * this pose: keeping it keeps the seam cross facing the guest.
 */
export const GUEST_TURN = -2.05;
const HOP_RATE = CATCH_HOP_RUN / CATCH_TIME / BALL_R;
const hostSpins = (wPass: number): Spin[] => [
  gatherSpin(PASS_GATHER, -wPass),
  { t0: PASS_FROM, t1: PASS_LAND_AT, axis: PASS_AXIS, rate: () => -wPass },
  // The bounce checks the lob (backspin) and hands it the hop's rolling rate.
  { t0: PASS_LAND_AT, t1: PASS_LAND_AT + SKID, axis: PASS_AXIS, rate: (t) => (1 - skidWeight(t, PASS_LAND_AT)) * -wPass + skidWeight(t, PASS_LAND_AT) * HOP_RATE },
  { t0: PASS_LAND_AT + SKID, t1: PASS_TO, axis: PASS_AXIS, rate: () => HOP_RATE },
  // The catch roll: exactly CATCH_ROLL along the floor (rolling), starting at the hop's rate.
  { t0: PASS_TO, t1: CATCH_TO, axis: PASS_AXIS, angle: (t) => (CATCH_ROLL / BALL_R) * EASE.land(seg(t, PASS_TO, CATCH_TO)) },
];
const hostTurn = (wPass: number) => hostSpins(wPass).reduce((sum, sp) => sum + spinAngle(sp, CATCH_TO), 0);
/** The lob's backspin (rad/s): the solution nearest a gentle 4 rad/s. */
export const W_PASS = (() => {
  // The turn is linear in the backspin: turn(w) = t0 − slope · w. Solve turn = GUEST_TURN + 2πk.
  const t0 = hostTurn(0), slope = t0 - hostTurn(1);
  const k = Math.round((t0 - GUEST_TURN - 4 * slope) / (2 * Math.PI));
  return (t0 - GUEST_TURN - 2 * Math.PI * k) / slope;
})();

const SPINS: Record<SequenceName, Spin[]> = {
  host: hostSpins(W_PASS),
  accept: [
    gatherSpin(MADE_GATHER, W_MADE),
    { t0: RELEASE_AT, t1: CONTACT_AT, axis: MADE_AXIS, rate: () => W_MADE },
    // The net grips the ball: its backspin eases to the roll-out's rate while it passes through.
    { t0: CONTACT_AT, t1: NET_SPIN_END, axis: MADE_AXIS, rate: (t) => W_MADE + (W_NET_OUT - W_MADE) * smoothstep(seg(t, CONTACT_AT, NET_SPIN_END)) },
    { t0: NET_SPIN_END, t1: MADE_LAND_AT, axis: MADE_AXIS, rate: () => W_NET_OUT },
    ...landSpins(MADE_SETTLE, MADE_AXIS, W_NET_OUT),
  ],
  decline: [
    gatherSpin(MISS_GATHER, W_MISS),
    // One steady backspin for the whole flight, through the miss to the floor.
    { t0: RELEASE_AT, t1: MISS_LAND_AT, axis: MISS_AXIS, rate: () => W_MISS },
    ...landSpins(MISS_SETTLE, MISS_AXIS, W_MISS),
  ],
};

// ── Floor contacts: squash and a brief hold on the floor ─────────────────────────
/**
 * Contact squash (Master §6 secondary motion): at each floor contact the ball compresses along
 * the floor normal by up to SQUASH.max (volume-preserving: the horizontal axes grow by
 * 1/√(1 − a)), springs back through a slight stretch and settles, as a damped oscillator kicked
 * by the impact (a(0) = 0, so nothing pops). The amplitude scales with the impact speed. While it
 * compresses (CONTACT_HOLD) the drawn ball stays on the floor, then rejoins the authored path
 * with zero relative speed, so the bounce reads as a contact rather than a reflection.
 */
export const SQUASH = { max: 0.08, refSpeed: 6.5, hz: 11, zeta: 0.5, end: 0.32 } as const;
const SQ_W = 2 * Math.PI * SQUASH.hz;
const SQ_WD = SQ_W * Math.sqrt(1 - SQUASH.zeta * SQUASH.zeta);
const SQ_PEAK_AT = Math.atan(SQ_WD / (SQUASH.zeta * SQ_W)) / SQ_WD;
const SQ_PEAK = Math.exp(-SQUASH.zeta * SQ_W * SQ_PEAK_AT) * Math.sin(SQ_WD * SQ_PEAK_AT);
/**
 * Unit squash pulse u seconds after an impact (peak 1), faded to exactly 0 at `end` (SQUASH.end,
 * or earlier when the sequence ends first, so every canonical pose is exactly round).
 */
export function squashPulse(u: number, end: number = SQUASH.end): number {
  if (u <= 0 || u >= end) return 0;
  const fade = 1 - smoothstep(seg(u, end * 0.6, end));
  return (Math.exp(-SQUASH.zeta * SQ_W * u) * Math.sin(SQ_WD * u) * fade) / SQ_PEAK;
}
interface Impact {
  at: number;
  /** Squash amplitude (fraction). */
  amp: number;
}
const impact = (at: number, speed: number): Impact => ({ at, amp: SQUASH.max * Math.min(1, Math.abs(speed) / SQUASH.refSpeed) });
/** Pulse length of an impact in a sequence: SQUASH.end, cut to finish by the sequence's end. */
const pulseEnd = (seq: SequenceName, im: Impact) => Math.min(SQUASH.end, DURATIONS[seq] - im.at);
const bounceImpacts = (l: Landing, landSpeed: number): Impact[] => [impact(l.at, landSpeed), impact(l.at + l.hop, Math.sqrt(2 * GRAVITY * l.top))];
/** Every floor contact per sequence (time, amplitude), derived from the curves. */
export const IMPACTS: Record<SequenceName, Impact[]> = {
  host: [impact(PASS_LAND_AT, PASS_FLIGHT.vy - GRAVITY * PASS_T), impact(PASS_TO, Math.sqrt(2 * GRAVITY * CATCH_HOP))],
  accept: bounceImpacts(MADE_SETTLE, V_EXIT - GRAVITY * MADE_FALL),
  decline: bounceImpacts(MISS_SETTLE, MISS_VY - GRAVITY * (MISS_LAND_AT - RELEASE_AT)),
};
function contact(seq: SequenceName, t: number, out: SportsFrame): void {
  let a = 0, hold = 0;
  for (const im of IMPACTS[seq]) {
    const u = t - im.at;
    if (u <= 0) continue;
    a += im.amp * squashPulse(u, pulseEnd(seq, im));
    if (u < CONTACT_HOLD) hold += 1 - smoothstep(u / CONTACT_HOLD);
  }
  out.squash = a;
  // Drawn bottom = (1 − hold) × authored bottom height: on the floor while it compresses.
  out.ballDrop = -hold * (out.ballPos.y - BALL_R) - BALL_R * a;
}

// ── Made-shot hoop response: net bulge, stretch, snap; rim and board recoil ───────
/** Everything the made shot moves in the hoop is exactly at rest from here (s after contact). */
export const HOOP_SETTLED = 0.6;
/** Rim and board recoil: peak pitch (rad), frequency and damping of each spring. */
export const RECOIL = {
  // Firmly damped: tipping back past rest would close the bracket plate's 1.5 mm gap to the board.
  rim: { peak: (1.2 * Math.PI) / 180, hz: 5, zeta: 0.45 },
  board: { peak: (0.3 * Math.PI) / 180, hz: 3.5, zeta: 0.3 },
} as const;
/** Unit step response of a damped spring (x(0) = 0, x′(0) = 0: C1 at the onset). */
function stepResponse(u: number, hz: number, zeta: number): number {
  if (u <= 0) return 0;
  const w = 2 * Math.PI * hz, wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * u) * (Math.cos(wd * u) + ((zeta * w) / wd) * Math.sin(wd * u));
}
/** Settle fade to exactly zero at HOOP_SETTLED (C1). */
const hoopFade = (k: number) => 1 - smoothstep(seg(k, HOOP_SETTLED * 0.7, HOOP_SETTLED));
/** The net pulls on its hooks while the ball is inside it (contact → NET_EXIT): a force pulse. */
const tug = (k: number, hz: number, zeta: number) => stepResponse(k, hz, zeta) - stepResponse(k - NET_EXIT, hz, zeta);
const tugPeak = (hz: number, zeta: number) => {
  let m = 0;
  for (let k = 0; k <= HOOP_SETTLED; k += 0.0005) m = Math.max(m, Math.abs(tug(k, hz, zeta)));
  return m;
};
const RIM_TUG_PEAK = tugPeak(RECOIL.rim.hz, RECOIL.rim.zeta);
const BOARD_TUG_PEAK = tugPeak(RECOIL.board.hz, RECOIL.board.zeta);
export function rimRecoil(k: number): number {
  if (k <= 0 || k >= HOOP_SETTLED) return 0;
  return (RECOIL.rim.peak * tug(k, RECOIL.rim.hz, RECOIL.rim.zeta) * hoopFade(k)) / RIM_TUG_PEAK;
}
export function boardRecoil(k: number): number {
  if (k <= 0 || k >= HOOP_SETTLED) return 0;
  return (RECOIL.board.peak * tug(k, RECOIL.board.hz, RECOIL.board.zeta) * hoopFade(k)) / BOARD_TUG_PEAK;
}

/** Net response amplitudes: drag stretch, then the rebound (shortening and pulling in, then settling). */
export const NET_RESPONSE = { stretch: 0.2, reboundStretch: 0.06, snap: 0.035, hz: 3.2, zeta: 0.35 } as const;
/** Drag weight from the ball's depth fraction f (centre below the rim / NET.depth): 0 … 1 … 0. */
function dragWeight(f: number): number {
  if (f <= 0.35 || f >= 1.7) return 0;
  return f < 1 ? smoothstep((f - 0.35) / 0.65) : 1 - smoothstep((f - 1) / 0.7);
}
/** Rebound shape after the ball has left: starts flat (C1), first lobe positive, settles to 0. */
function rebound(u: number): number {
  if (u <= 0) return 0;
  const { hz, zeta } = NET_RESPONSE;
  const w = 2 * Math.PI * hz, wd = w * Math.sqrt(1 - zeta * zeta);
  const onset = smoothstep(Math.min(1, u / 0.06));
  return onset * Math.exp(-zeta * w * u) * Math.sin(wd * u);
}

const _origin = new Vector3();
function hoopResponse(made: boolean, t: number, out: SportsFrame): void {
  const net = out.net;
  const k = t - CONTACT_AT;
  if (!made || k < 0 || k >= HOOP_SETTLED) {
    net.active = false;
    net.ball.set(0, 0, 0);
    net.stretch = 0;
    net.snap = 0;
    out.rimPitch = 0;
    out.boardPitch = 0;
    return;
  }
  out.rimPitch = rimRecoil(k);
  out.boardPitch = boardRecoil(k);
  // Ball centre in net space: undo the recoil that carries the net with the rim.
  recoilPoint(RIM_LOCAL, out.boardPitch, out.rimPitch, _origin);
  const p = net.ball.copy(out.ballPos).sub(HOOP_ROOT).sub(_origin);
  const a = -(out.boardPitch + out.rimPitch), c = Math.cos(a), s = Math.sin(a);
  p.set(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
  const fade = hoopFade(k);
  // The rebound starts once the ball's top has left the net's bottom (NET_EXIT), never while any
  // row could still touch it, so the snap cannot pull a cord into the ball.
  const rb = rebound(k - NET_EXIT) * fade;
  net.active = true;
  net.stretch = NET_RESPONSE.stretch * dragWeight(-p.y / NET.depth) - NET_RESPONSE.reboundStretch * rb;
  net.snap = NET_RESPONSE.snap * rb;
}

// ── Sequences ──────────────────────────────────────────────────────────────────────
function host(t: number, out: SportsFrame): void {
  const p = out.ballPos;
  if (t < PASS_FROM) {
    // Rock back towards the far side, then rise into the lob.
    gather(PASS_GATHER, t, p);
  } else if (t < PASS_LAND_AT) {
    flightAt(PASS_FLIGHT, t - PASS_FROM, p);
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
  contact('host', t, out);
  hoopResponse(false, t, out);
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
  if (t < RELEASE_AT) gather(made ? MADE_GATHER : MISS_GATHER, t, p);
  else if (t >= settling.at) settle(settling, t, p);
  else if (made && t > CONTACT_AT) throughNet(t - CONTACT_AT, p);
  else flightAt(flight, t - RELEASE_AT, p);
  // Outcomes continue from the pass's final orientation (the guest-ready pose).
  orientation(made ? SPINS.accept : SPINS.decline, t, out.ballRot).multiply(GUEST_ROT);
  contact(made ? 'accept' : 'decline', t, out);
  // The hoop answers only the made shot, starting exactly at contact.
  hoopResponse(made, t, out);
}

export function sampleSequence(sequence: SequenceName, t: number, out: SportsFrame): SportsFrame {
  const tc = Math.min(Math.max(t, 0), DURATIONS[sequence]);
  if (sequence === 'host') host(tc, out);
  else shot(tc, out, sequence === 'accept');
  return out;
}

const blank = (): SportsFrame => ({ ballPos: new Vector3(), ballRot: new Quaternion(), squash: 0, ballDrop: 0, net: newNetPose(), rimPitch: 0, boardPitch: 0 });

/** Canonical poses are the exact end states of their sequences (orientation included). */
const GUEST_END = sampleSequence('host', DURATIONS.host, blank());
const GUEST_ROT = GUEST_END.ballRot.clone();
const MADE_END = sampleSequence('accept', DURATIONS.accept, blank());
const MISSED_END = sampleSequence('decline', DURATIONS.decline, blank());

const atRest = (out: SportsFrame): SportsFrame => {
  out.squash = 0;
  out.ballDrop = 0;
  out.net.active = false;
  out.net.ball.set(0, 0, 0);
  out.net.stretch = 0;
  out.net.snap = 0;
  out.rimPitch = 0;
  out.boardPitch = 0;
  return out;
};

export function frameFor(pose: CanonicalPose, out: SportsFrame): SportsFrame {
  if (pose === 'host-ready') {
    out.ballPos.copy(BALL_AT.host);
    out.ballRot.identity();
  } else {
    const e = pose === 'guest-ready' ? GUEST_END : pose === 'accepted' ? MADE_END : MISSED_END;
    out.ballPos.copy(e.ballPos);
    out.ballRot.copy(e.ballRot);
  }
  return atRest(out);
}

/** Diagnostics for tests: the landing spots derived from the curves. */
export const LANDINGS = { made: MADE_LAND, missed: MISS_LAND } as const;
/** Diagnostics for tests: roll-outs (landing → rest) per sequence, and the catch roll. */
export const ROLLS = {
  accept: { from: MADE_SETTLE.at + SKID, to: MADE_SETTLE.restAt, axis: rollAxis(horiz(MADE_SETTLE.land, MADE_SETTLE.rest)) },
  decline: { from: MISS_SETTLE.at + SKID, to: MISS_SETTLE.restAt, axis: rollAxis(horiz(MISS_SETTLE.land, MISS_SETTLE.rest)) },
  host: { from: PASS_TO, to: CATCH_TO, axis: PASS_AXIS },
} as const;
/** Diagnostics for tests: the shots' roll axes in the air. */
export const SHOT_AXES = { accept: MADE_AXIS, decline: MISS_AXIS, host: PASS_AXIS } as const;

export function newFrame(): SportsFrame {
  return frameFor('guest-ready', blank());
}
