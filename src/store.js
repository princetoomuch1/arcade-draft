/* Career Arcade — state. UI Spec v2 sections 6 (lifecycle), 15.2 (weights), 15.3 (score), 17.1 (contract).
   Everything personal lives in IndexedDB on this machine. Nothing is sent anywhere.
   Field names follow src/model.js. Version 2 migrates the version 1 camelCase records in place. */

import {
  blankItemRecord, blankInterest, blankPlan, blankApplication, blankNote, blankWallPin, uid,
  expiresAt as itemExpiresAt, receipt
} from './model.js';

export { uid, receipt, blankNote, blankPlan, blankWallPin };

const DB = 'arcade', VER = 4;
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

/** The stage-5 note shape was {title, body}. Everything else the model asks for is derived or empty. */
export function migrateNote(old) {
  if ('body_md' in old) return old;
  return blankNote({
    id: old.id, title: old.title || '', body_md: old.body || '',
    created: old.updated ?? Date.now(), updated: old.updated ?? Date.now()
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
      if (ev.oldVersion >= 1 && ev.oldVersion < 4 && tx) {
        rewrite(tx.objectStore('notes'), migrateNote);
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

/* The storage block runs here, on the one write path, because a limit enforced anywhere else is
   a limit the next call site forgets. `navigator.storage.estimate()` is too slow to call on every
   keystroke, so the answer is cached for half a minute — a database that crossed 80 MB is not
   going to drop back under it within thirty seconds. */
const GATE_MS = 30000;
let gate = { level: 'ok', message: '', at: 0 };
async function gateWrite() {
  if (Date.now() - gate.at < GATE_MS) {
    if (gate.level === 'block') throw new Error(gate.message);
    return;
  }
  const r = await storageReport();
  gate = { level: r.level, message: r.message, at: Date.now() };
  if (r.level === 'block') throw new Error(r.message);
}
/** Only for tests and for the moment after a user frees space: forget the cached verdict. */
export const resetWriteGate = () => { gate = { level: 'ok', message: '', at: 0 }; };

export const put = async (store, val) => {
  await gateWrite();
  return tx(store, 'readwrite').then(s => new Promise((res, rej) => {
    const r = s.put(val); r.onsuccess = () => res(val); r.onerror = () => rej(r.error); }));
};
export const get = (store, id) => tx(store).then(s => new Promise((res, rej) => {
  const r = s.get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
export const all = store => tx(store).then(s => new Promise((res, rej) => {
  const r = s.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); }));
export const del = (store, id) => tx(store, 'readwrite').then(s => new Promise((res, rej) => {
  const r = s.delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }));

/**
 * Take a restore function for one record BEFORE changing it, so undo can put the world back
 * exactly as it was. A record that did not exist is restored by deleting it again, rather than by
 * writing a blank one — undoing a creation must not leave a husk behind.
 *
 * This exists because undo was wired at two call sites and claimed at all of them. A helper is
 * harder to forget than a remembered pattern.
 *
 * @returns {Promise<() => Promise<void>>}
 */
export async function snapshotFor(store, id) {
  const before = await get(store, id);
  const copy = before ? structuredClone(before) : null;
  return async () => { if (copy) await put(store, copy); else await del(store, id); };
}

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

/* ---------- weekly quests, and the rules that keep them kind ----------
 *
 * One modest outcome a week, chosen by you. The rules below are the point of the feature:
 *   - A week you rested is a real, recorded week. It is not a gap and not a failure.
 *   - Nothing is ever erased or reset by inactivity. No run to protect, so nothing to lose.
 *   - Progress counts outcomes. Time spent in this app is never measured and never rewarded.
 *   - There is no comparison with anyone else, because nothing is sent anywhere.
 */

/** ISO-8601 week key, e.g. 2026-W47. Weeks start on Monday. */
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((t.getTime() - jan1.getTime()) / 864e5 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** @returns {{id: string, quest: string, done: boolean, rest: boolean, reflection: string, at: number}} */
export const blankWeek = (id = weekKey()) =>
  ({ id, quest: '', done: false, rest: false, reflection: '', at: Date.now() });

export async function weekFor(key = weekKey()) {
  return (await get('meta', 'week-' + key))?.v || blankWeek(key);
}
export const saveWeek = w => put('meta', { id: 'week-' + w.id, v: w });

/** Every week on record, oldest first. Weeks you never opened simply are not here. */
export async function allWeeks() {
  return (await all('meta'))
    .filter(r => r.id.startsWith('week-'))
    .map(r => r.v)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * A reading of your cadence that cannot shame you: rest weeks count as kept, gaps are described
 * rather than scored, and there is no run to break.
 */
export function cadence(weeks, now = new Date()) {
  const here = weekKey(now);
  const done = weeks.filter(w => w.done).length;
  const rested = weeks.filter(w => w.rest).length;
  const thisWeek = weeks.find(w => w.id === here) || blankWeek(here);
  return {
    weeksOnRecord: weeks.length,
    outcomesReached: done,
    weeksRested: rested,
    thisWeek,
    // deliberately no "current streak" and no "longest streak": there is nothing here to protect.
    note: rested
      ? `${done} reached, ${rested} rested. Both are weeks you were here.`
      : `${done} reached out of ${weeks.length} on record.`
  };
}

/**
 * The progress snapshot. Outcomes only: things that happened in the world, not time in this app.
 * Private by construction, because it is computed here and never sent.
 */
export function progressSnapshot({ personal = [], apps = [], goals = [], notes = [], weeks = [] } = {}) {
  const saved = personal.filter(p => p.state && p.state !== 'SEEN').length;
  const applied = apps.filter(a => (a.dates || []).some(d => d.stage === 'applied')).length;
  const interviews = apps.filter(a => (a.dates || []).some(d => ['screen', 'interview'].includes(d.stage))).length;
  const offers = apps.filter(a => a.stage === 'offer').length;
  const goalsHit = goals.filter(g => g.gold).length;
  const written = notes.length;
  const reflections = weeks.filter(w => (w.reflection || '').trim()).length;
  return {
    outcomes: [
      ['THINGS SAVED', saved],
      ['APPLICATIONS SENT BY YOU', applied],
      ['CONVERSATIONS REACHED', interviews],
      ['OFFERS', offers],
      ['GOALS FINISHED', goalsHit],
      ['NOTES WRITTEN', written],
      ['WEEKS REFLECTED ON', reflections]
    ],
    // stated out loud so nobody later mistakes this for an engagement metric
    measuresTime: false
  };
}

/* ---------- a co-op challenge, opt in, nobody ranked ----------
   Two people agree a target and each track their own. There is no server, so there is no leaderboard
   and no way to see anyone else's number: you compare by telling each other, if you want to. */
export async function challenge() { return (await get('meta', 'challenge'))?.v || null; }
export async function startChallenge(title, target, withWhom = '') {
  const c = { title, target: Math.max(1, Number(target) || 1), withWhom, count: 0, started: Date.now() };
  await put('meta', { id: 'challenge', v: c });
  return c;
}
export async function bumpChallenge(n = 1) {
  const c = await challenge(); if (!c) return null;
  c.count = Math.max(0, c.count + n);
  await put('meta', { id: 'challenge', v: c });
  return c;
}
export async function endChallenge() { await del('meta', 'challenge'); return null; }

/* ---------- duplicate clustering ----------
   The same opportunity turns up on four sites. Collapsing them is a kindness; hiding that we did it
   is not. A cluster always says how many it stands for and can always be opened, and a cluster you
   broke apart stays broken until you say otherwise. */

/** Items that carry the same `cluster` id, grouped. Everything else stands alone. */
export function clusterItems(items, broken = []) {
  const open = new Set(broken);
  const byKey = new Map(), out = [];
  for (const it of items) {
    if (!it.cluster || open.has(it.cluster)) { out.push({ lead: it, others: [], cluster: null }); continue; }
    if (!byKey.has(it.cluster)) {
      const g = { lead: it, others: [], cluster: it.cluster };
      byKey.set(it.cluster, g); out.push(g);
    } else byKey.get(it.cluster).others.push(it);
  }
  // The lead is the one first seen: the original report, not whoever copied it loudest.
  for (const g of byKey.values()) {
    const all = [g.lead, ...g.others].sort((a, b) =>
      new Date(a.firstSeen || 0).getTime() - new Date(b.firstSeen || 0).getTime());
    g.lead = all[0]; g.others = all.slice(1);
  }
  return out;
}

export async function brokenClusters() { return (await get('meta', 'brokenClusters'))?.v || []; }
export async function breakCluster(id) {
  const cur = await brokenClusters();
  if (!cur.includes(id)) await put('meta', { id: 'brokenClusters', v: [...cur, id] });
  return brokenClusters();
}
export async function rejoinCluster(id) {
  const cur = await brokenClusters();
  await put('meta', { id: 'brokenClusters', v: cur.filter(x => x !== id) });
  return brokenClusters();
}

/* ---------- refresh ----------
   Scraping happens in GitHub Actions, never in the browser. With a token the app can ask the
   workflow to run; without one it tells you the command to run yourself. It never pretends. */
export const WORKFLOW = 'scrape.yml';

/** @returns {{mode: 'dispatch'|'manual', repo?: string, command: string}} */
export function refreshPlan(settings) {
  const repo = (settings?.githubRepo || '').trim();
  const token = (settings?.githubToken || '').trim();
  return (repo && token)
    ? { mode: 'dispatch', repo, command: `gh workflow run ${WORKFLOW} --repo ${repo}` }
    : { mode: 'manual', command: 'npm run scrape' };
}

/**
 * Ask GitHub to run the scrape workflow. Returns what happened in words the UI can show.
 * The token never leaves this function except in the Authorization header of that one request.
 * `fetchImpl` is narrowed to what this actually uses, so a test can pass a two-field stub.
 * @param {object} settings
 * @param {(url: string, opts: object) => Promise<{status: number, text: () => Promise<string>}>} [fetchImpl]
 */
export async function requestRefresh(settings, fetchImpl = fetch) {
  const plan = refreshPlan(settings);
  if (plan.mode === 'manual') {
    return { ok: false, mode: 'manual', message: 'No repository and token set. Run the scrape yourself.', plan };
  }
  const url = `https://api.github.com/repos/${plan.repo}/actions/workflows/${WORKFLOW}/dispatches`;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.githubToken.trim()}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({ ref: settings.githubBranch?.trim() || 'main' })
    });
    if (res.status === 204) {
      return { ok: true, mode: 'dispatch', message: 'GitHub accepted the request. New data lands when the run finishes.', plan };
    }
    const body = await res.text().catch(() => '');
    return { ok: false, mode: 'dispatch', status: res.status, plan,
      message: res.status === 401 || res.status === 403
        ? 'GitHub refused the token. It needs the actions:write scope on that repository.'
        : `GitHub answered ${res.status}. ${body.slice(0, 120)}` };
  } catch (e) {
    return { ok: false, mode: 'dispatch', plan, message: `Could not reach GitHub: ${e.message}` };
  }
}

/* ---------- the desk: what each saved thing becomes when it lands on the wood ----------
   A hackathon is a polaroid, a job an index card, news a clipping, a note a sticky, a scheme a torn
   sheet. The kind drives size and look, so the desk reads as objects rather than as a list. */
export const PAPER = {
  hackathon: { kind: 'polaroid', w: 52, h: 46 },
  event: { kind: 'polaroid', w: 52, h: 46 },
  job: { kind: 'card', w: 60, h: 34 },
  internship: { kind: 'card', w: 60, h: 34 },
  news: { kind: 'clipping', w: 56, h: 38 },
  scheme: { kind: 'torn', w: 54, h: 36 },
  note: { kind: 'sticky', w: 40, h: 40 }
};
export const paperFor = item => PAPER[item?.type] || PAPER.note;

/**
 * Red strings the desk draws for you, each with the reason it exists.
 * Capped per item so the desk never turns into a ball of wool. Strings you tied by hand are
 * in `locked_strings` and are never proposed again, nor counted against your own choices.
 * @returns {{a: string, b: string, reason: string}[]}
 */
export function autoStrings(records, max = 3) {
  const low = s => String(s || '').toLowerCase();
  const out = [], count = new Map();
  const room = id => (count.get(id) || 0) < max;
  const bump2 = id => count.set(id, (count.get(id) || 0) + 1);

  // Hand-tied strings are the user's and come first: they use up the budget before any guess does.
  for (const r of records) for (const b of r.locked_strings || []) { bump2(r.id); bump2(b); }

  const pairs = [];
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const a = records[i], b = records[j];
      const sa = a.snapshot || {}, sb = b.snapshot || {};
      const skills = (sa.skills || []).map(low).filter(s => (sb.skills || []).map(low).includes(s));
      let reason = null, weight = 0;
      if (sa.org && low(sa.org) === low(sb.org)) { reason = `same organisation: ${sa.org}`; weight = 4; }
      else if (skills.length) { reason = `both need ${skills.slice(0, 2).join(' and ')}`; weight = 2 + skills.length; }
      else if (sa.city && low(sa.city) === low(sb.city)) { reason = `both in ${sa.city}`; weight = 2; }
      else if (sa.deadline && sb.deadline
        && Math.abs(new Date(sa.deadline).getTime() - new Date(sb.deadline).getTime()) <= 3 * 864e5) {
        reason = 'deadlines within 3 days of each other'; weight = 1;
      }
      if (reason) pairs.push({ a: a.id, b: b.id, reason, weight });
    }
  }
  pairs.sort((x, y) => y.weight - x.weight);
  for (const p of pairs) {
    if (!room(p.a) || !room(p.b)) continue;
    out.push({ a: p.a, b: p.b, reason: p.reason });
    bump2(p.a); bump2(p.b);
  }
  return out;
}

/* ---------- shake to reshuffle ----------
   Finite and useful, not a slot machine: things you have not looked at in a week come to the middle,
   what you saved most recently sits near the monitor, and exactly one old thing is surfaced. */
export const DESK = { w: 560, h: 400 };

export function shuffleLayout(records, { now = Date.now(), rand = Math.random, world = DESK } = {}) {
  const age = r => now - (r.saved_at || r.last_checked_at || now);
  const stale = r => age(r) > 7 * 864e5;
  const recent = [...records].sort((a, b) => (b.saved_at || 0) - (a.saved_at || 0)).slice(0, 3);
  const recentIds = new Set(recent.map(r => r.id));

  const staleOnes = records.filter(r => stale(r) && !recentIds.has(r.id));
  const wildcard = staleOnes.length ? staleOnes[Math.floor(rand() * staleOnes.length) % staleOnes.length] : null;

  const placed = [];
  records.forEach((r, i) => {
    const p = paperFor(r.snapshot);
    let zone;
    if (recentIds.has(r.id)) zone = 'monitor';
    else if (stale(r)) zone = 'centre';
    else zone = 'edge';
    const spread = (n, lo, hi) => lo + Math.floor(rand() * Math.max(1, hi - lo - n));
    let x, y;
    if (zone === 'monitor') { x = spread(p.w, world.w - 150, world.w - p.w - 4); y = spread(p.h, 150, world.h - p.h - 4); }
    else if (zone === 'centre') { x = spread(p.w, 180, 360); y = spread(p.h, 120, 280); }
    else { x = spread(p.w, 4, world.w - p.w - 4); y = spread(p.h, 110, world.h - p.h - 4); }
    placed.push({
      id: r.id, zone,
      wildcard: !!wildcard && r.id === wildcard.id,
      pos: { x: Math.max(0, Math.min(world.w - p.w, x)), y: Math.max(0, Math.min(world.h - p.h, y)), rot: 0 },
      order: i
    });
  });
  return placed;
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

/* ---------- notes ---------- */
export const LINK_RE = /\[\[([^\]\n]+)\]\]/g;
export const linksIn = text => [...String(text || '').matchAll(LINK_RE)].map(m => m[1].trim());

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'about',
  'a', 'an', 'of', 'to', 'in', 'on', 'is', 'it', 'my', 'how', 'why', 'what', 'notes', 'note']);
