import { describe, it, expect } from 'vitest';
import { encodeQR as raw, pickVersion } from '../src/share/qr.js';

/** The tests know when they expect success, so they unwrap once here. */
const encodeQR = t => /** @type {any} */ (raw(t));

/* These check the structure the QR standard fixes: size, finder patterns, timing, the dark module,
   version selection and the refusal. They do NOT prove a phone can scan it — that needs a real
   decoder and a camera, and is recorded as unverified in BUILD_LOG rather than claimed here. */

describe('pickVersion', () => {
  it('uses the smallest version that fits', () => {
    expect(pickVersion(10)).toBe(1);
    expect(pickVersion(17)).toBe(1);        // 19 codewords less the 2-byte header
    expect(pickVersion(20)).toBe(2);
  });
  it('steps up as the payload grows', () => {
    const a = pickVersion(100), b = pickVersion(400);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThanOrEqual(20);
  });
  it('refuses what will not fit rather than returning a guess', () => {
    expect(pickVersion(5000)).toBe(null);
  });
});

describe('encodeQR', () => {
  it('produces a square whose size matches its version', () => {
    const r = encodeQR('https://example.test/share#d=abc');
    expect(r.ok).toBe(true);
    expect(r.size).toBe(r.version * 4 + 17);
    expect(r.modules).toHaveLength(r.size);
    for (const row of r.modules) expect(row).toHaveLength(r.size);
  });

  it('puts a finder pattern in three corners and not the fourth', () => {
    const { modules: m, size } = encodeQR('hello');
    const finder = (r, c) =>
      m[r][c] === 1 && m[r + 6][c] === 1 && m[r][c + 6] === 1 && m[r + 6][c + 6] === 1
      && m[r + 1][c + 1] === 0 && m[r + 3][c + 3] === 1;
    expect(finder(0, 0)).toBe(true);
    expect(finder(0, size - 7)).toBe(true);
    expect(finder(size - 7, 0)).toBe(true);
    // the bottom-right corner is data, so it must not look like a finder
    expect(finder(size - 7, size - 7)).toBe(false);
  });

  it('alternates the timing patterns', () => {
    const { modules: m, size } = encodeQR('timing');
    for (let i = 8; i < size - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0 ? 1 : 0);
      expect(m[i][6]).toBe(i % 2 === 0 ? 1 : 0);
    }
  });

  it('sets the module that the standard says is always dark', () => {
    const { modules: m, size } = encodeQR('dark');
    expect(m[size - 8][8]).toBe(1);
  });

  it('separates each finder with a quiet border of light modules', () => {
    const { modules: m } = encodeQR('sep');
    for (let i = 0; i <= 7; i++) expect(m[7][i]).toBe(0);
    for (let i = 0; i <= 7; i++) expect(m[i][7]).toBe(0);
  });

  it('is deterministic: the same text gives the same code', () => {
    const a = encodeQR('https://example.test/x');
    const b = encodeQR('https://example.test/x');
    expect(JSON.stringify(a.modules)).toBe(JSON.stringify(b.modules));
  });

  it('gives different text a different code', () => {
    const a = encodeQR('one'), b = encodeQR('two');
    expect(JSON.stringify(a.modules)).not.toBe(JSON.stringify(b.modules));
  });

  it('handles a long but legal payload', () => {
    const r = encodeQR('x'.repeat(800));
    expect(r.ok).toBe(true);
    expect(r.version).toBeLessThanOrEqual(20);
  });

  it('refuses an oversized link with an explanation and an alternative', () => {
    const r = encodeQR('x'.repeat(4000));
    expect(r.ok).toBe(false);
    expect(r.why).toMatch(/past what a QR code can hold/);
    expect(r.why).toMatch(/hosted share/);
  });

  it('copes with an empty string and with unicode', () => {
    expect(encodeQR('').ok).toBe(true);
    expect(encodeQR('★ a corner').ok).toBe(true);
  });

  it('leaves no module unset', () => {
    const { modules: m } = encodeQR('complete');
    for (const row of m) for (const v of row) expect(v === 0 || v === 1).toBe(true);
  });
});
