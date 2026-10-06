import { Quaternion, Vector3 } from 'three';
import { seg, smoothstep } from '../../motion/curves.ts';
import { CAMERA_ANGLES } from '../../render/camera.ts';
import { BALL_AT, BALL_R, BOARD, HOOP_ROOT, NET, netHangRadius, RIM, RIM_CENTER } from '../../../models/sportsContract.ts';
import {
  BallTrack, boardCollider, BOUNCE, bounceTime, bounceToRest, cloneState, type Collider, type Contact, fly, floorContact, flyUntil, GRAVITY, type Hit, type NetDrag, restSpeed,
  rimCollider, rollingSpin, surfaceContact, throughNet, type BallState,
} from './ballPhysics.ts';
import type { CanonicalPose, SequenceName } from '../../core/types.ts';

/**
 * Pure choreography for Sports (Sports sub-spec), v1.5: physics, integrated once.
 *
 * The beats are the approved ones (host 1.2 s, accept 1.7 s with net contact at 0.95 s, decline
 * 1.6 s). Each sequence is an authored gather (0–0.2 s: the ball rolls back and rises into its
 * release) followed by a physical track (`ballPhysics.ts`) from the release to rest: flight under
 * standard gravity, the net's grip on the made ball, every floor contact with restitution, friction
 * and spin coupling, the contact squash, and the roll to a stop. The tracks are integrated at
 * module load from fixed launch states, so a sequence is a pure function of t and replays exactly.
 *
 * A real ball keeps bouncing after the beat that matters. The director's durations stay the
 * approved ones; the rest of each track is the sequence's **tail**, which the scene plays in its
 * continuous channel after the director has finished (`SportsScene.simulate`, `settling()`), and
 * which `settle()` snaps to its end. So the canonical poses (posters, reduced motion) are the
 * tracks' rest states: where and how the ball really comes to rest.
 *
 * Launches are solved, not tuned by hand: the made shot leaves so it passes the rim centre at the
 * contact beat; the airball so it first lands on MISS_LAND (behind and beside the hoop); the host
 * pass so the ball comes to rest exactly on the guest spot. A change of mind continues the ball's
 * own physics (`change.ts`).
 */

export const DURATIONS = { host: 1.2, accept: 1.7, decline: 1.6 } as const;

/** End of the shared gather: the shot leaves LAUNCH. */
export const RELEASE_AT = 0.2;
/** The made shot passes the rim centre, moving down, exactly at this beat (net contact). */
export const CONTACT_AT = 0.95;
const FLIGHT = CONTACT_AT - RELEASE_AT;

export { GRAVITY };

export interface SportsFrame {
  /** Drawn ball centre (sports_root space): on the floor while a contact compresses it. */
  ballPos: Vector3;
  /** Ball orientation (world frame). */
  ballRot: Quaternion;
  /** Contact compression along `squashAxis` (fraction of the diameter, ≥ 0); 0 in the air. */
  squash: number;
  /** v1.7: the contact normal the squash compresses along (unit): up on the floor, a hit's normal on the board or the rim. */
  squashAxis: Vector3;
}

const UP = new Vector3(0, 1, 0);
export const horiz = (from: Vector3, to: Vector3) => new Vector3(to.x - from.x, 0, to.z - from.z).normalize();
/** Axis for rolling (or top-spin) along horizontal direction d; backspin is a negative rate. */
export const rollAxis = (d: Vector3) => new Vector3().crossVectors(UP, d).normalize();

// ── Launch states ──────────────────────────────────────────────────────────────────
export interface Launch {
  from: Vector3;
  /** Horizontal velocity (y = 0), units per second. */
  vh: Vector3;
  /** Vertical launch speed, units per second. */
  vy: number;
  /** Air spin about the roll axis of vh (rad/s; negative = backspin). */
  spin: number;
  /** Gather wind-up: how far the ball rolls back, away from the target, before release. */
  pullBack: number;
}

/** Height the gather lifts a shot before it leaves the hand. */
export const LAUNCH_LIFT = 0.12;
/** The gather ends at LAUNCH, a little above the guest spot, and the shots leave from there. */
const LAUNCH = BALL_AT.guest.clone().add(new Vector3(0, LAUNCH_LIFT, 0));

