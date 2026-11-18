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

```
npm install
npm run dev
```

Then open `http://localhost:5173/`. The calibration page is at `/calibrate.html`.
`npm run dev` uses `tools/serve.mjs`, which has no dependencies of its own.

`file://` will not work — the app is ES modules and the browser blocks module imports over `file://`.

## Checking your own work

`npm run verify` runs all five checks and prints a table:

| Script | What it does |
| --- | --- |
| `npm run build` | Copies the site into `dist/`, fails if the HTML references a file that is not shipped, validates every `data/*.json` |
| `npm run typecheck` | `tsc --noEmit` over the JSDoc types in `src/model.js` and the rest of `src/` |
| `npm run lint` | ESLint |
| `npm test` | Vitest, over the store and model logic |
| `npm run audit` | Imports resolve, named exports exist, CSS classes defined, no forbidden CSS, every stylesheet linked |

Nothing is "done" until `npm run verify` is green and the evidence is in `BUILD_LOG.md`.

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

## What is built

| Stage | State |
| --- | --- |
| 0 — calibration page | done (`calibrate.html`) |
| 1 — shell, router, sound, store, seed data | done |
| 2 — Feed and the stage card | done |
| 3 — Jobs, Hacks, News | done |
| 4 — Desk and Wall | built (`src/desk.js`, `src/wall.js`, `src/room.css`), not spec-checked: Spec v2 is not in this folder |
| 5 — Notes, Calendar, Applications, Options | built and browser-tested. Missing: note image thumbnails, Calendar Year Wheel |
| 6 — QA pass | not started |

Seed data in `data/*.json` is **fictional**. Every row carries `_mock: true` and every source is
`seed.local`, and the UI prints "SEED ROW — fictional" wherever one is shown in detail. Build step 1
replaces it with real scraped data.

## Build phases

The phase plan and the evidence for each one live in `BUILD_LOG.md`.

| Phase | State |
| --- | --- |
| 0 — toolchain, data model, store v2, CI | done |
| 1 — Computer shell + Feed, cabinet, fullscreen, main menu | done |
| 2 — Jobs + Applications | done |
| 3 — Hackathons + News | done |
| 4 — Notes + Calendar | done |
| 5–6 — Desk and Wall | done |
| 7 — shared logic | done |
| 8 — ethical engagement | done |
| 9 — scrape pipeline | built, no sites configured. Use `npm run check-source -- <url>` before adding one. `data/*.json` is still fictional seed data, every row carries `_mock: true` |
| 10 — PWA, accessibility, polish | done. Desktop only, by decision: installable and offline, but a phone still shows RESIZE THE WINDOW |

## Back up and restore

Everything personal lives in IndexedDB on this machine and is **not** in the repository.
Options → DATA → EXPORT BACKUP writes one JSON file. IMPORT A BACKUP shows what the file would do
before writing anything, then offers MERGE (the file wins a clash) or REPLACE (clears first).

Clearing site data deletes it all. Export first.

## Deploying

See [docs/deploy.md](docs/deploy.md): first deploy, updates, rollback, refreshing the data, and the
service-worker cache gotcha.

## Credits and licences

In the app at MORE → CREDITS, and in [src/pages/credits.js](src/pages/credits.js). Four Google fonts
under the SIL Open Font License; every icon, texture, company mark and sound is generated in this
repository. Build tools are MIT / Apache-2.0 / MPL-2.0. Nothing is paid for.

## Data retention

- A saved item whose deadline has passed moves to the drawer, never deleted.
- The drawer holds removed items for 14 days.
- Anything archived past 90 days is **offered** for cleanup in Options, never swept.
- Storage: a warning at 50 MB, writes blocked at 80 MB with a message saying what to do.
- A soft cap of 5,000 active items prompts you to archive; nothing is pruned for you.

## Known limitations

- Desktop only. A phone shows RESIZE THE WINDOW; that is a decision, not a gap.
- No scrape sources configured, so `data/*.json` is fictional seed data (`_mock: true` on every row).
- `sw.js` is not covered by `tsc` because its global scope conflicts with the DOM lib; ESLint checks it.
- `verify.sh` from the build spec is `tools/verify.mjs` here: same steps and exit codes, but Node so
  it runs on Windows.
