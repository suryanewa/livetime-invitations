/**
 * Bounded secondary springs (Master §6). Accessory motion only: an offset below an
 * authored parent. Semi-implicit Euler on a fixed step, clamped, with an exact settle.
 */

export const FIXED_STEP = 1 / 120;
export const MAX_STEPS_PER_FRAME = 4;
export const MAX_DEBT = 1 / 30;
export const DEFAULT_DAMPING = 0.85;
export const SETTLE_HOLD = 0.2;

export interface SpringOptions {
  /** Natural frequency in Hz. */
  frequency: number;
  /** Damping ratio; 0.85 by default. */
  damping?: number;
  /** Symmetric clamp on displacement (radians or scene units). */
  limit: number;
  /** Clamp on velocity to stop optional input from adding unbounded energy. */
  maxVelocity?: number;
  /** Below this displacement and velocity for SETTLE_HOLD seconds → exact rest. */
  epsilon: number;
}

export class Spring {
  x = 0;
  v = 0;
  target = 0;
  settled = true;
  private quiet = 0;
  private readonly omega: number;
  private readonly zeta: number;

  constructor(readonly options: SpringOptions) {
    this.omega = 2 * Math.PI * options.frequency;
    this.zeta = options.damping ?? DEFAULT_DAMPING;
  }

  /** Displace (e.g. from an authored beat); clamped to limits. */
  kick(displacement: number, velocity = 0): void {
    const { limit, maxVelocity = Infinity } = this.options;
    this.x = clamp(this.x + displacement, -limit, limit);
    this.v = clamp(this.v + velocity, -maxVelocity, maxVelocity);
    this.settled = false;
    this.quiet = 0;
  }

  step(dt: number): void {
    if (this.settled) return;
    const { limit, maxVelocity = Infinity, epsilon } = this.options;
    const d = this.x - this.target;
    const a = -this.omega * this.omega * d - 2 * this.zeta * this.omega * this.v;
    this.v = clamp(this.v + a * dt, -maxVelocity, maxVelocity);
    this.x = clamp(this.x + this.v * dt, this.target - limit, this.target + limit);
    if (Math.abs(this.x - this.target) < epsilon && Math.abs(this.v) < epsilon * 10) {
      this.quiet += dt;
      if (this.quiet >= SETTLE_HOLD) this.snap();
    } else {
      this.quiet = 0;
    }
  }

  /** Exact canonical rest (settle deadline, reset, reduced motion). */
  snap(): void {
    this.x = this.target;
    this.v = 0;
    this.settled = true;
    this.quiet = 0;
  }
}

/**
 * Shared fixed-step accumulator: at most four steps per displayed frame, debt capped at
 * 1/30 s with excess discarded rather than caught up.
 */
export class FixedStepper {
  private debt = 0;

  advance(frameDt: number, step: (dt: number) => void): number {
    this.debt = Math.min(this.debt + Math.max(0, frameDt), MAX_DEBT);
    let steps = 0;
    while (this.debt >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
      step(FIXED_STEP);
      this.debt -= FIXED_STEP;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.debt = Math.min(this.debt, FIXED_STEP);
    return steps;
  }

  reset(): void {
    this.debt = 0;
  }
}

export const ANGLE_EPSILON = (0.1 * Math.PI) / 180;
export const DISTANCE_EPSILON = 0.001;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
