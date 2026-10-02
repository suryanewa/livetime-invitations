import { CANDLE, CANDLE_COUNT, CANDLE_SOCKETS } from '../../../models/birthdayContract.ts';
import { CAMERA_ANGLES } from '../../render/camera.ts';
import type { SequenceName } from '../../core/types.ts';

/**
 * Birthday fire (v1.5): candle flames and the smoke that follows them, as pure functions of time
 * with a fixed seed per candle. Nothing here keeps state: the scene composes these into its frame
 * (sequences.ts, index.ts), `simulate` only advances the clocks they are sampled at.
 *
 * Physics, in real units first (1 scene unit = 20 cm, so 1 mm = 0.005 units, 1 m/s = 5 units/s):
 *
 * - **The flame** is a laminar diffusion flame on a thin braided wick. Sunderland et al. (Proc.
 *   Combust. Inst. 33, 2011) measured paraffin candles on ≈1.1 mm wicks: flame length from the
 *   pool Lf = 3.85·L^0.634 mm and width at the wick top Wf = 3.38·L^0.201 mm for an exposed wick
 *   L. The master's wick stands 4.2 mm above the candle top: Lf ≈ 10 mm, Wf ≈ 4.5 mm. Birthday
 *   candles' twisted wicks curl into the flame and burn a little larger, so the steady flame here
 *   is 13 mm from its base (1 mm above the pool, where the blue cup attaches to the wick) to the
 *   tip, 5 mm wide at the wick top, where it is widest (FLAME_REST).
 * - **Flicker.** Still air: a steady teardrop with a buoyant (toroidal-vortex) oscillation at
 *   10–12 Hz (Kitahata et al. 2009; Okamoto et al., Sci. Rep. 6:36145, 11.0 ± 0.4 Hz) of small
 *   amplitude, plus the slow lean of room drafts (FLICKER).
 * - **The breath** is a round jet from the guest's mouth on the camera side, front-left of the
 *   cake (BREATH). Its velocity at each candle falls off as 1/distance (a round jet) and arrives
 *   as a smooth pulse. A flame leans with the flow at atan(U / w_b) (w_b: the flame gas's own
 *   buoyant velocity), is drawn out and thinned, necks at its base, lifts off the wick when the
 *   flow exceeds the base's anchoring speed, and goes out from the base up over 100–200 ms while
 *   the detached gas is carried downstream and cools: yellow, orange, dull red (Planck), dark.
 * - **Smoke.** The glowing wick keeps vaporising wax for a few seconds; the vapour condenses into
 *   a white-grey aerosol a millimetre above the ember. Its streakline is a buoyant point-source
 *   plume, w ∝ (F/z)^(1/3): ≈0.4 m/s a few centimetres up, slowing with height. It is laminar for
 *   its first ≈7 cm, then sinuous waves grow, fold into curls and the thread splits and widens into
 *   wisps that fade. The extinguished flame's last soot is the first smoke: the dying flame body
 *   becomes the head of the same streakline, so flame and smoke are one continuous thread.
 */

// ── Units ────────────────────────────────────────────────────────────────────
/** Scene units per millimetre (1 unit = 20 cm). */
export const MM = 0.005;
/** Scene units per second for 1 m/s. */
export const MPS = 5;

