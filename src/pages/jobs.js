/* JOBS — "Character Select", Compare, and the job detail page. UI Spec v2 section 10.
   There is no overall score anywhere: three honest counts and a tap to read each criterion. */

import { mark, bump, STATE, put, get } from '../store.js';
import { companySprite } from '../sprites.js';
import { metrics } from '../u.js';

export const title = 'Jobs';
export const keys = [['1-4','CLASS'],['C','COMPARE'],['A','MY APPS'],['ENTER','VIEW']];

const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };

/** @type {[string, string, number, string][]} */
const CLASSES = [
  ['mainstream', 'MAINSTREAM', 70, 'var(--cyan)'],
  ['startup',    'STARTUP',    52, 'var(--pink)'],
  ['normal',     'NORMAL',     46, 'var(--gold)'],
  ['remote',     'REMOTE',     46, 'var(--lime)']
];

/* ---- 10.2 filter model. Every filter carries a MUST / NICE mode.
        MUST hides and reports the count hidden. NICE keeps the item but sorts it lower
        and shows a GAP line, so nothing disappears silently. ---- */
const EXP_LEVELS = ['INTERN', 'FRESHER', '1-3 Y', '3-5 Y', '5+ Y'];
const MODES = ['ONSITE', 'HYBRID', 'REMOTE'];

function defaultFilters() {
  return {
    location: { value: '', mode: 'NICE' },
    exp:      { value: [], mode: 'NICE' },
    pay:      { value: null, showUnknown: true, mode: 'NICE' },
    mode:     { value: [], mode: 'NICE' },
    posted:   { value: null, mode: 'NICE' }
  };
}

/** Returns { pass, gaps } — gaps are the NICE criteria this item fails. */
function test(item, f) {
  const gaps = [];
  let pass = true;

  const place = [item.city, item.state, item.country].filter(Boolean).join(' ').toLowerCase();
  if (f.location.value) {
    const want = f.location.value.toLowerCase();
    const hit = place.includes(want) || (want === 'anywhere') || (item.mode === 'online' && want.includes('remote'));
    if (!hit) { if (f.location.mode === 'MUST') pass = false; else gaps.push('place'); }
  }
  if (f.exp.value.length) {
    // Listings rarely state experience in these buckets. Unknown is never treated as a match.
    const stated = item.experience ? item.experience.toUpperCase() : null;
    const hit = stated ? f.exp.value.includes(stated) : false;
    if (!hit) { if (f.exp.mode === 'MUST') pass = false; else gaps.push(stated ? 'experience' : 'experience not stated'); }
  }
  if (f.pay.value != null) {
    const lpa = item.pay?.disclosed
      ? (item.pay.period === 'year' ? item.pay.amount / 1e5 : item.pay.amount * 12 / 1e5)
      : null;
    if (lpa == null) { if (!f.pay.showUnknown) pass = false; else gaps.push('pay not stated'); }
    else if (lpa < f.pay.value) { if (f.pay.mode === 'MUST') pass = false; else gaps.push('pay below target'); }
  }
  if (f.mode.value.length) {
    const m = item.mode === 'online' ? 'REMOTE' : item.mode === 'hybrid' ? 'HYBRID' : 'ONSITE';
    if (!f.mode.value.includes(m)) { if (f.mode.mode === 'MUST') pass = false; else gaps.push('work mode'); }
  }
  if (f.posted.value) {
    const days = (Date.now() - new Date(item.firstSeen).getTime()) / 864e5;
    if (days > f.posted.value) { if (f.posted.mode === 'MUST') pass = false; else gaps.push('older posting'); }
  }
  return { pass, gaps };
}

