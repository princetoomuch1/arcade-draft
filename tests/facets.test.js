import { describe, it, expect } from 'vitest';
import { applyFacets, facetValue, commitmentBand } from '../src/store.js';

const hack = (over = {}) => ({ id: 'h', type: 'hackathon', title: 'H', url: 'u', mode: 'in_person', ...over });

describe('facetValue', () => {
  it('reads mode as the two words a person would use', () => {
    expect(facetValue(hack({ mode: 'online' }), 'mode')).toBe('ONLINE');
    expect(facetValue(hack({ mode: 'in_person' }), 'mode')).toBe('IN PERSON');
  });

  it('keeps "not stated" distinct from "no"', () => {
    expect(facetValue(hack({ beginnerFriendly: false }), 'beginner')).toBe('NOT FRIENDLY');
    expect(facetValue(hack({ beginnerFriendly: true }), 'beginner')).toBe('FRIENDLY');
    expect(facetValue(hack(), 'beginner')).toBe(null);            // the listing never said
  });

  it('returns null, not a guess, for a facet the source omitted', () => {
    expect(facetValue(hack(), 'commitment')).toBe(null);
    expect(facetValue(hack(), 'focus')).toBe(null);
    expect(facetValue(hack({ mode: undefined }), 'mode')).toBe(null);
  });

  it('shrugs at a facet name it does not know', () => {
    expect(facetValue(hack(), 'nonsense')).toBe(null);
  });
});

describe('commitmentBand', () => {
  it('bands by the hours the organiser stated', () => {
    expect(commitmentBand(8)).toBe('UNDER A DAY');
    expect(commitmentBand(23)).toBe('UNDER A DAY');
    expect(commitmentBand(24)).toBe('1-3 DAYS');
    expect(commitmentBand(72)).toBe('1-3 DAYS');
    expect(commitmentBand(73)).toBe('LONGER');
  });
  it('is null when no length was stated', () => {
    expect(commitmentBand(null)).toBe(null);
    expect(commitmentBand(undefined)).toBe(null);
  });
});

describe('applyFacets', () => {
  const items = [
    hack({ id: 'a', mode: 'online', beginnerFriendly: true, commitmentHours: 8, focus: 'game dev' }),
    hack({ id: 'b', mode: 'in_person', beginnerFriendly: false, commitmentHours: 48, focus: 'fintech' }),
    hack({ id: 'c', mode: 'in_person', commitmentHours: 168, focus: 'open source' }),   // beginner unstated
    hack({ id: 'd', mode: 'online' })                                                    // almost nothing stated
  ];

  it('returns the list untouched when no facet is chosen', () => {
    expect(applyFacets(items, {})).toBe(items);
    expect(applyFacets(items, { mode: [], beginner: [] })).toBe(items);
  });

  it('narrows on one facet', () => {
    expect(applyFacets(items, { mode: ['ONLINE'] }).map(i => i.id)).toEqual(['a', 'd']);
  });

  it('treats several options in one facet as "any of these"', () => {
    expect(applyFacets(items, { commitment: ['UNDER A DAY', 'LONGER'] }, false).map(i => i.id)).toEqual(['a', 'c']);
  });

  it('requires every chosen facet to match, not just one', () => {
    expect(applyFacets(items, { mode: ['IN PERSON'], focus: ['FINTECH'] }).map(i => i.id)).toEqual(['b']);
  });

  it('keeps rows whose facet was never stated by default, and says nothing false about them', () => {
    // c never states beginner, so asking for FRIENDLY keeps it rather than claiming it is not
    expect(applyFacets(items, { beginner: ['FRIENDLY'] }).map(i => i.id)).toEqual(['a', 'c', 'd']);
  });

  it('drops the unstated rows when the user asks for that explicitly', () => {
    expect(applyFacets(items, { beginner: ['FRIENDLY'] }, false).map(i => i.id)).toEqual(['a']);
  });

  it('can end up with nothing, and says so by returning an empty list', () => {
    expect(applyFacets(items, { focus: ['NOTHING LIKE THIS'] }, false)).toEqual([]);
  });

  it('ignores a facet whose value is not an array', () => {
    expect(applyFacets(items, { mode: 'ONLINE' })).toBe(items);
  });
});
