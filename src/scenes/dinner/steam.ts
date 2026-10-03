import { Euler, Vector2, Vector3 } from 'three';
import { COVER, COVER_SEATED, PLATE, plateTop } from '../../../models/dinnerContract.ts';
import { newFrame, REVEAL_DIR, sampleSequence } from './sequences.ts';

/**
 * Dinner v1.6: the steam under the cloche, as a volume (Surya: "it needs to realistically
 * accumulate under the cloche and somewhat match its shape when it's lifted (as it would be in real
 * life)"). Research notes and decisions: docs/scenes/dinner-v1.6-steam.md.
 *
 * One density field in steam time τ (seconds since the reveal began, the accept's own clock), a
 * pure function of τ: replay, rewind and frame rate cannot accumulate anything. The shader in
 * models/dinnerSteam.ts raymarches it; this module is its plan and its CPU mirror (the smooth
 * envelope, without the noise), used by the tests and for the volume's bounds.
 *
 *  1. The cloud. Under the hot cloche the vapour has accumulated into a saturated cloud that fills
 *     the dome: its initial density is the dome's cavity (a superellipse fitted to the cloche's
 *     profile, inside its shell, down to the porcelain), soft at the wall, clear just above the hot
 *     plate, densest under the crown. It is a material: every point of it is carried by an analytic
 *     flow, and the shader finds where the air at a point came from by undoing that flow (the
 *     inverse map, `cloudMaterial`), then reads the cloud's noise there, so its structure is
 *     carried, sheared and rolled up with it rather than scrolling.
 *  2. The dome is a moving boundary. While it is still over the plate, its lift drags the top of
 *     the cloud up after it and a little along its path (`dragAt`: the dome's own motion, weighted
 *     by how much of it is still over the cloud), so the cloud is never outside the shell while the
 *     shell is there; the scene's depth hides what is still inside it.
 *  3. The release. Once the dome is clear, the cloud keeps the dome's shape for a beat (a buoyant
 *     bubble starts from rest: ≈ 0.3 s to get going), then rises as a thermal: its top climbs at up
 *     to ≈ 22 cm/s and slows as it entrains room air (Scorer's thermal, radius growing ≈ 0.25 per
 *     unit of rise), the base following at a fifth of that (it lifts off the plate, never a layer
 *     lying on it); its cap mushrooms out while the stem narrows; the cap's edge rolls outward and
 *     down round a vortex ring; the outer base slumps outward over the plate's rim and down; the
 *     room's air shears it and it tears into wisps (turbulent warp growing with age, erosion of
 *     its thin parts first), and it evaporates as it mixes in and rises, gone within ≈ 3 s.
 *  4. The veil. The uncovered plate goes on breathing: a thin, wispy column off the well, strongest
 *     as the dome clears it and thinning to a long tail (visible to ≈ 4.5 s), gone by STEAM_END.
 *  5. A change of mind. The release stops (the veil's source dies away over VEIL.cut); what is out
 *     rises on and disperses on its own clock; what the returning cover closes over stays under
 *     it (`capture`); a reveal resumed part-way releases only the plate's veil (its cloud is the one
 *     left behind).
 *
 * Units: Dinner scene units (1 su = 16.875 cm); the plate at the origin (the reveal never moves it).
 */

const frame = newFrame();

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const dsmooth = (a: number, b: number, x: number) => {
  if (x <= a || x >= b) return 0;
  const t = (x - a) / (b - a);
  return (6 * t * (1 - t)) / (b - a);
};

