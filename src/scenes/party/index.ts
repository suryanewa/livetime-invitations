import { Box3, type Camera, type Object3D, Quaternion, Vector3, type WebGLRenderer } from 'three';
import glbUrl from '../../../assets/scenes/party/party.glb?url';
import {
  armPoint, FRAME_MARGIN_X, LID, LID_CLOSED_BOX, PLATTER, PLATTER_TOP, PLAYER, RECORD, rigRecordPlayer, setStatusLit, TONEARM, type RecordLabel, type RecordPlayerRig,
} from '../../../models/recordPlayer.ts';
import { bindMaterialsByName } from '../../../models/types.ts';
import { disposeImported, gltfLoader, loadMaterialVariants, prepareImported, setImportedLowDetail } from '../../../models/imported.ts';
import { silhouettePoints } from '../../render/framing.ts';
import type { SceneInstance, SceneLoadContext, SceneModule } from '../../core/sequence.ts';
import type { CanonicalPose, SceneConfig, SequenceName } from '../../core/types.ts';
import type { MaterialLibrary } from '../../render/materials.ts';
import { ARM, DURATIONS, STATUS_COLOUR } from './poses.ts';
import {
  ACCEPT_PLATTER, ACCEPTED_AT, blendLift, type Change, cueLever, cueRise, frameFor, newFrame, type Platter, platterAt, platterFor, playingFrame, recordHeight, sampleSequence, type PartyFrame,
} from './sequences.ts';

/**
 * Silhouette samples of every Party path for the camera fit: the plinth, the dust cover open and
 * closed (its extended shell), the hovering and lowering record, and the arm from rest to playing.
 */
export function partyFramePoints(): Vector3[] {
  const pts: Vector3[] = [];
  const hx = PLAYER.width / 2, hz = PLAYER.depth / 2;
  for (const x of [-hx, hx]) for (const z of [-hz, hz]) for (const y of [0, PLAYER.deck]) pts.push(new Vector3(x, y, z));
  // The side margin: the stage breathes round the plinth as it did in v1.1.
  const mx = hx + FRAME_MARGIN_X;
  for (const x of [-mx, mx]) for (const z of [-hz, hz]) for (const y of [0, PLAYER.deck]) pts.push(new Vector3(x, y, z));
  // Lid: the extended closed box's corners turned about the hinge, open and closed.
  const box = LID_CLOSED_BOX;
  for (const angle of [LID.open, LID.closed]) {
    const c = Math.cos(angle), s = Math.sin(angle);
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const dy = y - LID.hinge.y, dz = z - LID.hinge.z;
      pts.push(new Vector3(x, LID.hinge.y + dy * c - dz * s, LID.hinge.z + dy * s + dz * c));
    }
  }
  // Record: rim samples along the host path (tilted about x at its bottom centre).
  const f = newFrame();
  for (let t = 0; t <= DURATIONS.host + 1e-9; t += 0.05) {
    sampleSequence('host', t, f);
    const c = Math.cos(f.recordTilt), s = Math.sin(f.recordTilt);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const lx = Math.cos(a) * RECORD.radius, lz = Math.sin(a) * RECORD.radius;
      pts.push(new Vector3(f.recordPos.x + lx, f.recordPos.y - lz * s, f.recordPos.z + lz * c));
    }
  }
  // Arm: headshell and counterweight ends, parked and playing.
  for (const yaw of [ARM.parked, ARM.played]) {
    pts.push(armPoint(yaw, 0, 0, 0, TONEARM.length + 0.05), armPoint(yaw, 0, 0, 0, -0.25));
  }
  pts.push(new Vector3(PLATTER.x, PLATTER_TOP, PLATTER.z + PLATTER.radius));
  return pts;
}

export class PartyScene implements SceneInstance {
  readonly category = 'party' as const;
  readonly root: Object3D;
  readonly bounds: Box3;
  /** Silhouette of the objects on stage at guest-ready: the v1.4 framing rule's hero. */
  readonly heroPoints: Vector3[];
  readonly durations = DURATIONS;
  readonly animatedNodes: Object3D[];
  readonly framePoints = partyFramePoints();

  private readonly frame = newFrame();
  private readonly scratch = newFrame();
  private label: RecordLabel;
  private lit: boolean | null = null;
  private readonly lever = new Quaternion();
  /** What is showing: the sequence last sampled and its time (null once a pose is set). */
  private sequence: SequenceName | null = null;
  private t = 0;
  /** The change of mind the current sequence starts from (sequences.ts `Change`), if any. */
  private change: Change | null = null;
  /** Planned by `interruptCut`, kept through the director's cut (settle, pose guest-ready) until the next sample. */
  private pendingChange: Change | null = null;
  /**
   * The record playing on after acceptance (v1.5): the acceptance's platter model and the time
   * since the clip's end, advanced by `simulate`. The angle is the closed form at DURATIONS.accept +
   * `since`, so the clip hands over with no step in angle, speed or acceleration.
   */
  private playing: { platter: Platter; since: number } | null = null;

