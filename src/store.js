/* Career Arcade — state. UI Spec v2 sections 6 (lifecycle), 15.2 (weights), 15.3 (score), 17.1 (contract).
   Everything personal lives in IndexedDB on this machine. Nothing is sent anywhere.
   Field names follow src/model.js. Version 2 migrates the version 1 camelCase records in place. */

import {
  blankItemRecord, blankInterest, blankPlan, blankApplication, uid,
  expiresAt as itemExpiresAt, receipt
} from './model.js';

export { uid, receipt };

const DB = 'arcade', VER = 3;
const STORES = ['items', 'personal', 'notes', 'goals', 'apps', 'weights', 'meta', 'wallpins', 'plans', 'refresh'];

/* ---------- migration ---------- */
/** v1 personal record -> ItemRecord. Exported so a test can check it without a browser. */
export function migratePersonal(old) {
  const rec = blankItemRecord(old.id);
  rec.state = old.state ?? rec.state;
  rec.saved_at = old.savedAt ?? null;
  rec.planned_for = old.plannedFor ?? null;
  rec.drawer_at = old.drawerAt ?? null;
  rec.wall_zone = old.wallZone ?? null;
  rec.desk_position = old.deskPos ? { x: old.deskPos.x, y: old.deskPos.y, rot: old.deskPos.rot ?? 0 } : null;
  rec.strings = Array.isArray(old.strings) ? old.strings : [];
  rec.snapshot = old.snapshot ?? null;
  rec.notes = Array.isArray(old.notes) ? old.notes : [];
  rec.pinned_desk = [STATE.SAVED, STATE.PLANNED, STATE.PINNED].includes(rec.state);
  rec.pinned_wall = rec.state === STATE.PINNED;
  rec.status = rec.state === STATE.DRAWER ? 'archived'
    : rec.state === STATE.EXPIRED ? 'expired'
      : rec.state === STATE.SEEN ? 'active' : 'saved';
  rec.expires_at = old.snapshot ? itemExpiresAt(old.snapshot) : null;
  rec.last_checked_at = old.snapshot?.lastSeen ? new Date(old.snapshot.lastSeen).getTime() : null;
  rec.last_changed_at = old.snapshot?.lastChanged ? new Date(old.snapshot.lastChanged).getTime() : rec.last_checked_at;
  return rec;
}

/** v1 weight record -> Interest. */
export function migrateWeight(old) {
  return blankInterest(old.id, {
    label: old.id,
    kind: old.kind === 'CHOSE' ? 'explicit' : 'inferred',
    weight: typeof old.w === 'number' ? old.w : 0.2,
    source: old.kind === 'CHOSE' ? 'you' : 'save',
    recency: old.last ?? Date.now(),
    paused: !!old.muted,
    seen: old.seen ?? 0,
    skips: Array.isArray(old.skips) ? old.skips : [],
    decayed_at: old.decayedAt ?? null
  });
}

/** Two older application shapes existed before the model settled. Both convert to Application. */
export function migrateApplication(old) {
  if (old.stage && Array.isArray(old.dates) && 'next_action' in old) return old;   // already current

  const notes = [];
  // shape A, written by the Jobs page: { id: <item id>, item, stage:'APPLIED', label:'MANUAL', appliedAt }
  if (old.item && old.label) {
    const at = old.appliedAt ?? Date.now();
    return blankApplication({
      id: 'a-' + old.id, item_id: old.id,
      title: old.item.title || '', org: old.item.org || '', url: old.item.url || null,
      stage: 'applied', dates: [{ stage: 'applied', at }],
      trust: String(old.label).toLowerCase() === 'external' ? 'external' : 'manual',
      updated: at
    });
  }
  // shape B, written by the Applications page: { itemId, title, org, url, status, appliedOn, note }
  const STAGE = {
    PLANNED: 'planned', APPLIED: 'applied', SCREEN: 'screen',
    INTERVIEW: 'interview', OFFER: 'offer', REJECTED: 'reject'
  };
  let stage = STAGE[old.status] || 'planned';
  if (old.status === 'GHOSTED') {
    // "Ghosted" is an absence, not a decision anyone made, so it is derived from the dates now.
    stage = 'applied';
    notes.push('Was marked GHOSTED before stages changed; no reply is now worked out from the dates.');
  }
  const at = old.appliedOn ? new Date(old.appliedOn + 'T12:00:00').getTime() : null;
  return blankApplication({
    id: old.id, item_id: old.itemId ?? null,
    title: old.title || '', org: old.org || '', url: old.url || null,
    stage, dates: at ? [{ stage: 'applied', at }] : [],
    notes: [old.note, ...notes].filter(Boolean).join('\n'),
    trust: 'manual', updated: old.updated ?? Date.now()
  });
}

