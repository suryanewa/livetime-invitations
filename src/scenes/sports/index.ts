import { Box3, type Camera, type Object3D, Quaternion, Vector3, type WebGLRenderer } from 'three';
import glbUrl from '../../../assets/scenes/sports/sports.glb?url';
import {
  BALL_AT, BALL_MASS_KG, BALL_R, BOARD, BOARD_PIVOT, HOOP_ROOT, HOOP_SPRINGS, NET, netRestRadius, POLE, RIM, RIM_CENTER, RIM_HINGE, rigSports, SPORTS_CM_PER_UNIT, SPORTS_WALL_Z,
  SPORTS_WORLD_SCALE, STAND, type BallPreset, type SportsRig,
} from '../../../models/sports.ts';
import type { Hit } from './ballPhysics.ts';
import { bindMaterialsByName } from '../../../models/types.ts';
import { disposeImported, gltfLoader, loadMaterialVariants, prepareImported, setImportedLowDetail } from '../../../models/imported.ts';
import { silhouettePoints } from '../../render/framing.ts';
import { finalPose, type SceneInstance, type SceneLoadContext, type SceneModule } from '../../core/sequence.ts';
import type { CanonicalPose, SceneConfig, SequenceName } from '../../core/types.ts';
import { DURATIONS, frameFor, HITS, newFrame, REST_AT, sampleTrack, type SportsFrame } from './sequences.ts';
import { type Change, changeHandover, planChange, type Showing } from './change.ts';
import { SportsNetChannel } from './net.ts';

/** Outer net silhouette beyond its inner envelope (cords, knots, the far layer's thickness). */
const NET_OUTSET = 0.05;
/**
 * How far the simulated net can swing out of its rest envelope (the made ball opens it to the
 * ball's radius and the whip throws the bottom out and up): a conservative envelope for framing.
 */
const NET_SWING = { out: 0.12, down: 0.15 } as const;

const SEQUENCES: readonly SequenceName[] = ['host', 'accept', 'decline'];

/**
 * v1.7 (#43, "bigger … more focused on the backboard and ball"): the hero is the board, the rim,
 * the net and the ball at guest-ready; the stand (`hoop_stand` the base, `hoop_pole` the pole,
 * sleeve and arms, `hoop_hardware` the back plate, bolts and hubs) is left out of it, so it may be
 * cropped by the frame's bottom and right edges.
 */
export const SPORTS_HERO_EXCLUDE = /^hoop_(stand|pole|hardware)$/;
/**
 * v1.7: the Sports hero fill. #43 built it at the largest that keeps every path PATH_CLEARANCE
 * inside the frame ({0.92, 0.76}: the board's top 2.5 % under the frame's top, the declined ball
 * on the 2 % line, at 3:4 a tangent crop at the base's wheel); the judge gave the air back (the
 * polish round): 0.85 of the frame's height at 1:1 and 3:2, at most 0.70 of its width at 3:4 (where
 * the hero's width binds). Measured on the real stage: the board's top 6 % from the frame's top,
 * the lowest ball 6 % from the bottom, the base whole at 3:4, the ball 8.2 % of the frame's height
 * (v1.6: 5.9 %; 1.40× larger). v1.4–v1.6: the shared 0.6 / 0.75 with the whole stand in the hero.
 */
export const SPORTS_HERO_FILL = { height: 0.85, width: 0.7 } as const;
const UP = new Vector3(0, 1, 0);
const _up = new Vector3();

