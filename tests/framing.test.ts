import { describe, expect, it } from 'vitest';
import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three';
import {
  cameraDirection, closeUpView, fitPerspectiveToHero, fitPose, type FrameRect, frameSquare, PERSPECTIVE_FOV, placeHeroView, placeView, solveCloseFit, solveHeroFits, viewDirection,
} from '../src/render/camera.ts';
import { HERO_FILL, PATH_CLEARANCE, silhouettePoints } from '../src/render/framing.ts';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { buildDisposalBin, openBinFramePoints } from '../models/disposalBin.ts';
import {
  cardCorners, CARD_TOP, COVER_BESIDE, COVER_PROFILE, COVER_SEATED, COVER_TOP, DINNER_BIN_POS, DINNER_BIN_SCALE, DINNER_BIN_YAW, DINNER_WORLD_SCALE, DISH_HEIGHT, PLATE, dinnerBounds,
} from '../models/dinnerContract.ts';
import { CARD_VIEW, dinnerFramePoints } from '../src/scenes/dinner/index.ts';
import { CLOSE, closeIn } from '../src/scenes/dinner/pull.ts';
import { cloudState, steamBounds, STEAM_END } from '../src/scenes/dinner/steam.ts';

/**
 * v1.4 framing rule (src/render/framing.ts): one lens, one angle; the distance makes the hero's
 * silhouette fill HERO_FILL.height of the frame (or HERO_FILL.width when the hero is wide and
 * low); across, the hero sits centred unless a path needs the room; every path stays inside
 * PATH_CLEARANCE. The per-scene fills are measured on the real silhouettes in the browser
 * (tests/browser/framing.spec.ts). Since v1.5 a scene with a bin has two fits (rest and decline;
 * tests/pull.test.ts).
 */

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
  return { x0, x1, y0, y1 };
};
const fit = (hero: Vector3[], paths: Vector3[], aspect = 1) => {
  const camera = new PerspectiveCamera(PERSPECTIVE_FOV, aspect, 0.05, 400);
  const aim = new Vector3();
  for (const p of [...hero, ...paths]) aim.add(p);
  aim.divideScalar(hero.length + paths.length);
  return { camera, f: fitPerspectiveToHero(camera, aim, aspect, hero, paths, HERO_FILL, PATH_CLEARANCE) };
};