/** The cloud, its release and its flow (shared with the shader: models/dinnerSteam.ts inlines these). */
export const CLOUD = {
  /** The dome's rim plane at the seat (its cavity starts here; below it, the coupe). */
  rim: COVER_SEATED.y,
  /** The cavity: a superellipse (r/R)^p + (y/H)^p = 1 fitted to COVER_PROFILE (within 1.5 %), inside the 1.5 mm shell. */
  radius: 0.63,
  height: 0.62,
  power: 2.2,
  /** The cloud's soft edge inside the wall (su): it holds the dome's shape, with no hard surface. */
  wall: 0.05,
  /** The clear layer over the hot porcelain at the seat, and how much deeper it gets as the plate re-heats the air (su). */
  floor: 0.035,
  floorGrow: 0.1,
  /** Densest under the crown (warm saturated air rises; the dome's cool wall condenses it): the base keeps this share. */
  baseDensity: 0.55,
  /** τ (s) at which the thermal clock starts: the rim ≈ 5 cm up and moving off. */
  release: 0.3,
  /** The dome's drag: the crown's air follows its lift by this share, and its path by `side`, while it is over the cloud. */
  dragUp: 0.32,
  dragSide: 0.1,
  /** The dome's horizontal offset (su) over which it stops dragging: still over the cloud → clear of it. */
  overlap: [0.15, 0.7] as const,
  /** The thermal's top rise: scale W (su/s), buoyant start and entrainment time constants (s): peak ≈ 22 cm/s at ≈ 0.6 s. */
  riseW: 1.45,
  riseStart: 0.25,
  riseMix: 0.9,
  /** The base follows the top's rise by this share (0: the lowest air stays, slumps and evaporates). */
  base: 0,
  /** The cap's radius grows by this per su of rise (a thermal's entrainment, α ≈ 0.25, over R ≈ 0.63); the stem narrows by up to `stem`. */
  capGrow: 0.22,
  stem: 0.3,
  /** The cap flattens by up to this share of its height as it rises. */
  squash: 0.12,
  /** The updraft's fall-off from the axis to the cap's edge (share of the rise the edge loses). */
  centre: 0.38,
  /** The stem and base evaporate (up to this share) as the uncovered plate re-heats them. */
  stemFade: 0.9,
  /** The vortex ring's core in the cloud at the seat: (share of the radius, height su). */
  ringAt: [0.78, 0.34] as const,
  /** The vortex ring: its roll (rad) and time constant (s), its core's reach (su). */
  roll: 3.4,
  rollTime: 1.0,
  ringCore: 0.26,
  /** The base's outward slump over the plate's rim (su) and its time constant (s). */
  skirt: 0.42,
  skirtTime: 0.45,
  /** Turbulent warp (su): at the seat (the slowly turning cloud) and grown, and its time constant (s). */
  turb: [0.015, 0.15] as const,
  turbTime: 1.0,
  /** The room's draught leans the rising cloud (su of lean per su of height). */
  lean: 0.14,
  /** Erosion (evaporation of the thin parts first): starts, and completes over (s of the thermal clock). */
  erode: [0.35, 2.1] as const,
  /** The cloud is gone by this age (s), faded out over the last `fadeOut`. */
  life: 2.5,
  fadeOut: 0.7,
  /** Visible steam evaporates as it rises: e^(−(y − evapFrom)/evaporate) above evapFrom (su). */
  evapFrom: 0.9,
  evaporate: 1.3,
} as const;

/** The room's draught: away from the cloche set down behind-left, across the view. */
export const LEAN_DIR = new Vector2(0.86, -0.51);

/**
 * The spill. A tipped dome is a doorway at its raised rim: the saturated layer flows out of the top
 * of the gap and is caught at once by the warm boundary layer rising up the hot dome's outer wall:
 * a thin sheet climbing the raised side (over the silver's dark reflections, the first steam the
 * guest sees), strongest where the gap is widest, until the dome lifts off and carries it away.
 */
export const SPILL = {
  /** It climbs the wall at this speed (su/s, ≈ 25 cm/s: the exchange outflow caught by the hot wall, drawn up by the lifting dome). */
  rise: 1.5,
  /** Spread round the raised rim (rad, Gaussian width). */
  spread: 0.6,
  /** Its source: the raised rim's gap (su) at which it is full. */
  fullGap: 0.09,
  /** It stops being fed once the dome lifts off, and is carried off and mixed in by (τ, s). */
  stop: [0.24, 0.3] as const,
  fade: [0.3, 0.46] as const,
  /** The shader samples its source at this many past times, this far apart (s). */
  samples: 8,
  dt: 0.075,
} as const;

/** The raised rim's direction in the cover's frame (opposite the reveal's path). */
export const RAISED_DIR = new Vector2(-REVEAL_DIR.x, -REVEAL_DIR.z).normalize();

const SPILL_DT = 0.002;
const SPILL_GAP = (() => {
  const n = Math.ceil(0.5 / SPILL_DT);
  const gap = new Float64Array(n + 1);
  const e = new Euler(), v = new Vector3();
  for (let i = 0; i <= n; i++) {
    sampleSequence('accept', i * SPILL_DT, frame);
    v.set(RAISED_DIR.x * COVER.lipRadius, 0, RAISED_DIR.y * COVER.lipRadius).applyEuler(e.set(frame.coverTiltX, 0, frame.coverTilt)).add(frame.coverPos);
    gap[i] = Math.max(0, v.y - plateTop(Math.hypot(v.x, v.z)));
  }
  return gap;
})();

/** The spill's source at emission time t (0..1): the raised gap's opening, until the dome lifts off; within a release window. */
export function spillSource(t: number, emitStart = -Infinity, emitEnd = Infinity): number {
  if (t <= 0 || t <= emitStart || t >= Math.min(emitEnd, SPILL.stop[1])) return 0;
  const f = Math.min(t, 0.5) / SPILL_DT, i = Math.min(Math.floor(f), SPILL_GAP.length - 2);
  const gap = SPILL_GAP[i]! + (SPILL_GAP[i + 1]! - SPILL_GAP[i]!) * (f - i);
  return Math.min(1, gap / SPILL.fullGap) * (1 - smooth(SPILL.stop[0], SPILL.stop[1], t));
}

/** The spill's light left at τ (carried off and mixed in once the dome lifts off). */
export const spillFade = (tau: number) => 1 - smooth(SPILL.fade[0], SPILL.fade[1], tau);