/** Silhouette samples of every Sports path (tails to rest included): the hoop, the pass, the made shot and the airball. */
export function sportsFramePoints(sequences: readonly SequenceName[] = SEQUENCES): Vector3[] {
  const pts: Vector3[] = [];
  const sphere = (c: Vector3) => {
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
      pts.push(new Vector3(c.x + dx * BALL_R, c.y + dy * BALL_R, c.z + dz * BALL_R));
    }
  };
  const f = newFrame();
  for (const seq of sequences) {
    for (let t = 0; t <= REST_AT[seq] + 1e-9; t += 0.02) sphere(sampleTrack(seq, t, f).ballPos.clone());
    sphere(sampleTrack(seq, REST_AT[seq], f).ballPos.clone());
  }
  sphere(BALL_AT.host);
  // Changes of mind (change.ts) at representative moments: they keep to the same floor and air.
  if (sequences.includes('accept') && sequences.includes('decline')) {
    const p = new Vector3(), q = new Quaternion();
    for (const [from, to, times] of [['accept', 'decline', [0.3, 0.7, 1.0, 1.3, 2.5]], ['decline', 'accept', [0.3, 0.9, 1.4, 3]]] as const) {
      for (const t of [...times, REST_AT[from] + 0.1]) {
        const showing: Showing = t > REST_AT[from] ? { kind: 'rest', pos: sampleTrack(from, t, f).ballPos.clone(), rot: new Quaternion() } : { kind: 'track', seq: from, t, change: null };
        const c = planChange(showing, to);
        for (let u = 0; u <= c.track.end; u += 0.04) {
          c.track.sample(u, p, q);
          sphere(p.clone());
        }
      }
    }
  }
  // Hoop: the board's eight corners (its top-back edge is the silhouette at the 15° elevation) and
  // the rim ring. v1.7: not the stand (its base's footprint went with it): the frame is the board,
  // the rim, the net and the ball, so the stand may be cropped by the frame's bottom and right
  // edges (#43). SPORTS_BOUNDS, the key light's aim, still covers it.
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const z of [BOARD.front, BOARD.front - BOARD.thickness]) {
    pts.push(new Vector3(HOOP_ROOT.x + (sx * BOARD.width) / 2, BOARD.centerY + (sy * BOARD.height) / 2, HOOP_ROOT.z + z));
  }
  const dirs = Array.from({ length: 16 }, (_, i) => [Math.cos((i / 16) * Math.PI * 2), Math.sin((i / 16) * Math.PI * 2)] as const);
  const ring = RIM.innerRadius + 2 * RIM.tube;
  for (const [cx, sz] of dirs) pts.push(new Vector3(RIM_CENTER.x + cx * ring, RIM_CENTER.y, RIM_CENTER.z + sz * ring));
  // The net: its rest envelope and the room its swing can take.
  for (const [cx, sz] of dirs) {
    for (const t of [0.25, 0.5, 0.75, 1]) {
      const r = netRestRadius(t) + NET_OUTSET + NET_SWING.out * t, y = -t * NET.depth - NET_SWING.down * t * t;
      pts.push(new Vector3(RIM_CENTER.x + cx * r, RIM_CENTER.y + y, RIM_CENTER.z + sz * r));
    }
  }
  return pts;
}

// ── Interruption: blend (≤150 ms) unless the straight path would cross the hoop ──────
const BOARD_BOX = new Box3(
  new Vector3(HOOP_ROOT.x - BOARD.width / 2, BOARD.centerY - BOARD.height / 2, HOOP_ROOT.z + BOARD.front - BOARD.thickness),
  new Vector3(HOOP_ROOT.x + BOARD.width / 2, BOARD.centerY + BOARD.height / 2, HOOP_ROOT.z + BOARD.front),
);
const BASE_BOX = new Box3(
  new Vector3(HOOP_ROOT.x - STAND.base.halfWidth, 0, HOOP_ROOT.z + STAND.base.back),
  new Vector3(HOOP_ROOT.x + STAND.base.halfWidth, STAND.base.height, HOOP_ROOT.z + STAND.base.front),
);
/** The arms, sleeve and back plate between the pole's head and the board, as one box. */
const ARMS_BOX = new Box3(
  new Vector3(HOOP_ROOT.x - 0.26, BOARD.centerY - 0.4, HOOP_ROOT.z + POLE.head.z - 0.2),
  new Vector3(HOOP_ROOT.x + 0.26, BOARD.centerY + 0.4, HOOP_ROOT.z + BOARD.front - BOARD.thickness),
);
const POLE_FOOT = HOOP_ROOT.clone().add(POLE.foot), POLE_HEAD = HOOP_ROOT.clone().add(POLE.head);
const _seg = new Vector3(), _rel = new Vector3();
/** Distance from p to the leaning pole's axis segment. */
const poleAxisDistance = (p: Vector3) => {
  _seg.subVectors(POLE_HEAD, POLE_FOOT);
  const u = Math.min(1, Math.max(0, _rel.subVectors(p, POLE_FOOT).dot(_seg) / _seg.lengthSq()));
  return _rel.subVectors(p, POLE_FOOT).addScaledVector(_seg, -u).length();
};
/** Rim tube centre radius (the master's ring). */
const RING_R = RIM.innerRadius + RIM.tube;
/**
 * The net as a shell of revolution: from its measured inner envelope (NET.profile) outwards by
 * 2 × NET_SHELL (cords, knots and the far side of each diamond).
 */
