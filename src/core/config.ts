import { CATEGORIES, DEFAULT_CONFIGS, type Category, type InvitationCard, type SceneConfig } from './types.ts';

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
  if (config.category === 'dinner') {
    const card = resolveCard((input as { card?: unknown }).card);
    if (card) config.card = card;
  }
  return { ok: true, config };
}

/** v1.7 (#41): the longest line the card prints, per line (characters; longer text is clamped). */
export const CARD_LIMITS = { eyebrow: 60, title: 80, name: 48 } as const;

/**
 * One line of the card's text: a string, trimmed, its control characters (C0, DEL, C1, and the
 * bidirectional and zero-width format controls) removed, its runs of white space made one space,
 * clamped to `limit` characters (whole code points). Empty or not a string: undefined.
 */
export function cardLine(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = [...clean];
  const line = (chars.length > limit ? chars.slice(0, limit).join('').trimEnd() : clean);
  return line.length > 0 ? line : undefined;
}

/** The Dinner card's text, sanitised (each line by `cardLine`); undefined when no line is left. */
export function resolveCard(input: unknown): InvitationCard | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const raw = input as Record<string, unknown>;
  const card: InvitationCard = {};
  for (const key of ['eyebrow', 'title', 'name'] as const) {
    const line = cardLine(raw[key], CARD_LIMITS[key]);
    if (line !== undefined) card[key] = line;
  }
  return Object.keys(card).length ? card : undefined;
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
  if (a.category === 'dinner') return sameCard(a.card, (b as typeof a).card);
  return a.category !== 'party' || a.songId === (b as typeof a).songId;
}

/** v1.7: two cards print the same (absent and empty lines are the same). */
export function sameCard(a: InvitationCard | undefined, b: InvitationCard | undefined): boolean {
  return (a?.eyebrow ?? '') === (b?.eyebrow ?? '') && (a?.title ?? '') === (b?.title ?? '') && (a?.name ?? '') === (b?.name ?? '');
}

/**
 * Whether two configs differ only in what is printed (v1.7: the Dinner card's text): the scene is
 * given the new config without resetting what it shows (the preset, and so the posters, is the same).
 */
export function printOnlyChange(a: SceneConfig, b: SceneConfig): boolean {
  return a.category === 'dinner' && b.category === 'dinner' && presetOf(a) === presetOf(b) && !sameCard(a.card, b.card);
}
