/* Outbound links, and the refusal to draw a dead one.
 *
 * A link that goes nowhere is worse than no link: it costs a click, a new tab and a moment of
 * doubt about whether the whole app is real. The seed rows in `data/*.json` point at `seed.local`,
 * which does not resolve, so every "READ" on the News page opened a browser error page.
 *
 * So there is one rule, in one place: a URL is either usable, and gets a real anchor, or it is
 * not, and the card says SOURCE UNAVAILABLE and is not clickable at all.
 */

/* Hosts that are reserved, or reserved by convention, for things that are not real sites.
   RFC 2606 and RFC 6761 name most of these; `.local` is mDNS. */
const FAKE_TLD = /\.(local|test|invalid|localhost|example)$/i;
const FAKE_HOST = /^(example\.(com|net|org)|localhost)$/i;

/**
 * Is this a URL we can honestly send somebody to?
 * @param {string|null|undefined} url
 */
export function usableUrl(url) {
  if (!url || typeof url !== 'string') return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (!u.hostname || u.hostname === 'undefined') return false;
  if (FAKE_TLD.test(u.hostname) || FAKE_HOST.test(u.hostname)) return false;
  return true;
}

const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };

/**
 * An anchor when the URL is real, otherwise a plain span plus a tag saying so.
 *
 * @param {string} label what the link says
 * @param {string|null|undefined} url
 * @param {{cls?: string, tagCls?: string, onOpen?: () => void, tag?: boolean}} [opts]
 * @returns {HTMLElement}
 */
export function outLink(label, url, { cls = '', tagCls = 'tag t-small', onOpen, tag = false } = {}) {
  if (usableUrl(url)) {
    const a = el('a', cls, label);
    a.href = /** @type {string} */ (url);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    if (onOpen) a.addEventListener('click', onOpen);
    return a;
  }
  /* Not a link, and not styled like one.
     The tag is opt-in. The first version put SOURCE UNAVAILABLE beside every link on every card,
     and a page of clippings turned into a page of warnings — louder than the news itself. The
     action that a person would actually click asks for the tag; the incidental mentions of a
     host just go quiet, with the reason on hover. */
  const wrap = el('span', (cls + ' is-dead').trim());
  wrap.append(el('span', '', label));
  if (tag) wrap.append(' ', el('span', tagCls, 'SOURCE UNAVAILABLE'));
  wrap.title = 'This row has no working link. Seed rows are fictional and point nowhere.';
  wrap.setAttribute('data-unavailable', 'true');
  return wrap;
}

/** Open a URL in a new tab, if it is one worth opening. Returns whether it did. */
export function openUrl(url) {
  if (!usableUrl(url)) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