/** Backspin of the shots in the air (rev/s): a real shot leaves the fingertips at 2–3 rev/s. */
export const SHOT_BACKSPIN = { made: 2.5, missed: 2.0 } as const;
/** The made shot's apex above the rim centre (it falls into the rim at ≈ 72°). */
export const SHOT_APEX_ABOVE_RIM = 0.71;

/** Made shot: LAUNCH → rim centre in FLIGHT seconds under standard gravity (its apex follows). */
const MADE: Launch = (() => {
  const vh = new Vector3(RIM_CENTER.x - LAUNCH.x, 0, RIM_CENTER.z - LAUNCH.z).divideScalar(FLIGHT);
  const vy = (RIM_CENTER.y - LAUNCH.y + 0.5 * GRAVITY * FLIGHT * FLIGHT) / FLIGHT;
  return { from: LAUNCH, vh, vy, spin: -2 * Math.PI * SHOT_BACKSPIN.made, pullBack: 0.05 };
})();
/** The made arc's apex (centre height). */
export const MADE_APEX = LAUNCH.y + (MADE.vy * MADE.vy) / (2 * GRAVITY);

/** Time at which a ball launched at vy from y0, moving down, reaches height y. */
export const fallTime = (y0: number, vy: number, y: number) => (vy + Math.sqrt(vy * vy + 2 * GRAVITY * (y0 - y))) / GRAVITY;

// ── The decline (v1.7): a hard bank off the glass that rattles the ring and caroms out ──
/** Screen-right in the floor plane for the shared camera azimuth. */
const AZ = (CAMERA_ANGLES.azimuthDeg * Math.PI) / 180;
export const SCREEN_RIGHT = new Vector3(Math.cos(AZ), 0, -Math.sin(AZ));
/** The laminate face's plane (sports_root z) and the ball centre's plane when it touches it. */
export const FACE_Z = HOOP_ROOT.z + BOARD.face;
/** The surfaces a flying ball can strike: the laminate inside the frame's lip, and the ring. */
export const HOOP_COLLIDERS: readonly Collider[] = [
  boardCollider(FACE_Z, {
    x0: HOOP_ROOT.x - BOARD.opening.halfWidth, x1: HOOP_ROOT.x + BOARD.opening.halfWidth, y0: BOARD.opening.bottom, y1: BOARD.opening.top,
  }),
  rimCollider(RIM_CENTER, RIM.innerRadius + RIM.tube, RIM.tube),
];
/**
 * The bank's own gather. From the shared gather (release at 0.2 s, from the guest spot 40 cm in
 * front of the board's plane) the glass at the 0.95 s beat is met at Δz / 0.75 s = 0.53 m/s
 * whatever the arc, coming down at ≈ 1.8 m/s: a kiss that drops through the ring. A hard bank
 * needs a shorter flight, so the decline winds up longer: the hand rolls the ball back (9 cm) and
 * forward, lifts it 11 cm off the floor and fires it at BANK_RELEASE, 0.4 s before the glass.
 */
export const BANK_TIMING: GatherTiming = { release: 0.525, riseFrom: 0.375 };
/** Height the bank's gather lifts the ball before it leaves the hand. */
export const BANK_LIFT = 0.3;
/**
 * Where the ball's centre meets the glass, at CONTACT_AT: on the grey laminate left of the target
 * square (13 cm screen-left of the ring's left edge), 30 cm above the rim's top and 12 cm under the
 * frame's top lip, its touching side BALL_R in front of the face. Chosen (scripts' search over the
 * face, the release and the spin) as the strike that still rises into the glass, is kicked down by
 * it onto the ring's front-left top, and pops out to the front-left, never inside the ring.
 */
