import { describe, expect, it } from 'vitest';
import { BALL_MASS_KG, RECOIL_LIMIT, RIM_BACKSTOP, SPORTS_CM_PER_UNIT, STAND_PIVOT } from '../models/sportsContract.ts';
import { HOOP_SPRINGS, HoopSprings } from '../models/sportsNet.ts';

/** The stops in radians, computed as `HoopSprings.step` clamps to them. */
const RIM_LIMIT = (RECOIL_LIMIT.rimDeg * Math.PI) / 180, BOARD_LIMIT = (RECOIL_LIMIT.boardDeg * Math.PI) / 180;
const DT = 1 / 120;

/** Step the springs with no net pull (as the scene does once the net is still), recording the extremes. */
function ringDown(s: HoopSprings, seconds = 4) {
  let rimMax = -Infinity, rimMin = Infinity, boardMax = 0, settledAt = Infinity;
  for (let t = DT; t <= seconds + 1e-9; t += DT) {
    s.step(DT, 0, 0);
    rimMax = Math.max(rimMax, s.rim);
    rimMin = Math.min(rimMin, s.rim);
    boardMax = Math.max(boardMax, Math.abs(s.board));
    if (s.settled && settledAt === Infinity) settledAt = t;
  }
  return { rimMax, rimMin, boardMax, settledAt };
}

/** Undamped natural frequency (rad/s) of a spring in HOOP_SPRINGS. */
const omega = (p: { inertia: number; stiffness: number }) => Math.sqrt(p.stiffness / p.inertia);
/** First swing of a damped spring struck from rest with Δω: (Δω/ω)·e^(−ζφ/√(1−ζ²)), φ = atan(√(1−ζ²)/ζ). */
const firstPeak = (dw: number, p: { inertia: number; stiffness: number; zeta: number }) => {
  const r = Math.sqrt(1 - p.zeta * p.zeta);
  return (dw / omega(p)) * Math.exp((-p.zeta * Math.atan(r / p.zeta)) / r);
};