  constructor(readonly rig: RecordPlayerRig, config: Extract<SceneConfig, { category: 'party' }>, _library?: MaterialLibrary) {
    this.root = rig.root;
    this.bounds = rig.bounds.clone();
    this.label = config.label;
    const n = rig.nodes;
    this.animatedNodes = [n.record_authored!, n.record_secondary!, n.platter!, n.tonearm_pivot!, n.tonearm_lift!, n.lid_hinge!];
    this.pose('guest-ready');
    this.heroPoints = silhouettePoints(this.root);
  }

  setConfig(config: SceneConfig): void {
    if (config.category !== 'party' || config.label === this.label) return;
    this.label = config.label;
    this.rig.setLabel(config.label);
  }

  /**
   * A canonical pose. `accepted` is the record playing at its display angle with the lead-in done
   * (ACCEPTED_AT into acceptance; it keeps turning in `simulate`). Reached from a played acceptance
   * (the director's end of the clip), the record plays on from where the clip left it instead (the
   * lead-in still carrying the arm in): the clip's own platter model, `since` the clip's end
   * counted from the last sampled time, so the next simulate steps land exactly on the clock.
   * Every snap (reduced motion, a late load, a reset) calls `settle()` next, which re-bases it on
   * the canonical pose.
   */
  pose(pose: CanonicalPose): void {
    const pending = pose === 'guest-ready' ? this.pendingChange : null;
    this.playing = pose !== 'accepted' ? null
      : this.sequence === 'accept' ? { platter: platterFor('accept', this.change), since: this.t - DURATIONS.accept }
      : { platter: ACCEPT_PLATTER, since: ACCEPTED_AT - DURATIONS.accept };
    this.sequence = null;
    this.change = null;
    this.pendingChange = pending;
    this.apply(this.playing ? playingFrame(this.playing.platter, DURATIONS.accept + Math.max(0, this.playing.since), this.frame) : frameFor(pose, this.frame));
  }

  sample(sequence: SequenceName, t: number): void {
    // The director's cut after `interruptCut` lands here at t = 0: the change takes over.
    if (this.pendingChange && this.sequence === null && t === 0 && sequence !== 'host') this.change = this.pendingChange;
    else if (this.sequence !== sequence) this.change = null;
    this.pendingChange = null;
    this.playing = null;
    this.sequence = sequence;
    this.t = t;
    this.apply(sampleSequence(sequence, t, this.frame, this.change));
  }

  /** The record plays on: only the time since the clip's end advances (fixed steps sum to the frame's clock delta). */
  simulate(dt: number): void {
    if (this.playing) this.playing.since += dt;
  }

  /** True while the record plays: the loop keeps drawing it (the controller pauses it off-screen). */
  settling(): boolean {
    return this.playing !== null;
  }

  /**
   * Snap: a playing record re-bases on the canonical accepted pose (the record at its display angle,
   * the lead-in done, ACCEPTED_AT into acceptance) and plays on from there; nothing else is secondary.
   */
  settle(): void {
    if (!this.playing) return;
    this.playing = { platter: ACCEPT_PLATTER, since: ACCEPTED_AT - DURATIONS.accept };
    this.apply(playingFrame(ACCEPT_PLATTER, ACCEPTED_AT, this.frame));
  }

  beforeRender(): void {
    if (this.playing) this.apply(playingFrame(this.playing.platter, DURATIONS.accept + this.playing.since, this.frame));
  }

  /**
   * A change of mind: the scene always draws the hand-over itself (sequences.ts `changed`) and asks
   * the director for its 0 ms cut. It records the pose on screen with its velocities; the new
   * outcome's clip starts from it. The director's straight 150 ms blend would spin a playing record
   * backwards by up to half a turn, whip the arm home and step every velocity.
   */
  interruptCut(): boolean {
    if (this.sequence === 'host') return false;
    this.pendingChange = this.captureChange();
    return true;
  }

  /** The pose on screen and its velocities (pure: from the composed frame at t and just before). */
  private captureChange(): Change {
    const f = this.frame;
    if (this.playing) {
      const p = platterAt(this.playing.platter, DURATIONS.accept + this.playing.since);
      return { armYaw: f.armYaw, armYawRate: 0, armPitch: f.armPitch, armPitchRate: 0, lid: f.lid, lidRate: 0, angle: p.angle, speed: p.speed };
    }
    const seq = this.sequence;
    if (!seq) {
      // A canonical pose (declined, or accepted under reduced motion): at rest, the record where the pose shows it.
      return { armYaw: f.armYaw, armYawRate: 0, armPitch: f.armPitch, armPitchRate: 0, lid: f.lid, lidRate: 0, angle: -f.spin, speed: 0 };
    }
    const h = 1 / 240;
    const now = sampleSequence(seq, this.t, this.scratch, this.change);
    const [yaw, pitch, lid] = [now.armYaw, now.armPitch, now.lid];
    const before = sampleSequence(seq, Math.max(0, this.t - h), this.scratch, this.change);
    const dt = this.t >= h ? h : Math.max(this.t, 1e-9);
    const p = platterAt(platterFor(seq, this.change), this.t);
    return {
      armYaw: yaw, armYawRate: this.t > 0 ? (yaw - before.armYaw) / dt : 0,
      armPitch: pitch, armPitchRate: this.t > 0 ? (pitch - before.armPitch) / dt : 0,
      lid, lidRate: this.t > 0 ? (lid - before.lid) / dt : 0,
      angle: p.angle, speed: p.speed,
    };
  }

