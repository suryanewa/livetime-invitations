import { describe, expect, it } from 'vitest';
import { Box3, Color, CylinderGeometry, Group, Mesh, MeshStandardMaterial, NeutralToneMapping, PerspectiveCamera, Texture, Vector3, type WebGLRenderer } from 'three';
import {
  cameraDirection, type FrameRect, frameSquare, framingHull, PERSPECTIVE_FOV, placeHeroView, pulledView, solveHeroFits,
} from '../src/render/camera.ts';
import { DECLINE_PULL, declinePull, HERO_FILL, PATH_CLEARANCE } from '../src/render/framing.ts';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { defineRig, type Rig } from '../src/render/rig.ts';
import { Stage } from '../src/render/stage.ts';
import { mulberry32 } from '../src/motion/random.ts';
import { BIN, buildDisposalBin, openBinFramePoints } from '../models/disposalBin.ts';
import { BIN_POS, BIN_YAW, CAKE_RADIUS } from '../models/birthdayContract.ts';
import { DINNER_BIN_POS, DINNER_BIN_SCALE, DINNER_BIN_YAW } from '../models/dinnerContract.ts';
import { birthdayDeclineFramePoints, birthdayRestFramePoints } from '../src/scenes/birthday/framing.ts';
import { ACROSS_FROM, BIN_DELAY as BIRTHDAY_BIN_DELAY, BIN_FROM } from '../src/scenes/birthday/poses.ts';
import { newFrame as birthdayFrame, sampleSequence as birthdaySample } from '../src/scenes/birthday/sequences.ts';
import { dinnerFramePoints } from '../src/scenes/dinner/index.ts';
import { cameraClock, dinnerPull } from '../src/scenes/dinner/pull.ts';
import {
  BIN_DELAY as DINNER_BIN_DELAY, changeTime, CONTENT_END, DURATIONS as DINNER_DURATIONS, newFrame as dinnerFrame, planAnswerChange, sampleSequence as dinnerSample,
} from '../src/scenes/dinner/sequences.ts';
import { DINNER_BIN, DINNER_BIN_START, PLATE } from '../models/dinnerContract.ts';

/**
 * v1.5 decline pull-back (src/render/framing.ts DECLINE_PULL, src/render/camera.ts pulledView):
 * two fits per aspect, the camera between them set by the scene's `framePull()`, the bin waiting
 * for the camera, and the fit's cost (a point reduction that is exact, a fit solved once per
 * content and aspect, never in the render loop).
 */

function plainLibrary(): MaterialLibrary {
  const direction = DIRECTIONS.L2;
  const cache = new Map<string, MeshStandardMaterial>();
  const make = (n: string) => new MeshStandardMaterial({ name: n, color: new Color(direction.surfaces[n]?.color ?? '#808080') });
  return { direction, get: (n: string) => cache.get(n) ?? (cache.set(n, make(n)), cache.get(n)!), unique: make, dispose() {} } as unknown as MaterialLibrary;
}

const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number) => {
  const pts: Vector3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) pts.push(new Vector3(cx + x * hx, cy + y * hy, cz + z * hz));
  return pts;
};
const ndc = (camera: PerspectiveCamera, pts: readonly Vector3[]) => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) {
    const q = p.clone().project(camera);
    x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
  }
  return [x0, x1, y0, y1] as const;
};

describe('the pull curve (DECLINE_PULL)', () => {
  it('is 0 before the decline, 1 from DECLINE_PULL.to, monotone and C1 (no speed jump at either end)', () => {
    expect(declinePull(-1)).toBe(0);
    expect(declinePull(0)).toBe(0);
    expect(declinePull(DECLINE_PULL.to)).toBe(1);
    expect(declinePull(1.5)).toBe(1);
    const h = 1 / 2000;
    let prev = 0, prevV = 0, peak = 0;
    for (let t = h; t <= DECLINE_PULL.to + 0.05; t += h) {
      const p = declinePull(t);
      expect(p).toBeGreaterThanOrEqual(prev - 1e-9);
      const v = (p - prev) / h;
      // C1: the speed changes by an acceleration's worth per step, never jumps.
      expect(Math.abs(v - prevV), `t=${t.toFixed(4)}`).toBeLessThan(0.1);
      peak = Math.max(peak, v);
      prev = p;
      prevV = v;
    }
    // Starts and lands at rest.
    expect((declinePull(h) - declinePull(0)) / h).toBeLessThan(0.05);
    expect((declinePull(DECLINE_PULL.to) - declinePull(DECLINE_PULL.to - h)) / h).toBeLessThan(0.05);
    // Calm: the peak speed is about 2.2 × the mean (a camera that takes the whole window).
    const mean = 1 / (DECLINE_PULL.to - DECLINE_PULL.from);
    expect(peak / mean).toBeGreaterThan(1.5);
    expect(peak / mean).toBeLessThan(2.4);
    // Complete before the carry crests the rim (Birthday 0.65 s, Dinner 0.70 s).
    expect(DECLINE_PULL.to).toBeLessThanOrEqual(0.65);
  });
});