/** Deterministic hash → [0, 1) for candle `i`, stream `k`. */
export function rand(i: number, k: number): number {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(k + 7, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const signed = (i: number, k: number) => rand(i, k) * 2 - 1;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** C¹ ramp. */
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
/** C² ramp. */
const smoother = (x: number) => { const t = clamp01(x); return Math.min(1, t * t * t * (t * (6 * t - 15) + 10)); };

// ── The steady flame (candle_NN space; FLAME_REST.base etc. are heights above the candle base) ──
/** Candle top (the wax pool) and wick tip, heights in candle_NN space. */
export const POOL_Y = CANDLE.height;
export const WICK_TIP_Y = CANDLE.wickBase + CANDLE.wickHeight;

export const FLAME_REST = {
  /** Bottom of the blue cup: 1 mm above the pool (the lowest ≈20 % of a thin wick is quenched). */
  base: POOL_Y + 1.0 * MM,
  /** Base to tip: 13 mm, so the tip is 14 mm above the pool. */
  length: 13 * MM,
  /** Half the widest width (5 mm). */
  radius: 2.5 * MM,
  /** Where it is widest (at the wick top), as a fraction of its length. */
  widest: (WICK_TIP_Y - (POOL_Y + 1.0 * MM)) / (13 * MM),
} as const;

/** Visible flame top above the candle base at rest. */
export const FLAME_REST_TOP = FLAME_REST.base + FLAME_REST.length;

/**
 * Radius profile of the steady flame along its length (s: 0 base → 1 tip), 1 at its widest:
 * an elliptical cup below the wick top and a slightly convex ogive to a sharp tip above it.
 * The shader (src/render/flame.ts) evaluates the same function.
 */
export function flameProfile(s: number, widest = FLAME_REST.widest): number {
  if (s <= 0 || s >= 1) return 0;
  if (s < widest) {
    const u = (widest - s) / widest;
    return Math.sqrt(Math.max(0, 1 - u * u));
  }
  const u = (s - widest) / (1 - widest);
  return Math.pow(1 - u, 0.75) * (1 + 0.5 * u);
}

// ── Live flicker (the only part `simulate` drives: a clock) ──────────────────
export const FLICKER = {
  /** Buoyant flicker of a single candle in still air (10–12 Hz); per-candle detune ±4 %. */
  hz: 11,
  detune: 0.04,
  /** Peak length change of the flicker (≈±3 %): a still-air flame is steady to the eye. */
  amplitude: 0.03,
  /** Room-draft sway: ±1.5° at 0.2–0.7 Hz. */
  sway: (1.5 * Math.PI) / 180,
  /** Gain ramp after settle() (seconds): flicker resumes without a pop. */
  resume: 0.35,
} as const;

export interface Flicker {
  /** Length and width multipliers, radiant output multiplier. */
  height: number;
  width: number;
  intensity: number;
  /** Small tilt from room drafts (radians), as a vector in the cake's plan (x, z). */
  swayX: number;
  swayZ: number;
  /** Phase of the travelling varicose wave (radians), for the shader's shimmer. */
  phase: number;
}

/**
 * Flicker of candle `i` at live time `t` (seconds of lit time on the scene's live clock), scaled
 * by `gain` (0 after settle(), 1 when running). Band-limited: a few detuned sines with slowly
 * modulated amplitude, so it never repeats visibly and has no frequency content above ≈13 Hz.
 */
export function flicker(i: number, t: number, gain: number, out: Flicker): Flicker {
  const f = FLICKER.hz * (1 + FLICKER.detune * signed(i, 1));
  const p1 = 6.283 * rand(i, 2), p2 = 6.283 * rand(i, 3), p3 = 6.283 * rand(i, 4);
  // Slow amplitude modulation: the flicker swells and calms over a few seconds.
  const env = 0.55 + 0.25 * Math.sin(2 * Math.PI * 0.27 * t + p2) + 0.2 * Math.sin(2 * Math.PI * 0.61 * t + p3);
  const osc = 0.7 * Math.sin(2 * Math.PI * f * t + p1) + 0.3 * Math.sin(2 * Math.PI * f * 0.53 * t + p2);
  const dh = FLICKER.amplitude * env * osc * gain;
  out.height = 1 + dh;
  // Nearly incompressible: a taller flame is a little thinner.
  out.width = 1 - 0.45 * dh;
  out.intensity = 1 + 0.7 * dh;
  const s1 = Math.sin(2 * Math.PI * 0.23 * t + p3) * 0.6 + Math.sin(2 * Math.PI * 0.67 * t + p1) * 0.4;
  const s2 = Math.sin(2 * Math.PI * 0.19 * t + p1) * 0.6 + Math.sin(2 * Math.PI * 0.53 * t + p2) * 0.4;
  out.swayX = FLICKER.sway * s1 * gain;
  out.swayZ = FLICKER.sway * s2 * gain;
  out.phase = 2 * Math.PI * f * t + p1;
  return out;
}

export function newFlicker(): Flicker {
  return { height: 1, width: 1, intensity: 1, swayX: 0, swayZ: 0, phase: 0 };
}

// ── Ignition (host) ──────────────────────────────────────────────────────────
/**
 * Each wick catches 20 ms after the last (the existing cascade, 0.84 s onwards) and its flame
 * grows from a small blue bead to the steady teardrop over IGNITE: a lit wick takes a moment to
 * draw molten wax up and the soot (yellow) zone appears only once the flame is large enough.
 */
export const IGNITE_START = Array.from({ length: CANDLE_COUNT }, (_, i) => 0.84 + 0.02 * i);
export const IGNITE = 0.34;

// ── Breath (accept) ──────────────────────────────────────────────────────────
const AZ = (CAMERA_ANGLES.azimuthDeg * Math.PI) / 180;
/** Camera's horizontal direction from the cake (towards the guest) and screen-right, in plan (x, z). */
const TOWARD_CAMERA = [Math.sin(AZ), Math.cos(AZ)] as const;
const SCREEN_RIGHT = [Math.cos(AZ), -Math.sin(AZ)] as const;

export const BREATH = {
  /**
   * The guest's mouth in cake_secondary plan: on the camera side, 28 cm towards the camera and 28 cm
   * to its left (the guest leans in from the left): the flow runs away and to the right, so the
   * bend reads in the picture plane instead of foreshortening into it.
   */
  mouth: [TOWARD_CAMERA[0] * 1.4 - SCREEN_RIGHT[0] * 1.4, TOWARD_CAMERA[1] * 1.4 - SCREEN_RIGHT[1] * 1.4] as const,
  /** The breath starts as the accept beat starts. */
  start: 0.06,
  /**
   * Jet velocity at the nearest candle (m/s); 1/d beyond it (round jet). A lip jet of ≈5–8 m/s
   * decays to ≈1.5 m/s at 30 cm (U ≈ 6·U0·D/x for a 1.5 cm opening).
   */
  peak: 1.6,
  /** Speed of the starting jet's front across the cake (m/s): about half the jet velocity. */
  front: 0.9,
  /** Pulse shape g(τ) = (τ/τp)² e^{2(1−τ/τp)}: peaks at τp; the sweeping breath passes each candle in ≈0.25 s. */
  rise: 0.075,
  /** Seeded arrival jitter (± s). */
  jitter: 0.012,
  /** Buoyant velocity of the flame gas (m/s): the lean is atan(U / w_b). */
  buoyant: 0.5,
  /** Flow at which the flame base lets go of the wick (m/s). */
  liftOff: 0.9,
  /** Extinction from the base up, after lift-off (s): 0.11–0.17 per candle. */
  extinguish: [0.11, 0.17] as const,
  /**
   * A lifted flame hovers where the flow has slowed to its burning speed: a few millimetres
   * downstream of the wick (scene units), not carried off with the flow.
   */
  standoff: 3.5 * MM,
  /**
   * Blow-off: the last of it lets go at this fraction of the extinction and drifts at `carry` × the
   * flow, cooling: the same gas then drifts on as the first smoke (SMOKE.puffCarry).
   */
  blowOff: 0.5,
  carry: 0.35,
  /** Largest lean drawn (rad): a flame laid nearly flat. */
  maxTilt: (76 * Math.PI) / 180,
} as const;

interface CandleBreath {
  /** Breath arrival (s, accept time). */
  arrive: number;
  /** Peak flow at this candle (m/s). */
  peak: number;
  /** Flow direction (unit, plan x/z of cake_secondary). */
  dirX: number;
  dirZ: number;
  /** Lift-off: accept time at which the flow reaches BREATH.liftOff. */
  lift: number;
  /** Extinction duration (s). */
  out: number;
}

const pulse = (tau: number) => {
  if (tau <= 0) return 0;
  const u = tau / BREATH.rise;
  return u * u * Math.exp(2 * (1 - u));
};
/** ∫₀^τ pulse (s): closed form of ∫ u² e^{2−2u}. */
const pulseIntegral = (tau: number) => {
  if (tau <= 0) return 0;
  const u = tau / BREATH.rise;
  const prim = (x: number) => -Math.exp(2 - 2 * x) * (x * x / 2 + x / 2 + 0.25);
  return BREATH.rise * (prim(u) - prim(0));
};

/** Per-candle breath schedule: nearest the mouth first, 1/d flow, seeded jitter and extinction time. */
export const BREATH_AT: readonly CandleBreath[] = (() => {
  const [mx, mz] = BREATH.mouth;
  const dist = CANDLE_SOCKETS.map(([x, z]) => Math.hypot(x - mx, z - mz));
  const dMin = Math.min(...dist);
  return CANDLE_SOCKETS.map(([x, z], i) => {
    const d = dist[i]!;
    const arrive = BREATH.start + (d - dMin) / (BREATH.front * MPS) + BREATH.jitter * signed(i, 11);
    const peak = BREATH.peak * (dMin / d);
    // Lift-off on the rising edge: pulse(τ)·peak = liftOff (bisection; the pulse rises monotonically to τp).
    const target = BREATH.liftOff / peak;
    let lo = 0, hi: number = BREATH.rise;
    for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (pulse(m) < target) lo = m; else hi = m; }
    const [e0, e1] = BREATH.extinguish;
    return { arrive, peak, dirX: (x - mx) / d, dirZ: (z - mz) / d, lift: arrive + hi, out: e0 + (e1 - e0) * rand(i, 12) };
  });
})();

/** Flow at candle `i` at accept time `t` (m/s). */
export function breathAt(i: number, t: number): number {
  const b = BREATH_AT[i]!;
  return b.peak * pulse(t - b.arrive);
}

/** Downstream distance (scene units) a parcel moving with the full flow travels between t0 and t1. */
export function breathDrift(i: number, t0: number, t1: number): number {
  const b = BREATH_AT[i]!;
  return b.peak * MPS * (pulseIntegral(t1 - b.arrive) - pulseIntegral(t0 - b.arrive));
}

/** Accept time at which candle `i`'s flame is fully out. */
export function extinguishedAt(i: number): number {
  const b = BREATH_AT[i]!;
  return b.lift + b.out;
}

// ── Decline: the flames are snuffed as the bin arrives (oxygen-starved: they shrink and go blue) ──
export const SNUFF = { start: 0.02, length: 0.14, stagger: 0.008 } as const;

// ── Flame state (the API the melt and the renderer read) ─────────────────────
export interface FlameState {
  /** Ignition growth: 0 no flame, 1 steady flame. */
  lit: number;
  /** Length and width relative to the steady flame (growth × stretch; flicker excluded). */
  height: number;
  width: number;
  /** Lean from vertical (rad) towards (dirX, dirZ) in cake_secondary's plan. */
  tilt: number;
  dirX: number;
  dirZ: number;
  /** Upward curl of the tip in the flow (0–0.4), and necking of the base (0–1). */
  bend: number;
  neck: number;
  /** Distance the flame body has been carried off the wick (scene units). */
  lift: number;
  /** Extinction front along the flame, base up: 0 whole, 1 gone. */
  cut: number;
  /** Cooling of the detached gas: 0 burning (≈1,900 K), 1 dark. */
  cool: number;
  /** Radiant output relative to the steady flame (light, melt). */
  intensity: number;
  /** No flame left at all. */
  out: boolean;
}

export function newFlameState(): FlameState {
  return { lit: 1, height: 1, width: 1, tilt: 0, dirX: 1, dirZ: 0, bend: 0, neck: 0, lift: 0, cut: 0, cool: 0, intensity: 1, out: false };
}

/** A steady lit flame. */
export function litFlame(out: FlameState): FlameState {
  out.lit = 1; out.height = 1; out.width = 1; out.tilt = 0; out.dirX = 1; out.dirZ = 0; out.bend = 0; out.neck = 0;
  out.lift = 0; out.cut = 0; out.cool = 0; out.intensity = 1; out.out = false;
  return out;
}

/** No flame. */
export function noFlame(out: FlameState): FlameState {
  litFlame(out);
  out.lit = 0; out.height = 0; out.width = 0; out.cut = 1; out.cool = 1; out.intensity = 0; out.out = true;
  return out;
}

/**
 * The authored state of candle `i`'s flame at time `t` of `sequence` (flicker excluded: it rides
 * on top, from the live clock). Pure: the same (i, t, sequence) always gives the same flame.
 *
 * - host: unlit until its wick catches, then grows over IGNITE.
 * - accept: steady until the breath arrives; leans, stretches, necks, lifts off and goes out.
 * - decline: snuffed in the first 0.2 s.
 */
export function flameState(i: number, t: number, sequence: SequenceName, out: FlameState = newFlameState()): FlameState {
  if (sequence === 'host') {
    const g = smoother((t - IGNITE_START[i]!) / IGNITE);
    if (g <= 0) return noFlame(out);
    litFlame(out);
    out.lit = g;
    // A fresh flame is a small bead (30 % of the length, 55 % of the width) that grows.
    out.height = 0.3 + 0.7 * g;
    out.width = 0.55 + 0.45 * g;
    out.intensity = g * g;
    return out;
  }
  if (sequence === 'decline') {
    const k = smooth((t - SNUFF.start - SNUFF.stagger * i) / SNUFF.length);
    if (k >= 1) return noFlame(out);
    litFlame(out);
    // Starved of air: it shrinks onto the wick, losing its soot (yellow) first.
    out.lit = 1 - k;
    out.height = 1 - 0.75 * k;
    out.width = 1 - 0.4 * k;
    out.intensity = (1 - k) * (1 - k);
    out.cool = 0.25 * k;
    return out;
  }
  // accept
  const b = BREATH_AT[i]!;
  const ext = extinguishedAt(i);
  if (t >= ext) return noFlame(out);
  litFlame(out);
  const U = breathAt(i, t);
  const r = U / (U + BREATH.buoyant);
  out.dirX = b.dirX;
  out.dirZ = b.dirZ;
  // The gust is not steady: a fast flutter of the lean (15–22 Hz, ±7 %), out of phase per candle.
  const flutter = 1 + 0.07 * Math.sin(2 * Math.PI * (15 + 7 * rand(i, 13)) * t + 6.283 * rand(i, 14));
  out.tilt = Math.min(BREATH.maxTilt, Math.atan(U / BREATH.buoyant) * flutter);
  out.height = 1 + 0.45 * r;
  out.width = 1 - 0.3 * r;
  out.bend = 0.35 * r;
  out.neck = smoother((U / BREATH.liftOff - 0.35) / 0.65);
  if (t > b.lift) {
    // Off the wick: the lifted flame hovers a few millimetres downstream and dies from the base up;
    // at blow-off the rest lets go and drifts with the flow, cooling: yellow, orange, dull red.
    const k = (t - b.lift) / b.out;
    const tBlow = b.lift + BREATH.blowOff * b.out;
    out.lift = BREATH.standoff * smooth(k / BREATH.blowOff) + BREATH.carry * smooth((k - BREATH.blowOff) / (1 - BREATH.blowOff)) * Math.max(0, breathDrift(i, tBlow, t));
    out.cut = smooth(k);
    // Cut off from its fuel the soot cools within tens of milliseconds: dark by 70 % of the way.
    out.cool = smooth((k - 0.1) / 0.6);
    // Cut off from its fuel the flame shrinks as it dies.
    out.height *= 1 - 0.45 * smooth(k);
  }
  // Radiant output: the part of the flame still burning, at its temperature.
  out.intensity = (1 - out.cut) * (1 - out.cool) ** 2;
  out.lit = 1;
  return out;
}

/**
 * Seconds of steady-flame-equivalent burning of candle `i` from the start of `sequence` to `t`
 * (∫ intensity dt): the melt's clock (#6). Guest-ready time adds 1 per second on the live clock.
 */
export function litTime(i: number, t: number, sequence: SequenceName): number {
  const n = Math.max(0, Math.ceil(t / 0.002));
  const s = newFlameState();
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const a = (k * t) / n, b = ((k + 1) * t) / n;
    sum += flameState(i, (a + b) / 2, sequence, s).intensity * (b - a);
  }
  return sum;
}

