# Handoff

Career Arcade is a personal career workspace that looks like a room: a retro arcade **Computer**
you work at, a **Desk** you think at, and a **Wall** that is yours. It is a static site. There is
no backend, no account, no analytics and nothing to pay for. Everything personal lives in
IndexedDB on the machine you use it on.

This document is for the person who owns it — how to use it, feed it, deploy it, undo it, and what
it does not do.

---

## 1. The rooms

| Route | What it is | Who it is for |
| --- | --- | --- |
| `/#/desk` | the Desk — paper, drawer, the room. **Home** | you |
| `/#/wall` | the Wall — goals, pins, memories, the identity surface | you |
| `/#/menu` | the Computer's menu | you |
| `/#/feed` | today's drop: a finite list that ends | you |
| `/#/jobs` `/#/hacks` `/#/news` | the sources, each with its own screen | you |
| `/#/notes` `/#/cal` `/#/apps` | notes, deadlines, the applications tracker | you only |
| `/#/opts` | options: interests, refresh, data, backup | you |
| `/#/credits` | fonts, sounds, data sources, licences | anyone |
| `/#/viewer` | your own room, read-only — how it reads to a stranger | you, checking |
| `/#/present` | the room walked full-screen for a call | you, presenting |
| `/#/share` | the six-step share builder | you |
| `/#/share?d=…` | a share, as the recipient sees it | **them** |
| `/#/shares` | what you have made | you |

Keyboard: the number and letter keys jump between screens (the key bar along the bottom lists
them), `Shift+F` is full screen, `Esc` goes home, `U` undoes, `Shift+M` mutes.

**Desktop only, by decision.** A narrow window shows RESIZE THE WINDOW — with one exception below.

---

## 2. The three read-only modes, and which one to use

- **`/viewer`** — your room with every control stripped out. Use it to see what the room says
  about you before you show it to anyone. Applications, options and the share pages are not even
  loaded, so there is nothing to leak by accident.
- **`/present`** — the same thing full-screen, with the app chrome hidden and a PRESENTING
  watermark you can turn off. Arrow keys walk the eight screens, `Esc` or EXIT leaves and gives the
  chrome back. Use it on a call.
- **`/share`** — for people who are not at your desk. This is the only thing that leaves the
  machine.

---

## 3. Sharing, and exactly what travels

Open `/#/share`. Six steps: what to share, what to hide, the style, the header, the preview, the
link.

**Nothing is ticked to begin with.** You add what you want in; you never remove what was already
there. That is deliberate: the payload is built field by field from what you ticked, so a field
nobody asked for cannot appear even if the data underneath changes shape.

Permanently excluded, with no switch to turn them on:

- **Applications** — the whole tracker. There is no code path that can read it into a share.
- **Emails, phone numbers and street addresses** — masked as `██` wherever they appear, including
  in text you typed yourself.
- **Note bodies** — title only, unless you tick the body in step 2.
- **Goal checkpoints** — progress only, unless you tick them. They are working detail.
- **Internal ids and source URLs** — a source is shown as a bare domain, enough to judge it.

Step 5 shows you the finished share and a panel listing what went in and what was masked. What you
see there is what the recipient gets; it is the same renderer.

### Two kinds of share, and the honest difference

| | Embedded link | Hosted file |
| --- | --- | --- |
| How | the whole share is compressed into the URL after `#/share?d=` | a short link to a small file you deploy |
| Length | long — fine in a message, sometimes too long for a QR | short |
| **Revoking** | **cannot be revoked.** It carries its own contents, so it stops working only when it expires | delete the file and the link dies immediately |

Pick an expiry in step 4: 1, 7 or 30 days, or never. The builder tells you the date in words before
you send anything.

### Exports

- **PDF** — print the share (`Ctrl+P`). A print stylesheet strips the room and lays it out for paper.
- **Markdown** — a text summary, for pasting into a message or a CV.
- **QR** — drawn in the browser, no service involved. If the link is too long for a QR the builder
  says so and suggests a hosted share instead of drawing an unscannable square.
- **PNG** — SAVE AS A PICTURE in step 6. Drawn in your browser out of the share's own markup and
  never uploaded anywhere. The fonts are fetched from Google once and inlined into the picture, so
  the first export needs to be online; after that they are cached. If anything in that chain fails
  it tells you why and points at the PDF, rather than handing you a picture in the wrong typeface.

### The share view is the one responsive screen

A recipient opens your link on a phone, from WhatsApp. So the share view, and only the share view,
reflows down to 375px wide and hides the app's own chrome — a recipient gets the share and nothing
else. Tested at 375×667 in the `mobile` Playwright project.

### Revoking

`/#/shares` lists what you made — **not what anyone opened**, because nothing reports back. For an
embedded link, FORGET THIS ROW removes your record of it and says plainly that the link itself
keeps working until it expires. For a hosted file, delete the file from the deployment.

---

## 4. Refreshing the data

The app reads `data/*.json` from wherever it is deployed. Refreshing means replacing those files.

```bash
npm run check-source -- https://example.org/opportunities   # vet a source first, read its terms
npm run scrape                                              # writes data/*.json
npm run validate                                            # refuses a broken or inconsistent file
```