/** The plate's thin veil after the release (a rising column off the well). */
export const VEIL = {
  /** The source starts as the rim clears the well (τ, s), rises to full over `ramp`. */
  t0: 0.3,
  ramp: 0.3,
  /** The first rush decays over `decay`; a `tail` share decays over `tailDecay` (s). */
  decay: 0.7,
  tail: 0.5,
  tailDecay: 1.1,
  /** Visible density goes as the flow to this power (thin steam keeps a few bright ribbons), and the plate stops steaming visibly between these τ. */
  gather: 0.5,
  end: [4.0, 5.3] as const,
  /** A change of mind: the source dies away over this (s). */
  cut: 0.15,
  /** It rises at this speed (su/s, ≈ 19 cm/s) and forms this far off the porcelain (su). */
  rise: 1.15,
  base: 0.12,
  /** Column length (su) and its faded top. */
  length: 1.6,
  top: 0.4,
  /** Its radius at the well and growth per su of height. */
  radius: 0.36,
  spread: 0.32,
  /** Evaporation with height (su). */
  evaporate: 0.85,
  /** Mean density of the veil at its source (the cloud's is 1). */
  strength: 3.2,
} as const;

/** One of the steam's clocks, as the shader takes it. */
export interface SteamClock {
  tau: number | null;
  emitStart?: number;
  emitEnd?: number;
  capture?: number;
  fade?: number;
}


/**
 * The dome's drag on the cloud by accept time t: its rim centre's rise and travel, integrated while
 * it is over the cloud (`CLOUD.overlap` by horizontal offset), as a table (2 ms, to 1.5 s).
 */
const DRAG_DT = 0.002;
const DRAG = (() => {
  const n = Math.ceil(1.5 / DRAG_DT);
  const up = new Float64Array(n + 1), x = new Float64Array(n + 1), z = new Float64Array(n + 1);
  sampleSequence('accept', 0, frame);
  let py = frame.coverPos.y, px = frame.coverPos.x, pz = frame.coverPos.z;
  for (let i = 1; i <= n; i++) {
    sampleSequence('accept', i * DRAG_DT, frame);
    const c = frame.coverPos;
    const over = 1 - smooth(CLOUD.overlap[0], CLOUD.overlap[1], Math.hypot(c.x, c.z));
    up[i] = up[i - 1]! + Math.max(0, c.y - py) * over;
    x[i] = x[i - 1]! + (c.x - px) * over;
    z[i] = z[i - 1]! + (c.z - pz) * over;
    py = c.y; px = c.x; pz = c.z;
  }
  return { up, x, z, n };
})();

/**
 * The dome's drag at accept time t, already scaled by CLOUD.dragUp / dragSide: how far the crown's
 * air has been drawn up (su, returned) and along the dome's path (`side`, plan x/z, su).
 */
export function dragAt(t: number, side: Vector2 = new Vector2()): number {
  const f = Math.min(Math.max(t, 0), 1.5) / DRAG_DT;
  const i = Math.min(Math.floor(f), DRAG.n - 1), k = f - i;
  const lerp = (a: Float64Array) => a[i]! + (a[i + 1]! - a[i]!) * k;
  side.set(lerp(DRAG.x) * CLOUD.dragSide, lerp(DRAG.z) * CLOUD.dragSide);
  return lerp(DRAG.up) * CLOUD.dragUp;
}

/** The thermal's top rise (su) at age a (buoyant start, entraining deceleration). */
export function riseAt(a: number): number {
  if (a <= 0) return 0;
  const { riseW: W, riseStart: TB, riseMix: TM } = CLOUD;
  return (W / (1 - TB / TM)) * (TM * (1 - Math.exp(-a / TM)) - TB * (1 - Math.exp(-a / TB)));
}

/** Everything the shader needs of the cloud on one clock at τ (computed once per frame on the CPU). */
export interface CloudState {
  /** Whether this clock carries the cloud (a reveal resumed part-way does not: its cloud was left behind). */
  present: boolean;
  tau: number;
  /** The thermal clock (s since the release). */
  age: number;
  /** The dome's drag: up (su) and along its path (plan x/z, su). */
  dragUp: number;
  dragSide: Vector2;
  /** The top's rise, the cap's vertical squash (0..1), its radial scale and the stem's (factors), the base's slump (su). */
  rise: number;
  squash: number;
  cap: number;
  stem: number;
  skirt: number;
  /** The vortex ring: roll angle (rad), core (ρ, y) and reach (su). */
  roll: number;
  ringR: number;
  ringY: number;
  ringSigma: number;
  /** Turbulent warp amplitude (su), the draught's lean (su per su of height, plan vector). */
  turb: number;
  lean: Vector2;
  /** Erosion threshold 0..1 and the overall fade (gone at CLOUD.life). */
  erode: number;
  fade: number;
  /** The clear layer over the porcelain (su). */
  floor: number;
  /** Share of the stem and base evaporated by the re-heating plate. */
  stemFade: number;
}

export function newCloudState(): CloudState {
  return {
    present: false, tau: 0, age: 0, dragUp: 0, dragSide: new Vector2(), rise: 0, squash: 0, cap: 1, stem: 1, skirt: 0, roll: 0, ringR: 0.4, ringY: 0.5, ringSigma: CLOUD.ringCore,
    turb: CLOUD.turb[0], lean: new Vector2(), erode: 0, fade: 1, floor: CLOUD.floor, stemFade: 0,
  };
}

