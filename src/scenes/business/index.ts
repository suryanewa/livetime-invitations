import { Box3, type Camera, Matrix4, Plane, Quaternion, Raycaster, Vector2, Vector3, type Object3D, type WebGLRenderer } from 'three';
import glbUrl from '../../../assets/scenes/business/business.glb?url';
import { BUSINESS_WORLD_SCALE, CARD, PENDULUM, rigBusiness, type BusinessRig, type CardTemplate, type StatusLit } from '../../../models/business.ts';
import { disposeImported, gltfLoader, loadMaterialVariants, prepareImported, setImportedLowDetail } from '../../../models/imported.ts';
import { keycardBusinessRig, type KeycardRig } from '../../../models/keycard.ts';
import { bindMaterialsByName } from '../../../models/types.ts';
import { silhouettePoints } from '../../render/framing.ts';
import type { SceneInstance, SceneLoadContext, SceneModule, ScenePointer } from '../../core/sequence.ts';
import type { CanonicalPose, SceneConfig, SequenceName } from '../../core/types.ts';
import { ANGLE_EPSILON, Spring } from '../../motion/spring.ts';
import type { MaterialLibrary } from '../../render/materials.ts';
import { clampDragTarget, touchesScanner } from './drag.ts';
import { DURATIONS, SCAN_AT } from './poses.ts';
import {
  applyRecovery, cardRotation, frameFor, HOST_BEATS, newFrame, OUTCOME_BEATS, planRecovery, RECOVER, recoveryFade, sampleSequence, type BusinessFrame, type Recovery,
} from './sequences.ts';

/** Release/cancel blend onto the scanner approach (sub-spec: 350–600 ms). */
const RELEASE_BLEND = 0.45;
/** Where a released card rejoins the authored path: just before the contact beat. */
const APPROACH_T = SCAN_AT - 0.08;
const MAX_TILT = (12 * Math.PI) / 180;

/** Final-beat damping: over the last 0.25 s a 0.5° sway decays to about 0.015°. */
const SWAY_DAMP_WINDOW = 0.25;
const SWAY_DAMP_RATE = 14;
/** Pressed to the glass, friction stops the badge swinging (contact through departure). */
const CONTACT_DAMP_RATE = 18;

export class BusinessScene implements SceneInstance {
  readonly category = 'business' as const;
  readonly root: Object3D;
  readonly bounds: Box3;
  /** Silhouette of the objects on stage at guest-ready: the v1.4 framing rule's hero. */
  readonly heroPoints: Vector3[];
  readonly durations = DURATIONS;
  readonly animatedNodes: Object3D[];
  readonly pointer: ScenePointer;
  readonly rig: BusinessRig;

  private readonly frame = newFrame();
  private readonly scratch = newFrame();
  /**
   * Change of mind (v1.2.2): the scene draws its own hand-over from the pose on screen into the new
   * outcome (sequences.ts applyRecovery). `pendingRecovery` is planned when the director asks
   * `interruptCut()` and survives its cut (settle, pose guest-ready) until the new sequence's first
   * sample; `recovery` is then active for the first RECOVER seconds.
   */
  private recovery: (Recovery & { sequence: SequenceName; lit: StatusLit; level: number }) | null = null;
  private pendingRecovery: (Recovery & { lit: StatusLit; level: number; springs: [number, number, number, number] }) | null = null;
  /**
   * The holder and card are one rigid body swinging on the swivel eye: a physical pendulum at the
   * master card's size (models/businessContract.ts PENDULUM, about 1.8 Hz), lightly damped.
   */
  private readonly swing = new Spring({ frequency: PENDULUM.swingHz, damping: PENDULUM.damping, limit: MAX_TILT, epsilon: ANGLE_EPSILON, maxVelocity: 3 });
  private readonly pitch = new Spring({ frequency: PENDULUM.pitchHz, damping: PENDULUM.damping, limit: MAX_TILT, epsilon: ANGLE_EPSILON, maxVelocity: 3 });
  private sequence: SequenceName | null = null;
  private t = 0;
  private template: CardTemplate;
  private lanyardDirty = true;

