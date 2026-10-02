import { Box3, type Camera, Euler, type Object3D, Vector3, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import glbUrl from '../../../assets/scenes/dinner/dinner.glb?url';
import binUrl from '../../../assets/shared/disposal-bin.glb?url';
import {
  COVER, COVER_PROFILE, COVER_TOP, DINNER_BIN_POS, DINNER_BIN_YAW, DINNER_WORLD_SCALE, DINNER_WALL_Z, DISH_HEIGHT, PLATE, rigDinner,
  type DinnerRig,
} from '../../../models/dinner.ts';
import { flapAngles, openBinFramePoints } from '../../../models/disposalBin.ts';
import { DinnerSteam, STEAM_LAYERS } from '../../../models/dinnerSteam.ts';
import { disposeImported, prepareImported, setImportedLowDetail } from '../../../models/imported.ts';
import { bindMaterialsByName } from '../../../models/types.ts';
import { silhouettePoints } from '../../render/framing.ts';
import type { SceneInstance, SceneLoadContext, SceneModule } from '../../core/sequence.ts';
import type { CanonicalPose, SceneConfig, SequenceName } from '../../core/types.ts';
import { smoothstep } from '../../motion/curves.ts';
import {
  type AnswerChange, changeTime, CONTENT_END, coverBlendSafe, DURATIONS, frameFor, newFrame, planAnswerChange, sampleAnswerChange, sampleSequence,
  type DinnerFrame,
} from './sequences.ts';
import { leftSteamEnd, leftSteamFade, STEAM_END, STEAM_REST, steamPlumes, steamPuffs } from './steam.ts';
import { dinnerPull } from './pull.ts';

/**
 * Silhouette samples of every Dinner path: the plate, the cover along the host and accept paths
 * (its measured profile, tilted and placed exactly as rendered), the resting cover and the carry.
 * The scene adds the open bin from its geometry (openBinFramePoints). `'rest'` (v1.5 decline
 * pull-back): the host and accept paths only, without the carry.
 */
export function dinnerFramePoints(paths: 'all' | 'rest' = 'all'): Vector3[] {
  const pts: Vector3[] = [];
  const ring = (cx: number, cz: number, r: number, y: number, n = 16) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(new Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
    }
  };
  ring(0, 0, PLATE.radius, 0);
  ring(0, 0, PLATE.radius, PLATE.rimHeight);
  // The cover: rim, shoulder, crown and handle top, in cover space, at each sampled pose.
  const shoulder = COVER_PROFILE[Math.floor(COVER_PROFILE.length / 2)]!;
  const local: Vector3[] = [];
  for (const [r, y, n] of [[COVER.radius, 0, 16], [shoulder[0], shoulder[1], 12], [COVER.radius * 0.35, COVER.domeHeight, 8], [COVER.radius * 0.25, COVER_TOP, 6]] as const) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      local.push(new Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
  }
  const e = new Euler();
  const cover = (f: DinnerFrame) => {
    e.set(f.coverTiltX, 0, f.coverTilt);
    for (const p of local) pts.push(p.clone().applyEuler(e).add(f.coverPos));
  };
  const f = newFrame();
  for (const pose of ['host-ready', 'guest-ready', 'accepted'] as const) cover(frameFor(pose, f));
  for (const seq of ['host', 'accept'] as const) {
    for (let t = 0; t <= DURATIONS[seq] + 1e-9; t += 0.02) cover(sampleSequence(seq, t, f));
  }
  for (let t = 0.25; paths === 'all' && t <= DURATIONS.decline; t += 0.025) {
    const p = sampleSequence('decline', t, f).platePos;
    ring(p.x, p.z, PLATE.radius, p.y, 12);
    ring(p.x, p.z, COVER.radius * 0.35, p.y + DISH_HEIGHT, 6);
  }
  // The bin itself (body and open flaps) is sampled from its geometry: openBinFramePoints.
  return pts;
}

export class DinnerScene implements SceneInstance {
  readonly category = 'dinner' as const;
  readonly root: Object3D;
  readonly bounds: Box3;
  /** Silhouette of the objects on stage at guest-ready: the v1.4 framing rule's hero. */
  readonly heroPoints: Vector3[];
  readonly durations = DURATIONS;
  readonly animatedNodes: Object3D[];
  readonly studio = { wallZ: DINNER_WALL_Z };
  readonly framePoints: Vector3[];
  /** v1.5 decline pull-back: at rest the frame holds the dish and the cover's host and accept paths. */
  readonly restFramePoints = dinnerFramePoints('rest');

