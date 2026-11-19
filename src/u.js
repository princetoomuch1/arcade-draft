/* Opportunity Hub — the u engine. UI Spec v2 sections 3.1, 5.1.
   One job: turn the real screen into an integer device-pixel unit, and publish it as --u.
   Nothing else in the app is allowed to compute a size from the viewport. */

export const DENSITY = { CHUNKY: 180, BALANCED: 240, FINE: 320 };

/** DESKTOP ONLY. The default is picked from the window, because a fixed default is what made the
 *  app unusable: CHUNKY on a 1440x900 window gives u = 5px, which makes body text 40px and fits
 *  about two cards on a screen. The arcade look does not require giant type — it requires whole
 *  pixels, which every density gives.
 *
 *  D is how many u the SHORT side is divided into, so a bigger D means a smaller u and more room.
 *  CHUNKY stays available in Options for a small laptop screen, where it is the right answer.
 *
 *  A narrow or portrait window is a resized desktop window, not a phone: the landscape
 *  layout set still applies, it just gets fewer u across. There is no portrait layout set. */
export function defaultDensity(w = innerWidth, h = innerHeight) {
  const short = Math.min(w, h);
  if (short >= 800) return 'FINE';        // a full desktop screen
  if (short >= 620) return 'BALANCED';    // a half-height window or a small laptop
  return 'CHUNKY';
}

/** Below this the landscape layout cannot hold the Monitor's 320u reference width at CHUNKY.
 *  Show a "RESIZE THE WINDOW" card instead of reflowing into a phone layout that does not exist. */
export const MIN_WINDOW = { w: 900, h: 560 };
export const tooSmall = (w = innerWidth, h = innerHeight) => w < MIN_WINDOW.w || h < MIN_WINDOW.h;

/** The cabinet bezel around the screen, in u on each side. Fullscreen passes 0 and it slides away.
 *  It is taken out of the canvas, never out of u, so toggling it never resizes a single glyph. */
export const FRAME_U = 6;

/**
 * uDev = max(2, floor(shortDev / D)) where shortDev is the short side in DEVICE pixels.
 * The canvas is then however many whole u fit. Leftover device pixels are a letterbox,
 * never a fractional u, because a fractional u is what makes pixel art blurry.
 */
export function metrics(density = null, w = innerWidth, h = innerHeight, dpr = devicePixelRatio || 1,
                        frame = FRAME_U) {
  /* A null or unset density means "decide from the window". Resolving it here, in the one place
     allowed to read the viewport, keeps every caller from having to carry its own fallback —
     which is how `|| 'CHUNKY'` ended up scattered over six files and pinned the whole app to the
     largest unit regardless of screen. */
  density = density || defaultDensity(w, h);
  const D = DENSITY[density] ?? DENSITY.BALANCED;
  const wDev = Math.round(w * dpr), hDev = Math.round(h * dpr);
  const shortDev = Math.min(wDev, hDev), longDev = Math.max(wDev, hDev);

  const uDev = Math.max(2, Math.floor(shortDev / D));
  const uCss = uDev / dpr;                       // may be fractional in CSS px; it is whole in device px

  // The bezel comes out of the canvas, not out of u. A window too small to spare it gets none.
  const f = tooSmall(w, h) ? 0 : Math.max(0, frame);
  const shortU = Math.max(1, Math.floor(shortDev / uDev) - 2 * f);
  const longU  = Math.max(1, Math.floor(longDev  / uDev) - 2 * f);
  // Desktop only: the layout set is always landscape. This flag is kept because the canvas
  // still has to map onto whatever window shape the user drags out.
  const landscape = wDev >= hDev;

  return {
    density, D, dpr, w, h, wDev, hDev, uDev, uCss, landscape, frame: f,
    canvasU:  { w: landscape ? longU : shortU, h: landscape ? shortU : longU },
    // device pixels left over on each axis once whole u and the bezel are taken: the letterbox
    leftover: { x: wDev - (landscape ? longU : shortU) * uDev, y: hDev - (landscape ? shortU : longU) * uDev },
    reference: '320x180u',   // the only reference canvas now
    tooSmall: tooSmall(w, h)
  };
}

/** Publish --u and the canvas size in u. Call on load, resize, density change and fullscreen. */
export function apply(density = null, root = document.documentElement, frame = FRAME_U) {
  const m = metrics(density, innerWidth, innerHeight, devicePixelRatio || 1, frame);
  root.style.setProperty('--u', m.uCss + 'px');
  root.style.setProperty('--cw', String(m.canvasU.w));
  root.style.setProperty('--ch', String(m.canvasU.h));
  root.style.setProperty('--frame', String(m.frame));
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