  // Optional drag state (never affects the response).
  private dragging = false;
  private readonly dragOffset = new Vector3();
  private releaseLeft = 0;
  private readonly releaseFrom = new Vector3();
  private readonly releaseRot = new Quaternion();
  private seekTo: number | null = null;
  private readonly grab = new Vector3();
  private readonly lastTarget = new Vector3();
  private readonly raycaster = new Raycaster();
  private readonly plane = new Plane(new Vector3(0, 0, 1), 0);
  private readonly rect: [number, number, number, number] = [0, 0, 0, 0];

  constructor(rig: BusinessRig | KeycardRig, library: MaterialLibrary, config: Extract<SceneConfig, { category: 'business' }>) {
    this.rig = 'setStatus' in rig ? rig : keycardBusinessRig(rig, library);
    this.root = this.rig.root;
    this.bounds = this.rig.bounds.clone();
    this.template = config.template;
    const n = this.rig.nodes;
    this.animatedNodes = [n.card_authored!, n.clip_pivot!, n.card_mesh!, n.lanyard_anchor!, ...(this.rig.gate ? [this.rig.gate] : [])];
    this.pointer = this.createPointer();
    this.pose('guest-ready');
    this.heroPoints = silhouettePoints(this.root, (o) => o.name.startsWith('lanyard'));
  }

  setConfig(config: SceneConfig): void {
    if (config.category !== 'business' || config.template === this.template) return;
    this.template = config.template;
    this.rig.setTemplate(config.template);
  }

  pose(pose: CanonicalPose): void {
    // Only the director's cut (pose guest-ready, then the new sequence) carries a planned recovery.
    const pending = pose === 'guest-ready' ? this.pendingRecovery : null;
    this.recovery = null;
    this.sequence = null;
    this.t = 0;
    this.cancelDrag();
    this.settle();
    frameFor(pose, this.frame);
    const lit = pose === 'accepted' ? 'accept' : pose === 'declined' ? 'decline' : 'off';
    this.apply(this.frame, lit);
    this.pendingRecovery = pending;
  }

  /** Authored frame at t, with the change-of-mind recovery while it lasts (pure in t). */
  private authored(sequence: SequenceName, t: number, out: BusinessFrame): BusinessFrame {
    sampleSequence(sequence, t, out);
    const r = this.recovery;
    if (r && r.sequence === sequence && t < RECOVER) applyRecovery(r, t, out);
    return out;
  }

  sample(sequence: SequenceName, t: number): void {
    const pending = this.pendingRecovery;
    this.pendingRecovery = null;
    if (pending && this.sequence === null && t === 0) {
      const { springs, ...r } = pending;
      this.recovery = { ...r, sequence };
      // The sway carries on through the change (the cut's settle() zeroed it).
      [this.swing.x, this.swing.v, this.pitch.x, this.pitch.v] = springs;
      this.swing.settled = this.swing.x === 0 && this.swing.v === 0;
      this.pitch.settled = this.pitch.x === 0 && this.pitch.v === 0;
      this.rig.nodes.card_secondary!.rotation.set(this.pitch.x, 0, this.swing.x);
    }
    if (this.recovery && (this.recovery.sequence !== sequence || t >= RECOVER)) this.recovery = null;
    const prevT = this.sequence === sequence ? this.t : -1;
    this.sequence = sequence;
    this.t = t;
    const f = this.authored(sequence, t, this.frame);
    if (this.dragging || this.releaseLeft > 0) {
      // The strap anchor moves with the dragged clip, so the fixed-length lanyard never stretches.
      f.pivot.add(this.dragOffset);
      f.anchorX += this.dragOffset.x;
      f.anchorY += this.dragOffset.y;
      if (this.releaseLeft > 0) {
        const k = this.releaseLeft / RELEASE_BLEND;
        f.rot.slerp(this.releaseRot, k * k * (3 - 2 * k));
      }
    }
    let lit: StatusLit = f.status === 'lit' ? (sequence === 'accept' ? 'accept' : 'decline') : 'off';
    const r = this.recovery;
    if (lit === 'off' && r && r.lit !== 'off') {
      // The interrupted outcome's light fades out rather than switching off.
      const k = r.level * recoveryFade(t);
      if (k > 0) {
        lit = r.lit;
        f.statusLevel = k;
      }
    }
    this.apply(f, lit);
    this.kicks(sequence, prevT, t);
  }