describe('pulledView: a dolly between two fits of the same aim', () => {
  const hero = box(0, 0.5, 0, 0.3, 0.5, 0.3);
  const rest = [...hero, ...box(0.3, 0.9, 0, 0.2, 0.2, 0.2)];
  const decline = [...rest, ...box(-1.2, 1.4, -1.5, 0.4, 1.2, 0.4)];
  const aim = new Vector3(-0.3, 0.8, -0.4);

  it('is exactly the rest fit at 0 and the decline fit at 1, and the distance moves geometrically', () => {
    for (const aspect of [0.75, 1, 1.5]) {
      const camera = new PerspectiveCamera(PERSPECTIVE_FOV, aspect, 0.05, 400);
      const [r, d] = solveHeroFits(camera, aim, aspect, hero, [rest, decline], HERO_FILL, PATH_CLEARANCE);
      expect(d!.distance).toBeGreaterThan(r!.distance);
      expect(pulledView(r!, d!, 0)).toEqual({ distance: r!.distance, offset: r!.offset });
      expect(pulledView(r!, d!, 1)).toEqual({ distance: d!.distance, offset: d!.offset });
      // Equal steps of pull are equal ratios of size on screen.
      const ratio = d!.distance / r!.distance;
      for (const k of [0.25, 0.5, 0.75]) expect(pulledView(r!, d!, k).distance).toBeCloseTo(r!.distance * ratio ** k, 9);
      // At 1, every path is PATH_CLEARANCE inside the frame; at 0, the hero fills the rule.
      const v1 = pulledView(r!, d!, 1);
      placeHeroView(camera, aim, aspect, v1.distance, v1.offset);
      const e = ndc(camera, decline);
      for (const x of [e[0], e[2]]) expect(x).toBeGreaterThanOrEqual(-(1 - PATH_CLEARANCE) - 1e-3);
      for (const x of [e[1], e[3]]) expect(x).toBeLessThanOrEqual(1 - PATH_CLEARANCE + 1e-3);
      expect(Math.max(r!.heroHeight / HERO_FILL.height, r!.heroWidth / HERO_FILL.width)).toBeCloseTo(1, 3);
    }
  });

  it('carries a point at the aim\'s depth along a straight line on screen (the hero slides, never swings)', () => {
    const camera = new PerspectiveCamera(PERSPECTIVE_FOV, 1, 0.05, 400);
    const [r, d] = solveHeroFits(camera, aim, 1, hero, [rest, decline], HERO_FILL, PATH_CLEARANCE);
    const back = cameraDirection();
    const right = new Vector3(0, 1, 0).cross(back).normalize();
    const up = new Vector3().crossVectors(back, right);
    const p = aim.clone().addScaledVector(right, 0.37).addScaledVector(up, -0.21);
    const at = (k: number) => {
      const v = pulledView(r!, d!, k);
      placeHeroView(camera, aim, 1, v.distance, v.offset);
      const q = p.clone().project(camera);
      return [q.x, q.y] as const;
    };
    const [a, b] = [at(0), at(1)];
    for (let k = 0.05; k < 1; k += 0.05) {
      const [x, y] = at(k);
      // Distance from the line a–b.
      const dist = Math.abs((b[0] - a[0]) * (a[1] - y) - (a[0] - x) * (b[1] - a[1])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
      expect(dist, `k=${k.toFixed(2)}`).toBeLessThan(1e-6);
    }
  });

  it('places the fullscreen frame square exactly as the square stage at every pull', () => {
    const square = new PerspectiveCamera(PERSPECTIVE_FOV, 1, 0.05, 400);
    const [r, d] = solveHeroFits(square, aim, 1, hero, [rest, decline], HERO_FILL, PATH_CLEARANCE);
    for (const frame of [frameSquare(1440, 900, { top: 210, right: 440, bottom: 16, left: 0 }), frameSquare(390, 844, { top: 180, right: 0, bottom: 330, left: 0 })] as FrameRect[]) {
      const full = new PerspectiveCamera(PERSPECTIVE_FOV, frame.width / frame.height, 0.05, 400);
      for (const k of [0, 0.4, 1]) {
        const v = pulledView(r!, d!, k);
        placeHeroView(square, aim, 1, v.distance, v.offset);
        placeHeroView(full, aim, frame.width / frame.height, v.distance, v.offset, frame);
        for (const p of decline) {
          const s = p.clone().project(square), f = p.clone().project(full);
          expect(((f.x + 1) / 2) * frame.width).toBeCloseTo(frame.x + ((s.x + 1) / 2) * frame.size, 3);
          expect(((1 - f.y) / 2) * frame.height).toBeCloseTo(frame.y + ((1 - s.y) / 2) * frame.size, 3);
        }
      }
    }
  });
});

describe('framingHull: the fit works on few points, exactly', () => {
  /** A dense, mesh-like cloud: a turned body with a lid and a tilted flap, plus random scatter. */
  function cloud(seed: number, n: number): Vector3[] {
    const r = mulberry32(seed);
    const pts: Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, y = r() * 2.3, rad = 0.8 + 0.02 * Math.sin(9 * a);
      pts.push(new Vector3(-1 + Math.cos(a) * rad, y, -1.7 + Math.sin(a) * rad));
      if (i % 3 === 0) pts.push(new Vector3((r() - 0.5) * 1.4, r() * 1.1, (r() - 0.5) * 1.4));
      if (i % 5 === 0) pts.push(new Vector3(-1.5 + r() * 0.3, 2.3 + r() * 0.8, -1.7 + (r() - 0.5) * 1.5));
    }
    return pts;
  }

  it('keeps a few hundred of 10⁵ points, and every hero fit made on them is the fit made on all', () => {
    const all = cloud(7, 60_000);
    const hero = all.filter((p) => Math.hypot(p.x, p.z) < 0.75 && p.y < 1.2);
    const kept = framingHull(all);
    expect(all.length).toBeGreaterThan(90_000);
    expect(kept.length).toBeLessThan(600);
    const heroKept = framingHull(hero);
    const aim = new Vector3(-0.4, 1.2, -0.8);
    for (const aspect of [0.75, 1, 1.5]) {
      for (const frame of [undefined, frameSquare(1440, 900, { top: 200, right: 440, bottom: 16, left: 0 })]) {
        const cam = new PerspectiveCamera(PERSPECTIVE_FOV, aspect, 0.05, 400);
        const [full] = solveHeroFits(cam, aim, aspect, hero, [all], HERO_FILL, PATH_CLEARANCE, frame);
        const [reduced] = solveHeroFits(cam, aim, aspect, heroKept, [kept], HERO_FILL, PATH_CLEARANCE, frame);
        expect(reduced!.distance).toBeCloseTo(full!.distance, 9);
        for (let i = 0; i < 2; i++) expect(reduced!.offset[i]).toBeCloseTo(full!.offset[i]!, 9);
        for (let i = 0; i < 4; i++) expect(reduced!.pathExtents[i]).toBeCloseTo(full!.pathExtents[i]!, 9);
        expect(reduced!.heroHeight).toBeCloseTo(full!.heroHeight, 9);
        expect(reduced!.heroWidth).toBeCloseTo(full!.heroWidth, 9);
      }
    }
    // And the projected extents agree at any distance, near or far.
    const cam = new PerspectiveCamera(PERSPECTIVE_FOV, 1, 0.05, 400);
    for (const d of [6, 9, 14, 40]) {
      placeHeroView(cam, aim, 1, d, [0.1, -0.2]);
      const a = ndc(cam, all), b = ndc(cam, kept);
      for (let i = 0; i < 4; i++) expect(b[i]).toBeCloseTo(a[i]!, 12);
    }
  });

  it('keeps the shared bin to a few hundred points in both scenes (it is ≈ 10⁵ vertices)', () => {
    const bin = buildDisposalBin({ lib: plainLibrary() });
    const birthday = [...birthdayRestFramePoints(), ...birthdayDeclineFramePoints(), ...openBinFramePoints(bin, BIN_POS, BIN_YAW)];
    const dinner = [...dinnerFramePoints(), ...openBinFramePoints(bin, DINNER_BIN_POS, DINNER_BIN_YAW, DINNER_BIN_SCALE)];
    expect(dinner.length).toBeGreaterThan(50_000);
    expect(framingHull(birthday).length).toBeLessThan(400);
    expect(framingHull(dinner).length).toBeLessThan(400);
  });
});

