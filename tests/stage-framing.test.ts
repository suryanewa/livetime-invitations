import { describe, expect, it } from 'vitest';
import { Box3, Color, Group, Mesh, MeshStandardMaterial, NeutralToneMapping, OrthographicCamera, PerspectiveCamera, PlaneGeometry, Sphere, Texture, Vector3, type WebGLRenderer } from 'three';
import { cameraDirection, FRAMING_CLEARANCE, fitCameraToBounds, fitPerspectiveToBounds, PERSPECTIVE_FOV, viewDirection } from '../src/render/camera.ts';
import { defineRig, type Rig } from '../src/render/rig.ts';
import { Stage } from '../src/render/stage.ts';
import { cardCorners, DINNER_WORLD_SCALE } from '../models/dinnerContract.ts';
import { CARD_VIEW } from '../src/scenes/dinner/index.ts';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { BUSINESS_BOUNDS } from '../models/businessContract.ts';
import { PARTY_BOUNDS } from '../models/recordContract.ts';
import { birthdayBounds, BIN_POS, BIN_YAW } from '../models/birthdayContract.ts';
import { BALL_AT, BALL_R, BOARD, HOOP_ROOT, NET, netRestRadius, RIM, RIM_CENTER, SPORTS_BOUNDS, SPORTS_WORLD_SCALE } from '../models/sportsContract.ts';
import { DINNER_BIN_POS, DINNER_BIN_SCALE, DINNER_BIN_YAW, dinnerBounds } from '../models/dinnerContract.ts';
import { buildDisposalBin, openBinFramePoints } from '../models/disposalBin.ts';
import { partyFramePoints } from '../src/scenes/party/index.ts';
import { SPORTS_HERO_FILL, sportsFramePoints } from '../src/scenes/sports/index.ts';
import { SPORTS_FOCUS_FILL, sportsFocus } from '../src/scenes/sports/focus.ts';
import { HERO_FILL } from '../src/render/framing.ts';
import { dinnerFramePoints } from '../src/scenes/dinner/index.ts';
import { birthdayFramePoints } from '../src/scenes/birthday/framing.ts';

/**
 * The bounds fit (studio pass v1.3): perspective at PERSPECTIVE_FOV, fitted to each scene's
 * silhouette samples of every authored path with the shared 8 % clearance, at the shared angle.
 * Since v1.4 the product camera follows the hero framing rule instead (tests/framing.test.ts,
 * tests/browser/framing.spec.ts); this fit remains for the study and lookdev pages and for any
 * content without hero silhouettes.
 */

function plainLibrary(): MaterialLibrary {
  const direction = DIRECTIONS.L2;
  const cache = new Map<string, MeshStandardMaterial>();
  const make = (n: string) => new MeshStandardMaterial({ name: n, color: new Color(direction.surfaces[n]?.color ?? '#808080') });
  return { direction, get: (n: string) => cache.get(n) ?? (cache.set(n, make(n)), cache.get(n)!), unique: make, dispose() {} } as unknown as MaterialLibrary;
}

const lib = plainLibrary();
const SCENES: Record<string, { bounds: Box3; points?: Vector3[] }> = {
  business: { bounds: BUSINESS_BOUNDS },
  party: { bounds: PARTY_BOUNDS, points: partyFramePoints() },
  birthday: { bounds: birthdayBounds(), points: [...birthdayFramePoints(), ...openBinFramePoints(buildDisposalBin({ lib }), BIN_POS, BIN_YAW)] },
  sports: { bounds: SPORTS_BOUNDS, points: sportsFramePoints() },
  dinner: { bounds: dinnerBounds(), points: [...dinnerFramePoints(), ...openBinFramePoints(buildDisposalBin({ lib }), DINNER_BIN_POS, DINNER_BIN_YAW, DINNER_BIN_SCALE)] },
};
const corners = (b: Box3) => Array.from({ length: 8 }, (_, i) => new Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
const samplesOf = (s: { bounds: Box3; points?: Vector3[] }) => (s.points?.length ? s.points : corners(s.bounds));

function perspective(s: { bounds: Box3; points?: Vector3[] }, aspect: number) {
  const camera = new PerspectiveCamera(PERSPECTIVE_FOV, aspect, 0.5, 200);
  fitPerspectiveToBounds(camera, s.bounds, aspect, undefined, s.points);
  return camera;
}

/** Extents of the projected samples in NDC (−1…1 on both axes). */
function ndcExtents(camera: PerspectiveCamera | OrthographicCamera, pts: Vector3[]) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) {
    const q = p.clone().project(camera);
    x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
  }
  return { x0, x1, y0, y1 };
}

