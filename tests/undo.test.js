import { describe, it, expect, beforeEach } from 'vitest';
import * as U from '../src/undo.js';

beforeEach(() => U.clear());

describe('the undo stack', () => {
  it('undoes the most recent action first', async () => {
    const order = [];
    U.record('first', () => order.push('first'));
    U.record('second', () => order.push('second'));
    expect(await U.undoLast()).toBe('second');
    expect(await U.undoLast()).toBe('first');
    expect(order).toEqual(['second', 'first']);
  });

  it('returns null rather than throwing when there is nothing to undo', async () => {
    expect(await U.undoLast()).toBe(null);
    expect(U.canUndo()).toBe(false);
  });

  it('really puts the world back', async () => {
    const world = { items: ['a', 'b'] };
    const removed = world.items.pop();
    U.record('remove b', () => { world.items.push(removed); });
    await U.undoLast();
    expect(world.items).toEqual(['a', 'b']);
  });

  it('keeps the last twenty and drops the oldest', () => {
    for (let i = 0; i < 25; i++) U.record('a' + i, () => {});
    expect(U.depth()).toBe(20);
    expect(U.peek()).toBe('a24');
  });

  it('awaits an async undo before reporting it done', async () => {
    let done = false;
    U.record('slow', async () => { await new Promise(r => setTimeout(r, 10)); done = true; });
    await U.undoLast();
    expect(done).toBe(true);
  });

  it('does not re-offer an action once it has been undone', async () => {
    U.record('one', () => {});
    await U.undoLast();
    expect(U.canUndo()).toBe(false);
    expect(await U.undoLast()).toBe(null);
  });
});
