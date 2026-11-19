/* THE WALL — stage 4. Six wall materials, string lights (one bulb per active day, never reset),
   zones that hold your saved items, goal cards with checkpoints, and a shelf with a plant and trophies. */

import * as S from './store.js';
import * as UNDO from './undo.js';
import { ditherTo16 } from './sprites.js';
import { WALL_ZONES } from './model.js';

export const title = 'Wall';
export const keys = [];

const MATERIALS = ['cork', 'brick', 'panel', 'pegboard', 'plaster', 'chalk'];
/* Zones the wall fills for you from what you saved. */
const AUTO_ZONES = [
  ['HACKS', ['hackathon']],
  ['JOBS', ['job', 'internship']],
  ['SCHEMES', ['scheme']],
  ['NEWS', ['news']]
];
/* Zones you fill yourself, from UI Spec v2 section 13.2. A pin always lands in one of these. */
const PIN_ZONES = WALL_ZONES;
/* Rendered in this order: what the wall knows, then what you put there. */
const ZONES = [...AUTO_ZONES, ...PIN_ZONES.map(z => [z, []])];
const SHOWN = [S.STATE.SAVED, S.STATE.PLANNED, S.STATE.PINNED, S.STATE.DONE];
const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
const uid = () => 'g-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
/* chalk is dark: its captions are already on paper chips, so text stays readable on every material. */

/** A completed checkpoint lights up: four stepped frames, no blur, removed when it is done. */
function burst(node) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const b = document.createElement('span');
  b.className = 'burst';
  node.append(b);
  setTimeout(() => b.remove(), 400);
}

