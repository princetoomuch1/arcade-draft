/* A QR encoder, written here rather than installed.
 *
 * Byte mode, error level L, versions 1 to 20 — enough for a hosted-file link and for most embedded
 * payloads. Anything longer is refused honestly rather than drawn as an unscannable mess.
 *
 * Zero runtime dependencies is a hard rule in this project: the app has to keep working offline and
 * in five years. A QR encoder is a known, finite algorithm, so it is cheaper to own than to depend on.
 */

/* Total data codewords at error level L, per version (index 1..20). */
const DATA_CODEWORDS_L = [0,
  19, 34, 55, 80, 108, 136, 156, 194, 232, 274,
  324, 370, 428, 461, 523, 589, 647, 721, 795, 861];
/* EC codewords per block, and the block layout, at level L. [ecPerBlock, blocks] */
const EC_L = [null,
  [7, 1], [10, 1], [15, 1], [20, 1], [26, 1], [18, 2], [20, 2], [24, 2], [30, 2], [18, 4],
  [20, 4], [24, 4], [26, 4], [30, 4], [22, 6], [24, 6], [28, 6], [30, 6], [28, 7], [28, 8]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42],
  [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70],
  [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90]];

/* GF(256) tables for Reed-Solomon. */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsGenerator(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= mul(poly[j], EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecLen) {
  const gen = rsGenerator(ecLen);
  const res = new Uint8Array(ecLen);
  for (const byte of data) {
    const factor = byte ^ res[0];
    res.copyWithin(0, 1); res[ecLen - 1] = 0;
    if (factor) for (let i = 0; i < ecLen; i++) res[i] ^= mul(gen[i + 1], factor);
  }
  return res;
}

/** @returns {number|null} the smallest version that fits, or null when it does not fit at all */
export function pickVersion(byteLength) {
  for (let v = 1; v <= 20; v++) {
    const capacityBits = DATA_CODEWORDS_L[v] * 8;
    const lenBits = v < 10 ? 8 : 16;
    if (4 + lenBits + byteLength * 8 <= capacityBits) return v;
  }
  return null;
}

const BITS = { arr: [], push(val, len) { for (let i = len - 1; i >= 0; i--) this.arr.push((val >> i) & 1); } };

function buildCodewords(bytes, version) {
  const b = { arr: [], push: BITS.push };
  b.push(0b0100, 4);                                   // byte mode
  b.push(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) b.push(byte, 8);

  const total = DATA_CODEWORDS_L[version] * 8;
  b.push(0, Math.min(4, total - b.arr.length));        // terminator
  while (b.arr.length % 8) b.arr.push(0);
  const words = [];
  for (let i = 0; i < b.arr.length; i += 8) {
    words.push(b.arr.slice(i, i + 8).reduce((n, bit) => (n << 1) | bit, 0));
  }
  const pads = [0xEC, 0x11];
  for (let i = 0; words.length < DATA_CODEWORDS_L[version]; i++) words.push(pads[i % 2]);

  /* split into blocks, add EC, then interleave */
  const [ecPer, blocks] = EC_L[version];
  const short = Math.floor(words.length / blocks), extra = words.length % blocks;
  const dataBlocks = [], ecBlocks = [];
  let at = 0;
  for (let i = 0; i < blocks; i++) {
    const len = short + (i >= blocks - extra ? 1 : 0);
    const chunk = words.slice(at, at + len); at += len;
    dataBlocks.push(chunk);
    ecBlocks.push(rsEncode(chunk, ecPer));
  }
  const out = [];
  for (let i = 0; i < Math.max(...dataBlocks.map(d => d.length)); i++) {
    for (const d of dataBlocks) if (i < d.length) out.push(d[i]);
  }
  for (let i = 0; i < ecPer; i++) for (const e of ecBlocks) out.push(e[i]);
  return out;
}

function emptyMatrix(size) {
  return { m: Array.from({ length: size }, () => new Array(size).fill(null)), size };
}

function placeFunctionPatterns(g, version) {
  const { m, size } = g;
  const finder = (r, c) => {
    for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {
      const rr = r + i, cc = c + j;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      const on = (i >= 0 && i <= 6 && (j === 0 || j === 6))
        || (j >= 0 && j <= 6 && (i === 0 || i === 6))
        || (i >= 2 && i <= 4 && j >= 2 && j <= 4);
      m[rr][cc] = on ? 1 : 0;
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    const on = i % 2 === 0 ? 1 : 0;
    m[6][i] = on; m[i][6] = on;
  }
  for (const r of ALIGN[version]) for (const c of ALIGN[version]) {
    if (m[r][c] !== null) continue;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      m[r + i][c + j] = (Math.abs(i) === 2 || Math.abs(j) === 2 || (i === 0 && j === 0)) ? 1 : 0;
    }
  }
  m[size - 8][8] = 1;                                   // the always-dark module
  // reserve the format areas
  for (let i = 0; i < 9; i++) {
    if (m[8][i] === null) m[8][i] = 0;
    if (m[i][8] === null) m[i][8] = 0;
  }
  for (let i = 0; i < 8; i++) {
    if (m[8][size - 1 - i] === null) m[8][size - 1 - i] = 0;
    if (m[size - 1 - i][8] === null) m[size - 1 - i][8] = 0;
  }
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1F25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = (bits >> i) & 1;
      m[Math.floor(i / 3)][size - 11 + (i % 3)] = bit;
      m[size - 11 + (i % 3)][Math.floor(i / 3)] = bit;
    }
  }
}