/**
 * Rise weights by material height Y (su above the table): the bulk of the cloud (above the lowest
 * ≈ 4 cm) rises as one thermal; the air at the base lags (CLOUD.base of the rise) and is drawn out
 * into its stem.
 */
export const RISE_BAND = [0.12, 0.36] as const;
export const riseWeight = (Y: number) => CLOUD.base + (1 - CLOUD.base) * smooth(RISE_BAND[0], RISE_BAND[1], Y);
const riseWeightD = (Y: number) => (1 - CLOUD.base) * dsmooth(RISE_BAND[0], RISE_BAND[1], Y);
/** The cap's vertical compression (a rising thermal flattens into an oblate cap): ∫ capWeight. */
export const CAP_BAND = [0.25, 0.62] as const;
const capIntegral = (Y: number) => {
  const [a, b] = CAP_BAND;
  if (Y <= a) return 0;
  if (Y >= b) return 0.5 * (b - a) + (Y - b);
  const t = (Y - a) / (b - a);
  return (b - a) * (t * t * t - 0.5 * t * t * t * t);
};
/** The dome drags the upper cloud (its crown most). */
export const dragWeight = (Y: number) => smooth(0.2, 0.72, Y);
const dragWeightD = (Y: number) => dsmooth(0.2, 0.72, Y);
/** The cap/stem blend by material height. */
const capWeight = (Y: number) => smooth(CAP_BAND[0], CAP_BAND[1], Y);
/** The base's slump weight (low and outer material). */
const skirtWeight = (Y: number, P: number) => (1 - smooth(0.06, 0.2, Y)) * smooth(0.3, 0.6, P);
/** The stem narrows above the base (the base itself slumps outward instead). */
export const STEM_BAND = [0.15, 0.28] as const;
/** The radial scale by material height: 1 at the base, the stem's above it, the cap's at the top. */
export const radialScale = (Y: number, s: CloudState) => 1 + (s.stem - 1) * smooth(STEM_BAND[0], STEM_BAND[1], Y) + (s.cap - s.stem) * capWeight(Y);
/** The surface the slump follows: the plate's top, falling to the table over its rounded rim. */
export const slumpSurface = (r: number) => plateTop(Math.min(r, PLATE.radius)) * (1 - smooth(0.79, 0.95, r));

/**
 * The cloud on a clock at τ. `emitEnd` (a change of mind): the dome's drag stops there (it is
 * coming back down); `emitStart` > the release (a reveal resumed part-way): no cloud on this clock.
 */
export function cloudState(tau: number, emitStart = -Infinity, emitEnd = Infinity, out: CloudState = newCloudState()): CloudState {
  out.tau = tau;
  out.present = emitStart < 0.05;
  const a = Math.max(0, tau - CLOUD.release);
  out.age = a;
  out.dragUp = dragAt(Math.min(tau, emitEnd), out.dragSide);
  const U = riseAt(a);
  out.rise = U;
  out.cap = 1 + CLOUD.capGrow * U;
  out.squash = CLOUD.squash * smooth(0, 1.4, a);
  out.stem = 1 - CLOUD.stem * smooth(0, 1.2, a);
  out.skirt = CLOUD.skirt * (1 - Math.exp(-a / CLOUD.skirtTime)) * smooth(0, 0.35, a);
  out.roll = CLOUD.roll * (1 - Math.exp(-a / CLOUD.rollTime)) * smooth(0, 0.4, a);
  // The ring's core sits inside the cap's edge (where the dome's shoulder was), carried with it.
  const Ys = CLOUD.ringAt[1], Ps = CLOUD.ringAt[0] * CLOUD.radius;
  out.ringR = Ps * out.cap;
  out.ringY = Ys + U * riseWeight(Ys) * centreWeight(Ps) + out.dragUp * dragWeight(Ys) * dragCentre(Ps) - out.squash * capIntegral(Ys);
  out.ringSigma = CLOUD.ringCore * (1 + 0.4 * (out.cap - 1));
  out.turb = CLOUD.turb[0] + (CLOUD.turb[1] - CLOUD.turb[0]) * (1 - Math.exp(-a / CLOUD.turbTime)) * smooth(0, 0.3, a);
  out.lean.copy(LEAN_DIR).multiplyScalar(CLOUD.lean * smooth(0.1, 1.6, a));
  out.erode = 0.97 * Math.pow(smooth(CLOUD.erode[0], CLOUD.erode[1], a), 0.85);
  out.fade = 1 - smooth(CLOUD.life - CLOUD.fadeOut, CLOUD.life, a);
  out.floor = CLOUD.floor + CLOUD.floorGrow * smooth(0, 1.0, a);
  out.stemFade = CLOUD.stemFade * smooth(0.15, 1.3, a);
  return out;
}

export interface CloudMaterial {
  /** Where the air at the point was at the seat (plate-centred, su). */
  X: Vector3;
  /** The local dilution (the flow's expansion there: 1 at the seat). */
  dilution: number;
}

