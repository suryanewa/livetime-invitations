import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { cardBottom, clampDragTarget, DRAG_BOUNDS, touchesScanner } from '../src/scenes/business/drag.ts';
import { POSE, SCAN_AT } from '../src/scenes/business/poses.ts';
import { newFrame, sampleSequence } from '../src/scenes/business/sequences.ts';

describe('Business optional drag geometry', () => {
  it('clamps the rotated card, not the pivot: the card never goes below the floor', () => {
    for (let t = 0.1; t < SCAN_AT; t += 0.05) {
      const f = sampleSequence('accept', t, newFrame());
      for (const [x, y] of [[-0.9, -1], [0, 0.2], [0.7, 0.5], [-0.3, 1.2]] as const) {
        const target = clampDragTarget(new Vector3(x, y, f.pivot.z), f.rot);
        expect(cardBottom(target, f.rot)).toBeGreaterThanOrEqual(DRAG_BOUNDS.floor - 1e-9);
        expect(target.x).toBeGreaterThanOrEqual(DRAG_BOUNDS.minX);
        expect(target.x).toBeLessThanOrEqual(DRAG_BOUNDS.maxX);
      }
    }
  });

  it('reports reader contact at the scan pose and not at the ready pose', () => {
    const ready = sampleSequence('accept', 0.1, newFrame());
    expect(touchesScanner(ready.pivot, ready.rot)).toBe(false);
    const scan = sampleSequence('accept', SCAN_AT, newFrame());
    expect(touchesScanner(scan.pivot, scan.rot)).toBe(true);
    expect(touchesScanner(POSE.scan.pivot, scan.rot)).toBe(true);
  });

  it('pushing a near-vertical card into the housing counts as contact, never pass-through', () => {
    const f = sampleSequence('decline', 0.2, newFrame());
    const target = clampDragTarget(new Vector3(0.6, 1.0, f.pivot.z), f.rot);
    expect(touchesScanner(target, f.rot)).toBe(true);
  });
});
