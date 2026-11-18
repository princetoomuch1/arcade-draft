import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { receiptNode, ago, freshness } from '../src/receipt.js';

/* The guard agreed in Phase 11: "expires in" is allowlisted in the copy audit only because the
   number is read from the data. These tests are what make that allowlist safe — if anyone ever
   hardcodes a countdown, or renders one that does not match the item, this fails. */

const DAY = 864e5;

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><body></body>');
  globalThis.document = dom.window.document;
  globalThis.Image = dom.window.Image;
});

const render = item => receiptNode(item).textContent;

describe('the freshness receipt countdown comes from the data', () => {
  /** What a reader would work out from the same data: whole days remaining, rounded up. */
  const daysLeft = iso => Math.ceil((new Date(iso).getTime() - Date.now()) / DAY);

  it('prints exactly the days the data says, never a number of its own', () => {
    for (const days of [5, 18, 90, 365]) {
      const at = new Date(Date.now() + days * DAY + 1000).toISOString();
      const item = { id: 'x', expiresAt: at };
      expect(render(item)).toContain(`IN ${daysLeft(at)} DAYS`);
    }
  });

  it('falls back to the deadline when there is no explicit expiry, and still matches it', () => {
    const at = new Date(Date.now() + 7 * DAY + 1000).toISOString();
    expect(render({ id: 'x', deadline: at })).toContain(`IN ${daysLeft(at)} DAYS`);
  });

  it('says TOMORROW OR SOONER rather than the ungrammatical "IN 1 DAYS"', () => {
    const item = { id: 'x', expiresAt: new Date(Date.now() + 0.5 * DAY).toISOString() };
    const text = render(item);
    expect(text).toContain('TOMORROW OR SOONER');
    expect(text).not.toMatch(/IN 1 DAYS/);
  });

  it('never invents a countdown when the source gave no date', () => {
    const text = render({ id: 'x' });
    expect(text).toContain('NO DATE GIVEN');
    expect(text).not.toMatch(/IN \d+ DAYS/);
  });

  it('says a passed date has passed rather than counting down to it', () => {
    const item = { id: 'x', expiresAt: new Date(Date.now() - 3 * DAY).toISOString() };
    const text = render(item);
    expect(text).toContain('ALREADY PASSED');
    expect(text).not.toMatch(/IN \d+ DAYS/);
  });

  it('shows no countdown anywhere but the expiry row', () => {
    const item = {
      id: 'x',
      firstSeen: new Date(Date.now() - 10 * DAY).toISOString(),
      lastSeen: new Date(Date.now() - 2 * DAY).toISOString(),
      expiresAt: new Date(Date.now() + 4 * DAY + 1000).toISOString()
    };
    const matches = render(item).match(/IN \d+ DAYS/g) || [];
    expect(matches).toHaveLength(1);
  });

  it('reads the number straight off the item, with no rounding surprise at the boundary', () => {
    // just under 2 days must not read as 1
    const item = { id: 'x', expiresAt: new Date(Date.now() + 2 * DAY - 1000).toISOString() };
    expect(render(item)).toContain('IN 2 DAYS');
  });
});

describe('the receipt never dresses up an old row as a fresh one', () => {
  it('grades by when the row was last confirmed, not when it was written', () => {
    const now = Date.now();
    const item = {
      id: 'x',
      firstSeen: new Date(now).toISOString(),
      lastSeen: new Date(now - 30 * DAY).toISOString()
    };
    expect(freshness(item, now).level).toBe('stale');
    expect(render(item)).toContain('NOT CHECKED SINCE');
  });

  it('says NEVER rather than guessing a date it was never given', () => {
    expect(ago(null)).toBe('NEVER');
    expect(render({ id: 'x' })).toContain('NEVER');
  });
});