describe('Bounds fit through the perspective lens (study, lookdev, fallback)', () => {
  const limit = 1 - 2 * FRAMING_CLEARANCE;
  for (const [name, scene] of Object.entries(SCENES)) {
    it(`${name}: every frame point stays inside the 8 % clearance, snugly and centred, at every aspect`, () => {
      for (const aspect of [0.75, 1, 1.5]) {
        const camera = perspective(scene, aspect);
        const e = ndcExtents(camera, samplesOf(scene));
        for (const v of [e.x0, e.y0]) expect(v, `${name} ${aspect}`).toBeGreaterThanOrEqual(-limit - 1e-3);
        for (const v of [e.x1, e.y1]) expect(v, `${name} ${aspect}`).toBeLessThanOrEqual(limit + 1e-3);
        // Snug: the binding axis touches the clearance (the fit is not loose).
        expect(Math.max(e.x1 - e.x0, e.y1 - e.y0), `${name} ${aspect}`).toBeGreaterThan(2 * limit - 0.01);
        // Centred by the view offset.
        expect(Math.abs(e.x0 + e.x1), `${name} ${aspect}`).toBeLessThan(2e-3);
        expect(Math.abs(e.y0 + e.y1), `${name} ${aspect}`).toBeLessThan(2e-3);
      }
    });

    it(`${name}: keeps the shared azimuth/elevation and v1.1's composition (subject scale and place)`, () => {
      const camera = perspective(scene, 1);
      const look = camera.getWorldDirection(new Vector3());
      expect(look.dot(cameraDirection().negate())).toBeGreaterThan(1 - 1e-9);
      const ortho = new OrthographicCamera();
      fitCameraToBounds(ortho, scene.bounds, 1, undefined, scene.points);
      // A short screen-parallel span at the motion bounds' centre: its projected length is the
      // subject's scale, its position where the subject sits. Both lenses agree to a few percent.
      const c = scene.bounds.getCenter(new Vector3());
      const right = new Vector3().crossVectors(cameraDirection(), new Vector3(0, 1, 0)).normalize().multiplyScalar(0.05);
      const span = (cam: PerspectiveCamera | OrthographicCamera) => {
        const a = c.clone().sub(right).project(cam), b = c.clone().add(right).project(cam);
        return { len: Math.hypot(a.x - b.x, a.y - b.y), mid: [(a.x + b.x) / 2, (a.y + b.y) / 2] as const };
      };
      const sp = span(camera), so = span(ortho);
      // Measured at 18°: 0.93 (Dinner, the deep bin) to 1.02 (Sports).
      expect(sp.len / so.len, name).toBeGreaterThan(0.9);
      expect(sp.len / so.len, name).toBeLessThan(1.1);
      // Shift in NDC (2 = the stage width): at most 0.073 (Birthday, Dinner), under 4 % of the stage.
      expect(Math.hypot(sp.mid[0] - so.mid[0], sp.mid[1] - so.mid[1]), name).toBeLessThan(0.09);
    });
  }

  it('the lens is long: every scene is seen from at least 4× its bounds radius (subtle foreshortening)', () => {
    for (const [name, scene] of Object.entries(SCENES)) {
      const camera = perspective(scene, 1);
      const r = scene.bounds.getBoundingSphere(new Sphere());
      expect(camera.position.distanceTo(r.center), name).toBeGreaterThan(4 * r.radius);
    }
  });
});

