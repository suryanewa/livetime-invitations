import { Quaternion, Vector3, type Object3D } from 'three';
import { finalPose } from './sequence.ts';
import type { CanonicalPose, Mode, Response, SequenceName, VisualState } from './types.ts';

/**
 * Visual state machine (Master §6–7). Owns playback, interruption blends and completion
 * events. It never touches the response ledger. Time is ACTIVE seconds from the shared
 * clock, so hidden tabs pause playback without debt.
 */

export const INTERRUPT_BLEND = 0.15;

export interface SceneDriver {
  readonly durations: Readonly<Record<SequenceName, number>>;
  readonly animatedNodes: readonly Object3D[];
  pose(pose: CanonicalPose): void;
  sample(sequence: SequenceName, t: number): void;
  settle?(): void;
  /** Optional manipulation holds the timeline (only it may extend the choreography). */
  holding?(): boolean;
  /** One-shot request to jump the timeline (e.g. early scan on contact). */
  takeSeek?(): number | null;
  /** Recompute derived state (strap curves, shadows) from the current node transforms. */
  refresh?(): void;
  /**
   * True when a straight blend from the current pose to guest-ready would pass one object
   * through another (a cake inside the bin, a cloche beside the plate, a ball in the net).
   * The interruption then cuts to guest-ready (Master §6 allows ≤150 ms, so zero is valid).
   */
  interruptCut?(): boolean;
  /** v1.5: true while `target` needs assets the scene loads after ready (the shared bin). */
  needs?(target: SequenceName | CanonicalPose): boolean;
}

export interface VisualHooks {
  complete(sequence: SequenceName): void;
  change?(state: VisualState): void;
  /**
   * v1.5: load what `target` needs (`SceneDriver.needs`). Until it resolves the director holds the
   * picture where it is (the response ledger has already moved on), then shows `target`; a newer
   * intent, mode or reset drops the wait. On rejection the hook decides (the controller shows the
   * poster), and the director stays where it is.
   */
  ensure?(target: SequenceName | CanonicalPose): Promise<void>;
}

type Snapshot = { p: Vector3; q: Quaternion; s: Vector3 }[];

type Playback =
  | { kind: 'sequence'; sequence: SequenceName; start: number }
  | { kind: 'blend'; start: number; from: Snapshot; to: Snapshot; next: SequenceName };

function capture(nodes: readonly Object3D[]): Snapshot {
  return nodes.map((n) => ({ p: n.position.clone(), q: n.quaternion.clone(), s: n.scale.clone() }));
}

export class VisualDirector {
  private driver: SceneDriver | null = null;
  private mode: Mode;
  private intent: Response | null = null;
  private reduced = false;
  private playback: Playback | null = null;
  private visual: VisualState;
  /** Completion is emitted only when an uninterrupted playback reaches its end. */
  private pendingSnapComplete: SequenceName | null = null;
  /** v1.5: the current wait for deferred assets (any newer request drops the older one). */
  private waitToken = 0;
  private waitingFor: SequenceName | CanonicalPose | null = null;

  constructor(private readonly hooks: VisualHooks, mode: Mode, intent: Response | null) {
    this.mode = mode;
    this.intent = intent;
    this.visual = this.restingState();
  }

  get state(): VisualState {
    return this.visual;
  }

  get isPlaying(): boolean {
    return this.playback !== null;
  }

  /** v1.5: the target the picture is held for while the scene loads what it needs (null: none). */
  get waiting(): SequenceName | CanonicalPose | null {
    return this.waitingFor;
  }

  /**
   * v1.5 deferred assets: when `target` needs what the scene has not loaded yet, ask for it and run
   * `then` once it is there (unless something newer came first); true if it waits.
   */
  private hold(target: SequenceName | CanonicalPose, then: () => void): boolean {
    const token = ++this.waitToken;
    this.waitingFor = null;
    if (!this.driver?.needs?.(target) || !this.hooks.ensure) return false;
    this.waitingFor = target;
    this.hooks.ensure(target).then(
      () => {
        if (token !== this.waitToken) return;
        this.waitingFor = null;
        then();
      },
      () => {
        if (token === this.waitToken) this.waitingFor = null;
      },
    );
    return true;
  }