/** Mask 0, which is enough: we draw one code and check it, we do not need the best of eight. */
const MASK0 = (r, c) => (r + c) % 2 === 0;

function placeData(g, codewords) {
  const { m, size } = g;
  let bitIndex = 0;
  const nextBit = () => {
    const byte = codewords[bitIndex >> 3];
    const bit = byte === undefined ? 0 : (byte >> (7 - (bitIndex & 7))) & 1;
    bitIndex++;
    return bit;
  };
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;                          // skip the vertical timing column
    for (let v = 0; v < size; v++) {
      const row = upward ? size - 1 - v : v;
      for (const col of [right, right - 1]) {
        if (m[row][col] !== null) continue;
        m[row][col] = nextBit() ^ (MASK0(row, col) ? 1 : 0);
      }
    }
    upward = !upward;
  }
}

function placeFormat(g) {
  const { m, size } = g;
  /* level L (01), mask 0 (000) -> 0b01000, BCH-corrected and XOR 0x5412 */
  const data = 0b01000;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  for (let i = 0; i <= 5; i++) m[8][i] = (bits >> i) & 1;
  m[8][7] = (bits >> 6) & 1;
  m[8][8] = (bits >> 7) & 1;
  m[7][8] = (bits >> 8) & 1;
  for (let i = 9; i <= 14; i++) m[14 - i][8] = (bits >> i) & 1;
  for (let i = 0; i <= 7; i++) m[size - 1 - i][8] = (bits >> i) & 1;
  for (let i = 8; i <= 14; i++) m[8][size - 15 + i] = (bits >> i) & 1;
  m[size - 8][8] = 1;
}

/**
 * One shape either way: `ok` says whether the rest is there. A union reads better in prose than it
 * does to a type checker, and every caller has to branch on `ok` regardless.
 * @param {string} text
 * @returns {{ok: boolean, why?: string, size?: number, modules?: number[][], version?: number}}
 */
export function encodeQR(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''));
  const version = pickVersion(bytes.length);
  if (!version) {
    return { ok: false, why: `This link is ${bytes.length} characters, past what a QR code can hold. Copy the link instead, or use a hosted share, whose link is short.` };
  }
  const size = version * 4 + 17;
  const g = emptyMatrix(size);
  placeFunctionPatterns(g, version);
  placeData(g, buildCodewords(bytes, version));
  placeFormat(g);
  return { ok: true, size, version, modules: g.m.map(r => r.map(v => (v ? 1 : 0))) };
}

/**
 * Draw to a canvas at whole-pixel scale, so the code stays sharp and scannable.
 * @returns {{ok: boolean, why?: string, canvas?: HTMLCanvasElement, version?: number}}
 */
export function qrCanvas(text, scale = 4, quiet = 4) {
  const r = encodeQR(text);
  if (!r.ok) return { ok: false, why: r.why };
  const px = (r.size + quiet * 2) * scale;
  const c = document.createElement('canvas');
  c.width = px; c.height = px;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#000000';
  for (let y = 0; y < r.size; y++) {
    for (let x = 0; x < r.size; x++) {
      if (r.modules[y][x]) ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
    }
  }
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', 'QR code for the share link');
  return { ok: true, canvas: c, version: r.version };
}
