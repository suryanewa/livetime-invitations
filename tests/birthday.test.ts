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
  BIN_POS, BIN_YAW, birthdayBounds, CAKE_RADIUS, CAKE_SCALE, CAKE_TOTAL_HEIGHT, CANDLE, CANDLE_COUNT, CANDLE_SOCKETS, FLAME, FLAME_DRAW, FLAME_TOP, LEAN_MAX, MASTER,
  RIM_CLEARANCE, screenX, STAND, STAND_TOP,
} from '../models/birthdayContract.ts';
import { BIRTHDAY_GLB_NODES, buildBirthdayGeometry, FLAME_SIZE } from '../models/birthdayParts.ts';
import { BIN, buildDisposalBin } from '../models/disposalBin.ts';
import { BIN_SHADE } from '../models/birthday.ts';
import {
  CAKE_LOAD, CANDLE_CONTACT_SPEED, CANDLE_DESCENT, CANDLE_HOVER, CANDLE_LEAN, CANDLE_PRESS, CANDLE_SEATED, CANDLE_START, CARRY_FROM, DURATIONS, FLAME_FLUTTER, FLAME_RISE, FLAME_START, LEAN,
  LEAN_FADE, LIFT_TO, OUT_LEN, OUT_START, WISP_OPACITY,
} from '../src/scenes/birthday/poses.ts';
import {
  ACCEPTED_LIT, cakeLoad, candleDrop, carryLean, DECLINED_LIT, flameScaleOf, frameFor, GUEST_READY_LIT, LEAN_AXIS, litTime, newFrame, pressOf, sampleSequence, type BirthdayFrame,
} from '../src/scenes/birthday/sequences.ts';
import { candleShortening, MELT_CANDLE, MELT_CAP, MELT_TIME_SCALE, meltAmount, meltState } from '../src/scenes/birthday/melt.ts';
import { birthdayFramePoints } from '../src/scenes/birthday/framing.ts';
import type { CanonicalPose, SequenceName } from '../src/core/types.ts';

const at = (seq: SequenceName, t: number) => sampleSequence(seq, t, newFrame());
const pose = (p: CanonicalPose) => frameFor(p, newFrame());
const ARRAYS = ['drop', 'press', 'lean', 'litTime', 'flameScale', 'flameOpacity', 'flameLean', 'flameStretch', 'wispOpacity', 'wispRise', 'wispGrow'] as const;
const SCALARS = ['cakeYaw', 'cakeLean', 'cakeDip', 'cakeTiltX', 'cakeTiltZ', 'wickLean', 'flaps'] as const;
const DEG = Math.PI / 180;

