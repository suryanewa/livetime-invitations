import { CATEGORIES, DEFAULT_CONFIGS, type Category, type SceneConfig } from './types.ts';

export type ConfigResolution =
  | { ok: true; config: SceneConfig }
  | { ok: false; received: unknown };

const PRESETS = {
  party: { key: 'label', values: ['coral', 'cobalt'] },
  birthday: { key: 'cake', values: ['vanilla', 'cocoa'] },
  sports: { key: 'ball', values: ['orange', 'cream'] },
  dinner: { key: 'dish', values: ['pasta', 'vegetables'] },
  business: { key: 'template', values: ['light', 'dark'] },
} as const;

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

/**
 * Validate an incoming config before it replaces the active scene (Master §7).
 * Unknown presets resolve to the category default; invalid categories are rejected.
 */
export function resolveConfig(input: unknown): ConfigResolution {
  if (typeof input !== 'object' || input === null) return { ok: false, received: input };
  const category = (input as { category?: unknown }).category;
  if (!isCategory(category)) return { ok: false, received: category };

  const preset = PRESETS[category];
  const raw = (input as Record<string, unknown>)[preset.key];
  const value = (preset.values as readonly unknown[]).includes(raw) ? raw : DEFAULT_CONFIGS[category][preset.key as never];
  const config = { ...DEFAULT_CONFIGS[category], [preset.key]: value } as SceneConfig;

  if (config.category === 'party') {
    const songId = (input as { songId?: unknown }).songId;
    config.songId = typeof songId === 'string' && songId.length > 0 ? songId : DEFAULT_CONFIGS.party.songId;
  }
  return { ok: true, config };
}

/** The visually distinct preset key used for posters and materials. */
export function presetOf(config: SceneConfig): string {
  switch (config.category) {
    case 'party':
      return config.label;
    case 'birthday':
      return config.cake;
    case 'sports':
      return config.ball;
    case 'dinner':
      return config.dish;
    case 'business':
      return config.template;
  }
}

export function sameConfig(a: SceneConfig, b: SceneConfig): boolean {
  if (a.category !== b.category || presetOf(a) !== presetOf(b)) return false;
  return a.category !== 'party' || a.songId === (b as typeof a).songId;
}
