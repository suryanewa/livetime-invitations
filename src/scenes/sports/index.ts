import { Box3, type Camera, type Object3D, Vector3, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import glbUrl from '../../../assets/scenes/sports/sports.glb?url';
import {
  BALL_AT, BALL_R, BOARD, HOOP_ROOT, NET, netRestRadius, POLE, recoilPoint, RIM, RIM_CENTER, RIM_LOCAL, rigSports, SPORTS_WALL_Z, SPORTS_WORLD_SCALE, STAND, type BallPreset, type SportsRig,
} from '../../../models/sports.ts';
import type { BallContact, HoopSprings, NetSim } from '../../../models/sportsNet.ts';
import { bindMaterialsByName } from '../../../models/types.ts';
import { disposeImported, loadMaterialVariants, prepareImported, setImportedLowDetail } from '../../../models/imported.ts';
import { silhouettePoints } from '../../render/framing.ts';
import { finalPose, type SceneInstance, type SceneLoadContext, type SceneModule } from '../../core/sequence.ts';
import type { CanonicalPose, SceneConfig, SequenceName } from '../../core/types.ts';
import { DURATIONS, frameFor, newFrame, REST_AT, sampleSequence, sampleTrack, type SportsFrame } from './sequences.ts';

/** Outer net silhouette beyond its inner envelope (cords, knots, the far layer's thickness). */
const NET_OUTSET = 0.05;
/**
 * How far the simulated net can swing out of its rest envelope (the made ball opens it to the
 * ball's radius and the whip throws the bottom out and up): a conservative envelope for framing.
 */
const NET_SWING = { out: 0.12, down: 0.15 } as const;

const SEQUENCES: readonly SequenceName[] = ['host', 'accept', 'decline'];

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
  // Hoop: the board's eight corners (its top-back edge is the silhouette at the 15° elevation),
  // the rim ring and the base's footprint.
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const z of [BOARD.front, BOARD.front - BOARD.thickness]) {
    pts.push(new Vector3(HOOP_ROOT.x + (sx * BOARD.width) / 2, BOARD.centerY + (sy * BOARD.height) / 2, HOOP_ROOT.z + z));
  }
  const dirs = Array.from({ length: 16 }, (_, i) => [Math.cos((i / 16) * Math.PI * 2), Math.sin((i / 16) * Math.PI * 2)] as const);
  const ring = RIM.innerRadius + 2 * RIM.tube;
  for (const [cx, sz] of dirs) pts.push(new Vector3(RIM_CENTER.x + cx * ring, RIM_CENTER.y, RIM_CENTER.z + sz * ring));
  for (const sx of [-1, 1]) for (const z of [STAND.base.front, STAND.base.back]) {
    pts.push(new Vector3(HOOP_ROOT.x + sx * STAND.base.halfWidth, 0, HOOP_ROOT.z + z), new Vector3(HOOP_ROOT.x + sx * STAND.base.halfWidth, STAND.base.height, HOOP_ROOT.z + z));
  }
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
 * Spec revision #9: blend through guest-ready wherever a straight blend is clean, and cut where it
 * would pass the ball through the rim, net, board, arms, pole or base, or while the ball is still
 * playing out its physics after the sequence (`tail`: a blend would first snap it to rest). The
 * net keeps swinging through either (`SportsScene.refresh` carries its motion over the director's
 * settle), so it answers the ball leaving it.
 */
export function sportsInterruptCut(ball: Vector3, tail: boolean): boolean {
  return tail || blendClearance(ball) < BALL_R + BLEND_MARGIN;
}

/**
 * Contact-blob falloff height. With the key's shadow map on (Normal/High) the cast shadow already
 * shows an airborne ball's height, so the blob only anchors contact and is gone within a
 * third of a unit; without it (Low) the blob is the only shadow and fades slowly.
 */
export const BLOB_FALLOFF = { withKeyShadow: 0.35, alone: 1.6 } as const;

/** Where the ball's time stands for the net: the sequence (or tail) and its time. */
interface Clock {
  seq: SequenceName;
  t: number;
}

