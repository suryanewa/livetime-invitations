import { Box3, type Camera, type Object3D, Vector3, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import glbUrl from '../../../assets/scenes/sports/sports.glb?url';
import {
  BALL_AT, BALL_R, BOARD, HOOP_ROOT, NET, NET_OPEN_RADIUS, NET_STRETCH, netRestRadius, POLE, RIM, RIM_CENTER, rigSports, SPORTS_WALL_Z, type BallPreset, type SportsRig,
} from '../../../models/sports.ts';
import { bindMaterialsByName } from '../../../models/types.ts';
import { disposeImported, loadMaterialVariants, prepareImported, setImportedLowDetail } from '../../../models/imported.ts';
import type { SceneInstance, SceneLoadContext, SceneModule } from '../../core/sequence.ts';
import type { CanonicalPose, SceneConfig, SequenceName } from '../../core/types.ts';
import { DURATIONS, frameFor, newFrame, sampleSequence, type SportsFrame } from './sequences.ts';

/** Silhouette samples of every Sports path: the hoop, the pass, the made shot and the airball. */
export function sportsFramePoints(sequences: readonly SequenceName[] = ['host', 'accept', 'decline']): Vector3[] {
  const pts: Vector3[] = [];
  const sphere = (c: Vector3) => {
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
      pts.push(new Vector3(c.x + dx * BALL_R, c.y + dy * BALL_R, c.z + dz * BALL_R));
    }
  };
  const f = newFrame();
  for (const seq of sequences) {
    for (let t = 0; t <= DURATIONS[seq] + 1e-9; t += 0.02) sphere(sampleSequence(seq, t, f).ballPos.clone());
  }
  sphere(BALL_AT.host);
  // Hoop: board corners, rim ring, net bottom, pole base.
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) pts.push(new Vector3(HOOP_ROOT.x + (sx * BOARD.width) / 2, BOARD.centerY + (sy * BOARD.height) / 2, HOOP_ROOT.z + BOARD.front));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const ring = RIM.innerRadius + 2 * RIM.tube;
    pts.push(new Vector3(RIM_CENTER.x + Math.cos(a) * ring, RIM_CENTER.y, RIM_CENTER.z + Math.sin(a) * ring));
    // The net's bottom, opened and stretched (made shot).
    const open = NET_OPEN_RADIUS + 0.05, low = NET.depth * (1 + NET_STRETCH);
    pts.push(new Vector3(RIM_CENTER.x + Math.cos(a) * open, RIM_CENTER.y - low, RIM_CENTER.z + Math.sin(a) * open));
    pts.push(new Vector3(HOOP_ROOT.x + Math.cos(a) * POLE.baseRadius, 0, HOOP_ROOT.z + POLE.z + Math.sin(a) * POLE.baseRadius));
  }
  return pts;
}

// ── Interruption: blend (≤150 ms) unless the straight path would cross the hoop ──────
const BOARD_BOX = new Box3(
  new Vector3(HOOP_ROOT.x - BOARD.width / 2, BOARD.centerY - BOARD.height / 2, HOOP_ROOT.z + BOARD.front - BOARD.thickness),
  new Vector3(HOOP_ROOT.x + BOARD.width / 2, BOARD.centerY + BOARD.height / 2, HOOP_ROOT.z + BOARD.front),
);
/** Rim tube centre radius (the master's ring). */
const RING_R = RIM.innerRadius + RIM.tube;
/**
 * The net as a shell of revolution: from its measured inner envelope (NET.profile) outwards by
 * 2 × NET_SHELL (cords, knots and the far side of each diamond).
 */
const NET_SHELL = 0.03;
const netMid = (t: number) => netRestRadius(t) + NET_SHELL;
/** Pole base plate height above the floor. */
const POLE_BASE_H = 0.07;
/** Surface gap the ball must keep from every hoop part along a blend. */
export const BLEND_MARGIN = 0.05;

/** Distance from point p to the nearest hoop surface: rim tube, net, backboard or pole. */
export function hoopDistance(p: Vector3): number {
  const r = Math.hypot(p.x - RIM_CENTER.x, p.z - RIM_CENTER.z);
  const dy = p.y - RIM_CENTER.y;
  let d = Math.hypot(r - RING_R, dy) - RIM.tube;
  // The net is a surface of revolution: its nearest point lies in p's meridian plane.
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    d = Math.min(d, Math.hypot(r - netMid(t), dy + NET.depth * t) - NET_SHELL);
  }
  d = Math.min(d, BOARD_BOX.distanceToPoint(p));
  const pr = Math.hypot(p.x - HOOP_ROOT.x, p.z - (HOOP_ROOT.z + POLE.z));
  d = Math.min(d, Math.hypot(Math.max(0, pr - POLE.radius), Math.max(0, p.y - POLE.top)));
  d = Math.min(d, Math.hypot(Math.max(0, pr - POLE.baseRadius), Math.max(0, p.y - POLE_BASE_H)));
  return d;
}

