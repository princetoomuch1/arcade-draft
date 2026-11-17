/* Opportunity Hub — the u engine. UI Spec v2 sections 3.1, 5.1.
   One job: turn the real screen into an integer device-pixel unit, and publish it as --u.
   Nothing else in the app is allowed to compute a size from the viewport. */

export const DENSITY = { CHUNKY: 180, BALANCED: 240, FINE: 320 };

/** DESKTOP ONLY. CHUNKY is the default everywhere; BALANCED and FINE stay as a user setting
 *  (VIDEO in Options) because a 27" monitor at CHUNKY gives very few words per line.
 *  A narrow or portrait window is a resized desktop window, not a phone: the landscape
 *  layout set still applies, it just gets fewer u across. There is no portrait layout set. */
export function defaultDensity(w = innerWidth, h = innerHeight) {
  return 'CHUNKY';
}

/** Below this the landscape layout cannot hold the Monitor's 320u reference width at CHUNKY.
 *  Show a "RESIZE THE WINDOW" card instead of reflowing into a phone layout that does not exist. */
export const MIN_WINDOW = { w: 900, h: 560 };
export const tooSmall = (w = innerWidth, h = innerHeight) => w < MIN_WINDOW.w || h < MIN_WINDOW.h;

/**
 * uDev = max(2, floor(shortDev / D)) where shortDev is the short side in DEVICE pixels.
 * The canvas is then however many whole u fit. Leftover device pixels are a letterbox,
 * never a fractional u, because a fractional u is what makes pixel art blurry.
 */
export function metrics(density = defaultDensity(), w = innerWidth, h = innerHeight, dpr = devicePixelRatio || 1) {
  const D = DENSITY[density] ?? DENSITY.BALANCED;
  const wDev = Math.round(w * dpr), hDev = Math.round(h * dpr);
  const shortDev = Math.min(wDev, hDev), longDev = Math.max(wDev, hDev);

  const uDev = Math.max(2, Math.floor(shortDev / D));
  const uCss = uDev / dpr;                       // may be fractional in CSS px; it is whole in device px

  const shortU = Math.floor(shortDev / uDev);
  const longU  = Math.floor(longDev  / uDev);
  // Desktop only: the layout set is always landscape. This flag is kept because the canvas
  // still has to map onto whatever window shape the user drags out.
  const landscape = wDev >= hDev;

  return {
    density, D, dpr, w, h, wDev, hDev, uDev, uCss, landscape,
    canvasU:  { w: landscape ? longU : shortU, h: landscape ? shortU : longU },
    // device pixels left over on each axis once whole u are taken: the letterbox
    leftover: { x: wDev - (landscape ? longU : shortU) * uDev, y: hDev - (landscape ? shortU : longU) * uDev },
    reference: '320x180u',   // the only reference canvas now
    tooSmall: tooSmall(w, h)
  };
}

/** Publish --u and the canvas size in u. Call on load, resize and density change. */
export function apply(density, root = document.documentElement) {
  const m = metrics(density);
  root.style.setProperty('--u', m.uCss + 'px');
  root.style.setProperty('--cw', m.canvasU.w);
  root.style.setProperty('--ch', m.canvasU.h);
  root.dataset.orientation = 'landscape';            // never portrait
  root.dataset.tooSmall = String(m.tooSmall);
  root.dataset.density = m.density;
  return m;
}

/** Centring that lands on a half u rounds DOWN (left/up), always — one bias for the whole app. */
export const centre = (outer, inner) => Math.floor((outer - inner) / 2);

/** Only these u values are legal for margin, padding and gap. */
export const SPACING = [1, 2, 3, 4, 6, 8, 12, 16, 24];
export const snap = n => Math.round(n);   // every drag position goes through this, on every pointer move
