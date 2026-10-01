import { Euler, MathUtils, Vector3 } from 'three';
import { CAMERA_ANGLES } from '../../render/camera.ts';
import { cubicBezier, EASE, lerp, seg, smoothstep } from '../../motion/curves.ts';
import {
  COVER, COVER_BESIDE, COVER_POISED, COVER_POISED_TILT, COVER_SEATED, DINNER_BIN_POS, DINNER_BIN_START, DINNER_CARRY,
  DISH_IN_BIN, PLATE,
} from '../../../models/dinnerContract.ts';
import type { CanonicalPose, SequenceName } from '../../core/types.ts';

/**
 * Pure authored choreography for Dinner (Dinner sub-spec): cover the dish, reveal the plate, or
 * put the whole covered dish in the shared bin. Every value is a function of time, so replay and
 * reversal restore plate, cover and bin exactly.
 *
 * v1.2 (the plate and cloche masters, no food): the cover is handled as a hand would handle it.
 * Every tilt is a lean θ about up × (its direction of travel), applied about a pivot in cover
 * space (`poseAbout`): the rim point that is on the plate or floor while it is in contact, the
 * handle's grip while it is carried, blended smoothly between them. So the reveal is handle-led
 * (the guest-side rim rises first while the far rim stays on the plate, then the cover comes up
 * and levels), every set-down lands the leading rim first and lowers the trailing side onto it,
 * and the rim rock follows on with the same angular speed (C1 in tilt at every beat boundary).
 */

export const DURATIONS = { host: 1.2, accept: 1.5, decline: 1.5 } as const;

export interface DinnerFrame {
  platePos: Vector3;
  coverPos: Vector3;
  /** cover_authored rotation.z: the poised cover tips towards the plate (+ leans to −x). */
  coverTilt: number;
  /** cover_authored rotation.x: with coverTilt, leans the cover along its path when it moves. */
  coverTiltX: number;
  dishVisible: boolean;
  binPos: Vector3;
  binVisible: boolean;
  flaps: number;
}

const ORIGIN = new Vector3(0, 0, 0);
/**
 * Height of the cover's rim whenever it moves over the plate. With no food (v1.2) the only thing
 * under it is the plate itself, so this is the plate's gilt rim plus a margin; the margin keeps
 * the v1.1 lift above the seat (0.34) so the host and reveal beats keep their heights and pace.
 */
export const SAFE_SKIRT = PLATE.rimHeight + 0.31;
const ABOVE_SEAT = new Vector3(0, SAFE_SKIRT, 0);

const set = (out: DinnerFrame, plate: Vector3, cover: Vector3, tilt: number) => {
  out.platePos.copy(plate);
  out.coverPos.copy(cover);
  out.coverTilt = tilt;
  out.coverTiltX = 0;
};
/** Horizontal direction from the seated cover to its resting place (the reveal's path). */
export const REVEAL_DIR = new Vector3(COVER_BESIDE.x - COVER_SEATED.x, 0, COVER_BESIDE.z - COVER_SEATED.z).normalize();
/** Direction the host's cover travels as it comes in to seat. */
export const COVER_DIR = new Vector3(COVER_SEATED.x - COVER_POISED.x, 0, COVER_SEATED.z - COVER_POISED.z).normalize();

const euler = new Euler();
const rk = new Vector3();
/**
 * Cover pose from its untilted path point `base` (where cover_authored would be, level), a lean θ
 * about up × dir (θ > 0 dips the rim on the +dir side) and a pivot `k` in cover space: the pivot
 * point stays where the level cover would have it. Small-angle lean as XYZ Euler, exactly as the
 * scene applies it.
 */
export function poseAbout(out: DinnerFrame, base: Vector3, theta: number, dir: Vector3, k: Vector3): void {
  out.coverTilt = -theta * dir.x;
  out.coverTiltX = theta * dir.z;
  rk.copy(k).applyEuler(euler.set(out.coverTiltX, 0, out.coverTilt));
  out.coverPos.copy(base).add(k).sub(rk);
}
/** Cover-space rim point on the +dir side (where the lip bead meets the plate or floor). */
const rimPoint = (dir: Vector3, out: Vector3) => out.set(dir.x * COVER.lipRadius, 0, dir.z * COVER.lipRadius);
/** The handle's grip, where a hand carries the cover. */
const GRIP = new Vector3(0, COVER.grip, 0);

