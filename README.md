# Opportunity Hub — the arcade

**Desktop only.** Mouse and keyboard, landscape window, minimum 900 x 560 CSS px. There is no portrait
layout set and no touch layout; a narrow window is a resized desktop window, and below the minimum the app
says RESIZE THE WINDOW rather than reflowing.

Personal-use aggregator: hackathons, AI news, IT/AI schemes, jobs and internships, project notes.
Design authority is **UI Spec v2: The Room (Arcade + Desk + Wall)** — every size, hex and timing
comes from there. Do not invent a value that is not in the spec.

## Where things are

| Path | What |
| --- | --- |
| `src/tokens.css` | Every colour, from spec section 4. Measured contrast, not eyeballed. |
| `src/pixel.css` | Pixel law: type scale, bevel, stair corners, dither, shadows, z-order, focus, reduced motion. Section 3 + 5. |
| `src/u.js` | The u engine. The only code allowed to compute a size from the viewport. Section 3.1 + 5.1. |
| `calibrate.html` | **Build step 0.** Must pass before any real screen is built. |

## Run it

Double-click `serve.cmd` (Windows). It opens the calibration page.
Or from a terminal here: `npx serve -l 5173 .` then open `http://localhost:5173/calibrate.html`.

`file://` will not work — `src/u.js` is an ES module and the browser blocks module imports over `file://`.

## Build step 0 — what to check

Open `calibrate.html` in the browser you will actually use, at the window size you will actually use.
Check **CHUNKY** (the default); also check **FINE** if your monitor is 1440p or larger.

1. **Device report** — the active density's `u in CSS px`. Fractional is fine (u is whole in *device* px);
   a letterbox of a few device px is also fine.
2. **Font sharpness** — the one real decision. The page renders each font at each candidate size and
   counts anti-aliased fringe pixels. Read the **VT323 verdict** line:
   - says the 16u assumption holds → nothing to change.
   - names a different size → change `.t-body` in `src/pixel.css` to that size. Nothing else moves.
3. **U grid** — the 1u checkerboard must be crisp black/white squares. Grey or uneven squares mean u
   is landing on a fraction of a device pixel.
4. **Type specimens** — all nine roles legible at normal monitor distance. BODY and HAND are the two to
   judge hardest: at CHUNKY on a large monitor they get very few words per line, which is what FINE is for.
5. **Pixel parts** — bevel, stair corners, dither bands, hard shadows, gold focus ring, hover states,
   grab cursor. No soft edges anywhere. Hover now matters: it is a primary state, not a nicety.
6. **Contrast** — everything `pass` except the four marked `expected fail`, which the spec already fixes
   with outlines (red string, teal goal bar) or never uses for meaning (bevel highlight).

Any real `FAIL` in section 6 is a token bug — fix the hex in `tokens.css`, not the test.

## Next steps (spec section 17.3)

Step 1 is the scraper and the data contract (hackathons first), then step 2 the PWA shell.

## Checking your own work

`node audit.js` from this folder. It checks, with no browser needed:

- every static and dynamic import path resolves
- every named import actually exists as an export in the target module
- every CSS class the JS uses is defined in a stylesheet
- no forbidden CSS anywhere (`border-radius`, `linear-gradient`, `backdrop-filter`, any `blur()`),
  with comments stripped first so the FORBIDDEN list in `pixel.css` does not trip it

Run it after every change. It catches the failures that otherwise only show up as a blank screen.

## What is built

| Stage | State |
| --- | --- |
| 0 — calibration page | done (`calibrate.html`) |
| 1 — shell, router, sound, store, seed data | done |
| 2 — Feed and the stage card | done |
| 3 — Jobs, Hacks, News | done |
| 4 — Desk and Wall | built (`src/desk.js`, `src/wall.js`, `src/room.css`), not spec-checked: Spec v2 is not in this folder |
| 5 — Notes, Calendar, Applications, Options | built, not browser-tested. Missing: note image thumbnails, Calendar Year Wheel (`src/stage5.css` holds the styles) |
| 6 — QA pass | not started |

Seed data in `data/*.json` is **fictional**. Every row carries `_mock: true` and every source is
`seed.local`, and the UI prints "SEED ROW — fictional" wherever one is shown in detail. Build step 1
replaces it with real scraped data.
