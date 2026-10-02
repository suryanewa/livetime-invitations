import { Vector3 } from 'three';
import { BIN, BIN_CLOSE } from '../../../models/disposalBin.ts';
import { CAKE_TOTAL_HEIGHT } from '../../../models/birthdayContract.ts';
import { CANDLE_COUNT, DURATIONS, FLAPS_CLOSE } from './poses.ts';
import { extinguishedAt, flameState, litFlame } from './fire.ts';
import { type BirthdayFrame, carriedFire, coolTime, type FireChange, litTime, newFrame, sampleSequence } from './sequences.ts';

/**
 * v1.5 change of mind, declined → accept (guest-experience review: "a hard one-frame cut: the bin
 * vanishes, the cake teleports back onto the stand, lit, and the camera reframes in one frame").
 * As Dinner does (src/scenes/dinner/sequences.ts, "Change of mind"): the decline that is showing
 * plays backwards along its own authored path, which is clear of the stand, the rim and the flaps
 * by construction (the flaps re-open, the cake rises out of the bin, crosses back, is set down on
 * its stand, the bin slides out), then the accept plays. The candles are already placed: the host
 * beat is not replayed. The fire is never rewound: the fire under way at the change (the snuff, or
 * a breath carried into the decline) goes on on its own clock (`fire`, sequences.ts carriedFire):
 * candles it had reached stay out (their wax goes on setting), their melt stays where it was and
 * their smoke keeps rising. Before any fire had begun, the candles burn on through the rewind and
 * the accept's breath blows them out. Pure functions of the change and the time, so replay-safe
 * and deterministic; the camera's return is pull.ts.
 *
 * Only declined → accept rewinds: on the way to the bin from accept the cake is on its stand and
 * nothing needs undoing (the fire carries across, fire.ts / BirthdayScene.interruptCut).
 */

type Outcome = 'accept' | 'decline';

/** When the decline's motion is over (the flaps fully shut; it holds from here to its duration). */
const DECLINE_END = FLAPS_CLOSE + BIN_CLOSE.toGap + BIN_CLOSE.last;
/** When the accept's is: the last flame out (the smoke runs on, on its own clock). */
const ACCEPT_END = Math.max(...Array.from({ length: CANDLE_COUNT }, (_, i) => extinguishedAt(i))) + 0.02;
export const CONTENT_END: Readonly<Record<Outcome, number>> = { accept: ACCEPT_END, decline: DECLINE_END };

/**
 * Rewind bounds (s) and its largest 60 fps step relative to the decline's own largest step, for
 * the cake and for the bin (as Dinner: quick, never a whip). Birthday's decline carries the cake
 * 32 cm up and across into a 47 cm bin: measured, the rewind needs 0.62–0.71 s from the declined
 * pose; the accept after it has only its breath to play (k ≤ 1.15).
 */
export const REWIND = { min: 0.15, max: 0.8, pace: 1.6 } as const;

/**
 * The cake is out of sight in the bin once it is centred in the opening with its wick tips more
 * than HIDDEN_DEPTH below the rim: the line of sight over the near rim, ≈ 15° down, is 0.2 below
 * it at the centre and 0.39 at the far side of the cake (Birthday units); 0.45 to be safe. Moving
 * in there costs no rewind time and sets no pace: nothing of it is seen.
 */
export const HIDDEN_DEPTH = 0.45;
const centred = (f: BirthdayFrame) => Math.hypot(f.cakePos.x - f.binPos.x, f.cakePos.z - f.binPos.z) < 0.05;
export function hiddenInBin(f: BirthdayFrame): boolean {
  return !f.cakeVisible || (centred(f) && f.cakePos.y + CAKE_TOTAL_HEIGHT < BIN.rimTop - HIDDEN_DEPTH);
}
const seenA = new Vector3(), seenB = new Vector3();
/** Where the cake is seen to be: inside the bin, never deeper than the line of sight. */
function seen(f: BirthdayFrame, out: Vector3): Vector3 {
  out.copy(f.cakePos);
  if (centred(f)) out.y = Math.max(out.y, BIN.rimTop - HIDDEN_DEPTH - CAKE_TOTAL_HEIGHT);
  return out;
}
/** Per-frame visible move of the cake (position, and its lean at the wick tips). */
export function cakeStep(a: BirthdayFrame, b: BirthdayFrame): number {
  if (hiddenInBin(a) && hiddenInBin(b)) return 0;
  return seen(a, seenA).distanceTo(seen(b, seenB)) + Math.abs(b.cakeLean - a.cakeLean) * CAKE_TOTAL_HEIGHT;
}
/** Per-frame move of the bin (position, and its flaps' opening fraction). */
export const binStep = (a: BirthdayFrame, b: BirthdayFrame) => a.binPos.distanceTo(b.binPos) + Math.abs(a.flaps - b.flaps);

