import { Vector3 } from 'three';
import { cubicBezier, EASE, easeInQuad, easeOutCubic, lerp, seg, smoothstep } from '../../motion/curves.ts';
import type { CanonicalPose, SequenceName } from '../../core/types.ts';
import {
  BIN_AT, BIN_FROM, CANDLE_COUNT, CANDLE_DESCENT, CANDLE_HOVER, CANDLE_LAND_SPEED, CANDLE_SETTLE, CANDLE_START, CARRY, CARRY_FROM, CARRY_LEAN, CARRY_TO,
  DROP_TO, DROPPED, DURATIONS, FLAME_RISE, FLAME_START, HOVER_OVER_BIN, LEAN, LEAN_FADE, LEAN_MAX, ON_STAND, OUT_LEN, OUT_START, PRESENT_YAW, WICK_LEAN,
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
  /** Each candle's height above its seated socket position (negative: pressed in while settling). */
  drop: number[];
  flameScale: number[];
  flameOpacity: number[];
  /** Breath lean amount (0–1+) applied as LEAN rotation to each flame. */
  flameLean: number[];
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
    cakePos: new Vector3(), cakeYaw: 0, cakeLean: 0, cakeVisible: true, drop: filled(0), flameScale: filled(1), flameOpacity: filled(1),
    flameLean: filled(0), wickLean: 0, wispOpacity: filled(0), wispRise: filled(0), wispGrow: filled(1), binPos: new Vector3(), binVisible: false, flaps: 0,
  });
}

const setAll = (a: number[], v: number) => a.fill(v);

export function frameFor(pose: CanonicalPose, out: BirthdayFrame): BirthdayFrame {
  const lit = pose === 'guest-ready' ? 1 : 0;
  out.cakePos.copy(pose === 'declined' ? DROPPED : ON_STAND);
  out.cakeYaw = pose === 'host-ready' ? PRESENT_YAW : 0;
  out.cakeLean = 0;
  out.cakeVisible = pose !== 'declined';
  setAll(out.drop, pose === 'host-ready' ? CANDLE_HOVER : 0);
  setAll(out.flameScale, lit);
  setAll(out.flameOpacity, lit);
  setAll(out.flameLean, 0);
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
const SETTLE_W = 2 * Math.PI * CANDLE_SETTLE.hz;
const SETTLE_WD = SETTLE_W * Math.sqrt(1 - CANDLE_SETTLE.zeta ** 2);

/**
 * Height of a candle above its socket, `tau` seconds after it starts lowering. Descent: cubic
 * Hermite from rest at CANDLE_HOVER to the socket, arriving at CANDLE_LAND_SPEED (a weighted
 * ease: it gathers speed and is still moving when it meets the buttercream). Settle: the
 * spring-damper response to that landing speed (starts at 0 with the same velocity, so C1 at
 * contact), its last millimetre faded to exactly 0 by the end of the settle.
 */
export function candleDrop(tau: number): number {
  if (tau <= 0) return CANDLE_HOVER;
  if (tau < CANDLE_DESCENT) {
    const u = tau / CANDLE_DESCENT;
    const m1 = -CANDLE_LAND_SPEED * CANDLE_DESCENT;
    return CANDLE_HOVER * (2 * u ** 3 - 3 * u * u + 1) + m1 * (u ** 3 - u * u);
  }
  const s = tau - CANDLE_DESCENT;
  if (s >= CANDLE_SETTLE.length) return 0;
  const press = -(CANDLE_LAND_SPEED / SETTLE_WD) * Math.exp(-CANDLE_SETTLE.zeta * SETTLE_W * s) * Math.sin(SETTLE_WD * s);
  return press * (1 - smoothstep(seg(s, 0.1, CANDLE_SETTLE.length)));
}

function host(t: number, out: BirthdayFrame): void {
  frameFor('guest-ready', out);
  // 0–0.20: the cake presents, turning square to the camera.
  out.cakeYaw = lerp(PRESENT_YAW, 0, EASE.travel(seg(t, 0, 0.2)));
  for (let i = 0; i < CANDLE_COUNT; i++) {
    // 0.18–0.94: six candles lower into their sockets, 55 ms apart, and settle.
    out.drop[i] = candleDrop(t - CANDLE_START[i]!);
    // 0.84–1.06: flames appear as a restrained scale/opacity rise, 20 ms apart, no overshoot.
    const k = smoothstep(seg(t, FLAME_START[i]!, FLAME_START[i]! + FLAME_RISE));
    out.flameScale[i] = k;
    out.flameOpacity[i] = k;
  }
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
    // The dying flame bends further over as it shrinks (starting with zero bend speed: C1).
    out.flameLean[i] = k >= 1 ? 0 : breath * (1 + 0.5 * k * k);
    out.flameScale[i] = 1 - easeInQuad(k);
    out.flameOpacity[i] = 1 - k * k * (1.5 - 0.5 * k);
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
/** Soft close: the flaps swing shut to the damper's last sliver, which it then takes up slowly. */
const FLAP_GAP = 0.03;
/** Flap speed (fraction/s) as the damper catches them: the handover between the two closing pieces. */
const FLAP_CATCH = 0.25;

/** Cubic Hermite on u ∈ [0, 1] from p0 (tangent m0) to p1 (tangent m1), tangents per unit u. */
const hermite = (u: number, p0: number, m0: number, p1: number, m1: number) => {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
};

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
  setAll(out.flameScale, 1 - smoothstep(seg(t, 0.02, 0.18)));
  setAll(out.flameOpacity, out.flameScale[0]!);
  out.flaps = flaps(t);
  // 0.25–0.72: cake and candles are lifted off the stand, carried across and held over the
  // opening; the cake sways on its plate. 0.72–0.95: straight down through the opening (steadied);
  // the bin's front wall hides it.
  if (t < CARRY_FROM) out.cakePos.copy(ON_STAND);
  else if (t < CARRY_TO) {
    const u = carryAcross(t);
    out.cakePos.set(lerp(ON_STAND.x, HOVER_OVER_BIN.x, u), 0, lerp(ON_STAND.z, HOVER_OVER_BIN.z, u));
    out.cakePos.y = t < 0.42 ? lerp(ON_STAND.y, CARRY, EASE.lift(seg(t, CARRY_FROM, 0.42))) : lerp(CARRY, HOVER_OVER_BIN.y, smoothstep(seg(t, 0.42, CARRY_TO)));
  } else out.cakePos.lerpVectors(HOVER_OVER_BIN, DROPPED, DESCEND(seg(t, CARRY_TO, DROP_TO)));
  out.cakeLean = carryLean(t);
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
