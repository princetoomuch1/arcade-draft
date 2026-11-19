import { describe, it, expect } from 'vitest';
import * as S from '../src/store.js';
import { FRAMES, GRID, STATES } from '../src/hamster.js';

/* The hamster's model. These are the engagement rules written as assertions: if a later change
   makes neglect cost something, one of these goes red. */

describe('the art', () => {
  it('every frame is a complete square grid', () => {
    for (const [name, rows] of Object.entries(FRAMES)) {
      expect(rows, name).toHaveLength(GRID);
      for (const r of rows) expect(r.length, `${name}: "${r}"`).toBe(GRID);
    }
  });
  it('every state names frames that exist', () => {
    for (const [name, def] of Object.entries(STATES)) {
      for (const f of def.frames) expect(FRAMES[f], `${name} -> ${f}`).toBeTruthy();
    }
  });
  it('has the seven states the desk can show', () => {
    expect(Object.keys(STATES).sort())
      .toEqual(['curious', 'eating', 'excited', 'happy', 'idle', 'running', 'sleeping']);
  });
  it('sleeping does not time out on its own', () => {
    expect(STATES.sleeping.ms).toBe(0);
  });
});

describe('mood', () => {
  it('goes up when you pet, feed or play', () => {
    const h = { ...S.blankHamster(), mood: 3 };
    expect(S.cheer(h).mood).toBe(4);
    expect(S.cheer(S.cheer(h)).mood).toBe(5);
  });
  it('stops at five, so there is nothing to grind', () => {
    let h = { ...S.blankHamster(), mood: 5 };
    for (let i = 0; i < 10; i++) h = S.cheer(h);
    expect(h.mood).toBe(S.MOOD_MAX);
  });
  it('is untouched by an absence shorter than three days', () => {
    const h = { ...S.blankHamster(), mood: 5, lastSeen: new Date(Date.now() - 2 * 864e5).toISOString() };
    expect(S.drift(h).mood).toBe(5);
  });
  it('drifts down to CONTENT and no further, however long you are away', () => {
    for (const days of [3, 9, 30, 365, 3650]) {
      const h = { ...S.blankHamster(), mood: 5, lastSeen: new Date(Date.now() - days * 864e5).toISOString() };
      expect(S.drift(h).mood, `${days} days away`).toBeGreaterThanOrEqual(S.MOOD_FLOOR);
    }
  });
  it('never reaches zero by neglect — there is no starving her', () => {
    const h = { ...S.blankHamster(), mood: 2, lastSeen: new Date(Date.now() - 1000 * 864e5).toISOString() };
    expect(S.drift(h).mood).toBe(2);
  });
  it('has no mechanism for punishing you', () => {
    /* `decay` exists and is deliberately not caught here: it is the interest-weight decay, which
       fades topics you stopped engaging with. It never touches the hamster. */
    const lowering = Object.keys(S).filter(k => /punish|scold|sadden|starve|hunger|neglect/i.test(k));
    expect(lowering).toEqual([]);
  });
  it('cannot be driven below zero even by a caller passing a negative', () => {
    expect(S.cheer({ ...S.blankHamster(), mood: 1 }, -5).mood).toBe(0);
  });
});

describe('levels', () => {
  it('come from milestones, never from time', () => {
    expect(S.levelFor([])).toBe(1);
    expect(S.levelFor(['first-save'])).toBe(2);
    expect(S.levelFor(['first-save', 'first-note'])).toBe(3);
  });
  it('stop at ten', () => {
    expect(S.levelFor(new Array(50).fill('x'))).toBe(S.LEVEL_MAX);
  });
  it('each one shows as something you can see', () => {
    expect(S.accessoriesFor(1)).toEqual([]);
    expect(S.accessoriesFor(3)).toContain('scarf');
    expect(S.accessoriesFor(10).length).toBeGreaterThan(5);
  });
  it('a milestone counts once', () => {
    let h = S.blankHamster();
    const a = S.hitMilestone(h, 'first-save');
    expect(a.gained).toBe(true);
    const b = S.hitMilestone(a.h, 'first-save');
    expect(b.gained).toBe(false);
    expect(b.h.level).toBe(2);
  });
  it('ignores a milestone nobody defined, rather than inventing a level', () => {
    const r = S.hitMilestone(S.blankHamster(), 'logged-in-today');
    expect(r.gained).toBe(false);
    expect(r.h.level).toBe(1);
  });
  it('hitting one also cheers her up', () => {
    const r = S.hitMilestone({ ...S.blankHamster(), mood: 3 }, 'first-note');
    expect(r.h.mood).toBe(4);
  });
});

describe('what the milestones actually are', () => {
  it('is empty for a fresh install', () => {
    expect(S.earnedMilestones({})).toEqual([]);
  });
  it('counts the first saved thing', () => {
    expect(S.earnedMilestones({ personal: [{ state: S.STATE.SAVED }] })).toContain('first-save');
  });
  it('does not count merely having seen something', () => {
    expect(S.earnedMilestones({ personal: [{ state: S.STATE.SEEN }] })).toEqual([]);
  });
  it('counts seven days present, in any order, not seven in a row', () => {
    const scattered = ['2026-01-01', '2026-03-02', '2026-04-09', '2026-06-11',
      '2026-08-20', '2026-09-30', '2026-11-19'];
    expect(S.earnedMilestones({ days: scattered })).toContain('seven-days');
    expect(S.earnedMilestones({ days: scattered.slice(0, 6) })).not.toContain('seven-days');
  });
  it('counts a ticked checkpoint, an application and a note', () => {
    const got = S.earnedMilestones({
      goals: [{ checkpoints: [{ done: true }] }],
      apps: [{ id: 'a' }],
      notes: [{ id: 'n' }]
    });
    expect(got).toContain('first-checkpoint');
    expect(got).toContain('first-application');
    expect(got).toContain('first-note');
  });
});

describe('coming back', () => {
  it('says nothing at all if you were here yesterday', () => {
    expect(S.greeting({ lastSeen: new Date(Date.now() - 864e5).toISOString() })).toBe(null);
  });
  it('greets you after three days, and says only that', () => {
    const g = S.greeting({ lastSeen: new Date(Date.now() - 5 * 864e5).toISOString() });
    expect(g).toBe('Welcome back.');
  });
  it('says the same thing after a year as after three days — no escalation', () => {
    const a = S.greeting({ lastSeen: new Date(Date.now() - 3 * 864e5).toISOString() });
    const b = S.greeting({ lastSeen: new Date(Date.now() - 400 * 864e5).toISOString() });
    expect(a).toBe(b);
  });
  it('never counts the days at you', () => {
    const g = S.greeting({ lastSeen: new Date(Date.now() - 42 * 864e5).toISOString() }) || '';
    expect(g).not.toMatch(/\d/);
  });
});