  private readonly frame = newFrame();
  /** v1.5: the steam released by the reveal (src/scenes/dinner/steam.ts, models/dinnerSteam.ts). */
  private readonly steam = new DinnerSteam(steamPuffs(), steamPlumes());
  /**
   * The steam clock τ (s since the reveal began), or null when no steam shows. While the reveal
   * plays the accept's samples set it; after it (`steamFree`) `simulate` carries it on until the
   * last puff has gone, and settle() snaps it to rest.
   */
  private steamT: number | null = null;
  private steamFree = false;
  /** A reveal resumed part-way (a change of mind and back) releases steam from here on. */
  private steamEmitStart = -Infinity;
  private steamFade = 1;
  /**
   * Steam a change of mind left behind (the cover went back on, the release stopped at `emitEnd`):
   * each rises on and disperses on its own clock until `until` (steamEndAfter), beside whatever a
   * new reveal releases.
   */
  private readonly leftSteam = Array.from({ length: STEAM_LAYERS - 1 }, () => ({ t: null as number | null, start: -Infinity, end: Infinity, until: 0, capture: Infinity }));

  constructor(readonly rig: DinnerRig, _config: Extract<SceneConfig, { category: 'dinner' }>) {
    this.root = rig.root;
    this.bounds = rig.bounds.clone();
    rig.root.add(this.steam.object);
    this.steam.setSeated(frameFor('guest-ready', newFrame()).coverPos);
    const n = rig.nodes;
    this.animatedNodes = [n.plate_authored!, n.cover_authored!, n.bin_root!, rig.flapL, rig.flapR];
    this.framePoints = [...dinnerFramePoints(), ...openBinFramePoints(n.bin_root!, DINNER_BIN_POS, DINNER_BIN_YAW)];
    this.pose('guest-ready');
    this.heroPoints = silhouettePoints(this.root);
  }

  /** v1.2 has no food: `dish` stays in SceneConfig for integration compatibility and selects nothing. */
  setConfig(_config: SceneConfig): void {}

  /** What is showing: the last outcome sampled (or posed) and its time, for a change of mind. */
  private shown: { seq: SequenceName; t: number; rate: number } | null = null;
  /** The change of mind in progress: the next outcome's playback rewinds the old one first. */
  private change: AnswerChange | null = null;
  /** The director poses guest-ready between interruptCut and the new outcome's first sample. */
  private changeArmed = false;

  pose(pose: CanonicalPose): void {
    const cutOfChange = this.changeArmed;
    if (this.changeArmed) this.changeArmed = false;
    else this.change = null;
    // The reveal has just played to its end: its steam carries on (simulate) until it has gone.
    const revealEnded = pose === 'accepted' && this.shown?.seq === 'accept' && this.shown.rate > 0 && this.steamT !== null && !this.steamFree;
    this.shown = pose === 'accepted' ? { seq: 'accept', t: DURATIONS.accept, rate: 0 }
      : pose === 'declined' ? { seq: 'decline', t: DURATIONS.decline, rate: 0 } : null;
    if (revealEnded) {
      // Carry on from the last sample (within a frame of the reveal's end): never a jump.
      this.steamFree = true;
    } else if (!cutOfChange) this.steamRest();
    this.apply(frameFor(pose, this.frame));
  }

  sample(sequence: SequenceName, t: number): void {
    this.changeArmed = false;
    if (this.change && sequence !== this.change.next) this.change = null;
    this.shown = { seq: sequence, t, rate: 1 };
    // The reveal playing forwards drives the steam clock; anything else shows only steam that a
    // change of mind left behind (it rises on and disperses on its own clocks, simulate).
    const c = this.change;
    const [seq, s] = c ? changeTime(c, t) : [sequence, t];
    const revealing = seq === 'accept' && (!c || (c.next === 'accept' && t >= c.rewind));
    if (revealing) {
      // After a change of mind the reveal may play up to k× faster (the rewind took some of its
      // time); the steam follows the reveal's own clock while the cover moves, then runs on in
      // real time once the reveal's motion is over (changeTime holds there). A reveal resumed
      // part-way (changed back mid-rewind) releases only from where it resumes: what came out
      // before is the steam left behind, still rising on its own clock.
      this.steamT = c ? revealSteamTime(c, t) : s;
      this.steamEmitStart = c && c.start > 0 ? c.start : -Infinity;
      this.steamFree = false;
      this.steamFade = 1;
    } else this.steamT = null;
    this.apply(c ? sampleAnswerChange(c, t, this.frame) : sampleSequence(sequence, t, this.frame));
  }

  /** Steam at rest for the pose on stage: none, or the accepted still's faint residue (STEAM_REST). */
  private steamRest(): void {
    const accepted = this.shown?.seq === 'accept' && this.shown.rate === 0;
    this.steamT = accepted && STEAM_REST ? STEAM_REST.tau : null;
    this.steamFade = accepted && STEAM_REST ? STEAM_REST.fade : 1;
    this.steamFree = false;
    this.steamEmitStart = -Infinity;
  }

