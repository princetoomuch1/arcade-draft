/* Opportunity Hub — boot, router, chrome. UI Spec v2 sections 6, 7, 14.2, 18.
   Desktop only: mouse and keyboard, landscape, minimum 900 x 560 CSS px. */

import { apply, metrics, tooSmall, DENSITY } from './u.js';
import * as S from './store.js';
import { init as audioInit, SFX, setVolume, setMuted, setHoverBlips, toggleMute, touch as audioTouch } from './sound.js';

const $  = (s, r = document) => r.querySelector(s);
const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };

/* ---------- pages. Each module exports render(ctx) -> HTMLElement and optional keys/title. ---------- */
const PAGES = {
  feed:    () => import('./pages/feed.js'),
  jobs:    () => import('./pages/jobs.js'),
  hacks:   () => import('./pages/hacks.js'),
  news:    () => import('./pages/news.js'),
  more:    () => import('./pages/more.js'),
  notes:   () => import('./pages/notes.js'),
  cal:     () => import('./pages/calendar.js'),
  apps:    () => import('./pages/apps.js'),
  opts:    () => import('./pages/options.js'),
  desk:    () => import('./desk.js'),
  wall:    () => import('./wall.js')
};
const TABS = [
  ['feed',  'FEED',  'M1 3h10v8H1z M3 5h6M3 7h6M3 9h4'],
  ['jobs',  'JOBS',  'M2 4h10v8H2z M5 4V2h4v2'],
  ['hacks', 'HACKS', 'M7 1l2 5h5l-4 3 1 5-4-3-4 3 1-5-4-3h5z'],
  ['news',  'NEWS',  'M1 2h12v10H1z M3 4h5v3H3z M9 4h3M9 6h3M3 9h9'],
  ['more',  'MORE',  'M3 7h2M6 7h2M9 7h2']
];
const KEYS = {
  f:'feed', j:'jobs', h:'hacks', n:'news', m:'more', d:'desk', w:'wall'
};

/* ---------- app state shared with pages ---------- */
export const ctx = {
  items: [], weights: {}, settings: null, coins: 0, level: 1, startedAt: Date.now(),
  go, toast, refreshChrome, SFX
};

