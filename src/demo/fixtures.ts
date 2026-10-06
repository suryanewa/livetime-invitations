import type { Category, SceneConfig } from '../core/types.ts';

/** Fixture data for the standalone showcase. Nothing here is a real event or customer. */

export interface EventFixture {
  title: string;
  when: string;
  where: string;
}

export const EVENTS: Record<Category, EventFixture> = {
  party: { title: 'Rooftop listening party', when: 'Fri, Oct 23 · 9:00 PM', where: 'Greenpoint Terrace' },
  birthday: { title: "Alex's birthday", when: 'Sat, Oct 17 · 7:00 PM', where: 'The Loft, 214 Grand St' },
  sports: { title: 'Sunday pickup game', when: 'Sun, Oct 25 · 10:00 AM', where: 'West 4th Street Courts' },
  dinner: { title: 'Supper club: autumn menu', when: 'Thu, Nov 5 · 7:30 PM', where: 'Studio kitchen, 12 Orchard St' },
  business: { title: 'Partner Summit — Welcome Reception', when: 'Thu, Nov 12 · 6:30 PM', where: 'Hudson Yards, New York' },
};

/**
 * v1.7 (Dinner, spec revision #41): the invitation card's print in the showcase. The eyebrow and
 * the event's title for everyone; a sample invitee's name in guest mode only (the host previews
 * an invitation before it has a guest). The live showcase prints them; the shipped posters do not
 * (POSTER_CARD below); an integrating app passes its own guest's (docs/integration.md).
 */
export const SAMPLE_INVITEE = 'Alex Rivera';
export const CARD_EYEBROW = 'You\u2019re invited';
export function dinnerCard(mode: 'host' | 'guest'): { eyebrow: string; title: string; name?: string } {
  return mode === 'guest' ? { eyebrow: CARD_EYEBROW, title: EVENTS.dinner.title, name: SAMPLE_INVITEE } : { eyebrow: CARD_EYEBROW, title: EVENTS.dinner.title };
}
/** A Dinner config with the showcase's card for `mode` (a config that brings its own card keeps it). */
export function withCard(config: SceneConfig, mode: 'host' | 'guest', replace = false): SceneConfig {
  if (config.category !== 'dinner' || (config.card && !replace)) return config;
  return { ...config, card: dinnerCard(mode) };
}

/**
 * v1.7 polish (#41): the print on the shipped Dinner stills — the host-ready and accepted posters
 * and `backdrop-accepted.webp` — is neutral: the eyebrow only, no title, no name. A poster is what
 * a real guest sees before the scene is live (before load, on a saved accept), on the Static tier,
 * after a context loss and on a load failure, so it must never carry someone else's event or name;
 * the live card prints the config's own title and name as soon as the scene is ready.
 */
export const POSTER_CARD: Readonly<{ eyebrow: string }> = { eyebrow: CARD_EYEBROW };
/** The config a shipped poster is rendered with (`pnpm capture`, posters.spec): Dinner's card neutral, every other config as is. */
export function posterConfig(config: SceneConfig): SceneConfig {
  return config.category === 'dinner' ? { ...config, card: { ...POSTER_CARD } } : config;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  party: 'Party',
  birthday: 'Birthday',
  sports: 'Sports',
  dinner: 'Dinner',
  business: 'Business',
};

export const OBJECT_LABEL: Record<Category, string> = {
  party: 'Record player',
  birthday: 'Cake',
  sports: 'Basketball',
  dinner: 'Covered dish',
  business: 'Keycard',
};

export const HOST_ACTION: Record<Category, string> = {
  party: 'Place record',
  birthday: 'Place candles',
  sports: 'Pass ball',
  dinner: 'Cover dish',
  business: 'Attach card',
};

/** Host preset group names and the reset note (the preset is a finite choice per scene). */
export const PRESET_LEGEND: Record<Category, { legend: string; noun: string }> = {
  // Party's host panel also offers the song, which resets the preview too.
  party: { legend: 'Record label', noun: 'song or label' },
  birthday: { legend: 'Frosting', noun: 'frosting' },
  sports: { legend: 'Ball', noun: 'ball' },
  dinner: { legend: 'Dish', noun: 'dish' },
  business: { legend: 'Card template', noun: 'template' },
};

