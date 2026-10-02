import { afterAll, describe, expect, it, vi } from 'vitest';
import { Color, MeshStandardMaterial } from 'three';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { createFlameMaterial } from '../src/render/flame.ts';
import { declinePull } from '../src/render/framing.ts';
import { VisualDirector } from '../src/core/visualDirector.ts';
import { rigBirthday } from '../models/birthday.ts';
import { buildBirthdayGeometry } from '../models/birthdayParts.ts';
import { BIN, buildDisposalBin } from '../models/disposalBin.ts';
import { CAKE_TOTAL_HEIGHT } from '../models/birthdayContract.ts';
import { BirthdayScene } from '../src/scenes/birthday/index.ts';
import { CANDLE_COUNT, DURATIONS, ON_STAND } from '../src/scenes/birthday/poses.ts';
import { type BirthdayFrame, frameFor, newFrame, sampleSequence } from '../src/scenes/birthday/sequences.ts';
import {
  type AnswerChange, binStep, cakeStep, changeTime, CONTENT_END, declinePace, HIDDEN_DEPTH, planAnswerChange, REWIND, sampleAnswerChange,
} from '../src/scenes/birthday/change.ts';
import { birthdayPull, cameraSpan, PULL_TOP_SPEED } from '../src/scenes/birthday/pull.ts';

/**
 * v1.5 change of mind, declined → accept (guest-experience review: a one-frame cut teleported the
 * cake out of the bin onto its stand, lit, and reframed the camera). The decline rewinds along its
 * own path (change.ts), the camera with it (pull.ts), then the accept plays; the fire is never
 * rewound. As Dinner's tests (tests/dinner.test.ts, tests/pull.test.ts).
 */

const FRAME = 1 / 60;
/** Ten change times along the decline (each beat: the bin coming in, the lift, the carry, the drop, the close) and the declined pose. */
const CHANGES = [0.06, 0.18, 0.3, 0.45, 0.6, 0.72, 0.85, 1.0, 1.2, CONTENT_END.decline];
const planAt = (a: number) => planAnswerChange('decline', a, a < CONTENT_END.decline ? 1 : 0, 'accept');
const sameMotion = (a: BirthdayFrame, b: BirthdayFrame, label: string, eps = 1e-6) => {
  expect(a.cakePos.distanceTo(b.cakePos), label).toBeLessThan(eps);
  expect(Math.abs(a.cakeLean - b.cakeLean), label).toBeLessThan(eps);
  expect(a.binPos.distanceTo(b.binPos), label).toBeLessThan(eps);
  expect(Math.abs(a.flaps - b.flaps), label).toBeLessThan(eps);
  expect(a.cakeVisible, label).toBe(b.cakeVisible);
};