describe('Hero framing rule (v1.4)', () => {
  it('a tall hero fills HERO_FILL.height of the frame, centred, at the shared angle', () => {
    const hero = box(0, 0.5, 0, 0.3, 0.5, 0.3);
    for (const aspect of [0.75, 1, 1.5]) {
      const { camera, f } = fit(hero, hero, aspect);
      const e = ndc(camera, hero);
      expect(f.binding, `${aspect}`).toBe('height');
      expect((e.y1 - e.y0) / 2).toBeCloseTo(HERO_FILL.height, 3);
      expect(f.heroHeight).toBeCloseTo(HERO_FILL.height, 3);
      expect(Math.abs(e.x0 + e.x1)).toBeLessThan(1e-3);
      expect(f.pathLimited).toBe(false);
      expect(camera.getWorldDirection(new Vector3()).dot(cameraDirection().negate())).toBeGreaterThan(1 - 1e-9);
    }
  });

  it('a wide, low hero is held to HERO_FILL.width instead', () => {
    const hero = box(0, 0.1, 0, 1, 0.1, 1);
    const { f } = fit(hero, hero, 1);
    expect(f.binding).toBe('width');
    expect(f.heroWidth).toBeCloseTo(HERO_FILL.width, 3);
    expect(f.heroHeight).toBeLessThan(HERO_FILL.height);
  });

  it('the size is the same at any distance from the origin: the rule is scale-free', () => {
    const a = fit(box(0, 0.5, 0, 0.3, 0.5, 0.3), box(0, 0.5, 0, 0.3, 0.5, 0.3)).f;
    const k = 0.38;
    const b = fit(box(0, 0.5 * k, 0, 0.3 * k, 0.5 * k, 0.3 * k), box(0, 0.5 * k, 0, 0.3 * k, 0.5 * k, 0.3 * k)).f;
    expect(b.heroHeight).toBeCloseTo(a.heroHeight, 4);
    expect(b.distance / a.distance).toBeCloseTo(k, 4);
  });

  it('slides across, never zooms, to keep a path to one side in frame', () => {
    const hero = box(0, 0.5, 0, 0.3, 0.5, 0.3);
    const paths = [...hero, ...box(-1.1, 0.3, 0, 0.2, 0.3, 0.2)];
    const { camera, f } = fit(hero, paths, 1);
    expect(f.pathLimited).toBe(false);
    expect(f.heroHeight).toBeCloseTo(HERO_FILL.height, 3);
    expect(f.heroCenter[0]).toBeGreaterThan(0.01);
    const e = ndc(camera, paths);
    expect(e.x0).toBeGreaterThanOrEqual(-(1 - PATH_CLEARANCE) - 1e-3);
    expect(e.x1).toBeLessThanOrEqual(1 - PATH_CLEARANCE + 1e-3);
  });

  it('backs off only when a path cannot fit at the hero size, and says so', () => {
    const hero = box(0, 0.5, 0, 0.3, 0.5, 0.3);
    const paths = [...hero, ...box(0, 2.5, -1, 0.3, 0.5, 0.3)];
    const { camera, f } = fit(hero, paths, 1);
    expect(f.pathLimited).toBe(true);
    expect(f.heroHeight).toBeLessThan(HERO_FILL.height);
    const e = ndc(camera, paths);
    expect(Math.max(e.x1 - e.x0, e.y1 - e.y0)).toBeCloseTo(2 * (1 - PATH_CLEARANCE), 2);
    expect(e.y0).toBeGreaterThanOrEqual(-(1 - PATH_CLEARANCE) - 1e-3);
    expect(e.y1).toBeLessThanOrEqual(1 - PATH_CLEARANCE + 1e-3);
  });

  it('silhouettes skip contact shadows, shadow proxies and hidden parts, and keep each mesh\'s extremes', () => {
    const mat = new MeshStandardMaterial({ color: new Color('#808080') });
    const root = new Group();
    const body = new Mesh(new BoxGeometry(1, 2, 1, 40, 40, 40), mat);
    body.position.y = 1;
    const shadow = new Group();
    shadow.name = 'dish_shadow';
    shadow.add(new Mesh(new BoxGeometry(9, 0.01, 9), mat));
    const proxy = new Mesh(new BoxGeometry(8, 8, 8), mat);
    proxy.userData.shadowProxy = true;
    const hidden = new Mesh(new BoxGeometry(7, 7, 7), mat);
    hidden.visible = false;
    root.add(body, shadow, proxy, hidden);
    root.scale.setScalar(3); // root space: the root's own transform is not applied
    const pts = silhouettePoints(root, () => false, 50);
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(-0.5, 6);
    expect(Math.max(...xs)).toBeCloseTo(0.5, 6);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(Math.max(...ys)).toBeCloseTo(2, 6);
    expect(pts.length).toBeLessThan(200);
  });
});