  simulate(dt: number): void {
    if (this.releaseLeft > 0) {
      this.releaseLeft = Math.max(0, this.releaseLeft - dt);
      const k = this.releaseLeft / RELEASE_BLEND;
      this.dragOffset.copy(this.releaseFrom).multiplyScalar(k * k * (3 - 2 * k));
    }
    // Each sequence's last beat damps the sway to rest, so the canonical end pose (which
    // snaps the springs) never pops; against the glass, friction holds the badge still.
    const end = this.sequence && !this.dragging && DURATIONS[this.sequence] - this.t < SWAY_DAMP_WINDOW;
    const pressed = this.sequence && this.sequence !== 'host' && this.t >= OUTCOME_BEATS.contact - 0.06 && this.t < OUTCOME_BEATS.depart;
    if (end || pressed) {
      const k = Math.exp(-dt * (pressed ? CONTACT_DAMP_RATE : SWAY_DAMP_RATE));
      this.swing.damp(k);
      this.pitch.damp(k);
    }
    this.swing.step(dt);
    this.pitch.step(dt);
    this.rig.nodes.card_secondary!.rotation.set(this.pitch.x, 0, this.swing.x);
    this.lanyardDirty = true;
  }

  /**
   * Change of mind: the scene always takes the hand-over itself. It plans a recovery from the pose
   * on screen (drag offset included), moving at the velocity it had, and asks the director for its
   * 0 ms cut; the new sequence's first RECOVER seconds then start from that pose (applyRecovery).
   * A straight blend would pass through the reader near it, and starts and ends with a velocity
   * step everywhere else.
   */
  interruptCut(): boolean {
    const vel = new Vector3();
    const seq = this.sequence;
    if (seq && !this.dragging && this.releaseLeft === 0) {
      // Velocity of the motion on screen (pure in t, so a backward difference is exact enough).
      const dt = 1 / 120;
      if (this.t >= dt) {
        const now = this.authored(seq, this.t, this.scratch).pivot.clone();
        vel.copy(now).sub(this.authored(seq, this.t - dt, this.scratch).pivot).divideScalar(dt);
      }
    }
    // The new outcome is unknown here; both start the same way (identical motion), so plan for accept.
    const plan = planRecovery(this.frame, vel, 'accept');
    this.pendingRecovery = { ...plan, lit: this.lit, level: this.litLevel, springs: [this.swing.x, this.swing.v, this.pitch.x, this.pitch.v] };
    return true;
  }

  settling(): boolean {
    return !this.swing.settled || !this.pitch.settled || this.releaseLeft > 0 || this.dragging;
  }

  settle(): void {
    this.swing.snap();
    this.pitch.snap();
    this.rig.nodes.card_secondary!.rotation.set(0, 0, 0);
    this.lanyardDirty = true;
  }

  /** Timeline stays held while dragging and until the release blend reaches the scanner. */
  holding(): boolean {
    return this.dragging || this.releaseLeft > 0;
  }

  takeSeek(): number | null {
    const s = this.seekTo;
    this.seekTo = null;
    return s;
  }

  /** Derived state (strap, shadow) from the current node transforms — used during blends. */
  refresh(): void {
    this.updateShadow();
    this.lanyardDirty = true;
  }

  beforeRender(): void {
    if (!this.lanyardDirty) return;
    this.lanyardDirty = false;
    this.rig.updateLanyard();
  }

  /** Low tier for the imported badge and reader materials. */
  setLowDetail(enabled: boolean): void {
    setImportedLowDetail(this.root, enabled);
  }

