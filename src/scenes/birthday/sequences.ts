import { Vector3 } from 'three';
import { cubicBezier, EASE, easeInQuad, easeOutCubic, lerp, seg, smoothstep } from '../../motion/curves.ts';
import type { CanonicalPose, SequenceName } from '../../core/types.ts';
import { CANDLE, CANDLE_SOCKETS } from '../../../models/birthdayContract.ts';
import {
  BIN_AT, BIN_FROM, CAKE_LOAD, CANDLE_CONTACT_SPEED, CANDLE_COUNT, CANDLE_DESCENT, CANDLE_HOVER, CANDLE_PRESS, CANDLE_START, CARRY, CARRY_FROM, CARRY_LEAN, CARRY_TO,
  DROP_TO, DROPPED, DURATIONS, FLAME_FLUTTER, FLAME_RISE, FLAME_START, HOVER_OVER_BIN, LEAN, LEAN_FADE, LEAN_MAX, LIFT_TO, ON_STAND, OUT_LEN, OUT_START, PRESENT_YAW, WICK_LEAN,
  WISP_GROW_FROM, WISP_LEN, WISP_OPACITY, WISP_RISE, WISP_START,
} from './poses.ts';

/**
 * Pure authored choreography for Birthday: every value is a function of time (the carry lean is
 * a damped pendulum integrated once, at module load, into a table sampled with cubic Hermite
 * interpolation), so replay and reversal restore cake, candles, flames, wisps and bin exactly, and
 * every channel is C1 at every beat boundary (Birthday sub-spec; tests/birthday.test.ts).
 */

export interface BirthdayFrame {
  cakePos: Vector3;
  /** cake_secondary yaw: host presentation turn. */
  cakeYaw: number;
  /** cake_secondary carry lean (radians) about LEAN_AXIS: + tips the top towards the bin. */
  cakeLean: number;
  cakeVisible: boolean;
  /**
   * The cake is over the bin's opening (from the end of the carry): what sinks below the rim from
   * here on is in the bin's shade. Only switches while the whole cake is above the rim.
   */
  cakeInBin: boolean;
  /** Each candle's height above its seated socket position (≥ 0; 0 once seated). */
  drop: number[];
  /**
   * How far each candle has been pushed into the buttercream, 0 (base touching the surface or
   * above it) – 1 (seated): the collar and dimple round its socket (models/cakeShaders.ts).
   */
  press: number[];
  /** Fraction of each candle's own lean (poses.ts CANDLE_LEAN) it has taken: 0 upright – 1 seated. */
  lean: number[];
  /**
   * Seconds each candle has burnt, weighted by its flame's size (∫ flameScale dt over the clip; the
   * canonical poses carry the clip's totals). The melt (melt.ts) is a pure function of it.
   */
  litTime: number[];
  /** The cake's give under the pushes (host): its underside centre's dip (units, ≤ 0) and tilt (radians about x and z). */
  cakeDip: number;
  cakeTiltX: number;
  cakeTiltZ: number;
  flameScale: number[];
  flameOpacity: number[];
  /** Breath lean amount (0–1+) applied as LEAN rotation to each flame. */
  flameLean: number[];
  /** Breath stretch (0–1): the flame drawn out tall and thin by the gust (FLAME_STRETCH). */
  flameStretch: number[];
  wickLean: number;
  wispOpacity: number[];
  wispRise: number[];
  /** Wisp height as a fraction of its full curl (1 at rest). */
  wispGrow: number[];
  binPos: Vector3;
  binVisible: boolean;
  /** Flap opening fraction (0 closed, 1 open). */
  flaps: number;
}

const filled = (v: number) => Array.from({ length: CANDLE_COUNT }, () => v);

export function newFrame(): BirthdayFrame {
  return frameFor('guest-ready', {
    cakePos: new Vector3(), cakeYaw: 0, cakeLean: 0, cakeVisible: true, cakeInBin: false, drop: filled(0), press: filled(1), lean: filled(1), litTime: filled(0),
    cakeDip: 0, cakeTiltX: 0, cakeTiltZ: 0, flameScale: filled(1), flameOpacity: filled(1),
    flameLean: filled(0), flameStretch: filled(0), wickLean: 0, wispOpacity: filled(0), wispRise: filled(0), wispGrow: filled(1), binPos: new Vector3(), binVisible: false, flaps: 0,
  });
}