/** The thermal's updraft is strongest on its axis: the rise by material radius P (the cap's edge lags and droops). */
export const centreWeight = (P: number) => 1 - CLOUD.centre * Math.min(1, (P / CLOUD.radius) ** 2);
/** The vertical map's forward form: material (P, Y) → height after the rise, the drag and the cap's squash. */
/** The lifting dome draws the crown's air up most on its axis (a peak pulled after it), the edge least. */
export const dragCentre = (P: number) => 1.45 - 0.9 * Math.min(1, (P / CLOUD.radius) ** 2);
export const verticalForward = (Y: number, P: number, s: CloudState) => Y + s.rise * riseWeight(Y) * centreWeight(P) + s.dragUp * dragWeight(Y) * dragCentre(P) - s.squash * capIntegral(Y);
const verticalSlope = (Y: number, P: number, s: CloudState) => 1 + s.rise * riseWeightD(Y) * centreWeight(P) + s.dragUp * dragWeightD(Y) * dragCentre(P) - s.squash * capWeight(Y);
/** The stem and base evaporate as the uncovered plate re-heats them (their share of the light left). */
export const stemLeft = (Y: number, s: CloudState) => 1 - s.stemFade * (1 - smooth(0.12, 0.42, Y));
/** Bisection steps of the vertical solve (the map is monotonic; ≈ 0.04 mm over its bracket). */
export const VERTICAL_STEPS = 13;
/** Bisection steps of the radial solve (each with a vertical solve inside). */
export const OUTER_STEPS = 11;
/** Bisection steps of the slump's solve. */
export const SKIRT_STEPS = 10;

/**
 * The axisymmetric part of the inverse map (the shader tabulates exactly this per frame, in
 * models/dinnerSteam.ts): from (ρ, y), a point's distance from the plate's axis and its height,
 * after the lean and the side drag are undone, to the material's (P, Y) at the seat and the
 * local dilution. Each step undoes one part of the flow, newest first.
 */
