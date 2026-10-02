import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { Box3, Color, Matrix4, MeshStandardMaterial, type Object3D, Vector3 } from 'three';
import type { Node } from '@gltf-transform/core';
import type { KHRMaterialsVariants } from '@gltf-transform/extensions';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { boxIn, createIO, findNode } from '../scripts/masters/compose.ts';
import { loadSharp } from '../scripts/masters/sharp.ts';
import { PALETTE, recipe } from '../scripts/masters/recipes/birthday.ts';
import {
  BIN_POS, BIN_YAW, birthdayBounds, CAKE_RADIUS, CAKE_SCALE, CAKE_TOTAL_HEIGHT, CANDLE, CANDLE_COUNT, CANDLE_SOCKETS, FLAME, FLAME_TOP, LEAN_MAX, MASTER,
  RIM_CLEARANCE, screenX, STAND, STAND_TOP,
} from '../models/birthdayContract.ts';
import { BIRTHDAY_GLB_NODES, buildBirthdayGeometry } from '../models/birthdayParts.ts';
import { BIN, BIN_CLOSE, buildDisposalBin } from '../models/disposalBin.ts';
import { BIN_SHADE } from '../models/birthday.ts';
import {
  CAKE_LOAD, CANDLE_CONTACT_SPEED, CANDLE_DESCENTS, CANDLE_HOVER, CANDLE_LEAN, CANDLE_PRESS, CANDLE_SEATED, CANDLE_START, CARRY_FROM, DURATIONS, FLAPS_CLOSE, IGNITE, IGNITE_START,
  LEAN_FADE, LIFT_TO,
} from '../src/scenes/birthday/poses.ts';
import { BREATH_AT, burnRate, extinguishedAt, type FlameState } from '../src/scenes/birthday/fire.ts';
import {
  ACCEPTED_LIT, cakeLoad, candleDrop, carryLean, coolTime, DECLINED_LIT, flameScaleOf, frameFor, GUEST_READY_LIT, LEAN_AXIS, litTime, newFrame, OUT_ACCEPT, pressOf, sampleSequence, type BirthdayFrame,
} from '../src/scenes/birthday/sequences.ts';
import { candleShortening, MELT_CANDLE, MELT_CAP, MELT_TIME_SCALE, meltAmount, meltState, SET_AFTER, solidify } from '../src/scenes/birthday/melt.ts';
import { birthdayFramePoints } from '../src/scenes/birthday/framing.ts';
import type { CanonicalPose, SequenceName } from '../src/core/types.ts';

const at = (seq: SequenceName, t: number) => sampleSequence(seq, t, newFrame());
const pose = (p: CanonicalPose) => frameFor(p, newFrame());
const ARRAYS = ['drop', 'press', 'lean', 'litTime', 'cool'] as const;
const SCALARS = ['cakeYaw', 'cakeLean', 'cakeDip', 'cakeTiltX', 'cakeTiltZ', 'flaps'] as const;
/** A flame's drawn channels (the lean as a plan vector, so its direction is moot when upright). */
const FLAME_KEYS = ['lit', 'height', 'width', 'leanX', 'leanZ', 'bend', 'neck', 'lift', 'cut', 'cool', 'intensity'] as const;
const flameChannel = (f: FlameState, k: (typeof FLAME_KEYS)[number]) =>
  k === 'leanX' ? f.tilt * f.dirX : k === 'leanZ' ? f.tilt * f.dirZ : f[k];
const DEG = Math.PI / 180;

function close(a: BirthdayFrame, b: BirthdayFrame, eps = 1e-6) {
  expect(a.cakePos.distanceTo(b.cakePos)).toBeLessThan(eps);
  expect(a.binPos.distanceTo(b.binPos)).toBeLessThan(eps);
  for (const k of SCALARS) expect(Math.abs(a[k] - b[k]), k).toBeLessThan(eps);
  for (const k of ARRAYS) {
    expect(a[k].length).toBe(CANDLE_COUNT);
    for (let i = 0; i < CANDLE_COUNT; i++) expect(Math.abs(a[k][i]! - b[k][i]!), `${k}[${i}]`).toBeLessThan(eps);
  }
  // The drawn state of each flame (a flame that is out has no shape to compare).
  for (let i = 0; i < CANDLE_COUNT; i++) {
    const fa = a.flames[i]!, fb = b.flames[i]!;
    expect(fa.out, `flame ${i} out`).toBe(fb.out);
    expect(Math.abs(fa.intensity - fb.intensity), `flame ${i} intensity`).toBeLessThan(eps);
    if (!fa.out) for (const k of FLAME_KEYS) expect(Math.abs(flameChannel(fa, k) - flameChannel(fb, k)), `flame ${i} ${k}`).toBeLessThan(eps);
  }
  expect(a.cakeVisible).toBe(b.cakeVisible);
  expect(a.cakeInBin).toBe(b.cakeInBin);
  expect(a.binVisible).toBe(b.binVisible);
}

/** Cake position in the bin's local frame (x across the flaps, z along the approach). */
function binLocal(p: Vector3) {
  const dx = p.x - BIN_POS.x, dz = p.z - BIN_POS.z;
  const c = Math.cos(-BIN_YAW), s = Math.sin(-BIN_YAW);
  return { x: dx * c + dz * s, z: -dx * s + dz * c, d: Math.hypot(dx, dz) };
}

/** Every animated channel of a frame as one flat list (for the velocity-continuity test). */
function channels(f: BirthdayFrame): number[] {
  const out = [f.cakePos.x, f.cakePos.y, f.cakePos.z, f.binPos.x, f.binPos.y, f.binPos.z, f.cakeYaw, f.cakeLean, f.cakeDip, f.cakeTiltX, f.cakeTiltZ, f.flaps];
  for (const k of ARRAYS) out.push(...f[k]);
  for (const fl of f.flames) for (const k of FLAME_KEYS) out.push(flameChannel(fl, k));
  return out;
}

