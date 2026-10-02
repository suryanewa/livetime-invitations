import { Box3, MathUtils, OrthographicCamera, type PerspectiveCamera, Vector3 } from 'three';
import type { FrameInsets } from '../core/types.ts';

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
 * Fullscreen layout (v1.4): the space an overlay UI leaves free, in CSS px from each edge of the
 * stage. Every scene is framed exactly as on the square stage inside the largest square that fits
 * this free area (the "frame square"); the rest of the viewport extends the same view, so a wide
 * or tall viewport adds studio around the object, never a different composition.
 */
export type { FrameInsets } from '../core/types.ts';

/** The frame square inside a `width` × `height` stage (CSS px), and that stage's size. */
export interface FrameRect {
  x: number;
  y: number;
  size: number;
  width: number;
  height: number;
}

export const NO_INSETS: FrameInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * The largest square that fits inside the free area, centred in it. Insets that would leave less
 * than a quarter of the stage's shorter side are scaled back, so the object never collapses.
 */
export function frameSquare(width: number, height: number, insets: FrameInsets = NO_INSETS): FrameRect {
  const w = Math.max(1, width), h = Math.max(1, height);
  let { top, right, bottom, left } = insets;
  const floor = Math.min(w, h) / 4;
  const fw = w - left - right, fh = h - top - bottom;
  if (fw < floor) { const k = Math.max(0, w - floor) / Math.max(1e-6, left + right); left *= k; right *= k; }
  if (fh < floor) { const k = Math.max(0, h - floor) / Math.max(1e-6, top + bottom); top *= k; bottom *= k; }
  const freeW = w - left - right, freeH = h - top - bottom;
  const size = Math.max(1, Math.min(freeW, freeH));
  return { x: left + (freeW - size) / 2, y: top + (freeH - size) / 2, size, width: w, height: h };
}

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
  frame?: FrameRect,
): void {
  if (frame) aspect = 1;
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
  if (frame) {
    // Extend the square view to the whole stage: same scale, the square at its frame rect.
    const unit = (2 * halfW) / frame.size;
    camera.left -= frame.x * unit;
    camera.right = camera.left + frame.width * unit;
    camera.top += frame.y * unit;
    camera.bottom = camera.top - frame.height * unit;
  }
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
  frame?: FrameRect,
): void {
  // Fullscreen: fit the frame square exactly as the square stage, then extend the view (below).
  if (frame) aspect = 1;
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
  if (frame) {
    // Fullscreen (v1.4): the recentred square view becomes a window of the whole stage, the square
    // at its frame rect. Same camera position and lens over the square, so the object is framed
    // exactly as on the square stage (and in the square posters); the margins show more studio.
    const S = frame.size;
    camera.setViewOffset(S, S, (r.cx * S) / 2 - frame.x, (-r.cy * S) / 2 - frame.y, frame.width, frame.height);
  } else {
    camera.setViewOffset(1000 * aspect, 1000, (r.cx * 1000 * aspect) / 2, (-r.cy * 1000) / 2, 1000 * aspect, 1000);
  }
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
  /** The slide (view offset) in NDC of the fitted square (or aspect) frame: what is moved to its centre. */
  offset: [number, number];
  /** NDC extents [x0, x1, y0, y1] of the hero and every path this fit holds, after the slide. */
  pathExtents: [number, number, number, number];
}

/**
 * The two fits of a scene whose decline needs more room than its rest (v1.5, the decline
 * pull-back; docs/style-reference.md): `rest` holds the hero and the paths of host and accept,
 * `decline` the hero and every path (the carry over the bin's rim and the open bin). A scene
 * without a bin has one fit: both are the same.
 */
export interface FramingPair {
  rest: HeroFraming;
  decline: HeroFraming;
}

/**
 * Place the product camera for a fitted view: `distance` from `aim` along the shared direction, the
 * view slid by `offset` (NDC of the fitted square, or of the `aspect` frame), and in fullscreen
 * extended from the frame square to the whole stage (v1.4).
 */
export function placeHeroView(camera: PerspectiveCamera, aim: Vector3, aspect: number, distance: number, offset: readonly [number, number], frame?: FrameRect): void {
  if (frame) aspect = 1;
  camera.clearViewOffset();
  camera.aspect = aspect;
  camera.position.copy(aim).addScaledVector(cameraDirection(), distance);
  camera.lookAt(aim);
  camera.updateMatrixWorld();
  const [ox, oy] = offset;
  if (frame) {
    // Same camera position and lens over the frame square; the rest of the stage extends the view.
    const S = frame.size;
    camera.setViewOffset(S, S, (ox * S) / 2 - frame.x, (-oy * S) / 2 - frame.y, frame.width, frame.height);
  } else camera.setViewOffset(1000 * aspect, 1000, (ox * 1000 * aspect) / 2, (-oy * 1000) / 2, 1000 * aspect, 1000);
  camera.updateProjectionMatrix();
}

