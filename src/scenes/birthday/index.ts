import { Box3, type Camera, Euler, type Object3D, Quaternion, Vector3, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import glbUrl from '../../../assets/scenes/birthday/birthday.glb?url';
import binUrl from '../../../assets/shared/disposal-bin.glb?url';
import { rigBirthday, type BirthdayRig } from '../../../models/birthday.ts';
import { poseFlame } from '../../../models/birthdayFire.ts';
import { BIN_POS, BIN_YAW, WALL_Z } from '../../../models/birthdayContract.ts';
import type { CakePreset } from '../../../models/cake.ts';
import { BIN, flapAngles, openBinFramePoints } from '../../../models/disposalBin.ts';
import { disposeImported, loadMaterialVariants, prepareImported, setImportedLowDetail } from '../../../models/imported.ts';
import { bindMaterialsByName } from '../../../models/types.ts';
import { silhouettePoints } from '../../render/framing.ts';
import type { SceneInstance, SceneLoadContext, SceneModule } from '../../core/sequence.ts';
import type { CanonicalPose, SceneConfig, SequenceName } from '../../core/types.ts';
import { birthdayFramePoints } from './framing.ts';
import { MELT_CAP, meltState, newMeltState } from './melt.ts';
import { CANDLE_LEAN, DURATIONS, ON_STAND } from './poses.ts';
import { cakeAt, carryLean, FIRE_DONE, type FireChange, fireBegun, frameFor, LEAN_AXIS, newFrame, sampleSequence, SMOKE_EMIT_UNTIL, type BirthdayFrame } from './sequences.ts';
import { ashAt, EMBER, emberAt, FLAME_REST, flameScale, FLICKER, flicker, MPS, newFlicker, SMOKE, type SmokeKind, wickChar } from './fire.ts';

const UP = new Vector3(0, 1, 0);
/** Half-step (s) of the carried cake's speed, for the smoke it strings out. */
const SPEED_H = 1 / 240;

export class BirthdayScene implements SceneInstance {
  readonly category = 'birthday' as const;
  readonly root: Object3D;
  readonly bounds: Box3;
  /** Silhouette of the objects on stage at guest-ready: the v1.4 framing rule's hero. */
  readonly heroPoints: Vector3[];
  readonly durations = DURATIONS;
  readonly animatedNodes: Object3D[];
  readonly studio = { wallZ: WALL_Z };
  readonly framePoints: Vector3[];

  private readonly frame = newFrame();
  private preset: CakePreset;
  private readonly qYaw = new Quaternion();
  private readonly qTilt = new Quaternion();
  private readonly qLean = new Quaternion();
  private readonly euler = new Euler();
  private readonly axis = new Vector3();
  private readonly rimWorld = new Vector3();
  private readonly melt = newMeltState();
  /**
   * v1.5 live melt: seconds the candles have burnt at rest at guest-ready beyond the authored clip
   * (advanced by `simulate`, capped at MELT_CAP). It carries into accept, so the melt the guest
   * watched form stays when the flames go out; `settle()` (load, reduced motion, interruption,
   * replay) returns it to 0, and reduced motion never advances it: canonical poses stay exact.
   */
  private liveLit = 0;
  private restingLit = false;

  // ── Fire: the secondary channel (v1.5) ──
  /** Live clock (s) the flicker is sampled at; `simulate` advances it. */
  private liveTime = 0;
  /** Flicker gain: 0 after settle() (still flames), back to 1 over FLICKER.resume while simulating. */
  private flickerGain = 0;
  /**
   * Smoke tail: the smoke and embers carrying on after a sequence has ended on its own pose, on the
   * smoke's clock (its kind's; `carry`: when the cake set off, frame.smokeCarry). Null: none.
   */
  private tail: { clock: number; kind: SmokeKind; carry: number } | null = null;
  /** The last sampled sequence and time (the tail starts where it left off). */
  private last: { sequence: SequenceName; t: number } | null = null;
  /**
   * A change of mind (v1.5): the fire already under way, captured by `interruptCut` and kept
   * through the director's cut (settle, guest-ready) until the next sequence takes it over at t = 0.
   * The candles the breath or a snuff has reached stay out and their smoke keeps rising.
   */
  private pendingChange: FireChange | null = null;
  private change: FireChange | null = null;
  /** The cut keeps the live lit time (the melt the guest watched form does not pop back). */
  private keepLive = false;
  private readonly flicker = newFlicker();
  /** Each candle's wick tip in cake_secondary space (the melt burns it down), for the smoke. */
  private readonly wicks: [number, number, number][];
  private readonly wickTmp = new Vector3();
  private readonly cakeTmp = new Vector3();
  private readonly cakeTmp2 = new Vector3();
  private readonly qBirth = new Quaternion();

  constructor(readonly rig: BirthdayRig, config: Extract<SceneConfig, { category: 'birthday' }>) {
    this.root = rig.root;
    this.bounds = rig.bounds.clone();
    this.preset = config.cake;
    const n = rig.nodes;
    this.animatedNodes = [
      n.cake_authored!, n.cake_secondary!, n.bin_root!, rig.flapL, rig.flapR,
      ...rig.candles.map((c) => c.candle),
    ];
    this.wicks = rig.candles.map(() => [0, 0, 0]);
    this.framePoints = [...birthdayFramePoints(), ...openBinFramePoints(n.bin_root!, BIN_POS, BIN_YAW)];
    // Each candle's low side (its lean's direction), in its master candle's own frame: where its run goes.
    rig.candles.forEach((c, i) => {
      if (!c.melt || !c.wax) return;
      const a = CANDLE_LEAN[i]!.azimuth;
      const d = new Vector3(Math.cos(a), 0, Math.sin(a)).applyQuaternion(c.wax.quaternion.clone().invert());
      const l = Math.hypot(d.x, d.z) || 1;
      c.melt.dir.value = { x: d.x / l, y: d.z / l };
    });
    this.pose('guest-ready');
    // The hero: every real mesh (the fire's camera-facing quads and ribbons excluded), plus each
    // steady flame's envelope (tip and widest ring).
    this.heroPoints = [...silhouettePoints(this.root, (o) => !!o.userData.fx), ...this.flamePoints()];
  }

  /** Steady flames' silhouettes in the root's space: tip and the widest ring of each. */
  private flamePoints(): Vector3[] {
    const pts: Vector3[] = [];
    this.root.updateMatrixWorld(true);
    const toRoot = this.root.matrixWorld.clone().invert();
    this.rig.candles.forEach((c, i) => {
      const w = c.fire.wickTip;
      const k = flameScale(i);
      const at = (x: number, y: number, z: number) => pts.push(new Vector3(x, y, z).applyMatrix4(c.candle.matrixWorld).applyMatrix4(toRoot));
      at(w.x, FLAME_REST.base + k * FLAME_REST.length, w.z);
      const y = FLAME_REST.base + FLAME_REST.widest * k * FLAME_REST.length;
      for (let n = 0; n < 8; n++) {
        const a = (n / 8) * Math.PI * 2;
        at(w.x + Math.cos(a) * k * FLAME_REST.radius, y, w.z + Math.sin(a) * k * FLAME_REST.radius);
      }
    });
    return pts;
  }

  setConfig(config: SceneConfig): void {
    if (config.category !== 'birthday' || config.cake === this.preset) return;
    this.preset = config.cake;
    this.rig.setPreset(config.cake);
  }

  pose(pose: CanonicalPose): void {
    // A sequence ending on its own pose (accept → accepted, decline → declined) hands its smoke to
    // the live clock: it keeps rising from where the sequence left it (the canonical pose carries none).
    const last = this.last, f = this.frame;
    const ended = !!last && ((pose === 'accepted' && last.sequence === 'accept') || (pose === 'declined' && last.sequence === 'decline')) && last.t > DURATIONS[last.sequence] - 0.25;
    this.tail = ended && f.smokeTime >= 0 && f.smokeTime < SMOKE.end ? { clock: f.smokeTime, kind: f.smokeKind, carry: f.smokeCarry } : null;
    // The director's cut after `interruptCut` passes through guest-ready: the change stays pending.
    if (pose !== 'guest-ready') this.pendingChange = null;
    this.change = null;
    this.last = null;
    this.restingLit = pose === 'guest-ready';
    this.apply(frameFor(pose, this.frame));
  }

  sample(sequence: SequenceName, t: number): void {
    // The director's cut after `interruptCut` lands here at t = 0: the carried fire takes over.
    if (this.pendingChange && this.last === null && t === 0 && sequence !== 'host') this.change = this.pendingChange;
    else if (this.last?.sequence !== sequence) this.change = null;
    this.pendingChange = null;
    this.tail = null;
    this.last = { sequence, t };
    this.restingLit = false;
    this.apply(sampleSequence(sequence, t, this.frame, this.change));
  }

  /**
   * The live channel (never under reduced motion): the flicker clock, the smoke tail after accept,
   * and the candles burning on at rest (guest-ready: the melt keeps forming, up to its cap, at the
   * steady flame's burn rate of 1).
   */
  simulate(dt: number): void {
    this.liveTime += dt;
    this.flickerGain = Math.min(1, this.flickerGain + dt / FLICKER.resume);
    if (this.tail !== null) {
      this.tail.clock += dt;
      if (this.tail.clock >= SMOKE.end) this.tail = null;
    }
    if (this.restingLit && this.liveLit < MELT_CAP) {
      this.liveLit = Math.min(MELT_CAP, this.liveLit + dt);
      this.applyMelt(this.frame);
    }
  }

  /** Frames are needed while any flame burns (it flickers), smoke is rising or the melt still forms. */
  settling(): boolean {
    return this.tail !== null || this.frame.flames.some((f) => f.intensity > 0) || (this.restingLit && this.liveLit < MELT_CAP);
  }

  /**
   * Rest: still flames (no flicker), no smoke, the melt back to the canonical pose's. Right after
   * a change of mind's `interruptCut` the lit time is kept (the fire it carries keeps the smoke).
   */
  settle(): void {
    this.flickerGain = 0;
    this.tail = null;
    if (!this.keepLive) this.liveLit = 0;
    this.keepLive = false;
    this.applyMelt(this.frame);
  }

  /** The smoke's clock, kind and carry now: the sequence's, or the tail's (null: none). */
  private smoke(): { clock: number; kind: SmokeKind; carry: number } | null {
    const f = this.frame;
    if (f.smokeTime >= 0) return { clock: f.smokeTime, kind: f.smokeKind, carry: f.smokeCarry };
    return this.tail;
  }

  /** Compose the authored flames with the live flicker, the embers and the smoke, and draw them. */
  beforeRender(): void {
    const f = this.frame;
    const sm = this.smoke();
    const clock = sm?.clock ?? -1;
    const g = this.flickerGain;
    const gain = g * g * (3 - 2 * g);
    this.rig.candles.forEach((c, i) => {
      const flame = f.flames[i]!;
      flicker(i, this.liveTime, flame.intensity > 0 ? gain : 0, this.flicker);
      // The wick glows inside a burning flame; bare after the breath, it flares and cools to ash.
      const ember = sm ? emberAt(i, sm.clock, sm.kind) : EMBER.lit * flame.lit * (flame.out ? 0 : 1);
      const char = wickChar((f.litTime[i] ?? 0) + this.liveLit);
      c.fire.wick.char.value = char;
      c.fire.wick.ash.value = sm ? ashAt(i, sm.clock, sm.kind) : flame.out && char > 0 ? 1 : 0;
      poseFlame(c.fire, c.candle, flame, this.flicker, ember);
      // Wick tip (burnt down by the melt) in cake_secondary space, for the smoke.
      const w = this.wickTmp.copy(c.fire.wickTip);
      w.y -= c.fire.shorten;
      w.applyQuaternion(c.candle.quaternion).add(c.candle.position);
      this.wicks[i]![0] = w.x;
      this.wicks[i]![1] = w.y;
      this.wicks[i]![2] = w.z;
    });
    // The smoke rises in the room (birthday_root): each parcel from where its wick was when it was
    // born, on the cake on its stand or, once it set off for the bin, carried (sequences.ts cakeAt).
    if (!sm) {
      this.rig.smoke.update(-1, 'breath', () => {});
      return;
    }
    const carry = sm.carry;
    this.rig.smoke.update(clock, sm.kind, (i, birth, out) => {
      const w = this.wicks[i]!;
      const v = this.wickTmp.set(w[0], w[1], w[2]);
      let p = this.cakeTmp.copy(ON_STAND);
      let speed = 0;
      if (carry >= 0 && birth > carry) {
        // On the carried cake: where it was then, leaning as it swung, and how fast it moved.
        const td = birth - carry;
        speed = cakeAt(td + SPEED_H, this.cakeTmp).distanceTo(cakeAt(Math.max(0, td - SPEED_H), this.cakeTmp2)) / (2 * SPEED_H * MPS);
        p = cakeAt(td, this.cakeTmp);
        v.applyQuaternion(this.qBirth.setFromAxisAngle(LEAN_AXIS, carryLean(td)));
      }
      out[0] = p.x + v.x;
      out[1] = p.y + v.y;
      out[2] = p.z + v.z;
      return speed;
    }, carry >= 0 ? carry + SMOKE_EMIT_UNTIL : Infinity);
  }

  /**
   * A change of mind. From the bin (or on the way) a straight blend back would pull the cake
   * through the stand: cut to the lit cake on its stand, as before. Otherwise the fire already under
   * way is carried across (the director's 0 ms cut, then the new sequence continues it): blown-out
   * or snuffed candles stay out, their smoke keeps rising on its own clock, and the lit time is kept
   * so the melt does not pop back. Before any fire has begun the lit cake blends as before (lit time kept).
   */
  interruptCut(): boolean {
    const f = this.frame;
    const lifted = !f.cakeVisible || f.cakePos.distanceTo(ON_STAND) > 1e-3;
    const cut = lifted || f.binVisible;
    const seq = this.last?.sequence ?? null;
    this.pendingChange = null;
    if (seq === 'host') return cut;
    this.keepLive = true;
    // Lifted off its stand: the clean cut back to the lit cake (the accept then has its candles to blow).
    if (lifted) return true;
    const sm = this.smoke();
    if (sm && fireBegun(sm.kind, sm.clock)) this.pendingChange = { kind: sm.kind, clock: sm.clock };
    else if (seq === null && f.flames.every((fl) => fl.out)) this.pendingChange = { kind: 'breath', clock: FIRE_DONE };
    return cut || this.pendingChange !== null;
  }

  /** Low tier for the imported stand, frosting and candle materials (the library handles the rest). */
  setLowDetail(enabled: boolean): void {
    setImportedLowDetail(this.root, enabled);
  }

  async precompile(renderer: WebGLRenderer, camera: Camera): Promise<void> {
    // Warm both frostings, the bin, the flames and the smoke (made visible for the compile only).
    const scene = this.root.parent ?? this.root;
    const n = this.rig.nodes;
    n.bin_root!.visible = true;
    for (const c of this.rig.candles) c.fire.quad.visible = true;
    this.rig.smoke.mesh.visible = true;
    await renderer.compileAsync(scene, camera);
    this.rig.setPreset(this.preset === 'vanilla' ? 'cocoa' : 'vanilla');
    await renderer.compileAsync(scene, camera);
    this.rig.setPreset(this.preset);
    this.apply(this.frame);
    this.beforeRender();
  }

  dispose(): void {
    this.rig.dispose();
    disposeImported(this.root);
    this.root.traverse((o) => (o as { geometry?: { dispose(): void } }).geometry?.dispose());
    this.root.removeFromParent();
  }

  // ── internals ─────────────────────────────────────────────────────────────
  private applyMelt(f: BirthdayFrame): void {
    applyMeltTo(this, f, this.liveLit, this.melt);
  }

  private apply(f: BirthdayFrame): void {
    const n = this.rig.nodes;
    n.cake_authored!.position.copy(f.cakePos);
    n.cake_authored!.visible = f.cakeVisible;
    // Bin shade on the cake's materials once it is over the opening (rim height in world space).
    this.root.updateWorldMatrix(true, false);
    this.rig.binShade.rimY.value = this.rimWorld.set(0, BIN.rimTop, 0).applyMatrix4(this.root.matrixWorld).y;
    this.rig.binShade.on.value = f.cakeInBin ? 1 : 0;
    // Carry lean about the horizontal axis across the carry, the cake's give under the candles'
    // pushes (a sub-millimetre dip and tilt on its underside centre), then the presentation yaw.
    this.qTilt.setFromEuler(this.euler.set(f.cakeTiltX, 0, f.cakeTiltZ));
    n.cake_secondary!.quaternion.setFromAxisAngle(LEAN_AXIS, f.cakeLean).multiply(this.qTilt).multiply(this.qYaw.setFromAxisAngle(UP, f.cakeYaw));
    n.cake_secondary!.position.y = f.cakeDip;
    this.rig.candles.forEach((c, i) => {
      c.candle.position.y = c.seatedY + (f.drop[i] ?? 0);
      // A hand-placed candle's lean, about its base (the top leans towards its azimuth).
      const lean = CANDLE_LEAN[i]!;
      this.axis.set(Math.sin(lean.azimuth), 0, -Math.cos(lean.azimuth));
      c.candle.quaternion.setFromAxisAngle(this.axis, lean.angle * (f.lean[i] ?? 0));
      // A flame stands up whatever its candle does: its node undoes the candle's lean (the fire rig
      // then stands the flame along world up and leans it with the breath, models/birthdayFire.ts).
      c.flame.quaternion.copy(this.qLean.copy(c.candle.quaternion).invert());
    });
    this.applyMelt(f);
    // The flames, embers and smoke are drawn in beforeRender (with the live flicker on top).
    n.bin_root!.position.copy(f.binPos);
    n.bin_root!.visible = f.binVisible;
    const [l, r] = flapAngles(f.flaps);
    this.rig.flapL.rotation.set(0, 0, l);
    this.rig.flapR.rotation.set(0, 0, r);
  }
}

/** The scene's private melt step, shared by apply and simulate. */
function applyMeltTo(scene: BirthdayScene, f: BirthdayFrame, live: number, m: ReturnType<typeof newMeltState>): void {
  const press = scene.rig.press.press.value;
  scene.rig.candles.forEach((c, i) => {
    meltState(i, (f.litTime[i] ?? 0) + live, m);
    // The top burns down: wick and flame go with it (the fire owner's flame reads candleShortening).
    c.wick.position.y = c.wickY - m.shorten;
    c.flame.position.y = c.flameY - m.shorten;
    // The flame's base, its ember and its smoke follow the wick down (models/birthdayFire.ts).
    c.fire.shorten = m.shorten;
    if (c.melt) {
      c.melt.a.value.set(m.shorten, m.round, m.soften, m.pool);
      // Run half-width 1.1 mm (scene units).
      c.melt.b.value.set(m.bead, m.run, 0.0055, 0);
    }
    const lean = CANDLE_LEAN[i]!;
    press[i]?.set(f.press[i] ?? 0, m.gloss, lean.azimuth, f.lean[i] ?? 0);
  });
}

async function fetchGlb(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw Object.assign(new Error(`asset ${res.status}`), { reason: 'asset-failure' as const });
  return res.arrayBuffer();
}

export const birthdayScene: SceneModule = {
  category: 'birthday',
  async load({ config, library, signal }: SceneLoadContext): Promise<SceneInstance> {
    if (config.category !== 'birthday') throw new Error('birthday scene given another config');
    const [cakeBuffer, binBuffer] = await Promise.all([fetchGlb(glbUrl, signal), fetchGlb(binUrl, signal)]);
    const loader = new GLTFLoader();
    const [cake, bin] = await Promise.all([loader.parseAsync(cakeBuffer, ''), loader.parseAsync(binBuffer, '')]);
    const root = cake.scene.getObjectByName('birthday_root');
    const binRoot = bin.scene.getObjectByName('bin_root');
    if (!root || !binRoot) throw Object.assign(new Error('missing birthday nodes'), { reason: 'asset-failure' as const });
    // Frosting presets live in the GLB (KHR_materials_variants); read them before detaching the root.
    const variants = await loadMaterialVariants(cake);
    root.removeFromParent();
    binRoot.removeFromParent();
    bindMaterialsByName(root, library);
    prepareImported(root, library, variants.materials);
    bindMaterialsByName(binRoot, library);
    const rig = rigBirthday(root, binRoot, library, config.cake, variants);
    return new BirthdayScene(rig, config);
  },
};