describe('Birthday choreography', () => {
  it('each sequence starts and ends exactly on its canonical poses', () => {
    close(at('host', 0), pose('host-ready'));
    close(at('host', DURATIONS.host), pose('guest-ready'));
    close(at('accept', 0), pose('guest-ready'));
    close(at('accept', DURATIONS.accept), pose('accepted'));
    close(at('decline', 0), pose('guest-ready'));
    close(at('decline', DURATIONS.decline), pose('declined'));
  });

  it('has no discontinuities: consecutive 1 ms samples never jump', () => {
    for (const seq of ['host', 'accept', 'decline'] as const) {
      let prev = at(seq, 0);
      for (let i = 1; i <= DURATIONS[seq] * 1000; i++) {
        const cur = at(seq, i / 1000);
        expect(cur.cakePos.distanceTo(prev.cakePos)).toBeLessThan(0.02);
        expect(Math.abs(cur.cakeLean - prev.cakeLean)).toBeLessThan(0.001);
        for (let k = 0; k < CANDLE_COUNT; k++) {
          expect(Math.abs(cur.drop[k]! - prev.drop[k]!)).toBeLessThan(0.01);
          expect(Math.abs(cur.flames[k]!.intensity - prev.flames[k]!.intensity)).toBeLessThan(0.05);
        }
        expect(Math.abs(cur.flaps - prev.flaps)).toBeLessThan(0.03);
        if (seq !== 'decline' || i > 1) expect(cur.binPos.distanceTo(prev.binPos)).toBeLessThan(0.05);
        prev = cur;
      }
    }
  });

  it('is C1: no velocity jumps anywhere (second differences at 0.1 ms stay at acceleration scale)', () => {
    // A velocity jump Δv shows as a second difference ≈ Δv·h; smooth motion gives a·h². With
    // h = 0.1 ms, 1e-5 allows accelerations up to 1000 units/s² and catches any velocity jump over
    // 0.1 units/s. Flame channels are dimensionless (scale, radians); their breath response is
    // fast: the breath's front arrives as a C¹ pulse peaking in 75 ms, whose onset accelerates the
    // lean at ≈8,000 rad/s² (a real flame answers a gust within ≈10 ms), so they allow 1e-4
    // (jumps over 1 rad/s, under a degree per frame, are still caught). Exempt:
    // a flame's shape channels while it is invisible (intensity 0 at either end), and the first step
    // of decline, where the bin appears (a visibility switch, not motion).
    const h = 0.0001;
    const names = ['cake.x', 'cake.y', 'cake.z', 'bin.x', 'bin.y', 'bin.z', ...SCALARS, ...ARRAYS.flatMap((k) => Array.from({ length: CANDLE_COUNT }, (_, j) => `${k}[${j}]`)),
      ...Array.from({ length: CANDLE_COUNT }, (_, j) => FLAME_KEYS.map((k) => `flame[${j}].${k}`)).flat()];
    const base = 6 + SCALARS.length + ARRAYS.length * CANDLE_COUNT;
    for (const seq of ['host', 'accept', 'decline'] as const) {
      for (let i = 1; i < DURATIONS[seq] / h - 0.5; i++) {
        if (seq === 'decline' && i < 2) continue;
        const a = at(seq, (i - 1) * h), b = at(seq, i * h), c = at(seq, (i + 1) * h);
        const ca = channels(a), cb = channels(b), cc = channels(c);
        for (let k = 0; k < cb.length; k++) {
          const flame = k >= base ? Math.floor((k - base) / FLAME_KEYS.length) : -1;
          if (flame >= 0 && Math.min(a.flames[flame]!.intensity, c.flames[flame]!.intensity) < 1e-9) continue;
          // Contact: the buttercream starts moving with the candle the instant it is touched (the
          // candle itself is C1 through it; its push-in progress starts at the candle's speed).
          const p = /^press\[(\d)\]$/.exec(names[k]!);
          if (p && Math.abs(i * h - (CANDLE_START[+p[1]!]! + CANDLE_DESCENTS[+p[1]!]!)) < 2 * h) continue;
          // The setting clock starts as a flame goes out (a kink by nature, not motion).
          if (/^cool\[/.test(names[k]!)) continue;
          const d2 = Math.abs(ca[k]! - 2 * cb[k]! + cc[k]!);
          // Positions: the bin's 2.8-unit slide-in peaks near 1100 units/s²; allow 3000 (jumps > 0.3 units/s).
          const limit = k < 6 ? 3e-5 : flame >= 0 ? 1e-4 : 1e-5;
          if (d2 < limit) continue;
          if (flame >= 0) {
            // Large but smooth (a gust's onset)? A velocity jump's second difference scales with
            // the step (Δv·h), smooth motion's with its square (a·h²): at h/4 a jump keeps a
            // quarter of it, smooth motion a sixteenth.
            const q = h / 4, t = i * h;
            const d2q = Math.abs(channels(at(seq, t - q))[k]! - 2 * channels(at(seq, t))[k]! + channels(at(seq, t + q))[k]!);
            if (d2 / Math.max(d2q, 1e-300) > 10) continue;
          }
          throw new Error(`${seq} ${names[k]} at ${(i * h * 1000).toFixed(1)} ms: second difference ${d2.toExponential(2)}`);
        }
      }
    }
  });

  it('six candles are lowered by a careful hand at uneven intervals and pushed 10 mm in: the buttercream yields, then drags harder with depth', () => {
    expect(CANDLE_START).toHaveLength(6);
    // Not a metronome: gaps of 60–115 ms, not all equal; approaches 0.6–0.74 s, not all equal.
    const gaps = CANDLE_START.slice(1).map((s, i) => s - CANDLE_START[i]!);
    for (const g of gaps) { expect(g).toBeGreaterThanOrEqual(0.06 - 1e-9); expect(g).toBeLessThanOrEqual(0.115 + 1e-9); }
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(0.015);
    expect(Math.max(...CANDLE_DESCENTS) - Math.min(...CANDLE_DESCENTS)).toBeGreaterThan(0.03);
    // Real candles stand ≈ 10 mm deep in buttercream.
    expect(CANDLE.insert).toBeGreaterThan(0.045);
    expect(CANDLE.insert).toBeLessThan(0.06);
    for (let i = 0; i < CANDLE_COUNT; i++) {
      expect(at('host', CANDLE_START[i]! - 0.001).drop[i]).toBe(CANDLE_HOVER);
      expect(at('host', CANDLE_START[i]! + 0.05).drop[i]).toBeLessThan(CANDLE_HOVER);
      expect(at('host', CANDLE_SEATED[i]!).drop[i]).toBe(0);
      expect(CANDLE_SEATED[i]).toBeLessThan(IGNITE_START[i]!);
      const T = CANDLE_DESCENTS[i]!;
      const d = (t: number) => candleDrop(t, i);
      const v = (t: number) => (d(t + 1e-5) - d(t - 1e-5)) / 2e-5;
      const a = (t: number) => (d(t + 1e-4) - 2 * d(t) + d(t - 1e-4)) / 1e-8;
      // Monotone all the way down, never below the seat (frosting does not spring back).
      let prev = Infinity;
      for (let us = 0; us <= (T + CANDLE_PRESS + 0.1) * 1e6; us += 500) {
        const h = d(us / 1e6);
        expect(h).toBeLessThanOrEqual(prev + 1e-12);
        expect(h).toBeGreaterThanOrEqual(0);
        prev = h;
      }
      // A careful hand: C² from rest (no jolt), a speed bell peaking at 10–15 cm/s, under 1 m/s².
      expect(Math.abs(a(1e-4))).toBeLessThan(0.5);
      let peak = 0, accel = 0;
      for (let t = 0.001; t < T; t += 0.001) { peak = Math.max(peak, -v(t)); accel = Math.max(accel, Math.abs(a(t))); }
      expect(peak * 20).toBeGreaterThan(10);
      expect(peak * 20).toBeLessThan(15);
      expect(accel * 0.2).toBeLessThan(1);
      // Contact: the base at the surface at a steady, slow speed (5 cm/s), no acceleration (C²).
      expect(d(T)).toBeCloseTo(CANDLE.insert, 9);
      expect(v(T)).toBeCloseTo(-CANDLE_CONTACT_SPEED, 3);
      expect(Math.abs(a(T - 2e-4))).toBeLessThan(0.05);
      // In the buttercream: it slows all the way to the seat. The skin's yield is the first, sharper
      // drop in speed; then the drag grows with depth (the deceleration rises over the last 60 %).
      let last = Infinity;
      for (let k = 1; k < 40; k++) {
        const sp = -v(T + (k / 40) * CANDLE_PRESS);
        expect(sp).toBeLessThan(last);
        last = sp;
      }
      const decel = (u: number) => (v(T + (u + 0.01) * CANDLE_PRESS) - v(T + (u - 0.01) * CANDLE_PRESS)) / (0.02 * CANDLE_PRESS);
      expect(decel(0.08)).toBeGreaterThan(decel(0.3));
      expect(decel(0.95)).toBeGreaterThan(decel(0.5));
      expect(decel(0.5)).toBeGreaterThan(decel(0.3));
      expect(Math.abs(v(T + CANDLE_PRESS - 1e-5))).toBeLessThan(1e-3);
    }
    expect(CANDLE_PRESS).toBeGreaterThan(0.25);
    expect(CANDLE_PRESS).toBeLessThan(0.6);
  });

  it('the press: no collar before contact, a full collar once seated; each candle takes its own fixed lean (≤ 2°)', () => {
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const contact = CANDLE_START[i]! + CANDLE_DESCENTS[i]!;
      expect(at('host', contact - 0.002).press[i]).toBe(0);
      expect(at('host', contact - 0.002).lean[i]).toBe(0);
      expect(at('host', contact + CANDLE_PRESS / 2).press[i]).toBeGreaterThan(0.3);
      expect(at('host', CANDLE_SEATED[i]!).press[i]).toBe(1);
      expect(at('host', CANDLE_SEATED[i]!).lean[i]).toBe(1);
      expect(pressOf(CANDLE.insert)).toBe(0);
      expect(CANDLE_LEAN[i]!.angle).toBeGreaterThanOrEqual(0.6 * DEG - 1e-9);
      expect(CANDLE_LEAN[i]!.angle).toBeLessThanOrEqual(1.8 * DEG + 1e-9);
    }
    // Hand-placed, not machined: the six lean in different directions.
    const dirs = CANDLE_LEAN.map((l) => l.azimuth);
    for (let i = 0; i < dirs.length; i++) for (let j = i + 1; j < dirs.length; j++) expect(Math.cos(dirs[i]! - dirs[j]!)).toBeLessThan(0.99);
    expect(pose('host-ready').press.every((p) => p === 0)).toBe(true);
    expect(pose('guest-ready').lean.every((p) => p === 1)).toBe(true);
  });

  it('the cake gives under the pushes: a 1–2 mm squash that rings down, visibly, to exactly 0 before guest-ready', () => {
    let dip = 0, tilt = 0;
    const load: [number, number, number] = [0, 0, 0];
    const series: number[] = [];
    for (let ms = 0; ms <= DURATIONS.host * 1000; ms++) {
      cakeLoad(ms / 1000, load);
      series.push(load[0]);
      dip = Math.min(dip, load[0]);
      tilt = Math.max(tilt, Math.hypot(load[1], load[2]));
      if (ms < (CANDLE_START[0]! + CANDLE_DESCENTS[0]!) * 1000) expect(load).toEqual([0, 0, 0]);
    }
    // A soft sponge: the top tier dips 1–2 mm at the peak (5–10 units × 1e-3).
    expect(-dip * 200).toBeGreaterThan(1);
    expect(-dip * 200).toBeLessThan(2.2);
    expect(tilt).toBeLessThan(0.6 * DEG);
    // It rings down: after the last push the dip overshoots past its rest at least once.
    const after = series.slice(Math.round((Math.max(...CANDLE_SEATED) + 0.06) * 1000));
    expect(Math.max(...after)).toBeGreaterThan(0.0001);
    expect(cakeLoad(DURATIONS.host - 0.01)).toEqual([0, 0, 0]);
    expect(CAKE_LOAD.hz).toBeGreaterThan(6);
  });

  it('the molten wax sets after the blow: clear to opaque in 10–30 s of real time, on the melt\'s clock', () => {
    for (let i = 0; i < CANDLE_COUNT; i++) {
      expect(coolTime('host', i, 1)).toBe(0);
      expect(coolTime('accept', i, OUT_ACCEPT[i]! - 0.01)).toBe(0);
      expect(coolTime('accept', i, DURATIONS.accept)).toBeCloseTo(DURATIONS.accept - OUT_ACCEPT[i]!, 9);
      expect(pose('accepted').cool[i]).toBeCloseTo(DURATIONS.accept - OUT_ACCEPT[i]!, 9);
      expect(pose('guest-ready').cool[i]).toBe(0);
    }
    expect(solidify(0)).toBe(0);
    expect(solidify(10 / MELT_TIME_SCALE)).toBeGreaterThan(0.2);
    expect(solidify(10 / MELT_TIME_SCALE)).toBeLessThan(0.8);
    expect(solidify(30 / MELT_TIME_SCALE)).toBe(1);
    // Set within 10–30 s of real time; on screen, before the accept's smoke has cleared.
    expect(SET_AFTER * MELT_TIME_SCALE).toBeGreaterThanOrEqual(10);
    expect(SET_AFTER * MELT_TIME_SCALE).toBeLessThanOrEqual(30);
    expect(solidify(SET_AFTER)).toBe(1);
  });

  it('lit time (the melt\'s clock): 0 until a flame lights, grows with the fire\'s burn rate, freezes once it is out', () => {
    for (let i = 0; i < CANDLE_COUNT; i++) {
      expect(litTime('host', i, IGNITE_START[i]! - 0.001)).toBe(0);
      expect(at('host', DURATIONS.host).litTime[i]).toBeCloseTo(GUEST_READY_LIT[i]!, 9);
      // Seconds at full flame since it lit: less than the time since its wick caught (it grows),
      // more than the time since it was fully grown.
      expect(GUEST_READY_LIT[i]).toBeLessThan(DURATIONS.host - IGNITE_START[i]!);
      expect(GUEST_READY_LIT[i]).toBeGreaterThan(DURATIONS.host - IGNITE_START[i]! - IGNITE);
      // The melt reads the fire: the rate is the flame's output × size, exactly.
      expect(flameScaleOf('accept', i, 0.2)).toBe(burnRate(i, 0.2, 'accept'));
      const out = extinguishedAt(i);
      expect(litTime('accept', i, out + 0.05)).toBeCloseTo(litTime('accept', i, DURATIONS.accept), 9);
      expect(litTime('accept', i, out)).toBeGreaterThan(litTime('accept', i, BREATH_AT[i]!.lift));
      expect(pose('accepted').litTime[i]).toBeCloseTo(ACCEPTED_LIT[i]!, 9);
      expect(pose('declined').litTime[i]).toBeCloseTo(DECLINED_LIT[i]!, 9);
      expect(pose('host-ready').litTime[i]).toBe(0);
      let prev = -1;
      for (let ms = 0; ms <= 1400; ms += 5) {
        const l = litTime('accept', i, ms / 1000);
        expect(l).toBeGreaterThanOrEqual(prev);
        prev = l;
      }
      expect(flameScaleOf('accept', i, out + 0.01)).toBe(0);
    }
  });

  it('flames catch only once every candle is in (the lighter after the placing hand) and are steady before the host beat ends, never a flash', () => {
    const end = IGNITE_START[CANDLE_COUNT - 1]! + IGNITE;
    expect(end).toBeLessThanOrEqual(DURATIONS.host - 0.1);
    expect(IGNITE_START[0]).toBeGreaterThan(Math.max(...CANDLE_SEATED));
    let prev = Array.from({ length: CANDLE_COUNT }, () => 0);
    for (let i = 0; i <= Math.round(DURATIONS.host * 1000); i++) {
      const t = i / 1000;
      const f = at('host', t);
      for (let k = 0; k < CANDLE_COUNT; k++) {
        const fl = f.flames[k]!;
        expect(CANDLE_SEATED[k]).toBeLessThan(IGNITE_START[k]!);
        if (t < IGNITE_START[k]!) expect(fl.intensity).toBe(0);
        if (t >= end) { expect(fl.intensity).toBe(1); expect(fl.height).toBe(1); }
        expect(fl.intensity).toBeGreaterThanOrEqual(prev[k]! - 1e-12);
        expect(fl.intensity).toBeLessThanOrEqual(1);
        expect(fl.height).toBeLessThanOrEqual(1);
        prev[k] = fl.intensity;
      }
    }
  });

  it('accept: a breath from the camera side puts the flames out nearest the mouth first, each from the base up in 100–200 ms', () => {
    // Order: the breath reaches the candle nearest the mouth first (strongest flow) and lifts its
    // flame first; each then takes its own 110–170 ms (seeded) to go out, so neighbours may swap.
    const outAt = Array.from({ length: CANDLE_COUNT }, (_, k) => {
      for (let i = 0; i <= 1400; i++) if (at('accept', i / 1000).flames[k]!.out) return i / 1000;
      return Infinity;
    });
    const nearest = BREATH_AT.reduce((m, b, k) => (b.peak > BREATH_AT[m]!.peak ? k : m), 0);
    expect(Math.min(...BREATH_AT.map((b) => b.lift))).toBe(BREATH_AT[nearest]!.lift);
    expect(Math.min(...BREATH_AT.map((b) => b.arrive))).toBe(BREATH_AT[nearest]!.arrive);
    expect(Math.max(...outAt)).toBeLessThanOrEqual(0.45);
    // A wave, not all at once: ≥ 100 ms from first to last.
    expect(Math.max(...outAt) - Math.min(...outAt)).toBeGreaterThan(0.1);
    for (let k = 0; k < CANDLE_COUNT; k++) {
      const b = BREATH_AT[k]!;
      expect(outAt[k]).toBeCloseTo(extinguishedAt(k), 2);
      // Extinction from lift-off to dark: 100–200 ms, the front moving from the base up.
      expect(extinguishedAt(k) - b.lift).toBeGreaterThanOrEqual(0.1);
      expect(extinguishedAt(k) - b.lift).toBeLessThanOrEqual(0.2);
      let prevCut = 0;
      for (let t = b.lift; t < extinguishedAt(k); t += 0.002) {
        const f = at('accept', t).flames[k]!;
        expect(f.cut).toBeGreaterThanOrEqual(prevCut - 1e-12);
        prevCut = f.cut;
      }
      // Before the breath arrives: the steady flame.
      const calm = at('accept', b.arrive - 0.001).flames[k]!;
      expect(calm.tilt).toBe(0);
      expect(calm.intensity).toBe(1);
    }
  });

  it('accept: before it goes out every flame bends away from the breath, stretches, thins, necks and lifts off the wick', () => {
    for (let k = 0; k < CANDLE_COUNT; k++) {
      const b = BREATH_AT[k]!;
      const f = at('accept', b.lift).flames[k]!;
      // Leaning ≥ 50° (atan of the lift-off flow over the flame's buoyant velocity), longer and thinner.
      expect(f.tilt).toBeGreaterThan((50 * Math.PI) / 180);
      expect(f.height).toBeGreaterThan(1.2);
      expect(f.width).toBeLessThan(0.85);
      expect(f.neck).toBeGreaterThan(0.5);
      // Away from the camera (the mouth is on its side) and with a sideways part that reads on screen.
      const towardCam = [Math.sin((20 * Math.PI) / 180), Math.cos((20 * Math.PI) / 180)];
      const away = -(f.dirX * towardCam[0]! + f.dirZ * towardCam[1]!);
      const side = Math.abs(f.dirX * towardCam[1]! - f.dirZ * towardCam[0]!);
      expect(away).toBeGreaterThan(0.5);
      expect(side).toBeGreaterThan(0.5 * away);
      // Lifted: the base a few millimetres off the wick mid-extinction, never carried off far.
      const mid = at('accept', b.lift + 0.4 * b.out).flames[k]!;
      expect(mid.lift).toBeGreaterThan(0.001);
      expect(mid.lift).toBeLessThan(0.025);
    }
    expect(pose('accepted').flames.every((f) => f.out)).toBe(true);
  });

  it('candles are numbered left to right as the shared camera sees them', () => {
    const xs = CANDLE_SOCKETS.map(([x, z]) => screenX(x, z));
    for (let i = 1; i < CANDLE_COUNT; i++) expect(xs[i]!).toBeGreaterThan(xs[i - 1]! + 0.05);
  });

  it('decline: the carry lean is a damped sway within 2°, upright off the stand and before the drop', () => {
    let peak = 0, back = 0, fwd = 0;
    for (let i = 0; i <= 1500; i++) {
      const t = i / 1000, l = carryLean(t);
      peak = Math.max(peak, Math.abs(l));
      if (t < 0.48) back = Math.min(back, l);
      if (t > 0.5 && t < 0.75) fwd = Math.max(fwd, l);
      if (t <= 0.25 || t >= LEAN_FADE[1]) expect(l).toBe(0);
    }
    expect(peak).toBeLessThanOrEqual(LEAN_MAX + 1e-9);
    expect(LEAN_MAX).toBeLessThanOrEqual(2 * DEG);
    expect(peak).toBeGreaterThan(1.5 * DEG);
    // Leans back (top trailing) as it sets off towards the bin, forward as it slows over it.
    expect(back).toBeLessThan(-0.5 * DEG);
    expect(fwd).toBeGreaterThan(0.5 * DEG);
    expect(Math.abs(LEAN_AXIS.y)).toBeLessThan(1e-9);
    expect(LEAN_AXIS.dot(new Vector3(BIN_POS.x, 0, BIN_POS.z))).toBeCloseTo(0, 9);
  });

  it('decline: the cake clears the stand and the rim, passes between the flaps and drops straight down, centred', () => {
    // Plan radius of the shell border (the cake's underside rim), the part that tips lowest.
    const baseR = MASTER.cakeRadius * CAKE_SCALE;
    for (let i = 0; i <= 1500; i++) {
      const f = at('decline', i / 1000);
      const p = f.cakePos;
      const tip = Math.sin(Math.abs(f.cakeLean));
      const local = binLocal(p);
      // Any plan overlap with the bin: the underside (tipped) is above the rim.
      if (local.d < CAKE_RADIUS + BIN.radius + 0.02 && p.y > BIN.floor + 0.01 && local.d > 0.01) expect(p.y - baseR * tip).toBeGreaterThanOrEqual(BIN.rimTop + RIM_CLEARANCE - 0.03);
      // Over the opening: stays between the open flaps, lean included.
      if (local.d < BIN.opening && p.y > BIN.rimTop) expect(Math.abs(local.x) + CAKE_RADIUS + CAKE_TOTAL_HEIGHT * tip).toBeLessThan(BIN.hingeX - 0.02);
      // Below the rim: exactly centred in the opening, the tipped cake clear of its wall, and
      // upright (steadied) once it is fully inside.
      if (p.y < BIN.rimTop + 0.05 && local.d < BIN.radius + CAKE_RADIUS) {
        expect(local.d).toBeLessThan(1e-6);
        expect(CAKE_RADIUS + CAKE_TOTAL_HEIGHT * tip).toBeLessThan(BIN.opening - 0.04);
        if (p.y + CAKE_TOTAL_HEIGHT < BIN.rimTop) expect(Math.abs(f.cakeLean)).toBeLessThan(0.05 * DEG);
      }
      // Lift-off: the shell border beds 10 mm into the plate, so it rises clear of the bed before
      // it has moved 2 mm across (no sliding through the plate).
      const across = Math.hypot(p.x, p.z);
      if (across > 0.002 && across < STAND.radius) expect(p.y - STAND_TOP).toBeGreaterThan(0.01);
      // While over the stand, the tipped underside never sinks below its seat on the plate.
      if (Math.hypot(p.x, p.z) < STAND.radius + CAKE_RADIUS) expect(p.y - baseR * tip).toBeGreaterThanOrEqual(STAND_TOP - 1e-9);
    }
  });

  it('decline: lifts off heavily, gathering speed over several frames (no two-frame launch)', () => {
    const y = (frame: number) => at('decline', CARRY_FROM + frame * 0.016).cakePos.y;
    const steps = Array.from({ length: 12 }, (_, f) => y(f + 1) - y(f));
    const peak = Math.max(...steps);
    // The first three frames of the lift stay under half the peak per-frame step, and the peak
    // is at most 0.135 units a frame (v1.2 review: 0.153 reached in the third frame).
    for (let f = 0; f < 3; f++) expect(steps[f]!).toBeLessThan(0.5 * peak);
    expect(peak).toBeLessThan(0.135);
    expect(at('decline', LIFT_TO).cakePos.y).toBeGreaterThan(1.4);
  });

  it('decline: the cake is in the bin\'s shade only once it is over the opening, entirely above the rim', () => {
    let first = -1;
    for (let i = 0; i <= 1500; i++) {
      const f = at('decline', i / 1000);
      if (f.cakeInBin && first < 0) {
        first = i;
        // Switching on changes no pixel: the whole cake (underside up) is above the shade ramp.
        expect(f.cakePos.y).toBeGreaterThan(BIN.rimTop + BIN_SHADE.above);
        expect(binLocal(f.cakePos).d).toBeLessThan(1e-6);
      }
      if (first >= 0) expect(f.cakeInBin).toBe(true);
    }
    expect(first).toBeGreaterThan(0);
    expect(pose('declined').cakeInBin).toBe(true);
    expect(pose('guest-ready').cakeInBin).toBe(false);
  });

  it('decline: flaps close only once the cake and candles are below them; the hidden cake stops rendering', () => {
    const closingStarts = (() => {
      for (let i = 300; i <= 1500; i++) if (at('decline', i / 1000).flaps < 1 - 1e-9) return i / 1000;
      return 2;
    })();
    const f = at('decline', closingStarts);
    expect(f.cakePos.y + CAKE_TOTAL_HEIGHT).toBeLessThan(BIN.rimTop - 0.012);
    // v1.5: the bin's soft close: nearly shut (the damper's last gap) BIN_CLOSE.toGap after it starts.
    expect(at('decline', FLAPS_CLOSE + BIN_CLOSE.toGap).flaps).toBeLessThan(0.05);
    expect(at('decline', 1.5).cakeVisible).toBe(false);
    expect(at('decline', 0.2).flames.every((f) => f.out)).toBe(true);
  });

  it('the bin clears the stand: plan distance exceeds plate + bin radii', () => {
    expect(Math.hypot(BIN_POS.x, BIN_POS.z)).toBeGreaterThanOrEqual(STAND.radius + BIN.radius + 0.04);
  });

  it('the cake with candles fits the bin opening and sits below the flaps on the liner floor', () => {
    expect(CAKE_RADIUS).toBeLessThan(BIN.opening - 0.04);
    expect(BIN.floor + CAKE_TOTAL_HEIGHT).toBeLessThan(BIN.rimTop - 0.006);
  });
});