/** Cubic Hermite on [0, 1] with end values and end slopes (slopes in value per unit u). */
function hermite(u: number, p0: number, m0: number, p1: number, m1: number): number {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
}

/**
 * The secondary settle (sub-spec: at most 1°): a heavy cover rocks once on its rim and comes to
 * rest. It rocks on the edge, so the lifted side rises and the other side stays on the surface;
 * the peak is about 0.95°, one cycle, well damped. It continues the set-down: the cover lands on
 * its leading rim, its trailing side comes down onto the surface (θ falls to 0 at `ROCK_RATE`),
 * and the same rotation carries on into the rock (θ < 0 first: the trailing rim takes the weight
 * and the leading side lifts), so the tilt is C1 through the contact.
 */
export const SETTLE_TILT = 0.0275;
/** θ'(0) of the rock for a settle of duration T: the set-down arrives at −ROCK_RATE(T). */
const rockRate = (T: number) => (SETTLE_TILT * 2 * Math.PI) / T;
function settle(out: DinnerFrame, u: number, dir: Vector3, rest: Vector3): void {
  const a = -SETTLE_TILT * Math.sin(2 * Math.PI * u) * (1 - u) ** 2;
  out.coverTilt = -a * dir.x;
  out.coverTiltX = a * dir.z;
  out.coverPos.copy(rest);
  out.coverPos.y += COVER.lipRadius * Math.abs(Math.sin(a));
}

export function frameFor(pose: CanonicalPose, out: DinnerFrame): DinnerFrame {
  if (pose === 'host-ready') {
    set(out, ORIGIN, COVER_POISED, 0);
    out.coverTilt = -COVER_POISED_TILT * COVER_DIR.x;
    out.coverTiltX = COVER_POISED_TILT * COVER_DIR.z;
  }
  else if (pose === 'accepted') set(out, ORIGIN, COVER_BESIDE, 0);
  else if (pose === 'declined') set(out, DISH_IN_BIN, DISH_IN_BIN.clone().add(COVER_SEATED), 0);
  else set(out, ORIGIN, COVER_SEATED, 0);
  out.dishVisible = pose !== 'declined';
  out.binPos.copy(pose === 'declined' ? DINNER_BIN_POS : DINNER_BIN_START);
  out.binVisible = pose === 'declined';
  out.flaps = 0;
  return out;
}

export function newFrame(): DinnerFrame {
  return frameFor('guest-ready', { platePos: new Vector3(), coverPos: new Vector3(), coverTilt: 0, coverTiltX: 0, dishVisible: true, binPos: new Vector3(), binVisible: false, flaps: 0 });
}

const base = new Vector3();
const k = new Vector3();
const rim = new Vector3();

