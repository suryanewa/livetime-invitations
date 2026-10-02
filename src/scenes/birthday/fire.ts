import { CANDLE, CANDLE_COUNT, CANDLE_SOCKETS, FLAME } from '../../../models/birthdayContract.ts';
import { CAMERA_ANGLES } from '../../render/camera.ts';
import type { SequenceName } from '../../core/types.ts';
import { LIGHT_FROM } from './placement.ts';

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
 *   the detached gas is carried downstream, shrinking and dimming while still yellow-orange (cut
 *   off from its fuel the soot burns out in tens of milliseconds: it never lingers as a red ghost).
 *   Declined, the flames are snuffed instead (SNUFF): starved of air, shrinking onto the wick.
 * - **Smoke.** The bared wick keeps vaporising wax: a dense burst the instant the flame lets go of
 *   it (the wick and pool at their hottest), then a smoulder that thins to a fading thread over
 *   3–5.5 s; a snuffed wick leaves a briefer, weaker wisp (SmokeKind). The vapour condenses into
 *   a white aerosol a millimetre above the ember: the ribbon is dense and white at the wick from
 *   the first frame the flame has gone. Its streakline is a buoyant point-source plume,
 *   w ∝ (F/z)^(1/3): ≈0.4 m/s a few centimetres up, slowing with height. Each plume is laminar
 *   for its first 4–9 cm (its own seed), then sinuous waves grow, fold into curls and the thread
 *   splits and widens into wisps that fade; the stirred air the breath leaves behind (shared
 *   eddies) bends neighbouring plumes together, so they lean, meet and merge.
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

/** The steady flame (sizes from the contract, models/birthdayContract.ts FLAME). */
export const FLAME_REST = {
  /** Bottom of the blue cup: 1 mm above the pool (the lowest ≈20 % of a thin wick is quenched). */
  base: FLAME.base,
  /** Base to tip: 13 mm, so the tip is 14 mm above the pool. */
  length: FLAME.height,
  /** Half the widest width (5 mm). */
  radius: FLAME.radius,
  /** Where it is widest (at the wick top), as a fraction of its length. */
  widest: (WICK_TIP_Y - FLAME.base) / FLAME.height,
} as const;

/** Visible flame top above the candle base at rest. */
export const FLAME_REST_TOP = FLAME_REST.base + FLAME_REST.length;

/**
 * No two wicks stand the same height: candle `i`'s flame is this many times FLAME_REST (±7 %
 * seeded; Lf ∝ L^0.63, so ±0.5 mm of wick).
 */
export function flameScale(i: number): number {
  return 1 + 0.07 * signed(i, 50);
}

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
  /**
   * Room-draft sway: a shared draft (people round a cake) leans every flame the same way by up to
   * ±2° at 0.1–0.3 Hz, and each flame wanders ±1° on its own at 0.2–0.7 Hz.
   */
  sway: (1 * Math.PI) / 180,
  draft: (2 * Math.PI) / 180,
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
  // The shared draft (same for every candle, a little later for those further across the cake).
  const lag = 0.15 * (CANDLE_SOCKETS[i]![0] ?? 0);
  const d1 = 0.65 * Math.sin(2 * Math.PI * 0.13 * (t - lag) + 1.1) + 0.35 * Math.sin(2 * Math.PI * 0.29 * (t - lag) + 2.3);
  const d2 = 0.65 * Math.sin(2 * Math.PI * 0.11 * (t - lag) + 0.4) + 0.35 * Math.sin(2 * Math.PI * 0.23 * (t - lag) + 4.0);
  out.swayX = (FLICKER.sway * s1 + FLICKER.draft * d1) * gain;
  out.swayZ = (FLICKER.sway * s2 + FLICKER.draft * 0.6 * d2) * gain;
  out.phase = 2 * Math.PI * f * t + p1;
  return out;
}

export function newFlicker(): Flicker {
  return { height: 1, width: 1, intensity: 1, swayX: 0, swayZ: 0, phase: 0 };
}

