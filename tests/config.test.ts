import { describe, expect, it } from 'vitest';
import { CARD_LIMITS, cardLine, presetOf, printOnlyChange, resolveConfig, sameConfig } from '../src/core/config.ts';
import type { SceneConfig } from '../src/core/types.ts';
import { dinnerCard, EVENTS, POSTER_CARD, posterConfig, SAMPLE_INVITEE, withCard } from '../src/demo/fixtures.ts';

/**
 * v1.7 (spec revision #41): the Dinner config's optional card text. resolveConfig keeps it,
 * sanitised; sameConfig compares it, so a change of text reaches the scene (scene.setConfig); the
 * poster key (presetOf) never carries it, so the four shared Dinner posters stay four.
 */

const dinner = (card?: unknown) => resolveConfig({ category: 'dinner', dish: 'pasta', card });
const ok = (r: ReturnType<typeof resolveConfig>) => {
  if (!r.ok) throw new Error('rejected');
  return r.config;
};

describe('the Dinner card text (resolveConfig)', () => {
  it('keeps the three lines, trimmed, and drops everything else', () => {
    const c = ok(dinner({ eyebrow: '  You’re invited ', title: 'Supper club', name: 'Alex Rivera', colour: 'red', html: '<b>x</b>' }));
    expect(c).toEqual({ category: 'dinner', dish: 'pasta', card: { eyebrow: 'You’re invited', title: 'Supper club', name: 'Alex Rivera' } });
  });

  it('strips control and invisible format characters and folds runs of white space', () => {
    const c = ok(dinner({ title: 'Supper\u0000 club\u0007:\n\tautumn​ menu‮', name: '\u0085Alex  Rivera﻿' }));
    expect(c.category === 'dinner' && c.card).toEqual({ title: 'Supper club: autumn menu', name: 'Alex Rivera' });
  });

  it('clamps each line by whole characters (eyebrow 60, title 80, name 48)', () => {
    expect(CARD_LIMITS).toEqual({ eyebrow: 60, title: 80, name: 48 });
    const c = ok(dinner({ eyebrow: 'e'.repeat(70), title: 't'.repeat(100), name: '😀'.repeat(60) }));
    if (c.category !== 'dinner') throw new Error('category');
    expect(c.card!.eyebrow).toHaveLength(60);
    expect(c.card!.title).toHaveLength(80);
    // Astral characters are clamped whole, never split into a lone surrogate.
    expect([...c.card!.name!]).toHaveLength(48);
    expect(c.card!.name).toBe('😀'.repeat(48));
    expect(cardLine('ab   ', 1)).toBe('a');
    expect(cardLine('a  b', 2)).toBe('a');
  });

  it('drops lines that are not strings or end up empty, and a card with no line left', () => {
    expect(ok(dinner({ eyebrow: 42, title: '   ', name: '\u0000​' }))).toEqual({ category: 'dinner', dish: 'pasta' });
    expect(ok(dinner('Supper club'))).toEqual({ category: 'dinner', dish: 'pasta' });
    expect(ok(dinner(null))).toEqual({ category: 'dinner', dish: 'pasta' });
    expect(ok(dinner({ name: 'Alex' }))).toEqual({ category: 'dinner', dish: 'pasta', card: { name: 'Alex' } });
  });

  it('belongs to Dinner only: another category drops it', () => {
    expect(ok(resolveConfig({ category: 'birthday', cake: 'cocoa', card: { title: 'x' } }))).toEqual({ category: 'birthday', cake: 'cocoa' });
  });
});