- **No sources are configured.** Until you add one, `data/*.json` is fictional seed data and every
  row carries `_mock: true`. That is a deliberate state, not an unfinished one: a scraper pointed
  at an unvetted site is how a tool like this starts lying to you.
- **Scheduled:** the `scrape` workflow runs daily at 01:30 UTC and commits `data/` only if
  something actually changed.
- **From the app:** Options → REFRESH → REFRESH ALL. This needs a GitHub repository and a token
  with `actions:write` on that one repository, pasted into Options. It is optional; without it the
  button prints the command to run instead of pretending to work. The token is stored locally and
  is sent only in the `Authorization` header of that one request.
- The service worker is **network-first for data**, so refreshed data reaches an installed app on
  its next load. A cached opportunity is a dated one, and the freshness receipt on every card keeps
  REPORTED, LAST CHECKED and LAST CHANGED separate so you can see which is which.

---

## 5. Deploying, and rolling back

Full runbook: [deploy.md](deploy.md). The short version:

```bash
git push                      # deploy runs npm run verify first; a red check stops the deploy
```

```bash
git revert <bad-commit>       # rolling back is a revert and a push
git push
```

**The service-worker gotcha:** if you change anything in the shell (HTML, CSS, JS), bump `VERSION`
in `sw.js`. A new shell list under an old cache name means returning visitors keep the old app and
you will spend an afternoon wondering why your fix did not ship. The font cache is deliberately
unversioned — a font never changes under its own URL.

---

## 6. Backup and restore

Options → DATA.

- **EXPORT BACKUP** writes one JSON file with everything personal.
- **IMPORT A BACKUP** shows what the file would do *before* writing anything, then offers:
  - **MERGE** — the file wins a clash,
  - **REPLACE** — clears those stores first, and makes you click twice.
- **ERASE ALL MY DATA** is exactly that, and also makes you click twice.

Clearing site data in the browser deletes everything. Export first. Nothing is anywhere else.

---

## 7. What it does for your data, and what it refuses to do

- A saved item whose deadline has passed is **archived, never deleted**.
- The drawer holds removed items 14 days.
- Anything archived past 90 days is **offered** for cleanup in Options → DATA. Nothing is swept for
  you, and the cleanup is undoable.
- Storage: a warning at 50 MB, writes **actually blocked** at 80 MB with a toast that says so. A
  refused write says NOT SAVED rather than looking saved.
- `U`, or the UNDO button on the toast, reverses the last 20 actions: deletes, crumples, archiving,
  unpinning, clearing the drawer, and checkpoint ticks. It is in memory only and lasts the session —
  an undo you could still use tomorrow is a promise this app cannot keep.

### The ethical rules, enforced by a test and not by good intentions

`npm run audit` fails the build on banned copy. There are **no streaks you can lose**, no fake
urgency, no infinite scroll (the feed ends and says so), no public rankings, and nothing rewards
time spent. Four strings are allowlisted in `tools/copy-audit.allowlist.txt`, each with its reason
written next to it.

---

## 8. Checking your own work

```bash
npm run verify      # build, typecheck, lint, unit tests, copy audit, data validation, e2e
npm run e2e         # Playwright only: desktop + mobile projects
npm test            # unit tests only, fast
```

`verify` is the gate the deploy workflow runs. If it is red, nothing ships.

---

## 9. Known limitations

Written down rather than quietly left out.

1. **No GitHub remote exists yet.** Nothing has been pushed, so the three workflows
   (`verify`, `deploy`, `scrape`) have never run on a real branch. They are written and lint-clean;
   they are not proven.
2. **No scrape sources configured.** `data/*.json` is fictional, `_mock: true` on every row.
3. **QR codes are unproven against a real camera.** The encoder is verified structurally — size,
   finder patterns, timing, the dark module, version selection, determinism, and an honest refusal
   past version 20 — but nobody has pointed a phone at one.
4. **PNG export needs the fonts once.** The picture is sealed — the browser fetches nothing for
   it — so the fonts are inlined as base64, which means the first export must be online. It also
   relies on the browser rasterizing embedded HTML, which older Safari does badly. Both failures
   are reported in words, and the PDF export works everywhere.
5. **Desktop only** except the share view. Narrow windows get RESIZE THE WINDOW.
6. **Fonts come from Google Fonts** — free and keyless, the only cross-origin request the app
   makes, and now cached by the service worker after the first successful load. Before that first
   load, offline means fallback monospace.
7. **`sw.js` is not typechecked.** Its global scope conflicts with the DOM lib. ESLint covers it.
8. **The `u` engine assumes a stable viewport.** Resizing re-derives everything; it is correct, but
   mid-drag resizing of the window will flicker.

---

## 10. The cost, stated plainly

- Runtime dependencies: **none.** `package.json` `dependencies` is `{}`. Everything in
  `devDependencies` is a build or test tool and never ships.
- Hosting: GitHub Pages, free.
- Scheduled scraping: GitHub Actions, free on a public repository.
- Paid services, paid APIs, always-on servers: **none.**
- Secrets required: **none.** The one optional token is yours, is stored locally, and the app works
  without it.
