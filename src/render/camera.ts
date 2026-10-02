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