describe('Birthday melt (pure functions of lit time; the fire owner reads candleShortening)', () => {
  it('is fresh at the start, capped, and the same for the same lit time', () => {
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const fresh = meltState(i, 0);
      expect(fresh).toMatchObject({ round: 0, soften: 0, pool: 0, bead: 0, run: 0, shorten: 0, gloss: 0 });
      expect(meltState(i, MELT_CAP)).toEqual(meltState(i, MELT_CAP + 100));
      expect(meltState(i, 7.3)).toEqual(meltState(i, 7.3));
      expect(meltAmount(i, MELT_CAP)).toBeLessThanOrEqual(1);
    }
  });

  it('follows real paraffin, compressed MELT_TIME_SCALE×: a run leaves the rim after 20–40 s of burning', () => {
    expect(MELT_TIME_SCALE).toBeGreaterThan(5);
    expect(MELT_TIME_SCALE).toBeLessThan(12);
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const c = MELT_CANDLE[i]!;
      expect(c.runAt).toBeGreaterThanOrEqual(20);
      expect(c.runAt).toBeLessThanOrEqual(40);
      expect(meltState(i, (c.runAt - 0.5) / MELT_TIME_SCALE).run).toBe(0);
      expect(meltState(i, (c.runAt + 10) / MELT_TIME_SCALE).run).toBeGreaterThan(0.002);
      // Subtle: the run never reaches the frosting, the top burns down by a hair.
      expect(meltState(i, MELT_CAP).run).toBeLessThan(0.45 * CANDLE.height);
      expect(candleShortening(i, MELT_CAP)).toBeLessThanOrEqual(0.0041);
      expect(candleShortening(i, MELT_CAP)).toBeGreaterThan(0.002);
      // The canonical poses are nearly fresh (posters, reduced motion): no run yet.
      expect(meltState(i, GUEST_READY_LIT[i]!).run).toBe(0);
      expect(meltState(i, ACCEPTED_LIT[i]!).run).toBe(0);
      // Monotone in lit time.
      let prev = meltAmount(i, 0);
      for (let t = 0.1; t <= MELT_CAP; t += 0.1) {
        const m = meltAmount(i, t);
        expect(m).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = m;
      }
    }
  });

  it('the candles that lean more run first (the pool spills on the low side)', () => {
    const order = [...CANDLE_LEAN.keys()].sort((a, b) => CANDLE_LEAN[b]!.angle - CANDLE_LEAN[a]!.angle);
    const runs = order.map((i) => MELT_CANDLE[i]!.runAt);
    for (let k = 1; k < runs.length; k++) expect(runs[k]!).toBeGreaterThanOrEqual(runs[k - 1]! - 1e-9);
  });
});