/* ---------- data ---------- */
async function loadData() {
  const files = ['hackathons', 'jobs', 'news', 'schemes'];
  const out = [];
  for (const f of files) {
    try {
      const r = await fetch(`data/${f}.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      out.push(...(j.items || []));
    } catch (e) {
      console.warn(`data/${f}.json did not load:`, e.message);
    }
  }
  const personal = await S.all('personal');
  // 17.1: anything past expiresAt that the user never saved is gone. The scraper deletes it too;
  // this is the client-side guarantee so a stale JSON never shows a dead opportunity as live.
  return S.dropExpired(out, personal);
}

/* ---------- chrome ---------- */
function buildChrome() {
  const app = $('#app');
  app.innerHTML = '';

  const cabinet = el('div', 'cabinet');
  const win = el('div', 'crt-window corner-3');
  cabinet.append(win);

  // top bar
  const top = el('div', 'topbar');
  const logo = el('div', 't-title logo halo-cyan', 'CAREER ARCADE');
  const spacer = el('div', 'spacer');
  const coins = el('div', 'readout');
  coins.innerHTML = `<svg class="coin-icon" viewBox="0 0 8 8" aria-hidden="true"><rect x="1" y="0" width="6" height="8" fill="#FFD93D"/><rect x="0" y="1" width="8" height="6" fill="#FFD93D"/><rect x="3" y="2" width="2" height="4" fill="#0F0F1B"/></svg><span class="t-label coins" id="coins">000</span>`;
  const lvl = el('div', 't-label lvl readout'); lvl.id = 'lvl';
  const timer = el('div', 't-label timer readout'); timer.id = 'timer';
  const pause = el('button', 'btn is-ghost t-small', 'PAUSE');
  pause.id = 'pause'; pause.title = 'Mute all sound (M)';
  pause.onclick = () => { const m = toggleMute(); pause.textContent = m ? 'MUTED' : 'PAUSE'; };
  top.append(logo, spacer, coins, lvl, timer, pause);

  // tab bar
  const tabs = el('div', 'tabbar');
  tabs.setAttribute('role', 'tablist');
  for (const [route, label, path] of TABS) {
    const b = el('button', 'tab t-small');
    b.setAttribute('role', 'tab'); b.dataset.route = route;
    b.innerHTML = `<svg viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1"><path d="${path}"/></svg><span>${label}</span>`;
    b.onmouseenter = () => SFX.hover();
    b.onclick = () => { SFX.click(); go(route); };
    tabs.append(b);
  }

  const page = el('main', 'page'); page.id = 'page'; page.setAttribute('role', 'main');
  const keybar = el('div', 'keybar t-small'); keybar.id = 'keybar';

  const crt = el('div', 'crt z-crt');
  crt.innerHTML = '<div class="scan"></div><div class="vig"></div>';
  crt.id = 'crt';
  const wipe = el('div', 'wipe z-wipe'); wipe.id = 'wipe'; wipe.innerHTML = '<i></i>'.repeat(8);
  const power = el('div', 'power z-wipe'); power.id = 'power';

  const small = el('div', 'too-small');
  small.innerHTML = `<div class="t-display" style="color:var(--orange)">RESIZE THE WINDOW</div>
    <p class="t-body" id="small-msg"></p>
    <p class="t-small" style="color:var(--muted)">This app is built for a desktop window. There is no phone layout.</p>`;

  win.append(top, tabs, page, keybar, crt, wipe, power, small);
  app.append(cabinet);
}

function refreshChrome() {
  const c = $('#coins'); if (c) c.textContent = String(ctx.coins).padStart(3, '0');
  const l = $('#lvl');   if (l) l.textContent = `LVL ${ctx.level}`;
  const t = $('#timer');
  if (t) {
    const min = Math.floor((Date.now() - ctx.startedAt) / 60000);
    t.textContent = min >= 60 ? `${Math.floor(min / 60)}H` : `${min}M`;
    t.title = 'Time in this session. Click PAUSE to mute.';
  }
  const m = metrics(ctx.settings?.density || 'CHUNKY');
  const msg = $('#small-msg');
  if (msg) msg.textContent = `Window is ${innerWidth} × ${innerHeight}. Minimum is 900 × 560.`;
  document.documentElement.dataset.tooSmall = String(m.tooSmall);
  const crt = $('#crt'); if (crt) crt.dataset.on = String(!!ctx.settings?.crt);
}

/* ---------- 14.2 page wipe: 240 ms in, swap while covered, 240 ms out. Input back at 360 ms. ---------- */
let wiping = false;
function wipeSwap(fn) {
  const w = $('#wipe');
  if (!w || ctx.settings?.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches) { fn(); return; }
  if (wiping) { fn(); return; }
  wiping = true;
  w.dataset.dir = 'in';
  setTimeout(() => { fn(); w.dataset.dir = 'out'; }, 240);
  setTimeout(() => { w.removeAttribute('data-dir'); wiping = false; }, 480);
}

/* ---------- router ---------- */
let current = null;
export async function go(route, params = {}) {
  const r = (route || 'feed').replace(/^#\/?/, '');
  const [name] = r.split('/');
  if (!PAGES[name]) return go('feed');
  if (location.hash !== `#/${r}`) { history.pushState({}, '', `#/${r}`); }
  if (current === name) { await mount(name, params); return; }
  wipeSwap(async () => { await mount(name, params); });
  current = name;
}

async function mount(name, params) {
  const host = $('#page');
  if (!host) return;
  let mod;
  try { mod = await PAGES[name](); }
  catch (e) {
    host.innerHTML = '';
    const d = el('div', 'stub t-body');
    d.innerHTML = `<p><b>${name.toUpperCase()}</b> is not built yet.</p><p class="t-small">${e.message}</p>`;
    host.append(d);
    return;
  }
  host.innerHTML = '';
  host.scrollTop = 0;
  const node = await mod.render(ctx, params);
  if (node) host.append(node);
  for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-selected', String(b.dataset.route === name));
  renderKeybar(mod.keys);
  document.title = (mod.title ? mod.title + ' — ' : '') + 'Career Arcade';
}

function renderKeybar(extra = []) {
  const bar = $('#keybar'); if (!bar) return;
  const base = [['F','FEED'],['J','JOBS'],['H','HACKS'],['N','NEWS'],['M','MORE'],['D','DESK'],['W','WALL']];
  bar.innerHTML = '';
  for (const [k, name] of [...base, ...extra]) {
    const s = el('span', 'k');
    s.innerHTML = `<b>[${k}]</b><span>${name}</span>`;
    bar.append(s);
  }
}

/* ---------- keyboard: the fast path on desktop (section 18.4) ---------- */
function onKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  const k = e.key.toLowerCase();
  audioInit(); audioTouch();
  if (KEYS[k]) { e.preventDefault(); SFX.click(); return go(KEYS[k]); }
  if (k === 'escape') { e.preventDefault(); SFX.back(); return go('feed'); }
  if (k === 'm' && e.shiftKey) { e.preventDefault(); const m = toggleMute(); const p = $('#pause'); if (p) p.textContent = m ? 'MUTED' : 'PAUSE'; return; }
  // page-local keys get the event through this custom event
  document.dispatchEvent(new CustomEvent('arcade:key', { detail: { key: k, shift: e.shiftKey, raw: e } }));
}

/* ---------- toast ---------- */
export function toast(text, kind = '') {
  const host = $('.crt-window'); if (!host) return;
  const t = el('div', `chip t-label z-toast ${kind}`, text);
  t.style.position = 'absolute'; t.style.bottom = 'calc(16 * var(--u))'; t.style.left = 'calc(6 * var(--u))';
  t.classList.add('corner-2', 'sh-card');
  host.append(t);
  setTimeout(() => t.remove(), 2600);
}

/* ---------- 7.4 boot: cabinet -> INSERT COIN -> PRESS START -> menu ---------- */
function bootScreen() {
  const host = $('#page'); host.innerHTML = '';
  const b = el('div', 'boot');
  b.innerHTML = `
    <div class="t-boot halo-cyan blink-600" style="color:var(--cyan)">INSERT COIN</div>
    <p class="t-small" style="color:var(--muted)">click the slot, or press any key</p>
    <div class="coin-plate corner-1 bevel" id="plate">
      <div class="slot"></div>
      <div class="t-small" style="margin-top:calc(2*var(--u))">1 COIN</div>
    </div>`;
  host.append(b);
  const start = () => {
    SFX.coin();
    b.innerHTML = `<div class="t-title blink" style="color:var(--gold)">PRESS START</div>`;
    const go2 = () => { SFX.pressStart(); powerOn(); go('feed'); };
    document.addEventListener('keydown', go2, { once: true });
    b.addEventListener('click', go2, { once: true });
  };
  $('#plate').onclick = () => { audioInit(); start(); };
  document.addEventListener('keydown', () => { audioInit(); start(); }, { once: true });
}

function powerOn() {
  const p = $('#power'); if (!p) return;
  if (ctx.settings?.reduceMotion) return;
  p.dataset.phase = 'on'; SFX.powerOn();
  setTimeout(() => p.removeAttribute('data-phase'), 560);
}

/* ---------- boot ---------- */
async function boot() {
  ctx.settings = await S.settings();
  apply(ctx.settings.density);
  buildChrome();
  refreshChrome();

  setVolume(ctx.settings.volume);
  setMuted(ctx.settings.muted);
  setHoverBlips(ctx.settings.hoverBlips);

  await S.persist();
  const swept = await S.sweepDrawer();
  await S.decay();

  const day = await S.markActiveDay();
  ctx.items   = await loadData();
  ctx.weights = await S.weightMap();
  const personal = await S.all('personal');
  ctx.coins = personal.filter(p => p.state !== S.STATE.SEEN).length;
  ctx.level = 1 + Math.floor(personal.filter(p => [S.STATE.PLANNED, S.STATE.DONE].includes(p.state)).length / 3);
  refreshChrome();

  addEventListener('keydown', onKey);
  addEventListener('popstate', () => go(location.hash || '#/feed'));
  addEventListener('resize', () => { apply(ctx.settings.density); refreshChrome(); });
  setInterval(refreshChrome, 30000);

  if (location.hash && location.hash !== '#/') { powerOn(); go(location.hash); }
  else bootScreen();

  if (swept) toast(`${swept} ITEM${swept > 1 ? 'S' : ''} LEFT THE DRAWER`, 'is-ghost');
  if (day.fresh && day.count > 1) toast(`DAY ${day.count} — BULB LIT`, 'is-gold');
  if (!ctx.items.length) {
    toast('NO DATA FILES LOADED', 'is-orange');
    console.warn('data/*.json produced no items. Are you serving over http, not file://?');
  }
}

boot();