/* ---- 10.3 the three counts. Each is a number of criteria, never a percentage. ---- */
function counts(item, weights, gaps) {
  const mine = Object.entries(weights).filter(([, w]) => !w.paused && w.weight > 0.3).map(([k]) => k);
  const skills = (item.skills || []).map(s => s.toLowerCase());
  const mat = [], gap = [...gaps], unk = [];

  for (const s of skills) (mine.includes(s) ? mat : gap).push(s);
  if (item.city || item.state) mat.push('place stated'); else if (item.mode !== 'online') unk.push('place');
  if (item.pay?.disclosed) mat.push('pay stated'); else unk.push('pay');
  if (item.deadline) mat.push('deadline stated'); else unk.push('deadline');
  if (item.experience) mat.push('experience stated'); else unk.push('experience');

  return { mat: mat.slice(0, 6), gap: gap.slice(0, 6), unk: unk.slice(0, 6) };
}

function freshDot(item) {
  const h = (Date.now() - new Date(item.lastSeen).getTime()) / 36e5;
  return h < 24 ? '' : h < 72 ? 'stale' : 'old';
}

const payTag = item => {
  if (!item.pay) return ['MISSING', 'missing', 'The listing does not state pay.'];
  if (item.pay.disclosed) {
    const lpa = item.pay.period === 'year' ? item.pay.amount / 1e5 : item.pay.amount * 12 / 1e5;
    return [`₹${lpa.toFixed(1)} LPA`, 'disclosed', 'Stated in the listing.'];
  }
  return ['ESTIMATED', 'estimated', 'Not stated by the employer. Estimated from the listing text.'];
};