const setAll = (a: number[], v: number) => a.fill(v);

export function frameFor(pose: CanonicalPose, out: BirthdayFrame): BirthdayFrame {
  const lit = pose === 'guest-ready' ? 1 : 0;
  out.cakePos.copy(pose === 'declined' ? DROPPED : ON_STAND);
  out.cakeYaw = pose === 'host-ready' ? PRESENT_YAW : 0;
  out.cakeLean = 0;
  out.cakeVisible = pose !== 'declined';
  out.cakeInBin = pose === 'declined';
  setAll(out.drop, pose === 'host-ready' ? CANDLE_HOVER : 0);
  setAll(out.press, pose === 'host-ready' ? 0 : 1);
  setAll(out.lean, pose === 'host-ready' ? 0 : 1);
  const burnt = pose === 'guest-ready' ? GUEST_READY_LIT : pose === 'accepted' ? ACCEPTED_LIT : pose === 'declined' ? DECLINED_LIT : null;
  for (let i = 0; i < CANDLE_COUNT; i++) out.litTime[i] = burnt ? burnt[i]! : 0;
  out.cakeDip = out.cakeTiltX = out.cakeTiltZ = 0;
  setAll(out.flameScale, lit);
  setAll(out.flameOpacity, lit);
  setAll(out.flameLean, 0);
  setAll(out.flameStretch, 0);
  out.wickLean = 0;
  setAll(out.wispOpacity, 0);
  setAll(out.wispRise, 0);
  setAll(out.wispGrow, 1);
  out.binPos.copy(pose === 'declined' ? BIN_AT : BIN_FROM);
  out.binVisible = pose === 'declined';
  out.flaps = 0;
  return out;
}

// ── Host: 1.3 s ───────────────────────────────────────────────────────────────

/** Cubic Hermite on u ∈ [0, 1] from p0 (tangent m0) to p1 (tangent m1), tangents per unit u. */
const hermite = (u: number, p0: number, m0: number, p1: number, m1: number) => {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
};

/**
 * Height of a candle above its seat, `tau` seconds after it starts lowering (v1.5).
 * Approach: cubic Hermite from rest at CANDLE_HOVER to first contact (the base CANDLE.insert above
 * the seat, at the buttercream's surface), arriving at CANDLE_CONTACT_SPEED: the hand gathers
 * speed and slows again as it nears the cake. Push-in: v = −v₀(1 − u²), u = s / CANDLE_PRESS: the
 * buttercream's resistance grows with depth, so the candle decelerates harder the deeper it goes
 * and stops exactly at the seat (C1 at contact and at the stop; frosting is plastic: no rebound).
 */
export function candleDrop(tau: number): number {
  if (tau <= 0) return CANDLE_HOVER;
  if (tau < CANDLE_DESCENT) {
    const u = tau / CANDLE_DESCENT;
    return hermite(u, CANDLE_HOVER, 0, CANDLE.insert, -CANDLE_CONTACT_SPEED * CANDLE_DESCENT);
  }
  const s = tau - CANDLE_DESCENT;
  if (s >= CANDLE_PRESS) return 0;
  const u = s / CANDLE_PRESS;
  return CANDLE.insert - CANDLE_CONTACT_SPEED * CANDLE_PRESS * (u - (u * u * u) / 3);
}

/** How far a candle at `drop` above its seat has been pushed in (0 at the surface or above – 1 seated). */
export const pressOf = (drop: number) => Math.min(1, Math.max(0, 1 - drop / CANDLE.insert));

/**
 * The push on the cake from candle i at time t (host), as a fraction of a full push: it builds
 * over the first 12 ms of contact to 35 %, grows with depth to 100 % as the resistance does, and
 * goes as the hand lets go (CAKE_LOAD.release).
 */
function push(i: number, t: number): number {
  const contact = CANDLE_START[i]! + CANDLE_DESCENT, end = contact + CANDLE_PRESS;
  if (t <= contact) return 0;
  if (t < end) return 0.35 * smoothstep(seg(t, contact, contact + 0.012)) + 0.65 * seg(t, contact, end);
  return 1 - smoothstep(seg(t, end, end + CAKE_LOAD.release));
}

/**
 * The cake's give (dip, tilt about x, tilt about z): each a damped oscillator (CAKE_LOAD) driven
 * by the pushes, integrated once (RK4, 0.25 ms) into a Hermite-sampled table, faded to exactly 0
 * before the end of the host beat so guest-ready is exact.
 */