const NET_SHELL = 0.03;
const netMid = (t: number) => netRestRadius(t) + NET_SHELL;
/** Surface gap the ball must keep from every hoop part along a blend. */
export const BLEND_MARGIN = 0.05;

/** Distance from point p to the nearest hoop surface: rim tube, net, backboard, arms, pole or base. */
export function hoopDistance(p: Vector3): number {
  const r = Math.hypot(p.x - RIM_CENTER.x, p.z - RIM_CENTER.z);
  const dy = p.y - RIM_CENTER.y;
  let d = Math.hypot(r - RING_R, dy) - RIM.tube;
  // The net is a surface of revolution: its nearest point lies in p's meridian plane.
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    d = Math.min(d, Math.hypot(r - netMid(t), dy + NET.depth * t) - NET_SHELL);
  }
  d = Math.min(d, BOARD_BOX.distanceToPoint(p), ARMS_BOX.distanceToPoint(p), BASE_BOX.distanceToPoint(p));
  return Math.min(d, poleAxisDistance(p) - POLE.radius);
}

/** Closest approach of the ball centre to the hoop along the straight blend from `from` to `to`. */
export function blendClearance(from: Vector3, to: Vector3 = BALL_AT.guest, samples = 32): number {
  const p = new Vector3();
  let min = Infinity;
  for (let i = 0; i <= samples; i++) min = Math.min(min, hoopDistance(p.lerpVectors(from, to, i / samples)));
  return min;
}

/**
 * v1.5 (polish): a change of mind never blends or cuts the ball. The scene draws the hand-over
 * itself from the ball's state on screen (`change.ts`): it carries on under its own physics and
 * the hand acts through its next floor contact. Only in the first 0.1 s of a gather, while the ball
 * still sits on the floor at the guest spot, does the director blend (a few centimetres).
 */
export function sportsInterruptCut(showing: Showing): boolean {
  return changeHandover(showing);
}

/**
 * v1.7: the hoop's answer to a strike (`Hit`), as changes of angular velocity (rad/s) about the
 * recoil pivots, for `HoopSprings.kick`. The part takes the opposite of the ball's impulse,
 * J = −m·Δv (BALL_MASS_KG, metres), and turns by its moment about the pivot over its inertia
 * (HOOP_SPRINGS), signed as the recoil (pitch about +x, positive tips the front down):
 * L = r_y·J_z − r_z·J_y. A strike on the glass turns the board about BOARD_PIVOT. A strike on the
 * ring turns the ring about RIM_HINGE, and its hinge pin hands the impulse to the board, which
 * turns by it about BOARD_PIVOT from the hinge (the ring's own mass neglected).
 */
export function hitKick(hit: Pick<Hit, 'surface' | 'contact' | 'impulse'>): { rim: number; board: number } {
  const toM = SPORTS_CM_PER_UNIT / 100;
  const J = hit.impulse.clone().multiplyScalar(-BALL_MASS_KG * toM);
  const at = hit.contact.clone().sub(HOOP_ROOT);
  const moment = (from: Vector3, pivot: Vector3) => ((from.y - pivot.y) * J.z - (from.z - pivot.z) * J.y) * toM;
  if (hit.surface === 'board') return { rim: 0, board: moment(at, BOARD_PIVOT) / HOOP_SPRINGS.board.inertia };
  return { rim: moment(at, RIM_HINGE) / HOOP_SPRINGS.rim.inertia, board: moment(RIM_HINGE, BOARD_PIVOT) / HOOP_SPRINGS.board.inertia };
}

/** The strikes of a program (a sequence or a change of mind). */
const hitsOf = (seq: SequenceName, change: Change | null): readonly Hit[] => (change ? change.track.hits : HITS[seq]);

/**
 * Contact-blob falloff height. With the key's shadow map on (Normal/High) the cast shadow already
 * shows an airborne ball's height, so the blob only anchors contact and is gone within a
 * third of a unit; without it (Low) the blob is the only shadow and fades slowly.
 */
export const BLOB_FALLOFF = { withKeyShadow: 0.35, alone: 1.6 } as const;

/** Where the ball's time stands: the sequence (or its tail), its time, and the change of mind it plays (if any). */
interface Clock {
  seq: SequenceName;
  t: number;
  change: Change | null;
}

