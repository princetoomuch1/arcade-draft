/* VIEWER and PRESENT.
 *
 * Two read-only ways to look at your own room: the viewer, for checking how it reads to a stranger,
 * and present mode, for a call. Both are the real pages with the editing taken away, not copies —
 * a mock-up would drift from the thing it imitates.
 *
 * Both hide the same private things a share does: applications are never shown, and the timer is
 * off because nothing here should be measuring you while someone watches.
 */

const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };

/* The order present mode walks: the room, then the Computer's pages, then back to the wall. */
export const TOUR = ['desk', 'feed', 'jobs', 'hacks', 'news', 'notes', 'cal', 'wall'];

/** Strip everything that writes, from a rendered page. Leaves links, which only read. */
export function makeReadOnly(root) {
  let removed = 0;
  for (const node of root.querySelectorAll('button, input, select, textarea')) {
    // a link rendered as a button is still navigation, not editing
    if (node.tagName === 'BUTTON' && /^(OPEN|READ|VIEW|SHOW ORIGINAL)$/i.test(node.textContent.trim())) continue;
    node.remove(); removed++;
  }
  for (const node of root.querySelectorAll('[contenteditable]')) node.removeAttribute('contenteditable');
  return removed;
}

/** Applications are private. In these modes the page is not even loaded. */
export const HIDDEN_IN_VIEWER = ['apps', 'opts', 'share', 'shares'];

/* Each mount claims the mode with a token. Going straight from the viewer into present mode mounts
   the new instance first and unmounts the old one second, so without a claim the old instance's
   teardown deletes the mode the new one just set — and present mode keeps the app chrome on screen. */
let serial = 0;

export function render(ctx, params = {}) {
  const mode = params.mode === 'present' ? 'present' : 'viewer';
  const token = String(++serial);
  const wrap = el('div');
  document.documentElement.dataset.mode = mode;
  document.documentElement.dataset.modeToken = token;

  /** Give the mode back only if it is still ours. */
  const release = () => {
    if (document.documentElement.dataset.modeToken !== token) return false;
    delete document.documentElement.dataset.mode;
    delete document.documentElement.dataset.modeToken;
    return true;
  };

  let at = 0;
  const host = el('div');
  const label = el('p', 'sb-note t-small');
  wrap.append(label, host);

  async function show(i) {
    at = (i + TOUR.length) % TOUR.length;
    const name = TOUR[at];
    host.innerHTML = '';
    label.textContent = mode === 'present'
      ? `${name.toUpperCase()} — ${at + 1} OF ${TOUR.length} · ARROWS TO MOVE · ESC TO LEAVE`
      : `${name.toUpperCase()} — READ ONLY. NOTHING HERE CAN BE CHANGED.`;
    try {
      const mod = await import(`./${name}.js`).catch(() => import(`../${name}.js`));
      const node = await mod.render(ctx, {});
      makeReadOnly(node);
      host.append(node);
    } catch (e) {
      host.append(el('p', 'empty t-body', `This page could not be opened read-only: ${e.message}`));
    }
  }

  const exit = el('button', mode === 'present' ? 'pr-exit t-small' : 'vw-pill t-small',
    mode === 'present' ? 'EXIT (ESC)' : 'EXIT VIEWER');
  exit.onclick = () => leave();
  wrap.append(exit);

  if (mode === 'present') {
    const mark = el('div', 'pr-mark t-small', 'PRESENTING');
    const nav = el('div', 'pr-nav');
    const back = el('button', 'btn t-small', '◀');
    back.setAttribute('aria-label', 'Previous');
    back.onclick = () => show(at - 1);
    const fwd = el('button', 'btn t-small', '▶');
    fwd.setAttribute('aria-label', 'Next');
    fwd.onclick = () => show(at + 1);
    const hideMark = el('button', 'btn is-ghost t-small', 'HIDE WATERMARK');
    hideMark.onclick = () => { mark.hidden = !mark.hidden; };
    nav.append(back, fwd, hideMark);
    wrap.append(nav, mark);
  }

  function leave() {
    release();
    document.removeEventListener('arcade:key', onKey);
    ctx.SFX.back();
    ctx.go('desk');
  }

  const onKey = e => {
    const k = e.detail.key;
    if (mode === 'present' && (k === 'arrowright' || k === 'arrowleft')) {
      e.detail.raw?.preventDefault();
      show(at + (k === 'arrowright' ? 1 : -1));
    }
  };
  document.addEventListener('arcade:key', onKey);
  new MutationObserver((m, o) => {
    if (!wrap.isConnected) {
      release();
      document.removeEventListener('arcade:key', onKey);
      o.disconnect();
    }
  }).observe(document.getElementById('page'), { childList: true });

  show(0);
  return wrap;
}
