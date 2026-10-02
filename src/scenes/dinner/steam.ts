import { Euler, Vector3 } from 'three';
import { COVER, COVER_PROFILE, plateTop } from '../../../models/dinnerContract.ts';
import { newFrame, REVEAL_DIR, sampleSequence } from './sequences.ts';

/**
 * Dinner v1.5: the steam under the cloche (Surya: "steam under the cloche after unveiling it").
 *
 * A pure plan, deterministic in steam time τ (seconds since the reveal began, the accept's own
 * clock), seeded: every puff of vapour is decided here from the reveal's choreography, and its
 * whole life is a closed-form function of its age (`puffAt`, mirrored exactly by the vertex
 * shader in models/dinnerSteam.ts). Nothing integrates, so replay, rewind and frame rate cannot
 * accumulate anything.
 *
 * What it models (research notes in docs/scenes/dinner-v1.5.md). Visible steam is not the vapour
 * itself but droplets that condense where warm saturated air meets the cooler room, and that
 * evaporate again as it mixes in: so it appears a short way off its source, billows, breaks into
 * wisps and is gone within a second or two, rising at the speed of a gentle thermal (5–15 cm/s,
 * decelerating as it entrains room air).
 *  1. Spill. A tipped dome is a doorway at its raised rim: an exchange flow carries the warm
 *     layer out under the rim edge while room air runs in along the plate. The outflow rolls up
 *     into a curl round the lip bead and climbs the dome's outer skirt. It starts on the raised
 *     (guest, camera) side, strongest where the gap is widest.
 *  2. Release. As the rim leaves the plate (0.20–0.34 s) room air rushes in under it and mixes
 *     with the bottom of the pocket: the raised side's curl widens round the rim.
 *  3. Pocket. The warm air the dome held sits at its crown and goes up with it, but the dome is
 *     then carried off sideways (≈ 1 m/s) and the pocket, buoyant, is left behind: a cloud the
 *     shape of the dome's inside, revealed from the trailing side as the shell slides off it,
 *     drawn a little after the dome by its wake.
 *  4. Trail. The dome sheds what is left of its pocket from its trailing rim as it travels.
 *  5. Column. The uncovered plate's warm, moist boundary layer necks in and rises from the well as
 *     a gentle column that thins as the source weakens and is gone by STEAM_END.
 *
 * Units: Dinner scene units (1 su = 16.9 cm, DINNER_WORLD_SCALE); the plate is at the origin
 * (the reveal never moves it). Physical speeds are noted in cm/s where they were chosen.
 */

export type PuffKind = 'spill' | 'release' | 'pocket' | 'trail';
export const PUFF_KINDS: readonly PuffKind[] = ['spill', 'release', 'pocket', 'trail'];

export interface Puff {
  kind: PuffKind;
  /** Spawn time (τ) and lifetime (s). */
  t0: number;
  life: number;
  /** Spawn position and emission velocity (su, su/s). */
  pos: Vector3;
  vel: Vector3;
  /** Buoyant rise scale W (su/s; peak rise speed ≈ 0.74 W). */
  rise: number;
  /** Necking towards the plume axis (fraction of the spawn radius drawn in), column only. */
  neck: number;
  /** Radius at birth (su) and growth by entrainment (su/s). */
  size: number;
  grow: number;
  /** Peak opacity (before the dilution and the evaporation fade). */
  peak: number;
  /** Seed: offsets the puff's noise and its meander phases. */
  seed: number;
  /** Meander amplitude per su of rise. */
  sway: number;
  /** Spill curl: outward direction (plan), radius (su) and turn rate (rad/s). */
  out: Vector3;
  curl: number;
  curlRate: number;
}

