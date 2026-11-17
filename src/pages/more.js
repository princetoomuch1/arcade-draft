/* MORE — the four pages that do not get a top-level tab. Built in stage 1. */
export const title = 'More';
export const keys = [['1','NOTES'],['2','CAL'],['3','APPS'],['4','OPTS']];

const ITEMS = [
  ['notes', 'NOTES', 'Project notes, images, links between them'],
  ['cal',   'CALENDAR', 'Quest Log, week load, month grid, year wheel'],
  ['apps',  'APPLICATIONS', 'What you applied to, and what happened'],
  ['opts',  'OPTIONS', 'Pixel size, sound, motion, interests, data']
];

export function render(ctx) {
  const wrap = document.createElement('div');
  const h = document.createElement('div'); h.className = 'hdr';
  h.innerHTML = '<h1 class="t-display">MORE</h1>';
  wrap.append(h);

  const list = document.createElement('div');
  list.style.display = 'grid';
  list.style.gap = 'calc(4 * var(--u))';
  list.style.maxWidth = 'calc(160 * var(--u))';

  ITEMS.forEach(([route, label, desc], i) => {
    const b = document.createElement('button');
    b.className = 'bevel corner-1 t-label';
    b.style.display = 'grid';
    b.style.gridTemplateColumns = 'calc(12*var(--u)) 1fr';
    b.style.alignItems = 'center';
    b.style.gap = 'calc(4*var(--u))';
    b.style.padding = 'calc(4*var(--u))';
    b.style.textAlign = 'left';
    b.style.cursor = 'pointer';
    b.style.color = 'var(--text)';
    b.innerHTML = `<span class="t-title" style="color:var(--cyan)">[${i + 1}]</span>
      <span><span class="t-label">${label}</span><br><span class="t-small" style="color:var(--muted)">${desc}</span></span>`;
    b.onmouseenter = () => ctx.SFX.hover();
    b.onclick = () => { ctx.SFX.click(); ctx.go(route); };
    list.append(b);
  });
  wrap.append(list);

  const onKey = e => {
    const n = Number(e.detail.key);
    if (n >= 1 && n <= 4) { ctx.SFX.click(); ctx.go(ITEMS[n - 1][0]); }
  };
  document.addEventListener('arcade:key', onKey);
  // the router replaces #page wholesale, so clean up when this node leaves the document
  new MutationObserver((m, o) => { if (!wrap.isConnected) { document.removeEventListener('arcade:key', onKey); o.disconnect(); } })
    .observe(document.getElementById('page'), { childList: true });

  return wrap;
}