// ── Host: 1.2 s ───────────────────────────────────────────────────────────────
const ALIGN = cubicBezier(0.4, 0, 0.3, 1);
/** Host beats: the leading rim touches the plate, the cover is flat on it, it has settled. */
export const HOST_TOUCH = 0.84;
export const HOST_FLAT = 0.9;
function host(t: number, out: DinnerFrame): void {
  frameFor('guest-ready', out);
  if (t >= HOST_FLAT) {
    // The rock on the rim into guest-ready.
    settle(out, seg(t, HOST_FLAT, DURATIONS.host), COVER_DIR, COVER_SEATED);
    return;
  }
  // 0–0.2: a small preparatory rise of the poised cover. 0.2–0.6: it aligns over the plate as it
  // comes down, passing SAFE_SKIRT exactly as it centres (0.60 s) without stopping, and keeps
  // lowering to land its leading (front) rim on the plate at HOST_TOUCH; then the back of the rim
  // comes down onto the plate by HOST_FLAT. The poised lean eases out over the whole approach, so
  // the cover is still tipped a little towards its landing side when it touches.
  const fromY = COVER_POISED.y + 0.03;
  if (t < 0.2) {
    base.copy(COVER_POISED);
    base.y += 0.03 * EASE.lift(seg(t, 0, 0.2));
  } else {
    const s = ALIGN(seg(t, 0.2, 0.6));
    base.set(lerp(COVER_POISED.x, ABOVE_SEAT.x, s), coverLowering(t, fromY), lerp(COVER_POISED.z, ABOVE_SEAT.z, s));
  }
  // Lean: the poised tilt held to 0.2 s, then down to 0 at HOST_FLAT arriving at the rock's rate.
  const m1 = (-rockRate(DURATIONS.host - HOST_FLAT) * (HOST_FLAT - 0.2)) / COVER_POISED_TILT;
  const theta = t < 0.2 ? COVER_POISED_TILT : COVER_POISED_TILT * hermite(seg(t, 0.2, HOST_FLAT), 1, 0, 0, m1);
  // Pivot: the cover's own origin while it is held poised (as v1.1), moving to the landing rim.
  rimPoint(COVER_DIR, rim);
  k.copy(rim).multiplyScalar(smoothstep(seg(t, 0.4, HOST_TOUCH)));
  poseAbout(out, base, theta, COVER_DIR, k);
}

/** Host lowering speed as the cover passes SAFE_SKIRT, centred, at 0.60 s (u/s). */
const LOWER_SPEED = -1.1;
/** Host base height 0.20–HOST_TOUCH: through SAFE_SKIRT at 0.60 s, landing softly on the seat. */
function coverLowering(t: number, fromY: number): number {
  if (t < 0.6) return hermite(seg(t, 0.2, 0.6), fromY, 0, SAFE_SKIRT, LOWER_SPEED * 0.4);
  return hermite(seg(t, 0.6, HOST_TOUCH), SAFE_SKIRT, LOWER_SPEED * (HOST_TOUCH - 0.6), COVER_SEATED.y, 0);
}

// ── Accept: 1.5 s ─────────────────────────────────────────────────────────────
/** Across the table, seat → beside: starts while the cover is still rising, eases into the landing. */
const REVEAL = cubicBezier(0.35, 0, 0.3, 1);
/** Rise off the plate once the guest-side rim has tipped up: slow to start, decelerating to the top. */
const RISE = cubicBezier(0.6, 0, 0.3, 1);
/** Accept beats: the rim tip, lift-off, the top, the leading rim lands, flat on the table, settled. */
export const ACCEPT = { tipPeak: 0.18, liftFrom: 0.1, top: 0.5, touch: 0.8, flat: 0.86, settled: 1.31 } as const;
/** Handle-led tip: the guest-side rim rises about 4.5° while the far rim stays on the plate. */
export const TIP = 0.078;
/** Landing lean: the far (leading) rim comes down first, the cover tipped about 3.5° to it. */
const LAND = 0.04;
/** Peak height of the cover's rim above the floor on the reveal (the v1.1 reveal height). */
export const REVEAL_TOP = SAFE_SKIRT + 0.16;
function accept(t: number, out: DinnerFrame): void {
  frameFor('guest-ready', out);
  const A = ACCEPT;
  if (t >= A.flat) {
    // Rocks on its rim beside the plate and comes to rest; then the final presentation.
    if (t < A.settled) settle(out, seg(t, A.flat, A.settled), REVEAL_DIR, COVER_BESIDE);
    else out.coverPos.copy(COVER_BESIDE);
    return;
  }
  // Base path (the cover's origin if it were level): rises off the plate from 0.10 s, travels
  // across from 0.24 s while still rising, and comes down to rest beside the plate by A.touch.
  const across = REVEAL(seg(t, 0.24, A.touch));
  base.set(lerp(COVER_SEATED.x, COVER_BESIDE.x, across), 0, lerp(COVER_SEATED.z, COVER_BESIDE.z, across));
  base.y = t < A.top
    ? COVER_SEATED.y + (REVEAL_TOP - COVER_SEATED.y) * RISE(seg(t, A.liftFrom, A.top))
    : hermite(seg(t, A.top, A.touch), REVEAL_TOP, 0, COVER_BESIDE.y, 0);
  // Lean about up × the path: the handle-led tip (up by A.tipPeak, levelled by A.top) and the
  // landing lean (far rim first), which reaches 0 at A.flat at the rock's rate.
  const tip = TIP * (smoothstep(seg(t, 0, A.tipPeak)) - smoothstep(seg(t, A.tipPeak, A.top)));
  const u = seg(t, 0.42, A.flat);
  const land = LAND * Math.sin(Math.PI * u) ** 2 + (u * u - u * u * u) * rockRate(A.settled - A.flat) * (A.flat - 0.42);
  // Pivot: the far rim on the plate while it tips, the grip while it is carried, the far rim
  // again as it lands on the table.
  rimPoint(REVEAL_DIR, rim);
  const carried = smoothstep(seg(t, 0.12, 0.45)) - smoothstep(seg(t, 0.5, A.touch));
  k.lerpVectors(rim, GRIP, carried);
  poseAbout(out, base, tip + land, REVEAL_DIR, k);
}