describe('Birthday change of mind: declined → accept rewinds the decline (no cut)', () => {
  /** Largest 60 fps step of the cake and of the bin over [t0, t1] of a change's playback. */
  const fastest = (c: AnswerChange, t0: number, t1: number) => {
    let prev = sampleAnswerChange(c, t0, newFrame()), cake = 0, bin = 0;
    for (let t = t0 + FRAME; t <= t1 + 1e-9; t += FRAME) {
      const f = sampleAnswerChange(c, t, newFrame());
      cake = Math.max(cake, cakeStep(prev, f));
      bin = Math.max(bin, binStep(prev, f));
      prev = f;
    }
    return [cake, bin] as const;
  };

  it('starts on the exact interrupted frame, never jumps or whips, and ends on the accepted pose', () => {
    const [ownCake, ownBin] = declinePace();
    for (const a of CHANGES) {
      const c = planAt(a);
      const label = `decline@${a.toFixed(2)} → accept`;
      sameMotion(sampleAnswerChange(c, 0, newFrame()), sampleSequence('decline', a, newFrame()), label);
      expect(c.rewind, label).toBeGreaterThanOrEqual(REWIND.min);
      expect(c.rewind, label).toBeLessThanOrEqual(REWIND.max);
      // Each part at most REWIND.pace × its own fastest authored frame (the cake's visible part).
      const [rc, rb] = fastest(c, 0, DURATIONS.accept);
      expect(rc, label).toBeLessThanOrEqual(REWIND.pace * ownCake + 1e-3);
      expect(rb, label).toBeLessThanOrEqual(REWIND.pace * ownBin + 1e-3);
      expect(c.k, label).toBeLessThanOrEqual(1.15);
      // The rewind ends with the cake on its stand and the bin gone; the accept holds it there.
      const end = sampleAnswerChange(c, c.rewind, newFrame());
      expect(end.cakePos.distanceTo(ON_STAND), label).toBeLessThan(1e-6);
      expect(end.binVisible, label).toBe(false);
      sameMotion(sampleAnswerChange(c, DURATIONS.accept, newFrame()), frameFor('accepted', newFrame()), label);
    }
  });

  it('rewinds the path in order: the flaps open, the cake rises out over the rim, crosses back, is set on its stand, then the bin leaves', () => {
    const c = planAt(CONTENT_END.decline);
    let prevS = Infinity, crossed = -1, landed = -1, binAtLanding = false;
    for (let t = 0; t < c.rewind; t += 0.004) {
      const [seq, s] = changeTime(c, t);
      expect(seq).toBe('decline');
      expect(s).toBeLessThanOrEqual(prevS + 1e-9);
      prevS = s;
      const f = sampleAnswerChange(c, t, newFrame());
      if (crossed < 0 && f.cakeVisible && Math.hypot(f.cakePos.x - f.binPos.x, f.cakePos.z - f.binPos.z) > 0.05) crossed = t;
      if (landed < 0 && f.cakePos.distanceTo(ON_STAND) < 1e-6) { landed = t; binAtLanding = f.binVisible; }
    }
    expect(crossed).toBeGreaterThan(0);
    expect(landed).toBeGreaterThan(crossed);
    // The bin leaves once the cake is back over its stand, and is gone as the rewind ends.
    expect(binAtLanding).toBe(true);
    expect(sampleAnswerChange(c, c.rewind, newFrame()).binVisible).toBe(false);
    // From the declined pose it takes about half a second, never the 1.5 s decline again.
    expect(c.rewind).toBeGreaterThan(0.35);
    expect(c.rewind).toBeLessThan(0.75);
  });

  it('never rewinds the fire: no candle relights, the melt never goes back, the wax goes on setting', () => {
    for (const a of [0.01, ...CHANGES]) {
      const c = planAt(a);
      const at = sampleSequence('decline', a, newFrame());
      let prev: BirthdayFrame | null = null;
      for (let t = 0; t <= DURATIONS.accept + 1e-9; t += 0.004) {
        const f = sampleAnswerChange(c, t, newFrame());
        for (let i = 0; i < CANDLE_COUNT; i++) {
          const label = `decline@${a} t=${t.toFixed(3)} candle ${i + 1}`;
          if (at.flames[i]!.out) expect(f.flames[i]!.intensity, label).toBe(0);
          if (prev) {
            expect(f.flames[i]!.intensity, label).toBeLessThanOrEqual(Math.max(prev.flames[i]!.intensity, c.burning[i] ? 1 : 0) + 1e-9);
            expect(f.litTime[i]!, label).toBeGreaterThanOrEqual(prev.litTime[i]! - 1e-9);
            expect(f.cool[i]!, label).toBeGreaterThanOrEqual(prev.cool[i]! - 1e-9);
          }
          expect(f.litTime[i]!, label).toBeGreaterThanOrEqual(at.litTime[i]! - 1e-9);
        }
        prev = f;
      }
      // Every candle is out by the end (the snuffed ones stayed out; a burning one met the breath).
      expect(sampleAnswerChange(c, DURATIONS.accept, newFrame()).flames.every((f) => f.out)).toBe(true);
    }
    // A change before the snuff reached a candle: it burns on through the rewind and the breath blows it out.
    const early = planAt(0.01);
    expect(early.burning.some(Boolean)).toBe(true);
  });

  it('a change back to the decline mid-rewind plays it on from where it is', () => {
    const c = planAt(1.0);
    const t = 0.6 * c.rewind;
    const [, s] = changeTime(c, t);
    const back = planAnswerChange('decline', s, 1, 'decline');
    expect(back.rewind).toBe(0);
    sameMotion(sampleAnswerChange(back, 0, newFrame()), sampleAnswerChange(c, t, newFrame()), 'back');
    sameMotion(sampleAnswerChange(back, 0.2, newFrame()), sampleSequence('decline', s + 0.2, newFrame()), 'back +0.2');
  });
});

