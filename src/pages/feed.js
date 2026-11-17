/* FEED — "Adventure Mode" and the Stage card. UI Spec v2 section 9.
   Desktop: two panes (list 162u + evidence 94u), keyboard-first. */

import { assembleDrop, mark, bump, skipped, muteTopic, personalFor, STATE, setSetting } from '../store.js';

export const title = 'Today';
export const keys = [['J/K','MOVE'],['S','SAVE'],['P','PLAN'],['X','LESS'],['?','WHY'],['ENTER','OPEN']];

const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
const ALIGNS = ['MORE', 'BALANCED', 'BROADER'];

/* ---- 7.2 freshness badge ---- */
function freshness(item) {
  const seen = item.lastSeen ? Date.now() - new Date(item.lastSeen).getTime() : null;
  if (seen == null) return ['CHECK UNKNOWN', 'var(--muted)'];
  const h = seen / 36e5;
  if (h < 3)  return [`CHECKED ${Math.max(1, Math.round(h))}H AGO`, 'var(--lime)'];
  if (h < 48) return [`CHECKED ${Math.round(h)}H AGO`, 'var(--muted)'];
  return [`CHECKED ${Math.round(h / 24)}D AGO`, 'var(--orange)'];
}

const TYPE_ICON = {
  hackathon: 'M7 1l2 5h5l-4 3 1 5-4-3-4 3 1-5-4-3h5z',
  internship:'M2 4h10v8H2z M5 4V2h4v2',
  job:       'M2 4h10v8H2z M5 4V2h4v2',
  news:      'M1 2h12v10H1z M3 4h5v3H3z M9 4h3M9 6h3M3 9h9',
  scheme:    'M3 2h8v10H3z M5 4h4M5 6h4M5 8h3',
  event:     'M2 3h10v9H2z M2 6h10M5 1v3M9 1v3'
};
const icon = (path, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><path d="${path}"/></svg>`;

/* 7x7 glyphs: filled square = MATCH, hollow square = GAP, "?" = UNKNOWN.
   Colour is never the only signal (4.2). */
const GLYPH = {
  match: `<svg class="g" viewBox="0 0 7 7" aria-hidden="true"><rect width="7" height="7" fill="#6BCB77"/></svg>`,
  gap:   `<svg class="g" viewBox="0 0 7 7" aria-hidden="true"><rect x="0.5" y="0.5" width="6" height="6" fill="none" stroke="#FF3864"/></svg>`,
  unk:   `<svg class="g" viewBox="0 0 7 7" aria-hidden="true"><path d="M2 2h3v2H3.5v1M3.5 6.5h0" stroke="#9494AA" fill="none"/></svg>`
};

/* ---- 9.2 row D. Criteria come from the data, never invented. A criterion with no
        information is UNKNOWN; a line with nothing at all is omitted. ---- */
function criteria(item, weights) {
  const mine = Object.entries(weights).filter(([, w]) => !w.muted && w.w > 0.3).map(([k]) => k);
  const skills = (item.skills || []).map(s => s.toLowerCase());
  const matched = skills.filter(s => mine.includes(s));
  const missing = mine.length ? [] : null;

  const match = [], gap = [], unk = [];
  if (matched.length) match.push(matched.slice(0, 3).join(', '));
  if (item.city || item.state) match.push((item.city || item.state).toLowerCase());
  else if (item.mode === 'online') match.push('online');
  else unk.push('location');

  if (skills.length && !matched.length) gap.push('no skill overlap yet');
  if (item.type === 'job' || item.type === 'internship') {
    if (item.pay?.disclosed) match.push('pay stated');
    else unk.push('pay');
  }
  if (!item.deadline) unk.push('deadline');
  if (item.type === 'hackathon' && !item.org) unk.push('organiser');

  const lines = [];
  if (match.length) lines.push(['match', 'MATCH', match.join(' · ')]);
  if (gap.length)   lines.push(['gap',   'GAP',   gap.join(' · ')]);
  if (unk.length)   lines.push(['unk',   'UNKNOWN', unk.join(' · ')]);
  return lines.slice(0, 3);
}

/* ---- 9.2 row E: 30 segments, one per day ---- */
function fuse(daysLeft) {
  if (daysLeft == null) {
    const n = el('div', 'fuse-none t-small', 'DEADLINE UNKNOWN');
    return n;
  }
  const d = Math.max(0, Math.min(30, Math.ceil(daysLeft)));
  const wrap = el('div', 'fuse' + (d <= 7 ? ' is-soon' : d <= 14 ? ' is-warn' : ''));
  for (let i = 0; i < 30; i++) {
    const s = el('i');
    if (i < d) { s.classList.add('lit'); if (i === d - 1) s.classList.add('tip'); }
    wrap.append(s);
  }
  const box = el('div', 'row-e');
  box.append(wrap);
  if (d > 0) {
    const sp = el('div', 'spark');
    sp.style.left = `calc(${(d - 1) * 5 + 1}*var(--u))`;   // 5u pitch: 4u segment + 1u gap
    box.append(sp);
  }
  return box;
}

/* ---- SAVED stamp: pre-rendered on a canvas at -4 degrees, nearest-neighbour (3.4).
        Never a CSS rotate on live DOM. ---- */
function stampCanvas() {
  const u = 1, W = 24, H = 10;
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const g = off.getContext('2d'); g.imageSmoothingEnabled = false;
  g.strokeStyle = '#FF2E97'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, W - 1, H - 1);
  g.fillStyle = '#FF2E97'; g.font = '8px "Silkscreen", monospace'; g.textBaseline = 'top';
  g.fillText('SAVED', 2, 1);
  const out = document.createElement('canvas'); out.width = W * 2; out.height = H * 2;
  const o = out.getContext('2d'); o.imageSmoothingEnabled = false;
  o.translate(W, H); o.rotate(-4 * Math.PI / 180); o.translate(-W / 2, -H / 2);
  o.drawImage(off, 0, 0);
  out.className = 'stamp';
  return out;
}

/* ---------- the card ---------- */
function stageCard(entry, i, ctx, api) {
  const { item, s, tag } = entry;
  const card = el('article', 'card corner-1' + (i < 3 ? ' is-enter' : ''));
  card.tabIndex = 0;
  card.dataset.id = item.id;
  card.style.animationDelay = i < 3 ? `${i * 60}ms` : '0ms';
  const d = s.daysLeft == null ? null : Math.ceil(s.daysLeft);
  card.setAttribute('aria-label',
    `${item.type}, ${item.title}, ${d == null ? 'no deadline stated' : d + ' days left'}, ` +
    `${criteria(item, ctx.weights).map(c => c[1] + ': ' + c[2]).join('; ')}`);

  const front = el('div', 'face-front');

  /* row A */
  const a = el('div', 'row-a');
  const [fTxt, fCol] = freshness(item);
  a.innerHTML =
    `<span class="chip t-small is-ghost">${icon(TYPE_ICON[item.type] || TYPE_ICON.event, '')}${item.type.toUpperCase()}</span>
     <span class="t-small" style="color:${fCol}">${fTxt}${tag === 'POPULAR' ? ' &middot; POPULAR' : tag === 'WILD' ? ' &middot; BROADER' : ''}</span>`;

  /* row B */
  const b = el('div', 'row-b');
  const stub = el('div', 'stub-day' + (d != null && d <= 7 ? ' is-soon' : ''));
  if (d == null) {
    stub.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="#9494AA" stroke-width="1" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12"/><path d="M8 5v3l2 2"/></svg><span class="d t-small">NO DATE</span>`;
  } else {
    stub.innerHTML = `<span class="n t-number">${d === 0 ? '' : d}</span><span class="d t-small">${d === 0 ? 'TODAY' : 'DAYS'}</span>`;
  }
  const perf = el('div', 'perf');
  perf.innerHTML = `<div class="line"></div><div class="notch top"></div><div class="notch bot"></div>`;
  const titleBox = el('div');
  const h = el('h2', 'card-title t-title', item.title);
  const meta = el('p', 'card-meta t-small', metaLine(item));
  titleBox.append(h, meta);
  b.append(stub, perf, titleBox);

  /* row C */
  const c = el('div', 'row-c');
  const whyBtn = el('button', 'why-btn t-small', 'WHY THIS?');
  whyBtn.setAttribute('aria-expanded', 'false');
  const whyLine = el('span', 'why-line t-small', whyText(s, item));
  c.append(whyBtn, whyLine);

  const whyPanel = el('div', 'why-panel t-small');

  /* row D */
  const dRow = el('div', 'row-d');
  for (const [kind, lab, val] of criteria(item, ctx.weights)) {
    const line = el('div', `fit is-${kind}`);
    line.innerHTML = `${GLYPH[kind]}<span class="lab t-small">${lab}</span><span class="val t-small">${val}</span>`;
    dRow.append(line);
  }

  /* row E */
  const eRow = fuse(s.daysLeft);

  /* row F */
  const f = el('div', 'row-f');
  const mkBtn = (label, cls, path, fn, titleAttr) => {
    const bt = el('button', `btn t-small ${cls}`);
    bt.innerHTML = `${icon(path)}${label}`;
    if (titleAttr) bt.title = titleAttr;
    bt.onmouseenter = () => ctx.SFX.hover();
    bt.onclick = ev => { ev.stopPropagation(); fn(); };
    return bt;
  };
  const saveBtn = mkBtn('SAVE', 'is-primary', 'M7 12C3 9 1 7 1 5a2.5 2.5 0 014-1.5L7 5l2-1.5A2.5 2.5 0 0113 5c0 2-2 4-6 7z', () => api.save(card, entry), 'Save to your desk (S)');
  const moreBtn = mkBtn('MORE', '', 'M7 3v8M3 7h8', () => api.more(card, entry), 'More like this (M is MORE page; use this button)');
  const lessBtn = mkBtn('LESS', '', 'M3 7h8', () => api.less(card, entry), 'Less like this (X)');
  const muteBtn = mkBtn('MUTE', 'is-ghost', 'M2 5h3l3-3v10L5 9H2z M10 5l3 4M13 5l-3 4', () => api.mute(card, entry), 'Mute the topic, source or place');
  f.append(saveBtn, moreBtn, lessBtn, muteBtn);

  front.append(a, b, c, whyPanel, dRow, eRow, f);

  /* back face, shown after a save */
  const back = el('div', 'face-back');
  back.append(stampCanvas());
  const onDesk = el('p', 't-small', 'ON YOUR DESK');
  onDesk.style.color = 'var(--muted)';
  back.append(onDesk);

  card.append(front, back);

  /* interactions */
  whyBtn.onclick = ev => { ev.stopPropagation(); api.why(card, entry, whyPanel, whyBtn); };
  card.onmouseenter = () => ctx.SFX.hover();
  h.onclick = () => api.open(entry);
  card.onclick = () => api.select(card, entry);
  card.onfocus = () => api.select(card, entry);
  return card;
}