  async precompile(renderer: WebGLRenderer, camera: Camera): Promise<void> {
    // Warm both template variants with the status pictogram shown (it is hidden while idle, and the
    // compiler skips hidden meshes); colour and level changes are uniforms and need no new program.
    const other: CardTemplate = this.template === 'light' ? 'dark' : 'light';
    const scene = this.root.parent ?? this.root;
    this.beforeRender();
    this.rig.setStatus('accept', 1);
    await renderer.compileAsync(scene, camera);
    this.rig.setTemplate(other);
    this.rig.setStatus('decline', 1);
    await renderer.compileAsync(scene, camera);
    this.rig.setTemplate(this.template);
    this.rig.setStatus(this.lit, this.litLevel);
  }

  dispose(): void {
    this.cancelDrag();
    this.rig.dispose();
    disposeImported(this.root);
    this.root.traverse((o) => (o as { geometry?: { dispose(): void } }).geometry?.dispose());
    this.root.removeFromParent();
  }

  // ── internals ─────────────────────────────────────────────────────────────
  private lit: StatusLit = 'off';
  private litLevel = 0;
  private apply(f: BusinessFrame, lit: StatusLit): void {
    const n = this.rig.nodes;
    this.lit = lit;
    this.litLevel = f.statusLevel;
    n.card_authored!.position.copy(f.pivot);
    n.card_authored!.quaternion.copy(f.rot);
    n.clip_pivot!.rotation.set(f.clipTilt, f.swivel, 0);
    n.card_mesh!.position.copy(f.cardOffset);
    cardRotation(f, n.card_mesh!.quaternion);
    if (this.rig.gate) this.rig.gate.rotation.set(f.gate, 0, 0);
    n.lanyard_anchor!.position.set(f.anchorX, f.anchorY, f.pivot.z);
    this.rig.setStatus(lit, f.statusLevel);
    this.rig.setPress(f.glass);
    this.updateShadow();
    this.lanyardDirty = true;
  }

  private readonly shadowAt = new Vector3();
  private updateShadow(): void {
    // Footprint under the card's centre; its height from the card's lowest edge.
    const n = this.rig.nodes;
    n.card_mesh!.updateWorldMatrix(true, false);
    const c = this.shadowAt.setFromMatrixPosition(n.card_mesh!.matrixWorld);
    this.root.worldToLocal(c);
    const shadow = this.rig.shadows[0]!;
    shadow.setFootprint(c.x, c.z);
    shadow.setHeight(c.y - CARD.height / 2, 0.9);
  }

  /**
   * Secondary beats as velocity impulses (never displacement jumps), fired when playback
   * crosses a beat — deterministic by beat, not by frame.
   */
  private kicks(sequence: SequenceName, prevT: number, t: number): void {
    const crossed = (at: number) => prevT < at && t >= at;
    if (sequence === 'host') {
      // The hook swings home carrying the card forward and down; as it stops under the eye the
      // card's bottom carries on forward (pitch), with a little sideways sway.
      if (crossed(HOST_BEATS.hung)) this.pitch.kick(0, -0.7);
      if (crossed(HOST_BEATS.hung)) this.swing.kick(0, 0.3);
      return;
    }
    if (crossed(0.16)) this.swing.kick(0, -0.9);
    // Leaving the glass to the left: the card lags behind the eye.
    if (crossed(OUTCOME_BEATS.depart + 0.06)) this.swing.kick(0, 0.7);
  }

  private cancelDrag(): void {
    this.dragging = false;
    this.releaseLeft = 0;
    this.dragOffset.set(0, 0, 0);
    this.seekTo = null;
  }