export const BANK_POINT = new Vector3(-0.08, 4.16, FACE_Z + BALL_R);
const BANK_FROM = BALL_AT.guest.clone().add(new Vector3(0, BANK_LIFT, 0));
const BANK_DIR = horiz(BANK_FROM, BANK_POINT);
const BANKED: Launch = (() => {
  const T = CONTACT_AT - BANK_TIMING.release;
  const vh = BANK_POINT.clone().sub(BANK_FROM).setY(0).divideScalar(T);
  const vy = (BANK_POINT.y - BANK_FROM.y + 0.5 * GRAVITY * T * T) / T;
  // The wind-up rolls back over the whole gather (the cubic pull-back's window is the release time).
  return { from: BANK_FROM, vh, vy, spin: -2 * Math.PI * SHOT_BACKSPIN.missed, pullBack: (4 * vh.length() * BANK_TIMING.release) / 27 };
})();
/**
 * Where the declined ball comes to rest: front-left of the hoop, wide of the guest spot (≥ 1.2
 * diameters apart on screen) and of the base. A real carom off a rim runs on for metres (the ring
 * rolls it, and a rubber ball on a studio floor decelerates at 0.12 m/s²); so the player's hand
 * traps its first bounce (`trapTo`), as a change of mind's hand acts through a floor contact.
 */
export const MISS_REST = new Vector3(-1.6, BALL_R, 0.3);

/**
 * The player traps the carom's first bounce (the hand acting through the floor, as in a change of
 * mind, change.ts): the bounce keeps its own height (the floor's restitution), and its run is
 * turned and slowed so that it bounces on at constant speed with matched spin and rolls to rest
 * exactly on `target` (closed form).
 */
export function trapTo(track: BallTrack, st: BallState, target: Vector3): void {
  const vIn = st.v.clone().setY(0);
  const vy = BOUNCE.restitution * Math.max(0, -st.v.y);
  const L = target.clone().sub(st.p).setY(0).addScaledVector(vIn, -BOUNCE.contactTime / 2);
  const u = restSpeed(L.length(), bounceTime(vy) + BOUNCE.contactTime / 2);
  const out = L.normalize().multiplyScalar(u);
  floorContact(track, st, { v: out.clone().setY(vy), w: rollingSpin(out) });
}

// Host pass: a low bounce pass with backspin. The lob checks up at its first bounce, hops a few
// times and rolls the last centimetres to rest exactly on the guest spot.
const PASS_DIR = horiz(BALL_AT.host, BALL_AT.guest);
const PASS_SPAN = Math.hypot(BALL_AT.guest.x - BALL_AT.host.x, BALL_AT.guest.z - BALL_AT.host.z);
/** Height the pass gather lifts the ball before it leaves the hand, and the lob's apex above that. */
const PASS_LIFT = 0.06;
const PASS_APEX = 0.3;
/** The lob's backspin (rad/s, about the pass's roll axis). */
export const PASS_BACKSPIN = 12;
const passLaunch = (speed: number): Launch => ({
  from: BALL_AT.host.clone().setY(BALL_R + PASS_LIFT),
  vh: PASS_DIR.clone().multiplyScalar(speed),
  vy: Math.sqrt(2 * GRAVITY * PASS_APEX),
  spin: -PASS_BACKSPIN,
  pullBack: 0.06,
});

// ── Gathers (0 – RELEASE_AT): roll back, then rise into the release at the launch velocity ──
/** The ball leaves the floor here; until then it rolls. */
export const RISE_FROM = 0.1;
/**
 * The launch's spin is put on in the hand over the last 30 ms before release, while the hand
 * lifts the ball off the floor (it has risen ≈ 2 mm when this starts): until then the ball only
 * rolls with its own pull-back. A ball does not spin up on its own.
 */