const LOAD_DT = 1 / 4000;
const LOAD_FADE = [1.04, 1.2] as const;
const LOAD_TABLE = (() => {
  const w = 2 * Math.PI * CAKE_LOAD.hz, z = CAKE_LOAD.zeta;
  const rs = Math.hypot(...CANDLE_SOCKETS[0]!);
  const target = (t: number): [number, number, number] => {
    let y = 0, ax = 0, az = 0;
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const f = push(i, t);
      if (!f) continue;
      const [sx, sz] = CANDLE_SOCKETS[i]!;
      y -= CAKE_LOAD.dip * f;
      // A push at +z tips the +z side down (rotation about +x); at +x, rotation about −z.
      ax += CAKE_LOAD.tilt * f * (sz / rs);
      az -= CAKE_LOAD.tilt * f * (sx / rs);
    }
    return [y, ax, az];
  };
  const n = Math.round(DURATIONS.host / LOAD_DT);
  const ch = [0, 1, 2].map(() => ({ x: new Float64Array(n + 1), v: new Float64Array(n + 1) }));
  for (let c = 0; c < 3; c++) {
    const { x, v } = ch[c]!;
    const f = (t: number, xx: number, vv: number): [number, number] => [vv, -2 * z * w * vv - w * w * (xx - target(t)[c]!)];
    for (let k = 0; k < n; k++) {
      const t = k * LOAD_DT, h = LOAD_DT;
      const a = f(t, x[k]!, v[k]!);
      const b = f(t + h / 2, x[k]! + (h / 2) * a[0], v[k]! + (h / 2) * a[1]);
      const cc = f(t + h / 2, x[k]! + (h / 2) * b[0], v[k]! + (h / 2) * b[1]);
      const d = f(t + h, x[k]! + h * cc[0], v[k]! + h * cc[1]);
      x[k + 1] = x[k]! + (h / 6) * (a[0] + 2 * b[0] + 2 * cc[0] + d[0]);
      v[k + 1] = v[k]! + (h / 6) * (a[1] + 2 * b[1] + 2 * cc[1] + d[1]);
    }
  }
  return { ch, n };
})();

/** The cake's give at host time t: [dip, tilt x, tilt z]. */
export function cakeLoad(t: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  if (t <= 0 || t >= LOAD_FADE[1]) { out[0] = out[1] = out[2] = 0; return out; }
  const x = t / LOAD_DT;
  const k = Math.min(Math.floor(x), LOAD_TABLE.n - 1);
  const u = x - k;
  const fadeK = 1 - smoothstep(seg(t, LOAD_FADE[0], LOAD_FADE[1]));
  for (let c = 0; c < 3; c++) {
    const { x: xs, v } = LOAD_TABLE.ch[c]!;
    out[c] = hermite(u, xs[k]!, v[k]! * LOAD_DT, xs[k + 1]!, v[k + 1]! * LOAD_DT) * fadeK;
  }
  return out;
}

// ── Flames and lit time ───────────────────────────────────────────────────────
/** Flame size (0–1) of candle i in each sequence: the one place the flame curves live. */
export function flameScaleOf(sequence: SequenceName, i: number, t: number): number {
  if (sequence === 'host') return smoothstep(seg(t, FLAME_START[i]!, FLAME_START[i]! + FLAME_RISE));
  if (sequence === 'accept') return 1 - easeInQuad(seg(t, OUT_START[i]!, OUT_START[i]! + OUT_LEN));
  return 1 - smoothstep(seg(t, 0.02, 0.18));
}

/**
 * ∫ flameScale dt per sequence and candle, tabulated at 0.5 ms (trapezoid on the exact curve) and
 * sampled with Hermite tangents = flameScale itself, so lit time is C1. The melt runs on lit time:
 * a flame drives it in proportion to its size, and after the blow it stops (the melt freezes).
 */