describe('Dinner under the hero rule: rest and decline fits (v1.5 decline pull-back)', () => {
  function plainLibrary(): MaterialLibrary {
    const direction = DIRECTIONS.L2;
    const cache = new Map<string, MeshStandardMaterial>();
    const make = (n: string) => new MeshStandardMaterial({ name: n, color: new Color(direction.surfaces[n]?.color ?? '#808080') });
    return { direction, get: (n: string) => cache.get(n) ?? (cache.set(n, make(n)), cache.get(n)!), unique: make, dispose() {} } as unknown as MaterialLibrary;
  }

  it('at rest the dish fills the rule (held only by its own cover\'s paths); at pull 1 every path, the open bin included, keeps its clearance', () => {
    // v1.4 0.496 of the width and v1.5's merged bin 0.354 at 1:1, when one fixed camera held the
    // carry over the 44.5 cm rim. Since the pull-back the rest fit holds the host and accept paths
    // only: the cover set down beside the plate binds first, short of the 0.75 cap (the real
    // silhouette: 0.724 at 3:4, 0.696 at 1:1, 0.547 of the height at 3:2; the browser spec).
    const hero: Vector3[] = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      for (const [r, y] of [[PLATE.radius, 0], [PLATE.radius, PLATE.rimHeight]] as const) hero.push(new Vector3(c * r, y, s * r));
      for (const [r, y] of COVER_PROFILE) hero.push(new Vector3(c * r, y, s * r).add(COVER_SEATED));
    }
    hero.push(new Vector3(0, DISH_HEIGHT, 0));
    const rest = dinnerFramePoints('rest');
    const all = [...dinnerFramePoints(), ...openBinFramePoints(buildDisposalBin({ lib: plainLibrary() }), DINNER_BIN_POS, DINNER_BIN_YAW, DINNER_BIN_SCALE)];
    const aim = dinnerBounds().getCenter(new Vector3());
    for (const aspect of [0.75, 1, 1.5]) {
      const camera = new PerspectiveCamera(PERSPECTIVE_FOV, aspect, 0.05, 400);
      const [r, d] = solveHeroFits(camera, aim, aspect, hero, [rest, all], HERO_FILL, PATH_CLEARANCE);
      const label = `${aspect}`;
      // The rule at rest: within 10 % of its cap on the binding axis, never past it.
      const fill = Math.max(r!.heroWidth / HERO_FILL.width, r!.heroHeight / HERO_FILL.height);
      expect(fill, label).toBeGreaterThan(0.9);
      expect(fill, label).toBeLessThanOrEqual(1 + 1e-3);
      // The decline fit is the wider one, path-limited by the carry over the bin.
      expect(d!.pathLimited, label).toBe(true);
      expect(d!.distance, label).toBeGreaterThan(r!.distance * 1.3);
      for (const [fit, pts] of [[r!, rest], [d!, all]] as const) {
        placeHeroView(camera, aim, aspect, fit.distance, fit.offset);
        const e = ndc(camera, [...hero, ...pts]);
        for (const v of [e.x0, e.y0]) expect(v, label).toBeGreaterThanOrEqual(-(1 - PATH_CLEARANCE) - 1e-3);
        for (const v of [e.x1, e.y1]) expect(v, label).toBeLessThanOrEqual(1 - PATH_CLEARANCE + 1e-3);
      }
    }
  });
});