describe('Birthday\'s camera on a change of mind rides its own return', () => {
  const show = (seq: 'accept' | 'decline', t: number) => ({ seq, t });
  const run = (c: AnswerChange | null, seq: 'accept' | 'decline', T: number) => {
    const h = 1 / 240, p: number[] = [];
    for (let t = 0; t <= T + 1e-9; t += h) p.push(birthdayPull(show(seq, t), c));
    const v = p.map((x, i) => (i ? (x - p[i - 1]!) / h : 0));
    const dv = v.map((x, i) => (i > 1 ? Math.abs(x - v[i - 1]!) : 0));
    const kinks: number[] = [];
    for (let i = 3; i < dv.length - 1; i++) if (dv[i]! > 0.05 + 3 * Math.max(dv[i - 1]!, dv[i + 1]!)) kinks.push(i * h);
    return { p, peak: Math.max(...v.map(Math.abs)), kinks, h };
  };

  it('the plain decline is the shared curve; the declined pose is 1, the others 0', () => {
    for (let t = 0; t <= DURATIONS.decline; t += 0.01) expect(birthdayPull(show('decline', t), null)).toBe(declinePull(t));
    expect(birthdayPull(show('decline', DURATIONS.decline), null)).toBe(1);
    expect(birthdayPull(show('accept', 0.7), null)).toBe(0);
    expect(birthdayPull(null, null)).toBe(0);
  });

  it('declined → accept: the camera comes back in on its own C1 curve, from where it was, never tighter than the decline was', () => {
    for (const at of CHANGES) {
      const c = planAt(at);
      const { p, peak, kinks, h } = run(c, 'accept', DURATIONS.accept);
      const label = `from ${at}`;
      expect(p[0], label).toBeCloseTo(declinePull(at), 9);
      const leave = (birthdayPull(show('accept', 1e-6), c) - p[0]!) / 1e-6;
      const was = (at < CONTENT_END.decline ? 1 : 0) * (declinePull(at + 1e-6) - declinePull(at - 1e-6)) / 2e-6;
      expect(Math.abs(leave - was), label).toBeLessThan(0.01);
      expect(kinks, label).toEqual([]);
      expect(peak, label).toBeLessThanOrEqual(REWIND.pace * PULL_TOP_SPEED + 1e-6);
      for (let i = 0; i * h < c.rewind - 1e-9; i++) {
        const [seq, s] = changeTime(c, i * h);
        if (seq === 'decline') expect(p[i]!, `${label} t=${(i * h).toFixed(3)}`).toBeGreaterThanOrEqual(declinePull(s) - 2e-3);
      }
      // Home, at rest, within 0.4 s of the rewind's end, and from then on.
      expect(cameraSpan(c) - c.rewind, label).toBeLessThanOrEqual(0.4 + 1e-9);
      const home = p.findIndex((x, i) => i * h >= c.rewind && x === 0);
      expect(home, label).toBeGreaterThan(0);
      for (let i = home; i < p.length; i++) expect(p[i], label).toBe(0);
    }
  });
});

// The scene through the director (the procedural rig: no GLB). Contact shadows paint a canvas.
const context2d = new Proxy({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }) } as Record<string, unknown>, {
  get: (o, k) => (k in o ? o[k as string] : () => undefined),
});
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context2d }) });
afterAll(() => vi.unstubAllGlobals());

function testLibrary(): MaterialLibrary {
  const direction = DIRECTIONS.L2;
  const make = (name: string) => (name === 'mat_flame' ? createFlameMaterial(name) : new MeshStandardMaterial({ name, color: new Color(direction.surfaces[name]?.color ?? '#808080') }));
  return { direction, get: make, unique: make, dispose() {} } as unknown as MaterialLibrary;
}

