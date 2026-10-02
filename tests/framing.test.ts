import { describe, expect, it } from 'vitest';
import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three';
import { cameraDirection, fitPerspectiveToHero, PERSPECTIVE_FOV } from '../src/render/camera.ts';
import { HERO_FILL, PATH_CLEARANCE, silhouettePoints } from '../src/render/framing.ts';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { buildDisposalBin, openBinFramePoints } from '../models/disposalBin.ts';
import { COVER_PROFILE, COVER_SEATED, DINNER_BIN_POS, DINNER_BIN_SCALE, DINNER_BIN_YAW, DISH_HEIGHT, PLATE, dinnerBounds } from '../models/dinnerContract.ts';
import { dinnerFramePoints } from '../src/scenes/dinner/index.ts';

/**
 * v1.4 framing rule (src/render/framing.ts): one lens, one angle; the distance makes the hero's
 * silhouette fill HERO_FILL.height of the frame (or HERO_FILL.width when the hero is wide and
 * low); across, the hero sits centred unless a path needs the room; every path stays inside
 * PATH_CLEARANCE. The per-scene fills are measured on the real silhouettes in the browser
 * (tests/browser/framing.spec.ts).
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

describe('Dinner under the hero rule (recorded disposal exception)', () => {
  function plainLibrary(): MaterialLibrary {
    const direction = DIRECTIONS.L2;
    const cache = new Map<string, MeshStandardMaterial>();
    const make = (n: string) => new MeshStandardMaterial({ name: n, color: new Color(direction.surfaces[n]?.color ?? '#808080') });
    return { direction, get: (n: string) => cache.get(n) ?? (cache.set(n, make(n)), cache.get(n)!), unique: make, dispose() {} } as unknown as MaterialLibrary;
  }

  it('the open bin sets the frame: the camera backs off, and the covered dish still fills at least 35 % of the width', () => {
    // The hero rule would make the dish fill 75 % of the width; the covered dish carried over the
    // open bin behind it cannot fit at that size, so the camera backs off. Measured on the real
    // silhouette at 1:1: v1.3 0.434, v1.4 0.496 (the bin scaled with the dish: 31.7 × 22 cm),
    // v1.5 0.360 (the real 45 cm pedal bin: the dish must rise over a 42.4 cm rim; recorded
    // trade-off, docs/spec-revisions.md).
    const hero: Vector3[] = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      for (const [r, y] of [[PLATE.radius, 0], [PLATE.radius, PLATE.rimHeight]] as const) hero.push(new Vector3(c * r, y, s * r));
      for (const [r, y] of COVER_PROFILE) hero.push(new Vector3(c * r, y, s * r).add(COVER_SEATED));
    }
    hero.push(new Vector3(0, DISH_HEIGHT, 0));
    const paths = [...dinnerFramePoints(), ...openBinFramePoints(buildDisposalBin({ lib: plainLibrary() }), DINNER_BIN_POS, DINNER_BIN_YAW, DINNER_BIN_SCALE)];
    const camera = new PerspectiveCamera(PERSPECTIVE_FOV, 1, 0.05, 400);
    const f = fitPerspectiveToHero(camera, dinnerBounds().getCenter(new Vector3()), 1, hero, paths, HERO_FILL, PATH_CLEARANCE);
    expect(f.pathLimited).toBe(true);
    expect(f.heroWidth).toBeGreaterThanOrEqual(0.35);
    expect(f.heroWidth).toBeLessThan(HERO_FILL.width);
    const e = ndc(camera, paths);
    for (const v of [e.x0, e.y0]) expect(v).toBeGreaterThanOrEqual(-(1 - PATH_CLEARANCE) - 1e-3);
    for (const v of [e.x1, e.y1]) expect(v).toBeLessThanOrEqual(1 - PATH_CLEARANCE + 1e-3);
  });
});
