import { describe, it, expect, beforeEach } from 'vitest';
import * as S from '../src/store.js';

const DAY = 864e5;
/** @returns {Partial<import('../src/model.js').FeedItem>} */
const job = (over = {}) => ({
  id: 'j1', type: /** @type {const} */ ('job'),
  title: 'Backend Intern', org: 'Acme', url: 'https://acme.test/1', ...over
});

beforeEach(async () => { for (const r of await S.all('apps')) await S.del('apps', r.id); });

describe('migrating the two older application shapes', () => {
  it('converts the shape the Jobs page used to write, and re-keys it off the item id', () => {
    const a = S.migrateApplication({
      id: 'seed-003', item: { title: 'Backend Intern', org: 'Acme', url: 'https://acme.test/1' },
      stage: 'APPLIED', label: 'EXTERNAL', appliedAt: 1700000000000, events: []
    });
    expect(a).toMatchObject({
      id: 'a-seed-003', item_id: 'seed-003', title: 'Backend Intern', org: 'Acme',
      stage: 'applied', trust: 'external'
    });
    expect(a.dates).toEqual([{ stage: 'applied', at: 1700000000000 }]);
  });

  it('defaults an unknown label to manual rather than claiming more than it knows', () => {
    expect(S.migrateApplication({ id: 'x', item: { title: 'T' }, label: 'SOMETHING', appliedAt: 1 }).trust).toBe('manual');
  });

  it('converts the shape the Applications page used to write', () => {
    const a = S.migrateApplication({
      id: 'a-old', itemId: 'j9', title: 'Role', org: 'Org', url: null,
      status: 'INTERVIEW', appliedOn: '2026-03-04', note: 'spoke to Priya', updated: 5
    });
    expect(a).toMatchObject({ id: 'a-old', item_id: 'j9', stage: 'interview', trust: 'manual', notes: 'spoke to Priya' });
    expect(a.dates).toEqual([{ stage: 'applied', at: new Date('2026-03-04T12:00:00').getTime() }]);
  });

  it('turns the old GHOSTED status into applied and says so in the notes, losing nothing', () => {
    const a = S.migrateApplication({ id: 'g', title: 'R', status: 'GHOSTED', appliedOn: '2026-01-01' });
    expect(a.stage).toBe('applied');
    expect(a.notes).toMatch(/GHOSTED/);
  });

  it('leaves an already-current record alone', () => {
    const cur = { id: 'c', stage: 'offer', dates: [], next_action: '', trust: 'manual' };
    expect(S.migrateApplication(cur)).toBe(cur);
  });
});

describe('logApplication', () => {
  it('never lets anything claim a platform confirmed it', async () => {
    const a = await S.logApplication(job(), { trust: 'platform' });
    expect(a.trust).toBe('manual');
    // deliberately junk: callers are not trusted to pick a trust level
    const b = await S.logApplication(job(), /** @type {any} */ ({ trust: 'nonsense' }));
    expect(b.trust).toBe('manual');
  });

  it('records external as external, because you did apply, just not from here', async () => {
    const a = await S.logApplication(job(), { trust: 'external', stage: 'applied' });
    expect(a.trust).toBe('external');
    expect(a.dates).toHaveLength(1);
  });

  it('gives a planned slot no date history, because nothing has happened yet', async () => {
    expect((await S.logApplication(job(), { stage: 'planned' })).dates).toEqual([]);
  });

  it('gives each slot its own id, so one job can be applied to twice', async () => {
    const a = await S.logApplication(job());
    const b = await S.logApplication(job());
    expect(a.id).not.toBe(b.id);
    expect(a.item_id).toBe(b.item_id);
    expect(await S.all('apps')).toHaveLength(2);
  });

  it('copies what the item knows and leaves the rest empty rather than inventing it', async () => {
    const a = await S.logApplication(job({ org: undefined }));
    expect(a.title).toBe('Backend Intern');
    expect(a.org).toBe('');
    expect(a.next_action).toBe('');
  });
});

describe('setStage', () => {
  it('keeps the history instead of overwriting the stage', async () => {
    let a = await S.logApplication(job(), { stage: 'applied' });
    a = await S.setStage(a, 'screen');
    a = await S.setStage(a, 'interview');
    expect(a.stage).toBe('interview');
    expect(a.dates.map(d => d.stage)).toEqual(['applied', 'screen', 'interview']);
  });

  it('ignores a stage that is not real, and a move to where it already is', async () => {
    let a = await S.logApplication(job(), { stage: 'applied' });
    const n = a.dates.length;
    a = await S.setStage(a, 'hired');
    a = await S.setStage(a, 'applied');
    expect(a.stage).toBe('applied');
    expect(a.dates).toHaveLength(n);
  });

  it('never changes trust, however far the application goes', async () => {
    let a = await S.logApplication(job(), { trust: 'manual', stage: 'applied' });
    a = await S.setStage(a, 'offer');
    expect(a.trust).toBe('manual');
  });
});

describe('daysSilent', () => {
  it('counts from the last thing that actually happened', () => {
    const a = { stage: 'applied', dates: [{ stage: 'applied', at: Date.now() - 20 * DAY }] };
    expect(S.daysSilent(a)).toBe(20);
  });
  it('is null before anything has happened', () => {
    expect(S.daysSilent({ stage: 'planned', dates: [] })).toBe(null);
  });
  it('is null once there is an answer, because silence is then over', () => {
    const at = Date.now() - 90 * DAY;
    expect(S.daysSilent({ stage: 'offer', dates: [{ stage: 'offer', at }] })).toBe(null);
    expect(S.daysSilent({ stage: 'reject', dates: [{ stage: 'reject', at }] })).toBe(null);
  });
  it('uses the most recent date, not the first', () => {
    const a = { stage: 'screen', dates: [
      { stage: 'applied', at: Date.now() - 40 * DAY },
      { stage: 'screen', at: Date.now() - 5 * DAY }
    ] };
    expect(S.daysSilent(a)).toBe(5);
  });
});
