import { describe, it, expect, beforeEach } from 'vitest';
import * as S from '../src/store.js';

const item = (over = {}) => ({
  id: 'x', type: 'job', title: 'T', url: 'u',
  source: { name: 'Unstop', host: 'unstop.test' },
  city: 'Rajkot', state: 'Gujarat', country: 'India', ...over
});

beforeEach(async () => { for (const r of await S.all('meta')) await S.del('meta', r.id); });

describe('applyMutes', () => {
  it('returns the same list untouched when nothing is muted', () => {
    const items = [item(), item({ id: 'y' })];
    expect(S.applyMutes(items, {})).toBe(items);
    expect(S.applyMutes(items, { mutedSources: [], mutedPlaces: [] })).toBe(items);
  });

  it('drops a muted source and keeps the rest', () => {
    const items = [item({ id: 'a' }), item({ id: 'b', source: { name: 'Other', host: 'o' } })];
    expect(S.applyMutes(items, { mutedSources: ['unstop'] }).map(i => i.id)).toEqual(['b']);
  });

  it('matches a source case-insensitively, however the scraper cased it', () => {
    expect(S.applyMutes([item({ source: { name: 'UNSTOP', host: 'u' } })], { mutedSources: ['unstop'] })).toHaveLength(0);
  });

  it('drops a row on a muted city, state or country', () => {
    expect(S.applyMutes([item()], { mutedPlaces: ['rajkot'] })).toHaveLength(0);
    expect(S.applyMutes([item()], { mutedPlaces: ['gujarat'] })).toHaveLength(0);
    expect(S.applyMutes([item()], { mutedPlaces: ['india'] })).toHaveLength(0);
    expect(S.applyMutes([item()], { mutedPlaces: ['norway'] })).toHaveLength(1);
  });

  it('survives a row with no source and no place', () => {
    const bare = { id: 'bare', type: 'news', title: 'T', url: 'u' };
    expect(S.applyMutes([bare], { mutedSources: ['unstop'], mutedPlaces: ['rajkot'] })).toHaveLength(1);
  });

  it('treats a plain string source the same as a named one', () => {
    expect(S.applyMutes([item({ source: 'Unstop' })], { mutedSources: ['unstop'] })).toHaveLength(0);
  });
});

describe('muteList and unmuteList', () => {
  it('stores a mute, lowercased, and never twice', async () => {
    await S.muteList('source', 'Unstop');
    await S.muteList('source', 'unstop');
    expect((await S.settings()).mutedSources).toEqual(['unstop']);
  });

  it('keeps sources and places in separate lists', async () => {
    await S.muteList('source', 'Unstop');
    await S.muteList('place', 'Oslo');
    const s = await S.settings();
    expect(s.mutedSources).toEqual(['unstop']);
    expect(s.mutedPlaces).toEqual(['oslo']);
  });

  it('unmutes, so the choice is always reversible', async () => {
    await S.muteList('place', 'Oslo');
    expect(await S.unmuteList('place', 'Oslo')).toEqual([]);
    expect((await S.settings()).mutedPlaces).toEqual([]);
  });

  it('ignores an unknown kind and an empty value rather than writing junk', async () => {
    expect(await S.muteList('nonsense', 'x')).toEqual([]);
    expect(await S.muteList('source', '')).toEqual([]);
    expect((await S.settings()).mutedSources).toEqual([]);
  });
});