/**
 * The view at pull `k` (0 rest, 1 decline) between two fits of the same aim (v1.5 decline
 * pull-back): a dolly along the shared view direction. The distance moves geometrically
 * (d_rest · (d_decline / d_rest)^k: equal steps of `k` are equal ratios of size on screen, the
 * perceptually even zoom of van Wijk and Nuij 2003), and the slide moves linearly in the zoom's
 * progress s (1/d, which is how far the image has scaled): a point at the aim's depth then travels on
 * a straight line across the screen, so the hero slides calmly from its rest composition to its
 * decline composition, never swinging out and back. Exact at k = 0 and k = 1.
 */
export function pulledView(rest: HeroFraming, decline: HeroFraming, k: number): { distance: number; offset: [number, number] } {
  const kk = Math.min(1, Math.max(0, k));
  const d0 = rest.distance, d1 = decline.distance;
  if (kk <= 0) return { distance: d0, offset: [rest.offset[0], rest.offset[1]] };
  if (kk >= 1) return { distance: d1, offset: [decline.offset[0], decline.offset[1]] };
  // Same distance (a slide only, e.g. the paths differ across but not in size): linear in k.
  const same = Math.abs(d1 - d0) < 1e-9 * d0;
  const d = same ? d0 : d0 * Math.pow(d1 / d0, kk);
  const s = same ? kk : (1 / d - 1 / d0) / (1 / d1 - 1 / d0);
  return { distance: d, offset: [lerpN(rest.offset[0], decline.offset[0], s), lerpN(rest.offset[1], decline.offset[1], s)] };
}
const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;

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
  frame?: FrameRect,
): HeroFraming {
  const f = solveHeroFits(camera, aim, aspect, hero, [paths], fill, clearance, frame)[0]!;
  placeHeroView(camera, aim, aspect, f.distance, f.offset, frame);
  return f;
}

/**
 * The hero rule solved for several path sets at once (v1.5: a scene's rest and decline paths),
 * the hero's own distance found once. Each result is the fit `fitPerspectiveToHero` would make with
 * that path set; nothing is applied (the camera is left at the last trial: place it with
 * `placeHeroView`).
 */
export function solveHeroFits(
  camera: PerspectiveCamera,
  aim: Vector3,
  aspect: number,
  hero: readonly Vector3[],
  pathSets: readonly (readonly Vector3[])[],
  fill: { readonly height: number; readonly width: number },
  clearance: number,
  frame?: FrameRect,
): HeroFraming[] {
  // Fullscreen (v1.4): fit the frame square exactly as the square stage, then extend the view.
  if (frame) aspect = 1;
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
  // Distance at which the hero fills `fill` (fill falls monotonically with distance).
  let lo = 0.05, hi = 400;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    place(mid);
    const e = extents(hero);
    if (!e.behind && heroFits(e)) hi = mid;
    else lo = mid;
  }
  const heroDistance = hi;
  return pathSets.map((paths) => {
    const all = [...hero, ...paths];
    const pathsFit = (d: number) => {
      place(d);
      const e = extents(all);
      return !e.behind && e.x1 - e.x0 <= 2 * limit && e.y1 - e.y0 <= 2 * limit;
    };
    let d = heroDistance;
    let pathLimited = false;
    if (!pathsFit(d)) {
      pathLimited = true;
      let a = d, b = 400;
      for (let i = 0; i < 60; i++) {
        const mid = (a + b) / 2;
        if (pathsFit(mid)) b = mid;
        else a = mid;
      }
      d = b;
    }
    place(d);
    const h = extents(hero), a = extents(all);
    // Slide: across, the hero sits centred, clamped so every path stays inside the clearance; up
    // and down, the frame centres the whole action (hero and paths), so a scene whose action rises
    // above its hero (the carry to the bin) keeps that headroom, as the v1.3 fit did.
    const slide = (c: number, l: number, u: number) => Math.min(Math.max(c, u - limit), l + limit);
    const ox = slide((h.x0 + h.x1) / 2, a.x0, a.x1);
    const oy = (a.y0 + a.y1) / 2;
    return {
      heroHeight: (h.y1 - h.y0) / 2,
      heroWidth: (h.x1 - h.x0) / 2,
      binding: (h.x1 - h.x0) / 2 / fill.width > (h.y1 - h.y0) / 2 / fill.height ? 'width' : 'height',
      pathLimited,
      heroCenter: [(h.x0 + h.x1) / 2 - ox, (h.y0 + h.y1) / 2 - oy],
      distance: d,
      offset: [ox, oy],
      pathExtents: [a.x0 - ox, a.x1 - ox, a.y0 - oy, a.y1 - oy],
    } satisfies HeroFraming;
  });
}
