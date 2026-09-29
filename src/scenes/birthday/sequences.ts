import { Vector3 } from 'three';
import { cubicBezier, EASE, easeInQuad, easeOutCubic, lerp, seg, smoothstep } from '../../motion/curves.ts';
import type { CanonicalPose, SequenceName } from '../../core/types.ts';
import {
  BIN_AT, BIN_FROM, CARRY, CANDLE_HOVER, CANDLE_LOWER, CANDLE_START, DROPPED, DURATIONS, HOVER_OVER_BIN, LEAN, ON_STAND,
  OUT_LEN, OUT_START, PRESENT_YAW, WICK_LEAN, WISP_LEN, WISP_OPACITY, WISP_RISE, WISP_START,
} from './poses.ts';

/**
 * Pure authored choreography for Birthday: every value is a function of time, so replay and
 * reversal restore cake, candles, flames, wisps and bin exactly (Birthday sub-spec).
 */

export interface BirthdayFrame {
  cakePos: Vector3;
  /** cake_secondary rotation.y: host presentation turn. */
  cakeYaw: number;
  cakeVisible: boolean;
  /** Each candle's height above its seated socket position. */
  drop: [number, number, number];
  flameScale: [number, number, number];
  flameOpacity: [number, number, number];
  /** Breath lean amount (0–1+) applied as LEAN rotation to each flame. */
  flameLean: [number, number, number];
  wickLean: number;
  wispOpacity: [number, number, number];
  wispRise: [number, number, number];
  binPos: Vector3;
  binVisible: boolean;
  /** Flap opening fraction (0 closed, 1 open). */
  flaps: number;
}

export function newFrame(): BirthdayFrame {
  return frameFor('guest-ready', {
    cakePos: new Vector3(), cakeYaw: 0, cakeVisible: true, drop: [0, 0, 0], flameScale: [1, 1, 1], flameOpacity: [1, 1, 1],
    flameLean: [0, 0, 0], wickLean: 0, wispOpacity: [0, 0, 0], wispRise: [0, 0, 0], binPos: new Vector3(), binVisible: false, flaps: 0,
  });
}

const set3 = (a: [number, number, number], v: number) => { a[0] = a[1] = a[2] = v; };

export function frameFor(pose: CanonicalPose, out: BirthdayFrame): BirthdayFrame {
  const lit = pose === 'guest-ready' ? 1 : 0;
  out.cakePos.copy(pose === 'declined' ? DROPPED : ON_STAND);
  out.cakeYaw = pose === 'host-ready' ? PRESENT_YAW : 0;
  out.cakeVisible = pose !== 'declined';
  set3(out.drop, pose === 'host-ready' ? CANDLE_HOVER : 0);
  set3(out.flameScale, lit);
  set3(out.flameOpacity, lit);
  set3(out.flameLean, 0);
  out.wickLean = 0;
  set3(out.wispOpacity, 0);
  set3(out.wispRise, 0);
  out.binPos.copy(pose === 'declined' ? BIN_AT : BIN_FROM);
  out.binVisible = pose === 'declined';
  out.flaps = 0;
  return out;
}

// ── Host: 1.3 s ───────────────────────────────────────────────────────────────
/** Candles lower with control and land softly at exactly the insertion depth. */
const PLACE = cubicBezier(0.4, 0, 0.2, 1);
function host(t: number, out: BirthdayFrame): void {
  frameFor('guest-ready', out);
  // 0–0.20: the cake presents, turning square to the camera.
  out.cakeYaw = lerp(PRESENT_YAW, 0, EASE.travel(seg(t, 0, 0.2)));
  // 0.20–0.85: three candles lower into their sockets, ≈100 ms apart.
  for (let i = 0; i < 3; i++) out.drop[i] = CANDLE_HOVER * (1 - PLACE(seg(t, CANDLE_START[i]!, CANDLE_START[i]! + CANDLE_LOWER)));
  // 0.85–1.05: flames appear as a restrained scale/opacity rise, 30 ms apart, no overshoot.
  for (let i = 0; i < 3; i++) {
    const k = smoothstep(seg(t, 0.85 + 0.03 * i, 0.99 + 0.03 * i));
    out.flameScale[i] = k;
    out.flameOpacity[i] = k;
  }
  // 1.05–1.30: the guest-ready composition holds.
}

