import { Box3, MathUtils, OrthographicCamera, Vector3 } from 'three';

/**
 * Shared orthographic three-quarter camera (Master §5). One lens for all five scenes;
 * scenes never tune their own angle.
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
 * Long-lens perspective variant (fidelity pass): same azimuth/elevation, subtle depth.
 * Distance is solved so the projected motion bounds fit with the same clearance.
 */
export function fitPerspectiveToBounds(
  camera: import('three').PerspectiveCamera,
  bounds: Box3,
  aspect: number,
  clearance = FRAMING_CLEARANCE,
): void {
  const center = bounds.getCenter(new Vector3());
  const dir = cameraDirection();
  camera.clearViewOffset();
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  const limit = 1 - 2 * clearance;
  const fits = (d: number) => {
    camera.position.copy(center).addScaledVector(dir, d);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z).project(camera);
      minX = Math.min(minX, corner.x); maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, corner.y); maxY = Math.max(maxY, corner.y);
    }
    return { ok: maxX - minX <= 2 * limit && maxY - minY <= 2 * limit, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  };
  let lo = 1, hi = 200;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid).ok) hi = mid;
    else lo = mid;
  }
  const r = fits(hi);
  // Recentre: shift the view so the projected bounds sit in the middle of the frame.
  camera.setViewOffset(1000 * aspect, 1000, (r.cx * 1000 * aspect) / 2, (-r.cy * 1000) / 2, 1000 * aspect, 1000);
  camera.updateProjectionMatrix();
}