const LIT_DT = 1 / 2000;
const LIT_TABLES = (['host', 'accept', 'decline'] as const).map((seq) =>
  Array.from({ length: CANDLE_COUNT }, (_, i) => {
    const n = Math.round(DURATIONS[seq] / LIT_DT);
    const acc = new Float64Array(n + 1), f = new Float64Array(n + 1);
    f[0] = flameScaleOf(seq, i, 0);
    for (let k = 0; k < n; k++) {
      // Simpson on each step (the curves are smooth inside it).
      const a = k * LIT_DT;
      f[k + 1] = flameScaleOf(seq, i, a + LIT_DT);
      acc[k + 1] = acc[k]! + (LIT_DT / 6) * (f[k]! + 4 * flameScaleOf(seq, i, a + LIT_DT / 2) + f[k + 1]!);
    }
    return { acc, f, n };
  }),
);
const seqIndex = { host: 0, accept: 1, decline: 2 } as const;

/** Seconds candle i has burnt (flame-weighted) from the start of `sequence` to t. */
function litDuring(sequence: SequenceName, i: number, t: number): number {
  const tab = LIT_TABLES[seqIndex[sequence]]![i]!;
  const x = Math.min(Math.max(t, 0), DURATIONS[sequence]) / LIT_DT;
  const k = Math.min(Math.floor(x), tab.n - 1);
  const u = x - k;
  return hermite(u, tab.acc[k]!, tab.f[k]! * LIT_DT, tab.acc[k + 1]!, tab.f[k + 1]! * LIT_DT);
}

/** Lit seconds at the canonical poses: guest-ready (end of host), accepted, declined. */
export const GUEST_READY_LIT = Array.from({ length: CANDLE_COUNT }, (_, i) => litDuring('host', i, DURATIONS.host));
export const ACCEPTED_LIT = GUEST_READY_LIT.map((g, i) => g + litDuring('accept', i, DURATIONS.accept));
export const DECLINED_LIT = GUEST_READY_LIT.map((g, i) => g + litDuring('decline', i, DURATIONS.decline));

/** Candle i's lit time at time t of a sequence (the clip's part; the scene adds the live part). */
export function litTime(sequence: SequenceName, i: number, t: number): number {
  return sequence === 'host' ? litDuring('host', i, t) : GUEST_READY_LIT[i]! + litDuring(sequence, i, t);
}

const LOAD = [0, 0, 0] as [number, number, number];

function host(t: number, out: BirthdayFrame): void {
  frameFor('guest-ready', out);
  // 0–0.20: the cake presents, turning square to the camera.
  out.cakeYaw = lerp(PRESENT_YAW, 0, EASE.travel(seg(t, 0, 0.2)));
  for (let i = 0; i < CANDLE_COUNT; i++) {
    // 0.18–0.89: six candles brought down 55 ms apart and pushed into the buttercream.
    out.drop[i] = candleDrop(t - CANDLE_START[i]!);
    out.press[i] = pressOf(out.drop[i]!);
    out.lean[i] = smoothstep(out.press[i]!);
    // 0.84–1.06: flames appear as a restrained scale/opacity rise, 20 ms apart, no overshoot.
    const k = flameScaleOf('host', i, t);
    out.flameScale[i] = k;
    out.flameOpacity[i] = k;
    out.litTime[i] = litTime('host', i, t);
  }
  [out.cakeDip, out.cakeTiltX, out.cakeTiltZ] = cakeLoad(t, LOAD);
  // 1.06–1.30: the guest-ready composition holds.
}

// ── Accept: 1.4 s ─────────────────────────────────────────────────────────────
function accept(t: number, out: BirthdayFrame): void {
  frameFor('guest-ready', out);
  // 0–0.25: a breath — every flame and wick leans the same way.
  const breath = EASE.lift(seg(t, 0, 0.25));
  // 1.00–1.40: wicks return to rest (C1 at both ends).
  out.wickLean = WICK_LEAN * breath * (1 - smoothstep(seg(t, 1, 1.4)));
  for (let i = 0; i < CANDLE_COUNT; i++) {
    // 0.25–0.595: each flame shrinks and goes out, left to right.
    const k = seg(t, OUT_START[i]!, OUT_START[i]! + OUT_LEN);
    // The gust is not steady: each flame flutters (FLAME_FLUTTER) about its lean, out of phase
    // with its neighbours. The dying flame bends further over as it shrinks (starting with zero
    // bend speed: C1), drawn out tall and thin by the breath.
    const flutter = 1 + FLAME_FLUTTER.amount * Math.sin(2 * Math.PI * FLAME_FLUTTER.hz * t + 1.9 * i);
    out.flameLean[i] = k >= 1 ? 0 : breath * flutter * (1 + 0.5 * k * k);
    out.flameStretch[i] = k >= 1 ? 0 : breath;
    out.flameScale[i] = flameScaleOf('accept', i, t);
    out.flameOpacity[i] = 1 - k * k * (1.5 - 0.5 * k);
    out.litTime[i] = litTime('accept', i, t);
    // 0.60–0.99: at most one faint wisp per candle, dissolving upward.
    const w = seg(t, WISP_START[i]!, WISP_START[i]! + WISP_LEN);
    out.wispOpacity[i] = w > 0 && w < 1 ? WISP_OPACITY * Math.sin(Math.PI * w) ** 2 : 0;
    // Rooted on the wick while it unfurls; lifts off only as it fades. Back to rest once the
    // wisp has dissolved (invisible), so the accepted pose is exact.
    out.wispRise[i] = w < 1 ? WISP_RISE * w * w * w : 0;
    out.wispGrow[i] = w > 0 && w < 1 ? WISP_GROW_FROM + (1 - WISP_GROW_FROM) * easeOutCubic(w) : 1;
  }
}

