/* The data contract. Nothing reaches data/*.json without passing through here.
 *
 * The app's honesty rests on this file: a row that cannot say where it came from, or that invents
 * a field the source never gave, is rejected rather than filled in with a plausible guess.
 */

import { createHash } from 'node:crypto';

export const TYPES = ['hackathon', 'job', 'internship', 'news', 'scheme', 'event'];

const str = v => (typeof v === 'string' && v.trim() ? v.trim() : null);
const iso = v => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** A stable id from source and URL, so the same listing keeps its id between runs. */
export const idFor = (sourceName, url) =>
  createHash('sha1').update(`${sourceName}|${url}`).digest('hex').slice(0, 16);

/**
 * A cluster key for the same opportunity carried by several sites: the title reduced to its
 * meaningful words, plus the organisation. Deliberately conservative — a missed duplicate is a
 * small annoyance, a wrongly merged pair hides a real opportunity.
 */
export function clusterKey(title, org) {
  const norm = s => String(s || '').toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['the', 'and', 'for', 'with', 'hackathon', 'intern', 'internship', 'job'].includes(w))
    .sort().join('-');
  const t = norm(title);
  if (!t) return null;
  const o = norm(org);
  return createHash('sha1').update(o ? `${t}|${o}` : t).digest('hex').slice(0, 12);
}

/**
 * Validate and normalise one scraped row.
 * @returns {{ok: boolean, item?: object, why?: string}}
 */
export function toFeedItem(raw, source, now = new Date()) {
  const title = str(raw.title);
  const url = str(raw.url);
  const type = TYPES.includes(raw.type) ? raw.type : null;

  if (!title) return { ok: false, why: 'no title' };
  if (!url) return { ok: false, why: 'no url' };
  if (!type) return { ok: false, why: `type ${JSON.stringify(raw.type)} is not one of ${TYPES.join(', ')}` };
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return { ok: false, why: `url protocol ${u.protocol}` };
  } catch { return { ok: false, why: 'url does not parse' }; }
  if (!source?.name || !source?.host) return { ok: false, why: 'source must carry a name and a host' };

  const nowIso = iso(now);
  const item = {
    id: str(raw.id) || idFor(source.name, url),
    type, title, url,
    org: str(raw.org),
    summary: str(raw.summary),
    source: { name: source.name, host: source.host },
    firstSeen: iso(raw.firstSeen) || nowIso,
    lastSeen: nowIso,
    lastChanged: iso(raw.lastChanged) || nowIso,
    deadline: iso(raw.deadline),
    startDate: iso(raw.startDate),
    endDate: iso(raw.endDate),
    expiresAt: iso(raw.expiresAt),
    skills: Array.isArray(raw.skills) ? [...new Set(raw.skills.map(s => String(s).toLowerCase().trim()).filter(Boolean))] : [],
    city: str(raw.city), state: str(raw.state), country: str(raw.country),
    mode: ['online', 'in_person', 'hybrid'].includes(raw.mode) ? raw.mode : null,
    sourceCount: 1,
    cluster: clusterKey(title, raw.org)
  };

  // Optional facets: carried only when the source actually said them.
  for (const k of ['eligibility', 'focus', 'judging', 'submission', 'experience', 'education', 'term', 'workAuth', 'workClass']) {
    const v = str(raw[k]); if (v) item[k] = v;
  }
  if (typeof raw.beginnerFriendly === 'boolean') item.beginnerFriendly = raw.beginnerFriendly;
  if (Number.isFinite(raw.commitmentHours)) item.commitmentHours = raw.commitmentHours;
  if (Number.isFinite(raw.teamSizeMax)) item.teamSizeMax = raw.teamSizeMax;
  if (raw.pay && typeof raw.pay === 'object') item.pay = raw.pay;
  if (Array.isArray(raw.milestones)) {
    const ms = raw.milestones.filter(m => str(m?.label) && iso(m?.at)).map(m => ({ label: str(m.label), at: iso(m.at) }));
    if (ms.length) item.milestones = ms;
  }

  return { ok: true, item };
}

/** Fields whose change counts as the listing really changing, rather than the page being rebuilt. */
const MEANINGFUL = ['title', 'org', 'summary', 'deadline', 'startDate', 'endDate', 'mode', 'city', 'pay'];

/**
 * Merge this run's rows into what is already on disk.
 * firstSeen is never moved, lastChanged moves only on a meaningful change, and a row that has
 * vanished from its source keeps its last known state with lastSeen left where it was.
 * @returns {{items: object[], stats: {new: number, changed: number, unchanged: number, gone: number}}}
 */
export function mergeItems(existing, fresh, now = new Date()) {
  const nowIso = iso(now);
  const byId = new Map(existing.map(i => [i.id, i]));
  const seen = new Set();
  const stats = { new: 0, changed: 0, unchanged: 0, gone: 0 };
  const out = [];

  for (const item of fresh) {
    seen.add(item.id);
    const old = byId.get(item.id);
    if (!old) { stats.new++; out.push(item); continue; }
    const changed = MEANINGFUL.some(k => JSON.stringify(old[k] ?? null) !== JSON.stringify(item[k] ?? null));
    changed ? stats.changed++ : stats.unchanged++;
    out.push({
      ...item,
      firstSeen: old.firstSeen || item.firstSeen,
      lastChanged: changed ? nowIso : (old.lastChanged || item.lastChanged)
    });
  }

  for (const old of existing) {
    if (seen.has(old.id)) continue;
    stats.gone++;
    out.push(old);        // kept as last known. The app's own expiry rules decide when it goes.
  }

  // Count how many sources carry each cluster, which is what POPULAR is read from.
  const counts = new Map();
  for (const i of out) if (i.cluster) counts.set(i.cluster, (counts.get(i.cluster) || 0) + 1);
  for (const i of out) if (i.cluster) i.sourceCount = counts.get(i.cluster);

  return { items: out, stats };
}
