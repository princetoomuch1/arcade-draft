import { describe, it, expect } from 'vitest';
import { paperFor, PAPER, autoStrings, shuffleLayout, DESK } from '../src/store.js';

const DAY = 864e5;
const rec = (id, snap = {}, over = {}) => ({
  id, state: 'SAVED', saved_at: Date.now(), strings: [], locked_strings: [],
  snapshot: { id, type: 'hackathon', title: id, ...snap }, ...over
});

describe('paperFor', () => {
  it('gives each kind of thing its own object', () => {
    expect(paperFor({ type: 'hackathon' }).kind).toBe('polaroid');
    expect(paperFor({ type: 'job' }).kind).toBe('card');
    expect(paperFor({ type: 'internship' }).kind).toBe('card');
    expect(paperFor({ type: 'news' }).kind).toBe('clipping');
    expect(paperFor({ type: 'scheme' }).kind).toBe('torn');
    expect(paperFor({ type: 'note' }).kind).toBe('sticky');
  });
  it('falls back to a sticky rather than throwing on something unknown', () => {
    expect(paperFor({ type: 'nonsense' })).toBe(PAPER.note);
    expect(paperFor(null)).toBe(PAPER.note);
  });
  it('gives every kind a size that fits on the desk', () => {
    for (const p of Object.values(PAPER)) {
      expect(p.w).toBeGreaterThan(0); expect(p.w).toBeLessThan(DESK.w);
      expect(p.h).toBeGreaterThan(0); expect(p.h).toBeLessThan(DESK.h);
    }
  });
});

describe('autoStrings', () => {
  it('ties two things at the same organisation and says so', () => {
    const r = autoStrings([rec('a', { org: 'Acme' }), rec('b', { org: 'Acme' })]);
    expect(r).toHaveLength(1);
    expect(r[0].reason).toContain('Acme');
  });

  it('ties on shared skills and names them', () => {
    const r = autoStrings([rec('a', { skills: ['python', 'iot'] }), rec('b', { skills: ['Python'] })]);
    expect(r[0].reason).toBe('both need python');
  });

  it('ties on a shared city, and on deadlines within three days', () => {
    const city = autoStrings([rec('a', { city: 'Rajkot' }), rec('b', { city: 'rajkot' })]);
    expect(city[0].reason).toBe('both in Rajkot');
    const now = Date.now();
    const near = autoStrings([
      rec('a', { deadline: new Date(now).toISOString() }),
      rec('b', { deadline: new Date(now + 2 * DAY).toISOString() })
    ]);
    expect(near[0].reason).toMatch(/within 3 days/);
  });

  it('says nothing about two unrelated things', () => {
    expect(autoStrings([rec('a', { city: 'Oslo' }), rec('b', { city: 'Lima' })])).toEqual([]);
  });

  it('never gives one card more than the cap', () => {
    const hub = rec('hub', { org: 'Acme' });
    const others = Array.from({ length: 8 }, (_, i) => rec('o' + i, { org: 'Acme' }));
    const r = autoStrings([hub, ...others], 3);
    const touching = r.filter(e => e.a === 'hub' || e.b === 'hub');
    expect(touching.length).toBeLessThanOrEqual(3);
  });

  it('lets your own strings use the budget first, so a guess never crowds them out', () => {
    const a = rec('a', { org: 'Acme' }, { locked_strings: ['x', 'y', 'z'] });
    const others = Array.from({ length: 4 }, (_, i) => rec('o' + i, { org: 'Acme' }));
    const r = autoStrings([a, ...others], 3);
    expect(r.filter(e => e.a === 'a' || e.b === 'a')).toHaveLength(0);
  });

  it('prefers the strongest reason when several could apply', () => {
    const r = autoStrings([
      rec('a', { org: 'Acme', city: 'Rajkot', skills: ['python'] }),
      rec('b', { org: 'Acme', city: 'Rajkot', skills: ['python'] })
    ]);
    expect(r[0].reason).toContain('same organisation');
  });

  it('copes with an empty desk and with one lonely card', () => {
    expect(autoStrings([])).toEqual([]);
    expect(autoStrings([rec('only')])).toEqual([]);
  });
});

describe('shuffleLayout', () => {
  const now = Date.now();
  const fixedRand = () => 0.5;

  it('places every card, once', () => {
    const recs = [rec('a'), rec('b'), rec('c')];
    const out = shuffleLayout(recs, { now, rand: fixedRand });
    expect(out).toHaveLength(3);
    expect(new Set(out.map(o => o.id)).size).toBe(3);
  });

  it('keeps every card inside the desk', () => {
    const recs = Array.from({ length: 12 }, (_, i) => rec('r' + i, { type: i % 2 ? 'job' : 'news' }));
    for (const o of shuffleLayout(recs, { now, rand: Math.random })) {
      expect(o.pos.x).toBeGreaterThanOrEqual(0);
      expect(o.pos.y).toBeGreaterThanOrEqual(0);
      expect(o.pos.x).toBeLessThanOrEqual(DESK.w);
      expect(o.pos.y).toBeLessThanOrEqual(DESK.h);
    }
  });

  it('sends what you have not touched in a week to the middle', () => {
    const stale = rec('stale', {}, { saved_at: now - 30 * DAY });
    const fresh = rec('fresh', {}, { saved_at: now - 1 * DAY });
    const out = shuffleLayout([stale, fresh, rec('f2', {}, { saved_at: now }), rec('f3', {}, { saved_at: now })],
      { now, rand: fixedRand });
    expect(out.find(o => o.id === 'stale').zone).toBe('centre');
  });

  it('keeps the three most recent saves near the monitor', () => {
    const recs = [
      rec('old', {}, { saved_at: now - 20 * DAY }),
      rec('n1', {}, { saved_at: now - 1 }),
      rec('n2', {}, { saved_at: now - 2 }),
      rec('n3', {}, { saved_at: now - 3 })
    ];
    const out = shuffleLayout(recs, { now, rand: fixedRand });
    for (const id of ['n1', 'n2', 'n3']) expect(out.find(o => o.id === id).zone).toBe('monitor');
  });

  it('surfaces exactly one wildcard, and only from the forgotten ones', () => {
    const recs = [
      rec('s1', {}, { saved_at: now - 30 * DAY }),
      rec('s2', {}, { saved_at: now - 40 * DAY }),
      rec('n1', {}, { saved_at: now }), rec('n2', {}, { saved_at: now }), rec('n3', {}, { saved_at: now })
    ];
    const out = shuffleLayout(recs, { now, rand: fixedRand });
    const wild = out.filter(o => o.wildcard);
    expect(wild).toHaveLength(1);
    expect(['s1', 's2']).toContain(wild[0].id);
  });

  it('surfaces no wildcard when nothing has been forgotten', () => {
    const recs = [rec('n1', {}, { saved_at: now }), rec('n2', {}, { saved_at: now })];
    expect(shuffleLayout(recs, { now, rand: fixedRand }).some(o => o.wildcard)).toBe(false);
  });

  it('does nothing dramatic with an empty desk', () => {
    expect(shuffleLayout([], { now, rand: fixedRand })).toEqual([]);
  });
});
