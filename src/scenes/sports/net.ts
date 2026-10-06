import { Vector3 } from 'three';
import { HOOP_ROOT, recoilPoint, RIM_LOCAL, type SportsRig } from '../../../models/sports.ts';
import type { BallContact, HoopSprings, NetSim } from '../../../models/sportsNet.ts';

/**
 * The Sports scene's net channel (v1.7 split out of `index.ts`): the simulated net
 * (`models/sportsNet.ts` NetSim and NetSkin) stepping along the ball's own path, the hoop springs
 * its pull drives, and their motion carried over a change of mind. `SportsScene` composes it: the
 * scene owns the ball (its sequences, tails and framing) and tells the net which run of the
 * ball's program is on screen; the net owns everything else.
 *
 *   director sample  → `follow(run, restart)`      the net's view of the ball starts or carries on
 *   a placing pose   → `forget()`                  no path to follow (the drawn ball only)
 *   simulate(dt)     → `step(dt, run, drawn)`      net, springs, recoil and skin
 *   settling()       → `settling()`                net or springs still moving
 *   settle()         → `settle()`                  snap to rest, remembering the motion
 *   refresh()        → `restore()`                 an interruption puts the motion back
 */

/**
 * A run of the ball's program as the scene plays it: which program (`seq` and the change of mind
 * `change`, both compared by identity) and the time the director has it at.
 */
export interface BallRun<S, C> {
  seq: S;
  change: C;
  t: number;
}

/** The ball's centre (sports_root space) at time t of a program, tails included. */
export type BallPath<S, C> = (seq: S, change: C, t: number) => Vector3;

export class SportsNetChannel<S, C> {
  /** The ball's time as the net last saw it (the net steps through the ball's path, not frame to frame). */
  private clock: BallRun<S, C> | null = null;
  /**
   * The net's and the hoop springs' motion as the last `settle()` found it. An interruption (the
   * director's cut or blend) settles and then calls `restore()`, which puts it back: the net keeps
   * swinging through a change of mind. Reduced motion, a replay or a reset never restore, so there
   * the net stays snapped to rest. Dropped by the next `follow` or `step`.
   */
  private carry: { net: ReturnType<NetSim['save']>; springs: ReturnType<HoopSprings['save']> } | null = null;
  private readonly contact: BallContact = { center: new Vector3(), previous: new Vector3() };
  private readonly _o = new Vector3();

  constructor(
    private readonly rig: Pick<SportsRig, 'net' | 'springs' | 'recoil'>,
    /** Where the ball is along a program: the scene's own sampler (sequences, tails, changes of mind). */
    private readonly path: BallPath<S, C>,
  ) {}

  /**
   * The director sampled the ball's program at `run.t`. A new run of it (another sequence or change
   * of mind, a time before the net's, or `restart`: the first sample after a tail) starts the net's
   * view of the ball afresh; otherwise the net carries on from where it stepped to.
   */
  follow(run: BallRun<S, C>, restart: boolean): void {
    this.carry = null;
    const k = this.clock;
    if (!k || k.seq !== run.seq || k.change !== run.change || run.t < k.t - 1e-6 || restart) this.clock = { seq: run.seq, t: run.t, change: run.change };
  }

  /** A pose placed the ball: the net no longer follows a path (the carried motion survives, for the director's cut). */
  forget(): void {
    this.clock = null;
  }

  /**
   * The continuous channel: the net stepping along the ball's own path (`target`: the run on
   * screen, the tail or the director's sample) by dt, never past where the director has it; with
   * no path, around the drawn ball (`drawn`, sports_root space). Then the hoop springs the net
   * pulls on, the recoil and the skin.
   */
  step(dt: number, target: BallRun<S, C> | null, drawn: Vector3): void {
    this.carry = null;
    const net = this.rig.net;
    if (!net) return;
    const c = this.contact, k = this.clock;
    if (target && k && k.seq === target.seq && k.change === target.change) {
      // Step the ball along its track by dt (never past where the director has it).
      const t0 = Math.max(k.t, target.t - 0.1);
      const t1 = Math.min(target.t, t0 + dt);
      this.ballInNet(this.path(target.seq, target.change, t0), c.previous);
      this.ballInNet(this.path(target.seq, target.change, t1), c.center);
      k.t = t1;
    } else {
      this.ballInNet(drawn, c.center);
      c.previous.copy(c.center);
    }
    const wasSettled = net.sim.settled;
    net.sim.step(dt, c);
    this.rig.springs.step(dt, net.sim.settled ? 0 : net.sim.hookTorqueRim, net.sim.settled ? 0 : net.sim.hookTorqueBoard);
    this.rig.recoil.set(this.rig.springs.board, this.rig.springs.rim);
    if (!(wasSettled && net.sim.settled)) net.skin.update();
  }

  /** The net or the hoop springs are still moving. */
  settling(): boolean {
    return !(this.rig.net?.sim.settled ?? true) || !this.rig.springs.settled;
  }

  /** Snap the net to its hanging pose and the hoop to rest, remembering a moving net's motion for `restore()`. */
  settle(): void {
    this.clock = null;
    const net = this.rig.net;
    this.carry = net && !net.sim.settled ? { net: net.sim.save(), springs: this.rig.springs.save() } : null;
    if (net) {
      net.sim.settle();
      net.skin.update();
    }
    this.rig.springs.settle();
    this.rig.recoil.set(0, 0);
  }

  /** Interruptions: the motion the last `settle()` snapped carries over (the net keeps swinging through a change of mind). */
  restore(): void {
    const net = this.rig.net;
    if (this.carry && net) {
      net.sim.restore(this.carry.net);
      this.rig.springs.restore(this.carry.springs);
      this.rig.recoil.set(this.rig.springs.board, this.rig.springs.rim);
      net.skin.update();
    }
    this.carry = null;
  }

  /** Ball centre (sports_root space) → net space (the net rides the rim's and board's recoil). */
  private ballInNet(p: Vector3, out: Vector3): Vector3 {
    const { board, rim } = this.rig.springs;
    recoilPoint(RIM_LOCAL, board, rim, this._o);
    out.copy(p).sub(HOOP_ROOT).sub(this._o);
    const a = -(board + rim), c = Math.cos(a), s = Math.sin(a);
    return out.set(out.x, out.y * c - out.z * s, out.y * s + out.z * c);
  }
}
