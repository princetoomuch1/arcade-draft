import { describe, it, expect, beforeEach } from 'vitest';
import * as S from '../src/store.js';

const week = (id, over = {}) => ({ ...S.blankWeek(id), ...over });

beforeEach(async () => { for (const r of await S.all('meta')) await S.del('meta', r.id); });

describe('weekKey', () => {
  it('gives the ISO week, with Monday starting it', () => {
    expect(S.weekKey(new Date(2026, 0, 5))).toBe('2026-W02');
    expect(S.weekKey(new Date(2026, 0, 11))).toBe('2026-W02');   // Sunday still week 2
    expect(S.weekKey(new Date(2026, 0, 12))).toBe('2026-W03');   // Monday starts week 3
  });
  it('is stable across a day, so a quest does not change week at lunchtime', () => {
    const a = S.weekKey(new Date(2026, 5, 10, 1));
    const b = S.weekKey(new Date(2026, 5, 10, 23));
    expect(a).toBe(b);
  });
});

describe('cadence', () => {
  it('counts a rest week as a week you were here, not as a gap', () => {
    const c = S.cadence([
      week('2026-W01', { done: true }),
      week('2026-W02', { rest: true }),
      week('2026-W03', { done: true })
    ], new Date(2026, 0, 19));
    expect(c.outcomesReached).toBe(2);
    expect(c.weeksRested).toBe(1);
    expect(c.note).toMatch(/Both are weeks you were here/);
  });

  it('reports no streak of any kind, because there is none to protect', () => {
    const c = S.cadence([week('2026-W01', { done: true })], new Date(2026, 0, 5));
    expect(Object.keys(c)).not.toContain('streak');
    expect(Object.keys(c)).not.toContain('currentStreak');
    expect(JSON.stringify(c).toLowerCase()).not.toContain('streak');
  });

  it('never punishes a missing week: weeks not on record simply are not counted', () => {
    const gappy = S.cadence([week('2026-W01', { done: true }), week('2026-W40', { done: true })],
      new Date(2026, 9, 5));
    expect(gappy.outcomesReached).toBe(2);
    expect(gappy.weeksOnRecord).toBe(2);
  });

  it('gives this week even when nothing has been recorded for it yet', () => {
    const c = S.cadence([], new Date(2026, 5, 10));
    expect(c.thisWeek.id).toBe(S.weekKey(new Date(2026, 5, 10)));
    expect(c.thisWeek.done).toBe(false);
    expect(c.thisWeek.rest).toBe(false);
  });
});

describe('weeks survive everything', () => {
  it('keeps earlier weeks when a later one is a rest week', async () => {
    await S.saveWeek(week('2026-W01', { quest: 'apply once', done: true }));
    const rest = await S.weekFor('2026-W02');
    rest.rest = true; await S.saveWeek(rest);
    const all = await S.allWeeks();
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ id: '2026-W01', done: true, quest: 'apply once' });
  });

  it('never erases a finished week when a later one is unfinished', async () => {
    await S.saveWeek(week('2026-W01', { done: true }));
    await S.saveWeek(week('2026-W02', { done: false }));
    expect((await S.allWeeks()).filter(w => w.done)).toHaveLength(1);
    expect(S.cadence(await S.allWeeks(), new Date(2026, 0, 12)).outcomesReached).toBe(1);
  });

  it('returns the weeks oldest first, so a history reads forwards', async () => {
    await S.saveWeek(week('2026-W05'));
    await S.saveWeek(week('2026-W02'));
    expect((await S.allWeeks()).map(w => w.id)).toEqual(['2026-W02', '2026-W05']);
  });
});

describe('progressSnapshot', () => {
  const data = {
    personal: [{ state: 'SAVED' }, { state: 'SEEN' }, { state: 'PLANNED' }],
    apps: [
      { stage: 'applied', dates: [{ stage: 'applied', at: 1 }] },
      { stage: 'interview', dates: [{ stage: 'applied', at: 1 }, { stage: 'interview', at: 2 }] },
      { stage: 'offer', dates: [{ stage: 'applied', at: 1 }, { stage: 'offer', at: 3 }] },
      { stage: 'planned', dates: [] }
    ],
    goals: [{ gold: true }, { gold: false }],
    notes: [{ id: 'n1' }, { id: 'n2' }],
    weeks: [week('2026-W01', { reflection: 'learned a lot' }), week('2026-W02')]
  };

  it('counts outcomes that happened, not rows that exist', () => {
    const o = Object.fromEntries(S.progressSnapshot(data).outcomes);
    expect(o['THINGS SAVED']).toBe(2);                 // SEEN is not a thing you did
    expect(o['APPLICATIONS SENT BY YOU']).toBe(3);     // the planned one has not been sent
    expect(o['CONVERSATIONS REACHED']).toBe(1);
    expect(o['OFFERS']).toBe(1);
    expect(o['GOALS FINISHED']).toBe(1);
    expect(o['NOTES WRITTEN']).toBe(2);
    expect(o['WEEKS REFLECTED ON']).toBe(1);
  });

  it('measures no time at all, and says so', () => {
    const snap = S.progressSnapshot(data);
    expect(snap.measuresTime).toBe(false);
    const labels = snap.outcomes.map(([k]) => String(k).toLowerCase()).join(' ');
    for (const word of ['time', 'minute', 'hour', 'session', 'visit', 'day']) {
      expect(labels).not.toContain(word);
    }
  });

  it('is all zeroes rather than undefined on a fresh install', () => {
    for (const [, v] of S.progressSnapshot().outcomes) expect(v).toBe(0);
  });
});

describe('the co-op challenge', () => {
  it('is absent until you opt in', async () => {
    expect(await S.challenge()).toBe(null);
  });
  it('counts only your own, and holds no one else', async () => {
    const c = await S.startChallenge('three applications', 3, 'Riya');
    expect(c).toMatchObject({ title: 'three applications', target: 3, count: 0, withWhom: 'Riya' });
    expect(JSON.stringify(c)).not.toMatch(/rank|score|leader|position/i);
  });
  it('goes up and down, and never below zero', async () => {
    await S.startChallenge('x', 3);
    await S.bumpChallenge(1); await S.bumpChallenge(1);
    expect((await S.challenge()).count).toBe(2);
    await S.bumpChallenge(-5);
    expect((await S.challenge()).count).toBe(0);
  });
  it('refuses a nonsense target rather than storing it', async () => {
    expect((await S.startChallenge('x', 0)).target).toBe(1);
    expect((await S.startChallenge('x', 'abc')).target).toBe(1);
  });
  it('ends cleanly, leaving nothing behind', async () => {
    await S.startChallenge('x', 2);
    expect(await S.endChallenge()).toBe(null);
    expect(await S.challenge()).toBe(null);
  });
});