function plainLibrary(): MaterialLibrary {
  const direction = DIRECTIONS.L2;
  const cache = new Map<string, MeshStandardMaterial>();
  const make = (name: string) => {
    const spec = direction.surfaces[name];
    if (!spec) throw new Error(`Unknown material ${name}`);
    return new MeshStandardMaterial({ name, color: new Color(spec.color) });
  };
  return {
    direction,
    get: (name: string) => cache.get(name) ?? (cache.set(name, make(name)), cache.get(name)!),
    unique: make,
    dispose() {},
  } as unknown as MaterialLibrary;
}

function box(o: Object3D): Box3 {
  o.updateWorldMatrix(true, true);
  return new Box3().setFromObject(o, true);
}

describe('Birthday builder (code-authored candles)', () => {
  const lib = plainLibrary();
  const root = buildBirthdayGeometry({ lib });

  it('puts each candle on its master socket with a wick and the flame\'s anchor at the tip (no flame mesh)', () => {
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const id = String(i + 1).padStart(2, '0');
      const candle = root.getObjectByName(`candle_${id}`)!;
      expect(candle.position.x).toBeCloseTo(CANDLE_SOCKETS[i]![0], 9);
      expect(candle.position.z).toBeCloseTo(CANDLE_SOCKETS[i]![1], 9);
      expect(candle.position.y).toBeCloseTo(CANDLE.seat, 9);
      const flame = candle.getObjectByName(`flame_${id}`)!;
      expect(flame.position.y).toBeCloseTo(CANDLE.flameBase, 9);
      expect(flame.children).toHaveLength(0);
      const wick = box(candle.getObjectByName(`wick_${id}`)!);
      const base = STAND_TOP + CANDLE.seat;
      expect(wick.max.y - base).toBeGreaterThan(CANDLE.wickBase + CANDLE.wickHeight - 0.002);
      expect(wick.min.y - base).toBeLessThan(CANDLE.height);
      // The real flame (v1.5): its cup 1 mm above the wax, the wick top inside it, its tip 14 mm up.
      expect(FLAME.base).toBeGreaterThan(CANDLE.height);
      expect(wick.max.y - base).toBeGreaterThan(FLAME.base);
      expect(wick.max.y - base).toBeLessThan(FLAME.base + 0.4 * FLAME.height);
      expect((FLAME_TOP - CANDLE.height) / 0.005).toBeCloseTo(14, 6);
    }
  });
});

