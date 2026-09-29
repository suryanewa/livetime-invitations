import { MathUtils, Vector3 } from 'three';
import { CAMERA_ANGLES } from '../../render/camera.ts';
import { cubicBezier, EASE, lerp, seg, smoothstep } from '../../motion/curves.ts';
import {
  COVER, COVER_BESIDE, COVER_POISED, COVER_POISED_TILT, COVER_SEATED, DINNER_BIN_POS, DINNER_BIN_START, DINNER_CARRY,
  DISH_IN_BIN, FOOD, PLATE,
} from '../../../models/dinnerContract.ts';
import type { CanonicalPose, SequenceName } from '../../core/types.ts';

/**
 * Pure authored choreography for Dinner (Dinner sub-spec): cover the dish, reveal it, or put
 * the whole covered dish in the shared bin. Every value is a function of time, so replay and
 * reversal restore plate, food, cover and bin exactly.
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
/** Height the skirt clears the food by whenever the cover moves over it. */
export const SAFE_SKIRT = PLATE.well + FOOD.centreHeight + 0.08;
const ABOVE_SEAT = new Vector3(0, SAFE_SKIRT, 0);

const set = (out: DinnerFrame, plate: Vector3, cover: Vector3, tilt: number) => {
  out.platePos.copy(plate);
  out.coverPos.copy(cover);
  out.coverTilt = tilt;
  out.coverTiltX = 0;
};
/** Horizontal direction from the seated cover to its resting place (the reveal's path). */
const REVEAL_DIR = new Vector3(COVER_BESIDE.x - COVER_SEATED.x, 0, COVER_BESIDE.z - COVER_SEATED.z).normalize();
/** Direction the host's cover travels as it comes in to seat. */
const COVER_DIR = new Vector3(COVER_SEATED.x - COVER_POISED.x, 0, COVER_SEATED.z - COVER_POISED.z).normalize();

/**
 * The optional secondary settle (sub-spec: at most 1°): a heavy cover rocks once on its rim and
 * comes to rest. It rocks on the edge, so the lifted side rises and the other side stays on the
 * surface; the peak is about 0.95° (under the sub-spec's 1°), one cycle, well damped. It is
 * driven by contact: the cover arrives with a little speed left instead of floating to rest.
 */
export const SETTLE_TILT = 0.0275;
function settle(out: DinnerFrame, u: number, dir: Vector3, rest: Vector3): void {
  const a = SETTLE_TILT * Math.sin(2 * Math.PI * u) * (1 - u) ** 2;
  out.coverTilt = -a * dir.x;
  out.coverTiltX = a * dir.z;
  out.coverPos.copy(rest);
  out.coverPos.y += COVER.radius * Math.abs(Math.sin(a));
}

export function frameFor(pose: CanonicalPose, out: DinnerFrame): DinnerFrame {
  if (pose === 'host-ready') set(out, ORIGIN, COVER_POISED, COVER_POISED_TILT);
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

// ── Host: 1.2 s ───────────────────────────────────────────────────────────────
const ALIGN = cubicBezier(0.4, 0, 0.3, 1);
function host(t: number, out: DinnerFrame): void {
  frameFor('guest-ready', out);
  if (t < 0.2) {
    // Food visible, cover poised: a small preparatory rise.
    out.coverPos.copy(COVER_POISED);
    out.coverPos.y += 0.03 * EASE.lift(seg(t, 0, 0.2));
    out.coverTilt = COVER_POISED_TILT;
  } else if (t < 0.9) {
    // Align over the food, levelling as it comes, and lower in one continuous weighted move:
    // the height passes the safe skirt height exactly as the cover centres (0.60 s) without
    // stopping, then decelerates to seat precisely at 0.90 s.
    const s = ALIGN(seg(t, 0.2, 0.6));
    const from = COVER_POISED.clone().setY(COVER_POISED.y + 0.03);
    out.coverPos.set(lerp(from.x, ABOVE_SEAT.x, s), coverLowering(t, from.y), lerp(from.z, ABOVE_SEAT.z, s));
    out.coverTilt = lerp(COVER_POISED_TILT, 0, s);
  } else {
    // A gentle settle on the rim into guest-ready.
    settle(out, seg(t, 0.9, 1.2), COVER_DIR, COVER_SEATED);
  }
}

/** Cubic Hermite on [0, 1] with end values and end slopes (slopes in value per unit u). */
function hermite(u: number, p0: number, m0: number, p1: number, m1: number): number {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
}
/** Host cover height 0.20–0.90 s: through SAFE_SKIRT at 0.60 s at LOWER_SPEED, seated at rest. */
const LOWER_SPEED = -1.1;
/** Vertical speed left at touch-down (u/s): the contact that starts the rim rock. */
const TOUCH_DOWN = -0.3;
function coverLowering(t: number, fromY: number): number {
  if (t < 0.6) return hermite(seg(t, 0.2, 0.6), fromY, 0, SAFE_SKIRT, LOWER_SPEED * 0.4);
  return hermite(seg(t, 0.6, 0.9), SAFE_SKIRT, LOWER_SPEED * 0.3, COVER_SEATED.y, TOUCH_DOWN * 0.3);
}

// ── Accept: 1.5 s ─────────────────────────────────────────────────────────────
const REVEAL = cubicBezier(0.35, 0, 0.3, 1);
/** Separation then lift in one curve: slow off the plate (≈8 cm at 0.20 s), no zero-velocity joint. */
const RISE = cubicBezier(0.85, 0, 0.3, 1);
/** Reveal lean: peaks early (about a third of the way across) so the satin sweeps the dome. */
const LEAN = 0.18;
function accept(t: number, out: DinnerFrame): void {
  frameFor('guest-ready', out);
  const c = out.coverPos;
  if (t < 0.85) {
    // One continuous action: it separates from the plate, and the sideways move starts while it is
    // still rising (no hitch at the top), then it is set down beside the plate by 0.85 s with a
    // little speed left, which starts the rim rock.
    const across = REVEAL(seg(t, 0.26, 0.85));
    c.set(lerp(COVER_SEATED.x, COVER_BESIDE.x, across), 0, lerp(COVER_SEATED.z, COVER_BESIDE.z, across));
    const top = SAFE_SKIRT + 0.16;
    const up = COVER_SEATED.y + (top - COVER_SEATED.y) * RISE(seg(t, 0, 0.48));
    c.y = t < 0.55 ? up : hermite(seg(t, 0.55, 0.85), top, 0, COVER_BESIDE.y, TOUCH_DOWN * 0.3);
    // Leading edge dips along the path (small-angle lean about up × path).
    const lean = LEAN * Math.sin(Math.PI * Math.pow(across, 0.66));
    out.coverTilt = -lean * REVEAL_DIR.x;
    out.coverTiltX = lean * REVEAL_DIR.z;
  } else if (t < 1.3) {
    // Settles on its rim beside the plate; the food stays centred and visible.
    settle(out, seg(t, 0.85, 1.3), REVEAL_DIR, COVER_BESIDE);
  } else {
    // Final presentation.
    c.copy(COVER_BESIDE);
    out.coverTilt = 0;
  }
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