describe('the stage solves a fit once per content and aspect, never in the loop', () => {
  /** A Stage around a stand-in renderer (no GL), as tests/rigs.test.ts builds one. */
  function stage(): Stage {
    const renderer = { shadowMap: {}, toneMapping: 0, toneMappingExposure: 1, setPixelRatio() {}, setSize() {} } as unknown as WebGLRenderer;
    const rig: Rig = { ...defineRig({
      label: 'test', stageColor: '#808080', exposure: 1, toneMapping: NeutralToneMapping, environmentIntensity: 1, gobo: false,
      backdrop: { kind: 'none' }, shadows: null, build: () => ({ environment: new Texture(), objects: [], dispose() {} }),
    }), name: 'test' };
    const Ctor = Stage as unknown as new (r: WebGLRenderer, o: { rig: Rig }) => Stage;
    return new Ctor(renderer, { rig });
  }
  const content = () => {
    const g = new Group();
    g.add(new Mesh(new CylinderGeometry(0.5, 0.5, 1, 64), new MeshStandardMaterial()));
    return g;
  };
  const hero = box(0, 0.5, 0, 0.5, 0.5, 0.5);
  const rest = [...hero, ...box(0, 1.1, 0, 0.3, 0.1, 0.3)];
  const all = [...rest, ...box(-1.2, 1.6, -1.7, 0.4, 1.2, 0.4)];

  it('resizes, inset changes, stills and pulls only place the camera', () => {
    const s = stage();
    s.resize(800, 800);
    s.setContent(content(), new Box3().setFromPoints(all), undefined, all, hero, rest);
    expect(s.fitSolves).toBe(1);
    expect(s.framing!.decline.distance).toBeGreaterThan(s.framing!.rest.distance);
    // The square stage at other sizes of the same aspect, and the fullscreen layout at any size
    // and insets (always fitted square): no new solve.
    s.resize(400, 400);
    s.setFrameInsets({ top: 200, right: 440, bottom: 16, left: 0 });
    s.resize(1440, 900);
    s.setFrameInsets({ top: 180, right: 0, bottom: 330, left: 0 });
    s.resize(390, 844);
    s.setFrameInsets({ top: 180, right: 0, bottom: 260, left: 0 });
    expect(s.fitSolves).toBe(1);
    // The pull moves the camera back along the view direction and solves nothing.
    const at0 = s.camera.position.clone();
    for (let t = 0; t <= 1.5; t += 1 / 60) s.setPull(declinePull(t));
    expect(s.fitSolves).toBe(1);
    expect(s.currentPull).toBe(1);
    expect(s.camera.position.distanceTo(at0)).toBeGreaterThan(0.5);
    // Tooling at another aspect solves once, then it is cached; the live fit is untouched.
    s.measureFraming(1.5);
    s.measureFraming(1.5);
    s.measureFraming(1);
    expect(s.fitSolves).toBe(2);
    // New content: solved again, once; the pull starts at rest.
    s.setContent(content(), new Box3().setFromPoints(all), undefined, all, hero, rest);
    expect(s.fitSolves).toBe(3);
    expect(s.currentPull).toBe(0);
  });

  it('content without rest points has one fit: rest and decline are the same', () => {
    const s = stage();
    s.resize(800, 800);
    s.setContent(content(), new Box3().setFromPoints(all), undefined, all, hero);
    expect(s.framing!.rest).toBe(s.framing!.decline);
    const p = s.camera.position.clone();
    s.setPull(1);
    expect(s.camera.position.distanceTo(p)).toBeLessThan(1e-12);
  });
});