describe('Birthday runtime GLB matches the contract', async () => {
  const doc = await createIO().read(join(import.meta.dirname, '..', 'assets', 'scenes', 'birthday', 'birthday.glb'));
  const node = (name: string) => findNode(doc, name);
  const worldOf = (n: Node) => new Matrix4().fromArray(n.getWorldMatrix());
  const names = doc.getRoot().listNodes().map((n) => n.getName());

  it('has every contract node exactly once, and none of the master\'s shared wick or flame meshes', () => {
    for (const n of BIRTHDAY_GLB_NODES) expect(names.filter((x) => x === n), n).toHaveLength(1);
    expect(recipe.contract).toBe(BIRTHDAY_GLB_NODES);
    for (const n of ['candle_wicks', 'candle_flames', 'cake_stand']) expect(names).not.toContain(n);
    for (const m of doc.getRoot().listMaterials()) expect(['candle_wick', 'candle_flame']).not.toContain(m.getName());
  });

  it('the stand is the master at CAKE_SCALE, its foot on the floor at the origin', () => {
    const tray = node('tray');
    expect(tray.getMesh()).toBeNull();
    expect(tray.getScale()).toEqual([1, 1, 1]);
    expect(new Vector3(...tray.getTranslation()).length()).toBeLessThan(1e-4);
    const b = boxIn(tray, node('birthday_root'));
    expect(Math.abs(b.min.y)).toBeLessThan(2e-4);
    expect(Math.abs(b.max.y - STAND.top)).toBeLessThan(2e-4);
    expect(Math.abs(b.max.x - STAND.radius)).toBeLessThan(1e-3);
    expect(Math.abs(b.min.z + STAND.radius)).toBeLessThan(1e-3);
  });

  it('the tiers and piping sit on cake_secondary: underside at its origin, widest at CAKE_RADIUS', () => {
    const cs = node('cake_secondary');
    expect(new Vector3(...node('cake_authored').getTranslation()).distanceTo(new Vector3(0, STAND_TOP, 0))).toBeLessThan(1e-6);
    const frosting = cs.listChildren().filter((c) => c.getName().startsWith('frosting_'));
    expect(frosting.map((c) => c.getName()).sort()).toEqual(['frosting_cake_buttercream', 'frosting_cake_pearl', 'frosting_cake_piping', 'frosting_cake_rosette']);
    let minY = Infinity, maxR = 0, maxY = -Infinity;
    const toCs = worldOf(cs).invert();
    for (const f of frosting) {
      f.traverse((c) => {
        const m = toCs.clone().multiply(worldOf(c));
        for (const prim of c.getMesh()?.listPrimitives() ?? []) {
          const pos = prim.getAttribute('POSITION')!;
          const e = [0, 0, 0];
          for (let i = 0; i < pos.getCount(); i++) {
            const v = new Vector3(...(pos.getElement(i, e) as [number, number, number])).applyMatrix4(m);
            minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); maxR = Math.max(maxR, Math.hypot(v.x, v.z));
          }
        }
      });
      expect((f.getExtras() as { noShadowCast?: boolean }).noShadowCast, f.getName()).toBe(true);
    }
    expect(Math.abs(minY)).toBeLessThan(3e-4);
    expect(Math.abs(maxR - CAKE_RADIUS)).toBeLessThan(1e-3);
    expect(Math.abs(maxY - (MASTER.cakeTop - MASTER.cakeBottom) * CAKE_SCALE)).toBeLessThan(2e-3);
  });

  it('each master candle stands on its socket: candle_NN_wax at the candle_NN origin, base to tip CANDLE.height', () => {
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const id = String(i + 1).padStart(2, '0');
      const candle = node(`candle_${id}`), wax = node(`candle_${id}_wax`);
      expect(wax.getParentNode()).toBe(candle);
      expect(wax.getMesh()).toBeNull();
      expect(new Vector3(...wax.getTranslation()).length(), id).toBeLessThan(3e-4);
      const b = boxIn(wax, candle);
      expect(Math.abs(b.min.y)).toBeLessThan(3e-4);
      expect(Math.abs(b.max.y - CANDLE.height)).toBeLessThan(5e-4);
      expect(Math.abs((b.max.x + b.min.x) / 2)).toBeLessThan(5e-4);
      expect(Math.abs((b.max.z + b.min.z) / 2)).toBeLessThan(5e-4);
      expect(Math.abs((b.max.x - b.min.x) / 2 - CANDLE.radius)).toBeLessThan(2e-3);
      // The seated candle beds CANDLE.insert into the top tier.
      expect(new Vector3(...candle.getTranslation()).y + CANDLE.insert).toBeCloseTo((MASTER.tierTop - MASTER.cakeBottom) * CAKE_SCALE, 6);
    }
  });

  it('shadow proxies cast for the stand, the cake (under cake_secondary) and each candle (under candle_NN)', () => {
    expect(node('cake_shadow_proxy').getParentNode()).toBe(node('cake_secondary'));
    expect(node('tray_shadow_proxy').getParentNode()).toBe(node('birthday_root'));
    for (const n of ['cake_shadow_proxy', 'tray_shadow_proxy']) expect((node(n).getExtras() as { shadowProxy?: boolean }).shadowProxy).toBe(true);
    expect((node('tray_mesh').getExtras() as { noShadowCast?: boolean }).noShadowCast).toBe(true);
    // Each candle casts through a map-free proxy that lowers with it (the wax's LUT map must not
    // reach three's shared shadow depth material, which outlives the scene).
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const id = String(i + 1).padStart(2, '0');
      const proxy = node(`candle_${id}_shadow_proxy`);
      expect(proxy.getParentNode()).toBe(node(`candle_${id}`));
      expect((proxy.getExtras() as { shadowProxy?: boolean }).shadowProxy).toBe(true);
      expect((node(`candle_${id}_wax_mesh`).getExtras() as { noShadowCast?: boolean }).noShadowCast).toBe(true);
      const b = boxIn(proxy, node(`candle_${id}`));
      expect(Math.abs(b.max.y - CANDLE.height)).toBeLessThan(0.01);
      expect(b.min.y).toBeLessThan(0.01);
    }
  });

  it('carries vanilla (default) and cocoa frostings as material variants; stand and candles keep the master colours', () => {
    const variants = doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === 'KHR_materials_variants') as KHRMaterialsVariants | undefined;
    expect(variants?.listVariants().map((v) => v.getName())).toEqual(['vanilla', 'cocoa']);
    const mat = (n: string) => doc.getRoot().listMaterials().find((m) => m.getName() === n)!;
    const lin = (hex: string) => new Color(hex).toArray();
    for (const [key, name] of [['body', 'cake_buttercream'], ['piping', 'cake_piping'], ['rosette', 'cake_rosette'], ['pearl', 'cake_pearl']] as const) {
      const v = mat(name).getBaseColorFactor(), c = mat(`${name}_cocoa`).getBaseColorFactor();
      lin(PALETTE.vanilla[key]).forEach((x, i) => expect(v[i]!).toBeCloseTo(x, 4));
      lin(PALETTE.cocoa[key]).forEach((x, i) => expect(c[i]!).toBeCloseTo(x, 4));
    }
    // The master's glazed stand (#A2B2BC) and white candle wax under their stripe LUTs.
    expect(new Color().fromArray(mat('cake_stand_ceramic').getBaseColorFactor()).getHexString()).toBe('a2b2bc');
    for (const n of ['cake_candle_pink', 'cake_candle_blue']) expect(mat(n).getBaseColorTexture()?.getSize()).toEqual([256, 4]);
  });

  it('the default (\'vanilla\' key) is the owner’s blue theme; buttercream, not plastic (v1.5): no clearcoat, a generated relief, roughness 0.40 (satin crests) – 0.66 (matte troughs)', async () => {
    // v1.2.1 darkened the body to #E0D3BF at roughness 0.58 for the v1.1 peach stage; removed in v1.3.
    expect(PALETTE.vanilla).toMatchObject({ body: '#B0CBFF', piping: '#FFFDFA', rosette: '#88B0F7' });
    const mat = (n: string) => doc.getRoot().listMaterials().find((m) => m.getName() === n)!;
    for (const n of ['cake_buttercream', 'cake_piping', 'cake_rosette']) {
      expect(mat(n).getExtension('KHR_materials_clearcoat'), n).toBeNull();
      expect(mat(`${n}_cocoa`).getExtension('KHR_materials_clearcoat'), `${n}_cocoa`).toBeNull();
    }
    // Sugar pearls stay glossy candy.
    expect(mat('cake_pearl').getExtension('KHR_materials_clearcoat')).not.toBeNull();
    // The body's relief and roughness come from generated maps, shared by both presets.
    const body = mat('cake_buttercream'), cocoa = mat('cake_buttercream_cocoa');
    expect(body.getNormalTexture()?.getSize()).toEqual([2048, 2048]);
    expect(cocoa.getNormalTexture()).toBe(body.getNormalTexture());
    expect(cocoa.getMetallicRoughnessTexture()).toBe(body.getMetallicRoughnessTexture());
    expect(body.getRoughnessFactor()).toBe(1);
    expect(body.getMetallicFactor()).toBe(0);
    const { data, info } = await loadSharp()(body.getMetallicRoughnessTexture()!.getImage()!).raw().toBuffer({ resolveWithObject: true });
    let lo = 1, hi = 0, sum = 0, n = 0;
    for (let i = 0; i < data.length; i += info.channels * 7) {
      const r = data[i + 1]! / 255;
      lo = Math.min(lo, r); hi = Math.max(hi, r); sum += r; n++;
    }
    // v1.5 polish: satin on the crests (≈ 0.40, a broad visible highlight), matte in the troughs.
    expect(lo).toBeGreaterThanOrEqual(0.39);
    expect(lo).toBeLessThanOrEqual(0.42);
    expect(hi).toBeLessThanOrEqual(0.67);
    expect(hi - lo).toBeGreaterThan(0.2);
    expect(sum / n).toBeGreaterThan(0.49);
    expect(sum / n).toBeLessThan(0.55);
    // A faint albedo finish (scraped lows and pockets a shade deeper), averaging the palette colour.
    const finish = await loadSharp()(body.getBaseColorTexture()!.getImage()!).raw().toBuffer({ resolveWithObject: true });
    let fs = 0, fmin = 1, fn = 0;
    for (let i = 0; i < finish.data.length; i += finish.info.channels * 7) { const v = finish.data[i]! / 255; fs += v; fmin = Math.min(fmin, v); fn++; }
    expect(fs / fn).toBeGreaterThan(0.98);
    expect(fmin).toBeGreaterThan(0.93);
    expect(cocoa.getBaseColorTexture()).toBe(body.getBaseColorTexture());
    // A very slight sheen on the piping and rosettes, and the convexity the runtime reads.
    for (const n of ['cake_piping', 'cake_rosette']) {
      const sheen = mat(n).getExtension('KHR_materials_sheen') as unknown as { getSheenColorFactor(): number[] } | null;
      expect(Math.max(...sheen!.getSheenColorFactor())).toBeLessThanOrEqual(0.15);
    }
    for (const name of ['frosting_cake_piping', 'frosting_cake_rosette']) {
      const ridge = node(name).getMesh()!.listPrimitives()[0]!.getAttribute('_RIDGE');
      expect(ridge, name).not.toBeNull();
      const a = ridge!.getArray()!;
      let lo = Infinity, hi = -Infinity;
      for (const v of a) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      expect(lo).toBeLessThan(-0.3);
      expect(hi).toBeGreaterThan(0.3);
    }
    expect(mat('cake_buttercream').getExtras()).toMatchObject({ frosting: 'body' });
  });

  it('the finished tiers are not perfect cylinders: the top tier 2–3 mm off centre, its side 1–2 % out of round at low frequency, the top uneven by under a millimetre', () => {
    const body = node('frosting_cake_buttercream');
    const toCs = worldOf(node('cake_secondary')).invert().multiply(worldOf(body));
    const pos = body.getMesh()!.listPrimitives()[0]!.getAttribute('POSITION')!;
    const e = [0, 0, 0];
    // Radius of the top tier's side at mid-height, by angle (72 bins); the top surface near the sockets.
    const yMid = ((0.4 - MASTER.cakeBottom) * CAKE_SCALE), R = 0.43 * CAKE_SCALE;
    const bins = new Array<number>(72).fill(0), counts = new Array<number>(72).fill(0);
    const top = (MASTER.tierTop - MASTER.cakeBottom) * CAKE_SCALE;
    const socketY: number[][] = CANDLE_SOCKETS.map(() => []);
    for (let i = 0; i < pos.getCount(); i++) {
      const v = new Vector3(...(pos.getElement(i, e) as [number, number, number])).applyMatrix4(toCs);
      const r = Math.hypot(v.x, v.z);
      if (Math.abs(v.y - yMid) < 0.02 && Math.abs(r - R) < 0.03) {
        const b = Math.floor(((Math.atan2(v.z, v.x) + Math.PI) / (2 * Math.PI)) * 72) % 72;
        bins[b]! += r; counts[b]!++;
      }
      CANDLE_SOCKETS.forEach(([sx, sz], k) => { if (Math.hypot(v.x - sx, v.z - sz) < 0.03 && Math.abs(v.y - top) < 0.01) socketY[k]!.push(v.y); });
    }
    const radii = bins.map((b, k) => b / counts[k]!);
    const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
    // v1.5 polish: the tier is stacked by hand, 2–3 mm off the lower tier's centre (the m = 1
    // term, read on the silhouette); with that taken out, the scraped side is 1–2 % out of round.
    const ang = (k: number) => ((k + 0.5) / 72) * 2 * Math.PI - Math.PI;
    const c1 = (2 / 72) * radii.reduce((a, r, k) => a + r * Math.cos(ang(k)), 0);
    const s1 = (2 / 72) * radii.reduce((a, r, k) => a + r * Math.sin(ang(k)), 0);
    const offCentreMm = Math.hypot(c1, s1) / 0.005;
    expect(offCentreMm).toBeGreaterThan(1.8);
    expect(offCentreMm).toBeLessThan(3.2);
    const drift = Math.max(...radii.map((r, k) => Math.abs((r - c1 * Math.cos(ang(k)) - s1 * Math.sin(ang(k))) / mean - 1)));
    expect(drift).toBeGreaterThan(0.008);
    expect(drift).toBeLessThan(0.02);
    // Low frequency: neighbouring 5° bins differ by far less than the drift.
    for (let k = 0; k < 72; k++) expect(Math.abs(radii[k]! - radii[(k + 1) % 72]!) / mean).toBeLessThan(0.004);
    // The candles stand on a top within ±1 mm of the master's.
    for (const ys of socketY) {
      expect(ys.length).toBeGreaterThan(50);
      const y = ys.reduce((a, b) => a + b, 0) / ys.length;
      expect(Math.abs(y - top)).toBeLessThan(0.005);
    }
  });

  it('the candles are re-tessellated from the master (fine enough to melt) and carry their melt profile', () => {
    const holder = node('candle_01_wax_mesh');
    const prim = holder.getMesh()!.listPrimitives()[0]!;
    expect(prim.getAttribute('POSITION')!.getCount()).toBeGreaterThan(10_000);
    const profile = prim.getAttribute('_PROFILE')!.getArray()!;
    expect(Math.max(...profile)).toBeCloseTo(3, 6);
    expect(Math.min(...profile)).toBe(-1);
  });

  it('the stand, hovering candles, the carried cake and the open bin stay inside the motion bounds and frame points', () => {
    const bounds = birthdayBounds().expandByScalar(1e-6);
    const lib = plainLibrary();
    const bin = buildDisposalBin({ lib });
    bin.position.copy(BIN_POS);
    bin.rotation.y = BIN_YAW;
    bin.getObjectByName('bin_flap_l')!.rotation.z = BIN.flapOpen;
    bin.getObjectByName('bin_flap_r')!.rotation.z = -BIN.flapOpen;
    expect(bounds.containsBox(box(bin))).toBe(true);
    const cakeTop = STAND_TOP + boxIn(node('cake_secondary'), node('cake_secondary')).max.y;
    expect(cakeTop).toBeLessThan(bounds.max.y);
    expect(STAND_TOP + CANDLE.seat + CANDLE_HOVER + FLAME_TOP).toBeLessThanOrEqual(bounds.max.y);
    const pts = new Box3().setFromPoints(birthdayFramePoints());
    expect(pts.max.y).toBeGreaterThanOrEqual(STAND_TOP + CANDLE.seat + CANDLE_HOVER + CANDLE.height - 1e-9);
  });
});
