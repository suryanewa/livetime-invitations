import { Box3, MathUtils, OrthographicCamera, type PerspectiveCamera, Vector3 } from 'three';

/**
 * Shared three-quarter camera angle (Master §5). One angle for all five scenes; scenes never
 * tune their own. The product renders it through a long perspective lens (fitPerspectiveToBounds);
 * the orthographic camera (createStageCamera / fitCameraToBounds) stays for the study and
 * lookdev pages.
 */
export const CAMERA_ANGLES = { azimuthDeg: 20, elevationDeg: 15 } as const;
export const FRAMING_CLEARANCE = 0.08;
const DISTANCE = 40;

export function cameraDirection(out = new Vector3()): Vector3 {
  const az = MathUtils.degToRad(CAMERA_ANGLES.azimuthDeg);
  const el = MathUtils.degToRad(CAMERA_ANGLES.elevationDeg);
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

export function createStageCamera(): OrthographicCamera {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  camera.position.copy(cameraDirection()).multiplyScalar(DISTANCE);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

const corner = new Vector3();

/**
 * Fit complete motion bounds into the stage with clearance on every side, preserving
 * the shared camera angle. Bounds must cover every authored path, not just the ready pose.
 */
export function fitCameraToBounds(
  camera: OrthographicCamera,
  bounds: Box3,
  aspect: number,
  clearance = FRAMING_CLEARANCE,
  points?: readonly Vector3[],
): void {
  const center = bounds.getCenter(new Vector3());
  const dir = cameraDirection();
  camera.position.copy(center).addScaledVector(dir, DISTANCE);
  camera.lookAt(center);
  camera.updateMatrixWorld();

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const inv = camera.matrixWorldInverse;
  const add = (p: Vector3) => {
    corner.copy(p).applyMatrix4(inv);
    minX = Math.min(minX, corner.x); maxX = Math.max(maxX, corner.x);
    minY = Math.min(minY, corner.y); maxY = Math.max(maxY, corner.y);
  };
  if (points?.length) {
    // Silhouette samples of every authored path: a box's corners overstate round objects
    // (a disc's corners project ≈28 % wider than the disc) and turned ones even more.
    for (const p of points) add(p);
  } else {
    const c = new Vector3();
    for (let i = 0; i < 8; i++) add(c.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z));
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = 1 / (1 - 2 * clearance);
  let halfW = ((maxX - minX) / 2) * scale;
  let halfH = ((maxY - minY) / 2) * scale;
  if (halfW / halfH > aspect) halfH = halfW / aspect;
  else halfW = halfH * aspect;

  camera.left = cx - halfW;
  camera.right = cx + halfW;
  camera.top = cy + halfH;
  camera.bottom = cy - halfH;
  camera.updateProjectionMatrix();
}

/**
 * The product lens (studio pass v1.3): a long perspective lens at the shared azimuth/elevation.
 * 18° vertical keeps v1.1's orthographic composition (subjects fill the frame the same way, the
 * floor and the cove gain real depth) while foreshortening stays photographic, not wide.
 */
export const PERSPECTIVE_FOV = 18;

/**
 * Perspective fit: same azimuth/elevation and the same clearance as the orthographic fit. The
 * distance is solved so the projected motion bounds (or, when given, the scene's silhouette
 * samples of every authored path) fit, then the view is shifted so they sit centred.
 */
export function fitPerspectiveToBounds(
  camera: PerspectiveCamera,
  bounds: Box3,
  aspect: number,
  clearance = FRAMING_CLEARANCE,
  points?: readonly Vector3[],
): void {
  const center = bounds.getCenter(new Vector3());
  const dir = cameraDirection();
  camera.clearViewOffset();
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  const samples: Vector3[] = points?.length
    ? [...points]
    : Array.from({ length: 8 }, (_, i) => new Vector3(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z));
  const limit = 1 - 2 * clearance;
  const fits = (d: number) => {
    camera.position.copy(center).addScaledVector(dir, d);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, behind = false;
    for (const p of samples) {
      corner.copy(p).applyMatrix4(camera.matrixWorldInverse);
      if (corner.z > -camera.near) behind = true;
      corner.copy(p).project(camera);
      minX = Math.min(minX, corner.x); maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, corner.y); maxY = Math.max(maxY, corner.y);
    }
    return { ok: !behind && maxX - minX <= 2 * limit && maxY - minY <= 2 * limit, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  };
  let lo = 0.5, hi = 200;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid).ok) hi = mid;
    else lo = mid;
  }
  const r = fits(hi);
  // Recentre: shift the view so the projected samples sit in the middle of the frame.
  camera.setViewOffset(1000 * aspect, 1000, (r.cx * 1000 * aspect) / 2, (-r.cy * 1000) / 2, 1000 * aspect, 1000);
  camera.updateProjectionMatrix();
}

