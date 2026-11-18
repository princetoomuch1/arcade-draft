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

---

## 2026-11-18 — Phase 2, Jobs + Applications

**Starting point.** Jobs was already built: four class tabs, the MUST/NICE filter model, the MAT/GAP/UNK
fit snapshot, and a VS compare screen. Applications was the thin stage-5 table. The real finding was
that **three incompatible record shapes were being written to the same `apps` store** — one by Jobs
(`{id: <item id>, item, label}`), one by the Applications page (`{itemId, status, appliedOn}`), and a
third defined in `model.js` that nothing used.

### Tasks

**1. One shape, and a migration to it.** Database version 3. `migrateApplication()` converts both
legacy shapes to the model's `Application`. The Jobs shape was keyed by the *item* id, so migrating it
changes the primary key; `rewrite()` now re-keys (delete + put) instead of calling `cursor.update()`,
which refuses to move a record.

**2. Trust is now enforced in the store, not in the UI.** `logApplication()` accepts only `manual` or
`external` and silently downgrades anything else, so no code path can mark an application
`platform`-confirmed. `TRUST_WORDS` carries the plain-language meaning into tooltips. `setStage()`
appends to the date history and never touches trust.

**3. "Ghosted" is derived, not declared.** The old GHOSTED status was a stage someone had to choose.
`daysSilent()` computes it from the last real date instead, and returns null once there is an answer.
Migrated GHOSTED rows become `applied` with a note saying so, so nothing is lost silently.

**4. Applications rewritten as a save-file screen.** One slot per application: procedural company
sprite, trust label, a stage rail showing all six stages with the reached ones filled, the real date
history, next action + date, materials toggles, notes, and an OPEN/ALL/CLOSED filter. A standing line
at the top: `NOTHING HERE APPLIES FOR YOU, AND NOTHING IS SENT FROM THIS APP.`

**5. Jobs writes through the store helpers.** TRACK, the did-you-apply prompt and TRACK BOTH all call
`logApplication`. Their toasts now say what is and is not known: `TRACKING AS MANUAL — NOTHING WAS
SENT`, `LOGGED AS EXTERNAL — WE CANNOT CONFIRM IT ARRIVED`.

**6. Seed data.** No seed job had undisclosed pay, so the `ESTIMATED` label was unreachable and
therefore untestable. Gave `seed-016` `pay: {disclosed: false}`. Also changed payTag's missing case
from `MISSING` to `NOT STATED`, matching every other row in the compare table.

### Checks

```
 build       pass
 typecheck   pass
 lint        pass
 test        pass        91 tests, 6 files (+17 this phase: apps.test.js)
 audit       pass        20 modules, 9 stylesheets
```

### Browser verification

- **Migration proved against a real v2 database** holding both legacy shapes. Database came back at
  version 3. The Jobs-shaped record re-keyed `seed-003` → `a-seed-003` keeping `item_id: seed-003`,
  stage `applied`, trust `external`. The page-shaped record kept its notes (`spoke to Priya`) and
  stage `interview`. The GHOSTED one became `applied` with the explanation in its notes.
- **Stage rail.** Advancing Backend Intern to SCREEN gave history `APPLIED 1 SEPT 2026 | SCREEN 18 NOV
  2026`, dates `['applied','screen']`, and **trust stayed `external`**.
- **No reply is derived.** Tally read `APPLIED 2 | INTERVIEW 1 | NO REPLY 14D+ 3`, computed from dates.
- **Materials** toggle persisted (`['CV']`).
- **Nothing claims delivery.** A regex sweep for "received / delivered / sent to / employer has" over
  the rendered page found nothing, and `PLATFORM` appears nowhere in the UI.
- **Filters narrow correctly, as designed.** My first test wrongly expected NICE to hide. It does not,
  by design. With MODE=REMOTE on the MAINSTREAM tab (all three listings are `in_person`): NICE kept 3,
  switching to MUST showed 0 and reported `3 HIDDEN`, adding ONSITE restored 3, RESET restored 3.
- **Compare** showed all nine rows, each value tagged, and all three tags now reachable:
  `DISCLOSED, ESTIMATED, MISSING`. Footer: "No winner, no total, no crown."
- Zero console errors throughout. Test data deleted, dev server stopped.

### Deviation added this phase

5. **Stages are the spec's five plus `planned`.** `ghosted` is deliberately not a stage: it is an
   absence, so it is computed from the dates rather than being something anyone declares.

---

## 2026-11-18 — Phase 3, Hackathons + News

**Starting point.** Hacks had the CITY/STATE/COUNTRY/WORLD switch, the radar and graticule maps, the
online lane and ADD TO QUESTS. News had the ticker, clippings, AI summary beside the original, the
source stack and hot topics. Missing: facets, the event brief, PARTY UP. Plus one false claim in News.

### Tasks

**1. Facets, in the store so they are testable without a browser.** `facetValue()`, `commitmentBand()`
and `applyFacets()` in `store.js`. The rule that shaped the whole design: **an absent facet is never a
match and never a miss.** "The organiser did not say" is its own answer, so those rows are kept by
default and a `KEEPING / HIDING "NOT STATED"` toggle makes the choice yours rather than ours. The facet
bar shows MODE, BEGINNER, LENGTH and FOCUS (focus options read from the data), each chip carrying a
live count, plus `CLEAR (n HIDDEN)` so the cost of a filter is always on screen.