export const SPIN_FROM = RELEASE_AT - 0.03;
/** When a gather releases its shot and when the hand starts lifting it off the floor (v1.7: the decline's bank has its own). */
export interface GatherTiming {
  release: number;
  riseFrom: number;
}
export const SHOT_TIMING: GatherTiming = { release: RELEASE_AT, riseFrom: RISE_FROM };
export interface Gather {
  origin: Vector3;
  launch: Launch;
  /** End of the gather (the shot leaves `launch.from`) and the start of the rise. */
  release: number;
  riseFrom: number;
  /** Height gained by the release (launch.from.y − BALL_R). */
  lift: number;
  /**
   * Rise exponent: height = lift · s^exp over [riseFrom, release]. exp = vy·T/lift makes the
   * vertical speed at release exactly the launch's vy (C1 release); the ball is still
   * accelerating as it leaves, never parked in the air.
   */
  exp: number;
  /** Start of the pull-back window. */
  windowFrom: number;
}
export const makeGather = (origin: Vector3, launch: Launch, timing: GatherTiming = SHOT_TIMING): Gather => {
  const { release, riseFrom } = timing;
  const lift = launch.from.y - BALL_R;
  const window = Math.min(release, (launch.pullBack * 27) / (4 * Math.max(0.05, launch.vh.length())));
  return { origin, launch, release, riseFrom, lift, exp: (launch.vy * (release - riseFrom)) / lift, windowFrom: release - window };
};
/** The hand puts the launch's spin on over the gather's last 30 ms (SPIN_FROM for the shared gather). */
const spinFrom = (g: Gather) => g.release - (RELEASE_AT - SPIN_FROM);
/**
 * Offset along the shot direction during the gather: at rest, then a cubic pull-back that swings
 * forward into its own horizontal speed at release.
 */
function gatherAlong(g: Gather, t: number): number {
  const v = g.launch.vh.length();
  const s = seg(t, g.windowFrom, g.release);
  return v * (g.release - g.windowFrom) * (s * s * s - s * s);
}
/** d/dt gatherAlong. */
function gatherSpeed(g: Gather, t: number): number {
  if (t <= g.windowFrom || t >= g.release) return t >= g.release ? g.launch.vh.length() : 0;
  const s = seg(t, g.windowFrom, g.release);
  return g.launch.vh.length() * (3 * s * s - 2 * s);
}
const gatherDir = (g: Gather) => (g.launch.vh.lengthSq() > 1e-12 ? g.launch.vh.clone().normalize() : new Vector3(1, 0, 0));
export function gatherAt(g: Gather, t: number, out: Vector3): Vector3 {
  out.copy(g.origin).addScaledVector(gatherDir(g), gatherAlong(g, t));
  out.y = BALL_R + g.lift * seg(t, g.riseFrom, g.release) ** g.exp;
  return out;
}
export function gatherVelocity(g: Gather, t: number, out: Vector3): Vector3 {
  out.copy(gatherDir(g)).multiplyScalar(gatherSpeed(g, t));
  const s = seg(t, g.riseFrom, g.release);
  out.y = t > g.riseFrom && t < g.release ? (g.lift * g.exp * s ** (g.exp - 1)) / (g.release - g.riseFrom) : 0;
  return out;
}

// ── Gather spin: integrated from its rate (pure function of t) ──
const GL_X = [0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363];
const GL_W = [0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];
function integrate(f: (t: number) => number, a: number, b: number): number {
  const h = (b - a) / 2, m = (a + b) / 2;
  let s = 0;
  for (let i = 0; i < 4; i++) s += GL_W[i]! * (f(m - h * GL_X[i]!) + f(m + h * GL_X[i]!));
  return s * h;
}
/**
 * Gather spin rate (rad/s about the launch's roll axis): rolls with the gather on the floor, then,
 * as the hand lifts it off over the last 30 ms, turns into the launch's spin. Integrated exactly
 * (Gauss–Legendre between breaks, polynomial pieces), so the spin rate is continuous into the flight.
 */
export function gatherRate(g: Gather, t: number): number {
  const roll = t < g.release ? gatherSpeed(g, t) / BALL_R : 0;
  const w = smoothstep(seg(t, spinFrom(g), g.release));
  return (1 - w) * roll + w * g.launch.spin;
}
export function gatherAngle(g: Gather, t: number): number {
  const end = Math.min(t, g.release);
  if (end <= 0) return 0;
  let a = 0, sum = 0;
  for (const br of [g.windowFrom, g.riseFrom, spinFrom(g)].sort((x, y) => x - y)) {
    if (br <= a) continue;
    if (br >= end) break;
    sum += integrate((u) => gatherRate(g, u), a, br);
    a = br;
  }
  return sum + integrate((u) => gatherRate(g, u), a, end);
}
export const gatherAxis = (g: Gather) => rollAxis(gatherDir(g));