describe('Dinner\'s close-up on the card (v1.7, spec revision #42)', () => {
  // Everything in Dinner's own units (su); the stage's near plane (0.5 world units, 10 cm) in them.
  const NEAR = 0.5 / DINNER_WORLD_SCALE;
  const hero: Vector3[] = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    for (const [r, y] of [[PLATE.radius, 0], [PLATE.radius, PLATE.rimHeight]] as const) hero.push(new Vector3(c * r, y, s * r));
    for (const [r, y] of COVER_PROFILE) hero.push(new Vector3(c * r, y, s * r).add(COVER_SEATED));
  }
  hero.push(new Vector3(0, DISH_HEIGHT, 0));
  const rest = dinnerFramePoints('rest');
  const aim = dinnerBounds().getCenter(new Vector3());
  const card = cardCorners();
  const top = card.filter((p) => p.y >= CARD_TOP - 1e-9);
  const subject = card.reduce((a, p) => a.add(p), new Vector3()).multiplyScalar(1 / card.length);
  const closeUp = { points: card, ...CARD_VIEW };
  const closeDir = viewDirection(CARD_VIEW.azimuthDeg, CARD_VIEW.elevationDeg);
  /** What is on stage at the accepted pose: the plate, the cloche set down beside it (its profile, its handle) and the card. */
  const accepted: Vector3[] = [...card];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    for (const [r, y] of [[PLATE.radius, 0], [PLATE.radius, PLATE.rimHeight], [PLATE.wellRadius, PLATE.well]] as const) accepted.push(new Vector3(c * r, y, s * r));
    for (const [r, y] of COVER_PROFILE) accepted.push(new Vector3(c * r, y, s * r).add(COVER_BESIDE));
  }
  accepted.push(COVER_BESIDE.clone().setY(COVER_TOP));
  const fits = (aspect: number) => {
    const camera = new PerspectiveCamera(PERSPECTIVE_FOV, aspect, NEAR, 400);
    const [r] = solveHeroFits(camera, aim, aspect, hero, [rest], HERO_FILL, PATH_CLEARANCE);
    const c = solveCloseFit(camera, subject, aspect, closeUp, card, PATH_CLEARANCE);
    return { camera, r: r!, c };
  };
  const at = (camera: PerspectiveCamera, aspect: number, r: ReturnType<typeof fits>['r'], c: ReturnType<typeof fits>['c'], k: number, frame?: FrameRect) => {
    const v = closeUpView(fitPose(aim, r.distance, r.offset), fitPose(subject, c.distance, c.offset, closeDir), subject, k, PERSPECTIVE_FOV, frame ? 1 : aspect);
    placeView(camera, v.position, v.target, aspect, v.offset, frame);
    return v;
  };

  it('the card fills 55 % of the frame\'s width (v1.7 polish; was 65 %), centred, its long edges level, near plan (80°) at the shared azimuth', () => {
    for (const aspect of [0.75, 1, 1.5]) {
      const { camera, c } = fits(aspect);
      placeHeroView(camera, subject, aspect, c.distance, c.offset, undefined, closeDir);
      const e = ndc(camera, card);
      expect((e.x1 - e.x0) / 2, `${aspect}`).toBeCloseTo(CARD_VIEW.widthFill, 3);
      expect(Math.abs(e.x0 + e.x1) / 2, `${aspect}`).toBeLessThan(1e-3);
      expect(Math.abs(e.y0 + e.y1) / 2, `${aspect}`).toBeLessThan(1e-3);
      expect(c.binding).toBe('width');
      // Level: each long edge's two ends at one height on screen.
      const q = top.map((p) => p.clone().project(camera));
      expect(Math.abs(q[0]!.y - q[1]!.y)).toBeLessThan(1e-9);
      expect(Math.abs(q[2]!.y - q[3]!.y)).toBeLessThan(1e-9);
      // Its print reads upright: the far edge (the print's top) is higher on screen.
      expect(q[0]!.y).toBeGreaterThan(q[3]!.y);
    }
    expect(CARD_VIEW).toEqual({ azimuthDeg: 20, elevationDeg: 80, widthFill: 0.55 });
    // ≈ 58 cm from the card's centre (was 49 cm at 65 %): a close-up through the same 18° lens.
    const { c } = fits(1);
    if (process.env.CLOSE_DEBUG) console.log('close-up distance cm', c.distance * DINNER_WORLD_SCALE * 20);
    expect(c.distance * DINNER_WORLD_SCALE * 20).toBeGreaterThan(54);
    expect(c.distance * DINNER_WORLD_SCALE * 20).toBeLessThan(62);
  });

  it('the move: exactly the rest fit at 0 and the close-up at 1; the card crosses the screen on a straight line, growing all the way', () => {
    const { camera, r, c } = fits(1);
    const rows: { x: number; y: number; w: number }[] = [];
    for (let k = 0; k <= 1 + 1e-9; k += 0.01) {
      at(camera, 1, r, c, k);
      const p = subject.clone().project(camera), e = ndc(camera, card);
      rows.push({ x: p.x, y: p.y, w: e.x1 - e.x0 });
    }
    const ref = new PerspectiveCamera(PERSPECTIVE_FOV, 1, NEAR, 400);
    placeHeroView(ref, aim, 1, r.distance, r.offset);
    const s0 = subject.clone().project(ref);
    expect(rows[0]!.x).toBeCloseTo(s0.x, 9);
    expect(rows[0]!.y).toBeCloseTo(s0.y, 9);
    placeHeroView(ref, subject, 1, c.distance, c.offset, undefined, closeDir);
    const s1 = subject.clone().project(ref);
    expect(rows[rows.length - 1]!.x).toBeCloseTo(s1.x, 9);
    expect(rows[rows.length - 1]!.y).toBeCloseTo(s1.y, 9);
    const a = rows[0]!, b = rows[rows.length - 1]!;
    for (const [i, q] of rows.entries()) {
      // On the line from where the rest view shows it to the centre (|cross| ≈ 0), and in order.
      const cross = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
      expect(Math.abs(cross), `k ${i / 100}`).toBeLessThan(1e-6);
      if (i) expect(q.w, `k ${i / 100}`).toBeGreaterThan(rows[i - 1]!.w);
    }
  });

  it('nothing on stage is ever behind the 10 cm near plane, and the camera never enters the steam\'s box on the way', () => {
    const { camera, r, c } = fits(1);
    const cMin = new Vector3(), cMax = new Vector3(), vMin = new Vector3(), vMax = new Vector3(), sMin = new Vector3(), sMax = new Vector3();
    const inside = (p: Vector3, lo: Vector3, hi: Vector3, m: number) => p.x > lo.x - m && p.x < hi.x + m && p.y > lo.y - m && p.y < hi.y + m && p.z > lo.z - m && p.z < hi.z + m;
    let closest = Infinity, lowest = Infinity;
    for (let tau = CLOSE.from - 0.1; tau <= Math.max(CLOSE.to, STEAM_END) + 0.1; tau += 0.01) {
      const k = closeIn(tau);
      const v = at(camera, 1, r, c, k);
      for (const p of accepted) {
        const z = p.clone().applyMatrix4(camera.matrixWorldInverse).z;
        expect(z, `τ ${tau.toFixed(2)}`).toBeLessThan(-NEAR);
        closest = Math.min(closest, -z);
      }
      expect(v.position.y).toBeGreaterThan(0);
      // The reveal's steam on its own clock (the cloud, the veil, the gush): the camera outside every box, 5 cm to spare.
      if (tau < STEAM_END) {
        steamBounds(cloudState(tau), { tau, emitStart: -Infinity, emitEnd: Infinity }, cMin, cMax, vMin, vMax, sMin, sMax);
        for (const [lo, hi] of [[cMin, cMax], [vMin, vMax], [sMin, sMax]] as const) {
          if (lo.x > hi.x) continue;
          expect(inside(v.position, lo, hi, 0.3), `τ ${tau.toFixed(2)}`).toBe(false);
          lowest = Math.min(lowest, v.position.y - hi.y);
        }
      }
    }
    // Measured (su): the nearest thing on stage ≥ 2 su (34 cm) away; the camera ≥ 1 su over the steam's boxes.
    if (process.env.CLOSE_DEBUG) console.log('closest', closest, 'lowest', lowest, 'close-up', c.distance, 'rest', r.distance, 'camera y', at(camera, 1, r, c, 1).position.y);
    expect(closest).toBeGreaterThan(2);
    expect(lowest).toBeGreaterThan(0.8);
  });

  it('places the fullscreen frame square exactly as the square stage at every point of the move', () => {
    const { r, c } = fits(1);
    const square = new PerspectiveCamera(PERSPECTIVE_FOV, 1, NEAR, 400);
    for (const frame of [frameSquare(1440, 900, { top: 210, right: 440, bottom: 16, left: 0 }), frameSquare(390, 844, { top: 180, right: 0, bottom: 330, left: 0 })] as FrameRect[]) {
      const full = new PerspectiveCamera(PERSPECTIVE_FOV, frame.width / frame.height, NEAR, 400);
      for (const k of [0, 0.3, 0.7, 1]) {
        at(square, 1, r, c, k);
        at(full, frame.width / frame.height, r, c, k, frame);
        for (const p of [...card, ...accepted.slice(0, 40)]) {
          const s = p.clone().project(square), f = p.clone().project(full);
          expect(((f.x + 1) / 2) * frame.width).toBeCloseTo(frame.x + ((s.x + 1) / 2) * frame.size, 3);
          expect(((1 - f.y) / 2) * frame.height).toBeCloseTo(frame.y + ((1 - s.y) / 2) * frame.size, 3);
        }
      }
    }
  });
});
