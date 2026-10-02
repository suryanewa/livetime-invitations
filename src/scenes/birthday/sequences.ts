import { Vector3 } from 'three';
import { cubicBezier, EASE, lerp, seg, smoothstep } from '../../motion/curves.ts';
import type { CanonicalPose, SequenceName } from '../../core/types.ts';
import { CANDLE, CANDLE_SOCKETS } from '../../../models/birthdayContract.ts';
import {
  ACROSS_FROM, BIN_AT, BIN_DELAY, BIN_DROP_G, BIN_FROM, CAKE_LOAD, CANDLE_COUNT, CANDLE_HOVER, CANDLE_SEATED, CANDLE_START, CARRY, CARRY_FROM,
  CARRY_LEAN, CARRY_TO, DROPPED, DURATIONS, FLAPS_CLOSE, HOVER_OVER_BIN, LEAN_FADE, LEAN_MAX, LIFT_TO, ON_STAND, PRESENT_YAW,
} from './poses.ts';
import { burnRate, flameState, type FlameState, litFlame, newFlameState, noFlame } from './fire.ts';
import { candleDrop, pressOf, push } from './placement.ts';
import { BIN_CLOSE, dropHeight, flapsClosing } from '../../../models/disposalBin.ts';

/**
 * Pure authored choreography for Birthday: every value is a function of time (the carry lean is
 * a damped pendulum integrated once, at module load, into a table sampled with cubic Hermite
 * interpolation), so replay and reversal restore cake, candles, flames, smoke and bin exactly, and
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
   * Seconds each candle has burnt, weighted by its flame (∫ burnRate dt over the clip, fire.ts:
   * radiant output × size; the canonical poses carry the clip's totals). The melt (melt.ts) is a
   * pure function of it.
   */
  litTime: number[];
  /**
   * Seconds since each candle's flame went out (0 while it burns, or before it was lit): its
   * molten pool and run set (melt.ts solidify), on the clip; the scene adds the live part.
   */
  cool: number[];
  /** The cake's give under the pushes (host): its underside centre's dip (units, ≤ 0) and tilt (radians about x and z). */
  cakeDip: number;
  cakeTiltX: number;
  cakeTiltZ: number;
  /** Each candle's authored flame (fire.ts): ignition, the breath, extinction. Flicker rides on top. */
  flames: FlameState[];
  /**
   * Accept time at which the ember and smoke are sampled (−1: none). A secondary channel: the
   * canonical poses carry none, and after the accept sequence the scene's live clock continues it.
   */
  smokeTime: number;
  binPos: Vector3;
  binVisible: boolean;
  /** Flap opening fraction (0 closed, 1 open). */
  flaps: number;
}

const filled = (v: number) => Array.from({ length: CANDLE_COUNT }, () => v);

export function newFrame(): BirthdayFrame {
  return frameFor('guest-ready', {
    cakePos: new Vector3(), cakeYaw: 0, cakeLean: 0, cakeVisible: true, cakeInBin: false, drop: filled(0), press: filled(1), lean: filled(1), litTime: filled(0), cool: filled(0),
    cakeDip: 0, cakeTiltX: 0, cakeTiltZ: 0, flames: Array.from({ length: CANDLE_COUNT }, () => newFlameState()), smokeTime: -1,
    binPos: new Vector3(), binVisible: false, flaps: 0,
  });
}

const setAll = (a: number[], v: number) => a.fill(v);

export function frameFor(pose: CanonicalPose, out: BirthdayFrame): BirthdayFrame {
  out.cakePos.copy(pose === 'declined' ? DROPPED : ON_STAND);
  out.cakeYaw = pose === 'host-ready' ? PRESENT_YAW : 0;
  out.cakeLean = 0;
  out.cakeVisible = pose !== 'declined';
  out.cakeInBin = pose === 'declined';
  setAll(out.drop, pose === 'host-ready' ? CANDLE_HOVER : 0);
  setAll(out.press, pose === 'host-ready' ? 0 : 1);
  setAll(out.lean, pose === 'host-ready' ? 0 : 1);
  const burnt = pose === 'guest-ready' ? GUEST_READY_LIT : pose === 'accepted' ? ACCEPTED_LIT : pose === 'declined' ? DECLINED_LIT : null;
  for (let i = 0; i < CANDLE_COUNT; i++) {
    out.litTime[i] = burnt ? burnt[i]! : 0;
    out.cool[i] = pose === 'accepted' ? DURATIONS.accept - OUT_ACCEPT[i]! : pose === 'declined' ? DURATIONS.decline - OUT_DECLINE[i]! : 0;
  }
  out.cakeDip = out.cakeTiltX = out.cakeTiltZ = 0;
  for (const f of out.flames) (pose === 'guest-ready' ? litFlame : noFlame)(f);
  out.smokeTime = -1;
  out.binPos.copy(pose === 'declined' ? BIN_AT : BIN_FROM);
  out.binVisible = pose === 'declined';
  out.flaps = 0;
  return out;
}

