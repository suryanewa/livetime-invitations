import type { SceneRecipe } from '../types.ts';

/**
 * Dinner recipe — stub. Masters to import: dinner-plate.glb + silver-cloche.glb (plate, cover).
 * Until the dinner scene agent fills in `masters`, the scene exports exactly as before (the
 * code-authored builder only, no texture policy). See scripts/masters/README.md.
 *
 * Decisions: none yet.
 */
export const recipe: SceneRecipe = {
  scene: 'dinner',
  status: 'no masters yet',
  masters: [],
  contract: [],
};
