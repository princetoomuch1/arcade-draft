/* The freshness receipt. One component, used on every page that shows a scraped row.
 *
 * It answers three different questions that are easy to confuse:
 *   REPORTED       when the source said it appeared
 *   LAST CHECKED   when a scrape last confirmed the row is still up
 *   LAST CHANGED   when something that matters about it last moved
 * A row checked an hour ago but unchanged for a month is not the same as a fresh row, and the
 * receipt says which it is. Nothing here is estimated: a date the source never gave reads NEVER.
 */

import { receipt as dates, expiresAt } from './model.js';

const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
const HOUR = 36e5, DAY = 864e5;

/** Plain-language age. Exported because the tests check the wording, not just the markup. */
export function ago(ts, now = Date.now()) {
  if (ts == null) return 'NEVER';
  const d = now - ts;
  if (d < 0) return 'IN THE FUTURE';
  if (d < HOUR) return 'WITHIN THE HOUR';
  if (d < DAY) return `${Math.round(d / HOUR)}H AGO`;
  const days = Math.round(d / DAY);
  return days === 1 ? 'YESTERDAY' : `${days}D AGO`;
}

/** green under a day, amber under a week, red beyond: how much to trust what is on screen. */
export function freshness(item, now = Date.now()) {
  const d = dates(item);
  if (d.checked == null) return { level: 'unknown', label: 'NEVER CHECKED' };
  const age = now - d.checked;
  if (age < DAY) return { level: 'fresh', label: 'CHECKED TODAY' };
  if (age < 7 * DAY) return { level: 'aging', label: `CHECKED ${ago(d.checked, now)}` };
  return { level: 'stale', label: `NOT CHECKED SINCE ${ago(d.checked, now)}` };
}

/**
 * @param {object} item a scraped row
 * @param {{onReport?: (reason: string, note: string) => Promise<void>|void, compact?: boolean}} [opts]
 */
export function receiptNode(item, opts = {}) {
  const now = Date.now();
  const d = dates(item);
  const f = freshness(item, now);

  const box = el('div', 'receipt');
  const dot = el('span', `rdot r-${f.level}`);
  dot.title = f.label;
  box.append(dot, el('span', 'rlab t-small', f.label));

  if (!opts.compact) {
    const rows = [
      ['REPORTED', ago(d.reported, now)],
      ['LAST CHECKED', ago(d.checked, now)],
      ['LAST CHANGED', d.changed === d.checked && d.changed != null ? 'NOT SINCE IT WAS FOUND' : ago(d.changed, now)],
      ['SOURCE', String(item.source?.name || item.source || 'UNKNOWN').toUpperCase()]
    ];
    const exp = expiresAt(item);
    const left = Math.ceil((exp - now) / DAY);
    rows.push(['EXPIRES', exp === Infinity ? 'NO DATE GIVEN'
      : exp < now ? 'ALREADY PASSED'
        : left <= 1 ? 'TOMORROW OR SOONER' : `IN ${left} DAYS`]);

    const list = el('div', 'rrows');
    for (const [k, v] of rows) {
      const r = el('div', 'rrow');
      r.append(el('span', 'rk t-small', k), el('span', 'rv t-small', v));
      list.append(r);
    }
    box.append(list);
  }

  if (opts.onReport) {
    const btn = el('button', 'btn is-ghost t-small', 'REPORT OUTDATED');
    btn.onclick = () => {
      if (box.querySelector('.rform')) return;
      const f2 = el('div', 'rform');
      const sel = el('select', 'field t-small');
      sel.id = 'rr-' + item.id;
      for (const r of ['DEADLINE HAS PASSED', 'DEAD LINK', 'DETAILS ARE WRONG', 'DUPLICATE MISSED', 'NO LONGER LISTED']) {
        sel.append(new Option(r, r));
      }
      const note = el('input', 'field t-small');
      note.placeholder = 'optional note'; note.id = 'rn-' + item.id;
      const send = el('button', 'btn t-small', 'SAVE IT');
      send.onclick = async () => {
        await opts.onReport(sel.value, note.value);
        f2.remove();
        btn.textContent = 'REPORTED';
      };
      const no = el('button', 'btn is-ghost t-small', 'CANCEL');
      no.onclick = () => f2.remove();
      f2.append(sel, note, send, no);
      box.append(f2);
    };
    box.append(btn);
  }
  return box;
}
