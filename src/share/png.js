/* PNG export, drawn by the browser itself.
 *
 * The obvious way to do this is html2canvas. It is ruled out on purpose: a runtime dependency
 * costs the two guarantees this project is built on — it keeps working offline, and it keeps
 * working in five years. So the picture is made the long way, out of parts the browser already has:
 *
 *   the share's own DOM  ->  an SVG <foreignObject>  ->  an <img>  ->  a <canvas>  ->  a PNG blob
 *
 * Two things make or break that chain, and both are handled here rather than hoped for:
 *
 * 1. **The SVG is a sealed box.** Once it is handed to an <img>, the browser will not fetch
 *    anything for it — no stylesheet, no font, no image. Anything the picture needs has to be
 *    inside the markup already. So the CSS is inlined as text and the fonts are inlined as base64
 *    `@font-face` rules. A missing font does not fail loudly; it silently falls back to monospace
 *    and the export looks like a different app.
 *
 * 2. **A tainted canvas cannot be read.** `toBlob` throws a SecurityError if anything
 *    cross-origin reached the canvas. Base64 fonts and a `data:` URL for the SVG keep the whole
 *    thing same-origin by construction, which is why neither is loaded by URL.
 *
 * Every failure returns `{ok: false, why}` in words a person can act on. A broken export that says
 * nothing is worse than no export.
 */

/* The faces the share view actually asks for. Keep this in step with share.css. */
const FAMILIES = ['VT323', 'Press Start 2P', 'Silkscreen', 'Pixelify Sans'];

/** Latin only. The other subsets triple the size and the share view has no Vietnamese in it. */
const LATIN = /U\+0000-00FF/i;

const b64 = buf => {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};

/** Fetched once per session: four fonts is four requests, and they never change. */
let fontCache = null;

/**
 * Put font CSS in place without going to the network. This exists so the rasterizing half of the
 * chain can be tested without the internet: a test that needs Google to be up is a test that goes
 * red for reasons that have nothing to do with this code.
 */
export const primeFonts = css => { fontCache = { ok: true, css }; };
export const forgetFonts = () => { fontCache = null; };

/**
 * Build `@font-face` rules with the font bytes inlined.
 *
 * `fetchImpl` is narrowed to the three things this actually uses, so a test can hand it a small
 * stub instead of a whole Response — and so the stub cannot quietly stop matching.
 *
 * @param {(url: string) => Promise<{ok: boolean, status: number, text?: () => Promise<string>,
 *   arrayBuffer?: () => Promise<ArrayBuffer>}>} [fetchImpl]
 * @returns {Promise<{ok: boolean, css?: string, why?: string}>}
 */
export async function inlineFonts(fetchImpl = fetch) {
  if (fontCache) return fontCache;
  try {
    const query = FAMILIES.map(f => 'family=' + f.replace(/ /g, '+')).join('&');
    const res = await fetchImpl(`https://fonts.googleapis.com/css2?${query}&display=block`);
    if (!res.ok) throw new Error(`the font stylesheet answered ${res.status}`);
    const sheet = await res.text();

    /* css2 returns one @font-face per subset. Keep the latin ones and drop the rest. */
    const blocks = sheet.split('@font-face').slice(1).map(b => '@font-face' + b.split('}')[0] + '}');
    const wanted = blocks.filter(b => !/unicode-range/.test(b) || LATIN.test(b));

    const out = [];
    for (const block of wanted) {
      const url = block.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
      if (!url) continue;
      const f = await fetchImpl(url);
      if (!f.ok) throw new Error(`a font file answered ${f.status}`);
      const data = `data:font/woff2;base64,${b64(await f.arrayBuffer())}`;
      out.push(block.replace(/src:[^;]+;/, `src: url(${data}) format('woff2');`));
    }
    if (!out.length) throw new Error('no font files were found in the stylesheet');
    fontCache = { ok: true, css: out.join('\n') };
    return fontCache;
  } catch (e) {
    /* Not cached: a failure here is usually being offline, and the next try may well work. */
    return { ok: false, why: `The fonts could not be read (${e.message}), so the picture would come `
      + 'out in the wrong typeface. Try again when you are online, or use the PDF export, which '
      + 'uses the fonts already on the page.' };
  }
}

/** Replace every canvas with a flat image, because a canvas does not survive serialization. */
function flattenCanvases(clone, original) {
  const from = original.querySelectorAll('canvas');
  const to = clone.querySelectorAll('canvas');
  for (let i = 0; i < to.length; i++) {
    const img = document.createElement('img');
    try { img.setAttribute('src', from[i].toDataURL('image/png')); } catch { continue; }
    img.setAttribute('width', String(from[i].width));
    img.setAttribute('height', String(from[i].height));
    to[i].replaceWith(img);
  }
}

/**
 * Copy the node into the thing that will actually be drawn: canvases flattened, and the builder's
 * privacy panel taken out, because that panel is for the person building the share and not for the
 * picture.
 * @returns {HTMLElement}
 */
export function prepareClone(node) {
  const clone = /** @type {HTMLElement} */ (node.cloneNode(true));
  flattenCanvases(clone, node);
  for (const n of clone.querySelectorAll('.sv-privacy')) n.remove();
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  return clone;
}