// ── Ember ────────────────────────────────────────────────────────────────────
export const EMBER = {
  /** Wick glow while the flame burns over it (most of it hidden in the dark zone). */
  lit: 0.35,
  /** Fresh oxygen on the bare wick: it flares to full glow in 50 ms, then cools (e-folding 0.8 s). */
  flare: 0.05,
  decay: 0.8,
  /** Dark by 3 s after lift-off. */
  end: 3,
} as const;

/** Glow of candle `i`'s wick tip at accept time `t` (0 cold, 1 bright orange). */
export function emberAt(i: number, t: number): number {
  const b = BREATH_AT[i]!;
  const a = t - b.lift;
  if (a <= 0) return t < 0 ? 0 : EMBER.lit;
  const flare = EMBER.lit + (1 - EMBER.lit) * smooth(a / EMBER.flare);
  return flare * Math.exp(-Math.max(0, a - EMBER.flare) / EMBER.decay) * (1 - smooth((a - EMBER.end * 0.6) / (EMBER.end * 0.4)));
}

// ── Smoke ────────────────────────────────────────────────────────────────────
export const SMOKE = {
  /**
   * Wick vapour emission: a burst as the flame leaves (the wick and pool are at their hottest:
   * e-folding 0.3 s) and a cooling tail (1.3 s), rising in 30 ms after lift-off, stopped by 3.6 s.
   */
  rise: 0.03,
  burst: 0.3,
  decay: 1.3,
  stop: 3.6,
  /** Plume: w = c·(z + z0)^(−1/3) (point-source plume, m/s with z in m), reached after τacc. */
  c: 0.13,
  z0: 0.01,
  accel: 0.12,
  /** Thread width at the wick and its laminar growth (mm, mm per √s). */
  width0: 1.1,
  widthGrow: 2.6,
  /** Laminar → transitional: sinuous waves grow around this height (m) over zGrow. */
  zTransition: 0.07,
  zGrow: 0.013,
  /** Wave amplitude at saturation (m), wavelength at the transition (m), phase speed / flow. */
  amplitude: 0.008,
  wavelength: 0.028,
  phaseSpeed: 0.75,
  /** Turbulent split into wisps above this height (m), their spread angle (half-width per height). */
  zSplit: 0.1,
  spread: 0.14,
  /** A turbulent round jet spreads at ≈12° half-angle: swept smoke widens by this much per distance carried. */
  jetSpread: 0.12,
  /** Wick vapour rides the breath at 80 % of it; the flame's cooled gas keeps the flame's own drift. */
  wickCarry: 0.6,
  puffCarry: 0.35,
  /** Room draft: a slow drift (m/s) and lean of the column. */
  draft: 0.012,
  /** Opacity of the dense stem, the head puff and age fade (s). */
  alpha: 0.65,
  puffAlpha: 0.22,
  fade: [0.7, 1.6] as const,
  /** The whole tail is over (accept time, s). */
  end: 5.2,
} as const;