/** Trajectory constants shared with the shader (seconds). */
export const STEAM_TIME = {
  /** Emission momentum decays in air (a small jet stalls within ~0.2 s). */
  drag: 0.18,
  /** Buoyant acceleration from rest. */
  accel: 0.2,
  /** Deceleration by entrainment (a thermal slows as it mixes in room air). */
  mix: 1.6,
  /** Necking of the plate's boundary-layer flow into the column. */
  neck: 0.45,
  /** The spill's roll-up decays over this time (the curl turns about 200° in all). */
  curl: 0.35,
  /** Condensation forms this quickly once the vapour meets room air. */
  fadeIn: 0.12,
} as const;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ── Deterministic sampling ───────────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Puff counts per kind (one instanced draw for all of them). */
export const PUFF_COUNTS: Readonly<Record<PuffKind, number>> = { spill: 16, release: 8, pocket: 14, trail: 8 };

const frame = newFrame();
const euler = new Euler();
/** The cover's rim point at plan angle `a` (cover space), posed at accept time t. */
function rimAt(t: number, a: number, out: Vector3): Vector3 {
  sampleSequence('accept', t, frame);
  euler.set(frame.coverTiltX, 0, frame.coverTilt);
  return out.set(Math.cos(a) * COVER.lipRadius, 0, Math.sin(a) * COVER.lipRadius).applyEuler(euler).add(frame.coverPos);
}
/** Cover velocity at accept time t (central difference; the reveal is pure in t). */
function coverVelocity(t: number, out: Vector3): Vector3 {
  const h = 0.004;
  sampleSequence('accept', Math.max(0, t - h), frame);
  const a = frame.coverPos.clone();
  sampleSequence('accept', t + h, frame);
  return out.copy(frame.coverPos).sub(a).divideScalar(t + h - Math.max(0, t - h));
}

/** The dome's outer radius at height y in cover space (COVER_PROFILE, linear). */
function domeRadiusAt(y: number): number {
  for (let i = 1; i < COVER_PROFILE.length; i++) {
    const [r1, y1] = COVER_PROFILE[i]!;
    if (y <= y1) {
      const [r0, y0] = COVER_PROFILE[i - 1]!;
      return y1 > y0 ? r0 + ((r1 - r0) * (y - y0)) / (y1 - y0) : r1;
    }
  }
  return 0;
}

/** Plan angle of the raised (guest-side) rim on the reveal: opposite the path. */
const RAISED = Math.atan2(-REVEAL_DIR.z, -REVEAL_DIR.x);

let cache: Puff[] | null = null;
/** Every puff of the reveal, in spawn order (deterministic: one fixed seed; built once). */
export function steamPuffs(): readonly Puff[] {
  return (cache ??= buildPuffs());
}

