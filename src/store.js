/* Opportunity Hub — state. UI Spec v2 sections 6 (lifecycle), 15.2 (weights), 15.3 (score), 17.1 (contract).
   Everything personal lives in IndexedDB on this machine. Nothing is sent anywhere. */

const DB = 'arcade', VER = 1;
const STORES = ['items', 'personal', 'notes', 'goals', 'apps', 'weights', 'meta'];

let db = null;
export function open() {
  if (db) return Promise.resolve(db);
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
    };
    r.onsuccess = () => { db = r.result; res(db); };
    r.onerror = () => rej(r.error);
  });
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
  SEEN:'SEEN', SAVED:'SAVED', PLANNED:'PLANNED', PINNED:'PINNED', DONE:'DONE',
  EXPIRED:'EXPIRED', DRAWER:'DRAWER', KEPT:'KEPT', GOLD:'GOLD'
};
const DRAWER_DAYS = 14;

/** Personal record for an item. Absent means never touched: it is a plain feed item. */
const blank = id => ({ id, state: STATE.SEEN, savedAt:null, plannedFor:null, drawerAt:null,
                       deskPos:null, wallZone:null, strings:[], snapshot:null, notes:[] });

export async function mark(item, state, extra = {}) {
  const p = (await get('personal', item.id)) || blank(item.id);
  p.state = state;
  if (state === STATE.SAVED && !p.savedAt) p.savedAt = Date.now();
  if (state === STATE.DRAWER) p.drawerAt = Date.now();
  if (state === STATE.SAVED || state === STATE.PLANNED) {
    // Keep a snapshot: the source copy is deleted when it expires, the user's copy must survive.
    p.snapshot = { title:item.title, org:item.org, url:item.url, source:item.source,
                   deadline:item.deadline, city:item.city, skills:item.skills, type:item.type };
  }
  Object.assign(p, extra);
  return put('personal', p);
}
export const personalFor = id => get('personal', id).then(p => p || blank(id));

/** Items in the drawer past 14 days are gone for good. Called on every boot. */
export async function sweepDrawer(now = Date.now()) {
  const ps = await all('personal');
  const dead = ps.filter(p => p.state === STATE.DRAWER && p.drawerAt && now - p.drawerAt > DRAWER_DAYS * 864e5);
  await Promise.all(dead.map(p => del('personal', p.id)));
  return dead.length;
}
export const drawerDaysLeft = p =>
  p.state === STATE.DRAWER && p.drawerAt ? Math.max(0, DRAWER_DAYS - Math.floor((Date.now() - p.drawerAt) / 864e5)) : null;

/* ---------- 15.2 interest weights ---------- */
const DELTA = { save:0.15, more:0.25, plan:0.20, open:0.05, read:0.05, less:-0.30 };
const MAX_GUESSED = 200;
const clamp = n => Math.min(1, Math.max(0, n));

/** CHOSE = the user typed it, weight 1.0, never decays. GUESSED = inferred, starts 0.20, decays. */
export async function bump(keywords, event) {
  const d = DELTA[event]; if (d == null) return;
  for (const k of keywords || []) {
    const key = k.toLowerCase().trim(); if (!key) continue;
    const w = (await get('weights', key)) || { id:key, w:0.20, kind:'GUESSED', seen:0, last:Date.now() };
    if (w.kind === 'CHOSE') continue;                 // user's own interests are not nudged by behaviour
    if (w.muted) continue;
    w.w = clamp(w.w + d); w.seen++; w.last = Date.now();
    await put('weights', w);
  }
  await trimGuessed();
}
export async function chooseInterest(keyword) {
  const key = keyword.toLowerCase().trim();
  return put('weights', { id:key, w:1.0, kind:'CHOSE', seen:0, last:Date.now() });
}
export async function muteTopic(keyword) {
  const key = keyword.toLowerCase().trim();
  return put('weights', { id:key, w:0, kind:'GUESSED', muted:true, last:Date.now() });
}
/** Skipping only counts after 3 skips of the same keyword inside 7 days. */
export async function skipped(keywords) {
  for (const k of keywords || []) {
    const key = k.toLowerCase().trim(); if (!key) continue;
    const w = (await get('weights', key)); if (!w || w.kind === 'CHOSE' || w.muted) continue;
    const recent = (w.skips || []).filter(t => Date.now() - t < 7 * 864e5);
    recent.push(Date.now()); w.skips = recent;
    w.w = clamp(w.w + (recent.length >= 3 ? -0.03 : -0.01));
    await put('weights', w);
  }
}
/** GUESSED weights lose 3% a day: half-life about 23 days. CHOSE weights do not move. */
export async function decay(now = Date.now()) {
  const ws = await all('weights');
  for (const w of ws) {
    if (w.kind === 'CHOSE' || w.muted) continue;
    const days = Math.floor((now - (w.decayedAt || w.last || now)) / 864e5);
    if (days < 1) continue;
    w.w = clamp(w.w * Math.pow(0.97, days)); w.decayedAt = now;
    await put('weights', w);
  }
}
async function trimGuessed() {
  const ws = (await all('weights')).filter(w => w.kind === 'GUESSED' && !w.muted);
  if (ws.length <= MAX_GUESSED) return;
  ws.sort((a, b) => a.w - b.w);
  await Promise.all(ws.slice(0, ws.length - MAX_GUESSED).map(w => del('weights', w.id)));
}
export const weightMap = () => all('weights').then(ws => Object.fromEntries(ws.map(w => [w.id, w])));