/** Smoke streakline sampling: wick parcels, newest (at the wick) to oldest. */
export const SMOKE_POINT_COUNT = 64;
export const SMOKE_STRAND_COUNT = 3;
/** Share of the smoke in each strand: the main thread and two wisps that split off it. */
const STRAND_SHARE = [0.56, 0.26, 0.18] as const;
/** Soot puff: soft blobs along the upper (sooty) flame, per candle. */
export const PUFF_COUNT = 7;

/** Wick vapour emission rate of candle `i` at accept time `t` (0–1). */
export function smokeRate(i: number, t: number): number {
  const a = t - BREATH_AT[i]!.lift;
  if (a <= 0) return 0;
  return smooth(a / SMOKE.rise) * (0.55 * Math.exp(-a / SMOKE.burst) + 0.45 * Math.exp(-a / SMOKE.decay)) * (1 - smooth((a - SMOKE.stop * 0.55) / (SMOKE.stop * 0.45)));
}

/** Height (m) a plume parcel has risen `age` seconds after leaving the wick, for a source of strength `q` (0–1). */
export function plumeRise(age: number, q: number): number {
  if (age <= 0) return 0;
  // Effective time: starts from rest, reaches the plume velocity after ≈τacc.
  const a = age - SMOKE.accel * (1 - Math.exp(-age / SMOKE.accel));
  // w ∝ Q^(1/3): a cooling ember's plume is slower.
  const c = SMOKE.c * Math.cbrt(0.35 + 0.65 * q);
  const z0 = SMOKE.z0;
  return Math.pow((4 / 3) * c * a + Math.pow(z0, 4 / 3), 0.75) - z0;
}

