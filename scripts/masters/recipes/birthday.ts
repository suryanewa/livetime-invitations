import type { SceneRecipe } from '../types.ts';

/**
 * Birthday recipe — stub. Masters to import: birthday-cake.glb (cake, stand, candles).
 * Until the birthday scene agent fills in `masters`, the scene exports exactly as before (the
 * code-authored builder only, no texture policy). See scripts/masters/README.md.
 *
 * Decisions: none yet.
 */
export const recipe: SceneRecipe = {
  scene: 'birthday',
  status: 'no masters yet',
  masters: [],
  contract: [],
};