export class SportsScene implements SceneInstance {
  readonly category = 'sports' as const;
  readonly root: Object3D;
  readonly bounds: Box3;
  /** Silhouette of the objects on stage at guest-ready: the v1.4 framing rule's hero. */
  readonly heroPoints: Vector3[];
  readonly durations = DURATIONS;
  readonly animatedNodes: Object3D[];
  readonly studio = { wallZ: SPORTS_WALL_Z };
  readonly framePoints = sportsFramePoints();

  private readonly frame = newFrame();
  private preset: BallPreset;
  private shadowHeight = 0;
  private shadowSpread = 1;
  /** The sequence the director is sampling (cleared by any pose or settle). */
  private sampling: Clock | null = null;
  /** The tail: the sequence's physics after its duration, played by `simulate`. */
  private tail: Clock | null = null;
  /** The ball's time as the net last saw it (the net steps through the ball's path, not frame to frame). */
  private netClock: Clock | null = null;
  /**
   * The net's and the hoop springs' motion as the last `settle()` found it. An interruption (the
   * director's cut or blend) settles and then calls `refresh()`, which restores it: the net keeps
   * swinging through a change of mind. Reduced motion, a replay or a reset never refresh, so there
   * the net stays snapped to rest. Dropped by the next sample or step.
   */
  private carry: { net: ReturnType<NetSim['save']>; springs: ReturnType<HoopSprings['save']> } | null = null;
  private readonly contact: BallContact = { center: new Vector3(), previous: new Vector3() };

  constructor(readonly rig: SportsRig, config: Extract<SceneConfig, { category: 'sports' }>) {
    this.root = rig.root;
    this.bounds = rig.bounds.clone();
    this.preset = config.ball;
    const n = rig.nodes;
    // The blend interpolates the ball's path, the squash and the spin (ball_mesh carries the spin
    // over the master's rest orientation; ball_secondary only squashes).
    this.animatedNodes = [n.ball_authored!, n.ball_secondary!, n.ball_mesh!];
    // The blob's opacity depends on whether this render has the key's shadow map: decided per draw.
    rig.ballShadow.onBeforeRender = (renderer) => {
      if (renderer.shadowMap.enabled) this.shadeBlob(BLOB_FALLOFF.withKeyShadow);
    };
    this.pose('guest-ready');
    this.heroPoints = silhouettePoints(this.root);
  }

  setConfig(config: SceneConfig): void {
    if (config.category !== 'sports' || config.ball === this.preset) return;
    this.preset = config.ball;
    this.rig.setPreset(config.ball);
  }

  /**
   * A canonical pose. The director ends a sequence by posing its final pose right after sampling
   * it: then the ball plays on through its tail (the rest of its physics) in `simulate`, and the
   * net keeps moving; `settle()` snaps both. Any other pose places the ball at once.
   */
  pose(pose: CanonicalPose): void {
    const s = this.sampling;
    this.sampling = null;
    if (s && pose === finalPose(s.seq) && REST_AT[s.seq] > DURATIONS[s.seq] + 1e-6) {
      this.tail = { seq: s.seq, t: DURATIONS[s.seq] };
      this.apply(sampleTrack(s.seq, this.tail.t, this.frame));
      return;
    }
    this.tail = null;
    this.netClock = null;
    this.apply(frameFor(pose, this.frame));
  }

  sample(sequence: SequenceName, t: number): void {
    this.carry = null;
    // A new run of a sequence starts the net's view of the ball afresh.
    if (!this.netClock || this.netClock.seq !== sequence || t < this.netClock.t - 1e-6 || this.tail) this.netClock = { seq: sequence, t };
    this.tail = null;
    this.sampling = { seq: sequence, t };
    this.apply(sampleSequence(sequence, t, this.frame));
  }