/** Plume velocity (m/s) at height z (m) for strength q: d(plumeRise)/dt far from the source. */
export function plumeVelocity(z: number, q: number): number {
  return SMOKE.c * Math.cbrt(0.35 + 0.65 * q) * Math.pow(z + SMOKE.z0, -1 / 3);
}

export interface SmokeStrand {
  /** Points along the thread (cake_secondary space): x, y, z per point. */
  position: Float32Array;
  /** Thread width (scene units) and opacity per point. */
  width: Float32Array;
  alpha: Float32Array;
  /** Age (s) per point: drives the wisp noise in the shader. */
  age: Float32Array;
}

export function newSmokeStrand(): SmokeStrand {
  return {
    position: new Float32Array(SMOKE_POINT_COUNT * 3),
    width: new Float32Array(SMOKE_POINT_COUNT),
    alpha: new Float32Array(SMOKE_POINT_COUNT),
    age: new Float32Array(SMOKE_POINT_COUNT),
  };
}

/**
 * Axis point of a flame state at fraction s (0 base, 1 tip) relative to its rest base anchor, in
 * the cake's plan axes (scene units). The same curve the shader draws: a straight lean from the
 * base, the tip curling back up by `bend` (a quadratic offset), the base carried off by `lift`.
 */
export function flameAxis(f: FlameState, s: number, out: [number, number, number]): [number, number, number] {
  const L = FLAME_REST.length * f.height;
  const ct = Math.cos(f.tilt), st = Math.sin(f.tilt);
  const b = 0.5 * L * f.tilt * f.bend * s * s;
  const h = f.lift + st * s * L - ct * b;
  out[0] = f.dirX * h;
  out[1] = ct * s * L + st * b;
  out[2] = f.dirZ * h;
  return out;
}

