import { Quaternion, Vector3 } from 'three';
import { BALL_R, SPORTS_CM_PER_UNIT } from '../../../models/sportsContract.ts';

/**
 * Sports v1.5: the basketball's physics, integrated offline into keyframed tracks that the
 * choreography samples (the canonical sequences at module load, a change of mind when it happens).
 * A track is a deterministic function of its start state, so every sequence stays pure in t and
 * replay-safe; nothing integrates per frame.
 *
 * Model (scene units: 1 su = 36 cm; the ball is an 18 cm mini ball):
 * - Flight: one gravity, standard g (9.81 m/s² = 27.25 su/s²). Air drag (≈ 7 % of g at the
 *   shot's top speed) and Magnus lift from the backspin (≈ 2 %) are left out, so every flight is an
 *   exact parabola.
 * - Floor contact: an impulse with a normal coefficient of restitution of 0.82 (FIBA: a ball
 *   dropped from 1.8 m rebounds to 1.2–1.4 m, e = 0.816–0.882; the brief's 0.76–0.84) and a
 *   tangential impulse after Cross ("Bounce of a spinning ball near normal incidence", Am. J.
 *   Phys. 2005): the contact point's tangential velocity is reversed by e_t = 0.15 when the ball
 *   grips, else Coulomb sliding friction μ = 0.6 limits the impulse; the ball is a hollow shell,
 *   I = (2/3)·m·R². So a backspinning ball checks up (or comes back), a topspinning one runs on,
 *   and a ball without spin leaves nearly rolling.
 * - Squash: the shell compresses along the contact normal by an amount that follows the normal
 *   impulse: 10 % of its diameter at a 1.8 m drop's 5.94 m/s (impulse (1 + e)·v), linear in the
 *   impulse. A real contact lasts ≈ 10 ms (a linear spring with that compression at that speed:
 *   π·δ/v = 9.5 ms); it is drawn over 20 ms, so a 60 fps frame (16.7 ms) always catches it. While
 *   it lasts the bottom stays on the floor and the drawn centre dips by the compression.
 * - Rest: once a rebound would rise less than 1 cm (1.23 su/s; a smaller hop is invisible at stage
 *   size) the ball stays down and rolls: kinetic friction μ until the contact point grips, then
 *   rolling resistance c_rr = 0.02 (a pebbled rubber ball on a painted studio floor; hardwood ≈
 *   0.01), a deceleration of c_rr·g / (1 + 2/3) = 0.33 su/s², until it stops.
 * - The net (made shots only) is a drag on the ball while the net has to open round it
 *   (`NetDrag`), proportional to how far the ball's cross-section overlaps the net's hanging
 *   envelope: it checks the fall a little, hands the drift towards the board back out and grips
 *   the backspin.
 *
 * A contact can also be **redirected** (`floorContact` with an outgoing state): the invisible
 * player's hand acting through a bounce, used only by a change of mind (`change.ts`). Its squash
 * follows the larger impulse.
 */

/** Standard gravity in scene units per s² (981 cm/s² ÷ 36 cm). */
export const GRAVITY = 981 / SPORTS_CM_PER_UNIT;
/** Metres per second → scene units per second. */
export const MS = 100 / SPORTS_CM_PER_UNIT;

export const BOUNCE = {
  restitution: 0.82,
  friction: 0.6,
  tangentialRestitution: 0.15,
  /** I / (m R²) for a hollow rubber shell. */
  inertia: 2 / 3,
  rollingResistance: 0.02,
  /** Drawn contact duration (s): 2× the real ≈ 10 ms, so every 60 fps frame sequence catches one frame of it. */
  contactTime: 0.02,
  /** Compression (fraction of the diameter) at the reference impact speed (a 1.8 m drop). */
  squash: 0.1,
  squashSpeed: 5.94 * MS,
  /** Below this rebound speed (su/s, a 1 cm hop) the ball stays down and rolls. */
  minBounceSpeed: Math.sqrt(2 * GRAVITY * (1 / SPORTS_CM_PER_UNIT)),
} as const;

