import type { CanonicalPose, Category } from '../core/types.ts';

/**
 * Poster lookup. URLs only: nothing is fetched until the controller shows a poster, and only
 * the currently needed one (Master §8). Files: assets/scenes/<category>/posters/<preset>-<pose>.webp
 */
const files = import.meta.glob('../../assets/scenes/*/posters/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const table = new Map<string, string>();
for (const [path, url] of Object.entries(files)) {
  const m = path.match(/scenes\/([a-z]+)\/posters\/([a-z]+)-([a-z-]+)\.webp$/);
  if (m) table.set(`${m[1]}/${m[2]}/${m[3]}`, url);
}

export function posterUrl(category: Category, preset: string, pose: CanonicalPose): string | null {
  return table.get(`${category}/${preset}/${pose}`) ?? table.get(`${category}/shared/${pose}`) ?? null;
}