const tmpFlame = newFlameState();
const tmpAxis: [number, number, number] = [0, 0, 0];

/**
 * Candle `i`'s smoke thread `strand` at accept time `t`, as a streakline: every point is a parcel
 * of wax vapour that left the wick at its birth, moved since by the breath (closed-form drift with
 * the jet's eddies), its plume rise, the room draft and the growing sinuous instability. `wick` is
 * the wick tip in cake_secondary space. Returns whether any of it is visible.
 */
export function smokeStrand(i: number, strand: number, t: number, wick: readonly [number, number, number], out: SmokeStrand): boolean {
  const b = BREATH_AT[i]!;
  const share = STRAND_SHARE[strand]!;
  let visible = false;
  const span = Math.max(0, Math.min(t - b.lift, SMOKE.stop + SMOKE.fade[1]));
  // Per-candle and per-strand variation of the instability.
  const ph1 = 6.283 * rand(i, 20), ph2 = 6.283 * rand(i, 21), phs = 6.283 * rand(i * 3 + strand, 22);
  const kScale = 0.85 + 0.3 * rand(i, 23);
  const draftDir = 0.6 + 0.5 * rand(i, 24);
  const n = SMOKE_POINT_COUNT;
  for (let k = 0; k < n; k++) {
    // Newest first, spaced in age (a little denser near the wick).
    const a = span * (k / (n - 1)) ** 1.25;
    const birth = t - a;
    const q = smokeRate(i, birth);
    const zr = plumeRise(a, q); // metres risen
    // Breath drift (downstream, closed form) from birth to now.
    const drift = SMOKE.wickCarry * breathDrift(i, birth, t);
    // Line density of the streak ∝ emission / transport speed at birth: vapour leaving the wick
    // into the breath is spread thinner.
    const dilute = 1 / (1 + breathAt(i, birth) / 1.5);
    let px = wick[0] + b.dirX * drift, pz = wick[2] + b.dirZ * drift;
    let py = wick[1] + zr * MPS;
    // Room draft: slow drift back-right, and a slow lean of the column that the old parcels carry.
    const dr = SMOKE.draft * MPS * a;
    px += dr * Math.cos(draftDir) * 0.8;
    pz += -dr * Math.sin(draftDir) * 0.8;
    const lean = 0.07 * Math.sin(2 * Math.PI * 0.21 * birth + ph1) * zr * MPS;
    px += lean * SCREEN_RIGHT[0];
    pz += lean * SCREEN_RIGHT[1];
    // Sinuous instability: laminar low down, waves growing through the transition and folding
    // into curls (the vertical part in quadrature makes the streakline loop once it exceeds 1/k).
    // The transition height differs from plume to plume (±20 %) and with the source's strength.
    const zt = SMOKE.zTransition * (0.8 + 0.4 * rand(i, 25)) * (0.85 + 0.15 * q);
    const grow = 1 / (1 + Math.exp(-(zr - zt) / SMOKE.zGrow));
    const lam = SMOKE.wavelength * kScale * (1 + 0.9 * Math.max(0, zr - zt) / 0.1);
    const k1 = (2 * Math.PI) / lam;
    const c = SMOKE.phaseSpeed * plumeVelocity(zr, q);
    const phase = k1 * zr - k1 * c * a - 2 * Math.PI * 1.3 * birth + ph1;
    // Intermittent: the disturbances that seed the instability come and go (a seeded envelope over
    // the parcels' birth), so the column calms, kinks, and only sometimes rolls into a curl.
    const env = 0.35 + 0.65 * smooth(0.5 + 0.5 * (0.6 * Math.sin(2 * Math.PI * 0.53 * birth + ph2) + 0.4 * Math.sin(2 * Math.PI * 1.37 * birth + ph1 * 1.7)));
    const A = SMOKE.amplitude * grow * (0.6 + 0.4 * q) * env;
    // A second, shorter mode at an incommensurate wavenumber breaks the regularity.
    const phase2 = 1.62 * k1 * zr - 1.62 * k1 * c * 1.1 * a + ph2;
    const ax = A * (Math.sin(phase) + 0.35 * Math.sin(phase2)), az = 0.7 * A * Math.sin(phase * 0.71 + ph2), ay = 0.85 * A * Math.cos(phase);
    // Split: the wisps leave the main thread above zSplit, each on its own wave.
    const split = strand === 0 ? 0 : 1 / (1 + Math.exp(-(zr - SMOKE.zSplit) / 0.02));
    const sp = SMOKE.spread * Math.max(0, zr - SMOKE.zSplit * 0.8) * split;
    const sx = sp * Math.sin(1.7 * phase + phs), sz = sp * Math.cos(1.3 * phase + phs);
    px += (ax + sx) * MPS * SCREEN_RIGHT[0] + (az + sz) * MPS * TOWARD_CAMERA[0];
    pz += (ax + sx) * MPS * SCREEN_RIGHT[1] + (az + sz) * MPS * TOWARD_CAMERA[1];
    py += ay * MPS;
    // The breath is a turbulent jet: smoke it carries wanders about the mean path, the more the
    // further it has been carried (two incommensurate eddy scales).
    const dm = drift / MPS;
    if (dm > 0) {
      const e1 = Math.sin(dm / 0.012 + 6.283 * rand(i * 5 + strand, 30) + 3.1 * birth), e2 = Math.sin(dm / 0.019 + 6.283 * rand(i * 5 + strand, 31));
      const amp = 0.22 * dm * (1 - Math.exp(-dm / 0.01));
      px += amp * (0.6 * e1 * SCREEN_RIGHT[0] + 0.5 * e2 * TOWARD_CAMERA[0]) * MPS;
      pz += amp * (0.6 * e1 * SCREEN_RIGHT[1] + 0.5 * e2 * TOWARD_CAMERA[1]) * MPS;
      py += amp * 0.7 * Math.cos(dm / 0.012 + 1.7 + 6.283 * rand(i * 5 + strand, 32)) * MPS;
    }
    out.position[k * 3] = px;
    out.position[k * 3 + 1] = py;
    out.position[k * 3 + 2] = pz;
    // Width (m): the thread thickens by diffusion, spreads turbulently above the transition and
    // in the breath's jet.
    const w = SMOKE.width0 * 1e-3 + SMOKE.widthGrow * 1e-3 * Math.sqrt(a / 0.5) + SMOKE.spread * Math.max(0, zr - SMOKE.zTransition) * grow + SMOKE.jetSpread * dm;
    out.width[k] = w * MPS * (strand === 0 ? 1 : 0.8);
    out.age[k] = a;
    // Opacity: the vapour condenses a millimetre above the ember (6 ms), thins as it widens and
    // fades with age.
    let alpha = SMOKE.alpha * q * dilute * smooth(a / 0.006) * Math.pow((SMOKE.width0 * 1e-3) / w, 0.75);
    alpha *= (1 - smooth((a - SMOKE.fade[0]) / (SMOKE.fade[1] - SMOKE.fade[0]))) * share;
    out.alpha[k] = alpha;
    if (alpha > 1e-4) visible = true;
  }
  return visible;
}

