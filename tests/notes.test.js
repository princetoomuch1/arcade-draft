import { describe, it, expect } from 'vitest';
import * as S from '../src/store.js';

const note = (over = {}) => S.blankNote({ title: 'T', body_md: '', ...over });
const DAY = 864e5;

describe('migrating the stage-5 note shape', () => {
  it('moves body to body_md and fills in what the model expects', () => {
    const n = S.migrateNote({ id: 'n1', title: 'Old', body: 'text [[Other]]', updated: 42 });
    expect(n).toMatchObject({ id: 'n1', title: 'Old', body_md: 'text [[Other]]', created: 42, updated: 42 });
    expect(n.tags).toEqual([]);
    expect(n.attachments).toEqual([]);
    expect(n.synthesis).toBe(null);
  });
  it('leaves an already-current note alone', () => {
    const cur = note({ id: 'c' });
    expect(S.migrateNote(cur)).toBe(cur);
  });
});

describe('linksIn', () => {
  it('finds every [[link]] and trims it', () => {
    expect(S.linksIn('see [[ Alpha ]] and [[Beta]]')).toEqual(['Alpha', 'Beta']);
  });
  it('finds none in empty or plain text', () => {
    expect(S.linksIn('')).toEqual([]);
    expect(S.linksIn(null)).toEqual([]);
    expect(S.linksIn('[not a link]')).toEqual([]);
  });
});

describe('backlinksTo', () => {
  it('finds the notes that name this one, case-insensitively', () => {
    const a = note({ id: 'a', title: 'Rust' });
    const b = note({ id: 'b', title: 'B', body_md: 'learning [[rust]] slowly' });
    const c = note({ id: 'c', title: 'C', body_md: 'nothing here' });
    expect(S.backlinksTo(a, [a, b, c]).map(n => n.id)).toEqual(['b']);
  });
  it('never counts a note as its own backlink', () => {
    const a = note({ id: 'a', title: 'Self', body_md: 'see [[Self]]' });
    expect(S.backlinksTo(a, [a])).toEqual([]);
  });
});

describe('relatedNotes', () => {
  it('suggests on a shared tag and says which tag', () => {
    const a = note({ id: 'a', title: 'A', tags: ['rust', 'wasm'] });
    const b = note({ id: 'b', title: 'B', tags: ['rust'] });
    const [s] = S.relatedNotes(a, [a, b]);
    expect(s.note.id).toBe('b');
    expect(s.reason).toContain('rust');
  });

  it('suggests on a wiki link and explains the direction', () => {
    const a = note({ id: 'a', title: 'A', body_md: 'see [[B]]' });
    const b = note({ id: 'b', title: 'B' });
    expect(S.relatedNotes(a, [a, b])[0].reason).toBe('you wrote its name in this note');
    expect(S.relatedNotes(b, [a, b])[0].reason).toBe('it names this note');
  });

  it('suggests on shared words only when there are at least two, and names them', () => {
    const a = note({ id: 'a', title: 'kubernetes rollout', body_md: 'canary deploys' });
    const weak = note({ id: 'w', title: 'kubernetes', body_md: 'unrelated' });
    const strong = note({ id: 's', title: 'canary kubernetes', body_md: 'more' });
    const ids = S.relatedNotes(a, [a, weak, strong]).map(r => r.note.id);
    expect(ids).toContain('s');
    expect(ids).not.toContain('w');
    expect(S.relatedNotes(a, [a, strong])[0].reason).toMatch(/both mention/);
  });

  it('never suggests a note that is already linked, and never itself', () => {
    const b = note({ id: 'b', title: 'B', tags: ['x'] });
    const a = note({ id: 'a', title: 'A', tags: ['x'], related_ids: ['b'] });
    expect(S.relatedNotes(a, [a, b])).toEqual([]);
  });

  it('ranks a shared tag above a shared word', () => {
    const a = note({ id: 'a', title: 'rust compiler', tags: ['systems'] });
    const tagged = note({ id: 't', title: 'unrelated title', tags: ['systems'] });
    const worded = note({ id: 'w', title: 'rust compiler notes' });
    expect(S.relatedNotes(a, [a, tagged, worded])[0].note.id).toBe('t');
  });

  it('returns nothing rather than a weak guess', () => {
    const a = note({ id: 'a', title: 'Alpha' });
    const b = note({ id: 'b', title: 'Zeta' });
    expect(S.relatedNotes(a, [a, b])).toEqual([]);
  });
});