  /** The continuous channel: the tail, the net (stepping along the ball's own path) and the hoop springs. */
  simulate(dt: number): void {
    this.carry = null;
    if (this.tail) {
      this.tail.t = Math.min(this.tail.t + dt, REST_AT[this.tail.seq]);
      this.apply(sampleTrack(this.tail.seq, this.tail.t, this.frame));
      if (this.tail.t >= REST_AT[this.tail.seq]) this.tail = null;
    }
    const net = this.rig.net;
    if (!net) return;
    const target = this.tail ?? this.sampling;
    const c = this.contact;
    if (target && this.netClock && this.netClock.seq === target.seq) {
      // Step the ball along its track by dt (never past where the director has it).
      const t0 = Math.max(this.netClock.t, target.t - 0.1);
      const t1 = Math.min(target.t, t0 + dt);
      this.ballInNet(sampleTrack(target.seq, t0, this.scratch).ballPos, c.previous);
      this.ballInNet(sampleTrack(target.seq, t1, this.scratch).ballPos, c.center);
      this.netClock.t = t1;
    } else {
      this.ballInNet(this.rig.nodes.ball_authored!.position, c.center);
      c.previous.copy(c.center);
    }
    const wasSettled = net.sim.settled;
    net.sim.step(dt, c);
    this.rig.springs.step(dt, net.sim.settled ? 0 : net.sim.hookTorqueRim, net.sim.settled ? 0 : net.sim.hookTorqueBoard);
    this.rig.recoil.set(this.rig.springs.board, this.rig.springs.rim);
    if (!(wasSettled && net.sim.settled)) net.skin.update();
  }
  private readonly scratch = newFrame();

  settling(): boolean {
    return this.tail !== null || !(this.rig.net?.sim.settled ?? true) || !this.rig.springs.settled;
  }

  /** Snap everything to rest: the tail to its end (the canonical pose), the net to its hanging pose, the hoop to rest. */
  settle(): void {
    if (this.tail) this.apply(sampleTrack(this.tail.seq, REST_AT[this.tail.seq], this.frame));
    this.tail = null;
    this.sampling = null;
    this.netClock = null;
    const net = this.rig.net;
    this.carry = net && !net.sim.settled ? { net: net.sim.save(), springs: this.rig.springs.save() } : null;
    if (net) {
      net.sim.settle();
      net.skin.update();
    }
    this.rig.springs.settle();
    this.rig.recoil.set(0, 0);
  }

  /** Interruptions: the net's motion carries over the director's settle; the shadow follows the drawn ball. */
  refresh(): void {
    const net = this.rig.net;
    if (this.carry && net) {
      net.sim.restore(this.carry.net);
      this.rig.springs.restore(this.carry.springs);
      this.rig.recoil.set(this.rig.springs.board, this.rig.springs.rim);
      net.skin.update();
    }
    this.carry = null;
    const n = this.rig.nodes;
    this.updateShadow(n.ball_authored!.position, 1 - n.ball_secondary!.scale.y);
  }

  /** Cut where a straight blend from the ball's current position would cross the hoop, or during a tail. */
  interruptCut(): boolean {
    return sportsInterruptCut(this.rig.nodes.ball_authored!.position, this.tail !== null);
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

  private readonly _o = new Vector3();
  /** Ball centre (sports_root space) → net space (the net rides the rim's and board's recoil). */
  private ballInNet(p: Vector3, out: Vector3): Vector3 {
    const { board, rim } = this.rig.springs;
    recoilPoint(RIM_LOCAL, board, rim, this._o);
    out.copy(p).sub(HOOP_ROOT).sub(this._o);
    const a = -(board + rim), c = Math.cos(a), s = Math.sin(a);
    return out.set(out.x, out.y * c - out.z * s, out.y * s + out.z * c);
  }

  private apply(f: SportsFrame): void {
    const n = this.rig.nodes;
    n.ball_authored!.position.copy(f.ballPos);
    // Squash (volume-preserving, along the floor normal) on ball_secondary, which never rotates,
    // so its scale axis stays the contact normal while the ball spins inside it.
    const sv = 1 - f.squash, sh = 1 / Math.sqrt(sv);
    n.ball_secondary!.scale.set(sh, sv, sh);
    n.ball_mesh!.quaternion.multiplyQuaternions(f.ballRot, this.rig.ballRest);
    this.updateShadow(f.ballPos, f.squash);
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
    const gltf = await new GLTFLoader().parseAsync(await fetchGlb(glbUrl, signal), '');
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
