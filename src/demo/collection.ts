import type { Category } from '../core/types.ts';

/** Collection-rail thumbnails: browser-rendered stills from the locked style reference. */
const files = import.meta.glob('../../assets/ui/collection/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const EMPTY = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/%3E';

export function collectionThumb(category: Category): string {
  const hit = Object.entries(files).find(([path]) => path.endsWith(`/${category}.webp`));
  return hit ? hit[1] : EMPTY;
}