// ── The made ball in the net ─────────────────────────────────────────────────────────
/**
 * The net's grip (`NetDrag`): engaged where the ball's cross-section reaches past the net's hanging
 * envelope (contract `netHangRadius`), full at 3 cm of overlap. The braking rate is solved so the
 * ball leaves the net falling at NET_KEEP of its entry speed (a swish loses 10–20 %); its drift
 * towards the board is handed back out (the far cords catch it).
 */
export const NET_KEEP = 0.85;
/** The made ball's horizontal velocity as it leaves the net (su/s): back out, towards the camera. */
export const MADE_DRIFT = new Vector3(0.16, 0, 0.3);
const NET_CORD = 0.01;
export const netEngagement = (p: Vector3): number => {
  const ox = p.x - RIM_CENTER.x, oz = p.z - RIM_CENTER.z, o = Math.hypot(ox, oz);
  const yb = p.y - RIM_CENTER.y;
  let e = 0;
  // Only the depth samples the ball spans (|dy| < R).
  const i0 = Math.max(0, Math.ceil(((-yb - BALL_R) / NET.depth) * 32)), i1 = Math.min(32, Math.floor(((-yb + BALL_R) / NET.depth) * 32));
  for (let i = i0; i <= i1; i++) {
    const d = (i / 32) * NET.depth;
    const dy = -d - yb;
    if (Math.abs(dy) >= BALL_R) continue;
    const reach = o + Math.sqrt(BALL_R * BALL_R - dy * dy) + NET_CORD;
    e = Math.max(e, (reach - netHangRadius(d / NET.depth)) / 0.03);
  }
  return Math.min(1, Math.max(0, e));
};
export const netExited = (p: Vector3) => p.y + BALL_R < RIM_CENTER.y - NET.depth;

/**
 * Net drag for a ball entering the net with state `entry`: the braking rate solved so it leaves
 * falling at NET_KEEP of its entry speed, the hand-back solved so it leaves drifting at `drift`.
 */
export function solveNet(entry: BallState, drift: Vector3 = MADE_DRIFT, rate?: number): NetDrag {
  const net: NetDrag = { engagement: netEngagement, rate: rate ?? 0, exitDrift: drift.clone(), spinRate: 30, exited: netExited };
  const run = () => {
    const st = cloneState(entry);
    throughNet(new BallTrack(false), st, net);
    return st;
  };
  if (rate === undefined) {
    let lo = 0, hi = 400;
    for (let i = 0; i < 40; i++) {
      net.rate = (lo + hi) / 2;
      if (-run().v.y > NET_KEEP * -entry.v.y) lo = net.rate;
      else hi = net.rate;
    }
    net.rate = (lo + hi) / 2;
  }
  // The horizontal relaxation leaves a little of the entry drift: aim past the target so the
  // exit velocity is exactly `drift`.
  for (let i = 0; i < 6; i++) {
    const out = run().v.setY(0);
    net.exitDrift.add(drift.clone().sub(out));
  }
  return net;
}

// ── Tracks ─────────────────────────────────────────────────────────────────────────
interface Built {
  gather: Gather;
  /** The physics from RELEASE_AT to rest (knots at absolute sequence times, orientation relative to `start`). */
  track: BallTrack;
  /** World orientation at t = 0: the track's (and the gather's) rotations compose in front of it. */
  start: Quaternion;
}

/** Launch state at the gather's release (orientation: the gather's turn, relative to the start). */
export function launchState(g: Gather, start = new Quaternion()): BallState {
  const l = g.launch;
  const axis = gatherAxis(g);
  return {
    t: g.release,
    p: l.from.clone(),
    v: l.vh.clone().setY(l.vy),
    w: axis.clone().multiplyScalar(l.spin),
    q: new Quaternion().setFromAxisAngle(axis, gatherAngle(g, g.release)).multiply(start),
  };
}

/** The canonical made shot's net braking rate (1/s at full engagement), reused by a change of mind's shots. */
export let NET_RATE = 0;
function buildMade(): Built {
  const gather = makeGather(BALL_AT.guest, MADE);
  const track = new BallTrack();
  const st = launchState(gather);
  fly(track, st, CONTACT_AT);
  const net = solveNet(cloneState(st));
  NET_RATE = net.rate;
  throughNet(track, st, net);
  bounceToRest(track, st);
  return { gather, track, start: GUEST_ROT };
}