/**
 * How tall the clone actually is, laid out at the width it will be drawn at.
 *
 * Measuring the original is the obvious thing and it is wrong: the clone is not the original. In
 * the builder the live node includes the privacy panel, which `prepareClone` removes, so the
 * original measures around 40% taller than the picture and the PNG comes out with a band of empty
 * paper along the bottom. Measure the thing being drawn.
 *
 * @returns {number} the height in CSS pixels, or 0 if it could not be measured
 */
export function measureClone(clone, width) {
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    `position:absolute; left:-20000px; top:0; width:${width}px; visibility:hidden; pointer-events:none`;
  probe.append(clone.cloneNode(true));
  document.body.append(probe);
  const h = Math.ceil(probe.getBoundingClientRect().height);
  probe.remove();
  return h;
}

/**
 * Wrap a prepared clone, or a live node, in an SVG that carries everything it needs.
 * @returns {string} the SVG source
 */
export function svgFor(node, { width, height, css = '', fonts = '', background = '', prepared = false }) {
  const clone = prepared ? /** @type {HTMLElement} */ (node) : prepareClone(node);

  const body = new XMLSerializer().serializeToString(clone);
  const style = `${fonts}\n${css}`.replace(/]]>/g, ']]&gt;');

  /* The paper goes in as a rect, not as a CSS background on the wrapper.
     The laid-out share is not always exactly as tall as it measured — a font that wraps text
     differently moves the bottom edge — and a picture with a transparent strip along the bottom
     looks broken everywhere it gets posted. A rect behind everything costs nothing and means the
     exported PNG is opaque whatever the layout does. */
  const paper = background
    ? `<rect x="0" y="0" width="${width}" height="${height}" fill="${background}"/>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" `
    + `viewBox="0 0 ${width} ${height}">`
    + paper
    + `<foreignObject x="0" y="0" width="${width}" height="${height}">`
    + `<div xmlns="http://www.w3.org/1999/xhtml">`
    + `<style>/* <![CDATA[ */ ${style} /* ]]> */</style>`
    + body
    + `</div></foreignObject></svg>`;
}

/**
 * Rasterize an SVG string. Kept separate because this is the step that fails on old browsers,
 * and the caller needs to be able to say so precisely.
 * @returns {Promise<{ok: boolean, blob?: Blob, why?: string}>}
 */
export async function rasterize(svg, { width, height, scale = 2 }) {
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const img = new Image();
  try {
    await new Promise((res, rej) => {
      img.onload = () => res(null);
      img.onerror = () => rej(new Error('the browser refused to draw the picture'));
      img.src = url;
    });
  } catch (e) {
    return { ok: false, why: `${e.message}. This browser may not rasterize embedded HTML. `
      + 'The PDF export works everywhere, and a screenshot always works.' };
  }

  const c = document.createElement('canvas');
  c.width = Math.round(width * scale);
  c.height = Math.round(height * scale);
  const ctx = c.getContext('2d');
  if (!ctx) return { ok: false, why: 'This browser gave no 2D canvas, so no picture can be drawn.' };
  ctx.imageSmoothingEnabled = false;                    // pixel art stays pixels
  ctx.drawImage(img, 0, 0, c.width, c.height);

  try {
    const blob = await new Promise((res, rej) => {
      c.toBlob(b => (b ? res(b) : rej(new Error('the canvas produced nothing'))), 'image/png');
    });
    return { ok: true, blob };
  } catch (e) {
    /* A SecurityError here means something cross-origin got in, which would be a bug in this
       file rather than something the user did. Say that, instead of blaming them. */
    return { ok: false, why: `The picture could not be saved (${e.message}). Something outside this `
      + 'page reached the drawing, which is a bug — please use the PDF export for now.' };
  }
}

/**
 * The whole chain, for the share view.
 * @param {HTMLElement} node the rendered `.sv` share
 * @returns {Promise<{ok: boolean, blob?: Blob, why?: string, width?: number, height?: number}>}
 */
export async function sharePNG(node, { scale = 2, cssUrl = './src/share.css' } = {}) {
  const rect = node.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));

  const fonts = await inlineFonts();
  if (!fonts.ok) return { ok: false, why: fonts.why };

  let css = '';
  try {
    const r = await fetch(cssUrl);
    if (!r.ok) throw new Error(`the stylesheet answered ${r.status}`);
    css = await r.text();
  } catch (e) {
    return { ok: false, why: `The stylesheet could not be read (${e.message}), so the picture would `
      + 'come out unstyled. Use the PDF export instead.' };
  }

  /* Measure after the fonts the PAGE uses have settled, or the height is taken from text that is
     still laid out in a fallback face. */
  try { await document.fonts?.ready; } catch { /* no font API: the measurement stands as taken */ }

  const background = getComputedStyle(node).backgroundColor || '#1A1A2E';
  const clone = prepareClone(node);
  const height = Math.max(1, measureClone(clone, width) || Math.round(node.scrollHeight || rect.height));
  const svg = svgFor(clone, { width, height, css, fonts: fonts.css, background, prepared: true });
  const out = await rasterize(svg, { width, height, scale });
  return out.ok ? { ...out, width, height } : out;
}

/** Hand the file to the browser. Named so the file on disk says what it is. */
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