// ── Decline: 1.5 s ────────────────────────────────────────────────────────────
const FLAP_OPEN = cubicBezier(0.3, 0, 0.2, 1);
const FLAP_CLOSE = cubicBezier(0.45, 0, 0.35, 1);
/** One continuous move along the transfer path: eases off the floor, travels, lowers in gently. */
const TRANSFER = cubicBezier(0.33, 0, 0.3, 1);
const FLAP_GAP = 0.03;
/** The dish's knob is below the rim (out of sight) from here: the flaps begin to close. */
export const FLAP_CLOSE_AT = 0.8;
/** Bin entrance: eases in from off-frame and decelerates into place (no full-speed first frame). */
const BIN_ENTER = cubicBezier(0.25, 0.25, 0.2, 1);

/**
 * The approved transfer path in the vertical plane from the plate to the bin: straight up, across
 * at DINNER_CARRY, straight down onto the liner floor, with rounded corners so the direction
 * turns smoothly. The first corner is tight enough that the plate is above the rim before it
 * reaches it; the second ends above the rim only once the plate is inside the opening.
 */
const REACH = Math.hypot(DINNER_BIN_POS.x, DINNER_BIN_POS.z);
/** Share of world distance in the transfer's pacing metric (0 = purely on-screen). */
const WORLD_SHARE = 0.35;
const LIFT_CORNER = 0.2;
const DROP_CORNER = 0.12;
const PATH = (() => {
  type Piece = { length: number; at(u: number): [number, number] };
  const line = (a: [number, number], b: [number, number]): Piece => ({
    length: Math.hypot(b[0] - a[0], b[1] - a[1]),
    at: (u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u],
  });
  const arc = (cx: number, cy: number, r: number, from: number, to: number): Piece => ({
    length: Math.abs(to - from) * r,
    at: (u) => { const a = from + (to - from) * u; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; },
  });
  const Y = DINNER_CARRY, a = LIFT_CORNER, b = DROP_CORNER, floor = DISH_IN_BIN.y;
  const pieces: Piece[] = [
    line([0, 0], [0, Y - a]),
    arc(a, Y - a, a, Math.PI, Math.PI / 2),
    line([a, Y], [REACH - b, Y]),
    arc(REACH - b, Y - b, b, Math.PI / 2, 0),
    line([REACH, Y - b], [REACH, floor]),
  ];
  const total = pieces.reduce((n, p) => n + p.length, 0);
  const world = (s: number): [number, number] => {
    let d = Math.min(Math.max(s, 0), 1) * total;
    for (const p of pieces) {
      if (d <= p.length) return p.at(p.length ? d / p.length : 0);
      d -= p.length;
    }
    return [REACH, floor];
  };
  // Pace the move by distance ON SCREEN (the shared camera): the bin sits almost behind the dish,
  // so the across leg is mostly depth, and world-distance pacing read as rise, hover, snap.
  const az = MathUtils.degToRad(CAMERA_ANGLES.azimuthDeg), el = MathUtils.degToRad(CAMERA_ANGLES.elevationDeg);
  const ux = DINNER_BIN_POS.x / REACH, uz = DINNER_BIN_POS.z / REACH;
  const screen = ([d, y]: [number, number]): [number, number] => {
    const x = ux * d, z = uz * d;
    return [Math.cos(az) * x - Math.sin(az) * z, -Math.sin(az) * Math.sin(el) * x + Math.cos(el) * y - Math.cos(az) * Math.sin(el) * z];
  };
  // Mostly on-screen distance, with a share of world distance so the depth leg (and the floor
  // shadow that follows the dish) never streaks.
  const N = 600;
  const cum = new Float64Array(N + 1);
  let prev = screen(world(0));
  let prevW = world(0);
  for (let i = 1; i <= N; i++) {
    const w = world(i / N);
    const q = screen(w);
    cum[i] = cum[i - 1]! + Math.hypot(q[0] - prev[0], q[1] - prev[1]) + WORLD_SHARE * Math.hypot(w[0] - prevW[0], w[1] - prevW[1]);
    prev = q;
    prevW = w;
  }
  /** Point at on-screen arc-length fraction f ∈ [0, 1]: [distance towards the bin, height]. */
  return (f: number): [number, number] => {
    const target = Math.min(Math.max(f, 0), 1) * cum[N]!;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid]! < target) lo = mid; else hi = mid; }
    const span = cum[hi]! - cum[lo]!;
    const k = span > 0 ? (target - cum[lo]!) / span : 0;
    return world((lo + k) / N);
  };
})();

