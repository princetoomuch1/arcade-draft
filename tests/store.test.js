import { describe, it, expect, beforeEach } from 'vitest';
import * as S from '../src/store.js';

const iso = d => new Date(d).toISOString();
const DAY = 864e5;

async function wipe() {
  for (const s of ['personal', 'weights', 'plans', 'meta', 'goals', 'apps', 'notes']) {
    for (const r of await S.all(s)) await S.del(s, r.id);
  }
}
const feedItem = (over = {}) => ({
  id: 'i1', type: 'hackathon', title: 'A Hack', url: 'https://example.test/1',
  source: { name: 'Seed', host: 'example.test' },
  firstSeen: iso(Date.now() - DAY), lastSeen: iso(Date.now()),
  skills: ['python'], city: 'Rajkot', state: 'Gujarat', country: 'India', ...over
});

beforeEach(wipe);

describe('migration from version 1', () => {
  it('renames the camelCase fields and derives the new ones', () => {
    const r = S.migratePersonal({
      id: 'old1', state: 'SAVED', savedAt: 111, plannedFor: 222, drawerAt: null,
      deskPos: { x: 4, y: 8 }, wallZone: 'GOALS', strings: ['old2'],
      snapshot: { id: 'old1', title: 'T', deadline: iso('2030-01-01'), lastSeen: iso('2029-12-01') },
      notes: ['n1']
    });
    expect(r).toMatchObject({
      id: 'old1', state: 'SAVED', saved_at: 111, planned_for: 222, drawer_at: null,
      wall_zone: 'GOALS', status: 'saved', pinned_desk: true, pinned_wall: false
    });
    expect(r.desk_position).toEqual({ x: 4, y: 8, rot: 0 });
    expect(r.strings).toEqual(['old2']);
    expect(r.expires_at).toBe(new Date('2030-01-01').getTime());
  });

  it('marks a drawered record as archived', () => {
    expect(S.migratePersonal({ id: 'd', state: 'DRAWER', drawerAt: 5 }))
      .toMatchObject({ status: 'archived', drawer_at: 5, pinned_desk: false });
  });

  it('survives a record that is missing almost everything', () => {
    const r = S.migratePersonal({ id: 'bare' });
    expect(r.state).toBe('SEEN');
    expect(r.strings).toEqual([]);
    expect(r.desk_position).toBe(null);
  });

  it('turns CHOSE into explicit and GUESSED into inferred', () => {
    expect(S.migrateWeight({ id: 'python', w: 1, kind: 'CHOSE', last: 7 }))
      .toMatchObject({ kind: 'explicit', weight: 1, paused: false, recency: 7, label: 'python' });
    expect(S.migrateWeight({ id: 'ml', w: 0.4, kind: 'GUESSED', muted: true }))
      .toMatchObject({ kind: 'inferred', weight: 0.4, paused: true });
  });
});