  private createPointer(): ScenePointer {
    const ndc = new Vector2();
    const hit = new Vector3();
    const target = new Vector3();
    const corner = new Vector3();
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;

    // The drag plane and its hit are in business_root space (the root carries the world scale).
    const toRoot = new Matrix4();
    const project = (x: number, y: number, camera: Camera, out: Vector3) => {
      ndc.set(x, y);
      this.raycaster.setFromCamera(ndc, camera);
      this.root.updateWorldMatrix(true, false);
      const ray = this.raycaster.ray.clone().applyMatrix4(toRoot.copy(this.root.matrixWorld).invert());
      return ray.intersectPlane(this.plane, out);
    };

    return {
      enabled: () => this.sequence !== null && this.sequence !== 'host' && !this.releaseLeft && !this.recovery && this.t >= 0.1 && this.t < APPROACH_T,
      hitTest: (x, y, camera) => {
        ndc.set(x, y);
        this.raycaster.setFromCamera(ndc, camera);
        return this.raycaster.intersectObject(this.rig.nodes.card_mesh!, true).length > 0;
      },
      begin: (x, y, camera) => {
        this.dragging = true;
        this.releaseLeft = 0;
        const pivot = this.rig.nodes.card_authored!.position;
        this.plane.set(this.plane.normal.set(0, 0, 1), -pivot.z);
        if (project(x, y, camera, hit)) this.grab.subVectors(pivot, hit);
        this.lastTarget.copy(pivot);
      },
      move: (x, y, camera) => {
        if (!this.dragging || !this.sequence || !project(x, y, camera, hit)) return;
        const authored = sampleSequence(this.sequence, this.t, this.scratch);
        target.addVectors(hit, this.grab);
        clampDragTarget(target, authored.rot);
        this.dragOffset.subVectors(target, authored.pivot);
        // Rotation trails position through the bounded spring: clamped velocity impulse.
        const vx = target.x - this.lastTarget.x;
        this.swing.kick(0, Math.max(-1.2, Math.min(1.2, -vx * 18)));
        this.lastTarget.copy(target);
        this.sample(this.sequence, this.t);
        // Reader contact triggers the chosen scan early — never a response change.
        if (touchesScanner(target, authored.rot)) this.release();
      },
      end: () => this.release(),
      screenRect: (camera) => {
        const card = this.rig.nodes.card_mesh!;
        card.updateWorldMatrix(true, false);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [cx, cy] of corners) {
          corner.set((cx * CARD.width) / 2, (cy * CARD.height) / 2, 0).applyMatrix4(card.matrixWorld).project(camera);
          x0 = Math.min(x0, corner.x); x1 = Math.max(x1, corner.x);
          y0 = Math.min(y0, corner.y); y1 = Math.max(y1, corner.y);
        }
        this.rect[0] = x0; this.rect[1] = y0; this.rect[2] = x1; this.rect[3] = y1;
        return this.rect;
      },
    };
  }

  /**
   * Release, cancel, hold timeout or reader contact: rebase the offset onto the scanner
   * approach so nothing jumps, then blend there over RELEASE_BLEND with the timeline held,
   * and only then complete the chosen scan.
   */
  private release(): void {
    if (!this.dragging || !this.sequence) return;
    this.dragging = false;
    const seekT = Math.max(this.t, APPROACH_T);
    const approach = sampleSequence(this.sequence, seekT, this.scratch);
    const shown = this.rig.nodes.card_authored!;
    this.dragOffset.subVectors(shown.position, approach.pivot);
    this.releaseFrom.copy(this.dragOffset);
    this.releaseRot.copy(shown.quaternion);
    this.releaseLeft = RELEASE_BLEND;
    this.seekTo = seekT;
    this.t = seekT;
  }
}

async function fetchGlb(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw Object.assign(new Error(`asset ${res.status}`), { reason: 'asset-failure' as const });
  return res.arrayBuffer();
}

export const businessScene: SceneModule = {
  category: 'business',
  async load({ config, library, signal }: SceneLoadContext): Promise<SceneInstance> {
    if (config.category !== 'business') throw new Error('business scene given another config');
    const gltf = await gltfLoader().parseAsync(await fetchGlb(glbUrl, signal), '');
    const root = gltf.scene.getObjectByName('business_root');
    if (!root) throw Object.assign(new Error('missing business_root'), { reason: 'asset-failure' as const });
    // Card templates live in the GLB (KHR_materials_variants); read them before detaching the root.
    const variants = await loadMaterialVariants(gltf);
    root.removeFromParent();
    bindMaterialsByName(root, library);
    prepareImported(root, library, variants.materials);
    // v1.4: the scene stands in the world at its real size (models/worldScale.ts).
    root.scale.setScalar(BUSINESS_WORLD_SCALE);
    return new BusinessScene(rigBusiness(root, library, config.template, variants), library, config);
  },
};
