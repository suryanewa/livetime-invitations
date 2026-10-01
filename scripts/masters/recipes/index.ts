import type { SceneRecipe } from '../types.ts';
import { recipe as birthday } from './birthday.ts';
import { recipe as business } from './business.ts';
import { recipe as dinner } from './dinner.ts';
import { recipe as party } from './party.ts';
import { recipe as sports } from './sports.ts';

/**
 * Every scene's recipe, registered once so scene agents only ever edit their own
 * `recipes/<scene>.ts` (never this file or scripts/export-models.ts).
 */
export const RECIPES: Record<string, SceneRecipe> = { party, birthday, sports, dinner, business };
