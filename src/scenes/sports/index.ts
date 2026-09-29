import { Box3, type Camera, type Object3D, Vector3, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import glbUrl from '../../../assets/scenes/sports/sports.glb?url';
import { BALL_AT, BALL_R, BOARD, HOOP_ROOT, NET, POLE, RIM_CENTER, rigSports, type BallPreset, type SportsRig } from '../../../models/sports.ts';
import { bindMaterialsByName } from '../../../models/types.ts';
import type { SceneInstance, SceneLoadContext, SceneModule } from '../../core/sequence.ts';
import type { CanonicalPose, SceneConfig, SequenceName } from '../../core/types.ts';
import { DURATIONS, frameFor, newFrame, sampleSequence, type SportsFrame } from './sequences.ts';

/** Silhouette samples of every Sports path: the hoop, the pass, the made shot and the airball. */
export function sportsFramePoints(): Vector3[] {
  const pts: Vector3[] = [];
  const sphere = (c: Vector3) => {
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
      pts.push(new Vector3(c.x + dx * BALL_R, c.y + dy * BALL_R, c.z + dz * BALL_R));
    }
  };
  const f = newFrame();
  for (const seq of ['host', 'accept', 'decline'] as const) {
    for (let t = 0; t <= DURATIONS[seq] + 1e-9; t += 0.02) sphere(sampleSequence(seq, t, f).ballPos.clone());
  }
  sphere(BALL_AT.host);
  // Hoop: board corners, rim ring, net bottom, pole base.
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) pts.push(new Vector3(HOOP_ROOT.x + (sx * BOARD.width) / 2, BOARD.centerY + (sy * BOARD.height) / 2, HOOP_ROOT.z + BOARD.front));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    pts.push(new Vector3(RIM_CENTER.x + Math.cos(a) * 0.42, RIM_CENTER.y, RIM_CENTER.z + Math.sin(a) * 0.42));
    pts.push(new Vector3(RIM_CENTER.x + Math.cos(a) * NET.bottomRadius * 1.3, RIM_CENTER.y - NET.depth * 1.3, RIM_CENTER.z + Math.sin(a) * NET.bottomRadius * 1.3));
    pts.push(new Vector3(HOOP_ROOT.x + Math.cos(a) * POLE.baseRadius, 0, HOOP_ROOT.z + POLE.z + Math.sin(a) * POLE.baseRadius));
  }
  return pts;
}

export class SportsScene implements SceneInstance {
  readonly category = 'sports' as const;
  readonly root: Object3D;
  readonly bounds: Box3;
  readonly durations = DURATIONS;
  readonly animatedNodes: Object3D[];
  readonly framePoints = sportsFramePoints();

  private readonly frame = newFrame();
  private preset: BallPreset;

  constructor(readonly rig: SportsRig, config: Extract<SceneConfig, { category: 'sports' }>) {
    this.root = rig.root;
    this.bounds = rig.bounds.clone();
    this.preset = config.ball;
    const n = rig.nodes;
    this.animatedNodes = [n.ball_authored!, n.ball_secondary!];
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

  async precompile(renderer: WebGLRenderer, camera: Camera): Promise<void> {
    const scene = this.root.parent ?? this.root;
    await renderer.compileAsync(scene, camera);
    this.rig.setPreset(this.preset === 'orange' ? 'cream' : 'orange');
    await renderer.compileAsync(scene, camera);
    this.rig.setPreset(this.preset);
  }

  dispose(): void {
    this.rig.dispose();
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
    // Tight and dark on the floor; wider and fainter as the ball rises, never stuck to it.
    const s = this.rig.ballShadow;
    s.setFootprint(ball.x, ball.z);
    s.setHeight(Math.max(0, ball.y - BALL_R), 1.6);
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
    root.removeFromParent();
    bindMaterialsByName(root, library);
    return new SportsScene(rigSports(root, library, config.ball), config);
  },
};