const FRAME = 1 / 60;
const fa = newFrame(), fb = newFrame();
const copyMotion = (to: BirthdayFrame, from: BirthdayFrame) => {
  to.cakePos.copy(from.cakePos); to.binPos.copy(from.binPos);
  to.cakeLean = from.cakeLean; to.flaps = from.flaps; to.cakeVisible = from.cakeVisible;
};

/** The decline's own fastest 60 fps frame for the cake and for the bin, at any frame phase. */
let pace: [number, number] | null = null;
export function declinePace(): [number, number] {
  if (!pace) {
    let p: [number, number] = [0, 0];
    for (let t = 0; t < DURATIONS.decline; t += FRAME / 8) {
      sampleSequence('decline', t, fa);
      sampleSequence('decline', t + FRAME, fb);
      p = [Math.max(p[0], cakeStep(fa, fb)), Math.max(p[1], binStep(fa, fb))];
    }
    pace = p;
  }
  return pace;
}

const LEN_DT = 0.002;
/**
 * Cumulative path length along the decline, every 2 ms up to its CONTENT_END: the cake's move plus
 * the bin's, each in units of its own fastest frame. The rewind is paced by it, so the beats where
 * only the camera moves (the first BIN_DELAY) or the cake is out of sight take no rewind time.
 */
let cum: Float64Array | null = null;
function lengths(): Float64Array {
  if (!cum) {
    const [cakePace, binPace] = declinePace();
    const n = Math.ceil(DECLINE_END / LEN_DT);
    cum = new Float64Array(n + 1);
    sampleSequence('decline', 0, fa);
    for (let i = 1; i <= n; i++) {
      sampleSequence('decline', Math.min(i * LEN_DT, DECLINE_END), fb);
      cum[i] = cum[i - 1]! + cakeStep(fa, fb) / cakePace + binStep(fa, fb) / binPace;
      copyMotion(fa, fb);
    }
  }
  return cum;
}
/** Path length from the decline's start to time s. */
export function lengthAt(s: number): number {
  const c = lengths();
  const x = Math.min(Math.max(s, 0), DECLINE_END) / LEN_DT;
  const i = Math.min(Math.floor(x), c.length - 2);
  return c[i]! + (c[i + 1]! - c[i]!) * (x - i);
}
/** The earliest decline time at which the path length reaches d (a still beat is skipped). */
function timeAtLength(d: number): number {
  const c = lengths();
  if (d <= 0) return 0;
  if (d >= c[c.length - 1]!) return DECLINE_END;
  let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (c[mid]! < d) lo = mid; else hi = mid; }
  const span = c[hi]! - c[lo]!;
  return Math.min((lo + (span > 0 ? (d - c[lo]!) / span : 1)) * LEN_DT, DECLINE_END);
}
/** Path speed (length per second) of the decline at time s. */
function speedAt(s: number): number {
  const a = Math.max(s - 0.004, 0), b = Math.min(s + 0.004, DECLINE_END);
  return b > a ? (lengthAt(b) - lengthAt(a)) / (b - a) : 0;
}
/** Length left at u ∈ [0, 1] of a rewind of R s and its rate per unit u: leaves at v0 (no velocity jump), lands softly at 0. */
function rewindLength(L0: number, v0: number, R: number, u: number): [number, number] {
  const u2 = u * u, u3 = u2 * u;
  return [(2 * u3 - 3 * u2 + 1) * L0 + (u3 - 2 * u2 + u) * v0 * R, (6 * u2 - 6 * u) * L0 + (3 * u2 - 4 * u + 1) * v0 * R];
}

/** The shortest rewind (REWIND.min–max, 10 ms steps) whose every frame moves the cake and the bin at most REWIND.pace × the decline's own fastest frame. */
export function rewindDuration(L0: number, v0: number): number {
  const [cakePace, binPace] = declinePace();
  for (let R = REWIND.min; R < REWIND.max; R += 0.01) {
    let ok = true;
    sampleSequence('decline', timeAtLength(L0), fa);
    for (let t = FRAME; t < R + FRAME && ok; t += FRAME) {
      sampleSequence('decline', timeAtLength(rewindLength(L0, v0, R, Math.min(t / R, 1))[0]), fb);
      ok = cakeStep(fa, fb) <= REWIND.pace * cakePace && binStep(fa, fb) <= REWIND.pace * binPace;
      copyMotion(fa, fb);
    }
    if (ok) return R;
  }
  return REWIND.max;
}

