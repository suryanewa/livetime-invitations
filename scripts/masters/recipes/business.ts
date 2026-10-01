import type { SceneRecipe } from '../types.ts';

/**
 * Business recipe — stub. Masters to import: all-access-badge.glb + rfid-nfc-reader.glb (card, reader).
 * Until the business scene agent fills in `masters`, the scene exports exactly as before (the
 * code-authored builder only, no texture policy). See scripts/masters/README.md.
 *
 * Decisions: none yet.
 */
export const recipe: SceneRecipe = {
  scene: 'business',
  status: 'no masters yet',
  masters: [],
  contract: [],
};
