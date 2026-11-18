/* Static audit. Catches the failures that otherwise only show up as a blank screen, plus the
   copy rules, which are only real if something enforces them.
   - every static and dynamic import path resolves
   - every named import exists as an export in the target module
   - every CSS class the JS uses is defined in a stylesheet
   - no forbidden CSS anywhere (border-radius, linear-gradient, backdrop-filter, blur())
   - no manipulative copy, no infinite scroll, no leaderboard
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
      // String.raw so the escapes survive any future copy, paste or heredoc.
      const re = new RegExp(
        String.raw`export\s+(const|let|var|function|async\s+function|class)\s+${n}\b`
        + String.raw`|export\s*\{[^}]*\b${n}\b`);
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
   Phrases that work by making the reader anxious. A real deadline from a source is a fact and is
   said plainly, which is why the allowlist exists and why it names exact strings with reasons. */
/** @type {[RegExp, string][]} */
const BANNED = [
  [/\bdon['’]?t lose\b/i, 'loss framing'],
  [/\bdon['’]?t miss\b/i, 'loss framing'],
  [/\byou['’]?ll lose\b/i, 'loss framing'],
  [/\blose your\b/i, 'loss framing'],
  [/\bstreak\b/i, 'a streak is a run to protect; this app has none'],
  [/\bdays in a row\b/i, 'loss framing'],
  [/\bhurry\b/i, 'manufactured urgency'],
  [/\bact (now|fast)\b/i, 'manufactured urgency'],
  [/\blast chance\b/i, 'manufactured urgency'],
  [/\blimited time\b/i, 'manufactured urgency'],
  [/\bonly today\b/i, 'manufactured urgency'],
  [/\bonly \d+ left\b/i, 'manufactured scarcity'],
  [/\bbefore it['’]?s gone\b/i, 'manufactured scarcity'],
  [/\bcome back\b/i, 'a nag to return'],
  [/\bexpires? in\b/i, 'a countdown, unless it is a real source deadline'],
  [/\btime spent\b/i, 'time as a reward'],
  [/\bminutes today\b/i, 'time as a reward'],
  [/\bload more\b/i, 'endless feed'],
  [/onEndReached|InfiniteScroll/, 'infinite scroll'],
  [/[Ll]eaderboard/, 'public ranking']
];

/* Only what a reader can see is audited, so a comment may name a rule in order to explain it.
   Comments are blanked rather than removed, so line numbers still point at the real line. */
// Built with new RegExp so the character class stays readable: anything but : " ' ` or a backslash.
const LINE_COMMENT = new RegExp('(^|[^:"\'`\\\\])//[^\\n]*', 'g');
const stripJs = s => s
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(LINE_COMMENT, (m, p) => p + ' '.repeat(m.length - p.length));

const ALLOWLIST = fs.readFileSync('tools/copy-audit.allowlist.txt', 'utf8')
  .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
const allowed = line => ALLOWLIST.some(a => line.includes(a));

for (const f of [...js, 'index.html']) {
  const src = stripJs(fs.readFileSync(f, 'utf8'));
  src.split('\n').forEach((line, i) => {
    if (allowed(line)) return;
    for (const [re, why] of BANNED) {
      if (re.test(line)) P('manipulative copy', f + ':' + (i + 1), '(' + why + ')', line.trim().slice(0, 60));
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