describe('v1.7: the stage\'s close-up (Dinner\'s accepted pose is the card view)', () => {
  function stage(): Stage {
    const renderer = { shadowMap: {}, toneMapping: 0, toneMappingExposure: 1, setPixelRatio() {}, setSize() {} } as unknown as WebGLRenderer;
    const rig: Rig = { ...defineRig({
      label: 'test', stageColor: '#808080', exposure: 1, toneMapping: NeutralToneMapping, environmentIntensity: 1, gobo: false,
      backdrop: { kind: 'none' }, shadows: null, build: () => ({ environment: new Texture(), objects: [], dispose() {} }),
    }), name: 'test' };
    const Ctor = Stage as unknown as new (r: WebGLRenderer, o: { rig: Rig }) => Stage;
    return new Ctor(renderer, { rig });
  }
  const scene = SCENES.dinner!;
  const content = () => {
    const g = new Group();
    g.add(new Mesh(new PlaneGeometry(1, 1), new MeshStandardMaterial()));
    // The scene's root carries its world scale (v1.4): the stage carries every point set through it.
    g.scale.setScalar(DINNER_WORLD_SCALE);
    return g;
  };
  const hero = dinnerFramePoints('rest').slice(0, 64);
  const closeUp = { points: cardCorners(), ...CARD_VIEW };

  it('fits the close-up in the same solve, and setClose(1) puts the live camera on it, without a solve', () => {
    const s = stage();
    s.resize(800, 800);
    s.setContent(content(), scene.bounds, undefined, scene.points, hero, dinnerFramePoints('rest'), closeUp);
    expect(s.fitSolves).toBe(1);
    const f = s.framing!.closeUp!;
    expect(f).toBeDefined();
    const rest = s.camera.position.clone();
    // The card's centre in the world, and the close-up's direction.
    const aim = cardCorners().reduce((a, p) => a.add(p), new Vector3()).multiplyScalar(DINNER_WORLD_SCALE / 8);
    s.setClose(1);
    expect(s.currentClose).toBe(1);
    expect(s.camera.position.distanceTo(aim.clone().addScaledVector(viewDirection(CARD_VIEW.azimuthDeg, CARD_VIEW.elevationDeg), f.distance))).toBeLessThan(1e-9);
    const look = (s.camera as PerspectiveCamera).getWorldDirection(new Vector3());
    expect(look.dot(viewDirection(CARD_VIEW.azimuthDeg, CARD_VIEW.elevationDeg).negate())).toBeGreaterThan(1 - 1e-9);
    // Half-way: between the two; home again exactly.
    s.setClose(0.5);
    expect(s.camera.position.distanceTo(rest)).toBeGreaterThan(0.1);
    s.setClose(0);
    expect(s.camera.position.distanceTo(rest)).toBeLessThan(1e-9);
    // Resizes, insets and other aspects only place it (still one solve for this aspect), and it holds.
    s.setClose(1);
    const close = s.camera.position.clone();
    s.resize(400, 400);
    expect(s.camera.position.distanceTo(close)).toBeLessThan(1e-9);
    s.setFrameInsets({ top: 180, right: 0, bottom: 330, left: 0 });
    s.resize(390, 844);
    expect(s.fitSolves).toBe(1);
    expect(s.currentClose).toBe(1);
    expect(s.measureFraming(1.5)!.closeUp).toBeDefined();
    // New content: back at rest.
    s.setContent(content(), scene.bounds, undefined, scene.points, hero, dinnerFramePoints('rest'), closeUp);
    expect(s.currentClose).toBe(0);
  });

  it('content without a close-up ignores the channel', () => {
    const s = stage();
    s.resize(800, 800);
    s.setContent(content(), scene.bounds, undefined, scene.points, hero, dinnerFramePoints('rest'));
    const p = s.camera.position.clone();
    s.setClose(1);
    expect(s.currentClose).toBe(0);
    expect(s.framing!.closeUp).toBeUndefined();
    expect(s.camera.position.distanceTo(p)).toBeLessThan(1e-12);
  });
});

