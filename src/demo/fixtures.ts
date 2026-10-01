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
    { label: 'Vanilla', config: { category: 'birthday', cake: 'vanilla' } },
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
    'host-ready': 'A keycard waits below an open lanyard clip.',
    'guest-ready': 'A keycard hangs on a lanyard above a card reader.',
    accepted: 'The keycard rests beside the reader; its light shows green with a check.',
    declined: 'The keycard rests beside the reader; its light shows red with a minus.',
  },
  party: {
    'host-ready': 'A record hovers above an open record player.',
    'guest-ready': 'A record sits on the player with the lid open.',
    accepted: 'The needle is on the record.',
    declined: 'The record player lid is closed.',
  },
  birthday: {
    'host-ready': 'A cake waits on its tray.',
    'guest-ready': 'A cake with three lit candles.',
    accepted: 'The candles are blown out.',
    declined: 'The cake is in the bin; the tray is empty.',
  },
  sports: {
    'host-ready': 'A basketball rests at the foot of the hoop, ready to pass.',
    'guest-ready': 'A basketball in front of a hoop.',
    accepted: 'The ball rests under the hoop after going through it.',
    declined: 'The ball rests to the side of the hoop.',
  },
  dinner: {
    'host-ready': 'An empty plate with a silver cover poised above it.',
    'guest-ready': 'A covered dish.',
    accepted: 'The cover is lifted and set down beside the plate.',
    declined: 'The covered dish is in the bin.',
  },
};

export const LIVE_CATEGORIES: readonly Category[] = ['party', 'birthday', 'sports', 'dinner', 'business'];
