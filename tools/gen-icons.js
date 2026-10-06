/* Generate PWA icons (PNG) with zero dependencies — hand-rolled PNG encoder.
 * Draws the noir fedora-M logo on a dark card, at 192/512/maskable sizes.
 * Run: node tools/gen-icons.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------- tiny PNG encoder ---------- */
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // raw scanlines with filter byte 0
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- pixel drawing ---------- */
function makeIcon(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const set = function (x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    // alpha blend
    const sa = a / 255, da = px[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa === 0) { px[i] = px[i+1] = px[i+2] = 0; px[i+3] = 0; return; }
    px[i] = Math.round((r * sa + px[i] * da * (1 - sa)) / oa);
    px[i + 1] = Math.round((g * sa + px[i + 1] * da * (1 - sa)) / oa);
    px[i + 2] = Math.round((b * sa + px[i + 2] * da * (1 - sa)) / oa);
    px[i + 3] = Math.round(oa * 255);
  };
  const s = size / 512; // scale factor relative to 512 design

  // background: dark radial card
  const bg = [11, 14, 23];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - size / 2) / (size / 2), dy = (y - size / 2) / (size / 2);
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      const v = 1 - d * 0.55; // subtle vignette lighten toward center
      set(x, y, Math.round(bg[0] * v + 18 * (1 - v)), Math.round(bg[1] * v + 26 * (1 - v)), Math.round(bg[2] * v + 48 * (1 - v)), 255);
    }
  }

  // gold gradient stops
  const gold1 = [245, 214, 123];
  const gold2 = [201, 153, 46];

  function fillCircle(cx, cy, r, color, alpha) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++)
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) set(x, y, color[0], color[1], color[2], alpha == null ? 255 : alpha);
  }

  function fillRect(x0, y0, w, h, color, alpha) {
    for (let y = Math.floor(y0); y < y0 + h; y++)
      for (let x = Math.floor(x0); x < x0 + w; x++)
        set(x, y, color[0], color[1], color[2], alpha == null ? 255 : alpha);
  }

  // === card (rounded rect) ===
  const cx = size / 2;
  const cardW = 200 * s, cardH = 240 * s;
  const cardX = cx - cardW / 2, cardY = 240 * s;
  const rad = 28 * s;
  const cardCol = [19, 24, 40];
  const cardEdge = [58, 71, 99];
  for (let y = Math.floor(cardY); y < cardY + cardH; y++) {
    for (let x = Math.floor(cardX); x < cardX + cardW; x++) {
      // rounded corner check
      const inX = Math.min(x - cardX, cardX + cardW - x);
      const inY = Math.min(y - cardY, cardY + cardH - y);
      if (inX < rad && inY < rad) {
        const cxd = inX < rad ? cardX + rad : cardX + cardW - rad;
        const cyd = inY < rad ? cardY + rad : cardY + cardH - rad;
        const cornerD = Math.sqrt((x - cxd) * (x - cxd) + (y - cyd) * (y - cyd));
        if (cornerD > rad) continue;
        if (cornerD > rad - 2 * s) set(x, y, cardEdge[0], cardEdge[1], cardEdge[2], 255);
        else set(x, y, cardCol[0], cardCol[1], cardCol[2], 255);
      } else if (inX < 2 * s || inY < 2 * s) {
        set(x, y, cardEdge[0], cardEdge[1], cardEdge[2], 255);
      } else {
        set(x, y, cardCol[0], cardCol[1], cardCol[2], 255);
      }
    }
  }

  // === fedora hat ===
  // brim: ellipse centered above card center
  const brimCY = 190 * s;
  const brimRX = 118 * s, brimRY = 26 * s;
  for (let y = Math.floor(brimCY - brimRY); y <= brimCY + brimRY; y++) {
    for (let x = Math.floor(cx - brimRX); x <= cx + brimRX; x++) {
      const nx = (x - cx) / brimRX, ny = (y - brimCY) / brimRY;
      const d = nx * nx + ny * ny;
      if (d <= 1) {
        const t = Math.min(1, (y - (brimCY - brimRY)) / (2 * brimRY));
        const col = [gold1[0] * (1 - t) + gold2[0] * t, gold1[1] * (1 - t) + gold2[1] * t, gold1[2] * (1 - t) + gold2[2] * t];
        set(x, y, Math.round(col[0]), Math.round(col[1]), Math.round(col[2]), 255);
      }
    }
  }
  // crown: rounded top hat shape
  const crownW = 84 * s, crownH = 78 * s;
  const crownX = cx - crownW / 2, crownY = brimCY - crownH + 10 * s;
  for (let y = Math.floor(crownY); y < brimCY + 6 * s; y++) {
    for (let x = Math.floor(crownX); x < crownX + crownW; x++) {
      const t = Math.min(1, (y - crownY) / crownH);
      const col = [gold1[0] * (1 - t) + gold2[0] * t, gold1[1] * (1 - t) + gold2[1] * t, gold1[2] * (1 - t) + gold2[2] * t];
      set(x, y, Math.round(col[0]), Math.round(col[1]), Math.round(col[2]), 255);
    }
  }
  // crown band (darker strip)
  fillRect(crownX, brimCY - 18 * s, crownW, 10 * s, [90, 62, 15], 255);

  // === letter M on card ===
  // simple 5x7 bitmap M
  const M = [
    '10001',
    '11011',
    '10101',
    '10101',
    '10001',
    '10001',
    '10001'
  ];
  const cell = 21 * s;
  const mx = cx - (5 * cell) / 2, my = cardY + 62 * s;
  for (let r = 0; r < M.length; r++) {
    for (let c = 0; c < M[r].length; c++) {
      if (M[r][c] === '1') {
        fillRect(mx + c * cell, my + r * cell, Math.ceil(cell), Math.ceil(cell), [232, 192, 90], 255);
      }
    }
  }

  return encodePNG(size, size, px);
}

/* ---------- run ---------- */
const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
const sizes = [
  [192, 'icon-192.png', false],
  [512, 'icon-512.png', false],
  [512, 'maskable-512.png', true]
];
for (const [size, name, maskable] of sizes) {
  const png = makeIcon(size, maskable);
  fs.writeFileSync(path.join(outDir, name), png);
  console.log('wrote icons/' + name + ' (' + png.length + ' bytes)');
}