/**
 * The bank: the shot meets the glass at BANK_POINT on the beat, strikes it (`surfaceContact`), and
 * flies on among the board and the ring (`flyUntil`) until it reaches the floor, where the player
 * traps the bounce to MISS_REST.
 */
function buildMissed(): Built {
  const gather = makeGather(BALL_AT.guest, BANKED, BANK_TIMING);
  const track = new BallTrack();
  const st = launchState(gather);
  const first = flyUntil(track, st, HOOP_COLLIDERS);
  if (first.kind !== 'hit' || first.collider.surface !== 'board' || Math.abs(st.t - CONTACT_AT) > 1e-6) throw new Error('the bank must meet the glass on the beat');
  surfaceContact(track, st, first.collider);
  for (let i = 0; ; i++) {
    const next = flyUntil(track, st, HOOP_COLLIDERS);
    if (next.kind === 'floor') break;
    if (next.kind !== 'hit' || i > 24) throw new Error('the bank never reached the floor');
    surfaceContact(track, st, next.collider);
  }
  trapTo(track, st, MISS_REST);
  bounceToRest(track, st);
  return { gather, track, start: GUEST_ROT };
}

/**
 * Host pass: the lob's horizontal speed is solved (bisection) so the ball comes to rest exactly on
 * the guest spot. The host-ready orientation is then chosen so the pass ends in GUEST_ROT.
 */
function buildHost(): Built {
  const run = (speed: number) => {
    const gather = makeGather(BALL_AT.host, passLaunch(speed));
    const track = new BallTrack();
    const st = launchState(gather);
    bounceToRest(track, st);
    return { gather, track, st };
  };
  const along = (p: Vector3) => (p.x - BALL_AT.host.x) * PASS_DIR.x + (p.z - BALL_AT.host.z) * PASS_DIR.z;
  let lo = 0.2, hi = 12;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (along(run(mid).st.p) < PASS_SPAN) lo = mid;
    else hi = mid;
  }
  const { gather, track, st } = run((lo + hi) / 2);
  // q_rel(end) · start = GUEST_ROT.
  const start = st.q.clone().invert().multiply(GUEST_ROT);
  return { gather, track, start };
}

/**
 * The guest-ready orientation the master ball's seam frame was fitted to (`SEAM_FRAME`, recipes/
 * sports.ts `ballRotation`): the classic "( + )" faces the guest. It is kept exactly; the host-
 * ready orientation is whatever makes the pass end in it.
 */
export const GUEST_ROT = new Quaternion(-0.282355196, 0, -0.80672913, 0.519098887).normalize();

const BUILT: Record<SequenceName, Built> = { host: buildHost(), accept: buildMade(), decline: buildMissed() };

/** Time each sequence's ball comes to rest (its tail ends there; ≥ the sequence's duration). */
export const REST_AT: Record<SequenceName, number> = {
  host: Math.max(DURATIONS.host, BUILT.host.track.end),
  accept: Math.max(DURATIONS.accept, BUILT.accept.track.end),
  decline: Math.max(DURATIONS.decline, BUILT.decline.track.end),
};

const _q = new Quaternion();
/**
 * The ball at time t of a sequence's physics, past its duration too (the tail), clamped to
 * [0, REST_AT]. Pure. `vel` and `ang` (optional) receive its velocity and angular velocity.
 */
export function sampleTrack(sequence: SequenceName, t: number, out: SportsFrame, vel?: Vector3, ang?: Vector3): SportsFrame {
  const b = BUILT[sequence];
  const tc = Math.min(Math.max(t, 0), REST_AT[sequence]);
  if (tc < b.gather.release) {
    gatherAt(b.gather, tc, out.ballPos);
    out.ballRot.setFromAxisAngle(gatherAxis(b.gather), gatherAngle(b.gather, tc)).multiply(b.start);
    out.squash = 0;
    out.squashAxis.set(0, 1, 0);
    if (vel) gatherVelocity(b.gather, tc, vel);
    if (ang) ang.copy(gatherAxis(b.gather)).multiplyScalar(gatherRate(b.gather, tc));
    return out;
  }
  out.squash = b.track.sample(tc, out.ballPos, _q, vel, ang);
  b.track.squashAxis(tc, out.squashAxis);
  out.ballRot.copy(_q).multiply(b.start);
  return out;
}

