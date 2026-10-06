import { Box3, MathUtils, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
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

/** The unit vector from an aim towards the camera at `azimuthDeg` round y (from +z) and `elevationDeg` up. */
export function viewDirection(azimuthDeg: number, elevationDeg: number, out = new Vector3()): Vector3 {
  const az = MathUtils.degToRad(azimuthDeg);
  const el = MathUtils.degToRad(elevationDeg);
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

/** The shared direction (CAMERA_ANGLES): every scene's rest, decline and still framing. */
export function cameraDirection(out = new Vector3()): Vector3 {
  return viewDirection(CAMERA_ANGLES.azimuthDeg, CAMERA_ANGLES.elevationDeg, out);
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
 * The points of `points` that can ever set a framing at the shared angle (v1.5): the vertices of
 * their convex hulls in the camera's (depth, across) and (depth, up) planes. Every fit here looks
 * along `cameraDirection()` from the aim, so a point's place on screen is x = k·X / (d − Z) and
 * y = k·Y / (d − Z) (X across, Y up, Z towards the camera, d the distance, k the lens and aspect);
 * for any distance and aspect the extremes of those linear-fractional functions over a point set,
 * and its nearest depth, are taken at vertices of the (Z, X) and (Z, Y) hulls. So the reduction is
 * exact for the hero, bounds and orthographic fits (the probe and the unit test check it), and it
 * takes the bin's every vertex (≈ 10⁵ points) to a few hundred: the fit's 120 bisection steps
 * then cost microseconds, not the half-second refit the phone layout's dock used to trigger.
 */
export function framingHull(points: readonly Vector3[]): Vector3[] {
  if (points.length <= 8) return [...points];
  const back = cameraDirection();
  const right = new Vector3(0, 1, 0).cross(back).normalize();
  const up = new Vector3().crossVectors(back, right);
  const n = points.length;
  const z = new Float64Array(n), x = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    z[i] = p.dot(back);
    x[i] = p.dot(right);
    y[i] = p.dot(up);
  }
  const keep = new Set<number>();
  const order = Array.from({ length: n }, (_, i) => i);
  for (const v of [x, y]) {
    // Andrew's monotone chain on (z, v); strictly convex turns only.
    order.sort((a, b) => z[a]! - z[b]! || v[a]! - v[b]!);
    const cross = (o: number, a: number, b: number) => (z[a]! - z[o]!) * (v[b]! - v[o]!) - (v[a]! - v[o]!) * (z[b]! - z[o]!);
    const chain = (ids: number[]) => {
      const h: number[] = [];
      for (const i of ids) {
        while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, i) <= 0) h.pop();
        h.push(i);
      }
      return h;
    };
    for (const i of chain(order)) keep.add(i);
    for (const i of chain([...order].reverse())) keep.add(i);
  }
  return [...keep].sort((a, b) => a - b).map((i) => points[i]!);
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
  /**
   * v1.7 (#42, Dinner): the close-up's fit, along its own direction at its own aim (`CloseUp`), for
   * a scene that has one. Its `heroWidth`/`heroHeight` are the subject's (the card's) fill.
   */
  closeUp?: HeroFraming;
}

/**
 * v1.7 (spec revision #42, pending Surya): a close-up a scene's accepted pose moves to (Dinner: the
 * invitation card, head-on). `points` (the subject's silhouette, the content's own space) are fitted
 * along their own direction, `azimuthDeg`/`elevationDeg`, through the same lens, aimed at their
 * centre, so that their width fills `widthFill` of the frame (centred). The one exception to the
 * one-angle rule besides the decline's dolly (#39); the azimuth is kept so the light holds.
 */
export interface CloseUp {
  points: readonly Vector3[];
  azimuthDeg: number;
  elevationDeg: number;
  widthFill: number;
}

/** A placed view: the camera's position, the point it looks at, and its slide (NDC of the fitted square). */
export interface ViewPose {
  position: Vector3;
  target: Vector3;
  offset: [number, number];
}

/**
 * Place the product camera for a fitted view: `distance` from `aim` along the shared direction, the
 * view slid by `offset` (NDC of the fitted square, or of the `aspect` frame), and in fullscreen
 * extended from the frame square to the whole stage (v1.4).
 */
export function placeHeroView(
  camera: PerspectiveCamera, aim: Vector3, aspect: number, distance: number, offset: readonly [number, number], frame?: FrameRect, dir: Vector3 = cameraDirection(),
): void {
  placeView(camera, heroPosition.copy(aim).addScaledVector(dir, distance), aim, aspect, offset, frame);
}
const heroPosition = new Vector3();

/**
 * Place the product camera at `position` looking at `target`, its view slid by `offset` (NDC of the
 * fitted square, or of the `aspect` frame), and in fullscreen extended from the frame square to the
 * whole stage (v1.4): what `placeHeroView` does for a fit, for any view (v1.7: the close-up's move).
 */