  simulate(dt: number): void {
    let live = false;
    if (this.steamFree && this.steamT !== null) {
      this.steamT += dt;
      live = true;
      // Gone: the live steam ends clear (the canonical still's residue, if any, is for stills only).
      if (this.steamT >= STEAM_END) {
        this.steamT = null;
        this.steamFree = false;
      }
    }
    for (const g of this.leftSteam) {
      if (g.t === null) continue;
      g.t += dt;
      live = true;
      if (g.t >= g.until) g.t = null;
    }
    if (live) this.syncSteam();
  }

  /** True while released steam is still rising (the loop keeps drawing until it has gone). */
  settling(): boolean {
    return (this.steamFree && this.steamT !== null) || this.leftSteam.some((g) => g.t !== null);
  }

  /**
   * Snap the steam to rest, the steam left behind included (reduced motion, replay, the
   * director's deadlines). The settle that comes with a change of mind's cut is the exception:
   * steam already out keeps rising and disperses over its own life (interruptCut), as air would.
   */
  settle(): void {
    if (this.changeArmed) return;
    this.steamRest();
    for (const g of this.leftSteam) g.t = null;
    this.syncSteam();
  }

  /**
   * A change of mind. A straight blend would sweep a lifted cover through the plate's rim, or a
   * dish out through the bin, so the director is asked to cut, and the cut is never seen: the
   * new outcome's playback first rewinds the outcome that was showing along its own path to the
   * covered dish (`planAnswerChange`), starting exactly from the current frame.
   */
  interruptCut(): boolean {
    const s = this.shown;
    if (!s || s.seq === 'host') {
      const f = this.frame;
      return f.binVisible || !f.dishVisible || f.platePos.lengthSq() > 1e-6 || !coverBlendSafe(f);
    }
    const [from, at, rate] = this.change && s.seq === this.change.next ? changeTime(this.change, s.t) : [s.seq, s.t, s.rate];
    const next = s.seq === 'accept' ? 'decline' : 'accept';
    const plan = (this.change = planAnswerChange(from, at, rate, next));
    this.changeArmed = true;
    // Steam already released is left behind: it rises on, on its own clock, and disperses over
    // its own life (the column's source dies away, its base detaches and rises off); nothing
    // more of it is released. A new reveal releases its own beside it.
    if (this.steamT !== null) this.leaveSteam(this.steamT, this.steamEmitStart);
    // The rewind sets the cover back on the plate (the decline lifts the dish at once): what it
    // closes over stays under it and leaves with the dish. Half a frame after it lands, so the
    // first frame that counts has it seated (or a centimetre up with the plate). A change back
    // before then never closes it.
    const closes = plan.from === 'accept' && plan.next === 'decline' && plan.rewind > 0;
    for (const g of this.leftSteam) {
      if (g.t === null || g.capture <= g.t) continue;
      g.capture = closes ? g.t + plan.rewind + 0.5 / 60 : Infinity;
      g.until = leftSteamEnd(g.end, g.start, g.capture);
    }
    this.steamT = null;
    this.steamFree = false;
    this.steamEmitStart = -Infinity;
    this.syncSteam();
    return true;
  }

  /** v1.5 decline pull-back (pull.ts): from what is showing, the change of mind's rewind included. */
  framePull(): number {
    return dinnerPull(this.shown, this.change);
  }

  /** Low tier for the imported plate and cloche materials (the library handles the bin). */
  setLowDetail(enabled: boolean): void {
    setImportedLowDetail(this.root, enabled);
    this.steam.setLowDetail(enabled);
  }

  async precompile(renderer: WebGLRenderer, camera: Camera): Promise<void> {
    // Warm the bin too (shown for the compile only).
    const scene = this.root.parent ?? this.root;
    this.rig.nodes.bin_root!.visible = true;
    this.steam.showForCompile();
    await renderer.compileAsync(scene, camera);
    this.apply(this.frame);
  }

  dispose(): void {
    this.steam.dispose();
    this.rig.dispose();
    disposeImported(this.root);
    this.root.traverse((o) => (o as { geometry?: { dispose(): void } }).geometry?.dispose());
    this.root.removeFromParent();
  }

