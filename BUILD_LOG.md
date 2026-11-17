# Build log

One entry per task. A task is done only when every check below is green and the evidence is written
down here. `npm run verify` runs all five in order and prints the table that these entries quote.

| Check | Command |
| --- | --- |
| build | `npm run build` — copies the site into `dist/`, proves every referenced file ships, validates `data/*.json` |
| typecheck | `npx tsc --noEmit` — JSDoc types over plain JS, `checkJs` on |
| lint | `npx eslint .` |
| test | `npx vitest run` |
| audit | `node tools/audit.mjs` — imports resolve, exports exist, CSS classes defined, no forbidden CSS, every stylesheet linked |

---

## 2026-11-18 — Phase 0, foundation

**Stack decision.** The spec named React/Svelte + Tailwind + Framer Motion + Howler. We kept the
existing vanilla ES-module app instead, on the user's call. Reasons on the record: Tailwind's px/rem
scale fights the integer-`u` pixel law in `src/pixel.css`; Framer's eased motion is banned by the same
law (stepped timing only); `src/sound.js` already synthesizes every sound with no files and no licence
risk, which is what Howler would have replaced; and the app is already a zero-build static site, which
is what GitHub Pages wants. Everything the spec asked for around the stack — tests, lint, typecheck,
CI, scrapers, PWA — is being added on top.

### Tasks

**1. Toolchain.** `git init`; baseline commit of stages 0–5 on `master`; work on `phase-0/foundation`.
`package.json` (type: module), dev deps: vitest 2.1.8, eslint 9.17, typescript 5.7.2, @types/node,
fake-indexeddb, globals, jsdom. `tsconfig.json` with `allowJs`+`checkJs`, `eslint.config.js` (flat),
`vitest.config.js`.

- Baseline on the existing code: **55 typecheck errors, 9 lint errors**. All fixed, none suppressed:
  - `sound.js` — 30 errors from `tone()`/`noise()` inferring required params from the first call.
    Fixed with JSDoc param types. `webkitAudioContext` narrowed with a cast.
  - 14 date-arithmetic errors (`new Date(x) - Date.now()`) across jobs, news, feed, calendar, hacks.
    Fixed with explicit `.getTime()`. These were real latent bugs in waiting, not type noise.
  - `u.js`, `desk.js` — `setProperty`/`setAttribute` given numbers. Wrapped in `String()`.
  - `jobs.js`, `options.js` — tuple arrays widening to unions. Annotated.
  - 9 unused imports removed (`tooSmall`, `DENSITY`, `skipped`, `personalFor`, `muteTopic`) plus two
    dead locals.
- `audit.js` was CommonJS and would have broken under `type: module`. Moved to `tools/audit.mjs` as
  ESM and extended: it now also discovers stylesheets by walking `src/` instead of a hardcoded list,
  and fails if a stylesheet is not linked from `index.html`.

**2. Data model.** New `src/model.js`: JSDoc typedefs for all nine spec entities (FeedItem, ItemRecord,
Note, Application, Goal, WallPin, Interest, DeadlinePlan, RefreshLog) plus blank factories, `uid()`,
`expiresAt()` and `receipt()`. The public/private split is enforced by shape: scraped rows stay in
`data/*.json` and carry nothing personal; everything about the user is an IndexedDB record.

**3. Store v2.** `src/store.js` bumped to IndexedDB version 2. New stores: `wallpins`, `plans`,
`refresh`. The v1 → v2 upgrade rewrites existing records in the versionchange transaction:
`savedAt`→`saved_at`, `deskPos`→`desk_position` (+`rot`), `drawerAt`→`drawer_at`,
`wallZone`→`wall_zone`, and derives `status`, `pinned_desk`, `pinned_wall`, `expires_at`,
`last_checked_at`, `last_changed_at`. Interests move from `{w, kind: CHOSE|GUESSED, muted}` to the
spec's `{weight, kind: explicit|inferred, paused, label, source, recency}`. Added `archiveExpired()`
(past-deadline saved items go to the drawer, never deleted) and `resumeTopic()`. Call sites updated in
desk, feed, jobs, hacks, options.

**4. Desk is home.** `HOME = 'desk'` in `main.js`. Boot, the unknown-route fallback and Esc all land on
the Desk; the Computer is a monitor on it. `archiveExpired()` runs at boot and toasts what moved.