// ── Decline: 1.5 s ────────────────────────────────────────────────────────────
const FLAP_OPEN = cubicBezier(0.3, 0, 0.2, 1);
const DESCEND = cubicBezier(0.55, 0, 0.5, 1);
/**
 * Lift off the stand (CARRY_FROM–LIFT_TO, 0.21 s): a heavy take-off. It gathers speed over five
 * frames instead of two (v1.2 review: `EASE.lift` over 0.17 s reached its largest step at once;
 * peak step 128 mm a frame, was 153) and still clears the rim with the old margin as the carry
 * brings the cake over the bin. The bedded shell border rises before it moves across.
 */
const LIFT = cubicBezier(0.45, 0, 0.25, 1);
/** Soft close: the flaps swing shut to the damper's last sliver, which it then takes up slowly. */
const FLAP_GAP = 0.03;
/** Flap speed (fraction/s) as the damper catches them: the handover between the two closing pieces. */
const FLAP_CATCH = 0.25;

function flaps(t: number): number {
  if (t < 0.95) return FLAP_OPEN(seg(t, 0.08, 0.25));
  if (t < 1.2) return hermite(seg(t, 0.95, 1.2), 1, 0, FLAP_GAP, -FLAP_CATCH * 0.25);
  return hermite(seg(t, 1.2, 1.4), FLAP_GAP, -FLAP_CATCH * 0.2, 0, 0);
}

/** Plan carry (fraction of the stand → bin distance): smootherstep, so it sets off and arrives with zero acceleration. */
const carryAcross = (t: number) => {
  const u = seg(t, CARRY_FROM, CARRY_TO);
  return u * u * u * (u * (6 * u - 15) + 10);
};
/** Plan distance of the carry, stand axis to bin axis. */
const CARRY_DISTANCE = Math.hypot(HOVER_OVER_BIN.x - ON_STAND.x, HOVER_OVER_BIN.z - ON_STAND.z);

/** Horizontal axis the cake leans about: up × (stand → bin), so + lean tips its top towards the bin. */
export const LEAN_AXIS = new Vector3(0, 1, 0).cross(new Vector3(HOVER_OVER_BIN.x - ON_STAND.x, 0, HOVER_OVER_BIN.z - ON_STAND.z)).normalize();

/**
 * Pendulum lean table: θ'' + 2ζωθ' + ω²θ = −a(t), a = the carry's plan acceleration (closed
 * form), RK4 at 0.25 ms from rest at CARRY_FROM to DROP_TO. Stored with θ' so the Hermite sample
 * is C1; scaled so the peak is exactly LEAN_MAX. Deterministic: the same table on every load.
 */