export function axisInverse(rho0: number, y0: number, s: CloudState, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  // The vortex ring: a twirl about its core in the meridional plane (outward on top, down outside),
  // undone exactly (the rotation keeps the distance to the core).
  const ex = rho0 - s.ringR, ey = y0 - s.ringY;
  const phi = s.roll * Math.exp(-(ex * ex + ey * ey) / (s.ringSigma * s.ringSigma));
  const c = Math.cos(phi), sn = Math.sin(phi);
  // Forward is clockwise in (ρ right, y up); undo it counter-clockwise.
  const rho = Math.max(0, s.ringR + c * ex - sn * ey);
  const y = s.ringY + sn * ex + c * ey;
  // The rise (strongest on the axis), the dome's drag up and the cap's squash, and the radial scale
  // (the cap spreads, the stem narrows, by material height). For a material radius P the vertical
  // map is monotonic in the height (bisection gives Y*(P)), and P·S(Y*(P)) is monotonic in P (the
  // axis rises fastest), so an outer bisection finds P.
  const solveY = (Pm: number) => {
    let lo = y - s.rise - 1.5 * s.dragUp - 0.05, hi = y + s.squash + 0.05;
    for (let i = 0; i < VERTICAL_STEPS; i++) {
      const mid = 0.5 * (lo + hi);
      if (verticalForward(mid, Pm, s) < y) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  };
  const scale = (Ym: number) => radialScale(Ym, s);
  let lo = 0, hi = rho / Math.min(s.stem, 1) + 0.01;
  for (let k = 0; k < OUTER_STEPS; k++) {
    const mid = 0.5 * (lo + hi);
    if (mid * scale(solveY(mid)) < rho) lo = mid; else hi = mid;
  }
  let P = 0.5 * (lo + hi);
  let Y = solveY(P);
  const S = scale(Y);
  const stretch = verticalSlope(Y, P, s);
  // The base's slump outward over the rim, following the plate down to the table. For a material
  // height the slump is monotonic in the radius (bisection gives P*(Y)); the height it keeps over
  // the surface is then monotonic in Y (an outer bisection).
  if (s.skirt > 0) {
    const P1 = P, Y1 = Y;
    const solveP = (Ym: number) => {
      let a = Math.max(0, P1 - s.skirt - 0.01), b = P1;
      for (let i = 0; i < SKIRT_STEPS; i++) {
        const mid = 0.5 * (a + b);
        if (mid + s.skirt * skirtWeight(Ym, mid) < P1) a = mid; else b = mid;
      }
      return 0.5 * (a + b);
    };
    let a = Y1 - 0.2, b = Y1 + 0.2;
    for (let i = 0; i < SKIRT_STEPS; i++) {
      const mid = 0.5 * (a + b);
      if (mid + slumpSurface(P1) - slumpSurface(solveP(mid)) < Y1) a = mid; else b = mid;
    }
    Y = 0.5 * (a + b);
    P = solveP(Y);
  }
  out[0] = P; out[1] = Y; out[2] = stemLeft(Y, s) / (stretch * S * S);
  return out;
}

const ax: [number, number, number] = [0, 0, 0];
/**
 * The inverse map (the shader's, without its turbulence): where the air at p (scene units,
 * plate-centred) was before the release. The draught's lean and the dome's side drag are plan
 * shifts (the drag by the material height it finds first); the rest is `axisInverse`.
 */
export function cloudMaterial(p: Vector3, s: CloudState, out: CloudMaterial = { X: new Vector3(), dilution: 1 }): CloudMaterial {
  const h = Math.max(0, p.y - 0.15);
  let qx = p.x - s.lean.x * h, qz = p.z - s.lean.y * h;
  axisInverse(Math.hypot(qx, qz), p.y, s, ax);
  const w = dragWeight(ax[1]);
  qx -= s.dragSide.x * w;
  qz -= s.dragSide.y * w;
  const rho = Math.hypot(qx, qz);
  axisInverse(rho, p.y, s, ax);
  const dx = rho > 1e-6 ? qx / rho : 1, dz = rho > 1e-6 ? qz / rho : 0;
  out.X.set(dx * ax[0], ax[1], dz * ax[0]);
  out.dilution = ax[2];
  return out;
}

/** The cloud at the seat: the dome's cavity, soft at the wall, clear over the porcelain (0..1, no noise). */
export function cloudSeat(X: Vector3, floor: number = CLOUD.floor): number {
  const r = Math.hypot(X.x, X.z);
  const q = X.y - CLOUD.rim;
  const { radius: R, height: H, power: pw } = CLOUD;
  // A normalised distance to the cavity's wall (≈ su near it): the superellipse's p-norm radius.
  const k = q > 0 ? Math.pow(Math.pow(r / R, pw) + Math.pow(q / H, pw), 1 / pw) : r / R;
  const d = (1 - k) * Math.min(R, H);
  const inside = smooth(0, CLOUD.wall, d);
  const above = smooth(0, floor, X.y - plateTop(Math.min(r, PLATE.radius)));
  const grade = CLOUD.baseDensity + (1 - CLOUD.baseDensity) * smooth(0.05, 0.6, X.y);
  return inside * above * grade;
}

/** Visible steam evaporates as it rises. */
export const evaporation = (y: number) => Math.exp(-Math.max(0, y - CLOUD.evapFrom) / CLOUD.evaporate);

const mat: CloudMaterial = { X: new Vector3(), dilution: 1 };
/** The cloud's mean density at p on a clock (CPU mirror of the shader, without noise and erosion). */
export function cloudDensity(p: Vector3, s: CloudState): number {
  if (!s.present || s.fade <= 0) return 0;
  if (p.y < 0) return 0;
  cloudMaterial(p, s, mat);
  // (Never in the porcelain: the flow's roll can carry the edge of the base down onto it.)
  const above = smooth(0, 0.012, p.y - slumpSurface(Math.hypot(p.x, p.z)));
  return cloudSeat(mat.X, s.floor) * Math.min(1, mat.dilution) * evaporation(p.y) * s.fade * above;
}

// ── The veil: the plate's thin column ─────────────────────────────────────────
/**
 * The veil's source at emission time τ: full over VEIL.ramp from VEIL.t0, a first rush and a long
 * thin tail. A release window [emitStart, emitEnd] (a change of mind): nothing before emitStart,
 * ramped up from it like a first release; dying away over VEIL.cut after emitEnd.
 */
export function veilSource(tau: number, emitStart = -Infinity, emitEnd = Infinity): number {
  const a = tau - VEIL.t0;
  if (a <= 0 || tau <= emitStart || tau >= emitEnd + VEIL.cut) return 0;
  const k = Math.max(0, a - VEIL.ramp);
  const flow = (1 - VEIL.tail) * Math.exp(-k / VEIL.decay) + VEIL.tail * Math.exp(-k / VEIL.tailDecay);
  // (Visible steam: as the flow thins the column narrows to fewer ribbons that keep their light,
  // so its density falls as flow^gather; the plate stops steaming visibly at VEIL.end.)
  return smooth(0, VEIL.ramp, a) * Math.pow(flow, VEIL.gather) * (1 - smooth(VEIL.end[0], VEIL.end[1], tau))
    * (emitStart > -Infinity ? smooth(emitStart, emitStart + VEIL.ramp, tau) : 1)
    * (emitEnd < Infinity ? 1 - smooth(emitEnd, emitEnd + VEIL.cut, tau) : 1);
}

/** The veil's mean density at height h over the well (on its axis) at τ: the source as it was h/rise ago. */
export function veilDensity(h: number, tau: number, emitStart = -Infinity, emitEnd = Infinity): number {
  if (h < 0) return 0;
  const w = VEIL.radius + VEIL.spread * h;
  return VEIL.strength * veilSource(tau - h / VEIL.rise, emitStart, emitEnd) * smooth(0, VEIL.base, h) * Math.exp(-h / VEIL.evaporate)
    * (VEIL.radius / w) * (VEIL.radius / w) * (1 - smooth(VEIL.length - VEIL.top, VEIL.length, h));
}

/**
 * The accepted still (posters, reduced motion, a saved accept): the steam at rest. null shows the
 * clean plate (steam is carried by its motion: a frozen wisp reads as a smudge, v1.5).
 */
export const STEAM_REST: { tau: number; fade: number } | null = null;

/** Density below which the steam has gone (its last wisps lift the cove by a level or two at most). */
export const STEAM_GONE = 0.006;

/** The veil's last visible τ for a release window (coarse: a few thousand evaluations). */
function veilEnd(from: number, emitStart = -Infinity, emitEnd = Infinity, step = 0.01): number {
  let t = from;
  for (; t < 12; t += step) {
    let max = 0;
    for (let h = 0; h <= VEIL.length && max < STEAM_GONE; h += 0.02) max = Math.max(max, veilDensity(h, t, emitStart, emitEnd));
    if (t > VEIL.t0 + VEIL.ramp && max < STEAM_GONE) break;
  }
  return t;
}

/** When the reveal's steam has gone (s of τ): the cloud's life, and the veil below STEAM_GONE everywhere. */
export const STEAM_END = Math.ceil(Math.max(CLOUD.release + CLOUD.life, veilEnd(VEIL.t0)) * 100) / 100;

/**
 * When steam whose release stopped at `emitEnd` (a change of mind) has gone (s of τ, ≤ STEAM_END):
 * its cloud's life (if it carries one) and its veil.
 */
export function steamEndAfter(emitEnd: number, emitStart = -Infinity): number {
  let end = emitEnd;
  if (emitStart < 0.05) end = Math.max(end, CLOUD.release + CLOUD.life);
  end = Math.max(end, veilEnd(Math.max(VEIL.t0, emitEnd), emitStart, emitEnd, 0.05));
  return Math.min(STEAM_END, Math.ceil(end * 100) / 100);
}

/**
 * Steam a change of mind leaves behind is stirred: the cover comes back down through it and the dish
 * is carried off, so it mixes in faster than in still air (v1.5, kept). Its light falls with this
 * time scale (s) from the cut, from a smooth start.
 */
export const STEAM_STIR = 0.3;
export function stirFade(age: number): number {
  const e = Math.max(0, age);
  return Math.exp(-(e * e) / (STEAM_STIR * (e + 0.2)));
}
/** Once the cover is back on, the decline lifts the dish through what is left: its wake breaks it up. */
export const STEAM_WAKE = 0.16;
export function wakeFade(sinceCapture: number): number {
  const e = Math.max(0, sinceCapture);
  return Math.exp(-(e * e) / (STEAM_WAKE * (e + 0.1)));
}
/** The light left in steam left behind at `cut` (`capture`: when the cover closed, if it has). */
export function leftSteamFade(tau: number, cut: number, capture = Infinity): number {
  return stirFade(tau - cut) * wakeFade(tau - capture);
}
/** When steam left behind at `cut` has gone: its own life, or below 1 % of its light (≤ STEAM_END). */
export function leftSteamEnd(cut: number, emitStart = -Infinity, capture = Infinity): number {
  let until = steamEndAfter(cut, emitStart);
  for (let t = cut; t < until; t += 0.02) {
    if (leftSteamFade(t, cut, capture) < 0.01) { until = Math.min(until, Math.ceil(t * 100) / 100); break; }
  }
  return until;
}

/**
 * The cloud's look at its thermal age (the shader's per-clock uniforms; v1.6 polish). The cloud's
 * edge is where its saturated air meets the room's dry air: a boundary, not a fuzz. The shader
 * takes the signed distance to the cavity's wall in material space (so it is carried, stretched
 * and rolled with the air), moves it by billows (`billow`: convex lobes 1–2 cm across, cauliflower
 * edges) and a larger turbulent swell (`amp`), and remaps it through a narrow band (`band`: ≈ 2.5 mm
 * young, widening to ≈ 1 cm as the room's air mixes in). Inside is a silky fog (`core`) that empties
 * as it ages; at the boundary the mixing layer keeps a thin sheet (`sheet`, `sheetWidth`): steam's
 * bright folds. `warp` folds the lobes by the large field.
 */
export interface CloudLook { amp: number; band: number; billow: number; warp: number; core: number; sheet: number; sheetWidth: number }
export function cloudLook(age: number, _erode = 0, out: CloudLook = { amp: 0, band: 0, billow: 0, warp: 0, core: 0, sheet: 0, sheetWidth: 0 }): CloudLook {
  out.amp = 0.008 + 0.07 * smooth(0.35, 1.5, age);
  out.band = 0.015 + 0.045 * smooth(0.35, 1.7, age);
  out.billow = 0.028 + 0.042 * smooth(0.25, 1.3, age);
  out.warp = 0.5 + 1.3 * smooth(0.25, 1.5, age);
  out.core = 1.3 + (0.07 - 1.3) * smooth(0.3, 1.4, age);
  out.sheet = 0.35 + 0.4 * smooth(0.3, 1.0, age) - 0.3 * smooth(1.2, 2.3, age);
  out.sheetWidth = 0.012 + 0.035 * smooth(0.3, 1.7, age);
  return out;
}

/**
 * The forward map (the inverse of `axisInverse`, for bounds and tests): where the air at material
 * (P, Y) at the seat is now, as (ρ, y) about the plate's axis, before the lean and the side drag.
 */
export function axisForward(P: number, Y: number, s: CloudState, out: [number, number] = [0, 0]): [number, number] {
  // The base's slump.
  let P1 = P, Y1 = Y;
  if (s.skirt > 0) {
    P1 = P + s.skirt * skirtWeight(Y, P);
    Y1 = Y + (slumpSurface(P1) - slumpSurface(P));
  }
  // The radial scale and the rise.
  const S = radialScale(Y1, s);
  const rho = P1 * S, y = verticalForward(Y1, P1, s);
  // The vortex ring's roll (clockwise in (ρ right, y up)).
  const ex = rho - s.ringR, ey = y - s.ringY;
  const phi = s.roll * Math.exp(-(ex * ex + ey * ey) / (s.ringSigma * s.ringSigma));
  const c = Math.cos(phi), sn = Math.sin(phi);
  out[0] = Math.max(0, s.ringR + c * ex + sn * ey);
  out[1] = s.ringY - sn * ex + c * ey;
  return out;
}

/** The cavity's outline at the seat (material (P, Y) on the cloud's wall and floor), sampled. */
const OUTLINE: readonly [number, number][] = (() => {
  const pts: [number, number][] = [];
  const { radius: R, height: H, power: pw, rim } = CLOUD;
  for (let i = 0; i <= 16; i++) {
    const q = (i / 16) * H;
    pts.push([R * Math.pow(Math.max(0, 1 - Math.pow(q / H, pw)), 1 / pw), rim + q]);
  }
  for (let i = 0; i <= 8; i++) {
    const P = (i / 8) * R;
    pts.push([P, plateTop(P)]);
    pts.push([P, rim + 0.5 * H * (i / 8)]);
  }
  return pts;
})();

const fw: [number, number] = [0, 0];
const BOUNDS_LOOK = cloudLook(0);
/**
 * The volume's bounds on a clock (plate-centred su, conservative): the cloud's outline carried by
 * the flow (plus the turbulence, the noise's reach and the lean), and the veil as far as it has
 * risen. The shader marches only inside them.
 */
export function steamBounds(
  s: CloudState, veil: { tau: number; emitStart: number; emitEnd: number } | null, cloudMin: Vector3, cloudMax: Vector3, veilMin: Vector3, veilMax: Vector3,
  spillMin: Vector3 = new Vector3(), spillMax: Vector3 = new Vector3(),
): void {
  cloudMin.set(Infinity, Infinity, Infinity);
  cloudMax.set(-Infinity, -Infinity, -Infinity);
  veilMin.copy(cloudMin);
  veilMax.copy(cloudMax);
  spillMin.copy(cloudMin);
  spillMax.copy(cloudMax);
  if (s.present && s.fade > 0) {
    let rMax = 0, yMin = Infinity, yMax = -Infinity;
    for (const [P, Y] of OUTLINE) {
      axisForward(P, Y, s, fw);
      rMax = Math.max(rMax, fw[0]);
      yMin = Math.min(yMin, fw[1]);
      yMax = Math.max(yMax, fw[1]);
    }
    // (The turbulence's warp, and the billows and swell that move the edge in material space.)
    const look = cloudLook(s.age, s.erode, BOUNDS_LOOK);
    const m = 0.1 + 1.6 * s.turb + look.amp + look.billow;
    const lean = s.lean.length() * Math.max(0, yMax - 0.15);
    const r = rMax + m + lean + s.dragSide.length();
    cloudMin.set(-r, Math.max(0, yMin - m), -r);
    cloudMax.set(r, Math.min(CLOUD_Y_MAX, yMax + m), r);
  }
  // The spill climbs the dome's outer wall, wherever the dome is while it shows.
  if (veil && spillFade(veil.tau) > 0 && veil.tau < SPILL.fade[1]) {
    sampleSequence('accept', Math.min(veil.tau, veil.emitEnd), frame);
    const c = frame.coverPos, r = COVER.radius + 0.12;
    spillMin.set(c.x - r, Math.max(0, c.y - 0.12), c.z - r);
    spillMax.set(c.x + r, c.y + COVER.domeHeight + 0.1, c.z + r);
  }
  if (veil) {
    // From where its source stopped (or the porcelain) to as high as its first vapour has risen.
    const { tau, emitStart, emitEnd } = veil;
    const top = Math.min(VEIL.length, Math.max(0, (tau - Math.max(VEIL.t0, emitStart)) * VEIL.rise) + 0.1);
    const stop = emitEnd + VEIL.cut;
    const bottom = tau > stop ? Math.max(0, (tau - stop) * VEIL.rise - 0.1) : 0;
    if (top > bottom) {
      const r = VEIL.radius + VEIL.spread * top + 0.6 * s.lean.length() * top + 0.08;
      veilMin.set(-r, bottom, -r);
      veilMax.set(r, top + 0.03, r);
    }
  }
}

/** The flow map's height (su): nothing of the cloud is drawn above it. */
export const CLOUD_Y_MAX = 2.6;
