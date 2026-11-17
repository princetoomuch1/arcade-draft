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

const html = fs.readFileSync('index.html', 'utf8');
for (const f of cssFiles) {
  const href = f.split(path.sep).join('/');
  if (!html.includes(href)) P('stylesheet not linked from index.html:', href);
}

console.log(bad ? `\n${bad} problem(s)` : `\nAUDIT CLEAN — ${js.length} modules, ${cssFiles.length} stylesheets`);
process.exit(bad ? 1 : 0);