describe('item lifecycle', () => {
  it('snapshots the public row when you save, so it survives the source', async () => {
    const it = feedItem();
    await S.mark(it, S.STATE.SAVED);
    const p = await S.personalFor('i1');
    expect(p.state).toBe('SAVED');
    expect(p.pinned_desk).toBe(true);
    expect(p.snapshot.title).toBe('A Hack');
    expect(typeof p.saved_at).toBe('number');
  });

  it('does not move saved_at when you save twice', async () => {
    await S.mark(feedItem(), S.STATE.SAVED);
    const first = (await S.personalFor('i1')).saved_at;
    await S.mark(feedItem(), S.STATE.SAVED);
    expect((await S.personalFor('i1')).saved_at).toBe(first);
  });

  it('empties the drawer only after 14 days', async () => {
    await S.mark(feedItem({ id: 'fresh' }), S.STATE.SAVED);
    await S.mark(feedItem({ id: 'stale' }), S.STATE.SAVED);
    const fresh = await S.personalFor('fresh'); fresh.state = 'DRAWER'; fresh.drawer_at = Date.now() - 3 * DAY;
    const stale = await S.personalFor('stale'); stale.state = 'DRAWER'; stale.drawer_at = Date.now() - 20 * DAY;
    await S.put('personal', fresh); await S.put('personal', stale);

    expect(await S.sweepDrawer()).toBe(1);
    expect((await S.all('personal')).map(p => p.id)).toEqual(['fresh']);
    expect(S.drawerDaysLeft(await S.personalFor('fresh'))).toBe(11);
  });

  it('archives a saved item whose deadline has passed instead of deleting it', async () => {
    await S.mark(feedItem({ id: 'past', deadline: iso(Date.now() - DAY) }), S.STATE.SAVED);
    expect(await S.archiveExpired()).toBe(1);
    const p = await S.personalFor('past');
    expect(p.state).toBe('DRAWER');
    expect(p.status).toBe('archived');
    expect(p.snapshot.title).toBe('A Hack');     // still restorable, nothing lost
  });

  it('leaves a saved item with a future deadline alone', async () => {
    await S.mark(feedItem({ id: 'later', deadline: iso(Date.now() + 10 * DAY) }), S.STATE.SAVED);
    expect(await S.archiveExpired()).toBe(0);
    expect((await S.personalFor('later')).state).toBe('SAVED');
  });
});

describe('interest weights', () => {
  it('creates an inferred interest on first save and raises it', async () => {
    await S.bump(['Python'], 'save');
    const w = await S.get('weights', 'python');
    expect(w).toMatchObject({ kind: 'inferred', label: 'python' });
    expect(w.weight).toBeCloseTo(0.35, 5);
  });

  it('never nudges an interest you typed yourself', async () => {
    await S.chooseInterest('Rust');
    await S.bump(['rust'], 'less');
    expect((await S.get('weights', 'rust'))).toMatchObject({ kind: 'explicit', weight: 1 });
  });

  it('pauses and resumes a topic without deleting it', async () => {
    await S.bump(['go'], 'save');
    await S.muteTopic('go');
    expect(await S.get('weights', 'go')).toMatchObject({ paused: true, weight: 0 });
    await S.bump(['go'], 'save');
    expect((await S.get('weights', 'go')).weight).toBe(0);   // paused means paused
    await S.resumeTopic('go');
    expect((await S.get('weights', 'go')).paused).toBe(false);
  });

  it('decays inferred weights about 3% a day and leaves explicit ones alone', async () => {
    await S.bump(['java'], 'save');
    await S.chooseInterest('sql');
    const w = await S.get('weights', 'java'); w.recency = Date.now() - 10 * DAY; await S.put('weights', w);
    await S.decay();
    expect((await S.get('weights', 'java')).weight).toBeCloseTo(0.35 * Math.pow(0.97, 10), 5);
    expect((await S.get('weights', 'sql')).weight).toBe(1);
  });

  it('counts a skip harder once it is the third in a week', async () => {
    await S.bump(['css'], 'save');
    await S.skipped(['css']); await S.skipped(['css']);
    const after2 = (await S.get('weights', 'css')).weight;
    expect(after2).toBeCloseTo(0.35 - 0.02, 5);
    await S.skipped(['css']);
    expect((await S.get('weights', 'css')).weight).toBeCloseTo(after2 - 0.03, 5);
  });
});

describe('score', () => {
  const weights = { python: { weight: 1, kind: 'explicit', paused: false } };
  it('rewards a match in your own city over the same thing worldwide', () => {
    const here = S.score(feedItem(), weights);
    const away = S.score(feedItem({ city: 'Oslo', state: 'Oslo', country: 'Norway' }), weights);
    expect(here.total).toBeGreaterThan(away.total);
    expect(here.place).toBe('city');
    expect(away.place).toBe('world');
  });
  it('ignores a paused interest', () => {
    const muted = S.score(feedItem(), { python: { weight: 1, kind: 'inferred', paused: true } });
    expect(muted.parts.match).toBe(0);
  });
  it('names the two reasons it actually scored on', () => {
    const s = S.score(feedItem(), weights);
    expect(s.why).toHaveLength(2);
    for (const k of s.why) expect(Object.keys(s.parts)).toContain(k);
  });
  it('raises urgency as the deadline nears', () => {
    const far = S.score(feedItem({ deadline: iso(Date.now() + 25 * DAY) }), weights);
    const near = S.score(feedItem({ deadline: iso(Date.now() + 2 * DAY) }), weights);
    expect(near.parts.urgency).toBeGreaterThan(far.parts.urgency);
  });
});