export async function render(ctx) {
  const wrap = el('div');
  const h = el('div', 'hdr'); h.innerHTML = '<h1 class="t-display">WALL</h1>';
  wrap.append(h);

  let material = MATERIALS.includes(ctx.settings.wallMaterial) ? ctx.settings.wallMaterial : 'cork';
  const personal = (await S.all('personal')).filter(p => p.snapshot && SHOWN.includes(p.state));
  let goals = await S.all('goals');
  const apps = await S.all('apps');
  const notes = await S.all('notes');
  let weeks = await S.allWeeks();   // reassigned when a week changes
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
  /* ---- the four ways things get onto the wall ---- */
  let pins = await S.all('wallpins');
  const addBar = el('div', 'addbar');

  const photoInput = el('input'); photoInput.type = 'file'; photoInput.accept = 'image/*';
  photoInput.hidden = true; photoInput.id = 'wall-photo';
  photoInput.onchange = async () => {
    for (const file of photoInput.files || []) {
      const url = URL.createObjectURL(file);
      try {
        const img = await new Promise((res, rej) => {
          const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
        });
        const r = Math.min(96 / img.width, 96 / img.height, 1);
        const c = ditherTo16(img, Math.max(1, Math.round(img.width * r)), Math.max(1, Math.round(img.height * r)));
        await S.put('wallpins', S.blankWallPin({
          type: 'photo', content: c.toDataURL('image/png'), caption: file.name, zone: 'MEMORIES'
        }));
      } finally { URL.revokeObjectURL(url); }
    }
    photoInput.value = '';
    pins = await S.all('wallpins'); ctx.SFX.pin(); drawZones();
  };

  const addHost = el('div');
  function openAdd(kind) {
    addHost.innerHTML = '';
    const f = el('div', 'addform');
    const zone = el('select', 'field'); zone.id = 'pin-zone';
    for (const z of PIN_ZONES) zone.append(new Option(z, z));
    let value;
    if (kind === 'text') {
      value = el('textarea', 'field'); value.rows = 2; value.id = 'pin-text';
      value.placeholder = 'a quote, a note to self, anything';
      zone.value = 'MOTIVATION';
    } else {
      const options = personal.filter(o => o.snapshot);
      if (!options.length) {
        addHost.append(el('p', 'wall-cap t-small', 'NOTHING SAVED YET TO PIN.'));
        return;
      }
      value = el('select', 'field'); value.id = 'pin-item';
      for (const o of options) value.append(new Option(o.snapshot.title, o.id));
      zone.value = 'PINNED FROM DESK';
    }
    const cap = el('input', 'field'); cap.placeholder = 'caption (optional)'; cap.id = 'pin-cap';
    const ok = el('button', 'btn is-primary t-small', 'PIN IT');
    ok.onclick = async () => {
      const content = String(value.value || '').trim();
      if (!content) { value.focus(); return; }
      await S.put('wallpins', S.blankWallPin({ type: kind, content, caption: cap.value.trim(), zone: zone.value }));
      pins = await S.all('wallpins'); addHost.innerHTML = ''; ctx.SFX.pin(); drawZones();
    };
    const no = el('button', 'btn is-ghost t-small', 'CANCEL');
    no.onclick = () => { addHost.innerHTML = ''; ctx.SFX.back(); };
    f.append(zone, value, cap, ok, no);
    addHost.append(f);
    value.focus();
  }

  const addText = el('button', 'btn t-small', '+ TEXT');
  addText.onclick = () => openAdd('text');
  const addPhoto = el('button', 'btn t-small', '+ PHOTO');
  addPhoto.onclick = () => photoInput.click();
  const addPinned = el('button', 'btn t-small', '+ PIN FROM DESK');
  addPinned.onclick = () => openAdd('item_ref');
  const addGoalBtn = el('button', 'btn t-small', '+ GOAL');
  addGoalBtn.onclick = () => { form.hidden = !form.hidden; ctx.SFX.click(); };

  addBar.append(addText, addPhoto, addPinned, addGoalBtn, photoInput);
  wall.append(addBar, addHost);

  const zones = el('div', 'zones');
  function drawZones() {
    zones.innerHTML = '';
    for (const [name, types] of ZONES) {
      const z = el('section', 'zone');
      z.append(el('h3', 't-small', name));

      const mine = types.length ? personal.filter(p => types.includes(p.snapshot.type)) : [];
      for (const p of mine) {
        const c = el(p.snapshot.url ? 'a' : 'div', 'pin-card');
        if (p.snapshot.url) { c.href = p.snapshot.url; c.target = '_blank'; c.rel = 'noopener noreferrer'; c.style.textDecoration = 'none'; }
        c.append(el('span', 'pn t-small', p.snapshot.title),
          el('span', 't-small', p.state === S.STATE.DONE ? 'DONE' : (p.snapshot.org || '')));
        z.append(c);
      }

      for (const pin of pins.filter(x => x.zone === name)) {
        // spelled out rather than built from the type, so every class this page uses is greppable
        const KIND = { photo: 'pin-card pin-photo', item_ref: 'pin-card pin-item', text: 'pin-card pin-text' };
        const c = el('div', KIND[pin.type] || 'pin-card pin-text');
        if (pin.type === 'photo') {
          const i = new Image(); i.src = pin.content; i.alt = pin.caption || ''; i.className = 'polaroid-shot';
          c.append(i);
        } else if (pin.type === 'item_ref') {
          const rec = personal.find(p => p.id === pin.content);
          c.append(el('span', 'pn t-small', rec?.snapshot?.title || 'THIS ITEM IS GONE'));
        } else {
          c.append(el('span', 'pn t-hand', pin.content));
        }
        if (pin.caption) c.append(el('span', 'pcap t-small', pin.caption));
        const x = el('button', 'btn is-ghost t-small', 'UNPIN');
        x.onclick = async () => {
          const back = await S.snapshotFor('wallpins', pin.id);
          await S.del('wallpins', pin.id); pins = await S.all('wallpins');
          ctx.SFX.del(); drawZones();
          UNDO.record('unpinned ' + (pin.caption || pin.content || 'a pin').slice(0, 40),
            async () => { await back(); pins = await S.all('wallpins'); drawZones(); });
          ctx.toast('UNPINNED', 'is-orange', { undo: true });
        };
        c.append(x);
        z.append(c);
      }

      if (!mine.length && !pins.some(x => x.zone === name)) z.append(el('p', 'wall-cap t-small', 'NOTHING PINNED'));
      zones.append(z);
    }
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
  form.hidden = true;
  form.append(gi, ci, ga); wall.append(form);
  const goalsHost = el('div', 'goals'); wall.append(goalsHost);

  function drawGoals() {
    goalsHost.innerHTML = '';
    if (!goals.length) { goalsHost.append(el('p', 'wall-cap t-small', 'NO GOALS YET')); drawShelf(); return; }
    for (const g of goals) {
      const done = g.checkpoints.filter(c => c.done).length, total = g.checkpoints.length;
      const complete = total > 0 && done === total;
      if (complete && !g.gold) { g.gold = true; S.put('goals', g); }
      const card = el('div', 'goal' + (g.gold ? ' is-gold' : ''));
      card.append(el('h3', 't-label', g.title));
      if (g.gold) card.append(el('span', 'gold-tag t-small', 'DONE \u2014 THIS STAYS HERE'));
      const bar = el('div', 'goalbar'); const fill = el('i'); fill.style.width = total ? `${Math.round(done / total * 100)}%` : '0%'; bar.append(fill);
      card.append(bar, el('span', 't-small', total ? `${done}/${total}` : 'NO CHECKPOINTS'));
      g.checkpoints.forEach((c, i) => {
        const b = el('button', 'cp t-small' + (c.done ? ' is-done' : ''));
        b.append(el('span', 'box'), el('span', 'tx', c.t));
        b.onclick = async () => {
          const back = await S.snapshotFor('goals', g.id);
          c.done = !c.done;
          c.done_at = c.done ? Date.now() : null;
          if (c.done) burst(b);
          await S.put('goals', g);
          UNDO.record((c.done ? 'ticked ' : 'unticked ') + (c.t || 'a checkpoint'),
            async () => { await back(); goals = await S.all('goals'); drawGoals(); });
          c.done ? (g.checkpoints.every(x => x.done) ? ctx.SFX.levelUp() : ctx.SFX.checkpoint()) : ctx.SFX.click();
          drawGoals();
        };
        card.append(b);
      });
      const rm = el('button', 'mini t-small', 'REMOVE GOAL');
      rm.onclick = async () => {
        if (rm.dataset.armed !== '1') { rm.dataset.armed = '1'; rm.textContent = 'SURE? CLICK AGAIN'; return; }
        const back = await S.snapshotFor('goals', g.id);
        await S.del('goals', g.id); goals = await S.all('goals'); ctx.SFX.del(); drawGoals();
        UNDO.record('removed the goal ' + g.title,
          async () => { await back(); goals = await S.all('goals'); drawGoals(); });
        ctx.toast('GOAL REMOVED', 'is-orange', { undo: true });
      };
      card.append(rm); goalsHost.append(card);
    }
    drawShelf();
  }

  /* ---- shelf: the plant grows with LVL; one trophy per finished goal and per DONE item ---- */
  /* ================= this week =================
     One modest outcome, chosen by you. A rest week is a week you were here, recorded as such.
     Nothing on this wall can be lost by not turning up. */
  const weekBox = el('div', 'weekbox'); wall.append(weekBox);

  async function drawWeek() {
    weekBox.innerHTML = '';
    weeks = await S.allWeeks();
    const cad = S.cadence(weeks);
    const w = cad.thisWeek;

    weekBox.append(el('h2', 'wall-cap t-label', 'THIS WEEK'));

    if (w.rest) {
      const r = el('p', 'restline t-body', 'A REST WEEK. RECORDED, AND IT COUNTS AS BEING HERE.');
      weekBox.append(r);
    } else {
      const row = el('div', 'weekrow');
      const q = el('input', 'field'); q.id = 'week-quest';
      q.placeholder = 'one modest thing to finish this week';
      q.value = w.quest || '';
      q.onchange = async () => { w.quest = q.value.trim(); await S.saveWeek(w); drawWeek(); };
      row.append(q);
      if (w.quest) {
        const d = el('button', 'cp t-small' + (w.done ? ' is-done' : ''));
        d.append(el('span', 'box'), el('span', 'tx', w.done ? 'FINISHED' : 'MARK IT FINISHED'));
        d.onclick = async () => {
          w.done = !w.done; await S.saveWeek(w);
          w.done ? ctx.SFX.levelUp() : ctx.SFX.click();
          weeks = await S.allWeeks();
          drawWeek(); drawShelf();
        };
        row.append(d);
      }
      weekBox.append(row);
    }

    const rest = el('button', 'btn is-ghost t-small', w.rest ? 'MAKE IT A WORKING WEEK' : 'MAKE THIS A REST WEEK');
    rest.title = 'A rest week keeps everything you have already done. Nothing is reset by resting.';
    rest.onclick = async () => { w.rest = !w.rest; await S.saveWeek(w); ctx.SFX.click(); drawWeek(); };
    weekBox.append(rest);

    const ref = el('textarea', 'field'); ref.id = 'week-reflection'; ref.rows = 2;
    ref.placeholder = 'what you learned this week (optional)';
    ref.value = w.reflection || '';
    ref.onchange = async () => { w.reflection = ref.value; await S.saveWeek(w); weeks = await S.allWeeks(); drawShelf(); };
    weekBox.append(ref);

    const note = el('p', 'cadence t-small', cad.note.toUpperCase());
    note.title = 'Rest weeks count. There is no run here to break.';
    weekBox.append(note);

    /* milestone cards: only for things that actually happened */
    const marks = [];
    if (cad.outcomesReached >= 1) marks.push(['FIRST OUTCOME', 'You finished a week you set yourself.']);
    if (cad.outcomesReached >= 5) marks.push(['FIVE OUTCOMES', 'Five weeks where you finished what you chose.']);
    if (cad.weeksRested >= 1) marks.push(['YOU RESTED', 'And came back. That is part of it.']);
    if (marks.length) {
      const m = el('div', 'milestones');
      for (const [t, body] of marks) {
        const c = el('div', 'milecard');
        c.append(el('span', 'mt t-label', t), el('span', 'mb t-small', body));
        m.append(c);
      }
      weekBox.append(m);
    }

    /* opt-in co-op challenge: no server, so nobody is ranked and nobody's number is visible */
    const ch = await S.challenge();
    const cbox = el('div', 'coop');
    cbox.append(el('h3', 't-label', 'A CHALLENGE WITH SOMEONE'));
    cbox.append(Object.assign(el('p', 't-small',
      'OPT IN. YOU BOTH AGREE A TARGET AND EACH COUNT YOUR OWN. NOTHING IS SENT, SO THERE IS NO TABLE '
      + 'AND NO RANKING — YOU COMPARE BY TELLING EACH OTHER, IF YOU WANT TO.'),
    { style: 'color:var(--ink-desk)' }));
    if (!ch) {
      const t = el('input', 'field'); t.id = 'coop-title'; t.placeholder = 'e.g. three applications';
      t.setAttribute('aria-label', 'What the challenge is');
      const n = el('input', 'field'); n.id = 'coop-target'; n.type = 'number'; n.min = '1'; n.value = '3';
      n.setAttribute('aria-label', 'How many to aim for');
      n.title = 'How many to aim for';
      const who = el('input', 'field'); who.id = 'coop-who'; who.placeholder = 'with whom (just a name for you)';
      who.setAttribute('aria-label', 'Who you are doing it with');
      const go = el('button', 'btn t-small', 'START IT');
      go.onclick = async () => {
        if (!t.value.trim()) { t.focus(); return; }
        await S.startChallenge(t.value.trim(), n.value, who.value.trim());
        ctx.SFX.pin(); drawWeek();
      };
      const row = el('div', 'cooprow'); row.append(t, n, who, go); cbox.append(row);
    } else {
      const line = el('p', 't-body', `${ch.title.toUpperCase()} — ${ch.count} OF ${ch.target}`
        + (ch.withWhom ? ` · WITH ${ch.withWhom.toUpperCase()}` : ''));
      const bar = el('div', 'goalbar'); const fill = el('i');
      fill.style.width = `${Math.min(100, Math.round(ch.count / ch.target * 100))}%`; bar.append(fill);
      const plus = el('button', 'btn t-small', '+1');
      plus.onclick = async () => { await S.bumpChallenge(1); ctx.SFX.checkpoint(); drawWeek(); };
      const minus = el('button', 'btn is-ghost t-small', '-1');
      minus.onclick = async () => { await S.bumpChallenge(-1); ctx.SFX.click(); drawWeek(); };
      const stop = el('button', 'btn is-ghost t-small', 'END IT');
      stop.onclick = async () => { await S.endChallenge(); ctx.SFX.back(); drawWeek(); };
      const row = el('div', 'cooprow'); row.append(plus, minus, stop);
      cbox.append(line, bar, row);
    }
    weekBox.append(cbox);
  }

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

    /* the progress snapshot: outcomes that happened in the world. It is private because it is
       computed here and never sent, and it measures no hours of any kind. */
    const stats = el('div', 'journey');
    stats.append(el('h3', 't-small', 'YOUR PROGRESS'));
    const snap = S.progressSnapshot({ personal, apps, goals, notes, weeks });
    for (const [k, v] of snap.outcomes) {
      const r = el('div', 'jrow');
      r.append(el('span', 't-small', k), el('b', 't-small', String(v)));
      stats.append(r);
    }
    const extra = [['DAYS SHOWN UP', days.length], ['PINNED HERE', pins.length]];
    for (const [k, v] of extra) {
      const r = el('div', 'jrow');
      r.append(el('span', 't-small', k), el('b', 't-small', String(v)));
      stats.append(r);
    }
    stats.append(Object.assign(el('p', 't-small', 'OUTCOMES ONLY. NOTHING HERE COUNTS TIME SPENT.'),
      { className: 'jnote t-small' }));
    shelf.append(stats);
  }

  drawZones();
  await drawWeek();
  drawGoals();
  return wrap;
}
