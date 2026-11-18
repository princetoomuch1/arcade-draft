# Deployment runbook

Everything here is free. No paid service, no server you keep running, no secret required for a
normal deploy.

## First deploy

1. Create an empty repository on GitHub and push this one to it:
   ```bash
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
   (The work so far is on `phase-0/foundation`. Merge it into `main` first, or push that branch and
   change the default branch — `deploy` only runs on `main`.)
2. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main`, or run **Actions → deploy to github pages → Run workflow**.
4. The run summary prints the URL, usually `https://<you>.github.io/<repo>/`.

## Updating

Push to `main`. `deploy` runs `npm run verify` first, so a red check stops the deploy rather than
shipping a broken page.

## Refreshing the data

- **Scheduled:** `scrape` runs daily at 01:30 UTC (07:00 IST) and commits `data/` only if something
  changed.
- **By hand, locally:** `npm run scrape`.
- **From the app:** Options → REFRESH → REFRESH ALL. That needs a repository and a token
  (`actions:write` on that one repository) in Options. Without them the button tells you the command
  to run instead of pretending.
- **No sources are configured yet.** Check a site first with
  `npm run check-source -- <url> [type]`, read its terms yourself, then add the printed entry to
  `scrapers/sources.json`.

## Rolling back

```bash
git revert <bad-commit>
git push
```
`deploy` runs again and the previous version is live. There is no database to migrate back, because
everything personal is on your own device.

A bad **data** commit is the same: revert the `chore(data)` commit and push.

## Backing up and restoring

Your notes, applications, goals and wall are in IndexedDB on this machine and are **not** in the
repository. They are not backed up by deploying.

- Export: Options → DATA → EXPORT BACKUP (JSON).
- Restore: Options → DATA → IMPORT A BACKUP. It shows what the file would do before writing
  anything, then lets you MERGE or REPLACE.
- Clearing the browser's site data deletes everything. Export before you do that, or before
  switching machines.

## Service worker: a deploy that looks like it did nothing

The shell is cached first, so after a deploy the first load can still run the old code. If you
change a file in `SHELL_FILES`, bump `VERSION` in `sw.js`. The old cache is deleted on activate.

## Known limitations

- Desktop only. A phone shows RESIZE THE WINDOW; that is a decision, not a bug.
- `sw.js` is not type-checked: its global scope conflicts with the DOM lib. ESLint does check it.
- No sources configured, so the data is fictional seed rows marked `_mock`.
