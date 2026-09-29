import { describe, expect, it } from 'vitest';
import { presetOf } from '../src/core/config.ts';
import type { CanonicalPose, Category } from '../src/core/types.ts';
import { PRESETS } from '../src/demo/fixtures.ts';
import { posterUrl } from '../src/demo/posters.ts';

const POSES: CanonicalPose[] = ['host-ready', 'guest-ready', 'accepted', 'declined'];

describe('posters (Master §8 static alternatives)', () => {
  it('every curated preset has a poster for every canonical pose', () => {
    const missing: string[] = [];
    for (const [category, options] of Object.entries(PRESETS) as [Category, (typeof PRESETS)[Category]][]) {
      for (const option of options) {
        for (const pose of POSES) {
          if (!posterUrl(category, presetOf(option.config), pose)) missing.push(`${category}/${presetOf(option.config)}/${pose}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