/** Rolling-resistance deceleration (su/s²). */
export const ROLL_DECEL = (BOUNCE.rollingResistance * GRAVITY) / (1 + BOUNCE.inertia);

const UP = new Vector3(0, 1, 0);

/** One floor contact (diagnostics, tests, the scene's impact hooks). */
export interface Contact {
  /** Touch-down time (s) and point (ball centre at touch). */
  at: number;
  point: Vector3;
  /** Impact normal speed and rebound normal speed (su/s; 0 = it stays down). */
  speed: number;
  rebound: number;
  /** Peak compression (fraction of the diameter). */
  squash: number;
  /** Horizontal velocity before and after (su/s). */
  vIn: Vector3;
  vOut: Vector3;
  /** A change of mind's hand acting through this bounce. */
  redirected: boolean;
}

/**
 * A keyframed track: knots at increasing times with the drawn centre and its velocity (cubic
 * Hermite between knots: exact for every parabola and every constant deceleration), the
 * orientation (slerp: exact for constant spin), the angular velocity (linear), and the squash
 * with its rate (Hermite, so the drawn bottom stays exactly on the floor through a contact). Two
 * knots at the same time are a kink: the left and right limits of a velocity that jumps there.
 */
export class BallTrack {
  readonly t: number[] = [];
  readonly p: number[] = [];
  readonly v: number[] = [];
  readonly q: number[] = [];
  readonly w: number[] = [];
  readonly s: number[] = [];
  readonly ds: number[] = [];
  readonly contacts: Contact[] = [];
  /** False: a dry run (solvers) records contacts but no knots. */
  constructor(readonly record = true) {}

  get end(): number {
    return this.t[this.t.length - 1] ?? 0;
  }

  push(t: number, p: Vector3, v: Vector3, q: Quaternion, w: Vector3, s = 0, ds = 0): void {
    if (!this.record) return;
    const n = this.t.length;
    if (n && t < this.t[n - 1]! - 1e-12) throw new Error(`track knots out of order at ${t}`);
    this.t.push(n && Math.abs(t - this.t[n - 1]!) <= 1e-12 ? this.t[n - 1]! : t);
    this.p.push(p.x, p.y, p.z);
    this.v.push(v.x, v.y, v.z);
    this.q.push(q.x, q.y, q.z, q.w);
    this.w.push(w.x, w.y, w.z);
    this.s.push(s);
    this.ds.push(ds);
  }

  private index(t: number): number {
    const ts = this.t;
    let lo = 0, hi = ts.length - 1;
    if (t <= ts[0]!) return 0;
    if (t >= ts[hi]!) return hi - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ts[mid]! <= t) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /**
   * Drawn centre, orientation (and optionally velocity and angular velocity) at time t, clamped
   * to the track. Returns the squash.
   */
  sample(t: number, pos: Vector3, rot: Quaternion, vel?: Vector3, ang?: Vector3): number {
    const n = this.t.length;
    if (t >= this.t[n - 1]!) return this.knot(n - 1, pos, rot, vel, ang);
    const i = this.index(Math.max(t, this.t[0]!));
    const t0 = this.t[i]!, t1 = this.t[i + 1]!, h = t1 - t0;
    if (h <= 0) return this.knot(i + 1, pos, rot, vel, ang);
    const u = Math.min(1, Math.max(0, (t - t0) / h));
    const u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const a = i * 3, b = a + 3;
    for (let k = 0; k < 3; k++) pos.setComponent(k, h00 * this.p[a + k]! + h10 * h * this.v[a + k]! + h01 * this.p[b + k]! + h11 * h * this.v[b + k]!);
    if (vel) {
      const d00 = (6 * u2 - 6 * u) / h, d10 = 3 * u2 - 4 * u + 1, d01 = (-6 * u2 + 6 * u) / h, d11 = 3 * u2 - 2 * u;
      for (let k = 0; k < 3; k++) vel.setComponent(k, d00 * this.p[a + k]! + d10 * this.v[a + k]! + d01 * this.p[b + k]! + d11 * this.v[b + k]!);
    }
    if (ang) for (let k = 0; k < 3; k++) ang.setComponent(k, this.w[a + k]! + (this.w[b + k]! - this.w[a + k]!) * u);
    _qa.fromArray(this.q, i * 4);
    _qb.fromArray(this.q, (i + 1) * 4);
    rot.slerpQuaternions(_qa, _qb, u);
    return h00 * this.s[i]! + h10 * h * this.ds[i]! + h01 * this.s[i + 1]! + h11 * h * this.ds[i + 1]!;
  }

