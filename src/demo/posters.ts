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

/**
 * Fullscreen backdrop stills (bare studio, BACKDROP_FIELD = 7 × the frame): assets/scenes/<category>/backdrop.webp
 * at the scene's rest framing, and (v1.5 decline pull-back) backdrop-declined.webp at its decline
 * framing for the scenes whose declined pose is pulled back (Birthday, Dinner). A scene without one
 * has one framing, so its declined poster takes the rest backdrop. v1.7 (#42): Dinner's accepted
 * pose is the close-up on the card, so its accepted poster melts into backdrop-accepted.webp, the
 * close-up at the same field *with* the scene in it (the plate runs past the poster's edges on
 * every side, so a bare-studio still would cut it off at the feather).
 */
const backdrops = import.meta.glob('../../assets/scenes/*/backdrop*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function backdropUrl(category: Category, pose: CanonicalPose = 'guest-ready'): string | null {
  const find = (file: string) => Object.entries(backdrops).find(([path]) => path.endsWith(`/scenes/${category}/${file}`))?.[1] ?? null;
  return (pose === 'declined' ? find('backdrop-declined.webp') : pose === 'accepted' ? find('backdrop-accepted.webp') : null) ?? find('backdrop.webp');
}