function close(a: BirthdayFrame, b: BirthdayFrame, eps = 1e-6) {
  expect(a.cakePos.distanceTo(b.cakePos)).toBeLessThan(eps);
  expect(a.binPos.distanceTo(b.binPos)).toBeLessThan(eps);
  for (const k of SCALARS) expect(Math.abs(a[k] - b[k]), k).toBeLessThan(eps);
  for (const k of ARRAYS) {
    expect(a[k].length).toBe(CANDLE_COUNT);
    for (let i = 0; i < CANDLE_COUNT; i++) expect(Math.abs(a[k][i]! - b[k][i]!), `${k}[${i}]`).toBeLessThan(eps);
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
  const out = [f.cakePos.x, f.cakePos.y, f.cakePos.z, f.binPos.x, f.binPos.y, f.binPos.z, f.cakeYaw, f.cakeLean, f.cakeDip, f.cakeTiltX, f.cakeTiltZ, f.wickLean, f.flaps];
  for (const k of ARRAYS) out.push(...f[k]);
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
          expect(Math.abs(cur.flameOpacity[k]! - prev.flameOpacity[k]!)).toBeLessThan(0.05);
        }
        expect(Math.abs(cur.flaps - prev.flaps)).toBeLessThan(0.03);
        if (seq !== 'decline' || i > 1) expect(cur.binPos.distanceTo(prev.binPos)).toBeLessThan(0.05);
        prev = cur;
      }
    }
  });

  it('is C1: no velocity jumps anywhere (second differences at 0.1 ms stay at acceleration scale)', () => {
    // A velocity jump Δv shows as a second difference ≈ Δv·h; smooth motion gives a·h². With
    // h = 0.1 ms, 1e-5 allows accelerations up to 1000 units/s² (a flame's 0.12 s rise peaks at
    // 420/s²) and catches any velocity jump over 0.1 units/s. Exempt: a flame's scale, lean and a
    // wisp's rise while they are invisible (opacity 0), and the first step of decline, where the
    // bin appears (a visibility switch, not motion).
    const h = 0.0001;
    for (const seq of ['host', 'accept', 'decline'] as const) {
      for (let i = 1; i < DURATIONS[seq] / h - 0.5; i++) {
        if (seq === 'decline' && i < 2) continue;
        const a = at(seq, (i - 1) * h), b = at(seq, i * h), c = at(seq, (i + 1) * h);
        const ca = channels(a), cb = channels(b), cc = channels(c);
        const names = ['cake.x', 'cake.y', 'cake.z', 'bin.x', 'bin.y', 'bin.z', 'cakeYaw', 'cakeLean', 'cakeDip', 'cakeTiltX', 'cakeTiltZ', 'wickLean', 'flaps', ...ARRAYS.flatMap((k) => Array.from({ length: CANDLE_COUNT }, (_, j) => `${k}[${j}]`))];
        for (let k = 0; k < cb.length; k++) {
          const name = names[k]!;
          const m = /^(flameScale|flameLean|flameStretch|flameOpacity)\[(\d)\]$/.exec(name);
          if (m && Math.min(a.flameOpacity[+m[2]!]!, c.flameOpacity[+m[2]!]!) < 1e-9) continue;
          const w = /^(?:wispRise|wispGrow)\[(\d)\]$/.exec(name);
          if (w && Math.min(a.wispOpacity[+w[1]!]!, c.wispOpacity[+w[1]!]!) < 1e-9) continue;
          // Contact: the buttercream starts moving with the candle the instant it is touched (the
          // candle itself is C1 through it; its push-in progress starts at the candle's speed).
          const p = /^press\[(\d)\]$/.exec(name);
          if (p && Math.abs(i * h - (CANDLE_START[+p[1]!]! + CANDLE_DESCENT)) < 2 * h) continue;
          const d2 = Math.abs(ca[k]! - 2 * cb[k]! + cc[k]!);
          // Positions: the bin's 2.8-unit slide-in peaks near 1100 units/s²; allow 3000 (jumps > 0.3 units/s).
          if (d2 >= (k < 6 ? 3e-5 : 1e-5)) throw new Error(`${seq} ${name} at ${(i * h * 1000).toFixed(1)} ms: second difference ${d2.toExponential(2)}`);
        }
      }
    }
  });

  it('six candles lower 55 ms apart, meet the buttercream at a careful speed and are pushed in, slowing, to the seat', () => {
    expect(CANDLE_START).toHaveLength(6);
    for (let i = 1; i < CANDLE_COUNT; i++) expect(CANDLE_START[i]! - CANDLE_START[i - 1]!).toBeCloseTo(0.055, 9);
    for (let i = 0; i < CANDLE_COUNT; i++) {
      expect(at('host', CANDLE_START[i]! - 0.001).drop[i]).toBe(CANDLE_HOVER);
      expect(at('host', CANDLE_START[i]! + 0.05).drop[i]).toBeLessThan(CANDLE_HOVER);
      expect(at('host', CANDLE_SEATED[i]!).drop[i]).toBe(0);
      expect(CANDLE_SEATED[i]).toBeLessThan(FLAME_START[i]!);
    }
    // Monotone all the way down, never below the seat (buttercream is plastic: no rebound).
    let prev = Infinity;
    for (let us = 0; us <= 600_000; us += 250) {
      const d = candleDrop(us / 1e6);
      expect(d).toBeLessThanOrEqual(prev + 1e-12);
      expect(d).toBeGreaterThanOrEqual(0);
      prev = d;
    }
    // Contact: the base reaches the surface (CANDLE.insert above the seat) at CANDLE_CONTACT_SPEED.
    expect(candleDrop(CANDLE_DESCENT)).toBeCloseTo(CANDLE.insert, 9);
    const v = (t: number) => (candleDrop(t + 1e-6) - candleDrop(t - 1e-6)) / 2e-6;
    expect(v(CANDLE_DESCENT)).toBeCloseTo(-CANDLE_CONTACT_SPEED, 3);
    expect(CANDLE_CONTACT_SPEED).toBeLessThan(0.3); // ≤ 6 cm/s: placed, not dropped
    // Push-in: the candle slows all the way, harder the deeper it goes, and stops at the seat.
    let lastSpeed = Infinity, lastDecel = -Infinity;
    for (let k = 1; k < 40; k++) {
      const t = CANDLE_DESCENT + (k / 40) * CANDLE_PRESS;
      const speed = -v(t);
      const decel = (v(t + 1e-4) - v(t - 1e-4)) / 2e-4;
      expect(speed).toBeLessThan(lastSpeed);
      expect(decel).toBeGreaterThan(lastDecel - 1e-6);
      lastSpeed = speed;
      lastDecel = decel;
    }
    expect(Math.abs(v(CANDLE_DESCENT + CANDLE_PRESS - 1e-5))).toBeLessThan(1e-3);
    expect(CANDLE_PRESS).toBeGreaterThan(0.08);
    expect(CANDLE_PRESS).toBeLessThan(0.2);
  });

  it('the press: no collar before contact, a full collar once seated; each candle takes its own fixed lean (≤ 2°)', () => {
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const contact = CANDLE_START[i]! + CANDLE_DESCENT;
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

  it('the cake takes each push: a sub-millimetre dip and tilt that rings down to exactly 0 before guest-ready', () => {
    let dip = 0, tilt = 0;
    const load: [number, number, number] = [0, 0, 0];
    for (let ms = 0; ms <= DURATIONS.host * 1000; ms++) {
      cakeLoad(ms / 1000, load);
      dip = Math.min(dip, load[0]);
      tilt = Math.max(tilt, Math.hypot(load[1], load[2]));
      if (ms < (CANDLE_START[0]! + CANDLE_DESCENT) * 1000) expect(load).toEqual([0, 0, 0]);
    }
    expect(-dip).toBeGreaterThan(0.0005); // ≥ 0.1 mm: it gives
    expect(-dip).toBeLessThan(0.005); // < 1 mm
    expect(tilt).toBeLessThan(0.5 * DEG);
    expect(tilt * 0.62).toBeLessThan(0.005); // the rim moves < 1 mm
    expect(cakeLoad(1.25)).toEqual([0, 0, 0]);
    expect(CAKE_LOAD.hz).toBeGreaterThan(8);
  });

  it('lit time: 0 until a flame lights, grows with the flame, freezes once it is out; canonical totals', () => {
    for (let i = 0; i < CANDLE_COUNT; i++) {
      expect(litTime('host', i, FLAME_START[i]! - 0.001)).toBe(0);
      expect(at('host', DURATIONS.host).litTime[i]).toBeCloseTo(GUEST_READY_LIT[i]!, 9);
      // ≈ seconds at full flame since it lit (the rise counts half).
      expect(GUEST_READY_LIT[i]).toBeCloseTo(DURATIONS.host - FLAME_START[i]! - FLAME_RISE / 2, 3);
      const outAt = OUT_START[i]! + OUT_LEN;
      expect(litTime('accept', i, outAt + 0.05)).toBeCloseTo(litTime('accept', i, DURATIONS.accept), 9);
      expect(litTime('accept', i, outAt)).toBeGreaterThan(litTime('accept', i, OUT_START[i]!));
      expect(pose('accepted').litTime[i]).toBeCloseTo(ACCEPTED_LIT[i]!, 9);
      expect(pose('declined').litTime[i]).toBeCloseTo(DECLINED_LIT[i]!, 9);
      expect(pose('host-ready').litTime[i]).toBe(0);
      let prev = -1;
      for (let ms = 0; ms <= 1400; ms += 5) {
        const l = litTime('accept', i, ms / 1000);
        expect(l).toBeGreaterThanOrEqual(prev);
        prev = l;
      }
      expect(flameScaleOf('accept', i, outAt + 0.01)).toBe(0);
    }
  });
  it('flames appear only in 0.84–1.06 s as a restrained rise, never a flash', () => {
    const end = FLAME_START[CANDLE_COUNT - 1]! + FLAME_RISE;
    expect(end).toBeLessThanOrEqual(1.06 + 1e-9);
    let prev = Array.from({ length: CANDLE_COUNT }, () => 0);
    for (let i = 0; i <= 1300; i++) {
      const f = at('host', i / 1000);
      for (let k = 0; k < CANDLE_COUNT; k++) {
        const o = f.flameOpacity[k]!;
        if (i / 1000 < 0.84) expect(o).toBe(0);
        if (i / 1000 >= end) expect(o).toBe(1);
        expect(o).toBeGreaterThanOrEqual(prev[k]! - 1e-12);
        expect(f.flameScale[k]!).toBeLessThanOrEqual(1);
        prev[k] = o;
      }
    }
  });

  it('accept: flames go out left to right by 0.60 s; one faint wisp each, gone by 1.00 s; wicks at rest', () => {
    const outAt = Array.from({ length: CANDLE_COUNT }, (_, k) => {
      for (let i = 0; i <= 1400; i++) if (at('accept', i / 1000).flameOpacity[k] === 0) return i;
      return Infinity;
    });
    for (let k = 1; k < CANDLE_COUNT; k++) expect(outAt[k - 1]).toBeLessThan(outAt[k]!);
    expect(outAt[CANDLE_COUNT - 1]).toBeLessThanOrEqual(600);
    expect(OUT_START[CANDLE_COUNT - 1]! + OUT_LEN).toBeLessThanOrEqual(0.6);
    for (let i = 0; i <= 1400; i++) {
      const f = at('accept', i / 1000);
      for (let k = 0; k < CANDLE_COUNT; k++) {
        expect(f.wispOpacity[k]!).toBeLessThanOrEqual(WISP_OPACITY + 1e-9);
        if (i < 600 || i >= 1000) expect(f.wispOpacity[k]).toBe(0);
        // While it reads (over half its peak) the wisp's foot stays on the wick: no floating smoke.
        if (f.wispOpacity[k]! >= WISP_OPACITY / 2) expect(f.wispRise[k]!).toBeLessThan(0.03);
      }
    }
    expect(at('accept', 1.4).wickLean).toBe(0);
  });

  it('accept: the breath visibly bends and draws out every lit flame before it goes out', () => {
    // Full breath at 0.25 s: every flame leans (flutter within ±FLAME_FLUTTER) and is stretched.
    for (let ms = 250; ms <= 600; ms++) {
      const f = at('accept', ms / 1000);
      for (let k = 0; k < CANDLE_COUNT; k++) {
        if (f.flameOpacity[k]! <= 0) continue;
        expect(f.flameLean[k]!).toBeGreaterThan(1 - FLAME_FLUTTER.amount - 1e-9);
        expect(f.flameLean[k]!).toBeLessThan(1.5 * (1 + FLAME_FLUTTER.amount) + 1e-9);
        expect(f.flameStretch[k]!).toBeCloseTo(1, 9);
      }
    }
    // The lean reads in the picture plane: its sideways part is at least half its away part.
    expect(Math.abs(LEAN.z)).toBeGreaterThan(0.5 * Math.abs(LEAN.x));
    expect(Math.hypot(LEAN.x, LEAN.z)).toBeLessThan(0.6);
    expect(pose('accepted').flameStretch.every((v) => v === 0)).toBe(true);
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
    expect(at('decline', 1.2).flaps).toBeLessThan(0.05);
    expect(at('decline', 1.5).cakeVisible).toBe(false);
    expect(at('decline', 0.2).flameOpacity.every((o) => o === 0)).toBe(true);
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

  it('puts each candle on its master socket with a wick and a flame at the tip', () => {
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const id = String(i + 1).padStart(2, '0');
      const candle = root.getObjectByName(`candle_${id}`)!;
      expect(candle.position.x).toBeCloseTo(CANDLE_SOCKETS[i]![0], 9);
      expect(candle.position.z).toBeCloseTo(CANDLE_SOCKETS[i]![1], 9);
      expect(candle.position.y).toBeCloseTo(CANDLE.seat, 9);
      const flame = candle.getObjectByName(`flame_${id}`)!;
      expect(flame.position.y).toBeCloseTo(CANDLE.flameBase, 9);
      const fb = box(flame);
      const cb = box(candle);
      // The drawn flame: FLAME_DRAW × the master's (1.5 tall, 1.45 wide), lathe a quarter wider.
      expect(fb.max.y - fb.min.y).toBeCloseTo(FLAME.height, 3);
      expect(FLAME.height).toBeCloseTo(CANDLE.flameHeight * FLAME_DRAW.height, 9);
      expect(fb.max.x - fb.min.x).toBeLessThan(FLAME.radius * 2 * 1.4);
      expect(fb.max.x - fb.min.x).toBeGreaterThan(CANDLE.flameRadius * 2 * 1.4);
      const wick = box(candle.getObjectByName(`wick_${id}`)!);
      const base = STAND_TOP + CANDLE.seat;
      expect(wick.max.y - base).toBeGreaterThan(CANDLE.wickBase + CANDLE.wickHeight - 0.002);
      expect(wick.min.y - base).toBeLessThan(CANDLE.height);
      expect(wick.max.y).toBeLessThan(fb.min.y + CANDLE.flameHeight * 0.3);
      expect(cb.max.y).toBeCloseTo(fb.max.y, 9);
    }
    expect(FLAME_SIZE.height).toBeGreaterThan(0.9);
  });
});

/** The exported runtime GLB (pnpm models birthday), measured with gltf-transform. */
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
    expect(Math.abs(maxR - CAKE_RADIUS)).toBeLessThan(2e-3);
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

  it('the default (\'vanilla\' key) is the owner’s blue theme; buttercream, not plastic (v1.5): no clearcoat, a generated relief, roughness 0.45–0.70', async () => {
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
    expect(lo).toBeGreaterThanOrEqual(0.44);
    expect(hi).toBeLessThanOrEqual(0.71);
    expect(hi - lo).toBeGreaterThan(0.15);
    expect(sum / n).toBeGreaterThan(0.55);
    expect(sum / n).toBeLessThan(0.62);
    // A very slight sheen on the piping and rosettes, and the convexity the runtime reads.
    for (const n of ['cake_piping', 'cake_rosette']) {
      const sheen = mat(n).getExtension('KHR_materials_sheen') as unknown as { getSheenColorFactor(): number[] } | null;
      expect(Math.max(...sheen!.getSheenColorFactor())).toBeLessThanOrEqual(0.15);
    }
    for (const name of ['frosting_cake_piping', 'frosting_cake_rosette']) {
      const ridge = node(name).getMesh()!.listPrimitives()[0]!.getAttribute('_RIDGE');
      expect(ridge, name).not.toBeNull();
      const a = ridge!.getArray()!;
      expect(Math.min(...a)).toBeLessThan(-0.3);
      expect(Math.max(...a)).toBeGreaterThan(0.3);
    }
    expect(mat('cake_buttercream').getExtras()).toMatchObject({ frosting: 'body' });
  });

  it('the finished tiers are not perfect cylinders: radius drifts 1–2 % at low frequency, the top is uneven by under a millimetre', () => {
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
    const drift = Math.max(...radii.map((r) => Math.abs(r / mean - 1)));
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