/** The ball of a sequence (or of a change of mind) at time t, tails included. */
export function sampleProgram(seq: SequenceName, change: Change | null, t: number, out: SportsFrame): SportsFrame {
  if (!change) return sampleTrack(seq, t, out);
  out.squash = change.track.sample(Math.min(Math.max(t, 0), change.track.end), out.ballPos, out.ballRot);
  return out;
}
const restAt = (seq: SequenceName, change: Change | null) => (change ? Math.max(DURATIONS[seq], change.track.end) : REST_AT[seq]);

export class SportsScene implements SceneInstance {
  readonly category = 'sports' as const;
  readonly root: Object3D;
  readonly bounds: Box3;
  /** Silhouette of the objects on stage at guest-ready but the stand (v1.7): the framing rule's hero. */
  readonly heroPoints: Vector3[];
  readonly durations = DURATIONS;
  readonly animatedNodes: Object3D[];
  readonly studio = { wallZ: SPORTS_WALL_Z };
  readonly framePoints = sportsFramePoints();
  readonly heroFill = SPORTS_HERO_FILL;

  private readonly frame = newFrame();
  private preset: BallPreset;
  private shadowHeight = 0;
  private shadowSpread = 1;
  /** The sequence the director is sampling (cleared by any pose or settle). */
  private sampling: Clock | null = null;
  /** The tail: the sequence's physics after its duration, played by `simulate`. */
  private tail: Clock | null = null;
  /** What `interruptCut` found on screen; the new sequence's first sample plans the change from it. */
  private pending: Showing | null = null;
  /**
   * The net channel (`net.ts`): the net steps along the ball's own path, drives the hoop springs
   * and carries its motion over the director's settle on an interruption.
   */
  private readonly net: SportsNetChannel<SequenceName, Change | null>;
  /**
   * v1.7: how far along the program on screen the strikes on the board and the rim have kicked the
   * hoop (`hitKick` → `HoopSprings.kick`), like the net's clock: a sample or the tail fires every
   * hit it passes; a new run starts afresh.
   */
  private hitClock: Clock | null = null;
  /**
   * v1.7: the springs' motion when the director settles mid-rattle: `refresh()` puts it back, so a
   * change of mind never snaps a shuddering rim. The net channel carries it too when the rig has
   * its simulated net (since the net rebuild, whenever the springs move); this covers a rig
   * without one. Dropped by the next sample or step.
   */
  private springsCarry: ReturnType<SportsRig['springs']['save']> | null = null;
  private readonly _axisQ = new Quaternion();
  private readonly _rest = new Quaternion();

  constructor(readonly rig: SportsRig, config: Extract<SceneConfig, { category: 'sports' }>) {
    this.root = rig.root;
    this.bounds = rig.bounds.clone();
    this.preset = config.ball;
    const scratch = newFrame();
    this.net = new SportsNetChannel(rig, (seq, change, t) => sampleProgram(seq, change, t, scratch).ballPos);
    const n = rig.nodes;
    // The blend interpolates the ball's path, the squash and the spin (ball_mesh carries the spin
    // over the master's rest orientation; ball_secondary only squashes).
    this.animatedNodes = [n.ball_authored!, n.ball_secondary!, n.ball_mesh!];
    // The blob's opacity depends on whether this render has the key's shadow map: decided per draw.
    rig.ballShadow.onBeforeRender = (renderer) => {
      if (renderer.shadowMap.enabled) this.shadeBlob(BLOB_FALLOFF.withKeyShadow);
    };
    this.pose('guest-ready');
    this.heroPoints = silhouettePoints(this.root, (o) => SPORTS_HERO_EXCLUDE.test(o.name));
  }

  setConfig(config: SceneConfig): void {
    if (config.category !== 'sports' || config.ball === this.preset) return;
    this.preset = config.ball;
    this.rig.setPreset(config.ball);
  }

  /**
   * A canonical pose. The director ends a sequence by posing its final pose right after sampling
   * it: then the ball plays on through its tail (the rest of its physics) in `simulate`, and the
   * net keeps moving; `settle()` snaps both. Any other pose places the ball at once. A change of
   * mind's planning state survives the director's cut (settle, pose guest-ready, refresh).
   */
  pose(pose: CanonicalPose): void {
    const s = this.sampling;
    this.sampling = null;
    if (pose !== 'guest-ready') this.pending = null;
    if (s && pose === finalPose(s.seq) && restAt(s.seq, s.change) > DURATIONS[s.seq] + 1e-6) {
      this.tail = { seq: s.seq, t: DURATIONS[s.seq], change: s.change };
      this.apply(sampleProgram(s.seq, s.change, this.tail.t, this.frame));
      return;
    }
    this.tail = null;
    this.hitClock = null;
    this.net.forget();
    this.apply(frameFor(pose, this.frame));
  }