  /** Pose the poster/fallback should represent right now (current intent, never an error). */
  get currentPose(): CanonicalPose {
    switch (this.visual) {
      case 'host-ready':
      case 'host-playing':
        return 'host-ready';
      case 'guest-ready':
        return 'guest-ready';
      case 'accept-playing':
      case 'accepted-pose':
        return 'accepted';
      case 'decline-playing':
      case 'declined-pose':
        return 'declined';
    }
  }

  /** The canonical pose the current playback will end on (used for static fallbacks). */
  get targetPose(): CanonicalPose {
    if (this.mode === 'host') return this.visual === 'host-ready' ? 'host-ready' : 'guest-ready';
    return this.intent ? (this.intent === 'accept' ? 'accepted' : 'declined') : 'guest-ready';
  }

  /** Scene loaded (or unloaded). A late load shows the current final pose without replay. */
  attach(driver: SceneDriver | null): void {
    // Detaching mid-sequence (context loss, static tier) completes the intent visually so
    // the state never sticks at *-playing.
    if (!driver && this.playback) this.finishNow();
    this.playback = null;
    this.driver = driver;
    this.waitToken++;
    this.waitingFor = null;
    if (driver) {
      // A late load shows the settled target: a host preparation that already completed
      // stays prepared rather than resetting to host-ready.
      const prepared = this.mode === 'host' && this.visual === 'guest-ready';
      const pose = prepared ? 'guest-ready' : this.restingPose();
      if (this.hold(pose, () => this.attach(driver))) return;
      this.set(prepared ? 'guest-ready' : this.restingState());
      driver.pose(pose);
      driver.settle?.();
    }
  }

  setReducedMotion(enabled: boolean): void {
    this.reduced = enabled;
    if (enabled && this.playback) this.finishNow();
    if (enabled) this.driver?.settle?.();
  }

  setMode(mode: Mode): void {
    this.mode = mode;
    this.cancel();
  }

  /** Called when the guest's intent changes (never for repeated same-intent taps). */
  setIntent(intent: Response | null): void {
    this.intent = intent;
    if (this.mode !== 'guest') return;
    if (!intent) return this.cancel();
    const sequence: SequenceName = intent;
    // v1.5: a decline tapped before the bin has arrived waits for it on the picture it is on.
    if (this.hold(this.reduced ? finalPose(sequence) : sequence, () => this.setIntent(intent))) return;
    if (!this.driver || this.reduced) {
      this.playback = null;
      this.set(intent === 'accept' ? 'accepted-pose' : 'declined-pose');
      this.driver?.pose(finalPose(sequence));
      this.driver?.settle?.();
      this.pendingSnapComplete = sequence;
      return;
    }
    if (this.visual === 'guest-ready' && !this.playback) {
      this.startSequence(sequence, this.lastNow);
      return;
    }
    // Interrupt: blend through the canonical ready pose (≤150 ms), old completion cancelled.
    // Where a straight blend is physically impossible the scene asks for a clean cut.
    if (this.driver.interruptCut?.()) {
      this.driver.settle?.();
      this.driver.pose('guest-ready');
      this.driver.refresh?.();
      this.startSequence(sequence, this.lastNow);
      return;
    }
    this.driver.settle?.();
    const from = capture(this.driver.animatedNodes);
    this.driver.pose('guest-ready');
    const to = capture(this.driver.animatedNodes);
    this.restore(from);
    this.driver.refresh?.();
    this.playback = { kind: 'blend', start: this.lastNow, from, to, next: sequence };
    this.set(intent === 'accept' ? 'accept-playing' : 'decline-playing');
  }

  prepareHost(): void {
    if (this.mode !== 'host') return;
    this.play('host');
  }

  /** Replays visuals only; never touches persistence. */
  replay(): void {
    if (this.mode === 'host') this.play('host');
    else if (this.intent) this.play(this.intent);
  }

  /** Cancel playback and show the resting pose for the current mode and intent. */
  reset(): void {
    this.cancel();
  }

  private lastNow = 0;