describe('Birthday change of mind through the director', () => {
  it('decline → accept mid-carry and from the declined pose: no jump, no whip, the camera with it; the cake comes back unlit', () => {
    const lib = testLibrary();
    const rig = rigBirthday(buildBirthdayGeometry({ lib }), buildDisposalBin({ lib }), lib, 'vanilla');
    const scene = new BirthdayScene(rig, { category: 'birthday', cake: 'vanilla' });
    const cake = rig.nodes.cake_authored!, bin = rig.nodes.bin_root!;
    const v = new VisualDirector({ complete() {} }, 'guest', null);
    v.attach(scene);
    // Where the cake is seen: inside the bin, never deeper than the line of sight (change.ts HIDDEN_DEPTH).
    const snap = () => {
      const c = cake.position.clone();
      if (Math.hypot(c.x - bin.position.x, c.z - bin.position.z) < 0.05) c.y = Math.max(c.y, BIN.rimTop - HIDDEN_DEPTH - CAKE_TOTAL_HEIGHT);
      return { c, q: cake.quaternion.clone(), b: bin.position.clone(), p: scene.framePull() };
    };
    const jump = (a: ReturnType<typeof snap>, b: ReturnType<typeof snap>) => a.c.distanceTo(b.c) + a.q.angleTo(b.q) * 0.9;
    const [ownCake] = declinePace();
    const limit = REWIND.pace * ownCake * 1.25;
    const run = (from: number, to: number) => {
      let prev = snap(), max = 0, pull = 0;
      for (let t = from; t <= to + 1e-9; t += FRAME) {
        v.update(t);
        const s = snap();
        max = Math.max(max, jump(prev, s));
        pull = Math.max(pull, Math.abs(s.p - prev.p));
        prev = s;
      }
      return { max, pull };
    };
    v.update(0);
    v.setIntent('decline');
    run(FRAME, 0.6);
    // Mid-carry (the cake over the stand's edge, on its way to the bin): back to accept.
    const mid = snap();
    expect(mid.c.distanceTo(ON_STAND)).toBeGreaterThan(0.1);
    v.setIntent('accept');
    const cut = snap();
    expect(jump(mid, cut)).toBeLessThan(1e-9);
    expect(Math.abs(cut.p - mid.p)).toBeLessThan(1e-9);
    const r1 = run(0.6 + FRAME, 3);
    expect(r1.max).toBeLessThan(limit);
    expect(r1.pull).toBeLessThan(REWIND.pace * PULL_TOP_SPEED * FRAME * 1.05);
    expect(v.state).toBe('accepted-pose');
    expect(cake.position.distanceTo(ON_STAND)).toBeLessThan(1e-9);
    expect(bin.visible).toBe(false);
    expect(scene.framePull()).toBe(0);
    // The snuffed candles came back out (no relit flame on the cake; a quad still drawn is a
    // cooling ember, its flame's radiant output 0).
    scene.beforeRender();
    expect(rig.candles.every((c) => !c.fire.quad.visible || c.fire.material.uniforms.uState.value[2] === 0)).toBe(true);
    // Decline to the end, then from the declined pose (no playback) back to accept.
    v.setIntent('decline');
    run(3 + FRAME, 5.5);
    expect(v.state).toBe('declined-pose');
    const rest = snap();
    expect(rest.p).toBe(1);
    v.setIntent('accept');
    expect(jump(rest, snap())).toBeLessThan(1e-9);
    expect(Math.abs(snap().p - 1)).toBeLessThan(1e-9);
    const r2 = run(5.5 + FRAME, 8);
    expect(r2.max).toBeLessThan(limit);
    expect(v.state).toBe('accepted-pose');
    expect(cake.position.distanceTo(ON_STAND)).toBeLessThan(1e-9);
    // A replay starts clean (no change left over).
    v.replay();
    expect(scene.framePull()).toBe(0);
  });
});