const dish = new Vector3();
function decline(t: number, out: DinnerFrame): void {
  frameFor('guest-ready', out);
  // 0–0.25: the bin slides into the margin and opens.
  out.binVisible = t > 0;
  // Its speed peaks off-screen and it decelerates across the visible part (no dark mass
  // slamming across the frame in a few frames).
  out.binPos.lerpVectors(DINNER_BIN_START, DINNER_BIN_POS, BIN_ENTER(seg(t, 0, 0.34)));
  // Flaps open as it arrives, and start closing as soon as the dish is out of sight (no frozen
  // frames): nearly shut by 1.10 s, the last gap settles by 1.30 s.
  if (t < FLAP_CLOSE_AT) out.flaps = FLAP_OPEN(seg(t, 0.14, 0.36));
  else if (t < 1.1) out.flaps = lerp(1, FLAP_GAP, FLAP_CLOSE(seg(t, FLAP_CLOSE_AT, 1.1)));
  else out.flaps = lerp(FLAP_GAP, 0, EASE.land(seg(t, 1.1, 1.3)));
  // 0.25–0.95: the covered dish, as one unit, rises clear, crosses over the rim between the
  // open flaps and is lowered onto the liner floor, in one continuous move (no stop over the bin).
  const [d, y] = PATH(TRANSFER(seg(t, 0.25, 0.95)));
  const k = d / REACH;
  dish.set(DINNER_BIN_POS.x * k, y, DINNER_BIN_POS.z * k);
  out.platePos.copy(dish);
  out.coverPos.copy(dish).add(COVER_SEATED);
  // Once the flaps have closed over it, the hidden dish stops rendering.
  out.dishVisible = t < 1.1;
}

/**
 * Whether a straight interruption blend back to the seated cover is clean from this frame: the
 * cover is still (nearly) centred and above the safe skirt height, so its skirt clears the food.
 */
export function coverBlendSafe(f: DinnerFrame): boolean {
  const offset = Math.hypot(f.coverPos.x - COVER_SEATED.x, f.coverPos.z - COVER_SEATED.z);
  return offset <= 0.05 || (offset <= 0.2 && f.coverPos.y >= SAFE_SKIRT);
}

export function sampleSequence(sequence: SequenceName, t: number, out: DinnerFrame): DinnerFrame {
  const tc = Math.min(Math.max(t, 0), DURATIONS[sequence]);
  if (sequence === 'host') host(tc, out);
  else if (sequence === 'accept') accept(tc, out);
  else decline(tc, out);
  return out;
}

export { COVER };