// ── Host (≈ 2.45 s) ───────────────────────────────────────────────────────────────

/** Cubic Hermite on u ∈ [0, 1] from p0 (tangent m0) to p1 (tangent m1), tangents per unit u. */
const hermite = (u: number, p0: number, m0: number, p1: number, m1: number) => {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
};

export { candleDrop, pressOf } from './placement.ts';

/**
 * The cake's give (dip, tilt about x, tilt about z): each a damped oscillator (CAKE_LOAD) driven
 * by the pushes, integrated once (RK4, 0.25 ms) into a Hermite-sampled table, faded to exactly 0
 * before the end of the host beat so guest-ready is exact.
 */
const LOAD_DT = 1 / 4000;
/** The ring-down is faded to exactly 0 after the last push (≈ 0.3 s, 3 periods) and before the beat ends. */
const LOAD_FADE = [Math.max(...CANDLE_SEATED) + 0.28, Math.max(...CANDLE_SEATED) + 0.5] as const;
const LOAD_TABLE = (() => {
  const w = 2 * Math.PI * CAKE_LOAD.hz, z = CAKE_LOAD.zeta;
  const rs = Math.hypot(...CANDLE_SOCKETS[0]!);
  const target = (t: number): [number, number, number] => {
    let y = 0, ax = 0, az = 0;
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const f = push(i, t, CAKE_LOAD.release);
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
/**
 * How hard candle i's flame heats its wax in each sequence (0–1): the fire's burn rate (fire.ts
 * burnRate: radiant output × size, from ignition through the breath to the real extinction of each
 * candle). The flame curves themselves live in fire.ts; this is the one place the melt reads them.
 */
export function flameScaleOf(sequence: SequenceName, i: number, t: number): number {
  return burnRate(i, t, sequence);
}

/**
 * ∫ burnRate dt per sequence and candle, tabulated at 0.5 ms (Simpson on the exact curve) and
 * sampled with Hermite tangents = the rate itself, so lit time is C1. The melt runs on lit time:
 * a flame drives it in proportion to its output and size, and after the blow it stops (the melt
 * freezes).
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

/** When each flame is out for good in accept and decline (s): the last instant its burn rate is above 0. */
function outTimes(sequence: 'accept' | 'decline'): number[] {
  return Array.from({ length: CANDLE_COUNT }, (_, i) => {
    for (let ms = Math.round(DURATIONS[sequence] * 1000); ms >= 0; ms--) if (flameScaleOf(sequence, i, ms / 1000) > 0) return (ms + 1) / 1000;
    return 0;
  });
}
export const OUT_ACCEPT = outTimes('accept');
export const OUT_DECLINE = outTimes('decline');

/** Seconds since candle i's flame went out, at time t of a sequence (0 in host: still burning). */
export function coolTime(sequence: SequenceName, i: number, t: number): number {
  if (sequence === 'host') return 0;
  return Math.max(0, t - (sequence === 'accept' ? OUT_ACCEPT : OUT_DECLINE)[i]!);
}

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
    out.drop[i] = candleDrop(t - CANDLE_START[i]!, i);
    out.press[i] = pressOf(out.drop[i]!);
    out.lean[i] = smoothstep(out.press[i]!);
    // 0.84–1.28: each wick catches once its candle has seated and its flame grows (fire.ts).
    flameState(i, t, 'host', out.flames[i]);
    out.litTime[i] = litTime('host', i, t);
  }
  [out.cakeDip, out.cakeTiltX, out.cakeTiltZ] = cakeLoad(t, LOAD);
  // 1.28–1.30: the guest-ready composition holds.
}

// ── Accept: 1.4 s ─────────────────────────────────────────────────────────────
function accept(t: number, out: BirthdayFrame): void {
  frameFor('guest-ready', out);
  // 0.06–0.55: the guest's breath sweeps the cake; each flame leans, necks, lifts off and goes out
  // from the base up, nearest the mouth first (fire.ts). Its last gas becomes the first smoke.
  for (let i = 0; i < CANDLE_COUNT; i++) {
    flameState(i, t, 'accept', out.flames[i]);
    out.litTime[i] = litTime('accept', i, t);
    out.cool[i] = coolTime('accept', i, t);
  }
  out.smokeTime = t;
}

// ── Decline: 1.5 s ────────────────────────────────────────────────────────────
const FLAP_OPEN = cubicBezier(0.3, 0, 0.2, 1);
/**
 * Lift off the stand (CARRY_FROM–LIFT_TO, 0.36 s, 32 cm up to clear the real bin's rim): a heavy
 * take-off on a smootherstep, gathering speed over several frames (v1.2 review: no two-frame
 * launch; its peak step stays under 135 mm a frame) and leaving with zero velocity into the
 * carry's settle to the hover height. The bedded shell border rises before it moves across.
 */
const LIFT = (u: number) => u * u * u * (u * (6 * u - 15) + 10);

/** Flaps: open as the bin arrives; from FLAPS_CLOSE (the cake is below the rim) the bin's soft close. */
const FLAPS_GAP_AT = FLAPS_CLOSE + BIN_CLOSE.toGap;
function flaps(t: number): number {
  if (t < FLAPS_CLOSE) return FLAP_OPEN(seg(t, BIN_DELAY + 0.08, BIN_DELAY + 0.25));
  return flapsClosing(t - FLAPS_CLOSE);
}

/** Plan carry (fraction of the stand → bin distance): smootherstep, so it sets off and arrives with zero acceleration. */
const carryAcross = (t: number) => {
  const u = seg(t, ACROSS_FROM, CARRY_TO);
  return u * u * u * (u * (6 * u - 15) + 10);
};
/** Plan distance of the carry, stand axis to bin axis. */
const CARRY_DISTANCE = Math.hypot(HOVER_OVER_BIN.x - ON_STAND.x, HOVER_OVER_BIN.z - ON_STAND.z);

/** Horizontal axis the cake leans about: up × (stand → bin), so + lean tips its top towards the bin. */
export const LEAN_AXIS = new Vector3(0, 1, 0).cross(new Vector3(HOVER_OVER_BIN.x - ON_STAND.x, 0, HOVER_OVER_BIN.z - ON_STAND.z)).normalize();

/**
 * Pendulum lean table: θ'' + 2ζωθ' + ω²θ = −a(t), a = the carry's plan acceleration (closed
 * form), RK4 at 0.25 ms from rest at ACROSS_FROM to the end of LEAN_FADE. Stored with θ' so the
 * Hermite sample is C1; scaled so the peak is exactly LEAN_MAX. Deterministic: the same table on
 * every load.
 */
const LEAN_DT = 1 / 4000;
const LEAN_TABLE = (() => {
  const w = 2 * Math.PI * CARRY_LEAN.hz, z = CARRY_LEAN.zeta, T = CARRY_TO - ACROSS_FROM;
  const accel = (t: number) => {
    if (t <= ACROSS_FROM || t >= CARRY_TO) return 0;
    const u = (t - ACROSS_FROM) / T;
    return (CARRY_DISTANCE / (T * T)) * (60 * u - 180 * u * u + 120 * u * u * u);
  };
  const f = (t: number, th: number, v: number): [number, number] => [v, -2 * z * w * v - w * w * th - accel(t)];
  const n = Math.round((LEAN_FADE[1] - ACROSS_FROM) / LEAN_DT);
  const th = new Float64Array(n + 1), dth = new Float64Array(n + 1);
  for (let k = 0; k < n; k++) {
    const t = ACROSS_FROM + k * LEAN_DT, h = LEAN_DT;
    const a = f(t, th[k]!, dth[k]!);
    const b = f(t + h / 2, th[k]! + (h / 2) * a[0], dth[k]! + (h / 2) * a[1]);
    const c = f(t + h / 2, th[k]! + (h / 2) * b[0], dth[k]! + (h / 2) * b[1]);
    const d = f(t + h, th[k]! + h * c[0], dth[k]! + h * c[1]);
    th[k + 1] = th[k]! + (h / 6) * (a[0] + 2 * b[0] + 2 * c[0] + d[0]);
    dth[k + 1] = dth[k]! + (h / 6) * (a[1] + 2 * b[1] + 2 * c[1] + d[1]);
  }
  // Peak of the faded lean, so the scaled result never exceeds LEAN_MAX.
  let peak = 0;
  for (let k = 0; k <= n; k++) peak = Math.max(peak, Math.abs(th[k]!) * leanFade(ACROSS_FROM + k * LEAN_DT));
  const gain = LEAN_MAX / peak;
  for (let k = 0; k <= n; k++) { th[k] = th[k]! * gain; dth[k] = dth[k]! * gain; }
  return { th, dth, n };
})();

function leanFade(t: number): number {
  return 1 - smoothstep(seg(t, LEAN_FADE[0], LEAN_FADE[1]));
}

/** The carried cake's lean at time t (radians about LEAN_AXIS). */
export function carryLean(t: number): number {
  if (t <= ACROSS_FROM || t >= LEAN_FADE[1]) return 0;
  const x = (t - ACROSS_FROM) / LEAN_DT;
  const k = Math.min(Math.floor(x), LEAN_TABLE.n - 1);
  const u = x - k;
  const th = hermite(u, LEAN_TABLE.th[k]!, LEAN_TABLE.dth[k]! * LEAN_DT, LEAN_TABLE.th[k + 1]!, LEAN_TABLE.dth[k + 1]! * LEAN_DT);
  return th * leanFade(t);
}

function decline(t: number, out: BirthdayFrame): void {
  frameFor('guest-ready', out);
  // 0–0.25: the flames are snuffed (fire.ts) and the camera starts easing back (framing.ts
  // DECLINE_PULL); 0.12–0.37: the bin slides into the room it has made and opens (BIN_DELAY).
  out.binVisible = t > 0;
  out.binPos.lerpVectors(BIN_FROM, BIN_AT, EASE.travel(seg(t, BIN_DELAY, BIN_DELAY + 0.24)));
  for (let i = 0; i < CANDLE_COUNT; i++) {
    flameState(i, t, 'decline', out.flames[i]);
    out.litTime[i] = litTime('decline', i, t);
    out.cool[i] = coolTime('decline', i, t);
  }
  out.flaps = flaps(t);
  // 0.22–0.76: cake and candles are lifted off the stand (by 0.58), carried across from 0.39 and
  // brought to rest over the opening, steadied on its plate. 0.76: let go, it falls into the bin
  // (gravity) and the bin's front wall hides it; it is below the rim by 0.99 s.
  if (t < CARRY_FROM) out.cakePos.copy(ON_STAND);
  else if (t < CARRY_TO) {
    const u = carryAcross(t);
    out.cakePos.set(lerp(ON_STAND.x, HOVER_OVER_BIN.x, u), 0, lerp(ON_STAND.z, HOVER_OVER_BIN.z, u));
    out.cakePos.y = t < LIFT_TO ? lerp(ON_STAND.y, CARRY, LIFT(seg(t, CARRY_FROM, LIFT_TO))) : lerp(CARRY, HOVER_OVER_BIN.y, smoothstep(seg(t, LIFT_TO, CARRY_TO)));
  } else out.cakePos.set(HOVER_OVER_BIN.x, dropHeight(HOVER_OVER_BIN.y, DROPPED.y, t - CARRY_TO, BIN_DROP_G), HOVER_OVER_BIN.z);
  out.cakeLean = carryLean(t);
  out.cakeInBin = t >= CARRY_TO;
  // Once the flaps have closed over it, the hidden cake stops rendering.
  out.cakeVisible = t < FLAPS_GAP_AT;
}

export function sampleSequence(sequence: SequenceName, t: number, out: BirthdayFrame): BirthdayFrame {
  const tc = Math.min(Math.max(t, 0), DURATIONS[sequence]);
  if (sequence === 'host') host(tc, out);
  else if (sequence === 'accept') accept(tc, out);
  else decline(tc, out);
  return out;
}

