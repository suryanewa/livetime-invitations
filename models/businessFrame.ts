import type { Object3D } from 'three';
import { HANG_PIVOT, LANYARD_TOP_Y, SCANNER_POS } from './businessContract.ts';
import { group } from './geometry.ts';
import type { ModelContext } from './types.ts';

/**
 * Recipe builder for Business v1.2 (scripts/masters/recipes/business.ts): only the scene's empty
 * contract nodes. Everything visible comes from the badge and reader masters; the strap strands,
 * the sewn tab, the contact shadows and the status spill are added at runtime (models/business.ts).
 */
export function buildBusinessFrame(_ctx: ModelContext): Object3D {
  const root = group('business_root');
  group('card_authored', root).position.copy(HANG_PIVOT);
  group('lanyard_anchor', root).position.set(HANG_PIVOT.x, LANYARD_TOP_Y, HANG_PIVOT.z);
  group('lanyard_curve', root);
  group('scanner_root', root).position.copy(SCANNER_POS);
  group('card_shadow', root).position.set(HANG_PIVOT.x, 0.002, HANG_PIVOT.z);
  group('scanner_shadow', root).position.set(SCANNER_POS.x + 0.04, 0.002, SCANNER_POS.z - 0.02);
  return root;
}
