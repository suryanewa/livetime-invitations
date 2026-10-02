import { describe, expect, it } from 'vitest';
import { Box3, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { fitCameraToBounds, fitPerspectiveToBounds, frameSquare, PERSPECTIVE_FOV, type FrameRect } from '../src/render/camera.ts';

/**
 * Fullscreen layout (v1.4): the object is framed in the frame square exactly as on the square
 * stage, and the view extends to the whole viewport. So a square poster laid over the frame square
 * matches the canvas at every aspect.
 */

const bounds = new Box3(new Vector3(-1.2, 0, -0.8), new Vector3(1.4, 2.1, 0.9));
const points = Array.from({ length: 40 }, (_, i) => {
  const t = i / 40;
  return new Vector3(-1.2 + 2.6 * t, 2.1 * ((i * 7) % 40) / 40, -0.8 + 1.7 * ((i * 13) % 40) / 40);
});

/** Projected sample → CSS px in a w × h viewport. */
function toPx(camera: PerspectiveCamera | OrthographicCamera, p: Vector3, w: number, h: number): [number, number] {
  const q = p.clone().project(camera);
  return [((q.x + 1) / 2) * w, ((1 - q.y) / 2) * h];
}

describe('frameSquare', () => {
  it('is the largest square in the free area, centred in it', () => {
    expect(frameSquare(1440, 900, { top: 200, right: 440, bottom: 16, left: 0 })).toEqual({ x: (1000 - 684) / 2, y: 200, size: 684, width: 1440, height: 900 });
    expect(frameSquare(390, 844, { top: 180, right: 0, bottom: 330, left: 0 })).toEqual({ x: 28, y: 180, size: 334, width: 390, height: 844 });
  });

  it('without insets is the centred square of the viewport', () => {
    expect(frameSquare(800, 600)).toEqual({ x: 100, y: 0, size: 600, width: 800, height: 600 });
  });

  it('never collapses: insets leaving less than a quarter of the shorter side are scaled back', () => {
    const f = frameSquare(400, 800, { top: 500, right: 0, bottom: 400, left: 0 });
    expect(f.size).toBeCloseTo(100, 6);
    expect(f.y + f.size).toBeLessThanOrEqual(800);
  });
});

describe('fullscreen fit matches the square fit inside the frame square', () => {
  const cases: [number, number, FrameRect][] = [
    [1440, 900, frameSquare(1440, 900, { top: 210, right: 440, bottom: 16, left: 0 })],
    [390, 844, frameSquare(390, 844, { top: 180, right: 0, bottom: 330, left: 0 })],
    [844, 390, frameSquare(844, 390, { top: 110, right: 380, bottom: 16, left: 0 })],
  ];

  it('perspective: every sample lands where the square stage puts it, scaled to the frame', () => {
    const square = new PerspectiveCamera(PERSPECTIVE_FOV, 1, 0.5, 200);
    fitPerspectiveToBounds(square, bounds, 1, undefined, points);
    for (const [w, h, frame] of cases) {
      const full = new PerspectiveCamera(PERSPECTIVE_FOV, w / h, 0.5, 200);
      fitPerspectiveToBounds(full, bounds, w / h, undefined, points, frame);
      expect(full.position.distanceTo(square.position)).toBeLessThan(1e-6);
      for (const p of points) {
        const [sx, sy] = toPx(square, p, frame.size, frame.size);
        const [fx, fy] = toPx(full, p, w, h);
        expect(fx).toBeCloseTo(frame.x + sx, 3);
        expect(fy).toBeCloseTo(frame.y + sy, 3);
      }
    }
  });

  it('orthographic: the same holds for the study camera', () => {
    const square = new OrthographicCamera();
    fitCameraToBounds(square, bounds, 1, undefined, points);
    for (const [w, h, frame] of cases) {
      const full = new OrthographicCamera();
      fitCameraToBounds(full, bounds, w / h, undefined, points, frame);
      for (const p of points) {
        const [sx, sy] = toPx(square, p, frame.size, frame.size);
        const [fx, fy] = toPx(full, p, w, h);
        expect(fx).toBeCloseTo(frame.x + sx, 3);
        expect(fy).toBeCloseTo(frame.y + sy, 3);
      }
    }
  });

  it('without a frame the fit is unchanged (square embeds)', () => {
    const a = new PerspectiveCamera(PERSPECTIVE_FOV, 1, 0.5, 200);
    const b = new PerspectiveCamera(PERSPECTIVE_FOV, 1, 0.5, 200);
    fitPerspectiveToBounds(a, bounds, 1, undefined, points);
    fitPerspectiveToBounds(b, bounds, 1, undefined, points, undefined);
    expect(a.projectionMatrix.elements).toEqual(b.projectionMatrix.elements);
  });
});
