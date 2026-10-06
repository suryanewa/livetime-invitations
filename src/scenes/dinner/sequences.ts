import { Euler, MathUtils, Vector3 } from 'three';
import { CAMERA_ANGLES } from '../../render/camera.ts';
import { cubicBezier, EASE, lerp, seg, smoothstep } from '../../motion/curves.ts';
import {
  COVER, COVER_BESIDE, COVER_POISED, COVER_POISED_TILT, COVER_SEATED, DINNER_BIN, DINNER_BIN_POS, DINNER_BIN_SCALE, DINNER_BIN_START, DINNER_CARRY,
  DISH_HEIGHT, DISH_IN_BIN, PLATE,
} from '../../../models/dinnerContract.ts';
import type { CanonicalPose, SequenceName } from '../../core/types.ts';
import { BIN_CLOSE, BIN_ENTRANCE, dropHeight, flapsClosing, GRAVITY } from '../../../models/disposalBin.ts';

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
  // comes down, its level path passing SAFE_SKIRT exactly as it centres (0.60 s) without stopping
  // (the cover itself is still tipped about 10° there, its low rim about 0.24 above the gilt), and keeps
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
/**
 * Host base height 0.20–HOST_TOUCH (the level path, before the lean about its pivot): through
 * SAFE_SKIRT at 0.60 s, landing softly on the seat. Exported for the contract test.
 */