  private knot(i: number, pos: Vector3, rot: Quaternion, vel?: Vector3, ang?: Vector3): number {
    pos.fromArray(this.p, i * 3);
    rot.fromArray(this.q, i * 4);
    vel?.fromArray(this.v, i * 3);
    ang?.fromArray(this.w, i * 3);
    return this.s[i]!;
  }

  /** The first contact touching down after time t (strictly), or null. */
  nextContact(t: number): Contact | null {
    for (const c of this.contacts) if (c.at > t + 1e-9) return c;
    return null;
  }

  /** The contact whose drawn window contains t, or null. */
  contactAt(t: number): Contact | null {
    for (const c of this.contacts) if (t >= c.at && t < c.at + BOUNCE.contactTime) return c;
    return null;
  }

  /** Time the last contact ends (the ball stays down from there), or the end if it never touched. */
  get lastContactEnd(): number {
    const c = this.contacts[this.contacts.length - 1];
    return c ? c.at + BOUNCE.contactTime : this.end;
  }
}
const _qa = new Quaternion(), _qb = new Quaternion();

/** The integrator's state: centre (undeformed, on the floor at y = BALL_R), velocity, angular velocity, orientation. */
export interface BallState {
  t: number;
  p: Vector3;
  v: Vector3;
  w: Vector3;
  q: Quaternion;
}

export const cloneState = (s: BallState): BallState => ({ t: s.t, p: s.p.clone(), v: s.v.clone(), w: s.w.clone(), q: s.q.clone() });

/** Knot spacing in flight and on the floor (s). */
const STEP = 1 / 240;
/** Knot spacing inside contacts and the net (s). */
const FINE = 1 / 1000;

const _dq = new Quaternion(), _axis = new Vector3();
/** q ← exp(w·dt) q: a world-frame rotation by the constant angular velocity w over dt. */
export function spin(q: Quaternion, w: Vector3, dt: number): Quaternion {
  const rate = w.length();
  if (rate * dt < 1e-12) return q;
  _dq.setFromAxisAngle(_axis.copy(w).divideScalar(rate), rate * dt);
  return q.premultiply(_dq).normalize();
}

/** Rolling (no slip) angular velocity for a horizontal velocity v: (up × v) / R. */
export const rollingSpin = (v: Vector3, out = new Vector3()) => out.set(v.z, 0, -v.x).divideScalar(BALL_R);

/** Time of flight from height y0 (centre) with vertical speed vy until the ball's bottom meets the floor. */
export function flightTime(y0: number, vy: number): number {
  const above = Math.max(0, y0 - BALL_R);
  return vy <= 0 && above === 0 ? 0 : (vy + Math.sqrt(vy * vy + 2 * GRAVITY * above)) / GRAVITY;
}

/**
 * Free flight from the state until the ball's bottom meets the floor or `until` (whichever comes
 * first). Returns true if it reached the floor (the state is then at the touch).
 */
export function fly(track: BallTrack, st: BallState, until = Infinity): boolean {
  const toFloor = flightTime(st.p.y, st.v.y);
  const T = Math.min(toFloor, until - st.t);
  const p0 = st.p.clone(), v0 = st.v.clone(), q0 = st.q.clone(), t0 = st.t;
  track.push(t0, p0, v0, q0, st.w);
  const n = Math.max(1, Math.ceil(T / STEP));
  const p = new Vector3(), v = new Vector3(), q = new Quaternion();
  if (track.record) {
    for (let i = 1; i <= n; i++) {
      const u = (i / n) * T;
      p.copy(p0).addScaledVector(v0, u);
      p.y -= 0.5 * GRAVITY * u * u;
      v.copy(v0);
      v.y -= GRAVITY * u;
      q.copy(q0);
      spin(q, st.w, u);
      track.push(t0 + u, p, v, q, st.w);
    }
  }
  st.t = t0 + T;
  st.p.copy(p0).addScaledVector(v0, T);
  st.p.y -= 0.5 * GRAVITY * T * T;
  st.v.y -= GRAVITY * T;
  spin(st.q, st.w, T);
  if (T === toFloor) {
    st.p.y = BALL_R;
    return true;
  }
  return false;
}

