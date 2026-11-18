/* Validate every data/*.json against schemas/, plus the invariants a schema cannot express.
 *
 * Hand-written rather than ajv: the project has no runtime dependencies and this needs to keep
 * working in five years. It covers the subset of draft-07 the schemas actually use —
 * type, enum, required, properties, items, $ref, pattern, minLength, minimum, additionalProperties.
 */
import fs from 'node:fs';
import path from 'node:path';

let bad = 0;
const fail = (...a) => { console.log('  FAIL', ...a); bad++; };

const SCHEMA_DIR = 'schemas';
const schemas = Object.fromEntries(
  fs.readdirSync(SCHEMA_DIR).filter(f => f.endsWith('.json'))
    .map(f => [f, JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8'))])
);

const typeOf = v => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function check(value, schema, where) {
  if (schema.$ref) return check(value, schemas[schema.$ref], where);

  if (schema.enum) {
    if (!schema.enum.includes(value)) fail(`${where}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
    return;
  }
  if (schema.type) {
    const want = Array.isArray(schema.type) ? schema.type : [schema.type];
    const got = typeOf(value);
    const ok = want.includes(got) || (want.includes('integer') && Number.isInteger(value))
      || (want.includes('number') && got === 'number');
    if (!ok) { fail(`${where}: expected ${want.join('|')}, got ${got}`); return; }
  }
  if (value === null || value === undefined) return;

  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) fail(`${where}: shorter than ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail(`${where}: does not match ${schema.pattern}`);
    if (schema.format === 'date-time' && Number.isNaN(new Date(value).getTime())) fail(`${where}: not a date-time`);
  }
  if (typeof value === 'number' && schema.minimum != null && value < schema.minimum) fail(`${where}: below ${schema.minimum}`);

  if (Array.isArray(value) && schema.items) value.forEach((v, i) => check(v, schema.items, `${where}[${i}]`));

  if (typeOf(value) === 'object') {
    for (const k of schema.required || []) {
      if (!(k in value) || value[k] === undefined) fail(`${where}: missing required "${k}"`);
    }
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(value)) {
        if (!schema.properties?.[k]) fail(`${where}: unexpected property "${k}"`);
      }
    }
    for (const [k, sub] of Object.entries(schema.properties || {})) {
      if (k in value && value[k] !== undefined) check(value[k], sub, `${where}.${k}`);
    }
  }
}

const files = fs.existsSync('data') ? fs.readdirSync('data').filter(f => f.endsWith('.json') && f !== 'refresh-log.json') : [];
if (!files.length) fail('no data files found');

const seenIds = new Map();
let total = 0;

for (const f of files) {
  const p = path.join('data', f);
  let doc;
  try { doc = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { fail(`${p}: not valid JSON (${e.message})`); continue; }

  check(doc, schemas['datafile.json'], p);

  for (const it of doc.items || []) {
    total++;
    // Invariants a schema cannot state.
    if (seenIds.has(it.id)) fail(`${p}: id "${it.id}" already used in ${seenIds.get(it.id)}`);
    else seenIds.set(it.id, p);

    if (it.deadline && it.expiresAt && new Date(it.expiresAt) < new Date(it.deadline)) {
      fail(`${p}: ${it.id} expires before its own deadline`);
    }
    if (it.firstSeen && it.lastSeen && new Date(it.lastSeen) < new Date(it.firstSeen)) {
      fail(`${p}: ${it.id} was last seen before it was first seen`);
    }
    if (it.startDate && it.endDate && new Date(it.endDate) < new Date(it.startDate)) {
      fail(`${p}: ${it.id} ends before it starts`);
    }
    // A row the scrapers wrote must say where it came from; seed rows say seed.local and that is fine.
    if (!it.source?.host) fail(`${p}: ${it.id} has no source host`);
  }
}

console.log(bad ? `\n${bad} data problem(s)` : `\nDATA VALID — ${files.length} files, ${total} rows, ${seenIds.size} unique ids`);
process.exit(bad ? 1 : 0);