export function placeView(camera: PerspectiveCamera, position: Vector3, target: Vector3, aspect: number, offset: readonly [number, number], frame?: FrameRect): void {
  if (frame) aspect = 1;
  camera.clearViewOffset();
  camera.aspect = aspect;
  camera.position.copy(position);
  camera.lookAt(target);
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
  dir: Vector3 = cameraDirection(),
): HeroFraming[] {
  // Fullscreen (v1.4): fit the frame square exactly as the square stage, then extend the view.
  if (frame) aspect = 1;
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

/**
 * v1.7 (#42): the close-up's fit. The subject's points are the hero, along the close-up's own
 * direction at their own centre, held by their width (`widthFill`; their height may fill up to
 * 1 − clearance), centred; nothing else is in it. Exact for any point set (no hull reduction: a
 * close-up's subject is a handful of corners).
 */
export function solveCloseFit(camera: PerspectiveCamera, aim: Vector3, aspect: number, closeUp: CloseUp, points: readonly Vector3[], clearance: number, frame?: FrameRect): HeroFraming {
  const dir = viewDirection(closeUp.azimuthDeg, closeUp.elevationDeg);
  return solveHeroFits(camera, aim, aspect, points, [[]], { height: 1 - clearance, width: closeUp.widthFill }, clearance, frame, dir)[0]!;
}

/** The camera pose a fit places (`placeHeroView`): its position, target and slide. */
export function fitPose(aim: Vector3, distance: number, offset: readonly [number, number], dir: Vector3 = cameraDirection(), out?: ViewPose): ViewPose {
  const o = out ?? { position: new Vector3(), target: new Vector3(), offset: [0, 0] };
  o.position.copy(aim).addScaledVector(dir, distance);
  o.target.copy(aim);
  o.offset[0] = offset[0];
  o.offset[1] = offset[1];
  return o;
}

const ndc = new Vector3();
const arc0 = new Vector3(), arc1 = new Vector3();
const probe = new PerspectiveCamera();
/** Where `p` lands (NDC, before the slide) seen from `position` looking at `target`. */
function sightOf(p: Vector3, position: Vector3, target: Vector3, out: [number, number]): [number, number] {
  probe.position.copy(position);
  probe.lookAt(target);
  probe.updateMatrixWorld();
  probe.updateProjectionMatrix();
  ndc.copy(p).project(probe);
  out[0] = ndc.x;
  out[1] = ndc.y;
  return out;
}

/**
 * v1.7 (#42): the move from a view `from` (the rest fit, or wherever the decline's pull has it) to
 * the close-up `to`, both aimed through the same lens, at `k` (0 exactly `from`, 1 exactly `to`).
 * A boom and push-in: the camera's line of sight turns from `from`'s to `to`'s, its elevation and
 * azimuth moving linearly (the close-up keeps the shared azimuth, so the sight never swings sideways
 * and the card's long edges, parallel to the camera's right, stay level on screen throughout); the
 * point it looks at travels from `from`'s target to `to`'s; its distance from it moves geometrically
 * (equal steps of k are equal ratios of size, as the decline's dolly); and the slide is set so the
 * subject's centre `subject` crosses the screen on a straight line from where `from` shows it to
 * where `to` does — no swing. Every quantity is smooth in k, so a C1 k(t) is a C1 move. `fov` and
 * `aspect` are the lens and the fitted frame's aspect (1 in fullscreen), which the slide is measured in.
 */
export function closeUpView(from: ViewPose, to: ViewPose, subject: Vector3, k: number, fov: number, aspect: number, out?: ViewPose): ViewPose {
  const o = out ?? { position: new Vector3(), target: new Vector3(), offset: [0, 0] };
  const kk = Math.min(1, Math.max(0, k));
  if (kk <= 0) return copyPose(from, o);
  if (kk >= 1) return copyPose(to, o);
  probe.fov = fov;
  probe.aspect = aspect;
  // Each end's line of sight (target → camera) in spherical coordinates.
  arc0.copy(from.position).sub(from.target);
  arc1.copy(to.position).sub(to.target);
  const r0 = arc0.length(), r1 = arc1.length();
  const el0 = Math.asin(arc0.y / r0), el1 = Math.asin(arc1.y / r1);
  const az0 = Math.atan2(arc0.x, arc0.z);
  let az1 = Math.atan2(arc1.x, arc1.z);
  if (az1 - az0 > Math.PI) az1 -= 2 * Math.PI;
  else if (az0 - az1 > Math.PI) az1 += 2 * Math.PI;
  const r = r0 * Math.pow(r1 / r0, kk), el = el0 + (el1 - el0) * kk, az = az0 + (az1 - az0) * kk;
  o.target.lerpVectors(from.target, to.target, kk);
  o.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(r).add(o.target);
  // The subject's centre on screen: where each end shows it (after its slide), on a straight line.
  const q0 = sightOf(subject, from.position, from.target, [0, 0]);
  const q1 = sightOf(subject, to.position, to.target, [0, 0]);
  const qx = q0[0] - from.offset[0] + (q1[0] - to.offset[0] - (q0[0] - from.offset[0])) * kk;
  const qy = q0[1] - from.offset[1] + (q1[1] - to.offset[1] - (q0[1] - from.offset[1])) * kk;
  const q = sightOf(subject, o.position, o.target, [0, 0]);
  o.offset[0] = q[0] - qx;
  o.offset[1] = q[1] - qy;
  return o;
}

function copyPose(a: ViewPose, o: ViewPose): ViewPose {
  o.position.copy(a.position);
  o.target.copy(a.target);
  o.offset[0] = a.offset[0];
  o.offset[1] = a.offset[1];
  return o;
}
