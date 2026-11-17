/* Build = copy the static site into dist/ and prove it is servable.
   There is no bundler on purpose: the app ships the same ES modules the browser runs, so what you
   debug is what deploys. The build's real job is to catch a file the HTML references but nobody shipped. */
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'dist';
const ROOTS = ['index.html', 'calibrate.html', 'src', 'data'];
const EXTRA = ['manifest.webmanifest', 'sw.js', 'icons'];   // present from phase 10 on

let bad = 0;
const fail = (...a) => { console.log('  FAIL', ...a); bad++; };

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let copied = 0;
const copy = src => {
  if (!fs.existsSync(src)) return;
  const dest = path.join(OUT, src);
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const e of fs.readdirSync(src)) copy(path.join(src, e));
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    copied++;
  }
};
for (const r of [...ROOTS, ...EXTRA]) copy(r);

/* every local href/src in the HTML must exist in dist */
for (const page of ['index.html', 'calibrate.html']) {
  if (!fs.existsSync(path.join(OUT, page))) { fail('missing page', page); continue; }
  const html = fs.readFileSync(path.join(OUT, page), 'utf8');
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const ref = m[1];
    if (/^(https?:|data:|mailto:|#|\/\/)/.test(ref)) continue;
    if (!fs.existsSync(path.join(OUT, ref.split('?')[0]))) fail(`${page} references a file that is not shipped:`, ref);
  }
}

/* every data file must be valid JSON with an items array */
const dataDir = path.join(OUT, 'data');
if (fs.existsSync(dataDir)) {
  for (const f of fs.readdirSync(dataDir).filter(f => f.endsWith('.json'))) {
    const p = path.join(dataDir, f);
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (!Array.isArray(j.items)) fail(`data/${f} has no items array`);
      for (const it of j.items || []) {
        if (!it.id || !it.type || !it.title) fail(`data/${f}: a row is missing id, type or title`);
      }
    } catch (e) { fail(`data/${f} is not valid JSON:`, e.message); }
  }
}

const bytes = (function size(d) {
  return fs.readdirSync(d, { withFileTypes: true })
    .reduce((n, e) => n + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
})(OUT);

console.log(bad
  ? `\nBUILD FAILED — ${bad} problem(s)`
  : `\nBUILD OK — ${copied} files, ${(bytes / 1024).toFixed(0)} KB in ${OUT}/`);
process.exit(bad ? 1 : 0);