/** The puff plan, built from scratch (steamPuffs caches it). */
export function buildPuffs(): Puff[] {
  const rnd = mulberry32(0x5eed_d1e);
  const range = (a: number, b: number) => a + (b - a) * rnd();
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 0.5;
  const puffs: Puff[] = [];
  const v = new Vector3(), rim = new Vector3(), cv = new Vector3();
  const base = (kind: PuffKind): Puff => ({
    kind, t0: 0, life: 1, pos: new Vector3(), vel: new Vector3(), rise: 0, neck: 0, size: 0.1, grow: 0.2, peak: 0.1,
    seed: rnd() * 97, sway: 0, out: new Vector3(), curl: 0, curlRate: 0,
  });

  // 1. Spill: under the raised rim while the far rim is still on the plate (0.03–0.26 s), more of
  // it as the gap opens (stratified on a ramp), spread round the raised side by the local gap.
  for (let i = 0, n = PUFF_COUNTS.spill; i < n; i++) {
    const p = base('spill');
    p.t0 = 0.03 + 0.23 * Math.sqrt((i + rnd()) / n);
    // Gap round the rim ∝ 1 + cos Δφ (the far rim is the pivot): weight the angle by it.
    let d = 0;
    for (let k = 0; k < 8; k++) { d = gauss() * 0.75; if (Math.abs(d) < 1.35) break; }
    const a = RAISED + d;
    rimAt(p.t0, a, rim);
    const gap = Math.max(0, rim.y - plateTop(Math.hypot(rim.x, rim.z)));
    p.out.set(Math.cos(a), 0, Math.sin(a));
    // Out of the top of the gap, round the bead: the warm layer leaves under the rim edge and,
    // buoyant, turns straight up the outside of the skirt (it climbs the warm metal).
    p.pos.copy(rim).addScaledVector(p.out, 0.02);
    p.pos.y = Math.max(rim.y - 0.1 * gap, plateTop(Math.hypot(p.pos.x, p.pos.z)) + 0.012);
    // Exchange flow through a gap of height g: u ≈ 0.5 √(g' g), g' ≈ 1.2 m/s² (≈ 45 K warmer):
    // 5–7 cm/s for a 1–2 cm gap (0.3–0.45 su/s), turned upward by its buoyancy at once; the
    // cover's own motion entrains a little.
    const u = 0.5 * Math.sqrt(1.2 * Math.max(gap, 0.01) * 0.169) / 0.169;
    coverVelocity(p.t0, cv);
    p.vel.copy(p.out).multiplyScalar(0.35 * u * range(0.8, 1.2)).addScaledVector(cv, 0.3);
    p.vel.y += u * range(0.8, 1.1);
    p.rise = range(0.75, 1.0);
    p.size = 0.08 + 0.6 * gap + range(0, 0.02);
    p.grow = range(0.26, 0.34);
    p.life = range(0.5, 0.8);
    p.peak = range(0.55, 0.7) * (0.6 + 0.4 * Math.min(1, gap / 0.08));
    p.sway = range(0.05, 0.09);
    p.curl = range(0.035, 0.06) * (0.5 + Math.min(1, gap / 0.1));
    p.curlRate = range(8, 11);
    puffs.push(p);
  }

  // 2. Release, low: as the rim leaves the plate (0.20–0.34 s) room air rushes in under it and
  // mixes with the bottom of the pocket, widening the raised side's curl round the rim.
  for (let i = 0, n = PUFF_COUNTS.release; i < n; i++) {
    const p = base('release');
    p.t0 = 0.2 + 0.14 * ((i + rnd()) / n);
    const a = RAISED + gauss() * 0.75;
    const r = range(0.5, 0.7);
    p.out.set(Math.cos(a), 0, Math.sin(a));
    p.pos.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    const floor = plateTop(r);
    rimAt(p.t0, a, rim);
    p.pos.y = floor + 0.03 + (Math.max(rim.y, floor + 0.1) - floor - 0.03) * (0.35 + 0.65 * rnd());
    coverVelocity(p.t0, cv);
    p.vel.copy(p.out).multiplyScalar(range(0.1, 0.25));
    p.vel.y += Math.max(0, cv.y) * range(0.15, 0.3) + 0.05;
    p.rise = range(0.6, 0.9);
    p.size = range(0.1, 0.16);
    p.grow = range(0.26, 0.36);
    p.life = range(0.6, 0.9);
    p.peak = range(0.32, 0.45);
    p.sway = range(0.08, 0.14);
    p.curl = range(0.02, 0.05);
    p.curlRate = range(5, 8);
    puffs.push(p);
  }

  // 3. Pocket: the warm air the dome held, buoyant at its top, is left behind as the dome is
  // carried off sideways (0.30–0.52 s): a cloud the shape of the dome's inside, revealed from the
  // trailing (guest) side as the shell slides off it, drawn a little after the dome by its wake.
  for (let i = 0, n = PUFF_COUNTS.pocket; i < n; i++) {
    const p = base('pocket');
    p.t0 = 0.3 + 0.22 * ((i + rnd()) / n);
    sampleSequence('accept', p.t0, frame);
    euler.set(frame.coverTiltX, 0, frame.coverTilt);
    // Warm air rises to the crown: heights weighted upward inside the dome.
    const yc = 0.04 + 0.48 * (1 - Math.pow(rnd(), 1.6));
    const rc = domeRadiusAt(yc) * 0.85 * Math.sqrt(rnd()), a = rnd() * Math.PI * 2;
    p.pos.set(Math.cos(a) * rc, yc, Math.sin(a) * rc).applyEuler(euler).add(frame.coverPos);
    coverVelocity(p.t0, cv);
    p.vel.copy(cv).multiplyScalar(range(0.22, 0.42));
    v.set(gauss(), gauss() * 0.5, gauss()).multiplyScalar(0.08);
    p.vel.add(v);
    p.rise = range(0.7, 1.0);
    p.size = range(0.13, 0.2);
    p.grow = range(0.3, 0.4);
    p.life = range(0.55, 0.85);
    p.peak = range(0.4, 0.55);
    p.sway = range(0.08, 0.14);
    puffs.push(p);
  }

  // 4. Trail: shed from the trailing rim as the dome is carried away (0.33–0.62 s), thinning.
  for (let i = 0, n = PUFF_COUNTS.trail; i < n; i++) {
    const p = base('trail');
    const u = (i + rnd()) / n;
    p.t0 = 0.33 + 0.29 * u;
    coverVelocity(p.t0, cv);
    const back = Math.atan2(-cv.z, -cv.x) + gauss() * 0.45;
    rimAt(p.t0, back, rim);
    p.pos.copy(rim);
    p.pos.y -= range(0.01, 0.05);
    p.vel.set(cv.x, 0, cv.z).multiplyScalar(range(0.2, 0.4));
    p.vel.y += 0.08;
    p.rise = range(0.55, 0.75);
    p.size = range(0.08, 0.13);
    p.grow = range(0.22, 0.3);
    p.life = range(0.5, 0.7);
    p.peak = range(0.3, 0.42) * (1 - 0.6 * u);
    p.sway = range(0.06, 0.1);
    puffs.push(p);
  }

  return puffs;
}