export function coverLowering(t: number, fromY: number): number {
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
/**
 * One continuous move along the transfer path: eases off the floor, travels, comes to rest over
 * the opening (v1.5: a shorter settle than v1.4's (0.33, 0, 0.3, 1), whose long tail held the dish
 * still over the bin for a quarter-second before it was let go).
 */
const TRANSFER = cubicBezier(0.33, 0, 0.6, 1);
/**
 * v1.5 (the real 47 cm bin): the dish is carried up and across to rest over the opening by
 * RELEASE, then let go: it falls into the bin under gravity (9.81 m/s² in Dinner's units).
 */
export const RELEASE = 0.74;
const DROP_G = GRAVITY * DINNER_BIN_SCALE;
/** The dish's handle is below the rim (out of sight) by 0.93 s: the flaps begin to close. */
export const FLAP_CLOSE_AT = 0.94;
/** Flaps nearly shut (the damper's last gap), and closed (the bin's soft close, shared with Birthday). */
const FLAP_GAP_AT = FLAP_CLOSE_AT + BIN_CLOSE.toGap;
const FLAPS_SHUT = FLAP_GAP_AT + BIN_CLOSE.last;
/** Bin entrance: eases in from off-frame and decelerates into place (no full-speed first frame). */
const BIN_ENTER = cubicBezier(...BIN_ENTRANCE.ease);
/**
 * v1.5 decline pull-back (src/render/framing.ts DECLINE_PULL): the camera starts easing back on the
 * tap, and the bin's entrance waits this long for it. At the rest framing (the dish at 70 % of the
 * width) the 47 cm bin is three times the dish: entering at once it swept a giant, top-cropped
 * black mass across the first 0.3 s. Waiting 0.16 s, it glides into the room the camera has made
 * (v1.5 review: from just out of the drawn view, decelerating over BIN_SLIDE; models/disposalBin.ts
 * BIN_ENTRANCE), and it is settled at 0.56 s, before the dish reaches it (0.577 s).
 */
export const BIN_DELAY = 0.16;
/** v1.5 review: the bin's slide, 0.16–0.56 s (BIN_DELAY above). */
export const BIN_SLIDE = 0.4;
/**
 * The flaps open over this part of the bin's entrance (its clock: BIN_DELAY after the decline's):
 * as the bin settles, done at 0.56 s, as the dish turns across towards it (it reaches the bin's
 * footprint at 0.575 s). v1.4–v1.5 opened them 0.04 s earlier in the entrance; this late, their
 * tips touch the frame's top edge for 0.12 s (4 % of the bin's height) rather than 0.18 s (8 %)
 * while the camera finishes easing back.
 */
const FLAPS_OPEN = [0.18, 0.4] as const;

/**
 * The approved transfer path in the vertical plane from the plate to the bin: straight up and
 * across at DINNER_CARRY with a rounded corner (tight enough that the plate is above the rim
 * before it reaches it), ending over the middle of the opening; from there the dish falls.
 */
const REACH = Math.hypot(DINNER_BIN_POS.x, DINNER_BIN_POS.z);
/** Share of world distance in the transfer's pacing metric (0 = purely on-screen). */
const WORLD_SHARE = 0.35;
const LIFT_CORNER = 0.2;
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
  const Y = DINNER_CARRY, a = LIFT_CORNER;
  const pieces: Piece[] = [
    line([0, 0], [0, Y - a]),
    arc(a, Y - a, a, Math.PI, Math.PI / 2),
    line([a, Y], [REACH, Y]),
  ];
  const total = pieces.reduce((n, p) => n + p.length, 0);
  const world = (s: number): [number, number] => {
    let d = Math.min(Math.max(s, 0), 1) * total;
    for (const p of pieces) {
      if (d <= p.length) return p.at(p.length ? d / p.length : 0);
      d -= p.length;
    }
    return [REACH, Y];
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
/**
 * `tBin` (default t) drives the bin's entrance and the flaps opening; after a change of mind the
 * bin comes in while the cover is still coming back down, so it runs ahead of the dish (tBin ≥ t).
 */
function decline(t: number, out: DinnerFrame, tBin = t): void {
  frameFor('guest-ready', out);
  // 0–0.16: the camera starts easing back (framing.ts DECLINE_PULL); 0.16–0.56: the bin slides into
  // the room it has made and opens (BIN_DELAY, FLAPS_OPEN).
  // Drawn from when it starts in (off-frame until then; a rewind of the still first 0.16 s is exact).
  out.binVisible = tBin > BIN_DELAY;
  // Its speed peaks off-screen and it decelerates across the visible part (no dark mass
  // slamming across the frame in a few frames).
  out.binPos.lerpVectors(DINNER_BIN_START, DINNER_BIN_POS, BIN_ENTER(seg(tBin - BIN_DELAY, 0, BIN_SLIDE)));
  // Flaps open as it arrives, and start closing as soon as the dish is out of sight (no frozen
  // frames): the bin's soft close, nearly shut by 1.27 s, the last gap taken up by 1.42 s.
  if (t < FLAP_CLOSE_AT) out.flaps = FLAP_OPEN(seg(tBin - BIN_DELAY, FLAPS_OPEN[0], FLAPS_OPEN[1]));
  else out.flaps = flapsClosing(t - FLAP_CLOSE_AT);
  // 0.25–0.74: the covered dish, as one unit, rises clear and crosses over the rim between the
  // open flaps to rest over the opening, in one continuous move; then it is let go and falls in.
  const [d, y] = PATH(TRANSFER(seg(t, 0.25, RELEASE)));
  const k = d / REACH;
  dish.set(DINNER_BIN_POS.x * k, t > RELEASE ? dropHeight(y, DISH_IN_BIN.y, t - RELEASE, DROP_G) : y, DINNER_BIN_POS.z * k);
  out.platePos.copy(dish);
  out.coverPos.copy(dish).add(COVER_SEATED);
  // Once the flaps have closed over it, the hidden dish stops rendering.
  out.dishVisible = t < FLAP_GAP_AT;
}

/**
 * Whether a straight interruption blend back to the seated cover is clean from this frame: the
 * cover is still (nearly) centred, or close to centred and above the safe skirt height, so a
 * straight blend down onto the seat never drags its rim across the plate's gilt rim. (v1.2.1:
 * the scene rewinds instead of blending, `planAnswerChange`; kept as the clearance reference.)
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

// ── Change of mind (v1.2.1) ───────────────────────────────────────────────────
type Outcome = 'accept' | 'decline';
/** When each outcome's motion is over (it holds its final pose from here to its duration). */
export const CONTENT_END: Readonly<Record<Outcome, number>> = { accept: ACCEPT.settled, decline: FLAPS_SHUT };
/** The decline's first 0.25 s only bring the bin in: they may run during the rewind. */
const DECLINE_LEAD = 0.25;
/** Plan clearance between the returning cover and the bin coming in (bin rim + bead + margin). */
export const BIN_CLEARANCE = DINNER_BIN.radius + COVER.radius + 0.05;
/** Bin position on the decline's clock (its entrance). */
const binAt = (tb: number, out: Vector3) => out.lerpVectors(DINNER_BIN_START, DINNER_BIN_POS, BIN_ENTER(seg(tb - BIN_DELAY, 0, BIN_SLIDE)));
const FRAME = 1 / 60;
/**
 * Rewind bounds (s) by the outcome that follows, and its largest 60 fps step relative to the
 * rewound outcome's own largest step. v1.5: 0.6 s before an accept too (was 0.45): out of the real
 * 47 cm bin the covered dish has 6 scene units to come back (up out of the bucket, across, down
 * onto the table), which 0.45 s could only cover by whipping it at twice the decline's own pace;
 * the accept that follows plays up to 1.46× faster instead.
 */
export const REWIND = { min: 0.15, max: { accept: 0.6, decline: 0.6 }, pace: 1.6 } as const;

/**
 * A change of mind mid-outcome (or after it): the outcome that is showing plays backwards along
 * its own authored path to the covered dish, which is clear of the plate and the bin by
 * construction (a lifted cover comes back down onto the plate like a reversed lift, a dish in
 * the bin comes back up out of it), then the new outcome plays. A straight blend would drag the
 * cover through the plate's rim; the v1.1 cut popped it onto the plate in one frame.
 */
export interface AnswerChange {
  /** The outcome that was showing, and the time along it where the change happened. */
  from: Outcome;
  at: number;
  /** Its playback rate there (1 while it plays, 0 at rest): the rewind leaves at that speed. */
  rate: number;
  /** Path length from the outcome's start to `at`, and the path speed there (`lengthAt`). */
  length: number;
  speed: number;
  /** Rewind duration (0 when the change returns to the outcome being rewound). */
  rewind: number;
  /** The new outcome; its time `start + (t − rewind)·k` after the rewind (k fits it in its duration). */
  next: Outcome;
  start: number;
  k: number;
}

const fa = newFrame(), fb = newFrame();
/**
 * v1.5: the dish is out of sight inside the bin once it is centred in the opening with its handle
 * more than HIDDEN_DEPTH below the rim: the line of sight over the near rim, 15° down, is 0.25
 * below it at the centre and the dome's far edge 0.42 (Dinner units); 0.45 to be safe. Moving
 * in there costs no rewind time and sets no pace: nothing of it is seen.
 */
export const HIDDEN_DEPTH = 0.45;
export function hiddenInBin(f: DinnerFrame): boolean {
  return Math.hypot(f.platePos.x - f.binPos.x, f.platePos.z - f.binPos.z) < 0.05 && f.platePos.y + DISH_HEIGHT < DINNER_BIN.rimTop - HIDDEN_DEPTH;
}
/**
 * Per-frame visible move of the dish (cover position + lean, plate) and of the bin (position +
 * flaps). The dish's fall to the bucket floor, out of sight, does not count.
 */
const seenA = new Vector3(), seenB = new Vector3();
/** Where the dish is seen to be: inside the bin, never deeper than the line of sight (HIDDEN_DEPTH). */
function seen(f: DinnerFrame, out: Vector3): Vector3 {
  out.copy(f.platePos);
  if (Math.hypot(f.platePos.x - f.binPos.x, f.platePos.z - f.binPos.z) < 0.05) out.y = Math.max(out.y, DINNER_BIN.rimTop - HIDDEN_DEPTH - DISH_HEIGHT);
  return out;
}
export function dishStep(a: DinnerFrame, b: DinnerFrame): number {
  if (hiddenInBin(a) && hiddenInBin(b)) return 0;
  const lean = Math.abs(Math.hypot(b.coverTilt, b.coverTiltX) - Math.hypot(a.coverTilt, a.coverTiltX));
  // The cover rides on the plate in the bin (the decline carries the dish as one unit).
  const plate = seen(a, seenA).distanceTo(seen(b, seenB));
  const cover = hiddenInBin(a) || hiddenInBin(b) ? plate : a.coverPos.distanceTo(b.coverPos);
  return Math.max(cover + lean, plate);
}
export const binStep = (a: DinnerFrame, b: DinnerFrame) => a.binPos.distanceTo(b.binPos) + Math.abs(a.flaps - b.flaps);
/**
 * The outcome's own fastest 60 fps frame, for the dish and for the bin, at any frame phase
 * (v1.5: the dish's free fall into the bin peaks sharply just before it lands, so a single
 * frame grid could miss the fastest frame by a few percent).
 */
const paceCache: Partial<Record<Outcome, [number, number]>> = {};
export function outcomePace(seq: Outcome): [number, number] {
  let p = paceCache[seq];
  if (!p) {
    p = [0, 0];
    for (let t = 0; t < DURATIONS[seq]; t += FRAME / 8) {
      sampleSequence(seq, t, fa);
      sampleSequence(seq, t + FRAME, fb);
      p = [Math.max(p[0], dishStep(fa, fb)), Math.max(p[1], binStep(fa, fb))];
    }
    paceCache[seq] = p;
  }
  return p;
}

const LEN_DT = 0.002;
/**
 * Cumulative path length along each outcome, every 2 ms up to CONTENT_END: the dish's move plus
 * the bin's, each in units of its own fastest frame. The rewind is paced by it, so a still hold
 * (the reveal's rock, a beat where only the bin moves for the dish) takes no rewind time, and no
 * part of the scene is rewound faster than the rest relative to its own authored speed.
 */
const lengthCache: Partial<Record<Outcome, Float64Array>> = {};
function lengths(seq: Outcome): Float64Array {
  let cum = lengthCache[seq];
  if (!cum) {
    const [dishPace, binPace] = outcomePace(seq);
    const n = Math.ceil(CONTENT_END[seq] / LEN_DT);
    cum = new Float64Array(n + 1);
    sampleSequence(seq, 0, fa);
    for (let i = 1; i <= n; i++) {
      sampleSequence(seq, Math.min(i * LEN_DT, CONTENT_END[seq]), fb);
      cum[i] = cum[i - 1]! + dishStep(fa, fb) / dishPace + (binPace > 0 ? binStep(fa, fb) / binPace : 0);
      fa.coverPos.copy(fb.coverPos); fa.platePos.copy(fb.platePos); fa.binPos.copy(fb.binPos);
      fa.coverTilt = fb.coverTilt; fa.coverTiltX = fb.coverTiltX; fa.flaps = fb.flaps;
    }
    lengthCache[seq] = cum;
  }
  return cum;
}
/** Path length from the outcome's start to time s. */
export function lengthAt(seq: Outcome, s: number): number {
  const cum = lengths(seq);
  const x = Math.min(Math.max(s, 0), CONTENT_END[seq]) / LEN_DT;
  const i = Math.min(Math.floor(x), cum.length - 2);
  return cum[i]! + (cum[i + 1]! - cum[i]!) * (x - i);
}
/** The earliest time at which the path length reaches d (a still hold is skipped). */
function timeAtLength(seq: Outcome, d: number): number {
  const cum = lengths(seq);
  if (d <= 0) return 0;
  if (d >= cum[cum.length - 1]!) return CONTENT_END[seq];
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid]! < d) lo = mid; else hi = mid; }
  const span = cum[hi]! - cum[lo]!;
  return Math.min((lo + (span > 0 ? (d - cum[lo]!) / span : 1)) * LEN_DT, CONTENT_END[seq]);
}
/** Path speed (length per second) of the outcome at time s. */
function speedAt(seq: Outcome, s: number): number {
  const a = Math.max(s - 0.004, 0), b = Math.min(s + 0.004, CONTENT_END[seq]);
  return b > a ? (lengthAt(seq, b) - lengthAt(seq, a)) / (b - a) : 0;
}
/**
 * Path length left during the rewind at u ∈ [0, 1] and its rate per unit u: Hermite from the
 * interrupted length L0, leaving at the outcome's own speed v0 (no velocity jump), to 0, landing softly.
 */
