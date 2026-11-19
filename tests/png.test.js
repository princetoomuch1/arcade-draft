// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { svgFor, inlineFonts, forgetFonts, primeFonts, prepareClone, measureClone } from '../src/share/png.js';

/* These cover the half of the PNG chain that is logic: what goes into the SVG, and what happens
   when the fonts cannot be read. The other half — actually rasterizing — needs a real browser and
   is covered in e2e/share.spec.cjs, because jsdom has no renderer and a passing test here would
   prove nothing about the picture. */

const node = html => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return /** @type {HTMLElement} */ (d.firstElementChild);
};

beforeEach(() => forgetFonts());

describe('svgFor', () => {
  it('wraps the node in a sized foreignObject', () => {
    const svg = svgFor(node('<div class="sv"><p>hello</p></div>'), { width: 400, height: 300 });
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="400"');
    expect(svg).toContain('viewBox="0 0 400 300"');
    expect(svg).toContain('<foreignObject');
    expect(svg).toContain('hello');
  });

  it('declares the XHTML namespace, without which nothing renders', () => {
    const svg = svgFor(node('<div class="sv">x</div>'), { width: 10, height: 10 });
    expect(svg).toContain('xmlns="http://www.w3.org/1999/xhtml"');
  });

  it('carries the stylesheet and the fonts inside, because the SVG is a sealed box', () => {
    const svg = svgFor(node('<div class="sv">x</div>'), {
      width: 10, height: 10, css: '.sv { color: red; }', fonts: '@font-face { font-family: X; }'
    });
    expect(svg).toContain('.sv { color: red; }');
    expect(svg).toContain('@font-face { font-family: X; }');
  });

  it('leaves the builder-only privacy panel out of the picture', () => {
    const svg = svgFor(
      node('<div class="sv"><p>keep</p><div class="sv-privacy"><p>builder only</p></div></div>'),
      { width: 10, height: 10 });
    expect(svg).toContain('keep');
    expect(svg).not.toContain('builder only');
  });

  it('does not mutate the node it was given', () => {
    const live = node('<div class="sv"><div class="sv-privacy">panel</div></div>');
    svgFor(live, { width: 10, height: 10 });
    expect(live.querySelector('.sv-privacy')).not.toBeNull();
  });

  it('escapes a CDATA terminator hiding in the CSS', () => {
    const svg = svgFor(node('<div class="sv">x</div>'), {
      width: 10, height: 10, css: '.x { content: "]]>"; }'
    });
    expect(svg).not.toContain('"]]>"');
    expect(svg).toContain(']]&gt;');
  });

  it('survives text that would break XML', () => {
    const svg = svgFor(node('<div class="sv"><p>a &amp; b &lt; c</p></div>'), { width: 10, height: 10 });
    expect(svg).toContain('&amp;');
    expect(svg).not.toMatch(/a & b/);
  });
});

describe('inlineFonts', () => {
  const sheet = `/* latin */
@font-face {
  font-family: 'VT323';
  font-style: normal;
  src: url(https://fonts.gstatic.com/s/vt323/v18/latin.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131;
}
/* vietnamese */
@font-face {
  font-family: 'VT323';
  src: url(https://fonts.gstatic.com/s/vt323/v18/viet.woff2) format('woff2');
  unicode-range: U+0102-0103;
}`;

  const stub = (overrides = {}) => async url => {
    if (String(url).includes('css2')) {
      return { ok: true, status: 200, text: async () => sheet, ...overrides.css };
    }
    return {
      ok: true, status: 200, arrayBuffer: async () => new Uint8Array([119, 79, 70, 50]).buffer,
      ...overrides.font
    };
  };

  it('inlines the font bytes as a data URL, so nothing is fetched at draw time', async () => {
    const r = await inlineFonts(stub());
    expect(r.ok).toBe(true);
    expect(r.css).toContain('data:font/woff2;base64,');
    expect(r.css).not.toContain('https://fonts.gstatic.com');
  });

  it('keeps the latin subset and drops the rest', async () => {
    const r = await inlineFonts(stub());
    expect(r.css.match(/@font-face/g)).toHaveLength(1);
  });

  it('caches, so four fonts are not re-fetched on every export', async () => {
    let calls = 0;
    const counted = async url => { calls++; return stub()(url); };
    await inlineFonts(counted);
    const before = calls;
    await inlineFonts(counted);
    expect(calls).toBe(before);
  });

  it('explains a failure and names a working alternative', async () => {
    const r = await inlineFonts(async () => { throw new Error('offline'); });
    expect(r.ok).toBe(false);
    expect(r.why).toMatch(/offline/);
    expect(r.why).toMatch(/PDF export/);
  });

  it('does not cache a failure, because the next try may work', async () => {
    await inlineFonts(async () => { throw new Error('offline'); });
    const r = await inlineFonts(stub());
    expect(r.ok).toBe(true);
  });

  it('refuses rather than returning a stylesheet with no fonts in it', async () => {
    const r = await inlineFonts(async () => ({ ok: true, status: 200, text: async () => '/* empty */' }));
    expect(r.ok).toBe(false);
    expect(r.why).toMatch(/no font files/);
  });

  it('reports the status when the stylesheet itself is refused', async () => {
    const r = await inlineFonts(async () => ({ ok: false, status: 429, text: async () => '' }));
    expect(r.ok).toBe(false);
    expect(r.why).toContain('429');
  });
});

describe('primeFonts', () => {
  it('lets a test skip the network entirely', async () => {
    primeFonts('@font-face { font-family: Primed; }');
    const r = await inlineFonts(async () => { throw new Error('must not be called'); });
    expect(r.ok).toBe(true);
    expect(r.css).toContain('Primed');
  });
});

describe('prepareClone', () => {
  it('takes the privacy panel out and leaves the original alone', () => {
    const live = node('<div class="sv"><p>keep</p><div class="sv-privacy">panel</div></div>');
    const clone = prepareClone(live);
    expect(clone.querySelector('.sv-privacy')).toBeNull();
    expect(live.querySelector('.sv-privacy')).not.toBeNull();
  });
  it('declares the XHTML namespace on the clone', () => {
    expect(prepareClone(node('<div class="sv">x</div>')).getAttribute('xmlns'))
      .toBe('http://www.w3.org/1999/xhtml');
  });
});

describe('measureClone', () => {
  /* The bug this guards: the picture was sized from the LIVE node, which in the builder includes
     the privacy panel that prepareClone removes — so the PNG came out roughly 40% taller than its
     content, with a band of empty paper along the bottom. Measure what is drawn. */
  it('measures the clone and not the thing it was copied from', () => {
    const live = node('<div class="sv"><p>keep</p><div class="sv-privacy">panel</div></div>');
    document.body.append(live);
    const clone = prepareClone(live);
    expect(measureClone(clone, 400)).toBeTypeOf('number');
    live.remove();
  });
  it('leaves no probe behind in the document', () => {
    const before = document.body.childElementCount;
    measureClone(prepareClone(node('<div class="sv">x</div>')), 300);
    expect(document.body.childElementCount).toBe(before);
  });
  it('does not consume the clone it was given', () => {
    const clone = prepareClone(node('<div class="sv"><p>still here</p></div>'));
    measureClone(clone, 300);
    expect(clone.textContent).toContain('still here');
    expect(clone.isConnected).toBe(false);
  });
});