function metaLine(item) {
  const bits = [];
  if (item.startDate) {
    const s = new Date(item.startDate), e = item.endDate ? new Date(item.endDate) : null;
    const fmt = dt => dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }).toUpperCase();
    bits.push(e ? `${fmt(s)}–${fmt(e)}` : fmt(s));
  }
  if (item.city) bits.push(item.city.toUpperCase());
  else if (item.mode === 'online') bits.push('ONLINE');
  if (item.org) bits.push(item.org.toUpperCase());
  if (item.pay?.disclosed) bits.push(`${item.pay.currency} ${item.pay.amount.toLocaleString('en-IN')}/${item.pay.period.toUpperCase()}`);
  return bits.slice(0, 4).join(' · ') || 'NO FURTHER DETAIL IN THE LISTING';
}

const WHY_WORD = { match:'what you follow', fresh:'it is new', urgency:'the deadline is close', place:'where it is' };
function whyText(s, item) {
  const parts = s.why.map(k => WHY_WORD[k]).filter(Boolean);
  return ('BECAUSE ' + parts.join(' + ')).toUpperCase();
}

/* ---------- the page ---------- */
export async function render(ctx) {
  const wrap = el('div');
  let align = ctx.settings.align;
  let view  = 'FOR_ME';
  let lens  = 'ALL';
  let sort  = 'RELEVANCE';
  let selected = null;

  const head = el('div', 'fhead');
  const list = el('div', 'flist');
  list.style.display = 'grid'; list.style.gap = '0';
  const evidence = el('aside', 'evidence corner-1 t-small');
  evidence.setAttribute('aria-live', 'polite');

  const feed = el('div', 'feed');
  feed.append(el('div'), el('div'));
  feed.innerHTML = '';
  const leftCol = el('div');
  leftCol.append(head, list);
  feed.append(leftCol, evidence);
  wrap.append(feed);

  /* ---- header ---- */
  function buildHead() {
    head.innerHTML = '';
    const r1 = el('div', 'row align');
    r1.append(el('span', 't-small', 'ALIGNMENT'));
    const sl = el('div', 'notches');
    sl.tabIndex = 0; sl.setAttribute('role', 'slider');
    sl.setAttribute('aria-valuemin', '1'); sl.setAttribute('aria-valuemax', '3');
    const idx = ALIGNS.indexOf(align);
    sl.setAttribute('aria-valuenow', String(idx + 1));
    sl.setAttribute('aria-valuetext', align);
    sl.innerHTML = `<div class="track"></div><div class="fill"></div>
      <div class="tick" style="left:calc(4*var(--u))"></div>
      <div class="tick" style="left:calc(58*var(--u))"></div>
      <div class="tick" style="left:calc(112*var(--u))"></div>
      <div class="thumb" style="left:calc(${[0, 54, 108][idx]}*var(--u))"></div>`;
    sl.querySelector('.fill').style.width = `calc(${[4, 58, 112][idx]}*var(--u))`;
    const setAlign = n => {
      const next = ALIGNS[Math.max(0, Math.min(2, n))];
      if (next === align) return;
      align = next; ctx.SFX.notch(); setSetting('align', align); ctx.settings.align = align;
      buildHead(); draw(true);
    };
    sl.onclick = e => { const x = e.offsetX / (sl.clientWidth || 1); setAlign(x < 0.33 ? 0 : x < 0.66 ? 1 : 2); };
    sl.onkeydown = e => {
      if (e.key === 'ArrowRight') { e.preventDefault(); setAlign(ALIGNS.indexOf(align) + 1); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); setAlign(ALIGNS.indexOf(align) - 1); }
    };
    const lbl = el('span', 't-small', align);
    lbl.style.color = 'var(--cyan)';
    const r1b = el('div', 'row');
    r1b.append(sl, lbl);
    r1.append(r1b);

    const r2 = el('div', 'row view');
    for (const [v, label] of [['FOR_ME', 'FOR ME'], ['ALL', 'ALL RESULTS']]) {
      const b = el('button', 'chip t-small' + (view === v ? ' is-cyan' : ' is-ghost'), (view === v ? '● ' : '') + label);
      b.onclick = () => { view = v; ctx.SFX.click(); buildHead(); draw(true); };
      r2.append(b);
    }
    if (view === 'ALL') {
      const sel = el('select', 't-small');
      sel.style.cssText = 'background:var(--surface);color:var(--text);border:var(--u) solid var(--edge);margin-left:auto';
      for (const o of ['RELEVANCE', 'NEWEST', 'DEADLINE', 'SOURCE']) {
        const op = el('option', '', o); op.value = o; if (o === sort) op.selected = true; sel.append(op);
      }
      sel.onchange = () => { sort = sel.value; draw(true); };
      sel.setAttribute('aria-label', 'Sort all results');
      r2.append(sel);
    }

    const r3 = el('div', 'row lens');
    for (const L of ['ALL', 'STUDY', 'CAREER', 'BUILD']) {
      const b = el('button', 'chip t-small' + (lens === L ? ' is-cyan' : ' is-ghost'), L);
      b.title = 'A lens re-weights, it never hides anything permanently';
      b.onclick = () => { lens = L; ctx.SFX.click(); buildHead(); draw(true); };
      r3.append(b);
    }
    head.append(r1, r2, r3);
  }

  /* ---- lens re-weights, never hides ---- */
  const LENS_TYPES = { STUDY:['hackathon','scheme','news'], CAREER:['job','internship'], BUILD:['hackathon','news'] };
  function lensBoost(entry) {
    if (lens === 'ALL') return 0;
    return (LENS_TYPES[lens] || []).includes(entry.item.type) ? 0.15 : 0;
  }

  /* ---- actions ---- */
  const api = {
    select(card, entry) {
      if (selected === card) return;
      for (const c of list.querySelectorAll('.card.is-sel')) c.classList.remove('is-sel');
      card.classList.add('is-sel'); selected = card;
      drawEvidence(entry);
    },
    async save(card, entry) {
      ctx.SFX.save();
      await mark(entry.item, STATE.SAVED);
      await bump(entry.item.skills, 'save');
      ctx.weights = { ...ctx.weights };
      ctx.coins++; ctx.refreshChrome();
      flyCoin(card);
      card.classList.add('is-shut');
      setTimeout(() => { card.classList.remove('is-shut'); card.classList.add('is-flipped', 'is-open'); }, 120);
      setTimeout(() => card.classList.remove('is-open'), 260);
      setTimeout(() => card.classList.remove('is-flipped'), 1200);
      const sv = card.querySelector('.is-primary');
      sv.style.background = 'var(--pink)';
      sv.lastChild.textContent = 'SAVED';
    },
    async more(card, entry) {
      ctx.SFX.click();
      await bump(entry.item.skills, 'more');
      card.style.outline = `calc(1*var(--u)) solid var(--cyan)`;
      setTimeout(() => { card.style.outline = ''; }, 120);
      const p = el('span', 'plusone t-small', '+1 AI');
      p.style.left = 'calc(46*var(--u))'; p.style.top = 'calc(123*var(--u))';
      card.append(p); setTimeout(() => p.remove(), 260);
    },
    async less(card, entry) {
      ctx.SFX.del();
      await bump(entry.item.skills, 'less');
      card.classList.add('is-gone');
      setTimeout(() => {
        const u = el('div', 'undo t-small');
        u.innerHTML = `<span>LESS LIKE THIS — WEIGHTS LOWERED</span>`;
        const ub = el('button', 'btn t-small is-ghost', 'UNDO');
        ub.onclick = async () => { await bump(entry.item.skills, 'more'); u.replaceWith(card); card.classList.remove('is-gone'); ctx.SFX.back(); };
        u.append(ub);
        card.replaceWith(u);
        setTimeout(() => { if (u.isConnected) u.remove(); }, 5000);
      }, 140);
    },
    mute(card, entry) {
      ctx.SFX.click();
      const existing = card.querySelector('.mute-row');
      if (existing) { existing.remove(); return; }
      const row = el('div', 'mute-row row t-small');
      row.style.marginTop = 'calc(3*var(--u))';
      const opts = [
        ['TOPIC', (entry.item.skills || [])[0]],
        ['SOURCE', entry.item.source?.name],
        ['PLACE', entry.item.city || entry.item.state]
      ].filter(([, v]) => v);
      row.append(el('span', 't-small', 'MUTE:'));
      for (const [label, val] of opts) {
        const b = el('button', 'chip t-small is-ghost', `${label} ${String(val).toUpperCase()}`);
        b.onclick = async () => {
          if (label === 'TOPIC') await muteTopic(val);
          ctx.toast(`MUTED ${label} ${String(val).toUpperCase()}`, 'is-ghost');
          row.remove();
        };
        row.append(b);
      }
      card.querySelector('.row-f').after(row);
    },
    why(card, entry, panel, btn) {
      const open = card.classList.toggle('is-why');
      btn.setAttribute('aria-expanded', String(open));
      if (!open) { panel.innerHTML = ''; return; }
      const kws = (entry.item.skills || []).map(k => k.toLowerCase());
      const chosen = kws.filter(k => ctx.weights[k]?.kind === 'CHOSE');
      const guessed = kws.filter(k => ctx.weights[k] && ctx.weights[k].kind === 'GUESSED' && ctx.weights[k].w > 0);
      panel.innerHTML = '';
      const l1 = el('div', 'row');
      if (chosen.length) {
        l1.append(el('span', 'chip t-small is-chose', 'YOU CHOSE'));
        l1.append(el('span', 't-small', `You follow ${chosen.join(', ').toUpperCase()}`));
      }
      if (guessed.length) {
        l1.append(el('span', 'chip t-small is-guess', 'GUESSED'));
        l1.append(el('span', 't-small', `${guessed.length} topic${guessed.length > 1 ? 's' : ''} inferred from what you saved`));
      }
      if (!chosen.length && !guessed.length) {
        l1.append(el('span', 'chip t-small is-guess', 'GUESSED'));
        l1.append(el('span', 't-small', 'No topic match. It is here for place and freshness.'));
      }
      const l2 = el('div', 'row');
      l2.style.marginTop = 'calc(2*var(--u))';
      const mk = (txt, fn) => { const b = el('button', 'why-btn t-small', txt); b.onclick = fn; return b; };
      l2.append(
        mk('LESS LIKE THIS', () => api.less(card, entry)),
        mk('MUTE SOURCE', () => { ctx.toast(`MUTED ${String(entry.item.source?.name).toUpperCase()}`, 'is-ghost'); }),
        mk('RESET GUESSES', () => ctx.toast('OPEN OPTIONS, INTEREST PROFILE TO RESET', 'is-ghost'))
      );
      panel.append(l1, l2);
    },
    open(entry) { drawEvidence(entry); evidence.scrollIntoView({ block: 'nearest' }); }
  };

  function flyCoin(card) {
    const from = card.getBoundingClientRect();
    const target = document.getElementById('coins')?.getBoundingClientRect();
    if (!target) return;
    const c = el('div', 'coinfly');
    c.style.left = (from.left + 20) + 'px'; c.style.top = (from.top + 120) + 'px';
    document.body.append(c);
    const steps = 6; let i = 0;
    const dx = (target.left - from.left - 20) / steps, dy = (target.top - from.top - 120) / steps;
    const t = setInterval(() => {
      i++;
      c.style.transform = `translate3d(${dx * i}px, ${dy * i}px, 0)`;
      if (i >= steps) { clearInterval(t); c.remove(); }
    }, 40);
  }

  /* ---- 9.5 evidence pane ---- */
  function drawEvidence(entry) {
    const it = entry.item;
    const host = it.source?.host || (() => { try { return new URL(it.url).host; } catch { return 'unknown'; } })();
    const when = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : null;
    const ago = d => { if (!d) return 'UNKNOWN'; const h = (Date.now() - new Date(d).getTime()) / 36e5;
                       return h < 48 ? `${Math.max(1, Math.round(h))}H AGO` : `${Math.round(h / 24)}D AGO`; };
    evidence.innerHTML = '';
    evidence.append(el('h2', 't-label', 'SOURCE'));
    const dl = el('dl');
    const add = (k, v, cls) => { dl.append(el('dt', 't-small', k)); const d = el('dd', 't-small' + (cls ? ' ' + cls : '')); d.innerHTML = v; dl.append(d); };
    add('PUBLISHER', `<a href="${it.url}" target="_blank" rel="noopener noreferrer">${(it.source?.name || host).toUpperCase()}</a><br>${host}`);
    add('LISTED', when(it.firstSeen) || 'UNKNOWN');
    add('LAST CHECKED', ago(it.lastSeen));
    add('DEADLINE', it.deadline ? `STATED: ${when(it.deadline)}` : 'MISSING', it.deadline ? '' : 'missing');
    add('ELIGIBILITY', it.eligibility ? `STATED: ${it.eligibility}` : 'MISSING', it.eligibility ? '' : 'missing');
    if (it.pay) add('PAY', it.pay.disclosed ? `DISCLOSED: ${it.pay.currency} ${it.pay.amount.toLocaleString('en-IN')}/${it.pay.period}` : 'MISSING', it.pay.disclosed ? '' : 'missing');
    evidence.append(dl);

    if (it._mock) {
      const w = el('p', 't-small');
      w.style.color = 'var(--orange)';
      w.textContent = 'SEED ROW — fictional, not a real listing.';
      evidence.append(w);
    }

    const acts = el('div', 'row');
    const open = el('a', 'btn t-small', 'OPEN ORIGINAL');
    open.href = it.url; open.target = '_blank'; open.rel = 'noopener noreferrer';
    open.style.textDecoration = 'none';
    const rep = el('button', 'btn t-small is-ghost', 'REPORT OUTDATED');
    rep.onclick = () => {
      rep.replaceWith((() => {
        const f = el('div'); f.style.display = 'grid'; f.style.gap = 'calc(2*var(--u))';
        const i2 = el('input'); i2.className = 't-small';
        i2.placeholder = 'what is wrong?';
        i2.style.cssText = 'background:var(--surface-hi);color:var(--text);border:var(--u) solid var(--edge);padding:calc(2*var(--u))';
        const s2 = el('button', 'btn t-small', 'SAVE NOTE');
        s2.onclick = () => { ctx.toast('NOTED LOCALLY', 'is-ghost'); f.remove(); };
        f.append(i2, s2); return f;
      })());
    };
    acts.append(open, rep);
    evidence.append(acts);

    /* pathways: up to 3, each with a plain reason. Only real overlaps. */
    const kws = new Set((it.skills || []).map(s => s.toLowerCase()));
    const near = ctx.items.filter(o => o.id !== it.id && (o.skills || []).some(s => kws.has(s.toLowerCase()))).slice(0, 3);
    if (near.length) {
      evidence.append(el('h2', 't-label', 'PATHWAYS'));
      for (const o of near) {
        const shared = (o.skills || []).find(s => kws.has(s.toLowerCase()));
        const p = el('div', 'pathway');
        p.innerHTML = `<span class="t-small" style="color:var(--text)">${o.title}</span>
          <span class="t-small" style="color:var(--muted)">shares topic: ${String(shared).toUpperCase()}</span>`;
        const sb = el('button', 'btn t-small', 'SAVE');
        sb.onclick = async () => { await mark(o, STATE.SAVED); ctx.coins++; ctx.refreshChrome(); ctx.SFX.save(); sb.textContent = 'SAVED'; };
        p.append(sb);
        evidence.append(p);
      }
    }
  }

  /* ---- draw the list ---- */
  let cards = [];
  function draw(reshuffle = false) {
    list.innerHTML = '';
    cards = [];
    let drop;
    if (view === 'ALL') {
      drop = ctx.items.map(it => ({ item: it, s: { daysLeft: it.deadline ? (new Date(it.deadline) - Date.now()) / 864e5 : null, why: ['place'], place: '' }, tag: 'ALL' }));
      const key = { RELEVANCE:null, NEWEST:'firstSeen', DEADLINE:'deadline', SOURCE:'source' }[sort];
      if (key === 'firstSeen') drop.sort((a, b) => new Date(b.item.firstSeen) - new Date(a.item.firstSeen));
      if (key === 'deadline')  drop.sort((a, b) => (a.s.daysLeft ?? 1e9) - (b.s.daysLeft ?? 1e9));
      if (key === 'source')    drop.sort((a, b) => String(a.item.source?.name).localeCompare(String(b.item.source?.name)));
      if (key === null) drop = assembleDrop(ctx.items, ctx.weights, { n: ctx.items.length, align });
    } else {
      drop = assembleDrop(ctx.items, ctx.weights, { n: ctx.settings.dropSize, align });
      if (lens !== 'ALL') drop = [...drop].sort((a, b) => (b.s.total + lensBoost(b)) - (a.s.total + lensBoost(a)));
    }

    drop.forEach((entry, i) => {
      if (i > 0) {
        const dv = el('div', 'divider');
        dv.innerHTML = `<span class="l"></span><span class="t t-small">STAGE ${String(i + 1).padStart(2, '0')}</span><span class="l"></span>`;
        list.append(dv);
      }
      const card = stageCard(entry, i, ctx, api);
      cards.push({ card, entry });
      list.append(card);
    });

    if (view === 'FOR_ME') list.append(stageClear(drop));
    if (drop[0]) api.select(cards[0].card, drop[0]);
    if (reshuffle) {
      list.style.animation = 'none';
      void list.offsetWidth;
      list.style.animation = 'why-open .16s steps(4,end)';
    }
  }

  /* ---- 9.6 STAGE CLEAR. Counts are real or the line is omitted. ---- */
  function stageClear(drop) {
    const dv = el('div', 'divider');
    dv.innerHTML = `<span class="l"></span><span class="t t-small">END OF STAGE</span><span class="l"></span>`;
    const box = el('div', 'clear corner-2');
    const closing = drop.filter(e => e.s.daysLeft != null && e.s.daysLeft <= 3).length;
    const local = drop.filter(e => e.s.place === 'city' || e.s.place === 'state').length;
    const bits = [];
    if (closing) bits.push(`${closing} close within 3 days`);
    if (local)   bits.push(`${local} in Gujarat`);
    box.innerHTML = `<div class="banner t-display halo-gold">STAGE CLEAR!</div>
      <p class="t-body" style="color:var(--text)">Back tomorrow.${bits.length ? ' ' + bits.join(', ') + '.' : ''}</p>
      <p class="t-small" style="color:var(--muted)">No load more here. The drop ends on purpose.</p>`;
    const btns = el('div', 'btns');
    const keep = el('button', 'btn t-small', 'KEEP BROWSING');
    keep.onclick = () => { view = 'ALL'; ctx.SFX.click(); buildHead(); draw(true); };
    const desk = el('button', 'btn t-small is-ghost', 'GO TO DESK');
    desk.onclick = () => { ctx.SFX.turn(); ctx.go('desk'); };
    btns.append(keep, desk);
    box.append(btns);
    const w = el('div');
    w.append(dv, box);
    return w;
  }

  /* ---- keyboard, section 18.4 ---- */
  let cursor = 0;
  const move = n => {
    if (!cards.length) return;
    cursor = Math.max(0, Math.min(cards.length - 1, cursor + n));
    const { card, entry } = cards[cursor];
    card.focus(); api.select(card, entry);
    card.scrollIntoView({ block: 'nearest' });
  };
  const onKey = e => {
    const k = e.detail.key;
    const cur = cards[cursor];
    if (k === 'j' || k === 'arrowdown')  { e.detail.raw.preventDefault(); return move(1); }
    if (k === 'k' || k === 'arrowup')    { e.detail.raw.preventDefault(); return move(-1); }
    if (!cur) return;
    if (k === 's') { e.detail.raw.preventDefault(); return api.save(cur.card, cur.entry); }
    if (k === 'x') { e.detail.raw.preventDefault(); return api.less(cur.card, cur.entry); }
    if (k === 'p') { e.detail.raw.preventDefault(); return planIt(cur.entry); }
    if (k === '?' || k === '/') { e.detail.raw.preventDefault();
      return api.why(cur.card, cur.entry, cur.card.querySelector('.why-panel'), cur.card.querySelector('.why-btn')); }
    if (k === 'enter') { e.detail.raw.preventDefault(); return api.open(cur.entry); }
  };
  async function planIt(entry) {
    await mark(entry.item, STATE.PLANNED, { plannedFor: entry.item.deadline || null });
    await bump(entry.item.skills, 'plan');
    ctx.SFX.checkpoint();
    ctx.toast('PLANNED — IN THE QUEST LOG', 'is-lime');
  }
  document.addEventListener('arcade:key', onKey);
  new MutationObserver((m, o) => {
    if (!wrap.isConnected) { document.removeEventListener('arcade:key', onKey); o.disconnect(); }
  }).observe(document.getElementById('page'), { childList: true });

  buildHead();
  draw();
  return wrap;
}