function rewindLength(L0: number, v0: number, R: number, u: number): [number, number] {
  const u2 = u * u, u3 = u2 * u;
  const d = (2 * u3 - 3 * u2 + 1) * L0 + (u3 - 2 * u2 + u) * v0 * R;
  const dd = (6 * u2 - 6 * u) * L0 + (3 * u2 - 4 * u + 1) * v0 * R;
  return [d, dd];
}

/**
 * The shortest rewind (REWIND.min to `max`, 10 ms steps) whose every 60 fps frame moves the dish
 * and the bin at most REWIND.pace × the outcome's own fastest frame for each: quick, never a whip
 * (unless even `max` is short).
 */
export function rewindDuration(from: Outcome, L0: number, v0: number, max: number): number {
  const [dishPace, binPace] = outcomePace(from);
  for (let R = REWIND.min; R < max; R += 0.01) {
    let ok = true;
    sampleSequence(from, timeAtLength(from, L0), fa);
    for (let t = FRAME; t < R + FRAME && ok; t += FRAME) {
      sampleSequence(from, timeAtLength(from, rewindLength(L0, v0, R, Math.min(t / R, 1))[0]), fb);
      ok = dishStep(fa, fb) <= REWIND.pace * dishPace && binStep(fa, fb) <= REWIND.pace * Math.max(binPace, 1e-3);
      fa.coverPos.copy(fb.coverPos); fa.platePos.copy(fb.platePos); fa.binPos.copy(fb.binPos);
      fa.coverTilt = fb.coverTilt; fa.coverTiltX = fb.coverTiltX; fa.flaps = fb.flaps;
    }
    if (ok) return R;
  }
  return max;
}