/** What a hero fit did (src/render/framing.ts): the fill it reached and whether a path set it. */
export interface HeroFraming {
  /** Hero silhouette height over frame height, and width over frame width (0–1). */
  heroHeight: number;
  heroWidth: number;
  /** The axis that set the distance: height (HERO_FILL.height) or width (the wide-object cap). */
  binding: 'height' | 'width';
  /** True when an authored path could not fit at HERO_FILL and the camera backed off. */
  pathLimited: boolean;
  /** Hero centre in NDC after the slide (0, 0 = centred). */
  heroCenter: [number, number];
  /** Camera distance from the aim point (scene units). */
  distance: number;
}

/**
 * The v1.4 framing rule (src/render/framing.ts): same lens, azimuth and elevation for every scene;
 * the distance makes the hero's silhouette (`hero`, root-space samples at guest-ready) fill
 * `fill.height` of the frame height, or `fill.width` of its width when that binds first (a wide,
 * low object such as the plate); the view then slides so the hero sits centred across (unless an
 * authored path, `paths`, would leave the frame) and the whole action sits centred up and down,
 * every path `clearance` inside the edges.
 * If the paths cannot fit at that size at all, the camera backs off just enough (`pathLimited`).
 */
export function fitPerspectiveToHero(
  camera: PerspectiveCamera,
  aim: Vector3,
  aspect: number,
  hero: readonly Vector3[],
  paths: readonly Vector3[],
  fill: { readonly height: number; readonly width: number },
  clearance: number,
): HeroFraming {
  const dir = cameraDirection();
  camera.clearViewOffset();
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  const limit = 1 - clearance;
  const extents = (pts: readonly Vector3[]) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, behind = false;
    for (const p of pts) {
      corner.copy(p).applyMatrix4(camera.matrixWorldInverse);
      if (corner.z > -camera.near) behind = true;
      corner.copy(p).project(camera);
      x0 = Math.min(x0, corner.x); x1 = Math.max(x1, corner.x);
      y0 = Math.min(y0, corner.y); y1 = Math.max(y1, corner.y);
    }
    return { x0, x1, y0, y1, behind };
  };
  const place = (d: number) => {
    camera.position.copy(aim).addScaledVector(dir, d);
    camera.lookAt(aim);
    camera.updateMatrixWorld();
  };
  const heroFits = (e: ReturnType<typeof extents>) => (e.y1 - e.y0) / 2 <= fill.height && (e.x1 - e.x0) / 2 <= fill.width;
  const all = [...hero, ...paths];
  const pathsFit = (d: number) => {
    place(d);
    const e = extents(all);
    return !e.behind && e.x1 - e.x0 <= 2 * limit && e.y1 - e.y0 <= 2 * limit;
  };
  // Distance at which the hero fills `fill` (fill falls monotonically with distance).
  let lo = 0.05, hi = 400;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    place(mid);
    const e = extents(hero);
    if (!e.behind && heroFits(e)) hi = mid;
    else lo = mid;
  }
  let d = hi;
  let pathLimited = false;
  if (!pathsFit(d)) {
    pathLimited = true;
    lo = d; hi = 400;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (pathsFit(mid)) hi = mid;
      else lo = mid;
    }
    d = hi;
  }
  place(d);
  const h = extents(hero), a = extents(all);
  // Slide: across, the hero sits centred, clamped so every path stays inside the clearance; up and
  // down, the frame centres the whole action (hero and paths), so a scene whose action rises above
  // its hero (the carry to the bin) keeps that headroom, as the v1.3 fit did.
  const slide = (c: number, lo: number, hi: number) => Math.min(Math.max(c, hi - limit), lo + limit);
  const ox = slide((h.x0 + h.x1) / 2, a.x0, a.x1);
  const oy = (a.y0 + a.y1) / 2;
  camera.setViewOffset(1000 * aspect, 1000, (ox * 1000 * aspect) / 2, (-oy * 1000) / 2, 1000 * aspect, 1000);
  camera.updateProjectionMatrix();
  return {
    heroHeight: (h.y1 - h.y0) / 2,
    heroWidth: (h.x1 - h.x0) / 2,
    binding: (h.x1 - h.x0) / 2 / fill.width > (h.y1 - h.y0) / 2 / fill.height ? 'width' : 'height',
    pathLimited,
    heroCenter: [(h.x0 + h.x1) / 2 - ox, (h.y0 + h.y1) / 2 - oy],
    distance: d,
  };
}