  sample(sequence: SequenceName, t: number): void {
    let change = this.sampling?.seq === sequence && t >= this.sampling.t - 1e-6 ? this.sampling.change : null;
    // The director's hand-over after `interruptCut` lands here at t = 0: plan the change of mind.
    if (this.pending && t === 0 && sequence !== 'host') change = planChange(this.pending, sequence);
    this.pending = null;
    // A new run of a sequence (or the first sample after a tail) starts the net's view of the ball afresh.
    const afterTail = this.tail !== null;
    this.tail = null;
    this.sampling = { seq: sequence, t, change };
    this.net.follow(this.sampling, afterTail);
    this.springsCarry = null;
    this.fireHits(sequence, change, Math.min(t, DURATIONS[sequence]));
    this.apply(sampleProgram(sequence, change, Math.min(t, DURATIONS[sequence]), this.frame));
  }

  /**
   * Kick the hoop for every strike the program on screen has passed since the hit clock (v1.7). A
   * different program or an earlier time is a new run: the clock restarts there, firing nothing
   * (a strike is never fired twice, nor for a time the ball has not reached).
   */
  private fireHits(seq: SequenceName, change: Change | null, t: number): void {
    const k = this.hitClock;
    if (!k || k.seq !== seq || k.change !== change || t < k.t - 1e-9) {
      this.hitClock = { seq, change, t };
      return;
    }
    for (const h of hitsOf(seq, change)) {
      if (h.at > k.t + 1e-9 && h.at <= t + 1e-9) {
        const kick = hitKick(h);
        this.rig.springs.kick(kick.rim, kick.board);
      }
    }
    k.t = t;
  }

  /** The continuous channel: the tail, then the net (stepping along the ball's own path) and the hoop springs. */
  simulate(dt: number): void {
    this.springsCarry = null;
    if (this.tail) {
      const end = restAt(this.tail.seq, this.tail.change);
      this.tail.t = Math.min(this.tail.t + dt, end);
      this.fireHits(this.tail.seq, this.tail.change, this.tail.t);
      this.apply(sampleProgram(this.tail.seq, this.tail.change, this.tail.t, this.frame));
      if (this.tail.t >= end) this.tail = null;
    }
    this.net.step(dt, this.tail ?? this.sampling, this.rig.nodes.ball_authored!.position);
  }

  settling(): boolean {
    return this.tail !== null || this.net.settling();
  }

  /** Snap everything to rest: the tail to its end, the net to its hanging pose, the hoop to rest. */
  settle(): void {
    if (this.tail) this.apply(sampleProgram(this.tail.seq, this.tail.change, restAt(this.tail.seq, this.tail.change), this.frame));
    this.tail = null;
    this.sampling = null;
    this.hitClock = null;
    // A kick ringing down with the net at rest: the net channel would snap it; keep it for refresh().
    this.springsCarry = this.rig.springs.settled ? null : this.rig.springs.save();
    this.net.settle();
  }

  /** Interruptions: the net's motion carries over the director's settle; the shadow follows the drawn ball. */
  refresh(): void {
    this.net.restore();
    if (this.springsCarry) {
      this.rig.springs.restore(this.springsCarry);
      this.rig.recoil.set(this.rig.springs.board, this.rig.springs.rim);
      this.springsCarry = null;
    }
    const n = this.rig.nodes;
    const axisUp = _up.copy(UP).applyQuaternion(n.ball_secondary!.quaternion).y;
    this.updateShadow(n.ball_authored!.position, (1 - n.ball_secondary!.scale.y) * Math.max(0, axisUp));
  }

  /** What is on screen: a sequence's (or a change's) physics at its time, or a ball at rest. */
  private showing(): Showing {
    const c = this.tail ?? this.sampling;
    if (c) return { kind: 'track', seq: c.seq, t: c.t, change: c.change };
    return { kind: 'rest', pos: this.frame.ballPos.clone(), rot: this.frame.ballRot.clone() };
  }