/* ---------- 15.3 score and drop assembly ---------- */
export const PLACE = { city:1.0, state:0.8, country:0.5, world:0.2, online:0.6 };

export function placeOf(item, home = { city:'Rajkot', state:'Gujarat', country:'India' }) {
  if (item.mode === 'online') return 'online';
  if (item.city && item.city === home.city) return 'city';
  if (item.state && item.state === home.state) return 'state';
  if (item.country && item.country === home.country) return 'country';
  return 'world';
}

export function score(item, weights, now = Date.now(), align = 'BALANCED') {
  const kws = (item.skills || []).map(k => k.toLowerCase());
  let I = Math.min(1, kws.reduce((s, k) => s + (weights[k]?.muted ? 0 : (weights[k]?.w || 0)), 0) / 3);

  const ageH = item.firstSeen ? (now - new Date(item.firstSeen).getTime()) / 36e5 : 0;
  let F = item.type === 'news' ? Math.exp(-ageH / 72) : (ageH < 48 ? 1.0 : 0.5);

  const daysLeft = item.deadline ? (new Date(item.deadline).getTime() - now) / 864e5 : null;
  const U = daysLeft == null ? 0 : (daysLeft > 30 ? 0 : 1 - daysLeft / 30);

  const P = PLACE[placeOf(item)] ?? 0.2;

  if (align === 'MORE')    I = Math.min(1, I * 1.3);
  if (align === 'BROADER') { I = I * 0.6; F = Math.min(1, F * 1.3); }

  const parts = { match:0.45*I, fresh:0.15*F, urgency:0.20*U*Math.min(1, I + 0.3), place:0.20*P };
  const total = parts.match + parts.fresh + parts.urgency + parts.place;
  // Store the top two contributions so WHY THIS? always tells the truth.
  const why = Object.entries(parts).sort((a,b) => b[1]-a[1]).slice(0,2).map(([k]) => k);
  return { total, parts, why, I, daysLeft, place: placeOf(item) };
}

const WILDCARDS = { MORE:0, BALANCED:2, BROADER:3 };

/** 70% best match, 20% POPULAR (labelled, never called personal), 10% wildcard. */
export function assembleDrop(items, weights, { n = 12, align = 'BALANCED', now = Date.now() } = {}) {
  const scored = items.map(it => ({ item: it, s: score(it, weights, now, align) }));
  const wildN = WILDCARDS[align] ?? 2;
  const popN  = Math.round(n * 0.20);
  const forMe = n - popN - wildN;

  const isWild = e => {
    const kws = (e.item.skills || []).map(k => k.toLowerCase());
    return kws.some(k => { const w = weights[k]; return w && !w.muted && w.w >= 0.10 && w.w <= 0.30; });
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
  const pop  = pick.filter(p => p.tag === 'POPULAR');
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
export const expiresAt = it => it.expiresAt ? new Date(it.expiresAt).getTime()
  : it.deadline ? new Date(it.deadline).getTime()
  : it.endDate  ? new Date(it.endDate).getTime()
  : it.lastSeen ? new Date(it.lastSeen).getTime() + 30 * 864e5 : Infinity;

export function dropExpired(items, personal, now = Date.now()) {
  const keep = new Set(personal.filter(p => p.state !== STATE.SEEN).map(p => p.id));
  return items.filter(it => keep.has(it.id) || expiresAt(it) > now);
}

/* ---------- settings ---------- */
const DEFAULTS = {
  density:'CHUNKY', align:'BALANCED', dropSize:12, volume:0.7, muted:false, hoverBlips:false,
  crt:false, reduceMotion:false, textScale:1, wallMaterial:'cork', deskAsList:false,
  lang:'en', notifications:false, home:{ city:'Rajkot', state:'Gujarat', country:'India' }
};
export async function settings() { return { ...DEFAULTS, ...((await get('meta', 'settings'))?.v || {}) }; }
export async function setSetting(k, v) {
  const cur = (await get('meta', 'settings'))?.v || {};
  cur[k] = v; return put('meta', { id:'settings', v:cur });
}

/* ---------- 13.3 string lights: one bulb per active day, cumulative, never reset ---------- */
export async function markActiveDay(now = new Date()) {
  const key = now.toISOString().slice(0, 10);
  const rec = (await get('meta', 'activeDays'))?.v || [];
  const fresh = !rec.includes(key);
  if (fresh) { rec.push(key); await put('meta', { id:'activeDays', v:rec }); }
  return { fresh, count: rec.length, index: rec.length - 1 };
}
export const activeDays = () => get('meta', 'activeDays').then(r => (r?.v || []));
