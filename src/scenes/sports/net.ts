import { Vector3 } from 'three';
import { HOOP_ROOT, RIM_LOCAL, type SportsRig } from '../../../models/sports.ts';
import type { BallSampler, HoopSprings, NetState } from '../../../models/sportsNet.ts';

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
 *
 * v1.7 (#44): the net keeps its own fixed 1/480 s clock, locked to the run's time (a resting net
 * takes the run's own clock, so every display rate integrates the same substeps at the same
 * times, the ball sampled on its path at each); the hoop springs are stepped on the same substeps
 * (they carry the net's loops); and each frame draws the net and the recoil between the last two
 * substeps at exactly the director's time, the ball's.
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

/** The most net time one step integrates (s): after a long stall the net skips ahead with the ball. */
const MAX_CATCH_UP = 0.1;

export class SportsNetChannel<S, C> {
  /**
   * The run the net follows: the run's time t maps to the net's clock as t + offset (`anchor`: a
   * moving net's offset is set at its first step, from the step's own dt), and the director's time
   * it was last drawn at.
   */
  private clock: { seq: S; change: C; t: number; offset: number; anchor: boolean } | null = null;
  /**
   * The net's and the hoop springs' motion as the last `settle()` found it. An interruption (the
   * director's cut or blend) settles and then calls `restore()`, which puts it back: the net keeps
   * swinging through a change of mind. Reduced motion, a replay or a reset never restore, so there
   * the net stays snapped to rest. Dropped by the next `follow` or `step`.
   */
  private carry: { net: NetState; springs: ReturnType<HoopSprings['save']> } | null = null;
  /** The sampler's program for this step, and the drawn ball when there is none. */
  private on: { seq: S; change: C; offset: number } | null = null;
  private readonly still = new Vector3();
  private readonly sample: BallSampler = (t, out) => {
    const on = this.on;
    return this.toSim(on ? this.path(on.seq, on.change, t - on.offset) : this.still, out);
  };

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
    if (k && k.seq === run.seq && k.change === run.change && run.t >= k.t - 1e-6 && !restart) return;
    const sim = this.rig.net?.sim;
    if (sim?.settled) {
      // A resting net has no time of its own: it takes the run's, so it integrates the same substeps at every display rate.
      sim.setClock(run.t);
      this.clock = { seq: run.seq, change: run.change, t: run.t, offset: 0, anchor: false };
    } else this.clock = { seq: run.seq, change: run.change, t: run.t, offset: 0, anchor: true };
  }

  /** A pose placed the ball: the net no longer follows a path (the carried motion survives, for the director's cut). */
  forget(): void {
    this.clock = null;
  }

  /**
   * The continuous channel: the net stepping along the ball's own path (`target`: the run on
   * screen, the tail or the director's sample) to the director's time; with no path, by dt around
   * the drawn ball (`drawn`, sports_root space). The hoop springs ride the net's substeps; the
   * recoil and the skin are drawn at the director's time.
   */
  step(dt: number, target: BallRun<S, C> | null, drawn: Vector3): void {
    this.carry = null;
    const net = this.rig.net;
    if (!net) return;
    const sim = net.sim, springs = this.rig.springs, k = this.clock;
    let until: number;
    if (target && k && k.seq === target.seq && k.change === target.change) {
      // A moving net that took up a new run: its clock carries on, the run's time joins it here.
      if (k.anchor) { k.offset = sim.drawnTime + dt - target.t; k.anchor = false; }
      until = target.t + k.offset;
      if (until - sim.drawnTime > MAX_CATCH_UP) {
        k.offset -= until - sim.drawnTime - MAX_CATCH_UP;
        until = sim.drawnTime + MAX_CATCH_UP;
      }
      until = Math.max(until, sim.drawnTime);
      k.t = target.t;
      this.on = { seq: target.seq, change: target.change, offset: k.offset };
    } else {
      until = sim.drawnTime + dt;
      this.on = null;
      this.still.copy(drawn);
    }
    const wasSettled = sim.settled, tick = sim.tick;
    sim.advance(until, this.sample, springs);
    this.on = null;
    const a = sim.alpha;
    const board = springs.prevBoard + (springs.board - springs.prevBoard) * a, rim = springs.prevRim + (springs.rim - springs.prevRim) * a;
    const stand = springs.prevStand + (springs.stand - springs.prevStand) * a;
    this.rig.recoil.set(board, rim, stand);
    // The skin is drawn at the director's time: redraw it unless the net rests or this step moved nothing (a frame's second step).
    const shown = this.shown;
    if (!(wasSettled && sim.settled) && !(tick === sim.tick && a === shown.alpha && board === shown.board && rim === shown.rim && stand === shown.stand)) {
      net.skin.update(board, rim, stand);
      shown.alpha = a; shown.board = board; shown.rim = rim; shown.stand = stand;
    }
  }
  /** What the skin last drew (the net's interpolation and the recoil, v1.7 polish: the stand's sway). */
  private readonly shown = { alpha: NaN, board: NaN, rim: NaN, stand: NaN };

  /** The net or the hoop springs are still moving. */
  settling(): boolean {
    return !(this.rig.net?.sim.settled ?? true) || !this.rig.springs.settled;
  }

  /** Snap the net to its hanging pose and the hoop to rest, remembering a moving net's motion for `restore()`. */
  settle(): void {
    this.clock = null;
    const net = this.rig.net, springs = this.rig.springs;
    this.carry = net && (!net.sim.settled || !springs.settled) ? { net: net.sim.save(), springs: springs.save() } : null;
    if (net) {
      net.sim.settle();
      net.skin.update();
    }
    this.shown.alpha = NaN;
    springs.settle();
    this.rig.recoil.set(0, 0, 0);
  }

  /** Interruptions: the motion the last `settle()` snapped carries over (the net keeps swinging through a change of mind). */
  restore(): void {
    const net = this.rig.net, springs = this.rig.springs;
    if (this.carry && net) {
      net.sim.restore(this.carry.net);
      springs.restore(this.carry.springs);
      this.rig.recoil.set(springs.board, springs.rim, springs.stand);
      net.skin.update(springs.board, springs.rim, springs.stand);
    }
    this.shown.alpha = NaN;
    this.carry = null;
  }

  /** Ball centre (sports_root space) → sim space (the hoop at rest, origin at the rim centre). */
  private toSim(p: Vector3, out: Vector3): Vector3 {
    return out.copy(p).sub(HOOP_ROOT).sub(RIM_LOCAL);
  }
}