describe('the bin waits for the camera (the decline pull-back\'s choreography)', () => {
  it('Birthday: still until BIN_DELAY, then settled with its flaps open before the cake reaches it', () => {
    const f = birthdayFrame();
    for (let t = 0; t <= BIRTHDAY_BIN_DELAY; t += 0.005) {
      birthdaySample('decline', t, f);
      expect(f.binPos.distanceTo(BIN_FROM), `t=${t}`).toBeLessThan(1e-9);
      expect(f.flaps).toBe(0);
    }
    // v1.5 review: the bin's slide is longer (0.38 s, decelerating, all of it seen), so it settles
    // as the cake drifts across, before the cake reaches its footprint (0.521 s); open by then.
    let reach = 0;
    for (let t = ACROSS_FROM; t < 1; t += 0.001) {
      birthdaySample('decline', t, f);
      if (Math.hypot(f.cakePos.x - BIN_POS.x, f.cakePos.z - BIN_POS.z) < CAKE_RADIUS + BIN.radius + 0.02) { reach = t; break; }
    }
    expect(reach).toBeGreaterThan(ACROSS_FROM);
    birthdaySample('decline', reach - 0.01, f);
    expect(f.binPos.distanceTo(BIN_POS)).toBeLessThan(1e-6);
    expect(f.flaps).toBeGreaterThan(0.999);
    // The camera is well under way when it sets off.
    expect(declinePull(BIRTHDAY_BIN_DELAY)).toBeGreaterThan(0.05);
  });

  it('Dinner: hidden and still until BIN_DELAY, then settled before the dish sets off across, open before it comes over', () => {
    const f = dinnerFrame();
    for (let t = 0; t <= DINNER_BIN_DELAY; t += 0.005) {
      dinnerSample('decline', t, f);
      expect(f.binVisible, `t=${t}`).toBe(false);
      expect(f.binPos.distanceTo(DINNER_BIN_START)).toBeLessThan(1e-9);
    }
    // The dish rises on its own axis until it turns across (≈ 0.53 s).
    let across = 0;
    for (let t = 0.25; t < 1; t += 0.001) {
      dinnerSample('decline', t, f);
      if (Math.hypot(f.platePos.x, f.platePos.z) > 1e-4) { across = t; break; }
    }
    expect(across).toBeGreaterThan(0.5);
    // v1.5 review: the bin's slide is longer (0.4 s, decelerating, all of it seen): it settles, open,
    // before the dish comes over its footprint (as the dish turns across it has a few mm to go).
    let over = 0;
    for (let t = across; t < 1; t += 0.001) {
      dinnerSample('decline', t, f);
      if (Math.hypot(f.platePos.x - DINNER_BIN_POS.x, f.platePos.z - DINNER_BIN_POS.z) < PLATE.radius + DINNER_BIN.radius) { over = t; break; }
    }
    expect(over).toBeGreaterThan(across);
    dinnerSample('decline', over - 0.01, f);
    expect(f.binPos.distanceTo(DINNER_BIN_POS)).toBeLessThan(1e-6);
    expect(f.flaps).toBeGreaterThan(0.999);
    dinnerSample('decline', across, f);
    expect(f.binPos.distanceTo(DINNER_BIN_POS)).toBeLessThan(0.02);
    expect(declinePull(DINNER_BIN_DELAY)).toBeGreaterThan(0.1);
  });
});