**2. Event brief.** Format, beginners, length, team size, eligibility, submission and judging. Each
line is the listing's value or a greyed `NOT STATED` with the tooltip "The listing does not say. This
app will not guess it." Milestones render as a dated track with past ones dimmed.

**3. PARTY UP, consent-based by construction.** Off until you open it, per event, stored on this
machine. There is no server, so it cannot send anything even by accident: it builds a blurb you copy
and post yourself, wherever you choose. FORGET THIS deletes it. The panel says all of that in the
first line rather than burying it.

**4. Seed data.** Added the facet fields to six hackathon rows and milestones to every dated one, and
deliberately left some rows without facets so that the "not stated" path is exercised by real data
rather than only by unit tests.

**5. Bug fixed: REPORT lied.** News' report-outdated form toasted `NOTED LOCALLY` and then threw the
input away. Same class of bug as Phase 1's mute. It now writes the reason and note to the store, the
clipping carries `YOU REPORTED THIS AS <reason> — SAVED HERE, SENT NOWHERE` with an UNDO, the button
reads REPORTED, and it survives a re-render.

**6. Bug fixed in the audit itself.** Its class-extraction regex for `el('tag','class')` was unanchored,
so `del('meta', 'party-' + id)` matched as `el(` and invented a `.party-` class. Added a boundary.
The audit was wrong, not the code — worth recording, because a checker that cries wolf gets ignored.

**7. Stale counts.** The level switch counts come from the filtered pool but were only rebuilt on a
level change, so they went stale when a facet changed. `buildSwitch()` now runs on every facet change.

### Checks

```
 build       pass
 typecheck   pass
 lint        pass
 test        pass        88 tests, 6 files (+14 this phase: facets.test.js)
 audit       pass        20 modules, 10 stylesheets
```

### Browser verification

- **View toggle** works: CITY 2 / STATE 6 / COUNTRY 9 / WORLD 9, counts from the filtered pool.
- **Facets narrow correctly.** ONLINE → `CLEAR (9 HIDDEN)` of 11. BEGINNER=FRIENDLY keeping unstated
  → 2 hidden (only the two explicit "not friendly" rows go). Switching to `HIDING "NOT STATED"` →
  8 hidden, because only three rows actually say they are beginner friendly. CLEAR restored everything.
  That difference between 2 and 8 is the whole point of the rule, and it is visible on screen.
- **Event brief** rendered in full for a faceted row: `FORMAT IN PERSON · BEGINNERS FRIENDLY ·
  LENGTH 48 HOURS · TEAM SIZE UP TO 4 · ELIGIBILITY … · SUBMISSION … · JUDGING …`, then
  `MILESTONES: REGISTRATION CLOSES 22 NOV · EVENT STARTS 29 NOV · SUBMISSIONS CLOSE 1 DEC`.
- **PARTY UP is consent-based.** The form is absent until opened. Filling it and pressing BUILD IT
  produced `Looking for teammates for Rajkot Civic Tech Build 48. I bring backend, python. Looking for
  design. Time zone Asia/Calcutta. Beginners welcome. https://seed.local/h/1` and stored exactly that
  under `party-seed-001`. FORGET THIS removed it.
- **Ticker** moves, **pauses on hover**, and resumes on leave. Hot topics render under
  `POPULAR THIS WEEK (NOT PERSONAL)`.
- **Report-outdated** opens a form with WRONG SUMMARY / DEAD LINK / DUPLICATE MISSED / NOT NEWS, and
  now actually saves: `{reason: 'DEAD LINK', note: '404 since yesterday'}` under `report-seed-019`,
  with the badge surviving a navigation away and back, and UNDO clearing it.
- All 12 routes rendered with **zero console errors**. Computed-style anti-slop sweep: **0 violations**.
- Test data deleted, dev server stopped.

---

## 2026-11-18 — Phase 4, Notes + Calendar

Both pages were the thin stage-5 versions. Both rewritten, and the logic that matters moved into
`store.js` as pure functions so the rules are tested rather than hoped for.

### Notes

**Quick capture is one action.** Type a thought, paste a link, attach an image or record a voice
memo, then CAPTURE. A bare URL becomes a link note automatically (titled by host and path, tagged
`link`, with the URL kept as an attachment so it stays openable). Images are run through the existing
`ditherTo16` so a photo joins the 16-colour world instead of sitting on top of it. Voice uses
MediaRecorder and, when the browser refuses the microphone, says `MICROPHONE REFUSED — NOTHING WAS
RECORDED` rather than failing quietly.