// ── Ignition (host) ──────────────────────────────────────────────────────────
/**
 * Each wick catches 20 ms after the last, once every candle is in (placement.ts LIGHT_FROM; v1.5 polish:
 * the slower, careful placement moved it from 0.84 s to ≈ 1.83 s) and its flame
 * grows from a small blue bead to the steady teardrop over IGNITE: a lit wick takes a moment to
 * draw molten wax up and the soot (yellow) zone appears only once the flame is large enough.
 */
export const IGNITE_START = Array.from({ length: CANDLE_COUNT }, (_, i) => LIGHT_FROM + 0.02 * i);
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
   * flow while it dims; the wick's vapour streams through the same place as the first smoke.
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

/** How much of a growing flame's soot (its yellow, its light) has formed, by its growth (shader: sootFormed). */
export function sootFormed(lit: number): number {
  return smooth((lit - 0.1) / 0.4);
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
    // A fresh flame is a small bead (30 % of the length, 55 % of the width) that grows; it shows at
    // once (the match's flame hands over), mostly blue until it is big enough to make soot.
    out.height = 0.3 + 0.7 * g;
    out.width = 0.55 + 0.45 * g;
    out.intensity = Math.min(1, 0.25 + 0.75 * g) * smooth(g / 0.08);
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
    // Cut off from its fuel the soot burns out and cools within tens of milliseconds: the flame
    // dims as it shrinks (still yellow-orange: it never lingers as a red ghost), gone by 70 %.
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
 * How hard candle `i`'s flame heats its wax at time `t` of `sequence` (0–1): its radiant output
 * times its size (growth; a flame stretched by the breath is pushed off the wax, so no more than
 * its rest size). The melt's clock (#6) integrates it: sequences.ts litTime, melt.ts meltState.
 */
export function burnRate(i: number, t: number, sequence: SequenceName): number {
  const f = flameState(i, t, sequence, burnTmp);
  return f.intensity * Math.min(1, f.height);
}
const burnTmp = newFlameState();

// ── What follows a flame going out: ember, ash, smoke ─────────────────────────
/**
 * What put candle i's flame out, so what its wick does next, on that kind's own clock: the guest's
 * breath (accept time: a burst of white vapour into the moving air, the bared ember flaring
 * orange) or a snuff (decline time: the flame starved as the bin arrives; a brief, weaker wisp,
 * the ember barely glowing). A change of mind keeps whichever already happened running.
 */
export type SmokeKind = 'breath' | 'snuff';

export interface SmokeSource {
  /** When the wick is bared (the flame lets go of it), on the kind's clock. */
  bare: number;
  /** How quickly the vapour comes up to its rate (s): at once off a blown wick, over a few frames off a starved one. */
  rise: number;
  /** When its smoulder is over (s after `bare`): it fades out over the last 45 %. */
  stop: number;
  /** A parcel's age (s) where it starts to fade and where it is gone (a starved wick's thin wisp dissipates sooner). */
  fade: readonly [number, number];
  /** The smoulder's share of the vapour (the rest is the burst): a blown wick glows on, a starved one hardly. */
  smoulder: number;
  /** How fast its thread spreads by diffusion (× SMOKE.widthGrow): a starved wick's thin, cool wisp soon blurs into the air. */
  diffuse: number;
  /** Vapour output (0–1) and how slowly the wick cools (× the e-folding times). */
  strength: number;
  slow: number;
  /** Peak ember glow (0–1). */
  ember: number;
}

/** A blown wick's smoulder is over 5.5 s after it was bared (SMOKE.stop). */
const SMOKE_STOP = 5.5;

const SOURCES: Record<SmokeKind, SmokeSource[]> = {
  breath: Array.from({ length: CANDLE_COUNT }, (_, i) => ({ bare: BREATH_AT[i]!.lift, rise: 0.025, stop: SMOKE_STOP, fade: [1.2, 2.5], smoulder: 0.45, diffuse: 1, strength: 0.75 + 0.35 * rand(i, 26), slow: 0.8 + 0.5 * rand(i, 27), ember: 1 })),
  // A starved flame smokes as it shrinks onto the wick: the wisp leaves from halfway through the snuff.
  snuff: Array.from({ length: CANDLE_COUNT }, (_, i) => ({ bare: SNUFF.start + SNUFF.stagger * i + 0.5 * SNUFF.length, rise: 0.06, stop: 3, fade: [0.4, 1.1], smoulder: 0.12, diffuse: 2.5, strength: 0.5 + 0.2 * rand(i, 28), slow: 0.45 + 0.2 * rand(i, 29), ember: 0.62 })),
};

export function smokeSource(i: number, kind: SmokeKind = 'breath'): SmokeSource {
  return SOURCES[kind][i]!;
}

export const EMBER = {
  /** Wick glow while the flame burns over it: its very tip, where it pokes into the hot mantle, a dull red (≈1,030 K). */
  lit: 0.3,
  /** Fresh oxygen on the bare wick: it flares to its peak in 50 ms, then cools (e-folding 0.8 s). */
  flare: 0.05,
  decay: 0.8,
  /** Dark by 3 s after the flame leaves it. */
  end: 3,
} as const;

/** Glow of candle `i`'s wick tip at time `t` of `kind`'s clock (0 cold, 1 bright orange). */
export function emberAt(i: number, t: number, kind: SmokeKind = 'breath'): number {
  const src = smokeSource(i, kind);
  const a = t - src.bare;
  if (a <= 0) return t < 0 ? 0 : EMBER.lit;
  const flare = EMBER.lit + (src.ember - EMBER.lit) * smooth(a / EMBER.flare);
  return flare * Math.exp(-Math.max(0, a - EMBER.flare) / (EMBER.decay * src.slow)) * (1 - smooth((a - EMBER.end * 0.6) / (EMBER.end * 0.4)));
}

/**
 * The wick's char (0 fresh white cotton – 1 black) after `litTime` seconds of burning: a lit wick
 * chars within ≈0.1 s of burning where the flame wraps it.
 */
export function wickChar(litTime: number): number {
  return smooth(litTime / 0.1);
}

/**
 * The grey ash tip candle `i`'s wick is left with at time `t` of `kind`'s clock, as its ember
 * cools (0 – 1): from ≈0.3 s after the flame leaves it, complete ≈1.6 s later.
 */
export function ashAt(i: number, t: number, kind: SmokeKind = 'breath'): number {
  return smooth((t - smokeSource(i, kind).bare - 0.3) / 1.6);
}

// ── Smoke ────────────────────────────────────────────────────────────────────
export const SMOKE = {
  /**
   * Wick vapour emission: a burst the instant the flame leaves (the wick and the molten pool are
   * at their hottest: e-folding 0.3 s; up to rate within 25 ms, SmokeSource.rise), then the wick
   * smoulders on as a thin thread (e-folding 4.5 s, × each wick's own cooling) that fades out from
   * 3 s to 5.5 s.
   */
  burst: 0.3,
  decay: 4.5,
  stop: SMOKE_STOP,
  /** Plume: w = c·(z + z0)^(−1/3) (point-source plume, m/s with z in m), reached after τacc. */
  c: 0.13,
  z0: 0.01,
  accel: 0.12,
  /** Thread width at the wick and its laminar growth (mm, mm per √s). */
  width0: 1.2,
  widthGrow: 1.8,
  /** Widest a drawn thread gets (m). */
  maxWidth: 0.004,
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
  /**
   * Neighbouring plumes entrain each other's air and lean together (plume merging): from 5 cm up
   * each is drawn towards the candles' centre, by `merge` of its offset at 25 cm.
   */
  merge: 0.55,
  /** Swept smoke widens by this much per distance carried (the wick's wake keeps it narrow at first). */
  jetSpread: 0.06,
  /** Wick vapour rides the breath at 60 % of it (it leaves in the wick's own wake). */
  wickCarry: 0.6,
  /** Room draft: a slow drift (m/s) and lean of the column. */
  draft: 0.012,
  /**
   * The air the breath leaves stirred: eddies of 6–14 cm drifting at a few cm/s, decaying
   * (e-folding 2.2 s) into the room's own gentle stirring (`ambient` of it). Shared by all six
   * plumes, so neighbours bend together and can meet.
   */
  eddy: { speed: 0.05, decay: 2.2, ambient: 0.35, memory: 0.7 },
  /**
   * Optical depth of the column at full emission where it leaves the wick (all strands: opacity
   * 1 − e^−depth, ≈ 0.9 for the fresh ribbon, ≈ 0.2 for the last thin thread) and how it thins as
   * the column widens (∝ width^−thin); the age fade is each kind's (SmokeSource.fade).
   */
  depth: 2.4,
  thin: 0.6,
  /** The whole tail is over (time on the smoke's clock, s): faded to exactly nothing by then. */
  end: 6.5,
} as const;

/** Smoke streakline sampling: wick parcels, newest (at the wick) to oldest. */
export const SMOKE_POINT_COUNT = 64;
export const SMOKE_STRAND_COUNT = 3;
/** Share of the smoke in each strand: the main thread and two wisps that split off it. */
const STRAND_SHARE = [0.56, 0.26, 0.18] as const;

/** Wick vapour emission rate of candle `i` at time `t` of `kind`'s clock (0–1). */
export function smokeRate(i: number, t: number, kind: SmokeKind = 'breath'): number {
  const src = smokeSource(i, kind);
  const a = t - src.bare;
  if (a <= 0) return 0;
  return src.strength * smooth(a / src.rise) * ((1 - src.smoulder) * Math.exp(-a / (SMOKE.burst * src.slow)) + src.smoulder * Math.exp(-a / (SMOKE.decay * src.slow)))
    * (1 - smooth((a - 0.55 * src.stop) / (0.45 * src.stop)));
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
  /** Points along the thread (the smoke mesh's space): x, y, z per point. */
  position: Float32Array;
  /** Thread width (scene units) and opacity per point. */
  width: Float32Array;
  alpha: Float32Array;
  /** Age (s) per point: drives the wisp noise in the shader. */
  age: Float32Array;
  /** Densest point's opacity (the scene stops drawing smoke nobody can see). */
  peak: number;
}

export function newSmokeStrand(): SmokeStrand {
  return {
    position: new Float32Array(SMOKE_POINT_COUNT * 3),
    width: new Float32Array(SMOKE_POINT_COUNT),
    alpha: new Float32Array(SMOKE_POINT_COUNT),
    age: new Float32Array(SMOKE_POINT_COUNT),
    peak: 0,
  };
}

/** The shared eddies (fixed seed): horizontal wavevectors (1/m), vertical wavenumber, angular rate, phase, weight. */
const EDDIES = Array.from({ length: 5 }, (_, k) => {
  const lam = 0.06 + 0.08 * rand(91, k);
  const dir = 6.283 * rand(92, k);
  const kh = (2 * Math.PI) / lam;
  return { kx: kh * Math.cos(dir), kz: kh * Math.sin(dir), ky: ((2 * Math.PI) / (0.08 + 0.1 * rand(93, k))) * (rand(94, k) - 0.5), w: 0.6 + 1.2 * rand(95, k), ph: 6.283 * rand(96, k), a: 0.6 + 0.4 * rand(97, k) };
});
const EDDY_NORM = 1 / Math.sqrt(EDDIES.reduce((s, e) => s + e.a * e.a, 0) / 2);

/**
 * Displacement (m, horizontal x/z of the smoke's space) the stirred air gives a parcel now at
 * (x, y, z) m, `age` s after it left the wick, at time `t` on a clock where the stirring began at
 * `t0` (the breath; −∞: the room's own). Divergence-free in plan (each eddy moves air across its
 * wavevector), evaluated where the parcel is and remembered over ≈0.7 s (older motion
 * decorrelates), so plumes passing the same place bend the same way.
 */
function eddyAt(x: number, y: number, z: number, t: number, t0: number, age: number, out: number[]): void {
  const e = SMOKE.eddy;
  const amp = e.speed * (e.ambient + (1 - e.ambient) * (t > t0 ? Math.exp(-(t - t0) / e.decay) : 0)) * EDDY_NORM;
  const mem = e.memory * (1 - Math.exp(-age / e.memory));
  let dx = 0, dz = 0;
  for (const m of EDDIES) {
    const s = Math.sin(m.kx * x + m.kz * z + m.ky * y - m.w * t + m.ph) * m.a;
    const kh = Math.hypot(m.kx, m.kz);
    dx += (-m.kz / kh) * s;
    dz += (m.kx / kh) * s;
  }
  out[0] = dx * amp * mem;
  out[1] = dz * amp * mem;
}
const eddyTmp = [0, 0];

/**
 * Where candle i's wick was when a parcel was born at `birth` (the smoke mesh's space): the wick,
 * or a carried cake's. Returns how fast the wick was moving through the air then (m/s; nothing or
 * 0 for a wick standing still), or a negative number where none of its smoke is seen (a wick
 * inside the bin).
 */
export type WickAt = (birth: number, out: [number, number, number]) => number | void;
/** A wick carried through the air strings its vapour out along its path: half as dense per length at this speed (m/s). */
const STRUNG_AT = 0.05;
/**
 * The air over a moving cake goes with it at first (it is pushed up by the cake's top and drawn
 * along in its wake), forgetting over this time (s): a parcel is carried by the cake's motion since
 * its birth, weighted e^−(τ − birth)/WAKE (WakeAt; the scene integrates its path).
 */
export const WAKE = 0.35;
/** The displacement (smoke space) the moving cake has carried a parcel born at `birth` by now. */
export type WakeAt = (birth: number, out: [number, number, number]) => void;
const wickTmp: [number, number, number] = [0, 0, 0];
const wakeTmp: [number, number, number] = [0, 0, 0];
/** The candles' centre in the cake's plan (cake_secondary units): where neighbouring plumes lean. */
const SOCKET_CENTRE = [CANDLE_SOCKETS.reduce((a, s) => a + s[0], 0) / CANDLE_COUNT, CANDLE_SOCKETS.reduce((a, s) => a + s[1], 0) / CANDLE_COUNT] as const;

/**
 * Candle `i`'s smoke thread `strand` at time `t` of `kind`'s clock, as a streakline: every point is
 * a parcel of wax vapour that left the wick at its birth (where the wick was then: `wickAt`), moved
 * since by the breath (closed-form drift), its plume rise, the stirred air the breath left (shared
 * eddies), the room draft, the neighbouring plumes' pull and the growing sinuous instability,
 * decorrelated per plume. Parcels born where `wickAt` says none is seen carry no smoke. Returns
 * whether any shows (and sets `out.peak`).
 */
export function smokeStrand(i: number, strand: number, t: number, wickAt: WickAt, out: SmokeStrand, kind: SmokeKind = 'breath', wake?: WakeAt): boolean {
  const src = smokeSource(i, kind);
  const breath = kind === 'breath';
  const b = BREATH_AT[i]!;
  const share = STRAND_SHARE[strand]!;
  let visible = false;
  const span = Math.max(0, Math.min(t - src.bare, src.stop + src.fade[1]));
  // No two plumes alike: phases, wavelength, amplitude, the beat of the disturbances, the plane
  // the waves swing in, how soon it turns turbulent.
  const ph1 = 6.283 * rand(i, 20), ph2 = 6.283 * rand(i, 21), phs = 6.283 * rand(i * 3 + strand, 22);
  const kScale = 0.75 + 0.6 * rand(i, 23);
  const draftDir = 0.6 + 0.5 * rand(i, 24);
  const ampScale = 0.6 + 0.8 * rand(i, 34);
  const beat = 0.7 + 1.5 * rand(i, 33);
  const cSpeed = 0.6 + 0.3 * rand(i, 36);
  const swing = 6.283 * rand(i, 35);
  const ux = Math.cos(swing) * SCREEN_RIGHT[0] + Math.sin(swing) * TOWARD_CAMERA[0], uz = Math.cos(swing) * SCREEN_RIGHT[1] + Math.sin(swing) * TOWARD_CAMERA[1];
  const vx = -Math.sin(swing) * SCREEN_RIGHT[0] + Math.cos(swing) * TOWARD_CAMERA[0], vz = -Math.sin(swing) * SCREEN_RIGHT[1] + Math.cos(swing) * TOWARD_CAMERA[1];
  const stirFrom = breath ? BREATH.start : -Infinity;
  const tailFade = smokeTail(t);
  const mergeK = SMOKE.merge * (0.8 + 0.4 * rand(i, 37));
  const toCentreX = SOCKET_CENTRE[0] - CANDLE_SOCKETS[i]![0], toCentreZ = SOCKET_CENTRE[1] - CANDLE_SOCKETS[i]![1];
  let peak = 0;
  const n = SMOKE_POINT_COUNT;
  for (let k = 0; k < n; k++) {
    // Newest first, spaced in age (denser near the wick).
    const a = span * (k / (n - 1)) ** 1.25;
    const birth = t - a;
    const moving = wickAt(birth, wickTmp) || 0;
    const q = moving < 0 ? 0 : smokeRate(i, birth, kind);
    const zr = plumeRise(a, q); // metres risen
    // Breath drift (downstream, closed form) from birth to now.
    const drift = breath ? SMOKE.wickCarry * breathDrift(i, birth, t) : 0;
    let px = wickTmp[0] + b.dirX * drift, pz = wickTmp[2] + b.dirZ * drift;
    let py = wickTmp[1] + zr * MPS;
    // The moving cake's push and wake: a parcel goes along with it at first, then is left behind.
    if (wake) {
      wake(birth, wakeTmp);
      px += wakeTmp[0];
      py += wakeTmp[1];
      pz += wakeTmp[2];
    }
    // Neighbouring plumes lean together and merge higher up.
    const pull = mergeK * smooth((zr - 0.05) / 0.2);
    px += toCentreX * pull;
    pz += toCentreZ * pull;
    // Room draft: slow drift back-right, and a slow lean of the column that the old parcels carry.
    const dr = SMOKE.draft * MPS * a;
    px += dr * Math.cos(draftDir) * 0.8;
    pz += -dr * Math.sin(draftDir) * 0.8;
    const lean = 0.07 * Math.sin(2 * Math.PI * 0.21 * birth + ph1) * zr * MPS;
    px += lean * SCREEN_RIGHT[0];
    pz += lean * SCREEN_RIGHT[1];
    // Sinuous instability: laminar low down, waves growing through the transition and folding
    // into curls (the vertical part in quadrature makes the streakline loop once it exceeds 1/k).
    const zt = SMOKE.zTransition * (0.7 + 0.6 * rand(i, 25)) * (0.85 + 0.15 * q);
    // Exactly laminar at the wick (the logistic's foot taken off), saturating above the transition.
    const g0 = 1 / (1 + Math.exp(zt / SMOKE.zGrow));
    const grow = Math.max(0, 1 / (1 + Math.exp(-(zr - zt) / SMOKE.zGrow)) - g0) / (1 - g0);
    const lam = SMOKE.wavelength * kScale * (1 + 0.9 * Math.max(0, zr - zt) / 0.1);
    const k1 = (2 * Math.PI) / lam;
    const c = SMOKE.phaseSpeed * cSpeed * plumeVelocity(zr, q);
    const phase = k1 * zr - k1 * c * a - 2 * Math.PI * beat * birth + ph1;
    // Intermittent: the disturbances that seed the instability come and go (a seeded envelope over
    // the parcels' birth), so the column calms, kinks, and only sometimes rolls into a curl.
    const env = 0.3 + 0.7 * smooth(0.5 + 0.5 * (0.6 * Math.sin(2 * Math.PI * 0.53 * beat * birth + ph2) + 0.4 * Math.sin(2 * Math.PI * 1.37 * birth + ph1 * 1.7)));
    // The waves grow in time as well as with height: a young plume's head rises before it rolls.
    const A = SMOKE.amplitude * ampScale * grow * (0.6 + 0.4 * q) * env * (1 - Math.exp(-a / 0.4));
    // A second, shorter mode at an incommensurate wavenumber breaks the regularity.
    const phase2 = 1.62 * k1 * zr - 1.62 * k1 * c * 1.1 * a + ph2;
    const au = A * (Math.sin(phase) + 0.35 * Math.sin(phase2)), av = 0.7 * A * Math.sin(phase * 0.71 + ph2), ay = 0.85 * A * Math.cos(phase);
    // Split: the wisps leave the main thread above zSplit, each on its own wave.
    const split = strand === 0 ? 0 : 1 / (1 + Math.exp(-(zr - SMOKE.zSplit) / 0.02));
    const sp = SMOKE.spread * Math.max(0, zr - SMOKE.zSplit * 0.8) * split;
    const su = sp * Math.sin(1.7 * phase + phs), sv = sp * Math.cos(1.3 * phase + phs);
    px += ((au + su) * ux + (av + sv) * vx) * MPS;
    pz += ((au + su) * uz + (av + sv) * vz) * MPS;
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
    // The stirred air: shared by every plume, so neighbours bend together and can meet.
    eddyAt(px / MPS, py / MPS, pz / MPS, t, stirFrom, a, eddyTmp);
    px += eddyTmp[0]! * MPS;
    pz += eddyTmp[1]! * MPS;
    out.position[k * 3] = px;
    out.position[k * 3 + 1] = py;
    out.position[k * 3 + 2] = pz;
    // Width (m): the thread thickens by diffusion, spreads turbulently above the transition and
    // in the breath's jet.
    // The first vapour off the wick rises as a starting plume: its head a thermal wider than the stem.
    const head = 1 + 1.2 * (1 - smooth((birth - src.bare) / 0.12));
    const w = (SMOKE.width0 * 1e-3 + SMOKE.widthGrow * src.diffuse * 1e-3 * Math.sqrt(a / 0.5)) * head + SMOKE.spread * Math.max(0, zr - zt) * grow + SMOKE.jetSpread * dm;
    // Drawn no wider than SMOKE.maxWidth: a turbulent column breaks into wisps rather than widening as
    // one sheet (a wide ribbon folding over itself draws hard-edged planes); its opacity still thins
    // with the full width.
    out.width[k] = Math.min(w, SMOKE.maxWidth) * MPS * (strand === 0 ? 1 : 0.8);
    out.age[k] = a;
    // Opacity of the whole column here: the vapour condenses a millimetre above the ember (4 ms),
    // thins as it widens and fades with age; it leaves the wick dense even in the breath (in the
    // wick's own wake). The strands share its optical depth (Beer–Lambert): where they still
    // overlap, low down, they composite back to exactly the column's opacity.
    const dilute = (breath ? 1 / (1 + breathAt(i, birth) / 6) : 1) / (1 + moving / STRUNG_AT);
    let depth = SMOKE.depth * q * dilute * smooth(a / 0.004) * Math.pow((SMOKE.width0 * 1e-3) / w, SMOKE.thin);
    depth *= (1 - smooth((a - src.fade[0]) / (src.fade[1] - src.fade[0]))) * tailFade;
    const alpha = 1 - Math.exp(-share * depth);
    out.alpha[k] = alpha;
    if (alpha > 1e-4) visible = true;
    if (alpha > peak) peak = alpha;
  }
  out.peak = peak;
  return visible;
}

/** Whether any smoke (or ember) can be showing at time `t` of the smoke's clock. */
export function smokeAlive(t: number): boolean {
  return t >= 0 && t < SMOKE.end;
}

/** Global fade of the tail's last 1.5 s: exactly 0 from SMOKE.end. */
function smokeTail(t: number): number {
  return 1 - smooth((t - (SMOKE.end - 1.5)) / 1.5);
}