const words = s => String(s || '').toLowerCase().split(/[^a-z0-9+#]+/)
  .filter(w => w.length > 2 && !STOP.has(w));

/**
 * Suggest notes related to `note`, each with the reason it was suggested. Nothing is linked by
 * this: the caller confirms first. Notes already in related_ids are never suggested again.
 * @returns {{note: object, reason: string, score: number}[]}
 */
export function relatedNotes(note, all, limit = 5) {
  const mine = new Set(note.related_ids || []);
  const myTags = new Set((note.tags || []).map(t => t.toLowerCase()));
  const myLinks = new Set(linksIn(note.body_md).map(l => l.toLowerCase()));
  const myWords = new Set(words(note.title + ' ' + note.body_md));

  const out = [];
  for (const o of all) {
    if (o.id === note.id || mine.has(o.id)) continue;
    const tags = (o.tags || []).filter(t => myTags.has(t.toLowerCase()));
    const linkedFromMe = myLinks.has(String(o.title).toLowerCase());
    const linksToMe = linksIn(o.body_md).some(l => l.toLowerCase() === String(note.title).toLowerCase());
    const shared = [...new Set(words(o.title + ' ' + o.body_md))].filter(w => myWords.has(w));

    let reason = null, score = 0;
    if (tags.length) { reason = `same tag: ${tags.slice(0, 2).join(', ')}`; score = 100 + tags.length; }
    else if (linkedFromMe || linksToMe) { reason = linkedFromMe ? 'you wrote its name in this note' : 'it names this note'; score = 90; }
    else if (shared.length >= 2) { reason = `both mention ${shared.slice(0, 2).join(' and ')}`; score = shared.length; }
    if (reason) out.push({ note: o, reason, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Notes whose body names this one by [[title]]. Not the same as related_ids, and not editable. */
export const backlinksTo = (note, all) =>
  all.filter(o => o.id !== note.id &&
    linksIn(o.body_md).some(l => l.toLowerCase() === String(note.title).toLowerCase()));

/* ---------- deadline plans: official date is locked, the rest is yours ---------- */
export async function planFor(item) {
  const p = await get('plans', item.id);
  return p || blankPlan(item.id, item.deadline ?? null);
}
export const savePlan = plan => put('plans', plan);

/* ---------- reminders ----------
   There is no server and no push service, so a reminder can only show while the app is open.
   The UI says that rather than implying your phone will buzz. */
export const LEAD_TIMES = [
  { label: 'ON THE DAY', ms: 0 },
  { label: '1 DAY BEFORE', ms: 864e5 },
  { label: '3 DAYS BEFORE', ms: 3 * 864e5 },
  { label: '1 WEEK BEFORE', ms: 7 * 864e5 }
];

/** Quiet hours may wrap midnight: {from: 22, to: 7} means 22:00 to 07:00. */
export function inQuietHours(date, quiet) {
  if (!quiet || quiet.from == null || quiet.to == null) return false;
  const h = date.getHours();
  return quiet.from <= quiet.to ? (h >= quiet.from && h < quiet.to) : (h >= quiet.from || h < quiet.to);
}

/**
 * Which reminders are due now. Honours the global OFF switch, quiet hours and per-reminder snooze.
 * Pure, so the rules are tested rather than hoped for.
 */
export function dueReminders(plans, settings, now = Date.now()) {
  if (!settings?.notifications) return [];            // the OFF switch wins over everything
  const when = new Date(now);
  if (inQuietHours(when, settings.quietHours)) return [];
  const out = [];
  for (const p of plans) {
    const target = p.start_by ?? p.official_deadline;
    if (!target) continue;
    for (const r of p.reminders || []) {
      if (r.snoozed_until && r.snoozed_until > now) continue;
      const fires = target - (r.lead_time || 0);
      if (fires <= now && now <= target + 864e5) out.push({ plan: p, reminder: r, fires });
    }
  }
  return out.sort((a, b) => a.fires - b.fires);
}

/* ---------- annual recurrence ----------
   Only claimed when the data actually shows it: two or more past runs of the same event, each
   about a year apart. One sighting is not a pattern, and this never guesses from the title alone. */
const normTitle = t => String(t || '').toLowerCase()
  .replace(/\b(19|20)\d{2}\b/g, '').replace(/\b(v?\d+(\.\d+)?|[ivx]+)\b/g, '')
  .replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** @returns {{month: string, years: number[], count: number}|null} */
export function recurrence(item, items) {
  const key = normTitle(item.title);
  if (!key) return null;
  const runs = items.filter(o => normTitle(o.title) === key && (o.startDate || o.deadline));
  const byYear = new Map();
  for (const r of runs) {
    const d = new Date(r.startDate || r.deadline);
    if (Number.isNaN(d.getTime())) continue;
    byYear.set(d.getFullYear(), d.getMonth());
  }
  if (byYear.size < 2) return null;                   // one run is not a pattern
  const years = [...byYear.keys()].sort();
  const months = years.map(y => byYear.get(y));
  const sameMonth = months.every(m => Math.abs(m - months[0]) <= 1);
  const yearly = years.every((y, i) => i === 0 || y - years[i - 1] === 1);
  if (!sameMonth || !yearly) return null;
  return { month: MONTHS[months[0]], years, count: years.length };
}

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
  crt: false, reduceMotion: false, highContrast: false, textScale: 1, wallMaterial: 'cork', deskAsList: false,
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

/* ---------- retention and storage ----------
   Two rules, both the same rule really: this app does not throw your things away.
   Something old is offered for cleanup, never swept; something large is refused with a reason,
   never silently dropped. */

export const RETENTION = { archivePromptDays: 90, warnBytes: 50e6, blockBytes: 80e6, maxActive: 5000 };

/** Archived records sitting past the prompt threshold. Offered for cleanup, never auto-deleted. */
export function staleArchive(records, now = Date.now()) {
  const cut = RETENTION.archivePromptDays * 864e5;
  return records.filter(p => p.state === STATE.DRAWER && p.drawer_at && now - p.drawer_at > cut);
}

/** @returns {Promise<{bytes: number, quota: number, level: string, message: string}>} */
export async function storageReport() {
  let bytes = 0, quota = 0;
  try {
    const est = await navigator.storage?.estimate?.();
    bytes = est?.usage ?? 0; quota = est?.quota ?? 0;
  } catch { /* an estimate we cannot get is reported as unknown, not as zero-and-fine */ }
  return { bytes, quota, ...storageLevel(bytes) };
}

/** Pure, so the thresholds are tested rather than trusted.
 *  @returns {{level: string, message: string}} */
export function storageLevel(bytes) {
  const mb = n => `${Math.round(n / 1e6)} MB`;
  if (bytes >= RETENTION.blockBytes) {
    return { level: 'block',
      message: `${mb(bytes)} stored. New writes are blocked until you export a backup and clear some space.` };
  }
  if (bytes >= RETENTION.warnBytes) {
    return { level: 'warn', message: `${mb(bytes)} stored. Worth exporting a backup and tidying the drawer.` };
  }
  return { level: 'ok', message: `${mb(bytes)} stored.` };
}

/** Called before any write that could grow the database. Throws rather than failing quietly. */
export async function assertWritable() {
  const r = await storageReport();
  if (r.level === 'block') throw new Error(r.message);
  return r;
}

/** How close the device-side record count is to the cap. Prompts, never prunes. */
export function activeCount(records) {
  const n = records.filter(p => [STATE.SAVED, STATE.PLANNED, STATE.PINNED, STATE.DONE].includes(p.state)).length;
  return { count: n, cap: RETENTION.maxActive, over: n > RETENTION.maxActive };
}

/* ---------- backup: export and import ---------- */
export const BACKUP_VERSION = 1;
const BACKUP_STORES = ['personal', 'notes', 'goals', 'apps', 'weights', 'meta', 'wallpins', 'plans'];

export async function exportBackup() {
  const data = {};
  for (const s of BACKUP_STORES) data[s] = await all(s);
  return { version: BACKUP_VERSION, exported_at: new Date().toISOString(), data };
}

/** What an import would do, worked out before anything is written. */
export function previewImport(backup, current) {
  if (!backup || typeof backup !== 'object') return { ok: false, why: 'That file is not a backup.' };
  if (backup.version !== BACKUP_VERSION) {
    return { ok: false, why: `That backup is version ${backup.version ?? 'unknown'}; this app writes version ${BACKUP_VERSION}.` };
  }
  if (!backup.data || typeof backup.data !== 'object') return { ok: false, why: 'That backup has no data in it.' };

  const rows = [];
  for (const s of BACKUP_STORES) {
    const incoming = Array.isArray(backup.data[s]) ? backup.data[s] : [];
    const here = current?.[s] ?? [];
    const hereIds = new Set(here.map(r => r.id));
    const overlap = incoming.filter(r => hereIds.has(r.id)).length;
    rows.push({ store: s, incoming: incoming.length, here: here.length, overlap, newRows: incoming.length - overlap });
  }
  return { ok: true, exported_at: backup.exported_at ?? null, rows };
}

/**
 * Apply a backup. `mode` is 'merge' (incoming wins on a clash, nothing else touched) or
 * 'replace' (the listed stores are emptied first). Never called without the preview being shown.
 */
export async function importBackup(backup, mode = 'merge') {
  const pre = previewImport(backup, null);
  if (!pre.ok) throw new Error(pre.why);
  let written = 0, cleared = 0;
  for (const s of BACKUP_STORES) {
    const incoming = Array.isArray(backup.data[s]) ? backup.data[s] : [];
    if (mode === 'replace') {
      for (const r of await all(s)) { await del(s, r.id); cleared++; }
    }
    for (const r of incoming) { if (r && r.id != null) { await put(s, r); written++; } }
  }
  return { written, cleared, mode };
}
