import { describe, it, expect } from 'vitest';
import { blankItemRecord, blankGoal, blankInterest, uid, expiresAt, receipt } from '../src/model.js';

describe('uid', () => {
  it('never repeats inside one run', () => {
    const seen = new Set(Array.from({ length: 5000 }, () => uid('t')));
    expect(seen.size).toBe(5000);
  });
  it('carries the prefix it was given', () => {
    expect(uid('n').startsWith('n-')).toBe(true);
  });
});

describe('blank records', () => {
  it('starts an item untouched and unpinned', () => {
    const r = blankItemRecord('x1');
    expect(r).toMatchObject({ id: 'x1', state: 'SEEN', status: 'active', pinned_desk: false, pinned_wall: false });
    expect(r.strings).toEqual([]);
    expect(r.snapshot).toBe(null);
  });
  it('gives each blank its own arrays, not a shared one', () => {
    const a = blankItemRecord('a'), b = blankItemRecord('b');
    a.strings.push('b');
    expect(b.strings).toEqual([]);
    const g1 = blankGoal(), g2 = blankGoal();
    g1.checkpoints.push({ text: 't', done: false, done_at: null });
    expect(g2.checkpoints).toEqual([]);
  });
  it('starts an inferred interest low, unpaused', () => {
    expect(blankInterest('python')).toMatchObject({ kind: 'inferred', weight: 0.2, paused: false, label: 'python' });
  });
});

describe('expiresAt', () => {
  const iso = d => new Date(d).toISOString();
  it('prefers an explicit expiry over everything else', () => {
    const it = { expiresAt: iso('2030-01-01'), deadline: iso('2031-01-01'), endDate: iso('2032-01-01') };
    expect(expiresAt(it)).toBe(new Date('2030-01-01').getTime());
  });
  it('falls back deadline, then endDate', () => {
    expect(expiresAt({ deadline: iso('2030-02-02'), endDate: iso('2030-03-03') }))
      .toBe(new Date('2030-02-02').getTime());
    expect(expiresAt({ endDate: iso('2030-03-03') })).toBe(new Date('2030-03-03').getTime());
  });
  it('gives a dateless row 30 days from the last sighting', () => {
    const seen = '2030-01-01T00:00:00.000Z';
    expect(expiresAt({ lastSeen: seen })).toBe(new Date(seen).getTime() + 30 * 864e5);
  });
  it('never expires a row with no dates at all', () => {
    expect(expiresAt({})).toBe(Infinity);
  });
});

describe('receipt', () => {
  it('reports changed separately from checked when the source says so', () => {
    const r = receipt({
      firstSeen: '2030-01-01T00:00:00.000Z',
      lastSeen: '2030-01-10T00:00:00.000Z',
      lastChanged: '2030-01-05T00:00:00.000Z'
    });
    expect(r.reported).toBe(new Date('2030-01-01').getTime());
    expect(r.checked).toBe(new Date('2030-01-10').getTime());
    expect(r.changed).toBe(new Date('2030-01-05').getTime());
  });
  it('treats changed as checked when the source never said', () => {
    const r = receipt({ lastSeen: '2030-01-10T00:00:00.000Z' });
    expect(r.changed).toBe(r.checked);
  });
});
