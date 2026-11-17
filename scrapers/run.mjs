/* The scrape run. Reads scrapers/sources.json, writes data/*.json and data/refresh-log.json.
 *
 * With no sources configured it does nothing and says so, which is the state it ships in.
 * Everything it does fetch goes through the robots gate and the rate limiter in lib/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { polite } from './lib/http.mjs';
import { parseFeed, parseJson } from './lib/parse.mjs';
import { toFeedItem, mergeItems } from './lib/contract.mjs';

const DATA = 'data';
const FILE_FOR = { hackathon: 'hackathons', event: 'hackathons', job: 'jobs', internship: 'jobs', news: 'news', scheme: 'schemes' };
const CACHE = path.join(DATA, '.http-cache.json');

const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };
const log = (...a) => console.log(...a);

async function main() {
  const cfg = readJson('scrapers/sources.json', { sources: [] });
  const sources = Array.isArray(cfg.sources) ? cfg.sources : [];
  const started = Date.now();

  if (!sources.length) {
    log('No sources configured in scrapers/sources.json, so nothing was fetched.');
    log('The rows in data/ are fictional seed rows: every one carries _mock: true.');
    log('Add a source there once you have checked its robots.txt and terms.');
    return 0;
  }

  const cache = readJson(CACHE, {});
  const now = new Date();
  /** @type {Record<string, object[]>} */
  const collected = {};
  const runLog = { started_at: started, finished_at: null, sources: [], status: 'ok' };

  for (const src of sources) {
    const entry = { name: src.name, host: src.host, items_new: 0, items_changed: 0, status: 'ok', error: null };
    try {
      if (!src.url || !src.name || !src.host || !src.type) throw new Error('source is missing name, host, type or url');

      const prev = cache[src.url] || {};
      const res = await polite(src.url, { etag: prev.etag, lastModified: prev.lastModified, log });

      if (res.unchanged) { entry.status = 'unchanged'; runLog.sources.push(entry); log(`unchanged: ${src.name}`); continue; }
      if (res.skipped) { entry.status = 'skipped'; entry.error = res.skipped; runLog.sources.push(entry); continue; }
      if (res.status !== 200 || !res.body) { entry.status = 'error'; entry.error = `HTTP ${res.status}`; runLog.sources.push(entry); continue; }

      cache[src.url] = { etag: res.etag, lastModified: res.lastModified };

      const raw = src.kind === 'json' ? parseJson(res.body, src.map) : parseFeed(res.body);
      const file = FILE_FOR[src.type] || 'news';
      collected[file] = collected[file] || [];

      let rejected = 0;
      for (const r of raw) {
        const v = toFeedItem({ ...r, type: src.type }, { name: src.name, host: src.host }, now);
        if (v.ok) collected[file].push(v.item);
        else { rejected++; log(`  rejected a row from ${src.name}: ${v.why}`); }
      }
      entry.items_found = raw.length;
      entry.items_rejected = rejected;
      log(`${src.name}: ${raw.length - rejected} rows kept, ${rejected} rejected`);
    } catch (e) {
      entry.status = 'error'; entry.error = e.message;
      runLog.status = 'partial';
      log(`error on ${src.name}: ${e.message}`);
    }
    runLog.sources.push(entry);
  }

  // Merge into each data file, keeping firstSeen and only moving lastChanged on a real change.
  for (const [file, fresh] of Object.entries(collected)) {
    const p = path.join(DATA, `${file}.json`);
    const existing = readJson(p, { items: [] });
    const real = (existing.items || []).filter(i => !i._mock);     // seed rows step aside for real data
    const { items, stats } = mergeItems(real, fresh, now);
    fs.writeFileSync(p, JSON.stringify({
      generated: now.toISOString(),
      contract: 'UI Spec v2 section 17.1',
      mock: false,
      items
    }, null, 1) + '\n');
    log(`${file}.json: ${stats.new} new, ${stats.changed} changed, ${stats.unchanged} unchanged, ${stats.gone} no longer listed`);
    const e = runLog.sources.find(s => FILE_FOR[s.type] === file);
    if (e) { e.items_new = stats.new; e.items_changed = stats.changed; }
  }

  runLog.finished_at = Date.now();
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1) + '\n');
  fs.writeFileSync(path.join(DATA, 'refresh-log.json'), JSON.stringify(runLog, null, 1) + '\n');
  log(`done in ${Math.round((runLog.finished_at - started) / 1000)}s`);
  return 0;
}

main().then(code => process.exit(code)).catch(e => { console.error(e); process.exit(1); });