/** Closest approach of the ball centre to the hoop along the straight blend from `from` to `to`. */
export function blendClearance(from: Vector3, to: Vector3 = BALL_AT.guest, samples = 32): number {
  const p = new Vector3();
  let min = Infinity;
  for (let i = 0; i <= samples; i++) min = Math.min(min, hoopDistance(p.lerpVectors(from, to, i / samples)));
  return min;
}

/**
 * Spec revision #9: blend through guest-ready wherever a straight blend is clean, and cut only
 * where it would pass the ball through the rim, net, board or pole, or while the net is moving
 * (a blend would snap it to rest).
 */
export function sportsInterruptCut(ball: Vector3, f: Pick<SportsFrame, 'netFlare' | 'netStretch'>): boolean {
  return f.netFlare !== 0 || f.netStretch !== 0 || blendClearance(ball) < BALL_R + BLEND_MARGIN;
}

/**
 * Contact-blob falloff height. With the key's shadow map on (Normal/High) the cast shadow already
 * shows an airborne ball's height, so the blob only anchors contact and is gone within a
 * third of a unit; without it (Low) the blob is the only shadow and fades slowly.
 */
export const BLOB_FALLOFF = { withKeyShadow: 0.35, alone: 1.6 } as const;

export class SportsScene implements SceneInstance {
  readonly category = 'sports' as const;
  readonly root: Object3D;
  readonly bounds: Box3;
  readonly durations = DURATIONS;
  readonly animatedNodes: Object3D[];
  readonly studio = { wallZ: SPORTS_WALL_Z };
  readonly framePoints = sportsFramePoints();

  private readonly frame = newFrame();
  private preset: BallPreset;
  private shadowHeight = 0;

  constructor(readonly rig: SportsRig, config: Extract<SceneConfig, { category: 'sports' }>) {
    this.root = rig.root;
    this.bounds = rig.bounds.clone();
    this.preset = config.ball;
    const n = rig.nodes;
    this.animatedNodes = [n.ball_authored!, n.ball_secondary!];
    // The blob's opacity depends on whether this render has the key's shadow map: decided per draw.
    rig.ballShadow.onBeforeRender = (renderer) => {
      if (renderer.shadowMap.enabled) rig.ballShadow.setHeight(this.shadowHeight, BLOB_FALLOFF.withKeyShadow);
    };
    this.pose('guest-ready');
  }

  setConfig(config: SceneConfig): void {
    if (config.category !== 'sports' || config.ball === this.preset) return;
    this.preset = config.ball;
    this.rig.setPreset(config.ball);
  }

  pose(pose: CanonicalPose): void {
    this.apply(frameFor(pose, this.frame));
  }

  sample(sequence: SequenceName, t: number): void {
    this.apply(sampleSequence(sequence, t, this.frame));
  }

  /** Interruption blends move the ball directly: the net rests, the shadow follows. */
  refresh(): void {
    this.rig.net.update(0, 0);
    this.updateShadow(this.rig.nodes.ball_authored!.position);
  }

  /** Cut only where a straight blend from the ball's current position would cross the hoop. */
  interruptCut(): boolean {
    return sportsInterruptCut(this.rig.nodes.ball_authored!.position, this.frame);
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
    n.ball_secondary!.quaternion.copy(f.ballRot);
    this.rig.net.update(f.netFlare, f.netStretch);
    this.updateShadow(f.ballPos);
  }

  private updateShadow(ball: Vector3): void {
    // Tight and dark on the floor; wider and fainter as the ball rises, never stuck to it. This is
    // the Low-tier falloff; renders with the key's shadow map fade it faster (onBeforeRender).
    const s = this.rig.ballShadow;
    s.setFootprint(ball.x, ball.z);
    this.shadowHeight = Math.max(0, ball.y - BALL_R);
    s.setHeight(this.shadowHeight, BLOB_FALLOFF.alone);
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
    return new SportsScene(rigSports(root, library, config.ball, variants), config);
  },
};