// ── The column: plumes off the uncovered plate ──────────────────────────────────
/**
 * One plume of the column: a thin rising sheet of vapour from a point of the plate's well, drawn
 * as a camera-facing ribbon. The vapour climbs it at `rise` (su/s); the meander is frozen
 * turbulence carried up with it (travelling waves in h − rise·τ), laminar at the base and growing
 * with height; the sheet widens by entrainment. What shows at height h left the plate h/rise
 * earlier, so as the source weakens the column thins from the bottom up and its last wisp rises
 * away (`plumeDensity`).
 */
export interface Plume {
  base: Vector3;
  /** The source starts (τ, once the rim has cleared it) and decays from t0 + PLUME.ramp. */
  t0: number;
  decay: number;
  rise: number;
  /** Peak opacity of the sheet at its base. */
  strength: number;
  /** Half-width at the base (su) and its growth per su of height. */
  width: number;
  spread: number;
  /** Meander amplitude per su of height, along two horizontal directions. */
  sway: number;
  dir1: Vector3;
  dir2: Vector3;
  seed: number;
}

export const PLUME = {
  /**
   * Ribbon length (su, 25 cm): visible steam is gone by this height; the last of it fades out over
   * its top `top` su, so the ribbon never shows an end.
   */
  length: 1.5,
  top: 0.4,
  /** The source ramps up over this time once the dome's rim has cleared it. */
  ramp: 0.2,
  /** Visible steam evaporates as it rises: density e^(−h/evaporate) (≈ 15 cm). */
  evaporate: 1.0,
  /**
   * Meander wavelengths (su) of the centreline, the big lazy S and a smaller kink at
   * `wave2Share` of its amplitude: kept long enough that wherever the sheet shows, the path, with
   * the wake's lean, never slopes past 45° (the small curls are the wisps' own warp, in the
   * shader).
   */
  wave1: 1.0,
  wave2: 0.5,
  wave2Share: 0.3,
  /**
   * The dome's wake: carried off towards the back-left at ≈ 1 m/s, the cloche drags the room's
   * air after it, a slow drift that leans the young column along the reveal's path (su of lean
   * per su of height) and dies away (s) as the room settles.
   */
  drift: 0.32,
  driftDecay: 0.8,
} as const;