/** Deterministic sample of a sequence at t seconds (clamped to [0, duration]). */
export function sampleSequence(sequence: SequenceName, t: number, out: SportsFrame): SportsFrame {
  return sampleTrack(sequence, Math.min(Math.max(t, 0), DURATIONS[sequence]), out);
}

export const blankFrame = (): SportsFrame => ({ ballPos: new Vector3(), ballRot: new Quaternion(), squash: 0, squashAxis: new Vector3(0, 1, 0) });

/** Canonical poses are the rest states at the ends of the tracks (orientation included). */
const HOST_READY = { pos: BALL_AT.host.clone(), rot: BUILT.host.start.clone() };
const ends = (seq: SequenceName) => sampleTrack(seq, REST_AT[seq], blankFrame());
const GUEST_END = ends('host');
const MADE_END = ends('accept');
const MISSED_END = ends('decline');

export function frameFor(pose: CanonicalPose, out: SportsFrame): SportsFrame {
  if (pose === 'host-ready') {
    out.ballPos.copy(HOST_READY.pos);
    out.ballRot.copy(HOST_READY.rot);
  } else {
    const e = pose === 'guest-ready' ? GUEST_END : pose === 'accepted' ? MADE_END : MISSED_END;
    out.ballPos.copy(e.ballPos);
    out.ballRot.copy(e.ballRot);
  }
  out.squash = 0;
  out.squashAxis.set(0, 1, 0);
  return out;
}

export function newFrame(): SportsFrame {
  return frameFor('guest-ready', blankFrame());
}

/** Diagnostics for tests and docs (and the change planner). */
export const TRACKS: Readonly<Record<SequenceName, BallTrack>> = { host: BUILT.host.track, accept: BUILT.accept.track, decline: BUILT.decline.track };
export const CONTACTS: Readonly<Record<SequenceName, readonly Contact[]>> = { host: BUILT.host.track.contacts, accept: BUILT.accept.track.contacts, decline: BUILT.decline.track.contacts };
export const LAUNCHES = { accept: MADE, decline: BANKED, host: BUILT.host.gather.launch } as const;
/** Each sequence's release (the end of its gather). */
export const RELEASES: Readonly<Record<SequenceName, number>> = { host: BUILT.host.gather.release, accept: BUILT.accept.gather.release, decline: BUILT.decline.gather.release };
/** v1.7: the strikes on the board and the rim (the decline's bank and rattle; none in the others). */
export const HITS: Readonly<Record<SequenceName, readonly Hit[]>> = { host: BUILT.host.track.hits, accept: BUILT.accept.track.hits, decline: BUILT.decline.track.hits };
/** The bank's strike on the glass. */
export const BANK_HIT: Hit = BUILT.decline.track.hits[0]!;
/** The shots' roll axes in the air. */
export const SHOT_AXES = { accept: rollAxis(MADE.vh.clone().normalize()), decline: rollAxis(BANK_DIR), host: rollAxis(PASS_DIR) } as const;
/** Rest positions (the canonical poses' ball centres). */
export const REST = { guest: GUEST_END.ballPos.clone(), made: MADE_END.ballPos.clone(), missed: MISSED_END.ballPos.clone() } as const;
/** The made ball's speed entering and leaving the net (diagnostics). */
export const NET_PASSAGE = (() => {
  const f = blankFrame(), v = new Vector3(), q = new Quaternion();
  const tr = BUILT.accept.track;
  tr.sample(CONTACT_AT, f.ballPos, q, v);
  const entry = v.clone();
  let exitAt = CONTACT_AT;
  for (let t = CONTACT_AT; t < tr.end; t += 0.001) {
    tr.sample(t, f.ballPos, q);
    if (netExited(f.ballPos)) { exitAt = t; break; }
  }
  tr.sample(exitAt, f.ballPos, q, v);
  return { entry, exit: v.clone(), exitAt };
})();
