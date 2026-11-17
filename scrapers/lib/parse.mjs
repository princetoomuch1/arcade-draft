/* Two readers, both for formats publishers offer on purpose: RSS/Atom, and JSON.
 *
 * There is deliberately no HTML scraper here. Reading a page's markup breaks constantly, strains
 * the site, and is the part most likely to fall foul of terms of use. If a source offers no feed
 * and no API, that is worth knowing before writing anything against it.
 */

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : null;
};
const attr = (xml, name, a) => {
  const m = xml.match(new RegExp(`<${name}[^>]*\\b${a}=["']([^"']+)["']`, 'i'));
  return m ? decode(m[1]) : null;
};
function decode(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .trim();
}

/** RSS 2.0 and Atom, which cover nearly every feed in the wild. */
export function parseFeed(xml) {
  const text = String(xml || '');
  const blocks = [...text.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(m => m[0]);
  return blocks.map(b => ({
    title: tag(b, 'title'),
    url: tag(b, 'link') || attr(b, 'link', 'href'),
    summary: tag(b, 'description') || tag(b, 'summary') || tag(b, 'content'),
    firstSeen: tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated'),
    org: tag(b, 'author') || tag(b, 'dc:creator')
  })).filter(r => r.title && r.url);
}

/** Pull rows out of a JSON endpoint using the source's own `map`. */
export function parseJson(body, map = {}) {
  let data;
  try { data = typeof body === 'string' ? JSON.parse(body) : body; }
  catch { return []; }

  const rows = map.rows
    ? map.rows.split('.').reduce((o, k) => (o == null ? o : o[k]), data)
    : (Array.isArray(data) ? data : data.items || data.results || data.data);
  if (!Array.isArray(rows)) return [];

  const pick = (row, key) => {
    const path = map[key];
    if (!path) return undefined;
    return String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), row);
  };

  return rows.map(row => {
    const out = {};
    for (const k of ['title', 'url', 'org', 'summary', 'deadline', 'startDate', 'endDate',
      'city', 'state', 'country', 'mode', 'skills']) {
      const v = pick(row, k);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }).filter(r => r.title && r.url);
}
