/* THE WALL — stage 4. Six wall materials, string lights (one bulb per active day, never reset),
   zones that hold your saved items, goal cards with checkpoints, and a shelf with a plant and trophies. */

import * as S from './store.js';

export const title = 'Wall';
export const keys = [];

const MATERIALS = ['cork', 'brick', 'panel', 'pegboard', 'plaster', 'chalk'];
const ZONES = [
  ['HACKS', ['hackathon']],
  ['JOBS', ['job', 'internship']],
  ['SCHEMES', ['scheme']],
  ['NEWS', ['news']]
];
const SHOWN = [S.STATE.SAVED, S.STATE.PLANNED, S.STATE.PINNED, S.STATE.DONE];
const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
const uid = () => 'g-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
/* chalk is dark: its captions are already on paper chips, so text stays readable on every material. */

export async function render(ctx) {
  const wrap = el('div');
  const h = el('div', 'hdr'); h.innerHTML = '<h1 class="t-display">WALL</h1>';
  wrap.append(h);

  let material = MATERIALS.includes(ctx.settings.wallMaterial) ? ctx.settings.wallMaterial : 'cork';
  const personal = (await S.all('personal')).filter(p => p.snapshot && SHOWN.includes(p.state));
  let goals = await S.all('goals');
  const days = await S.activeDays();

  /* material picker */
  const pick = el('div', 'seg'); pick.style.marginBottom = 'calc(4*var(--u))';
  const wall = el('div'); wall.className = `wall wall-${material}`;
  for (const m of MATERIALS) {
    const b = el('button', 't-small', m.toUpperCase()); b.setAttribute('aria-pressed', String(m === material));
    b.onclick = async () => {
      material = m; wall.className = `wall wall-${m}`;
      [...pick.children].forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      ctx.settings.wallMaterial = m; await S.setSetting('wallMaterial', m); ctx.SFX.rustle();
    };
    pick.append(b);
  }
  wrap.append(pick, wall);

  /* ---- string lights ---- */
  const lights = el('div', 'lights');
  lights.append(el('div', 'wire'));
  const row = el('div', 'row');
  const todayKey = new Date().toISOString().slice(0, 10);
  days.forEach((d, i) => {
    const b = el('button', 'bulb' + (d === todayKey ? ' is-today' : ''));
    b.title = d; b.setAttribute('aria-label', `Bulb ${i + 1}, ${d}`);
    b.onclick = () => ctx.SFX.bulb(i % 25);
    row.append(b);
  });
  lights.append(row, el('span', 'lights-lab t-small', `${days.length} BULB${days.length === 1 ? '' : 'S'}: ONE PER DAY YOU CAME BACK. NEVER RESET.`));
  wall.append(lights);

  /* ---- zones ---- */
  const zones = el('div', 'zones');
  for (const [name, types] of ZONES) {
    const z = el('section', 'zone');
    z.append(el('h3', 't-small', name));
    const mine = personal.filter(p => types.includes(p.snapshot.type));
    if (!mine.length) { const e = el('p', 'wall-cap t-small', 'NOTHING PINNED'); z.append(e); }
    for (const p of mine) {
      const c = el(p.snapshot.url ? 'a' : 'div', 'pin-card');
      if (p.snapshot.url) { c.href = p.snapshot.url; c.target = '_blank'; c.rel = 'noopener noreferrer'; c.style.textDecoration = 'none'; }
      c.append(el('span', 'pn t-small', p.snapshot.title), el('span', 't-small', p.state === S.STATE.DONE ? 'DONE' : (p.snapshot.org || '')));
      z.append(c);
    }
    zones.append(z);
  }
  wall.append(zones);

  /* ---- goals ---- */
  const goalHead = el('div', 'wall-cap t-label', 'GOALS'); wall.append(goalHead);
  const form = el('div', 'goal-form');
  const gi = el('input', 'field'); gi.placeholder = 'a goal, e.g. Win a hackathon';
  const ci = el('input', 'field'); ci.placeholder = 'checkpoints, comma separated';
  const ga = el('button', 'btn is-primary t-small', '+ GOAL');
  ga.onclick = async () => {
    if (!gi.value.trim()) { gi.focus(); return; }
    const cps = ci.value.split(',').map(s => s.trim()).filter(Boolean).map(t => ({ t, done: false }));
    await S.put('goals', { id: uid(), title: gi.value.trim(), checkpoints: cps, created: Date.now() });
    gi.value = ci.value = ''; goals = await S.all('goals'); ctx.SFX.pin(); drawGoals();
  };
  form.append(gi, ci, ga); wall.append(form);
  const goalsHost = el('div', 'goals'); wall.append(goalsHost);

  function drawGoals() {
    goalsHost.innerHTML = '';
    if (!goals.length) { goalsHost.append(el('p', 'wall-cap t-small', 'NO GOALS YET')); drawShelf(); return; }
    for (const g of goals) {
      const card = el('div', 'goal');
      card.append(el('h3', 't-label', g.title));
      const done = g.checkpoints.filter(c => c.done).length, total = g.checkpoints.length;
      const bar = el('div', 'goalbar'); const fill = el('i'); fill.style.width = total ? `${Math.round(done / total * 100)}%` : '0%'; bar.append(fill);
      card.append(bar, el('span', 't-small', total ? `${done}/${total}` : 'NO CHECKPOINTS'));
      g.checkpoints.forEach((c, i) => {
        const b = el('button', 'cp t-small' + (c.done ? ' is-done' : ''));
        b.append(el('span', 'box'), el('span', 'tx', c.t));
        b.onclick = async () => {
          c.done = !c.done; await S.put('goals', g);
          c.done ? (g.checkpoints.every(x => x.done) ? ctx.SFX.levelUp() : ctx.SFX.checkpoint()) : ctx.SFX.click();
          drawGoals();
        };
        card.append(b);
      });
      const rm = el('button', 'mini t-small', 'REMOVE GOAL');
      rm.onclick = async () => {
        if (rm.dataset.armed !== '1') { rm.dataset.armed = '1'; rm.textContent = 'SURE? CLICK AGAIN'; return; }
        await S.del('goals', g.id); goals = await S.all('goals'); ctx.SFX.del(); drawGoals();
      };
      card.append(rm); goalsHost.append(card);
    }
    drawShelf();
  }

  /* ---- shelf: the plant grows with LVL; one trophy per finished goal and per DONE item ---- */
  const shelf = el('div', 'shelf'); wall.append(shelf);
  function drawShelf() {
    shelf.innerHTML = '';
    shelf.append(el('div', 'wall-cap t-small', 'SHELF'));
    const board = el('div', 'board');
    const plant = el('div', 'shelf-plant');
    const leafH = Math.min(24, 6 + ctx.level * 3);
    const lf = el('div', 'lf'); lf.style.height = `calc(${leafH}*var(--u))`;
    plant.append(lf, el('div', 'pt2'));
    plant.title = `Grows with level (LVL ${ctx.level})`;
    board.append(plant);
    const trophies = goals.filter(g => g.checkpoints.length && g.checkpoints.every(c => c.done)).length
      + personal.filter(p => p.state === S.STATE.DONE).length;
    for (let i = 0; i < Math.min(trophies, 12); i++) {
      const t = el('div', 'trophy'); t.append(el('div', 'cup'), el('div', 'stem'), el('div', 'bs')); board.append(t);
    }
    shelf.append(board, el('div', 'plank'));
    if (!trophies) shelf.append(el('p', 'wall-cap t-small', 'FINISH A GOAL OR MARK AN ITEM DONE FOR A TROPHY'));
  }

  drawGoals();
  return wrap;
}
