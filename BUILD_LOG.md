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