  private apply(f: DinnerFrame): void {
    const n = this.rig.nodes;
    n.plate_authored!.position.copy(f.platePos);
    n.plate_authored!.visible = f.dishVisible;
    n.cover_authored!.position.copy(f.coverPos);
    n.cover_authored!.rotation.set(f.coverTiltX, 0, f.coverTilt);
    n.cover_authored!.visible = f.dishVisible;
    // The dish shadow follows the plate and softens as it is carried up and away.
    const shadow = this.rig.dishShadow;
    shadow.setFootprint(f.platePos.x, f.platePos.z);
    shadow.setHeight(f.platePos.y, 1.4);
    // setHeight decides visibility from its fade; the hidden dish must stay hidden after it.
    if (!f.dishVisible) shadow.visible = false;
    // The cloche's own shadow fades in as it leaves the plate and lands beside it (as it rises
    // off the plate it is still over the dish's shadow, so it is held back there).
    const off = Math.hypot(f.coverPos.x - f.platePos.x, f.coverPos.z - f.platePos.z);
    const beside = smoothstep(Math.min(1, Math.max(0, (off - 0.9) / 0.55)));
    const coverShadow = this.rig.coverShadow;
    coverShadow.setFootprint(f.coverPos.x, f.coverPos.z);
    coverShadow.setHeight(f.dishVisible ? f.coverPos.y + (1 - beside) * 2 : 99, 1.2);
    n.bin_root!.position.copy(f.binPos);
    n.bin_root!.visible = f.binVisible;
    const [l, r] = flapAngles(f.flaps);
    this.rig.flapL.rotation.set(0, 0, l);
    this.rig.flapR.rotation.set(0, 0, r);
    this.steam.setSurfaces(f.coverPos, f.coverTiltX, f.coverTilt, f.platePos, f.binVisible ? f.binPos : null);
    this.syncSteam();
  }

  /**
   * Leave the reveal's steam behind at τ: a free slot takes it (or, if every slot is busy, the one
   * closest to gone: after several changes of mind within two seconds, the faintest leftover).
   */
  private leaveSteam(tau: number, emitStart: number): void {
    const slot = this.leftSteam.find((g) => g.t === null)
      ?? this.leftSteam.reduce((a, b) => (b.until - b.t! < a.until - a.t! ? b : a));
    slot.t = tau;
    slot.start = emitStart;
    slot.end = tau;
    slot.until = leftSteamEnd(tau, emitStart);
    slot.capture = Infinity;
  }

  private syncSteam(): void {
    this.steam.update(0, { tau: this.steamT, emitStart: this.steamEmitStart, fade: this.steamFade });
    this.leftSteam.forEach((g, i) => this.steam.update(i + 1, {
      tau: g.t, emitStart: g.start, emitEnd: g.end, capture: g.capture, fade: g.t === null ? 1 : leftSteamFade(g.t, g.end, g.capture),
    }));
  }

  /**
   * The steam on stage (tests, tooling): the reveal's clock (null: none), its release start and
   * overall fade; the steam left behind by changes of mind; whether any steam is drawn.
   */
  get steamState(): {
    tau: number | null; fade: number; emitStart: number; visible: boolean;
    left: readonly { tau: number; emitEnd: number; until: number; capture: number }[];
  } {
    return {
      tau: this.steamT, fade: this.steamFade, emitStart: this.steamEmitStart, visible: this.steam.object.visible,
      left: this.leftSteam.filter((g) => g.t !== null).map((g) => ({ tau: g.t!, emitEnd: g.end, until: g.until, capture: g.capture })),
    };
  }
}

/**
 * Steam time on a change of mind's reveal: the accept's own time while its motion plays (it may be
 * sped up by k), real time after CONTENT_END (where changeTime holds), continuous at the switch.
 */
export function revealSteamTime(c: AnswerChange, t: number): number {
  const s = c.start + (t - c.rewind) * c.k;
  const end = CONTENT_END.accept;
  return s <= end ? s : end + (s - end) / c.k;
}

async function fetchGlb(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw Object.assign(new Error(`asset ${res.status}`), { reason: 'asset-failure' as const });
  return res.arrayBuffer();
}

export const dinnerScene: SceneModule = {
  category: 'dinner',
  async load({ config, library, signal }: SceneLoadContext): Promise<SceneInstance> {
    if (config.category !== 'dinner') throw new Error('dinner scene given another config');
    const [dishBuffer, binBuffer] = await Promise.all([fetchGlb(glbUrl, signal), fetchGlb(binUrl, signal)]);
    const loader = new GLTFLoader();
    const [dish, bin] = await Promise.all([loader.parseAsync(dishBuffer, ''), loader.parseAsync(binBuffer, '')]);
    const root = dish.scene.getObjectByName('dinner_root');
    const binRoot = bin.scene.getObjectByName('bin_root');
    if (!root || !binRoot) throw Object.assign(new Error('missing dinner nodes'), { reason: 'asset-failure' as const });
    root.removeFromParent();
    binRoot.removeFromParent();
    bindMaterialsByName(root, library);
    bindMaterialsByName(binRoot, library);
    // The plate and cloche masters keep their own PBR materials as authored: own environment for
    // the silver and the gilt, the Low tier's registry (models/imported.ts).
    prepareImported(root, library);
    // v1.4: the scene stands in the world at its real size (models/worldScale.ts).
    root.scale.setScalar(DINNER_WORLD_SCALE);
    return new DinnerScene(rigDinner(root, binRoot, library), config);
  },
};
