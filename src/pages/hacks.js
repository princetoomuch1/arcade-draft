/* HACKS — "World Map". UI Spec v2 section 11.1.
   CITY is a radar, not a street map: street tiles need a licence, and a radar is honest and free.
   STATE / COUNTRY / WORLD draw a lat-lon graticule. The spec's Natural Earth basemap PNGs are a
   build step that has not run yet, so no coastline is drawn: an invented coastline would be a lie. */

import { mark, bump, STATE } from '../store.js';
import { pinSvg } from '../sprites.js';
import { coordsOf, distanceKm, bearing, project, BOXES, HOME } from '../geo.js';
import { metrics } from '../u.js';

export const title = 'Hacks';
export const keys = [['1-4','LEVEL'],['ENTER','OPEN']];

const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
const LEVELS = ['CITY', 'STATE', 'COUNTRY', 'WORLD'];
const RINGS = [10, 25, 50];   // km

const daysLeft = it => it.deadline ? Math.ceil((new Date(it.deadline).getTime() - Date.now()) / 864e5) : null;

export async function render(ctx) {
  const wrap = el('div');
  let level = 'CITY';
  let selected = null;

  const head = el('div', 'hdr');
  head.innerHTML = '<h1 class="t-display">HACKS</h1>';
  const sw = el('div', 'levelswitch');
  const mapwrap = el('mapwrap' in window ? 'div' : 'div', 'mapwrap');
  const lane = el('div', 'onlinelane');
  const legend = el('div', 'maplegend t-small');
  const detail = el('div');
  wrap.append(head, sw, mapwrap, lane, legend, detail);

  const pool = () => ctx.items.filter(it => ['hackathon', 'internship', 'event'].includes(it.type));

  function inLevel(it) {
    if (it.mode === 'online') return false;           // online events live in the lane, at every level
    const c = coordsOf(it);
    if (!c) return false;
    if (level === 'CITY')    return distanceKm([HOME.lat, HOME.lon], c) <= RINGS[RINGS.length - 1];
    if (level === 'STATE')   return (it.state || '').toLowerCase() === 'gujarat';
    if (level === 'COUNTRY') return (it.country || '').toLowerCase() === 'india';
    return true;
  }

  function buildSwitch() {
    sw.innerHTML = '';
    for (const L of LEVELS) {
      const n = (() => { const was = level; level = L; const c = pool().filter(inLevel).length; level = was; return c; })();
      const b = el('button', 'classtab t-label', `${L}${n ? ' ' + n : ''}`);
      b.style.width = `calc(${Math.max(46, L.length * 6 + 16)}*var(--u))`;
      b.setAttribute('aria-pressed', String(level === L));
      b.onmouseenter = () => ctx.SFX.hover();
      b.onclick = () => { level = L; ctx.SFX.click(); buildSwitch(); draw(); };
      sw.append(b);
    }
  }

  /* ---- CITY: concentric dither rings at 10, 25, 50 km; pins by distance and bearing ---- */
  function drawRadar() {
    const m = metrics(ctx.settings.density);
    const SIZE = 150;                        // u
    const cvs = document.createElement('canvas');
    cvs.width = SIZE * m.uDev; cvs.height = SIZE * m.uDev;
    cvs.style.width = `calc(${SIZE}*var(--u))`; cvs.style.height = `calc(${SIZE}*var(--u))`;
    cvs.setAttribute('role', 'img');
    cvs.setAttribute('aria-label', `Radar centred on ${HOME.name}, rings at 10, 25 and 50 kilometres`);
    const g = cvs.getContext('2d');
    g.imageSmoothingEnabled = false;
    const U = m.uDev, cx = Math.floor(SIZE / 2), cy = Math.floor(SIZE / 2);
    g.fillStyle = '#0F0F1B'; g.fillRect(0, 0, cvs.width, cvs.height);

    // rings, drawn as 1u dotted circles (a dither, not a stroke, so there is no anti-aliasing)
    const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x * U, y * U, U, U); };
    RINGS.forEach((km, i) => {
      const r = Math.floor(((i + 1) / RINGS.length) * (SIZE / 2 - 10));
      const steps = Math.max(24, r * 6);
      for (let s = 0; s < steps; s++) {
        if (s % 2) continue;                                  // 1 lit, 1 dark
        const a = (s / steps) * Math.PI * 2;
        px(cx + Math.round(Math.cos(a) * r), cy + Math.round(Math.sin(a) * r), '#3D3D5C');
      }
    });
    // crosshair + home
    for (let i = -4; i <= 4; i++) { px(cx + i, cy, '#7A7AA6'); px(cx, cy + i, '#7A7AA6'); }
    px(cx, cy, '#00F0FF');

    mapwrap.innerHTML = '';
    mapwrap.style.width = `calc(${SIZE}*var(--u))`;
    mapwrap.style.height = `calc(${SIZE}*var(--u))`;
    mapwrap.append(cvs);

    // ring labels in SMALL, on the ring
    RINGS.forEach((km, i) => {
      const r = Math.floor(((i + 1) / RINGS.length) * (SIZE / 2 - 10));
      const lab = el('span', 't-small', `${km} KM`);
      lab.style.cssText = `position:absolute;color:var(--muted);left:calc(${cx + 2}*var(--u));top:calc(${cy - r - 5}*var(--u))`;
      mapwrap.append(lab);
    });
    const homeLab = el('span', 't-small', HOME.name.toUpperCase());
    homeLab.style.cssText = `position:absolute;color:var(--cyan);left:calc(${cx + 4}*var(--u));top:calc(${cy + 2}*var(--u))`;
    mapwrap.append(homeLab);

    // pins
    const list = pool().filter(inLevel);
    for (const it of list) {
      const c = coordsOf(it);
      const km = distanceKm([HOME.lat, HOME.lon], c);
      const br = bearing([HOME.lat, HOME.lon], c);
      const maxR = SIZE / 2 - 10;
      const r = Math.round(Math.min(1, km / RINGS[RINGS.length - 1]) * maxR);
      const a = (br - 90) * Math.PI / 180;
      const x = cx + Math.round(Math.cos(a) * r), y = cy + Math.round(Math.sin(a) * r);
      mapwrap.append(pin(it, x - 4, y - 10, `${Math.round(km)} km ${compass(br)}`));
    }
    legend.innerHTML = `<span>PINK: OPEN</span><span style="color:var(--orange)">ORANGE: UNDER 7 DAYS</span>
      <span style="color:var(--muted)">GREY: PAST</span><span style="color:var(--muted)">RINGS: DISTANCE FROM ${HOME.name.toUpperCase()}</span>`;
  }

  const compass = b => ['N','NE','E','SE','S','SW','W','NW'][Math.round(b / 45) % 8];

  /* ---- STATE / COUNTRY / WORLD: lat-lon graticule, no invented coastline ---- */
  function drawGraticule() {
    const m = metrics(ctx.settings.density);
    const box = { ...BOXES[level], w: level === 'WORLD' ? 260 : 180, h: level === 'WORLD' ? 130 : 120 };
    const cvs = document.createElement('canvas');
    cvs.width = box.w * m.uDev; cvs.height = box.h * m.uDev;
    cvs.style.width = `calc(${box.w}*var(--u))`; cvs.style.height = `calc(${box.h}*var(--u))`;
    cvs.setAttribute('role', 'img');
    cvs.setAttribute('aria-label', `${box.label} coordinate grid with ${pool().filter(inLevel).length} pins`);
    const g = cvs.getContext('2d'); g.imageSmoothingEnabled = false;
    const U = m.uDev;
    g.fillStyle = '#0F0F1B'; g.fillRect(0, 0, cvs.width, cvs.height);
    // graticule every 2u cell, heavier every 10 cells
    for (let x = 0; x < box.w; x += 2) { g.fillStyle = (x % 20) ? '#1A1A2E' : '#24243E'; g.fillRect(x * U, 0, U, cvs.height); }
    for (let y = 0; y < box.h; y += 2) { g.fillStyle = (y % 20) ? '#1A1A2E' : '#24243E'; g.fillRect(0, y * U, cvs.width, U); }

    mapwrap.innerHTML = '';
    mapwrap.style.width = `calc(${box.w}*var(--u))`;
    mapwrap.style.height = `calc(${box.h}*var(--u))`;
    mapwrap.append(cvs);

    // honest note: the basemap is a build step, not a thing to fake
    const note = el('p', 'basemap-missing t-small');
    note.textContent = 'No coastline drawn. The spec rasterises public-domain Natural Earth outlines into 2u cells as three PNGs in a build step; that step has not run. Pins are placed by real coordinates on a lat-lon grid, which is accurate even without the outline.';
    legend.innerHTML = '';
    legend.append(note);

    for (const it of pool().filter(inLevel)) {
      const c = coordsOf(it);
      const [x, y] = project(c, box);
      mapwrap.append(pin(it, x - 4, y - 10, `${it.city || it.state} · ${c[0].toFixed(1)}, ${c[1].toFixed(1)}`));
    }
    // home marker
    const [hx, hy] = project([HOME.lat, HOME.lon], box);
    const hm = el('span', 't-small', HOME.name.toUpperCase());
    hm.style.cssText = `position:absolute;color:var(--cyan);left:calc(${hx + 2}*var(--u));top:calc(${hy}*var(--u))`;
    mapwrap.append(hm);
  }

  function pin(it, x, y, tip) {
    const d = daysLeft(it);
    const colour = d == null ? 'var(--pink)' : d < 0 ? 'var(--muted)' : d <= 7 ? 'var(--orange)' : 'var(--pink)';
    const b = el('button', 'pin' + (d != null && d >= 0 && d <= 7 ? ' soon' : ''));
    b.innerHTML = pinSvg(colour);
    b.style.left = `calc(${x}*var(--u))`;
    b.style.top = `calc(${y}*var(--u))`;
    b.title = `${it.title} — ${tip}${d == null ? ' · no deadline stated' : d < 0 ? ' · closed' : ' · ' + d + ' days left'}`;
    b.setAttribute('aria-label', b.title);
    b.onmouseenter = () => ctx.SFX.hover();
    b.onclick = () => {
      for (const p of mapwrap.querySelectorAll('.pin.is-sel')) p.classList.remove('is-sel');
      b.classList.add('is-sel');
      selected = it; ctx.SFX.click(); drawDetail();
    };
    return b;
  }

  /* ---- online lane: present at every level ---- */
  function drawLane() {
    lane.innerHTML = '';
    const cloud = el('span', 't-small', 'ONLINE');
    cloud.style.color = 'var(--muted)';
    lane.append(cloud);
    const online = pool().filter(it => it.mode === 'online');
    if (!online.length) { lane.append(el('span', 't-small', 'none right now')); return; }
    for (const it of online) {
      const holder = el('span', 'lane-pin');
      holder.append(pin(it, 0, 0, 'online'));
      holder.querySelector('.pin').style.position = 'absolute';
      lane.append(holder);
    }
  }

  function drawDetail() {
    detail.innerHTML = '';
    if (!selected) return;
    const it = selected, d = daysLeft(it);
    const box = el('div', 'bevel corner-1');
    box.style.cssText = 'margin-top:calc(6*var(--u));padding:calc(4*var(--u));max-width:calc(200*var(--u));display:grid;gap:calc(3*var(--u))';
    box.append(el('h2', 't-title', it.title));
    const meta = el('p', 't-small',
      [it.org, it.city || (it.mode === 'online' ? 'ONLINE' : null), it.state,
       d == null ? 'NO DEADLINE STATED' : d < 0 ? 'CLOSED' : `${d} DAYS LEFT`].filter(Boolean).join(' · ').toUpperCase());
    meta.style.color = 'var(--muted)';
    box.append(meta);
    if (it.startDate) {
      const fmt = s => new Date(s).toLocaleDateString('en-IN', { day:'numeric', month:'short' });
      box.append(el('p', 't-body', `EVENT ${fmt(it.startDate)}${it.endDate ? ' – ' + fmt(it.endDate) : ''}`));
    }
    const skills = el('div');
    skills.style.cssText = 'display:flex;gap:calc(2*var(--u));flex-wrap:wrap';
    for (const s of it.skills || []) skills.append(el('span', 'chip t-small is-ghost', s.toUpperCase()));
    box.append(skills);
    const acts = el('div');
    acts.style.cssText = 'display:flex;gap:calc(3*var(--u));flex-wrap:wrap';
    const save = el('button', 'btn t-small is-primary', 'SAVE');
    save.onclick = async () => { await mark(it, STATE.SAVED); await bump(it.skills, 'save'); ctx.coins++; ctx.refreshChrome(); ctx.SFX.save(); save.textContent = 'SAVED'; };
    const plan = el('button', 'btn t-small', 'PLAN IT');
    plan.onclick = async () => { await mark(it, STATE.PLANNED, { planned_for: it.deadline }); await bump(it.skills, 'plan'); ctx.SFX.checkpoint(); ctx.toast('IN THE QUEST LOG', 'is-lime'); };
    const open = el('a', 'btn t-small is-ghost', 'OPEN LISTING');
    open.href = it.url; open.target = '_blank'; open.rel = 'noopener noreferrer'; open.style.textDecoration = 'none';
    acts.append(save, plan, open);
    box.append(acts);
    if (it._mock) {
      const w = el('p', 't-small', 'SEED ROW — fictional, not a real event.');
      w.style.color = 'var(--orange)'; box.append(w);
    }
    detail.append(box);
  }

  function draw() {
    if (level === 'CITY') drawRadar(); else drawGraticule();
    drawLane();
    const shown = pool().filter(inLevel).length;
    if (!shown && level !== 'CITY') {
      const p = el('p', 'stub t-small', 'No events at this level in the data yet.');
      mapwrap.append(p);
    }
    drawDetail();
  }

  const onKey = e => {
    const k = e.detail.key;
    if (['1','2','3','4'].includes(k)) { level = LEVELS[Number(k) - 1]; ctx.SFX.click(); buildSwitch(); draw(); }
  };
  document.addEventListener('arcade:key', onKey);
  new MutationObserver((m, o) => { if (!wrap.isConnected) { document.removeEventListener('arcade:key', onKey); o.disconnect(); } })
    .observe(document.getElementById('page'), { childList: true });

  buildSwitch(); draw();
  return wrap;
}
