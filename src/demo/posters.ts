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
 * Backdrop stills (BACKDROP_FIELD = 7 × the frame), the studio around the square poster wherever the
 * stage is larger than the frame square (fullscreen; v1.7 posters, also a square-layout mount of
 * another aspect): assets/scenes/<category>/backdrop.webp at the scene's rest framing (host-ready and
 * guest-ready posters), backdrop-declined.webp (v1.5; at the decline's framing for the scenes whose
 * decline pulls back, Birthday and Dinner) and backdrop-accepted.webp (v1.7 #42; Dinner's at its
 * close-up on the card). v1.7 posters: every still has the scene in it, at its pose (v1.4–v1.6: the
 * bare studio), and every scene has all three: what the live view shows outside the frame square
 * (cast shadows, Business's lanyard, which swings with the badge once answered, Dinner's plate) is
 * there before the scene is live, and the poster's feather blends like with like. A missing pose
 * still falls back to backdrop.webp.
 */
const backdrops = import.meta.glob('../../assets/scenes/*/backdrop*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function backdropUrl(category: Category, pose: CanonicalPose = 'guest-ready'): string | null {
  const find = (file: string) => Object.entries(backdrops).find(([path]) => path.endsWith(`/scenes/${category}/${file}`))?.[1] ?? null;
  return (pose === 'declined' ? find('backdrop-declined.webp') : pose === 'accepted' ? find('backdrop-accepted.webp') : null) ?? find('backdrop.webp');
}
