import { Vector3 } from 'three';
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
 * surface; the peak is about 0.6°, one cycle, well damped, never rubbery.
 */
export const SETTLE_TILT = 0.017;
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
const LOWER = cubicBezier(0.45, 0, 0.2, 1);
function host(t: number, out: DinnerFrame): void {
  frameFor('guest-ready', out);
  if (t < 0.2) {
    // Food visible, cover poised: a small preparatory rise.
    out.coverPos.copy(COVER_POISED);
    out.coverPos.y += 0.03 * EASE.lift(seg(t, 0, 0.2));
    out.coverTilt = COVER_POISED_TILT;
  } else if (t < 0.6) {
    // Align over the food, levelling as it comes, skirt always above the food.
    const s = ALIGN(seg(t, 0.2, 0.6));
    out.coverPos.lerpVectors(COVER_POISED.clone().setY(COVER_POISED.y + 0.03), ABOVE_SEAT, s);
    out.coverTilt = lerp(COVER_POISED_TILT, 0, s);
  } else if (t < 0.9) {
    // Lower with a controlled, weighted motion and seat precisely at 0.90 s.
    out.coverPos.lerpVectors(ABOVE_SEAT, COVER_SEATED, LOWER(seg(t, 0.6, 0.9)));
    out.coverTilt = 0;
  } else {
    // A gentle settle on the rim into guest-ready.
    settle(out, seg(t, 0.9, 1.2), COVER_DIR, COVER_SEATED);
  }
}

// ── Accept: 1.5 s ─────────────────────────────────────────────────────────────
const REVEAL = cubicBezier(0.35, 0, 0.3, 1);
function accept(t: number, out: DinnerFrame): void {
  frameFor('guest-ready', out);
  const c = out.coverPos;
  if (t < 0.2) {
    // Rises just enough to separate from the plate.
    c.copy(COVER_SEATED);
    c.y += 0.06 * EASE.lift(seg(t, 0, 0.2));
  } else if (t < 0.85) {
    // One continuous action: up clear of the food first, then across and down beside it.
    const s = seg(t, 0.2, 0.85);
    const across = REVEAL(seg(s, 0.3, 1));
    c.set(lerp(COVER_SEATED.x, COVER_BESIDE.x, across), 0, lerp(COVER_SEATED.z, COVER_BESIDE.z, across));
    const up = COVER_SEATED.y + 0.06 + (SAFE_SKIRT + 0.22 - COVER_SEATED.y - 0.06) * EASE.lift(seg(s, 0, 0.45));
    c.y = s < 0.55 ? up : lerp(up, COVER_BESIDE.y, smoothstep(seg(s, 0.55, 1)));
    // Leading edge dips a little along the path (small-angle lean about up × path).
    const lean = 0.12 * Math.sin(Math.PI * across);
    out.coverTilt = -lean * REVEAL_DIR.x;
    out.coverTiltX = lean * REVEAL_DIR.z;
  } else if (t < 1.3) {
    // Sets down beside the plate and settles on its rim; the food stays centred and visible.
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

/**
 * The approved transfer path in the vertical plane from the plate to the bin: straight up, across
 * at DINNER_CARRY, straight down onto the liner floor, with rounded corners so the direction
 * turns smoothly. The first corner is tight enough that the plate is above the rim before it
 * reaches it; the second ends above the rim only once the plate is inside the opening.
 */
const REACH = Math.hypot(DINNER_BIN_POS.x, DINNER_BIN_POS.z);
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
  /** Point at arc-length fraction s ∈ [0, 1]: [distance towards the bin, height]. */
  return (s: number): [number, number] => {
    let d = Math.min(Math.max(s, 0), 1) * total;
    for (const p of pieces) {
      if (d <= p.length) return p.at(p.length ? d / p.length : 0);
      d -= p.length;
    }
    return [REACH, floor];
  };
})();

const dish = new Vector3();
function decline(t: number, out: DinnerFrame): void {
  frameFor('guest-ready', out);
  // 0–0.25: the bin slides into the margin and opens.
  out.binVisible = t > 0;
  out.binPos.lerpVectors(DINNER_BIN_START, DINNER_BIN_POS, EASE.travel(seg(t, 0, 0.24)));
  if (t < 0.95) out.flaps = FLAP_OPEN(seg(t, 0.08, 0.25));
  else if (t < 1.2) out.flaps = lerp(1, FLAP_GAP, FLAP_CLOSE(seg(t, 0.95, 1.2)));
  else out.flaps = lerp(FLAP_GAP, 0, EASE.land(seg(t, 1.2, 1.4)));
  // 0.25–0.95: the covered dish, as one unit, rises clear, crosses over the rim between the
  // open flaps and is lowered onto the liner floor, in one continuous move (no stop over the bin).
  const [d, y] = PATH(TRANSFER(seg(t, 0.25, 0.95)));
  const k = d / REACH;
  dish.set(DINNER_BIN_POS.x * k, y, DINNER_BIN_POS.z * k);
  out.platePos.copy(dish);
  out.coverPos.copy(dish).add(COVER_SEATED);
  // Once the flaps have closed over it, the hidden dish stops rendering.
  out.dishVisible = t < 1.2;
}

export function sampleSequence(sequence: SequenceName, t: number, out: DinnerFrame): DinnerFrame {
  const tc = Math.min(Math.max(t, 0), DURATIONS[sequence]);
  if (sequence === 'host') host(tc, out);
  else if (sequence === 'accept') accept(tc, out);
  else decline(tc, out);
  return out;
}

export { COVER };