/** The wake's lean of the column at τ (su per su of height, along REVEAL_DIR). */
export function plumeDrift(tau: number): number {
  return PLUME.drift * Math.exp(-Math.max(0, tau - 0.5) / PLUME.driftDecay) * smooth(0.25, 0.5, tau);
}

export const PLUME_COUNT = 6;

let plumeCache: Plume[] | null = null;
/** The column's plumes (deterministic; built once). */
export function steamPlumes(): readonly Plume[] {
  return (plumeCache ??= buildPlumes());
}

/** The plume plan, built from scratch (steamPlumes caches it). */
export function buildPlumes(): Plume[] {
  const rnd = mulberry32(0xc01_5ea);
  const range = (a: number, b: number) => a + (b - a) * rnd();
  const plumes: Plume[] = [];
  for (let i = 0; i < PLUME_COUNT; i++) {
    // Spread over the well, a little more towards its middle; the first plumes are the strongest.
    const r = 0.34 * Math.sqrt((i + rnd()) / PLUME_COUNT), a = (i * 2.39996 + rnd() * 0.6) % (Math.PI * 2);
    const base = new Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    base.y = plateTop(r);
    const d1 = range(0, Math.PI * 2), d2 = d1 + range(1.2, 1.9);
    plumes.push({
      base,
      // The rim clears the well between 0.26 and 0.34 s (it lifts off at ≈ 0.22 s).
      t0: range(0.3, 0.42),
      decay: range(0.55, 0.75),
      // 13–16 cm/s: steam off a hot surface (a thermal plume, w ≈ 0.1–0.3 m/s).
      rise: range(0.78, 0.95),
      strength: range(0.85, 1.0) * (1 - 0.3 * (i / PLUME_COUNT)),
      width: range(0.035, 0.05),
      spread: range(0.13, 0.19),
      sway: range(0.06, 0.085),
      dir1: new Vector3(Math.cos(d1), 0, Math.sin(d1)),
      dir2: new Vector3(Math.cos(d2), 0, Math.sin(d2)),
      seed: rnd() * 61,
    });
  }
  return plumes;
}

/** Source strength of a plume at τ (0 before it starts). */
export function plumeSource(p: Plume, tau: number): number {
  const a = tau - p.t0;
  if (a <= 0) return 0;
  return smooth(0, PLUME.ramp, a) * Math.exp(-Math.max(0, a - PLUME.ramp) / p.decay);
}

/**
 * Mean density of a plume's sheet at height h (su along it) at τ, before its wisp noise: the
 * source as it was h/rise ago, thinned by evaporation and by the sheet's widening. The shader
 * computes the same.
 */
export function plumeDensity(p: Plume, h: number, tau: number): number {
  if (h < 0) return 0;
  const w = p.width + p.spread * h;
  return p.strength * plumeSource(p, tau - h / p.rise) * Math.exp(-h / PLUME.evaporate) * Math.sqrt(p.width / w) * (1 - smooth(PLUME.length - PLUME.top, PLUME.length, h));
}

/** A plume's centreline at height h and τ (CPU mirror of the ribbon vertex shader). */
export function plumeCenter(p: Plume, h: number, tau: number, out: Vector3): Vector3 {
  const amp = p.sway * Math.pow(h, 1.2);
  const k1 = (2 * Math.PI) / PLUME.wave1, k2 = (2 * Math.PI) / PLUME.wave2;
  const s = h - p.rise * tau;
  out.copy(p.base);
  out.y += h;
  out.addScaledVector(REVEAL_DIR, plumeDrift(tau) * h);
  out.addScaledVector(p.dir1, amp * Math.sin(k1 * s + p.seed));
  out.addScaledVector(p.dir2, PLUME.wave2Share * amp * Math.sin(k2 * s + 1.7 * p.seed));
  return out;
}

/**
 * The accepted still (posters, reduced motion, a saved accept): the steam at rest. null shows the
 * clean plate with no steam; { tau, fade } freezes the column at τ, scaled by `fade`.
 */