/** Demo song metadata (fixtures only; production supplies already-cleared metadata). */
export const SONGS = [
  { id: 'sample-track-a', title: 'Sample track A' },
  { id: 'sample-track-b', title: 'Sample track B' },
];

/** Missing or unknown song metadata never breaks the scene (Party sub-spec). */
export function songTitle(songId: string | undefined): string {
  return SONGS.find((s) => s.id === songId)?.title ?? 'Selected track';
}

export interface PresetOption {
  label: string;
  config: SceneConfig;
}

/** Curated presets per scene: two for most scenes, one for Dinner (see `presetAt`). */
export const PRESETS: Record<Category, PresetOption[]> = {
  party: [
    { label: 'Coral label', config: { category: 'party', songId: 'sample-track-a', label: 'coral' } },
    { label: 'Cobalt label', config: { category: 'party', songId: 'sample-track-a', label: 'cobalt' } },
  ],
  birthday: [
    { label: 'Blue', config: { category: 'birthday', cake: 'vanilla' } },
    { label: 'Cocoa', config: { category: 'birthday', cake: 'cocoa' } },
  ],
  sports: [
    { label: 'Orange ball', config: { category: 'sports', ball: 'orange' } },
    { label: 'Cream ball', config: { category: 'sports', ball: 'cream' } },
  ],
  // Dinner (v1.2) is the silver cloche and the clean plate, no food (Surya, 2026-10-01): one look,
  // no preset control. `dish` stays in its config for integration compatibility and selects nothing.
  dinner: [{ label: 'Cloche and plate', config: { category: 'dinner', dish: 'pasta' } }],
  business: [
    { label: 'Light card', config: { category: 'business', template: 'light' } },
    { label: 'Dark card', config: { category: 'business', template: 'dark' } },
  ],
};

/** Preset `set` of a scene, or its only look when it has fewer (Dinner has one). */
export function presetAt(category: Category, set: number): PresetOption {
  const options = PRESETS[category];
  return options[set] ?? options[0]!;
}

/** Plain-language pose descriptions for the text fallback when a poster cannot load. */
export const POSE_TEXT: Record<Category, Record<'host-ready' | 'guest-ready' | 'accepted' | 'declined', string>> = {
  business: {
    'host-ready': 'A badge waits below the lanyard\'s snap hook.',
    'guest-ready': 'A keycard hangs on a lanyard beside a card reader.',
    accepted: 'The keycard hangs beside the reader; the reader shows a green check.',
    declined: 'The keycard hangs beside the reader; the reader shows a red minus.',
  },
  party: {
    'host-ready': 'A record hovers above an open record player.',
    'guest-ready': 'A record sits on the player with the lid open.',
    accepted: 'The needle is on the record.',
    declined: 'The record player lid is closed.',
  },
  birthday: {
    'host-ready': 'A two-tier cake waits on its stand.',
    'guest-ready': 'A two-tier cake with six lit candles.',
    accepted: 'The candles are blown out.',
    declined: 'The cake is in the bin; the stand is empty.',
  },
  sports: {
    'host-ready': 'A basketball rests at the foot of the hoop, ready to pass.',
    'guest-ready': 'A basketball in front of a hoop.',
    accepted: 'The ball rests under the hoop after going through it.',
    declined: 'The ball rests to the side of the hoop.',
  },
  dinner: {
    'host-ready': 'An invitation card on a plate, with a silver cover poised above it.',
    'guest-ready': 'A covered dish.',
    accepted: 'The cover is set down beside the plate; the invitation card on the plate, seen close up.',
    declined: 'The covered dish is in the bin.',
  },
};

export const LIVE_CATEGORIES: readonly Category[] = ['party', 'birthday', 'sports', 'dinner', 'business'];