describe('Hoop springs: the ball\'s strike (HoopSprings.kick)', () => {
  it('BALL_MASS_KG is a 7" rubber mini (size 3) basketball\'s: 0.28–0.32 kg', () => {
    expect(BALL_MASS_KG).toBeGreaterThan(0.28);
    expect(BALL_MASS_KG).toBeLessThan(0.32);
  });

  it('a kick wakes the springs and swings the rim and the board by Δω over their frequency; both ring down and settle at rest', () => {
    const s = new HoopSprings();
    const dRim = 0.5, dBoard = 0.05;
    s.kick(dRim, dBoard);
    expect(s.settled).toBe(false);
    s.step(DT, 0, 0);
    // Positive tips the fronts down.
    expect(s.rim).toBeGreaterThan(0);
    expect(s.board).toBeGreaterThan(0);
    const r = ringDown(s);
    // The first swing is the impulse's: Δω / ω, less the damping over its first quarter period
    // (v1.7: the rim's ζ 0.4 takes it to 0.60 of that; sampled at the frames, within 10 %).
    for (const [peak, dw, p] of [[r.rimMax, dRim, HOOP_SPRINGS.rim], [r.boardMax, dBoard, HOOP_SPRINGS.board]] as const) {
      expect(peak).toBeGreaterThan(0.9 * firstPeak(dw, p));
      expect(peak).toBeLessThan(1.02 * firstPeak(dw, p));
    }
    // The rim's 7 Hz ring is damped (ζ 0.4; v1.5 0.15 rang for half a second): under 5 % of its
    // first swing from a fifth of a second on.
    const ring = new HoopSprings();
    ring.kick(dRim, 0);
    let late = 0;
    for (let t = DT; t <= 1 + 1e-9; t += DT) {
      ring.step(DT, 0, 0);
      if (t >= 0.2) late = Math.max(late, Math.abs(ring.rim));
    }
    expect(late).toBeLessThan(0.05 * r.rimMax);
    // A strike this size stays well inside the stops and rings out within a couple of seconds.
    expect(r.rimMax).toBeLessThan(RIM_LIMIT);
    expect(r.rimMin).toBeGreaterThanOrEqual(RIM_BACKSTOP);
    expect(r.settledAt).toBeLessThan(2.5);
    expect(s.settled).toBe(true);
    expect([s.rim, s.board]).toEqual([0, 0]);
    expect(s.save()).toEqual([0, 0, 0, 0, true]);
  });

  it('a hard strike either way never takes the rim past its travel or its back stop, nor the board past its play; they still settle', () => {
    for (const [dRim, dBoard] of [[5, 2], [-5, -2], [20, -20]] as const) {
      const s = new HoopSprings();
      s.kick(dRim, dBoard);
      let rimMax = -Infinity, rimMin = Infinity, boardMax = 0;
      // Fine steps: a part held on a stop leaves it within the frame it reached it (the damping pulls it back).
      for (let t = 0; t < 5; t += DT / 8) {
        s.step(DT / 8, 0, 0);
        rimMax = Math.max(rimMax, s.rim);
        rimMin = Math.min(rimMin, s.rim);
        boardMax = Math.max(boardMax, Math.abs(s.board));
      }
      const label = `kick(${dRim}, ${dBoard})`;
      expect(rimMax, label).toBeLessThanOrEqual(RIM_LIMIT);
      expect(rimMin, label).toBeGreaterThanOrEqual(RIM_BACKSTOP);
      expect(boardMax, label).toBeLessThanOrEqual(BOARD_LIMIT);
      // The stops were reached (these strikes are past them), and the springs came back to rest.
      if (dRim > 0) expect(rimMax, label).toBe(RIM_LIMIT);
      else expect(rimMin, label).toBe(RIM_BACKSTOP);
      expect(boardMax, label).toBe(BOARD_LIMIT);
      expect(s.settled, label).toBe(true);
    }
  });

  it('a part on its stop takes no velocity into it; a zero kick leaves resting springs asleep', () => {
    const s = new HoopSprings();
    s.kick(0, 0);
    expect(s.settled).toBe(true);
    s.restore([RIM_LIMIT, BOARD_LIMIT, 0, 0, false]);
    s.kick(1, 1);
    expect(s.save()).toEqual([RIM_LIMIT, BOARD_LIMIT, 0, 0, false]);
    // Away from the stops it does move them.
    s.kick(-1, -1);
    expect(s.save().slice(2, 4)).toEqual([-1, -1]);
    // On the back stop the rim rebounds off the board face as `step` has it.
    s.restore([RIM_BACKSTOP, 0, 0, 0, false]);
    s.kick(-1, 0);
    expect(s.save()[2]).toBeCloseTo(0.3, 12);
  });
});

