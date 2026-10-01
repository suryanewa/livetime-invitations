import type { SceneRecipe } from '../types.ts';

/**
 * Party recipe — stub. Masters to import: vintage-turntable.glb (record player).
 * Until the party scene agent fills in `masters`, the scene exports exactly as before (the
 * code-authored builder only, no texture policy). See scripts/masters/README.md.
 *
 * Decisions: none yet.
 */
export const recipe: SceneRecipe = {
  scene: 'party',
  status: 'no masters yet',
  masters: [],
  contract: [],
};