describe('assembleDrop', () => {
  const many = n => Array.from({ length: n }, (_, i) => feedItem({
    id: 'm' + i, title: 'Item ' + i, type: i % 2 ? 'job' : 'hackathon',
    sourceCount: i, source: { name: 'src' + (i % 4), host: 'h' }
  }));

  it('returns every card exactly once, never cloning or dropping', () => {
    const out = S.assembleDrop(many(20), {}, { n: 12 });
    const ids = out.map(e => e.item.id);
    expect(ids).toHaveLength(new Set(ids).size);
    expect(out.length).toBeLessThanOrEqual(12);
  });

  it('collapses a duplicate cluster to one card', () => {
    const dups = [
      feedItem({ id: 'd1', cluster: 'c' }), feedItem({ id: 'd2', cluster: 'c' }),
      feedItem({ id: 'd3', cluster: 'c' }), feedItem({ id: 'solo' })
    ];
    const out = S.assembleDrop(dups, {}, { n: 12 });
    expect(out.filter(e => e.item.cluster === 'c')).toHaveLength(1);
    expect(out).toHaveLength(2);
  });

  it('keeps at most 2 cards from one source in the first six', () => {
    const items = Array.from({ length: 12 }, (_, i) => feedItem({
      id: 's' + i, source: { name: i < 8 ? 'flood' : 'other', host: 'h' }
    }));
    const out = S.assembleDrop(items, {}, { n: 12 });
    const first6 = out.slice(0, 6).filter(e => e.item.source.name === 'flood');
    expect(first6.length).toBeLessThanOrEqual(2);
  });

  it('asks for no wildcards when you want tighter matches', () => {
    const weights = { python: { weight: 0.2, kind: 'inferred', paused: false } };
    expect(S.assembleDrop(many(20), weights, { n: 12, align: 'MORE' }).filter(e => e.tag === 'WILD')).toHaveLength(0);
  });

  it('does not fall over on an empty feed', () => {
    expect(S.assembleDrop([], {}, { n: 12 })).toEqual([]);
  });
});

describe('dropExpired', () => {
  it('hides a dead row you never touched but keeps the one you saved', () => {
    const dead = feedItem({ id: 'dead', deadline: iso(Date.now() - DAY) });
    const mine = feedItem({ id: 'mine', deadline: iso(Date.now() - DAY) });
    const kept = S.dropExpired([dead, mine], [{ id: 'mine', state: 'SAVED' }]);
    expect(kept.map(i => i.id)).toEqual(['mine']);
  });
});

describe('settings', () => {
  it('fills in defaults and remembers what you change', async () => {
    expect((await S.settings()).density).toBe('CHUNKY');
    await S.setSetting('density', 'FINE');
    const s = await S.settings();
    expect(s.density).toBe('FINE');
    expect(s.volume).toBe(0.7);           // untouched defaults survive
  });
});

describe('active days', () => {
  it('lights one bulb per day and never takes one away', async () => {
    const d1 = await S.markActiveDay(new Date('2030-03-01T10:00:00Z'));
    const again = await S.markActiveDay(new Date('2030-03-01T22:00:00Z'));
    const d2 = await S.markActiveDay(new Date('2030-03-02T09:00:00Z'));
    expect(d1).toMatchObject({ fresh: true, count: 1 });
    expect(again).toMatchObject({ fresh: false, count: 1 });
    expect(d2).toMatchObject({ fresh: true, count: 2 });
    expect(await S.activeDays()).toEqual(['2030-03-01', '2030-03-02']);
  });
});
