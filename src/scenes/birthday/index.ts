import { Box3, type Camera, Euler, type Object3D, Quaternion, Vector3, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import glbUrl from '../../../assets/scenes/birthday/birthday.glb?url';
import { rigBirthday, type BirthdayRig } from '../../../models/birthday.ts';
import { poseFlame } from '../../../models/birthdayFire.ts';
import { BIN_POS, BIN_YAW, MASTER, CAKE_SCALE, WALL_Z } from '../../../models/birthdayContract.ts';
import type { CakePreset } from '../../../models/cake.ts';
import { BIN, binEntranceStart, binPlaceholder, flapAngles, openBinSilhouette } from '../../../models/disposalBin.ts';
import { disposeImported, loadMaterialVariants, prepareImported, setImportedLowDetail } from '../../../models/imported.ts';
import { bindMaterialsByName } from '../../../models/types.ts';
import { silhouettePoints } from '../../render/framing.ts';
import type { DeferredContext, SceneInstance, SceneLoadContext, SceneModule } from '../../core/sequence.ts';
import type { MaterialLibrary } from '../../render/materials.ts';
import { DeferredBin } from '../deferredBin.ts';
import type { CanonicalPose, SceneConfig, SequenceName } from '../../core/types.ts';
import { birthdayFramePoints, birthdayRestFramePoints } from './framing.ts';
import { MELT_CAP, meltState, newMeltState, SET_AFTER, solidify } from './melt.ts';
import { runGroove } from '../../../models/cakeShaders.ts';
import { BIN_AT, BIN_FROM, CANDLE_LEAN, DURATIONS, ON_STAND } from './poses.ts';
import {
  cakeAt, carryLean, FIRE_DONE, type FireChange, fireBegun, frameFor, LEAN_AXIS, newFrame, sampleSequence, SMOKE_EMIT_UNTIL, type BirthdayFrame,
} from './sequences.ts';
import { type AnswerChange, changeTime, planAnswerChange, sampleAnswerChange } from './change.ts';
import { birthdayPull } from './pull.ts';
import { ashAt, EMBER, emberAt, FLAME_REST, flameScale, FLICKER, flicker, MPS, newFlicker, SMOKE, type SmokeKind, WAKE, type WakeAt, wickChar } from './fire.ts';

const UP = new Vector3(0, 1, 0);
/** Half-step (s) of the carried cake's speed, for the smoke it strings out. */
const SPEED_H = 1 / 240;
/** The cake's path sampled for the wake (fire.ts WAKE): every WAKE_H s over the smoke's longest life. */
const WAKE_H = 1 / 30;
const WAKE_N = Math.ceil(8.5 / WAKE_H) + 1;
const WAKE_J = Math.ceil((3 * WAKE) / WAKE_H);
/** The wake kernel per grid step after a parcel's birth (e^−(j + ½)·H / WAKE). */
const WAKE_W = Array.from({ length: WAKE_J }, (_, j) => Math.exp(-((j + 0.5) * WAKE_H) / WAKE));

/**
 * Where the cake was on the smoke's clock, from `from` on (BirthdayScene.path): on the decline's
 * path at decline time b − `decline`, on a change of mind's playback (change.ts changeTime at
 * b − from), or (neither) on its stand.
 */
interface CakeSegment {
  from: number;
  decline?: number;
  change?: AnswerChange;
}
/** The plain decline: its smoke's clock is its own time. */
const DECLINE_PATH: readonly CakeSegment[] = [{ from: 0, decline: 0 }];
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
  /** v1.5 decline pull-back: at rest the frame holds the hero and the host's candles only. */
  readonly restFramePoints = birthdayRestFramePoints();

  private readonly frame = newFrame();
  /** What is showing: the last outcome sampled (or posed) and its time, for a change of mind. */
  private shown: { seq: SequenceName; t: number; rate: number } | null = null;
  /** The change of mind in progress (change.ts): the next outcome's playback rewinds the decline first. */
  private change: AnswerChange | null = null;
  /** The director poses guest-ready between interruptCut and the new outcome's first sample. */
  private changeArmed = false;
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
  /**
   * A change of mind with the cake on its stand (accept → decline): the fire under way, captured by
   * `interruptCut` and kept through the director's cut (settle, guest-ready) until the decline
   * takes it at t = 0 (`fire`). The candles the breath has reached stay out, their smoke rises on.
   * (From the decline, the change of mind is change.ts's rewind, which carries the fire the same way.)
   */
  private pendingFire: FireChange | null = null;
  private fire: FireChange | null = null;

  // ── Fire: the secondary channel (v1.5) ──
  /** Live clock (s) the flicker is sampled at; `simulate` advances it. */
  private liveTime = 0;
  /** Flicker gain: 0 after settle() (still flames), back to 1 over FLICKER.resume while simulating. */
  private flickerGain = 0;
  /**
   * Smoke tail: the smoke and embers carrying on after a playback has ended on its own pose, on the
   * smoke's clock (its kind's). Null: none.
   */
  private tail: { clock: number; kind: SmokeKind } | null = null;
  /** Where the cake was on the smoke's clock (latest segment last): where each parcel was born. */
  private path: readonly CakeSegment[] = [];
  /** The last sampled sequence and time (the tail starts where it left off). */
  private last: { sequence: SequenceName; t: number } | null = null;
  private readonly flicker = newFlicker();
  /** Each candle's wick tip in cake_secondary space (the melt burns it down), for the smoke. */
  private readonly wicks: [number, number, number][];
  private readonly wickTmp = new Vector3();
  private readonly cakeTmp = new Vector3();
  private readonly cakeTmp2 = new Vector3();
  private readonly cakeTmp3 = new Vector3();
  private readonly qBirth = new Quaternion();
  /** The densest smoke drawn last frame (the tail ends once nothing is left to see). */
  private smokePeak = 0;
  /**
   * The wake, per frame: the cake's position every WAKE_H s back from now (τ_k = now − (N−1−k)·H)
   * and, for each k, the weighted motion since τ_k (Σ_j ΔP_{k+j} · WAKE_W[j]), so smoke born at any
   * moment reads how far the moving cake has carried it with one interpolation.
   */
  private readonly wakeP = new Float32Array(WAKE_N * 3);
  private readonly wakeS = new Float32Array(WAKE_N * 3);
  private wakeT0 = 0;
  private readonly smokeWakeAt: WakeAt = (birth, out) => {
    const x = Math.min(Math.max((birth - this.wakeT0) / WAKE_H, 0), WAKE_N - 1);
    const k = Math.min(Math.floor(x), WAKE_N - 2), f = x - k;
    const S = this.wakeS;
    for (let c = 0; c < 3; c++) out[c] = S[k * 3 + c]! * (1 - f) + S[(k + 1) * 3 + c]! * f;
  };
  /** Smoke born at `birth` (smoke clock): candle i's wick then, in the room (made once: no per-frame closure). */
  private readonly smokeWick = (i: number, birth: number, out: [number, number, number]): number => {
    const s = this.cakeTimeAt(birth);
    const w = this.wicks[i]!;
    const v = this.wickTmp.set(w[0], w[1], w[2]);
    const lean = this.cakeFor(birth, this.cakeTmp);
    if (lean !== 0) v.applyQuaternion(this.qBirth.setFromAxisAngle(LEAN_AXIS, lean));
    out[0] = this.cakeTmp.x + v.x;
    out[1] = this.cakeTmp.y + v.y;
    out[2] = this.cakeTmp.z + v.z;
    // None is seen from wicks inside the bin.
    if (s !== null && s > SMOKE_EMIT_UNTIL) return -1;
    if (s === null && this.cakeTimeAt(birth + SPEED_H) === null) return 0;
    // How fast it moved through the air (a wick carried strings its vapour out).
    this.cakeFor(birth + SPEED_H, this.cakeTmp2);
    this.cakeFor(Math.max(0, birth - SPEED_H), this.cakeTmp3);
    return this.cakeTmp2.distanceTo(this.cakeTmp3) / (2 * SPEED_H * MPS);
  };

  /** v1.5: the shared bin, loaded after ready (only the decline shows it). */
  private readonly bin: DeferredBin;

  constructor(readonly rig: BirthdayRig, config: Extract<SceneConfig, { category: 'birthday' }>, library?: MaterialLibrary) {
    this.root = rig.root;
    this.bounds = rig.bounds.clone();
    this.preset = config.cake;
    const n = rig.nodes;
    this.animatedNodes = [
      n.cake_authored!, n.cake_secondary!, n.bin_root!, rig.flapL, rig.flapR,
      ...rig.candles.map((c) => c.candle),
    ];
    this.wicks = rig.candles.map(() => [0, 0, 0]);
    // The open bin's silhouette from its design (its GLB arrives after ready: openBinSilhouette).
    this.framePoints = [...birthdayFramePoints(), ...openBinSilhouette(BIN_POS, BIN_YAW)];
    this.bin = new DeferredBin(n.bin_root!, this.root, library, () => this.apply(this.frame));
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
    // The director's cut of a change of mind passes through guest-ready: the change stays armed.
    const c = this.change, cutOfChange = this.changeArmed;
    if (this.changeArmed) this.changeArmed = false;
    else this.change = null;
    if (pose !== 'guest-ready') this.pendingFire = null;
    const fire = this.fire;
    this.fire = null;
    // A playback ending on its own pose (accept → accepted, decline → declined) hands its smoke to
    // the live clock: it keeps rising from where the playback left it (the canonical pose carries none).
    const last = this.last, f = this.frame;
    const ended = !!last && ((pose === 'accepted' && last.sequence === 'accept') || (pose === 'declined' && last.sequence === 'decline')) && last.t > DURATIONS[last.sequence] - 0.25;
    this.tail = ended && f.smokeTime >= 0 && f.smokeTime < SMOKE.end ? { clock: f.smokeTime, kind: f.smokeKind } : null;
    this.last = null;
    this.restingLit = pose === 'guest-ready';
    this.shown = pose === 'accepted' ? { seq: 'accept', t: DURATIONS.accept, rate: 0 } : pose === 'declined' ? { seq: 'decline', t: DURATIONS.decline, rate: 0 } : null;
    // A change of mind played to its end rests on its outcome with the fire it carried: the candles
    // the snuff reached stay out, their melt where it was (the canonical pose would pop it).
    if (!cutOfChange && c && pose === (c.next === 'accept' ? 'accepted' : 'declined')) {
      this.apply(sampleAnswerChange(c, DURATIONS[c.next], this.frame));
      const sm = this.frame.smokeTime;
      this.tail = ended && sm >= 0 && sm < SMOKE.end ? { clock: sm, kind: this.frame.smokeKind } : null;
      this.frame.smokeTime = -1;
      this.restingOut = true;
      return;
    }
    // Likewise a decline that carried the breath's fire: it ends with that fire (lit time, wax).
    if (ended && fire && last) {
      this.apply(sampleSequence(last.sequence, DURATIONS[last.sequence], this.frame, fire));
      const sm = this.frame.smokeTime;
      this.tail = sm >= 0 && sm < SMOKE.end ? { clock: sm, kind: this.frame.smokeKind } : null;
      this.frame.smokeTime = -1;
      this.restingOut = true;
      return;
    }
    // The wax goes on setting on the live clock only where the guest watched the blow-out (as the
    // smoke); a canonical 'accepted' reached any other way is still.
    this.restingOut = this.tail !== null;
    this.apply(frameFor(pose, this.frame));
  }

  sample(sequence: SequenceName, t: number): void {
    const armed = this.changeArmed;
    this.changeArmed = false;
    if (this.change && sequence !== this.change.next) this.change = null;
    const c = this.change;
    // The director's cut after `interruptCut` (the cake on its stand) lands here at t = 0: the
    // carried fire takes over.
    const tookFire = !!this.pendingFire && this.last === null && t === 0 && sequence !== 'host' && !c;
    if (tookFire) this.fire = this.pendingFire;
    else if (this.last?.sequence !== sequence) this.fire = null;
    this.pendingFire = null;
    // Where the cake goes on the smoke's clock, set as a playback begins: a change appends to the
    // path its smoke was born along so far.
    const fresh = this.last === null || this.last.sequence !== sequence;
    if (armed && c) this.path = c.fire ? [...this.path, { from: c.fire.clock, change: c }] : c.next === 'decline' ? DECLINE_PATH : [];
    else if (tookFire && sequence === 'decline') this.path = [...this.path, { from: this.fire!.clock, decline: this.fire!.clock }];
    else if (fresh && !c && !tookFire) this.path = sequence === 'decline' ? DECLINE_PATH : [];
    this.tail = null;
    this.last = { sequence, t };
    this.shown = { seq: sequence, t, rate: 1 };
    this.restingLit = false;
    this.restingOut = false;
    this.apply(c ? sampleAnswerChange(c, t, this.frame) : sampleSequence(sequence, t, this.frame, this.fire));
  }

  /**
   * v1.5 decline pull-back: the camera eases out as the bin comes in and the cake is lifted
   * (src/render/framing.ts DECLINE_PULL), at the decline fit before the carry crests the rim. On a
   * change of mind from the decline it comes back in on its own curve as the decline rewinds (pull.ts).
   */
  framePull(): number {
    return birthdayPull(this.shown, this.change);
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
      if (this.tail.clock >= SMOKE.end || this.tailDone(this.tail)) this.tail = null;
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

  /**
   * The tail has nothing left to show: its smoke has thinned below what a screen shows (last
   * frame's densest point under 0.4 %) and, where the cake is in view, every ember is cold and
   * every ash tip formed. Then the loop may idle before SMOKE.end.
   */
  private tailDone(tail: { clock: number; kind: SmokeKind }): boolean {
    if (this.smokePeak >= 0.004) return false;
    if (!this.frame.cakeVisible) return true;
    for (let i = 0; i < this.rig.candles.length; i++) if (emberAt(i, tail.clock, tail.kind) > 0.005 || ashAt(i, tail.clock, tail.kind) < 1) return false;
    return true;
  }

  /** The blown-out wax is still setting on the live clock (until every pool and run has set). */
  private cooling(): boolean {
    return this.restingOut && this.frame.cool.some((c) => c > 0 && c + this.liveCool < SET_AFTER);
  }

  /** Rest: still flames (no flicker), no smoke, the melt back to the canonical pose's. */
  settle(): void {
    // The settle that comes with a change of mind's cut: nothing is snapped, the change carries it
    // (the fire, its smoke, the melt and the setting wax).
    if (this.changeArmed || this.pendingFire) {
      this.interrupting = false;
      return;
    }
    this.flickerGain = 0;
    // v1.6: the still flame is the same still every time (its volume's turbulence is carried on
    // this clock: posters, reduced motion); the flicker's gain is 0 here, so nothing jumps.
    this.liveTime = 0;
    this.tail = null;
    // A change of mind keeps the melt (the candles were really lit that long); load, replay and
    // reduced motion return it to the canonical pose's.
    if (!this.interrupting) this.liveLit = 0;
    this.interrupting = false;
    this.liveCool = 0;
    this.restingOut = false;
    this.applyMelt(this.frame);
  }

  /** The smoke's clock and kind now: the playback's, or the tail's (null: none). */
  private smoke(): { clock: number; kind: SmokeKind } | null {
    const f = this.frame;
    if (f.smokeTime < 0) return this.tail;
    this.smokeNow.clock = f.smokeTime;
    this.smokeNow.kind = f.smokeKind;
    return this.smokeNow;
  }
  private readonly smokeNow: { clock: number; kind: SmokeKind } = { clock: 0, kind: 'breath' };

  /** The cake's decline time when it was where smoke born at `b` (smoke clock) left it; null: on its stand. */
  private cakeTimeAt(b: number): number | null {
    for (let k = this.path.length - 1; k >= 0; k--) {
      const seg = this.path[k]!;
      if (b <= seg.from) continue;
      if (seg.change) {
        const [seq, s] = changeTime(seg.change, b - seg.from);
        return seq === 'decline' ? s : null;
      }
      return seg.decline !== undefined ? b - seg.decline : null;
    }
    return null;
  }

  /** Where the cake (cake_authored) was for smoke born at `b`, and how it was leaning. */
  private cakeFor(b: number, out: Vector3): number {
    const s = this.cakeTimeAt(b);
    if (s === null) {
      out.copy(ON_STAND);
      return 0;
    }
    cakeAt(s, out);
    return carryLean(s);
  }

  /** Compose the authored flames with the live flicker, the embers and the smoke, and draw them. */
  beforeRender(): void {
    const f = this.frame;
    const sm = this.smoke();
    const g = this.flickerGain;
    const gain = g * g * (3 - 2 * g);
    this.rig.candles.forEach((c, i) => {
      const flame = f.flames[i]!;
      flicker(i, this.liveTime, flame.intensity > 0 ? gain : 0, this.flicker);
      // v1.6: whether the scene is live, for the heat haze that runs on into the plume once out.
      this.flicker.gain = gain;
      // The wick glows inside a burning flame; bare after the breath, it flares and cools to ash.
      const ember = sm ? emberAt(i, sm.clock, sm.kind) : EMBER.lit * flame.lit * (flame.out ? 0 : 1);
      const char = wickChar((f.litTime[i] ?? 0) + this.liveLit);
      c.fire.wick.char.value = char;
      c.fire.wick.ash.value = sm ? ashAt(i, sm.clock, sm.kind) : flame.out && char > 0 ? 1 : 0;
      poseFlame(c.fire, c.candle, flame, this.flicker, ember);
      // Wick tip (burnt down by the melt, curled as it chars) in cake_secondary space, for the smoke.
      const w = this.wickTmp.copy(c.fire.wickTip).addScaledVector(c.fire.curlTip, char);
      w.y -= c.fire.shorten;
      w.applyQuaternion(c.candle.quaternion).add(c.candle.position);
      this.wicks[i]![0] = w.x;
      this.wicks[i]![1] = w.y;
      this.wicks[i]![2] = w.z;
    });
    // The smoke rises in the room (birthday_root): each parcel from where its wick was when it was
    // born, on the cake on its stand or on its way to (or back from) the bin; none is seen from
    // wicks inside the bin.
    this.smokePeak = sm ? this.rig.smoke.update(sm.clock, sm.kind, this.smokeWick, this.buildWake(sm.clock) ? this.smokeWakeAt : undefined) : this.rig.smoke.update(-1, 'breath', this.smokeWick);
  }

  /** Sample the cake's path for the wake at smoke clock `t`; false when it has not moved (no wake). */
  private buildWake(t: number): boolean {
    if (this.path.length === 0) return false;
    this.wakeT0 = t - (WAKE_N - 1) * WAKE_H;
    const P = this.wakeP, S = this.wakeS;
    let moved = false;
    for (let k = 0; k < WAKE_N; k++) {
      this.cakeFor(this.wakeT0 + k * WAKE_H, this.cakeTmp);
      P[k * 3] = this.cakeTmp.x; P[k * 3 + 1] = this.cakeTmp.y; P[k * 3 + 2] = this.cakeTmp.z;
      if (k > 0 && !moved) moved = P[k * 3] !== P[k * 3 - 3] || P[k * 3 + 1] !== P[k * 3 - 2] || P[k * 3 + 2] !== P[k * 3 - 1];
    }
    if (!moved) return false;
    for (let k = 0; k < WAKE_N; k++) {
      let x = 0, y = 0, z = 0;
      for (let j = 0; j < WAKE_J && k + j + 1 < WAKE_N; j++) {
        const a = (k + j) * 3, b = a + 3, w = WAKE_W[j]!;
        x += (P[b]! - P[a]!) * w; y += (P[b + 1]! - P[a + 1]!) * w; z += (P[b + 2]! - P[a + 2]!) * w;
      }
      S[k * 3] = x; S[k * 3 + 1] = y; S[k * 3 + 2] = z;
    }
    return true;
  }

  /**
   * A change of mind. From the decline (playing, declined, or rewinding) a straight blend back would
   * pull the cake through the stand and a cut teleports it: the director is asked to cut, and the
   * cut is never seen, because the next playback first rewinds the decline along its own path from
   * exactly the current frame (change.ts), the camera with it (pull.ts); changing back to the
   * decline mid-rewind plays it on from where it is. With the cake on its stand (accept, or a
   * change's accept) the director is asked to cut too, and the decline continues exactly this
   * frame. Either way the fire under way is carried across: blown-out or snuffed candles stay out
   * (a flame mid-extinction goes on going out on its own clock), their smoke keeps rising on its
   * own clock, and the lit time is kept so the melt does not pop back (`interrupting`). Before any
   * fire has begun, with the cake on its stand, the lit cake blends as before (lit time kept).
   */
  interruptCut(): boolean {
    this.interrupting = true;
    this.pendingFire = null;
    const s = this.shown, c = this.change;
    const [from, at, rate] = c && s && s.seq === c.next ? changeTime(c, s.t) : s ? [s.seq, s.t, s.rate] as const : [null, 0, 0] as const;
    const sm = this.smoke();
    const fire = sm && fireBegun(sm.kind, sm.clock) ? { kind: sm.kind, clock: sm.clock } : null;
    if (s && from === 'decline') {
      this.change = planAnswerChange('decline', at, rate, s.seq === 'accept' ? 'decline' : 'accept', fire);
      this.changeArmed = true;
      return true;
    }
    this.change = null;
    const f = this.frame;
    if (from === 'host') return f.binVisible || !f.cakeVisible || f.cakePos.distanceTo(ON_STAND) > 1e-3;
    // The cake on its stand: the fire under way, or (a canonical blown-out cake) a fire long done.
    if (fire) this.pendingFire = fire;
    else if (s && s.rate === 0 && f.flames.every((fl) => fl.out)) this.pendingFire = { kind: 'breath', clock: FIRE_DONE };
    return this.pendingFire !== null;
  }

  /** Low tier for the imported stand, frosting and candle materials (the library handles the rest). */
  setLowDetail(enabled: boolean): void {
    setImportedLowDetail(this.root, enabled);
  }

  async precompile(renderer: WebGLRenderer, camera: Camera): Promise<void> {
    // Warm both frostings, the flames and the smoke (made visible for the compile only); the bin
    // warms itself once it has arrived (DeferredBin).
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
    await renderer.compileAsync(scene, camera);
    this.rig.setPreset(this.preset === 'vanilla' ? 'cocoa' : 'vanilla');
    await renderer.compileAsync(scene, camera);
    this.rig.setPreset(this.preset);
    this.apply(this.frame);
    this.beforeRender();
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
   * The bin at its sampled place, with its entrance (the sampled path runs along x from BIN_FROM to
   * BIN_AT) starting just out of the drawn view (binEntranceStart): the whole slide is seen,
   * at every canvas size and layout. Without a camera (tooling) the sampled path itself.
   */
  private placeBin(p: Vector3): void {
    const bin = this.rig.nodes.bin_root!;
    bin.position.copy(p);
    if (!this.view || p.x === BIN_AT.x) return;
    const start = binEntranceStart(this.view, this.root, BIN_AT.z, BIN_AT.x, 1);
    const e = (p.x - BIN_FROM.x) / (BIN_AT.x - BIN_FROM.x);
    bin.position.x = start + e * (BIN_AT.x - start);
  }

  dispose(): void {
    this.bin.dispose();
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
    this.placeBin(f.binPos);
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
    // v1.5: the cake only; the bin (6.6 MB, only the decline shows it) loads after ready. Its
    // framing silhouette is computed from its design while the cake downloads.
    const cakeFetch = fetchGlb(glbUrl, signal);
    openBinSilhouette(BIN_POS, BIN_YAW);
    const cake = await new GLTFLoader().parseAsync(await cakeFetch, '');
    const root = cake.scene.getObjectByName('birthday_root');
    if (!root) throw Object.assign(new Error('missing birthday nodes'), { reason: 'asset-failure' as const });
    // Frosting presets live in the GLB (KHR_materials_variants); read them before detaching the root.
    const variants = await loadMaterialVariants(cake);
    root.removeFromParent();
    bindMaterialsByName(root, library);
    prepareImported(root, library, variants.materials);
    const rig = rigBirthday(root, binPlaceholder(), library, config.cake, variants);
    return new BirthdayScene(rig, config, library);
  },
};

