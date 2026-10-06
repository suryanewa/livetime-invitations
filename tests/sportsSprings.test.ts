import { describe, expect, it } from 'vitest';
import { BALL_MASS_KG, RECOIL_LIMIT, RIM_BACKSTOP } from '../models/sportsContract.ts';
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
    // The first swing is the impulse's: Δω / ω, less the damping over its first quarter period.
    for (const [peak, dw, p] of [[r.rimMax, dRim, HOOP_SPRINGS.rim], [r.boardMax, dBoard, HOOP_SPRINGS.board]] as const) {
      expect(peak).toBeGreaterThan(0.6 * (dw / omega(p)));
      expect(peak).toBeLessThan(dw / omega(p));
    }
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
      for (let t = 0; t < 5; t += DT) {
        s.step(DT, 0, 0);
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