/**
 * Impulse of a floor contact: post-contact velocity and angular velocity (in place). Returns the
 * rebound normal speed.
 */
export function floorImpulse(v: Vector3, w: Vector3): number {
  const { restitution: e, friction: mu, tangentialRestitution: et, inertia: alpha } = BOUNCE;
  const vn = Math.max(0, -v.y);
  // Contact point velocity: v + w × (−R·up) = (vx + R·wz, 0, vz − R·wx).
  const cx = v.x + BALL_R * w.z, cz = v.z - BALL_R * w.x;
  const c = Math.hypot(cx, cz);
  let dx = 0, dz = 0;
  if (c > 1e-12) {
    // Grip: reverse the contact velocity by e_t; the impulse per unit mass that needs.
    let k = ((1 + et) * alpha) / (1 + alpha);
    const limit = (mu * (1 + e) * vn) / c;
    if (k > limit) k = limit;
    dx = -k * cx;
    dz = -k * cz;
  }
  v.x += dx;
  v.z += dz;
  v.y = e * vn;
  // Δw = (r × Δv) / (α R²) with r = −R·up: (−dz, 0, dx) / (α R).
  w.x += -dz / (alpha * BALL_R);
  w.z += dx / (alpha * BALL_R);
  return v.y;
}

/** Peak compression (fraction of the diameter) for a normal impulse per unit mass `j` (su/s). */
export const squashForImpulse = (j: number) => (BOUNCE.squash * j) / ((1 + BOUNCE.restitution) * BOUNCE.squashSpeed);
/** Peak compression for a plain bounce at normal impact speed vn. */
export const squashFor = (vn: number) => squashForImpulse((1 + BOUNCE.restitution) * vn);

/** A redirected contact's outgoing state (the hand acting through the bounce). */
export interface Redirect {
  v: Vector3;
  w: Vector3;
}

/**
 * A floor contact from the touch-down state: the impulse (or a redirect), the drawn contact (the
 * bottom held on the floor while the shell compresses and recovers, velocity and spin handing over
 * linearly) and the lift-off state. Returns false when the ball stays down (its rebound would rise
 * under 1 cm).
 */
export function floorContact(track: BallTrack, st: BallState, redirect?: Redirect): boolean {
  const vIn = st.v.clone(), wIn = st.w.clone();
  const vOut = redirect ? redirect.v.clone() : st.v.clone(), wOut = redirect ? redirect.w.clone() : st.w.clone();
  const rebound = redirect ? Math.max(0, vOut.y) : floorImpulse(vOut, wOut);
  const vn = Math.max(0, -vIn.y);
  const squash = Math.min(0.12, redirect ? squashForImpulse(vn + rebound) : squashFor(vn));
  const bouncing = redirect ? rebound > 0 : rebound >= BOUNCE.minBounceSpeed;
  if (!bouncing) vOut.y = 0;
  track.contacts.push({ at: st.t, point: st.p.clone(), speed: vn, rebound: bouncing ? rebound : 0, squash, vIn: vIn.clone().setY(0), vOut: vOut.clone().setY(0), redirected: !!redirect });
  const tau = BOUNCE.contactTime;
  const n = Math.ceil(tau / FINE);
  const p0 = st.p.clone(), t0 = st.t;
  const p = new Vector3(), v = new Vector3(), w = new Vector3();
  const q = st.q.clone();
  // The touch: the drawn centre's velocity jumps from the fall to the compression's.
  const rate = squash * (Math.PI / tau);
  track.push(t0, p0, v.set(vIn.x, -BALL_R * rate, vIn.z), q, wIn, 0, rate);
  let prev = 0;
  for (let i = 1; i <= n; i++) {
    const u = (i / n) * tau;
    const f = u / tau;
    // Horizontal velocity hands over linearly; position is its integral.
    p.set(p0.x + vIn.x * u + ((vOut.x - vIn.x) * u * u) / (2 * tau), 0, p0.z + vIn.z * u + ((vOut.z - vIn.z) * u * u) / (2 * tau));
    const s = squash * Math.sin(Math.PI * f);
    p.y = BALL_R * (1 - s);
    v.set(vIn.x + (vOut.x - vIn.x) * f, -BALL_R * rate * Math.cos(Math.PI * f), vIn.z + (vOut.z - vIn.z) * f);
    // Spin hands over linearly too: integrate at the mid-step rate.
    w.copy(wIn).lerp(wOut, (f + prev) / 2);
    spin(q, w, u - prev * tau);
    prev = f;
    track.push(t0 + u, p, v, q, w.copy(wIn).lerp(wOut, f), i === n ? 0 : s, rate * Math.cos(Math.PI * f));
  }
  st.t = t0 + tau;
  st.p.set(p.x, BALL_R, p.z);
  st.v.copy(vOut);
  st.w.copy(wOut);
  st.q.copy(q);
  return bouncing;
}