/**
 * `closeHome` (v1.7, #42): on the way from the accept's close-up to the bin, how long the camera
 * takes to come home from the card (src/scenes/dinner/pull.ts `planCloseHome`; 0 when it is at
 * rest). The bin waits for it: the decline's clock (its pull, then BIN_DELAY later the bin) starts
 * no sooner than BIN_DELAY before the camera is home, so the bin never sweeps into the close-up.
 * The reveal's rewind is stretched to that start if it is shorter (a gentler return of the cover)
 * and the decline's lead is cut to fit; the decline then plays up to (CONTENT_END − lead) /
 * (1.5 − rewind) faster (from the close-up at rest: the rewind 0.44 s, 1.34×).
 */
export function planAnswerChange(from: Outcome, at: number, rate: number, next: Outcome, closeHome = 0): AnswerChange {
  const a = Math.min(Math.max(at, 0), CONTENT_END[from]);
  const r = a < CONTENT_END[from] ? rate : 0;
  // Changing back to the outcome being rewound: it simply plays on from where it is.
  if (from === next) return { from, at: a, rate: r, length: 0, speed: 0, rewind: 0, next, start: a, k: 1 };
  const length = lengthAt(from, a), speed = r * speedAt(from, a);
  const minRewind = rewindDuration(from, length, speed, REWIND.max[next]);
  // The earliest the decline's clock may start: its bin enters BIN_DELAY of that clock later, which
  // the decline's own speed-up k shortens; so that is BIN_DELAY / k before the camera is home (a
  // fixed point in k, three steps are exact to a microsecond).
  let wait = 0, rewind = minRewind, start = 0, k = 1;
  for (let i = 0; i < (next === 'decline' && closeHome > 0 ? 3 : 1); i++) {
    if (next === 'decline' && closeHome > 0) wait = Math.min(REWIND.max.decline, Math.max(0, closeHome - BIN_DELAY / k));
    rewind = Math.max(minRewind, wait);
    // A decline's lead (the bin coming in) runs during the end of the rewind, as much of it as
    // keeps the bin clear of the returning cover (the bin sweeps in past the reveal's landing
    // spot) and does not start before `wait`; an accept starts after the rewind.
    start = next === 'decline' ? Math.max(0, Math.min(declineLead(from, length, speed, rewind), rewind - wait)) : 0;
    k = Math.max(1, (CONTENT_END[next] - start) / (DURATIONS[next] - rewind));
  }
  return { from, at: a, rate: r, length, speed, rewind, next, start, k };
}

