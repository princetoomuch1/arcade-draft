/* Opportunity Hub — boot, router, chrome. UI Spec v2 sections 6, 7, 14.2, 18.
   Desktop only: mouse and keyboard, landscape, minimum 900 x 560 CSS px. */

import { apply, metrics, FRAME_U } from './u.js';
import * as S from './store.js';
import * as UNDO from './undo.js';
import { init as audioInit, SFX, setVolume, setMuted, setHoverBlips, toggleMute, touch as audioTouch } from './sound.js';

const $  = (s, r = document) => r.querySelector(s);
const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };

/* ---------- pages. Each module exports render(ctx) -> HTMLElement and optional keys/title. ---------- */
const PAGES = {
  menu:    () => import('./pages/menu.js'),
  feed:    () => import('./pages/feed.js'),
  jobs:    () => import('./pages/jobs.js'),
  hacks:   () => import('./pages/hacks.js'),
  news:    () => import('./pages/news.js'),
  more:    () => import('./pages/more.js'),
  notes:   () => import('./pages/notes.js'),
  cal:     () => import('./pages/calendar.js'),
  apps:    () => import('./pages/apps.js'),
  opts:    () => import('./pages/options.js'),
  credits: () => import('./pages/credits.js'),
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
/* The Desk is home: the Computer is a monitor sitting on it, not the room. */
const HOME = 'desk';

/* ---------- app state shared with pages ---------- */
export const ctx = {
  items: [], weights: {}, settings: null, coins: 0, level: 1, startedAt: Date.now(),
  go, toast, refreshChrome, SFX, frameNow, toggleFullscreen
};

/* ---------- data ---------- */
async function loadData() {
  const files = ['hackathons', 'jobs', 'news', 'schemes'];
  const out = [];
  for (const f of files) {
    try {
      const r = await fetch(`data/${f}.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(String(r.status));
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

  // Painted on the bezel, not on the screen: a coin slot one side, a joystick the other.
  const slot = el('div', 'cab-art left');
  slot.innerHTML = `<svg viewBox="0 0 10 10" aria-hidden="true" shape-rendering="crispEdges">
    <rect x="0" y="1" width="10" height="8" fill="#5C3A21"/><rect x="1" y="2" width="8" height="6" fill="#2A1A10"/>
    <rect x="4" y="3" width="2" height="4" fill="#000"/><rect x="3" y="3" width="1" height="1" fill="#A0522D"/>
    </svg><span class="t-small">1 COIN</span>`;
  const stick = el('div', 'cab-art right');
  stick.innerHTML = `<span class="t-small">[SHIFT+F] FULL</span>
    <svg viewBox="0 0 10 10" aria-hidden="true" shape-rendering="crispEdges">
    <rect x="1" y="7" width="8" height="2" fill="#5C3A21"/><rect x="4" y="3" width="2" height="4" fill="#2A1A10"/>
    <rect x="3" y="1" width="4" height="3" fill="#C41E3A"/><rect x="4" y="1" width="1" height="1" fill="#FF6B6B"/>
    </svg>`;
  cabinet.append(win, slot, stick);

  // top bar
  const top = el('div', 'topbar');
  const logo = el('div', 't-title logo halo-cyan', 'CAREER ARCADE');
  const spacer = el('div', 'spacer');
  const coins = el('div', 'readout');
  coins.innerHTML = `<svg class="coin-icon" viewBox="0 0 8 8" aria-hidden="true"><rect x="1" y="0" width="6" height="8" fill="#FFD93D"/><rect x="0" y="1" width="8" height="6" fill="#FFD93D"/><rect x="3" y="2" width="2" height="4" fill="#0F0F1B"/></svg><span class="t-label coins" id="coins">000</span>`;
  const lvl = el('div', 't-label lvl readout'); lvl.id = 'lvl';
  const timer = el('div', 't-label timer readout'); timer.id = 'timer';
  const full = el('button', 'btn is-ghost t-small', 'FULL');
  full.id = 'full'; full.title = 'Fullscreen (shift+F). The cabinet slides away. F alone is the Feed.';
  full.onclick = () => toggleFullscreen();
  const pause = el('button', 'btn is-ghost t-small', 'PAUSE');
  pause.id = 'pause'; pause.title = 'Mute all sound (shift+M)';
  pause.onclick = () => { const m = toggleMute(); pause.textContent = m ? 'MUTED' : 'PAUSE'; };
  top.append(logo, spacer, coins, lvl, timer, full, pause);

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
  const m = metrics(ctx.settings?.density || 'CHUNKY', innerWidth, innerHeight, devicePixelRatio || 1, frameNow());
  const msg = $('#small-msg');
  if (msg) msg.textContent = `Window is ${innerWidth} × ${innerHeight}. Minimum is 900 × 560.`;
  document.documentElement.dataset.tooSmall = String(m.tooSmall);
  const crt = $('#crt'); if (crt) crt.dataset.on = String(!!ctx.settings?.crt);
  const root = document.documentElement;
  root.dataset.reduce = String(!!ctx.settings?.reduceMotion);
  root.dataset.contrast = ctx.settings?.highContrast ? 'high' : 'normal';
}

/* ---------- fullscreen. The cabinet bezel is part of the canvas, so leaving it gives the
   screen those 6u back on every side. The browser may refuse the request; the bezel still goes. ---- */
let fullscreen = false;
export function frameNow() { return fullscreen ? 0 : FRAME_U; }

export async function toggleFullscreen(want = !fullscreen) {
  fullscreen = want;
  document.documentElement.dataset.fullscreen = String(fullscreen);
  try {
    if (fullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen?.();
    if (!fullscreen && document.fullscreenElement) await document.exitFullscreen?.();
  } catch { /* a refused request only costs us the browser chrome, not the bezel */ }
  apply(ctx.settings?.density || 'CHUNKY', document.documentElement, frameNow());
  refreshChrome();
  const b = $('#full'); if (b) b.textContent = fullscreen ? 'WINDOW' : 'FULL';
  SFX.click();
  return fullscreen;
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

/* ---------- turning round in the chair ----------
   Desk and Wall are two walls of one room, so moving between them pans sideways instead of wiping.
   Stepped, because the pixel law allows no eased motion. ---------- */
const ROOM = { desk: 'left', wall: 'right' };
function turnSwap(from, to, fn) {
  const host = $('#page');
  const reduce = ctx.settings?.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!host || reduce) { fn(); return; }
  const dir = ROOM[to] === 'right' ? 'r' : 'l';
  host.dataset.turn = 'out-' + dir;
  SFX.turn();
  setTimeout(() => {
    fn();
    host.dataset.turn = 'in-' + dir;
    setTimeout(() => host.removeAttribute('data-turn'), 200);
  }, 200);
}

/* ---------- router ---------- */
let current = null;
export async function go(route, params = {}) {
  const r = (route || HOME).replace(/^#\/?/, '');
  const [name] = r.split('/');
  if (!PAGES[name]) return go(HOME);
  if (location.hash !== `#/${r}`) { history.pushState({}, '', `#/${r}`); }
  if (current === name) { await mount(name, params); return; }
  const turning = ROOM[current] && ROOM[name] && current !== name;
  const prev = current;
  current = name;
  if (turning) turnSwap(prev, name, async () => { await mount(name, params); });
  else wipeSwap(async () => { await mount(name, params); });
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
  for (const b of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.tab')))
    b.setAttribute('aria-selected', String(b.dataset.route === name));
  renderKeybar(mod.keys);
  document.title = (mod.title ? mod.title + ' — ' : '') + 'Career Arcade';
  host.setAttribute('aria-label', (mod.title || name) + ' page');
  announce((mod.title || name) + ' page');
  // Keyboard-only users land on the new page, not back at the top of the tab bar.
  // A dialog that is already open keeps focus: it asked for it first.
  host.tabIndex = -1;
  if (!document.querySelector('.tour')) host.focus({ preventScroll: true });
}

function renderKeybar(extra = []) {
  const bar = $('#keybar'); if (!bar) return;
  const base = [['F','FEED'],['J','JOBS'],['H','HACKS'],['N','NEWS'],['M','MORE'],['D','DESK'],['W','WALL'],['U','UNDO']];
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
  if (k === 'f' && e.shiftKey) { e.preventDefault(); toggleFullscreen(); return; }
  if (KEYS[k]) { e.preventDefault(); SFX.click(); return go(KEYS[k]); }
  if (k === 'u') {
    e.preventDefault();
    UNDO.undoLast().then(label => {
      if (label) { SFX.save(); toast('UNDONE: ' + label.toUpperCase(), 'is-lime'); }
      else toast('NOTHING TO UNDO', 'is-ghost');
    });
    return;
  }
  if (k === 'escape') { e.preventDefault(); SFX.back(); return go(HOME); }
  if (k === 'm' && e.shiftKey) { e.preventDefault(); const m = toggleMute(); const p = $('#pause'); if (p) p.textContent = m ? 'MUTED' : 'PAUSE'; return; }
  // page-local keys get the event through this custom event
  document.dispatchEvent(new CustomEvent('arcade:key', { detail: { key: k, shift: e.shiftKey, raw: e } }));
}

/* ---------- toast ---------- */
export function announce(text) {
  const live = document.getElementById('live');
  if (live) { live.textContent = ''; setTimeout(() => { live.textContent = text; }, 50); }
}

export function toast(text, kind = '') {
  announce(text);
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
    const go2 = async () => { SFX.pressStart(); powerOn(); await go(HOME); await roomTour(); };
    document.addEventListener('keydown', go2, { once: true });
    b.addEventListener('click', go2, { once: true });
  };
  $('#plate').onclick = () => { audioInit(); start(); };
  document.addEventListener('keydown', () => { audioInit(); start(); }, { once: true });
}

/* ---------- first time in the room ----------
   Shown once, dismissed by anything, and never shown again. It names the three places and the two
   promises the app makes, then gets out of the way. */
async function roomTour() {
  if ((await S.get('meta', 'toured'))?.v) return;
  const host = $('.crt-window'); if (!host) return;

  const card = el('div', 'tour corner-2 sh-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'A short tour of the room');
  card.innerHTML = `
    <h2 class="t-title" style="color:var(--cyan)">THE ROOM</h2>
    <p class="t-body">Three places, and you are standing in the first.</p>
    <ul class="t-body">
      <li><b>[D] THE DESK</b> — home. Everything you save lands here as paper you can move.</li>
      <li><b>[F] THE COMPUTER</b> — click the monitor. Feed, jobs, hackathons, news, notes.</li>
      <li><b>[W] THE WALL</b> — turn round. Goals, photos, what you are aiming at.</li>
    </ul>
    <p class="t-small" style="color:var(--lime)">Everything you write stays on this machine.
      Nothing is uploaded, and nothing applies to anything on your behalf.</p>`;
  const ok = el('button', 'btn is-primary t-small', 'GOT IT');
  card.append(ok);
  host.append(card);

  const done = async () => {
    card.remove();
    document.removeEventListener('keydown', onAny, true);
    document.removeEventListener('focusin', keepFocus, true);
    await S.put('meta', { id: 'toured', v: true });
    $('#page')?.focus({ preventScroll: true });
  };
  const onAny = e => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); done(); } };
  // The page wipe focuses #page when it lands, which would pull focus out of this dialog.
  // Refocusing during a focus event is ignored by some browsers, so step out of the event first.
  const keepFocus = e => {
    if (card.isConnected && !card.contains(e.target)) setTimeout(() => card.isConnected && ok.focus(), 0);
  };
  ok.onclick = done;
  document.addEventListener('keydown', onAny, true);
  document.addEventListener('focusin', keepFocus, true);
  ok.focus();
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
  document.documentElement.dataset.fullscreen = 'false';
  apply(ctx.settings.density, document.documentElement, frameNow());
  buildChrome();
  refreshChrome();

  setVolume(ctx.settings.volume);
  setMuted(ctx.settings.muted);
  setHoverBlips(ctx.settings.hoverBlips);

  await S.persist();
  const swept = await S.sweepDrawer();
  const archived = await S.archiveExpired();
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
  addEventListener('resize', () => { apply(ctx.settings.density, document.documentElement, frameNow()); refreshChrome(); });
  // Leaving fullscreen with Esc or the browser's own control must bring the cabinet back.
  addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && fullscreen) toggleFullscreen(false);
  });
  setInterval(refreshChrome, 30000);

  if (location.hash && location.hash !== '#/') { powerOn(); await go(location.hash); await roomTour(); }
  else bootScreen();

  if (swept) toast(`${swept} ITEM${swept > 1 ? 'S' : ''} LEFT THE DRAWER`, 'is-ghost');
  if (archived) toast(`${archived} PAST ITEM${archived > 1 ? 'S' : ''} MOVED TO THE DRAWER`, 'is-ghost');
  if (day.fresh && day.count > 1) toast(`DAY ${day.count} — BULB LIT`, 'is-gold');
  if (!ctx.items.length) {
    toast('NO DATA FILES LOADED', 'is-orange');
    console.warn('data/*.json produced no items. Are you serving over http, not file://?');
  }
}

boot();