**Related suggestions always say why, and never link anything by themselves.** `relatedNotes()`
ranks: a shared tag ("same tag: rust"), then a wiki link in either direction ("you wrote its name in
this note" / "it names this note"), then two or more shared words ("both mention canary and
kubernetes"). Each suggestion carries a LINK THESE button; only that writes `related_ids`. Weak
matches produce nothing rather than a guess.

**CRAFT** is the synthesis page: question, evidence, decision, outcome, next learning. Unfilled
sections read `not filled in` instead of being hidden, and COPY AS TEXT exports it.

**Store v4** migrates the stage-5 note (`body` → `body_md`, plus the fields the model expects).

### Calendar

**Three dates, never confused.** OFFICIAL comes from the source and is rendered as locked text, not
an input, with the tooltip "This is the source's date. This app does not edit it." START BY and
CHECKPOINTS are inputs, and are yours. A start-by later than the official date is flagged in red
rather than silently accepted. The legend states the distinction at the top of the page.

**Reminders are honest about what they can do.** There is no server and no push, so the panel says
`THESE SHOW INSIDE THIS APP WHILE IT IS OPEN. THERE IS NO SERVER, SO NOTHING IS PUSHED TO YOUR PHONE
AND NO EMAIL IS SENT.` `dueReminders()` is pure and enforces, in order: the global OFF switch, quiet
hours (which may wrap midnight), per-reminder snooze, and the lead time. Your start-by date takes
precedence over the official one when you have set one.

**Recurrence is only claimed when the data shows it.** `recurrence()` needs two or more consecutive
years of the same event, matched on the title with years and version numbers stripped, landing in the
same month give or take one. One sighting reports nothing. It never infers a pattern from the title.

### Checks

```
 build       pass
 typecheck   pass
 lint        pass
 test        pass        117 tests, 7 files (+29 this phase: notes.test.js)
 audit       pass        20 modules, 11 stylesheets
```

### Browser verification

- **Store v4 migration** against a real v3 database: both stage-5 notes came back with `body_md` set,
  the old `body` key gone, and empty `tags`/`attachments` arrays.
- **Quick capture** saved plain text and, separately, turned `https://example.test/some/page` into a
  note titled `example.test/some/page`, tagged `link`, with a `link` attachment.
- **Related suggestions** on the Rust note read
  `IT NAMES THIS NOTE` and `YOU WROTE ITS NAME IN THIS NOTE`, with `related_ids` still **empty** until
  LINK THESE was pressed — then exactly one link, shown as LINKED with an UNLINK button.
- **Backlinks** listed both notes that name Rust.
- **CRAFT** saved two of five sections and rendered the other three as `not filled in`.
- **Calendar dates**: `OFFICIAL 22 NOV LOCKED` is text with no input; START BY is a date input.
  Setting it wrote `start_by` while `official_deadline` stayed. A checkpoint saved as
  `{text: 'draft the idea', done: false}`.
- **Reminder rules, each proved in the running app**: with the switch off,
  `OFF, SO NOTHING WILL FIRE.`; switched on, `1 DUE NOW.`; with quiet hours covering the current hour,
  `QUIET HOURS: HOLDING ANYTHING DUE.`; cleared, `1 DUE NOW.` again; after SNOOZE 1 DAY,
  `NOTHING DUE RIGHT NOW.`
- All 12 routes rendered with **zero console errors**. Anti-slop sweep over computed styles:
  **0 violations**. Test data deleted, dev server stopped.

---

## 2026-11-18 — Phases 5 and 6, the Desk and the Wall

The Desk and Wall existed from stage 4 but were generic: every saved thing looked the same, strings
were hand-tied only, shuffle was random, and the Wall could hold nothing but goals. The logic that
decides *what* happens moved into `store.js`; the pages only draw it.

### The Desk

**Saved things are now objects, not rows.** `paperFor()` maps type to kind and size: a hackathon is a
polaroid with a procedural mark in its window and a handwritten caption, a job an index card with a
teal spine and a corner clip, news a clipping with a seeded ragged edge, a scheme a torn sheet, a note
a yellow sticky. Drag bounds and string anchor points are computed from each card's own size.

**Red strings the desk ties for you.** `autoStrings()` proposes links and states the reason: same
organisation, shared skills, same city, or deadlines within three days, strongest reason winning. It
caps each card at three, and **your own strings claim the budget first**, so a guess can never crowd
out a link you made. Auto strings are drawn dashed and muted, yours stay red; the AUTO STRINGS button
turns the guesses off entirely.

**Shake has a bias and a point.** `shuffleLayout()` sends anything untouched for a week to the middle,
keeps your three most recent saves near the monitor, scatters the rest, and surfaces exactly one
forgotten card with a `REMEMBER THIS?` badge. Deterministic under an injected `rand`, so it is tested
rather than eyeballed.

**Crumple and bin.** The x on a card crumples it into the drawer over four stepped frames. The
drawer's DELETE FOREVER now routes through a bin that keeps the record in memory and turns the toolbar
button into UNDO BIN for 15 seconds. Destroying something is the only action here that asks twice and
then still offers a way back.

### The Wall

**All four ways in.** `+ TEXT`, `+ PHOTO` (dithered to the 16-colour palette on the way in),
`+ PIN FROM DESK`, and `+ GOAL`. Each pin carries a zone and an optional caption, and each has UNPIN.

**Zones were conflated, and that was a real bug.** The picker offered the content zones
(HACKS/JOBS/SCHEMES/NEWS) while the code set `MOTIVATION`, so every pin saved with `zone: ""` and
never rendered. Split into `AUTO_ZONES` (what the wall fills from what you saved) and `PIN_ZONES` (the
spec's MOTIVATION / GOALS / MEMORIES / PINNED FROM DESK / RANDOM, from `WALL_ZONES`). The picker now
offers only zones a pin can actually live in.

**Goals go gold.** Completing a checkpoint fires a stepped light burst and stamps `done_at`. All
checkpoints done turns the card gold permanently with `DONE — THIS STAYS HERE`, and it is never
un-earned.

**The journey box** counts days shown up, things saved, strings tied, goals hit and things pinned,
under the line `OUTCOMES, NOT HOURS. NOTHING HERE COUNTS TIME SPENT.`

**Turning round.** Desk and Wall are two walls of one room, so moving between them pans sideways in
stepped frames instead of using the page wipe. Every other route still wipes.

### Checks

```
 build       pass
 typecheck   pass
 lint        pass
 test        pass        135 tests, 8 files (+18 this phase: desk.test.js)
 audit       pass        20 modules, 11 stylesheets
```

### Browser verification

- **Four paper kinds** on one desk (`k-polaroid, k-card, k-clipping, k-torn`), the polaroid carrying
  its sprite and the clipping its ragged edge.
- **Auto strings** drew with real reasons: `BOTH NEED NODE`, `BOTH IN RAJKOT`,
  `DEADLINES WITHIN 3 DAYS OF EACH OTHER`. AUTO STRINGS off took them to 0 and left yours.
- **Crumple** moved a card to `DRAWER (1)`; 5 cards became 4.
- **Bin and undo**: DELETE FOREVER took records 5 → 4 and the toolbar read `UNDO BIN`; pressing it
  restored 5.
- **Shake** moved every card, and with two records aged past a week exactly **one** card came back
  marked `REMEMBER THIS?`.
- **Wall pins** saved with real zones (`text → MOTIVATION`, `item_ref → PINNED FROM DESK`) and
  rendered with their captions; UNPIN removed one.
- **Gold goal**: both checkpoints done gave `goal is-gold`, `gold: true` stored, the tag shown, and
  every checkpoint carrying a `done_at`.
- **Journey box** read `DAYS SHOWN UP 1 · THINGS SAVED 4 · STRINGS TIED 0 · GOALS HIT 1 · PINNED HERE 1`.
- **Turn-around** emitted `out-l, in-l, out-r, in-r` moving between Desk and Wall, and **no** turn
  frames when leaving the room for the Feed.
- All 12 routes clean, **zero console errors**, anti-slop sweep **0 violations**.
- Test data deleted, viewport reset, dev server stopped.

### Deviation added this phase

6. **No rotated paper.** The spec asks for slightly rotated, hand-placed items; the pixel law forbids
   `transform: rotate()` on live DOM because it resamples and blurs the art. Resolved in favour of the
   pixel law: each kind differs by shape, fill, edge and spine instead, so the desk still reads as
   hand-placed objects without a single blurred pixel.

---

## 2026-11-18 — Phase 7, shared logic

Five things that had been done differently on each page, or not at all, are now done once.

**1. One freshness receipt.** New `src/receipt.js`, used by Jobs and Hacks (News keeps its own clipping
header, which carries the same three dates). It separates three things that are easy to conflate:
REPORTED, LAST CHECKED and LAST CHANGED. A row confirmed an hour ago but unchanged for a month is not
a fresh row, and it now says `LAST CHANGED: NOT SINCE IT WAS FOUND`. A date the source never gave
reads `NEVER` rather than today's date. A coloured dot grades it fresh / aging / stale by when it was
last *confirmed*, not when it was written, and REPORT OUTDATED is part of the component, so every page
offers it with the same five reasons and actually saves.

**2. Duplicate clustering is shared and reversible.** `clusterItems()` groups rows by cluster id and
leads with the one seen **first** — the original report, not whoever copied it loudest. UNCLUSTER
splits a group into separate clippings and RECLUSTER puts it back; the choice is stored, so it
survives a reload. News now uses this instead of its own private grouping.

**3. Interest inspector.** The two kinds of interest are now visibly separate: `YOU CHOSE THESE` and
`WORKED OUT FROM WHAT YOU DID`, with a line saying only the second decays (3% a day) and only the
second can be reset. Per interest: REDUCE (halves it, because turning something down is not silencing
it), PAUSE/RESUME, REMOVE. RESET ALL GUESSES clears every inferred interest and leaves what you typed
untouched.

**4. REFRESH ALL, honest on both paths.** Scraping runs in GitHub Actions, never in the browser. With
a repository and token set, the button asks the workflow to run and reports exactly what GitHub said;
without them it says so and shows `npm run scrape` to run yourself. A 403 reports that the token needs
`actions:write` rather than claiming success. The token field is a password input, and the panel warns
in orange that it is stored unencrypted in this browser, should carry the narrowest scope, and should
be revoked on a shared machine.

**5. Auto-expiry** was already wired in Phase 0 (`archiveExpired()` at boot); re-verified here.

### Checks

```
 build       pass
 typecheck   pass
 lint        pass
 test        pass        155 tests, 9 files (+20 this phase: shared.test.js)
 audit       pass        21 modules, 11 stylesheets
```

### Browser verification

- **Receipt** on a job read `CHECKED TODAY · REPORTED 16H AGO · LAST CHECKED 2H AGO · LAST CHANGED NOT
  SINCE IT WAS FOUND · SOURCE SEED · EXPIRES IN 18 DAYS`, dot `r-fresh`. The same component rendered on
  Hacks. REPORT OUTDATED saved `DEAD LINK` and the button became REPORTED.
- **Clusters**: `+1 SOURCES` with UNCLUSTER took the page 4 → 5 clippings; RECLUSTER took it back to 4.
- **Interests**: both groups rendered; REDUCE took python 0.60 → 0.30, still counting, not silenced;
  RESET ALL GUESSES left exactly `rust (explicit)` behind.
- **Refresh with no token**: state and button both say `NO REPOSITORY AND TOKEN SET. RUN THIS
  YOURSELF:` with `npm run scrape`, and pressing it changes nothing else. Setting a repository and a
  placeholder token flipped the plan to `dispatch` with
  `gh workflow run scrape.yml --repo me/arcade`. No request was made to GitHub, and the placeholder
  was cleared afterwards. The token input is `type=password`.
- **Expiry**: a saved item with a past deadline moved to `state DRAWER, status archived` with its
  snapshot intact, and was restorable.
- All 12 routes clean, **zero console errors**, anti-slop sweep **0 violations**. Test data deleted.

### Note on the token

Nothing in this session ever held a real GitHub token: the dispatch path was proved with an injected
fetch in the unit tests and with a placeholder string in the browser. Supplying a real one is the
user's to do, in Options.

---

## 2026-11-18 — Phase 8, ethical engagement

The point of this phase is a set of things the app refuses to do, so the main deliverable is the
thing that *enforces* them rather than the feature that follows them.

**1. The copy audit is now part of `npm run verify`.** `tools/audit.mjs` scans every module and
`index.html` for phrases that work by making the reader anxious: loss framing (`don't lose`,
`lose your`, `streak`), manufactured urgency (`hurry`, `act now`, `last chance`), manufactured
scarcity (`only N left`, `before it's gone`), time as a reward (`time spent`, `minutes today`) and
the endless feed (`load more`). Two decisions worth recording:

- It audits **only what a reader can see**. Comments are blanked out first (blanked, not removed, so
  line numbers still point at the real line), because a comment should be free to name a rule in
  order to explain it. My first version flagged three of my own comments, which is exactly the
  failure mode that teaches people to ignore a checker.
- It targets the manipulation, not the subject. A real deadline from a source is a fact and is still
  said plainly: `EXPIRES IN 12 DAYS`, `EXPIRING SOON`. Only two UI strings are exempt, both of which
  state the rule itself: `NOTHING HERE COUNTS TIME SPENT` and `No load more here`.

**Proved it bites**, rather than trusting a clean run: appending
`const _bad = "Do not lose your streak - hurry, last chance!"` to `wall.js` produced four failures
across three patterns on one line. Removed again, audit clean.

**2. Weekly quest.** One modest outcome a week, in your words, on the Wall. Finishing it is a single
checkbox.

**3. Cadence that cannot shame you.** `cadence()` reports weeks on record, outcomes reached and weeks
rested. There is deliberately **no streak field of any kind** — a test asserts the serialised object
contains no such word — because a run you could break is the thing being avoided. A rest week is
recorded and reads `A REST WEEK. RECORDED, AND IT COUNTS AS BEING HERE.`, and the summary line becomes
`2 reached, 1 rested. Both are weeks you were here.` Weeks you never opened are simply absent, never
counted against you.

**4. Milestone and reflection cards.** Milestones appear only for things that happened, including
`YOU RESTED — And came back. That is part of it.` Each week takes an optional reflection.

**5. Progress snapshot, outcomes only.** `progressSnapshot()` counts things saved, applications you
sent, conversations reached, offers, goals finished, notes written and weeks reflected on. It carries
an explicit `measuresTime: false`, and a test asserts no label contains time, minute, hour, session,
visit or day. It is private by construction: computed locally, never sent.

**6. Co-op challenge, opt in, nobody ranked.** You and someone else agree a target and each count
your own. There is no server, so there is no table and no way to see anyone else's number — the panel
says exactly that. A test asserts the stored object contains no rank, score, leader or position.

### Checks

```
 build       pass
 typecheck   pass
 lint        pass
 test        pass        172 tests, 10 files (+17 this phase: engagement.test.js)
 audit       pass        20 modules, 11 stylesheets, copy audit included
```

### Browser verification

- Setting a quest and finishing it stored
  `{id: '2026-W47', quest: 'apply to two internships', done: true}` and the cadence line read
  `1 REACHED OUT OF 1 ON RECORD.` A `FIRST OUTCOME` milestone card appeared.
- **Pausing erases nothing**: with an earlier finished week on record, switching this week to rest
  left `2026-W46 {done: true, quest: 'read two papers'}` intact and the line became
  `2 REACHED, 1 RESTED. BOTH ARE WEEKS YOU WERE HERE.`
- A reflection saved and persisted.
- The co-op challenge started, counted `1 OF 3 · WITH RIYA`, and the panel body (excluding its own
  disclaimer) contains no ranking words and shows only your own number.
- **Progress snapshot** rendered `THINGS SAVED · APPLICATIONS SENT BY YOU · CONVERSATIONS REACHED ·
  OFFERS · GOALS FINISHED · NOTES WRITTEN · WEEKS REFLECTED ON`, with no time measure anywhere.
- **Copy audit over the live DOM**, not just the source: walked all 12 routes applying the same
  banned patterns to rendered text. **0 violations.**
- 12 routes clean, **zero console errors**, anti-slop sweep **0 violations**. Test data deleted.

---

## 2026-11-18 — Phase 9, scrapers

**Shipped with zero sites configured, deliberately.** `scrapers/sources.json` holds an empty
`sources` array and a README block on what to check before adding one. `npm run scrape` prints that
nothing is configured and exits 0. Choosing which sites to read needs their robots.txt and terms
read first, which is the user's call — so the pipeline is complete and the targets are not guessed.

### What is built

**`lib/robots.mjs` — the gate every request passes.** Parses robots.txt properly: a named group
beats `*`, longest match wins, `Allow` beats `Disallow` at equal length, `*` and `$` patterns, and
`Crawl-delay`. The rule that matters: **a site whose robots.txt cannot be read is refused**, not
assumed fine. A 404 is the one case the standard says means no restrictions. Non-http protocols are
refused outright.

**`lib/http.mjs` — polite by construction.** One request at a time per host, a floor of one second
between them, the site's own `Crawl-delay` honoured when it asks for more, conditional requests via
ETag and Last-Modified so an unchanged page costs the site almost nothing, and capped backoff on 429
and 5xx rather than retrying forever. The client identifier names the tool only and carries **no
personal information**; a test asserts it contains no address and no account name.

**`lib/parse.mjs` — feeds and JSON only.** There is deliberately **no HTML scraper**. Reading markup
breaks constantly, strains the site, and is the part most likely to fall foul of terms of use. If a
source offers neither feed nor API, that is worth knowing before writing anything against it.

**`lib/contract.mjs` — nothing reaches `data/` without passing it.** A row with no title, no URL, a
type outside the six, a non-http URL, or a source that cannot name itself is rejected with a stated
reason rather than filled in. Dates that do not parse become `null`, never `Invalid Date`. Facets are
carried only when the source actually gave them. `mergeItems()` never moves `firstSeen`, moves
`lastChanged` only when a meaningful field moved, and keeps a vanished row at its real `lastSeen` for
the app's own expiry rules to handle, rather than pretending it is fresh.

**`run.mjs`** orchestrates, writes `data/*.json` and `data/refresh-log.json`, and steps real rows
over the `_mock` seed rows once they arrive.

### Checks

```
 build       pass
 typecheck   pass
 lint        pass
 test        pass        209 tests, 11 files (+37 this phase: scrapers.test.js)
 audit       pass
```

`npm run scrape` runs and reports that no sources are configured.

### A test I had wrong

I asserted `clusterKey('HackRajkot')` should equal `clusterKey('Hack Rajkot')`. It does not, because
the key never splits a run-together word. The code is right and the test was wrong: a missed
duplicate shows the same thing twice, a small annoyance, while a wrong merge hides a real
opportunity. Rewrote the test to assert the conservative behaviour, with a comment saying why.

---

## 2026-11-18 — Phase 10, PWA and polish

### PWA

`manifest.webmanifest` (standalone, landscape, three icons including a maskable one) and `sw.js`.
Icons are generated from a 16×16 pixel grid by a small PNG encoder in the scratchpad, so the art
scales by whole numbers and stays on the grid: no image dependency, no blurry upscale.

**The service worker's split is the honest part.** The shell is cache-first, because it only changes
on deploy. The **data files are network-first**, because a cached opportunity is a dated one: if the
network answers we take it, and if it does not we fall back to cache, where the app's own freshness
receipt then shows the real LAST CHECKED date rather than hiding the gap. Offline with nothing cached
returns an empty payload marked `offline: true` rather than a broken page. Nothing personal passes
through it — notes, applications and the wall live in IndexedDB and are never fetched.

### Accessibility

- A skip link, and a polite `aria-live` region that announces every page change and every toast.
- Page changes move focus to the page itself, so keyboard users land on the new content.
- Focus is a hard 2u gold outline everywhere, since the pixel law bans soft rings.
- **High contrast** mode lifts the greys, drops the dither and the scanlines, and keeps colour
  meaning intact. **Reduced motion** is honoured from the system *and* from Options.

### Onboarding

A one-time room tour naming the three places and the two promises (nothing is uploaded, nothing
applies on your behalf). Dismissed by click, Enter, Space or Escape, remembered, never shown again.

### Checks

```
 build       pass
 typecheck   pass
 lint        pass
 test        pass        209 tests
 audit       pass        copy audit included
```

### Two real bugs found while testing, both fixed

1. **The tour never got focus.** `go()` returns before the page wipe finishes, so `mount()` focused
   `#page` *after* the dialog had focused its button. My first fix — a `focusin` guard that called
   `focus()` back — did not work either, because refocusing from inside a focus event is ignored by
   some browsers. The real fix is the right design anyway: `mount()` does not take focus when a
   dialog is open, and the guard now steps out of the event before refocusing. Verified:
   focus lands on `GOT IT`, and returns to `#page` on dismiss.
2. **The service worker served me stale code mid-test**, which is cache-first behaving exactly as
   written. Worth recording as a working note: after changing a shell file, the first reload may
   still run the old one. Clear the SW or bump `VERSION` in `sw.js`.

### Browser verification

- Manifest linked and parsed: standalone, 3 icons, one maskable, `start_url` `./`.
  `icons/icon-512.png` serves 200 `image/png`. Service worker reached `activated`, 36 shell files
  cached, data cache populated separately and both served from cache when asked.
- Tour shown once, focus correct, dismissed by Escape, remembered in `meta.toured`.
- High contrast set `data-contrast="high"` and `--muted` became `#D6D6E4`; reduced motion set
  `data-reduce="true"`.
- Across all 12 routes: **0 interactive elements unreachable by keyboard, 0 without an accessible
  name, 0 manipulative copy, 0 anti-slop violations, 0 console errors.**

### `sw.js` is not typechecked

It runs in `ServiceWorkerGlobalScope`, whose lib conflicts with the DOM lib the rest of the project
needs, and one TypeScript program cannot hold both. ESLint does check it with the service-worker
globals. Stated at the top of the file so the gap is visible rather than silent.

### Deviation: still desktop and tablet, not phone

The spec asks for an installable Android PWA. It is installable, and offline works, but the app keeps
its 900 × 560 minimum, so on a phone it still shows RESIZE THE WINDOW. A real phone layout means a
portrait layout set, touch targets and a touch gesture model — a sizeable piece of work that
contradicts the current design law, and not something to fake with a media query. Flagged for the
user rather than quietly half-done.

---

## 2026-11-18 — Desktop only, decided

A phone layout was built and then **removed at the user's request**: this is a desktop app, and that
is now a decision rather than a gap. The work is on `git stash` as *"phone layout (rejected: desktop
only)"* if it is ever wanted; nothing of it is in the tree.

What it had reached before it went, recorded because two of the findings are worth keeping:

- A phone layout set with a bottom bar of the three places, swipe between them, device shake, and
  the Desk as a list, since a drag-and-drop pin board on a 375 px screen is a worse list, not a
  smaller desk.
- **Finding 1, from a test:** a short side under 560 px is the wrong test for "is this a phone" — a
  1200 × 559 laptop window matched it. Narrow-when-upright or short-when-sideways is the right rule.
- **Finding 2, from the browser:** the app passes the user's *stored* density, so a phone kept
  CHUNKY and got u = 2 px with 36 px targets, under the 44 px thumb minimum. Two attempts to fix it
  by changing the phone density were both wrong: inflating u to make targets big left only 83u
  across, so 16u body text filled a quarter of the screen. The right split is more u across for the
  type scale, plus a published `--touch` (how many whole u make 44 CSS px at this u) for the targets,
  because the CSS cannot compute that and the u engine is the only thing allowed to.

Kept from the same stretch of work, because it is not phone-related:

**`tools/check-source.mjs`** — `npm run check-source -- <url> [type]`. It reads robots.txt, says
whether that exact path is permitted and what Crawl-delay is asked for, looks for a feed the
publisher advertises, and then either prints the `sources.json` entry to paste or refuses and says
why. It will not help with an HTML-only page, because there is no HTML scraper in this project.
It states plainly that it cannot read terms of use, which remains the user's job.

Proved against a local fixture server rather than by probing anyone's site: a permitted feed printed
the entry and reported the 2 s Crawl-delay; a disallowed path was refused with
`REFUSED — robots.txt disallows /blocked` and nothing beyond robots.txt was fetched; an HTML page
that advertises a feed was redirected to the feed.

---

## 2026-11-18 — Phase 11, completion artifacts

Most of Part A already existed under other names, so this was mostly reconciling. The four conflicts
were resolved as agreed.

**A6 snake_case: rejected.** The spec proposed `source_url`, `posted_at`, `last_checked_at`. The
schemas in `schemas/` describe the data as it actually is — camelCase (`url`, `firstSeen`,
`lastSeen`) — because nine pages and the scrapers already read those names and a schema should
describe reality, not a guess. `schemas/share.json` uses camelCase too, so there is one convention.

### Built

- **`schemas/`** — `feeditem.json`, `datafile.json`, `share.json`, draft-07.
- **`tools/validate-data.mjs`** — a hand-written validator (no ajv: zero runtime dependencies is the
  rule, and this must still work in five years) covering the draft-07 subset the schemas use, plus
  invariants a schema cannot state: duplicate ids across files, expiry before its own deadline,
  last-seen before first-seen, end before start, a row with no source host. **4 files, 25 rows, 25
  unique ids, valid.**
- **Copy audit extended** to the full banned list, with `tools/copy-audit.allowlist.txt` naming each
  exception and its reason. Proved it bites: four planted lines produced five failures across
  urgency, streak, nag-to-return and leaderboard.
  - `"Back tomorrow."` allowlisted as agreed — an ending, not a nag. `come back` stays banned.
  - `EXPIRES` allowlisted, guarded by **`tests/receipt.test.js`** (9 tests): the countdown must equal
    what the data says, there is no countdown when no date was given, a passed date reads
    `ALREADY PASSED`, and exactly one countdown appears per receipt.
- **Fixed while writing that guard:** the receipt said `IN 1 DAYS`. Now `TOMORROW OR SOONER`.
- **`src/undo.js`** — a 20-deep global undo stack, in memory only and deliberately not persisted: an
  undo still offered tomorrow is a promise this app cannot keep. Wired to crumple and bin, and to
  the `U` key anywhere in the app. 6 tests.
- **Retention and storage guard** in the store: `staleArchive()` offers anything past 90 days in the
  drawer but never sweeps it; `storageLevel()` warns at 50 MB and blocks writes at 80 MB with a
  message saying what to do; `activeCount()` flags the 5,000 cap and prunes nothing. 15 tests.
- **Import**, with preview — Options → DATA shows what a backup would do store by store (incoming,
  here, same, new) before writing, then offers MERGE or REPLACE, with REPLACE asking twice.
  Export → import round-trips notes, goals, applications, interests and settings losslessly.
- **`src/pages/credits.js`** at MORE → CREDITS: four OFL fonts, everything else generated in this
  repo, build tools with their licences, and a plain statement that personal data never leaves.
- **`docs/deploy.md`** — first deploy, updates, rollback, refreshing, backup, and the
  service-worker-cache gotcha. **README** gained backup, deploy, credits, retention and limitations.

### Checks

```
 build       pass
 typecheck   pass
 lint        pass
 test        pass        239 tests, 14 files
 audit       pass        22 modules, 11 stylesheets, copy audit included
 data        pass        4 files, 25 rows
```

### BLOCKED — Playwright will not run on this machine

`e2e/flows.spec.js` (11 critical flows) and `e2e/a11y.spec.js` (axe on all 13 routes plus a
keyboard-reach check) are written and committed. They do not run here.

`npx playwright test --list` **hangs with no output and no error**, and is killed by a timeout.
Three attempts, per the stop-and-ask rule:

1. Ran the suite — hung past ten minutes with nothing printed.
2. Ran a single test, then `--list` with stdout and stderr captured to files — both empty, `rc=124`.
3. Isolated it: the CLI itself works (`--version` prints 1.49.1, and a deliberately bad `--config`
   produces a proper error), but loading **our** `playwright.config.js` hangs. Suspicion is
   Playwright's config-reload path with an ESM config in a `"type": "module"` package on Windows,
   under a path containing spaces — unconfirmed.

**`e2e` is deliberately not in `tools/verify.mjs`**, with a comment saying why, so verify does not
hang. Everything else is green. Nothing claims the e2e suite passed, because it has not run.

Options for the next session: try a CommonJS config as `playwright.config.cts`; try running from a
path without spaces; or drop Playwright and cover the flows with jsdom in Vitest, which already runs.

---

## 2026-11-18 — Phase 11b, the Playwright blocker, solved

**Cause: loading an ESM spec file, not the config.** The CommonJS config alone did not fix it.
Evidence, in order:

1. `playwright.config.cjs` instead of `.js` — still hung. So the config format was not it.
2. A throwaway project in a path with no spaces — Playwright ran and errored **properly in under a
   second** (it could not resolve `@playwright/test` from a temp dir). So Playwright works here, and
   the path and the spaces were not it either.
3. Each spec listed on its own — **both** hung, so it was not `@axe-core/playwright`.

That left the one thing the two specs shared: ESM `.js` files inside a `"type": "module"` package,
loaded through Playwright's `esmLoaderHost`. Renaming them to `.cjs` with `require` skips that
loader. `--list` then returned instantly and the suite ran.

Both spec files carry a comment saying why they are CommonJS, so nobody "tidies" them back.

### Three real bugs the suite found on its first green run

1. **`axe: /#/feed` — serious, `aria-input-field-name`.** The alignment slider had
   `role="slider"` and no accessible name, so a screen reader could announce its value but never
   say what it was for. Given one.
2. **`axe: /#/wall` — critical, `label`.** The co-op challenge's number input had no label at all.
   Given one, and so were the other two inputs in that row while I was there.
3. **Undo was keyboard-only, and the key could be killed by sound.** `onKey` calls `audioInit()`
   first, and a browser that refuses an AudioContext (no gesture yet, autoplay policy, headless)
   threw before the key was ever read — so every shortcut died with the speaker. Wrapped in
   try/catch: sound is a nicety, the keyboard is not.
   The deeper miss was mine: A9 asked for *"toast with Undo for 6s"* and I had built the stack but
   only bound it to `U`. An undo offered solely as a shortcut is an undo most people never find.
   The toast now carries an UNDO button and stays 6 seconds when it does.

### Checks

```
 build       pass
 typecheck   pass
 lint        pass
 test        pass        242 tests, 14 files
 audit       pass        22 modules, 11 stylesheets
 data        pass        4 files, 25 rows
 e2e         pass        25 tests - 11 flows, 13 axe routes, 1 keyboard sweep
```

`e2e` is back in `tools/verify.mjs`. Every acceptance item for Phase 11 is now met except the three
Actions running green on a real branch, which needs a GitHub remote that does not exist yet.
