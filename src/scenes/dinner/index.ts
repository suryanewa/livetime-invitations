import { Box3, type Camera, Euler, type Object3D, Vector3, type WebGLRenderer } from 'three';
import glbUrl from '../../../assets/scenes/dinner/dinner.glb?url';
import {
  cardCorners, COVER, COVER_PROFILE, COVER_TOP, DINNER_BIN_POS, DINNER_BIN_SCALE, DINNER_BIN_START, DINNER_BIN_YAW, DINNER_WORLD_SCALE, DINNER_WALL_Z, DISH_HEIGHT, PLATE, rigDinner,
  type DinnerRig,
} from '../../../models/dinner.ts';
import { CAMERA_ANGLES, type CloseUp } from '../../render/camera.ts';
import { binEntranceStart, binPlaceholder, flapAngles, openBinSilhouette } from '../../../models/disposalBin.ts';
import { DinnerSteam, STEAM_LAYERS } from '../../../models/dinnerSteam.ts';
import { type CardText, loadCardFont } from '../../render/cardPrint.ts';
import { disposeImported, gltfLoader, prepareImported, setImportedLowDetail } from '../../../models/imported.ts';
import { bindMaterialsByName } from '../../../models/types.ts';
import { silhouettePoints } from '../../render/framing.ts';
import { markDepthOccluders } from '../../render/sceneDepth.ts';
import type { DeferredContext, SceneInstance, SceneLoadContext, SceneModule } from '../../core/sequence.ts';
import type { MaterialLibrary } from '../../render/materials.ts';
import { DeferredBin } from '../deferredBin.ts';
import type { CanonicalPose, SceneConfig, SequenceName } from '../../core/types.ts';
import { smoothstep } from '../../motion/curves.ts';
import {
  type AnswerChange, changeTime, CONTENT_END, coverBlendSafe, DURATIONS, frameFor, newFrame, planAnswerChange, sampleAnswerChange, sampleSequence,
  type DinnerFrame,
} from './sequences.ts';
import { leftSteamEnd, leftSteamFade, STEAM_END, STEAM_REST } from './steam.ts';
import { CLOSE, type CloseHome, closeClearAt, closeHome, closeIn, closeRate, dinnerPull, planCloseHome } from './pull.ts';