export interface SmokePuffs {
  /** Centres (cake_secondary space), radii (scene units) and opacities of the soot puff's blobs. */
  position: Float32Array;
  radius: Float32Array;
  alpha: Float32Array;
}

export function newSmokePuffs(): SmokePuffs {
  return { position: new Float32Array(PUFF_COUNT * 3), radius: new Float32Array(PUFF_COUNT), alpha: new Float32Array(PUFF_COUNT) };
}

/**
 * The blown-out flame's own soot, as soft blobs along its upper (sooty) part. While the flame
 * dies each blob sits on the flame's axis and greys as the flame cools (the flame's colour going
 * to grey in place); once the extinction front has passed it, it drifts on with the gas, rising
 * (hot), widening in the jet and fading. Returns whether any is visible.
 */
export function smokePuffs(i: number, t: number, wick: readonly [number, number, number], out: SmokePuffs): boolean {
  const b = BREATH_AT[i]!;
  let visible = false;
  for (let k = 0; k < PUFF_COUNT; k++) {
    const s = 0.3 + (0.68 * k) / (PUFF_COUNT - 1);
    // The extinction front reaches s at `pass`; until then the blob rides the flame.
    const pass = b.lift + b.out * invSmooth(s);
    const birth = Math.min(t, pass);
    const a = Math.max(0, t - pass);
    const f = flameState(i, Math.min(birth, extinguishedAt(i) - 1e-6), 'accept', tmpFlame);
    flameAxis(f, s, tmpAxis);
    const drift = t > pass ? SMOKE.puffCarry * breathDrift(i, pass, t) : 0;
    const dm = drift / MPS;
    const zr = plumeRise(a, 1.3);
    // Slight scatter about the axis so the cloud is not a row of beads.
    const jx = (rand(i * 11 + k, 40) - 0.5) * 1.2 * MM, jz = (rand(i * 11 + k, 41) - 0.5) * 1.2 * MM;
    out.position[k * 3] = wick[0] + tmpAxis[0] + b.dirX * drift + jx;
    out.position[k * 3 + 1] = wick[1] + (FLAME_REST.base - WICK_TIP_Y) + tmpAxis[1] + zr * MPS;
    out.position[k * 3 + 2] = wick[2] + tmpAxis[2] + b.dirZ * drift + jz;
    const r0 = Math.max(1.2 * MM, 1.3 * FLAME_REST.radius * f.width * flameProfile(Math.min(0.97, s)));
    const r = r0 + (SMOKE.jetSpread * dm * MPS) / 2 + 2.5 * MM * Math.sqrt(a / 0.5);
    out.radius[k] = r;
    // Greying with the flame's dying (continuous through `pass`), most soot in the upper flame,
    // diluting with the blob's area and fading.
    const D = smooth((t - b.lift) / b.out);
    const alpha = t <= b.lift ? 0 : SMOKE.puffAlpha * D * smooth((s - 0.25) / 0.4) * (r0 / r) ** 2 * Math.exp(-a / 0.5);
    out.alpha[k] = alpha;
    if (alpha > 1e-4) visible = true;
  }
  return visible;
}

/** Inverse of smoothstep on [0, 1] (Newton, from a cubic-root start). */
function invSmooth(y: number): number {
  if (y <= 0) return 0;
  if (y >= 1) return 1;
  // Closed form: x = 0.5 − sin(asin(1 − 2y) / 3).
  return 0.5 - Math.sin(Math.asin(1 - 2 * y) / 3);
}

/** Whether candle `i` is smoking (or its ember glowing) at accept time `t`. */
export function smokeAlive(t: number): boolean {
  return t >= 0 && t < SMOKE.end;
}
