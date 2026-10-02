import { Box3, type Camera, Euler, type Object3D, Quaternion, Vector3, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import glbUrl from '../../../assets/scenes/birthday/birthday.glb?url';
import binUrl from '../../../assets/shared/disposal-bin.glb?url';
import { rigBirthday, type BirthdayRig } from '../../../models/birthday.ts';
import { poseFlame } from '../../../models/birthdayFire.ts';
import { BIN_POS, BIN_YAW, MASTER, CAKE_SCALE, WALL_Z } from '../../../models/birthdayContract.ts';
import type { CakePreset } from '../../../models/cake.ts';
import { BIN, flapAngles, openBinFramePoints } from '../../../models/disposalBin.ts';
import { disposeImported, loadMaterialVariants, prepareImported, setImportedLowDetail } from '../../../models/imported.ts';
import { bindMaterialsByName } from '../../../models/types.ts';
import { silhouettePoints } from '../../render/framing.ts';
import type { SceneInstance, SceneLoadContext, SceneModule } from '../../core/sequence.ts';
import type { CanonicalPose, SceneConfig, SequenceName } from '../../core/types.ts';
import { birthdayFramePoints } from './framing.ts';
import { MELT_CAP, meltState, newMeltState, SET_AFTER, solidify } from './melt.ts';
import { runGroove } from '../../../models/cakeShaders.ts';
import { CANDLE_LEAN, DURATIONS, ON_STAND } from './poses.ts';
import { frameFor, LEAN_AXIS, newFrame, sampleSequence, type BirthdayFrame } from './sequences.ts';
import { EMBER, emberAt, FLAME_REST, flameScale, FLICKER, flicker, newFlicker, SMOKE } from './fire.ts';

const UP = new Vector3(0, 1, 0);
/** Height of the upper tier's top above the cake's underside (cake space): the squash's lever. */
const CAKE_TOP_Y = (MASTER.tierTop - MASTER.cakeBottom) * CAKE_SCALE;

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
  /** v1.5 polish: seconds the blown-out candles have cooled at rest (the wax sets), capped. */
  private liveCool = 0;
  private restingOut = false;
  /**
   * An interruption (a change of mind) is under way: the director asks `interruptCut()` and then
   * calls `settle()`; the melt the guest watched form is carried across it instead of reset.
   */
  private interrupting = false;

  // ── Fire: the secondary channel (v1.5) ──
  /** Live clock (s) the flicker is sampled at; `simulate` advances it. */
  private liveTime = 0;
  /** Flicker gain: 0 after settle() (still flames), back to 1 over FLICKER.resume while simulating. */
  private flickerGain = 0;
  /** Smoke tail: the accept time the smoke and embers continue at after the sequence ends (null: none). */
  private tail: number | null = null;
  /** The last sampled sequence and time (the tail starts where accept left off). */
  private last: { sequence: SequenceName; t: number } | null = null;
  private readonly flicker = newFlicker();
  private readonly wicks: [number, number, number][];
  private readonly wickTmp = new Vector3();

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
      c.melt.groove.value = runGroove(d.x / l, d.z / l);
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
    // The accept sequence ending on its own pose hands the smoke over to the live clock: it keeps
    // rising from where the sequence left it (the canonical pose itself carries none).
    const last = this.last;
    this.tail = pose === 'accepted' && last?.sequence === 'accept' && last.t > DURATIONS.accept - 0.25 ? last.t : null;
    this.last = null;
    this.restingLit = pose === 'guest-ready';
    // The wax goes on setting on the live clock only where the guest watched the blow-out (as the
    // smoke); a canonical 'accepted' reached any other way is still.
    this.restingOut = this.tail !== null;
    this.apply(frameFor(pose, this.frame));
  }

  sample(sequence: SequenceName, t: number): void {
    this.tail = null;
    this.last = { sequence, t };
    this.restingLit = false;
    this.restingOut = false;
    this.apply(sampleSequence(sequence, t, this.frame));
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
      this.tail += dt;
      if (this.tail >= SMOKE.end) this.tail = null;
    }
    if (this.restingLit && this.liveLit < MELT_CAP) {
      this.liveLit = Math.min(MELT_CAP, this.liveLit + dt);
      this.applyMelt(this.frame);
    }
    if (this.cooling()) {
      this.liveCool += dt;
      this.applyMelt(this.frame);
    }
  }

  /** Frames are needed while any flame burns (it flickers), smoke is rising or the melt still forms. */
  settling(): boolean {
    return this.tail !== null || this.frame.flames.some((f) => f.intensity > 0) || (this.restingLit && this.liveLit < MELT_CAP) || this.cooling();
  }

  /** The blown-out wax is still setting on the live clock (until every pool and run has set). */
  private cooling(): boolean {
    return this.restingOut && this.frame.cool.some((c) => c > 0 && c + this.liveCool < SET_AFTER);
  }

  /** Rest: still flames (no flicker), no smoke, the melt back to the canonical pose's. */
  settle(): void {
    this.flickerGain = 0;
    this.tail = null;
    // A change of mind keeps the melt (the candles were really lit that long); load, replay and
    // reduced motion return it to the canonical pose's.
    if (!this.interrupting) this.liveLit = 0;
    this.interrupting = false;
    this.liveCool = 0;
    this.restingOut = false;
    this.applyMelt(this.frame);
  }

  /** Accept time the ember and smoke are drawn at (−1: none). */
  private smokeClock(): number {
    return this.frame.smokeTime >= 0 ? this.frame.smokeTime : this.tail ?? -1;
  }

  /** Compose the authored flames with the live flicker, the embers and the smoke, and draw them. */
  beforeRender(): void {
    const f = this.frame;
    const clock = this.smokeClock();
    const g = this.flickerGain;
    const gain = g * g * (3 - 2 * g);
    this.rig.candles.forEach((c, i) => {
      const flame = f.flames[i]!;
      flicker(i, this.liveTime, flame.intensity > 0 ? gain : 0, this.flicker);
      // The wick glows inside a burning flame; bare after the breath, it flares and cools.
      const ember = clock >= 0 ? emberAt(i, clock) : EMBER.lit * flame.lit * (flame.out ? 0 : 1);
      poseFlame(c.fire, c.candle, flame, this.flicker, ember);
      // Wick tip (burnt down by the melt) in cake_secondary space, for the smoke.
      const w = this.wickTmp.copy(c.fire.wickTip);
      w.y -= c.fire.shorten;
      w.applyQuaternion(c.candle.quaternion).add(c.candle.position);
      this.wicks[i]![0] = w.x;
      this.wicks[i]![1] = w.y;
      this.wicks[i]![2] = w.z;
    });
    this.rig.smoke.update(clock, this.wicks);
  }

  /** From the bin (or on the way), a straight blend back would pull the cake through the stand. */
  interruptCut(): boolean {
    this.interrupting = true;
    const f = this.frame;
    return f.binVisible || !f.cakeVisible || f.cakePos.distanceTo(ON_STAND) > 1e-3;
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
    for (const c of this.rig.candles) {
      c.fire.quad.visible = true;
      // The molten wax (hidden until the melt shows it) is warmed too.
      if (c.run) c.run.visible = true;
      if (c.pool) c.pool.visible = true;
    }
    this.rig.smoke.mesh.visible = true;
    this.rig.smoke.puffMesh.visible = true;
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
    applyMeltTo(this, f, this.liveLit, this.liveCool, this.melt);
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
    // The pushes compress the sponge: the cake squashes about its underside (volume kept).
    const sy = 1 + f.cakeDip / CAKE_TOP_Y;
    n.cake_secondary!.scale.set(1 + 0.5 * (1 - sy), sy, 1 + 0.5 * (1 - sy));
    // The plate's contact ring under the bead border goes as the cake leaves its seat.
    this.rig.plate.lift.value = f.cakePos.distanceTo(ON_STAND);
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
function applyMeltTo(scene: BirthdayScene, f: BirthdayFrame, live: number, liveCool: number, m: ReturnType<typeof newMeltState>): void {
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
      c.melt.b.value.set(m.bead, m.run, 0, 0);
      // Out: the pool and run set (the live cooling only after the canonical blow-out).
      c.melt.solid.value = solidify((f.cool[i] ?? 0) + ((f.cool[i] ?? 0) > 0 ? liveCool : 0));
      c.melt.foot.value = f.press[i] ?? 0;
    }
    // The molten wax shows once there is some: the pool in the cup, the run once it leaves the rim.
    if (c.pool) c.pool.visible = m.pool > 0.02;
    if (c.run) c.run.visible = m.run > 0.0002;
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

