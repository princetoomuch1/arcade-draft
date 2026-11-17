/* Procedural sprites. UI Spec v2 section 10.3.
   No logos anywhere: the company mark is derived from its name, so the same name always
   draws the same sprite and no trademark is reproduced. */

/** FNV-1a, 32-bit. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const SPRITE_COLOURS = ['#00F0FF', '#FF2E97', '#FFD93D', '#6BCB77', '#FF6B35', '#E8E8F0'];

/**
 * 16x16u from an 8x8 cell grid, each cell 2x2u.
 * 32 bits fill the LEFT 4 columns (32 cells), then mirror to the right. Symmetry is what makes
 * random noise read as a mark rather than as static.
 * @param {string} name company name
 * @param {number} cell device px per cell edge (2 * uDev for the 16x16; 3 * uDev for the 24x24 detail sprite)
 */
export function companySprite(name, cell = 2, bg = '#1A1A2E') {
  const h = fnv1a(String(name || '?').toLowerCase().trim());
  const colour = SPRITE_COLOURS[h % SPRITE_COLOURS.length];
  const c = document.createElement('canvas');
  c.width = 8 * cell; c.height = 8 * cell;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = colour;
  // a second hash gives the 32 bits some variety beyond the first 32 of one word
  const h2 = fnv1a(String(name).toLowerCase().trim() + '\u0001');
  for (let i = 0; i < 32; i++) {
    const bit = i < 16 ? (h >>> i) & 1 : (h2 >>> (i - 16)) & 1;
    if (!bit) continue;
    const col = i % 4, row = (i / 4) | 0;
    g.fillRect(col * cell, row * cell, cell, cell);
    g.fillRect((7 - col) * cell, row * cell, cell, cell);   // mirror
  }
  return c;
}

/** 9x11u teardrop pin (11.1). Colour carries urgency, and the blink carries it too. */
export function pinSvg(colour = 'var(--pink)') {
  return `<svg viewBox="0 0 9 11" aria-hidden="true" shape-rendering="crispEdges">
    <path d="M2 0h5v1h1v1h1v3H8v1H7v1H6v1H5v1H4v1H3V9H2V8H1V7H0V5h1V2h1V1h0z" fill="${colour}"/>
    <rect x="3" y="2" width="3" height="3" fill="#0F0F1B"/>
  </svg>`;
}

/** A ragged top edge for a newspaper clipping: 1 to 2u steps, seeded per item so it never changes. */
export function raggedEdge(seed, widthU, colour = '#EDE0C8') {
  let h = fnv1a(String(seed));
  const steps = [];
  for (let x = 0; x < widthU; x += 2) {
    h = Math.imul(h, 0x01000193) >>> 0;
    steps.push([x, (h & 1) ? 1 : 2]);
  }
  const rects = steps.map(([x, d]) => `<rect x="${x}" y="${2 - d}" width="2" height="${d}" fill="${colour}"/>`).join('');
  return `<svg viewBox="0 0 ${widthU} 2" preserveAspectRatio="none" aria-hidden="true" shape-rendering="crispEdges"
    style="width:100%;height:100%">${rects}</svg>`;
}

/** Ordered 4x4 Bayer dither to a fixed 16-colour palette (13.4), for image thumbnails. */
const BAYER4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
const PALETTE = ['#0F0F1B','#1A1A2E','#24243E','#3D3D5C','#7A7AA6','#9494AA','#E8E8F0','#FFFFFF',
                 '#00F0FF','#FF2E97','#FFD93D','#6BCB77','#FF6B35','#FF3864','#F5F0E1','#5C3A21'];
const RGB = PALETTE.map(h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]);

export function ditherTo16(srcCanvasOrImage, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently:true });
  g.imageSmoothingEnabled = false;
  g.drawImage(srcCanvasOrImage, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const bias = (BAYER4[y & 3][x & 3] / 16 - 0.5) * 48;   // spread the error across the tile
    const r = d[i] + bias, gg = d[i+1] + bias, b = d[i+2] + bias;
    let best = 0, bd = Infinity;
    for (let p = 0; p < RGB.length; p++) {
      const dr = r - RGB[p][0], dg = gg - RGB[p][1], db = b - RGB[p][2];
      const dist = dr*dr + dg*dg + db*db;
      if (dist < bd) { bd = dist; best = p; }
    }
    d[i] = RGB[best][0]; d[i+1] = RGB[best][1]; d[i+2] = RGB[best][2]; d[i+3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
