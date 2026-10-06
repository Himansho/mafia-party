/* Verify icon PNGs decode correctly and sample key pixels. */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('bad signature');
  let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idatChunks = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idatChunks.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 6) throw new Error('expected 8-bit RGBA');
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (1 + w * 4)];
    const rowStart = y * (1 + w * 4) + 1;
    // handle filters 0 (none) — our encoder only writes 0
    if (filter !== 0) throw new Error('unexpected filter ' + filter + ' at row ' + y);
    raw.copy(out, y * w * 4, rowStart, rowStart + w * 4);
  }
  return { w, h, data: out };
}

function pixel(img, x, y) {
  const i = (y * img.w + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

const dir = path.join(__dirname, '..', 'icons');
let ok = 0, fail = 0;
const t = (c, name) => { if (c) { ok++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } };

for (const name of ['icon-192.png', 'icon-512.png', 'maskable-512.png']) {
  const img = decodePNG(fs.readFileSync(path.join(dir, name)));
  const s = img.w;
  console.log(name + ': ' + img.w + 'x' + img.h);
  // corners: background (dark blue-ish)
  const c = pixel(img, 2, 2);
  t(c[3] === 255 && c[0] < 40 && c[2] < 70, 'corner is dark bg');
  // center-ish on the crown (gold): x=256, y≈130 (crown area around y 112-190)
  const gold = pixel(img, Math.floor(s / 2), Math.floor(s * 0.30));
  t(gold[0] > 150 && gold[1] > 110 && gold[2] < 130, 'crown is gold-ish (got ' + gold.join(',') + ')');
  // card area below hat: dark navy
  const card = pixel(img, Math.floor(s / 2), Math.floor(s * 0.85));
  t(card[3] === 255 && card[0] < 40 && card[2] > 30, 'card area is dark navy');
  // M letter: somewhere in the middle-lower; sample a small region and require some gold pixels
  let goldCount = 0;
  for (let y = Math.floor(s * 0.6); y < s * 0.75; y++) {
    for (let x = Math.floor(s * 0.35); x < s * 0.65; x++) {
      const p = pixel(img, x, y);
      if (p[0] > 180 && p[1] > 140 && p[2] < 120) goldCount++;
    }
  }
  t(goldCount > 200, 'letter M present (' + goldCount + ' gold px)');
}
console.log((ok + fail === 0) ? 'no tests' : ok + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
