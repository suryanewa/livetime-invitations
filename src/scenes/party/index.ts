import { Box3, type Camera, type Object3D, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import glbUrl from '../../../assets/scenes/party/party.glb?url';
import { bindPartyMaterials, PLATTER_TOP, rigRecordPlayer, type RecordLabel, type RecordPlayerRig } from '../../../models/recordPlayer.ts';
import type { SceneInstance, SceneLoadContext, SceneModule } from '../../core/sequence.ts';
import type { CanonicalPose, SceneConfig, SequenceName } from '../../core/types.ts';
import type { MaterialLibrary } from '../../render/materials.ts';
import { DURATIONS, STATUS_COLOUR } from './poses.ts';
import { blendLift, frameFor, newFrame, recordHeight, sampleSequence, type PartyFrame } from './sequences.ts';

export class PartyScene implements SceneInstance {
  readonly category = 'party' as const;
  readonly root: Object3D;
  readonly bounds: Box3;
  readonly durations = DURATIONS;
  readonly animatedNodes: Object3D[];

  private readonly frame = newFrame();
  private readonly lift: Object3D;
  private label: RecordLabel;
  private lit = false;

  constructor(readonly rig: RecordPlayerRig, private readonly library: MaterialLibrary, config: Extract<SceneConfig, { category: 'party' }>) {
    this.root = rig.root;
    this.bounds = rig.bounds.clone();
    this.label = config.label;
    const n = rig.nodes;
    this.lift = rig.root.getObjectByName('tonearm_lift') ?? n.tonearm_mesh!;
    this.animatedNodes = [n.record_authored!, n.record_secondary!, n.platter!, n.tonearm_pivot!, this.lift, n.lid_hinge!];
    this.pose('guest-ready');
  }

  setConfig(config: SceneConfig): void {
    if (config.category !== 'party' || config.label === this.label) return;
    this.label = config.label;
    this.rig.setLabel(config.label);
  }

  pose(pose: CanonicalPose): void {
    this.apply(frameFor(pose, this.frame));
  }

  sample(sequence: SequenceName, t: number): void {
    this.apply(sampleSequence(sequence, t, this.frame));
  }

  /** Interruption blends move nodes directly: raise the stylus in transit, sync the shadow. */
  refresh(): void {
    const n = this.rig.nodes;
    this.lift.rotation.x = blendLift(n.tonearm_pivot!.rotation.y);
    this.updateShadow(n.record_authored!.position.y - PLATTER_TOP);
  }

  async precompile(renderer: WebGLRenderer, camera: Camera): Promise<void> {
    // Warm both label variants and the lit status mark (uniform changes only).
    const other: RecordLabel = this.label === 'coral' ? 'cobalt' : 'coral';
    const scene = this.root.parent ?? this.root;
    await renderer.compileAsync(scene, camera);
    this.rig.setLabel(other);
    await renderer.compileAsync(scene, camera);
    this.rig.setLabel(this.label);
  }

  dispose(): void {
    this.rig.dispose();
    this.root.traverse((o) => (o as { geometry?: { dispose(): void } }).geometry?.dispose());
    this.root.removeFromParent();
  }

  // ── internals ─────────────────────────────────────────────────────────────
  private apply(f: PartyFrame): void {
    const n = this.rig.nodes;
    n.record_authored!.position.copy(f.recordPos);
    n.record_authored!.rotation.set(f.recordTilt, 0, 0);
    n.record_secondary!.rotation.set(f.wobble, f.spin, 0);
    n.platter!.rotation.set(0, f.spin, 0);
    n.tonearm_pivot!.rotation.set(0, f.armYaw, 0);
    this.lift.rotation.set(f.armPitch, 0, 0);
    n.lid_hinge!.rotation.set(f.lid, 0, 0);
    this.setStatus(f.status === 'lit');
    this.updateShadow(recordHeight(f));
  }

  private updateShadow(height: number): void {
    // Tight and dark at contact, wide and faint while the record is presented.
    this.rig.recordShadow.setHeight(Math.max(0, height), 0.9);
  }

  private setStatus(lit: boolean): void {
    if (lit === this.lit) return;
    this.lit = lit;
    const m = this.rig.statusMaterial;
    const off = this.library.direction.surfaces.mat_status!;
    m.color.set(lit ? STATUS_COLOUR : off.color);
    m.emissive.set(lit ? STATUS_COLOUR : '#000000');
    m.emissiveIntensity = lit ? 1.1 : 0;
  }
}

async function fetchGlb(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw Object.assign(new Error(`asset ${res.status}`), { reason: 'asset-failure' as const });
  return res.arrayBuffer();
}

export const partyScene: SceneModule = {
  category: 'party',
  async load({ config, library, signal }: SceneLoadContext): Promise<SceneInstance> {
    if (config.category !== 'party') throw new Error('party scene given another config');
    const buffer = await fetchGlb(glbUrl, signal);
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    const root = gltf.scene.getObjectByName('party_root');
    if (!root) throw Object.assign(new Error('missing party_root'), { reason: 'asset-failure' as const });
    root.removeFromParent();
    bindPartyMaterials(root, library);
    const rig = rigRecordPlayer(root, library, config.label);
    return new PartyScene(rig, library, config);
  },
};

