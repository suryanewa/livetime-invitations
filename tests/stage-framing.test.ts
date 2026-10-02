import { describe, expect, it } from 'vitest';
import { Box3, Color, MeshStandardMaterial, OrthographicCamera, PerspectiveCamera, Sphere, Vector3 } from 'three';
import { cameraDirection, FRAMING_CLEARANCE, fitCameraToBounds, fitPerspectiveToBounds, PERSPECTIVE_FOV } from '../src/render/camera.ts';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { BUSINESS_BOUNDS } from '../models/businessContract.ts';
import { PARTY_BOUNDS } from '../models/recordContract.ts';
import { birthdayBounds, BIN_POS, BIN_YAW } from '../models/birthdayContract.ts';
import { SPORTS_BOUNDS } from '../models/sportsContract.ts';
import { DINNER_BIN_POS, DINNER_BIN_YAW, dinnerBounds } from '../models/dinnerContract.ts';
import { buildDisposalBin, openBinFramePoints } from '../models/disposalBin.ts';
import { partyFramePoints } from '../src/scenes/party/index.ts';
import { sportsFramePoints } from '../src/scenes/sports/index.ts';
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
  dinner: { bounds: dinnerBounds(), points: [...dinnerFramePoints(), ...openBinFramePoints(buildDisposalBin({ lib }), DINNER_BIN_POS, DINNER_BIN_YAW)] },
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