describe('Dinner\'s pull on a change of mind rides the change\'s own timeline', () => {
  const show = (seq: 'accept' | 'decline', t: number) => ({ seq, t });

  it('the plain decline is the shared curve; the declined pose is 1, the others 0', () => {
    for (let t = 0; t <= DINNER_DURATIONS.decline; t += 0.01) expect(dinnerPull(show('decline', t), null)).toBe(declinePull(t));
    // run(null, 'decline'): the plain decline, the reference for the C1 checks below.
    expect(dinnerPull(show('decline', DINNER_DURATIONS.decline), null)).toBe(1);
    expect(dinnerPull(show('accept', 0.7), null)).toBe(0);
    expect(dinnerPull(null, null)).toBe(0);
  });

  /**
   * Pull per 1/240 s over [0, T] of the new outcome's playback; its peak speed; and its kinks: a
   * velocity step shows as one sample's change of speed far above its neighbours' (smooth motion,
   * however brisk, changes speed alike from step to step), as tests/dinner.test.ts finds them.
   */
  const run = (c: ReturnType<typeof planAnswerChange>, seq: 'accept' | 'decline', T: number) => {
    const h = 1 / 240, p: number[] = [];
    for (let t = 0; t <= T + 1e-9; t += h) p.push(dinnerPull(show(seq, t), c));
    const v = p.map((x, i) => (i ? (x - p[i - 1]!) / h : 0));
    const dv = v.map((x, i) => (i > 1 ? Math.abs(x - v[i - 1]!) : 0));
    const kinks: number[] = [];
    for (let i = 3; i < dv.length - 1; i++) if (dv[i]! > 0.05 + 3 * Math.max(dv[i - 1]!, dv[i + 1]!)) kinks.push(i * h);
    return { p, peak: Math.max(...v.map(Math.abs)), kinks, h };
  };

  it('decline → accept: the camera comes back in on its own C1 curve, from where it was, never tighter than the decline was', () => {
    const own = run(null as never, 'decline', 1).peak;
    for (const at of [0.05, 0.1, 0.16, 0.2, 0.3, 0.45, 0.6, 0.8, 1.0, CONTENT_END.decline]) {
      const c = planAnswerChange('decline', at, at < CONTENT_END.decline ? 1 : 0, 'accept');
      const { p, peak, kinks, h } = run(c, 'accept', DINNER_DURATIONS.accept);
      const label = `from ${at}`;
      // Starts on the interrupted pull, and leaves at its speed (C1 with the decline).
      expect(p[0], label).toBeCloseTo(declinePull(at), 9);
      const leave = (dinnerPull(show('accept', 1e-6), c) - p[0]!) / 1e-6;
      const was = (at < CONTENT_END.decline ? 1 : 0) * (declinePull(at + 1e-6) - declinePull(at - 1e-6)) / 2e-6;
      expect(Math.abs(leave - was), label).toBeLessThan(0.01);
      // C1: no kink anywhere (the rewind's start and end included); and no faster than the scene's
      // rewind paces itself (REWIND.pace 1.6 × the decline's own dolly; measured ≤ 1.5 ×).
      expect(kinks, label).toEqual([]);
      expect(peak, label).toBeLessThanOrEqual(1.6 * own);
      // Never tighter than the decline at the same scene state (the dish and the bin framed at least as wide).
      for (let i = 0; i * h < c.rewind - 1e-9; i++) {
        const [seq, s] = changeTime(c, i * h);
        if (seq === 'decline') expect(p[i]!, `${label} t=${(i * h).toFixed(3)}`).toBeGreaterThanOrEqual(declinePull(s) - 2e-3);
      }
      // On the rest fit, at rest, soon after the accept begins (it trails the scene's rewind by at
      // most 0.2 s, into the cover's first tip on the plate, inside the rest fit), and from then on.
      const home = p.findIndex((x, i) => i * h >= c.rewind && x === 0);
      expect(home * h - c.rewind, label).toBeLessThanOrEqual(0.2 + 1e-9);
      for (let i = home; i < p.length; i++) expect(p[i], label).toBe(0);
    }
  });

  it('accept → decline: the camera follows the bin\'s clock, C1 through the rewind\'s end, a hair ahead of it, and ends at 1', () => {
    const own = run(null as never, 'decline', 1).peak;
    for (const at of [0.2, 0.5, 1.0, DINNER_DURATIONS.accept]) {
      const c = planAnswerChange('accept', at, at < DINNER_DURATIONS.accept ? 1 : 0, 'decline');
      const { p, peak, kinks, h } = run(c, 'decline', DINNER_DURATIONS.decline);
      const label = `from ${at} (k ${c.k.toFixed(3)})`;
      expect(p[0], label).toBe(0);
      expect(p[p.length - 1], label).toBe(1);
      expect(kinks, label).toEqual([]);
      expect(peak, label).toBeLessThanOrEqual(c.k * own + 1e-6);
      for (let i = 0; i < p.length; i++) {
        const t = i * h;
        // The bin's clock, as sampleAnswerChange runs it.
        const bin = t < c.rewind ? t - (c.rewind - c.start) : changeTime(c, t)[1];
        expect(p[i]!, `${label} t=${t.toFixed(3)}`).toBeGreaterThanOrEqual(declinePull(bin) - 1e-9);
        if (bin < CONTENT_END.decline) expect(cameraClock(c, t) - bin, label).toBeLessThanOrEqual((c.k - 1) * 0.05 / 4 + 1e-9);
        if (i) expect(p[i]!, label).toBeGreaterThanOrEqual(p[i - 1]! - 1e-12);
      }
    }
  });
});