  /**
   * Interruption blends move nodes directly: raise the stylus in transit, follow with the cueing
   * parts, sync the shadow. Keeps the more-lifted of the blended pitch and the yaw-derived ceiling
   * (negative is up), so an arm caught mid-lift never drops in one frame and never drags.
   */
  refresh(): void {
    const n = this.rig.nodes;
    const lift = n.tonearm_lift!;
    lift.rotation.x = Math.min(lift.rotation.x, blendLift(n.tonearm_pivot!.rotation.y));
    this.cueing(lift.rotation.x);
    this.updateShadow(n.record_authored!.position.y - PLATTER_TOP);
  }

  /** Low tier for the imported turntable materials (normal and clearcoat-normal maps off). */
  setLowDetail(enabled: boolean): void {
    setImportedLowDetail(this.root, enabled);
  }

  async precompile(renderer: WebGLRenderer, camera: Camera): Promise<void> {
    // Warm both label variants and the lit status key (uniform changes only).
    const other: RecordLabel = this.label === 'coral' ? 'cobalt' : 'coral';
    const scene = this.root.parent ?? this.root;
    await renderer.compileAsync(scene, camera);
    this.rig.setLabel(other);
    await renderer.compileAsync(scene, camera);
    this.rig.setLabel(this.label);
  }

  dispose(): void {
    this.rig.dispose();
    disposeImported(this.root);
    this.root.traverse((o) => (o as { geometry?: { dispose(): void } }).geometry?.dispose());
    this.root.removeFromParent();
  }

  // ── internals ─────────────────────────────────────────────────────────────
  private apply(f: PartyFrame): void {
    const n = this.rig.nodes;
    n.record_authored!.position.copy(f.recordPos);
    n.record_authored!.rotation.set(f.recordTilt, 0, 0);
    n.record_secondary!.rotation.set(f.wobble, f.spin, f.wobbleZ);
    n.platter!.rotation.set(0, f.spin, 0);
    n.tonearm_pivot!.rotation.set(0, f.armYaw, 0);
    n.tonearm_lift!.rotation.set(f.armPitch, 0, 0);
    n.lid_hinge!.rotation.set(f.lid, 0, 0);
    this.cueing(f.armPitch);
    this.setStatus(f.status === 'lit');
    this.updateShadow(recordHeight(f));
  }

  /** Cue lever and lift platform follow the arm's lift. */
  private cueing(pitch: number): void {
    const n = this.rig.nodes;
    n.cue_lever!.quaternion.copy(this.rig.leverRest).multiply(this.lever.setFromAxisAngle(Z, cueLever(pitch)));
    n.cue_lift!.position.copy(this.rig.liftRest);
    n.cue_lift!.position.y += cueRise(pitch);
  }

  private updateShadow(height: number): void {
    // Tight and dark at contact, wide and faint while the record is presented.
    this.rig.recordShadow.setHeight(Math.max(0, height), 0.9);
  }

  private setStatus(lit: boolean): void {
    if (lit === this.lit) return;
    this.lit = lit;
    setStatusLit(this.rig.statusMaterial, lit, STATUS_COLOUR);
  }
}

const Z = new Vector3(0, 0, 1);

async function fetchGlb(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw Object.assign(new Error(`asset ${res.status}`), { reason: 'asset-failure' as const });
  return res.arrayBuffer();
}

export const partyScene: SceneModule = {
  category: 'party',
  async load({ config, library, signal }: SceneLoadContext): Promise<SceneInstance> {
    if (config.category !== 'party') throw new Error('party scene given another config');
    const gltf = await gltfLoader().parseAsync(await fetchGlb(glbUrl, signal), '');
    const root = gltf.scene.getObjectByName('party_root');
    if (!root) throw Object.assign(new Error('missing party_root'), { reason: 'asset-failure' as const });
    // Label presets live in the GLB (KHR_materials_variants); read them before detaching the root.
    const variants = await loadMaterialVariants(gltf);
    root.removeFromParent();
    bindMaterialsByName(root, library);
    prepareImported(root, library, variants.materials);
    const rig = rigRecordPlayer(root, library, config.label, variants);
    // The rig's own status-key material (a clone of the master's aluminium) joins the registry.
    prepareImported(root, library);
    return new PartyScene(rig, config, library);
  },
};