/** Horizontal displacement of a contact window (the velocity hands over linearly). */
export const contactShift = (vIn: Vector3, vOut: Vector3, out = new Vector3()) => out.copy(vIn).add(vOut).setY(0).multiplyScalar(BOUNCE.contactTime / 2);

/**
 * On the floor: slides (kinetic friction) until the contact point grips, then rolls with
 * rolling resistance until it stops. The state ends at rest; returns the rest time.
 */
export function rollToRest(track: BallTrack, st: BallState): number {
  const { friction: mu, inertia: alpha } = BOUNCE;
  st.v.y = 0;
  st.p.y = BALL_R;
  track.push(st.t, st.p, st.v, st.q, st.w);
  const p = new Vector3(), v = new Vector3(), w = new Vector3(), q = st.q.clone();
  // Slide: the contact velocity c falls at μg(1 + 1/α) along its own direction.
  const c = new Vector3(st.v.x + BALL_R * st.w.z, 0, st.v.z - BALL_R * st.w.x);
  const cl = c.length();
  if (cl > 1e-9) {
    const a = c.clone().multiplyScalar(-(mu * GRAVITY) / cl);
    const T = cl / (mu * GRAVITY * (1 + 1 / alpha));
    const n = Math.max(1, Math.ceil(T / FINE));
    const p0 = st.p.clone(), v0 = st.v.clone(), w0 = st.w.clone(), t0 = st.t;
    const dw = new Vector3(-a.z, 0, a.x).divideScalar(alpha * BALL_R);
    for (let i = 1; i <= n; i++) {
      const u = (i / n) * T, du = T / n;
      p.copy(p0).addScaledVector(v0, u).addScaledVector(a, 0.5 * u * u);
      v.copy(v0).addScaledVector(a, u);
      w.copy(w0).addScaledVector(dw, u - du / 2);
      spin(q, w, du);
      track.push(t0 + u, p, v, q, w.copy(w0).addScaledVector(dw, u));
    }
    st.t = t0 + T;
    st.p.copy(p0).addScaledVector(v0, T).addScaledVector(a, 0.5 * T * T);
    st.v.copy(v0).addScaledVector(a, T);
    st.w.copy(w0).addScaledVector(dw, T);
    st.q.copy(q);
  }
  // Roll: v falls at ROLL_DECEL; ω = (up × v) / R throughout.
  const speed = Math.hypot(st.v.x, st.v.z);
  const T = speed / ROLL_DECEL;
  if (T > 0) {
    track.push(st.t, st.p, st.v, q, rollingSpin(st.v, w));
    const dir = new Vector3(st.v.x, 0, st.v.z).divideScalar(speed);
    const axis = new Vector3().crossVectors(UP, dir);
    const n = Math.max(1, Math.ceil(T / STEP));
    const p0 = st.p.clone(), t0 = st.t, q0 = q.clone();
    const dq = new Quaternion();
    if (track.record) {
      for (let i = 1; i <= n; i++) {
        const u = (i / n) * T;
        const along = speed * u - 0.5 * ROLL_DECEL * u * u;
        p.copy(p0).addScaledVector(dir, along);
        v.copy(dir).multiplyScalar(speed - ROLL_DECEL * u);
        q.copy(q0).premultiply(dq.setFromAxisAngle(axis, along / BALL_R));
        track.push(t0 + u, p, v, q, rollingSpin(v, w));
      }
    }
    st.t = t0 + T;
    st.p.copy(p0).addScaledVector(dir, (speed * speed) / (2 * ROLL_DECEL));
    st.q.copy(q0).premultiply(dq.setFromAxisAngle(axis, (speed * speed) / (2 * ROLL_DECEL) / BALL_R));
  }
  st.v.set(0, 0, 0);
  st.w.set(0, 0, 0);
  track.push(st.t, st.p, st.v, st.q, st.w);
  return st.t;
}

