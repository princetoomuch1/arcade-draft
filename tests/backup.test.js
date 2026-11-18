import { describe, it, expect, beforeEach } from 'vitest';
import * as S from '../src/store.js';

const DAY = 864e5;
const wipe = async () => {
  for (const s of ['personal', 'notes', 'goals', 'apps', 'weights', 'meta', 'wallpins', 'plans']) {
    for (const r of await S.all(s)) await S.del(s, r.id);
  }
};
beforeEach(wipe);

describe('storage thresholds', () => {
  it('is quiet below the warning line', () => {
    expect(S.storageLevel(10e6).level).toBe('ok');
  });
  it('warns, with a number, before it is a problem', () => {
    const r = S.storageLevel(60e6);
    expect(r.level).toBe('warn');
    expect(r.message).toContain('60 MB');
  });
  it('blocks writes with a message that says what to do', () => {
    const r = S.storageLevel(90e6);
    expect(r.level).toBe('block');
    expect(r.message).toMatch(/export a backup/i);
  });
  it('treats the thresholds as inclusive, so nothing slips between them', () => {
    expect(S.storageLevel(S.RETENTION.warnBytes).level).toBe('warn');
    expect(S.storageLevel(S.RETENTION.blockBytes).level).toBe('block');
  });
});

describe('archive retention', () => {
  const rec = (id, days) => ({ id, state: 'DRAWER', drawer_at: Date.now() - days * DAY, snapshot: { title: id } });

  it('offers only what has sat past 90 days', () => {
    const list = [rec('old', 120), rec('recent', 10), { id: 'live', state: 'SAVED' }];
    expect(S.staleArchive(list).map(r => r.id)).toEqual(['old']);
  });
  it('offers nothing when the drawer is young', () => {
    expect(S.staleArchive([rec('a', 1)])).toEqual([]);
  });
  it('never includes something that is not archived', () => {
    expect(S.staleArchive([{ id: 'x', state: 'SAVED', drawer_at: Date.now() - 900 * DAY }])).toEqual([]);
  });
});

describe('the active cap', () => {
  const many = n => Array.from({ length: n }, (_, i) => ({ id: 'i' + i, state: 'SAVED' }));
  it('counts only what is actually on the desk', () => {
    const r = S.activeCount([...many(3), { id: 'seen', state: 'SEEN' }, { id: 'gone', state: 'DRAWER' }]);
    expect(r.count).toBe(3);
    expect(r.over).toBe(false);
  });
  it('flags going over, and still does not delete anything', () => {
    expect(S.activeCount(many(S.RETENTION.maxActive + 1)).over).toBe(true);
  });
});

describe('backup round trip', () => {
  it('exports every store and says when', async () => {
    await S.put('notes', S.blankNote({ id: 'n1', title: 'A note' }));
    const b = await S.exportBackup();
    expect(b.version).toBe(S.BACKUP_VERSION);
    expect(typeof b.exported_at).toBe('string');
    expect(b.data.notes).toHaveLength(1);
    for (const s of ['personal', 'goals', 'apps', 'weights', 'meta', 'wallpins', 'plans']) {
      expect(Array.isArray(b.data[s])).toBe(true);
    }
  });

  it('loses nothing across export then import', async () => {
    await S.put('notes', S.blankNote({ id: 'n1', title: 'Keep me', body_md: 'body', tags: ['x'] }));
    await S.put('goals', { id: 'g1', title: 'A goal', checkpoints: [{ text: 'c', done: true }], gold: true });
    await S.logApplication(null, { title: 'Role', org: 'Org', trust: 'manual' });
    await S.chooseInterest('rust');
    await S.setSetting('density', 'FINE');

    const backup = await S.exportBackup();
    await wipe();
    expect(await S.all('notes')).toHaveLength(0);

    await S.importBackup(backup, 'replace');
    expect((await S.get('notes', 'n1')).title).toBe('Keep me');
    expect((await S.get('goals', 'g1')).gold).toBe(true);
    expect(await S.all('apps')).toHaveLength(1);
    expect((await S.get('weights', 'rust')).kind).toBe('explicit');
    expect((await S.settings()).density).toBe('FINE');
  });

  it('merge keeps what is here and lets the incoming copy win a clash', async () => {
    await S.put('notes', S.blankNote({ id: 'mine', title: 'Mine' }));
    await S.put('notes', S.blankNote({ id: 'both', title: 'Old title' }));
    const backup = { version: S.BACKUP_VERSION, exported_at: 'x', data: {
      notes: [{ id: 'both', title: 'New title' }, { id: 'theirs', title: 'Theirs' }]
    } };
    await S.importBackup(backup, 'merge');
    const ids = (await S.all('notes')).map(n => n.id).sort();
    expect(ids).toEqual(['both', 'mine', 'theirs']);
    expect((await S.get('notes', 'both')).title).toBe('New title');
  });

  it('replace clears the listed stores first', async () => {
    await S.put('notes', S.blankNote({ id: 'mine', title: 'Mine' }));
    await S.importBackup({ version: S.BACKUP_VERSION, data: { notes: [{ id: 'theirs', title: 'T' }] } }, 'replace');
    expect((await S.all('notes')).map(n => n.id)).toEqual(['theirs']);
  });

  it('refuses junk and a version it does not write, with a reason', () => {
    expect(S.previewImport(null, {}).why).toMatch(/not a backup/);
    expect(S.previewImport({ version: 99, data: {} }, {}).why).toMatch(/version/);
    expect(S.previewImport({ version: S.BACKUP_VERSION }, {}).why).toMatch(/no data/);
  });

  it('previews what would happen before anything is written', async () => {
    await S.put('notes', S.blankNote({ id: 'both', title: 'Here' }));
    const current = { notes: await S.all('notes') };
    const p = S.previewImport({ version: S.BACKUP_VERSION, exported_at: 'then', data: {
      notes: [{ id: 'both' }, { id: 'new' }]
    } }, current);
    const notes = p.rows.find(r => r.store === 'notes');
    expect(p.ok).toBe(true);
    expect(notes).toMatchObject({ incoming: 2, here: 1, overlap: 1, newRows: 1 });
    expect(await S.all('notes')).toHaveLength(1);   // the preview wrote nothing
  });
});
