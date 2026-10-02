/**
 * Bounded secondary springs (Master §6). Accessory motion only: an offset below an
 * authored parent. Semi-implicit Euler on a fixed step, clamped, with an exact settle.
 */

export const FIXED_STEP = 1 / 120;
export const MAX_STEPS_PER_FRAME = 4;
/** Most simulated time one displayed frame may advance (a longer stall is discarded). */
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

  /** Scale the remaining displacement and velocity (an authored damp-to-rest beat). */
  damp(factor: number): void {
    if (this.settled) return;
    this.x = this.target + (this.x - this.target) * factor;
    this.v *= factor;
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
 * Shared stepper for secondary motion: each displayed frame's clock delta, capped at MAX_DEBT
 * (1/30 s; a longer stall is discarded rather than caught up), is split into the fewest equal steps
 * no longer than FIXED_STEP (1/120 s), so at most MAX_STEPS_PER_FRAME.
 *
 * v1.5: the steps sum to the frame's delta exactly. The v1.0 stepper took whole 1/120 s steps and
 * carried the remainder as debt, which quantised simulated time: measured on Chrome's frame
 * timestamps at 60 Hz the debt sat on a step boundary and frames alternated 1, 2 and 3 steps, and on
 * 120 or 144 Hz displays 0, 1 and 2, so a motion that runs on in `simulate` (a turning platter, a
 * flame) juddered by a whole step. Springs still integrate in steps of at most 1/120 s, identical
 * to v1.0 at 30, 60 and 120 fps.
 */
export class FixedStepper {
  advance(frameDt: number, step: (dt: number) => void): number {
    const total = Math.min(Math.max(0, frameDt), MAX_DEBT);
    if (total <= 0) return 0;
    // The 1e-9 keeps an exact multiple (1/60 s) from rounding up to an extra step.
    const steps = Math.min(MAX_STEPS_PER_FRAME, Math.ceil(total / FIXED_STEP - 1e-9));
    const h = total / steps;
    for (let i = 0; i < steps; i++) step(h);
    return steps;
  }

  /** No carried state since v1.5 (kept for the loop's pause paths). */
  reset(): void {}
}

export const ANGLE_EPSILON = (0.1 * Math.PI) / 180;
export const DISTANCE_EPSILON = 0.001;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