let db = null;
export function open() {
  if (db) return Promise.resolve(db);
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = ev => {
      const d = r.result, tx = r.transaction;
      for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
      if (ev.oldVersion >= 1 && ev.oldVersion < 2 && tx) {
        rewrite(tx.objectStore('personal'), migratePersonal);
        rewrite(tx.objectStore('weights'), migrateWeight);
      }
      if (ev.oldVersion >= 1 && ev.oldVersion < 3 && tx) {
        rewrite(tx.objectStore('apps'), migrateApplication);
      }
    };
    r.onsuccess = () => { db = r.result; res(db); };
    r.onerror = () => rej(r.error);
  });
}
/** Rewrite every record in place. A migration that changes the key re-keys the record instead,
 *  because cursor.update() refuses to move a record to a new primary key. */
function rewrite(store, fn) {
  const q = store.openCursor();
  q.onsuccess = () => {
    const c = q.result; if (!c) return;
    const next = fn(c.value);
    if (next.id === c.value.id) c.update(next);
    else { c.delete(); store.put(next); }
    c.continue();
  };
}

const tx = (store, mode = 'readonly') => open().then(d => d.transaction(store, mode).objectStore(store));
export const put = (store, val) => tx(store, 'readwrite').then(s => new Promise((res, rej) => {
  const r = s.put(val); r.onsuccess = () => res(val); r.onerror = () => rej(r.error); }));