  /** Advance to active time `now`. Returns true while frames are required. */
  update(now: number): boolean {
    const dt = Math.max(0, now - this.lastNow);
    this.lastNow = now;
    if (this.pendingSnapComplete) {
      const s = this.pendingSnapComplete;
      this.pendingSnapComplete = null;
      this.hooks.complete(s);
    }
    const pb = this.playback;
    if (!pb || !this.driver) return false;
    if (pb.kind === 'blend') {
      const k = Math.min(1, (now - pb.start) / INTERRUPT_BLEND);
      const nodes = this.driver.animatedNodes;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]!, a = pb.from[i]!, b = pb.to[i]!;
        n.position.lerpVectors(a.p, b.p, k);
        n.quaternion.slerpQuaternions(a.q, b.q, k);
        n.scale.lerpVectors(a.s, b.s, k);
      }
      this.driver.refresh?.();
      if (k >= 1) this.startSequence(pb.next, now);
      return true;
    }
    if (this.driver.holding?.()) pb.start += dt;
    const seek = this.driver.takeSeek?.();
    if (seek !== null && seek !== undefined) pb.start = Math.min(pb.start, now - seek);
    const duration = this.driver.durations[pb.sequence];
    const t = now - pb.start;
    if (t >= duration) {
      this.driver.pose(finalPose(pb.sequence));
      this.playback = null;
      this.set(pb.sequence === 'host' ? 'guest-ready' : pb.sequence === 'accept' ? 'accepted-pose' : 'declined-pose');
      this.hooks.complete(pb.sequence);
      return false;
    }
    this.driver.sample(pb.sequence, Math.max(0, t));
    return true;
  }

  private play(sequence: SequenceName): void {
    if (this.hold(this.reduced ? finalPose(sequence) : sequence, () => this.play(sequence))) return;
    if (!this.driver || this.reduced) {
      this.playback = null;
      const pose = finalPose(sequence);
      this.driver?.pose(pose);
      this.set(sequence === 'host' ? 'guest-ready' : sequence === 'accept' ? 'accepted-pose' : 'declined-pose');
      this.pendingSnapComplete = sequence;
      return;
    }
    this.driver.settle?.();
    this.driver.pose(sequence === 'host' ? 'host-ready' : 'guest-ready');
    this.startSequence(sequence, this.lastNow);
  }

  private startSequence(sequence: SequenceName, now: number): void {
    this.playback = { kind: 'sequence', sequence, start: now };
    this.driver?.sample(sequence, 0);
    this.set(sequence === 'host' ? 'host-playing' : sequence === 'accept' ? 'accept-playing' : 'decline-playing');
  }

  private finishNow(): void {
    const pb = this.playback;
    this.playback = null;
    if (!pb) return;
    const sequence = pb.kind === 'blend' ? pb.next : pb.sequence;
    this.driver?.pose(finalPose(sequence));
    this.set(sequence === 'host' ? 'guest-ready' : sequence === 'accept' ? 'accepted-pose' : 'declined-pose');
    this.pendingSnapComplete = sequence;
  }

  private cancel(): void {
    if (this.hold(this.restingPose(), () => this.cancel())) return;
    this.playback = null;
    this.pendingSnapComplete = null;
    this.set(this.restingState());
    this.driver?.pose(this.restingPose());
    this.driver?.settle?.();
  }

  private restingState(): VisualState {
    if (this.mode === 'host') return 'host-ready';
    if (!this.intent) return 'guest-ready';
    return this.intent === 'accept' ? 'accepted-pose' : 'declined-pose';
  }

  private restingPose(): CanonicalPose {
    if (this.mode === 'host') return 'host-ready';
    if (!this.intent) return 'guest-ready';
    return this.intent === 'accept' ? 'accepted' : 'declined';
  }

  private restore(s: Snapshot): void {
    this.driver?.animatedNodes.forEach((n, i) => {
      n.position.copy(s[i]!.p);
      n.quaternion.copy(s[i]!.q);
      n.scale.copy(s[i]!.s);
    });
  }

  private set(state: VisualState): void {
    if (state === this.visual) return;
    this.visual = state;
    this.hooks.change?.(state);
  }
}