// ── Accept: 1.4 s ─────────────────────────────────────────────────────────────
function accept(t: number, out: BirthdayFrame): void {
  frameFor('guest-ready', out);
  // 0–0.25: a breath — every flame and wick leans the same way.
  const breath = EASE.lift(seg(t, 0, 0.25));
  // 1.00–1.40: wicks return to rest.
  out.wickLean = WICK_LEAN * breath * (1 - EASE.land(seg(t, 1, 1.4)));
  for (let i = 0; i < 3; i++) {
    // 0.25–0.60: each flame shrinks and goes out, left to right.
    const k = seg(t, OUT_START[i]!, OUT_START[i]! + OUT_LEN);
    out.flameLean[i] = k >= 1 ? 0 : breath * (1 + 0.5 * k);
    out.flameScale[i] = 1 - easeInQuad(k);
    out.flameOpacity[i] = 1 - k ** 1.5;
    // 0.60–1.00: at most one faint wisp per candle, dissolving upward.
    const w = seg(t, WISP_START[i]!, WISP_START[i]! + WISP_LEN);
    out.wispOpacity[i] = w > 0 && w < 1 ? WISP_OPACITY * Math.sin(Math.PI * w) : 0;
    out.wispRise[i] = WISP_RISE * easeOutCubic(w);
  }
}

// ── Decline: 1.5 s ────────────────────────────────────────────────────────────
const FLAP_OPEN = cubicBezier(0.3, 0, 0.2, 1);
const FLAP_CLOSE = cubicBezier(0.45, 0, 0.35, 1);
const DESCEND = cubicBezier(0.55, 0, 0.5, 1);
/** Plan travel: slow to start so the cake rises clear of the stand before it moves across. */
const CARRY_ACROSS = cubicBezier(0.6, 0, 0.4, 1);
/** Soft close: the last sliver of flap travel is taken up by the damper. */
const FLAP_GAP = 0.03;
function decline(t: number, out: BirthdayFrame): void {
  frameFor('guest-ready', out);
  // 0–0.25: the bin slides into the margin and opens; the flames go out.
  out.binVisible = t > 0;
  out.binPos.lerpVectors(BIN_FROM, BIN_AT, EASE.travel(seg(t, 0, 0.24)));
  const out3 = 1 - smoothstep(seg(t, 0.02, 0.18));
  set3(out.flameScale, out3);
  set3(out.flameOpacity, out3);
  if (t < 0.95) out.flaps = FLAP_OPEN(seg(t, 0.08, 0.25));
  else if (t < 1.2) out.flaps = lerp(1, FLAP_GAP, FLAP_CLOSE(seg(t, 0.95, 1.2)));
  else out.flaps = lerp(FLAP_GAP, 0, EASE.land(seg(t, 1.2, 1.4)));
  // 0.25–0.72: cake and candles are lifted off the stand, carried across and held over the
  // opening. 0.72–0.95: straight down through the opening; the bin's front wall hides it.
  if (t < 0.25) out.cakePos.copy(ON_STAND);
  else if (t < 0.72) {
    const u = CARRY_ACROSS(seg(t, 0.25, 0.72));
    out.cakePos.set(lerp(ON_STAND.x, HOVER_OVER_BIN.x, u), 0, lerp(ON_STAND.z, HOVER_OVER_BIN.z, u));
    out.cakePos.y = t < 0.42 ? lerp(ON_STAND.y, CARRY, EASE.lift(seg(t, 0.25, 0.42))) : lerp(CARRY, HOVER_OVER_BIN.y, smoothstep(seg(t, 0.42, 0.72)));
  } else out.cakePos.lerpVectors(HOVER_OVER_BIN, DROPPED, DESCEND(seg(t, 0.72, 0.95)));
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