const binP = new Vector3();
function declineLead(from: Outcome, length: number, speed: number, R: number): number {
  for (let L = Math.min(DECLINE_LEAD, R); L > 0; L -= 0.01) {
    let clear = true;
    for (let t = Math.max(0, R - L); t <= R + 1e-9 && clear; t += 0.004) {
      sampleSequence(from, timeAtLength(from, rewindLength(length, speed, R, Math.min(t / R, 1))[0]), fa);
      binAt(t - (R - L), binP);
      clear = Math.hypot(fa.coverPos.x - binP.x, fa.coverPos.z - binP.z) >= BIN_CLEARANCE;
    }
    if (clear) return L;
  }
  return 0;
}

/** Where the change is at time `t` of the new outcome's playback: [outcome, its time, its rate]. */
export function changeTime(c: AnswerChange, t: number): [Outcome, number, number] {
  if (t < c.rewind) {
    const [d, dd] = rewindLength(c.length, c.speed, c.rewind, t / c.rewind);
    const s = timeAtLength(c.from, d);
    const v = speedAt(c.from, s);
    return [c.from, s, v > 1e-9 ? dd / c.rewind / v : 0];
  }
  const s = c.start + (t - c.rewind) * c.k;
  return s >= CONTENT_END[c.next] ? [c.next, CONTENT_END[c.next], 0] : [c.next, s, c.k];
}

export function sampleAnswerChange(c: AnswerChange, t: number, out: DinnerFrame): DinnerFrame {
  const [seq, s] = changeTime(c, t);
  // On the way to the bin, the bin comes in on its own clock, `start` s ahead of the dish.
  const toBin = c.next === 'decline' && c.from !== 'decline';
  const binClock = toBin && t < c.rewind ? t - (c.rewind - c.start) : s;
  if (seq === 'decline') {
    decline(Math.min(s, DURATIONS.decline), out, Math.min(Math.max(binClock, s), DURATIONS.decline));
    return out;
  }
  sampleSequence(seq, s, out);
  if (toBin) {
    // Rewinding the reveal: the bin may already be on its way in.
    out.binVisible = binClock > BIN_DELAY;
    binAt(Math.max(binClock, 0), out.binPos);
    out.flaps = FLAP_OPEN(seg(binClock - BIN_DELAY, FLAPS_OPEN[0], FLAPS_OPEN[1]));
  }
  return out;
}