export const get = (store, id) => tx(store).then(s => new Promise((res, rej) => {
  const r = s.get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
export const all = store => tx(store).then(s => new Promise((res, rej) => {
  const r = s.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); }));
export const del = (store, id) => tx(store, 'readwrite').then(s => new Promise((res, rej) => {
  const r = s.delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }));

/* Ask the browser not to evict this: the saved items are the only copy. */
export async function persist() {
  if (navigator.storage?.persist) { try { return await navigator.storage.persist(); } catch { return false; } }
  return false;
}

/* ---------- 6. item lifecycle ---------- */
export const STATE = {
  SEEN: 'SEEN', SAVED: 'SAVED', PLANNED: 'PLANNED', PINNED: 'PINNED', DONE: 'DONE',
  EXPIRED: 'EXPIRED', DRAWER: 'DRAWER', KEPT: 'KEPT', GOLD: 'GOLD'
};
const DRAWER_DAYS = 14;
const ON_DESK = [STATE.SAVED, STATE.PLANNED, STATE.PINNED, STATE.DONE];

export async function mark(item, state, extra = {}) {
  const p = (await get('personal', item.id)) || blankItemRecord(item.id);
  p.state = state;
  if (state === STATE.SAVED && !p.saved_at) p.saved_at = Date.now();
  if (state === STATE.DRAWER) { p.drawer_at = Date.now(); p.status = 'archived'; }
  if (state === STATE.PINNED) p.pinned_wall = true;
  if (ON_DESK.includes(state)) { p.pinned_desk = true; p.status = 'saved'; }
  if (state === STATE.SAVED || state === STATE.PLANNED) {
    // Keep a snapshot: the source copy is deleted when it expires, the user's copy must survive.
    p.snapshot = { ...item };
    p.expires_at = itemExpiresAt(item);
    const r = receipt(item);
    p.last_checked_at = r.checked; p.last_changed_at = r.changed;
  }
  Object.assign(p, extra);
  return put('personal', p);
}
export const personalFor = id => get('personal', id).then(p => p || blankItemRecord(id));

/** Items in the drawer past 14 days are gone for good. Called on every boot. */
export async function sweepDrawer(now = Date.now()) {
  const ps = await all('personal');
  const dead = ps.filter(p => p.state === STATE.DRAWER && p.drawer_at && now - p.drawer_at > DRAWER_DAYS * 864e5);
  await Promise.all(dead.map(p => del('personal', p.id)));
  return dead.length;
}
export const drawerDaysLeft = p =>
  p.state === STATE.DRAWER && p.drawer_at
    ? Math.max(0, DRAWER_DAYS - Math.floor((Date.now() - p.drawer_at) / 864e5)) : null;

/** A saved item whose deadline has passed is archived, never deleted. Returns how many moved. */
export async function archiveExpired(now = Date.now()) {
  const ps = await all('personal');
  const stale = ps.filter(p => ON_DESK.includes(p.state) && p.expires_at && p.expires_at < now);
  for (const p of stale) { p.state = STATE.DRAWER; p.status = 'archived'; p.drawer_at = now; await put('personal', p); }
  return stale.length;
}

/* ---------- 15.2 interest weights ---------- */
const DELTA = { save: 0.15, more: 0.25, plan: 0.20, open: 0.05, read: 0.05, less: -0.30 };
const MAX_INFERRED = 200;
const clamp = n => Math.min(1, Math.max(0, n));

/** explicit = you typed it, weight 1.0, never decays. inferred = read off your behaviour, decays. */
export async function bump(keywords, event) {
  const d = DELTA[event]; if (d == null) return;
  for (const k of keywords || []) {
    const key = k.toLowerCase().trim(); if (!key) continue;
    const w = (await get('weights', key)) || blankInterest(key, { source: event });
    if (w.kind === 'explicit') continue;              // your own interests are not nudged by behaviour
    if (w.paused) continue;
    w.weight = clamp(w.weight + d); w.seen++; w.recency = Date.now();
    await put('weights', w);
  }
  await trimInferred();
}
export async function chooseInterest(keyword) {
  const key = keyword.toLowerCase().trim();
  return put('weights', blankInterest(key, { kind: 'explicit', weight: 1.0, source: 'you' }));
}
export async function muteTopic(keyword) {
  const key = keyword.toLowerCase().trim();
  const w = (await get('weights', key)) || blankInterest(key);
  w.paused = true; w.weight = 0; w.recency = Date.now();
  return put('weights', w);
}
export async function resumeTopic(keyword) {
  const w = await get('weights', keyword.toLowerCase().trim());
  if (!w) return null;
  w.paused = false; w.recency = Date.now();
  return put('weights', w);
}
/** Skipping only counts after 3 skips of the same keyword inside 7 days. */
export async function skipped(keywords) {
  for (const k of keywords || []) {
    const key = k.toLowerCase().trim(); if (!key) continue;
    const w = await get('weights', key); if (!w || w.kind === 'explicit' || w.paused) continue;
    const recent = (w.skips || []).filter(t => Date.now() - t < 7 * 864e5);
    recent.push(Date.now()); w.skips = recent;
    w.weight = clamp(w.weight + (recent.length >= 3 ? -0.03 : -0.01));
    await put('weights', w);
  }
}
/** inferred weights lose 3% a day: half-life about 23 days. explicit weights do not move. */
export async function decay(now = Date.now()) {
  const ws = await all('weights');
  for (const w of ws) {
    if (w.kind === 'explicit' || w.paused) continue;
    const days = Math.floor((now - (w.decayed_at || w.recency || now)) / 864e5);
    if (days < 1) continue;
    w.weight = clamp(w.weight * Math.pow(0.97, days)); w.decayed_at = now;
    await put('weights', w);
  }
}
async function trimInferred() {
  const ws = (await all('weights')).filter(w => w.kind === 'inferred' && !w.paused);
  if (ws.length <= MAX_INFERRED) return;
  ws.sort((a, b) => a.weight - b.weight);
  await Promise.all(ws.slice(0, ws.length - MAX_INFERRED).map(w => del('weights', w.id)));
}
export const weightMap = () => all('weights').then(ws => Object.fromEntries(ws.map(w => [w.id, w])));

/* Muting a source or a place is a filter, not a weight: you asked not to see it, so it goes.
   Kept in settings so it is visible and reversible in Options, and never silently permanent. */
const LIST = { source: 'mutedSources', place: 'mutedPlaces' };
export async function muteList(kind, value) {
  const key = LIST[kind]; if (!key || !value) return [];
  const s = await settings();
  const v = String(value).toLowerCase();
  const next = s[key].includes(v) ? s[key] : [...s[key], v];
  await setSetting(key, next);
  return next;
}
export async function unmuteList(kind, value) {
  const key = LIST[kind]; if (!key) return [];
  const s = await settings();
  const next = s[key].filter(x => x !== String(value).toLowerCase());
  await setSetting(key, next);
  return next;
}
/** Drop the rows whose source or place you muted. Nothing else filters the feed. */
export function applyMutes(items, { mutedSources = [], mutedPlaces = [] } = {}) {
  if (!mutedSources.length && !mutedPlaces.length) return items;
  const src = new Set(mutedSources), place = new Set(mutedPlaces);
  return items.filter(it => {
    const s = String(it.source?.name ?? it.source ?? '').toLowerCase();
    if (s && src.has(s)) return false;
    for (const p of [it.city, it.state, it.country]) {
      if (p && place.has(String(p).toLowerCase())) return false;
    }
    return true;
  });
}

/* ---------- hackathon facets ----------
   An absent facet is never a match and never a miss: "not stated" is its own answer, and the UI
   says so rather than guessing. Selecting nothing in a facet means that facet is not filtering. */
export const FACETS = {
  mode: { label: 'MODE', options: ['ONLINE', 'IN PERSON'] },
  beginner: { label: 'BEGINNER', options: ['FRIENDLY', 'NOT FRIENDLY'] },
  commitment: { label: 'LENGTH', options: ['UNDER A DAY', '1-3 DAYS', 'LONGER'] },
  focus: { label: 'FOCUS', options: [] }          // filled from the data at render time
};

export const commitmentBand = h =>
  h == null ? null : h < 24 ? 'UNDER A DAY' : h <= 72 ? '1-3 DAYS' : 'LONGER';

/** @returns {string|null} the facet value of this item, or null when the source never said. */
export function facetValue(item, facet) {
  switch (facet) {
    case 'mode': return item.mode === 'online' ? 'ONLINE' : item.mode ? 'IN PERSON' : null;
    case 'beginner': return item.beginnerFriendly == null ? null
      : item.beginnerFriendly ? 'FRIENDLY' : 'NOT FRIENDLY';
    case 'commitment': return commitmentBand(item.commitmentHours);
    case 'focus': return item.focus ? item.focus.toUpperCase() : null;
    default: return null;
  }
}

/**
 * Narrow a list by the chosen facets. `chosen` is {facet: string[]}; an empty or missing array
 * means that facet is off. Rows whose facet the source never stated are kept only when
 * `includeUnstated` is true, and the caller is expected to say so on screen.
 */
export function applyFacets(items, chosen = {}, includeUnstated = true) {
  const active = Object.entries(chosen).filter(([, v]) => Array.isArray(v) && v.length);
  if (!active.length) return items;
  return items.filter(it => active.every(([facet, want]) => {
    const v = facetValue(it, facet);
    return v == null ? includeUnstated : want.includes(v);
  }));
}

/* ---------- applications ----------
   Trust is the whole point of this store, so it is never inferred and never upgraded by us:
     manual    you logged it here. All we know is that you said so.
     external  you applied on the other site. We cannot see the other site.
     platform  a platform confirmed delivery. Nothing here can set this, because nothing here is
               connected to a platform. If it ever appears, it came from a real confirmation.
   Nothing in this app may say an employer received anything. */
export const STAGE_ORDER = ['planned', 'applied', 'screen', 'interview', 'offer', 'reject'];
export const TRUST_WORDS = {
  manual: 'You logged this yourself. Nothing was sent from here.',
  external: 'You applied on the other site. This app cannot confirm what happened there.',
  platform: 'Confirmed by the platform that received it.'
};

/**
 * Start tracking an application. `trust` may only be manual or external: see above.
 * @param {Partial<import('./model.js').FeedItem>|null} item
 * @param {Partial<import('./model.js').Application> & {trust?: string, stage?: string}} [opts]
 */
export async function logApplication(item, { trust = 'manual', stage = 'planned', ...rest } = {}) {
  const t = trust === 'external' ? 'external' : 'manual';
  const app = blankApplication({
    item_id: item?.id ?? null,
    title: item?.title ?? rest.title ?? '',
    org: item?.org ?? rest.org ?? '',
    url: item?.url ?? rest.url ?? null,
    stage, trust: t,
    dates: stage === 'planned' ? [] : [{ stage, at: Date.now() }],
    ...rest
  });
  await put('apps', app);
  return app;
}

/** Move an application to a new stage, keeping the history. Trust never changes here. */
export async function setStage(app, stage, now = Date.now()) {
  if (!STAGE_ORDER.includes(stage) || app.stage === stage) return app;
  app.stage = stage;
  app.dates = [...(app.dates || []), { stage, at: now }];
  app.updated = now;
  await put('apps', app);
  return app;
}

/** Days since the last thing that actually happened. Null when nothing has happened yet.
 *  This is how "no reply" is worked out: an absence, computed, never a stage someone chose. */
export function daysSilent(app, now = Date.now()) {
  const last = (app.dates || []).reduce((m, d) => Math.max(m, d.at || 0), 0);
  if (!last || ['offer', 'reject'].includes(app.stage)) return null;
  return Math.floor((now - last) / 864e5);
}

/* ---------- deadline plans: official date is locked, the rest is yours ---------- */
export async function planFor(item) {
  const p = await get('plans', item.id);
  return p || blankPlan(item.id, item.deadline ?? null);
}
export const savePlan = plan => put('plans', plan);

/* ---------- 15.3 score and drop assembly ---------- */
export const PLACE = { city: 1.0, state: 0.8, country: 0.5, world: 0.2, online: 0.6 };

export function placeOf(item, home = { city: 'Rajkot', state: 'Gujarat', country: 'India' }) {
  if (item.mode === 'online') return 'online';
  if (item.city && item.city === home.city) return 'city';
  if (item.state && item.state === home.state) return 'state';
  if (item.country && item.country === home.country) return 'country';
  return 'world';
}

export function score(item, weights, now = Date.now(), align = 'BALANCED') {
  const kws = (item.skills || []).map(k => k.toLowerCase());
  let I = Math.min(1, kws.reduce((s, k) => s + (weights[k]?.paused ? 0 : (weights[k]?.weight || 0)), 0) / 3);

  const ageH = item.firstSeen ? (now - new Date(item.firstSeen).getTime()) / 36e5 : 0;
  let F = item.type === 'news' ? Math.exp(-ageH / 72) : (ageH < 48 ? 1.0 : 0.5);

  const daysLeft = item.deadline ? (new Date(item.deadline).getTime() - now) / 864e5 : null;
  const U = daysLeft == null ? 0 : (daysLeft > 30 ? 0 : 1 - daysLeft / 30);

  const P = PLACE[placeOf(item)] ?? 0.2;

  if (align === 'MORE') I = Math.min(1, I * 1.3);
  if (align === 'BROADER') { I = I * 0.6; F = Math.min(1, F * 1.3); }

  const parts = { match: 0.45 * I, fresh: 0.15 * F, urgency: 0.20 * U * Math.min(1, I + 0.3), place: 0.20 * P };
  const total = parts.match + parts.fresh + parts.urgency + parts.place;
  // Store the top two contributions so WHY THIS? always tells the truth.
  const why = Object.entries(parts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
  return { total, parts, why, I, daysLeft, place: placeOf(item) };
}

const WILDCARDS = { MORE: 0, BALANCED: 2, BROADER: 3 };

/** 70% best match, 20% POPULAR (labelled, never called personal), 10% wildcard. */
export function assembleDrop(items, weights, { n = 12, align = 'BALANCED', now = Date.now() } = {}) {
  const scored = items.map(it => ({ item: it, s: score(it, weights, now, align) }));
  const wildN = WILDCARDS[align] ?? 2;
  const popN = Math.round(n * 0.20);
  const forMe = n - popN - wildN;

  const isWild = e => {
    const kws = (e.item.skills || []).map(k => k.toLowerCase());
    return kws.some(k => { const w = weights[k]; return w && !w.paused && w.weight >= 0.10 && w.weight <= 0.30; });
  };

  const pool = [...scored].sort((a, b) => b.s.total - a.s.total);
  const pick = [], used = new Set(), clusters = new Set();
  const take = (e, tag) => {
    if (!e || used.has(e.item.id)) return false;
    if (e.item.cluster && clusters.has(e.item.cluster)) return false;   // collapse duplicates
    used.add(e.item.id); if (e.item.cluster) clusters.add(e.item.cluster);
    pick.push({ ...e, tag }); return true;
  };

  for (const e of pool) { if (pick.length >= forMe) break; take(e, 'FOR_ME'); }
  const popular = [...scored].filter(e => !used.has(e.item.id))
    .sort((a, b) => (b.item.sourceCount || 0) - (a.item.sourceCount || 0));
  for (const e of popular) { if (pick.filter(p => p.tag === 'POPULAR').length >= popN) break; take(e, 'POPULAR'); }
  const wild = pool.filter(e => !used.has(e.item.id) && isWild(e));
  for (const e of wild) { if (pick.filter(p => p.tag === 'WILD').length >= wildN) break; take(e, 'WILD'); }
  for (const e of pool) { if (pick.length >= n) break; take(e, 'FOR_ME'); }

  return order(pick);
}

/** Popular at 4 and 9, a wildcard at 6 or 7, max 3 of a type in a row, max 2 from one source in the
 *  first 6. Every card that came in comes out exactly once: this reorders, it never drops or clones. */
function order(pick) {
  const pop = pick.filter(p => p.tag === 'POPULAR');
  const wild = pick.filter(p => p.tag === 'WILD');
  const rest = pick.filter(p => p.tag === 'FOR_ME');

  // 1. reserved slots
  const slots = new Array(pick.length).fill(null);
  const place = (e, i) => { if (e && i >= 0 && i < slots.length && !slots[i]) { slots[i] = e; return true; } return false; };
  const placed = new Set();
  [3, 8].forEach((i, k) => { if (place(pop[k], i)) placed.add(pop[k]); });
  if (wild[0] && (place(wild[0], 5) || place(wild[0], 6))) placed.add(wild[0]);
  if (wild[1]) { const i = slots.findIndex((sl, n) => !sl && n > 8); if (place(wild[1], i)) placed.add(wild[1]); }

  // 2 + 3. Fill the gaps in one constrained pass: at each gap take the best-scoring card left whose
  //         type does not already fill the previous two slots. Falls back to the best card when every
  //         remaining card is the same type, so a drop of one type still fills instead of dying.
  const spare = [...rest, ...pop, ...wild].filter(e => !placed.has(e));
  const typeAt = i => (i >= 0 && slots[i] ? slots[i].item.type : null);
  for (let i = 0; i < slots.length; i++) {
    if (slots[i]) continue;
    const run2 = typeAt(i - 1) && typeAt(i - 1) === typeAt(i - 2) ? typeAt(i - 1) : null;
    let k = run2 ? spare.findIndex(e => e.item.type !== run2) : 0;
    if (k < 0) k = 0;
    slots[i] = spare.splice(k, 1)[0] || null;
  }
  let seq = slots.filter(Boolean);

  // 4. at most 2 from one source in the first 6: swap the offender with a later card from another source
  const srcOf = e => e.item.source?.name || e.item.source || '?';
  const count = {};
  for (let i = 0; i < Math.min(6, seq.length); i++) {
    const src = srcOf(seq[i]);
    count[src] = (count[src] || 0) + 1;
    if (count[src] > 2) {
      const j = seq.findIndex((e, n) => n >= 6 && srcOf(e) !== src);
      if (j > -1) { [seq[i], seq[j]] = [seq[j], seq[i]]; count[src]--; count[srcOf(seq[i])] = (count[srcOf(seq[i])] || 0) + 1; }
    }
  }
  return seq;
}

/* ---------- 17.1 expiry. Unsaved items past expiresAt are gone for good. ---------- */
export const expiresAt = itemExpiresAt;

export function dropExpired(items, personal, now = Date.now()) {
  const keep = new Set(personal.filter(p => p.state !== STATE.SEEN).map(p => p.id));
  return items.filter(it => keep.has(it.id) || expiresAt(it) > now);
}

/* ---------- settings ---------- */
const DEFAULTS = {
  density: 'CHUNKY', align: 'BALANCED', dropSize: 12, volume: 0.7, muted: false, hoverBlips: false,
  crt: false, reduceMotion: false, textScale: 1, wallMaterial: 'cork', deskAsList: false,
  lang: 'en', notifications: false, personalization: true, quietHours: null, githubToken: '',
  mutedSources: [], mutedPlaces: [],
  home: { city: 'Rajkot', state: 'Gujarat', country: 'India' }
};
export async function settings() { return { ...DEFAULTS, ...((await get('meta', 'settings'))?.v || {}) }; }
export async function setSetting(k, v) {
  const cur = (await get('meta', 'settings'))?.v || {};
  cur[k] = v; return put('meta', { id: 'settings', v: cur });
}

/* ---------- 13.3 string lights: one bulb per active day, cumulative, never reset ---------- */
export async function markActiveDay(now = new Date()) {
  const key = now.toISOString().slice(0, 10);
  const rec = (await get('meta', 'activeDays'))?.v || [];
  const fresh = !rec.includes(key);
  if (fresh) { rec.push(key); await put('meta', { id: 'activeDays', v: rec }); }
  return { fresh, count: rec.length, index: rec.length - 1 };
}
export const activeDays = () => get('meta', 'activeDays').then(r => (r?.v || []));