/* ---------- page ---------- */
export async function render(ctx) {
  const wrap = el('div');
  let cls = 'mainstream';
  let filters = (await get('meta', 'jobFilters'))?.v || defaultFilters();
  let openPanel = null;
  let ticked = new Set();
  let view = 'list';     // list | detail | vs
  let detailItem = null;

  const head = el('div', 'hdr');
  const tabsRow = el('div', 'classtabs');
  const banner = el('div', 'classbanner');
  const fRow = el('div', 'filterrow');
  const panelHost = el('div');
  const grid = el('div', 'fighters');
  const body = el('div');

  wrap.append(head, tabsRow, banner, fRow, panelHost, body);

  function jobsOf(klass) {
    return ctx.items.filter(it => (it.type === 'job' || it.type === 'internship') &&
      (it.workClass ? it.workClass === klass : klass === 'normal'));
  }

  function buildHead() {
    head.innerHTML = '';
    const h1 = el('h1', 't-display', 'JOBS');
    const apps = el('button', 'btn t-small', 'MY APPLICATIONS');
    apps.onclick = () => { ctx.SFX.click(); ctx.go('apps'); };
    const cmp = el('button', 'btn t-small' + (ticked.size === 2 ? ' is-primary' : ' is-ghost'),
      ticked.size ? `COMPARE (${ticked.size}/2)` : 'COMPARE');
    cmp.title = 'Tick two cards, then compare them side by side (C)';
    cmp.onclick = () => { if (ticked.size === 2) { view = 'vs'; ctx.SFX.click(); draw(); } else ctx.toast('TICK TWO CARDS FIRST', 'is-ghost'); };
    head.append(h1, cmp, apps);
  }

  function buildTabs() {
    tabsRow.innerHTML = '';
    CLASSES.forEach(([k, label, w, colour], i) => {
      const b = el('button', `classtab c-${k} t-label`, label);
      b.style.width = `calc(${w}*var(--u))`;
      b.setAttribute('aria-pressed', String(cls === k));
      b.title = `${jobsOf(k).length} listings`;
      b.onmouseenter = () => ctx.SFX.hover();
      b.onclick = () => { cls = k; ticked.clear(); view = 'list'; ctx.SFX.click(); buildTabs(); buildHead(); draw(); };
      tabsRow.append(b);
    });
    const colour = CLASSES.find(c => c[0] === cls)[3];
    banner.style.background = colour;
  }

  function activeCount(key) {
    const f = filters[key];
    if (key === 'location') return f.value ? 1 : 0;
    if (key === 'pay') return f.value != null ? 1 : 0;
    if (key === 'posted') return f.value ? 1 : 0;
    return (f.value || []).length;
  }

  function buildFilters(hidden) {
    fRow.innerHTML = '';
    const defs = [['location','LOCATION'],['exp','EXP'],['pay','PAY'],['mode','MODE'],['posted','MORE']];
    for (const [key, label] of defs) {
      const n = activeCount(key);
      const b = el('button', 'chip t-small' + (n ? ' is-cyan' : ' is-ghost'), n ? `${label} ${n}` : label);
      b.onclick = () => { openPanel = openPanel === key ? null : key; ctx.SFX.click(); drawPanel(); };
      fRow.append(b);
    }
    if (hidden > 0) {
      const h = el('span', 'hiddencount t-small', `${hidden} HIDDEN BY MUST`);
      h.title = 'MUST filters hide items. The count is always shown so nothing vanishes silently.';
      fRow.append(h);
    }
    const reset = el('button', 'btn t-small is-ghost', 'RESET');
    reset.onclick = () => { filters = defaultFilters(); put('meta', { id:'jobFilters', v:filters }); ctx.SFX.back(); drawPanel(); draw(); };
    fRow.append(reset);
  }

  function mustNice(key) {
    const box = el('div', 'mustnice t-small');
    for (const m of ['MUST', 'NICE']) {
      const b = el('button', m.toLowerCase(), m);
      b.setAttribute('aria-pressed', String(filters[key].mode === m));
      b.title = m === 'MUST' ? 'Hide items that fail this' : 'Keep them, sort them lower, show a GAP line';
      b.onclick = () => { filters[key].mode = m; put('meta', { id:'jobFilters', v:filters }); ctx.SFX.notch(); drawPanel(); draw(); };
      box.append(b);
    }
    return box;
  }

  function drawPanel() {
    panelHost.innerHTML = '';
    buildFilters(lastHidden);
    if (!openPanel) return;
    const p = el('div', 'filterpanel');
    const row = (label, control, key) => {
      const r = el('div', 'frow');
      r.append(el('span', 'lab t-small', label), control, mustNice(key));
      p.append(r);
    };
    if (openPanel === 'location') {
      const box = el('div', 'checkset');
      const inp = el('input', 'tin t-small'); inp.placeholder = 'city, state or anywhere';
      inp.value = filters.location.value; inp.setAttribute('aria-label', 'Location');
      inp.oninput = () => { filters.location.value = inp.value; put('meta', { id:'jobFilters', v:filters }); draw(); };
      box.append(inp);
      for (const place of ['Rajkot', 'Gujarat', 'India', 'anywhere']) {
        const c = el('button', 'chip t-small is-ghost', place.toUpperCase());
        c.onclick = () => { filters.location.value = place; inp.value = place; put('meta', { id:'jobFilters', v:filters }); ctx.SFX.click(); draw(); drawPanel(); };
        box.append(c);
      }
      row('LOCATION', box, 'location');
    }
    if (openPanel === 'exp') {
      const box = el('div', 'checkset t-small');
      for (const lv of EXP_LEVELS) {
        const l = el('label'); const i = el('input'); i.type = 'checkbox';
        i.checked = filters.exp.value.includes(lv);
        i.onchange = () => {
          filters.exp.value = i.checked ? [...filters.exp.value, lv] : filters.exp.value.filter(x => x !== lv);
          put('meta', { id:'jobFilters', v:filters }); draw(); drawPanel();
        };
        l.append(i, el('span', '', lv)); box.append(l);
      }
      row('EXPERIENCE', box, 'exp');
      const note = el('p', 't-small'); note.style.color = 'var(--muted)';
      note.textContent = 'Most listings do not state experience. An unstated level never counts as a match: it shows as UNKNOWN.';
      p.append(note);
    }
    if (openPanel === 'pay') {
      const box = el('div', 'checkset t-small');
      const inp = el('input', 'tin t-small'); inp.type = 'number'; inp.min = '0'; inp.step = '0.5';
      inp.placeholder = 'LPA'; inp.value = filters.pay.value ?? '';
      inp.setAttribute('aria-label', 'Minimum pay in lakh per annum');
      inp.oninput = () => { filters.pay.value = inp.value === '' ? null : Number(inp.value); put('meta', { id:'jobFilters', v:filters }); draw(); };
      const l = el('label'); const chk = el('input'); chk.type = 'checkbox'; chk.checked = filters.pay.showUnknown;
      chk.onchange = () => { filters.pay.showUnknown = chk.checked; put('meta', { id:'jobFilters', v:filters }); draw(); };
      l.append(chk, el('span', '', 'SHOW UNKNOWN PAY'));
      box.append(inp, l);
      row('PAY (LPA)', box, 'pay');
      const note = el('p', 't-small'); note.style.color = 'var(--muted)';
      note.textContent = 'Unknown pay is shown by default, so a listing is never hidden just for staying quiet about money.';
      p.append(note);
    }
    if (openPanel === 'mode') {
      const box = el('div', 'checkset t-small');
      for (const m of MODES) {
        const l = el('label'); const i = el('input'); i.type = 'checkbox';
        i.checked = filters.mode.value.includes(m);
        i.onchange = () => {
          filters.mode.value = i.checked ? [...filters.mode.value, m] : filters.mode.value.filter(x => x !== m);
          put('meta', { id:'jobFilters', v:filters }); draw(); drawPanel();
        };
        l.append(i, el('span', '', m)); box.append(l);
      }
      row('WORK MODE', box, 'mode');
    }
    if (openPanel === 'posted') {
      const box = el('div', 'checkset t-small');
      for (const [label, d] of [['24 H', 1], ['7 D', 7], ['30 D', 30], ['ANY', null]]) {
        const b = el('button', 'chip t-small' + (filters.posted.value === d ? ' is-cyan' : ' is-ghost'), label);
        b.onclick = () => { filters.posted.value = d; put('meta', { id:'jobFilters', v:filters }); ctx.SFX.click(); draw(); drawPanel(); };
        box.append(b);
      }
      row('POSTED WITHIN', box, 'posted');
    }
    panelHost.append(p);
  }

  /* ---- fighter card ---- */
  function fighter(item, i, gaps) {
    const c = counts(item, ctx.weights, gaps);
    const card = el('article', 'fighter corner-1');
    card.tabIndex = 0;
    card.setAttribute('aria-label',
      `${item.title} at ${item.org || 'unknown company'}. ` +
      `${c.mat.length} criteria match, ${c.gap.length} gap, ${c.unk.length} unknown.`);

    const bannerBox = el('div', 'banner');
    bannerBox.style.background = CLASSES.find(x => x[0] === cls)[3];
    const d50 = el('div', 'd50');
    d50.style.cssText = 'position:absolute;inset:0';
    bannerBox.append(d50);
    const m = metrics(ctx.settings.density);
    const sp = companySprite(item.org || item.title, 2 * m.uDev);
    sp.style.width = 'calc(16*var(--u))'; sp.style.height = 'calc(16*var(--u))';
    sp.setAttribute('role', 'img');
    sp.setAttribute('aria-label', `mark generated from the name ${item.org || item.title}`);
    bannerBox.append(sp);
    if (i < 9) bannerBox.append(el('div', 'keytile t-small', String(i + 1)));

    const tick = el('button', 'tick');
    tick.title = 'Tick to compare';
    tick.setAttribute('aria-label', 'Select for compare');
    tick.setAttribute('aria-pressed', String(ticked.has(item.id)));
    tick.onclick = ev => {
      ev.stopPropagation();
      if (ticked.has(item.id)) ticked.delete(item.id);
      else { if (ticked.size >= 2) { ctx.toast('TWO AT A TIME', 'is-ghost'); return; } ticked.add(item.id); }
      ctx.SFX.click(); tick.setAttribute('aria-pressed', String(ticked.has(item.id))); buildHead();
    };

    const role = el('h2', 'role t-title', item.title);
    const co = el('p', 'co t-small', '@ ' + String(item.org || 'UNKNOWN').toUpperCase());

    const bars = el('div', 'bars');
    for (const [k, lab, listed] of /** @type {[string, string, string[]][]} */ (
      [['mat', 'MAT', c.mat], ['gap', 'GAP', c.gap], ['unk', 'UNK', c.unk]])) {
      const b = el('div', `fbar ${k}`);
      const segs = el('div', 'segs');
      for (let s = 0; s < 6; s++) { const si = el('i'); if (s < listed.length) si.classList.add('on'); segs.append(si); }
      b.append(el('span', 'lab t-small', lab), segs);
      b.title = listed.length ? `${lab}: ${listed.join(', ')}` : `${lab}: none`;
      bars.append(b);
    }

    const foot = el('div', 'foot');
    const dot = el('span', 'fdot ' + freshDot(item));
    dot.title = `Last checked ${Math.round((Date.now() - new Date(item.lastSeen).getTime()) / 36e5)}h ago`;
    const viewB = el('button', 'btn t-small', 'VIEW');
    viewB.style.width = 'calc(40*var(--u))';
    viewB.onclick = ev => { ev.stopPropagation(); openDetail(item); };
    foot.append(dot, viewB);

    card.append(bannerBox, tick, role, co, bars, foot);
    card.onmouseenter = () => ctx.SFX.hover();
    card.onkeydown = e => { if (e.key === 'Enter') openDetail(item); };
    return card;
  }

  /* ---- 10.4 detail ---- */
  function openDetail(item) { detailItem = item; view = 'detail'; ctx.SFX.click(); draw(); }

  function detail(item) {
    const box = el('div');
    const back = el('button', 'btn t-small is-ghost', '◀ BACK');
    back.onclick = () => { view = 'list'; ctx.SFX.back(); draw(); };
    box.append(back);

    const m = metrics(ctx.settings.density);
    const hdr = el('div', 'hdr');
    hdr.style.marginTop = 'calc(4*var(--u))';
    const sp = companySprite(item.org || item.title, 3 * m.uDev);   // 8x8 cells at 3u, never a scaled 16x16
    sp.style.width = 'calc(24*var(--u))'; sp.style.height = 'calc(24*var(--u))';
    sp.setAttribute('role', 'img'); sp.setAttribute('aria-label', 'generated company mark');
    const t = el('div');
    t.append(el('h1', 't-title', item.title),
             el('p', 't-small', `${String(item.org || 'UNKNOWN').toUpperCase()} · ${(item.city || (item.mode === 'online' ? 'ONLINE' : 'PLACE NOT STATED')).toUpperCase()}`));
    t.querySelector('p').style.color = 'var(--muted)';
    hdr.append(sp, t);
    box.append(hdr);

    const tags = el('div', 'row');
    tags.style.display = 'flex'; tags.style.gap = 'calc(3*var(--u))'; tags.style.flexWrap = 'wrap';
    for (const txt of [item.mode.toUpperCase(), item.type.toUpperCase(), item.workClass ? item.workClass.toUpperCase() : null].filter(Boolean))
      tags.append(el('span', 'chip t-small is-ghost', txt));
    box.append(tags);

    /* pay + the same tag set for every claimed field */
    const facts = el('div');
    facts.style.marginTop = 'calc(4*var(--u))';
    const [payTxt, payCls, payWhy] = payTag(item);
    const factRow = (k, val, cls, why) => {
      const r = el('div', 'frow');
      r.style.gridTemplateColumns = 'calc(30*var(--u)) 1fr auto';
      const tg = el('span', `tag t-small ${cls}`, cls.toUpperCase());
      if (why) tg.title = why;
      r.append(el('span', 'lab t-small', k), el('span', 't-body', val), tg);
      facts.append(r);
    };
    factRow('PAY', payTxt, payCls, payWhy);
    factRow('EXP', item.experience || 'not stated', item.experience ? 'disclosed' : 'missing');
    factRow('EDU', item.education || 'not stated', item.education ? 'disclosed' : 'missing');
    factRow('TERM', item.term || 'not stated', item.term ? 'disclosed' : 'missing');
    factRow('AUTH', item.workAuth || 'not stated', item.workAuth ? 'disclosed' : 'missing');
    factRow('DEADLINE', item.deadline ? new Date(item.deadline).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : 'not stated',
            item.deadline ? 'disclosed' : 'missing');
    box.append(facts);

    /* fit breakdown, no limit on lines here */
    const c = counts(item, ctx.weights, []);
    const fit = el('div');
    fit.style.marginTop = 'calc(4*var(--u))';
    fit.append(el('h2', 't-label', 'FIT'));
    for (const [kind, lab, listed] of [['match','MATCH',c.mat],['gap','GAP',c.gap],['unk','UNKNOWN',c.unk]]) {
      for (const one of listed) {
        const line = el('div', `fit is-${kind}`);
        line.innerHTML = `<span class="g" style="width:calc(7*var(--u));height:calc(7*var(--u));display:inline-block;background:${
          kind === 'match' ? 'var(--lime)' : kind === 'gap' ? 'transparent' : 'transparent'};${
          kind === 'gap' ? 'outline:var(--u) solid var(--danger)' : kind === 'unk' ? 'outline:var(--u) dotted var(--muted)' : ''}"></span>
          <span class="lab t-small">${lab}</span><span class="val t-small">${one}</span>`;
        fit.append(line);
      }
    }
    box.append(fit);

    /* description */
    if (item.description) {
      const d = el('div'); d.style.marginTop = 'calc(4*var(--u))';
      d.append(el('h2', 't-label', 'DESCRIPTION'), el('p', 't-body', item.description));
      box.append(d);
    }

    /* freshness receipt */
    const r = el('div'); r.style.marginTop = 'calc(4*var(--u))';
    r.append(el('h2', 't-label', 'RECEIPT'));
    for (const [k, v] of [
      ['LAST CHECKED', `${Math.round((Date.now() - new Date(item.lastSeen).getTime()) / 36e5)}H AGO`],
      ['LISTED', new Date(item.firstSeen).toLocaleDateString('en-IN')],
      ['SOURCE', `${String(item.source?.name).toUpperCase()} · ${item.source?.host}`]
    ]) {
      const line = el('p', 't-small', `${k}: ${v}`); line.style.color = 'var(--muted)'; r.append(line);
    }
    box.append(r);

    /* 10.4 check before you apply. States what was checked. Never says SAFE. */
    const flags = [];
    if (!item.pay?.disclosed) flags.push('pay is not stated');
    if (!item.org) flags.push('no company name in the listing');
    if ((Date.now() - new Date(item.firstSeen).getTime()) / 864e5 > 60) flags.push('posting is older than 60 days');
    if (item.contactEmail && /gmail|yahoo|outlook|hotmail/i.test(item.contactEmail)) flags.push('contact is a free email address');
    if (item.feeRequired) flags.push('asks for a fee');
    const chk = el('details');
    chk.style.marginTop = 'calc(4*var(--u))';
    const sum = el('summary', 't-label', `CHECK BEFORE YOU APPLY (${flags.length})`);
    sum.style.cursor = 'pointer'; sum.style.color = flags.length ? 'var(--orange)' : 'var(--muted)';
    chk.append(sum);
    for (const fl of flags) {
      const line = el('p', 't-small', `⚑ ${fl}`); line.style.color = 'var(--orange)'; chk.append(line);
    }
    const checkedList = el('p', 't-small',
      'CHECKED: pay stated, company named, posting age, contact address, fee request · ' + new Date().toLocaleDateString('en-IN'));
    checkedList.style.color = 'var(--muted)';
    chk.append(checkedList);
    box.append(chk);

    /* actions */
    const acts = el('div', 'row');
    acts.style.cssText = 'display:flex;gap:calc(4*var(--u));margin-top:calc(6*var(--u));flex-wrap:wrap';
    const save = el('button', 'btn t-small is-primary', 'SAVE');
    save.onclick = async () => { await mark(item, STATE.SAVED); await bump(item.skills, 'save'); ctx.coins++; ctx.refreshChrome(); ctx.SFX.save(); save.textContent = 'SAVED'; };
    const apply = el('a', 'btn t-small', 'APPLY');
    apply.href = item.url; apply.target = '_blank'; apply.rel = 'noopener noreferrer';
    apply.style.textDecoration = 'none';
    apply.onclick = () => { setTimeout(askDidYouApply, 400); };
    const track = el('button', 'btn t-small', 'TRACK');
    track.title = 'Adds a slot to Applications, labelled MANUAL';
    track.onclick = async () => {
      await put('apps', { id: item.id, item, stage: 'APPLIED', label: 'MANUAL', appliedAt: Date.now(), events: [] });
      ctx.SFX.levelUp(); ctx.toast('TRACKED AS MANUAL', 'is-lime');
    };
    const share = el('button', 'btn t-small is-ghost', 'SHARE');
    share.onclick = async () => {
      try { await navigator.clipboard.writeText(item.url); ctx.toast('LINK COPIED', 'is-ghost'); }
      catch { ctx.toast('COULD NOT COPY — THE LINK IS IN THE SOURCE ROW', 'is-orange'); }
    };
    acts.append(save, apply, track, share);
    box.append(acts);

    const askRow = el('div');
    box.append(askRow);
    function askDidYouApply() {
      if (askRow.firstChild) return;
      const q = el('div', 'row');
      q.style.cssText = 'display:flex;gap:calc(3*var(--u));align-items:center;margin-top:calc(4*var(--u))';
      q.append(el('span', 't-small', 'DID YOU APPLY?'));
      const yes = el('button', 'btn t-small', 'YES, LOG IT');
      yes.onclick = async () => {
        await put('apps', { id: item.id, item, stage: 'APPLIED', label: 'EXTERNAL', appliedAt: Date.now(), events: [] });
        ctx.SFX.levelUp(); ctx.toast('LOGGED AS EXTERNAL', 'is-lime'); q.remove();
      };
      const no = el('button', 'btn t-small is-ghost', 'NOT YET');
      no.onclick = () => q.remove();
      q.append(yes, no);
      askRow.append(q);
    }
    return box;
  }

  /* ---- 10.5 VS. No winner, no total, no crown. ---- */
  function vs() {
    const [a, b] = [...ticked].map(id => ctx.items.find(x => x.id === id));
    const box = el('div', 'vs');
    const back = el('button', 'btn t-small is-ghost', '◀ BACK');
    back.onclick = () => { view = 'list'; ctx.SFX.back(); draw(); };
    box.append(back, el('div', 'ttl t-display', 'VS'));
    const m = metrics(ctx.settings.density);
    const cols = el('div', 'cols');
    for (const it of [a, b]) {
      const c = el('div');
      const sp = companySprite(it.org || it.title, 2 * m.uDev);
      sp.style.width = 'calc(16*var(--u))'; sp.style.height = 'calc(16*var(--u))';
      c.append(sp, el('p', 't-title', it.title), el('p', 't-small', String(it.org || 'UNKNOWN').toUpperCase()));
      c.querySelector('.t-small').style.color = 'var(--muted)';
      cols.append(c);
    }
    box.append(cols);

    const val = (it, key) => {
      switch (key) {
        case 'PAY':  { const [t, c] = payTag(it); return [t, c]; }
        case 'TYPE': return [it.type.toUpperCase(), 'disclosed'];
        case 'MODE': return [it.mode.toUpperCase(), 'disclosed'];
        case 'EXP':  return [it.experience || 'not stated', it.experience ? 'disclosed' : 'missing'];
        case 'EDU':  return [it.education || 'not stated', it.education ? 'disclosed' : 'missing'];
        case 'TERM': return [it.term || 'not stated', it.term ? 'disclosed' : 'missing'];
        case 'AUTH': return [it.workAuth || 'not stated', it.workAuth ? 'disclosed' : 'missing'];
        case 'PLACE':return [(it.city || it.state || (it.mode === 'online' ? 'ONLINE' : 'not stated')).toUpperCase(), it.city || it.state ? 'disclosed' : 'missing'];
        case 'DEADLINE': return [it.deadline ? new Date(it.deadline).toLocaleDateString('en-IN') : 'not stated', it.deadline ? 'disclosed' : 'missing'];
      }
    };
    for (const key of ['PAY','TYPE','MODE','EXP','EDU','TERM','AUTH','PLACE','DEADLINE']) {
      const [av, ac] = val(a, key), [bv, bc] = val(b, key);
      const r = el('div', 'vrow' + (av !== bv ? ' differs' : ''));
      r.append(el('span', 'k t-small', key));
      for (const [v, c] of [[av, ac], [bv, bc]]) {
        const cell = el('span', 'v t-small');
        cell.innerHTML = `${v} <span class="tag t-small ${c}">${c.toUpperCase()}</span>`;
        r.append(cell);
      }
      box.append(r);
    }
    const note = el('p', 't-small', 'No winner, no total, no crown. Differences are underlined in gold so you decide.');
    note.style.color = 'var(--muted)';
    const btns = el('div', 'row');
    btns.style.cssText = 'display:flex;gap:calc(4*var(--u));margin-top:calc(4*var(--u))';
    const both = el('button', 'btn t-small is-primary', 'SAVE BOTH');
    both.onclick = async () => { for (const it of [a, b]) { await mark(it, STATE.SAVED); ctx.coins++; } ctx.refreshChrome(); ctx.SFX.save(); both.textContent = 'SAVED BOTH'; };
    const trackBoth = el('button', 'btn t-small', 'TRACK BOTH');
    trackBoth.onclick = async () => {
      for (const it of [a, b]) await put('apps', { id: it.id, item: it, stage:'APPLIED', label:'MANUAL', appliedAt: Date.now(), events: [] });
      ctx.SFX.levelUp(); ctx.toast('BOTH TRACKED AS MANUAL', 'is-lime');
    };
    btns.append(both, trackBoth);
    box.append(note, btns);
    return box;
  }

  /* ---- draw ---- */
  let lastHidden = 0;
  function draw() {
    body.innerHTML = '';
    if (view === 'detail' && detailItem) { body.append(detail(detailItem)); return; }
    if (view === 'vs' && ticked.size === 2) { body.append(vs()); return; }

    const pool = jobsOf(cls);
    const kept = [], hidden = [];
    for (const it of pool) {
      const { pass, gaps } = test(it, filters);
      (pass ? kept : hidden).push({ it, gaps });
    }
    lastHidden = hidden.length;
    buildFilters(lastHidden);
    kept.sort((a, b) => a.gaps.length - b.gaps.length);   // NICE failures sort lower, never hidden

    grid.innerHTML = '';
    if (!kept.length) {
      const e = el('p', 'stub t-body',
        pool.length ? 'Every listing in this class is hidden by a MUST filter. Switch one to NICE to see them again.'
                    : 'No listings in this class yet. The scraper fills these in build step 1.');
      body.append(e);
      return;
    }
    kept.forEach(({ it, gaps }, i) => grid.append(fighter(it, i, gaps)));
    body.append(grid);
  }

  /* ---- keys ---- */
  const onKey = e => {
    const k = e.detail.key;
    if (['1','2','3','4'].includes(k)) { cls = CLASSES[Number(k) - 1][0]; ticked.clear(); view = 'list'; ctx.SFX.click(); buildTabs(); buildHead(); draw(); return; }
    if (k === 'c' && ticked.size === 2) { view = 'vs'; ctx.SFX.click(); draw(); return; }
    if (k === 'a') { ctx.go('apps'); return; }
    if (k === 'escape' && view !== 'list') { view = 'list'; draw(); }
  };
  document.addEventListener('arcade:key', onKey);
  new MutationObserver((m, o) => { if (!wrap.isConnected) { document.removeEventListener('arcade:key', onKey); o.disconnect(); } })
    .observe(document.getElementById('page'), { childList: true });

  buildHead(); buildTabs(); drawPanel(); draw();
  return wrap;
}