describe('inQuietHours', () => {
  const at = h => new Date(2026, 0, 1, h, 0, 0);
  it('is false when no quiet hours are set', () => {
    expect(S.inQuietHours(at(3), null)).toBe(false);
  });
  it('handles a daytime window', () => {
    expect(S.inQuietHours(at(10), { from: 9, to: 17 })).toBe(true);
    expect(S.inQuietHours(at(18), { from: 9, to: 17 })).toBe(false);
  });
  it('handles a window that wraps midnight', () => {
    const q = { from: 22, to: 7 };
    expect(S.inQuietHours(at(23), q)).toBe(true);
    expect(S.inQuietHours(at(3), q)).toBe(true);
    expect(S.inQuietHours(at(7), q)).toBe(false);
    expect(S.inQuietHours(at(12), q)).toBe(false);
  });
});

describe('dueReminders', () => {
  const now = new Date(2026, 5, 10, 12, 0, 0).getTime();
  const plan = (over = {}) => ({
    id: 'p', item_id: 'i', official_deadline: now + 2 * DAY, start_by: null,
    checkpoints: [], reminders: [{ lead_time: 3 * DAY, channels: ['in-app'], snoozed_until: null }], ...over
  });
  const on = { notifications: true, quietHours: null };

  it('fires once the lead time is reached', () => {
    expect(S.dueReminders([plan()], on, now)).toHaveLength(1);
  });
  it('does not fire before the lead time', () => {
    expect(S.dueReminders([plan({ official_deadline: now + 10 * DAY })], on, now)).toHaveLength(0);
  });
  it('is silenced entirely by the OFF switch', () => {
    expect(S.dueReminders([plan()], { notifications: false, quietHours: null }, now)).toEqual([]);
  });
  it('is silenced during quiet hours', () => {
    expect(S.dueReminders([plan()], { notifications: true, quietHours: { from: 9, to: 17 } }, now)).toEqual([]);
  });
  it('respects a snooze, then fires again once it lapses', () => {
    const snoozed = plan({ reminders: [{ lead_time: 3 * DAY, channels: [], snoozed_until: now + DAY }] });
    expect(S.dueReminders([snoozed], on, now)).toHaveLength(0);
    expect(S.dueReminders([snoozed], on, now + 2 * DAY)).toHaveLength(1);
  });
  it('prefers your start-by date over the official one when you set one', () => {
    const p = plan({ official_deadline: now + 30 * DAY, start_by: now + DAY });
    expect(S.dueReminders([p], on, now)).toHaveLength(1);
  });
  it('ignores a plan with no date at all', () => {
    expect(S.dueReminders([plan({ official_deadline: null })], on, now)).toEqual([]);
  });
  it('stops firing well after the date has passed', () => {
    expect(S.dueReminders([plan()], on, now + 10 * DAY)).toEqual([]);
  });
});

describe('recurrence', () => {
  const run = (year, month, title = 'Rajkot Civic Build') =>
    ({ id: `${title}-${year}`, title: `${title} ${year}`, startDate: new Date(year, month, 5).toISOString() });

  it('says nothing from a single sighting', () => {
    const items = [run(2026, 2)];
    expect(S.recurrence(items[0], items)).toBe(null);
  });

  it('reports the month once two consecutive years line up', () => {
    const items = [run(2025, 2), run(2026, 2)];
    const r = S.recurrence(items[1], items);
    expect(r).toMatchObject({ month: 'March', count: 2 });
    expect(r.years).toEqual([2025, 2026]);
  });

  it('tolerates a month of drift but not a season of it', () => {
    expect(S.recurrence(...(() => { const i = [run(2025, 2), run(2026, 3)]; return [i[1], i]; })())).toMatchObject({ count: 2 });
    const far = [run(2025, 2), run(2026, 8)];
    expect(S.recurrence(far[1], far)).toBe(null);
  });

  it('says nothing when a year is missing from the run', () => {
    const items = [run(2024, 2), run(2026, 2)];
    expect(S.recurrence(items[1], items)).toBe(null);
  });

  it('matches on the title with the year stripped, not on the raw string', () => {
    const items = [
      { id: 'a', title: 'HackRajkot 2025', startDate: new Date(2025, 2, 5).toISOString() },
      { id: 'b', title: 'HackRajkot 2026', startDate: new Date(2026, 2, 5).toISOString() }
    ];
    expect(S.recurrence(items[1], items)).toMatchObject({ count: 2, month: 'March' });
  });

  it('does not lump two different events together', () => {
    const items = [run(2025, 2, 'Alpha Jam'), run(2026, 2, 'Beta Jam')];
    expect(S.recurrence(items[1], items)).toBe(null);
  });
});