**5. Build, verify, CI.** `tools/build.mjs` (dist + reference and JSON validation), `tools/verify.mjs`
(the five checks + table), `tools/serve.mjs` (dependency-free static server for `npm run dev`).
Workflows: `verify.yml` on every push, `pages.yml` (verify then deploy `dist/` to Pages),
`scrape.yml` (01:30 UTC daily + `workflow_dispatch`, commits `data/` only if it changed).
`scrapers/run.mjs` is an honest no-op placeholder until phase 9.

### Checks

```
 build       pass
 typecheck   pass
 lint        pass
 test        pass        37 tests, 2 files
 audit       pass        18 modules, 7 stylesheets
```

### Browser verification

Served with `npm run dev`, driven in a real browser.

- Fresh install: database opens at **version 2** with all ten stores
  (`apps, goals, items, meta, notes, personal, plans, refresh, wallpins, weights`).
- Boot sequence INSERT COIN → PRESS START lands on `#/desk`, title `Desk — Career Arcade`.
- **Migration proved against a real v1 database**, not just a unit test: seeded a genuine version-1
  database with v1-shaped records, then let the app open it. `legacy1` came back as
  `state SAVED, status saved, saved_at 1700000000000, desk_position {x:12,y:40,rot:0},
  strings ['legacy2'], expires_at 1935705600000, pinned_desk true`, old camelCase keys gone,
  snapshot title intact. `legacy2` → `status archived`, 12 drawer days left. `python` → explicit /
  weight 1 / not paused; `ml` → inferred / 0.42 / paused. The Desk drew the migrated card and the
  drawer read `DRAWER (1)`.
- All 11 routes visited (feed, jobs, hacks, news, more, notes, cal, apps, opts, desk, wall):
  every one rendered, **zero console errors, zero unhandled rejections**.
- Options → INTEREST PROFILE listed the migrated interests as `python EXPLICIT PAUSE FORGET` and
  `ml INFERRED RESUME FORGET`.
- Screenshot description: dark `#0F0F1B` cabinet, cyan `CAREER ARCADE` header in Press Start 2P, chunky
  bevelled tabs, the Desk's wood-grain world with hard-edged shadows. No rounded corners, no gradient,
  no blur anywhere — the audit's forbidden-CSS sweep enforces this mechanically.
- Test data deleted after the run.

### Deviations from the spec, for the record

1. **Stack** — vanilla instead of React/Tailwind/Framer/Howler. Reasons above. User approved.
2. **`H` key** — the spec wants `H` = home. `H` is already `HACKS` in the shipped keybar, so `D` opens
   the Desk and `Esc` goes home. Flagging rather than silently breaking a documented key.
3. **Item field names** — the device-side record uses the spec's snake_case. The scraped public rows
   keep the camelCase `data/*.json` contract from UI Spec v2 §17.1, because the scrapers and the
   committed data files are written against it. `model.js` documents both sides.

### Open, not blocking

- Calendar prints `1630 DAYS` for a far-off deadline. Correct, ugly. Phase 4 owns Calendar.
- Still to settle with the user: desktop-only vs a real Android PWA layout (the README currently
  states there is no portrait or touch layout); scraper target sites; GitHub remote for CI.

---

## 2026-11-18 — Phase 1, Computer shell + Feed

**Starting point.** An audit of the existing Feed against the phase's acceptance criteria found most of
it already built: the alignment slider (click and arrow keys), the FOR ME / ALL toggle with sorting,
WHY THIS unfolding inline, SAVE / MORE / LESS / MUTE on every card, and a STAGE CLEAR end state. The
work was the three things that were genuinely missing, plus one real bug the audit turned up.

### Tasks

**1. The cabinet is real now.** `.cabinet` was a bare centred box. It now paints a wood grain (a crisp
SVG tile, not a gradient) with the screen set into a dark recess, a coin slot on one bezel corner and a
joystick on the other. The bezel is `FRAME_U = 6` u on each side and comes out of the **canvas**, never
out of **u**: `metrics()` takes a `frame` argument, subtracts `2 × frame` from the canvas in u, and
reports `frame` back so the CSS paints exactly that. Toggling it does not move a single glyph, which a
test asserts directly. A window below the 900 × 560 minimum gets no bezel at all, so the layout still
holds at the edge.

**2. Fullscreen.** A `FULL` button in the top bar and `shift+F`. It requests real browser fullscreen and
drops the bezel; if the browser refuses the request, the bezel still goes, so the control always does
something visible. `fullscreenchange` brings the cabinet back when the user leaves fullscreen by any
other route. `F` alone stays FEED.