describe('v1.7 polish: the stand sways (HoopSprings.stand)', () => {
  const SL = (RECOIL_LIMIT.standDeg * Math.PI) / 180;
  const sway = HOOP_SPRINGS.stand;

  it('is a portable pole\'s mode: ≈ 3 Hz about the pole\'s foot, low damping, its inertia the parts\' Σ m·r²', () => {
    expect(omega(sway) / (2 * Math.PI)).toBeCloseTo(3, 6);
    expect(sway.frequency).toBe(3);
    expect(sway.zeta).toBeGreaterThanOrEqual(0.05);
    expect(sway.zeta).toBeLessThanOrEqual(0.15);
    // Board 3 kg, rim 0.9 kg, arms and plates 1.5 kg at 1.3–1.4 m from the foot, and the pole: 10–13 kg·m².
    expect(sway.inertia).toBeGreaterThan(10);
    expect(sway.inertia).toBeLessThan(13);
    expect(STAND_PIVOT.y * SPORTS_CM_PER_UNIT).toBeCloseTo(13, 6);
  });

  it('a strike sways it by Δω/ω at its frequency, then it rings down and settles, alone (the rim and the board untouched)', () => {
    const s = new HoopSprings();
    const dw = -0.07;
    s.kick(0, 0, dw);
    expect(s.settled).toBe(false);
    expect(s.save()).toHaveLength(7);
    let peak = 0, settledAt = Infinity, last = 0;
    const crossings: number[] = [];
    let lastBig = 0;
    for (let t = DT; t <= 8 + 1e-9; t += DT) {
      s.step(DT, 0, 0);
      expect(s.rim).toBe(0);
      expect(s.board).toBe(0);
      peak = Math.max(peak, Math.abs(s.stand));
      if (last < 0 && s.stand >= 0) crossings.push(t);
      last = s.stand;
      // 1 mm at the board's top (1.65 m from the foot).
      if (Math.abs(s.stand) * 1.65 > 0.001) lastBig = t;
      if (s.settled && settledAt === Infinity) settledAt = t;
    }
    // Amplitude per impulse: the damped first swing (sampled at 120 Hz, within 10 %).
    expect(peak).toBeGreaterThan(0.9 * firstPeak(Math.abs(dw), sway));
    expect(peak).toBeLessThan(1.02 * firstPeak(Math.abs(dw), sway));
    // ≈ 0.2° (6 mm at the board's top) for the glass's strike.
    expect((peak * 180) / Math.PI).toBeGreaterThan(0.15);
    expect((peak * 180) / Math.PI).toBeLessThan(0.3);
    // The damped frequency from its upward zero crossings: 3 Hz × √(1 − ζ²).
    const period = (crossings.at(-1)! - crossings[0]!) / (crossings.length - 1);
    expect(1 / period).toBeCloseTo(3 * Math.sqrt(1 - sway.zeta ** 2), 1);
    // A shiver, not a wobble: under 1 mm at the board's top within 1.5 s, and settled (exactly at rest) within 5 s.
    expect(lastBig).toBeLessThan(1.5);
    expect(settledAt).toBeLessThan(5);
    expect(s.save()).toEqual([0, 0, 0, 0, true]);
  });

  it('never sways past its guard, either way, and still settles; on the guard it takes no velocity into it', () => {
    for (const dw of [2, -2]) {
      const s = new HoopSprings();
      s.kick(0, 0, dw);
      let max = 0;
      for (let t = 0; t < 8; t += DT / 8) {
        s.step(DT / 8, 0, 0);
        max = Math.max(max, Math.abs(s.stand));
      }
      expect(max, `${dw}`).toBe(SL);
      expect(s.settled, `${dw}`).toBe(true);
    }
    const s = new HoopSprings();
    s.restore([0, 0, 0, 0, false, SL, 0]);
    s.kick(0, 0, 1);
    expect(s.save()).toEqual([0, 0, 0, 0, false, SL, 0]);
    s.kick(0, 0, -1);
    expect(s.save()[6]).toBe(-1);
  });

  it('save/restore carries the sway exactly (a change of mind never pops it); a resting hoop saves as before', () => {
    const a = new HoopSprings(), b = new HoopSprings();
    a.kick(0.5, -0.05, -0.07);
    b.kick(0.5, -0.05, -0.07);
    for (let i = 0; i < 30; i++) { a.step(DT, 0, 0); b.step(DT, 0, 0); }
    const state = a.save();
    a.settle();
    expect(a.save()).toEqual([0, 0, 0, 0, true]);
    a.restore(state);
    for (let i = 0; i < 60; i++) { a.step(DT, 0, 0); b.step(DT, 0, 0); }
    expect(a.save()).toEqual(b.save());
    expect(a.stand).not.toBe(0);
  });

  it('keeps a resting net awake only while it sways faster than the net settles (no flapping)', () => {
    const s = new HoopSprings();
    s.kick(0, 0, -0.07);
    expect(s.active()).toBe(true);
    let wasActive = true, reactivated = false;
    for (let t = DT; t <= 4; t += DT) {
      s.step(DT, 0, 0);
      const now = s.active();
      if (now && !wasActive) reactivated = true;
      wasActive = now;
    }
    expect(reactivated).toBe(false);
    expect(s.active()).toBe(false);
  });
});