describe('v1.7: a scene\'s own hero fill (Sports, #43) reaches the fit through Stage.setContent', () => {
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
    g.add(new Mesh(new PlaneGeometry(1, 1), new MeshStandardMaterial()));
    g.scale.setScalar(SPORTS_WORLD_SCALE);
    return g;
  };
  // The Sports hero: the board's corners, the ring, the net's bottom and the ball at guest-ready (no stand).
  const hero: Vector3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const z of [BOARD.front, BOARD.front - BOARD.thickness]) hero.push(new Vector3(HOOP_ROOT.x + (sx * BOARD.width) / 2, BOARD.centerY + (sy * BOARD.height) / 2, HOOP_ROOT.z + z));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    hero.push(new Vector3(RIM_CENTER.x + Math.cos(a) * (RIM.innerRadius + 2 * RIM.tube), RIM_CENTER.y, RIM_CENTER.z + Math.sin(a) * (RIM.innerRadius + 2 * RIM.tube)));
    hero.push(new Vector3(RIM_CENTER.x + Math.cos(a) * netRestRadius(1), RIM_CENTER.y - NET.depth, RIM_CENTER.z + Math.sin(a) * netRestRadius(1)));
  }
  for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) hero.push(BALL_AT.guest.clone().add(new Vector3(...d).multiplyScalar(BALL_R)));
  const paths = sportsFramePoints();

  it('Sports fills 0.85 of the height at 1:1 and 3:2 and 0.70 of the width at 3:4, never path-limited; without its fill the shared 0.6 holds', () => {
    const s = stage();
    s.resize(800, 800);
    s.setContent(content(), SPORTS_BOUNDS, undefined, paths, hero, undefined, undefined, SPORTS_HERO_FILL);
    const at = (a: number) => s.measureFraming(a)!.rest;
    for (const a of [1, 1.5]) {
      expect(at(a).binding, `${a}`).toBe('height');
      expect(at(a).heroHeight, `${a}`).toBeCloseTo(0.85, 3);
      expect(at(a).pathLimited, `${a}`).toBe(false);
    }
    expect(at(0.75).binding).toBe('width');
    expect(at(0.75).heroWidth).toBeCloseTo(0.7, 3);
    expect(at(0.75).heroHeight).toBeGreaterThan(0.83);
    expect(at(0.75).pathLimited).toBe(false);
    // The phone's fullscreen frame square (dock insets) is fitted as the square stage.
    s.resize(390, 844);
    s.setFrameInsets({ top: 180, right: 0, bottom: 330, left: 0 });
    expect(s.framing!.rest.heroHeight).toBeCloseTo(0.85, 3);
    expect(s.framing!.rest.pathLimited).toBe(false);
    // The same content without its fill: the shared rule.
    const t = stage();
    t.resize(800, 800);
    t.setContent(content(), SPORTS_BOUNDS, undefined, paths, hero);
    expect(t.measureFraming(1)!.rest.heroHeight).toBeCloseTo(HERO_FILL.height, 3);
    // Everything 1.40× larger than the shared rule (#43 at 0.92: 1.50×).
    const ratio = t.measureFraming(1)!.rest.distance / s.measureFraming(1)!.rest.distance;
    expect(ratio).toBeGreaterThan(1.38);
    expect(ratio).toBeLessThan(1.45);
  });

  it('v1.7 polish: Sports\' focus is a dolly along the shared direction at the rest aim: setClose(1) is the focus fit, 0 exactly home, never a refit', () => {
    const s = stage();
    s.resize(800, 800);
    s.setContent(content(), SPORTS_BOUNDS, undefined, paths, hero, undefined, sportsFocus(), SPORTS_HERO_FILL);
    expect(s.closeKind).toBe('focus');
    const pair = s.measureFraming(1)!;
    const focus = pair.closeUp!;
    // A tighter fit than the rest, along the same line (the same aim, a shorter distance).
    expect(focus.distance).toBeLessThan(pair.rest.distance / 1.6);
    expect(focus.pathLimited).toBe(false);
    expect(focus.heroHeight).toBeCloseTo(SPORTS_FOCUS_FILL.height, 3);
    const solves = s.fitSolves;
    const cam = s.camera as PerspectiveCamera;
    const home = cam.position.clone();
    const back = cameraDirection();
    for (const k of [0.25, 0.5, 0.75, 1]) {
      s.setClose(k);
      // The camera looks along the shared direction at every k: a dolly, never a turn.
      const look = new Vector3();
      cam.getWorldDirection(look);
      expect(look.dot(back.clone().negate())).toBeGreaterThan(1 - 1e-9);
      expect(s.currentClose).toBe(k);
    }
    // At 1 the camera is on the focus fit.
    const aim = SPORTS_BOUNDS.getCenter(new Vector3()).multiplyScalar(SPORTS_WORLD_SCALE);
    expect(cam.position.distanceTo(aim)).toBeCloseTo(focus.distance, 6);
    s.setClose(0);
    expect(cam.position.distanceTo(home)).toBeLessThan(1e-12);
    expect(s.fitSolves).toBe(solves);
  });
});