/** Bounce (flight, contact, flight, …) until the ball stays down, then roll to rest. */
export function bounceToRest(track: BallTrack, st: BallState): number {
  for (let i = 0; i < 200; i++) {
    if (!fly(track, st)) throw new Error('flight never reached the floor');
    if (!floorContact(track, st)) break;
  }
  return rollToRest(track, st);
}

/**
 * Time from leaving the floor with vertical speed `vy` (and, if `first`, a contact first) until
 * the ball stays down: every flight and contact of the dying bounces. Horizontal motion does not
 * enter (a rolling ball's bounces keep its horizontal speed).
 */
export function bounceTime(vy: number): number {
  let T = 0, v = vy;
  for (let i = 0; i < 200 && v > 0; i++) {
    T += (2 * v) / GRAVITY + BOUNCE.contactTime;
    const r = BOUNCE.restitution * v;
    v = r >= BOUNCE.minBounceSpeed ? r : 0;
  }
  return T;
}

/**
 * The net's grip on the made ball: while the net has to open round it, the ball is braked in
 * proportion to that opening (`engagement`), its horizontal velocity relaxes towards `exitDrift`
 * (the net catches the drift towards the board and hands it back out) and its spin is gripped.
 * `rate` (1/s at full engagement) is solved so the ball leaves the net at a chosen fraction of its
 * entry speed.
 */
export interface NetDrag {
  /** Engagement 0…1 for the ball centre at p (sports_root space). */
  engagement(p: Vector3): number;
  rate: number;
  exitDrift: Vector3;
  /** Spin grip rate (1/s at full engagement). */
  spinRate: number;
  /** True once the ball has left the net (its top below the net's bottom). */
  exited(p: Vector3): boolean;
}

/** Through the net with its drag (semi-implicit Euler at 0.25 ms, knots at 1 ms), until the ball has left it. */
export function throughNet(track: BallTrack, st: BallState, net: NetDrag): void {
  const h = 1 / 4000;
  const every = Math.round(FINE / h);
  const a = new Vector3();
  track.push(st.t, st.p, st.v, st.q, st.w);
  for (let i = 1; i < 40000; i++) {
    const e = net.engagement(st.p);
    a.set(0, -GRAVITY, 0);
    if (e > 0) {
      const k = net.rate * e;
      a.x += k * (net.exitDrift.x - st.v.x);
      a.z += k * (net.exitDrift.z - st.v.z);
      a.y += -k * st.v.y;
      st.w.multiplyScalar(Math.exp(-net.spinRate * e * h));
    }
    st.v.addScaledVector(a, h);
    st.p.addScaledVector(st.v, h);
    spin(st.q, st.w, h);
    st.t += h;
    if (i % every === 0) track.push(st.t, st.p, st.v, st.q, st.w);
    if (net.exited(st.p) && st.v.y < 0) {
      track.push(st.t, st.p, st.v, st.q, st.w);
      return;
    }
  }
  throw new Error('the ball never left the net');
}
