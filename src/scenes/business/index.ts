import { Box3, type Camera, Plane, Quaternion, Raycaster, Vector2, Vector3, type Object3D, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import glbUrl from '../../../assets/scenes/business/business.glb?url';
import { bindLibraryMaterials, CARD, rigKeycard, type CardTemplate, type KeycardRig } from '../../../models/keycard.ts';
import type { SceneInstance, SceneLoadContext, SceneModule, ScenePointer } from '../../core/sequence.ts';
import type { CanonicalPose, SceneConfig, SequenceName } from '../../core/types.ts';
import { ANGLE_EPSILON, Spring } from '../../motion/spring.ts';
import type { MaterialLibrary } from '../../render/materials.ts';
import { clampDragTarget, touchesScanner } from './drag.ts';
import { DURATIONS, SCAN_AT, STATUS_COLOURS } from './poses.ts';
import { frameFor, newFrame, sampleSequence, type BusinessFrame } from './sequences.ts';

/** Release/cancel blend onto the scanner approach (sub-spec: 350–600 ms). */
const RELEASE_BLEND = 0.45;
/** Where a released card rejoins the authored path: just before the contact beat. */
const APPROACH_T = SCAN_AT - 0.08;
const MAX_TILT = (12 * Math.PI) / 180;
const DEG = Math.PI / 180;

export class BusinessScene implements SceneInstance {
  readonly category = 'business' as const;
  readonly root: Object3D;
  readonly bounds: Box3;
  readonly durations = DURATIONS;
  readonly animatedNodes: Object3D[];
  readonly pointer: ScenePointer;

  private readonly frame = newFrame();
  private readonly scratch = newFrame();
  private readonly swing = new Spring({ frequency: 1.1, limit: MAX_TILT, epsilon: ANGLE_EPSILON, maxVelocity: 3 });
  private readonly pitch = new Spring({ frequency: 1.3, limit: MAX_TILT, epsilon: ANGLE_EPSILON, maxVelocity: 3 });
  private status: 'off' | 'accept' | 'decline' = 'off';
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

  constructor(readonly rig: KeycardRig, private readonly library: MaterialLibrary, config: Extract<SceneConfig, { category: 'business' }>) {
    this.root = rig.root;
    this.bounds = rig.bounds.clone();
    this.template = config.template;
    const n = rig.nodes;
    this.animatedNodes = [n.card_authored!, n.card_mesh!, n.lanyard_anchor!, ...(rig.gate ? [rig.gate] : [])];
    this.pointer = this.createPointer();
    this.pose('guest-ready');
  }

  setConfig(config: SceneConfig): void {
    if (config.category !== 'business' || config.template === this.template) return;
    this.template = config.template;
    this.rig.setTemplate(config.template);
  }

  pose(pose: CanonicalPose): void {
    this.sequence = null;
    this.t = 0;
    this.cancelDrag();
    this.settle();
    frameFor(pose, this.frame);
    const lit = pose === 'accepted' ? 'accept' : pose === 'declined' ? 'decline' : 'off';
    this.apply(this.frame, lit);
  }

  sample(sequence: SequenceName, t: number): void {
    const prevT = this.sequence === sequence ? this.t : -1;
    this.sequence = sequence;
    this.t = t;
    const f = sampleSequence(sequence, t, this.frame);
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
    const lit = f.status === 'lit' ? (sequence === 'accept' ? 'accept' : 'decline') : 'off';
    this.apply(f, lit);
    this.kicks(sequence, prevT, t);
  }

  simulate(dt: number): void {
    if (this.releaseLeft > 0) {
      this.releaseLeft = Math.max(0, this.releaseLeft - dt);
      const k = this.releaseLeft / RELEASE_BLEND;
      this.dragOffset.copy(this.releaseFrom).multiplyScalar(k * k * (3 - 2 * k));
    }
    this.swing.step(dt);
    this.pitch.step(dt);
    this.rig.nodes.card_secondary!.rotation.set(this.pitch.x, 0, this.swing.x);
    this.lanyardDirty = true;
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
    const n = this.rig.nodes;
    this.updateShadow(n.card_authored!.position, n.card_mesh!.position.y);
    this.lanyardDirty = true;
  }

  beforeRender(): void {
    if (!this.lanyardDirty) return;
    this.lanyardDirty = false;
    this.rig.updateLanyard();
  }

  async precompile(renderer: WebGLRenderer, camera: Camera): Promise<void> {
    // Warm both template variants; status changes are uniforms and need no new program.
    const other: CardTemplate = this.template === 'light' ? 'dark' : 'light';
    const scene = this.root.parent ?? this.root;
    this.beforeRender();
    await renderer.compileAsync(scene, camera);
    this.rig.setTemplate(other);
    await renderer.compileAsync(scene, camera);
    this.rig.setTemplate(this.template);
  }

  dispose(): void {
    this.cancelDrag();
    this.rig.dispose();
    this.root.traverse((o) => (o as { geometry?: { dispose(): void } }).geometry?.dispose());
    this.root.removeFromParent();
  }

  // ── internals ─────────────────────────────────────────────────────────────
  private apply(f: BusinessFrame, lit: 'off' | 'accept' | 'decline'): void {
    const n = this.rig.nodes;
    n.card_authored!.position.copy(f.pivot);
    n.card_authored!.quaternion.copy(f.rot);
    n.card_mesh!.position.copy(f.cardOffset);
    n.card_mesh!.rotation.set(f.cardTilt, 0, 0);
    if (this.rig.gate) this.rig.gate.rotation.set(f.gate, 0, 0);
    n.lanyard_anchor!.position.set(f.anchorX, f.anchorY, f.pivot.z);
    this.setStatus(lit);
    this.updateShadow(f.pivot, f.cardOffset.y);
    this.lanyardDirty = true;
  }

  private updateShadow(pivot: Vector3, cardOffsetY: number): void {
    const shadow = this.rig.shadows[0]!;
    shadow.setFootprint(pivot.x, pivot.z);
    shadow.setHeight(pivot.y + cardOffsetY - CARD.height / 2, 0.9);
  }

  private setStatus(lit: 'off' | 'accept' | 'decline'): void {
    if (lit === this.status) return;
    this.status = lit;
    const m = this.rig.statusMaterial;
    const off = this.library.direction.surfaces.mat_status!;
    if (lit === 'off') {
      m.color.set(off.color);
      m.emissive.set('#000000');
      m.emissiveIntensity = 0;
    } else {
      m.color.set(STATUS_COLOURS[lit]);
      m.emissive.set(STATUS_COLOURS[lit]);
      m.emissiveIntensity = 0.9;
    }
    this.rig.symbols.accept.visible = lit === 'accept';
    this.rig.symbols.decline.visible = lit === 'decline';
  }

  /**
   * Secondary beats as velocity impulses (never displacement jumps), fired when playback
   * crosses a beat — deterministic by beat, not by frame.
   */
  private kicks(sequence: SequenceName, prevT: number, t: number): void {
    const crossed = (at: number) => prevT < at && t >= at;
    if (sequence === 'host' && crossed(0.62)) this.swing.kick(0, 1.2);
    if (sequence !== 'host') {
      if (crossed(0.16)) this.swing.kick(0, -0.9);
      if (crossed(SCAN_AT)) this.pitch.kick(0, -0.5);
    }
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

    const project = (x: number, y: number, camera: Camera, out: Vector3) => {
      ndc.set(x, y);
      this.raycaster.setFromCamera(ndc, camera);
      return this.raycaster.ray.intersectPlane(this.plane, out);
    };

    return {
      enabled: () => this.sequence !== null && this.sequence !== 'host' && !this.releaseLeft && this.t >= 0.1 && this.t < APPROACH_T,
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
    const buffer = await fetchGlb(glbUrl, signal);
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    const root = gltf.scene.getObjectByName('business_root');
    if (!root) throw Object.assign(new Error('missing business_root'), { reason: 'asset-failure' as const });
    root.removeFromParent();
    bindLibraryMaterials(root, library);
    const rig = rigKeycard(root, library, config.template);
    return new BusinessScene(rig, library, config);
  },
};