export interface AnswerChange {
  /** The outcome that was showing, and the time along it where the change happened. */
  from: Outcome;
  at: number;
  /** Its playback rate there (1 while it plays, 0 at rest): the rewind leaves at that speed. */
  rate: number;
  /** Path length from the decline's start to `at`, and the path speed there. */
  length: number;
  speed: number;
  /** Rewind duration (0 when the change returns to the outcome being rewound). */
  rewind: number;
  /** The new outcome; its time `start + (t − rewind)·k` after the rewind. */
  next: Outcome;
  start: number;
  k: number;
  /** Per candle: still burning at the change (the snuff had not reached it). */
  burning: boolean[];
  /**
   * The fire under way at the change, on its own clock (BirthdayScene.interruptCut): it carries on
   * through the rewind and after it. Null: none had begun (the candles burn on, then the breath).
   */
  fire: FireChange | null;
}

/**
 * A change of mind from the decline at time `at` (rate 1 while it plays, 0 at rest). Back to the
 * decline being rewound (from === next): it plays on from where it is.
 */
export function planAnswerChange(from: Outcome, at: number, rate: number, next: Outcome, fire: FireChange | null = null): AnswerChange {
  const a = Math.min(Math.max(at, 0), CONTENT_END[from]);
  const r = a < CONTENT_END[from] ? rate : 0;
  const burning = Array.from({ length: CANDLE_COUNT }, (_, i) => from === 'accept' ? false : !flameState(i, a, 'decline').out && flameState(i, a, 'decline').intensity >= 1 - 1e-9);
  if (from === next || from === 'accept') return { from, at: a, rate: r, length: 0, speed: 0, rewind: 0, next, start: from === next ? a : 0, k: 1, burning, fire };
  const length = lengthAt(a), speed = r * speedAt(a);
  const rewind = rewindDuration(length, speed);
  const k = Math.max(1, CONTENT_END.accept / (DURATIONS.accept - rewind));
  return { from, at: a, rate: r, length, speed, rewind, next, start: 0, k, burning, fire };
}

/** Where the change is at time `t` of the new outcome's playback: [outcome, its time, its rate]. */
export function changeTime(c: AnswerChange, t: number): [Outcome, number, number] {
  if (t < c.rewind) {
    const [d, dd] = rewindLength(c.length, c.speed, c.rewind, t / c.rewind);
    const s = timeAtLength(d);
    const v = speedAt(s);
    return [c.from, s, v > 1e-9 ? dd / c.rewind / v : 0];
  }
  const s = c.start + (t - c.rewind) * c.k;
  return s >= CONTENT_END[c.next] ? [c.next, CONTENT_END[c.next], 0] : [c.next, s, c.k];
}

/**
 * The accept's own clock after the rewind while its breath plays (sped up by k), real time once it
 * is over (changeTime holds there): the smoke and the setting wax run on it, continuous at the switch.
 */
export function acceptClock(c: AnswerChange, t: number): number {
  if (t < c.rewind) return 0;
  const s = c.start + (t - c.rewind) * c.k;
  const end = CONTENT_END.accept;
  return s < end ? s : end + (t - c.rewind - (end - c.start) / c.k);
}

/** The frame at time t of a change's playback (the rewind, then the new outcome), fire carried. */
export function sampleAnswerChange(c: AnswerChange, t: number, out: BirthdayFrame): BirthdayFrame {
  const [seq, s] = changeTime(c, t);
  sampleSequence(seq, s, out);
  // The fire under way at the change goes on on its own clock: nothing relights, the smoke rises on.
  if (c.fire) {
    carriedFire(c.fire, t, out);
    return out;
  }
  if (c.from !== 'decline' || c.next !== 'accept') return out;
  // The fire is never rewound (no candle relights, no melt pops back).
  const sa = acceptClock(c, t);
  let breath = false;
  for (let i = 0; i < CANDLE_COUNT; i++) {
    const f = out.flames[i]!;
    if (!c.burning[i]) {
      // Snuffed (or being snuffed) at the change: it goes on going out and stays out; its wax sets.
      flameState(i, c.at + t, 'decline', f);
      out.litTime[i] = litTime('decline', i, Math.min(c.at + t, DURATIONS.decline));
      out.cool[i] = coolTime('decline', i, c.at + t);
      continue;
    }
    // Still burning: it burns through the rewind, then the accept's breath blows it out.
    const burnt = litTime('decline', i, c.at) + Math.min(t, c.rewind);
    if (t < c.rewind) {
      litFlame(f);
      out.litTime[i] = burnt;
      out.cool[i] = 0;
    } else {
      flameState(i, sa, 'accept', f);
      out.litTime[i] = burnt + litTime('accept', i, sa) - litTime('accept', i, 0);
      out.cool[i] = coolTime('accept', i, sa);
      breath = true;
    }
  }
  out.smokeTime = breath ? sa : -1;
  out.smokeKind = 'breath';
  return out;
}
