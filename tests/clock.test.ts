import { describe, expect, it } from 'vitest';
import { MAX_FRAME_DELTA, PlaybackClock } from '../src/core/clock.ts';
import { FIXED_STEP, FixedStepper, MAX_DEBT, MAX_STEPS_PER_FRAME, Spring, ANGLE_EPSILON } from '../src/motion/spring.ts';
import { resolveConfig } from '../src/core/config.ts';

describe('PlaybackClock', () => {
  it('samples elapsed active seconds and clamps long stalls', () => {
    let now = 0;
    const clock = new PlaybackClock(() => now);
    clock.tick();
    now = 16;
    expect(clock.tick()).toBeCloseTo(0.016);
    now = 2016;
    expect(clock.tick()).toBeCloseTo(MAX_FRAME_DELTA);
    expect(clock.seconds).toBeCloseTo(0.016 + MAX_FRAME_DELTA);
  });

  it('pauses while hidden and resumes without accumulated debt', () => {
    let now = 0;
    const clock = new PlaybackClock(() => now);
    clock.tick();
    now = 10;
    clock.tick();
    clock.pause();
    now = 60_000;
    expect(clock.tick()).toBe(0);
    clock.resume();
    now = 60_010;
    expect(clock.tick()).toBe(0);
    now = 60_026;
    expect(clock.tick()).toBeCloseTo(0.016);
    expect(clock.seconds).toBeCloseTo(0.026);
  });
});

describe('FixedStepper', () => {
  it('steps at 1/120 s, at most four steps per frame, and discards excess debt', () => {
    const stepper = new FixedStepper();
    let steps = 0;
    expect(stepper.advance(1 / 60, () => steps++)).toBe(2);
    steps = 0;
    const taken = stepper.advance(1, () => steps++);
    expect(taken).toBe(MAX_STEPS_PER_FRAME);
    // Debt was capped at MAX_DEBT and trimmed: the next tiny frame cannot run a burst.
    expect(stepper.advance(0, () => steps++)).toBeLessThanOrEqual(1);
    expect(MAX_DEBT).toBeCloseTo(1 / 30);
    expect(FIXED_STEP).toBeCloseTo(1 / 120);
  });

  it('is frame-rate invariant for a spring over the same simulated time', () => {
    const run = (fps: number) => {
      const s = new Spring({ frequency: 1, limit: 1, epsilon: ANGLE_EPSILON });
      s.kick(0.15);
      const stepper = new FixedStepper();
      for (let i = 0; i < fps * 0.5; i++) stepper.advance(1 / fps, (h) => s.step(h));
      return s.x;
    };
    expect(run(120)).toBeCloseTo(run(60), 6);
    expect(run(60)).toBeCloseTo(run(30), 6);
  });
});

describe('Spring', () => {
  it('clamps displacement and velocity so input cannot add unbounded energy', () => {
    const s = new Spring({ frequency: 1, limit: 0.2, epsilon: 0.001, maxVelocity: 1 });
    s.kick(10, 100);
    expect(s.x).toBe(0.2);
    expect(s.v).toBe(1);
  });

  it('settles to an exact canonical rest after holding below epsilon for 200 ms', () => {
    const s = new Spring({ frequency: 1.2, limit: 0.3, epsilon: ANGLE_EPSILON });
    s.kick(0.15);
    let t = 0;
    while (!s.settled && t < 10) {
      s.step(FIXED_STEP);
      t += FIXED_STEP;
    }
    expect(s.settled).toBe(true);
    expect(s.x).toBe(0);
    expect(s.v).toBe(0);
    expect(t).toBeLessThan(3);
  });
});

describe('resolveConfig', () => {
  it('resolves unknown presets to the documented default', () => {
    expect(resolveConfig({ category: 'birthday', cake: 'lemon' })).toEqual({ ok: true, config: { category: 'birthday', cake: 'vanilla' } });
    expect(resolveConfig({ category: 'party', label: 'cobalt' })).toEqual({ ok: true, config: { category: 'party', songId: 'sample-track-a', label: 'cobalt' } });
  });

  it('rejects invalid categories', () => {
    expect(resolveConfig({ category: 'envelope' })).toEqual({ ok: false, received: 'envelope' });
    expect(resolveConfig(null).ok).toBe(false);
  });
});