export const STEAM_REST: { tau: number; fade: number } | null = null;
/** A change of mind fades the steam already released over this time (s) as the cover returns. */
export const STEAM_CHANGE_FADE = 0.5;

/**
 * When the steam has gone (s of τ): the last puff, and the column once every plume's density has
 * fallen below 1 % everywhere along it (white at 1 % over the greige cove moves it 0.3 of an
 * 8-bit step: gone).
 */
export const STEAM_END = (() => {
  let end = Math.max(...steamPuffs().map((p) => p.t0 + p.life));
  for (const p of steamPlumes()) {
    let t = p.t0;
    for (; t < 10; t += 0.01) {
      let max = 0;
      for (let h = 0; h <= PLUME.length; h += 0.02) max = Math.max(max, plumeDensity(p, h, t));
      if (t > p.t0 + PLUME.ramp && max < 0.01) break;
    }
    end = Math.max(end, t);
  }
  return Math.ceil(end * 100) / 100;
})();

export interface PuffState {
  center: Vector3;
  radius: number;
  opacity: number;
  /** Erosion threshold: the puff breaks into wisps as it ages (0 solid → 1 gone). */
  erode: number;
}

const { drag: TD, accel: TB, mix: TM, neck: TC, curl: TCURL, fadeIn: TIN } = STEAM_TIME;
/** Vertical rise of a puff of scale W at age a: buoyant start, entraining deceleration. */
export function riseAt(W: number, a: number): number {
  return (W / (1 - TB / TM)) * (TM * (1 - Math.exp(-a / TM)) - TB * (1 - Math.exp(-a / TB)));
}
/** Meander phases from the seed (the shader derives the same). */
const fract = (x: number) => x - Math.floor(x);
/**
 * A puff at steam time τ (null when not alive). This is the CPU mirror of the vertex shader in
 * models/dinnerSteam.ts, used by the tests and for bounds; keep both in step.
 */
export function puffAt(p: Puff, tau: number, out: PuffState): PuffState | null {
  const a = tau - p.t0;
  if (a < 0 || a > p.life) return null;
  const c = out.center.copy(p.pos).addScaledVector(p.vel, TD * (1 - Math.exp(-a / TD)));
  const rise = riseAt(p.rise, a);
  c.y += rise;
  // Necking (column): the plate's boundary layer draws in towards the axis as it rises.
  const k = p.neck * (1 - Math.exp(-a / TC));
  c.x -= p.pos.x * k;
  c.z -= p.pos.z * k;
  // Curl (spill): the outflow rolls up round the lip, outward, up and back over.
  if (p.curl > 0) {
    const th = p.curlRate * TCURL * (1 - Math.exp(-a / TCURL));
    c.addScaledVector(p.out, p.curl * Math.sin(th));
    c.y += p.curl * (1 - Math.cos(th));
  }
  // Meander: grows with height (laminar near the source, turbulent above).
  const amp = p.sway * rise;
  const h1 = fract(p.seed * 0.137), h2 = fract(p.seed * 0.291), h3 = fract(p.seed * 0.533);
  c.x += amp * (Math.sin((2.1 + 1.6 * h1) * a + 6.283 * h2) + 0.5 * Math.sin((4.3 + 2.0 * h3) * a + 6.283 * h1));
  c.z += amp * (Math.sin((1.9 + 1.4 * h3) * a + 6.283 * h1) + 0.5 * Math.sin((3.7 + 2.2 * h2) * a + 6.283 * h3));
  out.radius = p.size + p.grow * a;
  // Condensation forms within TIN; dilution as it entrains (radius); evaporation in its last half.
  out.opacity = p.peak * smooth(0, TIN, a) * (1 - smooth(0.45 * p.life, p.life, a)) * Math.pow(p.size / out.radius, 0.8);
  out.erode = smooth(0, p.life, a);
  return out;
}

export function newPuffState(): PuffState {
  return { center: new Vector3(), radius: 0, opacity: 0, erode: 0 };
}