**3. Main menu.** New `src/pages/menu.js` + `src/menu.css`: the eight Computer pages as a two-column
grid, each with a number, a hand-drawn 14×14 pixel mark, a label and one line saying what the page is
for, plus an honest state line (`25 ITEMS LOADED · 0 ON THE DESK`, and a `DUE WITHIN 7 DAYS` count only
when there is one). Keys 1–8 open the pages. Clicking the Desk's monitor now opens the menu instead of
jumping straight to the Feed, which is what "sitting down at the Computer" should do, and it reconciles
the spec's two halves: the Desk is the room's home, the menu is the Computer's front screen.

**4. Bug fixed: MUTE lied.** On a card, `MUTE → SOURCE` and `MUTE → PLACE` toasted "MUTED …" and then
did nothing at all; only `TOPIC` was wired up. The app was claiming an action it had not taken. Added
`muteList`/`unmuteList`/`applyMutes` to the store, backed by `mutedSources` and `mutedPlaces` in
settings. The feed now filters both views through `applyMutes`, the card redraws immediately so the
muted rows actually leave, the toast says `UNDO IN OPTIONS`, and Options → INTEREST PROFILE lists every
muted source and place with an UNMUTE button. A second bug surfaced while testing that: Options
returned early when the interest list was empty, so the muted lists never rendered. Fixed.

### Checks

```
 build       pass
 typecheck   pass
 lint        pass
 test        pass        57 tests, 4 files (+20 this phase: u.test.js, mute.test.js)
 audit       pass        19 modules, 8 stylesheets
```

The audit earned its keep twice this phase: it caught `.menu` used in JS but never defined in CSS, and
it is what forces every new stylesheet to be linked from `index.html`.

### Browser verification, at 1280×800

Every acceptance criterion, checked by driving the real page.

- **Alignment slider changes order in real time.** BALANCED gave
  `seed-007, seed-001, seed-014, seed-018, …`; one ArrowRight to BROADER gave
  `seed-007, seed-001, seed-014, seed-004, …`. Different order, same frame, label updated.
- **All four card interactions.** SAVE wrote `state SAVED, pinned_desk true, snapshot true`. MORE
  raised the `dsa` weight 0.35 → 0.60. LESS removed the card from the drop. MUTE opened a row offering
  `TOPIC DSA / SOURCE SEED / PLACE RAJKOT`.
- **The mute fix, end to end.** Muting PLACE RAJKOT stored `mutedPlaces: ['rajkot']`, and the ALL view
  then showed 20 cards with **zero** mentioning Rajkot. Options listed `rajkot UNMUTE`; clicking it
  emptied the list.
- **WHY THIS** unfolds inline on the card. `aria-expanded` flips to true and **zero** dialogs or modals
  open, which is the "no nested modals" rule holding.
- **STAGE CLEAR** reads `STAGE CLEAR! · Back tomorrow. 3 close within 3 days, 8 in Gujarat. · NO LOAD
  MORE HERE. THE DROP ENDS ON PURPOSE.` with KEEP BROWSING and GO TO DESK. The counts are computed from
  the drop, so a drop with neither says neither.
- **Fullscreen.** `--frame 6 → 0`, canvas `308 → 320` u (the bezel handed back to the screen),
  `--u` **unchanged at 4px**, bezel art `display: none`, button label `FULL → WINDOW`, and all of it
  restored on the second press.
- **Main menu.** Eight cells over four rows of two; key `1` routed to `#/feed`.
- **All 12 routes** (menu, feed, jobs, hacks, news, more, notes, cal, apps, opts, desk, wall) rendered
  with **zero console errors and zero unhandled rejections**.
- **Anti-slop sweep, mechanical.** Walked every element in the live DOM reading computed styles for a
  non-zero `border-radius`, any `gradient` in `background-image`, or `blur` in `filter`,
  `backdrop-filter`, `box-shadow` or `text-shadow`. **0 violations.**
- Screenshot: wood-grain cabinet framing the screen on all four sides, cyan `MAIN MENU` in Press Start
  2P with its hard pixel halo, the state line beneath it, then eight bevelled cells in two columns,
  each with a cyan number, a pixel mark and two lines of text. Keybar pinned at the bottom. Hard edges
  throughout.
- Test data deleted and the dev server stopped after the run.

### Deviation added this phase

4. **`shift+F` for fullscreen**, not `F`. `F` is FEED in the shipped keybar, same reasoning as `H`.
   The bezel prints `[SHIFT+F] FULL` so the real key is never a guess.
