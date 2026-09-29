import { Quaternion, Vector3 } from 'three';
import { CARD, CARD_OFFSET_Y, SCANNER_POS, SCANNER_WIDTH, SCANNER_FOOT } from '../../../models/keycard.ts';
import { PAD_CENTER } from './poses.ts';

/**
 * Pure geometry for the optional card drag (Business sub-spec): the rectangle limits the
 * card's rotated extent — not just the clip pivot — and contact is judged from the card's
 * actual (tilted) centre and corners. Never affects the chosen response.
 */

export const DRAG_BOUNDS = { minX: -0.95, maxX: 0.72, maxY: 2.42, floor: 0.03 };
export const CONTACT_RADIUS = 0.42;

const corner = new Vector3();
const centre = new Vector3();

/** World-space card centre for a clip pivot and card orientation. */
export function cardCentre(pivot: Vector3, rot: Quaternion, out = new Vector3()): Vector3 {
  return out.set(0, CARD_OFFSET_Y, 0).applyQuaternion(rot).add(pivot);
}

/** Lowest point of the card's four corners. */
export function cardBottom(pivot: Vector3, rot: Quaternion): number {
  let min = Infinity;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    corner.set((sx * CARD.width) / 2, CARD_OFFSET_Y + (sy * CARD.height) / 2, 0).applyQuaternion(rot).add(pivot);
    min = Math.min(min, corner.y);
  }
  return min;
}

/** Clamp a requested pivot so the whole card stays above the floor and inside the stage. */
export function clampDragTarget(target: Vector3, rot: Quaternion): Vector3 {
  target.x = Math.min(DRAG_BOUNDS.maxX, Math.max(DRAG_BOUNDS.minX, target.x));
  target.y = Math.min(DRAG_BOUNDS.maxY, target.y);
  const bottom = cardBottom(target, rot);
  if (bottom < DRAG_BOUNDS.floor) target.y += DRAG_BOUNDS.floor - bottom;
  return target;
}

const housing = {
  minX: SCANNER_POS.x - SCANNER_WIDTH / 2,
  maxX: SCANNER_POS.x + SCANNER_WIDTH / 2,
  maxY: SCANNER_FOOT + 0.84,
  minZ: SCANNER_POS.z - 0.36,
  maxZ: SCANNER_POS.z + 0.36,
};

/**
 * Contact with the reader: the card centre near the pad, or any card corner entering the
 * scanner housing. Either triggers the chosen scan early instead of passing through.
 */
export function touchesScanner(pivot: Vector3, rot: Quaternion): boolean {
  if (cardCentre(pivot, rot, centre).distanceTo(PAD_CENTER) < CONTACT_RADIUS) return true;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1]] as const) {
    corner.set((sx * CARD.width) / 2, CARD_OFFSET_Y + (sy * CARD.height) / 2, 0).applyQuaternion(rot).add(pivot);
    if (corner.x > housing.minX && corner.x < housing.maxX && corner.y < housing.maxY && corner.z > housing.minZ && corner.z < housing.maxZ) {
      return true;
    }
  }
  return false;
}
