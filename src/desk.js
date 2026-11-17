/* THE DESK — stage 4. A 560 x 400u world: a computer, lamp, mug, plant, and your saved items as paper
   cards. Drag snaps to whole u. Red strings link two items and score what they share. The drawer holds
   removed items for 14 days. Keyboard: Tab to a card, SPACE picks it up, arrows move 1u (SHIFT 8u). */

import * as S from './store.js';
import { metrics } from './u.js';

export const title = 'Desk';
export const keys = [['SPACE','PICK UP'], ['ARROWS','MOVE']];

const W = 560, H = 400, CW = 52, CH = 34;
const KEEP = [S.STATE.SAVED, S.STATE.PLANNED, S.STATE.PINNED];
const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const kw = p => new Set((p.snapshot?.skills || []).map(s => s.toLowerCase()));
const daysTo = d => d ? Math.ceil((new Date(d).getTime() - Date.now()) / 864e5) : null;

export async function render(ctx) {
  const wrap = el('div');
  const h = el('div', 'hdr'); h.innerHTML = '<h1 class="t-display">DESK</h1>';
  wrap.append(h);

  let recs = (await S.all('personal')).filter(p => p.snapshot);
  const deskMeta = (await S.get('meta', 'desk')) || { id: 'desk', lamp: true };
  const uCss = () => metrics(ctx.settings?.density || 'CHUNKY').uCss;

  const live = () => recs.filter(p => KEEP.includes(p.state));
  const drawerRecs = () => recs.filter(p => p.state === S.STATE.DRAWER);
  const save = p => S.put('personal', p);

  /* ---- toolbar ---- */
  const bar = el('div', 'desk-bar');
  const stringBtn = el('button', 'btn t-small', 'RED STRING'); stringBtn.setAttribute('aria-pressed', 'false');
  const shuffleBtn = el('button', 'btn t-small', 'SHUFFLE');
  const drawerBtn = el('button', 'btn t-small', 'DRAWER');
  const hint = el('span', 't-small'); hint.style.color = 'var(--muted)';
  bar.append(stringBtn, shuffleBtn, drawerBtn, hint);
  wrap.append(bar);

  const drawerPanel = el('div', 'drawer-panel t-body'); drawerPanel.hidden = true;
  wrap.append(drawerPanel);

  /* ---- world ---- */
  const scroller = el('div', 'desk-scroll');
  const world = el('div', 'world');
  world.dataset.lamp = deskMeta.lamp ? 'on' : 'off';
  scroller.append(world);
  wrap.append(scroller);

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'strings'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('shape-rendering', 'crispEdges');
  const labels = el('div');

  /* decorative objects */
  const computer = el('div', 'obj computer');
  const screen = el('button', 'screen t-small'); screen.setAttribute('aria-label', 'Computer: open the feed');
  screen.onclick = () => { ctx.SFX.click(); ctx.go('feed'); };
  computer.append(Object.assign(el('div', 'monitor'), {}), el('div', 'stand'), el('div', 'base'));
  computer.firstChild.append(screen);
  const kb = el('div', 'keyboard'); for (let i = 0; i < 28; i++) kb.append(el('i'));
  const mouse = el('div', 'mouse');
  kb.style.position = 'relative'; kb.append(mouse);
  computer.append(kb);

  const lamp = el('button', 'obj lamp'); lamp.setAttribute('aria-label', 'Desk lamp');
  lamp.setAttribute('aria-pressed', String(!!deskMeta.lamp));
  lamp.append(el('div', 'head'), el('div', 'arm'), el('div', 'foot'));
  lamp.onclick = async () => {
    deskMeta.lamp = !deskMeta.lamp;
    lamp.setAttribute('aria-pressed', String(deskMeta.lamp));
    world.dataset.lamp = deskMeta.lamp ? 'on' : 'off';
    ctx.SFX.lamp(); await S.put('meta', deskMeta);
  };
  const shade = el('div', 'shade d50 z-lamp');

  const mug = el('button', 'obj mug'); mug.setAttribute('aria-label', 'Coffee mug');
  mug.onclick = () => ctx.SFX.sip();
  const plant = el('button', 'obj plantpot'); plant.setAttribute('aria-label', 'Plant');
  plant.style.cssText += 'background:none;border:0;padding:0;cursor:pointer';
  const leaves = [[12, 0, 4, 14], [6, 8, 4, 12], [18, 8, 4, 12], [2, 16, 4, 10], [22, 16, 4, 10]];
  for (const [x, y, w, hh] of leaves) {
    const l = el('div', 'leaf'); l.style.cssText = `left:calc(${x}*var(--u));top:calc(${y}*var(--u));width:calc(${w}*var(--u));height:calc(${hh}*var(--u))`;
    plant.append(l);
  }
  plant.append(el('div', 'pot'));
  plant.onclick = () => ctx.SFX.rustle();

  world.append(svg, labels, computer, lamp, mug, plant);

  /* ---- cards ---- */
  const cards = new Map();
  let stringMode = false, firstPick = null;

  const posOf = (p, i) => p.deskPos || { x: 8 + (i % 9) * 60, y: 140 + Math.floor(i / 9) * 44 };

  function setPos(node, pos) {
    node.style.left = `calc(${pos.x}*var(--u))`; node.style.top = `calc(${pos.y}*var(--u))`;
  }

  function makeCard(p, i) {
    const s = p.snapshot;
    const c = el('div', 'paper'); c.tabIndex = 0; c.setAttribute('role', 'button');
    c.setAttribute('aria-label', `${s.title}. Press space to pick up.`);
    c.append(el('span', 'pt t-small', s.title));
    c.append(el('span', 'ps t-small', s.org || ''));
    const dl = daysTo(s.deadline);
    if (dl != null && dl >= 0) c.append(el('span', 'pdue t-small' + (dl <= 3 ? ' is-soon' : ''), dl === 0 ? 'DUE TODAY' : `${dl}D LEFT`));
    const toss = el('button', 'tosser t-small', 'x'); toss.title = 'Put in the drawer (14 days to change your mind)';
    toss.onpointerdown = e => e.stopPropagation();
    toss.onclick = async e => {
      e.stopPropagation(); p.state = S.STATE.DRAWER; p.drawerAt = Date.now();
      await save(p); ctx.SFX.drawer(); ctx.refreshChrome(); paint();
    };
    c.append(toss);
    const pos = posOf(p, i); p.deskPos = pos; setPos(c, pos);
    cards.set(p.id, c);

    /* mouse drag, snapped to whole u on every move */
    c.onpointerdown = e => {
      if (e.button !== 0) return;
      if (stringMode) { e.preventDefault(); return pickForString(p, c); }
      const start = { px: e.clientX, py: e.clientY, x: p.deskPos.x, y: p.deskPos.y };
      let moved = false;
      c.setPointerCapture(e.pointerId); c.classList.add('is-drag', 'sh-drag'); ctx.SFX.pin();
      const move = ev => {
        const u = uCss();
        const nx = clamp(S_snap(start.x + (ev.clientX - start.px) / u), 0, W - CW);
        const ny = clamp(S_snap(start.y + (ev.clientY - start.py) / u), 0, H - CH);
        if (nx !== p.deskPos.x || ny !== p.deskPos.y) moved = true;
        p.deskPos = { x: nx, y: ny }; setPos(c, p.deskPos); drawStrings();
      };
      const up = async () => {
        c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up);
        c.classList.remove('is-drag', 'sh-drag'); ctx.SFX.drop();
        if (moved) await save(p);
      };
      c.addEventListener('pointermove', move); c.addEventListener('pointerup', up);
    };
    c.ondblclick = () => { if (s.url) window.open(s.url, '_blank', 'noopener,noreferrer'); };

    /* keyboard: SPACE picks up, arrows move, SPACE drops */
    let held = false;
    c.onkeydown = async e => {
      if (e.key === ' ') {
        e.preventDefault();
        if (stringMode) return pickForString(p, c);
        held = !held; c.classList.toggle('is-pick', held);
        held ? ctx.SFX.pin() : (ctx.SFX.drop(), await save(p));
        return;
      }
      if (!held) return;
      const step = e.shiftKey ? 8 : 1;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault(); e.stopPropagation();
      p.deskPos = { x: clamp(p.deskPos.x + d[0], 0, W - CW), y: clamp(p.deskPos.y + d[1], 0, H - CH) };
      setPos(c, p.deskPos); drawStrings();
    };
    return c;
  }
  const S_snap = n => Math.round(n);

  /* ---- red strings ---- */
  async function pickForString(p, node) {
    if (!firstPick) { firstPick = p; node.classList.add('is-pick'); hint.textContent = 'NOW CLICK THE SECOND ITEM'; ctx.SFX.pin(); return; }
    if (firstPick.id === p.id) { cards.get(p.id)?.classList.remove('is-pick'); firstPick = null; hint.textContent = 'CLICK TWO ITEMS TO TIE OR CUT A STRING'; return; }
    const a = firstPick, b = p;
    const has = (a.strings || []).includes(b.id);
    a.strings = has ? a.strings.filter(x => x !== b.id) : [...(a.strings || []), b.id];
    await save(a);
    cards.get(a.id)?.classList.remove('is-pick'); firstPick = null;
    has ? ctx.SFX.crumple() : ctx.SFX.pluck();
    hint.textContent = has ? 'STRING CUT' : 'STRING TIED'; drawStrings();
  }

  function drawStrings() {
    svg.innerHTML = ''; labels.innerHTML = '';
    const byId = new Map(live().map(p => [p.id, p]));
    const seen = new Set();
    for (const a of byId.values()) for (const bid of a.strings || []) {
      const b = byId.get(bid); if (!b) continue;
      const key = [a.id, b.id].sort().join('|'); if (seen.has(key)) continue; seen.add(key);
      const ax = a.deskPos.x + CW / 2, ay = a.deskPos.y + CH / 2, bx = b.deskPos.x + CW / 2, by = b.deskPos.y + CH / 2;
      for (const [w, col] of [[3, '#2A0810'], [1, '#C41E3A']]) {
        const l = document.createElementNS(svgNS, 'line');
        l.setAttribute('x1', ax); l.setAttribute('y1', ay); l.setAttribute('x2', bx); l.setAttribute('y2', by);
        l.setAttribute('stroke', col); l.setAttribute('stroke-width', w); svg.append(l);
      }
      const A = kw(a), B = kw(b); const shared = [...A].filter(x => B.has(x));
      const union = new Set([...A, ...B]).size || 1;
      const score = Math.round(shared.length / union * 100);
      const lab = el('div', 't-small', `${score}% · ${shared.length ? shared.slice(0, 2).join(', ') : 'NO OVERLAP'}`);
      lab.style.cssText = `position:absolute;left:calc(${Math.round((ax + bx) / 2) - 18}*var(--u));top:calc(${Math.round((ay + by) / 2) - 5}*var(--u));background:var(--paper);color:var(--ink-desk);border:var(--u) solid var(--string-line);padding:0 calc(1*var(--u));pointer-events:none`;
      labels.append(lab);
    }
  }

  /* ---- paint ---- */
  function paint() {
    for (const c of cards.values()) c.remove();
    cards.clear();
    live().forEach((p, i) => world.append(makeCard(p, i)));
    world.append(shade);
    drawStrings();

    const soon = live().filter(p => { const d = daysTo(p.snapshot.deadline); return d != null && d >= 0 && d <= 7; }).length;
    screen.dataset.on = 'true';
    screen.innerHTML = '';
    screen.append(el('div', '', 'CAREER ARCADE'), el('div', 'l2', `SAVED ${live().length}`),
      el('div', 'l3', `DUE 7D ${soon}`), el('div', '', `LVL ${ctx.level}`));
    drawerBtn.textContent = `DRAWER (${drawerRecs().length})`;
    if (!live().length) hint.textContent = 'EMPTY DESK. SAVE ITEMS FROM THE FEED AND THEY LAND HERE.';
    else if (!stringMode) hint.textContent = 'DRAG TO MOVE. DOUBLE-CLICK OPENS THE LINK. X PUTS IT IN THE DRAWER.';
    drawDrawer();
  }

  function drawDrawer() {
    drawerPanel.innerHTML = '';
    const list = drawerRecs();
    if (!list.length) { drawerPanel.append(el('p', 't-small', 'The drawer is empty. Items you remove wait here for 14 days.')); return; }
    for (const p of list) {
      const row = el('div', 'drawer-row');
      row.append(el('span', 'nm', p.snapshot.title), el('span', 't-small', `${S.drawerDaysLeft(p)}D LEFT`));
      const back = el('button', 'btn t-small', 'RESTORE');
      back.onclick = async () => { p.state = S.STATE.SAVED; p.drawerAt = null; await save(p); ctx.SFX.drawer(); ctx.refreshChrome(); paint(); };
      const gone = el('button', 'btn is-ghost t-small', 'DELETE FOREVER');
      gone.onclick = async () => {
        if (gone.dataset.armed !== '1') { gone.dataset.armed = '1'; gone.textContent = 'SURE?'; return; }
        await S.del('personal', p.id); recs = recs.filter(r => r.id !== p.id); ctx.SFX.del(); ctx.refreshChrome(); paint();
      };
      row.append(back, gone); drawerPanel.append(row);
    }
  }

  /* ---- toolbar actions ---- */
  stringBtn.onclick = () => {
    stringMode = !stringMode; firstPick = null;
    stringBtn.setAttribute('aria-pressed', String(stringMode));
    world.classList.toggle('is-string', stringMode);
    for (const c of cards.values()) c.classList.remove('is-pick');
    hint.textContent = stringMode ? 'CLICK TWO ITEMS TO TIE OR CUT A STRING' : '';
    ctx.SFX.click();
  };
  shuffleBtn.onclick = async () => {
    const list = live().sort(() => Math.random() - 0.5);
    list.forEach((p, i) => { p.deskPos = { x: 8 + (i % 9) * 60, y: 140 + Math.floor(i / 9) * 44 }; });
    await Promise.all(list.map(save)); ctx.SFX.rustle(); paint();
  };
  drawerBtn.onclick = () => { drawerPanel.hidden = !drawerPanel.hidden; ctx.SFX.drawer(); };

  paint();
  return wrap;
}