/**
 * Silhouette samples of every Dinner path: the plate, the cover along the host and accept paths
 * (its measured profile, tilted and placed exactly as rendered), the resting cover and the carry.
 * The scene adds the open bin from its design (openBinSilhouette). `'rest'` (v1.5 decline
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
  // The bin itself (body and open flaps) is sampled from its design: openBinSilhouette.
  return pts;
}

export class DinnerScene implements SceneInstance {
  readonly category = 'dinner' as const;
  readonly root: Object3D;
  readonly bounds: Box3;
  /** Silhouette of the objects on stage at guest-ready: the v1.4 framing rule's hero. */
  readonly heroPoints: Vector3[];
  /**
   * The director's duration for each sequence: DURATIONS, except during a change of mind from the
   * close-up (v1.7 polish), whose playback grows by the cover's hold (`AnswerChange.span`).
   */
  get durations(): Readonly<Record<SequenceName, number>> {
    return this.playDurations;
  }
  private playDurations: Readonly<Record<SequenceName, number>> = DURATIONS;
  readonly animatedNodes: Object3D[];
  readonly studio = { wallZ: DINNER_WALL_Z };
  readonly framePoints: Vector3[];
  /** v1.5 decline pull-back: at rest the frame holds the dish and the cover's host and accept paths. */
  readonly restFramePoints = dinnerFramePoints('rest');
  /** v1.7 (#42): the accepted pose's close-up on the card (CARD_VIEW). */
  readonly closeUp: CloseUp = { points: cardCorners(), ...CARD_VIEW };

  private readonly frame = newFrame();
  /** v1.6: the steam under the cloche, a raymarched volume (src/scenes/dinner/steam.ts, models/dinnerSteam.ts). */
  private readonly steam = new DinnerSteam();
  /**
   * The steam clock τ (s since the reveal began), or null when no steam shows. While the reveal
   * plays the accept's samples set it; after it (`steamFree`) `simulate` carries it on until the
   * last puff has gone, and settle() snaps it to rest.
   */
  private steamT: number | null = null;
  private steamFree = false;
  /**
   * v1.7 (#42): the reveal's own clock τ for the close-up (the steam's: the accept's time, k× during
   * a change of mind's reveal, real time after it), or null when no reveal is under way (at the
   * accepted pose that means the close-up, at rest). After the reveal (`revealFree`) `simulate`
   * carries it on until the move has landed (CLOSE.to); settle() snaps it to rest.
   */
  private revealT: number | null = null;
  private revealFree = false;
  /** v1.7: the close-up's homecoming on the change of mind in progress (null: none). */
  private home: CloseHome | null = null;
  /** A reveal resumed part-way (a change of mind and back) releases steam from here on. */
  private steamEmitStart = -Infinity;
  private steamFade = 1;
  /**
   * Steam a change of mind left behind (the cover went back on, the release stopped at `emitEnd`):
   * each rises on and disperses on its own clock until `until` (steamEndAfter), beside whatever a
   * new reveal releases.
   */
  private readonly leftSteam = Array.from({ length: STEAM_LAYERS - 1 }, () => ({ t: null as number | null, start: -Infinity, end: Infinity, until: 0, capture: Infinity }));

  /** v1.5: the shared bin, loaded after ready (only the decline shows it). */
  private readonly bin: DeferredBin;
  /** v1.6: the bin's meshes are on the scene depth's layer (once it has arrived). */
  private binOccludes = false;

  constructor(readonly rig: DinnerRig, config: Extract<SceneConfig, { category: 'dinner' }>, library?: MaterialLibrary) {
    this.root = rig.root;
    // v1.7: the invitation card's print (the rig hangs the card in the plate's well).
    rig.card?.setText(cardText(config));
    this.bounds = rig.bounds.clone();
    rig.root.add(this.steam.object);
    this.steam.setSeated(frameFor('guest-ready', newFrame()).coverPos);
    const n = rig.nodes;
    this.animatedNodes = [n.plate_authored!, n.cover_authored!, n.bin_root!, rig.flapL, rig.flapR];
    // The open bin's silhouette from its design (its GLB arrives after ready: openBinSilhouette).
    this.framePoints = [...dinnerFramePoints(), ...openBinSilhouette(DINNER_BIN_POS, DINNER_BIN_YAW, DINNER_BIN_SCALE)];
    this.bin = new DeferredBin(n.bin_root!, this.root, library, () => this.apply(this.frame));
    // v1.6: the steam's volume stops at the plate and the cloche (and the bin, once it is here).
    markDepthOccluders(n.plate_authored!);
    markDepthOccluders(n.cover_authored!);
    this.pose('guest-ready');
    this.heroPoints = silhouettePoints(this.root);
  }

  /**
   * v1.2 has no food: `dish` stays in SceneConfig for integration compatibility and selects nothing.
   * v1.7: the card's text is printed again (only when it changed; nothing else moves).
   */
  setConfig(config: SceneConfig): void {
    if (config.category === 'dinner') this.rig.card?.setText(cardText(config));
  }

  /** What is showing: the last outcome sampled (or posed) and its time, for a change of mind. */
  private shown: { seq: SequenceName; t: number; rate: number } | null = null;
  /** The change of mind in progress: the next outcome's playback rewinds the old one first. */
  private change: AnswerChange | null = null;
  /** The director poses guest-ready between interruptCut and the new outcome's first sample. */
  private changeArmed = false;

  pose(pose: CanonicalPose): void {
    const cutOfChange = this.changeArmed;
    if (this.changeArmed) this.changeArmed = false;
    else {
      this.change = null;
      this.home = null;
      this.playDurations = DURATIONS;
    }
    // The reveal has just played to its end: its steam carries on (simulate) until it has gone.
    const revealEnded = pose === 'accepted' && this.shown?.seq === 'accept' && this.shown.rate > 0 && this.steamT !== null && !this.steamFree;
    // v1.7: and so does its clock for the close-up, which moves in after the steam has cleared.
    const closeOn = pose === 'accepted' && this.shown?.seq === 'accept' && this.shown.rate > 0 && this.revealT !== null && !this.revealFree;
    this.shown = pose === 'accepted' ? { seq: 'accept', t: DURATIONS.accept, rate: 0 }
      : pose === 'declined' ? { seq: 'decline', t: DURATIONS.decline, rate: 0 } : null;
    if (revealEnded) {
      // Carry on from the last sample (within a frame of the reveal's end): never a jump.
      this.steamFree = true;
    } else if (!cutOfChange) this.steamRest();
    if (closeOn) this.revealFree = true;
    else if (!cutOfChange) this.revealRest();
    this.apply(frameFor(pose, this.frame));
  }

  sample(sequence: SequenceName, t: number): void {
    this.changeArmed = false;
    if (this.change && sequence !== this.change.next) {
      this.change = null;
      this.home = null;
      this.playDurations = DURATIONS;
    }
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
      this.revealT = this.steamT;
      this.revealFree = false;
    } else {
      this.steamT = null;
      this.revealT = null;
      this.revealFree = false;
    }
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

  /** v1.7: no reveal clock: at the accepted pose the camera is on the close-up. */
  private revealRest(): void {
    this.revealT = null;
    this.revealFree = false;
  }

  simulate(dt: number): void {
    if (this.revealFree && this.revealT !== null) {
      this.revealT += dt;
      // Landed: the accepted pose's close-up at rest.
      if (this.revealT >= CLOSE.to) this.revealRest();
    }
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
    return (this.steamFree && this.steamT !== null) || this.leftSteam.some((g) => g.t !== null) || (this.revealFree && this.revealT !== null);
  }

  /**
   * Snap the steam to rest, the steam left behind included (reduced motion, replay, the
   * director's deadlines). The settle that comes with a change of mind's cut is the exception:
   * steam already out keeps rising and disperses over its own life (interruptCut), as air would.
   */
  settle(): void {
    if (this.changeArmed) return;
    this.steamRest();
    this.revealRest();
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
    // v1.7: the close-up comes home from where it is, at the speed it had; the bin waits for it.
    // v1.7 polish: and the cover's return waits for the camera to leave the close-up (closeClearAt).
    const home = (this.home = planCloseHome(this.frameClose(), this.closeSpeed()));
    const plan = (this.change = planAnswerChange(from, at, rate, next, home?.span ?? 0, closeClearAt(home)));
    this.playDurations = plan.span === DURATIONS[next] ? DURATIONS : { ...DURATIONS, [next]: plan.span };
    this.changeArmed = true;
    this.revealRest();
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

  /**
   * v1.7 (#42): the close-up channel (pull.ts). On the reveal's clock while it plays and runs on
   * (0 until the cloud has gone, CLOSE); 1 at the accepted pose at rest; on a change of mind its own
   * homecoming (`closeHome`) and, back to the accept, the reveal's move again from its planned start;
   * 0 everywhere else (host, guest-ready, the decline, the declined pose).
   */
  frameClose(): number {
    const s = this.shown;
    if (!s) return 0;
    const c = this.change;
    if (c && s.seq === c.next) {
      const back = c.next === 'accept' && this.revealT !== null ? closeIn(this.revealT) : 0;
      return Math.min(1, closeHome(this.home, s.t) + back);
    }
    if (s.seq !== 'accept') return 0;
    if (s.rate > 0) return this.revealT !== null ? closeIn(this.revealT) : 0;
    return this.revealT !== null ? closeIn(this.revealT) : 1;
  }

  /** The close channel's rate now (1/s), for a change of mind's homecoming to leave at. */
  private closeSpeed(): number {
    const s = this.shown, c = this.change;
    if (!s) return 0;
    const live = this.revealT !== null && (s.rate > 0 || this.revealFree) ? closeRate(this.revealT) : 0;
    if (c && s.seq === c.next) {
      const h = 1e-4;
      const home = this.home ? (closeHome(this.home, s.t + h) - closeHome(this.home, Math.max(0, s.t - h))) / (s.t + h - Math.max(0, s.t - h)) : 0;
      return home + (c.next === 'accept' ? live : 0);
    }
    return s.seq === 'accept' ? live : 0;
  }

  /** Low tier for the imported plate and cloche materials (the library handles the bin). */
  setLowDetail(enabled: boolean): void {
    setImportedLowDetail(this.root, enabled);
    this.steam.setLowDetail(enabled);
    this.rig.card?.setLowDetail(enabled);
  }

  async precompile(renderer: WebGLRenderer, camera: Camera): Promise<void> {
    // The card's print is world-space detail seen at a grazing 15° and head-on in the close-up.
    this.rig.card?.setAnisotropy(renderer.capabilities.getMaxAnisotropy());
    // The steam is shown for the compile only; the bin warms itself once it has arrived (DeferredBin).
    const scene = this.root.parent ?? this.root;
    this.steam.showForCompile();
    await renderer.compileAsync(scene, camera);
    this.apply(this.frame);
  }

  /** v1.5: the decline (and the declined pose) needs the bin, which loads after ready. */
  needs(target: SequenceName | CanonicalPose): boolean {
    return (target === 'decline' || target === 'declined') && !this.bin.ready;
  }

  ensure(_target: SequenceName | CanonicalPose, context: DeferredContext): Promise<void> {
    this.view = context.camera;
    return this.bin.ensure(context);
  }

  prefetch(context: DeferredContext): Promise<void> {
    this.view = context.camera;
    return this.bin.prefetch(context);
  }

  /** The stage's camera, once the bin is loading (its entrance starts just out of the drawn view). */
  private view: Camera | null = null;

  /**
   * The bin at its sampled place, with its entrance (the sampled path runs along x from
   * DINNER_BIN_START to DINNER_BIN_POS) starting just out of the drawn view (binEntranceStart): the whole slide is seen,
   * at every canvas size and layout. Without a camera (tooling) the sampled path itself.
   */
  private placeBin(p: Vector3): void {
    const bin = this.rig.nodes.bin_root!;
    bin.position.copy(p);
    if (!this.view || p.x === DINNER_BIN_POS.x) return;
    const start = binEntranceStart(this.view, this.root, DINNER_BIN_POS.z, DINNER_BIN_POS.x, DINNER_BIN_SCALE);
    const e = (p.x - DINNER_BIN_START.x) / (DINNER_BIN_POS.x - DINNER_BIN_START.x);
    bin.position.x = start + e * (DINNER_BIN_POS.x - start);
  }

  dispose(): void {
    this.bin.dispose();
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
    this.placeBin(f.binPos);
    n.bin_root!.visible = f.binVisible;
    if (!this.binOccludes && this.bin.ready) {
      markDepthOccluders(n.bin_root!);
      this.binOccludes = true;
    }
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
 * v1.7 (#42): the close-up on the card. Near plan (80°: the card head-on with a hint of perspective,
 * the plate's porcelain round it), the shared azimuth kept so the key light holds, the same lens; the
 * card's width fills 55 % of the frame's (≈ 400 px of a 720 px poster, ≈ 640 device px of a 3× phone).
 * v1.7 polish (the judge's constant, tested in place): 55 %, not 65 %: the plate's raised ring then
 * circles the card at every aspect, and the gilt rim shows on the laptop, so the accepted poster
 * belongs to the set; the print stays legible (the eyebrow's capitals ≈ 14 device px on a laptop).
 */
export const CARD_VIEW = { azimuthDeg: CAMERA_ANGLES.azimuthDeg, elevationDeg: 80, widthFill: 0.55 } as const;

/** v1.7 (#41): the card's eyebrow when the config gives none. */
export const CARD_EYEBROW = 'You\u2019re invited';
/** What the card prints for a Dinner config (resolveConfig has sanitised it). */
export function cardText(config: Extract<SceneConfig, { category: 'dinner' }>): CardText {
  const c = config.card;
  return { eyebrow: c?.eyebrow ?? CARD_EYEBROW, title: c?.title, name: c?.name };
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
    // v1.5: the dish only; the bin (6.6 MB, only the decline shows it) loads after ready. Its
    // framing silhouette is computed from its design while the dish downloads.
    const dishFetch = fetchGlb(glbUrl, signal);
    // v1.7: the card's bundled face loads beside the dish, so its first print is in it (posters are deterministic).
    const font = loadCardFont();
    openBinSilhouette(DINNER_BIN_POS, DINNER_BIN_YAW, DINNER_BIN_SCALE);
    const dish = await gltfLoader().parseAsync(await dishFetch, '');
    await font;
    const root = dish.scene.getObjectByName('dinner_root');
    if (!root) throw Object.assign(new Error('missing dinner nodes'), { reason: 'asset-failure' as const });
    root.removeFromParent();
    bindMaterialsByName(root, library);
    // The plate and cloche masters keep their own PBR materials as authored: own environment for
    // the silver and the gilt, the Low tier's registry (models/imported.ts).
    prepareImported(root, library);
    // v1.4: the scene stands in the world at its real size (models/worldScale.ts).
    root.scale.setScalar(DINNER_WORLD_SCALE);
    return new DinnerScene(rigDinner(root, binPlaceholder(), library), config, library);
  },
};
