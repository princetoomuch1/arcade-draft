/* CALENDAR — the quest log. UI Spec v2 section 12.4.
 *
 * Three dates, never confused with one another:
 *   OFFICIAL   from the source. Locked. This app cannot edit it and does not pretend to.
 *   START BY   yours. When you mean to begin.
 *   CHECKPOINTS yours. The steps in between.
 * Reminders only show while this app is open: there is no server and no push, and the page says so.
 */

import * as S from '../store.js';
import * as UNDO from '../undo.js';
import { outLink } from '../link.js';

export const title = 'CALENDAR';
export const keys = [['T', 'TODAY']];

const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
const DAY = 864e5;
const dayKey = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const short = t => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }).toUpperCase();
const inputDate = t => (t ? new Date(t).toISOString().slice(0, 10) : '');

export async function render(ctx) {
  const wrap = el('div');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayKey = dayKey(today);

  const personal = (await S.all('personal')).filter(p => p.snapshot);
  const apps = await S.all('apps');
  let plans = await S.all('plans');
  const planOf = id => plans.find(p => p.id === id);

  /* quests = saved or planned items that have a date of some kind */
  const quests = personal
    .filter(p => ['SAVED', 'PLANNED', 'PINNED', 'DONE'].includes(p.state) && p.snapshot.deadline)
    .map(p => ({ rec: p, item: p.snapshot, official: new Date(p.snapshot.deadline).getTime() }))
    .sort((a, b) => a.official - b.official);

  const h = el('div', 'hdr'); h.innerHTML = '<h1 class="t-display">CALENDAR</h1>';
  wrap.append(h);

  const legend = el('p', 'callegend t-small');
  legend.innerHTML = '<span class="k off">OFFICIAL</span> FROM THE SOURCE, LOCKED. '
    + '<span class="k own">START BY</span> AND <span class="k own">CHECKPOINTS</span> ARE YOURS.';
  wrap.append(legend);

  if (!quests.length) {
    wrap.append(el('p', 'empty t-body',
      'Nothing on the calendar. Save or plan something with a deadline and it shows up here, '
      + 'with its official date kept separate from your own plan.'));
  }

  const host = el('div');
  wrap.append(host);

  async function ensurePlan(q) {
    let p = planOf(q.rec.id);
    if (!p) { p = S.blankPlan(q.rec.id, q.item.deadline); await S.savePlan(p); plans = await S.all('plans'); }
    return p;
  }

  /* ================= reminders ================= */
  function reminderPanel() {
    const box = el('div', 'rem');
    box.append(el('h2', 't-title', 'REMINDERS'));

    const on = !!ctx.settings.notifications;
    const sw = el('button', 'btn t-small' + (on ? ' is-primary' : ' is-ghost'), on ? 'REMINDERS ARE ON' : 'REMINDERS ARE OFF');
    sw.setAttribute('aria-pressed', String(on));
    sw.onclick = async () => {
      ctx.settings.notifications = !ctx.settings.notifications;
      await S.setSetting('notifications', ctx.settings.notifications);
      ctx.SFX.click(); draw();
    };
    box.append(sw);

    box.append(Object.assign(el('p', 't-small',
      'THESE SHOW INSIDE THIS APP WHILE IT IS OPEN. THERE IS NO SERVER, SO NOTHING IS PUSHED TO YOUR '
      + 'PHONE AND NO EMAIL IS SENT.'), { style: 'color:var(--muted)' }));

    const q = ctx.settings.quietHours;
    const qr = el('div', 'quiet-row');
    qr.append(el('span', 't-small', 'QUIET HOURS'));
    const from = el('input', 'field'); from.type = 'number'; from.min = '0'; from.max = '23';
    from.id = 'quiet-from'; from.value = q ? String(q.from) : '';
    from.placeholder = 'from';
    const to = el('input', 'field'); to.type = 'number'; to.min = '0'; to.max = '23';
    to.id = 'quiet-to'; to.value = q ? String(q.to) : '';
    to.placeholder = 'to';
    const apply = el('button', 'btn t-small', 'SET');
    apply.onclick = async () => {
      const f = Number(from.value), t = Number(to.value);
      const v = (from.value === '' || to.value === '') ? null : { from: f, to: t };
      ctx.settings.quietHours = v; await S.setSetting('quietHours', v);
      ctx.SFX.click(); draw();
    };
    const clear = el('button', 'btn is-ghost t-small', 'NO QUIET HOURS');
    clear.onclick = async () => {
      ctx.settings.quietHours = null; await S.setSetting('quietHours', null);
      from.value = to.value = ''; ctx.SFX.click(); draw();
    };
    qr.append(from, el('span', 't-small', 'TO'), to, apply, clear);
    box.append(qr);

    const due = S.dueReminders(plans, ctx.settings);
    const state = el('p', 'remstate t-small');
    if (!ctx.settings.notifications) state.textContent = 'OFF, SO NOTHING WILL FIRE.';
    else if (S.inQuietHours(new Date(), ctx.settings.quietHours)) state.textContent = 'QUIET HOURS: HOLDING ANYTHING DUE.';
    else if (!due.length) state.textContent = 'NOTHING DUE RIGHT NOW.';
    else state.textContent = `${due.length} DUE NOW.`;
    box.append(state);

    for (const d of due) {
      const q2 = quests.find(x => x.rec.id === d.plan.item_id);
      const row = el('div', 'remrow');
      row.append(el('span', 't-body', q2 ? q2.item.title : d.plan.item_id));
      const sn = el('button', 'btn t-small', 'SNOOZE 1 DAY');
      sn.onclick = async () => {
        d.reminder.snoozed_until = Date.now() + DAY;
        await S.savePlan(d.plan); plans = await S.all('plans'); ctx.SFX.back(); draw();
      };
      row.append(sn); box.append(row);
    }
    return box;
  }

  /* ================= one quest ================= */
  function questCard(q) {
    const p = planOf(q.rec.id);
    const days = Math.ceil((q.official - today.getTime()) / DAY);
    const card = el('article', 'quest-card corner-1 bevel');

    const head = el('div', 'qhead');
    head.append(outLink(q.item.title, q.item.url, { cls: 'qt t-label' }));
    head.append(el('span', 'qd t-small' + (days <= 3 ? ' soon' : ''),
      days < 0 ? 'CLOSED' : days === 0 ? 'TODAY' : `${days} DAYS`));
    card.append(head);

    /* the three dates, visibly different */
    const dates = el('div', 'dates');
    const off = el('div', 'drow');
    off.append(el('span', 'k off t-small', 'OFFICIAL'), el('span', 't-body', short(q.official)));
    const lock = el('span', 'lk t-small', 'LOCKED');
    lock.title = 'This is the source’s date. This app does not edit it.';
    off.append(lock);
    dates.append(off);

    const sb = el('div', 'drow');
    sb.append(el('span', 'k own t-small', 'START BY'));
    const sbi = el('input', 'field'); sbi.type = 'date'; sbi.id = 'startby-' + q.rec.id;
    sbi.value = inputDate(p?.start_by);
    sbi.max = inputDate(q.official);
    sbi.onchange = async () => {
      const plan = await ensurePlan(q);
      plan.start_by = sbi.value ? new Date(sbi.value + 'T09:00:00').getTime() : null;
      await S.savePlan(plan); plans = await S.all('plans'); ctx.SFX.click(); draw();
    };
    sb.append(sbi);
    if (p?.start_by && p.start_by > q.official) {
      sb.append(Object.assign(el('span', 't-small', 'AFTER THE OFFICIAL DATE'), { style: 'color:var(--danger)' }));
    }
    dates.append(sb);
    card.append(dates);

    /* checkpoints, yours */
    const cps = el('div', 'cps');
    (p?.checkpoints || []).forEach((c, i) => {
      const b = el('button', 'cp t-small' + (c.done ? ' is-done' : ''));
      b.append(el('span', 'box'), el('span', 'tx', c.text));
      b.onclick = async () => {
        const plan = await ensurePlan(q);
        const back = await S.snapshotFor('plans', plan.id);
        plan.checkpoints[i].done = !plan.checkpoints[i].done;
        await S.savePlan(plan); plans = await S.all('plans');
        plan.checkpoints[i].done ? ctx.SFX.checkpoint() : ctx.SFX.click();
        UNDO.record((plan.checkpoints[i].done ? 'ticked ' : 'unticked ') + (plan.checkpoints[i].text || 'a checkpoint'),
          async () => { await back(); plans = await S.all('plans'); draw(); });
        draw();
      };
      const x = el('button', 'btn is-ghost t-small', '×');
      x.onclick = async () => {
        const plan = await ensurePlan(q);
        plan.checkpoints.splice(i, 1);
        await S.savePlan(plan); plans = await S.all('plans'); ctx.SFX.del(); draw();
      };
      const row = el('div', 'cprow'); row.append(b, x); cps.append(row);
    });
    const addRow = el('div', 'cprow');
    const ci = el('input', 'field'); ci.placeholder = 'add a checkpoint'; ci.id = 'cp-' + q.rec.id;
    const addB = el('button', 'btn t-small', 'ADD');
    const addCp = async () => {
      if (!ci.value.trim()) return;
      const plan = await ensurePlan(q);
      plan.checkpoints.push({ text: ci.value.trim(), done: false });
      await S.savePlan(plan); plans = await S.all('plans'); ci.value = ''; ctx.SFX.pin(); draw();
    };
    addB.onclick = addCp;
    ci.onkeydown = e => { if (e.key === 'Enter') addCp(); };
    addRow.append(ci, addB);
    cps.append(addRow);
    card.append(cps);

    /* reminders for this quest */
    const rr = el('div', 'qrem');
    rr.append(el('span', 't-small', 'REMIND ME'));
    for (const lt of S.LEAD_TIMES) {
      const has = (p?.reminders || []).some(r => r.lead_time === lt.ms);
      const b = el('button', 'chip t-small' + (has ? ' is-gold' : ' is-ghost'), lt.label);
      b.setAttribute('aria-pressed', String(has));
      b.onclick = async () => {
        const plan = await ensurePlan(q);
        plan.reminders = has
          ? plan.reminders.filter(r => r.lead_time !== lt.ms)
          : [...plan.reminders, { lead_time: lt.ms, channels: ['in-app'], snoozed_until: null }];
        await S.savePlan(plan); plans = await S.all('plans'); ctx.SFX.click(); draw();
      };
      rr.append(b);
    }
    card.append(rr);

    /* recurrence, only when the data really shows it */
    const rec = S.recurrence(q.item, ctx.items);
    if (rec) {
      const r = el('p', 'recur t-small',
        `THIS RAN IN ${rec.month} FOR ${rec.count} YEARS RUNNING (${rec.years.join(', ')}).`);
      r.title = 'Worked out from the dates in the data, not from the title.';
      card.append(r);
    }
    return card;
  }

  /* ================= week load and month grid ================= */
  function weekAndMonth() {
    const box = el('div');
    const events = [];
    for (const q of quests) {
      events.push({ at: q.official, kind: 'official', title: q.item.title, done: q.rec.state === 'DONE' });
      const p = planOf(q.rec.id);
      if (p?.start_by) events.push({ at: p.start_by, kind: 'own', title: 'Start: ' + q.item.title, done: false });
    }
    for (const a of apps) for (const d of a.dates || []) events.push({ at: d.at, kind: 'done', title: `${a.title} ${d.stage}`, done: true });

    const soon = quests.filter(q => { const d = (q.official - today.getTime()) / DAY; return d >= 0 && d <= 7; });
    if (soon.length) {
      const s = el('div', 'expiring');
      s.append(el('h2', 't-title', 'EXPIRING SOON'));
      for (const q of soon) s.append(el('p', 't-body', `${short(q.official)} — ${q.item.title}`));
      box.append(s);
    }

    const counts = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today); d.setDate(d.getDate() + i);
      return { d, n: events.filter(e => !e.done && dayKey(e.at) === dayKey(d)).length };
    });
    const max = Math.max(1, ...counts.map(c => c.n));
    const wk = el('div', 'week'), lab = el('div', 'week-lab t-small');
    counts.forEach((c, i) => {
      const b = el('div', 'bar' + (i === 0 ? ' is-today' : ''));
      b.style.height = `calc(${Math.max(1, Math.round(c.n / max * 44))} * var(--u))`;
      b.title = `${c.n} on ${short(c.d.getTime())}`;
      wk.append(b);
      lab.append(el('span', '', DOW[(c.d.getDay() + 6) % 7]));
    });
    box.append(el('h2', 't-title', 'WEEK LOAD'), wk, lab);

    const cur = new Date(today.getFullYear(), today.getMonth(), 1);
    box.append(el('h2', 't-title', `${MONTHS[cur.getMonth()]} ${cur.getFullYear()}`));
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
      const mine = events.filter(e => dayKey(e.at) === key);
      if (mine.length) {
        const dots = el('div', 'dots');
        for (const e of mine.slice(0, 5)) dots.append(el('i', 'dot ' + e.kind));
        cell.append(dots);
        cell.title = mine.map(e => e.title).join('\n');
      }
      grid.append(cell);
    }
    box.append(grid);
    box.append(Object.assign(el('p', 't-small',
      'PINK = OFFICIAL DEADLINE. CYAN = YOUR START-BY. GREEN = SOMETHING YOU DID.'),
    { style: 'color:var(--muted)' }));
    return box;
  }

  function draw() {
    host.innerHTML = '';
    host.append(reminderPanel());
    if (quests.length) {
      host.append(el('h2', 't-title', 'QUEST LOG'));
      for (const q of quests) host.append(questCard(q));
      host.append(weekAndMonth());
    }
  }

  draw();
  return wrap;
}
