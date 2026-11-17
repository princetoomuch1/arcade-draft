/* CALENDAR — stage 5. Quest Log (what is due), week load, month grid.
   Only real records are drawn: saved/planned items with a stated deadline, and applications you logged.
   The Year Wheel is not built yet. */

import { all } from '../store.js';

export const title = 'CALENDAR';
export const keys = [];

const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
const dayKey = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const DOW = ['MON','TUE','WED','THU','FRI','SAT','SUN'];

export async function render(ctx) {
  const wrap = el('div');
  const personal = await all('personal');
  const apps = await all('apps');
  const noteDone = new Set(personal.filter(p => p.state === 'DONE').map(p => p.id));

  /* events: { date:Date, title, url, done } */
  const events = [];
  for (const p of personal) {
    const s = p.snapshot; if (!s?.deadline) continue;
    if (!['SAVED', 'PLANNED', 'PINNED', 'DONE'].includes(p.state)) continue;
    events.push({ date: new Date(s.deadline), title: s.title, url: s.url, done: noteDone.has(p.id), kind: 'DEADLINE' });
  }
  for (const a of apps) {
    if (a.appliedOn) events.push({ date: new Date(a.appliedOn + 'T12:00:00'), title: 'Applied: ' + a.title, url: a.url, done: true, kind: 'APPLIED' });
  }
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  const h = el('div', 'hdr'); h.innerHTML = '<h1 class="t-display">CALENDAR</h1>';
  wrap.append(h);

  if (!events.length) {
    wrap.append(el('p', 'empty t-body',
      'Nothing on the calendar. Save or plan an item that has a deadline, or log an application, and it shows up here.'));
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayKey = dayKey(today);

  /* ---- quest log + week load ---- */
  const top = el('div', 'cal-top');
  const left = el('div', 'cal-col');
  left.append(el('h2', 't-title', 'QUEST LOG'));
  const upcoming = events.filter(e => e.kind === 'DEADLINE' && !e.done && e.date >= today).slice(0, 8);
  if (!upcoming.length) left.append(el('p', 'empty t-small', 'No open deadlines.'));
  for (const e of upcoming) {
    const days = Math.ceil((e.date.getTime() - today.getTime()) / 864e5);
    const row = el('div', 'quest' + (days <= 3 ? ' is-soon' : ''));
    row.append(el('span', 'when t-small', days === 0 ? 'TODAY' : days === 1 ? 'TOMORROW' : days + ' DAYS'));
    if (e.url) { const a = el('a', 't-body', e.title); a.href = e.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; row.append(a); }
    else row.append(el('span', 't-body', e.title));
    left.append(row);
  }

  const right = el('div', 'cal-col');
  right.append(el('h2', 't-title', 'WEEK LOAD'));
  const counts = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() + i);
    return { d, n: events.filter(e => e.kind === 'DEADLINE' && !e.done && dayKey(e.date) === dayKey(d)).length };
  });
  const max = Math.max(1, ...counts.map(c => c.n));
  const week = el('div', 'week'), lab = el('div', 'week-lab t-small');
  counts.forEach((c, i) => {
    const b = el('div', 'bar' + (i === 0 ? ' is-today' : ''));
    b.style.height = `calc(${Math.max(1, Math.round(c.n / max * 44))} * var(--u))`;
    b.title = `${c.n} due`;
    week.append(b);
    lab.append(el('span', '', DOW[(c.d.getDay() + 6) % 7]));
  });
  right.append(week, lab);
  top.append(left, right);
  wrap.append(top);

  /* ---- month grid ---- */
  let cur = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthHost = el('div');
  wrap.append(monthHost);

  function drawMonth() {
    monthHost.innerHTML = '';
    const nav = el('div', 'month-nav');
    const prev = el('button', 'btn t-small', '<'), next = el('button', 'btn t-small', '>');
    prev.onclick = () => { cur = new Date(cur.getFullYear(), cur.getMonth() - 1, 1); ctx.SFX.click(); drawMonth(); };
    next.onclick = () => { cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1); ctx.SFX.click(); drawMonth(); };
    nav.append(prev, el('span', 't-title', `${MONTHS[cur.getMonth()]} ${cur.getFullYear()}`), next);
    monthHost.append(nav);

    const grid = el('div', 'month');
    DOW.forEach(d => grid.append(el('div', 'dow t-small', d)));
    const lead = (cur.getDay() + 6) % 7;
    for (let i = 0; i < lead; i++) grid.append(el('div', 'day is-pad'));
    const dim = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const date = new Date(cur.getFullYear(), cur.getMonth(), d);
      const key = dayKey(date);
      const cell = el('div', 'day' + (key === todayKey ? ' is-today' : ''));
      cell.append(el('span', 't-small', String(d)));
      const todays = events.filter(e => dayKey(e.date) === key);
      if (todays.length) {
        const dots = el('div', 'dots');
        todays.slice(0, 5).forEach(e => dots.append(el('i', 'dot' + (e.done ? ' is-done' : ''))));
        cell.append(dots);
        cell.title = todays.map(e => e.title).join('\n');
      }
      grid.append(cell);
    }
    monthHost.append(grid);
    monthHost.append(el('p', 'empty t-small', 'PINK DOT = due. GREEN DOT = done or applied.'));
  }
  drawMonth();
  return wrap;
}