  /**
   * A change of mind: the scene takes the hand-over (the director's 0 ms cut) and plans it at the
   * new sequence's first sample from the ball's state on screen (`change.ts`), unless the ball still
   * sits on the floor in the first 0.1 s of a gather (then the director's short blend is right).
   */
  interruptCut(): boolean {
    const showing = this.showing();
    if ((showing.kind === 'track' && showing.seq === 'host') || !sportsInterruptCut(showing)) return false;
    this.pending = showing;
    return true;
  }

  /** Low tier for the imported ball, board, rim and net materials (the library handles the stand). */
  setLowDetail(enabled: boolean): void {
    setImportedLowDetail(this.root, enabled);
  }

  async precompile(renderer: WebGLRenderer, camera: Camera): Promise<void> {
    const scene = this.root.parent ?? this.root;
    await renderer.compileAsync(scene, camera);
    this.rig.setPreset(this.preset === 'orange' ? 'cream' : 'orange');
    await renderer.compileAsync(scene, camera);
    this.rig.setPreset(this.preset);
  }

  dispose(): void {
    this.rig.dispose();
    disposeImported(this.root);
    this.root.traverse((o) => (o as { geometry?: { dispose(): void } }).geometry?.dispose());
    this.root.removeFromParent();
  }

  private apply(f: SportsFrame): void {
    const n = this.rig.nodes;
    n.ball_authored!.position.copy(f.ballPos);
    // Squash (volume-preserving, along the contact normal) on ball_secondary, whose +y is turned
    // onto that normal (v1.7: the floor's up, or a hit's normal on the board or the ring) and which
    // never spins, so its scale axis stays the normal while the ball spins inside it: ball_mesh
    // carries the spin relative to it.
    const sv = 1 - f.squash, sh = 1 / Math.sqrt(sv);
    n.ball_secondary!.scale.set(sh, sv, sh);
    const q = this._axisQ.setFromUnitVectors(UP, f.squashAxis);
    n.ball_secondary!.quaternion.copy(q);
    n.ball_mesh!.quaternion.copy(this._rest.copy(q).invert()).multiply(f.ballRot).multiply(this.rig.ballRest);
    this.updateShadow(f.ballPos, f.squash * Math.max(0, f.squashAxis.y));
  }

  /** Contact blob under the drawn ball: its bottom height, widened with the squash. */
  private updateShadow(ball: Vector3, squash: number): void {
    // Tight and dark on the floor; wider and fainter as the ball rises, never stuck to it. This is
    // the Low-tier falloff; renders with the key's shadow map fade it faster (onBeforeRender).
    this.rig.ballShadow.setFootprint(ball.x, ball.z);
    // Drawn bottom = centre − BALL_R · (1 − squash): on the floor through every contact.
    this.shadowHeight = Math.max(0, ball.y - BALL_R * (1 - squash));
    this.shadowSpread = 1 / Math.sqrt(1 - squash);
    this.shadeBlob(BLOB_FALLOFF.alone);
  }

  private shadeBlob(falloff: number): void {
    const s = this.rig.ballShadow;
    s.setHeight(this.shadowHeight, falloff);
    s.scale.x *= this.shadowSpread;
    s.scale.y *= this.shadowSpread;
  }
}

async function fetchGlb(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw Object.assign(new Error(`asset ${res.status}`), { reason: 'asset-failure' as const });
  return res.arrayBuffer();
}

export const sportsScene: SceneModule = {
  category: 'sports',
  async load({ config, library, signal }: SceneLoadContext): Promise<SceneInstance> {
    if (config.category !== 'sports') throw new Error('sports scene given another config');
    const gltf = await gltfLoader().parseAsync(await fetchGlb(glbUrl, signal), '');
    const root = gltf.scene.getObjectByName('sports_root');
    if (!root) throw Object.assign(new Error('missing sports_root'), { reason: 'asset-failure' as const });
    // Ball presets live in the GLB (KHR_materials_variants); read them before detaching the root.
    const variants = await loadMaterialVariants(gltf);
    root.removeFromParent();
    bindMaterialsByName(root, library);
    prepareImported(root, library, variants.materials);
    // v1.4: the scene stands in the world at its real size (models/worldScale.ts).
    root.scale.setScalar(SPORTS_WORLD_SCALE);
    return new SportsScene(rigSports(root, library, config.ball, variants), config);
  },
};
