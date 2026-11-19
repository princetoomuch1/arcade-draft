import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as S from '../src/store.js';
import * as UNDO from '../src/undo.js';

/* The storage block and the undo snapshot.
 *
 * Both of these were claims before they were code: the settings panel said new writes were blocked
 * at 80 MB while nothing checked, and undo was wired at two call sites and spoken of at all of
 * them. These tests exist so the claim and the behaviour cannot drift apart again.
 */

const wipe = async () => {
  for (const s of ['personal', 'notes', 'goals']) for (const r of await S.all(s)) await S.del(s, r.id);
};

/** Pretend the device is as full as we say. */
function fakeUsage(bytes) {
  const nav = /** @type {any} */ (globalThis.navigator);
  const had = Object.prototype.hasOwnProperty.call(nav, 'storage');
  const prev = nav.storage;
  Object.defineProperty(nav, 'storage', {
    configurable: true, value: { estimate: async () => ({ usage: bytes, quota: 100e6 }) }
  });
  return () => {
    if (had) Object.defineProperty(nav, 'storage', { configurable: true, value: prev });
    else delete nav.storage;
    S.resetWriteGate();
  };
}

beforeEach(async () => { S.resetWriteGate(); await wipe(); UNDO.clear(); });
afterEach(() => { S.resetWriteGate(); });

describe('the storage guard, on the write path', () => {
  it('lets a write through when there is room', async () => {
    const restore = fakeUsage(1e6);
    await expect(S.put('notes', { id: 'n1', title: 'fine' })).resolves.toBeTruthy();
    restore();
  });

  it('refuses a write past the block line, and says why', async () => {
    const restore = fakeUsage(90e6);
    await expect(S.put('notes', { id: 'n2', title: 'too late' }))
      .rejects.toThrow(/writes are blocked/i);
    restore();
    expect(await S.get('notes', 'n2')).toBeUndefined();
  });

  it('still allows deletes, so the way out is not blocked too', async () => {
    const room = fakeUsage(1e6);
    await S.put('notes', { id: 'n3', title: 'keep' });
    room();
    const full = fakeUsage(90e6);
    await expect(S.del('notes', 'n3')).resolves.toBeUndefined();
    full();
    expect(await S.get('notes', 'n3')).toBeUndefined();
  });

  it('warning level does not block anything', async () => {
    const restore = fakeUsage(60e6);
    await expect(S.put('notes', { id: 'n4', title: 'warned, not stopped' })).resolves.toBeTruthy();
    restore();
  });

  it('caches its verdict rather than asking on every keystroke', async () => {
    let calls = 0;
    const nav = /** @type {any} */ (globalThis.navigator);
    const prev = Object.prototype.hasOwnProperty.call(nav, 'storage') ? nav.storage : undefined;
    Object.defineProperty(nav, 'storage', {
      configurable: true,
      value: { estimate: async () => { calls++; return { usage: 1e6, quota: 100e6 }; } }
    });
    for (let i = 0; i < 5; i++) await S.put('notes', { id: 'c' + i, title: 'x' });
    expect(calls).toBe(1);
    if (prev === undefined) delete nav.storage;
    else Object.defineProperty(nav, 'storage', { configurable: true, value: prev });
    S.resetWriteGate();
  });

  it('reports unknown usage as zero-and-fine only when it truly cannot ask', async () => {
    const nav = /** @type {any} */ (globalThis.navigator);
    const had = Object.prototype.hasOwnProperty.call(nav, 'storage');
    const prev = nav.storage;
    Object.defineProperty(nav, 'storage', { configurable: true, value: undefined });
    const r = await S.storageReport();
    expect(r.level).toBe('ok');
    expect(r.bytes).toBe(0);
    if (had) Object.defineProperty(nav, 'storage', { configurable: true, value: prev });
    else delete nav.storage;
    S.resetWriteGate();
  });
});

describe('snapshotFor: undo that puts the record back as it was', () => {
  it('restores an edited record exactly', async () => {
    await S.put('goals', { id: 'g1', title: 'Original', checkpoints: [{ t: 'one', done: false }] });
    const back = await S.snapshotFor('goals', 'g1');
    const g = await S.get('goals', 'g1');
    g.title = 'Changed';
    g.checkpoints[0].done = true;
    await S.put('goals', g);
    expect((await S.get('goals', 'g1')).title).toBe('Changed');
    await back();
    const after = await S.get('goals', 'g1');
    expect(after.title).toBe('Original');
    expect(after.checkpoints[0].done).toBe(false);
  });

  it('restores a deleted record', async () => {
    await S.put('notes', { id: 'n9', title: 'Gone soon', body_md: 'text' });
    const back = await S.snapshotFor('notes', 'n9');
    await S.del('notes', 'n9');
    expect(await S.get('notes', 'n9')).toBeUndefined();
    await back();
    expect((await S.get('notes', 'n9')).body_md).toBe('text');
  });

  it('undoing a creation deletes it rather than leaving a blank husk', async () => {
    const back = await S.snapshotFor('notes', 'new1');
    await S.put('notes', { id: 'new1', title: 'Made by mistake' });
    await back();
    expect(await S.get('notes', 'new1')).toBeUndefined();
  });

  it('takes a copy, so later edits to the live object do not follow it', async () => {
    const rec = { id: 'g2', title: 'Before', checkpoints: [{ t: 'a', done: false }] };
    await S.put('goals', rec);
    const back = await S.snapshotFor('goals', 'g2');
    rec.title = 'After';
    rec.checkpoints[0].done = true;
    await S.put('goals', rec);
    await back();
    expect((await S.get('goals', 'g2')).title).toBe('Before');
  });

  it('works through the undo stack the way the pages use it', async () => {
    await S.put('notes', { id: 'n10', title: 'Keep me' });
    const back = await S.snapshotFor('notes', 'n10');
    await S.del('notes', 'n10');
    UNDO.record('deleted the note Keep me', back);
    expect(UNDO.peek()).toBe('deleted the note Keep me');
    expect(await UNDO.undoLast()).toBe('deleted the note Keep me');
    expect((await S.get('notes', 'n10')).title).toBe('Keep me');
    expect(UNDO.canUndo()).toBe(false);
  });
});

describe('the drawer prompt', () => {
  it('offers only what has sat past the prompt threshold', () => {
    const day = 864e5;
    const rec = (id, age) => ({ id, state: S.STATE.DRAWER, drawer_at: Date.now() - age * day });
    const old = S.staleArchive([rec('fresh', 2), rec('ripe', 120), rec('edge', 89)]);
    expect(old.map(r => r.id)).toEqual(['ripe']);
  });
  it('never counts anything that is not archived', () => {
    expect(S.staleArchive([{ id: 'saved', state: S.STATE.SAVED, drawer_at: 0 }])).toEqual([]);
  });
});