const LEAN_DT = 1 / 4000;
const LEAN_TABLE = (() => {
  const w = 2 * Math.PI * CARRY_LEAN.hz, z = CARRY_LEAN.zeta, T = CARRY_TO - CARRY_FROM;
  const accel = (t: number) => {
    if (t <= CARRY_FROM || t >= CARRY_TO) return 0;
    const u = (t - CARRY_FROM) / T;
    return (CARRY_DISTANCE / (T * T)) * (60 * u - 180 * u * u + 120 * u * u * u);
  };
  const f = (t: number, th: number, v: number): [number, number] => [v, -2 * z * w * v - w * w * th - accel(t)];
  const n = Math.round((DROP_TO - CARRY_FROM) / LEAN_DT);
  const th = new Float64Array(n + 1), dth = new Float64Array(n + 1);
  for (let k = 0; k < n; k++) {
    const t = CARRY_FROM + k * LEAN_DT, h = LEAN_DT;
    const a = f(t, th[k]!, dth[k]!);
    const b = f(t + h / 2, th[k]! + (h / 2) * a[0], dth[k]! + (h / 2) * a[1]);
    const c = f(t + h / 2, th[k]! + (h / 2) * b[0], dth[k]! + (h / 2) * b[1]);
    const d = f(t + h, th[k]! + h * c[0], dth[k]! + h * c[1]);
    th[k + 1] = th[k]! + (h / 6) * (a[0] + 2 * b[0] + 2 * c[0] + d[0]);
    dth[k + 1] = dth[k]! + (h / 6) * (a[1] + 2 * b[1] + 2 * c[1] + d[1]);
  }
  // Peak of the faded lean, so the scaled result never exceeds LEAN_MAX.
  let peak = 0;
  for (let k = 0; k <= n; k++) peak = Math.max(peak, Math.abs(th[k]!) * leanFade(CARRY_FROM + k * LEAN_DT));
  const gain = LEAN_MAX / peak;
  for (let k = 0; k <= n; k++) { th[k] = th[k]! * gain; dth[k] = dth[k]! * gain; }
  return { th, dth, n };
})();

function leanFade(t: number): number {
  return 1 - smoothstep(seg(t, LEAN_FADE[0], LEAN_FADE[1]));
}

/** The carried cake's lean at time t (radians about LEAN_AXIS). */
export function carryLean(t: number): number {
  if (t <= CARRY_FROM || t >= LEAN_FADE[1]) return 0;
  const x = (t - CARRY_FROM) / LEAN_DT;
  const k = Math.min(Math.floor(x), LEAN_TABLE.n - 1);
  const u = x - k;
  const th = hermite(u, LEAN_TABLE.th[k]!, LEAN_TABLE.dth[k]! * LEAN_DT, LEAN_TABLE.th[k + 1]!, LEAN_TABLE.dth[k + 1]! * LEAN_DT);
  return th * leanFade(t);
}

function decline(t: number, out: BirthdayFrame): void {
  frameFor('guest-ready', out);
  // 0–0.25: the bin slides into the margin and opens; the flames go out.
  out.binVisible = t > 0;
  out.binPos.lerpVectors(BIN_FROM, BIN_AT, EASE.travel(seg(t, 0, 0.24)));
  setAll(out.flameScale, flameScaleOf('decline', 0, t));
  setAll(out.flameOpacity, out.flameScale[0]!);
  for (let i = 0; i < CANDLE_COUNT; i++) out.litTime[i] = litTime('decline', i, t);
  out.flaps = flaps(t);
  // 0.25–0.72: cake and candles are lifted off the stand (by 0.46), carried across and held over the
  // opening; the cake sways on its plate. 0.72–0.95: straight down through the opening (steadied);
  // the bin's front wall hides it.
  if (t < CARRY_FROM) out.cakePos.copy(ON_STAND);
  else if (t < CARRY_TO) {
    const u = carryAcross(t);
    out.cakePos.set(lerp(ON_STAND.x, HOVER_OVER_BIN.x, u), 0, lerp(ON_STAND.z, HOVER_OVER_BIN.z, u));
    out.cakePos.y = t < LIFT_TO ? lerp(ON_STAND.y, CARRY, LIFT(seg(t, CARRY_FROM, LIFT_TO))) : lerp(CARRY, HOVER_OVER_BIN.y, smoothstep(seg(t, LIFT_TO, CARRY_TO)));
  } else out.cakePos.lerpVectors(HOVER_OVER_BIN, DROPPED, DESCEND(seg(t, CARRY_TO, DROP_TO)));
  out.cakeLean = carryLean(t);
  out.cakeInBin = t >= CARRY_TO;
  // Once the flaps have closed over it, the hidden cake stops rendering.
  out.cakeVisible = t < 1.2;
}

export function sampleSequence(sequence: SequenceName, t: number, out: BirthdayFrame): BirthdayFrame {
  const tc = Math.min(Math.max(t, 0), DURATIONS[sequence]);
  if (sequence === 'host') host(tc, out);
  else if (sequence === 'accept') accept(tc, out);
  else decline(tc, out);
  return out;
}

export { LEAN };
