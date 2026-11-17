import { describe, it, expect } from 'vitest';
import { metrics, centre, snap, FRAME_U, MIN_WINDOW, tooSmall, DENSITY } from '../src/u.js';

const m = (w, h, dpr = 1, frame = FRAME_U, density = 'CHUNKY') => metrics(density, w, h, dpr, frame);

describe('u is whole in device pixels', () => {
  it('lands on a whole device pixel at every dpr it is given', () => {
    for (const dpr of [1, 1.25, 1.5, 2, 2.5, 3]) {
      const r = m(1920, 1080, dpr);
      expect(Number.isInteger(r.uDev)).toBe(true);
      expect(r.uCss * dpr).toBeCloseTo(r.uDev, 10);
    }
  });
  it('never goes below 2 device pixels, however cramped the window', () => {
    expect(m(320, 200).uDev).toBeGreaterThanOrEqual(2);
  });
  it('gives a denser setting a smaller u', () => {
    expect(m(1920, 1080, 1, 0, 'FINE').uDev).toBeLessThanOrEqual(m(1920, 1080, 1, 0, 'CHUNKY').uDev);
    expect(DENSITY.FINE).toBeGreaterThan(DENSITY.CHUNKY);
  });
});

describe('the cabinet bezel', () => {
  it('comes out of the canvas and never out of u', () => {
    const framed = m(1920, 1080, 1, FRAME_U);
    const full = m(1920, 1080, 1, 0);
    expect(framed.uDev).toBe(full.uDev);            // the glyphs do not move
    expect(framed.uCss).toBe(full.uCss);
    expect(full.canvasU.w - framed.canvasU.w).toBe(2 * FRAME_U);
    expect(full.canvasU.h - framed.canvasU.h).toBe(2 * FRAME_U);
  });
  it('is reported back so the CSS can paint exactly that many u', () => {
    expect(m(1920, 1080, 1, FRAME_U).frame).toBe(FRAME_U);
    expect(m(1920, 1080, 1, 0).frame).toBe(0);
  });
  it('is dropped entirely in a window too small to spare it', () => {
    const small = m(MIN_WINDOW.w - 1, MIN_WINDOW.h - 1, 1, FRAME_U);
    expect(small.frame).toBe(0);
    expect(small.tooSmall).toBe(true);
  });
  it('never produces a canvas of zero or less', () => {
    for (const [w, h] of [[900, 560], [901, 561], [1024, 600], [3840, 2160]]) {
      const r = m(w, h, 1, FRAME_U);
      expect(r.canvasU.w).toBeGreaterThan(0);
      expect(r.canvasU.h).toBeGreaterThan(0);
    }
  });
});

describe('window minimum', () => {
  it('calls a window too small on either axis', () => {
    expect(tooSmall(899, 700)).toBe(true);
    expect(tooSmall(1200, 559)).toBe(true);
    expect(tooSmall(900, 560)).toBe(false);
  });
});

describe('centring and snapping', () => {
  it('breaks a half-u tie upward and leftward, always the same way', () => {
    expect(centre(10, 5)).toBe(2);
    expect(centre(11, 5)).toBe(3);
  });
  it('snaps a drag to a whole u', () => {
    expect(snap(4.4)).toBe(4);
    expect(snap(4.6)).toBe(5);
    expect(Number.isInteger(snap(-3.2))).toBe(true);
  });
});
