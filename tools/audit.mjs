/* Static audit: catches the failures that otherwise only show up as a blank screen.
   - every static and dynamic import path resolves
   - every named import exists as an export in the target module
   - every CSS class the JS uses is defined in a stylesheet
   - no forbidden CSS anywhere (border-radius, linear-gradient, backdrop-filter, blur()),
     with comments stripped first so the FORBIDDEN list in pixel.css does not trip it
   - every stylesheet is linked from index.html */
import fs from 'node:fs';
import path from 'node:path';

let bad = 0;
const P = (...a) => { console.log('  FAIL', ...a); bad++; };
const walk = d => fs.readdirSync(d, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

const js = walk('src').filter(f => f.endsWith('.js'));

for (const f of js) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/import\s*(?:\*\s*as\s*\w+|\{([^}]+)\})\s*from\s*['"](\.[^'"]+)['"]/g)) {
    const t = path.resolve(path.dirname(f), m[2]);
    if (!fs.existsSync(t)) { P('bad import', f, m[2]); continue; }
    if (!m[1]) continue;
    const tt = fs.readFileSync(t, 'utf8');
    for (const n of m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
      const re = new RegExp('export\\s+(const|let|var|function|async\\s+function|class)\\s+' + n + '\\b'
        + '|export\\s*\\{[^}]*\\b' + n + '\\b');
      if (!re.test(tt)) P('missing export', n, 'in', path.relative('.', t), '<-', path.relative('.', f));
    }
  }
  for (const m of src.matchAll(/import\(['"](\.[^'"]+)['"]\)/g)) {
    if (!fs.existsSync(path.resolve(path.dirname(f), m[1]))) P('bad dynamic import', f, m[1]);
  }
}

const cssFiles = walk('src').filter(f => f.endsWith('.css')).sort();
const raw = cssFiles.map(f => [f, fs.readFileSync(f, 'utf8')]);
const css = raw.map(([, s]) => s).join('\n');
const defined = new Set([...css.matchAll(/\.([a-z][\w-]*)/g)].map(m => m[1]));

const used = new Set();
for (const f of js) {
  const s = fs.readFileSync(f, 'utf8');
  // \bel( only: without the boundary this also matches del('store', 'some-key') and invents classes
  for (const m of s.matchAll(/(?<![\w.])el\(['"][\w]+['"],\s*['"]([^'"${}]+)['"]/g)) m[1].split(/\s+/).forEach(c => c && used.add(c));
  for (const m of s.matchAll(/class="([^"${}]+)"/g)) m[1].split(/\s+/).forEach(c => c && used.add(c));
  for (const m of s.matchAll(/className\s*=\s*['"]([^'"${}]+)['"]/g)) m[1].split(/\s+/).forEach(c => c && used.add(c));
  for (const m of s.matchAll(/querySelector(?:All)?\(['"]\.([\w-]+)/g)) used.add(m[1]);
  for (const m of s.matchAll(/classList\.(?:add|toggle|remove|contains)\(([^)]+)\)/g))
    [...m[1].matchAll(/['"]([\w-]+)['"]/g)].forEach(x => used.add(x[1]));
}
const ignore = /^(is-|t-|d25|d50|d75|z-|corner-|sh-|halo-|bevel|blink|hit|tag|must|nice|wall-)/;
for (const c of [...used].filter(c => !defined.has(c) && !ignore.test(c))) P('css class undefined .', c);

for (const [f, s] of raw) {
  const stripped = s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  stripped.split('\n').forEach((l, i) => {
    if (/border-radius|linear-gradient|backdrop-filter|blur\(/.test(l))
      P('forbidden css', f + ':' + (i + 1), l.trim().slice(0, 60));
  });
}

/* ---- copy audit ----
   The engagement rules are only real if something enforces them. These are phrases that work by
   making the reader anxious: a run they could break, a deadline we invented, a scarcity we made up.
   A real deadline from a source is fine and is said plainly ("EXPIRES IN 12 DAYS"), which is why
   the patterns below target the manipulation, not the subject. */
/** @type {[RegExp, string][]} */
const BANNED = [
  [/\bdon['’]?t lose\b/i, 'loss framing'],
  [/\byou['’]?ll lose\b/i, 'loss framing'],
  [/\blose your\b/i, 'loss framing'],
  [/\bstreak\b/i, 'streaks are a run to protect; this app has none'],
  [/\bhurry\b/i, 'manufactured urgency'],
  [/\bact (now|fast)\b/i, 'manufactured urgency'],
  [/\blast chance\b/i, 'manufactured urgency'],
  [/\bonly \d+ left\b/i, 'manufactured scarcity'],
  [/\bbefore it['’]?s gone\b/i, 'manufactured scarcity'],
  [/\bkeep your (run|streak)\b/i, 'loss framing'],
  [/\bbroken streak\b/i, 'loss framing'],
  [/\btime spent\b/i, 'time as a reward'],
  [/\bminutes today\b/i, 'time as a reward'],
  [/\bload more\b/i, 'endless feed']
];
/* Only what a reader can actually see is audited, so comments may name a rule in order to explain
   it. Comments are blanked (not removed) so reported line numbers still point at the real line. */
const stripJs = s => s
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));

/* UI strings that state the rule itself. Allowed on purpose, each one deliberate. */
const COPY_EXEMPT = /NOTHING HERE COUNTS TIME SPENT|No load more here/i;

for (const f of [...js, 'index.html']) {
  const src = stripJs(fs.readFileSync(f, 'utf8'));
  src.split('\n').forEach((line, i) => {
    if (COPY_EXEMPT.test(line)) return;
    for (const [re, why] of BANNED) {
      if (re.test(line)) P('manipulative copy', `${f}:${i + 1}`, `(${why})`, line.trim().slice(0, 64));
    }
  });
}

const html = fs.readFileSync('index.html', 'utf8');
for (const f of cssFiles) {
  const href = f.split(path.sep).join('/');
  if (!html.includes(href)) P('stylesheet not linked from index.html:', href);
}

console.log(bad ? `\n${bad} problem(s)` : `\nAUDIT CLEAN — ${js.length} modules, ${cssFiles.length} stylesheets`);
process.exit(bad ? 1 : 0);