describe('sameConfig and the poster key', () => {
  const a = ok(dinner({ eyebrow: 'You’re invited', title: 'Supper club' }));
  const b = ok(dinner({ eyebrow: 'You’re invited', title: 'Supper club', name: 'Alex' }));

  it('a change of the card\'s text is a change of config (it reaches scene.setConfig), and a print-only one', () => {
    expect(sameConfig(a, b)).toBe(false);
    expect(printOnlyChange(a, b)).toBe(true);
    expect(sameConfig(a, ok(dinner({ title: 'Supper club', eyebrow: ' You’re invited' })))).toBe(true);
    // An absent card and an empty one print the same.
    expect(sameConfig(ok(dinner()), ok(dinner({ title: '' })))).toBe(true);
    // A preset change is not print-only (the controller resets as before).
    const veg = ok(resolveConfig({ category: 'dinner', dish: 'vegetables', card: { title: 'Supper club' } }));
    expect(printOnlyChange(a, veg)).toBe(false);
    expect(printOnlyChange(a, ok(resolveConfig({ category: 'birthday', cake: 'vanilla' })))).toBe(false);
  });

  it('presetOf never carries the card: the shared Dinner posters stay keyed by `dish`', () => {
    expect(presetOf(a)).toBe('pasta');
    expect(presetOf(b)).toBe('pasta');
    expect(presetOf(ok(dinner({ title: 'Anything', name: 'Anyone' })))).toBe('pasta');
  });

  it('the other categories compare as before', () => {
    const p1: SceneConfig = { category: 'party', songId: 'a', label: 'coral' };
    expect(sameConfig(p1, { ...p1 })).toBe(true);
    expect(sameConfig(p1, { ...p1, songId: 'b' })).toBe(false);
    expect(sameConfig(p1, { ...p1, label: 'cobalt' })).toBe(false);
    expect(printOnlyChange(p1, { ...p1, songId: 'b' })).toBe(false);
  });
});

describe('the showcase\'s card (fixtures)', () => {
  it('prints the event\'s title for everyone and the sample invitee in guest mode only', () => {
    expect(dinnerCard('host')).toEqual({ eyebrow: 'You’re invited', title: EVENTS.dinner.title });
    expect(dinnerCard('guest')).toEqual({ eyebrow: 'You’re invited', title: EVENTS.dinner.title, name: SAMPLE_INVITEE });
    const base: SceneConfig = { category: 'dinner', dish: 'pasta' };
    expect(withCard(base, 'guest')).toEqual({ ...base, card: dinnerCard('guest') });
    // A config that brings its own card keeps it (unless the showcase replaces it on a mode change).
    const own: SceneConfig = { ...base, card: { title: 'Mine' } };
    expect(withCard(own, 'guest')).toBe(own);
    expect(withCard(own, 'host', true)).toEqual({ ...base, card: dinnerCard('host') });
    expect(withCard({ category: 'sports', ball: 'cream' }, 'guest')).toEqual({ category: 'sports', ball: 'cream' });
    // What the showcase passes survives resolveConfig unchanged.
    expect(ok(resolveConfig(withCard(base, 'guest')))).toEqual(withCard(base, 'guest'));
  });

  it('v1.7 polish: the shipped posters print the eyebrow only (no sample title or name), and the showcase keeps it', () => {
    // A poster is what a real guest sees before the scene is live, on Static, after a context
    // loss or a load failure: it must never name someone else's event or guest.
    expect(POSTER_CARD).toEqual({ eyebrow: 'You’re invited' });
    const base: SceneConfig = { category: 'dinner', dish: 'pasta' };
    const poster = posterConfig(withCard(base, 'guest'));
    expect(poster).toEqual({ ...base, card: { eyebrow: 'You’re invited' } });
    expect(poster.category === 'dinner' && (poster.card?.title ?? poster.card?.name)).toBeUndefined();
    // It brings its own card, so the showcase keeps it through every mode change (withCard).
    expect(withCard(poster, 'guest')).toBe(poster);
    expect(withCard(poster, 'host')).toBe(poster);
    expect(ok(resolveConfig(poster))).toEqual(poster);
    // Same preset: the four shared posters stay four, and the change is print-only.
    expect(presetOf(poster)).toBe(presetOf(withCard(base, 'guest')));
    expect(printOnlyChange(withCard(base, 'guest'), poster)).toBe(true);
    // Every other scene's config is untouched.
    const sports: SceneConfig = { category: 'sports', ball: 'cream' };
    expect(posterConfig(sports)).toBe(sports);
  });
});
